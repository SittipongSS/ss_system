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
import { checkCssModuleImports } from "./uiCssModuleImports.mjs";

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
  // หน้าพรีวิวเต็มจอของมาตรฐานเอกสาร — เดิมชื่อ `quotation-preview` เปลี่ยนเป็น
  // `preview` ตอนทำให้รองรับเอกสารครบทุกชนิด (สีดิบในนี้เป็นสีกระดาษ ไม่ใช่สีของแอป)
  "src/app/settings/document-standards/preview/page.module.css",
];

/* หนี้เก่า: prompt() ที่ยังไม่ได้แปลงเป็นกล่องกรอกของระบบ — โผล่มาตอนเติม prompt เข้า
   ตัวตรวจ (2026-07-28) และตั้งใจแยกออกจากงานหน้าโครงการ ตัวเลข = จำนวนจุดที่ยอมให้เหลือ
   ต่อไฟล์ นับเป็น "เพดาน" แบบเดียวกับชั้นสไตล์เก่า: มากกว่านี้ = เพิ่มของใหม่ → ตก,
   น้อยกว่า = แปลงแล้ว → ลดเลขลง (ไม่ยอมให้ทิ้งตัวเลขค้างไว้เกินจริง)
   ⚠️ ห้ามเติมไฟล์ใหม่เข้าลิสต์นี้เพื่อให้ audit ผ่าน — ของใหม่ใช้ ReasonDialog
   (ขอเหตุผล) หรือ ConfirmDialog (ยืนยัน) ดูตัวอย่างที่ /settings/design-preview */
