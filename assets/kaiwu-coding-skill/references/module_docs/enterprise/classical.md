# kaiwu.classical 模块参考（Enterprise 1.4.0 源码树）

> 提供一系列经典求解器

生成自源码 docstring：`kaiwu-sdk-enterprise\src\kaiwu\classical`。

## 子模块

| 源文件 | 模块说明 |
|---|---|
| `_brute_force.py` | ising矩阵暴力求解器 |
| `_simulated_annealing.py` | 提供模拟退火求解器 |
| `_tabu_search.py` | 该求解器算法参照 Fred Glover, Gary A. Kochenberger, Bahram Alidaee, (1998) Adaptive Memory Tabu Search for Binary Quadratic Programs. Management Science 44(3):336-345. 修改 部分术语 constructive phase: 在此相位中，用基于贪心算法的禁忌搜索将-1的spin翻成+1 destructive phase: 在此相位中，用基于贪心算法的禁忌搜索将+1的spin翻成-1 critical event: 如果下一次翻转造成能量上升，则本次操作为critical event span: 控制spin在critical event后继续翻转的参数 recency tabu: 避免最近刚翻转过的spin被再次翻转 frequency tabu: 避免搜索在critical events中出现频率最高的配置 |

### BruteForceOptimizer

```python
class BruteForceOptimizer(IsingSolver, QuboSolver)
```

求解Ising模型矩阵的暴力求解器，慢而准.


### SimulatedAnnealingOptimizer

```python
class SimulatedAnnealingOptimizer(IsingSolver, QuboSolver, JsonSerializableMixin)
SimulatedAnnealingOptimizer(initial_temperature=100, alpha=0.99, cutoff_temperature=0.001, iterations_per_t=10, size_limit=100, flag_evolution_history=False, verbose=False, rand_seed=None, process_num=1)
```

```text
求解Ising模型的模拟退火求解器（输出结果具有随机性）.

Args:
    initial_temperature (float): 初始温度.

    alpha (float): 降温系数.

    cutoff_temperature (float): 截止温度.

    iterations_per_t (int): 每个温度迭代深度.

    size_limit (int): 输出解的个数，默认输出100个解

    flag_evolution_history (bool): 是否输出哈密顿量演化历史，默认False，当值为True时，通过get_ha_history方法获取演化历史

    verbose (bool): 是否在控制台输出计算进度，默认False

    rand_seed (int, optional): numpy随机数生成器的随机种子

    process_num (int, optional): 并行进程数 (-1为自动调用所有可用核心，1为单进程). Defaults to 1.

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> matrix = -np.array([[ 0. ,  1. ,  0. ,  1. ,  1. ],
    ...                     [ 1. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 0. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 1. ,  1.,   1. ,  0. ,  1. ],
    ...                     [ 1. ,  1.,   1. ,  1. ,  0. ]])
    >>> worker = kw.classical.SimulatedAnnealingOptimizer(initial_temperature=100,
    ...                                                   alpha=0.99,
    ...                                                   cutoff_temperature=0.001,
    ...                                                   iterations_per_t=10,
    ...                                                   size_limit=10)
    >>> # This value is random and cannot be predicted
    >>> worker.solve(matrix) # doctest: +SKIP
    array([[-1,  1, -1,  1,  1],
           [-1,  1,  1, -1,  1],
           [-1,  1,  1, -1, -1],
           [ 1, -1, -1,  1,  1],
           [ 1, -1,  1, -1,  1],
           [ 1, -1,  1, -1, -1],
           [ 1, -1, -1, -1,  1],
           [ 1, -1,  1,  1, -1],
           [ 1,  1,  1, -1, -1],
           [-1, -1, -1,  1,  1]])
```

#### 方法

**on_matrix_change()**
更新矩阵相关信息

**get_ha_history()**
```text
获取哈密顿量演化历史

Returns:
    dict: 哈密顿量随时间演化历史，key是时间，单位为秒，value是 hamilton
```

**single_process_solve(ising_matrix=None, init_solution=None, rand_seed=None)**
```text
单进程求解Ising矩阵

Args:
    ising_matrix (np.ndarray, optional): Ising矩阵. Defaults to None.

    init_solution (np.ndarray, optional): 初始解向量. Defaults to None.

    rand_seed (int, optional): numpy随机数生成器的随机种子

Returns:
    np.ndarray: 解向量
```


### TabuSearchOptimizer

```python
class TabuSearchOptimizer(IsingSolver, QuboSolver)
TabuSearchOptimizer(max_iter, recency_size=None, kmax=3, span_control_p1=3, span_control_p2=7, size_limit=1)
```

```text
求解Ising模型的禁忌搜索求解器.

Args:
    max_iter (int): 最大迭代次数

    recency_size (int): recency禁忌表的大小。如输入为空，则使用矩阵边长的1/10向上取整。

    kmax (int): 模型参数变量k的最大值。默认值为3。

    span_control_p1 (int): 影响span变化的参数p1.默认值为3。

    span_control_p2 (int): 影响span变化的参数p2.默认值为7。

    size_limit (int): 维护解集的大小

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> matrix = -np.array([[ 0. ,  1. ,  0. ,  1. ,  1. ],
    ...                     [ 1. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 0. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 1. ,  1.,   1. ,  0. ,  1. ],
    ...                     [ 1. ,  1.,   1. ,  1. ,  0. ]])
    >>> worker = kw.classical.TabuSearchOptimizer(10, size_limit=1)
    >>> worker.solve(matrix) # doctest: +SKIP
    array([[ 1,  1,  1, -1, -1]])
```

#### 方法

**set_matrix(ising_matrix)**
设置矩阵并更新相关内容

**init_solution(solution)**
```text
初始化解向量

Args:
    solution (np.ndarray): 初始解向量
```

**solve(ising_matrix=None, negtail_flip=True, sort_solutions=False, solution=None)**
```text
求解接口，调用_solve方法

Args:
    ising_matrix (np.ndarray, optional): Ising矩阵. 默认为None.

    negtail_flip (bool): 是否进行负尾翻转

    sort_solutions (bool): 是否对解进行排序

    solution (np.ndarray, optional): 初始解向量. 默认为None.

Returns:
    np.ndarray: 解向量
```


