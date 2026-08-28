"use client";
import { confirmAction } from "@/components/ui/ConfirmDialog";
import { notifyToast } from "@/components/ui/Toast";
import { useState, useEffect, useCallback } from "react";
import Modal from "@/components/Modal";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import ReadableText from "@/components/ui/ReadableText";
import { Pencil, Trash2, Send } from "lucide-react";
import { TASK_STATUSES, TASK_STATUS_LABELS, TASK_PRIORITY_LABELS } from "@/lib/mgmt/constants";
import { fmtDate as formatDate, fmtDateTime, naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";

const fmtDate = (d) => formatDate(d);

// รายละเอียดงาน + เปลี่ยนสถานะเร็ว + ไฟล์แนบ + สายอัพเดท (ประวัติ/คอมเมนต์).
export default function TaskDrawer({ open, onClose, task, canEdit, onEdit, onChanged, onDeleted }) {
  const [updates, setUpdates] = useState([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  const loadUpdates = useCallback(async () => {
    if (!task?.id) return;
    try {
      const res = await apiFetch(`/api/mgmt/updates?entityType=task&entityId=${encodeURIComponent(task.id)}`);
      if (res.ok) setUpdates(await res.json());
    } catch { /* ignore */ }
  }, [task?.id]);

  useEffect(() => { if (open) loadUpdates(); }, [open, loadUpdates]);

  // แนบเอกสารแล้วเธรดต้องขยับทันที — server เขียนบรรทัด "แนบเอกสาร: …" ให้ทุกครั้ง
  // ⚠️ ข้ามครั้งแรก: AttachmentsPanel แจ้งรายการตอน mount ด้วย ไม่งั้นดึงซ้ำเปล่า ๆ
  // ทุกครั้งที่เปิด drawer
  const [docsSeeded, setDocsSeeded] = useState(false);
  const onDocsChange = useCallback(() => {
    if (!docsSeeded) { setDocsSeeded(true); return; }
    loadUpdates();
  }, [docsSeeded, loadUpdates]);

  const changeStatus = async (status) => {
    if (!task || status === task.status) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mgmt/tasks/${task.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) { onChanged?.(await res.json()); loadUpdates(); }
      else notifyToast.error((await res.json().catch(() => ({}))).error || "เปลี่ยนสถานะไม่สำเร็จ");
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
    if (!(await confirmAction("ย้ายงานนี้ลงถังขยะ?"))) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/mgmt/tasks/${task.id}`, { method: "DELETE" });
      if (res.ok) { onDeleted?.(task.id); onClose?.(); }
      else notifyToast.error((await res.json().catch(() => ({}))).error || "ลบไม่สำเร็จ");
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
          <label style={{ fontSize: "var(--fs-5)", color: "var(--text-3)", display: "block", marginBottom: 6 }}>สถานะ</label>
          <div className="segmented">
            {TASK_STATUSES.map((s) => (
              <button key={s} className={task.status === s ? "active" : ""} disabled={!canEdit || busy} onClick={() => changeStatus(s)}>
                {TASK_STATUS_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        {/* fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: "var(--fs-7)" }}>
          <div><div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>ผู้รับผิดชอบ</div>{naText(task.assigneeName)}</div>
          <div><div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>แผนก</div>{naText(task.deptCode)}</div>
          <div><div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>วันเริ่ม</div>{fmtDate(task.startDate)}</div>
          <div><div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)" }}>วันสิ้นสุด</div>{fmtDate(task.dueDate)}</div>
        </div>
        {task.notes && (
          <div style={{ fontSize: "var(--fs-7)" }}>
            <div style={{ color: "var(--text-3)", fontSize: "var(--fs-5)", marginBottom: 4 }}>หมายเหตุ</div>
            <ReadableText text={task.notes} lines={5} />
          </div>
        )}

        {/* ไฟล์แนบ + เอกสารร่วม (Google Doc/Sheet) — แผงเดียวกับทั้งระบบ
            ⚠️ เดิมเป็น `DocsPanel` ของโมดูลนี้เอง ซึ่งทำเรื่องเดียวกันคนละชุด
            (ยุบทิ้งแล้ว · ดูกฎ "ปุ่มแก้ไขต้องเปิดฟอร์มตัวเดียวกับตอนสร้าง" ใน AGENTS.md) */}
        <div className="toolbar-label">ไฟล์ &amp; เอกสาร</div>
        <AttachmentsPanel
          entityType="mgmt_task"
          entityId={task.id}
          canEdit={canEdit}
          inlineUpload
          googleDocs
          onItemsChange={onDocsChange}
        />

        {/* updates feed */}
        <div>
          <div style={{ fontSize: "var(--fs-7)", fontWeight: "var(--fw-semibold)", marginBottom: 8 }}>ประวัติ &amp; อัพเดท</div>
          {canEdit && (
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <input className="premium-input" style={{ flex: 1 }} value={comment} placeholder="เพิ่มบันทึก/คอมเมนต์..." onChange={(e) => setComment(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addComment(); }} />
              <button className="btn btn-primary" onClick={addComment} disabled={busy || !comment.trim()}><Send size={14} /></button>
            </div>
          )}
          {updates.length === 0 ? (
            <div style={{ fontSize: "var(--fs-5)", color: "var(--text-3)" }}>ยังไม่มีอัพเดท</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {updates.map((u) => (
                <div key={u.id} style={{ fontSize: "var(--fs-6)", borderLeft: "2px solid var(--border)", paddingLeft: 10 }}>
                  <ReadableText text={u.body} lines={4} style={{ color: "var(--text-2)" }} />
                  <div style={{ color: "var(--text-3)", fontSize: "var(--fs-3)", marginTop: 2 }}>
                    {u.authorName || "ระบบ"} · {u.createdAt ? fmtDateTime(u.createdAt) : ""}
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
