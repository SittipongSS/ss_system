"use client";
import Select from "@/components/ui/Select";
import { useState, useEffect } from "react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_PRIORITIES, TASK_PRIORITY_LABELS } from "@/lib/mgmt/constants";

// สร้าง/แก้ไขงาน. task=null → สร้างใหม่. onSaved(row) เรียกหลังบันทึกสำเร็จ.
export default function TaskFormModal({ open, onClose, onSaved, task, departments = [], users = [] }) {
  const editing = !!task;
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      title: task?.title || "",
      deptCode: task?.deptCode || "",
      assigneeId: task?.assigneeId || "",
      assigneeName: task?.assigneeName || "",
      startDate: task?.startDate || "",
      dueDate: task?.dueDate || "",
      status: task?.status || "todo",
      priority: task?.priority || "normal",
      notes: task?.notes || "",
    });
  }, [open, task]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const onPickAssignee = (id) => {
    const u = users.find((x) => x.id === id);
    setForm((f) => ({ ...f, assigneeId: id, assigneeName: u?.name || "" }));
  };

  const submit = async () => {
    if (!form.title.trim()) { alert("กรุณาระบุชื่อรายการงาน"); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        deptCode: form.deptCode || null,
        assigneeId: form.assigneeId || null,
        assigneeName: form.assigneeName || null,
        startDate: form.startDate || null,
        dueDate: form.dueDate || null,
        status: form.status,
        priority: form.priority,
        notes: form.notes || null,
      };
      const res = await fetch(editing ? `/api/mgmt/tasks/${task.id}` : "/api/mgmt/tasks", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { alert((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ"); return; }
      onSaved?.(await res.json());
      onClose?.();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "แก้ไขงาน" : "เพิ่มงาน"} size="md">
      <div className="drawer-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>รายการงาน <span style={{ color: "var(--red)" }}>*</span></label>
          <input className="premium-input w-full" value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="เช่น สรุปเอกสารบริษัท" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>แผนก</label>
            <Select className="premium-input w-full" value={form.deptCode || ""} onChange={(e) => set("deptCode", e.target.value)}>
              <option value="">—</option>
              {departments.map((d) => <option key={d.code} value={d.code}>{d.label}</option>)}
            </Select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>ผู้รับผิดชอบ</label>
            <Select className="premium-input w-full" value={form.assigneeId || ""} onChange={(e) => onPickAssignee(e.target.value)}>
              <option value="">—</option>
              {users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </Select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>วันเริ่ม</label>
            <DateInput className="w-full" value={form.startDate || ""} onChange={(value) => set("startDate", value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>วันสิ้นสุด</label>
            <DateInput className="w-full" value={form.dueDate || ""} onChange={(value) => set("dueDate", value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>สถานะ</label>
            <Select className="premium-input w-full" value={form.status || "todo"} onChange={(e) => set("status", e.target.value)}>
              {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABELS[s]}</option>)}
            </Select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>ลำดับความสำคัญ</label>
            <Select className="premium-input w-full" value={form.priority || "normal"} onChange={(e) => set("priority", e.target.value)}>
              {TASK_PRIORITIES.map((p) => <option key={p} value={p}>{TASK_PRIORITY_LABELS[p]}</option>)}
            </Select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>หมายเหตุ</label>
          <textarea className="premium-input w-full" rows={3} value={form.notes || ""} onChange={(e) => set("notes", e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end gap-2 mt-6 pt-5 border-t border-[var(--border)]">
        <button className="btn" onClick={onClose} disabled={saving}>ยกเลิก</button>
        <button className="btn btn-primary px-6" onClick={submit} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
      </div>
    </Modal>
  );
}
