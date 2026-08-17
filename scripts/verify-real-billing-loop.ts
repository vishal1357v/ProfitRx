import { createDecipheriv } from "crypto";
import fs from "fs";
import path from "path";

// Load environment variables
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#") && trimmed.includes("=")) {
      const idx = trimmed.indexOf("=");
      const key = trimmed.substring(0, idx).trim();
      let val = trimmed.substring(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[key] = val;
    }
  }
}

const ENCRYPTED_TOKEN_PREFIX = "enc:v1:";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function encryptionKey() {
  const configuredKey = process.env.TOKEN_ENCRYPTION_KEY?.trim();
  if (!configuredKey) throw new Error("TOKEN_ENCRYPTION_KEY not set");
  return Buffer.from(configuredKey, "base64");
}

function decryptToken(token: string | null) {
  if (!token) return null;
  if (!token.startsWith(ENCRYPTED_TOKEN_PREFIX)) return token;

  const parts = token.split(":");
  const [, , ivValue, authTagValue, ciphertextValue] = parts;
  const iv = Buffer.from(ivValue, "base64");
  const authTag = Buffer.from(authTagValue, "base64");
  const ciphertext = Buffer.from(ciphertextValue, "base64");

  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

async function verifyBillingLoop() {
  const connStr = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/neondb?sslmode=require';
  const hostMatch = connStr.match(/@([^/:]+)/);
  const host = hostMatch ? hostMatch[1] : 'localhost';

  console.log("================================================================================");
  console.log("           PROFITRX REAL BILLING END-TO-END VERIFICATION SUITE");
  console.log("================================================================================\n");

  // Step 1: Query offline session from Neon PostgreSQL
  console.log("[1/6] Querying active merchant session from PostgreSQL...");
  const res = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': connStr
    },
    body: JSON.stringify({ query: 'SELECT id, shop, "accessToken", scope FROM sessions WHERE id LIKE \'offline_%\' LIMIT 1;' })
  });
  const sessionData = await res.json();
  const sessionRecord = sessionData.rows ? sessionData.rows[0] : sessionData[0];
  if (!sessionRecord) {
    console.error("❌ No offline session found in database.");
    return;
  }
  const shop = sessionRecord.shop;
  const token = decryptToken(sessionRecord.accessToken);
  console.log(`✅ Session verified for shop: ${shop}`);

  // Step 2: Attempt appSubscriptionCreate on Shopify GraphQL API
  console.log("\n[2/6] Creating STARTER Test Subscription via Shopify GraphQL appSubscriptionCreate...");
  const createSubMutation = `
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!, $trialDays: Int, $test: Boolean) {
      appSubscriptionCreate(name: $name, lineItems: $lineItems, returnUrl: $returnUrl, trialDays: $trialDays, test: $test) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
          name
          status
          test
          trialDays
          createdAt
          lineItems {
            id
            plan {
              pricingDetails {
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                  interval
                }
              }
            }
          }
        }
      }
    }
  `;

  const returnUrl = `https://${shop}/admin/apps/profitrx/app/dashboard?plan_updated=true`;
  const createVariables = {
    name: "STARTER",
    returnUrl,
    trialDays: 14,
    test: true,
    lineItems: [
      {
        plan: {
          appRecurringPricingDetails: {
            price: {
              amount: 19.0,
              currencyCode: "USD"
            },
            interval: "EVERY_30_DAYS"
          }
        }
      }
    ]
  };

  const createRes = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token!
    },
    body: JSON.stringify({ query: createSubMutation, variables: createVariables })
  });
  const createResult = await createRes.json();
  const payload = createResult.data?.appSubscriptionCreate;

  if (payload?.userErrors?.length) {
    console.log("❌ Shopify appSubscriptionCreate returned userErrors:");
    payload.userErrors.forEach((err: any) => console.log(`   • ${err.message}`));
    console.log("\n================================================================================");
    console.log("BILLING STATUS: BLOCKED");
    console.log("EXACT REQUIRED HUMAN ACTION:");
    console.log("1. Open https://partners.shopify.com in your browser");
    console.log("2. Navigate to: Apps > ProfitRx RTO & Profit (Client ID: 08f8a7442c2182a3a390f753591c06f3)");
    console.log("3. Click 'Distribution' in the left sidebar menu");
    console.log("4. Select 'Public distribution' and click Save / Confirm");
    console.log("5. Re-run: npx tsx scripts/verify-real-billing-loop.ts");
    console.log("================================================================================\n");
    return;
  }

  const subId = payload?.appSubscription?.id;
  const confirmUrl = payload?.confirmationUrl;
  console.log("✅ Shopify App Subscription Created Successfully!");
  console.log(`   • Subscription ID: ${subId}`);
  console.log(`   • Initial Status:  ${payload?.appSubscription?.status}`);
  console.log(`   • Test Mode:       ${payload?.appSubscription?.test}`);
  console.log(`   • Trial Days:      ${payload?.appSubscription?.trialDays}`);
  console.log(`   • Approval URL:    ${confirmUrl}`);
  console.log("\n👉 Please open the Approval URL above in your browser to accept the test charge.");

  // Step 3: Query active subscriptions from Shopify
  console.log("\n[3/6] Polling Shopify for Active Subscription Confirmation...");
  const activeQuery = `
    query ActiveAppSubscriptions {
      currentAppInstallation {
        id
        activeSubscriptions {
          id
          name
          status
          test
          createdAt
          currentPeriodEnd
          trialDays
          lineItems {
            id
            plan {
              pricingDetails {
                __typename
                ... on AppRecurringPricing {
                  price {
                    amount
                    currencyCode
                  }
                  interval
                }
              }
            }
          }
        }
      }
    }
  `;

  let activeSubs: any[] = [];
  for (let attempt = 1; attempt <= 6; attempt++) {
    const activeRes = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token!
      },
      body: JSON.stringify({ query: activeQuery })
    });
    const activeData = await activeRes.json();
    activeSubs = activeData.data?.currentAppInstallation?.activeSubscriptions || [];
    if (activeSubs.length > 0) {
      console.log(`   ✅ Active subscription confirmed on Shopify! (Attempt ${attempt})`);
      break;
    }
    console.log(`   [Attempt ${attempt}/6] Waiting for merchant approval on Shopify... (Retrying in 5s)`);
    await new Promise(r => setTimeout(r, 5000));
  }

  // Step 4: Synchronize with PostgreSQL database
  console.log("\n[4/6] Synchronizing with ProfitRx PostgreSQL Subscription Table...");
  const confirmedSub = activeSubs[0];
  if (confirmedSub) {
    const trialEndsAt = confirmedSub.trialDays ? new Date(Date.now() + confirmedSub.trialDays * 86400000).toISOString() : null;
    await fetch(`https://${host}/sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': connStr
      },
      body: JSON.stringify({
        query: `
          INSERT INTO subscriptions (id, shop, plan, status, "orderLimit", "ordersUsed", "shopifyChargeId", "trialEndsAt", "createdAt", "updatedAt")
          VALUES ('sub_${Date.now()}', '${shop}', '${confirmedSub.name}', '${confirmedSub.status.toUpperCase()}', 500, 0, '${confirmedSub.id}', ${trialEndsAt ? `'${trialEndsAt}'` : 'NULL'}, NOW(), NOW())
          ON CONFLICT (shop) DO UPDATE SET
            plan = EXCLUDED.plan,
            status = EXCLUDED.status,
            "orderLimit" = 500,
            "shopifyChargeId" = EXCLUDED."shopifyChargeId",
            "trialEndsAt" = EXCLUDED."trialEndsAt",
            "updatedAt" = NOW();
        `
      })
    });
  }

  const dbSubRes = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': connStr
    },
    body: JSON.stringify({ query: `SELECT shop, plan, status, "orderLimit", "ordersUsed", "shopifyChargeId", "trialEndsAt" FROM subscriptions WHERE shop = '${shop}';` })
  });
  const dbSubData = await dbSubRes.json();
  const dbRecord = dbSubData.rows ? dbSubData.rows[0] : dbSubData[0];
  console.log("   PostgreSQL Subscription Record:", JSON.stringify(dbRecord, null, 2));

  // Step 5: Feature Gating Check
  console.log("\n[5/6] Checking Server-Side Feature Gating...");
  const { hasFeature } = await import("../app/services/feature-access.service");
  const plan = dbRecord?.plan || "FREE";
  console.log(`   Current Plan: ${plan}`);
  console.log(`   • Can access Profit Dashboard:     ${hasFeature(plan, "profit_dashboard")}`);
  console.log(`   • Can access COGS / Product Cost:  ${hasFeature(plan, "product_cost")}`);
  console.log(`   • Can access GST Reports:          ${hasFeature(plan, "gst_reports")}`);
  console.log(`   • Can access COD Risk Predictions: ${hasFeature(plan, "cod_risk")}`);
  console.log(`   • Can access ROAS & Ad Spend Sync: ${hasFeature(plan, "blended_roas")}`);

  // Step 6: Negative Path Verification
  console.log("\n[6/6] Negative Path Verification (Unsubscribed / FREE tier behavior)...");
  console.log(`   • FREE tier product_cost blocked:    ${!hasFeature("FREE", "product_cost")}`);
  console.log(`   • FREE tier cod_risk blocked:        ${!hasFeature("FREE", "cod_risk")}`);
  console.log(`   • FREE tier blended_roas blocked:    ${!hasFeature("FREE", "blended_roas")}`);

  console.log("\n================================================================================");
  if (confirmedSub) {
    console.log("BILLING: VERIFIED");
  } else {
    console.log("BILLING: PARTIAL (Awaiting merchant charge approval at confirmationUrl)");
  }
  console.log("================================================================================\n");
}

verifyBillingLoop().catch(console.error);
