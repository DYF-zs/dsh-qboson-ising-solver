# QBoson Ising Solver for DeepSeek Harness

`dsh-qboson-ising-solver` 为 DeepSeek Harness 提供 `solve_ising` Tool，使用 Kaiwu SDK 的 `CIMOptimizer` 将已完成建模的 Ising Matrix 提交到 QBoson SPQC，并返回 spin solutions、Hamiltonian、求解耗时与任务标识。

输入契约为已完成建模、可直接求解的完整 `N × N` 数值 Ising Matrix。问题建模由调用侧完成，求解规模遵循 Kaiwu SDK、License、Project 与 SPQC 的能力约束。

## 工作方式

```text
Agent / LLM
    |
    v
solve_ising Tool
    |
    v
ctx.isingSolver
    ^
    |
Kaiwu Solver Provider
    |
    v
Managed Python 3.10 Runtime
    |
    v
Kaiwu SDK -> CIMOptimizer -> QBoson SPQC
```

插件在 `$DSH_HOME/runtimes/dsh-qboson-ising-solver` 维护独立的 Python 3.10 运行时。首次求解时自动准备运行时并安装 `kaiwu`，后续启动直接复用。

## 安装

**GitHub 直接安装**

```bash
dsh plugin --profile web add github:DYF-zs/dsh-qboson-ising-solver
```

**Git Clone + 本地安装**

```bash
git clone https://github.com/DYF-zs/dsh-qboson-ising-solver.git
cd dsh-qboson-ising-solver
dsh plugin --profile web add "link:$PWD"
```

## 配置 QBoson 凭据

在 Windows 中，将 QBoson 凭据写入下面这个文件：

```text
C:\Users\<Windows 用户名>\.dsh\.credentials.yaml
```

如果 `.dsh` 目录或 `.credentials.yaml` 文件不存在，直接新建即可。也可以在 PowerShell 中执行：

```powershell
New-Item -ItemType Directory -Force "$HOME\.dsh" | Out-Null
notepad "$HOME\.dsh\.credentials.yaml"
```

在文件中写入：

```yaml
refs:
    QBOSON_USER_ID: "QBoson User ID"
    QBOSON_SDK_CODE: "QBoson SDK Code"
```

保存文件即可。插件会通过 DeepSeek Harness 的 credentials Service 读取这两个值，并在启动 Kaiwu worker 时用于 License 初始化。

## 启动

在 DeepSeek Harness 源码仓库根目录运行：

```powershell
pnpm dsh web
```

首次调用 `solve_ising` 时，插件会自动完成：

```text
准备固定版本 uv
    ↓
准备 Python 3.10
    ↓
创建插件私有 venv
    ↓
安装 kaiwu
    ↓
启动 Kaiwu worker
    ↓
初始化 QBoson License
    ↓
提交 CIMOptimizer 任务
```

运行时目录：

```text
$DSH_HOME/runtimes/dsh-qboson-ising-solver/
├── uv/
├── python/
├── uv-cache/
├── venv/
└── runtime.json
```

## 使用

向 Agent 提供已经完成建模的 Ising Matrix，例如：

```text
使用 solve_ising 求解下面的 Ising Matrix：

[
  [0,-1,0,-1,-1,0,0,-1,-1,0],
  [-1,0,-1,0,0,-1,-1,-1,0,0],
  [0,-1,0,-1,-1,0,0,0,-1,0],
  [-1,0,-1,0,0,-1,-1,0,-1,0],
  [-1,0,-1,0,0,-1,0,-1,0,-1],
  [0,-1,0,-1,-1,0,0,0,-1,-1],
  [0,-1,0,-1,0,0,0,0,0,-1],
  [-1,-1,0,0,-1,0,0,0,-1,0],
  [-1,0,-1,-1,0,-1,0,-1,0,-1],
  [0,0,0,0,-1,-1,-1,0,-1,0]
]
```

Tool 输入：

```json
{
  "ising_matrix": [
    [0.0, -1.0, 0.5],
    [-1.0, 0.0, 0.2],
    [0.5, 0.2, 0.0]
  ]
}
```

输入验证包括：

- Matrix 非空；
- Matrix 为二维数组；
- 行列维度一致；
- 所有元素均为有限数值。

Kaiwu 求解调用：

```python
optimizer = CIMOptimizer(
    task_name=task_name,
    wait=True,
    interval=interval,
    project_no=project_no,
    task_mode=TaskMode.OPTIMIZATION,
)

solutions = optimizer.solve(
    matrix,
    negtail_flip=False,
    sort_solutions=True,
)

hamiltonians = optimizer.get_hamiltonian()
```

Tool 输出：

```json
{
  "dimension": 10,
  "solutions": [
    {
      "spins": [-1, 1, -1, 1, 1, -1, -1, -1, 1, 1],
      "hamiltonian": -30.0
    }
  ],
  "solver_time_us": 5707040.0,
  "task_name": "ising_dsh_0123456789ab"
}
```

结果按 Hamiltonian 从低到高排列。每个 spin solution 的长度与 Matrix dimension 一致，spin 值属于 `{-1,+1}`。

## 求解配置

以下配置可通过启动 Harness 的进程环境设置：

```text
KAIWU_PROJECT_NO
KAIWU_CHECKPOINT_DIR        默认 ~/.qboson-ising-dsh/checkpoints
KAIWU_TASK_NAME_PREFIX      默认 ising_dsh
KAIWU_CIM_INTERVAL_MINUTES  默认 1
ISING_DSH_TIMEOUT_MS        默认 3600000
ISING_DSH_GRACE_MS          默认 5000
ISING_DSH_LOG_PATH          默认 ~/.qboson-ising-dsh/logs/worker.log
ISING_DSH_LOG_LEVEL         默认 INFO
```

运行时管理配置：

```text
QBOSON_ISING_RUNTIME_DIR    插件私有运行时目录
QBOSON_ISING_PYTHON         指定兼容的 Python 3.10 解释器
QBOSON_KAIWU_SPEC           Kaiwu 安装规格，默认 kaiwu
```

`QBOSON_ISING_PYTHON` 指向的解释器需要为 Python 3.10，并能够导入 `kaiwu`。

## 生命周期与取消

`solve_ising` 的取消信号会传递给 `ctx.isingSolver`。求解超时或取消时，插件结束当前 worker；后续调用会创建新的 worker。Provider Fiber 卸载时，Cordis effect 负责结束 worker。

插件私有 Python 运行时作为持久安装状态保存在 `$DSH_HOME/runtimes/dsh-qboson-ising-solver`，供后续 Harness 会话复用。

## 诊断

插件提供：

```text
dsh-ising-doctor
```

用于查看 Harness Home、运行时位置、Python/Kaiwu 状态和凭据配置状态。诊断输出只显示凭据是否已配置。

运行时已准备后，可执行 License 检查：

```powershell
node C:\Users\<Windows 用户名>\Desktop\dsh-qboson-ising-solver\bin\dsh-ising-doctor.js --license
```

## 卸载插件

从 `web` profile 中移除 QBoson Ising Solver：

```bash
dsh plugin --profile web remove dsh-qboson-ising-solver