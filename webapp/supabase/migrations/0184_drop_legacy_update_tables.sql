-- ============================================================
--  Migration 0184: ลบตารางเธรดเก่า 2 ตัวที่ไม่มีใครอ่าน/เขียนแล้ว
--
--  ปิดขั้นสุดท้ายของแผน entity_updates (docs/entity-updates-plan.md ข้อ 8)
--  ระบบเคยมีเธรด "ความเคลื่อนไหว" 4 ชุดต่างคนต่างทำ · ตอนนี้ทุกชุดอ่าน/เขียนที่
--  `entity_updates` แล้ว (8 entity) เหลือแต่ซากตาราง:
--
--    personal_task_updates (0113) — backfill เข้าของกลางตอน 0163 · prod ยืนยันแล้ว
--                                   573 = 573 แถว · โค้ดเลิกเขียนตั้งแต่ #740
--    sales_deal_activities (0063) — backfill ตอน 0172 · prod = **0 แถว**
--                                   โค้ดเลิกเขียนตั้งแต่ #777
--    inquiry_messages      (0104) — DROP ไปแล้วใน 0174 พร้อมโมดูลสอบถาม
--    mgmt_updates          (0080) — **ไม่เคยมีบน prod** (โมดูลงานบริหารพักไว้)
--                                   → migration นี้ไม่แตะ ปล่อยตามโมดูล
--
--  ⚠ ลำดับ deploy: **merge → รอ deploy → ค่อยรัน SQL** (แพตเทิร์นเดียวกับ 0174)
--    ไม่มีโค้ด prod อ่านสองตารางนี้อยู่แล้ว จึงรันช้าได้ไม่กระทบใคร แต่ห้ามรันก่อน
--    เพราะ revert โค้ดฉุกเฉินจะไม่มีตาข่ายให้ถอยกลับ
--
--  ⚠ ตรวจแล้วก่อนเขียน: ไม่มี FK ชี้เข้าสองตารางนี้ · ไม่มี RPC ที่เอ่ยชื่อไว้ใน
--    เนื้อฟังก์ชัน (กับดักของ 0173 ที่ `ALTER TABLE RENAME` ไม่แก้ให้ และ plpgsql
--    ไม่ตรวจตอน CREATE) · ไม่มี `.from('<ชื่อตาราง>')` ในโค้ดเลยแม้แต่จุดเดียว
--
--  ⭐ **migration นี้ตรวจตัวเองก่อนลบ** — ไม่ใช่คอมเมนต์ "ตรวจก่อนนะ" ที่ไม่มีใครอ่าน
--     ถ้ายังมีแถวที่ *ยังไม่ถูกย้าย* และงานแม่ยังอยู่ → RAISE EXCEPTION แล้ว
--     rollback ทั้งก้อน ไม่ลบอะไรเลย
-- ============================================================
BEGIN;

-- ── personal_task_updates ────────────────────────────────────────────────
DO $$
DECLARE
  missing_cnt int;
  total_cnt   int;
BEGIN
  IF to_regclass('public.personal_task_updates') IS NULL THEN
    RAISE NOTICE '0184: personal_task_updates ไม่มีอยู่แล้ว — ข้าม';
  ELSE
    SELECT count(*) INTO total_cnt FROM public.personal_task_updates;

    -- นับเฉพาะแถวที่ "ยังไม่อยู่ในของกลาง **และงานแม่ยังอยู่**"
    --
    -- ⚠️ ทำไมต้องมีเงื่อนไข "งานแม่ยังอยู่": ตั้งแต่ย้ายมาของกลาง งานที่ถูกลบจะถูก
    -- `purgeUpdates` กวาดเธรดออกจาก entity_updates แต่แถวในตารางเก่าไม่มีใครกวาด
    -- (ไม่มี FK — ดู 0113) → เทียบยอดรวมตรง ๆ จะไม่เท่ากันเป็นเรื่องปกติ แล้วด่านนี้
    -- จะบล็อกทั้งที่ไม่มีอะไรผิด
    SELECT count(*) INTO missing_cnt
      FROM public.personal_task_updates u
     WHERE NOT EXISTS (SELECT 1 FROM public.entity_updates e WHERE e.id = u.id)
       AND EXISTS (SELECT 1 FROM public.personal_tasks t WHERE t.id = u."taskId");

    IF missing_cnt > 0 THEN
      RAISE EXCEPTION
        '0184 หยุด: personal_task_updates มี % แถวที่ยังไม่อยู่ใน entity_updates (จากทั้งหมด %) และงานแม่ยังอยู่ — ห้ามลบ ให้ backfill ของ 0163 อีกรอบก่อน',
        missing_cnt, total_cnt;
    END IF;

    RAISE NOTICE '0184: ลบ personal_task_updates (% แถว ย้ายครบแล้ว)', total_cnt;
    DROP TABLE public.personal_task_updates;
  END IF;
END $$;

-- ── sales_deal_activities ────────────────────────────────────────────────
DO $$
DECLARE
  missing_cnt int;
  total_cnt   int;
BEGIN
  IF to_regclass('public.sales_deal_activities') IS NULL THEN
    RAISE NOTICE '0184: sales_deal_activities ไม่มีอยู่แล้ว — ข้าม';
  ELSE
    SELECT count(*) INTO total_cnt FROM public.sales_deal_activities;

    -- ตารางนี้มี FK ON DELETE CASCADE ไป sales_deals จริง (ต่างจาก 0113) →
    -- แถวที่ดีลถูกลบหายไปเองแล้ว ไม่ต้องกันเคส "ดีลแม่หายไป"
    SELECT count(*) INTO missing_cnt
      FROM public.sales_deal_activities a
     WHERE NOT EXISTS (SELECT 1 FROM public.entity_updates e WHERE e.id = a.id);

    IF missing_cnt > 0 THEN
      RAISE EXCEPTION
        '0184 หยุด: sales_deal_activities มี % แถวที่ยังไม่อยู่ใน entity_updates (จากทั้งหมด %) — ห้ามลบ ให้ backfill ของ 0172 อีกรอบก่อน',
        missing_cnt, total_cnt;
    END IF;

    RAISE NOTICE '0184: ลบ sales_deal_activities (% แถว)', total_cnt;
    DROP TABLE public.sales_deal_activities;
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน (ต้องได้ 0 ทั้งสองแถว) ──────────────────────────────────
--   SELECT to_regclass('public.personal_task_updates') AS ตารางงานเก่า,
--          to_regclass('public.sales_deal_activities') AS ตารางฟีดดีลเก่า;
--   -- ทั้งคู่ต้องเป็น NULL
--
--   SELECT "entityType", count(*) FROM public.entity_updates
--    GROUP BY 1 ORDER BY 2 DESC;
--   -- personal_task ต้องยังอยู่ครบ (ก่อนรันเคยได้ 573 + ที่โพสต์ใหม่)
--
-- Rollback: ไม่มี — ตารางถูกลบพร้อมข้อมูล · ของกลางถือข้อมูลชุดเดียวกันอยู่แล้ว
-- (ด่านด้านบนเป็นตัวยืนยันก่อนลบ) · ถ้าต้องถอยจริงให้สร้างตารางตาม 0113/0063
-- แล้ว copy กลับจาก entity_updates ตามสูตร Rollback ที่เขียนไว้ท้ายไฟล์ 0163
