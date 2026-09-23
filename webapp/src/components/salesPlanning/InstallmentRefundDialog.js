"use client";
// ── โมดัล "บันทึกคืนเงิน" ของงวดใบที่ยกเลิก (PR3 · mig 0378 · แผน so-payment-unlock-replan · มติเจ้าของ 23/09 D4) ──────
//
// ⭐ **หนึ่งโมดัล สองทางเรียก** — แผงงวดบนใบที่ยกเลิก และคิว "เงินค้างจากใบที่ยกเลิก" บนทะเบียนการชำระของบัญชี
//   (กฎเดียวกับ TaxInvoiceDialog / InstallmentConfirmDialog · AGENTS.md: หนึ่งฟอร์ม สองทางเรียก)
// ⭐ คืนเต็มจำนวนของงวด (ไม่มีช่องยอด — ยอดของแถวคือยอดที่คืน) · มีใบกำกับภาษีต้องมีเลขใบลดหนี้
// ⭐ บอกผลก่อนกดผ่าน `paymentRefundPrompt` (lib/approvalPrompt.js — กติกา #1223: ทุกการยืนยันบอกผลที่ตรวจได้)
// ⚠️ ด่านค่าตัวเดียวกับ API (`refundValueError` — installmentActionError 'refund' เรียกตัวนี้) · สิทธิ์ตัดสินที่ API/ผู้เรียก
import { useEffect, useState } from "react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DateInput from "@/components/ui/DateInput";
import Textarea from "@/components/ui/Textarea";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney, naText } from "@/lib/format";
import { paymentRefundPrompt } from "@/lib/approvalPrompt";
import { MAX_REFUND_CREDIT_NOTE_NO, MAX_REFUND_REASON, MIN_REJECT_REASON, refundValueError } from "@/lib/sales/salesOrderPayments";
import styles from "./InstallmentRefundDialog.module.css";

/**
 * @param row      งวด confirmed ของใบที่ยกเลิก — `id` · `seq` · `label` · `amount` · `taxInvoiceNo` · `paidOn`
 * @param order    ใบต้นทางเท่าที่มี — `orderNumber` · `customerName`
 * @param todayIso "วันนี้" ตามนาฬิกาไทยจาก server — ค่าตั้งต้นของวันที่คืน (ห้ามอ่านนาฬิกาเบราว์เซอร์)
 * @param onSubmit async ({ refundedOn, reason, creditNoteNo }) => boolean
 */
export default function InstallmentRefundDialog({
  open, row, order, todayIso = null, busy = false, error = "", onClose, onSubmit,
}) {
  const [refundedOn, setRefundedOn] = useState("");
  const [reason, setReason] = useState("");
  const [creditNoteNo, setCreditNoteNo] = useState("");

  /* ค่าเริ่มต้นทุกครั้งที่เปิดกับงวดใหม่ — เปิดค้างแล้วเปลี่ยนงวดต้องไม่เหลือค่าเก่า */
  useEffect(() => {
    if (!open) return;
    setRefundedOn(todayIso || "");
    setReason("");
    setCreditNoteNo("");
  }, [open, row?.id, todayIso]);

  if (!open || !row) return null;
  const invoice = String(row.taxInvoiceNo || "").trim();
  const valueError = refundValueError(row, { refundedOn, reason, creditNoteNo });
  const prompt = paymentRefundPrompt({
    label: row.label || `งวดที่ ${row.seq}`,
    amount: fmtMoney(row.amount),
    orderNumber: order?.orderNumber || row.orderNumber || "",
    refundedOnLabel: refundedOn ? fmtDate(refundedOn) : "",
    taxInvoiceNo: invoice,
    creditNoteNo: creditNoteNo.trim(),
  });

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={prompt.title} size="sm">
      <div className={styles.body}>
        <dl className={styles.facts}>
          {order?.orderNumber || row.orderNumber
            ? <><dt>ใบสั่งขาย (ยกเลิกแล้ว)</dt><dd className="mono">{order?.orderNumber || row.orderNumber}</dd></>
            : null}
          {order?.customerName || row.customerName ? <><dt>ลูกค้า</dt><dd>{order?.customerName || row.customerName}</dd></> : null}
          <dt>งวด</dt><dd>{naText(row.label || `งวดที่ ${row.seq}`)}</dd>
          <dt>ยอดที่คืน (เต็มงวด)</dt><dd className="mono">{fmtMoney(row.amount)}</dd>
          <dt>วันที่ลูกค้าจ่าย</dt>
          <dd>{row.paidOn ? fmtDate(row.paidOn) : <span className="cell-quiet">ยังไม่ระบุ</span>}</dd>
          <dt>ใบกำกับภาษี</dt><dd className="mono">{naText(invoice)}</dd>
        </dl>

        <label className="form-group">
          <span>วันที่คืนเงิน *</span>
          <DateInput value={refundedOn} onChange={setRefundedOn} disabled={busy} ariaLabel="วันที่คืนเงิน" />
        </label>

        <label className="form-group">
          <span>{invoice ? "เลขที่ใบลดหนี้ *" : "เลขที่ใบลดหนี้"}</span>
          <Input
            mono
            autoComplete="off"
            value={creditNoteNo}
            maxLength={MAX_REFUND_CREDIT_NOTE_NO}
            onChange={(event) => setCreditNoteNo(event.target.value)}
            placeholder={invoice ? `ใบลดหนี้ของใบกำกับ ${invoice}` : "ถ้ามี"}
            disabled={busy}
          />
        </label>

        <label className="form-group">
          <span>เหตุผลที่คืนเงิน *</span>
          <Textarea
            rows={3}
            value={reason}
            maxLength={MAX_REFUND_REASON}
            onChange={(event) => setReason(event.target.value)}
            placeholder={`เช่น ลูกค้ายกเลิกงาน ขอคืนมัดจำทั้งหมด — อย่างน้อย ${MIN_REJECT_REASON} ตัวอักษร`}
            disabled={busy}
          />
        </label>

        {/* ผลที่ตรวจได้ก่อนกด — ตัวสร้างข้อความกลาง (paymentRefundPrompt) ไม่เขียนคำเองที่จอ */}
        <p className="form-note pre-line">{prompt.detail}</p>

        {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}

        <div className="action-bar">
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button tone="danger" disabled={busy || !!valueError} title={valueError || undefined}
            onClick={() => onSubmit?.({ refundedOn, reason: reason.trim(), creditNoteNo: creditNoteNo.trim() })}>
            {busy ? "กำลังบันทึก…" : prompt.confirmLabel}
          </Button>
        </div>
        {valueError && (reason || creditNoteNo) ? <p className="form-note">{valueError}</p> : null}
      </div>
    </Modal>
  );
}
