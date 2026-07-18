"use client";
import DateInput from "@/components/ui/DateInput";
import { useState, useEffect, useCallback, useMemo, Fragment, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft, Plus, PlusCircle, X, Flag, FileText, GanttChart,
  ListTodo, AlertTriangle, CheckCircle2, Clock, Calendar,
  TrendingUp, Edit2, Trash2, ChevronDown, ChevronRight, ChevronUp,
  Activity, BriefcaseBusiness, Building2, CircleDashed, Pause,
  Check, Printer, Table2, Filter, User, FolderX,
  GitCommit, History, RotateCcw, ShieldCheck, PackageCheck, ExternalLink,
} from "lucide-react";
import { useCan, useRole } from "@/lib/roleContext";
import { isSuperuser } from "@/lib/permissions";
import Modal from "@/components/Modal";
import StepFormFields, { EMPTY_STEP_FORM, stepToForm } from "@/components/pm/StepFormFields";
import ProjectDocumentView from "@/components/pm/ProjectDocumentView";
import ProjectDealsHub, { ProjectActivityFeed, ProjectQuotationsCard } from "@/components/pm/ProjectDealsHub";
import SalesProjectCreateModal from "@/components/pm/SalesProjectCreateModal";
import TimelineWorkspace from "@/components/pm/TimelineWorkspace";
import { PredecessorPopover } from "@/components/pm/PredecessorPicker";
import Select from "@/components/ui/Select";
import SortControl from "@/components/ui/SortControl";
import StatusSelect, { TASK_STATUS_META, taskStatusColor } from "@/components/pm/StatusSelect";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import SearchableSelect from "@/components/ui/SearchableSelect";
import { productSelectOptions } from "@/components/master/productOption";
import { cachedFetchJson } from "@/lib/apiCache";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/tax/ConfirmModal";
import { setHolidays, countBusinessDays, isBusinessDay, toLocalISODate } from "@/lib/pm/dateHelpers";
import { computeFinish, durationFromDates } from "@/lib/pm/stepSchedule";
import { openGanttPrintWindow } from "@/lib/pm/ganttPrint";
import { entityCodeDisplay } from "@/lib/entityCode";
import { getComputedStatus, statusDotColor } from "@/lib/pm/derived";
import { PROJECT_CLOSE_STATUS_LABELS, PROJECT_CLOSE_TYPE_LABELS, PROJECT_CLOSE_TYPES } from "@/lib/pm/projectClose";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { fmtDateTime } from "@/lib/format";
import SalesDetailTabs from "@/components/salesPlanning/SalesDetailTabs";
import InquiryListCard from "@/components/salesPlanning/InquiryListCard";
import SalesDetailOverview, { SalesStateBadge } from "@/components/salesPlanning/SalesDetailOverview";
import { ContextCard, ContextGrid } from "@/components/ui/DetailPage";
import MultiSelectFilter from "@/components/ui/MultiSelectFilter";
import { detailTabFromSearch } from "@/lib/salesDetailTabs";
import { TIMELINE_CENTRAL, filterTimelineTasks, singleSelectedDeal } from "@/lib/pm/timelineFilter";
import { compactPersonName } from "@/lib/personName";
import { brandDisplayFromList } from "@/lib/master/brands";
import { SaPageShell } from "@/components/salesPlanning/SaWorkspace";

