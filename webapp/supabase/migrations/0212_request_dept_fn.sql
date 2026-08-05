-- ── 0212 · เปิดฝ่ายบัญชี (FN) ให้รับคำร้องได้ ────────────────────────────
--
-- ⭐ คำร้องขอเอกสารการเงิน ตาม docs/service-business-system-plan.md §4
-- ("ไม่ต้องสร้างโมดูลใหม่ — สายงานตรงกับสถานะของคำร้องที่มีอยู่แล้วทุกขั้น")
--
-- ⚠️ มี **สองกำแพง ไม่ใช่หนึ่ง** — แผนบันทึกไว้แค่ตัวแรก:
--   1) dept_requests.dept        CHECK รับแค่ RD/PC   ← แผนเขียนไว้
--   2) dept_request_items.lineKind CHECK รับแค่ 4 ค่า  ← เจอตอนไล่โค้ดจริง
-- ขาดข้อ 2 = เปิดคำร้องได้ แต่ **บันทึกบรรทัดไม่ได้** ซึ่งพังตอนกดส่งไม่ใช่ตอนเปิด
--
-- ⚠️ ชื่อ constraint ของข้อ 1 **ไม่ใช่ชื่อที่เดาได้** — ประกาศแบบ inline ใน 0158 ตอน
-- ตารางยังชื่อ `material_price_asks` · 0173 rename ตารางแต่ constraint คงชื่อเดิม
-- ⇒ ชื่อจริงคือ `material_price_asks_dept_check` (ยืนยันด้วย pg_get_constraintdef
-- บน prod แล้ว ไม่ได้เดา) · ของข้อ 2 ตั้งชื่อไว้ชัดเจนตั้งแต่ 0204
--
-- ⚠️ ทั้งคู่ผ่อนให้ **รับค่าเพิ่ม** เท่านั้น — แถวเดิมทุกแถวยังผ่าน CHECK ใหม่เสมอ
-- ไม่ต้อง backfill และไม่มีทางล้มกลางคัน · รันซ้ำได้

-- ── 1) ฝ่ายผู้รับคำร้อง ──────────────────────────────────────────────────
ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS material_price_asks_dept_check;
ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_dept_check;

-- ตั้งชื่อใหม่ให้ตรงกับตารางจริง — ชื่อที่อ้างตารางที่ไม่มีอยู่แล้วคือกับดักของคนถัดไป
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_dept_check
  CHECK (dept IN ('RD', 'PC', 'FN'));

-- ── 2) รูปร่างบรรทัด ────────────────────────────────────────────────────
-- `billing_doc` เก็บเหมือน `document` ทุกประการ (docType + spec) ต่างแค่ชุดคำศัพท์
-- ⇒ กฎรูปร่างของมันคือกฎเดียวกับ document: ต้องมี docType
ALTER TABLE public.dept_request_items
  DROP CONSTRAINT IF EXISTS dept_request_items_line_kind_check;
ALTER TABLE public.dept_request_items
  ADD CONSTRAINT dept_request_items_line_kind_check
  CHECK ("lineKind" IN ('material', 'scent_dev', 'product_dev', 'document', 'billing_doc'));

ALTER TABLE public.dept_request_items
  DROP CONSTRAINT IF EXISTS dept_request_items_shape;
ALTER TABLE public.dept_request_items
  ADD CONSTRAINT dept_request_items_shape CHECK (
    ("lineKind" <> 'material'    OR ("materialId" IS NOT NULL AND kind IS NOT NULL)) AND
    ("lineKind" <> 'product_dev' OR ("categoryCode" IS NOT NULL AND "scentId" IS NOT NULL)) AND
    ("lineKind" <> 'document'    OR "docType" IS NOT NULL) AND
    ("lineKind" <> 'billing_doc' OR "docType" IS NOT NULL));

NOTIFY pgrst, 'reload schema';
