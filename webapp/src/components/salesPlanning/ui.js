"use client";

import { Trophy } from "lucide-react";
import { DEAL_TYPE_LABELS, DEFAULT_PROBABILITY_BY_STAGE, normalizeDealType, STAGE_LABELS } from "@/lib/salesPlanning";
import { FORECAST_LEVELS, snapForecastLevel } from "@/lib/sales/forecastLevels";
import { fmtMoney } from "@/lib/format";
import { contractKindLabel, contractStatusLabel, contractStatusTone } from "@/lib/sales/contracts";
import UiKpiCard from "@/components/ui/KpiCard";

export { default as MonthPicker } from "@/components/ui/MonthPicker";
export { MONTH_LABELS, monthsForYear, thisMonth, yearOfMonth } from "@/lib/datePeriods";
import { businessLineLabel, businessLineTone, isBusinessLine } from "@/lib/master/businessLines";
import { TEAMS } from "@/lib/permissions";

// Shared presentational helpers for the Sales Planning pages (overview / deals /
// targets). Kept in one place so the split pages render identical badges/cards.

export const initialDealForm = {
  id: null,
  title: "",
  customerId: "",
  customerName: "",
  projectId: "",
  ownerId: "",   // ผู้รับผิดชอบ (AE) — ว่าง = ผู้สร้างเป็นเจ้าของเอง (server เติมให้)
  // ทีมที่ดีลใบนี้จะถูกนับเข้า — ว่าง = ทีมหลักของเจ้าของ (server เติมให้)
  // ช่องนี้โผล่บนฟอร์มเฉพาะตอนเจ้าของอยู่หลายทีม (มติ 2026-08-11)
  team: "",
  // ⚠️ ไม่มี default (มติผู้ใช้ 2026-08-08: "สถานะต้องบังคับเลือก") — เดิมเป็น "lead"
  // เงียบ ๆ ทำให้ดีลใหม่เกิดที่ลีดทั้งที่คนสร้างไม่เคยตัดสินใจ · จากลีดจริงยังได้
  // "qualified" จาก firstDeal/nextDeal เหมือนเดิม (นั่นคือการตัดสินใจของ flow)
  stage: "",
  // ดีลเก่าจากระบบเดิม — เปิดขั้นปลาย Won/Lost ตอนสร้าง (metadata.legacy)
  legacy: false,
  // สายธุรกิจ (mig 0275) — PRODUCT | SERVICE · บังคับเลือกตอนสร้าง ห้าม default
  // (ขั้นตอนไทม์ไลน์ของสองสายเป็นคนละชุด — เดาให้ = ได้ไทม์ไลน์ผิดสายเงียบ ๆ)
  line: "",
  dealType: "",  // SCENT | NPD | RE-ORDER — บังคับเลือกตอนสร้าง (ห้าม default NPD เงียบ ๆ:
                 // เดิม default NPD ทำให้คนกดสร้างโดยไม่เลือก → ได้ template ผิดประเภท มติ 2026-07-21)
  formulaName: "",  // ชื่อสูตรกลิ่น (SCENT — จุดปลั๊กอิน RD ในอนาคต)
  brand: "",        // ชื่อแบรนด์ (เลือกจากแบรนด์ของลูกค้า) — เก็บใน metadata.brand
  /* มูลค่าคาดการณ์แยกตามหมวดสินค้า (มติผู้ใช้ 2026-08-17 · mig 0264)
     [{ categoryCode, qty, unit, unitPrice, note }] — ยอดรวม (`projectValue`) และ
     หมวดของดีล (`categoryCode` = หมวดของแถวแรก) คิดฝั่ง server ทั้งคู่
     ⇒ ฟอร์ม **ไม่มี** ช่อง categoryCode / projectValue ให้กรอกเองอีกแล้ว */
  valueItems: [],
  // ยอดรวมของดีลที่โหลดมา — อ่านอย่างเดียว (ดีลเก่าที่ยังไม่มีแถวใช้โชว์ยอดเดิม)
  projectValue: "",
  // ผูกกับขั้นตั้งต้นข้างบน ไม่ใช่เลขลอย — ของเดิมเป็น "50" (= ออกใบเสนอราคาแล้ว)
  // ทั้งที่ดีลใหม่ยังอยู่ขั้น 'lead' · ฝั่ง server คิดใหม่จากกติกาอยู่แล้ว ค่านี้มีไว้ให้
  // ช่องในฟอร์มโชว์ค่าที่จะได้เท่านั้น
  probability: String(DEFAULT_PROBABILITY_BY_STAGE.lead),
  // ไม่มี forecastMonth แล้ว (มติผู้ใช้ 2026-07-16) — เดือน FC อนุมานจาก expectedCloseDate ฝั่ง server
  expectedCloseDate: "",
  startDate: "",   // วันที่เริ่มดีล (mig 0095) — ใช้เป็น anchor gen ไทม์ไลน์
  endDate: "",
  notes: "",
};

