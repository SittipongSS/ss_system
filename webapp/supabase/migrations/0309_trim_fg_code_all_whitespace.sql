-- ============================================================
--  Migration 0309: ล้าง fgCode ให้ครบ — 0307 ตัดเฉพาะ "ช่องว่าง" ไม่ตัดแท็บ
--
--  🐞 **0307 รันผ่านแล้วสองรอบ แต่แก้ได้ 0 แถว** — เพราะเขียนว่า `btrim("fgCode")`
--     แบบอาร์กิวเมนต์เดียว ซึ่ง Postgres นิยามว่า *"removes the longest string
--     containing only characters in `characters` (**a space by default**)"*
--     ⇒ ตัดเฉพาะ U+0020 เท่านั้น **ไม่ตัดแท็บ**
--
--     ของสกปรกจริงบนฐานเป็น **แท็บล้วน**:
--       products              53/344  — 52 แถวลงท้าย U+0009 U+0009
--                                        1 แถวขึ้นต้น "\t FG-424-02-020-1489"
--       excise_registrations  15/17   — ลงท้าย U+0009 U+0009
--     ⇒ `WHERE "fgCode" <> btrim("fgCode")` เป็นเท็จทุกแถว = ไม่มีอะไรถูกแก้
--
--  🪤 **และ CHECK ของ 0307 ก็ไร้ผลด้วยเหตุเดียวกัน** — `"fgCode" = btrim("fgCode")`
--     เป็นจริงสำหรับรหัสที่มีแท็บต่อท้าย ⇒ `validate constraint` ผ่านฉลุยทั้งที่
--     ข้อมูลยังสกปรก · ด่านที่ตั้งใจให้กันของใหม่จึงกันอะไรไม่ได้เลย
--     ใบนี้เปลี่ยนทั้งการล้างและตัว CHECK ให้ใช้กฎเดียวกันคือ **ช่องว่างทุกชนิด**
--
--  ⚠️ ระบุชุดอักขระตรง ๆ (` \t\n\r\f\v`) ไม่ใช้ค่าเริ่มต้น — ตั้งใจให้อ่านแล้วเห็น
--     ทันทีว่าตัดอะไรบ้าง เพราะค่าเริ่มต้นของ btrim คือกับดักที่ทำให้ใบก่อนเป็นหมัน
--     (ตรวจ codepoint จริงบนฐานแล้ว: มีแต่ U+0009 กับ U+0020 ไม่มี U+00A0)
--
--  ⚠️ ตัดเฉพาะ **หัวท้าย** ไม่แตะช่องว่างกลางรหัส (เหตุผลเดิมจาก 0307)
--
--  ⚠️ ล้าง **สองตาราง** — `excise_registrations.fgCode` เป็นสำเนาที่ตรึงตอนขึ้น
--     ทะเบียน ไม่ได้อ่านจาก products ตอนแสดงผล
--
--  ✅ trigger บนตารางที่แตะ: `products_first_approved_stamp` (0248) ไม่ RAISE
--     แค่ประทับ firstApprovedAt · แถวสกปรกทั้ง 53 มีค่านั้นอยู่แล้ว ⇒ คืนค่าเดิม
--     `excise_registrations` ไม่มี trigger
--
--  Idempotent (รันซ้ำได้)
-- ============================================================

BEGIN;

-- ชุดอักขระที่ถือว่าเป็น "ช่องว่าง" — ต้องตรงกันทั้งตอนล้างและตอน CHECK
--   space · tab · newline · carriage return · form feed · vertical tab

DO $$
DECLARE
  clash_count integer;
BEGIN
  -- กันเคสที่ตัดแล้วรหัสชนกันเอง (มี = ข้อมูลซ้ำจริง ต้องรวมด้วยมือ)
  SELECT count(*) INTO clash_count
  FROM (
    SELECT btrim("fgCode", E' \t\n\r\f\v') AS code
    FROM public.products
    WHERE "fgCode" IS NOT NULL AND btrim("fgCode", E' \t\n\r\f\v') <> ''
    GROUP BY btrim("fgCode", E' \t\n\r\f\v')
    HAVING count(*) > 1
  ) dups;

  IF clash_count > 0 THEN
    RAISE EXCEPTION
      'ล้าง fgCode ไม่ได้: มี % รหัสที่ตัดช่องว่างแล้วซ้ำกันเอง — ต้องรวมสินค้าซ้ำด้วยมือก่อน',
      clash_count;
  END IF;
END $$;

-- ── 1) ถอด CHECK ของ 0307 ที่ใช้กฎผิดออกก่อน ────────────────────────────
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_fg_code_trimmed;

-- ── 2) ล้างจริง ─────────────────────────────────────────────────────────
UPDATE public.products
SET "fgCode" = btrim("fgCode", E' \t\n\r\f\v')
WHERE "fgCode" IS NOT NULL AND "fgCode" <> btrim("fgCode", E' \t\n\r\f\v');

UPDATE public.excise_registrations
SET "fgCode" = btrim("fgCode", E' \t\n\r\f\v'),
    "updatedAt" = "updatedAt"   -- ไม่ขยับเวลาแก้ไข: นี่คือการล้างข้อมูล ไม่ใช่การแก้ใบ
WHERE "fgCode" IS NOT NULL AND "fgCode" <> btrim("fgCode", E' \t\n\r\f\v');

-- ── 3) ใส่ CHECK ที่ใช้กฎเดียวกับการล้าง ────────────────────────────────
ALTER TABLE public.products
  ADD CONSTRAINT products_fg_code_trimmed
  CHECK ("fgCode" IS NULL OR "fgCode" = btrim("fgCode", E' \t\n\r\f\v'))
  NOT VALID;
ALTER TABLE public.products VALIDATE CONSTRAINT products_fg_code_trimmed;

COMMIT;

NOTIFY pgrst, 'reload schema';
