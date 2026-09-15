# Architecture

```text
DeepSeek Harness Agent
        |
        v
solve_ising Tool Plugin
  inject: tools, isingSolver
        |
        v
ctx.isingSolver Service
        ^
        |
KaiwuIsingSolverProvider
  inject: subprocess, credentials
        |
        +--> ctx.credentials -> QBOSON_USER_ID / QBOSON_SDK_CODE
        |
        +--> ManagedKaiwuRuntime
        |      ├─ pinned uv bootstrap
        |      ├─ managed Python 3.10
        |      └─ private venv + kaiwu
        |
        v
Python worker
        |
        v
Kaiwu SDK -> CIMOptimizer -> QBoson SPQC
```

## Components

- `qboson-ising-tool` consumes the `isingSolver` Service contract and exposes `solve_ising` to the model.
- `qboson-ising-provider-kaiwu` provides `ctx.isingSolver` and coordinates credentials, runtime setup and worker lifecycle.
- `ManagedKaiwuRuntime` provisions an isolated Python 3.10 environment under `$DSH_HOME/runtimes/dsh-qboson-ising-solver` and installs `kaiwu`.
- The Python worker initializes the Kaiwu license, creates `CIMOptimizer` tasks and normalizes solutions with their Hamiltonians.
- Provider disposal terminates the worker through a Cordis effect and `ctx.subprocess`.

## Runtime provisioning

Runtime resolution follows this order:

1. `QBOSON_ISING_PYTHON`, when configured and compatible;
2. the existing plugin-managed venv;
3. automatic provisioning under `$DSH_HOME/runtimes/dsh-qboson-ising-solver`.

Automatic provisioning uses a pinned `uv` bootstrap, obtains Python 3.10, creates the private venv and installs the configured Kaiwu package specification (`kaiwu` by default).

## Tool contract

Input:

```json
{"ising_matrix": [[0, -1], [-1, 0]]}
```

The input is a complete numeric Ising Matrix ready for direct solver submission. Validation requires a non-empty, two-dimensional, square matrix of finite numbers.

Kaiwu call:

```python
optimizer = CIMOptimizer(
    task_name=task_name,
    wait=True,
    interval=interval,
    project_no=project_no,
    task_mode=TaskMode.OPTIMIZATION,
)
solutions = optimizer.solve(
    matrix,
    negtail_flip=False,
    sort_solutions=True,
)
hamiltonians = optimizer.get_hamiltonian()
```

Output:

```json
{
  "dimension": 10,
  "solutions": [
    {"spins": [-1, 1, -1, 1, 1, -1, -1, -1, 1, 1], "hamiltonian": -30.0}
  ],
  "solver_time_us": 5707040.0,
  "task_name": "ising_dsh_0123456789ab"
}
```

Results are validated and sorted by ascending Hamiltonian. Every spin vector has exactly `dimension` entries and values in `{-1,+1}`.

## Credentials

The Provider resolves `QBOSON_USER_ID` and `QBOSON_SDK_CODE` through the Harness `credentials` Service. These values are injected into the worker process and remain outside the Tool input/output contract.

## Cancellation and lifecycle

Each Tool execution forwards `exec.signal` to the Service. Timeout or cancellation terminates the current worker. Provider disposal also terminates the worker. The managed Python runtime persists across Harness restarts and Fiber instances.
