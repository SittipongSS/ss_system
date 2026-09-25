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
import { approvalPrompt } from "@/lib/approvalPrompt";
import {
  CONTRACT_STATUS_LABELS, canCancelContract, canIssueContract, canReviseContract,
  contractKindLabel, contractReviseBlockReason, isExternalContract, showSignedCancel, signedCancelEffects,
  signedCancelError,
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

export const STEPS = [
  { id: "draft", label: "ร่าง", hint: "กรอกข้อมูลคู่สัญญาและเงื่อนไข", statuses: ["draft"] },
  { id: "sign", label: "รอลงนาม", hint: "พิมพ์ส่งลูกค้าเซ็น", statuses: ["awaiting_signature"] },
  // ⭐ ขั้นรับรองของ AE Sup (mig 0323) — ต้องเป็นหมุดของตัวเองบนราง ไม่ใช่ซ่อนอยู่ใน
  //    "รอลงนาม" ไม่งั้นคนที่รอจะไม่รู้ว่ารออะไรอยู่
  { id: "approve", label: "รอหัวหน้ารับรอง", hint: "AE Supervisor ตรวจฉบับลงนาม", statuses: ["awaiting_approval"] },
  { id: "done", label: "ลงนามแล้ว", statuses: ["signed"] },
];

/* ⭐ **รางของใบที่ใช้เอกสารภายนอกแทนสัญญาเป็นคนละเส้น** — สายนี้เดิน `draft → signed`
   ทีเดียว (AE Sup อนุมัติเอกสารเป็นด่านเดียวจบ) ⇒ ใช้รางสี่ขั้นร่วมกันแล้วใบ external
   จะโชว์ "รอลงนาม" กับ "รอหัวหน้ารับรอง" เป็นขั้นที่ไม่มีวันเดินผ่าน และหมุดแรกยังสั่ง
   "กรอกข้อมูลคู่สัญญาและเงื่อนไข" ซึ่งเป็นช่องของแม่แบบที่ใบนี้ตั้งใจไม่มี
   ⚠️ ทะเบียนสัญญาวาดรางของตัวเองที่ `contractListTrack.js` (คนละรูปแบบ state) — แยกสาย
      ตามกันไปแล้ว และมีเทสต์ล็อก **คำบนหมุด** ให้ตรงกันสองหน้า · ขยับคำที่นี่ต้องขยับที่นั่นด้วย */
export const EXTERNAL_STEPS = [
  { id: "draft", label: "ร่าง", hint: "แนบเอกสารที่ใช้แทนสัญญา", statuses: ["draft"] },
  { id: "done", label: "อนุมัติใช้แทนสัญญาแล้ว", hint: "AE Supervisor รับรองเอกสาร", statuses: ["signed"] },
];

/* ⭐ **ร่าง external ที่แนบเอกสารแล้ว** (รีวิว 25/09) — หมุดคำเดียวกับ EXTERNAL_STEPS ทุกตัว แต่ขั้นแรกผ่านแล้ว
   และขั้นที่สองเป็นขั้นปัจจุบัน "รอ AE Supervisor อนุมัติ" · ตรงกับรางของทะเบียน/การ์ดสัญญาบน SO
   (`contractListTrack` ธง `_externalDocReady`) — ของเดิมหน้านี้ยังสั่ง "แนบเอกสารที่ใช้แทนสัญญา" ทั้งที่แนบแล้ว
   ขณะที่รางบนแถวเดียวกันในทะเบียนบอกว่ารอผู้อนุมัติ ⇒ สองหน้าห่างกันคลิกเดียวพูดคนละเรื่อง
   ⚠️ `draft` อยู่ในหมุดที่สอง (ไม่ใช่หมุดแรก) คือกลไกที่ทำให้รางเดินหน้า — `railSteps` ใช้หมุดท้ายสุดที่ครอบสถานะ */
export const EXTERNAL_ATTACHED_STEPS = [
  { id: "draft", label: "ร่าง", hint: "แนบเอกสารที่ใช้แทนสัญญาแล้ว", statuses: [] },
  { id: "done", label: "อนุมัติใช้แทนสัญญาแล้ว", hint: "รอ AE Supervisor อนุมัติ", statuses: ["draft", "signed"] },
];

/* ⭐ **เอกสารแทนสัญญาของใบสั่งขายย้อนหลัง** (มติ 22/09/2026 · mig 0374) — หมุดเดียวกับ EXTERNAL_STEPS ทุกคำ
   (ทะเบียนล็อกคำบนหมุดคู่กับชุดนั้น) ต่างแค่คำใบ้: ใบนี้ไม่มีขั้นอนุมัติบนหน้าสัญญา — ฟอร์มคีย์ใบสร้างและแก้
   แล้ว AE Sup อนุมัติพร้อมใบสั่งขาย ⇒ "AE Supervisor รับรองเอกสาร" พาคนไปหาปุ่มที่ถูกซ่อนไว้ */
export const SUBSTITUTE_STEPS = [
  { id: "draft", label: "ร่าง", hint: "แก้ที่ฟอร์มคีย์ใบสั่งขายย้อนหลัง", statuses: ["draft"] },
  { id: "done", label: "อนุมัติใช้แทนสัญญาแล้ว", hint: "อนุมัติพร้อมใบสั่งขายย้อนหลัง", statuses: ["signed"] },
];

/* ── โมดัลยกเลิกสัญญาที่ลงนามแล้ว (มติเจ้าของ 24/09/2026) ──────────────────────────────────────
   ⭐ ข้อความประกอบตอนสร้าง lifecycle (หน้าสัญญาสร้างใหม่เมื่อใบเปลี่ยน) — TransitionDialog อ่าน `confirm`/
      `reasonPolicy` เป็นค่านิ่ง ไม่ใช่ฟังก์ชันของ record · รูปข้อความผ่าน `approvalPrompt` ตัวเดียวกับทุกการอนุมัติ
      (บรรทัดเตือน "ย้อนกลับเองไม่ได้" + "สิ่งที่จะเกิดขึ้นทันที:") */
export function signedCancelDialog({ contract = null, linkedOrder, signedCancel = null } = {}) {
  return approvalPrompt({
    title: "ยกเลิกสัญญาที่ลงนามแล้ว",
    verb: "ยกเลิก",
    subject: [contractKindLabel(contract?.kind), contract?.contractNo].filter(Boolean).join(" "),
    irreversible: true,
    effects: signedCancelEffects({
      contract,
      linkedOrder,
      linkedServiceOrders: signedCancel?.linkedServiceOrders || [],
      liveAddenda: signedCancel?.liveAddenda || 0,
    }),
    confirmLabel: "ยกเลิกสัญญา",
  });
}

/* `substitute` = เอกสารแทนสัญญาของใบสั่งขายย้อนหลัง (isSubstituteContract) · `locked` = ล็อกเพราะใบสั่งขาย
   ยังไม่อนุมัติ (historicalContractLockReason) ⇒ ซ่อนปุ่มยกเลิก — ยกเลิกที่ใบสั่งขาย แล้ว trigger ยกเลิกใบนี้ตาม
   `contract` · `linkedOrder` · `signedCancel` (= `signedCancelContext` จาก GET: ใบสั่งขายที่ผูก + จำนวนบันทึกเพิ่มเติม)
   ใช้ประกอบโมดัลยกเลิกสัญญาที่ลงนามแล้วเท่านั้น (มติ 24/09/2026) */
/* `docAttached` = ใบ external นี้มีไฟล์ชนิด "เอกสารที่ใช้แทนสัญญา" แล้ว (หน้าใบรู้จากการ์ดไฟล์) — ใช้เลือกราง
   ของร่างเท่านั้น · ใบย้อนหลังไม่อ่านธงนี้ (ไฟล์มากับฟอร์มคีย์ใบ รางของมันพาไปที่ใบสั่งขาย) */
export function buildContractLifecycle({
  canEdit = false, external = false, substitute = false, locked = false, docAttached = false,
  contract = null, linkedOrder, signedCancel = null,
} = {}) {
  const signedCancelPrompt = signedCancelDialog({ contract, linkedOrder, signedCancel });
  return defineLifecycle({
    entity: "contract",
    noun: "สัญญา",
    statuses: Object.fromEntries(Object.entries(CONTRACT_STATUS_LABELS).map(([key, label]) => [
      key,
      { label, tone: STATUS_TONE[key], description: STATUS_DESCRIPTION[key] },
    ])),
    steps: substitute
      ? SUBSTITUTE_STEPS
      : external
        ? (docAttached && contract?.status === "draft" ? EXTERNAL_ATTACHED_STEPS : EXTERNAL_STEPS)
        : STEPS,
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
        visible: () => canEdit && !locked,
        // ใบที่ลงนามแล้วไม่เข้าทางนี้ (`from` กรองไว้) — เป็นปุ่ม "ยกเลิกสัญญาที่ลงนามแล้ว" ของผู้อนุมัติข้างล่าง
        allow: (contract) => (canCancelContract(contract) ? true : "ใบที่ลงนามแล้วให้ AE Supervisor ยกเลิกที่ปุ่ม “ยกเลิกสัญญาที่ลงนามแล้ว”"),
        confirm: {
          title: "ยกเลิกสัญญาใบนี้",
          message: "ใบจะถูกปิดพร้อมเหตุผลที่บันทึกไว้ และพิมพ์ออกมาพร้อมลายน้ำ “ยกเลิก” "
            + "· เลขที่ที่ออกไปแล้วจะไม่ถูกนำกลับมาใช้ซ้ำ",
          confirmLabel: "ยกเลิกสัญญา",
        },
      },
      {
        /* ⭐ **ยกเลิกสัญญาที่ลงนามแล้ว — สิทธิ์ของผู้อนุมัติ** (มติเจ้าของ 24/09/2026: "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่
           สามารถกดอนุมัติ") · ทุกชนิดสัญญา · เพิ่มสิทธิ์อย่างเดียว ปุ่มยกเลิกเดิมข้างบนไม่ขยับ
           ⚠️ `visible` = สิทธิ์ (ผู้อนุมัติ + แก้ใบได้) ⇒ คนอื่นไม่เห็นปุ่ม · `allow` = ด่านที่ติดได้ (เอกสารแทนสัญญาของใบ
              สั่งขายย้อนหลังที่ยังมีชีวิต · ยังโหลดใบสั่งขายที่ผูกไม่ครบ) ⇒ โชว์จางพร้อมเหตุ
           🔴 **โหลดใบสั่งขายที่ผูกไม่ครบ = กดไม่ได้** — โมดัลพิมพ์รายชื่อใบเป็นข้อเท็จจริงของการกระทำที่ย้อนไม่ได้
              ลิสต์ที่ไม่ครบจะอ่านว่า "ไม่มีใบไหนได้รับผล" */
        id: "cancel-signed",
        label: "ยกเลิกสัญญาที่ลงนามแล้ว",
        rowLabel: "ยกเลิก",
        rowTone: "red",
        kind: "cancel",
        slot: "danger",
        from: ["signed"],
        to: "cancelled",
        reason: "required",
        visible: (contract, user) => canEdit && showSignedCancel(contract, user),
        allow: (contract, user) => {
          const gate = signedCancelError(contract, user, { linkedOrder });
          if (gate) return gate;
          if (!Array.isArray(signedCancel?.linkedServiceOrders)) {
            return "ยังโหลดใบสั่งขายที่ผูกสัญญานี้ไม่ครบ — เปิดหน้าใหม่แล้วลองอีกครั้ง";
          }
          return true;
        },
        confirm: {
          title: signedCancelPrompt.title,
          message: signedCancelPrompt.description,
          confirmLabel: signedCancelPrompt.confirmLabel,
        },
        reasonPolicy: {
          detail: signedCancelPrompt.detail,
          confirmLabel: signedCancelPrompt.confirmLabel,
          placeholder: "เช่น ลูกค้าแจ้งเลิกจ้างตามหนังสือลงวันที่ … / ลงนามผิดฉบับ ต้องออกฉบับใหม่",
        },
      },
    ],
  });
}
