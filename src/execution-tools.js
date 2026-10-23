import { createHash } from 'node:crypto'
import { dirname, isAbsolute } from 'node:path'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { validateIsingMatrix } from './matrix.js'
import { IsingSolverError, errorMessage } from './errors.js'

const render = (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }]

/** Register the Kaiwu provider's optional environment capability. */
export function registerRuntimeTool(ctx) {
  ctx.tools.register(defineTool({
    name: 'prepare_kaiwu_runtime',
    description: 'Prepare or reuse the plugin Python 3.10/Kaiwu environment for modeling and decoding. Returns the absolute interpreter path and installed versions. May download dependencies on first use; does not submit a solver task or initialize credentials. Run generated scripts with this interpreter through the normal DSH shell tool.',
    parameters: {},
    output: {
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
    },
    execute: (_args, exec) => ctx.isingSolver.prepareRuntime(exec.signal),
  }))
}

/** Register in a child scope that requires the DSH filesystem service. */
export function registerFileTool(ctx) {
  ctx.tools.register(defineTool({
    name: 'solve_ising_file',
    description: 'Submit an already-modeled Ising matrix from a UTF-8 JSON file to QBoson SPQC. Input is a raw N×N array or {"ising_matrix": [...]}. Saves all raw solutions to a new result file and returns a compact summary. Use absolute paths and an existing output directory. Requires authorized hardware use. If saved=false, preserve raw_result_json with the normal write tool; do not resubmit the completed task.',
    parameters: {
      matrix_path: { type: 'string', required: true, description: 'Absolute path to the input matrix JSON file.' },
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
    async execute(args, exec) {
      if (!isAbsolute(args.matrix_path) || !isAbsolute(args.result_path)) {
        throw new IsingSolverError('INVALID_PATH', 'matrix_path and result_path must be absolute paths')
      }
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
      let parsed
      try {
        parsed = JSON.parse(text)
      } catch (error) {
        throw new IsingSolverError('INVALID_MATRIX', `Matrix file is not valid JSON: ${errorMessage(error)}`)
      }
      const matrix = Array.isArray(parsed) ? parsed : parsed?.ising_matrix
      validateIsingMatrix(matrix)
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
        await ctx.fs.writeText(output, rawResultJson, { kind: 'createIfAbsent' }, exec.signal)
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
