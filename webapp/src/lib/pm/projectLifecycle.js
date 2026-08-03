// เส้นชีวิตของ "โครงการ" — แหล่งเดียวที่ตอบว่าโครงการใบนี้ทำอะไรได้บ้าง (ฝั่ง UI)
//
// ⚠️⚠️ **โครงการมีสองแกนสถานะ ไม่ใช่แกนเดียว**
//   `status`      = สถานะงานประจำวัน (New / In Progress / On Hold / Dropped / Completed)
//                   แก้ผ่าน PATCH ตรง ๆ ไม่มีใครอนุมัติ
//   `closeStatus` = ชั้น "เซ็นรับรองปิดโครงการ" (open / pending_close / closed)
//                   แก้ผ่าน POST /close เท่านั้น มีคนขอ–คนอนุมัติคนละคน
// สองอย่างนี้ตั้งใจแยกกัน (ดู lib/pm/projectClose.js) แต่ `defineLifecycle` มี statusOf
// ตัวเดียว → ที่นี่ยุบเป็น **สถานะเดียวที่ผู้ใช้ต้องเห็น** ด้วยกติกา "การปิดชนะเสมอ":
// โครงการที่ยังทำงานอยู่แต่ถูกยื่นขอปิดแล้ว สิ่งที่คนต้องรู้ก่อนคือ "รออนุมัติปิด"
// ไม่ใช่ "In Progress"
//
// ⚠️ `closed` = **ล็อกเขียนทั้งใบ** (PATCH/DELETE/restore/revisions/deal-order ตอบ 409)
// ไม่ใช่แค่ป้าย — ปุ่มงานประจำวันจึงหายหมดตอนปิดแล้ว ต้อง "เปิดโครงการใหม่" ก่อน
//
// ⚠️ ด่านจริงอยู่ที่ API เสมอ — ที่นี่คือ "ปุ่มควรโผล่ไหม" ห้ามหลวมกว่า handler

import { defineLifecycle } from "@/lib/recordLifecycle";
import { can } from "@/lib/permissions";
import { PROJECT_CLOSE_TYPES, PROJECT_CLOSE_TYPE_LABELS } from "@/lib/pm/projectClose";

/* สถานะงานที่เก็บได้จริง — ตรงกับ CHECK constraint ของตาราง (mig 0008)
   ไม่มีค่าคงที่กลางในฝั่ง JS มาก่อน ไฟล์นี้เป็นที่แรก */
export const PROJECT_WORK_STATUSES = ["New", "In Progress", "Completed", "On Hold", "Dropped"];

/* สถานะงานที่ถือว่า "จบแล้ว" — ใช้กรองคิวในหน้ารายการ
   🐞 ของเดิมหน้ารายการกรองด้วย ["Done","Drop"] ซึ่งไม่ใช่ค่าที่มีอยู่จริงสักตัว */
export const CLOSED_WORK_STATUSES = ["Completed", "Dropped"];

/* สถานะรวมที่การ์ดแสดง = งานประจำวัน + ชั้นการปิด (การปิดชนะ) */
export const projectStateOf = (project) => {
  const close = project?.closeStatus || "open";
  if (close !== "open") return close; // pending_close | closed
  return project?.status || "New";
};

const STATE_META = {
  New: { label: "ใหม่", tone: "neutral", description: "เพิ่งเปิดโครงการ ยังไม่เริ่มงาน" },
  "In Progress": { label: "ดำเนินการ", tone: "info", description: "กำลังเดินงานตามไทม์ไลน์" },
  Completed: { label: "เสร็จสิ้น", tone: "success", description: "งานเสร็จแล้ว — ขอปิดโครงการเพื่อเซ็นรับรอง" },
  "On Hold": { label: "ระงับชั่วคราว", tone: "warning", description: "พักไว้ก่อน — ดึงกลับมาดำเนินการได้" },
  Dropped: { label: "ยกเลิก", tone: "danger", description: "ยกเลิกแล้ว — เหตุผลอยู่ในประวัติ" },
  pending_close: { label: "รออนุมัติปิด", tone: "warning", description: "ยื่นขอปิดแล้ว รอผู้อนุมัติตรวจ" },
  closed: { label: "ปิดแล้ว", tone: "success", description: "ปิดและเซ็นรับรองแล้ว — แก้อะไรไม่ได้จนกว่าจะเปิดใหม่" },
};

/** ป้ายไทยของสถานะ (รวมชั้นการปิด) — ที่เดียวทั้งระบบ */
export function projectStatusLabel(state) {
  return STATE_META[state]?.label || state;
}

