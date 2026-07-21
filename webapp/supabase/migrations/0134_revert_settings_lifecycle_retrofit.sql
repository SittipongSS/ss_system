-- 0134: ถอน retrofit draft/publish ของปฏิทินวันหยุด + Chat webhooks (ย้อน 0132 + 0133)
--
-- ทำไมถึงถอน (Decision 0012 ฉบับแก้ไขครั้งที่ 2, มติ 2026-07-21):
--   ปฏิทินวันหยุดและแจ้งเตือน Google Chat ถูกจัดประเภทใหม่เป็น "ข้อมูลปฏิบัติการ"
--   ใช้ lifecycle เพิ่ม → แก้ไข → บันทึก → ลบ ธรรมดา — ไม่ใช้ชั้นร่าง/เผยแพร่
--   ที่ migration 0132/0133 เพิ่งวางไว้ ระบบกลับไปอ่าน/เขียนตารางเดิมตรง ๆ:
--   holidays (mig 0018) และ chat_webhooks (mig 0099) ซึ่งไม่เคยถูกแตะและข้อมูลอยู่ครบ
--
-- ปลอดภัยที่จะ DROP ทั้งที่ 0132/0133 ถูกรันบน production แล้ว:
--   ตาราง version มีแต่ข้อมูล seed ที่คัดลอกมาจากตารางเดิมตอน migrate
--   (ไม่มีการแก้ไขผ่านหน้า draft เกิดขึ้นจริง) — ข้อมูลจริงยังอยู่ตารางเดิมครบ

-- ── วันหยุด (ย้อน 0132) ─────────────────────────────────────────────
-- DROP TABLE CASCADE เก็บกวาด trigger/index/FK ของตารางไปด้วย
-- (holiday_calendars ก่อน เพราะถือ FK publishedVersionId ชี้ไปตาราง versions)
DROP TABLE IF EXISTS public.holiday_calendars CASCADE;
DROP TABLE IF EXISTS public.holiday_calendar_versions CASCADE;

DROP FUNCTION IF EXISTS public.create_holiday_calendar_draft(text, text, text, text);
DROP FUNCTION IF EXISTS public.publish_holiday_calendar_draft_atomic(text, timestamptz, text, text, text);
DROP FUNCTION IF EXISTS public.archive_holiday_calendar_draft_atomic(text, timestamptz, text, text, text);
DROP FUNCTION IF EXISTS public.guard_holiday_calendar_version();
DROP FUNCTION IF EXISTS public.holiday_calendar_entries_valid(jsonb);

-- ── Chat webhooks (ย้อน 0133) ───────────────────────────────────────
DROP TABLE IF EXISTS public.chat_webhook_settings CASCADE;
DROP TABLE IF EXISTS public.chat_webhook_setting_versions CASCADE;

DROP FUNCTION IF EXISTS public.create_chat_webhook_settings_draft(text, text, text, text, text);
DROP FUNCTION IF EXISTS public.publish_chat_webhook_settings_draft_atomic(text, timestamptz, text, text, text);
DROP FUNCTION IF EXISTS public.archive_chat_webhook_settings_draft_atomic(text, timestamptz, text, text, text);
DROP FUNCTION IF EXISTS public.guard_chat_webhook_setting_version();
