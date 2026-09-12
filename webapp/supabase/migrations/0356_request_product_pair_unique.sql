-- ============================================================
--  Migration 0356: แถวงานพัฒนาสูตร 1 แถวต้นทางต่อคู่ หมวด × กลิ่น ต่อใบ — ด่านที่ DB (ม-144)
--
--  🐞 **กดรับเรื่องใบ NPD พร้อมกันสองคน = แถวงานซ้ำทุกคู่** — ตัวเขียนแถว (`applyNpdWorkRows`)
--    อ่านแถวสดก่อนงอก แต่ PostgREST ไม่มี transaction ⇒ สองคำขอที่อ่านทันกันยังงอกคู่เดียวกัน
--    ได้ทั้งคู่ · บันทึกแบบฟอร์ม PDR พร้อมกันสองคนเป็นรูเดียวกัน · แถวต้นทางของ NPD ลบที่แถว
--    ไม่ได้ (ต้องเอาออกจากแบบฟอร์ม) ⇒ ซ้ำแล้วค้างถาวร และสูตรตัวที่สองชนตัวตนสูตรส่งไม่ได้
--
--  ⭐ **ขอบเขตของดัชนี = แถวที่ห้ามซ้ำจริงเท่านั้น**
--    · `lineKind = 'product_dev'` — แถวของหัวข้ออื่นมีตัวตนคนละแบบ
--    · `derivedFromItemId IS NULL` — **แถวรอบแก้ใช้คู่เดียวกับแถวต้นทางโดยตั้งใจ** (ลูกค้าขอแก้ =
--      ของชิ้นใหม่ของคู่เดิม · `followUpRowFrom`)
--    · `ackAt IS NOT NULL` — **แถวก่อนรับเรื่องไม่นับ**: ใบร่าง/รอรับเรื่องแก้บรรทัดได้และตัวเขียน
--      อัปเดตทีละแถว ⇒ สลับหมวด/กลิ่นระหว่างสองแถวในการบันทึกเดียวจะชนกันชั่วคราวกลางทาง
--      (ด่านฟอร์ม `normalizeProductDevItems` กันคู่ซ้ำของชุดสุดท้ายไว้แล้ว) · ตอนรับเรื่อง
--      `ackFanOut` ประทับ ackAt ทั้งใบ ⇒ แถวเข้าดัชนีพร้อมกันด้วยคู่ที่ไม่ซ้ำอยู่แล้ว
--      · แถว NPD เกิดพร้อม ackAt เสมอ (บทเรียน DC-26080003) ⇒ อยู่ในดัชนีตั้งแต่เกิด
--
--  🔑 ชนแล้วตัวเขียนแถวไม่โยน error ใส่ผู้ใช้ — `insertNpdWorkRows` อ่านใหม่แล้วเติมเฉพาะคู่ที่ยังขาด
--    (อีกคำขอเขียนไปแล้ว = ผลลัพธ์ที่ต้องการอยู่แล้ว)
--
--  ✅ ข้อมูล prod ณ วันเขียน (11/09/2026): แถว product_dev 28 แถว · แถวต้นทาง 25 · คู่ซ้ำ **0**
--    ⇒ สร้างดัชนีได้ทันที · บล็อกตรวจข้างล่างหยุดพร้อมบอกคู่ที่ซ้ำ ถ้าวันที่รันมีข้อมูลซ้ำเกิดขึ้นแล้ว
--  ✅ รันซ้ำได้ (DROP แล้ว CREATE — `IF NOT EXISTS` เทียบแค่ชื่อ บทเรียน mig 0181/0182)
--  ⚠️ โค้ดไม่พึ่งดัชนีนี้ในการทำงานปกติ ⇒ deploy ก่อนหรือหลังรันก็ได้ · ไม่รัน = รูเดิมยังอยู่เท่านั้น
-- ============================================================

BEGIN;

DO $$
DECLARE dup record;
BEGIN
  FOR dup IN
    SELECT "requestId", "categoryCode", "scentId", count(*) AS n
      FROM public.dept_request_items
     WHERE "lineKind" = 'product_dev' AND "derivedFromItemId" IS NULL AND "ackAt" IS NOT NULL
     GROUP BY 1, 2, 3
    HAVING count(*) > 1
  LOOP
    RAISE EXCEPTION 'แถวงานซ้ำ: ใบ % คู่ % × % มี % แถว — รวม/ลบแถวซ้ำก่อนรันไฟล์นี้',
      dup."requestId", dup."categoryCode", dup."scentId", dup.n;
  END LOOP;
END $$;

DROP INDEX IF EXISTS public.dept_request_items_product_pair_uk;
CREATE UNIQUE INDEX dept_request_items_product_pair_uk
  ON public.dept_request_items ("requestId", "categoryCode", "scentId")
  WHERE "lineKind" = 'product_dev' AND "derivedFromItemId" IS NULL AND "ackAt" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ──────────────────────────────────────────────────────────
-- SELECT indexdef FROM pg_indexes WHERE indexname = 'dept_request_items_product_pair_uk';  -- 1 แถว
