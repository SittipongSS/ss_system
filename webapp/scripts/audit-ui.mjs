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
import { DEAD_CLASSES } from "./uiDeadClasses.mjs";

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

/* หนี้เก่า: prompt() ที่ยังไม่ได้แปลงเป็นกล่องกรอกของระบบ — โผล่มาตอนเติม prompt เข้า
   ตัวตรวจ (2026-07-28) และตั้งใจแยกออกจากงานหน้าโครงการ ตัวเลข = จำนวนจุดที่ยอมให้เหลือ
   ต่อไฟล์ นับเป็น "เพดาน" แบบเดียวกับชั้นสไตล์เก่า: มากกว่านี้ = เพิ่มของใหม่ → ตก,
   น้อยกว่า = แปลงแล้ว → ลดเลขลง (ไม่ยอมให้ทิ้งตัวเลขค้างไว้เกินจริง)
   ⚠️ ห้ามเติมไฟล์ใหม่เข้าลิสต์นี้เพื่อให้ audit ผ่าน — ของใหม่ใช้ ReasonDialog
   (ขอเหตุผล) หรือ ConfirmDialog (ยืนยัน) ดูตัวอย่างที่ /settings/design-preview */
const nativeFeedbackDebt = {
  "src/app/database/customers/page.js": 1, // เหตุผลไม่อนุมัติลูกค้า (ยังไม่บังคับกรอก)
  "src/app/database/products/page.js": 1, // เหตุผลไม่อนุมัติสินค้า (ยังไม่บังคับกรอก)
  "src/components/mgmt/DocsPanel.js": 2, // ลิงก์ + ชื่อ Google Doc/Sheet (โมดูลงานบริหารที่พักไว้)
};

const rawColorViolations = [];
const typeScaleViolations = [];
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
  /* ชั้นขนาดตัวอักษรต้องมาจากโทเคนเท่านั้น — เขียน px เองแล้วแก้ทั้งระบบทีเดียวไม่ได้
     (ตรวจ 2026-07-29: มี 521 จุดเขียนเลขดิบใน 22 ค่า ขณะที่โทเคนถูกอ้างแค่ 7 จุด)
     globals.css เป็นที่ประกาศขั้นจึงยกเว้น — ที่อื่นห้ามหมด */
  if (rel !== "src/app/globals.css") {
    source.split(/\r?\n/).forEach((line, index) => {
      const raw = line.match(/font-size:\s*[0-9.]+px/);
      if (raw) typeScaleViolations.push(`${rel}:${index + 1} ${raw[0]} → var(--fs-…)`);
    });
  }

  if (colorAllowList.some((allowed) => rel === allowed || rel.startsWith(allowed))) continue;
  source.split(/\r?\n/).forEach((line, index) => {
    if (line.trimStart().startsWith("//")) return;
    const colors = line.match(/#[0-9a-f]{3,8}\b/gi);
    if (colors) rawColorViolations.push(`${rel}:${index + 1} ${colors.join(", ")}`);
  });
}

