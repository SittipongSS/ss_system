# Phase 1 — Account Menu, Profile และ Security

สถานะ: เสร็จสมบูรณ์

เริ่ม: 19 กรกฎาคม 2026

เป้าหมาย: แยกการตั้งค่าส่วนบุคคลออกจากการตั้งค่าระบบ และลดความรกของ top bar โดยไม่เปลี่ยน Permission model

## ขอบเขตที่ทำ

- รวมข้อมูลผู้ใช้, เปลี่ยนธีม, เปลี่ยนรหัสผ่าน และออกจากระบบไว้ใน Account menu จุดเดียวบน desktop
- เพิ่มทางเข้า `บัญชีของฉัน` ในเมนูเพิ่มเติมบน mobile
- เพิ่มหน้า `/account` สำหรับข้อมูลส่วนตัว ข้อมูลบัญชีแบบอ่านอย่างเดียว และ Security
- เพิ่ม `GET/PATCH /api/account/profile` สำหรับ self-service profile
- ใช้ Change Password flow เดิมที่บังคับ current password และ logout หลังเปลี่ยนสำเร็จ
- เพิ่ม Audit สำหรับการแก้ไขข้อมูลส่วนตัว

## UX/UI ที่ใช้

- Account trigger แสดง Avatar → ชื่อ → Role ตามลำดับความสำคัญ และเปิด popover ที่ชิดขวาของ top bar
- หน้า Account ใช้สองคอลัมน์บน desktop และหนึ่งคอลัมน์บน tablet/mobile
- แบบฟอร์มมี Primary action เดียวคือ `บันทึกข้อมูล`; ไม่มี Auto-save
- การบันทึกต้องผ่าน Confirm dialog และแสดง Toast หลังสำเร็จหรือผิดพลาด
- Role, ฝ่าย, ทีม และอีเมลเข้าสู่ระบบแสดงเป็นข้อมูลอ่านอย่างเดียว ไม่ทำให้เข้าใจว่าแก้สิทธิ์ได้จากหน้านี้
- ใช้ IBM Plex Sans Thai, token และ shared classes ของระบบ; ไม่เพิ่ม UI library หรือ font ใหม่

## Security boundary

- API หา user ID จาก session ด้วย `getCurrentUser()` เท่านั้น
- Request แก้ไขได้เฉพาะ `firstName`, `lastName` และ `phone`
- API เขียนเฉพาะ `user_metadata`; ไม่เขียน `app_metadata`
- ไม่รับ Role, team, department, extraCaps, email หรือ user ID จาก payload
- เบอร์โทรตรวจ 9/10 หลัก และชื่อ/นามสกุลจำกัด 80 ตัวอักษรต่อช่อง
- Audit snapshot ไม่เก็บรหัสผ่าน, token หรือ secret

## ไฟล์สำคัญ

- `webapp/src/components/AccountMenu.js`
- `webapp/src/components/AppLayout.js`
- `webapp/src/app/account/page.js`
- `webapp/src/app/account/page.module.css`
- `webapp/src/app/api/account/profile/route.js`
- `webapp/src/lib/accountProfile.js`
- `webapp/src/lib/accountProfile.test.mjs`

## สิ่งที่ไม่ทำใน Phase 1

- ไม่เพิ่มการอัปโหลดหรือจัดการลายเซ็นอิเล็กทรอนิกส์; ทำใน Phase 5
- ไม่สร้าง Admin Center; ทำใน Phase 4
- ไม่เปลี่ยนหน้าจัดการผู้ใช้ของผู้ดูแลระบบ
- ไม่เพิ่ม Role/Capability และไม่รื้อ Permission; ทำใน Phase 8–9
- ไม่เปลี่ยนอีเมลเข้าสู่ระบบด้วย self-service

## Migration และ Rollback

- Database migration: ไม่มี ใช้ Supabase Auth metadata เดิม
- Data migration: ไม่มี; รองรับ department legacy `SALES`, `LEGAL`, `VIEWER` ตอนแสดงผล
- Rollback: ลบ route `/account` และ `/api/account/profile`, คืน action แยกใน `AppLayout.js`, ลบ `AccountMenu.js` และ CSS ที่เกี่ยวข้อง
- Rollback ไม่กระทบข้อมูลเดิม เพราะไม่มี schema change และไม่ได้ย้าย metadata

## Validation

- [x] Unit tests ผ่าน 344 รายการ รวม test normalization/profile boundary ใหม่ 3 รายการ
- [x] ESLint ของไฟล์ที่เกี่ยวข้องผ่าน
- [x] Next.js production build ผ่าน และพบ route `/account` กับ `/api/account/profile`
- [x] ตรวจ Desktop Light/Dark
- [x] ตรวจ Account popover เปิด/ปิดและ menu semantics
- [x] ตรวจ Mobile breakpoint: form หนึ่งคอลัมน์, top bar compact และ bottom navigation
- [x] ไม่มี horizontal overflow บน desktop
- [x] ผู้ใช้ตรวจภาพและการใช้งาน
- [x] Commit, Push, PR และ CI

## Visual evidence

- `phase-01-evidence/before-topbar.png` — top bar ก่อนรวม Account menu
- `phase-01-evidence/after-account-dark.png` — หน้า Account และ popover ใน Dark theme
- `phase-01-evidence/after-account-light.png` — หน้า Account ใน Light theme

หมายเหตุ: ภาพ After ถูกจับระหว่าง QA ก่อนแก้ polish รอบสุดท้าย 2 จุด ได้แก่การจัดตำแหน่งตัวอักษรใน avatar และการแปลง department legacy จาก `SALES` เป็น `SA`; ไม่มีการเปลี่ยน layout หลังการจับภาพ และ production build หลังแก้ผ่านแล้ว

## Known issues / งานที่เลื่อนไป

- การเปลี่ยนรหัสผ่านใน local mode ถูกซ่อน เพราะไม่มี Supabase Auth ให้ตรวจ current password
- ลายเซ็นอิเล็กทรอนิกส์และ Audit evidence ของลายเซ็นเลื่อนไป Phase 5
- การกำหนด Capability ของ Account/Profile จะสรุปอีกครั้งใน Phase 8 โดยคงหลัก own-scope ไว้

## Phase closeout

- วันที่ปิดเฟส: 19 กรกฎาคม 2026
- PR: [#540](https://github.com/SittipongSS/ss_system/pull/540)
- Commit: `f3eb6ee`
- Merge commit: `efc3294`
- ผล CI: GitHub CI, Vercel และ Vercel Preview ผ่าน
- ผู้ยืนยัน: ผู้ใช้เจ้าของระบบ โดย Merge PR #540
- เฟสถัดไป: Phase 2 — Product category management
