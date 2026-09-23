-- ============================================================
--  Migration 0375: ลบร่าง FM-SA-04 ที่ **ยังไม่เคยยื่น** ได้ (เหมือนร่างใบเสนอราคา)
--
--  ⭐ **มติเจ้าของ 23/09/2569**: เอกสาร FM-SA-04 ที่บันทึกไว้แล้วแต่ยังไม่เคยยื่นให้ใครดู
--     **ลบทิ้งได้** เหมือนร่างใบเสนอราคา · ลบได้เฉพาะใบที่ `status = 'active'` · มี Rev เดียว
--     คือ Rev.00 สถานะ `draft` ที่ **ไม่เคยเข้าสู่ `pending_ae` แม้ครั้งเดียว** และ
--     `currentRevNo IS NULL` · ผู้ลบ = ชุดเดียวกับผู้ออกเอกสาร (AC + admin)
--  ⭐ **เลขที่ไม่นำกลับมาใช้** — ลบแล้วเลขที่นั้นหายไปจากตัวนับ FMSA04 เป็นรูโหว่ถาวร
--     เหมือนใบเสนอราคาที่ถูกลบ (`next_quote_number` ไม่เคยถอย) · **ห้ามแตะตัวนับในไฟล์นี้**
--     ออกใบใหม่บนบรรทัด SO เดิมได้ทันทีหลังลบ และใบใหม่ได้ **เลขใหม่**
--
--  ── ทำไมต้องมี migration ─────────────────────────────────────────────────
--  1) 0370 ข้อ ⑧ ห้าม DELETE ทั้งสองตารางแบบไม่มีข้อยกเว้น (`..._delete_forbidden`)
--     ⇒ วันนี้ทางออกเดียวของร่างที่ออกผิดคือ "ยกเลิกเอกสาร" (void) ซึ่งเผาเลขที่ทิ้ง
--       **และ** ทิ้งแถวใบยกเลิกไว้ในประวัติของบรรทัด SO ทั้งที่ยังไม่มีใครเคยเห็นใบนั้น
--  2) 🪤 **"ดึงกลับ" ล้างตราประทับการยื่นจนหมด** (`revisionPatch('withdraw')` เขียน
--     `submittedAt/By/ByName = NULL` + `snapshot = NULL` — lib/sales/productSpecDocWorkflow.js)
--     ⇒ ร่างที่เคยยื่นแล้วดึงกลับ **หน้าตาเหมือนร่างที่ไม่เคยยื่น ทุกช่อง**
--     ⇒ ไม่มีทางแยกสองอย่างนี้ได้ถ้าไม่เพิ่มรอยที่ลบไม่ได้ ⇒ คอลัมน์ `firstSubmittedAt` (ข้อ ①)
--     · มติ: ร่างที่เคยยื่น (ดึงกลับแล้ว) และร่างที่ถูกตีกลับ **ลบไม่ได้** เพราะ AE เห็นใบนั้น
--       และได้รับแจ้งเตือนไปแล้ว — ทางออกของสองกรณีนี้ยังเป็น "ยกเลิกเอกสาร" เหมือนเดิม
--
--  ── ทำไมเป็น RPC ไม่ใช่ปล่อยให้แอป DELETE ตรง ๆ ──────────────────────────
--  ยามของ 0370 อยู่บน trigger ⇒ การผ่อนต้องมี "ประตู" ที่ตั้งได้จากที่เดียว · เลือกแบบเดียวกับ
--  0147/0152 (break-glass ผ่าน session flag ที่ตั้งได้จาก RPC `SECURITY DEFINER` เท่านั้น)
--  แต่ **แคบกว่า**: flag เก็บ *id ของเอกสารใบนั้น* ไม่ใช่ `'1'` ⇒ เปิดประตูให้ใบเดียวต่อหนึ่ง
--  ทรานแซกชัน · และยามยัง**ตรวจกติกาซ้ำเองทุกข้อ** ไม่ได้เชื่อ flag อย่างเดียว
--  · **แข่งกับการกดยื่น**: RPC ล็อกแถว Rev (`FOR UPDATE`) ก่อน แล้วค่อยล็อกแถวเอกสาร —
--    เรียงลำดับเดียวกับทางยื่น (แอป UPDATE แถว Rev → trigger ล็อกเอกสาร `FOR SHARE`) ⇒ ไม่มีวง
--    deadlock · ใครยื่นสำเร็จก่อน ฝั่งลบอ่านค่าใหม่หลังได้ล็อก (READ COMMITTED) แล้วชนด่าน
--  🔴 **ขอบเขตจริงของประตูคือตัว flag ไม่ใช่ตัว RPC** — พูดให้ตรง เพราะคนตรวจรอบหน้าจะเชื่อบรรทัดนี้:
--    · **ทางของแอปมีประตูเดียวจริง** — แอปคุยกับฐานผ่าน PostgREST ซึ่งตั้ง GUC ชื่อนี้เองไม่ได้
--      ⇒ ถือ service key แล้วยิง `DELETE` ตรงจาก PostgREST ก็ยังชนยาม (ไม่มี flag)
--    · **แต่คนที่ต่อ SQL ตรง (SQL Editor / เจ้าของฐาน) ตั้ง flag เองแล้วลบเองได้** —
--      GUC ชื่อมีจุดเป็น USERSET ⇒ `SET LOCAL` ได้ทุก role · ยามยัง**คุมว่าอะไรหายได้**
--      ครบทุกข้อตามมติ (ใบที่ยื่นแล้ว/อนุมัติแล้ว/มีหลาย Rev ลบไม่ได้อยู่ดี · Rev เดี่ยว ๆ
--      ก็ยังไม่หาย) แต่**ไม่คุมว่าใครเขียน audit** ⇒ ลบทางนั้น = **ไม่มีแถว audit_logs เลย**
--      และระบบไม่มีถังขยะ ⇒ กู้ไม่ได้ · ทางที่ถูกทางเดียวคือเส้น API ข้างล่าง
--    · รับไว้แบบเดียวกับ break-glass ตัวอื่นของรีโป (0147/0152) — SQL Editor รันในฐานะ
--      เจ้าของฐาน ซึ่ง `ALTER TABLE … DISABLE TRIGGER` ได้อยู่แล้วก่อนไฟล์นี้ ⇒ ไฟล์นี้ลด
--      ขั้นตอนของคนที่ทำได้อยู่แล้ว ไม่ได้เปิดอำนาจให้ role ใหม่
--
--  ── รหัส error ที่ฝั่ง API ต้องแปล ───────────────────────────────────────
--  · `product_spec_document_not_found`               ⇒ 404
--  · `product_spec_document_draft_delete_forbidden`  ⇒ **409** (เหตุผลไทยต่อท้าย `—`)
--    ครอบทุกเหตุที่ลบไม่ได้: ยกเลิกแล้ว · อนุมัติแล้ว · มีหลาย Rev · Rev ไม่ใช่ร่าง ·
--    **เคยยื่นแล้ว** ⇒ เราต์จับ prefix เดียวพอ ไม่ต้องไล่รหัสรายเหตุ
--
--  ── บันทึกการลบ ──────────────────────────────────────────────────────────
--  ระบบไม่มีถังขยะ · `audit_logs.before` คือทางกู้ทางเดียว ⇒ ฝั่ง API ต้องเขียน audit ที่มี
--  **ทั้งแถวเอกสารและแถว Rev เต็ม ๆ** ก่อนเรียก RPC (เขียนหลังลบ = มีจังหวะที่แถวหายโดยยังไม่มี
--  สำเนา · `recordAudit` กลืน error เอง เราต์จึงไม่มีทางรู้ว่าต้องหยุด)
--  ⚠️ **สิ่งที่ RPC คืนกลับไม่ใช่ตัว `before`** — `before` คือแถวที่เราต์อ่านมาก่อนลบ (ต้องมีก่อน
--    เสมอ) · ก้อนที่ RPC คืน (`docNo` + แถวทั้งคู่) มีไว้ให้ store **พิสูจน์ว่าลบไปจริงทั้งสองแถว**
--    ก่อนตอบว่าสำเร็จ (ไม่คืนแถว = ผิดสัญญา ⇒ ห้ามบอกว่าลบแล้ว) และให้ `docNo` ตัวจริงไปขึ้น toast
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน deploy** — โค้ดชุดใหม่อ่าน `firstSubmittedAt`
--    และเรียก RPC ตัวนี้ · รันซ้ำได้ (CREATE OR REPLACE · DO block ของข้อ ① สร้าง+backfill เฉพาะ
--    ตอนที่ยังไม่มีคอลัมน์ ⇒ รอบสองไม่แตะข้อมูล · ทั้งไฟล์อยู่ในทรานแซกชันเดียว ล้มกลางทาง =
--    ไม่มีอะไรเปลี่ยน)
--  ⚠ สภาพฐานจริงตอนเขียน (ตรวจ 23/09/2569): `product_spec_documents` 0 แถว ·
--    `product_spec_document_revisions` 0 แถว · ตัวนับ FMSA04 ยังไม่มีแถว ⇒ backfill ไม่แตะอะไร
--
--  ── Rollback ─────────────────────────────────────────────────────────────
--  ⚠️ ย้อนแล้ว **ร่างที่ลบไปแล้วไม่กลับมา** และเลขที่ที่หายไปก็ไม่กลับมา (ตั้งใจ)
--  -- DROP FUNCTION IF EXISTS public.delete_product_spec_document_draft(text);
--  -- DROP TRIGGER IF EXISTS product_spec_document_revisions_orphan_check ON public.product_spec_document_revisions;
--  -- DROP FUNCTION IF EXISTS public.check_product_spec_document_revision_orphan_delete();
--  -- DROP TRIGGER IF EXISTS product_spec_document_revisions_submit_mark ON public.product_spec_document_revisions;
--  -- DROP FUNCTION IF EXISTS public.stamp_product_spec_document_revision_submitted();
--  -- ALTER TABLE public.product_spec_document_revisions DROP COLUMN IF EXISTS "firstSubmittedAt";
--  -- แล้วรันข้อ ⑧ ของ 0370 ซ้ำ เพื่อเอายามฉบับ "ห้ามลบทุกกรณี" กลับมา
-- ============================================================

