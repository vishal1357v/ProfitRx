import { ESLint } from "eslint";

const eslint = new ESLint();
eslint.lintFiles(["app/**/*.ts", "app/**/*.tsx"]).then(results => {
  let totalErrors = 0;
  let totalWarnings = 0;

  for (const result of results) {
    if (result.errorCount > 0 || result.warningCount > 0) {
      console.log(`File: ${result.filePath}`);
      for (const msg of result.messages) {
        console.log(`  [${msg.severity === 2 ? 'ERROR' : 'WARNING'}] Line ${msg.line}: ${msg.message} (${msg.ruleId})`);
        if (msg.severity === 2) totalErrors++;
        else totalWarnings++;
      }
    }
  }
  console.log(`Total ESLint: ${totalErrors} errors, ${totalWarnings} warnings`);
}).catch(err => {
  console.error(err);
});