const nativeFeedbackDebt = {
  // ⭐ **หนี้หมดแล้ว** (2026-08-30) — สองจุดสุดท้ายคือ "เหตุผลที่ไม่อนุมัติ" ของหน้า
  // ทะเบียนลูกค้า/สินค้า · ย้ายเข้า ReasonDialog ในฮุค `useApprovalDecision` ตอนเพิ่ม
  // ปุ่มอนุมัติบนหน้ารายละเอียด ⇒ ทั้งสี่จุดที่ตัดสินอนุมัติได้ (ทะเบียน ×2 ·
  // รายละเอียด ×2) ใช้กล่องเดียวกัน และเหตุผลกลายเป็นช่องบังคับกรอก
  // (ลบ src/components/mgmt/DocsPanel.js ออกแล้ว — แผงนั้นถูกยุบเข้า AttachmentsPanel
  //  ซึ่งใช้ ReasonDialog อยู่แล้ว จึงไม่เหลือ prompt() ให้ยกเว้น)
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
   ตั้งแต่แรกเพราะไม่มี element ไหนกินกฎพวกนั้น

   ⭐ 723 → 255 (2026-07-30, มติผู้ใช้): เปลี่ยนวิธีคิด — **ตั้งชื่อให้จังหวะที่มีอยู่จริง
   แทนการดันค่าเข้ากริด** นับแล้วพบว่า 482 จาก 723 จุด (67%) เป็น 2·6·10·14·18px
   = *จุดกึ่งกลางของกริด 4px เป๊ะ ๆ* ไม่ใช่ค่ามั่ว → ระบบนี้เดินจังหวะ 2px มาตั้งแต่ต้น
   จึงเพิ่ม --space-0-5 … --space-4-5 แล้วยก 468 จุดเข้าโทเคน
   วัดจริง: หน้าต้นแบบ 2 ธีม × 5 กลุ่ม = 3,838 จุดวัด **ต่างกัน 0** (โทเคนถือค่าเดิมเป๊ะ)

   ที่เหลือ 255 จุดเป็น **เลขคี่** (5 ×43 · 3 ×42 · 9 ×42 · 7 ×33 · 11 ×28 · …) ซึ่งคือ
   ชุดที่รอบก่อนเคยลองดูดเข้ากริดแล้วทิ้ง (113 จาก 126 element ขยับ มากสุด 10px)
   ยังต้องมีคนเปิดหน้าดูทีละจอเหมือนเดิม */
/* 242 → 239 (2026-08-14): งาน sink ไทยยกป้าย (บล็อกรวม `.ui-badge/.status-pill/.chip`
   กับ `Badge.module.css .base` = 3px สองฝั่ง) และ `.search-glass` (7px) เข้าโทเคนไปด้วย
   เพราะต้องแตะ padding ของพวกนี้อยู่แล้ว — รูดเพดานลงตามกติกา */
/* 239 → 237 (2026-08-14): พิลผู้ใช้บนแถบระบบยุบ padding บน/ล่าง 3px เป็น `--space-0-5`
   ตอนแก้สระล่างขาด (สองบรรทัดสูงขึ้นจนพิลเกิน 40px) — รูดเพดานลงตามกติกา

   ⚠️ 237 → 239 (วันเดียวกัน รอบสอง) — **ขึ้น** เพราะเป็นการ **ถอนของที่เพิ่งใส่**
   ไม่ใช่หนี้ใหม่: รอบแรกยุบ padding ของป้าย (`.ui-badge/.status-pill/.chip` และ
   `Badge.module.css .base`) จาก `3px` เป็นโทเคนเพื่อบวก sink ล่าง · วัดด้วยป้ายจริง
   แล้วพบว่า sink ทำให้ป้ายลอยสูง 4.2px ⇒ คืนค่า `3px` เท่ากันสองด้านตามเดิม
   ⇒ เลขดิบสองจุดนั้นกลับมาพร้อมกัน · ห้ามใช้ช่องนี้เป็นข้ออ้างเพิ่มเลขดิบใหม่ */
const RAW_SPACING_CAP = 155;

/* จำนวน **ค่าจุดตัดจอที่ต่างกัน** ในไฟล์ CSS — เพดาน ขึ้นไม่ได้ ลงได้อย่างเดียว

   ตรวจ 2026-07-29: มี 24 ค่า รวมคู่ที่ห่างกัน 1–8px (760/767/768) ซึ่งเป็นการพิมพ์
   ต่างกันมากกว่าเป็นการตัดสินใจ — ยุบเหลือ 768 แล้วจึงเหลือ 22

   🪤 ชั้นนี้ทำเป็นโทเคนไม่ได้ (custom property ใช้ใน media query ไม่ได้ตามสเปก)
   จึงล็อกที่ **จำนวนค่า** แทนการบังคับให้อ้างตัวแปร — กันไม่ให้ใครเพิ่มค่าที่ 23
   ส่วนการยุบค่าที่เหลือคือการเปลี่ยนจุดที่เลย์เอาต์สลับ ต้องมีคนเปิดหน้าจริงดู

   22 → 21 (2026-07-30): ค่าหนึ่งอยู่ใน @media ของกฎที่ไม่มีใครเรียกแล้ว หายไปพร้อม
   การลบ CSS กำพร้า ไม่ได้เกิดจากการยุบจุดตัดจอจริง

   ⭐ 21 → 13 (2026-07-30, มติผู้ใช้): ยุบ 8 ค่าเข้าชุดแนะนำ โดยใช้เกณฑ์ที่ตรวจได้
   ไม่ใช่สายตา — **ช่วงความกว้างที่พฤติกรรมเปลี่ยนต้องไม่มีความกว้างอุปกรณ์จริงคาบเกี่ยว**
     520→480 · 576→560 · 600→560 · 620→640 · 700→680 · 780→768 · 860→900 · 960→1000
   ทั้ง 8 ช่วง (481–520, 561–600, 621–640, 681–700, 769–780, 861–900, 961–1000)
   ไม่มีความกว้างมาตรฐานสักตัว · ตรวจแล้วด้วยว่าไม่มีไฟล์ไหนที่บล็อกเดิมกับบล็อก
   ปลายทางแตะ selector เดียวกัน (ยุบแล้วจึงเป็นแค่สองบล็อกติดกันที่คุมคนละของ)
   วัดจริงที่ 375 · 768 · 820 · 1024 · 1280px: **ต่างกัน 0 ทุกความกว้าง**

   ⚠️ 5 ค่าที่เหลือไม่ยุบ เพราะช่วงที่เปลี่ยน **ชนความกว้างอุปกรณ์จริง**:
     800 (ชน 800) · 820 (ชน 800/810/820 — iPad Air แนวตั้ง) ·
     1050 (ชน 1024) · 1100 (ชน 1024/1080) · 1120 (ห่างปลายทาง 80px)
   พวกนี้ต้องมีคนลากหน้าต่างดูจริงว่าเลย์เอาต์ควรสลับตรงไหน */
const BREAKPOINT_CAP = 13;

/* ความสูงบรรทัดที่ยังเป็นเลขดิบ — เพดานรวม กติกาเดียวกับ RAW_SPACING_CAP

   ค่าที่ตรงขั้น `--lh-*` เป๊ะถูกยกเข้าโทเคนหมดแล้ว (2026-07-30) ที่เหลือคือค่าที่
   อยู่ระหว่างขั้น: 1.55 ×9 · 1.4 ×7 · 1.35 ×7 · 1.7 ×3 · 1.25 ×3 · 1.65 ×3 · 1.1 · 1.3
   การดูดเข้าขั้นคือ **ปรับดีไซน์จริง** ไม่ใช่เก็บกวาด — ความสูงบรรทัดคูณด้วยจำนวน
   บรรทัด ยิ่งกล่องข้อความยาวยิ่งขยับเยอะ ต้องมีคนเปิดหน้าดูทีละจอ
   (บทเรียนเดียวกับรอบระยะห่าง: เคยคิดว่า "ห่างนิดเดียวมองไม่เห็น" แล้ววัดจริง
   ได้ 113 จาก 126 element ขยับ)

   ✅ 2026-07-30 (รอบสอง, มติผู้ใช้): ยกจุดที่ต่ำกว่าเกณฑ์ไทยขึ้น --lh-thai ครบ 16 จุด
   วัดหมึกจริงด้วย canvas actualBoundingBox ที่ 14px bold: คำที่มีทั้งวรรณยุกต์และ
   เชิงล่าง ("ที่ญุ") ใช้หมึกสูง 20px = **1.429 เท่าของขนาดตัวอักษร**
   → ที่ 1.25/1.3/1.35/1.4 ช่องว่างระหว่างหมึกสองบรรทัดเป็น -2.5/-1.8/-1.1/-0.4px
     = **หมึกชนกันจริง** ไม่ใช่แค่ดูอึดอัด · ที่ 1.45 พ้นมาได้ +0.3px
   (เกณฑ์ 1.45 ที่ #794 ตั้งไว้ด้วยตา จึงถูกต้องเชิงประจักษ์ — แต่เป็น *ขั้นต่ำจริง ๆ*
   ถ้าอยากสบายตากว่านี้ใช้ --lh-text 1.5 ซึ่งได้ช่องว่าง 1.0px)

   ✅ 2026-08-14 (รอบสาม, มติผู้ใช้): ยกเกณฑ์ไทย 1.45 → **1.65** และรูดเพดาน 17 → 9

   เกณฑ์ 1.45 ของรอบสองวัดจากคำว่า "ที่ญุ" ซึ่ง**ไม่ใช่กรณีแย่สุด** วัดใหม่แยกสองฝั่ง
   บน Sarabun: สระบนสูงสุด 1.250em ("เชื้อเพลิงที่ใช้") + สระล่างลึกสุด 0.332em
   ("ผู้ปฏิบัติหน้าที่") = **1.582em** ⇒ ที่ 1.45 หมึกสองบรรทัดยังทับกัน 1.72px
   และในกล่องที่มี overflow ยังโดนตัด — วัดจริง 14 จอเจอรอยขาด 80 จุด
   **34 ใน 35 จุดแรกขาดที่ขอบบน** = ฝั่งสระบน ซึ่งรอบก่อน ๆ ไม่ได้ดู

   ⚠️ เหลือ 1 จุดที่ยังต่ำกว่าเกณฑ์โดยตั้งใจ: `.ui-kpi-value` (1.1) — ตัวเลข KPI ล้วน
   (`tabular-nums` + `white-space: nowrap`) ไม่มีสระไทยและไม่มีบรรทัดที่สองให้ชน
   ส่วน `.ui-metric strong` (เดิม 1.25) ย้ายขึ้น --lh-thai แล้วเพราะค่าเป็นไทยได้จริง
   ที่เหลือในเพดานเป็นค่า ≥1.65 ที่อยู่ระหว่างขั้น กับ lineHeight ใน JSX */
const RAW_LINE_HEIGHT_CAP = 9;

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
const RAW_RADIUS_CAP = 21;

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

   รอบแรก 2026-07-30: ยก 18 จุดที่ตรงขั้นเป๊ะเข้า --op-disabled / --op-muted (CSS 14 · JSX 4)
   รอบสอง (มติผู้ใช้): ยุบสถานะ "ปิดใช้งาน" ที่ยังใช้ค่าอื่นอีก **8 จุด** เข้า --op-disabled
   ครบแล้ว — เดิมกระจาย .25 ×2 · .3 · .35 ×2 · .4 ×2 · .5 และ MonthPicker ไฟล์เดียว
   ใช้ 3 ค่าต่างกันในตัวเอง (.25/.3/.35)

   ⚠️ รอบแรกเขียนไว้ว่า 9 จุด — **นับเกินไป 1** เพราะเหมา `opacity: 0.4` ใน
   `@keyframes drawerInRight` (ค่าเริ่มของอนิเมชัน) มาเป็นสถานะปิดใช้งานด้วย

   ที่เหลือไม่ใช่สถานะปิดใช้งาน จึงไม่มีปลายทาง: ค่าเชิงข้อมูลของกริดกระทบยอด
   (.75 ×2 · .85 · .8 · .6) · โลโก้ตอน hover (.88) · ของประดับที่จางไว้เฉย ๆ
   (.es-icon · .fc-month-cell.empty ที่ 0.45 แต่ไม่ใช่ "กดไม่ได้") · keyframes

   17 → 16 (merge main 2026-07-31): งานบริการที่เข้ามาใหม่ทำ "การ์ดที่ปิดแล้ว" จางคนละค่า
   สองหน้า (.cardDone 0.62 · .visitMuted 0.5) ทั้งที่บทบาทเดียวกัน — ยุบเข้า --op-muted

   16 → 15: ป้ายจำนวนบนตัวสลับ "บทบาทของฉันในงาน" เคยเป็น `(12)` ที่ opacity 0.72 ดิบ ๆ
   ในหน้างาน — ย้ายไปเป็น `count` ของ Segmented ที่มี .seg-count เป็นเจ้าของหน้าตา */
const RAW_OPACITY_CAP = 15;

/* ระยะห่างตัวอักษรที่ยังเป็นค่าดิบ — เพดานรวม กติกาเดียวกับ RAW_SPACING_CAP
   `0` ไม่นับ (การ *ล้าง* ระยะห่างที่สืบทอดมาไม่ใช่ขั้นของดีไซน์)

   รอบแรก 2026-07-30: ยก 9 จุดที่กลุ่มสม่ำเสมออยู่แล้วเข้า --ls-heading / --ls-tabular /
   --ls-label · รอบสอง: ยุบป้าย eyebrow/หัวข้อย่อยอีก 7 จุดเข้า --ls-label (มติผู้ใช้)
   เดิมบทบาทนี้ใช้อยู่ 6 ค่า และคลาสชื่อ `.eyebrow` เหมือนกันใน 4 ไฟล์ใช้ 3 ค่าต่างกัน

   ⚠️ เหลือ 4 จุดที่ **คนละบทบาทจริง ๆ** จึงไม่ยุบ — อย่าเหมารวมทีหลัง:
   - `.brand-logo` (.02em) — wordmark ของแบรนด์ ตัวใหญ่กว่าและ semibold ไม่ใช่ป้าย
   - `:global(th)` ของตาราง (.025em) — หัวตารางมีตระกูลโทเคนของตัวเอง
     (--fs-table-head) และการขยับกระทบทุกตารางในระบบ
   - `.dept` ของเธรด (.02em) — คนเขียนคอมเมนต์กำกับไว้เองว่า "เป็นบริบทไม่ใช่หัวข้อ"
     ตั้งใจให้เงียบกว่าชื่อ การคลี่ตัวอักษรจะสวนเจตนา
   - `.totalAmount` (-0.04em) — ตัวเลขใหญ่พิเศษ คนละบทบาทกับ --ls-tabular */
const RAW_LETTER_SPACING_CAP = 4;

/* ⭐ **ค่าว่างต้องพูดคำเดียวกันทั้งระบบ: ขีด `—`** (มติผู้ใช้ 2026-08-17
   กลับคำจากมติ 14/08 ที่เคยให้ขึ้น `N/A` — ด่านนี้ยังทำงานเหมือนเดิม เปลี่ยนแค่คำปลายทาง)

   เดิม "ไม่มีค่า" ถูกเขียนกระจายเป็น `-` `—` `.` แล้วแต่คนเขียน (355 จุด 114 ไฟล์)
   ⇒ คนอ่านตารางเดียวกันเห็นหลายแบบในแถวเดียว และแยกไม่ออกว่า "ยังไม่กรอก" กับ
   "กรอกขีดมา" ต่างกันไหม · ตอนนี้ทุกที่ที่แสดงผลต้องผ่าน `naText()` จาก lib/format
   (ขีดที่เขียนดิบยังผิดอยู่ แม้ตัวอักษรจะหน้าตาเหมือน `NA` — ต้องมาจากที่เดียว)

   ⚠️ ตรวจเฉพาะ `src/app` กับ `src/components` (ชั้นที่แสดงผล) — `src/lib` ไม่นับ
   เพราะเป็นฟังก์ชันข้อมูลกับตัวประกอบเอกสาร: ใส่ค่าว่างลงไปจะกลายเป็น *ข้อมูล* ไม่ใช่
   การแสดงผล (เช่น `scope.js` คืน id, `quotationMasterTemplate` แตะแล้วกระทบ
   ลายเซ็นอนุมัติของใบเสนอราคา) ⇒ ที่นั่นตัดสินทีละจุดด้วยมือเท่านั้น */
const naFallbackViolations = [];

const rawColorViolations = [];
const typeScaleViolations = [];
const fontWeightViolations = [];
const fontFamilyViolations = [];
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

/* ไฟล์ที่ได้รับอนุญาตให้ใช้ `family="matrix"` (คอลัมน์แรกแช่แข็ง) — 9 ไฟล์ 15 จุด
   ณ 2026-07-31 · ดูเหตุผลและข้อควรระวังที่จุดตรวจด้านล่าง */
const MATRIX_FAMILY_ALLOWLIST = new Set([
  "src/app/sahamit/forecast/page.js",
  "src/app/sahamit/reconcile/page.js",
  "src/components/sahamit/CellDetailModal.js",
  "src/components/sahamit/GrowthView.js",
  "src/components/sahamit/PoVsFcView.js",
  "src/components/sahamit/RoundComparison.js",
  "src/components/salesPlanning/dashboard/performance/MorningBoard.js",
  "src/components/salesPlanning/dashboard/performance/YearHeatmap.js",
  // บอร์ดตารางผลิต (P-3): 28 คอลัมน์วัน เลื่อนแนวนอนแน่นอน — ชื่อไลน์ต้องอ่านได้
  // ตลอดการเลื่อน ไม่งั้นไม่รู้ว่ากำลังดูแถวไหน · เป็นการใช้ที่ตรงเจตนาของ matrix
  "src/app/production/board/page.js",
  // จัดคิวช่าง: ช่าง × 7 วัน กว้างขั้นต่ำ 900px — เหตุผลเดียวกับบอร์ดตารางผลิตเป๊ะ
  // 🐞 เดิมส่งตระกูล grid ซึ่งไม่มีอยู่จริงในระบบตาราง ⇒ คอลัมน์ชื่อช่างไม่ตรึง
  // เลื่อนไปทางขวาแล้วไม่รู้ว่าดูแถวของใคร (แก้ 2026-08-28)
  // ⚠️ ห้ามใส่เครื่องหมายคำพูดคู่ในคอมเมนต์บล็อกนี้ — ตัวอ่านลิสต์ของ
  //    matrixFamily.test.mjs เก็บทุกสตริงที่อยู่ในคู่เครื่องหมายนั้นมาเป็นรายชื่อไฟล์
  "src/app/service/schedule/page.js",
]);
const matrixFamilyViolations = [];

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
  /* `family="matrix"` ไม่ใช่แค่ชื่อ — มันตรึงคอลัมน์แรก (sticky + พื้นทึบ + ผสมสี hover)
     และตั้งความสูงแถวเป็น 48px ตารางธรรมดาที่เผลอใส่จะได้คอลัมน์แรกแช่แข็งโดยไม่มี
     ใครสั่ง ซึ่งเห็นเฉพาะตอนเลื่อนแนวนอน = บั๊กที่หาสาเหตุยากมาก
     ลิสต์นี้จึงเป็นเพดาน: **เพิ่มไฟล์ใหม่ไม่ได้** ของใหม่ที่อยากได้คอลัมน์ตรึงต้องมา
     คุยกันก่อน (ที่มา: กฎนี้ Codex เขียนไว้ในสาขา table-visual-parity ยกมาเขียนใหม่
     บนฐานปัจจุบัน 2026-07-31)

     ⚠️ ลิสต์นี้สะท้อน "ของที่มีอยู่วันนี้" ไม่ได้แปลว่าทั้ง 8 ไฟล์ใช้ matrix ถูกต้อง —
     Codex เคยเสนอให้ 4 ไฟล์ของสหมิตร (CellDetailModal · GrowthView · PoVsFcView ·
     RoundComparison) เปลี่ยนเป็น `list` เพราะไม่ได้ต้องการคอลัมน์ตรึง แต่การสลับ
     เปลี่ยนหน้าตาจริง (แถว 48→52px · พื้นคอลัมน์แรก) ต้องมีคนเปิดหน้าดูก่อนตัดสิน */
  const matrixHits = [...source.matchAll(/<Table(?:Scroll|Shell)\b[^>]*\bfamily=["']matrix["']/g)];
  if (matrixHits.length && !MATRIX_FAMILY_ALLOWLIST.has(rel)) {
    matrixFamilyViolations.push(`${rel} (${matrixHits.length} จุด)`);
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
    /* ⚠️ ข้ามบล็อก `@font-face` — descriptor ของ `@font-face` **ต้องเป็นเลขจริง**
       เขียน `var(--fw-…)` ไม่ได้ตามสเปก (custom property ใช้ใน @font-face ไม่ได้)
       นี่คือที่เดียวที่เลขน้ำหนักดิบถูกต้อง และ fontWeightScale.test.mjs อ่านจากตรงนั้น
       เพื่อเช็คว่าโทเคน --fw-* ทุกตัวมีน้ำหนักที่โหลดมาจริงรองรับ */
    let inFontFace = false;
    source.split(/\r?\n/).forEach((line, index) => {
      if (/@font-face\s*\{/.test(line)) inFontFace = true;
      else if (inFontFace && line.trim() === "}") inFontFace = false;
      if (inFontFace) return;
      const cssHit = line.match(/font-weight:\s*(\d+)/);
      if (cssHit) {
        fontWeightViolations.push(`${rel}:${index + 1} font-weight: ${cssHit[1]} → var(--fw-…)`);
      }
      for (const hit of line.matchAll(/fontWeight:\s*(?:"(\d+)"|'(\d+)'|(\d+))(?=\s*[,}])/g)) {
        fontWeightViolations.push(`${rel}:${index + 1} fontWeight: ${hit[1] ?? hit[2] ?? hit[3]} → var(--fw-…)`);
      }
    });
  }

  /* ── ตัวพิมพ์ต้องมาจากโทเคน — ระบบมี **ฟอนต์เดียว** (มติผู้ใช้ 2026-08-09) ──
     ชั้นพิมพ์เคยคุมแค่ *ขนาด* กับ *น้ำหนัก* ไม่เคยแตะ `font-family` เลย ผลคือ
     `font-mono` งอกไปถึง 139 จุด/34 ไฟล์ แล้วลาก IBM Plex Mono (ซึ่ง**ไม่มีชุดไทย**)
     มาทับ ฿ และข้อความไทยจนตกไปใช้ฟอนต์ระบบ = ตาเห็นฟอนต์ปนกัน 5 แบบ
     ถ้าไม่มีกฎนี้ มันจะงอกกลับมาแน่นอนทุกฟีเจอร์ใหม่

     ที่อนุญาต: `var(--font-…)` · `inherit` · `initial` · `unset` · `revert`
     ยกเว้นทั้งไฟล์:
       · `src/components/documents/` + `src/lib/print*` `src/lib/sales/*Document*`
         `src/lib/sales/*Template*` — หน้าต่างพิมพ์ประกอบ HTML เองและไม่โหลด
         globals.css โทเคนจึงไม่มีค่าที่นั่น
     ยกเว้นรายบรรทัด: `.textarea-premium` ใน globals.css — กล่องวางข้อมูลดิบ
       (JSON/ล็อก) ที่ความกว้างเท่ากันมีหน้าที่จริง · ใช้สแตกของ OS ไม่ใช่เว็บฟอนต์ */
  const FONT_FAMILY_PRINT_EXEMPT = /^src\/(components\/documents\/|lib\/(printTheme|sales\/quotation(Document|Master)))/;
  if (!FONT_FAMILY_PRINT_EXEMPT.test(rel)) {
    /* ⚠️ ข้ามบล็อก `@font-face` — เป็นที่ **ประกาศ** ชื่อฟอนต์ ไม่ใช่ที่ *ใช้*
       ต้องเขียนชื่อจริงตามสเปก (`var()` ใน @font-face ไม่ทำงาน)
       ที่ใช้จริงยังต้องผ่าน `var(--font-sans)` เหมือนเดิมทุกจุด */
    let inFace = false;
    source.split(/\r?\n/).forEach((line, index) => {
      if (/@font-face\s*\{/.test(line)) inFace = true;
      else if (inFace && line.trim() === "}") inFace = false;
      if (inFace) return;
      for (const hit of line.matchAll(/font-family:\s*([^;}]+)/g)) {
        const value = hit[1].trim();
        if (/^var\(--font-/.test(value)) continue;
        if (/^(inherit|initial|unset|revert)\b/.test(value)) continue;
        // ข้อยกเว้นเดียวของระบบ — ประกาศไว้ที่ globals.css พร้อมเหตุผลเต็ม
        if (rel === "src/app/globals.css" && /ui-monospace/.test(value)) continue;
        fontFamilyViolations.push(`${rel}:${index + 1} font-family: ${value} → var(--font-…)`);
      }
      for (const hit of line.matchAll(/fontFamily:\s*["']([^"']*)["']/g)) {
        const value = hit[1].trim();
        if (/var\(--font-/.test(value)) continue;
        if (/^(inherit|initial|unset|revert)$/.test(value)) continue;
        fontFamilyViolations.push(`${rel}:${index + 1} fontFamily: "${value}" → var(--font-…)`);
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

  /* ค่าว่างที่ยังเขียนเป็นขีด/จุดดิบในชั้นแสดงผล — ต้องเป็น 0 เสมอ ใช้ `naText()` แทน
     ⚠️ ไม่นับในคอมเมนต์ (บางคอมเมนต์อธิบายกับดัก `x || "-"` ไว้โดยเจตนา) */
  if (rel.startsWith("src/app/") || rel.startsWith("src/components/")) {
    source.split(/\r?\n/).forEach((line, index) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) return;
      /* สองรูปที่เจอจริงในโค้ดนี้: `x || "-"` กับ `cond ? y : "-"` */
      if (/(?:\|\||\?\?)\s*(?:"(?:-|—|–|\.)"|'(?:-|—|–|\.)')/.test(line)) {
        naFallbackViolations.push(`${rel}:${index + 1} ค่าว่างต้องผ่าน naText() ไม่ใช่ขีดดิบ`);
      }
      if (/:\s*(?:"(?:-|—|–)"|'(?:-|—|–)')(?=\s*[),;}\]])/.test(line)) {
        naFallbackViolations.push(`${rel}:${index + 1} ค่าว่างใน ternary ต้องเป็น NA ไม่ใช่ขีดดิบ`);
      }
      /* ขีดที่เขียนเป็นข้อความใน JSX ตรง ๆ — `<span>-</span>` */
      if (/>\s*(?:-|—|–)\s*</.test(line)) {
        naFallbackViolations.push(`${rel}:${index + 1} ขีดใน JSX ต้องเป็น {NA}`);
      }
    });
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

/* รูที่สองกฎข้างบนมองไม่เห็นทั้งคู่: `styles.foo` ที่ชี้ไปคลาสซึ่งไม่มีอยู่จริงในชีต
   ที่ไฟล์นั้น import มา — ดูเหตุผลเต็ม + เหตุการณ์จริงใน scripts/uiCssModuleImports.mjs
   ⚠️ ไม่มีเพดานให้รูด กฎนี้ต้องเป็น 0 เสมอ */
const cssModuleImports = checkCssModuleImports(root, files);

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

/* ⚠️ `RegistryDetailShell` นับเป็นเปลือกด้วย — มันไม่ใช่เปลือกที่เขียนเอง แต่เป็น
   เปลือกที่ **ประกอบจากของกลาง** (`Workspace` + `DetailPage` + `DocumentControlCard`)
   แล้วให้สองทะเบียนใช้ร่วมกัน · เจตนาของกฎนี้คือ "ห้ามหน้าเขียนเปลือกเอง" ไม่ใช่
   "ห้ามยกเปลือกที่ใช้ซ้ำออกมาเป็นคอมโพเนนต์" — ซึ่งเป็นสิ่งที่ AGENTS.md สั่งให้ทำ */
/* `TeamManager` เข้าเกณฑ์เดียวกับ `RegistryDetailShell` — เปลือกที่ประกอบจากของกลาง
   (`Workspace`) แล้วให้หน้าจัดทีมของหลายฝ่ายใช้ร่วมกัน (`/sa/teams` · `/service/teams`)
   ⚠️ ถ้าเขียนหน้าแยกฝ่ายละไฟล์แทน มันจะเพี้ยนหากันภายในสองเดือน ซึ่งเป็นสิ่งที่
   AGENTS.md สั่งห้ามไว้ตรง ๆ */
const shellPattern = /components\/ui\/(?:Workspace|DetailPage)|RegistryDetailShell|TeamManager|salesPlanning\/SaWorkspace|<Workspace\b|<SaWorkspace\b|<SaPageShell\b|premium-header|home-hub|login-/;
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
  ...fontFamilyViolations.map((item) => `ตัวพิมพ์นอกโทเคน (ระบบมีฟอนต์เดียว): ${item}`),
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
    ? [`ความสูงบรรทัดเลขดิบเพิ่มขึ้น: ${rawLineHeightCount} > เพดาน ${RAW_LINE_HEIGHT_CAP} — หยิบขั้นจาก --lh-* (ข้อความไทยต้อง ≥ 1.65)`]
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
  ...cssModuleImports.unresolved.map((item) => `import สไตล์ชีตที่ไม่มีอยู่จริง: ${item}`),
  ...cssModuleImports.missing.map((item) => `อ้างคลาสที่ไม่มีใน CSS module ที่ import มา: ${item}`),
  ...cssModuleImports.crossDirectory.map(
    (item) => `*.module.css ถูกยืมข้ามโฟลเดอร์ (ของใช้ร่วมไปอยู่ globals.css หรือ components/ui/): ${item}`,
  ),
  ...wrapperClassViolations.map((item) => `คลาสกล่องครอบถูกใส่ที่ control โดยตรง: ${item}`),
  ...smoothedLineViolations.map((item) => `smoothed chart line bypasses chartTheme contract: ${item}`),
  ...nativeFeedbackViolations.map((item) => `native alert/confirm/prompt bypasses feedback foundation: ${item}`),
  ...staleNativeFeedbackDebt.map((item) => `หนี้ prompt() เก่าลดได้แล้ว — รูดเพดาน nativeFeedbackDebt ลง: ${item}`),
  ...tableContractViolations.map((item) => `table bypasses TableScroll contract: ${item}`),
  ...matrixFamilyViolations.map((item) => `ตารางธรรมดาขอคอลัมน์แรกแช่แข็ง (family="matrix") โดยไม่ได้อยู่ในลิสต์: ${item}`),
  ...chartContractViolations.map((item) => `chart bypasses ChartCanvas contract: ${item}`),
  ...floatingSurfaceViolations.map((item) => `floating panel needs var(--panel-float) or backdrop-filter: ${item}`),
  ...crossLayerOverrideViolations.map((item) => `CSS module overrides a legacy global class instead of removing it: ${item}`),
  ...budgetOver.map((item) => `legacy budget exceeded — PR นี้เพิ่มชั้นเก่า: ${item}`),
  ...budgetUnder.map((item) => `legacy budget ลดได้แล้ว — รูดเพดานลงด้วย \`npm run audit:ui -- --update-budget\`: ${item}`),
  ...forbiddenMaterialPackages.map((item) => `forbidden Material dependency: ${item}`),
  ...naFallbackViolations,
  ...(legacySalesModule ? ["sales-only workspace stylesheet still exists"] : []),
  ...removedCompatibilityFiles.map((item) => `removed compatibility file returned: ${item}`),
  ...legacyCompatibilityImports.map((item) => `legacy compatibility import returned: ${item}`),
];

console.log(`UI audit: ${pageFiles.length} routes (${visualPageFiles.length} visual, ${pageFiles.length - visualPageFiles.length} redirect)`);
console.log(`Design-shell coverage: ${shellPages.length}/${visualPageFiles.length} visual routes`);
console.log(`Runtime raw-color violations: ${rawColorViolations.length}`);
console.log(`Type-scale violations (font-size นอกโทเคน): ${typeScaleViolations.length}`);
console.log(`Font-weight violations (นอกโทเคน --fw-*): ${fontWeightViolations.length}`);
console.log(`Font-family violations (นอกโทเคน --font-*): ${fontFamilyViolations.length}`);
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
console.log(
  `ตัวอ้าง styles.* ที่ไม่มีคลาสจริง: ${cssModuleImports.missing.length}` +
    ` · module.css ที่ถูกยืมข้ามโฟลเดอร์: ${cssModuleImports.crossDirectory.length} (ต้องเป็น 0 ทั้งคู่)`,
);
console.log(`Wrapper-only class on a control: ${wrapperClassViolations.length}`);
console.log(`ค่าว่างที่ยังเป็นขีดดิบในชั้นแสดงผล (ต้องเป็น 0 — ใช้ naText): ${naFallbackViolations.length}`);
console.log(`Direct smoothed-line violations: ${smoothedLineViolations.length}`);
const nativeFeedbackDebtTotal = Object.values(nativeFeedbackDebt).reduce((sum, n) => sum + n, 0);
console.log(`Native feedback violations: ${nativeFeedbackViolations.length} (หนี้ prompt() เก่าที่ยกเว้นไว้ ${nativeFeedbackDebtTotal} จุด)`);
console.log(`Table contract violations: ${tableContractViolations.length}`);
console.log(`family="matrix" นอกลิสต์: ${matrixFamilyViolations.length} (อนุญาต ${MATRIX_FAMILY_ALLOWLIST.size} ไฟล์)`);
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
