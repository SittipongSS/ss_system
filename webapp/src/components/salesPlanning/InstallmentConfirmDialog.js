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
//
// ⭐ **ใบสั่งขายย้อนหลัง (มติ 22/09 · mock FnConfirm + REVISION 2)** — โมดัลตัวเดิม ไม่ใช่โมดัลที่สอง
//   ต่างแค่ "โหมด" ผ่าน props: ผลลัพธ์ชุดของใบย้อนหลัง (ไม่มีบรรทัด Rev./Actual · จ่ายถึง · งวดถัดไป) และแถวที่
//   บัญชีต้องเห็นก่อนรับรองเงินที่เก็บมาก่อนเข้าระบบ: ใบผ่าน AE Sup แล้วหรือยัง · เก็บแล้วเท่าไรจากยอดใบ · หมายเหตุจาก SA
//   ⚠️ แถว "อนุมัติใบ" **ขึ้นเสมอ** กับใบย้อนหลัง แม้ข้อมูลไม่มา (ขีด) — แถวที่หายไปเงียบ ๆ อ่านเหมือน "ไม่มีเรื่องต้องตรวจ"
import { Paperclip } from "lucide-react";
import Modal from "@/components/Modal";
import Button from "@/components/ui/Button";
import StatusNotice from "@/components/ui/StatusNotice";
import ReadableText from "@/components/ui/ReadableText";
import { fmtDate, fmtMoney, fmtPercent, naText, NA } from "@/lib/format";
import { paymentConfirmPrompt } from "@/lib/approvalPrompt";
import { OPENING_INSTALLMENT_LABEL, isOpeningInstallment } from "@/lib/sales/historicalOrders";
import { openingInvoiceNote } from "@/lib/sales/taxInvoice";
import styles from "./InstallmentConfirmDialog.module.css";

/**
 * @param row        งวดที่จะรับรอง — ต้องมี `id` · `seq` · `label` · `amount` และควรมี
 *                   `paidOn` · `reportedByName` · `evidence[{index,fileName}]` · `kind` · `note`
 * @param order      ใบต้นทางเท่าที่มี — `id` (ใช้ทำลิงก์ไฟล์) · `orderNumber` · `customerName`
 *                   ใบย้อนหลังควรมี `totalAmount` · `approvedByName` · `approvedAt` · `historicalInvoiceRef`
 * @param multi      true = ใบนี้แบ่งหลายงวด ⇒ พาดหัวต้องบอก "งวดที่ n"
 * @param historical งวดของใบสั่งขายย้อนหลัง (ผู้เรียกตัดสินด้วย isHistoricalOrder)
 * @param opening    งวดยกมา — ตั้งต้นอ่านจากแถว (`kind`)
 * @param outlook    ภาพหลังรับรอง `{ paidThrough, collected, next }` จาก `installmentConfirmOutlook`
 *                   (คิดจากงวดทั้งใบ — ทะเบียนประทับมาจากก่อนกรอง) · ไม่ส่ง = ถอยไปใช้ค่าของแถวนี้เอง
 */
