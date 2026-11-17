# kaiwu.preprocess 模块参考（Enterprise 1.4.0 源码树）

> 预处理相关功能，目前主要是针对ising矩阵的精度相关函数

生成自源码 docstring：`kaiwu-sdk-enterprise\src\kaiwu\preprocess`。

## 子模块

| 源文件 | 模块说明 |
|---|---|
| `_bound.py` | 估计Ising模型的上下界 |
| `_precision.py` | 提供Ising矩阵精度校验相关功能 |
| `_precision_adaption_mutate.py` | QUBO模型系数动态范围，满足真机位宽限制 |
| `_precision_adaption_split.py` | QUBO模型系数动态范围，满足真机位宽限制 |
| `_precision_reducer.py` | 提供CIMOptimizer降低精度的装饰类 |
| `_range_heuristic.py` | 提供选择系数变化量的启发式算法 |
| `_utils.py` | 局部赋值 |

### PrecisionReducer

```python
class PrecisionReducer(IsingSolver, QuboSolver)
PrecisionReducer(component, precision=8, target_bits=None, only_feasible_solution=False, truncated_precision=20)
```

```text
降低精度装饰类

通过精度归约和矩阵分裂技术，将大规模或高精度Ising矩阵转换为
可在有限比特精度SPQC设备上求解的形式。
先截断后split，如果split后精度仍不满足要求则直接截断至目标精度。

适用场景:
    - 矩阵系数精度过高（如含小数1.23或大数10000.0）超出设备表示范围
    - 矩阵规模过大，需要进行split降维

可打开日志看到详细输出：kw.common.set_log_level("DEBUG")

Args:
    component (IsingSolver): 基础求解器，如SimulatedAnnealingOptimizer

    precision (int): 矩阵目标精度（小数位数），控制矩阵分裂后的精度

    target_bits (int): 矩阵目标比特数，默认为None不进行控制

    only_feasible_solution (bool): 是否只要可行解，默认为False。
        当only_feasible_solution=True且所有解都不是可行解时会抛出异常KaiwuError

    truncated_precision (int): 截断精度，与 precision 的差值越大，矩阵分裂后新增的变量数越多。

Example1 (基本用法：降低矩阵精度):
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> matrix = -np.array([[0., 1.23, 0., 1., 1.],
    ...                     [1.23, 0., 0., 1., 1.],
    ...                     [0., 0., 0., 1., 1.],
    ...                     [1., 1., 1., 0., 1.],
    ...                     [1., 1., 1., 1., 0.]])
    >>> optimizer = kw.classical.SimulatedAnnealingOptimizer(
    ...     initial_temperature=100, alpha=0.99,
    ...     cutoff_temperature=0.001, iterations_per_t=10
    ... )
    >>> new_optimizer = kw.preprocess.PrecisionReducer(
    ...     optimizer, precision=4
    ... )
    >>> solutions = new_optimizer.solve(matrix)

Example2 (处理高精度/大系数矩阵):
    >>> matrix2 = -np.array([[0., 1.23, 0., 1., 10000.],
    ...                      [1.23, 0., 0., 1., 1.],
    ...                      [0., 0., 0., 1., 1.],
    ...                      [1., 1., 1., 0., 1.],
    ...                      [10000., 1., 1., 1., 0.]])
    >>> new_optimizer2 = kw.preprocess.PrecisionReducer(
    ...     optimizer, precision=4, only_feasible_solution=False
    ... )
    >>> solutions = new_optimizer2.solve(matrix2)

Example3 (控制目标比特数):
    >>> new_optimizer3 = kw.preprocess.PrecisionReducer(
    ...     optimizer, precision=4, target_bits=10
    ... )
```


### adjust_ising_matrix_precision
```python
adjust_ising_matrix_precision(ising_matrix, bit_width=8)
```

```text
调整 ising 矩阵精度, 通过此接口调整后矩阵可能会有较大的精度损失，比如矩阵有一个数远大于其它数时，调整后矩阵精度损失严重无法使用

Args:
    ising_matrix(np.ndarray): 目标矩阵

    bit_width(int): 精度范围，目前只支持8位，有一位是符号位

Returns:
    np.ndarray: 符合精度要求的 ising 矩阵

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> ori_ising_mat1 = np.array([[0, 0.22, 0.198],
    ...                            [0.22, 0, 0.197],
    ...                            [0.198, 0.197, 0]])
    >>> ising_mat1 = kw.preprocess.adjust_ising_matrix_precision(ori_ising_mat1)
    >>> ising_mat1
    array([[  0, 127, 114],
           [127,   0, 114],
           [114, 114,   0]])
    >>> ori_ising_mat2 = np.array([[0, 0.22, 0.198],
    ...                            [0.22, 0, 50],
    ...                            [0.198, 50, 0]])
    >>> ising_mat2 = kw.preprocess.adjust_ising_matrix_precision(ori_ising_mat2)
    >>> ising_mat2  # The solutions obtained by qubo_mat2 and ori_qubo_mat2 matrices are quite different
    array([[  0,   1,   1],
           [  1,   0, 127],
           [  1, 127,   0]])
```

