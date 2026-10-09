-- ============================================================
--  Migration 0407: ใบเสนอราคา — ช่อง "แพ็ค/เดือน" ของรายการหมวด 02-001 · งวด PR-1 = ที่เก็บ + กฎเงิน + ทางก๊อป (ยังไม่เปิดให้กรอก)
--                  (มติเจ้าของ 08/10: จำนวนเงิน = แพ็ค × จำนวน × ราคา แล้วหักส่วนลดรายการตามเดิม — 2 แพ็ค × 12 เดือน × 3,500 = 84,000
--                   · แผน mockups/qt-pack-column/DESIGN.md + OWNER_ANSWERS.md + IMPL_PLAN_PR1.md)
--
--  ⭐ ทำไมต้องเป็นคอลัมน์จริง ไม่ใช่คีย์ใน metadata: ตัวเลขนี้ "คูณเงิน" ⇒ ต้องมีชนิด มีช่วง ใช้ใน CHECK ได้ และเดินไปกับทุกทางก๊อป
--     (metadata ถูกส่งผ่านจากจอทั้งก้อนและอยู่นอก fingerprint การอนุมัติ)
--  ⭐ NULL = "บรรทัดนี้ไม่ได้แยกแพ็ค" = คูณ 1 — ทุกแถวที่มีอยู่วันนี้เป็น NULL และ **ยอดทุกแถวเท่าเดิมทุกสตางค์**
--     (ไม่ backfill · ไม่มีค่าตั้งต้น · ไม่มีแถวไหนถูก UPDATE)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────────────────────
--  §0 ด่านก่อนรัน: ฟังก์ชันสามตัวที่จะปะต้องมีตัวละหนึ่ง (ไม่มี overload) · ตัวออก Rev. ใบสั่งขายต้องมีแพตช์เดิมครบ
--     (0382 ตำแหน่ง · 0385 เจ้าของดีล · 0392/P2 ยกงานบริการ) · จดลายนิ้วมือของ **ฟังก์ชันอื่นทุกตัวใน public**
--     (เนื้อ · volatility · SECURITY · search_path · สิทธิ์) และของสามตัวที่จะปะ (ทุกอย่างยกเว้นเนื้อ) ไว้ในตัวแปรของทรานแซกชัน
--     (set_config — ไม่มีตารางชั่วคราว) · §5 เทียบ
--  §1 quotation_lines + sales_order_lines: "packQty" integer NULL + CHECK ช่วง 1–9999 (ช่วงเดียวกับ sales_order_line_zones."packsPerRound")
--  §2 กฎเงินของบรรทัด (CHECK ทั้งสองตาราง · NOT VALID แล้ว VALIDATE ในทรานแซกชันเดียวกัน):
--       abs("lineTotal" - (round(COALESCE("packQty", 1) * qty * "unitPrice", 2) - COALESCE("discountAmount", 0))) <= 0.01
--     · ปัดครั้งเดียวหลังคูณสามตัว (ห้ามปัดต่อหน่วยแล้วคูณ) · ค่าคลาด ±0.01 เท่าตัวตรวจบรรทัดของใบสั่งขายย้อนหลัง (0379)
--       เพราะ JS คูณแบบ floating point ส่วนฐานคูณแบบทศนิยมแท้ ⇒ ต่างกันได้ 1 สตางค์เฉพาะตอนผลคูณลงครึ่งสตางค์พอดี
--     · นับแถวที่ผิดกฎก่อน — มีแม้แถวเดียว = RAISE ทั้งไฟล์ถอย (ตรวจ 08/10: 1,202 + 445 แถว ผิด 0 แถว ตรงเป๊ะทุกแถว)
--     ⇒ ทางเขียนไหนลืมตัวคูณแพ็ค (ตั้งแต่ 2 ขึ้นไป) = 23514 ไม่ใช่ยอดที่เล็กลงเงียบ ๆ
--  §3 ตรวจสูตรกับชุดตัวอย่างเดียวกับฝั่ง JS (webapp/src/lib/sales/quoteLinePackFixtures.json · ยาม linePackMigration.test.mjs เทียบสองฝั่ง)
--  §4 ปะฟังก์ชันที่รันอยู่จริงสามตัว (pg_get_functiondef แบบ 0392/0394/0400/0404 — **ไม่คัดเนื้อจากไฟล์เก่า**) ให้พกคอลัมน์ไปทุกทอด
--       Q1 Q2 Q3  ตัวบันทึกเนื้อหาใบเสนอราคา (นิยามล่าสุด 0343): รายการคอลัมน์ INSERT · รายการค่า SELECT · ชนิดของ jsonb_to_recordset
--       D1 D2     ตัวสร้างใบสั่งขายร่างจากใบเสนอราคา (นิยามล่าสุด 0363): รายการคอลัมน์ INSERT · ค่าจาก quotation_lines
--       R1 R2     ตัวออก Rev. ใบสั่งขาย (0376 + แพตช์ 0382 · 0385 · 0392/P2): รายการคอลัมน์ INSERT · ค่าจากบรรทัดของใบเดิม
--     · anchor ต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ pg_get_functiondef · มีป้าย 0407/… แล้ว = ข้าม ("ปะไว้แล้ว")
--     · CREATE OR REPLACE จากข้อความของ pg_get_functiondef เก็บเจ้าของ · สิทธิ์ EXECUTE · SECURITY · search_path · แพตช์เดิมทุกตัว
--  §5 ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย
--
--  ⛔ ไม่แตะ: ตัวเขียน/ตัวตรวจบรรทัดของใบสั่งขายย้อนหลัง (เขียน NULL ต่อไป · กฎเงินของมันคือกฎเดียวกันเมื่อแพ็คว่าง) · ตัวยกงานบริการ ·
--     ตัวบันทึกงานบริการ · ตัวอนุมัติ/ยื่น/ดึงกลับ · trigger ทุกตัว · ยอดหัวใบ · งวด · Actual · fingerprint · ฉบับตรึง
--     (§5 ยืนยัน: ฟังก์ชันอื่นทุกตัวใน public เท่าเดิมทั้งเนื้อและสิทธิ์)
--  ⛔ ไม่ backfill — ไม่มีคำสั่ง UPDATE/INSERT/DELETE กับแถวข้อมูลในไฟล์นี้
--  🪤 ไฟล์นี้ **ไม่เขียนข้อความ FUNCTION ตามด้วย public. + ชื่อฟังก์ชันใดเลย** (แม้ในคอมเมนต์) — ฟังก์ชันที่รันอยู่อ้างด้วยชื่อเปล่า /
--     p.proname = '…' / ลายเซ็นในสตริงของ has_function_privilege เท่านั้น (ยาม "นิยามล่าสุด" ของหลายเทสต์หาเจ้าของนิยามด้วยข้อความนั้น)
--     ⇒ migration หลังจากนี้ที่เขียนสามตัวนี้ทับทั้งก้อน **ต้องพก "packQty" ไปด้วย** (ยาม linePackMigration.test.mjs)
--
--  ── คอลัมน์ใหม่ (check:columns แดงเฉพาะชื่อนี้จนกว่าจะรัน — อย่างอื่นแดง = บั๊กจริง) ──────────────────────────
--   quotation_lines."packQty" · sales_order_lines."packQty"
--
--  ── ด่านก่อนรัน (§0/§2/§4 — RAISE แล้วทั้งไฟล์ถอย ไม่มีครึ่ง ๆ กลาง ๆ) ───────────────────────────────
--   mig_0407_needs_functions      ฟังก์ชันสามตัวไม่ครบ หรือมี overload
--   mig_0407_needs_chain          ตัวออก Rev. ใบสั่งขายไม่มีแพตช์ 0382 / 0385 / 0392 ครบ — แจ้งผู้พัฒนา · ทางกลับคือลำดับเต็มท้ายหัวไฟล์นี้
--                                 ("ห้ามรัน 0343 · 0363 · 0376 ซ้ำ") ไม่ใช่รันแค่สามไฟล์นั้น
--   mig_0407_line_money_violations มีบรรทัดที่ยอดไม่ตรงสูตร (บอกจำนวนของแต่ละตาราง) — อย่าแก้ข้อมูลเอง แจ้งผู้พัฒนา
--   mig_0407_fixture              สูตรของ CHECK ให้ผลไม่ตรงชุดตัวอย่าง
--   mig_0407_patch_anchor         เนื้อของฟังก์ชันที่รันอยู่ไม่ใช่เนื้อที่ไฟล์นี้รู้จัก (anchor ไม่เจอ หรือเจอเกินหนึ่ง)
--
--  ── ตรวจก่อนรัน (อ่านอย่างเดียว · รันได้ทุกเมื่อ ทั้งก่อนและหลังรัน) ─────────────────────────────────
--   คาด (ก่อนรัน): fns = 3 · chain = 1 · anchors = D1=1 D2=1 Q1=1 Q2=1 Q3=1 R1=1 R2=1 · marks = 0 · bodies = ttt · cols = 0
--                  · bad_qt = 0 · bad_so = 0 · rows_qt ≥ 1202 · rows_so ≥ 445 (จำนวนแถวที่ CHECK จะตรวจ — ข้อมูลประกอบ) · packed = 0
--                  · anon = f · svc = t (สิทธิ์ของสามฟังก์ชัน — เท่ากันทั้งก่อนและหลังรัน)
--   ⛔ อย่ารัน แล้วแจ้งผู้พัฒนา เมื่อ: fns ≠ 3 · chain ≠ 1 · anchors มีตัวไหนไม่ใช่ 1 ขณะ marks = 0 · bad_qt/bad_so ≠ 0
--      · anon ไม่ใช่ f หรือ svc ไม่ใช่ t (§5 จะหยุดไฟล์ด้วย mig_0407_verify grant — สิทธิ์บนฐานไม่ใช่แบบที่ 0336/0343/0363/0376 ตั้งไว้)
--      · bodies ไม่ใช่ ttt (เนื้อของฟังก์ชันบนฐานไม่ใช่เนื้อที่พิสูจน์ไว้บนฮาร์เนส — ตัวอักษรเรียงตาม ตัวบันทึก QT · ตัวสร้าง SO ร่าง · ตัวออก Rev.)
--   (ด่าน §0/§2/§4/§5 หยุดไฟล์เองอยู่แล้วทุกข้อ ยกเว้น bodies ซึ่งไฟล์แค่พิมพ์ NOTICE — ข้อนี้ต้องดูด้วยตา)
--
--   SELECT
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname IN ('save_quotation_content', 'create_sales_order_draft', 'revise_approved_sales_order_atomic')) AS fns,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'revise_approved_sales_order_atomic'
--      AND strpos(p.prosrc, 'public.is_sales_manager_role(p_actor_role)') > 0
--      AND strpos(p.prosrc, 'd."ownerId" = p_actor_id') > 0
--      AND strpos(p.prosrc, 'sales_order_copy_service_setup(') > 0) AS chain,
--    (SELECT string_agg(a.marker || '=' || (SELECT count(*) FROM regexp_matches(p.prosrc, a.anchor, 'g')), ' ' ORDER BY a.marker)
--       FROM (VALUES
--         ('save_quotation_content', 'Q1', $re$("sortOrder",\s*metadata,\s*"serviceRounds")(\s*\)\s*SELECT\s+x\.id,)$re$),
--         ('save_quotation_content', 'Q2', $re$(COALESCE\(x\.metadata,\s*'\{\}'::jsonb\),\s*x\."serviceRounds")(\s*FROM jsonb_to_recordset\(p_lines\))$re$),
--         ('save_quotation_content', 'Q3', $re$("sortOrder" integer,\s*metadata jsonb,\s*"serviceRounds" integer)(\s*\);)$re$),
--         ('create_sales_order_draft', 'D1', $re$("lineTotal",\s*"sortOrder",\s*metadata)(\s*\)\s*SELECT\s+'SOL-' \|\| md5\(p_order_id)$re$),
--         ('create_sales_order_draft', 'D2', $re$(ql\."lineTotal",\s*ql\."sortOrder",\s*ql\.metadata)(\s*FROM public\.quotation_lines ql)$re$),
--         ('revise_approved_sales_order_atomic', 'R1', $re$("lineTotal",\s*"sortOrder",\s*metadata,\s*"createdAt",\s*"serviceRounds")(\s*\)\s*SELECT\s+'SOL-' \|\| md5\(p_revision_id)$re$),
--         ('revise_approved_sales_order_atomic', 'R2', $re$(line\."lineTotal",\s*line\."sortOrder",\s*line\.metadata,\s*v_now,\s*line\."serviceRounds")(\s*FROM public\.sales_order_lines line)$re$)
--       ) AS a(fn, marker, anchor)
--       JOIN pg_proc p ON p.proname = a.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public') AS anchors,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
--       regexp_matches(p.prosrc, $re$/\* 0407/[QDR][1-3] \*/$re$, 'g') AS m
--      WHERE n.nspname = 'public'
--        AND p.proname IN ('save_quotation_content', 'create_sales_order_draft', 'revise_approved_sales_order_atomic')) AS marks,
--    (SELECT string_agg((md5(regexp_replace(regexp_replace(p.prosrc,
--              $re$, (x\.|ql\.|line\.)?"packQty"( integer)? /\* 0407/[QDR][1-3] \*/$re$, '', 'g'), '[ \t\n\r]', '', 'g')) = e.h)::text::char(1), '' ORDER BY e.ord)
--       FROM (VALUES (1, 'save_quotation_content', 'afa38a9b677f60d168c196827009b767'),
--                    (2, 'create_sales_order_draft', 'e11eb0a9c90d24fa9716aaae66bae377'),
--                    (3, 'revise_approved_sales_order_atomic', '2729aac0d5fbf838a3750ca5b38e25dc')) AS e(ord, fn, h)
--       JOIN pg_proc p ON p.proname = e.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public') AS bodies,
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
--      AND table_name IN ('quotation_lines', 'sales_order_lines') AND column_name = 'packQty') AS cols,
--    (SELECT count(*) FROM public.quotation_lines l
--      WHERE NOT (abs(l."lineTotal" - (round(COALESCE((to_jsonb(l)->>'packQty')::integer, 1) * l.qty * l."unitPrice", 2) - COALESCE(l."discountAmount", 0))) <= 0.01)) AS bad_qt,
--    (SELECT count(*) FROM public.sales_order_lines l
--      WHERE NOT (abs(l."lineTotal" - (round(COALESCE((to_jsonb(l)->>'packQty')::integer, 1) * l.qty * l."unitPrice", 2) - COALESCE(l."discountAmount", 0))) <= 0.01)) AS bad_so,
--    (SELECT count(*) FROM public.quotation_lines) AS rows_qt,
--    (SELECT count(*) FROM public.sales_order_lines) AS rows_so,
--    (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--        AND p.proname IN ('save_quotation_content', 'create_sales_order_draft', 'revise_approved_sales_order_atomic')) AS anon,
--    (SELECT bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE'))
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--        AND p.proname IN ('save_quotation_content', 'create_sales_order_draft', 'revise_approved_sales_order_atomic')) AS svc,
--    (SELECT count(*) FROM public.quotation_lines l WHERE to_jsonb(l)->>'packQty' IS NOT NULL)
--      + (SELECT count(*) FROM public.sales_order_lines l WHERE to_jsonb(l)->>'packQty' IS NOT NULL) AS packed;
--
--  ── ลำดับ deploy ────────────────────────────────────────────────────────────────────────
--   0) ทุกด่านในเครื่องเขียว (test · TZ=UTC test · gates) · ฮาร์เนส PGlite harness-0407 ผ่านสองรอบผลเหมือนกัน · rebase บน main ล่าสุด
--   1) ตรวจเลข migration อีกครั้ง (origin/main + PR ที่เปิดอยู่) — ห้ามมีใครถือ 0407 (0406 = ใบรับการอัปโหลดของ #1885 อยู่บน main แล้ว)
--   2) เจ้าของรัน SELECT ตรวจก่อนรันข้างบน → รันไฟล์นี้ที่ SQL Editor **ก่อน** merge → รัน SELECT ตรวจหลังรันข้างล่าง
--      (โค้ดรุ่นที่รันอยู่ใช้ต่อได้ทันที: ไม่มีทางเขียนไหนของมันส่ง "packQty" ⇒ ทุกแถวใหม่ได้ NULL = สูตรเดิม · CHECK ผ่านเหมือนแถวเดิมทุกแถว
--       · ไม่ต้อง freeze)
--   3) CI rerun (check:columns เขียวแล้ว) → merge → Deploy to production → curl /api/version ตรง sha
--      (โค้ดงวด PR-1 ปิดช่องแพ็ค: เซิร์ฟเวอร์ปฏิเสธเลขแพ็คทุกค่า และไม่ส่งคีย์ "packQty" เมื่อบรรทัดไม่มีเลขแพ็ค ⇒ หลัง deploy ก็ยังไม่มีแถวไหนมีเลขแพ็ค)
--   4) ยืนยันหลัง deploy (อ่านอย่างเดียว · รันจากโฟลเดอร์ webapp):
--        node --import ./scripts/test-loader.mjs scripts/check-line-pack-parity.mjs → คาด 0 จุดต่างทุกหัวข้อ
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   คาด: cols = 2 · range = 2 · money = 2 · valid = 4 · marks = 7 · packs = 3/2/2 · chain = 1 · anon = f · svc = t · packed = 0
--        (packed โตหลังเปิดช่องแพ็คในงวด PR-3 — ข้อมูลประกอบ ไม่ใช่เกณฑ์) · และ SELECT ตรวจก่อนรันข้างบนต้องได้ anchors เป็น 0 ทุกตัว · marks = 7 · bodies = ttt · anon = f · svc = t
--
--   SELECT
--    (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public'
--      AND table_name IN ('quotation_lines', 'sales_order_lines') AND column_name = 'packQty'
--      AND data_type = 'integer' AND is_nullable = 'YES' AND column_default IS NULL) AS cols,
--    (SELECT count(*) FROM pg_constraint WHERE contype = 'c'
--      AND conname IN ('quotation_lines_pack_qty_range', 'sales_order_lines_pack_qty_range')) AS range,
--    (SELECT count(*) FROM pg_constraint WHERE contype = 'c'
--      AND conname IN ('quotation_lines_line_money_rule', 'sales_order_lines_line_money_rule')) AS money,
--    (SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND convalidated
--      AND conname IN ('quotation_lines_pack_qty_range', 'sales_order_lines_pack_qty_range',
--                      'quotation_lines_line_money_rule', 'sales_order_lines_line_money_rule')) AS valid,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace,
--       regexp_matches(p.prosrc, $re$/\* 0407/[QDR][1-3] \*/$re$, 'g') AS m
--      WHERE n.nspname = 'public'
--        AND p.proname IN ('save_quotation_content', 'create_sales_order_draft', 'revise_approved_sales_order_atomic')) AS marks,
--    (SELECT string_agg(((length(p.prosrc) - length(replace(p.prosrc, '"packQty"', ''))) / length('"packQty"'))::text, '/' ORDER BY e.ord)
--       FROM (VALUES (1, 'save_quotation_content'), (2, 'create_sales_order_draft'), (3, 'revise_approved_sales_order_atomic')) AS e(ord, fn)
--       JOIN pg_proc p ON p.proname = e.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public') AS packs,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'revise_approved_sales_order_atomic'
--      AND strpos(p.prosrc, 'public.is_sales_manager_role(p_actor_role)') > 0
--      AND strpos(p.prosrc, 'd."ownerId" = p_actor_id') > 0
--      AND strpos(p.prosrc, 'sales_order_copy_service_setup(') > 0) AS chain,
--    (has_function_privilege('anon', 'public.save_quotation_content(text,jsonb,jsonb)', 'EXECUTE')
--      OR has_function_privilege('anon', 'public.create_sales_order_draft(text,text,text,text,jsonb)', 'EXECUTE')
--      OR has_function_privilege('anon', 'public.revise_approved_sales_order_atomic(text,text,timestamptz,text,text,text,text)', 'EXECUTE')
--      OR has_function_privilege('authenticated', 'public.save_quotation_content(text,jsonb,jsonb)', 'EXECUTE')
--      OR has_function_privilege('authenticated', 'public.create_sales_order_draft(text,text,text,text,jsonb)', 'EXECUTE')
--      OR has_function_privilege('authenticated', 'public.revise_approved_sales_order_atomic(text,text,timestamptz,text,text,text,text)', 'EXECUTE')) AS anon,
--    (has_function_privilege('service_role', 'public.save_quotation_content(text,jsonb,jsonb)', 'EXECUTE')
--      AND has_function_privilege('service_role', 'public.create_sales_order_draft(text,text,text,text,jsonb)', 'EXECUTE')
--      AND has_function_privilege('service_role', 'public.revise_approved_sales_order_atomic(text,text,timestamptz,text,text,text,text)', 'EXECUTE')) AS svc,
--    (SELECT count(*) FROM public.quotation_lines WHERE "packQty" IS NOT NULL)
--      + (SELECT count(*) FROM public.sales_order_lines WHERE "packQty" IS NOT NULL) AS packed;
--
--  ── ถอยกลับ ─────────────────────────────────────────────────────────────────────────────
--   🔴 ถอยได้เฉพาะตอนที่ **ยังไม่มีแถวไหนมีเลขแพ็ค** (packed = 0 — คือตลอดงวด PR-1/PR-2) · มีแล้ว = ห้ามถอย: ลบคอลัมน์ = ยอด 84,000 เหลือ
--      สูตร 42,000 โดยไม่มีอะไรฟ้อง (ประตูทางเดียวของงวด PR-3 — DESIGN §9 C2)
--   ถอยโค้ดก่อนเสมอ แล้วค่อยทำตามลำดับ (บล็อกเดียว · มีด่านในตัว):
--      BEGIN;
--      DO $undo$
--      DECLARE r record; v_def text; v_hits integer;
--      BEGIN
--        IF (SELECT count(*) FROM public.quotation_lines WHERE "packQty" IS NOT NULL)
--           + (SELECT count(*) FROM public.sales_order_lines WHERE "packQty" IS NOT NULL) > 0 THEN
--          RAISE EXCEPTION 'undo_0407 มีบรรทัดที่มีเลขแพ็คแล้ว — ห้ามถอย';
--        END IF;
--        FOR r IN SELECT p.oid, p.proname, t.n FROM (VALUES ('save_quotation_content', 3), ('create_sales_order_draft', 2),
--                   ('revise_approved_sales_order_atomic', 2)) AS t(fn, n)
--                   JOIN pg_proc p ON p.proname = t.fn JOIN pg_namespace ns ON ns.oid = p.pronamespace AND ns.nspname = 'public'
--        LOOP
--          v_def := pg_get_functiondef(r.oid);
--          SELECT count(*) INTO v_hits FROM regexp_matches(v_def, $u$, (x\.|ql\.|line\.)?"packQty"( integer)? /\* 0407/[QDR][1-3] \*/$u$, 'g');
--          IF v_hits <> r.n THEN RAISE EXCEPTION 'undo_0407 % hits=% (คาด %)', r.proname, v_hits, r.n; END IF;
--          EXECUTE regexp_replace(v_def, $u$, (x\.|ql\.|line\.)?"packQty"( integer)? /\* 0407/[QDR][1-3] \*/$u$, '', 'g');
--        END LOOP;
--      END $undo$;
--      ALTER TABLE public.quotation_lines DROP CONSTRAINT quotation_lines_line_money_rule,
--        DROP CONSTRAINT quotation_lines_pack_qty_range, DROP COLUMN "packQty";
--      ALTER TABLE public.sales_order_lines DROP CONSTRAINT sales_order_lines_line_money_rule,
--        DROP CONSTRAINT sales_order_lines_pack_qty_range, DROP COLUMN "packQty";
--      COMMIT;
--      NOTIFY pgrst, 'reload schema';
--   ผล: เนื้อของสามฟังก์ชันกลับเท่าก่อน 0407 ตรงตัว (พิสูจน์บนฮาร์เนส) · ไม่มีข้อมูลเสีย (ทุกแถวเป็น NULL อยู่แล้ว)
--   ⛔ ห้ามรัน 0343 · 0363 · 0376 ซ้ำหลังไฟล์นี้ — แต่ละไฟล์เขียนฟังก์ชันทับ **ทั้งก้อน** จากเนื้อเก่า โดยไม่มี error:
--        0343 = ทั้งสามตัว · 0363 = ตัวสร้างใบสั่งขายร่าง + ตัวออก Rev. · 0376 = ตัวออก Rev.
--      ผล: "packQty" หายจากทางก๊อปของทุกตัวที่ถูกเขียนทับ · ตัวออก Rev. เสียทุกอย่างที่มาหลังไฟล์นั้น (การย้ายงวดของ 0376 · แพตช์ 0382 · 0385 ·
--        0392/P2) · 0343 ยังทำให้ตัวสร้างใบสั่งขายร่างเสีย deliveryDueDate ของ 0363
--      ไฟล์นี้รันซ้ำทันทีหลังพลาด = หยุดเองด้วย mig_0407_needs_chain ไม่เขียนอะไร (ดังและปลอดภัย — แต่ยังไม่ได้ซ่อมอะไร)
--      ทางกลับ (พลาดไปแล้ว = แจ้งผู้พัฒนา): รัน **ทุกไฟล์ที่นิยาม/ปะตามหลัง ตามลำดับ ครบในคราวเดียว** เริ่มที่ไฟล์ถัดจากตัวที่รันพลาด
--        0343 → 0363 → 0376 → 0382 → 0383 → 0385 → 0392 → 0394 → 0396 → 0400 → 0404 → ไฟล์นี้ (ป้ายหาย = ไฟล์นี้ปะใหม่ให้เอง)
--        · ข้าม 0376 ไม่ได้: ไฟล์นี้จะหยุดด้วย mig_0407_verify marker "movedFrom" … = 0 (ตัวออก Rev. ยังเป็นรุ่นก่อนย้ายงวด)
--        · 🔴 ข้าม 0383 ไม่ได้ และ **ไม่มีด่านไหนฟ้อง**: 0382 ทั้งไฟล์เขียนตัวกลางตำแหน่งกลับเป็น 'cco' ⇒ Commercial Director อนุมัติไม่ได้ทั้งระบบ
--          จนกว่า 0383 จะรัน (ไฟล์นี้มองไม่เห็น — ฟังก์ชันอื่นเทียบกับต้นรอบของตัวเองเท่านั้น)
--        · 0394 → 0396 → 0400 → 0404 ต้องตาม 0392: 0392 ทั้งไฟล์เขียนฟังก์ชันของตัวเองทับ (หัวไฟล์ 0400 / 0404 เตือนไว้)
--        · ระหว่างที่ยังไม่ครบ: ทางที่ถูกเขียนทับ (บันทึก QT · QT → SO · SO → Rev.) ไม่พกเลขแพ็ค (ตั้งแต่งวด PR-3: แพ็ค ≥ 2 = 23514 · แพ็ค 1 หายเงียบ)
--      พิสูจน์บนฮาร์เนส R-7 … R-11 (รัน **ทั้งไฟล์** บนฐานที่มีเอกสาร): จบลำดับแล้วทุกฟังก์ชัน · schema · ทุกแถวข้อมูล เท่าก่อนพลาดทุกตัวอักษร
--      ไฟล์เก่ากว่า 0343 ที่นิยามสามตัวนี้ก็ห้ามเช่นกัน — ทางกลับของไฟล์พวกนั้นไม่ได้พิสูจน์ไว้
--
--  ⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ — ADD COLUMN IF NOT EXISTS · DROP CONSTRAINT IF EXISTS แล้วสร้างใหม่ (ตรวจแถวทั้งตารางซ้ำทุกรอบ) ·
--     แถวปะที่มีป้ายแล้วถูกข้าม ("ปะไว้แล้ว")
--  🧪 พิสูจน์บนฮาร์เนส PGlite harness-0407 (นอก repo · mockups/so-service-lines/pglite-harness) — โหลด 0343 · 0363 · 0376 + 0382/0385 ·
--     0389/0390 · 0392–0396 · 0400 · 0404 จากไฟล์จริง แล้วรันไฟล์นี้สองรอบ + รอบสามบนฐานที่มีข้อมูล · ทั้งเส้นในนาม service_role
-- ============================================================

