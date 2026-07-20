-- ============================================================================
-- RESET (แคบ): ล้างเฉพาะ ใบเสนอราคา (QT) + Sale Order (SO) ให้เหลือ 0
-- ----------------------------------------------------------------------------
-- ใช้เมื่อ: ต้องการรีเซ็ตรอบทดลองออกใบ/อนุมัติ/เซ็น โดย "เก็บ" ดีล ลูกค้า โครงการ
-- ประวัติยอด และ pipeline อื่นไว้ตามเดิม (ต่างจาก reset_sales_pm_excise.sql ที่ล้างทั้ง pipeline)
--
-- ลบ:
--   • quotations + quotation_lines
--   • sales_orders + sales_order_lines
--   • หลักฐาน/เอกสารที่ผูกกับ 2 ตัวบน (mig 0125/0127/0130):
--       document_signature_evidence, document_signature_evidence_overrides,
--       issued_documents, issued_document_artifacts
--     ↳ ตารางกลุ่มนี้ปกติ "ลบไม่ได้" (guard trigger + FK RESTRICT) เพราะเป็นหลักฐาน
--       ลายเซ็นอิเล็กทรอนิกส์แบบ immutable — โหมด replica ด้านล่างปิด guard ชั่วคราวให้ลบได้
-- เก็บ (ไม่แตะ): ดีล, ลูกค้า, โครงการ, ลีด, สอบถาม, forecast, sales_history, targets,
--   ลายเซ็นผู้ใช้ (user_signatures/*), Document Standard, Commercial Preset
--
-- ⚠️ ลบถาวร กู้ไม่ได้ + ทำลายหลักฐานลายเซ็น — รันบน environment ทดลองเท่านั้น / snapshot ก่อนบน prod
-- ⚠️ ดีลที่ Won ด้วยใบที่ถูกลบจะค้าง logical ref (metadata.acceptedQuotationId) และสถานะ
--    Won โดยไม่มีใบอ้างอิง — ดูบล็อก "(ทางเลือก) เก็บกวาดฝั่งดีล" ท้ายไฟล์ถ้าต้องการถอย Won ด้วย
-- วิธีรัน: Supabase SQL Editor (role postgres) หรือ psql ด้วยสิทธิ์ owner/superuser
-- ============================================================================

-- ── (ทางเลือก) ดูจำนวนก่อนลบ ───────────────────────────────────────────────
-- SELECT 'quotations' t, count(*) c FROM public.quotations
-- UNION ALL SELECT 'quotation_lines', count(*) FROM public.quotation_lines
-- UNION ALL SELECT 'sales_orders', count(*) FROM public.sales_orders
-- UNION ALL SELECT 'sales_order_lines', count(*) FROM public.sales_order_lines
-- UNION ALL SELECT 'signature_evidence', count(*) FROM public.document_signature_evidence
-- UNION ALL SELECT 'evidence_overrides', count(*) FROM public.document_signature_evidence_overrides
-- UNION ALL SELECT 'issued_documents', count(*) FROM public.issued_documents
-- UNION ALL SELECT 'issued_doc_artifacts', count(*) FROM public.issued_document_artifacts
-- UNION ALL SELECT '== KEEP deals', count(*) FROM public.sales_deals
-- UNION ALL SELECT '== KEEP projects', count(*) FROM public.projects;

BEGIN;

-- ปิด trigger ทั้งหมดของ session นี้ (FK RESTRICT + guard หลักฐาน immutable)
-- → ลบตาม list ได้ทุกลำดับ ไม่ติด constraint และไม่ cascade เกิน list
SET session_replication_role = replica;

-- ── เอกสารที่ออก/หลักฐาน (mig 0130 → 0127 → 0125) : ลูกก่อนแม่ ──────────────
DELETE FROM public.issued_document_artifacts;
DELETE FROM public.issued_documents;
DELETE FROM public.document_signature_evidence_overrides;
DELETE FROM public.document_signature_evidence;

-- ── Sale Order + บรรทัด ────────────────────────────────────────────────────
DELETE FROM public.sales_order_lines;
DELETE FROM public.sales_orders;

-- ── ใบเสนอราคา + บรรทัด ────────────────────────────────────────────────────
DELETE FROM public.quotation_lines;
DELETE FROM public.quotations;

-- เปิด trigger คืน (สำคัญ — ห้ามลืม ไม่งั้น session ถัดไปข้าม FK/guard)
SET session_replication_role = DEFAULT;

COMMIT;

-- ── ตรวจหลังลบ — กลุ่มลบต้องได้ 0, KEEP คงเดิม ────────────────────────────
-- SELECT 'quotations' t, count(*) c FROM public.quotations
-- UNION ALL SELECT 'sales_orders', count(*) FROM public.sales_orders
-- UNION ALL SELECT 'signature_evidence', count(*) FROM public.document_signature_evidence
-- UNION ALL SELECT 'issued_documents', count(*) FROM public.issued_documents
-- UNION ALL SELECT '== KEEP deals', count(*) FROM public.sales_deals
-- UNION ALL SELECT '== KEEP projects', count(*) FROM public.projects;

-- ============================================================================
-- (ทางเลือก) เก็บกวาดฝั่งดีลหลังลบใบ — รันแยกถ้าต้องการให้ดีลกลับมาสะอาด
-- ----------------------------------------------------------------------------
-- ปัญหา: ดีลที่เคย Won ด้วยใบที่เพิ่งลบจะเหลือ (ก) pointer ค้างใน metadata
--   (acceptedQuotationId) และ (ข) stage = 'won' ทั้งที่ไม่มีใบ/SO อ้างแล้ว
-- บล็อกนี้ถอย Won กลับเป็น 'quotation' (พร้อมออกใบใหม่) + ล้าง pointer
-- stage ที่ใช้ได้จริง (mig 0082): lead, qualified, quotation, timeline_proposed,
--   awaiting_confirm, deposit_pending, won, lost — ('in_project' ถูกยุบเป็น 'won' แล้ว)
-- ⚠️ แตะเฉพาะดีลที่ต้องการจริง; ถ้ามี wonValue/wonAt ค้างอาจต้องล้างเพิ่มตามสคีมา
--
-- BEGIN;
-- UPDATE public.sales_deals
--    SET metadata = metadata - 'acceptedQuotationId'
--  WHERE metadata ? 'acceptedQuotationId';
-- UPDATE public.sales_deals
--    SET stage = 'quotation'
--  WHERE stage = 'won';
-- COMMIT;
-- ============================================================================
