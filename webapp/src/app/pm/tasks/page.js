"use client";
import { useState, useEffect, useMemo, Fragment } from "react";
import { useRouter } from "next/navigation";
import { ListTodo, Search, CheckCircle2, Clock, AlertTriangle, User, Plus, Edit2, Trash2, CircleDashed, ChevronRight, Flame, ArrowUpDown } from "lucide-react";
import Modal from "@/components/Modal";

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

// ตัวกรองสถานะ — ตรงกับการ์ดสรุปด้านบน
const matchStatus = (t, filter) => {
  if (filter === "all") return true;
  if (filter === "progress") return t.status === "In Progress";
  if (filter === "urgent") return isUrgent(t);
  if (filter === "done") return t.status === "Completed";
  return true;
};

// ตัวเปรียบเทียบสำหรับจัดเรียง
const STATUS_ORDER = { "In Progress": 0, Pending: 1, Completed: 2 };
const makeComparator = (sortKey) => {
  if (sortKey === "due") return (a, b) => {
    const da = daysToDue(a), db = daysToDue(b);
    if (da === null && db === null) return 0;
    if (da === null) return 1; // ไม่มีกำหนด → ท้ายสุด
    if (db === null) return -1;
    return da - db;
  };
  if (sortKey === "name") return (a, b) => (a.name || a.title || "").localeCompare(b.name || b.title || "", "th");
  if (sortKey === "status") return (a, b) => (STATUS_ORDER[a.status] ?? 9) - (STATUS_ORDER[b.status] ?? 9);
  // default = ลำดับขั้นตอน (stepOrder) สำหรับงานโปรเจกต์
  return (a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0);
};

const PERSONAL_BLANK = { title: "", note: "", dueDate: "", projectId: "" };

const SORT_OPTIONS = [
  { key: "default", label: "ลำดับขั้นตอน" },
  { key: "due", label: "ใกล้ครบกำหนด" },
  { key: "status", label: "สถานะ" },
  { key: "name", label: "ชื่องาน" },
];

