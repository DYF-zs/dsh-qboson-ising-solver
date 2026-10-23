# Kaiwu SDK Enterprise API 说明

适用于受检的 Enterprise 发布源码树（`setup.py` 声明 1.4.0；PyPI 包名
`kaiwu`，本文原受检发布树为 1.4.x，安装时自动携带依赖 `kaiwu-community`）。KPP 安装包
`kaiwu-torch-plugin` 0.3.0（历史源码快照 0.2.0）
声明的兼容对象是 Enterprise Kaiwu 1.3.1，所以依赖任何新增 API 之前先读
实际安装的包/版本。

## 可移植面

核实安装的模块后，使用常规的 `kw.core` QUBO/Ising 建模流程。受检
Enterprise 树的优化器面刻意更窄：

- `kw.classical`：`SimulatedAnnealingOptimizer`、`TabuSearchOptimizer`、
  `BruteForceOptimizer`。
- `kw.cim`：`CIMOptimizer`、`TaskMode`。
- `kw.hybrid`：`PenaltyMethodOptimizer`。
- `kw.sampler`：`SimulatedAnnealingSampler`。

## PrecisionReducer

`PrecisionReducer(component, precision=8, target_bits=None,
only_feasible_solution=..., truncated_precision=20)` 是 Ising/QUBO 求解器
装饰器。它的**所在模块与默认值随版本变化**：

| 版本 | 导入位置 | `only_feasible_solution` 默认值 |
|---|---|---|
| 1.3.1（已发布） | `kw.cim` | `True` |
| 1.4.0（源码树） | `kw.preprocess` | `False` |

先确认安装版本，再从对应模块导入。若可行性策略重要，请显式写出
`only_feasible_solution`，不要依赖默认值：

```python
# 1.4.0 源码树
from kaiwu.preprocess import PrecisionReducer
base = kw.cim.CIMOptimizer(task_name="user_supplied_task", wait=True)
solver = PrecisionReducer(
    base,
    precision=8,
    truncated_precision=20,
    target_bits=550,
    only_feasible_solution=False,
)
solutions = solver.solve(ising_matrix)
```

缩减器计算精度、归一化/取整、按需变量拆分、经 `component` 求解，再还原为
原始变量的解。非 `None` 的 `target_bits` 必须大于原矩阵维度；它是扩展维度
的上限。拆分后仍无法满足上限时，实现会回退为直接精度调整，需自行评估解
质量。

## 手动精度 API

用 `calculate_ising_matrix_bit_width`、`adjust_ising_matrix_precision` 及
其 QUBO 对应函数检查/调整精度。手动拆分返回元组，绝不是字典：

```python
split_matrix, last_var_idx = kw.preprocess.perform_precision_adaption_split(
    ising_matrix, param_bit=8, method="var"
)
split_solutions = base.solve(split_matrix)
normalized = split_solutions[0] * split_solutions[0, -1]
original_spin = kw.preprocess.restore_split_solution(normalized, last_var_idx)
```

`method="item"` 是 Enterprise 独有的拆分选项。逆向构造用
`construct_split_solution`。Enterprise 将
`perform_precision_adaption_mutate` 暴露为函数。

只有项目已提供授权配置时，才设置 Enterprise 云端 checkpoint/license。
绝不虚构凭证、项目编号或任务标识。

## 已发布 1.3.1 与 1.4.0 源码树的差异（实测）

已发布的 Enterprise 1.3.1 wheel——KPP 锁定的版本，也是多数用户实际安装的
版本——与受检的 1.4.0 源码树存在差异：

- `QuboModel` 位于 `kw.qubo`（`kw.qubo.QuboModel()`），不在 community
  1.0.7 暴露的扁平 `kw.core` 面里。
- `PrecisionReducer` 位于 `kw.cim`（`kw.cim.PrecisionReducer`），默认
  `only_feasible_solution=True`；1.4.0 树则位于 `kw.preprocess`，默认
  `False`。
- QUBO/Ising 转换器位于 `kw.conversion`：`qubo_model_to_ising_model`、
  `qubo_matrix_to_ising_matrix`、`ising_matrix_to_qubo_matrix`。
- `kw.solver` 暴露 `SimpleSolver` 与 `PenaltyMethodSolver`；1.4.0 树则暴露
  `kw.hybrid.PenaltyMethodOptimizer`。使用任一名称前先查安装的版本。
- 经典本地求解器每次求解都会调用 `verify_license`。没有 license 文件
  （平台 user_id/sdk_code）时求解抛异常，即使矩阵极小也一样。

