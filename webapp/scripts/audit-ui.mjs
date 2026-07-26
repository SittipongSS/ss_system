import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import {
  MODULES,
  METRICS,
  countLegacyUsage,
  readBudget,
  writeBudget,
  compareBudget,
} from "./uiLegacyBudget.mjs";

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
  // TableShell ห่อ TableScroll ให้ในตัว (toolbar → ตาราง → ท้ายตาราง ในพาเนลเดียว)
  // จึงนับว่าอยู่ในสัญญาเดียวกัน
  if (source.includes("<table") && !source.includes("<TableScroll") && !source.includes("<TableShell")) {
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

/* แผงลอย (dropdown / เมนู / popover / ปฏิทิน / toast) ที่ลอยทับเนื้อหาอื่นต้องใช้
   พื้นผิวกลางอย่างใดอย่างหนึ่ง: var(--panel-float) ที่ทึบ 100% หรือพื้นกระจก
   var(--panel) **คู่กับ backdrop-filter** เท่านั้น — ใช้ --panel เปล่า ๆ จะเหลือความ
   โปร่ง 8% ให้ตัวอักษรข้างหลังลอดขึ้นมาปนกับรายการในแผง (ของจริง: dropdown เลือก
   ลูกค้าในหน้าสร้างใบเสนอราคา 2026-07-26 — ผู้ใช้ส่งภาพมา ทั้ง .ui-select-menu และ
   .ui-time-menu เป็นแบบนั้นมาตั้งแต่ต้น ส่วนปฏิทินของ DateInput แก้ไปก่อนแล้วด้วยสีทึบ) */
const floatingSurfaceViolations = [];
for (const file of files.filter((f) => f.endsWith(".css"))) {
  const rel = relative(file);
  const source = withoutBlockComments(fs.readFileSync(file, "utf8"));
  for (const block of source.split("}")) {
    const brace = block.indexOf("{");
    if (brace === -1) continue;
    const selector = block.slice(0, brace).split(/\r?\n/).filter(Boolean).pop()?.trim() || "";
    const body = block.slice(brace + 1);
    /* `position: sticky` ก็ลอยทับเนื้อหาเหมือนกัน — เดิมกฎนี้ตรวจแค่ fixed หรือ
       z-index ≥ 1000 แถบปุ่มท้ายโมดัล (sticky + z-index 5) จึงหลุดไปใช้ --panel
       แล้วช่องกรอกที่เลื่อนผ่านทะลุขึ้นมาปนกับปุ่ม (ผู้ใช้ส่งภาพมา 2026-07-27)
       ยกเว้นหัวตาราง/คอลัมน์ที่ตรึงไว้ ซึ่งใช้ --panel-2 อยู่แล้วจึงไม่เข้าเงื่อนไข */
    const floats = /position:\s*fixed/.test(body)
      || /position:\s*sticky/.test(body)
      || Number((body.match(/z-index:\s*(\d+)/) || [])[1] || 0) >= 1000;
    if (!floats) continue;
    if (!/background[^;]*var\(--panel\)/.test(body)) continue;
    if (/backdrop-filter/.test(body)) continue;
    floatingSurfaceViolations.push(`${rel} ${selector}`);
  }
}

/* CSS module ห้ามเอื้อมไปจัดการคลาสของชั้นเก่าใน globals.css ผ่าน `:global()`
   นั่นคือการ "เพิ่มชั้นทับ" เพื่อกลบอาการ แทนที่จะลบต้นเหตุ — ถ้าตารางที่อยู่ในการ์ด
   ไม่ควรมีกรอบซ้อน ให้ primitive รับ prop (เช่น surface="embedded") ไม่ใช่ให้ stylesheet
   ของ primitive ไปรู้จักชื่อคลาสเก่าเป็นราย ๆ (ของจริง: สาขา system-table-visual-parity
   2026-07-26 เพิ่ม `:global(.glass-panel) > .scroll` = ชั้นที่ 5 ทับชั้น 1–4) */
const crossLayerOverrideViolations = [];
for (const file of files.filter((f) => f.endsWith(".module.css"))) {
  const rel = relative(file);
  const source = withoutBlockComments(fs.readFileSync(file, "utf8"));
  source.split(/\r?\n/).forEach((line, index) => {
    const match = line.match(/:global\(\s*\.(premium-[\w-]+|glass-panel|fz-table)/);
    if (match) crossLayerOverrideViolations.push(`${rel}:${index + 1} :global(.${match[1]})`);
  });
}

/* ratchet ชั้นเก่า — ดูเหตุผลเต็มใน scripts/uiLegacyBudget.mjs */
const budgetPath = path.join(root, "scripts", "ui-legacy-budget.json");
const legacyCounts = countLegacyUsage(root, files);
if (process.argv.includes("--update-budget")) {
  writeBudget(budgetPath, legacyCounts);
  console.log(`เขียนเพดานใหม่ลง ${relative(budgetPath)} แล้ว`);
}
const budget = readBudget(budgetPath);
const { over: budgetOver, under: budgetUnder } = compareBudget(legacyCounts, budget);

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
  ...floatingSurfaceViolations.map((item) => `floating panel needs var(--panel-float) or backdrop-filter: ${item}`),
  ...crossLayerOverrideViolations.map((item) => `CSS module overrides a legacy global class instead of removing it: ${item}`),
  ...budgetOver.map((item) => `legacy budget exceeded — PR นี้เพิ่มชั้นเก่า: ${item}`),
  ...budgetUnder.map((item) => `legacy budget ลดได้แล้ว — รูดเพดานลงด้วย \`npm run audit:ui -- --update-budget\`: ${item}`),
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
console.log(`Floating surface violations: ${floatingSurfaceViolations.length}`);
console.log(`Cross-layer :global() overrides: ${crossLayerOverrideViolations.length}`);
console.log("\nชั้นสไตล์เก่าที่เหลือ (เพดาน = ขึ้นไม่ได้ ลงได้อย่างเดียว):");
console.log(`  ${"โมดูล".padEnd(16)}${METRICS.map((metric) => metric.padStart(15)).join("")}`);
for (const { key, label } of MODULES) {
  const cells = METRICS.map((metric) => {
    const actual = legacyCounts[key][metric];
    const cap = budget?.modules?.[key]?.[metric];
    return `${actual}/${cap ?? "-"}`.padStart(15);
  });
  console.log(`  ${label.padEnd(16)}${cells.join("")}`);
}
console.log("");

if (failures.length) {
  console.error("\nUI audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log("UI audit passed: runtime UI uses the central token and shell contracts.");
}
