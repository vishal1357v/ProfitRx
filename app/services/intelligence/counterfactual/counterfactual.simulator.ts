import { SimulationCache } from "./simulation.cache";
import { ActionType } from "../types";

export interface SimulationScenario {
  intervention: ActionType;
  shippingPartner: string;
  codFee: number;
}

export class CounterfactualSimulator {
  /**
   * Simulates a historical order under a specific scenario.
   * Utilizes hashing to skip re-computation on large datasets.
   */
  static simulate(orderId: string, baseRisk: number, baseEV: number, scenario: SimulationScenario): number {
    const hash = SimulationCache.generateHash(orderId, scenario.intervention, scenario.shippingPartner);
    const cached = SimulationCache.get(hash);
    
    if (cached !== undefined) return cached;

    // Extremely simplified mock simulation
    // E.g. OTP reduces risk by 10% but drops conversion by 2%
    let simulatedEV = baseEV;
    if (scenario.intervention === "OTP_VERIFY") {
       simulatedEV = baseEV * 1.05; // Net +5%
    } else if (scenario.intervention === "BLOCK") {
       simulatedEV = 0; // Lost sale, but zero RTO risk
    }

    // Shipping partner mock adjustments
    if (scenario.shippingPartner === "PREMIUM") {
      simulatedEV = simulatedEV - 10; // Extra ₹10 cost
    }

    // COD Fee mock adjustments
    simulatedEV += scenario.codFee;

    SimulationCache.set(hash, simulatedEV);
    return simulatedEV;
  }
}
