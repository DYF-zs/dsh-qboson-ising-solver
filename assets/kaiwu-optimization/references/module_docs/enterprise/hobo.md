# kaiwu.hobo 模块参考（Enterprise 1.4.0 源码树）

> hobo建模工具

生成自源码 docstring：`kaiwu-sdk-enterprise\src\kaiwu\hobo`。

## 子模块

| 源文件 | 模块说明 |
|---|---|
| `_hobo_model.py` | 方便用户定义高阶二值模型，并转化成二次二值模型 |

### HoboModel

```python
class HoboModel(BinaryModel)
HoboModel(objective=None, hobo_default_penalty=1)
```

```text
支持添加约束的HOBO模型类

Args:
    objective(Expression): 目标函数
    hobo_default_penalty(float): HOBO约束的默认惩罚系数, 默认值为1
```

#### 方法

**verify_hobo_constraint(solution_dict)**
```text
验证 HOBO 降阶约束是否满足。

Args:
    solution_dict (dict): HOBO 降阶后的解字典。

Returns:
    tuple: 约束满足情况信息
        - int: 未满足的 HOBO 约束数量
        - dict: 包含每个 HOBO 约束取值的字典
```

**reduce(predefined_pairs=None)**
```text
对Hobo Model高阶表达式进行降阶处理（降至二阶）

Args:
    predefined_pairs (list): 预定义要合并的变量对列表，格式为[(var1, var2), ...]

Returns:
    QuboModel: 降阶后的QuboModel。注意不要在该模型上修改约束，可能会导致错误
```


