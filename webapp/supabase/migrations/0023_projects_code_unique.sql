-- ============================================================
--  Migration 0023: projects.code ต้องไม่ซ้ำ (unique)
--  รหัสโปรเจกต์ PJ-YYMMNNN ถูก gen แบบอ่าน max แล้ว +1 (ไม่ atomic) → ถ้าสร้าง
--  พร้อมกันอาจได้รหัสซ้ำ. unique index นี้ทำให้ insert ที่ชนคืน error 23505 ซึ่ง
--  API (POST /api/pm/projects) ดักไว้แล้ว แล้วคำนวณรหัสใหม่ลองใหม่อัตโนมัติ.
--  Additive + idempotent.
--
--  ⚠ ถ้ามีรหัสซ้ำอยู่ก่อนแล้ว index จะสร้างไม่สำเร็จ — ต้องแก้รหัสซ้ำก่อน เช่น
--    select "code", count(*) from public.projects group by "code" having count(*) > 1;
--  แล้วแก้ตัวที่ซ้ำให้ไม่ชนกัน ก่อนรัน migration นี้ซ้ำ.
-- ============================================================

create unique index if not exists projects_code_unique_idx on public.projects ("code");
