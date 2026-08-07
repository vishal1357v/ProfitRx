import { ReproducibleRun, DatasetVersion } from "../types";
import crypto from "crypto";

export class ReproducibleTracker {
  private static runs: Map<string, ReproducibleRun> = new Map();

  static track(
    dataset: DatasetVersion,
    trainerName: string,
    parameters: Record<string, any>,
    seed: number
  ): string {
    const run: ReproducibleRun = {
      datasetVersionId: dataset.id,
      featureVersionHash: this.mockFeatureHash(), // In real life, hash of all feature definitions
      labelVersionHash: this.mockLabelHash(),
      trainerVersion: trainerName,
      parameters,
      randomSeed: seed,
      gitCommit: process.env.GIT_COMMIT || "local-dev"
    };

    const runId = `run_${crypto.createHash("md5").update(JSON.stringify(run)).digest("hex").substring(0, 8)}`;
    this.runs.set(runId, run);
    
    return runId;
  }

  static getRun(runId: string): ReproducibleRun | undefined {
    return this.runs.get(runId);
  }

  private static mockFeatureHash() { return "f_hash_123"; }
  private static mockLabelHash() { return "l_hash_456"; }
}