const staleNativeFeedbackDebt = [];
const nativeFeedbackHits = new Map(); // rel -> ["rel:line", ...]
for (const file of runtimeJsFiles) {
  const rel = relative(file);
  const source = withoutBlockComments(fs.readFileSync(file, "utf8"));
  source.split(/\r?\n/).forEach((line, index) => {
    if (line.trimStart().startsWith("//")) return;
    // prompt() ก็นับด้วย — window.prompt เคยหลุดอยู่ในหน้าโครงการเพราะ regex ตรวจแค่ alert/confirm
    if (/\bwindow\.(?:alert|confirm|prompt)\s*\(|(?<![\w.])(?:alert|confirm|prompt)\s*\(/.test(line)) {
      if (!nativeFeedbackHits.has(rel)) nativeFeedbackHits.set(rel, []);
      nativeFeedbackHits.get(rel).push(`${rel}:${index + 1}`);
    }
  });
}
// นับเทียบเพดานต่อไฟล์ — เกิน = ของใหม่, ต่ำกว่า = แปลงแล้วแต่ลืมลดเลข
for (const [rel, hits] of nativeFeedbackHits) {
  const allowed = nativeFeedbackDebt[rel] || 0;
  if (hits.length > allowed) {
    nativeFeedbackViolations.push(allowed
      ? `${rel} — เจอ ${hits.length} จุด (${hits.map((h) => h.split(":")[1]).join(", ")}) เพดานหนี้เก่า ${allowed}`
      : hits.join(", "));
  }
}
for (const [rel, allowed] of Object.entries(nativeFeedbackDebt)) {
  const found = nativeFeedbackHits.get(rel)?.length || 0;
  if (found < allowed) {
    staleNativeFeedbackDebt.push(`${rel} — เหลือจริง ${found} จุด แต่ nativeFeedbackDebt ยังเขียน ${allowed} (ลดเลขลงใน scripts/audit-ui.mjs)`);
  }
}

/* คลาสที่ "ดูเหมือนของระบบ" แต่ไม่มี selector อยู่จริงใน globals.css — เขียนแล้ว
   ช่องกรอก/ปุ่มจะไม่มีสไตล์เลย และไม่มีอะไรฟ้อง (ของจริงที่เคยเกิด: ปุ่มลบเคยเป็น
   ปุ่มเทา และช่องเหตุผลปิดโครงการเคยเป็นตัวอักษรเกือบดำบนพื้นมืด = อ่านไม่ออก)
   ตั้งใจตรวจแบบ blocklist ไม่ใช่ไล่เทียบทุกคลาส เพราะโค้ดปน Tailwind utility
   (p-2, col-span-2) กับ CSS module อยู่ — ไล่เทียบทั้งหมดจะ false positive ท่วม
   เจอคลาสตายตัวใหม่เมื่อไหร่ เติมเข้าลิสต์นี้ */
const deadClasses = DEAD_CLASSES;

/* คลาสที่เป็น "กล่องครอบ" ไม่ใช่คลาสของ control — ใส่ผิดที่แล้วสไตล์ยังติดบางส่วน
   จึงไม่มีใครเห็นว่าพลาด (ของจริงที่เคยเกิด: ทะเบียนกลิ่น/สูตร ใส่ .search-glass ที่
   <input> ตรง ๆ → ได้ช่องค้นหาที่ "ไม่มีแว่นขยาย" เพราะ gap ของ flex ไม่มีลูกให้วาง
   ผู้ใช้ส่งภาพมาบอกว่าไอคอนหาย 2026-07-28)
   ต้องตรวจข้ามบรรทัด — ของจริงเขียน <input ขึ้นบรรทัดหนึ่งแล้ว className อีกบรรทัด
   ([^>]* กินขึ้นบรรทัดใหม่ได้ ต่างจาก .* ที่หยุดที่ท้ายบรรทัด) */
const wrapperOnlyClasses = [
  { name: "search-glass", use: "<div className=\"search-glass\"> ครอบ <Search/> + <input>" },
];

const wrapperClassViolations = [];
for (const file of uiFiles) {
  const rel = relative(file);
  const source = withoutBlockComments(fs.readFileSync(file, "utf8"));
  for (const { name, use } of wrapperOnlyClasses) {
    const pattern = new RegExp(`<(?:input|textarea|select)\\b[^>]*className="[^"]*\\b${name}\\b`, "g");
    for (const match of source.matchAll(pattern)) {
      const line = source.slice(0, match.index).split(/\r?\n/).length;
      wrapperClassViolations.push(`${rel}:${line} "${name}" เป็นคลาสของกล่องครอบ → ${use}`);
    }
  }
}

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
  ...typeScaleViolations.map((item) => `font-size นอกชั้นพิมพ์กลาง: ${item}`),
  ...deadClassViolations.map((item) => `dead CSS class (no selector in globals.css): ${item}`),
  ...wrapperClassViolations.map((item) => `คลาสกล่องครอบถูกใส่ที่ control โดยตรง: ${item}`),
  ...smoothedLineViolations.map((item) => `smoothed chart line bypasses chartTheme contract: ${item}`),
  ...nativeFeedbackViolations.map((item) => `native alert/confirm/prompt bypasses feedback foundation: ${item}`),
  ...staleNativeFeedbackDebt.map((item) => `หนี้ prompt() เก่าลดได้แล้ว — รูดเพดาน nativeFeedbackDebt ลง: ${item}`),
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
console.log(`Type-scale violations (font-size นอกโทเคน): ${typeScaleViolations.length}`);
console.log(`Dead CSS class usages: ${deadClassViolations.length}`);
console.log(`Wrapper-only class on a control: ${wrapperClassViolations.length}`);
console.log(`Direct smoothed-line violations: ${smoothedLineViolations.length}`);
const nativeFeedbackDebtTotal = Object.values(nativeFeedbackDebt).reduce((sum, n) => sum + n, 0);
console.log(`Native feedback violations: ${nativeFeedbackViolations.length} (หนี้ prompt() เก่าที่ยกเว้นไว้ ${nativeFeedbackDebtTotal} จุด)`);
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
