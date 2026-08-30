-- ============================================================
--  Migration 0322 (M2 ของเฟสสัญญาบริการ): สัญญาที่ "เอกสารภายนอก" ใช้แทนตัวสัญญา
--                                          (มติผู้ใช้ 2026-08-30)
--
--  คำสั่งตั้งต้น: *"(PO ลูกค้า / อีเมล / สัญญากระดาษเก่า / หรืออาจมีอื่นๆ)"* — ถามว่า
--  เอกสารอื่นใช้แทนสัญญาได้ไหม ผู้ใช้ตอบ **"เอา"** พร้อมเงื่อนไขว่า **ต้องผ่าน AE Sup อนุมัติ**
--
--  ⭐ **ทำไมต้องมี** — งานบริการทั้งเส้นติดด่าน "ต้องมีสัญญา" แต่ระบบออกสัญญาบริการ
--  ไม่ได้เลยสักใบ เพราะยังไม่มีต้นฉบับสัญญาจ้างบริการ (`contractTemplates.js` service = null)
--  ⇒ ของจริงที่ลูกค้าเซ็นมาแล้วคือ PO/อีเมล/สัญญากระดาษเก่า ซึ่งผูกพันจริงแต่ระบบไม่รับรู้
--  ⇒ ใบนี้เปิดทางให้ **เดินงานได้โดยไม่ต้องรอต้นฉบับ** และไม่ต้องกุสัญญาปลอมขึ้นมา
--
--  ⭐ **มติผู้ใช้ 2026-08-30: ใบ external ได้เลขที่ CT เหมือนสัญญาอื่น**
--  เลข CT คือเลขของ *ทะเบียน* ส่วน PO/อีเมลคือ *หลักฐาน* ที่แนบ ⇒ ทุกแถวในทะเบียน
--  มีเลขเหมือนกันหมด และไม่ต้องแก้ CHECK ที่คุมสัญญาทั้งระบบ (ทางเลือกอีกทางคือผ่อน
--  `sales_contracts_status_number` ให้ external ซึ่งจะได้ทะเบียนที่มีแถวช่องเลขว่าง — ไม่เอา)
--
--  สายเดินของ external (ต่างจาก generated ตรงที่ **ไม่ผ่าน awaiting_signature**):
--      draft ──[AE Sup อนุมัติ: แนบไฟล์ + วันมีผล/สิ้นสุด]──> signed ■
--  ของ generated ยังเป็น draft → awaiting_signature → signed เหมือนเดิมทุกประการ
--
--  ⚠️ **ไม่แตะแถวเดิมสักแถว** — `source` มี DEFAULT 'generated' ⇒ สัญญาที่มีอยู่ทั้งหมด
--  ถูกตีความเป็น "เจนจากแม่แบบ" ซึ่งตรงกับความจริง (ยังไม่เคยมีเส้น external มาก่อน)
--
--  🛑 **ต้องรันก่อน deploy** — `master_row_assignments` สร้าง SET จาก
--  `information_schema.columns` ⇒ คีย์ที่ยังไม่มีคอลัมน์จริงจะ **ถูกทิ้งเงียบ ไม่ error**
--  ⇒ deploy โค้ดก่อนรันใบนี้ = ผู้ใช้สร้างใบ external ได้แต่ `source`/`externalDocKind`
--  หายไปเฉย ๆ กลายเป็นสัญญา generated ที่ไม่มีเนื้อ
--  รันซ้ำได้ (idempotent)
-- ============================================================

BEGIN;

