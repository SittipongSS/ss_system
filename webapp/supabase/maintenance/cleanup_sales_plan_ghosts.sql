-- ============================================================================
-- Sales Plan — เคลียร์ "ข้อมูลผี" (ghost data)
-- ----------------------------------------------------------------------------
-- ไฟล์นี้ "ไม่ใช่ migration" — เป็นสคริปต์ตรวจ/ล้างข้อมูลที่รันมือบน Supabase
-- (SQL editor) ของ prod. รันทีละ section, ดูผล SELECT ก่อนค่อยเปิด DELETE.
--
-- ลำดับแนะนำ:
--   1) รัน SECTION A ทั้งหมด (อ่านอย่างเดียว) เพื่อดูว่ามีผีจริงกี่แถว/แถวไหน
--   2) EXPORT/สำรองก่อน (Table editor > Export หรือ pg_dump) ถ้าต้องการกันพลาด
--   3) เปิดคอมเมนต์ DELETE ใน SECTION B เฉพาะเคสที่ยืนยันแล้ว แล้วรัน
-- ล้าง cache schema ไม่จำเป็น (ไม่แตะ schema).
-- ============================================================================


-- ============================================================================
-- SECTION A — DIAGNOSTICS (อ่านอย่างเดียว ปลอดภัย)
-- ============================================================================

-- A1. ดีลที่ owner/team ว่าง → ตกถัง "ไม่ระบุ"/"unassigned" บน dashboard
SELECT id, title, stage, "ownerId", "ownerName", team, "projectValue", "forecastMonth",
       (metadata->>'source') AS source, "createdAt"
FROM sales_deals
WHERE "ownerId" IS NULL OR team IS NULL
ORDER BY "createdAt" DESC;

-- A2. ดีลที่สร้างอัตโนมัติจาก FC สหมิตร (ตรวจว่าเป็นของจริงหรือรอบทดสอบ)
SELECT id, title, stage, "ownerName", team, "projectValue", "forecastMonth",
       (metadata->>'sahamitForecastRoundNo') AS round_no,
       (metadata->>'sahamitDemandMonth')    AS demand_month,
       (metadata->>'syncedAt')              AS synced_at
FROM sales_deals
WHERE metadata->>'source' = 'sahamit-forecast'
ORDER BY "createdAt" DESC;

-- A3. ดีล FC "ซ้ำ": รอบเดียวกัน + เดือน demand เดียวกัน + owner เดียวกัน แต่มี > 1 ใบ
--     (เกิดจาก assignee เปลี่ยนแล้ว re-sync ในเวอร์ชันก่อนแก้ / กดสร้างซ้ำ)
SELECT metadata->>'sahamitForecastRoundId' AS round_id,
       metadata->>'sahamitDemandMonth'     AS demand_month,
       "ownerName",
       count(*)                            AS dup_count,
       array_agg(id ORDER BY "createdAt")  AS deal_ids
FROM sales_deals
WHERE metadata->>'source' = 'sahamit-forecast'
GROUP BY 1, 2, 3
HAVING count(*) > 1
ORDER BY dup_count DESC;

-- A4. ดีลมูลค่า 0 (projectValue = 0/NULL) ที่ยัง open — มักเป็น line ราคายังไม่ backfill
SELECT id, title, stage, "ownerName", team, "projectValue", "forecastMonth",
       (metadata->>'source') AS source
FROM sales_deals
WHERE COALESCE("projectValue", 0) = 0
  AND stage NOT IN ('won', 'in_project', 'lost')
ORDER BY "createdAt" DESC;

-- A5. target ที่ค่าเป็น 0/NULL → สร้าง "แถวว่าง" บน dashboard (แก้แล้วฝั่งโค้ด แต่ควรลบทิ้ง)
SELECT id, "targetMonth", team, "ownerId", "ownerName", "targetAmount"
FROM sales_targets
WHERE COALESCE("targetAmount", 0) = 0
ORDER BY "targetMonth" DESC;

