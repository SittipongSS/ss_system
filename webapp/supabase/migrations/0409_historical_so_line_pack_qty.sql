-- ============================================================
--  Migration 0409: ใบสั่งขายย้อนหลัง — "แพ็ค/เดือน" ของบรรทัด (งวด PR-5 ของช่องแพ็ค/เดือน)
--                  ตัวตรวจบรรทัดคูณแพ็ค · ตัวเขียนบรรทัดเก็บ "packQty" และบังคับทุกบรรทัด · ขั้นส่ง/อนุมัติพกเลขแพ็คของแถวที่เก็บแล้ว
--                  (มติเจ้าของ 23/09: ฟอร์มใบย้อนหลังต้องไม่ต่างจากฟอร์มใบเสนอราคา · 08/10 ข้อ A1/A2: จำนวนเงิน = แพ็ค × จำนวน × ราคา
--                   แล้วหักส่วนลดรายการ และช่อง "แพ็ค/เดือน" บังคับใส่ทุกรายการหมวด 02-001 — 2 แพ็ค × 12 เดือน × 3,500 = 84,000
--                   · mockups/qt-pack-column/OWNER_ANSWERS.md ข้อวินิจฉัย 7 · docs/qt-pack-column.md งวด PR-5)
--
--  🐞 ของเดิม — ฟังก์ชันของใบย้อนหลังสี่ตัวไม่รู้จัก "packQty" (0407 เพิ่มคอลัมน์ + กฎเงิน แต่ตั้งใจไม่แตะสี่ตัวนี้):
--     · ตัวตรวจบรรทัด (0379 + 0394/P4) คิด gross = round(จำนวน × ราคา/หน่วย, 2)
--         ⇒ บรรทัด 2 × 12 × 3,500 = 84,000 ถูกตีกลับ historical_so_line_money_mismatch
--     · ตัวเขียนบรรทัด (0379 + 0394/P5–P7) ไม่มีคอลัมน์ "packQty" ใน INSERT ⇒ เก็บ NULL ⇒ บรรทัด 84,000 ชนกฎเงินของ 0407 (23514)
--     · ขั้นส่ง/อนุมัติ (0374 + แถว 0382 · อนุมัติ + 0394/P3) ประกอบแถวที่เก็บแล้วเป็น jsonb ใหม่ 6 คีย์ ไม่มีเลขแพ็ค แล้วเรียกตัวตรวจ
--         ⇒ ใบที่มีแพ็ค ≥ 2 บันทึกได้แต่ส่ง/อนุมัติไม่ได้ตลอดกาล
--  ⭐ ของใหม่: p_lines[i] พกคีย์ "packQty" (แพ็ค/เดือน) → ตัวตรวจ → ตัวเขียน → sales_order_lines."packQty"
--     · จำนวนเงิน = round(แพ็ค(ว่าง = 1) × จำนวน × ราคา/หน่วย, 2) − ส่วนลดรายการ — ปัดครั้งเดียวหลังคูณสามตัว · ค่าคลาด ±0.01 เท่าเดิม
--       = นิพจน์เดียวกับ CHECK sales_order_lines_line_money_rule ของ 0407 และ quoteLineNet ฝั่ง JS
--     · ส่วนลด % คิดจากยอดที่คูณแพ็คแล้ว · ส่วนลดบาทเป็นยอดทั้งรายการ ไม่ถูกคูณ (ข้อ A5 — เท่าใบเสนอราคา)
--     · "packsPerRound" (รอบละกี่แพ็ค · 0394) เป็นอีกตัวเลขหนึ่งของงานบริการ เก็บที่ sales_order_line_zones — **ไม่คูณเงิน** · ไฟล์นี้ไม่แตะ
--     · บรรทัดที่ไม่มีคีย์ "packQty" (หรือเป็น null) ผ่านตัวตรวจด้วยผลเดิมทุกตัวอักษร (คูณ 1)
--
--  ── ปะอะไร (7 แถว · pg_get_functiondef แบบ 0392/0394/0400/0404/0407 — ไม่คัดเนื้อจากไฟล์เก่า · ทุกแถว "เติม" ไม่มีอะไรถูกลบ) ──
--   ตัวตรวจบรรทัด historical_so_check_lines (หลวม — ต้องรับแถวที่เก็บแล้วของขั้นส่ง/อนุมัติ)
--   H1  ก่อนสูตรเงิน: "packQty" **มีค่า** = ต้องเป็นตัวเลข (JSON number) จำนวนเต็ม 1–9999 ไม่งั้น historical_so_line_pack_qty_invalid
--       · ไม่มีคีย์ หรือเป็น null = ผ่าน (คูณ 1) — แถวที่เก็บแล้วซึ่งคอลัมน์ว่างมาถึงตัวตรวจเป็น "packQty": null
--   H2  สูตรเงิน: v_line_gross := round(COALESCE(แพ็ค, 1) × จำนวน × ราคา/หน่วย, 2) — ทั้งทางเข้ม (payload) และทางหลวม (แถวที่เก็บแล้ว)
--   ตัวเขียนบรรทัด historical_so_write_children (เข้ม — แบบเดียวกับ 0394/P5)
--   W0  ก่อน DELETE: **ทุกบรรทัด** ต้องพก "packQty" เป็นตัวเลขจำนวนเต็ม 1–9999 (ไม่พก · null · สตริง · 0 · 10000 · 1.5 =
--       historical_so_line_pack_qty_invalid) ⇒ ฟอร์มรุ่นก่อนงวด PR-5 บันทึกใบย้อนหลังไม่ได้เลย (ดัง ไม่เงียบ) · ตีกลับแล้วของเดิมอยู่ครบ
--   W1  รายการคอลัมน์ของ INSERT บรรทัด + "packQty" (ท้ายรายการ)
--   W2  รายการค่า + (e.l->>'packQty')::numeric::integer (ท้ายรายการ) · หน่วย/คำบรรยาย/คอลัมน์อื่นเท่าเดิมทุกตัว
--   ขั้นส่ง / ขั้นอนุมัติ (ตรวจซ้ำจากแถวที่เก็บจริง)
--   S1  submit_historical_sales_order  — jsonb ของแถวที่เก็บแล้ว + 'packQty', l."packQty"
--   A1  approve_historical_sales_order — เช่นเดียวกัน (ผลรวมที่เทียบกับยอดหัวใบคือ Σ lineTotal เหมือนเดิม)
--   + COMMENT ON COLUMN sales_order_lines."packQty" ใหม่ (ข้อความของ 0407 บอกว่า "ใบสั่งขายย้อนหลังเป็น NULL เสมอ" — ไม่จริงอีกแล้ว)
--   · บล็อก (H1 · W0) ขึ้นต้นด้วยป้าย "-- 0409/xx ▶" จบด้วย "-- 0409/xx ◀" · แถวที่ปะในบรรทัด (H2 · W1 · W2 · S1 · A1) มีป้าย "/* 0409/xx */"
--   · anchor ต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ pg_get_functiondef · overload ต้องมีตัวเดียว · มีป้ายแล้ว = ข้าม ("ปะไว้แล้ว")
--   · CREATE OR REPLACE จากข้อความของ pg_get_functiondef เก็บเจ้าของ · สิทธิ์ EXECUTE · SECURITY · search_path · แพตช์เดิมทุกตัว
--   🪤 ไฟล์นี้ **ไม่เขียนคำว่า FUNCTION ตามด้วย public. + ชื่อฟังก์ชันใดเลย** (แม้ในคอมเมนต์) — ฟังก์ชันที่รันอยู่อ้างด้วยชื่อเปล่า /
--      p.proname = '…' / ลายเซ็นในสตริงของ has_function_privilege เท่านั้น (ยาม "นิยามล่าสุด" ของหลายเทสต์หาเจ้าของนิยามด้วยข้อความนั้น)
--      ⇒ migration หลังจากนี้ที่เขียนสี่ตัวนี้ทับทั้งก้อน **ต้องพก "packQty" ไปด้วย**
--
--  ── payload (สัญญากับ historicalServiceRpcArgs ฝั่ง JS) ─────────────────────────────────────────
--   p_lines[i] + "packQty": 1..9999 (ตัวเลข · บังคับทุกบรรทัดตอนบันทึก) — แพ็ค/เดือน = ตัวคูณเงินของบรรทัด
--              · "packsPerRound" (0394) ยังบังคับเหมือนเดิม และยังเป็นคนละตัวเลข (รอบละกี่แพ็คของโซน)
--              · "unit" ส่งมาได้ตามเดิม (ตัวเขียนของ 0379 ใช้หน่วยจาก payload ก่อนหน่วยขายในทะเบียน) — JS รุ่น PR-5 ส่ง "เดือน"
--   RPC สร้าง/แก้ (create_ / update_historical_sales_order) ไม่ถูกปะ: ส่ง p_lines ต่อให้ตัวตรวจ/ตัวเขียน และคืนแถวบรรทัดทั้งแถว (to_jsonb)
--
--  ── ด่านก่อนรัน ($pre$ — RAISE แล้วทั้งไฟล์ถอย ไม่มีครึ่ง ๆ กลาง ๆ) ───────────────────────────────
--   mig_0409_needs_functions       (ทุกรอบ) ฟังก์ชันสี่ตัวไม่ครบ หรือมี overload
--   mig_0409_needs_0407            (ทุกรอบ) ยังไม่มีคอลัมน์ sales_order_lines."packQty" + CHECK ช่วง + กฎเงินของ 0407
--   mig_0409_needs_chain           (ทุกรอบ) เนื้อของสี่ตัวไม่มีแพตช์เดิมครบ (แถว 0382 · 0394/P3 · P4 · P5 · P6 · P7a · P7b · P7c)
--                                  — แจ้งผู้พัฒนา · ทางกลับคือลำดับท้ายหัวไฟล์นี้ ("ห้ามรัน 0374 · 0379 ซ้ำ")
--   mig_0409_historical_in_flight  (รันครั้งแรกเท่านั้น = ยังไม่มีป้าย 0409/ ในสี่ตัวนี้เลย) มีใบย้อนหลังร่าง/รออนุมัติ/ตีกลับ
--       — ข้อความบอกจำนวนและเลขที่ใบ (สูงสุด 10 ใบ) · ไม่มีสวิตช์ข้ามด่านนี้
--       ⇒ บรรทัดของใบพวกนั้นไม่มีเลขแพ็ค (NULL) — ฟอร์มรุ่น PR-5 เปิดใบแบบนั้นมาแก้แล้วช่องแพ็คว่าง ต้องคีย์แยกแพ็คเองโดยไม่มีตัวช่วยเทียบยอดเดิม
--         ให้อนุมัติ/ยกเลิกให้จบก่อนรัน · **จำนวนมากกว่า 0 = เรื่องที่เจ้าของต้องตัดสิน ไม่ใช่เรื่องที่ไฟล์นี้เลี่ยงให้**
--         · บันทึกใบร่างนั้นซ้ำก่อนรันไม่ทำให้ผ่าน (ยังเป็นใบร่างที่ไม่มีเลขแพ็คเหมือนเดิม — ดู "สลับลำดับ" ใต้ลำดับ deploy)
--       (ที่บันทึกไว้: อ่าน prod 29/09 — ใบย้อนหลัง 4 ใบ ยกเลิกทั้งหมด (หัวไฟล์ 0394) · ไม่ได้อ่านซ้ำตอนเขียนไฟล์นี้ — SELECT ตรวจก่อนรันข้างล่างนับใหม่)
--   mig_0409_patch_overload / mig_0409_patch_anchor   เนื้อของฟังก์ชันที่รันอยู่ไม่ใช่เนื้อที่ไฟล์นี้รู้จัก (anchor ไม่เจอ หรือเจอเกินหนึ่ง)
--   mig_0409_verify                ตรวจท้ายไม่ครบ (ป้าย · ลำดับด่าน · สิทธิ์ · ฟังก์ชันอื่นถูกแตะ)
--       · mig_0409_verify body = เนื้อเดิมของฟังก์ชันที่ **รอบนี้ปะ** (ถอดส่วนที่ไฟล์นี้เติมออกแล้ว) ไม่ตรง md5 ที่พิสูจน์บนฮาร์เนสทุกไบต์
--         — anchor ยังเจอครบแต่มีคนแก้ฟังก์ชันนั้นที่อื่น (เช่น migration อื่นรันคั่นระหว่างตรวจก่อนรันกับตอนรัน) ⇒ ไม่ปะลงเนื้อที่ไม่เคยพิสูจน์
--         · ฟังก์ชันที่มีป้ายของไฟล์นี้ครบแล้ว (รอบนี้ไม่ปะ) ไม่ถูกบังคับ — แค่พิมพ์ NOTICE ⇒ รันซ้ำได้แม้มี migration หลังจากนี้ปะสี่ตัวนี้ต่อ
--
--  ── ตรวจก่อนรัน (อ่านอย่างเดียว · รันได้ทุกเมื่อ ทั้งก่อนและหลังรัน · ผลแถวเดียว) ─────────────────────────────
--   เกณฑ์ก่อนรันครั้งแรก: fns = 4 · chain = 4 · anchors = A1=1 H1=1 H2=1 S1=1 W0=1 W1=1 W2=1 · marks = 0 · bodies = tttt · bodies_ws = tttt
--                  · md5_live = md5_expected · in_flight = 0 · m0407 = 3 · anon = f · svc = fftt
--   ข้อมูลประกอบ (ไม่ใช่เกณฑ์): hist = จำนวนใบย้อนหลังแยกสถานะ (ค่าตามที่อ่านไว้ 29/09: cancelled=4 · none = ไม่มีเลย)
--                  · in_flight_orders = เลขที่ใบที่นับใน in_flight พร้อมสถานะ (none = ไม่มี) — ใช้ตอนเจ้าของตัดสินทีละใบ
--                  · packed_so = บรรทัดใบสั่งขายที่มีเลขแพ็คทุกชนิดใบ · packed_hist = เฉพาะของใบย้อนหลัง
--                    (packed_hist เป็น 0 เฉพาะบนฐานที่ **ไม่เคยรันไฟล์นี้เลย** · รันแล้วมีคนคีย์ใบ หรือรันแล้วถอยด้วยบล็อกถอยกลับ = มากกว่า 0 ได้ ไม่ใช่ความผิดพลาด)
--   (md5_live = md5_expected คือสองช่องนั้นตรงกันทุกตัวอักษร)
--   ⛔ อย่ารัน แล้วแจ้งผู้พัฒนา เมื่อ:
--      · fns ≠ 4 (ฟังก์ชันไม่ครบ/มี overload) · chain ≠ 4 (แพตช์ 0382/0394 ไม่ครบ) · m0407 ≠ 3 (0407 ยังไม่รัน/ไม่ครบ)
--      · anchors มีตัวไหนไม่ใช่ 1 ขณะ marks = 0 · marks ไม่ใช่ 0 (ก่อนรันครั้งแรก) และไม่ใช่ 7 (รันแล้ว)
--      · bodies ไม่ใช่ tttt ขณะ marks = 0 = เนื้อของฟังก์ชันบนฐานไม่ใช่เนื้อที่พิสูจน์ไว้บนฮาร์เนส (ตัวอักษรเรียงตาม ตัวตรวจ · ตัวเขียน · ส่ง · อนุมัติ)
--        — ไฟล์หยุดเองด้วย mig_0409_verify body (ทุกฟังก์ชันที่รอบนั้นต้องปะ) · ถ้า bodies_ws ยังเป็น tttt แปลว่าต่างกันแค่ช่องว่าง/การขึ้นบรรทัด:
--          ไฟล์ก็หยุดเหมือนกัน ให้ผู้พัฒนาดู md5_live
--        (ขณะ marks = 7 มี f ได้เมื่อ migration หลังจากนี้ปะฟังก์ชันนั้นต่อ — ไฟล์นี้ไม่ปะอะไรแล้ว จึงไม่หยุด)
--      · in_flight ≠ 0 **ขณะ marks = 0** (รันครั้งแรก หรือรันใหม่หลังถอย) = มีใบย้อนหลังร่าง/รออนุมัติ/ตีกลับ (ไฟล์จะหยุดเองด้วย
--        mig_0409_historical_in_flight) ⇒ **เจ้าของตัดสิน** ทีละใบ (in_flight_orders) ว่าจะอนุมัติหรือยกเลิกใบพวกนั้นก่อน
--        (ขณะ marks = 7 ใบร่างรายวันเป็นเรื่องปกติ ไม่ใช่เหตุให้หยุด — ด่านนี้เช็คเฉพาะรันแรก)
--      · packed_hist ≠ 0 ขณะ marks = 0 **บนฐานที่ไม่เคยรันไฟล์นี้แล้วถอย** = มีบรรทัดใบย้อนหลังที่มีเลขแพ็คทั้งที่ยังไม่มีทางเขียน
--        (ไฟล์ไม่หยุดเองข้อนี้ — ดูด้วยตา · เคยรันแล้วถอยด้วยบล็อกถอยกลับ = ปกติ: ใบที่อนุมัติ/ยกเลิกแล้วเก็บเลขแพ็คไว้ รันไฟล์นี้ใหม่ได้)
--      · anon ไม่ใช่ f หรือ svc ไม่ใช่ fftt (สิทธิ์บนฐานไม่ใช่แบบที่ 0374/0379 ตั้งไว้ — ตรวจท้ายจะหยุดไฟล์ด้วย mig_0409_verify grant)
--   หลังรัน: SELECT เดียวกันต้องได้ anchors = A1=0 H1=1 H2=0 S1=0 W0=1 W1=0 W2=0 · marks = 7 · bodies = tttt · bodies_ws = tttt
--            · md5_live = md5_expected (ค่านี้คิดจากเนื้อที่ถอดส่วนที่ไฟล์นี้เติมออกแล้ว จึงเท่าเดิมทั้งก่อนและหลังรัน)
--   (ไฟล์หยุดเองทุกข้อของรายการ ⛔ ยกเว้นสองข้อที่ต้องดูด้วยตา: marks ที่ไม่ใช่ 0 และไม่ใช่ 7 — ไฟล์จะปะแถวที่ขาดให้ ซึ่งเป็นทางกลับหลังรัน 0379 พลาดเท่านั้น
--    · และ packed_hist)
--   ⏱ ผลแถวนี้มีอายุ: ใช้ตัดสินได้เฉพาะรอบนั่งเดียวกับที่รันไฟล์ — มี migration อื่นรันคั่น หรือข้ามวัน = รัน SELECT นี้ใหม่ก่อน
--
--   SELECT
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname IN ('historical_so_check_lines', 'historical_so_write_children',
--                        'submit_historical_sales_order', 'approve_historical_sales_order')) AS fns,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND ((p.proname = 'historical_so_check_lines' AND strpos(p.prosrc, '0394/P4') > 0)
--        OR (p.proname = 'historical_so_write_children' AND strpos(p.prosrc, '0394/P5') > 0 AND strpos(p.prosrc, '0394/P6') > 0
--            AND strpos(p.prosrc, '0394/P7a') > 0 AND strpos(p.prosrc, '0394/P7b') > 0 AND strpos(p.prosrc, '0394/P7c') > 0)
--        OR (p.proname = 'submit_historical_sales_order' AND strpos(p.prosrc, 'NOT public.is_sales_keyer_role(p_actor_role)') > 0)
--        OR (p.proname = 'approve_historical_sales_order' AND strpos(p.prosrc, 'NOT public.is_sales_manager_role(p_actor_role)') > 0
--            AND strpos(p.prosrc, '0394/P3') > 0))) AS chain,
--    (SELECT string_agg(a.marker || '=' || (SELECT count(*) FROM regexp_matches(p.prosrc, a.anchor, 'g')), ' ' ORDER BY a.marker)
--       FROM (VALUES
--         ('historical_so_check_lines', 'H1', $re$(-- สูตรเงินของใบเสนอราคา \(quoteLineNet\))$re$),
--         ('historical_so_check_lines', 'H2', $re$(v_line_gross := round\()(v_qty \* v_unit_price, 2\);)$re$),
--         ('historical_so_write_children', 'W0', $re$(DELETE FROM public\.sales_order_installments WHERE "salesOrderId" = p_order_id;)$re$),
--         ('historical_so_write_children', 'W1', $re$("serviceRounds",\s*"sortOrder",\s*metadata)(\s*\)\s*SELECT\s+'SOL-' \|\| md5\(p_order_id \|\| ':' \|\| e\.ord\),)$re$),
--         ('historical_so_write_children', 'W2', $re$(\(e\.ord - 1\)::integer,\s*'\{\}'::jsonb)(\s*FROM jsonb_array_elements\(p_lines\) WITH ORDINALITY AS e\(l, ord\)\s*JOIN public\.products p)$re$),
--         ('submit_historical_sales_order', 'S1', $re$('unitPrice', l\."unitPrice", 'lineTotal', l\."lineTotal", 'serviceRounds', l\."serviceRounds")(\s*\) ORDER BY l\."sortOrder"\))$re$),
--         ('approve_historical_sales_order', 'A1', $re$('unitPrice', l\."unitPrice", 'lineTotal', l\."lineTotal", 'serviceRounds', l\."serviceRounds")(\s*\) ORDER BY l\."sortOrder"\))$re$)
--       ) AS a(fn, marker, anchor)
--       JOIN pg_proc p ON p.proname = a.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public') AS anchors,
--    (SELECT count(*)
--       FROM (VALUES ('historical_so_check_lines', '0409/H1'), ('historical_so_check_lines', '0409/H2'),
--                    ('historical_so_write_children', '0409/W0'), ('historical_so_write_children', '0409/W1'),
--                    ('historical_so_write_children', '0409/W2'), ('submit_historical_sales_order', '0409/S1'),
--                    ('approve_historical_sales_order', '0409/A1')) AS m(fn, marker)
--       JOIN pg_proc p ON p.proname = m.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
--      WHERE strpos(p.prosrc, m.marker) > 0) AS marks,
--    b.bodies, b.bodies_ws, b.md5_live,
--    'check=b86894c10dbecca2fcf496d4610c78e8 write=b4c70bf11bf3d271e8338db65764a8b1 submit=200d31946e8bad9bfd9ac11b5cb61359 approve=aaf8001cfa106c20e5660376456ec7b2'::text AS md5_expected,
--    (SELECT COALESCE(string_agg(s.status || '=' || s.n, ' ' ORDER BY s.status), 'none')
--       FROM (SELECT o.status, count(*) AS n FROM public.sales_orders o WHERE o.origin = 'historical' GROUP BY o.status) s) AS hist,
--    (SELECT count(*) FROM public.sales_orders o
--      WHERE o.origin = 'historical' AND o.status IN ('draft', 'pending_approval', 'rejected')) AS in_flight,
--    (SELECT COALESCE(string_agg(o."orderNumber" || '=' || o.status, ' ' ORDER BY o."orderNumber"), 'none') FROM public.sales_orders o
--      WHERE o.origin = 'historical' AND o.status IN ('draft', 'pending_approval', 'rejected')) AS in_flight_orders,
--    (SELECT count(*) FROM public.sales_order_lines l WHERE to_jsonb(l)->>'packQty' IS NOT NULL) AS packed_so,
--    (SELECT count(*) FROM public.sales_order_lines l JOIN public.sales_orders o ON o.id = l."salesOrderId"
--      WHERE o.origin = 'historical' AND to_jsonb(l)->>'packQty' IS NOT NULL) AS packed_hist,
--    ((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sales_order_lines'
--        AND column_name = 'packQty' AND data_type = 'integer')
--     + (SELECT count(*) FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
--         WHERE n.nspname = 'public' AND t.relname = 'sales_order_lines' AND c.contype = 'c' AND c.convalidated
--           AND c.conname IN ('sales_order_lines_pack_qty_range', 'sales_order_lines_line_money_rule'))) AS m0407,
--    (SELECT bool_or(has_function_privilege('anon', p.oid, 'EXECUTE') OR has_function_privilege('authenticated', p.oid, 'EXECUTE'))
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--        AND p.proname IN ('historical_so_check_lines', 'historical_so_write_children',
--                          'submit_historical_sales_order', 'approve_historical_sales_order')) AS anon,
--    (SELECT string_agg(has_function_privilege('service_role', p.oid, 'EXECUTE')::text::char(1), '' ORDER BY e.ord)
--       FROM (VALUES (1, 'historical_so_check_lines'), (2, 'historical_so_write_children'),
--                    (3, 'submit_historical_sales_order'), (4, 'approve_historical_sales_order')) AS e(ord, fn)
--       JOIN pg_proc p ON p.proname = e.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public') AS svc
--   FROM (SELECT string_agg((md5(s.src) = e.h)::text::char(1), '' ORDER BY e.ord) AS bodies,
--                string_agg((md5(regexp_replace(s.src, '[ \t\n\r]', '', 'g')) = e.w)::text::char(1), '' ORDER BY e.ord) AS bodies_ws,
--                string_agg(e.tag || '=' || md5(s.src), ' ' ORDER BY e.ord) AS md5_live
--           FROM (VALUES
--             (1, 'check', 'historical_so_check_lines', 'b86894c10dbecca2fcf496d4610c78e8', 'd4cfa48d9b4376adddd94d3c51a40215'),
--             (2, 'write', 'historical_so_write_children', 'b4c70bf11bf3d271e8338db65764a8b1', '673100c3fa3aa657cfcc6101b1ee1d3a'),
--             (3, 'submit', 'submit_historical_sales_order', '200d31946e8bad9bfd9ac11b5cb61359', 'ed54d6b36147ad84330f13a36bdd620d'),
--             (4, 'approve', 'approve_historical_sales_order', 'aaf8001cfa106c20e5660376456ec7b2', 'd5f9ba4198aad421543cb4bb56820ff9')
--           ) AS e(ord, tag, fn, h, w)
--           JOIN pg_proc p ON p.proname = e.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
--           CROSS JOIN LATERAL (SELECT regexp_replace(regexp_replace(p.prosrc,
--                    $u$\n[ \t]*-- 0409/(H1|W0) ▶.*-- 0409/(H1|W0) ◀$u$, ''),
--                    $u$COALESCE\(\(v_item->>'packQty'\)::numeric, 1\) \* /\* 0409/H2 \*/ |, ("packQty"|\(e\.l->>'packQty'\)::numeric::integer|'packQty', l\."packQty") /\* 0409/(W1|W2|S1|A1) \*/$u$,
--                    '', 'g') AS src) s) b;
--
--  ── ลำดับ deploy (รัน **ก่อน** merge · สองจังหวะ) ───────────────────────────────────────────────
--   0) ทุกด่านในเครื่อง/CI เขียว (ไม่มีคอลัมน์ใหม่ ⇒ check:columns ไม่แดง) · ฮาร์เนส PGlite harness-0409 ผ่านสองรอบผลเหมือนกัน
--      · ตรวจเลข migration อีกครั้ง (origin/main + PR ที่เปิดอยู่) — ห้ามมีใครถือ 0409
--      🔒 **ไม่มีด่าน CI ไหนกัน merge ก่อนรันไฟล์นี้** — ไม่มีคอลัมน์ใหม่ ⇒ check:columns เขียวทั้งที่ยังไม่รัน (งวด PR-1 มี: CI แดงจนกว่าจะรัน 0407)
--         และ production ตาม main เองวันละ 3 รอบ ⇒ กันด้วยมือ: เปิด PR เป็น **draft** + หัวเรื่อง "⚠️ รัน 0409 ก่อน merge"
--         กด ready หลังผู้พัฒนาตรวจแถว "ตรวจหลังรัน" แล้วเท่านั้น · ห้ามบันทึกใบย้อนหลังจาก dev server ของแบรนช์งวด PR-5 ก่อนรันไฟล์นี้
--         (ฐาน dev = ฐานจริง: ใบที่บันทึกคือใบจริง และเป็นใบร่างที่ขวางไฟล์นี้ — ดู "สลับลำดับ")
--   1) เจ้าของรัน SELECT ตรวจก่อนรันข้างบนที่ SQL Editor แล้วส่งผลแถวนั้นกลับมาให้ผู้พัฒนาดูก่อน (จังหวะที่หนึ่ง)
--   2) **หลังผู้พัฒนาตอบ "ไปได้" กับแถวนั้น และในรอบนั่งเดียวกัน** (มี migration อื่นรันคั่น หรือข้ามวัน = ทำจังหวะที่หนึ่งใหม่ ·
--      เนื้อฟังก์ชันเปลี่ยนระหว่างนั้น = ไฟล์หยุดเองด้วย mig_0409_patch_anchor / mig_0409_verify body):
--      เจ้าของประกาศ freeze สั้น ๆ: ห้ามคีย์/แก้ใบสั่งขายย้อนหลัง → รันไฟล์นี้ทั้งก้อนที่ SQL Editor แล้วรัน SELECT ตรวจหลังรันข้างล่าง (จังหวะที่สอง)
--   3) ต่อกันทันที: merge → Deploy to production → /api/version ตรง sha    4) ยก freeze    5) เปิดจอตรวจ (อ่านอย่างเดียว)
--   ช่วงรันถึง deploy: JS รุ่นเดิม (ก่อนงวด PR-5) บันทึกใบย้อนหลังไม่ได้ — ไม่ส่ง "packQty" ⇒ ตัวเขียนตอบ historical_so_line_pack_qty_invalid
--     (รุ่นเดิมยังไม่รู้จักรหัสนี้ ⇒ จอขึ้นข้อความกลาง "ดำเนินการกับเอกสารไม่สำเร็จ") — ดัง ไม่เงียบ ไม่มีข้อมูลเปลี่ยน · ส่ง/อนุมัติใบที่เก็บไว้ยังทำได้
--     · คีย์ intake เดิมที่ยิงซ้ำข้าม deploy ได้ intake_key_conflict (แฮชรวมคีย์ใหม่) = ตั้งใจ เท่า 0394
--   สลับลำดับ (โค้ดงวด PR-5 ถึงฐานก่อนไฟล์นี้ — merge ก่อนรัน หรือ dev server ของแบรนช์): แพ็ค ≥ 2 ถูกตัวตรวจเดิมตีกลับ (ดัง) ·
--     แพ็ค 1 ถูกเก็บเป็น NULL เงียบ ๆ (ยอดเท่ากัน เลขแพ็คหาย) — เข็มขัดฝั่ง JS (เทียบแถวที่ RPC คืนกับเลขที่ส่ง) ตอบได้ **หลัง** แถวถูกเก็บแล้วเท่านั้น
--     🔴 ใบร่างที่เก็บแบบนั้น **ขวางการรันครั้งแรกของไฟล์นี้** (mig_0409_historical_in_flight) · บันทึกซ้ำกี่ครั้งก็ยังเป็น NULL และยังขวาง ·
--        ใบร่างใหม่ทุกใบ = ขวางเพิ่ม ⇒ หยุดคีย์ใบย้อนหลังทันที แล้วเจ้าของตัดสินทีละใบ (in_flight_orders ของ SELECT ตรวจก่อนรัน) — ทางออกมีสองทางเท่านั้น:
--        ① ยกเลิกใบนั้น → รันไฟล์นี้ → คีย์ใบใหม่ตั้งแต่ต้น (ได้เลขแพ็คครบ)
--        ② อนุมัติใบนั้นตามที่เก็บ → รันไฟล์นี้ (เลขแพ็คของใบนั้นหายถาวร — ใบที่อนุมัติแล้วเปิดแก้ไม่ได้ · ยอดคิดแบบคูณ 1 ตามที่เก็บ)
--        "เปิดใบร่างมาบันทึกใหม่หลังรัน" **ไม่มีอยู่จริง** — ไฟล์นี้ไม่รันจนกว่าใบร่างนั้นจะพ้นสถานะร่าง/รออนุมัติ/ตีกลับ
--     ⇒ ลำดับที่ถูกมีทางเดียว: รันไฟล์นี้ก่อน
--   🚪 ประตูทางเดียว: หลังไฟล์นี้ โค้ดรุ่นก่อนงวด PR-5 บันทึกใบย้อนหลังไม่ได้อีก (ตัวเขียนตีกลับ) — ไม่ใช่ยอดหดเงียบ ๆ แบบใบเสนอราคา
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   เกณฑ์หลังรันทุกรอบ: marks = 7 · packs = 8/5/2/2 · gate = t · chain = 4 · anon = f · svc = fftt · note = t
--   ข้อมูลประกอบ (ไม่ใช่เกณฑ์): in_flight · packed_hist — รันครั้งแรกสุดได้ 0 ทั้งคู่ · รันซ้ำหลังมีคนคีย์ใบย้อนหลังด้วยฟอร์มใหม่
--        หรือรันใหม่หลังถอยด้วยบล็อกถอยกลับ = มากกว่า 0 ได้ ไม่ใช่ความผิดพลาด
--        · และ SELECT ตรวจก่อนรันข้างบนต้องได้ค่า "หลังรัน" ตามที่เขียนไว้ใต้รายการ ⛔
--
--   SELECT
--    (SELECT count(*)
--       FROM (VALUES ('historical_so_check_lines', '-- 0409/H1 ▶'), ('historical_so_check_lines', '/* 0409/H2 */'),
--                    ('historical_so_write_children', '-- 0409/W0 ▶'), ('historical_so_write_children', '/* 0409/W1 */'),
--                    ('historical_so_write_children', '/* 0409/W2 */'), ('submit_historical_sales_order', '/* 0409/S1 */'),
--                    ('approve_historical_sales_order', '/* 0409/A1 */')) AS m(fn, needle)
--       JOIN pg_proc p ON p.proname = m.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
--      WHERE (length(p.prosrc) - length(replace(p.prosrc, m.needle, ''))) / length(m.needle) = 1) AS marks,
--    (SELECT string_agg(((length(p.prosrc) - length(replace(p.prosrc, 'packQty', ''))) / length('packQty'))::text, '/' ORDER BY e.ord)
--       FROM (VALUES (1, 'historical_so_check_lines'), (2, 'historical_so_write_children'),
--                    (3, 'submit_historical_sales_order'), (4, 'approve_historical_sales_order')) AS e(ord, fn)
--       JOIN pg_proc p ON p.proname = e.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public') AS packs,
--    (SELECT strpos(p.prosrc, '-- 0409/W0 ◀') > 0
--            AND strpos(p.prosrc, '-- 0409/W0 ◀') < strpos(p.prosrc, 'DELETE FROM public.sales_order_installments WHERE "salesOrderId" = p_order_id;')
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'historical_so_write_children') AS gate,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND ((p.proname = 'historical_so_check_lines' AND strpos(p.prosrc, '0394/P4') > 0)
--        OR (p.proname = 'historical_so_write_children' AND strpos(p.prosrc, '0394/P5') > 0 AND strpos(p.prosrc, '0394/P6') > 0
--            AND strpos(p.prosrc, '0394/P7a') > 0 AND strpos(p.prosrc, '0394/P7b') > 0 AND strpos(p.prosrc, '0394/P7c') > 0)
--        OR (p.proname = 'submit_historical_sales_order' AND strpos(p.prosrc, 'NOT public.is_sales_keyer_role(p_actor_role)') > 0)
--        OR (p.proname = 'approve_historical_sales_order' AND strpos(p.prosrc, 'NOT public.is_sales_manager_role(p_actor_role)') > 0
--            AND strpos(p.prosrc, '0394/P3') > 0))) AS chain,
--    (has_function_privilege('anon', 'public.historical_so_check_lines(jsonb,text)', 'EXECUTE')
--      OR has_function_privilege('anon', 'public.historical_so_write_children(text,jsonb,jsonb,numeric,text,text)', 'EXECUTE')
--      OR has_function_privilege('anon', 'public.submit_historical_sales_order(text,timestamptz,text,text,text,jsonb)', 'EXECUTE')
--      OR has_function_privilege('anon', 'public.approve_historical_sales_order(text,timestamptz,text,text,text,text,text,uuid,text,text,integer)', 'EXECUTE')
--      OR has_function_privilege('authenticated', 'public.historical_so_check_lines(jsonb,text)', 'EXECUTE')
--      OR has_function_privilege('authenticated', 'public.historical_so_write_children(text,jsonb,jsonb,numeric,text,text)', 'EXECUTE')
--      OR has_function_privilege('authenticated', 'public.submit_historical_sales_order(text,timestamptz,text,text,text,jsonb)', 'EXECUTE')
--      OR has_function_privilege('authenticated', 'public.approve_historical_sales_order(text,timestamptz,text,text,text,text,text,uuid,text,text,integer)', 'EXECUTE')) AS anon,
--    (has_function_privilege('service_role', 'public.historical_so_check_lines(jsonb,text)', 'EXECUTE')::text::char(1)
--      || has_function_privilege('service_role', 'public.historical_so_write_children(text,jsonb,jsonb,numeric,text,text)', 'EXECUTE')::text::char(1)
--      || has_function_privilege('service_role', 'public.submit_historical_sales_order(text,timestamptz,text,text,text,jsonb)', 'EXECUTE')::text::char(1)
--      || has_function_privilege('service_role', 'public.approve_historical_sales_order(text,timestamptz,text,text,text,text,text,uuid,text,text,integer)', 'EXECUTE')::text::char(1)) AS svc,
--    (SELECT strpos(COALESCE(col_description(a.attrelid, a.attnum), ''), '0409') > 0
--       FROM pg_attribute a WHERE a.attrelid = 'public.sales_order_lines'::regclass AND a.attname = 'packQty') AS note,
--    (SELECT count(*) FROM public.sales_orders o
--      WHERE o.origin = 'historical' AND o.status IN ('draft', 'pending_approval', 'rejected')) AS in_flight,
--    (SELECT count(*) FROM public.sales_order_lines l JOIN public.sales_orders o ON o.id = l."salesOrderId"
--      WHERE o.origin = 'historical' AND l."packQty" IS NOT NULL) AS packed_hist;
--
--  ── ถอยกลับ ─────────────────────────────────────────────────────────────────────────────
--   🔴 ถอยได้เฉพาะตอนที่ **ไม่มีใบย้อนหลังร่าง/รออนุมัติ/ตีกลับที่บรรทัดมีเลขแพ็ค** — ตัวตรวจรุ่นเดิมคิดยอดแบบคูณ 1
--      ⇒ ใบพวกนั้น (แพ็ค ≥ 2) จะส่ง/อนุมัติไม่ได้อีก · ใบที่อนุมัติ/ยกเลิกแล้วไม่ถูกตรวจซ้ำที่ไหน เลขแพ็คของมันอยู่ต่อได้ (CHECK ของ 0407 ยังคุม)
--   ถอยโค้ด JS ของงวด PR-5 ก่อนเสมอ แล้วค่อยรันบล็อกนี้ (บล็อกเดียว · มีด่านในตัว · แต่ละรูปต้องเจอครั้งเดียวพอดีไม่งั้นหยุด):
--      BEGIN;
--      DO $undo$
--      DECLARE r record; v_oid oid; v_def text; v_hits integer;
--      BEGIN
--        IF EXISTS (SELECT 1 FROM public.sales_order_lines l JOIN public.sales_orders o ON o.id = l."salesOrderId"
--                    WHERE o.origin = 'historical' AND o.status IN ('draft', 'pending_approval', 'rejected')
--                      AND l."packQty" IS NOT NULL) THEN
--          RAISE EXCEPTION 'undo_0409 มีใบย้อนหลังที่ยังไม่อนุมัติซึ่งบรรทัดมีเลขแพ็ค — ห้ามถอย (อนุมัติ/ยกเลิกให้จบก่อน)';
--        END IF;
--        FOR r IN SELECT * FROM (VALUES
--          ('approve_historical_sales_order', $u$, 'packQty', l\."packQty" /\* 0409/A1 \*/$u$),
--          ('submit_historical_sales_order', $u$, 'packQty', l\."packQty" /\* 0409/S1 \*/$u$),
--          ('historical_so_write_children', $u$, \(e\.l->>'packQty'\)::numeric::integer /\* 0409/W2 \*/$u$),
--          ('historical_so_write_children', $u$, "packQty" /\* 0409/W1 \*/$u$),
--          ('historical_so_write_children', $u$\n[ \t]*-- 0409/W0 ▶.*-- 0409/W0 ◀$u$),
--          ('historical_so_check_lines', $u$COALESCE\(\(v_item->>'packQty'\)::numeric, 1\) \* /\* 0409/H2 \*/ $u$),
--          ('historical_so_check_lines', $u$\n[ \t]*-- 0409/H1 ▶.*-- 0409/H1 ◀$u$)
--        ) AS t(fn, pattern)
--        LOOP
--          SELECT p.oid INTO v_oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--           WHERE n.nspname = 'public' AND p.proname = r.fn;
--          v_def := pg_get_functiondef(v_oid);
--          SELECT count(*) INTO v_hits FROM regexp_matches(v_def, r.pattern, 'g');
--          IF v_hits <> 1 THEN RAISE EXCEPTION 'undo_0409 % hits=% (%)', r.fn, v_hits, left(r.pattern, 30); END IF;
--          EXECUTE regexp_replace(v_def, r.pattern, '');
--        END LOOP;
--      END $undo$;
--      COMMENT ON COLUMN public.sales_order_lines."packQty" IS
--        'จำนวนแพ็คต่อเดือนของบรรทัด — สำเนาจากบรรทัดใบเสนอราคาที่รับแล้ว (บรรทัดใบสั่งขายเป็น snapshot อ่านอย่างเดียว) · ออก Rev. ยกไปด้วย · NULL = คูณ 1 · ใบสั่งขายย้อนหลังเป็น NULL เสมอ (0407)';
--      COMMIT;
--      NOTIFY pgrst, 'reload schema';
--   ผล: เนื้อของสี่ฟังก์ชัน (prosrc และข้อความของ pg_get_functiondef) กลับเท่าก่อน 0409 ทุกไบต์ · คำอธิบายคอลัมน์กลับเป็นของ 0407
--       · ไม่มีแถวข้อมูลถูกแตะ (พิสูจน์บนฮาร์เนส: md5 ของสี่ตัว = md5_expected ของ SELECT ตรวจก่อนรัน) · หลังถอย: marks = 0
--   ⛔ ห้ามรัน 0374 · 0379 ซ้ำหลังไฟล์นี้ — เขียนฟังก์ชันทับ **ทั้งก้อน** จากเนื้อเก่า:
--        0379 = ตัวตรวจ + ตัวเขียนบรรทัด (แพตช์ 0394/P4–P7 และ H1 · H2 · W0 · W1 · W2 ของไฟล์นี้หาย · S1/A1 ยังอยู่)
--               · มีใบย้อนหลังที่ยังไม่อนุมัติซึ่งบรรทัดมีแพ็ค ≥ 2 = ด่านของ 0379 เอง (mig_0379_historical_lines_not_quote_shaped) หยุดไฟล์นั้นให้ (ดัง)
--               · ไม่มีใบแบบนั้น = รันผ่านเงียบ ๆ ⇒ SELECT ตรวจก่อนรันข้างบนฟ้อง: chain = 2 · marks = 2
--        0374 = ทั้งหกตัวของใบย้อนหลัง (สร้าง · แก้ · ส่ง · อนุมัติ · ตัวตรวจ · ตัวเขียน) กลับเป็นรุ่นแรกสุด ⇒ chain = 0 · marks = 0 · bodies = ffff
--      ทางกลับหลังรัน 0379 พลาด (พิสูจน์บนฮาร์เนส — ทุกฟังก์ชันกลับเท่าก่อนพลาดทุกไบต์): 0394 → ไฟล์นี้
--        (0394 ปะ P4–P7 คืน ข้ามแถวที่ยังมีป้าย · ไฟล์นี้ปะ H1 · H2 · W0 · W1 · W2 คืน ข้าม S1/A1 · ด่านใบค้างไม่ทำงานเพราะยังมีป้าย S1/A1)
--        รันไฟล์นี้ก่อน 0394 = หยุดเองด้วย mig_0409_needs_chain ไม่เขียนอะไร
--      หลังรัน 0374 พลาด **ไม่มีทางกลับแบบรันไฟล์เรียงกัน** — แจ้งผู้พัฒนา: 0382 ทั้งไฟล์รันซ้ำบนฐานปัจจุบันไม่ได้ (หยุดเองที่ตัวออก Rev. ใบสั่งขาย
--        ซึ่ง 0385 ปะต่อไปแล้ว และถอยทั้งไฟล์) · ทางที่ลองบนฮาร์เนสแล้ว (เฉพาะเนื้อฟังก์ชันหกตัว ไม่ใช่ 0374 ทั้งไฟล์): 0379 → สี่แถวใบย้อนหลังของ 0382
--        ปะด้วยคำสั่งเดียวกับไฟล์นั้น → 0394 → 0395 → ไฟล์นี้ (0394 กับไฟล์นี้ถือเป็นรันครั้งแรกอีกรอบ ⇒ ต้องไม่มีใบย้อนหลังค้าง) — ทุกฟังก์ชันกลับเท่าเดิมทุกไบต์
--      รัน 0407 ซ้ำหลังไฟล์นี้ = คำอธิบายคอลัมน์กลับเป็นข้อความของ 0407 (ข้อความอย่างเดียว ฟังก์ชันไม่เปลี่ยน · SELECT ตรวจหลังรันได้ note = f)
--        — รันไฟล์นี้ซ้ำเพื่อเขียนคืน (รอบนั้น in_flight / packed_hist ของ SELECT ตรวจหลังรันมากกว่า 0 ได้ — ข้อมูลประกอบ ไม่ใช่เกณฑ์)
--
--  ⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ — แถวที่มีป้ายแล้วถูกข้าม ("ปะไว้แล้ว") · ด่านใบย้อนหลังค้างเช็คเฉพาะรันแรก · COMMENT เขียนข้อความเดิมทับ · ตรวจท้ายรันทุกรอบ
--     (ด่าน md5 ของเนื้อเดิมบังคับเฉพาะฟังก์ชันที่รอบนั้นปะ — รอบที่ไม่ปะอะไรไม่ถูกหยุดด้วยเนื้อที่ migration หลังจากนี้แก้ต่อ)
--  ไม่มีคอลัมน์ใหม่ — check:columns ไม่แดง (ใช้ sales_order_lines."packQty" ที่ 0407 มีแล้ว) · ไม่มีตาราง/ฟังก์ชัน/สิทธิ์ใหม่
--  ⛔ ไม่แตะ: RPC สร้าง/แก้ใบย้อนหลัง · ตัวตรวจงวด/สัญญา/ใบซ้ำ · ตัวกลางเปิดรอบขายของ 0392 (ไม่อ่านจำนวนหรือเลขแพ็คของบรรทัด) ·
--     ทางก๊อปสามตัวของ 0407 · trigger ทุกตัว · CHECK · Actual (ตรวจท้ายยืนยัน: ฟังก์ชันอื่นทุกตัวใน public เท่าเดิมทั้งเนื้อและสิทธิ์)
--  ⛔ ไม่ backfill — ไม่มีคำสั่ง UPDATE/INSERT/DELETE กับแถวข้อมูลในไฟล์นี้ · บรรทัดใบย้อนหลังที่มีอยู่ (NULL) เท่าเดิมทุกแถว
--  🧪 พิสูจน์บนฮาร์เนส PGlite harness-0409 (นอก repo · mockups/so-service-lines/pglite-harness) — โหลด 0374 · 0379 + แถว 0382 จากไฟล์จริง ·
--     0389/0390 · 0392–0396 · 0400 · 0404 · 0407 ทั้งไฟล์ แล้วรันไฟล์นี้สองรอบ + รอบสามบนฐานที่มีข้อมูล · บล็อกถอยกลับข้างบนลองจริง ·
--     เส้นแก้ใบ → ส่ง → อนุมัติในนาม service_role
-- ============================================================