/* แถบเส้นทาง — เดินตาม *ชั้นการปิด* ไม่ใช่สถานะงาน เพราะนั่นคือเส้นที่มีปลายทางจริง
   (สถานะงานวนไปมาได้: ระงับ ↔ ดำเนินการ) */
const STEPS = [
  { id: "run", label: "ดำเนินงาน", hint: "เดินไทม์ไลน์", statuses: ["New", "In Progress", "On Hold", "Completed", "Dropped"] },
  { id: "request", label: "ขอปิด", hint: "ผู้ดูแลยื่นคำขอ", statuses: ["pending_close"] },
  { id: "closed", label: "ปิดแล้ว", hint: "ผู้อนุมัติเซ็นรับรอง", statuses: ["closed"] },
];

/* 🐞 หน้าโครงการเช็คสิทธิ์ด้วย `salesplan:edit` มาตลอด ทั้งที่ **ทุก API ของโครงการ
   ตรวจ `pm:edit`/`pmEditScope`** — บั๊กชนิดเดียวกับที่เจอในโมดูลดีล (dealLifecycle.js)
   วันนี้ไม่ระเบิดเพราะสิทธิ์สองตัวทับกันพอดี แต่พอแยกกันเมื่อไหร่ก็พังเงียบ */
const canWork = (project, user) => project?.canEdit === true && can(user?.role, "pm:edit");

const isRequester = (project) =>
  !!project?.me?.id && project?.closeRequestedBy === project.me.id;

/* ผู้อนุมัติปิด = superuser — API ส่ง `canApproveClose` มาให้แล้ว ไม่คำนวณเองซ้ำ */
const canApprove = (project) => project?.canApproveClose === true;

/* ความยาวเหตุผล 10–500 = ค่าเริ่มต้นของ recordLifecycle อยู่แล้ว ตรงกับที่หน้าโครงการ
   ตั้งไว้เอง (CLOSE_REASON_MIN/MAX) จึงไม่ต้องประกาศซ้ำ — มีเทสต์ยืนยันว่าตรงกัน */
const closeReasonPolicy = (over) => ({ ...over });

