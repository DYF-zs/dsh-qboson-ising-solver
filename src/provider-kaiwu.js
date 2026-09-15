import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { credentialRef } from '@deepseek-ai/dsh-credentials'
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
const DEFAULT_USER_ID_REF = 'QBOSON_USER_ID'
const DEFAULT_SDK_CODE_REF = 'QBOSON_SDK_CODE'

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
  static inject = ['subprocess', 'credentials']

  constructor(ctx, config = {}) {
    super(ctx)

    this.ctx = ctx
    this.userIdRef = credentialRef(config.userIdCredential ?? DEFAULT_USER_ID_REF)
    this.sdkCodeRef = credentialRef(config.sdkCodeCredential ?? DEFAULT_SDK_CODE_REF)

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
    this.workerPath = optionalString(config.workerPath ?? process.env.QBOSON_ISING_WORKER_PATH) ?? DEFAULT_WORKER_PATH
    this.cwd = optionalString(config.cwd) ?? process.cwd()
    this.graceMs = graceMs

    ctx.effect(() => () => this.client?.dispose())
  }

  async resolveCredential(ref, label) {
    const hit = await this.ctx.credentials.resolve(ref)
    if (hit?.value) return hit.value
    throw new IsingSolverError(
      'LICENSE_CONFIG_MISSING',
      `${label} is not configured. Store ${String(ref)} through the Harness credentials service.`,
    )
  }

  async workerEnv() {
    const [userId, sdkCode] = await Promise.all([
      this.resolveCredential(this.userIdRef, 'QBoson user ID'),
      this.resolveCredential(this.sdkCodeRef, 'QBoson SDK code'),
    ])

    return {
      ...this.baseEnv,
      QBOSON_USER_ID: userId,
      QBOSON_SDK_CODE: sdkCode,
    }
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

  async solve(request, signal) {
    const dimension = validateIsingMatrix(request?.isingMatrix)
    const [env, client] = await Promise.all([
      this.workerEnv(),
      this.workerClient(signal),
    ])
    const raw = await client.request(
      { op: 'solve', ising_matrix: request.isingMatrix },
      signal,
      this.timeoutMs,
      env,
    )
    return validateAndNormalizeResult(raw, dimension)
  }
}
