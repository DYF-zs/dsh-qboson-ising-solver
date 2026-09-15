import importlib.util
import io
from pathlib import Path
import unittest

import numpy as np

WORKER = Path(__file__).resolve().parents[1] / "qboson_ising_worker" / "worker.py"
spec = importlib.util.spec_from_file_location("qboson_ising_worker.worker", WORKER)
worker = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(worker)


class WorkerCoreTests(unittest.TestCase):
    def test_validate_matrix(self):
        matrix = worker._validate_matrix([[0, -1], [-1, 0]])
        self.assertEqual(matrix.shape, (2, 2))

    def test_validate_matrix_rejects_non_square(self):
        with self.assertRaises(worker.WorkerError):
            worker._validate_matrix([[0, 1], [1]])

    def test_normalize_result(self):
        result = worker._normalize_solver_result(
            np.array([[1, -1], [-1, -1]]),
            np.array([2.0, -3.0]),
            2,
        )
        self.assertEqual([item["hamiltonian"] for item in result], [-3.0, 2.0])

    def test_normalize_rejects_invalid_spin(self):
        with self.assertRaises(worker.WorkerError):
            worker._normalize_solver_result(np.array([[0, 1]]), np.array([0.0]), 2)


    def test_protocol_json_uses_dedicated_stream(self):
        protocol = io.StringIO()
        previous_protocol = worker._PROTOCOL_STDOUT
        try:
            worker._PROTOCOL_STDOUT = protocol
            worker._write_json({"type": "ready", "python_version": "3.10.0"})
        finally:
            worker._PROTOCOL_STDOUT = previous_protocol
        self.assertEqual(
            protocol.getvalue(),
            '{"type":"ready","python_version":"3.10.0"}\n',
        )


if __name__ == "__main__":
    unittest.main()
