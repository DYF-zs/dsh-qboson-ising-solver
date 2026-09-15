# Validation

Package validation covers:

- Node.js syntax checks for runtime and CLI JavaScript files.
- Node unit tests for matrix validation, result normalization and managed-runtime path/bootstrap invariants.
- Python unit tests for matrix validation and solution/Hamiltonian normalization.
- Python worker bytecode compilation.
- Python package metadata with `requires-python = ">=3.10,<3.11"` and `kaiwu` as a dependency.
- npm package inventory through `npm pack --dry-run`.

The runtime integration boundary is DeepSeek Harness `ctx.subprocess` + `ctx.credentials`, a managed Python 3.10 runtime containing `kaiwu`, and valid QBoson authorization.

`dsh-ising-doctor` reports managed-runtime and credential state without printing credential values.

Runtime provisioning performs network access when creating or repairing the plugin-managed Python environment. It downloads the pinned uv bootstrap and resolves Python 3.10 and `kaiwu` into the plugin runtime directory.

## Worker protocol stream

The Python worker reserves its original stdout pipe for NDJSON protocol messages. Runtime output produced by Kaiwu or dependencies is routed to stderr so it cannot corrupt tool responses.
