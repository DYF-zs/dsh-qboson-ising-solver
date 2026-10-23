# kaiwu.core 模块参考（Community 1.0.7）

> 基础类的定义

生成自源码 docstring：`kaiwu_community\src\kaiwu\core`。

## 子模块

| 源文件 | 模块说明 |
|---|---|
| `_base_solver.py` | 基础模块 Optimizer base class |
| `_binary_expression.py` | BinaryExpression Binary变量构成的表达式 |
| `_binary_model.py` | Binary Model基础类 |
| `_constraint.py` | 提供约束项基础定义类 |
| `_error.py` | SDK root error |
| `_expression.py` | QUBO及Ising表达式运算类 |
| `_get_val.py` | QUBO还原变量值 |
| `_ising.py` | ising模型及其转化 |
| `_matrix.py` | 时间: 2021-07-07 作者: wangyong@boseq.com |
| `_matrix_converter.py` | QUBO矩阵和Ising矩阵相关转化 |
| `_model_converter.py` | QUBO模型和Ising模型转换 |
| `_penalty_method_constraint.py` | 生成基于penalty method的约束项 |
| `_qubo_model.py` | 提供QUBOModel相关的功能 |

### Binary

```python
class Binary(BinaryExpression)
Binary(name='')
```

二进制变量, 只保存变量名，不继承 QuboExpression

#### 方法

**clear()**


### BinaryExpression

```python
class BinaryExpression(Expression)
```

QUBO表达式的基础数据结构

#### 方法

**feed(feed_dict)**
```text
为占位符号赋值, 并返回赋值后的新表达式对象

Args:
    feed_dict(dict): 需要赋值的占位符的值

Examples:
    >>> import kaiwu as kw
    >>> p = kw.core.Placeholder('p')
    >>> a = kw.core.Binary('a')
    >>> y = p * a
    >>> str(y)  # doctest: +NORMALIZE_WHITESPACE
    '(p)*a'
    >>> y= y.feed({'p': 2})
    >>> str(y)  # doctest: +NORMALIZE_WHITESPACE
    '2*a'
```


### BinaryExpressionNDArray

```python
class BinaryExpressionNDArray(np.ndarray)
```

```text
基于 np.ndarray 的QUBO容器.
该容器支持各种 numpy 原生的向量化运算
```

#### 方法

**dot(b, out=None)**
```text
使用quicksum的矩阵乘法

Args:
    b (BinaryExpressionNDArray): 另一个矩阵

    out: 可选输出数组，用于存储结果。需与预期输出形状一致。
Returns:
    BinaryExpressionNDArray: 乘积
```

**sum(axis=None, dtype=None, out=None, keepdims=False, initial=0, where=True)**
```text
使用quicksum的求和方法

Args:
    axis: 指定求和的轴（维度）。默认为 None，表示对所有元素求和；若为整数或元组，则沿指定轴求和。

    dtype: 指定输出数据类型。若未提供，则默认使用输入数组的 dtype，但整数类型可能提升为平台整数精度。暂不支持。

    out: 可选输出数组，用于存储结果。需与预期输出形状一致。

    keepdims: 布尔值。若为 True，则保留被求和的轴作为长度为1的维度。暂不支持 。

    initial: 求和的初始值（标量），默认为0。暂不支持。

    where: 布尔数组，指定哪些元素参与求和（NumPy 1.20+支持）。暂不支持。

Returns:
    BinaryExpressionNDArray: 乘积
```

**get_val(sol_dict)**
```text
根据结果字典将spin值带入qubo数组变量.

Args:
    array (QUBOArray): QUBO数组

    sol_dict (dict): 由get_sol_dict生成的结果字典。

Returns:
    np.ndarray: 带入qubo数组后所得的值数组

Examples:
    >>> import kaiwu as kw
    >>> import numpy as np
    >>> x = kw.core.ndarray((2, 2), "x", kw.core.Binary)
    >>> y = x.sum()
    >>> y_vars = y.get_variables()
    >>> s = np.array([1, -1, 1, -1])
    >>> sol_dict = kw.core.get_sol_dict(s, y_vars)
    >>> x.get_val(sol_dict)
    array([[1., 0.],
           [1., 0.]])
```


