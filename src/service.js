import { Service } from '@deepseek-ai/cordis'

/** Stable Service seam consumed by the model-facing tool. */
export class IsingSolverService extends Service {
  constructor(ctx) {
    super(ctx, 'isingSolver')
  }

  async solve(_request, _signal) {
    throw new Error('IsingSolverService.solve() must be implemented by a provider')
  }
}
