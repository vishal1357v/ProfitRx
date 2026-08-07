import { LearningRecord } from "../types";

export interface DatasetExporter {
  export(records: LearningRecord[], filepath: string): Promise<void>;
}