BEGIN;

-- ── ①+② รอยที่ลบไม่ได้: "เคยเข้าสู่ pending_ae อย่างน้อยหนึ่งครั้ง" + backfill ────
--
-- ⚠️ เก็บเป็น timestamptz ไม่ใช่ boolean — ตอบได้ด้วยว่า *เมื่อไร* ซึ่งเป็นสิ่งที่คนถามต่อ
--    ทันทีที่เห็นว่า "ลบไม่ได้เพราะเคยยื่น" · ค่าว่าง = ไม่เคยยื่นเลย (ลบได้ถ้าครบเงื่อนไขอื่น)
--
-- 🔴 **backfill ต้องผูกกับ "เพิ่งสร้างคอลัมน์" ไม่ใช่กับ `WHERE firstSubmittedAt IS NULL`**
--    🪤 เคยเขียนเป็นสองคำสั่งแยก (ADD COLUMN IF NOT EXISTS แล้ว UPDATE … WHERE IS NULL)
--       ⇒ **รันไฟล์นี้ซ้ำหลังเปิดใช้จริง = ประทับรอยยื่นให้ร่างที่ยังไม่เคยยื่นทุกใบ**
--       เพราะหลังรันรอบแรก แถวที่ยังว่างคือ "ร่างที่ลบได้" พอดี ⇒ ลบไม่ได้ทั้งกอง
--       และซ่อมกลับไม่ได้จากฝั่งแอป/PostgREST เลย (ยามข้อ ③ ห้ามล้างรอยนี้ทุกกรณี
--       ต้อง DISABLE TRIGGER ซึ่ง service_role ทำไม่ได้ ต้องเจ้าของฐานลงมือ)
--    ⇒ ทั้งคู่อยู่ใน DO block เดียว: ไม่มีคอลัมน์ = สร้าง + backfill · มีแล้ว = ไม่แตะอะไรเลย
--
-- 🪤 **ร่างที่เคยยื่นแล้วดึงกลับ "ก่อน" migration นี้ แยกไม่ออกจากร่างที่ไม่เคยยื่น** —
--    ตราประทับถูกล้างไปหมดแล้ว ไม่มีรอยอะไรเหลือ ⇒ เลือกข้างที่ปลอดภัย: **แถวเก่าทุกแถว
--    ถือว่าเคยยื่น** (ประทับด้วยเวลาที่ดีที่สุดที่หาได้ ถอยไป createdAt) ⇒ ลบไม่ได้
--    · ผิดพลาดทางนี้ = ร่างเก่าที่ลบได้จริงกลายเป็นลบไม่ได้ (ยังยกเลิกเอกสารได้ตามเดิม)
--    · ผิดพลาดอีกทาง = ลบใบที่ AE เคยเห็นทิ้งเงียบ ๆ ซึ่งกู้ไม่ได้ ⇒ รับไม่ได้
-- ⚠️ ฐานจริงมี 0 แถวตอนเขียน (ตรวจ 23/09) — backfill เขียนไว้เพื่อ **ฐานอื่นที่รันไฟล์นี้
--    ทีหลัง** (สำเนา staging · ฐานที่กู้จาก backup) ไม่ใช่เพราะคาดว่าจะเจอแถว
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'product_spec_document_revisions'
       AND column_name = 'firstSubmittedAt'
  ) THEN
    ALTER TABLE public.product_spec_document_revisions
      ADD COLUMN "firstSubmittedAt" timestamptz;

    UPDATE public.product_spec_document_revisions
       SET "firstSubmittedAt" = COALESCE(
             "submittedAt", "aeApprovedAt", "supApprovedAt", "rejectedAt", "createdAt", now()
           );
  END IF;
