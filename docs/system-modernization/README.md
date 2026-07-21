# SS System Modernization

เอกสารชุดนี้เป็นแหล่งอ้างอิงกลางสำหรับการปรับ UX/UI, Account, ข้อมูลหลัก,
Admin Center, ลายเซ็นอิเล็กทรอนิกส์, Document Design System และ Permission
ของ SS System

อัปเดตล่าสุด: 21 กรกฎาคม 2026

## กติกาการทำงาน

- เริ่มแต่ละเฟสจาก `main` และแยก Pull Request ตามขอบเขต
- แจ้งขอบเขตและผลกระทบให้ผู้ใช้ทราบก่อนแก้ไฟล์
- ไม่ขยายขอบเขตของเฟสโดยไม่บันทึกการตัดสินใจ
- เฟสยังไม่ถือว่าเสร็จจนกว่าโค้ด การทดสอบ เอกสารส่งมอบ และการยืนยันจากผู้ใช้จะครบ
- บันทึกการเปลี่ยนแปลงจริง, Migration, วิธี Rollback, ภาพหรือ PDF ตัวอย่าง และงานค้างทุกครั้ง
- Permission redesign เป็นเฟสสุดท้าย ระหว่างทางใช้สิทธิ์เดิมและการป้องกันขั้นต่ำที่จำเป็น
- `.agents/` เป็นข้อมูลเครื่องมือภายในเครื่องและไม่รวมใน Commit ของโปรแกรมนี้

## สถานะ Roadmap

| เฟส | ขอบเขต | สถานะ | เอกสาร |
|---|---|---|---|
| 0 | Requirements, UX/UI Rulebook และ Document specification | เสร็จสมบูรณ์ | [Phase 0](./phase-00-foundation.md) |
| 1 | Account menu, Profile และ Security | เสร็จสมบูรณ์ | [Phase 1](./phase-01-account-profile.md) |
| 2 | Product category management | เสร็จสมบูรณ์ | [Phase 2](./phase-02-product-category.md) |
| 3 | Product category Import/Export | เสร็จสมบูรณ์ | [Phase 3](./phase-03-product-category-import-export.md) |
| 4A | Admin Center และข้อมูลบริษัทแบบมีเวอร์ชัน | เสร็จสมบูรณ์ | [Phase 4A](./phase-04a-admin-center-company-data.md) |
| 4B | Workflow และ Timeline Template แบบมีเวอร์ชัน | เสร็จสมบูรณ์ | [Phase 4B](./phase-04b-workflow-timeline-templates.md) |
| 4C | Home และ Navigation Hub | เสร็จสมบูรณ์ | [Phase 4C](./phase-04c-home-navigation-hub.md) |
| 5 | Electronic signature | เสร็จสมบูรณ์ | [Phase 5](./phase-05-electronic-signature.md) |
| 6A | Versioned Document Standards | เสร็จสมบูรณ์ | [Phase 6A](./phase-06a-document-standards.md) |
| 6B | Document Design System และ Quotation Master Template | เสร็จสมบูรณ์ | [Phase 6B](./phase-06b-quotation-master-template.md) |
| 7A | Versioned Commercial Presets | รอตรวจ | [Phase 7A](./phase-07a-commercial-presets.md) |
| 7B | Issued document snapshot และ immutable PDF | รอตรวจ | [Phase 7B](./phase-07b-issued-document-snapshot.md) |
| 7C | Production Quotation Print replacement + PDF artifact | รอตรวจ | [Phase 7C](./phase-07c-quotation-print-replacement.md) |
| 7D | Sales Order document migration (V4 engine) | รอตรวจ | [Phase 7D](./phase-07d-salesorder-document.md) |
| 8 | Permission redesign และ Migration | รอดำเนินการลำดับสุดท้าย | [Action inventory](./permission-action-inventory.md) |
| 9 | Permission UAT, staged rollout และปิดโปรแกรม | รอดำเนินการ | [Release checklist](./release-checklist.md) |

สถานะที่ใช้มีเพียง `รอดำเนินการ`, `กำลังดำเนินการ`, `รอตรวจ`, `เสร็จสมบูรณ์`
และ `ระงับ` เพื่อไม่ให้ความหมายคลุมเครือ

## ฐานงานที่ส่งมอบแล้ว

