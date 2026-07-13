"use client";

// ตารางไทม์ไลน์ของดีล — ความสามารถเทียบตารางโครงการ (มติผู้ใช้: "แก้ที่ดีลซิงก์โครงการ
// แก้ที่โครงการซิงก์ดีล") ซึ่งได้ฟรีเพราะเป็น project_tasks แถวเดียวกัน: ดีลเห็นเฉพาะ
// segment ของตัวเอง / โครงการเห็นรวมทุกดีล. ใช้ API ชุดเดียวกับหน้าโครงการทั้งหมด
// (PATCH/POST/DELETE /api/pm/project-tasks) — สิทธิ์+คำนวณวัน+สถานะอัตโนมัติฝั่ง server.
// แก้ dependency (ขึ้นกับ) ยังทำที่หน้าโครงการ (แสดงเป็นชิปอย่างเดียวที่นี่).
import { useEffect, useMemo, useState } from "react";
import { ArrowUpDown, CheckCircle2, CircleDashed, Clock, Filter, Flag, Pencil, Plus, Trash2, TrendingUp } from "lucide-react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import PredecessorPicker from "@/components/pm/PredecessorPicker";
import ProjectDocumentView from "@/components/pm/ProjectDocumentView";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import { fmtDate } from "@/lib/format";
import { useResponsiveView } from "@/lib/useResponsiveView";

const STATUS_META = {
  Pending: { label: "รอดำเนินการ", color: "var(--text-3)" },
  "In Progress": { label: "กำลังทำ", color: "var(--accent)" },
  Completed: { label: "เสร็จแล้ว", color: "var(--green)" },
};
const ROLES = ["SA", "RD", "PC", "PD", "QC", "LG", "WH", "ALL"];

const emptyForm = { name: "", role: "SA", phase: "", durationDays: 1, startDate: "", assigneeId: "", assignee: "", isMilestone: false, note: "", predecessors: [] };