END $$;

COMMENT ON COLUMN public.product_spec_document_revisions."firstSubmittedAt" IS
  'ครั้งแรกที่ Rev นี้เข้าสู่ pending_ae — ประทับโดย trigger · **ล้างไม่ได้ แก้ไม่ได้** (0375) · ดึงกลับ/ตีกลับล้าง submittedAt แต่ห้ามล้างช่องนี้ · NULL = ไม่เคยยื่น ⇒ เข้าเงื่อนไข "ลบร่างได้"';

-- ── ③ trigger ประทับรอย + กันการล้าง ────────────────────────────────────────
--
-- ⚠️ แยกเป็น trigger ของตัวเอง ไม่ยัดรวมกับยามของ 0370 — คนละหน้าที่ (ยาม = ปฏิเสธ ·
--    ตัวนี้ = เขียนค่า) และ 0370 ไม่มี BEFORE INSERT ให้เกาะ
-- ⚠️ ชื่อ trigger ขึ้นต้นด้วย `product_spec_document_revisions_` เหมือนกัน แล้วลงท้าย
--    `_submit_mark` ⇒ เรียงหลัง `_guard` ตามตัวอักษร = ยามตรวจก่อน ค่อยประทับ (ถูกลำดับแล้ว)
-- ⚠️ ครอบทุกสถานะที่ "ยื่นไปแล้วแน่ ๆ" ไม่ใช่แค่ pending_ae — แถวที่ถูกเขียนตรง ๆ ด้วย
--    สคริปต์ซ่อมข้อมูลให้เป็น approved/rejected ต้องได้รอยนี้ด้วย ไม่งั้นเปิดรูให้ลบ
CREATE OR REPLACE FUNCTION public.stamp_product_spec_document_revision_submitted()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."firstSubmittedAt" IS NOT NULL
     AND NEW."firstSubmittedAt" IS DISTINCT FROM OLD."firstSubmittedAt" THEN
    RAISE EXCEPTION 'product_spec_document_revision_submit_mark_immutable: % — รอยการยื่นลบไม่ได้', OLD.id;
  END IF;

  IF NEW.status IN ('pending_ae', 'pending_ae_supervisor', 'approved', 'superseded', 'rejected')
     AND NEW."firstSubmittedAt" IS NULL THEN
    NEW."firstSubmittedAt" := COALESCE(NEW."submittedAt", now());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS product_spec_document_revisions_submit_mark
  ON public.product_spec_document_revisions;
