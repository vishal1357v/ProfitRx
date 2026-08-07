export class DataValidator {
  /**
   * Prevents broken data from being built into a dataset.
   * Checks for outliers, missing values, and schema drift.
   */
  static validate(record: any, schema: string[]): boolean {
    if (!record) return false;

    // Check for missing values against expected schema
    for (const key of schema) {
      if (record[key] === undefined || record[key] === null) {
        return false;
      }
    }

    // Basic Outlier check: Example on a known numeric feature
    if (typeof record.orderValue === "number" && record.orderValue > 1000000) {
      return false; // Extreme outlier
    }

    return true;
  }
}
