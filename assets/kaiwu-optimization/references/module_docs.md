# Kaiwu 模块参考（发行版技能）

从各发行版源码树的 docstring 提取的模块级 API 参考，含类/函数签名与参数
说明（含 Examples 代码）。按发行版分目录、按子包分文件；需要某个子包的
完整 API 细节时按表索引取用。

## Enterprise（kaiwu-sdk-enterprise 1.4.0 源码树，叠加于 Community 之上）

| 子包 | 说明 | API 数 | 文件 |
|---|---|---|---|
| `kaiwu.cim` | 提供一系列SPQC求解器相关工具 | 2 | [cim.md](module_docs/enterprise/cim.md) |
| `kaiwu.classical` | 提供一系列经典求解器 | 3 | [classical.md](module_docs/enterprise/classical.md) |
| `kaiwu.hobo` | hobo建模工具 | 1 | [hobo.md](module_docs/enterprise/hobo.md) |
| `kaiwu.hybrid` | 提供一系列基于cim/classical中的opitimizer进行求解的solver | 1 | [hybrid.md](module_docs/enterprise/hybrid.md) |
| `kaiwu.license` | license相关 | 4 | [license.md](module_docs/enterprise/license.md) |
| `kaiwu.preprocess` | 预处理相关功能，目前主要是针对ising矩阵的精度相关函数 | 14 | [preprocess.md](module_docs/enterprise/preprocess.md) |
| `kaiwu.sampler` | 提供一系列数据后处理工具 | 1 | [sampler.md](module_docs/enterprise/sampler.md) |

## Community（kaiwu-community 1.0.7，`pip install kaiwu-community`）

| 子包 | 说明 | API 数 | 文件 |
|---|---|---|---|
| `kaiwu.common` | 通用工具集合 | 11 | [common.md](module_docs/community/common.md) |
| `kaiwu.core` | 基础类的定义 | 31 | [core.md](module_docs/community/core.md) |