CREATE TRIGGER product_spec_document_revisions_submit_mark
BEFORE INSERT OR UPDATE ON public.product_spec_document_revisions
FOR EACH ROW EXECUTE FUNCTION public.stamp_product_spec_document_revision_submitted();

-- ── ④ ยามของ 0370: เปิดประตูแคบ ๆ ให้ร่างที่ไม่เคยยื่น ───────────────────────
--
-- ⚠️ **ทุกข้อของ 0370 ยังอยู่ครบ** (docNo/specId/productId/createdAt แก้ไม่ได้ · void เป็น
--    ปลายทาง · currentRevNo ถอยไม่ได้ · กระดาษที่ตรึงเขียนทับไม่ได้ · เดินหน้าได้เฉพาะเอกสาร
--    active + SO approved · approved/superseded ตรึงเนื้อ) — ไฟล์นี้แก้เฉพาะสาขา DELETE
-- ⚠️ ประตูเปิดเมื่อครบสามอย่างเท่านั้น: flag ตรงกับ id ของเอกสารใบนี้ · กติกาผ่านทุกข้อ
--    (ตรวจใหม่ที่นี่ ไม่เชื่อ RPC) · และ **ไม่เหลือ Rev สักแถว** (RPC ลบ Rev ก่อนเสมอ)
CREATE OR REPLACE FUNCTION public.guard_product_spec_document()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    /* 0375 · ลบได้ทางเดียว: ผ่าน delete_product_spec_document_draft() ซึ่งประทับ flag
       เป็น id ของใบนี้ · ใบต้องยัง active · ไม่เคยอนุมัติ · และ Rev.00 ที่ไม่เคยยื่นถูกลบ
       ไปแล้วในทรานแซกชันเดียวกัน (จึงต้องไม่เหลือ Rev เลย) */
    IF current_setting('app.spec_doc_draft_delete', true) = OLD.id
       AND OLD.status = 'active'
       AND OLD."currentRevNo" IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.product_spec_document_revisions r WHERE r."documentId" = OLD.id
       ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'product_spec_document_delete_forbidden: % (%) — ใช้ void แทนการลบ', OLD.id, OLD."docNo";
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."docNo" IS DISTINCT FROM OLD."docNo"
     OR NEW."specId" IS DISTINCT FROM OLD."specId"
     OR NEW."productId" IS DISTINCT FROM OLD."productId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'product_spec_document_immutable: %', OLD.id;
  END IF;
  -- void คือปลายทาง — เลขที่ที่ยกเลิกแล้วไม่ฟื้น
  IF OLD.status = 'void' AND NEW.status IS DISTINCT FROM 'void' THEN
    RAISE EXCEPTION 'product_spec_document_void_final: %', OLD.id;
  END IF;
  IF OLD."currentRevNo" IS NOT NULL
     AND (NEW."currentRevNo" IS NULL OR NEW."currentRevNo" < OLD."currentRevNo") THEN
    RAISE EXCEPTION 'product_spec_document_rev_backwards: % (% → %)', OLD.id, OLD."currentRevNo", NEW."currentRevNo";
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_product_spec_document_revision()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_doc_status   text;
  v_order_id     text;
  v_order_status text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    /* 🔴 0375 · **ห้ามเป็นรูให้ลบ Rev เดี่ยว ๆ** — Rev หายได้เฉพาะตอนที่เอกสารแม่ของมัน
       กำลังถูกลบตามกติกา "ร่างที่ไม่เคยยื่น" ในทรานแซกชันเดียวกัน ⇒ ตรวจครบทั้ง
       ตัวมันเอง (Rev.00 · draft · ไม่มีรอยยื่น/อนุมัติ/ตีกลับ · เป็น Rev เดียวของใบ)
       และเอกสารแม่ (active · ไม่เคยอนุมัติ) · flag ต้องเป็น id ของเอกสารแม่พอดี */
    IF current_setting('app.spec_doc_draft_delete', true) = OLD."documentId"
       AND OLD."revNo" = 0
       AND OLD.status = 'draft'
       AND OLD."firstSubmittedAt" IS NULL
       AND OLD."submittedAt"  IS NULL
       AND OLD."aeApprovedAt" IS NULL
       AND OLD."supApprovedAt" IS NULL
       AND OLD."rejectedAt"   IS NULL
       AND OLD."frozenHtml"   IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.product_spec_document_revisions r
          WHERE r."documentId" = OLD."documentId" AND r.id <> OLD.id
       )
       AND EXISTS (
         SELECT 1 FROM public.product_spec_documents d
          WHERE d.id = OLD."documentId" AND d.status = 'active' AND d."currentRevNo" IS NULL
       ) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'product_spec_document_revision_delete_forbidden: %', OLD.id;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."documentId" IS DISTINCT FROM OLD."documentId"
     OR NEW."revNo" IS DISTINCT FROM OLD."revNo"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'product_spec_document_revision_immutable: %', OLD.id;
  END IF;

  /* 🔴 เดินหน้า (ยื่น · AE อนุมัติ · AE Sup อนุมัติ) ได้เฉพาะเอกสารที่ยัง active และ SO ที่ยังอนุมัติอยู่
     ด่านฝั่งแอปตรวจตอนโหลด แต่ UPDATE ของ Rev กรองได้แค่สถานะของ Rev เอง ⇒ เอกสารถูก void
     (ปุ่มยกเลิก · SO ถูกยกเลิก) หรือ SO ถูกย้อนการอนุมัติ **ระหว่างที่คำขออนุมัติกำลังวิ่ง**
     = ได้ Rev ที่อนุมัติแล้ว ตรึงกระดาษแล้ว แจ้งเตือนแล้ว บนเลขที่ที่ยกเลิกไปแล้ว
     ⇒ ล็อกแถวเอกสารกับ SO แบบ FOR SHARE แล้วตรวจที่นี่ ในทรานแซกชันเดียวกับการเปลี่ยนสถานะ
       (void/ย้อนอนุมัติที่กำลังเขียนอยู่ต้องรอกัน แล้วฝั่งที่มาทีหลังเห็นค่าล่าสุดเสมอ)
     ⚠️ เฉพาะทางเดินหน้า — ถอยเป็นร่าง (ดึงกลับ · SO ออก Rev) กับตีกลับต้องทำได้เสมอ
        ตีกลับคือส่งคืน ไม่ใช่รับรอง (SO ที่ถูกย้อนการอนุมัติยิ่งต้องตีกลับได้) */
  IF NEW.status IN ('pending_ae', 'pending_ae_supervisor', 'approved')
     AND NEW.status IS DISTINCT FROM OLD.status THEN
    SELECT d.status, d."salesOrderId" INTO v_doc_status, v_order_id
      FROM public.product_spec_documents d
     WHERE d.id = NEW."documentId"
       FOR SHARE;
    IF v_doc_status IS DISTINCT FROM 'active' THEN
      RAISE EXCEPTION 'product_spec_document_not_active: % (%)', NEW."documentId", v_doc_status;
    END IF;
    SELECT o.status INTO v_order_status
      FROM public.sales_orders o
     WHERE o.id = v_order_id
       FOR SHARE;
    IF v_order_status IS DISTINCT FROM 'approved' THEN
      RAISE EXCEPTION 'sales_order_not_approved: % (%)', v_order_id, v_order_status;
    END IF;
  END IF;

  -- กระดาษที่ตรึงแล้วเขียนทับไม่ได้ (NULL → ค่า ได้ครั้งเดียว)
  IF OLD."frozenHtml" IS NOT NULL
     AND (NEW."frozenHtml", NEW."frozenAt", NEW."rendererVersion")
         IS DISTINCT FROM (OLD."frozenHtml", OLD."frozenAt", OLD."rendererVersion") THEN
    RAISE EXCEPTION 'product_spec_document_revision_frozen_html_write_once: %', OLD.id;
  END IF;

  -- เข้า superseded ได้ทางเดียวคือจาก approved
  IF NEW.status = 'superseded' AND OLD.status NOT IN ('approved', 'superseded') THEN
    RAISE EXCEPTION 'product_spec_document_revision_supersede_invalid: % (%)', OLD.id, OLD.status;
  END IF;

  /* 🪤 **`rejected` ไม่อยู่ในลิสต์นี้โดยตั้งใจ** — Rev ที่ถูกตีกลับต้องแก้แล้วยื่นใหม่ได้
     ถ้าตรึงไว้ด้วย เอกสารที่หัวหน้าตีกลับจะกลายเป็นทางตัน */
  IF OLD.status IN ('approved', 'superseded') THEN
    IF NEW.status IS DISTINCT FROM OLD.status
       AND NOT (OLD.status = 'approved' AND NEW.status = 'superseded') THEN
      RAISE EXCEPTION 'product_spec_document_revision_closed: % (% → %)', OLD.id, OLD.status, NEW.status;
    END IF;
    IF (NEW.snapshot, NEW."illustrationIds", NEW.reason,
        NEW."submittedAt", NEW."submittedBy", NEW."submittedByName",
        NEW."aeApprovedAt", NEW."aeApprovedBy", NEW."aeApprovedByName",
        NEW."supApprovedAt", NEW."supApprovedBy", NEW."supApprovedByName",
        NEW."rejectedAt", NEW."rejectedBy", NEW."rejectedByName",
        NEW."rejectionReason", NEW."rejectedStage")
       IS DISTINCT FROM
       (OLD.snapshot, OLD."illustrationIds", OLD.reason,
        OLD."submittedAt", OLD."submittedBy", OLD."submittedByName",
        OLD."aeApprovedAt", OLD."aeApprovedBy", OLD."aeApprovedByName",
        OLD."supApprovedAt", OLD."supApprovedBy", OLD."supApprovedByName",
        OLD."rejectedAt", OLD."rejectedBy", OLD."rejectedByName",
        OLD."rejectionReason", OLD."rejectedStage") THEN
      RAISE EXCEPTION 'product_spec_document_revision_content_frozen: %', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- ⚠️ trigger เดิมของ 0370 ผูกกับฟังก์ชันชื่อเดิมอยู่แล้ว (CREATE OR REPLACE พอ) — สร้างใหม่
