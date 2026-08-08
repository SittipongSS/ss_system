"use client";
// ── เนื้อหน้ารายละเอียด · ขอเอกสาร (P5 · ม-34) ───────────────────────────
//
// ⭐ **คำถามของหัวข้อนี้ต่างจากสองหัวข้อพัฒนา** — พัฒนากลิ่น/สูตรถามว่า "ของออกมา
// หรือยัง" ส่วนขอเอกสารถามว่า **"ได้ไฟล์แล้วกี่ชิ้น ยังขาดอะไร"**
// ⇒ หน้านี้เอา **แถบมาแล้ว/รอ** ขึ้นก่อนตาราง และ **เรียงของที่ยังไม่มาไว้บนสุด**
//
// ⚠️ **ของกลาง ใช้ได้ทั้ง RD และบัญชี** — ชุดคำศัพท์ต่างกัน (IFRA/COA/MSDS vs
// ใบวางบิล/ใบกำกับ) แต่กฎของบรรทัดเหมือนกันทุกข้อ ⇒ component เดียว
//
// ⚠️ **ไฟล์เอกสารแนบที่โมดัล "ส่งเอกสาร" ทางเดียว** (ม-90: "flow การส่งเอกสาร
// ต้องเป็นแบบเดียว กันการสับสน") — การ์ดรายแถวที่นี่จึงเป็นที่ *ดู/โหลด* ไฟล์
// อย่างเดียว ต่างจากสายพัฒนาที่ผู้ขอแนบรูปอ้างอิงบนการ์ดได้ เพราะไฟล์ของสายนี้
// คือ *ของที่ฝ่ายส่ง* ไม่ใช่ *ของประกอบที่ผู้ขอแปะ*
import DocumentBoard from "@/components/requests/DocumentBoard";
import RequestRows from "./RequestRows";
import styles from "./details.module.css";

// ⚠️ รับก้อนของ **หัวข้อตัวเอง** ตามชื่อ — เหตุผลเดียวกับ FormulaDevDetail
// (เปลือกส่ง `canEditAttachments` มาให้เหมือนทุกหัวข้อ แต่หัวข้อนี้จงใจไม่รับ —
// สิทธิ์แนบของสายเอกสารถูกโมดัลส่งเอกสารถืออยู่คนเดียว)
export default function DocumentDetail({
  request, docBoard: board = [], docTotals: totals,
}) {
  // อ้างอิงเพิ่มของใบ (ม-88) — โชว์เฉพาะตัวที่อ้างจริง · ตามกลับไม่เจอ = ใบถูกลบ
  const refs = [
    request.quotationId && {
      key: "qt",
      label: "ใบเสนอราคา",
      value: request.refQuotation?.quoteNumber || "ใบเสนอราคาถูกลบไปแล้ว",
      href: request.refQuotation ? `/sales-planning/quotations/${request.quotationId}` : null,
    },
    request.salesOrderId && {
      key: "so",
      label: "ใบสั่งขาย",
      value: request.refSalesOrder?.orderNumber || "ใบสั่งขายถูกลบไปแล้ว",
      href: request.refSalesOrder ? `/sales-planning/sales-orders/${request.salesOrderId}` : null,
    },
    // FG หลายรายการ (ม-89) — snapshot จาก productRefs · ใบเก่าที่มีแต่ช่องเดี่ยว
    // ยังอ่านได้จาก productId/productName
    ...(Array.isArray(request.productRefs) && request.productRefs.length
      ? request.productRefs.map((fg, i) => ({
        key: `fg-${fg.id || i}`,
        label: i === 0 ? "สินค้า (FG)" : "",
        value: fg.label || fg.id,
        href: null,
      }))
      : (request.productId ? [{
        key: "fg",
        label: "สินค้า (FG)",
        value: request.productName || request.productId,
        href: null,
      }] : [])),
  ].filter(Boolean);

  return (
    <>
      {/* ⭐ แถวอ้างอิง QT · SO · FG (ม-88) — "เอกสารใบนี้ของงานไหน" ต้องตามกลับได้
          จากในใบ ไม่ใช่ต้องไปค้นเองว่าเลขที่ที่พิมพ์ไว้ในรายละเอียดคือใบไหน */}
      {refs.length > 0 && (
        <div className={styles.summaryBar}>
          {refs.map((ref) => (
            <span key={ref.key}>
              {ref.label}{" "}
              {ref.href
                ? <a className="linklike" href={ref.href}><strong>{ref.value}</strong></a>
                : <strong>{ref.value}</strong>}
            </span>
          ))}
        </div>
      )}
      {/* ⭐ **แถบตัวเลขขึ้นก่อนตาราง** — คำถามแรกของคนเปิดใบนี้คือ "ยังขาดอะไร"
          ⚠️ ตัวเลขนี้เป็นไปไม่ได้ถ้าไม่รู้จักของที่ยังไม่มา — นับจากไฟล์แนบอย่างเดียว
          จะได้ 100% เสมอ เพราะของที่ยังไม่มาไม่มีตัวตน (เหตุผลที่บรรทัดขอเอกสารมีอยู่) */}
      {totals.asked > 0 && (
        <div className={styles.summaryBar}>
          <span><strong>{totals.received}</strong> มาแล้ว</span>
          {totals.waiting > 0 && (
            <span data-tone="warn"><strong>{totals.waiting}</strong> รอเอกสาร</span>
          )}
          {/* ⚠️ "ปฏิเสธ" (คำตาม ม-89) แยกจาก "มาแล้ว" เสมอ — จบเหมือนกันแต่คนละความหมาย */}
          {totals.refused > 0 && (
            <span data-tone="danger"><strong>{totals.refused}</strong> ปฏิเสธ</span>
          )}
          <span>จากที่ขอ <strong>{totals.asked}</strong> รายการ</span>
        </div>
      )}

      <DocumentBoard rows={board} />

      {/* การ์ดรายแถว (ของกลาง ห้ามโคลน · ม-34) — โหมดดูอย่างเดียว: แนบ/ลบทำใน
          โมดัลส่งเอกสารที่เดียว (ม-90) ที่นี่เหลือหน้าที่เปิดดู/ดาวน์โหลดไฟล์ที่ส่งแล้ว */}
      <RequestRows
        rows={request.items || []}
        canEditAttachments={false}
        attachLabel="ไฟล์เอกสารของรายการนี้"
        attachHint={'ฝ่ายแนบไฟล์ตอนกด "ส่งเอกสาร" ที่แถบก้าวถัดไป — แนบที่นั่นที่เดียว'}
      />
    </>
  );
}
