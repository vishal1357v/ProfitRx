import { Experiment } from "../types";

export class ExperimentRegistry {
  private static experiments: Map<string, Experiment> = new Map();

  static register(experiment: Experiment) {
    this.experiments.set(experiment.id, experiment);
  }

  static getActiveExperiments(): Experiment[] {
    return Array.from(this.experiments.values()).filter(e => e.status === "ACTIVE");
  }

  static get(id: string): Experiment | undefined {
    return this.experiments.get(id);
  }
}
