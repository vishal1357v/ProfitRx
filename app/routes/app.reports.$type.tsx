import { useState, useMemo, useCallback } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Layout, Card, Text, BlockStack, InlineStack, Button, DataTable, Banner, Box, Badge, TextField } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import prisma from "../db.server";
import { ProfitService } from "../services/profit.service";
import { SectionHeader } from "../components/SectionHeader";
import { EmptyStateCard } from "../components/EmptyState";

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const host = url.searchParams.get("host") || "";
  const type = params.type || "daily-profit";

  const rawSettings = await prisma.storeSettings.findUnique({ where: { shop } });
  const settings = ProfitService.getSettings(rawSettings);

  let reportData: any[] = [];
  let reportTitle = "";

  switch (type) {
    case "daily-profit": {
      reportTitle = "Daily Profit Report";
      const snapshots = await prisma.profitSnapshot.findMany({
        where: { shop },
        orderBy: { date: "desc" },
        take: 90,
      });
      reportData = snapshots.map((s) => ({
        date: s.date.toISOString().split("T")[0],
        revenue: Math.round(s.revenue),
        profit: Math.round(s.profit),
        margin: s.margin.toFixed(1),
        cogs: Math.round(s.cogs),
        fees: Math.round(s.fees),
        rtoLoss: Math.round(s.rtoLoss),
      }));
      break;
    }
    case "weekly-profit": {
      reportTitle = "Weekly Profit Report";
      const snapshots = await prisma.profitSnapshot.findMany({
        where: { shop },
        orderBy: { date: "asc" },
        take: 90,
      });
      // Group by ISO week
      const weeks: Record<string, { revenue: number; profit: number; cogs: number; fees: number; count: number }> = {};
      snapshots.forEach((s) => {
        const d = new Date(s.date);
        const weekStart = new Date(d);
        weekStart.setDate(d.getDate() - d.getDay());
        const key = weekStart.toISOString().split("T")[0];
        if (!weeks[key]) weeks[key] = { revenue: 0, profit: 0, cogs: 0, fees: 0, count: 0 };
        weeks[key].revenue += s.revenue;
        weeks[key].profit += s.profit;
        weeks[key].cogs += s.cogs;
        weeks[key].fees += s.fees;
        weeks[key].count += 1;
      });
      reportData = Object.entries(weeks).map(([week, d]) => ({
        week,
        revenue: Math.round(d.revenue),
        profit: Math.round(d.profit),
        margin: d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0",
        cogs: Math.round(d.cogs),
        fees: Math.round(d.fees),
        days: d.count,
      })).reverse();
      break;
    }
    case "monthly-profit": {
      reportTitle = "Monthly Profit Report";
      const snapshots = await prisma.profitSnapshot.findMany({
        where: { shop },
        orderBy: { date: "asc" },
      });
      const months: Record<string, { revenue: number; profit: number; cogs: number; fees: number }> = {};
      snapshots.forEach((s) => {
        const key = s.date.toISOString().substring(0, 7);
        if (!months[key]) months[key] = { revenue: 0, profit: 0, cogs: 0, fees: 0 };
        months[key].revenue += s.revenue;
        months[key].profit += s.profit;
        months[key].cogs += s.cogs;
        months[key].fees += s.fees;
      });
      reportData = Object.entries(months).map(([month, d]) => ({
        month,
        revenue: Math.round(d.revenue),
        profit: Math.round(d.profit),
        margin: d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0",
        cogs: Math.round(d.cogs),
        fees: Math.round(d.fees),
      })).reverse();
      break;
    }
    case "top-products":
    case "worst-products": {
      reportTitle = type === "top-products" ? "Top Products by Profit" : "Worst Products by Profit";
      const orders = await prisma.order.findMany({ where: { shop }, select: { productId: true, totalPrice: true, totalTax: true, shippingPrice: true, cogsAtTimeOfOrder: true, fulfillmentStatus: true, isCOD: true, gateway: true, discountAmount: true } });
      const cogsMap = await ProfitService.getCOGS(shop);
      const productMap: Record<string, { revenue: number; profit: number; volume: number }> = {};
      orders.forEach((o) => {
        const pid = o.productId || "unknown";
        if (!productMap[pid]) productMap[pid] = { revenue: 0, profit: 0, volume: 0 };
        productMap[pid].revenue += o.totalPrice;
        productMap[pid].volume += 1;
        const cogs = o.cogsAtTimeOfOrder ?? cogsMap[pid] ?? (o.totalPrice * settings.defaultCOGSPct / 100);
        const { profit } = ProfitService.calculateOrderProfit(o, cogs, settings);
        productMap[pid].profit += profit;
      });
      reportData = Object.entries(productMap)
        .map(([id, d]) => ({
          productId: id,
          revenue: Math.round(d.revenue),
          profit: Math.round(d.profit),
          margin: d.revenue > 0 ? ((d.profit / d.revenue) * 100).toFixed(1) : "0.0",
          volume: d.volume,
        }))
        .sort((a, b) => type === "top-products" ? b.profit - a.profit : a.profit - b.profit)
        .slice(0, 50);
      break;
    }
    case "rto-report": {
      reportTitle = "RTO Report";
      const events = await prisma.rTOEvent.findMany({
        where: { shop },
        orderBy: { createdAt: "desc" },
        take: 100,
      });
      reportData = events.map((e) => ({
        orderId: e.orderId,
        orderNumber: e.orderNumber,
        eventType: e.eventType,
        reason: e.reason || "Unknown",
        amount: Math.round(e.amount),
        status: e.status,
        date: e.createdAt.toISOString().split("T")[0],
      }));
      break;
    }
    case "customer-report": {
      reportTitle = "Customer Report";
      const customers = await prisma.customerProfile.findMany({
        where: { shop },
        orderBy: { totalRevenue: "desc" },
        take: 100,
      });
      reportData = customers.map((c) => ({
        name: c.customerName || "Unknown",
        email: c.customerEmail || "",
        orders: c.orderCount,
        revenue: Math.round(c.totalRevenue),
        profit: Math.round(c.totalProfit),
        ltv: Math.round(c.ltv),
        aov: Math.round(c.aov),
      }));
      break;
    }
    case "profit-leak-report": {
      reportTitle = "Profit Leak Report";
      const snapshots = await prisma.profitSnapshot.findMany({
        where: { shop },
        orderBy: { date: "desc" },
        take: 90,
      });
      reportData = snapshots.map((s) => ({
        date: s.date.toISOString().split("T")[0],
        rtoLoss: Math.round(s.rtoLoss),
        shippingOverage: Math.round(s.shippingOverage),
        discountLoss: Math.round(s.discountLoss),
        codFailureLoss: Math.round(s.codFailureLoss),
        totalLeak: Math.round(s.totalLeak),
      }));
      break;
    }
    default:
      reportTitle = "Unknown Report";
  }

  return { shop, host, type, reportTitle, reportData };
};

