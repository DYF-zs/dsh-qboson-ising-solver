from __future__ import annotations

import argparse
import json
import logging
import math
import os
from pathlib import Path
import sys
import time
import traceback
import uuid
from typing import Any
sys.path.insert(0, str(Path(__file__).resolve().parent))
from license_dialog import ensure_authorized, license_available, license_path

_LOGGER = logging.getLogger("qboson_ising_worker")


def _open_protocol_stdout():
    """Keep a dedicated copy of the worker protocol stream.

    Kaiwu and its dependencies may write informational output to stdout. The
    worker protocol is NDJSON on stdout, so protocol messages use a duplicated
    handle while ordinary process stdout is redirected away from the protocol.
    """
    try:
        protocol_fd = os.dup(sys.stdout.fileno())
        return os.fdopen(protocol_fd, "w", encoding="utf-8", buffering=1, closefd=True)
    except Exception:
        return sys.stdout


_PROTOCOL_STDOUT = _open_protocol_stdout()


def _isolate_protocol_stdout() -> None:
    """Route non-protocol stdout to stderr without touching protocol output."""
    try:
        sys.stdout.flush()
        sys.stderr.flush()
        os.dup2(sys.stderr.fileno(), sys.stdout.fileno())
    except Exception:
        pass
    sys.stdout = sys.stderr


class WorkerError(Exception):
    def __init__(self, code: str, message: str, details: Any | None = None):
        super().__init__(message)
        self.code = code
        self.details = details


def _error_payload(exc: BaseException) -> dict[str, Any]:
    if isinstance(exc, WorkerError):
        payload: dict[str, Any] = {"code": exc.code, "message": str(exc)}
        if exc.details is not None:
            payload["details"] = exc.details
        return payload
    return {"code": "SOLVER_ERROR", "message": str(exc) or exc.__class__.__name__}


def _write_json(payload: dict[str, Any]) -> None:
    _PROTOCOL_STDOUT.write(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n")
    _PROTOCOL_STDOUT.flush()


def _configure_logging() -> None:
    level_name = os.getenv("ISING_DSH_LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)
    log_path = Path(os.path.expanduser(os.getenv(
        "ISING_DSH_LOG_PATH",
        "~/.qboson-ising-dsh/logs/worker.log",
    )))
    log_path.parent.mkdir(parents=True, exist_ok=True)
    handler = logging.FileHandler(log_path, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    _LOGGER.setLevel(level)
    _LOGGER.addHandler(handler)
    _LOGGER.propagate = False


def _require_python_310() -> None:
    if sys.version_info.major != 3 or sys.version_info.minor != 10:
        raise WorkerError(
            "PYTHON_VERSION_INCOMPATIBLE",
            f"Kaiwu SDK requires Python 3.10; current interpreter is {sys.version.split()[0]}",
        )


def _validate_matrix(value: Any):
    try:
        import numpy as np
    except Exception as exc:  # pragma: no cover - environment-dependent
        raise WorkerError("NUMPY_NOT_FOUND", "NumPy is unavailable in the Kaiwu Python environment") from exc

    if not isinstance(value, list) or not value:
        raise WorkerError("INVALID_MATRIX", "ising_matrix must be a non-empty 2D array")
    n = len(value)
    for i, row in enumerate(value):
        if not isinstance(row, list):
            raise WorkerError("INVALID_MATRIX", f"ising_matrix row {i} must be an array")
        if len(row) != n:
            raise WorkerError(
                "INVALID_MATRIX",
                f"ising_matrix must be square: row {i} has {len(row)} values, expected {n}",
            )
        for j, item in enumerate(row):
            if isinstance(item, bool) or not isinstance(item, (int, float)) or not math.isfinite(float(item)):
                raise WorkerError("INVALID_MATRIX", f"ising_matrix[{i}][{j}] must be a finite number")

    matrix = np.asarray(value, dtype=float)
    if matrix.ndim != 2 or matrix.shape != (n, n) or not np.isfinite(matrix).all():
        raise WorkerError("INVALID_MATRIX", "ising_matrix could not be represented as a finite N×N numeric matrix")
    return matrix


def _normalize_solver_result(solutions: Any, hamiltonians: Any, dimension: int) -> list[dict[str, Any]]:
    try:
        import numpy as np
    except Exception as exc:  # pragma: no cover
        raise WorkerError("NUMPY_NOT_FOUND", "NumPy is unavailable in the Kaiwu Python environment") from exc

    if solutions is None:
        raise WorkerError("SOLVER_RESULT_ERROR", "CIMOptimizer returned no solutions")

    solution_array = np.asarray(solutions)
    if solution_array.ndim == 1:
        solution_array = solution_array.reshape(1, -1)
    if solution_array.ndim != 2 or solution_array.shape[1] != dimension:
        raise WorkerError(
            "SOLVER_RESULT_ERROR",
            f"solution shape {tuple(solution_array.shape)} does not match matrix dimension {dimension}",
        )

    hamiltonian_array = np.asarray(hamiltonians).reshape(-1)
    if len(hamiltonian_array) != len(solution_array):
        raise WorkerError(
            "SOLVER_RESULT_ERROR",
            f"solution/Hamiltonian count mismatch: {len(solution_array)} vs {len(hamiltonian_array)}",
        )

    normalized: list[dict[str, Any]] = []
    for index, (spins_raw, h_raw) in enumerate(zip(solution_array, hamiltonian_array)):
        spins = [int(v) for v in spins_raw.tolist()]
        if len(spins) != dimension or any(v not in (-1, 1) for v in spins):
            raise WorkerError("SOLVER_RESULT_ERROR", f"solution {index} is not a complete {{-1,+1}} spin vector")
        hamiltonian = float(h_raw)
        if not math.isfinite(hamiltonian):
            raise WorkerError("SOLVER_RESULT_ERROR", f"solution {index} has a non-finite Hamiltonian")
        normalized.append({"spins": spins, "hamiltonian": hamiltonian})

    normalized.sort(key=lambda item: item["hamiltonian"])
    return normalized


def _authorize_kaiwu(kw, configure: bool = False) -> None:
    try:
        authorized = ensure_authorized(kw, force=configure)
    except Exception as exc:
        raise WorkerError("LICENSE_ERROR", "无法打开玻色量子授权窗口，请检查图形界面是否可用。") from exc
    if not authorized:
        raise WorkerError("LICENSE_CONFIG_MISSING", "玻色量子授权已取消。")


def _prepare_runtime(configure_license: bool = False) -> dict[str, Any]:
    _require_python_310()
    import kaiwu as kw
    from importlib.metadata import version
    _authorize_kaiwu(kw, configure=configure_license)
    return {
        "python_executable": sys.executable,
        "python_version": sys.version.split()[0],
        "kaiwu_version": version("kaiwu"),
    }


class KaiwuRuntime:
    def __init__(self) -> None:
        _require_python_310()
        try:
            import kaiwu as kw
            from kaiwu.cim import CIMOptimizer, TaskMode
        except ModuleNotFoundError as exc:
            raise WorkerError(
                "KAIWU_SDK_NOT_FOUND",
                "Kaiwu SDK is not installed in the Python 3.10 runtime",
            ) from exc
        except Exception as exc:
            raise WorkerError("KAIWU_IMPORT_ERROR", f"failed to import Kaiwu SDK: {exc}") from exc

        self.kw = kw
        self.CIMOptimizer = CIMOptimizer
        self.TaskMode = TaskMode

        _authorize_kaiwu(kw)

        checkpoint_dir = Path(os.path.expanduser(os.getenv(
            "KAIWU_CHECKPOINT_DIR",
            "~/.qboson-ising-dsh/checkpoints",
        )))
        try:
            checkpoint_dir.mkdir(parents=True, exist_ok=True)
            kw.common.CheckpointManager.save_dir = str(checkpoint_dir)
        except Exception as exc:
            raise WorkerError("CHECKPOINT_ERROR", f"failed to configure checkpoint directory: {exc}") from exc

        try:
            self.interval = int(os.getenv("KAIWU_CIM_INTERVAL_MINUTES", "1"))
            if self.interval < 1:
                raise ValueError
        except ValueError as exc:
            raise WorkerError("INVALID_CONFIG", "KAIWU_CIM_INTERVAL_MINUTES must be an integer >= 1") from exc

        self.project_no = os.getenv("KAIWU_PROJECT_NO") or None
        self.task_name_prefix = os.getenv("KAIWU_TASK_NAME_PREFIX", "ising_dsh").strip() or "ising_dsh"

    def solve(self, matrix_value: Any) -> dict[str, Any]:
        matrix = _validate_matrix(matrix_value)
        dimension = int(matrix.shape[0])
        task_name = f"{self.task_name_prefix}_{uuid.uuid4().hex[:12]}"

        kwargs: dict[str, Any] = {
            "task_name": task_name,
            "wait": True,
            "interval": self.interval,
            "task_mode": self.TaskMode.OPTIMIZATION,
        }
        if self.project_no is not None:
            kwargs["project_no"] = self.project_no

        _LOGGER.info("solve start dimension=%d task_name=%s", dimension, task_name)
        started_ns = time.perf_counter_ns()
        try:
            optimizer = self.CIMOptimizer(**kwargs)
            solutions = optimizer.solve(
                matrix,
                negtail_flip=False,
                sort_solutions=True,
            )
            hamiltonians = optimizer.get_hamiltonian()
        except Exception as exc:
            _LOGGER.exception("solve failed dimension=%d task_name=%s", dimension, task_name)
            raise WorkerError("CIM_TASK_FAILED", f"Kaiwu CIM solve failed: {exc}") from exc

        solver_time_us = (time.perf_counter_ns() - started_ns) / 1_000.0
        normalized = _normalize_solver_result(solutions, hamiltonians, dimension)
        _LOGGER.info(
            "solve complete dimension=%d task_name=%s solutions=%d solver_time_us=%.3f",
            dimension,
            task_name,
            len(normalized),
            solver_time_us,
        )
        return {
            "dimension": dimension,
            "solutions": normalized,
            "solver_time_us": solver_time_us,
            "task_name": task_name,
        }


def _doctor(check_license: bool) -> dict[str, Any]:
    report: dict[str, Any] = {
        "python_version": sys.version.split()[0],
        "python_310": sys.version_info.major == 3 and sys.version_info.minor == 10,
        "project_no_set": bool(os.getenv("KAIWU_PROJECT_NO", "").strip()),
        "checkpoint_dir": os.path.expanduser(os.getenv("KAIWU_CHECKPOINT_DIR", "~/.qboson-ising-dsh/checkpoints")),
    }
    try:
        import numpy as np
        report["numpy"] = getattr(np, "__version__", "unknown")
    except Exception as exc:
        report["numpy_error"] = str(exc)

    try:
        import kaiwu as kw
        from importlib.metadata import version
        report["kaiwu"] = version("kaiwu")
        from kaiwu.cim import CIMOptimizer, TaskMode  # noqa: F401
        report["cim_api"] = True
        if check_license:
            report["license_present"] = license_path(kw).is_file()
            report["license_valid"] = license_available(kw)
    except Exception as exc:
        report["kaiwu_error"] = str(exc)
        if check_license:
            report["license_valid"] = False
    return report


def _check_runtime() -> dict[str, Any]:
    report = _doctor(check_license=True)
    ready = report['python_310'] and 'numpy_error' not in report and 'kaiwu_error' not in report
    result = {
        'python_executable': sys.executable,
        'python_version': report['python_version'],
        'environment_status': 'ready' if ready else 'invalid',
        'license_status': 'not_checked',
    }
    if 'kaiwu' in report:
        result['kaiwu_version'] = report['kaiwu']
    if ready:
        result['license_status'] = ('valid' if report['license_valid'] else 'invalid') if report['license_present'] else 'missing'
    else:
        result['message'] = '需要 Python 3.10 和可用的 Kaiwu SDK，请调用 prepare_kaiwu_runtime。'
    return result


def _serve() -> int:
    try:
        runtime = KaiwuRuntime()
    except Exception as exc:
        _write_json({"type": "startup_error", "error": _error_payload(exc)})
        return 1

    _write_json({
        "type": "ready",
        "python_version": sys.version.split()[0],
    })

    for raw in sys.stdin:
        raw = raw.strip()
        if not raw:
            continue
        request_id: str | None = None
        try:
            request = json.loads(raw)
            request_id = request.get("id")
            if not isinstance(request_id, str) or not request_id:
                raise WorkerError("PROTOCOL_ERROR", "request id must be a non-empty string")
            op = request.get("op")
            if op != "solve":
                raise WorkerError("PROTOCOL_ERROR", f"unsupported operation: {op!r}")
            result = runtime.solve(request.get("ising_matrix"))
            _write_json({"id": request_id, "ok": True, "result": result})
        except Exception as exc:
            _LOGGER.exception("request failed id=%s", request_id)
            _write_json({"id": request_id or "", "ok": False, "error": _error_payload(exc)})
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="QBoson Ising Solver Kaiwu worker")
    parser.add_argument("--doctor", action="store_true", help="print environment diagnostics and exit")
    parser.add_argument("--check-license", action="store_true", help="doctor: check the existing License without initializing it")
    parser.add_argument("--authorize", action="store_true", help="prepare the SDK environment and authorize it for local or hardware solving")
    parser.add_argument("--configure-license", action="store_true", help="open License configuration to renew authorization or switch accounts")
    parser.add_argument("--check-runtime", action="store_true", help="report environment and License status")
    args = parser.parse_args()

    if args.doctor:
        report = _doctor(args.check_license)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        return 1 if args.check_license and not report.get("license_valid") else 0

    _isolate_protocol_stdout()

    if args.check_runtime:
        _write_json(_check_runtime())
        return 0

    if args.authorize or args.configure_license:
        try:
            _write_json(_prepare_runtime(configure_license=args.configure_license))
            return 0
        except WorkerError as exc:
            print(str(exc), file=sys.stderr)
            return 1
        except Exception:
            print("Kaiwu 运行环境准备失败，请检查 SDK 安装。", file=sys.stderr)
            return 1

    try:
        _configure_logging()
    except Exception:
        traceback.print_exc(file=sys.stderr)
    return _serve()


if __name__ == "__main__":
    raise SystemExit(main())