### adjust_qubo_matrix_precision
```python
adjust_qubo_matrix_precision(qubo_matrix, bit_width=8)
```

```text
调整矩阵精度, 通过此接口调整后矩阵可能会有较大的精度损失，比如矩阵有一个数远大于其它数时，调整后矩阵精度损失严重无法使用

Args:
    qubo_matrix (np.ndarray): 目标矩阵

    bit_width (int): 精度范围，目前只支持8位，有一位是符号位

Returns:
    np.ndarray: 符合精度要求的QUBO矩阵

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> ori_qubo_mat1 = np.array([[0.89, 0.22, 0.198],
    ...                      [0.22, 0.23, 0.197],
    ...                      [0.198, 0.197, 0.198]])
    >>> qubo_mat1 = kw.preprocess.adjust_qubo_matrix_precision(ori_qubo_mat1)
    >>> qubo_mat1
    array([[348., 168., 152.],
           [ -0.,  92., 152.],
           [ -0.,  -0.,  80.]])
    >>> ori_qubo_mat2 = np.array([[0.89, 0.22, 0.198],
    ...                           [0.22, 0.23, 0.197],
    ...                           [0.198, 0.197, 100]])
    >>> qubo_mat2 = kw.preprocess.adjust_qubo_matrix_precision(ori_qubo_mat2)
    >>> qubo_mat2  # The solutions obtained by qubo_mat2 and ori_qubo_mat2 matrices are quite different
    array([[  8.,  -0.,  -0.],
           [ -0.,   4.,  -0.],
           [ -0.,  -0., 508.]])
```

### calculate_ising_matrix_bit_width
```python
calculate_ising_matrix_bit_width(ising_matrix, bit_width=8)
```

```text
计算 ising 矩阵的参数位宽

Args:
    ising_matrix (np.ndarray): ising 矩阵

    bit_width (int): 最大位宽限制

Returns:
    dict: 返回Ising矩阵的精度和缩放因子

        - precision (int): Ising矩阵精度
        - multiplier (float): 缩放因子

示例1:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> _matrix = -np.array([[ -0., 127., -12.,  -5.],
    ...                      [127.,  -0., -12., -12.],
    ...                      [-12., -12.,  -0.,  -9.],
    ...                      [ -5., -12.,  -9.,  -0.]])
    >>> kw.preprocess.calculate_ising_matrix_bit_width(_matrix)
    {'precision': 8, 'multiplier': np.float64(1.0)}

示例2（缩放后符合要求）:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> _matrix = -np.array([[ -0., 12.7, -1.2,  -0.5],
    ...                      [12.7,  -0., -1.2, -1.2],
    ...                      [-1.2, -1.2, -0.,   -0.9],
    ...                      [-0.5, -1.2, -0.9,  -0.]])
    >>> kw.preprocess.calculate_ising_matrix_bit_width(_matrix)
    {'precision': 8, 'multiplier': np.float64(10.0)}

示例3(缩放后也不符合要求):
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> _matrix = -np.array([[-488.,  516.,  -48.],
    ...                      [ 516., -516.,  -48.],
    ...                      [ -48.,  -48.,   60.]])
    >>> kw.preprocess.calculate_ising_matrix_bit_width(_matrix)
    {'precision': inf, 'multiplier': inf}
```

### calculate_qubo_matrix_bit_width
```python
calculate_qubo_matrix_bit_width(qubo_matrix, bit_width=8)
```

```text
校验QUBO矩阵元素位宽

将QUBO矩阵转为伊辛矩阵，通过校验伊辛矩阵的元素位宽来实现对QUBO矩阵的校验

Args:
    qubo_matrix (np.ndarray): QUBO矩阵

    bit_width (int): 位宽

Returns:
    np.ndarray: 符合精度要求的 ising 矩阵

Examples1:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> _matrix = -np.array([[-480., 508., -48.],
    ...                      [ 508., -508., -48.],
    ...                      [ -48., -48., 60.]])
    >>> kw.preprocess.calculate_qubo_matrix_bit_width(_matrix)
    {'precision': 8, 'multiplier': np.float64(1.0)}

Examples2（缩放后符合要求）:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> _matrix = -np.array([[-512.,  520.,  -48.],
    ...                      [ 520., -520.,  -48.],
    ...                      [ -48.,  -48.,   40.]])
    >>> kw.preprocess.calculate_qubo_matrix_bit_width(_matrix)
    {'precision': 8, 'multiplier': np.float64(0.5)}

Examples3(缩放后也不符合要求):
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> _matrix = -np.array([[-488.,  516.,  -48.],
    ...                      [ 516., -516.,  -48.],
    ...                      [ -48.,  -48.,   60.]])
    >>> kw.preprocess.calculate_qubo_matrix_bit_width(_matrix)
    {'precision': inf, 'multiplier': inf}
```

