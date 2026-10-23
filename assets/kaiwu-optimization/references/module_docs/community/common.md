# kaiwu.common 模块参考（Community 1.0.7）

> 通用工具集合

生成自源码 docstring：`kaiwu_community\src\kaiwu\common`。

## 子模块

| 源文件 | 模块说明 |
|---|---|
| `_argpartition_unique_solution_pool.py` | 求解器的解集 |
| `_checkpoint.py` | 管理 checkpoint 保存的路径和各个对象 checkpoint 的命名。 该模块提供了一个 `CheckpointManager` 类，用于管理 checkpoint 的保存路径和命名规则。 通过设置 `CheckpointManager.save_dir`，可以指定 checkpoint 的保存目录。 |
| `_heap_unique_solution_pool.py` | 求解器的解集 |
| `_json_serializable_mixin.py` | SDK 公用模块 |
| `_logger.py` | 日志 |
| `_loop_controller.py` | 循环控制器等一些辅助求解工具 |
| `_util.py` | 一些简单的工具 |

### ArgpartitionUniquePool

```python
class ArgpartitionUniquePool
ArgpartitionUniquePool(mat, size, size_limit)
```

解集。使用argpartition的线性期望复杂度k小值来进行维护

#### 方法

**extend(solutions, final=False)**
插入多个解

**get_solutions()**
获取解集

**clear()**
清空解集

**to_json_dict()**
```text
转化为json字典

Returns:
    dict: json字典
```

**from_json_dict(json_dict)**
```text
从json文件读取的dict构造HeapUniquePool对象

Args:
    json_dict (dict): json字典

Returns:
    ArgpartitionUniquePool: 对象实例
```


### BaseLoopController

```python
class BaseLoopController(JsonSerializableMixin)
BaseLoopController(max_repeat_step=math.inf, target_objective=-math.inf, no_improve_limit=math.inf, iterate_per_update=5)
```

```text
循环控制器，并计算时间。用于调试和测试算法

Args:
    max_repeat_step: 最大步数，默认值为math.inf

    target_objective: 目标优化函数，达到即停止，默认值为-math.inf

    no_improve_limit: 收敛条件，指定更新次数没有改进则停止，默认值为math.inf

    iterate_per_update: 每次更新哈密顿量前运行的次数，默认值为5
```

#### 方法

**update_status(objective, unsatisfied_constraints_count=None)**
```text
在计算子问题后更新状态

Args:
    objective (float): 目标函数值

    unsatisfied_constraints_count (int): 未满足约束项的数量
```

**is_finished()**
```text
判断是否应该停止

Returns:
    bool: 是否应该停止
```

**restart()**
重新初始化计数

**to_json_dict(exclude_fields=('timer',))**
```text
转化为json字典

Returns:
    dict: json字典
```


### CheckpointManager

```python
class CheckpointManager
```

```text
管理 checkpoint, 保存对象的运行状态，用于后续断点处恢复运行
通过设置 `CheckpointManager.save_dir`，可以指定 checkpoint 的保存目录。

Args:
    save_dir (str): checkpoint 的保存目录。
```

#### 方法

**get_path(obj)**
```text
获取对象checkpoint的路径

Args:
    obj (Object): 保存的对象

Returns:
    str: checkpoint路径
```

**load(obj)**
```text
加载串行化的对象

Args:
    obj (Object): 保存的对象

Returns:
    str: json dict形式的对象
```

**dump(obj)**
```text
对象串行化后存储在磁盘上

Args:
    obj (Object): 保存的对象

Returns:
    None
```


### HeapUniquePool

```python
class HeapUniquePool(JsonSerializableMixin)
HeapUniquePool(mat, size, size_limit)
```

解集。使用堆来进行维护

#### 方法

**extend(solutions)**
插入多个解

**push(solution, hamilton)**
添加一个解

**get_solutions()**
返回维护的解，个数为self.size_limit

**clear()**
清空解集

**to_json_dict(exclude_fields=None)**
```text
转化为json字典

Returns:
    dict: json字典
```

