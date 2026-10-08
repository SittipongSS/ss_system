-- ============================================================
--  Migration 0405: checklist ของสเปคสินค้า — ราคาทุน + รูปประจำแถว (ใช้ในระบบเท่านั้น)
--  มติเจ้าของ 08/10/2569
--
--  หน้าสเปคสินค้า (/database/products/[id]/spec) ได้สองช่องใหม่ต่อแถว checklist
--  "วัตถุดิบ/บรรจุภัณฑ์": **ราคาทุน** กับ **รูปหนึ่งรูป** — ฝ่ายขายใช้คิดต้นทุนและชี้ของจริง
--  ตอนเตรียมงาน
--
--  ⭐ **ภายในจอเท่านั้น** — สองคอลัมน์นี้ไม่เข้าภาพนิ่งของเอกสาร ไม่เข้า frozenHtml ไม่ลงกระดาษ
--     FM-SA-04 และไม่ขึ้นจอเอกสาร (ลิสต์ช่องของภาพนิ่ง `ITEM_SNAPSHOT_FIELDS` ไม่มีสองช่องนี้
--     และต้องไม่มี — กระดาษใบนั้นลูกค้าเซ็น)
--
--  ⭐ RPC `replace_product_spec_items` ถูกแทนในที่ (ลายเซ็นเดิม) พร้อม **ยกค่าเดิมข้ามการทับ**:
--     แถวที่ผู้เรียก **ไม่ได้ส่งคีย์** `costPrice` / `imageAttachmentId` มา ได้ค่าของแถวเดิม
--     — จับคู่สามขั้น: ① id เดิม → ② itemKey ที่ไม่ว่าง (แถวของแบบฟอร์ม) → ③ แถวที่เพิ่มเอง (itemKey ว่างทั้งคู่)
--     ที่ **ชื่อรายการ (itemLabel) ตรงกันเป๊ะ** · ส่งคีย์มาเป็น null = ล้างจริง
--     ⚠️ ขั้น ③ ต้องมี: ผู้เรียกที่ไม่รู้จักสองคีย์ใหม่ก็ **ไม่ส่ง id** มาด้วย (โค้ดรุ่นก่อนออก id ใหม่ทุกแถวทุกครั้ง)
--        ⇒ แถวที่เพิ่มเองไม่มีทั้ง id ทั้ง itemKey ให้จับ — ไม่มีขั้นนี้ = ราคาทุน/รูปของแถวที่เพิ่มเองหายทุกครั้งที่กดบันทึก
--     ⚠️ ที่ยังหลุดได้ (ยอมรับ): ผู้เรียกแบบนั้น **แก้ชื่อ** แถวที่เพิ่มเอง = ไม่เหลืออะไรให้จับ ⇒ แถวนั้นได้ NULL ทั้งคู่
--        (ไฟล์รูปยังอยู่ — store ไม่เก็บกวาดให้คำขอที่ไม่ส่งคีย์รูป)
--     🐞 ทำไมต้องมี: RPC นี้ลบทั้งชุดแล้วเขียนใหม่ ⇒ ผู้เรียกที่ไม่รู้จักสองคีย์นี้ (โค้ดรุ่นก่อน ·
--        แท็บที่เปิดค้างข้าม deploy · worktree ที่ชี้ฐานเดียวกัน) จะล้างราคาทุนกับรูปของทุกแถว
--        ทุกครั้งที่กดบันทึก แล้วตอบว่าบันทึกสำเร็จ
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้)
--  ⚠ **รันก่อน merge / ก่อน deploy โค้ด** — ไฟล์นี้เข้ากันได้กับโค้ดที่ deploy อยู่ (โค้ดเก่าส่ง 8 คีย์
--     ⇒ สองคอลัมน์ใหม่ได้ค่าเดิม/NULL) แต่กลับกันไม่ได้: โค้ดใหม่บน RPC เก่า = สองคีย์ถูกทิ้งเงียบ
--     (store ตรวจแล้วตอบ 503 "ต้องรัน migration 0405 ก่อน" — จอใช้ช่องใหม่ไม่ได้จนกว่าจะรัน)
--  ⚠ รันซ้ำได้ (IF NOT EXISTS · DROP CONSTRAINT IF EXISTS + ADD · CREATE OR REPLACE)
--  ⭐ ไม่มี backfill — สองคอลัมน์ใหม่เริ่มว่างทุกแถว
-- ============================================================

