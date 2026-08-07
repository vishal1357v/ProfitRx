const fs = require('fs');

const routePath = 'app/routes/dashboard.tsx';
let content = fs.readFileSync(routePath, 'utf8');

const loaderStart = content.indexOf('export const loader = async ({ request }: LoaderFunctionArgs) => {');
const countUpStart = content.indexOf('// ── Count-up hook ─────────────────────────────────────────');

if (loaderStart === -1 || countUpStart === -1) {
    console.error('Could not find loader boundaries.');
    process.exit(1);
}

// Find the last closing brace before countUpStart
const loaderEnd = content.lastIndexOf('};', countUpStart) + 2;

const originalLoaderBlock = content.substring(loaderStart, loaderEnd);

const thinLoader = `export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { DashboardApplicationService } = await import("../application/dashboard/dashboard.application");
  return DashboardApplicationService.getDashboardData(request);
};`;

const newContent = content.substring(0, loaderStart) + thinLoader + '\n\n' + content.substring(countUpStart);

fs.writeFileSync(routePath, newContent, 'utf8');
console.log('Successfully replaced loader in dashboard.tsx');

// Now create the new DashboardApplicationService with the old logic
const servicePath = 'app/application/dashboard/dashboard.application.ts';

const serviceContent = `import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import prisma from "../../db.server";
import { ProfitService } from "../../services/profit.service";
import { ShopifyService } from "../../services/shopify.service";
import { ProfitIntelligenceService } from "../../services/profit-intelligence.service";
import { normalizePlanName, PLAN_FEATURES } from "../../services/feature-access.service";
import { syncSubscriptionWithShopify } from "../../services/subscription-sync.service";
import { AdSpendService } from "../../services/ad-spend.service";

const isCodGateway = (gateway: string | null) => {
  if (!gateway) return false;
  const lower = gateway.toLowerCase();
  return lower.includes("cod") || lower.includes("cash") || lower.includes("manual");
};

export class DashboardApplicationService {
  /**
   * Extracted from legacy route.
   * This handles the complex data aggregation for the dashboard UI.
   */
  static async getDashboardData(request: Request) {
    ${originalLoaderBlock.replace('export const loader = async ({ request }: LoaderFunctionArgs) => {', '').slice(0, -2)}
  }
}
`;

fs.writeFileSync(servicePath, serviceContent, 'utf8');
console.log('Successfully created DashboardApplicationService');
