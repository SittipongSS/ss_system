# Phase 5 — Electronic Signature

สถานะ: กำลังดำเนินการ

เริ่ม: 19 กรกฎาคม 2026
เป้าหมาย: สร้างลายเซ็นอิเล็กทรอนิกส์แบบ private, owner-only และมีเวอร์ชัน
พร้อมฐานหลักฐานที่ไม่เปลี่ยนย้อนหลัง โดยไม่เปลี่ยน Production Document Template ก่อน Phase 6–7

## ขอบเขตที่ยืนยันแล้ว

### Phase 5A — Signature Vault

- เพิ่ม Signature Vault ในหน้า Account
- แสดงสถานะ active/not configured, Preview และ version history
- Upload PNG, Replace และ Revoke ด้วย explicit action และ confirm step
- ก่อน Upload/Replace ให้ครอปและจัดตำแหน่งในกรอบ 3:1 แล้วสร้าง PNG 1200×400 px บน Browser; ไฟล์ต้นฉบับไม่ถูก Upload
- ใช้ Drawer สำหรับรายละเอียดและการจัดการ
- เก็บไฟล์ใน private bucket และอ่านผ่าน owner-scoped API
- เก็บ asset metadata และ SHA-256
- Version และ lifecycle history ไม่เปลี่ยนย้อนหลัง
- บันทึก central audit โดยไม่เก็บ raw image หรือ storage credential

### Phase 5B — Signature Evidence Pilot

- ทำหลัง Phase 5A deploy, signer enrollment และ UAT ผ่าน
- ผูก signature version เข้ากับ explicit approval ของ Quotation `FM-SA-01`
  และ Sale Order `FM-SA-03` แบบ atomic
- เก็บ signer snapshot, signed timestamp, document fingerprint และ controlled form metadata
- Approval เดิมเป็น legacy record และห้าม backfill evidence
- ผู้ใช้ยืนยัน enforcement: approval ใหม่ต้องมี Active Signature; หากไม่มีให้ no-write และพาไป `/account`
- Phase 5B ใช้ Migration `0125_signature_evidence.sql` หลังแก้ duplicate migration hotfix เป็น `0124`

## Data/API Phase 5B

- `document_signature_evidence` — append-only evidence ต่อ approval action
- อ้างอิง `user_signature_versions.id` และ `document_standard_versions.id`
- เก็บ `documentType`, `documentId`, `documentNumber`, `documentFingerprint`, signer/asset/form snapshots และ `signedAt`
- เพิ่ม active evidence pointer แบบ nullable บน `quotations` และ `sales_orders`; legacy approval เดิมคงเป็น `null`
- `approve_quotation_with_signature_evidence_atomic` — ตรวจ pending/stale/active signature/published FM-SA-01 แล้ว approve + evidence พร้อมกัน
- `approve_sales_order_with_signature_evidence_atomic` — ตรวจ pending/stale/separation-of-duty/active signature/published FM-SA-03 แล้ว approve + evidence พร้อมกัน
- Error ที่ client แก้ได้ใช้ safe code เช่น `signature_required`, `approval_stale` และ `document_standard_required`; ห้ามส่ง database detail

## ไม่รวมใน Phase 5B

- วางภาพลายเซ็นลง Quotation/Sale Order Print/PDF
- ลายเซ็นผู้จัดทำหรือผู้เสนอราคาที่ไม่มี explicit signing action
- ลายเซ็นลูกค้า, OTP, Certificate หรือ PKI
- Admin preview/revoke ลายเซ็นของผู้อื่น
- Issued PDF storage, Document Engine, Commercial Preset และ Permission redesign

## Validation Phase 5B

- [x] ผู้ใช้ยืนยัน enforcement และ scope ก่อน implementation
- [x] Decision 0008 และ migration sequencing ถูกบันทึกก่อน schema/API implementation
- [x] Migration 0124/0125 file integrity, append-only guard, RLS/RPC contract และ sequencing ผ่าน automated/static validation
- [ ] Migration 0125 รันบน Supabase จริงและ RPC transaction/no-write ผ่าน UAT
- [ ] Quotation approval สร้าง evidence แบบ atomic และ no-write เมื่อ signature/standard/stale ไม่ผ่าน
- [ ] Sale Order approval สร้าง evidence แบบ atomic และคง separation-of-duty
- [x] Fingerprint deterministic และเปลี่ยนเมื่อข้อมูลสำคัญเปลี่ยน
- [x] UI แสดง actionable link ไป Account เมื่อ API ส่ง safe `accountUrl`
- [x] Signature Vault ครอป 3:1, drag/zoom/keyboard/reset และสร้าง Preview PNG 1200×400 px ฝั่ง Browser
- [x] Legacy approval ไม่ถูก backfill และ Print/PDF ไม่เปลี่ยนใน implementation นี้
- [x] Automated tests, targeted ESLint และ production build ผ่าน
- [ ] Preview UAT หลังผู้ใช้รัน Migration 0125
- [ ] ผู้ใช้ตรวจและยืนยันก่อน Commit, Push และ PR