BEGIN;

-- ── ① คอลัมน์ ───────────────────────────────────────────────────────────────
ALTER TABLE public.product_spec_items
  ADD COLUMN IF NOT EXISTS "costPrice" numeric,
  ADD COLUMN IF NOT EXISTS "imageAttachmentId" uuid;

-- เพดานเท่า `SPEC_ITEM_COST_MAX` ของ lib/sales/productSpecWorkflow.js (เทสต์เทียบตัวเลขให้)
-- ว่าง (NULL) กับ 0 เป็นคนละค่า — NULL = ยังไม่กรอก
ALTER TABLE public.product_spec_items DROP CONSTRAINT IF EXISTS product_spec_items_cost_check;
ALTER TABLE public.product_spec_items
  ADD CONSTRAINT product_spec_items_cost_check
  CHECK ("costPrice" IS NULL OR ("costPrice" >= 0 AND "costPrice" <= 999999999.99));

-- รูปของแถว = แถวใน attachments (entityType 'product' · docType 'spec_item_image')
-- ⚠️ ตั้งชื่อ constraint เอง + DROP/ADD — ประกาศ REFERENCES ในบรรทัด ADD COLUMN IF NOT EXISTS
--    จะไม่ซ่อมคอลัมน์ที่มีอยู่แล้วแต่ไม่มี FK และได้ชื่อที่ store ต้องเดา
-- ⚠️ SET NULL — ไฟล์แนบถูกลบ (ลบสินค้า/เก็บกวาด) แถว checklist ต้องอยู่ต่อ แค่ไม่มีรูป
ALTER TABLE public.product_spec_items DROP CONSTRAINT IF EXISTS product_spec_items_image_fk;
ALTER TABLE public.product_spec_items
  ADD CONSTRAINT product_spec_items_image_fk
  FOREIGN KEY ("imageAttachmentId") REFERENCES public.attachments(id) ON DELETE SET NULL;

-- FK ขา SET NULL ต้องหาแถวที่ชี้ไฟล์ที่ถูกลบ · ด่าน "รูปนี้ผูกกับแถวอยู่" ของ DELETE ไฟล์แนบก็ถามทางนี้
CREATE INDEX IF NOT EXISTS product_spec_items_image_idx
  ON public.product_spec_items ("imageAttachmentId") WHERE "imageAttachmentId" IS NOT NULL;

COMMENT ON COLUMN public.product_spec_items."costPrice" IS
  'ราคาทุนของรายการ (บาท) — ใช้ในระบบเท่านั้น ไม่ลงภาพนิ่ง/กระดาษ FM-SA-04 · NULL = ยังไม่กรอก (0405)';
COMMENT ON COLUMN public.product_spec_items."imageAttachmentId" IS
  'รูปประจำแถว → attachments (entityType product · docType spec_item_image) — ใช้ในระบบเท่านั้น ไม่ลงภาพนิ่ง/กระดาษ (0405)';

