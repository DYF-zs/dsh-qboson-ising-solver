export class IsingSolverError extends Error {
  constructor(code, message, details) {
    super(message)
    this.name = 'IsingSolverError'
    this.code = code
    if (details !== undefined) this.details = details
  }
}

export function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}
