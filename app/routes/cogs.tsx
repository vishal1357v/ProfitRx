import { useState, useEffect } from "react";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSubmit } from "react-router";
import {
  Page,
  Layout,
  Card,
  DataTable,
  TextField,
  Button,
  Banner,
  BlockStack,
  InlineStack,
  Divider,
  Grid,
  Text,
  Badge,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ShopifyService } from "../services/shopify.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch products from Shopify
  let products: any[] = [];
  try {
    products = await ShopifyService.getProducts(request);
  } catch (err) {
    console.error("Failed to load products for cogs:", err);
  }

  // 2. Fetch existing COGS from DB
  const cogsRecords = await prisma.productCOGS.findMany({
    where: { shop },
  });

  // 3. Fetch default settings
  let settings = await prisma.storeSettings.findUnique({
    where: { shop },
  });
  if (!settings) {
    settings = await prisma.storeSettings.create({
      data: {
        shop,
        defaultCOGSPct: 40,
        defaultForwardShipping: 60,
        defaultReturnShipping: 70,
        defaultCODHandling: 40,
        defaultPackaging: 10,
        defaultGatewayFeePct: 2,
        rtoDetectionPattern: "rto,returned,undelivered,failed_delivery,rto-initiated,rto_initiated,shipped-rto,shiprocket-rto,delhivery_rto,rto-delhivery,rto-bluedart,return-to-origin,returned-to-sender",
        rtoThreshold: 10,
        marginThreshold: 15,
        alertEmail: (session as any).email || "",
      },
    });
  }

  // 4. Determine last updated timestamp from records
  const latestRecord = await prisma.productCOGS.findFirst({
    where: { shop },
    orderBy: { updatedAt: "desc" },
  });
  const lastUpdated = latestRecord ? latestRecord.updatedAt.toLocaleString() : "Never";

  return {
    products,
    cogs: cogsRecords.map((r: any) => ({ productId: r.productId, cogs: r.cogs })),
    defaultCOGSPct: settings.defaultCOGSPct,
    lastUpdated,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "save_cogs") {
    const cogsDataStr = formData.get("cogsData") as string;
    const cogsData = JSON.parse(cogsDataStr) as Record<string, number>;

    for (const [productId, cogs] of Object.entries(cogsData)) {
      if (typeof cogs !== "number" || cogs < 0) continue;
      const id = `${shop}_${productId}`;
      await prisma.productCOGS.upsert({
        where: { id },
        update: { cogs, updatedAt: new Date() },
        create: { id, shop, productId, cogs, updatedAt: new Date() },
      });
    }
    return Response.json({ success: true });
  }

  if (intent === "update_default_cogs") {
    const defaultCOGSPct = parseFloat(formData.get("defaultCOGSPct") as string) || 40;
    await prisma.storeSettings.upsert({
      where: { shop },
      update: { defaultCOGSPct },
      create: { shop, defaultCOGSPct },
    });
    return Response.json({ success: true });
  }

  return Response.json({ error: "Invalid Intent" }, { status: 400 });
};

type CogsInputProps = {
  productId: string;
  initialValue: string;
  onChange: (value: string) => void;
};

function CogsInput({ productId, initialValue, onChange }: CogsInputProps) {
  const [localValue, setLocalValue] = useState(initialValue);

  useEffect(() => {
    setLocalValue(initialValue);
  }, [initialValue]);

  const handleChange = (val: string) => {
    setLocalValue(val);
    onChange(val);
  };

  return (
    <TextField
      label="COGS"
      labelHidden
      type="number"
      value={localValue}
      onChange={handleChange}
      autoComplete="off"
      prefix="₹"
      placeholder="Enter cost"
    />
  );
}