BEGIN;

-- ── §0 ด่านก่อนรัน + ลายนิ้วมือของที่ต้องไม่แตะ ────────────────────────────────────────────
DO $pre$
DECLARE
  v_n integer;
  v_list text;
  v_fns constant text[] := ARRAY['historical_so_check_lines', 'historical_so_write_children',
                                 'submit_historical_sales_order', 'approve_historical_sales_order'];
BEGIN
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (v_fns);
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'mig_0409_needs_functions — เจอ % จาก 4 (ไม่ครบ หรือมี overload)', v_n;
  END IF;

  -- 0407 ต้องรันแล้ว: คอลัมน์ + CHECK ช่วง + กฎเงินของบรรทัดใบสั่งขาย (ตัวเขียนที่ปะแล้วเขียนคอลัมน์นี้ · กฎเงินเป็นด่านสุดท้าย)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                  WHERE table_schema = 'public' AND table_name = 'sales_order_lines'
                    AND column_name = 'packQty' AND data_type = 'integer')
     OR (SELECT count(*) FROM pg_constraint c
          WHERE c.conrelid = 'public.sales_order_lines'::regclass AND c.contype = 'c' AND c.convalidated
            AND c.conname IN ('sales_order_lines_pack_qty_range', 'sales_order_lines_line_money_rule')) <> 2 THEN
    RAISE EXCEPTION 'mig_0409_needs_0407 — รัน 0407 ก่อน (ยังไม่มีคอลัมน์เลขแพ็ค / CHECK ช่วง / กฎเงินของ sales_order_lines)';
  END IF;

  -- เนื้อที่จะปะต้องเป็นเนื้อที่มีแพตช์เดิมครบ (แถว 0382 · 0394) — ไฟล์นี้ปะต่อจากเนื้อนั้น ไม่เขียนทับ
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND ((p.proname = 'historical_so_check_lines' AND strpos(p.prosrc, '0394/P4') > 0)
       OR (p.proname = 'historical_so_write_children' AND strpos(p.prosrc, '0394/P5') > 0 AND strpos(p.prosrc, '0394/P6') > 0
           AND strpos(p.prosrc, '0394/P7a') > 0 AND strpos(p.prosrc, '0394/P7b') > 0 AND strpos(p.prosrc, '0394/P7c') > 0)
       OR (p.proname = 'submit_historical_sales_order' AND strpos(p.prosrc, 'NOT public.is_sales_keyer_role(p_actor_role)') > 0)
       OR (p.proname = 'approve_historical_sales_order' AND strpos(p.prosrc, 'NOT public.is_sales_manager_role(p_actor_role)') > 0
           AND strpos(p.prosrc, '0394/P3') > 0));
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'mig_0409_needs_chain — ฟังก์ชันใบย้อนหลังมีแพตช์เดิม (0382 / 0394) ครบแค่ % จาก 4 ตัว · ไม่ปะ แจ้งผู้พัฒนา', v_n;
  END IF;

  -- รันครั้งแรก (ยังไม่มีป้ายของไฟล์นี้ในสี่ตัวนี้เลย): ห้ามมีใบย้อนหลังที่ยังไม่อนุมัติ — บรรทัดของมันไม่มีเลขแพ็ค
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (v_fns)
       AND p.prosrc ~ '0409/(H1|H2|W0|W1|W2|S1|A1)'
  ) THEN
    SELECT count(*) INTO v_n
      FROM public.sales_orders o
     WHERE o.origin = 'historical' AND o.status IN ('draft', 'pending_approval', 'rejected');
    IF v_n > 0 THEN
      -- บอกเลขที่ใบ (สูงสุด 10) — เจ้าของต้องตัดสินทีละใบ · ใบร่างที่โค้ดงวด PR-5 เก็บก่อนไฟล์นี้ก็มาตกที่นี่ (หัวไฟล์ "สลับลำดับ")
      SELECT string_agg(x.label, ' · ' ORDER BY x.label) INTO v_list
        FROM (SELECT o."orderNumber" || ' ' || CASE o.status WHEN 'draft' THEN 'ร่าง' WHEN 'pending_approval' THEN 'รออนุมัติ' ELSE 'ตีกลับ' END AS label
                FROM public.sales_orders o
               WHERE o.origin = 'historical' AND o.status IN ('draft', 'pending_approval', 'rejected')
               ORDER BY 1 LIMIT 10) x;
      RAISE EXCEPTION 'mig_0409_historical_in_flight — ใบย้อนหลังที่ยังไม่อนุมัติ % ใบ (%) · อนุมัติ/ยกเลิกใบเหล่านี้ให้จบก่อนรัน (เจ้าของตัดสิน) · บันทึกใบร่างซ้ำไม่ทำให้ผ่าน',
        v_n, v_list || CASE WHEN v_n > 10 THEN ' …' ELSE '' END;
    END IF;
  END IF;

  -- ฟังก์ชันอื่นทุกตัวใน public: เนื้อ · volatility · SECURITY · search_path · สิทธิ์ — ค่าเดียว · ตรวจท้ายเทียบ (ตายตอน COMMIT/ROLLBACK)
  PERFORM set_config('mig_0409.others', (
    SELECT md5(COALESCE(string_agg(
             p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.provolatile::text || '|' || p.prosecdef::text
               || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, ''),
             E'\n' ORDER BY p.oid::regprocedure::text), ''))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT (p.proname = ANY (v_fns))
  ), true);

  -- สี่ตัวที่จะปะ: ทุกอย่างยกเว้นเนื้อ (ลายเซ็น · ชนิดที่คืน · ภาษา · เจ้าของ · volatility · SECURITY · search_path · สิทธิ์)
  PERFORM set_config('mig_0409.meta', (
    SELECT jsonb_object_agg(p.proname, md5(
             p.oid::regprocedure::text || '|' || p.prorettype::regtype::text || '|' || p.prolang::text || '|' || p.proowner::text
               || '|' || p.provolatile::text || '|' || p.prosecdef::text || '|' || p.proretset::text
               || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, '')))::text
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = ANY (v_fns)
  ), true);

  -- ฟังก์ชันที่รอบนี้ต้องปะ (ยังมีป้ายของไฟล์นี้ไม่ครบ) — ตรวจท้ายบังคับว่าเนื้อเดิมของตัวพวกนี้คือเนื้อที่พิสูจน์บนฮาร์เนส (mig_0409_verify body)
  PERFORM set_config('mig_0409.todo', (
    SELECT COALESCE(string_agg(DISTINCT m.fn, ',' ORDER BY m.fn), '')
      FROM (VALUES ('historical_so_check_lines', '0409/H1'), ('historical_so_check_lines', '0409/H2'),
                   ('historical_so_write_children', '0409/W0'), ('historical_so_write_children', '0409/W1'),
                   ('historical_so_write_children', '0409/W2'), ('submit_historical_sales_order', '0409/S1'),
                   ('approve_historical_sales_order', '0409/A1')) AS m(fn, marker)
      JOIN pg_proc p ON p.proname = m.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
     WHERE strpos(p.prosrc, m.marker) = 0
  ), true);
