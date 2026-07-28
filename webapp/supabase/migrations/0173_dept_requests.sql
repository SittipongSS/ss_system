-- ============================================================
--  Migration 0173: เคสขอราคาวัสดุ → **คำร้องข้ามฝ่าย** (dept_requests)
--  PR-2 ของ docs/cross-department-requests-plan.md (ชั้น B)
--
--  ระบบมีกลไก "ขอให้ฝ่ายอื่นทำอะไรให้" อยู่ 2 ชุดที่เกือบเหมือนกันแต่คนละคำ
--  คนละตาราง คนละคิว → RD ต้องเฝ้าสองที่ และไม่มีที่ไหนรวมว่างานค้างมีกี่ชิ้น
--    · inquiries (0104)           = เธรดล้วน บังคับดีล ไม่มีบรรทัด ไม่มีคิวรายฝ่าย
--    · material_price_asks (0158) = เลขที่ + สถานะ 6 ขั้น + คิว + บรรทัด + ชั้นจำนวน
--                                   + เธรดกลาง + ไฟล์แนบต่อครบ 5 จุด + เทสต์
--  ตัวหลังใหม่กว่าและมีครบทุกอย่างที่ต้องใช้ → **ขยายตัวหลังให้รับ "ชนิด"**
--  (ไม่ใช่สร้างตารางที่สามมาครอบ) · การลบระบบสอบถามอยู่ PR ถัดไป — ดูข้อ 5
--
--  ⭐ นับบน prod ก่อนเขียน (2026-07-28): material_price_asks = 1 แถว (PM-26070001)
--     · inquiries / inquiry_messages = 0 แถว (ยังไม่ลบในไฟล์นี้)
--
--  ⚠ รันมือบน Supabase SQL Editor · ต้องรัน **ก่อน** deploy โค้ด PR-2
--  ⚠ ไฟล์นี้เปลี่ยนชื่อตารางที่โค้ดปัจจุบันบน prod ยังเรียกอยู่ → ช่วงคาบเกี่ยว
--    ระหว่างรัน migration กับ deploy เสร็จ **แท็บเคสขอราคาบนหน้าวัสดุจะพัง**
--    (ของอื่นไม่กระทบ) — รัน migration แล้วรีบ deploy ตามทันที
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) เปลี่ยนชื่อตาราง: เคสขอราคา → คำร้อง
--    (ALTER TABLE ... RENAME ไม่แตะชื่อ index/constraint ให้ ต้องเปลี่ยนเอง
--     ไม่งั้นอีกหกเดือนจะเจอ index ชื่อ material_price_asks_* บนตารางที่ไม่มีชื่อนั้นแล้ว)
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.material_price_asks      RENAME TO dept_requests;
ALTER TABLE public.material_price_ask_items RENAME TO dept_request_items;
ALTER TABLE public.material_price_ask_tiers RENAME TO dept_request_item_tiers;
ALTER TABLE public.dept_request_items       RENAME COLUMN "askId"     TO "requestId";
ALTER TABLE public.dept_request_item_tiers  RENAME COLUMN "askItemId" TO "requestItemId";

ALTER INDEX IF EXISTS material_price_asks_queue_idx          RENAME TO dept_requests_queue_idx;
ALTER INDEX IF EXISTS material_price_asks_owner_idx          RENAME TO dept_requests_owner_idx;
ALTER INDEX IF EXISTS material_price_asks_costing_idx        RENAME TO dept_requests_costing_idx;
ALTER INDEX IF EXISTS material_price_ask_items_ask_idx       RENAME TO dept_request_items_request_idx;
ALTER INDEX IF EXISTS material_price_ask_items_queue_idx     RENAME TO dept_request_items_queue_idx;
ALTER INDEX IF EXISTS material_price_ask_items_material_idx  RENAME TO dept_request_items_material_idx;
ALTER INDEX IF EXISTS material_price_ask_items_component_idx RENAME TO dept_request_items_component_idx;
-- ชื่อ constraint ที่ Postgres ตั้งเองมี camelCase ปนอยู่ (…_askItemId_qty_key) การ
-- RENAME ต้องสะกดให้ตรงเป๊ะ เดาผิดแล้ว migration ล้มทั้งไฟล์ — เป็นแค่ชื่อ ไม่กระทบ
-- พฤติกรรม จึงปล่อยไว้ตามเดิมโดยตั้งใจ (ค้นด้วยตารางเจอง่ายกว่าค้นด้วยชื่อ constraint)

