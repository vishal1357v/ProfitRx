import { ModelMetadata, ModelStatus } from "../types";

export class ModelRegistry {
  private static models: Map<string, ModelMetadata> = new Map();
  private static activeProductionModel: string | null = null;
  private static previousStableModel: string | null = null;

  static register(model: ModelMetadata) {
    this.models.set(model.version, model);
  }

  static get(version: string): ModelMetadata | undefined {
    return this.models.get(version);
  }

  static promote(version: string, newStatus: ModelStatus) {
    const model = this.models.get(version);
    if (!model) throw new Error("Model not found");

    // Simplified state machine enforcement
    if (newStatus === "PRODUCTION") {
      if (model.status !== "CANARY" && model.status !== "SHADOW") {
         throw new Error("Cannot promote directly to PRODUCTION without CANARY or SHADOW");
      }
      if (this.activeProductionModel) {
         this.previousStableModel = this.activeProductionModel;
         const oldProd = this.models.get(this.activeProductionModel);
         if (oldProd) oldProd.status = "DEPRECATED";
      }
      this.activeProductionModel = version;
    }

    model.status = newStatus;
  }

  static rollback() {
    if (!this.previousStableModel) throw new Error("No previous stable model to rollback to");
    
    if (this.activeProductionModel) {
      const current = this.models.get(this.activeProductionModel);
      if (current) current.status = "ROLLBACK";
    }

    const previous = this.models.get(this.previousStableModel);
    if (previous) previous.status = "PRODUCTION";
    
    this.activeProductionModel = this.previousStableModel;
    this.previousStableModel = null;
  }

  static getActiveModel(): ModelMetadata | null {
    if (!this.activeProductionModel) return null;
    return this.models.get(this.activeProductionModel) || null;
  }
}
