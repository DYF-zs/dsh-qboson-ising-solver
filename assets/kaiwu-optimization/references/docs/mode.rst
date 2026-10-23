====================================
专用量子计算云平台计算模式
====================================

计算范式是用户与量子计算机交互的方式框架，它决定了系统如何处理用户的优化问题、分配计算资源以及呈现最终结果。
选择合适的计算模式，就像为不同路况选择合适的驾驶模式。

在专用量子计算中，支持两种计算模式：Optimization模式（优化模式）和Sampling模式（采样模式）。
Optimization模式会自动平衡计算效率与结果质量，适合大多数业务场景。
Sampling模式则通过大量采样探索解空间，适合需要从海量解集中寻找优质解的任务。


Sampling模式（采样模式）
============================

计算模式定义
------------

Sampling模式需要用户指定计算迭代次数（sample_number），每次迭代通过专用量子能量演化，系统会不断采样解空间，
最终收敛至低能量态。Sampling模式的核心在于通过大量采样来探索解空间，适合需要从海量解集中寻找优质解的任务。

该模式适用于海量解空间的采样任务，相比Optimization模式随机性更高。

参数说明
~~~~~~~~

- task_mode：设置为 ``TaskMode.SAMPLING``
- sample_number：采样次数，取值范围10-2000，默认值10，仅Sampling模式需要此参数

适用场景
^^^^^^^^

面向对计算时间成本敏感、解质量要求相对宽松的科研场景，典型应用包括：

- 人工智能领域：玻尔兹曼机训练
- 无序列表生物制药领域：mRNA疫苗序列优化、分子生成等

代码示例
~~~~~~~~

```python
import numpy as np
import kaiwu as kw
from kaiwu.cim import CIMOptimizer, TaskMode

kw.common.CheckpointManager.save_dir = "/tmp"

matrix = -np.array(
    [
        [0.0, 1.0, 0.0, 1.0, 1.0],
        [1.0, 0.0, 0.0, 1.0, 1.0],
        [0.0, 0.0, 0.0, 1.0, 1.0],
        [1.0, 1.0, 1.0, 0.0, 1.0],
        [1.0, 1.0, 1.0, 1.0, 0.0],
    ]
)

optimizer = CIMOptimizer(
    task_name="cim_sampling_test", task_mode=TaskMode.SAMPLING, sample_number=100
)
solution = optimizer.solve(matrix)
```


Optimization模式（优化模式）
================================

计算模式定义
------------

Optimization模式旨在帮助用户平衡计算效率和结果质量，基于动态策略算法调整专用量子演化计算次数，对简单模型快速输出结果，对难解任务则持续追加计算资源，确保求解质量。
同时，多次计算采样到的所有候选解均经过能量排序、聚类分析等多层数据后处理，从海量解集中筛选出稳定可靠的最优解。

参数说明
~~~~~~~~

- task_mode：设置为 ``TaskMode.OPTIMIZATION``


适用场景
^^^^^^^^

适用于对结果质量敏感但时效性要求宽松的计算场景：

- 生物制药领域：药物发现（变构位点识别、分子相似性筛选）等
- 金融领域：信用评分特征筛选、社区发现与反欺诈检测

代码示例
~~~~~~~~

```python
import numpy as np
import kaiwu as kw
from kaiwu.cim import CIMOptimizer, TaskMode

kw.common.CheckpointManager.save_dir = "/tmp"

matrix = -np.array(
    [
        [0.0, 1.0, 0.0, 1.0, 1.0],
        [1.0, 0.0, 0.0, 1.0, 1.0],
        [0.0, 0.0, 0.0, 1.0, 1.0],
        [1.0, 1.0, 1.0, 0.0, 1.0],
        [1.0, 1.0, 1.0, 1.0, 0.0],
    ]
)

optimizer = CIMOptimizer(
    task_name="cim_optimization_test", task_mode=TaskMode.OPTIMIZATION
)
solution = optimizer.solve(matrix)
```
