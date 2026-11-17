# kaiwu.license 模块参考（Enterprise 1.4.0 源码树）

> license相关

生成自源码 docstring：`kaiwu-sdk-enterprise\src\kaiwu\license`。

## 子模块

| 源文件 | 模块说明 |
|---|---|
| `_license_utils.py` | 用户授权校验相关内容 |
| `_post_sdk_data.py` | 统计SDK使用情况的一些工具 |
| `_track_data.py` | 用户使用习惯跟踪 |
| `license_settings.py` | 光量子计算云平台国内版license配置-生产环境 |
| `license_settings_debug.py` | 光量子计算云平台-测试环境license配置 |
| `license_settings_debug_domestic.py` | 光量子计算云平台国内版license配置-预发布环境 |
| `license_settings_debug_overseas.py` | 光量子计算云平台海外版license配置-预发布环境 |
| `license_settings_release_domestic.py` | 光量子计算云平台国内版license配置-生产环境 |
| `license_settings_release_overseas.py` | 光量子计算云平台海外版license配置-生产环境 |
| `license_settings_release_private.py` | 光量子计算云平台-测试环境license配置 |

### ensure_license
```python
ensure_license()
```

检查license文件是否存在，如果不存在，在控制台提示用户输入user_id 和 sdk_code来下载license

### init
```python
init(user_id, sdk_code)
```

```text
初始化生成license文件, 每次调用都会重新生成license文件

:param user_id: 用户ID
:param sdk_code: SDK授权码
```

### track_data
```python
track_data(alg_name=None, enabled=False)
```

数据追踪装饰器

### verify_license
```python
verify_license(qubits)
```

```text
license校验

:param qubits: 比特数
```

