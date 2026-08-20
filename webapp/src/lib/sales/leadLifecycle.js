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
import { hasTeam, isSuperuser, userTeams, TEAMS, TEAM_LABELS } from "@/lib/permissions";
import { fmtName } from "@/lib/format";
import {
  LEAD_STATUS_LABELS,
  LEAD_TRANSITIONS,
  MEETING_MODES,
  MEETING_MODE_LABELS,
  canWorkLead,
} from "@/lib/sales/leads";
import { LEAD_ASSIGNEE_ROLES } from "@/lib/sales/leadAssignee";

/* action ที่ handler ตอบ badRequest ถ้าไม่มี `body.reason?.trim()`
   — ไม่ใช่ความชอบของฝั่งหน้าจอ แต่เป็นข้อบังคับของ API
   🐞 เคยประกาศ contact เป็น "optional" (#864) → กดยืนยันโดยไม่พิมพ์ได้ แล้วโดน 400
   เทสต์ `leadLifecycle.test.mjs` อ่าน route.js จริงมาเทียบกับลิสต์นี้ ดริฟต์แล้วแดง */
export const LEAD_REASON_REQUIRED = ["contact", "bounce", "disqualify"];

const reasonRule = (action) => (LEAD_REASON_REQUIRED.includes(action) ? "required" : "none");

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
  meeting: "นัดประชุมแล้ว — เปิดดีลต่อได้ · นัดเพิ่มหรือเลื่อนนัดได้อีกจากที่นี่",
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
  (user?.role === "senior_ae" || user?.role === "ac") && hasTeam(user, lead?.team);

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

/* ── รายชื่อที่ควรโผล่ในช่อง "ผู้รับผิดชอบ" ────────────────────────────────
   สองด่านซ้อนกัน — ทั้งคู่ต้องตรงกับ `validateLeadAssignee` ฝั่ง server เป๊ะ
   (เห็นชื่อในดรอปดาวน์แล้วเลือกไม่ได้ = UX ที่แย่กว่าไม่เห็นชื่อนั้นเลย):

   1. **ตำแหน่ง** — ต้องอยู่ใน `LEAD_ASSIGNEE_ROLES` (admin / senior_ae / ae)
      หน้าเรียกส่ง directory ทั้งก้อนมา ซึ่งมีทุก role ที่มอบหมายงานได้ รวม staff/rd/legal
      ⭐ AC ถูกตัดออกตามมติ 2026-08-08 — เหตุผลเต็มอยู่ที่ leadAssignee.js

   2. **ทีม** — ลีดถูกคัดกรองเข้าทีมแล้วก่อนถึงขั้นมอบหมาย คนที่รับต่อจึงต้องอยู่ทีมนั้น
      ⭐ กรองด้วย **ทีมของลีดใบนั้น** ไม่ใช่ทีมของคนที่เปิดหน้าอยู่ (มติ 2026-08-08)
      · Senior AE เห็นเฉพาะลีดของทีมตัวเอง ⇒ สองค่านี้ตรงกันอยู่แล้ว ไม่มีอะไรเปลี่ยน
      · **admin กับ AE Supervisor ไม่มีทีม** (`viewerTeam` ว่าง) แต่มอบหมายได้ทุกทีม —
        ของเดิมกรองด้วย viewerTeam จึงคืน "ทุกคนทุกทีม" ให้สองตำแหน่งนี้ แล้วพอเลือกคน
        ต่างทีมก็โดน `validateLeadAssignee` เด้ง 400 โดยไม่มีอะไรบอกล่วงหน้า
      · คนที่ไม่มีทีม (admin) ติดมาด้วยเสมอ — `canWorkLead` ให้ admin ทำได้ทุกใบ
      · ไม่รู้ทีมของลีด (ไม่ได้ส่ง record มา) → ถอยไปใช้ viewerTeam เหมือนเดิม
   🐞 ก่อนหน้านี้ไม่กรองทีมเลย: Senior AE ทีม ODM เห็นชื่อ AE ของ KA/SV ทั้งหมด
   แล้วมอบลีดข้ามทีมได้ ซึ่งคนรับจะทำงานต่อไม่ได้ถ้าเป็น senior_ae (canWorkLead
   เทียบทีม) — ลีดค้างโดยไม่มีใครรู้ */
