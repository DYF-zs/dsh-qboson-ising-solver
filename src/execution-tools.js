import { createHash } from 'node:crypto'
import { dirname, isAbsolute } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { parseIsingMatrixFile } from './matrix.js'
import { IsingSolverError, errorMessage } from './errors.js'

const render = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]

/** Pending-call card shown in the UI while a tool call is running. */
function pendingView(title, kind, text) {
  return {
    card: 'generic',
    title,
    kind,
    content: [{ type: 'text', text }],
  }
}

const runtimeOutput = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      python_executable: { type: 'string', required: true },
      python_version: { type: 'string', required: true },
      kaiwu_version: { type: 'string', required: true },
      runtime_dir: { type: 'string', required: true },
    },
  },
  render,
}

/** Inspect the environment and License before selecting an operation. */
export function registerCheckTool(ctx) {
  ctx.tools.register(defineTool({
    name: 'check_kaiwu_runtime',
    description: 'Inspect the plugin Python/Kaiwu environment and License. Returns environment_status (ready, missing, invalid), license_status (valid, missing, invalid, not_checked), paths and available versions. Checks existing files and SDK authorization without installing dependencies, opening a window or submitting a solver task. Use prepare_kaiwu_runtime when the environment is missing or invalid; use configure_kaiwu_license when the environment is ready and authorization is needed.',
    parameters: {},
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          environment_status: { type: 'string', enum: ['ready', 'missing', 'invalid'], required: true },
          license_status: { type: 'string', enum: ['valid', 'missing', 'invalid', 'not_checked'], required: true },
          runtime_dir: { type: 'string', required: true },
          python_executable: { type: 'string' },
          python_version: { type: 'string' },
          kaiwu_version: { type: 'string' },
          message: { type: 'string' },
        },
      },
      render,
    },
    presentCall: () => pendingView('检查 Kaiwu 运行环境与授权状态', 'read',
      '只读取现有环境与 License 状态，不安装依赖、不打开窗口，通常几秒内完成。'),
    execute: (_args, exec) => ctx.isingSolver.checkRuntime(exec.signal),
  }))
}

/** Open License configuration for the prepared Kaiwu environment. */
export function registerLicenseTool(ctx) {
  ctx.tools.register(defineTool({
    name: 'configure_kaiwu_license',
    description: 'Open the local QBoson authorization window to renew the Kaiwu License or switch accounts in the prepared plugin environment. Always opens the window, including when the current License is valid. The user enters the user ID and SDK Code in the window. Requires an existing compatible environment; use prepare_kaiwu_runtime if it has not been prepared. Returns interpreter facts after successful authorization. Does not install dependencies or submit a solver task.',
    parameters: {},
    output: runtimeOutput,
    presentCall: () => pendingView('打开 QBoson 授权窗口', 'execute',
      '即将打开本地授权窗口：请在窗口中填写用户 ID 和 SDK Code，点击「授权」。授权成功后窗口自动关闭，期间请勿关闭应用。'),
    execute: (_args, exec) => ctx.isingSolver.configureLicense(exec.signal),
  }))
}

/** Register the Kaiwu provider's optional environment capability. */
export function registerRuntimeTool(ctx) {
  ctx.tools.register(defineTool({
    name: 'prepare_kaiwu_runtime',
    description: 'Prepare or reuse the plugin Python 3.10/Kaiwu environment and verify its License for local or hardware solving. May download dependencies on first use and open a local authorization window when the License is missing or invalid. Returns the absolute interpreter path and installed versions after authorization succeeds. Does not submit a solver task. Run generated scripts with this interpreter through the normal DSH shell tool.',
    parameters: {},
    output: runtimeOutput,
    presentCall: () => pendingView('准备 Kaiwu 运行环境（Python 3.10）', 'execute',
      '首次使用会下载并安装 Python 3.10 与 Kaiwu SDK 依赖，可能需要几分钟，请保持联网；之后会校验授权，必要时弹出授权窗口。已就绪的环境会立即返回。'),
    execute: (_args, exec) => ctx.isingSolver.prepareRuntime(exec.signal),
  }))
}

