# Decision 0012 — Settings Lifecycle Standard

วันที่: 20 กรกฎาคม 2026 · แก้ไขครั้งที่ 2: 21 กรกฎาคม 2026
สถานะ: ยืนยัน (ฉบับแก้ไขครั้งที่ 2 — แยกระดับ A/B, เพิ่ม discard/hide semantics)

## บริบท

การตั้งค่าข้อมูลระบบหลายตัวถูกสร้างก่อนมาตรฐาน versioning ของโปรแกรมนี้
(Decision 0003) จึงยังเป็นแบบ "แก้ตรง มีผลทันที": ไม่มีชั้นร่าง ไม่มีประวัติ
เวอร์ชัน และแก้แล้วย้อนตรวจไม่ได้ ขณะที่ surface ที่สร้างตั้งแต่ Phase 4A
เป็นต้นมา (ข้อมูลบริษัท, Workflow Template, Document Standards, Commercial
Presets) ใช้แพตเทิร์นเดียวกันหมดและพิสูจน์แล้วว่าใช้งานได้จริง

## การตัดสินใจ (ฉบับแก้ไขครั้งที่ 2 — 2026-07-21)

การตั้งค่าแบ่งเป็นสองระดับ:

- **ระดับ A ปฏิบัติการ** (ปฏิทินวันหยุด, แจ้งเตือน Google Chat) — ใช้ CRUD
  ธรรมดา ไม่ต้องมีชั้นร่าง/เวอร์ชัน; retrofit ตาม decision ฉบับแรก (mig
  0132/0133) ถูกย้อนกลับในงานแยก
- **ระดับ B ควบคุม** (ข้อมูลบริษัท, Workflow/Timeline Template, Document
  Standards, Commercial Presets) — ใช้ lifecycle:

> เพิ่ม/แก้ไข → บันทึกร่าง (Draft) → ยกเลิกร่างได้ถ้ายังไม่เผยแพร่ (Discard =
> ลบจริง) → เผยแพร่ (Publish) → เผยแพร่แล้วลบไม่ได้ ซ่อนได้อย่างเดียว (Hide)

กติกา discard/hide (mig `0136_settings_lifecycle_discard_hide.sql`):

- **ยกเลิกร่าง = DELETE จริง** — ร่างที่ไม่เคยเผยแพร่ไม่ใช่หลักฐาน; guard
  trigger เปิดช่อง DELETE เฉพาะแถว `status = 'draft'`; การยกเลิกบันทึกลง
  audit log (หลักฐานเดียวที่เหลือ); UI ใช้ปุ่ม "ยกเลิกร่าง" พร้อม Confirm
  ว่าจะหายถาวร
- **"ซ่อน" (Hide)** — เวอร์ชันที่เผยแพร่แล้วและถูกเวอร์ชันใหม่แทน (= archived
  เดิม): แถวคงอยู่ immutable แค่พ้นสถานะใช้งาน ดูย้อนหลังได้ในประวัติเวอร์ชัน;
  เกิดอัตโนมัติตอน publish ทดแทนเท่านั้น ไม่มี action ซ่อนตรง
- **ห้ามซ่อนเวอร์ชันที่กำลัง active** — guard trigger บล็อก published →
  archived ขณะ root ยังชี้แถวนั้น (`*_hide_active_forbidden`); ระบบต้องมี
  active เสมอ (Commercial Preset ใหม่ที่ยังไม่เคยเผยแพร่เป็นข้อยกเว้นเดิม —
  ยกเลิกร่างแรกจะลบ preset ทั้งตัว ไม่ทิ้ง preset เปล่า)

ข้อบังคับของแพตเทิร์นระดับ B (ต้นแบบ: mig `0120_organization_settings.sql` +
`lib/admin/organizationSettings.js`):