export default function ReportPage() {
  const { shop, host, type, reportTitle, reportData } = useLoaderData<typeof loader>();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const filteredData = useMemo(() => {
    if (!dateFrom && !dateTo) return reportData;
    return reportData.filter((row: any) => {
      const date = row.date || row.week || row.month;
      if (!date) return true;
      if (dateFrom && date < dateFrom) return false;
      if (dateTo && date > dateTo) return false;
      return true;
    });
  }, [reportData, dateFrom, dateTo]);

  const columns = useMemo(() => {
    if (filteredData.length === 0) return [];
    return Object.keys(filteredData[0]);
  }, [filteredData]);

  const rows = useMemo(() => {
    return filteredData.map((row: any) =>
      columns.map((col) => {
        const val = row[col];
        if (typeof val === "number") return val.toLocaleString("en-IN");
        return String(val);
      })
    );
  }, [filteredData, columns]);

  const handleExportCSV = useCallback(() => {
    if (columns.length === 0) return;
    const header = columns.join(",") + "\n";
    const body = filteredData.map((row: any) =>
      columns.map((col) => {
        const val = row[col];
        if (typeof val === "string" && val.includes(",")) return `"${val}"`;
        return String(val);
      }).join(",")
    ).join("\n");
    const blob = new Blob([header + body], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `profitrx_${type}_${new Date().toISOString().split("T")[0]}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [filteredData, columns, type]);

  const handlePrint = useCallback(() => {
    window.print();
  }, []);

  return (
    <Page
      title={reportTitle}
      backAction={{ url: `/app/reports?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}` }}
    >
      <Layout>
        <Layout.Section>
          <Card>
            <Box padding="400">
              <BlockStack gap="400">
                <InlineStack align="space-between" blockAlign="end">
                  <InlineStack gap="200">
                    <div style={{ maxWidth: 160 }}>
                      <TextField label="From" type="date" value={dateFrom} onChange={setDateFrom} autoComplete="off" />
                    </div>
                    <div style={{ maxWidth: 160 }}>
                      <TextField label="To" type="date" value={dateTo} onChange={setDateTo} autoComplete="off" />
                    </div>
                  </InlineStack>
                  <InlineStack gap="200">
                    <Button variant="secondary" onClick={handleExportCSV}>📥 CSV</Button>
                    <Button variant="secondary" onClick={handleExportCSV}>📊 Excel</Button>
                    <Button variant="secondary" onClick={handlePrint}>🖨️ Print</Button>
                  </InlineStack>
                </InlineStack>

                {filteredData.length > 0 ? (
                  <>
                    <Badge tone="info">{`${filteredData.length} rows`}</Badge>
                    <DataTable
                      columnContentTypes={columns.map(() => "text" as const)}
                      headings={columns.map((c) => c.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()))}
                      rows={rows}
                    />
                  </>
                ) : (
                  <EmptyStateCard
                    icon="📊"
                    title="No data for this report"
                    description="Sync your orders and configure COGS to generate report data."
                    action={{ text: "Sync Orders", url: `/app/dashboard?shop=${encodeURIComponent(shop)}&host=${encodeURIComponent(host)}` }}
                  />
                )}
              </BlockStack>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
