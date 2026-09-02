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
      /* คำร้องข้ามฝ่าย (mig 0173) — เดิมคือ `components/materials/AskForm|AskQueuePanel`
         หน้าจอของมันอยู่ที่ `src/app/sa/requests/` = สายขายเหมือนเดิม ไม่ได้ย้ายเจ้าของ
         ⚠️ ถ้าไม่ประกาศตรงนี้ ตะแกรงท้ายสุด `shared` จะรับไป แล้ว ratchet จะอ่านการ
         **ย้ายไดเรกทอรี** เป็น "sales ลดลง + shared เพิ่มขึ้น" = ตกสองฝั่งพร้อมกัน
         ทั้งที่ไม่มีใครเขียนชั้นเก่าเพิ่มสักบรรทัด (เกิดจริงตอน merge #786) */
      "src/components/requests/",
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
   rawButtonClass: สตริงที่มีคลาส btn — ต้องยุบเข้า components/ui/Button.js (ยังไม่มี)
   rawInputClass : สตริงที่มี premium-input / premium-select — ต้องยุบเข้า
                   components/ui/Input.js กับ components/ui/Select.js

   ⚠️ metric ตัวหลังเพิ่ม 2026-07-29 ตอนสร้าง Input.js: ปุ่มมี ratchet มาตั้งแต่ #761
   แต่ช่องกรอกไม่เคยมีเลย ทั้งที่ใช้พอกัน (224 + 43 จุด) = เขียนคลาสดิบเพิ่มได้เรื่อย ๆ
   โดยไม่มีอะไรฟ้อง · **ไม่รวม `.textarea-premium`** (17 จุด) โดยเจตนา — คลาสนั้นเป็น
   กล่องวางข้อมูลดิบคนละงานกับช่องกรอกฟอร์ม และยังไม่มี primitive ให้ย้ายไป
   การนับสิ่งที่ไม่มีปลายทางจะได้เลขที่ลดไม่ได้ */
export const METRICS = ["legacyTable", "legacySurface", "inlineStyle", "rawButtonClass", "rawInputClass"];

/* export เพื่อให้เทสต์ยิงกฎตัวจริงได้ ไม่ใช่ก๊อป regex ไปเขียนซ้ำแล้วเพี้ยนจากกัน */
export const PATTERNS = {
  legacyTable: /\b(?:premium-glass-table|premium-table-wrapper|premium-table|fz-table)\b/g,
  legacySurface: /\b(?:glass-panel|premium-card)\b/g,
  inlineStyle: /style=\{\{/g,
  /* `(?<![\w-])` กันคลาสที่ลงท้ายด้วย -btn ของ component อื่น (`tab-btn`, `action-btn`)
     ไม่ให้ถูกนับเป็นคลาสปุ่มดิบ — ของพวกนั้นมี selector ของตัวเองไม่ใช่ตระกูล .btn */
  rawButtonClass: /(["'`])[^"'`\n]*(?<![\w-])btn\b[^"'`\n]*\1/g,
  /* `(?<![\w-])` กันคลาสอื่นที่ลงท้ายด้วยชื่อเดียวกันไม่ให้ถูกนับ
     2026-07-30: เพิ่ม `textarea-premium` เข้ามา — เดิมยกเว้นไว้เพราะ "ยังไม่มี
     primitive ให้ย้ายไป" (การนับสิ่งที่ไม่มีปลายทางจะได้เลขที่ลดไม่ได้) ตอนนี้มี
     `components/ui/Textarea.js` (`variant="data"`) รับแล้ว จึงนับได้เต็มตัว */
  rawInputClass: /(["'`])[^"'`\n]*(?<![\w-])(?:premium-(?:input|select)|textarea-premium)\b[^"'`\n]*\1/g,
};

/* ยกเว้น src/lib ทั้งชั้น — **นี่คือสมาชิกเดียวที่ทำงานจริง** (487 ไฟล์)
   ตัวประกอบเอกสารพิมพ์อยู่ในนั้นและประกอบสไตล์เป็นสตริงเอง เครื่องพิมพ์ไม่เห็น globals.css
   ⚠️ ชื่อ EXEMPT ชวนให้คิดว่ายกเว้นแค่เอกสารพิมพ์ ความจริงคือยกเว้น src/lib ทั้งชั้น
   จะแคบขอบเขตให้ตรงเจตนาเมื่อไหร่ ต้องวัดก่อนว่ากระทบตัวเลขของโมดูลไหนบ้าง

   ลบออก 2026-09-02 สองตัวเพราะยกเว้นศูนย์ไฟล์ (วัดแล้วทั้งคู่ = 0 จาก 1,284 ไฟล์):
     · "src/components/documents/" — โฟลเดอร์ปลดระวางไปแล้ว (2a2eed0b)
     · "scripts/" — countLegacyUsage รับ files ที่เดินมาจาก src/ เท่านั้น (audit-ui.mjs:824)
       พาธจึงขึ้นต้น "src/" เสมอ ไม่มีทางขึ้นต้น "scripts/" · เจตนาที่คอมเมนต์เดิมอ้าง
       ("สคริปต์ตรวจเองต้องเขียนชื่อคลาสเก่า") ถูกทำโดยบรรทัด `.test.mjs` ข้างล่างอยู่แล้ว */
const EXEMPT = [
  "src/lib/",
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
