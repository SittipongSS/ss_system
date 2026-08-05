// เส้นชีวิตของ "ดีล" — แหล่งเดียวที่ตอบว่าดีลใบนี้ทำอะไรได้บ้าง (ฝั่ง UI)
//
// ⚠️⚠️ **ดีลไม่เหมือนลีด: "ปิด Won" ไม่ใช่ transition ของดีล**
// ทางเดียวที่ดีลกลายเป็น Won คือ *ยอมรับใบเสนอราคา* (`POST /quotations/[id]/accept` →
// RPC `accept_quotation_atomic`) ซึ่งบังคับหลักฐาน (ประเภทเอกสาร + วันที่ + ไฟล์แนบ ≥1)
// และต้องผ่านการอนุมัติใบเสนอราคาก่อน · `POST /deals/[id]/win` ถูกปิดตายไว้ตอบ 400 เสมอ
// และ `PATCH` ก็ปฏิเสธ `stage:'won'` ที่ส่งมาตรง ๆ
// → ที่นี่จึง **ไม่ประกาศ transition ชื่อ win** เด็ดขาด ถ้าเห็นใครจะเพิ่ม ให้ไปอ่าน
//   `lib/sales/quotationWonEvidence.js` ก่อน
//
// ⚠️ ถอย Won ก็ไม่ใช่ transition ของดีล — เกิดที่ `unaccept_quotation_atomic`
// (ยกเลิกรับใบเสนอราคา) หรือ `cancel_sales_order_with_reversal_atomic` เท่านั้น
// ดู [[won-revert-single-source]]
//
// ⚠️ ด่านจริงอยู่ที่ API เสมอ — ที่นี่คือ "ปุ่มควรโผล่ไหม" ห้ามหลวมกว่า handler

import { defineLifecycle } from "@/lib/recordLifecycle";
import { can } from "@/lib/permissions";
import {
  CLOSED_STAGES,
  DEAL_STAGES,
  STAGE_LABELS,
  WON_STAGES,
  isClosedStage,
  isWonStage,
} from "@/lib/salesPlanning";

/* สถานะ → tone ของป้าย (ชุดคำศัพท์ของ *สถานะ* ไม่ใช่ของปุ่ม) */
const STAGE_TONE = {
  lead: "neutral",
  qualified: "info",
  timeline_proposed: "info",
  quotation: "accent",
  awaiting_confirm: "warning",
  deposit_pending: "warning",
  won: "success",
  in_project: "success",
  lost: "danger",
};

const STAGE_DESCRIPTION = {
  lead: "เพิ่งเปิดดีล ยังไม่ผูกโครงการ",
  qualified: "ผ่านคัดกรองแล้ว — ขั้นถัดไปคือผูกโครงการเพื่อออกใบเสนอราคา",
  timeline_proposed: "มีโครงการ/ไทม์ไลน์แล้ว ออกใบเสนอราคาได้",
  quotation: "ออกใบเสนอราคาแล้ว รอลูกค้าตอบ",
  awaiting_confirm: "ลูกค้ากำลังพิจารณา",
  deposit_pending: "รอมัดจำ",
  won: "ปิดได้แล้ว — ยอดจริงมาจาก ใบสั่งขายที่อนุมัติ",
  in_project: "ปิดได้แล้ว (ข้อมูลเก่า) — ยอดจริงมาจาก ใบสั่งขาย",
  lost: "ไม่สำเร็จ — เหตุผลอยู่ในประวัติ",
};

/* แถบเส้นทางบนการ์ด — ยุบให้เหลือ 4 ขั้นที่คนทำงานแยกออกจริง
   (`in_project` ถูกยุบเข้า won ตั้งแต่ mig 0082 แต่ข้อมูลเก่ายังมี จึงนับเป็นขั้นเดียวกัน) */
const STEPS = [
  { id: "open", label: "เปิดดีล", hint: "คัดกรองและตั้งต้น", statuses: ["lead", "qualified"] },
  { id: "project", label: "ผูกโครงการ", hint: "ต้องมีก่อนออกใบเสนอราคา", statuses: ["timeline_proposed"] },
  { id: "quote", label: "เสนอราคา", hint: "รอลูกค้าตอบ", statuses: ["quotation", "awaiting_confirm", "deposit_pending"] },
  /* ต้องกาง WON_STAGES ห้ามพิมพ์รายชื่อสถานะ Won เองซ้ำ — มีเทสต์ git grep ทั้ง repo
     ห้ามไว้ (นิยามอยู่ที่ salesPlanning.js ที่เดียว) · คอมเมนต์เองก็ห้ามพิมพ์ ตัวสแกน
     ไม่ได้แยกโค้ดกับคอมเมนต์ */
  { id: "won", label: "ปิดได้", hint: "รับใบเสนอราคาแล้ว", statuses: [...WON_STAGES] },
];

