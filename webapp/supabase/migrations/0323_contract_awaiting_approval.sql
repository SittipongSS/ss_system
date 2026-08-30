-- ============================================================
--  Migration 0323: เพิ่มขั้น "รอหัวหน้ารับรอง" ให้สัญญาที่ระบบเจนเอง
--                  (มติผู้ใช้ 2026-08-31)
--
--  คำสั่งตั้งต้น: *"สัญญา ตอนบันทึกลงนาม ให้บังคับ ใส่ไฟล์ เลย ใน modal
--  และต้องมีขั้น Approve จาก AE sup ด้วย ไม่งั้นไปทำงานต่อไม่ได้"*
--
--  ⭐ **ของเดิม SA กดบันทึกลงนามแล้วจบเลย** — `signed` เกิดจากคนคนเดียวที่เป็นคน
--  เดียวกับที่ออกสัญญา ⇒ ไม่มีด่านที่สอง · แต่ `signed` เป็นตัวปลดล็อกของจริงหลายอย่าง
--  (สถานะใบเสนอราคา · การเปิดบันทึกเพิ่มเติมสัญญา · ด่านงานบริการเมื่อ unpark)
--
--  สายใหม่ของสัญญาที่ระบบเจน:
--      draft ─[ออกสัญญา]→ awaiting_signature ─[SA บันทึกลงนาม + แนบไฟล์]→
--      **awaiting_approval** ─[AE Sup รับรอง]→ signed ■
--
--  ⚠️ **สาย `external` ไม่มีขั้นนี้ และเป็นมติของผู้ใช้เอง** — เอกสารเซ็นมาจากข้างนอก
--  แล้ว การกดของ AE Sup ที่นั่นคือการอนุมัติ *ให้ใช้เอกสารแทนสัญญา* ซึ่งเป็นด่านที่สอง
--  อยู่แล้ว ⇒ กดทีเดียว draft → signed เหมือนเดิมทุกประการ
--  ⇒ **สองสายไปจบที่ "signed + มีคนรับรอง" เหมือนกัน** ต่างแค่จำนวนคลิก
--
--  ⭐ `signed` จึงแปลว่า **"ใช้งานได้"** เหมือนเดิมทุกประการ — ของที่กินสถานะนี้อยู่
--  ไม่ต้องแก้สักจุด (ทางเลือกอีกทางคือปล่อย signed เกิดตอน SA กด แล้วให้ทุกจุด
--  ปลายทางเช็ค `approvedAt` เพิ่มเอง ซึ่งตกหล่นจุดเดียวก็คือด่านที่รั่วเงียบ ๆ)
--
--  ⚠️ **ไม่มีแถวไหนต้องแปลง** — วัดสด 2026-08-31: ยังไม่มีสัญญาสถานะ `signed` เลย
--  สักใบ (มี cancelled 1 · awaiting_signature 1 · draft 2) ⇒ CHECK ใหม่ที่บังคับว่า
--  `signed` ต้องมีคนรับรอง จึงไม่เตะแถวเดิมทิ้ง
--
--  🛑 **ต้องรันก่อน deploy** — โค้ดใหม่เขียน `status = 'awaiting_approval'` ตอน SA
--  กดบันทึกลงนาม ซึ่งค่านี้ยังไม่ผ่าน CHECK เดิม ⇒ deploy ก่อนรัน = กดลงนามแล้ว
--  ได้ 23514 ที่ผู้ใช้อ่านไม่รู้เรื่อง
--  รันซ้ำได้ (idempotent)
-- ============================================================

BEGIN;

/* ⚠️ **ต้อง DROP แล้ว ADD ชื่อเดิม** ไม่ใช่ `ADD CHECK` เฉย ๆ (ท่าเดียวกับ mig 0280
   ที่เพิ่มค่า `revised`) — `ADD CHECK` จะได้ constraint ชื่อออโต้มาซ้อนตัวเก่า
   แล้วค่าใหม่ยังถูกเตะเหมือนเดิมโดยไม่มีอะไรบอก */
