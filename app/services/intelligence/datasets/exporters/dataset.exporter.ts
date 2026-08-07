import { DatasetVersion } from "../../types";

export interface DatasetExporter {
  format: "JSONL" | "CSV" | "PARQUET";
  export(version: DatasetVersion, data: any[]): Promise<string>; // Returns file path or blob reference
}
