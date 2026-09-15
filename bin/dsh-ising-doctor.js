#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const worker = resolve(packageRoot, 'python', 'qboson_ising_worker', 'worker.py')
const dshHome = process.env.DSH_HOME || resolve(homedir(), '.dsh')
const runtimeRoot = process.env.QBOSON_ISING_RUNTIME_DIR || resolve(dshHome, 'runtimes', 'dsh-qboson-ising-solver')
const managedPython = process.platform === 'win32'
  ? resolve(runtimeRoot, 'venv', 'Scripts', 'python.exe')
  : resolve(runtimeRoot, 'venv', 'bin', 'python')
const explicitPython = process.env.QBOSON_ISING_PYTHON
const python = explicitPython || (existsSync(managedPython) ? managedPython : undefined)

function unquote(value) {
  const text = value.trim()
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    try { return JSON.parse(text) } catch { return text.slice(1, -1) }
  }
  if (text.length >= 2 && text.startsWith("'") && text.endsWith("'")) {
    return text.slice(1, -1).replace(/''/g, "'")
  }
  return text
}

function readDotEnv(path) {
  if (!existsSync(path)) return {}
  const result = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
    if (!match) continue
    result[match[1]] = unquote(match[2])
  }
  return result
}

function readCredentialYaml(path) {
  if (!existsSync(path)) return {}
  const result = {}
  for (const raw of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([A-Za-z_][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line)
    if (!match) continue
    const value = unquote(match[2])
    if (value) result[match[1]] = value
  }
  return result
}

const projectEnv = readDotEnv(resolve(process.cwd(), '.env'))
const userEnv = readDotEnv(resolve(dshHome, '.env'))
const credentialFilePath = resolve(dshHome, '.credentials.yaml')
const credentialFile = readCredentialYaml(credentialFilePath)

function resolveCredential(name) {
  const fromProcess = process.env[name]
  if (fromProcess) return { value: fromProcess, source: 'env' }
  if (credentialFile[name]) return { value: credentialFile[name], source: 'file' }
  if (projectEnv[name]) return { value: projectEnv[name], source: 'project-env' }
  if (userEnv[name]) return { value: userEnv[name], source: 'user-env' }
  return undefined
}

const userId = resolveCredential('QBOSON_USER_ID')
const sdkCode = resolveCredential('QBOSON_SDK_CODE')

console.log(`Harness home: ${dshHome}`)
console.log(`Managed runtime: ${runtimeRoot}`)
console.log(`Python: ${python ?? 'not provisioned yet (first solve will provision automatically)'}`)
console.log(`Credential store: ${credentialFilePath}`)
console.log(`QBOSON_USER_ID: ${userId ? `configured (${userId.source})` : 'not configured'}`)
console.log(`QBOSON_SDK_CODE: ${sdkCode ? `configured (${sdkCode.source})` : 'not configured'}`)

if (!python) {
  if (process.argv.includes('--license')) {
    console.error('The managed Python runtime is prepared by the first solve_ising call. Start Harness and call solve_ising, or set QBOSON_ISING_PYTHON to a compatible Python 3.10 interpreter.')
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
if (userId) childEnv.QBOSON_USER_ID = userId.value
if (sdkCode) childEnv.QBOSON_SDK_CODE = sdkCode.value

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
