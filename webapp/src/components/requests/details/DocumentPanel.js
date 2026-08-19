"use client";
// ── การ์ด panel รายหัวข้อ · ขอเอกสาร (ม-94) ──────────────────────────────
//
// ⭐ หัวข้อนี้ก้าวจริงอยู่ **รายแถว** (ส่งเอกสาร/ปฏิเสธ ที่ท้ายเธรด) — panel จึง
// ไม่มีปุ่มของตัวเอง แต่ตอบสองคำถามที่การ์ด control กลางตอบไม่ได้:
//   1 "เหลือแถวไหนรอมือใคร" — เช็คลิสต์รายแถว (ผู้ตอบเห็นงานตัวเอง ผู้ขอเห็นความคืบ)
//   2 "ใบนี้ของงานไหน" — อ้างอิง QT/SO/FG ที่ **ย้าย**มาจากแถบบนหน้า (ไม่ก๊อป —
//     บทเรียนรางขวารุ่นแรก: ของซ้ำสองที่คือเหตุที่มันถูกยุบ)
//
// ⚠️ ตัวเลข/สถานะนับที่ lib ก้อนเดิม (docBoard · docTotals) — ที่นี่แค่เปลี่ยนที่วาง
import {
  DocumentSummaryCard, RelatedDocumentCard,
} from "@/components/ui/DocumentControlPanel";
import styles from "./details.module.css";

export default function DocumentPanel({ request, docTotals: totals }) {
  // ⚠️ **ยอดที่ขอวางบิลย้ายไป `BillingDocPanel` แล้ว** (ม-96) — การ์ดนี้เหลือของ RD
  // ล้วน · เอากลับมาเมื่อไรจะได้ยอดสองที่ที่ต้องคอยดูแลให้ตรงกัน

  // อ้างอิงของหัวข้อนี้ (ม-88) — โชว์เฉพาะตัวที่อ้างจริง · ตามกลับไม่เจอ = ใบถูกลบ
  const refs = [
    request.quotationId && {
      label: "ใบเสนอราคา",
      value: request.refQuotation?.quoteNumber || "ถูกลบไปแล้ว",
      href: request.refQuotation ? `/sales-planning/quotations/${request.quotationId}` : null,
    },
    request.salesOrderId && {
      label: "ใบสั่งขาย",
      value: request.refSalesOrder?.orderNumber || "ถูกลบไปแล้ว",
      href: request.refSalesOrder ? `/sales-planning/sales-orders/${request.salesOrderId}` : null,
    },
    ...(Array.isArray(request.productRefs) && request.productRefs.length
      ? request.productRefs.map((fg, i) => ({
        label: i === 0 ? "สินค้า (FG)" : "",
        value: fg.label || fg.id,
        href: null,
      }))
      : (request.productId ? [{
        label: "สินค้า (FG)",
        value: request.productName || request.productId,
        href: null,
      }] : [])),
  ].filter(Boolean);

  return (
    <>
      {/* ⚠️ **ไม่มีเช็คลิสต์รายแถวในแผงนี้แล้ว** (มติผู้ใช้ 2026-08-20) — ตารางกลางหน้า
          ไล่แถวเดียวกันพร้อมสถานะ เลขที่เอกสาร และก้าวถัดไปอยู่แล้ว ⇒ แผงขวาเหลือ
          **ตัวเลขสรุป** ซึ่งเป็นสิ่งที่ตารางตอบไม่ได้ในสายตาเดียว */}
      {totals.asked > 0 && (
        <DocumentSummaryCard
          title="สรุปใบนี้"
          rows={[
            // ⚠️ **คำเดียวกับป้ายขั้นของแถว** (ม-120) — เดิมการ์ดนับว่า "มาแล้ว"
            // ส่วนแถวในตารางเดียวกันเขียน "ได้รับแล้ว" ⇒ ตัวเลขกับแถวพูดคนละคำ
            { id: "received", label: "ได้รับแล้ว", value: String(totals.received) },
            { id: "waiting", label: "รอเอกสาร", value: String(totals.waiting) },
            // "ปฏิเสธ" แยกจาก "ได้รับแล้ว" เสมอ (ม-89) — จบเหมือนกันแต่คนละความหมาย
            { id: "refused", label: "ปฏิเสธ", value: String(totals.refused) },
            { id: "asked", label: "จากที่ขอ", value: String(totals.asked) },
          ]}
        />
      )}
      {refs.length > 0 && (
        <RelatedDocumentCard eyebrow="อ้างอิงของใบนี้" title="เอกสารที่เกี่ยวข้อง">
          {refs.map((ref, i) => (
            <p key={`${ref.label}-${i}`} className={styles.panelRef}>
              {ref.label && <span className={styles.panelRefLabel}>{ref.label} </span>}
              {ref.href
                ? <a className="linklike" href={ref.href}><strong>{ref.value}</strong></a>
                : <strong>{ref.value}</strong>}
            </p>
          ))}
        </RelatedDocumentCard>
      )}
    </>
  );
}