### construct_split_solution
```python
construct_split_solution(solution, last_var_idx)
```

```text
将原矩阵分拆变量降低参数精度后，根据原矩阵的解构造新矩阵的解

Args:
    solution (np.ndarray): 原矩阵的解

    last_var_idx (np.ndarray): 分拆后每个变量最后一次出现的位置

Returns:
    np.ndarray: 新矩阵的解

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> mat = np.array([[0, -15, 0, 40],
    ...                 [-15, 0, 0, 2],
    ...                 [0, 0, 0, 0],
    ...                 [40, 2, 0, 0]])
    >>> nmat, tail = kw.preprocess.perform_precision_adaption_split(mat, 5, min_increment=0.5,
    ...                                                             round_to_increment=True,
    ...                                                             penalty=0)
    >>> sol = np.array([1, 1, -1, -1])
    >>> ans = np.array([1, 1, 1, 1, -1, -1, -1, -1])
    >>> kw.preprocess.construct_split_solution(sol, tail)
    array([ 1.,  1.,  1.,  1., -1., -1., -1., -1.])
```

### get_dynamic_range_metric
```python
get_dynamic_range_metric(mat)
```

```text
计算动态范围值（dynamic range, DR）

:math:`DR(Q) = log(max_{i,j}|Q_i - Q_j|/min_{Q_i \neq Q_j}|Q_i-Q_j|)`

Args:
    mat: Ising或QUBO矩阵

Returns:
    float: 动态范围

Examples:
    >>> import numpy as np
    >>> mat = np.array([[0, 8, 1 ,1],
    ...                 [0, 0, 2, -1],
    ...                 [0, 0, 0, -8],
    ...                 [0, 0, 0, 0]])
    >>> import kaiwu as kw
    >>> kw.preprocess.get_dynamic_range_metric(mat)
    np.float64(4.0)
```

### get_min_diff
```python
get_min_diff(mat)
```

```text
计算最小差值

Args:
    mat: Ising或QUBO矩阵

Returns:
    float: 最小差值

Examples:
    >>> import numpy as np
    >>> mat = np.array([[0, 8, 1 ,1],
    ...                 [0, 0, 2, -1],
    ...                 [0, 0, 0, -8],
    ...                 [0, 0, 0, 0]])
    >>> import kaiwu as kw
    >>> kw.preprocess.get_min_diff(mat)
    np.int64(1)
```

### lower_bound_parameters
```python
lower_bound_parameters(ising_mat)
```

```text
所有系数绝对值的和取负，确定Ising模型哈密顿量的下界

Args:
    ising_mat (np.ndarray): Ising矩阵

Returns:
    float: 哈密顿量的下界

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> mat = np.array([[0, 18, -12],
    ...                 [18, 0, 1],
    ...                 [-12, 1, 0]])
    >>> lb = kw.preprocess.lower_bound_parameters(mat)
    >>> lb
    np.int64(-62)
```

### perform_precision_adaption_mutate
```python
perform_precision_adaption_mutate(ising_matrix, iterations=100, heuristic='greedy', decision='heuristic')
```

```text
迭代减小Ising矩阵的动态范围，每次改变一个系数，保持最优解不变。思路参考
`Mücke et al. (2023) <http://arxiv.org/abs/2307.02195>`_.
此方法会改变矩阵系数数值，但不保证一定能降低精度。可做探索性尝试

Args:
    ising_matrix (np.ndarray): Ising矩阵

    iterations (int, optional): 迭代次数，默认为100

    heuristic (str, optional): 确定系数变化量的启发式方法，包括'greedy'和'order'。默认为'greedy'

    decision (str, optional): 决定下一个修改位置的方法。包括'random'和'heuristic'。'heuristic'会优先选择直接影响动态范围的变量。
    默认为'heuristic'。

Returns:
    np.ndarray: 压缩参数的Ising矩阵

