"use client";
import { TableGroupRow, TableScroll } from "@/components/ui/Table";
import { Fragment, useCallback, useState, useEffect, useMemo, useRef } from "react";
import useLatestRun from "@/lib/ui/useLatestRun";
import useRevalidateOnFocus from "@/lib/ui/useRevalidateOnFocus";
import useStickyState from "@/lib/ui/useStickyState";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListTodo, Search, CheckCircle2, Clock, AlertTriangle, User, Plus, Trash2, CircleDashed, Flame, ArrowUpDown, ArrowUp, ArrowDown, Calendar, Handshake, Tag, Star, UserPlus, ChevronLeft, ChevronRight, Pencil, BarChart3, HandHelping, MessageCircleQuestion, PauseCircle, CornerDownRight, Undo2, X } from "lucide-react";
import Modal from "@/components/Modal";
import TaskFormModal, { TASK_BLANK } from "@/components/pm/TaskFormModal";
import TaskNoteLine from "@/components/pm/TaskNoteLine";
import Button from "@/components/ui/Button";
import RowActionMenu from "@/components/ui/RowActionMenu";
import FilterPopover from "@/components/ui/FilterPopover";
import { CollapseAllButton, GroupMenu, SortDirButton, SortMenu } from "@/components/ui/ViewMenus";
import StatusSelect from "@/components/pm/StatusSelect";
import Segmented from "@/components/ui/Segmented";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import ReadableText from "@/components/ui/ReadableText";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Pager from "@/components/ui/Pager";
import { allBucketsCollapsed, bucketList, toggleBucketKey } from "@/lib/listGrouping";
import { usePagination } from "@/lib/usePagination";
import SaWorkspace, { Metric as SaMetric, MetricStrip as SaMetricStrip, WorkspaceSection as SaSection } from "@/components/ui/Workspace";
import { isSuperuser, assignableUsersFor, canPullTask, canReleaseTask, canChangeTaskStatus, taskCreditId, hasTeam, userTeams } from "@/lib/permissions";
import { useRole, useCan } from "@/lib/roleContext";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { fmtDateNumeric as fmtDate, naText, NA } from "@/lib/format";
import { daysToDue, isUrgent, taskUrgency } from "@/lib/pm/derived";
import { DIFFICULTY_LABELS, PERSONAL_TASK_STATUSES, TASK_STATUS_BLOCKED, eisenhowerQuadrant, isWaitingStatus, QUADRANT_LABELS } from "@/lib/pm/tasks";
import { daysWaiting } from "@/lib/pm/taskChain";
import { MINE_TASK_VIEWS, matchesMineTaskView, taskRelationship } from "@/lib/pm/taskViews";
import { compactPersonName } from "@/lib/personName";
import { cachedFetchJson } from "@/lib/apiCache";
import { RequestStatusBadge, requestDueTone } from "@/components/requests/requestUi";
import Textarea from "@/components/ui/Textarea";
import { liveDueDate } from "@/lib/requests/dueRound";
import { REQUEST_OPEN_STATUSES } from "@/lib/requests/statuses";
import { apiFetch } from "@/lib/apiFetch";

// ระบบมอบหมาย/ติดตามงาน (Sales Task Management) — งานทั้งหมดมาจาก personal_tasks
// (งานที่กรอก/มอบหมายเอง) เท่านั้น. ไม่ดึงงานขั้นตอนจากไทม์ไลน์ (project_tasks)
// อีกต่อไป — งานเหล่านั้นดู/แก้ที่หน้าไทม์ไลน์โดยตรง.

const TASK_STATUS_TH = { Pending: "รอ", "In Progress": "ทำอยู่", Blocked: "รอคนอื่น", Completed: "เสร็จ" };
const SCOPE_TH = { mine: "ของฉัน", team: "ทีม", all: "ทั้งหมด" };
const MINE_VIEW_TH = {
  [MINE_TASK_VIEWS.RESPONSIBLE]: "ต้องทำ",
  [MINE_TASK_VIEWS.DELEGATED]: "มอบหมายโดยฉัน",
  [MINE_TASK_VIEWS.ALL]: "ทั้งหมดของฉัน",
};

/* ป้ายกำหนดเสร็จข้างวันที่ — ตรรกะอยู่ที่ `taskUrgency` (lib/pm/derived.js) ที่นี่
   ทำแค่แปลง tone เป็นสี/ไอคอน · กติกาสี: แดง = เลยกำหนดและงานอยู่ในมือเรา ·
   ม่วง = รอคนอื่นอยู่ (นาฬิกาเดินต่อ แต่แยกสี/แยกยอดตามมติผู้ใช้ 2026-08-17) */
const URGENCY_TONE = {
  done: { color: "var(--green)", icon: <CheckCircle2 size={12} /> },
  overdue: { color: "var(--red)", icon: <AlertTriangle size={12} /> },
  soon: { color: "var(--amber)", icon: <Clock size={12} /> },
  waiting: { color: "var(--purple)", icon: <PauseCircle size={12} /> },
  idle: { color: "var(--text-3)", icon: <Clock size={12} /> },
  active: { color: "var(--text-2)", icon: <Clock size={12} /> },
};
const getUrgencyInfo = (task) => {
  const u = taskUrgency(task, { waiting: isWaitingStatus(task.status) });
  const tone = URGENCY_TONE[u.tone] || URGENCY_TONE.active;
  // เลยกำหนดใช้ไอคอนเตือนเสมอ แม้จะรอคนอื่นอยู่ (สีบอกว่าใครถือ ไอคอนบอกว่าเลยแล้ว)
  return { color: tone.color, label: u.label, icon: u.overdue ? <AlertTriangle size={12} /> : tone.icon };
};

const CHIP_BASE = { display: "inline-flex", alignItems: "center", gap: 3, padding: "1px 7px", borderRadius: 9 };
const CHIP_WAIT = { ...CHIP_BASE, maxWidth: 260, background: "color-mix(in srgb, var(--purple) 12%, transparent)", color: "var(--purple)" };
const CHIP_CHAIN = { ...CHIP_BASE, maxWidth: 220, background: "var(--panel-2)", color: "var(--text-2)", cursor: "default" };
const CHIP_CHAIN_LINK = { ...CHIP_CHAIN, cursor: "pointer" };
const CHIP_ICON = { flexShrink: 0 };
const CHIP_TEXT = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
const CHIP_SUFFIX = { flexShrink: 0, opacity: 0.75 };
/* คอลัมน์เชื่อมโยง: โครงการบน · ดีลล่าง — ชื่อดีลยาวได้ จึงตัดด้วย ellipsis
   แล้วบอกชื่อเต็มผ่าน title แทนการปล่อยให้ดันความกว้างคอลัมน์ */
const LINK_STACK = { display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 3 };
const LINK_PROJECT = { cursor: "pointer", fontSize: "var(--fs-2)", background: "var(--panel-2)", padding: "2px 6px", borderRadius: 4, border: "1px solid var(--border)" };
const LINK_DEAL = { cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, maxWidth: 200, fontSize: "var(--fs-2)", background: "color-mix(in srgb, var(--purple) 10%, transparent)", padding: "2px 7px", borderRadius: 4, color: "var(--purple)" };
const ROW_CHIPS = { display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4, fontSize: "var(--fs-2)" };
const MODAL_BODY = { padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 };
const MODAL_LEAD = { fontSize: "var(--fs-7)", color: "var(--text-3)" };
const MODAL_STRONG = { color: "var(--text)" };

const statusDot = (s) => s === "Completed" ? "var(--green)" : s === "In Progress" ? "var(--accent)" : isWaitingStatus(s) ? "var(--purple)" : "var(--text-3)";
const statusIcon = (s, size = 18) => s === "Completed" ? <CheckCircle2 size={size} /> : s === "In Progress" ? <Clock size={size} /> : isWaitingStatus(s) ? <PauseCircle size={size} /> : <CircleDashed size={size} />;