END
$pre$;

-- ── §1 ปะฟังก์ชันที่รันอยู่จริงสี่ตัว (ตัวตรวจ → ตัวเขียน → ขั้นส่ง → ขั้นอนุมัติ) ──────────────────────────────
-- ⚠️ ชื่อฟังก์ชันเขียนเป็นสตริงใน VALUES เท่านั้น (ดูหัวไฟล์) · anchor เป็น regex (ARE) ครั้งเดียวพอดีทั้งสองที่
-- ⚠️ ทุกแถว "เติม" (\1 / \2 คือข้อความเดิม) — ไม่มีอะไรถูกลบ ⇒ ถอดด้วย regex ของหัวไฟล์แล้วได้เนื้อเดิมทุกไบต์
-- ⚠️ แถวของฟังก์ชันเดียวกันอ่านนิยามใหม่ทุกแถว (แถวก่อนหน้า EXECUTE ไปแล้วในทรานแซกชันเดียวกัน)
-- ⚠️ ป้ายของแถวหนึ่งห้ามโผล่ในข้อความของแถวอื่น — ไม่งั้นวงเห็น "ปะไว้แล้ว" แล้วข้ามเงียบ ๆ
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
      ('historical_so_check_lines',
        $re$(-- สูตรเงินของใบเสนอราคา \(quoteLineNet\))$re$,
        $rp$-- 0409/H1 ▶ แพ็ค/เดือน (คีย์ packQty · ตัวคูณเงินของบรรทัด): มีค่า = ตัวเลขจำนวนเต็ม 1–9999 · ไม่มีคีย์ หรือเป็น null = คูณ 1
    --   (ขั้นส่ง/อนุมัติประกอบแถวที่เก็บแล้วเป็น jsonb ใหม่ — แถวที่คอลัมน์ว่างมาเป็น null · ตัวเขียนบังคับทุกบรรทัดตอนบันทึก)
    IF v_item ? 'packQty' AND jsonb_typeof(v_item->'packQty') <> 'null' AND (
         CASE WHEN jsonb_typeof(v_item->'packQty') = 'number'
              THEN (v_item->>'packQty')::numeric NOT BETWEEN 1 AND 9999
                   OR (v_item->>'packQty')::numeric <> trunc((v_item->>'packQty')::numeric)
              ELSE true END) THEN
      RAISE EXCEPTION 'historical_so_line_pack_qty_invalid';
    END IF;
    -- 0409/H1 ◀
    \1$rp$,
        '0409/H1'),
      ('historical_so_check_lines',
        $re$(v_line_gross := round\()(v_qty \* v_unit_price, 2\);)$re$,
        $rp$\1COALESCE((v_item->>'packQty')::numeric, 1) * /* 0409/H2 */ \2$rp$,
        '0409/H2'),
      ('historical_so_write_children',
        $re$(DELETE FROM public\.sales_order_installments WHERE "salesOrderId" = p_order_id;)$re$,
        $rp$-- 0409/W0 ▶ ทุกบรรทัดต้องพกแพ็ค/เดือน (คีย์ packQty) เป็นตัวเลขจำนวนเต็ม 1–9999 — ฟอร์มรุ่นก่อนไม่พก = ตีกลับก่อนลบของเดิม
  --   (ตัวตรวจบรรทัดยอมบรรทัดที่ไม่มีคีย์เป็นคูณ 1 เพื่อแถวที่เก็บแล้ว — ไม่มีด่านนี้ ฟอร์มรุ่นก่อนเขียนทับใบที่มีแพ็คด้วยยอดคูณ 1 ได้เงียบ ๆ)
  IF EXISTS (
    SELECT 1
      FROM (SELECT CASE WHEN jsonb_typeof(e.l->'packQty') = 'number'
                        THEN (e.l->>'packQty')::numeric END AS v
              FROM jsonb_array_elements(p_lines) AS e(l)) x
     WHERE x.v IS NULL OR x.v <> trunc(x.v) OR x.v < 1 OR x.v > 9999
  ) THEN
    RAISE EXCEPTION 'historical_so_line_pack_qty_invalid';
  END IF;
  -- 0409/W0 ◀
  \1$rp$,
        '0409/W0'),
      ('historical_so_write_children',
        $re$("serviceRounds",\s*"sortOrder",\s*metadata)(\s*\)\s*SELECT\s+'SOL-' \|\| md5\(p_order_id \|\| ':' \|\| e\.ord\),)$re$,
        $rp$\1, "packQty" /* 0409/W1 */\2$rp$,
        '0409/W1'),
      ('historical_so_write_children',
        $re$(\(e\.ord - 1\)::integer,\s*'\{\}'::jsonb)(\s*FROM jsonb_array_elements\(p_lines\) WITH ORDINALITY AS e\(l, ord\)\s*JOIN public\.products p)$re$,
        $rp$\1, (e.l->>'packQty')::numeric::integer /* 0409/W2 */\2$rp$,
        '0409/W2'),
      ('submit_historical_sales_order',
        $re$('unitPrice', l\."unitPrice", 'lineTotal', l\."lineTotal", 'serviceRounds', l\."serviceRounds")(\s*\) ORDER BY l\."sortOrder"\))$re$,
        $rp$\1, 'packQty', l."packQty" /* 0409/S1 */\2$rp$,
        '0409/S1'),
      ('approve_historical_sales_order',
        $re$('unitPrice', l\."unitPrice", 'lineTotal', l\."lineTotal", 'serviceRounds', l\."serviceRounds")(\s*\) ORDER BY l\."sortOrder"\))$re$,
        $rp$\1, 'packQty', l."packQty" /* 0409/A1 */\2$rp$,
        '0409/A1')
    ) AS t(fn, anchor, replacement, marker)
  LOOP
    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'mig_0409_patch_overload % count=% — ไม่ปะ แจ้งผู้พัฒนา', r.fn, v_n;
    END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;

    IF strpos(v_src, r.marker) > 0 THEN
      RAISE NOTICE '0409: % % — ปะไว้แล้ว', r.marker, r.fn;
      CONTINUE;
    END IF;

    v_def := pg_get_functiondef(v_oid);
    SELECT count(*) INTO v_hits_src FROM regexp_matches(v_src, r.anchor, 'g');
    SELECT count(*) INTO v_hits_def FROM regexp_matches(v_def, r.anchor, 'g');
    IF v_hits_src <> 1 OR v_hits_def <> 1 THEN
      RAISE EXCEPTION 'mig_0409_patch_anchor % % hits=%/% — เนื้อฟังก์ชันบนฐานไม่ใช่เนื้อที่ไฟล์นี้รู้จัก · ไม่ปะ แจ้งผู้พัฒนา', r.marker, r.fn, v_hits_src, v_hits_def;
    END IF;

    EXECUTE regexp_replace(v_def, r.anchor, r.replacement);
    RAISE NOTICE '0409: % % — ปะแล้ว', r.marker, r.fn;
  END LOOP;
