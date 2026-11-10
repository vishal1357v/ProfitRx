async function checkAll() {
  const routes = [
    "/app/dashboard?preview=true",
    "/app/operations?preview=true",
    "/app/cod-rules?preview=true",
    "/app/rto-heatmap?preview=true",
    "/app/customer-risk?preview=true",
    "/app/rto?preview=true",
    "/app/cogs?preview=true",
    "/app/profit-leaks?preview=true",
    "/app/roas?preview=true",
    "/app/reports?preview=true",
    "/app/settings?preview=true",
    "/app/billing?preview=true",
    "/app/pricing?preview=true",
    "/app/alerts?preview=true",
    "/app/health?preview=true",
    "/app/onboarding?preview=true",
    "/app/orders/849201?preview=true",
  ];

  for (const r of routes) {
    const res = await fetch("http://127.0.0.1:3000" + r);
    const html = await res.text();
    const hasEV = html.includes("$EV$");
    const hasBackslashParen = html.includes("\\(") || html.includes("\\)");
    const hasKaTeX = html.includes("katex") || html.includes("\\frac");
    console.log(`${r}: status=${res.status}, hasEV=${hasEV}, hasBackslashParen=${hasBackslashParen}, hasKaTeX=${hasKaTeX}`);
  }
}
checkAll();
