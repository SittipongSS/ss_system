"use client";
// ── โมดัล "บัญชีรับรองว่าเงินเข้าแล้ว" — ใช้ร่วมทุกที่ที่กดรับรองงวดได้ ────────
//
// มติผู้ใช้ 2026-08-13: คิวรับรองย้ายขึ้นมาอยู่บนหน้าทะเบียนการชำระด้วย
// ⇒ ตอนนี้มี **สองจอ** ที่กดรับรองได้ (การ์ดบนใบ SO · คิวบนทะเบียน)
//
// ⭐ **หนึ่งโมดัล สองทางเรียก** ตามกฎของโปรเจกต์ (AGENTS.md "ปุ่มแก้ไขต้องเปิดฟอร์ม
// ตัวเดียวกับตอนสร้าง") — เขียนสองชุดเมื่อไรมันเพี้ยนหากันเสมอ และที่นี่เจ็บเป็นพิเศษ
// เพราะเป็นการรับรองว่า **เงินเข้าจริง** ซึ่งถอนคืนไม่ได้
//
// ⭐ **โชว์หลักฐานก่อนให้กด** — ความเสี่ยงที่ยกไว้ตอนตัดสินใจย้ายคิวขึ้นมาคือ
// *"คนกดคอนเฟิร์มจะมองไม่เห็นหลักฐานที่แนบมากับงวดซึ่งอยู่บนใบ"* · โมดัลนี้คือคำตอบ
// ⇒ การ์ดบนใบ SO ก็ได้ประโยชน์ด้วย เดิมมันถามยืนยันโดยไม่โชว์อะไรเลย
//
// ⚠️ ข้อความ/คำเตือนมาจาก `paymentConfirmPrompt` ตัวเดียวกับทั้งระบบ — ห้ามเขียนคำเอง
import { Paperclip } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import { paymentConfirmPrompt } from "@/lib/approvalPrompt";
import styles from "./InstallmentConfirmDialog.module.css";

/**
 * @param row   งวดที่จะรับรอง — ต้องมี `id` · `seq` · `label` · `amount` และควรมี
 *              `paidOn` · `reportedByName` · `evidence[{index,fileName}]`
 * @param order ใบต้นทางเท่าที่มี — `id` (ใช้ทำลิงก์ไฟล์) · `orderNumber` · `customerName`
 * @param multi true = ใบนี้แบ่งหลายงวด ⇒ พาดหัวต้องบอก "งวดที่ n"
 */
export default function InstallmentConfirmDialog({
  open, row, order, multi = false, busy = false, error = "", onClose, onConfirm,
}) {
  if (!open || !row) return null;
  const label = multi ? `งวดที่ ${row.seq}` : (row.label || "ชำระเต็มจำนวน");
  const prompt = paymentConfirmPrompt({ label, amount: fmtMoney(row.amount) });
  /* ⚠️ รับได้สองรูป — การ์ดบนใบส่งแถวดิบจาก DB (`{fileName, storagePath}`) ส่วนทะเบียน
     ส่งรูปที่ตัด path ออกแล้ว (`{index, fileName}`) · normalize ที่นี่ที่เดียว
     ไม่ให้ผู้เรียกต้องรู้ว่าอีกฝั่งส่งอะไร */
  const files = (Array.isArray(row.evidence) ? row.evidence : []).map((file, i) => ({
    index: file?.index ?? i,
    fileName: file?.fileName || `หลักฐาน ${i + 1}`,
  }));
  const orderId = order?.id || row.orderId;

  return (
    <Modal open={open} onClose={busy ? undefined : onClose} title={prompt.title} size="sm">
      <div className={styles.body}>
        <p className={styles.lead}>{prompt.description}</p>

        {/* สิ่งที่กำลังรับรอง — ข้อมูลพอให้ตัดสินได้โดยไม่ต้องเปิดใบ */}
        <dl className={styles.facts}>
          {order?.orderNumber ? <><dt>ใบสั่งขาย</dt><dd className="mono">{order.orderNumber}</dd></> : null}
          {order?.customerName ? <><dt>ลูกค้า</dt><dd>{order.customerName}</dd></> : null}
          <dt>งวด</dt><dd>{naText(row.label)}{row.percent ? ` · ${row.percent}%` : ""}</dd>
          <dt>ยอด</dt><dd className="mono">{fmtMoney(row.amount)}</dd>
          <dt>วันที่ลูกค้าจ่าย</dt>
          <dd>{row.paidOn ? fmtDate(row.paidOn) : <span className="cell-quiet">ไม่ได้ระบุ</span>}</dd>
          <dt>ผู้แจ้ง</dt>
          <dd>{row.reportedByName || <span className="cell-quiet">{NA}</span>}</dd>
        </dl>

        {/* 🔴 หลักฐาน — เปิดดูได้ก่อนกด · ไม่มีไฟล์เลยต้องเตือน ไม่ใช่ปล่อยผ่านเงียบ ๆ */}
        {files.length ? (
          <div className={styles.files}>
            <span className={styles.filesLabel}>หลักฐานการชำระ {files.length} ไฟล์</span>
            {files.map((file) => (
              <a
                key={file.index}
                href={`/api/sales-planning/sales-orders/${orderId}/payment-file?installment=${encodeURIComponent(row.id)}&i=${file.index}`}
                target="_blank" rel="noreferrer" className={styles.file} title={file.fileName}
              >
                <Paperclip size={13} aria-hidden="true" />
                <span className="cell-ellipsis">{file.fileName}</span>
              </a>
            ))}
          </div>
        ) : (
          <StatusNotice tone="warning">งวดนี้ไม่มีไฟล์หลักฐานแนบมา — ตรวจกับฝ่ายขายก่อนรับรอง</StatusNotice>
        )}

        <p className={`${styles.detail} pre-line`}>{prompt.detail}</p>

        {error ? <StatusNotice tone="error" role="alert">{error}</StatusNotice> : null}

        <div className={styles.actions}>
          <Button variant="quiet" onClick={onClose} disabled={busy}>ยกเลิก</Button>
          <Button tone="accent" onClick={() => onConfirm(row)} disabled={busy} aria-busy={busy || undefined}>
            {busy ? "กำลังบันทึก…" : prompt.confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
