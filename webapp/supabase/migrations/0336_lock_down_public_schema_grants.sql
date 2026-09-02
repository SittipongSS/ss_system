-- ปิดประตูหลังของ public schema: ถอนสิทธิ์ anon/authenticated ออกให้หมด
-- ============================================================================
--
-- ⭐ ทำไมต้องมี: Supabase Security Advisor (2026-09-02) เตือน 38 ข้อ และวัดกับ
--    ฐานจริงได้ว่า **anon เรียกฟังก์ชันได้ 54 จาก 98 ตัว โดย 16 ตัวเป็น
--    SECURITY DEFINER** ซึ่งรันด้วยสิทธิ์เจ้าของ ⇒ **ข้าม RLS ทั้งหมด**
--    เช่น create_customer_with_code · create_product_with_code ·
--    create_quotation_with_number · create_sales_order_draft · assign_pdr_ref_no
--    คีย์ anon อยู่ในบันเดิลเบราว์เซอร์ (NEXT_PUBLIC_SUPABASE_ANON_KEY)
--    ⇒ ใครก็ยิง POST /rest/v1/rpc/<ชื่อ> สร้างข้อมูล/เผาเลขเอกสารได้
--
--    และ **51 จาก 110 ตารางยังให้ grant SELECT/INSERT กับ anon** อยู่ —
--    วันนี้ไม่มีผลเพราะทุกตารางเปิด RLS โดยไม่มี policy สักข้อ (deny-all)
--    แต่นั่นคือเกราะชั้นเดียว ถ้าใครเผลอเพิ่ม permissive policy เข้าไป
--    51 ตารางเปิดทันที
--
-- ⭐ ทำไมปลอดภัยกับแอป: ระบบนี้ **ไม่มีโค้ดฝั่งเบราว์เซอร์แตะ DB เลย** —
--    supabaseBrowser.js ใช้ anon key เฉพาะ Auth (login/logout/session/รหัสผ่าน)
--    ซึ่งวิ่งที่ /auth/v1 ไม่ใช่ /rest/v1 · ทุกการอ่าน/เขียนผ่าน API route
--    ฝั่ง server ที่ใช้ getSupabaseAdmin() = service_role ทั้งหมด
--    ⇒ ถอน anon/authenticated ออกได้โดยไม่มีจอไหนพัง
--
-- 🪤 ทำไมของเดิมหลุด: บ้านนี้มีแพตเทิร์น "REVOKE ... FROM PUBLIC; GRANT ... TO
--    service_role" อยู่แล้วและเคยเขียนให้ create_customer_with_code /
--    create_product_with_code ด้วยซ้ำ **แต่สิทธิ์กลับมาเปิดใหม่ทุกครั้งที่
--    migration รุ่นหลัง DROP แล้ว CREATE ฟังก์ชันนั้นซ้ำ** (CREATE OR REPLACE
--    เก็บ grant ไว้ แต่ DROP+CREATE รีเซ็ตกลับเป็นค่าเริ่มต้นของ Postgres
--    ซึ่งให้ EXECUTE กับ PUBLIC) ⇒ แก้ทีละตัวไม่พอ ต้องกวาดทั้ง schema
--    **แล้วเปลี่ยน default privileges** ไม่งั้นเดี๋ยวหลุดอีก

BEGIN;

-- ── 1) ฟังก์ชัน/โพรซีเยอร์ทุกตัวใน public ────────────────────────────────────
-- ใช้ ON ROUTINE เพราะครอบทั้ง function, procedure และ aggregate ในคำสั่งเดียว
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format('REVOKE ALL ON ROUTINE %s FROM PUBLIC, anon, authenticated', r.sig);
    -- ต้อง GRANT คืนให้ service_role เสมอ: มันได้ EXECUTE มาทาง PUBLIC
    -- ไม่ได้เป็นเจ้าของฟังก์ชัน (เจ้าของคือ postgres ทั้ง 98 ตัว)
    -- ถ้า revoke แล้วไม่ grant คืน = ทุก API route ที่เรียก rpc ตายทันที
    EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ── 2) ตาราง / view / materialized view ─────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
  LOOP
    EXECUTE format('REVOKE ALL ON %s FROM anon, authenticated', r.rel);
    EXECUTE format('GRANT ALL ON %s TO service_role', r.rel);
  END LOOP;
