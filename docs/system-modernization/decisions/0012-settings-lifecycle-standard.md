# Decision 0012 — Settings Lifecycle Standard

วันที่: 20 กรกฎาคม 2026
สถานะ: ยืนยัน — retrofit สอง surface สุดท้ายส่งมอบแล้ว (mig 0132/0133)

## บริบท

การตั้งค่าข้อมูลระบบหลายตัวถูกสร้างก่อนมาตรฐาน versioning ของโปรแกรมนี้
(Decision 0003) จึงยังเป็นแบบ "แก้ตรง มีผลทันที": ไม่มีชั้นร่าง ไม่มีประวัติ
เวอร์ชัน และแก้แล้วย้อนตรวจไม่ได้ ขณะที่ surface ที่สร้างตั้งแต่ Phase 4A
เป็นต้นมา (ข้อมูลบริษัท, Workflow Template, Document Standards, Commercial
Presets) ใช้แพตเทิร์นเดียวกันหมดและพิสูจน์แล้วว่าใช้งานได้จริง

## การตัดสินใจ

การตั้งค่าข้อมูลระบบ **ทุกตัว** ต้องใช้ lifecycle เดียวกัน:

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

## ตารางสถานะ surface

| Surface | หน้า | Migration | สถานะ | หมายเหตุ |
|---|---|---|---|---|
| ข้อมูลบริษัท | `/settings/company` | 0120 | เสร็จสมบูรณ์ | Phase 4A |
| Workflow/Timeline Template | `/settings/workflow-templates` | 0121 | เสร็จสมบูรณ์ | Phase 4B |
| ลายเซ็นอิเล็กทรอนิกส์ | `/account` (own-scope) | 0122 | เสร็จสมบูรณ์ | Phase 5A — versioned + immutable ตามขอบเขตของ Decision 0006 |
| Document Standards | `/settings/document-standards` | 0123 | เสร็จสมบูรณ์ | Phase 6A |
| Commercial Presets | `/settings/commercial-presets` | 0128 | เสร็จสมบูรณ์ | Phase 7A |
| ปฏิทินวันหยุด | `/settings/holidays` | 0132 | รอตรวจ | Retrofit ตาม decision นี้ — หนึ่งเวอร์ชัน = ชุดวันหยุดทั้งชุด (เผยแพร่วันหยุดปีใหม่ได้ในครั้งเดียว); ตัวคำนวณไทม์ไลน์อ่าน Published เท่านั้น; ตาราง `holidays` เดิมคงไว้เป็น seed/fallback |
| แจ้งเตือน Google Chat | `/settings/chat-webhooks` | 0133 | รอตรวจ | Retrofit ตาม decision นี้ — root ต่อ space; space ที่ไม่เคยตั้งค่าไม่ seed Published เพื่อคง env fallback เดิม |
| Template หมายเหตุใบเสนอราคา (`quote_note_templates`) | ในหน้าใบเสนอราคา | — | รอดำเนินการ | ตัวสุดท้ายที่ยังแก้ตรง — **ไม่ retrofit แยก**: Decision 0010 สร้าง Commercial Presets (mig 0128, มี `legacyTemplateId` ไว้ map) เป็นตัวแทนแบบมีเวอร์ชันแล้ว; ปิดงานโดยสวิตช์ consumer ฝั่งออกใบ → migrate ข้อมูลเข้า presets → ถอด API แก้ตรง แล้วเก็บตารางเดิมเป็นหลักฐาน |

สถานะ `รอตรวจ` = โค้ด + migration ส่งมอบแล้ว รอรัน migration บนฐานข้อมูลจริง
และ UAT (แพตเทิร์นเดียวกับ Phase 7A/7B)

นอกขอบเขต decision นี้: ทะเบียน master data ที่มี approval workflow รายรายการ
ของตัวเองอยู่แล้ว (ลูกค้า, สินค้า, หมวดสินค้า) — ใช้กติกา pending/approve เดิม

## ผลตามมา

- วันหยุด: การกรอกวันหยุดปี 2027 (ops deadline ก่อนสิ้นปี 2026 — ดู
  timeline review) ทำเป็นฉบับร่างชุดเดียว วางรายการทั้งปีจากประกาศ ครม.
  แล้วเผยแพร่ครั้งเดียว มีหลักฐานผู้เผยแพร่และ diff เทียบฉบับเดิม
- Webhook: เปลี่ยน space มีประวัติทุกครั้ง และทดสอบ URL ของฉบับร่างได้ก่อนเผยแพร่
- API แก้ตรง (POST/DELETE `/api/holidays*`, PUT `/api/chat-webhooks`) ถูกถอดออก
  — เขียนได้ผ่านเส้นทาง draft เท่านั้น สิทธิ์คงเดิม (`master:manage`) ไม่ขยาย/ไม่หด
