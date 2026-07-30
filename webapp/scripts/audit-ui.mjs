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
import { countOrphanCss } from "./uiOrphanCss.mjs";

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

/* ระยะห่างที่ยังเป็นเลขดิบ — เพดานรวม ไม่ใช่รายไฟล์ (ตรวจ 2026-07-29: ระยะห่างใน
   CSS 1,418 จุด กระจาย 37 ค่า = แทบทุกจำนวนเต็ม 1–28 จึงไม่มีจังหวะร่วมให้ยึด)

   รอบแรก (#828) แปลงเฉพาะจุดที่ **ตรงกริด 4px อยู่แล้ว** เข้าโทเคน `--space-*`
   เพื่อให้หน้าตาไม่ขยับแม้แต่พิกเซลเดียว (มติผู้ใช้ 2026-07-30) — ที่เหลือคือค่านอก
   กริด (10px 165 · 14px 106 · 6px 86 · 2px 84 · 18px 83 · …) ซึ่งการดูดเข้ากริดคือ
   การขยับเลย์เอาต์จริง ต้องมีคนเปิดหน้าดูทีละจอ

   กติกาเดียวกับ ratchet ชั้นสไตล์เก่า: **ขึ้นไม่ได้ ลงได้อย่างเดียว** เก็บค่านอกกริด
   เพิ่ม = ตก · ดูดเข้ากริดแล้วลืมลดเลข = ตกเหมือนกัน
   ⚠️ ห้ามขยับเลขนี้ขึ้นเพื่อให้ audit ผ่าน — ทางเดียวที่ควรขยับคือลง

   793 → 736 → 723 (2026-07-30): ลบกฎ CSS ที่ไม่มีใครเรียกออกจาก globals.css 254 rule
   ค่านอกกริด 57 จุดในนั้นหายไปด้วย — ไม่ได้ "ดูดเข้ากริด" แต่เป็นหนี้ที่ไม่มีอยู่จริง
   ตั้งแต่แรกเพราะไม่มี element ไหนกินกฎพวกนั้น */
const RAW_SPACING_CAP = 723;

/* จำนวน **ค่าจุดตัดจอที่ต่างกัน** ในไฟล์ CSS — เพดาน ขึ้นไม่ได้ ลงได้อย่างเดียว

   ตรวจ 2026-07-29: มี 24 ค่า รวมคู่ที่ห่างกัน 1–8px (760/767/768) ซึ่งเป็นการพิมพ์
   ต่างกันมากกว่าเป็นการตัดสินใจ — ยุบเหลือ 768 แล้วจึงเหลือ 22

   🪤 ชั้นนี้ทำเป็นโทเคนไม่ได้ (custom property ใช้ใน media query ไม่ได้ตามสเปก)
   จึงล็อกที่ **จำนวนค่า** แทนการบังคับให้อ้างตัวแปร — กันไม่ให้ใครเพิ่มค่าที่ 23
   ส่วนการยุบค่าที่เหลือคือการเปลี่ยนจุดที่เลย์เอาต์สลับ ต้องมีคนเปิดหน้าจริงดู

   22 → 21 (2026-07-30): ค่าหนึ่งอยู่ใน @media ของกฎที่ไม่มีใครเรียกแล้ว หายไปพร้อม
   การลบ CSS กำพร้า ไม่ได้เกิดจากการยุบจุดตัดจอจริง */
const BREAKPOINT_CAP = 21;

/* ความสูงบรรทัดที่ยังเป็นเลขดิบ — เพดานรวม กติกาเดียวกับ RAW_SPACING_CAP

   ค่าที่ตรงขั้น `--lh-*` เป๊ะถูกยกเข้าโทเคนหมดแล้ว (2026-07-30) ที่เหลือคือค่าที่
   อยู่ระหว่างขั้น: 1.55 ×9 · 1.4 ×7 · 1.35 ×7 · 1.7 ×3 · 1.25 ×3 · 1.65 ×3 · 1.1 · 1.3
   การดูดเข้าขั้นคือ **ปรับดีไซน์จริง** ไม่ใช่เก็บกวาด — ความสูงบรรทัดคูณด้วยจำนวน
   บรรทัด ยิ่งกล่องข้อความยาวยิ่งขยับเยอะ ต้องมีคนเปิดหน้าดูทีละจอ
   (บทเรียนเดียวกับรอบระยะห่าง: เคยคิดว่า "ห่างนิดเดียวมองไม่เห็น" แล้ววัดจริง
   ได้ 113 จาก 126 element ขยับ)

   ⚠️ 6 จุดในนี้ต่ำกว่า 1.45 (1.1 · 1.25 ×3 · 1.3 · 1.35 ×7 · 1.4 ×7) = จุดเสี่ยง
   สระไทยชนขอบ ถ้าจะแตะทีละหน้า ให้เริ่มจากพวกนี้ก่อน */
