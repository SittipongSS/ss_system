-- ============================================================
--  Migration 0401: รายงานการประเมินพื้นที่ (FM-TS-01) — ตารางเอกสารที่ออกแล้ว + เลขที่ SU
--  สเปก ~/ss-team/mockups/survey-report-doc/PR-1.md · มติเจ้าของ 28/09–01/10
--
--  ⭐ ที่มา: ผลประเมินพื้นที่วันนี้อยู่บนจออย่างเดียว ฝ่ายขายไม่มีเอกสารส่งลูกค้า · มติใหม่:
--    กด "ส่งผลให้ฝ่ายขาย" = ออกเอกสารหนึ่งใบ **สองฉบับจากภาพนิ่งเดียว** (ฉบับลูกค้า · ฉบับภายใน)
--    มีเลขที่ของตัวเอง `SU-YYMMXXXX-R` (รูปเดียวกับ QT/SO · เลขรันตัดรอบรายปี · R = ฉบับ)
--    ดึงผลกลับ/เปิดใบกลับ = ใบเดิมถูกแทนที่ · ส่งใหม่ = เลขฐานเดิม R ถัดไป
--
--  ⭐ ไฟล์นี้เป็น **ฐานราก (PR-1)** — ยังไม่มี route หรือจอไหนอ่าน/เขียนตารางนี้
--    PR-2 (ออกเอกสารตอนส่งผล · ตรึง · เสิร์ฟไฟล์ · สิทธิ์) กับ PR-3 (จอ) ตามมาทีหลัง
--
--  ⚠ รันมือบน Supabase SQL Editor · **ต้องรันก่อน merge PR-2** (PR-2 เรียก issue_survey_report และอ่านตารางนี้)
--  ⚠ **รันก่อน deploy ได้อย่างปลอดภัย — เพิ่มอย่างเดียว**: ตารางใหม่ · ฟังก์ชันใหม่ · bucket ใหม่ · แถวมาตรฐานเอกสารใหม่
--    ไม่แก้คอลัมน์ ไม่ย้ายข้อมูล ไม่แตะแถวเดิมของตารางไหนเลย · โค้ดปัจจุบันไม่เอ่ยชื่อของพวกนี้
--  ⚠ **ของชิ้นเดียวที่แตะเส้นทางที่ใช้อยู่จริง** = ทริกเกอร์ ⑤ บน dept_requests: ยิงเฉพาะตอน "answeredAt" ของ
--    ใบประเมินพื้นที่ถูกล้าง (ดึงผลกลับ · "ยังไม่จบ") แล้ว UPDATE ตารางใหม่ซึ่งยังว่าง ⇒ วันนี้ไม่มีผลอะไร
--  ⚠ รันซ้ำได้ทั้งใบ
--  ⚠ **ก่อนรัน เจ้าของยืนยันวันที่มีผลของแบบฟอร์ม FM-TS-01 = 29/09/2569** (⑦) — แถวมาตรฐานที่เผยแพร่แล้วแก้ไม่ได้
--    (guard_document_standard_version · 0123/0136) วันที่ผิด = ต้องออกมาตรฐานฉบับใหม่ผ่านหน้าตั้งค่า
--  🔴 **รันบนฐานจริงแล้ว 01/10/2569 ในชื่อ 0399 — ไม่ต้องรันซ้ำ** · เปลี่ยนเลขไฟล์เป็น 0401 ตอนรวมเข้า main เพราะ 0399/0400 ของงานอื่นขึ้นไปก่อน
--    คำสั่ง SQL ไม่ได้แก้ ⇒ 'mig 0399' ใน COMMENT ของตาราง และ 'migration-0399' ในแถวมาตรฐาน (⑦) คงไว้ตามที่อยู่บนฐานจริง
-- ============================================================

BEGIN;

