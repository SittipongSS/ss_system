"use client";
import { useMemo, useState } from "react";
import { CheckCircle2 } from "lucide-react";
import Modal from "@/components/Modal";
import PendingFiles from "@/components/ui/PendingFiles";
import Select from "@/components/ui/Select";
import DateInput from "@/components/ui/DateInput";
import { fmtMoney } from "@/lib/format";
import { quotationWonAmount } from "@/lib/sales/quotationWonAmount";
import {
  WON_DOC_TYPES, isPaymentDocType, validateWonEvidence, MAX_WON_ATTACHMENTS,
} from "@/lib/sales/quotationWonEvidence";
import { describeResponseError } from "@/lib/fetchError";
import { businessDate } from "@/lib/businessDate";

// ฟอร์มยืนยัน Won จากใบเสนอราคา (บังคับหลักฐาน — feedback ผู้ใช้ 2026-07-15):
// แนบไฟล์ สลิป/PO/เอกสารยืนยันการสั่งซื้อ ≥1 + วันที่เอกสาร; ถ้าไม่ใช่เอกสาร
// การชำระเงิน ต้องกรอกกำหนดชำระ. อัปไฟล์ผ่าน /api/upload ไป private Supabase bucket
// แล้วส่ง ref ไปกับ POST /quotations/[id]/accept — ใช้ร่วมหน้า editor + หน้าดีล.
export default function QuotationWonDialog({ open, onClose, quote, customerName, onDone }) {
  const today = businessDate();
  const [docType, setDocType] = useState("payment_slip");
  const [docDate, setDocDate] = useState(today);
  const [dueDate, setDueDate] = useState("");
  const [files, setFiles] = useState([]); // File[] ที่เลือกไว้ (ยังไม่อัป)
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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

  const uploadOne = async (file) => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("entityType", "quotation_won_evidence");
    fd.append("entityId", quote.id);
    if (customerName) fd.append("customerName", customerName);
    const res = await fetch("/api/upload", { method: "POST", body: fd });
    // ต้องเช็ก ok ก่อนอ่าน body: คำขอที่ตายก่อนถึง handler ตอบเป็น HTML ไม่ใช่ JSON
    if (!res.ok) throw new Error(await describeResponseError(res, `อัปโหลด ${file.name} ไม่สำเร็จ`));
    const payload = await res.json();
    return {
      fileUrl: payload.url || null,
      driveFileId: payload.driveFileId || null,
      storageBucket: payload.storageBucket || null,
      storagePath: payload.storagePath || null,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    };
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
    const attachments = [];
    try {
      for (const f of files) attachments.push(await uploadOne(f));
      const res = await fetch(`/api/sales-planning/quotations/${quote.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docType, docDate, paymentDueDate: dueDate || null, attachments }),
      });
      if (!res.ok) throw new Error(await describeResponseError(res, "ปิด Won ไม่สำเร็จ"));
      const data = await res.json();
      reset();
      await onDone?.(data);
    } catch (e) {
      await Promise.allSettled(attachments.map((att) => fetch("/api/upload", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...att,
          entityType: "quotation_won_evidence",
          entityId: quote.id,
        }),
      })));
      setError(e.message || "ปิด Won ไม่สำเร็จ");
    } finally {
      setBusy(false);
    }
  };

  if (!quote) return null;
  return (
    <Modal open={open} onClose={close} title={`ยืนยัน Won · ${quote.quoteNumber || "ใบเสนอราคา"}`} size="md">
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
        <p style={{ margin: 0, color: "var(--text-2)", lineHeight: "var(--lh-relaxed)" }}>
          ยอดก่อน VAT <strong>{fmtMoney(wonAmount)}</strong> จะถูกบันทึกเป็นยอด Won (นับ AT ตามเดือนของวันที่เอกสาร)
          และใบเสนอราคาฉบับอื่นในดีลนี้จะถูก<strong>ปิดและล็อก</strong> แก้ไข/ลบไม่ได้
          {/* ใบ 0 บาทปิด Won ได้ (มติ 2026-08-03) — ทวนให้เห็นก่อนกด เพราะยอดนี้ทับมูลค่าดีล */}
          {wonAmount === 0 && <> · ใบนี้ยอดเป็น <strong>0 บาท</strong> ดีลจะมีมูลค่าปิดเป็น 0</>}
        </p>

        {error && (
          <div role="alert" style={{ padding: "10px 12px", border: "1px solid var(--red)", borderRadius: 10, color: "var(--red)", fontSize: "var(--fs-7)" }}>{error}</div>
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
          <p style={{ margin: 0, color: "var(--text-3)", fontSize: "var(--fs-6)" }}>
            เอกสารนี้ไม่ใช่เอกสารการชำระเงิน — ต้องระบุกำหนดชำระ
          </p>
        )}

        <div className="form-group">
          <span className="toolbar-label">ไฟล์หลักฐาน * (สลิป / PO / เอกสารยืนยันการสั่งซื้อ)</span>
          {/* ⭐ ตะกร้าไฟล์กลาง — เดิมที่นี่วาดปุ่ม+รายการเองด้วย inline style ทั้งก้อน
              ซึ่งเป็นทรงที่ 4 ของ "แนบไฟล์" ในระบบ · ได้ลากมาวาง/Ctrl+V ติดมาด้วย */}
          <PendingFiles
            files={files} onChange={setFiles} disabled={busy}
            max={MAX_WON_ATTACHMENTS} onOversize={setError}
          />
          {!files.length && (
            <p style={{ margin: 0, color: "var(--text-3)", fontSize: "var(--fs-6)" }}>ยังไม่ได้แนบไฟล์ — ต้องแนบอย่างน้อย 1 ไฟล์</p>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", borderTop: "1px solid var(--border)", paddingTop: 14 }}>
          <button type="button" className="btn ghost" onClick={close} disabled={busy}>ยกเลิก</button>
          <button type="button" className="btn btn-primary" onClick={submit} disabled={busy}>
            <CheckCircle2 size={15} aria-hidden="true" /> {busy ? "กำลังบันทึก…" : "ยืนยัน Won"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
