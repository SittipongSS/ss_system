# SS System Modernization

เอกสารชุดนี้เป็นแหล่งอ้างอิงกลางสำหรับการปรับ UX/UI, Account, ข้อมูลหลัก,
Admin Center, ลายเซ็นอิเล็กทรอนิกส์, Document Design System และ Permission
ของ SS System

อัปเดตล่าสุด: 19 กรกฎาคม 2026

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
| 1 | Account menu, Profile และ Security | รอตรวจ | [Phase 1](./phase-01-account-profile.md) |
| 2 | Product category management | รอดำเนินการ | สร้างเมื่อเริ่มเฟส |
| 3 | Product category Import/Export | รอดำเนินการ | สร้างเมื่อเริ่มเฟส |
| 4 | Admin Center และข้อมูลบริษัทแบบมีเวอร์ชัน | รอดำเนินการ | สร้างเมื่อเริ่มเฟส |
| 5 | Electronic signature | รอดำเนินการ | สร้างเมื่อเริ่มเฟส |
| 6 | Document Design System และ Mockup | รอดำเนินการ | [Document Design System](./document-design-system.md) |
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
- [UX/UI Rulebook](./ux-ui-rulebook.md)
- [Document Design System](./document-design-system.md)
- [Decision 0001 — Program governance](./decisions/0001-program-governance.md)
- [Decision 0002 — Document governance baseline](./decisions/0002-document-governance-baseline.md)
- [Permission action inventory](./permission-action-inventory.md)
- [Release checklist](./release-checklist.md)
