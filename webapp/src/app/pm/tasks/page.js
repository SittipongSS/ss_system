"use client";
import DateInput from "@/components/ui/DateInput";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListTodo, Search, CheckCircle2, Clock, AlertTriangle, User, Plus, Trash2, CircleDashed, Flame, ArrowUpDown, ArrowUp, ArrowDown, Calendar, Briefcase, Tag, Star, UserPlus, ChevronLeft, ChevronRight, Pencil, BarChart3, HandHelping, MessageCircleQuestion, Undo2, Paperclip, FileText, X } from "lucide-react";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import SortControl from "@/components/ui/SortControl";
import StatusSelect from "@/components/pm/StatusSelect";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/tax/ConfirmModal";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { isSuperuser, TEAM_ROLES, canPullTask, canReleaseTask, canChangeTaskStatus, taskCreditId } from "@/lib/permissions";
import { useRole, useCan } from "@/lib/roleContext";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { fmtDateNumeric as fmtDate } from "@/lib/format";
import { daysToDue, isUrgent } from "@/lib/pm/derived";
import { TASK_CATEGORIES, DIFFICULTY_LABELS, DIFFICULTY_OPTIONS, eisenhowerQuadrant, QUADRANT_LABELS } from "@/lib/pm/tasks";
import { resolvePersonalTaskLink, taskLinkType } from "@/lib/pm/taskLink";
import { MINE_TASK_VIEWS, matchesMineTaskView, taskRelationship } from "@/lib/pm/taskViews";
import { compactPersonName } from "@/lib/personName";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";
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

const PERSONAL_BLANK = {
  title: "", note: "", startDate: "", dueDate: "",
  linkType: "none", projectId: "", dealId: "", assigneeId: "",
  category: "", important: false, urgent: false, difficulty: 2,
};