/* สิทธิ์แก้ดีลมาจาก API ต่อแถว (`deal.canEdit` = canEditSalesPlanning + inSalesEditScope)
   หน้าเพจคำนวณเองไม่ได้เพราะ scope ผูกกับทีม/เจ้าของ — จึงอ่านค่าที่ API ส่งมา */
const canEdit = (deal) => deal?.canEdit === true;

/* 🐞 UI เคยหลวมกว่า API 3 จุด ตรวจพบ 2026-08-01 — รวมมาไว้ที่นี่ให้ครบ:
   1. ปุ่มลบในหน้ารายการไม่ได้เช็ค "มีใบเสนอราคาที่รับแล้ว" ทั้งที่ API ตอบ 409 เสมอ
      (แม้ superuser) → ผู้ใช้กดแล้วเจอ error ที่เดาไม่ได้
   2. ปุ่มเชื่อมโครงการที่หัวหน้ารายละเอียดไม่ได้เช็ค stage !== 'lost' ทั้งที่ API ตอบ 400
   3. UI ไม่เคยเช็ค `pm:edit` ทั้งที่ link/create-project/timeline ต้องมี — วันนี้ไม่ระเบิด
      เพราะทุก role ที่มี salesplan:edit ก็มี pm:edit ด้วย แต่พอสิทธิ์แยกกันเมื่อไหร่ก็พัง */
const canTouchProject = (deal, user) => canEdit(deal) && can(user?.role, "pm:edit");
const hasAcceptedQuote = (deal) =>
  !!deal?.acceptedQuotationId || !!deal?.metadata?.acceptedQuotationId;

/**
 * @param user  { role, id, team } — ใช้ตัดสินสิทธิ์ที่ไม่ได้มากับ record
 */
export function createDealLifecycle() {
  return defineLifecycle({
    entity: "deal",
    noun: "ดีล",
    /* ⚠️ ดีลเก็บสถานะไว้ที่ `stage` ไม่ใช่ `status` — ค่าเริ่มต้นของ defineLifecycle อ่าน
       `record.status` ซึ่งเป็น undefined ที่นี่ แล้วจะ **ไม่มีปุ่มโผล่เลยสักตัว** เงียบ ๆ */
    statusOf: (deal) => deal?.stage,
    statuses: Object.fromEntries(
      DEAL_STAGES.map((stage) => [stage, {
        label: STAGE_LABELS[stage] || stage,
        tone: STAGE_TONE[stage] || "neutral",
        description: STAGE_DESCRIPTION[stage] || "",
      }]),
    ),
    cancelledStatuses: ["lost"],
    steps: STEPS,
    transitions: [
      {
        /* ผูกโครงการ = ก้าวถัดไปตัวจริงของดีล — เป็น action เดียวในหน้ารายการที่ดัน stage
           (`advanceStage → timeline_proposed`) และเป็นเงื่อนไขก่อนออกใบเสนอราคา
           การลงมือเกิดที่ฟอร์มเลือกโครงการ หน้าจึงดักด้วย onSelect */
        id: "link_project",
        label: "เชื่อมกับโครงการเดิม",
        rowLabel: "เชื่อมโครงการ",
        rowTone: "blue",
        kind: "submit",
        slot: "primary",
        from: DEAL_STAGES.filter((stage) => !CLOSED_STAGES.includes(stage)),
        to: "timeline_proposed",
        visible: (deal, user) => canTouchProject(deal, user) && !deal?.projectId,
      },
      {
        /* สร้างโครงการใหม่ = ปลายทางเดียวกัน (ดีลได้ projectId) แต่คนละฟอร์ม
           อยู่ช่องรองเพราะกรณีปกติคือผูกกับโครงการที่มีอยู่แล้ว */
        id: "create_project",
        label: "สร้างโครงการใหม่",
        rowLabel: "สร้างโครงการ",
        kind: "submit",
        slot: "secondary",
        from: DEAL_STAGES.filter((stage) => !CLOSED_STAGES.includes(stage)),
        to: "timeline_proposed",
        visible: (deal, user) => canTouchProject(deal, user) && !deal?.projectId,
      },
      {
        /* ไม่ไปต่อ — ปิดดีลถาวร
           ⚠️ **บังคับกรอกเหตุผล** ตามมติผู้ใช้ ข้อ 3 (ทุก transition ที่ถอย/ยกเลิก/ปฏิเสธ)
           ของเดิมเขียนว่า "เหตุผล (ไม่บังคับ)" และ API ก็รับ null ได้ — ฝั่ง UI เข้มกว่า API
           ตรงนี้ **ตั้งใจ** เพราะ handler เก็บ lostReason ไว้ให้คนอ่านย้อนหลัง ปล่อยว่างแล้ว
           ประวัติจะบอกแค่ว่า "แพ้" โดยไม่มีใครรู้ว่าทำไม (เข้มกว่าไม่ทำให้ API พัง) */
        id: "lost",
        label: "ปิดดีล — ไม่ไปต่อ",
        rowLabel: "ไม่ไปต่อ",
        kind: "drop",
        from: DEAL_STAGES.filter((stage) => !CLOSED_STAGES.includes(stage)),
        to: "lost",
        reason: "required",
        visible: (deal) => canEdit(deal),
        reasonPolicy: {
          title: "ปิดดีลนี้ — ไม่ไปต่อ",
          description: "ดีลจะถูกปิดถาวร ยอดจะไม่ถูกนับใน forecast อีก",
          label: "เหตุผลที่ไม่ไปต่อ",
          placeholder: "เช่น ลูกค้าเลือกเจ้าอื่น / งบไม่ผ่าน / เลื่อนโครงการไม่มีกำหนด",
        },
      },
    ],
  });
}

