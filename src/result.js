import { IsingSolverError } from './errors.js'

export function validateAndNormalizeResult(value, expectedDimension) {
  if (!value || typeof value !== 'object') {
    throw new IsingSolverError('RESULT_VALIDATION_ERROR', 'solver returned a non-object result')
  }

  const dimension = value.dimension
  if (!Number.isInteger(dimension) || dimension <= 0 || dimension !== expectedDimension) {
    throw new IsingSolverError(
      'RESULT_VALIDATION_ERROR',
      `solver returned invalid dimension ${String(dimension)}; expected ${expectedDimension}`,
    )
  }

  if (!Array.isArray(value.solutions) || value.solutions.length === 0) {
    throw new IsingSolverError('RESULT_VALIDATION_ERROR', 'solver returned no solutions')
  }

  const solutions = value.solutions.map((candidate, index) => {
    if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.spins)) {
      throw new IsingSolverError('RESULT_VALIDATION_ERROR', `solution ${index} is malformed`)
    }
    if (candidate.spins.length !== dimension) {
      throw new IsingSolverError(
        'RESULT_VALIDATION_ERROR',
        `solution ${index} has ${candidate.spins.length} spins; expected ${dimension}`,
      )
    }
    const spins = candidate.spins.map((spin, spinIndex) => {
      if (spin !== -1 && spin !== 1) {
        throw new IsingSolverError(
          'RESULT_VALIDATION_ERROR',
          `solution ${index} spin ${spinIndex} must be -1 or +1`,
        )
      }
      return spin
    })
    if (typeof candidate.hamiltonian !== 'number' || !Number.isFinite(candidate.hamiltonian)) {
      throw new IsingSolverError(
        'RESULT_VALIDATION_ERROR',
        `solution ${index} has an invalid Hamiltonian`,
      )
    }
    return { spins, hamiltonian: candidate.hamiltonian }
  })

  solutions.sort((a, b) => a.hamiltonian - b.hamiltonian)

  if (typeof value.solver_time_us !== 'number' || !Number.isFinite(value.solver_time_us) || value.solver_time_us < 0) {
    throw new IsingSolverError('RESULT_VALIDATION_ERROR', 'solver_time_us must be a non-negative finite number')
  }
  if (typeof value.task_name !== 'string' || value.task_name.length === 0) {
    throw new IsingSolverError('RESULT_VALIDATION_ERROR', 'task_name must be a non-empty string')
  }

  return {
    dimension,
    solutions,
    solver_time_us: value.solver_time_us,
    task_name: value.task_name,
  }
}
