# QBoson Ising Solver for DeepSeek Harness

<p align="center">
  <a href="https://www.qboson.com/"><img alt="玻色量子官网" src="https://img.shields.io/badge/QBoson-%E7%8E%BB%E8%89%B2%E9%87%8F%E5%AD%90%E5%AE%98%E7%BD%91-2563EB?style=flat"></a>
  <a href="https://kaiwu.qboson.com/"><img alt="Kaiwu 社区" src="https://img.shields.io/badge/Kaiwu-%E7%A4%BE%E5%8C%BA-2563EB?style=flat"></a>
  <a href="https://platform.qboson.com/"><img alt="专用量子计算云平台" src="https://img.shields.io/badge/SPQC-%E9%87%8F%E5%AD%90%E4%BA%91%E5%B9%B3%E5%8F%B0-0F766E?style=flat"></a>
  <a href="https://github.com/qboson/kaiwu-coding-skill"><img alt="Kaiwu Coding Skill" src="https://img.shields.io/badge/GitHub-Kaiwu_Coding_Skill-181717?style=flat&amp;logo=github&amp;logoColor=white"></a>
  <a href="https://github.com/qboson/kpp-coding-skill"><img alt="KPP Coding Skill" src="https://img.shields.io/badge/GitHub-KPP_Coding_Skill-181717?style=flat&amp;logo=github&amp;logoColor=white"></a>
  <a href="https://www.npmjs.com/package/@deepseek-ai/dsh?activeTab=versions"><img alt="Supported DSH versions: 0.2.0-rc.2+" src="https://img.shields.io/badge/DSH-0.2.0--rc.2%2B-4d6bfe" /></a>
</p>

`dsh-qboson-ising-solver` 是面向 DeepSeek Harness 的玻色量子（QBoson）建模与求解插件，支持基于 Kaiwu SDK 构建 QUBO / Ising 模型、调用 QBoson SPQC 真机并处理业务结果，以及使用 Kaiwu PyTorch Plugin（KPP）构建、训练和验证能量模型。

- **业务问题建模**：根据业务目标、数据和约束，生成并运行 Kaiwu 建模代码，支持选址、调度、路径规划、覆盖等组合优化问题，以及基于 KPP 的能量模型、离散生成和 PyTorch 特征选择。
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
请用 QBoson 真机求解带权顶点覆盖问题：
顶点成本为 [3,2,4]，边为 [(0,1),(1,2)]。
给出选中的顶点和总成本，并验证每条边都被覆盖。
```

Agent 根据需求完成建模与求解，输出业务方案、约束检查和目标值，并保存相关代码与结果。[顶点覆盖示例](examples/kaiwu-workflow.py)可供参考。

### KPP 能量模型与训练

向 Agent 描述数据、模型用途和验收指标，可使用 KPP 构建 BM / RBM、DBN、QVAE、QDiffusion，或为 PyTorch 模型做特征选择。例如：

```text
请使用 KPP 为这份二元数据训练 RBM，检查采样、损失与参数更新，
保存模型和配置，并在新进程中加载模型验证生成结果。
```

Agent 按任务需要检查和准备 KPP 运行环境，生成训练代码，保存模型并验证效果。需要真机采样时，由插件完成求解；出现授权窗口时按提示填写即可。

### 求解已有矩阵

提供 Ising 矩阵文件，或在对话中直接粘贴矩阵，并说明要求。例如：

```text
请用 QBoson 真机求解 C:/work/matrix.csv 中的 Ising 矩阵，
保存完整结果，并报告最佳候选、能量、求解耗时和任务名。
```

支持 CSV / JSON 文件，格式可参考 [CSV 示例](examples/ising-matrix-10.csv)和 [JSON 示例](examples/ising-matrix-10.json)。直接提供矩阵时，例如 `[[0,-1],[-1,0]]`。如需还原业务方案，请同时提供变量含义或映射。

求解超时或取消后，可按任务名到平台核对状态。云端任务可能仍在运行，确认状态后再决定是否重新提交。