-- A6. ทีมที่มี target ทั้งแบบ team-level (ownerId ว่าง) และรายคนในเดือนเดียวกัน
--     → เดิมทำให้เป้าเบิ้ล (แก้แล้วฝั่งโค้ด). ตรวจว่าตั้งใจไว้แบบใดแบบเดียว
SELECT "targetMonth", team,
       count(*) FILTER (WHERE "ownerId" IS NULL) AS team_level_rows,
       count(*) FILTER (WHERE "ownerId" IS NOT NULL) AS per_person_rows
FROM sales_targets
GROUP BY 1, 2
HAVING count(*) FILTER (WHERE "ownerId" IS NULL) > 0
   AND count(*) FILTER (WHERE "ownerId" IS NOT NULL) > 0
ORDER BY "targetMonth" DESC;

-- A7. junction FC-line ที่ชี้ไปดีลที่ถูกลบไปแล้ว (orphan) — ถ้ามี FK cascade จะเป็น 0
SELECT sdfl.id, sdfl."dealId", sdfl."forecastLineId", sdfl."fgCode", sdfl."demandMonth"
FROM sales_deal_forecast_lines sdfl
LEFT JOIN sales_deals d ON d.id = sdfl."dealId"
WHERE d.id IS NULL;


-- ============================================================================
-- SECTION B — CLEANUP (อันตราย: เปิดคอมเมนต์เฉพาะเคสที่ยืนยันจาก SECTION A แล้ว)
--   *** สำรองข้อมูลก่อนรันทุกครั้ง ***
--   ตาราง sales_deal_activities / sales_deal_stage_history / sales_deal_forecasts /
--   sales_deal_forecast_lines อ้าง dealId — ตรวจว่า FK เป็น ON DELETE CASCADE ไหม
--   (โปรเจกต์นี้ FK ไม่สม่ำเสมอ) ถ้าไม่ cascade ให้ลบลูกก่อนตามบล็อก B0
-- ============================================================================

-- B0. (ถ้า FK ไม่ cascade) ลบ record ลูกของดีลที่จะลบก่อน — แทน :ids ด้วยรายการ id จริง
-- DELETE FROM sales_deal_forecast_lines  WHERE "dealId" IN (:ids);
-- DELETE FROM sales_deal_forecasts       WHERE "dealId" IN (:ids);
-- DELETE FROM sales_deal_stage_history   WHERE "dealId" IN (:ids);
-- DELETE FROM sales_deal_activities      WHERE "dealId" IN (:ids);

-- B1. ลบดีลทดสอบ/ผี ตาม id ที่คัดจาก A1–A4 (ระบุ id ชัดเจน — อย่าลบเหมารวม)
-- DELETE FROM sales_deals WHERE id IN ('DEAL_xxx', 'DEAL_yyy');

-- B2. ลบดีล FC ซ้ำ โดยเก็บใบเก่าสุด (createdAt น้อยสุด) ต่อ (round, demand, owner)
--     *** ตรวจผล SELECT ด้านในก่อน แล้วค่อยเปลี่ยนเป็น DELETE ***
-- WITH ranked AS (
--   SELECT id,
--          row_number() OVER (
--            PARTITION BY metadata->>'sahamitForecastRoundId',
--                         metadata->>'sahamitDemandMonth',
--                         "ownerName"
--            ORDER BY "createdAt"
--          ) AS rn
--   FROM sales_deals
--   WHERE metadata->>'source' = 'sahamit-forecast'
--     AND stage NOT IN ('won', 'in_project')   -- อย่าแตะดีลที่ปิดได้แล้ว
-- )
-- SELECT * FROM ranked WHERE rn > 1;            -- << ดูก่อน
-- -- DELETE FROM sales_deals WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- B3. ลบ target ค่า 0 (จาก A5)
-- DELETE FROM sales_targets WHERE COALESCE("targetAmount", 0) = 0;

-- B4. ลบ junction orphan (จาก A7)
-- DELETE FROM sales_deal_forecast_lines sdfl
-- WHERE NOT EXISTS (SELECT 1 FROM sales_deals d WHERE d.id = sdfl."dealId");