// ป้ายประเภทดีล — สีคงที่ทั้งระบบ: SCENT=amber (งานกลิ่น) · NPD=blue (พัฒนาสินค้า)
// · RE-ORDER=teal (ผลิตซ้ำ) · OTHER=violet (อื่นๆ — ประเภทเดียวที่ไม่ก่อตั้งโครงการ
// จึงให้สีนอกชุดสามสีของเส้นทางผลิต). ใช้ทุกหน้า sales ให้อ่านประเภทได้ด้วยตาเดียว.
export const DEAL_TYPE_COLORS = { SCENT: "var(--amber)", NPD: "var(--blue)", "RE-ORDER": "var(--teal)", OTHER: "var(--violet)" };
/* ป้ายทั้งสามตัวรับ `className` เพิ่มได้ — ตารางส่งคลาสของตัวเองมาคุม **ความกว้าง**
   ให้ป้ายในคอลัมน์เดียวกันเท่ากันหมด (มติผู้ใช้ 2026-08-05: อ่านเป็นคอลัมน์ ไม่ใช่
   ก้อนที่กว้างตามความยาวข้อความของแต่ละแถว)
   ⚠️ ความกว้างต้องมาจากฝั่งผู้เรียก ไม่ใช่ฝังในนี้ — helper เดียวกันนี้ยังถูกใช้บน
   การ์ด/หน้ารายละเอียดที่ป้ายควรพอดีข้อความ ไม่ใช่ยืดเต็มคอลัมน์
   ⚠️ CSS module เอื้อมไปแก้ `.ui-badge` เองไม่ได้ (audit ห้าม cross-layer override)
   การเปิดช่อง className จึงเป็นทางเดียวที่ตารางจะคุมได้ */
const badgeClass = (extra) => ["ui-badge", extra].filter(Boolean).join(" ");

export function dealTypeBadge(type, className = "") {
  const t = normalizeDealType(type);
  return (
    <span className={badgeClass(className)} style={{ color: DEAL_TYPE_COLORS[t] }}>
      {t}
    </span>
  );
}

/* สายธุรกิจของดีล (mig 0275) — ป้ายชุดเดียวกับที่หน้ารวมโครงการใช้ (โทนจากทะเบียน
   กลาง lib/master/businessLines) เพื่อให้ "สายบริการ" หน้าตาเหมือนกันทั้งเว็บ
   ดีลเก่าที่ยังไม่ระบุสายคืน null — ผู้เรียกเลือกเองว่าจะขึ้นตัวทวงหรือเงียบ */
export function businessLineBadge(line, className = "") {
  if (!isBusinessLine(line)) return null;
  return (
    <span className={badgeClass(className)} data-tone={businessLineTone(line) || undefined}>
      {businessLineLabel(line)}
    </span>
  );
}

