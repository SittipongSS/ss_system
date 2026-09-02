-- ปิดประตูหลังชุดที่สอง: default privileges ของ role `supabase_admin`
-- ============================================================================
--
-- 🐞 **0336 ปิดได้แค่ครึ่งเดียว** — `ALTER DEFAULT PRIVILEGES` ผูกกับ **role ที่สร้าง
--    อ็อบเจกต์** เสมอ ไม่ใช่กับ schema · 0336 ตั้งของ `postgres` ไว้อย่างเดียว
--    แต่ `pg_default_acl` ของ schema `public` มีสองชุด:
--
--      f  postgres        {postgres=X/postgres, service_role=X/postgres}          ✅ สะอาด
--      f  supabase_admin  {postgres=X/…, anon=X/…, authenticated=X/…}             ❌ ยังแจก anon
--      r  supabase_admin  {postgres=arwdDxtm/…, anon=arwdDxtm/…, …}               ❌
--      S  supabase_admin  {postgres=rwU/…, anon=rwU/…, …}                         ❌
--
-- ⇒ อะไรก็ตามที่สร้างของใน `public` **ในนาม supabase_admin** จะเกิดมาพร้อมสิทธิ์
--   ให้ anon ทันที · เป็นรูเดียวกับที่ 0336 อุดไป แค่คนละประตู
--
-- ⭐ วันนี้ยังไม่มีใครเดินประตูนี้: วัดแล้วว่า **ทุกอ็อบเจกต์ใน `public` เป็นของ
--   `postgres` ทั้ง 113 ตัว** (110 ตาราง + 3 อย่างอื่น) ไม่มีของ supabase_admin สักตัว
--   เพราะ SQL Editor รันในนาม postgres · migration นี้จึง **ไม่เปลี่ยนพฤติกรรมอะไรเลย
--   ในวันที่รัน** เป็นเกราะไว้กันวันที่ dashboard ออกฟีเจอร์ใหม่ หรือมีคน restore dump
--   ด้วย role นั้น แล้วตารางใหม่โผล่มาพร้อม grant ให้ anon โดยไม่มีใครรู้
--
-- 🪤 **อาจรันไม่ผ่าน** — `ALTER DEFAULT PRIVILEGES FOR ROLE x` ต้องให้ผู้รันเป็น
--    สมาชิกของ role นั้น · ถ้า `postgres` ไม่ได้เป็นสมาชิกของ `supabase_admin`
--    จะขึ้น `42501 must be a member of role "supabase_admin"` แล้วทั้ง transaction
--    ถูกยกเลิก **ไม่มีอะไรเสียหาย ไม่ต้องถอย** — แปลว่าปิดประตูนี้เองไม่ได้
--    ต้องแจ้ง Supabase support หรือปล่อยไว้ (ความเสี่ยงต่ำตามเหตุผลข้างบน)

BEGIN;

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON FUNCTIONS FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- คืนให้ service_role เสมอด้วยเหตุผลเดียวกับ 0336: มันได้สิทธิ์มาทาง default ชุดนี้
-- ไม่ได้เป็นเจ้าของอ็อบเจกต์ ถ้า revoke แล้วไม่ grant คืน ของที่สร้างใหม่ในนาม
-- supabase_admin จะอ่านไม่ได้จากฝั่งแอป
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT EXECUTE ON FUNCTIONS TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- ตรวจผลหลังรัน — ต้องไม่เหลือ anon / authenticated ในคอลัมน์ acl สักแถว
-- ═══════════════════════════════════════════════════════════════════════════
-- select d.defaclobjtype as kind,
--        pg_get_userbyid(d.defaclrole) as for_role,
--        d.defaclacl::text as acl
-- from pg_default_acl d
-- join pg_namespace n on n.oid = d.defaclnamespace
-- where n.nspname = 'public'
-- order by 2, 1;
