import { extname } from 'node:path'
import { IsingSolverError } from './errors.js'

/** Read a dense numeric Ising matrix from CSV or JSON. */
export function parseIsingMatrixFile(text, path) {
  const content = text.replace(/^\uFEFF/, '').trim()
  let matrix
  if (extname(path).toLowerCase() === '.csv') {
    matrix = content.split(/\r\n|\n|\r/).map((line, row) => line.split(',').map((cell, column) => {
      let value = cell.trim()
      if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).trim()
      if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)) {
        throw new IsingSolverError('INVALID_MATRIX', `CSV row ${row + 1}, column ${column + 1} must contain a number; use a matrix without headers or row indexes`)
      }
      return Number(value)
    }))
  } else {
    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      throw new IsingSolverError('INVALID_MATRIX', 'Matrix file must contain valid JSON, or use a .csv file for a comma-separated matrix')
    }
    matrix = Array.isArray(parsed) ? parsed : parsed?.ising_matrix
  }
  validateIsingMatrix(matrix)
  return matrix
}

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