-- ── ① ตารางเอกสารที่ออกแล้ว — หนึ่งแถว = หนึ่งฉบับ (R) ของคำร้องหนึ่งใบ ────────────
--
-- 🔴 **ไม่มี FK ไปคำร้องโดยตั้งใจ** — เลขที่ที่ออกไปถึงลูกค้าแล้วห้ามหายตามคำร้อง (ลบดีล = คำร้องถูก force delete ·
--    lib/forceDelete.js) · แถวที่คำร้องหายไปแล้วไม่ถูกเสิร์ฟให้ใคร แต่เลขยังอยู่ให้ตัวนับ/ทะเบียนเห็น
-- ⭐ `snapshot` = ภาพนิ่งชุดเดียวของทั้งสองฉบับ (lib/service/surveyReportSnapshot.js · v1) — ฉบับลูกค้ากับฉบับภายใน
--    ต่างกันที่ "ตัวกรอง" (surveyReportView) ไม่ใช่ที่ข้อมูล ⇒ ไม่มีวันที่สองฉบับพูดตัวเลขไม่ตรงกัน
-- ⭐ `customerHtml` / `internalHtml` = กระดาษที่ตรึงแล้ว (เขียนครั้งเดียว) — ของจริงที่เสิร์ฟ · เรนเดอร์ใหม่จาก snapshot
--    เป็นทางกู้เมื่อเขียน HTML ไม่สำเร็จเท่านั้น · รูปอยู่ใน bucket (⑥) อ้างด้วย sha ⇒ แถวไม่บวมด้วย base64
-- ⭐ `approved*` = ผู้ตรวจสอบและอนุมัติ = คนที่ส่งผล (คัดจาก answeredBy* ของคำร้องใต้ล็อก · ④)
--    `issued*`   = คนที่กดให้เอกสารออก (ตอนส่งผล = คนเดียวกัน · ปุ่ม "ออกเอกสาร" ของใบเก่า = คนกด)
CREATE TABLE IF NOT EXISTS public.service_survey_reports (
  id                  text PRIMARY KEY,
  "requestId"         text NOT NULL,
  "baseNo"            text NOT NULL CHECK ("baseNo" ~ '^SU-[0-9]{8}$'),
  rev                 integer NOT NULL CHECK (rev >= 0),
  "docNo"             text NOT NULL UNIQUE,
  status              text NOT NULL DEFAULT 'current' CHECK (status IN ('current', 'superseded')),
  "supersededAt"      timestamptz,
  "supersededReason"  text CHECK ("supersededReason" IN ('recall', 'reopen')),
  snapshot            jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  images              jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(images) = 'array'),
  "customerHtml"      text,
  "internalHtml"      text,
  "rendererVersion"   text,
  "frozenAt"          timestamptz,
  "customerPdfPath"   text,
  "internalPdfPath"   text,
  "approvedById"      text,
  "approvedByName"    text,
  "approvedAt"        timestamptz NOT NULL,
  "issuedById"        text,
  "issuedByName"      text,
  "issuedAt"          timestamptz NOT NULL DEFAULT now(),
  "updatedAt"         timestamptz NOT NULL DEFAULT now(),
  UNIQUE ("requestId", rev),
  CHECK ("docNo" = "baseNo" || '-' || rev::text),
  CHECK ((status = 'superseded') = ("supersededAt" IS NOT NULL))
);

-- 🔴 ใบที่ใช้อยู่มีได้ **ใบเดียวต่อคำร้อง** — ตาข่ายของฐานเมื่อสองคำขอออกเอกสารพร้อมกัน (④ ตรวจให้ข้อความชัดก่อนแล้ว)
CREATE UNIQUE INDEX IF NOT EXISTS service_survey_reports_current_uidx
  ON public.service_survey_reports ("requestId") WHERE status = 'current';

COMMENT ON TABLE public.service_survey_reports IS
  'รายงานการประเมินพื้นที่ FM-TS-01 ที่ออกแล้ว (mig 0399) — หนึ่งแถวต่อฉบับ (R) · เลขที่ SU-YYMMXXXX-R · '
  'ภาพนิ่งเดียวสองฉบับ (ลูกค้า/ภายใน) · ไม่มี FK ไปคำร้อง · ลบไม่ได้ · เข้าผ่าน service_role เท่านั้น';
COMMENT ON COLUMN public.service_survey_reports."requestId" IS
  'dept_requests.id ของใบประเมินพื้นที่ — ไม่มี FK โดยเจตนา (ลบคำร้องแล้วเลขที่ที่ออกไปต้องอยู่)';
