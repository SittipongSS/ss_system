-- ============================================================
--  Migration 0076: เพิ่มคอลัมน์ "piecesPerCase" ให้ products
--  จำนวนชิ้นต่อ 1 ลัง (case/carton) ของสินค้า — ตัวแปลงหน่วย ลัง↔ชิ้น.
--  สหมิตร (AR-109) คุยกับลูกค้าเป็น "ลัง" แต่ระบบเก็บ/ผลิตเป็น "ชิ้น"
--  (sahamit_forecast_lines.qty / sahamit_po_lines.qty ยังเป็นชิ้นเหมือนเดิม
--  = canonical). ลังเป็นค่าที่คำนวณมาแสดง/รับกรอก = ชิ้น ÷ piecesPerCase.
--
--  nullable โดยเจตนา: สินค้าที่ยังไม่ตั้งชิ้นต่อลัง → หน้าจอสหมิตรโชว์เฉพาะชิ้น
--  (ไม่แปลงลัง) และกรอกได้เฉพาะหน่วยชิ้น. ตั้งค่าได้ที่ ข้อมูลสินค้า (product master).
--  Additive + idempotent. ⚠ รันมือบน Supabase SQL Editor (เหมือน 0005-0074).
-- ============================================================

alter table public.products
  add column if not exists "piecesPerCase" numeric;
