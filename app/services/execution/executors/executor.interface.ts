import { ExecutionContext, ExecutionResult } from "../types";

export interface ActionExecutor {
  execute(context: ExecutionContext): Promise<ExecutionResult>;
}
