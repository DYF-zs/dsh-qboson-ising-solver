import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultRuntimeRoot, runtimeInternals, venvPythonPath } from '../src/runtime-manager.js'

test('managed runtime lives under DSH_HOME', () => {
  assert.equal(defaultRuntimeRoot({ DSH_HOME: '/tmp/dsh-home' }), '/tmp/dsh-home/runtimes/dsh-qboson-ising-solver')
})

test('venv Python path is platform-specific', () => {
  assert.equal(venvPythonPath('/runtime/venv', 'win32'), '/runtime/venv/Scripts/python.exe')
  assert.equal(venvPythonPath('/runtime/venv', 'linux'), '/runtime/venv/bin/python')
})

test('uv bootstrap is pinned', () => {
  assert.match(runtimeInternals.installerUrl('win32'), /\/0\.12\.12\/install\.ps1$/)
  assert.match(runtimeInternals.installerUrl('linux'), /\/0\.12\.12\/install\.sh$/)
})
