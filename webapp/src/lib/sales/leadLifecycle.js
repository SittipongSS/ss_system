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
  LEAD_FOLLOW_UP_ACTIONS,
  LEAD_LOST_REASONS,
  LEAD_LOST_REVISIT_CODES,
  canWorkLead,
} from "@/lib/sales/leads";
import { LEAD_ASSIGNEE_ROLES } from "@/lib/sales/leadAssignee";
import { AUTO_BOUNCE_MAX_ROUNDS } from "@/lib/sales/leadAutoBounce";
import { withWorkload } from "@/lib/sales/leadWorkload";

/* action ที่ handler ตอบ badRequest ถ้าไม่มี `body.reason?.trim()`
   — ไม่ใช่ความชอบของฝั่งหน้าจอ แต่เป็นข้อบังคับของ API
   🐞 เคยประกาศ contact เป็น "optional" (#864) → กดยืนยันโดยไม่พิมพ์ได้ แล้วโดน 400
   เทสต์ `leadLifecycle.test.mjs` อ่าน route.js จริงมาเทียบกับลิสต์นี้ ดริฟต์แล้วแดง */
export const LEAD_REASON_REQUIRED = ["contact", "followup", "bounce", "disqualify"];

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
/* ป้ายกำกับรายคนในช่องมอบหมาย — "คนนี้เคยปล่อยใบนี้จนถูกส่งกลับ"
   ⚠️ **เตือน ไม่ห้าม** (มติผู้ใช้ 2026-08-25): รอบแรกยังมอบคนเดิมได้ถ้ามีเหตุผล
   ตัวล็อกจริงคือทีมที่ถูกล็อกตอนคัดกรองหลังครบ AUTO_BOUNCE_MAX_ROUNDS รอบ
   ⚠️ ต้องมี `lead.bounce` ติดมากับแถว ⇒ API ต้องแนบบริบทให้ใบสถานะ `screened` ด้วย
   ไม่ใช่แค่ `new` ไม่งั้นป้ายนี้ไม่มีวันขึ้น เพราะขั้นมอบหมายอยู่หลังคัดกรอง */
const bouncedHolderNote = (lead, user) => {
  const previous = lead?.bounce?.previousAssigneeId;
  if (!previous || !user?.id || previous !== user.id) return null;
  return {
    label: "เคยถือใบนี้มาแล้ว",
    warning: `คนนี้คือคนที่ปล่อยใบนี้จนถูกส่งกลับ — มอบซ้ำได้ถ้ามีเหตุผล แต่ถ้าเงียบอีกครั้ง `
      + `ใบนี้จะถูกส่งกลับรอบถัดไป และครบ ${AUTO_BOUNCE_MAX_ROUNDS} รอบเมื่อไร ทีมนี้จะถูกล็อกไม่ให้เลือกอีก`,
  };
};

/* เปลี่ยนมือ: คนที่ถืออยู่ตอนนี้ต้องอ่านออกทันที ไม่งั้นเลือกคนเดิมแล้วไม่มีอะไรเกิดขึ้น */
const currentHolderNote = (lead, user) => {
  if (!lead?.assigneeId || !user?.id || lead.assigneeId !== user.id) return null;
  return { label: "ถือใบนี้อยู่ตอนนี้", warning: "เลือกคนเดิม = ไม่มีอะไรเปลี่ยน เลือกคนใหม่ถึงจะย้ายเจ้าของ" };
};

/**
 * @param workload  ภาระงานรายคน `{ [userId]: { holding, waitingContact, lateFollowUp } }`
 *                  จาก /api/sales-planning/leads/workload — ไม่ส่งมาก็ใช้ได้ (ขึ้นเลข 0)
 */
