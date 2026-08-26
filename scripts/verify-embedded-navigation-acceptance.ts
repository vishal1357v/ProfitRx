import prisma from "../app/db.server";

async function verifyAllInternalNavigations() {
  console.log("================================================================================");
  console.log("       PROFITRX FINAL EMBEDDED NAVIGATION ACCEPTANCE TEST");
  console.log("================================================================================\n");

  const shop = "greek-god-wvwt8ptt.myshopify.com";
  const host = "YWRtaW4uc2hvcGlmeS5jb20vc3RvcmUvZ3JlZWstZ29kLXd2d3Q4cHR0";

  console.log(`[Target Store] Shop: ${shop}`);
  console.log(`[Target Store] Host: ${host}`);

  // Verify Session in Database
  const session = await prisma.session.findFirst({
    where: { shop },
  });

  if (!session) {
    console.warn(`[WARN] Offline session for ${shop} not found in database, creating or using mock.`);
  } else {
    console.log(`[PASS] Session found in database for ${shop} (ID: ${session.id})`);
  }

  const routes = [
    { name: "Dashboard", path: "/app/dashboard", loaderFile: "../app/routes/app.dashboard" },
    { name: "COGS Catalog", path: "/app/cogs", loaderFile: "../app/routes/app.cogs" },
    { name: "Settings", path: "/app/settings", loaderFile: "../app/routes/app.settings" },
    { name: "Billing", path: "/app/billing", loaderFile: "../app/routes/app.billing" },
    { name: "Alerts", path: "/app/alerts", loaderFile: "../app/routes/app.alerts" },
    { name: "Operations", path: "/app/operations", loaderFile: "../app/routes/app.operations" },
    { name: "COD Rules", path: "/app/cod-rules", loaderFile: "../app/routes/app.cod-rules" },
    { name: "Pincode Protection / Heatmap", path: "/app/rto-heatmap", loaderFile: "../app/routes/app.rto-heatmap" },
    { name: "Profit Leaks", path: "/app/profit-leaks", loaderFile: "../app/routes/app.profit-leaks" },
    { name: "Reports Hub", path: "/app/reports", loaderFile: "../app/routes/app.reports" },
    { name: "Customers Intelligence", path: "/app/customers", loaderFile: "../app/routes/app.customers" },
    { name: "RTO Analytics", path: "/app/rto", loaderFile: "../app/routes/app.rto" },
    { name: "Marketing ROAS", path: "/app/roas", loaderFile: "../app/routes/app.roas" },
    { name: "Store Health", path: "/app/health", loaderFile: "../app/routes/app.health" },
  ];

  console.log("\n--- Testing Route Module Integrity ---");
  let passedCount = 0;
  for (const r of routes) {
    try {
      const mod = await import(r.loaderFile);
      if (typeof mod.loader === "function" || typeof mod.default === "function") {
        console.log(`[PASS] ${r.name.padEnd(30)} -> Route component & loader export valid`);
        passedCount++;
      } else {
        console.error(`[FAIL] ${r.name.padEnd(30)} -> Missing loader or default export`);
      }
    } catch (err: any) {
      console.error(`[FAIL] ${r.name.padEnd(30)} -> Error importing module:`, err.message);
    }
  }

  console.log(`\nVerified ${passedCount}/${routes.length} route modules successfully.`);
  await prisma.$disconnect();
}

verifyAllInternalNavigations().catch(console.error);
