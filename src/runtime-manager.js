import { constants as fsConstants } from 'node:fs'
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, platform } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { IsingSolverError, errorMessage } from './errors.js'

const UV_VERSION = '0.12.12'
const RUNTIME_SCHEMA = 1

function optionalString(value) {
  if (value === undefined || value === null) return undefined
  const text = String(value).trim()
  return text.length > 0 ? text : undefined
}

async function exists(path) {
  try {
    await access(path, fsConstants.F_OK)
    return true
  } catch {
    return false
  }
}

export function defaultRuntimeRoot(env = process.env) {
  const dshHome = optionalString(env.DSH_HOME) ?? resolve(homedir(), '.dsh')
  return resolve(
    optionalString(env.QBOSON_ISING_RUNTIME_DIR)
      ?? join(dshHome, 'runtimes', 'dsh-qboson-ising-solver'),
  )
}

export function venvPythonPath(venvDir, currentPlatform = platform()) {
  return currentPlatform === 'win32'
    ? join(venvDir, 'Scripts', 'python.exe')
    : join(venvDir, 'bin', 'python')
}

function privateUvCandidates(uvDir, currentPlatform = platform()) {
  const executable = currentPlatform === 'win32' ? 'uv.exe' : 'uv'
  return [join(uvDir, executable), join(uvDir, 'bin', executable)]
}

function installerUrl(currentPlatform = platform()) {
  const suffix = currentPlatform === 'win32' ? 'install.ps1' : 'install.sh'
  return `https://astral.sh/uv/${UV_VERSION}/${suffix}`
}

function shellCandidates(currentPlatform = platform()) {
  return currentPlatform === 'win32' ? ['pwsh', 'powershell'] : ['sh']
}

function runtimeEnv(root, base = process.env) {
  return {
    ...base,
    UV_PYTHON_INSTALL_DIR: join(root, 'python'),
    UV_CACHE_DIR: join(root, 'uv-cache'),
    UV_NO_MODIFY_PATH: '1',
    UV_NO_PROGRESS: '1',
    PYTHONUTF8: '1',
  }
}

async function collectProcess(handle) {
  let stdout = ''
  let stderr = ''
  handle.stdout?.setEncoding?.('utf8')
  handle.stderr?.setEncoding?.('utf8')
  handle.stdout?.on?.('data', (chunk) => { stdout += chunk })
  handle.stderr?.on?.('data', (chunk) => { stderr += chunk })
  const outcome = await handle.done
  return { outcome, stdout, stderr }
}

/**
 * Managed Python 3.10 runtime for the Kaiwu worker.
 *
 * The runtime is provisioned under $DSH_HOME, contains `kaiwu`, and is
 * addressed directly by the provider when launching the worker.
 */
export class ManagedKaiwuRuntime {
  constructor(ctx, config = {}) {
    this.ctx = ctx
    this.explicitPython = optionalString(config.pythonExecutable ?? process.env.QBOSON_ISING_PYTHON)
    this.autoSetup = config.autoSetup !== false
    this.kaiwuSpec = optionalString(config.kaiwuSpec ?? process.env.QBOSON_KAIWU_SPEC) ?? 'kaiwu'
    this.root = resolve(optionalString(config.runtimeDir) ?? defaultRuntimeRoot())
    this.venvDir = join(this.root, 'venv')
    this.managedPython = venvPythonPath(this.venvDir)
    this.uvDir = join(this.root, 'uv')
    this.bootstrapDir = join(this.root, 'bootstrap')
    this.setupPromise = undefined
  }

  async resolvePython(signal) {
    await mkdir(this.root, { recursive: true })

    if (this.explicitPython) {
      await this.assertCompatiblePython(this.explicitPython, signal, true)
      return this.explicitPython
    }

    if (await exists(this.managedPython) && await this.runtimeMetadataMatches()) {
      try {
        await this.assertCompatiblePython(this.managedPython, signal, true)
        return this.managedPython
      } catch {
        // A partial or stale runtime is repaired below.
      }
    }

    if (!this.autoSetup) {
      throw new IsingSolverError(
        'PYTHON_RUNTIME_MISSING',
        'The managed Kaiwu Python 3.10 runtime is not ready and automatic setup is disabled.',
      )
    }

    await this.ensureSetup(signal)
    return this.managedPython
  }


  async runtimeMetadataMatches() {
    try {
      const value = JSON.parse(await readFile(join(this.root, 'runtime.json'), 'utf8'))
      return value?.schema === RUNTIME_SCHEMA
        && value?.python === '3.10'
        && value?.kaiwu === this.kaiwuSpec
    } catch {
      return false
    }
  }

  async ensureSetup(signal) {
    if (this.setupPromise) return this.setupPromise
    this.setupPromise = this.setup(signal).finally(() => {
      this.setupPromise = undefined
    })
    return this.setupPromise
  }

