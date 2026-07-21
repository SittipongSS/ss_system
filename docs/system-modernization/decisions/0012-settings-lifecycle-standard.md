# Decision 0012 — Settings Lifecycle Standard

วันที่: 20 กรกฎาคม 2026 · ฉบับแก้ไขครั้งที่ 2: 21 กรกฎาคม 2026
สถานะ: ยืนยัน — ขอบเขตจำกัดที่ 4 surface ควบคุม; retrofit วันหยุด/Chat webhooks
ถูกย้อนกลับแล้ว (mig 0134 ถอน 0132/0133)

## บริบท

การตั้งค่าข้อมูลระบบหลายตัวถูกสร้างก่อนมาตรฐาน versioning ของโปรแกรมนี้
(Decision 0003) จึงยังเป็นแบบ "แก้ตรง มีผลทันที": ไม่มีชั้นร่าง ไม่มีประวัติ
เวอร์ชัน และแก้แล้วย้อนตรวจไม่ได้ ขณะที่ surface ที่สร้างตั้งแต่ Phase 4A
เป็นต้นมา (ข้อมูลบริษัท, Workflow Template, Document Standards, Commercial
Presets) ใช้แพตเทิร์นเดียวกันหมดและพิสูจน์แล้วว่าใช้งานได้จริง

## การตัดสินใจ

การตั้งค่าข้อมูลระบบ **เชิงนโยบาย/โครงสร้าง** ต้องใช้ lifecycle เดียวกัน
(เดิมเขียนว่า "ทุกตัว" — ฉบับแก้ไขครั้งที่ 2 จำกัดขอบเขต ดูหัวข้อถัดไป):

> เพิ่ม/แก้ไข → บันทึกร่าง (Draft) → เผยแพร่ (Publish) → พัก/ปิด/เก็บ (Archive)

ข้อบังคับของแพตเทิร์น (ต้นแบบ: mig `0120_organization_settings.sql` +
`lib/admin/organizationSettings.js`):

- แยก root record ออกจาก version records; root ชี้ Published version ที่ใช้งานอยู่
- Draft และ Published มีได้อย่างละไม่เกินหนึ่งรายการต่อ root (partial unique index)
- Published/Archived เป็น immutable ผ่าน guard trigger; เลิกใช้ = Archive ไม่ลบ
- Publish/Archive ทำผ่าน database function แบบ transaction เดียว (lock root,
  ตรวจ `expectedUpdatedAt`, ห้าม client ส่ง payload ใหม่มากับคำสั่ง transition)
- Publish ต้องมีหมายเหตุการเปลี่ยนแปลง (change note)
- ตารางเปิด RLS ไม่มี browser-facing policy; ทุก read/write ผ่าน server API +
  service role หลังตรวจ authorization
- Migration seed ข้อมูลปัจจุบันเป็น Published Version 1 — พฤติกรรมของ consumer
  ต้องไม่เปลี่ยนสำหรับข้อมูลเดิม
- **Consumer อ่านจาก Published version เท่านั้น** — ฉบับร่างไม่มีผลกับระบบ
  จนกว่าจะเผยแพร่
- UI ตาม Page Header standard ใน [UX/UI Rulebook](../ux-ui-rulebook.md) +
  Drawer house pattern; ไม่มี Auto-save

## ฉบับแก้ไขครั้งที่ 2 (21 กรกฎาคม 2026) — แยกประเภท "ข้อมูลปฏิบัติการ"

lifecycle ร่าง/เผยแพร่ข้างต้นใช้กับ **การตั้งค่าเชิงนโยบาย/โครงสร้าง** เท่านั้น
(4 surface ควบคุม: ข้อมูลบริษัท, Workflow Template, Document Standards,
Commercial Presets — รวมลายเซ็นตามขอบเขต Decision 0006)

**ปฏิทินวันหยุด** และ **แจ้งเตือน Google Chat** ถูกจัดประเภทใหม่เป็น
"ข้อมูลปฏิบัติการ": รายการอิสระที่แก้ทีละจุดและต้องมีผลทันที ไม่ใช่ชุดนโยบาย
ที่ต้องเผยแพร่ทั้งชุด — ใช้ lifecycle **เพิ่ม → แก้ไข → บันทึก → ลบ** ธรรมดา
แก้ตรงบนตารางเดิม (`holidays` mig 0018, `chat_webhooks` mig 0099) โดยคงกติกา:

