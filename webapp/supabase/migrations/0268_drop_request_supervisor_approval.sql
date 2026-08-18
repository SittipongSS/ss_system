-- ============================================================
--  Migration 0268: ถอด schema ประตูหัวหน้าฝ่ายขายของคำร้อง (มติผู้ใช้ 2026-08-18)
--
--  ขั้น "AE Sup ยืนยันให้ RD ดำเนินการ" ถูก **ถอดออกทั้งขั้น** ตามมติผู้ใช้
--  2026-08-16 (RD รับเรื่องแล้วลงมือได้เลย) — ตอนนั้นถอดแต่โค้ด ปล่อยคอลัมน์กับ
--  constraint ค้างไว้ "เผื่อเปิดใหม่"
--
--  ผลตรวจ 2026-08-18: ไม่มีโค้ดไหนเขียน `approvedAt` อีกแล้วสักที่ ⇒ schema ที่
--  อ่านแล้วเข้าใจว่ายังมีขั้นอนุมัติอยู่จริง · เคยทำให้เกิดแถวเช็กลิสต์ที่ไม่มีวัน
--  ติ๊กเขียวมาแล้ว (ดูคอมเมนต์ที่ components/requests/details/ScentPanel.js)
--
--  ⭐ **ประวัติไม่หาย** — ตรวจฐานจริงก่อนถอด: มีใบเดียวที่เคยผ่านประตูนี้
--  (SB-26080002 · 2026-08-16T15:37 · Admin S&S) และเหตุการณ์นั้น **อยู่ในเธรดของใบ
--  แล้ว** (`entity_updates` kind='approve' — "ยืนยันให้ฝ่าย RD ดำเนินการได้"
--  ประทับเวลาเดียวกันเป๊ะ) ⇒ คอลัมน์เป็นสำเนาที่ซ้ำกับเธรด ไม่ใช่ต้นฉบับ
--  ⚠️ ถ้าวันหนึ่งเปิดขั้นนี้ใหม่ ให้ย้อนดู 0216 แล้วสร้างใหม่ — อย่าคืนชีพคอลัมน์
--  ครึ่ง ๆ กลาง ๆ โดยไม่มีโค้ดเขียน ซึ่งคือสภาพที่ migration นี้กำลังเก็บกวาด
--
--  ⚠️ รันมือบน Supabase SQL Editor · รันซ้ำได้ · ไม่แตะข้อมูลใบใด ๆ นอกจากคอลัมน์นี้
-- ============================================================

ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_approval_order_check;

DROP INDEX IF EXISTS public.dept_requests_awaiting_approval_idx;

ALTER TABLE public.dept_requests
  DROP COLUMN IF EXISTS "approvedAt",
  DROP COLUMN IF EXISTS "approvedById",
  DROP COLUMN IF EXISTS "approvedByName";

NOTIFY pgrst, 'reload schema';

-- ── ตรวจหลังรัน ─────────────────────────────────────────────────────────
-- 1) คอลัมน์หายครบ (ต้องได้ 0 แถว):
--    select column_name from information_schema.columns
--     where table_name = 'dept_requests'
--       and column_name in ('approvedAt', 'approvedById', 'approvedByName');
-- 2) ประวัติยังอยู่ในเธรด (ต้องได้ 1 แถว):
--    select "createdAt", body from public.entity_updates
--     where "entityType" = 'dept_request' and kind = 'approve';
