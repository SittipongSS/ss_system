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
const runtimeJsFiles = files.filter((file) => /\.(?:js|jsx|mjs)$/.test(file) && !/\.test\.mjs$/.test(file));
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
const smoothedLineViolations = [];
const nativeFeedbackViolations = [];
const tableContractViolations = [];
const chartContractViolations = [];
for (const file of uiFiles) {
  const rel = relative(file);
  const source = withoutBlockComments(fs.readFileSync(file, "utf8"));
  if (/\btype\s*=\s*["'](?:monotone|basis|natural)["']/.test(source)) {
    smoothedLineViolations.push(rel);
  }
  if (source.includes("<table") && !source.includes("<TableScroll")) {
    tableContractViolations.push(rel);
  }
  if (source.includes("<ResponsiveContainer") && !source.includes("<ChartCanvas")) {
    chartContractViolations.push(rel);
  }
  if (colorAllowList.some((allowed) => rel === allowed || rel.startsWith(allowed))) continue;
  source.split(/\r?\n/).forEach((line, index) => {
    if (line.trimStart().startsWith("//")) return;
    const colors = line.match(/#[0-9a-f]{3,8}\b/gi);
    if (colors) rawColorViolations.push(`${rel}:${index + 1} ${colors.join(", ")}`);
  });
}

for (const file of runtimeJsFiles) {
  const rel = relative(file);
  const source = withoutBlockComments(fs.readFileSync(file, "utf8"));
  source.split(/\r?\n/).forEach((line, index) => {
    if (line.trimStart().startsWith("//")) return;
    if (/\bwindow\.(?:alert|confirm)\s*\(|(?<![\w.])(?:alert|confirm)\s*\(/.test(line)) {
      nativeFeedbackViolations.push(`${rel}:${index + 1}`);
    }
  });
}

/* คลาสที่ "ดูเหมือนของระบบ" แต่ไม่มี selector อยู่จริงใน globals.css — เขียนแล้ว
   ช่องกรอก/ปุ่มจะไม่มีสไตล์เลย และไม่มีอะไรฟ้อง (ของจริงที่เคยเกิด: ปุ่มลบเคยเป็น
   ปุ่มเทา และช่องเหตุผลปิดโครงการเคยเป็นตัวอักษรเกือบดำบนพื้นมืด = อ่านไม่ออก)
   ตั้งใจตรวจแบบ blocklist ไม่ใช่ไล่เทียบทุกคลาส เพราะโค้ดปน Tailwind utility
   (p-2, col-span-2) กับ CSS module อยู่ — ไล่เทียบทั้งหมดจะ false positive ท่วม
   เจอคลาสตายตัวใหม่เมื่อไหร่ เติมเข้าลิสต์นี้ */
const deadClasses = [
  { pattern: /className="input"/, dead: "input", use: "premium-input" },
  { pattern: /className="btn danger"/, dead: "btn danger", use: "btn btn-danger" },
];

const deadClassViolations = [];
for (const file of uiFiles) {
  const rel = relative(file);
  const source = withoutBlockComments(fs.readFileSync(file, "utf8"));
  source.split(/\r?\n/).forEach((line, index) => {
    if (line.trimStart().startsWith("//")) return;
    for (const { pattern, dead, use } of deadClasses) {
      if (pattern.test(line)) deadClassViolations.push(`${rel}:${index + 1} "${dead}" → use "${use}"`);
    }
  });
}

const shellPattern = /components\/ui\/(?:Workspace|DetailPage)|salesPlanning\/SaWorkspace|<Workspace\b|<SaWorkspace\b|<SaPageShell\b|premium-header|home-hub|login-/;
const redirectPagePattern = /from\s+["']next\/navigation["'][\s\S]*\bredirect\s*\(/;
const visualPageFiles = pageFiles.filter((file) => !redirectPagePattern.test(fs.readFileSync(file, "utf8")));
const shellPages = visualPageFiles.filter((file) => shellPattern.test(fs.readFileSync(file, "utf8")));
const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const forbiddenMaterialPackages = ["@material/web", "material-components-web", "materialize-css"]
  .filter((name) => packageJson.dependencies?.[name] || packageJson.devDependencies?.[name]);

const legacySalesModule = files.some((file) => relative(file) === "src/components/salesPlanning/SaWorkspace.module.css");
const removedCompatibilityFiles = [
  "src/components/excise/Pager.js",
  "src/components/salesPlanning/SaWorkspace.js",
  "src/components/salesPlanning/SalesDetailOverview.js",
  "src/components/salesPlanning/SalesDetailOverview.module.css",
].filter((file) => fs.existsSync(path.join(root, file)));
const legacyCompatibilityImports = [];
for (const file of runtimeJsFiles) {
  const rel = relative(file);
  const source = fs.readFileSync(file, "utf8");
  if (/components\/excise\/Pager|salesPlanning\/(?:SaWorkspace|SalesDetailOverview)/.test(source)) {
    legacyCompatibilityImports.push(rel);
  }
}
const failures = [
  ...(shellPages.length !== visualPageFiles.length
    ? [`design-shell coverage incomplete: ${shellPages.length}/${visualPageFiles.length} visual routes`]
    : []),
  ...rawColorViolations.map((item) => `raw color outside design tokens: ${item}`),
  ...deadClassViolations.map((item) => `dead CSS class (no selector in globals.css): ${item}`),
  ...smoothedLineViolations.map((item) => `smoothed chart line bypasses chartTheme contract: ${item}`),
  ...nativeFeedbackViolations.map((item) => `native alert/confirm bypasses feedback foundation: ${item}`),
  ...tableContractViolations.map((item) => `table bypasses TableScroll contract: ${item}`),
  ...chartContractViolations.map((item) => `chart bypasses ChartCanvas contract: ${item}`),
  ...forbiddenMaterialPackages.map((item) => `forbidden Material dependency: ${item}`),
  ...(legacySalesModule ? ["sales-only workspace stylesheet still exists"] : []),
  ...removedCompatibilityFiles.map((item) => `removed compatibility file returned: ${item}`),
  ...legacyCompatibilityImports.map((item) => `legacy compatibility import returned: ${item}`),
];

console.log(`UI audit: ${pageFiles.length} routes (${visualPageFiles.length} visual, ${pageFiles.length - visualPageFiles.length} redirect)`);
console.log(`Design-shell coverage: ${shellPages.length}/${visualPageFiles.length} visual routes`);
console.log(`Runtime raw-color violations: ${rawColorViolations.length}`);
console.log(`Dead CSS class usages: ${deadClassViolations.length}`);
console.log(`Direct smoothed-line violations: ${smoothedLineViolations.length}`);
console.log(`Native feedback violations: ${nativeFeedbackViolations.length}`);
console.log(`Table contract violations: ${tableContractViolations.length}`);
console.log(`Chart contract violations: ${chartContractViolations.length}`);

if (failures.length) {
  console.error("\nUI audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("UI audit passed: runtime UI uses the central token and shell contracts.");
}
