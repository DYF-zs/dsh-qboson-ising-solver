import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from '@deepseek-ai/cordis'
import { LocalSubprocessRuntime } from '@deepseek-ai/dsh-subprocess-local'
import { KaiwuWorkerClient } from '../src/worker-client.js'
import KaiwuProvider from '../src/provider-kaiwu.js'

const python = process.env.QBOSON_TEST_PYTHON
const options = { skip: !python && 'Set QBOSON_TEST_PYTHON to a Python 3.10/Kaiwu interpreter' }

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

test('runtime discovery uses the target DSH subprocess provider without credentials', options, async (t) => {
  const ctx = new Context()
  t.after(() => ctx.fiber.dispose())
  new LocalSubprocessRuntime(ctx)
  ctx.provide('credentials', { resolve() { throw new Error('Runtime discovery must not read credentials') } })
  const provider = new KaiwuProvider(ctx, { pythonExecutable: python })
  const info = await provider.prepareRuntime(new AbortController().signal)
  assert.match(info.python_version, /^3\.10\./)
  assert.ok(info.kaiwu_version)
  assert.equal(provider.client, undefined)
})
