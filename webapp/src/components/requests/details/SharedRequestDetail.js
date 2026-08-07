"use client";
// ── เนื้อหน้ารายละเอียด · หัวข้อที่ยังไม่มีจอของตัวเอง (P3b) ─────────────
//
// ⭐ ค่าตั้งต้นของทะเบียน — หัวข้อที่มีบรรทัดได้การ์ดรายแถว หัวข้อที่ไม่มีบรรทัด
// (สอบถามข้อมูล · ติดตามของเข้า) ได้ **เธรดล้วน** ซึ่งถูกต้องตามธรรมชาติของมัน
//
// ⚠️ ตัวนี้ไม่ใช่ "ที่รวมของทุกหัวข้อ" — หัวข้อที่มีเงื่อนไขของตัวเองต้องมีไฟล์ของ
// ตัวเอง (ม-34) · ยัดเงื่อนไขรายหัวข้อลงที่นี่เมื่อไรก็กลับไปเป็นก้อนเดียวที่เพิ่งแยก
import RequestRows from "./RequestRows";

export default function SharedRequestDetail({ request, canEditAttachments }) {
  const rows = request.items || [];
  if (!rows.length) return null;
  return <RequestRows rows={rows} canEditAttachments={canEditAttachments} />;
}
