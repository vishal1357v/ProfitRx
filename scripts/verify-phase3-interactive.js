import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9225;
const USER_DATA = path.join(process.env.TEMP || "C:\\temp", "chrome-phase3-int-" + Date.now());

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verifyInteractive() {
  console.log("Launching Chrome CDP for interactive Operations verification...");
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

  const screenshotsDir = path.resolve("screenshots/audit");
  if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });

  // 1. Desktop Test
  {
    console.log("\nTesting Desktop Operations...");
    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:3000/app/operations?preview=true`, { method: "PUT" });
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

    await new Promise((r) => ws.on("open", r));
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

    await send("Page.navigate", { url: "http://127.0.0.1:3000/app/operations?preview=true" });
    await sleep(2500);

    const ss = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(screenshotsDir, "phase3_operations_desktop.png"), Buffer.from(ss.data, "base64"));
    console.log("Saved screenshot: phase3_operations_desktop.png");

    console.log("Desktop Console Errors:", consoleErrors);
    console.log("Desktop Network Errors:", networkErrors);

    await send("Page.close");
    ws.close();
  }

  // 2. Mobile 390 Test (Summary + Expansion + Modal)
  {
    console.log("\nTesting Mobile Operations (390x844)...");
    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:3000/app/operations?preview=true`, { method: "PUT" });
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

    await new Promise((r) => ws.on("open", r));
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Page.enable");
    await send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

    await send("Page.navigate", { url: "http://127.0.0.1:3000/app/operations?preview=true" });
    await sleep(2500);

    // Initial collapsed screenshot
    let ss = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(screenshotsDir, "phase3_operations_mobile_collapsed.png"), Buffer.from(ss.data, "base64"));
    console.log("Saved screenshot: phase3_operations_mobile_collapsed.png");

    // Click tap-to-expand button
    const expandResult = await send("Runtime.evaluate", {
      expression: `(() => {
        const toggleBtn = document.querySelector('.prx-mobile-expand-toggle');
        if (toggleBtn) {
          toggleBtn.click();
          return true;
        }
        return false;
      })()`,
      returnByValue: true,
    });
    console.log("Clicked expand toggle:", expandResult.result.value);
    await sleep(500);

    // Expanded screenshot
    ss = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(screenshotsDir, "phase3_operations_mobile_expanded.png"), Buffer.from(ss.data, "base64"));
    console.log("Saved screenshot: phase3_operations_mobile_expanded.png");

    // Click Review button to open modal
    const modalClickResult = await send("Runtime.evaluate", {
      expression: `(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        const reviewBtn = btns.find(b => b.innerText.includes('Review') || b.innerText.includes('Verify OTP'));
        if (reviewBtn) {
          reviewBtn.click();
          return true;
        }
        return false;
      })()`,
      returnByValue: true,
    });
    console.log("Clicked Review button:", modalClickResult.result.value);
    await sleep(600);

    // Modal screenshot
    ss = await send("Page.captureScreenshot", { format: "png" });
    fs.writeFileSync(path.join(screenshotsDir, "phase3_operations_mobile_modal.png"), Buffer.from(ss.data, "base64"));
    console.log("Saved screenshot: phase3_operations_mobile_modal.png");

    console.log("Mobile Console Errors:", consoleErrors);
    console.log("Mobile Network Errors:", networkErrors);

    await send("Page.close");
    ws.close();
  }

  chromeProc.kill("SIGKILL");
  console.log("\nPhase 3 verification complete.");
}

verifyInteractive().catch(console.error);

