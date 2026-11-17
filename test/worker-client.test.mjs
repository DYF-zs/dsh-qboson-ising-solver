import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { Context } from '@deepseek-ai/cordis'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import { KaiwuWorkerClient } from '../src/worker-client.js'
import KaiwuProvider from '../src/provider-kaiwu.js'

const python = process.env.QBOSON_TEST_PYTHON
const options = { skip: !python && 'Set QBOSON_TEST_PYTHON to a Python 3.10/Kaiwu interpreter' }

test('Kaiwu solve uses its runtime without consulting DSH credentials', async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  ctx.provide('credentials', { resolve() { throw new Error('Credential store must not be consulted') } })
  const provider = new KaiwuProvider(ctx)
  provider.workerClient = async () => ({
    async dispose() {},
    async request(payload, signal, timeout, env) {
      assert.equal(env.QBOSON_USER_ID, undefined)
      assert.equal(env.QBOSON_SDK_CODE, undefined)
      assert.deepEqual(payload.ising_matrix, [[0, -1], [-1, 0]])
      return { dimension: 2, solutions: [{ spins: [1, -1], hamiltonian: -2 }], solver_time_us: 1, task_name: 'fixture' }
    },
  })
  const result = await provider.solve({ isingMatrix: [[0, -1], [-1, 0]] })
  assert.equal(result.task_name, 'fixture')
})

test('worker protocol and cancellation work with the target DSH subprocess provider', options, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-ising-worker-test-'))
  const ctx = new Context()
  let client
  t.after(async () => {
    await client?.dispose()
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  new LocalSubprocessRuntime(ctx)
  const workerPath = join(directory, 'fixture.py')
  await writeFile(workerPath, [
    'import json, sys, time',
    'print(json.dumps({"type":"ready"}), flush=True)',
    'for line in sys.stdin:',
    '    request = json.loads(line)',
    '    if request["op"] == "slow":',
    '        time.sleep(30)',
    '    print(json.dumps({"id":request["id"],"ok":True,"result":{"fixture":True}}), flush=True)',
  ].join('\n'))
  client = new KaiwuWorkerClient(ctx, { pythonExecutable: python, workerPath, cwd: directory, graceMs: 500 })
  assert.deepEqual(await client.request({ op: 'fixture' }, undefined, 10_000, {}), { fixture: true })
  const controller = new AbortController()
  const pending = client.request({ op: 'slow' }, controller.signal, 10_000, {})
  const timer = setTimeout(() => controller.abort(new Error('fixture cancelled')), 100)
  try {
    await assert.rejects(pending, /fixture cancelled/)
  } finally {
    clearTimeout(timer)
  }
  assert.deepEqual(await client.request({ op: 'fixture' }, undefined, 10_000, {}), { fixture: true })
})

test('concurrent provider solves use separate processes and cancellation is isolated', options, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-ising-concurrent-'))
  const ctx = new Context()
  t.after(async () => {
    await ctx.fiber.dispose()
    await rm(directory, { recursive: true, force: true })
  })
  new LocalSubprocessRuntime(ctx)
  const workerPath = join(directory, 'fixture.py')
  await writeFile(workerPath, [
    'import json, os, sys, time',
    'from pathlib import Path',
    'print(json.dumps({"type":"ready"}), flush=True)',
    'for line in sys.stdin:',
    '    request = json.loads(line)',
    '    tag = str(request["ising_matrix"][0][1])',
    '    Path("started-" + tag).write_text(str(os.getpid()))',
    '    while not Path("release-" + tag).exists():',
    '        time.sleep(0.02)',
    '    result = {"dimension":2,"solutions":[{"spins":[1,-1],"hamiltonian":-2}],"solver_time_us":1,"task_name":tag}',
    '    print(json.dumps({"id":request["id"],"ok":True,"result":result}), flush=True)',
  ].join('\n'))
  const provider = new KaiwuProvider(ctx, { workerPath, cwd: directory, graceMs: 500, timeoutMs: 10_000 })
  provider.checkRuntime = async () => ({ environment_status: 'ready', license_status: 'valid', python_executable: python })
  const started = async (tag) => {
    for (let i = 0; i < 200; i++) {
      try { return await readFile(join(directory, `started-${tag}`), 'utf8') } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      await delay(25)
    }
    assert.fail(`Worker ${tag} did not start`)
  }
  const controller = new AbortController()
  const first = provider.solve({ isingMatrix: [[0, 1], [1, 0]] }, controller.signal)
  const cancelled = assert.rejects(first, /cancelled/)
  const second = provider.solve({ isingMatrix: [[0, 2], [2, 0]] })
  const [firstPid, secondPid] = await Promise.all([started(1), started(2)])
  assert.notEqual(firstPid, secondPid)
  controller.abort(new Error('first solve cancelled'))
  await cancelled
  assert.equal(provider.activeSolves, 1)
  assert.equal(provider.clients.size, 1)
  await writeFile(join(directory, 'release-2'), '')
  assert.equal((await second).task_name, '2')
  assert.equal(provider.clients.size, 0)
  assert.equal(provider.activeSolves, 0)
  const third = provider.solve({ isingMatrix: [[0, 3], [3, 0]] })
  const disposed = assert.rejects(third, { code: 'PROVIDER_DISPOSED' })
  await started(3)
  await ctx.fiber.dispose()
  await disposed
  assert.equal(provider.clients.size, 0)
})

