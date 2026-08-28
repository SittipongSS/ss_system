# สารบัญเอกสาร ss-system

**อ่านไฟล์นี้ก่อนเริ่มงานที่กินเวลามากกว่าหนึ่งคอมมิต** — เอกสารในโปรเจกต์นี้เก็บมติที่ตัดสินไปแล้ว
ถ้าไม่อ่านก่อน มีสิทธิ์ไปรื้อของที่เคยเคาะแล้วโดยไม่รู้ตัว

ปรับปรุงสารบัญล่าสุด 2026-08-12 · ทุกสถานะในรอบนี้ตรวจกับโค้ดจริงแล้ว

⚠️ รอบ 2026-08-12 ตรวจเจอสามแถวที่สถานะเน่า (เนื้อในเดินหน้าไปแล้วแต่ไม่มีใครแก้บรรทัดสถานะ):
`cross-department-requests-plan` (เขียนว่า "รอเริ่ม PR-1" ทั้งที่ปิดครบแล้ว) ·
`request-hub-rebuild-plan` (ไม่เคยมีบรรทัดสถานะเลย · เหลือ R-5 ข้อเดียว) ·
`scent-dev-panel-plan` (สารบัญเขียน "รอดำเนินการ" แต่ในไฟล์เขียน "กำลังดำเนินการ · เหลืองวด 3")

---

## กติกา

**คำสถานะมีแค่ 5 คำ** (ยืมมาจาก `system-modernization/` ให้ทั้งโปรเจกต์ใช้ชุดเดียว)

`รอดำเนินการ` · `กำลังดำเนินการ` · `รอตรวจ` · `เสร็จสมบูรณ์` · `ระงับ`

**เขียนสถานะที่หัวไฟล์เสมอ** รูปแบบ:

```
> สถานะ: **<คำจาก 5 คำ>** · ตรวจกับโค้ดเมื่อ <YYYY-MM-DD> · <หมายเหตุสั้น ๆ>
```

**กฎที่เจ็บมาแล้ว** — เอกสารในกองนี้เคยเน่าเพราะเนื้อในอัปเดตแต่บรรทัดสถานะไม่มีใครแก้
เช่น `SAHAMIT_PLAN.md` เขียนว่า "ยังไม่ลงมือ" ทั้งที่เฟส 0–4 เสร็จและ build ลงโค้ดแล้ว
ส่วน `PM_RESPONSIVE_PRODUCTIVITY_PLAN.md` อ้าง `lib/pm/commandCenter.js` ที่ไม่เคยมีอยู่จริง
ดังนั้น:

1. **แก้สถานะในคอมมิตเดียวกับที่แก้โค้ด** ไม่ใช่ตามเก็บทีหลัง
2. **path และชื่อไฟล์ในเอกสารเก่าเชื่อไม่ได้** ถ้าเอกสารตรวจไว้เกิน 2 สัปดาห์ ให้ยืนยันกับโค้ดก่อนใช้
3. เอกสารที่ `เสร็จสมบูรณ์` และไม่มีงานค้าง → `git mv` เข้า [archive/](archive/README.md) แล้วตัดออกจากสารบัญนี้

---

## 1. อ้างอิงถาวร — อ่านก่อนแตะโค้ดในโซนนั้น

ไม่ใช่แผน ไม่มีวันเสร็จ เป็นกฎที่ระบบยึดอยู่

