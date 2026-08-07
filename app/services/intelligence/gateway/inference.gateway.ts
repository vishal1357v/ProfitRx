import { ModelRegistry } from "../registry/model.registry";
import { PredictionStore } from "./prediction.store";
import { PredictionRecord } from "../types";
import crypto from "crypto";
import { ActionType } from "../types";

export class InferenceGateway {
  /**
   * Routes a request to the active production model, saves the prediction, and returns the result.
   */
  static predict(features: any): { action: ActionType, prediction: number, confidence: number } | null {
    const activeModel = ModelRegistry.getActiveModel();
    if (!activeModel) return null;

    const startTime = Date.now();
    
    // Mock Model Inference
    // In real life, this calls a gRPC/HTTP endpoint or loads a local ONNX model
    const mockPrediction = 0.85; 
    const mockConfidence = 0.92;
    const mockAction: ActionType = "OTP_VERIFY";

    const latency = Date.now() - startTime;
    const inputHash = crypto.createHash("md5").update(JSON.stringify(features)).digest("hex");

    const record: PredictionRecord = {
      id: `pred_${Date.now()}`,
      inputHash,
      modelId: activeModel.modelId,
      modelVersion: activeModel.version,
      prediction: mockPrediction,
      confidence: mockConfidence,
      latencyMs: latency,
      timestamp: new Date()
    };

    PredictionStore.save(record);

    return { action: mockAction, prediction: mockPrediction, confidence: mockConfidence };
  }
}
