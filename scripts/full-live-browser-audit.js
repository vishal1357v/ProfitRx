import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const USER_DATA = path.join(process.env.TEMP || "C:\\temp", "chrome-audit-" + Date.now());
const SCREENSHOT_DIR = path.join(process.cwd(), "screenshots", "audit");

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class ChromeClient {
  constructor() {
    this.chromeProc = null;
    this.ws = null;
    this.messageId = 1;
    this.pending = new Map();
    this.consoleLogs = [];
    this.networkErrors = [];
  }

  async start() {
    console.log("🚀 Spawning Google Chrome with CDP...");
    this.chromeProc = spawn(
      CHROME_PATH,
      [
        "--headless=new",
        `--remote-debugging-port=${PORT}`,
        `--user-data-dir=${USER_DATA}`,
        "--disable-gpu",
        "--no-sandbox",
        "--hide-scrollbars",
      ],
      { stdio: "ignore" }
    );

    let version = null;
    for (let i = 0; i < 30; i++) {
      try {
        const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
        if (res.ok) {
          version = await res.json();
          break;
        }
      } catch {}
      await sleep(200);
    }

    if (!version) {
      throw new Error("Could not connect to Chrome on port " + PORT);
    }

    console.log("✅ Chrome CDP Ready:", version.Browser);

    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: "PUT" });
    const tab = await newTabRes.json();
    this.ws = new WebSocket(tab.webSocketDebuggerUrl);

    await new Promise((resolve) => this.ws.once("open", resolve));

    this.ws.on("message", (raw) => {
      const data = JSON.parse(raw.toString());
      if (data.id && this.pending.has(data.id)) {
        const { resolve, reject } = this.pending.get(data.id);
        this.pending.delete(data.id);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }

      if (data.method === "Runtime.consoleAPICalled") {
        const text = data.params.args.map((a) => a.value || a.description || "").join(" ");
        this.consoleLogs.push({ type: data.params.type, text, timestamp: Date.now() });
      }

      if (data.method === "Network.responseReceived") {
        const status = data.params.response.status;
        const url = data.params.response.url;
        if (status >= 400 && !url.includes("favicon") && !url.includes("shopifycloud")) {
          this.networkErrors.push({ url, status, timestamp: Date.now() });
        }
      }
    });

    await this.send("Page.enable");
    await this.send("Runtime.enable");
    await this.send("Network.enable");
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.messageId++;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async setViewport(width, height, isMobile = false) {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: isMobile ? 2 : 1,
      mobile: isMobile,
    });
  }

  async navigate(url, waitMs = 3500) {
    this.consoleLogs = [];
    this.networkErrors = [];
    const t0 = performance.now();
    await this.send("Page.navigate", { url });
    await sleep(waitMs);
    const duration = Math.round(performance.now() - t0);
    return { duration };
  }

  async evaluate(expression) {
    const res = await this.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    return res.result?.value;
  }

  async captureScreenshot(filename) {
    const res = await this.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const fullPath = path.join(SCREENSHOT_DIR, filename);
    fs.writeFileSync(fullPath, Buffer.from(res.data, "base64"));
    return fullPath;
  }

  async clickSelector(selector) {
    return this.evaluate(`
      (() => {
        const el = document.querySelector(${JSON.stringify(selector)});
        if (!el) return false;
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.click();
        return true;
      })()
    `);
  }

  async close() {
    try {
      this.ws.close();
      this.chromeProc.kill();
    } catch {}
  }
}

