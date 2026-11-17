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
import * as nativeExecutor from '@deepseek-ai/dsh-tool-executor-native'
import { LocalFileSystem } from '@deepseek-ai/dsh-fs-local'
import * as tools from '../src/tool.js'
import KaiwuProvider from '../src/provider-kaiwu.js'
import { IsingSolverError } from '../src/errors.js'

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
  await ctx.plugin(nativeExecutor).inertia
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
  if (runtime) {
    solver.checkRuntime = async (signal) => {
      signal.throwIfAborted()
      return { ...runtimeInfo, environment_status: 'ready', license_status: 'valid' }
    }
    solver.prepareRuntime = async (signal) => {
      signal.throwIfAborted()
      return runtimeInfo
    }
    solver.configureLicense = async (signal) => {
      signal.throwIfAborted()
      return runtimeInfo
    }
  }
  const disposeSolver = ctx.provide('isingSolver', solver)
  const fiber = ctx.plugin(tools)
  await fiber.inertia
  assert.equal(fiber.state, 2)
  const signal = new AbortController().signal
  const invoke = async (name, args, callSignal = signal, agent) => {
    const batch = await ctx.tools.execute({
      calls: [{ type: 'tool-call', id: 'test', name, arguments: JSON.stringify(args) }],
      signal: callSignal, agent,
    })
    return batch.results[0].result
  }
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

