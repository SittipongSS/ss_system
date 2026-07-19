# Decision 0008 — Atomic Signature Evidence for Controlled Documents

วันที่: 20 กรกฎาคม 2026
สถานะ: Accepted for Phase 5B implementation

## บริบท

Phase 5A มี Signature Vault แบบ private และ immutable version แล้ว ส่วน Phase 6A มี Document Standard Version สำหรับ `FM-SA-01` และ `FM-SA-03` แล้ว แต่การอนุมัติ Quotation และ Sale Order ยังบันทึกเพียงชื่อ เวลา และสถานะบนแถวเอกสาร จึงยังตอบไม่ได้อย่างพิสูจน์ได้ว่าใช้งานลายเซ็นเวอร์ชันใดและมาตรฐานเอกสารเวอร์ชันใด

## การตัดสินใจ

### Enforcement

- การอนุมัติใหม่ของ Quotation `FM-SA-01` และ Sale Order `FM-SA-03` ต้องมี Active Signature ของผู้กดอนุมัติ
- หากไม่มี Active Signature ให้ปฏิเสธโดยไม่เปลี่ยน approval row และคืน error code `signature_required` พร้อมเส้นทาง `/account`
- Approval เดิมก่อน Phase 5B เป็น legacy record และห้าม backfill evidence
- การ Replace หรือ Revoke ลายเซ็นภายหลังต้องไม่เปลี่ยนหลักฐานเดิม

### Atomic evidence

- สร้าง evidence และเปลี่ยนสถานะอนุมัติใน database transaction เดียวผ่าน RPC
- Evidence อ้างอิง Signature Version และ Published Document Standard Version แบบ foreign key
- เก็บ signer snapshot, signature asset snapshot, controlled form snapshot, document fingerprint, document number และ signed timestamp
- Evidence เป็น append-only; ห้าม update/delete
- เอกสารเดียวกันอาจมี evidence หลายรายการเมื่อถูกแก้และอนุมัติใหม่ แต่ active approval row ชี้ evidence ล่าสุด

### Document integrity

- Quotation ใช้ fingerprint เดิมที่ครอบคลุมรายการ ราคา ส่วนลด VAT การชำระเงินและหมายเหตุ
- Sale Order เพิ่ม deterministic fingerprint ที่ครอบคลุมหัวเอกสาร ยอด รายการ อ้างอิง และเงื่อนไขสำคัญ
- RPC ตรวจ expected `updatedAt`, สถานะ, active signature และ published standard อีกครั้งเพื่อป้องกัน stale approval

### Boundary

- Phase 5B เก็บหลักฐานเท่านั้น ยังไม่แสดงภาพลายเซ็นใน Print/PDF
- ไม่เปิด Admin ให้ดูไฟล์ลายเซ็นของผู้อื่น
- ไม่รวม customer signing, OTP, certificate/PKI, issued PDF และ Document Engine
- Permission redesign ยังคงอยู่ Phase 8–9

## Migration sequencing

- เปลี่ยนชื่อ hotfix ที่ merge ชนเลขจาก `0123_save_quotation_content_metadata.sql` เป็น `0124_save_quotation_content_metadata.sql`; เนื้อหาเป็น idempotent `CREATE OR REPLACE FUNCTION` ที่รัน production แล้ว
- Phase 5B ใช้ `0125_signature_evidence.sql`
- การเปลี่ยนเลข hotfix ไม่ต้องแก้ข้อมูลหรือรัน SQL ซ้ำด้วยมือ

## Amendment — Migration 0126 trigger isolation

- Production UAT วันที่ 20 กรกฎาคม 2026 พบว่า trigger function จาก Migration `0125` ใช้ `NEW` record ร่วมกันระหว่าง `quotations` และ `sales_orders`
- PostgreSQL ตรวจ field ของ `NEW` ตาม row type ทำให้การเปลี่ยน `sales_orders.status` ล้มเหลวด้วย `record "new" has no field "approvalStatus"` ก่อนยื่นอนุมัติ
- Migration `0126_signature_evidence_trigger_fix.sql` แยก pointer-cleanup trigger function ตามตาราง เพื่อให้แต่ละฟังก์ชันอ้างเฉพาะ field ที่มีอยู่จริง
- การแก้ไขไม่เปลี่ยน evidence ที่สร้างแล้ว ไม่ backfill และไม่เปลี่ยน approval policy หรือ separation-of-duty

## Amendment — Controlled Admin break-glass

- ระหว่างที่องค์กรยังไม่มี Admin/AE Supervisor คนที่สอง อนุญาตให้เฉพาะ Admin อนุมัติ Sale Order ที่ตนสร้างหรือยื่นเองได้แบบ `admin_override`
- Override ต้องมีเหตุผล 10–500 ตัวอักษรและยืนยันผ่าน Modal ที่แสดงผลกระทบต่อ Actual อย่างชัดเจน
- เหตุผลและบริบทผู้สร้าง/ผู้ยื่นถูกเก็บใน `document_signature_evidence_overrides` ซึ่งเป็น append-only extension ของ Signature Evidence
- Active Signature, Published Document Standard, fingerprint, stale guard, document completeness และ atomic transaction ยังคงบังคับเหมือน approval ปกติ
- AE Supervisor ที่เป็นผู้สร้างหรือผู้ยื่นเองยังใช้ Override ไม่ได้ และ approval ปกติยังคง separation-of-duty เป็นค่าเริ่มต้น
- Active SO แสดง `approvalMode` และเหตุผลเพื่อให้ผู้ใช้ตรวจสอบได้; เมื่อเอกสารออกจากสถานะ approved ค่า projection นี้ถูกล้าง แต่ immutable evidence ยังคงอยู่

## Rollback

- ปิด caller ของ atomic approval RPC ได้ แต่ต้องเก็บ evidence และ asset history ไว้
- ห้ามลบหรือแก้ evidence ที่สร้างแล้ว
- ก่อนมี evidence จริง สามารถ rollback application โดยกลับไป approval route เดิมได้; หลัง rollout ต้องใช้ maintenance plan ที่รักษาหลักฐาน
