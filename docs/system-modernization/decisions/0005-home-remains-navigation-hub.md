# Decision 0005 — Home Remains a Navigation Hub

วันที่: 19 กรกฎาคม 2026
สถานะ: ยืนยันเพื่อวางแผน Phase 4C

## บริบท

`/home` เป็นหน้าแรกหลังเข้าสู่ระบบและเป็นจุดสลับระบบตามสิทธิ์ ปัจจุบันมี System Card หลายชุดที่กำหนดข้อมูลซ้ำกับ `AppLayout` ขณะเดียวกันแต่ละระบบมี Dashboard และนิยาม KPI ของตนเองอยู่แล้ว

## การตัดสินใจ

- ปรับ `/home` เป็น navigation hub ที่ตอบบริบทผู้ใช้ ไม่เปลี่ยนเป็น aggregate dashboard
- สร้าง System Catalog กลางให้ `/home` และ `AppLayout` ใช้ metadata เดียวกัน
- แสดงชื่อ บทบาท ทีม ระบบที่เข้าได้ และ Continue action ไปยังระบบล่าสุดที่ยังมีสิทธิ์
- ไม่ดึง KPI, chart, notification หรือ action queue จากทุกระบบมาไว้หน้าแรก
- ใช้ permission helper เดิมสำหรับ visibility และคง authorization ที่ proxy/page/API
- เก็บระบบล่าสุดเป็น stable system key ฝั่ง client ไม่เก็บ URL รายการหรือข้อมูลอ่อนไหว
- ใช้ Design Token และ shared component เดิม ไม่ติดตั้ง UI library เพิ่ม

## เหตุผล

- หน้าแรกต้องเปิดเร็วและทำหน้าที่พาผู้ใช้ไปงาน ไม่สร้างนิยาม KPI ซ้ำ
- Catalog กลางลดความเสี่ยงที่ icon, ชื่อ, route และ visibility ระหว่าง Home กับ Top Navigation ไม่ตรงกัน
- Continue action ให้ประโยชน์โดยไม่เพิ่ม API หรือรวมข้อมูลข้ามระบบ
- การคง Dashboard ไว้ใน domain เจ้าของข้อมูลทำให้ permission, cache และตัวเลขตรวจสอบง่ายกว่า

## ผลตามมา

- Phase 4C มีขอบเขตเฉพาะ `/home` และส่วน shared catalog ที่จำเป็น
- การปรับ Dashboard แต่ละระบบต้องอยู่ใน phase/PR ของระบบนั้น
- หากอนาคตต้องการ Executive cross-system dashboard ต้องเปิด scope และนิยาม metrics แยก ไม่ต่อยอดโดยตรงจาก `/home`
