# สารบัญเอกสาร ss-system

**อ่านไฟล์นี้ก่อนเริ่มงานที่กินเวลามากกว่าหนึ่งคอมมิต** — เอกสารในโปรเจกต์นี้เก็บมติที่ตัดสินไปแล้ว
ถ้าไม่อ่านก่อน มีสิทธิ์ไปรื้อของที่เคยเคาะแล้วโดยไม่รู้ตัว

ปรับปรุงสารบัญล่าสุด 2026-08-06 · ทุกสถานะในรอบนี้ตรวจกับโค้ดจริงแล้ว

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
| [module-ownership-rule.md](module-ownership-rule.md) | **กฎฝ่าย × ระบบ** — SA อยู่บริหารงานขาย · RD อยู่วิจัยและพัฒนา · ฐานข้อมูลเป็นของกลาง · ก่อนเพิ่มหน้า/เมนูใหม่ทุกครั้ง |
| [webapp/UI_DESIGN_SYSTEM.md](../webapp/UI_DESIGN_SYSTEM.md) | ก่อนแตะ UI ทุกครั้ง — token/คลาสร่วม + รายการที่เคยไหลกลับ (หลังตรวจใหญ่ PR #807–839) |
| [form-design-rules.md](form-design-rules.md) | **ก่อนออกแบบฟอร์มใหม่ทุกครั้ง** — ลำดับคำถาม · การกรอก · ตารางเลือกคอนโทรล (dropdown/แผ่น/แถบขั้น/ชิป/แผงสองชั้น) + กับดักที่เจ็บมาแล้ว |
| [webapp/BOUNDARY_MAP.md](../webapp/BOUNDARY_MAP.md) | พิมพ์เขียวสถาปัตยกรรม — entity ไหนเป็นของใคร |
| [webapp/MASTER_DATA_PLAN.md](../webapp/MASTER_DATA_PLAN.md) §2 §3 | ก่อนแตะ `src/lib/master/` — มติที่ล็อก + กฎทอง 3 ข้อ (ตรวจแล้วยังตรงทุกข้อ) |
| [webapp/SALES_UX_PHASE0.md](../webapp/SALES_UX_PHASE0.md) | มาตรฐาน UX ฝั่งขาย — สถานะ `idle → dirty → saving → saved` |
| [webapp/ATTACHMENT_REQUIREMENT_SPEC.md](../webapp/ATTACHMENT_REQUIREMENT_SPEC.md) | ก่อนแตะไฟล์แนบ/เงื่อนไขความครบถ้วน |
| [webapp/DEPLOY.md](../webapp/DEPLOY.md) | Vercel + Supabase |
| [requests-rd-decision-log.md](requests-rd-decision-log.md) | มติสายคำร้อง RD — ม-1…ม-24 รอบแรก · ม-25…ม-62 รอบรื้อที่สอง · ม-63…ม-75 รอบแบบทั้งระบบ + ฟอร์ม PDR · ม-76…ม-94 รอบรื้อ 4 อาการ + Control Panel (2026-08-08) · **ม-95…ม-96 เอกสาร PDR เหมือนกระดาษ FM-RD-01 + แบ่งหน้าเอง + พรีวิวเต็มจอครบทุกชนิด (2026-08-09)** |
| [scent-dev-system-ui-mockup.html](scent-dev-system-ui-mockup.html) | ⭐ **แบบหน้าจอ "พัฒนากลิ่น" ระดับทั้งระบบ** — SA × RD × ฐานข้อมูล เปิดมาเจออะไร กดต่อไปไหน |
| [rd-scent-dev-ui-mockup.html](rd-scent-dev-ui-mockup.html) | ⭐ **แบบหน้าจอ "พัฒนากลิ่น" รายก้าว** — ต้นฉบับที่โค้ดต้องเทียบ (ม-33) |
| [formula-dev-system-ui-mockup.html](formula-dev-system-ui-mockup.html) | ⭐ **แบบหน้าจอ "พัฒนาสูตร" ระดับทั้งระบบ** — SA × RD × ฐานข้อมูล + ตารางเทียบว่าต่างจากพัฒนากลิ่นตรงไหน |
| [all-documents-system-ui-mockup.html](all-documents-system-ui-mockup.html) | ⭐ **แบบหน้าจอ "เอกสารของโครงการ/ดีล"** — 3 ทางที่เอกสารเข้าสายนี้ · ขอจาก R&D อย่างเดียว (ม-87) · §05 บันทึกว่าอะไรอยู่นอกสาย |
| [document-request-system-ui-mockup.html](document-request-system-ui-mockup.html) | ⭐ **แบบหน้าจอ "ขอเอกสาร" ทุกขั้นตอน SA × RD** — 8 ขั้นตาม ม-88 · ตรงกับโค้ดที่ส่งแล้วทุกจอ (เขียนใหม่หลัง ม-83…ม-88) |
| [info-inquiry-system-ui-mockup.html](info-inquiry-system-ui-mockup.html) | ⭐ **แบบหน้าจอ "สอบถามข้อมูล" ทุกขั้นตอน SA × RD** — หัวข้อสุดท้ายของชุดคำร้อง · ไม่มีรายการ ทั้งใบคือเธรด · ตรงกับโค้ดที่ merge แล้ว (ม-83/84/86/87/89/92) |
| [scent-dev-panel-plan.md](scent-dev-panel-plan.md) | **แผนพัฒนากลิ่น × Control Panel (ม-94 ขั้นสุดท้าย)** — 3 งวด · โฟกัส PDR (รอเคาะทาง ก/ข/ค) · สถานะ รอดำเนินการ |
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
| [excise-filing-plan.md](excise-filing-plan.md) | โค้ดครบใน **draft** PR #738 — ยังไม่ merge | รอตรวจ |
| [system-issue-reporting-plan.md](system-issue-reporting-plan.md) | merge แล้ว (PR #1068) · mig 0223 (เดิม 0219) รันแล้ว · เหลือ smoke test ด้วยบัญชีของฝ่าย · **ข้าม webhook ตามมติผู้ใช้ — เรื่องใหม่ยังไม่มีสัญญาณถึงใคร** | รอตรวจ |
| [costing-request-plan.md](costing-request-plan.md) | merge ครบ 3 PR · mig 0157/0158/0159 รัน prod แล้ว (ยืนยัน 2026-08-08) · เหลือ UAT ข้อ 1–17 | รอตรวจ |
| [request-hub-rebuild-plan.md](request-hub-rebuild-plan.md) | รื้อเมนูคำร้องเป็นศูนย์ประสานงาน SA | รอดำเนินการ |
| [cross-department-requests-plan.md](cross-department-requests-plan.md) | มติครบ รอเริ่ม PR-1 (ใหญ่สุด 1,030 บรรทัด) | รอดำเนินการ |
| [qt-so-tax-followup-plan.md](qt-so-tax-followup-plan.md) | 6 จุดขัดแผนจาก PR #739 + บั๊กที่ผู้ใช้เจอได้ | รอดำเนินการ |
| [business-line-vs-project-seam.md](business-line-vs-project-seam.md) · [business-line-level-and-handoff.md](business-line-level-and-handoff.md) | มติเคาะแล้ว ยังไม่เขียนโค้ด | รอดำเนินการ |
| [service-business-system-plan.md](service-business-system-plan.md) · [service-field-operations.md](service-field-operations.md) | มติเคาะแล้ว ยังไม่เขียนโค้ด | รอดำเนินการ |
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

---

## 4. โปรแกรม System Modernization

35 ไฟล์ จัดระบบครบในตัวเองแล้ว — **มีสารบัญของตัวเอง ไม่ต้องไล่จากที่นี่**

→ [system-modernization/README.md](system-modernization/README.md) (ตาราง roadmap เฟส 0–9 + สถานะรายเฟส)

เฟส 0–6B `เสร็จสมบูรณ์` · 7A–7D `รอตรวจ` (รอ UAT + ยืนยันการรัน migration บนฐานจริง) ·
เฟส 8–9 (Permission redesign) `รอดำเนินการ` เป็นลำดับสุดท้ายของโปรแกรม

**มติ (ADR) 14 ใบ** อยู่ที่ [system-modernization/decisions/](system-modernization/decisions/) —
เป็นแพตเทิร์นที่ควรลอกไปใช้กับส่วนอื่นของโปรเจกต์

---

## 5. เสร็จแล้ว

→ [archive/](archive/README.md) — 7 ไฟล์ เก็บเป็นหลักฐานการตัดสินใจ ไม่ใช่งานค้าง

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
