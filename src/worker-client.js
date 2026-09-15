import { createHash, randomUUID } from 'node:crypto'
import { IsingSolverError, errorMessage } from './errors.js'

function createTimeoutSignal(timeoutMs) {
  const controller = new AbortController()
  const timer = setTimeout(() => {
    controller.abort(new IsingSolverError('TIMEOUT', `Ising solve exceeded ${timeoutMs} ms`))
  }, timeoutMs)
  timer.unref?.()
  return { signal: controller.signal, clear: () => clearTimeout(timer) }
}

function combineSignals(signals) {
  const live = signals.filter(Boolean)
  if (live.length === 0) return { signal: undefined, cleanup: () => {} }
  if (live.length === 1) return { signal: live[0], cleanup: () => {} }

  const controller = new AbortController()
  const listeners = []
  const abortFrom = (signal) => {
    if (!controller.signal.aborted) controller.abort(signal.reason)
  }

  for (const signal of live) {
    if (signal.aborted) {
      abortFrom(signal)
      break
    }
    const listener = () => abortFrom(signal)
    signal.addEventListener('abort', listener, { once: true })
    listeners.push([signal, listener])
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener)
    },
  }
}

function envFingerprint(env) {
  const stable = Object.entries(env)
    .filter(([, value]) => value !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex')
}

/** Long-lived NDJSON bridge to the Python 3.10 Kaiwu worker. */
export class KaiwuWorkerClient {
  constructor(ctx, options) {
    this.ctx = ctx
    this.options = options
    this.handle = undefined
    this.startPromise = undefined
    this.stopPromise = undefined
    this.readyWaiter = undefined
    this.pending = new Map()
    this.stdoutBuffer = ''
    this.disposed = false
    this.workerEnvFingerprint = undefined
  }

  async ensureStarted(signal, env) {
    if (this.disposed) throw new IsingSolverError('PROVIDER_DISPOSED', 'Kaiwu solver provider is disposed')

    const nextFingerprint = envFingerprint(env)
    if (this.handle && this.workerEnvFingerprint === nextFingerprint) return
    if (this.handle && this.workerEnvFingerprint !== nextFingerprint) {
      await this.stop(new IsingSolverError('WORKER_RESTARTED', 'Kaiwu credentials or worker environment changed'))
    }

    if (this.stopPromise) await this.stopPromise
    if (this.handle && this.workerEnvFingerprint === nextFingerprint) return
    if (this.startPromise) {
      await this.startPromise
      if (this.handle && this.workerEnvFingerprint === nextFingerprint) return
      if (this.handle) {
        await this.stop(new IsingSolverError('WORKER_RESTARTED', 'Kaiwu worker environment changed during startup'))
      }
    }

    this.startPromise = this.start(signal, env, nextFingerprint).finally(() => {
      this.startPromise = undefined
    })
    return this.startPromise
  }

  async start(signal, env, fingerprint) {
    if (signal?.aborted) throw signal.reason ?? new IsingSolverError('ABORTED', 'Ising solve aborted')

    const executable = await this.ctx.subprocess.resolveExecutable(
      this.options.pythonExecutable,
      env,
      signal,
    )

    let resolveReady
    let rejectReady
    const ready = new Promise((resolve, reject) => {
      resolveReady = resolve
      rejectReady = reject
    })
    this.readyWaiter = { resolve: resolveReady, reject: rejectReady }

    const handle = this.ctx.subprocess.spawn({
      argv: [executable, this.options.workerPath],
      cwd: this.options.cwd,
      stdio: {
        stdin: 'pipe',
        stdout: 'pipe',
        stderr: 'inherit',
      },
      graceMs: this.options.graceMs,
      env,
    })

    this.handle = handle
    this.workerEnvFingerprint = fingerprint
    this.stdoutBuffer = ''

    if (!handle.stdin || !handle.stdout) {
      await this.stop(new IsingSolverError('WORKER_START_FAILED', 'Kaiwu worker did not expose stdin/stdout pipes'))
      throw new IsingSolverError('WORKER_START_FAILED', 'Kaiwu worker did not expose stdin/stdout pipes')
    }

    handle.stdout.setEncoding('utf8')
    handle.stdout.on('data', (chunk) => this.onStdout(chunk))
    handle.stdout.on('error', (error) => {
      void this.stop(new IsingSolverError('WORKER_IO_ERROR', errorMessage(error)))
    })

    void handle.done.then(
      (outcome) => this.onExit(handle, outcome),
      (error) => this.onExit(handle, undefined, error),
    )

    const onAbort = () => {
      void this.stop(signal?.reason ?? new IsingSolverError('ABORTED', 'Ising solve aborted'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })

    try {
      await ready
    } finally {
      signal?.removeEventListener('abort', onAbort)
      this.readyWaiter = undefined
    }
  }

  onStdout(chunk) {
    this.stdoutBuffer += chunk
    while (true) {
      const newline = this.stdoutBuffer.indexOf('\n')
      if (newline < 0) return
      const raw = this.stdoutBuffer.slice(0, newline).trim()
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1)
      if (raw.length === 0) continue

      let message
      try {
        message = JSON.parse(raw)
      } catch (error) {
        void this.stop(new IsingSolverError('WORKER_PROTOCOL_ERROR', `invalid JSON from worker: ${errorMessage(error)}`))
        return
      }
      this.onMessage(message)
    }
  }

  onMessage(message) {
    if (message?.type === 'ready') {
      this.readyWaiter?.resolve(message)
      return
    }
    if (message?.type === 'startup_error') {
      const error = new IsingSolverError(
        message.error?.code ?? 'WORKER_START_FAILED',
        message.error?.message ?? 'Kaiwu worker failed to start',
        message.error?.details,
      )
      this.readyWaiter?.reject(error)
      void this.stop(error)
      return
    }

    const id = message?.id
    if (typeof id !== 'string') {
      void this.stop(new IsingSolverError('WORKER_PROTOCOL_ERROR', 'worker response is missing request id'))
      return
    }

    const pending = this.pending.get(id)
    if (!pending) return
    this.pending.delete(id)

    if (message.ok === true) {
      pending.resolve(message.result)
      return
    }

    pending.reject(new IsingSolverError(
      message.error?.code ?? 'SOLVER_ERROR',
      message.error?.message ?? 'Kaiwu solver failed',
      message.error?.details,
    ))
  }

  onExit(handle, outcome, error) {
    if (this.handle !== handle) return
    this.handle = undefined
    this.workerEnvFingerprint = undefined
    const message = error
      ? `Kaiwu worker failed: ${errorMessage(error)}`
      : `Kaiwu worker exited (code=${String(outcome?.exitCode)}, signal=${String(outcome?.signal)})`
    const exitError = new IsingSolverError('WORKER_EXITED', message)
    this.readyWaiter?.reject(exitError)
    this.rejectPending(exitError)
  }

  rejectPending(error) {
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }

  async request(payload, signal, timeoutMs, env) {
    const timeout = createTimeoutSignal(timeoutMs)
    const combined = combineSignals([signal, timeout.signal])

    try {
      await this.ensureStarted(combined.signal, env)
      if (combined.signal?.aborted) {
        throw combined.signal.reason ?? new IsingSolverError('ABORTED', 'Ising solve aborted')
      }

      const handle = this.handle
      if (!handle?.stdin) throw new IsingSolverError('WORKER_NOT_READY', 'Kaiwu worker is not ready')

      const id = randomUUID()
      const response = new Promise((resolve, reject) => {
        this.pending.set(id, { resolve, reject })
      })

      const onAbort = () => {
        const reason = combined.signal?.reason instanceof Error
          ? combined.signal.reason
          : new IsingSolverError(signal?.aborted ? 'ABORTED' : 'TIMEOUT', 'Ising solve aborted')
        void this.stop(reason)
      }
      combined.signal?.addEventListener('abort', onAbort, { once: true })

      try {
        const line = `${JSON.stringify({ id, ...payload })}\n`
        await new Promise((resolve, reject) => {
          handle.stdin.write(line, 'utf8', (error) => error ? reject(error) : resolve())
        })
        return await response
      } catch (error) {
        this.pending.delete(id)
        if (error instanceof IsingSolverError) throw error
        throw new IsingSolverError('WORKER_IO_ERROR', errorMessage(error))
      } finally {
        combined.signal?.removeEventListener('abort', onAbort)
      }
    } finally {
      timeout.clear()
      combined.cleanup()
    }
  }

  async stop(reason = new IsingSolverError('WORKER_STOPPED', 'Kaiwu worker stopped')) {
    if (this.stopPromise) return this.stopPromise
    const handle = this.handle
    this.handle = undefined
    this.workerEnvFingerprint = undefined
    this.readyWaiter?.reject(reason)
    this.rejectPending(reason)
    if (!handle) return

    handle.terminate()
    this.stopPromise = handle.waitForExit().catch(() => false).finally(() => {
      this.stopPromise = undefined
    })
    return this.stopPromise
  }

  async dispose() {
    this.disposed = true
    await this.stop(new IsingSolverError('PROVIDER_DISPOSED', 'Kaiwu solver provider disposed'))
  }
}
