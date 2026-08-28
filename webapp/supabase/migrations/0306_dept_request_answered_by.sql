-- 0306 - ตราปิดฝั่งฝ่ายบนหัวใบต้องบอกได้ว่า "ใครกด" ไม่ใช่แค่ "เมื่อไร"
--
-- 🐞 ตั้งแต่กฎปิดสองฝั่ง (มติผู้ใช้ 2026-08-20 · mig ไม่มี) โค้ดเขียน
--    `answeredById` / `answeredByName` ลง **หัวใบ** `dept_requests` ที่สามทาง:
--      · PATCH action `answer` — ปุ่ม "ตอบแล้ว" ของชนิดที่ไม่มีบรรทัด
--      · PATCH action `reopen` — ปุ่ม "ยังไม่จบ" (ล้างตราทั้งสองฝั่ง)
--      · POST /api/updates    — ถูกถามกลับในเธรด ⇒ ตราฝั่งฝ่ายหลุดเอง
--    แต่คอลัมน์คู่นี้มีจริงแค่บน **บรรทัด** `dept_request_items` (mig 0158 บรรทัด 90)
--    หัวใบมีแค่ `answeredAt` ⇒ PostgREST ตอบ
--    "Could not find the 'answeredById' column of 'dept_requests' in the schema cache"
--    ⇒ ปุ่ม "ตอบแล้ว" กับ "ยังไม่จบ" กดไม่ผ่านเลยทั้งระบบ (RQ-26080082 · 2026-08-28)
--    และทาง /api/updates กลืน error เงียบ ⇒ ตราไม่หลุดตามข้อความ และ `lastReplySide`
--    ก็ไม่ถูกประทับไปด้วยในจังหวะเดียวกัน
--
-- ⚠️ **ไม่ backfill** — ใบเก่าที่มี `answeredAt` อยู่แล้วไม่มีที่ไหนเก็บว่าใครเป็นคนกด
--    (ตอนนั้นเขียนไม่สำเร็จ) · รางของใบจะโชว์เฉพาะวันเหมือนเดิม ซึ่งถูกต้องกว่าการเดา
-- ⚠️ ใบที่ระบบประทับตราให้เองเมื่อบรรทัดครบ (`requestRowsClosurePatch`) ยังเว้นสองช่องนี้
--    เป็น NULL โดยตั้งใจ — ตรานั้นมาจากงานที่ครบ ไม่ใช่การกดของคนใดคนหนึ่ง
ALTER TABLE public.dept_requests
  ADD COLUMN IF NOT EXISTS "answeredById" text,
  ADD COLUMN IF NOT EXISTS "answeredByName" text;

NOTIFY pgrst, 'reload schema';