test('file result writes use the calling session workspace policy', async (t) => {
  const state = await setup(t)
  const session = { header: { cwd: state.directory } }
  state.ctx.provide('sandboxPolicy', {
    resolve: ({ session } = {}) => ({ mode: 'workspace-write', workspaceRoot: session?.header.cwd ?? '/host-workspace' }),
  })
  const write = state.ctx.fs.writeText.bind(state.ctx.fs)
  state.ctx.fs.writeText = async (target, content, intent, signal, policy) => {
    if (policy?.workspaceRoot !== state.directory) throw new Error('file access denied under workspace-write mode')
    return write(target, content, intent, signal)
  }
  const outcome = await state.invoke('solve_ising_file', {
    matrix_path: state.matrixPath, result_path: state.resultPath,
  }, state.signal, { session })
  assert.equal(outcome.isError, false)
  assert.equal(outcome.value.saved, true)
  assert.equal(state.calls.length, 1)
  assert.deepEqual(JSON.parse(await readFile(state.resultPath, 'utf8')).solutions, result.solutions)
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

test('CSV and JSON submit the same matrix and preserve identical matrix provenance', async (t) => {
  const state = await setup(t)
  const formats = [
    ['matrix.csv', '0,-1\n-1,0\n'],
    ['matrix.CSV', '\uFEFF"0", "-1"\r\n"-1", "0"\r\n'],
    ['matrix-scientific.csv', '+0.0,-1e0\r-1.0E+0,.0\r'],
    ['matrix-decimal.csv', '0,-.125\n-1.25e-1,0\n', [[0, -.125], [-.125, 0]]],
    ['matrix-bom.json', '\uFEFF' + JSON.stringify(matrix)],
  ]
  for (const [index, [name, content, expectedMatrix = matrix]] of formats.entries()) {
    const matrixPath = join(state.directory, name)
    const resultPath = join(state.directory, `result-${index}.json`)
    await writeFile(matrixPath, content, 'utf8')
    const outcome = await state.invoke('solve_ising_file', { matrix_path: matrixPath, result_path: resultPath })
    assert.equal(outcome.isError, false, name)
    assert.equal(outcome.value.saved, true)
    assert.deepEqual(state.calls[index].request.isingMatrix, expectedMatrix)
    const saved = JSON.parse(await readFile(resultPath, 'utf8'))
    assert.equal(saved.matrix_sha256, createHash('sha256').update(JSON.stringify(expectedMatrix)).digest('hex'))
    assert.deepEqual(saved.solutions, result.solutions)
  }
  assert.equal(state.calls.length, formats.length)
})

test('invalid CSV fails before hardware submission', async (t) => {
  const state = await setup(t)
  const matrixPath = join(state.directory, 'matrix.csv')
  for (const content of ['', 'a,b\n-1,0', ',0\n-1,0', '0,\n-1,0', '0,-1,\n-1,0,', '0,-1\n\n-1,0', '0,NaN\n-1,0', '0,Infinity\n-1,0', '0,1e999\n-1,0', '0,0x10\n-1,0', '0,-1\n-1', '"0,-1\n-1,0']) {
    await writeFile(matrixPath, content, 'utf8')
    const outcome = await state.invoke('solve_ising_file', { matrix_path: matrixPath, result_path: state.resultPath })
    assert.equal(outcome.isError, true, JSON.stringify(content))
  }
  assert.equal(state.calls.length, 0)
})

test('filesystem arrival, unload and reload only control the file tool', async (t) => {
  const state = await setup(t, { filesystem: false })
  const assertCoreTools = async () => {
    assert.equal((await state.invoke('solve_ising', { ising_matrix: matrix })).isError, false)
    assert.deepEqual((await state.invoke('prepare_kaiwu_runtime', {})).value, state.runtimeInfo)
    assert.deepEqual((await state.invoke('configure_kaiwu_license', {})).value, state.runtimeInfo)
    assert.equal((await state.invoke('check_kaiwu_runtime', {})).value.environment_status, 'ready')
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
  assert.equal(state.ctx.tools.get('configure_kaiwu_license'), undefined)
  assert.equal(state.ctx.tools.get('check_kaiwu_runtime'), undefined)
  assert.equal((await state.invoke('solve_ising', { ising_matrix: matrix })).isError, false)
  assert.equal((await state.invoke('solve_ising_file', { matrix_path: state.matrixPath, result_path: state.resultPath })).isError, false)
})

test('solver service removal unloads every solver-dependent tool and supports recovery', async (t) => {
  const state = await setup(t)
  state.disposeSolver()
  await new Promise(setImmediate)
  for (const name of ['solve_ising', 'solve_ising_file', 'prepare_kaiwu_runtime', 'configure_kaiwu_license', 'check_kaiwu_runtime']) {
    assert.equal(state.ctx.tools.get(name), undefined)
  }
  state.ctx.provide('isingSolver', state.solver)
  await state.fiber.inertia
  await new Promise(setImmediate)
  for (const name of ['solve_ising', 'solve_ising_file', 'prepare_kaiwu_runtime', 'configure_kaiwu_license', 'check_kaiwu_runtime']) {
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

test('DSH tool errors include the task name for platform lookup', async (t) => {
  const state = await setup(t)
  const providerCtx = new Context()
  t.after(() => providerCtx.fiber.dispose())
  const provider = new KaiwuProvider(providerCtx)
  let taskName
  provider.workerClient = async () => ({
    async request(payload) {
      taskName = payload.task_name
      throw new IsingSolverError('TIMEOUT', 'Fixture task timed out')
    },
    async dispose() {},
  })
  state.solver.solve = provider.solve.bind(provider)
  for (const [name, args] of [
    ['solve_ising', { ising_matrix: matrix }],
    ['solve_ising_file', { matrix_path: state.matrixPath, result_path: state.resultPath }],
  ]) {
    const outcome = await state.invoke(name, args)
    assert.equal(outcome.isError, true)
    assert.match(taskName, /^ising_dsh_[a-f0-9]{12}$/)
    assert.ok(JSON.stringify(outcome).includes(taskName))
  }
  let started
  const running = new Promise((resolve) => { started = resolve })
  provider.workerClient = async () => ({
    request(payload, signal) {
      taskName = payload.task_name
      started()
      return new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(signal.reason), { once: true })
      })
    },
    async dispose() {},
  })
  const controller = new AbortController()
  const pending = state.invoke('solve_ising', { ising_matrix: matrix }, controller.signal)
  await running
  controller.abort(new Error('Fixture caller cancelled'))
  const outcome = await pending
  assert.equal(outcome.isError, true)
  assert.ok(JSON.stringify(outcome).includes(taskName))
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

test('License configuration is independently callable and never submits a solver task', async (t) => {
  const state = await setup(t, { filesystem: false })
  const outcome = await state.invoke('configure_kaiwu_license', {})
  assert.equal(outcome.isError, false)
  assert.deepEqual(outcome.value, state.runtimeInfo)
  assert.equal((await state.invoke('configure_kaiwu_license', {}, AbortSignal.abort())).isError, true)
  assert.equal(state.calls.length, 0)
})

test('runtime check returns actionable states through the DSH tool', async (t) => {
  const state = await setup(t, { filesystem: false })
  for (const [environment, license] of [['missing', 'not_checked'], ['invalid', 'not_checked'], ['ready', 'missing'], ['ready', 'invalid'], ['ready', 'valid']]) {
    state.solver.checkRuntime = async () => ({ environment_status: environment, license_status: license, runtime_dir: state.directory })
    const outcome = await state.invoke('check_kaiwu_runtime', {})
    assert.equal(outcome.isError, false)
    assert.equal(outcome.value.environment_status, environment)
    assert.equal(outcome.value.license_status, license)
  }
  assert.equal(state.calls.length, 0)
})

test('preparation reuses a ready environment and valid License', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  const info = { python_executable: '/test/python', python_version: '3.10.22', kaiwu_version: '1.4.3', runtime_dir: '/test' }
  provider.checkRuntime = async () => ({ ...info, environment_status: 'ready', license_status: 'valid' })
  provider.configureLicense = async () => { throw new Error('Unexpected authorization') }
  assert.deepEqual(await provider.prepareRuntime(), info)
})

test('preparation renews an invalid License without starting a solve worker', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  provider.checkRuntime = async () => ({ environment_status: 'ready', license_status: 'invalid' })
  provider.runtime.resolvePython = async () => '/test/python'
  provider.runtime.runChecked = async () => JSON.stringify({ python_executable: '/test/python', python_version: '3.10.22', kaiwu_version: '1.4.3' })
  assert.equal((await provider.prepareRuntime()).python_executable, '/test/python')
  assert.equal(provider.clients.size, 0)
})

test('concurrent preparation shares authorization and cancelling one waiter preserves the others', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  const info = { python_executable: '/test/python', python_version: '3.10.22', kaiwu_version: '1.4.3' }
  provider.checkRuntime = async () => ({ environment_status: 'ready', license_status: 'missing' })
  provider.runtime.resolvePython = async () => info.python_executable
  let finish, authorizationSignal, opened = 0
  provider.runtime.runChecked = async (_argv, { signal }) => {
    opened++
    authorizationSignal = signal
    return new Promise((resolve) => { finish = () => resolve(JSON.stringify(info)) })
  }
  const controller = new AbortController()
  const first = provider.prepareRuntime(controller.signal)
  const cancelled = assert.rejects(first, /cancelled/)
  const second = provider.prepareRuntime()
  await new Promise(setImmediate)
  assert.equal(opened, 1)
  await assert.rejects(provider.configureLicense(), { code: 'KAIWU_RUNTIME_BUSY' })
  controller.abort(new Error('First waiter cancelled'))
  await cancelled
  assert.equal(authorizationSignal.aborted, false)
  finish()
  assert.equal((await second).python_executable, info.python_executable)
  assert.equal(provider.authorizationInProgress, false)
  assert.equal(provider.preparation, undefined)
})

test('shared authorization failure releases preparation for a successful retry', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  provider.checkRuntime = async () => ({ environment_status: 'ready', license_status: 'invalid' })
  provider.runtime.resolvePython = async () => '/test/python'
  provider.runtime.runChecked = async () => { throw new Error('Authorization cancelled') }
  const results = await Promise.allSettled([provider.prepareRuntime(), provider.prepareRuntime()])
  assert.ok(results.every((result) => result.status === 'rejected'))
  provider.runtime.runChecked = async () => JSON.stringify({ python_executable: '/test/python' })
  assert.equal((await provider.prepareRuntime()).python_executable, '/test/python')
})

test('cancelling all preparation callers stops the shared authorization', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  provider.checkRuntime = async () => ({ environment_status: 'ready', license_status: 'missing' })
  provider.runtime.resolvePython = async () => '/test/python'
  let authorizationSignal
  provider.runtime.runChecked = async (_argv, { signal }) => {
    authorizationSignal = signal
    return new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    })
  }
  const controller = new AbortController()
  const preparation = provider.prepareRuntime(controller.signal)
  const cancelled = assert.rejects(preparation, /cancelled/)
  await new Promise(setImmediate)
  controller.abort(new Error('Caller cancelled'))
  await cancelled
  await new Promise(setImmediate)
  assert.equal(authorizationSignal.aborted, true)
  assert.equal(provider.preparation, undefined)
  assert.equal(provider.authorizationInProgress, false)
})