BEGIN;

-- ── §0 ด่านก่อนรัน + ลายนิ้วมือของที่ต้องไม่แตะ ────────────────────────────────────────────
DO $pre$
DECLARE
  v_n integer;
  v_fns constant text[] := ARRAY['save_quotation_content', 'create_sales_order_draft', 'revise_approved_sales_order_atomic'];
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (v_fns);
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'mig_0407_needs_functions — เจอ % จาก 3 (ไม่ครบ หรือมี overload)', v_n;
  END IF;

  -- ตัวออก Rev. ใบสั่งขายต้องเป็นเนื้อที่มีแพตช์เดิมครบ (0382 · 0385 · 0392/P2) — ไฟล์นี้ปะต่อจากเนื้อนั้น ไม่เขียนทับ
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'revise_approved_sales_order_atomic'
       AND strpos(p.prosrc, 'public.is_sales_manager_role(p_actor_role)') > 0
       AND strpos(p.prosrc, 'd."ownerId" = p_actor_id') > 0
       AND strpos(p.prosrc, 'sales_order_copy_service_setup(') > 0) THEN
    RAISE EXCEPTION 'mig_0407_needs_chain — ตัวออก Rev. ใบสั่งขายไม่มีแพตช์ 0382 / 0385 / 0392 ครบ';
  END IF;

  -- ฟังก์ชันอื่นทุกตัวใน public: เนื้อ · volatility · SECURITY · search_path · สิทธิ์ — ค่าเดียว · §5 เทียบ (ตายตอน COMMIT/ROLLBACK)
  PERFORM set_config('mig_0407.others', (
    SELECT md5(COALESCE(string_agg(
             p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.provolatile::text || '|' || p.prosecdef::text
               || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, ''),
             E'\n' ORDER BY p.oid::regprocedure::text), ''))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT (p.proname = ANY (v_fns))
  ), true);

  -- สามตัวที่จะปะ: ทุกอย่างยกเว้นเนื้อ (ลายเซ็น · ชนิดที่คืน · ภาษา · เจ้าของ · volatility · SECURITY · search_path · สิทธิ์)
  PERFORM set_config('mig_0407.meta', (
    SELECT jsonb_object_agg(p.proname, md5(
             p.oid::regprocedure::text || '|' || p.prorettype::regtype::text || '|' || p.prolang::text || '|' || p.proowner::text
               || '|' || p.provolatile::text || '|' || p.prosecdef::text || '|' || p.proretset::text
               || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, '')))::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (v_fns)
  ), true);
