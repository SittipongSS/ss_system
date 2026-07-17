"use client";
import Select from "@/components/ui/Select";
import SortControl from "@/components/ui/SortControl";

// ตารางไทม์ไลน์ของดีล — ความสามารถเทียบตารางโครงการ (มติผู้ใช้: "แก้ที่ดีลซิงก์โครงการ
// แก้ที่โครงการซิงก์ดีล") ซึ่งได้ฟรีเพราะเป็น project_tasks แถวเดียวกัน: ดีลเห็นเฉพาะ
// segment ของตัวเอง / โครงการเห็นรวมทุกดีล. ใช้ API ชุดเดียวกับหน้าโครงการทั้งหมด
// (PATCH/POST/DELETE /api/pm/project-tasks) — สิทธิ์+คำนวณวัน+สถานะอัตโนมัติฝั่ง server.
// แก้ dependency (ขึ้นกับ) ยังทำที่หน้าโครงการ (แสดงเป็นชิปอย่างเดียวที่นี่).
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Calendar, Check, CheckCircle2, ChevronDown, ChevronRight, CircleDashed, Clock, Filter, Flag, Pencil, Plus, Trash2, TrendingUp, User } from "lucide-react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import StepFormFields, { EMPTY_STEP_FORM, stepToForm } from "@/components/pm/StepFormFields";
import ProjectDocumentView from "@/components/pm/ProjectDocumentView";
import ViewSwitcher from "@/components/pm/ViewSwitcher";
import StatusSelect from "@/components/pm/StatusSelect";
import { fmtDate } from "@/lib/format";
import { useResponsiveView } from "@/lib/useResponsiveView";
import { compactPersonName } from "@/lib/personName";
import { addBusinessDays, countBusinessDays, isBusinessDay, toLocalISODate } from "@/lib/pm/dateHelpers";
import { recalculateGraph } from "@/lib/pm/schedule";
import { cachedFetchJson } from "@/lib/apiCache";

const STATUS_META = {
  Pending: { label: "รอดำเนินการ", color: "var(--text-3)" },
  "In Progress": { label: "กำลังทำ", color: "var(--accent)" },
  Completed: { label: "เสร็จแล้ว", color: "var(--green)" },
};
const ROLE_META = {
  SA: { color: "var(--blue)", bg: "color-mix(in srgb, var(--blue) 10%, transparent)" },
  RD: { color: "var(--violet)", bg: "color-mix(in srgb, var(--violet) 10%, transparent)" },
  PC: { color: "var(--teal)", bg: "color-mix(in srgb, var(--teal) 10%, transparent)" },
  PD: { color: "var(--amber)", bg: "color-mix(in srgb, var(--amber) 10%, transparent)" },
  QC: { color: "var(--green)", bg: "color-mix(in srgb, var(--green) 10%, transparent)" },
};
const PHASE_COLORS = ["var(--accent)", "var(--violet)", "var(--teal)", "var(--amber)", "var(--green)", "var(--blue)"];


function withOptimisticSchedule(task, body) {
  const next = { ...body };
  const startValue = "startDate" in body ? body.startDate : task.startDate;
  if (!startValue) return next;
  const start = new Date(startValue);
  if (Number.isNaN(start.getTime())) return next;
  while (!isBusinessDay(start)) start.setDate(start.getDate() + 1);
  const startIso = toLocalISODate(start);
  // ผู้ใช้ตั้งวันเริ่มเอง = ปักหมุด (กติกาเดียวกับ server) — พรีวิวกราฟจะได้ไม่ดูดแถวนี้
  // กลับไปเกาะ anchor/predecessors ระหว่างยังไม่กดบันทึก
  if ("startDate" in body) { next.startDate = startIso; next.startLocked = !!startIso; }
  if ("finishDate" in body && body.finishDate) {
    const durationDays = Math.max(1, countBusinessDays(startIso, body.finishDate) + 1);
    next.durationDays = durationDays;
    next.finishDate = toLocalISODate(addBusinessDays(start, durationDays - 1));
  } else if ("startDate" in body || "durationDays" in body) {
    const durationDays = Math.max(1, Number("durationDays" in body ? body.durationDays : task.durationDays) || 1);
    next.durationDays = durationDays;
    next.finishDate = toLocalISODate(addBusinessDays(start, durationDays - 1));
  }
  return next;
}