END
$patch$;

-- ── §2 คำอธิบายคอลัมน์ — ข้อความของ 0407 บอกว่าใบสั่งขายย้อนหลังเป็น NULL เสมอ (0407 ถูกตรึง sha ห้ามแก้ไฟล์นั้น) ──────────
COMMENT ON COLUMN public.sales_order_lines."packQty" IS
  'จำนวนแพ็คต่อเดือนของบรรทัด — ใบจากใบเสนอราคา: สำเนาจากบรรทัดใบเสนอราคาที่รับแล้ว (บรรทัดใบสั่งขายเป็น snapshot อ่านอย่างเดียว) · ออก Rev. ยกไปด้วย · ใบสั่งขายย้อนหลัง: เลขที่คีย์ในฟอร์ม ตัวเขียนบรรทัดบังคับทุกบรรทัด (จำนวนเต็ม 1–9999) ตั้งแต่ 0409 — บรรทัดที่บันทึกก่อนนั้นเป็น NULL · NULL = คูณ 1 (0407 · 0409)';

-- ── §3 ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย ─────────────────────────────────────────────
DO $verify$
DECLARE
  r record;
  v_n integer;
  v_src text;
  v_fn text;
  v_fns constant text[] := ARRAY['historical_so_check_lines', 'historical_so_write_children',
                                 'submit_historical_sales_order', 'approve_historical_sales_order'];
  v_others text := current_setting('mig_0409.others', true);
  v_meta jsonb := current_setting('mig_0409.meta', true)::jsonb;
  v_todo text := current_setting('mig_0409.todo', true);
  v_bad text := '';
