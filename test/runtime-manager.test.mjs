import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import os from 'node:os'
import { syncBuiltinESMExports } from 'node:module'

import {
  defaultRuntimeRoot,
  ManagedKaiwuRuntime,
  runtimeInternals,
  venvPythonPath,
} from '../src/runtime-manager.js'

test('managed runtime lives under DSH_HOME', () => {
  const dshHome = path.resolve('tmp', 'dsh-home')

  assert.equal(
    defaultRuntimeRoot({ DSH_HOME: dshHome }),
    path.join(dshHome, 'runtimes', 'dsh-qboson-ising-solver'),
  )
})

test('managed dependency changes require a runtime update', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'qboson-runtime-metadata-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = new ManagedKaiwuRuntime({}, { runtimeDir: root, kaiwuSpec: runtimeInternals.KAIWU_SPEC })
  const metadata = path.join(root, 'runtime.json')
  await writeFile(metadata, JSON.stringify({ schema: 1, python: '3.10', kaiwu: 'kaiwu' }))
  assert.equal(await runtime.runtimeMetadataMatches(), false)
  const current = {
    schema: 2, python: runtimeInternals.PYTHON_VERSION, kaiwu: runtimeInternals.KAIWU_SPEC,
    requirements: createHash('sha256').update(await readFile(runtimeInternals.REQUIREMENTS_PATH)).digest('hex'),
  }
  await writeFile(metadata, JSON.stringify(current))
  assert.equal(await runtime.runtimeMetadataMatches(), true)
  await writeFile(metadata, JSON.stringify({ ...current, requirements: 'different dependency set' }))
  assert.equal(await runtime.runtimeMetadataMatches(), false)
})

test('License configuration cannot provision a missing runtime', async (t) => {
  const root = await mkdtemp(path.join(tmpdir(), 'qboson-license-runtime-'))
  t.after(() => rm(root, { recursive: true, force: true }))
  const runtime = new ManagedKaiwuRuntime({}, { runtimeDir: root, pythonExecutable: '' })
  runtime.ensureSetup = async () => { throw new Error('Unexpected environment setup') }
  await assert.rejects(runtime.resolvePython(undefined, { autoSetup: false }), { code: 'PYTHON_RUNTIME_MISSING' })
})

test('environment inspection preserves a missing runtime directory', async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), 'qboson-runtime-check-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const root = path.join(directory, 'not-created')
  const runtime = new ManagedKaiwuRuntime({}, { runtimeDir: root, pythonExecutable: '' })
  assert.deepEqual(await runtime.inspectEnvironment(), { environment_status: 'missing' })
  await assert.rejects(stat(root), { code: 'ENOENT' })
  await mkdir(path.dirname(runtime.managedPython), { recursive: true })
  await writeFile(runtime.managedPython, '')
  assert.equal((await runtime.inspectEnvironment()).environment_status, 'invalid')
})

test('venv Python path is platform-specific', () => {
  const venvDir = path.resolve('runtime', 'venv')

  assert.ok(
    venvPythonPath(venvDir, 'win32').endsWith(
      path.join('Scripts', 'python.exe'),
    ),
  )

  assert.ok(
    venvPythonPath(venvDir, 'linux').endsWith(
      path.join('bin', 'python'),
    ),
  )
  assert.equal(venvPythonPath(venvDir, 'win32', 'conda'), path.join(venvDir, 'python.exe'))
  assert.equal(venvPythonPath(venvDir, 'linux', 'conda'), path.join(venvDir, 'bin', 'python'))
  assert.equal(venvPythonPath(venvDir, 'darwin'), path.join(venvDir, 'bin', 'python'))
  assert.equal(venvPythonPath(venvDir, 'darwin', 'conda'), path.join(venvDir, 'bin', 'python'))
})

test('macOS finds installed managers when the desktop PATH cannot resolve them', async (t) => {
  const home = await mkdtemp(path.join(tmpdir(), 'qboson-mac-managers-'))
  const originalPlatform = os.platform
  const originalHome = os.homedir
  const originalConda = process.env.CONDA_EXE
  t.after(async () => {
    os.platform = originalPlatform
    os.homedir = originalHome
    syncBuiltinESMExports()
    if (originalConda === undefined) delete process.env.CONDA_EXE
    else process.env.CONDA_EXE = originalConda
    await rm(home, { recursive: true, force: true })
  })
  os.platform = () => 'darwin'
  os.homedir = () => home
  syncBuiltinESMExports()
  delete process.env.CONDA_EXE
  const uv = path.join(home, '.local', 'bin', 'uv')
  const conda = path.join(home, 'miniforge3', 'bin', 'conda')
  for (const executable of [uv, conda]) {
    await mkdir(path.dirname(executable), { recursive: true })
    await writeFile(executable, '')
  }
  const runtime = new ManagedKaiwuRuntime({ subprocess: {
    async resolveExecutable() { throw new Error('Not on the desktop PATH') },
  } }, { runtimeDir: path.join(home, 'runtime') })
  runtime.runChecked = async ([executable]) => {
    await readFile(executable)
    return executable === uv ? 'uv 0.13.8\n' : 'conda 26.9.4\n'
  }
  runtime.ensureUv = async () => { throw new Error('An installed manager is available') }
  assert.deepEqual(await runtime.selectManager(), { kind: 'uv', executable: uv })
  await rm(uv)
  assert.deepEqual(await runtime.selectManager(), { kind: 'conda', executable: conda })
})

