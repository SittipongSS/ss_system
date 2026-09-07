"use client";
// ── โมดัล "บันทึกใบกำกับภาษีของงวด" (mig 0348) ────────────────────────────
//
// > *"FN ตรวจและยืนยัน รวมถึงแนบใบกำกับ กับเลขที่วันที่ใบกำกับ"* (มติผู้ใช้ 2026-09-07)
//
// ⭐ **หนึ่งโมดัล สองทางเรียก** — ทะเบียนการชำระ และการ์ดงวดบนใบ SO เรียกตัวเดียวกัน
// (กฎเดียวกับ `InstallmentConfirmDialog`) · เขียนสองชุดเมื่อไรมันเพี้ยนหากันเสมอ
//
// ⭐ **แยกจากการรับรองเงิน** โดยตั้งใจ — `confirm` ถอนคืนยาก (ล็อกใบไม่ให้ย้อนอนุมัติ)
// ส่วนเลขใบกำกับพิมพ์ผิดได้ทุกวัน · รวมสอง write ไว้ในโมดัลเดียวเมื่อไร คนที่พิมพ์เลข
// ผิดจะต้องถอนคำรับรองเรื่องเงินเพื่อแก้ตัวหนังสือ
//
// ⚠️ **กดส่งซ้ำต้องไม่อัปไฟล์ซ้ำ** — จำ ref ของไฟล์ที่อัปสำเร็จแล้วไว้ (`uploadedRef`)
// ไม่งั้นทุกครั้งที่ server ปฏิเสธแล้วผู้ใช้กดใหม่ จะได้ไฟล์กำพร้าเพิ่มอีกหนึ่งใบใน
// bucket ที่ไม่มีใครอ้างถึงและไม่มี cron กวาด (บทเรียนจาก `updatePost.js`)
import { useEffect, useState } from "react";
import { Paperclip } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import DateInput from "@/components/ui/DateInput";
import PendingFiles from "@/components/ui/PendingFiles";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney, naText } from "@/lib/format";
import { uploadFileBytes } from "@/lib/master/uploadFile";
import { MAX_TAX_INVOICE_NO, taxInvoiceValueError } from "@/lib/sales/taxInvoice";
import styles from "./TaxInvoiceDialog.module.css";

const fileKey = (file) => (file ? `${file.name}:${file.size}:${file.lastModified}` : "");

/**
 * @param row       งวด — ต้องมี `id` `seq` `label` `amount` `orderId` และค่าใบกำกับปัจจุบัน
 * @param order     ใบต้นทางเท่าที่มี — `id` · `orderNumber` · `customerName`
 * @param todayIso  "วันนี้" ตามนาฬิกาไทยจาก server — ห้ามอ่านนาฬิกาเบราว์เซอร์
 * @param onSubmit  async ({ taxInvoiceNo, taxInvoiceDate, taxInvoiceFile }) => boolean
 * @param onClear   async () => boolean — ล้างใบกำกับของงวดนี้ (ไม่มี = ไม่โชว์ปุ่ม)
 */