END
$pre$;

-- ── §1 คอลัมน์: จำนวนแพ็คต่อเดือนของบรรทัด (NULL = ไม่ได้แยกแพ็ค = คูณ 1) ─────────────────────────────
ALTER TABLE public.quotation_lines
  ADD COLUMN IF NOT EXISTS "packQty" integer;
ALTER TABLE public.sales_order_lines
  ADD COLUMN IF NOT EXISTS "packQty" integer;

ALTER TABLE public.quotation_lines DROP CONSTRAINT IF EXISTS quotation_lines_pack_qty_range;
ALTER TABLE public.quotation_lines
  ADD CONSTRAINT quotation_lines_pack_qty_range CHECK ("packQty" IS NULL OR "packQty" BETWEEN 1 AND 9999);
ALTER TABLE public.sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_pack_qty_range;
ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT sales_order_lines_pack_qty_range CHECK ("packQty" IS NULL OR "packQty" BETWEEN 1 AND 9999);

COMMENT ON COLUMN public.quotation_lines."packQty" IS
  'จำนวนแพ็คต่อเดือนของบรรทัด (หมวด 02-001 · มติเจ้าของ 08/10) — จำนวนเงิน = แพ็ค × จำนวน × ราคา/หน่วย แล้วหักส่วนลดรายการ · NULL = บรรทัดไม่ได้แยกแพ็ค (คูณ 1) · จำนวนเต็ม 1–9999 · ไม่มีค่าตั้งต้น ไม่ backfill (0407)';