/**
 * ลบดีลได้ไหม — เงื่อนไขเดียวกับที่ `DELETE /deals/[id]` บังคับ
 * แยกออกมาเพราะไม่ใช่การย้ายสถานะ (ไม่ได้อยู่ใน lifecycle) แต่ต้องใช้ทั้งแถวและการ์ด
 *
 * @param opts.superuser  admin หรือ ae_supervisor (ข้อกำหนด Won ได้)
 */
export function canDeleteDeal(deal, { role, superuser } = {}) {
  if (role === "admin") return true;            // admin ผ่านทุกด่านด้วย force delete
  if (!canEdit(deal)) return false;
  if (isWonStage(deal?.stage) && !superuser) return false;
  if (hasAcceptedQuote(deal)) return false;      // API ตอบ 409 เสมอ แม้ superuser
  if (deal?.metadata?.sahamitPoId) return false;
  return true;
}

/** ออกใบเสนอราคาได้ไหม — ต้องมีโครงการ + ลูกค้า และดีลยังไม่ปิด */
export function canQuoteDeal(deal) {
  return canEdit(deal) && !!deal?.projectId && !!deal?.customerId && !isClosedStage(deal?.stage);
}

/** transition ที่ยิง `PATCH /deals/[id]` ตรง ๆ (ที่เหลือหน้าพาไปฟอร์มของมันเอง) */
export const DEAL_PATCH_TRANSITIONS = ["lost"];

/**
 * ขั้นที่เลือกได้จากดรอปดาวน์ "สถานะ" ในแถวตาราง (มติผู้ใช้ 2026-08-05)
 *
 * ⚠️ ตัดขั้นที่มี **เส้นทางบังคับของตัวเอง** ออก ทั้งที่ PATCH ยอมรับบางตัว:
 *   won / in_project — ทางเดียวคือรับใบเสนอราคา (PATCH ตอบ 400 ถ้าส่งมาตรง ๆ)
 *   lost             — ต้องกรอกเหตุผล (ดู transition "lost" ข้างบน · reason: required)
 *                      ใส่ไว้ในดรอปดาวน์เมื่อไร = ปิดดีลได้โดยไม่มีเหตุผล ⇒ UI หลวมกว่า
 *                      กติกาของตัวเอง ปิดดีลใช้ "ไม่ไปต่อ" ในเมนูท้ายแถวเหมือนเดิม
 */
export const ROW_EDITABLE_STAGES = DEAL_STAGES.filter(
  (stage) => !CLOSED_STAGES.includes(stage),
);