COMMENT ON COLUMN public.service_survey_reports."baseNo" IS
  'เลขฐาน SU-YYMMXXXX — ออกครั้งเดียวต่อคำร้อง (YYMM = เดือนที่ออกฉบับแรก · เลขรันตัดรอบรายปี) ฉบับถัดไปใช้เลขฐานเดิม';
COMMENT ON COLUMN public.service_survey_reports.status IS
  'current = ฉบับที่ใช้อยู่ · superseded = ถูกแทนที่ (ดึงผลกลับ/เปิดใบกลับ) — ทางเดียว ย้อนไม่ได้';
COMMENT ON COLUMN public.service_survey_reports.snapshot IS
  'ภาพนิ่ง v1 ของผลประเมิน ณ ตอนส่งผล (lib/service/surveyReportSnapshot.js) — แก้ไม่ได้ · ต้นทางของทั้งสองฉบับ';
COMMENT ON COLUMN public.service_survey_reports.images IS
  'รูปที่เอกสารใช้ [{sha, attId, kind, w, h, bytes}] — ไฟล์อยู่ที่ bucket survey-report/img/<sha>.jpg';
COMMENT ON COLUMN public.service_survey_reports."customerHtml" IS
  'กระดาษฉบับลูกค้าที่ตรึงแล้ว (รูปเป็น token su-img:<sha>) — NULL → ค่า ได้ครั้งเดียว';
COMMENT ON COLUMN public.service_survey_reports."internalHtml" IS
  'กระดาษฉบับภายในที่ตรึงแล้ว (ห้ามส่งลูกค้า) — NULL → ค่า ได้ครั้งเดียว';
COMMENT ON COLUMN public.service_survey_reports."approvedById" IS
  'ผู้ตรวจสอบและอนุมัติ = ผู้ส่งผล (คัดจาก dept_requests.answeredById ตอนออกเอกสาร) — ไม่ใช่ผู้กดออกเอกสาร';
COMMENT ON COLUMN public.service_survey_reports."issuedById" IS
  'ผู้กดให้เอกสารออก — ตอนส่งผล = ผู้ส่งผล · ปุ่มออกเอกสารของใบที่ส่งไปแล้ว = คนกด';

-- ── ② ยามที่ฐานถือ: ลบไม่ได้ · แก้ไม่ได้ ยกเว้นช่องที่ "เติมครั้งเดียว" ───────────────
--
-- ⚠️ ด่านฝั่ง API จะมีใน PR-2 แต่ยามที่นับได้คือยามที่ฐานถือ — สคริปต์ซ่อมข้อมูลรอบหน้าไม่รู้กติกาในโค้ด
--    (บทเรียนเดียวกับ issued_documents_guard 0130 · product_spec 0370)
-- 🔑 **คอลัมน์ทุกตัวแก้ไม่ได้ เว้นแต่ถูกเอ่ยชื่อ** — เทียบทั้งแถวผ่าน to_jsonb ⇒ คอลัมน์ที่เพิ่มวันหน้าถูกล็อกเอง
--    จนกว่าจะมีคนตั้งใจเติมชื่อลง v_once (เทสต์ surveyReportMigration ล็อกรายชื่อนี้)
--    · v_once  = NULL → ค่า ได้ครั้งเดียว: กระดาษตรึง · ที่อยู่ไฟล์ PDF · ตราการแทนที่
--    · status / "updatedAt" = เปลี่ยนได้ — status เดินทางเดียวเพราะ CHECK ผูกกับ "supersededAt" ที่เติมได้ครั้งเดียว
CREATE OR REPLACE FUNCTION public.guard_service_survey_report()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  o jsonb;
  n jsonb;
  k text;
  v_once text[] := ARRAY['customerHtml', 'internalHtml', 'rendererVersion', 'frozenAt',
                         'customerPdfPath', 'internalPdfPath', 'supersededAt', 'supersededReason'];
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'survey_report_delete_forbidden: %', OLD."docNo";
  END IF;
  o := to_jsonb(OLD) - 'status' - 'updatedAt';
  n := to_jsonb(NEW) - 'status' - 'updatedAt';
  FOR k IN SELECT jsonb_object_keys(o) LOOP
    IF n->k IS DISTINCT FROM o->k AND NOT (k = ANY (v_once) AND o->k = 'null'::jsonb) THEN
      RAISE EXCEPTION 'survey_report_immutable: % %', OLD."docNo", k;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS service_survey_reports_guard ON public.service_survey_reports;