export function createProjectLifecycle() {
  return defineLifecycle({
    entity: "project",
    noun: "โครงการ",
    statusOf: projectStateOf,
    statuses: STATE_META,
    cancelledStatuses: ["Dropped"],
    steps: STEPS,
    transitions: [
      {
        /* ดึงกลับจากระงับ — เจ้าของงาน (AE) หรือผู้ดูแล
           ⚠️ เทียบเจ้าของด้วย **ชื่อ** ไม่ใช่ id (ของเดิมเป็นแบบนั้น `p.aeOwner === myName`)
           เป็นหนี้ที่ยกมา ไม่ได้แก้ในรอบนี้ */
        id: "restore_from_hold",
        label: "ดึงกลับมาดำเนินการ",
        rowLabel: "ดำเนินต่อ",
        rowTone: "teal",
        kind: "resume",
        slot: "primary",
        from: ["On Hold"],
        to: "In Progress",
        visible: (project, user) => canWork(project, user)
          && (isSuperuserRole(user?.role) || isAeOwner(project, user)),
      },
      {
        /* ดึงกลับจากยกเลิก — สิทธิ์**แคบกว่า**การดึงกลับจากระงับ (senior_ae ขึ้นไป)
           มติเดิมห้ามยุบสองอันนี้เป็นกติกาเดียว จึงเป็นคนละ transition
           ⚠️ ใช้ kind `resume` ไม่ใช่ `revert` โดยตั้งใจ — `revert` อยู่ใน BACKWARD_KINDS
           ซึ่งจะบังคับกรอกเหตุผล แต่ของเดิมเป็นแค่กล่องยืนยัน ไม่เปลี่ยนพฤติกรรมผู้ใช้ */
        id: "restore_from_dropped",
        label: "ดึงกลับมาดำเนินการ",
        rowLabel: "กู้คืน",
        rowTone: "teal",
        kind: "resume",
        slot: "primary",
        from: ["Dropped"],
        to: "In Progress",
        visible: (project, user) => canWork(project, user)
          && (isSuperuserRole(user?.role) || user?.role === "senior_ae"),
        confirm: {
          title: "ดึงโครงการที่ยกเลิกกลับมา",
          message: "โครงการจะกลับไปสถานะดำเนินการ",
          confirmLabel: "ดึงกลับมา",
        },
      },
      {
        /* ขอปิดโครงการ = ก้าวถัดไปตัวจริง — เป็น transition เดียวที่พาโครงการไปปลายทาง
           ต้องเลือกชนิดการปิด (ปิดสำเร็จ / ยกเลิก) และเขียนเหตุผล (API บังคับทั้งคู่) */
        id: "request_close",
        label: "ขอปิดโครงการ",
        rowLabel: "ขอปิด",
        rowTone: "blue",
        kind: "submit",
        slot: "primary",
        from: ["New", "In Progress", "On Hold", "Completed"],
        to: "pending_close",
        reason: "required",
        visible: (project, user) => canWork(project, user),
        fields: [{
          name: "closeType",
          label: "ชนิดการปิด",
          type: "select",
          required: true,
          options: PROJECT_CLOSE_TYPES.map((value) => ({ value, label: PROJECT_CLOSE_TYPE_LABELS[value] || value })),
        }],
        reasonPolicy: closeReasonPolicy({
          title: "ขอปิดโครงการนี้",
          description: "คำขอจะส่งให้ผู้อนุมัติตรวจ — ระหว่างรอ โครงการยังแก้ไขได้",
          label: "เหตุผล / สรุปการส่งมอบ",
          placeholder: "เช่น ส่งมอบครบตามสัญญา ปิดงบแล้ว",
        }),
      },
      {
        /* อนุมัติปิด — ผู้อนุมัติต้องไม่ใช่คนยื่น (API ปฏิเสธ และ UI ก็ซ่อน)
           ไม่ต้องมีเหตุผล: การอนุมัติคือการเห็นด้วยกับเหตุผลที่ผู้ยื่นเขียนไว้แล้ว */
        id: "approve_close",
        label: "อนุมัติปิดโครงการ",
        rowLabel: "อนุมัติปิด",
        rowTone: "green",
        kind: "approve",
        slot: "primary",
        from: ["pending_close"],
        to: "closed",
        visible: (project) => canApprove(project) && !isRequester(project),
        confirm: {
          title: "อนุมัติปิดโครงการ",
          message: "โครงการจะถูกล็อกไม่ให้แก้ไขทั้งใบ (แก้ต่อได้เมื่อเปิดใหม่เท่านั้น)",
          confirmLabel: "อนุมัติปิด",
        },
      },
      {
        /* ตีกลับคำขอปิด — ผู้จัดทำต้องอ่านเหตุผล API จึงบังคับ */
        id: "reject_close",
        label: "ตีกลับคำขอปิด",
        rowLabel: "ตีกลับ",
        kind: "reject",
        from: ["pending_close"],
        to: "open",
        reason: "required",
        visible: (project) => canApprove(project) && !isRequester(project),
        reasonPolicy: closeReasonPolicy({
          title: "ตีกลับคำขอปิดโครงการ",
          description: "โครงการจะกลับไปสถานะเปิดอยู่ ผู้ขอปิดจะเห็นเหตุผลนี้",
          label: "เหตุผลที่ตีกลับ",
          placeholder: "เช่น ยังมี Sale Order ค้าง / ยังไม่ได้ยื่นภาษี",
        }),
      },
      {
        /* ถอนคำขอของตัวเอง — **ไม่ต้องมีเหตุผล** (มติ 2026-07-28)
           ต่างจากตีกลับตรงที่ไม่มีใครต้องอ่าน คนถอนคือคนยื่นเอง
           `withdraw` จึงจงใจไม่อยู่ใน BACKWARD_KINDS */
        id: "withdraw_close",
        label: "ถอนคำขอปิด",
        rowLabel: "ถอนคำขอ",
        kind: "withdraw",
        from: ["pending_close"],
        to: "open",
        visible: (project) => isRequester(project) || canApprove(project),
        confirm: {
          title: "ถอนคำขอปิดโครงการ",
          message: "คำขอจะถูกยกเลิก โครงการกลับไปสถานะเปิดอยู่",
          confirmLabel: "ถอนคำขอ",
        },
      },
      {
        /* เปิดโครงการใหม่หลังปิดแล้ว (เช่น RE-ORDER) — ปลดล็อกทั้งใบ จึงต้องมีเหตุผล
           ⚠️ ไม่มีเงื่อนไข !isRequester ทั้งฝั่ง API และ UI โดยตั้งใจ: ปิดแล้วไม่มี
           "ผู้ยื่นที่ค้างอยู่" ให้เลี่ยง */
        id: "reopen",
        label: "เปิดโครงการใหม่",
        rowLabel: "เปิดใหม่",
        rowTone: "amber",
        kind: "reopen",
        slot: "primary",
        from: ["closed"],
        to: "open",
        reason: "required",
        visible: (project) => canApprove(project),
        reasonPolicy: closeReasonPolicy({
          title: "เปิดโครงการที่ปิดแล้ว",
          description: "โครงการจะกลับมาแก้ไขได้ และคำขอปิดเดิมจะถูกล้าง",
          label: "เหตุผลที่เปิดใหม่",
          placeholder: "เช่น ลูกค้าสั่งซ้ำ (RE-ORDER) / ต้องแก้เอกสารย้อนหลัง",
        }),
      },
      {
        /* ระงับชั่วคราว — ไม่ใช่การถอยหลัง แค่พักงาน กลับมาได้ ไม่บังคับเหตุผล */
        id: "hold",
        label: "ระงับชั่วคราว",
        rowLabel: "ระงับ",
        kind: "pause",
        from: ["New", "In Progress"],
        to: "On Hold",
        visible: (project, user) => canWork(project, user),
        confirm: {
          title: "ระงับโครงการชั่วคราว",
          message: "งานจะหยุดนับความคืบหน้า ดึงกลับมาดำเนินการได้ภายหลัง",
          confirmLabel: "ระงับชั่วคราว",
        },
      },
      {
        /* ยกเลิกโครงการ — บังคับเหตุผล (ของเดิมก็บังคับฝั่ง UI อยู่แล้ว เก็บใน
           `metadata.lossReason`) · API ไม่ได้บังคับ ฝั่ง UI จึงเข้มกว่าโดยตั้งใจ */
        id: "drop",
        label: "ยกเลิกโครงการ",
        rowLabel: "ยกเลิก",
        kind: "drop",
        from: ["New", "In Progress", "On Hold"],
        to: "Dropped",
        reason: "required",
        visible: (project, user) => canWork(project, user),
        reasonPolicy: {
          title: "ยกเลิกโครงการนี้",
          description: "โครงการจะถูกปิดเป็น 'ยกเลิก' — ดึงกลับได้เฉพาะ Senior AE ขึ้นไป",
          label: "เหตุผลที่ยกเลิก",
          placeholder: "เช่น ลูกค้ายกเลิกงาน / ย้ายไปโครงการอื่น",
        },
      },
    ],
  });
}