**load_json_dict(json_dict)**
```text
从json文件读取的dict构造HeapUniquePool对象

Args:
    json_dict (dict): json字典

Returns:
    HeapUniquePool: 对象实例
```


### JsonSerializableMixin

```python
class JsonSerializableMixin
```

序列化器

#### 方法

**to_json_dict(exclude_fields=('_optimizer',))**
```text
转化为json字典

Returns:
    dict: json字典
```

**load_json_dict(json_dict)**
```text
从json文件读取的dict恢复对象

Returns:
    dict: json字典
```


### OptimizerLoopController

```python
class OptimizerLoopController(BaseLoopController)
OptimizerLoopController(max_repeat_step=math.inf, target_objective=-math.inf, no_improve_limit=20000, iterate_per_update=5)
```

```text
Optimizer循环控制器，并计算时间。用于调试和测试算法

Args:
    max_repeat_step: 最大步数，默认值为math.inf

    target_objective: 目标优化函数，达到即停止，默认值为-math.inf

    no_improve_limit: 收敛条件，指定更新次数没有改进则停止，默认值为20000

    iterate_per_update: 每次更新哈密顿量前运行的次数，默认值为5
```


### SolverLoopController

```python
class SolverLoopController(BaseLoopController, JsonSerializableMixin)
SolverLoopController(max_repeat_step=math.inf, target_objective=-math.inf, no_improve_limit=math.inf, iterate_per_update=5, stop_after_feasible_count=None)
```

```text
Solver循环控制器，并计算时间。用于调试和测试算法

Args:
    max_repeat_step (int): 最大步数，默认值为math.inf

    target_objective (float): 目标优化函数，达到即停止，默认值为-math.inf

    no_improve_limit (int): 收敛条件，指定更新次数没有改进则停止，默认值为20000

    iterate_per_update (int): 每次更新哈密顿量前运行的次数，默认值为5

    stop_after_feasible_count (int): 找到指定数量的可行解后停止
```

#### 方法

**update_status(objective, unsatisfied_constraints_count=None)**
```text
在计算子问题后更新状态

Args:
    objective (float): 目标函数值

    unsatisfied_constraints_count (int): 未满足约束项的数量
```

**is_finished()**
```text
判断是否应该停止

Returns:
    bool: 是否应该停止
```


### check_symmetric
```python
check_symmetric(mat, tolerance=1e-08)
```

检查矩阵是否为对称矩阵，允许一定误差

### hamiltonian
```python
hamiltonian(ising_matrix, c_list)
```

```text
计算哈密顿量.

Args:
    ising_matrix (np.ndarray): Ising 矩阵.

    c_list (np.ndarray): 要计算哈密顿量的变量组合集合.

Returns:
    np.ndarray: 哈密顿量集合.

Examples:
    >>> import numpy as np
    >>> from kaiwu.common import hamiltonian
    >>> ising_matrix = -np.array([[ 0. ,  1. ,  0. ,  1. ,  1. ],
    ...                     [ 1. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 0. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 1. ,  1.,   1. ,  0. ,  1. ],
    ...                     [ 1. ,  1.,   1. ,  1. ,  0. ]])
    >>> c_list = np.array([[1, 1, 1, 1, 1], [1, -1, 1, -1, 1]])
    >>> h = hamiltonian(ising_matrix, c_list)   # doctest: +SKIP
```

### set_log_level
```python
set_log_level(level)
```

```text
设置SDK日志输出级别

SDK默认输出INFO级别以上的日志，可通过此函数修改输出级别

Args:
    level (str or int): 支持传入 logging.ERROR， logging.INFO、... 、logging.ERROR或字符串ERROR、INFO、... 、ERROR

Examples:
    >>> import kaiwu as kw
    >>> kw.common.set_log_level(level="DEBUG")  # doctest: +SKIP
```

### set_log_path
```python
set_log_path(path='/tmp/output.log')
```

```text
设置SDK日志输出文件路径, 需要绝对路径.

Args:
    path (str): 自定义日志文件输出路径

Examples:
    >>> import kaiwu as kw
    >>> kw.common.set_log_path("/tmp/output.log")  # doctest: +SKIP
```

