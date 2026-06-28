import fs from "fs";
const content = fs.readFileSync("node_modules/.prisma/client/index.d.ts", "utf8");
const lines = content.split("\n");
const matches = lines.filter(l => l.includes("RTOEvent") || l.includes("rtoevent") || l.includes("RtoEvent"));
console.log("Total matching lines in types:", matches.length);
console.log("Sample matches:", matches.slice(0, 10));
