/* งบประมาณ "ชั้นสไตล์เก่า" ต่อโมดูล (ratchet)

   บทเรียน 2026-07-26: `audit:ui` เดิมตรวจแค่ว่า "หน้าเรียก primitive กลางหรือยัง"
   แต่ไม่เคยตรวจว่า "ของเก่าถูกลบหรือยัง" → `<TableScroll><table className="premium-table">`
   ผ่านฉลุย ทั้งที่กฎสองชุดตีกันบนหน้าจอจริง (57 จาก 63 ไฟล์ที่ใช้ TableScroll
   ยังมีคลาสตารางเก่าอยู่ข้างใน) งานย้ายมา design system กลางจึงดู "เสร็จ" ทั้งที่เพิ่ง
   วางชั้นใหม่ทับชั้นเก่าเฉย ๆ

   ไฟล์นี้แปลง "ชั้นเก่าที่เหลือ" เป็นตัวเลขต่อโมดูล แล้วล็อกไว้ใน
   `ui-legacy-budget.json` กติกาเดียว: **ตัวเลขขึ้นไม่ได้ ลงได้อย่างเดียว**
   - เกินเพดาน = PR กำลังสร้างชั้นถัดไป → audit ตก
   - ต่ำกว่าเพดาน = ลบของเก่าออกได้จริง → audit ตกเหมือนกัน จนกว่าจะรูดเพดานลงตาม
     (`npm run audit:ui -- --update-budget`) เพื่อไม่ให้ตัวเลขไหลกลับขึ้นเงียบ ๆ ทีหลัง

   ห้ามเพิ่ม path เข้า EXEMPT เพื่อให้ตัวเลขสวย — ทางเดียวที่ตัวเลขควรลดคือลบโค้ดเก่าจริง */

import fs from "node:fs";
import path from "node:path";

/* เรียงตามลำดับความสำคัญที่ผู้ใช้ระบุ (2026-07-26): บริหารงานขาย → สหมิตร →
   ฐานข้อมูล → ภาษีสรรพสามิต → งานบริหาร ที่เหลือเก็บกวาดทีหลัง
   จับคู่แบบ "อันแรกที่ตรงชนะ" → `shared` เป็นตะแกรงท้ายสุด */
export const MODULES = [
  {
    key: "sales",
    label: "บริหารงานขาย",
    paths: [
      "src/app/sales-planning/",
      "src/app/sa/",
      "src/components/salesPlanning/",
      "src/components/pm/",
      "src/components/costing/",
      "src/components/materials/",
      "src/components/updates/",
    ],
  },
  { key: "sahamit", label: "สหมิตร", paths: ["src/app/sahamit/", "src/components/sahamit/"] },
  {
    key: "database",
    label: "ฐานข้อมูล",
    paths: ["src/app/database/", "src/components/database/", "src/components/master/"],
  },
  {
    key: "tax",
    label: "ภาษีสรรพสามิต",
    paths: ["src/app/tax/", "src/components/tax/", "src/components/excise/"],
  },
  { key: "mgmt", label: "งานบริหาร", paths: ["src/app/mgmt/", "src/components/mgmt/"] },
  {
    key: "settings",
    label: "ตั้งค่า/ผู้ใช้",
    paths: [
      "src/app/settings/",
      "src/app/users/",
      "src/app/audit/",
      "src/app/account/",
      "src/components/account/",
    ],
  },
  { key: "shared", label: "ส่วนกลาง", paths: ["src/app/", "src/components/"] },
];

/* ตัวชี้วัด — เจตนาให้ "นับง่าย เถียงไม่ได้" ไม่ใช่ parse CSS จริง
   legacyTable   : คลาสตารางเก่า 4 ชุดที่ต้องยุบเข้า components/ui/Table.js
   legacySurface : พื้นผิว/การ์ดเก่าที่ต้องยุบเข้า Workspace + WorkspaceSection
   inlineStyle   : style={{...}} — ที่เป็น "สไตล์" ต้องออก เหลือเฉพาะค่าที่มาจากข้อมูล
   rawButtonClass: สตริงที่มีคลาส btn — ต้องยุบเข้า components/ui/Button.js (ยังไม่มี) */