COMMENT ON COLUMN public.sales_order_lines."packQty" IS
  'จำนวนแพ็คต่อเดือนของบรรทัด — สำเนาจากบรรทัดใบเสนอราคาที่รับแล้ว (บรรทัดใบสั่งขายเป็น snapshot อ่านอย่างเดียว) · ออก Rev. ยกไปด้วย · NULL = คูณ 1 · ใบสั่งขายย้อนหลังเป็น NULL เสมอ (0407)';

-- ── §2 กฎเงินของบรรทัด (CHECK ทั้งสองตาราง) ─────────────────────────────────────────────────
-- นับแถวที่ผิดกฎก่อน — ข้อความบอกจำนวนของแต่ละตาราง (VALIDATE บอกแค่ว่า "มีแถวผิด")
DO $precheck$
DECLARE
  v_qt integer;
  v_so integer;
BEGIN
  SELECT count(*) INTO v_qt FROM public.quotation_lines
   WHERE NOT (abs("lineTotal" - (round(COALESCE("packQty", 1) * qty * "unitPrice", 2) - COALESCE("discountAmount", 0))) <= 0.01);
  SELECT count(*) INTO v_so FROM public.sales_order_lines
   WHERE NOT (abs("lineTotal" - (round(COALESCE("packQty", 1) * qty * "unitPrice", 2) - COALESCE("discountAmount", 0))) <= 0.01);
  IF v_qt <> 0 OR v_so <> 0 THEN
    RAISE EXCEPTION 'mig_0407_line_money_violations quotation_lines=% sales_order_lines=% — ยอดบรรทัดไม่ตรงสูตร ไม่รัน แจ้งผู้พัฒนา', v_qt, v_so;
  END IF;