/** Register in a child scope that requires the DSH filesystem service. */
export function registerFileTool(ctx) {
  ctx.tools.register(defineTool({
    name: 'solve_ising_file',
    description: 'Solve an already-modeled Ising matrix from a UTF-8 CSV or JSON file with QBoson SPQC. CSV contains comma-separated numeric rows without headers or row indexes; JSON contains a 2D array or {"ising_matrix": [...]}. Prefer this tool for existing files or large matrices. Saves all raw solutions as JSON and returns a compact summary. Use absolute paths and an existing output directory. If saved=false, preserve raw_result_json; the completed task must not be resubmitted.',
    parameters: {
      matrix_path: { type: 'string', required: true, description: 'Absolute path to a CSV or JSON file containing the Ising matrix.' },
      result_path: { type: 'string', required: true, description: 'Absolute path for a new raw-result JSON file. Existing files are rejected before submission.' },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dimension: { type: 'integer', required: true },
          solution_count: { type: 'integer', required: true },
          best_hamiltonian: { type: 'number', required: true },
          solver_time_us: { type: 'number', required: true },
          task_name: { type: 'string', required: true },
          matrix_sha256: { type: 'string', required: true },
          result_path: { type: 'string', required: true },
          saved: { type: 'boolean', required: true },
          save_error: { type: 'string' },
          raw_result_json: { type: 'string' },
        },
      },
      render,
    },
    presentCall: (args) => ({
      card: 'generic',
      title: '从文件提交 Ising 矩阵到 QBoson SPQC 真机求解',
      kind: 'execute',
      rawInput: `矩阵: ${args.matrix_path}\n结果: ${args.result_path}`,
      content: [{
        type: 'text',
        text: '正在读取矩阵文件、提交云端真机求解并保存全部候选解。首次使用会先自动准备 Python 3.10 / Kaiwu 运行环境（下载依赖可能需要几分钟），随后可能弹出授权窗口；已就绪的环境则直接求解，通常数十秒内完成。',
      }],
    }),
    async execute(args, exec) {
      if (!isAbsolute(args.matrix_path) || !isAbsolute(args.result_path)) {
        throw new IsingSolverError('INVALID_PATH', 'matrix_path and result_path must be absolute paths')
      }
      const sandboxPolicy = ctx.get('sandboxPolicy')?.resolve(exec.agent ? { session: exec.agent.session } : {})
      const input = await ctx.fs.resolve(args.matrix_path, { signal: exec.signal })
      const output = await ctx.fs.resolve(args.result_path, { signal: exec.signal })
      if (await ctx.fs.stat(output, exec.signal)) {
        throw new IsingSolverError('RESULT_FILE_EXISTS', 'Choose a new result_path; the existing file will not be overwritten')
      }
      const parent = await ctx.fs.resolve(dirname(args.result_path), { signal: exec.signal })
      if ((await ctx.fs.stat(parent, exec.signal))?.type !== 'directory') {
        throw new IsingSolverError('INVALID_PATH', 'Create the result directory before submitting a hardware task')
      }
      const text = await ctx.fs.readText(input, exec.signal)
      const matrix = parseIsingMatrixFile(text, args.matrix_path)
      const matrixSha256 = createHash('sha256').update(JSON.stringify(matrix)).digest('hex')
      const result = await ctx.isingSolver.solve({ isingMatrix: matrix }, exec.signal)
      const rawResultJson = JSON.stringify({ ...result, matrix_sha256: matrixSha256 }, null, 2) + '\n'
      const summary = {
        dimension: result.dimension,
        solution_count: result.solutions.length,
        best_hamiltonian: result.solutions[0].hamiltonian,
        solver_time_us: result.solver_time_us,
        task_name: result.task_name,
        matrix_sha256: matrixSha256,
        result_path: args.result_path,
        saved: true,
      }
      try {
        await ctx.fs.writeText(output, rawResultJson, { kind: 'createIfAbsent' }, exec.signal, sandboxPolicy)
      } catch (error) {
        // A completed hardware task must remain recoverable without resubmission.
        summary.saved = false
        summary.save_error = errorMessage(error)
        summary.raw_result_json = rawResultJson
      }
      return summary
    },
  }))
}
