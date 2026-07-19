# Decision 0007 — Versioned Document Standards before Signature Evidence

วันที่: 20 กรกฎาคม 2026
สถานะ: Accepted

## บริบท

รหัสแบบฟอร์ม `FM-SA-01`/`FM-SA-03`, Revision, Effective date และข้อมูลบริษัทถูก hard-code ใน `webapp/src/lib/documentBrand.js` ขณะที่ปุ่มตั้งค่าหลายจุดชี้ไป `/settings` แต่ phased proxy gate ยังปิดหน้าศูนย์ตั้งค่าสำหรับ non-admin รวมถึง AE Supervisor

Phase 5B ต้องเก็บ controlled form metadata และ template reference ร่วมกับ signature evidence หากผูกหลักฐานกับค่าคงที่ก่อนสร้าง controlled version จะต้องรื้อ schema หรือเกิดหลักฐานที่อธิบายที่มาไม่ได้เมื่อมาตรฐานเปลี่ยน

## การตัดสินใจ

### Settings เป็นพื้นที่ส่วนกลาง

- `/settings` เป็นศูนย์กลางเหนือทุกระบบธุรกิจและเปิดให้ผู้ใช้ที่ล็อกอินเข้าถึง
- หน้า hub กรองเฉพาะการ์ดที่ role ใช้ได้
- หน้าลูกและ API ตรวจ permission แยกอีกชั้น
- Document Standards ใช้ Admin + AE Supervisor ผ่าน helper เฉพาะ; ไม่มอบ `master:manage` ให้ AE Supervisor

### Controlled metadata

- เก็บมาตรฐานแยกตาม stable document key
- Form code, Revision, Effective date, title, accent และ numbering pattern เปลี่ยนผ่าน Draft → Published → Archived เท่านั้น
- Published/Archived immutable และมี active pointer ต่อ document key
- รูปแบบเลขที่เป็น metadata แบบ guarded token ใน Phase 6A; number generator เดิมยังเป็น authority จนถึง Document Engine Phase 7

### ลำดับการส่งมอบ

- ทำ Phase 6A ก่อน Phase 5B เฉพาะส่วนที่เป็น controlled metadata dependency
- หลัง Phase 6A ให้กลับไปทำ Phase 5B ก่อน Phase 6B
- Phase 5B เก็บ signature evidence แต่ยังไม่วางภาพลายเซ็นใน Print/PDF
- Phase 6B ทำ visual master template และ Phase 7 ทำ snapshot/engine integration

## เหตุผล

- ป้องกัน signature evidence อ้างอิง Form code/Revision แบบ hard-code ที่เปลี่ยนย้อนหลังได้
- รักษา boundary ระหว่าง system configuration, commercial content และ production rendering
- เปิด Settings hub ได้โดยไม่ขยายสิทธิ์แก้ Company Data/Workflow Template
- ทำให้เลขที่ Production เดิมยังคง atomic และไม่มีความเสี่ยงจาก configuration ที่ยังไม่ถูก consumer

## ผลตามมา

- Phase 6A ต้องมี migration `0123`, lifecycle RPC, route guard, audit และ UI แบบมีเวอร์ชัน
- Phase 5B migration ต้องอ้างอิง `document_standard_versions.id` หรือ snapshot controlled metadata ที่ได้จาก version ดังกล่าว
- Phase 7 ต้อง pin Company Data version, Document Standard version, Layout Template version, locale และ data snapshot ต่อ issued document
- เอกสารเก่าและ approval เก่าห้าม backfill version/evidence โดยอนุมานย้อนหลัง

## Rollback

- ถอด Settings card/page/API ได้โดยไม่เปลี่ยน Production Print เพราะ consumer ยังใช้ค่าคงที่เดิม
- หลังมี Published version จริง ให้เก็บตารางและ history ไว้ แม้ปิด feature ชั่วคราว
- ห้าม drop หรือแก้ Published/Archived history เพื่อ rollback
