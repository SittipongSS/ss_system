# Release and Phase Closeout Checklist

ใช้ Checklist นี้เมื่อปิดทุกเฟส และเพิ่มรายการเฉพาะโมดูลในเอกสารประจำเฟส

## Scope and documentation

- [ ] Scope ที่ทำจริงตรงกับ Scope ที่อนุมัติ
- [ ] Decision ใหม่ถูกบันทึกใน `decisions/`
- [ ] Roadmap และสถานะ Phase ถูกอัปเดต
- [ ] Permission action inventory ถูกอัปเดต
- [ ] Known issues และ Deferred work ถูกระบุ

## Code quality

- [ ] ใช้ shared component ก่อนสร้าง pattern ใหม่
- [ ] Create/Edit ของ entity เดียวกันใช้ form component เดียวกัน
- [ ] ไม่มี hard-coded UI color นอก token system
- [ ] Error handling และ user feedback ครบ
- [ ] ไม่มี secret หรือข้อมูลส่วนบุคคลใน log/test fixture

## UX/UI

- [ ] Primary action hierarchy ถูกต้อง
- [ ] Loading, empty, error และ success state ครบ
- [ ] Desktop/Tablet/Mobile ผ่าน
- [ ] Light/Dark ผ่าน
- [ ] Keyboard, focus และ ARIA ผ่าน
- [ ] Table header/footer/scroll ไม่ทับเนื้อหา
- [ ] ฟ้อนต์และตัวเลขไม่เกิด layout shift ที่สังเกตได้

## Data and API

- [ ] Validation ฝั่ง Server ครบ
- [ ] Authorization ขั้นต่ำครบ แม้ Permission redesign ยังไม่เริ่ม
- [ ] Audit action ที่มีความเสี่ยง
- [ ] Migration ทดสอบกับข้อมูลจำลองหรือสภาพแวดล้อมที่เหมาะสม
- [ ] Rollback หรือ forward-fix strategy ถูกบันทึก
- [ ] ข้อมูลเก่าและ API compatibility ถูกตรวจ

## Documents and print

- [ ] A4 portrait/landscape ตามประเภท
- [ ] Print สีและขาวดำอ่านได้
- [ ] หนึ่งหน้าและหลายหน้าผ่าน
- [ ] Header/Table/Footer/Signature ไม่ถูกตัดหรือทับ
- [ ] Font พร้อมก่อน Print/PDF
- [ ] Form code, Revision, Effective date และ Page number ถูกต้อง
- [ ] เอกสารเก่าไม่เปลี่ยนย้อนหลัง
- [ ] Visual/PDF regression baseline ถูกอัปเดตเมื่อได้รับอนุมัติ

## Verification and release

- [ ] Unit/integration tests ผ่าน
- [ ] CI ผ่าน
- [ ] UAT ตามฝ่ายที่ได้รับผลกระทบผ่าน
- [ ] Before/After หรือ Sample artifact แนบใน PR/Phase record
- [ ] Feature flag หรือ staged rollout ใช้เมื่อความเสี่ยงสูง
- [ ] Monitoring และ owner หลังปล่อยถูกระบุ
- [ ] ผู้ใช้ยืนยันปิดเฟส
- [ ] Commit, Push และ PR สำเร็จ

## Closeout record

- Phase:
- Date:
- Branch:
- PR:
- Commit:
- CI:
- UAT participants:
- Approved by:
- Rollback reference:
- Follow-up work:
