export interface BayesianResult {
  variantId: string;
  expectedProfit: number;
  probabilityToBeBest: number;
}

export class BayesianEngine {
  /**
   * Evaluates experiment variants using a mock Bayesian update.
   * In a real production system, this calculates the posterior distributions
   * based on the prior (e.g. historical conversion rates) and observed data (trials/successes).
   */
  static evaluate(variantData: Array<{ variantId: string, conversions: number, trials: number, avgProfitPerConversion: number }>): BayesianResult[] {
    
    // Very simplified mock simulation for probability to be best
    const totalTrials = variantData.reduce((sum, v) => sum + v.trials, 0);
    if (totalTrials === 0) return [];

    let results = variantData.map(v => {
      const conversionRate = v.trials > 0 ? v.conversions / v.trials : 0;
      const expectedProfit = conversionRate * v.avgProfitPerConversion;
      return {
        variantId: v.variantId,
        expectedProfit,
        probabilityToBeBest: 0 // to be calculated
      };
    });

    // Determine highest expected profit and allocate 90%+ probability mock
    const best = results.reduce((prev, current) => (prev.expectedProfit > current.expectedProfit) ? prev : current);
    
    results = results.map(r => ({
      ...r,
      probabilityToBeBest: r.variantId === best.variantId ? 0.95 : 0.05 / (results.length - 1)
    }));

    return results.sort((a, b) => b.probabilityToBeBest - a.probabilityToBeBest);
  }
}
