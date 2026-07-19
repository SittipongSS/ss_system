# Decision 0003 — Organization Settings Versioning

วันที่: 19 กรกฎาคม 2026
สถานะ: ยืนยันเพื่อเริ่ม Phase 4A

## บริบท

ข้อมูลนิติบุคคลที่ใช้กับเอกสารปัจจุบันอยู่ใน `webapp/src/lib/documentBrand.js` แบบค่าคงที่ ขณะที่ roadmap กำหนดให้ข้อมูลบริษัทมีเวอร์ชัน และเอกสารที่ออกแล้วต้องไม่เปลี่ยนย้อนหลังเมื่อข้อมูลบริษัทเปลี่ยน

## การตัดสินใจ

### Model

- ใช้ Company profile หลักหนึ่งรายการต่อระบบ
- แยก root record ออกจาก version records
- Root ชี้ Published version ที่ใช้งานอยู่
- Version มีสถานะ Draft, Published หรือ Archived
- มี Draft และ Published ได้อย่างละไม่เกินหนึ่งรายการในเวลาเดียวกัน
- Published/Archived เป็น immutable; การแก้ไขใหม่เริ่มจาก Draft สำเนาของ Published ล่าสุด

### Publish

- Publish ทำผ่าน database function แบบ transaction เดียว
- Lock root record ก่อนตรวจและเปลี่ยนสถานะ
- ตรวจ Draft id, expected `updatedAt` และสถานะปัจจุบันซ้ำใน transaction
- Archive Published เดิมก่อน Publish Draft และอัปเดต root pointer
- ห้าม client ส่งข้อมูลบริษัทชุดใหม่ในคำสั่ง Publish; ต้อง Publish payload ที่บันทึกเป็น Draft แล้วเท่านั้น

### Initial data

- Migration seed ค่าปัจจุบันเป็น Published Version 1
- Version 1 เป็น baseline จากระบบเดิม ไม่ถือว่าเป็นเอกสารฉบับใหม่
- เอกสาร Production เดิมยังใช้ค่าคงที่เดิมใน Phase 4A

### Permission and access

- ใช้ `master:manage` ของ Admin ชั่วคราว
- ไม่สร้าง capability ใหม่ก่อน Phase 8
- ตารางเปิด RLS แต่ไม่มี browser-facing policy
- ทุก read/write ของหน้า Admin ผ่าน server API และ service role หลังตรวจ authorization

### UX

- ไม่มี Auto-save
- การบันทึก Draft และ Publish เป็นคนละ action
- Publish ต้องมี confirm step
- Version detail/edit ใช้ Drawer
- Admin Center เป็น Navigation Card ไม่ใช้ KPI

### Data boundary

Phase 4A เก็บเฉพาะข้อมูลบริษัททั่วไป ได้แก่ ชื่อนิติบุคคล เลขผู้เสียภาษี สาขา ที่อยู่ และช่องทางติดต่อ

ไม่รวม:

- โลโก้และ asset lifecycle
- Form code, Revision, Effective date
- Document localized content
- Electronic signature
- Workflow/Timeline Template

## ผลตามมา

- Phase 7 สามารถอ้าง `organizationSettingVersionId` และเก็บ snapshot กับเอกสารที่ออกจริงได้
- การเปลี่ยนข้อมูลบริษัทมีประวัติและย้อนตรวจได้โดยไม่แก้ Published เดิม
- ต้องมี transaction function และ partial unique indexes เพื่อป้องกัน Published/Draft ซ้ำ
- UI ต้องอธิบายชัดว่าการแก้ Draft ยังไม่มีผลกับระบบ Production จนกว่าจะ Publish และ consumer เอกสารถูกย้ายใน Phase 7