test('runtime discovery uses the target DSH subprocess provider without credentials', options, async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  new LocalSubprocessRuntime(ctx)
  ctx.provide('credentials', { resolve() { throw new Error('Runtime discovery must not read credentials') } })
  const provider = new KaiwuProvider(ctx, { pythonExecutable: python, workerPath: fileURLToPath(new URL('./fixtures/runtime-authorized.py', import.meta.url)) })
  const info = await provider.prepareRuntime(new AbortController().signal)
  assert.match(info.python_version, /^3\.10\./)
  assert.ok(info.kaiwu_version)
  assert.equal(provider.clients.size, 0)
  const configured = await provider.configureLicense(new AbortController().signal)
  assert.equal(configured.python_executable, info.python_executable)
  assert.equal(configured.kaiwu_version, info.kaiwu_version)
  assert.equal(provider.clients.size, 0)
})

async function sharedRuntime(t, config = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'dsh-ising-runtime-shared-'))
  const ctx = new Context()
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) })
  new LocalSubprocessRuntime(ctx)
  const provider = new KaiwuProvider(ctx, {
    pythonExecutable: python, runtimeDir: directory, cwd: directory, graceMs: 500,
    workerPath: fileURLToPath(new URL('./fixtures/runtime-shared.py', import.meta.url)), ...config,
  })
  provider.runtime.resolvePython = async () => python
  const waitForFile = async (name) => {
    for (let i = 0; i < 200; i++) {
      try { return await readFile(join(directory, name), 'utf8') } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
      await delay(25)
    }
    assert.fail(`Fixture file ${name} was not created`)
  }
  return { directory, provider, waitForFile }
}

test('concurrent provider solves share authorization and preserve uncancelled requests', options, async (t) => {
  const { directory, provider, waitForFile } = await sharedRuntime(t)
  const controller = new AbortController()
  const first = provider.solve({ isingMatrix: [[0, 1], [1, 0]] }, controller.signal)
  const cancelled = assert.rejects(first, /cancelled/)
  const second = provider.solve({ isingMatrix: [[0, 2], [2, 0]] })
  const third = provider.solve({ isingMatrix: [[0, 3], [3, 0]] })
  await waitForFile('authorization-opened')
  controller.abort(new Error('First caller cancelled'))
  await cancelled
  await writeFile(join(directory, 'authorization-release'), '')
  const results = await Promise.all([second, third])
  assert.notEqual(results[0].task_name, results[1].task_name)
  assert.equal((await readFile(join(directory, 'authorization-opened'), 'utf8')).trim().split('\n').length, 1)
  await assert.rejects(stat(join(directory, 'submitted-1')), { code: 'ENOENT' })
  assert.equal(provider.clients.size, 0)
})

test('provider failures, timeouts and cancellation retain the worker task name', options, async (t) => {
  const { directory, provider, waitForFile } = await sharedRuntime(t, { timeoutMs: 2_000 })
  await writeFile(join(directory, 'fixture-license'), 'fixture')
  const checkError = async (promise, code, tag) => {
    let failure
    await assert.rejects(promise, (error) => { failure = error; return true })
    assert.equal(failure.code, code)
    assert.match(failure.details.task_name, /^ising_dsh_[a-f0-9]{12}$/)
    assert.ok(failure.message.includes(failure.details.task_name))
    assert.equal(failure.details.task_name, await readFile(join(directory, `submitted-${tag}`), 'utf8'))
  }
  await checkError(provider.solve({ isingMatrix: [[0, 9], [9, 0]] }), 'TIMEOUT', 9)
  const controller = new AbortController()
  const cancelled = checkError(provider.solve({ isingMatrix: [[0, 10], [10, 0]] }, controller.signal), 'ABORTED', 10)
  await waitForFile('submitted-10')
  controller.abort(new Error('Caller cancelled'))
  await cancelled
  await checkError(provider.solve({ isingMatrix: [[0, 7], [7, 0]] }), 'CIM_TASK_FAILED', 7)
  assert.equal(provider.clients.size, 0)
})

test('real SDK inspection leaves the runtime directory uncreated', options, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), 'qboson-sdk-inspection-'))
  const ctx = new Context()
  t.after(async () => { await ctx.fiber.dispose(); await rm(directory, { recursive: true, force: true }) })
  new LocalSubprocessRuntime(ctx)
  const root = join(directory, 'runtime')
  const provider = new KaiwuProvider(ctx, { pythonExecutable: python, runtimeDir: root })
  const status = await provider.checkRuntime()
  assert.equal(status.environment_status, 'ready')
  assert.ok(['missing', 'invalid', 'valid'].includes(status.license_status))
  assert.match(status.python_version, /^3\.10\./)
  assert.ok(status.kaiwu_version)
  assert.equal(provider.clients.size, 0)
  await assert.rejects(stat(root), { code: 'ENOENT' })
})
