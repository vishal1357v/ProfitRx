import { DatasetExporter } from "./dataset.exporter";
import { DatasetVersion } from "../../types";
import fs from "fs/promises";
import path from "path";

export class JsonlExporter implements DatasetExporter {
  format: "JSONL" = "JSONL";

  async export(version: DatasetVersion, data: any[]): Promise<string> {
    const filename = `${version.id}.jsonl`;
    const exportPath = path.join(process.cwd(), ".datasets", filename);
    
    await fs.mkdir(path.dirname(exportPath), { recursive: true });

    const lines = data.map(record => JSON.stringify(record)).join("\n");
    await fs.writeFile(exportPath, lines, "utf8");

    return exportPath;
  }
}