Examples:
    >>> import numpy as np
    >>> mat0 = np.array([[0., -10., 0., 20., 0.55],
    ...    [-10., 0.,  6120., 0.5, 60.],
    ...    [0.,  6120., 0.,   0., -5120.],
    ...    [20.,  0.5,  0.,   0., 1.025],
    ...    [0.55, 60., -5120., 1.025, 0.]])
    >>> import kaiwu as kw
    >>> kw.preprocess.perform_precision_adaption_mutate(mat0) # doctest: +SKIP
    array([[ 0.  , -2.05,  0.  , 40.  ,  0.  ],
           [-2.05,  0.  ,  4.1 ,  0.  ,  0.  ],
           [ 0.  ,  4.1 ,  0.  ,  0.  , -2.05],
           [40.  ,  0.  ,  0.  ,  0.  ,  2.05],
           [ 0.  ,  0.  , -2.05,  2.05,  0.  ]])
```

### perform_precision_adaption_split
```python
perform_precision_adaption_split(ising_matrix, param_bit=8, min_increment=None, penalty=None, round_to_increment=True)
```

```text
将变量拆分, 使得QUBO表达式的系数范围缩小, 能够使用要求的比特数表达

Args:
    ising_matrix (np.ndarray): Ising矩阵

    param_bit (int): Ising矩阵元素可以使用的比特数，表示矩阵的参数精度。默认为8

    min_increment (float): 矩阵元素的最小变化量，表示转化后矩阵的分辨率。默认值取矩阵元素间差值的最小正值

    penalty (float): 惩罚项系数， 默认为min_increment * (2^(param_bit-1) - 1)

    round_to_increment (bool): 将矩阵的所有元素转化为min_increment的整数倍，使得其可以用不超过param_bit的比特数表达

Returns:
    tuple: 返回元组，包含新矩阵和变量索引
        - np.ndarray: 包含缩小范围的新矩阵。新矩阵单个元素并不一定在精度范围内，但是整体除以min_increment后会在精度范围内

        - np.ndarray: 变量分拆后该变量第一次出现的位置

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> mat = np.array([[0, 18, -12],
    ...                 [18, 0, 1],
    ...                 [-12, 1, 0]])
    >>> kw.preprocess.perform_precision_adaption_split(mat, param_bit=5, min_increment=1, penalty=4,
    ...        round_to_increment=True)
    (array([[ 0.,  4.,  3.,  5., -6.],
           [ 4.,  0.,  5.,  5., -6.],
           [ 3.,  5.,  0.,  4.,  0.],
           [ 5.,  5.,  4.,  0.,  1.],
           [-6., -6.,  0.,  1.,  0.]]), array([1, 3, 4]))
```

### restore_split_solution
```python
restore_split_solution(solution, last_var_idx)
```

```text
将缩小范围多项式的解转换回原来的表达式的解

Args:
    solution(np.ndarray): 求得的解

    last_var_idx(np.ndarray): 分拆后每个变量最后一次出现的位置

Returns:
    np.ndarray: 原多项式的解

Examples:
    >>> import kaiwu as kw
    >>> import numpy as np
    >>> mat = np.array([[0, -15, 0, 30],
    ...                [-15, 0, 0, 2],
    ...                [0, 0, 0, 0],
    ...                [30, 2, 0, 0]])
    >>> r, f = kw.preprocess.perform_precision_adaption_split(mat, 5, min_increment=0.5, round_to_increment=True)
    >>> worker = kw.classical.SimulatedAnnealingOptimizer()
    >>> opt = worker.solve(r)
    >>> sol = opt[0] * opt[0, -1]
    >>> kw.preprocess.restore_split_solution(sol, f)  # doctest: +SKIP
    array([ 1, -1, -1,  1], dtype=int8)
```

### upper_bound_sample
```python
upper_bound_sample(ising_matrix, steps=10)
```

```text
基于采样估计哈密顿量的上界

Args:
    ising_matrix (np.ndarray): Ising矩阵

    steps (int): 步数

Returns:
    float: 哈密顿量的上界

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> mat = np.array([[0, 18, -12],
    ...                 [18, 0, 1],
    ...                 [-12, 1, 0]])
    >>> ub = kw.preprocess.upper_bound_sample(mat)
```

### upper_bound_simulated_annealing
```python
upper_bound_simulated_annealing(ising_matrix)
```

```text
基于模拟退火估计哈密顿量的上界

Args:
    ising_matrix (np.ndarray): Ising矩阵

Returns:
    float: 哈密顿量的上界

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> mat = np.array([[0, 18, -12],
    ...                 [18, 0, 1],
    ...                 [-12, 1, 0]])
    >>> ub = kw.preprocess.upper_bound_simulated_annealing(mat)
```

