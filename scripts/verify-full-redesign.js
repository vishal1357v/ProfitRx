import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9226;
const USER_DATA = path.join(process.env.TEMP || "C:\\temp", "chrome-full-redesign-" + Date.now());

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const ROUTES = [
  { name: "00_Onboarding", path: "/app/onboarding?preview=true" },
  { name: "01_Dashboard", path: "/app/dashboard?preview=true" },
  { name: "02_Operations", path: "/app/operations?preview=true" },
  { name: "03_Order_Details_1042", path: "/app/orders/849201?preview=true" },
  { name: "04_COD_Rules", path: "/app/cod-rules?preview=true" },
  { name: "05_Pincode_Heatmap", path: "/app/rto-heatmap?preview=true" },
  { name: "06_Customer_Risk", path: "/app/customer-risk?preview=true" },
  { name: "07_COGS_Catalog", path: "/app/cogs?preview=true" },
  { name: "08_Profit_Leaks", path: "/app/profit-leaks?preview=true" },
  { name: "09_ROAS", path: "/app/roas?preview=true" },
  { name: "10_Reports", path: "/app/reports?preview=true" },
  { name: "11_Billing", path: "/app/billing?preview=true" },
];

async function verifyAll() {
  console.log("Starting Full Redesign Verification with Chrome CDP...");
  const chromeProc = spawn(
    CHROME_PATH,
    [
      "--headless=new",
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${USER_DATA}`,
      "--disable-gpu",
      "--no-sandbox",
      "--window-size=1440,900",
    ],
    { stdio: "ignore" }
  );

  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) break;
    } catch {}
    await sleep(200);
  }

  const screenshotsDir = path.resolve("screenshots/redesign_verified");
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  const summary = [];

  for (const r of ROUTES) {
    const url = `http://127.0.0.1:3000${r.path}`;
    console.log(`\nVerifying [${r.name}] -> ${url}`);

    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${url}`, { method: "PUT" });
    const tab = await newTabRes.json();
    const ws = new WebSocket(tab.webSocketDebuggerUrl);

    let id = 1;
    const pending = new Map();
    const consoleErrors = [];
    const networkErrors = [];

    ws.on("message", (raw) => {
      const d = JSON.parse(raw.toString());
      if (d.id && pending.has(d.id)) {
        const { res, rej } = pending.get(d.id);
        pending.delete(d.id);
        if (d.error) rej(d.error);
        else res(d.result);
      }
      if (d.method === "Runtime.consoleAPICalled" && d.params.type === "error") {
        consoleErrors.push(d.params.args.map((a) => a.value || a.description).join(" "));
      }
      if (d.method === "Network.responseReceived" && d.params.response.status >= 400) {
        networkErrors.push(`${d.params.response.status} ${d.params.response.url}`);
      }
    });

    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const msgId = id++;
        pending.set(msgId, { res, rej });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });

    await new Promise((res) => ws.on("open", res));
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await send("Page.navigate", { url });
    await sleep(2500);

    const domInfo = await send("Runtime.evaluate", {
      expression: `({
        heading: document.querySelector('h1')?.innerText || '',
        title: document.title,
        bodyLen: document.body.innerText.length,
        hasErrorBanner: document.body.innerText.includes('Failed to Load') || document.body.innerText.includes('An unexpected error'),
      })`,
      returnByValue: true,
    });

    // Capture Desktop screenshot
    const ssDesktop = await send("Page.captureScreenshot", { format: "png" });
    const desktopPath = path.join(screenshotsDir, `${r.name}_desktop.png`);
    fs.writeFileSync(desktopPath, Buffer.from(ssDesktop.data, "base64"));

    // Switch to Mobile 390
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await sleep(600);

    const ssMobile = await send("Page.captureScreenshot", { format: "png" });
    const mobilePath = path.join(screenshotsDir, `${r.name}_mobile_390.png`);
    fs.writeFileSync(mobilePath, Buffer.from(ssMobile.data, "base64"));

    const routeResult = {
      name: r.name,
      heading: domInfo.result?.value?.heading || "N/A",
      hasErrorBanner: domInfo.result?.value?.hasErrorBanner || false,
      consoleErrorsCount: consoleErrors.length,
      networkErrorsCount: networkErrors.length,
      desktopScreenshot: desktopPath,
      mobileScreenshot: mobilePath,
    };
    summary.push(routeResult);

    console.log(`  Heading: "${routeResult.heading}"`);
    console.log(`  Console Errors: ${consoleErrors.length}`);
    console.log(`  Network Errors: ${networkErrors.length}`);
    console.log(`  Error Banner: ${routeResult.hasErrorBanner ? "YES (FAIL)" : "None (PASS)"}`);

    await send("Page.close");
    ws.close();
  }

  chromeProc.kill("SIGKILL");

  console.log("\n================ FULL REDESIGN AUDIT SUMMARY ================");
  console.table(summary.map(s => ({
    Route: s.name,
    Heading: s.heading,
    "Console Errs": s.consoleErrorsCount,
    "Net Errs": s.networkErrorsCount,
    Status: !s.hasErrorBanner && s.consoleErrorsCount === 0 && s.networkErrorsCount === 0 ? "✅ PASS" : "❌ FAIL"
  })));
}

verifyAll().catch(console.error);