  async setup(signal) {
    if (signal?.aborted) throw signal.reason ?? new IsingSolverError('ABORTED', 'Runtime setup aborted')

    await mkdir(this.root, { recursive: true })
    console.error('[dsh-qboson-ising-solver] Preparing private Python 3.10 runtime (first use only)...')

    const uv = await this.ensureUv(signal)
    const env = runtimeEnv(this.root)

    // Repair any partially-created environment atomically enough for the next run.
    await rm(this.venvDir, { recursive: true, force: true })

    await this.runChecked(
      [uv, 'venv', '--python', '3.10', this.venvDir],
      { env, signal, code: 'PYTHON_SETUP_FAILED' },
    )

    await this.runChecked(
      [uv, 'pip', 'install', '--python', this.managedPython, this.kaiwuSpec],
      { env, signal, code: 'KAIWU_INSTALL_FAILED' },
    )

    await this.assertCompatiblePython(this.managedPython, signal, true)

    await writeFile(join(this.root, 'runtime.json'), `${JSON.stringify({
      schema: RUNTIME_SCHEMA,
      python: '3.10',
      kaiwu: this.kaiwuSpec,
      uv: UV_VERSION,
    }, null, 2)}\n`, 'utf8')

    console.error(`[dsh-qboson-ising-solver] Runtime ready: ${this.managedPython}`)
  }

  async ensureUv(signal) {
    try {
      return await this.ctx.subprocess.resolveExecutable('uv', process.env, signal)
    } catch {
      // Use a plugin-private uv installation instead of requiring a user-level tool.
    }

    for (const candidate of privateUvCandidates(this.uvDir)) {
      if (await exists(candidate)) return candidate
    }

    await mkdir(this.bootstrapDir, { recursive: true })
    await mkdir(this.uvDir, { recursive: true })

    const currentPlatform = platform()
    if (!['win32', 'linux', 'darwin'].includes(currentPlatform)) {
      throw new IsingSolverError(
        'UNSUPPORTED_PLATFORM',
        `Automatic Python setup is not supported on ${currentPlatform}. Set QBOSON_ISING_PYTHON to a compatible Python 3.10 interpreter.`,
      )
    }

    const url = installerUrl(currentPlatform)
    let response
    try {
      response = await fetch(url, { signal })
    } catch (error) {
      throw new IsingSolverError('UV_DOWNLOAD_FAILED', `Failed to download the pinned uv installer: ${errorMessage(error)}`)
    }
    if (!response.ok) {
      throw new IsingSolverError('UV_DOWNLOAD_FAILED', `Failed to download uv installer (${response.status} ${response.statusText})`)
    }

    const extension = currentPlatform === 'win32' ? '.ps1' : '.sh'
    const installerPath = join(this.bootstrapDir, `uv-${UV_VERSION}${extension}`)
    await writeFile(installerPath, await response.text(), 'utf8')

    let shell
    for (const candidate of shellCandidates(currentPlatform)) {
      try {
        shell = await this.ctx.subprocess.resolveExecutable(candidate, process.env, signal)
        break
      } catch {
        // Try the next shell name.
      }
    }
    if (!shell) {
      throw new IsingSolverError('UV_BOOTSTRAP_FAILED', 'No supported shell was found to bootstrap the private Python runtime')
    }

    const env = {
      ...process.env,
      UV_UNMANAGED_INSTALL: this.uvDir,
      UV_NO_MODIFY_PATH: '1',
    }
    const argv = currentPlatform === 'win32'
      ? [shell, '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', installerPath]
      : [shell, installerPath]

    await this.runChecked(argv, { env, signal, code: 'UV_BOOTSTRAP_FAILED' })

    for (const candidate of privateUvCandidates(this.uvDir)) {
      if (await exists(candidate)) return candidate
    }

    throw new IsingSolverError('UV_BOOTSTRAP_FAILED', `uv installer completed but no uv executable was found under ${this.uvDir}`)
  }

  async assertCompatiblePython(python, signal, requireKaiwu) {
    const script = [
      'import sys',
      'assert sys.version_info[:2] == (3, 10), f"Python 3.10 required, got {sys.version.split()[0]}"',
      requireKaiwu ? 'import kaiwu' : '',
      'print(sys.executable)',
    ].filter(Boolean).join('; ')

    await this.runChecked(
      [python, '-c', script],
      { env: { ...process.env, PYTHONUTF8: '1' }, signal, code: 'PYTHON_RUNTIME_INVALID' },
    )
  }

  async runChecked(argv, { env, signal, code }) {
    let executable = argv[0]
    if (!isAbsolute(argv[0]) && !argv[0].includes('/') && !argv[0].includes('\\')) {
      try {
        executable = await this.ctx.subprocess.resolveExecutable(argv[0], env, signal)
      } catch {
        // spawn will provide the definitive error below.
      }
    }

    let handle
    try {
      handle = this.ctx.subprocess.spawn({
        argv: [executable, ...argv.slice(1)],
        cwd: this.root,
        env,
        stdio: { stdin: 'ignore', stdout: 'pipe', stderr: 'pipe' },
        graceMs: 5_000,
      })
    } catch (error) {
      throw new IsingSolverError(code, `Failed to start ${argv[0]}: ${errorMessage(error)}`)
    }

    const onAbort = () => handle.terminate()
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      const { outcome, stdout, stderr } = await collectProcess(handle)
      if (outcome?.exitCode !== 0) {
        const detail = (stderr || stdout).trim().slice(-4_000)
        throw new IsingSolverError(code, `${argv[0]} exited with code ${String(outcome?.exitCode)}${detail ? `: ${detail}` : ''}`)
      }
      return stdout
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

export const runtimeInternals = {
  UV_VERSION,
  installerUrl,
  privateUvCandidates,
  runtimeEnv,
}