-- ────────────────────────────────────────────────────────────────────────────
-- 2) ชนิดคำร้อง + บริบทงาน + หมุดไทม์ไลน์
-- ────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.dept_requests
  -- ⚠ ชนิดไม่มี CHECK ที่ระดับ DB **โดยเจตนา** — ชุดชนิดประกาศในโค้ด
  -- (lib/master/requestTypes.js) แพตเทิร์นเดียวกับ updateTypes / attachmentTypes /
  -- materialTypes: เพิ่มชนิดใหม่ = แก้โค้ดล้วน ไม่ต้องออก migration ทุกครั้ง
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'price_pm',
  -- หัวเรื่อง: ชนิดขอราคาไม่ต้องมี (บรรทัดบอกเองว่าถามอะไร) ชนิดอื่นบังคับที่ API
  -- เพราะกฎขึ้นกับ kind ซึ่ง CHECK ระดับตารางเขียนให้อ่านรู้เรื่องไม่ได้
  ADD COLUMN IF NOT EXISTS title text CHECK (title IS NULL OR length(title) <= 200),
  ADD COLUMN IF NOT EXISTS body  text CHECK (body  IS NULL OR length(body)  <= 4000),
  ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false,
  -- บริบทงาน (บังคับเฉพาะชนิดงานลูกค้า — ตรวจที่ API ด้วยเหตุผลเดียวกับ title)
  ADD COLUMN IF NOT EXISTS "dealId"    text,
  ADD COLUMN IF NOT EXISTS "projectId" text,
  -- ⚠ หมุดขั้นในไทม์ไลน์: เก็บ **stepKey ไม่ใช่ projectTaskId** — mergeTemplateTasks
  -- ลบ/สร้าง task ใหม่ตอน resync แม่แบบ ผูก id ตรง ๆ แล้วหมุดจะหลุดเงียบ ๆ
  -- (resolve เป็น task จริงตอนอ่านเสมอ)
  ADD COLUMN IF NOT EXISTS "stepKey"   text,
  -- ผูกกลิ่น/สูตรด้วย id (mig 0171) — เลิกอ้างด้วยข้อความ
  ADD COLUMN IF NOT EXISTS "scentId"   text REFERENCES public.scents(id)   ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS "formulaId" text REFERENCES public.formulas(id) ON DELETE SET NULL,
  -- วันที่ผู้ขอ "อยากได้คำตอบ" vs วันที่ฝ่ายผู้ตอบ "รับปากว่าจะตอบ"
  -- (ยกแนวคิดมาจาก inquiries ที่กำลังจะลบ — เส้นวัด KPI คือตัวหลัง ไม่ใช่ตัวแรก)
  ADD COLUMN IF NOT EXISTS "requestedDueDate" date,
  ADD COLUMN IF NOT EXISTS "committedDueDate" date;

-- dept เดิม CHECK ไว้แค่ RD/PC — ยังพอสำหรับชนิดใหม่ทั้งหมด
-- (ถ้าวันหนึ่งต้องส่งถึง LG/QC ค่อยผ่อน CHECK ใน migration แยก)

CREATE INDEX IF NOT EXISTS dept_requests_kind_idx    ON public.dept_requests (kind, status);
CREATE INDEX IF NOT EXISTS dept_requests_deal_idx    ON public.dept_requests ("dealId")
  WHERE "dealId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS dept_requests_project_idx ON public.dept_requests ("projectId", "stepKey")
  WHERE "projectId" IS NOT NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) แถวเดิมทั้งหมดคือคำร้องขอราคา — เติม kind ให้ถูกตามฝ่าย/ชนิดวัสดุ
--    (prod มี 1 แถว แต่เขียนให้ทั่วไปเผื่อ staging)
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.dept_requests r
   SET kind = CASE
     WHEN r.dept = 'PC' THEN 'price_pm'
     WHEN EXISTS (SELECT 1 FROM public.dept_request_items i
                   WHERE i."requestId" = r.id AND i.kind = 'RM_F') THEN 'price_f'
     ELSE 'price_fb'
   END;
-- ถอด default ทิ้งหลัง backfill — ชนิดต้องระบุเสมอตอนสร้าง ไม่ใช่ตกไปเป็น PM เงียบ ๆ
ALTER TABLE public.dept_requests ALTER COLUMN kind DROP DEFAULT;

-- ────────────────────────────────────────────────────────────────────────────
-- 3.1) ⚠️ guard + RPC force-delete ต้องสร้างใหม่ให้ชี้ชื่อตารางใหม่
--
--   trigger ติดตามตารางไปเองตอน RENAME (ยังทำงานอยู่) แต่ **RPC พังทันที** เพราะ
--   ตัวมันเขียน `DELETE FROM public.material_price_asks` ไว้ตรง ๆ ในเนื้อฟังก์ชัน
--   → ถ้าไม่แก้ที่นี่ ปุ่มบังคับลบของผู้ดูแลระบบจะ error "relation does not exist"
--   หลัง deploy โดยไม่มีอะไรเตือนล่วงหน้า (plpgsql ไม่ตรวจตอน CREATE)
-- ────────────────────────────────────────────────────────────────────────────
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
  IF OLD.status = 'cancelled' AND NEW.status <> 'cancelled' THEN
    RAISE EXCEPTION 'dept_request_cancelled_immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS material_price_asks_guard ON public.dept_requests;
DROP TRIGGER IF EXISTS dept_requests_guard       ON public.dept_requests;
CREATE TRIGGER dept_requests_guard
BEFORE UPDATE OR DELETE ON public.dept_requests
FOR EACH ROW EXECUTE FUNCTION public.guard_dept_request();
DROP FUNCTION IF EXISTS public.guard_material_price_ask();