ALTER TABLE public.sales_contracts
  ADD COLUMN IF NOT EXISTS source            text NOT NULL DEFAULT 'generated',
  ADD COLUMN IF NOT EXISTS "externalDocKind" text,
  ADD COLUMN IF NOT EXISTS "externalRef"     text,
  ADD COLUMN IF NOT EXISTS "approvedById"    text,
  ADD COLUMN IF NOT EXISTS "approvedByName"  text,
  ADD COLUMN IF NOT EXISTS "approvedAt"      timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_contracts_source_check') THEN
    ALTER TABLE public.sales_contracts
      ADD CONSTRAINT sales_contracts_source_check
      CHECK (source IN ('generated', 'external'));
  END IF;

  -- ชนิดเอกสารเป็นของบังคับของสาย external — "ใช้เอกสารอื่นแทน" โดยไม่บอกว่าเอกสารอะไร
  -- คือแถวที่ตอบไม่ได้ว่าอ้างอะไรอยู่ · generated ห้ามมีค่านี้ (จะได้ไม่มีแถวลูกผสม)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_contracts_external_kind') THEN
    ALTER TABLE public.sales_contracts
      ADD CONSTRAINT sales_contracts_external_kind
      CHECK (
        (source = 'external' AND "externalDocKind" IN ('customer_po', 'email', 'paper_contract', 'other'))
        OR (source = 'generated' AND "externalDocKind" IS NULL)
      );
  END IF;

  -- ⭐ ลายเซ็นอนุมัติต้องมากับสถานะ **ที่ระดับฐาน** ไม่ใช่พึ่งว่า API จะกรอกครบ
  -- (กติกาเดียวกับ `sales_orders_finance_state_sane` ของ mig 0250)
  -- ⇒ ใบ external ที่ signed แต่ไม่มีใครอนุมัติ = ไม่รู้ว่าใครรับผิดชอบการปลดล็อกนั้น
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_contracts_external_approved') THEN
    ALTER TABLE public.sales_contracts
      ADD CONSTRAINT sales_contracts_external_approved
      CHECK (
        source <> 'external'
        OR status <> 'signed'
        OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_contracts_external_ref_len') THEN
    ALTER TABLE public.sales_contracts
      ADD CONSTRAINT sales_contracts_external_ref_len
      CHECK ("externalRef" IS NULL OR length("externalRef") <= 200);
  END IF;
END $$;

COMMENT ON COLUMN public.sales_contracts.source IS
  'generated = เจนเนื้อจากแม่แบบ · external = เอกสารภายนอกใช้แทนตัวสัญญา (มติ 2026-08-30)';
COMMENT ON COLUMN public.sales_contracts."externalDocKind" IS
  'ชนิดเอกสารภายนอก: customer_po | email | paper_contract | other — บังคับเมื่อ source=external';
COMMENT ON COLUMN public.sales_contracts."externalRef" IS
  'เลขที่/หัวข้ออ้างอิงของเอกสารภายนอก เช่น เลข PO ของลูกค้า หรือหัวข้ออีเมล';
COMMENT ON COLUMN public.sales_contracts."approvedById" IS
  'AE Supervisor ที่อนุมัติให้เอกสารภายนอกใช้แทนสัญญาได้ (สาย external เท่านั้น)';

/* ── ออกเลข + อนุมัติ ในทรานแซกชันเดียว ────────────────────────────────────
   ⚠️ **ใช้ `issue_sales_contract` เดิมไม่ได้** — ตัวนั้นบังคับจบที่ `awaiting_signature`
   ซึ่งสาย external ไม่มีขั้นนั้น (ไม่มีใครต้องเซ็นอะไรอีก เอกสารเซ็นมาแล้ว)
   ⇒ ถ้าเรียกตัวเดิมแล้วค่อย PATCH เป็น signed จะมีจังหวะที่ใบอยู่สถานะที่โกหก
   และถ้าคำขอที่สองล้ม ใบจะค้างที่ "รอลงนาม" ตลอดกาลโดยไม่มีปุ่มไหนพาออกมา

   ⚠️ ตรรกะกินเลขลอกจาก `issue_sales_contract` ทั้งดุ้นโดยตั้งใจ (seed จากเลขฐานเดิม
   เมื่อเคาน์เตอร์ของเดือนยังไม่มี) — สองเส้นต้องกินเลขจากบ่อเดียวกัน ไม่งั้นเลขชนกัน */
CREATE OR REPLACE FUNCTION public.approve_external_sales_contract(
  p_id     text,
  p_month  text,
  p_prefix text,
  p_width  integer,
  p_patch  jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_no      integer;
  v_seed    integer := 0;
  v_base    text;
  v_number  text;
  v_status  text;
  v_source  text;
  v_sets    text;
  v_payload jsonb;
  v_result  jsonb;
BEGIN
  IF p_id IS NULL OR p_id = '' THEN RAISE EXCEPTION 'contract_id_required'; END IF;
  IF p_month IS NULL OR p_month = '' THEN RAISE EXCEPTION 'contract_month_required'; END IF;
  IF p_prefix IS NULL OR p_prefix = '' THEN RAISE EXCEPTION 'contract_prefix_required'; END IF;
  IF p_width IS NULL OR p_width < 1 OR p_width > 9 THEN RAISE EXCEPTION 'contract_width_invalid'; END IF;

  SELECT "contractNo", status, source INTO v_number, v_status, v_source
  FROM public.sales_contracts WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'contract_not_found: %', p_id; END IF;
  IF v_source IS DISTINCT FROM 'external' THEN RAISE EXCEPTION 'contract_not_external: %', v_source; END IF;
  IF v_number IS NOT NULL AND v_number <> '' THEN RAISE EXCEPTION 'contract_already_issued: %', v_number; END IF;
  IF v_status <> 'draft' THEN RAISE EXCEPTION 'contract_not_draft: %', v_status; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.entity_number_counters WHERE scope = 'CT' AND month = p_month) THEN
    SELECT COALESCE(max(substring("baseNumber" from length(p_prefix) + 1 for p_width)::integer), 0)
    INTO v_seed
    FROM public.sales_contracts
    WHERE "baseNumber" LIKE p_prefix || '%'
      AND substring("baseNumber" from length(p_prefix) + 1 for p_width) ~ '^[0-9]+$';
  END IF;

  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES ('CT', p_month, v_seed + 1)
  ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_no;

  IF v_no > power(10, p_width)::integer - 1 THEN
    RAISE EXCEPTION 'contract_monthly_sequence_exhausted: %', p_month;
  END IF;

  v_base   := p_prefix || lpad(v_no::text, p_width, '0');
  v_number := v_base || '-0';

  /* `issuedAt` ต้องมี เพราะ CHECK `sales_contracts_issued_complete` มัดไว้กับ `contractNo`
     · `issuedHtml` ปล่อยว่างได้ตาม CHECK เดียวกัน — ใบ external ไม่มีเนื้อให้ตรึง
       เนื้อของมันคือไฟล์ที่แนบ ไม่ใช่ HTML ที่ระบบเจน */
  v_payload := COALESCE(p_patch, '{}'::jsonb) || jsonb_build_object(
    'contractNo', v_number,
    'baseNumber', v_base,
    'revisionNo', 0,
    'status', 'signed',
    'issuedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'updatedAt', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
  );

  v_sets := public.master_row_assignments('sales_contracts', v_payload, 'src');
  IF v_sets IS NULL THEN RAISE EXCEPTION 'contract_patch_empty'; END IF;

  EXECUTE format(
    'UPDATE public.sales_contracts t SET %s FROM jsonb_populate_record(NULL::public.sales_contracts, $1) src'
    || ' WHERE t.id = $2 RETURNING to_jsonb(t)',
    v_sets
  ) USING v_payload, p_id INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_external_sales_contract(text, text, text, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_external_sales_contract(text, text, text, integer, jsonb)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ตรวจหลังรัน:
--   SELECT source, count(*) FROM public.sales_contracts GROUP BY source;   -- ควรได้ generated ทั้งหมด
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.sales_contracts'::regclass
--    AND conname LIKE '%external%' OR conname = 'sales_contracts_source_check';  -- ควรได้ 4 แถว
--
-- Rollback guidance:
--   DROP FUNCTION public.approve_external_sales_contract(text, text, text, integer, jsonb);
--   ALTER TABLE public.sales_contracts
--     DROP CONSTRAINT sales_contracts_external_approved, DROP CONSTRAINT sales_contracts_external_kind,
--     DROP CONSTRAINT sales_contracts_external_ref_len,  DROP CONSTRAINT sales_contracts_source_check,
--     DROP COLUMN source, DROP COLUMN "externalDocKind", DROP COLUMN "externalRef",
--     DROP COLUMN "approvedById", DROP COLUMN "approvedByName", DROP COLUMN "approvedAt";
--   ⚠️ ใบ external ที่ออกไปแล้วจะกลายเป็นสัญญาไม่มีเนื้อที่อธิบายตัวเองไม่ได้ — ตรวจก่อนถอย
