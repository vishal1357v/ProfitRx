import { ExecutionContext } from "../../infrastructure/context/execution.context";

export interface PipelineStep<TContext = any> {
  name: string;
  execute(context: ExecutionContext, pipelineData: TContext): Promise<TContext>;
}

export class Pipeline<TContext = any> {
  private steps: PipelineStep<TContext>[] = [];

  addStep(step: PipelineStep<TContext>) {
    this.steps.push(step);
  }

  async execute(executionContext: ExecutionContext, initialData: TContext): Promise<TContext> {
    let currentData = initialData;
    for (const step of this.steps) {
      currentData = await step.execute(executionContext, currentData);
    }
    return currentData;
  }
}
