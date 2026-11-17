# kaiwu.cim 模块参考（Enterprise 1.4.0 源码树）

> 提供一系列SPQC求解器相关工具

生成自源码 docstring：`kaiwu-sdk-enterprise\src\kaiwu\cim`。

## 子模块

| 源文件 | 模块说明 |
|---|---|
| `_cim_optimizer.py` | 提供SPQC求解器 |

### CIMOptimizer

```python
class CIMOptimizer(IsingSolver, QuboSolver)
CIMOptimizer(task_name, wait=False, interval=1, project_no=None, task_mode=TaskMode.OPTIMIZATION, sample_number=10)
```

```text
CIM Optimizer Interface

CIMOptimizer 是一种用于求解 Ising 计算问题的优化器 (Optimizer)，它通过提交任务到
专用量子计算机 (SPQC, Special-Purpose Quantum Computer) 真机进行计算，并返回最优解。

主要功能包括：

1. **任务提交**：将 Ising 矩阵任务上传至 SPQC 计算平台，并创建计算任务。

2. **任务查询**：定期检查任务计算状态，获取计算结果。

3. **缓存管理**：本地缓存已计算任务的结果，避免重复提交。

Args:
    task_name (str): 任务名称

    wait (bool, optional): 是否等待计算完成，默认为 False。

    interval (int, optional): 轮询间隔时间（分钟），默认值为 1，最小值 1 分钟。

    project_no (str, optional): 项目编号，值为CPQC-X中项目列表的项目ID, 用于创建项目下的任务

    task_mode (str): 计算模式，默认为TaskMode.OPTIMIZATION, 可选值为 TaskMode.OPTIMIZATION, TaskMode.SAMPLING

    sample_number (int): 采样次数, task_mode=TaskMode.SAMPLING时必填，默认值10，最小值10， 最大值2000


Example:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> from kaiwu.cim import TaskMode
    >>> kw.common.CheckpointManager.save_dir = '/tmp'
    >>> matrix = -np.array([[ 0. ,  1. ,  0. ,  1. ,  1. ],
    ...                     [ 1. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 0. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 1. ,  1.,   1. ,  0. ,  1. ],
    ...                     [ 1. ,  1.,   1. ,  1. ,  0. ]])
    >>> optimizer = kw.cim.CIMOptimizer(
    ...                task_name='cim_optimizer_test',
    ...                task_mode=TaskMode.OPTIMIZATION
    ...             )  # doctest: +SKIP
    >>> solution = optimizer.solve(matrix)  # doctest: +SKIP
    >>> print(solution)  # doctest: +SKIP
    array([[-1,  1,  1, -1, -1],
           [-1,  1,  1,  1, -1],
           [-1,  1,  1, -1,  1],
           [ 1, -1, -1, -1,  1],
           [ 1, -1,  1,  1, -1],
           [ 1, -1,  1, -1,  1],
           [ 1, -1,  1, -1, -1],
           [ 1, -1, -1,  1,  1],
           [-1, -1, -1,  1,  1],
           [ 1,  1,  1, -1, -1]], dtype=int8)
    >>> kw.common.CheckpointManager.save_dir = None

Notes:
    1. 需要通过 `CheckpointManager` 设置中间文件保存路径 (`save_dir`)。
    2. 任务的唯一标识由 `ising_matrix` 和 `task_name` 共同决定，任何一项的变化都会创建新的任务。
    3. 同一个矩阵可以通过修改 `task_name` 创建不同的任务，若仅需查询结果，请确保 `task_name` 不变。
    4. 实例化CIMOptimizer时 `task_name` 必传
```

#### 方法

**get_task_result(ising_matrix)**
获取任务结果


### TaskMode

```python
class TaskMode
```

```text
任务模式

OPTIMIZATION: 优化模式。原QUOTA模式
SAMPLING: 采样模式。原SAMPLE模式
```


