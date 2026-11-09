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
import Link from "next/link";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import DocumentBoard from "@/components/requests/DocumentBoard";
import { RowStepActions } from "@/components/requests/NextStepBar";
import { docLineFileTarget } from "@/lib/requests/productDocLines";
import RequestRows from "./RequestRows";

// ⚠️ รับก้อนของ **หัวข้อตัวเอง** ตามชื่อ — เหตุผลเดียวกับ FormulaDevDetail
// (เปลือกส่ง `canEditAttachments` มาให้เหมือนทุกหัวข้อ แต่หัวข้อนี้จงใจไม่รับ —
// สิทธิ์แนบของสายเอกสารถูกโมดัลส่งเอกสารถืออยู่คนเดียว)
export default function DocumentDetail({
  request, docBoard: board = [],
  rowStep, today = null, due = null,
}) {
  // ปุ่มก้าวติดแถว (มติผู้ใช้ 2026-08-09) — แถวของ board ชี้กลับ item ดิบด้วย id
  // (RowStepActions ต้องอ่าน lineKind/ช่องก้าวจริง ไม่ใช่แถวสรุป)
  const itemsById = new Map((request.items || []).map((it) => [it.id, it]));
  const renderStep = rowStep
    ? (boardRow) => {
      const item = itemsById.get(boardRow.id);
      return item ? <RowStepActions row={item} {...rowStep} /> : null;
    }
    : null;
  return (
    <>
      {/* ⚠️ แถบอ้างอิง QT/SO/FG กับแถบตัวเลข **ย้ายไปการ์ด panel ขวา** (ม-94 —
          DocumentPanel) — การ์ดจัดการมีทุกหัวข้อแล้ว (ม-123) · ห้ามวาดซ้ำ
          ที่นี่อีก (บทเรียนรางขวารุ่นแรก: ของซ้ำสองที่คือเหตุที่มันถูกยุบ) */}
      {/* ⭐ **ตารางเดียวจบ** (มติผู้ใช้ 2026-08-20: *"ทำไมต้องแยกสองส่วน รวมได้มั้ย
          ให้ดูง่าย ๆ เอาเป็น table ก็ได้"*)
          🐞 ของเดิมมีสองก้อน: ตาราง "เอกสารที่ขอ" แล้วตามด้วยการ์ด `RequestRows` ที่ไล่
          แถวชุดเดิมอีกรอบ ⇒ ชนิดเอกสาร + ป้ายสถานะโผล่สองที่ในจอเดียว และไฟล์อยู่ไกล
          จากแถวของมัน · อาการเดียวกับ IS-26080021 ที่หน้าพัฒนากลิ่นแก้ไปแล้ว
          ⇒ ไฟล์ของแถวย้ายเข้า **แถวขยายในตาราง** (`renderDetail` · โหมด `bare` ของ
          `RequestRows` ก้อนกลาง — ห้ามโคลนการ์ด · ม-34)
          ⚠️ ดูอย่างเดียว: แนบ/ลบทำในโมดัลส่งงานที่เดียว (ม-90) */}
      <DocumentBoard
        today={today}
        due={due}
        rows={board}
        renderStep={renderStep}
        renderDetail={(boardRow) => {
          const item = itemsById.get(boardRow.id);
          /* ⭐ บรรทัด MSDS / Spec Sheet ที่ผูก FG (mig 0428 · ศูนย์กลางเอกสารของสินค้า P2b) — ไฟล์อยู่ที่ **สินค้า**
             ⇒ โชว์ไฟล์ปัจจุบันของ FG ชนิดนั้น (อ่านอย่างเดียว เหมือนการ์ดเดิม) + ทางไปหน้าสินค้า */
          /* + P3: บรรทัด IFRA ที่ผูกกลิ่น = ไฟล์ของกลิ่น (ตัวตัดสินเดียวกัน `docLineFileTarget`) */
          const target = item ? docLineFileTarget(item) : null;
          if (target) {
            const isScent = target.entityType === "scent";
            return (
              <div>
                <AttachmentsPanel
                  entityType={target.entityType}
                  entityId={target.entityId}
                  canEdit={false}
                  docTypes={[{ key: target.docType, label: target.label }]}
                  title={`${target.label} ของ${isScent ? "กลิ่น (เก็บที่กลิ่น)" : " FG (เก็บที่สินค้า)"}`}
                  note={isScent
                    ? 'RD แนบไฟล์ตอนกด "ส่งงาน" — ไฟล์อยู่ที่หน้ากลิ่น (ฉบับล่าสุดของกลิ่น)'
                    : 'RD แนบไฟล์ตอนกด "ส่งงาน" — ไฟล์อยู่ที่แท็บเอกสารของสินค้า (ฉบับล่าสุดของ FG)'}
                  cardColumns={1}
                />
                <Link
                  href={isScent ? `/database/scents/${encodeURIComponent(target.entityId)}` : `/database/products/${encodeURIComponent(target.entityId)}`}
                  className="linklike"
                >
                  {isScent ? "เปิดหน้ากลิ่น" : "เปิดหน้าสินค้า"}
                </Link>
              </div>
            );
          }
          return item ? (
            <RequestRows
              bare
              rows={[item]}
              canEditAttachments={false}
              attachLabel="ไฟล์เอกสารของรายการนี้"
              /* ⚠️ ชื่อปุ่มในประโยคต้องตรงกับปุ่มจริง — ก้าวส่งชื่อ "ส่งงาน" ทุกสายแล้ว (ม-120) */
              /* ⚠️ ประโยคนี้ต้องบอก **ทางแก้ตอนแนบผิด** ด้วย (มติผู้ใช้ 2026-08-20) —
                 การ์ดนี้อ่านอย่างเดียว คนที่เพิ่งเห็นว่าไฟล์ผิดจะมองหาปุ่มลบตรงนี้ก่อน */
              attachHint={'ฝ่ายแนบไฟล์ตอนกด "ส่งงาน" ที่แถบก้าวถัดไป — แนบที่นั่นที่เดียว · แนบผิดให้ฝ่ายกด "ดึงกลับ" แล้วลบ/แนบใหม่ในหน้าต่างเดิม'}
            />
          ) : null;
        }}
      />
    </>
  );
}
