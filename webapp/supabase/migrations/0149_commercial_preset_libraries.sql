-- 0149 - แยก Commercial Preset เป็น 2 คลังอิสระ: ชุดการชำระ / ชุดหมายเหตุ
--
-- ของเดิม (0128) เป็น "ก้อนรวม" 1 preset = วิธีชำระ + เงื่อนไข + งวด + หมายเหตุ
-- ผูกกับ scope (teamKey/dealType/serviceType/priority) แล้ว resolver เลือกให้เอง
-- ตอนสร้างใบเสนอราคา — คนทำใบไม่มีสิทธิ์เลือก และหยิบแยกส่วนไม่ได้
--
-- มติ 2026-07-25: แยกเป็น 2 คลัง ตั้งชื่ออิสระ แล้วให้คนทำใบเลือกเองจาก dropdown
-- (ตัด resolver + scope ทิ้งทั้งชุด) · ชุดการชำระมีตารางงวดเสมอ — ชำระเต็มจำนวน
-- = 1 แถว 100% ซึ่ง validator commercial_installments_valid เดิมรองรับอยู่แล้ว
-- (กติกาคือ "0 แถว หรือ รวม 100%")
--
-- ⚠ ทำได้เพราะฟีเจอร์นี้ยังไม่ถูกใช้จริง — migration จะ RAISE ถ้าพบข้อมูลในตาราง
--   แทนที่จะทำลายของที่มีอยู่เงียบ ๆ
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

-- ── 0) ด่านความปลอดภัย: ยอมรื้อเฉพาะตอนที่ยังไม่มีข้อมูลจริง ──
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.commercial_presets) THEN
    RAISE EXCEPTION 'commercial_presets_not_empty: มีข้อมูลอยู่ในคลัง — หยุดก่อน แล้วคุยเรื่องแผนย้ายข้อมูล';
  END IF;
END $$;

-- ── 1) ชนิดคลัง + ถอด scope ที่เลิกใช้ ──
ALTER TABLE public.commercial_presets
  ADD COLUMN IF NOT EXISTS kind text NOT NULL CHECK (kind IN ('payment', 'remarks'));

DROP INDEX IF EXISTS public.commercial_presets_resolver_idx;

ALTER TABLE public.commercial_presets
  DROP COLUMN IF EXISTS "teamKey",
  DROP COLUMN IF EXISTS "dealType",
  DROP COLUMN IF EXISTS "serviceType",
  DROP COLUMN IF EXISTS priority;

-- documentKey คงไว้ (เผื่อใบสั่งขายใช้คลังเดียวกันในอนาคต) — เรียงตามชนิดคลังแทน
CREATE INDEX IF NOT EXISTS commercial_presets_kind_idx
  ON public.commercial_presets (kind, "documentKey", "presetKey");

-- ── 2) guard: identity เดิมอ้างคอลัมน์ที่ถอดไปแล้ว + kind ต้องแก้ไม่ได้ ──
CREATE OR REPLACE FUNCTION public.guard_commercial_preset_root()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    -- Preset ที่ไม่เหลือเวอร์ชันใด ๆ (ร่างแรกถูกยกเลิก) ไม่ใช่หลักฐาน — ลบ root ตามได้
    IF NOT EXISTS (SELECT 1 FROM public.commercial_preset_versions WHERE "presetId" = OLD.id) THEN
      RETURN OLD;
    END IF;
    RAISE EXCEPTION 'commercial_preset_delete_forbidden';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW."presetKey" IS DISTINCT FROM OLD."presetKey"
     OR NEW."documentKey" IS DISTINCT FROM OLD."documentKey"
     OR NEW.kind IS DISTINCT FROM OLD.kind
     OR NEW."legacyTemplateId" IS DISTINCT FROM OLD."legacyTemplateId"
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'commercial_preset_identity_immutable';
  END IF;
  RETURN NEW;
END;
$$;

-- ── 3) RPC สร้าง preset ใหม่: รับ kind แทน scope (เปลี่ยน signature ต้อง DROP ก่อน) ──
DROP FUNCTION IF EXISTS public.create_commercial_preset_with_draft(
  text, text, text, text, text, text, text, integer,
  text, text, text, text, jsonb, text, text, text, text
);

CREATE OR REPLACE FUNCTION public.create_commercial_preset_with_draft(
  p_preset_id text, p_preset_key text, p_version_id text,
  p_document_key text, p_kind text,
  p_title text, p_payment_method text, p_payment_terms text, p_remarks text, p_installments jsonb, p_change_note text,
  p_actor_id text, p_actor_name text, p_actor_role text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_root public.commercial_presets%ROWTYPE;
  v_draft public.commercial_preset_versions%ROWTYPE;
  v_now timestamptz := now();
BEGIN
  IF NULLIF(btrim(p_preset_id), '') IS NULL OR NULLIF(btrim(p_preset_key), '') IS NULL
     OR NULLIF(btrim(p_version_id), '') IS NULL OR NULLIF(btrim(p_actor_id), '') IS NULL THEN
    RAISE EXCEPTION 'commercial_preset_actor_required';
  END IF;
  IF p_kind IS NULL OR p_kind NOT IN ('payment', 'remarks') THEN
    RAISE EXCEPTION 'commercial_preset_kind_invalid';
  END IF;

  INSERT INTO public.commercial_presets (
    id, "presetKey", "documentKey", kind, "createdAt", "updatedAt"
  ) VALUES (
    p_preset_id, p_preset_key, p_document_key, p_kind, v_now, v_now
  ) RETURNING * INTO v_root;

  INSERT INTO public.commercial_preset_versions (
    id, "presetId", "versionNumber", status, title, "paymentMethod", "paymentTerms", remarks, installments, "changeNote",
    "createdById", "createdByName", "createdByRole", "updatedById", "updatedByName", "updatedByRole", "createdAt", "updatedAt"
  ) VALUES (
    p_version_id, v_root.id, 1, 'draft', p_title, p_payment_method, p_payment_terms, p_remarks, p_installments, p_change_note,
    p_actor_id, p_actor_name, p_actor_role, p_actor_id, p_actor_name, p_actor_role, v_now, v_now
  ) RETURNING * INTO v_draft;

  RETURN jsonb_build_object('preset', to_jsonb(v_root), 'draft', to_jsonb(v_draft));
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_commercial_preset_with_draft(
  text, text, text, text, text, text, text, text, text, jsonb, text, text, text, text
) TO service_role;
