-- ── 0367 · ถอยเลขรันของไซต์ · โซน · เครื่อง กลับไปเริ่มต้นใหม่ ──────────────
--
-- ⭐ ที่มา (มติผู้ใช้ 2026-09-18): ของที่อยู่ในทะเบียนบริการตอนนี้เป็นของทดสอบล้วน
--   (ไซต์ 1 · โซน 3 · เครื่อง 6 สร้างวันเดียวกัน 18/09 · ยังไม่มีงานนัดหรือประวัติย้าย
--    เครื่องสักแถว) แต่เลขรันเดินไปไกลกว่าของจริงมากเพราะของทดสอบชุดก่อนถูกลบทิ้ง:
--      SS 1020 (ไซต์จริง 1 แถว) · ZN 10026 (โซนจริง 3 แถว) · MC 11 (เครื่องจริง 6 แถว)
--   ⇒ ผู้ใช้ขอ "ถอยแค่เลข ไม่ลบแถว" ⇒ ใบนี้ **เขียนรหัสของ 10 แถวที่เหลือใหม่ให้ไล่จาก
--   ต้นทาง** แล้วถอยตัวนับมาชิดหลังแถวสุดท้าย
--
-- 🔴 **ทำได้เพราะรหัสชุดนี้ยังไม่เคยออกนอกระบบ** — กติกาประจำ (siteCode.js · zoneCode.js ·
--   machineCode.js) คือ *รหัสคือตัวตน แก้ทีหลังไม่ได้* เพราะมันไปอยู่บนเอกสารที่ส่งลูกค้า
--   แล้ว · ชุดนี้เป็นข้อยกเว้นเฉพาะกาลก่อนเปิดใช้จริง: ไม่มี visit · ไม่มี asset_move ·
--   ไม่มีคำร้องประเมินพื้นที่ที่อ้างถึง ⇒ **ห้ามยกใบนี้ไปใช้ซ้ำหลังโมดูลเปิดใช้จริง**
--
-- ⚠️ **ต้องรันใน SQL Editor** — ไม่ใช่เพราะมี DDL (ไม่มีสักบรรทัด) แต่เพราะ trigger
--   `entity_number_counter_guard` (mig 0241) ห้ามถอย `lastNo` และห้ามลบแถวตัวนับ
--   ทางออกที่ใบนั้นเปิดไว้คือ `SET app.entity_counter_unlock = 'on'` ซึ่งเป็น GUC ระดับ
--   เซสชัน/ทรานแซกชัน ⇒ PostgREST ที่ยิงทีละคำขอแยกทรานแซกชันทำไม่ได้
--
-- ⚠️ **รันซ้ำไม่ได้และตั้งใจให้เป็นอย่างนั้น** — ด่านข้อ ⓪ ตรวจว่าสถานะฐานตรงกับตอนที่
--   ตัดสินใจเป๊ะ (นับแถว + ค่าตัวนับ) ไม่ตรงเมื่อไรหยุดทั้งใบ · รอบสองจะเจอตัวนับที่ถอย
--   แล้วจึงตีกลับเอง ซึ่งถูกต้อง: ถอยซ้ำ = รหัสชนของเดิม

BEGIN;

-- ── ⓪ ด่าน: ฐานต้องอยู่ในสภาพเดียวกับตอนตัดสินใจ ────────────────────────────
DO $$
DECLARE
  v_sites int; v_zones int; v_assets int; v_visits int; v_moves int;
  v_ss int; v_zn int; v_mc int;
BEGIN
  SELECT count(*) INTO v_sites  FROM public.service_sites;
  SELECT count(*) INTO v_zones  FROM public.service_zones;
  SELECT count(*) INTO v_assets FROM public.service_assets;
  SELECT count(*) INTO v_visits FROM public.service_visits;
  SELECT count(*) INTO v_moves  FROM public.service_asset_moves;
  SELECT "lastNo" INTO v_ss FROM public.entity_number_counters WHERE scope = 'SS' AND month = '-';
  SELECT "lastNo" INTO v_zn FROM public.entity_number_counters WHERE scope = 'ZN' AND month = '-';
  SELECT "lastNo" INTO v_mc FROM public.entity_number_counters WHERE scope = 'MC' AND month = '-';

  IF v_visits <> 0 OR v_moves <> 0 THEN
    RAISE EXCEPTION 'มีงานนัด (%) หรือประวัติย้ายเครื่อง (%) แล้ว — รหัสถูกอ้างไปที่อื่นแล้ว ห้ามเขียนใหม่', v_visits, v_moves;
  END IF;
  IF (v_sites, v_zones, v_assets) IS DISTINCT FROM (1, 3, 6) THEN
    RAISE EXCEPTION 'จำนวนแถวไม่ตรงกับตอนตัดสินใจ (ไซต์ %/1 · โซน %/3 · เครื่อง %/6) — ตรวจก่อนว่ามีของจริงเพิ่มเข้ามาหรือยัง', v_sites, v_zones, v_assets;
  END IF;
  IF (v_ss, v_zn, v_mc) IS DISTINCT FROM (1020, 10026, 11) THEN
    RAISE EXCEPTION 'ตัวนับไม่ตรงกับตอนตัดสินใจ (SS %/1020 · ZN %/10026 · MC %/11) — ใบนี้รันไปแล้วหรือมีคนออกรหัสเพิ่ม', v_ss, v_zn, v_mc;
  END IF;
