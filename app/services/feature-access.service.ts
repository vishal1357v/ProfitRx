import prisma from "../db.server";

export const PLAN_FEATURES = {
  FREE: [
    "profit_dashboard",
    "health_score",
    "basic_alerts",
  ],
  STARTER: [
    "profit_dashboard",
    "health_score",
    "basic_alerts",
    "weekly_whatsapp",
    "product_cost",
    "basic_insights",
  ],
  GROWTH: [
    "profit_dashboard",
    "health_score",
    "basic_alerts",
    "weekly_whatsapp",
    "product_cost",
    "basic_insights",
    "cod_risk",
    "high_risk_areas",
    "ai_recommendations",
    "advanced_alerts",
    "priority_support",
  ],
  PRO: [
    "profit_dashboard",
    "health_score",
    "basic_alerts",
    "weekly_whatsapp",
    "product_cost",
    "basic_insights",
    "cod_risk",
    "high_risk_areas",
    "ai_recommendations",
    "advanced_alerts",
    "priority_support",
    "ltv_cohort",
    "roas_adspend",
    "multistore_support",
    "beta_features",
    "onboarding",
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

  // If no subscription exists in database, default to FREE tier
  if (!subscription) {
    subscription = await prisma.subscription.create({
      data: {
        shop,
        plan: "FREE",
        status: "ACTIVE",
        orderLimit: 50,
        ordersUsed: 0,
      },
    });
  }

  return subscription;
}

export async function canAccessFeature(shop: string, feature: string): Promise<boolean> {
  if (process.env.BYPASS_BILLING === "true") {
    return true;
  }
  const sub = await getSubscription(shop);
  if (!sub || sub.status !== "ACTIVE") {
    return false;
  }
  return hasFeature(sub.plan, feature);
}

export async function getFeatureList(shop: string): Promise<string[]> {
  if (process.env.BYPASS_BILLING === "true") {
    return PLAN_FEATURES.PRO;
  }
  const sub = await getSubscription(shop);
  if (!sub || sub.status !== "ACTIVE") {
    return [];
  }
  const normalizedPlan = sub.plan.toUpperCase() as keyof typeof PLAN_FEATURES;
  return PLAN_FEATURES[normalizedPlan] || [];
}
