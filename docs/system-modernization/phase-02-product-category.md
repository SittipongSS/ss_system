# Phase 2 — Product Category Management

สถานะ: กำลังดำเนินการ

เริ่ม: 19 กรกฎาคม 2026

เป้าหมาย: ทำให้หมวดสินค้าที่ถูกใช้ร่วมกันในสินค้า ดีล โครงการ ไทม์ไลน์ และกฎภาษี สามารถดูแลได้จากหน้าจอเดียว โดยรักษาความถูกต้องของข้อมูลอ้างอิงเดิม

## ขอบเขตที่ยืนยัน

- เพิ่มเมนู `หมวดสินค้า` ในระบบฐานข้อมูล เฉพาะ AE Supervisor และ Admin
- เพิ่มหน้า `/database/product-categories`
- แสดงหมวดหลักแบบจัดกลุ่ม และหมวดรองเป็นรายการในตาราง
- ค้นหาด้วยรหัส ชื่อไทย ชื่ออังกฤษ และหมายเหตุ
- กรองสถานะกำลังใช้งาน/พักใช้งาน
- เพิ่มและแก้ไขผ่าน Drawer; ไม่มี Auto-save และมี Primary action เดียว
- แสดง Usage count แยกสินค้า ดีล และโครงการ
- พักใช้/เปิดใช้ผ่าน Confirm dialog; ไม่มีการลบถาวร
- รหัสหมวดหลักและหมวดรองแก้ไม่ได้หลังสร้าง
- การเปลี่ยนชื่อหมวดหลักอัปเดตชื่อทุกแถวในกลุ่มเดียวกัน
- หมวดที่พักใช้ยังแสดงข้อมูลย้อนหลัง แต่เลือกใช้กับงานใหม่ไม่ได้
- ทุกการเพิ่ม แก้ไข และเปลี่ยนสถานะบันทึก Audit

## กติกาสิทธิ์ชั่วคราว

- อ่านรายการหมวดเพื่อใช้ในฟอร์ม: ผู้ใช้ที่ลงชื่อเข้าใช้
- เปิดหน้าจัดการ/เพิ่ม/แก้ไข/พักใช้/เปิดใช้: `admin` และ `ae_supervisor`
- ใช้ `canManageProductCategories()` แยกจาก `master:manage`
- ไม่เพิ่ม `master:manage` ให้ AE Supervisor เพราะ capability เดิมครอบคลุมการตั้งค่าระบบอื่นด้วย
- จะรวมกฎนี้เข้ากับ Permission model ใหม่ใน Phase 8–9

## โครงสร้างข้อมูลและความเสี่ยง

- ตาราง `product_types` เก็บชื่อหมวดหลักซ้ำในทุกหมวดรอง ไม่มีตารางหมวดหลักแยก
- รหัสรวมรูปแบบ `MM-TTT` ถูกเก็บใน `products.categoryCode`, `sales_deals.categoryCode` และ `projects.productMainCategory`
- รหัส `01-002` เป็นเงื่อนไขภาษีสรรพสามิตและมีผลต่อ Timeline template
- Phase นี้จึงไม่ Normalize ตารางและไม่อนุญาตเปลี่ยนรหัส เพื่อหลีกเลี่ยงการกระทบข้อมูลเดิม

## Migration

- `0118_product_types_lifecycle.sql`
- ผู้ใช้ยืนยันว่ารัน Migration 0118 บนฐานข้อมูลจริงแล้วเมื่อ 19 กรกฎาคม 2026; ยังรอตรวจ schema และพฤติกรรมหน้าใช้งานจากระบบที่เชื่อมฐานข้อมูลจริง
- เพิ่ม `isActive`, `createdAt`, `updatedAt`, `deactivatedAt`
- เพิ่ม index สำหรับสถานะและรหัสหมวด
- ข้อมูลเดิมถูกกำหนดเป็น `isActive = true`

## Rollback

- ลบเมนูและหน้า `/database/product-categories`
- คืน API product-types เป็น read/create แบบเดิม
- การถอย schema สามารถเก็บคอลัมน์ใหม่ไว้ได้โดยไม่กระทบโค้ดเดิม
- หากต้องลบคอลัมน์จริง ต้องยืนยันว่าไม่มี client รุ่นใหม่อ่าน `isActive` แล้วจึง drop index และ 4 คอลัมน์
- การ Rollback ต้องไม่ลบแถวหมวดสินค้าและไม่เปลี่ยนรหัสเดิม

## ไม่รวมใน Phase 2

- Import, Export, Download template และประวัติการนำเข้า: Phase 3
- Company data และ Admin Center: Phase 4
- Document template: Phase 6–7
- Permission redesign: Phase 8–9

## Validation

- [x] Unit tests ของ permission, validation และ inactive selection
- [x] Migration check
- [x] ESLint
- [x] Production build
- [x] Desktop Light/Dark
- [x] Mobile Light/Dark
- [x] ตรวจ Drawer และไม่มี horizontal overflow
- [x] ตรวจหมวดพักใช้ไม่ปรากฏในงานใหม่ แต่ข้อมูลเดิมยังอ่านได้ด้วย Unit/API validation
- [x] ตรวจหน้า production กับฐานข้อมูลที่ลง Migration 0118 แล้ว: เมนู, summary, grouped table, usage count, Drawer เพิ่ม/แก้ไข และ Confirm แบบเปิดแล้วกดยกเลิกโดยไม่เปลี่ยนข้อมูล
- [x] ตรวจ Confirm dialog และแก้ shared Modal ให้มี `role="dialog"`, accessible name, focus trap และคืน focus เมื่อปิด
- [ ] ตรวจ Toast จากการเพิ่ม/แก้ไข/เปลี่ยนสถานะจริงใน environment ที่อนุญาตให้เขียนข้อมูล
- [ ] ผู้ใช้ตรวจภาพและการใช้งาน
- [x] Commit, Push, PR #542, CI และ merge commit `ba61df8`

## Visual evidence

- ตรวจ production ที่ `https://ss-team.vercel.app/database/product-categories` ด้วยบัญชี Admin เมื่อ 19 กรกฎาคม 2026
- พบข้อมูล 4 หมวดหลัก, 105 หมวดรอง, 105 กำลังใช้งาน และ 0 พักใช้งาน
- Drawer เพิ่ม/แก้ไขแสดงรหัสล็อก ชื่อไทยหลัก ชื่ออังกฤษรอง และ usage ของ `01-002` เท่ากับ 91 สินค้า, 39 ดีล, 6 โครงการ

## Known issues / งานที่เลื่อนไป

- โครงสร้างหมวดหลักยังเป็นข้อมูลซ้ำตาม schema เดิม; ประเมินการ Normalize หลังระบบ Import/Export เสถียร
- Usage count Phase นี้นับสินค้า ดีล และโครงการ ไม่รวมข้อความ snapshot ในเอกสารเก่า
- Permission model เต็มรูปแบบเลื่อนไปเฟสสุดท้ายตามข้อตกลง
