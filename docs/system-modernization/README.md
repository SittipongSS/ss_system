# SS System Modernization

เอกสารชุดนี้เป็นแหล่งอ้างอิงกลางสำหรับการปรับ UX/UI, Account, ข้อมูลหลัก,
Admin Center, ลายเซ็นอิเล็กทรอนิกส์, Document Design System และ Permission
ของ SS System

อัปเดตล่าสุด: 20 กรกฎาคม 2026

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
| 6B | Document Design System และ Quotation Master Template | กำลังดำเนินการ | [Phase 6B](./phase-06b-quotation-master-template.md) |
| 7 | Document engine, versioning และย้ายเอกสาร | รอดำเนินการ | สร้างเมื่อเริ่มเฟส |
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
- [Permission action inventory](./permission-action-inventory.md)
- [Release checklist](./release-checklist.md)
