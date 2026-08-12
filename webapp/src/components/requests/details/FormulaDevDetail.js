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
import { RowStepActions } from "@/components/requests/NextStepBar";
import RequestRows from "./RequestRows";

// ⚠️ รับก้อนของ **หัวข้อตัวเอง** ตามชื่อ (`formulaBoard`/`formulaTotals`) — เปลือก
// ส่งของทุกหัวข้อมาให้ครบ แล้วแต่ละหัวข้อหยิบของตัวเอง ⇒ เพิ่มหัวข้อใหม่ไม่ต้องแก้เปลือก
export default function FormulaDevDetail({
  request, formulaBoard: board = [], canEditAttachments,
  rowStep,
}) {
  // ปุ่มก้าวติดแถวในตาราง (ม-94 — มติเดียวกับสายเอกสาร: "ก้าวถัดไปในรายการ")
  // แถวของ board ชี้กลับ item ดิบด้วย id — RowStepActions ต้องอ่านช่องก้าวจริง
  const itemsById = new Map((request.items || []).map((it) => [it.id, it]));
  const renderStep = rowStep
    ? (boardRow) => {
      const item = itemsById.get(boardRow.id);
      return item ? <RowStepActions row={item} {...rowStep} /> : null;
    }
    : null;
  return (
    <>
      {/* 🐞 **เคยมี `RequestRows` ยืนเดี่ยวตรงนี้เหนือตาราง** ⇒ ไล่แถวชุดเดียวกันสองรอบ
          ชื่อกลิ่นและป้ายสถานะโผล่ซ้ำ (IS-26080021 — อาการเดียวกับสายกลิ่นเป๊ะ)
          ⇒ ย้ายเข้าไปเป็นเนื้อของแถวที่กางได้ ไม่ใช่ก้อนแยกข้างบน */}
      <FormulaDevBoard
        rows={board}
        renderStep={renderStep}
        renderDetail={(boardRow) => {
          const item = itemsById.get(boardRow.id);
          return item
            ? <RequestRows bare rows={[item]} canEditAttachments={canEditAttachments} />
            : null;
        }}
      />

      {/* ⚠️ แถบตัวเลข **ย้ายไปการ์ด panel ขวา** (ม-94 — FormulaPanel) — โครง
          หัวข้อนี้เปิดธง detailControlPanel · ห้ามวาดซ้ำที่นี่อีก */}
    </>
  );
}
