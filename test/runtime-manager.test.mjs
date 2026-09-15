import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'

import {
  defaultRuntimeRoot,
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
})

test('uv bootstrap is pinned', () => {
  assert.match(
    runtimeInternals.installerUrl('win32'),
    /\/0\.12\.12\/install\.ps1$/,
  )

  assert.match(
    runtimeInternals.installerUrl('linux'),
    /\/0\.12\.12\/install\.sh$/,
  )
})