| เอกสาร | ใช้ตอนไหน |
|---|---|
| [webapp/AGENTS.md](../webapp/AGENTS.md) | **กฎบังคับของโปรเจกต์** — ฟอร์มสร้าง/แก้ต้องเป็น component เดียวกัน |
| [module-ownership-rule.md](module-ownership-rule.md) | **กฎฝ่าย × ระบบ + กฎสามชั้น** — SA/RD/FN อยู่โมดูลของตัวเอง · เอกสารอยู่บ้านคนที่เริ่ม · ฐานข้อมูลเป็นของกลาง · เมนู = งานที่ฝ่ายนั้นทำ · ก่อนเพิ่มหน้า/เมนู/โมดูลใหม่ทุกครั้ง |
| [team-management-plan.md](team-management-plan.md) | **ออกแบบแล้ว รอเคาะ 3 ข้อ** (2026-08-28) — ย้ายการจัดทีมจากแอดมินไปเป็นของแต่ละฝ่าย · แยก "ทีมขาย" (สิทธิ์/ยอด) ออกจาก "ทีมปฏิบัติงาน" (จัดคน) · cap ใหม่ `team:manage` แทนการแจก `users:manage` | รอดำเนินการ |
| [webapp/UI_DESIGN_SYSTEM.md](../webapp/UI_DESIGN_SYSTEM.md) | ก่อนแตะ UI ทุกครั้ง — token/คลาสร่วม + รายการที่เคยไหลกลับ (หลังตรวจใหญ่ PR #807–839) |
| [form-design-rules.md](form-design-rules.md) | **ก่อนออกแบบฟอร์มใหม่ทุกครั้ง** — ลำดับคำถาม · การกรอก · ตารางเลือกคอนโทรล (dropdown/แผ่น/แถบขั้น/ชิป/แผงสองชั้น) + กับดักที่เจ็บมาแล้ว |
| [deal-forecast-by-category.md](deal-forecast-by-category.md) | **ก่อนแตะมูลค่าคาดการณ์ของดีล** (mig 0264 · 0265) — มูลค่า = แถวรายหมวด (หมวด · ปริมาตร+หน่วยปริมาตร · จำนวน · หน่วยขาย · ราคา/หน่วย) · **ปริมาตรไม่เข้าสูตรคิดเงิน** สลับกับหน่วยขายได้ง่าย · ยอดรวม **ล็อก** คิดจากแถวเท่านั้นแล้วเขียนลง `projectValue` เหมือนเดิม · หมวดของดีล = หมวดแถวแรก (ตัวกรองขั้นตอนไทม์ไลน์ — template มาจาก **ประเภทดีล**) · ดีลเก่าไม่ backfill · สูตรอยู่ที่ `lib/sales/dealValueItems.js` ที่เดียว |
| [empty-value-rule.md](empty-value-rule.md) | **ก่อนเขียนค่าที่อาจว่าง** — ค่าว่างทั้งระบบขึ้นเป็นขีด `—` (`naText()` ใน lib/format · เลิกใช้ `N/A` ตามมติ 17/08 ยกเว้นเอกสาร PDR) · ใช้กับที่แสดงผลเท่านั้น ห้ามใส่ลง `value` ของช่องที่พิมพ์ได้ · `0`/`false` ไม่ใช่ค่าว่าง · คำที่มีความหมายเฉพาะ ("ไม่มีกำหนด" · "ระบบ") เก็บไว้ |
| [typography-system.md](typography-system.md) | **ก่อนตั้งขนาด/ความหนา/ระยะห่างของตัวอักษร** — ตัวพิมพ์ระบบคือ **Sarabun** (มติ 2026-08-13) · ชื่อโทเคนตามหน้าที่ · กฎความหนา 4 ค่า · `--lh-thai` ทำไมต้องมี · ตัวเลขที่วัดตอนเปลี่ยนฟอนต์ + ความกว้างป้ายที่เหลือน้อยกว่า 2px |
| [master-code-scheme.md](master-code-scheme.md) | **ก่อนแตะรหัสที่ระบบรันเลขให้ทุกชนิด** (AR · FG · DL · PJ · PB · SV · SS · IS) — สวิตช์ "ระบบใหม่" ในโมดัลเพิ่ม · กติกา 4 หลัก/เลขรัน 10001 · เคาน์เตอร์ atomic (mig 0230) · **รหัสออกพร้อม insert ในทรานแซกชันเดียว ห้ามจองไว้ก่อน** (mig 0237/0240/0242) · **ลบร่างที่ไม่เคยอนุมัติ = เลขกลับมาใช้ได้ · เคยอนุมัติแล้ว = เลขตายถาวร** (mig 0248 · ตัดสินจาก `firstApprovedAt` ไม่ใช่ `approvalStatus`) · รหัสที่ระบบออกให้แก้ไม่ได้ · เช็คซ้ำ: ลูกค้า = เลขผู้เสียภาษี + สาขา (บล็อก) · สินค้า = ลูกค้า + ชื่อ + ขนาด (เตือน) |
| [system-rules-guarded.md](system-rules-guarded.md) | **กฎที่มีเทสต์บังคับแล้ว** — ทุก API route ต้องมีด่านสิทธิ์ · `ADMIN_LOCKDOWN` ต้องเป็น true · ห้ามเขียน `frozenAt: null` · จออนุมัติต้องบอกผลลัพธ์ · ช่องที่พิมพ์บนเอกสารต้องล้างการอนุมัติ · อ่านก่อนเพิ่ม route/จออนุมัติ/ช่องบนใบเสนอราคา |
| [legal-to-ra-rename.md](legal-to-ra-rename.md) | **ก่อนแตะ role/รหัสฝ่าย** — ฝ่ายกฎหมาย (LG/`legal`) เปลี่ยนเป็นฝ่ายกฎระเบียบและขึ้นทะเบียนผลิตภัณฑ์ (RA/`ra`) 2026-08-28 · `normalizeRole` แปลงตอนอ่าน ⇒ ลำดับ deploy กับลำดับย้ายบัญชีไม่สำคัญ · รหัสฝ่ายของขั้นตอนแม่แบบถูกบังคับ 3 ชั้น (CHECK สองตาราง + RPC) แก้ที่ `mig 0308` |
| [role-per-department.md](role-per-department.md) | **ยกเลิก role `staff`** (2026-08-28) — PC/PD/WH/QC/TS ได้ role ของตัวเอง · cap ตรงกับงานจริงตั้งแต่ชั้น role แทน "ถือกว้างแล้วแคบด้วยฝ่าย" · ย้ายบัญชีครบ + ถอดตัวแปลงช่วงเปลี่ยนผ่านแล้ว 2026-08-29 | เสร็จสมบูรณ์ |
| [excise-retail-price.md](excise-retail-price.md) | **ก่อนแตะภาษีสรรพสามิต** — สูตร 8.8% (สรรพสามิต 8% + ท้องถิ่น 10% ของ 8%) คิดจากราคาขายปลีกถอด VAT · ตัวอย่างเดินเลข 107 → 8.80 → เก็บลูกค้า 9.42 · ไม่มีราคาขายปลีก = ภาษี 0 ⇒ ยื่นขึ้นทะเบียนไม่ผ่าน |
| [row-scope-guards.md](row-scope-guards.md) | **ก่อนเขียน handler ที่แก้ของรายใบ** — `loadScoped()` โหลดแถว+ตรวจขอบเขตในจังหวะเดียว (ทะเบียน `SCOPED_TABLES`) · ใบเสนอราคา/ใบสั่งขายตรวจผ่าน "ดีลที่สังกัด" ไม่ใช่ตัวใบ · กฎ 6 ใน systemRules.test เป็น ratchet ห้ามเพิ่มการโหลดเอง |
| [customer-delete-guard.md](customer-delete-guard.md) | **ก่อนแตะเส้นลบลูกค้า/สินค้า หรือเพิ่มตารางที่ถือ `customerId`/`productId`** — FK เป็น SET NULL ⇒ ฐานไม่ได้กันให้ ด่านจริงอยู่ที่โค้ด · ทะเบียนประกาศที่เดียว (`REFERENCE_REGISTRY` — ลูกค้า 25 · สินค้า 15) · `npm run check:refs` เทียบกับฐานจริงไม่ให้ตกหล่น |
| [customer-attachment-scope.md](customer-attachment-scope.md) | **ก่อนแตะไฟล์แนบของลูกค้าหรือเพิ่ม docType ใหม่** — เอกสารส่วนบุคคล (บัตรประชาชน · ทะเบียนบ้าน · Bookbank · หนังสือมอบอำนาจ) เห็นเฉพาะทีมผู้ดูแล + admin · เอกสารธุรกิจเปิดกว้างเหมือนเดิมเพราะสรรพสามิตต้องใช้ · คนนอกทีมได้ "แถวที่ปิดเนื้อหา" ไม่ใช่แถวหาย (การ์ดเอกสารบังคับต้องยังนับถูก) · เปิดเอกสารบุคคลลง audit |
| [postgrest-row-cap.md](postgrest-row-cap.md) | **ก่อนเขียน query ที่อ่านหลายแถว** — Supabase ตั้ง Max rows = 1000 · PostgREST ตัดผลลัพธ์ **โดยไม่มี error** · `project_tasks` (2,820) · `personal_tasks` (1,045) เกินไปแล้วและเคยคืนข้อมูลไม่ครบจริง · ใช้ `fetchAll` + ลำดับที่นิ่ง (`.order()` ต้องพ่วง `id`) · ด่าน `npm run check:rowcap` |
| [webapp/BOUNDARY_MAP.md](../webapp/BOUNDARY_MAP.md) | พิมพ์เขียวสถาปัตยกรรม — entity ไหนเป็นของใคร |
| [rm-price-registry-split.md](rm-price-registry-split.md) | **ราคา F/FB จัดการที่ทะเบียนกลิ่น/สูตร · ทะเบียนวัสดุ = PM อย่างเดียว (รอโมดูลจัดซื้อ)** — ที่เก็บยังเป็น `material_prices` ที่เดียว · ก่อนแตะราคาวัสดุ/RM อ่านก่อน |
| [webapp/MASTER_DATA_PLAN.md](../webapp/MASTER_DATA_PLAN.md) §2 §3 | ก่อนแตะ `src/lib/master/` — มติที่ล็อก + กฎทอง 3 ข้อ (ตรวจแล้วยังตรงทุกข้อ) |
| [webapp/SALES_UX_PHASE0.md](../webapp/SALES_UX_PHASE0.md) | มาตรฐาน UX ฝั่งขาย — สถานะ `idle → dirty → saving → saved` |
| [webapp/ATTACHMENT_REQUIREMENT_SPEC.md](../webapp/ATTACHMENT_REQUIREMENT_SPEC.md) | ก่อนแตะไฟล์แนบ/เงื่อนไขความครบถ้วน |
| [webapp/DEPLOY.md](../webapp/DEPLOY.md) | Vercel + Supabase |
| [requests-rd-decision-log.md](requests-rd-decision-log.md) | มติสายคำร้อง RD — ม-1…ม-24 รอบแรก · ม-25…ม-62 รอบรื้อที่สอง · ม-63…ม-75 รอบแบบทั้งระบบ + ฟอร์ม PDR · ม-76…ม-94 รอบรื้อ 4 อาการ + Control Panel (2026-08-08) · ม-95…ม-96 เอกสาร PDR เหมือนกระดาษ FM-RD-01 + แบ่งหน้าเอง + พรีวิวเต็มจอครบทุกชนิด (2026-08-09) · PDR 2.2/2.3 เป็นต้นทุน/ราคาขายรายสินค้า (mig 0229) + หมวดใบสั่งขายที่เปิดคำร้องพัฒนากลิ่นได้ (2026-08-10) · รื้อโมดูล RD: ภาพรวมตอบ "วันนี้ทำอะไรก่อน" + ลบแดชบอร์ด RD (2026-08-11) · **รับเรื่อง = ตัดรอบ · "แจ้งกำหนดส่ง" เป็นก้าวที่สอง + สถานะ "รอกำหนดส่ง" + คำใหม่ "วันที่ต้องการรับงาน" (2026-08-19)** · **ม-137 ฝ่ายดึงงานที่ส่งแล้วกลับมาแก้ได้ (สายเอกสาร RD/FN — เผื่อแนบผิด · 2026-08-20)** |
| [scent-dev-system-ui-mockup.html](scent-dev-system-ui-mockup.html) | ⭐ **แบบหน้าจอ "พัฒนากลิ่น" ระดับทั้งระบบ** — SA × RD × ฐานข้อมูล เปิดมาเจออะไร กดต่อไปไหน |
| [rd-overview-options-mockup.html](rd-overview-options-mockup.html) | ⭐ **ม็อกอัพหน้าภาพรวม RD 3 แบบ + ตารางคิวที่เสนอ** — ผู้ใช้เลือกแบบ ก "วันนี้ทำอะไรก่อน" (2026-08-11) · เก็บไว้เป็นเหตุผลว่าทำไมไม่เลือกอีกสองแบบ |
| [rd-scent-dev-ui-mockup.html](rd-scent-dev-ui-mockup.html) | ⭐ **แบบหน้าจอ "พัฒนากลิ่น" รายก้าว** — ต้นฉบับที่โค้ดต้องเทียบ (ม-33) · **ตรวจกับโค้ดแล้ว 2026-08-17**: ถอดขั้น "AE Sup ยืนยัน" · แก้ตารางลายเซ็น (ไม่มีแถวไหนบล็อก) · เพิ่ม §10 เปลือกหน้ารายละเอียดที่ลงจริง · ⚠️ §04 ลงไปยังเป็นข้อเสนอ เพราะยังไม่มีใครเดินสาย direction จริงสักใบ |
| [formula-dev-system-ui-mockup.html](formula-dev-system-ui-mockup.html) | ⭐ **แบบหน้าจอ "พัฒนาสูตร" ระดับทั้งระบบ** — SA × RD × ฐานข้อมูล + ตารางเทียบว่าต่างจากพัฒนากลิ่นตรงไหน |
| [all-documents-system-ui-mockup.html](all-documents-system-ui-mockup.html) | ⭐ **แบบหน้าจอ "เอกสารของโครงการ/ดีล"** — 3 ทางที่เอกสารเข้าสายนี้ · ขอจาก R&D อย่างเดียว (ม-87) · §05 บันทึกว่าอะไรอยู่นอกสาย |
| [document-request-system-ui-mockup.html](document-request-system-ui-mockup.html) | ⭐ **แบบหน้าจอ "ขอเอกสาร" ทุกขั้นตอน SA × RD** — 8 ขั้นตาม ม-88 · ตรงกับโค้ดที่ส่งแล้วทุกจอ (เขียนใหม่หลัง ม-83…ม-88) |
| [info-inquiry-system-ui-mockup.html](info-inquiry-system-ui-mockup.html) | ⭐ **แบบหน้าจอ "สอบถามข้อมูล" ทุกขั้นตอน SA × RD** — หัวข้อสุดท้ายของชุดคำร้อง · ไม่มีรายการ ทั้งใบคือเธรด · ตรงกับโค้ดที่ merge แล้ว (ม-83/84/86/87/89/92) |
| [scent-dev-panel-plan.md](scent-dev-panel-plan.md) | **แผนพัฒนากลิ่น × Control Panel (ม-94 ขั้นสุดท้าย)** — งวด 1 ✓ (#1102) · งวด 2 ✓ (#1103) · **เหลืองวด 3: เดินวงจริงกับใบร่าง SB + อัปเดตม็อกอัพ** · สถานะ กำลังดำเนินการ |
| [scent-dev-detail-fix-plan.md](scent-dev-detail-fix-plan.md) | **แผนเก็บผลตรวจหน้ารายละเอียดคำร้อง หัวข้อพัฒนากลิ่น** (ตรวจกับ main 2026-08-17 · ใบ SB-26080002) — งวด 1 ✓ (#1295) ตัวนับ PDR ชุดเดียว + เดินสายกระทบยอด SO + คำที่เพี้ยน · งวด 2 ✓ (#1296) จอแคบให้การ์ดจัดการขึ้นก่อน (โหมด `controlFirst`) + ปุ่มแก้กดไม่ได้พร้อมเหตุผล · งวด 3 ✓ (#1297) รางพกชื่อคน/วันที่จริง + การ์ดใบสั่งขายที่หายไป + ที่มาของช่องที่ระบบเติม · งวด 4 ✓ แยก log ระบบออกจากบทสนทนา (ธง `narrative` + `UpdateLog` · opt-in รายชนิดเอกสาร) · **เหลืองวด 5: เลนงานแทน "ยังไม่มี direction" ที่พูดซ้ำ 4 ที่** · สถานะ กำลังดำเนินการ |
| [rd-formula-dev-ui-mockup.html](rd-formula-dev-ui-mockup.html) | ⭐ **แบบหน้าจอ "พัฒนาสูตร" รายก้าว** — P4 (ม-36) · §05/§06 เป็นคำถามค้างที่ตัดสินไปแล้ว ดูใบระดับทั้งระบบแทน |
| [lead-flow-ui-mockup.html](lead-flow-ui-mockup.html) | ⭐ **แบบหน้าจอ "ระบบลีด" ครบทุกฝ่าย** — MKT รับลีด → Sup คัดกรอง → Senior กระจาย → AE ติดต่อ/นัด/เปิดดีล + ตารางสิทธิ์ + ข้อเสนอปฏิทินนัด |
| [FM-RD-01-pdr-form-rev02.pdf](FM-RD-01-pdr-form-rev02.pdf) | ⭐ **ฟอร์มกระดาษ PDR ที่ใช้จริง** — ต้นฉบับของคำถามทั้งหมด (ม-52) |
| [pdr-form-ui-mockup.html](pdr-form-ui-mockup.html) | ⭐ **แบบหน้าจอฟอร์ม PDR** — ฟอร์มกรอก + หน้ารายละเอียด (N/A ทุกช่องว่าง) + ตารางความครบถ้วนเทียบกระดาษทีละข้อ |
| [system-modernization/ux-ui-rulebook.md](system-modernization/ux-ui-rulebook.md) · [document-design-system.md](system-modernization/document-design-system.md) | มาตรฐานเอกสาร A4/PDF |

**คู่มือผู้ใช้** (ไม่ใช่เอกสาร dev): [SALES_PLANNING_GUIDE.md](../webapp/SALES_PLANNING_GUIDE.md) · [EMPLOYEE_TURNOVER_GUIDE.md](../webapp/EMPLOYEE_TURNOVER_GUIDE.md)

---

## 2. งานค้างที่มีมติแล้ว — หยิบทำต่อได้เลย

เรียงตามความเร่ง

| เอกสาร | ค้างอะไร | สถานะ |
|---|---|---|
| [my-dashboard-schedule.md](my-dashboard-schedule.md) | "กำหนดการของฉัน" ในแดชบอร์ดของฉัน — การ์ดนัด/ถึงกำหนด + ปฏิทิน วัน/สัปดาห์/เดือน (ไม่มี migration) · โค้ดครบ · **รอ UAT บนบัญชีที่มีนัดจริง** · ยังไม่มีความยาวนัดใน `lead_events` (บล็อกยาว 1 ชม. ตามข้อสมมติ) | รอตรวจ |
| [sales-contract-plan.md](sales-contract-plan.md) | ระบบสัญญาในบริหารงานขาย (mig 0278 · รันแล้ว) · โค้ดครบ: ทะเบียน · ออกเลข+ตรึงเอกสาร · อัปโหลดฉบับลงนาม · แม่แบบมีแค่สัญญาออกแบบกลิ่น (จ้างผลิต/บริการรอต้นฉบับ) · รอ UAT | รอตรวจ |
| [task-waiting-and-chain.md](task-waiting-and-chain.md) | งานติดตาม: สถานะ "รอคนอื่น" + งานต่อเนื่อง (mig 0266) · โค้ดครบ · **ยังไม่รัน migration บนฐานจริง** และยังไม่ UAT | รอตรวจ |
| [timeline-dates-plan.md](timeline-dates-plan.md) | ครบทุกข้อแล้ว — เฟส 1–5 (PR #1198) · ของจริงบนใบพิมพ์ FM-PD-05 (PR #1200) · จุดสำคัญบน Gantt (รอ merge) · mig 0239 รันบนฐานจริงแล้ว | รอตรวจ |
| [excise-filing-plan.md](excise-filing-plan.md) | โค้ดครบใน **draft** PR #738 — ยังไม่ merge | รอตรวจ |
| [system-issue-reporting-plan.md](system-issue-reporting-plan.md) | merge แล้ว (PR #1068) · mig 0223 (เดิม 0219) รันแล้ว · เหลือ smoke test ด้วยบัญชีของฝ่าย · **ข้าม webhook ตามมติผู้ใช้ — เรื่องใหม่ยังไม่มีสัญญาณถึงใคร** | รอตรวจ |
| [costing-request-plan.md](costing-request-plan.md) | merge ครบ 3 PR · mig 0157/0158/0159 รัน prod แล้ว (ยืนยัน 2026-08-08) · เหลือ UAT ข้อ 1–17 | รอตรวจ |
| [excise-system-rework.md](excise-system-rework.md) | รื้อโมดูล `/tax` ทั้งก้อน (2026-08-28) — แจ้งเตือนข้ามเลนที่เคยเป็น `if` ว่างเปล่า · อายุงานนับจากจุดที่สถานะเริ่ม ไม่ใช่วันเปิดใบ · ย้ายคิดภาษี/ความพร้อมเอกสารไป server (เลิกโหลด products 342 + customers 508 ที่หน้าคิว) · `mig 0307` ล้างแท็บท้าย `fgCode` + `/api/nav/counts` เคย 403 ให้ทุก non-admin ทั้งเว็บ | รอตรวจ |
| [qt-so-tax-followup-plan.md](qt-so-tax-followup-plan.md) | 6 จุดขัดแผนจาก PR #739 + บั๊กที่ผู้ใช้เจอได้ | รอดำเนินการ |
| [business-line-vs-project-seam.md](business-line-vs-project-seam.md) · [business-line-level-and-handoff.md](business-line-level-and-handoff.md) | §1 กลับมติ 2026-08-20: **สายอยู่ที่ดีลด้วย** (mig 0275) และแม่แบบไทม์ไลน์เป็นคู่ (สาย, ประเภทดีล) — โค้ดครบ · แม่แบบสายบริการ 3 ใบก๊อปจากสายสินค้ามาให้แก้ (mig 0276) · **ยังไม่รัน migration บนฐานจริง** · ลูกศรที่ 3 (คิวรับงานเข้าบริการ) ยังไม่เขียนโค้ด | รอตรวจ |
| [order-confirmation-move-plan.md](order-confirmation-move-plan.md) | **ยืนยันคำสั่งซื้อย้ายจากตอนปิด Won มาที่ใบสั่งขาย** (2026-08-24) — ปิด Won เหลือโมดัลยืนยัน + เลือกโครงการได้ในตัว · ฟอร์มสร้างใบสั่งขายเต็มหน้า (เอกสารยืนยัน + งวดชำระ + เงินงวดแรก) · ด่านเอกสารอยู่ที่ยื่นอนุมัติ · **ยังไม่รัน mig 0284/0285** · ยังไม่ UAT | รอตรวจ |
| [billing-request-flow-plan.md](billing-request-flow-plan.md) | สายเอกสารการเงิน QT → SO → คำร้อง → FN · **B-1…B-5 ครบ** (เปิดฝ่าย FN + คิวคำร้องบัญชี · คำร้องยึด QT พร้อมยอดที่ขอ · เลขที่เอกสารรายบรรทัด · งวดชำระตั้งแต่ร่าง SO + `frozenAt` · ผูกคำร้องกับงวด · mig 0257–0260) · **รอ UAT** · สายบริการ C-1…C-5 ยกไปรอบหน้า | รอตรวจ |
| [service-ui-redesign-mockup.html](service-ui-redesign-mockup.html) | **ม็อกรื้อ UI โมดูลบริการทั้งโมดูล 13 จอ (2026-08-28)** — เมนูใหม่ 5 รายการ (เพิ่ม “งานเข้าใหม่”) · จอใหม่: ด่านเข้าไซต์ · โซน · อุปกรณ์ · ใบส่งงาน · ปิดงาน · **มติสำคัญ: TS ไม่ใช่ต้นทางของงาน** — นัดเกิดจากรอบ/งานที่มีต้นเรื่อง แล้วต้องผ่านด่านก่อนขึ้นตาราง · **ที่อยู่ลูกค้า ≠ ไซต์บริการ** ก๊อปมาตั้งต้นได้แต่ไม่ผูกให้เปลี่ยนตามกัน · ม็อกใช้โทเคน+ชื่อคลาสจริง แปลงเป็นโค้ดได้ตรง | รอดำเนินการ |
| [service-business-system-plan.md](service-business-system-plan.md) · [service-field-operations.md](service-field-operations.md) | มติเคาะแล้ว · **G-1 เสร็จไปแล้วโดยไม่มีใครอัปเดต** (FN + mig 0212 + mig 0192) · C-3 ลงเป็นงวดชำระ SO (mig 0245) · **F-1 เสร็จ 2026-08-27** (เมนู งานวันนี้/จัดคิวช่าง + `/service/today` + rename `zone`→`routeZone` mig 0304 + ปลดการ์ดระบบ) · มติใหม่ 2026-08-27: สัญญาบริการต่อยอด `sales_contracts` ไม่แยกตาราง · Zone เป็น entity ถาวรเกิดโยงจาก SO line · ส่วนสัญญา/งวด/ด่านเงิน **พักรอต้นฉบับสัญญาจ้างบริการ** — ตรวจกับ `billing-request-flow-plan.md` §1 ก่อนหยิบ | กำลังดำเนินการ · **เฟส 4 (งานเข้าใหม่ /service/intake) เสร็จ 2026-08-28 → [service-intake-phase4.md](service-intake-phase4.md)** |
| [service-uat-2026-08-28.md](service-uat-2026-08-28.md) | รอตรวจ | ผล UAT โมดูลบริการทั้งโมดูล (สวมบทแอดมิน) — 4 บั๊กที่แก้แล้ว + 6 เรื่องที่ต้องตัดสิน + รายการของทดสอบสำหรับรีเซ็ต |
| [webapp/SALES_REVAMP_PLAN.md](../webapp/SALES_REVAMP_PLAN.md) | แผนแม่บทรื้อสายขาย Lead → ปิดโครงการ | รอดำเนินการ |
| [webapp/DEAL_PROJECT_RESTRUCTURE_PLAN.md](../webapp/DEAL_PROJECT_RESTRUCTURE_PLAN.md) | มติครบ พร้อมเริ่มเฟส 1 | รอดำเนินการ |
| [webapp/SALES_PM_MERGE_PLAN.md](../webapp/SALES_PM_MERGE_PLAN.md) | หนี้ N7 · N8 · N9 (เฟส 1–5 เสร็จแล้ว) | กำลังดำเนินการ |
| [webapp/BOUNDARY_MAP_PLAN.md](../webapp/BOUNDARY_MAP_PLAN.md) | 9/13 | กำลังดำเนินการ |
| [webapp/CUSTOMER_BRAND_PRODUCT_PLAN.md](../webapp/CUSTOMER_BRAND_PRODUCT_PLAN.md) | P0 เสร็จ · P1 ขึ้นไปยังไม่ลงมือ | กำลังดำเนินการ |
| [webapp/SAHAMIT_REMAINING_PLAN.md](../webapp/SAHAMIT_REMAINING_PLAN.md) · [SAHAMIT_SHIFT_SUGGESTION_PLAN.md](../webapp/SAHAMIT_SHIFT_SUGGESTION_PLAN.md) | งานค้างสายสหมิตร | กำลังดำเนินการ |
| [webapp/SALES_PM_ROADMAP.md](../webapp/SALES_PM_ROADMAP.md) | 4/5 | กำลังดำเนินการ |
| [webapp/PM_COMMAND_CENTER_PLAN.md](../webapp/PM_COMMAND_CENTER_PLAN.md) · [PM_RESPONSIVE_PRODUCTIVITY_PLAN.md](../webapp/PM_RESPONSIVE_PRODUCTIVITY_PLAN.md) | ⚠️ ยังไม่เริ่มสักสเต็ป · **ground truth ในเอกสารเก่าแล้ว ต้องสำรวจใหม่ก่อนรื้อฟื้น** | รอดำเนินการ |

---

## 3. ร่างที่ยังไม่ได้เคาะ — ต้องถามเจ้าของก่อนหยิบ

ค้างมาตั้งแต่ต้นเดือนกรกฎาคม ยังไม่รู้ว่าจะเอาต่อหรือพับ

| เอกสาร | เรื่อง |
|---|---|
| [webapp/MGMT_PLAN.md](../webapp/MGMT_PLAN.md) | โมดูลงานบริหาร (ร่าง 2 · 2026-07-01) |
| [webapp/SALES_DEAL_HUB_PLAN.md](../webapp/SALES_DEAL_HUB_PLAN.md) | ทำหน้า `deals/[id]` เป็นศูนย์บัญชาการดีล |
| [webapp/SAHAMIT_PHASE5B_DESIGN.md](../webapp/SAHAMIT_PHASE5B_DESIGN.md) | Shift/Cut Audit · Locked cells · Coverage |
| [webapp/SAHAMIT_UI_REVAMP_PLAN.md](../webapp/SAHAMIT_UI_REVAMP_PLAN.md) | รื้อ UI Forecast/PO/Reconciliation |
| [entity-updates-plan.md](entity-updates-plan.md) | เธรดอัปเดตของกลาง — รอเคาะก่อนเริ่มโค้ด |
| [notifications-inbox.md](notifications-inbox.md) | **ช่องทางแจ้งเตือนเดียวของระบบ** (mig 0185) — กระดิ่ง + หน้า `/notifications` · วิธีนับ · กติกาอ่านแล้ว · §5 บั๊ก proxy ที่ทำให้ Vercel Cron โดน 401 · **§6–7 ถอด Google Chat ออกทั้งระบบ (mig 0236) + รายการที่ยอมให้เงียบ** |

---

## 4. โปรแกรม System Modernization

35 ไฟล์ จัดระบบครบในตัวเองแล้ว — **มีสารบัญของตัวเอง ไม่ต้องไล่จากที่นี่**

→ [system-modernization/README.md](system-modernization/README.md) (ตาราง roadmap เฟส 0–9 + สถานะรายเฟส)

เฟส 0–6B `เสร็จสมบูรณ์` · 7A–7D `รอตรวจ` (รอ UAT + ยืนยันการรัน migration บนฐานจริง) ·
เฟส 8–9 (Permission redesign) `รอดำเนินการ` เป็นลำดับสุดท้ายของโปรแกรม

**มติ (ADR) 15 ใบ** อยู่ที่ [system-modernization/decisions/](system-modernization/decisions/) —
เป็นแพตเทิร์นที่ควรลอกไปใช้กับส่วนอื่นของโปรเจกต์

---

## 5. เสร็จแล้ว

→ [archive/](archive/README.md) — 7 ไฟล์ เก็บเป็นหลักฐานการตัดสินใจ ไม่ใช่งานค้าง

| เอกสาร | ปิดเมื่อ | หมายเหตุ |
|---|---|---|
| [request-hub-rebuild-plan.md](request-hub-rebuild-plan.md) | 2026-08-12 | R-1…R-6 ครบ · R-5 (FK `RESTRICT` กันลบทะเบียนแล้วลิงก์หายเงียบ) ปิดด้วย mig 0232 · เหลือหนี้เก่าคนละก้อน: `material_prices_identity_uk` ยังยึด `formulaCode` (text) |
| [cross-department-requests-plan.md](cross-department-requests-plan.md) | 2026-08-12 | รวมสามเมนูเป็น `dept_requests` ครบแล้ว (mig 0171–0174 · notifications · role `executive`) · **บรรทัดสถานะเดิมค้างว่า "รอเริ่ม PR-1" มาสองสัปดาห์** — ตรวจกับโค้ดแล้วปิดเล่ม · ของที่ยังค้างข้อเดียวย้ายไปอยู่ `request-hub-rebuild-plan.md` (R-5) |

## 6. แบบหน้าจอ

[scent-dev-system-ui-mockup.html](scent-dev-system-ui-mockup.html) ·
[formula-dev-system-ui-mockup.html](formula-dev-system-ui-mockup.html) ·
[document-request-system-ui-mockup.html](document-request-system-ui-mockup.html) ·
[all-documents-system-ui-mockup.html](all-documents-system-ui-mockup.html) ·
[pdr-form-ui-mockup.html](pdr-form-ui-mockup.html) ·
[nav-topbar-single-row.html](nav-topbar-single-row.html) · [service-system-ui-mockup.html](service-system-ui-mockup.html) ·
[system-issue-ui-mockup.html](system-issue-ui-mockup.html) ·
[lead-flow-ui-mockup.html](lead-flow-ui-mockup.html) ·
[scent-dev-ui-revamp-proposal.html](scent-dev-ui-revamp-proposal.html) **(ข้อเสนอ · รอเคาะ)** ·
[system-modernization/visual-directions/](system-modernization/visual-directions/)
