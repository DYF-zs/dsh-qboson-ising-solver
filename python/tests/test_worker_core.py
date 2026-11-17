import importlib.util
import io
from pathlib import Path
import unittest
from unittest.mock import patch
import types

import numpy as np

WORKER = Path(__file__).resolve().parents[1] / "qboson_ising_worker" / "worker.py"
spec = importlib.util.spec_from_file_location("qboson_ising_worker.worker", WORKER)
worker = importlib.util.module_from_spec(spec)
assert spec.loader is not None
spec.loader.exec_module(worker)


class WorkerCoreTests(unittest.TestCase):
    def test_solver_worker_requires_authorization_without_opening_a_dialog(self):
        kw = types.SimpleNamespace()
        cim = types.SimpleNamespace(CIMOptimizer=object, TaskMode=object)
        with patch.dict('sys.modules', {'kaiwu': kw, 'kaiwu.cim': cim}), patch.object(worker, '_require_python_310'), patch.object(worker, 'license_available', return_value=False), patch.object(worker, 'ensure_authorized') as authorize:
            with self.assertRaises(worker.WorkerError) as error:
                worker.KaiwuRuntime()
            self.assertEqual(error.exception.code, 'LICENSE_ERROR')
            authorize.assert_not_called()

    def test_solver_uses_the_supplied_task_name_and_retains_it_on_failure(self):
        runtime = object.__new__(worker.KaiwuRuntime)
        runtime.task_name_prefix = 'ising_dsh'
        runtime.interval = 1
        runtime.project_no = None
        runtime.TaskMode = types.SimpleNamespace(OPTIMIZATION='fixture')
        optimizer = types.SimpleNamespace(
            solve=lambda *args, **kwargs: np.array([[1, -1]]),
            get_hamiltonian=lambda: np.array([-2]),
        )
        task_name = 'ising_dsh_fixture'
        with patch.object(runtime, 'CIMOptimizer', create=True, return_value=optimizer) as factory:
            result = runtime.solve([[0, -1], [-1, 0]], task_name)
            self.assertEqual(factory.call_args.kwargs['task_name'], task_name)
            self.assertEqual(result['task_name'], task_name)
        with patch.object(runtime, 'CIMOptimizer', create=True, side_effect=RuntimeError('Fixture failure')):
            with self.assertRaises(worker.WorkerError) as error:
                runtime.solve([[0, -1], [-1, 0]], task_name)
            self.assertEqual(error.exception.details['task_name'], task_name)

    def test_runtime_check_returns_license_states_without_authorization(self):
        for present, valid, expected in [(False, False, 'missing'), (True, False, 'invalid'), (True, True, 'valid')]:
            report = dict(python_310=True, python_version='3.10.22', kaiwu='1.4.3', license_present=present, license_valid=valid)
            with self.subTest(status=expected), patch.object(worker, '_doctor', return_value=report), patch.object(worker, '_authorize_kaiwu') as authorize:
                status = worker._check_runtime()
                self.assertEqual(status['environment_status'], 'ready')
                self.assertEqual(status['license_status'], expected)
                authorize.assert_not_called()

    def test_invalid_sdk_is_a_check_result(self):
        report = dict(python_310=True, python_version='3.10.22', kaiwu_error='SDK unavailable')
        with patch.object(worker, '_doctor', return_value=report):
            status = worker._check_runtime()
            self.assertEqual(status['environment_status'], 'invalid')
            self.assertEqual(status['license_status'], 'not_checked')

    def test_runtime_check_cli_keeps_normal_missing_license_status(self):
        status = dict(environment_status='ready', license_status='missing')
        with patch('sys.argv', ['worker.py', '--check-runtime']), patch.object(worker, '_isolate_protocol_stdout'), patch.object(worker, '_check_runtime', return_value=status), patch.object(worker, '_write_json') as output, patch.object(worker, '_configure_logging') as log, patch.object(worker, '_serve') as solve:
            self.assertEqual(worker.main(), 0)
            output.assert_called_once_with(status)
            log.assert_not_called()
            solve.assert_not_called()

    def test_environment_preparation_authorizes_without_creating_a_solver(self):
        kw = types.SimpleNamespace()
        with patch.dict('sys.modules', {'kaiwu': kw}), patch.object(worker, '_require_python_310'), patch('importlib.metadata.version', return_value='1.4.1'), patch.object(worker, 'ensure_authorized', return_value=True) as authorize:
            info = worker._prepare_runtime()
            authorize.assert_called_once_with(kw, force=False)
            self.assertEqual(info['kaiwu_version'], '1.4.1')

    def test_environment_preparation_stops_when_authorization_is_cancelled(self):
        with patch.dict('sys.modules', {'kaiwu': types.SimpleNamespace()}), patch.object(worker, '_require_python_310'), patch.object(worker, 'ensure_authorized', return_value=False):
            with self.assertRaisesRegex(worker.WorkerError, '授权已取消'):
                worker._prepare_runtime()

    def test_license_configuration_always_opens_the_dialog(self):
        kw = types.SimpleNamespace()
        with patch.dict('sys.modules', {'kaiwu': kw}), patch.object(worker, '_require_python_310'), patch('importlib.metadata.version', return_value='1.4.3'), patch('license_dialog.license_available', return_value=True) as check, patch('license_dialog.show_authorization', return_value=True) as dialog:
            info = worker._prepare_runtime(configure_license=True)
            dialog.assert_called_once_with(kw)
            check.assert_not_called()
            self.assertEqual(info['kaiwu_version'], '1.4.3')

    def test_license_configuration_stops_when_the_dialog_is_cancelled(self):
        with patch('license_dialog.show_authorization', return_value=False):
            with self.assertRaisesRegex(worker.WorkerError, '授权已取消'):
                worker._authorize_kaiwu(object(), configure=True)

    def test_license_cli_routes_to_configuration(self):
        info = {'python_executable': 'python', 'python_version': '3.10.22', 'kaiwu_version': '1.4.3'}
        with patch('sys.argv', ['worker.py', '--configure-license']), patch.object(worker, '_isolate_protocol_stdout'), patch.object(worker, '_prepare_runtime', return_value=info) as prepare, patch.object(worker, '_write_json') as output, patch.object(worker, '_serve') as solve:
            self.assertEqual(worker.main(), 0)
            prepare.assert_called_once_with(configure_license=True)
            output.assert_called_once_with(info)
            solve.assert_not_called()

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
