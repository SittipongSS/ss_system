"use client";
// ── การ์ด "สรุปใบนี้" — ทรงเดียวทุกหัวข้อ (มติผู้ใช้ 2026-08-25) ──────────
//
// 🐞 **ของเดิม: หัวข้อละทรง** — พัฒนากลิ่น 6 ตัวเลข + ป้ายกระทบยอด + เช็คลิสต์ ·
// พัฒนาสูตร 6 ตัวเลขคนละชุด · ขอเอกสาร 4 · ขอใบวางบิล 4 คนละคำอีกชุด ⇒ คนที่ดูใบ
// สองหัวข้อในวันเดียวกันต้องเรียนรู้การ์ดใหม่ทุกครั้ง และไม่มีตัวเลขไหนอยู่ตำแหน่งเดิม
// ให้กวาดตาข้าม
//
// ⭐ **ทรงเดียว** — ตัวเลขนำ (จบแล้ว/ทั้งหมด) + แกนสามแถว (รอ<ฝ่าย> · รอ<ผู้ขอ> ·
// ไม่ถูกเลือก) · ของเฉพาะหัวข้อลงก้อนล่างผ่าน `children` ไม่ปนกับแกนร่วม
//
// ⚠️ **ตัวเลขนับที่ `lib/requests/panelSummary.js` ที่เดียว** — ที่นี่วาดอย่างเดียว
// (กฎเดียวกับตารางสรุป: ประกอบตัวเลขใน JSX เมื่อไร CI มองไม่เห็น แล้วผู้ใช้เจอเอง)
import { DocumentSummaryCard } from "@/components/ui/DocumentControlPanel";
import { requestPanelSummary } from "@/lib/requests/panelSummary";

export default function RequestSummaryPanel({
  request, lineShape = null, status, statusColor, statusLabel, children = null,
}) {
  const summary = requestPanelSummary(request, lineShape);
  // ยังไม่มีบรรทัด = ไม่มีอะไรให้นับ · ของเฉพาะหัวข้อยังต้องขึ้นได้เอง
  if (!summary) return children;
  return (
    <DocumentSummaryCard
      title="สรุปใบนี้"
      total={`${summary.lead.done} / ${summary.lead.total}`}
      totalCaption={summary.lead.caption}
      totalComplete={summary.lead.complete}
      /* ⚠️ ค่าเป็นสตริงเสมอ — `naText` ของการ์ดถือว่า 0 เป็นค่าว่างแล้วขึ้นขีด
         ⇒ แถว "รอ RD 0" จะกลายเป็น "รอ RD —" ซึ่งอ่านว่าไม่รู้ ไม่ใช่ไม่มี */
      rows={summary.rows.map((r) => ({ ...r, value: String(r.value), zero: r.value === 0 }))}
      status={status}
      statusColor={statusColor}
      statusLabel={statusLabel}
    >
      {children}
    </DocumentSummaryCard>
  );
}
