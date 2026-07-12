"use client";

// ตารางไทม์ไลน์ของดีล — ความสามารถเทียบตารางโครงการ (มติผู้ใช้: "แก้ที่ดีลซิงก์โครงการ
// แก้ที่โครงการซิงก์ดีล") ซึ่งได้ฟรีเพราะเป็น project_tasks แถวเดียวกัน: ดีลเห็นเฉพาะ
// segment ของตัวเอง / โครงการเห็นรวมทุกดีล. ใช้ API ชุดเดียวกับหน้าโครงการทั้งหมด
// (PATCH/POST/DELETE /api/pm/project-tasks) — สิทธิ์+คำนวณวัน+สถานะอัตโนมัติฝั่ง server.
// แก้ dependency (ขึ้นกับ) ยังทำที่หน้าโครงการ (แสดงเป็นชิปอย่างเดียวที่นี่).
import { useEffect, useMemo, useState } from "react";
import { Flag, Pencil, Plus, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import { fmtDate } from "@/lib/format";

const STATUS_META = {
  Pending: { label: "รอดำเนินการ", color: "var(--text-3)" },
  "In Progress": { label: "กำลังทำ", color: "var(--accent)" },
  Completed: { label: "เสร็จแล้ว", color: "var(--green)" },
};
const ROLES = ["SA", "RD", "PC", "PD", "QC", "LG", "WH", "ALL"];

const emptyForm = { name: "", role: "SA", phase: "", durationDays: 1, isMilestone: false, note: "" };

export default function DealTimelineTable({ tasks, canEdit, dealId, projectId, onChanged, onError }) {
  const [busyId, setBusyId] = useState("");
  const [users, setUsers] = useState([]);
  const [editTask, setEditTask] = useState(null); // task ที่เปิดแก้ในโมดัล
  const [form, setForm] = useState(emptyForm);
  const [addAfterId, setAddAfterId] = useState(null); // แทรกหลังแถวนี้ (null = ต่อท้าย)
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

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
  const removeTask = (t) => {
    if (!window.confirm(`ลบขั้นตอน "${t.name}"?`)) return;
    return call(t.id, `/api/pm/project-tasks/${t.id}`, { method: "DELETE" });
  };

  const openEdit = (t) => {
    setEditTask(t);
    setForm({ name: t.name || "", role: t.role || "SA", phase: t.phase || "", durationDays: t.durationDays ?? 1, isMilestone: !!t.isMilestone, note: t.note || "" });
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
    setForm({ ...emptyForm, phase: after?.phase || phases[phases.length - 1] || "" });
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
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, padding: "0 18px 16px" }}>
        <button type="button" className="btn ghost" onClick={() => { setEditTask(null); setAddOpen(false); }} disabled={saving}>ยกเลิก</button>
        <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? "กำลังบันทึก…" : submitLabel}</button>
      </div>
    </form>
  );

  return (
    <>
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
            {groups.map((g, gi) => (
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
                      {canEdit && (
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
      {canEdit && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className="btn ghost" onClick={() => openAdd(null)} disabled={!!busyId}>
            <Plus size={14} aria-hidden="true" /> เพิ่มขั้นตอน
          </button>
        </div>
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
