import prisma from "../db.server";

export const PLAN_FEATURES = {
  FREE: [
    "profit_dashboard",
    "health_score",
  ],
  STARTER: [
    "profit_dashboard",
    "health_score",
    "basic_rto",
    "basic_alerts",
    "weekly_whatsapp",
    "product_cost",
    "basic_insights",
  ],
  GROWTH: [
    "profit_dashboard",
    "health_score",
    "basic_rto",
    "basic_alerts",
    "weekly_whatsapp",
    "product_cost",
    "basic_insights",
    "ai_attribution",
    "rto_heatmap",
    "cod_risk",
    "high_risk_areas",
    "ai_recommendations",
    "advanced_alerts",
  ],
  PRO: [
    "profit_dashboard",
    "health_score",
    "basic_rto",
    "basic_alerts",
    "weekly_whatsapp",
    "product_cost",
    "basic_insights",
    "ai_attribution",
    "rto_heatmap",
    "cod_risk",
    "high_risk_areas",
    "ai_recommendations",
    "advanced_alerts",
    "ltv_cohort",
    "blended_roas",
    "roas_adspend",
    "priority_support",
    "multistore_support",
    "beta_features",
    "onboarding",
  ],
  // Legacy aliases
  BASIC: [
    "profit_dashboard",
    "health_score",
    "basic_rto",
    "basic_alerts",
    "weekly_whatsapp",
    "product_cost",
    "basic_insights",
  ],
  ADVANCE: [
    "profit_dashboard",
    "health_score",
    "basic_rto",
    "basic_alerts",
    "weekly_whatsapp",
    "product_cost",
    "basic_insights",
    "ai_attribution",
    "rto_heatmap",
    "cod_risk",
    "high_risk_areas",
    "ai_recommendations",
    "advanced_alerts",
    "ltv_cohort",
    "blended_roas",
    "roas_adspend",
    "priority_support",
    "multistore_support",
    "beta_features",
    "onboarding",
  ],
};

export function normalizePlanName(plan: string): "FREE" | "STARTER" | "GROWTH" | "PRO" {
  const upper = (plan || "").toUpperCase().trim();
  if (upper === "PRO" || upper === "ADVANCE" || upper === "PRO_ENTERPRISE") return "PRO";
  if (upper === "GROWTH") return "GROWTH";
  if (upper === "STARTER" || upper === "BASIC") return "STARTER";
  return "FREE";
}

export function hasFeature(plan: string, feature: string): boolean {
  const normalizedPlan = normalizePlanName(plan);
  return PLAN_FEATURES[normalizedPlan]?.includes(feature) || false;
}

export async function getSubscription(shop: string) {
  let subscription = await prisma.subscription.findUnique({
    where: { shop },
  });

  // If no subscription exists in database, default to FREE tier (50 orders limit)
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
  const sub = await getSubscription(shop);
  if (!sub || (sub.status !== "ACTIVE" && sub.status !== "TRIALING")) {
    return false;
  }
  return hasFeature(sub.plan, feature);
}

export async function getFeatureList(shop: string): Promise<string[]> {
  const sub = await getSubscription(shop);
  if (!sub || (sub.status !== "ACTIVE" && sub.status !== "TRIALING")) {
    return [];
  }
  const normalizedPlan = normalizePlanName(sub.plan);
  return PLAN_FEATURES[normalizedPlan] || [];
}
