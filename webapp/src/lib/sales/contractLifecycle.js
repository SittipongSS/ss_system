// ── เส้นชีวิตของ "สัญญา" (mig 0278) ─────────────────────────────────────────
//
// แหล่งเดียวที่ตอบว่าใบนี้กดอะไรได้ — การ์ดจัดการบนหน้ารายละเอียดกิน `available()`
// ตัวนี้ · กติกาว่าสถานะไหนทำอะไรได้ยังมาจาก `lib/sales/contracts.js` ตัวเดียวกับที่
// API ใช้ปฏิเสธจริง ไม่ได้เขียนเส้นทางซ้ำที่นี่
//
// ⚠️ **ไม่ได้แทนด่านที่ API** — ที่นี่คือ "ปุ่มควรโผล่ไหม" ส่วน API ตรวจซ้ำเสมอ
//
// ⭐ "บันทึกการลงนาม" **ไม่ได้อยู่ที่นี่** — มันต้องแนบไฟล์ ซึ่ง TransitionDialog
//    ไม่มีชนิดช่องให้ (text/select/person/datetime/money) ⇒ เป็น extraAction ที่เปิด
//    กล่องของตัวเองบนหน้ารายละเอียด · ยัดเป็น transition แล้วผู้ใช้จะเจอกล่องที่กรอก
//    วันที่ได้แต่แนบไฟล์ไม่ได้ ทั้งที่ไฟล์คือเงื่อนไขจริงของขั้นนั้น

import { defineLifecycle } from "@/lib/recordLifecycle";
import {
  CONTRACT_STATUS_LABELS, canCancelContract, canIssueContract, canReviseContract,
  contractReviseBlockReason, isExternalContract,
} from "@/lib/sales/contracts";

const STATUS_TONE = {
  draft: "neutral",
  awaiting_signature: "warning",
  awaiting_approval: "info",
  signed: "success",
  revised: "neutral",
  cancelled: "danger",
};

const STATUS_DESCRIPTION = {
  draft: "ยังไม่ออกเลขที่ — แก้ข้อมูลในใบได้ตามต้องการ",
  awaiting_signature: "ออกเลขแล้ว เนื้อสัญญาถูกตรึง — พิมพ์ส่งลูกค้าเซ็นแล้วอัปโหลดฉบับลงนามกลับ",
  awaiting_approval: "มีไฟล์ฉบับลงนามแล้ว — รอ AE Supervisor รับรองก่อนสัญญาจึงใช้งานได้",
  signed: "รับรองครบแล้ว — สัญญามีผลตามวันที่ที่บันทึกไว้",
  revised: "ถูกแทนที่ด้วยฉบับแก้ไขแล้ว — อ่านอย่างเดียว ฉบับตรึงยังพิมพ์ซ้ำได้",
  cancelled: "ยกเลิกแล้ว — เหตุผลอยู่ในใบและในประวัติ",
};

const STEPS = [
  { id: "draft", label: "ร่าง", hint: "กรอกข้อมูลคู่สัญญาและเงื่อนไข", statuses: ["draft"] },
  { id: "sign", label: "รอลงนาม", hint: "พิมพ์ส่งลูกค้าเซ็น", statuses: ["awaiting_signature"] },
  // ⭐ ขั้นรับรองของ AE Sup (mig 0323) — ต้องเป็นหมุดของตัวเองบนราง ไม่ใช่ซ่อนอยู่ใน
  //    "รอลงนาม" ไม่งั้นคนที่รอจะไม่รู้ว่ารออะไรอยู่
  { id: "approve", label: "รอหัวหน้ารับรอง", hint: "AE Supervisor ตรวจฉบับลงนาม", statuses: ["awaiting_approval"] },
  { id: "done", label: "ลงนามแล้ว", statuses: ["signed"] },
];