- แยก root record ออกจาก version records; root ชี้ Published version ที่ใช้งานอยู่
- Draft และ Published มีได้อย่างละไม่เกินหนึ่งรายการต่อ root (partial unique index)
- Published/ซ่อนแล้ว เป็น immutable ผ่าน guard trigger; เลิกใช้ = ซ่อน ไม่ลบ
- Publish/Discard ทำผ่าน database function แบบ transaction เดียว (lock root,
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

## ตารางสถานะ surface

| Surface | ระดับ | หน้า | Migration | สถานะ | หมายเหตุ |
|---|---|---|---|---|---|
| ข้อมูลบริษัท | B | `/settings/company` | 0120 + 0136 | เสร็จสมบูรณ์ | Phase 4A; discard/hide ตามฉบับแก้ไขครั้งที่ 2 |
| Workflow/Timeline Template | B | `/settings/workflow-templates` | 0121 + 0136 | เสร็จสมบูรณ์ | Phase 4B; discard ลบ steps ของร่างก่อนแล้วลบเวอร์ชัน |
| ลายเซ็นอิเล็กทรอนิกส์ | — | `/account` (own-scope) | 0122 | เสร็จสมบูรณ์ | Phase 5A — versioned + immutable ตามขอบเขตของ Decision 0006 (ไม่อยู่ใต้กติกา discard/hide) |
| Document Standards | B | `/settings/document-standards` | 0123 + 0136 | เสร็จสมบูรณ์ | Phase 6A; discard/hide ตามฉบับแก้ไขครั้งที่ 2 |
| Commercial Presets | B | `/settings/commercial-presets` | 0128 + 0136 | เสร็จสมบูรณ์ | Phase 7A; ยกเลิกร่างแรกของ preset ที่ไม่เคยเผยแพร่ = ลบ preset ทั้งตัว |
| ปฏิทินวันหยุด | A | `/settings/holidays` | 0132 → ย้อนกลับ | งานแยก | ฉบับแก้ไขครั้งที่ 2 จัดเป็นระดับ A = CRUD ธรรมดา — งานย้อนกลับ (mig 0134) ดำเนินการใน branch แยก |
| แจ้งเตือน Google Chat | A | `/settings/chat-webhooks` | 0133 → ย้อนกลับ | งานแยก | ฉบับแก้ไขครั้งที่ 2 จัดเป็นระดับ A = CRUD ธรรมดา — งานย้อนกลับ (mig 0134) ดำเนินการใน branch แยก |
| Template หมายเหตุใบเสนอราคา (`quote_note_templates`) | B (ผ่าน presets) | ในหน้าใบเสนอราคา | — | รอดำเนินการ | ตัวสุดท้ายที่ยังแก้ตรง — **ไม่ retrofit แยก**: Decision 0010 สร้าง Commercial Presets (mig 0128, มี `legacyTemplateId` ไว้ map) เป็นตัวแทนแบบมีเวอร์ชันแล้ว; ปิดงานโดยสวิตช์ consumer ฝั่งออกใบ → migrate ข้อมูลเข้า presets → ถอด API แก้ตรง แล้วเก็บตารางเดิมเป็นหลักฐาน |

สถานะ `เสร็จสมบูรณ์` ของ mig 0136 = โค้ด + migration ส่งมอบแล้ว รอรัน
migration บนฐานข้อมูลจริงและ UAT (แพตเทิร์นเดียวกับ Phase 7A/7B)

นอกขอบเขต decision นี้: ทะเบียน master data ที่มี approval workflow รายรายการ
ของตัวเองอยู่แล้ว (ลูกค้า, สินค้า, หมวดสินค้า) — ใช้กติกา pending/approve เดิม

## ผลตามมา (ฉบับแก้ไขครั้งที่ 2)

- ระดับ B ทั้ง 4 surface: ปุ่ม "เก็บฉบับร่าง" เปลี่ยนเป็น "ยกเลิกร่าง"
  (endpoint `/draft/[id]/discard`, RPC `discard_*_draft` ลบแถวจริง);
  ป้ายสถานะ archived ใน UI ใช้คำว่า "ซ่อนแล้ว"; audit log ของการยกเลิก
  (`action: delete`, before = แถวร่างเต็ม) เป็นหลักฐานเดียวที่เหลือ
- แถว published/archived ที่มีอยู่ก่อน mig 0136 ไม่ถูกแตะ — เปลี่ยนเฉพาะ
  พฤติกรรม action ต่อจากนี้; ฟังก์ชัน `archive_*_draft_atomic` ถูกถอดออก
- วันหยุดปี 2027 (ops deadline ก่อนสิ้นปี 2026 — ดู timeline review):
  กรอกผ่านหน้า CRUD ระดับ A ตามงานย้อนกลับใน branch แยก