/* ── ชุดช่อง "โทรไปแล้วได้อะไร" — ใช้ร่วมกันทั้งการติดต่อครั้งแรกและครั้งถัดไป ──
   ⚠️ ต้องเป็นชุดเดียวจริง ๆ ไม่ใช่ก๊อปสองชุด — สองกล่องนี้ถามคำถามเดียวกัน
   ก๊อปเมื่อไรมันจะเพี้ยนหากันแบบที่ AGENTS.md ยกตัวอย่างไว้ (ฟอร์มสร้าง vs ฟอร์มแก้)

   ⭐ ค่าไทล์ "ติดตามต่อ" **เปลี่ยนตามสถานะ**: ที่ `assigned` คือ `contact` (ครั้งแรก
   ขยับสถานะ) ที่ `contacted`/`meeting` คือ `followup` (ไม่ขยับ) — ค่าของไทล์คือ
   action จริงเสมอ `actionFrom` จึงอ่านค่าตรง ๆ ได้โดยไม่ต้องรู้จักสถานะ */
const NEXT_STEP_FIELDS = [
  { name: "eventAt", label: "เวลาที่ติดต่อ", type: "datetime" },
  {
    name: "nextStep",
    label: "ก้าวถัดไป",
    type: "tiles",
    required: true,
    /* ⚠️ ไม่มีค่าตั้งต้น — ทุกการติดต่อต้องมีทางออก และทางออกเป็น *การตัดสินใจ*
       ตั้งค่าตั้งต้นเมื่อไร คนจะกดผ่านโดยไม่ได้เลือก (form-design-rules §3) */
    hint: "ทุกการติดต่อต้องมีทางออก — เลือกจากสิ่งที่เพิ่งคุยจบ",
    options: (lead) => [
      {
        value: lead?.status === "assigned" ? "contact" : "followup",
        label: "ติดตามต่อ",
        description: "ยังไม่จบ นัดวันกลับไปหาใหม่",
      },
      { value: "meeting", label: "นัดประชุม", description: "ได้คิวเจอกันแล้ว" },
      { value: "disqualify", label: "ไม่ไปต่อ", description: "ปิดลีดนี้ถาวร" },
    ],
  },
  {
    name: "followUpAt",
    label: "วันติดตามต่อ",
    type: "date",
    required: true,
    visible: (lead, user, values) => LEAD_FOLLOW_UP_ACTIONS.includes(values?.nextStep),
    hint: "วันที่รับปากลูกค้าไว้ว่าจะกลับไปหา — วันนี้จะไปโผล่ในคิวของฉัน",
  },
  {
    name: "meetingMode",
    label: "รูปแบบนัด",
    type: "tiles",
    required: true,
    visible: (lead, user, values) => values?.nextStep === "meeting",
    options: MEETING_MODES.map((mode) => ({ value: mode, label: MEETING_MODE_LABELS[mode] || mode })),
  },
  {
    name: "disqualifiedCode",
    label: "เหตุผลที่ไม่ไปต่อ",
    type: "tiles",
    required: true,
    visible: (lead, user, values) => values?.nextStep === "disqualify",
    options: LEAD_LOST_REASONS.map(({ code, label, hint, countable }) => ({
      value: code,
      label,
      description: countable ? hint : `${hint} · ไม่นับเป็นแพ้ในรายงาน`,
    })),
  },
  {
    name: "revisitAt",
    label: "วันกลับมาถามใหม่",
    type: "date",
    visible: (lead, user, values) =>
      values?.nextStep === "disqualify" && LEAD_LOST_REVISIT_CODES.includes(values?.disqualifiedCode),
    hint: "เว้นว่างได้ถ้าลูกค้าไม่ได้ให้กำหนด",
  },
];

/* ปลายทางจริงมาจากไทล์ ไม่ใช่ id ของปุ่มที่กด · ป้าย+สีของปุ่มยืนยันเดินตามด้วย
   เพราะปิดลีดถาวรต้องไม่ซ่อนอยู่ใต้ปุ่มสีเดียวกับการโทรตามธรรมดา */
const nextStepAction = (fallback) => (values) => values?.nextStep || fallback;
const nextStepConfirm = (fallbackLabel) => (values) => (
  values?.nextStep === "disqualify" ? { label: "ปิดลีด — ไม่ไปต่อ", tone: "danger" }
    : values?.nextStep === "meeting" ? { label: "บันทึกนัดประชุม", tone: "primary" }
      : { label: fallbackLabel, tone: "primary" }
);

