-- 0151 - หลักฐานลายเซ็นแยกบทบาท: ผู้อนุมัติ (approver) กับ ผู้จัดทำ/ผู้เสนอ (proposer)
--
-- ที่มา: ช่องลงนาม "ผู้จัดทำ" (ใบสั่งขาย) / "ผู้เสนอราคา" (ใบเสนอราคา) บนเอกสารแสดงแค่รูป+ชื่อ
-- ไม่มีวันที่/Evidence เพราะลายเซ็นตรงนั้นเป็นเพียง stamp เชิงภาพ ไม่ได้ผ่านการลงนามที่บันทึก
-- หลักฐาน (phase-05 ระบุ out of scope เพราะ "ไม่มี explicit signing action")
-- มติผู้ใช้ 2026-07-25: ให้บันทึก evidence จริงตอนกดยื่นอนุมัติ → ต้องแยกบทบาทในตารางหลักฐานก่อน
--
-- migration นี้เป็น **ชั้นรากฐาน ไม่เปลี่ยนพฤติกรรมใด ๆ**: ทุก evidence ที่มีอยู่และที่เกิดจาก
-- การอนุมัติยังเป็น 'approver' เหมือนเดิม; ตัวสร้าง evidence ของผู้ยื่นจะมาใน migration ถัดไป
--
-- ⚠️ ตาราง document_signature_evidence มี guard ที่ RAISE ทุก UPDATE (0125:80-96) →
--    เพิ่มคอลัมน์ต้องพึ่ง DEFAULT เท่านั้น (PG11+ ใช้ fast path ไม่ rewrite ตาราง ไม่ยิง row
--    trigger) **ห้าม backfill ด้วย UPDATE เด็ดขาด** มิฉะนั้น migration จะล้มกลางทาง
-- Idempotent — รันซ้ำได้.

-- ── 1) คอลัมน์บทบาทการลงนาม ──
-- ต่างจาก "signerRole" ที่มีอยู่เดิม: อันนั้นเก็บ app role ของคนเซ็น ('ae','ac','admin')
-- ไม่ใช่บทบาทบนเอกสาร จึงต้องมีคอลัมน์ใหม่แยก
ALTER TABLE public.document_signature_evidence
  ADD COLUMN IF NOT EXISTS "signingRole" text NOT NULL DEFAULT 'approver';

ALTER TABLE public.document_signature_evidence
  DROP CONSTRAINT IF EXISTS document_signature_evidence_signing_role_check;
ALTER TABLE public.document_signature_evidence
  ADD CONSTRAINT document_signature_evidence_signing_role_check
  CHECK ("signingRole" IN ('approver', 'proposer'));

-- อ่านหลักฐาน "ล่าสุดของบทบาทนี้" ต้องเร็ว — เอกสารหนึ่งใบจะมีหลายแถวหลายบทบาท
CREATE INDEX IF NOT EXISTS document_signature_evidence_role_idx
  ON public.document_signature_evidence
     ("documentType", "documentId", "signingRole", "approvalSequence" DESC);

-- หมายเหตุ: **ไม่เพิ่ม unique ของ proposer** — ยื่นซ้ำหลังถูกตีกลับต้องได้หลายแถว
-- (UNIQUE(documentType, documentId, approvalSequence) เดิมกันชนกันอยู่แล้ว) และรอบเก่าคงไว้
-- เป็นประวัติ; ตัวชี้ว่ารอบไหน active คือ pointer บนเอกสารในข้อ 2

-- ── 2) pointer หลักฐานผู้ยื่นบนเอกสาร (คนละคอลัมน์กับ signatureEvidenceId) ──
-- ต้องเป็นคอลัมน์ใหม่ เพราะ trigger 0126/0127 ล้าง signatureEvidenceId ทุกครั้งที่เอกสาร
-- ไม่ใช่ approved → ถ้าเก็บ pointer ผู้ยื่นไว้ที่นั้น มันจะถูกล้างทันทีตอนยื่น (เข้าสถานะรออนุมัติ)
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS "proposerSignatureEvidenceId" text;
ALTER TABLE public.sales_orders
  ADD COLUMN IF NOT EXISTS "proposerSignatureEvidenceId" text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_proposer_signature_evidence_fk'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_proposer_signature_evidence_fk
      FOREIGN KEY ("proposerSignatureEvidenceId")
      REFERENCES public.document_signature_evidence(id) ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_orders_proposer_signature_evidence_fk'
  ) THEN
    ALTER TABLE public.sales_orders
      ADD CONSTRAINT sales_orders_proposer_signature_evidence_fk
      FOREIGN KEY ("proposerSignatureEvidenceId")
      REFERENCES public.document_signature_evidence(id) ON DELETE RESTRICT;
  END IF;
