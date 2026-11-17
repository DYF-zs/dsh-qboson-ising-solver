"""Runtime authorization and task protocol fixture for subprocess tests."""
import json
import os
from pathlib import Path
import sys
import time

license_file = Path('fixture-license')
info = dict(python_executable=sys.executable, python_version=sys.version.split()[0], kaiwu_version='1.4.3')
if '--check-runtime' in sys.argv:
    print(json.dumps(dict(info, environment_status='ready', license_status='valid' if license_file.exists() else 'missing')))
elif '--authorize' in sys.argv:
    with Path('authorization-opened').open('a') as stream:
        stream.write(str(os.getpid()) + '\n')
    while not Path('authorization-release').exists():
        time.sleep(0.02)
    license_file.write_text('fixture')
    print(json.dumps(info))
else:
    if not license_file.exists():
        print(json.dumps(dict(type='startup_error', error=dict(code='LICENSE_ERROR', message='Fixture License missing'))), flush=True)
        raise SystemExit(1)
    print(json.dumps(dict(type='ready')), flush=True)
    for line in sys.stdin:
        request = json.loads(line)
        tag = request['ising_matrix'][0][1]
        task_name = request['task_name']
        Path(f'submitted-{tag}').write_text(task_name)
        if tag in (9, 10):
            time.sleep(30)
        if tag == 7:
            response = dict(id=request['id'], ok=False, error=dict(code='CIM_TASK_FAILED', message='Fixture solve failed', details=dict(task_name=task_name)))
        else:
            value = dict(dimension=2, solutions=[dict(spins=[1, -1], hamiltonian=-2)], solver_time_us=1, task_name=task_name)
            response = dict(id=request['id'], ok=True, result=value)
        print(json.dumps(response), flush=True)