END
$precheck$;

ALTER TABLE public.quotation_lines DROP CONSTRAINT IF EXISTS quotation_lines_line_money_rule;
ALTER TABLE public.quotation_lines
  ADD CONSTRAINT quotation_lines_line_money_rule CHECK (
    abs("lineTotal" - (round(COALESCE("packQty", 1) * qty * "unitPrice", 2) - COALESCE("discountAmount", 0))) <= 0.01
  ) NOT VALID;
ALTER TABLE public.quotation_lines VALIDATE CONSTRAINT quotation_lines_line_money_rule;

ALTER TABLE public.sales_order_lines DROP CONSTRAINT IF EXISTS sales_order_lines_line_money_rule;
ALTER TABLE public.sales_order_lines
  ADD CONSTRAINT sales_order_lines_line_money_rule CHECK (
    abs("lineTotal" - (round(COALESCE("packQty", 1) * qty * "unitPrice", 2) - COALESCE("discountAmount", 0))) <= 0.01
  ) NOT VALID;
ALTER TABLE public.sales_order_lines VALIDATE CONSTRAINT sales_order_lines_line_money_rule;

COMMENT ON CONSTRAINT quotation_lines_line_money_rule ON public.quotation_lines IS
  'ยอดบรรทัด = ปัด2(แพ็ค(ว่าง=1) × จำนวน × ราคา/หน่วย) − ส่วนลดรายการ (±0.01) — คู่กับ quoteLineNet ฝั่ง JS · ทางเขียนที่ลืมตัวคูณแพ็คได้ 23514 (0407)';
