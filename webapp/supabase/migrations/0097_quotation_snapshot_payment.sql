-- 0097 - ใบเสนอราคา: snapshot ข้อมูลลูกค้า ณ วันออกใบ + โครงสร้างงวดชำระ (QT create page เฟส Q1).
--   snapshot = แช่แข็งที่อยู่/ผู้ติดต่อลงใบตอนสร้าง (เหมือน unitPrice ใน 0065) — แก้ master
--   ทีหลังไม่กระทบใบเก่า; ในใบ read-only (มติผู้ใช้: แก้ที่ฐานข้อมูลลูกค้าเท่านั้น).
--   paymentPlan = โครงงวดชำระ (full / installment). additive + idempotent. ⚠ รันมือบน Supabase.

ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "billingAddress"  text,   -- ที่อยู่ออกบิล (snapshot จาก customers.address)
  ADD COLUMN IF NOT EXISTS "shippingAddress" text,   -- ที่อยู่จัดส่ง (snapshot; null=ใช้ที่อยู่บิล)
  ADD COLUMN IF NOT EXISTS "branchCode"      text,   -- สาขาลูกค้า ('00000'=สนญ.)
  ADD COLUMN IF NOT EXISTS "contactName"     text,
  ADD COLUMN IF NOT EXISTS "contactPhone"    text,
  ADD COLUMN IF NOT EXISTS "contactEmail"    text,
  ADD COLUMN IF NOT EXISTS "paymentPlan"     jsonb;  -- {type:'full'} | {type:'installment',installments:[{no,label,percent,amount,note}]}

NOTIFY pgrst, 'reload schema';
