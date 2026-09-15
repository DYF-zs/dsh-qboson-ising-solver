import { defineTool } from '@deepseek-ai/dsh-tools'

export const name = 'qboson-ising-tool'
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
    async execute(args, exec) {
      return ctx.isingSolver.solve({ isingMatrix: args.ising_matrix }, exec.signal)
    },
  }))
}
