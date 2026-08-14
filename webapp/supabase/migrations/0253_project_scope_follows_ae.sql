-- ============================================================
--  Migration 0253: โครงการเก่าที่ "ผู้ดูแล (AE) มองไม่เห็นงานตัวเอง"
--
--  ที่มา: ลิสต์โครงการกรองด้วย `team` + `ownerId` เท่านั้น
--    (app/api/pm/projects/route.js — or(team.in.(ทีมของฉัน),ownerId.eq.ฉัน))
--  **ไม่ได้กรองด้วย `aeOwnerId`** แต่ POST /api/sa/projects เดิมเขียนสองช่องนั้นจาก
--  *คนกดสร้าง* ⇒ Admin สร้างโครงการแล้วเลือก AE ผู้ดูแลให้ ได้แถวที่ team = NULL
--  (admin ไม่อยู่ใน TEAM_ROLES จึงไม่มีทีมเลย) และ ownerId = admin
--  ⇒ AE เจ้าของงานไม่เห็นในลิสต์ตัวเอง · เปิดลิงก์ตรงก็ 403 · แก้ไม่ได้
--
--  โค้ดถูกแก้ให้เขียนทีม/เจ้าของตามผู้ดูแลแล้ว (lib/pm/projectOwner.js) — ไฟล์นี้
--  ตามเก็บ **แถวที่เกิดก่อนหน้านั้น** เท่านั้น
--
--  ⚠ แตะเฉพาะแถวที่ "มองไม่เห็นจริง" — โครงการที่ทีมของแถวครอบผู้ดูแลอยู่แล้ว
--    ไม่ถูกแตะ (ownerId ที่เป็นผู้สร้าง/ผู้ประสานในทีมเดียวกันยังใช้ได้ตามเดิม)
--  ⚠ ทีมของคนอ่านจาก auth.users.raw_app_meta_data — `teams[]` คือขอบเขต ส่วน `team`
--    คือทีมหลักที่ใช้ stamp ของใหม่ (แพตเทิร์นเดียวกับ userTeams()/primaryTeam())
--  ⚠ ไม่มี FK ไป auth.users ตามธรรมเนียมของสคีมานี้ ⇒ `aeOwnerId` ที่จับคู่บัญชีไม่ได้
--    (คนลาออกแล้ว) ปล่อยไว้เฉย ๆ ไม่เดาแทน — นับไว้ใน NOTICE ให้ตามเก็บด้วยมือ
--
--  ⚠⚠ **สองคอลัมน์นี้คนละชนิดกัน** — `projects."ownerId"` เป็น **uuid** (mig 0008 ·
--    ตารางเดียวในระบบที่เป็น uuid ที่เหลือเป็น text) ส่วน `"aeOwnerId"` เป็น **text**
--    (mig 0190) ⇒ เทียบ/เขียนตรง ๆ ได้ `42883: operator does not exist: uuid = text`
--    ต้อง `::uuid` ตอนเขียน และ `::text` ตอนเทียบ ทุกครั้งที่สองช่องนี้มาเจอกัน
--    (ค่าที่ cast ปลอดภัยเสมอที่นี่ เพราะทุกแถวที่ถูกแตะ JOIN กับ auth.users แล้ว)
--
--  รันซ้ำได้ (idempotent) · ไม่แตะโครงสร้าง
-- ============================================================

DO $$
DECLARE
  fixed_full  int;
  fixed_owner int;
  orphan      int;
