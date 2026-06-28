import prisma from "../db.server";

export const PLAN_FEATURES = {
  STARTER: [
    "profit_dashboard",
    "health_score",
    "basic_rto",
  ],
  GROWTH: [
    "profit_dashboard",
    "health_score",
    "basic_rto",
    "ai_attribution",
    "rto_heatmap",
    "cod_risk_score",
  ],
  PRO: [
    "profit_dashboard",
    "health_score",
    "basic_rto",
    "ai_attribution",
    "rto_heatmap",
    "cod_risk_score",
    "ltv_cohort",
    "blended_roas",
    "priority_support",
    "beta_access",
  ],
};

export function hasFeature(plan: string, feature: string): boolean {
  const normalizedPlan = plan.toUpperCase() as keyof typeof PLAN_FEATURES;
  return PLAN_FEATURES[normalizedPlan]?.includes(feature) || false;
}

export async function getSubscription(shop: string) {
  let subscription = await prisma.subscription.findUnique({
    where: { shop },
  });

  // If no subscription exists in database, default to STARTER for demo/first run
  if (!subscription) {
    subscription = await prisma.subscription.create({
      data: {
        shop,
        plan: "STARTER",
        status: "ACTIVE",
        orderLimit: 500,
        ordersUsed: 0,
      },
    });
  }

  return subscription;
}

export async function canAccessFeature(shop: string, feature: string): Promise<boolean> {
  const sub = await getSubscription(shop);
  if (!sub || sub.status !== "ACTIVE") {
    return false;
  }
  return hasFeature(sub.plan, feature);
}

export async function getFeatureList(shop: string): Promise<string[]> {
  const sub = await getSubscription(shop);
  if (!sub || sub.status !== "ACTIVE") {
    return [];
  }
  const normalizedPlan = sub.plan.toUpperCase() as keyof typeof PLAN_FEATURES;
  return PLAN_FEATURES[normalizedPlan] || [];
}