const RAW_LINE_HEIGHT_CAP = 34;

/* ความมนมุมที่ยังเป็นเลขดิบ — เพดานรวม กติกาเดียวกับ RAW_SPACING_CAP

   ค่าที่ตรงขั้นเป๊ะถูกยกเข้าโทเคนหมดแล้ว (2026-07-30) — 8px → --radius ·
   10px → --radius-md · 999px → --radius-full (ย่อตาม scale factor เท่ากับ 9999px เป๊ะ)
   ที่เหลือคือค่าระหว่างขั้น: 9px ×5 · 2px ×5 · 7px ×3 · 6px ×2 · 14px ×2 · 3px ×2 · 5px · 11px · 4px

   ไม่นับ (คนละเรื่อง ไม่ใช่หนี้):
   - `50%` — เปอร์เซ็นต์กับความยาวไม่เท่ากันบน element ที่ไม่จัตุรัส (วงรี vs แคปซูล)
   - `0` / `inherit` — ศูนย์ไม่ต้องมีชื่อ
   - ค่าราย 4 มุม (`3px 3px 0 0`) — ต้องดูทีละมุม ไม่ใช่ค่าเดียวที่หยิบจากขั้นได้

   🪤 **ห้ามเพิ่มชื่อ `--radius-*` ใหม่เพื่อรองรับค่าที่เหลือ** — Tailwind v4 อ่าน
   namespace นี้เองและเอาไปทำ utility `rounded-*` (ในโค้ดมีใช้ 58 จุด) การเพิ่ม
   `--radius-sm` = เปลี่ยนความหมายของ `rounded-sm` ทั้งระบบเงียบ ๆ
   (เคยเจอทางกลับมาแล้ว: ลบ --radius-xl ที่ "ไม่มีใครใช้" แล้วมุมหด 16→12px) */
const RAW_RADIUS_CAP = 22;

/* เงาที่ยังเขียนเอง — เพดานรวม กติกาเดียวกับ RAW_SPACING_CAP

   2026-07-30: ยกเงาของ "แผงลอย" ขึ้นเป็น --shadow-float (รู้จักธีมเอง) แล้ว 3 จุด
   พร้อมลบ override `[data-theme="dark"] .ui-select-menu` ที่เขียนมือทิ้ง
   ที่เหลือ 7 จุด **ไม่ใช่เงายกระดับ** จึงยังไม่มีปลายทางให้ย้าย:
   - keyframes ของ pulse 3 จุด (วงแหวนกะพริบ ไม่ใช่ความลึก)
   - เงาขอบคอลัมน์ตรึง 2 จุด (ทิศทางแนวนอน คู่ซ้าย/ขวา)
   - `.premium-row:hover` และ tooltip ของกราฟ อย่างละ 1 จุด (ค่าเฉพาะตัว)
   `box-shadow: none` ไม่นับ — การ *ปิด* เงาไม่ต้องมีชื่อ

   🪤 เหมือน --radius-*: Tailwind v4 อ่าน namespace `--shadow-*` เองแล้วทำ utility
   `shadow-*` (ในโค้ดใช้ shadow-lg / shadow-sm อยู่) เพิ่ม/ลบชื่อต้องวัดผลของ
   utility ด้วย ดู radiusScale.test.mjs / shadowScale.test.mjs */
const RAW_SHADOW_CAP = 7;

/* ความจางที่ยังเป็นเลขดิบ — เพดานรวม กติกาเดียวกับ RAW_SPACING_CAP
   ไม่นับ `0` / `1` (โปร่งสุด/ทึบสุด ไม่ใช่ขั้นของดีไซน์ — ส่วนใหญ่เป็นปลายทางของ
   keyframes และการคืนค่าเต็มตอน hover)

   2026-07-30: ยก 18 จุดที่ตรงขั้นเป๊ะเข้า --op-disabled / --op-muted แล้ว (CSS 14 · JSX 4)
   ⚠️ ที่เหลือ **9 จุดเป็นสถานะ "ปิดใช้งาน" ที่ยังใช้ค่าอื่น** (.25 ×2 · .3 · .35 ×2 ·
   .4 ×3 · .5) = ปุ่มที่กดไม่ได้เหมือนกันแต่ดู "ปิด" ไม่เท่ากัน โดยเฉพาะ
   MonthPicker.module.css ที่ใช้ 3 ค่าต่างกันในไฟล์เดียว (.25/.3/.35)
   การยุบเข้า --op-disabled คือ *ปรับดีไซน์* (บางจุดจางลง บางจุดชัดขึ้น) ต้องมีคนดู
   ที่เหลืออีกส่วนเป็นค่าเชิงข้อมูลของกริดกระทบยอด (.75 ×2 · .85 · .8 · .6) และ
   โลโก้ตอน hover (.88) ซึ่งไม่ใช่สถานะปิดใช้งาน */
