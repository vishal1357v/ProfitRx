import fs from "node:fs";
import path from "node:path";

function scan(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory() && !["node_modules", ".git", "build"].includes(ent.name)) {
      scan(full);
    } else if (ent.name.endsWith(".tsx") || ent.name.endsWith(".ts")) {
      const content = fs.readFileSync(full, "utf-8");
      const lines = content.split("\n");
      lines.forEach((l, i) => {
        if (l.includes("$EV$") || l.includes("\\(") || l.includes("$ROAS") || l.includes("$P&L") || l.includes("\\text{")) {
          console.log(`${path.relative(process.cwd(), full)}:${i + 1} -> ${l.trim().slice(0, 120)}`);
        }
      });
    }
  }
}

scan(path.join(process.cwd(), "app"));

