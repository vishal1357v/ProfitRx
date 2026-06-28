import fs from "fs";
const content = fs.readFileSync("node_modules/@prisma/client/index.d.ts", "utf8");
console.log(content);
