/**
 * Applies Bayesian smoothing to an observed rate.
 * Prevents small sample sizes from yielding extreme probability estimates.
 * 
 * @param observedRate The raw rate from features (e.g. 1.0 for 1 RTO / 1 Order)
 * @param sampleSize Number of observations (e.g. 1)
 * @param prior The domain prior to regress toward (e.g. 0.20)
 * @param priorWeight The equivalent sample size of the prior (e.g. 5)
 */
export function calculateEffectiveRate(
  observedRate: number,
  sampleSize: number,
  prior: number,
  priorWeight: number
): number {
  return ((observedRate * sampleSize) + (prior * priorWeight)) / (sampleSize + priorWeight);
}

/**
 * Calculates a factor contribution and clamps it between -1 and 1.
 * 
 * @param signal The local signal (0 to 1 typically)
 * @param signalWeight The weight of this signal within the scorer
 * @param scorerWeight The weight of the scorer overall
 * @param totalWeight The total weight (usually 1.0)
 * @param isPositive Boolean: true if it increases risk, false if it decreases risk
 */
export function calculateContribution(
  signal: number,
  signalWeight: number,
  scorerWeight: number,
  totalWeight: number,
  isPositive: boolean = true
): number {
  const magnitude = (signal * signalWeight * scorerWeight) / totalWeight;
  let contribution = isPositive ? magnitude : -magnitude;
  if (contribution > 1) contribution = 1;
  if (contribution < -1) contribution = -1;
  return contribution;
}
