# QBoson Ising Solver for DeepSeek Harness

`dsh-qboson-ising-solver` 是面向 DeepSeek Harness 的玻色量子（QBoson）组合优化插件，基于开物（Kaiwu）SDK，让 AI 智能体能够根据业务需求构建 QUBO / Ising 模型，调用 QBoson SPQC 真机求解，并还原、验证和保存业务结果。

- **业务问题建模**：根据业务目标、数据和约束，生成并运行 Kaiwu 建模代码，支持选址、调度、路径规划、覆盖等组合优化问题。
- **真机求解**：调用 QBoson SPQC 真机，支持直接输入 Ising Matrix 或从 JSON 文件读取矩阵，返回候选自旋解、Hamiltonian 和求解耗时。
- **结果验证**：将自旋解还原为业务方案，检查原始约束、计算业务目标值，并从返回的候选中筛选最佳可行方案。
- **结果保存**：保存建模代码、矩阵、变量映射、原始求解结果和业务方案，记录任务标识，便于复查、追溯与复现。

## 安装

插件版本 `0.2.0`，支持 DSH `0.2.1-rc.2`，适用于本地网页版和桌面版。

**从源码安装到网页版**

```powershell
git clone https://github.com/DYF-zs/dsh-qboson-ising-solver.git
cd dsh-qboson-ising-solver
npm install
dsh plugin --profile web add "link:$PWD"
```

也可通过 GitHub 或 npm 安装相应来源中已发布的版本：

```powershell
dsh plugin --profile web add github:DYF-zs/dsh-qboson-ising-solver

dsh plugin --profile web add dsh-qboson-ising-solver
```

**桌面版安装**

在桌面版插件管理页面安装。本地源码需先执行 `npm install`，然后使用实际目录：

```text
link:C:/Users/<Windows 用户名>/Desktop/dsh-qboson-ising-solver
```

网页版和桌面版分别管理插件。安装包包含真机求解、工具入口、建模指导三个组件，完整使用时需全部启用。本地更新后，完全退出并重新启动对应的 DSH 实例，以加载组件清单。

## 配置凭据与启动

从[玻色量子云平台 SDK 页面](https://platform.qboson.com/sdkDownload)获取用户 ID 和 SDK Code，在 Windows 的以下文件中配置：

```text
C:\Users\<Windows 用户名>\.dsh\.credentials.yaml
```

文件或目录不存在时可自行创建，内容为：

```yaml
refs:
  QBOSON_USER_ID: "QBoson User ID"
  QBOSON_SDK_CODE: "QBoson SDK Code"
```

插件通过 DSH 的凭据服务读取这些值，用于真机 License 初始化。

网页版启动命令：

```powershell
dsh web
```

首次准备环境或求解时，插件自动安装独立的 Python 3.10 和 Kaiwu SDK，需要网络连接。运行环境保存在 `$DSH_HOME/runtimes/dsh-qboson-ising-solver/`，后续直接复用。DSH 的 Shell、文件系统与子进程需要能访问同一工作区。

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

向 Agent 提供矩阵 JSON 文件，或调用 `solve_ising_file`：

```json
{
  "matrix_path": "C:/workspace/cover/matrix.json",
  "result_path": "C:/workspace/cover/raw-result.json"
}
```

两个路径均需为绝对路径，输出目录需要已存在，结果文件需要尚不存在。输入支持二维数组或 `{"ising_matrix": [...]}`，可参考[矩阵文件示例](examples/ising-matrix-10.json)。

工具保存全部原始候选、Hamiltonian、求解耗时、任务标识与矩阵 SHA-256，并返回摘要。`saved=false` 表示求解已完成但保存失败，此时保存返回的 `raw_result_json`，不要重复提交。

### 直接输入已有矩阵

调用 `solve_ising`，例如：

```json
{"ising_matrix": [[0, -1], [-1, 0]]}
```

矩阵需为非空、有限数值的方阵。返回 `dimension`、`solutions`、`solver_time_us` 和 `task_name`；每个候选包含完整的 ±1 自旋及 `hamiltonian`，按 Hamiltonian 升序排列。已有矩阵缺少业务变量映射时，交付原始求解结果。

求解超时或取消会结束本地 worker，云端任务状态需核对平台；本插件不提供云端任务续查或取消工具，状态不明时应避免重复提交。

## 可选配置

以下环境变量由启动 DSH 的进程读取：

| 变量 | 用途或默认值 |
| --- | --- |
| `KAIWU_PROJECT_NO` | 真机 Project 编号 |
| `KAIWU_CHECKPOINT_DIR` | 默认 `~/.qboson-ising-dsh/checkpoints` |
| `KAIWU_TASK_NAME_PREFIX` | 默认 `ising_dsh` |
| `KAIWU_CIM_INTERVAL_MINUTES` | 轮询间隔，默认 1 分钟 |
| `ISING_DSH_TIMEOUT_MS` | 默认 3600000 毫秒 |
| `ISING_DSH_GRACE_MS` | 默认 5000 毫秒 |
| `ISING_DSH_LOG_PATH` | 默认 `~/.qboson-ising-dsh/logs/worker.log` |
| `ISING_DSH_LOG_LEVEL` | 默认 `INFO` |
| `QBOSON_ISING_RUNTIME_DIR` | 插件私有运行环境目录 |
| `QBOSON_ISING_PYTHON` | 指定已安装 Kaiwu 的兼容 Python 3.10 解释器 |
| `QBOSON_KAIWU_SPEC` | Kaiwu 安装规格，默认 `kaiwu` |

## 诊断与卸载

在项目目录运行 `npm run doctor`，或使用安装包提供的 `dsh-ising-doctor`，查看运行环境与凭据配置状态。诊断不会打印凭据值。运行环境准备好后，`node ./bin/dsh-ising-doctor.js --license` 可检查 License。

从网页版移除：

```powershell
dsh plugin --profile web remove dsh-qboson-ising-solver
```

桌面版通过插件管理页面卸载。

## 开发检查

源码保留 `test/` 和 `python/tests/`，npm 安装包只包含运行文件、必要资源和示例。

```powershell
npm install
$env:QBOSON_TEST_PYTHON = "<已安装 Kaiwu 的 Python 3.10 解释器绝对路径>"
npm test
& $env:QBOSON_TEST_PYTHON -B -m unittest discover -s python/tests -p "test_*.py"
```

测试覆盖组件加载、依赖生命周期、矩阵校验、结果保存、SDK 建模与解码，以及 worker 通信。真机边界使用模拟结果，不提交 SPQC 任务；未设置 `QBOSON_TEST_PYTHON` 时，Node 中的 SDK 和子进程集成用例会跳过。
