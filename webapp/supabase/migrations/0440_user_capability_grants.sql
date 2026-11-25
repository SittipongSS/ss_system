-- 0440 — ทะเบียนสิทธิ์เสริมรายคน (รื้อระบบสิทธิ์งวด 2 · มติเจ้าของ 25/11/2026)
--
--  แผน: docs/permissions-rework.md
--  ⭐ ตารางนี้คือ "ของจริง" ของสิทธิ์เสริม — ใครได้อะไร · ใครให้ · เมื่อไร · เพราะอะไร · หมดอายุเมื่อไร · ถอนเมื่อไร
--     `auth.users.raw_app_meta_data.extraCaps` เป็น **สำเนา** ที่โค้ดเขียนตามตารางนี้ทุกครั้งที่ให้/ถอน
--     (proxy อ่าน `getUser().app_metadata` ทุกคำขอ — สำเนาทำให้ไม่ต้องอ่านตารางทุกคำขอ)
--
--  มติที่ผูกกับคอลัมน์:
--    • เหตุผลบังคับทุกครั้ง           → reason NOT NULL + ห้ามว่าง
--    • หมดอายุต้องเลือกทุกครั้ง       → "expiresOn" NULL = เลือก "ไม่มีกำหนด" (โค้ดบังคับให้เลือก · ฐานรับ NULL)
--      ⚠️ เป็น **วันในปฏิทินไทย ใช้ได้ถึงสิ้นวันนั้น** · cron รายวัน (09:00) ถอดแถวที่ "expiresOn" < วันนี้
--    • ครบวันถอดเอง + กระดิ่ง         → "revokeKind" = 'expired' · "warnedAt" กันเตือนล่วงหน้าซ้ำ
--
--  ⚠️ หนึ่งคนถือ cap เดียวกันได้ทีละแถวที่ยังไม่ถอน (unique index บางส่วน) — ให้ซ้ำ = ฐานปฏิเสธ
--  ⚠️ "userId" เป็น text ตรงกับตารางอื่นที่อ้างผู้ใช้ (notifications ฯลฯ) · ไม่มี FK ข้ามไป auth schema
--  ⚠️ เปิด RLS ไม่มี policy + REVOKE จาก anon/authenticated (แบบเดียวกับ 0438) — อ่าน/เขียนผ่าน service role เท่านั้น
--
--  ย้ายของเดิม: แถวของทุก cap ที่อยู่ใน extraCaps ตอนนี้ (25/11 เหลือ 3 คน × 2 cap หลังถอดของที่ไม่มีผลในงวด 1)
--    เหตุผล = "ให้ก่อนมีบันทึกเหตุผล" · ผู้ให้ = ไม่มีบันทึก · ไม่มีกำหนดหมดอายุ
--    ⚠️ ย้ายเฉพาะ cap ที่อยู่ในรายการแจกได้ (GRANTABLE_CAPS ในโค้ด) — ของนอกรายการโค้ดทิ้งอยู่แล้ว (sanitizeExtraCaps)
--
--  🛑 ลำดับขึ้นระบบ: **รันไฟล์นี้ก่อน merge** (ด่าน CI `check:columns` อ่านสคีมาจริง) · รันแล้วโค้ดที่ deploy อยู่ทำงานเหมือนเดิม
--     (ไม่มีใครอ่านตารางนี้จนกว่าโค้ดงวด 2 จะขึ้น)
--  ✅ รันซ้ำได้ (IF NOT EXISTS · ย้ายของเดิมเฉพาะที่ยังไม่มีแถวค้าง)

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_capability_grants (
  id                text PRIMARY KEY DEFAULT ('UCG-' || gen_random_uuid()::text),
  "userId"          text NOT NULL,
  cap               text NOT NULL CHECK (cap ~ '^[a-z]+:[a-z]+$'),
  reason            text NOT NULL CHECK (length(btrim(reason)) > 0),
  "expiresOn"       date,
  "grantedById"     text,
  "grantedByName"   text NOT NULL,
  "grantedAt"       timestamptz NOT NULL DEFAULT now(),
  "warnedAt"        timestamptz,
  "revokedAt"       timestamptz,
  "revokeKind"      text CHECK ("revokeKind" IN ('manual', 'expired')),
  "revokedById"     text,
  "revokedByName"   text,
  "revokeNote"      text,
  CONSTRAINT user_capability_grants_revoke_complete
    CHECK (("revokedAt" IS NULL) = ("revokeKind" IS NULL))
);

-- ถือได้ทีละแถวต่อ (คน, cap) ที่ยังไม่ถอน
CREATE UNIQUE INDEX IF NOT EXISTS user_capability_grants_active_uq
  ON public.user_capability_grants ("userId", cap) WHERE "revokedAt" IS NULL;
-- cron หาแถวใกล้หมด/หมดแล้ว
CREATE INDEX IF NOT EXISTS user_capability_grants_expiry_idx
  ON public.user_capability_grants ("expiresOn") WHERE "revokedAt" IS NULL AND "expiresOn" IS NOT NULL;
-- ประวัติรายคน
CREATE INDEX IF NOT EXISTS user_capability_grants_user_idx
  ON public.user_capability_grants ("userId", "grantedAt" DESC);

-- ── ย้ายของเดิมจาก app_metadata.extraCaps ───────────────────────────────────
INSERT INTO public.user_capability_grants ("userId", cap, reason, "expiresOn", "grantedById", "grantedByName", "grantedAt")
SELECT u.id::text, c.cap, 'ให้ก่อนมีบันทึกเหตุผล (ย้ายจากสิทธิ์เสริมเดิม 25/11/2026)', NULL, NULL, 'ไม่มีบันทึก', now()
  FROM auth.users u
 CROSS JOIN LATERAL jsonb_array_elements_text(
         CASE WHEN jsonb_typeof(u.raw_app_meta_data -> 'extraCaps') = 'array'
              THEN u.raw_app_meta_data -> 'extraCaps' ELSE '[]'::jsonb END) AS c(cap)
 WHERE c.cap IN ('ra:view', 'products:margin', 'mgmt:view', 'mgmt:edit', 'audit:view', 'users:view', 'team:manage')
   AND NOT EXISTS (
         SELECT 1 FROM public.user_capability_grants g
          WHERE g."userId" = u.id::text AND g.cap = c.cap AND g."revokedAt" IS NULL);

-- ── สิทธิ์ของตารางใหม่ ──────────────────────────────────────────────────────
ALTER TABLE public.user_capability_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.user_capability_grants FROM anon, authenticated;
GRANT ALL ON TABLE public.user_capability_grants TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- เช็กหลังรัน: ตารางต้องมี · แถวที่ย้ายต้องเท่ากับ cap ในสำเนา (25/11 = 6)
SELECT
  to_regclass('public.user_capability_grants') AS tbl,
  (SELECT count(*) FROM public.user_capability_grants WHERE "revokedAt" IS NULL) AS active_rows,
  (SELECT count(*) FROM auth.users u
     CROSS JOIN LATERAL jsonb_array_elements_text(
       CASE WHEN jsonb_typeof(u.raw_app_meta_data -> 'extraCaps') = 'array'
            THEN u.raw_app_meta_data -> 'extraCaps' ELSE '[]'::jsonb END) AS c(cap)) AS caps_in_app_metadata;