export function assignableFor(users, viewerTeam, leadTeam = null) {
  const team = leadTeam || viewerTeam || null;
  return users.filter((user) => {
    if (!LEAD_ASSIGNEE_ROLES.includes(user?.role)) return false;
    if (!team) return true;                // ไม่รู้ทีมทั้งสองทาง — ไม่ตัดใครออก
    // คนรับอยู่หลายทีมได้ ⇒ อยู่ทีมของลีดทีมใดทีมหนึ่งก็รับได้ (ไม่มีทีมเลย = admin ติดมาเสมอ)
    return !userTeams(user).length || hasTeam(user, team);
  });
}

/**
 * @param users  รายชื่อสำหรับช่อง "ผู้รับผิดชอบ" ของ transition `assign`
 * @param canCreateDeals  ผู้ใช้เปิดดีลได้ไหม (สิทธิ์คนละตัวกับสิทธิ์ลีด)
 * @param viewerTeam  ทีมของคนที่เปิดหน้าอยู่ — ใช้เป็นค่าถอยเมื่อไม่รู้ทีมของลีด
 */
export function createLeadLifecycle({ users = [], canCreateDeals = false, viewerTeam = null } = {}) {
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
        rowLabel: "คัดกรอง",
        rowTone: "blue",
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
        rowLabel: "มอบหมาย",
        rowTone: "violet",
        kind: "submit",
        slot: "primary",
        from: allowedFrom("assign"),
        to: "assigned",
        /* ⭐ มติผู้ใช้ 2026-08-08: **AE Supervisor กระจายลีดได้ทุกทีม**
           เดิมเงื่อนไขเป็น `admin || inTeamOf` ซึ่งไม่ครอบ ae_supervisor (ตำแหน่งนี้ไม่มีทีม
           `inTeamOf` จึงไม่มีวันจริง) ⇒ ปุ่มไม่เคยโผล่ ทั้งที่ handler เปิดให้มาตลอด
           (`superuser || inTeam`) — ทางลัดที่ทำได้แต่ไม่มีใครเห็น · ตอนนี้ตรงกับ API แล้ว */
        visible: (lead, user) => isSuperuser(user?.role) || inTeamOf(user, lead),
        fields: [
          {
            name: "assigneeId",
            label: "ผู้รับผิดชอบ",
            type: "person",
            required: true,
            /* ฟังก์ชันของลีด ไม่ใช่อาร์เรย์ตายตัว — lifecycle สร้างครั้งเดียวต่อหน้า
               แต่หน้ารายการมีลีดหลายทีมในจอเดียว (ดู fieldUsers ใน recordLifecycle) */
            users: (lead) => assignableFor(users, viewerTeam, lead?.team),
            by: "id",
          },
        ],
      },
      {
        /* ⭐ เปลี่ยนมือ ไม่เปลี่ยนขั้น (มติผู้ใช้ 2026-08-20) — AE ลาออก/ลาป่วย/สลับงาน
           ต้องย้ายเจ้าของได้โดยไม่ต้อง "ตีกลับ" (ซึ่งล้างทีม/เวลาติดต่อ/นัดทั้งรอบ)
           ⚠️ `to: null` โดยเจตนา: ปลายทางของ reassign คือสถานะเดิมของใบนั้น
           (`TRANSITION_TO_STATUS.reassign === null` · handler เขียน `?? lead.status`)
           ⚠️ `slot` ไม่ใช่ primary — ก้าวถัดไปตัวจริงของสามสถานะนี้คือ ติดต่อ/นัด/เปิดดีล
           การย้ายเจ้าของเป็นงานกำกับดูแลที่นาน ๆ ทำที จึงอยู่ในเมนู "…" */
        id: "reassign",
        label: "เปลี่ยนผู้รับผิดชอบ",
        rowLabel: "เปลี่ยนผู้รับผิดชอบ",
        rowTone: "violet",
        kind: "submit",
        from: allowedFrom("reassign"),
        to: null,
        // ด่านเดียวกับ assign เป๊ะ (ดู handler) — คนที่กระจายลีดได้คือคนที่ย้ายเจ้าของได้
        visible: (lead, user) => isSuperuser(user?.role) || inTeamOf(user, lead),
        fields: [
          {
            name: "assigneeId",
            label: "ผู้รับผิดชอบคนใหม่",
            type: "person",
            required: true,
            users: (lead) => assignableFor(users, viewerTeam, lead?.team),
            by: "id",
          },
        ],
      },
      {
        id: "contact",
        label: "บันทึกการติดต่อ",
        rowLabel: "ติดต่อแล้ว",
        rowTone: "teal",
        kind: "submit",
        slot: "primary",
        from: allowedFrom("contact"),
        to: "contacted",
        visible: (lead, user) => canWorkLead(user, lead),
        // API บังคับหมายเหตุการติดต่อ (เก็บใน event.reason) — ดู LEAD_REASON_REQUIRED
        reason: reasonRule("contact"),
        reasonPolicy: {
          title: "บันทึกการติดต่อลูกค้า",
          label: "หมายเหตุการติดต่อ",
          placeholder: "คุยกับใคร ได้ข้อมูลอะไร นัดอะไรต่อ",
        },
        fields: [{ name: "eventAt", label: "เวลาที่ติดต่อ", type: "datetime" }],
      },
      {
        id: "meeting",
        /* ป้ายเปลี่ยนตามสถานะ — ลีดที่นัดไว้แล้วกดปุ่มนี้คือ "เพิ่ม/เลื่อน" ไม่ใช่กดซ้ำของเดิม
           (กติกาเดียวกับ leadDealAction ที่เปลี่ยนเป็น "เปิดดีลเพิ่ม") */
        label: (lead) => (lead?.status === "meeting" ? "นัดเพิ่ม / เลื่อนนัด" : "บันทึกนัดประชุม"),
        rowLabel: (lead) => (lead?.status === "meeting" ? "นัดเพิ่ม" : "นัดประชุม"),
        rowTone: "teal",
        kind: "submit",
        /* ก้าวถัดไปตัวจริงของขั้น "ติดต่อแล้ว" — เดิมเป็น secondary เพราะ `create_deal`
           ยึดช่อง primary ไว้ ทั้งที่การเปิดดีลไม่ใช่ขั้นในเส้นทาง (ดู leadDealAction)
           ผลคือคนที่จะนัดประชุมต้องไปหาในเมนู "…" ทุกครั้ง */
        slot: "primary",
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
        id: "bounce",
        label: "ตีกลับคิวคัดกรอง",
        rowLabel: "ตีกลับ",
        kind: "bounce",
        from: allowedFrom("bounce"),
        to: "new",
        reason: reasonRule("bounce"),
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
        rowLabel: "ไม่ไปต่อ",
        kind: "disqualify",
        from: allowedFrom("disqualify"),
        to: "disqualified",
        reason: reasonRule("disqualify"),
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
export const LEAD_TRANSITION_ACTIONS = ["screen", "assign", "reassign", "contact", "meeting", "bounce", "disqualify"];

/* ── "เปิดดีลจากลีดนี้" = action เดี่ยว ไม่ใช่ขั้นในเส้นทาง ────────────────────
   มติผู้ใช้ 2026-08-04: **เปิดดีลได้ตั้งแต่ติดต่อแล้ว หรือจะรอนัดประชุมก่อนก็ได้**
   มันจึงไม่ใช่ "ก้าวถัดไป" ของขั้นใดขั้นหนึ่ง — เดิมประกาศเป็น transition slot primary
   ทำให้ปุ่มก้าวถัดไปที่ขั้น "ติดต่อแล้ว" กลายเป็น "สร้างดีล" แล้ว **นัดประชุม (ขั้นถัดไป
   ตัวจริง) ถูกดันลงเมนู "…"** · แยกออกมาแล้วขั้นถัดไปกลับไปเป็นนัดประชุมตามเส้นทางจริง

   ⭐ เปิดได้จากสถานะไหนบ้างยังยึด `LEAD_TRANSITIONS` ที่เดียวเหมือนเดิม (contacted /
   meeting / qualified) — ไม่สะกดลิสต์ซ้ำ

   🐞 เดิมมีเงื่อนไข `status !== 'qualified'` ปิดปุ่มทันทีที่เปิดดีลใบแรก ทั้งที่อีก 3 ที่
   ในระบบรองรับ "ลีด 1 ใบหลายดีล" ไว้ครบ (LEAD_TRANSITIONS.qualified · POST /deals
   ที่บันทึก event ทุกครั้งแม้ qualified แล้ว · คอมเมนต์ใน leads.js) ⇒ แตกดีลใบที่ 2
   จากหน้าจอไม่ได้เลย · เอาออกแล้ว (มติผู้ใช้ 2026-08-04)

   ⚠️ ตัวเดียวให้ทั้งหน้ารายการและหน้ารายละเอียดใช้ — ห้ามให้แต่ละหน้าคิดเงื่อนไขเอง
   ผู้เรียกส่ง `icon`/`onClick` ของตัวเองมา (คนละที่วางปุ่มกัน) ส่วนกติกาว่า
   "โผล่เมื่อไร ป้ายว่าอะไร" อยู่ที่นี่ */
export const LEAD_DEAL_STATUSES = allowedFrom("create_deal");

export function leadDealAction({ lead, user, canCreateDeals = false, icon, onClick } = {}) {
  const eligible = LEAD_DEAL_STATUSES.includes(lead?.status);
  return {
    id: "create_deal",
    // ลีดที่เปิดดีลไปแล้วต้องบอกให้ชัดว่านี่คือ "ใบเพิ่ม" ไม่ใช่กดซ้ำของเดิม
    label: lead?.status === "qualified" ? "เปิดดีลเพิ่มจากลีดนี้" : "เปิดดีลจากลีดนี้",
    rowLabel: lead?.status === "qualified" ? "เปิดดีลเพิ่ม" : "สร้างดีล",
    kind: "submit",
    slot: "primary",
    icon,
    visible: Boolean(eligible && canCreateDeals && canWorkLead(user, lead)),
    onClick,
  };
}

/**
 * แปลงค่าที่ผู้ใช้กรอกใน TransitionDialog → body ของ `POST /leads/[id]/transition`
 *
 * แยกออกมาเป็นฟังก์ชันบริสุทธิ์เพราะหน้ารายการกับหน้ารายละเอียดเคยประกอบ body เองคนละที่
 * แล้วไม่ตรงกัน (หน้ารายการส่ง eventAt เฉพาะ contact/meeting · หน้ารายละเอียดส่งทุก action)
 * — ต่างกันไม่ทำให้พังวันนี้ แต่เป็นทางที่กติกาจะแตกออกจากกันอีกรอบ
 *
 * ⚠️ ค่าว่างต้องเป็น `undefined` ไม่ใช่ `null`/`""` — `JSON.stringify` ตัด undefined ทิ้ง
 * ส่วน `null` จะไปถึง handler แล้วเข้าเงื่อนไข `!body.assigneeId` เหมือนกันก็จริง
 * แต่ `team: null` ทำให้ `TEAMS.includes(null)` ตกด้วยข้อความคนละอันกับที่ตั้งใจ
 */
export function buildLeadTransitionPayload({ action, values = {}, users = [] } = {}) {
  const assignee = users.find((user) => user.id === values.assigneeId);
  const eventAt = values.eventAt ? new Date(values.eventAt) : null;
  return {
    action,
    team: values.team || undefined,
    assigneeId: values.assigneeId || undefined,
    assigneeName: assignee ? fmtName(assignee) : undefined,
    reason: values.reason?.trim() || undefined,
    meetingMode: action === "meeting" ? values.meetingMode || undefined : undefined,
    eventAt: eventAt && !Number.isNaN(eventAt.getTime()) ? eventAt.toISOString() : undefined,
  };
}
