import ts from "typescript";

const configPath = ts.findConfigFile(
  "./",
  ts.sys.fileExists,
  "tsconfig.json"
);
if (!configPath) {
  throw new Error("Could not find a valid 'tsconfig.json'.");
}

const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
const parsedConfig = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  "./"
);
const program = ts.createProgram({
  rootNames: parsedConfig.fileNames,
  options: parsedConfig.options
});
const diagnostics = ts.getPreEmitDiagnostics(program);

const filtered = diagnostics.filter(diag => {
  if (diag.file) {
    return !diag.file.fileName.includes(".react-router") && !diag.file.fileName.includes("node_modules");
  }
  return true;
});

const files = program.getSourceFiles().map(f => f.fileName);
const appFiles = files.filter(f => f.includes("app/"));

console.log(`Total source files compiled: ${files.length}`);
console.log(`App files compiled: ${appFiles.length}`);
console.log(`Sample app files:`, appFiles.slice(0, 10));

console.log(`Found ${filtered.length} filtered diagnostics (outside node_modules and .react-router):`);
for (const diag of filtered) {
  if (diag.file) {
    const { line, character } = ts.getLineAndCharacterOfPosition(diag.file, diag.start);
    const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
    console.log(`${diag.file.fileName} (${line + 1},${character + 1}): ${message}`);
  } else {
    console.log(ts.flattenDiagnosticMessageText(diag.messageText, "\n"));
  }
}
