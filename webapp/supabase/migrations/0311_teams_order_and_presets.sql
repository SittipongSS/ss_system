-- ============================================================
--  Migration 0311: ลำดับทีมให้ตรงกับโค้ด + ปลดล็อกทีมใหม่ให้ตั้งเงื่อนไขการค้าได้
--
--  ── ข้อ 1: sortOrder ต้องเป็น KA → ODM → SV ────────────────────────────
--  🐞 mig 0310 backfill ลำดับตาม `TEAMS` เดิม (ODM → KA → SV) แต่ **ลำดับที่ระบบ
--  ใช้แสดงผลจริงมาตลอดคือ KA → ODM → SV** (`SALES_TEAMS` ในหน้าวางเป้า และ
--  `TEAM_ORDER` ในแดชบอร์ด ซึ่งคอมเมนต์ของมันเองเขียนว่า "ลำดับทีมมาตรฐานทั้งระบบ")
--  ⇒ งวด T-5 ยุบสามชุดเหลือชุดเดียวที่ KA → ODM → SV และทะเบียนต้องเรียงตามนั้น
--  ⚠️ มีด่าน CI (`npm run check:teams`) เทียบลำดับสองฝั่งแล้ว ผิดเมื่อไรแดงทันที
--
--  ── ข้อ 2: commercial_presets.teamKey ต้องไม่ล็อกรหัสทีมไว้ในโค้ด SQL ───
--  🐞 mig 0128 เขียน `CHECK (teamKey IN ('ODM','KA','SV'))` ⇒ วันที่หัวหน้าสร้าง
--  ทีมขายใหม่จากหน้าจัดทีม ทีมนั้นจะ **ตั้งเงื่อนไขการค้าไม่ได้เลย** และ error ที่
--  ได้เป็นข้อความ CHECK ดิบซึ่งอ่านไม่ออกว่าเกี่ยวอะไรกับทีม
--  ⇒ เปลี่ยนเป็น FK ชี้ทะเบียน `teams` — ได้ความถูกต้องเท่าเดิมแต่โตตามทะเบียน
--  และลบทีมที่มี preset ค้างไม่ได้ (RESTRICT) ซึ่งเป็นกติกาเดียวกับที่อื่น
--
--  ⚠️ รันมือบน Supabase SQL Editor · idempotent ทุกคำสั่ง
-- ============================================================

BEGIN;

UPDATE public.teams SET "sortOrder" = 10, "updatedAt" = now() WHERE code = 'KA';
UPDATE public.teams SET "sortOrder" = 20, "updatedAt" = now() WHERE code = 'ODM';
UPDATE public.teams SET "sortOrder" = 30, "updatedAt" = now() WHERE code = 'SV';

-- ── ทีมของ preset: CHECK ที่ฝังรหัส → FK ที่โตตามทะเบียน ────────────────
DO $$
DECLARE
  con text;
BEGIN
  -- ชื่อ constraint ของ CHECK ที่ 0128 สร้างไว้ (ไม่ได้ตั้งชื่อเอง จึงต้องค้นจากนิยาม)
  FOR con IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.commercial_presets'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%teamKey%'
  LOOP
    EXECUTE format('ALTER TABLE public.commercial_presets DROP CONSTRAINT %I', con);
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commercial_presets'::regclass
      AND conname = 'commercial_presets_team_fk'
  ) THEN
    /* ⚠️ ทำได้ก็ต่อเมื่อค่าที่มีอยู่ทุกแถวมีอยู่ในทะเบียนแล้ว — mig 0310 backfill
       ODM/KA/SV ครบแล้ว จึงผ่าน · ถ้าวันหนึ่งล้มที่บรรทัดนี้ แปลว่ามี preset ที่
       ชี้ทีมซึ่งไม่มีในทะเบียน ซึ่งต้องแก้ข้อมูลก่อน ไม่ใช่ถอด FK ทิ้ง */
    ALTER TABLE public.commercial_presets
      ADD CONSTRAINT commercial_presets_team_fk
      FOREIGN KEY ("teamKey") REFERENCES public.teams(code) ON DELETE RESTRICT;
  END IF;
END $$;

COMMENT ON CONSTRAINT commercial_presets_team_fk ON public.commercial_presets IS
  'ทีมของเงื่อนไขการค้า — ชี้ทะเบียน teams (mig 0311) แทน CHECK ที่ฝังรหัส ODM/KA/SV ไว้ใน SQL';

COMMIT;

NOTIFY pgrst, 'reload schema';
