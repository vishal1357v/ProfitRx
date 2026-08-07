import { DatasetVersion } from "../types";

export interface TrainingResult {
  modelId: string;
  version: string;
  metrics: {
    auc: number;
    calibrationError: number;
    logLoss: number;
  };
  artifactsPath: string;
}

export interface TrainerInterface {
  name: string;
  train(dataset: DatasetVersion, parameters: Record<string, any>): Promise<TrainingResult>;
}
