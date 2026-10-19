-- ============================================================
--  Migration 0410: ใบเสนอราคา — ยามในฐานของ "แพ็ค/เดือน" (งวด PR-G ของช่องแพ็ค/เดือน · ปิดประตูทางเดียวที่ต้นทาง)
--                  ฐานไม่รับ **การบันทึก / การออก Rev. ครั้งเดียว** ที่ทำเลขแพ็คของบรรทัดหมวด 02-001 **หาย** ไม่ว่าคำขอมาจากโค้ดรุ่นไหน
--                  (ทางที่ยามมองไม่เห็น เช่น ลบในการบันทึกหนึ่งแล้วเพิ่มกลับในการบันทึกถัดไป: หัวข้อ "ไม่ได้กัน" ข้างล่าง)
--                  (docs/qt-pack-column.md หัวข้อ "ประตูทางเดียว" + ตาราง "งวดถัดไป" แถว PR-G · ผลแผนที่ mockups/qt-pack-column/prg-map.json
--                   · มติผู้นำงาน G1–G11 · มติเจ้าของ A4: ใบเก่าที่ไม่เคยมีเลขแพ็คต้องไม่ถูกกั้น)
--
--  🐞 ของเดิม — ไม่มีอะไรในฐานกันการเขียนที่ "เลขแพ็คหาย":
--     · โค้ดรุ่นก่อนงวด PR-1 (ก่อน aec7c58c — dev server ของ worktree เก่า · production ที่ถูกถอย · preview ของแบรนช์เก่า) บันทึกใบแพ็ค
--       = save_quotation_content ลบบรรทัดเดิมแล้วแทรกบรรทัดที่ไม่มี "packQty" กับยอด จำนวน × ราคา ⇒ แถว NULL / 42,000 ที่ CHECK ของ 0407 รับ
--       (แพ็ค 2 × 12 × 3,500 = 84,000 หดเหลือ 42,000 เงียบ ๆ · แพ็ค 1 ยอดไม่เปลี่ยนเลย มีแต่เลขที่หาย)
--     · ออก Rev. จากรุ่นนั้น = INSERT บรรทัดของฉบับใหม่ตรง ๆ ทาง PostgREST (revise/route.js) แบบเดียวกัน — ฉบับต้นทางกลายเป็น "มีฉบับแก้ไขใหม่" ถาวร
--     · การแก้ฐานตรง (SQL Editor · Table Editor) ที่ตั้ง "packQty" เป็น NULL
--     ตัวจับ ⑥–⑧ ของ scripts/check-line-pack-parity.mjs เห็น **หลัง** เกิดเท่านั้น
--  ⭐ ของใหม่ — trigger แถวสามตัวบน public.quotation_lines (ไม่แตะเนื้อของ save_quotation_content แม้ตัวอักษรเดียว — มติ G1):
--     T1 BEFORE DELETE  … WHEN (OLD."packQty" IS NOT NULL)  — จด "quotationId" ของบรรทัดที่มีเลขแพ็คซึ่งถูกลบ ลงตัวแปรของทรานแซกชัน
--        (set_config(…, true) · ว่าง = '') · **ไม่โยน error เด็ดขาด** ⇒ ลบดีล · บังคับลบใบ · cascade · ทางถอยของ Rev./สร้างใบ ทำงานเท่าเดิม (G2)
--     T2 BEFORE INSERT  … WHEN (NEW."packQty" IS NULL)       — บรรทัดหมวด 02-001 (กฎเดียวกับ lineCategoryCode(line, null) ฝั่ง JS
--        บนคอลัมน์ของแถวเอง · ไม่ join products) ที่ไม่มีเลขแพ็ค = ปฏิเสธ เมื่อ
--          (ก) ใบนั้นเพิ่งถูกลบบรรทัดที่มีเลขแพ็คในทรานแซกชันเดียวกัน (= save_quotation_content กำลังเขียนทับใบที่มีเลขแพ็ค) หรือ
--          (ข) ฉบับต้นทาง ("revisedFromId") ของใบนั้นถือบรรทัดที่มีเลขแพ็คของ **สินค้าเดียวกัน** (= ออก Rev. / บันทึกร่าง Rev. ทิ้งเลข) (G3)
--              สินค้าเดียวกัน = "productId" เดียวกัน (ไม่ว่าง) หรือ "fgCode" เดียวกัน (ไม่ว่าง) · บรรทัดพิมพ์เอง (ไม่มีทั้งคู่) = บรรทัดที่มีเลขแพ็คบรรทัดใดก็ได้
--              — แคบกว่าตัวจับ ⑥ (ทั้งใบ) โดยตั้งใจ: Rev. ที่สินค้าของบรรทัดอื่นถูกย้ายเข้าหมวด 02-001 ในทะเบียน หรือเพิ่มสินค้า 02-001 ตัวใหม่
--                ไม่ได้ทำเลขของใครหาย (จอบอกคนขายให้กรอกเลขแพ็คในร่าง Rev. ก่อนยื่น — quotations/[id]/page.js:276 · :1311) ⇒ ไม่ปฏิเสธ (มติ G8 "ห้ามหาย" เท่านั้น)
--     T3 BEFORE UPDATE OF "packQty" … WHEN (OLD."packQty" IS NOT NULL AND NEW."packQty" IS NULL) — ปฏิเสธ (G4)
--     · T2 / T3 ยอมเมื่อทรานแซกชันตั้ง SET LOCAL app.quotation_pack_unlock = 'on' — ตั้งได้จากเซสชัน SQL ตรงทุกทาง (SQL Editor · psql · ไคลเอนต์ Postgres อื่น)
--       ที่ตั้งไม่ได้คือ PostgREST / โค้ดแอปทุกรุ่น (ไม่มีทางตั้งค่าของเซสชันต่อคำขอ) — หัวข้อ "ทางออก" ข้างล่าง · G5
--     · ปฏิเสธด้วย SQLSTATE P0001 (ไม่ใช่ 23514) ข้อความไทยบอกว่าอะไรถูกปฏิเสธและต้องทำอะไร — route ทุกรุ่นโชว์ error.message ตรง ๆ
--       (lineMoneyRuleMessage จับเฉพาะ 23514 + ชื่อ CHECK ของ 0407 — ข้อความนี้ไม่มีชื่อพวกนั้น) · รหัสเครื่องอยู่ท้าย MESSAGE ในวงเล็บเหลี่ยม
--       และเป็นคำแรกของ DETAIL: quotation_line_pack_lost (T2) · quotation_line_pack_cleared (T3) (G6)
--     · ฟังก์ชันของ trigger ถอนสิทธิ์ EXECUTE จาก **ทุก role** (PUBLIC · anon · authenticated · service_role) — trigger ยิงได้โดยไม่ต้องมีสิทธิ์นั้น ·
--       ตรรกะหมวดเขียนในเนื้อฟังก์ชัน ไม่เรียกตัวช่วย (probe ของ critic: ตัวช่วยที่ถอนสิทธิ์ = INSERT ทุกแถวพังด้วย 42501) (G7)
--     · กติกา "ห้ามหาย" เท่านั้น ไม่ใช่ "บรรทัดหมวด 02-001 ทุกบรรทัดต้องมีเลขแพ็ค" (นั่นคือด่าน JS ของเซิร์ฟเวอร์) ⇒ รุ่นของงวด PR-2 ยังเป็นทางฉุกเฉิน
--       ที่ใช้ได้กับใบที่ไม่เคยมีเลขแพ็ค (G8)
--
--  ── ตารางความจริง (พิสูจน์บนฮาร์เนส PGlite harness-0410 ทุกแถว) ──────────────────────────────────────────────
--   ปฏิเสธ (P0001 · ไม่มีอะไรถูกบันทึก):
--     · รุ่นก่อน PR-1 บันทึกใบที่มีเลขแพ็ค (แพ็ค 2 ยอดหด · แพ็ค 1 ยอดเท่าเดิม) — error ออกมาจากการเรียก RPC เอง ไม่ใช่ตอน COMMIT
--     · ออก Rev. / บันทึกร่าง Rev. ที่บรรทัดหมวด 02-001 ไม่มีเลขแพ็ค ทั้งที่ฉบับต้นทางมีเลขแพ็คของสินค้าเดียวกัน (INSERT หลายแถวของ PostgREST
--       ถอยทั้งคำสั่ง · route ลบหัวใบ Rev. ที่เพิ่งสร้าง ฉบับต้นทางไม่ถูกเปลี่ยนสถานะ)
--     · UPDATE ที่ล้าง "packQty" ของบรรทัดที่มีเลขแพ็ค (ทุกหมวด)
--     · ลบแล้วแทรกในทรานแซกชันเดียวกันด้วยมือ (SQL Editor) โดยไม่ตั้งทางออก
--   ผ่าน (เท่าเดิมทุกอย่าง — โค้ดรุ่นปัจจุบัน (งวด PR-3 ขึ้นไป) ไม่ชนยามในการใช้งานปกติ):
--     · การลบทุกชนิด (บรรทัด · ใบ · ดีล · บังคับลบ · cascade · ทางถอยของ Rev./สร้างใบ) · ใบใหม่ (สร้างจากดีล · สายสหมิตร — ไม่มี revisedFromId ไม่มีอะไรถูกลบ)
--     · บันทึก/ออก Rev. ของใบที่ไม่เคยมีเลขแพ็ค (มติ A4 · รุ่นของงวด PR-2) · บันทึกที่ไม่ส่งบรรทัด (p_lines NULL) · ส่งบรรทัดเดิมกลับพร้อมเลขแพ็ค
--     · ออก Rev. หลังรหัสสินค้าของบรรทัด **อื่น** ถูกย้ายเข้าหมวด 02-001 ในทะเบียน (revise/route.js:81 ซิงก์รหัส FG ใหม่ — quoteLines.js:419 · :102 ไม่บังคับเลขแพ็คตอนออก Rev.)
--       · Rev. ที่เพิ่มสินค้าหมวด 02-001 ตัวใหม่โดยยังไม่มีเลขแพ็ค — ไม่มีเลขของใครหาย (คนขายกรอกในร่าง Rev. ก่อนยื่น)
--     · บรรทัดหมวดอื่น · เปลี่ยนบรรทัดออกจากหมวด 02-001 · ล้างบรรทัดทั้งใบ (p_lines []) · UPDATE คอลัมน์อื่น (รหัส FG / สินค้า / หน่วย)
--     · ตัวแปรที่ T1 จดตายพร้อมทรานแซกชัน — ไม่ข้ามไปทรานแซกชันถัดไป และไม่ข้ามไปใบอื่น
--   ไม่ได้กัน (นอกขอบเขตของยามบรรทัด — ตัวจับ ⑥–⑧ ของ scripts/check-line-pack-parity.mjs ยังต้องรันตามรอบ และหลังแก้ quotation_lines ด้วยมือทุกครั้ง):
--     · ข้ามทรานแซกชัน: การบันทึกหนึ่งเอาบรรทัดที่มีเลขแพ็คออก แล้วการบันทึกถัดไปเพิ่มสินค้านั้นกลับโดยไม่มีเลขแพ็ค — ผ่านทั้งสองครั้ง (ตัวจดของ T1
--       ตายพร้อมทรานแซกชัน) · ทำได้จากรุ่นก่อน PR-1 และรุ่นของงวด PR-2 · ข้อความ rewrite จึงบอกว่า "อย่าลบแล้วเพิ่มใหม่" · แถวตรวจนับไม่เห็น
--       (ใบไม่ mixed) · ตัวจับ ⑧ (audit_logs) ก็ **ไม่** นับเป็นเลขแพ็คหาย (หัวข้อ ⑧ ต่าง 0 · ไม่ทำให้สคริปต์แดง): การบันทึกแรกขึ้นแค่เป็นข้อมูลในบรรทัดสรุป
--       "บรรทัดที่มีเลขแพ็คถูกลบ/ย้ายหมวดด้วยการทำงานปกติ n บรรทัด" (removed ของ packLossInAudit — เลขใบ · "ลบบรรทัด / เปลี่ยนสินค้าหรือหมวด" · ลำดับรายการ
--       · ตัวอย่างสูงสุด 5 การบันทึก ปนกับการลบตามปกติ) · การบันทึกที่สองไม่ขึ้นเลย (ก่อนบันทึกใบไม่มีเลขแพ็คแล้ว) ⇒ จะรู้ก็ต่อเมื่อมีคนอ่านบรรทัดข้อมูลนั้น
--       แล้วไล่ audit_logs.before เอง · ลบทั้งใบแล้วสร้างใหม่รหัสเดิมในทรานแซกชันถัดไปก็เช่นกัน (การลบขึ้นในบรรทัดข้อมูลเดียวกันเป็น "ลบใบ")
--     · ลำดับในทรานแซกชันเดียว: INSERT บรรทัดที่ไม่มีเลขแพ็คก่อน แล้วค่อย DELETE บรรทัดที่มีเลขแพ็ค (รวมการยิงเป็นสองคำขอ) · writable CTE ที่ INSERT
--       ไม่อ่านผลของ DELETE · MERGE ที่มีทั้ง DELETE และ INSERT (ผลขึ้นกับแผนของ planner)
--     · UPDATE ที่ทำให้บรรทัดกลายเป็นหมวด 02-001 ที่ไม่มีเลขแพ็ค ("fgCode" · metadata.categoryCode · "quotationId") — T2 ดูเฉพาะ INSERT
--     · ตั้ง "revisedFromId" หลังแทรกบรรทัดของ Rev. แล้ว · ลบบรรทัดที่มีเลขแพ็คของฉบับต้นทางก่อนแทรกบรรทัดของ Rev. ในทรานแซกชันเดียวกัน
--     · บรรทัดที่มีเลขแพ็คแต่ "fgCode" ของตัวเองไม่ใช่หมวด 02-001 (เช่น datafix ย้ายรหัส) — ยามดูเฉพาะบรรทัดหมวด 02-001
--     · INSERT บรรทัดหมวด 02-001 ไม่มีเลขแพ็คลงใบที่มีเลขแพ็คซึ่งไม่ใช่ Rev. (Table Editor / API) — ไม่มีเลขเดิมหาย แต่ใบกลายเป็น mixed ในแถวตรวจ
--     · Rev. ที่เปลี่ยนสินค้าหมวด 02-001 ที่มีเลขแพ็คเป็นสินค้าหมวด 02-001 ตัวอื่นที่ไม่มีเลขแพ็ค (ยามเทียบสินค้าเดียวกัน — ตัวจับ ⑥ เห็น)
--     · ยอดหัวใบ: รุ่นก่อน PR-1 แก้แค่ VAT ด้วยคำขอที่ประกอบเอง ส่งบรรทัดเดิมกลับ (เลขแพ็คอยู่ครบ) แต่คิดยอดหัวใบแบบไม่คูณแพ็ค
--     · TRUNCATE · session_replication_role = replica · ALTER TABLE … DISABLE TRIGGER · การกู้ backup แบบ physical ของ dashboard (ไม่ยิง trigger)
--     · role ที่ไม่มี BYPASSRLS อ่านใบต้นทางไม่เห็น (ฟังก์ชันเป็น SECURITY INVOKER) — วันนี้ผู้เขียนตารางนี้มีแค่ service_role / postgres
--     ไม่มีโค้ดแอปรุ่นไหนเขียนตารางนี้ในรูปลำดับ / CTE / MERGE / UPDATE / revisedFromId-ทีหลัง: ทุกทางของแอปคือ save_quotation_content (DELETE → INSERT) ·
--     INSERT บรรทัดของ Rev. หลัง INSERT หัวใบที่มี revisedFromId แล้ว · createQuotationDraft ลงใบใหม่ · DELETE ของทางถอยของ Rev.
--     (git grep "from('quotation_lines')" ที่ HEAD · aec7c58c^ · 311baf42 — นอกนั้นอ่านอย่างเดียว)
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────────────────────
--   §0 SET LOCAL lock_timeout = '5s' (รอล็อกเกิน 5 วินาที = ERROR 55P03 ทั้งไฟล์ถอย — ไม่ให้คิวทั้งระบบต่อแถวหลังไฟล์นี้ · หัวข้อ "ลำดับ deploy")
--      · ด่านก่อนรัน + ลายนิ้วมือของที่ต้องไม่แตะ (ฟังก์ชันอื่นทุกตัวใน public · trigger อื่นทุกตัว · คอลัมน์และ CHECK ของ quotation_lines)
--   §1 ฟังก์ชันของ trigger สามตัว (CREATE OR REPLACE · ภาษา plpgsql · SECURITY INVOKER · search_path = public) + ถอนสิทธิ์ทุก role
--   §2 trigger สามตัว (DROP TRIGGER IF EXISTS แล้ว CREATE — รันซ้ำได้)
--   §3 ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย
--   ⛔ ไม่แตะ: เนื้อของ save_quotation_content (รัน 0407 ซ้ำแล้วตรวจท้ายของมันยังนับได้เท่าเดิม) · ฟังก์ชันอื่นทุกตัว · CHECK · คอลัมน์ ·
--      ตาราง quotations · sales_order_lines (ใบสั่งขายเป็น snapshot — ไม่มีกฎของยามนี้)
--   ⛔ ไม่ backfill — ไม่มีคำสั่ง UPDATE/INSERT/DELETE กับแถวข้อมูลในไฟล์นี้ (นอกเนื้อฟังก์ชัน)
--   🪤 ไฟล์นี้ไม่เขียนคำว่า FUNCTION ตามด้วย public. + ชื่อฟังก์ชันที่มีอยู่ก่อนแล้วตัวใดเลย (ยาม "นิยามล่าสุด" ของหลายเทสต์หาเจ้าของด้วยข้อความนั้น)
--      — ข้อความนั้นมีเฉพาะชื่อใหม่สามตัวของไฟล์นี้ · ตรรกะหมวดมีสำเนาเก้าที่ (T2 · ด่าน §0 สองที่ · SELECT ตรวจก่อนรันสี่ที่ · SELECT ตรวจหลังรันสองที่)
--      และกฎ "สินค้าเดียวกัน" ของข้อ (ข) ห้าที่ (T2 · ด่าน §0 · SELECT ตรวจก่อนรันสองที่ · SELECT ตรวจหลังรัน) — ข้อความเดียวกันทุกตัวอักษร (ฮาร์เนสเทียบ)
--
--  ── กฎหมวดของบรรทัด (= lineCategoryCode(line, null) === '02-001' ใน webapp/src/lib/sales/linePacks.js) ───────────────────
--   มี "productId" หรือ "fgCode" (ไม่ว่าง) → หมวด = ชิ้นแรกที่เข้ารูป 2 หลัก-3 หลัก ใน "fgCode" ของบรรทัด (categoryOf · ไม่ดูทะเบียนสินค้า)
--   ไม่มีทั้งคู่ (บรรทัดพิมพ์เอง) → หมวด = metadata.categoryCode ถ้าเป็นสตริง · นอกนั้นไม่มีหมวด (NULL = ไม่ใช่ 02-001)
--   ⚠️ ใช้ [0-9] ไม่ใช่ \d — \d ของ JS คือเลขอารบิกเท่านั้น ส่วน \d ของ Postgres ขึ้นกับ locale/ICU (เลขไทยอาจนับเป็นตัวเลข)
--  ── กฎ "สินค้าเดียวกัน" ของข้อ (ข) (บรรทัด Rev. ที่ไม่มีเลขแพ็ค ↔ บรรทัดที่มีเลขแพ็คของฉบับต้นทาง · ไม่ดูทะเบียนสินค้า) ──────────────
--   บรรทัด Rev. มี "productId" (ไม่ว่าง) → ต้นทางมีบรรทัด "productId" เดียวกัน  หรือ  มี "fgCode" (ไม่ว่าง) → ต้นทางมีบรรทัด "fgCode" เดียวกัน
--   ไม่มีทั้งคู่ (บรรทัดพิมพ์เอง) → ต้นทางมีบรรทัดที่มีเลขแพ็คบรรทัดใดก็ได้
--   · Rev. ของรุ่นก่อน PR-1 ก๊อป "productId" ของบรรทัดเดิม (ซิงก์ fgCode ใหม่ได้) ⇒ จับด้วย productId · กู้จาก audit_logs ("productId" NULL) ⇒ จับด้วย fgCode
--
--  ── ด่านก่อนรัน ($pre$ — RAISE แล้วทั้งไฟล์ถอย ไม่มีครึ่ง ๆ กลาง ๆ) ───────────────────────────────
--   mig_0410_needs_0407            (ทุกรอบ) ยังไม่มี quotation_lines."packQty" integer + CHECK ช่วง + กฎเงินของ 0407 (validated)
--   mig_0410_needs_columns         (ทุกรอบ) คอลัมน์ 10 ตัวที่ trigger อ่านไม่ครบ/ชนิดไม่ตรง
--   mig_0410_needs_save_shape      (ทุกรอบ) save_quotation_content ไม่ใช่ตัวเดียว หรือเนื้อไม่ใช่ "DELETE บรรทัดของใบ แล้ว INSERT ใหม่" ครั้งละหนึ่ง
--                                  — กลไก (ก) ของ T2 อาศัยลำดับนั้น · เนื้อเปลี่ยนเป็นแบบอื่น (เช่น UPSERT) = ยามมองไม่เห็นการเขียนทับ ⇒ แจ้งผู้พัฒนา
--   mig_0410_foreign_trigger       (ทุกรอบ) quotation_lines มี trigger ที่ไม่ใช่สามตัวของไฟล์นี้ (สร้างจาก dashboard?) — ไม่รู้ว่ามันทำอะไรกับแถว
--   mig_0410_mixed_lines           (รันครั้งแรกเท่านั้น = ยังไม่มี trigger ของไฟล์นี้) มีใบที่ถือทั้งบรรทัดที่มีเลขแพ็คและบรรทัดหมวด 02-001 ที่ไม่มี
--   mig_0410_revision_bare_lines   (รันครั้งแรกเท่านั้น) มีฉบับ Rev. (ทุกสถานะ) ที่บรรทัดหมวด 02-001 ไม่มีเลขแพ็ค ทั้งที่ฉบับต้นทางมีเลขแพ็คของ
--                                  สินค้าเดียวกัน (= สิ่งที่ข้อ (ข) ของ T2 ปฏิเสธ · ส่วนหนึ่งของตัวจับ ⑥)
--       — สองข้อนี้บอกจำนวนและเลขใบ (สูงสุด 10 ใบ) · แต่ละใบคือเลขแพ็คที่อาจหายไปแล้ว (หรือร่างที่ประกอบผ่าน API) ⇒ ผู้พัฒนาไล่ด้วย
--         check-line-pack-parity.mjs (⑥ ⑧ + audit_logs.before) แล้วเจ้าของตัดสินทีละใบ — ยามล็อกทาง Rev. ของใบแบบนั้นทันทีที่รัน
--       — ข้อมูลที่เจ้าของตัดสินแล้วว่าตั้งใจ (แก้ภายใต้ทางออก · กู้จาก audit_logs · Rev. ที่รอกรอกเลขแพ็ค) ผ่านสองด่านนี้ได้ด้วย
--         app.mig_0410_accept เท่านั้น (หัวข้อ "ยอมรับรายการ" ข้างล่าง) — ข้อความ error บอกบรรทัดที่ต้องใช้
--   mig_0410_verify                ตรวจท้ายไม่ครบ (ฟังก์ชัน · สิทธิ์ · trigger · ของที่ต้องไม่แตะถูกแตะ)
--
--  ── ตรวจก่อนรัน (อ่านอย่างเดียว · รันได้ทุกเมื่อ ทั้งก่อนและหลังรัน · ผลแถวเดียว) ─────────────────────────────
--   เกณฑ์ก่อนรันครั้งแรก: trg = 0 · ours_trg = 0 · ours_fn = 0 · m0407 = 3 · cols = 10 · save_fns = 1 · save_shape = t · save_body = t
--                  · save_body_ws = t · mixed = 0 · rev_bare = 0
--   ข้อมูลประกอบ (ไม่ใช่เกณฑ์): save_md5 / md5_expected = md5 ของเนื้อ save_quotation_content บนฐาน / ที่ประกอบจากไฟล์ใน repo (0343 + แพตช์ 0407)
--                  · mixed_list / rev_bare_list = เลขใบที่นับใน mixed / rev_bare พร้อมสถานะ (none = ไม่มี)
--                  · packed_qt = บรรทัดใบเสนอราคาที่มีเลขแพ็ค (15/10/2026 = 9) · pgver = เวอร์ชันของฐาน (ฮาร์เนสพิสูจน์บน 18.3)
--   ⛔ อย่ารัน แล้วแจ้งผู้พัฒนา เมื่อ:
--      · trg ≠ 0 ขณะ ours_trg = 0 (มี trigger ที่ไม่รู้จักบน quotation_lines — ไฟล์หยุดเองด้วย mig_0410_foreign_trigger)
--      · ours_trg / ours_fn ไม่ใช่ 0 และไม่ใช่ 3 (สภาพครึ่ง ๆ — มีคนสร้าง/ลบเอง)
--      · m0407 ≠ 3 · cols ≠ 10 · save_fns ≠ 1 · save_shape ≠ t (ไฟล์หยุดเองทุกข้อ)
--      · save_body ≠ t = เนื้อของ save_quotation_content บนฐานไม่ใช่เนื้อที่พิสูจน์บนฮาร์เนส (ไฟล์ **ไม่** หยุดเองข้อนี้ — ดูด้วยตา)
--        · save_body_ws = t แปลว่าต่างกันแค่ช่องว่าง/ขึ้นบรรทัด — ผู้พัฒนาเทียบ save_md5 ก่อน
--      · mixed ≠ 0 หรือ rev_bare ≠ 0 ขณะ ours_trg = 0 (ไฟล์หยุดเอง — ส่ง mixed_list / rev_bare_list ให้ผู้พัฒนา · เจ้าของตัดสินทีละใบแล้ว
--        ทุกใบตั้งใจ = รันด้วยบรรทัด app.mig_0410_accept ที่ข้อความ error บอก — หัวข้อ "ยอมรับรายการ")
--   หลังรัน: SELECT เดียวกันต้องได้ trg = 3 · ours_trg = 3 · ours_fn = 3 · ที่เหลือเท่าก่อนรัน (ไฟล์ไม่เขียนแถวข้อมูล และไม่แตะ save_quotation_content)
--   ⏱ ผลแถวนี้มีอายุ: ใช้ตัดสินได้เฉพาะรอบนั่งเดียวกับที่รันไฟล์ — มี migration อื่นรันคั่น หรือข้ามวัน = รัน SELECT นี้ใหม่ก่อน
--
--   SELECT
--    (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.quotation_lines'::regclass AND NOT t.tgisinternal) AS trg,
--    (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.quotation_lines'::regclass AND NOT t.tgisinternal
--      AND t.tgname IN ('quotation_lines_pack_held_trg', 'quotation_lines_pack_keep_trg', 'quotation_lines_pack_no_clear_trg')) AS ours_trg,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname IN ('quotation_line_pack_held', 'quotation_line_pack_keep', 'quotation_line_pack_no_clear')) AS ours_fn,
--    ((SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'quotation_lines'
--        AND column_name = 'packQty' AND data_type = 'integer')
--     + (SELECT count(*) FROM pg_constraint c WHERE c.conrelid = 'public.quotation_lines'::regclass AND c.contype = 'c' AND c.convalidated
--         AND c.conname IN ('quotation_lines_pack_qty_range', 'quotation_lines_line_money_rule'))) AS m0407,
--    (SELECT count(*) FROM (VALUES ('quotation_lines', 'id', 'text'), ('quotation_lines', 'quotationId', 'text'),
--         ('quotation_lines', 'productId', 'text'), ('quotation_lines', 'fgCode', 'text'), ('quotation_lines', 'metadata', 'jsonb'),
--         ('quotation_lines', 'sortOrder', 'integer'), ('quotation_lines', 'packQty', 'integer'), ('quotations', 'id', 'text'),
--         ('quotations', 'revisedFromId', 'text'), ('quotations', 'quoteNumber', 'text')) AS e(tbl, col, typ)
--       JOIN information_schema.columns ic ON ic.table_schema = 'public' AND ic.table_name = e.tbl AND ic.column_name = e.col
--        AND ic.data_type = e.typ) AS cols,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname = 'save_quotation_content') AS save_fns,
--    (SELECT bool_and((length(p.prosrc) - length(replace(p.prosrc, 'DELETE FROM public.quotation_lines', ''))) / length('DELETE FROM public.quotation_lines') = 1
--        AND (length(p.prosrc) - length(replace(p.prosrc, 'INSERT INTO public.quotation_lines', ''))) / length('INSERT INTO public.quotation_lines') = 1
--        AND strpos(p.prosrc, 'DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;') > 0
--        AND strpos(p.prosrc, 'INSERT INTO public.quotation_lines (') > strpos(p.prosrc, 'DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;'))
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'save_quotation_content') AS save_shape,
--    (SELECT bool_and(md5(p.prosrc) = '5e52e4e0c29a5cb8866b320d614903ba') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'save_quotation_content') AS save_body,
--    (SELECT bool_and(md5(regexp_replace(p.prosrc, '[ \t\n\r]', '', 'g')) = 'd6d4d1b03ef071c0e7612a90582137ff') FROM pg_proc p
--       JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'save_quotation_content') AS save_body_ws,
--    (SELECT string_agg(md5(p.prosrc), ' ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'save_quotation_content') AS save_md5,
--    '5e52e4e0c29a5cb8866b320d614903ba'::text AS md5_expected,
--    (SELECT count(*) FROM public.quotations q
--      WHERE EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND to_jsonb(l) ->> 'packQty' IS NOT NULL)
--        AND EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND to_jsonb(l) ->> 'packQty' IS NULL
--          AND COALESCE(CASE WHEN COALESCE(l."productId", '') <> '' OR COALESCE(l."fgCode", '') <> '' THEN substring(l."fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001' ELSE jsonb_typeof(l.metadata -> 'categoryCode') = 'string' AND l.metadata ->> 'categoryCode' = '02-001' END, false))) AS mixed,
--    (SELECT count(*) FROM public.quotations q
--      WHERE q."revisedFromId" IS NOT NULL
--        AND EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND to_jsonb(l) ->> 'packQty' IS NULL
--          AND COALESCE(CASE WHEN COALESCE(l."productId", '') <> '' OR COALESCE(l."fgCode", '') <> '' THEN substring(l."fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001' ELSE jsonb_typeof(l.metadata -> 'categoryCode') = 'string' AND l.metadata ->> 'categoryCode' = '02-001' END, false)
--          AND EXISTS (SELECT 1 FROM public.quotation_lines s WHERE s."quotationId" = q."revisedFromId" AND to_jsonb(s) ->> 'packQty' IS NOT NULL
--            AND ((COALESCE(l."productId", '') = '' AND COALESCE(l."fgCode", '') = '') OR (COALESCE(l."productId", '') <> '' AND s."productId" = l."productId") OR (COALESCE(l."fgCode", '') <> '' AND s."fgCode" = l."fgCode"))))) AS rev_bare,
--    (SELECT COALESCE(string_agg(DISTINCT q."quoteNumber" || '=' || q.status, ' ' ORDER BY q."quoteNumber" || '=' || q.status), 'none') FROM public.quotations q
--       JOIN public.quotation_lines a ON a."quotationId" = q.id AND to_jsonb(a) ->> 'packQty' IS NOT NULL
--       JOIN public.quotation_lines l ON l."quotationId" = q.id AND to_jsonb(l) ->> 'packQty' IS NULL
--          AND COALESCE(CASE WHEN COALESCE(l."productId", '') <> '' OR COALESCE(l."fgCode", '') <> '' THEN substring(l."fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001' ELSE jsonb_typeof(l.metadata -> 'categoryCode') = 'string' AND l.metadata ->> 'categoryCode' = '02-001' END, false)) AS mixed_list,
--    (SELECT COALESCE(string_agg(DISTINCT q."quoteNumber" || '=' || q.status, ' ' ORDER BY q."quoteNumber" || '=' || q.status), 'none') FROM public.quotations q
--       JOIN public.quotation_lines l ON l."quotationId" = q.id AND to_jsonb(l) ->> 'packQty' IS NULL
--          AND COALESCE(CASE WHEN COALESCE(l."productId", '') <> '' OR COALESCE(l."fgCode", '') <> '' THEN substring(l."fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001' ELSE jsonb_typeof(l.metadata -> 'categoryCode') = 'string' AND l.metadata ->> 'categoryCode' = '02-001' END, false)
--       JOIN public.quotation_lines s ON s."quotationId" = q."revisedFromId" AND to_jsonb(s) ->> 'packQty' IS NOT NULL
--          AND ((COALESCE(l."productId", '') = '' AND COALESCE(l."fgCode", '') = '') OR (COALESCE(l."productId", '') <> '' AND s."productId" = l."productId") OR (COALESCE(l."fgCode", '') <> '' AND s."fgCode" = l."fgCode"))) AS rev_bare_list,
--    (SELECT count(*) FROM public.quotation_lines l WHERE to_jsonb(l) ->> 'packQty' IS NOT NULL) AS packed_qt,
--    current_setting('server_version') AS pgver;
--
--  ── ลำดับ deploy (ไม่มี freeze · มติ G10) ──────────────────────────────────────────────────────
--   0) ฮาร์เนส PGlite harness-0410 ผ่านสองรอบผลเหมือนกัน · mutate-0410 จับได้ทุกตัว · ทุกด่านในเครื่อง/CI เขียว
--      · ตรวจเลข migration อีกครั้ง (origin/main + PR ที่เปิดอยู่) — ห้ามมีใครถือ 0410
--   1) เจ้าของรัน PREFLIGHT-0410.sql (= SELECT ตรวจก่อนรันข้างบน) ที่ SQL Editor แล้วส่งแถวนั้นให้ผู้พัฒนาดูก่อน
--   2) หลังผู้พัฒนาตอบ "ไปได้" และในรอบนั่งเดียวกัน: รัน RUN-0410.sql ทั้งก้อน (= ไฟล์นี้ + SELECT ตรวจหลังรัน) → ส่งแถวตรวจหลังรันกลับ
--      **รันได้ทุกเวลา ไม่ต้องหยุดคีย์งาน**: โค้ดที่รันอยู่บน production (งวด PR-5) ส่ง "packQty" ทุกบรรทัดหมวด 02-001 ทุกครั้งที่เขียนบรรทัด
--      ⇒ ไม่มีคำขอไหนของมันชนยาม · ล็อกที่ไฟล์ถือบน quotation_lines จนจบไฟล์ (COMMIT):
--        · รันครั้งแรก = SHARE ROW EXCLUSIVE ของ CREATE TRIGGER — การบันทึกบรรทัดรอเสี้ยววินาที · การอ่านใบเสนอราคาไม่รอ
--        · รันซ้ำ / บล็อกถอยกลับ = ACCESS EXCLUSIVE ของ DROP TRIGGER (trigger ที่มีอยู่) — **การอ่านบรรทัดใบเสนอราคาก็รอด้วย** (รายการ · หน้าใบ · อนุมัติ)
--        · ไฟล์ตั้ง SET LOCAL lock_timeout = '5s': มีใครถือล็อกตารางนี้นานกว่า 5 วินาที = ERROR 55P03 ทั้งไฟล์ถอย ไม่มีอะไรเปลี่ยน
--          (กันคิวคำขอทั้งระบบต่อแถวหลังไฟล์นี้จนหมดเวลาของ Vercel) ⇒ รันใหม่อีกครั้งได้เลย
--   3) **หลัง** เจ้าของรันแล้วเท่านั้น: merge ไฟล์นี้ + เทสต์ + เอกสาร (repo ต้องไม่อ้างยามที่ production ยังไม่มี) — ไม่มีโค้ดแอปตัวไหนพึ่งไฟล์นี้
--      (ไม่มีคอลัมน์ใหม่ ⇒ check:columns ไม่แดงทั้งก่อนและหลังรัน · ไม่มีด่าน CI ไหนรู้ว่ารันแล้วหรือยัง — กันด้วยลำดับนี้)
--   พื้นของการถอยแอป (ใบเสนอราคา — แทนประโยคที่ขัดกันใน DEPLOY.md · มติ G11):
--     · ใบเสนอราคา: พื้นคือรุ่นของงวด PR-2 — ไม่เปลี่ยน
--     · รุ่นก่อนงวด PR-5: บันทึกใบสั่งขายย้อนหลังไม่ได้ (0409 — ดัง ไม่ใช่ยอดผิด)
--     · หลังไฟล์นี้: รุ่นก่อนงวด PR-1 ทำเลขแพ็คของใบเสนอราคาหาย **ในการบันทึก / การออก Rev. ครั้งเดียว** ไม่ได้อีก — ฐานปฏิเสธ ไม่มีอะไรถูกบันทึก
--       (ข้อความไทยของไฟล์นี้ขึ้นบนจอของรุ่นนั้น) · แต่ลบบรรทัดในการบันทึกหนึ่งแล้วเพิ่มกลับในการบันทึกถัดไปยังผ่านเงียบ (หัวข้อ "ไม่ได้กัน")
--       ⇒ ยังไม่ใช่รุ่นที่ถอยไปได้ (ไม่มีจอ/กระดาษไหนวาดคอลัมน์แพ็ค · ยอดหัวใบของคำขอแก้ VAT ยังคิดแบบไม่คูณแพ็ค · ทางสองการบันทึกข้างต้น)
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ───────────────────────────────────────────────────────────
--   เกณฑ์หลังรันทุกรอบ: trg = 3 · trg_ok = 3 · fns = 3 · exec = f · save_body = t · mixed = 0 · rev_bare = 0
--   ข้อมูลประกอบ (ไม่ใช่เกณฑ์): save_md5 = md5 ของเนื้อ save_quotation_content บนฐาน — ต้องเท่ากับ save_md5 ของแถวตรวจก่อนรันในรอบนั่งเดียวกัน (ไฟล์ไม่แตะ)
--   (trg_ok = trigger ของไฟล์นี้ที่ชื่อ · จังหวะ · เหตุการณ์ · คอลัมน์ · เงื่อนไข WHEN · ฟังก์ชัน ตรงทุกข้อและเปิดใช้อยู่ ·
--    fns = ฟังก์ชันสามตัวที่คืน trigger · plpgsql · ไม่ใช่ SECURITY DEFINER · search_path=public · exec = มี role ไหนใน PUBLIC / anon /
--    authenticated / service_role เรียกฟังก์ชันสามตัวได้ไหม)
--   (ข้อยกเว้น — เฉพาะที่ผู้พัฒนาตอบรับไว้กับแถวตรวจก่อนรันแล้ว: save_body = f ยอมได้เมื่อแถวตรวจก่อนรันก็ f และ save_md5 สองแถวเท่ากัน ·
--    mixed / rev_bare ≠ 0 ยอมได้เมื่อเท่ากับแถวตรวจก่อนรันของรอบนั่งเดียวกัน — รันครั้งแรกคือรายการที่ยอมรับด้วย app.mig_0410_accept ·
--    รันซ้ำคือข้อมูลที่เขียนภายใต้ทางออก หรือ Rev. ที่สินค้าถูกย้ายเข้าหมวด 02-001 รอคนขายกรอกเลขแพ็ค (นับใน mixed))
--
--   SELECT
--    (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.quotation_lines'::regclass AND NOT t.tgisinternal) AS trg,
--    (SELECT count(*) FROM (VALUES ('quotation_lines_pack_held_trg', 11, 'quotation_line_pack_held', '', 'old."packQty" IS NOT NULL', '-'),
--         ('quotation_lines_pack_keep_trg', 7, 'quotation_line_pack_keep', '', 'new."packQty" IS NULL', '-'),
--         ('quotation_lines_pack_no_clear_trg', 19, 'quotation_line_pack_no_clear', 'packQty', 'old."packQty" IS NOT NULL', 'new."packQty" IS NULL')
--       ) AS e(tg, typ, fn, col, w1, w2)
--       JOIN pg_trigger t ON t.tgname = e.tg AND t.tgrelid = 'public.quotation_lines'::regclass AND NOT t.tgisinternal
--       JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
--      WHERE t.tgtype = e.typ AND p.proname = e.fn AND t.tgenabled = 'O' AND t.tgqual IS NOT NULL
--        AND COALESCE((SELECT string_agg(a.attname, ',' ORDER BY a.attnum) FROM pg_attribute a
--                       WHERE a.attrelid = t.tgrelid AND a.attnum = ANY (t.tgattr::int2[])), '') = e.col
--        AND strpos(pg_get_triggerdef(t.oid), e.w1) > strpos(pg_get_triggerdef(t.oid), ' WHEN ')
--        AND (e.w2 = '-' OR strpos(pg_get_triggerdef(t.oid), e.w2) > strpos(pg_get_triggerdef(t.oid), ' WHEN '))
--        AND strpos(pg_get_triggerdef(t.oid), ' WHEN ') > 0) AS trg_ok,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public'
--      AND p.proname IN ('quotation_line_pack_held', 'quotation_line_pack_keep', 'quotation_line_pack_no_clear')
--      AND p.prorettype = 'trigger'::regtype AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
--      AND NOT p.prosecdef AND p.proconfig = ARRAY['search_path=public']) AS fns,
--    (SELECT COALESCE(bool_or(has_function_privilege(r.role, p.oid, 'EXECUTE')), true)
--       FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
--       CROSS JOIN (VALUES ('public'), ('anon'), ('authenticated'), ('service_role')) AS r(role)
--      WHERE p.proname IN ('quotation_line_pack_held', 'quotation_line_pack_keep', 'quotation_line_pack_no_clear')) AS exec,
--    (SELECT bool_and(md5(p.prosrc) = '5e52e4e0c29a5cb8866b320d614903ba') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'save_quotation_content') AS save_body,
--    (SELECT string_agg(md5(p.prosrc), ' ') FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND p.proname = 'save_quotation_content') AS save_md5,
--    (SELECT count(*) FROM public.quotations q
--      WHERE EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND l."packQty" IS NOT NULL)
--        AND EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND l."packQty" IS NULL
--          AND COALESCE(CASE WHEN COALESCE(l."productId", '') <> '' OR COALESCE(l."fgCode", '') <> '' THEN substring(l."fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001' ELSE jsonb_typeof(l.metadata -> 'categoryCode') = 'string' AND l.metadata ->> 'categoryCode' = '02-001' END, false))) AS mixed,
--    (SELECT count(*) FROM public.quotations q
--      WHERE q."revisedFromId" IS NOT NULL
--        AND EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND l."packQty" IS NULL
--          AND COALESCE(CASE WHEN COALESCE(l."productId", '') <> '' OR COALESCE(l."fgCode", '') <> '' THEN substring(l."fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001' ELSE jsonb_typeof(l.metadata -> 'categoryCode') = 'string' AND l.metadata ->> 'categoryCode' = '02-001' END, false)
--          AND EXISTS (SELECT 1 FROM public.quotation_lines s WHERE s."quotationId" = q."revisedFromId" AND s."packQty" IS NOT NULL
--            AND ((COALESCE(l."productId", '') = '' AND COALESCE(l."fgCode", '') = '') OR (COALESCE(l."productId", '') <> '' AND s."productId" = l."productId") OR (COALESCE(l."fgCode", '') <> '' AND s."fgCode" = l."fgCode"))))) AS rev_bare;
--
--  ── ทางออก: แก้ข้อมูลโดยตั้งใจ / กู้ใบจาก audit_logs.before (มติ G5 · แบบอย่าง 0241 app.entity_counter_unlock · 0367) ───────────
--   ยามข้อ T2 / T3 ยอมทุกแถวในทรานแซกชันที่ตั้งตัวแปรนี้ — **ทำในเซสชัน SQL ตรง (SQL Editor · psql) ภายใน BEGIN … COMMIT เท่านั้น**:
--      BEGIN;
--      SET LOCAL app.quotation_pack_unlock = 'on';
--      -- คำสั่งแก้ข้อมูลที่เจ้าของสั่ง เช่น UPDATE public.quotation_lines SET "packQty" = NULL, "lineTotal" = … WHERE id = '…';
--      -- หรือกู้ใบที่ถูกลบ: INSERT ตามลำดับ projects → sales_deals → quotations → quotation_lines จาก audit_logs.before
--      --   (ฉบับ Rev. ที่กู้คืนซึ่งต้นทางมีเลขแพ็คของสินค้าเดียวกัน จะถูก T2 ปฏิเสธถ้าไม่ตั้งตัวแปรนี้)
--      COMMIT;
--   · SET LOCAL ตายพร้อม COMMIT/ROLLBACK — ทรานแซกชันถัดไปถูกยามคุมตามเดิม (พิสูจน์บนฮาร์เนส) · นอก BEGIN … COMMIT คำสั่งนี้ไม่มีผล (Postgres เตือน)
--   · ห้ามใช้ SET แบบไม่มี LOCAL — ค่าจะค้างทั้งเซสชัน (ของ SQL Editor / psql)
--   · PostgREST ตั้งตัวแปรชื่อนี้ต่อคำขอไม่ได้ (ตั้งได้เฉพาะ request.* ของมันเอง และ set_config ไม่ได้อยู่ใน schema ที่เปิดเป็น RPC)
--     ⇒ โค้ดแอปทุกรุ่นเปิดทางออกนี้ไม่ได้ · ส่วนเซสชัน SQL ตรงทุกทาง (ไม่ใช่แค่ SQL Editor — psql · ไคลเอนต์ที่ถือรหัสผ่านฐาน) ตั้งได้
--   · Table Editor ของ dashboard ก็ยิง trigger — แก้ "packQty" เป็นว่างจากตรงนั้นจะได้ข้อความของยาม ⇒ ใช้ SQL Editor ตามบล็อกข้างบน
--     แต่ **INSERT แถวเดี่ยวไม่ถูกปฏิเสธ** เว้นแต่เป็นบรรทัดของ Rev. ที่ต้นทางมีเลขแพ็คของสินค้าเดียวกัน — ยามเห็นเฉพาะ "ลบแล้วแทรก" ในทรานแซกชันเดียวกัน
--     (ลำดับ "แทรกก่อนลบ" · ยิงสองคำขอ · UPDATE ที่เปลี่ยนรหัสให้เป็นหมวด 02-001 — ผ่านทั้งหมด: หัวข้อ "ไม่ได้กัน")
--   · DELETE ไม่ต้องใช้ทางออกนี้ (T1 ไม่เคยปฏิเสธ) · UPDATE คอลัมน์อื่น (รหัส FG / สินค้า / หน่วย — เช่นการเปลี่ยนรหัส AR + FG ของใบที่อนุมัติแล้ว) ไม่ผ่านยาม
--   · ⚠️ แก้ quotation_lines ด้วยมือเสร็จทุกครั้ง (มีหรือไม่มีทางออก): ให้ผู้มีสิทธิ์รัน scripts/check-line-pack-parity.mjs (อ่านอย่างเดียว) — ยามไม่ใช่ตัวตรวจ
--
--  ── ยอมรับรายการของด่านรันครั้งแรก (app.mig_0410_accept · เมื่อ mixed / rev_bare ≠ 0 และเจ้าของตัดสินแล้วทุกใบ) ─────────────
--   ด่าน mig_0410_mixed_lines / mig_0410_revision_bare_lines ทำงานทุกรันครั้งแรก (รวมรันแรกหลังถอย) — ข้อมูลที่ตั้งใจให้เป็นแบบนั้น (แก้/กู้ภายใต้
--   ทางออก · Rev. ที่สินค้าถูกย้ายเข้าหมวด 02-001 รอคนขายกรอกเลขแพ็ค) ทำให้รันไม่ผ่าน ⇒ ผู้พัฒนาไล่ทุกใบในรายการ · เจ้าของตัดสิน ·
--   แล้ววางบรรทัดที่ข้อความ error ให้มา **ไว้บนสุดของ RUN-0410.sql (ก่อน BEGIN)** แล้วรันใหม่ เช่น
--      SET app.mig_0410_accept = 'mixed=QT-…,QT-… rev_bare=QT-…';
--   · ยอมเฉพาะรายการที่ตรงทุกใบ (เลขใบเรียงตามตัวอักษร คั่นด้วยจุลภาค · ไม่มีเลขใช้รหัสใบ) — มีใบเพิ่ม/หาย = ด่านหยุดเหมือนเดิมและบอกบรรทัดใหม่
--   · ผ่านแล้วไฟล์พิมพ์ NOTICE รายการที่ยอมรับ · แถวตรวจหลังรันเห็น mixed / rev_bare เท่าจำนวนที่ยอมรับ (ไม่ใช่ 0 — ข้อยกเว้นของเกณฑ์หลังรัน)
--   · ใช้ SET (ไม่ใช่ SET LOCAL) — ได้ผลทั้งเมื่อ SQL Editor ส่งทั้งก้อนเป็นคำขอเดียว (SET ถูกนับเข้าทรานแซกชันของไฟล์ · รันไม่ผ่าน = ค่าถอยไปด้วย —
--     พิสูจน์บน PGlite) และเมื่อส่งทีละคำสั่ง · ค่านี้เปิดแค่สองด่านนี้ของไฟล์นี้ ไม่เปิดยาม (ยามอ่าน app.quotation_pack_unlock ตัวเดียว) ·
--     ค้างในเซสชันหลังรันผ่านก็ไม่มีผลกับอะไร นอกจากรัน 0410 ซ้ำกับรายการเดิมเป๊ะ
--
--  ── ถอยกลับ ─────────────────────────────────────────────────────────────────────────────
--   ถอยได้ทุกเมื่อ — ไฟล์นี้ไม่เขียนแถวข้อมูล ไม่แตะฟังก์ชัน/คอลัมน์/CHECK เดิม · ถอยแล้วกลับไปเป็น "ไม่มีอะไรในฐานกัน" (ตัวจับ ⑥–⑧ เท่านั้น)
--   บล็อกเดียว (ลำดับ: trigger ก่อน แล้วฟังก์ชัน · DROP TRIGGER ถือ ACCESS EXCLUSIVE จน COMMIT — การอ่านบรรทัดใบเสนอราคาก็รอ ⇒ lock_timeout
--   เท่ากับตัวไฟล์ · ERROR 55P03 = ไม่มีอะไรเปลี่ยน รันใหม่ได้):
--      BEGIN;
--      SET LOCAL lock_timeout = '5s';
--      DROP TRIGGER IF EXISTS quotation_lines_pack_held_trg ON public.quotation_lines;
--      DROP TRIGGER IF EXISTS quotation_lines_pack_keep_trg ON public.quotation_lines;
--      DROP TRIGGER IF EXISTS quotation_lines_pack_no_clear_trg ON public.quotation_lines;
--      DROP FUNCTION IF EXISTS public.quotation_line_pack_held();
--      DROP FUNCTION IF EXISTS public.quotation_line_pack_keep();
--      DROP FUNCTION IF EXISTS public.quotation_line_pack_no_clear();
--      COMMIT;
--      NOTIFY pgrst, 'reload schema';
--   ผล: schema · ฟังก์ชันทุกตัว · trigger ทุกตัว · แถวข้อมูลทุกแถว เท่าก่อนรันไฟล์นี้ทุกตัวอักษร (พิสูจน์บนฮาร์เนส) · SELECT ตรวจก่อนรันได้ค่า "ก่อนรัน"
--     · การรันไฟล์นี้ครั้งถัดไปนับเป็น "รันครั้งแรก" อีกรอบ (ด่าน mixed / rev_bare ทำงาน — ข้อมูลที่แก้ภายใต้ทางออกระหว่างนั้นผ่านได้ด้วย
--       app.mig_0410_accept ตามหัวข้อ "ยอมรับรายการ")
--   ⛔ ไม่ต้องถอยเพื่อแก้ข้อมูล — ใช้ทางออกข้างบน
--   ⚠️ ลำดับกับ 0407: บล็อกถอยของ 0407 (ALTER TABLE … DROP COLUMN "packQty") ขณะ trigger ของไฟล์นี้ยังอยู่ = ERROR 2BP01 (trigger อ้างคอลัมน์นั้น ·
--      ทั้งบล็อกถอย ไม่มีอะไรเปลี่ยน) ⇒ **ถอย 0410 ก่อนเสมอ** แล้วจึงถอย 0407 — ซึ่งยังห้ามถอยเมื่อมีบรรทัดที่มีเลขแพ็ค (หัวไฟล์ 0407) (พิสูจน์บนฮาร์เนส)
--
--  ⚠️ DDL — เจ้าของรันมือบน Supabase SQL Editor (ทางรันผ่าน PostgREST ใช้ได้เฉพาะ DML)
--  ✅ รันซ้ำได้ — CREATE OR REPLACE ฟังก์ชัน (ถอนสิทธิ์ซ้ำทุกรอบ) · DROP TRIGGER IF EXISTS แล้วสร้างใหม่ด้วยนิยามเดิม (ACCESS EXCLUSIVE จน COMMIT —
--     หัวข้อ "ลำดับ deploy") · ด่าน mixed / rev_bare เช็คเฉพาะรันแรก
--     · ตรวจท้ายรันทุกรอบ · รัน 0407 / 0409 ซ้ำหลังไฟล์นี้ไม่กระทบ trigger (ตรวจท้ายของสองไฟล์นั้นยังผ่าน — พิสูจน์บนฮาร์เนส)
--  ⚠️ ถ้าวันหน้ามี migration เขียน save_quotation_content ทับทั้งก้อน: ต้องยังเป็น "DELETE บรรทัดของใบ แล้ว INSERT ใหม่" ในการเรียกเดียว —
--     ไม่งั้นข้อ (ก) ของ T2 มองไม่เห็นการเขียนทับ (รันไฟล์นี้ซ้ำแล้วจะหยุดด้วย mig_0410_needs_save_shape) · trigger อยู่บนตาราง จึงรอดการเขียนทับ
--     ทั้งก้อนของ 0343 (ฮาร์เนส: ตัวบันทึกที่ไม่พก "packQty" ถูกยามปฏิเสธแทนการหดยอด)
--  🧪 พิสูจน์บนฮาร์เนส PGlite harness-0410 (นอก repo · mockups/so-service-lines/pglite-harness) — โหลด stubs-0407 + นิยามจริงจาก repo +
--     0389/0390 · 0392–0396 · 0400 · 0404 · 0407 · 0409 จากไฟล์จริง แล้วรันไฟล์นี้สองรอบ · ทุกเส้นของแอปในนาม service_role ·
--     บล็อกถอยกลับข้างบนลองจริง · mutate-0410 = ไฟล์ที่ทำผิดทีละข้อต้องถูกจับทุกตัว
-- ============================================================

BEGIN;

-- ── §0 รอล็อกได้ไม่เกิน 5 วินาที (รันซ้ำ = ACCESS EXCLUSIVE — ไม่ให้คิวคำขอทั้งระบบต่อแถวหลังไฟล์นี้ · 55P03 = รันใหม่ได้) ───
SET LOCAL lock_timeout = '5s';

-- ── §0 ด่านก่อนรัน + ลายนิ้วมือของที่ต้องไม่แตะ ────────────────────────────────────────────
DO $pre$
DECLARE
  v_n integer;
  v_list text;
  v_src text;
  v_key text;
  v_accept constant text := ' ' || COALESCE(current_setting('app.mig_0410_accept', true), '') || ' ';
  v_trgs constant text[] := ARRAY['quotation_lines_pack_held_trg', 'quotation_lines_pack_keep_trg', 'quotation_lines_pack_no_clear_trg'];
  v_fns constant text[] := ARRAY['quotation_line_pack_held', 'quotation_line_pack_keep', 'quotation_line_pack_no_clear'];
BEGIN
  -- 0407 ต้องรันแล้ว: คอลัมน์เลขแพ็ค + CHECK ช่วง + กฎเงินของบรรทัดใบเสนอราคา (ตรวจแถวเดิมครบแล้ว)
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'quotation_lines' AND column_name = 'packQty' AND data_type = 'integer') <> 1
     OR (SELECT count(*) FROM pg_constraint c
          WHERE c.conrelid = 'public.quotation_lines'::regclass AND c.contype = 'c' AND c.convalidated
            AND c.conname IN ('quotation_lines_pack_qty_range', 'quotation_lines_line_money_rule')) <> 2 THEN
    RAISE EXCEPTION 'mig_0410_needs_0407 — รัน 0407 ก่อน (ยังไม่มีคอลัมน์ quotation_lines."packQty" / CHECK ช่วง / กฎเงินของบรรทัด)';
  END IF;

  -- คอลัมน์ที่ trigger อ่าน — ชื่อและชนิดตรงทุกตัว
  SELECT count(*) INTO v_n
    FROM (VALUES ('quotation_lines', 'id', 'text'), ('quotation_lines', 'quotationId', 'text'),
                 ('quotation_lines', 'productId', 'text'), ('quotation_lines', 'fgCode', 'text'), ('quotation_lines', 'metadata', 'jsonb'),
                 ('quotation_lines', 'sortOrder', 'integer'), ('quotation_lines', 'packQty', 'integer'), ('quotations', 'id', 'text'),
                 ('quotations', 'revisedFromId', 'text'), ('quotations', 'quoteNumber', 'text')) AS e(tbl, col, typ)
    JOIN information_schema.columns ic ON ic.table_schema = 'public' AND ic.table_name = e.tbl AND ic.column_name = e.col
     AND ic.data_type = e.typ;
  IF v_n <> 10 THEN
    RAISE EXCEPTION 'mig_0410_needs_columns — คอลัมน์ที่ยามอ่านตรงแค่ % จาก 10 ตัว · ไม่รัน แจ้งผู้พัฒนา', v_n;
  END IF;

  -- ตัวบันทึกเนื้อหาใบเสนอราคา: ตัวเดียว · ลบบรรทัดของใบแล้วแทรกใหม่ ครั้งละหนึ่งคำสั่ง ตามลำดับนั้น (กลไกข้อ (ก) ของ T2)
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'save_quotation_content';
  IF v_n <> 1 THEN
    RAISE EXCEPTION 'mig_0410_needs_save_shape — ตัวบันทึกเนื้อหาใบเสนอราคามี % ตัว (ต้องมีตัวเดียว)', v_n;
  END IF;
  SELECT p.prosrc INTO v_src
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'save_quotation_content';
  IF (length(v_src) - length(replace(v_src, 'DELETE FROM public.quotation_lines', ''))) / length('DELETE FROM public.quotation_lines') <> 1
     OR (length(v_src) - length(replace(v_src, 'INSERT INTO public.quotation_lines', ''))) / length('INSERT INTO public.quotation_lines') <> 1
     OR strpos(v_src, 'DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;') = 0
     OR strpos(v_src, 'INSERT INTO public.quotation_lines (') < strpos(v_src, 'DELETE FROM public.quotation_lines WHERE "quotationId" = p_quote_id;') THEN
    RAISE EXCEPTION 'mig_0410_needs_save_shape — เนื้อของตัวบันทึกเนื้อหาใบเสนอราคาไม่ใช่ "ลบบรรทัดของใบ แล้วแทรกใหม่" — ยามมองไม่เห็นการเขียนทับ · ไม่รัน แจ้งผู้พัฒนา';
  END IF;

  -- trigger อื่นบนตารางบรรทัด (ไม่ใช่สามตัวของไฟล์นี้) = สภาพที่ไม่รู้จัก
  SELECT string_agg(t.tgname, ', ' ORDER BY t.tgname) INTO v_list
    FROM pg_trigger t
   WHERE t.tgrelid = 'public.quotation_lines'::regclass AND NOT t.tgisinternal AND NOT (t.tgname = ANY (v_trgs));
  IF v_list IS NOT NULL THEN
    RAISE EXCEPTION 'mig_0410_foreign_trigger — quotation_lines มี trigger ที่ไฟล์นี้ไม่รู้จัก (%) · ไม่รัน แจ้งผู้พัฒนา', v_list;
  END IF;

  -- รันครั้งแรก (ยังไม่มี trigger ของไฟล์นี้): ห้ามมีใบที่เลขแพ็คอาจหายไปแล้ว — ยามจะล็อกทาง Rev. ของใบพวกนั้นทันที
  -- · ยอมได้เฉพาะรายการที่เจ้าของตัดสินแล้วทุกใบ: SET app.mig_0410_accept = 'mixed=<เลขใบ,…> rev_bare=<เลขใบ,…>' ก่อน BEGIN (หัวไฟล์ "ยอมรับรายการ")
  --   v_key = รายการเต็มของรอบนี้ (เรียง · ไม่ตัด) — ต้องตรงทุกตัวอักษรกับคำหนึ่งใน app.mig_0410_accept
  IF NOT EXISTS (SELECT 1 FROM pg_trigger t WHERE t.tgrelid = 'public.quotation_lines'::regclass AND t.tgname = ANY (v_trgs)) THEN
    SELECT count(*), string_agg(x.label, ' · ' ORDER BY x.label) FILTER (WHERE x.rn <= 10), 'mixed=' || string_agg(x.num, ',' ORDER BY x.num)
      INTO v_n, v_list, v_key
      FROM (SELECT COALESCE(q."quoteNumber", q.id) AS num, COALESCE(q."quoteNumber", q.id) || ' ' || COALESCE(q.status, '-') AS label,
                   row_number() OVER (ORDER BY COALESCE(q."quoteNumber", q.id)) AS rn
              FROM public.quotations q
             WHERE EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND l."packQty" IS NOT NULL)
               AND EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND l."packQty" IS NULL
                 AND COALESCE(CASE WHEN COALESCE(l."productId", '') <> '' OR COALESCE(l."fgCode", '') <> '' THEN substring(l."fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001' ELSE jsonb_typeof(l.metadata -> 'categoryCode') = 'string' AND l.metadata ->> 'categoryCode' = '02-001' END, false))) x;
    IF v_n > 0 AND strpos(v_accept, ' ' || v_key || ' ') > 0 THEN
      RAISE NOTICE 'mig_0410_mixed_lines ยอมรับแล้วด้วย app.mig_0410_accept — % ใบ (%)', v_n, v_list || CASE WHEN v_n > 10 THEN ' …' ELSE '' END;
    ELSIF v_n > 0 THEN
      RAISE EXCEPTION 'mig_0410_mixed_lines — ใบเสนอราคา % ใบถือทั้งบรรทัดที่มีเลขแพ็คและบรรทัดหมวด 02-001 ที่ไม่มี (%) · ไม่รัน — ส่งเลขใบให้ผู้พัฒนาไล่ด้วย check-line-pack-parity.mjs ก่อน (เจ้าของตัดสินทีละใบ) · ตัดสินแล้วว่าทุกใบตั้งใจ = วางบรรทัดนี้บนสุดของ RUN-0410.sql แล้วรันใหม่: SET app.mig_0410_accept = ''%'';',
        v_n, v_list || CASE WHEN v_n > 10 THEN ' …' ELSE '' END, btrim(v_accept || v_key);
    END IF;

    SELECT count(*), string_agg(x.label, ' · ' ORDER BY x.label) FILTER (WHERE x.rn <= 10), 'rev_bare=' || string_agg(x.num, ',' ORDER BY x.num)
      INTO v_n, v_list, v_key
      FROM (SELECT COALESCE(q."quoteNumber", q.id) AS num, COALESCE(q."quoteNumber", q.id) || ' ' || COALESCE(q.status, '-') AS label,
                   row_number() OVER (ORDER BY COALESCE(q."quoteNumber", q.id)) AS rn
              FROM public.quotations q
             WHERE q."revisedFromId" IS NOT NULL
               AND EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = q.id AND l."packQty" IS NULL
                 AND COALESCE(CASE WHEN COALESCE(l."productId", '') <> '' OR COALESCE(l."fgCode", '') <> '' THEN substring(l."fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001' ELSE jsonb_typeof(l.metadata -> 'categoryCode') = 'string' AND l.metadata ->> 'categoryCode' = '02-001' END, false)
                 AND EXISTS (SELECT 1 FROM public.quotation_lines s WHERE s."quotationId" = q."revisedFromId" AND s."packQty" IS NOT NULL
                   AND ((COALESCE(l."productId", '') = '' AND COALESCE(l."fgCode", '') = '') OR (COALESCE(l."productId", '') <> '' AND s."productId" = l."productId") OR (COALESCE(l."fgCode", '') <> '' AND s."fgCode" = l."fgCode"))))) x;
    IF v_n > 0 AND strpos(v_accept, ' ' || v_key || ' ') > 0 THEN
      RAISE NOTICE 'mig_0410_revision_bare_lines ยอมรับแล้วด้วย app.mig_0410_accept — % ใบ (%)', v_n, v_list || CASE WHEN v_n > 10 THEN ' …' ELSE '' END;
    ELSIF v_n > 0 THEN
      RAISE EXCEPTION 'mig_0410_revision_bare_lines — ฉบับ Rev. % ใบมีบรรทัดหมวด 02-001 ไม่มีเลขแพ็ค ทั้งที่ฉบับต้นทางมีเลขแพ็คของสินค้าเดียวกัน (%) · ไม่รัน — ส่งเลขใบให้ผู้พัฒนาไล่ด้วย check-line-pack-parity.mjs ก่อน (เจ้าของตัดสินทีละใบ) · ตัดสินแล้วว่าทุกใบตั้งใจ = วางบรรทัดนี้บนสุดของ RUN-0410.sql แล้วรันใหม่: SET app.mig_0410_accept = ''%'';',
        v_n, v_list || CASE WHEN v_n > 10 THEN ' …' ELSE '' END, btrim(v_accept || v_key);
    END IF;
  END IF;

  -- ฟังก์ชันอื่นทุกตัวใน public: เนื้อ · volatility · SECURITY · search_path · สิทธิ์ — ค่าเดียว · §3 เทียบ (ตายตอน COMMIT/ROLLBACK)
  PERFORM set_config('mig_0410.others', (
    SELECT md5(COALESCE(string_agg(
             p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.provolatile::text || '|' || p.prosecdef::text
               || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, ''),
             E'\n' ORDER BY p.oid::regprocedure::text), ''))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT (p.proname = ANY (v_fns))
  ), true);

  -- trigger อื่นทุกตัวของฐาน (ยกเว้นสามตัวของไฟล์นี้) + คอลัมน์ / constraint / ดัชนีของ quotation_lines
  PERFORM set_config('mig_0410.tables', (
    SELECT md5(
      COALESCE((SELECT string_agg(t.tgrelid::regclass::text || '|' || t.tgname || '|' || t.tgenabled::text || '|' || pg_get_triggerdef(t.oid),
                                  E'\n' ORDER BY t.tgrelid::regclass::text, t.tgname)
                  FROM pg_trigger t WHERE NOT t.tgisinternal AND NOT (t.tgname = ANY (v_trgs))), '')
      || '#' || COALESCE((SELECT string_agg(a.attname || '|' || format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text,
                                  E'\n' ORDER BY a.attnum)
                  FROM pg_attribute a WHERE a.attrelid = 'public.quotation_lines'::regclass AND a.attnum > 0 AND NOT a.attisdropped), '')
      || '#' || COALESCE((SELECT string_agg(c.conname || '|' || c.convalidated::text || '|' || pg_get_constraintdef(c.oid), E'\n' ORDER BY c.conname)
                  FROM pg_constraint c WHERE c.conrelid = 'public.quotation_lines'::regclass), '')
      || '#' || COALESCE((SELECT string_agg(i.indexdef, E'\n' ORDER BY i.indexname)
                  FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = 'quotation_lines'), ''))
  ), true);
END
$pre$;

-- ── §1 ฟังก์ชันของ trigger สามตัว ─────────────────────────────────────────────────────────────
-- T1 — จดใบที่บรรทัดที่มีเลขแพ็คถูกลบในทรานแซกชันนี้ · ไม่โยน error เด็ดขาด (ไม่มี cast · ไม่อ่านตาราง · ทำแค่ต่อสตริง)
--      รูปของตัวแปร: chr(31) || id || chr(31) || id || chr(31) … (chr(31) = unit separator — ไม่มีในรหัสใบ) · ว่าง = '' หรือ NULL
CREATE OR REPLACE FUNCTION public.quotation_line_pack_held()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_held text := COALESCE(current_setting('app.quotation_pack_held', true), '');
BEGIN
  IF strpos(v_held, chr(31) || OLD."quotationId" || chr(31)) = 0 THEN
    PERFORM set_config('app.quotation_pack_held',
      CASE WHEN v_held = '' THEN chr(31) ELSE v_held END || OLD."quotationId" || chr(31), true);
  END IF;
  RETURN OLD;
END;
$$;

-- T2 — บรรทัดหมวด 02-001 ที่ไม่มีเลขแพ็ค: ปฏิเสธเมื่อ (ก) ใบนี้เพิ่งเสียบรรทัดที่มีเลขแพ็คในทรานแซกชันนี้ หรือ (ข) ฉบับต้นทางถือเลขแพ็คของสินค้าเดียวกัน
CREATE OR REPLACE FUNCTION public.quotation_line_pack_keep()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_why text;
  v_source text;
  v_number text;
BEGIN
  -- ทางออกที่ต้องประกาศเจตนา (SQL Editor · หัวไฟล์ 0410 "ทางออก"): SET LOCAL app.quotation_pack_unlock = 'on'
  IF COALESCE(current_setting('app.quotation_pack_unlock', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  -- หมวดของบรรทัด = lineCategoryCode(line, null) ฝั่ง JS บนคอลัมน์ของแถวนี้เท่านั้น (ไม่ join products)
  IF NOT COALESCE(CASE WHEN COALESCE(NEW."productId", '') <> '' OR COALESCE(NEW."fgCode", '') <> '' THEN substring(NEW."fgCode" from '[0-9]{2}-[0-9]{3}') = '02-001' ELSE jsonb_typeof(NEW.metadata -> 'categoryCode') = 'string' AND NEW.metadata ->> 'categoryCode' = '02-001' END, false) THEN
    RETURN NEW;
  END IF;
  IF strpos(COALESCE(current_setting('app.quotation_pack_held', true), ''), chr(31) || NEW."quotationId" || chr(31)) > 0 THEN
    v_why := 'rewrite';
  ELSE
    -- (ข) ฉบับต้นทางถือบรรทัดที่มีเลขแพ็คของสินค้าเดียวกัน (productId หรือ fgCode เดียวกัน · บรรทัดพิมพ์เอง = บรรทัดใดก็ได้) — หัวไฟล์ "กฎสินค้าเดียวกัน"
    SELECT s."quoteNumber" INTO v_source
      FROM public.quotations q JOIN public.quotations s ON s.id = q."revisedFromId"
     WHERE q.id = NEW."quotationId"
       AND EXISTS (SELECT 1 FROM public.quotation_lines l WHERE l."quotationId" = s.id AND l."packQty" IS NOT NULL
             AND ((COALESCE(NEW."productId", '') = '' AND COALESCE(NEW."fgCode", '') = '') OR (COALESCE(NEW."productId", '') <> '' AND l."productId" = NEW."productId") OR (COALESCE(NEW."fgCode", '') <> '' AND l."fgCode" = NEW."fgCode")));
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;
    v_why := 'revision';
  END IF;

  SELECT q."quoteNumber" INTO v_number FROM public.quotations q WHERE q.id = NEW."quotationId";
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = CASE v_why
      WHEN 'rewrite' THEN format(
        'ไม่ได้บันทึก: ใบเสนอราคา %s รายการที่ %s (หมวด 02-001) ไม่มี “แพ็ค/เดือน” ทั้งที่ใบนี้มีเลขแพ็คอยู่แล้ว — บันทึกแบบนี้เลขแพ็คจะหายและยอดจะผิด · ไม่มีอะไรถูกบันทึก ข้อมูลเดิมอยู่ครบ · หน้าจอหรือโปรแกรมที่ส่งคำขอนี้เป็นรุ่นเก่า: รีเฟรชหน้าแล้วทำใหม่ (เปิดจาก dev server ให้รวม main ก่อน) · อย่าลบรายการนี้แล้วเพิ่มกลับในการบันทึกถัดไป — เลขแพ็คจะหายโดยไม่มีอะไรเตือน · ยังไม่ได้ แจ้งผู้ดูแลระบบ [quotation_line_pack_lost]',
        COALESCE(v_number, NEW."quotationId"), COALESCE(NEW."sortOrder", 0) + 1)
      ELSE format(
        'ไม่ได้บันทึก: ฉบับ Rev. %s รายการที่ %s (หมวด 02-001) ไม่มี “แพ็ค/เดือน” ทั้งที่ฉบับต้นทาง %s มีเลขแพ็คของรายการนี้ — ออก Rev. แบบนี้เลขแพ็คจะหายและยอดจะผิด · ไม่มีอะไรถูกบันทึก ฉบับต้นทางอยู่ครบ · หน้าจอหรือโปรแกรมที่ส่งคำขอนี้เป็นรุ่นเก่า: รีเฟรชหน้าแล้วทำใหม่ (เปิดจาก dev server ให้รวม main ก่อน) · ใช้รุ่นล่าสุดแล้วยังไม่ได้ แจ้งผู้ดูแลระบบ [quotation_line_pack_lost]',
        COALESCE(v_number, NEW."quotationId"), COALESCE(NEW."sortOrder", 0) + 1, COALESCE(v_source, '-'))
    END,
    DETAIL = format('quotation_line_pack_lost reason=%s quotationId=%s lineId=%s sortOrder=%s fgCode=%s source=%s',
      v_why, NEW."quotationId", NEW.id, NEW."sortOrder", COALESCE(NEW."fgCode", '-'), COALESCE(v_source, '-')),
    HINT = 'ยามในฐาน 0410: บรรทัดหมวด 02-001 ห้ามเสียเลขแพ็คที่ใบ/ฉบับต้นทางมีอยู่ · แก้ข้อมูลโดยตั้งใจ = SQL Editor ภายใน BEGIN … COMMIT พร้อม SET LOCAL app.quotation_pack_unlock = ''on''';
END;
$$;

-- T3 — ล้างเลขแพ็คของบรรทัดที่มีอยู่ด้วย UPDATE = ปฏิเสธ (ยอดของบรรทัดคิดจากเลขนี้)
CREATE OR REPLACE FUNCTION public.quotation_line_pack_no_clear()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_number text;
BEGIN
  IF COALESCE(current_setting('app.quotation_pack_unlock', true), '') = 'on' THEN
    RETURN NEW;
  END IF;
  SELECT q."quoteNumber" INTO v_number FROM public.quotations q WHERE q.id = OLD."quotationId";
  RAISE EXCEPTION USING
    ERRCODE = 'P0001',
    MESSAGE = format(
      'ไม่ได้บันทึก: ล้าง “แพ็ค/เดือน” ของรายการใบเสนอราคาที่มีเลขแพ็คแล้วไม่ได้ (ใบ %s รายการที่ %s · เลขแพ็คเดิม %s) — ยอดของรายการคิดจากเลขนี้ · ไม่มีอะไรถูกบันทึก · ตั้งใจแก้ข้อมูลจริง: ทำใน SQL Editor ภายใน BEGIN … COMMIT พร้อม SET LOCAL app.quotation_pack_unlock = ''on'' [quotation_line_pack_cleared]',
      COALESCE(v_number, OLD."quotationId"), COALESCE(OLD."sortOrder", 0) + 1, OLD."packQty"),
    DETAIL = format('quotation_line_pack_cleared quotationId=%s lineId=%s packQty=%s', OLD."quotationId", OLD.id, OLD."packQty"),
    HINT = 'ยามในฐาน 0410: บรรทัดที่มีเลขแพ็คต้องไม่ถูกล้างเลขด้วย UPDATE';
END;
$$;

-- ไม่มีใครเรียกสามตัวนี้ตรง ๆ ได้ — trigger ยิงได้โดยไม่ต้องมีสิทธิ์ EXECUTE (ถอนจากทุก role รวม service_role · มติ G7)
REVOKE ALL ON FUNCTION public.quotation_line_pack_held() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.quotation_line_pack_keep() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.quotation_line_pack_no_clear() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.quotation_line_pack_held() IS
  'ยามเลขแพ็ค T1 (0410): จด quotationId ของบรรทัดที่มีเลขแพ็คซึ่งถูกลบ ลง app.quotation_pack_held ของทรานแซกชัน · ไม่ปฏิเสธอะไรเลย';
COMMENT ON FUNCTION public.quotation_line_pack_keep() IS
  'ยามเลขแพ็ค T2 (0410): บรรทัดหมวด 02-001 ที่ไม่มีเลขแพ็ค = ปฏิเสธ เมื่อใบเพิ่งเสียบรรทัดที่มีเลขแพ็คในทรานแซกชันนี้ หรือฉบับต้นทาง (revisedFromId) มีเลขแพ็คของสินค้าเดียวกัน · ทางออก SET LOCAL app.quotation_pack_unlock = on';
COMMENT ON FUNCTION public.quotation_line_pack_no_clear() IS
  'ยามเลขแพ็ค T3 (0410): UPDATE ที่ล้าง packQty ของบรรทัดที่มีเลขแพ็ค = ปฏิเสธ · ทางออก SET LOCAL app.quotation_pack_unlock = on';

-- ── §2 trigger สามตัวบนตารางบรรทัด ──────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS quotation_lines_pack_held_trg ON public.quotation_lines;
CREATE TRIGGER quotation_lines_pack_held_trg
  BEFORE DELETE ON public.quotation_lines
  FOR EACH ROW
  WHEN (OLD."packQty" IS NOT NULL)
  EXECUTE FUNCTION public.quotation_line_pack_held();

DROP TRIGGER IF EXISTS quotation_lines_pack_keep_trg ON public.quotation_lines;
CREATE TRIGGER quotation_lines_pack_keep_trg
  BEFORE INSERT ON public.quotation_lines
  FOR EACH ROW
  WHEN (NEW."packQty" IS NULL)
  EXECUTE FUNCTION public.quotation_line_pack_keep();

DROP TRIGGER IF EXISTS quotation_lines_pack_no_clear_trg ON public.quotation_lines;
CREATE TRIGGER quotation_lines_pack_no_clear_trg
  BEFORE UPDATE OF "packQty" ON public.quotation_lines
  FOR EACH ROW
  WHEN (OLD."packQty" IS NOT NULL AND NEW."packQty" IS NULL)
  EXECUTE FUNCTION public.quotation_line_pack_no_clear();

COMMENT ON TRIGGER quotation_lines_pack_held_trg ON public.quotation_lines IS
  'ยามเลขแพ็ค T1 (0410) — ไม่ปฏิเสธ · จดใบที่เสียบรรทัดที่มีเลขแพ็คให้ T2 อ่านในทรานแซกชันเดียวกัน';
COMMENT ON TRIGGER quotation_lines_pack_keep_trg ON public.quotation_lines IS
  'ยามเลขแพ็ค T2 (0410) — บรรทัดหมวด 02-001 ห้ามเสียเลขแพ็คที่ใบ/ฉบับต้นทาง (สินค้าเดียวกัน) มีอยู่ (P0001 ข้อความไทย)';
COMMENT ON TRIGGER quotation_lines_pack_no_clear_trg ON public.quotation_lines IS
  'ยามเลขแพ็ค T3 (0410) — ห้ามล้างเลขแพ็คด้วย UPDATE (P0001 ข้อความไทย)';

-- ── §3 ตรวจท้าย — ไม่ครบ = RAISE ทั้งไฟล์ถอย ─────────────────────────────────────────────
DO $verify$
DECLARE
  v_n integer;
  v_trgs constant text[] := ARRAY['quotation_lines_pack_held_trg', 'quotation_lines_pack_keep_trg', 'quotation_lines_pack_no_clear_trg'];
  v_fns constant text[] := ARRAY['quotation_line_pack_held', 'quotation_line_pack_keep', 'quotation_line_pack_no_clear'];
  v_others text := current_setting('mig_0410.others', true);
  v_tables text := current_setting('mig_0410.tables', true);
  v_md5 text;
BEGIN
  -- ฟังก์ชันอื่นทุกตัวใน public เท่าต้นไฟล์ (รวมเนื้อของ save_quotation_content) · ไม่มีตัวเกิดใหม่/หาย
  IF v_others IS NULL OR v_others IS DISTINCT FROM (
    SELECT md5(COALESCE(string_agg(
             p.oid::regprocedure::text || '|' || md5(p.prosrc) || '|' || p.provolatile::text || '|' || p.prosecdef::text
               || '|' || COALESCE(p.proconfig::text, '') || '|' || COALESCE(p.proacl::text, ''),
             E'\n' ORDER BY p.oid::regprocedure::text), ''))
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND NOT (p.proname = ANY (v_fns))) THEN
    RAISE EXCEPTION 'mig_0410_verify others';
  END IF;

  -- trigger อื่นทุกตัว + คอลัมน์ / constraint / ดัชนีของ quotation_lines เท่าต้นไฟล์
  IF v_tables IS NULL OR v_tables IS DISTINCT FROM (
    SELECT md5(
      COALESCE((SELECT string_agg(t.tgrelid::regclass::text || '|' || t.tgname || '|' || t.tgenabled::text || '|' || pg_get_triggerdef(t.oid),
                                  E'\n' ORDER BY t.tgrelid::regclass::text, t.tgname)
                  FROM pg_trigger t WHERE NOT t.tgisinternal AND NOT (t.tgname = ANY (v_trgs))), '')
      || '#' || COALESCE((SELECT string_agg(a.attname || '|' || format_type(a.atttypid, a.atttypmod) || '|' || a.attnotnull::text,
                                  E'\n' ORDER BY a.attnum)
                  FROM pg_attribute a WHERE a.attrelid = 'public.quotation_lines'::regclass AND a.attnum > 0 AND NOT a.attisdropped), '')
      || '#' || COALESCE((SELECT string_agg(c.conname || '|' || c.convalidated::text || '|' || pg_get_constraintdef(c.oid), E'\n' ORDER BY c.conname)
                  FROM pg_constraint c WHERE c.conrelid = 'public.quotation_lines'::regclass), '')
      || '#' || COALESCE((SELECT string_agg(i.indexdef, E'\n' ORDER BY i.indexname)
                  FROM pg_indexes i WHERE i.schemaname = 'public' AND i.tablename = 'quotation_lines'), ''))) THEN
    RAISE EXCEPTION 'mig_0410_verify tables';
  END IF;

  -- ฟังก์ชันสามตัว: ตัวละหนึ่ง · คืน trigger · plpgsql · SECURITY INVOKER · search_path=public
  SELECT count(*) INTO v_n
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = ANY (v_fns)
     AND p.pronargs = 0 AND p.prorettype = 'trigger'::regtype
     AND p.prolang = (SELECT l.oid FROM pg_language l WHERE l.lanname = 'plpgsql')
     AND NOT p.prosecdef AND p.proconfig = ARRAY['search_path=public'];
  IF v_n <> 3 OR (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                   WHERE n.nspname = 'public' AND p.proname = ANY (v_fns)) <> 3 THEN
    RAISE EXCEPTION 'mig_0410_verify functions=%', v_n;
  END IF;

  -- สิทธิ์: PUBLIC · anon · authenticated · service_role เรียกตรงไม่ได้ทั้งสามตัว
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
               CROSS JOIN (VALUES ('public'), ('anon'), ('authenticated'), ('service_role')) AS r(role)
              WHERE n.nspname = 'public' AND p.proname = ANY (v_fns) AND has_function_privilege(r.role, p.oid, 'EXECUTE')) THEN
    RAISE EXCEPTION 'mig_0410_verify grant';
  END IF;

  -- trigger: บน quotation_lines มีแค่สามตัวนี้ · ชื่อ · BEFORE … ROW · เหตุการณ์ · คอลัมน์ของ UPDATE OF · ฟังก์ชัน · เปิดใช้ · มีเงื่อนไข WHEN
  IF (SELECT count(*) FROM pg_trigger t WHERE t.tgrelid = 'public.quotation_lines'::regclass AND NOT t.tgisinternal) <> 3 THEN
    RAISE EXCEPTION 'mig_0410_verify trigger count';
  END IF;
  SELECT count(*) INTO v_n
    FROM (VALUES ('quotation_lines_pack_held_trg', 11, 'quotation_line_pack_held', ''),
                 ('quotation_lines_pack_keep_trg', 7, 'quotation_line_pack_keep', ''),
                 ('quotation_lines_pack_no_clear_trg', 19, 'quotation_line_pack_no_clear', 'packQty')) AS e(tg, typ, fn, col)
    JOIN pg_trigger t ON t.tgname = e.tg AND t.tgrelid = 'public.quotation_lines'::regclass AND NOT t.tgisinternal
    JOIN pg_proc p ON p.oid = t.tgfoid JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
   WHERE t.tgtype = e.typ AND p.proname = e.fn AND t.tgenabled = 'O' AND t.tgqual IS NOT NULL
     AND COALESCE((SELECT string_agg(a.attname, ',' ORDER BY a.attnum) FROM pg_attribute a
                    WHERE a.attrelid = t.tgrelid AND a.attnum = ANY (t.tgattr::int2[])), '') = e.col;
  IF v_n <> 3 THEN
    RAISE EXCEPTION 'mig_0410_verify triggers=%', v_n;
  END IF;

  -- เนื้อของตัวบันทึกเนื้อหาใบเสนอราคา (ไฟล์นี้ไม่แตะ) — พิมพ์ไว้เทียบกับค่าที่ฮาร์เนสพิสูจน์ (SELECT ตรวจก่อนรัน: save_body)
  SELECT md5(p.prosrc) INTO v_md5
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public' AND p.proname = 'save_quotation_content';
  RAISE NOTICE '0410: เนื้อของ save_quotation_content md5 = % (ที่พิสูจน์บนฮาร์เนส 5e52e4e0c29a5cb8866b320d614903ba)', v_md5;
END
$verify$;

COMMIT;

NOTIFY pgrst, 'reload schema';
