"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ListTodo, Search, CheckCircle2, Clock, AlertTriangle, User, Plus, Trash2, CircleDashed, Flame, ArrowUpDown, ArrowUp, ArrowDown, Calendar, Briefcase, Tag, Star, UserPlus, ChevronLeft, ChevronRight, BarChart3 } from "lucide-react";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import StatusSelect from "@/components/pm/StatusSelect";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import EmptyState from "@/components/ui/EmptyState";
import SkeletonRows from "@/components/ui/Skeleton";
import Toast from "@/components/ui/Toast";
import ConfirmModal from "@/components/tax/ConfirmModal";
import { isSuperuser } from "@/lib/permissions";
import { useRole } from "@/lib/roleContext";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { fmtDateNumeric as fmtDate } from "@/lib/format";
import { daysToDue, isUrgent } from "@/lib/pm/derived";
import { TASK_CATEGORIES, DIFFICULTY_LABELS, DIFFICULTY_OPTIONS, eisenhowerQuadrant, QUADRANT_LABELS } from "@/lib/pm/tasks";

// ระบบมอบหมาย/ติดตามงาน (Sales Task Management) — งานทั้งหมดมาจาก personal_tasks
// (งานที่กรอก/มอบหมายเอง) เท่านั้น. ไม่ดึงงานขั้นตอนจาก timeline โปรเจกต์ (project_tasks)
// อีกต่อไป — งานเหล่านั้นดู/แก้ที่หน้า timeline ของโปรเจกต์โดยตรง.

const TASK_STATUS_TH = { Pending: "รอ", "In Progress": "ทำอยู่", Completed: "เสร็จ" };
const SCOPE_TH = { mine: "ของฉัน", team: "ทีม", all: "ทั้งหมด" };

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

