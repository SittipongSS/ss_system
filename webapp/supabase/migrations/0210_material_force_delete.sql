-- 0210 - ทะเบียนวัสดุ: เปิด break-glass ให้ผู้ดูแลระบบ "ลบได้จริง"
--
-- อาการที่เจอ: กดปุ่มลบวัสดุด้วยสิทธิ์ admin แล้วลบไม่ได้สักตัว — พรีวิวบอกว่าลบได้
-- (หรือบอกว่าลบไม่ได้เด็ดขาด) แต่ไม่มีทางไหนที่ลบสำเร็จเลย · มีสามด่านซ้อนกัน:
--
--   1) `material_price_revisions` มี trigger BEFORE DELETE ที่ RAISE ทุกกรณี (0143)
--      และ `material_price_revision_tiers` เหมือนกัน (0157) → วัสดุที่ **มีประวัติราคา**
--      ลบไม่ได้เลยแม้ FK จะเป็น CASCADE เพราะ cascade ไปโดน trigger ตาย
--   2) `dept_request_items."materialId"`      → FK RESTRICT (0158)
--   3) `costing_item_components."materialId"` → FK RESTRICT (0159)
--
-- ไฟล์นี้เปิดช่อง `app.force_delete` ให้ครบทั้งสามด่าน ตามแพตเทิร์นเดียวกับ 0147
-- (flag เป็น local ต่อ transaction · ตั้งได้จาก RPC SECURITY DEFINER ที่ GRANT เฉพาะ
-- service_role เท่านั้น · ชั้น API ยังจำกัด role = 'admin' อีกชั้นที่ canForceDelete)
--
-- ⚠️ เจตนาที่เปลี่ยนไปจากคอมเมนต์เดิมใน lib/forceDelete.js — เดิมตั้งใจ "ไม่ลบเอกสาร
-- ของคนอื่นตามให้อัตโนมัติ" แล้วตอบว่าลบไม่ได้เลย · มติผู้ใช้ 2026-08-05: ผู้ดูแลระบบ
-- ต้องมีทางลบได้จริง จึงลบให้ แต่ทำสองแบบไม่เหมือนกันตามรูปร่างของข้อมูล:
--   • ใบขอราคาผลิต → **ปลดการเชื่อมโยง** (materialId/materialRevisionId = NULL)
--     บรรทัดยังอยู่ครบเพราะ label/ราคาเป็น snapshot บนแถวอยู่แล้ว (0141)
--   • บรรทัดคำร้อง → **ลบทั้งบรรทัด** เพราะ constraint dept_request_items_shape (0204)
--     บังคับว่า lineKind='material' ต้องมี materialId เสมอ ปลดเป็น NULL ไม่ได้
--     (ตัวคำร้องและบรรทัดชนิดอื่นยังอยู่ · พรีวิวบอกจำนวนบรรทัดที่จะหายให้เห็นก่อนยืนยัน)
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

BEGIN;

-- ── 1) guard รุ่นราคา + ชั้นราคา: เพิ่มช่อง force ────────────────────────
-- ยังคง immutable เหมือนเดิมทุกกรณี (ห้าม UPDATE เด็ดขาด · DELETE ห้ามเช่นกัน)
-- ยกเว้นตอนที่ transaction ตั้ง flag ไว้ ซึ่งเข้าถึงได้ทางเดียวคือ RPC ข้างล่าง
CREATE OR REPLACE FUNCTION public.guard_material_price_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'material_price_revision_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'material_price_revision_immutable';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_material_price_revision_tier()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'material_price_revision_tier_delete_forbidden';
  END IF;
  RAISE EXCEPTION 'material_price_revision_tier_immutable';
END;
$$;

-- ── 2) RPC บังคับลบวัสดุหนึ่งตัว (ทั้งสายในทีเดียว) ──────────────────────
-- ต้องอยู่ใน RPC เดียวกับ DELETE เพราะ flag เป็น transaction-local — ปลดของนอก
-- transaction นี้แล้วค่อยลบ ถ้าลบพลาดจะเหลือเอกสารที่ถูกปลดทิ้งไว้โดยวัสดุยังอยู่
CREATE OR REPLACE FUNCTION public.force_delete_material_price(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE rev_ids text[];
BEGIN
  PERFORM set_config('app.force_delete', '1', true);  -- true = local ต่อ transaction

  SELECT coalesce(array_agg(id), '{}') INTO rev_ids
    FROM public.material_price_revisions WHERE "materialId" = p_id;

  -- ใบขอราคาผลิต: ปลดตัวชี้ทั้งคู่ (materialRevisionId ก็เป็น RESTRICT เหมือนกัน)
  -- label / pricePerKg / pricePerUnit เป็น snapshot บนแถว → บรรทัดยังอ่านออกครบ
  UPDATE public.costing_item_components
     SET "materialId" = NULL, "materialRevisionId" = NULL, "updatedAt" = now()
   WHERE "materialId" = p_id
      OR "materialRevisionId" = ANY (rev_ids);

  -- บรรทัดคำร้อง: อยู่ต่อไม่ได้ถ้าไม่มีวัสดุ (constraint shape) → ลบทั้งบรรทัด
  -- answeredRevisionId เป็น FK NO ACTION → ต้องกวาดแถวที่อ้าง rev ของวัสดุนี้ด้วย
  -- ไม่งั้น cascade ลบ rev จะชน FK แล้วล้มทั้ง transaction
  DELETE FROM public.dept_request_items
   WHERE "materialId" = p_id
      OR "answeredRevisionId" = ANY (rev_ids);

  -- material_price_revisions / _tiers เป็น CASCADE (0143/0157) — ผ่าน guard ได้แล้ว
  -- material_deliveries."materialId" เป็น SET NULL (0176) — ของเข้ายังอยู่
  DELETE FROM public.material_prices WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_material_price(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_material_price(text) TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Rollback guidance:
-- 1) ถอน = CREATE OR REPLACE guard 2 ตัวกลับเป็นเวอร์ชัน 0143/0157 (เอาบรรทัด
--    current_setting ออก) + DROP FUNCTION public.force_delete_material_price(text)
-- 2) ข้อมูลไม่กระทบ — ไฟล์นี้ไม่แก้แถวไหนเลย มีแต่ฟังก์ชัน
-- 3) flag app.force_delete เป็น transaction-local ไม่ค้างข้าม transaction

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────
-- SELECT proname FROM pg_proc WHERE proname = 'force_delete_material_price';        -- 1 แถว
-- SELECT pg_get_functiondef(oid) ILIKE '%app.force_delete%'
--   FROM pg_proc WHERE proname = 'guard_material_price_revision';                    -- t
-- SELECT pg_get_functiondef(oid) ILIKE '%app.force_delete%'
--   FROM pg_proc WHERE proname = 'guard_material_price_revision_tier';               -- t
