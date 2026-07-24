-- 0147 - ระบบขอราคาผลิต: admin force-delete ใบขอราคาวัสดุ + ใบขอราคาผลิต
--
-- guard เดิม (0141/0143) บล็อก DELETE ใบที่ส่งออกแล้ว (หลักฐาน) — ยอมลบเฉพาะร่าง
-- ที่ยังไม่ส่ง. ผู้ดูแลระบบ (admin) ขอ break-glass ลบได้ทุกสถานะ (ลบข้อมูลทดสอบ/
-- ขยะ) ตามแพตเทิร์น lib/forceDelete.js เดิม — จำกัด role=admin ที่ชั้น API
--
-- วิธี: guard เพิ่มช่องยอม DELETE เมื่อ session flag app.force_delete='1' (ตั้งผ่าน
-- RPC SECURITY DEFINER ที่ตั้ง flag แบบ local ต่อ transaction แล้วลบ) — คนทั่วไป
-- ตั้ง flag นี้ไม่ได้เพราะเข้า RPC ไม่ได้ (GRANT เฉพาะ service_role)
--
-- ลูกทั้งหมด (items/components/tiers) FK ON DELETE CASCADE อยู่แล้ว — ลบใบพอ
-- ⚠ ไม่แตะคลังราคาวัสดุ (material_prices/revisions) — วัสดุใช้ร่วมหลายใบ ไม่ลบตาม
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

-- ── 1) guard ใบขอราคาผลิต: เพิ่มช่อง force ──
CREATE OR REPLACE FUNCTION public.guard_costing_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- break-glass ผู้ดูแลระบบ (ตั้ง flag ผ่าน RPC force_delete_costing_request)
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    IF OLD.status = 'draft' AND OLD."submittedAt" IS NULL THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'costing_request_delete_forbidden';
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."dealId" IS DISTINCT FROM OLD."dealId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'costing_request_identity_immutable';
  END IF;
  IF OLD."docNo" IS NOT NULL AND NEW."docNo" IS DISTINCT FROM OLD."docNo" THEN
    RAISE EXCEPTION 'costing_request_doc_no_immutable';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'costing_request_cancelled_immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 2) guard ใบขอราคาวัสดุ: เพิ่มช่อง force ──
CREATE OR REPLACE FUNCTION public.guard_material_price_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    IF OLD.status = 'draft' AND OLD."submittedAt" IS NULL THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'material_price_request_delete_forbidden';
  END IF;
  IF OLD."docNo" IS NOT NULL AND NEW."docNo" IS DISTINCT FROM OLD."docNo" THEN
    RAISE EXCEPTION 'material_price_request_doc_no_immutable';
  END IF;
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'material_price_request_cancelled_immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3) RPC force-delete (ตั้ง flag local + ลบ; ลูก cascade) ──
CREATE OR REPLACE FUNCTION public.force_delete_costing_request(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.force_delete', '1', true);  -- true = local ต่อ transaction
  DELETE FROM public.costing_requests WHERE id = p_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.force_delete_material_request(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.force_delete', '1', true);
  DELETE FROM public.material_price_requests WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public.force_delete_costing_request(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.force_delete_material_request(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_costing_request(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.force_delete_material_request(text) TO service_role;

-- Rollback guidance:
-- 1) ถอน = CREATE OR REPLACE guard 2 ตัวกลับเป็นเวอร์ชัน 0141/0143 (เอา force ออก)
--    + DROP FUNCTION force_delete_* — ข้อมูลไม่กระทบ
-- 2) flag app.force_delete เป็น session-local เท่านั้น ไม่ค้างข้าม transaction

NOTIFY pgrst, 'reload schema';
