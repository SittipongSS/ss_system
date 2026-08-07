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
// ⚠️ ไฟล์จริงแนบที่การ์ดรายแถว (`RequestRows`) — ที่นี่เป็นสรุป ไม่ใช่ที่เก็บไฟล์
import DocumentBoard from "@/components/requests/DocumentBoard";
import RequestRows from "./RequestRows";
import styles from "./details.module.css";

// ⚠️ รับก้อนของ **หัวข้อตัวเอง** ตามชื่อ — เหตุผลเดียวกับ FormulaDevDetail
export default function DocumentDetail({
  request, docBoard: board = [], docTotals: totals, canEditAttachments,
}) {
  return (
    <>
      {/* ⭐ **แถบตัวเลขขึ้นก่อนตาราง** — คำถามแรกของคนเปิดใบนี้คือ "ยังขาดอะไร"
          ⚠️ ตัวเลขนี้เป็นไปไม่ได้ถ้าไม่รู้จักของที่ยังไม่มา — นับจากไฟล์แนบอย่างเดียว
          จะได้ 100% เสมอ เพราะของที่ยังไม่มาไม่มีตัวตน (เหตุผลที่บรรทัดขอเอกสารมีอยู่) */}
      {totals.asked > 0 && (
        <div className={styles.summaryBar}>
          <span><strong>{totals.received}</strong> มาแล้ว</span>
          {totals.waiting > 0 && (
            <span data-tone="warn"><strong>{totals.waiting}</strong> รอเอกสาร</span>
          )}
          {/* ⚠️ "ให้ไม่ได้" แยกจาก "มาแล้ว" เสมอ — จบเหมือนกันแต่คนละความหมาย */}
          {totals.refused > 0 && (
            <span data-tone="danger"><strong>{totals.refused}</strong> ให้ไม่ได้</span>
          )}
          <span>จากที่ขอ <strong>{totals.asked}</strong> รายการ</span>
        </div>
      )}

      <DocumentBoard rows={board} />

      {/* การ์ดรายแถว — ที่ที่ไฟล์จริงเกาะอยู่ (ของกลาง ห้ามโคลน · ม-34) */}
      <RequestRows rows={request.items || []} canEditAttachments={canEditAttachments} />
    </>
  );
}
