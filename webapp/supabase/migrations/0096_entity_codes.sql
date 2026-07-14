-- 0096 - รหัสเอนทิตีมาตรฐาน: DL-YYMMXXXX (ดีล) + PJ-YYMMXXXX (โครงการ)
--   YY=ปี ค.ศ. 2 หลัก, MM=เดือน, XXXX=เลขรัน 4 หลัก (atomic ต่อ scope+เดือน).
--   รหัสที่ "เก็บใน DB" = ฐาน (base) ไม่มี -R; ฝั่งแอปแสดงเป็น base + '-' + revision
--   (revise เริ่ม 0, เพิ่มเมื่อออก Revise — โครงการ; ดีลคง 0 เสมอ). มติผู้ใช้ 2026-07-14.
-- ⚠ รันมือบน Supabase (เหมือน migration อื่น). เปลี่ยนเลขโครงการเก่า "ทั้งหมด" ด้วย
--   (เก็บโค้ดเดิมไว้ที่ metadata.legacyCode). แนะนำ backup ก่อนรัน.

-- ── counter ต่อ (scope, เดือน) แบบ atomic (pattern เดียวกับ quote_number_counters) ──
CREATE TABLE IF NOT EXISTS public.entity_number_counters (
  scope   text NOT NULL,           -- 'PJ' | 'DL'
  month   text NOT NULL,           -- 'YYMM'
  "lastNo" integer NOT NULL DEFAULT 0,
  PRIMARY KEY (scope, month)
);
ALTER TABLE public.entity_number_counters ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.next_entity_number(p_scope text, p_month text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.entity_number_counters AS c (scope, month, "lastNo")
  VALUES (p_scope, p_month, 1)
  ON CONFLICT (scope, month) DO UPDATE SET "lastNo" = c."lastNo" + 1
  RETURNING "lastNo";
$$;

-- ── ดีล: เพิ่มคอลัมน์ code (ฐาน) + unique ──
ALTER TABLE public.sales_deals ADD COLUMN IF NOT EXISTS "code" text;
CREATE UNIQUE INDEX IF NOT EXISTS sales_deals_code_key
  ON public.sales_deals ("code") WHERE "code" IS NOT NULL;

-- backfill รหัสดีลเดิม: DL-YYMMXXXX ไล่ตาม createdAt ต่อเดือน
WITH d AS (
  SELECT id,
    to_char("createdAt", 'YYMM') AS mm,
    row_number() OVER (PARTITION BY to_char("createdAt", 'YYMM') ORDER BY "createdAt", id) AS rn
  FROM public.sales_deals WHERE "code" IS NULL
)
UPDATE public.sales_deals s
SET "code" = 'DL-' || d.mm || lpad(d.rn::text, 4, '0')
FROM d WHERE s.id = d.id;

-- sync counter จากรหัสดีลที่ backfill
INSERT INTO public.entity_number_counters (scope, month, "lastNo")
SELECT 'DL', substring("code" from 4 for 4), max(substring("code" from 8)::int)
FROM public.sales_deals WHERE "code" ~ '^DL-\d{8}$'
GROUP BY 2
ON CONFLICT (scope, month) DO UPDATE
  SET "lastNo" = GREATEST(public.entity_number_counters."lastNo", EXCLUDED."lastNo");

-- ── โครงการ: เปลี่ยนเลขเก่าทั้งหมดเป็น PJ-YYMMXXXX (เก็บของเดิมที่ metadata.legacyCode) ──
WITH p AS (
  SELECT id,
    to_char("createdAt", 'YYMM') AS mm,
    row_number() OVER (PARTITION BY to_char("createdAt", 'YYMM') ORDER BY "createdAt", id) AS rn
  FROM public.projects
)
UPDATE public.projects pr
SET metadata = jsonb_set(COALESCE(pr.metadata, '{}'::jsonb), '{legacyCode}', to_jsonb(pr."code")),
    "code" = 'PJ-' || p.mm || lpad(p.rn::text, 4, '0')
FROM p WHERE pr.id = p.id;

INSERT INTO public.entity_number_counters (scope, month, "lastNo")
SELECT 'PJ', substring("code" from 4 for 4), max(substring("code" from 8)::int)
FROM public.projects WHERE "code" ~ '^PJ-\d{8}$'
GROUP BY 2
ON CONFLICT (scope, month) DO UPDATE
  SET "lastNo" = GREATEST(public.entity_number_counters."lastNo", EXCLUDED."lastNo");

NOTIFY pgrst, 'reload schema';
