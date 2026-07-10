"use client";
import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Plus, PlusCircle, X, Flag, FileText, GanttChart,
  ListTodo, AlertTriangle, CheckCircle2, Clock, Calendar,
  TrendingUp, Edit2, Trash2, ChevronDown, ChevronRight, ChevronUp,
  Activity, CircleDashed, Pause,
  Check, Printer, Table2, Filter, ArrowUpDown, User, FolderX,
  GitCommit, History, RotateCcw, ShieldCheck, PackageCheck, ExternalLink,
} from "lucide-react";
import { useCan, useRole } from "@/lib/roleContext";
import { TEAM_LABELS, isSuperuser } from "@/lib/permissions";
import Modal from "@/components/Modal";
import ProjectDocumentView from "@/components/pm/ProjectDocumentView";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import PredecessorPicker, { PredecessorPopover } from "@/components/pm/PredecessorPicker";
import Select from "@/components/ui/Select";
import StatusSelect, { taskStatusColor } from "@/components/pm/StatusSelect";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import SearchableSelect from "@/components/ui/SearchableSelect";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/tax/ConfirmModal";
import { setHolidays, countBusinessDays, isBusinessDay, toLocalISODate } from "@/lib/pm/dateHelpers";
import { openGanttPrintWindow } from "@/lib/pm/ganttPrint";
import { getComputedStatus, statusDotColor, statusPillClass } from "@/lib/pm/derived";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { fmtDateTime } from "@/lib/format";

const STATUS_TH = {
  New: "ใหม่ (New)", "In Progress": "ดำเนินการ (Active)", Completed: "เสร็จสิ้น (Completed)",
  "On Hold": "ระงับ (On Hold)", Dropped: "ยกเลิก (Dropped)",
};


const ROLES = ["SA", "RD", "PC", "PD", "QC", "LG", "WH", "ALL"];

// ฝ่ายอื่นที่ไม่ใช่ SA — เข้ามาในนาม "ตัวแทนฝ่าย" (staff 1 คนต่อฝ่าย). ขั้นตอนของ
// ฝ่ายเหล่านี้ถูกมอบหมายอัตโนมัติให้ตัวแทนฝ่ายนั้น (ไม่ต้องเลือกคน — เห็นใน My Work เอง).
const STAFF_DEPTS = ["PC", "PD", "WH", "RD", "QC"];

// ตัวแทนของฝ่าย (staff ที่ department ตรง) — โมเดลปัจจุบัน 1 คนต่อฝ่าย
function deptRep(users, dept) {
  return users.find((u) => u.role === "staff" && u.department === dept) || null;
}

// ชื่อผู้รับผิดชอบที่จะโชว์บน timeline/list:
//   - มี assigneeId (ขั้นตอน SA ที่ assign รายคน) → ชื่อคนนั้น
//   - ขั้นตอนฝ่ายอื่น → ตัวแทนฝ่ายนั้น (auto)
function resolveAssigneeName(task, users) {
  if (task.assigneeId) return users.find((u) => u.id === task.assigneeId)?.name || task.assignee || "—";
  if (STAFF_DEPTS.includes(task.role)) {
    const rep = deptRep(users, task.role);
    return rep ? rep.name : `ตัวแทนฝ่าย ${task.role}`;
  }
  return task.assignee || "—";
}

// ช่อง "ผู้รับผิดชอบ" ในฟอร์มแก้ขั้นตอน — ปรับตามฝ่ายของขั้นตอน:
//   SA          → เลือกคนใน SA จัดกลุ่มตามทีม ODM/KA/SV (assign รายคน)
//   ฝ่ายอื่น     → มอบหมายอัตโนมัติให้ตัวแทนฝ่าย (อ่านอย่างเดียว ไม่ต้องเลือก)
//   LG/ALL/อื่น → ไม่ระบุรายคน
function AssigneeField({ form, setForm, users }) {
  const role = form.role;
  if (role === "SA") {
    const byTeam = {};
    users.filter((u) => u.department === "SA").forEach((u) => {
      (byTeam[u.team || "—"] ||= []).push(u);
    });
    const teams = Object.keys(byTeam).sort();
    return (
      <Select
        value={form.assigneeId || ""}
        onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}
        style={{ flex: 1 }}
        title="มอบหมายให้คนใน SA (จะไปอยู่ใน 'งานของฉัน' ของคนนั้น)"
      >
        <option value="">— ไม่มอบหมาย —</option>
        {teams.map((tm) => (
          <optgroup key={tm} label={TEAM_LABELS[tm] || tm}>
            {byTeam[tm].map((u) => <option key={u.id} value={u.id}>{u.name || u.email}</option>)}
          </optgroup>
        ))}
      </Select>
    );
  }
  if (STAFF_DEPTS.includes(role)) {
    const rep = deptRep(users, role);
    return (
      <span style={{ flex: 1, fontSize: "12px", color: "var(--text-2)", background: "var(--panel-2)", padding: "6px 10px", borderRadius: "8px", border: "1px solid var(--border)" }}>
        มอบหมายอัตโนมัติ → ตัวแทนฝ่าย {role}{rep ? `: ${rep.name}` : " (ยังไม่มีตัวแทน)"}
      </span>
    );
  }
  return (
    <span style={{ flex: 1, fontSize: "12px", color: "var(--text-3)" }}>— ไม่ระบุรายคน ({role}) —</span>
  );
}

const PHASE_COLORS = ["var(--accent)", "var(--purple)", "var(--blue)", "var(--amber)", "#f97316", "var(--green)", "var(--accent)"];

const typeStyle = (type) => type === "NPD"
  ? { background: "var(--purple)", color: "#fff" }
  : { background: "var(--blue)", color: "#fff" };

// per-department badge colors (mirror ss-cj)
const roleStyle = (role) => {
  switch (role) {
    case "SA":  return { bg: "color-mix(in srgb, var(--accent) 12%, transparent)",  border: "color-mix(in srgb, var(--accent) 35%, transparent)",  color: "var(--accent)" };
    case "RD":  return { bg: "color-mix(in srgb, var(--purple) 12%, transparent)", border: "color-mix(in srgb, var(--purple) 35%, transparent)", color: "var(--purple)" };
    case "PC":  return { bg: "color-mix(in srgb, var(--blue) 12%, transparent)",   border: "color-mix(in srgb, var(--blue) 35%, transparent)",   color: "var(--blue)" };
    case "PD":  return { bg: "color-mix(in srgb, var(--blue) 10%, transparent)",   border: "color-mix(in srgb, var(--blue) 25%, transparent)",   color: "var(--blue)" };
    case "QC":  return { bg: "color-mix(in srgb, var(--green) 12%, transparent)",  border: "color-mix(in srgb, var(--green) 35%, transparent)",  color: "var(--green)" };
    case "LG":  return { bg: "color-mix(in srgb, var(--amber) 12%, transparent)",  border: "color-mix(in srgb, var(--amber) 35%, transparent)",  color: "var(--amber)" };
    case "WH":  return { bg: "color-mix(in srgb, var(--text-2) 10%, transparent)", border: "color-mix(in srgb, var(--text-2) 25%, transparent)", color: "var(--text-2)" };
    case "ALL": return { bg: "color-mix(in srgb, var(--red) 10%, transparent)",    border: "color-mix(in srgb, var(--red) 25%, transparent)",    color: "var(--red)" };
    default:    return { bg: "var(--bg)", border: "var(--border)", color: "var(--text-2)" };
  }
};

const formatDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// พรีวิว "วันเสร็จ" ในฟอร์มแก้ — ใช้เอนจินวันทำการเดียวกับ server (recalculateForward):
// เลื่อนวันเริ่มมาเป็นวันทำการก่อน แล้วบวก (duration-1) วันทำการ. server คำนวณซ้ำตอนบันทึก
// (ค่าที่โชว์ตรงกับที่ 3 วิวจะแสดงหลังบันทึก ตราบใดที่ปฏิทินวันหยุดฝั่ง client โหลดแล้ว).
const computeFinish = (startStr, dur) => {
  if (!startStr) return null;
  const d = new Date(startStr);
  if (isNaN(d.getTime())) return null;
  while (!isBusinessDay(d)) d.setDate(d.getDate() + 1);
  let need = Math.max(0, (Number(dur) || 1) - 1);
  while (need > 0) { d.setDate(d.getDate() + 1); if (isBusinessDay(d)) need--; }
  return d;
};

// ผกผันของ computeFinish: วันเริ่ม + วันสิ้นสุด → ระยะเวลา (วันทำการ, inclusive)
const durationFromDates = (startStr, finishStr) => {
  if (!startStr || !finishStr) return 1;
  const s = new Date(startStr); const fe = new Date(finishStr);
  if (isNaN(s.getTime()) || isNaN(fe.getTime()) || fe <= s) return 1;
  return Math.max(1, countBusinessDays(startStr, finishStr) + 1);
};

