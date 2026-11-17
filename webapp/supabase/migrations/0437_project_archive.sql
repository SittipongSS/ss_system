-- 0437 — ยุบโครงการงวด P3c: ฐานเลิกเขียน "projectId" ลงแถวใหม่ · สายธุรกิจของ SO อ่านจากดีล · ยามคลังโครงการ
--
--  แผน: docs/customer-hub-plan.md หัวข้อ P3 · มติเจ้าของ ⑩ (16/11/2026) — ตาราง `projects` + `projectId` เดิมทุกตาราง
--  เก็บเป็นประวัติ อ่านอย่างเดียว ไม่มีจอ · **ไม่ลบตาราง/คอลัมน์** · โค้ดแอปเลิกเขียน/เลิกอ่านครบแล้วในงวด P3a–P3b-3
--
--  ปะ/เปลี่ยน 6 จุด:
--    C1 `create_sales_order_draft`            — SO ใหม่เลิกก๊อป `d."projectId"` ของดีล (ใส่ NULL)
--    C2 `revise_approved_sales_order_atomic`  — ฉบับ Rev. เลิกก๊อป `v_source."projectId"` (ใส่ NULL)
--    C3 `deal_restore_timeline_revision`      — ย้อน Rev. ไทม์ไลน์เลิกประทับ `projectId` ของดีลลงขั้น (ใส่ NULL)
--    C4 `sales_order_business_line`           — สายธุรกิจของใบ = **สายของดีล** (เดิม: โครงการก่อน แล้วดีล)
--         เหตุ: มติ ⑫ (P3b-2) ปลดล็อกสายของดีลเก่าในโครงการ ⇒ สายโครงการที่ค้างอาจไม่ตรงกับดีล — แอปอ่านสายจากดีล
--         ตั้งแต่ P3b-1 (`orderBusinessLineOf`) · prod 16/11 สายโครงการ = สายดีล 399/399 SO ⇒ วันนี้ผลไม่เปลี่ยน
--    C5 ถอดทริกเกอร์ `project_tasks_mark_rev_stale` + ฟังก์ชัน `pm_mark_rev_stale` (0045) — ติดธง `projects."revStale"`
--         ทุกครั้งที่แก้ขั้นไทม์ไลน์ที่ถือ projectId · Rev. เป็นของดีลแล้ว (`timelineRevStale` · 0435) ไม่มีจอไหนอ่าน
--         ลบ `backfill_deal_fields_from_projects` (0435 · ใช้ครั้งเดียวตอน P2a · ไม่มีผู้เรียก)
--    C6 ยามคลัง: `projects` **เพิ่ม/ลบแถวไม่ได้** (BEFORE INSERT OR DELETE + TRUNCATE)
--         เหตุ: ลบแถว = `project_tasks` (ไทม์ไลน์ 9,674 ขั้น) หายแบบ CASCADE และ `sales_orders."projectId"` ถูก SET NULL
--         ⇒ ลายนิ้วมืออนุมัติ SO เพี้ยนทั้งชุด (362 ใบ) · **ยังแก้แถวได้** — ชื่อลูกค้า (mirror `customerNameMirrors`) /
--         รวมลูกค้า (`merge-duplicate-customers`) ยังสะท้อนลงคลัง · ทางออกฉุกเฉิน (SQL Editor เท่านั้น):
--           BEGIN; SET LOCAL app.projects_archive_unlock = 'on'; <คำสั่งที่เจ้าของสั่ง>; COMMIT;
--
--  🔴 ไม่ล้าง/ไม่เขียนทับ `projectId` ของแถวเดิมทุกตาราง — `sales_orders."projectId"` อยู่ในลายนิ้วมืออนุมัติ SO
--     (`salesOrderApprovalContent`) · SO ใหม่ที่ได้ NULL คำนวณลายนิ้วมือตอนอนุมัติจากค่าจริงของแถว ⇒ ตรงกันเสมอ
--  ⚠️ C1–C3 ปะบน `pg_get_functiondef` ของตัวที่รันจริง (แบบ 0382/0404/0412/0416/0434) — ห้ามยกเนื้อจากไฟล์เก่า:
--     ข้อความยึดต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ functiondef ไม่งั้นหยุดทั้งไฟล์ · มีป้ายของจุดนั้นแล้ว = ข้าม
--  🛑 ลำดับขึ้นระบบ: รันเมื่อไรก็ได้ — โค้ดที่ deploy อยู่ (P3b-3) ไม่อ่าน/ไม่เขียน `projectId` และไม่สร้าง/ลบโครงการแล้ว
--  ✅ รันซ้ำได้ (ปะแล้วข้าม · CREATE OR REPLACE · DROP … IF EXISTS)
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: patched = 3 · line_from_deal = true · rev_stale_trigger = 0 · backfill_fn = null · guard = 2 ──
--   (บล็อกเดียวกับ SELECT ท้ายไฟล์)
--
--  ── ถอยกลับ (ส่วนใหญ่ปลอดภัย · SO ที่ออกระหว่างนั้นยังได้ projectId ว่างต่อไป) ──
--   BEGIN;
--   DO $undo$ DECLARE r record; v_def text; BEGIN
--     FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND strpos(p.prosrc, '0437/C') > 0 LOOP
--       v_def := pg_get_functiondef(r.oid);
--       v_def := replace(v_def, 'NULL /* 0437/C1 — SO ใหม่ไม่ก๊อปโครงการ */', 'd."projectId"');
--       v_def := replace(v_def, 'NULL /* 0437/C2 — Rev. ไม่ก๊อปโครงการ */', 'v_source."projectId"');
--       v_def := replace(v_def, 'NULL /* 0437/C3 — ย้อน Rev. ไม่ประทับโครงการ */', 'v_project_id');
--       EXECUTE v_def;
--     END LOOP; END $undo$;
--   DROP TRIGGER IF EXISTS projects_archive_guard_rows ON public.projects;
--   DROP TRIGGER IF EXISTS projects_archive_guard_truncate ON public.projects;
--   -- C4/C5: นิยามเดิมอยู่ที่ 0392 (sales_order_business_line) · 0045 (pm_mark_rev_stale + trigger) · 0435 (backfill)
--   COMMIT;

