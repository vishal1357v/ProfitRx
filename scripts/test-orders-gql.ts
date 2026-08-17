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

async function testGetOrdersGql() {
  const connStr = process.env.DATABASE_URL || 'postgresql://user:pass@localhost:5432/neondb?sslmode=require';
  const hostMatch = connStr.match(/@([^/:]+)/);
  const host = hostMatch ? hostMatch[1] : 'localhost';

  const sessionRes = await fetch(`https://${host}/sql`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Neon-Connection-String': connStr },
    body: JSON.stringify({ query: 'SELECT id, shop, "accessToken", scope FROM sessions WHERE id LIKE \'offline_%\' LIMIT 1;' })
  });
  const sessionData = await sessionRes.json();
  const sessionRecord = sessionData.rows ? sessionData.rows[0] : sessionData[0];
  const shop = sessionRecord.shop;
  const token = decryptToken(sessionRecord.accessToken);

  const graphQlQuery = `
    query GetOrders($limit: Int!, $query: String, $cursor: String) {
      orders(first: $limit, query: $query, after: $cursor, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            totalPriceSet { presentmentMoney { amount } }
            subtotalPriceSet { presentmentMoney { amount } }
            totalTaxSet { presentmentMoney { amount } }
            totalDiscountsSet { presentmentMoney { amount } }
            shippingLines(first: 1) {
              edges { node { originalPriceSet { presentmentMoney { amount } } } }
            }
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            paymentGatewayNames
            tags
            fulfillments(first: 5) {
              status
              events(first: 10) {
                edges {
                  node {
                    status
                    message
                  }
                }
              }
            }
            customerJourneySummary {
              lastVisit {
                landingPage
                referrerUrl
              }
            }
            shippingAddress {
              zip
              city
              province
            }
            customer {
              id
              displayName
            }
            lineItems(first: 250) {
              edges {
                node {
                  id
                  title
                  product {
                    id
                  }
                  quantity
                  discountedTotalSet { presentmentMoney { amount } }
                }
              }
              pageInfo {
                hasNextPage
                endCursor
              }
            }
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  `;

  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  const dateStr = sixtyDaysAgo.toISOString().split("T")[0];
  const query = `status:any updated_at:>=${dateStr}`;

  const res = await fetch(`https://${shop}/admin/api/2026-04/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token! },
    body: JSON.stringify({ query: graphQlQuery, variables: { limit: 10, query } })
  });
  const data = await res.json();
  console.log("GraphQL Response:", JSON.stringify(data, null, 2));
}

testGetOrdersGql().catch(console.error);