### BinaryModel

```python
class BinaryModel
BinaryModel(objective=None)
```

```text
二值模型类

Args:
    objective (BinaryExpression, optional): 目标函数. 默认为None
```

#### 方法

**set_constraint_handler(constraint_handler)**
```text
设置约束项无约束化方法

Args:
    constraint_handler: 设置约束项无约束化表示方法类
```

**set_objective(objective)**
```text
设置目标函数

Args:
    objective (BinaryExpression): 目标函数表达式
```

**add_constraint(constraint_in, name=None, constr_type='hard', penalty=1, slack_var_expr=None)**
```text
添加约束项，支持单个或多个约束

Args:
    constraint_in: 约束表达式，支持两种输入类型:

        1. 单个约束: BinaryExpression 或 Constraint 对象
           例如: ``quicksum(x) - 1`` 或 ``Constraint(quicksum(x) - 1, "==", 1)``

        2. 多个约束: list/tuple/np.ndarray，自动遍历逐个添加
           例如: ``[constraint1, constraint2, constraint3]``

    name (str or list, optional): 约束名称，默认自动命名。当为多个约束时，若传入字符串则为公共前缀，若传入字符串列表则需与约束数量一致。

    penalty (float, optional): 缺省惩罚系数

    constr_type (str, optional): 约束类型，可以设置为"soft"或"hard"，默认为"hard"

    slack_var_expr (BinaryExpression, optional): 松弛变量表达式，仅在不等式约束中使用，默认为自动生成

Examples:
    Example1 (单个 BinaryExpression):
        >>> import kaiwu as kw
        >>> model = kw.core.QuboModel()
        >>> x = [kw.core.Binary(f"x{i}") for i in range(3)]
        >>> model.add_constraint(kw.core.quicksum(x) - 1)

    Example2 (带关系运算符的单个 Constraint 对象):
        >>> from kaiwu.core._constraint import Constraint
        >>> model.add_constraint(Constraint(kw.core.quicksum(x) - 1, "==", 1))

    Example3 (多个约束):
        >>> constraints = [x[i] - 1 for i in range(3)]
        >>> model.add_constraint(constraints, name="my_constraints")
```

**get_value(solution_dict)**
```text
根据结果字典将变量值带入qubo变量.

Args:
    solution_dict (dict): 由get_sol_dict生成的结果字典。

Returns:
    float: 带入qubo后所得的值
```

**verify_constraint(solution_dict, constr_type='hard')**
```text
确认约束是否满足

Args:
    solution_dict (dict): QUBO模型解字典

    constr_type(str, optional): 约束类型，可以设置为"soft"或"hard"，默认为"hard"

Returns:
    tuple: 约束满足信息
        - int: 不满足的约束个数
        - dict: 包含约束值的字典
```

**initialize_penalties()**
自动初始化所有的惩罚系数

**get_constraints_expr_list()**
```text
获取当前所有的constraint。

Returns:
    list: 所有constraints的列表.
```

**compile_constraints()**
按照不同的风格转换约束项为Expression


### Expression

```python
class Expression
Expression(coefficient=None, offset=0)
```

QUBO/Ising 通用表达式基类（提供默认二次表达式实现）

#### 方法

**clear()**
表达式置为0

**get_variables()**
```text
获取变量名集合

Returns:
    dict: 返回构成expression的变量集合
```

**get_max_deltas()**
```text
求出每个变量翻转引起目标函数变化的上界
返回值negative_delta，positive_delta分别为该变量1->0和0->1所引起的最大变化量
```

**get_average_coefficient()**
返回coefficient的平均值