END $$;

-- ── 3) sequence ─────────────────────────────────────────────────────────────
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.oid::regclass AS rel
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
      AND c.relkind = 'S'
  LOOP
    EXECUTE format('REVOKE ALL ON SEQUENCE %s FROM anon, authenticated', r.rel);
    EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE %s TO service_role', r.rel);
  END LOOP;
END $$;

-- ── 4) ค่าเริ่มต้นของอนาคต — ข้อที่ทำให้ไม่ต้องกลับมานั่งกวาดอีก ─────────────
-- Postgres แจก EXECUTE ให้ PUBLIC กับฟังก์ชันใหม่ทุกตัว และ Supabase ตั้ง default
-- ไว้ให้ตาราง/ซีเควนซ์ใหม่ตกถึง anon/authenticated ด้วย · migration ทั้งหมดของ
-- โปรเจกต์นี้รันด้วย role `postgres` (SQL Editor) จึงตั้ง default ของ role นั้น
--
-- 🪤 ถ้าวันหลังมีใครสร้างตาราง/ฟังก์ชันด้วย role อื่น (เช่นผ่าน dashboard ในนาม
--    supabase_admin) default ชุดนี้จะไม่ครอบ — ต้องรัน `ALTER DEFAULT PRIVILEGES
--    FOR ROLE <role> ...` เพิ่มให้ role นั้นด้วย
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;

-- ── 5) ล็อก search_path ของฟังก์ชันที่ยังไม่ได้ตั้ง ─────────────────────────
-- Advisor เตือน 5 ตัว: pm_mark_rev_stale · pm_restore_snapshot · tax_id_key ·
-- branch_key · service_assets_stock_guard — ทั้งหมดคือตัวที่ proconfig ว่าง
-- ฟังก์ชันที่ search_path ไม่ถูกล็อก เปิดช่องให้ผู้เรียกสลับ schema แล้วหลอกให้
-- ฟังก์ชันไปเรียกของปลอมที่ชื่อเหมือนกัน
--
-- 🪤 ใส่ `extensions` ไว้ด้วย ไม่ใช่แค่ `public` — ฟังก์ชันของ Supabase หลายตัว
--    (เช่น gen_random_uuid) อยู่ใน schema `extensions` ถ้าตัดออกจะพังตอนรัน
--    ไม่ใช่ตอน migrate ⇒ เงียบจนกว่าจะมีคนเรียก
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.proconfig IS NULL
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END $$;

-- ── 6) ดัชนีซ้ำ ─────────────────────────────────────────────────────────────
-- `customers_id_key` / `products_id_key` เป็น UNIQUE constraint บน (id) ซ้ำกับ
-- primary key ของตารางเดียวกันเป๊ะ ⇒ เปลืองพื้นที่และทำให้ทุก INSERT/UPDATE
-- ต้องอัปเดตดัชนีสองชุด · ตรวจแล้วว่าไม่มี foreign key ตัวไหนผูกกับดัชนีคู่นี้
-- (pg_constraint contype='f' conindid = 0 แถว) จึงถอนได้โดยไม่ต้อง CASCADE
ALTER TABLE public.customers DROP CONSTRAINT IF EXISTS customers_id_key;
ALTER TABLE public.products  DROP CONSTRAINT IF EXISTS products_id_key;

COMMIT;

-- PostgREST แคช schema ไว้ในหน่วยความจำ — ต้องบอกให้โหลดใหม่ ไม่งั้นสิทธิ์ชุดใหม่
-- ยังไม่มีผลจนกว่าจะ restart
NOTIFY pgrst, 'reload schema';


