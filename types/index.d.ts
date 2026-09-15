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

export class IsingSolverError extends Error {
  readonly code: string
  readonly details?: unknown
  constructor(code: string, message: string, details?: unknown)
}

export class IsingSolverService extends Service {
  constructor(ctx: Context)
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
  resolvePython(signal?: AbortSignal): Promise<string>
  ensureSetup(signal?: AbortSignal): Promise<void>
}

export function defaultRuntimeRoot(env?: Record<string, string | undefined>): string
export function venvPythonPath(venvDir: string, platform?: string): string
