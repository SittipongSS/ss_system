"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListTodo, Search, CheckCircle2, Clock, AlertTriangle, User, Plus, Trash2, CircleDashed, Flame, ArrowUpDown, ArrowUp, ArrowDown, Calendar, Briefcase, Tag, Star, UserPlus, ChevronLeft, ChevronRight, Pencil, BarChart3, HandHelping, MessageCircleQuestion, Undo2, X } from "lucide-react";
import Modal from "@/components/Modal";
import TaskFormModal, { TASK_BLANK } from "@/components/pm/TaskFormModal";
import Select from "@/components/ui/Select";
import SortControl from "@/components/ui/SortControl";
import StatusSelect from "@/components/pm/StatusSelect";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/tax/ConfirmModal";
import SaWorkspace, { SaMetric, SaMetricStrip, SaSection } from "@/components/salesPlanning/SaWorkspace";
import { isSuperuser, TEAM_ROLES, canPullTask, canReleaseTask, canChangeTaskStatus, taskCreditId } from "@/lib/permissions";
import { useRole, useCan } from "@/lib/roleContext";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { fmtDateNumeric as fmtDate } from "@/lib/format";
import { daysToDue, isUrgent } from "@/lib/pm/derived";
import { DIFFICULTY_LABELS, eisenhowerQuadrant, QUADRANT_LABELS } from "@/lib/pm/tasks";
import { MINE_TASK_VIEWS, matchesMineTaskView, taskRelationship } from "@/lib/pm/taskViews";
import { compactPersonName } from "@/lib/personName";
import { cachedFetchJson } from "@/lib/apiCache";
import { InquiryStatusBadge, inquiryDueTone } from "@/components/salesPlanning/inquiryUi";

// ระบบมอบหมาย/ติดตามงาน (Sales Task Management) — งานทั้งหมดมาจาก personal_tasks
// (งานที่กรอก/มอบหมายเอง) เท่านั้น. ไม่ดึงงานขั้นตอนจากไทม์ไลน์ (project_tasks)
// อีกต่อไป — งานเหล่านั้นดู/แก้ที่หน้าไทม์ไลน์โดยตรง.

const TASK_STATUS_TH = { Pending: "รอ", "In Progress": "ทำอยู่", Completed: "เสร็จ" };
const SCOPE_TH = { mine: "ของฉัน", team: "ทีม", all: "ทั้งหมด" };
const MINE_VIEW_TH = {
  [MINE_TASK_VIEWS.RESPONSIBLE]: "ต้องทำ",
  [MINE_TASK_VIEWS.DELEGATED]: "มอบหมายโดยฉัน",
  [MINE_TASK_VIEWS.ALL]: "ทั้งหมดของฉัน",
};

const getUrgencyInfo = (task) => {
  if (task.status === "Completed") return { color: "var(--green)", label: "เสร็จแล้ว", icon: <CheckCircle2 size={12} /> };
  if (task.status === "Pending") return { color: "var(--text-3)", label: "ยังไม่เริ่ม", icon: <Clock size={12} /> };
  const dd = daysToDue(task);
  if (dd === null) return { color: "var(--text-2)", label: "กำลังทำ", icon: <Clock size={12} /> };
  if (dd < 0) return { color: "var(--red)", label: `เลยกำหนด ${Math.abs(dd)} วัน`, icon: <AlertTriangle size={12} /> };
  if (dd <= 3) return { color: "var(--amber)", label: `เหลือ ${dd} วัน`, icon: <Clock size={12} /> };
  return { color: "var(--text-2)", label: `เหลือ ${dd} วัน`, icon: <Clock size={12} /> };
};

const statusDot = (s) => s === "Completed" ? "var(--green)" : s === "In Progress" ? "var(--accent)" : "var(--text-3)";
const statusIcon = (s, size = 18) => s === "Completed" ? <CheckCircle2 size={size} /> : s === "In Progress" ? <Clock size={size} /> : <CircleDashed size={size} />;

// ตัวกรองสถานะ — ตรงกับการ์ดสรุปด้านบน
const matchStatus = (t, filter) => {
  if (filter === "all") return true;
  if (filter === "progress") return t.status === "In Progress";
  if (filter === "urgent") return isUrgent(t);
  if (filter === "done") return t.status === "Completed";
  return true;
};

