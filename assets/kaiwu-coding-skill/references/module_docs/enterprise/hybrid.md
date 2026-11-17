# kaiwu.hybrid 模块参考（Enterprise 1.4.0 源码树）

> 提供一系列基于cim/classical中的opitimizer进行求解的solver

生成自源码 docstring：`kaiwu-sdk-enterprise\src\kaiwu\hybrid`。

## 子模块

| 源文件 | 模块说明 |
|---|---|
| `_penalty_method_solver.py` | PenaltyMethodOptimizer |

### PenaltyMethodOptimizer

```python
class PenaltyMethodOptimizer(QuboSolver, JsonSerializableMixin)
PenaltyMethodOptimizer(optimizer, controller)
```

```text
罚函数法

    设置 kw.common.CheckpointManager.save_dir = '/tmp' 会打开缓存开关，当前状态和符合硬约束的惩罚系数组合都会被缓存
    打开缓存后 PenaltyMethodOptimizer 可以在上一次程序终止的基础上继续迭代求解, 程序运行过程中的可行解会保存对应json文件里面 results 中.

Args:
    optimizer (Optimizer): 优化器

    controller (SolverLoopController): 循环控制器

Examples:
    >>> import kaiwu as kw
    >>> import numpy as np
    >>> taskNums = 20
    >>> machineNums = 5
    >>> duration = np.array(range(1, taskNums + 1))
    >>> machine_start_time = np.array(range(1, machineNums + 1))
    >>> # Building a Qubo Model
    >>> qubo_model = kw.core.QuboModel()
    >>> X = kw.core.ndarray([taskNums, machineNums], "X", kw.core.Binary)
    >>> J_mean = (np.sum(duration) + np.sum(machine_start_time)) / machineNums
    >>> J = [machine_start_time[i] + duration.dot(X[:, i]) for i in range(machineNums)]
    >>> # Set objective function
    >>> qubo_model.set_objective(kw.core.quicksum([(J[i] - J_mean) ** 2 for i in range(machineNums)]) / machineNums)
    >>> # Set constraint
    >>> for j in range(taskNums):
    ...     qubo_model.add_constraint(kw.core.quicksum([X[j][i] for i in range(machineNums)]) == 1,
    ...                               f"c{j}", penalty=45)
    >>> # Loop control
    >>> controller = kw.common.SolverLoopController(max_repeat_step=5)
    >>> # optimizer
    >>> optimizer = kw.classical.SimulatedAnnealingOptimizer(initial_temperature=1e8,
    ...                                                      alpha=0.9,
    ...                                                      cutoff_temperature=0.01,
    ...                                                      iterations_per_t=200,
    ...                                                      size_limit=100)
    >>> solver = kw.hybrid.PenaltyMethodOptimizer(optimizer, controller)
    >>> sol_dict, hmt = solver.solve_qubo(qubo_model)
    >>> J_end = np.zeros(machineNums)
    >>> for i in range(machineNums):
    ...     ifturn_temp = kw.core.get_val(kw.core.quicksum(X[:, i].tolist()), sol_dict)
    ...     ifturn = 1 if ifturn_temp > 0 else 0
    ...     J_temp = duration.dot(X[:, i]) + machine_start_time[i] * ifturn
    ...     J_end[i] = kw.core.get_val(J_temp, sol_dict)
    >>> print("duration array: ", duration)  # doctest: +SKIP
    duration array:  [ 1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20]
    >>> print("Machine startup time: ", machine_start_time)  # doctest: +SKIP
    Machine startup time:  [1 2 3 4 5]
    >>> print("End time of all machines：", J_end)  # doctest: +SKIP
    End time of all machines： [43. 43. 48. 45. 46.]
    >>> print('final result：{}'.format(np.max(J_end)))  # doctest: +SKIP
    final result：48.0
    >>> print('variance：', np.var(J_end))   # doctest: +SKIP
    variance: 3.6
    >>> kw.common.CheckpointManager.save_dir = None
```

#### 方法

**solve_qubo(qubo_model)**
```text
求解QUBO模型，返回目标值最低的解(因惩罚系数改变目标值最低的解不一定是最优解)


Args:
    qubo_model (QuboModel): QUBO模型

Returns:
    tuple: QUBO模型解的字典、目标值
```

**solve_qubo_multi_results(qubo_model, size_limit=10)**
```text
求解QUBO模型, 并返回多个解

Args:
    qubo_model (QuboModel): QUBO模型

    size_limit (int): 返回解得数量

Returns:
    list: QUBO模型解SolutionResult的字典、目标值
```

**to_json_dict(exclude_fields=())**

**load_json_dict(json_dict)**


