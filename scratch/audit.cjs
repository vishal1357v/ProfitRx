const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log("=== Extractor Sizes ===");
const dir = 'app/services/order-features';
const extractorsDir = 'app/services/order-features/extractors';

function countLines(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content.split('\n').length;
}

[
  path.join(dir, 'types.ts'),
  path.join(dir, 'feature-confidence.calculator.ts'),
  path.join(dir, 'order-feature.service.ts'),
  path.join(extractorsDir, 'customer-feature.extractor.ts'),
  path.join(extractorsDir, 'pincode-feature.extractor.ts'),
  path.join(extractorsDir, 'merchant-feature.extractor.ts'),
  path.join(extractorsDir, 'financial-feature.extractor.ts')
].forEach(file => {
  const name = path.basename(file);
  console.log(`${name}: ${countLines(file)} lines`);
});

console.log("\n=== Feature Output ===");
try {
  const featureOutput = fs.readFileSync('scratch-output.json', 'utf-8');
  console.log(featureOutput.substring(0, 500) + '... (truncated)');
} catch (e) {
  console.log("Could not read scratch-output.json");
}
