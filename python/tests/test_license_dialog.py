import base64
import json
import os
import sys
import tempfile
import types
import unittest
import threading
import time
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'qboson_ising_worker'))
from license_dialog import authorize, ensure_authorized, license_available, show_authorization


def token(exp):
    payload = base64.urlsafe_b64encode(json.dumps({'exp': exp}).encode()).decode().rstrip('=')
    return f'header.{payload}.signature_sdkCode_test'


class LicenseTests(unittest.TestCase):
    def test_existing_license_and_expiry(self):
        with tempfile.TemporaryDirectory() as directory:
            kw = types.SimpleNamespace(__path__=[directory], license=types.SimpleNamespace(verify_license=lambda _: None))
            path = Path(directory) / 'license.lic'
            self.assertFalse(license_available(kw))
            path.write_text(token(1), encoding='utf-8')
            self.assertFalse(license_available(kw))
            path.write_text(token(4102444800), encoding='utf-8')
            self.assertTrue(license_available(kw))

    def test_failed_initialization_restores_existing_license_and_retry_succeeds(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'license.lic'
            path.write_text(token(1), encoding='utf-8')
            def init(user_id, sdk_code):
                if sdk_code == 'bad':
                    path.write_text('broken', encoding='utf-8')
                    raise ValueError('authorization failed')
                path.write_text(token(4102444800), encoding='utf-8')
            kw = types.SimpleNamespace(__path__=[directory], license=types.SimpleNamespace(init=init, verify_license=lambda _: None))
            with self.assertRaises(ValueError):
                authorize(kw, 'user', 'bad')
            self.assertEqual(path.read_text(encoding='utf-8'), token(1))
            authorize(kw, 'user', 'good')
            self.assertTrue(license_available(kw))

    def test_sdk_rejection_routes_to_authorization(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'license.lic'
            path.write_text(token(4102444800), encoding='utf-8')
            def reject(_):
                raise ValueError('invalid signature')
            kw = types.SimpleNamespace(__path__=[directory], license=types.SimpleNamespace(verify_license=reject))
            self.assertFalse(license_available(kw))

    def test_valid_license_is_reused_without_credentials_or_dialog(self):
        with patch('license_dialog.license_available', return_value=True), patch('license_dialog.authorize') as init, patch('license_dialog.show_authorization') as dialog:
            self.assertTrue(ensure_authorized(object()))
            init.assert_not_called()
            dialog.assert_not_called()

    def test_missing_license_opens_dialog_even_with_environment_credentials(self):
        with patch.dict('os.environ', {'QBOSON_USER_ID': 'test-user', 'QBOSON_SDK_CODE': 'test-code'}), patch('license_dialog.license_available', return_value=False), patch('license_dialog.authorize') as init, patch('license_dialog.show_authorization', return_value=True) as dialog:
            kw = object()
            self.assertTrue(ensure_authorized(kw))
            dialog.assert_called_once_with(kw)
            init.assert_not_called()

    def test_cancel_does_not_authorize(self):
        with patch('license_dialog.license_available', return_value=False), patch('license_dialog.show_authorization', return_value=False):
            self.assertFalse(ensure_authorized(object()))


@unittest.skipUnless(os.environ.get('QBOSON_TEST_GUI') == '1', 'Set QBOSON_TEST_GUI=1 on a graphical desktop')
class AuthorizationDialogTests(unittest.TestCase):
    def test_retry_and_success_with_main_thread_ui_updates(self):
        import tkinter as tk
        native_platform = sys.platform
        real_tk, real_label, real_button = tk.Tk, tk.Label, tk.Button
        for target in dict.fromkeys((native_platform, 'darwin')):
            with self.subTest(platform=target):
                state = {'phase': 0}
                ui_threads, credentials = [], []
                main_thread = threading.get_ident()
                def labels(parent):
                    for widget in parent.winfo_children():
                        yield widget
                        yield from labels(widget)
                def create_label(*args, **kwargs):
                    label = real_label(*args, **kwargs)
                    if kwargs.get('text') == '授权':
                        bind = label.bind
                        def capture(sequence, func=None, add=None):
                            if sequence == '<ButtonRelease-1>':
                                state['submit'] = lambda: func(None)
                            return bind(sequence, func, add)
                        label.bind = capture
                    return label
                def create_button(*args, **kwargs):
                    state['submit'] = kwargs['command']
                    return real_button(*args, **kwargs)
                def create_root():
                    root = real_tk()
                    root.withdraw()
                    if target == 'darwin' and native_platform != 'darwin':
                        root.tk.eval('namespace eval ::tk::mac {}')
                    after = root.after
                    def tracked_after(*args):
                        ui_threads.append(threading.get_ident())
                        return after(*args)
                    root.after = tracked_after
                    def drive():
                        widgets = list(labels(root))
                        entries = [widget for widget in widgets if widget.winfo_class() == 'Entry']
                        texts = [widget.cget('text') for widget in widgets if widget.winfo_class() == 'Label']
                        if state['phase'] == 0:
                            entries[0].insert(0, 'test-user')
                            entries[1].insert(0, 'bad')
                            state['phase'] = 1
                            state['submit']()
                        elif state['phase'] == 1 and any('授权失败' in text for text in texts):
                            entries[1].delete(0, 'end')
                            entries[1].insert(0, 'good')
                            state['phase'] = 2
                            state['submit']()
                        elif state['phase'] == 2 and '授权成功' in texts:
                            state['success_at'] = time.monotonic()
                            return
                        after(25, drive)
                    after(50, drive)
                    after(5000, root.destroy)
                    return root
                def fake_authorize(kw, user_id, sdk_code):
                    credentials.append((user_id, sdk_code))
                    if sdk_code == 'bad':
                        raise ValueError('test rejection')
                with patch('sys.platform', target), patch.object(tk, 'Tk', create_root), patch.object(tk, 'Label', create_label), patch.object(tk, 'Button', create_button), patch('license_dialog.authorize', side_effect=fake_authorize):
                    self.assertTrue(show_authorization(object()))
                self.assertEqual(credentials, [('test-user', 'bad'), ('test-user', 'good')])
                self.assertEqual(set(ui_threads), {main_thread})
                self.assertIn('success_at', state)
                self.assertGreaterEqual(time.monotonic() - state['success_at'], .85)


if __name__ == '__main__':
    unittest.main()