async function uploadNewTaskAttachment(taskId, file) {
  const fd = new FormData();
  fd.append("file", file);
  fd.append("customerName", `personal_task-${taskId}`);
  fd.append("entityType", "personal_task");
  fd.append("entityId", taskId);

  const uploadRes = await fetch("/api/upload", { method: "POST", body: fd });
  const uploadData = await uploadRes.json().catch(() => ({}));
  if (!uploadRes.ok) throw new Error(uploadData.error || `อัปโหลด ${file.name} ไม่สำเร็จ`);

  const attachmentRes = await fetch("/api/master/attachments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entityType: "personal_task",
      entityId: taskId,
      docType: "other",
      fileUrl: uploadData.url,
      driveFileId: uploadData.driveFileId,
      fileName: file.name,
      mimeType: file.type || null,
      sizeBytes: file.size,
      metadata: {},
    }),
  });

  if (!attachmentRes.ok) {
    if (uploadData.driveFileId) {
      fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driveFileId: uploadData.driveFileId }),
      }).catch(() => {});
    }
    const payload = await attachmentRes.json().catch(() => ({}));
    throw new Error(payload.error || `บันทึก ${file.name} ไม่สำเร็จ`);
  }
}

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
  const [form, setForm] = useState(PERSONAL_BLANK);
  const [saving, setSaving] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [inquirySource, setInquirySource] = useState(null);
  const pendingFileRef = useRef(null);

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
  const openAdd = () => { setEditingId(null); setInquirySource(null); setForm(PERSONAL_BLANK); setPendingFiles([]); setShowModal(true); };
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
          ...PERSONAL_BLANK,
          title: `[${inquiry.code || "IQ"}] ${sourceText.slice(0, 120)}`,
          note: sourceText,
          dueDate: inquiry.committedDueDate || inquiry.requestedDueDate || inquiry.dueDate || "",
          linkType: inquiry.dealId ? "deal" : "none",
          dealId: inquiry.dealId || "",
          category: "ประสานงานภายใน",
          important: !!inquiry.urgent,
          urgent: !!inquiry.urgent,
        });
        setPendingFiles([]);
        setShowModal(true);
      }).catch((error) => setToast({ kind: "error", msg: error.message || "เปิดฟอร์มสร้างงานไม่สำเร็จ" }));
      return;
    }
    setEditingId(null);
    setInquirySource(null);
    setForm({ ...PERSONAL_BLANK, linkType: "deal", dealId });
    setPendingFiles([]);
    setShowModal(true);
  }, []);
  const openEdit = (t) => {
    setEditingId(t.id);
    setInquirySource(null);
    setPendingFiles([]);
    setForm({
      title: t.title, note: t.note || "",
      startDate: t.startDate || "", dueDate: t.dueDate || "",
      linkType: taskLinkType(t),
      projectId: t.projectId || "", dealId: t.dealId || "", assigneeId: t.assigneeId || "",
      category: t.category || "", important: !!t.important, urgent: !!t.urgent,
      difficulty: t.difficulty ?? 2,
    });
    setShowModal(true);
  };
  const selectPendingFiles = (event) => {
    const selected = Array.from(event.target.files || []);
    event.target.value = "";
    const oversized = selected.filter((file) => file.size > MAX_UPLOAD_BYTES);
    if (oversized.length > 0) {
      setToast({ kind: "error", msg: `ไฟล์ต้องมีขนาดไม่เกิน ${MAX_UPLOAD_MB} MB: ${oversized.map((file) => file.name).join(", ")}` });
    }
    const valid = selected.filter((file) => file.size <= MAX_UPLOAD_BYTES);
    setPendingFiles((current) => {
      const known = new Set(current.map((file) => `${file.name}:${file.size}:${file.lastModified}`));
      return [...current, ...valid.filter((file) => !known.has(`${file.name}:${file.size}:${file.lastModified}`))];
    });
  };
  const savePersonal = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setToast({ kind: "error", msg: "ต้องระบุชื่องาน" }); return; }
    if (form.linkType === "deal" && !form.dealId) { setToast({ kind: "error", msg: "กรุณาเลือกดีล" }); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/pm/personal-tasks/${editingId}` : "/api/pm/personal-tasks";
      const { projectId, dealId } = resolvePersonalTaskLink(form, allDeals);
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          note: form.note,
          startDate: form.startDate || null,
          dueDate: form.dueDate || null,
          projectId,
          dealId,
          assigneeId: form.assigneeId || null,
          category: form.category || null,
          important: !!form.important,
          urgent: !!form.urgent,
          difficulty: form.difficulty,
          inquiryId: inquirySource?.inquiryId || null,
          inquiryMessageId: inquirySource?.messageId || null,
        }),
      });
      if (res.ok) {
        const savedTask = await res.json();
        const failedFiles = [];
        if (!editingId && pendingFiles.length > 0) {
          for (const file of pendingFiles) {
            try {
              await uploadNewTaskAttachment(savedTask.id, file);
            } catch (error) {
              console.error(error);
              failedFiles.push(file.name);
            }
          }
        }
        setShowModal(false);
        setPendingFiles([]);
        loadWork(scope);
        if (failedFiles.length > 0) {
          setToast({ kind: "error", msg: `สร้างงานแล้ว แต่แนบไฟล์ไม่สำเร็จ: ${failedFiles.join(", ")} — เปิดแก้ไขงานเพื่อแนบอีกครั้ง` });
        } else if (inquirySource?.returnTo) router.push(inquirySource.returnTo);
      } else setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ" });
    } catch { setToast({ kind: "error", msg: "เกิดข้อผิดพลาด" }); }
    finally { setSaving(false); }
  };
  const setTaskStatus = async (t, status) => {
    if (status === t.status) return;
    setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status } : x));
    try {
      const res = await fetch(`/api/pm/personal-tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
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
    <div>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><ListTodo size={22} /></span> งาน (Tasks)</h1>
          <p>มอบหมาย ติดตาม และวัดผลงานรายคน/รายทีม — เชื่อมกับโครงการและไทม์ไลน์ได้{me && (me.role === "senior_ae" ? " · คุณติดตามงานของทีมได้" : isSuperuser(me?.role) ? " · คุณติดตามงานได้ทุกทีม" : "")}</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <ViewSwitcher value={view} onChange={setView} modes={["list", "table", "board", "calendar", "matrix"]} />
          {(canEdit || role === "rd") && <button onClick={openAdd} className="btn btn-primary"><Plus size={16} /> เพิ่มงาน</button>}
        </div>
      </div>

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
        <section className="glass-panel" style={{ padding: 14, marginBottom: 18 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <MessageCircleQuestion size={16} aria-hidden="true" style={{ color: "var(--violet)" }} />
            <h2 style={{ margin: 0, fontSize: 14.5, fontWeight: 700 }}>ข้อสอบถามจากฝ่ายขาย</h2>
            <span className="ui-badge" style={{ color: "var(--amber)" }}>{inquiries.filter((q) => q.status === "open").length} รอตอบ</span>
            <Link href="/sa/inquiries" className="linklike" style={{ marginLeft: "auto", fontSize: 12.5 }}>ดูทั้งหมด</Link>
          </div>
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
        </section>
      )}

      {/* ── สรุปภาพรวม (คลิกเพื่อกรอง) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "18px" }}>
        {STAT_CARDS.map((c) => {
          const active = statusFilter === c.key;
          return (
            <button key={c.key} onClick={() => setStatusFilter(active && c.key !== "all" ? "all" : c.key)} className={`glass-panel stat-card${active ? " active" : ""}`} style={{ "--stat": c.color }}>
              <span className="stat-icon">{c.icon}</span>
              <div style={{ minWidth: 0 }}>
                <div className="stat-num">{c.count}</div>
                <div className="stat-label">{c.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── แถบเครื่องมือ ── */}
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

      {/* task modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? "แก้ไขงาน" : "เพิ่มงาน"} size="md">
        <form onSubmit={savePersonal}>
          <div className="grid gap-[14px]">
            {inquirySource && (
              <div className="glass-panel" style={{ padding: "10px 12px", fontSize: 12.5, color: "var(--text-2)" }}>
                สร้างจากเรื่องสอบถาม <strong>{inquirySource.code}</strong>{inquirySource.messageId ? " · ผูกกับข้อความต้นทาง" : ""}
                <div style={{ marginTop: 3, color: "var(--text-3)" }}>ระบบจะล็อกข้อความฝั่งตรงข้ามเมื่อบันทึกงานสำเร็จ</div>
              </div>
            )}
            <div className="form-group">
              <label>ชื่องาน <span className="text-[var(--red)]">*</span></label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required className="premium-input w-full" placeholder="เช่น โทรตามลูกค้า, เตรียมเอกสาร" />
            </div>
            <div className="form-group">
              <label>รายละเอียด</label>
              <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="premium-input w-full" rows={2} placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)" />
              {editingId ? (
                <AttachmentsPanel
                  entityType="personal_task"
                  entityId={editingId}
                  canEdit={canManageTask(personalTasks.find((task) => task.id === editingId))}
                  inlineUpload
                />
              ) : (
                <div className="mt-1 flex flex-col items-end">
                  <button
                    type="button"
                    onClick={() => pendingFileRef.current?.click()}
                    disabled={saving}
                    className="inline-flex items-center gap-1 rounded-md border-0 bg-transparent px-1.5 py-1 text-[11px] font-medium text-[var(--text-2)] transition-colors hover:bg-[var(--panel-2)] hover:text-[var(--text)] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Paperclip size={13} />
                    <span>แนบไฟล์</span>
                  </button>
                  <input
                    ref={pendingFileRef}
                    type="file"
                    accept={UPLOAD_ACCEPT_ATTR}
                    multiple
                    onChange={selectPendingFiles}
                    className="hidden"
                  />
                  {pendingFiles.length > 0 && (
                    <div className="mt-1 w-full divide-y divide-[var(--border)]">
                      {pendingFiles.map((file) => {
                        const key = `${file.name}:${file.size}:${file.lastModified}`;
                        return (
                          <div key={key} className="flex items-center justify-between gap-2 py-1 text-xs">
                            <span className="flex min-w-0 items-center gap-1.5 text-[var(--text-2)]">
                              <FileText size={14} className="shrink-0" />
                              <span className="truncate">{file.name}</span>
                              <span className="shrink-0 text-[10px] text-[var(--text-3)]">({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setPendingFiles((current) => current.filter((item) => `${item.name}:${item.size}:${item.lastModified}` !== key))}
                              className="btn-icon danger shrink-0"
                              aria-label={`นำ ${file.name} ออกจากรายการแนบ`}
                              title="นำออก"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="pm-form-grid gap-3">
              <div className="form-group">
                <label>วันเริ่ม</label>
                <DateInput value={form.startDate} onChange={(value) => setForm((f) => ({ ...f, startDate: value }))} className="w-full" />
              </div>
              <div className="form-group">
                <label>กำหนดเสร็จ</label>
                <DateInput value={form.dueDate} onChange={(value) => setForm((f) => ({ ...f, dueDate: value }))} className="w-full" />
              </div>
            </div>

            <div className="pm-form-grid gap-3">
              <div className="form-group">
                <label><Tag size={12} style={{ display: "inline", verticalAlign: "-1px" }} /> หมวดหมู่</label>
                <Select fullWidth value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                  <option value="">— ไม่ระบุ —</option>
                  {TASK_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </Select>
              </div>
              <div className="form-group">
                <label>ระดับความยาก</label>
                <Select fullWidth value={String(form.difficulty)} onChange={(e) => setForm((f) => ({ ...f, difficulty: Number(e.target.value) }))}>
                  {DIFFICULTY_OPTIONS.map((d) => <option key={d} value={d}>{DIFFICULTY_LABELS[d]}</option>)}
                </Select>
              </div>
            </div>

            <div className="form-group">
              <label>ความสำคัญ</label>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button type="button" onClick={() => setForm((f) => ({ ...f, important: !f.important }))} className={`btn sm${form.important ? " btn-primary" : ""}`}><Star size={14} /> สำคัญ</button>
                <button type="button" onClick={() => setForm((f) => ({ ...f, urgent: !f.urgent }))} className={`btn sm${form.urgent ? " btn-primary" : ""}`}><Flame size={14} /> ด่วน</button>
              </div>
            </div>

            <div className="form-group">
              <label>เชื่อมกับ</label>
              <div className="segmented" style={{ marginBottom: "8px" }}>
                {[["none", "ไม่ผูก"], ["deal", "ดีล"]].map(([k, lbl]) => (
                  <button type="button" key={k} disabled={!!inquirySource} className={form.linkType === k ? "active" : ""} onClick={() => setForm((f) => ({ ...f, linkType: k }))}>{lbl}</button>
                ))}
              </div>
              {form.linkType === "deal" && (
                <>
                  <Select fullWidth disabled={!!inquirySource} value={form.dealId} onChange={(e) => setForm((f) => ({ ...f, dealId: e.target.value }))}>
                    <option value="">— เลือกดีลของทีม {me?.team || "ตัวเอง"} —</option>
                    {allDeals.map((deal) => {
                      const project = deal.projectId ? allProjects.find((row) => row.id === deal.projectId) : null;
                      return <option key={deal.id} value={deal.id}>{project ? `${project.code || project.id} · ` : ""}{deal.title}{deal.customerName ? ` — ${deal.customerName}` : ""}{!project ? " · ยังไม่ผูกโครงการ" : ""}</option>;
                    })}
                  </Select>
                  {!allDeals.length && !inquirySource && <div className="text-[11px] text-[var(--text-3)] mt-1">ไม่พบดีลในทีมของคุณที่สามารถผูกกับงานได้</div>}
                </>
              )}
            </div>

            <div className="form-group">
              <label><UserPlus size={12} style={{ display: "inline", verticalAlign: "-1px" }} /> มอบหมายให้ <span className="text-[11px] text-[var(--text-3)] font-normal">(งานจะไปอยู่ในรายการงานของคนนั้น)</span></label>
              <Select fullWidth value={form.assigneeId} onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}>
                <option value="">— ตัวฉันเอง —</option>
                {assignableUsers.filter((u) => u.id !== me?.id).map((u) => <option key={u.id} value={u.id}>{compactPersonName(u.name)}{u.team ? ` (${u.team})` : ""}</option>)}
              </Select>
              {me && !isSuperuser(me.role) && !TEAM_ROLES.includes(me.role) && (
                <div className="text-[11px] text-[var(--text-3)] mt-1">ตำแหน่งของคุณมอบหมายงานให้คนอื่นไม่ได้ — สร้างเป็นงานของตัวเองเท่านั้น</div>
              )}
            </div>

          </div>
          <div className="form-action-bar">
            <button type="button" onClick={() => setShowModal(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={saving} className="btn btn-primary px-8">{editingId ? "บันทึก" : "เพิ่ม"}</button>
          </div>
        </form>
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
    </div>
  );
}
