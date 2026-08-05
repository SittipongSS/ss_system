-- ── 0213 · บรีฟรายกลิ่น — ชั้นกลางของคำร้องพัฒนากลิ่น ───────────────────
--
-- ⭐ โครงที่ตกลงกัน (มติผู้ใช้ 2026-08-06): **สามชั้น**
--     ใบสั่งขาย 1 → PDR 1 → กลิ่น N (ตาม qty ของบรรทัดออกแบบกลิ่นใน SO) → direction M
--   · กลิ่น    = *สิ่งที่ขอ*  — AE กรอกบรีฟตอนเปิด (PDR ข้อ 2.1.x รายกลิ่น)
--   · direction = *สิ่งที่ได้จริง* — RD สร้างตอนส่ง มีรหัส/ชื่อ/วันที่ เข้าทะเบียนทันที
--
-- ⚠️ **ทำไมเป็นตารางใหม่ ไม่ใช่แถวใน dept_request_items**
-- ไล่ `lib/requests/rowStage.js` แล้วพบว่าแถวที่ไม่มีวันที่ก้าวไหนเลยจะตกที่
-- `awaiting_ack` ตลอดกาล และไม่มีวันเข้า `SETTLED` ⇒ `requestProgress()` ไม่มีวันครบ
-- ⇒ **ปิดใบไม่ได้เลยสักใบ** (บั๊กตัวเดียวกับที่เคยทำให้ปุ่มปิดไม่โผล่ มีคอมเมนต์บันทึกไว้)
-- และหัวไฟล์ rowStage เขียนไว้ว่า "ไม่ต้องแยกสาขาตาม lineKind" เป็นหลักการ
-- ⇒ แยกตารางแล้ว `dept_request_items` เหลือความหมายเดียว: **ของที่เดินครบ 5 ก้าว**
--    ไม่ต้องแตะ rowStage / requestProgress / รางแนวตั้ง แม้แต่บรรทัดเดียว
--
-- ⚠️ ไม่มี CHECK ผูกค่า scentotypes/performance ที่ DB โดยตั้งใจ — ชุดตัวเลือกเป็น
-- ทะเบียนฝั่งโค้ด (แพตเทิร์นเดียวกับ requestTypes/docTypes) เพิ่มรายการได้โดยไม่ต้อง
-- ออก migration · ของที่ผูกกับ DB คือความสัมพันธ์ ไม่ใช่คำศัพท์

CREATE TABLE IF NOT EXISTS public.dept_request_scents (
  id                text PRIMARY KEY,
  "requestId"       text NOT NULL REFERENCES public.dept_requests(id) ON DELETE CASCADE,
  "sortOrder"       integer NOT NULL DEFAULT 0,
  -- ป้ายอ่านออกของบรีฟก้อนนี้ ("กลิ่นที่ 1 — แนวสดชื่น") — NOT NULL ด้วยเหตุผล
  -- เดียวกับ dept_request_items.label: ทุกที่ที่อ้างถึงมันต้องมีอะไรให้แสดงเสมอ
  label             text NOT NULL CHECK (length(btrim(label)) BETWEEN 1 AND 200),
  -- PDR 2.1 · 2.1.1 · 2.1.2 · 2.1.3
  brief             text CHECK (brief IS NULL OR length(brief) <= 4000),
  "researchTopic"   text CHECK ("researchTopic" IS NULL OR length("researchTopic") <= 500),
  inspiration       text CHECK (inspiration IS NULL OR length(inspiration) <= 2000),
  "likedNotes"      text CHECK ("likedNotes" IS NULL OR length("likedNotes") <= 2000),
  "dislikedNotes"   text CHECK ("dislikedNotes" IS NULL OR length("dislikedNotes") <= 2000),
  -- PDR 2.1.4 · 2.1.5 — เลือกได้หลายอย่างทั้งคู่ (มติผู้ใช้)
  scentotypes       text[] NOT NULL DEFAULT '{}',
  performance       text[] NOT NULL DEFAULT '{}',
  "createdAt"       timestamptz NOT NULL DEFAULT now(),
  "updatedAt"       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dept_request_scents_request_idx
  ON public.dept_request_scents ("requestId", "sortOrder");

-- ── direction ชี้กลับว่าตอบบรีฟก้อนไหน ─────────────────────────────────
-- 1 บรีฟ : หลาย direction (มติผู้ใช้) — RD เสนอสองทางจากบรีฟเดียวกันได้
ALTER TABLE public.dept_request_items
  ADD COLUMN IF NOT EXISTS "briefId" text;
ALTER TABLE public.dept_request_items
  DROP CONSTRAINT IF EXISTS dept_request_items_brief_fk;
ALTER TABLE public.dept_request_items
  ADD CONSTRAINT dept_request_items_brief_fk
  FOREIGN KEY ("briefId") REFERENCES public.dept_request_scents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS dept_request_items_brief_idx
  ON public.dept_request_items ("briefId");

-- ── ⭐ กลิ่นในทะเบียนย้อนกลับได้ว่ามาจากบรีฟไหน (ข้อที่ผู้ใช้ขอ) ─────────
-- เก็บตรงบน scents ไม่ให้ต้อง join ผ่านแถว direction — คนเปิดจากหน้าทะเบียนแล้ว
-- อยากเห็นบรีฟทันที ไม่ใช่ต้องเดินย้อนสองต่อ
--
-- ⚠️ ON DELETE SET NULL ทั้งสามจุด — ลบคำร้องทิ้งแล้ว **กลิ่นในทะเบียนต้องไม่หายตาม**
-- (RESTRICT จะทำให้ลบคำร้องไม่ได้เลย · CASCADE จะลบของจริงทิ้ง ทั้งคู่ผิด)
ALTER TABLE public.scents
  ADD COLUMN IF NOT EXISTS "briefId" text;
ALTER TABLE public.scents
  DROP CONSTRAINT IF EXISTS scents_brief_fk;
ALTER TABLE public.scents
  ADD CONSTRAINT scents_brief_fk
  FOREIGN KEY ("briefId") REFERENCES public.dept_request_scents(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS scents_brief_idx ON public.scents ("briefId");

-- ── สิทธิ์ระดับตาราง — แพตเทิร์นเดียวกับ dept_requests (0158:158) ────────
-- ⚠️ ทั้งแอปอ่าน/เขียนผ่าน service role (`getSupabaseAdmin`) ซึ่ง bypass RLS อยู่แล้ว
-- ส่วน anon key ใช้แค่ทำ session cookie ไม่ได้แตะตารางธุรกิจ ⇒ เปิด RLS แบบไม่มี
-- policy = ปิดประตูให้ anon สนิทโดยแอปไม่กระทบ · ตารางพี่น้องทำแบบนี้ทั้งหมด
ALTER TABLE public.dept_request_scents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.dept_request_scents FROM anon, authenticated;
GRANT  ALL ON TABLE public.dept_request_scents TO service_role;

NOTIFY pgrst, 'reload schema';

-- ── ย้อนกลับ ────────────────────────────────────────────────────────────
-- ⚠ ย้อนได้ก็ต่อเมื่อยังไม่มีคำร้องพัฒนากลิ่นใบไหนสร้างบรีฟจริง
-- ALTER TABLE public.scents DROP COLUMN IF EXISTS "briefId";
-- ALTER TABLE public.dept_request_items DROP COLUMN IF EXISTS "briefId";
-- DROP TABLE IF EXISTS public.dept_request_scents;
