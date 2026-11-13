import { Service, type Context } from '@deepseek-ai/cordis'

export interface IsingSolveRequest {
  isingMatrix: number[][]
}

export interface IsingSolution {
  spins: number[]
  hamiltonian: number
}

export interface IsingSolveResult {
  dimension: number
  solutions: IsingSolution[]
  solver_time_us: number
  task_name: string
}

export interface KaiwuRuntimeInfo {
  python_executable: string
  python_version: string
  kaiwu_version: string
  runtime_dir: string
}

export interface KaiwuRuntimeStatus {
  environment_status: 'ready' | 'missing' | 'invalid'
  license_status: 'valid' | 'missing' | 'invalid' | 'not_checked'
  runtime_dir: string
  python_executable?: string
  python_version?: string
  kaiwu_version?: string
  message?: string
}

export class IsingSolverError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown)
}

export class IsingSolverService extends Service {
  constructor(ctx: Context)
  /** Optional environment capability supplied by the Kaiwu provider. */
  prepareRuntime?(signal?: AbortSignal): Promise<KaiwuRuntimeInfo>
  checkRuntime?(signal?: AbortSignal): Promise<KaiwuRuntimeStatus>
  /** Open License configuration to renew authorization or switch accounts. */
  configureLicense?(signal?: AbortSignal): Promise<KaiwuRuntimeInfo>
  solve(request: IsingSolveRequest, signal?: AbortSignal): Promise<IsingSolveResult>
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    isingSolver: IsingSolverService
  }
}

export function validateIsingMatrix(matrix: unknown): number
export function validateAndNormalizeResult(value: unknown, expectedDimension: number): IsingSolveResult

export interface ManagedKaiwuRuntimeConfig {
  pythonExecutable?: string
  runtimeDir?: string
  autoSetup?: boolean
  kaiwuSpec?: string
}

export class ManagedKaiwuRuntime {
  constructor(ctx: Context, config?: ManagedKaiwuRuntimeConfig)
  readonly root: string
  readonly managedPython: string
  resolvePython(signal?: AbortSignal, options?: { autoSetup?: boolean }): Promise<string>
  inspectEnvironment(): Promise<Pick<KaiwuRuntimeStatus, 'environment_status' | 'python_executable'>>
  ensureSetup(signal?: AbortSignal): Promise<void>
}

export function defaultRuntimeRoot(env?: Record<string, string | undefined>): string
export function venvPythonPath(venvDir: string, platform?: string, manager?: 'uv' | 'conda'): string