const STATUS_TH = {
  New: "ใหม่ (New)", "In Progress": "ดำเนินการ (Active)", Completed: "เสร็จสิ้น (Completed)",
  "On Hold": "ระงับ (On Hold)", Dropped: "ยกเลิก (Dropped)",
};



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
  const hasEditCap = useCan("salesplan:edit");
  const canCreateTaxRegistration = useCan("products:edit");
  const userRole = useRole();
  // ชื่อผู้ใช้ปัจจุบัน — ใช้เทียบกับ aeOwner ซึ่งเก็บเป็นข้อความ ไม่ใช่ id (แบบเดียวกับฟอร์มโครงการ)
  const [myName, setMyName] = useState("");
  useEffect(() => { try { setMyName(localStorage.getItem("userName") || ""); } catch { /* ssr */ } }, []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [users, setUsers] = useState([]);
  const [addingProduct, setAddingProduct] = useState("");
  // มุมมองสลับอัตโนมัติตามจอ: จอตั้ง → List, จอนอน → Table; Gantt (document) เลือกเองได้
  const [view, setView] = useResponsiveView({ portrait: "list", landscape: "table" }); // list | table | document
  // เมนูครอบ (มติผู้ใช้): เปิดมาเจอ "ภาพรวม" (ศูนย์รวมดีล) ก่อน — กดเข้าไทม์ไลน์อีกชั้น
  // ถึงเห็นตารางขั้นตอน. sync กับ ?tab=timeline เพื่อให้ refresh/แชร์ลิงก์ค้างแท็บเดิม.
  const [tab, setTab] = useState("overview");
  useEffect(() => {
    setTab(detailTabFromSearch(window.location.search));
  }, []);
  const switchTab = (t) => {
    setTab(t);
    if (t === "tasks") setView("table");
    const url = new URL(window.location.href);
    if (t !== "overview") url.searchParams.set("tab", t);
    else url.searchParams.delete("tab");
    window.history.replaceState(null, "", url);
  };
  const [showAddTask, setShowAddTask] = useState(false);
  const [showEditProject, setShowEditProject] = useState(false);
  const [taskForm, setTaskForm] = useState({ ...EMPTY_STEP_FORM });
  const [collapsedPhases, setCollapsedPhases] = useState(() => new Set());
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const [insertAfterId, setInsertAfterId] = useState(null); // บั๊ก C: แทรกขั้นตอนตรงตำแหน่ง
  const [insertBeforeId, setInsertBeforeId] = useState(null); // แทรก "ก่อน" หัวแถวแรกของเฟส
  const [tableStatusFilter, setTableStatusFilter] = useState("all"); // Table view: all | pending | progress | completed
  const [tableSort, setTableSort] = useState("step"); // Table view: step | name | status | due
  const [timelineDealFilters, setTimelineDealFilters] = useState([]);
  const [taskDealFilters, setTaskDealFilters] = useState([]);
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
  const [showDrop, setShowDrop] = useState(false); // modal ยกเลิกโครงการ (แทน window.prompt)
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

  // เฟส F — อนุมัติปิดโครงการ (มติ 2026-07-18)
  const [closeBusy, setCloseBusy] = useState("");
  const [closeReqForm, setCloseReqForm] = useState(null); // { closeType, reason } เมื่อเปิด modal ขอปิด
  const closeAction = useCallback(async (action, payload = {}) => {
    setCloseBusy(action);
    try {
      const res = await fetch(`/api/pm/projects/${id}/close`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...payload }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { alert(d.error || "ทำรายการไม่สำเร็จ"); return false; }
      await load();
      return true;
    } finally { setCloseBusy(""); }
  }, [id, load]);
  const submitCloseRequest = async () => {
    if (!closeReqForm?.closeType) { alert("เลือกประเภทการปิด"); return; }
    if (!closeReqForm.reason.trim()) { alert("ระบุเหตุผล/สรุปการปิด"); return; }
    const ok = await closeAction("request", { closeType: closeReqForm.closeType, reason: closeReqForm.reason.trim() });
    if (ok) setCloseReqForm(null);
  };
  const promptReopen = async () => {
    const reason = window.prompt("เหตุผลที่เปิดโครงการใหม่ (เช่น RE-ORDER ลูกค้ากลับมา)")?.trim();
    if (reason) await closeAction("reopen", { reason });
  };
  const promptReject = async () => {
    const reason = window.prompt("เหตุผลที่ตีกลับคำขอปิด")?.trim();
    if (reason) await closeAction("reject", { reason });
  };

  useEffect(() => {
    cachedFetchJson("/api/customers").then((d) => setCustomers(d || [])).catch(() => {});
    cachedFetchJson("/api/product-types").then((d) => setCategories(d || [])).catch(() => {});
    cachedFetchJson("/api/pm/assignable-users").then((d) => setUsers(d || [])).catch(() => {});
    // โหลดปฏิทินวันหยุดจริงให้ฝั่ง client (Gantt/Document view นับวันทำการถูกต้อง)
    cachedFetchJson("/api/holidays").then((d) => {
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
        setToast({ kind: "error", msg: payload.error || "สร้างทะเบียนภาษีจากโครงการไม่สำเร็จ" });
        return;
      }
      setToast({ kind: "success", msg: `สร้างทะเบียนภาษี ${payload.fgCode || ""} แล้ว` });
      router.push(`/tax/registrations/${payload.id}`);
    } finally {
      setCreatingTaxReg(false);
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
      // (เร็วกว่างานก่อนหน้า/วันเริ่มโครงการไม่ได้ หรือไม่ใช่วันทำการ → เลื่อนไปวันที่ทำได้)
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
      setToast({ kind: "info", msg: `ปักวันเริ่มไม่ได้ตามที่เลือก ${clamped} ขั้น — วันเริ่มต้องไม่เร็วกว่างานก่อนหน้า/วันเริ่มโครงการ และต้องเป็นวันทำการ (ระบบเลื่อนไปวันที่ใกล้สุดที่ทำได้). โครงการย้อนหลังให้ตั้ง “วันเริ่มโครงการ” ก่อน` });
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
    if (!(await askConfirm({ title: "ลบโครงการ", message: `ต้องการลบโครงการ "${data.code} — ${data.name}" และขั้นตอนทั้งหมดใช่หรือไม่?`, confirmLabel: "ลบ" }))) return;
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
    const anchorTask = allTasks.find((task) => task.id === (afterTaskId || insertBeforeId));
    const newTaskDealId = anchorTask
      ? (anchorTask.dealId || null)
      : singleSelectedDeal(timelineDealFilters);
    const res = await fetch("/api/pm/project-tasks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // URL may be a project code; tasks FK the internal id, so use the loaded row's id.
        projectId: data?.id ?? id,
        // เมื่อกำลังดู segment ของดีลใด ขั้นตอนใหม่ต้องอยู่ใต้ดีลนั้น ไม่ปนเป็นงานกลาง
        dealId: newTaskDealId,
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
      setTaskForm({ ...EMPTY_STEP_FORM });
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
    // กรองเฉพาะดีลแล้วไม่ให้ reorder เพราะ API เรียงทั้งโครงการ; ป้องกัน segment
    // ที่ซ่อนอยู่ถูกย้ายลำดับโดยผู้ใช้มองไม่เห็น
    if (!canReorderTimeline) return null;
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

  const startEditing = (task) => {
    setEditingTaskId(task.id);
    setEditForm(stepToForm(task));
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
    setEditForm(stepToForm(task));
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

  const allTasks = useMemo(() => data?.tasks || [], [data?.tasks]);
  const tasks = useMemo(
    () => filterTimelineTasks(allTasks, timelineDealFilters),
    [allTasks, timelineDealFilters],
  );
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
  // โครงการกำพร้า (ไม่มีดีล) ไม่มีอะไรให้ดูในภาพรวม — เข้าไทม์ไลน์ตรงเหมือนเดิม
  const showTimeline = tab === "timeline";
  const projectBrand = brandDisplayFromList(customers.find((customer) => customer.id === p.customerId)?.brands, p.metadata?.brand) || "-";
  const projectTitle = p.name && projectBrand !== "-" && !p.name.includes("/") ? `${p.name} / ${projectBrand}` : (p.name || "โครงการ");
  const hasWriteAccess = hasEditCap && !!data.canEdit;
  const isLocked = p.status === "On Hold" || p.status === "Dropped" || p.status === "Completed";
  const canEdit = hasWriteAccess && !isLocked;
  const canReorderTimeline = canEdit && timelineDealFilters.length === 0;
  const canAddTimelineTask = canEdit && timelineDealFilters.length <= 1;
  const linkedIds = new Set((p.projectProducts || []).map((x) => x.productId));
  // แนะนำสร้างทะเบียนภาษีเฉพาะเมื่อ (1) ดีลที่ผูก won แล้ว (โครงการที่ไม่ได้มาจากดีล
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
  const timelineFilterOptions = [
    ...(p.deals || []).map((deal) => ({
      value: deal.id,
      label: `${deal.title} (${allTasks.filter((task) => task.dealId === deal.id).length} ขั้นตอน)`,
    })),
    ...(allTasks.some((task) => !task.dealId) ? [{
      value: TIMELINE_CENTRAL,
      label: `งานกลางโครงการ (${allTasks.filter((task) => !task.dealId).length} ขั้นตอน)`,
    }] : []),
  ];
  const projectPersonalTasks = p.personalTasks || [];
  const shownPersonalTasks = taskDealFilters.length
    ? projectPersonalTasks.filter((task) => taskDealFilters.includes(task.dealId))
    : projectPersonalTasks;
  const projectTaskFilterOptions = (p.deals || []).map((deal) => ({
    value: deal.id,
    label: `${deal.title} (${projectPersonalTasks.filter((task) => task.dealId === deal.id).length} งาน)`,
  }));
  const completedPersonalTasks = shownPersonalTasks.filter((task) => task.status === "Completed").length;

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
            entity="product"
            size="sm"
            options={productSelectOptions(allProducts.filter(pr => !linkedIds.has(pr.id)))}
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
    <SaPageShell>
      {/* Top Header Section */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", flexWrap: "wrap", gap: "12px" }}>
        <Link
          href="/sa/projects"
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
          <ArrowLeft size={16} /> กลับไปหน้ารวมโครงการ
        </Link>
        
        {canEdit && (
          <div style={{ display: "flex", gap: "8px" }}>
            <button className="btn-icon" onClick={() => setShowEditProject(true)} aria-label="แก้ไขโครงการ" title="แก้ไขโครงการ"><Edit2 size={16} /></button>
            {/* Sales เป็นแม่: โครงการที่ผูกงานขายต้องลบที่หน้าบริหารงานขาย (ลบทั้งสาย).
                โครงการกำพร้า (ยังไม่ผูกดีล) ลบตรงนี้ได้ตามเดิม. */}
            {data.dealId ? (
              <Link className="btn-icon" href={`/sales-planning/deals/${data.dealId}`} aria-label="จัดการที่หน้าบริหารงานขาย" title="โครงการนี้ผูกงานขาย — ลบ/จัดการที่หน้าบริหารงานขาย"><ExternalLink size={16} /></Link>
            ) : (
              <button className="btn-icon danger" onClick={handleDeleteProject} aria-label="ลบโครงการ" title="ลบโครงการ"><Trash2 size={16} /></button>
            )}
          </div>
        )}
      </div>

      <SalesDetailOverview
        eyebrow="รายละเอียดโครงการ"
        title={projectTitle}
        description={<>
          <span className="mono" style={{ fontWeight: 700, color: "var(--text)" }}>{entityCodeDisplay(p.code, p.currentRev)}</span>
          <span>ลูกค้า: {p.customerName || "-"}</span>
          <span>แบรนด์: {projectBrand}</span>
          {p.productMainCategory ? <span>หมวดสินค้า: {`${mainCatName(p.productMainCategory)}${p.productSubCategory ? ` / ${p.productSubCategory}` : ""}`}</span> : null}
        </>}
        badges={<>
          <SalesStateBadge label={getComputedStatus(p)} color={statusDotColor(getComputedStatus(p))} />
          {p.closeStatus === "pending_close" && <span className="ui-badge" style={{ color: "var(--amber)" }}>รออนุมัติปิด · {PROJECT_CLOSE_TYPE_LABELS[p.closeType] || ""}</span>}
          {p.closeStatus === "closed" && <span className="ui-badge" style={{ color: "var(--text-3)" }}>ปิดแล้ว · {PROJECT_CLOSE_TYPE_LABELS[p.closeType] || ""}</span>}
        </>}
        actions={!showTimeline ? <button type="button" className="btn btn-primary" onClick={() => switchTab("timeline")}><GanttChart size={14} /> เปิดไทม์ไลน์</button> : null}
        facts={[
          { icon: Calendar, label: "วันเริ่ม", value: p.startDate || "-" },
          { icon: Clock, label: "วันสิ้นสุด", value: p.dueDate || "-" },
          { icon: User, label: "AE / ทีม", value: `${p.aeOwner || "-"} · ${p.team || "-"}` },
          { icon: GanttChart, label: "จำนวนดีล", value: `${(p.deals || []).length} ดีล` },
        ]}
      />

      {tab === "overview" && (() => {
        const cs = p.closeStatus || "open";
        const isRequester = p.me?.id && p.closeRequestedBy === p.me.id;
        const canReqClose = hasEditCap && p.canEdit && cs === "open";
        const canApprove = p.canApproveClose && cs === "pending_close" && !isRequester;
        // แสดงการ์ดเฉพาะเมื่อมีอะไรให้ทำ/แสดง (open+แก้ได้ / รออนุมัติ / ปิดแล้ว)
        if (cs === "open" && !canReqClose) return null;
        return (
          <div className="glass-panel" style={{ marginTop: 16, padding: "12px 16px", display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, justifyContent: "space-between", borderColor: cs === "pending_close" ? "var(--amber)" : cs === "closed" ? "var(--border)" : "var(--border)" }}>
            <div style={{ fontSize: 13 }}>
              <strong>สถานะการปิดโครงการ:</strong> {PROJECT_CLOSE_STATUS_LABELS[cs]}
              {cs !== "open" && p.closeType ? ` · ${PROJECT_CLOSE_TYPE_LABELS[p.closeType]}` : ""}
              {cs === "pending_close" && p.closeRequestedByName ? <span style={{ color: "var(--text-3)" }}> · ขอโดย {p.closeRequestedByName}</span> : null}
              {cs === "closed" && p.closedByName ? <span style={{ color: "var(--text-3)" }}> · อนุมัติโดย {p.closedByName}</span> : null}
              {p.closeReason ? <div style={{ color: "var(--text-2)", marginTop: 2 }}>{p.closeReason}</div> : null}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {canReqClose && <button type="button" className="btn" disabled={!!closeBusy} onClick={() => setCloseReqForm({ closeType: "completed", reason: "" })}>ขอปิดโครงการ</button>}
              {cs === "pending_close" && isRequester && <button type="button" className="btn ghost" disabled={!!closeBusy} onClick={() => closeAction("cancel_request")}>ถอนคำขอ</button>}
              {canApprove && <><button type="button" className="btn btn-primary" disabled={!!closeBusy} onClick={() => closeAction("approve")}>อนุมัติปิด</button><button type="button" className="btn danger" disabled={!!closeBusy} onClick={promptReject}>ตีกลับ</button></>}
              {cs === "pending_close" && p.canApproveClose && isRequester && <span className="ui-badge" style={{ color: "var(--text-3)" }}>คำขอของคุณ ต้องให้ผู้อนุมัติคนอื่น</span>}
              {cs === "closed" && p.canApproveClose && <button type="button" className="btn" disabled={!!closeBusy} onClick={promptReopen}>เปิดโครงการใหม่ (RE-ORDER)</button>}
            </div>
          </div>
        );
      })()}

      {tab === "overview" && <div style={{ marginTop: 16 }}><ContextGrid>
        <ContextCard
          icon={Building2}
          href={p.customerId ? `/database/customers/${p.customerId}` : undefined}
          eyebrow="ลูกค้าของโครงการ"
          title={p.customerName || "ยังไม่ผูกลูกค้า"}
          subtitle={projectBrand ? `แบรนด์ ${projectBrand}` : "ยังไม่ระบุแบรนด์"}
          badges={<>{p.team && <span className="ui-badge">ทีม {p.team}</span>}{p.aeOwner && <span className="ui-badge" style={{ color: "var(--accent)" }}>AE {p.aeOwner}</span>}</>}
          facts={[
            { label: "ประเภทโครงการ", value: p.type || "-" },
            { label: "กำหนดเสร็จ", value: p.dueDate || "-" },
          ]}
        />
        {(p.deals || []).slice(0, 3).map((deal) => <ContextCard
          key={deal.id}
          icon={BriefcaseBusiness}
          href={`/sales-planning/deals/${deal.id}`}
          eyebrow="ดีลในโครงการ"
          title={deal.title}
          subtitle={deal.formulaName || deal.dealType || "เปิดดูรายละเอียดดีล"}
          badges={<>{deal.dealType && <span className="ui-badge">{deal.dealType}</span>}{deal.stage && <span className="ui-badge" style={{ color: deal.stage === "won" ? "var(--green)" : "var(--accent)" }}>{deal.stage}</span>}</>}
          facts={[
            { label: "เดือน Forecast", value: deal.forecastMonth || "-" },
            { label: "มูลค่า", value: Number(deal.wonValue ?? deal.projectValue ?? 0).toLocaleString("th-TH") },
          ]}
        />)}
        {!(p.deals || []).length && <ContextCard icon={BriefcaseBusiness} eyebrow="ดีลในโครงการ" title="ยังไม่มีดีลที่เชื่อมอยู่" subtitle="เชื่อมดีลจากหน้าบริหารงานขายเพื่อรวมข้อมูลการขายและการส่งมอบ" />}
      </ContextGrid></div>}

      <div style={{ marginTop: 20 }}>
        <SalesDetailTabs value={tab} onChange={switchTab} label="ส่วนของโครงการ" />
      </div>

      {/* เครื่องมือเอกสารขั้นสูง แสดงเมื่อเปิดส่วนไทม์ไลน์ */}
      <div className="glass-panel" style={{ padding: 16, margin: "16px 0 24px", display: showTimeline ? "block" : "none" }}>
        <div>
          <div className="timeline-header-row">
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
              <GanttChart size={17} aria-hidden="true" />
              <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>ไทม์ไลน์</h2>
            </div>
            <div className="project-detail-actions">
              {!showTimeline ? (
                <button type="button" className="btn btn-primary" onClick={() => switchTab("timeline")} style={{ whiteSpace: "nowrap" }}>
                  <GanttChart size={14} /> เปิดไทม์ไลน์
                </button>
              ) : (
              <>
              <div className="project-detail-action-row">
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
                  title="สร้างทะเบียนภาษี draft จาก FG หมวดสรรพสามิต (01-002) ในโครงการนี้"
                >
                  <ShieldCheck size={14} /> {creatingTaxReg ? "กำลังสร้าง..." : "สร้างทะเบียนภาษี"}
                </button>
              )}

              <button onClick={openRevisions} className="btn" style={{ whiteSpace: "nowrap" }} title="ดู/พิมพ์เวอร์ชันเอกสารที่เคยออก">
                <History size={14} /> ประวัติเวอร์ชัน
              </button>
              <button
                onClick={() => openGanttPrintWindow({ ...p, tasks, categoryFallback,
                  ...resolveAe(p.aeOwner),
                  projectProducts: enrichProducts(p.projectProducts),
                  // ถ้า live ถูกแก้หลังออก Rev (revStale) อย่าปั๊มเลข Rev ทางการทับเนื้อหาที่ต่าง —
                  // พิมพ์เป็น "ฉบับร่าง" (ไม่มีเลข/วันที่ Rev). พิมพ์เวอร์ชันทางการแท้ใช้ปุ่มในประวัติ.
                  rev: p.revStale ? null : p.currentRev,
                  revDate: p.revStale ? null : p.revisedAt })}
                className="btn btn-primary"
                style={{ whiteSpace: "nowrap" }}
                title="เปิดเอกสาร A4 สำหรับพิมพ์ / บันทึก PDF"
              >
                <Printer size={14} /> พิมพ์เอกสาร
              </button>
              </div>
              <div className="project-detail-action-row"><ViewSwitcher value={view} onChange={setView} modes={["list", "table", "document"]} /></div>
              </>
              )}
            </div>
          </div>
        </div>

        {/* โชว์ตั้งแต่มีดีลเดียว (มติผู้ใช้ 2026-07-18: "ปุ่มเลือกดีลหาย") — มีดีลเดียวก็ยัง
            มีตัวเลือก "งานกลางโครงการ" ให้สลับดูได้ */}
        {(p.deals || []).length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>ไทม์ไลน์ที่แสดง</div>
              <div style={{ fontSize: 11.5, color: "var(--text-3)", marginTop: 2 }}>เลือกได้หลายดีล · ไม่เลือก = แสดงทั้งหมด</div>
            </div>
            <div style={{ marginLeft: "auto" }}>
              <MultiSelectFilter label="ดีลที่แสดง" selected={timelineDealFilters} onChange={setTimelineDealFilters} options={timelineFilterOptions} />
            </div>
            {timelineDealFilters.length > 0 && <span className="ui-badge" style={{ color: "var(--accent)", whiteSpace: "nowrap" }}>กำลังแสดง {tasks.length} ขั้นตอน</span>}
            {timelineDealFilters.length > 1 && <span style={{ fontSize: 11.5, color: "var(--text-3)" }}>เลือกเหลือ 1 ดีลก่อนเพิ่มขั้นตอนใหม่</span>}
          </div>
        )}

        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid var(--border)", opacity: isLocked ? 0.6 : 1, filter: isLocked ? "grayscale(50%)" : "none", transition: "all 0.3s", pointerEvents: isLocked ? "none" : "auto" }}>
          <TimelineWorkspace
            tasks={tasks}
            canEdit={canEdit}
            canAdd={canAddTimelineTask}
            canReorder={canReorderTimeline}
            dealId={singleSelectedDeal(timelineDealFilters)}
            projectId={p.id}
            view={view}
            onViewChange={setView}
            showHeading={false}
            showViewSwitcher={false}
            documentProject={{ ...p, tasks }}
            canEditProjectFields={canEdit}
            onUpdateProject={updateProject}
            timelineContext={{
              name: p.name,
              customerName: p.customerName,
              startDate: p.startDate,
              brand: p.metadata?.brand,
              status: getComputedStatus(p),
              statusLabel: getComputedStatus(p),
              statusColor: statusDotColor(getComputedStatus(p)),
            }}
            onChanged={load}
            onError={(message) => setToast({ kind: "error", msg: message })}
          />
        </div>

        </div>

      {/* ภาพรวม — ศูนย์รวมโครงการ: จิ๊กซอว์ครอบดีล (KPI rollup + การ์ดต่อดีล) */}
      {tab === "overview" && (
        <>
          <ProjectDealsHub project={p} onChanged={load} />
          {/* การ์ดเมนูไทม์ไลน์ — เลือกหลายดีลจากภาพรวม แล้วเปิดเข้าไปด้วย filter ชุดเดิม */}
          <div
            className="glass-panel"
            style={{ padding: "16px 20px", marginBottom: 24, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
          >
            <span style={{ background: "var(--accent)", color: "#fff", padding: 8, borderRadius: 10, display: "flex", flexShrink: 0 }}>
              <GanttChart size={18} />
            </span>
            <div style={{ minWidth: 160 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>ไทม์ไลน์โครงการ</div>
              <div style={{ fontSize: 12.5, color: "var(--text-3)", marginTop: 2 }}>
                {(() => {
                  const doing = tasks.filter((t) => t.status === "In Progress").map((t) => t.name);
                  return doing.length ? `กำลังทำ: ${doing.slice(0, 2).join(", ")}${doing.length > 2 ? ` +${doing.length - 2}` : ""}` : (timelineDealFilters.length ? "ไม่มีขั้นตอนที่กำลังทำในดีลที่เลือก" : "ขั้นตอนทั้งหมดของทุกดีลรวมในผืนเดียว");
                })()}
              </div>
            </div>
            <div style={{ flex: 1, minWidth: 140, display: "flex", alignItems: "center", gap: 10 }}>
              {(() => {
                const total = tasks.length;
                const done = tasks.filter((t) => t.status === "Completed").length;
                return (
                  <>
                    <div className="progress" style={{ flex: 1 }} role="progressbar" aria-valuenow={done} aria-valuemax={total} aria-label="ความคืบหน้าไทม์ไลน์">
                      <span className={total && done === total ? "done" : undefined} style={{ width: total ? `${Math.round((done / total) * 100)}%` : 0 }} />
                    </div>
                    <span className="mono tabular-nums" style={{ fontSize: 13, color: "var(--text-2)", whiteSpace: "nowrap" }}>{done}/{total} ขั้นตอน</span>
                  </>
                );
              })()}
            </div>
            <div className="project-timeline-card-actions">
              {(p.deals || []).length > 0 && (
                <MultiSelectFilter
                  label="ดีลที่แสดง"
                  selected={timelineDealFilters}
                  onChange={setTimelineDealFilters}
                  options={timelineFilterOptions}
                />
              )}
              <button type="button" className="btn btn-primary" onClick={() => switchTab("timeline")} style={{ whiteSpace: "nowrap" }}>
                <GanttChart size={14} /> เปิดไทม์ไลน์
              </button>
            </div>
          </div>
        </>
      )}

      {(tab === "overview" || tab === "quotations") && <ProjectQuotationsCard project={p} />}

      {(tab === "overview" || tab === "inquiries") && <InquiryListCard inquiries={p.inquiries || []} title="สอบถาม RD ของโครงการและดีล" />}

      {(tab === "overview" || tab === "tasks") && (
        <section className="glass-panel" style={{ padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
            <ListTodo size={18} />
            <div>
              <h2 style={{ margin: 0, fontSize: 16 }}>งานของโครงการ</h2>
              <div style={{ marginTop: 2, fontSize: 12, color: "var(--text-3)" }}>ดึงงานจาก /sa/tasks ตามดีลที่ผูกกับโครงการ</div>
            </div>
            <span className="ui-badge" style={{ color: "var(--text-2)" }}>{completedPersonalTasks}/{shownPersonalTasks.length} เสร็จ</span>
            <div style={{ marginLeft: "auto" }}>
              {projectTaskFilterOptions.length > 1 && <MultiSelectFilter label="ดีลที่แสดง" selected={taskDealFilters} onChange={setTaskDealFilters} options={projectTaskFilterOptions} />}
            </div>
            <Link className="btn ghost sm" href={taskDealFilters.length === 1 ? `/sa/tasks?dealId=${taskDealFilters[0]}` : "/sa/tasks"}><ExternalLink size={13} /> เปิดหน้างาน</Link>
          </div>
          {shownPersonalTasks.length ? (
            <div className="premium-glass-table table-responsive">
              <table className="premium-table">
                <thead><tr><th>งาน</th><th>ดีล</th><th>สถานะ</th><th>ผู้รับผิดชอบ</th><th>กำหนดเสร็จ</th></tr></thead>
                <tbody>{shownPersonalTasks.map((task) => {
                  const deal = (p.deals || []).find((item) => item.id === task.dealId);
                  const assignee = users.find((user) => user.id === (task.assigneeId || task.ownerId));
                  return <tr key={task.id} className="premium-row">
                    <td style={{ fontWeight: 700 }}>{task.title}{task.note && <div style={{ color: "var(--text-3)", fontSize: 12, fontWeight: 400, marginTop: 2 }}>{task.note}</div>}</td>
                    <td>{deal ? <Link className="linklike" href={`/sales-planning/deals/${deal.id}`}>{deal.title}</Link> : <span style={{ color: "var(--text-3)" }}>งานเดิมของโครงการ</span>}</td>
                    <td><span className="status-pill dot" style={{ "--dot": taskStatusColor(task.status) }}>{TASK_STATUS_META[task.status]?.full || task.status}</span></td>
                    <td>{assignee?.name || task.assigneeName || task.ownerName || "-"}</td>
                    <td>{task.dueDate || "-"}</td>
                  </tr>;
                })}</tbody>
              </table>
            </div>
          ) : <EmptyState icon={ListTodo}>ยังไม่มีงานจากดีลที่เลือก</EmptyState>}
        </section>
      )}

      {p.status === "Dropped" && (
        <div style={{ marginBottom: "24px", padding: "18px 24px", background: "color-mix(in srgb, var(--red) 15%, transparent)", border: "1px solid color-mix(in srgb, var(--red) 40%, transparent)", borderRadius: "12px", borderLeft: "5px solid var(--red)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px", zIndex: 10, position: "relative" }}>
          <div>
            <div style={{ color: "var(--red)", fontWeight: 800, fontSize: "14px", display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}><X size={16} strokeWidth={3} /> โครงการนี้ถูกยกเลิกแล้ว</div>
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

      {showTimeline && (
      <>
      <div style={{ opacity: isLocked ? 0.6 : 1, filter: isLocked ? "grayscale(50%)" : "none", transition: "all 0.3s", pointerEvents: isLocked ? "none" : "auto" }}>
      {false && (<>
      {view === "document" ? (
        <div className="glass-panel" style={{ padding: "20px", marginBottom: "24px" }}>
          <ProjectDocumentView
            project={{ ...p, tasks }}
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
              <SortControl
                value={tableSort}
                onChange={(event) => setTableSort(event.target.value)}
                options={[{ value: "step", label: "ลำดับขั้นตอน" }, { value: "due", label: "วันเสร็จ" }, { value: "status", label: "สถานะ" }, { value: "name", label: "ชื่อขั้นตอน" }]}
                title="เรียงลำดับ (ภายในแต่ละเฟส)"
              />
              {canAddTimelineTask && (
                <button onClick={() => { setInsertAfterId(null); setInsertBeforeId(null); setTaskForm({ ...EMPTY_STEP_FORM, predecessors: processedTasks.length > 0 ? [processedTasks[processedTasks.length - 1].id] : [] }); setShowAddTask(true); }} className="btn btn-primary sm">
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
              <table className="premium-table timeline-task-table">
                <colgroup>
                  <col style={{ width: 32 }} />
                  <col style={{ width: 52 }} />
                  <col className="timeline-col-task" />
                  <col style={{ width: 68 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 126 }} />
                  <col style={{ width: 124 }} />
                  <col style={{ width: 124 }} />
                  <col style={{ width: 58 }} />
                  <col style={{ width: 120 }} />
                  {canEdit && <col style={{ width: 120 }} />}
                </colgroup>
                <thead>
                  <tr>
                    <th className="timeline-move-head" aria-label="เลื่อนลำดับ"></th>
                    <th>#</th>
                    <th>ขั้นตอน</th>
                    <th>แผนก</th>
                    <th>ผู้รับผิดชอบ</th>
                    <th>สถานะ</th>
                    <th style={{ whiteSpace: "nowrap" }}>เริ่ม</th>
                    <th style={{ whiteSpace: "nowrap" }}>เสร็จ</th>
                    <th style={{ textAlign: "center", whiteSpace: "nowrap" }}>วัน</th>
                    <th style={{ whiteSpace: "nowrap" }}>ขึ้นกับ</th>
                    {canEdit && <th>จัดการ</th>}
                  </tr>
                </thead>
                <tbody>
                  {tableGroups.map((g) => (
                    <Fragment key={g.key}>
                      {g.phase && (
                        <tr className="timeline-phase-row">
                          <td colSpan={canEdit ? 11 : 10} style={{ background: "var(--panel-2)", borderTop: "2px solid var(--border)" }}>
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
                            <td className="timeline-move-cell">{canReorderTimeline && tableSort === "step" && moveButtons(task)}</td>
                            <td className="timeline-order-cell" style={{ color: "var(--text-3)", fontWeight: 700 }}>{task.displayNumber}</td>
                            <td style={{ fontWeight: 500 }}>
                              <span className="timeline-task-name" onClick={() => canEdit && openEditModal(task)} title={canEdit ? `คลิกเพื่อแก้ไขขั้นตอน: ${task.name}` : task.name} style={{ cursor: canEdit ? "pointer" : "default" }}>
                                {task.isMilestone && <Flag size={13} color="var(--amber)" strokeWidth={2.5} />}
                                <span>{task.name}</span>
                              </span>
                            </td>
                            <td><span className="timeline-role-text" style={{ color: rs.color }}>{task.role}</span></td>
                            <td style={{ fontSize: "12px", maxWidth: 150 }} title={assignee === "—" ? undefined : assignee}>
                              <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{assignee === "—" ? <span style={{ color: "var(--text-3)" }}>—</span> : compactPersonName(assignee)}</span>
                            </td>
                            <td>
                              {canEdit ? (
                                <><StatusSelect value={task.status} onChange={(v) => stageTaskEdit(task.id, { status: v })} />{dirty[task.id] && <span title="ยังไม่บันทึก" style={{ marginLeft: "4px", color: "var(--amber)", fontSize: "11px" }}>●</span>}</>
                              ) : (
                                <span className="status-pill dot" style={{ "--dot": taskStatusColor(task.status), color: taskStatusColor(task.status) }}>{TASK_STATUS_META[task.status]?.full || task.status}</span>
                              )}
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <DateInput compact value={task.startDate || ""} disabled={!canEdit} onChange={(value) => stageScheduleEdit(task.id, { startDate: value || null })} ariaLabel={`วันเริ่ม ${task.name}`} style={{ width: "116px" }} />
                            </td>
                            <td onClick={(e) => e.stopPropagation()}>
                              <DateInput compact value={task.finishDate || ""} min={task.startDate || undefined} disabled={!canEdit || !task.startDate} onChange={(value) => stageScheduleEdit(task.id, { finishDate: value || null })} ariaLabel={`วันจบ ${task.name}`} style={{ width: "116px" }} />
                            </td>
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
            {canAddTimelineTask && (
              <button onClick={() => { setInsertAfterId(null); setInsertBeforeId(null); setTaskForm({ ...EMPTY_STEP_FORM, predecessors: processedTasks.length > 0 ? [processedTasks[processedTasks.length - 1].id] : [] }); setShowAddTask(true); }} className="btn btn-primary sm">
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
                        <button onClick={() => { setInsertAfterId(null); setInsertBeforeId(task.id); setTaskForm({ ...EMPTY_STEP_FORM, role: task.role || "SA", phase: task.phase || "" }); setShowAddTask(true); }} style={{ background: "var(--panel)", border: "1px dashed var(--border)", color: "var(--text-3)", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5, transition: "0.2s", padding: 0 }} title="แทรกขั้นตอนก่อนหัวแถวแรกของเฟสนี้">
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
                            <StepFormFields form={editForm} setForm={setEditForm} users={users} phases={formPhases} tasks={processedTasks} selfId={task.id} />
                            <div className="form-action-inline">
                              <button className="btn btn-secondary sm" onClick={() => { setEditingTaskId(null); setEditForm(null); }}>ยกเลิก</button>
                              <button className="btn btn-primary sm" onClick={() => saveEditing(task.id)}><Check size={14} /> ตกลง</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "4px", gap: "8px" }}>
                              <h4 onClick={() => { if (canEdit) startEditing(task); }} title={canEdit ? "คลิกเพื่อแก้ไขขั้นตอน" : undefined} style={{ margin: 0, fontSize: "15px", color: isCompleted ? "var(--green)" : "var(--text)", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", cursor: canEdit ? "pointer" : "default" }}>
                                {task.isMilestone && <Flag size={14} color="var(--amber)" strokeWidth={2.5} style={{ flexShrink: 0 }} />}
                                <span style={{ borderBottom: "1px dashed transparent" }} onMouseEnter={(e) => { if (canEdit) e.currentTarget.style.borderBottomColor = "var(--text-3)"; }} onMouseLeave={(e) => { e.currentTarget.style.borderBottomColor = "transparent"; }}>{task.displayNumber}. {task.name}</span>
                              </h4>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                                {(() => { const rs = roleStyle(task.role); return (
                                  <span className="timeline-role-text" style={{ color: rs.color }}>{task.role}</span>
                                ); })()}
                                {canEdit ? (
                                  <><StatusSelect value={task.status} onChange={(v) => stageTaskEdit(task.id, { status: v })} />{dirty[task.id] && <span title="ยังไม่บันทึก" style={{ marginLeft: "4px", color: "var(--amber)", fontSize: "11px" }}>●</span>}</>
                                ) : (
                                  <span className="status-pill dot" style={{ "--dot": taskStatusColor(task.status), color: taskStatusColor(task.status) }}>{TASK_STATUS_META[task.status]?.full || task.status}</span>
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
                              {canEdit ? (
                                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
                                  <Calendar size={14} />
                                  <DateInput compact value={task.startDate || ""} onChange={(value) => stageScheduleEdit(task.id, { startDate: value || null })} ariaLabel={`วันเริ่ม ${task.name}`} style={{ width: 116 }} />
                                  <span>–</span>
                                  <DateInput compact value={task.finishDate || ""} min={task.startDate || undefined} disabled={!task.startDate} onChange={(value) => stageScheduleEdit(task.id, { finishDate: value || null })} ariaLabel={`วันจบ ${task.name}`} style={{ width: 116 }} />
                                </div>
                              ) : (
                                <div style={{ display: "flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> {formatDate(task.startDate)} - {formatDate(task.finishDate)}</div>
                              )}
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
                          <button className="btn btn-primary" onClick={() => stageTaskEdit(task.id, { status: "Completed" })} style={{ fontSize: "12px" }}>✔ ทำเสร็จแล้ว</button>
                        </div>
                      )}
                    </div>
                    </div>{/* close milestone wrapper */}

                    {canEdit && !isEditing && (
                      <div style={{ display: "flex", justifyContent: "center", margin: "4px 0", zIndex: 2 }}>
                        <button onClick={() => { setInsertBeforeId(null); setInsertAfterId(task.id); setTaskForm({ ...EMPTY_STEP_FORM, role: task.role || "SA", phase: task.phase || "", predecessors: [task.id] }); setShowAddTask(true); }} style={{ background: "var(--panel)", border: "1px dashed var(--border)", color: "var(--text-3)", borderRadius: "50%", width: "20px", height: "20px", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0.5, transition: "0.2s", padding: 0 }} title="แทรกขั้นตอน">
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
      </>)}
      </div>

      {/* Footer — ยกเลิกโครงการ (Drop) หรือ On Hold */}
      {hasWriteAccess && p.status !== "Completed" && p.status !== "Dropped" && (
        <div style={{ marginTop: "16px", display: "flex", justifyContent: "flex-end", gap: "12px" }}>
          {p.status === "On Hold" ? (
            ((myName && p.aeOwner === myName) || isSuperuser(userRole)) && (
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
                <X size={14} /> ยกเลิกโครงการ (Drop)
              </button>
            </>
          )}

          {p.status === "On Hold" && (
            <button type="button" className="btn btn-danger" onClick={openDrop}>
              <X size={14} /> ยกเลิกโครงการ (Drop)
            </button>
          )}
        </div>
      )}
      </>
      )}

      {/* ฟีดความเคลื่อนไหวรวมทุกดีล — อยู่ท้ายแท็บภาพรวม */}
      {(tab === "overview" || tab === "activities") && <ProjectActivityFeed project={p} onChanged={load} />}

      {/* Add task modal */}
      <Modal open={showAddTask} onClose={() => setShowAddTask(false)} title="เพิ่มขั้นตอน" size="md">
        <form onSubmit={addTask}>
          <StepFormFields form={taskForm} setForm={setTaskForm} users={users} phases={formPhases} tasks={processedTasks} />
          <div className="form-action-bar">
            <button type="button" onClick={() => setShowAddTask(false)} className="btn">ยกเลิก</button>
            <button type="submit" className="btn btn-primary">เพิ่ม</button>
          </div>
        </form>
      </Modal>

      {/* Edit task modal — ใช้จาก Table view (แก้ในที่ ไม่สลับไป List) */}
      <Modal open={showEditTask} onClose={closeEditModal} title="แก้ไขขั้นตอน" size="md">
        {editForm && editTask && (
          <form onSubmit={(e) => { e.preventDefault(); saveEditModal(); }}>
            <StepFormFields form={editForm} setForm={setEditForm} users={users} phases={formPhases} tasks={processedTasks} selfId={editTask.id} />
            <div className="form-action-bar">
              <button type="button" onClick={closeEditModal} className="btn">ยกเลิก</button>
              <button type="submit" className="btn btn-primary"><Check size={14} className="mr-1" /> ตกลง</button>
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
          <button className="btn btn-primary" disabled={issuingRev} onClick={confirmIssueRev}>
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

      <Modal open={showDrop} onClose={() => setShowDrop(false)} title="ยกเลิกโครงการ" size="sm">
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
          <button className="btn btn-danger" onClick={confirmDrop}>ยืนยันยกเลิกโครงการ</button>
        </div>
      </Modal>

      {showEditProject && (
        <SalesProjectCreateModal
          open={showEditProject}
          onClose={() => setShowEditProject(false)}
          editingId={p.id}
          initialData={p}
          onSuccess={(data) => {
            // บั๊ก D: หลังแก้โครงการ (อาจ resync ขั้นตอนสรรพสามิตใน DB) ต้อง reload
            // ทั้งก้อน — PATCH คืนแค่แถว project ไม่มี tasks ที่เปลี่ยน
            setShowEditProject(false);
            // เชื่อมสินค้า (FG) ไม่สำเร็จ → เตือน (PATCH ลบของเดิมไปแล้ว ต้องผูกใหม่)
            if (data?.productWarning) setToast({ kind: "error", msg: data.productWarning });
            load();
          }}
          customers={customers}
          categories={categories}
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

      {/* เฟส F: modal ขอปิดโครงการ — เลือกประเภท (ปิดสำเร็จ/ยกเลิก) + เหตุผล */}
      {closeReqForm && (
        <Modal open onClose={() => setCloseReqForm(null)} title="ขออนุมัติปิดโครงการ" size="sm" dismissible={!closeBusy}>
          <div className="p-2" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <p style={{ color: "var(--text-2)", margin: 0, fontSize: 13 }}>คำขอจะส่งให้ AE Supervisor อนุมัติ — เลือกประเภทการปิด</p>
            <label style={{ fontSize: 13 }}>
              <span style={{ color: "var(--text-2)" }}>ประเภทการปิด</span>
              <Select value={closeReqForm.closeType} onChange={(e) => setCloseReqForm((f) => ({ ...f, closeType: e.target.value }))}>
                {PROJECT_CLOSE_TYPES.map((t) => <option key={t} value={t}>{PROJECT_CLOSE_TYPE_LABELS[t]}</option>)}
              </Select>
            </label>
            <label style={{ fontSize: 13 }}>
              <span style={{ color: "var(--text-2)" }}>เหตุผล / สรุปการปิด (บังคับ)</span>
              <textarea className="input" rows={3} value={closeReqForm.reason} onChange={(e) => setCloseReqForm((f) => ({ ...f, reason: e.target.value }))} placeholder="เช่น ส่งมอบครบทุกดีล ลูกค้ารับของแล้ว / ลูกค้ายกเลิกโครงการ" />
            </label>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" className="btn ghost" onClick={() => setCloseReqForm(null)} disabled={!!closeBusy}>ยกเลิก</button>
              <button type="button" className="btn btn-primary" onClick={submitCloseRequest} disabled={!!closeBusy}>ส่งคำขอ</button>
            </div>
          </div>
        </Modal>
      )}

      {/* เฟส 1: แถบยืนยันการเปลี่ยนแปลงที่ค้างอยู่ — ลอยล่างจอ เห็นจากทุกวิว */}
      {dirtyCount > 0 && (
        <div className="timeline-save-bar form-action-bar page" role="status">
          <span className="timeline-save-message">มีการแก้ไข <b>{dirtyCount}</b> ขั้นตอน — ยังไม่บันทึก</span>
          <button className="btn" onClick={cancelEdits}>ยกเลิกการแก้ไข</button>
          <button className="btn btn-primary" onClick={confirmEdits} title="บันทึกการแก้ทั้งหมดลงเอกสาร (จุดย้อนกลับสร้างได้จากปุ่ม “ออก Rev”)">บันทึกการเปลี่ยนแปลง</button>
        </div>
      )}
    </SaPageShell>
  );
}
