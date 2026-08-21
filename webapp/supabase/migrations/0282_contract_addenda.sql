-- ============================================================
--  Migration 0282: บันทึกเพิ่มเติมสัญญา (Addendum)
--
--  ⭐ มติผู้ใช้ 2026-08-21: *"บันทึกเพิ่มเติมฉบับนี้ ออกภายในสัญญาหลัก และเป็นสถานะ
--     ลงนามแล้ว และต้องอ้างอิงคำร้องพัฒนากลิ่นที่ปิดเรื่อง เนื่องจากมีข้อมูลกลิ่น สูตร"*
--     เลขที่ต่อจากสัญญาแม่: CT-YYMMXXXX-A1 · A2 · A3 …
--
--  ⭐ **ตารางแยก ไม่ใช่ kind ใหม่ของ sales_contracts** — บันทึกเป็น "เอกสารลูก" ของสัญญา
--     ใบหนึ่ง (ต้องมีสัญญาแม่เสมอ) ส่วน `kind` ของสัญญาหมายถึง *ชนิดสัญญา* (ออกแบบกลิ่น/
--     จ้างผลิต/บริการ) ⇒ ยัดรวมกันเมื่อไร ทุกด่านที่ถาม "สัญญาชนิดไหน" ต้องมาแยกกรณี
--     ว่าแถวนี้เป็นสัญญาหรือบันทึก ซึ่งเป็นเงื่อนไขที่ลืมง่ายและพังเงียบ
--
--  ⚠️ **FK เป็น RESTRICT ทั้งสองทาง** (สัญญาแม่ · คำร้องที่อ้าง) — บันทึกที่ลงนามแล้ว
--     เป็นส่วนหนึ่งของสัญญาตามข้อ 2 ของตัวมันเอง ⇒ ลบของต้นทางทิ้งแล้วบันทึกลอยไม่ได้
--
--  ⚠️ **ตารางสูตรถูกตรึงลงใบ** (`lines` jsonb) ตั้งแต่ตอนสร้าง — ทะเบียนสูตรแก้ทีหลัง
--     ต้องไม่ไปเปลี่ยนกระดาษที่ลูกค้าเซ็นไปแล้ว (กติกาเดียวกับ issuedHtml ของสัญญา)
--
--  🛑 ต้องรันก่อน deploy โค้ด · ⚠ รันมือบน Supabase SQL Editor · รันซ้ำได้
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.sales_contract_addenda (
  id             text PRIMARY KEY,
  -- สัญญาแม่ — บันทึกไม่มีตัวตนถ้าไม่มีสัญญา (RESTRICT: ลบสัญญาทิ้งไม่ได้ถ้ามีบันทึก)
  "contractId"   text NOT NULL REFERENCES public.sales_contracts(id) ON DELETE RESTRICT,
  -- ครั้งที่ 1, 2, 3 … ต่อสัญญาหนึ่งใบ · เลขที่เต็ม = <เลขสัญญา>-A<ครั้งที่>
  "addendumNo"   integer NOT NULL CHECK ("addendumNo" >= 1),
  "docNo"        text UNIQUE,
  status         text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'awaiting_signature', 'signed', 'cancelled')),
  "addendumDate" date NOT NULL DEFAULT CURRENT_DATE,

  -- คำร้องพัฒนากลิ่นที่ปิดเรื่องแล้ว = ที่มาของตารางสูตร (มติผู้ใช้)
  "requestId"    text REFERENCES public.dept_requests(id) ON DELETE RESTRICT,
  "requestDocNo" text,
  -- ตารางสูตรที่ตรึงลงใบ: [{ seq, name, code, formulaDate, scentCode }]
  lines          jsonb NOT NULL DEFAULT '[]'::jsonb,
  fields         jsonb NOT NULL DEFAULT '{}'::jsonb,
  "templateKey"     text,
  "templateVersion" text,

  "issuedAt"     timestamptz,
  "issuedBy"     text,
  "issuedByName" text,
  "issuedHtml"   text,

  "signedAt"     timestamptz,
  "signedDate"   date,
  -- ⚠️ uuid ไม่ใช่ text — attachments.id เป็น uuid (mig 0028) ต่างจาก id ของสายขาย
  "signedFileId" uuid REFERENCES public.attachments(id) ON DELETE SET NULL,

  "cancelledAt"  timestamptz,
  "cancelReason" text,

  -- สำเนาจากสัญญาแม่ตอนสร้าง — ด่านรายแถวของสายขายอ่าน team + ownerId จากตัวแถวเอง
  team           text,
  "ownerId"      text,
  "ownerName"    text,
  notes          text,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  "createdBy"     text,
  "createdByName" text,
  "createdAt"    timestamptz NOT NULL DEFAULT now(),
  "updatedAt"    timestamptz NOT NULL DEFAULT now(),

  -- ครั้งที่ห้ามซ้ำในสัญญาใบเดียวกัน (กันสองคนกดออกบันทึกพร้อมกันแล้วได้ "ครั้งที่ 1" คู่)
  UNIQUE ("contractId", "addendumNo"),
  -- เลขที่กับเวลาที่ออกมาคู่กันเสมอ · เนื้อที่ตรึงตามมาทีหลังได้ (แพตเทิร์นเดียวกับสัญญา)
  CONSTRAINT sales_contract_addenda_issued_complete CHECK (
    ("docNo" IS NULL AND "issuedAt" IS NULL AND "issuedHtml" IS NULL)
    OR ("docNo" IS NOT NULL AND "issuedAt" IS NOT NULL)
  ),
  CONSTRAINT sales_contract_addenda_status_number CHECK (
    status = 'draft' OR status = 'cancelled' OR "docNo" IS NOT NULL
  ),
  CONSTRAINT sales_contract_addenda_signed_needs_date CHECK (
    status <> 'signed' OR "signedDate" IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS sales_contract_addenda_contract_idx
  ON public.sales_contract_addenda ("contractId", "addendumNo");
CREATE INDEX IF NOT EXISTS sales_contract_addenda_status_idx
  ON public.sales_contract_addenda (status);

ALTER TABLE public.sales_contract_addenda ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.sales_contract_addenda FROM anon, authenticated;
GRANT ALL ON TABLE public.sales_contract_addenda TO service_role;

COMMIT;
