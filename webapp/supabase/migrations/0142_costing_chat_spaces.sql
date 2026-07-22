-- 0142 - ระบบขอราคาต้นทุน PR4: เพิ่ม Google Chat space ของฝ่ายจัดซื้อ + ผู้บริหาร
--
-- ระบบขอราคาต้องแจ้งข้ามฝ่าย 3 ทาง: RD (มี space อยู่แล้ว), **PC ฝ่ายจัดซื้อ**
-- และ **ผู้บริหาร** ซึ่งยังไม่มี space. chat_webhook_settings (mig 0133) มี CHECK
-- ล็อกรายการ key ไว้ 5 ค่า จึงต้องผ่อน CHECK ก่อนถึงจะเพิ่มได้
--
-- ไม่ตั้งค่า URL ให้: space ที่ยังไม่มีเวอร์ชันเผยแพร่ = ไม่มี webhook = ระบบข้าม
-- การแจ้งเตือนเงียบ ๆ ตามกติกาเดิมของ lib/chat.js (การแจ้งเตือนห้ามทำให้ operation
-- พัง) — เจ้าของระบบไปใส่ URL เองที่ /settings/chat-webhooks
--
-- ⚠ รันมือบน Supabase SQL Editor (DDL ผ่าน service-role/PostgREST ไม่ได้ — เหมือน 0005+)

-- ผ่อน CHECK เดิม (ชื่อ constraint ถูก generate อัตโนมัติ จึงหาแล้วค่อย drop)
DO $$
DECLARE
  v_name text;
BEGIN
  SELECT conname INTO v_name
  FROM pg_constraint
  WHERE conrelid = 'public.chat_webhook_settings'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%approvals%';
  IF v_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.chat_webhook_settings DROP CONSTRAINT %I', v_name);
  END IF;
END;
$$;

ALTER TABLE public.chat_webhook_settings
  ADD CONSTRAINT chat_webhook_settings_key_check
  CHECK (key IN ('approvals', 'sales', 'pm', 'rd', 'leads', 'pc', 'executive'));

INSERT INTO public.chat_webhook_settings (key)
VALUES ('pc'), ('executive')
ON CONFLICT (key) DO NOTHING;

-- Rollback guidance:
-- 1) ถอนได้ด้วยการลบ 2 แถวนี้แล้วคืน CHECK เดิม — แต่ต้องไม่มีเวอร์ชันของ 2 key นี้
--    ค้างอยู่ (FK RESTRICT); ถ้ามีคนตั้ง URL ไปแล้วให้ปิดด้วย enabled = false แทน
-- 2) ระบบขอราคาไม่พังถ้าไม่มี space เหล่านี้ — แค่ไม่มีแจ้งเตือนไปฝ่ายนั้น

NOTIFY pgrst, 'reload schema';
