import { IsingSolverError } from './errors.js'

/** Validate matrix shape and numeric values for direct solver input. */
export function validateIsingMatrix(matrix) {
  if (!Array.isArray(matrix) || matrix.length === 0) {
    throw new IsingSolverError('INVALID_MATRIX', 'ising_matrix must be a non-empty 2D array')
  }

  const n = matrix.length
  for (let i = 0; i < n; i++) {
    const row = matrix[i]
    if (!Array.isArray(row)) {
      throw new IsingSolverError('INVALID_MATRIX', `ising_matrix row ${i} must be an array`)
    }
    if (row.length !== n) {
      throw new IsingSolverError(
        'INVALID_MATRIX',
        `ising_matrix must be square: expected row ${i} to contain ${n} values, received ${row.length}`,
      )
    }
    for (let j = 0; j < n; j++) {
      const value = row[j]
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new IsingSolverError(
          'INVALID_MATRIX',
          `ising_matrix[${i}][${j}] must be a finite number`,
        )
      }
    }
  }

  return n
}
