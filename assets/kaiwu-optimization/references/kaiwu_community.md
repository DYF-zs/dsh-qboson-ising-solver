# Kaiwu Community API 说明

适用于开源 `kaiwu_community` 发行版（1.0.7，Apache-2.0，
`pip install kaiwu-community`，GitHub `qboson/kaiwu_community`）。Community
是仅含建模能力的基础发行版。依赖此处任何名称之前，先核实安装的版本。

## 建模面

Community 暴露扁平的 `kw.core` 面：`QuboModel`、`quicksum`、`ndarray`、
`Binary`、`Integer`、`get_val`、`get_array_val`、`get_sol_dict`、
`qubo_matrix_to_ising_matrix`、`ising_matrix_to_qubo_matrix`、
`qubo_model_to_ising_model`，以及 `get_min_penalty*` 系列助手。1.0.7 中没有
`kw.qubo` 子包——用 `kw.core.QuboModel()`（或扁平化的顶层 `kw.QuboModel`）。

`QuboModel` 支持 `set_objective`、`add_constraint(constraint, name,
penalty=...)`、`verify_constraint`、`get_matrix`、`get_offset`、
`get_sol_dict`。约束支持对 `quicksum`/`ndarray` 变量的 `==`、`<=`、`>=`
表达式；不等式约束编译时会自动引入松弛变量（在解字典中表现为 `_slack_*`
键）。

## 没有本地求解器后端

Community 不带任何优化器。`QuboSolver.solve_qubo` 只有当实例同时是
`IsingSolver` 时才能工作，而 community 没有提供任何具体的 `IsingSolver`
实现。`kw.classical`、`kw.cim`、`kw.hobo`、`kw.hybrid`、`kw.preprocess`、
`kw.sampler`、`kw.torch_plugin` 只有在 Enterprise 扩展包共存安装时才存在：
`kaiwu/__init__.py` 使用 `pkgutil.extend_path` 并尝试从合并的命名空间导入
这些子包（`_EXT_MODULES`）。

不要假设纯 community 环境中存在这些子包，也不要照抄仓库中的
`example/tsp_sdk_1_2_doc_example.py`：它使用的 `kw.qubo.QuboModel` 和
`kw.solver.SimpleSolver` 依赖合并后的 Enterprise 包，在纯 community 安装上
必然失败。

## 求解选项

- 共存安装 Enterprise 包（命名空间合并）以获得本地经典求解器——此时适用
  Enterprise 的 license 要求；或
- 通过 Enterprise SDK 使用云端平台 / CIM。

建模本身不需要 license。

## community 目标的工作流检查单

1. 写代码前先确认发行版（`importlib.metadata.version("kaiwu-community")`
   及 `kw.__version__ == "1.0.7"` 式检查）。
2. 只用 `kw.core` 的名称建模；不导入求解器子包。
3. 用户要求求解时，说明纯 community 无法求解，询问对方是否有 Enterprise
   扩展或云端平台可用；不要静默输出 Enterprise 独有的求解器调用。
