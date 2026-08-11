import { useState, useMemo, useCallback } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Layout, Card, Text, BlockStack, InlineStack, Button, DataTable, Banner, Box, Badge, TextField } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { ReportsApplicationService } from "../application/reports/reports.application";
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

  const { reportTitle, reportData } = await ReportsApplicationService.getReportDetails(shop, type);

  return {
    shop,
    host,
    type,
    reportTitle,
    reportData,
  };
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
