import json,sys
print(json.dumps({'type':'ready'}),flush=True)
for line in sys.stdin:
    req=json.loads(line)
    value={'dimension':2,'solutions':[{'spins':[1,-1],'hamiltonian':-2}],'solver_time_us':1,'task_name':'fixture_not_hardware'}
    print(json.dumps({'id':req['id'],'ok':True,'result':value}),flush=True)
