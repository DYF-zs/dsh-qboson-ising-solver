import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { Context } from '@deepseek-ai/cordis'
import { ToolRuntime } from '@deepseek-ai/dsh-tools'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import * as tools from '../src/tool.js'
import KaiwuProvider from '../src/provider-kaiwu.js'

const matrix = [[0, -1], [-1, 0]]
const result = {
  dimension: 2, solutions: [{ spins: [-1, 1], hamiltonian: -2 }, { spins: [1, -1], hamiltonian: -2 }],
  solver_time_us: 12, task_name: 'test_fixture_not_hardware',
}

async function setup(t, { filesystem = true, runtime = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-ising-workflow-'))
  const ctx = new Context()
  t.after(async () => {
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  ctx.provide('systemPrompt', { tools() {} })
  new ToolRuntime(ctx)
  let fsFiber
  if (filesystem) {
    fsFiber = ctx.plugin(LocalFileSystem, { cwd: directory })
    await fsFiber.inertia
    assert.equal(fsFiber.state, 2)
  }
  const calls = []
  const runtimeInfo = { python_executable: 'python', python_version: '3.10.21', kaiwu_version: '1.4.1', runtime_dir: directory }
  const solver = {
    async solve(request, signal) {
      calls.push({ request, signal })
      return result
    },
  }
  if (runtime) solver.prepareRuntime = async (signal) => {
    signal.throwIfAborted()
    return runtimeInfo
  }
  const disposeSolver = ctx.provide('isingSolver', solver)
  const fiber = ctx.plugin(tools)
  await fiber.inertia
  assert.equal(fiber.state, 2)
  const signal = new AbortController().signal
  const invoke = (name, args, callSignal = signal) => ctx.tools.execute({
    callId: 'test', name, arguments: args, signal: callSignal,
  })
  const matrixPath = join(directory, 'matrix.json')
  const resultPath = join(directory, 'raw-result.json')
  await writeFile(matrixPath, JSON.stringify({ ising_matrix: matrix }))
  return { ctx, directory, calls, invoke, matrixPath, resultPath, signal, fiber, fsFiber, runtimeInfo, disposeSolver, solver }
}

test('file tool persists all solutions with matrix provenance through real DSH tools/fs', async (t) => {
  const state = await setup(t)
  const outcome = await state.invoke('solve_ising_file', { matrix_path: state.matrixPath, result_path: state.resultPath })
  assert.equal(outcome.isError, false)
  assert.equal(outcome.value.saved, true)
  assert.equal(outcome.value.solution_count, 2)
  const saved = JSON.parse(await readFile(state.resultPath, 'utf8'))
  assert.deepEqual(saved.solutions, result.solutions)
  assert.equal(saved.matrix_sha256, createHash('sha256').update(JSON.stringify(matrix)).digest('hex'))
  assert.deepEqual(state.calls[0].request, { isingMatrix: matrix })
  await state.fiber.dispose()
  assert.equal(state.ctx.tools.get('solve_ising_file'), undefined)
})

test('raw array input and legacy solve_ising keep their contracts', async (t) => {
  const state = await setup(t)
  await writeFile(state.matrixPath, JSON.stringify(matrix))
  const outcome = await state.invoke('solve_ising_file', { matrix_path: state.matrixPath, result_path: state.resultPath })
  assert.equal(outcome.isError, false)
  const legacy = await state.invoke('solve_ising', { ising_matrix: matrix })
  assert.equal(legacy.isError, false)
  assert.deepEqual(legacy.value, result)
})

test('filesystem arrival, unload and reload only control the file tool', async (t) => {
  const state = await setup(t, { filesystem: false })
  const assertCoreTools = async () => {
    assert.equal((await state.invoke('solve_ising', { ising_matrix: matrix })).isError, false)
    assert.deepEqual((await state.invoke('prepare_kaiwu_runtime', {})).value, state.runtimeInfo)
  }
  assert.equal(state.ctx.tools.get('solve_ising_file'), undefined)
  await assertCoreTools()
  const first = state.ctx.plugin(LocalFileSystem, { cwd: state.directory })
  await first.inertia
  await new Promise(setImmediate)
  assert.ok(state.ctx.tools.get('solve_ising_file'))
  await first.dispose()
  await new Promise(setImmediate)
  assert.equal(state.ctx.tools.get('solve_ising_file'), undefined)
  await assertCoreTools()
  const second = state.ctx.plugin(LocalFileSystem, { cwd: state.directory })
  await second.inertia
  await new Promise(setImmediate)
  const solved = await state.invoke('solve_ising_file', { matrix_path: state.matrixPath, result_path: state.resultPath })
  assert.equal(solved.isError, false)
})

test('solver providers without a Kaiwu runtime capability keep both solve tools', async (t) => {
  const state = await setup(t, { runtime: false })
  assert.equal(state.ctx.tools.get('prepare_kaiwu_runtime'), undefined)
  assert.equal((await state.invoke('solve_ising', { ising_matrix: matrix })).isError, false)
  assert.equal((await state.invoke('solve_ising_file', { matrix_path: state.matrixPath, result_path: state.resultPath })).isError, false)
})

test('solver service removal unloads every solver-dependent tool and supports recovery', async (t) => {
  const state = await setup(t)
  state.disposeSolver()
  await new Promise(setImmediate)
  for (const name of ['solve_ising', 'solve_ising_file', 'prepare_kaiwu_runtime']) {
    assert.equal(state.ctx.tools.get(name), undefined)
  }
  state.ctx.provide('isingSolver', state.solver)
  await state.fiber.inertia
  await new Promise(setImmediate)
  for (const name of ['solve_ising', 'solve_ising_file', 'prepare_kaiwu_runtime']) {
    assert.ok(state.ctx.tools.get(name))
  }
})

test('invalid files and output destinations fail before hardware submission', async (t) => {
  const state = await setup(t)
  for (const invalid of ['{', '[[0,1],[1]]', '{"ising_matrix": []}']) {
    await writeFile(state.matrixPath, invalid)
    assert.equal((await state.invoke('solve_ising_file', { matrix_path: state.matrixPath, result_path: state.resultPath })).isError, true)
  }
  await writeFile(state.matrixPath, JSON.stringify(matrix))
  await writeFile(state.resultPath, 'existing result')
  assert.equal((await state.invoke('solve_ising_file', { matrix_path: state.matrixPath, result_path: state.resultPath })).isError, true)
  assert.equal(await readFile(state.resultPath, 'utf8'), 'existing result')
  assert.equal((await state.invoke('solve_ising_file', { matrix_path: state.matrixPath, result_path: join(state.directory, 'missing', 'result.json') })).isError, true)
  assert.equal((await state.invoke('solve_ising_file', { matrix_path: 'relative.json', result_path: state.resultPath })).isError, true)
  assert.equal(state.calls.length, 0)
})

test('post-solve save failure returns recoverable data without repeating the solve', async (t) => {
  const state = await setup(t)
  state.ctx.fs.writeText = async () => { throw new Error('disk unavailable') }
  const outcome = await state.invoke('solve_ising_file', { matrix_path: state.matrixPath, result_path: state.resultPath })
  assert.equal(outcome.isError, false)
  assert.equal(outcome.value.saved, false)
  assert.match(outcome.value.save_error, /disk unavailable/)
  assert.deepEqual(JSON.parse(outcome.value.raw_result_json).solutions, result.solutions)
  assert.equal(state.calls.length, 1)
})

test('runtime tool returns interpreter facts and pre-aborted calls never submit', async (t) => {
  const state = await setup(t)
  const outcome = await state.invoke('prepare_kaiwu_runtime', {})
  assert.equal(outcome.isError, false)
  assert.deepEqual(outcome.value, state.runtimeInfo)
  const aborted = AbortSignal.abort()
  assert.equal((await state.invoke('solve_ising_file', { matrix_path: state.matrixPath, result_path: state.resultPath }, aborted)).isError, true)
  assert.equal(state.calls.length, 0)
})

test('Kaiwu runtime preparation does not resolve credentials or start a solver', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  ctx.provide('subprocess', {})
  ctx.provide('credentials', { resolve() { throw new Error('No credential reads allowed') } })
  const provider = new KaiwuProvider(ctx)
  provider.runtime.resolvePython = async () => '/test/python'
  provider.runtime.runChecked = async (argv, options) => {
    assert.equal(argv[0], '/test/python')
    assert.equal(argv[1], '-c')
    assert.deepEqual(options.env, { PYTHONUTF8: '1' })
    return JSON.stringify({ python_executable: '/test/python', python_version: '3.10.21', kaiwu_version: '1.4.1' })
  }
  const info = await provider.prepareRuntime(new AbortController().signal)
  assert.equal(info.python_executable, '/test/python')
  assert.equal(info.kaiwu_version, '1.4.1')
  assert.equal(provider.client, undefined)
})

test('SDK build → DSH file tool with fixture solver → SDK business decode', {
  skip: !process.env.QBOSON_TEST_PYTHON && 'Set QBOSON_TEST_PYTHON to an installed Kaiwu Python interpreter',
}, async (t) => {
  const state = await setup(t)
  const directory = join(state.directory, 'cover')
  const example = fileURLToPath(new URL('../examples/kaiwu-workflow.py', import.meta.url))
  const run = (command) => {
    const child = spawnSync(process.env.QBOSON_TEST_PYTHON, ['-B', example, command, directory], { encoding: 'utf8' })
    assert.equal(child.status, 0, child.stderr || child.stdout)
    return JSON.parse(child.stdout)
  }
  const built = run('build')
  const metadata = JSON.parse(await readFile(join(directory, 'metadata.json'), 'utf8'))
  state.ctx.isingSolver.solve = async ({ isingMatrix }) => {
    assert.equal(isingMatrix.length, built.dimension)
    const spins = Array(built.dimension).fill(-1)
    for (const [i, bit] of [0, 1, 0].entries()) spins[metadata.variables[`x[${i}]`]] = -(2 * bit - 1)
    return { ...result, dimension: built.dimension, solutions: [{ spins, hamiltonian: -40 }] }
  }
  const solved = await state.invoke('solve_ising_file', { matrix_path: built.matrix_path, result_path: built.result_path })
  assert.equal(solved.isError, false)
  assert.equal(solved.value.saved, true)
  const report = run('decode')
  assert.deepEqual(report.selected_vertices, [1])
  assert.equal(report.objective, 2)
  assert.equal(report.feasible, true)
  assert.equal(report.task_name, 'test_fixture_not_hardware')
})
