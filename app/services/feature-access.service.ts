import prisma from "../db.server";

export const PLAN_FEATURES: Record<string, string[]> = {
  FREE: [
    "profit_dashboard",
    "health_score",
  ],
  STARTER: [
    "profit_dashboard",
    "health_score",
    "product_cost",
    "basic_rto",
    "basic_alerts",
    "weekly_whatsapp",
    "basic_insights",
    "gst_reports",
    "order_analytics",
    "export_csv",
  ],
  GROWTH: [
    "profit_dashboard",
    "health_score",
    "product_cost",
    "basic_rto",
    "basic_alerts",
    "weekly_whatsapp",
    "basic_insights",
    "gst_reports",
    "order_analytics",
    "export_csv",
    "cod_risk",
    "high_risk_areas",
    "rto_heatmap",
    "profit_leaks",
    "advanced_alerts",
    "ai_recommendations",
    "cod_shield",
  ],
  PRO: [
    "profit_dashboard",
    "health_score",
    "product_cost",
    "basic_rto",
    "basic_alerts",
    "weekly_whatsapp",
    "basic_insights",
    "gst_reports",
    "order_analytics",
    "export_csv",
    "cod_risk",
    "high_risk_areas",
    "rto_heatmap",
    "profit_leaks",
    "advanced_alerts",
    "ai_recommendations",
    "cod_shield",
    "ltv_cohort",
    "blended_roas",
    "roas_adspend",
    "customer_analytics",
    "priority_support",
    "multistore_support",
    "beta_features",
    "onboarding",
    "api_access",
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

/**
 * Derive features directly from a plan name without a DB read.
 * Use this when you already have the plan from a synced subscription object.
 */
export function getFeaturesForPlan(plan: string): string[] {
  const normalizedPlan = normalizePlanName(plan);
  return PLAN_FEATURES[normalizedPlan] || [];
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