- Confirm ก่อนบันทึก/ลบเสมอ (no-auto-save); ปุ่มลบ = ลบจริง พร้อมระบุสิ่งที่จะหาย
- `recordAudit` ทุกการเปลี่ยนแปลง (webhook URL ถูก mask token ก่อนลง audit)
- สิทธิ์ `master:manage` เดิม ไม่ขยาย/ไม่หด

retrofit ของ mig 0132/0133 ถูกถอนด้วย **mig 0134** (DROP ตาราง/function ทั้งหมด
ที่สองไฟล์นั้นสร้าง — ปลอดภัยเพราะตาราง version มีแต่ seed ที่คัดลอกจากตารางเดิม)

## ตารางสถานะ surface

| Surface | หน้า | Migration | สถานะ | หมายเหตุ |
|---|---|---|---|---|
| ข้อมูลบริษัท | `/settings/company` | 0120 | เสร็จสมบูรณ์ | Phase 4A |
| Workflow/Timeline Template | `/settings/workflow-templates` | 0121 | เสร็จสมบูรณ์ | Phase 4B |
| ลายเซ็นอิเล็กทรอนิกส์ | `/account` (own-scope) | 0122 | เสร็จสมบูรณ์ | Phase 5A — versioned + immutable ตามขอบเขตของ Decision 0006 |
| Document Standards | `/settings/document-standards` | 0123 | เสร็จสมบูรณ์ | Phase 6A |
| Commercial Presets | `/settings/commercial-presets` | 0128 | เสร็จสมบูรณ์ | Phase 7A |
| ปฏิทินวันหยุด | `/settings/holidays` | 0132 → ถอนด้วย 0134 | ย้อนกลับแล้ว | ฉบับแก้ไขครั้งที่ 2: ข้อมูลปฏิบัติการ — CRUD ตรงบนตาราง `holidays` (mig 0018) + Confirm + audit; ตัวคำนวณไทม์ไลน์อ่านตารางเดิมตรง ๆ |
| แจ้งเตือน Google Chat | `/settings/chat-webhooks` | 0133 → ถอนด้วย 0134 | ย้อนกลับแล้ว | ฉบับแก้ไขครั้งที่ 2: ข้อมูลปฏิบัติการ — CRUD ตรงบนตาราง `chat_webhooks` (mig 0099) + Confirm + audit; env fallback เดิมคงอยู่ |
| Template หมายเหตุใบเสนอราคา (`quote_note_templates`) | ในหน้าใบเสนอราคา | — | รอดำเนินการ | ตัวสุดท้ายที่ยังแก้ตรง — **ไม่ retrofit แยก**: Decision 0010 สร้าง Commercial Presets (mig 0128, มี `legacyTemplateId` ไว้ map) เป็นตัวแทนแบบมีเวอร์ชันแล้ว; ปิดงานโดยสวิตช์ consumer ฝั่งออกใบ → migrate ข้อมูลเข้า presets → ถอด API แก้ตรง แล้วเก็บตารางเดิมเป็นหลักฐาน |

สถานะ `ย้อนกลับแล้ว` = โค้ดกลับเป็น CRUD ตรงแล้ว — **ค้างรัน mig 0134 มือบน
Supabase production** (0132/0133 ถูกรันไปแล้ว ตาราง version มีแต่ seed
DROP ได้ปลอดภัย ข้อมูลจริงอยู่ตารางเดิมครบ)

นอกขอบเขต decision นี้: ทะเบียน master data ที่มี approval workflow รายรายการ
ของตัวเองอยู่แล้ว (ลูกค้า, สินค้า, หมวดสินค้า) — ใช้กติกา pending/approve เดิม

## ผลตามมา (ตามฉบับแก้ไขครั้งที่ 2)

- วันหยุด: การกรอกวันหยุดปี 2027 (ops deadline ก่อนสิ้นปี 2026 — ดู
  timeline review) กรอกทีละวันบนหน้า `/settings/holidays` ตามประกาศ ครม.
  แต่ละรายการมี Confirm + audit; มีผลกับไทม์ไลน์ที่สร้าง/แก้ไขหลังจากนั้นทันที
- Webhook: แก้แล้วมีผลทันที ประวัติการเปลี่ยนดูได้จาก audit log
  (URL ถูก mask token ก่อนบันทึก)
- API แก้ตรง (POST/DELETE `/api/holidays*`, PUT `/api/chat-webhooks`)
  ถูกคืนกลับมาเป็นเส้นทางเขียนหลัก; เส้นทาง draft/publish ทั้งหมดถูกถอดออก
  สิทธิ์คงเดิม (`master:manage`) ไม่ขยาย/ไม่หด