BEGIN
  -- ฟังก์ชันอื่นทุกตัวใน public เท่าต้นไฟล์ (เนื้อ · volatility · SECURITY · search_path · สิทธิ์) · ไม่มีตัวเกิดใหม่/หาย
  IF v_others IS NULL OR v_others IS DISTINCT FROM (
    SELECT md5(COALESCE(string_agg(
             p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.provolatile::text || '|' || p.prosecdef::text
               || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, ''),
             E'\n' ORDER BY p.oid::regprocedure::text), ''))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT (p.proname = ANY (v_fns))) THEN
    RAISE EXCEPTION 'mig_0409_verify others — ฟังก์ชันอื่นใน public ถูกแตะระหว่างไฟล์นี้';
  END IF;

  -- สี่ตัวที่ปะ: ทุกอย่างยกเว้นเนื้อเท่าต้นไฟล์ (ลายเซ็น · เจ้าของ · volatility · SECURITY · search_path · สิทธิ์)
  IF v_meta IS NULL OR (SELECT count(*) FROM jsonb_object_keys(v_meta)) <> 4 THEN
    RAISE EXCEPTION 'mig_0409_verify meta — ลายนิ้วมือต้นไฟล์ของสี่ฟังก์ชันไม่ครบ';
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
  IF v_n > 0 THEN RAISE EXCEPTION 'mig_0409_verify meta changed=% — สิทธิ์/SECURITY/search_path ของฟังก์ชันที่ปะเปลี่ยน', v_n; END IF;

  -- ป้ายของไฟล์นี้ + รูปสุดท้ายของแต่ละจุดปะ + แพตช์เดิมยังอยู่ครบ — แต่ละข้อความต้องเจอตามจำนวนพอดี
  FOR r IN
    SELECT * FROM (VALUES
      ('historical_so_check_lines', '-- 0409/H1 ▶', 1), ('historical_so_check_lines', '-- 0409/H1 ◀', 1),
      ('historical_so_check_lines', '/* 0409/H2 */', 1),
      ('historical_so_check_lines', $n$v_line_gross := round(COALESCE((v_item->>'packQty')::numeric, 1) * /* 0409/H2 */ v_qty * v_unit_price, 2);$n$, 1),
      ('historical_so_check_lines', $n$IF v_item ? 'packQty' AND jsonb_typeof(v_item->'packQty') <> 'null' AND ($n$, 1),
      ('historical_so_check_lines', $n$RAISE EXCEPTION 'historical_so_line_pack_qty_invalid';$n$, 1),
      ('historical_so_check_lines', 'packQty', 8),
      ('historical_so_check_lines', '-- 0394/P4 ▶', 1),
      ('historical_so_write_children', '-- 0409/W0 ▶', 1), ('historical_so_write_children', '-- 0409/W0 ◀', 1),
      ('historical_so_write_children', '/* 0409/W1 */', 1), ('historical_so_write_children', '/* 0409/W2 */', 1),
      ('historical_so_write_children', 'metadata, "packQty" /* 0409/W1 */', 1),
      ('historical_so_write_children', $n$'{}'::jsonb, (e.l->>'packQty')::numeric::integer /* 0409/W2 */$n$, 1),
      ('historical_so_write_children', $n$RAISE EXCEPTION 'historical_so_line_pack_qty_invalid';$n$, 1),
      ('historical_so_write_children', 'packQty', 5),
      ('historical_so_write_children', 'DELETE FROM public.sales_order_installments WHERE "salesOrderId" = p_order_id;', 1),
      ('historical_so_write_children', '-- 0394/P5 ▶', 1), ('historical_so_write_children', '-- 0394/P6 ▶', 1),
      ('historical_so_write_children', '-- 0394/P7c ▶', 1), ('historical_so_write_children', '0394/P7a', 1),
      ('historical_so_write_children', '0394/P7b', 1),
      ('submit_historical_sales_order', '/* 0409/S1 */', 1),
      ('submit_historical_sales_order', $n$l."serviceRounds", 'packQty', l."packQty" /* 0409/S1 */$n$, 1),
      ('submit_historical_sales_order', 'packQty', 2),
      ('submit_historical_sales_order', 'NOT public.is_sales_keyer_role(p_actor_role)', 1),
      ('approve_historical_sales_order', '/* 0409/A1 */', 1),
      ('approve_historical_sales_order', $n$l."serviceRounds", 'packQty', l."packQty" /* 0409/A1 */$n$, 1),
      ('approve_historical_sales_order', 'packQty', 2),
      ('approve_historical_sales_order', 'NOT public.is_sales_manager_role(p_actor_role)', 1),
      ('approve_historical_sales_order', '-- 0394/P3 ▶', 1)
    ) AS t(fn, needle, expected)
  LOOP
    SELECT p.prosrc INTO v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = r.fn;
    v_n := (length(v_src) - length(replace(v_src, r.needle, ''))) / length(r.needle);
    IF v_n IS DISTINCT FROM r.expected THEN
      RAISE EXCEPTION 'mig_0409_verify marker % in % = % (คาด %)', r.needle, r.fn, v_n, r.expected;
    END IF;
  END LOOP;

  -- ลำดับ: ด่านเข้มของตัวเขียนมาก่อน DELETE (ตีกลับแล้วของเดิมอยู่ครบ) · ช่วงของตัวตรวจมาก่อนสูตรเงิน
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'historical_so_write_children';
  IF NOT (strpos(v_src, '-- 0409/W0 ◀') > 0
          AND strpos(v_src, '-- 0409/W0 ◀') < strpos(v_src, 'DELETE FROM public.sales_order_installments WHERE "salesOrderId" = p_order_id;')
          AND strpos(v_src, 'DELETE FROM public.sales_order_installments WHERE "salesOrderId" = p_order_id;') < strpos(v_src, '/* 0409/W1 */')) THEN
    RAISE EXCEPTION 'mig_0409_verify order — ด่านเลขแพ็คของตัวเขียนต้องมาก่อน DELETE';
  END IF;
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'historical_so_check_lines';
  IF NOT (strpos(v_src, '-- 0409/H1 ◀') > 0 AND strpos(v_src, '-- 0409/H1 ◀') < strpos(v_src, '/* 0409/H2 */')) THEN
    RAISE EXCEPTION 'mig_0409_verify order — ช่วงของเลขแพ็คในตัวตรวจต้องมาก่อนสูตรเงิน';
  END IF;

  -- สิทธิ์คงเดิม: anon/authenticated ไม่มีทุกตัว · service_role เรียก RPC ส่ง/อนุมัติได้ แต่ตัวช่วยสองตัวไม่ได้
  -- (0374/0379 ถอนไว้ — ผู้เรียกคือ RPC แบบ SECURITY DEFINER)
  FOR r IN
    SELECT * FROM (VALUES
      ('public.historical_so_check_lines(jsonb,text)', false),
      ('public.historical_so_write_children(text,jsonb,jsonb,numeric,text,text)', false),
      ('public.submit_historical_sales_order(text,timestamptz,text,text,text,jsonb)', true),
      ('public.approve_historical_sales_order(text,timestamptz,text,text,text,text,text,uuid,text,text,integer)', true)
    ) AS t(sig, service_role)
  LOOP
    v_fn := r.sig;
    IF has_function_privilege('anon', v_fn, 'EXECUTE')
       OR has_function_privilege('authenticated', v_fn, 'EXECUTE')
       OR has_function_privilege('service_role', v_fn, 'EXECUTE') IS DISTINCT FROM r.service_role THEN
      RAISE EXCEPTION 'mig_0409_verify grant % — สิทธิ์ของฟังก์ชันไม่ใช่แบบที่ 0374/0379 ตั้งไว้', v_fn;
    END IF;
  END LOOP;

  -- คำอธิบายคอลัมน์เป็นของไฟล์นี้
  SELECT count(*) INTO v_n
    FROM pg_attribute a
   WHERE a.attrelid = 'public.sales_order_lines'::regclass AND a.attname = 'packQty'
     AND strpos(COALESCE(col_description(a.attrelid, a.attnum), ''), '0409') > 0;
  IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0409_verify comment — คำอธิบายคอลัมน์เลขแพ็คยังไม่ใช่ของ 0409'; END IF;

  -- เนื้อของสี่ตัวหลังถอดส่วนที่ไฟล์นี้เติม = เนื้อที่ไฟล์นี้ปะลงไป (หัวไฟล์: md5_live = md5_expected) — พิมพ์ทุกตัว ·
  -- ตัวที่รอบนี้ปะ (mig_0409.todo ของ $pre$) ต้องตรงกับค่าที่ฮาร์เนสพิสูจน์ทุกไบต์ ไม่งั้นทั้งไฟล์ถอย: anchor เจอครบไม่ได้แปลว่าเนื้อที่เหลือ
  -- คือเนื้อที่พิสูจน์ไว้ (มีคนแก้ฟังก์ชันนั้นนอกจุดปะ / migration อื่นรันคั่นหลัง SELECT ตรวจก่อนรัน) · ตัวที่ปะไว้แล้วจากรอบก่อนไม่บังคับ (รันซ้ำได้)
  IF v_todo IS NULL THEN
    RAISE EXCEPTION 'mig_0409_verify body — ไม่มีรายการฟังก์ชันที่รอบนี้ปะจากต้นไฟล์';
  END IF;
  FOR r IN
    SELECT e.fn, e.h AS expected,
           md5(regexp_replace(regexp_replace(p.prosrc,
             $u$\n[ \t]*-- 0409/(H1|W0) ▶.*-- 0409/(H1|W0) ◀$u$, ''),
             $u$COALESCE\(\(v_item->>'packQty'\)::numeric, 1\) \* /\* 0409/H2 \*/ |, ("packQty"|\(e\.l->>'packQty'\)::numeric::integer|'packQty', l\."packQty") /\* 0409/(W1|W2|S1|A1) \*/$u$,
             '', 'g')) AS h
      FROM (VALUES
        ('historical_so_check_lines', 'b86894c10dbecca2fcf496d4610c78e8'),
        ('historical_so_write_children', 'b4c70bf11bf3d271e8338db65764a8b1'),
        ('submit_historical_sales_order', '200d31946e8bad9bfd9ac11b5cb61359'),
        ('approve_historical_sales_order', 'aaf8001cfa106c20e5660376456ec7b2')
      ) AS e(fn, h)
      JOIN pg_proc p ON p.proname = e.fn JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
     ORDER BY e.fn
  LOOP
    RAISE NOTICE '0409: เนื้อเดิมของ % = %', r.fn, r.h;
    IF r.fn = ANY (string_to_array(v_todo, ',')) AND r.h IS DISTINCT FROM r.expected THEN
      v_bad := v_bad || ' ' || r.fn || '=' || r.h || ' (คาด ' || r.expected || ')';
    END IF;
  END LOOP;
  IF v_bad <> '' THEN
    RAISE EXCEPTION 'mig_0409_verify body% — เนื้อฟังก์ชันบนฐานไม่ใช่เนื้อที่พิสูจน์ไว้ (ถูกแก้นอกจุดปะ) · ไม่ปะ แจ้งผู้พัฒนา', v_bad;
  END IF;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
