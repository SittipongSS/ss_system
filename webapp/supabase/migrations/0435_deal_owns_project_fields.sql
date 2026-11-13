-- ============================================================
--  Migration 0435: ดีลรับช่องของโครงการ — งวด P2a ของการยุบดีล/โครงการเป็นหน่วยเดียว
--
--  มติเจ้าของ 13/11/2026 (docs/customer-hub-plan.md §กรอบ P2 · ถามทีละข้อ):
--    ① เลขที่เอกสารไทม์ไลน์ FM-PD-05 = รหัสดีล + Rev. ⇒ Rev. ของไทม์ไลน์เดินบนดีล ไม่ใช่บนโครงการ
--    ② AC ผู้ประสานงาน + AE Supervisor = ช่องบนดีล เลือกเองทุกดีล แก้ได้ (วันนี้อยู่ที่โครงการเท่านั้น)
--    ③ กติกา "SCENT ปิด Won ⇒ NPD ขึ้น 80%" จับคู่ด้วยช่อง "ดีล SCENT ต้นทาง" บนดีล NPD
--       แทน "ดีลในโครงการเดียวกัน"
--
--  ⭐ additive ล้วน — เพิ่มคอลัมน์ · ตาราง · trigger · ฟังก์ชันเติมค่า · โค้ดวันนี้ยังอ่านจากโครงการทั้งหมด
--     (งวด P2b–P2d ย้ายผู้อ่าน/ผู้เขียนมาที่ดีล) ⇒ รันก่อนหรือหลัง deploy ก็ได้ ไม่มีจอไหนพัง
--  ⭐ ฟังก์ชันเติมค่าจากโครงการ **เติมเฉพาะช่องที่ยังว่าง** และเรียกซ้ำได้ — ระหว่างนี้โครงการใหม่ยังถูก
--     สร้างพร้อม AC (ปุ่มสร้างโครงการบนหน้าดีลยังอยู่จนงวด P2d) ⇒ เรียกอีกครั้งตอนสลับผู้อ่านแต่ละงวด
--     ค่าตั้งต้น = ซ้อม (ไม่เขียนอะไร คืนจำนวนที่จะเติม) · ต้องส่ง true ถึงจะเขียนจริง
--
--  ⚠️ ห้ามใช้ `sales_deals."parentDealId"` แทนช่อง ③ — mig 0072 ใช้ชี้ "ดีลแม่ของ PO ที่เข้ามาบางส่วน"
--     และ CHECK ของดีลใบสั่งขายย้อนหลัง (mig 0360) บังคับให้ว่าง ⇒ คนละความหมาย จึงเป็นคอลัมน์ใหม่
--  ⚠️ ชื่อ AC/Sup บนดีลเป็น "ชื่อบนเอกสาร" (ขึ้นกระดาษ FM-PD-05) — **ห้ามเข้าลิสต์ซิงก์ชื่อตามบัญชี**
--     (lib/personNameFanOut.js) เหมือน `projects.acOwner` / `sales_deals.ownerName`
--  ⚠️ ชื่อ AC ใช้ `projects."acOwner"` (คู่กับ acOwnerId) ไม่ใช่ `projects."preparedBy"` — สองช่องนี้ตรงกันแค่
--     105/341 ใบบน prod (preparedBy ส่วนใหญ่ = คนที่กดสร้างโครงการ) · กระดาษ FM-PD-05 วันนี้พิมพ์ preparedBy
--     ในช่อง AC — งวด P2b ตัดสินตอนย้ายกระดาษมาดีล
--
--  ⚠ รันมือบน Supabase SQL Editor (DDL) · บล็อกเดียว · SELECT ท้ายไฟล์ = ผลซ้อมของการเติมค่า
-- ============================================================

