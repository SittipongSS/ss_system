-- 0093 - เชื่อมโยงดีลกับลีด (Sales Revamp เฟส C - Floating Deals)
-- เพิ่มคอลัมน์ leadId ใน sales_deals แบบ 1-to-Many เพื่อให้ 1 ลีดสามารถแตกเป็นหลายดีลได้
-- และให้ดีลสามารถสร้างได้โดยไม่ต้องมี projectId หรือ customerId ในตอนแรก

ALTER TABLE public.sales_deals
  ADD COLUMN IF NOT EXISTS "leadId" text REFERENCES public.sales_leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS sales_deals_lead_idx
  ON public.sales_deals ("leadId");

NOTIFY pgrst, 'reload schema';