// โอกาสที่จะปิดได้ (FC%) — นิยามย้ายไป lib/sales/forecastLevels.js (แหล่งเดียวที่ route
// ฝั่ง server ใช้ร่วมได้ เพราะไม่มี JSX). re-export ไว้ให้หน้าเดิมที่ import จากที่นี่
export { FORECAST_LEVELS, snapForecastLevel };

/* โทนสีของโอกาส — สีจริงอยู่ที่คลาส fc-level-* ของป้ายใน globals.css **ที่เดียว**
   เดิมแมปสีเขียนเป็น style ในฟังก์ชันนี้ ป้ายที่โชว์ % ดิบ (ลิ้นชักเจาะ FC) จึงยืมสี
   ไม่ได้นอกจากก๊อปแมปไปอีกชุด — แยกออกมาเป็นคลาสแล้วทั้งสองที่อ้างนิยามเดียวกัน */
export const forecastToneClass = (probability) => `fc-level-${snapForecastLevel(probability)}`;

export function forecastBadge(probability, className = "") {
  const p = snapForecastLevel(probability);
  return (
    <span className={badgeClass([forecastToneClass(p), className].filter(Boolean).join(" "))}>
      FC {p}%
    </span>
  );
}

// Roles that can own a per-person sales target. AC (Account Coordinate) is
// back-office and does not carry a sales target, so it is excluded; ae_supervisor
// sets team-level targets, not per-person, so it is excluded too.

export const TARGET_OWNER_ROLES = ["senior_ae", "ae"];
/* ลำดับทีมมาตรฐาน KA → ODM → SV (คอลัมน์/แถวหน้าวางเป้า และการจัดกลุ่มภาพรวม)
   ⚠️ **ไม่ประกาศรายการเอง** — เป็นชื่อเรียกอีกชื่อของ `TEAMS` (งวด T-5)
   ของเดิมเขียนรายการซ้ำไว้ที่นี่แล้วเรียงไม่ตรงกับตัวแม่ ⇒ หน้าวางเป้ากับหน้าผู้ใช้
   เรียงทีมคนละแบบมาตลอด */
export const SALES_TEAMS = TEAMS;

/* ป้ายของตัวสลับขอบเขต — หน้าคิวลีดกับหน้าไปป์ไลน์ดีลใช้ชุดเดียวกัน
   (ตัวเลือกที่แต่ละ role ได้มาจาก leadScopes/salesDealScopes ใน permissions.js) */
export const SCOPE_LABELS = { mine: "ของฉัน", team: "ทีม", all: "ทั้งหมด" };

/* เงินในแดชบอร์ด/ตารางสรุปแผนขาย — **เต็มหลักเสมอ** (มติเจ้าของระบบ 2026-08-31)
   เดิมเป็นรูปแบบย่อ (฿x.xxM / ฿x.xxK) ⇒ ยอดเป้า/ยอด Won ที่คนกดเข้ามาอ่านเอาไป
   ตรวจกับเอกสารไม่ได้ · ผู้ใช้ helper นี้คือหน้าวางเป้า (คอลัมน์รวมทั้งปี + แถวรวม
   ท้ายตาราง + บรรทัด "เหลืออีก/เกินเป้า") และลิ้นชักเจาะดีล — ทั้งสองตารางกว้างตาม
   เนื้อหาและเลื่อนแนวนอนอยู่แล้ว ความกว้างขั้นต่ำในโมดูล CSS เป็นพื้นล่าง ไม่ใช่เพดาน
   ⚠️ จุดที่คับที่สุดคือ `GapNote` ของหน้าวางเป้า (`.gapNote` ไม่ตัดบรรทัด และอยู่ใน
   คอลัมน์ชื่อที่ตรึงไว้) — เต็มหลักทำให้คอลัมน์ชื่อกว้างขึ้น ไม่ได้ตัดคำหรือทับของข้าง ๆ */
export const money = (value) => fmtMoney(value);

export function coveragePct(won, target) {
  if (!target || target <= 0) return null;
  return Math.round((Number(won || 0) / Number(target)) * 100);
}