// ตัวกรองสถานะ — ตรงกับการ์ดสรุปด้านบน
// "ต้องรีบ" = งานที่ **อยู่ในมือเรา** และใกล้/เลยกำหนด — งานที่รอคนอื่นมีการ์ดของตัวเอง
// (แยกยอดตามมติผู้ใช้ 2026-08-17 ไม่งั้นการ์ดสั่งให้รีบกับงานที่เร่งเองไม่ได้ปนกัน)
const matchStatus = (t, filter) => {
  if (filter === "all") return true;
  if (filter === "progress") return t.status === "In Progress";
  if (filter === "waiting") return isWaitingStatus(t.status);
  if (filter === "urgent") return isUrgent(t) && !isWaitingStatus(t.status);
  if (filter === "done") return t.status === "Completed";
  return true;
};

const STATUS_ORDER = { "In Progress": 0, Blocked: 1, Pending: 2, Completed: 3 };
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

/* ── จัดกลุ่ม (มติผู้ใช้ 2026-08-15) — เฉพาะ **มุมมองตาราง** ────────────────
   มุมมองเมทริกซ์/ปฏิทินจัดกลุ่มด้วยแกนของตัวเองอยู่แล้ว (สำคัญ×ด่วน · วันที่)
   ⇒ ซ้อนอีกชั้นไม่ได้แปลว่าอะไร ปุ่มจึงโผล่เฉพาะตอนดูตาราง */
const GROUP_OPTIONS = [
  { value: "none", label: "ไม่จัดกลุ่ม" },
  { value: "assignee", label: "ผู้รับมอบหมาย" },
  { value: "category", label: "หมวด" },
  { value: "status", label: "สถานะ" },
];

// (มุมมองบอร์ด Kanban ถูกถอดออก — มติผู้ใช้ 2026-07-17: ซ้ำกับตัวกรองสถานะ
// บนตาราง และเป็นมุมมองเดียวที่ไล่โชว์ทุกงานโดยไม่ตัด)

// Eisenhower: 4 ช่อง สำคัญ × ด่วน — โชว์สูงสุดช่องละ MATRIX_MAX ใบ (ที่เหลือ
// สรุปเป็น "+N งาน" — มุมมองนี้ไว้กวาดตาจัดลำดับ ไม่ใช่ไล่รายการยาว)
const MATRIX_MAX = 8;
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

/* 🪤 ค่าตั้งต้นที่เป็น array ต้องเป็น **ตัวเดียวกันทุกเรนเดอร์** — `[]` เขียนสด
   ในวงเล็บจะเป็น array ใหม่ทุกครั้ง ซึ่งทำให้ตัวเทียบค่าคิดว่า "เปลี่ยนแล้ว" ตลอด */
const EMPTY = [];