COMMENT ON CONSTRAINT sales_order_lines_line_money_rule ON public.sales_order_lines IS
  'ยอดบรรทัด = ปัด2(แพ็ค(ว่าง=1) × จำนวน × ราคา/หน่วย) − ส่วนลดรายการ (±0.01) — กฎเดียวกับ quotation_lines_line_money_rule (0407)';

-- ── §3 สูตรของ CHECK กับชุดตัวอย่างเดียวกับฝั่ง JS ───────────────────────────────────────────
-- ⚠️ แถวของ VALUES ต้องตรงกับ webapp/src/lib/sales/quoteLinePackFixtures.json ทุกแถวทุกค่า (ยาม linePackMigration.test.mjs)
--    คอลัมน์: รหัสตัวอย่าง · "packQty" · qty · "unitPrice" · "discountAmount" · "lineTotal" · CHECK ต้องยอม (ok)
DO $fixture$
DECLARE
  v_bad text;
BEGIN
  SELECT string_agg(f.id, ', ' ORDER BY f.id) INTO v_bad
    FROM (VALUES
      ('A-null-12x3500',          NULL::integer, 12::numeric,  3500::numeric,    0::numeric,  42000::numeric, true),
      ('A-pack1',                 1,             12,           3500,             0,           42000,          true),
      ('B-2x12-flat',             2,             12,           3500,         14400,           69600,          true),
      ('B-today-24-flat',         NULL,          24,           3500,         14400,           69600,          true),
      ('C-43x4',                  43,             4,           2900,             0,          498800,          true),
      ('C-today-172',             NULL,         172,           2900,             0,          498800,          true),
      ('D-2x12',                  2,             12,           3500,             0,           84000,          true),
      ('D-today-12x7000',         NULL,          12,           7000,             0,           84000,          true),
      ('E-max-pack',              9999,           1,           0.01,             0,           99.99,          true),
      ('F-percent',               2,             12,           3500,          4200,           79800,          true),
      ('G-percent-over',          2,             12,           3500,         84000,               0,          true),
      ('H-flat-over',             2,              1,            100,           200,               0,          true),
      ('I-half-satang-pack',      3,            1.5,          33.33,             0,          149.98,          true),
      ('J-half-satang-null',      NULL,         1.5,          33.33,             0,              50,          true),
      ('K-half-satang-small',     7,            0.5,           0.03,             0,            0.11,          true),
      ('L-decimal-price-percent', 2,              3,        1234.56,        925.92,         6481.44,          true),
      ('M-free',                  1,              1,              0,             0,               0,          true),
      ('N-9x5800-flat',           1,              9,           5800,         39150,           13050,          true),
      ('O-decimal-qty-pack',      2,            2.5,          19.99,          0.01,           99.94,          true),
      ('P-third',                 3,              1,          0.335,             0,            1.01,          true),
      ('X-forgot-multiplier',     2,             12,           3500,             0,           42000,          false),
      ('X-forgot-with-discount',  2,             12,           3500,         14400,           27600,          false),
      ('X-multiplied-no-pack',    NULL,          12,           3500,             0,           84000,          false),
      ('X-pack1-lost',            NULL,          12,           3500,             0,           42000,          true),
      ('X-one-satang-off',        NULL,           3,          33.33,             0,             100,          true),
      ('X-two-satang-off',        NULL,           3,          33.33,             0,          100.01,          false),
      ('X-discount-not-taken',    2,             12,           3500,         14400,           84000,          false),
      ('X-rounded-per-unit',      3,            1.5,          33.33,             0,             150,          true),
      ('X-rounded-per-unit-far',  30,           1.5,          33.33,             0,            1500,          false)
    ) AS f(id, "packQty", qty, "unitPrice", "discountAmount", "lineTotal", ok)
   WHERE (abs("lineTotal" - (round(COALESCE("packQty", 1) * qty * "unitPrice", 2) - COALESCE("discountAmount", 0))) <= 0.01) IS DISTINCT FROM f.ok;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'mig_0407_fixture %', v_bad;
  END IF;
