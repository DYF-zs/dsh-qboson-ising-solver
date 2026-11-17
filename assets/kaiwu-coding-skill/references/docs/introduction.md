# 概述

## Kaiwu SDK

Kaiwu SDK是一套面向组合优化问题的软件开发套件，提供从QUBO/Ising建模、矩阵预处理、求解器调用到结果后处理的完整Python接口。企业版在社区版建模能力之上，增加了SPQC真机求解、经典优化器、精度适配、HOBO建模、license鉴权和数据上报等能力，便于用户在本地调试和真实计算资源之间切换。

当前SDK的主要模块如下：

| 模块 | 功能 |
| --- | --- |
| `core` | 基础建模与转换模块，提供 `Binary`、`Spin`、`QuboModel`、`IsingModel`、表达式求值、约束惩罚项、QUBO/Ising矩阵互转等能力；该模块由 `kaiwu-community` 依赖提供。 |
| `common` | 通用工具模块，提供日志配置、checkpoint、循环控制器、解池、哈密顿量计算和矩阵检查等公共能力；该模块由 `kaiwu-community` 依赖提供。 |
| `hobo` | 高阶二值优化(HOBO)建模模块，提供 `HoboModel`，用于构造并降阶处理含高阶项的二值优化问题。 |
| `preprocess` | 矩阵预处理模块，提供QUBO/Ising矩阵位宽评估、精度调整、动态范围指标、上下界估计以及精度适配拆分/变异等工具。 |
| `hybrid` | 混合求解模块，提供 `PenaltyMethodOptimizer`，用于将带约束的QUBO模型与 `cim` 或 `classical` 中的optimizer组合求解。 |
| `cim` | SPQC求解模块，提供 `CIMOptimizer` 和 `TaskMode`，用于提交Ising/QUBO矩阵到SPQC相关计算后端并获取结果。 |
| `classical` | 经典优化器模块，提供模拟退火、禁忌搜索和暴力搜索等本地optimizer，适合调试、基准测试和小规模问题求解。 |
| `sampler` | 采样与后处理模块，提供 `SimulatedAnnealingSampler` 等工具，用于产生或处理候选解。 |
| `license` | 企业版授权模块，提供license初始化、校验、运行前检查和使用数据上报能力。 |

在典型应用中，用户先通过 `core` 或 `hobo` 进行问题建模，将模型转换为QUBO或Ising矩阵；随后使用 `preprocess` 对矩阵进行精度、位宽或范围适配；最后根据场景选择 `classical` 本地优化器、`cim` 真机优化器，或通过 `hybrid` 的惩罚项方法统一处理带约束问题。`common` 和 `license` 则贯穿整个流程，分别提供工程支撑和企业版授权能力。

## 典型的使用方式

```{mermaid}
sequenceDiagram
   autonumber
   participant User as 用户代码
   participant License as license
   participant Model as core / hobo
   participant Preprocess as preprocess
   participant Hybrid as hybrid
   participant Optimizer as classical / cim
   participant Result as sampler / common

   User->>License: init / ensure_license()
   License-->>User: license 校验结果
   User->>Model: 构建 Binary / Spin / HoboModel
   Model-->>User: QuboModel / IsingModel / 矩阵
   User->>Preprocess: 位宽评估、精度调整、范围适配
   Preprocess-->>User: 预处理后的 QUBO / Ising 矩阵
   User->>Hybrid: PenaltyMethodOptimizer.solve()
   Hybrid->>Optimizer: 调用 optimizer.solve(matrix)
   Note over Optimizer: classical 用于本地调试和小规模求解<br/>cim 用于对接 SPQC 计算后端
   Optimizer-->>Hybrid: 候选解 / 能量 / 运行信息
   Hybrid->>Result: 结果评估、排序、日志 / checkpoint
   Result-->>User: 最优解、解池与指标
   Note over Model,Result: core / common 由 kaiwu-community 依赖提供<br/>kaiwu 提供 cim、classical、hobo、hybrid、license、preprocess、sampler
```

## 预备知识

### SPQC

专用量子计算机(Special-Purpose Quantum Computer，简称SPQC)，是目前玻色量子重点研发的一项量子计算机技术。相干伊辛机(CIM, Coherent Ising Machine)是一种基于简并光学参量振荡器(DOPO)的专用量子计算机。在数学实践中，我们可以将其抽象为优化Ising模型的专用计算机。

### Ising模型

伊辛模型(Ising Model)，是一类描述物质相变的随机过程模型。抽象为数学形式为：

$$
H(\sigma)=-\sum_{i,j}J_{ij}\sigma_i\sigma_j-\mu\sum_ih_i\sigma_i
$$

其中 $\sigma$ 为待求自旋变量，取值为 $\{-1,1\}$，$H$ 为哈密顿量，$J$ 为二次项系数，$\mu$ 和 $h$ 为线性项系数，是已知量。

### QUBO

二次无约束二值优化问题(Quadratic unconstrained binary optimization，简称QUBO)，其数学形式如下：

$$
f_Q(x)=\sum_{i\leqslant j}q_{ij}x_ix_j
$$

其中 $x$ 为待求二进制变量，取值为 $\{0,1\}$，$f$ 为目标函数，$q$ 为二次项系数，是已知量。
写成线性代数的形式：

$$
f_Q(\pmb x)=\pmb x^T\pmb Q\pmb x
$$

其中，$\pmb x$ 为二进制向量，$\pmb Q$ 为QUBO矩阵，QUBO目标是找到使得 $f$ 最小或最大的 $\pmb x$，即：

$$
\pmb x^*=\mathop{\arg\min}\limits_{\pmb x}f_Q(\pmb x)
$$

在Kaiwu SDK中，通过kw.core.details查看QUBO模型细节会显示offset和coefficients信息。其中offset表示QUBO模型中的常数项，与变量无关。coefficients表示QUBO模型中每个二值变量的系数取值，以及它们的交互项的系数取值。

## SPQC求解模型

SPQC求解QUBO或优化Ising模型的过程就是，将QUBO中的 $q_{ij}$ 或Ising模型中的 $J_{ij}$ 输入SPQC，SPQC返回 $\pmb x$ 或 $\sigma$ 的过程。

## Citing Kaiwu SDK

如果Kaiwu SDK对您的学术研究有帮助，玻色量子感谢您做如下引用。

```bibtex
@software{KaiwuSDK,
title = {Kaiwu SDK for development and research on special-purpose quantum computer},
author = {{QBoson Inc.}},
year = {2022},
url = {https://www.qboson.com/}
}
```

或者

```bibtex
@misc{KaiwuSDK,
title = {Kaiwu SDK for development and research on special-purpose quantum computer},
author = {{QBoson Inc.}},
year = {2022},
url = {https://www.qboson.com/}
}
```