test('manager selection prefers uv, then conda, then bootstraps uv', async (t) => {
  for (const [uv, conda, expected, bootstrap] of [
    ['installed-uv', 'installed-conda', { kind: 'uv', executable: 'installed-uv' }, false],
    [undefined, 'installed-conda', { kind: 'conda', executable: 'installed-conda' }, false],
    [undefined, undefined, { kind: 'uv', executable: 'private-uv' }, true],
  ]) {
    await t.test(expected.executable, async () => {
      const runtime = new ManagedKaiwuRuntime({})
      runtime.findUv = async () => uv
      runtime.findConda = async () => {
        assert.equal(uv, undefined, 'uv takes priority over conda')
        return conda
      }
      let bootstrapped = false
      runtime.ensureUv = async () => { bootstrapped = true; return 'private-uv' }
      assert.deepEqual(await runtime.selectManager(), expected)
      assert.equal(bootstrapped, bootstrap)
    })
  }
})

test('an installed uv can be used without matching the bootstrap version', async () => {
  const runtime = new ManagedKaiwuRuntime({ subprocess: { async resolveExecutable() { return 'installed-uv' } } })
  runtime.runChecked = async () => 'uv 0.12.0\n'
  assert.equal(await runtime.findUv(), 'installed-uv')
})

test('Windows conda batch entries resolve to the native executable', { skip: process.platform !== 'win32' }, async (t) => {
  const original = process.env.CONDA_EXE
  delete process.env.CONDA_EXE
  t.after(() => {
    if (original === undefined) delete process.env.CONDA_EXE
    else process.env.CONDA_EXE = original
  })
  const installation = path.resolve('installed-conda')
  for (const entry of ['condabin', 'Scripts', path.join('Library', 'bin')]) {
    const runtime = new ManagedKaiwuRuntime({ subprocess: {
      async resolveExecutable() { return path.join(installation, entry, 'conda.bat') },
    } })
    runtime.runChecked = async (argv) => {
      assert.equal(argv[0], path.join(installation, 'Scripts', 'conda.exe'))
      return 'conda 26.9.4\n'
    }
    assert.equal(await runtime.findConda(), path.join(installation, 'Scripts', 'conda.exe'))
  }
})

test('both managers create a private environment and install the locked dependencies', async (t) => {
  for (const kind of ['uv', 'conda']) {
    await t.test(kind, async (t) => {
      const root = await mkdtemp(path.join(tmpdir(), 'qboson-runtime-setup-'))
      t.after(() => rm(root, { recursive: true, force: true }))
      const runtime = new ManagedKaiwuRuntime({}, { runtimeDir: root, kaiwuSpec: runtimeInternals.KAIWU_SPEC })
      runtime.selectManager = async () => ({ kind, executable: `installed-${kind}` })
      const commands = []
      runtime.runChecked = async (argv) => { commands.push(argv); return '' }
      runtime.assertCompatiblePython = async () => {}
      await runtime.setup()
      assert.ok(commands[0].includes(runtime.venvDir), 'environment is created in the managed directory')
      assert.ok(commands[0].includes(kind === 'uv' ? runtimeInternals.PYTHON_VERSION : `python=${runtimeInternals.PYTHON_VERSION}`))
      assert.ok(commands[1].includes(runtimeInternals.REQUIREMENTS_PATH))
      assert.ok(commands[1].includes(runtime.managedPython), 'installation targets the managed interpreter')
      assert.equal(commands.some((argv) => argv.includes('activate')), false)
      const metadata = JSON.parse(await readFile(path.join(root, 'runtime.json'), 'utf8'))
      assert.equal(metadata.manager, kind)

      await mkdir(path.dirname(runtime.managedPython), { recursive: true })
      await writeFile(runtime.managedPython, '')
      const reused = new ManagedKaiwuRuntime({}, { runtimeDir: root, kaiwuSpec: runtimeInternals.KAIWU_SPEC })
      reused.assertCompatiblePython = async () => {}
      reused.selectManager = async () => { throw new Error('A ready environment must be reused') }
      assert.equal(await reused.resolvePython(), runtime.managedPython)
    })
  }
})

test('uv bootstrap is pinned', () => {
  assert.match(
    runtimeInternals.installerUrl('win32'),
    /\/0\.13\.8\/install\.ps1$/,
  )

  assert.match(
    runtimeInternals.installerUrl('linux'),
    /\/0\.13\.8\/install\.sh$/,
  )
  assert.match(runtimeInternals.installerUrl('darwin'), /\/0\.13\.8\/install\.sh$/)
  assert.equal(path.basename(runtimeInternals.privateUvCandidates('/runtime/uv', 'darwin')[0]), 'uv')
})
