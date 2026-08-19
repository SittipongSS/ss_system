-- ============================================================
--  Migration 0270: คำร้องรู้ว่า "ตอนนี้ตาใครตอบ" (มติผู้ใช้ 2026-08-20)
--
--  โจทย์: *"จะทำไงให้รู้ว่าฝ่ายไหนต้องตอบกลับ ขอเจาะที่หัวข้อสอบถาม"*
--
--  หัวข้อ "สอบถามข้อมูล" ไม่มีบรรทัดให้เดินสถานะ — ทั้งใบคือเธรด ⇒ ระบบไม่มีทาง
--  รู้เลยว่าลูกปิงปองอยู่ฝั่งไหน · คิวจึงขึ้น "รอฝ่ายเริ่ม" ค้างตั้งแต่วันรับเรื่อง
--  จนถึงวันที่มีคนกด "ตอบแล้ว" แม้ฝ่ายจะตอบในเธรดไปแล้วและกำลังรอผู้ขอตอบกลับ
--
--  ⭐ **ตาใครตัดสินจาก "คนโพสต์ล่าสุด"** ไม่ใช่ปุ่มที่ต้องมีคนกด — เธรดพลิกฝั่ง
--  เองทุกข้อความ ไม่มีอะไรให้ใครจำ และใช้ได้กับใบเก่าทันทีหลัง backfill
--  ⚠️ จุดอ่อนที่รู้ตัว: ฝ่ายโพสต์โน้ตกลางทาง ("ขอเวลา 2 วัน") ป้ายจะพลิกไปฝั่ง
--  ผู้ขอทั้งที่งานยังอยู่ที่ฝ่าย — มันแก้ตัวเองในข้อความถัดไป · ถ้าเจอบ่อยจริง
--  ค่อยเติมปุ่มกดทับทีหลัง (ปุ่มที่ไม่มีใครกด = หนี้ UI)
--
--  ทำไมเป็นคอลัมน์บนใบ ไม่ใช่ join เธรดสด: คิวเป็นหน้าที่เปิดบ่อยที่สุดและมี
--  100+ ใบต่อหน้า ⇒ join ล่าสุดต่อแถวคือ query เพิ่มทุกครั้งที่โหลด · คอลัมน์
--  ยังเอาไปเรียง/กรอง/ทำแท็บ "รอฉันตอบ" ได้ด้วย
--
--  `requesterDept` = ฝ่ายของ **คนเปิดใบ** — ป้ายบนคิวเลิกใช้คำว่า "ฝ่าย" ลอย ๆ
--  แล้วพูดชื่อฝ่ายจริงทั้งสองฝั่ง ("รอ RD ตอบ" / "รอ SA ตอบ" — มติผู้ใช้ 2026-08-20)
--
--  ⚠️ รันมือบน Supabase SQL Editor · ไม่แตะข้อมูลเดิม · รันซ้ำได้
--  ⚠️ ปลอดภัยกับโค้ดเวอร์ชันปัจจุบัน (โค้ดเก่าไม่เคยอ่าน/เขียนคีย์พวกนี้) ⇒ รันล่วงหน้าได้
-- ============================================================

alter table public.dept_requests
  add column if not exists "requesterDept" text,
  add column if not exists "lastReplySide" text,
  add column if not exists "lastReplyAt"   timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'dept_requests_last_reply_side_chk'
  ) then
    alter table public.dept_requests
      add constraint dept_requests_last_reply_side_chk
      check ("lastReplySide" is null or "lastReplySide" in ('dept', 'requester'));
  end if;
end $$;

comment on column public.dept_requests."requesterDept" is
  'ฝ่ายของคนเปิดใบ ณ ตอนเปิด — ใช้เขียนป้าย "รอ <ฝ่าย> ตอบ" ของฝั่งผู้ขอ (snapshot ไม่ตามบัญชี)';
comment on column public.dept_requests."lastReplySide" is
  'ฝั่งที่โพสต์ข้อความล่าสุดในเธรด: dept = ฝ่ายผู้รับ · requester = ฝั่งคนเปิดใบ (ตัดสินจาก authorDept)';
comment on column public.dept_requests."lastReplyAt" is
  'เวลาโพสต์ข้อความล่าสุดในเธรด — คู่กับ lastReplySide เสมอ';

-- ── backfill 1 · ฝ่ายของคนเปิดใบ ────────────────────────────────────────
-- อ่านจากเหตุการณ์ "ส่งเคส" ในเธรด ซึ่งเก็บ `authorDept` ของคนกดส่งไว้อยู่แล้ว
-- (entity_updates มีคอลัมน์นี้ตั้งแต่ mig 0163 — "ใช้แยกฝั่งถาม/ตอบในเธรดสองฝ่าย")
update public.dept_requests dr
   set "requesterDept" = first_event."authorDept"
  from (
    select distinct on ("entityId") "entityId", "authorDept"
      from public.entity_updates
     where "entityType" = 'dept_request' and kind = 'submit'
     order by "entityId", "createdAt" asc
  ) as first_event
 where first_event."entityId" = dr.id
   and dr."requesterDept" is null
   and first_event."authorDept" is not null;

-- ── backfill 2 · ข้อความคนล่าสุด ────────────────────────────────────────
-- ⚠️ นับเฉพาะ `comment` = ข้อความที่ **คนพิมพ์** · เหตุการณ์ระบบ (รับเรื่อง ·
-- แจ้งกำหนดส่ง · ส่งงาน) ไม่ใช่การตอบ และมีสถานะของตัวเองเล่าอยู่แล้ว
-- ⚠️ ข้อความที่ถูกลบไม่นับ — ลบแล้วเท่ากับไม่เคยตอบ
update public.dept_requests dr
   set "lastReplyAt"   = last_msg."createdAt",
       "lastReplySide" = case
         when last_msg."authorDept" is not null and last_msg."authorDept" = dr.dept
           then 'dept' else 'requester' end
  from (
    select distinct on ("entityId") "entityId", "authorDept", "createdAt"
      from public.entity_updates
     where "entityType" = 'dept_request' and kind = 'comment' and "deletedAt" is null
     order by "entityId", "createdAt" desc
  ) as last_msg
 where last_msg."entityId" = dr.id
   and dr."lastReplyAt" is null;