BEGIN
  -- 1) ผู้ดูแลมีทีม แต่ทีมของโครงการไม่ครอบเขา → ย้ายทั้งทีมและเจ้าของตามผู้ดูแล
  WITH ae AS (
    SELECT
      u.id::text AS uid,
      nullif(btrim(coalesce(u.raw_app_meta_data->>'team', '')), '') AS primary_team,
      coalesce(
        (SELECT array_agg(t) FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(u.raw_app_meta_data->'teams') = 'array'
                THEN u.raw_app_meta_data->'teams' ELSE '[]'::jsonb END) AS t),
        ARRAY[]::text[]
      ) AS teams
    FROM auth.users u
  ),
  scoped AS (
    SELECT
      uid,
      -- ขอบเขต = ทุกทีมที่สังกัด (ถอยไปทีมหลักเมื่อ teams[] ว่าง)
      CASE WHEN array_length(teams, 1) > 0 THEN teams
           WHEN primary_team IS NOT NULL THEN ARRAY[primary_team]
           ELSE ARRAY[]::text[] END AS all_teams,
      -- ทีมที่จะ stamp ลงแถว = ทีมหลัก (ยอดไม่ถูกนับซ้ำสองทีม)
      coalesce(primary_team, teams[1]) AS attribution_team
    FROM ae
  ),
  target AS (
    SELECT p.id AS pid, s.attribution_team AS new_team, p."aeOwnerId" AS new_owner
    FROM public.projects p
    JOIN scoped s ON s.uid = p."aeOwnerId"
    WHERE p."aeOwnerId" IS NOT NULL
      AND coalesce(array_length(s.all_teams, 1), 0) > 0
      AND (p.team IS NULL OR NOT (p.team = ANY (s.all_teams)))
  )
  UPDATE public.projects p
     SET team = target.new_team,
         "ownerId" = target.new_owner::uuid
    FROM target
   WHERE p.id = target.pid;
  GET DIAGNOSTICS fixed_full = ROW_COUNT;

  -- 2) ผู้ดูแลยังไม่ถูกจัดทีมเลย → ทีมเดาไม่ได้ แต่ยังกู้ได้ด้วยสาขา `ownerId.eq.ฉัน`
  --    ของลิสต์ (แถวกลุ่มนี้ต้องตามไปจัดทีมให้บัญชีนั้นที่หน้าจัดการผู้ใช้)
  WITH ae AS (
    SELECT
      u.id::text AS uid,
      nullif(btrim(coalesce(u.raw_app_meta_data->>'team', '')), '') AS primary_team,
      coalesce(
        (SELECT array_agg(t) FROM jsonb_array_elements_text(
           CASE WHEN jsonb_typeof(u.raw_app_meta_data->'teams') = 'array'
                THEN u.raw_app_meta_data->'teams' ELSE '[]'::jsonb END) AS t),
        ARRAY[]::text[]
      ) AS teams
    FROM auth.users u
  ),
  teamless AS (
    SELECT uid FROM ae
     WHERE primary_team IS NULL AND coalesce(array_length(teams, 1), 0) = 0
  )
  UPDATE public.projects p
     SET "ownerId" = p."aeOwnerId"::uuid
    FROM teamless t
   WHERE t.uid = p."aeOwnerId"
     AND p."aeOwnerId" IS NOT NULL
     AND p."ownerId"::text IS DISTINCT FROM p."aeOwnerId";
  GET DIAGNOSTICS fixed_owner = ROW_COUNT;

  -- 3) เหลือแถวไร้ทีมที่ไม่มีผู้ดูแลให้ยึด = ต้องเปิดหน้าโครงการแล้วเลือก AE ด้วยมือ
  SELECT count(*) INTO orphan
    FROM public.projects p
   WHERE p.team IS NULL
     AND (p."aeOwnerId" IS NULL
          OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id::text = p."aeOwnerId"));

  RAISE NOTICE 'ย้ายทีม+เจ้าของตามผู้ดูแล: % แถว · ตั้งเจ้าของอย่างเดียว (ผู้ดูแลยังไม่มีทีม): % แถว · ยังต้องแก้ด้วยมือ: % แถว',
    fixed_full, fixed_owner, orphan;
END $$;

-- คิวรีตรวจหลังรัน (คัดลอกไปรันเองได้) — แถวที่เหลือคือกลุ่มที่ต้องแก้ด้วยมือ:
--   SELECT code, name, team, "ownerId", "aeOwner", "aeOwnerId"
--     FROM projects WHERE team IS NULL ORDER BY "createdAt" DESC;