export function stageBadge(stage, className = "") {
  const color = {
    lead: "var(--text-3)",
    qualified: "var(--blue)",
    quotation: "var(--amber)",
    timeline_proposed: "var(--blue)",
    awaiting_confirm: "var(--teal)",
    deposit_pending: "var(--violet)",
    won: "var(--green)",
    in_project: "var(--green)",
    lost: "var(--red)",
  }[stage] || "var(--text-3)";
  return (
    <span className={badgeClass(className)} style={{ color }}>
      {stage === "won" && <Trophy size={12} style={{ marginRight: 4, verticalAlign: "-1px" }} />}
      {STAGE_LABELS[stage] || stage}
    </span>
  );
}

// สถานะใบเสนอราคา (คนละชุดกับ stage ของดีล) — closed = ถูกปิดเพราะดีลจบด้วยใบอื่น (mig 0102)
// ⚠️ `sent` = "อนุมัติแล้ว" (มติผู้ใช้ 2026-08-17): ใบเสนอราคาไม่มีสถานะ "ส่งลูกค้า"
// ของตัวเองแล้ว — RPC อนุมัติเป็นคนตั้งค่านี้ (mig 0165) คอลัมน์จึงเป็นแค่ธงภายใน
// คำที่ผู้ใช้เห็นต้องเล่าสี่สถานะเท่านั้น: ร่าง · รออนุมัติ · อนุมัติ · ตีกลับ
// 🔁 ป้ายชุดนี้ยังถูกก๊อปไว้อีก 2 ที่ (quotations/[id]/page.js · pm/ProjectDealsHub.js)
export const QUOTE_STATUS_LABELS = {
  draft: "ฉบับร่าง", sent: "อนุมัติแล้ว", accepted: "Won", rejected: "ถูกปฏิเสธ",
  cancelled: "ยกเลิก", revised: "ถูกแก้ไข (มีฉบับใหม่)", closed: "ปิด (ดีลจบด้วยใบอื่น)",
};
export const QUOTE_STATUS_COLORS = {
  draft: "var(--text-3)", sent: "var(--blue)", accepted: "var(--green)",
  rejected: "var(--red)", cancelled: "var(--red)", revised: "var(--amber)", closed: "var(--text-3)",
};
/* ── สัญญา (mig 0278) ────────────────────────────────────────────────────
   ป้ายสถานะ/ชนิดของสัญญา — ความหมายมาจากทะเบียนกลาง `lib/sales/contracts` (ชื่อโทน)
   ส่วน *สี* อยู่ในคลาสของ globals ทั้งคู่ ไม่ฝัง style ในแท็ก */
const CONTRACT_TONE_CLASS = {
  muted: "",
  warning: "warning",
  success: "success",
  danger: "danger",
};

export function contractStatusBadge(status, className = "") {
  const tone = CONTRACT_TONE_CLASS[contractStatusTone(status)] || "";
  return (
    <span className={badgeClass([tone, className].filter(Boolean).join(" "))}>
      {contractStatusLabel(status)}
    </span>
  );
}

export function contractKindBadge(kind, className = "") {
  return (
    <span className={badgeClass([`contract-${kind}`, className].filter(Boolean).join(" "))}>
      {contractKindLabel(kind)}
    </span>
  );
}

export function quoteStatusBadge(status, className = "") {
  return (
    <span className={badgeClass(className)} style={{ color: QUOTE_STATUS_COLORS[status] || "var(--text-3)" }}>
      {status === "accepted" && <Trophy size={12} style={{ marginRight: 4, verticalAlign: "-1px" }} />}
      {QUOTE_STATUS_LABELS[status] || status}
    </span>
  );
}

export function KpiCard({ icon, label, badge, value, hint, color, interactive = true }) {
  return <UiKpiCard icon={icon} label={label} badge={badge} value={value} hint={hint} color={color} interactive={interactive} />;
}