## 约束嵌入与解选优（在 1.3.1 上验证）

### `add_constraint` 在 1.3.1 编译成**线性**罚项（重要）

实测：`add_constraint(expr == const, name, penalty=P)` 在 1.3.1 上生成的约束
表达式是 `P * (expr - const)`，**不是** `P * (expr - const) ** 2`。线性罚项
会奖励"少取值"（取 0 个比恰好取 1 个更"便宜"），带 one-hot 类约束的模型会被
稳定地解到全零解。

可靠写法：**二次罚项自己写进 `set_objective`**，`add_constraint` 只作登记
（`penalty=0`）供 `verify_constraint` 校验：

```python
PENALTY = 20.0
penalty = PENALTY * quicksum([(x.sum(axis=0)[j] - 1) ** 2 for j in range(n)])
model.set_objective(cost + penalty)
model.add_constraint(x.sum(axis=0) == 1, "slot_cons", penalty=0.0)
```

不等式约束同理：自行引入松弛比特/整数并写成平方形式，不要指望
`add_constraint` 替你生成罚项。

### 其余几条

- 在 `get_matrix()` 之前调用
  `model.set_constraint_handler(kw.core.PenaltyMethodConstraint)`。
  部分版本的默认 handler 可能为 `None`，未设置时 `get_matrix()` 会直接报错。
- `qubo_matrix_to_ising_matrix(matrix)` 返回**元组** `(ising_matrix, offset)`，
  且 Ising 矩阵已含尾部参考自旋（n+1 阶）。
- 1.3.1 的 `kw.classical` 优化器**没有 `solve_qubo()`**（该方法只存在于
  1.4.x/community 的优化器基类），统一走 Ising：`solver.solve(ising_matrix)`。
- **解还原必须用 Ising 模型的变量字典**
  `qubo_model_to_ising_model(model).get_variables()`（含 `__spin__` 尾项）。
  若误用 QUBO 侧的 `model.get_variables()`（键形如 `bx_0_0`），变量会被静默
  还原成全 0——表现为"解看起来合法但目标是 0"。
- `Optimizer.solve(ising_matrix)` 返回去重后的解池，**不**按能量排序，
  且行可能不可行。`solutions[0]` 不是最优行。稳健的选优模式：

```python
solutions = solver.solve(ising_mat)
vars_dict = qubo_model_to_ising_model(model).get_variables()   # Ising 侧字典
best, best_val = None, None
for s in solutions:
    s = np.asarray(s)
    spins = s[:-1] * s[-1]              # 去尾并应用尾部参考自旋
    sol_dict = kw.core.get_sol_dict(spins, vars_dict)
    unsat, _ = model.verify_constraint(sol_dict)
    if unsat == 0:
        val = kw.core.get_val(original_objective_expr, sol_dict)  # 不含罚项
        if best_val is None or val < best_val:
            best_val, best = val, sol_dict
```

- 解字典中的二元变量名可能带前缀（例如 `bx_0_0`），标量通过
  `kw.core.get_val(expr, sol_dict)` 取值，不要用裸字符串键。
  1.3.1 数组用 `get_array_val`，1.4.0 数组用 `get_val`；跨版本代码逐元素
  `get_val(x[i], sol_dict)` 后组装数组，避免使用已移除 API 或把整个数组传给 1.3.1 的 `get_val`。

## 经典求解器规模上限（实测）

一个 344 变量的边/云网络模型（13 条分配等式加 25 条松弛编码的容量不等式），
在以下方法下均无可行解：普通 SA（多 seed，alpha 0.998–0.999）、从可行点
热启动的 SA、Tabu 搜索、自动罚系数的 SimpleSolver、PenaltyMethodSolver。
该规模属于 CIM 的场景。必须用经典求解器兜底时：

- 把"默认/云端"指示变量从模型中消去（`w = 1 - sum(x)` 折入目标函数），
  使一次再分配成为单翻转即可行的移动，而不是必须翻越分配罚垒的成对
  协同翻转。
- 剪枝候选点（例如按需求密度），重建更小的模型重新求解，然后在原始问题
  语义下验证结果、按布局重算成本。
- 约 73 变量的覆盖模型用 `initial_temperature=100, alpha=0.998,
  iterations_per_t=200` 可稳定求解；默认的 `alpha=0.99,
  iterations_per_t=10` 退火计划连这个规模都可能错过可行性。