CREATE OR REPLACE FUNCTION public.force_delete_dept_request(p_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.force_delete', '1', true);
  DELETE FROM public.dept_requests WHERE id = p_id;   -- ลูก cascade
END;
$$;
REVOKE ALL ON FUNCTION public.force_delete_dept_request(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_dept_request(text) TO service_role;
DROP FUNCTION IF EXISTS public.force_delete_material_ask(text);

-- ────────────────────────────────────────────────────────────────────────────
-- 4) เธรดกลาง + ไฟล์แนบ: เปลี่ยน entityType ตามชื่อใหม่
--    ทั้งคู่เป็น polymorphic ไม่มี FK (ตั้งใจ) → ต้องอัปเดตด้วยมือที่นี่
-- ────────────────────────────────────────────────────────────────────────────
UPDATE public.entity_updates SET "entityType" = 'dept_request'
 WHERE "entityType" = 'material_ask';

UPDATE public.attachments SET "entityType" = 'dept_request_item'
 WHERE "entityType" = 'material_ask_item';

-- ────────────────────────────────────────────────────────────────────────────
-- 5) ⚠️ **ระบบสอบถามเดิม (inquiries) ยังไม่ถูกลบในไฟล์นี้ — ตั้งใจ**
--
--    แผนเดิมให้ DROP ที่นี่ แต่ตารางกับโค้ดต้องตายพร้อมกัน: ถ้า DROP ตอนนี้แล้ว
--    หน้า /sa/inquiries + API + แท็บบนหน้าดีล (ที่ยังอยู่ครบ) จะพังทันทีที่รัน
--    migration — ก่อนโค้ดชุดถัดไปจะ deploy ด้วยซ้ำ
--
--    ไฟล์นี้จึงทำเฉพาะส่วนที่ **deploy เดี่ยว ๆ ได้ปลอดภัย** (เปลี่ยนชื่อ + เพิ่มคอลัมน์)
--    ส่วน DROP ยกไปอยู่ migration ของ PR ถัดไปที่ลบโค้ดสอบถามในคอมมิตเดียวกัน
--    (prod ยืนยันแล้วว่า inquiries = 0 แถว → ตอนนั้นลบได้โดยไม่ต้อง backfill)
-- ────────────────────────────────────────────────────────────────────────────

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ────────────────────────────────────────────────────────────
-- SELECT kind, dept, status, count(*) FROM dept_requests GROUP BY 1,2,3;  -- ควรได้ price_pm/PC
-- SELECT count(*) FROM entity_updates WHERE "entityType" = 'material_ask';      -- ต้อง 0
-- SELECT count(*) FROM attachments    WHERE "entityType" = 'material_ask_item'; -- ต้อง 0
-- SELECT to_regclass('public.dept_requests'), to_regclass('public.material_price_asks'); -- ไม่ null, null
--
-- ── หมายเหตุที่ตั้งใจไม่แตะ ─────────────────────────────────────────────────
-- material_price_revisions."sourceAskItemId" ยังชื่อเดิม — เป็น logical link
-- (ไม่มี FK เพราะ rev เป็น immutable) และถูกอ้างโดย RPC
-- append_material_price_revision(p_ask_item_id) การเปลี่ยนชื่อต้องแก้ RPC ตามด้วย
-- ซึ่งไม่คุ้มความเสี่ยงในรอบนี้ — ยกไปทำพร้อมงานอื่นที่แตะ RPC ตัวนั้นอยู่แล้ว
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- ⚠ ต้องสร้าง guard_material_price_ask() + force_delete_material_ask() คืนจาก 0158 ด้วย
-- ALTER TABLE public.dept_request_item_tiers RENAME COLUMN "requestItemId" TO "askItemId";
-- ALTER TABLE public.dept_request_item_tiers RENAME TO material_price_ask_tiers;
-- ALTER TABLE public.dept_request_items RENAME COLUMN "requestId" TO "askId";
-- ALTER TABLE public.dept_request_items RENAME TO material_price_ask_items;
-- ALTER TABLE public.dept_requests      RENAME TO material_price_asks;
-- ALTER TABLE public.material_price_asks
--   DROP COLUMN IF EXISTS kind, DROP COLUMN IF EXISTS title, DROP COLUMN IF EXISTS body,
--   DROP COLUMN IF EXISTS urgent, DROP COLUMN IF EXISTS "dealId",
--   DROP COLUMN IF EXISTS "projectId", DROP COLUMN IF EXISTS "stepKey",
--   DROP COLUMN IF EXISTS "scentId", DROP COLUMN IF EXISTS "formulaId",
--   DROP COLUMN IF EXISTS "requestedDueDate", DROP COLUMN IF EXISTS "committedDueDate";
-- UPDATE public.entity_updates SET "entityType"='material_ask'      WHERE "entityType"='dept_request';
-- UPDATE public.attachments    SET "entityType"='material_ask_item' WHERE "entityType"='dept_request_item';

