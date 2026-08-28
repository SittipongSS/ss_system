"use client";
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import PendingFiles from "@/components/ui/PendingFiles";
import { fmtMoney } from "@/lib/format";
import { describeResponseError } from "@/lib/fetchError";
import { uploadFileBytes } from "@/lib/master/uploadFile";
import { notifyToast } from "@/components/ui/Toast";
import { apiFetch } from "@/lib/apiFetch";

// SA "เงินเข้าแล้ว" — records the S&S invoice/receipt number and moves the order
// to 'received'. Exempt orders confirm without a receipt. PATCH unchanged.
export default function ReceiveDialog({ open, onClose, onDone, order }) {
  const isExempt = (order?.totalTax || 0) === 0;
  const [receiptNumber, setReceiptNumber] = useState("");
  const [file, setFile] = useState(null);   // หลักฐานการชำระจากลูกค้า
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => { if (open) { setReceiptNumber(""); setFile(null); setError(null); } }, [open, order?.id]);
  if (!order) return null;

  const submit = async (e) => {
    e.preventDefault();
    if (!isExempt && !receiptNumber.trim()) { setError("กรุณากรอกเลขที่ Invoice/Receipt ของ S&S"); return; }
    setBusy(true);
    setError(null);
    const body = { status: "received" };
    if (!isExempt) body.receiptNumber = receiptNumber.trim();
    try {
      const res = await apiFetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error || "ไม่สามารถทำรายการได้");
      // หลักฐานการชำระจากลูกค้า → เก็บเข้า attachments ของออเดอร์ (best-effort)
      if (file) {
        try {
          // ไบต์ขึ้น Drive ตรงจากเบราว์เซอร์ (ไม่ผ่าน function = ไม่ติดเพดาน 4.5 MB)
          const { url, driveFileId } = await uploadFileBytes({
            file, entityType: "order", entityId: order.id,
          });
          const sv = await apiFetch("/api/master/attachments", {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ entityType: "order", entityId: order.id, docType: "excise_proof", fileUrl: url, driveFileId, fileName: file.name, mimeType: file.type || null, sizeBytes: file.size }),
          });
          if (!sv.ok) {
            // rollback: บันทึก metadata ล้ม → ลบไฟล์ Drive กัน orphan.
            if (driveFileId) {
              apiFetch("/api/upload", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ driveFileId }) }).catch(() => {});
            }
            throw new Error(await describeResponseError(sv, "บันทึกหลักฐานการชำระไม่สำเร็จ"));
          }
        } catch (attErr) {
          // 🐞 เดิมเป็น `if (up.ok) {...} catch {}` เปล่า ๆ = ไฟล์ที่ผู้ใช้เลือกหายไป
          // เงียบสนิท ไม่มีอะไรบอกสักคำ · ยังไม่ล้มทั้งงาน (ออเดอร์ย้ายสถานะไปแล้ว
          // จริง ๆ) แต่ต้องบอกให้รู้ว่ายังไม่มีไฟล์ ไม่งั้นเข้าใจว่าแนบไปแล้ว
          notifyToast.error(`${attErr.message} — สถานะออเดอร์บันทึกแล้ว แนบหลักฐานซ้ำได้ที่หน้ารายละเอียดออเดอร์`);
        }
      }
      onDone?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={`ยืนยันรับเงิน — ${order.quotationRef || order.id}`} size="sm">
      <form onSubmit={submit}>
        <div className="drawer-section flex flex-col gap-3">
          <div className="flex justify-between items-center" style={{ fontSize: "var(--fs-7)", background: "var(--panel-3)", borderRadius: 8, padding: "10px 12px" }}>
            <span style={{ color: "var(--text-3)" }}>ยอดภาษีรวม</span>
            <span className="font-mono font-bold" style={{ color: "var(--red)" }}>{isExempt ? "ยกเว้นภาษี" : fmtMoney(order.totalTax)}</span>
          </div>
          {isExempt ? (
            <p style={{ fontSize: "var(--fs-6)", color: "var(--text-3)" }}>ออเดอร์นี้ได้รับยกเว้นภาษี — ยืนยันว่ารับเงินจากลูกค้าแล้ว เพื่อส่งต่อให้ฝ่าย RA</p>
          ) : (
            <div className="form-group">
              <label>เลขที่ Invoice / Receipt (S&amp;S) <span style={{ color: "var(--red)" }}>*</span></label>
              <input className="premium-input w-full font-mono" value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} required placeholder="เลขที่ใบกำกับภาษี/ใบเสร็จของ S&S" />
            </div>
          )}
          <div className="form-group">
            <label>แนบหลักฐานการชำระจากลูกค้า</label>
            <PendingFiles
              files={file ? [file] : []} multiple={false}
              onChange={(picked) => setFile(picked[0] || null)}
              disabled={busy} onOversize={setError}
            />
            <p style={{ fontSize: "var(--fs-3)", color: "var(--text-3)", marginTop: 4 }}>เช่น สลิปโอนเงิน/หลักฐานที่ลูกค้าส่งมา (แนบทีหลังที่หน้ารายละเอียดก็ได้)</p>
          </div>
          {error && <div style={{ fontSize: "var(--fs-7)", color: "var(--red)" }}>{error}</div>}
        </div>
        <div className="form-action-bar">
          <button type="button" onClick={onClose} className="btn" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "กำลังบันทึก..." : "ยืนยันรับเงินแล้ว"}</button>
        </div>
      </form>
    </Modal>
  );
}
