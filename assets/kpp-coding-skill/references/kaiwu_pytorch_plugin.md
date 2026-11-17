# Kaiwu-PyTorch-Plugin（KPP）规则

## 安装包与依赖

**pip 包名：`kaiwu-torch-plugin`；Python 导入：`kaiwu.torch_plugin`。**
KPP **0.3.0** 的 `Requires-Dist` 固定以下依赖：

| 依赖 | 版本 |
|---|---|
| kaiwu | 1.3.1 |
| torch | 2.7.0 |
| numpy | 2.2.6 |

使用 Python 3.10 的独立 KPP 环境。可用 `importlib.metadata.requires('kaiwu-torch-plugin')` 查看实际依赖声明，并用目标解释器检查当前平台的 wheel 支持。

`kaiwu==1.3.1` 只提供 cp310 wheel（macOS x86_64/arm64、manylinux x86_64、Windows amd64；
无 Linux aarch64），而 PyPI 上的 KPP 声明 `requires_python>=3.8`。因此在 3.11/3.12 上
dry-run 会报 kaiwu 没有匹配版本。这表示需要独立的 3.10 环境，不是结束条件。

## 自动安装流程

当用户要求使用 KPP，或任务选择了需要 SDK 采样的能量模型路线，主动完成以下步骤。
已经明确的项目环境不重复询问；普通 ML 任务不要仅因出现“训练”“生成”就安装 KPP。
已有本次依赖与导入检查结果时直接复用，进入任务模型的训练与验证。

1. 找到用户指定/项目使用的解释器，检查 Python、KPP、Kaiwu 和 torch 的实际版本。
2. 兼容且已安装时直接复用。缺包时才用目标解释器运行
   `python -m pip install --dry-run kaiwu-torch-plugin`，确认兼容后安装。
3. 如果解释器不是 3.10、计划会降级项目原有 Kaiwu 1.4.x 或破坏其他依赖，且任务允许隔离环境，
   在允许修改的项目目录内创建独立 Python 3.10 环境：

   ```bash
   python3.10 -m venv .venv-kpp
   ./.venv-kpp/bin/python -m pip install kaiwu-torch-plugin
   ./.venv-kpp/bin/python -m pip check
   ```

   Windows 对应 `.venv-kpp\Scripts\python.exe`。已有 uv 可用
   `uv venv --python 3.10 --seed .venv-kpp` 创建环境。后续命令显式指定该环境的解释器；
   绝对路径或项目内相对路径均可，按工具允许的调用方式执行，
   不依赖终端中 `pip` 恰好属于哪个环境。不强行把当前 KPP 0.3.0 装到 SDK 1.4.x 中，
   不用 `--no-deps` 绕开依赖冲突。
4. 从技能目录运行随包提供的验证脚本（把 `python` 换为 KPP 环境的解释器）：

   ```bash
   python scripts/verify_kpp.py --imports-only
   # 输出 KPP_IMPORT_OK：版本可读取且六个核心组件与 SA 导入成功；尚未验证求解授权。
   python scripts/verify_kpp.py
   # 输出 KPP_TRAIN_OK：真实 SA 采样、RBM 训练和参数更新通过。
   # 输出 KPP_LICENSE_MISSING 并以退出码 2 结束：目标环境需完成 SDK 授权后重试。
   ```

同一环境的依赖检查和导入检查各执行一次；验证脚本已包含解释器与版本，直接复用
输出保存记录。原环境前后比较只覆盖任务明确要求的项目，不默认扫描全部文件。
安装任务不额外构造模型、探测内部属性或试跑训练；已有检查结果不重复执行。
使用用户提供的离线包时，安装计划和实际安装都带 `--no-index --find-links <离线目录>`；
wheel 元数据直接从压缩包读取，无需解包后注入环境。

默认训练检查使用 4 个可见单元 + 3 个隐藏单元，在 CPU 上运行 3 步；不调用云端 CIM。
任务已有可运行程序时，直接验证该程序，无需再执行额外的通用训练检查。
只验证安装时用 `--imports-only`。任务提供兼容本地采样器时直接复用，授权需求由采样器决定；
SDK SA 与验证脚本的本地训练检查使用 KPP 解释器中的 License。在 DSH 中，通过 KPP 解释器运行[授权入口](../../../python/qboson_ising_worker/worker.py)的 `--configure-license` 模式，在窗口中填写用户 ID 和 SDK Code，随后使用同一解释器运行验证脚本。验证脚本也支持从用户设置的 `KAIWU_USER_ID`、`KAIWU_SDK_CODE` 环境变量初始化 SDK。

SPQC 真机采样调用 `prepare_kaiwu_runtime` 准备插件的矩阵求解环境，并通过 `solve_ising_file` 提交。云端授权由插件管理；KPP 解释器运行模型、精度处理与解码。两个解释器各自检查其实际使用的 SDK 授权。

如果没有兼容 wheel、依赖解析失败、或用户要求必须共用一个与 KPP 冲突的固定环境，
从版本、wheel 元数据及安装计划确定冲突后，保存记录并结束；不解包注入 `PYTHONPATH`
或用 `--target` 绕开依赖继续导入。检查日志与临时文件同样只能写入任务允许的目录；
保存 pip 输出时用项目内如 `./环境检查.log`，不要重定向到 `/tmp` 或其他目录。
不要跳过依赖检查或循环重装。所选 SDK 求解器授权缺失时仍可完成安装与导入检查，
明确标注该求解器未验证；使用它时通过对应解释器的授权窗口完成初始化。KPP/RBM 检查通过不代表特定 QVAE、
QDiffusion 架构或云端 CIM 已验证，后续按实际任务测试。