test('License configuration waits for active solving to finish', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  let finish
  provider.workerClient = async () => ({ request: () => new Promise((resolve) => { finish = resolve }), async dispose() {} })
  const solving = provider.solve({ isingMatrix: matrix })
  await new Promise(setImmediate)
  await assert.rejects(provider.configureLicense(), { code: 'KAIWU_RUNTIME_BUSY' })
  finish(result)
  assert.equal((await solving).task_name, result.task_name)
  assert.equal(provider.activeSolves, 0)
  provider.runtime.resolvePython = async () => '/test/python'
  provider.runtime.runChecked = async () => JSON.stringify({ python_executable: '/test/python' })
  assert.equal((await provider.configureLicense()).python_executable, '/test/python')
})

test('concurrent solves complete independently and dispose their workers', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  const workers = []
  provider.workerClient = async () => {
    const worker = {
      request: () => new Promise((resolve) => { worker.finish = resolve }),
      async dispose() { worker.disposed = true },
    }
    workers.push(worker)
    provider.clients.add(worker)
    return worker
  }
  const first = provider.solve({ isingMatrix: matrix })
  const second = provider.solve({ isingMatrix: matrix })
  await new Promise(setImmediate)
  assert.equal(provider.activeSolves, 2)
  workers[1].finish({ ...result, task_name: 'second' })
  assert.equal((await second).task_name, 'second')
  assert.equal(workers[1].disposed, true)
  assert.equal(workers[0].disposed, undefined)
  assert.equal(provider.clients.size, 1)
  workers[0].finish(result)
  assert.equal((await first).task_name, result.task_name)
  assert.equal(workers[0].disposed, true)
  assert.equal(provider.activeSolves, 0)
  assert.equal(provider.clients.size, 0)
})

