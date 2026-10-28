-- ══════════════════════════════════════════════════════════════════════
--  0413: คำร้องขอเอกสารการเงินบอกเองว่าเป็นของงวดไหน (ขอเอกสารจากหน้า QT · มติเจ้าของ 28/10/2026)
--
--  ⭐ คำขอ: เปิดคำร้องขอเอกสารบัญชีจากหน้าใบเสนอราคาได้เลย และเลือกงวดชำระได้ — ตั้งแต่ยังไม่มีใบสั่งขาย
--    มติ (ถามทีละข้อ 28/10): ① เลือกงวด หรือ "ไม่ระบุงวด" ก็ได้ ② ยอดเติมตามงวด แก้ได้อิสระ
--    ③ **งวดเดียวมีได้หลายคำร้อง** (ใบวางบิลก่อน · ใบเสร็จทีหลัง) ④ ปุ่มรายแถว + ปุ่มรวมบนหน้า QT (PR-2)
--
--  ── ทำไมลิงก์ต้องย้ายมาอยู่ฝั่งคำร้อง ─────────────────────────────────────
--  0260 เก็บลิงก์ไว้ที่ `sales_order_installments."billingRequestId"` ช่องเดียว ⇒ งวดหนึ่งชี้ได้คำร้องเดียว (ขัดมติ ③)
--  และต้องมีแถวงวดก่อน ⇒ ไม่มีใบสั่งขาย = ผูกไม่ได้ (ขัดคำขอ)
--  ⇒ คำร้องถือ `"installmentId"` เอง (หลายคำร้องชี้งวดเดียวได้) + `"installmentSeq"` = งวดที่เลือกจากแผน QT ตอนยังไม่มีแถวงวด
--
--  ── ทำไม id ของแถวงวด ไม่ใช่ (ใบเสนอราคา, เลขงวด) ────────────────────────
--  🔴 แถวงวด **ย้ายข้ามใบโดย id เดิม**: ออก Rev. ใบสั่งขาย (0376) · ยกเงินจากใบที่ยกเลิก (0378) — ใบปลายทางมาจาก QT คนละใบเสมอ
--     (sales_orders."quotationId" UNIQUE) · และ **เลขงวดเปลี่ยนได้** ตอนปรับแผน (0377 เลื่อน seq) ⇒ จับคู่ด้วยเลขหลุดทุกเส้น
--  ⭐ เลข (`installmentSeq`) ใช้แค่ช่วง "ยังไม่มีแถวงวด" — webapp ผูกคำร้องที่รออยู่ตามเลข **ทันทีที่สร้างแถวงวดจากแผน QT**
--     (`ensureInstallments` — ณ วินาทีนั้นเลขงวด = เลขในแผน QT เป๊ะ) แล้วจากนั้นยึด id ตลอด
--
--  ── ทำไมคง `sales_order_installments."billingRequestId"` ไว้ ─────────────
--  SQL ของ 0376 (ออก Rev. ตรวจแถวที่ย้าย) · 0377/0378 (`_so_installment_replan_locked` — งวดที่ผูกคำร้อง = ล็อกจากปรับแผน)
--  อ่านช่องนี้อยู่ ⇒ ไม่แตะ SQL เดิม · ช่องนี้กลายเป็น **ตัวชี้** = คำร้องแรกที่ผูกงวดนี้ (ทุกสถานะ) — webapp เขียนที่ฟังก์ชันเดียว
--  (`syncBillingPointers`) หลังทุกการผูก/ถอด/ลบ · ความหมายของล็อกเท่าเดิมทุกประการ ("มีคำร้องผูกอยู่ = ห้ามปรับแผนแถวนี้")
--
--  ── ทำไมคราวนี้มี FK (0260 ไม่มี) ─────────────────────────────────────────
--  ทิศกลับกัน: 0260 ชี้จากงวดไปคำร้อง (คำร้องถูกบังคับลบได้ งวดต้องยังอ่านได้) · ไฟล์นี้ชี้จากคำร้องไปงวด
--  ⇒ แถวงวดถูกลบ (บังคับลบใบ · ตั้งงวดใหม่ตอนอนุมัติ · ลบแถวเปิดตอนปรับแผน) = ลิงก์ว่างเอง (ON DELETE SET NULL)
--     ไม่มีคำร้องชี้ไปแถวที่ไม่มีอยู่ · ลบคำร้องไม่กระทบงวด (FK อยู่ฝั่งคำร้อง)
--  ⚠️ แถวงวดถูกลบแล้ว `installmentSeq` ยังอยู่ ⇒ ใบสั่งขายใบใหม่ของ QT เดียวกันสร้างงวดเมื่อไร คำร้องกลับไปเกาะงวดเลขเดิม
--     (ตรงกับที่ผู้ใช้เลือก "งวดที่ n ของ QT นี้") · เส้นตั้งงวดใหม่ตอนอนุมัติ (แผน QT เปลี่ยนจำนวนงวด) webapp ล้างทั้งสองช่องก่อนลบ
--     — คงกติกาเดิมของ freezeInstallments "ไม่อุ้มคำร้องข้ามการตั้งใหม่" (ยอดเปลี่ยน = เลขเดิมไม่ได้แปลว่าเงินก้อนเดิม)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  1) dept_requests."installmentId" text FK → sales_order_installments(id) ON DELETE SET NULL
--  2) dept_requests."installmentSeq" smallint
--  3) CHECK dept_requests_installment_shape — สองช่องนี้มีได้เฉพาะคำร้อง billing_doc · เลข 1–12 (เพดานจำนวนงวดของ 0377) ·
--     มีเลขต้องอ้างใบเสนอราคา (เลขไม่มีความหมายถ้าไม่รู้ว่าแผนของ QT ไหน)
--  4) ดัชนี: ตามงวด ("งวดนี้มีคำร้องอะไรบ้าง") · คำร้องที่รอผูกตามเลข (ตอนสร้างแถวงวด)
--  5) backfill: ลิงก์เดิมของ 0260 → คำร้อง (`installmentId` + `installmentSeq` = เลขงวด ณ วันนี้) — เฉพาะคำร้อง billing_doc
--     ที่ยังว่าง ⇒ รันซ้ำได้ (รอบสองเจอ 0 แถว) · ลิงก์ที่โค้ดรุ่นเก่าเขียนหลังรันไฟล์นี้ (ก่อน deploy) webapp อ่านเจอผ่านตัวชี้อยู่แล้ว
--     · ตามกติกา 0260 คำร้องหนึ่งใบเกาะได้งวดเดียว — ถ้าเจอหลายงวด (ข้อมูลเพี้ยน) เอางวดเลขน้อยสุด แล้ว SELECT ท้ายไฟล์บอกจำนวน
--
--  ⛔ ไม่แตะ: sales_order_installments (คอลัมน์/CHECK/ดัชนี/ข้อมูล) · ฟังก์ชันของ 0376/0377/0378 · trigger ใด ๆ
--  🛑 **รันก่อน deploy โค้ดของงานนี้** — โค้ดใหม่อ่าน/เขียนสองคอลัมน์นี้ (ก่อนรัน: จออ่านถอยไปใช้ตัวชี้ · ทางเขียนตอบ 503 "รอรัน 0413")
--     · รันก่อน deploy ได้ทันที: โค้ดเดิมไม่รู้จักคอลัมน์ใหม่ และไม่มีอะไรเปลี่ยนความหมายของข้อมูลเดิม
--  ⚠️ DDL — รันมือบน Supabase SQL Editor · ✅ รันซ้ำได้
-- ══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "installmentId" text,
  ADD COLUMN IF NOT EXISTS "installmentSeq" smallint;

ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_installment_fk;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_installment_fk
  FOREIGN KEY ("installmentId") REFERENCES public.sales_order_installments(id) ON DELETE SET NULL;

