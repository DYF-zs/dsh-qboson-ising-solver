新手教程-使用真机-云平台或者SDK
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

用例描述
----------------
通过旅行商问题(TravelingSalesmanProblem，TSP)展示从建模、提交Qubo矩阵到云平台、从云平台获取计算结果的全流程


方式一：通过云平台上传QUBO矩阵计算
--------------------------------------------

代码建模并生成qubo矩阵
============================================

```python
# pylint: disable=<R0801>
"""
TSP problem solved using SPQC.

被 docs/source/getting_started/tutorial4_cloud_platform_usage_cases.rst 引用，
用于展示 TSP 矩阵生成和云平台上传前的数据准备。
"""
# docs_start_tsp_cloud_platform_upload
import numpy as np
import pandas as pd
import kaiwu as kw


def is_edge_used(var_x, var_u, var_v):
    """
    Determine whether the edge (u, v) is used in the path.

    Args:
        var_x (ndarray): Decision variable matrix.

        var_u (int): Start node.

        var_v (int): End node.

    Returns:
        ndarray: Decision variable corresponding to the edge (u, v).
    """
    return kw.core.quicksum(
        [var_x[var_u, j] * var_x[var_v, j + 1] for j in range(-1, n - 1)]
    )


if __name__ == "__main__":
    # Import distance matrix
    w = np.array([[0, 1, 2], [1, 0, 0], [2, 0, 0]])
    # Get the number of nodes
    n = w.shape[0]

    # Create qubo variable matrix
    x = kw.core.ndarray((n, n), "x", kw.core.Binary)

    # Get sets of edge and non-edge pairs
    edges = [(u, v) for u in range(n) for v in range(n) if w[u, v] != 0]
    no_edges = [(u, v) for u in range(n) for v in range(n) if w[u, v] == 0]

    qubo_model = kw.core.QuboModel()
    # TSP path cost
    qubo_model.set_objective(
        kw.core.quicksum([w[u, v] * is_edge_used(x, u, v) for u, v in edges])
    )

    # Node constraint: Each node must belong to exactly one position
    qubo_model.add_constraint(x.sum(axis=0) == 1, "sequence_cons", penalty=5.0)

    # Position constraint: Each position can have only one node
    qubo_model.add_constraint(x.sum(axis=1) == 1, "node_cons", penalty=5.0)

    # Edge constraint: Pairs without edges cannot appear in the path
    qubo_model.add_constraint(
        kw.core.quicksum([is_edge_used(x, u, v) for u, v in no_edges]),
        "connect_cons",
        penalty=20,
    )

    qubo_mat = qubo_model.get_matrix()
    pd.DataFrame(qubo_mat).to_csv("tsp.csv", index=False, header=False)
```


登录云平台上传矩阵
=========================================

1. 登录专用量子云计算平台后进入控制台，选择真机后点击新建任务

(图片见原仓库 docs/source 对应路径)

2. 进入任务配置页面后，填写任务名称、上传矩阵，确认后点击下一步

(图片见原仓库 docs/source 对应路径)

3. 进入确认配置页面，确认任务和真机信息后点击确定按钮

(图片见原仓库 docs/source 对应路径)

4. 进入提交任务页面，显示提交成功

(图片见原仓库 docs/source 对应路径)

5. 返回控制台，任务正在校验中

(图片见原仓库 docs/source 对应路径)

6. 校验成功后任务进入排队中状态

(图片见原仓库 docs/source 对应路径)

7. 任务完成后点击详情进入结果详情页面

(图片见原仓库 docs/source 对应路径)

8. 查看结果详情（qubo解向量、qubo value演化曲线、任务执行时间等）

(图片见原仓库 docs/source 对应路径)


方式二：直接使用SDK调用真机
---------------------------------
下面是同样一个TSP的问题，使用SDK直接调用真机求解的例子。
由于量子计算机有精度限制，例子中用SDK自带的PrecisionReducer进行精度适配。
想了解更多的关于精度的知识，

.. seealso::
    - :doc:`../advanced/precision`

```python
"""
TSP calling SPQC example

被 docs/source/getting_started/tutorial4_cloud_platform_usage_cases.rst 引用，
用于展示通过 SDK 调用 SPQC 求解 TSP。
"""

# docs_start_tsp_sdk_cloud
import numpy as np
import kaiwu as kw

from kaiwu.cim import TaskMode
from kaiwu.common import CheckpointManager as ckpt


# Define edges using conditional functions
def is_edge_used(var_x, var_u, var_v):
    """
    Determine whether the edge (u, v) is used in the path.

    Args:
        var_x (ndarray): Decision variable matrix.

        var_u (int): Start node.

        var_v (int): End node.

    Returns:
        ndarray: Decision variable corresponding to the edge (u, v).
    """
    return kw.core.quicksum(
        [var_x[var_u, j] * var_x[var_v, j + 1] for j in range(-1, n - 1)]
    )


if __name__ == "__main__":
    # Set the save path for intermediate files
    kw.common.CheckpointManager.save_dir = "/tmp"
    # Define distance matrix
    w = np.array(
        [
            [0, 0, 1, 1, 0],
            [0, 0, 1, 0, 1],
            [1, 1, 0, 0, 1],
            [1, 0, 0, 0, 1],
            [0, 1, 1, 1, 0],
        ]
    )

    n = w.shape[0]  # Number of nodes

    # Create a QUBO variable matrix (n x n)
    x = kw.core.ndarray((n, n), "x", kw.core.Binary)

    # Generate the set of edges and the set of non-edges
    edges = [(u, v) for u in range(n) for v in range(n) if w[u, v] != 0]
    no_edges = [(u, v) for u in range(n) for v in range(n) if w[u, v] == 0]

    # Initialize the QUBO model
    qubo_model = kw.core.QuboModel()

    # Set the objective function: minimize path cost
    path_cost = kw.core.quicksum([w[u, v] * is_edge_used(x, u, v) for u, v in edges])
    qubo_model.set_objective(path_cost)

    # Add constraints
    # Node constraints: Each node must occupy one position
    qubo_model.add_constraint(x.sum(axis=0) == 1, "node_cons", penalty=5.0)

    # Location constraint: Each location must have at least one node.
    qubo_model.add_constraint(x.sum(axis=1) == 1, "pos_cons", penalty=5.0)

    # Edge constraint: Non-connecting edges must not appear
    qubo_model.add_constraint(
        kw.core.quicksum([is_edge_used(x, u, v) for u, v in no_edges]),
        "edge_cons",
        penalty=5,
    )

    # Configure the solver
    ckpt.save_dir = "./tmp"
    optimizer = kw.cim.CIMOptimizer(task_name="tsp", task_mode=TaskMode.OPTIMIZATION)
    optimizer = kw.preprocess.PrecisionReducer(optimizer, 8)
    sol_dict, qubo_val = optimizer.solve_qubo(qubo_model)

    if sol_dict is not None:
        # Verification Results
        unsatisfied, res_dict = qubo_model.verify_constraint(sol_dict)
        print(f"Number of unsatisfied constraints: {unsatisfied}")
        print(f"constraint value: {res_dict}")

        # Calculate path cost
        path_cost = kw.core.get_val(qubo_model.objective, sol_dict)
        print(f"Actual path cost: {path_cost}")
    else:
        print("Try again later")
```

