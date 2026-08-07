import { MetricDefinition } from "../types";
import { LearningRecord } from "../../outcomes/types";

export interface MetricProvider {
  definition: MetricDefinition;
  calculate(records: LearningRecord[]): number;
}

export class MetricRegistry {
  private static providers: Map<string, MetricProvider> = new Map();

  static register(provider: MetricProvider) {
    this.providers.set(provider.definition.id, provider);
  }

  static get(id: string): MetricProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new Error(`Metric provider ${id} not found`);
    return provider;
  }

  static getAll(): MetricProvider[] {
    return Array.from(this.providers.values());
  }
}