export function createLeadLifecycle({ users = [], canCreateDeals = false, viewerTeam = null, workload = null } = {}) {
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
            /* ⭐ **ล็อกทีมเดิมเมื่อใบนี้ถูกส่งกลับอัตโนมัติครบโควตารอบแล้ว**
               🪤 ไม่มีด่านนี้ = วนไม่รู้จบ: ระบบตีกลับ → ผู้ดูแลคัดเข้าทีมเดิม (ข้อมูล
               ลีดยังบอกอย่างเดิม) → มอบคนเดิม → เงียบอีก → ตีกลับอีก · เพดานใน cron
               หยุดได้แค่ "ไม่ตีกลับรอบที่ 3" ปลายทางคือลีดค้างถาวรโดยไม่มีใครตัดสิน
               ⚠️ **ล็อกไม่ซ่อน** (กฎโปรเจกต์: "ตัวเลือกที่ไม่มีสิทธิ์ต้องเห็นว่ามีอยู่")
               — ซ่อนแล้วผู้ดูแลจะงงว่าทีมหายไปไหน แล้วไปหาทางอื่น
               ⚠️ กติกา "ครบกี่รอบ" อยู่ที่ `leadBounceHistory` ที่เดียวร่วมกับป้ายในคิว */
            options: (lead) => TEAMS.map((team) => {
              const locked = lead?.bounce?.teamLocked === team;
              return {
                value: team,
                /* ⚠️ **เหตุผลอยู่ในป้ายตัวเลือกเอง** ไม่ใช่ tooltip หรือ hint ใต้ช่อง —
                   `Select` ไม่เรนเดอร์ `hint` รายตัวเลือก และกฎโปรเจกต์บอกว่า
                   "ปุ่มที่กดไม่ได้ต้องบอกเหตุผลติดปุ่ม · จางเฉย ๆ คือสิ่งที่ทำให้คน
                   คิดว่าระบบพัง" · ตัวเลือกที่จางโดยไม่มีคำอธิบายก็เข้าข่ายเดียวกัน */
                label: locked
                  ? `${TEAM_LABELS[team] || team} — ส่งกลับจากทีมนี้มาแล้ว ${AUTO_BOUNCE_MAX_ROUNDS} รอบ`
                  : TEAM_LABELS[team] || team,
                disabled: locked,
              };
            }),
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
        dialogSize: "md", // แถวรายชื่อ + ตัวเลขภาระงาน 3 ช่อง ไม่ลงในกล่อง 480px
        /* ⭐ มติผู้ใช้ 2026-08-08: **AE Supervisor กระจายลีดได้ทุกทีม**
           เดิมเงื่อนไขเป็น `admin || inTeamOf` ซึ่งไม่ครอบ ae_supervisor (ตำแหน่งนี้ไม่มีทีม
           `inTeamOf` จึงไม่มีวันจริง) ⇒ ปุ่มไม่เคยโผล่ ทั้งที่ handler เปิดให้มาตลอด
           (`superuser || inTeam`) — ทางลัดที่ทำได้แต่ไม่มีใครเห็น · ตอนนี้ตรงกับ API แล้ว */
        visible: (lead, user) => isSuperuser(user?.role) || inTeamOf(user, lead),
        fields: [
          {
            name: "assigneeId",
            label: "ผู้รับผิดชอบ",
            /* ⭐ ไม่ใช่ดรอปดาวน์ — คำถามตรงนี้คือ "ตอนนี้ใครยังตามงานไหว" ซึ่งตอบไม่ได้
               ถ้าตัวเลขภาระงานถูกพับไว้ข้างใน (เหตุผลเต็มอยู่หัวไฟล์ PersonLoadSelect) */
            type: "person-load",
            required: true,
            hint: "ตัวเลขคือของค้าง ณ ตอนนี้ ไม่ใช่ผลงานรายเดือน",
            /* ฟังก์ชันของลีด ไม่ใช่อาร์เรย์ตายตัว — lifecycle สร้างครั้งเดียวต่อหน้า
               แต่หน้ารายการมีลีดหลายทีมในจอเดียว (ดู fieldUsers ใน recordLifecycle) */
            users: (lead) => withWorkload(assignableFor(users, viewerTeam, lead?.team), workload),
            noteOf: bouncedHolderNote,
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
        dialogSize: "md",
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
            type: "person-load",
            required: true,
            hint: "ตัวเลขคือของค้าง ณ ตอนนี้ ไม่ใช่ผลงานรายเดือน",
            users: (lead) => withWorkload(assignableFor(users, viewerTeam, lead?.team), workload),
            noteOf: currentHolderNote,
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
        dialogSize: "md",
        /* ⭐ กล่องเดียวกับการติดตามครั้งถัดไป — คำถามเดียวกัน ("โทรไปแล้วได้อะไร")
           ⚠️ ที่สถานะนี้ ไทล์ "ติดตามต่อ" มีค่าเป็น `contact` (ครั้งแรก ขยับสถานะ)
           ส่วน "นัดประชุม" ยิง `meeting` ตรง ๆ ได้แล้ว (มติผู้ใช้ 2026-08-26)
           โทรครั้งแรกแล้วได้คิวเลยเป็นเรื่องปกติ ไม่ต้องบันทึกสองก้าว */
        actionFrom: nextStepAction("contact"),
        confirmFrom: nextStepConfirm("บันทึกการติดต่อ"),
        reasonPolicy: {
          title: "บันทึกการติดต่อลูกค้า",
          label: "หมายเหตุการติดต่อ",
          placeholder: "คุยกับใคร ได้ข้อมูลอะไร นัดอะไรต่อ",
        },
        fields: NEXT_STEP_FIELDS,
      },
      {
        /* ⭐ ติดตามครั้งที่ 2 ขึ้นไป — **ไม่ขยับสถานะ** (มติผู้ใช้ 2026-08-25)
           🐞 ของเดิมบันทึกการติดต่อซ้ำไม่ได้เลย: `LEAD_TRANSITIONS.contacted` ไม่มี
           `contact` ⇒ AE ที่โทรตามรอบสองกดปุ่มไม่ได้ ต้องไปเขียนในเธรดกลางแทน
           ซึ่งไม่มีวันที่ให้ระบบทวงต่อ — ลีดจึงเงียบหายไปเฉย ๆ
           ⚠️ `to: null` โดยเจตนา (ท่าเดียวกับ reassign) ⇒ ใช้ได้ทั้งจาก `contacted`
           และ `meeting` โดยไม่ดึงใบที่นัดแล้วถอยกลับ
           ⚠️ slot = primary เฉพาะตอนอยู่ `contacted` — ที่ `meeting` ก้าวถัดไปตัวจริง
           คือไปประชุมหรือเปิดดีล การโทรตามระหว่างรอเป็นงานรอง */
        id: "followup",
        label: "บันทึกการติดต่อ",
        rowLabel: "ติดต่อ",
        rowTone: "teal",
        kind: "submit",
        /* ⭐ **ประตูเดียวของ "โทรไปแล้วได้อะไร"** (มติผู้ใช้ 2026-08-26 — กลับคำจากมติ
           2026-08-04 ที่ยก `meeting` ขึ้นเป็น primary) · ของเดิมยกสามปลายทางขึ้นเป็นปุ่ม
           คู่กันบนแผง (นัดประชุม / ติดตาม / ไม่ไปต่อ) ⇒ คนต้องตัดสินใจ **ก่อน** เปิดกล่อง
           ทั้งที่คำตอบเพิ่งเกิดขึ้นในสายที่เพิ่งวาง · ตอนนี้เป็นปุ่มเดียว แล้วถามในกล่อง */
        slot: "primary",
        from: allowedFrom("followup"),
        to: null,
        visible: (lead, user) => canWorkLead(user, lead),
        reason: reasonRule("followup"),
        dialogSize: "md",
        /* ⚠️ ปลายทางจริงมาจากไทล์ "ก้าวถัดไป" — ทั้งสามเป็น action ที่สถานะนี้ทำได้อยู่แล้ว
           (ดู LEAD_TRANSITIONS.contacted / .meeting) ไม่ได้เปิดสิทธิ์ใหม่ให้ใคร */
        actionFrom: nextStepAction("followup"),
        confirmFrom: nextStepConfirm("บันทึกการติดต่อ"),
        reasonPolicy: {
          title: "บันทึกการติดต่อลูกค้า",
          label: "หมายเหตุการติดต่อ",
          placeholder: "คุยกับใคร คืบหน้าแค่ไหน ตกลงอะไรกันไว้",
        },
        fields: NEXT_STEP_FIELDS,
      },
      {
        id: "meeting",
        /* ป้ายเปลี่ยนตามสถานะ — ลีดที่นัดไว้แล้วกดปุ่มนี้คือ "เพิ่ม/เลื่อน" ไม่ใช่กดซ้ำของเดิม
           (กติกาเดียวกับ leadDealAction ที่เปลี่ยนเป็น "เปิดดีลเพิ่ม") */
        label: (lead) => (lead?.status === "meeting" ? "นัดเพิ่ม / เลื่อนนัด" : "บันทึกนัดประชุม"),
        rowLabel: (lead) => (lead?.status === "meeting" ? "นัดเพิ่ม" : "นัดประชุม"),
        rowTone: "teal",
        kind: "submit",
        /* ⚠️ กลับมาเป็น secondary (มติผู้ใช้ 2026-08-26) — ปุ่มนี้ยังอยู่สำหรับกรณีที่
           "ได้นัดมาโดยไม่ได้เพิ่งโทร" (ลูกค้าทักมาเอง / นัดต่อจากที่ประชุมก่อน)
           แต่ทางหลักคือเลือก "นัดประชุม" ในกล่องบันทึกการติดต่อ ซึ่งเก็บหมายเหตุสายนั้นด้วย
           สองปุ่ม primary พร้อมกันบนแผงเดียว = ไม่มีปุ่มไหนเป็น primary จริง */
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
        // เหตุผล 8 ข้อเรียงเป็นไทล์ — กล่อง sm บีบเหลือ 2 คอลัมน์ = 4 แถว ต้องเลื่อนอ่าน
        // md ได้ 3 คอลัมน์ เห็นครบทุกข้อพร้อมกันก่อนตัดสินใจ (มติผู้ใช้ 2026-08-25)
        dialogSize: "md",
        visible: (lead, user) => oversees(user, lead),
        reasonPolicy: {
          title: "ปิดลีดนี้",
          description: "ลีดจะถูกปิดถาวร เหตุผลจะถูกเก็บในประวัติ",
          label: "รายละเอียด",
          placeholder: "เกิดอะไรขึ้นจริง ๆ — เช่น เสนอไป 1.4 ล้าน ลูกค้าตั้งงบไว้ 8 แสน",
        },
        /* ⭐ รหัสเหตุผล (mig 0290) — **หัวข้อก่อน แล้วค่อยรายละเอียด**
           ข้อความอิสระอย่างเดียวนับไม่ได้ ("งบไม่ถึง"/"งบไม่พอ"/"ลูกค้าบอกแพง" =
           เรื่องเดียวกันแต่ group by ไม่ได้) ⇒ รายงาน "แพ้เพราะอะไร" เกิดไม่ได้เลย
           ⚠️ ตัวเลือกมาจาก `LEAD_LOST_REASONS` ที่เดียว — สะกดซ้ำที่นี่เมื่อไร
           ฟอร์มกับ CHECK ของ DB จะเริ่มไม่ตรงกัน แล้วผู้ใช้เลือกได้แต่บันทึกไม่ได้ */
        fields: [
          {
            name: "disqualifiedCode",
            label: "เหตุผลที่ไม่ไปต่อ",
            /* ⭐ **ไทล์ ไม่ใช่ดรอปดาวน์** — ตัวเลือกตายตัวไม่โต ต้องกางให้เห็นทั้งหมด
               (form-design-rules "เลือกคอนโทรลอะไร") · ดรอปดาวน์ซ่อนว่ามีกี่แบบจนกว่า
               จะกด แล้วคนจะหยิบตัวแรกที่เห็นแทนตัวที่ตรงจริง ⇒ รายงาน "แพ้เพราะอะไร"
               จะเอียงไปทางตัวเลือกบนสุดโดยไม่มีใครรู้ */
            type: "tiles",
            required: true,
            options: LEAD_LOST_REASONS.map(({ code, label, hint, countable }) => ({
              value: code,
              label,
              // คำอธิบายมาจากลิสต์เดียวกับรหัส — สะกดที่จอเมื่อไรก็เริ่มไม่ตรงกัน
              description: countable ? hint : `${hint} · ไม่นับเป็นแพ้ในรายงาน`,
            })),
          },
          /* ช่องที่โผล่ตามเงื่อนไข **อยู่ใต้ตัวที่ทำให้มันโผล่** (form-design-rules §1.3)
             ⭐ "ยังไม่พร้อม" ไม่ใช่แพ้ถาวร — เก็บวันกลับมาถามใหม่ไว้ ไม่งั้นดีลที่แค่
             เลื่อนเวลาจะหายไปเท่ากับดีลที่แพ้จริง
             ⚠️ ไม่บังคับกรอก — บางเคสลูกค้าบอกแค่ "ไว้ก่อน" ไม่มีกำหนด บังคับแล้วคนจะ
             กรอกวันมั่วเพื่อให้ผ่านด่าน ซึ่งแย่กว่าเว้นว่าง */
          {
            name: "revisitAt",
            label: "วันกลับมาถามใหม่",
            type: "date",
            visible: (lead, user, values) => LEAD_LOST_REVISIT_CODES.includes(values?.disqualifiedCode),
            hint: "เว้นว่างได้ถ้าลูกค้าไม่ได้ให้กำหนด",
          },
        ],
      },
    ],
  });
}

