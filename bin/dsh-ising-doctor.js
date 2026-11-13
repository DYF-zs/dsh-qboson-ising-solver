#!/usr/bin/env node
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { venvPythonPath } from '../src/runtime-manager.js'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const worker = resolve(packageRoot, 'python', 'qboson_ising_worker', 'worker.py')
const dshHome = process.env.DSH_HOME || resolve(homedir(), '.dsh')
const runtimeRoot = process.env.QBOSON_ISING_RUNTIME_DIR || resolve(dshHome, 'runtimes', 'dsh-qboson-ising-solver')
const venvDir = resolve(runtimeRoot, 'venv')
const managedPython = [venvPythonPath(venvDir), venvPythonPath(venvDir, process.platform, 'conda')]
  .find(existsSync)
const explicitPython = process.env.QBOSON_ISING_PYTHON
const python = explicitPython || managedPython

console.log(`Harness home: ${dshHome}`)
console.log(`Managed runtime: ${runtimeRoot}`)
console.log(`Python: ${python ?? 'not provisioned yet (first solve will provision automatically)'}`)

if (!python) {
  if (process.argv.includes('--license')) {
    console.error('Prepare the managed runtime through prepare_kaiwu_runtime in DSH, or set QBOSON_ISING_PYTHON to a compatible Python 3.10 interpreter.')
    process.exitCode = 1
  } else {
    console.log('Runtime status: pending automatic first-use setup')
  }
  process.exit()
}

const args = [worker, '--doctor']
if (process.argv.includes('--license')) args.push('--check-license')

const childEnv = {
  ...process.env,
  PYTHONUTF8: '1',
}

const result = spawnSync(python, args, {
  env: childEnv,
  stdio: 'inherit',
})

if (result.error) {
  console.error(`Failed to start ${python}: ${result.error.message}`)
  process.exitCode = 1
} else {
  process.exitCode = result.status ?? 1
}
