export type ActionType = "ALLOW_COD" | "PREPAID_ONLY" | "OTP_VERIFY" | "BLOCK";

// --- Phase 8A: Experimentation ---
export interface Experiment {
  id: string;
  name: string;
  status: "ACTIVE" | "PAUSED" | "CONCLUDED";
  trafficAllocation: number; // 0.0 to 1.0
  variants: ExperimentVariant[];
  goal: string;
}

export interface ExperimentVariant {
  id: string;
  action: ActionType;
  weight: number; // relative weight, e.g. 1
}

export interface ExperimentAssignment {
  experimentId: string;
  variantId: string;
  assignedAction: ActionType;
}

// --- Phase 8B: ML Offline ---
export interface FeatureDefinition {
  id: string;
  name: string;
  version: string;
  dependencies: string[];
  unit: string;
  owner: string;
}

export interface LabelDefinition {
  id: string;
  name: string;
  type: "BOOLEAN" | "NUMBER" | "CATEGORICAL";
}

export interface DatasetVersion {
  id: string;
  createdAt: Date;
  recordCount: number;
  checksum: string;
}

export interface ReproducibleRun {
  datasetVersionId: string;
  featureVersionHash: string;
  labelVersionHash: string;
  trainerVersion: string;
  parameters: Record<string, any>;
  randomSeed: number;
  gitCommit: string;
}

// --- Phase 8C: Inference & Shadow ---
export type ModelStatus = "TRAINING" | "PENDING_REVIEW" | "APPROVED" | "SHADOW" | "CANARY" | "PRODUCTION" | "ROLLBACK" | "DEPRECATED";

export interface ModelMetadata {
  modelId: string;
  version: string;
  status: ModelStatus;
  metrics: {
    auc: number;
    calibrationError: number;
  };
  createdAt: Date;
}

export interface PredictionRecord {
  id: string;
  inputHash: string;
  modelId: string;
  modelVersion: string;
  prediction: number;
  confidence: number;
  latencyMs: number;
  timestamp: Date;
}

export interface ShadowComparisonMetrics {
  agreementPercentage: number;
  averageEvDelta: number;
  averageRiskDelta: number;
  falseBlockRate: number;
}
