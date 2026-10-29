-- 0416 — SO ค่าสรรพสามิต: สร้างจากใบเสนอราคาค่าสรรพสามิตที่รับแล้ว + ยื่น/อนุมัติแบบไม่มีดีล/โครงการ + เจ้าของจากดีลต้นทาง
--
--  แผน: docs/excise-qt-so-rework-plan.md หมวด 3.2 · หมวด 5 · หมวด 6 (0416) · มติเจ้าของ 28/10/2026
--  · SO ค่าสรรพสามิต (`sales_orders.origin = 'excise'` · CHECK ของ 0414) ไม่มีดีล ไม่มีโครงการ · Actual = 0 · ไม่มี Rev.
--  · สร้างด้วย RPC ใหม่ `create_excise_sales_order_draft` — ลอกจาก `create_sales_order_draft` ตัวที่รันจริง (0363 + ปะ 0407)
--    ตัวเดิมเติมแถวผ่าน `FROM sales_deals d WHERE d.id = v_quote."dealId"` ⇒ ใบไม่มีดีลจะไม่แทรกอะไรเลย ใช้ร่วมไม่ได้
--  · ยื่น/อนุมัติใช้ RPC เดิม ปะสองจุด: ข้อ "ต้องมีโครงการ" ยกเว้นใบ excise · ข้อ "QT ที่รับแล้วบนดีลเดียวกัน"
--    ใบ excise ใช้ "QT ค่าสรรพสามิตที่รับแล้วของ SO ต้นทางเดียวกัน" แทน (ใบปกติตรวจเหมือนเดิมทุกตัวอักษร)
--  · trigger เจ้าของ (0294) อ่านดีลจาก "dealId" ตรง ๆ ⇒ ใบไม่มีดีลจะได้เจ้าของว่างตอนอนุมัติ ⇒ ถอยไปดีลของ SO ต้นทาง
--    (กระดิ่งวางบิล/ใบกำกับส่งถึง ownerId ของใบ จึงถึงฝ่ายขายเจ้าของดีลต้นทาง)
--  · ย้อนอนุมัติ SO ค่าสรรพสามิตไม่ได้ — Rev. เกิดไม่ได้ (CHECK revisionNo = 0) ถ้าปล่อย ใบจะค้าง approval_revoked ตลอดไป
--    แก้ด้วยยกเลิกแล้วออกใหม่เท่านั้น · route ปฏิเสธก่อนถึงฐาน · ฐานกันด้วย **trigger** บน sales_orders (ข้อ 3)
--    🐞 29/10: รุ่นแรกปะเนื้อ `revoke_sales_order_approval_atomic` แล้วข้อความยึดไม่เจอบน prod (src=0 def=0 — เนื้อตัวที่รันจริง
--       ต่างจากสายไฟล์ · ทั้งไฟล์ถอยกลับ ไม่มีอะไรเปลี่ยน) ⇒ เปลี่ยนเป็น trigger ที่ไม่ขึ้นกับเนื้อฟังก์ชันใด ๆ และกันทุกทางที่พาใบไป approval_revoked
--  · ไม่แตะ `revise_approved_sales_order_atomic` (CHECK + ด่าน JS กันแล้ว) · `approve_sales_order_with_actual_mode` (0412)
--    เรียกตัวอนุมัติที่ปะแล้วข้างใน และ route ส่ง 'order' ให้ใบ excise เสมอ (CHECK 0412 ยอมรายงวดเฉพาะ pipeline)
--
--  🛑 ลำดับขึ้นระบบ: **รันไฟล์นี้ก่อน merge PR4** (`claude/excise-pr4-sales-order`) — โค้ดชุดนั้นเรียก RPC ใหม่ ·
--     รันแล้วโค้ดที่ deploy อยู่ทำงานเหมือนเดิม: ยังไม่มี SO excise สักใบ และใบปกติผ่านทุกด่านเหมือนก่อนปะ
--  ⚠️ เนื้อ RPC ที่ปะมาจาก `pg_get_functiondef` ของตัวที่รันจริง (แบบ 0382/0404/0412/0415):
--     ข้อความยึดต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ functiondef ไม่งั้นหยุดทั้งไฟล์ · มีป้ายของจุดนั้นแล้ว = ข้าม
--  ✅ รันซ้ำได้ (ปะแล้วข้าม · CREATE OR REPLACE)
--  🧪 พิสูจน์บนฮาร์เนส PGlite (นอก repo) — โหลด schema.sql + 0001–0415 จากไฟล์จริง แล้วรันไฟล์นี้สองรอบ + กรณีทดสอบ
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: patched = 3 · create_fn = 1 · create_grant = 0 · revoke_guard = 1 ──
--   SELECT
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND strpos(p.prosrc, '0416/E') > 0
--        AND p.proname IN ('submit_sales_order_with_signature_evidence_atomic', 'approve_sales_order_with_signature_evidence_atomic',
--                          'snapshot_sales_order_owner')) AS patched,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'create_excise_sales_order_draft') AS create_fn,
--    (SELECT count(*) FROM information_schema.routine_privileges
--      WHERE routine_schema = 'public' AND routine_name = 'create_excise_sales_order_draft'
--        AND grantee IN ('anon', 'authenticated', 'PUBLIC')) AS create_grant,
--    (SELECT count(*) FROM pg_trigger WHERE tgname = 'sales_orders_excise_no_revoke_trg' AND NOT tgisinternal) AS revoke_guard;
--
--  ── ถอยกลับ (ใช้ได้ตราบที่ยังไม่มี SO excise — มีแล้ว ห้ามถอย) ─────────────────────────────────────
--   BEGIN;
--   DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.sales_orders WHERE origin = 'excise')
--     THEN RAISE EXCEPTION 'excise sales orders exist'; END IF; END $$;
--   DROP FUNCTION IF EXISTS public.create_excise_sales_order_draft(text, text, text, text, jsonb);
--   DROP TRIGGER IF EXISTS sales_orders_excise_no_revoke_trg ON public.sales_orders;
--   DROP FUNCTION IF EXISTS public.guard_excise_sales_order_revoke();
--   DO $undo$ DECLARE r record; v_def text; BEGIN
--     FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND strpos(p.prosrc, '0416/E') > 0 LOOP
--       v_def := pg_get_functiondef(r.oid);
--       v_def := replace(v_def, 'OR (v_order."projectId" IS NULL AND v_order.origin IS DISTINCT FROM ''excise'') /* 0416/E1 */',
--         'OR v_order."projectId" IS NULL');
--       v_def := replace(v_def, 'AND (q."dealId" = v_order."dealId" OR (v_order.origin = ''excise'' AND q.origin = ''excise'''
--         || ' AND q."sourceSalesOrderId" = v_order."sourceSalesOrderId")) /* 0416/E2 */', 'AND q."dealId" = v_order."dealId"');
--       v_def := replace(v_def, 'WHERE d.id = COALESCE(NEW."dealId", (SELECT so."dealId" FROM public.sales_orders so'
--         || ' WHERE so.id = NEW."sourceSalesOrderId")); -- 0416/E3', 'WHERE d.id = NEW."dealId";');
--       EXECUTE v_def;
--     END LOOP; END $undo$;
--   COMMIT;

