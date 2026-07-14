import fs from "node:fs";
import path from "node:path";

let cachedStyles = "";

export function getGlobalStyles(): string {
  if (cachedStyles) return cachedStyles;
  try {
    // Read the global.css file content dynamically on the server
    const cssPath = path.join(process.cwd(), "app", "styles", "global.css");
    cachedStyles = fs.readFileSync(cssPath, "utf8");
    return cachedStyles;
  } catch (err) {
    console.error("[styles.server] Failed to load global.css:", err);
    return "";
  }
}
