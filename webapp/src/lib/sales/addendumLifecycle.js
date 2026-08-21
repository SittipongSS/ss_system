// ── เส้นชีวิตของ "บันทึกเพิ่มเติมสัญญา" (mig 0282) ──────────────────────────
//
// โครงเดียวกับสัญญา — สั้นกว่าเพราะไม่มีฉบับแก้ไข (บันทึกที่ผิดให้ยกเลิกแล้วทำใบใหม่
// ซึ่งได้ "ครั้งที่" ถัดไปเอง ⇒ ไม่ต้องมีสายฉบับซ้อนอีกชั้น)
import { defineLifecycle } from "@/lib/recordLifecycle";
import { ADDENDUM_STATUS_LABELS, canCancelAddendum, canIssueAddendum } from "@/lib/sales/contractAddenda";

const STATUS_TONE = {
  draft: "neutral",
  awaiting_signature: "warning",
  signed: "success",
  cancelled: "danger",
};

const STATUS_DESCRIPTION = {
  draft: "ยังไม่ออกเลขที่ — ตารางสูตรตรึงมาจากคำร้องแล้ว แก้วันที่/ผู้ลงนามได้",
  awaiting_signature: "ออกเลขแล้ว เนื้อถูกตรึง — พิมพ์ส่งลูกค้าเซ็นแล้วอัปโหลดฉบับลงนามกลับ",
  signed: "ลงนามครบแล้ว — ถือเป็นส่วนหนึ่งของสัญญาแม่ตามข้อ 2 ของบันทึก",
  cancelled: "ยกเลิกแล้ว — เหตุผลอยู่ในใบและในประวัติ",
};

const STEPS = [
  { id: "draft", label: "ร่าง", hint: "ตรวจตารางสูตรและวันที่", statuses: ["draft"] },
  { id: "sign", label: "รอลงนาม", hint: "พิมพ์ส่งลูกค้าเซ็น", statuses: ["awaiting_signature"] },
  { id: "done", label: "ลงนามแล้ว", statuses: ["signed"] },
];

export function buildAddendumLifecycle({ canEdit = false } = {}) {
  return defineLifecycle({
    entity: "contract_addendum",
    noun: "บันทึกเพิ่มเติม",
    statuses: Object.fromEntries(Object.entries(ADDENDUM_STATUS_LABELS).map(([key, label]) => [
      key,
      { label, tone: STATUS_TONE[key], description: STATUS_DESCRIPTION[key] },
    ])),
    steps: STEPS,
    cancelledStatuses: ["cancelled"],
    transitions: [
      {
        id: "issue",
        label: "ออกบันทึก",
        rowLabel: "ออกเลข",
        rowTone: "blue",
        kind: "submit",
        slot: "primary",
        from: ["draft"],
        to: "awaiting_signature",
        visible: () => canEdit,
        allow: (addendum) => (canIssueAddendum(addendum) ? true : "ออกได้เฉพาะบันทึกที่ยังเป็นร่าง"),
        confirm: {
          title: "ออกเลขที่บันทึกและตรึงเนื้อเอกสาร",
          message: "เลขที่บันทึกจะต่อจากเลขสัญญาแม่ (เช่น CT-26080001-0-A1) และเนื้อเอกสารจะถูกตรึง "
            + "หลังจากนี้แก้ไม่ได้ ต้องยกเลิกแล้วทำฉบับใหม่ · ใบจะย้ายไปสถานะ “รอลงนาม”",
          confirmLabel: "ออกบันทึก",
        },
      },
      {
        id: "cancel",
        label: "ยกเลิกบันทึก",
        rowLabel: "ยกเลิก",
        rowTone: "red",
        kind: "cancel",
        slot: "danger",
        from: ["draft", "awaiting_signature"],
        to: "cancelled",
        reason: "required",
        visible: () => canEdit,
        allow: (addendum) => (canCancelAddendum(addendum) ? true : "บันทึกที่ลงนามแล้วยกเลิกที่นี่ไม่ได้"),
        confirm: {
          title: "ยกเลิกบันทึกฉบับนี้",
          message: "ใบจะถูกปิดพร้อมเหตุผลที่บันทึกไว้ และพิมพ์ออกมาพร้อมลายน้ำ “ยกเลิก” "
            + "· ทำบันทึกใหม่ได้ โดยจะได้ครั้งที่ถัดไป",
          confirmLabel: "ยกเลิกบันทึก",
        },
      },
    ],
  });
}
