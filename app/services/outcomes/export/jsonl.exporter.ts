import fs from 'fs/promises';
import { DatasetExporter } from "./exporter.interface";
import { LearningRecord } from "../types";

export class JsonlExporter implements DatasetExporter {
  async export(records: LearningRecord[], filepath: string): Promise<void> {
    const lines = records.map(record => JSON.stringify(record)).join('\n') + '\n';
    await fs.appendFile(filepath, lines, 'utf8');
  }
}
