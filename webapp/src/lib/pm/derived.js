// PM (project management) DERIVED status + urgency helpers — the SINGLE SOURCE
// for the client-side "what state is this project/task in" logic. Previously
// copy-pasted across app/pm/projects/page.js, app/pm/projects/[id]/page.js and
// app/pm/tasks/page.js; the /pm overview (command center) needs the same rules,
// so they live here.
//
// (Distinct from lib/pm/status.js, which is the SERVER-side predecessor-graph
// auto-status propagation. This file is purely presentation-derived + JSX-free.)

// ── Project-level ─────────────────────────────────────────────────────
// Derived status of a project from its own `status` + its tasks:
//   Dropped / On Hold (explicit) → Completed → Delayed → New → On Track.
export const getComputedStatus = (p) => {
  if (!p) return "";
  if (p.status === "Dropped") return "Dropped";
  if (p.status === "On Hold") return "On Hold";

  const total = p.tasks?.length || 0;
  const done = p.tasks?.filter((t) => t.status === "Completed").length || 0;
  if (total > 0 && done === total) return "Completed";

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdueCount = (p.tasks || []).filter((t) => t.status !== "Completed" && t.finishDate && new Date(t.finishDate) < today).length;
  if (overdueCount > 0) return "Delayed";

  if (total === 0 || p.tasks.every((t) => t.status === "Pending")) return "New";

  return "On Track";
};

export const statusDotColor = (s) => s === "Completed" ? "var(--green)" : s === "On Track" ? "var(--green)" : s === "Delayed" ? "var(--red)" : s === "On Hold" ? "var(--amber)" : s === "Dropped" ? "var(--red)" : "var(--accent)";
export const statusPillClass = (s) => s === "Completed" ? "success" : s === "On Track" ? "success" : s === "Delayed" ? "danger" : s === "On Hold" ? "warning" : s === "Dropped" ? "danger" : "primary";

// ===== progress helpers (mirror ss-cj) =====
export const getProgress = (p) => {
  const total = p.tasks?.length || 0;
  const done = p.tasks?.filter((t) => t.status === "Completed").length || 0;
  return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
};
export const getCurrentStep = (p) => {
  if (getComputedStatus(p) === "Completed") return "เสร็จสิ้นทุกขั้นตอน";
  const active = p.tasks?.find((t) => t.status === "In Progress");
  return active ? active.name : (p.tasks?.find((t) => t.status === "Pending")?.name || "-");
};
export const getOverdueCount = (p) => {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return (p.tasks || []).filter((t) => t.status !== "Completed" && t.finishDate && new Date(t.finishDate) < today).length;
};

/* ── ช่วงเวลาจริงของโครงการ (มติผู้ใช้ 2026-08-12) ─────────────────────────
   โครงการเป็น "ภาชนะรวมดีล" — วันเริ่มของงานเป็นของแต่ละดีล (ราก segment ถูกปักหมุด
   ตอนรับเลี้ยงเข้าโครงการ) ⇒ วันที่โชว์บนหัวโครงการต้องอ่านจากขั้นตอนจริง ไม่ใช่จาก
   คอลัมน์ `projects.startDate` / `dueDate` ซึ่งเป็นค่าที่ก๊อบมาตอนสร้างครั้งเดียว
   แล้วไม่เดินตามดีลอีกเลย (โครงการหลายดีลจะค้างเป็นวันของดีลใบแรก)

   `projects.startDate` ยังมีหน้าที่อยู่ — เป็น anchor ของ **งานกลาง** (ขั้นตอนที่ไม่มี
   `dealId`) และของโครงการที่ยังไม่มีดีล จึงใช้เป็นค่าสำรองเมื่อยังไม่มีขั้นตอนเลย
   `projects.dueDate` = **เป้า** ที่คนตั้งไว้ (หมุดบน Gantt) คนละตัวกับ "จบจริงตามแผน" */
export const projectDateRange = (p) => {
  const tasks = p?.tasks || [];
  const starts = tasks.map((t) => t.startDate).filter(Boolean).sort();
  const finishes = tasks.map((t) => t.finishDate).filter(Boolean).sort();
  return {
    start: starts[0] || p?.startDate || null,
    finish: finishes[finishes.length - 1] || null,
    target: p?.dueDate || null,
  };
};

// ── Task-level urgency ────────────────────────────────────────────────
// วันที่ใช้วัดความเร่งด่วน: finishDate ก่อน แล้วค่อย dueDate
export const targetDate = (t) => t.finishDate || t.dueDate || null;

// จำนวนวันถึงกำหนด (ลบ = เลยกำหนด) — null ถ้าไม่มีกำหนด
export const daysToDue = (t) => {
  const td = targetDate(t);
  if (!td) return null;
  const d = new Date(td);
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d - today) / (1000 * 60 * 60 * 24));
};

// ต้องรีบ = ยังไม่เสร็จ และเลยกำหนด/เหลือ ≤3 วัน
export const isUrgent = (t) => {
  if (t.status === "Completed") return false;
  const dd = daysToDue(t);
  return dd !== null && dd <= 3;
};

/* ป้ายกำหนดเสร็จของงานติดตาม — ตรรกะล้วน (สี/ไอคอนประกอบที่หน้าจอ)
   🐞 บั๊กที่ตัวนี้ปิด (แก้ 2026-08-17): เวอร์ชันเดิมอยู่ในหน้า /pm/tasks และตัดจบ
   ตั้งแต่ `status === "Pending"` ⇒ งานที่ยังไม่เริ่มและเลยกำหนดไปแล้ว โชว์เทา ๆ ว่า
   "ยังไม่เริ่ม" ต้องกดเป็น "กำลังทำ" ก่อนถึงจะเห็นว่าเลยกำหนด ทั้งที่การ์ด "ต้องรีบ"
   (isUrgent) และ KPI (taskKpi.tallyTask) นับมันมาตั้งแต่ต้น — ตัวเลขกับแถวขัดกันเอง
   ⇒ กติกาใหม่: **ทุกสถานะที่ยังไม่ปิด อ่านวันกำหนดเสมอ**

   tone: done | overdue | soon | waiting | idle | active
     - overdue/soon = อยู่ในมือเรา (แดง/เหลือง)
     - waiting = รอคนอื่นอยู่ (ม่วง) — นาฬิกาเดินต่อ แต่แยกสี/แยกยอดตามมติผู้ใช้ */
export const taskUrgency = (task, { waiting = false } = {}) => {
  if (task.status === "Completed") return { tone: "done", label: "เสร็จแล้ว", overdue: false };
  const dd = daysToDue(task);
  if (dd === null) {
    if (waiting) return { tone: "waiting", label: "รอคนอื่น", overdue: false };
    if (task.status === "Pending") return { tone: "idle", label: "ยังไม่เริ่ม", overdue: false };
    return { tone: "active", label: "กำลังทำ", overdue: false };
  }
  const suffix = waiting ? " · รอคนอื่น" : "";
  if (dd < 0) return { tone: waiting ? "waiting" : "overdue", label: `เลยกำหนด ${Math.abs(dd)} วัน${suffix}`, overdue: true };
  if (dd <= 3) return { tone: waiting ? "waiting" : "soon", label: `เหลือ ${dd} วัน${suffix}`, overdue: false };
  return { tone: waiting ? "waiting" : "active", label: `เหลือ ${dd} วัน${suffix}`, overdue: false };
};