export function buildContractLifecycle({ canEdit = false } = {}) {
  return defineLifecycle({
    entity: "contract",
    noun: "สัญญา",
    statuses: Object.fromEntries(Object.entries(CONTRACT_STATUS_LABELS).map(([key, label]) => [
      key,
      { label, tone: STATUS_TONE[key], description: STATUS_DESCRIPTION[key] },
    ])),
    steps: STEPS,
    cancelledStatuses: ["cancelled", "revised"],
    transitions: [
      {
        id: "issue",
        label: "ออกสัญญา",
        rowLabel: "ออกเลข",
        rowTone: "blue",
        kind: "submit",
        slot: "primary",
        from: ["draft"],
        to: "awaiting_signature",
        /* 🔴 **ซ่อน ไม่ใช่บอกเหตุ** — ใบ external ไม่ได้ "ยังออกไม่ได้" แต่ *ไม่มีขั้นนี้เลย*
           (draft → signed ทีเดียวผ่านการอนุมัติของ AE Sup) ⇒ เป็นเรื่องของเส้นทาง
           ไม่ใช่จังหวะเวลา ตรงตามกติกา visible/allow ที่ recordLifecycle เขียนไว้
           🪤 ตกไปแล้วไม่ใช่แค่ปุ่มเทาเกินมา — `issue` ถือ `slot: "primary"` และ
              transition ถูกจัดก่อน extraActions ⇒ มันแย่งช่องปุ่มหลักไปจาก
              "อนุมัติเอกสารแทนสัญญา" แล้วพิมพ์เหตุผลผิดเป็นข้อความเด่นบนการ์ด */
        visible: (contract) => canEdit && !isExternalContract(contract),
        allow: (contract) => (canIssueContract(contract) ? true : "ออกได้เฉพาะใบที่ยังเป็นร่าง"),
        // ⚠️ กล่องยืนยันต้องบอก **ผลที่ตามมา** ไม่ใช่ถามว่าแน่ใจไหม — หลังกดแล้ว
        //    เนื้อแก้ไม่ได้อีก ซึ่งเป็นข้อมูลที่คนกดต้องรู้ *ก่อน* กด
        confirm: {
          title: "ออกเลขที่สัญญาและตรึงเนื้อเอกสาร",
          message: "ระบบจะออกเลขที่สัญญา (CT-YYMMXXXX) และตรึงเนื้อเอกสารตามข้อมูลที่กรอกไว้ "
            + "หลังจากนี้แก้เนื้อไม่ได้ ต้องยกเลิกแล้วออกใบใหม่ · ใบจะย้ายไปสถานะ “รอลงนาม”",
          confirmLabel: "ออกสัญญา",
        },
      },
      {
        /* ⭐ ออกฉบับแก้ไข (มติผู้ใช้ 2026-08-21: "พอออกแล้วต้อง REV เหมือน QT")
           เนื้อของใบที่ออกเลขแล้วแก้ไม่ได้ ⇒ ทางแก้เดียวคือออกแถวใหม่ที่ถือเลขฐานเดิม
           ⚠️ ใบที่ลงนามแล้วไม่มีปุ่มนี้ — ต้องทำบันทึกเพิ่มเติมสัญญา (ข้อ 3.2 ของตัวสัญญา) */
        id: "revise",
        label: "ออกฉบับแก้ไข (Rev.)",
        rowLabel: "ออก Rev.",
        rowTone: "violet",
        kind: "revise",
        slot: "secondary",
        from: ["awaiting_signature"],
        to: "revised",
        visible: () => canEdit,
        allow: (contract) => (canReviseContract(contract) ? true : contractReviseBlockReason(contract)),
        confirm: {
          title: "ออกฉบับแก้ไขของสัญญานี้",
          message: "ระบบจะคัดลอกทั้งใบเป็นร่างใหม่ที่ถือเลขฐานเดิม (เช่น CT-26080001-1) "
            + "แล้วใบนี้จะกลายเป็น “ออกฉบับแก้ไขแล้ว” อ่านอย่างเดียว · ฉบับตรึงของใบนี้ยังพิมพ์ซ้ำได้เหมือนเดิม "
            + "· เลขที่ของฉบับใหม่จะออกตอนกด “ออกสัญญา” อีกครั้ง",
          confirmLabel: "ออกฉบับแก้ไข",
        },
      },
      {
        id: "cancel",
        label: "ยกเลิกสัญญา",
        rowLabel: "ยกเลิก",
        rowTone: "red",
        kind: "cancel",
        slot: "danger",
        from: ["draft", "awaiting_signature", "awaiting_approval"],
        to: "cancelled",
        reason: "required",
        visible: () => canEdit,
        allow: (contract) => (canCancelContract(contract) ? true : "ใบที่ลงนามแล้วยกเลิกที่นี่ไม่ได้"),
        confirm: {
          title: "ยกเลิกสัญญาใบนี้",
          message: "ใบจะถูกปิดพร้อมเหตุผลที่บันทึกไว้ และพิมพ์ออกมาพร้อมลายน้ำ “ยกเลิก” "
            + "· เลขที่ที่ออกไปแล้วจะไม่ถูกนำกลับมาใช้ซ้ำ",
          confirmLabel: "ยกเลิกสัญญา",
        },
      },
    ],
  });
}