-- ═══════════════════════════════════════════════════════════════════════════
-- ตรวจผลหลังรัน (คัดลอกส่วนใน comment ไปรันใน SQL Editor)
-- คาดหวัง: anon_fns=0 · anon_secdef=0 · authed_fns=0 · svc_fns=98 ·
--          anon_tables=0 · svc_tables=110 · fns_no_search_path=0 · dup_idx=0
-- ═══════════════════════════════════════════════════════════════════════════
-- -- ตรวจผลหลังรัน 0336 — รันใน SQL Editor ได้เลย อ่านอย่างเดียว
-- -- คาดหวัง: anon_fns = 0, anon_secdef = 0, authed_fns = 0, svc_fns = 98,
-- --          anon_tables = 0, svc_tables = 110, fns_no_search_path = 0, dup_idx = 0
-- select
--   (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public' and has_function_privilege('anon', p.oid,'EXECUTE'))          as anon_fns,
--   (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public' and p.prosecdef
--        and has_function_privilege('anon', p.oid,'EXECUTE'))                                  as anon_secdef,
--   (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public' and has_function_privilege('authenticated', p.oid,'EXECUTE'))  as authed_fns,
--   (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public' and has_function_privilege('service_role', p.oid,'EXECUTE'))   as svc_fns,
--   (select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'
--      and has_table_privilege('anon', c.oid,'SELECT'))                                        as anon_tables,
--   (select count(*) from pg_class c where c.relnamespace='public'::regnamespace and c.relkind='r'
--      and has_table_privilege('service_role', c.oid,'SELECT'))                                as svc_tables,
--   (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--      where n.nspname='public' and p.prokind='f' and p.proconfig is null)                     as fns_no_search_path,
--   (select count(*) from pg_class where relname in ('customers_id_key','products_id_key'))    as dup_idx;

-- ═══════════════════════════════════════════════════════════════════════════
-- ถอยกลับ — ใช้เฉพาะกรณีมีจอพังหลังรัน
-- ═══════════════════════════════════════════════════════════════════════════
-- -- ถอย 0336 กลับสู่สภาพเดิม — ใช้เฉพาะกรณีมีจอพังหลังรัน
-- --
-- -- ⚠️ นี่คือการเปิดสิทธิ์คืนให้ anon/authenticated ตามค่าเริ่มต้นของ Supabase
-- --    ซึ่งคือสภาพที่ไม่ปลอดภัยเดิม · ใช้ประคองแล้วรีบหาสาเหตุ อย่าปล่อยค้าง
-- --
-- -- 🪤 ไม่คืน customers_id_key / products_id_key ให้ เพราะเป็นดัชนีซ้ำกับ pkey
-- --    ถ้าจำเป็นจริง ๆ ต่อท้ายเอง:
-- --      ALTER TABLE public.customers ADD CONSTRAINT customers_id_key UNIQUE (id);
-- --      ALTER TABLE public.products  ADD CONSTRAINT products_id_key  UNIQUE (id);
-- 
-- BEGIN;
-- 
-- GRANT USAGE ON SCHEMA public TO anon, authenticated;
-- 
-- DO $$
-- DECLARE r record;
-- BEGIN
--   FOR r IN
--     SELECT p.oid::regprocedure AS sig
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--     WHERE n.nspname = 'public'
--   LOOP
--     EXECUTE format('GRANT EXECUTE ON ROUTINE %s TO anon, authenticated', r.sig);
--   END LOOP;
-- 
--   FOR r IN
--     SELECT c.oid::regclass AS rel FROM pg_class c
--     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r','p','v','m','f')
--   LOOP
--     EXECUTE format('GRANT ALL ON %s TO anon, authenticated', r.rel);
--   END LOOP;
-- 
--   FOR r IN
--     SELECT c.oid::regclass AS rel FROM pg_class c
--     WHERE c.relnamespace = 'public'::regnamespace AND c.relkind = 'S'
--   LOOP
--     EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE %s TO anon, authenticated', r.rel);
--   END LOOP;
-- END $$;
-- 
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   GRANT EXECUTE ON FUNCTIONS TO PUBLIC, anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   GRANT ALL ON TABLES TO anon, authenticated;
-- ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
--   GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated;
-- 
-- COMMIT;
-- 
-- NOTIFY pgrst, 'reload schema';