ALTER TABLE public.dept_requests
  DROP CONSTRAINT IF EXISTS dept_requests_installment_shape;
ALTER TABLE public.dept_requests
  ADD CONSTRAINT dept_requests_installment_shape CHECK (
    (("installmentId" IS NULL AND "installmentSeq" IS NULL) OR kind = 'billing_doc')
    AND ("installmentSeq" IS NULL OR ("installmentSeq" BETWEEN 1 AND 12 AND "quotationId" IS NOT NULL))
  );

COMMENT ON COLUMN public.dept_requests."installmentId"
  IS 'งวดชำระที่คำร้องขอเอกสารการเงินนี้ครอบ (หลายคำร้องต่องวดได้) · 0413';
COMMENT ON COLUMN public.dept_requests."installmentSeq"
  IS 'งวดที่เลือกจากแผนของใบเสนอราคา — ใช้ผูกตอนสร้างแถวงวด และโชว์ตอนยังไม่มีใบสั่งขาย · 0413';

DROP INDEX IF EXISTS dept_requests_installment_idx;
CREATE INDEX dept_requests_installment_idx
  ON public.dept_requests ("installmentId")
  WHERE "installmentId" IS NOT NULL;

DROP INDEX IF EXISTS dept_requests_installment_pending_idx;
CREATE INDEX dept_requests_installment_pending_idx
  ON public.dept_requests ("quotationId", "installmentSeq")
  WHERE "installmentId" IS NULL AND "installmentSeq" IS NOT NULL;

UPDATE public.dept_requests r
   SET "installmentId" = i.id,
       "installmentSeq" = LEAST(GREATEST(i.seq, 1), 12)
  FROM (
    SELECT DISTINCT ON ("billingRequestId") "billingRequestId", id, seq
      FROM public.sales_order_installments
     WHERE "billingRequestId" IS NOT NULL
     ORDER BY "billingRequestId", seq, id
  ) i
 WHERE i."billingRequestId" = r.id
   AND r.kind = 'billing_doc'
   AND r."installmentId" IS NULL
   AND r."quotationId" IS NOT NULL;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- ตรวจหลังรัน: คอลัมน์ครบ · ลิงก์เดิมย้ายครบ (unmoved ควรเป็น 0) · คำร้องที่เกาะหลายงวด (ควรเป็น 0)
SELECT
  (SELECT count(*) FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dept_requests'
      AND column_name IN ('installmentId', 'installmentSeq')) AS columns_added,
  (SELECT count(*) FROM public.dept_requests WHERE "installmentId" IS NOT NULL) AS linked_requests,
  (SELECT count(*) FROM public.sales_order_installments i
     JOIN public.dept_requests r ON r.id = i."billingRequestId"
    WHERE r.kind = 'billing_doc' AND r."quotationId" IS NOT NULL AND r."installmentId" IS NULL) AS unmoved,
  (SELECT count(*) FROM (
     SELECT "billingRequestId" FROM public.sales_order_installments
      WHERE "billingRequestId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1) d) AS multi_installment_requests;