export default function TaxInvoiceDialog({
  open, row, order, todayIso = null, busy = false, error = "", onClose, onSubmit, onClear,
}) {
  const [no, setNo] = useState("");
  const [date, setDate] = useState("");
  const [file, setFile] = useState(null);
  const [uploaded, setUploaded] = useState(null);   // { key, ref } ของไฟล์ที่อัปสำเร็จแล้ว
  const [localError, setLocalError] = useState("");
  const [uploading, setUploading] = useState(false);

  /* ตั้งค่าเริ่มต้นทุกครั้งที่เปิดกับงวดใหม่ — เปิดค้างแล้วเปลี่ยนงวดต้องไม่เหลือค่าเก่า
     ⚠️ วันตั้งต้นมาจาก `todayIso` ของ server (นาฬิกาไทย) ไม่ใช่ `new Date()` ของเครื่อง —
     ระหว่างเที่ยงคืนถึง 07:00 น. ของไทย UTC ยังเป็นเมื่อวาน ⇒ เดือนภาษีเพี้ยนได้ */
  useEffect(() => {
    if (!open) return;
    setNo(row?.taxInvoiceNo || "");
    setDate(row?.taxInvoiceDate || todayIso || "");
    setFile(null);
    setUploaded(null);
    setLocalError("");
  }, [open, row?.id, row?.taxInvoiceNo, row?.taxInvoiceDate, todayIso]);

  if (!open || !row) return null;

  const orderId = order?.id || row.orderId;
  /* ⚠️ รับได้สองรูป — การ์ดบนใบส่งแถวดิบจาก DB (`taxInvoiceFile` เป็น object) ส่วน
     ทะเบียนส่งรูปที่ตัด path ออกแล้ว (`taxInvoiceFileName` + `hasTaxInvoiceFile`)
     normalize ที่นี่ที่เดียว ไม่ให้ผู้เรียกต้องรู้ว่าอีกฝั่งส่งอะไร (ทรงเดียวกับ
     `InstallmentConfirmDialog` ที่ normalize `evidence`) */
  const existingFileName = row.taxInvoiceFileName || row.taxInvoiceFile?.fileName || "";
  const hasExistingFile = Boolean(row.hasTaxInvoiceFile || row.taxInvoiceFile?.storagePath);
  const valueError = taxInvoiceValueError({ no, date });
  const working = busy || uploading;

  const submit = async () => {
    setLocalError("");
    if (valueError) { setLocalError(valueError); return; }

    let attachment;
    if (file) {
      /* อัปแล้วจำ ref ไว้ — กดส่งซ้ำหลัง server ปฏิเสธจะใช้ ref เดิม ไม่อัปใหม่
         ⚠️ ไบต์ขึ้น bucket ตรงจากเบราว์เซอร์ (signed URL) เพราะ Vercel ตัด body ที่ 4.5 MB
         และไฟล์ใบกำกับที่สแกนมามักเกินนั้น */
      if (uploaded?.key === fileKey(file)) {
        attachment = uploaded.ref;
      } else {
        setUploading(true);
        try {
          const ref = await uploadFileBytes({
            file, entityType: "sales_order_tax_invoice", entityId: orderId,
          });
          attachment = {
            fileUrl: ref.url || null,
            storageBucket: ref.storageBucket || null,
            storagePath: ref.storagePath || null,
            fileName: file.name,
            mimeType: file.type || null,
            sizeBytes: file.size,
          };
          setUploaded({ key: fileKey(file), ref: attachment });
        } catch (uploadError) {
          setLocalError(uploadError?.message || `อัปโหลด ${file.name} ไม่สำเร็จ`);
          setUploading(false);
          return;
        }
        setUploading(false);
      }
    }

    /* ⚠️ **ไม่ส่งไฟล์ = server เก็บไฟล์เดิมไว้** — จอไม่เคยได้ ref ของไฟล์เดิมมา
       (ทะเบียนส่งมาแค่ชื่อไฟล์ ไม่ส่ง path ตามกติกาของ `ledgerRow`) ⇒ ถ้าให้จอเป็น
       คนตัดสิน การแก้แค่เลขจะลบไฟล์ที่แนบไว้ทิ้งเงียบ ๆ · ทางลบไฟล์คือปุ่ม "ลบใบกำกับ" */
    await onSubmit?.({
      taxInvoiceNo: no.trim(),
      taxInvoiceDate: date,
      taxInvoiceFile: attachment || null,
    });
  };

  return (
    <Modal
      open={open}
      onClose={working ? undefined : onClose}
      title={row.taxInvoiceNo ? "แก้ไขใบกำกับภาษีของงวด" : "บันทึกใบกำกับภาษีของงวด"}
      size="sm"
    >
      <div className={styles.body}>
        <dl className={styles.facts}>
          {order?.orderNumber ? <><dt>ใบสั่งขาย</dt><dd className="mono">{order.orderNumber}</dd></> : null}
          {order?.customerName ? <><dt>ลูกค้า</dt><dd>{order.customerName}</dd></> : null}
          <dt>งวด</dt><dd>{naText(row.label || `งวดที่ ${row.seq}`)}</dd>
          <dt>ยอด</dt><dd className="mono">{fmtMoney(row.amount)}</dd>
          <dt>วันที่ลูกค้าจ่าย</dt>
          <dd>{row.paidOn ? fmtDate(row.paidOn) : <span className="cell-quiet">ยังไม่ระบุ</span>}</dd>
        </dl>

        <label className="form-group">
          <span>เลขที่ใบกำกับภาษี *</span>
          {/* ⚠️ ต้องใช้ primitive `Input` ไม่ใช่ `<input>` ดิบ — คลาส `.premium-input`
              (ความสูง `--ctl-h` · padding · วงโฟกัส) ประกอบอยู่ที่นั่นที่เดียว
              🐞 รอบแรกเขียน `<input>` เปล่า ⇒ ช่องไม่มี padding ตัวอักษรชนขอบซ้าย
              และเตี้ยกว่าช่องวันที่ข้าง ๆ · `audit:ui` จับไม่ได้เพราะมันนับ *คลาสดิบ*
              ไม่ได้นับ element ที่ลืมคลาส
              ⭐ `mono` เพราะเป็นเลขเอกสาร — ตัวเลขความกว้างเท่ากัน ไม่ขยับตอนพิมพ์ */}
          <Input
            mono
            autoComplete="off"
            value={no}
            maxLength={MAX_TAX_INVOICE_NO}
            onChange={(event) => setNo(event.target.value)}
            placeholder="เลขที่จากระบบบัญชี"
            disabled={working}
            autoFocus
          />
        </label>

        <label className="form-group">
          <span>วันที่บนใบกำกับ *</span>
          <DateInput value={date} onChange={setDate} disabled={working} ariaLabel="วันที่บนใบกำกับ" />
          <small className="form-note">วันที่บนตัวเอกสาร ไม่ใช่วันที่บันทึก — ใช้กระทบยอด VAT รายเดือน</small>
        </label>

        {/* ไฟล์ไม่บังคับ — ของจริงบางงวดออกเลขก่อนแล้วสแกนไฟล์ตามทีหลัง
            ⚠️ หนึ่งงวดหนึ่งไฟล์ (1 งวด : 1 ใบ) ⇒ `multiple={false}` และ `max={1}` */}
        {hasExistingFile && !file ? (
          <div className={styles.current}>
            <span className={styles.currentLabel}>ไฟล์ที่แนบไว้</span>
            <a
              href={`/api/sales-planning/sales-orders/${orderId}/payment-file?installment=${encodeURIComponent(row.id)}&doc=tax_invoice`}
              target="_blank" rel="noreferrer" className={styles.file} title={existingFileName}
            >
              <Paperclip size={13} aria-hidden="true" />
              <span className="cell-ellipsis">{existingFileName || "ไฟล์ใบกำกับภาษี"}</span>
            </a>
          </div>
        ) : null}
        <PendingFiles
          files={file ? [file] : []}
          onChange={(picked) => setFile(picked[0] || null)}
          onOversize={setLocalError}
          disabled={working}
          multiple={false}
          max={1}
          label={hasExistingFile ? "แนบไฟล์ใหม่แทนของเดิม" : "แนบไฟล์ใบกำกับภาษี"}
        />

        {localError || error ? (
          <StatusNotice tone="error" role="alert">{localError || error}</StatusNotice>
        ) : null}

        <div className="action-bar">
          {onClear && row.taxInvoiceNo ? (
            <Button variant="quiet" tone="danger" disabled={working} onClick={onClear}>
              ลบใบกำกับ
            </Button>
          ) : null}
          <Button variant="quiet" onClick={onClose} disabled={working}>ยกเลิก</Button>
          <Button tone="primary" onClick={submit} disabled={working || !!valueError}>
            {uploading ? "กำลังอัปไฟล์…" : busy ? "กำลังบันทึก…" : "บันทึกใบกำกับ"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
