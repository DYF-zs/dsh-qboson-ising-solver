import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { IsingSolverService } from './service.js'
import { validateIsingMatrix } from './matrix.js'
import { validateAndNormalizeResult } from './result.js'
import { KaiwuWorkerClient } from './worker-client.js'
import { ManagedKaiwuRuntime } from './runtime-manager.js'
import { IsingSolverError } from './errors.js'

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const DEFAULT_WORKER_PATH = resolve(PACKAGE_ROOT, 'python', 'qboson_ising_worker', 'worker.py')
const DEFAULT_TIMEOUT_MS = 3_600_000
const DEFAULT_GRACE_MS = 5_000

function positiveInteger(value, fallback, name) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new IsingSolverError('INVALID_CONFIG', `${name} must be a positive integer`)
  }
  return parsed
}

function optionalString(value) {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text.length > 0 ? text : undefined
}

/** Kaiwu SDK provider for ctx.isingSolver. */
export default class KaiwuIsingSolverProvider extends IsingSolverService {
  static inject = ['subprocess']

  constructor(ctx, config = {}) {
    super(ctx)

    this.ctx = ctx

    this.timeoutMs = positiveInteger(
      config.timeoutMs ?? process.env.ISING_DSH_TIMEOUT_MS,
      DEFAULT_TIMEOUT_MS,
      'timeoutMs',
    )

    const graceMs = positiveInteger(
      config.graceMs ?? process.env.ISING_DSH_GRACE_MS,
      DEFAULT_GRACE_MS,
      'graceMs',
    )

    const intervalMinutes = positiveInteger(
      config.intervalMinutes ?? process.env.KAIWU_CIM_INTERVAL_MINUTES,
      1,
      'intervalMinutes',
    )

    this.baseEnv = {
      KAIWU_PROJECT_NO: optionalString(config.projectNo ?? process.env.KAIWU_PROJECT_NO),
      KAIWU_CHECKPOINT_DIR: optionalString(config.checkpointDir ?? process.env.KAIWU_CHECKPOINT_DIR),
      KAIWU_TASK_NAME_PREFIX: optionalString(config.taskNamePrefix ?? process.env.KAIWU_TASK_NAME_PREFIX) ?? 'ising_dsh',
      KAIWU_CIM_INTERVAL_MINUTES: String(intervalMinutes),
      ISING_DSH_LOG_PATH: optionalString(config.logPath ?? process.env.ISING_DSH_LOG_PATH),
      ISING_DSH_LOG_LEVEL: optionalString(config.logLevel ?? process.env.ISING_DSH_LOG_LEVEL) ?? 'INFO',
      PYTHONUTF8: '1',
    }

    this.runtime = new ManagedKaiwuRuntime(ctx, config)
    this.client = undefined
    this.clientPython = undefined
    this.activeSolves = 0
    this.authorizationInProgress = false
    this.workerPath = optionalString(config.workerPath ?? process.env.QBOSON_ISING_WORKER_PATH) ?? DEFAULT_WORKER_PATH
    this.cwd = optionalString(config.cwd) ?? process.cwd()
    this.graceMs = graceMs

    ctx.effect(() => () => this.client?.dispose())
  }

  async workerClient(signal) {
    const python = await this.runtime.resolvePython(signal)
    if (this.client && this.clientPython === python) return this.client
    if (this.client) await this.client.dispose()
    this.clientPython = python
    this.client = new KaiwuWorkerClient(this.ctx, {
      pythonExecutable: python,
      workerPath: this.workerPath,
      cwd: this.cwd,
      graceMs: this.graceMs,
    })
    return this.client
  }

  async checkRuntime(signal) {
    signal?.throwIfAborted()
    const environment = await this.runtime.inspectEnvironment()
    const result = { ...environment, license_status: 'not_checked', runtime_dir: this.runtime.root }
    if (!environment.python_executable) return result
    try {
      const stdout = await this.runtime.runChecked(
        [environment.python_executable, '-B', this.workerPath, '--check-runtime'],
        { env: { PYTHONUTF8: '1', PYTHONDONTWRITEBYTECODE: '1' }, signal, cwd: this.cwd, code: 'RUNTIME_CHECK_FAILED' },
      )
      Object.assign(result, JSON.parse(stdout))
      const expectedVersion = /^kaiwu==([^\s]+)$/.exec(this.runtime.kaiwuSpec)?.[1]
      if (environment.environment_status === 'invalid'
        || (!this.runtime.explicitPython && expectedVersion && result.kaiwu_version !== expectedVersion)) {
        result.environment_status = 'invalid'
        result.message = '运行环境需要更新，请调用 prepare_kaiwu_runtime。'
      }
    } catch {
      signal?.throwIfAborted()
      result.environment_status = 'invalid'
      result.message = 'Python 运行环境无法检查，请调用 prepare_kaiwu_runtime。'
    }
    return result
  }

  async prepareRuntime(signal) {
    const status = await this.checkRuntime(signal)
    if (status.environment_status === 'ready' && status.license_status === 'valid') {
      const { python_executable, python_version, kaiwu_version, runtime_dir } = status
      return { python_executable, python_version, kaiwu_version, runtime_dir }
    }
    return this.configureLicense(signal, { prepare: true })
  }

  async configureLicense(signal, { prepare = false } = {}) {
    if (this.activeSolves || this.authorizationInProgress) {
      throw new IsingSolverError('KAIWU_RUNTIME_BUSY', '当前有求解或授权操作正在进行，请完成后重试。')
    }
    this.authorizationInProgress = true
    try {
      const python = await this.runtime.resolvePython(signal, prepare ? undefined : { autoSetup: false })
      const mode = prepare ? '--authorize' : '--configure-license'
      const stdout = await this.runtime.runChecked([python, this.workerPath, mode], {
        env: { PYTHONUTF8: '1' }, signal, code: 'LICENSE_ERROR',
      })
      const info = {
        ...JSON.parse(stdout),
        runtime_dir: this.runtime.root,
      }
      await this.client?.dispose()
      this.client = undefined
      this.clientPython = undefined
      return info
    } finally {
      this.authorizationInProgress = false
    }
  }

  async solve(request, signal) {
    const dimension = validateIsingMatrix(request?.isingMatrix)
    if (this.authorizationInProgress) {
      throw new IsingSolverError('KAIWU_RUNTIME_BUSY', '正在配置 Kaiwu 环境或授权，请完成后重试。')
    }
    this.activeSolves++
    try {
      const client = await this.workerClient(signal)
      const raw = await client.request(
        { op: 'solve', ising_matrix: request.isingMatrix },
        signal,
        this.timeoutMs,
        this.baseEnv,
      )
      return validateAndNormalizeResult(raw, dimension)
    } finally {
      this.activeSolves--
    }
  }
}
