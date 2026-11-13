# QBoson Ising Solver for DeepSeek Harness

<p align="center">
  <a href="https://www.qboson.com/"><img alt="玻色量子官网" src="https://img.shields.io/badge/QBoson-%E7%8E%BB%E8%89%B2%E9%87%8F%E5%AD%90%E5%AE%98%E7%BD%91-2563EB?style=flat"></a>
  <a href="https://kaiwu.qboson.com/"><img alt="Kaiwu 社区" src="https://img.shields.io/badge/Kaiwu-%E7%A4%BE%E5%8C%BA-2563EB?style=flat"></a>
  <a href="https://platform.qboson.com/"><img alt="专用量子计算云平台" src="https://img.shields.io/badge/SPQC-%E9%87%8F%E5%AD%90%E4%BA%91%E5%B9%B3%E5%8F%B0-0F766E?style=flat"></a>
  <a href="https://github.com/qboson/kaiwu-coding-skill"><img alt="Kaiwu Coding Skill" src="https://img.shields.io/badge/GitHub-Kaiwu_Coding_Skill-181717?style=flat&amp;logo=github&amp;logoColor=white"></a>
  <a href="https://github.com/qboson/kpp-coding-skill"><img alt="KPP Coding Skill" src="https://img.shields.io/badge/GitHub-KPP_Coding_Skill-181717?style=flat&amp;logo=github&amp;logoColor=white"></a>
</p>

`dsh-qboson-ising-solver` 是面向 DeepSeek Harness 的玻色量子（QBoson）组合优化插件，基于 Kaiwu SDK，让 AI 智能体能够根据业务需求构建 QUBO / Ising 模型，调用 QBoson SPQC 真机求解，并还原、验证和保存业务结果。

- **业务问题建模**：根据业务目标、数据和约束，生成并运行 Kaiwu 建模代码，支持选址、调度、路径规划、覆盖等组合优化问题。
- **环境与授权**：自动准备独立的 Python / Kaiwu 运行环境，支持检查环境与 License 状态，并通过授权窗口完成授权。
- **真机求解**：调用 QBoson SPQC 真机，支持直接输入 Ising Matrix 或从 CSV / JSON 文件读取矩阵，返回候选自旋解、Hamiltonian 和求解耗时。
- **结果处理**：将自旋解还原为业务方案，验证约束、计算目标值并筛选最佳可行方案；保存建模代码、矩阵、变量映射、原始结果和业务方案，记录任务标识，便于复查与复现。

## 安装

**网页版**

选择 npm 或 GitHub 来源安装：

```shell
# npm
dsh plugin --profile web add dsh-qboson-ising-solver

# GitHub
dsh plugin --profile web add github:DYF-zs/dsh-qboson-ising-solver
```

**桌面版**

在插件管理页面安装，输入 `dsh-qboson-ising-solver` 或 `github:DYF-zs/dsh-qboson-ising-solver`。

也可使用桌面版提供的 `dsh` 命令。先启动一次桌面版以初始化配置，完全退出应用后，选择一种来源执行安装，再重新打开桌面版：

```shell
# npm
dsh plugin --profile desktop add dsh-qboson-ising-solver

# GitHub
dsh plugin --profile desktop add github:DYF-zs/dsh-qboson-ising-solver
```

桌面版命令的使用条件见 [DSH 官方说明](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/desktop/README.md#bundled-command-runtime)。

**本地源码**

```powershell
git clone https://github.com/DYF-zs/dsh-qboson-ising-solver.git
cd dsh-qboson-ising-solver
npm install
dsh plugin --profile web add "link:$PWD"
```

桌面版可在插件管理页面填写实际目录：

```text
link:C:/Users/<Windows 用户名>/Desktop/dsh-qboson-ising-solver
```

macOS 使用对应的绝对目录，例如 `link:/Users/<用户名>/dsh-qboson-ising-solver`。

## 授权与启动

安装并启用插件后，打开 DSH 桌面版，或通过 `dsh web` 命令启动网页版：

首次使用时请保持联网，等待运行环境自动准备完成。出现授权窗口时，从[玻色量子云平台 SDK 页面](https://platform.qboson.com/sdkDownload)获取用户 ID 和 SDK Code，填写后点击「授权」。授权失败可修改后重试，成功后窗口自动关闭，即可继续使用。

## 使用

### 业务问题建模与求解

向 Agent 描述目标、数据、全部约束，以及是否要求真机求解。例如：

```text
请解决带权顶点覆盖问题：顶点成本为 [3,2,4]，边为 [(0,1),(1,2)]。
请生成 Kaiwu 建模代码，保存矩阵和变量映射，用 QBoson 真机求解，
再从真实候选解码，检查每条边是否被覆盖，报告顶点编号与原业务成本。
```

[可执行顶点覆盖示例](examples/kaiwu-workflow.py)提供 `build <任务目录>` 与 `decode <任务目录>` 两个入口，使用 `prepare_kaiwu_runtime` 返回的解释器执行。真机提交通过 `solve_ising_file` 完成。业务结果从返回的可行候选中按原业务成本选优。

### 从文件求解已有矩阵

向 Agent 提供矩阵 CSV 或 JSON 文件，或调用 `solve_ising_file`：

```json
{
  "matrix_path": "C:/workspace/cover/matrix.csv",
  "result_path": "C:/workspace/cover/raw-result.json"
}
```

两个路径均需为绝对路径，输出目录需要已存在，结果文件需要尚不存在。

CSV 为 UTF-8 编码的逗号分隔数值矩阵，不带表头和行索引；JSON 支持二维数组或 `{"ising_matrix": [...]}`。参见 [CSV 示例](examples/ising-matrix-10.csv)和 [JSON 示例](examples/ising-matrix-10.json)。输入均为 Ising 矩阵，QUBO 矩阵需先转换。

工具保存全部原始候选、Hamiltonian、求解耗时、任务标识与矩阵 SHA-256，并返回摘要。`saved=false` 表示求解已完成但保存失败，此时保存返回的 `raw_result_json`，不要重复提交。

### 直接输入已有矩阵

调用 `solve_ising`，例如：

```json
{"ising_matrix": [[0, -1], [-1, 0]]}
```

矩阵需为非空、有限数值的方阵。返回 `dimension`、`solutions`、`solver_time_us` 和 `task_name`；每个候选包含完整的 ±1 自旋及 `hamiltonian`，按 Hamiltonian 升序排列。已有矩阵缺少业务变量映射时，交付原始求解结果。

求解超时或取消会结束本地 worker，云端任务状态需核对平台；本插件不提供云端任务续查或取消工具，状态不明时应避免重复提交。