- PR [#529 Add responsive FC detail drawer](https://github.com/SittipongSS/ss_system/pull/529)
  ถูก Merge แล้ว และ CI/Vercel ผ่าน
- งาน FC ใช้ Drawer สำหรับรายละเอียด และตารางรองรับ FC Total กับ FC คงเหลือ
- งานใหม่ของโปรแกรมนี้ต้องไม่ย้อนกลับไปเพิ่มบนสาขา PR #529
- Phase 4 ส่งมอบผ่าน PR #552, #557, #558 และ #561; GitHub CI และ Vercel ผ่านทุก PR
- Production smoke test ของ Home, Company Data และ Workflow Template ผ่านเมื่อ 19 กรกฎาคม 2026 โดยไม่เปลี่ยนข้อมูล
- Phase 7A โค้ด Merge แล้วผ่าน PR #582 (mig 0128) และ Phase 7B ผ่าน PR #593 (mig 0130);
  ทั้งสองเฟสอยู่สถานะ `รอตรวจ` เพราะ UAT กับการยืนยันการรัน Migration บนฐานข้อมูลจริงยังค้าง
- แกนของ Phase 7C ส่วนใบเสนอราคาถูกส่งมอบผ่านสาย V4: PR #597 (แม่แบบ V4 ใน Preview)
  และ PR #600 (ใช้กติกา V4 กับ `quotePrint.js` ใบจริง + ปุ่มพิมพ์ prefer issued snapshot);
  ต่อมา PR #612 รวมเครื่องยนต์ (D-7C-2) ให้ server builder `quotationMasterDocument.js` (V4)
  เป็น renderer เดียวของ snapshot/พิมพ์สด/preview
- Phase 7D (ใบสั่งขายใช้เครื่องยนต์ V4 ตัวเดียวกับใบเสนอราคา) ถูก Merge เข้า `main` แล้ว
  ผ่าน commit `87d05efc`, `bd587b08`, `21cfc473`; `salesOrderPrint.js` เรียก
  `buildQuotationMasterHTML` แทน `buildQuotePrintHTML`; สถานะ `รอตรวจ` เพราะยังรอ UAT ใบจริง
- Commercial Preset ถูกเสียบเข้าการสร้างใบเสนอราคาแล้ว (2026-07-22): endpoint
  `GET /api/commercial-presets/resolve` + prefill หน้าใหม่ + ตรึง
  `metadata.commercialPresetVersionId` + snapshot pin — `resolveCommercialPreset`
  ไม่เป็น dead code แล้ว (ไม่มี migration ใช้ `quotations.metadata` เดิม)
- PDF artifact ถาวร (D-7C-1) โค้ดเสร็จแล้ว (2026-07-22): ตัดสินใจทิศ A —
  puppeteer-core + @sparticuz/chromium เรนเดอร์จาก HTML ที่ตรึง, เก็บใน private bucket
  `issued-quotation-pdf` (mig 0139), สร้างตอนอนุมัติแบบ best-effort + ดาวน์โหลด fallback
  สร้างเอง; route `GET /api/sales-planning/quotations/[id]/issued/pdf` + ปุ่มดาวน์โหลดบน
  หน้าใบที่อนุมัติแล้ว. **7C โค้ดครบทั้ง 2 ข้อแล้ว เหลือ UAT ใบจริงบน prod + รัน mig 0139**

## Definition of Done ของทุกเฟส

- [ ] ขอบเขตที่ตกลงครบ
- [ ] ไม่มีการเปลี่ยนแปลงนอกขอบเขตโดยไม่บันทึก
- [ ] Automated tests ที่เหมาะสมผ่าน
- [ ] ตรวจ Desktop/Mobile และ Light/Dark สำหรับหน้าจอที่เกี่ยวข้อง
- [ ] ตรวจ A4/PDF/สี/ขาวดำสำหรับเอกสารที่เกี่ยวข้อง
- [ ] Migration และ Rollback ถูกบันทึกและทดสอบตามระดับความเสี่ยง
- [ ] อัปเดต [Permission action inventory](./permission-action-inventory.md)
- [ ] บันทึกภาพ Before/After หรือไฟล์ตัวอย่างเมื่อมีการเปลี่ยนหน้าตา
- [ ] ระบุ Known issues และงานที่เลื่อนไปเฟสอื่น
- [ ] ผู้ใช้ตรวจและยืนยัน
- [ ] Commit, Push, PR และ CI สำเร็จ

## เอกสารกลาง

- [Phase 0 — Foundation](./phase-00-foundation.md)
- [Phase 3 — Product Category Import/Export](./phase-03-product-category-import-export.md)
- [Phase 4A — Admin Center and Versioned Company Data](./phase-04a-admin-center-company-data.md)
- [Phase 4B — Versioned Workflow and Timeline Templates](./phase-04b-workflow-timeline-templates.md)
- [Phase 4C — Home and Navigation Hub Modernization](./phase-04c-home-navigation-hub.md)
- [Phase 5 — Electronic Signature](./phase-05-electronic-signature.md)
- [Phase 6A — Versioned Document Standards](./phase-06a-document-standards.md)
- [Phase 6B — Quotation Master Template](./phase-06b-quotation-master-template.md)
- [Phase 7A — Versioned Commercial Presets](./phase-07a-commercial-presets.md)
- [Phase 7B — Issued Document Snapshot and Immutable PDF Foundation](./phase-07b-issued-document-snapshot.md)
- [Phase 7C — Production Quotation Print Replacement](./phase-07c-quotation-print-replacement.md)
- [Phase 7D — Sales Order Document (V4 engine)](./phase-07d-salesorder-document.md)
- [UX/UI Rulebook](./ux-ui-rulebook.md)
- [Document Design System](./document-design-system.md)
- [Decision 0001 — Program governance](./decisions/0001-program-governance.md)
- [Decision 0002 — Document governance baseline](./decisions/0002-document-governance-baseline.md)
- [Decision 0003 — Organization settings versioning](./decisions/0003-organization-settings-versioning.md)
- [Decision 0004 — Versioned operational templates and commercial content boundary](./decisions/0004-versioned-operational-templates.md)
- [Decision 0005 — Home remains a navigation hub](./decisions/0005-home-remains-navigation-hub.md)
- [Decision 0006 — Private versioned electronic signatures](./decisions/0006-private-versioned-electronic-signatures.md)
- [Decision 0007 — Versioned document standards before signature evidence](./decisions/0007-versioned-document-standards.md)
- [Decision 0008 — Atomic signature evidence for controlled documents](./decisions/0008-atomic-signature-evidence.md)
- [Decision 0009 — Balanced Controlled quotation master direction](./decisions/0009-balanced-controlled-quotation-master.md)
- [Decision 0010 — Versioned Commercial Presets before document consumers](./decisions/0010-versioned-commercial-presets.md)
- [Decision 0011 — Immutable issued document snapshot before print replacement](./decisions/0011-issued-document-snapshot.md)
- [Decision 0012 — Settings lifecycle standard](./decisions/0012-settings-lifecycle-standard.md)
- [Permission action inventory](./permission-action-inventory.md)
- [Release checklist](./release-checklist.md)
