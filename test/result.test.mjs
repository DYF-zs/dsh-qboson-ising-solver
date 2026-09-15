import test from 'node:test'
import assert from 'node:assert/strict'
import { validateAndNormalizeResult } from '../src/result.js'

test('validates and sorts solutions by Hamiltonian', () => {
  const result = validateAndNormalizeResult({
    dimension: 2,
    solutions: [
      { spins: [1, -1], hamiltonian: 3 },
      { spins: [-1, -1], hamiltonian: -2 },
    ],
    solver_time_us: 123,
    task_name: 'ising_dsh_test',
  }, 2)
  assert.deepEqual(result.solutions.map((x) => x.hamiltonian), [-2, 3])
})

test('rejects invalid spin values', () => {
  assert.throws(() => validateAndNormalizeResult({
    dimension: 2,
    solutions: [{ spins: [0, 1], hamiltonian: 1 }],
    solver_time_us: 1,
    task_name: 'x',
  }, 2), /must be -1 or \+1/)
})