END;
$$;

-- ── 3) ขยาย trigger ล้าง pointer ให้ครอบ pointer ผู้ยื่นด้วย ──
-- กติกา: หลักฐานผู้ยื่นยังใช้ได้ตลอดช่วง "ยื่นแล้ว" และ "อนุมัติแล้ว"; ตกกลับเป็นร่าง/ตีกลับ/
-- ยกเลิก = การยื่นรอบนั้นสิ้นผล → ล้าง pointer (แถว evidence ยังอยู่เป็นประวัติ ลบไม่ได้)
-- ผลพลอยได้: reject / cancel / restore / แก้เนื้อหา QT ล้าง pointer ให้เองที่ระดับ DB
-- ไม่ต้องไปเพิ่มโค้ดในทุก endpoint
CREATE OR REPLACE FUNCTION public.clear_inactive_quotation_signature_evidence_pointer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."approvalStatus" IS DISTINCT FROM 'approved' THEN
    NEW."signatureEvidenceId" := NULL;
  END IF;
  IF NEW."approvalStatus" NOT IN ('pending', 'approved') THEN
    NEW."proposerSignatureEvidenceId" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- คัดลอกจากนิยามล่าสุด (0127:67-81 — มี approvalMode/approvalOverrideReason) แล้วเติมเงื่อนไข
-- pointer ผู้ยื่น; ถ้าลอกจาก 0126 จะทำให้ projection ของ admin override หาย
CREATE OR REPLACE FUNCTION public.clear_inactive_sales_order_signature_evidence_pointer()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'approved' THEN
    NEW."signatureEvidenceId" := NULL;
    NEW."approvalFingerprint" := NULL;
    NEW."approvalMode" := 'standard';
    NEW."approvalOverrideReason" := NULL;
  END IF;
  IF NEW.status NOT IN ('pending_approval', 'approved') THEN
    NEW."proposerSignatureEvidenceId" := NULL;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 4) capture RPC รับบทบาท ──
-- signature เปลี่ยน (11 → 12 params) จึงต้อง DROP ก่อน (แพตเทิร์นเดียวกับ 0127:84-89).
-- ใส่ DEFAULT 'approver' ไว้เพื่อให้ผู้เรียกเดิม 3 จุด (approve_quotation_* / approve_sales_order_*
-- ที่ส่ง 11 args) ทำงานต่อได้ทันทีโดยไม่ต้อง recreate — ลดพื้นที่ผิดพลาดของ migration นี้
-- ⚠️ ต้องเป็น DROP (เวอร์ชัน 11 params) + CREATE OR REPLACE (เวอร์ชัน 12 params):
--    CREATE เปล่าจะพังตอนรันซ้ำ ("already exists with same argument types") เพราะรอบสอง
--    ไม่มี 11-param ให้ DROP แล้ว แต่ 12-param มีอยู่ → OR REPLACE ทำให้รันซ้ำได้จริง
DROP FUNCTION IF EXISTS public.capture_document_signature_evidence(
  text, text, text, text, text, text, text, text, text, text, timestamptz);

CREATE OR REPLACE FUNCTION public.capture_document_signature_evidence(
  p_evidence_id text,
  p_document_type text,
  p_document_id text,
  p_document_number text,
  p_document_fingerprint text,
  p_document_standard_key text,
  p_actor_id text,
  p_actor_name text,
  p_actor_role text,
  p_actor_team text,
  p_signed_at timestamptz,
  p_signing_role text DEFAULT 'approver'
)
RETURNS public.document_signature_evidence
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_signature public.user_signatures%ROWTYPE;
  v_signature_version public.user_signature_versions%ROWTYPE;
  v_standard public.document_standards%ROWTYPE;
  v_standard_version public.document_standard_versions%ROWTYPE;
  v_evidence public.document_signature_evidence%ROWTYPE;
  v_sequence integer;
