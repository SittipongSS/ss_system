// Master-data namespace alias — see ../../../../customers/[id]/billing-rule/route.js.
// ⚠️ จอเรียกผ่าน /api/master/customers/* เสมอ — เส้นลูกใหม่ใต้ลูกค้าต้องมีไฟล์ alias ของตัวเอง
//    (ไม่มี = 404 ทั้งที่ route จริงอยู่ครบ) · proxy ยุบชื่อนี้ลงบน /api/customers/* ให้ด่านชุดเดียวคุม
export const dynamic = 'force-dynamic';
export { PATCH } from "../../../../customers/[id]/billing-rule/route";
