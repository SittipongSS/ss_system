"use client";
import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Plus, PlusCircle, X, Flag, FileText, GanttChart,
  ListTodo, AlertTriangle, CheckCircle2, Clock, Calendar,
  TrendingUp, Edit2, Trash2, Save, ChevronDown, ChevronRight,
  Activity, CircleDashed,
  Check, Printer, Table2, Filter, ArrowUpDown, User, FolderX,
} from "lucide-react";
import { useCan, useRole } from "@/lib/roleContext";
import { TEAM_LABELS, isSuperuser } from "@/lib/permissions";
import Modal from "@/components/Modal";
import ProjectDocumentView from "@/components/pm/ProjectDocumentView";
import ProjectFormModal from "@/components/pm/ProjectFormModal";
import PredecessorPicker, { PredecessorPopover } from "@/components/pm/PredecessorPicker";
import Select from "@/components/ui/Select";
import StatusSelect, { taskStatusColor } from "@/components/pm/StatusSelect";
import SearchableSelect from "@/components/ui/SearchableSelect";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import { setHolidays, countBusinessDays, isBusinessDay, toLocalISODate } from "@/lib/pm/dateHelpers";
import { openGanttPrintWindow } from "@/lib/pm/ganttPrint";
import { useResponsiveView } from "@/lib/useResponsiveView";

const STATUS_TH = {
  New: "ใหม่ (New)", "In Progress": "ดำเนินการ (Active)", Completed: "เสร็จสิ้น (Completed)",
  "On Hold": "ระงับ (On Hold)", Dropped: "ยกเลิก (Dropped)",
};

const getComputedStatus = (p) => {
  if (!p) return "";
  if (p.status === "Dropped") return "Dropped";
  if (p.status === "On Hold") return "On Hold";
  
  const total = p.tasks?.length || 0;
  const done = p.tasks?.filter((t) => t.status === "Completed").length || 0;
  if (total > 0 && done === total) return "Completed";
  
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const overdueCount = (p.tasks || []).filter((t) => t.status !== "Completed" && t.finishDate && new Date(t.finishDate) < today).length;
  if (overdueCount > 0) return "Delayed";
  
  if (total === 0 || p.tasks.every(t => t.status === "Pending")) return "New";
  
  return "On Track";
};