**get_val(sol_dict)**
```text
根据结果字典将spin值带入qubo变量.

Args:
    sol_dict (dict): 由get_sol_dict生成的结果字典。

Returns:
    float: 带入qubo后所得的值

Examples:
    >>> import kaiwu as kw
    >>> import numpy as np
    >>> a = kw.core.Binary("a")
    >>> b = kw.core.Binary("b")
    >>> c = kw.core.Binary("c")
    >>> d = a + 2 * b + 4 * c
    >>> sol_dict = {"a": 1, "b": 0, "c": 1}
    >>> d.get_val(sol_dict)
    5
```


### Integer

```python
class Integer(BinaryExpression)
Integer(name='', min_value=0, max_value=127)
```

整数变量, 只保存变量名和范围，不继承 QuboExpression


### IsingExpression

```python
class IsingExpression(Expression)
IsingExpression(variables=None, quadratic=None, linear=None, bias=0)
```

Ising 表达式基类，直接继承 Expression，保留扩展点。


### IsingModel

```python
class IsingModel(dict)
IsingModel(variables, ising_matrix, bias)
```

ising模型

#### 方法

**get_variables()**
获取模型中的变量

**get_matrix()**
获取Ising矩阵

**get_bias()**
获取QUBO转化时得到的常数偏置


### IsingSolver

```python
class IsingSolver
IsingSolver()
```

Ising求解器基类

#### 方法

**set_matrix(ising_matrix)**
设置矩阵并更新相关内容

**on_matrix_change()**
更新矩阵相关信息, 继承IsingSolver时可以实现。当处理的ising矩阵发生变化时，这个函数的实现会被调用，从而有机会做相应动作

**solve(ising_matrix=None, negtail_flip=True, sort_solutions=False)**
```text
求解Ising矩阵

Args:
    ising_matrix (np.ndarray): Ising矩阵

    negtail_flip (bool): 是否进行负尾翻转

    sort_solutions (bool): 是否对解进行排序

Returns:
    output (np.ndarray): 解向量
```

**get_hamiltonian()**
```text
Returns:
    hamiltonian (np.ndarray): 当前解的哈密顿量值
```


### KaiwuError

```python
class KaiwuError(Exception)
```

Base class for exceptions in this module.


### PenaltyMethodConstraint

```python
class PenaltyMethodConstraint
PenaltyMethodConstraint(expr, penalty=1, parent_model=None)
```

```text
有约束转无约束的penalty method方法

Args:
    expr (Expression): 编译后的约束项表达式

    penalty (float): 约束项惩罚系数
```

#### 方法

**from_constraint_definition(name, constraint, parent_model)**
```text
Prepare QUBO expression for the given constraint, automatically determining slack variables if needed.

Args:
 name: Name of the constraint.

 constraint: The relation constraint to process.

 parent_model: the model it belongs to.
```

**set_penalty(penalty)**
设置惩罚系数

**penalize_more()**
增加惩罚系数

**penalize_less()**
降低惩罚系数

**is_satisfied(solution_dict)**
验证约束满足情况


### Placeholder

```python
class Placeholder(BinaryExpression)
Placeholder(name='')
```

占位符变量, 只保存变量名, 对决策

#### 方法

**get_placeholder_set()**
获取占位符集合


### QuboModel

```python
class QuboModel(BinaryModel)
QuboModel(objective=None)
```

```text
支持添加约束的QUBO模型类

Args:
    objective (QuboExpression, optional): 目标函数. 默认为None
```

#### 方法

**invalidate_made_state()**
Invalidate the made state when the model changes

**make()**
```text
返回合并后的QUBO表达式

Returns:
    BinaryExpression: 合并的约束表达式
```

**get_matrix()**
```text
获取QUBO矩阵

Returns:
    numpy.ndarray: QUBO矩阵
```

**get_variables()**
获取qubo模型的variables

**get_offset()**
获取qubo模型的offset

**get_sol_dict(qubo_solution)**
根据解向量生成结果字典.


### QuboSolver

```python
class QuboSolver
```

```text
Solver基类

Args:
    optimizer (IsingSolver): Ising求解器
```

#### 方法