-- ── ② checklist ทับทั้งชุด — ลำดับเดิม (ล็อก → ลบ → เขียน) + ยกราคาทุน/รูปของแถวเดิมข้ามการทับ ──
--
-- ⚠️ ลายเซ็น · ชื่อพารามิเตอร์ · ชนิดที่คืน ต้องเท่า 0370 ⑨ข — CREATE OR REPLACE จึงคงเจ้าของกับสิทธิ์เดิม
-- ⚠️ "ผู้เรียกส่งคีย์มาไหม" ถามจาก **ก้อน jsonb ของแถว** (`elem ? 'costPrice'`) ไม่ใช่จากค่าที่แกะแล้ว —
--    แกะแล้วคีย์ที่ไม่ส่งกับคีย์ที่ส่ง null เป็น NULL เหมือนกัน แยกไม่ออกว่า "ไม่แตะ" หรือ "ล้าง"
-- ⚠️ ต้องเก็บแถวเดิมไว้ **ก่อน** DELETE — ลบแล้วไม่มีอะไรให้ยก
-- ⚠️ จับคู่แถวเดิมสามขั้น (ดูหัวไฟล์): id → itemKey ที่ไม่ว่าง → itemLabel ของแถวที่ itemKey ว่างทั้งคู่ ·
--    ตัวเรียง = ลำดับความสำคัญ id > itemKey > itemLabel (ขั้น ② กับ ③ ไม่ทับกันอยู่แล้ว — แถวที่มี itemKey ไม่เข้าขั้น ③ —
--    บรรทัด itemKey ในตัวเรียงจึงเป็นตัวกันพลาดถ้าวันหน้ามีขั้นเพิ่ม) · ตัวเรียงท้าย (sortOrder, id) ให้ผลนิ่งเมื่อ
--    แถวเดิมที่เพิ่มเองชื่อซ้ำกันหลายแถว (ได้แถวบนสุด) — ไม่มี = Postgres เลือกแถวไหนก็ได้
--    ⚠️ แถวใหม่สองแถวชื่อซ้ำกันที่ไม่มี id ทั้งคู่ = ได้ค่าของแถวเดิมแถวเดียวกันทั้งสองแถว (รูปเดียวสองแถวชี้ — ไม่ผิด FK
--    ไม่ล้ม) · store รุ่นนี้จับ id ให้ก่อนถึงที่นี่แบบ "แถวเดิมหนึ่งแถวใช้ได้ครั้งเดียว" (`prepareSpecItemRows`)
-- ⚠️ คีย์ของแต่ละแถวต้องตรงกับคอลัมน์ใน jsonb_to_record ข้างล่าง — คีย์ที่ไม่ได้ประกาศถูกทิ้งเงียบ
--    (productSpecItemCostImageMigration.test.mjs เทียบกับที่ store ส่งให้)
CREATE OR REPLACE FUNCTION public.replace_product_spec_items(
  p_spec_id text,
  p_rows    jsonb     -- [{id, sortOrder, itemKey, itemLabel, detail, preparedByS, preparedByCustomer, note, costPrice?, imageAttachmentId?}]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_old   jsonb;
BEGIN
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'product_spec_items_rows_invalid';
  END IF;

  PERFORM 1 FROM public.product_specs WHERE id = p_spec_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'product_spec_not_found: %', p_spec_id; END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'id', i.id, 'itemKey', i."itemKey", 'itemLabel', i."itemLabel", 'sortOrder', i."sortOrder",
           'costPrice', i."costPrice", 'imageAttachmentId', i."imageAttachmentId")), '[]'::jsonb)
    INTO v_old
    FROM public.product_spec_items i
   WHERE i."specId" = p_spec_id;

  DELETE FROM public.product_spec_items WHERE "specId" = p_spec_id;

  INSERT INTO public.product_spec_items (
    id, "specId", "sortOrder", "itemKey", "itemLabel", detail,
    "preparedByS", "preparedByCustomer", note, "costPrice", "imageAttachmentId"
  )
  SELECT r.id, p_spec_id, COALESCE(r."sortOrder", 0), r."itemKey", r."itemLabel", r.detail,
         COALESCE(r."preparedByS", false), COALESCE(r."preparedByCustomer", false), r.note,
         CASE WHEN e.elem ? 'costPrice' THEN r."costPrice" ELSE o."costPrice" END,
         CASE WHEN e.elem ? 'imageAttachmentId' THEN r."imageAttachmentId" ELSE o."imageAttachmentId" END
    FROM jsonb_array_elements(p_rows) AS e(elem)
   CROSS JOIN LATERAL jsonb_to_record(e.elem) AS r(
      id                   text,
      "sortOrder"          integer,
      "itemKey"            text,
      "itemLabel"          text,
      detail               text,
      "preparedByS"        boolean,
      "preparedByCustomer" boolean,
      note                 text,
      "costPrice"          numeric,
      "imageAttachmentId"  uuid
    )
    LEFT JOIN LATERAL (
      SELECT s."costPrice", s."imageAttachmentId"
        FROM jsonb_to_recordset(v_old) AS s(
               id text, "itemKey" text, "itemLabel" text, "sortOrder" integer,
               "costPrice" numeric, "imageAttachmentId" uuid)
       WHERE s.id = r.id
          OR (r."itemKey" IS NOT NULL AND s."itemKey" = r."itemKey")
          OR (r."itemKey" IS NULL AND s."itemKey" IS NULL AND s."itemLabel" = r."itemLabel")
       ORDER BY (s.id IS NOT DISTINCT FROM r.id) DESC,
                (s."itemKey" IS NOT DISTINCT FROM r."itemKey") DESC,
                s."sortOrder", s.id
       LIMIT 1
    ) o ON true;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_product_spec_items(text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_product_spec_items(text, jsonb)
  TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'product_spec_items'
--    AND column_name IN ('costPrice', 'imageAttachmentId');                 -- numeric · uuid (2 แถว)
-- SELECT conname FROM pg_constraint
--  WHERE conrelid = 'public.product_spec_items'::regclass
--    AND conname IN ('product_spec_items_cost_check', 'product_spec_items_image_fk');   -- 2 แถว
-- SELECT position('"imageAttachmentId"' in pg_get_functiondef('public.replace_product_spec_items(text, jsonb)'::regprocedure)) > 0;  -- true
-- SELECT has_function_privilege('anon', 'public.replace_product_spec_items(text, jsonb)', 'EXECUTE');  -- false
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- ⚠️ ถอยโค้ดก่อนเสมอ (โค้ดใหม่บน RPC เก่าตอบ 503 ทุกครั้งที่บันทึกราคาทุน/รูป)
-- ⚠️ ห้ามถอด RPC ตัวนี้ทิ้ง — โค้ดทุกรุ่นตั้งแต่ 0370 เรียกมันทุกครั้งที่บันทึก checklist
--    ⇒ ขั้นแรกคือ **วางตัวฟังก์ชัน 8 คอลัมน์ของ 0370 หัวข้อ ⑨ข ทับกลับ** (CREATE OR REPLACE ทั้งบล็อก
--      พร้อม REVOKE/GRANT ของมัน) แล้วค่อยรันข้างล่าง
-- ⚠️ ราคาทุนที่กรอกไว้กับตัวชี้รูปของทุกแถว **หายถาวร** เมื่อถอดคอลัมน์ (ไฟล์รูปใน attachments ยังอยู่
--    แต่ไม่มีแถวไหนชี้แล้ว) — สำรองก่อน: SELECT id, "specId", "costPrice", "imageAttachmentId"
--    FROM public.product_spec_items WHERE "costPrice" IS NOT NULL OR "imageAttachmentId" IS NOT NULL;
-- DROP INDEX IF EXISTS public.product_spec_items_image_idx;
-- ALTER TABLE public.product_spec_items DROP CONSTRAINT IF EXISTS product_spec_items_image_fk;
-- ALTER TABLE public.product_spec_items DROP CONSTRAINT IF EXISTS product_spec_items_cost_check;
-- ALTER TABLE public.product_spec_items DROP COLUMN IF EXISTS "imageAttachmentId";
-- ALTER TABLE public.product_spec_items DROP COLUMN IF EXISTS "costPrice";
-- NOTIFY pgrst, 'reload schema';