/* transition ที่ต้องส่งไป `POST /transition` (ที่เหลือหน้าจัดการเอง) */
export const LEAD_TRANSITION_ACTIONS = ["screen", "assign", "reassign", "contact", "followup", "meeting", "bounce", "disqualify"];

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
    // ⚠️ ส่งเฉพาะตอนปิดลีด — ติดไปกับ action อื่นไม่พังวันนี้ (handler ไม่อ่าน)
    // แต่เป็นทางที่ payload จะเริ่มโกหกว่า "ทุก action มีเหตุผลที่ไม่ไปต่อ"
    disqualifiedCode: action === "disqualify" ? values.disqualifiedCode || undefined : undefined,
    // ⚠️ ช่องนี้โผล่เฉพาะเหตุผลที่ "ไม่ใช่แพ้ถาวร" — dialog ตัดค่าที่ค้างให้แล้วตอนซ่อน
    revisitAt: action === "disqualify" ? values.revisitAt || undefined : undefined,
    meetingMode: action === "meeting" ? values.meetingMode || undefined : undefined,
    eventAt: eventAt && !Number.isNaN(eventAt.getTime()) ? eventAt.toISOString() : undefined,
    /* ⚠️ ส่งเฉพาะ action ที่ API รับ (LEAD_FOLLOW_UP_ACTIONS) — ส่งไปกับ action อื่น
       ไม่พังวันนี้เพราะ handler ไม่อ่าน แต่เป็นทางที่ payload จะเริ่มโกหกว่า
       "ทุก action มีวันติดตาม" · ค่ามาจาก DateInput เป็น ISO วันล้วน (YYYY-MM-DD)
       handler แปลงเป็น timestamptz เอง */
    followUpAt: LEAD_FOLLOW_UP_ACTIONS.includes(action) ? values.followUpAt || undefined : undefined,
  };
}
