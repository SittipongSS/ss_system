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
import { CONTRACT_STATUS_LABELS, canCancelContract, canIssueContract } from "@/lib/sales/contracts";

const STATUS_TONE = {
  draft: "neutral",
  awaiting_signature: "warning",
  signed: "success",
  cancelled: "danger",
};

const STATUS_DESCRIPTION = {
  draft: "ยังไม่ออกเลขที่ — แก้ข้อมูลในใบได้ตามต้องการ",
  awaiting_signature: "ออกเลขแล้ว เนื้อสัญญาถูกตรึง — พิมพ์ส่งลูกค้าเซ็นแล้วอัปโหลดฉบับลงนามกลับ",
  signed: "มีไฟล์ฉบับลงนามครบแล้ว — สัญญามีผลตามวันที่ที่บันทึกไว้",
  cancelled: "ยกเลิกแล้ว — เหตุผลอยู่ในใบและในประวัติ",
};

const STEPS = [
  { id: "draft", label: "ร่าง", hint: "กรอกข้อมูลคู่สัญญาและเงื่อนไข", statuses: ["draft"] },
  { id: "sign", label: "รอลงนาม", hint: "พิมพ์ส่งลูกค้าเซ็น", statuses: ["awaiting_signature"] },
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
    cancelledStatuses: ["cancelled"],
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
        visible: () => canEdit,
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
        id: "cancel",
        label: "ยกเลิกสัญญา",
        rowLabel: "ยกเลิก",
        rowTone: "red",
        kind: "cancel",
        slot: "danger",
        from: ["draft", "awaiting_signature"],
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