export default function MyWorkPage() {
  const router = useRouter();
  const [scope, setScope] = useState("mine");
  const [allowedScopes, setAllowedScopes] = useState(["mine"]);
  const [projectTasks, setProjectTasks] = useState([]);
  const [personalTasks, setPersonalTasks] = useState([]);
  const [projectsMap, setProjectsMap] = useState({});
  const [allProjects, setAllProjects] = useState([]);
  const [usersMap, setUsersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all"); // all | progress | urgent | done
  const [sortKey, setSortKey] = useState("default");

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
      if (d.allowedScopes) setAllowedScopes(d.allowedScopes);
      if (d.scope && d.scope !== sc) setScope(d.scope);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { loadWork(scope); }, [scope]);
  useEffect(() => {
    fetch("/api/pm/assignable-users").then((r) => (r.ok ? r.json() : [])).then((u) => {
      setUsersMap(Object.fromEntries((u || []).map((x) => [x.id, x.name])));
    }).catch(() => {});
    fetch("/api/pm/projects").then((r) => (r.ok ? r.json() : [])).then((p) => setAllProjects(p || [])).catch(() => {});
  }, []);

  const q = search.trim().toLowerCase();

  // งานโปรเจกต์ที่ผ่านการค้นหา (ก่อนกรองสถานะ) — ใช้คำนวณการ์ดสรุป
  const searchedProjectTasks = useMemo(
    () => projectTasks.filter((t) => !q || [t.name, projectsMap[t.projectId]?.code, projectsMap[t.projectId]?.name].some((v) => (v || "").toLowerCase().includes(q))),
    [projectTasks, projectsMap, q],
  );

  // สรุปภาพรวม (อิงงานโปรเจกต์ใน scope ปัจจุบัน)
  const stats = useMemo(() => ({
    all: searchedProjectTasks.length,
    progress: searchedProjectTasks.filter((t) => t.status === "In Progress").length,
    urgent: searchedProjectTasks.filter(isUrgent).length,
    done: searchedProjectTasks.filter((t) => t.status === "Completed").length,
  }), [searchedProjectTasks]);

  const comparator = useMemo(() => makeComparator(sortKey), [sortKey]);

  const projGroups = useMemo(() => {
    const groups = new Map();
    searchedProjectTasks
      .filter((t) => matchStatus(t, statusFilter))
      .forEach((t) => {
        if (!groups.has(t.projectId)) {
          const p = projectsMap[t.projectId] || {};
          groups.set(t.projectId, { projectId: t.projectId, code: p.code || "-", name: p.name || "-", tasks: [] });
        }
        groups.get(t.projectId).tasks.push(t);
      });
    const arr = Array.from(groups.values());
    arr.forEach((g) => {
      g.tasks.sort(comparator);
      g.done = g.tasks.filter((t) => t.status === "Completed").length;
      g.pct = g.tasks.length ? Math.round((g.done / g.tasks.length) * 100) : 0;
    });
    return arr;
  }, [searchedProjectTasks, projectsMap, statusFilter, comparator]);

  const visiblePersonal = useMemo(
    () => personalTasks
      .filter((t) => (!q || (t.title || "").toLowerCase().includes(q)) && matchStatus(t, statusFilter))
      .sort(comparator),
    [personalTasks, q, statusFilter, comparator],
  );

  const totalShown = projGroups.reduce((n, g) => n + g.tasks.length, 0);

  // ── personal task CRUD ──
  const openAdd = () => { setEditingId(null); setForm(PERSONAL_BLANK); setShowModal(true); };
  const openEdit = (t) => { setEditingId(t.id); setForm({ title: t.title, note: t.note || "", dueDate: t.dueDate || "", projectId: t.projectId || "" }); setShowModal(true); };
  const savePersonal = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) { alert("ต้องระบุชื่องาน"); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/pm/personal-tasks/${editingId}` : "/api/pm/personal-tasks";
      const res = await fetch(url, {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, projectId: form.projectId || null, dueDate: form.dueDate || null }),
      });
      if (res.ok) { setShowModal(false); loadWork(scope); }
      else alert((await res.json()).error || "บันทึกไม่สำเร็จ");
    } catch { alert("เกิดข้อผิดพลาด"); }
    finally { setSaving(false); }
  };
  const cyclePersonalStatus = async (t) => {
    const next = t.status === "Pending" ? "In Progress" : t.status === "In Progress" ? "Completed" : "Pending";
    setPersonalTasks((prev) => prev.map((x) => x.id === t.id ? { ...x, status: next } : x));
    await fetch(`/api/pm/personal-tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
  };
  const deletePersonal = async (t) => {
    if (!confirm(`ลบงานส่วนตัว "${t.title}" ?`)) return;
    const res = await fetch(`/api/pm/personal-tasks/${t.id}`, { method: "DELETE" });
    if (res.ok) setPersonalTasks((prev) => prev.filter((x) => x.id !== t.id));
  };

  const STAT_CARDS = [
    { key: "all", label: "งานทั้งหมด", count: stats.all, color: "var(--accent)", icon: <ListTodo size={18} /> },
    { key: "progress", label: "กำลังทำ", count: stats.progress, color: "var(--blue)", icon: <Clock size={18} /> },
    { key: "urgent", label: "ต้องรีบ", count: stats.urgent, color: "var(--red)", icon: <Flame size={18} /> },
    { key: "done", label: "เสร็จแล้ว", count: stats.done, color: "var(--green)", icon: <CheckCircle2 size={18} /> },
  ];

  return (
    <div>
      <div className="premium-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
        <div className="header-content">
          <h1><span className="premium-header-icon"><ListTodo size={22} /></span> งานของฉัน (My Work)</h1>
          <p>งานโปรเจกต์ที่มอบหมายให้คุณ + งานส่วนตัวนอกเทมเพลต รวมในที่เดียว</p>
        </div>
        <button onClick={openAdd} className="btn btn-primary flex items-center gap-1.5" style={{ padding: "8px 16px", fontSize: "13px", height: "40px" }}>
          <Plus size={16} /> เพิ่มงานส่วนตัว
        </button>
      </div>

      {/* scope tabs */}
      {allowedScopes.length > 1 && (
        <div style={{ display: "flex", gap: "4px", background: "var(--panel)", borderRadius: "10px", padding: "4px", border: "1px solid var(--border)", width: "fit-content", marginBottom: "16px" }}>
          {allowedScopes.map((s) => (
            <button key={s} onClick={() => setScope(s)} style={{ background: scope === s ? "var(--accent)" : "transparent", color: scope === s ? "#fff" : "var(--text-2)", border: "none", padding: "6px 18px", borderRadius: "7px", fontSize: "13px", fontWeight: 600, cursor: "pointer" }}>
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

      {/* ── แถบเครื่องมือ: ค้นหา + จัดเรียง + สถานะปัจจุบัน ── */}
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap", marginBottom: "20px" }}>
        <div className="search-glass" style={{ width: "260px", maxWidth: "100%" }}>
          <Search size={18} color="var(--text-3)" />
          <input type="text" placeholder="ค้นหางาน..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "6px", color: "var(--text-3)" }}>
          <ArrowUpDown size={15} />
          <select value={sortKey} onChange={(e) => setSortKey(e.target.value)} className="premium-input" style={{ height: "38px", fontSize: "13px", paddingRight: "28px" }}>
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>เรียงตาม: {o.label}</option>)}
          </select>
        </div>
        {statusFilter !== "all" && (
          <button onClick={() => setStatusFilter("all")} className="btn" style={{ height: "38px", fontSize: "12px", display: "flex", alignItems: "center", gap: "6px" }}>
            กรอง: {STAT_CARDS.find((c) => c.key === statusFilter)?.label} <span style={{ fontWeight: 700 }}>×</span>
          </button>
        )}
      </div>

      {loading ? (
        <div style={{ padding: "60px", textAlign: "center", color: "var(--text-3)" }}>กำลังโหลดข้อมูล...</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "28px" }}>
          {/* ── งานโปรเจกต์ ── */}
          <section>
            <div style={{ fontSize: "15px", fontWeight: 700, marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
              <ListTodo size={17} color="var(--accent)" /> งานโปรเจกต์ ({SCOPE_TH[scope]})
              <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--text-3)" }}>{totalShown} งาน</span>
            </div>
            {projGroups.length === 0 ? (
              <div className="glass-panel" style={{ padding: "32px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>
                {statusFilter !== "all"
                  ? "ไม่มีงานตรงกับตัวกรองนี้"
                  : scope === "mine" ? "ยังไม่มีงานโปรเจกต์ที่มอบหมายให้คุณ — ให้หัวหน้า/ผู้ดูแลมอบหมายงานในหน้าโปรเจกต์" : "ไม่มีงานในขอบเขตนี้"}
              </div>
            ) : (
              <div className="premium-glass-table table-responsive">
                <table className="premium-table">
                  <thead>
                    <tr><th>สถานะ</th><th>ชื่องาน</th><th>แผนก</th>{scope !== "mine" && <th>ผู้รับผิดชอบ</th>}<th>กำหนดเสร็จ</th></tr>
                  </thead>
                  <tbody>
                    {projGroups.map((g) => (
                      <Fragment key={g.projectId}>
                        <tr onClick={() => router.push(`/pm/projects/${g.code || g.projectId}`)} style={{ cursor: "pointer" }}>
                          <td colSpan={scope !== "mine" ? 5 : 4} style={{ background: "var(--panel-2)", borderTop: "2px solid var(--border)" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px", fontWeight: 600, fontSize: "13px" }}>
                              <span className="font-mono" style={{ fontSize: "11px", background: "var(--bg)", padding: "2px 8px", borderRadius: "4px", border: "1px solid var(--border)" }}>{g.code}</span>
                              <span>{g.name}</span>
                              {/* progress ต่อโปรเจกต์ */}
                              <div style={{ display: "flex", alignItems: "center", gap: "6px", marginLeft: "auto" }}>
                                <div style={{ width: "70px", height: "5px", borderRadius: "99px", background: "var(--border)", overflow: "hidden" }}>
                                  <div style={{ width: `${g.pct}%`, height: "100%", background: g.pct === 100 ? "var(--green)" : "var(--accent)" }} />
                                </div>
                                <span style={{ fontSize: "11px", color: "var(--text-3)", fontWeight: 600, minWidth: "58px" }}>{g.done}/{g.tasks.length} · {g.pct}%</span>
                                <ChevronRight size={14} color="var(--text-3)" />
                              </div>
                            </div>
                          </td>
                        </tr>
                        {g.tasks.map((t) => {
                          const u = getUrgencyInfo(t);
                          return (
                            <tr key={t.id} className="premium-row" style={{ cursor: "pointer" }} onClick={() => router.push(`/pm/projects/${g.code || t.projectId}`)}>
                              <td><span className={`status-pill ${t.status === "Completed" ? "success" : ""}`}><span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusDot(t.status) }} /> {TASK_STATUS_TH[t.status] || t.status}</span></td>
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
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* ── งานส่วนตัว ── */}
          <section>
            <div style={{ display: "flex", alignItems: "center", marginBottom: "12px" }}>
              <div style={{ fontSize: "15px", fontWeight: 700, display: "flex", alignItems: "center", gap: "8px" }}>
                <User size={17} color="var(--purple)" /> งานส่วนตัว
                <span style={{ fontSize: "12px", fontWeight: 400, color: "var(--text-3)" }}>{visiblePersonal.length} งาน · เห็นเฉพาะคุณ</span>
              </div>
            </div>
            {visiblePersonal.length === 0 ? (
              <div className="glass-panel" style={{ padding: "32px", textAlign: "center", color: "var(--text-3)", fontSize: "13px" }}>
                {statusFilter !== "all" ? "ไม่มีงานส่วนตัวตรงกับตัวกรองนี้" : "ยังไม่มีงานส่วนตัว — กด “เพิ่มงานส่วนตัว” เพื่อสร้าง to-do ของคุณ"}
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: "12px" }}>
                {visiblePersonal.map((t) => {
                  const u = getUrgencyInfo(t);
                  const proj = t.projectId ? (allProjects.find((p) => p.id === t.projectId) || projectsMap[t.projectId]) : null;
                  const done = t.status === "Completed";
                  return (
                    <div key={t.id} className="glass-panel" style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: "8px", borderLeft: `3px solid ${statusDot(t.status)}` }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
                        <button onClick={() => cyclePersonalStatus(t)} title="เปลี่ยนสถานะ" style={{ background: "none", border: "none", cursor: "pointer", padding: "2px", flexShrink: 0, color: statusDot(t.status) }}>
                          {done ? <CheckCircle2 size={18} /> : t.status === "In Progress" ? <Clock size={18} /> : <CircleDashed size={18} />}
                        </button>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: "14px", fontWeight: 600, textDecoration: done ? "line-through" : "none", color: done ? "var(--text-3)" : "var(--text)" }}>{t.title}</div>
                          {t.note && <div style={{ fontSize: "12px", color: "var(--text-2)", marginTop: "2px" }}>{t.note}</div>}
                        </div>
                        <div style={{ display: "flex", gap: "2px", flexShrink: 0 }}>
                          <button onClick={() => openEdit(t)} title="แก้ไข" style={{ background: "none", border: "none", color: "var(--text-3)", cursor: "pointer", padding: "3px" }}><Edit2 size={14} /></button>
                          <button onClick={() => deletePersonal(t)} title="ลบ" style={{ background: "none", border: "none", color: "var(--red)", cursor: "pointer", padding: "3px" }}><Trash2 size={14} /></button>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "12px", fontSize: "11px", flexWrap: "wrap" }}>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", color: "var(--text-3)" }}>{TASK_STATUS_TH[t.status]}</span>
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

      {/* personal task modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title={editingId ? "แก้ไขงานส่วนตัว" : "เพิ่มงานส่วนตัว"} size="md">
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
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label>กำหนดส่ง</label>
                <input type="date" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} className="premium-input w-full" />
              </div>
              <div className="form-group">
                <label>ผูกโปรเจกต์ <span className="text-[11px] text-[var(--text-3)] font-normal">(ไม่บังคับ)</span></label>
                <select value={form.projectId} onChange={(e) => setForm((f) => ({ ...f, projectId: e.target.value }))} className="premium-input w-full">
                  <option value="">— ไม่ผูก —</option>
                  {allProjects.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
                </select>
              </div>
            </div>
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
