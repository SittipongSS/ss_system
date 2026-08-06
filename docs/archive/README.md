# คลังเอกสารที่จบแล้ว

เอกสารในโฟลเดอร์นี้ **งานเสร็จและส่งมอบแล้ว** เก็บไว้เป็นหลักฐานว่าตัดสินใจอะไรไปบ้าง
ไม่ใช่แผนที่ต้องทำต่อ

**กติกา**

- ไฟล์ที่นี่ **ไม่อยู่ใน [docs/INDEX.md](../INDEX.md)** — AI จะไม่หลงไปอ่านเป็นงานค้าง
- path และชื่อไฟล์ที่อ้างในเอกสารเก่า **อาจไม่ตรงกับโค้ดวันนี้แล้ว** อ่านเป็นบันทึกประวัติเท่านั้น
- ถ้าต้องรื้อฟื้นเรื่องไหน ให้สำรวจ ground truth จากโค้ดใหม่ก่อนเสมอ อย่าเชื่อ path ในเอกสาร
- ย้ายเข้าที่นี่เมื่อสถานะเป็น `เสร็จสมบูรณ์` และไม่มีงานค้างเหลือ · ย้ายด้วย `git mv` เสมอ

| ไฟล์ | จบเมื่อ | หลักฐาน |
|---|---|---|
| [lead-deal-flow-audit.md](lead-deal-flow-audit.md) | 2026-08-04 | PR #927 · commit `9ad04abb` · mig 0199 |
| [service-production-scheduling-plan.md](service-production-scheduling-plan.md) | 2026-08-01 | จบครบทุก PR — สายบริการ S-1→S-5 · สายผลิต P-1→P-3 · X-1 |
| [DRIVE_STORAGE_PLAN.md](DRIVE_STORAGE_PLAN.md) | 2026-07-30 | attachments 128/128 อยู่บน Drive · `STORAGE_BACKEND` ถูกลบ |
| [QT_CREATE_PAGE_PLAN.md](QT_CREATE_PAGE_PLAN.md) | 2026-07-14 | Q1–Q4 ครบ · PR #336 (mig 0097) · #338 · #341 |
| [GOOGLE_CHAT_PLAN.md](GOOGLE_CHAT_PLAN.md) | 2026-07-16 | เฟส 1–3 ใช้งานจริง · เฟส 4 (SSO) ผู้ใช้ตัดสินใจถอดออก (PR #380 → revert) |
| [SALES_TASKS_PLAN.md](SALES_TASKS_PLAN.md) | 2026-07-10 | เฟส 1–3 เสร็จ · mig 0085 รัน prod แล้ว · เฟส 4 เป็น polish ที่เลือกไม่ทำ |
| [SALES_PLANNING_PLAN.md](SALES_PLANNING_PLAN.md) | 2026-07-06 | ตาราง `sales_deals`/`sales_targets` ใช้งานจริง · ⚠️ path `/sales-planning` ในเอกสารย้ายไป `/sa/*` แล้ว |