## Validation log — 20 กรกฎาคม 2026 (Phase 5B)

- `npm run check:migrations` ผ่าน 125 migrations; latest `0125`
- `npm test` ผ่าน 409/409 tests รวม signature evidence migration contract, safe error mapping, Sale Order fingerprint และ crop geometry
- Targeted ESLint ผ่านสำหรับ approval APIs, Quotation/Sale Order UI และ signature evidence/fingerprint libraries
- `npm run build` ผ่านบน Next.js 16.2.7
- Supabase runtime RPC, no-write transaction และ approval UAT รอทดสอบด้วยบัญชีจริง
- ผู้ใช้ยืนยันรัน Migration `0125` แล้ววันที่ 20 กรกฎาคม 2026; รอ RPC/approval UAT ด้วยบัญชีจริง
- Local Browser UAT: Desktop/Dark และ Mobile 390×844 ผ่าน; เลือก PNG, ขยับด้วย keyboard, zoom 105%, สร้าง Preview 1200×400 px และไม่มี horizontal overflow/runtime error

## Current-state inventory

- Quotation มี owner approval, `approvedBy`, `approvedAt` และ `approvalFingerprint`
- Sale Order มี reviewer approval และ separation-of-duty แต่ยังไม่มี document fingerprint
- Print HTML แสดงชื่อและช่องลายเซ็น แต่ยังไม่มี signature asset
- `audit_logs` เป็น best-effort จึงไม่ใช่หลักฐาน signature lifecycle เพียงแหล่งเดียว
- `/api/upload` รองรับ use case เอกสารแนบและบาง backend เป็น public URL จึงห้ามนำมาใช้กับลายเซ็น
- Account profile ปัจจุบันเก็บข้อมูลทั่วไปใน Supabase Auth metadata; signature asset ต้องแยกตารางและ storage

## UX flow Phase 5A

1. หน้า Account แสดงการ์ด `ลายเซ็นอิเล็กทรอนิกส์` พร้อมสถานะ
2. ปุ่ม `จัดการลายเซ็น` เปิด Drawer
3. ผู้ใช้เลือก PNG แล้วเห็น local preview, validation และคำอธิบายผลกระทบ
4. กด `บันทึกลายเซ็นใหม่` และยืนยันก่อน Upload/Replace
5. Revoke ต้องระบุเหตุผลและยืนยัน; version/file เดิมไม่ถูกลบ
6. History แสดง Version, เวลา, action และสถานะ active/superseded/revoked

## Security และ Validation

- API derive user ID จาก session เท่านั้น
- PNG จริงเท่านั้น; reject SVG/HTML/ไฟล์เปลี่ยนนามสกุล
- สูงสุด 1 MB, width 120–2400 px, height 40–1200 px
- object path แยกตาม owner และ UUID; `upsert: false`
- file proxy ตรวจ owner/version ก่อน download และส่ง `nosniff`, private/no-store
- invalid request, cross-owner access และ stale lifecycle ต้องไม่เขียนข้อมูล
- upload สำเร็จแต่ DB transaction ล้มเหลวต้องลบ orphan object แบบ best-effort
- Replace/Revoke ใช้ atomic RPC และ optimistic active-version guard

## Migration 0122 ที่วางแผน

- private bucket `signature-assets`
- `user_signatures` — root และ active version pointer ต่อ user
- `user_signature_versions` — immutable asset metadata
- `user_signature_events` — append-only upload/replace/revoke evidence
- constraints/indexes/RLS และ guards ห้าม update/delete version/event rows
- RPC สำหรับ publish version ใหม่และ revoke active version แบบ atomic
- Migration เป็น additive และไม่แก้ approval/document row เดิม

## ไม่รวมใน Phase 5A

