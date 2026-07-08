"use client";
import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/Modal";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { Pencil, Trash2, Send } from "lucide-react";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from "@/lib/mgmt/constants";

const DOC_TYPES = [{ key: "other", label: "ไฟล์แนบ" }];
const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  return isNaN(dt.getTime()) ? d : dt.toLocaleDateString("th-TH");
};

// รายละเอียดงาน + เปลี่ยนสถานะเร็ว + ไฟล์แนบ + สายอัพเดท (ประวัติ/คอมเมนต์).
export default function TaskDrawer({ open, onClose, task, canEdit, onEdit, onChanged, onDeleted }) {
  const [updates, setUpdates] = useState([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const loadUpdates = useCallback(async () => {
    if (!task?.id) return;
    try {
      const res = await fetch(`/api/mgmt/updates?entityType=task&entityId=${encodeURIComponent(task.id)}`);
      if (res.ok) setUpdates(await res.json());
    } catch { /* ignore */ }
  }, [task?.id]);

  useEffect(() => { if (open) loadUpdates(); }, [open, loadUpdates]);

  const changeStatus = async (status) => {
    if (!task || status === task.status) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mgmt/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) { onChanged?.(await res.json()); loadUpdates(); }
      else alert((await res.json().catch(() => ({}))).error || "เปลี่ยนสถานะไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  const addComment = async () => {
    const text = comment.trim();
    if (!text) return;
    setBusy(true);
    try {
      const res = await fetch("/api/mgmt/updates", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entityType: "task", entityId: task.id, body: text }),
      });
      if (res.ok) { setComment(""); loadUpdates(); }
    } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!confirm("ย้ายงานนี้ลงถังขยะ?")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mgmt/tasks/${task.id}`, { method: "DELETE" });
      if (res.ok) { onDeleted?.(task.id); onClose?.(); }
      else alert((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
    } finally { setBusy(false); }
  };

  if (!task) return null;

  return (
    <Modal open={open} onClose={onClose} title={task.title} size="lg">
      <div className="drawer-body" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* meta badges + actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {task.deptCode && <span className="pill">{task.deptCode}</span>}
          <span className={`pill ${task.priority === "urgent" ? "danger" : ""}`}>{TASK_PRIORITY_LABELS[task.priority] || task.priority}</span>
          {canEdit && (
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              <button className="btn" onClick={() => onEdit?.(task)} disabled={busy}><Pencil size={14} /> แก้ไข</button>
              <button className="btn" style={{ color: "var(--red)" }} onClick={remove} disabled={busy}><Trash2 size={14} /> ลบ</button>
            </div>
          )}
        </div>

        {/* quick status */}
        <div>
          <label style={{ fontSize: 12, color: "var(--text-3)", display: "block", marginBottom: 6 }}>สถานะ</label>
          <div className="segmented">
            {TASK_STATUSES.map((s) => (
              <button key={s} className={task.status === s ? "active" : ""} disabled={!canEdit || busy} onClick={() => changeStatus(s)}>
                {TASK_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 13 }}>
          <div><div style={{ color: "var(--text-3)", fontSize: 12 }}>ผู้รับผิดชอบ</div>{task.assigneeName || "—"}</div>
          <div><div style={{ color: "var(--text-3)", fontSize: 12 }}>แผนก</div>{task.deptCode || "—"}</div>
          <div><div style={{ color: "var(--text-3)", fontSize: 12 }}>วันเริ่ม</div>{fmtDate(task.startDate)}</div>
          <div><div style={{ color: "var(--text-3)", fontSize: 12 }}>วันสิ้นสุด</div>{fmtDate(task.dueDate)}</div>
        </div>
        {task.notes && (
          <div style={{ fontSize: 13 }}>
            <div style={{ color: "var(--text-3)", fontSize: 12, marginBottom: 4 }}>หมายเหตุ</div>
            <div style={{ whiteSpace: "pre-wrap" }}>{task.notes}</div>
          </div>
        )}

        {/* attachments (upload PDF → Google Drive) */}
        <AttachmentsPanel
          entityType="mgmt_task"
          entityId={task.id}
          canEdit={canEdit}
          title="ไฟล์แนบ"
          note="อัปไฟล์ PDF ขึ้น Google Drive (โฟลเดอร์งานบริหาร)"
          docTypes={DOC_TYPES}
          cardColumns={1}
        />

        {/* updates feed */}
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
                  <div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 2 }}>
                    {u.authorName || "ระบบ"} · {u.createdAt ? new Date(u.createdAt).toLocaleString("th-TH") : ""}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
