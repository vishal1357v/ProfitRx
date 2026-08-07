import crypto from "crypto";

export class PrivacyScrubber {
  /**
   * Hashes PII fields before they are exported to any dataset.
   */
  static scrub(record: any): any {
    const scrubbed = JSON.parse(JSON.stringify(record));
    
    // Example PII stripping
    if (scrubbed.customer) {
      if (scrubbed.customer.phone) {
        scrubbed.customer.phoneHash = this.hash(scrubbed.customer.phone);
        delete scrubbed.customer.phone;
      }
      if (scrubbed.customer.email) {
        scrubbed.customer.emailHash = this.hash(scrubbed.customer.email);
        delete scrubbed.customer.email;
      }
      if (scrubbed.customer.address) {
        delete scrubbed.customer.address; // Completely remove raw address
      }
    }

    return scrubbed;
  }

  private static hash(input: string): string {
    return crypto.createHash("sha256").update(input).digest("hex");
  }
}