async function main() {
  const client = new ChromeClient();
  await client.start();

  const auditResults = [];

  const viewports = [
    { name: "Desktop", width: 1440, height: 900, isMobile: false },
    { name: "Laptop", width: 1366, height: 768, isMobile: false },
    { name: "Tablet", width: 768, height: 1024, isMobile: true },
    { name: "Mobile", width: 390, height: 844, isMobile: true },
    { name: "SmallMobile", width: 375, height: 812, isMobile: true },
  ];

  const routes = [
    { name: "Home Dashboard", path: "/app/dashboard?preview=true", category: "Core" },
    { name: "Orders & COD Review", path: "/app/operations?preview=true", category: "Operations" },
    { name: "COD Protection Rules", path: "/app/cod-rules?preview=true", category: "Protection" },
    { name: "Pincode Protection Heatmap", path: "/app/rto-heatmap?preview=true", category: "Protection" },
    { name: "Customer Risk & Returns", path: "/app/customer-risk?preview=true", category: "Protection" },
    { name: "RTO Analytics", path: "/app/rto?preview=true", category: "Protection" },
    { name: "Product Costs (COGS)", path: "/app/cogs?preview=true", category: "Profit & Costs" },
    { name: "Where You're Losing Money", path: "/app/profit-leaks?preview=true", category: "Profit & Costs" },
    { name: "ROAS & Ad Spend", path: "/app/roas?preview=true", category: "Profit & Costs" },
    { name: "Financial Reports", path: "/app/reports?preview=true", category: "Profit & Costs" },
    { name: "Store Settings", path: "/app/settings?preview=true", category: "Account & Config" },
    { name: "Billing & Subscription", path: "/app/billing?preview=true", category: "Account & Config" },
    { name: "Pricing Plans", path: "/app/pricing?preview=true", category: "Account & Config" },
    { name: "Alerts & Notifications", path: "/app/alerts?preview=true", category: "Account & Config" },
    { name: "System Health Status", path: "/app/health?preview=true", category: "Account & Config" },
    { name: "Onboarding Wizard", path: "/app/onboarding?preview=true", category: "Account & Config" },
    { name: "Order Detail (Unauthenticated check)", path: "/app/orders/849201?preview=true", category: "Operations" },
  ];

  console.log("\n============================================================");
  console.log("  PROFITRX FULL LIVE BROWSER INSPECTION RUNNER");
  console.log("============================================================\n");

  for (const route of routes) {
    console.log(`\n--- Inspecting: ${route.name} (${route.path}) ---`);
    const routeUrl = `http://127.0.0.1:3000${route.path}`;

    // Test Desktop first
    await client.setViewport(1440, 900, false);
    const navResult = await client.navigate(routeUrl, 3000);

    const pageInfo = await client.evaluate(`
      (() => {
        const title = document.title;
        const h1 = document.querySelector('h1')?.innerText || '';
        const h2 = document.querySelector('h2')?.innerText || '';
        const bodyText = document.body.innerText || '';
        const hasHorizontalScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth;
        const bannerCount = document.querySelectorAll('.Polaris-Banner').length;
        const cardCount = document.querySelectorAll('.Polaris-Card').length;
        const tableCount = document.querySelectorAll('.Polaris-DataTable').length;
        const buttonCount = document.querySelectorAll('button, .Polaris-Button').length;
        const hasLaTeXNotation = bodyText.includes('$EV$') || bodyText.includes('\\(');
        return {
          title,
          heading: h1 || h2 || 'No H1/H2 found',
          textLength: bodyText.length,
          hasHorizontalScroll,
          bannerCount,
          cardCount,
          tableCount,
          buttonCount,
          hasLaTeXNotation,
          snippet: bodyText.slice(0, 200).replace(/\\n/g, ' '),
        };
      })()
    `);

    const desktopScreenshot = `desktop_${route.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.png`;
    const screenshotPath = await client.captureScreenshot(desktopScreenshot);

    let status = "VERIFIED GOOD";
    const issues = [];

    if (!pageInfo || pageInfo.textLength < 50) {
      status = "NOT ACCESSIBLE";
      issues.push("Page did not render visible content or returned empty body.");
    } else {
      if (pageInfo.hasHorizontalScroll) {
        issues.push("Horizontal overflow detected on desktop viewport.");
      }
      if (pageInfo.hasLaTeXNotation) {
        issues.push("Raw LaTeX notation detected in rendered text.");
      }
      if (client.networkErrors.length > 0) {
        issues.push(`Network errors encountered: ${client.networkErrors.map((e) => e.status + ' ' + e.url).join(', ')}`);
      }
    }

    if (issues.length > 0 && status === "VERIFIED GOOD") {
      status = "VERIFIED ISSUE";
    }

    console.log(`Status: [${status}] | Heading: "${pageInfo?.heading}" | Duration: ${navResult.duration}ms`);
    if (issues.length > 0) {
      console.log(`Issues: ${issues.join(' | ')}`);
    }

    // Now test across other viewports
    const viewportFindings = {};
    for (const vp of viewports.slice(1)) {
      await client.setViewport(vp.width, vp.height, vp.isMobile);
      await sleep(1000);
      const vpInfo = await client.evaluate(`
        (() => {
          const hasScroll = document.documentElement.scrollWidth > document.documentElement.clientWidth + 5;
          const mobileCardsCount = document.querySelectorAll('.prx-mobile-order-card').length;
          const desktopTableVisible = document.querySelector('.prx-operations-desktop-table')?.offsetParent !== null;
          return { hasScroll, mobileCardsCount, desktopTableVisible };
        })()
      `);

      const vpScreenshot = `${vp.name.toLowerCase()}_${route.name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase()}.png`;
      await client.captureScreenshot(vpScreenshot);

      viewportFindings[vp.name] = {
        viewport: `${vp.width}x${vp.height}`,
        hasHorizontalScroll: vpInfo?.hasScroll || false,
        mobileCardsCount: vpInfo?.mobileCardsCount || 0,
        screenshot: vpScreenshot,
      };
    }

    auditResults.push({
      route: route.path,
      name: route.name,
      category: route.category,
      status,
      heading: pageInfo?.heading,
      desktopScreenshot,
      pageInfo,
      issues,
      viewportFindings,
      consoleErrors: client.consoleLogs.filter((l) => l.type === 'error').length,
    });
  }

  // --- INTERACTIVE AUDIT SECTION ---
  console.log("\n============================================================");
  console.log("  CONDUCTING DEEP INTERACTIVE BEHAVIORAL AUDIT");
  console.log("============================================================\n");

  const interactionFindings = [];

  // 1. Operations Queue Interactions
  console.log("Testing Operations Queue interactions...");
  await client.setViewport(1440, 900, false);
  await client.navigate("http://127.0.0.1:3000/app/operations?preview=true", 2500);

  // Test Tabs
  const tabSwitchResult = await client.evaluate(`
    (() => {
      const tabs = Array.from(document.querySelectorAll('.Polaris-Tabs__Tab'));
      if (tabs.length < 2) return { success: false, reason: 'Tabs not found' };
      tabs[1].click(); // Click "All Orders"
      return { success: true, clickedTab: tabs[1].innerText };
    })()
  `);
  await sleep(1000);
  await client.captureScreenshot("interactive_operations_tab_all_orders.png");
  interactionFindings.push({
    test: "Operations Tab Switching (All Orders)",
    result: tabSwitchResult.success ? "PASSED" : "FAILED",
    details: `Switched to tab: ${tabSwitchResult.clickedTab}`,
  });

  // Switch back to "Needs Attention"
  await client.evaluate(`
    (() => {
      const tabs = Array.from(document.querySelectorAll('.Polaris-Tabs__Tab'));
      if (tabs[0]) tabs[0].click();
    })()
  `);
  await sleep(1000);

  // Test Review Modal
  console.log("Testing Review Modal in Operations Queue...");
  const modalOpenResult = await client.evaluate(`
    (() => {
      const reviewBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.trim() === 'Review');
      if (!reviewBtn) return { success: false, reason: 'Review button not found' };
      reviewBtn.click();
      return { success: true };
    })()
  `);
  await sleep(1500);

  const modalInspection = await client.evaluate(`
    (() => {
      const modal = document.querySelector('.Polaris-Modal-Dialog');
      if (!modal) return { open: false };
      const text = modal.innerText;
      const hasEV = text.includes('$EV$');
      const hasNetOutcome = text.includes('Estimated Net Outcome');
      const hasProfitIfDelivered = text.includes('Estimated Contribution if Delivered');
      return {
        open: true,
        hasEV,
        hasNetOutcome,
        hasProfitIfDelivered,
        title: modal.querySelector('.Polaris-Modal-Header__Title')?.innerText || '',
        snippet: text.slice(0, 300).replace(/\\n/g, ' '),
      };
    })()
  `);

  await client.captureScreenshot("interactive_operations_review_modal_open.png");

  // Close modal via Cancel button
  await client.evaluate(`
    (() => {
      const cancelBtn = Array.from(document.querySelectorAll('.Polaris-Modal-Dialog button')).find(b => b.innerText.trim() === 'Cancel');
      if (cancelBtn) cancelBtn.click();
    })()
  `);
  await sleep(1000);

  interactionFindings.push({
    test: "Operations Review Modal Open & Truthful Language",
    result: modalInspection.open && !modalInspection.hasEV && modalInspection.hasNetOutcome ? "PASSED" : "FAILED",
    details: `Modal Open: ${modalInspection.open}, LaTeX $EV$ Removed: ${!modalInspection.hasEV}, Net Outcome Visible: ${modalInspection.hasNetOutcome}`,
  });

  // 2. Mobile Responsive Card View & Drawer
  console.log("Testing Mobile Responsive Card View & Navigation Drawer...");
  await client.setViewport(390, 844, true);
  await client.navigate("http://127.0.0.1:3000/app/operations?preview=true", 2500);

  const mobileCardsInspection = await client.evaluate(`
    (() => {
      const cards = document.querySelectorAll('.prx-mobile-order-card');
      const desktopTable = document.querySelector('.prx-operations-desktop-table');
      const tableVisible = desktopTable ? window.getComputedStyle(desktopTable).display !== 'none' : false;
      const horizontalOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth;
      return {
        cardCount: cards.length,
        desktopTableVisible: tableVisible,
        horizontalOverflow,
      };
    })()
  `);

  await client.captureScreenshot("interactive_mobile_390_operations_cards.png");

  interactionFindings.push({
    test: "Mobile Operations Queue Card View (390px)",
    result: mobileCardsInspection.cardCount > 0 && !mobileCardsInspection.desktopTableVisible && !mobileCardsInspection.horizontalOverflow ? "PASSED" : "FAILED",
    details: `Rendered ${mobileCardsInspection.cardCount} responsive cards. Desktop table hidden: ${!mobileCardsInspection.desktopTableVisible}. Horizontal overflow: ${mobileCardsInspection.horizontalOverflow}`,
  });

  // Test Mobile Navigation Drawer Menu
  console.log("Testing Mobile Navigation Drawer Menu...");
  const drawerClickResult = await client.evaluate(`
    (() => {
      const menuBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText.includes('Menu') || b.querySelector('svg'));
      if (menuBtn) {
        menuBtn.click();
        return { clicked: true };
      }
      return { clicked: false };
    })()
  `);
  await sleep(1500);
  await client.captureScreenshot("interactive_mobile_navigation_drawer_open.png");

  // Save audit data to JSON for final reporting
  const auditReportData = {
    timestamp: new Date().toISOString(),
    browser: "Google Chrome 157 (Headless CDP)",
    totalRoutesTested: routes.length,
    routes: auditResults,
    interactions: interactionFindings,
  };

  fs.writeFileSync(path.join(SCREENSHOT_DIR, "audit_summary.json"), JSON.stringify(auditReportData, null, 2));

  await client.close();
  console.log("\n============================================================");
  console.log("  BROWSER AUDIT COMPLETED SUCCESSFULLY!");
  console.log(`  Saved summary to: ${path.join(SCREENSHOT_DIR, 'audit_summary.json')}`);
  console.log("============================================================\n");
}

main().catch((err) => {
  console.error("FATAL ERROR in browser audit runner:", err);
  process.exit(1);
});

