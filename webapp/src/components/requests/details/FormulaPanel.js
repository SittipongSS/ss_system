"use client";
// ── การ์ด panel รายหัวข้อ · พัฒนาสูตร (ม-94) ─────────────────────────────
//
// ⭐ การ์ดสรุปตัวเลขของใบ — **ย้าย**มาจากแถบตัวเลขท้ายตาราง (FormulaDevDetail)
// ไม่ก๊อป: สองขั้นที่ค้างโดยไม่มีใครเห็นได้ง่ายที่สุด ("รอลูกค้าตอบ" กับ
// "รอใส่ราคา") ต้องขึ้นเป็นตัวเลข ไม่ใช่ให้คนไล่นับจากตารางเอง
//
// ⚠️ ตัวเลขนับที่ `lib/requests/formulaDevBoard.js` (formulaTotals) ก้อนเดิม —
// ที่นี่แค่เปลี่ยนที่วาง · ปุ่มรายแถวอยู่ในตารางสรุปทั้งใบ ปุ่มระดับใบอยู่การ์ด
// control กลาง — การ์ดนี้ไม่มีปุ่ม
import { DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";

export default function FormulaPanel({ formulaTotals: totals }) {
  if (!totals || !totals.asked) return null;
  return (
    <DocumentSummaryCard
      title="สรุปใบนี้"
      rows={[
        { id: "asked", label: "รายการที่ขอ", value: String(totals.asked) },
        { id: "delivered", label: "ได้สูตรแล้ว", value: String(totals.delivered) },
        { id: "pending", label: "ยังไม่ได้ส่ง", value: String(totals.pending) },
        { id: "waiting", label: "รอลูกค้าตอบ", value: String(totals.waitingCustomer) },
        { id: "price", label: "รอใส่ราคา", value: String(totals.awaitingPrice) },
        { id: "revised", label: "ลูกค้าขอให้แก้", value: String(totals.revised) },
      ]}
    />
  );
}
