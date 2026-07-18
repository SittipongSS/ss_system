# Phase 1 Visual Evidence

ภาพในโฟลเดอร์นี้ใช้ตรวจการเปลี่ยน top bar และหน้า Account ของ Phase 1

- `before-topbar.png` — ภาพก่อนปรับจากผู้ใช้
- `after-account-dark.png` — Dark theme พร้อม Account popover
- `after-account-light.png` — Light theme

Mobile ตรวจด้วย responsive viewport และ DOM/accessibility snapshot; เครื่องมือจับภาพ mobile timeout จึงไม่บันทึกไฟล์ภาพในรอบนี้

ภาพ After ถูกจับก่อน polish รอบสุดท้ายที่แก้เฉพาะ alignment ของตัวอักษรใน avatar และ normalize ค่า department legacy `SALES` → `SA`; layout ในภาพตรงกับ final build
