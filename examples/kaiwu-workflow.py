"""Build a weighted vertex-cover Ising model, then decode a hardware result.

Run with the interpreter returned by prepare_kaiwu_runtime:
    python kaiwu-workflow.py build <task-directory>
    # solve_ising_file(matrix.json, raw-result.json) runs in DSH.
    python kaiwu-workflow.py decode <task-directory>
DSH solver tools handle SPQC submission and license initialization.
"""
from __future__ import annotations

import argparse
import hashlib
from importlib.metadata import version
import json
import math
from pathlib import Path


def build_model():
    import numpy as np
    from kaiwu.core import Binary, PenaltyMethodConstraint, get_sol_dict, get_val, ndarray

    # Enterprise 1.3.x and 1.4.x use different API import paths.
    sdk_version = version("kaiwu")
    if tuple(int(part) for part in sdk_version.split(".")[:2]) < (1, 4):
        from kaiwu.qubo import QuboModel
        from kaiwu.conversion import qubo_matrix_to_ising_matrix, qubo_model_to_ising_model
    else:
        from kaiwu.core import QuboModel, qubo_matrix_to_ising_matrix, qubo_model_to_ising_model

    weights = [3, 2, 4]
    edges = [(0, 1), (1, 2)]
    x = ndarray(len(weights), "x", Binary)
    original = sum(weight * x[i] for i, weight in enumerate(weights))
    # Adding an endpoint repairs any uncovered edge at a cost <= max(weights).
    penalty = max(weights) + 1
    model = QuboModel()
    model.set_objective(original + penalty * sum((1 - x[u]) * (1 - x[v]) for u, v in edges))
    model.set_constraint_handler(PenaltyMethodConstraint)
    matrix, offset = qubo_matrix_to_ising_matrix(model.get_matrix())
    # For this integer-weight example, multiplying by 8 is exact and fits int8.
    # Other models require their own precision analysis and restoration map.
    scaled = np.asarray(matrix) * 8
    if not np.isfinite(scaled).all() or not np.allclose(scaled, np.rint(scaled), rtol=0, atol=1e-12):
        raise ValueError("The example's exact integer scaling does not apply")
    matrix_list = np.rint(scaled).astype(np.int64).tolist()
    if max(abs(value) for row in matrix_list for value in row) > 127:
        raise ValueError("The example exceeds its checked coefficient range")
    variables = qubo_model_to_ising_model(model).get_variables()
    metadata = {
        "kaiwu_version": sdk_version,
        "weights": weights,
        "edges": [list(edge) for edge in edges],
        "penalty": penalty,
        "variables": {name: int(index) for name, index in variables.items()},
        "qubo_constant": float(model.get_offset()),
        "conversion_offset": float(offset),
        "ising_scale": 8,
        "reference_spin": "last",
        "matrix_sha256": hashlib.sha256(json.dumps(matrix_list, separators=(",", ":")).encode()).hexdigest(),
    }
    return matrix_list, metadata, x, original, variables, get_sol_dict, get_val


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")


def build(directory: Path) -> dict:
    matrix, metadata, *_ = build_model()
    directory.mkdir(parents=True, exist_ok=True)
    if any((directory / name).exists() for name in ("matrix.json", "metadata.json", "raw-result.json", "result.json")):
        raise FileExistsError("Use a new task directory to keep existing model/result files intact")
    write_json(directory / "matrix.json", {"ising_matrix": matrix})
    write_json(directory / "metadata.json", metadata)
    return {"matrix_path": str((directory / "matrix.json").resolve()),
            "result_path": str((directory / "raw-result.json").resolve()), "dimension": len(matrix)}


def decode(directory: Path) -> dict:
    matrix, expected, x, original, variables, get_sol_dict, get_val = build_model()
    metadata = json.loads((directory / "metadata.json").read_text(encoding="utf-8"))
    if metadata != expected:
        raise ValueError("Model inputs, variable mapping or SDK version differ from the saved model")
    stored = json.loads((directory / "matrix.json").read_text(encoding="utf-8"))
    if stored != {"ising_matrix": matrix}:
        raise ValueError("The saved matrix differs from the decoded model")
    raw = json.loads((directory / "raw-result.json").read_text(encoding="utf-8"))
    if raw.get("matrix_sha256") != metadata["matrix_sha256"] or raw.get("dimension") != len(matrix):
        raise ValueError("Hardware result does not match this matrix")
    if not isinstance(raw.get("task_name"), str) or not raw["task_name"]:
        raise ValueError("Hardware result has no task identifier")
    candidates = raw.get("solutions")
    if not isinstance(candidates, list) or not candidates:
        raise ValueError("Hardware result contains no candidates")
    feasible = []
    for candidate in candidates:
        spins = candidate["spins"]
        if len(spins) != len(matrix) or any(type(s) is not int or s not in (-1, 1) for s in spins):
            raise ValueError("Malformed raw spin vector")
        if not math.isfinite(candidate["hamiltonian"]):
            raise ValueError("Malformed Hamiltonian")
        normalized = [spin * spins[-1] for spin in spins[:-1]]
        solution = get_sol_dict(normalized, variables)
        bits = [int(round(get_val(variable, solution))) for variable in x]
        if all(bits[u] or bits[v] for u, v in metadata["edges"]):
            cost = sum(weight * bit for weight, bit in zip(metadata["weights"], bits))
            if not math.isclose(float(get_val(original, solution)), cost):
                raise ValueError("Decoded objective disagrees with the business calculation")
            feasible.append((cost, bits))
    if not feasible:
        raise ValueError("No returned candidate satisfies all original cover constraints")
    cost, bits = min(feasible)
    report = {
        "selected_vertices": [i for i, bit in enumerate(bits) if bit],
        "objective": cost,
        "feasible": True,
        "candidate_count": len(candidates),
        "feasible_candidate_count": len(feasible),
        "task_name": raw["task_name"],
        "optimality_proven": False,
    }
    write_json(directory / "result.json", report)
    return report


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("build", "decode"))
    parser.add_argument("directory", type=Path)
    args = parser.parse_args()
    print(json.dumps((build if args.command == "build" else decode)(args.directory), ensure_ascii=False))


if __name__ == "__main__":
    main()
