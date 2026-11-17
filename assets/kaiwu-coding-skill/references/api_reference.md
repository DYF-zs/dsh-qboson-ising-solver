# Kaiwu API 总览与源码地图

这是 `kaiwu-coding-skill` 的 API 入口。它刻意不假设"一个包名对应一套稳定
API"。先确定已安装的发行版，再读对应的版本参考；对下面未列出的 API，去
匹配的源码/docstring 中查证。

| 发行版 | 受检源码/版本 | 版本参考 | 权威本地源码 |
|---|---|---|---|
| Enterprise | `kaiwu-sdk-enterprise`，发布树 `1.4.0`（PyPI `kaiwu` 当前 `1.4.1`） | [kaiwu_enterprise.md](kaiwu_enterprise.md) | `D:\codes\qboson_202609\kaiwu_skill\kaiwu-sdk-enterprise\src\kaiwu` |
| Community | `kaiwu-community`，`1.0.7`（`pip install kaiwu-community`，或随 `pip install kaiwu` 一并安装） | [kaiwu_community.md](kaiwu_community.md) | `D:\codes\qboson_202609\kaiwu_skill\kaiwu_community\src\kaiwu` |

实际安装的发行版/版本始终优先于这些 checkout 快照。

## 识别已安装的 API

```python
import importlib.metadata as metadata
import inspect
import kaiwu as kw

print(metadata.version("kaiwu"), kw.__file__)
# PrecisionReducer 位置随版本变化（1.3.1: kw.cim / 1.4.0: kw.preprocess）
import kaiwu.cim as _cim, kaiwu.preprocess as _pp
print("cim.PrecisionReducer:", hasattr(_cim, "PrecisionReducer"))
print("preprocess.PrecisionReducer:", hasattr(_pp, "PrecisionReducer"))
print(hasattr(kw.preprocess, "restore_split_solution"))
```

只有在导入了用户真实环境之后才能用 `inspect.signature`。环境不可用时，
读上表对应的本地源码路径；用 `rg -n "^class |^def " <path>` 定位声明与
docstring。绝不只凭包名选 API。

## 共享建模 API

两条 SDK 线在符号检查通过的前提下，都使用下面的常规建模流程：

```python
import kaiwu as kw

x = kw.core.ndarray((n,), "x", kw.core.Binary)
model = kw.core.QuboModel()
model.set_objective(kw.core.quicksum(cost[i] * x[i] for i in range(n)))
model.add_constraint(kw.core.quicksum(x[i] for i in range(n)) == 1,
                     "one_hot", penalty=10.0)
qubo_matrix = model.get_matrix()
ising_matrix, bias = kw.core.qubo_matrix_to_ising_matrix(qubo_matrix)
```

| 领域 | API | 用途 |
|---|---|---|
| 变量 | `Binary`、`Spin`、`Integer`、`Placeholder`、`ndarray` | 表达二元、自旋、整数、延迟与带索引的决策。 |
| 表达式 | `quicksum`、`zeros`、`diag`、`dot` | 高效构建符号化 QUBO 表达式。 |
| QUBO 模型 | `QuboModel.set_objective`、`add_constraint`、`get_matrix`、`get_variables`、`get_offset` | 把目标函数与罚函数约束编译成 QUBO 矩阵。 |
| 结果处理 | `get_sol_dict`、`get_val`、`verify_constraint` | 解码并校验原始模型的结果；跨版本数组逐元素 `get_val`。 |
| 转换 | `qubo_matrix_to_ising_matrix`、`ising_matrix_to_qubo_matrix`、`qubo_model_to_ising_model` | 在二元与自旋表示之间转换。 |
| 高阶 | `HoboModel.reduce()` | 求解前把高阶二元项降为 QUBO。 |

`qubo_matrix_to_ising_matrix` 会附加一个参考/尾部自旋。对求解器返回的任一
原始行 `s`，先做规范变换再转二元：

```python
normalized_spin = s * s[-1]
qubo_bits = ((normalized_spin[:-1] + 1) // 2).astype(int)
```

上报解之前，先用模型的结果工具和 `verify_constraint` 校验。仅凭求解器能量
不能证明约束可行性。

## 经典、CIM、hybrid 与采样 API

下表只列受检 Enterprise 树的公共面：

| 模块 | 受检 Enterprise 树公共面 |
|---|---|
| `classical` | SA、Tabu、Brute Force |
| `cim` | `CIMOptimizer`、`TaskMode` |
| `hybrid` | `PenaltyMethodOptimizer` |
| `sampler` | `SimulatedAnnealingSampler` |
| `preprocess` | 精度缩减器、mutate 函数、变量/项 split |

Enterprise 可移植的本地代码，实例化 `kw.classical.SimulatedAnnealingOptimizer`。
云端 `CIMOptimizer` 只在用户提供授权配置后使用。

## 精度 API：Enterprise 侧要点（按版本）

精度 API 是猜 API 最容易写坏代码的地方。`PrecisionReducer` 的**所在模块与
默认值随版本变化**，务必先确认版本再写：

| 项 | Enterprise 1.3.1（已发布） | Enterprise 1.4.0（源码树） |
|---|---|---|
| `PrecisionReducer` 位置 | `kw.cim` | `kw.preprocess` |
| `only_feasible_solution` 默认值 | `True` | `False` |
| 动态范围适配 | `perform_precision_adaption_mutate(matrix)` | 同左（函数形式） |
| 还原拆分态 | `restore_split_solution` | 同左 |
| 构造拆分态 | `construct_split_solution` | 同左 |

主拆分器在受检两树中的核心契约一致：

```python
split_matrix, last_var_idx = kw.preprocess.perform_precision_adaption_split(
    ising_matrix, param_bit=8
)
```

它返回元组，不是字典。除非调用方需要自行控制扩展矩阵或逐解还原，否则优先
使用装饰器（`PrecisionReducer` 从上面表格中与版本匹配的模块导入）：

```python
base = kw.classical.SimulatedAnnealingOptimizer(size_limit=20)
reduced = PrecisionReducer(
    base, precision=8, truncated_precision=20,
    only_feasible_solution=False,
)
solutions = reduced.solve(ising_matrix)
```

写手动拆分代码之前，先读 [kaiwu_enterprise.md](kaiwu_enterprise.md)。

## 深度查证流程

当请求涉及上面未覆盖的方法时，不要编造签名：

1. 确定是 Enterprise 还是 Community，以及安装的版本。
2. 读本目录中对应的版本参考。
3. 查 [模块参考索引](module_docs.md)：按子包分文件的全量 API 签名与
   docstring（含 Args 与 Examples），从各源码树提取。
4. 按源码地图表读匹配的源码声明/docstring。
5. 在输出非平凡的求解器、精度、云端或模型训练代码之前，先查同一工作树中
   的集成测试或示例。
6. 当发行版/版本影响导入、默认值或结果还原时，在生成代码的注释中写明所选
   的发行版/版本。
