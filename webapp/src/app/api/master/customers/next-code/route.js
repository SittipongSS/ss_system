// Master-data namespace alias (ดูเหตุผลที่ ../route.js) — เลขรหัสลูกค้าถัดไป
// ⚠️ ต้องมีไฟล์นี้ ไม่ใช่แค่สร้าง /api/customers/next-code: namespace /api/master/*
// ในโปรเจกต์นี้เป็น **ไฟล์ alias จริง** ไม่ใช่ rewrite ⇒ ไม่เพิ่มที่นี่ = ฟอร์มยิงแล้ว 404
// (เจอตอนเปิดพรีวิวรอบแรกของ mig 0230 — แถบรหัสโชว์ช่องว่างเงียบ ๆ)
export { GET } from "../../../customers/next-code/route";
