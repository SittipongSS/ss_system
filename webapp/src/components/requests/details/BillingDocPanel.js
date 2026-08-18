"use client";
// ── การ์ด panel รายหัวข้อ · ขอเอกสารการเงิน (ม-96) ───────────────────────
//
// ⭐ **แยกจาก `DocumentPanel` ของ RD โดยตั้งใจ** — ต่างจากกติกา ม-56 ที่ให้ใช้
// `DocumentDetail` ตัวเดียวกันทั้งสองฝ่าย เพราะสองอย่างนี้ตอบคนละคำถาม:
//   · **เนื้อกลางหน้า** = "บรรทัดเดินถึงไหน" — กฎของบรรทัดเหมือนกันทุกข้อ ⇒ จอเดียว
//   · **panel** = "คนที่เปิดใบนี้ต้องใช้อะไรถึงจะลงมือได้" — RD ไปหยิบไฟล์จากทะเบียน
//     ส่วนบัญชี **ต้องออกเอกสารจากระบบบัญชี** ⇒ ต้องการตัวตนสำหรับออกบิล ซึ่ง RD
//     ไม่มีวันใช้ · ยัดรวมกันแล้วใส่ `if (dept === 'FN')` คือทางที่ drift เริ่มเดิน
//
// ลำดับการ์ด = ลำดับคำถามของคนออกบิล:
//   ขอเท่าไร → ออกให้ใคร → ออกไปแล้วกี่ใบ เลขอะไร → เงินก้อนนี้อยู่งวดไหน → อ้างอิง
import {
  DocumentReadinessList, DocumentSummaryCard, RelatedDocumentCard,
} from "@/components/ui/DocumentControlPanel";
import { fmtDate, fmtNumber, naText } from "@/lib/format";
import { INSTALLMENT_STATUS_LABELS } from "@/lib/sales/salesOrderPayments";
import styles from "./details.module.css";

const baht = (v) => `${fmtNumber(v, { maximumFractionDigits: 3 })} บาท`;