BEGIN
  IF NULLIF(btrim(p_evidence_id), '') IS NULL
     OR NULLIF(btrim(p_document_id), '') IS NULL
     OR NULLIF(btrim(p_document_number), '') IS NULL
     OR NULLIF(btrim(p_actor_id), '') IS NULL
     OR p_signed_at IS NULL THEN
    RAISE EXCEPTION 'signature_evidence_identity_required';
  END IF;
  IF p_document_type NOT IN ('quotation', 'sales_order')
     OR p_document_standard_key NOT IN ('quotation', 'salesOrder') THEN
    RAISE EXCEPTION 'signature_evidence_document_type_invalid';
  END IF;
  IF p_signing_role IS NULL OR p_signing_role NOT IN ('approver', 'proposer') THEN
    RAISE EXCEPTION 'signature_evidence_signing_role_invalid';
  END IF;
  IF p_document_fingerprint IS NULL
     OR p_document_fingerprint !~ '^sha256:[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'signature_evidence_fingerprint_invalid';
  END IF;

  SELECT * INTO v_signature FROM public.user_signatures
  WHERE "userId" = p_actor_id
  FOR UPDATE;
  IF NOT FOUND OR v_signature."activeVersionId" IS NULL THEN
    RAISE EXCEPTION 'signature_evidence_signature_required';
  END IF;

  SELECT * INTO v_signature_version FROM public.user_signature_versions
  WHERE id = v_signature."activeVersionId" AND "signatureId" = v_signature.id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signature_evidence_signature_missing';
  END IF;

  SELECT * INTO v_standard FROM public.document_standards
  WHERE "documentKey" = p_document_standard_key;
  IF NOT FOUND OR v_standard."publishedVersionId" IS NULL THEN
    RAISE EXCEPTION 'signature_evidence_standard_required';
  END IF;

  SELECT * INTO v_standard_version FROM public.document_standard_versions
  WHERE id = v_standard."publishedVersionId"
    AND "documentKey" = p_document_standard_key
    AND status = 'published';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'signature_evidence_standard_missing';
  END IF;

  SELECT COALESCE(max("approvalSequence"), 0) + 1 INTO v_sequence
  FROM public.document_signature_evidence
  WHERE "documentType" = p_document_type AND "documentId" = p_document_id;

  INSERT INTO public.document_signature_evidence (
    id, "documentType", "documentId", "quotationId", "salesOrderId",
    "documentNumber", "approvalSequence", "signingRole", "signatureVersionId",
    "documentStandardVersionId", "documentFingerprint",
    "signerId", "signerName", "signerRole", "signerTeam",
    "signatureAssetSnapshot", "controlledFormSnapshot", "signedAt", "createdAt"
  ) VALUES (
    p_evidence_id, p_document_type, p_document_id,
    CASE WHEN p_document_type = 'quotation' THEN p_document_id ELSE NULL END,
    CASE WHEN p_document_type = 'sales_order' THEN p_document_id ELSE NULL END,
    p_document_number, v_sequence, p_signing_role, v_signature_version.id,
    v_standard_version.id, p_document_fingerprint,
    p_actor_id, p_actor_name, p_actor_role, p_actor_team,
    jsonb_build_object(
      'versionId', v_signature_version.id,
      'versionNumber', v_signature_version."versionNumber",
      'storageBucket', v_signature_version."storageBucket",
      'storagePath', v_signature_version."storagePath",
      'mimeType', v_signature_version."mimeType",
      'sizeBytes', v_signature_version."sizeBytes",
      'sha256', v_signature_version.sha256,
      'width', v_signature_version.width,
      'height', v_signature_version.height
    ),
    jsonb_build_object(
      'versionId', v_standard_version.id,
      'documentKey', v_standard_version."documentKey",
      'versionNumber', v_standard_version."versionNumber",
      'formCode', v_standard_version."formCode",
      'revision', v_standard_version.revision,
      'effectiveDate', to_char(v_standard_version."effectiveDate", 'YYYY-MM-DD'),
      'titleTh', v_standard_version."titleTh",
      'titleEn', v_standard_version."titleEn",
      'accentKey', v_standard_version."accentKey",
      'numberingPattern', v_standard_version."numberingPattern"
    ),
    p_signed_at, p_signed_at
  ) RETURNING * INTO v_evidence;

  RETURN v_evidence;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_document_signature_evidence(
  text, text, text, text, text, text, text, text, text, text, timestamptz, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.capture_document_signature_evidence(
  text, text, text, text, text, text, text, text, text, text, timestamptz, text
) TO service_role;

-- Rollback guidance:
-- 1) DROP FUNCTION capture_document_signature_evidence(... , text) แล้ว CREATE กลับเป็นเวอร์ชัน
--    11 params ของ 0125:124-235 (ไม่มี signingRole ใน INSERT) + regrant
-- 2) recreate trigger 2 ตัวกลับเป็น 0126 (QT) และ 0127:67-81 (SO) — เอาบล็อก proposer ออก
-- 3) คอลัมน์/คอนสเตรนต์/อินเด็กซ์ที่เพิ่มคงไว้ได้ ไม่กระทบพฤติกรรมเดิม (แถวทั้งหมดเป็น approver)
--    ถ้าจะถอนจริงต้องมั่นใจว่าไม่มีแถว signingRole='proposer' และไม่มี pointer ผู้ยื่นค้างอยู่

NOTIFY pgrst, 'reload schema';