export default function TasksPage() {
  const router = useRouter();
  const role = useRole();
  // สิทธิ์เขียนงาน (สร้าง/แก้ไข/ลบ/เปลี่ยนสถานะ) = pm:edit — ตรงกับ proxy ที่กัน
  // การเขียน /api/pm ด้วย pm:edit. viewer/staff (มีแค่ pm:view) เห็นหน้านี้แบบอ่านอย่างเดียว.
  const canEdit = useCan("pm:edit");
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const [lateModal, setLateModal] = useState(null); // {task, reason} — กรอกสาเหตุตอนปิดงานเลยกำหนด
  const [blockModal, setBlockModal] = useState(null); // {task, reason} — กรอก "รออะไร" ตอนเข้าสถานะรอคนอื่น
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const resolveConfirm = (result) => { setConfirmState((s) => { s?.resolve(result); return null; }); };

  const [scope, setScope] = useStickyState("scope", "mine");
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
  const [search, setSearch] = useStickyState("search", "");
  const [statusFilter, setStatusFilter] = useStickyState("statusFilter", "all"); // all | progress | urgent | done
  // ผู้รับมอบหมาย + หมวดหมู่ รวมใน FilterPopover เดียว (มาตรฐานทั้งระบบ มติ 2026-07-18)
  // — multi-select ทั้งคู่, ว่าง = ทั้งหมด. สถานะไม่อยู่ในแผงนี้เพราะเป็น drill-down
  // ของการ์ด KPI ด้านบน (มาตรฐาน: KPI/สโคป/เรียงลำดับ อยู่นอกปุ่มกรอง)
  const [assigneeFilter, setAssigneeFilter] = useStickyState("assigneeFilter", EMPTY);
  const [categoryFilter, setCategoryFilter] = useStickyState("categoryFilter", EMPTY);
  /* ⭐ กรองตามดีล — ตั้งต้นจาก `?dealId=` ที่หน้าดีล/หน้าโครงการส่งมา
     🐞 พารามิเตอร์ตัวนี้เคย **เปิดโมดัลสร้างงาน** แทนที่จะกรอง: ปุ่มบนหน้าดีลชื่อ
     "เปิด" กับบนหน้าโครงการชื่อ "เปิดหน้างาน" ทั้งคู่มีไอคอนลิงก์ออก ⇒ คนกดเพื่อ
     *ดูรายการ* แต่ได้ฟอร์มสร้างงานทับจอ แถมคิวที่อยู่ข้างหลังก็เป็นงานทั้งระบบ
     ไม่ได้กรองตามดีลที่กดมาเลย · ตอนนี้ "สร้างงาน" มีปุ่มของตัวเองอยู่ในหน้าดีล/
     โครงการแล้ว (โมดัลในหน้า) พารามิเตอร์นี้จึงเหลือความหมายเดียวคือกรอง */
  const [dealFilter, setDealFilter] = useState([]);
  const [sortKey, setSortKey] = useStickyState("sortKey", "created");
  const [sortDir, setSortDir] = useStickyState("sortDir", "asc");
  const [groupBy, setGroupBy] = useStickyState("groupBy", "none");
  const [collapsed, setCollapsed] = useState(() => new Set());
  // ปฏิทิน: เดือนที่กำลังดู (เริ่มที่เดือนปัจจุบัน)
  const [calRef, setCalRef] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });

  // task modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(TASK_BLANK);
  const [saving, setSaving] = useState(false);
  const [inquirySource, setInquirySource] = useState(null);
  const [chainSource, setChainSource] = useState(null); // {id, title} — งานก่อนหน้าตอนสร้างงานต่อเนื่อง

  // กันผลลัพธ์ที่มาช้า/สลับลำดับเมื่อสลับ scope เร็ว ๆ
  /* ⭐ หน้านี้เป็นหน้าแรกที่กันคำตอบมาผิดลำดับด้วยเลขลำดับที่เขียนเอง — ตอนนี้ยกออกไป
     เป็น `lib/ui/latestRun` แล้วให้ทุกหน้ารายการใช้ตัวเดียวกัน (พฤติกรรมเหมือนเดิมเป๊ะ) */
  const startRun = useLatestRun();
  const deepLinkHandled = useRef(false);
  const loadWork = async (sc, opts) => {
    const isLatest = startRun();
    /* โหมดเบื้องหลัง (ดึงเองตอนกลับมามองแท็บ) ห้ามพาหน้าไปอยู่สถานะโหลด —
       จอมีของอยู่แล้วและผู้ใช้ไม่ได้สั่งอะไร คิวงานต้องไม่หายแล้วโผล่ใหม่ */
    if (!opts?.background) setLoading(true);
    try {
      const res = await apiFetch(`/api/pm/my-work?scope=${sc}`);
      const d = res.ok ? await res.json() : {};
      if (!isLatest()) return;
      setPersonalTasks(d.personalTasks || []);
      setInquiries(d.inquiries || []);
      setProjectsMap(d.projects || {});
      setDealsMap(d.deals || {});
      if (d.me) setMe(d.me);
      if (d.allowedScopes) setAllowedScopes(d.allowedScopes);
      if (d.scope && d.scope !== sc) setScope(d.scope);
    } catch { /* ignore */ }
    finally { if (isLatest()) setLoading(false); }
  };

  useEffect(() => { loadWork(scope); }, [scope]);
  // ⚠️ ส่ง arrow ตรง ๆ ได้ — hook เก็บตัวล่าสุดไว้ใน ref อยู่แล้ว ไม่ต้องกลัว identity เปลี่ยน
  useRevalidateOnFocus(() => loadWork(scope, { background: true }));
  useEffect(() => {
    cachedFetchJson("/api/pm/assignable-users").then((u) => {
      setUsers(u || []);
      setUsersMap(Object.fromEntries((u || []).map((x) => [x.id, compactPersonName(x.name)])));
    }).catch(() => {});
    apiFetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).then((p) => setAllProjects(p || [])).catch(() => {});
    apiFetch("/api/pm/task-deals").then((r) => (r.ok ? r.json() : [])).then((d) => setAllDeals(d || [])).catch(() => {});
  }, []);

  // ผู้ใช้ที่ "ฉันมอบหมายงานให้ได้" — กติกาเดียวกับ server (เดิมเขียนเงื่อนไขซ้ำที่นี่เอง)
  const assignableUsers = useMemo(() => assignableUsersFor(me, users), [me, users]);

  const q = search.trim().toLowerCase();
  const resolveProj = (pid) => projectsMap[pid] || allProjects.find((p) => p.id === pid) || null;
  const resolveDeal = (did) => dealsMap[did] || allDeals.find((d) => d.id === did) || null;
  // ทีมของคนคนนั้น — เป็นอาร์เรย์เพราะคนเดียวอยู่ได้หลายทีม
  const userTeamOf = (id) => userTeams(users.find((u) => u.id === id));

  // ใครจัดการงานได้ (mirror server canManage): เจ้าของ/ผู้รับมอบ/superuser/หัวหน้าทีม
  const canManageTask = (t) => {
    if (!me) return false;
    if (!canEdit && me.role !== "rd") return false; // rd manages its own operational tasks
    if (t.ownerId === me.id || t.assigneeId === me.id) return true;
    if (isSuperuser(me.role)) return true;
    if (me.role === "senior_ae" && userTeams(me).length) {
      if (hasTeam(me, userTeamOf(t.assigneeId || t.ownerId))) return true;
      if (hasTeam(me, resolveProj(t.projectId)?.team)) return true;
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
      const res = await apiFetch(`/api/pm/personal-tasks/${t.id}`, {
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
      const res = await apiFetch(`/api/pm/personal-tasks/${t.id}`, {
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
    return ids.map((id) => ({ id, name: naText(usersMap[id]) })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [personalTasks, usersMap]);

  const categoryOptions = useMemo(
    () => Array.from(new Set(personalTasks.map((t) => t.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "th")),
    [personalTasks],
  );

  /* ตัวเลือกดีล = ดีลที่มีงานอยู่จริงในคิวนี้ (ไม่ใช่ทะเบียนดีลทั้งระบบ — เลือกดีลที่
     ไม่มีงานแล้วได้ตารางว่างคือตัวเลือกที่ไม่ควรมี) · ชื่อดีลมาจาก `resolveDeal`
     ⚠️ ดีลที่ถูกส่งมาทาง `?dealId=` ต้องอยู่ในลิสต์เสมอ แม้ยังไม่มีงานสักใบ — ไม่งั้น
     ชิปกรองจะโชว์ค้างโดยไม่มีทางปิดจากในแผง (และผู้ใช้ไม่รู้ว่ากรองอะไรค้างอยู่) */
  const dealOptions = useMemo(() => {
    const ids = Array.from(new Set([
      ...personalTasks.map((t) => t.dealId).filter(Boolean),
      ...dealFilter,
    ]));
    return ids
      .map((id) => ({ id, name: resolveDeal(id)?.title || id }))
      .sort((a, b) => a.name.localeCompare(b.name, "th"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personalTasks, dealFilter, dealsMap, allDeals]);

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
    .filter((t) => !assigneeFilter.length || assigneeFilter.includes(t.assigneeId || t.ownerId))
    .filter((t) => !categoryFilter.length || categoryFilter.includes(t.category))
    .filter((t) => !dealFilter.length || dealFilter.includes(t.dealId)),
    [roleFilteredTasks, q, assigneeFilter, categoryFilter, dealFilter]);

  const stats = useMemo(() => ({
    // "งานทั้งหมด" = งานที่ยังต้องทำ; งานเสร็จเก็บไว้ดูย้อนหลังในการ์ด "เสร็จแล้ว"
    all: pool.filter((t) => t.status !== "Completed").length,
    progress: pool.filter((t) => t.status === "In Progress").length,
    // แยกยอดตามมติผู้ใช้ 2026-08-17: งานที่รอคนอื่นไม่ปนกับ "ต้องรีบ" เพราะเร่งเองไม่ได้
    // — แต่ยอดเลยกำหนดของมันยังต้องเห็น (ขึ้นเป็นบรรทัดรองบนการ์ด)
    waiting: pool.filter((t) => isWaitingStatus(t.status)).length,
    waitingOverdue: pool.filter((t) => isWaitingStatus(t.status) && (daysToDue(t) ?? 0) < 0).length,
    urgent: pool.filter((t) => isUrgent(t) && !isWaitingStatus(t.status)).length,
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

  /* จัดกลุ่มเฉพาะมุมมองตาราง (ดู GROUP_OPTIONS) — จัดจากรายการที่เรียงแล้ว
     ⚠️ งานไม่มียอดเงิน ⇒ หัวกลุ่มโชว์แค่จำนวนงาน ไม่มีคอลัมน์ยอดรวม */
  const buckets = useMemo(() => {
    if (groupBy === "none" || view !== "table") return null;
    return bucketList(visible, (t) => {
      if (groupBy === "assignee") {
        const id = t.assigneeId || t.ownerId || "";
        return { key: id, label: id ? naText(usersMap[id]) : "ยังไม่มอบหมาย", missing: !id };
      }
      if (groupBy === "category") {
        const category = String(t.category || "").trim();
        return { key: category, label: category || "ไม่ระบุหมวด", missing: !category };
      }
      return { key: t.status, label: TASK_STATUS_TH[t.status] || t.status };
    });
  }, [visible, groupBy, view, usersMap]);

  const toggleBucket = useCallback((key) => setCollapsed((current) => toggleBucketKey(current, key)), []);
  const allCollapsed = allBucketsCollapsed(buckets, collapsed);

  // แบ่งหน้าเฉพาะมุมมองแบน (ตาราง/รายการ) — บอร์ด/เมทริกซ์/ปฏิทินแสดงครบตามเดิม
  const { page, setPage, pageSize, setPageSize, pageCount, total, pageRows } =
    usePagination(visible, {
      resetKey: `${scope}|${mineView}|${q}|${statusFilter}|${assigneeFilter.join()}|${categoryFilter.join()}|${sortKey}|${sortDir}`,
    });

  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const sortArrow = (key) => sortKey === key
    ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />;

  // ── CRUD ──
  const openAdd = () => { setEditingId(null); setInquirySource(null); setChainSource(null); setForm(TASK_BLANK); setShowModal(true); };

  /* งานต่อเนื่อง (mig 0266) — "จบใบนี้แล้วต่อใบไหน"
     ก๊อปบริบทของใบก่อนหน้ามาให้ (ดีล/โครงการ/หมวด/ผู้รับผิดชอบ) เพราะงานที่ต่อกัน
     เป็นสายเดียวกันแทบทุกครั้งอยู่ในดีลเดียวกัน — คนกรอกซ้ำทุกช่องคือค่าใช้จ่ายเปล่า
     สถานะเริ่มต้นปล่อยเป็น Pending แล้วให้ **ฝั่ง API** เป็นคนตัดสินว่าต้องล็อกเป็น
     "รอคนอื่น" ไหม (ใบก่อนหน้ายังไม่ปิด) — ตรรกะอยู่ที่เดียวคือ chainStatusOnLink */
  const openFollowUp = (t) => {
    setEditingId(null);
    setInquirySource(null);
    setChainSource({ id: t.id, title: t.title });
    setForm({
      ...TASK_BLANK,
      predecessorId: t.id,
      dealId: t.dealId || "",
      projectId: t.projectId || "",
      category: t.category || "",
      assigneeId: t.assigneeId || "",
    });
    setShowModal(true);
  };
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inquiryId = params.get("inquiryId");
    const messageId = params.get("messageId");
    const dealId = params.get("dealId");
    if (deepLinkHandled.current || (!inquiryId && !dealId)) return;
    deepLinkHandled.current = true;
    if (inquiryId) {
      // ⚠️ ต้นทางคือ **คำร้องข้ามฝ่าย** (dept_requests) แล้ว — ระบบสอบถามเดิมถูก
      // ปลดระวางใน mig 0174 พร้อม API /api/sales-planning/inquiries · พารามิเตอร์
      // ยังชื่อ inquiryId ตามคอลัมน์ personal_tasks.inquiryId (หนี้ที่รู้ตัว ดู
      // api/pm/personal-tasks/route.js) แต่ค่าคือ id ของคำร้อง
      (async () => {
        const res = await apiFetch(`/api/sa/requests/${inquiryId}`);
        const req = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(req.error || "โหลดคำร้องต้นทางไม่สำเร็จ");
        // เธรดไม่ได้ติดมากับคำร้อง — อยู่ตารางกลาง entity_updates ต้องขอแยก
        // (ขอเฉพาะตอนมี messageId จะได้ไม่ยิงฟรีทุกครั้งที่เปิดจากหัวเรื่อง)
        let message = null;
        if (messageId) {
          const msgRes = await apiFetch(`/api/updates?entityType=dept_request&entityId=${encodeURIComponent(inquiryId)}`);
          const thread = await msgRes.json().catch(() => ({}));
          if (!msgRes.ok) throw new Error(thread.error || "โหลดข้อความต้นทางไม่สำเร็จ");
          message = (thread.items || []).find((item) => item.id === messageId && !item.deletedAt) || null;
          if (!message) throw new Error("ไม่พบข้อความต้นทาง");
        }
        // หัวเรื่องเป็น null ได้ในชนิดขอราคา (บรรทัดบอกเองว่าถามอะไร) → ถอยไปที่ body
        const sourceText = message?.body?.trim() || req.title?.trim() || req.body?.trim() || "งานจากคำร้องข้ามฝ่าย";
        const returnToRaw = params.get("returnTo") || `/requests/${inquiryId}`;
        const returnTo = returnToRaw.startsWith("/") && !returnToRaw.startsWith("//") ? returnToRaw : `/requests/${inquiryId}`;
        setEditingId(null);
        setInquirySource({ inquiryId, messageId: message?.id || null, code: req.docNo || req.id, returnTo });
        setForm({
          ...TASK_BLANK,
          title: `[${req.docNo || "คำร้อง"}] ${sourceText.slice(0, 120)}`,
          note: sourceText,
          // ⚠️ ผ่าน `liveDueDate` — ใบที่มีรอบแก้ค้างถือวันของรอบก่อนซึ่งเป็นอดีต
          //    เอามาตั้งเป็นกำหนดของงานใหม่แล้วงานเกิดมาก็เลยกำหนดทันที
          dueDate: liveDueDate(req) || req.requestedDueDate || "",
          dealId: req.dealId || "",
          category: "ประสานงานภายใน",
          important: !!req.urgent,
          urgent: !!req.urgent,
        });

        setShowModal(true);
      })().catch((error) => setToast({ kind: "error", msg: error.message || "เปิดฟอร์มสร้างงานไม่สำเร็จ" }));
      return;
    }
    // ⭐ `?dealId=` = **กรองคิวตามดีล** ไม่ใช่เปิดฟอร์มสร้าง (ดู `dealFilter` ข้างบน)
    setDealFilter([dealId]);
  }, []);
  // แก้ = ส่ง task ให้โมดัลไปเติมฟอร์มเอง (taskToForm) — ไม่ต้อง map ซ้ำที่นี่
  const openEdit = (t) => {
    setEditingId(t.id);
    setInquirySource(null);
    setChainSource(null);
    setShowModal(true);
  };
  const applyStatus = async (t, status, { lateReason, blockedReason } = {}) => {
    setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status } : x));
    try {
      const res = await apiFetch(`/api/pm/personal-tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status,
          ...(lateReason ? { lateReason } : {}),
          ...(blockedReason ? { blockedReason } : {}),
        }),
      });
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
    // เข้าสถานะ "รอคนอื่น" → ต้องบอกว่ารออะไร (ด่านเดียวกับฝั่ง API) ไม่งั้นคิวจะเต็มไปด้วย
    // งานที่ไม่มีใครรู้ว่าค้างอยู่ที่ใคร แล้วไม่มีใครตามได้
    if (status === TASK_STATUS_BLOCKED) { setBlockModal({ task: t, reason: t.blockedReason || "" }); return; }
    applyStatus(t, status);
  };
  const statusSelect = (t) => (
    <StatusSelect value={t.status} variant="short" statuses={PERSONAL_TASK_STATUSES} onClick={(e) => e.stopPropagation()} onChange={(v) => setTaskStatus(t, v)} title="เปลี่ยนสถานะ" />
  );
  // สถานะ: แก้ได้ (ผู้รับผิดชอบ/ผู้ทำแทน/หัวหน้า) → dropdown, ไม่งั้น → ป้ายอ่านอย่างเดียว
  const statusCell = (t) => canSetStatus(t)
    ? statusSelect(t)
    : <span className={`status-pill dot ${t.status === "Completed" ? "success" : ""}`} style={{ "--dot": statusDot(t.status) }}>{TASK_STATUS_TH[t.status] || t.status}</span>;

  /* ป้าย "รออะไรอยู่" + "ต่อจากงานไหน" — ต้องอ่านได้จากแถวโดยไม่ต้องกางรายละเอียด
     เพราะสองอย่างนี้คือคำตอบของคำถามที่คนเปิดหน้านี้มาถามจริง ๆ ("ทำไมยังไม่เสร็จ")
     ⚠️ ชื่องานก่อนหน้าอ่านจากรายการที่โหลดมาแล้วเท่านั้น — ห้ามยิง API รายแถว
     (ใบก่อนหน้าอยู่นอกสโคปที่โหลดมาได้ เช่นงานของทีมอื่น → โชว์แบบไม่มีชื่อ) */
  const taskById = useMemo(() => new Map(personalTasks.map((t) => [t.id, t])), [personalTasks]);
  const waitingBadge = (t) => {
    if (!isWaitingStatus(t.status)) return null;
    const days = daysWaiting(t, todayISO);
    const label = t.blockedReason || "รอคนอื่น";
    return (
      <span title={`${label}${days !== null ? ` · รอมาแล้ว ${days} วัน` : ""}`} style={CHIP_WAIT}>
        <PauseCircle size={10} style={CHIP_ICON} />
        <span style={CHIP_TEXT}>{label}</span>
        {days !== null && days > 0 && <span style={CHIP_SUFFIX}>· {days} วัน</span>}
      </span>
    );
  };
  const chainBadge = (t) => {
    if (!t.predecessorId) return null;
    const prev = taskById.get(t.predecessorId);
    return (
      <span
        title={prev ? `ต่อจากงาน “${prev.title}”` : "ต่อจากงานก่อนหน้า (อยู่นอกรายการที่กำลังดู)"}
        onClick={prev ? (e) => { e.stopPropagation(); router.push(`/sa/tasks/${prev.id}`); } : undefined}
        style={prev ? CHIP_CHAIN_LINK : CHIP_CHAIN}
      >
        <CornerDownRight size={10} style={CHIP_ICON} />
        <span style={CHIP_TEXT}>ต่อจาก {prev ? prev.title : "งานก่อนหน้า"}</span>
      </span>
    );
  };

  // ป้ายสำหรับข้อมูลเก่าที่ยังมี proxyBy (งานใหม่จะย้าย assignee จริง)
  const proxyBadge = (t) => {
    if (!t.proxyBy) return null;
    const name = usersMap[t.proxyBy] || "ใครบางคน";
    const mine = t.proxyBy === me?.id;
    return (
      <span title={`ทำแทนโดย ${name} · งานนี้คิด KPI ให้ ${name}`} style={{ display: "inline-flex", alignItems: "center", gap: "3px", background: "color-mix(in srgb, var(--accent) 14%, transparent)", padding: "1px 7px", borderRadius: "9px", color: "var(--accent)", fontWeight: "var(--fw-medium)" }}>
        <HandHelping size={11} style={{ display: "inline", verticalAlign: "-1px" }} /> {mine ? "ฉันทำแทน" : name}
      </span>
    );
  };

  /* เมนู "…" ท้ายแถว — มติผู้ใช้ 2026-08-01 (RowActionMenu): แถวเหลือ **ปุ่มก้าวถัดไป
     1 ปุ่ม + เมนูรวมที่เหลือ** · ที่นี่ก้าวถัดไปคือ "ต่องาน" (มติผู้ใช้ 2026-08-17)
     ส่วนแก้ไข/ลบ/ดึงงาน เป็นการจัดการตัวงาน ไม่ใช่สิ่งที่คนกวาดตาหาในคิว */
  const rowMenu = (t) => {
    const manage = canManageTask(t);
    return [
      canPull(t) && {
        id: "pull", label: "ดึงงานมาเป็นของฉัน", icon: HandHelping,
        onClick: () => takeResponsibility(t),
      },
      // ข้อมูลเก่าที่ยังมี proxyBy — งานใหม่ย้าย assignee จริงแล้วไม่เข้าเส้นนี้
      t.proxyBy && canRelease(t) && {
        id: "release", label: "คืนงานทำแทนเดิม", icon: Undo2,
        onClick: () => releaseLegacyProxy(t),
      },
      manage && { id: "edit", label: "แก้ไขงาน", icon: Pencil, onClick: () => openEdit(t) },
      manage && {
        id: "delete", label: "ลบงาน", icon: Trash2, tone: "danger", separatorBefore: true,
        onClick: () => deletePersonal(t),
      },
    ].filter(Boolean);
  };

  /* ปุ่มสร้างงานต่อเนื่อง — เงื่อนไขเดียวกับปุ่ม "เพิ่มงาน" (สร้างงานใหม่ ไม่ใช่แก้ใบนี้)
     จึงไม่ผูกกับ canManageTask: คนที่เห็นงานของทีมและมีสิทธิ์สร้างงาน ต่องานจากมันได้ */
  const canWriteTasks = canEdit || role === "rd";
  const followUpButton = (t) => canWriteTasks ? (
    <Button iconOnly onClick={(e) => { e.stopPropagation(); openFollowUp(t); }} aria-label="สร้างงานต่อเนื่อง" title="สร้างงานต่อเนื่องจากงานนี้" icon={<CornerDownRight size={14} />} />
  ) : null;

  const deletePersonal = async (t) => {
    if (!(await askConfirm({ title: "ลบงาน", message: `ลบงาน "${t.title}" ?`, confirmLabel: "ลบ" }))) return;
    const res = await apiFetch(`/api/pm/personal-tasks/${t.id}`, { method: "DELETE" });
    if (res.ok) setPersonalTasks((prev) => prev.filter((x) => x.id !== t.id));
    else setToast({ kind: "error", msg: "ลบไม่สำเร็จ" });
  };

  const STAT_CARDS = [
    { key: "all", label: "งานทั้งหมด", count: stats.all, color: "var(--accent)", icon: <ListTodo size={18} /> },
    { key: "progress", label: "กำลังทำ", count: stats.progress, color: "var(--blue)", icon: <Clock size={18} /> },
    // ต้องรีบ = งานที่อยู่ในมือเรา · รอคนอื่น = งานที่เร่งเองไม่ได้ (บรรทัดรองบอกว่า
    // ในนั้นเลยกำหนดไปกี่ใบ — ต้องเห็น ไม่งั้นงานที่รอเงียบ ๆ จนเลยเดดไลน์ไม่มีใครทวง)
    { key: "urgent", label: "ต้องรีบ", count: stats.urgent, color: "var(--red)", icon: <Flame size={18} /> },
    {
      key: "waiting", label: "รอคนอื่น", count: stats.waiting, color: "var(--purple)", icon: <PauseCircle size={18} />,
      overrideNote: stats.waitingOverdue > 0 ? `เลยกำหนดแล้ว ${stats.waitingOverdue} งาน` : null,
    },
    { key: "done", label: "เสร็จแล้ว", count: stats.done, color: "var(--green)", icon: <CheckCircle2 size={18} /> },
  ];

  // ป้ายกำกับ (โครงการ/ไทม์ไลน์) ใช้ซ้ำทั้ง card + table
  /* คอลัมน์ "เชื่อมโยง" — **โครงการบน · ดีลล่าง** (มติผู้ใช้ 2026-08-17)
     เรียงบนล่างไม่ใช่ต่อกันในบรรทัดเดียว เพราะเป็นของคนละชั้น (โครงการคือภาชนะ
     ดีลอยู่ข้างใน) และชื่อดีลยาวจนดันคอลัมน์อื่นเมื่อวางต่อท้ายรหัสโครงการ */
  const linkChip = (t) => {
    const proj = t.projectId ? resolveProj(t.projectId) : null;
    const deal = t.dealId ? resolveDeal(t.dealId) : null;
    if (!proj && !deal) return null;
    return (
      <span style={LINK_STACK}>
        {proj && (
          <span
            onClick={(e) => { e.stopPropagation(); router.push(`/sa/projects/${proj.code || t.projectId}`); }}
            title={`โครงการ ${proj.code || ""}${proj.name ? ` · ${proj.name}` : ""}`.trim()}
            className="font-mono"
            style={LINK_PROJECT}
          >
            {proj.code}
          </span>
        )}
        {deal && (
          <span
            onClick={(e) => { e.stopPropagation(); router.push(`/sa/deals/${deal.id}`); }}
            title={`ดีล ${deal.title}`}
            style={LINK_DEAL}
          >
            <Handshake size={10} style={CHIP_ICON} />
            <span style={CHIP_TEXT}>{deal.title}</span>
          </span>
        )}
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
        style={{ display: "inline-flex", alignItems: "center", gap: 3, padding: compact ? "1px 5px" : "2px 7px", borderRadius: 9, color: palette.color, background: palette.background, fontSize: compact ? "var(--fs-1)" : "var(--fs-2)", fontWeight: "var(--fw-semibold)" }}
      >
        <UserPlus size={compact ? 9 : 10} /> {compact ? relationship.compactLabel : relationship.label}
      </span>
    );
  };

  // การ์ดย่อ — ใช้ในมุมมองบอร์ด (Kanban) และเมทริกซ์ (Eisenhower)
  const miniCard = (t) => {
    const u = getUrgencyInfo(t);
    const done = t.status === "Completed";
    const activeAssignee = t.assigneeId || t.ownerId;
    const assigneeName = activeAssignee ? (naText(usersMap[activeAssignee])) : null;
    const showFooter = canSetStatus(t) || canWriteTasks || rowMenu(t).length > 0;
    return (
      <div key={t.id} onClick={() => router.push(`/sa/tasks/${t.id}`)} title="คลิกเพื่อดูรายละเอียดงาน" className="glass-panel" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px", borderLeft: `3px solid ${statusDot(t.status)}`, cursor: "pointer" }}>
        <div style={{ fontSize: "var(--fs-7)", fontWeight: "var(--fw-semibold)", textDecoration: done ? "line-through" : "none", color: done ? "var(--text-3)" : "var(--text)", display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
          {t.important && <Star size={12} color="var(--amber)" fill="var(--amber)" />}
          {t.urgent && <Flame size={12} color="var(--red)" />}
          {t.title}
        </div>
        <TaskNoteLine text={t.note} />
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "var(--fs-2)" }}>
          {t.category && <span style={{ background: "var(--panel-2)", padding: "1px 6px", borderRadius: "9px", color: "var(--text-2)" }}>{t.category}</span>}
          {relationshipBadge(t, true)}
          {(scope !== "mine" || (activeAssignee && activeAssignee !== me?.id)) && assigneeName && (
            <span style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "1px 6px", borderRadius: "9px", color: "var(--accent)" }}><User size={9} style={{ display: "inline", verticalAlign: "-1px" }} /> {assigneeName}</span>
          )}
          {proxyBadge(t)}
          {waitingBadge(t)}
          {chainBadge(t)}
          {t.dueDate && <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: u.color }}>{u.icon} {fmtDate(t.dueDate)}</span>}
        </div>
        {showFooter && (
          <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "4px" }}>
            <div>{canSetStatus(t) && statusSelect(t)}</div>
            <div style={{ display: "flex", gap: "2px" }}>
              {followUpButton(t)}
              <RowActionMenu label={`การจัดการของงาน ${t.title}`} items={rowMenu(t)} />
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

  /* ── แถวของงานหนึ่งงาน (มุมมองตาราง) — ใช้ทั้งโหมดปกติและโหมดจัดกลุ่ม ────
     ⚠️ ฟังก์ชันตัวเดียว ไม่ใช่ markup สองสำเนาในสองสาขาของ tbody (AGENTS.md) */
  const taskRow = (t) => {
            const u = getUrgencyInfo(t);
            return (
              <tr key={t.id} className="premium-row" onClick={() => router.push(`/sa/tasks/${t.id}`)} title="คลิกเพื่อดูรายละเอียดงาน" style={{ cursor: "pointer" }}>
                <td onClick={(e) => e.stopPropagation()}>{statusCell(t)}</td>
                <td style={{ fontWeight: "var(--fw-medium)", minWidth: "220px" }}>
                  <div style={{ whiteSpace: "normal", wordBreak: "break-word", maxWidth: "450px", lineHeight: 1.4 }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "6px", flexWrap: "wrap" }}>
                      {t.important && <Star size={13} color="var(--amber)" fill="var(--amber)" style={{ flexShrink: 0, marginTop: "2px" }} />}
                      {t.urgent && <Flame size={13} color="var(--red)" style={{ flexShrink: 0, marginTop: "2px" }} />}
                      <span style={{ flex: 1 }}>{t.title}</span>
                    </div>
                    {t.note && <ReadableText text={t.note} lines={2} style={{ fontSize: "var(--fs-3)", color: "var(--text-3)", marginTop: "4px" }} />}
                    {(isWaitingStatus(t.status) || t.predecessorId) && (
                      <div style={ROW_CHIPS}>
                        {waitingBadge(t)}
                        {chainBadge(t)}
                      </div>
                    )}
                  </div>
                </td>
                {scope === "mine" && <td>{relationshipBadge(t)}</td>}
                <td>{t.category ? <span style={{ fontSize: "var(--fs-3)", background: "var(--panel-2)", padding: "2px 8px", borderRadius: "12px" }}>{t.category}</span> : <span style={{ color: "var(--text-3)" }}>{NA}</span>}</td>
                {scope !== "mine" && <td style={{ fontSize: "var(--fs-7)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span>{(t.assigneeId || t.ownerId) ? (naText(usersMap[t.assigneeId || t.ownerId])) : <span style={{ color: "var(--text-3)" }}>{NA}</span>}</span>
                    {proxyBadge(t)}
                  </div>
                </td>}
                <td style={{ fontSize: "var(--fs-7)" }}>{DIFFICULTY_LABELS[t.difficulty] || DIFFICULTY_LABELS[2]}</td>
                <td>
                  {t.dueDate ? (
                    <>
                      <div style={{ fontSize: "var(--fs-7)" }}>{fmtDate(t.dueDate)}</div>
                      <div style={{ fontSize: "var(--fs-3)", color: u.color, display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>{u.icon} {u.label}</div>
                    </>
                  ) : <span style={{ color: "var(--text-3)" }}>{NA}</span>}
                </td>
                <td onClick={(e) => e.stopPropagation()}>{linkChip(t) || <span style={{ color: "var(--text-3)" }}>{NA}</span>}</td>
                <td onClick={(e) => e.stopPropagation()} style={{ textAlign: "right" }}>
                  <div style={{ display: "flex", gap: "4px", justifyContent: "flex-end" }}>
                    {followUpButton(t)}
                    <RowActionMenu label={`การจัดการของงาน ${t.title}`} items={rowMenu(t)} />
                  </div>
                </td>
              </tr>
            );
  };

  return (
    <SaWorkspace
      icon={<ListTodo size={22} />}
      title="งาน (Tasks)"
      subtitle={`มอบหมาย ติดตาม และวัดผลงานรายคน/รายทีม — เชื่อมกับโครงการและไทม์ไลน์ได้${me && (me.role === "senior_ae" ? " · คุณติดตามงานของทีมได้" : isSuperuser(me?.role) ? " · คุณติดตามงานได้ทุกทีม" : "")}`}
      headerRight={
        <div className="flex gap-3 items-center flex-wrap">
          <ViewSwitcher value={view} onChange={setView} modes={["list", "table", "calendar", "matrix"]} />
          {(canEdit || role === "rd") && <button onClick={openAdd} className="btn btn-accent"><Plus size={16} /> เพิ่มงาน</button>}
        </div>
      }
    >
      <div className="flex flex-col gap-4">

      {/* scope tabs */}
      {/* ไม่มี marginBottom — คอลัมน์นอกเป็น flex gap-4 (16px) เจ้าของจังหวะ
          margin ที่นี่จะทบเป็น 34px (วัดจริง 2026-08-08) */}
      {/* ⚠️ ทั้งสองชั้นใช้ Segmented ตัวกลาง ไม่ใช่ .segmented ที่เขียนปุ่มเอง —
          ของเดิมเขียนเองทั้งคู่จึงไม่มีการเดินด้วยลูกศร/โฟกัสแบบ roving tabindex
          และป้ายจำนวนต้องมาเป็น `count` (ไม่ใช่ "(12)" ต่อท้ายชื่อ) ดูเหตุผลใน Segmented.js */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        {allowedScopes.length > 1 && (
          <Segmented
            ariaLabel="ขอบเขตของรายการงาน"
            className="scope-toggle"
            value={scope}
            onChange={(next) => { setScope(next); setAssigneeFilter([]); }}
            options={allowedScopes.map((s) => ({
              value: s,
              label: role === "rd" && s === "team" ? "ทีม RD" : SCOPE_TH[s],
            }))}
          />
        )}

        {/* ⚠️ ไม่มี count ที่ชั้นขอบเขต — ทีม/ทั้งหมด ดึงข้อมูลคนละชุดจาก API
            (loadWork(scope)) ตัวเลขจึงต้องยิงเพิ่มทุกครั้งที่เข้าหน้า ส่วนชั้นบทบาท
            แบ่งจากชุดที่โหลดมาแล้ว นับได้ฟรี */}
        {scope === "mine" && (
          <Segmented
            ariaLabel="บทบาทของฉันในงาน"
            className="scope-toggle"
            value={mineView}
            onChange={setMineView}
            options={Object.values(MINE_TASK_VIEWS).map((taskView) => ({
              value: taskView,
              label: MINE_VIEW_TH[taskView],
              count: mineViewCounts[taskView] || 0,
            }))}
          />
        )}
      </div>

      {/* ── ข้อสอบถามค้างของฝ่าย (role rd) — คิวเดียวกับงาน: ตอบในเธรด ── */}
      {inquiries.length > 0 && (
        <SaSection icon={<MessageCircleQuestion size={17} />} title="คำร้องจากฝ่ายขาย" subtitle="เรื่องที่ฝ่ายของคุณต้องตอบหรือติดตาม" actions={<><span className="ui-badge" style={{ color: "var(--amber)" }}>{inquiries.filter((q) => REQUEST_OPEN_STATUSES.includes(q.status)).length} รอตอบ</span><Link href="/requests" className="linklike">ดูทั้งหมด</Link></>}>
          {/* 🐞 **สามช่องนี้เคยเป็นชื่อของตาราง `inquiries` เก่า** (ตรวจย้อนหลัง 2026-08-26)
              — แหล่งข้อมูลย้ายมาเป็น `dept_requests` ตั้งแต่ mig 0174 แต่บล็อกนี้ไม่ได้
              ตามไปด้วย ⇒ `q.code` · `q.requesterName` · `q.dueDate` เป็น undefined ทั้งหมด
              ผลบนจอ: เลขที่ใบหาย · ขึ้น "โดย —" ทุกบรรทัด · บล็อกกำหนดตอบไม่เคยเรนเดอร์เลย
              ⚠️ ชื่อจริงคือ `docNo` · `requestedByName` · และวันกำหนดส่งต้องผ่าน
              `liveDueDate` เหมือนทุกจอ (ใบที่มีรอบแก้ค้างต้องไม่โชว์วันของรอบก่อน) */}
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
            {inquiries.slice(0, 8).map((q) => {
              const due = requestDueTone(q, todayISO);
              const dueDate = liveDueDate(q);
              return (
                <li key={q.id} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: "var(--fs-7)" }}>
                  <RequestStatusBadge request={q} />
                  {q.urgent && <span className="ui-badge" style={{ color: "var(--red)" }}>ด่วน</span>}
                  <Link href={`/requests/${q.id}`} className="linklike" style={{ fontWeight: "var(--fw-semibold)" }}>
                    {q.docNo ? `${q.docNo} · ` : ""}{q.title}
                  </Link>
                  <span style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>โดย {naText(q.requestedByName)}</span>
                  {dueDate && (
                    <span className="mono" style={{ marginLeft: "auto", fontSize: "var(--fs-5)", color: due?.color || "var(--text-3)" }}>
                      กำหนดตอบ {fmtDate(dueDate)}{due ? ` · ${due.label}` : ""}
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
            /* บรรทัดรอง: การ์ดที่มีตัวเลขซ่อนอยู่ข้างใน (เช่น "รอคนอื่น" ที่เลยกำหนดแล้ว)
               ต้องพูดออกมา — สำคัญกว่าคำใบ้ว่ากดได้ ซึ่งการ์ดอื่นบอกอยู่แล้ว */
            <SaMetric key={c.key} as="button" type="button" onClick={() => setStatusFilter(active && c.key !== "all" ? "all" : c.key)} active={active} icon={c.icon} label={c.label} value={c.count} note={c.overrideNote || (active ? "กำลังใช้ตัวกรองนี้" : "กดเพื่อกรองรายการ")} tone={c.key === "done" ? "good" : c.key === "urgent" ? "danger" : c.key === "waiting" ? "warning" : undefined} aria-pressed={active} />
          );
        })}
      </SaMetricStrip>

      {/* ── แถบเครื่องมือ ── */}
      <SaSection icon={<ListTodo size={17} />} title="รายการงาน" subtitle="ค้นหา กรอง และสลับมุมมองเพื่อติดตามงาน" actions={<span className="ui-badge">{visible.length} งาน</span>}>
      <div className="toolbar">
        <div className="search-glass" style={{ width: "260px", maxWidth: "100%" }}>
          <Search size={18} color="var(--text-3)" />
          <input autoComplete="off" type="text" placeholder="ค้นหางาน..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {statusFilter !== "all" && (
          <button onClick={() => setStatusFilter("all")} className="btn sm">
            กรอง: {STAT_CARDS.find((c) => c.key === statusFilter)?.label} <span style={{ fontWeight: "var(--fw-bold)" }}>×</span>
          </button>
        )}
        {/* หมวดหมู่/ผู้รับมอบหมาย = ตัวเลือกจากงานที่โหลดมา — ซ่อนหมวดที่มีค่าเดียว
            (กรองแล้วไม่เปลี่ยนอะไร) และซ่อนผู้รับมอบหมายในสโคป "ของฉัน" ตามเดิม */}
        {(categoryOptions.length > 1 || dealOptions.length > 1 || dealFilter.length > 0 || (scope !== "mine" && assigneeOptions.length > 1)) && (
          <FilterPopover
            count={categoryFilter.length + assigneeFilter.length + dealFilter.length}
            onClear={() => { setCategoryFilter([]); setAssigneeFilter([]); setDealFilter([]); }}
            groups={[
              ...(dealOptions.length > 1 || dealFilter.length ? [{
                key: "deal", label: "ดีล", icon: Handshake,
                options: dealOptions.map((d) => ({ value: d.id, label: d.name })),
                selected: dealFilter, onChange: setDealFilter,
              }] : []),
              ...(categoryOptions.length > 1 ? [{
                key: "category", label: "หมวดหมู่", icon: Tag,
                options: categoryOptions.map((c) => ({ value: c, label: c })),
                selected: categoryFilter, onChange: setCategoryFilter,
              }] : []),
              ...(scope !== "mine" && assigneeOptions.length > 1 ? [{
                key: "assignee", label: "ผู้รับมอบหมาย", icon: User,
                options: assigneeOptions.map((a) => ({ value: a.id, label: a.name })),
                selected: assigneeFilter, onChange: setAssigneeFilter,
              }] : []),
            ]}
          />
        )}
        {/* จัดกลุ่ม/เรียง = ปุ่มทรงเดียวกับปุ่มตัวกรอง (ui/ViewMenus) — ชุดเดียวกับ
            ทุกตารางในระบบ · ปุ่มจัดกลุ่มโผล่เฉพาะมุมมองตาราง */}
        {view === "table" && (
          <>
            <GroupMenu
              title="จัดกลุ่มงาน"
              value={groupBy}
              onChange={(value) => { setGroupBy(value); setCollapsed(new Set()); }}
              options={GROUP_OPTIONS}
            />
            {!!buckets?.length && (
              <CollapseAllButton
                collapsed={allCollapsed}
                onToggle={() => setCollapsed(allCollapsed ? new Set() : new Set(buckets.map((bucket) => bucket.key)))}
              />
            )}
          </>
        )}
        <div className="spacer" />
        <SortMenu
          title="เรียงลำดับงาน"
          value={sortKey}
          defaultValue="created"
          onChange={(value) => { setSortKey(value); setSortDir("asc"); }}
          options={SORT_OPTIONS.map((option) => ({ value: option.key, label: option.label }))}
        />
        <SortDirButton dir={sortDir} onToggle={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} />
        </div>

      {loading ? (
        <SkeletonRows />
      ) : view === "matrix" ? (
        /* ── Eisenhower matrix (สำคัญ × ด่วน) ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px", alignItems: "start" }}>
          {MATRIX_QUADS.map((quad) => {
            const items = visible.filter((t) => eisenhowerQuadrant(t) === quad.key);
            return (
              <div key={quad.key} className="glass-panel" style={{ padding: 0, overflow: "hidden", borderTop: `3px solid ${quad.color}` }}>
                <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)" }}>
                  <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-7)", color: quad.color }}>
                    {QUADRANT_LABELS[quad.key]}
                    <span style={{ marginLeft: "8px", fontSize: "var(--fs-5)", color: "var(--text-3)", fontWeight: "var(--fw-medium)" }}>{items.length}</span>
                  </div>
                  <div style={{ fontSize: "var(--fs-3)", color: "var(--text-3)" }}>{quad.sub}</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "12px", minHeight: "60px" }}>
                  {items.length === 0 ? <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", textAlign: "center", padding: "12px 0" }}>{NA}</div> : items.slice(0, MATRIX_MAX).map(miniCard)}
                  {items.length > MATRIX_MAX && (
                    <button type="button" className="linklike" style={{ alignSelf: "center", fontSize: "var(--fs-5)" }} onClick={() => setView("table")}>
                      +{items.length - MATRIX_MAX} งาน — ดูทั้งหมดในตาราง
                    </button>
                  )}
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
            <div style={{ fontWeight: "var(--fw-bold)", fontSize: "var(--fs-9)", minWidth: "170px", textAlign: "center" }}>{MONTHS_TH[calRef.m]} {calRef.y}</div>
            <button className="btn-icon" onClick={() => shiftMonth(1)} aria-label="เดือนถัดไป"><ChevronRight size={16} /></button>
          </div>
          <div className="glass-panel" style={{ padding: "10px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px", marginBottom: "4px" }}>
              {WEEKDAYS_TH.map((w) => <div key={w} style={{ textAlign: "center", fontSize: "var(--fs-3)", fontWeight: "var(--fw-bold)", color: "var(--text-3)", padding: "4px 0" }}>{w}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: "4px" }}>
              {calCells.map((d, i) => {
                if (!d) return <div key={i} style={{ minHeight: "84px", borderRadius: "8px", background: "color-mix(in srgb, var(--panel-2) 40%, transparent)" }} />;
                const dayKey = ymd(d);
                const items = calByDate.get(dayKey) || [];
                const isToday = dayKey === todayStr;
                return (
                  <div key={i} style={{ minHeight: "84px", borderRadius: "8px", border: `1px solid ${isToday ? "var(--accent)" : "var(--border)"}`, padding: "4px", display: "flex", flexDirection: "column", gap: "3px", background: "var(--panel)" }}>
                    <div style={{ fontSize: "var(--fs-3)", fontWeight: isToday ? 700 : 500, color: isToday ? "var(--accent)" : "var(--text-3)", textAlign: "right", padding: "0 2px" }}>{d.getDate()}</div>
                    {items.slice(0, 3).map((t) => {
                      const u = getUrgencyInfo(t);
                      return (
                        <div key={t.id} onClick={() => router.push(`/sa/tasks/${t.id}`)} title={`${t.title}${scope === "mine" && me?.id ? ` · ${taskRelationship(t, me.id, (id) => usersMap[id] || "").label}` : ""}`} style={{ fontSize: "var(--fs-2)", padding: "2px 5px", borderRadius: "5px", background: `color-mix(in srgb, ${u.color} 15%, transparent)`, color: u.color, cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", gap: "3px" }}>
                          {t.status === "Completed" ? <CheckCircle2 size={9} /> : t.important ? <Star size={9} /> : null}
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                        </div>
                      );
                    })}
                    {items.length > 3 && <div style={{ fontSize: "var(--fs-1)", color: "var(--text-3)", paddingLeft: "3px" }}>+{items.length - 3}</div>}
                  </div>
                );
              })}
            </div>
          </div>
          {calNoDue.length > 0 && (
            <div style={{ marginTop: "10px", fontSize: "var(--fs-5)", color: "var(--text-3)" }}>+ อีก {calNoDue.length} งานที่ยังไม่กำหนดวันเสร็จ (ดูในมุมมองรายการ)</div>
          )}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState icon={Plus} dashed onClick={canEdit ? openAdd : undefined}>
          {statusFilter !== "all" || q || assigneeFilter.length || categoryFilter.length
            ? "ไม่มีงานตรงกับตัวกรองนี้"
            : canEdit
              ? "ยังไม่มีงาน — กดเพื่อสร้าง/มอบหมายงาน (เช่น โทรตามลูกค้า, เตรียมใบเสนอราคา)"
              : "ยังไม่มีงาน"}
        </EmptyState>
      ) : view === "table" ? (
        /* ── Table view ── */
        <div className="premium-glass-table table-responsive">
          <TableScroll surface="embedded"><table className="premium-table">
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
              {/* โหมดจัดกลุ่ม: หัวกลุ่มเต็มแถว แถวงานข้างในเป็น `taskRow` ตัวเดียวกับโหมดปกติ
                  ⚠️ colSpan = 8 เท่าจำนวนคอลัมน์จริง (สองคอลัมน์สลับกันตามสโคป ไม่ได้บวกกัน) */}
              {buckets ? buckets.map((bucket) => {
                const bucketCollapsed = collapsed.has(bucket.key);
                return (
                  <Fragment key={bucket.key}>
                    <TableGroupRow
                      colSpan={8}
                      label={bucket.label}
                      badge={`${bucket.count} งาน`}
                      collapsed={bucketCollapsed}
                      onToggle={() => toggleBucket(bucket.key)}
                    />
                    {!bucketCollapsed && bucket.items.map(taskRow)}
                  </Fragment>
                );
              }) : pageRows.map(taskRow)}
            </tbody>
          </table></TableScroll>
        </div>
      ) : (
        /* ── List view (cards) ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 300px), 1fr))", gap: "12px" }}>
          {pageRows.map((t) => {
            const u = getUrgencyInfo(t);
            const done = t.status === "Completed";
            const assigneeName = t.assigneeId ? (naText(usersMap[t.assigneeId])) : null;
            return (
              <div key={t.id} onClick={() => router.push(`/sa/tasks/${t.id}`)} title="คลิกเพื่อดูรายละเอียดงาน" className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", borderLeft: `3px solid ${statusDot(t.status)}`, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                  <span title={TASK_STATUS_TH[t.status]} style={{ padding: "2px", flexShrink: 0, color: statusDot(t.status), display: "flex" }}>{statusIcon(t.status)}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "var(--fs-8)", fontWeight: "var(--fw-semibold)", textDecoration: done ? "line-through" : "none", color: done ? "var(--text-3)" : "var(--text)", display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      {t.important && <Star size={13} color="var(--amber)" fill="var(--amber)" />}
                      {t.urgent && <Flame size={13} color="var(--red)" />}
                      {t.title}
                    </div>
                    {t.note && <ReadableText text={t.note} lines={2} style={{ fontSize: "var(--fs-5)", color: "var(--text-2)", marginTop: "2px" }} />}
                  </div>
                  <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                    {followUpButton(t)}
                    <RowActionMenu label={`การจัดการของงาน ${t.title}`} items={rowMenu(t)} />
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "var(--fs-2)" }}>
                  {t.category && <span style={{ background: "var(--panel-2)", padding: "2px 7px", borderRadius: "10px", color: "var(--text-2)" }}><Tag size={10} style={{ display: "inline", verticalAlign: "-1px" }} /> {t.category}</span>}
                  {relationshipBadge(t)}
                  {t.difficulty === 3 && <span style={{ background: "color-mix(in srgb, var(--red) 12%, transparent)", padding: "2px 7px", borderRadius: "10px", color: "var(--red)" }}>ยาก</span>}
                  {(scope !== "mine" || (t.assigneeId && t.assigneeId !== me?.id)) && assigneeName && (
                    <span style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "2px 7px", borderRadius: "10px", color: "var(--accent)" }}><User size={10} style={{ display: "inline", verticalAlign: "-1px" }} /> {assigneeName}</span>
                  )}
                  {proxyBadge(t)}
                  {waitingBadge(t)}
                  {chainBadge(t)}
                </div>
                <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "var(--fs-3)", flexWrap: "wrap" }}>
                  {statusCell(t)}
                  {t.dueDate && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: u.color }}>{u.icon} {fmtDate(t.dueDate)}</span>}
                  {linkChip(t)}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {!loading && !["matrix", "calendar"].includes(view) && visible.length > 0 && (
        <Pager
          page={page}
          pageCount={pageCount}
          total={total}
          onPage={setPage}
          pageSize={pageSize}
          onPageSize={setPageSize}
        />
      )}
      </SaSection>

      {/* task modal */}
      <TaskFormModal
        open={showModal}
        onClose={() => setShowModal(false)}
        task={editingId ? personalTasks.find((t) => t.id === editingId) || null : null}
        initialForm={editingId ? null : form}
        inquirySource={inquirySource}
        chainSource={chainSource}
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
      <ConfirmDialog
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
            <div style={{ fontSize: "var(--fs-7)", color: "var(--text-3)" }}>
              งาน <strong style={{ color: "var(--text)" }}>{lateModal.task.title}</strong> เลยกำหนดแล้ว — ระบุสาเหตุที่ทำเสร็จช้าก่อนปิดงาน
            </div>
            <Textarea rows={3} value={lateModal.reason}
              onChange={(e) => setLateModal((v) => ({ ...v, reason: e.target.value }))}
              placeholder="เช่น รออนุมัติจากลูกค้า / รอวัตถุดิบ / ปรับแก้ตามฟีดแบ็ก..." autoFocus />
            <div className="form-action-inline">
              <button type="button" className="btn ghost sm" onClick={() => setLateModal(null)}>ยกเลิก</button>
              <button type="button" className="btn btn-primary sm" disabled={!lateModal.reason.trim()}
                onClick={() => { const m = lateModal; setLateModal(null); applyStatus(m.task, "Completed", { lateReason: m.reason.trim() }); }}>
                ปิดงาน
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* เข้าสถานะ "รอคนอื่น" ต้องบอกว่ารออะไร — ข้อความนี้ไปโผล่ในคิวของคนอื่นด้วย
          จึงต้องอ่านรู้เรื่องโดยไม่ต้องรู้จักงานนี้มาก่อน (ด่านเดียวกันอยู่ฝั่ง API) */}
      {blockModal && (
        <Modal open onClose={() => setBlockModal(null)} title="พักงานไว้รอคนอื่น" size="sm">
          <div style={MODAL_BODY}>
            <div style={MODAL_LEAD}>
              งาน <strong style={MODAL_STRONG}>{blockModal.task.title}</strong> — รออะไร/รอใครอยู่?
              กำหนดเสร็จยังเดินต่อตามเดิม แต่งานจะถูกแยกออกจากยอด “ต้องรีบ”
            </div>
            <Textarea rows={3} value={blockModal.reason}
              onChange={(e) => setBlockModal((v) => ({ ...v, reason: e.target.value }))}
              placeholder="เช่น รอลูกค้ายืนยันกลิ่น / รอฝ่ายผลิตตอบราคา / รอเอกสารจากบัญชี..." autoFocus />
            <div className="form-action-inline">
              <Button variant="quiet" size="sm" onClick={() => setBlockModal(null)}>ยกเลิก</Button>
              <Button tone="primary" size="sm" disabled={!blockModal.reason.trim()}
                onClick={() => { const m = blockModal; setBlockModal(null); applyStatus(m.task, TASK_STATUS_BLOCKED, { blockedReason: m.reason.trim() }); }}>
                พักไว้รอ
              </Button>
            </div>
          </div>
        </Modal>
      )}
      </div>
    </SaWorkspace>
  );
}