- บังคับ approval ให้มีลายเซ็น
- เปลี่ยน Quotation/Sale Order approval route
- วางภาพลายเซ็นลง Print/PDF
- Issued PDF storage และ Document Engine
- Customer online signing, OTP, Certificate หรือ PKI
- Admin ดูไฟล์ของผู้อื่นหรือ Emergency revoke
- Permission redesign
- Commercial Preset, payment terms, remarks และ installment table

## Validation และ Definition of Done

- [x] ผู้ใช้ยืนยัน scope และการแยก Phase 5A/5B ก่อน implementation
- [x] จัดทำ Phase document และ Decision 0006 ก่อน implementation
- [x] Migration integrity, constraints, RLS, RPC และ rollback notes ผ่าน
- [x] PNG magic/IHDR, size/dimension/hash unit tests ผ่าน
- [ ] Owner-only API, invalid no-write, cross-owner และ stale lifecycle ผ่าน
- [ ] Orphan upload rollback ผ่าน
- [ ] Account card/Drawer ผ่าน Loading, Empty, Error, Upload, Replace, Revoke และ History
- [x] Desktop/Mobile, Light/Dark, keyboard, focus trap/restore และ screen-reader labels ผ่าน
- [x] Automated tests, targeted ESLint และ production build ผ่าน
- [ ] Preview UAT หลังผู้ใช้รัน Migration 0122
- [x] อัปเดต Permission action inventory และ validation log
- [ ] ผู้ใช้ตรวจและยืนยันก่อน Commit, Push และ Draft PR

## Validation log — 19 กรกฎาคม 2026

- `npm test` ผ่าน 392/392 tests รวม PNG structure/dimension/size, revoke reason, version state,
  owner-scoped storage path และ safe RPC error mapping
- `npm run check:migrations` ผ่าน 122 migrations; latest `0122`
- Targeted ESLint ผ่านสำหรับ Account, Signature Vault, shared Drawer, signature API และ signature libraries
- `npm run build` ผ่านบน Next.js 16.2.7 พร้อม routes `/api/account/signature`
  และ `/api/account/signature/[versionId]/file`
- Local API UAT: PNG จริง 225×225 px ตอบ `201`, ไฟล์ที่ปลอม MIME เป็น PNG ตอบ `400`
  และ revoke ด้วย expected active version ตอบ `200`
- Chrome UAT: Empty state/Drawer ผ่าน Desktop และ Mobile 390×844, ไม่มี horizontal overflow,
  Light/Dark แสดงพื้นผิวทึบ, focus restore กลับปุ่ม `จัดการลายเซ็น` และใช้ accessible dialog labels
- Browser file chooser ยังไม่ทดสอบ เพราะ Chrome Extension ปิด `Allow access to file URLs`;
  ผู้ใช้ต้องเปิดสิทธิ์นี้ก่อนทดสอบ local preview ด้วยไฟล์จริง
- Database/Preview UAT สำหรับ owner-only read, stale write, RPC transaction และ orphan-object rollback
  รอผู้ใช้รัน Migration 0122 บน Supabase environment
- Production navigation regression หลัง Merge PR #565: ผู้ใช้ non-admin ถูก redirect จาก `/account`
  เพราะ route gate เปิดเฉพาะ `/api/account`; แก้โดยเปิดหน้า `/account` สำหรับผู้ใช้ที่ล็อกอินทุก role
  และเพิ่ม regression test โดยไม่ขยายสิทธิ์ `/settings`

## Known risks

- ลายเซ็นเป็นข้อมูลส่วนบุคคลที่นำไปใช้ผิดวัตถุประสงค์ได้ จึงห้าม public URL และ cross-user preview
- การลบ object เดิมทำให้เอกสารในอนาคต re-render ไม่ได้ จึง Revoke โดยไม่ Delete
- การบังคับลายเซ็นก่อน signer enrollment จะหยุด approval flow จึงแยก enforcement ไป Phase 5B
- Central audit เป็น best-effort; version/event tables และ transaction ต้องเป็นหลักฐานหลัก
- ภาพพื้นหลังขาวยังเป็น PNG ที่ถูกต้องแต่คุณภาพการพิมพ์อาจไม่ดี UI ต้องแนะนำพื้นหลังโปร่งใส
- Phase 6–7 ต้องกำหนด layout, template version และ issued-document snapshot ก่อนแสดงภาพในเอกสารจริง