export default function BillingDocPanel({ request, docBoard: board = [], docTotals: totals }) {
  const qt = request.refQuotation || null;
  const inst = request.linkedInstallment || null;

  /* ⭐ **ยอดที่ขอ** (0257) — คำถามแรกของคนออกบิลเสมอ ⇒ การ์ดบนสุด
     ⚠️ โชว์ทั้ง % และฐาน — ยอดลอย ๆ ตอบไม่ได้ว่า 51,385.68 มาจาก 50% ของอะไร */
  const billRows = Number(request.billAmount) > 0 ? [
    { id: "amount", label: "ยอดที่ขอ", value: baht(request.billAmount) },
    ...(Number(request.billPercent) > 0
      ? [{ id: "percent", label: "สัดส่วน", value: `${fmtNumber(request.billPercent, { maximumFractionDigits: 3 })}%` }]
      : []),
    ...(Number(request.billBaseAmount) > 0
      ? [{ id: "base", label: "ยอดเต็มตามใบ", value: baht(request.billBaseAmount) }]
      : []),
  ] : [];

  /* ⭐ **ออกบิลถึงใคร** (ม-96) — อ่านจาก **ใบเสนอราคา** ไม่ใช่ทะเบียนลูกค้า
     QT เป็น snapshot ที่ลูกค้ารับแล้ว ส่วนทะเบียนแก้ทีหลังได้ ⇒ ออกบิลตามทะเบียน
     วันนี้อาจไม่ตรงกับที่ตกลงกันไว้
     ⚠️ ช่องที่ว่างต้องขึ้น "—" ไม่ใช่หายไป — บัญชีต้องเห็นว่า *ไม่มีข้อมูล* ต่างจาก
     *ยังไม่ได้เลื่อนดู* (ที่อยู่ออกบิลว่าง = ต้องไปถาม ไม่ใช่ออกบิลไปเลย) */
  const billToRows = qt ? [
    { id: "name", label: "ออกบิลในนาม", value: naText(qt.customerName || request.customerName) },
    { id: "tax", label: "เลขผู้เสียภาษี", value: naText(qt.customerTaxId) },
    { id: "branch", label: "สาขา", value: naText(qt.branchCode) },
    { id: "addr", label: "ที่อยู่ออกบิล", value: naText(qt.billingAddress) },
  ] : [];

  /* เช็คลิสต์รายแถว — ✓ = จบแล้ว (ออกให้แล้ว/ให้ไม่ได้)
     ⭐ **โชว์เลขที่เอกสารตรงนี้ด้วย** (0258) — สิ่งที่ผู้ขอเอาไปคุยกับลูกค้าคือเลข
     ใบวางบิล ไม่ใช่ชื่อชนิดเอกสาร ⇒ เลขต้องอยู่ในบรรทัดเดียวกับชื่อ */
  const items = board.map((row) => ({
    id: row.id,
    label: row.name,
    detail: [
      row.docNumber || null,
      row.docDueDate ? `ครบกำหนด ${fmtDate(row.docDueDate)}` : null,
      row.docNumber ? null : row.stageLabel,
    ].filter(Boolean).join(" · "),
    ready: row.received || row.refused,
  }));

  return (
    <>
      {billRows.length > 0 && (
        <DocumentSummaryCard title="ยอดที่ขอวางบิล" rows={billRows} />
      )}

      {billToRows.length > 0 && (
        <DocumentSummaryCard title="ออกบิลถึงใคร" rows={billToRows} />
      )}

      {totals.asked > 0 && (
        <DocumentSummaryCard
          title="เอกสารที่ขอ"
          rows={[
            // ⚠️ คำของฝ่ายบัญชี ไม่ใช่ของ RD — "ออกให้แล้ว/ให้ไม่ได้" ตรงกับสิ่งที่เขาทำ
            { id: "issued", label: "ออกให้แล้ว", value: String(totals.received) },
            { id: "waiting", label: "รอออก", value: String(totals.waiting) },
            { id: "refused", label: "ออกให้ไม่ได้", value: String(totals.refused) },
            { id: "asked", label: "จากที่ขอ", value: String(totals.asked) },
          ]}
        >
          <DocumentReadinessList items={items} label="เอกสารในใบนี้" />
        </DocumentSummaryCard>
      )}

      {/* ⭐ **ฝั่งกลับของ B-5** — เดิมลิงก์เดินทางเดียว (จากใบสั่งขายเห็นคำร้อง)
          ⇒ บัญชีที่เปิดใบจากคิวไม่รู้ว่าเงินก้อนนี้อยู่งวดไหนของใบไหน
          ⚠️ ไม่มี = "ยังไม่ผูกงวด" ซึ่งถูกต้องเสมอ ไม่ใช่ข้อมูลขาด (0260: ผูกก็ได้
          ไม่ผูกก็ได้ — บางใบขอเอกสารโดยไม่มีงวดรออยู่เลย) */}
      {inst && (
        <RelatedDocumentCard eyebrow="เงินก้อนนี้อยู่ที่ไหน" title="งวดชำระที่ผูกไว้">
          <p className={styles.panelRef}>
            <span className={styles.panelRefLabel}>ใบสั่งขาย </span>
            <a className="linklike" href={`/sa/sales-orders/${inst.salesOrderId}`}>
              <strong>{inst.orderNumber || inst.salesOrderId}</strong>
            </a>
          </p>
          <p className={styles.panelRef}>
            <span className={styles.panelRefLabel}>งวด </span>
            <strong>{inst.label || `งวดที่ ${inst.seq}`}</strong>
            {` · ${baht(inst.amount)}`}
            {inst.dueDate ? ` · ครบกำหนด ${fmtDate(inst.dueDate)}` : ""}
          </p>
          <p className={styles.panelRef}>
            <span className={styles.panelRefLabel}>สถานะงวด </span>
            <strong>{INSTALLMENT_STATUS_LABELS[inst.status] || inst.status}</strong>
          </p>
        </RelatedDocumentCard>
      )}

      {/* 📌 การ์ด "อ้างอิงของใบนี้" (ใบเสนอราคา + ใบสั่งขาย) ถูกยุบขึ้นไปอยู่แถวบริบท
          ใต้หัวใบแล้ว (มติผู้ใช้ 2026-08-18) — ที่นั่นมีลูกค้า/โครงการ/ดีลอยู่ก่อนแล้ว
          และใบสั่งขายเคยโผล่ซ้ำทั้งสองที่ · แผงนี้เหลือเฉพาะเรื่องเงินของใบวางบิล */
      }
    </>
  );
}