test('failed solving disposes its worker and releases the active solve count', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  let disposed = false
  const worker = {
    async request() { throw new Error('Solver failed') },
    async dispose() { disposed = true },
  }
  provider.clients.add(worker)
  provider.workerClient = async () => worker
  await assert.rejects(provider.solve({ isingMatrix: matrix }), /Solver failed/)
  assert.equal(disposed, true)
  assert.equal(provider.clients.size, 0)
  assert.equal(provider.activeSolves, 0)
})

test('cancelling the active solve releases the worker for the next request', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  provider.workerClient = async () => ({
    async dispose() {},
    request: (_payload, signal) => new Promise((_resolve, reject) => {
      signal.addEventListener('abort', () => reject(signal.reason), { once: true })
    }),
  })
  const controller = new AbortController()
  const first = provider.solve({ isingMatrix: matrix }, controller.signal)
  const rejected = assert.rejects(first, /Cancelled active solve/)
  await new Promise(setImmediate)
  controller.abort(new Error('Cancelled active solve'))
  await rejected
  assert.equal(provider.activeSolves, 0)
  provider.workerClient = async () => ({ request: async () => result, async dispose() {} })
  assert.equal((await provider.solve({ isingMatrix: matrix })).task_name, result.task_name)
})

test('authorization excludes new solves and releases the environment after cancellation', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  let rejectAuthorization
  provider.runtime.resolvePython = () => new Promise((_resolve, reject) => { rejectAuthorization = reject })
  const configuring = provider.configureLicense()
  await assert.rejects(provider.solve({ isingMatrix: matrix }), { code: 'KAIWU_RUNTIME_BUSY' })
  await assert.rejects(provider.configureLicense(), { code: 'KAIWU_RUNTIME_BUSY' })
  rejectAuthorization(new Error('Authorization cancelled'))
  await assert.rejects(configuring, /Authorization cancelled/)
  provider.workerClient = async () => ({ request: async () => result, async dispose() {} })
  assert.equal((await provider.solve({ isingMatrix: matrix })).task_name, result.task_name)
})