**solve_qubo(qubo_model)**
```text
求解QUBO模型

Args:
    qubo_model (QuboModel): QUBO模型

    sort_solutions (bool): 是否对解进行排序

Returns:
    tuple: QUBO解与哈密顿量
        dict: 解字典

        float: 当前解的哈密顿量值
```


### Spin

```python
class Spin(IsingExpression)
Spin(name='')
```

```text
自旋变量, 可能的取值只有-1,1.

Args:
    name (str): 变量的唯一标识.

Returns:
    dict: 名称为name的自旋变量.

Examples:
    >>> import kaiwu as kw
    >>> s = kw.core.Spin("s")
    >>> s
    2*s-1
```


### calculate_qubo_value
```python
calculate_qubo_value(qubo_matrix, offset, binary_configuration)
```

```text
Q值计算器.

Args:
    qubo_matrix (np.ndarray): QUBO矩阵.

    offset (float): 常数项

    binary_configuration (np.ndarray): 二进制配置

Returns:
    output (float): Q值.

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> matrix = np.array([[1., 0., 0.],
    ...                    [0., 1., 0.],
    ...                    [0., 0., 1.]])
    >>> offset = 1.8
    >>> binary_configuration = np.array([0, 1, 0])
    >>> qubo_value = kw.core.calculate_qubo_value(matrix, offset, binary_configuration)
    >>> print(qubo_value)
    2.8
```

### dot
```python
dot(mat_left, mat_right)
```

```text
矩阵乘法

Args:
    mat_left (numpy.array): 矩阵1

    mat_right (numpy.array): 矩阵2

Raises:
    ValueError: 两个输入都必须是np.ndarray
    ValueError: 两个输入的维度必须匹配

Returns:
    np.ndarray: 乘积矩阵
```

### get_min_penalty
```python
get_min_penalty(obj, cons)
```

```text
返回约束项cons对应的最小惩罚系数，惩罚项优先满足

Args:
    obj: 原目标函数的qubo表达式。

    cons: 约束项的qubo表达式

Returns:
    float: 返回约束项cons对应的最小惩罚系数.

Examples:
    >>> import kaiwu as kw
    >>> x = [kw.core.Binary(f"b{i}") for i in range(3)]
    >>> cons = kw.core.quicksum(x) - 1
    >>> obj = x[1] + 2 * x[2]
    >>> kw.core.get_min_penalty(obj, cons)
    2.0
```

### get_min_penalty_for_equal_constraint
```python
get_min_penalty_for_equal_constraint(obj, cons)
```

```text
返回一次等式约束项cons对应的最小惩罚系数: 把满足这个约束的解的某一位比特翻转一下的最坏情况。
这个惩罚系数有效是指能够保证原问题的可行解是目标函数的局部最优（在一位比特翻转的局部意义下）。

Args:
    obj: 原目标函数的qubo表达式。

    cons: 线性的等式约束cons=0中的线性表达式。

Returns:
    float: 一次等式约束项cons对应的最小惩罚系数.

Examples:
    >>> import kaiwu as kw
    >>> x = [kw.core.Binary(f"b{i}") for i in range(3)]
    >>> cons = kw.core.quicksum(x)-1
    >>> obj = x[1]+2*x[2]
    >>> kw.core.get_min_penalty_for_equal_constraint(obj,cons)
    2.0
```

### get_min_penalty_from_deltas
```python
get_min_penalty_from_deltas(cons, neg_delta, pos_delta, obj_vars, min_delta_method='diff')
```

```text
返回约束项cons对应的最小惩罚系数，惩罚项优先满足

Args:
    cons: 约束项的qubo表达式

    neg_delta: 各个变量1变为0时最大变化量的dict

    pos_delta: 各个变量0变为1时最大变化量的dict

    obj_vars: 第三个元素为变量列表

    min_delta_method: 声明在。分别用两种方法寻找最小变化值
                    MIN_DELTA_METHODS = {"diff": _get_constraint_min_deltas_diff,
                    "exhaust": _get_constraint_min_deltas_exhaust}

Examples:
    >>> import kaiwu as kw
    >>> x = [kw.core.Binary(f"b{i}") for i in range(3)]
    >>> cons = kw.core.quicksum(x) - 1
    >>> obj = x[1]+2*x[2]
    >>> kw.core.get_min_penalty(obj, cons)
    2.0
```

