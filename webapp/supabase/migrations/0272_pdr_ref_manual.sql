-- ── 0272 · เลขที่เอกสาร PDR ที่ RD กรอกเอง (ช่วงเปลี่ยนผ่าน) ──────────────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-08-20 · ต่อจาก 0271): เดือนนี้ RD ยังเดินเลขบนกระดาษ
--   ของตัวเองอยู่ ⇒ **ใบที่รับเรื่องเดือน ส.ค. 2569 ให้กรอกเลขเอง** แล้วระบบเริ่ม
--   ออกเลขอัตโนมัติตั้งแต่ **ใบที่รับเรื่องเดือน ก.ย. 2569** เป็นต้นไป
--   (เกณฑ์ยึด **เดือนของ `acknowledgedAt` ของใบ** ไม่ใช่วันที่ตอนกด — ใบเดือน ส.ค.
--   ที่มากรอกเดือน ก.ย. ก็ยังเป็นเลขของ ส.ค. · ค่าตัดรอบอยู่ที่
--   `PDR_REF_AUTO_FROM_MONTH` ใน `lib/requests/pdrRefNo.js` ที่เดียว)
--
-- ⚠️ **ทำไมต้องมีคอลัมน์ธง ไม่ใช้เดือนตัดสินใน trigger** — เดือนตัดรอบเป็นกติกาของ
--   ช่วงเปลี่ยนผ่านที่จะขยับได้อีก · ฝัง '2609' ลง trigger เมื่อไร การเลื่อนวันตัดรอบ
--   จะกลายเป็น migration ทุกครั้ง และ trigger จะโกหกทันทีที่ค่าในโค้ดเปลี่ยน
--
-- ⭐ **เลขกรอกเองแก้ได้จนกว่าจะปิดเรื่อง · เลขที่ระบบออกล็อกทันที** (มติผู้ใช้)
--   คนพิมพ์เองย่อมพิมพ์ผิดได้ ⇒ ไม่มีทางแก้เลย แปลว่าต้องไปแก้ที่ DB ทุกครั้ง ·
--   ส่วนเลขอัตโนมัติไม่มีใครพิมพ์ จึงไม่มีเหตุให้เปิดช่องแก้
--
-- ⚠ รันมือบน Supabase (เหมือน migration อื่น) · รันซ้ำได้

ALTER TABLE public.dept_requests ADD COLUMN IF NOT EXISTS "pdrRefManual" boolean;

COMMENT ON COLUMN public.dept_requests."pdrRefManual" IS
  'true = เลขที่เอกสาร PDR ใบนี้ RD กรอกเอง (แก้ได้จนปิดเรื่อง) · false/NULL = ระบบออกให้ (ล็อกถาวร)';

-- ── guard: เขียนทับทั้งตัว (ของเดิมอยู่ที่ 0271 ซึ่งยกมาจาก 0173) ───────────
--
-- ⚠️ plpgsql ไม่มี "เติมเงื่อนไข" ⇒ ด่านเดิมทุกข้อต้องยกมาครบ
CREATE OR REPLACE FUNCTION public.guard_dept_request()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF current_setting('app.force_delete', true) = '1' THEN RETURN OLD; END IF;
    IF OLD.status = 'draft' AND OLD."submittedAt" IS NULL THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'dept_request_delete_forbidden';
  END IF;
  IF OLD."docNo" IS NOT NULL AND NEW."docNo" IS DISTINCT FROM OLD."docNo" THEN
    RAISE EXCEPTION 'dept_request_doc_no_immutable';
  END IF;

  -- ⚠️ **ธงห้ามพลิกหลังมีเลขแล้ว** — ไม่งั้นปลดล็อกเลขอัตโนมัติได้ด้วยการตั้งธงเป็น
  --   true ก่อนหนึ่งคำสั่ง แล้วค่อยแก้เลข ซึ่งทำให้ด่านข้างล่างไม่มีความหมาย
  IF OLD."pdrRefNo" IS NOT NULL AND NEW."pdrRefManual" IS DISTINCT FROM OLD."pdrRefManual" THEN
    RAISE EXCEPTION 'dept_request_pdr_ref_manual_immutable';
  END IF;

  IF OLD."pdrRefNo" IS NOT NULL AND NEW."pdrRefNo" IS DISTINCT FROM OLD."pdrRefNo" THEN
    -- เลขที่ระบบออกให้: พิมพ์ลงกระดาษไปแล้วต้องตามกลับมาที่ใบเดิมได้เสมอ
    IF COALESCE(OLD."pdrRefManual", false) = false THEN
      RAISE EXCEPTION 'dept_request_pdr_ref_no_immutable';
    END IF;
    -- เลขกรอกเอง: แก้ได้จนกว่าใบจะจบ · ใบที่จบแล้วเป็นบันทึก ไม่ใช่ของที่ยังแก้ได้
    IF OLD.status IN ('closed', 'cancelled') THEN
      RAISE EXCEPTION 'dept_request_pdr_ref_no_closed';
    END IF;
  END IF;

  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'dept_request_cancelled_immutable';
  END IF;
  RETURN NEW;
END;
$$;

NOTIFY pgrst, 'reload schema';