const RAW_OPACITY_CAP = 25;

/* ระยะห่างตัวอักษรที่ยังเป็นค่าดิบ — เพดานรวม กติกาเดียวกับ RAW_SPACING_CAP
   `0` ไม่นับ (การ *ล้าง* ระยะห่างที่สืบทอดมาไม่ใช่ขั้นของดีไซน์)

   2026-07-30: ยก 9 จุดที่กลุ่มสม่ำเสมออยู่แล้วเข้า --ls-heading / --ls-tabular /
   --ls-label ⚠️ ที่เหลือ 11 จุดเกือบทั้งหมดเป็น **บทบาทเดียวกัน คือ "ป้ายตัวเล็ก
   พิมพ์ใหญ่" แต่ใช้คนละค่า** (.02 ×3 · .04 ×4 · .025 · .05 · .06) — คลาสชื่อ
   `.eyebrow` เหมือนกันใน 4 ไฟล์ยังใช้ 3 ค่าต่างกัน การยุบเข้า --ls-label คือ
   *ปรับดีไซน์* (ตัวอักษรขยับจริง) ต้องมีคนเปิดหน้าดู
   ส่วน -0.04em ของ .totalAmount เป็นตัวเลขใหญ่พิเศษ คนละบทบาทกับ --ls-tabular */
const RAW_LETTER_SPACING_CAP = 11;

