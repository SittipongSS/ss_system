# default privileges ที่ยังปิดไม่ได้ — `supabase_admin`

> สถานะ: **ระงับ** · ตรวจกับฐานจริงเมื่อ 2026-09-02 · ปิดจากฝั่งเราไม่ได้ ต้องอาศัย Supabase

## เรื่องย่อ

`mig 0336` ถอนสิทธิ์ `anon` / `authenticated` ออกจากทุกฟังก์ชัน ตาราง และซีเควนซ์ใน `public`
แล้วเปลี่ยน `ALTER DEFAULT PRIVILEGES` เพื่อไม่ให้ของที่สร้างใหม่ตกถึง anon อีก

แต่ `ALTER DEFAULT PRIVILEGES` **ผูกกับ role ที่สร้างอ็อบเจกต์ ไม่ใช่กับ schema** ⇒ 0336
ครอบได้เฉพาะ role `postgres` ที่ระบุไว้ · `pg_default_acl` ของ `public` จริง ๆ มีสองชุด:

```
kind  for_role         acl
f     postgres         {postgres=X/postgres, service_role=X/postgres}          ✅
r     postgres         {postgres=arwdDxtm/postgres, service_role=arwdDxtm/…}   ✅
S     postgres         {postgres=rwU/postgres, service_role=rwU/postgres}      ✅
f     supabase_admin   {postgres=X/…, anon=X/…, authenticated=X/…}             ❌
r     supabase_admin   {postgres=arwdDxtm/…, anon=arwdDxtm/…, …}               ❌
S     supabase_admin   {postgres=rwU/…, anon=rwU/…, …}                         ❌
```

⇒ อะไรก็ตามที่สร้างใน `public` **ในนาม `supabase_admin`** จะเกิดมาพร้อมสิทธิ์ให้ `anon` ทันที

## ทำไมถึงปิดไม่ได้

เคยทำเป็น `mig 0342` แล้ว (PR #1590) รันจริงบน production ได้ผล:

```
ERROR: 42501: permission denied to change default privileges
```

`postgres` ของ Supabase **ไม่ใช่ superuser และไม่ได้เป็นสมาชิกของ `supabase_admin`**
จึงสั่ง `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin …` แทนไม่ได้
ทั้ง transaction ถูกยกเลิก ไม่มีอะไรเสียหาย · ไฟล์ 0342 ถูกถอนออกจากรีโปแล้วเพราะ
**migration ที่รันไม่ได้ตลอดกาลคือกับดัก** ไม่ใช่เอกสาร

ทางอื่นที่คิดแล้วใช้ไม่ได้เหมือนกัน: `CREATE EVENT TRIGGER` เพื่อไล่ revoke ของใหม่อัตโนมัติ
ต้องใช้สิทธิ์ superuser ซึ่ง `postgres` ก็ไม่มี

## ทำไมยังไม่อันตรายวันนี้

วัดกับฐานจริง 2026-09-02: **ทุกอ็อบเจกต์ใน `public` เป็นของ `postgres` ทั้ง 113 ตัว**
(110 ตาราง + 3 อย่างอื่น) ไม่มีของ `supabase_admin` สักตัว เพราะ SQL Editor รันในนาม
`postgres` และ migration ทุกใบของโปรเจกต์นี้รันผ่าน SQL Editor

⇒ ประตูนี้มีอยู่จริงแต่ยังไม่มีใครเดิน · ความเสี่ยงคือวันที่ Supabase ออกฟีเจอร์ที่สร้าง
ของใน `public` ด้วย role นั้น หรือมีคน restore dump ด้วย role นั้น

## ตรวจว่าหลุดหรือยัง

รันใน SQL Editor เป็นระยะ (หรือเมื่อสงสัย) — **ต้องได้ 0 ทั้งสองค่า**:

```sql
select
  (select count(*) from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and has_function_privilege('anon', p.oid, 'EXECUTE'))            as anon_fns,
  (select count(*) from pg_class c
     where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
       and has_table_privilege('anon', c.oid, 'SELECT'))                as anon_tables;
```

ยิงจากนอกก็ได้ ไม่ต้องเข้า dashboard — anon ต้องโดนปฏิเสธ:

```bash
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: $ANON" -H "Authorization: Bearer $ANON" \
  "$SUPABASE_URL/rest/v1/customers?select=id&limit=1"
# 401 = ถูก · 200 = หลุดแล้ว
```

Supabase Security Advisor ก็จับได้เหมือนกัน (หัวข้อ *Public Can Execute SECURITY DEFINER
Function* และ *RLS Disabled in Public*) — ปกติต้องเป็น **0 error 0 warning**

## ถ้าจะปิดจริง

ต้องให้ Supabase support รันให้ (หรือรอวันที่เปิดสิทธิ์ให้ `postgres` สั่งแทน role นี้ได้):

```sql
alter default privileges for role supabase_admin in schema public
  revoke all on functions from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all on tables from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  grant execute on functions to service_role;
alter default privileges for role supabase_admin in schema public
  grant all on tables to service_role;
alter default privileges for role supabase_admin in schema public
  grant usage, select, update on sequences to service_role;
```

⚠️ ต้อง `grant … to service_role` คู่กับ `revoke` เสมอ — `service_role` ได้สิทธิ์มาทาง
default ชุดนี้ ไม่ได้เป็นเจ้าของอ็อบเจกต์ ถ้า revoke แล้วไม่ grant คืน ของที่สร้างใหม่
ในนาม `supabase_admin` จะอ่านไม่ได้จากฝั่งแอป
