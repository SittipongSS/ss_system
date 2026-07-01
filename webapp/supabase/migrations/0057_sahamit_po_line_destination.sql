-- ============================================================
--  Migration 0057: sahamit_po_lines.destination — สถานที่ส่งต่อบรรทัด PO
--  ลูกค้าสหมิตรระบุปลายทางส่งต่อรายการ (โรงงาน/คลัง): บางปะกง / โพธาราม / ขอนแก่น.
--  เก็บเป็น key: 'bangpakong' | 'photharam' | 'khonkaen' | null (ยังไม่ระบุ).
--
--  additive + idempotent. nullable — แถวเก่าไม่กระทบ.
--  ⚠ รันมือบน Supabase SQL Editor ก่อน deploy (เหมือน 0050-0056).
-- ============================================================

alter table public.sahamit_po_lines
  add column if not exists destination text;