--    เพื่อให้ไฟล์นี้รันบนฐานที่ยังไม่เคยมี trigger ได้ด้วย (เช่นฐานทดลองที่รัน 0370 ไม่ครบ)
DROP TRIGGER IF EXISTS product_spec_documents_guard ON public.product_spec_documents;
CREATE TRIGGER product_spec_documents_guard
BEFORE UPDATE OR DELETE ON public.product_spec_documents
FOR EACH ROW EXECUTE FUNCTION public.guard_product_spec_document();

DROP TRIGGER IF EXISTS product_spec_document_revisions_guard ON public.product_spec_document_revisions;
CREATE TRIGGER product_spec_document_revisions_guard
BEFORE UPDATE OR DELETE ON public.product_spec_document_revisions
FOR EACH ROW EXECUTE FUNCTION public.guard_product_spec_document_revision();

-- ── ⑤ ปิดรูสุดท้าย: Rev หายเดี่ยว ๆ ไม่ได้ ตรวจตอน COMMIT ────────────────────
--
-- 🔴 ยามข้อ ④ ตรวจ "สภาพ" ของ Rev ได้ แต่ตรวจไม่ได้ว่า **เอกสารแม่จะถูกลบตามหรือเปล่า**
--    (ตอน trigger ทำงาน เอกสารยังอยู่เสมอ เพราะ FK เป็น RESTRICT ⇒ ต้องลบลูกก่อนแม่)
--    ⇒ ถ้าเชื่อแค่ flag ใครที่รัน SQL ได้เองก็ลบ Rev ทิ้งแล้วเหลือใบเปล่าที่ยื่นไม่ได้ตลอดกาล
-- ⇒ ใช้ constraint trigger แบบ DEFERRED: ตอนปิดทรานแซกชัน ถ้าเอกสารแม่ยังอยู่ = ผิดกติกา
--    ล้มทั้งก้อน · ทางที่ถูก (RPC ข้อ ⑥) ลบทั้งคู่ในทรานแซกชันเดียว จึงผ่านเสมอ
CREATE OR REPLACE FUNCTION public.check_product_spec_document_revision_orphan_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.product_spec_documents d WHERE d.id = OLD."documentId") THEN
    RAISE EXCEPTION 'product_spec_document_revision_orphan_delete: % — ลบ Rev. เดี่ยว ๆ ไม่ได้ ต้องลบทั้งเอกสาร', OLD.id;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS product_spec_document_revisions_orphan_check
  ON public.product_spec_document_revisions;
