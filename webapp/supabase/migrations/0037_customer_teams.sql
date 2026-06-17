-- ============================================================
--  Migration 0037: customers.teams[] (หลายทีมดูแลลูกค้ารายเดียว)
--  เดิม `team` เดียว (ทีมผู้สร้าง) คุมสิทธิ์ แก้/อนุมัติ. เพิ่ม `teams` jsonb
--  array = ชุดทีมที่ดูแล/แก้/อนุมัติลูกค้ารายนี้ได้ (รวมทีมหลัก).
--  - `team` คงไว้ = ทีมหลัก/ผู้สร้าง (attribution).
--  - scope ('team') ใช้ teams[] ถ้ามี (ไม่งั้น fallback ทีมเดียว) — ดู permissions.inScope
--  - มอบหมายทีม = สิทธิ์ Supervisor/Admin (ข้ามทีมได้).
--  backfill: teams = [team] ของเดิม. additive + idempotent.
--  ⚠ รันมือบน Supabase (เหมือน 0005-0036).
-- ============================================================

alter table public.customers add column if not exists "teams" jsonb not null default '[]'::jsonb;

update public.customers
set "teams" = jsonb_build_array("team")
where ("teams" is null or "teams" = '[]'::jsonb) and "team" is not null and "team" <> '';