test('renewing a License uses the prepared environment without starting a solve worker', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  provider.runtime.resolvePython = async (_signal, options) => {
    assert.equal(options.autoSetup, false)
    return '/test/python'
  }
  provider.runtime.runChecked = async (argv) => {
    assert.equal(argv[2], '--configure-license')
    return JSON.stringify({ python_executable: '/test/python', python_version: '3.10.22', kaiwu_version: '1.4.3' })
  }
  assert.equal((await provider.configureLicense()).python_executable, '/test/python')
  assert.equal(provider.clients.size, 0)
})

test('solving is available after cancelled License configuration', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  provider.runtime.resolvePython = async () => '/test/python'
  provider.runtime.runChecked = async () => { throw new Error('Authorization cancelled') }
  await assert.rejects(provider.configureLicense(), /Authorization cancelled/)
  provider.workerClient = async () => ({ request: async () => result, async dispose() {} })
  assert.equal((await provider.solve({ isingMatrix: matrix })).task_name, result.task_name)
})

test('Kaiwu runtime preparation does not resolve credentials or start a solver', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  ctx.provide('subprocess', {})
  ctx.provide('credentials', { resolve() { throw new Error('No credential reads allowed') } })
  const provider = new KaiwuProvider(ctx)
  provider.checkRuntime = async () => ({ environment_status: 'missing', license_status: 'not_checked' })
  provider.runtime.resolvePython = async () => '/test/python'
  provider.runtime.runChecked = async (argv, options) => {
    assert.equal(argv[0], '/test/python')
    assert.equal(argv[1], fileURLToPath(new URL('../python/qboson_ising_worker/worker.py', import.meta.url)))
    assert.equal(argv[2], '--authorize')
    assert.deepEqual(options.env, { PYTHONUTF8: '1' })
    return JSON.stringify({ python_executable: '/test/python', python_version: '3.10.21', kaiwu_version: '1.4.1' })
  }
  const info = await provider.prepareRuntime(new AbortController().signal)
  assert.equal(info.python_executable, '/test/python')
  assert.equal(info.kaiwu_version, '1.4.1')
  assert.equal(provider.clients.size, 0)
})

test('runtime preparation fails before returning an interpreter when authorization is cancelled', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  const provider = new KaiwuProvider(ctx)
  provider.checkRuntime = async () => ({ environment_status: 'ready', license_status: 'missing' })
  provider.runtime.resolvePython = async () => '/test/python'
  provider.runtime.runChecked = async () => { throw new Error('Authorization cancelled') }
  await assert.rejects(provider.prepareRuntime(), /Authorization cancelled/)
  assert.equal(provider.clients.size, 0)
})

test('all tools present informative pending-state cards while calls run', async (t) => {
  const state = await setup(t)
  const calls = {
    check_kaiwu_runtime: {},
    prepare_kaiwu_runtime: {},
    configure_kaiwu_license: {},
    solve_ising: { ising_matrix: matrix },
    solve_ising_file: { matrix_path: state.matrixPath, result_path: state.resultPath },
  }
  for (const [name, args] of Object.entries(calls)) {
    const tool = state.ctx.tools.get(name)
    const view = tool.presentCall(args)
    assert.equal(view.card, 'generic', name)
    assert.ok(view.title.length > 0, name)
    assert.ok(view.content.some((block) => block.type === 'text' && block.text.length > 0), name)
  }
  for (const name of ['solve_ising', 'solve_ising_file']) {
    // Arguments the schema rejects fall back to the generic presentation without throwing.
    assert.equal(state.ctx.tools.get(name).presentCall({ unexpected: true }), undefined, name)
  }
  assert.match(state.ctx.tools.get('solve_ising').presentCall({ ising_matrix: matrix }).title, /2×2/)
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