END
$fixture$;

-- ── §4 ปะฟังก์ชันที่รันอยู่จริงสามตัว — พก "packQty" ไปทุกทอด ───────────────────────────────────────
-- ⚠️ ชื่อฟังก์ชันเขียนเป็นสตริงใน VALUES เท่านั้น (ดูหัวไฟล์) · anchor เป็น regex (ARE) ครั้งเดียวพอดีทั้งสองที่
-- ⚠️ ข้อความใหม่ = \1 + ", <ค่า> /* 0407/<ป้าย> */" + \2 — ไม่มีอะไรถูกลบ ⇒ ถอดด้วย regex ของหัวไฟล์แล้วได้เนื้อเดิมตรงตัว
DO $patch$
DECLARE
  r record;
  v_n integer;
  v_oid oid;
  v_src text;
  v_def text;
  v_hits_src integer;
  v_hits_def integer;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('save_quotation_content',
        $re$("sortOrder",\s*metadata,\s*"serviceRounds")(\s*\)\s*SELECT\s+x\.id,)$re$,
        $rp$\1, "packQty" /* 0407/Q1 */\2$rp$,
        '0407/Q1'),
      ('save_quotation_content',
        $re$(COALESCE\(x\.metadata,\s*'\{\}'::jsonb\),\s*x\."serviceRounds")(\s*FROM jsonb_to_recordset\(p_lines\))$re$,
        $rp$\1, x."packQty" /* 0407/Q2 */\2$rp$,
        '0407/Q2'),
      ('save_quotation_content',
        $re$("sortOrder" integer,\s*metadata jsonb,\s*"serviceRounds" integer)(\s*\);)$re$,
        $rp$\1, "packQty" integer /* 0407/Q3 */\2$rp$,
        '0407/Q3'),
      ('create_sales_order_draft',
        $re$("lineTotal",\s*"sortOrder",\s*metadata)(\s*\)\s*SELECT\s+'SOL-' \|\| md5\(p_order_id)$re$,
        $rp$\1, "packQty" /* 0407/D1 */\2$rp$,
        '0407/D1'),
      ('create_sales_order_draft',
        $re$(ql\."lineTotal",\s*ql\."sortOrder",\s*ql\.metadata)(\s*FROM public\.quotation_lines ql)$re$,
        $rp$\1, ql."packQty" /* 0407/D2 */\2$rp$,
        '0407/D2'),
      ('revise_approved_sales_order_atomic',
        $re$("lineTotal",\s*"sortOrder",\s*metadata,\s*"createdAt",\s*"serviceRounds")(\s*\)\s*SELECT\s+'SOL-' \|\| md5\(p_revision_id)$re$,
        $rp$\1, "packQty" /* 0407/R1 */\2$rp$,
        '0407/R1'),
      ('revise_approved_sales_order_atomic',
        $re$(line\."lineTotal",\s*line\."sortOrder",\s*line\.metadata,\s*v_now,\s*line\."serviceRounds")(\s*FROM public\.sales_order_lines line)$re$,
        $rp$\1, line."packQty" /* 0407/R2 */\2$rp$,
        '0407/R2')
    ) AS t(fn, anchor, replacement, marker)
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'mig_0407_patch_overload % count=%', r.fn, v_n;
    END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;

    IF strpos(v_src, r.marker) > 0 THEN
      RAISE NOTICE '0407: % % — ปะไว้แล้ว', r.marker, r.fn;
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    SELECT count(*) INTO v_hits_src FROM regexp_matches(v_src, r.anchor, 'g');
    SELECT count(*) INTO v_hits_def FROM regexp_matches(v_def, r.anchor, 'g');
    IF v_hits_src <> 1 OR v_hits_def <> 1 THEN
      RAISE EXCEPTION 'mig_0407_patch_anchor % % hits=%/%', r.marker, r.fn, v_hits_src, v_hits_def;
    END IF;

    EXECUTE regexp_replace(v_def, r.anchor, r.replacement);
    RAISE NOTICE '0407: % % — ปะแล้ว', r.marker, r.fn;
  END LOOP;
END
$patch$;

-- ── §5 ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย ─────────────────────────────────────────────
DO $verify$
DECLARE
  r record;
  v_n integer;
  v_src text;
  v_fn text;
  v_fns constant text[] := ARRAY['save_quotation_content', 'create_sales_order_draft', 'revise_approved_sales_order_atomic'];
  v_others text := current_setting('mig_0407.others', true);
  v_meta jsonb := current_setting('mig_0407.meta', true)::jsonb;
