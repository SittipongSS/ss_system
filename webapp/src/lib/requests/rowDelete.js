// ── ลบรายการในคำร้อง พร้อมของที่มันสร้างไว้ในทะเบียน (มติผู้ใช้ 2026-08-18) ──
//
// ⭐ **1 แถว = 1 direction = กลิ่น 1 ตัว** (กติกาตั้งแต่ mig 0204) ⇒ "ลบรายการนี้"
// กับ "ลบกลิ่นที่รายการนี้สร้าง" เป็นการกระทำเดียวกัน · แยกกันเมื่อไรจะได้ของค้าง:
// ลบเฉพาะกลิ่น = แถวชี้ไปที่ว่าง · ลบเฉพาะแถว = กลิ่นลอยในทะเบียนไม่มีที่มา
//
// 🐞 ที่มา: RD พิมพ์ชื่อ/รหัสผิดตอนกดส่งงาน แล้วไม่มีทางถอย — แก้ได้แต่ชื่อ (ทะเบียน)
// ส่วนแถวในคำร้องลบไม่ได้เลย ⇒ ต้องปล่อยแถวผิดค้างไว้ทั้งใบ
//
// ⚠️ **ลบได้เฉพาะช่วงที่ยังไม่มีใครใช้ผลของมัน** — พอลูกค้าตอบหรือมีราคาออกมาแล้ว
// แถวนั้นเป็นหลักฐาน ไม่ใช่ของที่พิมพ์ผิดอีกต่อไป (ทางออกคือก้าว "ตอบไม่ได้" / ยกเลิกใบ)
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';

export function deleteRequestRowError(request, row) {
  if (!request) return 'ไม่พบคำร้อง';
  if (!row) return 'ไม่พบรายการในคำร้องนี้';
  if (!REQUEST_OPEN_STATUSES.includes(request.status)) {
    return 'คำร้องนี้ไม่ได้เปิดอยู่ — ลบรายการไม่ได้';
  }
  // ผลลัพธ์จากลูกค้า = มีการตัดสินใจของอีกฝั่งผูกอยู่แล้ว
  if (row.outcome) return 'รายการนี้ลูกค้าตอบมาแล้ว ลบไม่ได้ — ใช้ก้าวของแถวแทน';
  // ราคาที่ตอบไปแล้วเข้าไปอยู่ในทะเบียนราคากลาง (rev ของวัสดุ) ⇒ ถอยไม่ได้
  if (row.answeredRevisionId) return 'รายการนี้ตอบราคาไปแล้ว ลบไม่ได้';
  if (row.answerStatus === 'done' || row.answerStatus === 'declined') {
    return 'รายการนี้ปิดไปแล้ว ลบไม่ได้';
  }
  // แถวที่มีรอบแก้ต่อยอดอยู่ — ลบตัวต้นทางแล้วรอบแก้จะกลายเป็นลูกกำพร้า
  const children = (request.items || []).filter((i) => i?.derivedFromItemId === row.id);
  if (children.length) {
    return `รายการนี้มีรอบแก้ต่อจากมันอยู่ ${children.length} รายการ — ลบรอบแก้ก่อน`;
  }
  return null;
}

/** ของในทะเบียนที่แถวนี้เป็นคนสร้าง — ลบตามไปด้วยเมื่อยังไม่มีใครอ้างต่อ */
export function registryOwnedByRow(row) {
  if (!row) return null;
  if (row.producedScentId) return { kind: 'scent', id: row.producedScentId };
  if (row.producedFormulaId) return { kind: 'formula', id: row.producedFormulaId };
  return null;
}