CREATE TRIGGER service_survey_reports_guard
BEFORE UPDATE OR DELETE ON public.service_survey_reports
FOR EACH ROW EXECUTE FUNCTION public.guard_service_survey_report();

-- ── ③ ④ ออกเอกสาร: ออกเลข + เขียนแถวในทรานแซกชันเดียว ─────────────────────────────
--
-- ⭐ ออกเลขกับเขียนแถวอยู่ในฟังก์ชันเดียว — ล้มตรงไหนก็คืนเลข (บทเรียน RQ: จองเลขก่อนแล้วค่อยเขียน = เลขหาย
--    ทุกครั้งที่เขียนไม่ผ่าน · lib/requests/docNo.js) · สองคนกดพร้อมกันได้ฉบับเดียวเพราะล็อกแถวคำร้องก่อนอ่าน
--
-- 🔴 **ฟังก์ชันนี้ไม่ตอบคำร้องเอง** (ต่างจากแผนแรก) — PR-2 เรียกหลังจากเส้นส่งผลเดิมเขียนคำตอบสำเร็จแล้ว
--    (surveySendClose.js) ⇒ เส้นส่งผลที่ใช้อยู่จริงไม่ต้องวิ่งผ่าน SQL ใหม่ · ที่นี่ยืนยันใต้ล็อกว่า
--    "ยังเป็นคำตอบเดิม" ด้วย p_answered_at: ถูกดึงกลับ/ส่งใหม่คั่นกลาง = survey_answer_changed ไม่ออกเลข
--    · หลังส่งผลแล้วผลวัดถูกล็อก (surveyEditLockError) ⇒ ภาพนิ่งที่ผู้เรียกสร้างหลังคำตอบ = ของที่ส่งจริง
--    · ออกไม่สำเร็จ = ใบตอบแล้วแต่ยังไม่มีเอกสาร — ปุ่ม "ออกเอกสาร" (PR-2) คือทางกดซ้ำ
--
-- 🔴 **`YYMM` ในเลข ≠ ตัวตัดรอบของเลขรัน** — ตัวนับคีย์ด้วย **ปี** (scope 'SU' · month = 'YY')
--    ⇒ เลขเดินต่อข้ามเดือนภายในปี: SU-26090001 → SU-26100002 → (ปีใหม่) SU-27010001
--    🪤 กิ่ง seed (แถวตัวนับหาย) ต้องอ่านเลขของ **ทั้งปี** ไม่ใช่ของเดือนที่ส่งมา — ผูกกับ YYMM = ออกเลขซ้ำกับเดือนก่อน
--
--   p_report_id   id ของแถวใหม่ (ผู้เรียกสร้าง)
--   p_request_id  dept_requests.id ของใบประเมินพื้นที่
--   p_answered_at "answeredAt" ที่ผู้เรียกอ่านมาตอนสร้างภาพนิ่ง — ต้องตรงกับค่าปัจจุบันใต้ล็อก
--   p_yymm        เดือนที่ออก ตามนาฬิกาไทย (surveyReportYymm · lib/service/surveyReportNumber.js)
--   p_row         { snapshot, images, issuedById, issuedByName } — คีย์อื่นถูกทิ้ง
-- คืน: เลขที่เต็ม เช่น SU-26090001-0
CREATE OR REPLACE FUNCTION public.issue_survey_report(
  p_report_id   text,
  p_request_id  text,
  p_answered_at timestamptz,
  p_yymm        text,
  p_row         jsonb
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req  public.dept_requests%ROWTYPE;
  v_year text := left(p_yymm, 2);
  v_base text;
  v_rev  integer;
  v_seed integer := 0;
  v_no   integer;
BEGIN
  IF p_report_id IS NULL OR p_report_id = '' THEN
    RAISE EXCEPTION 'survey_report_id_required';
  END IF;
  IF p_yymm IS NULL OR p_yymm !~ '^[0-9]{2}(0[1-9]|1[0-2])$' THEN
    RAISE EXCEPTION 'survey_report_month_invalid: %', p_yymm;
  END IF;
  IF p_row IS NULL OR p_row->'snapshot' IS NULL OR jsonb_typeof(p_row->'snapshot') <> 'object' THEN
    RAISE EXCEPTION 'survey_report_snapshot_required';
  END IF;

  -- ล็อกแถวคำร้องก่อนอ่าน — ดึงผลกลับ/ส่งผลซ้ำ/ออกเอกสารซ้อนต้องรอกัน
  SELECT * INTO v_req FROM public.dept_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_req.kind <> 'site_survey' OR v_req."cancelledAt" IS NOT NULL THEN
    RAISE EXCEPTION 'survey_request_invalid: %', p_request_id;
  END IF;
  IF v_req."answeredAt" IS NULL OR v_req."answeredAt" IS DISTINCT FROM p_answered_at THEN
    RAISE EXCEPTION 'survey_answer_changed: %', p_request_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.service_survey_reports
              WHERE "requestId" = p_request_id AND status = 'current') THEN
    RAISE EXCEPTION 'survey_report_already_current: %', p_request_id;
  END IF;

  -- ฉบับแก้ไข: เลขฐานเดิม R ถัดไป — **ห้ามกินเลขรันใหม่** (สายฉบับขาด · เลขในทะเบียนกระโดด)
  SELECT "baseNo", rev + 1 INTO v_base, v_rev FROM public.service_survey_reports
   WHERE "requestId" = p_request_id ORDER BY rev DESC LIMIT 1;

  IF v_base IS NULL THEN
    -- ฉบับแรกของคำร้อง: กินเลขรันของปีนี้
    IF NOT EXISTS (SELECT 1 FROM public.entity_number_counters WHERE scope = 'SU' AND month = v_year) THEN
      SELECT COALESCE(max(right("baseNo", 4)::integer), 0) INTO v_seed
        FROM public.service_survey_reports
       WHERE "baseNo" LIKE 'SU-' || v_year || '%';
    END IF;

    INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
    VALUES ('SU', v_year, v_seed + 1)
    ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
    RETURNING "lastNo" INTO v_no;

    IF v_no > 9999 THEN RAISE EXCEPTION 'survey_report_sequence_exhausted: %', v_year; END IF;

    v_base := 'SU-' || p_yymm || lpad(v_no::text, 4, '0');
    v_rev := 0;
  END IF;

  INSERT INTO public.service_survey_reports (
    id, "requestId", "baseNo", rev, "docNo", snapshot, images,
    "approvedById", "approvedByName", "approvedAt", "issuedById", "issuedByName"
  ) VALUES (
    p_report_id, p_request_id, v_base, v_rev, v_base || '-' || v_rev::text,
    p_row->'snapshot', COALESCE(p_row->'images', '[]'::jsonb),
    v_req."answeredById", v_req."answeredByName", v_req."answeredAt",
    p_row->>'issuedById', p_row->>'issuedByName'
  );

  RETURN v_base || '-' || v_rev::text;
