"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { ListTodo, Search, CheckCircle2, Clock, AlertTriangle, User, Plus, Trash2, CircleDashed, ChevronRight, ChevronDown, ExternalLink, Flame, ArrowUpDown, ArrowUp, ArrowDown, Table2, PlusCircle, Check, Calendar, Flag } from "lucide-react";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import { isSuperuser } from "@/lib/permissions";
import { useResponsiveView } from "@/lib/useResponsiveView";

const TASK_STATUS_TH = { Pending: "รอ", "In Progress": "ทำอยู่", Completed: "เสร็จ" };
const SCOPE_TH = { mine: "ของฉัน", team: "ทีม", all: "ทั้งหมด" };

const fmtDate = (v) => {
  if (!v) return "-";
  const d = new Date(v);
  if (isNaN(d.getTime())) return "-";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// วันที่ใช้วัดความเร่งด่วน: finishDate ก่อน แล้วค่อย dueDate
const targetDate = (t) => t.finishDate || t.dueDate || null;

// จำนวนวันถึงกำหนด (ลบ = เลยกำหนด) — null ถ้าไม่มีกำหนด
const daysToDue = (t) => {
  const td = targetDate(t);
  if (!td) return null;
  const d = new Date(td);
  if (isNaN(d.getTime())) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.floor((d - today) / (1000 * 60 * 60 * 24));
};

// ต้องรีบ = ยังไม่เสร็จ และเลยกำหนด/เหลือ ≤3 วัน
const isUrgent = (t) => {
  if (t.status === "Completed") return false;
  const dd = daysToDue(t);
  return dd !== null && dd <= 3;
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

// ตัวเปรียบเทียบสำหรับจัดเรียง — dir: "asc" | "desc"
const STATUS_ORDER = { "In Progress": 0, Pending: 1, Completed: 2 };
const makeComparator = (sortKey, dir = "asc") => {
  const mul = dir === "desc" ? -1 : 1;
  if (sortKey === "due") return (a, b) => {
    const da = daysToDue(a), db = daysToDue(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1; // ไม่มีกำหนด → ท้ายสุดเสมอ (ไม่สลับตามทิศ)
    if (db === null) return -1;
    return (da - db) * mul;
  };
  if (sortKey === "name") return (a, b) => (a.name || a.title || "").localeCompare(b.name || b.title || "", "th") * mul;
  if (sortKey === "status") return (a, b) => ((STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9)) * mul;
  if (sortKey === "role") return (a, b) => (a.role || "").localeCompare(b.role || "", "th") * mul;
  // default = ลำดับขั้นตอน (stepOrder) สำหรับงานโปรเจกต์
  return (a, b) => ((a.stepOrder ?? 0) - (b.stepOrder ?? 0)) * mul;
};

const PERSONAL_BLANK = { title: "", note: "", dueDate: "", projectId: "", assigneeId: "" };

const SORT_OPTIONS = [
  { key: "default", label: "ลำดับขั้นตอน" },
  { key: "due", label: "ใกล้ครบกำหนด" },
  { key: "status", label: "สถานะ" },
  { key: "role", label: "แผนก" },
  { key: "name", label: "ชื่องาน" },
];

export default function MyWorkPage() {
  const router = useRouter();
  const [scope, setScope] = useState("mine");
  const [allowedScopes, setAllowedScopes] = useState(["mine"]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [personalTasks, setPersonalTasks] = useState([]);
  const [projectsMap, setProjectsMap] = useState({});
  const [me, setMe] = useState(null);
  const [allProjects, setAllProjects] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);
  // มุมมองสลับอัตโนมัติตามจอ: จอตั้ง → Card List, จอนอน → Table (ผู้ใช้กดสลับเองได้)
  const [view, setView] = useResponsiveView({ portrait: "list", landscape: "table" });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | progress | urgent | done
  const [deptFilter, setDeptFilter] = useState("all");
  const [assigneeFilter, setAssigneeFilter] = useState("all");
  const [sortKey, setSortKey] = useState("default");
  const [sortDir, setSortDir] = useState("asc"); // asc | desc
  // กลุ่มโครงการที่ถูกพับไว้ (เก็บเป็น projectId)
  const [collapsed, setCollapsed] = useState(() => new Set());

  // personal task modal
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(PERSONAL_BLANK);
  const [saving, setSaving] = useState(false);

  const loadWork = async (sc) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/pm/my-work?scope=${sc}`);
      const d = res.ok ? await res.json() : {};
      setProjectTasks(d.projectTasks || []);
      setPersonalTasks(d.personalTasks || []);
      setProjectsMap(d.projects || {});
      if (d.me) setMe(d.me);
      if (d.allowedScopes) setAllowedScopes(d.allowedScopes);
      if (d.scope && d.scope !== sc) setScope(d.scope);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadWork(scope); }, [scope]);
  useEffect(() => {
    fetch("/api/pm/assignable-users").then((r) => (r.ok ? r.json() : [])).then((u) => {
      setUsers(u || []);
      setUsersMap(Object.fromEntries((u || []).map((x) => [x.id, x.name])));
    }).catch(() => {});
    fetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).then((p) => setAllProjects(p || [])).catch(() => {});
  }, []);

  const q = search.trim().toLowerCase();

  // งานโปรเจกต์ที่ผ่านการค้นหา (ก่อนกรองสถานะ)
  const searchedProjectTasks = useMemo(
    () => projectTasks.filter((t) => !q || [t.name, projectsMap[t.projectId]?.code, projectsMap[t.projectId]?.name].some((v) => (v || "").toLowerCase().includes(q))),
    [projectTasks, projectsMap, q],
  );

  // ตัวเลือกตัวกรอง (อนุมานจากงานในขอบเขตปัจจุบัน)
  const deptOptions = useMemo(
    () => Array.from(new Set(projectTasks.map((t) => t.role).filter(Boolean))).sort((a, b) => a.localeCompare(b, "th")),
    [projectTasks],
  );
  const assigneeOptions = useMemo(() => {
    const ids = Array.from(new Set(projectTasks.map((t) => t.assigneeId).filter(Boolean)));
    return ids.map((id) => ({ id, name: usersMap[id] || "—" })).sort((a, b) => a.name.localeCompare(b.name, "th"));
  }, [projectTasks, usersMap]);

  // กรองตามแผนก/ผู้รับผิดชอบ (ก่อนกรองสถานะ)
  const scopedProjectTasks = useMemo(
    () => searchedProjectTasks
      .filter((t) => deptFilter === "all" || t.role === deptFilter)
      .filter((t) => assigneeFilter === "all" || t.assigneeId === assigneeFilter),
    [searchedProjectTasks, deptFilter, assigneeFilter],
  );

  // กรองแผนก/ผู้รับผิดชอบไม่ใช้กับงานส่วนตัว (ไม่มีฟิลด์เหล่านี้) → ซ่อนเมื่อมีตัวกรองนั้นอยู่
  const filterByMeta = deptFilter !== "all" || assigneeFilter !== "all";

  // สรุปภาพรวม (อิงงานโปรเจกต์ใน scope + ตัวกรองแผนก/ผู้รับผิดชอบปัจจุบัน)
  const stats = useMemo(() => ({
    all: scopedProjectTasks.length,
    progress: scopedProjectTasks.filter((t) => t.status === "In Progress").length,
    urgent: scopedProjectTasks.filter(isUrgent).length,
    done: scopedProjectTasks.filter((t) => t.status === "Completed").length,
  }), [scopedProjectTasks]);

  const comparator = useMemo(() => makeComparator(sortKey, sortDir), [sortKey, sortDir]);

  // คลิกหัวคอลัมน์: คอลัมน์เดิม → สลับทิศ, คอลัมน์ใหม่ → ตั้งค่า + เริ่มที่ asc
  const handleSort = (key) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };
  const sortArrow = (key) => sortKey === key
    ? (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)
    : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />;
  const toggleCollapse = (pid) => setCollapsed((prev) => {
    const next = new Set(prev);
    if (next.has(pid)) next.delete(pid); else next.add(pid);
    return next;
  });

  // งานนอกเทมเพลตแยก 2 ชนิดด้วยการผูกโปรเจกต์:
  //   linkedExtra = "งานเพิ่มเติม" (ผูกโปรเจกต์ — เข้ากลุ่มโครงการ, assign กันได้)
  //   privateTasks = "งานส่วนตัว" (ไม่ผูก — เห็นเฉพาะเรา)
  const linkedExtra = useMemo(() => personalTasks.filter((t) => t.projectId), [personalTasks]);
  const privateTasks = useMemo(() => personalTasks.filter((t) => !t.projectId), [personalTasks]);

  const resolveProj = (pid) => projectsMap[pid] || allProjects.find((p) => p.id === pid) || {};

  // ── งานโปรเจกต์ + งานเพิ่มเติม จัดกลุ่มตามโครงการ ──
  const projGroups = useMemo(() => {
    const groups = new Map();
    const ensure = (pid) => {
      if (!groups.has(pid)) {
        const p = resolveProj(pid);
        groups.set(pid, { projectId: pid, code: p.code || "-", name: p.name || "-", team: p.team || null, tasks: [], extra: [] });
      }
      return groups.get(pid);
    };
    scopedProjectTasks
      .filter((t) => matchStatus(t, statusFilter))
      .forEach((t) => ensure(t.projectId).tasks.push(t));
    // งานเพิ่มเติมไม่มีฟิลด์แผนก/ผู้รับผิดชอบแบบขั้นตอน → ซ่อนเมื่อกรองแผนก/ผู้รับผิดชอบ
    if (!filterByMeta) {
      linkedExtra
        .filter((t) => {
          const p = resolveProj(t.projectId);
          return (!q || [t.title, p.code, p.name].some((v) => (v || "").toLowerCase().includes(q))) && matchStatus(t, statusFilter);
        })
        .forEach((t) => ensure(t.projectId).extra.push(t));
    }
    const arr = Array.from(groups.values());
    arr.forEach((g) => {
      g.tasks.sort(comparator);
      g.extra.sort(comparator);
      g.done = g.tasks.filter((t) => t.status === "Completed").length;
      g.pct = g.tasks.length ? Math.round((g.done / g.tasks.length) * 100) : 0;
    });
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopedProjectTasks, linkedExtra, projectsMap, allProjects, statusFilter, comparator, filterByMeta, q]);

  const visiblePersonal = useMemo(
    () => (filterByMeta ? [] : privateTasks
      .filter((t) => (!q || (t.title || "").toLowerCase().includes(q)) && matchStatus(t, statusFilter))
      .sort(comparator)),
    [filterByMeta, privateTasks, q, statusFilter, comparator],
  );

  const totalShown = projGroups.reduce((n, g) => n + g.tasks.length + g.extra.length, 0);

  // ใครจัดการงานเพิ่มเติมได้ (mirror server): เจ้าของ/ผู้รับมอบ/superuser/หัวหน้าทีมโปรเจกต์
  const canManageExtra = (t) => {
    if (!me) return false;
    if (t.ownerId === me.id || t.assigneeId === me.id) return true;
    if (isSuperuser(me.role)) return true;
    const proj = resolveProj(t.projectId);
    return me.role === "senior_ae" && me.team && proj.team === me.team;
  };
  const extraAssigneeName = (t) => usersMap[t.assigneeId] || usersMap[t.ownerId] || "—";
  const extraStatusCell = (t) => (canManageExtra(t)
    ? statusSelect(t, setPersonalStatus)
    : (
      <span className={`status-pill ${t.status === "Completed" ? "success" : ""}`} title="เปลี่ยนสถานะได้เฉพาะเจ้าของ/ผู้รับมอบ/หัวหน้าทีม">
        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusDot(t.status) }} /> {TASK_STATUS_TH[t.status] || t.status}
      </span>
    ));
  // ป้าย "เพิ่มเติม" ใช้ซ้ำทั้ง 2 มุม
  const extraBadge = (
    <span style={{ fontSize: "10px", fontWeight: 700, color: "var(--purple)", background: "color-mix(in srgb, var(--purple) 12%, transparent)", border: "1px solid color-mix(in srgb, var(--purple) 30%, transparent)", borderRadius: "10px", padding: "1px 7px", whiteSpace: "nowrap" }}>เพิ่มเติม</span>
  );

  // ── personal task CRUD ──
  const openAdd = () => { setEditingId(null); setForm(PERSONAL_BLANK); setShowModal(true); };
  const openEdit = (t) => { setEditingId(t.id); setForm({ title: t.title, note: t.note || "", dueDate: t.dueDate || "", projectId: t.projectId || "", assigneeId: t.assigneeId || "" }); setShowModal(true); };
  const savePersonal = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { alert("ต้องระบุชื่องาน"); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/pm/personal-tasks/${editingId}` : "/api/pm/personal-tasks";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          note: form.note,
          dueDate: form.dueDate || null,
          projectId: form.projectId || null,
          // ส่ง assigneeId เฉพาะตอนผูกโปรเจกต์ — เลี่ยงแตะคอลัมน์เมื่อเป็นงานส่วนตัว
          // (กันพังถ้ายังไม่รัน migration 0026). ส่งค่าว่างเพื่อ "ถอนการมอบหมาย" ได้
          ...(form.projectId ? { assigneeId: form.assigneeId || null } : {}),
        }),
      });
      if (res.ok) { setShowModal(false); loadWork(scope); }
      else alert((await res.json()).error || "บันทึกไม่สำเร็จ");
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setSaving(false); }
  };
  const setPersonalStatus = async (t, status) => {
    if (status === t.status) return;
    setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status } : x));
    await fetch(`/api/pm/personal-tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
  };
  // ผู้ใช้คนนี้อัปเดตสถานะขั้นตอนนี้ได้ไหม — สะท้อน rule ฝั่ง server (PATCH project-tasks):
  //   fullEdit:     superuser (admin/ae_supervisor) ทุกทีม · senior_ae/ac เฉพาะทีมตัวเอง
  //   workflowEdit: เป็นผู้รับผิดชอบ (assigneeId) หรือ staff ฝ่ายเดียวกับขั้นตอน (role===department)
  // กรณีขอบ (เช่น ae เจ้าของโปรเจกต์ที่ถูก assign ด้วยชื่อ) ปล่อยให้ server ตัดสิน — ลองแล้ว revert ถ้า 403
  const canUpdateTask = (t) => {
    if (!me) return false;
    if (me.role === "admin" || me.role === "ae_supervisor") return true;
    const proj = projectsMap[t.projectId];
    if ((me.role === "senior_ae" || me.role === "ac") && me.team && proj && me.team === proj.team) return true;
    if (t.assigneeId === me.id) return true;
    return me.role === "staff" && !!me.department && t.role === me.department;
  };

  // อัปเดตสถานะงานโปรเจกต์ (workflow-only) — แก้ได้เฉพาะสถานะ ไม่แตะแผน/วันที่/การมอบหมาย
  // (การแก้แผนทำที่หน้า timeline ของโปรเจกต์เท่านั้น)
  const setProjectStatus = async (t, status) => {
    if (status === t.status) return;
    setProjectTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status } : x)));
    try {
      const res = await fetch(`/api/pm/project-tasks/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      loadWork(scope);
    } catch {
      setProjectTasks((prev) => prev.map((x) => (x.id === t.id ? { ...x, status: t.status } : x)));
      alert("อัปเดตสถานะไม่สำเร็จ");
    }
  };

  // dropdown เลือกสถานะ — วิธีอัปเดตหลัก (แทนการคลิกวน pill เดิม)
  const statusSelect = (t, onChange) => (
    <Select
      value={t.status}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => { e.stopPropagation(); onChange(t, e.target.value); }}
      tone={statusDot(t.status)}
      title="เปลี่ยนสถานะ"
      options={Object.entries(TASK_STATUS_TH).map(([k, label]) => ({ value: k, label }))}
    />
  );

  const deletePersonal = async (t) => {
    if (!confirm(`ลบงานส่วนตัว "${t.title}" ?`)) return;
    const res = await fetch(`/api/pm/personal-tasks/${t.id}`, { method: "DELETE" });
    if (res.ok) setPersonalTasks((prev) => prev.filter((x) => x.id !== t.id));
  };

  // การ์ดงานใน List view — สไตล์เดียวกับ List view หน้า detail โครงการ
  // (การ์ดใหญ่ + วงกลมสถานะ + เส้นเชื่อมระหว่างขั้นตอน). num = ลำดับในกลุ่ม,
  // hasNext = วาดเส้นเชื่อมลงการ์ดถัดไปไหม, isExtra = งานเพิ่มเติม (นอกเทมเพลต)
  const renderWorkCard = (t, g, { num, hasNext, isExtra }) => {
    const u = getUrgencyInfo(t);
    const isCompleted = t.status === "Completed";
    const isInProgress = t.status === "In Progress";
    const name = isExtra ? t.title : t.name;
    const circleBg = isCompleted ? "var(--green)" : isInProgress ? "var(--accent)" : "var(--bg)";
    const circleBorder = isCompleted ? "var(--green)" : isInProgress ? "var(--accent)" : "var(--border)";
    const cardBg = isCompleted ? "color-mix(in srgb, var(--green) 5%, transparent)" : isInProgress ? "var(--panel-2)" : isExtra ? "color-mix(in srgb, var(--purple) 4%, transparent)" : "var(--panel)";
    const cardBorder = isCompleted ? "color-mix(in srgb, var(--green) 30%, transparent)" : isInProgress ? "var(--accent)" : isExtra ? "color-mix(in srgb, var(--purple) 25%, transparent)" : "var(--border)";
    const dateStr = isExtra ? (t.dueDate ? fmtDate(t.dueDate) : null) : (t.finishDate ? fmtDate(t.finishDate) : null);
    // งานโปรเจกต์ → คลิกไปแก้แผนที่หน้า timeline; งานเพิ่มเติม → คลิกเปิด modal แก้ (เฉพาะคนที่จัดการได้)
    const handleCardClick = isExtra
      ? (canManageExtra(t) ? () => openEdit(t) : undefined)
      : () => router.push(`/pm/projects/${g.code || t.projectId}`);
    return (
      <div key={t.id} style={{ display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "stretch", gap: 0 }}>
          {/* milestone / alignment column (เท่ากับ detail) */}
          <div style={{ width: "28px", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {t.isMilestone && <Flag size={14} color="var(--amber)" strokeWidth={2.5} />}
          </div>
          <div
            onClick={handleCardClick}
            title={isExtra ? (canManageExtra(t) ? "คลิกเพื่อแก้ไขงาน" : undefined) : "เปิดหน้าโปรเจกต์เพื่อแก้รายละเอียด"}
            style={{ flex: 1, display: "flex", gap: "16px", padding: "16px 18px", background: cardBg, border: `1px solid ${cardBorder}`, borderRadius: "14px", position: "relative", cursor: handleCardClick ? "pointer" : "default", transition: "all 0.2s", boxShadow: isInProgress ? "0 6px 20px -8px color-mix(in srgb, var(--accent) 45%, transparent)" : "none" }}
          >
            {hasNext && <div style={{ position: "absolute", left: "29px", top: "50px", bottom: "-20px", width: "2px", background: isCompleted ? "var(--green)" : "var(--border)", borderRadius: "2px", zIndex: 0 }} />}

            <div style={{ zIndex: 1 }}>
              <div style={{ width: "28px", height: "28px", borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: circleBg, border: `2px solid ${circleBorder}`, color: "#fff" }}>
                {isCompleted ? <Check size={16} strokeWidth={3} /> : isInProgress ? <Clock size={15} strokeWidth={2.5} /> : <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--text-3)" }}>{num}</span>}
              </div>
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "8px" }}>
                <h4 style={{ margin: 0, fontSize: "15px", color: isCompleted ? "var(--green)" : "var(--text)", fontWeight: 600, display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap", minWidth: 0 }}>
                  {num}. {name} {isExtra && extraBadge}
                </h4>
                <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                  {!isExtra && <span className="ui-badge" style={{ background: "var(--panel-2)", color: "var(--text-2)" }}>{t.role}</span>}
                  {scope !== "mine" && <span style={{ fontSize: "12px", color: "var(--text-2)" }}>{isExtra ? extraAssigneeName(t) : (usersMap[t.assigneeId] || t.assignee || "—")}</span>}
                  {isExtra
                    ? extraStatusCell(t)
                    : (canUpdateTask(t) ? statusSelect(t, setProjectStatus) : (
                      <span className="status-pill" title="แก้สถานะได้ที่หน้า timeline ของโปรเจกต์"><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusDot(t.status) }} /> {TASK_STATUS_TH[t.status] || t.status}</span>
                    ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: "16px", fontSize: "12px", color: "var(--text-3)", marginTop: "8px", flexWrap: "wrap" }}>
                {dateStr && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}><Calendar size={14} /> {dateStr}</span>}
                <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: u.color, fontWeight: 500 }}>{u.icon} {u.label}</span>
              </div>
              {isExtra && t.note && (
                <div style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "8px", background: "var(--panel-2)", padding: "6px 8px", borderRadius: "6px", whiteSpace: "pre-wrap" }}>{t.note}</div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };


  const STAT_CARDS = [
    { key: "all", label: "งานทั้งหมด", count: stats.all, color: "var(--accent)", icon: <ListTodo size={18} /> },
    { key: "progress", label: "กำลังทำ", count: stats.progress, color: "var(--blue)", icon: <Clock size={18} /> },
    { key: "urgent", label: "ต้องรีบ", count: stats.urgent, color: "var(--red)", icon: <Flame size={18} /> },
    { key: "done", label: "เสร็จแล้ว", count: stats.done, color: "var(--green)", icon: <CheckCircle2 size={18} /> },
  ];

  const emptyState = (text) => (
    <div className="glass-panel" style={{ padding: "32px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>{text}</div>
  );

  return (
    <div>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><ListTodo size={22} /></span> งานของฉัน (My Work)</h1>
          <p>งานโปรเจกต์ที่มอบหมายให้คุณ + งานเพิ่มเติมในโปรเจกต์ + งานส่วนตัว รวมในที่เดียว</p>
        </div>
        <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
          <div className="segmented">
            <button onClick={() => setView("list")} className={view === "list" ? "active" : ""}><ListTodo size={14} /> List</button>
            <button onClick={() => setView("table")} className={view === "table" ? "active" : ""}><Table2 size={14} /> Table</button>
          </div>
          <button onClick={openAdd} className="btn btn-primary"><Plus size={16} /> เพิ่มงาน</button>
        </div>
      </div>

      {/* scope tabs */}
      {allowedScopes.length > 1 && (
        <div className="segmented" style={{ marginBottom: "16px" }}>
          {allowedScopes.map((s) => (
            <button key={s} onClick={() => setScope(s)} className={scope === s ? "active" : ""}>
              {SCOPE_TH[s]}
            </button>
          ))}
        </div>
      )}

      {/* ── สรุปภาพรวม (คลิกเพื่อกรอง) ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px", marginBottom: "18px" }}>
        {STAT_CARDS.map((c) => {
          const active = statusFilter === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setStatusFilter(active && c.key !== "all" ? "all" : c.key)}
              className="glass-panel"
              style={{
                textAlign: "left", cursor: "pointer", padding: "14px 16px", display: "flex", alignItems: "center", gap: "12px",
                border: active ? `1.5px solid ${c.color}` : "1px solid var(--border)",
                boxShadow: active ? `0 0 0 3px color-mix(in srgb, ${c.color} 14%, transparent)` : "none",
                transition: "border-color .15s, box-shadow .15s",
              }}
            >
              <span style={{ width: "38px", height: "38px", borderRadius: "10px", display: "flex", alignItems: "center", justifyContent: "center", background: `color-mix(in srgb, ${c.color} 14%, transparent)`, color: c.color, flexShrink: 0 }}>
                {c.icon}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: "22px", fontWeight: 700, lineHeight: 1.1, color: c.color }}>{c.count}</div>
                <div style={{ fontSize: "12px", color: "var(--text-2)", fontWeight: 500 }}>{c.label}</div>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── แถบเครื่องมือ: ค้นหา + กรอง + เรียง ── */}
      <div className="toolbar" style={{ marginBottom: "20px" }}>
        <div className="search-glass" style={{ width: "260px", maxWidth: "100%" }}>
          <Search size={18} color="var(--text-3)" />
          <input type="text" placeholder="ค้นหางาน..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        {statusFilter !== "all" && (
          <button onClick={() => setStatusFilter("all")} className="btn" style={{ fontSize: "12px" }}>
            กรอง: {STAT_CARDS.find((c) => c.key === statusFilter)?.label} <span style={{ fontWeight: 700 }}>×</span>
          </button>
        )}
        {deptOptions.length > 1 && (
          <Select compact value={deptFilter} onChange={(e) => setDeptFilter(e.target.value)} title="กรองตามแผนก">
            <option value="all">ทุกแผนก</option>
            {deptOptions.map((d) => <option key={d} value={d}>{d}</option>)}
          </Select>
        )}
        {scope !== "mine" && assigneeOptions.length > 1 && (
          <Select compact value={assigneeFilter} onChange={(e) => setAssigneeFilter(e.target.value)} title="กรองตามผู้รับผิดชอบ">
            <option value="all">ทุกคน</option>
            {assigneeOptions.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </Select>
        )}
        <div className="spacer toolbar" style={{ gap: "8px" }}>
          <span className="toolbar-label"><ArrowUpDown size={14} /> เรียง</span>
          <Select compact value={sortKey} onChange={(e) => { setSortKey(e.target.value); setSortDir("asc"); }} title="เรียงลำดับตาม">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </Select>
          <button className="btn-icon" onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))} aria-label={sortDir === "asc" ? "เรียงน้อยไปมาก กดเพื่อสลับ" : "เรียงมากไปน้อย กดเพื่อสลับ"} title={sortDir === "asc" ? "น้อย → มาก (กดเพื่อสลับ)" : "มาก → น้อย (กดเพื่อสลับ)"}>
            {sortDir === "asc" ? <ArrowUp size={15} /> : <ArrowDown size={15} />}
          </button>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: "60px", textAlign: "center", color: "var(--text-3)" }}>กำลังโหลดข้อมูล...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "28px" }}>
          {/* ── งานโปรเจกต์ ── */}
          <section style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <ListTodo size={17} color="var(--accent)" /> งานโปรเจกต์ ({SCOPE_TH[scope]})
                <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--text-3)" }}>{totalShown} งาน</span>
              </div>
            </div>
            {projGroups.length === 0 ? (
              emptyState(statusFilter !== "all"
                ? "ไม่มีงานตรงกับตัวกรองนี้"
                : scope === "mine" ? "ยังไม่มีงานโปรเจกต์ที่มอบหมายให้คุณ — ให้หัวหน้า/ผู้ดูแลมอบหมายงานในหน้าโปรเจกต์" : "ไม่มีงานในขอบเขตนี้")
            ) : view === "table" ? (
              <div className="premium-glass-table table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSort("status")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>สถานะ {sortArrow("status")}</span></th>
                      <th onClick={() => handleSort("name")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>ชื่องาน {sortArrow("name")}</span></th>
                      <th onClick={() => handleSort("role")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>แผนก {sortArrow("role")}</span></th>
                      {scope !== "mine" && <th>ผู้รับผิดชอบ</th>}
                      <th onClick={() => handleSort("due")} style={{ cursor: "pointer", userSelect: "none" }}><span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>กำหนดเสร็จ {sortArrow("due")}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {projGroups.map((g) => {
                      const isCollapsed = collapsed.has(g.projectId);
                      const cols = scope !== "mine" ? 5 : 4;
                      return (
                      <Fragment key={g.projectId}>
                        <tr onClick={() => toggleCollapse(g.projectId)} style={{ cursor: "pointer" }} title={isCollapsed ? "คลิกเพื่อกางกลุ่ม" : "คลิกเพื่อพับกลุ่ม"}>
                          <td colSpan={cols} style={{ background: "var(--panel-2)", borderTop: "2px solid var(--border)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "13px" }}>
                              {isCollapsed ? <ChevronRight size={15} color="var(--text-3)" style={{ flexShrink: 0 }} /> : <ChevronDown size={15} color="var(--text-3)" style={{ flexShrink: 0 }} />}
                              <span className="font-mono" style={{ fontSize: "11px", background: "var(--bg)", padding: "2px 8px", borderRadius: "4px", border: "1px solid var(--border)" }}>{g.code}</span>
                              <span>{g.name}</span>
                              <div style={{ display: "flex", alignItems: "center", gap: "8px", marginLeft: "auto" }}>
                                {g.tasks.length > 0 && (
                                  <>
                                    <div style={{ width: "70px", height: "5px", borderRadius: "99px", background: "var(--border)", overflow: "hidden" }}>
                                      <div style={{ width: `${g.pct}%`, height: "100%", background: g.pct === 100 ? "var(--green)" : "var(--accent)" }} />
                                    </div>
                                    <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 600, minWidth: "58px" }}>{g.done}/{g.tasks.length} · {g.pct}%</span>
                                  </>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); router.push(`/pm/projects/${g.code || g.projectId}`); }} title="เปิดหน้าโปรเจกต์" style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "3px", display: "flex", alignItems: "center" }}>
                                  <ExternalLink size={14} />
                                </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                        {!isCollapsed && g.tasks.map((t) => {
                          const u = getUrgencyInfo(t);
                          return (
                            <tr key={t.id} className="premium-row" style={{ cursor: "pointer" }} onClick={() => router.push(`/pm/projects/${g.code || t.projectId}`)}>
                              <td onClick={(e) => e.stopPropagation()}>
                                {canUpdateTask(t) ? (
                                  statusSelect(t, setProjectStatus)
                                ) : (
                                  <span className={`status-pill ${t.status === "Completed" ? "success" : ""}`} title="แก้สถานะได้ที่หน้า timeline ของโปรเจกต์">
                                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusDot(t.status) }} /> {TASK_STATUS_TH[t.status] || t.status}
                                  </span>
                                )}
                              </td>
                              <td style={{ fontWeight: 500 }}>{t.name}</td>
                              <td><span style={{ fontSize: "11px", background: "var(--panel-2)", padding: "2px 8px", borderRadius: "12px", fontWeight: 600 }}>{t.role}</span></td>
                              {scope !== "mine" && <td style={{ fontSize: "13px" }}>{usersMap[t.assigneeId] || t.assignee || <span style={{ color: "var(--text-3)" }}>—</span>}</td>}
                              <td>
                                <div style={{ fontSize: "13px" }}>{fmtDate(t.finishDate)}</div>
                                <div style={{ fontSize: "11px", color: u.color, display: "flex", alignItems: "center", gap: "4px", marginTop: "2px" }}>{u.icon} {u.label}</div>
                              </td>
                            </tr>
                          );
                        })}
                        {!isCollapsed && g.extra.length > 0 && (
                          <tr>
                            <td colSpan={cols} style={{ padding: "4px 12px", background: "color-mix(in srgb, var(--purple) 5%, transparent)" }}>
                              <span style={{ fontSize: "11px", fontWeight: 700, color: "var(--purple)", display: "inline-flex", alignItems: "center", gap: "6px" }}><PlusCircle size={12} /> งานเพิ่มเติม ({g.extra.length})</span>
                            </td>
                          </tr>
                        )}
                        {!isCollapsed && g.extra.map((t) => {
                          const u = getUrgencyInfo(t);
                          const canEditExtra = canManageExtra(t);
                          return (
                            <tr key={t.id} className="premium-row" onClick={canEditExtra ? () => openEdit(t) : undefined} title={canEditExtra ? "คลิกเพื่อแก้ไขงาน" : undefined} style={{ cursor: canEditExtra ? "pointer" : "default" }}>
                              <td onClick={(e) => e.stopPropagation()}>{extraStatusCell(t)}</td>
                              <td style={{ fontWeight: 500 }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>{t.title} {extraBadge}</span>
                                {t.note && <div style={{ fontSize: "11px", color: "var(--text-3)" }}>{t.note}</div>}
                              </td>
                              <td><span style={{ color: "var(--text-3)" }}>—</span></td>
                              {scope !== "mine" && <td style={{ fontSize: "13px" }}>{extraAssigneeName(t)}</td>}
                              <td>
                                {t.dueDate ? (
                                  <div style={{ fontSize: "11px", color: u.color, display: "flex", alignItems: "center", gap: "4px" }}>{u.icon} {fmtDate(t.dueDate)}</div>
                                ) : <span style={{ color: "var(--text-3)" }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              /* ── List view: การ์ดจัดกลุ่มตามโครงการ (สไตล์เดียวกับ List view หน้า detail) ── */
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {projGroups.map((g) => {
                  const isCollapsed = collapsed.has(g.projectId);
                  return (
                    <div key={g.projectId} className="glass-panel" style={{ padding: 0, overflow: "hidden" }}>
                      {/* group header — โทน accent เหมือนหัวเฟสในหน้า detail */}
                      <button type="button" onClick={() => toggleCollapse(g.projectId)} style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", padding: "11px 16px", background: "color-mix(in srgb, var(--accent) 7%, var(--panel-2))", border: "none", borderLeft: "3px solid var(--accent)", borderBottom: isCollapsed ? "none" : "1px solid var(--border)", cursor: "pointer", color: "var(--text)", textAlign: "left" }}>
                        {isCollapsed ? <ChevronRight size={15} color="var(--accent)" /> : <ChevronDown size={15} color="var(--accent)" />}
                        <span className="ui-badge font-mono" style={{ background: "var(--bg)", color: "var(--text-2)", border: "1px solid var(--border)" }}>{g.code}</span>
                        <span style={{ fontWeight: 700, fontSize: "13px", flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.name}</span>
                        {g.tasks.length > 0 && (
                          <>
                            <span style={{ fontSize: "12px", fontWeight: 600, color: g.pct === 100 ? "var(--green)" : "var(--accent)" }}>{g.done}/{g.tasks.length}</span>
                            <div className="progress" style={{ width: "60px" }}><span className={g.pct === 100 ? "done" : ""} style={{ width: `${g.pct}%` }} /></div>
                          </>
                        )}
                        <span onClick={(e) => { e.stopPropagation(); router.push(`/pm/projects/${g.code || g.projectId}`); }} title="เปิดหน้าโปรเจกต์" className="btn-icon" style={{ flexShrink: 0 }}><ExternalLink size={14} /></span>
                      </button>
                      {!isCollapsed && (
                        <div style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "14px" }}>
                          {g.tasks.map((t, i) => renderWorkCard(t, g, { num: i + 1, hasNext: i < g.tasks.length - 1, isExtra: false }))}
                          {g.extra.length > 0 && (
                            <div style={{ fontSize: "11px", fontWeight: 700, color: "var(--purple)", display: "flex", alignItems: "center", gap: "6px", marginTop: "2px" }}><PlusCircle size={12} /> งานเพิ่มเติม ({g.extra.length})</div>
                          )}
                          {g.extra.map((t, i) => renderWorkCard(t, g, { num: g.tasks.length + i + 1, hasNext: i < g.extra.length - 1, isExtra: true }))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* ── งานส่วนตัว ── */}
          <section style={{ minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px", flexWrap: "wrap" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <User size={17} color="var(--purple)" /> งานส่วนตัว
                <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--text-3)" }}>{visiblePersonal.length} งาน · เห็นเฉพาะคุณ · นอกโปรเจกต์</span>
              </div>
              {/* ปุ่มเพิ่มงานซ้ำตรงหัวข้อ — กดง่ายขึ้นเวลาเลื่อนอยู่ส่วนนี้ */}
              <button onClick={openAdd} className="btn" style={{ fontSize: "12px" }}>
                <Plus size={14} /> เพิ่มงาน
              </button>
            </div>
            {visiblePersonal.length === 0 ? (
              <button onClick={openAdd} className="glass-panel" style={{ width: "100%", padding: "28px", textAlign: "center", color: "var(--text-3)", fontSize: "13px", cursor: "pointer", border: "1px dashed var(--border)", display: "flex", flexDirection: "column", alignItems: "center", gap: "8px" }}>
                <Plus size={20} />
                {statusFilter !== "all" ? "ไม่มีงานส่วนตัวตรงกับตัวกรองนี้" : "ยังไม่มีงานส่วนตัว — กดเพื่อสร้าง to-do ของคุณ (เช่น โทรตามลูกค้า, เตรียมเอกสาร)"}
              </button>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 260px), 1fr))", gap: "12px" }}>
                {visiblePersonal.map((t) => {
                  const u = getUrgencyInfo(t);
                  const proj = t.projectId ? (allProjects.find((p) => p.id === t.projectId) || projectsMap[t.projectId]) : null;
                  const done = t.status === "Completed";
                  return (
                    <div key={t.id} onClick={() => openEdit(t)} title="คลิกเพื่อแก้ไขงาน" className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", borderLeft: `3px solid ${statusDot(t.status)}`, cursor: "pointer" }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <span title={TASK_STATUS_TH[t.status]} style={{ padding: "2px", flexShrink: 0, color: statusDot(t.status), display: "flex" }}>
                          {statusIcon(t.status)}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "14px", fontWeight: 600, textDecoration: done ? "line-through" : "none", color: done ? "var(--text-3)" : "var(--text)" }}>{t.title}</div>
                          {t.note && <div style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "2px" }}>{t.note}</div>}
                        </div>
                        <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                          <button className="btn-icon danger" onClick={() => deletePersonal(t)} aria-label="ลบงาน" title="ลบ"><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", flexWrap: "wrap" }}>
                        {statusSelect(t, setPersonalStatus)}
                        {(t.dueDate) && <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: u.color }}>{u.icon} {fmtDate(t.dueDate)}</span>}
                        {proj && <span onClick={() => router.push(`/pm/projects/${proj.code || t.projectId}`)} style={{ cursor: "pointer", fontSize: "10px", background: "var(--panel-2)", padding: "2px 6px", borderRadius: "4px", border: "1px solid var(--border)" }} className="font-mono">{proj.code}</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* task modal — ผูกโปรเจกต์ = "งานเพิ่มเติม" (มอบหมายในทีมได้); ไม่ผูก = "งานส่วนตัว" */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? "แก้ไขงาน" : "เพิ่มงาน"} size="md">
        <form onSubmit={savePersonal}>
          <div className="grid gap-[14px]">
            <div className="form-group">
              <label>ชื่องาน <span className="text-[var(--red)]">*</span></label>
              <input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required className="premium-input w-full" placeholder="เช่น โทรตามลูกค้า, เตรียมเอกสาร" />
            </div>
            <div className="form-group">
              <label>รายละเอียด</label>
              <textarea value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="premium-input w-full" rows={3} placeholder="โน้ตเพิ่มเติม (ไม่บังคับ)" />
            </div>
            <div className="pm-form-grid gap-3">
              <div className="form-group">
                <label>กำหนดส่ง</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="premium-input w-full" />
              </div>
              <div className="form-group">
                <label>ผูกโปรเจกต์ <span className="text-[11px] text-[var(--text-3)] font-normal">(ไม่บังคับ)</span></label>
                {/* เปลี่ยนโปรเจกต์ → ล้างผู้รับมอบ (อาจคนละทีม) */}
                <Select fullWidth value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value, assigneeId: "" }))}>
                  <option value="">— ไม่ผูก (งานส่วนตัว) —</option>
                  {allProjects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </Select>
              </div>
            </div>
            {form.projectId && (() => {
              const proj = allProjects.find((p) => p.id === form.projectId);
              const team = proj?.team ?? null;
              const teammates = users.filter((u) => team && u.team === team);
              return (
                <div className="form-group">
                  <label>มอบหมายให้ <span className="text-[11px] text-[var(--text-3)] font-normal">(คนในทีมของโปรเจกต์ — งานจะไปอยู่ใน "งานของฉัน" ของคนนั้น)</span></label>
                  <Select fullWidth value={form.assigneeId} onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value }))}>
                    <option value="">— ไม่มอบหมาย (ของฉัน) —</option>
                    {teammates.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                  </Select>
                  {team && teammates.length === 0 && <div className="text-[11px] text-[var(--text-3)] mt-1">ไม่มีสมาชิกในทีมนี้ให้มอบหมาย</div>}
                </div>
              );
            })()}
          </div>
          <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
            <button type="button" onClick={() => setShowModal(false)} className="btn">ยกเลิก</button>
            <button type="submit" disabled={saving} className="btn btn-primary px-8">{editingId ? "บันทึก" : "เพิ่ม"}</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
