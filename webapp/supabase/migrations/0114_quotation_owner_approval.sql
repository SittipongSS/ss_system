-- 0114 - เปิดการอนุมัติใบเสนอราคาแบบ "เจ้าของเซ็น" (มติผู้ใช้ 2026-07-18).
-- คนละโมเดลกับที่ถอดออกใน 0100: ไม่ใช่ด่านตามเงื่อนไข/ยอด แต่เป็นการเซ็นรับรอง
-- โดย AE เจ้าของดีล — ผู้เสนอราคา = ผู้สร้างใบ, ผู้อนุมัติ = เจ้าของดีล (FM-SA-01).
--
-- โครงเดิมพร้อมอยู่แล้ว: คอลัมน์ approvalStatus (CHECK รวม 'pending'/'approved' — mig 0070),
-- fingerprint (0098) และ RPC save_quotation_content ที่บล็อก status='sent' เมื่อ
-- approvalStatus ยังไม่ ('not_required'|'approved') — จึงไม่ต้องแก้ RPC/สร้างคอลัมน์ใหม่.
--
-- เปลี่ยนเฉพาะค่า default: ใบใหม่เริ่มที่ 'pending' (ต้องให้เจ้าของอนุมัติก่อนส่ง).
-- ใบเดิมทั้งหมดคง 'not_required' ไว้ (grandfather — ใบที่ส่ง/รับไปแล้วยังใช้ได้ปกติ
-- ไม่ต้อง backfill).

ALTER TABLE public.quotations
  ALTER COLUMN "approvalStatus" SET DEFAULT 'pending';

NOTIFY pgrst, 'reload schema';
