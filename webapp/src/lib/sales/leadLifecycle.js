// เส้นชีวิตของ "ลีด" — แหล่งเดียวที่ตอบว่าลีดใบนี้ทำอะไรได้บ้าง
//
// ทำไมต้องมี: กติกา "สถานะไหนทำ action อะไรได้ + ใครกดได้" เคยอยู่ 2 ที่ที่ต้องตรงกันเอง
//   1. API `POST /leads/[id]/transition` (ด่านจริง — ห้ามถอด)
//   2. `rowActions()` ในหน้ารายการ (ฝั่ง UI)
// และหน้ารายละเอียดไม่มีเลย → เปิดลีดเข้าไปแล้วเปลี่ยนสถานะไม่ได้ ต้องถอยกลับไปหน้ารายการ
// ไฟล์นี้ยกกติกาฝั่ง UI มาไว้ที่เดียว แล้วให้ทั้งการ์ด (RecordControlCard) และแถวตาราง
// กิน `available()` ตัวเดียวกัน
//
// ⚠️ **ไม่ได้แทนด่านที่ API** — ฝั่งนี้คือ "ปุ่มควรโผล่ไหม" ส่วน API ยังต้องตรวจซ้ำเสมอ
// (ผู้ใช้ยิง fetch ตรงได้) กติกา role ที่นี่จึงต้องสะท้อนของที่ handler ทำ ไม่ใช่หลวมกว่า
//
// ⚠️ visible vs allow (ดู recordLifecycle.js): visible=false → ไม่มีสิทธิ์รู้ว่ามีปุ่มนี้ ·
// allow คืนสตริง → เห็นปุ่มแต่กดไม่ได้พร้อมเหตุผล · ที่นี่ใช้ visible เพราะทั้งหมดเป็น
// เรื่อง "สิทธิ์ตาม role/ทีม" ไม่ใช่ "ยังไม่ถึงเวลา"

import { defineLifecycle } from "@/lib/recordLifecycle";
import { isSuperuser, TEAMS, TEAM_LABELS } from "@/lib/permissions";
import {
  LEAD_STATUS_LABELS,
  LEAD_TRANSITIONS,
  MEETING_MODES,
  MEETING_MODE_LABELS,
  canWorkLead,
} from "@/lib/sales/leads";

/* สถานะ → tone ของป้าย · ชุดคำศัพท์ของ *สถานะ* (Badge.module.css) ไม่ใช่ของปุ่ม
   สีจริงมาจาก toneColor() ใน lib/ui/tone.js — ไม่ประกาศ CSS var ซ้ำที่นี่ */
const STATUS_TONE = {
  new: "warning",
  screened: "info",
  assigned: "accent",
  contacted: "info",
  meeting: "info",
  qualified: "success",
  disqualified: "danger",
};

const STATUS_DESCRIPTION = {
  new: "รอผู้ดูแลคัดกรองและเลือกทีม (SLA 1 วันทำการ)",
  screened: "ได้ทีมแล้ว รอหัวหน้าทีมกระจายให้ผู้รับผิดชอบ",
  assigned: "มีผู้รับผิดชอบแล้ว รอติดต่อกลับ (SLA 1 วันทำการ)",
  contacted: "ติดต่อลูกค้าแล้ว นัดประชุมหรือเปิดดีลต่อได้",
  meeting: "นัดประชุมแล้ว — ขั้นถัดไปคือเปิดดีล",
  qualified: "เปิดดีลจากลีดนี้แล้ว งานย้ายไปติดตามที่ดีล",
  disqualified: "ปิดลีด ไม่ไปต่อ — เหตุผลอยู่ในประวัติ",
};

/* แถบเส้นทางบนการ์ด — ยุบ contacted/meeting เป็นขั้นเดียว ("ติดต่อ/นัดหมาย")
   เพราะสองสถานะนี้เป็นงานของคนเดียวกันในช่วงเดียวกัน ไม่ใช่ด่านคนละคน */
const STEPS = [
  { id: "screen", label: "คัดกรอง", hint: "เลือกทีมเจ้าของงาน", statuses: ["new"] },
  { id: "assign", label: "มอบหมาย", hint: "เลือกผู้รับผิดชอบ", statuses: ["screened"] },
  { id: "work", label: "ติดต่อ/นัดหมาย", hint: "ทีมเจ้าของงานดำเนินการ", statuses: ["assigned", "contacted", "meeting"] },
  { id: "deal", label: "เปิดดีล", statuses: ["qualified"] },
];

const inTeamOf = (user, lead) =>
  (user?.role === "senior_ae" || user?.role === "ac") && !!lead?.team && lead.team === user?.team;

/* "ขั้นกำกับดูแล" (ตีกลับ/ไม่ไปต่อ) — ทีมเจ้าของงาน + ผู้ดูแล
   ต่างจาก "ขั้นทำงาน" (ติดต่อ/นัด) ที่ใช้ canWorkLead: มติผู้ใช้ 2026-07-21 ว่า
   supervisor จบงานที่คัดกรอง ไม่ลงไปทำขั้นทำงานแทนทีม */
const oversees = (user, lead) =>
  isSuperuser(user?.role)
  || inTeamOf(user, lead)
  || (user?.role === "ae" && user?.id != null && lead?.assigneeId === user.id);

/* กติกาว่า "สถานะนี้ทำ action นี้ได้ไหม" ยังมาจาก LEAD_TRANSITIONS ตัวเดิม
   ไม่คัดลอกเส้นทางมาเขียนซ้ำ — เพิ่มสถานะใหม่ที่ leads.js แล้วที่นี่ตามเอง */
