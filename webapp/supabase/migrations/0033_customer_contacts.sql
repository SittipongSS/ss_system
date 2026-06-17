-- ============================================================
--  Migration 0033: customers.contacts (ผู้ติดต่อหลายคน)
--  เดิมเก็บผู้ติดต่อได้คนเดียว (contactPerson/contactPhone/email).
--  เพิ่ม contacts jsonb array — แต่ละรายการ {role,name,phone,email}
--  (role = แผนก: จัดซื้อ/การเงิน/เทคนิค/อื่นๆ).
--  backfill: ย้ายผู้ติดต่อเดี่ยวเดิม -> contacts[0].
--  คงคอลัมน์เดี่ยวไว้ (API sync contacts[0] กลับเข้าไป) เพื่อ back-compat.
--  additive + idempotent. ⚠ รันมือบน Supabase (เหมือน 0005-0032).
-- ============================================================

alter table public.customers add column if not exists "contacts" jsonb not null default '[]'::jsonb;

update public.customers
set "contacts" = jsonb_build_array(
  jsonb_build_object(
    'role', '',
    'name',  coalesce("contactPerson", ''),
    'phone', coalesce("contactPhone", ''),
    'email', coalesce("email", '')
  )
)
where ("contacts" is null or "contacts" = '[]'::jsonb)
  and (coalesce("contactPerson", '') <> '' or coalesce("contactPhone", '') <> '' or coalesce("email", '') <> '');
