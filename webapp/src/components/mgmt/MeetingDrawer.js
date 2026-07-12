"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/Modal";
import DocsPanel from "@/components/mgmt/DocsPanel";
import { Pencil, Trash2, Send, ListPlus } from "lucide-react";
import { MEETING_FOLLOWUP_LABELS } from "@/lib/mgmt/constants";
import { fmtDate as formatDate, fmtDateTime } from "@/lib/format";

const fmtDate = (d) => formatDate(d);

export default function MeetingDrawer({ open, onClose, meeting, canEdit, onEdit, onChanged, onDeleted, onTaskCreated }) {
  const [updates, setUpdates] = useState([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const loadUpdates = useCallback(async () => {
    if (!meeting?.id) return;
    try {
      const res = await fetch(`/api/mgmt/updates?entityType=meeting&entityId=${encodeURIComponent(meeting.id)}`);
      if (res.ok) setUpdates(await res.json());
    } catch { /* ignore */ }
  }, [meeting?.id]);
  useEffect(() => { if (open) loadUpdates(); }, [open, loadUpdates]);

  const addComment = async () => {
    const text = comment.trim();
    if (!text) return;
    setBusy(true);
    try {
      const res = await fetch("/api/mgmt/updates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "meeting", entityId: meeting.id, body: text }),
      });
      if (res.ok) { setComment(""); loadUpdates(); }
    } finally { setBusy(false); }
  };

  // "ติดตามต่อ" → สร้างงานใน รายการงาน (prefill จากการประชุม).
  const createFollowUpTask = async () => {
    if (!confirm(`สร้างงานติดตามจากการประชุม "${meeting.title}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/mgmt/tasks", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `ติดตามจากประชุม: ${meeting.title}`,
          deptCode: meeting.deptCode || null,
          assigneeId: meeting.assigneeId || null,
          assigneeName: meeting.assigneeName || null,
          notes: `สร้างจากการประชุม ${meeting.id}${meeting.summary ? `\n\nสรุป: ${meeting.summary}` : ""}`,
        }),
      });
      if (!res.ok) { alert((await res.json().catch(() => ({}))).error || "สร้างงานไม่สำเร็จ"); return; }
      const task = await res.json();
      // บันทึกลง feed ของการประชุม + ตั้ง followUp='follow' ถ้ายังไม่ใช่
      await fetch("/api/mgmt/updates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "meeting", entityId: meeting.id, body: `สร้างงานติดตาม: ${task.title}` }),
      });
      if (meeting.followUp !== "follow") {
        const up = await fetch(`/api/mgmt/meetings/${meeting.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ followUp: "follow" }),
        });
        if (up.ok) onChanged?.(await up.json());
      }
      loadUpdates();
      onTaskCreated?.(task);
      alert("สร้างงานติดตามแล้ว — ดูได้ที่หน้ารายการงาน");
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm("ย้ายการประชุมนี้ลงถังขยะ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mgmt/meetings/${meeting.id}`, { method: "DELETE" });
      if (res.ok) { onDeleted?.(meeting.id); onClose?.(); }
      else alert((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  if (!meeting) return null;

  return (
    <Modal open={open} onClose={onClose} title={meeting.title} size="lg">
      <div className="drawer-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {meeting.deptCode && <span className="pill">{meeting.deptCode}</span>}
          <span className={`pill ${meeting.followUp === "follow" ? "ok" : ""}`}>{MEETING_FOLLOWUP_LABELS[meeting.followUp] || meeting.followUp}</span>
          {canEdit && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="btn" onClick={createFollowUpTask} disabled={busy} title="สร้างงานติดตามใน รายการงาน"><ListPlus size={14} /> สร้างงานติดตาม</button>
              <button className="btn" onClick={() => onEdit?.(meeting)} disabled={busy}><Pencil size={14} /> แก้ไข</button>
              <button className="btn" style={{ color: "var(--red)" }} onClick={remove} disabled={busy}><Trash2 size={14} /></button>
            </div>
          )}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div><div style={{ color: "var(--text-3)", fontSize: 12 }}>วันที่</div>{fmtDate(meeting.meetingDate)}</div>
          <div><div style={{ color: "var(--text-3)", fontSize: 12 }}>เวลา</div>{meeting.timeText || "—"}</div>
          <div><div style={{ color: "var(--text-3)", fontSize: 12 }}>แผนก</div>{meeting.deptCode || "—"}</div>
          <div><div style={{ color: "var(--text-3)", fontSize: 12 }}>ผู้รับผิดชอบ</div>{meeting.assigneeName || "—"}</div>
        </div>
        {meeting.summary && (
          <div style={{ fontSize: 13 }}>
            <div style={{ color: "var(--text-3)", fontSize: 12, marginBottom: 4 }}>สรุปการประชุม</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{meeting.summary}</div>
          </div>
        )}

        <DocsPanel entityType="mgmt_meeting" entityId={meeting.id} canEdit={canEdit} />

        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>ประวัติ &amp; อัพเดท</div>
          {canEdit && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input className="premium-input" style={{ flex: 1 }} value={comment} placeholder="เพิ่มบันทึก/คอมเมนต์..." onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addComment(); }} />
              <button className="btn btn-primary" onClick={addComment} disabled={busy || !comment.trim()}><Send size={14} /></button>
            </div>
          )}
          {updates.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--text-3)" }}>ยังไม่มีอัพเดท</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {updates.map((u) => (
                <div key={u.id} style={{ fontSize: 12.5, borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
                  <div style={{ color: "var(--text-2)" }}>{u.body}</div>
                  <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 2 }}>{u.authorName || "ระบบ"} · {u.createdAt ? fmtDateTime(u.createdAt) : ""}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