-- ── 1. ช่องใหม่บนดีล ─────────────────────────────────────────────────────────
ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS "acOwnerId" text,
  ADD COLUMN IF NOT EXISTS "acOwnerName" text,
  ADD COLUMN IF NOT EXISTS "aeSupervisorId" text,
  ADD COLUMN IF NOT EXISTS "aeSupervisorName" text,
  ADD COLUMN IF NOT EXISTS "sourceScentDealId" text,
  -- Rev. ไทม์ไลน์ปัจจุบันของดีล · ว่าง = ยังไม่เคยออก Rev. (ฉบับร่าง)
  ADD COLUMN IF NOT EXISTS "timelineRev" integer,
  -- true = แก้ไทม์ไลน์หลังออก Rev. ล่าสุด (เทียบ projects."revStale" mig 0045)
  ADD COLUMN IF NOT EXISTS "timelineRevStale" boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  -- ลบดีล SCENT ⇒ NPD ที่ชี้มาปลดเป็นว่างเอง (ไม่ต้องให้ forceDelete ตามเก็บแบบ parentDealId)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_deals_source_scent_fk') THEN
    ALTER TABLE public.sales_deals
      ADD CONSTRAINT sales_deals_source_scent_fk
      FOREIGN KEY ("sourceScentDealId") REFERENCES public.sales_deals(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_deals_source_scent_not_self') THEN
    ALTER TABLE public.sales_deals
      ADD CONSTRAINT sales_deals_source_scent_not_self
      CHECK ("sourceScentDealId" IS NULL OR "sourceScentDealId" <> id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_deals_timeline_rev_nonneg') THEN
    ALTER TABLE public.sales_deals
      ADD CONSTRAINT sales_deals_timeline_rev_nonneg
      CHECK ("timelineRev" IS NULL OR "timelineRev" >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS sales_deals_source_scent_idx
  ON public.sales_deals ("sourceScentDealId")
  WHERE "sourceScentDealId" IS NOT NULL;

-- ── 2. ประวัติ Rev. ไทม์ไลน์รายดีล (แทน project_doc_revisions) ─────────────────
-- เก็บเฉพาะ Rev. ทางการ (จอซ่อน "เซฟใหญ่" ของโครงการไปนานแล้ว) · snapshot = { deal, tasks[] } ตอนออก
CREATE TABLE IF NOT EXISTS public.deal_timeline_revisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "dealId"        text NOT NULL REFERENCES public.sales_deals(id) ON DELETE CASCADE,
  "revNo"         integer NOT NULL CHECK ("revNo" >= 0),
  snapshot        jsonb NOT NULL,
  note            text,
  "createdBy"     text,
  "createdByName" text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT deal_timeline_revisions_deal_rev_key UNIQUE ("dealId", "revNo")
);

ALTER TABLE public.deal_timeline_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.deal_timeline_revisions FROM anon, authenticated;
GRANT ALL ON TABLE public.deal_timeline_revisions TO service_role;

-- ── 3. แก้งานในไทม์ไลน์หลังออก Rev. ⇒ ดีลขึ้น "แก้แล้ว" ───────────────────────
-- คู่ขนานกับ project_tasks_mark_rev_stale (mig 0045) ซึ่งยังอยู่จนกว่าโครงการจะถูกถอด
-- ⭐ แตะเฉพาะดีลที่เคยออก Rev. แล้วและยังไม่ stale — ดีลฉบับร่างไม่ต้องเขียนแถวทุกครั้งที่แก้งาน
-- ⭐ UPDATE ที่ย้ายงานข้ามดีลทำให้ทั้งดีลเก่าและดีลใหม่ stale
CREATE OR REPLACE FUNCTION public.deal_mark_timeline_rev_stale()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_new text := CASE WHEN TG_OP <> 'DELETE' THEN NEW."dealId" END;
  v_old text := CASE WHEN TG_OP <> 'INSERT' THEN OLD."dealId" END;
BEGIN
  IF v_new IS NOT NULL OR v_old IS NOT NULL THEN
    UPDATE public.sales_deals
       SET "timelineRevStale" = true
     WHERE id IN (v_new, v_old)
       AND "timelineRev" IS NOT NULL
       AND "timelineRevStale" = false;
  END IF;
  RETURN NULL; -- AFTER trigger
END;
$$;

REVOKE ALL ON FUNCTION public.deal_mark_timeline_rev_stale() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS project_tasks_mark_deal_timeline_rev_stale ON public.project_tasks;
CREATE TRIGGER project_tasks_mark_deal_timeline_rev_stale
  AFTER INSERT OR UPDATE OR DELETE ON public.project_tasks
  FOR EACH ROW EXECUTE FUNCTION public.deal_mark_timeline_rev_stale();

-- ── 4. เติมค่าจากโครงการ (ซ้อมเป็นค่าตั้งต้น · เติมเฉพาะช่องว่าง · เรียกซ้ำได้) ────────
-- ลำดับมีความหมาย: ย้ายงานกลางก่อนคัด Rev. — trigger ข้อ 3 จะได้ไม่ทำให้ดีลที่เพิ่งได้ Rev. กลายเป็น stale
-- เพราะงานของตัวเอง แล้ว Rev. ค่อยลอกสถานะ stale จากโครงการทีหลัง (ผลเท่ากับโครงการทุกตัวอักษร)
CREATE OR REPLACE FUNCTION public.backfill_deal_fields_from_projects(p_apply boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ac integer := 0;
  v_sup integer := 0;
  v_scent integer := 0;
  v_tasks integer := 0;
  v_rev_rows integer := 0;
  v_rev integer := 0;
  v_fresh_projects text[];
  v_result jsonb;
BEGIN
  BEGIN
    -- ② AC ผู้ประสานงาน (id + ชื่อบนเอกสาร คู่กันจากโครงการ)
    UPDATE public.sales_deals d
       SET "acOwnerId" = p."acOwnerId",
           "acOwnerName" = p."acOwner"
      FROM public.projects p
     WHERE d."projectId" = p.id
       AND d."acOwnerId" IS NULL
       AND p."acOwnerId" IS NOT NULL;
    GET DIAGNOSTICS v_ac = ROW_COUNT;

    -- ② AE Supervisor
    UPDATE public.sales_deals d
       SET "aeSupervisorId" = p."aeSupervisorId",
           "aeSupervisorName" = p."aeSupervisor"
      FROM public.projects p
     WHERE d."projectId" = p.id
       AND d."aeSupervisorId" IS NULL
       AND p."aeSupervisorId" IS NOT NULL;
    GET DIAGNOSTICS v_sup = ROW_COUNT;

    -- ③ NPD → ดีล SCENT ในโครงการเดียวกัน · หลายใบ = เลือกใบที่ Won ก่อน แล้วใบที่สร้างก่อน
    --    (กติกาเดิม "มี SCENT ใบไหน Won ก็ได้" ⇒ เลือกใบ Won = FC% ของ NPD เท่าเดิมทุกใบ)
    WITH pick AS (
      SELECT n.id AS npd_id,
             (SELECT s.id
                FROM public.sales_deals s
               WHERE s."projectId" = n."projectId"
                 AND s.id <> n.id
                 AND upper(s."dealType") = 'SCENT'
               ORDER BY (s.stage IN ('won', 'in_project')) DESC, s."createdAt" ASC, s.id ASC
               LIMIT 1) AS scent_id
        FROM public.sales_deals n
       WHERE n."projectId" IS NOT NULL
         AND upper(n."dealType") = 'NPD'
         AND n."sourceScentDealId" IS NULL
    )
    UPDATE public.sales_deals d
       SET "sourceScentDealId" = pick.scent_id
      FROM pick
     WHERE d.id = pick.npd_id
       AND pick.scent_id IS NOT NULL;
    GET DIAGNOSTICS v_scent = ROW_COUNT;

    -- ① งานกลาง (dealId ว่าง) ของโครงการที่มีดีลใบเดียว → ดีลใบนั้น
    --    โครงการหลายดีลที่ยังมีงานกลาง: ไม่เดา ปล่อยว่าง (prod 13/11 ไม่มีกรณีนี้)
    --    ⚠️ trigger ของ mig 0045 จะตีโครงการเป็น "แก้แล้ว" ทั้งที่เนื้อไทม์ไลน์ไม่เปลี่ยน (ย้ายแค่ป้ายดีล)
    --       ⇒ จำโครงการที่ยังไม่ stale ไว้ แล้วคืนค่าหลังย้าย
    SELECT COALESCE(array_agg(p.id), '{}')
      INTO v_fresh_projects
      FROM public.projects p
     WHERE p."revStale" = false
       AND EXISTS (SELECT 1 FROM public.project_tasks t WHERE t."projectId" = p.id AND t."dealId" IS NULL);

    UPDATE public.project_tasks t
       SET "dealId" = only_deal.deal_id
      FROM (
        SELECT "projectId", min(id) AS deal_id
          FROM public.sales_deals
         WHERE "projectId" IS NOT NULL
         GROUP BY "projectId"
        HAVING count(*) = 1
      ) only_deal
     WHERE t."projectId" = only_deal."projectId"
       AND t."dealId" IS NULL;
    GET DIAGNOSTICS v_tasks = ROW_COUNT;

    UPDATE public.projects
       SET "revStale" = false
     WHERE id = ANY (v_fresh_projects)
       AND "revStale" = true;

    -- ① Rev. ที่โครงการเคยออก → ทุกดีลของโครงการ (snapshot ตัดเหลืองานของดีลนั้น + งานกลาง)
    INSERT INTO public.deal_timeline_revisions
      ("dealId", "revNo", snapshot, note, "createdBy", "createdByName", "createdAt")
    SELECT d.id,
           r."revNo",
           r.snapshot || jsonb_build_object(
             'tasks', COALESCE((
               SELECT jsonb_agg(e.task ORDER BY e.ord)
                 FROM jsonb_array_elements(COALESCE(r.snapshot -> 'tasks', '[]'::jsonb)) WITH ORDINALITY AS e(task, ord)
                WHERE e.task ->> 'dealId' = d.id OR e.task ->> 'dealId' IS NULL
             ), '[]'::jsonb),
             'migratedFrom', jsonb_build_object('projectRevisionId', r.id, 'projectId', r."projectId")
           ),
           r.note,
           r."createdBy",
           r."createdByName",
           r."createdAt"
      FROM public.project_doc_revisions r
      JOIN public.sales_deals d ON d."projectId" = r."projectId"
     WHERE r.kind = 'rev'
       AND r."revNo" IS NOT NULL
    ON CONFLICT ("dealId", "revNo") DO NOTHING;
    GET DIAGNOSTICS v_rev_rows = ROW_COUNT;

    -- ① Rev. ปัจจุบัน + สถานะ "แก้แล้ว" ลอกจากโครงการ — เฉพาะดีลที่มีแถว Rev. เลขนั้นจริง
    --    (projects."currentRev" = 0 ทุกใบเป็นค่าตั้งต้น ไม่ได้แปลว่าเคยออก Rev. — มีแถวจริงแค่ 1 โครงการ)
    UPDATE public.sales_deals d
       SET "timelineRev" = p."currentRev",
           "timelineRevStale" = p."revStale"
      FROM public.projects p
     WHERE d."projectId" = p.id
       AND d."timelineRev" IS NULL
       AND p."currentRev" IS NOT NULL
       AND EXISTS (
         SELECT 1 FROM public.deal_timeline_revisions x
          WHERE x."dealId" = d.id AND x."revNo" = p."currentRev"
       );
    GET DIAGNOSTICS v_rev = ROW_COUNT;

    v_result := jsonb_build_object(
      'apply', p_apply,
      'acOwner', v_ac,
      'aeSupervisor', v_sup,
      'sourceScentDeal', v_scent,
      'centralTasks', v_tasks,
      'timelineRevisions', v_rev_rows,
      'timelineRev', v_rev
    );

    -- ซ้อม: โยนทิ้งทุกอย่างในบล็อกนี้ (ตัวแปรยังเก็บจำนวนไว้คืน)
    IF NOT p_apply THEN
      RAISE EXCEPTION 'deal_backfill_dry_run';
    END IF;
  EXCEPTION WHEN raise_exception THEN
    IF SQLERRM <> 'deal_backfill_dry_run' THEN
      RAISE;
    END IF;
  END;
  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_deal_fields_from_projects(boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_deal_fields_from_projects(boolean) TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจ: ซ้อมการเติมค่า (ไม่เขียนอะไร) ────────────────────────────────────────
-- คาดไว้จาก prod 13/11: acOwner ≈ 609 · aeSupervisor ≈ 607 · sourceScentDeal 82 · centralTasks 51 ·
-- timelineRevisions 1 · timelineRev 1
SELECT public.backfill_deal_fields_from_projects(false) AS dry_run;
