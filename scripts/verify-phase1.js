import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import WebSocket from "ws";

const CHROME_PATH = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const PORT = 9222;
const USER_DATA = path.join(process.env.TEMP || "C:\\temp", "chrome-phase1-" + Date.now());

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function verify() {
  console.log("Launching Chrome CDP for Phase 1 verification...");
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

  const routesToTest = [
    { name: "Dashboard", url: "http://127.0.0.1:3000/app/dashboard?preview=true" },
    { name: "Alerts", url: "http://127.0.0.1:3000/app/alerts?preview=true" },
    { name: "Health", url: "http://127.0.0.1:3000/app/health?preview=true" },
    { name: "Onboarding", url: "http://127.0.0.1:3000/app/onboarding?preview=true" },
    { name: "Order Detail #1042", url: "http://127.0.0.1:3000/app/orders/849201?preview=true" },
  ];

  for (const r of routesToTest) {
    console.log(`\nTesting ${r.name} (${r.url})...`);
    const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${r.url}`, { method: "PUT" });
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
        const text = d.params.args.map((a) => a.value || a.description || "").join(" ");
        consoleErrors.push(text);
      }
      if (d.method === "Network.responseReceived" && d.params.response.status >= 400) {
        networkErrors.push(`${d.params.response.status} ${d.params.response.url}`);
      }
    });

    function send(method, params = {}) {
      return new Promise((res, rej) => {
        const cur = id++;
        pending.set(cur, { res, rej });
        ws.send(JSON.stringify({ id: cur, method, params }));
      });
    }

    await new Promise((res) => ws.once("open", res));
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");

    await sleep(3500);

    const evalRes = await send("Runtime.evaluate", {
      expression: `
        (() => {
          const h1 = document.querySelector('h1')?.innerText || '';
          const h2 = document.querySelector('h2')?.innerText || '';
          const heading = h1 || h2 || '';
          const isErrorPage = document.body.innerText.includes('Diagnostic & Recovery Portal') || document.body.innerText.includes('HTTP 410');
          const hasGradients = document.body.innerHTML.includes('#1e1b4b');
          const hasMoonEmoji = document.body.innerHTML.includes('🌙');
          return {
            title: document.title,
            heading,
            isErrorPage,
            hasGradients,
            hasMoonEmoji,
            textSnippet: document.body.innerText.slice(0, 150).replace(/\\n/g, ' ')
          };
        })()
      `,
      returnByValue: true,
    });

    const info = evalRes.result?.value;
    console.log(`Heading: "${info?.heading}"`);
    console.log(`Is Error Page (410): ${info?.isErrorPage}`);
    console.log(`Has Indie Gradients: ${info?.hasGradients}`);
    console.log(`Has Moon Emoji: ${info?.hasMoonEmoji}`);
    console.log(`Console Errors: ${consoleErrors.length} ->`, consoleErrors.slice(0, 2));
    console.log(`Network Errors: ${networkErrors.length} ->`, networkErrors.slice(0, 2));

    const shot = await send("Page.captureScreenshot", { format: "png" });
    const outName = `phase1_verified_${r.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}.png`;
    fs.writeFileSync(path.join(process.cwd(), "screenshots", "audit", outName), Buffer.from(shot.data, "base64"));
    console.log(`Saved screenshot: ${outName} (${shot.data.length} bytes base64)`);

    ws.close();
  }

  chromeProc.kill();
  console.log("\n✅ Phase 1 Live Browser Verification Complete!");
}

verify().catch((e) => {
  console.error("Verification failed:", e);
  process.exit(1);
});

