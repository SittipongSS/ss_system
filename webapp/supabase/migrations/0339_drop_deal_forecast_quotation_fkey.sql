-- ============================================================
--  Migration 0339: ถอน FK `sales_deals."forecastQuotationId"` → quotations
--  🔥 hotfix — production พังตั้งแต่ 0337 ขึ้น (2026-09-02)
--
--  อาการ: หน้าทะเบียนใบเสนอราคาขึ้นแถบแดง
--    "Could not embed because more than one relationship was found
--     for 'quotations' and 'sales_deals'"
--  แล้วตารางว่างเปล่า · KPI ทุกใบเป็น 0
--
--  ⭐ **สาเหตุ: PostgREST เดาทางเชื่อมไม่ได้เมื่อสองตารางมี FK หากันมากกว่าหนึ่งเส้น**
--     เดิมมีเส้นเดียว `quotations."dealId"` → `sales_deals.id` ⇒ `select('*, deal:sales_deals(*)')`
--     ตีความได้ทางเดียว · 0337 เพิ่มเส้นที่สองสวนทาง (`sales_deals."forecastQuotationId"`
--     → `quotations.id`) ⇒ ทุก embed ระหว่างสองตารางนี้กลายเป็นกำกวมทันทีทั้งระบบ
--     (ทะเบียนใบเสนอราคา · ด่าน loadScoped · ป้ายตัวเลขบนเมนู · คิวอนุมัติ …)
--
--  ⚠️ **นี่คือกับดักของการเพิ่ม FK ระหว่างสองตารางที่ embed หากันอยู่แล้ว** — ไม่ใช่
--     เรื่องเฉพาะของ FC · ก่อนเพิ่ม FK เส้นใหม่ ต้องเช็คก่อนว่าคู่ตารางนั้นมี
--     `select('..., x:table(...)')` อยู่ที่ไหนบ้าง ถ้ามี ต้องเลือกอย่างใดอย่างหนึ่ง:
--       (ก) ไม่ใส่ FK  — ใช้เมื่อมีกลไกอื่นดูแลความสอดคล้องอยู่แล้ว  ← เลือกทางนี้
--       (ข) ใส่ FK แล้วไปเติมชื่อ constraint ให้ทุก embed
--           (`sales_deals!quotations_dealId_fkey(...)`) ครบทุกจุด ห้ามตกแม้จุดเดียว
--     ทางที่สองแตะ 8 เส้นทางร้อน (รวม `lib/scopedRow.js` ที่ใช้ร่วมกับใบสั่งขาย/สัญญา)
--     และตกจุดเดียว = หน้านั้น 500 ⇒ แลกไม่คุ้มกับสิ่งที่ FK ให้
--
--  🔒 **ความสอดคล้องของตัวชี้ยังอยู่ครบ ไม่ได้หายไปกับ FK**:
--    1. trigger `quotations_demote_deal_forecast_trg` (0337) — BEFORE DELETE บน
--       quotations ล้าง `forecastQuotationId` + คืน `projectValue` เป็นยอดที่ AE กรอก
--       **ในทรานแซกชันเดียวกับการลบ** · ตัวนี้ทำงานได้ดีกว่า ON DELETE SET NULL ด้วยซ้ำ
--       เพราะ SET NULL เฉย ๆ จะทิ้งดีลไว้ที่ยอดของใบที่ตายแล้ว (และชน CHECK ข้างล่าง)
--    2. CHECK `sales_deals_forecast_pointer_check` — ยังบังคับว่า
--       `forecastSource='quotation'` ต้องมีตัวชี้เสมอ (คงไว้ ไม่ถอน)
--    3. resolver ฝั่ง JS ไม่เคยเชื่อตัวชี้ลอย ๆ — อ่านแถวใบจริงทุกครั้งก่อนคิดยอด
--       ใบที่หายไปแล้วตกด่าน eligible เอง (`lib/sales/forecastSource.js`)
--
--  ⚠️ ดัชนี `sales_deals_forecast_quotation_idx` **คงไว้** — trigger ตอนลบใบใช้มันหา
--     แถวดีล (`WHERE "forecastQuotationId" = OLD.id`) ไม่เกี่ยวกับ FK
-- ============================================================

BEGIN;

ALTER TABLE public.sales_deals
  DROP CONSTRAINT IF EXISTS sales_deals_forecast_quotation_fkey;

COMMENT ON COLUMN public.sales_deals."forecastQuotationId" IS
  'ใบเสนอราคาที่ FC เดินตามอยู่ (ฉบับแก้ล่าสุดของเลขที่นั้น) — NULL เสมอเมื่อ forecastSource=manual · ไม่มี FK โดยเจตนา (mig 0339: FK เส้นที่สองทำให้ PostgREST embed quotations↔sales_deals ไม่ได้) · ความสอดคล้องดูแลด้วย trigger quotations_demote_deal_forecast_trg + CHECK sales_deals_forecast_pointer_check';

COMMIT;

NOTIFY pgrst, 'reload schema';
