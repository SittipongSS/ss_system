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

## ข้อยกเว้น — รายงานการประเมินพื้นที่ FM-TS-01 (มติเจ้าของ 9 ตุลาคม 2026)

สถานะ: กำลังดำเนินการ (สร้างแล้วเป็น PR-SIG — บน main #1895 · สวิตช์ `SURVEY_REPORT_SIGNATURES` **เปิดบน production ตั้งแต่ 19/10/2026**
ตามที่เจ้าของแจ้ง · ยังไม่เห็นเอกสารจริงที่ออกด้วยลายเซ็น — รายละเอียด `docs/survey-report-doc.md` หัวข้อ "PR-SIG") ·
ส่วนขยายของข้อ 2 (ผู้วางคิว · มติเจ้าของ 19/10/2026) — รอตรวจ

เจ้าของตัดสินให้หน้ารับรองผลของ FM-TS-01 พิมพ์ลายเซ็นจริงที่บันทึกไว้ของผู้ประเมินกับผู้ตรวจสอบและอนุมัติ และให้ทั้งสองคนต้องมีลายเซ็น
ก่อนส่งผลหรือออกเอกสาร การตัดสินนี้ต่างจากข้อความข้างบนสามจุด — ยอมรับโดยเจตนา เฉพาะเอกสารชนิดนี้:

1. **ลายเซ็นของผู้ประเมินถูกพิมพ์โดยไม่มีการกดของเจ้าตัว** — ถูกพิมพ์ตอนหัวหน้ากด "ส่งผลให้ฝ่ายขาย" รวมถึงนัดที่ยังเป็น "นัดไว้/กำลังทำ"
   ซึ่งการส่งผลเป็นคนปิดให้ (ข้อ "ไม่สร้างลายเซ็นโดยปริยายให้ผู้ที่ไม่มี explicit sign action" ของหัวข้อ Document scope ไม่ใช้กับที่นั่งนี้)
   สิ่งที่ชดเชย: กล่องยืนยันส่งผลเอ่ยชื่อผู้ลงนามทั้งสองคนก่อนกด และ audit ของการออกเลขจด ที่นั่ง · ผู้ใช้ · ฉบับของลายเซ็น
2. **ปุ่ม "ออกเอกสาร" ให้หัวหน้าคนที่สามหรือผู้วางคิว (Planner) พิมพ์ลายเซ็นของผู้ลงนามทั้งสองคนได้** — รวมผลที่ส่งไปก่อนกติกานี้
   (ใบที่ตอบแล้วยังไม่มีเอกสาร) · ผู้วางคิวเพิ่มตามมติเจ้าของ 19/10/2026 (*"ให้ apisith planner ออกให้ด้วย"* — เขาส่งผล/ดึงผลกลับไม่ได้)
   ที่นั่งเป็นของผู้ประเมินกับผู้ส่งผลเดิมเสมอ ไม่ใช่ของคนกด (คนกดถูกจดเป็นผู้ออก `issuedBy` เท่านั้น — ลายเซ็นของเขาไม่ถูกอ่าน)
   กล่องยืนยันบอกข้อนี้ตรง ๆ · ไม่ถือเป็นการ backfill หลักฐานให้ approval เดิม:
   เอกสารที่ออกแล้ว (เช่น `SU-26100001-0`) ไม่ถูกเขียนทับ ได้ลายเซ็นต่อเมื่อดึงผลกลับแล้วส่งใหม่เป็น Rev ถัดไปเท่านั้น
3. **มีสำเนา JPEG ของลายเซ็นอยู่นอก `signature-assets`** — ไฟล์ที่ย่อและถมพื้นขาวแล้วถูกเก็บที่ `img/<sha>.jpg` ในถังส่วนตัว `survey-report`
   (ถังของเอกสารเอง) เพื่อให้กระดาษที่ตรึงแล้วเปิดได้ตลอดไป · **Revoke ไม่ลบสำเนานี้** และไฟล์เดียวกันใช้ร่วมกันทุกเอกสารของผู้ลงนามคนนั้น
   (การลบไฟล์ในถังนั้นวันหน้าต้องข้ามแถว `kind: 'sign'`) · เบราว์เซอร์ยังเข้าถึงได้เฉพาะผ่าน route เอกสารที่ตรวจสิทธิ์รายฉบับ ไม่มี public URL

ยามที่มาคู่กับข้อ 1–2 (รอบแก้ผลรีวิว 09/10 — ลายเซ็นถูกพิมพ์โดยไม่มีการกดของเจ้าตัว จึงต้องรู้แน่ว่าเป็น **ของคนที่ควรอยู่ที่นั่งนั้น**):
ที่นั่งผู้ประเมินพิมพ์ได้เฉพาะบัญชีฝ่ายบริการ (`canBeServiceAssignee`) · ที่นั่งผู้ตรวจสอบและอนุมัติพิมพ์ได้เฉพาะผู้มีสิทธิ์ส่งผลประเมิน
(`canSendSurveyResult`) · ชื่อใต้ลายเซ็นของผู้ประเมินมาจากบัญชีที่ผูกกับนัด ไม่ใช่จากข้อความที่พิมพ์ · บัญชีที่ไม่ผ่าน **ไม่ถูกอ่านไฟล์ในคลังเลย** ·
และเมื่อกติกาเปิด นัดประเมินที่ปิดงานแล้วเปลี่ยนผู้รับผิดชอบไม่ได้ (รายละเอียด `docs/survey-report-doc.md` → "PR-SIG → รอบแก้ผลรีวิว")

ที่ยังเป็นไปตามข้อความเดิม: ผู้ดูแลระบบอัปโหลดลายเซ็นแทนไม่ได้ (เจ้าตัวเพิ่มเองที่ "บัญชีของฉัน") · คลัง `signature-assets` ถูกอ่านอย่างเดียว ·
ไม่เก็บ raw image / base64 / ที่อยู่ไฟล์ใน audit payload · ฉบับที่ถูกอ้างแล้วยังอ้างได้หลัง Replace หรือ Revoke · ลูกค้ายังเซ็นมือ ·
ไม่เขียนแถว `document_signature_evidence` (ฉบับถูกตรึงในภาพนิ่งของเอกสารเอง แบบเดียวกับ FM-SA-04)

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
