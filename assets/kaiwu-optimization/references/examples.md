> 本页示例使用 Enterprise 1.3.x API。其他版本的建模、转换与解码用法见 [SKILL.md](../SKILL.md)，导入路径与数组取值方式按对应版本选择。

# Kaiwu SDK 范例

TSP 示例面向 Enterprise 1.3.1；其他版本按 SKILL.md 的版本适配表调整。

## 1. QUBO 建模完整流程：TSP（5 节点）

覆盖：决策数组 `ndarray((n,n))`、one-hot 二次罚项、`add_constraint` 只登记、
`set_constraint_handler`、Ising 转换、遍历解池做「可行性 + 原始目标」双校验。

```python
import numpy as np
import kaiwu as kw
from kaiwu.core import ndarray, Binary, quicksum, get_val, get_array_val, get_sol_dict
from kaiwu.core import PenaltyMethodConstraint
from kaiwu.classical import SimulatedAnnealingOptimizer
from kaiwu.conversion import qubo_matrix_to_ising_matrix, qubo_model_to_ising_model

try:      # 1.3.x
    from kaiwu.qubo import QuboModel
except ImportError:   # 1.4.x
    from kaiwu.core import QuboModel

DISTANCE = np.array(
    [
        [0, 2, 9, 5, 7],
        [2, 0, 4, 3, 8],
        [9, 4, 0, 6, 1],
        [5, 3, 6, 0, 4],
        [7, 8, 1, 4, 0],
    ],
    dtype=float,
)
NUM_NODES = DISTANCE.shape[0]
PENALTY = float(DISTANCE[DISTANCE > 0].max()) * NUM_NODES   # 罚系数取足够大

position = ndarray((NUM_NODES, NUM_NODES), "position", Binary)


def is_edge_used(u: int, v: int):
    """返回"边 (u, v) 被环游使用"的 0/1 表达式（末位绕回首位）。

    Args:
        u (int): 边的起点编号。
        v (int): 边的终点编号。

    Returns:
        Expression: 起终点在环游中相邻时为 1，否则为 0。
    """
    return quicksum(
        [position[u, j] * position[v, (j + 1) % NUM_NODES] for j in range(NUM_NODES)]
    )


# 无向距离：两个相邻方向都要计入，否则只统计了部分的边
route_cost = quicksum(
    [
        DISTANCE[u, v] * (is_edge_used(u, v) + is_edge_used(v, u))
        for u in range(NUM_NODES)
        for v in range(u + 1, NUM_NODES)
    ]
)
# 二次罚项显式写进目标；add_constraint 只登记（penalty=0），供后面校验
penalty = PENALTY * (
    quicksum([(position.sum(axis=0)[j] - 1) ** 2 for j in range(NUM_NODES)])
    + quicksum([(position.sum(axis=1)[u] - 1) ** 2 for u in range(NUM_NODES)])
)

model = QuboModel()
model.set_objective(route_cost + penalty)
model.add_constraint(position.sum(axis=0) == 1, "sequence_cons", penalty=0.0)
model.add_constraint(position.sum(axis=1) == 1, "node_cons", penalty=0.0)
model.set_constraint_handler(PenaltyMethodConstraint)

ising_matrix, _offset = qubo_matrix_to_ising_matrix(model.get_matrix())

np.random.seed(0)
solver = SimulatedAnnealingOptimizer(
    initial_temperature=100,
    alpha=0.999,
    cutoff_temperature=0.001,
    iterations_per_t=200,
    size_limit=30,
    rand_seed=0,
)
solutions = np.asarray(solver.solve(ising_matrix))

# 解还原必须用 Ising 模型的变量字典（含尾部参考自旋）
ising_variables = qubo_model_to_ising_model(model).get_variables()
best_cost, best_path = None, None
for row in solutions:
    spins = row[:-1] * row[-1]                       # 去尾列并施加参考自旋
    sol_dict = get_sol_dict(spins, ising_variables)
    unsatisfied, _ = model.verify_constraint(sol_dict)
    if unsatisfied:
        continue
    cost = get_val(route_cost, sol_dict)             # 只评估原始目标，不含罚项
    if best_cost is None or cost < best_cost:
        best_cost = cost
        assign = np.asarray(get_array_val(position, sol_dict))
        best_path = np.array(np.nonzero(assign.T)[1])

print("unsatisfied-aware best tour:", best_path, "cost:", best_cost)
```