ALTER TABLE public.sales_contracts DROP CONSTRAINT IF EXISTS sales_contracts_status_check;
ALTER TABLE public.sales_contracts
  ADD CONSTRAINT sales_contracts_status_check
  CHECK (status IN ('draft', 'awaiting_signature', 'awaiting_approval', 'signed', 'revised', 'cancelled'));

DO $$
BEGIN
  /* ⭐ **`signed` ต้องมีคนรับรองเสมอ ทั้งสองสาย** — ของเดิมบังคับเฉพาะ external
     (`sales_contracts_external_approved` ของ mig 0322) ซึ่งตอนนั้นถูก เพราะสาย
     generated ยังไม่มีขั้นรับรอง · ตอนนี้มีแล้ว ⇒ ยกกฎขึ้นมาคุมทั้งตาราง
     ⇒ ตัวเก่าถูกกลืนโดยตัวใหม่ทั้งดุ้น จึงถอดทิ้ง ไม่ใช่ปล่อยไว้ให้มีสองตัวคุมเรื่องเดียวกัน */
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_contracts_signed_needs_approval') THEN
    ALTER TABLE public.sales_contracts
      ADD CONSTRAINT sales_contracts_signed_needs_approval
      CHECK (
        status <> 'signed'
        OR ("approvedById" IS NOT NULL AND "approvedAt" IS NOT NULL)
      );
  END IF;

  /* ⭐ ขั้น "รอหัวหน้ารับรอง" เกิดจากการบันทึกลงนามเท่านั้น ⇒ ต้องมีไฟล์กับวันที่ครบ
     (มติผู้ใช้: "ตอนบันทึกลงนาม ให้บังคับ ใส่ไฟล์ เลย") — บังคับที่ฐานด้วย ไม่ใช่
     พึ่งว่าจอจะไม่ปล่อยผ่าน · ใบที่อยู่ขั้นนี้โดยไม่มีไฟล์คือใบที่ตอบไม่ได้ว่ารับรองอะไร */
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_contracts_awaiting_approval_signed') THEN
    ALTER TABLE public.sales_contracts
      ADD CONSTRAINT sales_contracts_awaiting_approval_signed
      CHECK (
        status <> 'awaiting_approval'
        OR ("signedDate" IS NOT NULL AND "signedFileId" IS NOT NULL)
      );
  END IF;

  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sales_contracts_external_approved') THEN
    ALTER TABLE public.sales_contracts DROP CONSTRAINT sales_contracts_external_approved;
  END IF;
END $$;

COMMENT ON COLUMN public.sales_contracts."approvedById" IS
  'ผู้รับรองสัญญา (AE Supervisor) — สาย generated รับรองหลังลงนาม · สาย external รับรองพร้อมอนุมัติเอกสารแทนสัญญา';

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ตรวจหลังรัน:
--   SELECT status, count(*) FROM public.sales_contracts GROUP BY status;
--   -- ต้องไม่มีแถว signed ที่ approvedAt ว่าง:
--   SELECT count(*) FROM public.sales_contracts WHERE status = 'signed' AND "approvedAt" IS NULL;
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.sales_contracts'::regclass
--     AND conname LIKE 'sales_contracts_%approv%';   -- ควรเหลือ 2 ตัวใหม่ ไม่มี _external_approved
--
-- Rollback guidance:
--   ALTER TABLE public.sales_contracts
--     DROP CONSTRAINT sales_contracts_signed_needs_approval,
--     DROP CONSTRAINT sales_contracts_awaiting_approval_signed;
--   -- แล้วคืน CHECK สถานะเป็นชุดเดิม (ห้ามถอยถ้ามีแถว awaiting_approval ค้างอยู่ —
--   -- ต้องดันให้เป็น signed หรือถอยกลับ awaiting_signature ก่อน)
