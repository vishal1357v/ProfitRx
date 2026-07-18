import { useState, useEffect } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useNavigation, useSubmit } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
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
  Box,
  Select,
  Icon,
  Pagination,
} from "@shopify/polaris";
import {
  SearchIcon,
  ImportIcon,
  RefreshIcon,
  ProductIcon,
} from "@shopify/polaris-icons";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ShopifyService } from "../services/shopify.service";
import { resolveEffectiveCOGS } from "../utils/cogs";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const shop = session.shop;

  // 1. Fetch products from Shopify
  let products: any[] = [];
  try {
    products = await ShopifyService.getProducts(admin);
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
  const lastUpdated = latestRecord?.lastSyncedAt
    ? latestRecord.lastSyncedAt.toLocaleString()
    : latestRecord
    ? latestRecord.updatedAt.toLocaleString()
    : "Never";

  return {
    products,
    cogsRecords: cogsRecords.map((r: any) => {
      const cost = resolveEffectiveCOGS(r, r.shopifyNative);
      return {
        productId: r.productId,
        cost,
        shopifyNative: r.shopifyNative,
        manualOverride: r.manualOverride,
        source: r.source || (r.manualOverride ? "manual_override" : "shopify_native"),
        lastSyncedAt: r.lastSyncedAt ? new Date(r.lastSyncedAt).toLocaleString() : null,
      };
    }),
    defaultCOGSPct: settings.defaultCOGSPct,
    lastUpdated,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "sync_native_cogs") {
    const result = await ShopifyService.syncNativeCOGS(request);
    return Response.json({ success: true, ...result });
  }

  if (intent === "refresh_historical_cogs") {
    const result = await ShopifyService.refreshHistoricalCOGS(shop);
    return Response.json({ success: true, ...result });
  }

  if (intent === "save_cogs") {
    const cogsDataStr = formData.get("cogsData") as string;
    const cogsData = JSON.parse(cogsDataStr) as Record<string, number>;

    for (const [productId, cogs] of Object.entries(cogsData)) {
      if (typeof cogs !== "number" || cogs < 0) continue;
      const id = `${shop}_${productId}`;
      await prisma.productCOGS.upsert({
        where: { shop_productId: { shop, productId } },
        update: {
          cost: cogs,
          manualOverride: cogs,
          source: "manual_override",
          cogs,
          updatedAt: new Date(),
        },
        create: {
          id,
          shop,
          productId,
          cost: cogs,
          manualOverride: cogs,
          source: "manual_override",
          cogs,
          updatedAt: new Date(),
        },
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
  const { products, cogsRecords, defaultCOGSPct, lastUpdated } = useLoaderData<typeof loader>();
  const submit = useSubmit();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  // Map cogsRecords by productId
  const cogsRecordMap = new Map<string, any>();
  cogsRecords.forEach((r: any) => cogsRecordMap.set(r.productId, r));

  // State
  const [cogsValues, setCogsValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    cogsRecords.forEach((item: any) => {
      if (item.manualOverride != null) {
        initial[item.productId] = item.manualOverride.toString();
      } else if (item.cost != null) {
        initial[item.productId] = item.cost.toString();
      }
    });
    return initial;
  });

  const [defaultPct, setDefaultPct] = useState(defaultCOGSPct.toString());
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setCurrentPage(1);
  };

  const handleSourceFilterChange = (val: string) => {
    setSourceFilter(val);
    setCurrentPage(1);
  };

  const [bulkCost, setBulkCost] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvMessage, setCsvMessage] = useState<string | null>(null);

  const handleCogsChange = (productId: string, value: string) => {
    setCogsValues((current) => ({
      ...current,
      [productId]: value,
    }));
  };

  const handleSyncNativeCosts = () => {
    setError(null);
    const fd = new FormData();
    fd.append("intent", "sync_native_cogs");
    submit(fd, { method: "POST" });
  };

  const handleRecalculateHistorical = () => {
    setError(null);
    setCsvMessage(null);
    if (!confirm("Are you sure you want to recalculate historical order COGS? This will overwrite the frozen costs on all past orders with your current product cost settings. This cannot be undone.")) return;
    const fd = new FormData();
    fd.append("intent", "refresh_historical_cogs");
    submit(fd, { method: "POST" });
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
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError("File size exceeds 5MB limit.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      if (!text) return;

      const lines = text.split(/\r?\n/);
      const newCogs = { ...cogsValues };
      let updatedCount = 0;

      lines.forEach((line, index) => {
        if (index === 0 || !line.trim()) return;
        const parts = line.trim().split(",");
        if (parts.length >= 2) {
          const key = parts[0].trim().replace(/"/g, "");
          const val = parts[1].trim().replace(/"/g, "");
          const parsedVal = parseFloat(val);
          if (isNaN(parsedVal)) return;

          const matchedProduct = products.find(
            (p: any) => p.id === key || p.title.toLowerCase() === key.toLowerCase()
          );
          if (matchedProduct && parsedVal >= 0) {
            newCogs[matchedProduct.id] = parsedVal.toString();
            updatedCount++;
          }
        }
      });

      setCogsValues(newCogs);
      setCsvMessage(`CSV parsed successfully! Updated temporary costs for ${updatedCount} products. Click "Save All Costs" to commit.`);
    };
    reader.readAsText(file);
  };

  const handleBulkApply = () => {
    if (!bulkCost || isNaN(parseFloat(bulkCost)) || parseFloat(bulkCost) < 0) {
      setError("Please enter a valid positive number for bulk override.");
      return;
    }
    setError(null);
    const newCogs = { ...cogsValues };
    filteredProducts.forEach((p) => {
      newCogs[p.id] = bulkCost;
    });
    setCogsValues(newCogs);
    setBulkCost("");
    setCsvMessage(`Applied override of ₹${bulkCost} to ${filteredProducts.length} filtered items. Click "Save All Costs" to commit.`);
  };

  // Filter products based on search query and source filter
  const filteredProducts = products.filter((product: any) => {
    const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase());
    if (!matchesSearch) return false;

    if (sourceFilter === "all") return true;

    const record = cogsRecordMap.get(product.id);
    const nativeCost = product.shopifyNativeCost ?? record?.shopifyNative;
    const isNativeSource = record?.source === "shopify_native" || (!record?.manualOverride && nativeCost != null);

    if (sourceFilter === "native") return isNativeSource;
    if (sourceFilter === "manual") return !isNativeSource;

    return true;
  });

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage) || 1;
  const paginatedProducts = filteredProducts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  const rows = paginatedProducts.map((product: any) => {
    const record = cogsRecordMap.get(product.id);
    const nativeCost = product.shopifyNativeCost ?? record?.shopifyNative;
    const isNativeSource = record?.source === "shopify_native" || (!record?.manualOverride && nativeCost != null);

    return [
      product.title,
      `₹${parseFloat(product.price || "0").toLocaleString()}`,
      nativeCost != null ? `₹${parseFloat(nativeCost).toLocaleString()}` : "Not set in Shopify",
      <CogsInput
        key={product.id}
        productId={product.id}
        initialValue={cogsValues[product.id] ?? ""}
        onChange={(value) => handleCogsChange(product.id, value)}
      />,
      <Badge key={`badge-${product.id}`} tone={isNativeSource ? "success" : "info"}>
        {isNativeSource ? "Shopify Native" : "Manual Override"}
      </Badge>,
    ];
  });

  return (
    <Page title="Automated Product Cost (COGS) Management">
      <Layout>
        {/* Banner for Auto-Sync */}
        <Layout.Section>
          <Banner tone="info" title="Automatic Cost Sync Active">
            <p>
              🔄 <strong>We automatically pull your product costs from Shopify. No manual entry needed.</strong> If you update item cost in Shopify Admin, ProfitRx syncs it automatically.
            </p>
          </Banner>
        </Layout.Section>

        {/* Info & Alerts Row */}
        <Layout.Section>
          {saved && (
            <Banner tone="success">
              Product costs configuration updated successfully!
            </Banner>
          )}
          {error && (
            <Banner tone="critical" onDismiss={() => setError(null)}>
              {error}
            </Banner>
          )}
          {csvMessage && (
            <Banner tone="info" onDismiss={() => setCsvMessage(null)}>
              {csvMessage}
            </Banner>
          )}
        </Layout.Section>

        {/* Product Catalog Sheet */}
        <Layout.Section>
          <Card>
            <Box padding="500">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="center">
                  <BlockStack gap="050">
                    <Text variant="headingMd" as="h2">
                      Product Catalog Cost Sheet (Showing {filteredProducts.length > 0 ? (currentPage - 1) * itemsPerPage + 1 : 0}-{Math.min(currentPage * itemsPerPage, filteredProducts.length)} of {filteredProducts.length} items)
                    </Text>
                    <Text variant="bodySm" as="p" tone="subdued">
                      💡 Last synced: <strong>{lastUpdated}</strong>
                    </Text>
                  </BlockStack>

                  <InlineStack gap="200" blockAlign="center">
                    <Button variant="secondary" onClick={handleSyncNativeCosts} loading={isSubmitting} icon={RefreshIcon}>
                      Sync Costs Now
                    </Button>

                    <Button variant="secondary" onClick={handleRecalculateHistorical} loading={isSubmitting} icon={RefreshIcon}>
                      Recalculate Historical Profits
                    </Button>

                    <div style={{ display: "inline-block" }}>
                      <label
                        htmlFor="csv-file-picker"
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "6px 12px",
                          backgroundColor: "var(--gg-surface-2)",
                          border: "1px solid var(--gg-border)",
                          borderRadius: "6px",
                          fontSize: "13px",
                          fontWeight: 500,
                          color: "var(--gg-text-primary)",
                          cursor: "pointer",
                        }}
                      >
                        <Icon source={ImportIcon} />
                        Bulk Import CSV
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
                </InlineStack>

                <Grid columns={{ xs: 1, sm: 1, md: 3, lg: 3 }}>
                  <Grid.Cell columnSpan={{ xs: 1, sm: 1, md: 1, lg: 1 }}>
                    <TextField
                      label="Search catalog products"
                      labelHidden
                      value={searchQuery}
                      onChange={handleSearchChange}
                      placeholder="Search products by title..."
                      autoComplete="off"
                      prefix={<Icon source={SearchIcon} />}
                    />
                  </Grid.Cell>
                  <Grid.Cell>
                    <Select
                      label="Filter by cost source"
                      labelHidden
                      options={[
                        { label: "All Sources", value: "all" },
                        { label: "Shopify Native Only", value: "native" },
                        { label: "Manual Overrides Only", value: "manual" },
                      ]}
                      value={sourceFilter}
                      onChange={handleSourceFilterChange}
                    />
                  </Grid.Cell>
                  <Grid.Cell>
                    <InlineStack gap="150">
                      <div style={{ flex: 1 }}>
                        <TextField
                          label="Bulk Override Price"
                          labelHidden
                          type="number"
                          value={bulkCost}
                          onChange={setBulkCost}
                          placeholder="Bulk Cost (₹)"
                          autoComplete="off"
                        />
                      </div>
                      <Button onClick={handleBulkApply} variant="secondary">
                        {`Apply to ${filteredProducts.length} Items`}
                      </Button>
                    </InlineStack>
                  </Grid.Cell>
                </Grid>

                <div className="gg-desktop-only">
                  <DataTable
                    columnContentTypes={["text", "text", "text", "text", "text"]}
                    headings={["Product Name", "Selling Price (₹)", "Shopify Native Cost", "Manual Override (₹)", "Source"]}
                    rows={rows}
                  />
                </div>

                <div className="gg-mobile-only">
                  <BlockStack gap="300">
                    {paginatedProducts.map((product: any) => {
                      const record = cogsRecordMap.get(product.id);
                      const nativeCost = product.shopifyNativeCost ?? record?.shopifyNative;
                      const isNativeSource = record?.source === "shopify_native" || (!record?.manualOverride && nativeCost != null);

                      return (
                        <Card key={product.id}>
                          <Box padding="300">
                            <BlockStack gap="200">
                              <InlineStack align="space-between" blockAlign="center">
                                <Text variant="bodyMd" as="p" fontWeight="bold">
                                  {product.title}
                                </Text>
                                <Badge tone={isNativeSource ? "success" : "info"}>
                                  {isNativeSource ? "Shopify Native" : "Manual Override"}
                                </Badge>
                              </InlineStack>

                              <Divider />

                              <Grid columns={{ xs: 2, sm: 2 }}>
                                <Grid.Cell>
                                  <Text variant="bodySm" as="p" tone="subdued">Selling Price</Text>
                                  <Text variant="bodyMd" as="p" fontWeight="bold">₹{parseFloat(product.price || "0").toLocaleString()}</Text>
                                </Grid.Cell>
                                <Grid.Cell>
                                  <Text variant="bodySm" as="p" tone="subdued">Native Cost</Text>
                                  <Text variant="bodyMd" as="p">
                                    {nativeCost != null ? `₹${parseFloat(nativeCost).toLocaleString()}` : "—"}
                                  </Text>
                                </Grid.Cell>
                              </Grid>

                              <div style={{ marginTop: "4px" }}>
                                <CogsInput
                                  productId={product.id}
                                  initialValue={cogsValues[product.id] ?? ""}
                                  onChange={(value) => handleCogsChange(product.id, value)}
                                />
                              </div>
                            </BlockStack>
                          </Box>
                        </Card>
                      );
                    })}
                  </BlockStack>
                </div>

                <Box paddingBlock="200">
                  <InlineStack align="center" gap="400">
                    <Pagination
                      hasPrevious={currentPage > 1}
                      onPrevious={() => setCurrentPage(p => p - 1)}
                      hasNext={currentPage < totalPages}
                      onNext={() => setCurrentPage(p => p + 1)}
                      label={`Page ${currentPage} of ${totalPages}`}
                    />
                  </InlineStack>
                </Box>

                <Divider />

                <InlineStack align="end">
                  <div className="gg-mobile-full-width-btn">
                    <Button variant="primary" onClick={handleSaveCosts} loading={isSubmitting}>
                      Save All Costs
                    </Button>
                  </div>
                </InlineStack>
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>

        {/* Right Side: Global Default Rule & Log Details */}
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            {/* Global Cost Rule settings */}
            <Card>
              <Box padding="500">
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
              </Box>
            </Card>

            {/* History Logs */}
            <Card>
              <Box padding="500">
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
              </Box>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}