// Actual vs planned finish variance (mirror ss-cj)
const getVariance = (task) => {
  if (task.status !== "Completed" || !task.actualFinishDate || !task.finishDate) return null;
  const plan = new Date(task.finishDate); plan.setHours(0, 0, 0, 0);
  const actual = new Date(task.actualFinishDate); actual.setHours(0, 0, 0, 0);
  // นับเป็น "วันทำการ" ให้ตรงกับไทม์ไลน์ (ข้ามเสาร์-อาทิตย์ + วันหยุด) ไม่ใช่วันปฏิทิน
  const diff = countBusinessDays(plan, actual);
  if (diff > 0) return { color: "var(--red)", label: `ช้ากว่าแผน ${diff} วันทำการ` };
  if (diff < 0) return { color: "var(--green)", label: `เร็วกว่าแผน ${Math.abs(diff)} วันทำการ` };
  return { color: "var(--green)", label: "ตรงตามแผน" };
};

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const hasEditCap = useCan("pm:edit");
  const canCreateTaxRegistration = useCan("products:edit");
  const userRole = useRole();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [addingProduct, setAddingProduct] = useState("");
  // มุมมองสลับอัตโนมัติตามจอ: จอตั้ง → List, จอนอน → Table; Gantt (document) เลือกเองได้
  const [view, setView] = useResponsiveView({ portrait: "list", landscape: "table" }); // list | table | document
  const [showAddTask, setShowAddTask] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [taskForm, setTaskForm] = useState({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: [], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false, assigneeId: "" });
  const [collapsedPhases, setCollapsedPhases] = useState(() => new Set());
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [insertAfterId, setInsertAfterId] = useState(null); // บั๊ก C: แทรกขั้นตอนตรงตำแหน่ง
  const [insertBeforeId, setInsertBeforeId] = useState(null); // แทรก "ก่อน" หัวแถวแรกของเฟส
  const [tableStatusFilter, setTableStatusFilter] = useState("all"); // Table view: all | pending | progress | completed
  const [tableSort, setTableSort] = useState("step"); // Table view: step | name | status | due
  const [editTask, setEditTask] = useState(null); // ขั้นตอนที่กำลังแก้ผ่าน modal (ใช้จาก Table view)
  const [showEditTask, setShowEditTask] = useState(false);
  const [depPopover, setDepPopover] = useState(null); // popover แก้ predecessors ในตาราง — { task, x, y }
  const [dirty, setDirty] = useState({}); // เฟส 1: การแก้ task ที่ค้างรอยืนยัน (taskId -> patch รวม)
  // เฟส 2: document revision control — ออก Revise = freeze เอกสารทั้งชุดเป็นเวอร์ชัน + เลข Rev
  const [showRevisions, setShowRevisions] = useState(false);
  const [revisions, setRevisions] = useState([]);
  const [issuingRev, setIssuingRev] = useState(false);
  const [showIssueRev, setShowIssueRev] = useState(false); // modal ออกเวอร์ชันใหม่ (แทน window.prompt)
  const [revNote, setRevNote] = useState("");
  const [revError, setRevError] = useState("");
  const [toast, setToast] = useState(null); // { kind: 'success'|'error'|'info', msg }
  const [creatingTaxReg, setCreatingTaxReg] = useState(false);

  const [confirmState, setConfirmState] = useState(null); // ยืนยันแบบ promise (แทน window.confirm)
  const [showDrop, setShowDrop] = useState(false); // modal ยกเลิกโปรเจกต์ (แทน window.prompt)
  const [dropReason, setDropReason] = useState("");
  const isFirstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/pm/projects/${id}`);
      if (res.ok) {
        const d = await res.json();
        setData(d);
        if (isFirstLoad.current) {
          const phases = new Set((d.tasks || []).map(t => t.phase).filter(Boolean));
          setCollapsedPhases(phases);
          isFirstLoad.current = false;
        }
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    fetch("/api/customers").then((r) => (r.ok ? r.json() : [])).then((d) => setCustomers(d || [])).catch(() => {});
    fetch("/api/product-types").then((r) => (r.ok ? r.json() : [])).then((d) => setCategories(d || [])).catch(() => {});
    fetch("/api/pm/assignable-users").then((r) => (r.ok ? r.json() : [])).then((d) => setUsers(d || [])).catch(() => {});
    // โหลดปฏิทินวันหยุดจริงให้ฝั่ง client (Gantt/Document view นับวันทำการถูกต้อง)
    fetch("/api/holidays").then((r) => (r.ok ? r.json() : [])).then((d) => {
      if (Array.isArray(d) && d.length) setHolidays(d.map((h) => h.date));
    }).catch(() => {});
  }, []);
  // FG picker: scope to the project's customer so cross-team FGs of the same
  // customer show up (product.team = creator's team, not the customer's).
  const projectCustomerId = data?.customerId;
  useEffect(() => {
    if (!data) return;
    const url = projectCustomerId
      ? `/api/products?customerId=${encodeURIComponent(projectCustomerId)}`
      : "/api/products";
    fetch(url).then((r) => (r.ok ? r.json() : [])).then((d) => setAllProducts(d || [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectCustomerId]);

  const updateProject = async (patch) => {
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) { const updated = await res.json(); setData((d) => ({ ...d, ...updated })); }
    return res.ok;
  };

  const createTaxRegistrationFromProject = async () => {
    if (!p?.id) return;
    setCreatingTaxReg(true);
    try {
      const res = await fetch("/api/excise-registrations/from-project", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: p.id }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ kind: "error", msg: payload.error || "สร้างทะเบียนภาษีจากโปรเจกต์ไม่สำเร็จ" });
        return;
      }
      setToast({ kind: "success", msg: `สร้างทะเบียนภาษี ${payload.fgCode || ""} แล้ว` });
      router.push(`/tax/registrations/${payload.id}`);
    } finally {
      setCreatingTaxReg(false);
    }
  };

  const createShipmentPrepFromProject = async () => {
    if (!p?.id) return;
    setCreatingShipmentPrep(true);
    try {
      const res = await fetch(`/api/pm/projects/${p.id}/shipment-prep`, { method: "POST" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setToast({ kind: "error", msg: payload.error || "สร้างเอกสารเตรียมส่งของไม่สำเร็จ" });
        return;
      }
      setToast({ kind: payload.reused ? "info" : "success", msg: payload.reused ? "เปิดเอกสารเตรียมส่งของเดิม" : "สร้างเอกสารเตรียมส่งของแล้ว" });
      router.push(`/sa/projects/${p.code || p.id}/shipment-prep`);
    } finally {
      setCreatingShipmentPrep(false);
    }
  };

  // ── เฟส 1: แก้ task แบบ "ค้างก่อน-ยืนยันรวด" (ลด error จากการกดพลาด) ───────
  // inline edit (สถานะ/ทำเสร็จ/predecessors) ไม่ยิงทันที แต่ค้างใน dirty + โชว์ค่าใหม่
  // ทุกวิว (optimistic). ผู้ใช้กด "ยืนยันการเปลี่ยนแปลง" ครั้งเดียวจึงบันทึกจริง.
  const stageTaskEdit = (taskId, patch) => {
    setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) }));
    setDirty((dd) => ({ ...dd, [taskId]: { ...dd[taskId], ...patch } }));
  };
  // วิว Document/Timeline ส่ง patch บางส่วน (เช่น {startDate} ตอนลากบาร์/แก้ช่องวัน). ถ้า stage
  // ตรง ๆ finishDate จะค้างค่าเก่า → บาร์ "ยุบเหลือวันเดียว" เพราะ baseFinishIdx = max(finish, start)
  // เมื่อวันเริ่มใหม่เลยวันจบเดิม. เติมฟิลด์คู่กันด้วยเอนจินวันทำการเดียวกับ syncSchedule/server ก่อน
  // stage → บาร์ optimistic ตรงกับผลจริงหลังกดยืนยัน (กันอาการ "วันเด้งกลายเป็นวันเดียวกัน").
  const stageScheduleEdit = (taskId, patch) => {
    const cur = (data?.tasks || []).find((t) => t.id === taskId) || {};
    const next = { ...patch };
    if ("finishDate" in patch) {
      // แก้/ลากวันจบ → คำนวณ duration จาก (วันเริ่ม → วันจบ) แล้ว snap วันจบเป็นวันทำการ
      const start = "startDate" in patch ? patch.startDate : cur.startDate;
      const dur = durationFromDates(start, patch.finishDate);
      next.durationDays = dur;
      const fin = computeFinish(start, dur);
      if (fin) next.finishDate = toLocalISODate(fin);
    } else if ("startDate" in patch || "durationDays" in patch) {
      // แก้วันเริ่ม/ระยะเวลา → คงอีกค่า แล้วคำนวณวันจบใหม่
      const start = "startDate" in patch ? patch.startDate : cur.startDate;
      const dur = "durationDays" in patch ? (Number(patch.durationDays) || 1) : (cur.durationDays || 1);
      const fin = start ? computeFinish(start, dur) : null;
      if (fin) next.finishDate = toLocalISODate(fin);
    }
    stageTaskEdit(taskId, next);
  };
  const cancelEdits = async () => { setDirty({}); await load(); };
  const confirmEdits = async () => {
    const entries = Object.entries(dirty);
    if (!entries.length) return;
    let clamped = 0; // จำนวนขั้นที่ "ปักวันเริ่มไม่ติด" (server เลื่อนไปวันอื่น)
    const failed = {}; // taskId → patch ที่บันทึกไม่สำเร็จ (คงไว้ให้ผู้ใช้ลองใหม่)
    for (const [taskId, patch] of entries) {
      let res;
      try {
        res = await fetch(`/api/pm/project-tasks/${taskId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
        });
      } catch { failed[taskId] = patch; continue; } // network error → ถือว่าไม่สำเร็จ
      if (!res.ok) { failed[taskId] = patch; continue; } // 403/409/500 → อย่ากลืนเงียบ
      // เตือนเมื่อปักวันเริ่มไม่ได้ตามที่เลือก: ขอ startDate มา แต่ server บันทึกเป็นวันอื่น
      // (เร็วกว่างานก่อนหน้า/วันเริ่มโปรเจกต์ไม่ได้ หรือไม่ใช่วันทำการ → เลื่อนไปวันที่ทำได้)
      if (patch.startDate) {
        const saved = await res.json().catch(() => null);
        if (saved?.startDate && saved.startDate !== patch.startDate) clamped++;
      }
    }
    const failedCount = Object.keys(failed).length;
    // บันทึก = persist การแก้ลง live เท่านั้น — ไม่ถ่าย snapshot จุดย้อนอีกต่อไป.
    // จุดย้อน (restore point) มีแค่ "ออก Rev" เท่านั้น (โมเดลใหม่: ย้อนได้เฉพาะ Rev)
    // เพื่อตัดความสับสนจากจุด save ที่ถ่ายตอนหลังแก้.
    setDirty(failed); // คงเฉพาะอันที่ยังไม่สำเร็จ — อันที่สำเร็จเคลียร์ออก
    await load(); // resync (server คำนวณ timeline/สถานะใหม่; รวมที่บันทึกสำเร็จแล้ว)
    if (failedCount) {
      // load() เพิ่งทับ data.tasks ด้วยค่า server → ทาค่าที่ผู้ใช้แก้ค้าง (ที่ยัง fail) กลับ
      // เพื่อให้จอตรงกับแถบ "ยืนยันการเปลี่ยนแปลง" ที่ยังค้างอยู่ (ไม่หายเงียบ)
      setData((d) => ({ ...d, tasks: (d.tasks || []).map((t) => (failed[t.id] ? { ...t, ...failed[t.id] } : t)) }));
      setToast({ kind: "error", msg: `บันทึกไม่สำเร็จ ${failedCount} ขั้น (สิทธิ์ไม่พอ/ข้อมูลชนกัน/เครือข่าย) — การแก้ที่ค้างยังอยู่ ลองกดยืนยันอีกครั้ง` });
    } else if (clamped) {
      setToast({ kind: "info", msg: `ปักวันเริ่มไม่ได้ตามที่เลือก ${clamped} ขั้น — วันเริ่มต้องไม่เร็วกว่างานก่อนหน้า/วันเริ่มโปรเจกต์ และต้องเป็นวันทำการ (ระบบเลื่อนไปวันที่ใกล้สุดที่ทำได้). โปรเจกต์ย้อนหลังให้ตั้ง “วันเริ่มโปรเจกต์” ก่อน` });
    }
  };
  const dirtyCount = Object.keys(dirty).length;

  // ── เฟส 2: ออก Revise (freeze เอกสารทั้งชุดเป็นเวอร์ชัน) ──────────────────
  // การแก้ task = บันทึกทับ live ไม่เก็บประวัติ; "ออก Revise" คือการกระทำระดับ
  // เอกสารที่ตั้งใจ → snapshot ทุก task + เด้งเลข Rev (เริ่มที่ 0) ที่โชว์บนหน้าพิมพ์.
  // เปิด modal ออกเวอร์ชัน — กันออกเมื่อยังมีการแก้ค้าง (แจ้งด้วย toast แทน alert เนทีฟ)
  const openIssueRev = () => {
    if (dirtyCount > 0) { setToast({ kind: "error", msg: "ยังมีการแก้ไขที่ยังไม่บันทึก — กรุณายืนยันหรือยกเลิกก่อนออกเวอร์ชัน" }); return; }
    setRevNote(""); setRevError(""); setShowIssueRev(true);
  };
  const confirmIssueRev = async () => {
    setIssuingRev(true); setRevError("");
    try {
      const res = await fetch(`/api/pm/projects/${id}/revisions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ note: revNote }),
      });
      if (!res.ok) { setRevError((await res.json().catch(() => ({}))).error || "ออกเวอร์ชันไม่สำเร็จ"); return; }
      const rev = await res.json();
      // เด้งเลข Rev + วันที่ออก (revisedAt) ทันที — หัวเอกสารพิมพ์ใช้ revDate=p.revisedAt
      // ถ้าไม่อัปเดต วันที่จะว่างจนกว่าจะ reload ทั้งหน้า
      setData((d) => ({ ...d, currentRev: rev.currentRev, maxRev: rev.currentRev, revisedAt: rev.createdAt ?? d?.revisedAt ?? null, revStale: false }));
      setShowIssueRev(false);
      refreshRevisions(); // ให้ประวัติที่อาจเปิดค้างอยู่เห็น Rev ใหม่
      setToast({ kind: "success", msg: `ออกเวอร์ชันแล้ว — Rev. ${rev.currentRev}` });
    } finally { setIssuingRev(false); }
  };
  // ดึงประวัติเวอร์ชันใหม่ (ใช้ซ้ำหลัง ออก Rev / ย้อน / บันทึก เพื่อไม่ให้ลิสต์ค้างเก่า)
  const refreshRevisions = async () => {
    const res = await fetch(`/api/pm/projects/${id}/revisions`);
    if (res.ok) { const d = await res.json(); setRevisions(d.revisions || []); }
  };
  const openRevisions = async () => {
    setShowRevisions(true);
    await refreshRevisions();
  };
  // พิมพ์เวอร์ชันเก่า: ดึง snapshot แล้วส่งเข้า print เหมือนเอกสารปัจจุบัน
  const printRevision = async (revNo) => {
    const res = await fetch(`/api/pm/projects/${id}/revisions/${revNo}`);
    if (!res.ok) { setToast({ kind: "error", msg: "ดึงเวอร์ชันไม่สำเร็จ" }); return; }
    const revRow = await res.json();
    const snapshot = revRow?.snapshot;
    const proj = snapshot?.project || {};
    const fallback = proj.productMainCategory ? `${mainCatName(proj.productMainCategory)}${proj.productSubCategory ? ` / ${proj.productSubCategory}` : ""}` : "";
    openGanttPrintWindow({
      ...proj,
      tasks: snapshot?.tasks || [],
      projectProducts: enrichProducts(snapshot?.projectProducts || []),
      categoryFallback: fallback,
      ...resolveAe(proj.aeOwner),
      rev: revNo,
      revDate: revRow?.createdAt || null, // วันที่ออก Rev นี้ → โชว์ DD/MM/YY ในหัวเอกสาร
    });
  };

  // ยืนยันแบบ promise — แทน window.confirm() ด้วย ConfirmModal ที่เข้าธีม.
  // ใช้: if (!(await askConfirm({ title, message }))) return;
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const resolveConfirm = (result) => { setConfirmState((s) => { s?.resolve(result); return null; }); };

  // ย้อนงานทั้งชุดกลับไปเท่ากับจุดที่เลือก (เซฟใหญ่หรือ Rev). กันย้อนเมื่อยังมีของค้าง.
  const restoreSnapshot = async (row) => {
    if (dirtyCount > 0) { setToast({ kind: "error", msg: "ยังมีการแก้ไขที่ยังไม่บันทึก — กรุณายืนยันหรือยกเลิกก่อนย้อนเวอร์ชัน" }); return; }
    const label = row.kind === "rev" ? `Rev. ${row.revNo}` : `บันทึกเมื่อ ${fmtDateTime(row.createdAt)}`;
    if (!(await askConfirm({ title: "ย้อนกลับไปจุดนี้?", message: `งานทั้งหมดจะกลับไปเท่ากับ "${label}" (สร้าง/ลบ/แก้ขั้นตอนให้ตรง). จุดบันทึก/Rev อื่นยังอยู่ครบ ย้อนไปจุดอื่นได้อีก.` }))) return;
    const res = await fetch(`/api/pm/projects/${id}/restore`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ snapshotId: row.id }),
    });
    if (!res.ok) { setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "ย้อนเวอร์ชันไม่สำเร็จ" }); return; }
    const r = await res.json().catch(() => ({}));
    setShowRevisions(false); // ปิดโมดัลประวัติหลังย้อนสำเร็จ
    await load();            // refresh หน้า (ดึง task + currentRev/revStale ใหม่)
    const changed = (r.recreated || 0) + (r.overwritten || 0) + (r.deleted || 0);
    setToast(changed
      ? { kind: "success", msg: `ย้อนกลับไป ${label} แล้ว — เขียนทับ ${r.overwritten || 0}, สร้างคืน ${r.recreated || 0}, ลบ ${r.deleted || 0} ขั้น` }
      : { kind: "info", msg: `${label} เหมือนสถานะปัจจุบันอยู่แล้ว — ไม่มีอะไรเปลี่ยน` });
  };

  // บั๊ก B: ผูก/ถอด FG จากหน้านี้ต้องขับหมวด ("FG เป็นใหญ่", 01-002 ชนะ) เหมือนในโมดัล
  // เพื่อให้ resync ขั้นตอนสรรพสามิตฝั่ง server ทำงาน — ไม่งั้นเพิ่ม FG 01-002 แล้วเงียบ
  const deriveCategoryFromProducts = (productIds) => {
    const fgs = productIds.map((pid) => allProducts.find((pr) => pr.id === pid)).filter(Boolean);
    if (!fgs.length) return null; // ไม่เหลือ FG → ไม่แตะหมวด
    const code = fgs.some((f) => f.categoryCode === "01-002") ? "01-002" : (fgs[0].categoryCode || "");
    const [mc = "", tc = ""] = code ? code.split("-") : [];
    const sub = categories.find((c) => c.mainCategoryCode === mc && c.typeCode === tc)?.nameTh || "";
    return { productMainCategory: code, productSubCategory: sub };
  };
  // ยืนยันก่อน resync ถ้าหมวดที่ derive พลิกสถานะสรรพสามิต (01-002)
  const confirmExciseFlip = (cat) => {
    if (!cat) return true;
    const was = (data.productMainCategory || "") === "01-002";
    const now = (cat.productMainCategory || "") === "01-002";
    if (was === now) return true;
    return askConfirm({
      title: "ยืนยันการปรับขั้นตอนสรรพสามิต",
      message: now
        ? "สินค้าที่ผูกเข้าข่ายสรรพสามิต (01-002) — ระบบจะเพิ่มขั้นตอนสรรพสามิตและคำนวณกำหนดการใหม่ ดำเนินการต่อหรือไม่?"
        : "สินค้าที่ผูกไม่เข้าข่ายสรรพสามิตแล้ว — ระบบจะลบขั้นตอนสรรพสามิตและคำนวณกำหนดการใหม่ ดำเนินการต่อหรือไม่?",
      confirmLabel: "ดำเนินการต่อ",
      danger: false,
    });
  };

  const addProduct = async () => {
    if (!addingProduct) return;
    const newProducts = [...(data.projectProducts || []).map(p => ({ productId: p.productId, orderQty: p.orderQty, productionQty: p.productionQty })), { productId: addingProduct, orderQty: "", productionQty: "" }];
    const cat = deriveCategoryFromProducts(newProducts.map((p) => p.productId));
    if (!(await confirmExciseFlip(cat))) return;
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectProducts: newProducts, ...(cat || {}) }),
    });
    if (res.ok) { setAddingProduct(""); load(); }
    else setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "ผูกสินค้าไม่สำเร็จ" });
  };

  const removeProduct = async (productId) => {
    const newProducts = (data.projectProducts || []).filter(p => p.productId !== productId).map(p => ({ productId: p.productId, orderQty: p.orderQty, productionQty: p.productionQty }));
    const cat = deriveCategoryFromProducts(newProducts.map((p) => p.productId));
    if (!(await confirmExciseFlip(cat))) return;
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectProducts: newProducts, ...(cat || {}) }),
    });
    if (res.ok) load();
  };

  const updateProductQty = async (productId, field, value) => {
    const newProducts = (data.projectProducts || []).map(p => ({
      productId: p.productId,
      orderQty: p.productId === productId && field === 'orderQty' ? value : p.orderQty,
      productionQty: p.productId === productId && field === 'productionQty' ? value : p.productionQty,
    }));
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectProducts: newProducts }),
    });
    if (res.ok) load();
  };

  const openDrop = () => { setDropReason(""); setShowDrop(true); };
  const confirmDrop = async () => {
    const reason = dropReason.trim();
    if (!reason) { setToast({ kind: "error", msg: "กรุณาระบุเหตุผลที่ยกเลิก" }); return; }
    setShowDrop(false);
    await updateProject({ status: "Dropped", metadata: { ...(data.metadata || {}), lossReason: reason } });
  };

  const handleDeleteProject = async () => {
    if (!data) return;
    if (!(await askConfirm({ title: "ลบโปรเจกต์", message: `ต้องการลบโปรเจกต์ "${data.code} — ${data.name}" และขั้นตอนทั้งหมดใช่หรือไม่?`, confirmLabel: "ลบ" }))) return;
    const res = await fetch(`/api/pm/projects/${data.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/sa/deals");
    } else {
      setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ" });
    }
  };

  const addTask = async (e) => {
    e.preventDefault();
    // บั๊ก C: หาตำแหน่งแทรก — ถ้ากดปุ่ม "แทรก" ใช้ task นั้น; ไม่งั้นถ้าเลือกเฟส
    // ที่มีอยู่แล้ว ให้ไปต่อท้ายเฟสนั้น (กันหัวข้อเฟสซ้ำจากการจัดกลุ่มแบบติดกัน)
    let afterTaskId = insertAfterId;
    if (!afterTaskId && !insertBeforeId && taskForm.phase) {
      const samePhase = tasks.filter((t) => t.phase === taskForm.phase);
      if (samePhase.length) afterTaskId = samePhase[samePhase.length - 1].id;
    }
    const res = await fetch("/api/pm/project-tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // URL may be a project code; tasks FK the internal id, so use the loaded row's id.
        projectId: data?.id ?? id,
        ...taskForm,
        afterTaskId: afterTaskId || undefined,
        beforeTaskId: insertBeforeId || undefined,
        durationDays: Number(taskForm.durationDays) || 1,
        startDate: taskForm.startDate || null,
        assignee: taskForm.assignee || null
      }),
    });
    if (res.ok) {
      setShowAddTask(false);
      setInsertAfterId(null);
      setInsertBeforeId(null);
      setTaskForm({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: [], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false, assigneeId: "" });
      load();
    } else setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "เพิ่มขั้นตอนไม่สำเร็จ" });
  };

  const deleteTask = async (taskId, name) => {
    if (!(await askConfirm({ title: "ลบขั้นตอน", message: `ต้องการลบขั้นตอน "${name}" ใช่หรือไม่?`, confirmLabel: "ลบ" }))) return;
    const res = await fetch(`/api/pm/project-tasks/${taskId}`, { method: "DELETE" });
    // server ตัด predecessor ที่อ้างขั้นนี้ + เดินสถานะกราฟใหม่ → reload เห็นผลครบ
    if (res.ok) await load();
  };

  const togglePhase = (phase) => setCollapsedPhases((prev) => {
    const next = new Set(prev);
    next.has(phase) ? next.delete(phase) : next.add(phase);
    return next;
  });

  // แก้ วันเริ่ม/วันสิ้นสุด/ระยะเวลา ในฟอร์ม → ซิงค์สองทาง (เอนจินวันทำการเดียวกับ server)
  //   แก้วันสิ้นสุด → คำนวณระยะเวลา แล้ว snap วันสิ้นสุดกลับเป็นวันทำการให้ตรงกับที่ server จะบันทึก
  //   แก้วันเริ่ม/ระยะเวลา → คำนวณวันสิ้นสุดใหม่
  const syncSchedule = (changes) =>
    setEditForm((f) => {
      const next = { ...f, ...changes };
      if ("finishDate" in changes) {
        const dur = durationFromDates(next.startDate, next.finishDate);
        next.durationDays = dur;
        const fin = computeFinish(next.startDate, dur);
        next.finishDate = fin ? toLocalISODate(fin) : next.finishDate;
      } else {
        const fin = computeFinish(next.startDate, next.durationDays);
        next.finishDate = fin ? toLocalISODate(fin) : "";
      }
      return next;
    });

  // ฟิลด์แก้ไขขั้นตอน — ใช้ร่วมกันทั้ง inline-edit (List view) และ modal (Table view)
  // ทั้งสองทางใช้ editForm/setEditForm/syncSchedule ชุดเดียวกัน ต่างแค่ selfId + footer
  const renderStepEditFields = (selfId) => (
    <>
      <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
        <input className="premium-input" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} placeholder="ชื่อขั้นตอน" style={{ flex: 1 }} />
        <Select value={editForm.role} onChange={(e) => setEditForm({ ...editForm, role: e.target.value, assigneeId: e.target.value === "SA" ? editForm.assigneeId : "" })} style={{ width: "100px" }}>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </Select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <label style={{ fontSize: "12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>ผู้รับผิดชอบ:</label>
        <AssigneeField form={editForm} setForm={setEditForm} users={users} />
      </div>
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>วันที่เริ่ม:</label>
          <input type="date" className="premium-input" value={editForm.startDate || ""} onChange={(e) => syncSchedule({ startDate: e.target.value })} style={{ width: "150px" }} title="วันเริ่มของขั้นตอนนี้" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>วันเสร็จ:</label>
          <input type="date" className="premium-input" value={editForm.finishDate || ""} min={editForm.startDate || undefined} onChange={(e) => syncSchedule({ finishDate: e.target.value })} style={{ width: "150px" }} title="วันสิ้นสุด (ปรับแล้วระยะเวลาจะคำนวณให้อัตโนมัติ)" />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
          <label style={{ fontSize: "12px", color: "var(--text-2)", whiteSpace: "nowrap" }}>ระยะเวลา (วัน):</label>
          <input type="number" min="1" className="premium-input" value={editForm.durationDays} onChange={(e) => syncSchedule({ durationDays: e.target.value })} style={{ width: "64px" }} title="จำนวนวันทำการ (ปรับแล้ววันเสร็จจะคำนวณให้อัตโนมัติ)" />
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={editForm.isMilestone || false} onChange={(e) => setEditForm({ ...editForm, isMilestone: e.target.checked })} style={{ accentColor: "var(--amber)", cursor: "pointer" }} />
          ตั้งเป็น Milestone
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        <label style={{ fontSize: "12px", color: "var(--text)", fontWeight: 600 }}>หมายเหตุ</label>
        <textarea className="premium-input" value={editForm.note || ""} onChange={(e) => setEditForm({ ...editForm, note: e.target.value })} placeholder="หมายเหตุของขั้นตอนนี้ (ถ้ามี)" rows={2} style={{ width: "100%", resize: "vertical", padding: "6px 10px", fontSize: "13px" }} />
        <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "var(--text-2)", cursor: "pointer" }}>
          <input type="checkbox" checked={editForm.showNoteInPrint || false} onChange={(e) => setEditForm({ ...editForm, showNoteInPrint: e.target.checked })} style={{ accentColor: "var(--accent)", cursor: "pointer" }} />
          แสดงหมายเหตุนี้ตอนพิมพ์เอกสาร
        </label>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
        <label style={{ fontSize: "12px", color: "var(--text)", fontWeight: 600 }}>งานที่ต้องรอให้เสร็จก่อน (Predecessors):</label>
        <PredecessorPicker tasks={processedTasks} selfId={selfId} value={editForm.predecessors} onChange={(predecessors) => setEditForm((f) => ({ ...f, predecessors }))} />
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-3)", display: "flex", alignItems: "center", gap: "4px" }}>
        <Calendar size={11} /> ระบบคำนวณวันเสร็จจากวันเริ่ม + จำนวนวันทำการ
      </div>
    </>
  );

  // เลื่อนลำดับขั้น (ขึ้น/ลง) ภายในเฟสเดียวกัน — cosmetic (stepOrder) ไม่กระทบ timeline
  // (timeline ขับด้วย predecessor graph) จึงสลับลำดับแสดงผลได้ปลอดภัย
  const moveTask = async (task, dir) => {
    const ordered = [...processedTasks];
    const i = ordered.findIndex((t) => t.id === task.id);
    const j = dir === 'up' ? i - 1 : i + 1;
    if (j < 0 || j >= ordered.length || ordered[j].phase !== task.phase) return; // ไม่ข้ามเฟส
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    const res = await fetch('/api/pm/project-tasks/reorder', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: data.id, orderedIds: ordered.map((t) => t.id) }),
    });
    if (res.ok) load();
  };

  // ปุ่ม ▲▼ เลื่อนลำดับ — วางหน้า task ใช้ร่วมทุกวิว (List/Table/เอกสาร). disable ที่ขอบเฟส
  const moveButtons = (task) => {
    if (!canEdit) return null;
    const i = processedTasks.findIndex((t) => t.id === task.id);
    const canUp = i > 0 && processedTasks[i - 1].phase === task.phase;
    const canDown = i >= 0 && i < processedTasks.length - 1 && processedTasks[i + 1].phase === task.phase;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "2px", flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
        <button className="btn-icon" style={{ width: "22px", height: "18px" }} disabled={!canUp} onClick={() => moveTask(task, "up")} aria-label="เลื่อนขึ้น" title="เลื่อนขึ้น (ในเฟสเดียวกัน)"><ChevronUp size={14} /></button>
        <button className="btn-icon" style={{ width: "22px", height: "18px" }} disabled={!canDown} onClick={() => moveTask(task, "down")} aria-label="เลื่อนลง" title="เลื่อนลง (ในเฟสเดียวกัน)"><ChevronDown size={14} /></button>
      </div>
    );
  };

  // เหมือน syncSchedule แต่สำหรับฟอร์ม "เพิ่มขั้นตอน" (taskForm) — วันเริ่มเว้นว่างได้
  const syncTaskSchedule = (changes) =>
    setTaskForm((f) => {
      const next = { ...f, ...changes };
      if ("finishDate" in changes) {
        if (next.startDate && next.finishDate) {
          const dur = durationFromDates(next.startDate, next.finishDate);
          next.durationDays = dur;
          const fin = computeFinish(next.startDate, dur);
          next.finishDate = fin ? toLocalISODate(fin) : next.finishDate;
        }
      } else {
        next.finishDate = next.startDate ? toLocalISODate(computeFinish(next.startDate, next.durationDays)) : "";
      }
      return next;
    });

  const startEditing = (task) => {
    setEditingTaskId(task.id);
    setEditForm({
      name: task.name, role: task.role || "SA", assignee: task.assignee || "",
      assigneeId: task.assigneeId || "",
      durationDays: task.durationDays ?? 1, startDate: task.startDate || "",
      finishDate: task.finishDate || "",
      dueDate: task.dueDate || "",
      isMilestone: !!task.isMilestone, phase: task.phase || "",
      predecessors: task.predecessors || [],
      note: task.note || "", showNoteInPrint: !!task.showNoteInPrint,
    });
  };
  // patch จากฟอร์มแก้ขั้นตอน (ใช้ร่วม inline-edit ของ List + modal ของ Table)
  const stepPatchFromForm = () => ({
    name: editForm.name, role: editForm.role, assignee: editForm.assignee || null,
    assigneeId: editForm.assigneeId || null,
    durationDays: Number(editForm.durationDays) || 1,
    startDate: editForm.startDate || null,
    dueDate: editForm.dueDate || null,
    isMilestone: editForm.isMilestone, phase: editForm.phase || null,
    predecessors: editForm.predecessors || [],
    note: editForm.note || "", showNoteInPrint: !!editForm.showNoteInPrint,
  });
  // เฟส 1: แก้ผ่านฟอร์ม = "ค้างไว้" เหมือนทุกวิว (ไม่เซฟทันที). ผ่าน stageScheduleEdit เพื่อให้
  // วันจบ optimistic ตรงกับ server แล้วปิดฟอร์ม — บันทึกจริงเมื่อกด "ยืนยันการเปลี่ยนแปลง" ที่แถบล่าง
  const saveEditing = (taskId) => {
    stageScheduleEdit(taskId, stepPatchFromForm());
    setEditingTaskId(null); setEditForm(null);
  };

  // เปิดแก้ไขขั้นตอนแบบ modal (จาก Table view) — ไม่สลับไป List view
  const openEditModal = (task) => {
    setEditForm({
      name: task.name, role: task.role || "SA", assignee: task.assignee || "",
      assigneeId: task.assigneeId || "",
      durationDays: task.durationDays ?? 1, startDate: task.startDate || "",
      finishDate: task.finishDate || "",
      dueDate: task.dueDate || "",
      isMilestone: !!task.isMilestone, phase: task.phase || "",
      predecessors: task.predecessors || [],
      note: task.note || "", showNoteInPrint: !!task.showNoteInPrint,
    });
    setEditTask(task);
    setShowEditTask(true);
  };
  const closeEditModal = () => { setShowEditTask(false); setEditTask(null); setEditForm(null); };
  const saveEditModal = () => {
    if (!editTask) return;
    stageScheduleEdit(editTask.id, stepPatchFromForm());
    closeEditModal();
  };

  const handleToggleTask = (task) => {
    if (task.status === "Pending") return;
    stageTaskEdit(task.id, { status: task.status === "Completed" ? "In Progress" : "Completed" });
  };

  const tasks = data?.tasks || [];
  const phaseColorMap = useMemo(() => {
    const seen = [];
    tasks.forEach((t) => { if (t.phase && !seen.includes(t.phase)) seen.push(t.phase); });
    const m = {};
    seen.forEach((p, i) => { m[p] = PHASE_COLORS[i % PHASE_COLORS.length]; });
    return m;
  }, [tasks]);

  const processedTasks = useMemo(() => {
    let currentPhase = null;
    let phaseNum = 0;
    let taskInPhase = 0;
    
    return tasks.map(task => {
      const p = task.phase || "—";
      if (p !== currentPhase) {
        currentPhase = p;
        phaseNum++;
        taskInPhase = 1;
      } else {
        taskInPhase++;
      }
      return {
        ...task,
        phaseNum,
        taskInPhase,
        displayNumber: `${phaseNum}.${taskInPhase}`
      };
    });
  }, [tasks]);

  // id → เลขลำดับ (สำหรับชิป predecessor ในตาราง)
  const taskNumById = useMemo(
    () => Object.fromEntries(processedTasks.map((t) => [t.id, t.displayNumber])),
    [processedTasks],
  );

  // Table view: filter -> group by phase -> sort within group. Must stay above
  // the early returns below to keep hook order stable.
  const tableGroups = useMemo(() => {
    const orderIndex = new Map(processedTasks.map((t, i) => [t.id, i]));
    const STATUS_ORDER = { "In Progress": 0, Pending: 1, Completed: 2 };
    const comparator =
      tableSort === "name" ? (a, b) => (a.name || "").localeCompare(b.name || "", "th")
      : tableSort === "status" ? (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)
      : tableSort === "due" ? (a, b) => {
          const da = a.finishDate ? new Date(a.finishDate).getTime() : Infinity;
          const db = b.finishDate ? new Date(b.finishDate).getTime() : Infinity;
          return da - db;
        }
      : (a, b) => (orderIndex.get(a.id) ?? 0) - (orderIndex.get(b.id) ?? 0); // step (default)

    const matchStatus = (t) =>
      tableStatusFilter === "all" ? true
      : tableStatusFilter === "pending" ? t.status === "Pending"
      : tableStatusFilter === "progress" ? t.status === "In Progress"
      : t.status === "Completed";

    const groups = [];
    const byKey = new Map();
    processedTasks.filter(matchStatus).forEach((t) => {
      const key = t.phase || "__nophase__";
      if (!byKey.has(key)) {
        const g = { key, phase: t.phase || null, num: t.phaseNum || null, tasks: [] };
        byKey.set(key, g);
        groups.push(g);
      }
      byKey.get(key).tasks.push(t);
    });
    groups.forEach((g) => {
      g.tasks.sort(comparator);
      g.done = g.tasks.filter((t) => t.status === "Completed").length;
    });
    return groups;
  }, [processedTasks, tableStatusFilter, tableSort]);

  if (loading) return <SkeletonRows />;
  if (!data) return <EmptyState icon={FolderX}>ไม่พบโครงการ</EmptyState>;

  const p = data;
  const hasWriteAccess = hasEditCap && !!data.canEdit;
  const isLocked = p.status === "On Hold" || p.status === "Dropped" || p.status === "Completed";
  const canEdit = hasWriteAccess && !isLocked;
  const linkedIds = new Set((p.projectProducts || []).map((x) => x.productId));
  // แนะนำสร้างทะเบียนภาษีเฉพาะเมื่อ (1) ดีลที่ผูก won แล้ว (โปรเจกต์ที่ไม่ได้มาจากดีล
  // ถือว่าผ่าน) และ (2) มี FG หมวดสรรพสามิต 01-002 อย่างน้อยหนึ่งตัว — ไม่งั้นไม่ต้องมี
  // ทะเบียนภาษี.
  const dealWon = !p.dealId || ["won", "in_project"].includes(p.dealStage);
  const hasExciseFg = (p.projectProducts || []).some((x) => (x.product?.categoryCode || "") === "01-002");
  const recommendTaxReg = dealWon && hasExciseFg;
  const formPhases = [...new Set(processedTasks.map((t) => t.phase).filter(Boolean))];

  const total = processedTasks.length;
  const done = processedTasks.filter((t) => t.status === "Completed").length;
  const inProg = processedTasks.filter((t) => t.status === "In Progress").length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdue = processedTasks.filter((t) => t.status !== "Completed" && t.finishDate && new Date(t.finishDate) < today).length;
  const isDone = pct === 100;
  const accent = isDone ? "var(--green)" : "var(--accent)";
  const milestones = processedTasks.filter((t) => t.isMilestone);

  const renderChip = (Icon, label, color) => (
    <span className="chip" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)`, borderColor: `color-mix(in srgb, ${color} 25%, transparent)` }}>
      <Icon size={13} /> {label}
    </span>
  );


  const mainCatName = (mc) => categories.find((o) => o.mainCategoryCode === (mc || "").split("-")[0])?.mainCategoryName || mc;
  // ยังไม่ผูก FG → ชื่อหมวด/หมวดรอง (resolve ชื่อหมวดหลักจากโค้ด) ใช้เป็น fallback บนหน้าพิมพ์
  const categoryFallback = p.productMainCategory ? `${mainCatName(p.productMainCategory)}${p.productSubCategory ? ` / ${p.productSubCategory}` : ""}` : "";

  // ── เติมข้อมูลให้เอกสาร ISO (CR §3) ──────────────────────────────────
  // เบอร์มือถือ + อีเมลของ AE ผู้ดูแล: aeOwner เก็บเป็น "ชื่อเต็ม" → จับคู่กับรายชื่อ
  // ผู้ใช้ (assignable-users) เพื่อดึง phone/email จากข้อมูลผู้ใช้ (ไม่ใช่ของลูกค้า).
  const resolveAe = (aeName) => {
    const u = users.find((x) => x.name === aeName);
    return { aeMobile: u?.phone || "", aeEmail: u?.email || "" };
  };
  // หมวดหลัก / หมวดรอง ของ FG หนึ่งๆ → "ODM / Shower Gel" (lookup จาก categoryCode).
  const catLabelFor = (productId) => {
    const pr = allProducts.find((x) => x.id === productId);
    const code = pr?.categoryCode || "";
    if (!code) return "";
    const [mc = "", tc = ""] = code.split("-");
    const main = categories.find((c) => c.mainCategoryCode === mc)?.mainCategoryName || mc;
    const sub = categories.find((c) => c.mainCategoryCode === mc && c.typeCode === tc)?.nameTh || "";
    return sub ? `${main} / ${sub}` : main;
  };
  const enrichProducts = (list) => (list || []).map((pp) => ({ ...pp, categoryLabel: catLabelFor(pp.productId) }));
  // เลข Rev ถัดไป (รันอัตโนมัติ): ครั้งแรก = 0, จากนั้น +1 — ใช้โชว์บนปุ่ม "ออก Rev. N"
  // เลข Rev ถัดไป = สูงสุดที่เคยออก + 1 (ไม่อิง currentRev — เพราะ currentRev เป็น "ตัวชี้
  // ว่าอยู่ที่ Rev ไหน" ซึ่งย้อนถอยได้; ออก Rev ใหม่ต้องไม่ชนเลขที่เคยใช้)
  const nextRev = p.maxRev == null ? 0 : p.maxRev + 1;

  const fgUI = (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
      {(p.projectProducts || []).length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          {(p.projectProducts || []).map((pp) => {
            const actualProd = pp.product || {};
            return (
              <div key={pp.productId} style={{ display: "flex", flexDirection: "column", gap: "8px", background: "var(--panel-2)", border: "1px solid var(--border)", padding: "10px 12px", borderRadius: "8px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                    <span className="font-mono text-[13px] font-semibold">{actualProd.fgCode}</span>
                    <span style={{ fontSize: "11px", color: "var(--text-3)" }}>{actualProd.volume ? `(${actualProd.volume} ml)` : ""}</span>
                    <span style={{ fontSize: "11px", background: "var(--blue-soft)", color: "var(--blue)", padding: "2px 6px", borderRadius: "4px", whiteSpace: "nowrap" }}>
                      {mainCatName(actualProd.productMainCategory) || "ไม่มีหมวด"}
                    </span>
                  </div>
                  {canEdit && <button className="btn-icon danger" onClick={() => removeProduct(pp.productId)} aria-label="นำสินค้าออก"><X size={16} /></button>}
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "12px", color: "var(--text-2)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1, minWidth: "150px" }}>
                    {actualProd.productDescriptionEn || actualProd.productDescription || actualProd.brandNameEn || actualProd.brandName || "-"}
                  </div>
                  <div style={{ display: "flex", gap: "8px", width: "220px", maxWidth: "100%", flexShrink: 0 }}>
                    <input type="text" placeholder="สั่งซื้อ" defaultValue={pp.orderQty || ""} disabled={!canEdit} onBlur={(e) => { if (e.target.value !== (pp.orderQty || "")) updateProductQty(pp.productId, "orderQty", e.target.value); }} className="premium-input w-full text-[12px] h-[30px]" />
                    <input type="text" placeholder="ผลิต" defaultValue={pp.productionQty || ""} disabled={!canEdit} onBlur={(e) => { if (e.target.value !== (pp.productionQty || "")) updateProductQty(pp.productId, "productionQty", e.target.value); }} className="premium-input w-full text-[12px] h-[30px]" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canEdit && (
        <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
          <SearchableSelect
            size="sm"
            options={allProducts.filter(pr => !linkedIds.has(pr.id)).map(pr => ({
              value: pr.id,
              label: `${pr.fgCode} — ${pr.productDescriptionEn || pr.productDescription || pr.brandNameEn || pr.brandName || ""}`,
              search: `${pr.fgCode || ""} ${pr.productDescription || ""} ${pr.productDescriptionEn || ""}`,
              render: <span><strong>{pr.fgCode}</strong> — {pr.productDescriptionEn || pr.productDescription || pr.brandNameEn || pr.brandName || ""}</span>,
            }))}
            value={addingProduct}
            onChange={setAddingProduct}
            placeholder="ค้นหา Product Code (FG)..."
          />
          <button onClick={addProduct} disabled={!addingProduct} className="btn btn-primary" style={{ padding: "4px 10px", fontSize: "12px", flexShrink: 0, height: "30px", opacity: addingProduct ? 1 : 0.5 }}><Plus size={14} /> เพิ่ม</button>
        </div>
      )}
    </div>
  );

  return (
    <div>
      {/* Top Header Section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
        <Link
          href="/sa/deals"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: "var(--text-2)",
            fontSize: "13px",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          <ArrowLeft size={16} /> กลับไปหน้ารวมโปรเจกต์
        </Link>
        
        {canEdit && (
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn-icon" onClick={() => setShowEditProject(true)} aria-label="แก้ไขโปรเจกต์" title="แก้ไขโปรเจกต์"><Edit2 size={16} /></button>
            {/* Sales เป็นแม่: โครงการที่ผูกงานขายต้องลบที่หน้าบริหารงานขาย (ลบทั้งสาย).
                โปรเจกต์กำพร้า (ยังไม่ผูกดีล) ลบตรงนี้ได้ตามเดิม. */}
            {data.dealId ? (
              <Link className="btn-icon" href={`/sa/deals/${data.dealId}`} aria-label="จัดการที่หน้าบริหารงานขาย" title="โครงการนี้ผูกงานขาย — ลบ/จัดการที่หน้าบริหารงานขาย"><ExternalLink size={16} /></Link>
            ) : (
              <button className="btn-icon danger" onClick={handleDeleteProject} aria-label="ลบโปรเจกต์" title="ลบโปรเจกต์"><Trash2 size={16} /></button>
            )}
          </div>
        )}
      </div>

      {/* Header (ss-cj Timeline header style) */}
      <div className="glass-panel" style={{ borderRadius: "16px", overflow: "hidden", marginBottom: "24px" }}>
        <div style={{ padding: "14px 24px", borderBottom: "1px solid var(--border)", background: "var(--panel-2)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "16px", flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ margin: 0, fontSize: "18px", display: "flex", alignItems: "center", gap: "10px", fontWeight: 600 }}>
                <span style={{ background: "var(--accent)", color: "#fff", padding: "7px", borderRadius: "9px", display: "flex" }}>
                  <GanttChart size={18} />
                </span>
                <span>Timeline Project: {p.code}</span>
              </h2>
              <p style={{ margin: "5px 0 0 40px", fontSize: "12.5px", color: "var(--text-2)" }}>
                {p.name} | ลูกค้า: {p.customerName || "-"} | AE: {p.aeOwner || "-"}
              </p>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap", marginLeft: "auto" }}>
              <ViewSwitcher value={view} onChange={setView} modes={["list", "table", "document"]} />
              <span
                className="ui-badge"
                title={p.currentRev == null
                  ? "ยังไม่ออกเวอร์ชัน (ฉบับร่าง)"
                  : (p.revStale
                    ? `แก้ไขหลังออก Rev. ${p.currentRev} — เนื้อหาปัจจุบันต่างจากเวอร์ชันทางการ กรุณาออก Rev ใหม่เพื่อยืนยัน`
                    : `เวอร์ชันเอกสารล่าสุด: Rev. ${p.currentRev}`)}
                style={{ whiteSpace: "nowrap", ...(p.currentRev != null && p.revStale ? { borderColor: "var(--warning, #c79a3a)", color: "var(--warning, #c79a3a)" } : {}) }}
              >
                {p.currentRev == null ? "ฉบับร่าง" : (p.revStale ? `Rev. ${p.currentRev} • แก้แล้ว` : `Rev. ${p.currentRev}`)}
              </span>
              {canEdit && (
                <button onClick={openIssueRev} disabled={issuingRev} className="btn" style={{ whiteSpace: "nowrap" }} title={`freeze เอกสารทั้งชุดเป็นเวอร์ชันใหม่ — เลขรันอัตโนมัติเป็น Rev. ${nextRev} (จะขึ้นบนหน้าพิมพ์)`}>
                  <GitCommit size={14} /> {issuingRev ? "กำลังออก…" : `ออก Rev. ${nextRev}`}
                </button>
              )}
              {canCreateTaxRegistration && recommendTaxReg && (
                <button
                  onClick={createTaxRegistrationFromProject}
                  disabled={creatingTaxReg || !(p.projectProducts || []).length}
                  className="btn"
                  style={{ whiteSpace: "nowrap" }}
                  title="สร้างทะเบียนภาษี draft จาก FG หมวดสรรพสามิต (01-002) ในโปรเจกต์นี้"
                >
                  <ShieldCheck size={14} /> {creatingTaxReg ? "กำลังสร้าง..." : "สร้างทะเบียนภาษี"}
                </button>
              )}

              <button onClick={openRevisions} className="btn" style={{ whiteSpace: "nowrap" }} title="ดู/พิมพ์เวอร์ชันเอกสารที่เคยออก">
                <History size={14} /> ประวัติเวอร์ชัน
              </button>
              <button
                onClick={() => openGanttPrintWindow({ ...p, categoryFallback,
                  ...resolveAe(p.aeOwner),
                  projectProducts: enrichProducts(p.projectProducts),
                  // ถ้า live ถูกแก้หลังออก Rev (revStale) อย่าปั๊มเลข Rev ทางการทับเนื้อหาที่ต่าง —
                  // พิมพ์เป็น "ฉบับร่าง" (ไม่มีเลข/วันที่ Rev). พิมพ์เวอร์ชันทางการแท้ใช้ปุ่มในประวัติ.
                  rev: p.revStale ? null : p.currentRev,
                  revDate: p.revStale ? null : p.revisedAt })}
                className="btn btn-primary"
                style={{ whiteSpace: "nowrap", marginLeft: "auto" }}
                title="เปิดเอกสาร A4 สำหรับพิมพ์ / บันทึก PDF"
              >
                <Printer size={14} /> พิมพ์เอกสาร
              </button>
            </div>
          </div>
        </div>

        <div style={{ padding: "12px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
          <div style={{ display: "flex", gap: "24px", fontSize: "12px", flexWrap: "wrap" }}>
            <div><span style={{ color: "var(--text-3)" }}>วันเริ่ม: </span>{p.startDate || "-"}</div>
            <div><span style={{ color: "var(--text-3)" }}>เลขที่ใบเสนอราคา: </span>{p.metadata?.quotationNumber || "-"}</div>
            <div><span style={{ color: "var(--text-3)" }}>เลขที่ PO: </span>{p.metadata?.poNumber || "-"}</div>
            <div><span style={{ color: "var(--text-3)" }}>หมวดสินค้า: </span>{p.productMainCategory ? `${mainCatName(p.productMainCategory)}${p.productSubCategory ? ` / ${p.productSubCategory}` : ''}` : "-"}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span className={`status-pill dot ${statusPillClass(getComputedStatus(p))}`} style={{ padding: "4px 10px", fontSize: "11px", borderRadius: "8px", "--dot": statusDotColor(getComputedStatus(p)) }}>
              {getComputedStatus(p)}
            </span>
          </div>
        </div>

        </div>

      {p.status === "Dropped" && (
        <div style={{ marginBottom: "24px", padding: "18px 24px", background: "color-mix(in srgb, var(--red) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--red) 40%, transparent)", borderRadius: "12px", borderLeft: "5px solid var(--red)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", zIndex: 10, position: "relative" }}>
          <div>
            <div style={{ color: "var(--red)", fontWeight: 800, fontSize: "14px", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}><X size={16} strokeWidth={3} /> โปรเจกต์นี้ถูกยกเลิกแล้ว</div>
            {p.metadata?.lossReason && (
              <div style={{ fontSize: "13px", color: "var(--red)", display: "flex", alignItems: "flex-start", gap: "6px", fontWeight: 500 }}>
                <span style={{ fontWeight: 700 }}>เหตุผล:</span> <span>{p.metadata.lossReason}</span>
              </div>
            )}
          </div>
          {hasWriteAccess && (userRole === "senior_ae" || isSuperuser(userRole)) && (
            <button type="button" className="btn btn-primary" onClick={() => updateProject({ status: "In Progress" })}>
              <Activity size={14} /> ดึงกลับมาดำเนินการ (Restore)
            </button>
          )}
        </div>
      )}

      <div style={{ opacity: isLocked ? 0.6 : 1, filter: isLocked ? "grayscale(50%)" : "none", transition: "all 0.3s", pointerEvents: isLocked ? "none" : "auto" }}>
      {view === "document" ? (
        <div className="glass-panel" style={{ padding: "20px", marginBottom: "24px" }}>
          <ProjectDocumentView
            project={p}
            canEdit={canEdit}
            onUpdateProject={updateProject}
            onUpdateTask={stageScheduleEdit}
            fgUI={fgUI}
            statusLabel={getComputedStatus(p)}
            statusColor={statusDotColor(getComputedStatus(p))}
          />
        </div>
      ) : view === "table" ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>
              ตารางขั้นตอนงาน
              <span style={{ fontWeight: 400, color: "var(--text-3)", marginLeft: "6px" }}>
                ({tableGroups.reduce((n, g) => n + g.tasks.length, 0)}{tableStatusFilter !== "all" ? ` / ${total}` : ""} ขั้นตอน)
              </span>
            </div>
            <div className="toolbar">
              {/* กรองสถานะ */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Filter size={14} color="var(--text-3)" />
                <Select compact value={tableStatusFilter} onChange={(e) => setTableStatusFilter(e.target.value)} title="กรองตามสถานะ">
                  <option value="all">ทุกสถานะ</option>
                  <option value="pending">รอดำเนินการ</option>
                  <option value="progress">กำลังทำ</option>
                  <option value="completed">เสร็จแล้ว</option>
                </Select>
              </div>
              {/* เรียงลำดับ */}
              <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <ArrowUpDown size={14} color="var(--text-3)" />
                <Select compact value={tableSort} onChange={(e) => setTableSort(e.target.value)} title="เรียงลำดับ (ภายในแต่ละเฟส)">
                  <option value="step">ลำดับขั้นตอน</option>
                  <option value="due">วันเสร็จ</option>
                  <option value="status">สถานะ</option>
                  <option value="name">ชื่อขั้นตอน</option>
                </Select>
              </div>
              {canEdit && (
                <button onClick={() => { setInsertAfterId(null); setInsertBeforeId(null); setTaskForm({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: processedTasks.length > 0 ? [processedTasks[processedTasks.length - 1].id] : [], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false, assigneeId: "" }); setShowAddTask(true); }} className="btn btn-primary sm">
                  <Plus size={14} /> เพิ่มขั้นตอน
                </button>
              )}
            </div>
          </div>
          {total === 0 ? (
            <EmptyState icon={ListTodo}>ยังไม่มีขั้นตอนงาน</EmptyState>
          ) : tableGroups.length === 0 ? (
            <EmptyState icon={Filter}>ไม่มีขั้นตอนที่ตรงกับตัวกรอง</EmptyState>
          ) : (
            <div className="premium-glass-table table-responsive">
              <table className="premium-table">
                <thead>
                  <tr>
                    <th style={{ width: canEdit && tableSort === "step" ? "78px" : "44px", textAlign: "center" }}>#</th>
                    <th>ขั้นตอน</th>
                    <th>แผนก</th>
                    <th>ผู้รับผิดชอบ</th>
                    <th>สถานะ</th>
                    <th style={{ whiteSpace: "nowrap" }}>เริ่ม</th>
                    <th style={{ whiteSpace: "nowrap" }}>เสร็จ</th>
                    <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>วัน</th>
                    <th style={{ whiteSpace: "nowrap" }}>ขึ้นกับ</th>
                    {canEdit && <th style={{ width: "70px", textAlign: "center" }}>จัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {tableGroups.map((g) => (
                    <Fragment key={g.key}>
                      {g.phase && (
                        <tr>
                          <td colSpan={canEdit ? 10 : 9} style={{ background: "var(--panel-2)", borderTop: "2px solid var(--border)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 700, fontSize: "13px" }}>
                              <span style={{ width: "9px", height: "9px", borderRadius: "3px", background: phaseColorMap[g.phase] || "var(--accent)" }} />
                              {g.num ? `${g.num}. ` : ""}{g.phase}
                              <span style={{ fontWeight: 600, fontSize: "11px", color: "var(--text-3)", marginLeft: "auto" }}>{g.done}/{g.tasks.length}</span>
                            </div>
                          </td>
                        </tr>
                      )}
                      {g.tasks.map((task) => {
                        const rs = roleStyle(task.role);
                        const assignee = resolveAssigneeName(task, users);
                        return (
                          <tr key={task.id} className="premium-row">
                            <td style={{ color: "var(--text-3)" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px", justifyContent: "center" }}>
                                {canEdit && tableSort === "step" && moveButtons(task)}
                                <span style={{ fontWeight: 700 }}>{task.displayNumber}</span>
                              </div>
                            </td>
                            <td style={{ fontWeight: 500 }}>
                              <span onClick={() => canEdit && openEditModal(task)} title={canEdit ? "คลิกเพื่อแก้ไขขั้นตอน" : undefined} style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: canEdit ? "pointer" : "default" }}>
                                {task.isMilestone && <Flag size={13} color="var(--amber)" strokeWidth={2.5} />}
                                {task.name}
                              </span>
                            </td>
                            <td><span className="ui-badge" style={{ color: rs.color, background: rs.bg, border: `1px solid ${rs.border}` }}>{task.role}</span></td>
                            <td style={{ fontSize: "13px" }}>{assignee === "—" ? <span style={{ color: "var(--text-3)" }}>—</span> : assignee}</td>
                            <td>
                              {canEdit ? (
                                <><StatusSelect value={task.status} onChange={(v) => stageTaskEdit(task.id, { status: v })} />{dirty[task.id] && <span title="ยังไม่บันทึก" style={{ marginLeft: "4px", color: "var(--amber)", fontSize: "11px" }}>●</span>}</>
                              ) : (
                                <span className="status-pill dot" style={{ "--dot": statusDotColor(task.status === "Completed" ? "Completed" : task.status === "In Progress" ? "In Progress" : "Pending") }}>{task.status}</span>
                              )}
                            </td>
                            <td style={{ fontSize: "12.5px", whiteSpace: "nowrap" }}>{formatDate(task.startDate)}</td>
                            <td style={{ fontSize: "12.5px", whiteSpace: "nowrap" }}>{formatDate(task.finishDate)}</td>
                            <td style={{ textAlign: "center", fontSize: "12.5px" }}>{task.durationDays}</td>
                            <td onClick={(e) => e.stopPropagation()}>
                              {(() => {
                                const preds = (Array.isArray(task.predecessors) ? task.predecessors : []).filter((p) => taskNumById[p]);
                                const chips = (
                                  <span style={{ display: "inline-flex", flexWrap: "wrap", gap: "3px", alignItems: "center" }}>
                                    {preds.map((p) => (
                                      <span key={p} style={{ fontSize: "11px", fontWeight: 600, color: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--accent) 30%, transparent)", borderRadius: "10px", padding: "1px 7px" }}>{taskNumById[p]}</span>
                                    ))}
                                  </span>
                                );
                                if (!canEdit) return preds.length ? chips : <span style={{ color: "var(--text-3)" }}>—</span>;
                                return (
                                  <button
                                    onClick={(e) => setDepPopover({ task, x: e.clientX, y: e.clientY })}
                                    title="ตั้งงานที่ต้องรอให้เสร็จก่อน"
                                    style={{ display: "inline-flex", alignItems: "center", gap: "5px", background: "none", border: "none", cursor: "pointer", padding: "2px 4px", fontSize: "12px", color: preds.length ? "var(--text)" : "var(--text-3)" }}>
                                    {preds.length ? chips : <span style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}><Plus size={12} /> เพิ่ม</span>}
                                  </button>
                                );
                              })()}
                            </td>
                            {canEdit && (
                              <td onClick={(e) => e.stopPropagation()}>
                                <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                                  <button className="btn-icon" onClick={() => openEditModal(task)} aria-label="แก้ไขขั้นตอน" title="แก้ไขขั้นตอน"><Edit2 size={14} /></button>
                                  <button className="btn-icon danger" onClick={() => deleteTask(task.id, task.name)} aria-label="ลบขั้นตอน" title="ลบขั้นตอน"><Trash2 size={14} /></button>
                                </div>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* title row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>ความคืบหน้า (Progress List)</div>
            {canEdit && (
              <button onClick={() => { setInsertAfterId(null); setInsertBeforeId(null); setTaskForm({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: processedTasks.length > 0 ? [processedTasks[processedTasks.length - 1].id] : [], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false, assigneeId: "" }); setShowAddTask(true); }} className="btn btn-primary sm">
                <Plus size={14} /> เพิ่มขั้นตอน
              </button>
            )}
          </div>

          {/* progress summary & milestones */}
          <div className="glass-panel" style={{ padding: "20px 22px", background: "var(--panel-2)", borderRadius: "14px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: "12px", marginBottom: "14px", flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: "12px" }}>
                <span style={{ fontSize: "36px", fontWeight: 700, lineHeight: 1, color: accent, letterSpacing: "-1px" }}>
                  {pct}<span style={{ fontSize: "18px", fontWeight: 600 }}>%</span>
                </span>
                <span style={{ fontSize: "13px", color: "var(--text-2)", display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <TrendingUp size={15} color={accent} /> เสร็จแล้ว {done} จาก {total} ขั้นตอน
                </span>
              </div>
              <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "flex-end" }}>
                {renderChip(CircleDashed, `รอดำเนินการ ${total - done - inProg}`, "var(--text-3)")}
                {renderChip(Clock, `กำลังทำ ${inProg}`, "var(--accent)")}
                {renderChip(CheckCircle2, `เสร็จสิ้น ${done}`, "var(--green)")}
                {overdue > 0 && renderChip(AlertTriangle, `เลยกำหนด ${overdue}`, "var(--red)")}
              </div>
            </div>
            <div className="progress" style={{ height: "8px", marginBottom: milestones.length > 0 ? "16px" : "0" }}>
              <span className={isDone ? "done" : ""} style={{ width: `${pct}%` }} />
            </div>

            {/* milestone stepping stones */}
            {milestones.length > 0 && (
              <div style={{ paddingTop: "16px", borderTop: "1px dashed var(--border)", overflowX: "auto", paddingBottom: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", minWidth: "max-content", paddingBottom: "4px" }}>
                  {milestones.map((m, i) => {
                    const mDone = m.status === "Completed";
                    const mProg = m.status === "In Progress";
                    const color = mDone ? "var(--green)" : (mProg ? "var(--accent)" : "var(--border-strong)");
                    const icon = mDone ? <Check size={14} strokeWidth={3} color="#fff" /> : (mProg ? <Clock size={14} strokeWidth={2.5} color="#fff" /> : <span style={{ fontSize: "10px", color: "var(--text-3)" }}>{m.displayNumber || (i + 1)}</span>);
                    return (
                      <Fragment key={m.id}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", opacity: mDone || mProg ? 1 : 0.6 }}>
                          <div style={{ width: "24px", height: "24px", borderRadius: "50%", background: mDone || mProg ? color : "var(--bg)", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center" }}>{icon}</div>
                          <div style={{ fontSize: "12px", fontWeight: 600, color: mDone || mProg ? "var(--text)" : "var(--text-2)" }}>{m.name}</div>
                        </div>
                        {i < milestones.length - 1 && <div style={{ width: "30px", height: "2px", background: mDone ? "var(--green)" : "var(--border)" }} />}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {total === 0 && (
            <EmptyState icon={ListTodo}>ยังไม่มีขั้นตอนงาน</EmptyState>
          )}

          {/* task timeline */}
          {processedTasks.map((task, idx) => {
            const isCompleted = task.status === "Completed";
            const isInProgress = task.status === "In Progress";
            const isEditing = editingTaskId === task.id;
            const prevPhase = processedTasks[idx - 1]?.phase ?? null;
            const isFirstOfPhase = task.phase && task.phase !== prevPhase;
            const isCollapsedPhase = task.phase && collapsedPhases.has(task.phase);
            if (isCollapsedPhase && !isFirstOfPhase) return null;

            const phaseHeader = isFirstOfPhase ? (() => {
              const phaseTasks = processedTasks.filter((t) => t.phase === task.phase);
              const d = phaseTasks.filter((t) => t.status === "Completed").length;
              const tot = phaseTasks.length;
              const ppct = tot ? Math.round((d / tot) * 100) : 0;
              const allDone = d === tot;
              const hasActive = phaseTasks.some((t) => t.status === "In Progress");
              const color = allDone ? "var(--green)" : hasActive ? "var(--accent)" : "var(--text-3)";
              return { done: d, total: tot, pct: ppct, allDone, color, accent: phaseColorMap[task.phase] || "var(--accent)", num: task.phaseNum };
            })() : null;

            const nextSamePhase = processedTasks[idx + 1]?.phase === task.phase;
            const showConnector = nextSamePhase;

            return (
              <div key={task.id} style={{ display: "flex", flexDirection: "column" }}>
                {isFirstOfPhase && phaseHeader && (
                  <button onClick={() => togglePhase(task.phase)} style={{ display: "flex", alignItems: "center", gap: "10px", width: "100%", padding: "9px 14px", marginBottom: isCollapsedPhase ? "0" : "8px", background: `color-mix(in srgb, ${phaseHeader.accent} 7%, var(--panel))`, border: "none", borderLeft: `3px solid ${phaseHeader.accent}`, borderRadius: "10px", cursor: "pointer", textAlign: "left" }}>
                    {isCollapsedPhase ? <ChevronRight size={14} color={phaseHeader.accent} /> : <ChevronDown size={14} color={phaseHeader.accent} />}
                    <span style={{ flex: 1, fontSize: "13px", fontWeight: 700, color: "var(--text)" }}>{phaseHeader.num}. {task.phase}</span>
                    <span style={{ fontSize: "12px", fontWeight: 600, color: phaseHeader.color }}>{phaseHeader.done}/{phaseHeader.total}</span>
                    {phaseHeader.allDone ? <CheckCircle2 size={13} color="var(--green)" /> : (
                      <div style={{ width: "52px", height: "4px", background: "var(--border)", borderRadius: "2px", overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${phaseHeader.pct}%`, background: phaseHeader.color, borderRadius: "2px", transition: "width 0.3s" }} />
                      </div>
                    )}
                  </button>
                )}

                {!isCollapsedPhase && (
                  <div style={{ display: "flex", flexDirection: "column", paddingLeft: task.phase ? "12px" : "0" }}>
                    {isFirstOfPhase && canEdit && !isEditing && (
                      <div style={{ display: "flex", justifyContent: "center", margin: "0 0 4px", zIndex: 2 }}>
                        <button onClick={() => { setInsertAfterId(null); setInsertBeforeId(task.id); setTaskForm({ name: "", role: task.role || "SA", phase: task.phase || "", durationDays: 1, predecessors: [], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false, assigneeId: "" }); setShowAddTask(true); }} style={{ background: "var(--panel)", border: "1px dashed var(--border)", color: "var(--text-3)", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5, transition: "0.2s", padding: 0 }} title="แทรกขั้นตอนก่อนหัวแถวแรกของเฟสนี้">
                          <PlusCircle size={14} />
                        </button>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "stretch", gap: "0" }}>
                      {/* ปุ่มเลื่อนลำดับ — คอลัมน์หน้าสุด (นอกการ์ด พ้นเส้นเชื่อม) */}
                      {canEdit && !isEditing && (
                        <div style={{ width: "26px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {moveButtons(task)}
                        </div>
                      )}
                      {/* Milestone icon outside card */}
                      <div style={{ width: "28px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {task.isMilestone && <Flag size={14} color="var(--amber)" strokeWidth={2.5} />}
                      </div>
                    <div className="pm-task-card" style={{ background: task.isMilestone ? "color-mix(in srgb, var(--amber) 8%, transparent)" : (isCompleted ? "color-mix(in srgb, var(--green) 5%, transparent)" : (isInProgress ? "var(--panel-2)" : "var(--panel)")), border: `1px solid ${isCompleted ? "color-mix(in srgb, var(--green) 30%, transparent)" : (isInProgress ? "var(--accent)" : (task.isMilestone ? "color-mix(in srgb, var(--amber) 35%, transparent)" : "var(--border)"))}`, boxShadow: isInProgress ? "0 6px 20px -8px color-mix(in srgb, var(--accent) 45%, transparent)" : "none" }}>
                      {showConnector && <div className="pm-task-connector" style={{ background: isCompleted ? "var(--green)" : "var(--border)" }} />}

                      <div style={{ zIndex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                        <button onClick={() => canEdit && handleToggleTask(task)} disabled={!canEdit || task.status === "Pending" || isEditing} style={{ width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: isCompleted ? "var(--green)" : (isInProgress ? "var(--accent)" : "var(--bg)"), border: `2px solid ${isCompleted ? "var(--green)" : (isInProgress ? "var(--accent)" : "var(--border)")}`, color: "#fff", cursor: !canEdit || task.status === "Pending" || isEditing ? "not-allowed" : "pointer", padding: 0, boxShadow: isInProgress ? "0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent)" : "none", transition: "all 0.2s" }}>
                          {isCompleted ? <Check size={16} strokeWidth={3} /> : (isInProgress ? <Clock size={15} strokeWidth={2.5} /> : <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)" }}>{task.displayNumber}</span>)}
                        </button>
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "12px", background: "var(--panel)", padding: "12px", borderRadius: "8px", border: "1px solid var(--border)" }}>
                            {renderStepEditFields(task.id)}
                            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                              <button className="btn btn-secondary sm" onClick={() => { setEditingTaskId(null); setEditForm(null); }}>ยกเลิก</button>
                              <button className="btn btn-primary sm" onClick={() => saveEditing(task.id)}><Check size={14} /> ตกลง</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px", gap: "8px" }}>
                              <h4 onClick={() => { if (canEdit) startEditing(task); }} title={canEdit ? "คลิกเพื่อแก้ไขขั้นตอน" : undefined} style={{ margin: 0, fontSize: "15px", color: isCompleted ? "var(--green)" : "var(--text)", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", cursor: canEdit ? "pointer" : "default" }}>
                                <span style={{ borderBottom: "1px dashed transparent" }} onMouseEnter={(e) => { if (canEdit) e.currentTarget.style.borderBottomColor = "var(--text-3)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; }}>{task.displayNumber}. {task.name}</span>
                              </h4>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                                {(() => { const rs = roleStyle(task.role); return (
                                  <span className="ui-badge" style={{ color: rs.color, background: rs.bg, border: `1px solid ${rs.border}` }}>{task.role}</span>
                                ); })()}
                                {canEdit && (
                                  <><StatusSelect value={task.status} onChange={(v) => stageTaskEdit(task.id, { status: v })} />{dirty[task.id] && <span title="ยังไม่บันทึก" style={{ marginLeft: "4px", color: "var(--amber)", fontSize: "11px" }}>●</span>}</>
                                )}
                                {canEdit && (
                                  <div style={{ display: "flex", gap: "4px" }}>
                                    <button className="btn-icon" onClick={() => startEditing(task)} aria-label="แก้ไขขั้นตอน" title="แก้ไข"><Edit2 size={14} /></button>
                                    <button className="btn-icon danger" onClick={() => deleteTask(task.id, task.name)} aria-label="ลบขั้นตอน" title="ลบขั้นตอน"><Trash2 size={14} /></button>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--text-3)", marginTop: "8px", flexWrap: "wrap" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><Clock size={14} /> {task.durationDays} วันทำการ</div>
                              <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> {formatDate(task.startDate)} - {formatDate(task.finishDate)}</div>
                            </div>
                            {(() => {
                              const v = getVariance(task);
                              return v ? (
                                <div style={{ fontSize: "11px", color: v.color, marginTop: "6px", display: "flex", alignItems: "center", gap: "4px" }}>
                                  <CheckCircle2 size={12} /> เสร็จจริง {formatDate(task.actualFinishDate)} · {v.label}
                                </div>
                              ) : null;
                            })()}
                            {task.note && (
                              <div style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "8px", display: "flex", alignItems: "flex-start", gap: "6px", background: "var(--panel-2)", padding: "6px 8px", borderRadius: "6px" }}>
                                <span style={{ color: "var(--text-3)", fontWeight: 600, whiteSpace: "nowrap" }}>หมายเหตุ:</span>
                                <span style={{ flex: 1, whiteSpace: "pre-wrap" }}>{task.note}</span>
                                {task.showNoteInPrint && <span title="จะแสดงตอนพิมพ์เอกสาร" style={{ fontSize: "10px", color: "var(--accent)", border: "1px solid color-mix(in srgb, var(--accent) 35%, transparent)", borderRadius: "10px", padding: "1px 7px", display: "inline-flex", alignItems: "center", gap: "3px", whiteSpace: "nowrap" }}>🖨 พิมพ์</span>}
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      {isInProgress && !isEditing && canEdit && (
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <button className="btn btn-success" onClick={() => stageTaskEdit(task.id, { status: "Completed" })} style={{ fontSize: "12px" }}>✔ ทำเสร็จแล้ว</button>
                        </div>
                      )}
                    </div>
                    </div>{/* close milestone wrapper */}

                    {canEdit && !isEditing && (
                      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0", zIndex: 2 }}>
                        <button onClick={() => { setInsertBeforeId(null); setInsertAfterId(task.id); setTaskForm({ name: "", role: task.role || "SA", phase: task.phase || "", durationDays: 1, predecessors: [task.id], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false, assigneeId: "" }); setShowAddTask(true); }} style={{ background: "var(--panel)", border: "1px dashed var(--border)", color: "var(--text-3)", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5, transition: "0.2s", padding: 0 }} title="แทรกขั้นตอน">
                          <PlusCircle size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>

      {/* Footer — ยกเลิกโปรเจกต์ (Drop) หรือ On Hold */}
      {hasWriteAccess && p.status !== "Completed" && p.status !== "Dropped" && (
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          {p.status === "On Hold" ? (
            (p.aeOwner === me?.name || isSuperuser(userRole)) && (
              <button type="button" className="btn btn-primary" onClick={() => updateProject({ status: "In Progress" })}>
                <CheckCircle2 size={14} /> ดึงกลับมาดำเนินการ (Restore)
              </button>
            )
          ) : (
            <>
              <button type="button" className="btn btn-warning" onClick={() => updateProject({ status: "On Hold" })}>
                <Pause size={14} /> ระงับชั่วคราว (On Hold)
              </button>
              <button type="button" className="btn btn-danger" onClick={openDrop}>
                <X size={14} /> ยกเลิกโปรเจกต์ (Drop)
              </button>
            </>
          )}

          {p.status === "On Hold" && (
            <button type="button" className="btn btn-danger" onClick={openDrop}>
              <X size={14} /> ยกเลิกโปรเจกต์ (Drop)
            </button>
          )}
        </div>
      )}

      {/* Add task modal */}
      <Modal open={showAddTask} onClose={() => setShowAddTask(false)} title="เพิ่มขั้นตอน" size="md">
        <form onSubmit={addTask}>
          <div className="grid gap-[14px]">
            <div className="form-group">
              <label>ชื่อขั้นตอน <span className="text-[var(--red)]">*</span></label>
              <input value={taskForm.name} onChange={(e) => setTaskForm((f) => ({ ...f, name: e.target.value }))} required className="premium-input w-full" placeholder="ระบุชื่อขั้นตอน" />
            </div>

            <div className="pm-form-grid gap-3">
              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <label>แผนก (Role)</label>
                <Select fullWidth value={taskForm.role} onChange={(e) => setTaskForm((f) => ({ ...f, role: e.target.value, assigneeId: e.target.value === "SA" ? taskForm.assigneeId : "" }))}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              </div>
              <div className="form-group" style={{ gridColumn: "span 2" }}>
                <label>ผู้รับผิดชอบ</label>
                <AssigneeField form={taskForm} setForm={setTaskForm} users={users} />
              </div>
            </div>

            <div className="pm-form-grid gap-3">
              <div className="form-group">
                <label>วันที่เริ่ม <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(เว้นว่างเพื่ออิงตามงานที่รอ)</span></label>
                <input type="date" value={taskForm.startDate} onChange={(e) => syncTaskSchedule({ startDate: e.target.value })} className="premium-input w-full" />
              </div>
              <div className="form-group">
                <label>วันสิ้นสุด <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(กรอกแล้วจำนวนวันจะคำนวณให้)</span></label>
                <input type="date" value={taskForm.finishDate || ""} min={taskForm.startDate || undefined} disabled={!taskForm.startDate} onChange={(e) => syncTaskSchedule({ finishDate: e.target.value })} className="premium-input w-full" title={taskForm.startDate ? "วันสิ้นสุดของขั้นตอน" : "กรอกวันที่เริ่มก่อน"} />
              </div>
              <div className="form-group">
                <label>จำนวนวันทำการ</label>
                <input type="number" min="1" value={taskForm.durationDays} onChange={(e) => syncTaskSchedule({ durationDays: e.target.value })} className="premium-input w-full" />
              </div>
            </div>

            <div className="form-group">
              <label>เฟส (Phase)</label>
              <SearchableSelect
                allowFreeText
                options={formPhases.map((ph) => ({ value: ph, label: ph }))}
                value={taskForm.phase}
                onChange={(v) => setTaskForm((f) => ({ ...f, phase: v }))}
                placeholder="เลือกหรือพิมพ์เฟสใหม่"
                emptyText="ยังไม่มีเฟส (พิมพ์เพื่อเพิ่มใหม่)"
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", color: "var(--text)", fontWeight: 500 }}>
              <input type="checkbox" checked={taskForm.isMilestone} onChange={(e) => setTaskForm((f) => ({ ...f, isMilestone: e.target.checked }))} style={{ accentColor: "var(--amber)", width: "16px", height: "16px", cursor: "pointer" }} />
              ตั้งเป็น Milestone <span style={{ fontSize: "10px", background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)", padding: "2px 8px", borderRadius: "12px", border: "1px solid color-mix(in srgb, var(--amber) 40%, transparent)", marginLeft: "4px", display: "inline-flex", alignItems: "center", fontWeight: 600 }}><Flag size={10} style={{ marginRight: "4px" }} /> จุดสังเกตหลัก</span>
            </label>

            <div className="form-group">
              <label>หมายเหตุ</label>
              <textarea value={taskForm.note} onChange={(e) => setTaskForm((f) => ({ ...f, note: e.target.value }))} className="premium-input w-full" placeholder="หมายเหตุของขั้นตอนนี้ (ถ้ามี)" rows={2} style={{ resize: "vertical" }} />
              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", color: "var(--text-2)", marginTop: "8px" }}>
                <input type="checkbox" checked={taskForm.showNoteInPrint} onChange={(e) => setTaskForm((f) => ({ ...f, showNoteInPrint: e.target.checked }))} style={{ accentColor: "var(--accent)", width: "16px", height: "16px", cursor: "pointer" }} />
                แสดงหมายเหตุนี้ตอนพิมพ์เอกสาร
              </label>
            </div>

            <div className="form-group border-t border-[var(--border)] pt-[14px]">
              <label>งานที่ต้องรอให้เสร็จก่อน (Predecessors) <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(เลือกได้หลายงาน)</span></label>
              <PredecessorPicker
                tasks={processedTasks}
                value={taskForm.predecessors}
                onChange={(predecessors) => setTaskForm((f) => ({ ...f, predecessors }))}
                maxHeight={150}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowAddTask(false)} className="btn">ยกเลิก</button>
            <button type="submit" className="btn btn-primary px-8">เพิ่ม</button>
          </div>
        </form>
      </Modal>

      {/* Edit task modal — ใช้จาก Table view (แก้ในที่ ไม่สลับไป List) */}
      <Modal open={showEditTask} onClose={closeEditModal} title="แก้ไขขั้นตอน" size="md">
        {editForm && editTask && (
          <form onSubmit={(e) => { e.preventDefault(); saveEditModal(); }}>
            <div className="grid gap-[14px]">
              <div className="form-group">
                <label>ชื่อขั้นตอน <span className="text-[var(--red)]">*</span></label>
                <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} required className="premium-input w-full" placeholder="ระบุชื่อขั้นตอน" />
              </div>

              <div className="pm-form-grid gap-3">
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label>แผนก (Role)</label>
                  <Select fullWidth value={editForm.role} onChange={(e) => setEditForm((f) => ({ ...f, role: e.target.value, assigneeId: e.target.value === "SA" ? editForm.assigneeId : "" }))}>
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </Select>
                </div>
                <div className="form-group" style={{ gridColumn: "span 2" }}>
                  <label>ผู้รับผิดชอบ</label>
                  <AssigneeField form={editForm} setForm={setEditForm} users={users} />
                </div>
              </div>

              <div className="pm-form-grid gap-3">
                <div className="form-group">
                  <label>วันที่เริ่ม <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(เว้นว่างเพื่ออิงตามงานที่รอ)</span></label>
                  <input type="date" value={editForm.startDate || ""} onChange={(e) => syncSchedule({ startDate: e.target.value })} className="premium-input w-full" />
                </div>
                <div className="form-group">
                  <label>วันสิ้นสุด <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(กรอกแล้วจำนวนวันจะคำนวณให้)</span></label>
                  <input type="date" value={editForm.finishDate || ""} min={editForm.startDate || undefined} disabled={!editForm.startDate} onChange={(e) => syncSchedule({ finishDate: e.target.value })} className="premium-input w-full" title={editForm.startDate ? "วันสิ้นสุดของขั้นตอน" : "กรอกวันที่เริ่มก่อน"} />
                </div>
                <div className="form-group">
                  <label>จำนวนวันทำการ</label>
                  <input type="number" min="1" value={editForm.durationDays} onChange={(e) => syncSchedule({ durationDays: e.target.value })} className="premium-input w-full" />
                </div>
              </div>

              <div className="form-group">
                <label>เฟส (Phase)</label>
                <SearchableSelect
                  allowFreeText
                  options={formPhases.map((ph) => ({ value: ph, label: ph }))}
                  value={editForm.phase || ""}
                  onChange={(v) => setEditForm((f) => ({ ...f, phase: v }))}
                  placeholder="เลือกหรือพิมพ์เฟสใหม่"
                  emptyText="ยังไม่มีเฟส (พิมพ์เพื่อเพิ่มใหม่)"
                />
              </div>

              <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", color: "var(--text)", fontWeight: 500 }}>
                <input type="checkbox" checked={editForm.isMilestone || false} onChange={(e) => setEditForm((f) => ({ ...f, isMilestone: e.target.checked }))} style={{ accentColor: "var(--amber)", width: "16px", height: "16px", cursor: "pointer" }} />
                ตั้งเป็น Milestone <span style={{ fontSize: "10px", background: "color-mix(in srgb, var(--amber) 12%, transparent)", color: "var(--amber)", padding: "2px 8px", borderRadius: "12px", border: "1px solid color-mix(in srgb, var(--amber) 40%, transparent)", marginLeft: "4px", display: "inline-flex", alignItems: "center", fontWeight: 600 }}><Flag size={10} style={{ marginRight: "4px" }} /> จุดสังเกตหลัก</span>
              </label>

              <div className="form-group">
                <label>หมายเหตุ</label>
                <textarea value={editForm.note || ""} onChange={(e) => setEditForm((f) => ({ ...f, note: e.target.value }))} className="premium-input w-full" placeholder="หมายเหตุของขั้นตอนนี้ (ถ้ามี)" rows={2} style={{ resize: "vertical" }} />
                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", cursor: "pointer", color: "var(--text-2)", marginTop: "8px" }}>
                  <input type="checkbox" checked={editForm.showNoteInPrint || false} onChange={(e) => setEditForm((f) => ({ ...f, showNoteInPrint: e.target.checked }))} style={{ accentColor: "var(--accent)", width: "16px", height: "16px", cursor: "pointer" }} />
                  แสดงหมายเหตุนี้ตอนพิมพ์เอกสาร
                </label>
              </div>

              <div className="form-group border-t border-[var(--border)] pt-[14px]">
                <label>งานที่ต้องรอให้เสร็จก่อน (Predecessors) <span className="text-[11px] text-[var(--text-3)] font-normal ml-1">(เลือกได้หลายงาน)</span></label>
                <PredecessorPicker
                  tasks={processedTasks}
                  selfId={editTask.id}
                  value={editForm.predecessors || []}
                  onChange={(predecessors) => setEditForm((f) => ({ ...f, predecessors }))}
                  maxHeight={150}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
              <button type="button" onClick={closeEditModal} className="btn">ยกเลิก</button>
              <button type="submit" className="btn btn-primary px-8"><Check size={14} className="mr-1" /> ตกลง</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={showIssueRev} onClose={() => !issuingRev && setShowIssueRev(false)} title="ออกเวอร์ชันเอกสารใหม่ (Revise)" size="sm">
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "14px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px", fontSize: "13px", color: "var(--text-2)" }}>
            <GitCommit size={18} color="var(--accent)" style={{ flexShrink: 0 }} />
            <span>จะ freeze เอกสารชุดปัจจุบันทั้งหมด และรันเลขอัตโนมัติเป็น <b className="ui-badge">Rev. {nextRev}</b></span>
          </div>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--text-3)" }}>
            หมายเหตุการแก้ (ไม่บังคับ)
            <textarea
              value={revNote}
              onChange={(e) => setRevNote(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="เช่น ปรับวันส่งมอบตาม PO ใหม่"
              style={{ resize: "vertical", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", fontSize: "13px", fontFamily: "inherit" }}
            />
          </label>
          {revError && <div style={{ fontSize: "12px", color: "var(--red)" }}>{revError}</div>}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "0 20px 16px" }}>
          <button className="btn" disabled={issuingRev} onClick={() => setShowIssueRev(false)}>ยกเลิก</button>
          <button className="btn btn-primary px-6" disabled={issuingRev} onClick={confirmIssueRev}>
            <GitCommit size={14} /> {issuingRev ? "กำลังออก…" : `ออก Rev. ${nextRev}`}
          </button>
        </div>
      </Modal>

      <Modal open={showRevisions} onClose={() => setShowRevisions(false)} title="ประวัติเวอร์ชัน (Rev)" size="md">
        <div style={{ padding: "16px 20px" }}>
          <div style={{ fontSize: "12px", color: "var(--text-3)", marginBottom: "10px" }}>
            <b style={{ color: "var(--accent)" }}>Rev.</b> = เวอร์ชันทางการ (เก็บถาวร) — เป็นจุดเดียวที่ย้อนกลับได้. กด “ออก Rev” เพื่อ freeze เอกสารชุดปัจจุบันเป็นเวอร์ชันใหม่
          </div>
          {revisions.length === 0 ? (
            <div style={{ fontSize: "13px", color: "var(--text-3)", textAlign: "center", padding: "24px 0" }}>
              ยังไม่มีเวอร์ชัน — กด “ออก Rev” เพื่อสร้างจุดย้อนแรก
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {revisions.map((r) => {
                const isRev = r.kind !== "save";
                return (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "10px 12px", border: "1px solid var(--border)", borderRadius: "8px", background: "var(--panel)" }}>
                  <span className="ui-badge" style={{ flexShrink: 0, ...(isRev ? { borderColor: "var(--accent)", color: "var(--accent)" } : { color: "var(--text-3)" }) }}>
                    {isRev ? `Rev. ${r.revNo}` : "บันทึก"}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: "12px", color: "var(--text-2)" }}>
                      {r.createdAt ? fmtDateTime(r.createdAt) : "-"} · {r.createdByName || "-"}
                    </div>
                    {r.note && <div style={{ fontSize: "12px", color: "var(--text-3)", whiteSpace: "pre-wrap" }}>{r.note}</div>}
                  </div>
                  {canEdit && (
                    <button className="btn sm" style={{ flexShrink: 0 }} onClick={() => restoreSnapshot(r)} title="ย้อนงานทั้งชุดกลับไปเท่ากับจุดนี้">
                      <RotateCcw size={13} /> ย้อนกลับ
                    </button>
                  )}
                  {isRev && (
                    <button className="btn sm" style={{ flexShrink: 0 }} onClick={() => printRevision(r.revNo)} title="เปิดเอกสารเวอร์ชันนี้เพื่อพิมพ์/บันทึก PDF">
                      <Printer size={13} /> พิมพ์
                    </button>
                  )}
                </div>
                );
              })}
            </div>
          )}
        </div>
      </Modal>

      <Toast toast={toast} onClose={() => setToast(null)} />

      <ConfirmModal
        open={!!confirmState}
        onClose={() => resolveConfirm(false)}
        onConfirm={() => resolveConfirm(true)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel || "ยืนยัน"}
        danger={confirmState?.danger ?? true}
      />

      <Modal open={showDrop} onClose={() => setShowDrop(false)} title="ยกเลิกโปรเจกต์" size="sm">
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: "12px" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "12px", color: "var(--text-3)" }}>
            เหตุผลที่ลูกค้ายกเลิก/ไม่ไปต่อ
            <textarea
              value={dropReason}
              onChange={(e) => setDropReason(e.target.value)}
              rows={3}
              placeholder="เช่น ราคาแพงไป, ลูกค้าเปลี่ยนใจ, คู่แข่งได้งาน"
              style={{ resize: "vertical", padding: "8px 10px", borderRadius: "8px", border: "1px solid var(--border)", background: "var(--panel)", color: "var(--text)", fontSize: "13px", fontFamily: "inherit" }}
            />
          </label>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "0 20px 16px" }}>
          <button className="btn" onClick={() => setShowDrop(false)}>ยกเลิก</button>
          <button className="btn btn-danger px-6" onClick={confirmDrop}>ยืนยันยกเลิกโปรเจกต์</button>
        </div>
      </Modal>

      {showEditProject && (
        <ProjectFormModal
          open={showEditProject}
          onClose={() => setShowEditProject(false)}
          editingId={p.id}
          initialData={p}
          onSuccess={(data) => {
            // บั๊ก D: หลังแก้โปรเจกต์ (อาจ resync ขั้นตอนสรรพสามิตใน DB) ต้อง reload
            // ทั้งก้อน — PATCH คืนแค่แถว project ไม่มี tasks ที่เปลี่ยน
            setShowEditProject(false);
            // เชื่อมสินค้า (FG) ไม่สำเร็จ → เตือน (PATCH ลบของเดิมไปแล้ว ต้องผูกใหม่)
            if (data?.productWarning) setToast({ kind: "error", msg: data.productWarning });
            load();
          }}
          customers={customers}
          categories={categories}
          allProducts={allProducts}
          users={users}
        />
      )}

      {depPopover && (
        <PredecessorPopover
          task={depPopover.task}
          tasks={processedTasks}
          anchor={{ x: depPopover.x, y: depPopover.y }}
          onClose={() => setDepPopover(null)}
          onSave={(predecessors) => { stageTaskEdit(depPopover.task.id, { predecessors }); setDepPopover(null); }}
        />
      )}

      {/* เฟส 1: แถบยืนยันการเปลี่ยนแปลงที่ค้างอยู่ — ลอยล่างจอ เห็นจากทุกวิว */}
      {dirtyCount > 0 && (
        <div style={{ position: "fixed", left: "50%", bottom: "20px", transform: "translateX(-50%)", zIndex: 60, display: "flex", alignItems: "center", gap: "12px", background: "var(--panel)", border: "1px solid var(--accent)", borderRadius: "12px", padding: "10px 16px", boxShadow: "0 8px 28px rgba(0,0,0,0.20)" }}>
          <span style={{ fontSize: "13px", color: "var(--text)" }}>
            มีการแก้ไข <b style={{ color: "var(--amber)" }}>{dirtyCount}</b> ขั้นตอน — ยังไม่บันทึก
          </span>
          <button className="btn" onClick={cancelEdits} style={{ fontSize: "13px" }}>ยกเลิก</button>
          <button className="btn btn-primary" onClick={confirmEdits} style={{ fontSize: "13px" }} title="บันทึกการแก้ทั้งหมดลงเอกสาร (จุดย้อนกลับสร้างได้จากปุ่ม “ออก Rev”)">บันทึก</button>
        </div>
      )}
    </div>
  );
}
