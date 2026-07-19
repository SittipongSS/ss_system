# Decision 0006 — Private Versioned Electronic Signatures

วันที่: 19 กรกฎาคม 2026
สถานะ: Accepted for Phase 5A implementation

## บริบท

SS System มีชื่อผู้จัดทำ ผู้อนุมัติ เวลาอนุมัติ และ document fingerprint บางส่วนแล้ว
แต่ยังไม่มี asset ลายเซ็นที่ควบคุมเวอร์ชัน ไม่มีหลักฐานว่าการอนุมัติใช้ลายเซ็นเวอร์ชันใด
และ upload กลางบางเส้นทางคืน public URL ซึ่งไม่เหมาะกับข้อมูลลายเซ็นส่วนบุคคล

Phase 6–7 ยังมี gate สำหรับหน้าตาเอกสาร, Template version และ Document Engine
ดังนั้น Phase 5 ต้องสร้างฐานลายเซ็นที่ปลอดภัยโดยไม่เปลี่ยน Production Print Template ก่อนเวลา

## การตัดสินใจ

### แยกการส่งมอบ

- Phase 5A สร้าง Signature Vault, private asset lifecycle และ owner-only API/UI
- Phase 5B ผูก signature evidence เข้ากับ explicit approval ของ Quotation และ Sale Order
- Phase 5A ไม่บังคับให้มีลายเซ็นก่อนอนุมัติ เพื่อไม่หยุด Production workflow ทันทีหลัง deploy

### Asset และ Storage

- ใช้ Supabase private bucket เฉพาะชื่อ `signature-assets`
- ไม่ใช้ `/api/upload`, public URL, Google Drive หรือ Auth metadata
- รับเฉพาะ PNG ที่ตรวจ signature bytes และ IHDR ได้จริง ขนาดไม่เกิน 1 MB
- Dimension ที่ยอมรับ: กว้าง 120–2400 px และสูง 40–1200 px
- เก็บ SHA-256, MIME, size, width และ height เพื่อยืนยัน asset
- Browser อ่านภาพผ่าน owner-scoped proxy เท่านั้น พร้อม `Cache-Control: private, no-store`

### Version และ Lifecycle

- ผู้ใช้หนึ่งคนมี Signature root หนึ่งรายการและ active version ได้ไม่เกินหนึ่งรายการ
- Version row และ storage object ที่ถูกอ้างแล้วห้ามแก้หรือ overwrite
- Replace สร้าง version ใหม่แล้วเปลี่ยน active pointer แบบ atomic
- Revoke ล้าง active pointer และเพิ่ม append-only lifecycle event; ไม่ลบ version/file เดิม
- เอกสารในอนาคตต้องอ้าง version เดิมได้แม้ผู้ใช้ Replace หรือ Revoke แล้ว
- ไม่ backfill หรือสร้างหลักฐานลายเซ็นย้อนหลังให้ approval เดิม

### Authorization และ Audit

- Signed-in user ดูสถานะ อัปโหลด Replace และ Revoke ได้เฉพาะของตนเอง
- API derive owner จาก session และไม่รับ target user ID จาก client
- RLS เปิดโดยไม่มี client policy; server route ใช้ service role หลังตรวจ session
- Version/event tables เป็นหลักฐาน lifecycle หลัก ส่วน `audit_logs` เป็นหลักฐานเสริม
- ไม่เก็บ raw image, base64, signed URL หรือ secret ใน audit payload
- Admin emergency revoke และการดูไฟล์ของผู้อื่นเลื่อนไป Permission Phase 8

### Document scope ใน Phase 5B

- นำร่อง explicit internal approver ของ `FM-SA-01` และ `FM-SA-03`
- ผู้จัดทำ/ผู้เสนอราคาที่ยังไม่มี explicit sign action แสดงชื่อเดิม ไม่สร้างลายเซ็นโดยปริยาย
- ลูกค้ายังคงใช้ external manual signature
- การวางภาพลายเซ็นใน Print/PDF รอ Visual gate Phase 6 และ Document Engine Phase 7

## ผลต่อการพัฒนา

- Migration 0122 ต้องสร้าง bucket, root/version/event tables, constraints, indexes และ atomic RPC
- Account UI ใช้ Drawer สำหรับ Preview, Replace, Revoke และ History
- Phase 5A ต้องมี test สำหรับ PNG validation, size/dimension boundary, immutable history,
  owner isolation, rollback orphan upload และ no-write-on-invalid
- ก่อนเริ่ม Phase 5B ต้องตรวจ signer readiness และยืนยัน rollout gate อีกครั้ง

## Rollback

- ปิดเมนู/route Phase 5A ได้โดยไม่กระทบ approval เดิม เพราะยังไม่มี enforcement
- เก็บตารางและ private objects ไว้เป็นหลักฐาน; rollback application ห้ามลบ version/event history
- การลบ schema หรือ storage objects ทำได้เฉพาะ maintenance plan แยกที่ได้รับอนุมัติ
