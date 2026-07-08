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
