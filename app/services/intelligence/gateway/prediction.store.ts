import { PredictionRecord } from "../types";

export class PredictionStore {
  private static predictions: Map<string, PredictionRecord> = new Map();

  static save(record: PredictionRecord) {
    this.predictions.set(record.id, record);
  }

  static get(id: string): PredictionRecord | undefined {
    return this.predictions.get(id);
  }
}