export const METRICS = ["legacyTable", "legacySurface", "inlineStyle", "rawButtonClass"];

const PATTERNS = {
  legacyTable: /\b(?:premium-glass-table|premium-table-wrapper|premium-table|fz-table)\b/g,
  legacySurface: /\b(?:glass-panel|premium-card)\b/g,
  inlineStyle: /style=\{\{/g,
  /* `(?<![\w-])` กันคลาสที่ลงท้ายด้วย -btn ของ component อื่น (`tab-btn`, `action-btn`)
     ไม่ให้ถูกนับเป็นคลาสปุ่มดิบ — ของพวกนั้นมี selector ของตัวเองไม่ใช่ตระกูล .btn */
  rawButtonClass: /(["'`])[^"'`\n]*(?<![\w-])btn\b[^"'`\n]*\1/g,
};

/* เอกสารพิมพ์มี CSS ของตัวเองโดยเจตนา (เครื่องพิมพ์ไม่เห็น globals.css)
   และไฟล์ทดสอบ/สคริปต์ตรวจเองต้องเขียนชื่อคลาสเก่าเพื่อ "ตรวจว่ามันหายไปแล้ว" */
const EXEMPT = [
  "src/components/documents/",
  "src/lib/",
  "scripts/",
];

function toPosix(value) {
  return value.replaceAll("\\", "/");
}

function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split(/\r?\n/)
    .filter((line) => !line.trimStart().startsWith("//"))
    .join("\n");
}

function moduleOf(rel) {
  return MODULES.find((entry) => entry.paths.some((prefix) => rel.startsWith(prefix)))?.key;
}

function emptyCounts() {
  return Object.fromEntries(METRICS.map((metric) => [metric, 0]));
}

/** นับชั้นเก่าที่เหลือต่อโมดูล — คืน { [moduleKey]: { [metric]: number } } */
export function countLegacyUsage(root, files) {
  const counts = Object.fromEntries(MODULES.map((entry) => [entry.key, emptyCounts()]));
  for (const file of files) {
    if (!/\.(?:js|jsx)$/.test(file)) continue;
    const rel = toPosix(path.relative(root, file));
    if (EXEMPT.some((prefix) => rel.startsWith(prefix))) continue;
    if (/\.test\.mjs$/.test(rel)) continue;
    const key = moduleOf(rel);
    if (!key) continue;
    const source = stripComments(fs.readFileSync(file, "utf8"));
    for (const metric of METRICS) {
      counts[key][metric] += (source.match(PATTERNS[metric]) || []).length;
    }
  }
  return counts;
}

export function readBudget(budgetPath) {
  if (!fs.existsSync(budgetPath)) return null;
  return JSON.parse(fs.readFileSync(budgetPath, "utf8"));
}

export function writeBudget(budgetPath, counts) {
  const payload = {
    note: "เพดานชั้นสไตล์เก่าต่อโมดูล — ขึ้นไม่ได้ ลงได้อย่างเดียว ดู scripts/uiLegacyBudget.mjs",
    modules: counts,
  };
  fs.writeFileSync(budgetPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

/** เทียบของจริงกับเพดาน → { over: [], under: [] } */
export function compareBudget(counts, budget) {
  const over = [];
  const under = [];
  for (const { key, label } of MODULES) {
    for (const metric of METRICS) {
      const actual = counts[key][metric];
      const cap = budget?.modules?.[key]?.[metric];
      if (typeof cap !== "number") {
        over.push(`${label} · ${metric}: ไม่มีเพดานในไฟล์งบ (รัน --update-budget)`);
        continue;
      }
      if (actual > cap) over.push(`${label} · ${metric}: ${actual} > เพดาน ${cap}`);
      if (actual < cap) under.push(`${label} · ${metric}: ${actual} < เพดาน ${cap}`);
    }
  }
  return { over, under };
}
