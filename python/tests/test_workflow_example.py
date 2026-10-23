import importlib.util
from importlib.metadata import version
import itertools
from pathlib import Path
import tempfile
import unittest

EXAMPLE = Path(__file__).resolve().parents[2] / "examples" / "kaiwu-workflow.py"
spec = importlib.util.spec_from_file_location("kaiwu_workflow_example", EXAMPLE)
workflow = importlib.util.module_from_spec(spec)
spec.loader.exec_module(workflow)


@unittest.skipUnless(importlib.util.find_spec("kaiwu"), "Kaiwu SDK is needed for the example")
class WorkflowExampleTests(unittest.TestCase):
    def test_maxcut_conversion_and_decoding_preserve_business_objective(self):
        import numpy as np
        from kaiwu.core import Binary, PenaltyMethodConstraint, get_sol_dict, get_val, ndarray
        if tuple(int(part) for part in version('kaiwu').split('.')[:2]) < (1, 4):
            from kaiwu.qubo import QuboModel
            from kaiwu.conversion import qubo_matrix_to_ising_matrix, qubo_model_to_ising_model
        else:
            from kaiwu.core import QuboModel, qubo_matrix_to_ising_matrix, qubo_model_to_ising_model
        edges = [(0, 1, 2), (1, 2, 3), (0, 2, 1)]
        x = ndarray(3, 'cut', Binary)
        score = sum(weight * (x[u] + x[v] - 2 * x[u] * x[v]) for u, v, weight in edges)
        model = QuboModel()
        model.set_objective(-score)
        model.set_constraint_handler(PenaltyMethodConstraint)
        matrix, offset = qubo_matrix_to_ising_matrix(model.get_matrix())
        variables = qubo_model_to_ising_model(model).get_variables()
        # Exhaustively check conversion and reference-spin decoding, without sampling.
        for bits in itertools.product((0, 1), repeat=3):
            expected = sum(weight for u, v, weight in edges if bits[u] != bits[v])
            for reference in (-1, 1):
                spins = np.full(len(matrix), reference)
                for i, bit in enumerate(bits):
                    spins[variables[f'cut[{i}]']] = (2 * bit - 1) * reference
                decoded = get_sol_dict(spins[:-1] * spins[-1], variables)
                self.assertEqual([round(get_val(variable, decoded)) for variable in x], list(bits))
                self.assertAlmostEqual(get_val(score, decoded), expected)
                self.assertAlmostEqual(-spins @ matrix @ spins + offset + model.get_offset(), -expected)

    def test_build_and_decode_actual_sdk_model_with_fixture_candidates(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            built = workflow.build(directory)
            matrix, metadata, *_ = workflow.build_model()
            self.assertEqual(built["dimension"], 4)
            # Deliberately put a feasible higher-cost candidate before the best fixture,
            # and an infeasible candidate with the lowest reported energy.
            candidates = []
            for bits, reference, energy in (([1, 0, 1], 1, -20), ([0, 1, 0], -1, -10), ([0, 0, 0], 1, -100)):
                spins = [reference] * len(matrix)
                for i, bit in enumerate(bits):
                    spins[metadata["variables"][f"x[{i}]"]] = (2 * bit - 1) * reference
                candidates.append({"spins": spins, "hamiltonian": energy})
            workflow.write_json(directory / "raw-result.json", {
                "dimension": len(matrix), "matrix_sha256": metadata["matrix_sha256"],
                "solutions": candidates, "task_name": "test_fixture_not_hardware",
            })
            report = workflow.decode(directory)
            self.assertEqual(report["selected_vertices"], [1])
            self.assertEqual(report["objective"], 2)
            self.assertEqual(report["feasible_candidate_count"], 2)
            self.assertFalse(report["optimality_proven"])
            self.assertTrue((directory / "result.json").is_file())
            with self.assertRaises(FileExistsError):
                workflow.build(directory)

    def test_compiled_qubo_preserves_original_cost_and_cover_penalties(self):
        import numpy as np
        # Verify encoding, not a replacement solver: no candidate is delivered here.
        matrix, metadata, _, _, *_ = workflow.build_model()
        h = np.asarray(matrix) / metadata["ising_scale"]
        for bits in itertools.product((0, 1), repeat=3):
            spins = np.ones(len(matrix))
            for i, bit in enumerate(bits):
                spins[metadata["variables"][f"x[{i}]"]] = 2 * bit - 1
            business_cost = sum(w * b for w, b in zip(metadata["weights"], bits))
            violations = sum(not (bits[u] or bits[v]) for u, v in metadata["edges"])
            encoded_cost = -spins @ h @ spins + metadata["conversion_offset"] + metadata["qubo_constant"]
            self.assertAlmostEqual(encoded_cost, business_cost + metadata["penalty"] * violations)

    def test_wrong_result_provenance_and_infeasible_pool_are_rejected(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            workflow.build(directory)
            matrix, metadata, *_ = workflow.build_model()
            raw = {"dimension": len(matrix), "matrix_sha256": "wrong", "task_name": "test_fixture",
                   "solutions": [{"spins": [-1, -1, -1, 1], "hamiltonian": -100}]}
            workflow.write_json(directory / "raw-result.json", raw)
            with self.assertRaisesRegex(ValueError, "does not match"):
                workflow.decode(directory)
            raw["matrix_sha256"] = metadata["matrix_sha256"]
            workflow.write_json(directory / "raw-result.json", raw)
            with self.assertRaisesRegex(ValueError, "No returned candidate"):
                workflow.decode(directory)
            self.assertFalse((directory / "result.json").exists())


if __name__ == "__main__":
    unittest.main()