CREATE CONSTRAINT TRIGGER product_spec_document_revisions_orphan_check
AFTER DELETE ON public.product_spec_document_revisions
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION public.check_product_spec_document_revision_orphan_delete();

-- ── ⑥ RPC: ลบร่างที่ไม่เคยยื่น (ใบ + Rev.00) ในคำสั่งเดียว ────────────────────
--
-- ⚠️ `p_document_id` เป็น **text** ไม่ใช่ uuid — คีย์ของตารางชุดนี้เป็น text ทั้งระบบ
--    (`PSD-…` / `PSDR-…` ออกจากฝั่งแอป) การรับ uuid จะทำให้เรียกไม่ได้เลย
-- ⚠️ ลำดับล็อก: **Rev ก่อน → เอกสารทีหลัง** (เหมือนทางยื่น) กัน deadlock · ตรวจกติกา
--    *หลัง* ได้ล็อกครบ ⇒ คนที่กดยื่นแทรกกลางจะถูกเห็นเสมอ (READ COMMITTED อ่านค่าล่าสุด
--    หลัง `FOR UPDATE` ปล่อย) และ RPC ตอบ `..._draft_delete_forbidden: <docNo> — เคยยื่น…`
--    แทนที่จะลบทับ
-- ⚠️ **ห้ามแตะ `entity_number_counters`** — เลขที่ที่ลบไปแล้วเป็นรูถาวรตามมติ
-- ⚠️ คืนแถวที่ลบจริงกลับไป **เป็นหลักฐานว่าหายไปทั้งคู่** — store เช็คก่อนตอบว่าสำเร็จ
--    (ไม่ได้ก้อนนี้ = ห้ามบอกว่าลบแล้ว) · `audit_logs.before` เขียนจากแถวที่เราต์อ่านมา
--    **ก่อน** เรียกตัวนี้ ไม่ใช่จากก้อนนี้ — ดูหัวข้อ "บันทึกการลบ" ที่หัวไฟล์
CREATE OR REPLACE FUNCTION public.delete_product_spec_document_draft(p_document_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doc   public.product_spec_documents%ROWTYPE;
  v_rev   public.product_spec_document_revisions%ROWTYPE;
  v_count integer;
BEGIN
  IF p_document_id IS NULL OR p_document_id = '' THEN
    RAISE EXCEPTION 'document_id_required';
  END IF;

  -- ล็อก Rev ทุกแถวของใบนี้ก่อน (ถ้ามี) — ต้องมาก่อนการล็อกเอกสาร ดูเหตุผลที่หัวข้อ
  PERFORM 1 FROM public.product_spec_document_revisions
   WHERE "documentId" = p_document_id
     FOR UPDATE;

  SELECT * INTO v_doc FROM public.product_spec_documents
   WHERE id = p_document_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'product_spec_document_not_found: %', p_document_id;
  END IF;

  IF v_doc.status <> 'active' THEN
    RAISE EXCEPTION 'product_spec_document_draft_delete_forbidden: % — เอกสารถูกยกเลิกแล้ว', v_doc."docNo";
  END IF;
  IF v_doc."currentRevNo" IS NOT NULL THEN
    RAISE EXCEPTION 'product_spec_document_draft_delete_forbidden: % — เอกสารผ่านการอนุมัติแล้ว (Rev.%)', v_doc."docNo", v_doc."currentRevNo";
  END IF;

  SELECT count(*)::integer INTO v_count
    FROM public.product_spec_document_revisions
   WHERE "documentId" = p_document_id;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'product_spec_document_draft_delete_forbidden: % — มี Rev. % ฉบับ ลบได้เฉพาะใบที่มี Rev.00 ฉบับเดียว', v_doc."docNo", v_count;
  END IF;

  SELECT * INTO v_rev FROM public.product_spec_document_revisions
   WHERE "documentId" = p_document_id;

  IF v_rev."revNo" <> 0 OR v_rev.status <> 'draft' THEN
    RAISE EXCEPTION 'product_spec_document_draft_delete_forbidden: % — Rev.% อยู่ในขั้น % ไม่ใช่ร่างที่ยังไม่ได้ยื่น', v_doc."docNo", v_rev."revNo", v_rev.status;
  END IF;
  /* 🔴 ด่านของมติ: ร่างที่ **เคย** เข้าสู่ pending_ae แม้ครั้งเดียว (ยื่นแล้วดึงกลับ · ถูกตีกลับ)
     ลบไม่ได้ — AE เห็นใบนั้นและได้รับแจ้งเตือนไปแล้ว ทางออกเดียวคือ "ยกเลิกเอกสาร" */
  IF v_rev."firstSubmittedAt" IS NOT NULL
     OR v_rev."submittedAt"  IS NOT NULL
     OR v_rev."aeApprovedAt" IS NOT NULL
     OR v_rev."supApprovedAt" IS NOT NULL
     OR v_rev."rejectedAt"   IS NOT NULL
     OR v_rev."frozenHtml"   IS NOT NULL THEN
    RAISE EXCEPTION 'product_spec_document_draft_delete_forbidden: % — เคยยื่นให้ผู้อนุมัติดูแล้ว ลบไม่ได้ ใช้ยกเลิกเอกสารแทน', v_doc."docNo";
  END IF;

  -- ประตูของยาม: เปิดให้ใบนี้ใบเดียว และเฉพาะภายในทรานแซกชันนี้ (true = SET LOCAL)
  PERFORM set_config('app.spec_doc_draft_delete', p_document_id, true);

  DELETE FROM public.product_spec_document_revisions WHERE id = v_rev.id;
  DELETE FROM public.product_spec_documents WHERE id = p_document_id;

  -- ปิดประตูทันทีที่ใช้เสร็จ — เผื่อถูกเรียกในทรานแซกชันที่ยังทำอย่างอื่นต่อ
  PERFORM set_config('app.spec_doc_draft_delete', '', true);

  RETURN jsonb_build_object(
    'docNo',    v_doc."docNo",
    'document', to_jsonb(v_doc),
    'revision', to_jsonb(v_rev)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_product_spec_document_draft(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_product_spec_document_draft(text)
  TO service_role;

COMMENT ON FUNCTION public.delete_product_spec_document_draft(text) IS
  'ลบร่าง FM-SA-04 ที่ยังไม่เคยยื่น (ใบ active · Rev.00 draft ฉบับเดียว · firstSubmittedAt ว่าง · currentRevNo ว่าง) พร้อม Rev ในทรานแซกชันเดียว แล้วคืนแถวที่ลบไปเขียน audit — เลขที่ไม่นำกลับมาใช้ (0375 · มติ 23/09/2569)';

COMMIT;

NOTIFY pgrst, 'reload schema';