/* แยกไว้ท้ายไฟล์เพื่อไม่ให้ import วนกับ permissions — ใช้แค่ชื่อ role */
function isSuperuserRole(role) {
  return role === "admin" || role === "ae_supervisor";
}
/* ⭐ ตัวตนอยู่ที่ `aeOwnerId` (mig 0190) — เทียบ id ก่อนเสมอ ไม่งั้น "เปลี่ยนชื่อ
   ตัวเอง = ไม่ใช่เจ้าของโครงการตัวเองอีกต่อไป"
   ⚠️ ยังต้องเทียบชื่อต่อเป็นทางถอย เพราะใบเก่าบน prod ส่วนใหญ่ (11/14) `aeOwnerId`
   ว่าง — ตัดทิ้งตอนนี้เท่ากับปิดปุ่มของเจ้าของตัวจริง */
function isAeOwner(project, user) {
  const myId = user?.id || project?.me?.id;
  if (myId && project?.aeOwnerId) return project.aeOwnerId === myId;
  const me = user?.name || project?.me?.name;
  return !!me && project?.aeOwner === me;
}

/**
 * ลบโครงการได้ไหม — **ต้องใช้ `canDelete` ที่ API ส่งมา** ห้ามคำนวณเอง
 * 🐞 หน้ารายละเอียดเคยโชว์ปุ่มลบตาม `canEdit` แล้วซ่อนเฉพาะตอนมีดีลต้นทาง →
 * AE ที่ไม่มีสิทธิ์ลบ (deleteScope = none) เห็นปุ่มแล้วกดเจอ 403 · หน้ารายการทำถูกอยู่แล้ว
 */
export function canDeleteProject(project) {
  return project?.canDelete === true;
}

/** transition ที่ยิง `PATCH /pm/projects/[id]` (สถานะงาน) */
export const PROJECT_PATCH_TRANSITIONS = ["hold", "restore_from_hold", "restore_from_dropped", "drop"];

/** transition ที่ยิง `POST /pm/projects/[id]/close` (ชั้นการปิด) → action ที่ handler รู้จัก */
export const PROJECT_CLOSE_ACTIONS = {
  request_close: "request",
  withdraw_close: "cancel_request",
  approve_close: "approve",
  reject_close: "reject",
  reopen: "reopen",
};