const statusDotColor = (s) => s === "Completed" ? "var(--green)" : s === "On Track" ? "var(--green)" : s === "Delayed" ? "var(--red)" : s === "On Hold" ? "var(--amber)" : s === "Dropped" ? "var(--red)" : "var(--accent)";
const statusPillClass = (s) => s === "Completed" ? "success" : s === "On Track" ? "success" : s === "Delayed" ? "danger" : s === "On Hold" ? "warning" : s === "Dropped" ? "danger" : "primary";

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
  const userRole = useRole();
  const userName = typeof window !== "undefined" ? localStorage.getItem("userName") : "";
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
  const [taskForm, setTaskForm] = useState({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: [], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false });
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
  // "งานเพิ่มเติม" (personal_tasks ผูกโปรเจกต์) — งานนอกแผน assign ในทีมได้ ไม่เข้า Gantt
  const [showExtra, setShowExtra] = useState(false);
  const [editingExtraId, setEditingExtraId] = useState(null);
  const [extraForm, setExtraForm] = useState({ title: "", note: "", dueDate: "", assigneeId: "" });
  const [savingExtra, setSavingExtra] = useState(false);
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
    fetch("/api/products").then((r) => (r.ok ? r.json() : [])).then((d) => setAllProducts(d || [])).catch(() => {});
    fetch("/api/customers").then((r) => (r.ok ? r.json() : [])).then((d) => setCustomers(d || [])).catch(() => {});
    fetch("/api/product-types").then((r) => (r.ok ? r.json() : [])).then((d) => setCategories(d || [])).catch(() => {});
    fetch("/api/pm/assignable-users").then((r) => (r.ok ? r.json() : [])).then((d) => setUsers(d || [])).catch(() => {});
    // โหลดปฏิทินวันหยุดจริงให้ฝั่ง client (Gantt/Document view นับวันทำการถูกต้อง)
    fetch("/api/holidays").then((r) => (r.ok ? r.json() : [])).then((d) => {
      if (Array.isArray(d) && d.length) setHolidays(d.map((h) => h.date));
    }).catch(() => {});
  }, []);

  const updateProject = async (patch) => {
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) { const updated = await res.json(); setData((d) => ({ ...d, ...updated })); }
    return res.ok;
  };

  const updateTask = async (taskId, patch) => {
    const res = await fetch(`/api/pm/project-tasks/${taskId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    if (res.ok) {
      // บั๊ก A: แก้ startDate/durationDays/predecessors ทำให้ server เลื่อน downstream → reload เต็ม
      // เช็คว่ามี key (ไม่ใช่ truthy) — การ "ล้าง" วันเริ่ม (startDate: null) ต้อง reload ด้วย
      // เพราะ server เลื่อน downstream แล้ว ถ้าเช็คแบบ truthy จะพลาดเคส null/ลบค่า
      // status เปลี่ยน → server เดินสถานะขั้นถัดไปอัตโนมัติ (auto-flow) ต้อง reload เห็นผลกับขั้นอื่น
      if (patch.startDate !== undefined || patch.finishDate !== undefined || patch.durationDays !== undefined || patch.predecessors !== undefined || patch.status !== undefined) { await load(); return; }
      const updated = await res.json();
      setData((d) => ({ ...d, tasks: d.tasks.map((t) => (t.id === taskId ? updated : t)) }));
    }
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
    return confirm(now
      ? "สินค้าที่ผูกเข้าข่ายสรรพสามิต (01-002)\nระบบจะเพิ่มขั้นตอนสรรพสามิตและคำนวณกำหนดการใหม่\n\nดำเนินการต่อหรือไม่?"
      : "สินค้าที่ผูกไม่เข้าข่ายสรรพสามิตแล้ว\nระบบจะลบขั้นตอนสรรพสามิตและคำนวณกำหนดการใหม่\n\nดำเนินการต่อหรือไม่?");
  };

  const addProduct = async () => {
    if (!addingProduct) return;
    const newProducts = [...(data.projectProducts || []).map(p => ({ productId: p.productId, orderQty: p.orderQty, productionQty: p.productionQty })), { productId: addingProduct, orderQty: "", productionQty: "" }];
    const cat = deriveCategoryFromProducts(newProducts.map((p) => p.productId));
    if (!confirmExciseFlip(cat)) return;
    const res = await fetch(`/api/pm/projects/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ projectProducts: newProducts, ...(cat || {}) }),
    });
    if (res.ok) { setAddingProduct(""); load(); }
    else alert((await res.json()).error || "ผูกสินค้าไม่สำเร็จ");
  };

  const removeProduct = async (productId) => {
    const newProducts = (data.projectProducts || []).filter(p => p.productId !== productId).map(p => ({ productId: p.productId, orderQty: p.orderQty, productionQty: p.productionQty }));
    const cat = deriveCategoryFromProducts(newProducts.map((p) => p.productId));
    if (!confirmExciseFlip(cat)) return;
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

  const dropProject = async () => {
    const reason = prompt("กรุณาระบุเหตุผลที่ลูกค้ายกเลิกหรือไม่ไปต่อ (เช่น ราคาแพงไป, ลูกค้าเปลี่ยนใจ, คู่แข่งได้งาน):");
    if (!reason) return;
    if (!confirm(`ต้องการยกเลิกโปรเจกต์นี้เนื่องจาก: "${reason}" ใช่หรือไม่?`)) return;
    await updateProject({ status: "Dropped", metadata: { ...(data.metadata || {}), lossReason: reason } });
  };

  const handleDeleteProject = async () => {
    if (!data) return;
    if (!confirm(`ต้องการลบโปรเจกต์ "${data.code} — ${data.name}" และขั้นตอนทั้งหมดใช่หรือไม่?`)) return;
    const res = await fetch(`/api/pm/projects/${data.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/pm/projects");
    } else {
      alert((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
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
      setTaskForm({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: [], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false });
      load();
    } else alert((await res.json()).error || "เพิ่มขั้นตอนไม่สำเร็จ");
  };

  const deleteTask = async (taskId, name) => {
    if (!confirm(`ต้องการลบขั้นตอน "${name}" ใช่หรือไม่?`)) return;
    const res = await fetch(`/api/pm/project-tasks/${taskId}`, { method: "DELETE" });
    // server ตัด predecessor ที่อ้างขั้นนี้ + เดินสถานะกราฟใหม่ → reload เห็นผลครบ
    if (res.ok) await load();
  };

  // ── งานเพิ่มเติม CRUD ──
  const openAddExtra = () => { setEditingExtraId(null); setExtraForm({ title: "", note: "", dueDate: "", assigneeId: "" }); setShowExtra(true); };
  const openEditExtra = (t) => { setEditingExtraId(t.id); setExtraForm({ title: t.title, note: t.note || "", dueDate: t.dueDate || "", assigneeId: t.assigneeId || "" }); setShowExtra(true); };
  const saveExtra = async (e) => {
    e.preventDefault();
    if (!extraForm.title.trim()) { alert("ต้องระบุชื่องาน"); return; }
    setSavingExtra(true);
    try {
      const url = editingExtraId ? `/api/pm/personal-tasks/${editingExtraId}` : "/api/pm/personal-tasks";
      const res = await fetch(url, {
        method: editingExtraId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: extraForm.title.trim(), note: extraForm.note || "",
          dueDate: extraForm.dueDate || null,
          projectId: data?.id ?? id,
          assigneeId: extraForm.assigneeId || null,
        }),
      });
      if (res.ok) { setShowExtra(false); await load(); }
      else alert((await res.json()).error || "บันทึกไม่สำเร็จ");
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setSavingExtra(false); }
  };
  const setExtraStatus = async (t, status) => {
    if (status === t.status) return;
    setData((d) => ({ ...d, personalTasks: (d.personalTasks || []).map((x) => x.id === t.id ? { ...x, status } : x) }));
    const res = await fetch(`/api/pm/personal-tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    if (!res.ok) load();
  };
  const deleteExtra = async (t) => {
    if (!confirm(`ลบงานเพิ่มเติม "${t.title}" ?`)) return;
    const res = await fetch(`/api/pm/personal-tasks/${t.id}`, { method: "DELETE" });
    if (res.ok) setData((d) => ({ ...d, personalTasks: (d.personalTasks || []).filter((x) => x.id !== t.id) }));
    else alert((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
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
  const saveEditing = async (taskId) => {
    await updateTask(taskId, {
      name: editForm.name, role: editForm.role, assignee: editForm.assignee || null,
      assigneeId: editForm.assigneeId || null,
      durationDays: Number(editForm.durationDays) || 1,
      startDate: editForm.startDate || null,
      dueDate: editForm.dueDate || null,
      isMilestone: editForm.isMilestone, phase: editForm.phase || null,
      predecessors: editForm.predecessors || [],
      note: editForm.note || "", showNoteInPrint: !!editForm.showNoteInPrint,
    });
    setEditingTaskId(null);
    setEditForm(null);
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
  const saveEditModal = async () => {
    if (!editTask) return;
    await updateTask(editTask.id, {
      name: editForm.name, role: editForm.role, assignee: editForm.assignee || null,
      assigneeId: editForm.assigneeId || null,
      durationDays: Number(editForm.durationDays) || 1,
      startDate: editForm.startDate || null,
      dueDate: editForm.dueDate || null,
      isMilestone: editForm.isMilestone, phase: editForm.phase || null,
      predecessors: editForm.predecessors || [],
      note: editForm.note || "", showNoteInPrint: !!editForm.showNoteInPrint,
    });
    closeEditModal();
  };

  const handleToggleTask = (task) => {
    if (task.status === "Pending") return;
    updateTask(task.id, { status: task.status === "Completed" ? "In Progress" : "Completed" });
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

  // ── งานเพิ่มเติม (นอกแผน, ผูกโปรเจกต์นี้) ──
  const extraTasks = data.personalTasks || [];
  const me = data.me;
  const teamMates = users.filter((u) => p.team && u.team === p.team);
  const canManageExtra = (t) => {
    if (!me) return false;
    if (t.ownerId === me.id || t.assigneeId === me.id) return true;
    if (isSuperuser(userRole)) return true;
    return userRole === "senior_ae" && me.team && p.team === me.team;
  };
  const extraAssigneeName = (t) =>
    users.find((u) => u.id === t.assigneeId)?.name
    || (t.ownerId ? `${users.find((u) => u.id === t.ownerId)?.name || "ผู้สร้าง"} (สร้าง)` : "—");

  const extraStatusControl = (t) => canManageExtra(t) ? (
    <StatusSelect value={t.status} onChange={(v) => setExtraStatus(t, v)} />
  ) : (
    <span className="status-pill dot" style={{ "--dot": taskStatusColor(t.status) }} title="เปลี่ยนสถานะได้เฉพาะเจ้าของ/ผู้รับมอบ/หัวหน้าทีม">{t.status}</span>
  );

  // section "งานเพิ่มเติม" ใช้ทั้งใน List และ Table view (ไม่เข้า Gantt/พิมพ์)
  const renderExtraSection = () => (
    <div className="glass-panel" style={{ padding: "16px 18px", marginTop: "16px", borderTop: "3px solid color-mix(in srgb, var(--purple) 40%, transparent)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", flexWrap: "wrap", marginBottom: extraTasks.length ? "12px" : "0" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
          <User size={16} color="var(--purple)" /> งานเพิ่มเติม
          <span style={{ fontSize: "11px", fontWeight: 400, color: "var(--text-3)" }}>{extraTasks.length} งาน · งานนอกแผน — ไม่เข้า Gantt</span>
        </div>
        <button onClick={openAddExtra} className="btn sm"><Plus size={14} /> เพิ่มงานเพิ่มเติม</button>
      </div>
      {extraTasks.length === 0 ? (
        <div style={{ fontSize: "12px", color: "var(--text-3)" }}>ยังไม่มีงานเพิ่มเติม — ใช้บันทึกงานตามต่อ/ขั้นตอนเสริมที่ไม่อยู่ในไทม์ไลน์ และมอบหมายให้คนในทีมได้</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: "12px" }}>
          {extraTasks.map((t) => {
            const isDoneT = t.status === "Completed";
            return (
              <div key={t.id} className="glass-panel" style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: "8px", borderLeft: `3px solid ${taskStatusColor(t.status)}`, background: "color-mix(in srgb, var(--purple) 4%, var(--panel))" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, textDecoration: isDoneT ? "line-through" : "none", color: isDoneT ? "var(--text-3)" : "var(--text)" }}>{t.title}</div>
                    {t.note && <div style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "2px" }}>{t.note}</div>}
                  </div>
                  {canManageExtra(t) && (
                    <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                      <button className="btn-icon" onClick={() => openEditExtra(t)} aria-label="แก้ไข" title="แก้ไข"><Edit2 size={14} /></button>
                      <button className="btn-icon danger" onClick={() => deleteExtra(t)} aria-label="ลบ" title="ลบ"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                  {extraStatusControl(t)}
                  <span style={{ fontSize: "11px", color: "var(--text-2)", display: "inline-flex", alignItems: "center", gap: "4px" }}><User size={12} /> {extraAssigneeName(t)}</span>
                  {t.dueDate && <span style={{ fontSize: "11px", color: "var(--text-3)", display: "inline-flex", alignItems: "center", gap: "4px" }}><Calendar size={12} /> {formatDate(t.dueDate)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderChip = (Icon, label, color) => (
    <span className="chip" style={{ color, background: `color-mix(in srgb, ${color} 10%, transparent)`, borderColor: `color-mix(in srgb, ${color} 25%, transparent)` }}>
      <Icon size={13} /> {label}
    </span>
  );

  const renderViewBtn = (mode, Icon, label) => (
    <button onClick={() => setView(mode)} className={view === mode ? "active" : ""}>
      <Icon size={14} /> {label}
    </button>
  );

  const mainCatName = (mc) => categories.find((o) => o.mainCategoryCode === (mc || "").split("-")[0])?.mainCategoryName || mc;
  // ยังไม่ผูก FG → ชื่อหมวด/หมวดรอง (resolve ชื่อหมวดหลักจากโค้ด) ใช้เป็น fallback บนหน้าพิมพ์
  const categoryFallback = p.productMainCategory ? `${mainCatName(p.productMainCategory)}${p.productSubCategory ? ` / ${p.productSubCategory}` : ""}` : "";

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
                    {actualProd.productDescription || actualProd.brandName || "-"}
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
              label: `${pr.fgCode} — ${pr.productDescription || pr.brandName || ""}`,
              search: `${pr.fgCode || ""} ${pr.productDescription || ""}`,
              render: <span><strong>{pr.fgCode}</strong> — {pr.productDescription || pr.brandName || ""}</span>,
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
          href="/pm/projects"
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
            <button className="btn-icon danger" onClick={handleDeleteProject} aria-label="ลบโปรเจกต์" title="ลบโปรเจกต์"><Trash2 size={16} /></button>
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
              <div className="segmented">
                {renderViewBtn("list", ListTodo, "List")}
                {renderViewBtn("table", Table2, "Table")}
                {renderViewBtn("document", FileText, "Gantt")}
              </div>
              <button
                onClick={() => openGanttPrintWindow({ ...p, categoryFallback })}
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
            onUpdateTask={updateTask}
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
                <button onClick={() => { setInsertAfterId(null); setInsertBeforeId(null); setTaskForm({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: processedTasks.length > 0 ? [processedTasks[processedTasks.length - 1].id] : [], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false }); setShowAddTask(true); }} className="btn btn-primary sm">
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
                    <th style={{ width: "44px", textAlign: "center" }}>#</th>
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
                            <td style={{ textAlign: "center", fontWeight: 700, color: "var(--text-3)" }}>{task.displayNumber}</td>
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
                                <StatusSelect value={task.status} onChange={(v) => updateTask(task.id, { status: v })} />
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
          {renderExtraSection()}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* title row */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>ความคืบหน้า (Progress List)</div>
            {canEdit && (
              <button onClick={() => { setInsertAfterId(null); setInsertBeforeId(null); setTaskForm({ name: "", role: "SA", phase: "", durationDays: 1, predecessors: processedTasks.length > 0 ? [processedTasks[processedTasks.length - 1].id] : [], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false }); setShowAddTask(true); }} className="btn btn-primary sm">
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
                        <button onClick={() => { setInsertAfterId(null); setInsertBeforeId(task.id); setTaskForm({ name: "", role: task.role || "SA", phase: task.phase || "", durationDays: 1, predecessors: [], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false }); setShowAddTask(true); }} style={{ background: "var(--panel)", border: "1px dashed var(--border)", color: "var(--text-3)", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5, transition: "0.2s", padding: 0 }} title="แทรกขั้นตอนก่อนหัวแถวแรกของเฟสนี้">
                          <PlusCircle size={14} />
                        </button>
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "stretch", gap: "0" }}>
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
                              <button className="btn btn-primary sm" onClick={() => saveEditing(task.id)}><Save size={14} /> บันทึก</button>
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
                                  <StatusSelect value={task.status} onChange={(v) => updateTask(task.id, { status: v })} />
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
                          <button className="btn btn-success" onClick={() => updateTask(task.id, { status: "Completed" })} style={{ fontSize: "12px" }}>✔ ทำเสร็จแล้ว</button>
                        </div>
                      )}
                    </div>
                    </div>{/* close milestone wrapper */}

                    {canEdit && !isEditing && (
                      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0", zIndex: 2 }}>
                        <button onClick={() => { setInsertBeforeId(null); setInsertAfterId(task.id); setTaskForm({ name: "", role: task.role || "SA", phase: task.phase || "", durationDays: 1, predecessors: [task.id], assignee: "", startDate: "", dueDate: "", isMilestone: false, note: "", showNoteInPrint: false }); setShowAddTask(true); }} style={{ background: "var(--panel)", border: "1px dashed var(--border)", color: "var(--text-3)", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5, transition: "0.2s", padding: 0 }} title="แทรกขั้นตอน">
                          <PlusCircle size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {renderExtraSection()}
        </div>
      )}
      </div>

      {/* Footer — ยกเลิกโปรเจกต์ (Drop) หรือ On Hold */}
      {hasWriteAccess && p.status !== "Completed" && p.status !== "Dropped" && (
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          {p.status === "On Hold" ? (
            (p.aeOwner === userName || isSuperuser(userRole)) && (
              <button type="button" className="btn btn-primary" onClick={() => updateProject({ status: "In Progress" })}>
                <CheckCircle2 size={14} /> ดึงกลับมาดำเนินการ (Restore)
              </button>
            )
          ) : (
            <>
              <button type="button" className="btn btn-warning" onClick={() => updateProject({ status: "On Hold" })}>
                <Clock size={14} /> ระงับชั่วคราว (On Hold)
              </button>
              <button type="button" className="btn btn-danger" onClick={dropProject}>
                <X size={14} /> ยกเลิกโปรเจกต์ (Drop)
              </button>
            </>
          )}

          {p.status === "On Hold" && (
            <button type="button" className="btn btn-danger" onClick={dropProject}>
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
                <Select fullWidth value={taskForm.role} onChange={(e) => setTaskForm((f) => ({ ...f, role: e.target.value }))}>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
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
              <input list="phase-list" value={taskForm.phase} onChange={(e) => setTaskForm((f) => ({ ...f, phase: e.target.value }))} className="premium-input w-full" placeholder="เลือกหรือพิมพ์เฟสใหม่" />
              <datalist id="phase-list">{formPhases.map((ph) => <option key={ph} value={ph} />)}</datalist>
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
          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {renderStepEditFields(editTask.id)}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "4px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-secondary sm" onClick={closeEditModal}>ยกเลิก</button>
              <button className="btn btn-primary sm" onClick={saveEditModal}><Save size={14} /> บันทึก</button>
            </div>
          </div>
        )}
      </Modal>

      {/* งานเพิ่มเติม modal — สร้าง/แก้งานนอกแผนที่ผูกโปรเจกต์นี้ (assign ในทีมได้) */}
      <Modal open={showExtra} onClose={() => setShowExtra(false)} title={editingExtraId ? "แก้ไขงานเพิ่มเติม" : "เพิ่มงานเพิ่มเติม"} size="md">
        <form onSubmit={saveExtra}>
          <div className="grid gap-[14px]">
            <div className="form-group">
              <label>ชื่องาน <span className="text-[var(--red)]">*</span></label>
              <input value={extraForm.title} onChange={(e) => setExtraForm((f) => ({ ...f, title: e.target.value }))} required className="premium-input w-full" placeholder="เช่น ตามเอกสารจากลูกค้า, นัดประชุมเพิ่ม" />
            </div>
            <div className="form-group">
              <label>รายละเอียด</label>
              <textarea value={extraForm.note} onChange={(e) => setExtraForm((f) => ({ ...f, note: e.target.value }))} className="premium-input w-full" rows={2} placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)" />
            </div>
            <div className="pm-form-grid gap-3">
              <div className="form-group">
                <label>กำหนดส่ง</label>
                <input type="date" value={extraForm.dueDate} onChange={(e) => setExtraForm((f) => ({ ...f, dueDate: e.target.value }))} className="premium-input w-full" />
              </div>
              <div className="form-group">
                <label>มอบหมายให้ <span className="text-[11px] text-[var(--text-3)] font-normal">(คนในทีม)</span></label>
                <Select fullWidth value={extraForm.assigneeId} onChange={(e) => setExtraForm((f) => ({ ...f, assigneeId: e.target.value }))}>
                  <option value="">— ไม่มอบหมาย (ของฉัน) —</option>
                  {teamMates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
                {p.team && teamMates.length === 0 && <div className="text-[11px] text-[var(--text-3)] mt-1">ไม่มีสมาชิกในทีมนี้ให้มอบหมาย</div>}
              </div>
            </div>
            <div style={{ fontSize: "11px", color: "var(--text-3)", display: "flex", alignItems: "center", gap: "4px" }}>
              <AlertTriangle size={11} /> งานเพิ่มเติมเป็นงานนอกแผน — ไม่เข้า Gantt และไม่กระทบการคำนวณกำหนดการ
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowExtra(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={savingExtra} className="btn btn-primary px-8">{editingExtraId ? "บันทึก" : "เพิ่ม"}</button>
          </div>
        </form>
      </Modal>

      {showEditProject && (
        <ProjectFormModal
          open={showEditProject}
          onClose={() => setShowEditProject(false)}
          editingId={p.id}
          initialData={p}
          onSuccess={() => {
            // บั๊ก D: หลังแก้โปรเจกต์ (อาจ resync ขั้นตอนสรรพสามิตใน DB) ต้อง reload
            // ทั้งก้อน — PATCH คืนแค่แถว project ไม่มี tasks ที่เปลี่ยน
            setShowEditProject(false);
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
          onSave={(predecessors) => { updateTask(depPopover.task.id, { predecessors }); setDepPopover(null); }}
        />
      )}
    </div>
  );
}