export default function COGSPage() {
  const { products, cogs, defaultCOGSPct, lastUpdated } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // State
  const [cogsValues, setCogsValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    cogs.forEach((item: any) => {
      initial[item.productId] = item.cogs.toString();
    });
    return initial;
  });

  const [defaultPct, setDefaultPct] = useState(defaultCOGSPct.toString());
  const [searchQuery, setSearchQuery] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);

  const handleCogsChange = (productId: string, value: string) => {
    setCogsValues((current) => ({
      ...current,
      [productId]: value,
    }));
  };

  const handleSaveCosts = () => {
    setError(null);
    setSaved(false);

    // Convert string inputs to floats
    const payload: Record<string, number> = {};
    for (const [productId, val] of Object.entries(cogsValues)) {
      const trimmed = val.trim();
      if (trimmed === "") continue;
      const parsed = parseFloat(trimmed);
      if (!isNaN(parsed) && parsed >= 0) {
        payload[productId] = parsed;
      }
    }

    const fd = new FormData();
    fd.append("intent", "save_cogs");
    fd.append("cogsData", JSON.stringify(payload));
    submit(fd, { method: "POST" });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleDefaultPctSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);

    const parsed = parseFloat(defaultPct);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      setError("Default COGS percentage must be between 0 and 100.");
      return;
    }

    const fd = new FormData();
    fd.append("intent", "update_default_cogs");
    fd.append("defaultCOGSPct", defaultPct);
    submit(fd, { method: "POST" });
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  const handleCSVImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    setCsvMessage(null);
    setError(null);
    const file = event.target.files?.[0];
    if (!file) {
      console.warn("[COGS CSV Import] No file selected.");
      return;
    }

    // Limit size to 5MB max
    if (file.size > 5 * 1024 * 1024) {
      setError("File size exceeds 5MB limit. Please upload a smaller CSV.");
      return;
    }

    console.log(`[COGS CSV Import] Starting parsing for file: ${file.name}, size: ${file.size} bytes`);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) {
        console.error("[COGS CSV Import] File read result was empty.");
        setError("Empty CSV file.");
        return;
      }

      const lines = text.split(/\r?\n/);
      console.log(`[COGS CSV Import] Found ${lines.length} lines in file (including headers and empty rows).`);
      
      const newCogs = { ...cogsValues };
      let updatedCount = 0;
      let skippedCount = 0;

      lines.forEach((line, index) => {
        const trimmedLine = line.trim();
        if (index === 0) {
          console.log(`[COGS CSV Import] Skipping header row (Line 1): "${trimmedLine}"`);
          return;
        }
        if (!trimmedLine) {
          console.log(`[COGS CSV Import] Skipping empty row at line ${index + 1}`);
          return;
        }

        const parts = trimmedLine.split(",");
        console.log(`[COGS CSV Import] Line ${index + 1}: Split into ${parts.length} parts ->`, parts);

        if (parts.length >= 2) {
          const key = parts[0].trim().replace(/"/g, ""); // Product Title or ID
          const val = parts[1].trim().replace(/"/g, "");
          const parsedVal = parseFloat(val);

          if (isNaN(parsedVal)) {
            console.warn(`[COGS CSV Import] Line ${index + 1}: Value "${val}" is not a valid number. Skipping.`);
            skippedCount++;
            return;
          }

          const matchedProduct = products.find(
            (p) => p.id === key || p.title.toLowerCase() === key.toLowerCase()
          );

          if (matchedProduct) {
            const productPrice = parseFloat(matchedProduct.price || "0");
            if (parsedVal < 0) {
              console.warn(`[COGS CSV Import] Line ${index + 1}: Cost cannot be negative. Skipping.`);
              skippedCount++;
              return;
            }
            if (parsedVal > productPrice) {
              console.warn(`[COGS CSV Import] Line ${index + 1}: Cost (₹${parsedVal}) cannot exceed product price (₹${productPrice}). Skipping.`);
              skippedCount++;
              return;
            }

            console.log(`[COGS CSV Import] Line ${index + 1}: Matched product "${matchedProduct.title}" (ID: ${matchedProduct.id}) with cost: ₹${parsedVal}`);
            newCogs[matchedProduct.id] = parsedVal.toString();
            updatedCount++;
          } else {
            console.warn(`[COGS CSV Import] Line ${index + 1}: No matched product in Shopify catalog for key: "${key}". Skipping.`);
            skippedCount++;
          }
        } else {
          console.warn(`[COGS CSV Import] Line ${index + 1}: Expected at least 2 comma-separated columns but found ${parts.length}. Skipping.`);
          skippedCount++;
        }
      });

      console.log(`[COGS CSV Import] Completed parsing. Matches updated: ${updatedCount}, Skipped/Unmatched: ${skippedCount}`);
      setCogsValues(newCogs);
      setCsvMessage(`CSV file parsed successfully! Updated temporary costs for ${updatedCount} products. Click "Save All Costs" to commit to the database.`);
    };
    reader.readAsText(file);
  };

  // Filter products based on search query
  const filteredProducts = products.filter((product) =>
    product.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const rows = filteredProducts.map((product) => [
    product.title,
    `₹${parseFloat(product.price || "0").toLocaleString()}`,
    <CogsInput
      key={product.id}
      productId={product.id}
      initialValue={cogsValues[product.id] ?? ""}
      onChange={(value) => handleCogsChange(product.id, value)}
    />,
  ]);

  return (
    <Page title="Advanced Product Cost Rules (COGS)">
      <Layout>
        {/* Info & Alerts Row */}
        <Layout.Section>
          {saved && (
            <Banner tone="success">
              Product costs configuration updated successfully!
            </Banner>
          )}
          {error && (
            <Banner tone="critical">
              {error}
            </Banner>
          )}
          {csvMessage && (
            <Banner tone="info" onDismiss={() => setCsvMessage(null)}>
              {csvMessage}
            </Banner>
          )}
        </Layout.Section>

        {/* Left Side: Product Search, Filtering, and List */}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <InlineStack align="space-between">
                <BlockStack gap="050">
                  <Text variant="headingMd" as="h2">
                    Product Catalog Cost Sheet ({filteredProducts.length} items)
                  </Text>
                  <Text variant="bodySm" as="p" tone="subdued">
                    💡 Cost rules are set at the product level and apply to all variants of the product.
                  </Text>
                </BlockStack>
                
                {/* Custom Styled Bulk CSV File Upload */}
                <div style={{ display: "inline-block" }}>
                  <label htmlFor="csv-file-picker" style={{ display: "inline-block", padding: "6px 12px", backgroundColor: "var(--gg-surface-2)", border: "1px solid var(--gg-border)", borderRadius: "6px", fontSize: "13px", fontWeight: 500, color: "var(--gg-text-primary)", cursor: "pointer" }}>
                    📥 Bulk Import CSV
                  </label>
                  <input
                    id="csv-file-picker"
                    type="file"
                    accept=".csv"
                    onChange={handleCSVImport}
                    style={{ display: "none" }}
                  />
                </div>
              </InlineStack>

              <TextField
                label="Search catalog products"
                labelHidden
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search products by title..."
                autoComplete="off"
              />

              <DataTable
                columnContentTypes={["text", "text", "text"]}
                headings={["Product Name", "Selling Price (₹)", "Your Cost (COGS)"]}
                rows={rows}
              />

              <Divider />
              
              <InlineStack align="end">
                <Button variant="primary" onClick={handleSaveCosts} loading={isSubmitting}>
                  Save All Costs
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.Section>

        {/* Right Side: Global Default Rule & Log Details */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Global Cost Rule settings */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  Global Default Cost Rule
                </Text>
                <Text variant="bodySm" as="p" tone="subdued">
                  If a product has no specific cost defined, we calculate cost as a flat percentage of the selling price.
                </Text>

                <form onSubmit={handleDefaultPctSave}>
                  <BlockStack gap="200">
                    <TextField
                      label="Default COGS Percentage"
                      type="number"
                      value={defaultPct}
                      onChange={setDefaultPct}
                      suffix="%"
                      autoComplete="off"
                    />
                    <Button submit loading={isSubmitting} variant="secondary" fullWidth>
                      Update Default Rule
                    </Button>
                  </BlockStack>
                </form>
              </BlockStack>
            </Card>

            {/* History Logs */}
            <Card>
              <BlockStack gap="300">
                <Text variant="headingMd" as="h2">
                  COGS Update History
                </Text>
                <BlockStack gap="100">
                  <Text variant="bodyMd" as="p">
                    Last update timestamp:
                  </Text>
                  <Badge tone="attention">
                    {lastUpdated}
                  </Badge>
                </BlockStack>
                <Divider />
                <Text variant="bodySm" as="p" tone="subdued">
                  We calculate historical profits using the COGS setting active at the time of order sync.
                </Text>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}