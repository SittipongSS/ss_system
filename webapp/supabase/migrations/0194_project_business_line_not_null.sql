-- 0194: ปิดประตูสายธุรกิจ — projects.line ห้ามว่างอีกต่อไป
--
-- mig 0191 เปิดคอลัมน์ไว้แบบ nullable **โดยเจตนา** เพราะตอนนั้นโครงการเก่า 13 ใบ
-- ยังไม่มีใครเลือกสาย · ห้ามใส่ default เด็ดขาด (นั่นคือสาเหตุที่ projects.type ตาย
-- — ทุกใบเป็น 'NPD' หมดเพราะไม่มีใครต้องเลือก)
--
-- ตอนนี้คนเลือกครบแล้ว + ฟอร์มและ API บังคับเลือกตั้งแต่ #900 ⇒ ปิดที่ DB เป็นชั้น
-- สุดท้าย · ต่อจากนี้ตัวนับ "ยังไม่ระบุสาย" จะเป็น 0 ตลอดกาล และตัวมันเองกลายเป็น
-- เครื่องยืนยันว่าไม่มีทางหลุด แทนที่จะเป็นแค่รายการงานค้าง
--
-- ⚠️ migration นี้ **ไม่เดาค่าให้ใคร** — ถ้ายังมีแถวที่ว่างอยู่ มันจะหยุดพร้อมบอกรหัส
--    โครงการที่ค้าง ให้ไปเลือกที่หน้า /sa/projects ก่อน แล้วค่อยรันซ้ำ

BEGIN;

DO $$
DECLARE
  pending text;
BEGIN
  SELECT string_agg(code, ', ' ORDER BY code) INTO pending
  FROM public.projects
  WHERE line IS NULL;

  IF pending IS NOT NULL THEN
    RAISE EXCEPTION
      'ยังมีโครงการที่ไม่ได้เลือกสายธุรกิจ: % — ไปเลือกที่หน้า /sa/projects ก่อน แล้วรัน migration นี้ซ้ำ (ห้ามเดาค่าแทน)',
      pending;
  END IF;
END $$;

ALTER TABLE public.projects
  ALTER COLUMN line SET NOT NULL;

-- ดัชนีของ 0191 ไล่หา "แถวที่ยังไม่ระบุสาย" ซึ่งต่อจากนี้ว่างถาวร ⇒ ทิ้ง
-- แล้วเปลี่ยนเป็นดัชนีที่ใช้จริง: ไล่โครงการตามสาย (หน้ารวม + คิวส่งต่อ TS)
DROP INDEX IF EXISTS projects_line_unset_idx;
CREATE INDEX IF NOT EXISTS projects_line_idx ON public.projects (line);

COMMENT ON COLUMN public.projects.line IS
  'สายธุรกิจของโครงการ: PRODUCT = ส่งมอบของแล้วจบ · SERVICE = ส่งมอบแล้วมีรอบดูแลต่อ. NOT NULL ตั้งแต่ mig 0194 — ห้ามใส่ default (ดู 0191)';

COMMIT;