BEGIN;

-- ── 1) ปะสาม RPC: ยื่น/อนุมัติ (ยกเว้นโครงการ + QT ของ SO ต้นทาง) · เจ้าของจากดีลต้นทาง ─────────────────────────
DO $patch$
DECLARE
  v_patches constant text[][] := ARRAY[
    ARRAY['submit_sales_order_with_signature_evidence_atomic', '0416/E1',
      'OR v_order."projectId" IS NULL',
      'OR (v_order."projectId" IS NULL AND v_order.origin IS DISTINCT FROM ''excise'') /* 0416/E1 */'],
    ARRAY['submit_sales_order_with_signature_evidence_atomic', '0416/E2',
      'AND q."dealId" = v_order."dealId"',
      'AND (q."dealId" = v_order."dealId" OR (v_order.origin = ''excise'' AND q.origin = ''excise'''
        || ' AND q."sourceSalesOrderId" = v_order."sourceSalesOrderId")) /* 0416/E2 */'],
    ARRAY['approve_sales_order_with_signature_evidence_atomic', '0416/E1',
      'OR v_order."projectId" IS NULL',
      'OR (v_order."projectId" IS NULL AND v_order.origin IS DISTINCT FROM ''excise'') /* 0416/E1 */'],
    ARRAY['approve_sales_order_with_signature_evidence_atomic', '0416/E2',
      'AND q."dealId" = v_order."dealId"',
      'AND (q."dealId" = v_order."dealId" OR (v_order.origin = ''excise'' AND q.origin = ''excise'''
        || ' AND q."sourceSalesOrderId" = v_order."sourceSalesOrderId")) /* 0416/E2 */'],
    ARRAY['snapshot_sales_order_owner', '0416/E3',
      'WHERE d.id = NEW."dealId";',
      'WHERE d.id = COALESCE(NEW."dealId", (SELECT so."dealId" FROM public.sales_orders so'
        || ' WHERE so.id = NEW."sourceSalesOrderId")); -- 0416/E3']
  ];
  i integer;
  v_fn text;
  v_marker text;
  v_anchor text;
  v_new text;
  v_n integer;
  v_oid oid;
  v_src text;
  v_def text;
  v_src_hits integer;
  v_def_hits integer;
