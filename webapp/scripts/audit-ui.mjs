import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = process.cwd();
const srcRoot = path.join(root, "src");
const appRoot = path.join(srcRoot, "app");

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function relative(file) {
  return path.relative(root, file).replaceAll("\\", "/");
}

function withoutBlockComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "");
}

const files = walk(srcRoot);
const pageFiles = files.filter((file) => path.basename(file) === "page.js");
const uiFiles = files.filter((file) => /\.(?:js|css)$/.test(file) && (
  file.startsWith(appRoot) || file.startsWith(path.join(srcRoot, "components"))
));

const colorAllowList = [
  "src/app/globals.css",
  "src/components/documents/",
  "src/app/settings/document-standards/quotation-preview/page.module.css",
];

const rawColorViolations = [];
for (const file of uiFiles) {
  const rel = relative(file);
  if (colorAllowList.some((allowed) => rel === allowed || rel.startsWith(allowed))) continue;
  const source = withoutBlockComments(fs.readFileSync(file, "utf8"));
  source.split(/\r?\n/).forEach((line, index) => {
    if (line.trimStart().startsWith("//")) return;
    const colors = line.match(/#[0-9a-f]{3,8}\b/gi);
    if (colors) rawColorViolations.push(`${rel}:${index + 1} ${colors.join(", ")}`);
  });
}

const shellPattern = /components\/ui\/(?:Workspace|DetailPage)|salesPlanning\/SaWorkspace|<Workspace\b|<SaWorkspace\b|<SaPageShell\b|premium-header|home-hub|login-/;
const shellPages = pageFiles.filter((file) => shellPattern.test(fs.readFileSync(file, "utf8")));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const forbiddenMaterialPackages = ["@material/web", "material-components-web", "materialize-css"]
  .filter((name) => packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]);

const legacySalesModule = files.some((file) => relative(file) === "src/components/salesPlanning/SaWorkspace.module.css");
const failures = [
  ...(shellPages.length !== pageFiles.length
    ? [`design-shell coverage incomplete: ${shellPages.length}/${pageFiles.length} routes`]
    : []),
  ...rawColorViolations.map((item) => `raw color outside design tokens: ${item}`),
  ...forbiddenMaterialPackages.map((item) => `forbidden Material dependency: ${item}`),
  ...(legacySalesModule ? ["sales-only workspace stylesheet still exists"] : []),
];

console.log(`UI audit: ${pageFiles.length} routes`);
console.log(`Design-shell coverage: ${shellPages.length}/${pageFiles.length} routes`);
console.log(`Runtime raw-color violations: ${rawColorViolations.length}`);

if (failures.length) {
  console.error("\nUI audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("UI audit passed: runtime UI uses the central token and shell contracts.");
}
