import crypto from "crypto";

export class SimulationCache {
  private static cache: Map<string, any> = new Map();

  static generateHash(orderId: string, intervention: string, shippingPartner: string): string {
    return crypto.createHash("md5").update(`${orderId}_${intervention}_${shippingPartner}`).digest("hex");
  }

  static get(hash: string): any | undefined {
    return this.cache.get(hash);
  }

  static set(hash: string, result: any) {
    this.cache.set(hash, result);
  }
}