### get_min_penalty_from_min_diff
```python
get_min_penalty_from_min_diff(cons, negative_delta, positive_delta)
```

```text
根据objective的最大值，最小值估算约束项的最小惩罚系数

Args:
    cons:  约束项

    negative_delta: objective最小值

    positive_delta: objective最大值

Returns:
    找到的最小惩罚系数
```

### get_sol_dict
```python
get_sol_dict(solution, vars_dict)
```

```text
根据解向量和变量字典生成结果字典.

Args:
    solution (np.ndarray): 解向量（spin）。

    vars_dict (dict): 变量字典，用cim_ising_model.get_variables()生成。

Returns:
    dict: 结果字典。键为变量名，值为对应的spin值。

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> a = kw.core.Binary("a")
    >>> b = kw.core.Binary("b")
    >>> c = kw.core.Binary("c")
    >>> d = a + 2 * b + 4 * c
    >>> d = kw.core.QuboModel(d)
    >>> d_ising = kw.core.qubo_model_to_ising_model(d)
    >>> vars = d_ising.get_variables()
    >>> s = np.array([1, -1, 1])
    >>> kw.core.get_sol_dict(s, vars)
    {'a': np.float64(1.0), 'b': np.float64(0.0), 'c': np.float64(1.0)}
```

### get_sorted_solutions
```python
get_sorted_solutions(matrix, solutions, bias=0.0, negtail_ff=True, sort_solutions=True)
```

```text
最优解采样.

Args:
    matrix (np.ndarray): Ising 矩阵.

    solutions (np.ndarray): 变量配置.

    bias (float): 常数项.

    negtail_ff (bool): negtail_flip flag 负尾翻转, Ising模型线性项二次化的矩阵需要负尾翻转.

Returns:
    output (np.ndarray, np.ndarray): 按能量排序的变量配置, 能量.

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> matrix = -np.array([[ 0. ,  1. ,  0. ,  1. ,  1. ],
    ...                     [ 1. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 0. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 1. ,  1.,   1. ,  0. ,  1. ],
    ...                     [ 1. ,  1.,   1. ,  1. ,  0. ]])
    >>> solutions = np.array([[ 1, -1,  1, -1, -1],
    ...                   [-1, -1,  1, -1, -1],
    ...                   [-1, -1, -1,  1,  1],
    ...                   [ 1,  1,  1, -1, -1],
    ...                   [ 1,  1,  1, -1, -1],
    ...                   [ 1,  1,  1, -1, -1]])
    >>> kw.core.get_sorted_solutions(matrix, solutions, 0)
    (array([[-1, -1, -1,  1,  1],
           [-1, -1, -1,  1,  1],
           [-1, -1, -1,  1,  1],
           [-1, -1, -1,  1,  1],
           [-1,  1, -1,  1,  1],
           [ 1,  1, -1,  1,  1]]), array([-8., -8., -8., -8., -4.,  8.]))
```

### get_val
```python
get_val(qubo, sol_dict)
```

```text
根据结果字典将spin值带入qubo变量.

Args:
    qubo (BinaryExpression or BinaryExpressionNDArray): QUBO表达式

    sol_dict (dict): 由get_sol_dict生成的结果字典。

Returns:
    float: 带入qubo后所得的值

Examples:
    >>> import kaiwu as kw
    >>> import numpy as np
    >>> a = kw.core.Binary("a")
    >>> b = kw.core.Binary("b")
    >>> c = kw.core.Binary("c")
    >>> d = a + 2 * b + 4 * c
    >>> qubo_model = kw.core.QuboModel(d)
    >>> d_ising = kw.core.qubo_model_to_ising_model(qubo_model)
    >>> ising_vars = d_ising.get_variables()
    >>> s = np.array([1, -1, 1])
    >>> sol_dict = kw.core.get_sol_dict(s, ising_vars)
    >>> kw.core.get_val(d, sol_dict)
    np.float64(5.0)
```

