"""Authorization boundary fixture for DSH subprocess integration tests."""
import json
import sys
from importlib.metadata import version

assert sys.argv[1:] in (['--authorize'], ['--configure-license'], ['--check-runtime'])
info = {
    'python_executable': sys.executable,
    'python_version': sys.version.split()[0],
    'kaiwu_version': version('kaiwu'),
}
if sys.argv[1:] == ['--check-runtime']:
    info.update(environment_status='ready', license_status='valid')
print(json.dumps(info))
