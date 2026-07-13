"use client";
import Select from "@/components/ui/Select";
import { useState, useEffect } from "react";
import Modal from "@/components/Modal";
import DateInput from "@/components/ui/DateInput";
import { MEETING_FOLLOWUPS, MEETING_FOLLOWUP_LABELS } from "@/lib/mgmt/constants";

export default function MeetingFormModal({ open, onClose, onSaved, meeting, departments = [], users = [] }) {
  const editing = !!meeting;
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      title: meeting?.title || "",
      meetingDate: meeting?.meetingDate || "",
      timeText: meeting?.timeText || "",
      deptCode: meeting?.deptCode || "",
      assigneeId: meeting?.assigneeId || "",
      assigneeName: meeting?.assigneeName || "",
      followUp: meeting?.followUp || "none",
      summary: meeting?.summary || "",
    });
  }, [open, meeting]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const onPickAssignee = (id) => {
    const u = users.find((x) => x.id === id);
    setForm((f) => ({ ...f, assigneeId: id, assigneeName: u?.name || "" }));
  };

  const submit = async () => {
    if (!form.title.trim()) { alert("กรุณาระบุหัวข้อการประชุม"); return; }
    if (!form.meetingDate) { alert("กรุณาระบุวันที่ประชุม"); return; }
    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        meetingDate: form.meetingDate,
        timeText: form.timeText || null,
        deptCode: form.deptCode || null,
        assigneeId: form.assigneeId || null,
        assigneeName: form.assigneeName || null,
        followUp: form.followUp,
        summary: form.summary || null,
      };
      const res = await fetch(editing ? `/api/mgmt/meetings/${meeting.id}` : "/api/mgmt/meetings", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) { alert((await res.json().catch(() => ({}))).error || "บันทึกไม่สำเร็จ"); return; }
      onSaved?.(await res.json());
      onClose?.();
    } finally { setSaving(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={editing ? "แก้ไขการประชุม" : "เพิ่มการประชุม"} size="md">
      <div className="drawer-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="form-group" style={{ margin: 0 }}>
          <label>หัวข้อ <span style={{ color: "var(--red)" }}>*</span></label>
          <input className="premium-input w-full" value={form.title || ""} onChange={(e) => set("title", e.target.value)} placeholder="เช่น ประชุม Team Lead Weekly" />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label>วันที่ <span style={{ color: "var(--red)" }}>*</span></label>
            <DateInput className="w-full" value={form.meetingDate || ""} onChange={(value) => set("meetingDate", value)} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label>เวลา</label>
            <input className="premium-input w-full" value={form.timeText || ""} onChange={(e) => set("timeText", e.target.value)} placeholder="เช่น 9.30–11.00" />
          </div>
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
            <label>ติดตามผล</label>
            <Select className="premium-input w-full" value={form.followUp || "none"} onChange={(e) => set("followUp", e.target.value)}>
              {MEETING_FOLLOWUPS.map((f) => <option key={f} value={f}>{MEETING_FOLLOWUP_LABELS[f]}</option>)}
            </Select>
          </div>
        </div>
        <div className="form-group" style={{ margin: 0 }}>
          <label>สรุปการประชุม</label>
          <textarea className="premium-input w-full" rows={4} value={form.summary || ""} onChange={(e) => set("summary", e.target.value)} />
        </div>
      </div>
      <div className="form-action-bar">
        <button className="btn" onClick={onClose} disabled={saving}>ยกเลิก</button>
        <button className="btn btn-primary px-6" onClick={submit} disabled={saving}>{saving ? "กำลังบันทึก..." : "บันทึก"}</button>
      </div>
    </Modal>
  );
}
