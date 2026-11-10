import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const USER_DATA = path.join(process.env.TEMP || "C:\\temp", "chrome-cdp-test-" + Date.now());

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function run() {
  console.log("Launching Chrome...");
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

  // Poll until CDP is available
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
    chromeProc.kill();
    throw new Error("Failed to connect to Chrome CDP within 6 seconds.");
  }

  console.log("Connected to Chrome:", version.Browser);

  // Create a new target/tab
  const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?http://127.0.0.1:3000/app/dashboard?preview=true`, {
    method: "PUT",
  });
  const tab = await newTabRes.json();
  console.log("Opened Tab Target:", tab.id, tab.webSocketDebuggerUrl);

  const ws = new WebSocket(tab.webSocketDebuggerUrl);

  let messageId = 1;
  const pendingRequests = new Map();

  function sendCommand(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = messageId++;
      pendingRequests.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await new Promise((resolve) => ws.once("open", resolve));
  console.log("WebSocket connected to target page!");

  ws.on("message", (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.id && pendingRequests.has(data.id)) {
      const { resolve, reject } = pendingRequests.get(data.id);
      pendingRequests.delete(data.id);
      if (data.error) reject(data.error);
      else resolve(data.result);
    }
  });

  await sendCommand("Page.enable");
  await sendCommand("Runtime.enable");
  await sendCommand("Network.enable");
  await sendCommand("Log.enable");

  ws.on("message", (raw) => {
    const data = JSON.parse(raw.toString());
    if (data.method === "Runtime.consoleAPICalled") {
      console.log("[Console API]", data.params.type, data.params.args.map((a) => a.value || a.description));
    }
    if (data.method === "Log.entryAdded") {
      console.log("[Log Entry]", data.params.entry.level, data.params.entry.text);
    }
    if (data.method === "Runtime.exceptionThrown") {
      console.log("[Runtime Exception]", data.params.exceptionDetails.text, data.params.exceptionDetails.exception?.description);
    }
  });

  console.log("Navigating to Dashboard...");
  await sendCommand("Page.navigate", { url: "http://127.0.0.1:3000/app/dashboard?preview=true" });

  // Wait for page to render
  await sleep(4000);

  const evalResult = await sendCommand("Runtime.evaluate", {
    expression: `
      (() => {
        return {
          url: window.location.href,
          title: document.title,
          bodyHtmlLength: document.body.innerHTML.length,
          bodyTextLength: document.body.innerText.length,
          h1s: Array.from(document.querySelectorAll('h1, h2, .Polaris-Header-Title')).map(e => e.innerText),
          cards: document.querySelectorAll('.Polaris-Card').length,
          tables: document.querySelectorAll('.Polaris-DataTable').length,
          scripts: Array.from(document.querySelectorAll('script')).map(s => s.src || 'inline'),
        };
      })()
    `,
    returnByValue: true,
  });

  console.log("DOM Evaluation in Chrome:", evalResult.result?.value);

  // Capture screenshot
  const screenshot = await sendCommand("Page.captureScreenshot", { format: "png" });
  const outPath = path.join(process.cwd(), "screenshots", "audit", "cdp_dashboard_test.png");
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, Buffer.from(screenshot.data, "base64"));
  console.log("Saved Screenshot to:", outPath, `(${screenshot.data.length} bytes base64)`);

  ws.close();
  chromeProc.kill();
  console.log("Test finished successfully!");
}

run().catch((e) => {
  console.error("Test failed:", e);
  process.exit(1);
});
