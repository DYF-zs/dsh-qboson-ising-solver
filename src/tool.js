import { defineTool } from '@deepseek-ai/dsh-tools'
import { registerCheckTool, registerFileTool, registerLicenseTool, registerRuntimeTool } from './execution-tools.js'

export const name = 'qboson-ising-tools'
export const inject = ['tools', 'isingSolver']

export function apply(ctx) {
  ctx.tools.register(defineTool({
    name: 'solve_ising',
    description:
      'Solve a complete, already-modeled N×N numeric Ising Matrix with QBoson Kaiwu SDK and SPQC. ' +
      'Use this tool after problem modeling has produced the final Ising Matrix. ' +
      'Solver capacity follows the active Kaiwu SDK, license, project, and SPQC constraints.',
    parameters: {
      ising_matrix: {
        type: 'array',
        required: true,
        items: {
          type: 'array',
          items: { type: 'number' },
        },
        description: 'Complete non-empty N×N numeric Ising Matrix, already modeled for direct solver input.',
      },
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          dimension: { type: 'integer', required: true },
          solutions: {
            type: 'array',
            required: true,
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                spins: {
                  type: 'array',
                  required: true,
                  items: { type: 'integer' },
                },
                hamiltonian: { type: 'number', required: true },
              },
            },
          },
          solver_time_us: { type: 'number', required: true },
          task_name: { type: 'string', required: true },
        },
      },
      render: (_args, value) => [{
        type: 'text',
        text: JSON.stringify(value, null, 2),
      }],
    },
    presentCall: (args) => ({
      card: 'generic',
      title: `提交 ${Array.isArray(args.ising_matrix) ? `${args.ising_matrix.length}×${args.ising_matrix.length}` : 'N×N'} Ising 矩阵到 QBoson SPQC 真机求解`,
      kind: 'execute',
      content: [{
        type: 'text',
        text: '将提交真机并等待候选结果，耗时取决于云端排队、计算和结果回传。首次使用会先自动准备 Python 3.10 / Kaiwu 运行环境，必要时弹出授权窗口。',
      }],
    }),
    async execute(args, exec) {
      return ctx.isingSolver.solve({ isingMatrix: args.ising_matrix }, exec.signal)
    },
  }))

  if (typeof ctx.isingSolver.prepareRuntime === 'function') registerRuntimeTool(ctx)
  if (typeof ctx.isingSolver.configureLicense === 'function') registerLicenseTool(ctx)
  if (typeof ctx.isingSolver.checkRuntime === 'function') registerCheckTool(ctx)
  ctx.inject(['fs'], registerFileTool)
}
