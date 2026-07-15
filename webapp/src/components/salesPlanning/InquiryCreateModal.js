"use client";
// โมดัล "สอบถาม RD" — ฝ่ายขายส่งข้อสอบถามถึงฝ่ายเป้าหมาย (ใช้ทั้งหน้าดีลและหน้ารวม
// เรื่องสอบถาม). แนบไฟล์ผ่าน /api/upload ตอนกดส่ง (แพตเทิร์นเดียวกับ composer
// ความเคลื่อนไหวดีล) — มีปุ่มส่งชัดเจน ไม่มี auto-save.
import { useState } from "react";
import { Paperclip, Send, X } from "lucide-react";
import Modal from "@/components/Modal";
import { INQUIRY_SLA_BUSINESS_DAYS } from "@/lib/inquiries";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";

export default function InquiryCreateModal({ open, onClose, onCreated, deal = null }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [urgent, setUrgent] = useState(false);
  const [files, setFiles] = useState([]); // File[] ที่เลือกไว้ (อัปตอนส่ง)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = () => {
    setTitle(""); setBody(""); setUrgent(false); setFiles([]); setError("");
  };

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = "";
    const valid = [];
    for (const file of picked) {
      if (file.size > MAX_UPLOAD_BYTES) { setError(`ไฟล์ ${file.name} ใหญ่เกิน ${MAX_UPLOAD_MB} MB`); continue; }
      valid.push(file);
    }
    setFiles((prev) => [...prev, ...valid].slice(0, 8));
  };

  const uploadOne = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    if (deal?.customerId) { fd.append("entityType", "customer"); fd.append("entityId", deal.customerId); }
    if (deal?.customerName) fd.append("customerName", deal.customerName);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `อัปโหลด ${file.name} ไม่สำเร็จ`);
    return { fileUrl: payload.url, driveFileId: payload.driveFileId || null, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
  };

  const submit = async () => {
    if (!title.trim() || (!body.trim() && !files.length)) return;
    setBusy(true);
    setError("");
    try {
      const attachments = [];
      for (const f of files) attachments.push(await uploadOne(f));
      const res = await fetch("/api/sales-planning/inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim(),
          urgent,
          dealId: deal?.id || null,
          attachments,
        }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "ส่งข้อสอบถามไม่สำเร็จ");
      reset();
      onCreated?.(payload);
    } catch (e) {
      setError(e.message || "ส่งข้อสอบถามไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose?.()} title="สอบถามฝ่าย RD" size="sm">
      <div style={{ padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {error && (
          <div role="alert" style={{ color: "var(--red)", fontSize: 13 }}>{error}</div>
        )}
        {deal && (
          <div style={{ fontSize: 13, color: "var(--text-3)" }}>
            ในนามดีล <strong>{deal.code ? `${deal.code} · ` : ""}{deal.title || "-"}</strong>
            {deal.customerName ? ` — ${deal.customerName}` : ""} (RD เปิดดูรายละเอียดดีลเองได้)
          </div>
        )}
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          หัวเรื่อง
          <input className="premium-input" value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="เช่น กลิ่นลาเวนเดอร์ปรับให้ติดทนขึ้นได้ไหม" maxLength={200} />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13 }}>
          รายละเอียดคำถาม
          <textarea className="premium-input" rows={4} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder="อธิบายสิ่งที่อยากรู้ / สเปกที่ลูกค้าขอ..." style={{ resize: "vertical" }} />
        </label>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> เร่งด่วน
        </label>
        {!!files.length && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {files.map((f, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5 }}>
                <Paperclip size={13} aria-hidden="true" style={{ color: "var(--text-3)" }} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <button type="button" className="btn-icon danger" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))} aria-label="เอาไฟล์ออก">
                  <X size={13} aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        )}
        <div style={{ fontSize: 12, color: "var(--text-3)" }}>
          กำหนดตอบมาตรฐาน: ภายใน {INQUIRY_SLA_BUSINESS_DAYS} วันทำการ — มีคำตอบแล้วระบบแจ้งเตือนกลับ
        </div>
        <div className="form-action-inline">
          <label className="btn ghost sm" style={{ cursor: "pointer" }} title="แนบไฟล์ (PDF/รูป/เอกสาร)">
            <Paperclip size={13} aria-hidden="true" /> แนบไฟล์
            <input type="file" accept={UPLOAD_ACCEPT_ATTR} multiple onChange={onPickFiles} style={{ display: "none" }} />
          </label>
          <button type="button" className="btn ghost sm" onClick={() => { reset(); onClose?.(); }} disabled={busy}>ยกเลิก</button>
          <button type="button" className="btn btn-primary sm" onClick={submit} disabled={busy || !title.trim() || (!body.trim() && !files.length)}>
            <Send size={13} aria-hidden="true" /> {busy ? "กำลังส่ง..." : "ส่งคำถาม"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
