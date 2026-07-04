import type { LoaderFunctionArgs } from "react-router";
import { ProfitService } from "../services/profit.service";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  const format = url.searchParams.get("format") || "json";

  if (!shop) {
    return Response.json({ error: "Missing required query param: shop" }, { status: 400 });
  }

  const gstData = await ProfitService.getGSTSummary(shop);

  if (format === "csv") {
    const csvRows = [
      ["GSTIN", gstData.gstin || "NOT_REGISTERED"],
      ["Default GST Rate (%)", `${gstData.defaultGstRate}%`],
      ["Total Taxable Sales (INR)", gstData.totalTaxableSales.toString()],
      ["Total GST Collected (INR)", gstData.totalGstCollected.toString()],
      ["CGST Collected (INR)", gstData.cgst.toString()],
      ["SGST Collected (INR)", gstData.sgst.toString()],
      ["IGST Collected (INR)", gstData.igst.toString()],
      ["Intra-State Sales (INR)", gstData.intraStateSales.toString()],
      ["Inter-State Sales (INR)", gstData.interStateSales.toString()],
      [""],
      ["HSN Code", "Taxable Sales (INR)", "GST Tax Amount (INR)"],
      ...gstData.hsnSummary.map((h) => [h.hsnCode, h.sales.toString(), h.tax.toString()]),
    ];

    const csvContent = csvRows.map((r) => r.join(",")).join("\n");
    const filename = `GSTR-1_Summary_${shop.replace(/[^a-zA-Z0-9]/g, "_")}_${new Date().toISOString().split("T")[0]}.csv`;

    return new Response(csvContent, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  }

  return Response.json({
    shop,
    gstReport: gstData,
    exportedAt: new Date().toISOString(),
  });
};