### ising_matrix_to_qubo_matrix
```python
ising_matrix_to_qubo_matrix(ising_mat, remove_linear_bit=True, decimal=False)
```

```text
Ising矩阵转QUBO矩阵

Args:
    ising_mat (np.ndarray): Ising矩阵

    remove_linear_bit (bool): QUBO转Ising时会增加一个辅助变量表示线性项。是否移除最后一个自旋变量。默认为True。

    decimal (bool): 是否使用Decimal进行高精度计算，默认为False。

Returns:
    tuple: QUBO矩阵和bias

        - qubo_mat (np.ndarray): QUBO矩阵
        - bias (float): QUBO与Ising相差的常数项

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> matrix = -np.array([[ 0. ,  1. ,  0. ,  1. ,  1. ],
    ...                     [ 1. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 0. ,  0. ,  0. ,  1.,   1. ],
    ...                     [ 1. ,  1.,   1. ,  0. ,  1. ],
    ...                     [ 1. ,  1.,   1. ,  1. ,  0. ]])
    >>> _qubo_mat, _ = kw.core.ising_matrix_to_qubo_matrix(matrix)
    >>> _qubo_mat
    array([[-4.,  8.,  0.,  8.],
           [-0., -4.,  0.,  8.],
           [-0., -0., -0.,  8.],
           [-0., -0., -0., -8.]])
```

### ndarray
```python
ndarray(shape, name, var_func, var_func_param=None)
```

```text
基于 np.ndarray 的QUBO容器.
该容器支持各种 numpy 原生的向量化运算

Args:
    shape (Union[int, Tuple[int, ...]]): 形状

    name (str): 生成的变量的标识符.

    var_func (class for func): 用于生成元素的方法或类. 第一个参数必须是name

    var_func_param (tuple): var_func除了name以外的参数

Returns:
    np.ndarray: 多维容器.

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> A = kw.core.ndarray((2,3,4), "A", kw.core.Binary)
    >>> A
    BinaryExpressionNDArray([[[A[0][0][0], A[0][0][1], A[0][0][2],
                               A[0][0][3]],
                              [A[0][1][0], A[0][1][1], A[0][1][2],
                               A[0][1][3]],
                              [A[0][2][0], A[0][2][1], A[0][2][2],
                               A[0][2][3]]],
    <BLANKLINE>
                             [[A[1][0][0], A[1][0][1], A[1][0][2],
                               A[1][0][3]],
                              [A[1][1][0], A[1][1][1], A[1][1][2],
                               A[1][1][3]],
                              [A[1][2][0], A[1][2][1], A[1][2][2],
                               A[1][2][3]]]], dtype=object)
    >>> A[1,2]
    BinaryExpressionNDArray([A[1][2][0], A[1][2][1], A[1][2][2], A[1][2][3]],
                            dtype=object)
    >>> A[:, [0,2]]
    BinaryExpressionNDArray([[[A[0][0][0], A[0][0][1], A[0][0][2],
                               A[0][0][3]],
                              [A[0][2][0], A[0][2][1], A[0][2][2],
                               A[0][2][3]]],
    <BLANKLINE>
                             [[A[1][0][0], A[1][0][1], A[1][0][2],
                               A[1][0][3]],
                              [A[1][2][0], A[1][2][1], A[1][2][2],
                               A[1][2][3]]]], dtype=object)
    >>> B = kw.core.ndarray(3, "B", kw.core.Binary)
    >>> B
    BinaryExpressionNDArray([B[0], B[1], B[2]], dtype=object)
    >>> C = kw.core.ndarray([3,3], "C", kw.core.Binary)
    >>> C
    BinaryExpressionNDArray([[C[0][0], C[0][1], C[0][2]],
                             [C[1][0], C[1][1], C[1][2]],
                             [C[2][0], C[2][1], C[2][2]]], dtype=object)
    >>> D = 2 * B.dot(C) + 2
    >>> str(D[0])
    '2*B[0]*C[0][0]+2*B[1]*C[1][0]+2*B[2]*C[2][0]+2'
    >>> E = B.sum()
    >>> str(E)
    'B[0]+B[1]+B[2]'
    >>> F = np.diag(C)
    >>> F
    BinaryExpressionNDArray([C[0][0], C[1][1], C[2][2]], dtype=object)
```

