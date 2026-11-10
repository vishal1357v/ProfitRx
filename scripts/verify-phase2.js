import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9223;
const USER_DATA = path.join(process.env.TEMP || "C:\\temp", "chrome-phase2-" + Date.now());

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyDashboard() {
  console.log("Launching Chrome CDP for Phase 2 Dashboard verification...");
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

  const viewports = [
    { name: "desktop", width: 1440, height: 900 },
    { name: "mobile_390", width: 390, height: 844 },
  ];

  const screenshotsDir = path.resolve("screenshots/audit");
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  for (const vp of viewports) {
    console.log(`\nTesting Dashboard on ${vp.name} (${vp.width}x${vp.height})...`);
    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:3000/app/dashboard?preview=true`, { method: "PUT" });
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
      if (d.method === "Runtime.consoleAPICalled") {
        if (d.params.type === "error") {
          consoleErrors.push(d.params.args.map((a) => a.value || a.description).join(" "));
        }
      }
      if (d.method === "Network.responseReceived") {
        if (d.params.response.status >= 400) {
          networkErrors.push(`${d.params.response.status} ${d.params.response.url}`);
        }
      }
    });

    const send = (method, params = {}) =>
      new Promise((res, rej) => {
        const msgId = id++;
        pending.set(msgId, { res, rej });
        ws.send(JSON.stringify({ id: msgId, method, params }));
      });

    await new Promise((r) => ws.on("open", r));

    await send("Runtime.enable");
    await send("Network.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", {
      width: vp.width,
      height: vp.height,
      deviceScaleFactor: 1,
      mobile: vp.name.includes("mobile"),
    });

    await send("Page.navigate", { url: "http://127.0.0.1:3000/app/dashboard?preview=true" });
    await sleep(2500);

    // Extract text content & metrics
    const textEval = await send("Runtime.evaluate", {
      expression: `({
        title: document.title,
        heading: document.querySelector('h1')?.innerText || '',
        profitHero: document.body.innerText.includes('Profit earned'),
        rtoLossHero: document.body.innerText.includes('RTO losses'),
        ordersToReviewHero: document.body.innerText.includes('Orders to review'),
        triageStrip: document.body.innerText.includes('Orders needing attention'),
        order1042: document.body.innerText.includes('#1042'),
        order1045: document.body.innerText.includes('#1045'),
        order1482: document.body.innerText.includes('#1482'),
        hasEstimatedNotice: document.body.innerText.includes('Estimated profit'),
        tabsVisible: document.body.innerText.includes('Profit & Loss Trend') && document.body.innerText.includes('Courier & Return Health'),
        bodyLength: document.body.innerText.length
      })`,
      returnByValue: true,
    });

    console.log("DOM Verification:", JSON.stringify(textEval.result.value, null, 2));

    // Capture screenshot
    const ss = await send("Page.captureScreenshot", { format: "png" });
    const ssPath = path.join(screenshotsDir, `phase2_dashboard_${vp.name}.png`);
    fs.writeFileSync(ssPath, Buffer.from(ss.data, "base64"));
    console.log(`Saved screenshot: ${ssPath}`);

    console.log("Console Errors:", consoleErrors);
    console.log("Network Errors:", networkErrors);

    await send("Page.close");
    ws.close();
  }

  chromeProc.kill("SIGKILL");
  console.log("\nPhase 2 Dashboard verification finished.");
}

verifyDashboard().catch(console.error);

