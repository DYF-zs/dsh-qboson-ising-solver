import test from 'node:test'
import assert from 'node:assert/strict'
import { validateIsingMatrix } from '../src/matrix.js'

test('accepts a 64x64 finite square Ising matrix', () => {
  const matrix = Array.from({ length: 64 }, (_, i) =>
    Array.from({ length: 64 }, (_, j) => (i === j ? 0 : (i + j) % 3 - 1)),
  )
  assert.equal(validateIsingMatrix(matrix), 64)
})

test('rejects a non-square matrix', () => {
  assert.throws(() => validateIsingMatrix([[0, 1], [1]]), /must be square/)
})

test('rejects non-finite values', () => {
  assert.throws(() => validateIsingMatrix([[0, Infinity], [1, 0]]), /finite number/)
})