const STATUS_ORDER = { "In Progress": 0, Pending: 1, Completed: 2 };
const makeComparator = (sortKey, dir = "asc") => {
  const mul = dir === "desc" ? -1 : 1;
  if (sortKey === "due") return (a, b) => {
    const da = daysToDue(a), db = daysToDue(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1; // ไม่มีกำหนด → ท้ายสุดเสมอ
    if (db === null) return -1;
    return (da - db) * mul;
  };
  if (sortKey === "name") return (a, b) => (a.title || "").localeCompare(b.title || "", "th") * mul;
  if (sortKey === "status") return (a, b) => ((STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)) * mul;
  // default = สร้างล่าสุดก่อน
  return (a, b) => ((a.createdAt || "") < (b.createdAt || "") ? 1 : -1) * mul;
};



const SORT_OPTIONS = [
  { key: "created", label: "สร้างล่าสุด" },
  { key: "due", label: "ใกล้ครบกำหนด" },
  { key: "status", label: "สถานะ" },
  { key: "name", label: "ชื่องาน" },
];

// Kanban: คอลัมน์ตามสถานะ
const BOARD_COLS = [
  { key: "Pending", label: "รอ", color: "var(--text-3)" },
  { key: "In Progress", label: "ทำอยู่", color: "var(--accent)" },
  { key: "Completed", label: "เสร็จ", color: "var(--green)" },
];

// Eisenhower: 4 ช่อง สำคัญ × ด่วน
const MATRIX_QUADS = [
  { key: "do", sub: "สำคัญ + ด่วน", color: "var(--red)" },
  { key: "plan", sub: "สำคัญ ไม่ด่วน", color: "var(--green)" },
  { key: "deleg", sub: "ไม่สำคัญ + ด่วน", color: "var(--amber)" },
  { key: "drop", sub: "ไม่สำคัญ ไม่ด่วน", color: "var(--text-3)" },
];

// สัปดาห์เริ่มวันอาทิตย์ (อา-ส) — มติผู้ใช้ 2026-07-15 ให้ตรงกับปฏิทินหน้าวันหยุด/mgmt
const WEEKDAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
// index ของวัน (0=อา..6=ส.) ตรงคอลัมน์ปฏิทินที่ขึ้นต้นวันอาทิตย์อยู่แล้ว
const sundayIndex = (jsDay) => jsDay;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function TasksPage() {
  const router = useRouter();
  const role = useRole();
  // สิทธิ์เขียนงาน (สร้าง/แก้ไข/ลบ/เปลี่ยนสถานะ) = pm:edit — ตรงกับ proxy ที่กัน
  // การเขียน /api/pm ด้วย pm:edit. viewer/staff (มีแค่ pm:view) เห็นหน้านี้แบบอ่านอย่างเดียว.
  const canEdit = useCan("pm:edit");
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [lateModal, setLateModal] = useState(null); // {task, reason} — กรอกสาเหตุตอนปิดงานเลยกำหนด
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const resolveConfirm = (result) => { setConfirmState((s) => { s?.resolve(result); return null; }); };

  const [scope, setScope] = useState("mine");
  const [mineView, setMineView] = useState(MINE_TASK_VIEWS.RESPONSIBLE);
  const [allowedScopes, setAllowedScopes] = useState(["mine"]);
  const [personalTasks, setPersonalTasks] = useState([]);
  const [inquiries, setInquiries] = useState([]); // ข้อสอบถามค้างของฝ่าย (role rd)
  const [todayISO, setTodayISO] = useState(null); // วันนี้ (client) — ป้ายเลยกำหนด SLA
  useEffect(() => {
    const d = new Date();
    setTodayISO(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  }, []);
  const [projectsMap, setProjectsMap] = useState({});
  const [dealsMap, setDealsMap] = useState({});
  const [me, setMe] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [allDeals, setAllDeals] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useResponsiveView({ portrait: "list", landscape: "table" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | progress | urgent | done
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey] = useState("created");
  const [sortDir, setSortDir] = useState("asc");
  // ปฏิทิน: เดือนที่กำลังดู (เริ่มที่เดือนปัจจุบัน)
  const [calRef, setCalRef] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  // task modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(TASK_BLANK);
  const [saving, setSaving] = useState(false);
  const [inquirySource, setInquirySource] = useState(null);

  // กันผลลัพธ์ที่มาช้า/สลับลำดับเมื่อสลับ scope เร็ว ๆ
  const loadSeq = useRef(0);
  const deepLinkHandled = useRef(false);
  const loadWork = async (sc) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/pm/my-work?scope=${sc}`);
      const d = res.ok ? await res.json() : {};
      if (seq !== loadSeq.current) return;
      setPersonalTasks(d.personalTasks || []);
      setInquiries(d.inquiries || []);
      setProjectsMap(d.projects || {});
      setDealsMap(d.deals || {});
      if (d.me) setMe(d.me);
      if (d.allowedScopes) setAllowedScopes(d.allowedScopes);
      if (d.scope && d.scope !== sc) setScope(d.scope);
    } catch { /* ignore */ }
    finally { if (seq === loadSeq.current) setLoading(false); }
  };

  useEffect(() => { loadWork(scope); }, [scope]);
  useEffect(() => {
    cachedFetchJson("/api/pm/assignable-users").then((u) => {
      setUsers(u || []);
      setUsersMap(Object.fromEntries((u || []).map((x) => [x.id, compactPersonName(x.name)])));
    }).catch(() => {});
    fetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).then((p) => setAllProjects(p || [])).catch(() => {});
    fetch("/api/pm/task-deals").then((r) => (r.ok ? r.json() : [])).then((d) => setAllDeals(d || [])).catch(() => {});
  }, []);

  // ผู้ใช้ที่ "ฉันมอบหมายงานให้ได้" (สะท้อน canAssignTask ฝั่ง server)
  const assignableUsers = useMemo(() => {
    if (!me) return [];
    if (isSuperuser(me.role)) return users;
    if (TEAM_ROLES.includes(me.role) && me.team) return users.filter((u) => u.team === me.team);
    // rd: มอบหมาย/สลับงานกันเองภายในฝ่ายเดียวกัน (RD 2 คน ไม่มีหัวหน้าฝ่ายในระบบ)
    if (me.role === "rd" && me.department) return users.filter((u) => u.department === me.department);
    return users.filter((u) => u.id === me.id);
  }, [me, users]);

  const q = search.trim().toLowerCase();
  const resolveProj = (pid) => projectsMap[pid] || allProjects.find((p) => p.id === pid) || null;
  const resolveDeal = (did) => dealsMap[did] || allDeals.find((d) => d.id === did) || null;
  const userTeamOf = (id) => users.find((u) => u.id === id)?.team || null;

  // ใครจัดการงานได้ (mirror server canManage): เจ้าของ/ผู้รับมอบ/superuser/หัวหน้าทีม
  const canManageTask = (t) => {
    if (!me) return false;
    if (!canEdit && me.role !== "rd") return false; // rd manages its own operational tasks
    if (t.ownerId === me.id || t.assigneeId === me.id) return true;
    if (isSuperuser(me.role)) return true;
    if (me.role === "senior_ae" && me.team) {
      const targetTeam = userTeamOf(t.assigneeId || t.ownerId);
      if (targetTeam && targetTeam === me.team) return true;
      if (resolveProj(t.projectId)?.team === me.team) return true;
    }
    return false;
  };

  // ── รับช่วงงาน — mirror ฝั่ง server (lib/permissions) ──
  // ผู้รับผิดชอบ = assigneeId || ownerId; ทีมของเขาใช้เช็คสิทธิ์ดึงงานมาเป็นผู้รับผิดชอบ.
  const respTeamOf = (t) => userTeamOf(t.assigneeId || t.ownerId);
  const respDeptOf = (t) => users.find((u) => u.id === (t.assigneeId || t.ownerId))?.department || null;
  const canPull = (t) => canPullTask(me, t, respTeamOf(t), respDeptOf(t));
  const canRelease = (t) => canReleaseTask(me, t, canManageTask(t));
  // ปรับสถานะได้: ผู้รับผิดชอบ/ผู้ทำแทนเดิม/หัวหน้า — เพื่อนร่วมทีมต้องรับช่วงงานก่อน.
  const canSetStatus = (t) => canChangeTaskStatus(me, t, canManageTask(t));

  const takeResponsibility = async (t) => {
    const previousId = t.assigneeId || t.ownerId;
    const previousName = usersMap[previousId] || "ผู้รับผิดชอบเดิม";
    const confirmed = await askConfirm({
      title: "ยืนยันดึงงาน",
      message: `ย้ายผู้รับผิดชอบงาน “${t.title}” จาก ${previousName} มาเป็นคุณใช่หรือไม่? หลังยืนยัน งานและ KPI จะย้ายมาอยู่ที่คุณทันที`,
      confirmLabel: "ยืนยันดึงงาน",
      danger: false,
    });
    if (!confirmed) return;

    setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, assigneeId: me?.id, assignedBy: me?.id, proxyBy: null } : x));
    try {
      const res = await fetch(`/api/pm/personal-tasks/${t.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responsibilityAction: "take" }),
      });
      const updated = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(updated.error || "");
      setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? updated : x));
      setToast({ kind: "success", msg: "ย้ายผู้รับผิดชอบมาเป็นคุณแล้ว" });
    } catch (e) {
      setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? t : x));
      setToast({ kind: "error", msg: e.message || "ดึงงานไม่สำเร็จ" });
    }
  };

  const releaseLegacyProxy = async (t) => {
    try {
      const res = await fetch(`/api/pm/personal-tasks/${t.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proxyAction: "release" }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "");
      setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, proxyBy: null } : x));
    } catch (e) {
      setToast({ kind: "error", msg: e.message || "คืนงานไม่สำเร็จ" });
    }
  };

  // ตัวเลือกกรองตามผู้รับผิดชอบ (เฉพาะ scope ทีม/ทั้งหมด) — ผู้รับผิดชอบ =
  // ผู้ถูกมอบหมาย ถ้าไม่มีก็เจ้าของงาน (assigneeId || ownerId) ให้ตรงกับคอลัมน์
  // แสดงผลและ responsibleId ฝั่ง KPI. เดิมใช้ assigneeId ล้วน → คนที่เป็นเจ้าของ
  // งานตัวเอง (เช่น senior AE) หลุดจากตัวกรองแม้ชื่อจะโชว์ในตาราง.
  const assigneeOptions = useMemo(() => {
    const ids = Array.from(new Set(personalTasks.map((t) => t.assigneeId || t.ownerId).filter(Boolean)));
    return ids.map((id) => ({ id, name: usersMap[id] || "—" })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [personalTasks, usersMap]);

  const categoryOptions = useMemo(
    () => Array.from(new Set(personalTasks.map((t) => t.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "th")),
    [personalTasks],
  );

  const mineViewCounts = useMemo(() => {
    const openTasks = personalTasks.filter((task) => task.status !== "Completed");
    return {
      [MINE_TASK_VIEWS.RESPONSIBLE]: openTasks.filter((task) => matchesMineTaskView(task, me?.id, MINE_TASK_VIEWS.RESPONSIBLE)).length,
      [MINE_TASK_VIEWS.DELEGATED]: openTasks.filter((task) => matchesMineTaskView(task, me?.id, MINE_TASK_VIEWS.DELEGATED)).length,
      [MINE_TASK_VIEWS.ALL]: openTasks.length,
    };
  }, [personalTasks, me?.id]);

  const roleFilteredTasks = useMemo(
    () => scope === "mine"
      ? personalTasks.filter((task) => matchesMineTaskView(task, me?.id, mineView))
      : personalTasks,
    [personalTasks, scope, me?.id, mineView],
  );

  // งานหลังกรอง ค้นหา/ผู้รับ/หมวด (ยังไม่กรองสถานะ — ใช้คำนวณการ์ดสรุป)
  const pool = useMemo(() => roleFilteredTasks
    .filter((t) => !q || [t.title, t.note, t.category].some((v) => (v || "").toLowerCase().includes(q)))
    .filter((t) => assigneeFilter === "all" || (t.assigneeId || t.ownerId) === assigneeFilter)
    .filter((t) => categoryFilter === "all" || t.category === categoryFilter),
    [roleFilteredTasks, q, assigneeFilter, categoryFilter]);

  const stats = useMemo(() => ({
    // "งานทั้งหมด" = งานที่ยังต้องทำ; งานเสร็จเก็บไว้ดูย้อนหลังในการ์ด "เสร็จแล้ว"
    all: pool.filter((t) => t.status !== "Completed").length,
    progress: pool.filter((t) => t.status === "In Progress").length,
    urgent: pool.filter(isUrgent).length,
    done: pool.filter((t) => t.status === "Completed").length,
  }), [pool]);

  const comparator = useMemo(() => makeComparator(sortKey, sortDir), [sortKey, sortDir]);
  const visible = useMemo(
    () => pool
      .filter((t) => statusFilter === "done" || t.status !== "Completed")
      .filter((t) => matchStatus(t, statusFilter))
      .sort(comparator),
    [pool, statusFilter, comparator],
  );

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const sortArrow = (key) => sortKey === key
    ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />;

  // ── CRUD ──
  const openAdd = () => { setEditingId(null); setInquirySource(null); setForm(TASK_BLANK); setShowModal(true); };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inquiryId = params.get("inquiryId");
    const messageId = params.get("messageId");
    const dealId = params.get("dealId");
    if (deepLinkHandled.current || (!inquiryId && !dealId)) return;
    deepLinkHandled.current = true;
    if (inquiryId) {
      fetch(`/api/sales-planning/inquiries/${inquiryId}`).then(async (res) => {
        const inquiry = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(inquiry.error || "โหลดข้อความต้นทางไม่สำเร็จ");
        const message = messageId ? (inquiry.messages || []).find((item) => item.id === messageId && !item.deletedAt) : null;
        if (messageId && !message) throw new Error("ไม่พบข้อความต้นทาง");
        const sourceText = message?.body?.trim() || inquiry.title || "งานจากเรื่องสอบถาม";
        const returnToRaw = params.get("returnTo") || `/sa/inquiries/${inquiryId}`;
        const returnTo = returnToRaw.startsWith("/") && !returnToRaw.startsWith("//") ? returnToRaw : `/sa/inquiries/${inquiryId}`;
        setEditingId(null);
        setInquirySource({ inquiryId, messageId: message?.id || null, code: inquiry.code || inquiry.id, returnTo });
        setForm({
          ...TASK_BLANK,
          title: `[${inquiry.code || "IQ"}] ${sourceText.slice(0, 120)}`,
          note: sourceText,
          dueDate: inquiry.committedDueDate || inquiry.requestedDueDate || inquiry.dueDate || "",
          linkType: inquiry.dealId ? "deal" : "none",
          dealId: inquiry.dealId || "",
          category: "ประสานงานภายใน",
          important: !!inquiry.urgent,
          urgent: !!inquiry.urgent,
        });
       
        setShowModal(true);
      }).catch((error) => setToast({ kind: "error", msg: error.message || "เปิดฟอร์มสร้างงานไม่สำเร็จ" }));
      return;
    }
    setEditingId(null);
    setInquirySource(null);
    setForm({ ...TASK_BLANK, linkType: "deal", dealId });
   
    setShowModal(true);
  }, []);
  // แก้ = ส่ง task ให้โมดัลไปเติมฟอร์มเอง (taskToForm) — ไม่ต้อง map ซ้ำที่นี่
  const openEdit = (t) => {
    setEditingId(t.id);
    setInquirySource(null);
    setShowModal(true);
  };
  const applyStatus = async (t, status, lateReason) => {
    setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status } : x));
    try {
      const res = await fetch(`/api/pm/personal-tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(lateReason ? { status, lateReason } : { status }) });
      if (!res.ok) {
        const payload = await res.json().catch(() => ({}));
        throw new Error(payload.error || "");
      }
      loadWork(scope);
    } catch (error) {
      setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: t.status } : x));
      setToast({ kind: "error", msg: error.message || "อัปเดตสถานะไม่สำเร็จ" });
    }
  };
  const setTaskStatus = (t, status) => {
    if (status === t.status) return;
    // ปิดงานที่ "เลยกำหนด" → เปิดช่องกรอกสาเหตุในโมดัล (แทนป๊อปอัป prompt)
    if (status === "Completed" && t.dueDate) {
      const d = new Date();
      const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (String(t.dueDate) < today) { setLateModal({ task: t, reason: "" }); return; }
    }
    applyStatus(t, status);
  };
  const statusSelect = (t) => (
    <StatusSelect value={t.status} variant="short" onClick={(e) => e.stopPropagation()} onChange={(v) => setTaskStatus(t, v)} title="เปลี่ยนสถานะ" />
  );
  // สถานะ: แก้ได้ (ผู้รับผิดชอบ/ผู้ทำแทน/หัวหน้า) → dropdown, ไม่งั้น → ป้ายอ่านอย่างเดียว
  const statusCell = (t) => canSetStatus(t)
    ? statusSelect(t)
    : <span className={`status-pill dot ${t.status === "Completed" ? "success" : ""}`} style={{ "--dot": statusDot(t.status) }}>{TASK_STATUS_TH[t.status] || t.status}</span>;

  // ป้ายสำหรับข้อมูลเก่าที่ยังมี proxyBy (งานใหม่จะย้าย assignee จริง)
  const proxyBadge = (t) => {
    if (!t.proxyBy) return null;
    const name = usersMap[t.proxyBy] || "ใครบางคน";
    const mine = t.proxyBy === me?.id;
    return (
      <span title={`ทำแทนโดย ${name} · งานนี้คิด KPI ให้ ${name}`} style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "color-mix(in srgb, var(--accent) 14%, transparent)", padding: "1px 7px", borderRadius: "9px", color: "var(--accent)", fontWeight: 500 }}>
        <HandHelping size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> {mine ? "ฉันทำแทน" : name}
      </span>
    );
  };

  // ปุ่มดึงงานจะถามยืนยันก่อน แล้วเปลี่ยนผู้รับผิดชอบจริงทันที
  const proxyActions = (t) => {
    if (canPull(t)) return <button className="btn ghost sm" onClick={(e) => { e.stopPropagation(); takeResponsibility(t); }} title="ดึงงานและย้ายผู้รับผิดชอบมาเป็นฉัน"><HandHelping size={14} /> ดึงงาน</button>;
    if (t.proxyBy && canRelease(t)) return <button className="btn-icon" onClick={(e) => { e.stopPropagation(); releaseLegacyProxy(t); }} title="คืนงานทำแทนเดิม"><Undo2 size={14} /></button>;
    return null;
  };
  const deletePersonal = async (t) => {
    if (!(await askConfirm({ title: "ลบงาน", message: `ลบงาน "${t.title}" ?`, confirmLabel: "ลบ" }))) return;
    const res = await fetch(`/api/pm/personal-tasks/${t.id}`, { method: "DELETE" });
    if (res.ok) setPersonalTasks((prev) => prev.filter((x) => x.id !== t.id));
    else setToast({ kind: "error", msg: "ลบไม่สำเร็จ" });
  };

  const STAT_CARDS = [
    { key: "all", label: "งานทั้งหมด", count: stats.all, color: "var(--accent)", icon: <ListTodo size={18} /> },
    { key: "progress", label: "กำลังทำ", count: stats.progress, color: "var(--blue)", icon: <Clock size={18} /> },
    { key: "urgent", label: "ต้องรีบ", count: stats.urgent, color: "var(--red)", icon: <Flame size={18} /> },
    { key: "done", label: "เสร็จแล้ว", count: stats.done, color: "var(--green)", icon: <CheckCircle2 size={18} /> },
  ];

  // ป้ายกำกับ (โครงการ/ไทม์ไลน์) ใช้ซ้ำทั้ง card + table
  const linkChip = (t) => {
    const proj = t.projectId ? resolveProj(t.projectId) : null;
    const deal = t.dealId ? resolveDeal(t.dealId) : null;
    if (!proj && !deal) return null;
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", flexWrap: "wrap" }}>
        {proj && <span onClick={(e) => { e.stopPropagation(); router.push(`/sa/projects/${proj.code || t.projectId}`); }} className="font-mono" style={{ cursor: "pointer", fontSize: "10px", background: "var(--panel-2)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border)" }}>{proj.code}</span>}
        {deal && <span onClick={(e) => { e.stopPropagation(); router.push(`/sa/deals/${deal.id}`); }} style={{ cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", background: "color-mix(in srgb, var(--purple) 10%, transparent)", padding: "2px 7px", borderRadius: "4px", color: "var(--purple)" }}><Briefcase size={10} /> {deal.title}</span>}
      </span>
    );
  };

  const relationshipBadge = (task, compact = false) => {
    if (scope !== "mine" || !me?.id) return null;
    const relationship = taskRelationship(task, me.id, (id) => usersMap[id] || "");
    const palette = relationship.kind === "incoming"
      ? { color: "var(--blue)", background: "color-mix(in srgb, var(--blue) 12%, transparent)" }
      : relationship.kind === "outgoing"
        ? { color: "var(--amber)", background: "color-mix(in srgb, var(--amber) 12%, transparent)" }
        : { color: "var(--text-2)", background: "var(--panel-2)" };
    return (
      <span
        title={relationship.label}
        style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: compact ? "1px 5px" : "2px 7px", borderRadius: 9, color: palette.color, background: palette.background, fontSize: compact ? 9 : 10, fontWeight: 600 }}
      >
        <UserPlus size={compact ? 9 : 10} /> {compact ? relationship.compactLabel : relationship.label}
      </span>
    );
  };

  // การ์ดย่อ — ใช้ในมุมมองบอร์ด (Kanban) และเมทริกซ์ (Eisenhower)
  const miniCard = (t) => {
    const u = getUrgencyInfo(t);
    const manage = canManageTask(t);
    const done = t.status === "Completed";
    const activeAssignee = t.assigneeId || t.ownerId;
    const assigneeName = activeAssignee ? (usersMap[activeAssignee] || "—") : null;
    const proxyAction = proxyActions(t);
    const showFooter = manage || canSetStatus(t) || proxyAction;
    return (
      <div key={t.id} onClick={() => router.push(`/sa/tasks/${t.id}`)} title="คลิกเพื่อดูรายละเอียดงาน" className="glass-panel" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px", borderLeft: `3px solid ${statusDot(t.status)}`, cursor: "pointer" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, textDecoration: done ? "line-through" : "none", color: done ? "var(--text-3)" : "var(--text)", display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
          {t.important && <Star size={12} color="var(--amber)" fill="var(--amber)" />}
          {t.urgent && <Flame size={12} color="var(--red)" />}
          {t.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "10px" }}>
          {t.category && <span style={{ background: "var(--panel-2)", padding: "1px 6px", borderRadius: "9px", color: "var(--text-2)" }}>{t.category}</span>}
          {relationshipBadge(t, true)}
          {(scope !== "mine" || (activeAssignee && activeAssignee !== me?.id)) && assigneeName && (
            <span style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "1px 6px", borderRadius: "9px", color: "var(--accent)" }}><User size={9} style={{ display: "inline", verticalAlign: "-1px" }} /> {assigneeName}</span>
          )}
          {proxyBadge(t)}
          {t.dueDate && <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: u.color }}>{u.icon} {fmtDate(t.dueDate)}</span>}
        </div>
        {showFooter && (
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
            <div>{canSetStatus(t) && statusSelect(t)}</div>
            <div style={{ display: "flex", gap: "2px" }}>
              {proxyAction}
              {manage && <button className="btn-icon" onClick={() => openEdit(t)} title="แก้ไข"><Pencil size={13} /></button>}
              {manage && <button className="btn-icon danger" onClick={() => deletePersonal(t)} title="ลบ"><Trash2 size={13} /></button>}
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── ปฏิทิน: ทำแผนที่ dueDate → งาน + โครงตารางเดือนที่กำลังดู ──
  const calByDate = useMemo(() => {
    const m = new Map();
    for (const t of visible) {
      if (!t.dueDate) continue;
      const k = t.dueDate.slice(0, 10);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(t);
    }
    return m;
  }, [visible]);
  const calNoDue = useMemo(() => visible.filter((t) => !t.dueDate), [visible]);
  const calCells = useMemo(() => {
    const first = new Date(calRef.y, calRef.m, 1);
    const daysInMonth = new Date(calRef.y, calRef.m + 1, 0).getDate();
    const lead = sundayIndex(first.getDay());
    const cells = [];
    for (let i = 0; i < lead; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(calRef.y, calRef.m, d));
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
  }, [calRef]);
  const todayStr = ymd(new Date());
  const shiftMonth = (delta) => setCalRef((r) => {
    const d = new Date(r.y, r.m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  return (
    <SaWorkspace
      icon={<ListTodo size={22} />}
      title="งาน (Tasks)"
      subtitle={`มอบหมาย ติดตาม และวัดผลงานรายคน/รายทีม — เชื่อมกับโครงการและไทม์ไลน์ได้${me && (me.role === "senior_ae" ? " · คุณติดตามงานของทีมได้" : isSuperuser(me?.role) ? " · คุณติดตามงานได้ทุกทีม" : "")}`}
      headerRight={
        <div className="flex gap-3 items-center flex-wrap">
          <ViewSwitcher value={view} onChange={setView} modes={["list", "table", "board", "calendar", "matrix"]} />
          {(canEdit || role === "rd") && <button onClick={openAdd} className="btn btn-accent"><Plus size={16} /> เพิ่มงาน</button>}
        </div>
      }
    >
      <div className="flex flex-col gap-4">

      {/* scope tabs */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 18 }}>
        {allowedScopes.length > 1 && (
          <div className="segmented deal-scope-toggle">
            {allowedScopes.map((s) => (
              <button key={s} onClick={() => { setScope(s); setAssigneeFilter("all"); }} className={scope === s ? "active" : ""}>{role === "rd" && s === "team" ? "ทีม RD" : SCOPE_TH[s]}</button>
            ))}
          </div>
        )}

        {scope === "mine" && (
          <div className="segmented deal-scope-toggle" aria-label="บทบาทของฉันในงาน">
            {Object.values(MINE_TASK_VIEWS).map((taskView) => (
              <button
                key={taskView}
                type="button"
                onClick={() => setMineView(taskView)}
                className={mineView === taskView ? "active" : ""}
              >
                {MINE_VIEW_TH[taskView]} <span style={{ opacity: 0.72 }}>({mineViewCounts[taskView] || 0})</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── ข้อสอบถามค้างของฝ่าย (role rd) — คิวเดียวกับงาน: ตอบในเธรด ── */}
      {inquiries.length > 0 && (
        <SaSection icon={<MessageCircleQuestion size={17} />} title="ข้อสอบถามจากฝ่ายขาย" subtitle="เรื่องที่ฝ่ายของคุณต้องตอบหรือติดตาม" actions={<><span className="ui-badge" style={{ color: "var(--amber)" }}>{inquiries.filter((q) => q.status === "open").length} รอตอบ</span><Link href="/sa/inquiries" className="linklike">ดูทั้งหมด</Link></>}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {inquiries.slice(0, 8).map((q) => {
              const due = inquiryDueTone(q, todayISO);
              return (
                <li key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
                  <InquiryStatusBadge status={q.status} />
                  {q.urgent && <span className="ui-badge" style={{ color: "var(--red)" }}>ด่วน</span>}
                  <Link href={`/sa/inquiries/${q.id}`} className="linklike" style={{ fontWeight: 600 }}>
                    {q.code ? `${q.code} · ` : ""}{q.title}
                  </Link>
                  <span style={{ color: "var(--text-3)", fontSize: 12 }}>โดย {q.requesterName || "-"}</span>
                  {q.dueDate && (
                    <span className="mono" style={{ marginLeft: "auto", fontSize: 12, color: due?.color || "var(--text-3)" }}>
                      กำหนดตอบ {fmtDate(q.dueDate)}{due ? ` · ${due.label}` : ""}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </SaSection>
      )}

      {/* ── สรุปภาพรวม (คลิกเพื่อกรอง) ── */}
      <SaMetricStrip>
        {STAT_CARDS.map((c) => {
          const active = statusFilter === c.key;
          return (
            <SaMetric key={c.key} as="button" type="button" onClick={() => setStatusFilter(active && c.key !== "all" ? "all" : c.key)} active={active} icon={c.icon} label={c.label} value={c.count} note={active ? "กำลังใช้ตัวกรองนี้" : "กดเพื่อกรองรายการ"} tone={c.key === "done" ? "good" : c.key === "overdue" ? "danger" : c.key === "pending" ? "warning" : undefined} aria-pressed={active} />
          );
        })}
      </SaMetricStrip>

      {/* ── แถบเครื่องมือ ── */}
      <SaSection icon={<ListTodo size={17} />} title="รายการงาน" subtitle="ค้นหา กรอง และสลับมุมมองเพื่อติดตามงาน" actions={<span className="ui-badge">{visible.length} งาน</span>}>
      <div className="toolbar" style={{ marginBottom: "20px" }}>
        <div className="search-glass" style={{ width: "260px", maxWidth: "100%" }}>
          <Search size={18} color="var(--text-3)" />
          <input type="text" placeholder="ค้นหางาน..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {statusFilter !== "all" && (
          <button onClick={() => setStatusFilter("all")} className="btn sm">
            กรอง: {STAT_CARDS.find((c) => c.key === statusFilter)?.label} <span style={{ fontWeight: 700 }}>×</span>
          </button>
        )}
        {categoryOptions.length > 1 && (
          <Select compact value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} title="กรองตามหมวดหมู่">
            <option value="all">ทุกหมวด</option>
            {categoryOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        )}
        {scope !== "mine" && assigneeOptions.length > 1 && (
          <Select compact value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} title="กรองตามผู้รับมอบหมาย">
            <option value="all">ทุกคน</option>
            {assigneeOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}
        <div className="spacer">
          <SortControl
            value={sortKey}
            onChange={(event) => { setSortKey(event.target.value); setSortDir("asc"); }}
            options={SORT_OPTIONS}
            direction={sortDir}
            onDirectionChange={setSortDir}
          />
        </div>
        </div>

      {loading ? (
        <SkeletonRows />
      ) : view === "board" ? (
        /* ── Kanban board (ตามสถานะ) ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", alignItems: "start" }}>
          {BOARD_COLS.filter((col) => col.key !== "Completed" || statusFilter === "done").map((col) => {
            const items = visible.filter((t) => t.status === col.key);
            return (
              <div key={col.key} className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "10px 14px", borderBottom: "1px solid var(--border)", borderTop: `3px solid ${col.color}`, fontWeight: 700, fontSize: "13px" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: col.color }} />
                  {col.label}
                  <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--text-3)", fontWeight: 500 }}>{items.length}</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", minHeight: "60px" }}>
                  {items.length === 0 ? <div style={{ fontSize: "12px", color: "var(--text-3)", textAlign: "center", padding: "12px 0" }}>—</div> : items.map(miniCard)}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "matrix" ? (
        /* ── Eisenhower matrix (สำคัญ × ด่วน) ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px", alignItems: "start" }}>
          {MATRIX_QUADS.map((quad) => {
            const items = visible.filter((t) => eisenhowerQuadrant(t) === quad.key);
            return (
              <div key={quad.key} className="glass-panel" style={{ padding: 0, overflow: "hidden", borderTop: `3px solid ${quad.color}` }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: quad.color }}>
                    {QUADRANT_LABELS[quad.key]}
                    <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--text-3)", fontWeight: 500 }}>{items.length}</span>
                  </div>
                  <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{quad.sub}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", minHeight: "60px" }}>
                  {items.length === 0 ? <div style={{ fontSize: "12px", color: "var(--text-3)", textAlign: "center", padding: "12px 0" }}>—</div> : items.map(miniCard)}
                </div>
              </div>
            );
          })}
        </div>
      ) : view === "calendar" ? (
        /* ── ปฏิทินรายเดือน (ตามกำหนดเสร็จ) ── */
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "16px", marginBottom: "12px" }}>
            <button className="btn-icon" onClick={() => shiftMonth(-1)} aria-label="เดือนก่อน"><ChevronLeft size={16} /></button>
            <div style={{ fontWeight: 700, fontSize: "15px", minWidth: "170px", textAlign: "center" }}>{MONTHS_TH[calRef.m]} {calRef.y + 543}</div>
            <button className="btn-icon" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป"><ChevronRight size={16} /></button>
          </div>
          <div className="glass-panel" style={{ padding: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", marginBottom: "4px" }}>
              {WEEKDAYS_TH.map((w) => <div key={w} style={{ textAlign: "center", fontSize: "11px", fontWeight: 700, color: "var(--text-3)", padding: "4px 0" }}>{w}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px" }}>
              {calCells.map((d, i) => {
                if (!d) return <div key={i} style={{ minHeight: "84px", borderRadius: "8px", background: "color-mix(in srgb, var(--panel-2) 40%, transparent)" }} />;
                const dayKey = ymd(d);
                const items = calByDate.get(dayKey) || [];
                const isToday = dayKey === todayStr;
                return (
                  <div key={i} style={{ minHeight: "84px", borderRadius: "8px", border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`, padding: "4px", display: "flex", flexDirection: "column", gap: "3px", background: "var(--panel)" }}>
                    <div style={{ fontSize: "11px", fontWeight: isToday ? 700 : 500, color: isToday ? "var(--accent)" : "var(--text-3)", textAlign: "right", padding: "0 2px" }}>{d.getDate()}</div>
                    {items.slice(0, 3).map((t) => {
                      const u = getUrgencyInfo(t);
                      const manage = canManageTask(t);
                      return (
                        <div key={t.id} onClick={() => router.push(`/sa/tasks/${t.id}`)} title={`${t.title}${scope === "mine" && me?.id ? ` · ${taskRelationship(t, me.id, (id) => usersMap[id] || "").label}` : ""}`} style={{ fontSize: "10px", padding: "2px 5px", borderRadius: "5px", background: `color-mix(in srgb, ${u.color} 15%, transparent)`, color: u.color, cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", gap: "3px" }}>
                          {t.status === "Completed" ? <CheckCircle2 size={9} /> : t.important ? <Star size={9} /> : null}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                        </div>
                      );
                    })}
                    {items.length > 3 && <div style={{ fontSize: "9px", color: "var(--text-3)", paddingLeft: "3px" }}>+{items.length - 3}</div>}
                  </div>
                );
              })}
            </div>
          </div>
          {calNoDue.length > 0 && (
            <div style={{ marginTop: "10px", fontSize: "12px", color: "var(--text-3)" }}>+ อีก {calNoDue.length} งานที่ยังไม่กำหนดวันเสร็จ (ดูในมุมมองรายการ)</div>
          )}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Plus} dashed onClick={canEdit ? openAdd : undefined}>
          {statusFilter !== "all" || q || assigneeFilter !== "all" || categoryFilter !== "all"
            ? "ไม่มีงานตรงกับตัวกรองนี้"
            : canEdit
              ? "ยังไม่มีงาน — กดเพื่อสร้าง/มอบหมายงาน (เช่น โทรตามลูกค้า, เตรียมใบเสนอราคา)"
              : "ยังไม่มีงาน"}
        </EmptyState>
      ) : view === "table" ? (
        /* ── Table view ── */
        <div className="premium-glass-table table-responsive">
          <table className="premium-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("status")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>สถานะ {sortArrow("status")}</span></th>
                <th onClick={() => handleSort("name")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>ชื่องาน {sortArrow("name")}</span></th>
                {scope === "mine" && <th>บทบาทของฉัน</th>}
                <th>หมวด</th>
                {scope !== "mine" && <th>ผู้รับมอบหมาย</th>}
                <th>ความยาก</th>
                <th onClick={() => handleSort("due")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>กำหนดเสร็จ {sortArrow("due")}</span></th>
                <th>เชื่อมโยง</th>
                <th style={{ width: "70px", textAlign: "right" }}>จัดการ</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const u = getUrgencyInfo(t);
                const manage = canManageTask(t);
                return (
                  <tr key={t.id} className="premium-row" onClick={() => router.push(`/sa/tasks/${t.id}`)} title="คลิกเพื่อดูรายละเอียดงาน" style={{ cursor: "pointer" }}>
                    <td onClick={(e) => e.stopPropagation()}>{statusCell(t)}</td>
                    <td style={{ fontWeight: 500, minWidth: "220px" }}>
                      <div style={{ whiteSpace: "normal", wordBreak: "break-word", maxWidth: "450px", lineHeight: 1.4 }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", flexWrap: "wrap" }}>
                          {t.important && <Star size={13} color="var(--amber)" fill="var(--amber)" style={{ flexShrink: 0, marginTop: "2px" }} />}
                          {t.urgent && <Flame size={13} color="var(--red)" style={{ flexShrink: 0, marginTop: "2px" }} />}
                          <span style={{ flex: 1 }}>{t.title}</span>
                        </div>
                        {t.note && <div style={{ fontSize: "11px", color: "var(--text-3)", marginTop: "4px" }}>{t.note}</div>}
                      </div>
                    </td>
                    {scope === "mine" && <td>{relationshipBadge(t)}</td>}
                    <td>{t.category ? <span style={{ fontSize: "11px", background: "var(--panel-2)", padding: "2px 8px", borderRadius: "12px" }}>{t.category}</span> : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                    {scope !== "mine" && <td style={{ fontSize: "13px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span>{(t.assigneeId || t.ownerId) ? (usersMap[t.assigneeId || t.ownerId] || "—") : <span style={{ color: "var(--text-3)" }}>—</span>}</span>
                        {proxyBadge(t)}
                      </div>
                    </td>}
                    <td style={{ fontSize: "13px" }}>{DIFFICULTY_LABELS[t.difficulty] || DIFFICULTY_LABELS[2]}</td>
                    <td>
                      {t.dueDate ? (
                        <>
                          <div style={{ fontSize: "13px" }}>{fmtDate(t.dueDate)}</div>
                          <div style={{ fontSize: "11px", color: u.color, display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>{u.icon} {u.label}</div>
                        </>
                      ) : <span style={{ color: "var(--text-3)" }}>—</span>}
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>{linkChip(t) || <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
                      <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                        {proxyActions(t)}
                        {manage && <button className="btn-icon" onClick={() => openEdit(t)} title="แก้ไข"><Pencil size={14} /></button>}
                        {manage && <button className="btn-icon danger" onClick={() => deletePersonal(t)} title="ลบ"><Trash2 size={14} /></button>}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* ── List view (cards) ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: "12px" }}>
          {visible.map((t) => {
            const u = getUrgencyInfo(t);
            const done = t.status === "Completed";
            const manage = canManageTask(t);
            const assigneeName = t.assigneeId ? (usersMap[t.assigneeId] || "—") : null;
            return (
              <div key={t.id} onClick={() => router.push(`/sa/tasks/${t.id}`)} title="คลิกเพื่อดูรายละเอียดงาน" className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", borderLeft: `3px solid ${statusDot(t.status)}`, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <span title={TASK_STATUS_TH[t.status]} style={{ padding: "2px", flexShrink: 0, color: statusDot(t.status), display: "flex" }}>{statusIcon(t.status)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600, textDecoration: done ? "line-through" : "none", color: done ? "var(--text-3)" : "var(--text)", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      {t.important && <Star size={13} color="var(--amber)" fill="var(--amber)" />}
                      {t.urgent && <Flame size={13} color="var(--red)" />}
                      {t.title}
                    </div>
                    {t.note && <div style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "2px" }}>{t.note}</div>}
                  </div>
                  <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                    {proxyActions(t)}
                    {manage && <button className="btn-icon" onClick={() => openEdit(t)} title="แก้ไข"><Pencil size={14} /></button>}
                    {manage && <button className="btn-icon danger" onClick={() => deletePersonal(t)} aria-label="ลบงาน" title="ลบ"><Trash2 size={14} /></button>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "10px" }}>
                  {t.category && <span style={{ background: "var(--panel-2)", padding: "2px 7px", borderRadius: "10px", color: "var(--text-2)" }}><Tag size={10} style={{ display: "inline", verticalAlign: "-1px" }} /> {t.category}</span>}
                  {relationshipBadge(t)}
                  {t.difficulty === 3 && <span style={{ background: "color-mix(in srgb, var(--red) 12%, transparent)", padding: "2px 7px", borderRadius: "10px", color: "var(--red)" }}>ยาก</span>}
                  {(scope !== "mine" || (t.assigneeId && t.assigneeId !== me?.id)) && assigneeName && (
                    <span style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "2px 7px", borderRadius: "10px", color: "var(--accent)" }}><User size={10} style={{ display: "inline", verticalAlign: "-1px" }} /> {assigneeName}</span>
                  )}
                  {proxyBadge(t)}
                </div>
                <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", flexWrap: "wrap" }}>
                  {statusCell(t)}
                  {t.dueDate && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: u.color }}>{u.icon} {fmtDate(t.dueDate)}</span>}
                  {linkChip(t)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      </SaSection>

      {/* task modal */}
      <TaskFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        task={editingId ? personalTasks.find((t) => t.id === editingId) || null : null}
        initialForm={editingId ? null : form}
        inquirySource={inquirySource}
        deals={allDeals}
        projects={allProjects}
        assignableUsers={assignableUsers}
        me={me}
        canManage={editingId ? canManageTask(personalTasks.find((t) => t.id === editingId)) : true}
        canChangeStatus
        onSaved={(saved, { warning } = {}) => {
          setShowModal(false);
          loadWork(scope);
          if (warning) setToast({ kind: "error", msg: warning });
          else if (!editingId && inquirySource?.returnTo) router.push(inquirySource.returnTo);
        }}
        onError={(msg) => setToast({ kind: "error", msg: msg || "บันทึกไม่สำเร็จ" })}
      />


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
      {lateModal && (
        <Modal open onClose={() => setLateModal(null)} title="ปิดงานที่เกินกำหนด" size="sm">
          <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 13, color: "var(--text-3)" }}>
              งาน <strong style={{ color: "var(--text)" }}>{lateModal.task.title}</strong> เลยกำหนดแล้ว — ระบุสาเหตุที่ทำเสร็จช้าก่อนปิดงาน
            </div>
            <textarea className="premium-input" rows={3} value={lateModal.reason}
              onChange={(e) => setLateModal((v) => ({ ...v, reason: e.target.value }))}
              placeholder="เช่น รออนุมัติจากลูกค้า / รอวัตถุดิบ / ปรับแก้ตามฟีดแบ็ก..." autoFocus />
            <div className="form-action-inline">
              <button type="button" className="btn ghost sm" onClick={() => setLateModal(null)}>ยกเลิก</button>
              <button type="button" className="btn btn-primary sm" disabled={!lateModal.reason.trim()}
                onClick={() => { const m = lateModal; setLateModal(null); applyStatus(m.task, "Completed", m.reason.trim()); }}>
                ปิดงาน
              </button>
            </div>
          </div>
        </Modal>
      )}
      </div>
    </SaWorkspace>
  );
}
