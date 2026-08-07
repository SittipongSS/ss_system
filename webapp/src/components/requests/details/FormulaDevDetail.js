"use client";
// ── เนื้อหน้ารายละเอียด · พัฒนาสูตร (P4 · ม-34) ──────────────────────────
//
// ⭐ **1 หัวข้อ = 1 component** — ต่างจากพัฒนากลิ่นสี่อย่าง และทุกอย่างอยู่ในไฟล์นี้
// ไม่ใช่เป็น `kind === 'formula_dev'` แทรกกลางหน้าที่ทุกหัวข้อใช้ร่วมกัน:
//
//   1 **ไม่มี PDR** — บรีฟอยู่ในช่อง "รายละเอียด" ของใบและ `spec` รายแถว
//   2 **ไม่มีกระทบยอด SO** — หัวข้อนี้ไม่ผูกใบสั่งขาย (ม-40) ไม่มีตัวเลขให้เทียบ
//   3 **โครงสองชั้น** — คำร้อง → แถว (หมวด × กลิ่น) ไม่มีชั้นบรีฟ
//   4 **ปลายทางคือทะเบียนสูตร** — 1 แถว = สูตร 1 ตัว (`formulas_identity_uk`)
//
// ⚠️ การ์ดรายแถวใช้ `RequestRows` ของกลาง **ห้ามโคลน** (ม-34)
import FormulaDevBoard from "@/components/requests/FormulaDevBoard";
import RequestRows from "./RequestRows";
import styles from "./details.module.css";

// ⚠️ รับก้อนของ **หัวข้อตัวเอง** ตามชื่อ (`formulaBoard`/`formulaTotals`) — เปลือก
// ส่งของทุกหัวข้อมาให้ครบ แล้วแต่ละหัวข้อหยิบของตัวเอง ⇒ เพิ่มหัวข้อใหม่ไม่ต้องแก้เปลือก
export default function FormulaDevDetail({
  request, formulaBoard: board = [], formulaTotals: totals, canEditAttachments,
}) {
  return (
    <>
      <RequestRows rows={request.items || []} canEditAttachments={canEditAttachments} />

      <FormulaDevBoard rows={board} />

      {/* แถบตัวเลข — ชุดเดียวกับที่ตารางข้างบนแสดง (นับที่ lib ก้อนเดียว)
          ⚠️ **สองขั้นที่ค้างโดยไม่มีใครเห็นได้ง่ายที่สุด** คือ "รอลูกค้าตอบ" (รอข้างนอก)
          กับ "รอใส่ราคา" (จบกับลูกค้าแล้วแต่ยังปิดใบไม่ได้) ⇒ ต้องขึ้นเป็นตัวเลข
          ไม่ใช่ให้คนไล่นับจากตารางเอง */}
      {totals.asked > 0 && (
        <div className={styles.summaryBar}>
          <span><strong>{totals.asked}</strong> รายการที่ขอ</span>
          <span><strong>{totals.delivered}</strong> ได้สูตรแล้ว</span>
          {totals.pending > 0 && (
            <span data-tone="warn"><strong>{totals.pending}</strong> ยังไม่ได้ส่ง</span>
          )}
          {totals.waitingCustomer > 0 && (
            <span><strong>{totals.waitingCustomer}</strong> รอลูกค้าตอบ</span>
          )}
          {totals.awaitingPrice > 0 && (
            <span data-tone="warn"><strong>{totals.awaitingPrice}</strong> รอใส่ราคา</span>
          )}
          {totals.revised > 0 && (
            <span><strong>{totals.revised}</strong> ลูกค้าขอให้แก้</span>
          )}
        </div>
      )}
    </>
  );
}
