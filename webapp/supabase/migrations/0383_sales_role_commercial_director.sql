-- ============================================================
--  Migration 0383: เปลี่ยนตำแหน่ง CCO เป็น Commercial Director (มติผู้ใช้ 24/09/2026)
--
--  ⭐ role `cco` (Chief Commercial Officer) ที่ 0382 ใส่ไว้ในฟังก์ชันกลาง เปลี่ยนเป็น `commercial_director`
--    (ป้าย "Commercial Director (CD)") — ผู้ใช้ขอเปลี่ยนชื่อชั้นบนสุดของผังหลังรัน 0382 ไปแล้ว
--    แต่ **ก่อนโค้ดขึ้นระบบ** ⇒ ยังไม่มีบัญชี · เอกสาร · หลักฐานลายเซ็นไหนเขียน `cco` ไว้เลย จึงถอดทิ้งได้ทันที
--    (ไม่ต้องเก็บไว้เป็นชื่อเก่าแบบตะเข็บแปลงตอนอ่าน)
--  ⭐ แก้ที่ฟังก์ชันกลางสองตัวที่เดียว — ฟังก์ชันอนุมัติ 13 ตัวที่ 0382 ปะไว้เรียกตัวกลางอยู่แล้ว ไม่ต้องปะซ้ำ
--    (นี่คือเหตุผลที่ 0382 ทำฟังก์ชันกลางแทนการเขียนรายชื่อซ้ำ 13 ที่)
--  🔴 สองชุดนี้ต้องตรงกับฝั่ง JS — salesRoleSqlParity.test.mjs อ่าน "นิยามล่าสุด" ของตัวกลาง (ไฟล์นี้) เทียบ
--  ⛔ ไม่แตะตาราง/ข้อมูล · ไม่แตะ 13 ฟังก์ชันอนุมัติ · ตำแหน่งอื่นได้ผลเหมือนเดิมทุกตัว
--  ⚠️ DDL — รันมือบน Supabase SQL Editor · ต้องรันก่อนย้ายบัญชีคนแรกเป็น Commercial Director
--  ✅ รันซ้ำได้ (CREATE OR REPLACE · REVOKE/GRANT ซ้ำได้)
--
--  ── ตรวจผลหลังรัน (อ่านอย่างเดียว) ─────────────────────────────────────
--  คาด: cd = t · cco = f · cm = t · ac_sup = f · cd_keyer = t · cco_keyer = f · patched = 13
--
--   SELECT
--     public.is_sales_manager_role('commercial_director') AS cd,
--     public.is_sales_manager_role('cco')                 AS cco,
--     public.is_sales_manager_role('commercial_manager')  AS cm,
--     public.is_sales_manager_role('ac_supervisor')       AS ac_sup,
--     public.is_sales_keyer_role('commercial_director')   AS cd_keyer,
--     public.is_sales_keyer_role('cco')                   AS cco_keyer,
--     (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND (strpos(p.prosrc, 'public.is_sales_manager_role(p_actor_role)') > 0
--           OR strpos(p.prosrc, 'public.is_sales_keyer_role(p_actor_role)') > 0)) AS patched;
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_sales_manager_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_role, '') IN ('admin', 'commercial_director', 'commercial_manager', 'ae_supervisor');
$$;

CREATE OR REPLACE FUNCTION public.is_sales_keyer_role(p_role text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT COALESCE(p_role, '') IN ('admin', 'commercial_director', 'commercial_manager', 'ae_supervisor', 'ac_supervisor', 'senior_ae', 'senior_ac', 'ae', 'ac');
$$;

COMMENT ON FUNCTION public.is_sales_manager_role(text) IS
  'ผู้มีอำนาจตัดสินของฝ่ายขาย (admin · Commercial Director · Commercial Manager · AE Supervisor) — ต้องตรงกับ SALES_MANAGER_ROLES ใน lib/permissions.js (mig 0382 · 0383)';
COMMENT ON FUNCTION public.is_sales_keyer_role(text) IS
  'ผู้คีย์ใบสั่งขายย้อนหลัง (admin + ฝ่ายขายทุกตำแหน่ง) — ต้องตรงกับ HISTORICAL_KEYER_ROLES (mig 0382 · 0383)';

-- CREATE OR REPLACE เก็บสิทธิ์เดิมไว้อยู่แล้ว · ย้ำซ้ำให้ไฟล์นี้ยืนได้เองเมื่อรันบนฐานใหม่ (แพตเทิร์น 0336)
REVOKE ALL ON FUNCTION public.is_sales_manager_role(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_manager_role(text) TO service_role;
REVOKE ALL ON FUNCTION public.is_sales_keyer_role(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_sales_keyer_role(text) TO service_role;

COMMIT;