export default function TimelineWorkspace({
  tasks: sourceTasks = [],
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
  showHeading = true,
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
  const [form, setForm] = useState(EMPTY_STEP_FORM);
  const [addAfterId, setAddAfterId] = useState(null); // แทรกหลังแถวนี้ (null = ต่อท้าย)
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tableStatusFilter, setTableStatusFilter] = useState("all");
  const [tableSort, setTableSort] = useState("step");
  const [collapsedPhases, setCollapsedPhases] = useState(new Set());
  const [drafts, setDrafts] = useState({});
  const tasks = useMemo(
    () => {
      const merged = sourceTasks
        .map((task) => (drafts[task.id] ? { ...task, ...drafts[task.id] } : task))
        .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
      if (!Object.keys(drafts).length) return merged;
      // พรีวิว draft ทั้งกราฟ: แก้วันเริ่ม/วันเสร็จ/จำนวนวันแล้ว "ขั้นที่เชื่อมโยงกัน"
      // (predecessors) ต้องเลื่อนตามให้เห็นทันที ไม่ใช่นิ่งจนกดบันทึก — ใช้ตัวคำนวณ
      // เดียวกับ server (recalculateGraph) ผลพรีวิวจึงตรงกับที่จะถูกบันทึกจริง
      const anchor = merged.map((t) => t.startDate).filter(Boolean).sort()[0];
      if (!anchor) return merged;
      try {
        return recalculateGraph(merged, anchor)
          .sort((a, b) => (a.stepOrder ?? 0) - (b.stepOrder ?? 0));
      } catch {
        return merged; // ข้อมูลผิดรูป (เช่น dependency วน) — โชว์แบบไม่คำนวณดีกว่าตารางพัง
      }
    },
    [sourceTasks, drafts],
  );

  useEffect(() => {
    if (!canEdit) return;
    cachedFetchJson("/api/pm/assignable-users").then((d) => setUsers(d || [])).catch(() => {});
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

  const patch = (t, body) => {
    const next = withOptimisticSchedule(t, body);
    setDrafts((current) => ({ ...current, [t.id]: { ...current[t.id], ...next } }));
    return Promise.resolve(true);
  };
  const patchById = (taskId, body) => {
    const task = tasks.find((item) => item.id === taskId);
    return task ? patch(task, body) : Promise.resolve(false);
  };
  const dirtyCount = Object.keys(drafts).length;
  const discardDrafts = () => setDrafts({});
  const saveDrafts = async () => {
    const entries = Object.entries(drafts);
    if (!entries.length) return;
    setSaving(true);
    const failed = {};
    for (const [taskId, body] of entries) {
      try {
        const res = await fetch(`/api/pm/project-tasks/${taskId}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
        });
        if (!res.ok) failed[taskId] = body;
      } catch {
        failed[taskId] = body;
      }
    }
    setDrafts(failed);
    if (Object.keys(failed).length) onError?.(`บันทึกไม่สำเร็จ ${Object.keys(failed).length} ขั้นตอน — รายการที่ยังไม่สำเร็จยังค้างไว้ให้ลองใหม่`);
    await onChanged?.();
    setSaving(false);
  };
  const removeTask = (t) => {
    if (!window.confirm(`ลบขั้นตอน "${t.name}"?`)) return;
    return call(t.id, `/api/pm/project-tasks/${t.id}`, { method: "DELETE" });
  };

  const openEdit = (t) => {
    setEditTask(t);
    setForm(stepToForm(t));
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
    setForm({ ...EMPTY_STEP_FORM, phase: after?.phase || phases[phases.length - 1] || "", predecessors: afterId ? [afterId] : [] });
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
  const move = (t, dir) => {
    if (!canReorder) return;
    const flat = groups.flatMap((g) => g.tasks);
    const i = flat.findIndex((x) => x.id === t.id);
    const j = i + dir;
    if (j < 0 || j >= flat.length || flat[j].phase !== t.phase) return;
    const other = flat[j];
    patch(t, { stepOrder: other.stepOrder });
    patch(other, { stepOrder: t.stepOrder });
  };

  const assigneeOptions = users.map((u) => ({ id: u.id, name: u.name }));
  const done = tasks.filter((task) => task.status === "Completed").length;
  const inProgress = tasks.filter((task) => task.status === "In Progress").length;
  const progressPct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const milestones = tasks.filter((task) => task.isMilestone);
  const today = new Date().toISOString().slice(0, 10);
  const overdue = tasks.filter((task) => task.status !== "Completed" && task.finishDate && task.finishDate < today).length;
  const togglePhase = (key) => setCollapsedPhases((current) => {
    const next = new Set(current);
    next.has(key) ? next.delete(key) : next.add(key);
    return next;
  });
  const documentProject = suppliedDocumentProject || {
    id: projectId || `deal-${dealId}`,
    name: timelineContext?.name || "ไทม์ไลน์ดีล",
    customerName: timelineContext?.customerName || "",
    startDate: timelineContext?.startDate || tasks.find((task) => task.startDate)?.startDate || "",
    status: timelineContext?.status || "In Progress",
    metadata: { brand: timelineContext?.brand || "", quotationNumber: timelineContext?.quotationNumber || "" },
    tasks,
  };

  // ช่องกรอกใช้ชุดกลางร่วมกับหน้าโครงการ (กฎ "แก้ = ฟอร์มเดียวกับตอนสร้าง" ใน AGENTS.md)
  // — เป็น project_tasks แถวเดียวกัน ยิง API เดียวกัน จึงต้องกรอกได้เท่ากันทั้งสองทาง
  const taskForm = (onSubmit, submitLabel) => (
    <form onSubmit={onSubmit}>
      <div style={{ padding: "16px 18px" }}>
        <StepFormFields form={form} setForm={setForm} users={users} phases={phases} tasks={tasksWithNumbers} selfId={editTask?.id || null} />
      </div>
      <div className="form-action-bar" style={{ padding: "16px 18px" }}>
        <button type="button" className="btn ghost" onClick={() => { setEditTask(null); setAddOpen(false); }} disabled={saving}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "กำลังบันทึก…" : submitLabel}</button>
      </div>
    </form>
  );

  return (
    <>
      {(showHeading || showViewSwitcher) && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
          {showHeading && (
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{suppliedDocumentProject ? "ไทม์ไลน์โครงการ" : "ไทม์ไลน์ดีล"}</div>
              <div style={{ color: "var(--text-3)", fontSize: 12, marginTop: 2 }}>{done}/{tasks.length} ขั้นตอนเสร็จแล้ว</div>
            </div>
          )}
          {showViewSwitcher && <ViewSwitcher value={view} onChange={setView} modes={["list", "table", "document"]} />}
        </div>
      )}

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
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>ความคืบหน้า (Progress List)</div>
            {canAdd && <button type="button" className="btn btn-primary sm" onClick={() => openAdd(null)} disabled={!!busyId}><Plus size={14} /> เพิ่มขั้นตอน</button>}
          </div>

          <div className="glass-panel" style={{ padding: "20px 22px", background: "var(--panel-2)", borderRadius: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, marginBottom: 14, flexWrap: "wrap" }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
                <span className="mono tabular-nums" style={{ fontSize: 36, fontWeight: 700, lineHeight: 1, color: "var(--accent)", letterSpacing: -1 }}>{progressPct}<span style={{ fontSize: 18 }}>%</span></span>
                <span style={{ fontSize: 13, color: "var(--text-2)", display: "inline-flex", alignItems: "center", gap: 6 }}><TrendingUp size={15} color="var(--accent)" /> เสร็จแล้ว {done} จาก {tasks.length} ขั้นตอน</span>
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                <span className="ui-badge" style={{ color: "var(--text-3)" }}><CircleDashed size={12} /> รอดำเนินการ {tasks.length - done - inProgress}</span>
                <span className="ui-badge" style={{ color: "var(--accent)" }}><Clock size={12} /> กำลังทำ {inProgress}</span>
                <span className="ui-badge" style={{ color: "var(--green)" }}><CheckCircle2 size={12} /> เสร็จสิ้น {done}</span>
                {overdue > 0 && <span className="ui-badge" style={{ color: "var(--red)" }}><AlertTriangle size={12} /> เลยกำหนด {overdue}</span>}
              </div>
            </div>
            <div className="progress" style={{ height: 8, marginBottom: milestones.length ? 16 : 0 }}><span className={done === tasks.length && tasks.length ? "done" : undefined} style={{ width: `${progressPct}%` }} /></div>
            {milestones.length > 0 && (
              <div style={{ paddingTop: 16, borderTop: "1px dashed var(--border)", overflowX: "auto", paddingBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: "max-content" }}>
                  {milestones.map((milestone, index) => {
                    const complete = milestone.status === "Completed";
                    const active = milestone.status === "In Progress";
                    const color = complete ? "var(--green)" : active ? "var(--accent)" : "var(--border-strong)";
                    return <FragmentGroup key={milestone.id}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, opacity: complete || active ? 1 : 0.62 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", background: complete || active ? color : "var(--bg)", border: `2px solid ${color}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {complete ? <Check size={14} strokeWidth={3} color="#fff" /> : active ? <Clock size={13} color="#fff" /> : <span style={{ fontSize: 10, color: "var(--text-3)" }}>{numberOf.get(milestone.id)}</span>}
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 600 }}>{milestone.name}</span>
                      </div>
                      {index < milestones.length - 1 && <div style={{ width: 30, height: 2, background: complete ? "var(--green)" : "var(--border)" }} />}
                    </FragmentGroup>;
                  })}
                </div>
              </div>
            )}
          </div>

          {!tasks.length && <div className="glass-panel" style={{ padding: 28, textAlign: "center", color: "var(--text-3)" }}>ยังไม่มีขั้นตอนในไทม์ไลน์นี้</div>}
          {groups.map((group, groupIndex) => {
            const phaseKey = `${group.phase}|${groupIndex}`;
            const collapsed = collapsedPhases.has(phaseKey);
            const phaseDone = group.tasks.filter((task) => task.status === "Completed").length;
            const phasePct = group.tasks.length ? Math.round((phaseDone / group.tasks.length) * 100) : 0;
            const phaseActive = group.tasks.some((task) => task.status === "In Progress");
            const phaseColor = PHASE_COLORS[groupIndex % PHASE_COLORS.length];
            return (
              <section key={phaseKey}>
                <button type="button" onClick={() => togglePhase(phaseKey)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 14px", marginBottom: collapsed ? 0 : 8, background: `color-mix(in srgb, ${phaseColor} 7%, var(--panel))`, border: "none", borderLeft: `3px solid ${phaseColor}`, borderRadius: 10, cursor: "pointer", textAlign: "left" }}>
                  {collapsed ? <ChevronRight size={14} color={phaseColor} /> : <ChevronDown size={14} color={phaseColor} />}
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700 }}>{groupIndex + 1}. {group.phase || "ไม่ระบุเฟส"}</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: phaseDone === group.tasks.length ? "var(--green)" : phaseActive ? "var(--accent)" : "var(--text-3)" }}>{phaseDone}/{group.tasks.length}</span>
                  {phaseDone === group.tasks.length ? <CheckCircle2 size={13} color="var(--green)" /> : <div style={{ width: 52, height: 4, background: "var(--border)", borderRadius: 2, overflow: "hidden" }}><div style={{ height: "100%", width: `${phasePct}%`, background: phaseActive ? "var(--accent)" : phaseColor }} /></div>}
                </button>
                {!collapsed && <div style={{ paddingLeft: 12 }}>
                  {group.tasks.map((task, taskIndex) => {
                    const complete = task.status === "Completed";
                    const active = task.status === "In Progress";
                    const role = ROLE_META[task.role] || { color: "var(--text-2)", bg: "var(--panel-2)" };
                    return (
                      <div key={task.id} style={{ display: "flex", alignItems: "stretch", opacity: busyId === task.id ? 0.5 : 1 }}>
                        <div style={{ width: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>{task.isMilestone && <Flag size={14} color="var(--amber)" strokeWidth={2.5} />}</div>
                        <div className="pm-task-card" style={{ position: "relative", flex: 1, marginBottom: 8, background: task.isMilestone ? "color-mix(in srgb, var(--amber) 8%, var(--panel))" : complete ? "color-mix(in srgb, var(--green) 5%, var(--panel))" : active ? "var(--panel-2)" : "var(--panel)", border: `1px solid ${complete ? "color-mix(in srgb, var(--green) 30%, transparent)" : active ? "var(--accent)" : task.isMilestone ? "color-mix(in srgb, var(--amber) 35%, transparent)" : "var(--border)"}`, boxShadow: active ? "0 6px 20px -8px color-mix(in srgb, var(--accent) 45%, transparent)" : "none", display: "flex", gap: 12, alignItems: "flex-start" }}>
                          {taskIndex < group.tasks.length - 1 && <div className="pm-task-connector" style={{ background: complete ? "var(--green)" : "var(--border)" }} />}
                          <button type="button" onClick={() => canEdit && task.status !== "Pending" && patch(task, { status: complete ? "In Progress" : "Completed" })} disabled={!canEdit || task.status === "Pending" || !!busyId} style={{ width: 28, height: 28, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: complete ? "var(--green)" : active ? "var(--accent)" : "var(--bg)", border: `2px solid ${complete ? "var(--green)" : active ? "var(--accent)" : "var(--border)"}`, color: "#fff", padding: 0, cursor: canEdit && task.status !== "Pending" ? "pointer" : "default", boxShadow: active ? "0 0 0 4px color-mix(in srgb, var(--accent) 18%, transparent)" : "none" }}>
                            {complete ? <Check size={16} strokeWidth={3} /> : active ? <Clock size={15} /> : <span style={{ fontSize: 10, color: "var(--text-3)", fontWeight: 700 }}>{numberOf.get(task.id)}</span>}
                          </button>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10, flexWrap: "wrap" }}>
                              <h4 style={{ margin: 0, fontSize: 15, color: complete ? "var(--green)" : "var(--text)", fontWeight: 600 }}>{numberOf.get(task.id)}. {task.name}</h4>
                              <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                                <span className="timeline-role-text" style={{ color: role.color }}>{task.role || "-"}</span>
                                {canEdit ? <StatusSelect value={task.status || "Pending"} disabled={!!busyId} onChange={(status) => patch(task, { status })} /> : <span className="ui-badge" style={{ color: STATUS_META[task.status]?.color }}>{STATUS_META[task.status]?.label || task.status}</span>}
                                {canEdit && <><button type="button" className="btn-icon" onClick={() => openEdit(task)} title="แก้ไข"><Pencil size={14} /></button><button type="button" className="btn-icon danger" onClick={() => removeTask(task)} title="ลบ"><Trash2 size={14} /></button></>}
                              </div>
                            </div>
                            <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--text-3)", marginTop: 8, flexWrap: "wrap" }}>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Clock size={14} /> {task.durationDays || 1} วันทำการ</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Calendar size={14} /> {fmtDate(task.startDate)} - {fmtDate(task.finishDate)}</span>
                              <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }} title={task.assignee || undefined}><User size={14} /> {task.assignee ? compactPersonName(task.assignee) : "ยังไม่ระบุผู้รับผิดชอบ"}</span>
                            </div>
                            {task.note && <div style={{ fontSize: 12, color: "var(--text-2)", marginTop: 8, background: "var(--panel-2)", padding: "6px 8px", borderRadius: 6 }}><strong style={{ color: "var(--text-3)" }}>หมายเหตุ:</strong> {task.note}</div>}
                          </div>
                          {active && canEdit && <button type="button" className="btn btn-primary sm" onClick={() => patch(task, { status: "Completed" })}>✔ ทำเสร็จแล้ว</button>}
                        </div>
                        {canReorder && <div style={{ width: 28, flexShrink: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}><button type="button" className="btn-icon" onClick={() => move(task, -1)} disabled={!!busyId} aria-label={`เลื่อน ${task.name} ขึ้น`}>▴</button><button type="button" className="btn-icon" onClick={() => move(task, 1)} disabled={!!busyId} aria-label={`เลื่อน ${task.name} ลง`}>▾</button></div>}
                      </div>
                    );
                  })}
                </div>}
              </section>
            );
          })}
        </div>
      )}

      {view === "table" && (
      <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>ตารางขั้นตอนงาน <span style={{ color: "var(--text-3)", fontWeight: 500 }}>({tableGroups.reduce((sum, group) => sum + group.tasks.length, 0)}{tableStatusFilter !== "all" ? ` / ${tasks.length}` : ""} ขั้นตอน)</span></div>
        <div className="toolbar">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Filter size={14} color="var(--text-3)" />
            <Select className="premium-select" value={tableStatusFilter} onChange={(event) => setTableStatusFilter(event.target.value)} aria-label="กรองสถานะไทม์ไลน์" style={{ minWidth: 148 }}>
              <option value="all">ทุกสถานะ</option><option value="pending">รอดำเนินการ</option><option value="progress">กำลังทำ</option><option value="completed">เสร็จแล้ว</option>
            </Select>
          </div>
          <SortControl
            value={tableSort}
            onChange={(event) => setTableSort(event.target.value)}
            options={[{ value: "step", label: "ลำดับขั้นตอน" }, { value: "due", label: "วันเสร็จ" }, { value: "status", label: "สถานะ" }, { value: "name", label: "ชื่อขั้นตอน" }]}
            title="เรียงลำดับไทม์ไลน์"
          />
        </div>
      </div>
      <div className="premium-glass-table table-responsive">
        <table className="premium-table timeline-task-table">
          <colgroup>
            <col style={{ width: 32 }} /><col style={{ width: 52 }} /><col className="timeline-col-task" />
            <col style={{ width: 68 }} /><col style={{ width: 150 }} /><col style={{ width: 156 }} />
            <col style={{ width: 124 }} /><col style={{ width: 124 }} /><col style={{ width: 58 }} />
            <col style={{ width: 120 }} />{canEdit && <col style={{ width: 120 }} />}
          </colgroup>
          <thead>
            <tr>
              <th className="timeline-move-head" aria-label="เลื่อนลำดับ"></th><th>#</th><th>ขั้นตอน</th><th>แผนก</th><th>ผู้รับผิดชอบ</th>
              <th>สถานะ</th><th>เริ่ม</th><th>เสร็จ</th><th className="num">วัน</th><th>ขึ้นกับ</th>
              {canEdit && <th>จัดการ</th>}
            </tr>
          </thead>
          <tbody>
            {tableGroups.map((g, gi) => (
              <FragmentGroup key={`${g.phase}|${gi}`}>
                <tr className="timeline-phase-row">
                  <td colSpan={canEdit ? 11 : 10} style={{ background: "var(--panel-2)", borderTop: "2px solid var(--border)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 700, fontSize: 13 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 3, background: PHASE_COLORS[gi % PHASE_COLORS.length] }} />
                      {gi + 1}. {g.phase || "ไม่ระบุเฟส"}
                      <span style={{ marginLeft: "auto", color: "var(--text-3)", fontWeight: 600, fontSize: 11 }}>{g.tasks.filter((t) => t.status === "Completed").length}/{g.tasks.length}</span>
                    </div>
                  </td>
                </tr>
                {g.tasks.map((t) => (
                  <tr key={t.id} className="premium-row" style={{ opacity: busyId === t.id ? 0.5 : 1 }}>
                    <td className="timeline-move-cell">
                      {canReorder && tableSort === "step" && (
                        <span style={{ display: "inline-flex", flexDirection: "column" }}>
                          <button type="button" className="btn-icon" style={{ height: 14, padding: 0 }} aria-label="เลื่อนขึ้น" onClick={() => move(t, -1)} disabled={!!busyId}>▴</button>
                          <button type="button" className="btn-icon" style={{ height: 14, padding: 0 }} aria-label="เลื่อนลง" onClick={() => move(t, 1)} disabled={!!busyId}>▾</button>
                        </span>
                      )}
                    </td>
                    <td className="mono timeline-order-cell">{numberOf.get(t.id)}</td>
                    <td style={{ fontWeight: 600 }} title={t.note ? `${t.name}\n${t.note}` : t.name}>
                      <span className="timeline-task-name">
                        {t.isMilestone && <Flag size={12} aria-hidden="true" style={{ color: "var(--amber)", flexShrink: 0 }} />}
                        <span>{t.name}</span>
                      </span>
                    </td>
                    <td><span className="timeline-role-text" style={{ color: ROLE_META[t.role]?.color || "var(--text-2)" }}>{t.role || "-"}</span></td>
                    <td>
                      {canEdit ? (
                        <Select className="premium-select" value={t.assigneeId || ""} disabled={!!busyId} style={{ width: 140, maxWidth: "100%", fontSize: 12 }}
                          aria-label={`ผู้รับผิดชอบ ${t.name}`}
                          onChange={(e) => {
                            const u = assigneeOptions.find((x) => x.id === e.target.value);
                            patch(t, { assigneeId: e.target.value || null, assignee: u?.name || null });
                          }}>
                          <option value="">{t.assignee ? compactPersonName(t.assignee) : "— ไม่ระบุ —"}</option>
                          {assigneeOptions.map((u) => <option key={u.id} value={u.id}>{compactPersonName(u.name)}</option>)}
                        </Select>
                      ) : <span title={t.assignee || undefined}>{t.assignee ? compactPersonName(t.assignee) : "-"}</span>}
                    </td>
                    <td>
                      {canEdit ? (
                        <StatusSelect value={t.status || "Pending"} disabled={!!busyId} aria-label={`สถานะ ${t.name}`} onChange={(status) => patch(t, { status })} />
                      ) : (
                        <span className="ui-badge" style={{ color: STATUS_META[t.status]?.color || "var(--text-3)" }}>
                          {STATUS_META[t.status]?.label || t.status || "-"}
                        </span>
                      )}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {canEdit ? (
                        <DateInput compact value={t.startDate || ""} onChange={(v) => patch(t, { startDate: v || null })} ariaLabel={`วันเริ่ม ${t.name}`} style={{ width: 116 }} />
                      ) : fmtDate(t.startDate)}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {canEdit ? (
                        <DateInput compact value={t.finishDate || ""} min={t.startDate || undefined} disabled={!t.startDate || !!busyId} onChange={(v) => patch(t, { finishDate: v || null })} ariaLabel={`วันจบ ${t.name}`} style={{ width: 116 }} />
                      ) : fmtDate(t.finishDate)}
                    </td>
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

      {dirtyCount > 0 && (
        <div className="timeline-save-bar form-action-bar page" role="status">
          <span className="timeline-save-message">มีการแก้ไข <b>{dirtyCount}</b> ขั้นตอน — ยังไม่บันทึก</span>
          <button type="button" className="btn" onClick={discardDrafts} disabled={saving}>ยกเลิกการแก้ไข</button>
          <button type="button" className="btn btn-primary" onClick={saveDrafts} disabled={saving}>{saving ? "กำลังบันทึก…" : "บันทึกการเปลี่ยนแปลง"}</button>
        </div>
      )}

      <Modal open={!!editTask} onClose={() => !saving && setEditTask(null)} title="แก้ไขขั้นตอน" size="sm">
        {editTask && taskForm(saveEdit, "เก็บการแก้ไข")}
      </Modal>
      <Modal open={addOpen} onClose={() => !saving && setAddOpen(false)} title={addAfterId ? "แทรกขั้นตอน" : "เพิ่มขั้นตอน"} size="sm">
        {addOpen && taskForm(saveAdd, "เพิ่มขั้นตอน")}
      </Modal>
    </>
  );
}

// React ต้องการ key บน fragment ใน list — ใช้ตัวห่อเปล่า
function FragmentGroup({ children }) {
  return <>{children}</>;
}