export default function TimelineWorkspace({
  tasks,
  canEdit,
  canAdd = canEdit,
  canReorder = canEdit,
  dealId,
  projectId,
  timelineContext,
  documentProject: suppliedDocumentProject,
  canEditProjectFields = false,
  onUpdateProject,
  view: controlledView,
  onViewChange,
  showViewSwitcher = true,
  onChanged,
  onError,
}) {
  const [responsiveView, setResponsiveView] = useResponsiveView({ portrait: "list", landscape: "table" });
  const view = controlledView || responsiveView;
  const setView = (nextView) => {
    if (!controlledView) setResponsiveView(nextView);
    onViewChange?.(nextView);
  };
  const [busyId, setBusyId] = useState("");
  const [users, setUsers] = useState([]);
  const [editTask, setEditTask] = useState(null); // task ที่เปิดแก้ในโมดัล
  const [form, setForm] = useState(emptyForm);
  const [addAfterId, setAddAfterId] = useState(null); // แทรกหลังแถวนี้ (null = ต่อท้าย)
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tableStatusFilter, setTableStatusFilter] = useState("all");
  const [tableSort, setTableSort] = useState("step");

  useEffect(() => {
    if (!canEdit) return;
    fetch("/api/pm/assignable-users").then((r) => (r.ok ? r.json() : [])).then((d) => setUsers(d || [])).catch(() => {});
  }, [canEdit]);

  // เลขขั้น 1.1/1.2 ตามกลุ่มเฟส (แบบเดียวกับตารางโครงการ) + map ไว้แปลชิป "ขึ้นกับ"
  const { groups, numberOf } = useMemo(() => {
    const groups = [];
    const numberOf = new Map();
    for (const t of tasks) {
      const last = groups[groups.length - 1];
      if (!last || last.phase !== (t.phase || "")) groups.push({ phase: t.phase || "", tasks: [t] });
      else last.tasks.push(t);
    }
    groups.forEach((g, gi) => g.tasks.forEach((t, ti) => numberOf.set(t.id, `${gi + 1}.${ti + 1}`)));
    return { groups, numberOf };
  }, [tasks]);

  const phases = useMemo(() => [...new Set(tasks.map((t) => t.phase).filter(Boolean))], [tasks]);
  const tableGroups = useMemo(() => groups.map((group) => {
    const filtered = group.tasks.filter((task) => {
      if (tableStatusFilter === "pending") return !task.status || task.status === "Pending";
      if (tableStatusFilter === "progress") return task.status === "In Progress";
      if (tableStatusFilter === "completed") return task.status === "Completed";
      return true;
    });
    const statusRank = { "In Progress": 0, Pending: 1, Completed: 2 };
    const sorted = [...filtered].sort((a, b) => {
      if (tableSort === "due") return String(a.finishDate || "9999").localeCompare(String(b.finishDate || "9999"));
      if (tableSort === "status") return (statusRank[a.status] ?? 1) - (statusRank[b.status] ?? 1);
      if (tableSort === "name") return String(a.name || "").localeCompare(String(b.name || ""), "th");
      return (a.stepOrder ?? 0) - (b.stepOrder ?? 0);
    });
    return { ...group, tasks: sorted };
  }).filter((group) => group.tasks.length), [groups, tableSort, tableStatusFilter]);
  // PredecessorPicker แสดงเลขขั้นจาก displayNumber — เติมจาก map เลข 1.1/1.2 ของตารางนี้
  const tasksWithNumbers = useMemo(
    () => tasks.map((t) => ({ ...t, displayNumber: numberOf.get(t.id) })),
    [tasks, numberOf],
  );

  const call = async (label, url, opts) => {
    setBusyId(label);
    try {
      const res = await fetch(url, opts);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "ทำรายการไม่สำเร็จ");
      await onChanged?.();
      return true;
    } catch (e) {
      onError?.(e.message || "ทำรายการไม่สำเร็จ");
      return false;
    } finally {
      setBusyId("");
    }
  };

  const patch = (t, body) => call(t.id, `/api/pm/project-tasks/${t.id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const patchById = (taskId, body) => {
    const task = tasks.find((item) => item.id === taskId);
    return task ? patch(task, body) : Promise.resolve(false);
  };
  const removeTask = (t) => {
    if (!window.confirm(`ลบขั้นตอน "${t.name}"?`)) return;
    return call(t.id, `/api/pm/project-tasks/${t.id}`, { method: "DELETE" });
  };

  const openEdit = (t) => {
    setEditTask(t);
    setForm({ name: t.name || "", role: t.role || "SA", phase: t.phase || "", durationDays: t.durationDays ?? 1, startDate: t.startDate || "", assigneeId: t.assigneeId || "", assignee: t.assignee || "", isMilestone: !!t.isMilestone, note: t.note || "", predecessors: t.predecessors || [] });
  };
  const saveEdit = async (e) => {
    e.preventDefault();
    setSaving(true);
    const okDone = await patch(editTask, form);
    setSaving(false);
    if (okDone) setEditTask(null);
  };

  const openAdd = (afterId) => {
    setAddAfterId(afterId);
    const after = tasks.find((t) => t.id === afterId);
    // แทรกหลังขั้นไหน default ขึ้นกับขั้นนั้น (พฤติกรรมเดียวกับปุ่มแทรกของตารางโครงการ)
    setForm({ ...emptyForm, phase: after?.phase || phases[phases.length - 1] || "", predecessors: afterId ? [afterId] : [] });
    setAddOpen(true);
  };
  const saveAdd = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    const okDone = await call("add", "/api/pm/project-tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        // ดีลผูกโครงการแล้ว → เพิ่มเข้าโครงการ tag segment ดีลนี้; ยังไม่ผูก → ชุดลอยของดีล
        ...(projectId ? { projectId, dealId } : { dealId }),
        ...(addAfterId ? { afterTaskId: addAfterId } : {}),
      }),
    });
    setSaving(false);
    if (okDone) setAddOpen(false);
  };

  // เลื่อนลำดับในเฟสเดียวกัน — สลับ stepOrder สองแถว (แบบปุ่มลูกศรของตารางโครงการ)
  const move = async (t, dir) => {
    if (!canReorder) return;
    const flat = groups.flatMap((g) => g.tasks);
    const i = flat.findIndex((x) => x.id === t.id);
    const j = i + dir;
    if (j < 0 || j >= flat.length || flat[j].phase !== t.phase) return;
    const other = flat[j];
    setBusyId(t.id);
    try {
      await Promise.all([
        fetch(`/api/pm/project-tasks/${t.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stepOrder: other.stepOrder }) }),
        fetch(`/api/pm/project-tasks/${other.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ stepOrder: t.stepOrder }) }),
      ]);
      await onChanged?.();
    } finally {
      setBusyId("");
    }
  };

  const assigneeOptions = users.map((u) => ({ id: u.id, name: u.name }));
  const done = tasks.filter((task) => task.status === "Completed").length;
  const inProgress = tasks.filter((task) => task.status === "In Progress").length;
  const progressPct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const documentProject = suppliedDocumentProject || {
    id: projectId || `deal-${dealId}`,
    name: timelineContext?.name || "ไทม์ไลน์ดีล",
    customerName: timelineContext?.customerName || "",
    startDate: timelineContext?.startDate || tasks.find((task) => task.startDate)?.startDate || "",
    status: timelineContext?.status || "In Progress",
    metadata: { brand: timelineContext?.brand || "", quotationNumber: timelineContext?.quotationNumber || "" },
    tasks,
  };

  const taskForm = (onSubmit, title, submitLabel) => (
    <form onSubmit={onSubmit}>
      <div style={{ padding: "16px 18px", display: "grid", gap: 12 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          ชื่อขั้นตอน
          <input className="premium-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus />
        </label>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            แผนก
            <select className="premium-select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            จำนวนวันทำการ
            <input type="number" min="1" className="premium-input" value={form.durationDays}
              onChange={(e) => setForm({ ...form, durationDays: Math.max(1, Number(e.target.value) || 1) })} />
          </label>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          เฟส
          <input className="premium-input" list="deal-tl-phases" value={form.phase} onChange={(e) => setForm({ ...form, phase: e.target.value })} placeholder="เลือกหรือพิมพ์เฟสใหม่" />
          <datalist id="deal-tl-phases">{phases.map((p) => <option key={p} value={p} />)}</datalist>
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={form.isMilestone} onChange={(e) => setForm({ ...form, isMilestone: e.target.checked })} />
          ตั้งเป็น Milestone
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          หมายเหตุ
          <textarea className="premium-input" rows={2} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} style={{ resize: "vertical" }} />
        </label>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          งานที่ต้องรอให้เสร็จก่อน (ขึ้นกับ) <span style={{ fontSize: 11, color: "var(--text-3)" }}>เลือกได้หลายขั้น — server เลื่อนวันให้ตามสายอัตโนมัติ</span>
          <PredecessorPicker
            tasks={tasksWithNumbers}
            selfId={editTask?.id || null}
            value={form.predecessors || []}
            onChange={(predecessors) => setForm({ ...form, predecessors })}
            maxHeight={150}
          />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 18px 16px" }}>
        <button type="button" className="btn ghost" onClick={() => { setEditTask(null); setAddOpen(false); }} disabled={saving}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "กำลังบันทึก…" : submitLabel}</button>
      </div>
    </form>
  );

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700 }}>ไทม์ไลน์ดีล</div>
          <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>{done}/{tasks.length} ขั้นตอนเสร็จแล้ว</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            ผู้รับผิดชอบ
            <select className="premium-select" value={form.assigneeId} onChange={(e) => {
              const selected = assigneeOptions.find((user) => user.id === e.target.value);
              setForm({ ...form, assigneeId: e.target.value, assignee: selected?.name || "" });
            }}>
              <option value="">— ยังไม่ระบุ —</option>
              {assigneeOptions.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
            วันที่เริ่ม
            <DateInput value={form.startDate} onChange={(startDate) => setForm({ ...form, startDate })} />
          </label>
        </div>
        {showViewSwitcher && <ViewSwitcher value={view} onChange={setView} modes={["list", "table", "document"]} />}
      </div>

      {view === "document" && (
        <div className="glass-panel" style={{ padding: 16 }}>
          <ProjectDocumentView
            project={documentProject}
            canEdit={canEdit}
            canEditProjectFields={canEditProjectFields}
            onUpdateProject={onUpdateProject}
            onUpdateTask={patchById}
            statusLabel={timelineContext?.statusLabel || documentProject.status}
            statusColor={timelineContext?.statusColor}
          />
        </div>
      )}

      {view === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div className="glass-panel" style={{ padding: "18px 20px", background: "var(--panel-2)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div>
                <div className="mono tabular-nums" style={{ fontSize: 34, fontWeight: 800, color: "var(--accent)", lineHeight: 1 }}>{progressPct}%</div>
                <div style={{ color: "var(--text-2)", fontSize: 12.5, marginTop: 8, display: "flex", alignItems: "center", gap: 6 }}><TrendingUp size={14} /> เสร็จแล้ว {done} จาก {tasks.length} ขั้นตอน</div>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span className="ui-badge" style={{ color: "var(--text-3)" }}><CircleDashed size={12} /> รอ {tasks.length - done - inProgress}</span>
                <span className="ui-badge" style={{ color: "var(--accent)" }}><Clock size={12} /> กำลังทำ {inProgress}</span>
                <span className="ui-badge" style={{ color: "var(--green)" }}><CheckCircle2 size={12} /> เสร็จ {done}</span>
              </div>
            </div>
            <div className="progress" style={{ height: 8, marginTop: 14 }}><span className={done === tasks.length && tasks.length ? "done" : undefined} style={{ width: `${progressPct}%` }} /></div>
          </div>
          {groups.map((group, groupIndex) => (
            <section key={`${group.phase}|${groupIndex}`}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", borderLeft: "3px solid var(--accent)", background: "var(--panel-2)", borderRadius: 10, fontWeight: 700, fontSize: 13 }}>
                {groupIndex + 1}. {group.phase || "ไม่ระบุเฟส"}
                <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: 11 }}>{group.tasks.filter((task) => task.status === "Completed").length}/{group.tasks.length}</span>
              </div>
              <div style={{ marginLeft: 14, borderLeft: "2px solid var(--border)", padding: "8px 0 2px 18px" }}>
                {group.tasks.map((task) => (
                  <div key={task.id} className="glass-panel" style={{ padding: 14, marginBottom: 9, display: "grid", gridTemplateColumns: "minmax(0, 1fr) auto", gap: 12, opacity: busyId === task.id ? 0.5 : 1 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 7, fontWeight: 700 }}>
                        <span className="mono" style={{ color: "var(--text-3)", fontSize: 12 }}>{numberOf.get(task.id)}</span>
                        {task.isMilestone && <Flag size={13} color="var(--amber)" />}{task.name}
                      </div>
                      <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 6 }}>{task.role || "-"} · {task.assignee || "ยังไม่ระบุผู้รับผิดชอบ"} · {fmtDate(task.startDate)} → {fmtDate(task.finishDate)}</div>
                      {task.note && <div style={{ color: "var(--text-2)", fontSize: 12, marginTop: 5 }}>{task.note}</div>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      {canEdit ? (
                        <select className="premium-select" value={task.status || "Pending"} disabled={!!busyId} onChange={(event) => patch(task, { status: event.target.value })}>
                          {Object.entries(STATUS_META).map(([key, meta]) => <option key={key} value={key}>{meta.label}</option>)}
                        </select>
                      ) : <span className="ui-badge" style={{ color: STATUS_META[task.status]?.color }}>{STATUS_META[task.status]?.label || task.status}</span>}
                      {canEdit && <button type="button" className="btn-icon" onClick={() => openEdit(task)} aria-label={`แก้ไข ${task.name}`}><Pencil size={14} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
          {!tasks.length && <div className="glass-panel" style={{ padding: 24, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีขั้นตอนในไทม์ไลน์นี้</div>}
          {canAdd && <button type="button" className="btn btn-primary" onClick={() => openAdd(null)} disabled={!!busyId}><Plus size={14} /> เพิ่มขั้นตอน</button>}
        </div>
      )}

      {view === "table" && (
      <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>ตารางขั้นตอนงาน <span style={{ color: "var(--text-3)", fontWeight: 500 }}>({tableGroups.reduce((sum, group) => sum + group.tasks.length, 0)}{tableStatusFilter !== "all" ? ` / ${tasks.length}` : ""} ขั้นตอน)</span></div>
        <div className="toolbar">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Filter size={14} color="var(--text-3)" />
            <select className="premium-select" value={tableStatusFilter} onChange={(event) => setTableStatusFilter(event.target.value)} aria-label="กรองสถานะไทม์ไลน์">
              <option value="all">ทุกสถานะ</option><option value="pending">รอดำเนินการ</option><option value="progress">กำลังทำ</option><option value="completed">เสร็จแล้ว</option>
            </select>
          </div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ArrowUpDown size={14} color="var(--text-3)" />
            <select className="premium-select" value={tableSort} onChange={(event) => setTableSort(event.target.value)} aria-label="เรียงลำดับไทม์ไลน์">
              <option value="step">ลำดับขั้นตอน</option><option value="due">วันเสร็จ</option><option value="status">สถานะ</option><option value="name">ชื่อขั้นตอน</option>
            </select>
          </div>
        </div>
      </div>
      <div className="premium-glass-table table-responsive">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th style={{ width: 56 }}>#</th><th>ขั้นตอน</th><th>แผนก</th><th>ผู้รับผิดชอบ</th>
              <th>สถานะ</th><th>เริ่ม</th><th>เสร็จ</th><th className="num">วัน</th><th>ขึ้นกับ</th>
              {canEdit && <th style={{ width: 118 }}>จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {tableGroups.map((g, gi) => (
              <FragmentGroup key={`${g.phase}|${gi}`}>
                <tr>
                  <td colSpan={canEdit ? 10 : 9} style={{ background: "var(--panel-2)", fontWeight: 700, fontSize: 13 }}>
                    {gi + 1}. {g.phase || "ไม่ระบุเฟส"}
                    <span style={{ float: "right", color: "var(--text-3)", fontWeight: 500 }}>
                      {g.tasks.filter((t) => t.status === "Completed").length}/{g.tasks.length}
                    </span>
                  </td>
                </tr>
                {g.tasks.map((t) => (
                  <tr key={t.id} className="premium-row" style={{ opacity: busyId === t.id ? 0.5 : 1 }}>
                    <td className="mono">
                      {canReorder && tableSort === "step" && (
                        <span style={{ display: "inline-flex", flexDirection: "column", marginRight: 4, verticalAlign: "middle" }}>
                          <button type="button" className="btn-icon" style={{ height: 14, padding: 0 }} aria-label="เลื่อนขึ้น" onClick={() => move(t, -1)} disabled={!!busyId}>▴</button>
                          <button type="button" className="btn-icon" style={{ height: 14, padding: 0 }} aria-label="เลื่อนลง" onClick={() => move(t, 1)} disabled={!!busyId}>▾</button>
                        </span>
                      )}
                      {numberOf.get(t.id)}
                    </td>
                    <td style={{ fontWeight: 600 }}>
                      {t.isMilestone && <Flag size={12} aria-hidden="true" style={{ color: "var(--amber)", marginRight: 4 }} />}
                      {t.name}
                      {t.note && <span style={{ display: "block", color: "var(--text-3)", fontSize: 11.5, fontWeight: 500 }}>{t.note}</span>}
                    </td>
                    <td><span className="ui-badge" style={{ color: "var(--text-2)" }}>{t.role || "-"}</span></td>
                    <td>
                      {canEdit ? (
                        <select className="premium-select" value={t.assigneeId || ""} disabled={!!busyId} style={{ minWidth: 130 }}
                          aria-label={`ผู้รับผิดชอบ ${t.name}`}
                          onChange={(e) => {
                            const u = assigneeOptions.find((x) => x.id === e.target.value);
                            patch(t, { assigneeId: e.target.value || null, assignee: u?.name || null });
                          }}>
                          <option value="">{t.assignee || "— ไม่ระบุ —"}</option>
                          {assigneeOptions.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                      ) : (t.assignee || "-")}
                    </td>
                    <td>
                      {canEdit ? (
                        <select className="premium-select" value={t.status || "Pending"} disabled={!!busyId} style={{ width: 132 }}
                          aria-label={`สถานะ ${t.name}`} onChange={(e) => patch(t, { status: e.target.value })}>
                          {Object.entries(STATUS_META).map(([k, m]) => <option key={k} value={k}>{m.label}</option>)}
                        </select>
                      ) : (
                        <span className="ui-badge" style={{ color: STATUS_META[t.status]?.color || "var(--text-3)" }}>
                          {STATUS_META[t.status]?.label || t.status || "-"}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {canEdit ? (
                        <DateInput value={t.startDate || ""} onChange={(v) => patch(t, { startDate: v || null })} aria-label={`วันเริ่ม ${t.name}`} />
                      ) : fmtDate(t.startDate)}
                    </td>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>{fmtDate(t.finishDate)}</td>
                    <td className="num">
                      {canEdit ? (
                        <input type="number" min="1" className="premium-input mono" defaultValue={t.durationDays ?? 1} style={{ width: 58, textAlign: "right" }}
                          aria-label={`จำนวนวัน ${t.name}`} disabled={!!busyId}
                          onBlur={(e) => {
                            const v = Math.max(1, Number(e.target.value) || 1);
                            if (v !== (t.durationDays ?? 1)) patch(t, { durationDays: v });
                          }} />
                      ) : (t.durationDays ?? "-")}
                    </td>
                    <td>
                      {(t.predecessors || []).length
                        ? t.predecessors.map((p) => <span key={p} className="ui-badge" style={{ color: "var(--amber)", marginRight: 3 }}>{numberOf.get(p) || "?"}</span>)
                        : <span style={{ color: "var(--text-3)", fontSize: 12 }}>-</span>}
                    </td>
                    {canEdit && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        <button type="button" className="btn-icon" title="แทรกขั้นตอนถัดจากนี้" aria-label={`แทรกหลัง ${t.name}`} onClick={() => openAdd(t.id)} disabled={!!busyId}><Plus size={14} aria-hidden="true" /></button>
                        <button type="button" className="btn-icon" style={{ color: "var(--blue)" }} title="แก้ไข" aria-label={`แก้ไข ${t.name}`} onClick={() => openEdit(t)} disabled={!!busyId}><Pencil size={14} aria-hidden="true" /></button>
                        <button type="button" className="btn-icon danger" title="ลบ" aria-label={`ลบ ${t.name}`} onClick={() => removeTask(t)} disabled={!!busyId}><Trash2 size={14} aria-hidden="true" /></button>
                      </td>
                    )}
                  </tr>
                ))}
              </FragmentGroup>
            ))}
          </tbody>
        </table>
      </div>
      {canAdd && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn ghost" onClick={() => openAdd(null)} disabled={!!busyId}>
            <Plus size={14} aria-hidden="true" /> เพิ่มขั้นตอน
          </button>
        </div>
      )}
      </>
      )}

      <Modal open={!!editTask} onClose={() => !saving && setEditTask(null)} title="แก้ไขขั้นตอน" size="sm">
        {editTask && taskForm(saveEdit, "แก้ไขขั้นตอน", "บันทึก")}
      </Modal>
      <Modal open={addOpen} onClose={() => !saving && setAddOpen(false)} title={addAfterId ? "แทรกขั้นตอน" : "เพิ่มขั้นตอน"} size="sm">
        {addOpen && taskForm(saveAdd, "เพิ่มขั้นตอน", "เพิ่มขั้นตอน")}
      </Modal>
    </>
  );
}

// React ต้องการ key บน fragment ใน list — ใช้ตัวห่อเปล่า
function FragmentGroup({ children }) {
  return <>{children}</>;
}
