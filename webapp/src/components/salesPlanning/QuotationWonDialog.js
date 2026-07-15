"use client";
import { useMemo, useRef, useState } from "react";
import { CheckCircle2, FileText, Paperclip, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import { fmtMoney } from "@/lib/format";
import { quotationWonAmount } from "@/lib/sales/quotationWonAmount";
import {
  WON_DOC_TYPES, isPaymentDocType, validateWonEvidence, MAX_WON_ATTACHMENTS,
} from "@/lib/sales/quotationWonEvidence";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_MB, UPLOAD_ACCEPT_ATTR } from "@/lib/master/attachmentTypes";

// ฟอร์มยืนยัน Won จากใบเสนอราคา (บังคับหลักฐาน — feedback ผู้ใช้ 2026-07-15):
// แนบไฟล์ สลิป/PO/เอกสารยืนยันการสั่งซื้อ ≥1 + วันที่เอกสาร; ถ้าไม่ใช่เอกสาร
// การชำระเงิน ต้องกรอกกำหนดชำระ. อัปไฟล์ผ่าน /api/upload (Drive/Supabase)
// แล้วส่ง ref ไปกับ POST /quotations/[id]/accept — ใช้ร่วมหน้า editor + หน้าดีล.
export default function QuotationWonDialog({ open, onClose, quote, customerId, customerName, onDone }) {
  const today = new Date().toISOString().slice(0, 10);
  const [docType, setDocType] = useState("payment_slip");
  const [docDate, setDocDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState([]); // File[] ที่เลือกไว้ (ยังไม่อัป)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const wonAmount = useMemo(() => quotationWonAmount(quote), [quote]);
  const needsDueDate = !isPaymentDocType(docType);

  const reset = () => {
    setDocType("payment_slip");
    setDocDate(today);
    setDueDate("");
    setFiles([]);
    setError("");
  };
  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const onPickFiles = (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // ให้เลือกไฟล์เดิมซ้ำได้
    setError("");
    const valid = [];
    for (const file of picked) {
      if (file.size > MAX_UPLOAD_BYTES) { setError(`ไฟล์ ${file.name} ใหญ่เกิน ${MAX_UPLOAD_MB} MB`); continue; }
      valid.push(file);
    }
    setFiles((prev) => [...prev, ...valid].slice(0, MAX_WON_ATTACHMENTS));
  };
  const removeFile = (idx) => setFiles((prev) => prev.filter((_, i) => i !== idx));

  const uploadOne = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    if (customerId) { fd.append("entityType", "customer"); fd.append("entityId", customerId); }
    if (customerName) fd.append("customerName", customerName);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(payload.error || `อัปโหลด ${file.name} ไม่สำเร็จ`);
    return { fileUrl: payload.url, driveFileId: payload.driveFileId || null, fileName: file.name, mimeType: file.type, sizeBytes: file.size };
  };

  const submit = async () => {
    // ตรวจฟอร์มก่อนอัปไฟล์ (ใช้ placeholder แทนไฟล์ที่จะอัป — กันอัปแล้วค่อยเจอ error ฟอร์ม)
    const preview = validateWonEvidence({
      docType, docDate, paymentDueDate: dueDate || null,
      attachments: files.map((f) => ({ fileUrl: "pending", fileName: f.name })),
    });
    if (!preview.ok) { setError(preview.error); return; }
    setBusy(true);
    setError("");
    try {
      const attachments = [];
      for (const f of files) attachments.push(await uploadOne(f));
      const res = await fetch(`/api/sales-planning/quotations/${quote.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, docDate, paymentDueDate: dueDate || null, attachments }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "ปิด Won ไม่สำเร็จ");
      reset();
      await onDone?.(data);
    } catch (e) {
      setError(e.message || "ปิด Won ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (!quote) return null;
  return (
    <Modal open={open} onClose={close} title={`ยืนยัน Won · ${quote.quoteNumber || "ใบเสนอราคา"}`} size="md">
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, color: "var(--text-2)", lineHeight: 1.6 }}>
          ยอดก่อน VAT <strong>{fmtMoney(wonAmount)}</strong> จะถูกบันทึกเป็นยอด Won (นับ AT ตามเดือนของวันที่เอกสาร)
          และใบเสนอราคาฉบับอื่นในดีลนี้จะถูก<strong>ปิดและล็อก</strong> แก้ไข/ลบไม่ได้
        </p>

        {error && (
          <div role="alert" style={{ padding: "10px 12px", border: "1px solid var(--red)", borderRadius: 10, color: "var(--red)", fontSize: 13 }}>{error}</div>
        )}

        <div className="form-grid">
          <label>ประเภทเอกสารหลักฐาน *
            <Select className="premium-select" value={docType} onChange={(e) => setDocType(e.target.value)} disabled={busy}>
              {WON_DOC_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </label>
          <label>วันที่เอกสาร *
            <DateInput value={docDate} onChange={setDocDate} disabled={busy} />
          </label>
          <label>กำหนดชำระ {needsDueDate ? "*" : "(ถ้ามี)"}
            <DateInput value={dueDate} min={docDate || undefined} onChange={setDueDate} disabled={busy} />
          </label>
        </div>
        {needsDueDate && (
          <p style={{ margin: 0, color: "var(--text-3)", fontSize: 12.5 }}>
            เอกสารนี้ไม่ใช่เอกสารการชำระเงิน — ต้องระบุกำหนดชำระ
          </p>
        )}

        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>ไฟล์หลักฐาน * (สลิป / PO / เอกสารยืนยันการสั่งซื้อ)</span>
            <div className="spacer" />
            <button type="button" className="btn ghost sm" onClick={() => fileInputRef.current?.click()} disabled={busy || files.length >= MAX_WON_ATTACHMENTS}>
              <Paperclip size={14} aria-hidden="true" /> แนบไฟล์
            </button>
            <input ref={fileInputRef} type="file" accept={UPLOAD_ACCEPT_ATTR} multiple onChange={onPickFiles} style={{ display: "none" }} />
          </div>
          {files.length ? (
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
              {files.map((f, i) => (
                <li key={`${f.name}-${i}`} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, border: "1px solid var(--border)", borderRadius: 10, padding: "6px 10px" }}>
                  <FileText size={14} aria-hidden="true" style={{ color: "var(--text-3)", flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                  <span style={{ color: "var(--text-3)", flexShrink: 0 }}>{(f.size / (1024 * 1024)).toFixed(2)} MB</span>
                  <div className="spacer" />
                  <button type="button" className="btn-icon danger" onClick={() => removeFile(i)} disabled={busy} aria-label={`ลบไฟล์ ${f.name}`}>
                    <Trash2 size={13} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ margin: 0, color: "var(--text-3)", fontSize: 12.5 }}>ยังไม่ได้แนบไฟล์ — ต้องแนบอย่างน้อย 1 ไฟล์</p>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <button type="button" className="btn ghost" onClick={close} disabled={busy}>ยกเลิก</button>
          <button type="button" className="btn btn-success" onClick={submit} disabled={busy}>
            <CheckCircle2 size={15} aria-hidden="true" /> {busy ? "กำลังบันทึก…" : "ยืนยัน Won"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
