// สถานะอนุมัติของ master data (ลูกค้า/สินค้า — mig 0027) ในรูปที่ **ฝั่ง server
// อ่านได้ด้วย** — ตัวเดิมอยู่ใน components/ApprovalStatus.js ซึ่งเป็นโมดูล
// "use client" ⇒ route ฝั่ง server import ไม่ได้ (ลากคอมโพเนนต์เข้ามาทั้งไฟล์)
//
// ⚠️ นิยามอยู่ที่นี่ที่เดียว · components/ApprovalStatus.js re-export ตัวนี้ต่อ
// ห้ามเขียนซ้ำเป็นบรรทัดเดียวที่อื่น — แถวเก่าก่อน mig 0027 เป็น NULL และต้องนับ
// เป็น "อนุมัติแล้ว" เสมอ ถ้ามีสองชุดแล้วเพี้ยนกัน ตัวกรองกับตารางจะไม่ตรงกัน

export function approvalStatusOf(record) {
  return record?.approvalStatus || "approved";
}