END $$;

-- ── ① ร่องรอยก่อนเขียนทับ (กู้คืนได้จาก audit_logs.before เท่านั้น) ──────────
INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT 'migration-0367', 'ระบบ (mig 0367)', 'system', 'update', 'serviceSite', t.id,
       'ถอยเลขรันไซต์กลับไปเริ่มที่ 1001 (มติ 2026-09-18)', '["code"]'::jsonb, to_jsonb(t), now()
  FROM public.service_sites t;

INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT 'migration-0367', 'ระบบ (mig 0367)', 'system', 'update', 'serviceZone', t.id,
       'ถอยเลขรันโซนกลับไปเริ่มที่ 10001 (มติ 2026-09-18)', '["code"]'::jsonb, to_jsonb(t), now()
  FROM public.service_zones t;

INSERT INTO public.audit_logs
  ("actorId", "actorName", "actorRole", action, "entityType", "entityId", summary, "changedKeys", before, "createdAt")
SELECT 'migration-0367', 'ระบบ (mig 0367)', 'system', 'update', 'serviceAsset', t.id,
       'ถอยเลขรันเครื่องกลับไปเริ่มที่ 00001 (มติ 2026-09-18)', '["code"]'::jsonb, to_jsonb(t), now()
  FROM public.service_assets t;

-- ── ② ไซต์: ST-XXXX-AA-BBB-CCCC · เขียนเฉพาะท่อน CCCC เริ่ม 1001 ────────────
--    เรียงตามรหัสเดิมเพื่อให้ลำดับที่คนเห็นในทะเบียนไม่สลับ
WITH renum AS (
  SELECT id, 1000 + row_number() OVER (ORDER BY code) AS run,
         left(code, length(code) - 4) AS head
    FROM public.service_sites
   WHERE code ~ '^ST-\d{4}-\d{2}-[A-Z]{3}-\d{4}$'
)
UPDATE public.service_sites s
   SET code = r.head || lpad(r.run::text, 4, '0')
  FROM renum r
 WHERE s.id = r.id;

-- ── ③ โซน: ZN-CCCC-FF-DDDDD · ท่อน CCCC ต้องตามรหัสไซต์ที่เพิ่งเขียนใหม่ ─────
--    🔴 ต้องทำ *หลัง* ข้อ ② เสมอ — ท่อนแรกของรหัสโซนคือเลขรันของไซต์ ไม่ใช่ id
WITH renum AS (
  SELECT z.id,
         right(s.code, 4) AS site_run,
         split_part(z.code, '-', 3) AS floor_seg,
         10000 + row_number() OVER (ORDER BY z.code) AS run
    FROM public.service_zones z
    JOIN public.service_sites s ON s.id = z."siteId"
   WHERE z.code ~ '^ZN-\d{4}-(0[1-9]|[1-9][0-9]|B[1-9]|GF|MZ|RF)-\d{5}$'
)
UPDATE public.service_zones z
   SET code = 'ZN-' || r.site_run || '-' || r.floor_seg || '-' || lpad(r.run::text, 5, '0')
  FROM renum r
 WHERE z.id = r.id;

-- ── ④ เครื่อง: MC-AAAA-YYMMBBBBB · เขียนเฉพาะ BBBBB เริ่ม 00001 ─────────────
--    ⚠️ เลขรันเครื่องนับรวมทั้งบริษัท ไม่แยกตามรุ่น ⇒ เรียงตามเวลาที่สร้างแถว
--      เพื่อให้เลขไล่ตามลำดับที่ของเข้าจริง ไม่ใช่ตามชื่อรุ่น
--
-- 🔴 **ต้องเขียนสองจังหวะ** ต่างจากไซต์/โซน — ชุดเลขใหม่ (00001–00006) **ซ้อนทับ** ชุดเดิม
--   (00006–00011) ภายใน prefix เดียวกัน `MC-SMV1-2609` ⇒ UPDATE รวดเดียวจะชน
--   `service_assets_code_uk` กลางทาง (unique index ไม่ deferrable — ตรวจทีละแถวตอนเขียน
--   ไม่ใช่ตอนจบคำสั่ง) แม้ปลายทางจะไม่มีรหัสซ้ำก็ตาม
--   ⇒ พักไว้ที่ค่าที่ไม่มีทางชนใคร (`TMP~` ซึ่งไม่ใช่รูปรหัสของใครเลย) แล้วค่อยลงที่จริง
--   ⚠️ คอลัมน์ `code` ของทั้งสามตารางไม่มี CHECK รูปแบบ มีแต่ unique ⇒ ค่าพักผ่านได้
WITH renum AS (
  SELECT id, left(code, length(code) - 5) AS head,
         row_number() OVER (ORDER BY "createdAt", id) AS run
    FROM public.service_assets
   WHERE code ~ '^MC-[A-Z0-9]{4}-\d{4}\d{5}$'
)
UPDATE public.service_assets a
   SET code = 'TMP~' || r.head || lpad(r.run::text, 5, '0')
  FROM renum r
 WHERE a.id = r.id;

