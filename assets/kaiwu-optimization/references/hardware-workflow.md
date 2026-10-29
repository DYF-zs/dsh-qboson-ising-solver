# SPQC 求解规范

真机求解通过 DSH 的 `solve_ising_file` 或 `solve_ising` 工具提交，插件负责凭据解析、License 初始化和 SDK 调用。
[CIM 模块](module_docs/enterprise/cim.md) 提供 SDK 接口说明。

- 根据目标设备核对系数位宽和维度，参考自旋与精度拆分变量均计入总维度。
- 在建模脚本中完成精度处理，保存比例、误差分析和还原映射。缩放取整可能改变最优解，拆分后需验证还原关系及原矩阵能量。
  系数满足整数要求后使用 int64 数组计算，避免 int8 点积溢出。精度 API 见 [Enterprise API](kaiwu_enterprise.md)。
- 求解工具按输入矩阵提交，结果记录完整 ±1 自旋、Hamiltonian、耗时与任务名；文件工具还记录矩阵 SHA-256。
- DSH 真机任务名由插件统一生成，默认使用 `ising_dsh` 前缀，格式为 `ising_dsh_<随机标识>`。插件配置 `taskNamePrefix` 或环境变量 `KAIWU_TASK_NAME_PREFIX` 可设置前缀，任务追踪使用返回的完整 `task_name`。
- `KAIWU_CIM_INTERVAL_MINUTES` 控制轮询间隔，单位为分钟。使用持久的 checkpoint 目录，保留求解日志以便核对任务。
- 超时、取消或网络错误后核对平台任务状态。插件的本地调用结束时，云端任务仍可能运行；云端续查与取消通过平台处理，状态不明时暂停重复提交。
- 先保存原始结果，再根据变量映射和精度信息还原候选，处理参考自旋，逐项检查原业务约束并重新计算目标值。