BEGIN;

-- ── C1–C3 ปะบนตัวที่รันจริง ─────────────────────────────────────────────────
DO $patch$
DECLARE
  v_patches constant text[][] := ARRAY[
    ARRAY['create_sales_order_draft', '0437/C1',
      'd."projectId"',
      'NULL /* 0437/C1 — SO ใหม่ไม่ก๊อปโครงการ */'],
    ARRAY['revise_approved_sales_order_atomic', '0437/C2',
      'v_source."projectId"',
      'NULL /* 0437/C2 — Rev. ไม่ก๊อปโครงการ */'],
    ARRAY['deal_restore_timeline_revision', '0437/C3',
      'v_project_id, p_deal_id,',
      'NULL /* 0437/C3 — ย้อน Rev. ไม่ประทับโครงการ */, p_deal_id,']
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
    IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0437_patch_overload % count=%', v_fn, v_n; END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    v_def := pg_get_functiondef(v_oid);

    IF strpos(v_src, v_marker) > 0 THEN
      RAISE NOTICE '0437: % % — ปะไว้แล้ว', v_fn, v_marker;
      CONTINUE;
    END IF;

    v_src_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    v_def_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_src_hits <> 1 OR v_def_hits <> 1 THEN
      RAISE EXCEPTION 'mig_0437_patch_anchor % % src=% def=%', v_fn, v_marker, v_src_hits, v_def_hits;
    END IF;

    EXECUTE replace(v_def, v_anchor, v_new);
    RAISE NOTICE '0437: % % — ปะแล้ว', v_fn, v_marker;
  END LOOP;

  -- ตรวจซ้ำหลังปะ: สามตัวนี้ต้องไม่เหลือการก๊อปโครงการ
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND ((p.proname = 'create_sales_order_draft' AND strpos(p.prosrc, 'd."projectId"') > 0)
         OR (p.proname = 'revise_approved_sales_order_atomic' AND strpos(p.prosrc, 'v_source."projectId"') > 0)
         OR (p.proname = 'deal_restore_timeline_revision' AND strpos(p.prosrc, 'v_project_id, p_deal_id,') > 0))
  ) THEN
    RAISE EXCEPTION 'mig_0437_copy_still_present';
  END IF;