const allowedFrom = (action) =>
  Object.keys(LEAD_TRANSITIONS).filter((status) => LEAD_TRANSITIONS[status].includes(action));

/**
 * @param users  รายชื่อสำหรับช่อง "ผู้รับผิดชอบ" ของ transition `assign`
 * @param canCreateDeals  ผู้ใช้เปิดดีลได้ไหม (สิทธิ์คนละตัวกับสิทธิ์ลีด)
 */
export function createLeadLifecycle({ users = [], canCreateDeals = false } = {}) {
  return defineLifecycle({
    entity: "lead",
    noun: "ลีด",
    statuses: Object.fromEntries(
      Object.entries(LEAD_STATUS_LABELS).map(([key, label]) => [
        key,
        { label, tone: STATUS_TONE[key] || "neutral", description: STATUS_DESCRIPTION[key] || "" },
      ]),
    ),
    cancelledStatuses: ["disqualified"],
    steps: STEPS,
    transitions: [
      {
        id: "screen",
        label: "คัดกรองและส่งทีม",
        kind: "submit",
        slot: "primary",
        from: allowedFrom("screen"),
        to: "screened",
        visible: (lead, user) => isSuperuser(user?.role),
        fields: [
          {
            name: "team",
            label: "ทีมเจ้าของงาน",
            type: "select",
            required: true,
            options: TEAMS.map((team) => ({ value: team, label: TEAM_LABELS[team] || team })),
          },
        ],
      },
      {
        id: "assign",
        label: "มอบหมายผู้รับผิดชอบ",
        kind: "submit",
        slot: "primary",
        from: allowedFrom("assign"),
        to: "assigned",
        visible: (lead, user) => user?.role === "admin" || inTeamOf(user, lead),
        fields: [
          { name: "assigneeId", label: "ผู้รับผิดชอบ", type: "person", required: true, users, by: "id" },
        ],
      },
      {
        id: "contact",
        label: "บันทึกการติดต่อ",
        kind: "submit",
        slot: "primary",
        from: allowedFrom("contact"),
        to: "contacted",
        visible: (lead, user) => canWorkLead(user, lead),
        // หมายเหตุการติดต่อไม่บังคับ แต่เก็บลงประวัติถ้ากรอก (API เก็บใน event.reason)
        reason: "optional",
        reasonPolicy: {
          title: "บันทึกการติดต่อลูกค้า",
          label: "หมายเหตุการติดต่อ",
          placeholder: "คุยกับใคร ได้ข้อมูลอะไร นัดอะไรต่อ",
        },
        fields: [{ name: "eventAt", label: "เวลาที่ติดต่อ", type: "datetime" }],
      },
      {
        id: "meeting",
        label: "บันทึกนัดประชุม",
        kind: "submit",
        slot: "secondary",
        from: allowedFrom("meeting"),
        to: "meeting",
        visible: (lead, user) => canWorkLead(user, lead),
        fields: [
          {
            name: "meetingMode",
            label: "รูปแบบนัด",
            type: "select",
            required: true,
            options: MEETING_MODES.map((mode) => ({ value: mode, label: MEETING_MODE_LABELS[mode] || mode })),
          },
          { name: "eventAt", label: "เวลานัด", type: "datetime" },
        ],
      },
      {
        /* เปิดดีล = สร้าง entity คนละตัว ไม่ใช่ย้ายสถานะเฉย ๆ — หน้าเรียกดักที่
           onTransition แล้วพาไปฟอร์มดีลแทนการยิง /transition ตรง ๆ
           ยังประกาศไว้ที่นี่เพราะทั้งการ์ดและแถวตารางต้องรู้ว่า "ขั้นถัดไปคืออันนี้" */
        id: "create_deal",
        label: "เปิดดีลจากลีดนี้",
        kind: "submit",
        slot: "primary",
        from: allowedFrom("create_deal"),
        to: "qualified",
        visible: (lead, user) => canCreateDeals && canWorkLead(user, lead) && lead?.status !== "qualified",
      },
      {
        id: "bounce",
        label: "ตีกลับคิวคัดกรอง",
        kind: "bounce",
        from: allowedFrom("bounce"),
        to: "new",
        reason: "required",
        visible: (lead, user) => oversees(user, lead),
        reasonPolicy: {
          title: "ตีกลับไปคิวคัดกรอง",
          description: "ลีดจะกลับไปสถานะรอคัดกรอง และล้างทีม/ผู้รับผิดชอบเดิม",
          label: "เหตุผลที่ตีกลับ",
          placeholder: "เช่น ทีมไม่ตรงกับบริการที่ลูกค้าสนใจ",
        },
      },
      {
        id: "disqualify",
        label: "ปิดลีด — ไม่ไปต่อ",
        kind: "disqualify",
        from: allowedFrom("disqualify"),
        to: "disqualified",
        reason: "required",
        visible: (lead, user) => oversees(user, lead),
        reasonPolicy: {
          title: "ปิดลีดนี้",
          description: "ลีดจะถูกปิดถาวร เหตุผลจะถูกเก็บในประวัติ",
          label: "เหตุผลที่ไม่ไปต่อ",
          placeholder: "เช่น งบไม่ถึง / ไม่ใช่กลุ่มเป้าหมาย / ติดต่อไม่ได้",
        },
      },
    ],
  });
}

/* transition ที่ต้องส่งไป `POST /transition` (ที่เหลือหน้าจัดการเอง) */
export const LEAD_TRANSITION_ACTIONS = ["screen", "assign", "contact", "meeting", "bounce", "disqualify"];
