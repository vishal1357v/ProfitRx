import prisma from "../db.server";

export const PLAN_FEATURES = {
  BASIC: [
    "profit_dashboard",
    "health_score",
    "basic_alerts",
    "weekly_whatsapp",
    "product_cost",
    "basic_insights",
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
  ],
  ADVANCE: [
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
  // Legacy aliases
  FREE: [
    "profit_dashboard",
    "health_score",
    "basic_alerts",
    "weekly_whatsapp",
    "product_cost",
    "basic_insights",
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
};

export function normalizePlanName(plan: string): "BASIC" | "PRO" | "ADVANCE" {
  const upper = (plan || "").toUpperCase();
  if (upper === "ADVANCE" || upper === "PRO_ENTERPRISE") return "ADVANCE";
  if (upper === "PRO" || upper === "GROWTH") return "PRO";
  return "BASIC";
}

export function hasFeature(plan: string, feature: string): boolean {
  const normalizedPlan = normalizePlanName(plan);
  return PLAN_FEATURES[normalizedPlan]?.includes(feature) || false;
}

export async function getSubscription(shop: string) {
  let subscription = await prisma.subscription.findUnique({
    where: { shop },
  });

  // If no subscription exists in database, default to BASIC tier ($15/mo)
  if (!subscription) {
    subscription = await prisma.subscription.create({
      data: {
        shop,
        plan: "BASIC",
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
  const normalizedPlan = normalizePlanName(sub.plan);
  return PLAN_FEATURES[normalizedPlan] || [];
}
