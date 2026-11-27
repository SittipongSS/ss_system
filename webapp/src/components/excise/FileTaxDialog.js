"use client";
import { useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import PendingFiles from "@/components/ui/PendingFiles";
import DateInput from "@/components/ui/DateInput";
import MoneyInput from "@/components/ui/MoneyInput";
import Textarea from "@/components/ui/Textarea";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtMoney } from "@/lib/format";
import { describeResponseError } from "@/lib/fetchError";
import { uploadAttachment } from "@/lib/master/attachmentUpload";
import { businessDate } from "@/lib/businessDate";
import { apiFetch } from "@/lib/apiFetch";
import { isExemptFiling, untaxedFilingItems } from "@/lib/tax/exciseBilling";
import { FILING_REASON_MAX, FILING_REASON_MIN } from "@/lib/excise/raFilingRules";
import {
  PAYMENT_DOCS, PAYMENT_DOC_TYPES, filingPaymentError, paidAmountCheck,
} from "@/lib/excise/filingPayment";
import styles from "./FileTaxDialog.module.css";

/* RA บันทึกผลชำระ (กำลังยื่น → ชำระแล้ว) + แก้ข้อมูลการชำระ (`mode="edit"` · D11) — ฟอร์มเดียวกันสองโหมด (กฎ AGENTS.md)
   ⭐ มติเจ้าของ 27/11/2026: เอกสารจากกรมมี **สองชุด** ⇒ ฟอร์มแบ่งสองส่วนตามลำดับที่เอกสารเกิด
      1) แบบรายการภาษี ภส.03-07 — เลขที่รับแบบ + ไฟล์ (บังคับ)
      2) ใบเสร็จรับเงินกรม — เลขที่ใบเสร็จ · วันรับเงิน · ยอดรวม + ไฟล์ (บังคับ) · ยอดไม่ตรงยอดยื่น = ต้องมีเหตุผล
      ด่านทั้งหมดอยู่ที่ `lib/excise/filingPayment.js` ตัวเดียวกับ server (PATCH /api/orders/[id])
   ⭐ ลำดับบันทึก: แนบไฟล์เข้าบันทึก **ก่อน** (ยังกำลังยื่น) แล้วค่อยปิดงาน — server ตรวจว่าไฟล์อยู่บนบันทึกจริงก่อนยอมปิด
      🐞 เดิมแนบหลังปิดงานแบบ best-effort ⇒ แนบพลาด = งานชำระแล้วโดยไม่มีไฟล์ · ไฟล์เดียว · ไม่บังคับ
      ปิดงานพลาดหลังแนบแล้ว = ไฟล์อยู่บนบันทึก กดซ้ำได้โดยไม่ต้องแนบใหม่ (ฟอร์มนับไฟล์ที่มีอยู่แล้ว)
   ⚠️ "ยกเว้น" = ทุกรายการผูกทะเบียนที่ RA ยกเว้นไว้ (isExemptFiling) — ไม่มีเอกสารจากกรม ปิดงานได้ทันที
      ยอด 0 เพราะสินค้าไม่มีราคาขายปลีก ไม่ใช่ยกเว้น (ตรวจระบบ 2026-10-26) */
const EMPTY_PICKS = { tax_form: null, tax_receipt: null };