### qubo_matrix_to_ising_matrix
```python
qubo_matrix_to_ising_matrix(qubo_mat, decimal=False)
```

```text
QUBO矩阵转Ising矩阵

Args:
    qubo_mat (np.ndarray): QUBO矩阵

    decimal (bool): 是否使用Decimal进行高精度计算，默认为False。

Returns:
    tuple: Ising矩阵和bias
        - ising_mat (np.ndarray): Ising矩阵
        - bias (float): QUBO与Ising相差的常数项

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> matrix = -np.array([[-4.,  8.,  0.,  8.],
    ...                     [-0., -4.,  0.,  8.],
    ...                     [-0., -0., -0.,  8.],
    ...                     [-0., -0., -0., -8.]])
    >>> _ising_mat, _ = kw.core.qubo_matrix_to_ising_matrix(matrix)
    >>> _ising_mat
    array([[-0.,  1., -0.,  1.,  1.],
           [ 1., -0., -0.,  1.,  1.],
           [-0., -0., -0.,  1.,  1.],
           [ 1.,  1.,  1., -0.,  1.],
           [ 1.,  1.,  1.,  1., -0.]])
```

### qubo_matrix_to_qubo_model
```python
qubo_matrix_to_qubo_model(qubo_mat)
```

```text
将qubo矩阵转化为qubo模型

Args:
    qubo_mat (np.ndarray): QUBO矩阵

Returns:
    QuboModel: QUBO模型

Examples:
    >>> import numpy as np
    >>> import kaiwu as kw
    >>> matrix = -np.array([[0, 8],
    ...                     [0, 0]])
    >>> kw.core.qubo_matrix_to_qubo_model(matrix).objective
    -8*b[0]*b[1]
```

### qubo_model_to_ising_model
```python
qubo_model_to_ising_model(qubo_model)
```

```text
QUBO转Ising模型.

Args:
    qubo_model (QuboModel): QUBO Model.

Returns:
    CimIsing: Ising模型.

Examples:
    >>> import kaiwu as kw
    >>> b1, b2 = kw.core.Binary("b1"), kw.core.Binary("b2")
    >>> q = b1 + b2 + b1*b2
    >>> q_model = kw.core.QuboModel(q)
    >>> ci = kw.core.qubo_model_to_ising_model(q_model)
    >>> print(str(ci))
    Ising Details:
      Ising Matrix:
        [[-0.    -0.125 -0.375]
         [-0.125 -0.    -0.375]
         [-0.375 -0.375 -0.   ]]
      Ising Bias: 1.25
      Ising Variables: b1, b2, __spin__
    <BLANKLINE>
```

### quicksum
```python
quicksum(qubo_expr_list)
```

```text
高性能的QUBO求和器.

Args:
    qubo_expr_list (QUBO列表): 用于求和的QUBO表达式的列表.

Returns:
    BinaryExpression: 约束QUBO.

Examples:
    >>> import kaiwu as kw
    >>> qubo_list = [kw.core.Binary(f"b{i}") for i in range(10)] # Variables are also QUBO
    >>> output = kw.core.quicksum(qubo_list)
    >>> str(output)
    'b0+b1+b2+b3+b4+b5+b6+b7+b8+b9'
```

### zeros
```python
zeros(shape)
```

```text
创建一个与输入数组形状相同的零数组。

Args:
    shape (tuple): 矩阵维度

Returns:
    QUBOArray: 形状相同但所有元素为 0 的数组。

Examples:
    >>> import kaiwu as kw
    >>> Z = kw.core.zeros((2, 3))
    >>> Z
    BinaryExpressionNDArray([[0, 0, 0],
                             [0, 0, 0]], dtype=object)
```