const rawColorViolations = [];
const typeScaleViolations = [];
const fontWeightViolations = [];
let rawLineHeightCount = 0;
let rawRadiusCount = 0;
let rawShadowCount = 0;
let rawOpacityCount = 0;
let rawLetterSpacingCount = 0;
const letterSpacingUnitViolations = [];
const zIndexViolations = [];
const motionViolations = [];
let rawSpacingCount = 0;
const breakpointValues = new Set();
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

     ⚠️ เดิมกฎนี้จับแค่ `font-size: <ตัวเลข>px` ที่ต้นค่า และยกเว้น globals.css ทั้งไฟล์
     จึงมี 6 จุดหลุดมาตลอด (ตรวจรอบสอง 2026-07-29): `clamp(20px, 2vw, 27px)` 3 จุด —
     ในนั้นคือ DetailOverview = **หัวเรื่องของทุกหน้ารายละเอียด** — กับ `0.8125rem` 1 จุด
     รอบนี้จึงอ่าน *ทั้งค่า* แล้วห้ามหน่วยความยาวคงที่ทุกชนิด ส่วน vw/vh ยังใช้ได้
     เพราะเป็นตัวกลางของ clamp() ที่ทำให้หัวเรื่องยืดตามจอ (ปลายทั้งสองข้างต้องเป็นโทเคน)

     globals.css ไม่ยกเว้นแล้ว — ที่นั่นประกาศขั้นด้วย `--fs-N: 12px` ซึ่งไม่ใช่
     `font-size:` จึงไม่ชนกฎนี้อยู่แล้ว การยกเว้นทั้งไฟล์มีแต่จะเปิดรูเพิ่ม */
  source.split(/\r?\n/).forEach((line, index) => {
    const declaration = line.match(/font-size:\s*([^;}]+)/);
    if (!declaration) return;
    const fixedUnit = declaration[1].match(/[0-9.]+\s*(?:px|pt|rem|em|ch|ex|cm|mm|in|pc)\b/);
    if (fixedUnit) {
      typeScaleViolations.push(`${rel}:${index + 1} font-size: ${declaration[1].trim()} → var(--fs-…)`);
    }
  });

  /* ฝั่ง JSX: `style={{ fontSize: 12 }}` — ชั้นพิมพ์คุมแค่ไฟล์ CSS มาตลอด ส่วน JS
     ไม่เคยมีกฎเลย ตรวจ 2026-07-29 พบ 758 จุดเขียนเลขดิบ **ใช้โทเคน 0 จุด** ใน 20 ค่า
     (รวมค่าที่ไม่มีในชั้นเลย: 9 · 10 · 13.5 · 17 · 19) = ต่อให้ไฟล์ CSS สะอาดหมด
     ก็ยังแก้ขนาดตัวอักษรทีเดียวทั้งระบบไม่ได้อยู่ดี

     ⚠️ เอกสารพิมพ์ยกเว้น — หน้าต่างพิมพ์ประกอบ HTML ของตัวเองและไม่ได้โหลด
     globals.css โทเคนจึงไม่มีค่าที่นั่น (ต้องเขียน px ตรง ๆ)
     ✅ ใช้ได้ทั้งใน `style` และ prop ของกราฟ (Recharts ส่งลง SVG เป็น attribute
     ซึ่ง `var()` ก็ resolve — วัดจริงในเบราว์เซอร์แล้ว ไม่ได้เดา) */
  if (!rel.startsWith("src/components/documents/")) {
    source.split(/\r?\n/).forEach((line, index) => {
      for (const hit of line.matchAll(/fontSize:\s*(?:"(\d[\d.]*)px"|'(\d[\d.]*)px'|(\d[\d.]*))(?=\s*[,}])/g)) {
        typeScaleViolations.push(`${rel}:${index + 1} fontSize: ${hit[1] ?? hit[2] ?? hit[3]} → var(--fs-…)`);
      }
    });
  }

  /* น้ำหนักตัวอักษรต้องมาจาก --fw-* — ชั้นพิมพ์คุมแต่ *ขนาด* มาตลอด ส่วน *น้ำหนัก*
     ไม่เคยมีกฎเลย ตรวจ 2026-07-30 พบ 558 จุด ใช้โทเคน 0 และกระจาย 8 ค่า ทั้งที่
     layout.js โหลดฟอนต์มาแค่ 4 น้ำหนัก → 76 จุดสั่งค่าที่ไม่มีตัวจริง (650/750/800/450)
     เบราว์เซอร์ปัดให้เงียบ ๆ = ไล่ระดับความหนา 3 ขั้นแล้วได้หน้าตาขั้นเดียว
     (วัดความกว้างข้อความจริงแล้ว ไม่ได้อนุมานจากสเปก)

     ⚠️ เอกสารพิมพ์ (`components/documents/`, `lib/`) ยกเว้น — ประกอบ HTML เองและ
     ไม่โหลด globals.css โทเคนจึงไม่มีค่าที่นั่น */
  if (!rel.startsWith("src/components/documents/")) {
    source.split(/\r?\n/).forEach((line, index) => {
      const cssHit = line.match(/font-weight:\s*(\d+)/);
      if (cssHit) {
        fontWeightViolations.push(`${rel}:${index + 1} font-weight: ${cssHit[1]} → var(--fw-…)`);
      }
      for (const hit of line.matchAll(/fontWeight:\s*(?:"(\d+)"|'(\d+)'|(\d+))(?=\s*[,}])/g)) {
        fontWeightViolations.push(`${rel}:${index + 1} fontWeight: ${hit[1] ?? hit[2] ?? hit[3]} → var(--fw-…)`);
      }
    });
  }

  /* ชั้นซ้อนระดับหน้าต้องมาจากโทเคน `--z-*` — ตรวจ 2026-07-29 พบ 82 จุดกระจายเป็น
     22 ค่า ตั้งแต่ 1 ถึง 10050 โดยไม่มีที่ไหนบอกว่าอะไรควรอยู่เหนืออะไร คนเขียน
     ของใหม่จึงเดาเลขเอง แล้วก็ได้ 9000/9999/10050 แบบ "ใหญ่ไว้ก่อน" ซึ่งพอมีสองคน
     ทำเหมือนกันก็ทับกันอยู่ดี

     เกณฑ์ **≥ 30** โดยเจตนา: เลข 0–10 (59 จุด) เป็นการเรียงลำดับกันเองภายใน
     stacking context ของตัวเอง — หัวตารางตรึง · คอลัมน์ freeze · แถบ gantt ·
     วงโฟกัส — พวกนั้นไม่ได้แข่งกับแผงลอยระดับหน้า และการบังคับให้ไปใช้โทเคนกลาง
     จะทำให้ชั้นกลางเต็มไปด้วยชื่อที่ไม่มีความหมายข้ามหน้า
     globals.css ยกเว้นเฉพาะบรรทัดที่ *ประกาศ* โทเคน (`--z-…: 1100;`) */
  if (!rel.startsWith("src/components/documents/")) {
    source.split(/\r?\n/).forEach((line, index) => {
      if (/^\s*--z-[\w-]+:/.test(line)) return;
      for (const hit of line.matchAll(/z-?[Ii]ndex:\s*"?(\d+)"?/g)) {
        if (Number(hit[1]) < 30) continue;
        zIndexViolations.push(`${rel}:${index + 1} ${hit[0]} → var(--z-…)`);
      }
    });
  }

  /* จังหวะต้องมาจากโทเคน `--motion-*` — ตรวจ 2026-07-29 พบเวลาดิบ 136 จุดใน 15 ค่า
     (.06 .08 .1 .12 120ms .14 .15 .16 .18 .2 200ms .22 220ms .24 .3) ขณะที่โทเคน
     ที่ประกาศไว้ตั้งแต่ต้นถูกอ้างจริงแค่ 3 จุด = ปรับจังหวะทั้งระบบทีเดียวไม่ได้

     ยกเว้นสองอย่าง:
     - `prefers-reduced-motion` ที่บังคับ 0.01ms — เป็นสวิตช์ปิด ไม่ใช่จังหวะ
     - แอนิเมชัน **≥ 500ms** (spinner / pulse / progress ที่วนไม่จบ) — คนละเรื่องกับ
       เวลาตอบสนองของ UI และมีจังหวะเฉพาะตัวของมันเอง */
  /* ⚠️ ต้องอ่านทั้ง declaration ไม่ใช่ทีละบรรทัด — `transition:` ยาว ๆ ใน globals.css
     ตัดขึ้นบรรทัดใหม่ (`.btn` / `.metric-card`) บรรทัดต่อจึงไม่มีคำว่า transition
     แล้วรอดกฎแบบทีละบรรทัดไป 5 จุด (เจอตอนเทสต์เส้นโค้งฟ้อง ไม่ใช่ตอนกฎนี้ฟ้อง) */
  if (!rel.startsWith("src/components/documents/")) {
    for (const decl of source.matchAll(/(?:transition|animation)[^;{}]*;/g)) {
      if (/prefers-reduced-motion|0\.01ms/.test(decl[0])) continue;
      for (const hit of decl[0].matchAll(/(?<![\w-])(\d*\.?\d+)(ms|s)(?![\w-])/g)) {
        const ms = hit[2] === "ms" ? Number(hit[1]) : Number(hit[1]) * 1000;
        if (ms >= 500) continue;
        const line = source.slice(0, decl.index + hit.index).split(/\r?\n/).length;
        motionViolations.push(`${rel}:${line} ${hit[0]} → var(--motion-…)`);
      }
    }
  }

  // เก็บค่าจุดตัดจอที่ต่างกัน (ดู BREAKPOINT_CAP)
  if (rel.endsWith(".css")) {
    for (const hit of source.matchAll(/@media[^{]*?(?:max|min)-width:\s*(\d+)px/g)) {
      breakpointValues.add(Number(hit[1]));
    }
  }

  /* นับระยะห่างที่ยังเป็นเลขดิบ (ดู RAW_SPACING_CAP) — เฉพาะไฟล์ CSS
     `(?<![\d.\-])` กันค่าติดลบและตัวเลขที่เป็นส่วนของค่าอื่น */
  if (rel.endsWith(".css")) {
    for (const decl of source.matchAll(/\b(?:gap|row-gap|column-gap|padding|margin)(?:-(?:top|bottom|left|right|inline|block))?:\s*[^;{}]+;/g)) {
      for (const hit of decl[0].matchAll(/(?<![\d.\-])(\d+)px\b/g)) {
        if (Number(hit[1]) > 0) rawSpacingCount += 1;
      }
    }
  }

  /* นับความสูงบรรทัดที่ยังเป็นเลขดิบ (ดู RAW_LINE_HEIGHT_CAP) — ทั้ง CSS และ JSX
     เอกสารพิมพ์ยกเว้น: ประกอบ HTML เองและไม่โหลด globals.css โทเคนไม่มีค่าที่นั่น */
  if (!rel.startsWith("src/components/documents/") && !rel.startsWith("src/lib/")) {
    for (const _ of source.matchAll(/line-height:\s*[0-9.]+\s*[;}]/g)) rawLineHeightCount += 1;
    for (const _ of source.matchAll(/lineHeight:\s*(?:"[0-9.]+"|'[0-9.]+'|[0-9.]+)\s*[,}]/g)) rawLineHeightCount += 1;

    /* ความมนมุมเลขดิบ (ดู RAW_RADIUS_CAP) — เฉพาะ **ค่าเดียวที่เป็นความยาว**
       ข้าม % (คนละความหมาย) · 0 / inherit · และค่าราย 4 มุมที่ต้องดูทีละมุม */
    for (const hit of source.matchAll(/border-radius:\s*([^;{}]+)/g)) {
      const value = hit[1].trim();
      if (/\s/.test(value) || value.includes("var(") || value.endsWith("%")) continue;
      if (/^0[a-z]*$/.test(value) || value === "inherit") continue;
      if (/^[0-9.]+(?:px|rem|em)$/.test(value)) rawRadiusCount += 1;
    }

    /* เงาเลขดิบ (ดู RAW_SHADOW_CAP) — `none` ไม่นับ การปิดเงาไม่ต้องมีชื่อ */
    for (const hit of source.matchAll(/box-shadow:\s*([^;{}]+)/g)) {
      const value = hit[1].trim();
      if (value.includes("var(") || /^none$/i.test(value) || value === "inherit") continue;
      rawShadowCount += 1;
    }

    /* ความจางเลขดิบ (ดู RAW_OPACITY_CAP) — 0 กับ 1 ไม่นับ */
    for (const hit of source.matchAll(/(?:^|[;{])\s*opacity:\s*([^;}]+)/g)) {
      const value = hit[1].trim();
      if (value.includes("var(")) continue;
      const number = Number(value);
      if (!Number.isFinite(number) || number === 0 || number === 1) continue;
      rawOpacityCount += 1;
    }

    /* ระยะห่างตัวอักษร (ดู RAW_LETTER_SPACING_CAP)
       หน่วยความยาวคงที่เป็น **ข้อห้าม ไม่ใช่เพดาน** — px ไม่ขยับตามขนาดตัวอักษร
       ป้ายเดียวกันที่ใช้ --fs-1 กับ --fs-5 จะได้ระยะห่างต่างกันทันที */
    source.split(/\r?\n/).forEach((line, index) => {
      const hit = line.match(/letter-spacing:\s*([^;}]+)/);
      if (!hit) return;
      const value = hit[1].trim();
      if (/[0-9.]\s*(?:px|pt|rem|cm|mm|in|pc)\b/.test(value)) {
        letterSpacingUnitViolations.push(`${rel}:${index + 1} letter-spacing: ${value} → ใช้หน่วย em`);
        return;
      }
      if (value.includes("var(") || value === "0") return;
      rawLetterSpacingCount += 1;
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

/* ทางกลับของ deadClasses: selector ที่ไม่มี element ไหนกินแล้ว
   เพดานเป็น 0 สำหรับ globals.css เพราะเพิ่งเก็บกวาดครบ (2026-07-30) — ของใหม่
   ที่ไม่มีคนเรียกจึงเข้ามาไม่ได้อีก · CSS module ยังเหลือหนี้ตามเพดานด้านล่าง
   ⚠️ ห้ามขยับเพดานขึ้นเพื่อให้ audit ผ่าน — ถ้าคลาสถูกประกอบตอนรันไทม์จนตัวกัน
   มองไม่เห็น ให้เพิ่มเคสนั้นใน uiOrphanCss.mjs + orphanCss.test.mjs ไม่ใช่เพิ่มเลข */
const ORPHAN_GLOBALS_CAP = 0;
const ORPHAN_MODULE_CAP = 0;
const orphanCss = countOrphanCss(root, files);

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
  /* ปลดระวาง 2026-07-30 — สอง shim ที่เขียนคอมเมนต์ตัวเองว่า "one-release migration
     window" แต่อยู่ยาว: tax/ConfirmModal ตั้ง danger=true ให้เงียบ ๆ (ผู้ใช้ 7 ไฟล์
     ไม่มีสักไฟล์ที่เป็นภาษี) · excise/ConfirmDialog บังคับ closeOnSuccess
     ค่าที่มันแอบตั้งให้ถูกเขียนกลับที่จุดเรียกครบแล้ว */
  "src/components/tax/ConfirmModal.js",
  "src/components/excise/ConfirmDialog.js",
].filter((file) => fs.existsSync(path.join(root, file)));
const legacyCompatibilityImports = [];
for (const file of runtimeJsFiles) {
  const rel = relative(file);
  const source = fs.readFileSync(file, "utf8");
  if (/components\/excise\/Pager|salesPlanning\/(?:SaWorkspace|SalesDetailOverview)/.test(source)) {
    legacyCompatibilityImports.push(rel);
  }
  if (/components\/tax\/ConfirmModal|components\/excise\/ConfirmDialog/.test(source)) {
    legacyCompatibilityImports.push(rel);
  }
}
const failures = [
  ...(shellPages.length !== visualPageFiles.length
    ? [`design-shell coverage incomplete: ${shellPages.length}/${visualPageFiles.length} visual routes`]
    : []),
  ...rawColorViolations.map((item) => `raw color outside design tokens: ${item}`),
  ...typeScaleViolations.map((item) => `font-size นอกชั้นพิมพ์กลาง: ${item}`),
  ...fontWeightViolations.map((item) => `น้ำหนักตัวอักษรนอกชั้นกลาง: ${item}`),
  ...zIndexViolations.map((item) => `z-index นอกชั้นซ้อนกลาง: ${item}`),
  ...motionViolations.map((item) => `เวลาใน transition/animation นอกชั้นจังหวะกลาง: ${item}`),
  ...(rawSpacingCount > RAW_SPACING_CAP
    ? [`ระยะห่างเลขดิบเพิ่มขึ้น: ${rawSpacingCount} > เพดาน ${RAW_SPACING_CAP} — ของใหม่ต้องหยิบขั้นจาก --space-*`]
    : []),
  ...(breakpointValues.size > BREAKPOINT_CAP
    ? [`จุดตัดจอมีค่าใหม่เพิ่ม: ${breakpointValues.size} > เพดาน ${BREAKPOINT_CAP} (${[...breakpointValues].sort((a, b) => a - b).join(", ")}) — หยิบจากค่าที่มีอยู่แล้ว`]
    : []),
  ...(breakpointValues.size < BREAKPOINT_CAP
    ? [`จุดตัดจอยุบได้แล้ว: เหลือ ${breakpointValues.size} ค่า แต่ BREAKPOINT_CAP ยังเขียน ${BREAKPOINT_CAP} (รูดเพดานลง)`]
    : []),
  ...(rawSpacingCount < RAW_SPACING_CAP
    ? [`ระยะห่างเลขดิบลดได้แล้ว: เหลือ ${rawSpacingCount} แต่ RAW_SPACING_CAP ยังเขียน ${RAW_SPACING_CAP} (รูดเพดานลงใน scripts/audit-ui.mjs)`]
    : []),
  ...(rawLineHeightCount > RAW_LINE_HEIGHT_CAP
    ? [`ความสูงบรรทัดเลขดิบเพิ่มขึ้น: ${rawLineHeightCount} > เพดาน ${RAW_LINE_HEIGHT_CAP} — หยิบขั้นจาก --lh-* (ข้อความไทยต้อง ≥ 1.45)`]
    : []),
  ...(rawLineHeightCount < RAW_LINE_HEIGHT_CAP
    ? [`ความสูงบรรทัดเลขดิบลดได้แล้ว: เหลือ ${rawLineHeightCount} แต่ RAW_LINE_HEIGHT_CAP ยังเขียน ${RAW_LINE_HEIGHT_CAP} (รูดเพดานลง)`]
    : []),
  ...(rawRadiusCount > RAW_RADIUS_CAP
    ? [`ความมนมุมเลขดิบเพิ่มขึ้น: ${rawRadiusCount} > เพดาน ${RAW_RADIUS_CAP} — หยิบขั้นจาก --radius-* (ห้ามตั้งชื่อใหม่ Tailwind อ่าน namespace นี้)`]
    : []),
  ...(rawRadiusCount < RAW_RADIUS_CAP
    ? [`ความมนมุมเลขดิบลดได้แล้ว: เหลือ ${rawRadiusCount} แต่ RAW_RADIUS_CAP ยังเขียน ${RAW_RADIUS_CAP} (รูดเพดานลง)`]
    : []),
  ...(rawShadowCount > RAW_SHADOW_CAP
    ? [`เงาที่เขียนเองเพิ่มขึ้น: ${rawShadowCount} > เพดาน ${RAW_SHADOW_CAP} — แผงลอยใช้ var(--shadow-float), การ์ดใช้ --shadow-sm/md/lg`]
    : []),
  ...(rawShadowCount < RAW_SHADOW_CAP
    ? [`เงาที่เขียนเองลดได้แล้ว: เหลือ ${rawShadowCount} แต่ RAW_SHADOW_CAP ยังเขียน ${RAW_SHADOW_CAP} (รูดเพดานลง)`]
    : []),
  ...(rawOpacityCount > RAW_OPACITY_CAP
    ? [`ความจางเลขดิบเพิ่มขึ้น: ${rawOpacityCount} > เพดาน ${RAW_OPACITY_CAP} — สถานะปิดใช้งานใช้ var(--op-disabled), เนื้อหาที่ลดความเด่นใช้ var(--op-muted)`]
    : []),
  ...(rawOpacityCount < RAW_OPACITY_CAP
    ? [`ความจางเลขดิบลดได้แล้ว: เหลือ ${rawOpacityCount} แต่ RAW_OPACITY_CAP ยังเขียน ${RAW_OPACITY_CAP} (รูดเพดานลง)`]
    : []),
  ...letterSpacingUnitViolations.map((item) => `ระยะห่างตัวอักษรต้องเป็นหน่วย em (px ไม่ขยับตามขนาดตัวอักษร): ${item}`),
  ...(rawLetterSpacingCount > RAW_LETTER_SPACING_CAP
    ? [`ระยะห่างตัวอักษรค่าดิบเพิ่มขึ้น: ${rawLetterSpacingCount} > เพดาน ${RAW_LETTER_SPACING_CAP} — หยิบจาก --ls-heading / --ls-tabular / --ls-label`]
    : []),
  ...(rawLetterSpacingCount < RAW_LETTER_SPACING_CAP
    ? [`ระยะห่างตัวอักษรค่าดิบลดได้แล้ว: เหลือ ${rawLetterSpacingCount} แต่ RAW_LETTER_SPACING_CAP ยังเขียน ${RAW_LETTER_SPACING_CAP} (รูดเพดานลง)`]
    : []),
  ...deadClassViolations.map((item) => `dead CSS class (no selector in globals.css): ${item}`),
  ...(orphanCss.globals.length > ORPHAN_GLOBALS_CAP
    ? orphanCss.globals.map((item) => `CSS ที่ไม่มีใครเรียกใน globals.css (ลบทิ้ง อย่าปล่อยไว้): ${item}`)
    : []),
  ...(orphanCss.globals.length < ORPHAN_GLOBALS_CAP
    ? [`CSS กำพร้าใน globals ลดได้แล้ว: เหลือ ${orphanCss.globals.length} แต่ ORPHAN_GLOBALS_CAP ยังเขียน ${ORPHAN_GLOBALS_CAP} (รูดเพดานลง)`]
    : []),
  ...(orphanCss.modules.length > ORPHAN_MODULE_CAP
    ? orphanCss.modules.map((item) => `CSS ที่ไม่มีใครเรียกใน CSS module: ${item}`)
    : []),
  ...(orphanCss.modules.length < ORPHAN_MODULE_CAP
    ? [`CSS กำพร้าใน module ลดได้แล้ว: เหลือ ${orphanCss.modules.length} แต่ ORPHAN_MODULE_CAP ยังเขียน ${ORPHAN_MODULE_CAP} (รูดเพดานลง)`]
    : []),
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
console.log(`Font-weight violations (นอกโทเคน --fw-*): ${fontWeightViolations.length}`);
console.log(`Z-index violations (นอกโทเคน --z-*): ${zIndexViolations.length}`);
console.log(`Motion violations (นอกโทเคน --motion-*): ${motionViolations.length}`);
console.log(`ระยะห่างเลขดิบใน CSS: ${rawSpacingCount}/${RAW_SPACING_CAP} (เพดาน ขึ้นไม่ได้)`);
console.log(`ความสูงบรรทัดเลขดิบ: ${rawLineHeightCount}/${RAW_LINE_HEIGHT_CAP} (เพดาน ขึ้นไม่ได้)`);
console.log(`ความมนมุมเลขดิบ: ${rawRadiusCount}/${RAW_RADIUS_CAP} (เพดาน ขึ้นไม่ได้)`);
console.log(`เงาที่เขียนเอง: ${rawShadowCount}/${RAW_SHADOW_CAP} (เพดาน ขึ้นไม่ได้)`);
console.log(`ความจางเลขดิบ: ${rawOpacityCount}/${RAW_OPACITY_CAP} (เพดาน ขึ้นไม่ได้)`);
console.log(`ระยะห่างตัวอักษรค่าดิบ: ${rawLetterSpacingCount}/${RAW_LETTER_SPACING_CAP} (เพดาน ขึ้นไม่ได้)`);
console.log(`ระยะห่างตัวอักษรที่ใช้หน่วยคงที่ (ต้องเป็น em): ${letterSpacingUnitViolations.length}`);
console.log(`ค่าจุดตัดจอที่ต่างกัน: ${breakpointValues.size}/${BREAKPOINT_CAP} (เพดาน ขึ้นไม่ได้)`);
console.log(`Dead CSS class usages: ${deadClassViolations.length}`);
console.log(
  `CSS ที่ไม่มีใครเรียก: globals ${orphanCss.globals.length}/${ORPHAN_GLOBALS_CAP}` +
    ` · module ${orphanCss.modules.length}/${ORPHAN_MODULE_CAP} (เพดาน ขึ้นไม่ได้)`,
);
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