export default function InstallmentConfirmDialog({
  open, row, order, multi = false, busy = false, error = "", onClose, onConfirm,
  historical = false, opening = isOpeningInstallment(row), outlook = null,
}) {
  if (!open || !row) return null;
  const label = opening ? OPENING_INSTALLMENT_LABEL : multi ? `งวดที่ ${row.seq}` : (row.label || "ชำระเต็มจำนวน");
  /* "จ่ายถึง" หลังรับรอง — ไม่มีภาพจากงวดทั้งใบก็ถอยไปปลายช่วงครอบของงวดนี้ (ค่าปกติของมันอยู่แล้ว) */
  const through = outlook?.paidThrough || row.coversTo || null;
  const next = outlook?.next || null;
  const prompt = paymentConfirmPrompt({
    label,
    amount: fmtMoney(row.amount),
    historical,
    opening,
    paidThroughLabel: through ? fmtDate(through) : null,
    nextInstallmentLabel: next
      ? [next.label, fmtMoney(next.amount), next.dueDate ? `ครบกำหนด ${fmtDate(next.dueDate)}` : ""].filter(Boolean).join(" ")
      : null,
  });
  const orderTotal = order?.totalAmount ?? row.orderTotal ?? null;
  const collected = outlook ? outlook.collected : Number(row.amount) || 0;
  const invoiceRef = String(order?.historicalInvoiceRef || row.historicalInvoiceRef || "").trim();
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
          {/* ⭐ ใบย้อนหลัง: งานถึงบัญชีต่อเมื่อ AE Sup อนุมัติใบแล้ว — แถวนี้ **บังคับขึ้นเสมอ** (REVISION 2) */}
          {historical ? (
            <>
              <dt>อนุมัติใบ</dt>
              <dd>
                {naText(order?.approvedByName)}
                {order?.approvedAt ? ` · ${fmtDate(order.approvedAt)}` : ""}
                {" · ไม่นับ Actual"}
              </dd>
            </>
          ) : null}
          {/* ⚠️ คงเงื่อนไข falsy ของ `row.percent` ไว้ — งวดที่ไม่มีสัดส่วนต้องไม่โผล่ " · 0.00%" */}
          <dt>งวด</dt><dd>{naText(row.label)}{row.percent ? ` · ${fmtPercent(row.percent)}` : ""}</dd>
          <dt>ยอด</dt><dd className="mono">{fmtMoney(row.amount)}</dd>
          {/* เก็บแล้วรวมงวดนี้ เทียบยอดทั้งใบ — งวดยกมา = เงินทั้งก้อนที่เก็บไปก่อนเข้าระบบ (mock FnConfirm) */}
          {historical ? (
            <>
              <dt>ยอดที่เก็บแล้ว</dt>
              <dd className="mono">
                {fmtMoney(collected)}
                {orderTotal === null ? "" : ` จาก ${fmtMoney(orderTotal)}`}
                {opening ? "" : " (รวมงวดนี้)"}
              </dd>
            </>
          ) : null}
          {/* ⭐ ช่วงบริการที่งวดนี้ครอบ (mig 0320) — **ต้องอยู่ในโมดัลนี้**
              เพราะลายเซ็นของบัญชีคือสิ่งที่ทำให้ค่านี้กลายเป็น "จ่ายถึง" ที่ปล่อยให้ TS
              เข้าไซต์ได้ · ฝ่ายขายกรอกช่วงเองได้ตอนงวดยังไม่รับรอง ⇒ ถ้าโมดัลไม่โชว์
              บัญชีจะรับรองช่วงที่ไม่เคยเห็น (กติกาเดิมของโมดัลนี้: "โชว์หลักฐานก่อนให้กด")
              ⚠️ โผล่เฉพาะงวดที่มีค่า — ใบสายสินค้าไม่มีเรื่องนี้ ไม่ต้องเห็นแถวเปล่า */}
          {row.coversFrom || row.coversTo ? (
            <>
              <dt>ครอบบริการ</dt>
              <dd>
                {row.coversFrom && row.coversTo
                  ? `${fmtDate(row.coversFrom)} – ${fmtDate(row.coversTo)}`
                  : <span className="cell-quiet">ยังกรอกไม่ครบช่วง</span>}
              </dd>
            </>
          ) : null}
          <dt>วันที่ลูกค้าจ่าย</dt>
          <dd>{row.paidOn ? fmtDate(row.paidOn) : <span className="cell-quiet">ไม่ได้ระบุ</span>}</dd>
          <dt>ผู้แจ้ง</dt>
          <dd>{row.reportedByName || <span className="cell-quiet">{NA}</span>}</dd>
          {/* ⭐ ใบกำกับภาษี (mig 0348) — **อ่านอย่างเดียว ไม่มีช่องกรอก** (มติผู้ใช้ 2026-09-07)
              บันทึกใบกำกับเป็นคนละคำสั่งกับการรับรองเงิน เพราะ `confirm` ถอนคืนยาก
              ส่วนเลขพิมพ์ผิดได้ทุกวัน · ที่โชว์ตรงนี้เพราะคนกดควรรู้ว่างวดนี้ออกใบไปหรือยัง */}
          <dt>ใบกำกับภาษี</dt>
          <dd>
            {/* งวดยกมา: ใบกำกับของเงินก้อนนี้ออกในระบบเดิมแล้ว — "ยังไม่ออกใบ" คือคำที่ชวนให้ออกซ้ำ (taxInvoicePending) */}
            {row.taxInvoiceNo
              ? <span className="mono">{row.taxInvoiceNo}{row.taxInvoiceDate ? ` · ${fmtDate(row.taxInvoiceDate)}` : ""}</span>
              : opening
                ? <span className="cell-quiet">{openingInvoiceNote}{invoiceRef ? ` · ${invoiceRef}` : ""}</span>
                : <span className="cell-quiet">ยังไม่ออกใบ — บันทึกได้หลังรับรอง</span>}
          </dd>
          {/* หมายเหตุที่ฝ่ายขายคีย์มากับงวด (≤1,000 ตัวอักษร) — ตัวแสดงข้อความยาวกลาง ว่าง = ขีด */}
          {historical ? <><dt>หมายเหตุจาก SA</dt><dd><ReadableText text={String(row.note || "").trim()} lines={3} /></dd></> : null}
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
          <Button tone="primary" onClick={() => onConfirm(row)} disabled={busy} aria-busy={busy || undefined}>
            {busy ? "กำลังบันทึก…" : prompt.confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