## 范围与公共模型

从 `kaiwu.torch_plugin` 导入模型：

- `RestrictedBoltzmannMachine`：二部可见/隐藏能量模型。
- `BoltzmannMachine`：全连接能量模型。
- `UnsupervisedDBN`：RBM 堆栈。
- `QVAE`：构造时注入 encoder/decoder/bm/sampler，或子类实现四个 `_create_*` 工厂。
- `QDiffusion`、`QDiffusionConfig`、`EnergyModel`：引导式离散生成。
- `FeatureSelectionWrapper`、`QuadraticLinearSolver`：MAIFS 特征选择，为 PyTorch 模型
  维护 0/1 输入掩码，周期性用梯度+Hessian 构造 QUBO 求解。

KPP 是 PyTorch 包。不依附模型的常规组合优化问题直接用 Kaiwu SDK 的 `QuboModel`，不要
绕道 RBM/BM 或特征选择包装器。

## 采样器契约与 BM/RBM 训练

`AbstractBoltzmannMachine.sample(sampler)` 把 NumPy Ising 矩阵传给
`sampler.solve`。采样器必须返回形状 `(sample_count, num_nodes + 1)`、取值
`-1/+1` 的数组；最后一列是参考自旋。KPP 把该输出转成 `0/1` 的
`torch.FloatTensor` 并移到 `model.device`。

BM 的正相直接使用观测变量；RBM 的正相使用 `get_hidden(batch, bernoulli=True)`
补出隐藏状态。按任务需要的结构选择，训练函数见 [BM/RBM 对照示例](examples.md)。

`batch`、模型及手动创建的张量保持在 `model.device` 上。
`get_hidden`/`get_visible` 处理二元 0/1 态；`sample` 尽管接收 SDK 的自旋
样本，返回的已是二元态。调用 `objective` 前先核对正负相宽度一致：
BM 为观测节点数，RBM 为 `num_visible + num_hidden`。

条件 BM 采样用 `BoltzmannMachine.condition_sample(sampler, s_visible)`。
它对每个可见行调用一次求解器，返回拼接的可见+隐藏二元态。
固定的总是前 `s_visible.shape[1]` 个节点；已知位置逐行不同时，先按“已知在前”置换
`linear_bias` 与对称化 `quadratic_coef` 建临时模型，采样后再逆置换列。耗时随条件行数线性增长。需要本地
Gibbs 采样而非 SDK 求解器时，用 `gibbs_sample`。
若测试采样器约定每次返回多条固定解，每个条件都收到完整的这些解；不能按条件挑一条并重复。
逐行核对自由变量为 `(spins[:, :-1] * spins[:, -1:] + 1) / 2`，再检查拼回的条件列。

## 真机采样与精度

在 DSH 中，SPQC 真机任务统一通过 `solve_ising_file` 或 `solve_ising` 提交，插件负责真机运行环境、授权检查、任务名生成、云端提交与轮询。训练脚本负责生成矩阵、处理精度和读取候选，AI 负责协调脚本与工具调用。

KPP 0.3.0 使用 Kaiwu 1.3.1 的精度 API；`PrecisionReducer` 位于 `kaiwu.cim`。按实际 SDK 接口完成精度处理，保存模型变量、参考自旋及精度还原信息，将最终提交矩阵保存为 UTF-8 CSV 或 JSON。

AI 调用 `solve_ising_file({"matrix_path":"<矩阵绝对路径>","result_path":"<结果绝对路径>"})`，读取结果文件中的完整原始自旋。按映射恢复至模型维度，交给 KPP 完成参考自旋归一化和 0/1 转换。具体训练代码根据任务组织矩阵导出、候选读取及状态恢复。

真机任务名由插件统一生成，以求解工具返回的 `task_name` 为准。`saved=false` 时保存返回的 `raw_result_json` 再继续；超时或取消时保留训练状态并核对平台任务状态。

## 模型专属约束

`UnsupervisedDBN` 使用前必须先 `create_rbm_layer(input_dim)`，在
`forward`/`transform` 前必须 `mark_as_trained()`。`QVAE` 的 encoder/decoder/bm/sampler
要么构造时注入，要么由子类的四个 `_create_*` 工厂创建；既未注入也无工厂创建的组件
静默为 `None`，直到 forward 才报 `'NoneType' object is not callable`。
QDiffusion 需要提供 proposal 模型、`EnergyModel` 实现、`SequenceTokenSpec`
与能量适配器；使用仓库 `example/qdiffusion` 的工作流，不要发明 backbone
专属接口。

`FeatureSelectionWrapper(model, feature_dim, ...)` 用 `fit_weights(loader, loss_fn, optimizer,
train_epochs)` 训练，optimizer 作用于 `sel.model.parameters()`。`mask_update_epochs=None`
时只在手动 `update_mask(...)` 时刷新掩码。本地后端可选 `solver="local_search"`，或在 KPP 环境授权后使用 `"sa"`。真机特征选择保存当前 QUBO、变量顺序与数量约束，交由插件求解对应的 Ising 矩阵；从实际候选恢复掩码并验证特征数量，再继续权重训练。具体代码依据当前 KPP 版本接口生成。

`update_mask` 的耗时主要在 QUBO 求解，随特征数快速增长，
`hessian_mode`/`max_samples` 只影响导数计算部分。

KPP 的用量统计默认对经其采样触达的 SDK SA/CIM 调用开启。若任务要求关闭，
显式调用 `kaiwu.torch_plugin.disable_usage_stats()`，并在运行记录中注明统计设置。