export default function FileTaxDialog({ open, onClose, onDone, order, mode = "file" }) {
  const editing = mode === "edit";
  const isExempt = isExemptFiling(order);
  const untaxedCount = untaxedFilingItems(order).length;
  const [formRef, setFormRef] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [paidDate, setPaidDate] = useState("");
  const [paidAmount, setPaidAmount] = useState("");
  const [amountReason, setAmountReason] = useState("");
  const [picks, setPicks] = useState(EMPTY_PICKS);
  const [existing, setExisting] = useState([]);
  const [existingError, setExistingError] = useState(null);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    /* ⭐ ไม่มีค่าตั้งต้นให้วันรับเงิน/ยอดตอนบันทึกครั้งแรก (form-design-rules §2) — เติมวันนี้/ยอดยื่นให้ = RA กดผ่านได้
       โดยไม่ได้ดูใบเสร็จ และด่าน "ยอดไม่ตรง" ไม่มีวันทำงาน · โหมดแก้เติมค่าที่บันทึกไว้ */
    setFormRef(editing ? order?.taxFormRef || "" : "");
    setReceiptNumber(editing ? order?.exciseReceiptNumber || "" : "");
    setPaidDate(editing && order?.taxPaidDate ? String(order.taxPaidDate).slice(0, 10) : "");
    setPaidAmount(editing && order?.exciseTaxPaidAmount != null ? String(order.exciseTaxPaidAmount) : "");
    setAmountReason("");
    setPicks(EMPTY_PICKS);
    setExisting([]);
    setExistingError(null);
    setTried(false);
    setError(null);
    if (!order?.id || isExempt) return;
    let alive = true;
    // ไฟล์ที่อยู่บนบันทึกแล้ว (โหมดแก้ · หรือกดปิดงานรอบก่อนแล้วแนบสำเร็จแต่ปิดงานพลาด) — นับเป็นไฟล์ที่มีแล้ว
    apiFetch(`/api/master/attachments?entityType=order&entityId=${encodeURIComponent(order.id)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) throw new Error(await describeResponseError(res, "โหลดไฟล์ที่แนบไว้ไม่สำเร็จ"));
        const rows = await res.json();
        if (alive) setExisting((Array.isArray(rows) ? rows : []).filter((row) => PAYMENT_DOC_TYPES.includes(row.docType)));
      })
      .catch((err) => { if (alive) setExistingError(err.message); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- เติมค่าตอนเปิดโมดัลเท่านั้น ไม่ทับที่กำลังพิมพ์เมื่อใบโหลดใหม่
  }, [open, order?.id, editing]);

  const storedAmount = paidAmountCheck(0, order?.exciseTaxPaidAmount).paid;
  const amount = paidAmountCheck(order?.totalTax, paidAmount);
  // โหมดแก้: แตะยอดเมื่อไรค่อยถามเหตุผล (ยอดเดิมผ่านด่านมาแล้ว) — เงื่อนไขเดียวกับ route
  const amountTouched = !editing || amount.paid !== storedAmount;
  const askReason = amountTouched && amount.paid != null && amount.paid > 0 && !amount.matches;
  const docTypes = useMemo(() => [
    ...existing.map((row) => row.docType),
    ...Object.entries(picks).filter(([, file]) => file).map(([docType]) => docType),
  ], [existing, picks]);

  if (!order) return null;

  const fields = { taxFormRef: formRef, exciseReceiptNumber: receiptNumber, taxPaidDate: paidDate, exciseTaxPaidAmount: paidAmount };
  /* โหมดแก้ไม่ถามไฟล์ — บันทึกที่ชำระแล้วมีไฟล์ครบอยู่แล้วโดยด่านปิดงาน และ DELETE ไฟล์แนบกันลบไฟล์สุดท้าย
     (ถามซ้ำ = รายการไฟล์โหลดพลาดครั้งเดียวก็แก้เลขไม่ได้) */
  const blocker = isExempt ? null : filingPaymentError({
    fields, docTypes: editing ? PAYMENT_DOC_TYPES : docTypes, totalTax: order.totalTax, amountReason,
    checkAmount: amountTouched, today: businessDate(),
  });
  const blank = (value) => tried && String(value ?? "").trim() === "";
  const missingDoc = (docType) => tried && !docTypes.includes(docType);

  const attachPicked = async () => {
    const meta = {
      tax_form: { referenceNo: formRef.trim() || undefined },
      tax_receipt: { referenceNo: receiptNumber.trim() || undefined, paidDate: paidDate || undefined, amount: amount.paid ?? undefined },
    };
    for (const { docType, label } of PAYMENT_DOCS) {
      const file = picks[docType];
      if (!file) continue;
      const result = await uploadAttachment({ entityType: "order", entityId: order.id, file, docType, metadata: meta[docType] });
      if (!result.ok) throw new Error(`แนบไฟล์${label}ไม่สำเร็จ — ${result.error || "ลองใหม่อีกครั้ง"}`);
      // แนบแล้ว = อยู่บนบันทึกแล้ว · กดซ้ำหลังปิดงานพลาดต้องไม่แนบซ้ำ
      setPicks((prev) => ({ ...prev, [docType]: null }));
      setExisting((prev) => [...prev, result.attachment || { id: `${docType}-${file.name}`, docType, fileName: file.name }]);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setTried(true);
    if (blocker) { setError(blocker); return; }
    setBusy(true);
    setError(null);
    try {
      const body = editing ? {} : { status: "complete" };
      if (!isExempt) {
        await attachPicked();
        body.taxFormRef = formRef.trim();
        body.exciseReceiptNumber = receiptNumber.trim();
        body.taxPaidDate = paidDate;
        body.exciseTaxPaidAmount = amount.paid;
        if (askReason) body.paidAmountReason = amountReason.trim();
      }
      const res = await apiFetch(`/api/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) throw new Error(await describeResponseError(res, "ไม่สามารถบันทึกได้"));
      onDone?.();
      onClose();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const docBlock = (docType, label) => {
    const have = existing.filter((row) => row.docType === docType);
    return (
      <div className="form-group">
        <label>ไฟล์{label} {!editing && <span className="required-mark">*</span>}</label>
        {have.length > 0 && (
          <ul className={styles.existing}>
            {have.map((row) => <li key={row.id}>{row.fileName || "ไฟล์ที่แนบไว้"}</li>)}
          </ul>
        )}
        <PendingFiles
          files={picks[docType] ? [picks[docType]] : []} multiple={false}
          onChange={(picked) => setPicks((prev) => ({ ...prev, [docType]: picked[0] || null }))}
          disabled={busy} onOversize={setError} invalid={missingDoc(docType)}
          label={have.length ? "แนบไฟล์ใหม่เพิ่ม" : "แนบไฟล์"}
          hint={have.length ? "ไฟล์เดิมยังอยู่ — ลบไฟล์เดิมได้ที่การ์ดเอกสารของบันทึกหลังแนบไฟล์ใหม่แล้ว" : undefined}
        />
      </div>
    );
  };

  const title = `${editing ? "แก้ข้อมูลการชำระ" : "บันทึกผลชำระภาษี"} — ${order.poReference || order.quotationRef || order.id}`;
  return (
    <Modal open={open} onClose={() => !busy && onClose()} title={title} size="md">
      <form onSubmit={submit} noValidate>
        <div className="drawer-section flex flex-col gap-4">
          <div className={styles.due}>
            <span className={styles.dueLabel}>ยอดยื่นที่ต้องชำระ</span>
            {isExempt ? (
              <span className={styles.dueTotal}>ยกเว้นภาษี</span>
            ) : (
              <span className={styles.dueParts}>
                <span>สรรพสามิต {fmtMoney(order.totalExciseTax || 0)} · มหาดไทย {fmtMoney(order.totalLocalTax || 0)}</span>
                <span className={styles.dueTotal}>{fmtMoney(order.totalTax || 0)}</span>
              </span>
            )}
          </div>

          {untaxedCount > 0 && (
            <StatusNotice tone="warning">
              มี {untaxedCount} รายการที่ภาษีเป็น ฿0 เพราะตอนเริ่มยื่น สินค้ายังไม่มีราคาขายปลีก — ยอดในบันทึกนี้ขาดจากที่ต้องยื่นจริง
            </StatusNotice>
          )}
          {isExempt ? (
            <p style={{ fontSize: "var(--fs-6)", color: "var(--text-3)" }}>บันทึกนี้ได้รับยกเว้นภาษี ไม่มีเอกสารจากกรม — ยืนยันเพื่อปิดงานเป็น “ชำระแล้ว”</p>
          ) : (
            <>
              {existingError && <StatusNotice tone="warning">{existingError} — ระบบจะตรวจไฟล์อีกครั้งตอนบันทึก</StatusNotice>}

              <section className={styles.part} aria-labelledby="tax-form-part">
                <h3 id="tax-form-part" className={styles.partTitle}><span className={styles.step}>1</span>{PAYMENT_DOCS[0].label}</h3>
                <div className="form-group">
                  <label htmlFor="tax-form-ref">เลขที่รับแบบ <span className="required-mark">*</span></label>
                  <input id="tax-form-ref" className={`premium-input w-full font-mono${blank(formRef) ? " is-invalid" : ""}`}
                    value={formRef} onChange={(e) => setFormRef(e.target.value)} placeholder="เช่น 6920073720" autoComplete="off" />
                  <p className={styles.hint}>“เลขที่รับ” ในกรอบสำหรับเจ้าหน้าที่ มุมขวาบนของแบบ — ไม่ใช่ชื่อแบบ ภส.03-07</p>
                </div>
                {docBlock("tax_form", "แบบ ภส.")}
              </section>

              <section className={styles.part} aria-labelledby="tax-receipt-part">
                <h3 id="tax-receipt-part" className={styles.partTitle}><span className={styles.step}>2</span>{PAYMENT_DOCS[1].label}</h3>
                {/* จอมือถือซ้อนคอลัมน์เดียว — เลขใบเสร็จ 17 ตัวโดนตัดเมื่อแบ่งครึ่งที่ 375px (UAT 27/11) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="form-group">
                    <label htmlFor="tax-receipt-number">เลขที่ใบเสร็จ <span className="required-mark">*</span></label>
                    <input id="tax-receipt-number" className={`premium-input w-full font-mono${blank(receiptNumber) ? " is-invalid" : ""}`}
                      value={receiptNumber} onChange={(e) => setReceiptNumber(e.target.value)} placeholder="เช่น N00030069/0072584" autoComplete="off" />
                  </div>
                  <div className="form-group">
                    <label>วันรับเงิน <span className="required-mark">*</span></label>
                    {/* ⚠️ ไม่ส่ง `max` — ช่องที่ติด max ล้างค่าทิ้งเงียบ ๆ เมื่อพิมพ์ปี พ.ศ. จากใบเสร็จ (07/07/2569) แล้วจอบอกแค่ "ยังขาดวันรับเงิน"
                        ⇒ ปล่อยให้ค่าเข้า แล้ว `paidDateError` บอกตรง ๆ ว่าช่องเป็นปี ค.ศ. (UAT 27/11) */}
                    <DateInput className="w-full" value={paidDate} onChange={setPaidDate} invalid={blank(paidDate)} ariaLabel="วันรับเงิน (ค.ศ.)" />
                  </div>
                </div>
                <p className={styles.hint}>วันที่ในบรรทัด “รับเงินผ่านระบบเครือข่ายอินเทอร์เน็ต วันที่ …” ไม่ใช่วันที่ออกใบเสร็จ · ช่องเป็นปี ค.ศ. (2569 = 2026)</p>
                <div className="form-group">
                  <label>ยอดรวมตามใบเสร็จ (บาท) <span className="required-mark">*</span></label>
                  <MoneyInput className="w-full" value={paidAmount} onChange={(value) => setPaidAmount(value ?? "")} />
                  {amount.paid != null && amount.paid > 0 && (amount.matches ? (
                    <StatusNotice tone="success">ตรงกับยอดยื่น {fmtMoney(amount.expected)}</StatusNotice>
                  ) : (
                    <StatusNotice tone="warning">
                      ต่างจากยอดยื่น {fmtMoney(amount.expected)} อยู่ {amount.diff > 0 ? "+" : "−"}{fmtMoney(Math.abs(amount.diff))}
                    </StatusNotice>
                  ))}
                </div>
                {askReason && (
                  <div className="form-group">
                    <label htmlFor="tax-amount-reason">เหตุผลที่ยอดไม่ตรง <span className="required-mark">*</span></label>
                    <Textarea id="tax-amount-reason" rows={3} value={amountReason} maxLength={FILING_REASON_MAX}
                      onChange={(e) => setAmountReason(e.target.value)}
                      placeholder={`เช่น เบี้ยปรับ หรือเงินเพิ่ม — อย่างน้อย ${FILING_REASON_MIN} ตัวอักษร · ลงประวัติของบันทึก`} />
                  </div>
                )}
                {docBlock("tax_receipt", "ใบเสร็จ")}
              </section>
            </>
          )}

          {error && <div style={{ fontSize: "var(--fs-7)", color: "var(--red)" }} className="bg-[var(--red-soft)] rounded p-2" role="alert">{error}</div>}
        </div>
        <div className="form-action-bar">
          <button type="button" onClick={onClose} className="btn" disabled={busy}>ยกเลิก</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : isExempt ? "ยืนยันชำระแล้ว" : "บันทึกผลชำระ"}</button>
        </div>
      </form>
    </Modal>
  );
}