UPDATE public.service_assets
   SET code = substring(code from 5)
 WHERE code LIKE 'TMP~%';

-- ── ⑤ ตัวนับ: ถอยมาชิดหลังแถวสุดท้ายที่เพิ่งเขียนใหม่ ───────────────────────
--    🔴 ปลดล็อก trigger ของ mig 0241 เฉพาะในทรานแซกชันนี้ (SET LOCAL)
--      ⇒ เซสชันอื่นยังถูกกันไว้เหมือนเดิม และค่าคืนเองตอน COMMIT
SET LOCAL app.entity_counter_unlock = 'on';

UPDATE public.entity_number_counters c SET "lastNo" = x.run
  FROM (
    SELECT 'SS'::text AS scope, COALESCE(max(right(code, 4)::int), 1000) AS run
      FROM public.service_sites WHERE code ~ '^ST-\d{4}-\d{2}-[A-Z]{3}-\d{4}$'
    UNION ALL
    SELECT 'ZN', COALESCE(max(split_part(code, '-', 4)::int), 10000)
      FROM public.service_zones WHERE code ~ '^ZN-\d{4}-(0[1-9]|[1-9][0-9]|B[1-9]|GF|MZ|RF)-\d{5}$'
    UNION ALL
    SELECT 'MC', COALESCE(max(right(code, 5)::int), 0)
      FROM public.service_assets WHERE code ~ '^MC-[A-Z0-9]{4}-\d{4}\d{5}$'
  ) x
 WHERE c.scope = x.scope AND c.month = '-';

-- ── ⑥ ถังเลขรูปเดิมที่เลิกใช้แล้ว (มติผู้ใช้ 2026-09-18: ลบทิ้ง) ────────────
--    SS '2607'/'2608' · ZN '2608' = ตัวนับของรูป SS-YYMMNNNN / ZN-YYMMNNNN ก่อนมติ
--    29/08 · รหัสรูปนั้นถูกเขียนใหม่หมดแล้วโดย mig 0315 และไม่มีทางไหนออกเพิ่มอีก
--    ⇒ ลบได้ตามข้อยกเว้นที่ mig 0241 เขียนไว้ ("scope ที่เลิกใช้จริง")
DELETE FROM public.entity_number_counters
 WHERE (scope, month) IN (('SS', '2607'), ('SS', '2608'), ('ZN', '2608'));

-- ── ⑦ ตรวจผล — ไม่ตรงคือ rollback ทั้งใบ ───────────────────────────────────
DO $$
DECLARE v_ss int; v_zn int; v_mc int; v_dup int; v_old int;
BEGIN
  SELECT "lastNo" INTO v_ss FROM public.entity_number_counters WHERE scope = 'SS' AND month = '-';
  SELECT "lastNo" INTO v_zn FROM public.entity_number_counters WHERE scope = 'ZN' AND month = '-';
  SELECT "lastNo" INTO v_mc FROM public.entity_number_counters WHERE scope = 'MC' AND month = '-';
  IF (v_ss, v_zn, v_mc) IS DISTINCT FROM (1001, 10003, 6) THEN
    RAISE EXCEPTION 'ตัวนับหลังถอยไม่ตรงที่ตั้งใจ (SS %/1001 · ZN %/10003 · MC %/6)', v_ss, v_zn, v_mc;
  END IF;

  SELECT count(*) INTO v_dup FROM (
    SELECT code FROM public.service_sites GROUP BY code HAVING count(*) > 1
    UNION ALL SELECT code FROM public.service_zones GROUP BY code HAVING count(*) > 1
    UNION ALL SELECT code FROM public.service_assets GROUP BY code HAVING count(*) > 1
  ) d;
  IF v_dup <> 0 THEN RAISE EXCEPTION 'มีรหัสซ้ำ % ชุดหลังเขียนใหม่', v_dup; END IF;

  IF EXISTS (SELECT 1 FROM public.service_assets WHERE code LIKE 'TMP~%') THEN
    RAISE EXCEPTION 'มีรหัสเครื่องค้างที่ค่าพัก TMP~ — จังหวะสองของข้อ ④ ไม่ทำงาน';
  END IF;

  SELECT count(*) INTO v_old FROM public.entity_number_counters
   WHERE scope IN ('SS', 'ZN') AND month <> '-';
  IF v_old <> 0 THEN RAISE EXCEPTION 'ยังเหลือถังเลขรูปเดิม % ถัง', v_old; END IF;
END $$;

COMMIT;