BEGIN
  -- ฟังก์ชันอื่นทุกตัวใน public เท่าต้นไฟล์ (เนื้อ · volatility · SECURITY · search_path · สิทธิ์) · ไม่มีตัวเกิดใหม่/หาย
  IF v_others IS NULL OR v_others IS DISTINCT FROM (
    SELECT md5(COALESCE(string_agg(
             p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.provolatile::text || '|' || p.prosecdef::text
               || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, ''),
             E'\n' ORDER BY p.oid::regprocedure::text), ''))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT (p.proname = ANY (v_fns))) THEN
    RAISE EXCEPTION 'mig_0407_verify others';
  END IF;

  -- สามตัวที่ปะ: ทุกอย่างยกเว้นเนื้อเท่าต้นไฟล์ (ลายเซ็น · เจ้าของ · volatility · SECURITY · search_path · สิทธิ์)
  IF v_meta IS NULL OR (SELECT count(*) FROM jsonb_object_keys(v_meta)) <> 3 THEN
    RAISE EXCEPTION 'mig_0407_verify meta';
  END IF;
  SELECT count(*) INTO v_n
    FROM jsonb_each_text(v_meta) AS b(fn, h)
    LEFT JOIN (SELECT p.proname, md5(
                        p.oid::regprocedure::text || '|' || p.prorettype::regtype::text || '|' || p.prolang::text || '|' || p.proowner::text
                          || '|' || p.provolatile::text || '|' || p.prosecdef::text || '|' || p.proretset::text
                          || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, '')) AS h
                 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public') now_fn ON now_fn.proname = b.fn
   WHERE now_fn.h IS DISTINCT FROM b.h;
  IF v_n > 0 THEN RAISE EXCEPTION 'mig_0407_verify meta changed=%', v_n; END IF;

  -- ป้ายของไฟล์นี้ + จำนวน "packQty" ต่อฟังก์ชัน + แพตช์เดิมของตัวออก Rev. ยังอยู่ครบ — แต่ละข้อความต้องเจอตามจำนวนพอดี
  FOR r IN
    SELECT * FROM (VALUES
      ('save_quotation_content', '/* 0407/Q1 */', 1), ('save_quotation_content', '/* 0407/Q2 */', 1),
      ('save_quotation_content', '/* 0407/Q3 */', 1), ('save_quotation_content', '"packQty"', 3),
      ('save_quotation_content', 'x."packQty"', 1), ('save_quotation_content', '"packQty" integer', 1),
      ('save_quotation_content', 'DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;', 1),
      ('create_sales_order_draft', '/* 0407/D1 */', 1), ('create_sales_order_draft', '/* 0407/D2 */', 1),
      ('create_sales_order_draft', '"packQty"', 2), ('create_sales_order_draft', 'ql."packQty"', 1),
      ('revise_approved_sales_order_atomic', '/* 0407/R1 */', 1), ('revise_approved_sales_order_atomic', '/* 0407/R2 */', 1),
      ('revise_approved_sales_order_atomic', '"packQty"', 2), ('revise_approved_sales_order_atomic', 'line."packQty"', 1),
      ('revise_approved_sales_order_atomic', 'public.is_sales_manager_role(p_actor_role)', 1),
      ('revise_approved_sales_order_atomic', 'd."ownerId" = p_actor_id', 1),
      ('revise_approved_sales_order_atomic', 'sales_order_copy_service_setup(', 1),
      ('revise_approved_sales_order_atomic', '"movedFrom" = "movedFrom" || jsonb_build_array(', 1)
    ) AS t(fn, needle, expected)
  LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    v_n := (length(v_src) - length(replace(v_src, r.needle, ''))) / length(r.needle);
    IF v_n IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'mig_0407_verify marker % in % = % (คาด %)', r.needle, r.fn, v_n, r.expected;
    END IF;
  END LOOP;

  -- สิทธิ์: anon/authenticated ไม่มี · service_role เรียกได้ (เท่าก่อนรัน — ยืนยันซ้ำด้วยลายเซ็นเต็ม)
  FOREACH v_fn IN ARRAY ARRAY[
    'public.save_quotation_content(text,jsonb,jsonb)',
    'public.create_sales_order_draft(text,text,text,text,jsonb)',
    'public.revise_approved_sales_order_atomic(text,text,timestamptz,text,text,text,text)'
  ] LOOP
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR NOT has_function_privilege('service_role', v_fn, 'EXECUTE') THEN
      RAISE EXCEPTION 'mig_0407_verify grant %', v_fn;
    END IF;
  END LOOP;

  -- คอลัมน์: integer · ว่างได้ · ไม่มีค่าตั้งต้น — ทั้งสองตาราง
  SELECT count(*) INTO v_n FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name IN ('quotation_lines', 'sales_order_lines') AND column_name = 'packQty'
     AND data_type = 'integer' AND is_nullable = 'YES' AND column_default IS NULL;
  IF v_n <> 2 THEN RAISE EXCEPTION 'mig_0407_verify columns=%', v_n; END IF;

  -- CHECK สี่ตัว: อยู่บนตารางของมัน · ตรวจแถวเดิมครบแล้ว (convalidated) · กฎเงินสองตารางเป็นนิพจน์เดียวกัน
  SELECT count(*) INTO v_n FROM pg_constraint c
   WHERE c.contype = 'c' AND c.convalidated
     AND (c.conrelid, c.conname) IN (
       ('public.quotation_lines'::regclass, 'quotation_lines_pack_qty_range'),
       ('public.quotation_lines'::regclass, 'quotation_lines_line_money_rule'),
       ('public.sales_order_lines'::regclass, 'sales_order_lines_pack_qty_range'),
       ('public.sales_order_lines'::regclass, 'sales_order_lines_line_money_rule'));
  IF v_n <> 4 THEN RAISE EXCEPTION 'mig_0407_verify constraints=%', v_n; END IF;
  IF (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
       WHERE c.conrelid = 'public.quotation_lines'::regclass AND c.conname = 'quotation_lines_line_money_rule')
     IS DISTINCT FROM
     (SELECT pg_get_constraintdef(c.oid) FROM pg_constraint c
       WHERE c.conrelid = 'public.sales_order_lines'::regclass AND c.conname = 'sales_order_lines_line_money_rule') THEN
    RAISE EXCEPTION 'mig_0407_verify money rule differs';
  END IF;

  -- เนื้อของสามตัวหลังถอดป้าย (ตัดช่องว่าง) — พิมพ์ไว้เทียบกับค่าที่ฮาร์เนสพิสูจน์ (หัวไฟล์: bodies = ttt)
  FOR r IN
    SELECT p.proname, md5(regexp_replace(regexp_replace(p.prosrc,
             $u$, (x\.|ql\.|line\.)?"packQty"( integer)? /\* 0407/[QDR][1-3] \*/$u$, '', 'g'), '[ \t\n\r]', '', 'g')) AS h
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (v_fns)
     ORDER BY p.proname
  LOOP
    RAISE NOTICE '0407: เนื้อเดิมของ % = %', r.proname, r.h;
  END LOOP;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
