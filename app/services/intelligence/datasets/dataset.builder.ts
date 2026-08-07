import { DataValidator } from "./data.validator";
import { PrivacyScrubber } from "../feature-store/privacy.scrubber";
import crypto from "crypto";
import { DatasetVersion } from "../types";

export class DatasetBuilder {
  /**
   * Constructs an immutable dataset version from raw learning records.
   */
  static build(records: any[], expectedSchema: string[]): { version: DatasetVersion, data: any[] } {
    const validRecords = [];

    for (const record of records) {
      if (DataValidator.validate(record, expectedSchema)) {
        const scrubbed = PrivacyScrubber.scrub(record);
        validRecords.push(scrubbed);
      }
    }

    const payloadString = JSON.stringify(validRecords);
    const checksum = crypto.createHash("sha256").update(payloadString).digest("hex");
    
    const version: DatasetVersion = {
      id: `dataset_${new Date().toISOString().replace(/[:.]/g, "-")}`,
      createdAt: new Date(),
      recordCount: validRecords.length,
      checksum
    };

    return { version, data: validRecords };
  }
}