BEGIN
  FOR i IN 1 .. array_length(v_patches, 1) LOOP
    v_fn := v_patches[i][1];
    v_marker := v_patches[i][2];
    v_anchor := v_patches[i][3];
    v_new := v_patches[i][4];

    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0416_patch_overload % count=%', v_fn, v_n; END IF;

    -- อ่านใหม่ทุกรอบ — ฟังก์ชันเดียวกันถูกปะสองจุดต่อกัน
    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    v_def := pg_get_functiondef(v_oid);

    IF strpos(v_src, v_marker) > 0 THEN
      RAISE NOTICE '0416: % % — ปะไว้แล้ว', v_fn, v_marker;
      CONTINUE;
    END IF;

    v_src_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    v_def_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_src_hits <> 1 OR v_def_hits <> 1 THEN
      RAISE EXCEPTION 'mig_0416_patch_anchor % % src=% def=%', v_fn, v_marker, v_src_hits, v_def_hits;
    END IF;

    EXECUTE replace(v_def, v_anchor, v_new);
    RAISE NOTICE '0416: % % — ปะแล้ว', v_fn, v_marker;
  END LOOP;
END
$patch$;

-- ── 2) สร้าง SO ค่าสรรพสามิต (ร่าง) จากใบเสนอราคาค่าสรรพสามิตที่รับแล้ว ─────────────────────────────────
--  ลอกจาก create_sales_order_draft (0363 + ปะ 0407) ต่างกันเท่าที่ใบไม่มีดีลต้องต่าง:
--   · ใบต้องเป็น origin excise ที่รับแล้ว · SO ลูกค้าต้นทางยังอนุมัติ ไม่ถูกแทน เป็น pipeline (ล็อก FOR UPDATE)
--   · origin 'excise' · "dealId"/"projectId" ว่าง · "sourceSalesOrderId" จากใบ · "actualAmount" = 0 (CHECK 0414)
--   · เลขรัน/รูปแบบเลข/เอกสารยืนยัน/บรรทัด (รวม metadata + packQty) เหมือนใบปกติทุกตัวอักษร — ใช้ตัวนับ SO ชุดเดิม
--  ⚠️ ไม่สร้างงวด — route สร้างงวดจากแผนชำระของใบหลัง RPC ตามเส้นเดิมของใบปกติ
CREATE OR REPLACE FUNCTION public.create_excise_sales_order_draft(
  p_quote_id text,
  p_order_id text,
  p_actor_id text,
  p_actor_name text,
  p_overrides jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_quote public.quotations%ROWTYPE;
  v_source public.sales_orders%ROWTYPE;
  v_order public.sales_orders%ROWTYPE;
  v_now timestamp;
  v_year text;
  v_seed integer := 0;
  v_pattern text;
  v_running_width integer;
  v_running_no integer;
  v_order_number text;
  v_overrides jsonb := COALESCE(p_overrides, '{}'::jsonb);
  v_confirm_type text := NULLIF(v_overrides->>'confirmDocType', '');
  v_confirm_no text := NULLIF(btrim(COALESCE(v_overrides->>'confirmDocNo', '')), '');
  v_confirm_date date := NULLIF(v_overrides->>'confirmDocDate', '')::date;
  v_confirm_files jsonb := COALESCE(v_overrides->'confirmAttachments', '[]'::jsonb);
  v_reference_doc text := NULLIF(btrim(COALESCE(v_overrides->>'referenceDoc', '')), '');
  v_notes text := NULLIF(v_overrides->>'notes', '');
  v_delivery_due date := NULLIF(v_overrides->>'deliveryDueDate', '')::date;
BEGIN
  SELECT * INTO v_quote FROM public.quotations WHERE id = p_quote_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'quotation_not_found'; END IF;
  IF v_quote.origin IS DISTINCT FROM 'excise' THEN RAISE EXCEPTION 'excise_quotation_origin_invalid'; END IF;
  IF v_quote.status <> 'accepted' THEN RAISE EXCEPTION 'quotation_not_won'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.sales_orders
    WHERE "quotationId" = v_quote.id
      AND status <> 'cancelled'
      AND "supersededById" IS NULL
  ) THEN
    RAISE EXCEPTION 'sales_order_already_exists';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.quotation_lines WHERE "quotationId" = v_quote.id) THEN
    RAISE EXCEPTION 'quotation_lines_required';
  END IF;
  IF v_confirm_type IS NOT NULL AND v_confirm_type NOT IN ('payment_slip','po','order_confirmation') THEN
    RAISE EXCEPTION 'sales_order_confirm_type_invalid';
  END IF;
  IF jsonb_typeof(v_confirm_files) <> 'array' THEN
    RAISE EXCEPTION 'sales_order_confirm_files_invalid';
  END IF;

  -- SO ลูกค้าต้นทาง — ล็อกกันการยกเลิก/ย้อนอนุมัติที่วิ่งชนกันระหว่างสร้าง (ด่าน Q16 ของ route อ่านใบค่าสรรพสามิตที่รับแล้ว)
  SELECT * INTO v_source FROM public.sales_orders WHERE id = v_quote."sourceSalesOrderId" FOR UPDATE;
  IF NOT FOUND OR v_source.origin IS DISTINCT FROM 'pipeline' OR v_source.status IS DISTINCT FROM 'approved'
     OR v_source."supersededById" IS NOT NULL THEN
    RAISE EXCEPTION 'excise_source_order_invalid';
  END IF;

  v_now := timezone('Asia/Bangkok', now());
  v_year := to_char(v_now, 'YY');

  SELECT NULLIF(btrim(v."numberingPattern"), '') INTO v_pattern
  FROM public.document_standard_versions v
  WHERE v."documentKey" = 'salesOrder' AND v.status = 'published';
  v_pattern := COALESCE(v_pattern, 'SO-{YY}{MM}{RUNNING:4}-{REVISION}');

  v_running_width := COALESCE((substring(v_pattern from '\{RUNNING:(\d)\}'))::integer, 4);

  IF NOT EXISTS (SELECT 1 FROM public.sales_order_number_counters WHERE month = v_year) THEN
    SELECT COALESCE(max("lastNo"), 0) INTO v_seed
    FROM public.sales_order_number_counters
    WHERE month LIKE v_year || '%' AND length(month) = 4;
  END IF;

  INSERT INTO public.sales_order_number_counters AS c (month, "lastNo")
  VALUES (v_year, v_seed + 1)
  ON CONFLICT (month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo" INTO v_running_no;
  IF v_running_no > power(10, v_running_width)::integer - 1 THEN
    RAISE EXCEPTION 'sales_order_yearly_sequence_exhausted';
  END IF;

  v_order_number := v_pattern;
  v_order_number := replace(v_order_number, '{YYYY}', to_char(v_now, 'YYYY'));
  v_order_number := replace(v_order_number, '{YY}', to_char(v_now, 'YY'));
  v_order_number := replace(v_order_number, '{MM}', to_char(v_now, 'MM'));
  v_order_number := replace(v_order_number, '{DD}', to_char(v_now, 'DD'));
  v_order_number := replace(v_order_number, '{RUNNING:3}', lpad(v_running_no::text, 3, '0'));
  v_order_number := replace(v_order_number, '{RUNNING:4}', lpad(v_running_no::text, 4, '0'));
  v_order_number := replace(v_order_number, '{RUNNING:5}', lpad(v_running_no::text, 5, '0'));
  v_order_number := replace(v_order_number, '{REVISION}', '0');

  INSERT INTO public.sales_orders (
    id, "orderNumber", "quotationId", "dealId", "projectId", "customerId",
    "customerName", status, "orderDate", "paymentDueDate", subtotal,
    "discountAmount", "vatAmount", "totalAmount", "actualAmount", notes,
    "referenceDoc", "confirmDocType", "confirmDocNo", "confirmDocDate", "confirmAttachments",
    "docLanguage",
    "customerNameEn", "billingAddressEn", "shippingAddressEn",
    "deliveryDueDate",
    origin, "sourceSalesOrderId",
    metadata, "createdBy", "createdByName", "createdAt", "updatedAt"
  ) VALUES (
    p_order_id, v_order_number, v_quote.id, NULL, NULL,
    v_quote."customerId", v_quote."customerName", 'draft',
    v_now::date,
    v_quote."wonPaymentDueDate",
    v_quote.subtotal, COALESCE(v_quote."discountAmount", 0),
    v_quote."vatAmount", v_quote."totalAmount",
    0,
    COALESCE(v_notes, v_quote.notes),
    COALESCE(v_reference_doc, v_confirm_no, v_quote."wonDocNo"),
    v_confirm_type, v_confirm_no, v_confirm_date, v_confirm_files,
    CASE WHEN v_quote."docLanguage" IN ('th', 'en') THEN v_quote."docLanguage" ELSE 'th' END,
    v_quote."customerNameEn", v_quote."billingAddressEn", v_quote."shippingAddressEn",
    v_delivery_due,
    'excise', v_source.id,
    jsonb_build_object('source', 'excise_quotation', 'quoteNumber', v_quote."quoteNumber",
      'sourceOrderNumber', v_source."orderNumber"),
    p_actor_id, p_actor_name, now(), now()
  )
  RETURNING * INTO v_order;

  INSERT INTO public.sales_order_lines (
    id, "salesOrderId", "quotationLineId", "productId", "fgCode", description,
    qty, "unitPrice", "unit", "discountType", "discountValue", "discountAmount",
    "lineTotal", "sortOrder", metadata, "packQty"
  )
  SELECT
    'SOL-' || md5(p_order_id || ':' || ql.id), p_order_id, ql.id, ql."productId", ql."fgCode", ql.description,
    ql.qty, ql."unitPrice", COALESCE(ql."unit", 'ชิ้น'), ql."discountType", COALESCE(ql."discountValue", 0),
    COALESCE(ql."discountAmount", 0), ql."lineTotal", ql."sortOrder", ql.metadata, ql."packQty"
  FROM public.quotation_lines ql
  WHERE ql."quotationId" = v_quote.id;

  RETURN to_jsonb(v_order);
END;
$$;

REVOKE ALL ON FUNCTION public.create_excise_sales_order_draft(text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_excise_sales_order_draft(text, text, text, text, jsonb) TO service_role;

-- ── 3) ย้อนอนุมัติ SO ค่าสรรพสามิตไม่ได้ — trigger กันทุกทางที่พาใบไป approval_revoked ───────────────────────────
--  ไม่ปะเนื้อ revoke_sales_order_approval_atomic (เนื้อบน prod ต่างจากสายไฟล์ — ดูหัวไฟล์) · รหัสเดียวกับที่ route/จอแปลไทยไว้
--  ⚠️ trigger กรองด้วย WHEN ⇒ ใบอื่นไม่เรียกฟังก์ชันนี้เลย · INSERT ไม่เกี่ยว (ใบเกิดเป็นร่างเสมอ)
CREATE OR REPLACE FUNCTION public.guard_excise_sales_order_revoke()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'sales_order_revoke_excise_forbidden';
END;
$$;

DROP TRIGGER IF EXISTS sales_orders_excise_no_revoke_trg ON public.sales_orders;
CREATE TRIGGER sales_orders_excise_no_revoke_trg
BEFORE UPDATE OF status ON public.sales_orders
FOR EACH ROW
WHEN (NEW.origin = 'excise' AND NEW.status = 'approval_revoked' AND OLD.status IS DISTINCT FROM 'approval_revoked')
EXECUTE FUNCTION public.guard_excise_sales_order_revoke();

COMMIT;

NOTIFY pgrst, 'reload schema';