END
$patch$;

-- ── C4 สายธุรกิจของใบ = สายของดีล (คู่กับ `orderBusinessLineOf` ฝั่ง JS) · ตอบไม่ได้ = NULL ไม่ใช่ 'PRODUCT' ──
--     (เดิม 0392: โครงการก่อน แล้วดีล) · ใบค่าสรรพสามิต/ใบที่ไม่มีดีล = NULL เหมือนเดิม
CREATE OR REPLACE FUNCTION public.sales_order_business_line(p_order_id text)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE WHEN d.line IN ('PRODUCT', 'SERVICE') THEN d.line END
    FROM public.sales_orders o
    LEFT JOIN public.sales_deals d ON d.id = o."dealId"
   WHERE o.id = p_order_id;
$$;

-- ── C5 ทริกเกอร์/ฟังก์ชันของโครงการที่ไม่มีผู้ใช้แล้ว ─────────────────────────
DROP TRIGGER IF EXISTS project_tasks_mark_rev_stale ON public.project_tasks;
DROP FUNCTION IF EXISTS public.pm_mark_rev_stale();
DROP FUNCTION IF EXISTS public.backfill_deal_fields_from_projects(boolean);

-- ── C6 ยามคลังโครงการ: เพิ่ม/ลบแถวไม่ได้ ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.projects_archive_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF COALESCE(current_setting('app.projects_archive_unlock', true), '') = 'on' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  RAISE EXCEPTION 'โครงการเป็นคลังอ่านอย่างเดียว — เพิ่ม/ลบแถวไม่ได้ (ลบ = ไทม์ไลน์หายแบบ cascade และลายนิ้วมือ SO เพี้ยน) [projects_archived]'
    USING errcode = 'P0001';
END;
$$;

REVOKE ALL ON FUNCTION public.projects_archive_guard() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS projects_archive_guard_rows ON public.projects;
CREATE TRIGGER projects_archive_guard_rows
BEFORE INSERT OR DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.projects_archive_guard();

DROP TRIGGER IF EXISTS projects_archive_guard_truncate ON public.projects;
CREATE TRIGGER projects_archive_guard_truncate
BEFORE TRUNCATE ON public.projects
FOR EACH STATEMENT EXECUTE FUNCTION public.projects_archive_guard();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: patched = 3 · line_from_deal = true · rev_stale_trigger = 0 · backfill_fn = null · guard = 2 ──
SELECT
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND strpos(p.prosrc, '0437/C') > 0
      AND p.proname IN ('create_sales_order_draft', 'revise_approved_sales_order_atomic', 'deal_restore_timeline_revision')) AS patched,
  (SELECT strpos(p.prosrc, 'public.projects') = 0 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'sales_order_business_line') AS line_from_deal,
  (SELECT count(*) FROM pg_trigger WHERE tgname = 'project_tasks_mark_rev_stale') AS rev_stale_trigger,
  to_regprocedure('public.backfill_deal_fields_from_projects(boolean)') AS backfill_fn,
  (SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.projects'::regclass
     AND tgname IN ('projects_archive_guard_rows', 'projects_archive_guard_truncate')) AS guard;