END;
$$;

REVOKE ALL ON FUNCTION public.issue_survey_report(text, text, timestamptz, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_survey_report(text, text, timestamptz, text, jsonb)
  TO service_role;

-- ── ⑤ ดึงผลกลับ / "ยังไม่จบ" = เอกสารที่ใช้อยู่ถูกแทนที่ ─────────────────────────────
--
-- ⭐ ทั้งสองเส้นล้าง "answeredAt" ของคำร้อง (recall/route.js · sa/requests/[id]/route.js action reopen)
--    ⇒ ผูกที่คอลัมน์นั้นตัวเดียว ครอบทุกเส้นทั้งที่มีอยู่และที่จะเพิ่มวันหน้า โดยไม่ต้องไล่แก้ route
-- ⚠️ เหตุ: "reopenedAt" เปลี่ยนในคำสั่งเดียวกัน = เปิดใบกลับ ('reopen') · ไม่เปลี่ยน = ดึงผลกลับ ('recall')
-- ⚠️ ฉบับถัดไป (R+1) ออกตอนส่งผลรอบใหม่ผ่าน ④ — ระหว่างนั้นคำร้องไม่มีใบที่ใช้อยู่ ซึ่งถูกต้อง:
--    ตัวเลขถูกดึงกลับไปแก้ เอกสารที่ลูกค้าถืออยู่ห้ามใช้
-- 🔴 ยิงเฉพาะหัวข้อ site_survey และเฉพาะ NOT NULL → NULL ⇒ คำร้องหัวข้ออื่นและการส่งผลไม่ถูกแตะ
CREATE OR REPLACE FUNCTION public.supersede_survey_reports_on_unanswer()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.service_survey_reports
     SET status = 'superseded', "supersededAt" = now(),
         "supersededReason" = CASE WHEN NEW."reopenedAt" IS DISTINCT FROM OLD."reopenedAt"
                                   THEN 'reopen' ELSE 'recall' END,
         "updatedAt" = now()
   WHERE "requestId" = NEW.id AND status = 'current';
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS dept_requests_supersede_survey_report ON public.dept_requests;
CREATE TRIGGER dept_requests_supersede_survey_report
AFTER UPDATE OF "answeredAt" ON public.dept_requests
FOR EACH ROW
WHEN (OLD."answeredAt" IS NOT NULL AND NEW."answeredAt" IS NULL AND NEW.kind = 'site_survey')
EXECUTE FUNCTION public.supersede_survey_reports_on_unanswer();

-- ── ⑥ ที่เก็บรูปและ PDF ของเอกสาร ─────────────────────────────────────────────────
--
-- bucket ส่วนตัว (แบบเดียวกับ issued-quotation-pdf · 0139): เข้าผ่าน service-role ในแอปเท่านั้น
--   img/<sha>.jpg — รูปที่ย่อแล้ว อ้างด้วยเนื้อไฟล์ (ฉบับถัดไปใช้รูปเดิมซ้ำได้ ไม่อัปซ้ำ)
--   pdf/…         — PDF ของแต่ละฉบับ
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('survey-report', 'survey-report', false, 52428800, ARRAY['image/jpeg', 'application/pdf'])
ON CONFLICT (id) DO UPDATE
  SET public = false,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── ⑦ มาตรฐานเอกสาร siteSurvey — FM-TS-01 Rev.00 (แบบเดียวกับ 0226 / 0370 ⑩) ───────
--
-- ⚠️ **คีย์ siteSurvey ยังไม่ถูกลงทะเบียนในโค้ด** (DOCUMENT_STANDARD_KEYS · **PR-3 ส่วน A** เป็นคนเติม — สเปก PR-2 มติ 28:
--    การลงทะเบียนทำให้แท็บใหม่โผล่ในหน้าตั้งค่าและต้องแก้ตัวเลือกสีของจอนั้น จึงไม่อยู่ใน PR-2) — หน้าตั้งค่ามาตรฐานเอกสาร
--    ไล่ตามรายชื่อคีย์ในโค้ด แถวที่ไม่อยู่ในรายชื่อถูกข้าม (lib/admin/documentStandards.js)
--    ⇒ seed ไว้ก่อนได้โดยไม่มีจอไหนเห็น · PR-3 เติมคีย์แล้วหน้าตั้งค่าไม่โยน root_missing
--    · PR-2 อ่านแถวที่เผยแพร่ของคีย์นี้ตรง ๆ เพื่อพิมพ์บรรทัดแบบฟอร์ม (lib/service/surveyReportInputs.js) — ไม่ผ่านรายชื่อคีย์
-- ⚠️ **รูปแบบเลขที่ไม่ได้ถูกใช้ออกเลข** — เลขจริงออกจาก issue_survey_report (④) · ที่นี่มีไว้ให้ทะเบียนครบ
--    และต้องผ่าน validateNumberingPattern ({REVISION} ปิดท้าย · มี token ปี) — เทสต์ล็อกไว้
-- ⚠️ ด่านจริงคือ WHERE NOT EXISTS ไม่ใช่การชน id (บทเรียน 0226: แถว published สองแถวทำให้ .maybeSingle() ล้มเงียบ)
-- 🔴 **วันที่มีผล 29/09/2569 — เจ้าของยืนยันก่อนรัน** (ดูหัวไฟล์)
INSERT INTO public.document_standards ("documentKey")
VALUES ('siteSurvey')
ON CONFLICT ("documentKey") DO NOTHING;

INSERT INTO public.document_standard_versions (
  id, "documentKey", "versionNumber", status,
  "titleTh", "titleEn", "formCode", revision, "effectiveDate", "accentKey", "numberingPattern",
  "changeNote", "createdById", "createdByName", "createdByRole",
  "updatedById", "updatedByName", "updatedByRole",
  "publishedById", "publishedByName", "publishedByRole", "publishedAt"
)
SELECT
  'document-standard-siteSurvey-v1', 'siteSurvey', 1, 'published',
  'รายงานการประเมินพื้นที่', 'SITE SURVEY REPORT',
  'FM-TS-01', '00', DATE '2026-09-29', 'teal',
  'SU-{YY}{MM}{RUNNING:4}-{REVISION}',
  'นำ FM-TS-01 Rev.00 (รายงานการประเมินพื้นที่) เข้าระบบเอกสารควบคุม',
  'migration-0399', 'Migration 0399', 'system',
  'migration-0399', 'Migration 0399', 'system',
  'migration-0399', 'Migration 0399', 'system', now()
WHERE NOT EXISTS (
  SELECT 1 FROM public.document_standard_versions WHERE "documentKey" = 'siteSurvey'
);

-- ⚠️ อ่าน id ของแถวที่เผยแพร่จริง ไม่ hardcode — ฐานที่ seed ผ่าน UI มาก่อนได้ id อื่น
UPDATE public.document_standards
   SET "publishedVersionId" = (
         SELECT id FROM public.document_standard_versions
          WHERE "documentKey" = 'siteSurvey' AND status = 'published'
          ORDER BY "versionNumber" DESC LIMIT 1
       ),
       "updatedAt" = now()
 WHERE "documentKey" = 'siteSurvey'
   AND "publishedVersionId" IS NULL;

-- ── ⑧ RLS + สิทธิ์: เข้าผ่าน service_role เท่านั้น เหมือนตารางเอกสารอื่นในระบบ ────────
-- ไม่มี policy โดยตั้งใจ — ฉบับภายในมีข้อมูลที่ห้ามถึงลูกค้า/ฝ่ายขาย · ใครอ่านฉบับไหนได้ตัดสินใน API (PR-2)
ALTER TABLE public.service_survey_reports ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_survey_reports FROM anon, authenticated;
GRANT ALL ON TABLE public.service_survey_reports TO service_role;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ============================================================
--  ตรวจหลังรัน:
--    SELECT count(*) FROM public.service_survey_reports;                              → 0
--    SELECT "documentKey", "publishedVersionId" FROM public.document_standards
--     WHERE "documentKey" = 'siteSurvey';                                             → document-standard-siteSurvey-v1
--    SELECT id, public FROM storage.buckets WHERE id = 'survey-report';               → false
--    SELECT tgname FROM pg_trigger WHERE tgname IN
--      ('service_survey_reports_guard', 'dept_requests_supersede_survey_report');     → 2 แถว
--    SELECT has_function_privilege('anon',
--      'public.issue_survey_report(text, text, timestamptz, text, jsonb)', 'EXECUTE'); → false
--
--  ── ย้อนกลับ (ถ้าต้อง) ──
--  ⚠️ ย้อนได้เฉพาะตอนยังไม่มีเอกสาร (service_survey_reports 0 แถว) — เลขที่ออกไปถึงลูกค้าแล้วห้ามลบ
--  ⚠️ ตัวนับ SU ปล่อยไว้ (ยาม 0241 ห้ามลบถ้าไม่ปลดล็อก · ตัวนับว่างไม่มีผลอะไร)
--  ⚠️ ห้ามลบแถวมาตรฐาน siteSurvey ที่ ⑦ seed ไว้ — ยาม guard_document_standard_version ตีกลับการลบแถวที่เผยแพร่แล้ว
--  DROP TRIGGER IF EXISTS dept_requests_supersede_survey_report ON public.dept_requests;
--  DROP FUNCTION IF EXISTS public.supersede_survey_reports_on_unanswer();
--  DROP FUNCTION IF EXISTS public.issue_survey_report(text, text, timestamptz, text, jsonb);
--  DROP TRIGGER IF EXISTS service_survey_reports_guard ON public.service_survey_reports;
--  DROP FUNCTION IF EXISTS public.guard_service_survey_report();
--  DROP TABLE IF EXISTS public.service_survey_reports;
-- ============================================================