const WEEKDAYS_TH = ["จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส.", "อา."];
const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
// index ของวัน (0=อา..6=ส.) → คอลัมน์ที่ขึ้นต้นวันจันทร์ (จ.=0 .. อา.=6)
const mondayIndex = (jsDay) => (jsDay + 6) % 7;
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export default function TasksPage() {
  const router = useRouter();
  const role = useRole();
  const [toast, setToast] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (opts) => new Promise((resolve) => setConfirmState({ ...opts, resolve }));
  const resolveConfirm = (result) => { setConfirmState((s) => { s?.resolve(result); return null; }); };

  const [scope, setScope] = useState("mine");
  const [allowedScopes, setAllowedScopes] = useState(["mine"]);
  const [personalTasks, setPersonalTasks] = useState([]);
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
    fetch("/api/pm/assignable-users").then((r) => (r.ok ? r.json() : [])).then((u) => {
      setUsers(u || []);
      setUsersMap(Object.fromEntries((u || []).map((x) => [x.id, x.name])));
    }).catch(() => {});
    fetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).then((p) => setAllProjects(p || [])).catch(() => {});
    fetch("/api/sales-planning/deals").then((r) => (r.ok ? r.json() : [])).then((d) => setAllDeals(d || [])).catch(() => {});
  }, []);

  // ผู้ใช้ที่ "ฉันมอบหมายงานให้ได้" (สะท้อน canAssignTask ฝั่ง server)
  const assignableUsers = useMemo(() => {
    if (!me) return [];
    if (isSuperuser(me.role)) return users;
    if (["senior_ae", "ac", "ae"].includes(me.role) && me.team) return users.filter((u) => u.team === me.team);
    return users.filter((u) => u.id === me.id);
  }, [me, users]);

  const q = search.trim().toLowerCase();
  const resolveProj = (pid) => projectsMap[pid] || allProjects.find((p) => p.id === pid) || null;
  const resolveDeal = (did) => dealsMap[did] || allDeals.find((d) => d.id === did) || null;
  const userTeamOf = (id) => users.find((u) => u.id === id)?.team || null;

  // ใครจัดการงานได้ (mirror server canManage): เจ้าของ/ผู้รับมอบ/superuser/หัวหน้าทีม
  const canManageTask = (t) => {
    if (!me) return false;
    if (t.ownerId === me.id || t.assigneeId === me.id) return true;
    if (isSuperuser(me.role)) return true;
    if (me.role === "senior_ae" && me.team) {
      const targetTeam = userTeamOf(t.assigneeId || t.ownerId);
      if (targetTeam && targetTeam === me.team) return true;
      if (resolveProj(t.projectId)?.team === me.team) return true;
    }
    return false;
  };

  // ตัวเลือกกรองผู้รับมอบหมาย (เฉพาะ scope ทีม/ทั้งหมด)
  const assigneeOptions = useMemo(() => {
    const ids = Array.from(new Set(personalTasks.map((t) => t.assigneeId).filter(Boolean)));
    return ids.map((id) => ({ id, name: usersMap[id] || "—" })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [personalTasks, usersMap]);

  const categoryOptions = useMemo(
    () => Array.from(new Set(personalTasks.map((t) => t.category).filter(Boolean))).sort((a, b) => a.localeCompare(b, "th")),
    [personalTasks],
  );

  // งานหลังกรอง ค้นหา/ผู้รับ/หมวด (ยังไม่กรองสถานะ — ใช้คำนวณการ์ดสรุป)
  const pool = useMemo(() => personalTasks
    .filter((t) => !q || [t.title, t.note, t.category].some((v) => (v || "").toLowerCase().includes(q)))
    .filter((t) => assigneeFilter === "all" || t.assigneeId === assigneeFilter)
    .filter((t) => categoryFilter === "all" || t.category === categoryFilter),
    [personalTasks, q, assigneeFilter, categoryFilter]);

  const stats = useMemo(() => ({
    all: pool.length,
    progress: pool.filter((t) => t.status === "In Progress").length,
    urgent: pool.filter(isUrgent).length,
    done: pool.filter((t) => t.status === "Completed").length,
  }), [pool]);

  const comparator = useMemo(() => makeComparator(sortKey, sortDir), [sortKey, sortDir]);
  const visible = useMemo(
    () => pool.filter((t) => matchStatus(t, statusFilter)).sort(comparator),
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
  const openAdd = () => { setEditingId(null); setForm(PERSONAL_BLANK); setShowModal(true); };
  useEffect(() => {
    const dealId = new URLSearchParams(window.location.search).get("dealId");
    if (!dealId || deepLinkHandled.current) return;
    deepLinkHandled.current = true;
    setEditingId(null);
    setForm({ ...PERSONAL_BLANK, linkType: "deal", dealId });
    setShowModal(true);
  }, []);
  const openEdit = (t) => {
    setEditingId(t.id);
    setForm({
      title: t.title, note: t.note || "",
      startDate: t.startDate || "", dueDate: t.dueDate || "",
      linkType: t.dealId ? "deal" : t.projectId ? "project" : "none",
      projectId: t.projectId || "", dealId: t.dealId || "", assigneeId: t.assigneeId || "",
      category: t.category || "", important: !!t.important, urgent: !!t.urgent,
      difficulty: t.difficulty ?? 2,
    });
    setShowModal(true);
  };
  const savePersonal = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { setToast({ kind: "error", msg: "ต้องระบุชื่องาน" }); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/pm/personal-tasks/${editingId}` : "/api/pm/personal-tasks";
      const projectId = form.linkType === "project" ? (form.projectId || null) : null;
      const dealId = form.linkType === "deal" ? (form.dealId || null) : null;
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
        }),
      });
      if (res.ok) { setShowModal(false); loadWork(scope); }
      else setToast({ kind: "error", msg: (await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ" });
    } catch { setToast({ kind: "error", msg: "เกิดข้อผิดพลาด" }); }
    finally { setSaving(false); }
  };
  const setTaskStatus = async (t, status) => {
    if (status === t.status) return;
    setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status } : x));
    try {
      const res = await fetch(`/api/pm/personal-tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error();
      loadWork(scope);
    } catch {
      setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: t.status } : x));
      setToast({ kind: "error", msg: "อัปเดตสถานะไม่สำเร็จ" });
    }
  };
  const statusSelect = (t) => (
    <StatusSelect value={t.status} variant="short" onClick={(e) => e.stopPropagation()} onChange={(v) => setTaskStatus(t, v)} title="เปลี่ยนสถานะ" />
  );
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

  // ป้ายกำกับ (ดีล/โปรเจกต์) ใช้ซ้ำทั้ง card + table
  const linkChip = (t) => {
    const proj = t.projectId ? resolveProj(t.projectId) : null;
    const deal = t.dealId ? resolveDeal(t.dealId) : null;
    if (proj) return <span onClick={(e) => { e.stopPropagation(); router.push(`/sa/projects/${proj.code || t.projectId}`); }} className="font-mono" style={{ cursor: "pointer", fontSize: "10px", background: "var(--panel-2)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border)" }}>{proj.code}</span>;
    if (deal) return <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "10px", background: "color-mix(in srgb, var(--purple) 10%, transparent)", padding: "2px 7px", borderRadius: "4px", color: "var(--purple)" }}><Briefcase size={10} /> {deal.title}</span>;
    return null;
  };

  // การ์ดย่อ — ใช้ในมุมมองบอร์ด (Kanban) และเมทริกซ์ (Eisenhower)
  const miniCard = (t) => {
    const u = getUrgencyInfo(t);
    const manage = canManageTask(t);
    const done = t.status === "Completed";
    const assigneeName = t.assigneeId ? (usersMap[t.assigneeId] || "—") : null;
    return (
      <div key={t.id} onClick={manage ? () => openEdit(t) : undefined} title={manage ? "คลิกเพื่อแก้ไขงาน" : undefined} className="glass-panel" style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: "6px", borderLeft: `3px solid ${statusDot(t.status)}`, cursor: manage ? "pointer" : "default" }}>
        <div style={{ fontSize: "13px", fontWeight: 600, textDecoration: done ? "line-through" : "none", color: done ? "var(--text-3)" : "var(--text)", display: "flex", alignItems: "center", gap: "5px", flexWrap: "wrap" }}>
          {t.important && <Star size={12} color="var(--amber)" fill="var(--amber)" />}
          {t.urgent && <Flame size={12} color="var(--red)" />}
          {t.title}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "10px" }}>
          {t.category && <span style={{ background: "var(--panel-2)", padding: "1px 6px", borderRadius: "9px", color: "var(--text-2)" }}>{t.category}</span>}
          {(scope !== "mine" || (t.assigneeId && t.assigneeId !== me?.id)) && assigneeName && (
            <span style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "1px 6px", borderRadius: "9px", color: "var(--accent)" }}><User size={9} style={{ display: "inline", verticalAlign: "-1px" }} /> {assigneeName}</span>
          )}
          {t.dueDate && <span style={{ display: "inline-flex", alignItems: "center", gap: "3px", color: u.color }}>{u.icon} {fmtDate(t.dueDate)}</span>}
        </div>
        {manage && <div onClick={(e) => e.stopPropagation()}>{statusSelect(t)}</div>}
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
    const lead = mondayIndex(first.getDay());
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
  const effectiveRole = me?.role || role;
  const canSeeKpi = !!effectiveRole && (isSuperuser(effectiveRole) || effectiveRole === "senior_ae");

  return (
    <div>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><ListTodo size={22} /></span> งาน (Tasks)</h1>
          <p>มอบหมาย ติดตาม และวัดผลงานรายคน/รายทีม — เชื่อมกับดีลและโปรเจกต์ได้{me && (me.role === "senior_ae" ? " · คุณติดตามงานของทีมได้" : isSuperuser(me?.role) ? " · คุณติดตามงานได้ทุกทีม" : "")}</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <ViewSwitcher value={view} onChange={setView} modes={["list", "table", "board", "calendar", "matrix"]} />
          {canSeeKpi && <Link href="/sa/tasks/kpi" className="btn"><BarChart3 size={16} /> KPI ทีม</Link>}
          <button onClick={openAdd} className="btn btn-primary"><Plus size={16} /> เพิ่มงาน</button>
        </div>
      </div>

      {/* scope tabs */}
      {allowedScopes.length > 1 && (
        <div className="segmented" style={{ marginBottom: "16px" }}>
          {allowedScopes.map((s) => (
            <button key={s} onClick={() => setScope(s)} className={scope === s ? "active" : ""}>{SCOPE_TH[s]}</button>
          ))}
        </div>
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
        <div className="spacer toolbar" style={{ gap: "8px" }}>
          <span className="toolbar-label"><ArrowUpDown size={14} /> เรียง</span>
          <Select compact value={sortKey} onChange={(e) => { setSortKey(e.target.value); setSortDir("asc"); }} title="เรียงลำดับตาม">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </Select>
          <button className="btn-icon" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} title={sortDir === "asc" ? "น้อย → มาก" : "มาก → น้อย"}>
            {sortDir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonRows />
      ) : view === "board" ? (
        /* ── Kanban board (ตามสถานะ) ── */
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "14px", alignItems: "start" }}>
          {BOARD_COLS.map((col) => {
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
                        <div key={t.id} onClick={manage ? () => openEdit(t) : undefined} title={t.title} style={{ fontSize: "10px", padding: "2px 5px", borderRadius: "5px", background: `color-mix(in srgb, ${u.color} 15%, transparent)`, color: u.color, cursor: manage ? "pointer" : "default", overflow: "hidden", display: "flex", alignItems: "center", gap: "3px" }}>
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
        <EmptyState icon={Plus} dashed onClick={openAdd}>
          {statusFilter !== "all" || q || assigneeFilter !== "all" || categoryFilter !== "all"
            ? "ไม่มีงานตรงกับตัวกรองนี้"
            : "ยังไม่มีงาน — กดเพื่อสร้าง/มอบหมายงาน (เช่น โทรตามลูกค้า, เตรียมใบเสนอราคา)"}
        </EmptyState>
      ) : view === "table" ? (
        /* ── Table view ── */
        <div className="premium-glass-table table-responsive">
          <table className="premium-table">
            <thead>
              <tr>
                <th onClick={() => handleSort("status")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>สถานะ {sortArrow("status")}</span></th>
                <th onClick={() => handleSort("name")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>ชื่องาน {sortArrow("name")}</span></th>
                <th>หมวด</th>
                {scope !== "mine" && <th>ผู้รับมอบหมาย</th>}
                <th>ความยาก</th>
                <th onClick={() => handleSort("due")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>กำหนดเสร็จ {sortArrow("due")}</span></th>
                <th>เชื่อมโยง</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((t) => {
                const u = getUrgencyInfo(t);
                const manage = canManageTask(t);
                return (
                  <tr key={t.id} className="premium-row" onClick={manage ? () => openEdit(t) : undefined} title={manage ? "คลิกเพื่อแก้ไขงาน" : undefined} style={{ cursor: manage ? "pointer" : "default" }}>
                    <td onClick={(e) => e.stopPropagation()}>
                      {manage ? statusSelect(t) : (
                        <span className={`status-pill dot ${t.status === "Completed" ? "success" : ""}`} style={{ "--dot": statusDot(t.status) }}>{TASK_STATUS_TH[t.status] || t.status}</span>
                      )}
                    </td>
                    <td style={{ fontWeight: 500 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                        {t.important && <Star size={13} color="var(--amber)" fill="var(--amber)" />}
                        {t.urgent && <Flame size={13} color="var(--red)" />}
                        {t.title}
                      </span>
                      {t.note && <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{t.note}</div>}
                    </td>
                    <td>{t.category ? <span style={{ fontSize: "11px", background: "var(--panel-2)", padding: "2px 8px", borderRadius: "12px" }}>{t.category}</span> : <span style={{ color: "var(--text-3)" }}>—</span>}</td>
                    {scope !== "mine" && <td style={{ fontSize: "13px" }}>{t.assigneeId ? (usersMap[t.assigneeId] || "—") : <span style={{ color: "var(--text-3)" }}>—</span>}</td>}
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
              <div key={t.id} onClick={manage ? () => openEdit(t) : undefined} title={manage ? "คลิกเพื่อแก้ไขงาน" : undefined} className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", borderLeft: `3px solid ${statusDot(t.status)}`, cursor: manage ? "pointer" : "default" }}>
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
                  {manage && (
                    <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                      <button className="btn-icon danger" onClick={() => deletePersonal(t)} aria-label="ลบงาน" title="ลบ"><Trash2 size={14} /></button>
                    </div>
                  )}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", fontSize: "10px" }}>
                  {t.category && <span style={{ background: "var(--panel-2)", padding: "2px 7px", borderRadius: "10px", color: "var(--text-2)" }}><Tag size={10} style={{ display: "inline", verticalAlign: "-1px" }} /> {t.category}</span>}
                  {t.difficulty === 3 && <span style={{ background: "color-mix(in srgb, var(--red) 12%, transparent)", padding: "2px 7px", borderRadius: "10px", color: "var(--red)" }}>ยาก</span>}
                  {(scope !== "mine" || (t.assigneeId && t.assigneeId !== me?.id)) && assigneeName && (
                    <span style={{ background: "color-mix(in srgb, var(--accent) 12%, transparent)", padding: "2px 7px", borderRadius: "10px", color: "var(--accent)" }}><User size={10} style={{ display: "inline", verticalAlign: "-1px" }} /> {assigneeName}</span>
                  )}
                </div>
                <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", flexWrap: "wrap" }}>
                  {manage ? statusSelect(t) : (
                    <span className={`status-pill dot ${done ? "success" : ""}`} style={{ "--dot": statusDot(t.status) }}>{TASK_STATUS_TH[t.status] || t.status}</span>
                  )}
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
            <div className="form-group">
              <label>ชื่องาน <span className="text-[var(--red)]">*</span></label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required className="premium-input w-full" placeholder="เช่น โทรตามลูกค้า, เตรียมเอกสาร" />
            </div>
            <div className="form-group">
              <label>รายละเอียด</label>
              <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="premium-input w-full" rows={2} placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)" />
            </div>

            <div className="pm-form-grid gap-3">
              <div className="form-group">
                <label>วันเริ่ม</label>
                <input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} className="premium-input w-full" />
              </div>
              <div className="form-group">
                <label>กำหนดเสร็จ</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="premium-input w-full" />
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
                {[["none", "ไม่ผูก"], ["deal", "ดีล"], ["project", "โปรเจกต์"]].map(([k, lbl]) => (
                  <button type="button" key={k} className={form.linkType === k ? "active" : ""} onClick={() => setForm((f) => ({ ...f, linkType: k }))}>{lbl}</button>
                ))}
              </div>
              {form.linkType === "deal" && (
                <Select fullWidth value={form.dealId} onChange={(e) => setForm((f) => ({ ...f, dealId: e.target.value }))}>
                  <option value="">— เลือกดีล —</option>
                  {allDeals.map((d) => <option key={d.id} value={d.id}>{d.title}{d.customerName ? ` — ${d.customerName}` : ""}</option>)}
                </Select>
              )}
              {form.linkType === "project" && (
                <Select fullWidth value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))}>
                  <option value="">— เลือกโปรเจกต์ —</option>
                  {allProjects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </Select>
              )}
            </div>

            <div className="form-group">
              <label><UserPlus size={12} style={{ display: "inline", verticalAlign: "-1px" }} /> มอบหมายให้ <span className="text-[11px] text-[var(--text-3)] font-normal">(งานจะไปอยู่ในรายการงานของคนนั้น)</span></label>
              <Select fullWidth value={form.assigneeId} onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}>
                <option value="">— ตัวฉันเอง —</option>
                {assignableUsers.filter((u) => u.id !== me?.id).map((u) => <option key={u.id} value={u.id}>{u.name}{u.team ? ` (${u.team})` : ""}</option>)}
              </Select>
              {me && !isSuperuser(me.role) && !["senior_ae", "ac", "ae"].includes(me.role) && (
                <div className="text-[11px] text-[var(--text-3)] mt-1">ตำแหน่งของคุณมอบหมายงานให้คนอื่นไม่ได้ — สร้างเป็นงานของตัวเองเท่านั้น</div>
              )}
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
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
