-- 0434 — ถอดด่าน "ต้องมีโครงการ" ตอนปิด Won และตอนยื่น/อนุมัติใบสั่งขาย (ถอดโครงการ รอบ P1)
--
--  แผน: docs/customer-hub-plan.md หมวด "งวดงาน — ถอดโครงการ (ทาง ก.)" · มติเจ้าของ 13/11/2026 ข้อ 5
--  · โครงการไม่มีใครใช้เป็นโครงการ (prod 13/11: 342 ใบ · ปิดแล้ว 0 · ของเข้า 0 · เตรียมส่ง 0 · ข้อความคนพิมพ์ 1)
--    แต่ฝ่ายขายยังถูกบังคับเลือกโครงการสองจุด ⇒ รอบนี้ถอดสองจุดนั้น ไม่ลบข้อมูล ไม่แตะตาราง
--  · ปะสามจุดบน RPC ตัวที่รันจริง:
--      P1a `accept_quotation_atomic` (0361 + ปะ 0388) — `RAISE EXCEPTION 'deal_project_required'`
--      P1b `submit_sales_order_with_signature_evidence_atomic` (0197 + 0382 + ปะ 0416/E1) — ใบไม่มีโครงการ = "ไม่ครบ"
--      P1c `approve_sales_order_with_signature_evidence_atomic` (ชุดเดียวกับ P1b)
--  · ไม่แตะ `create_sales_order_draft` — ยังก๊อป `d."projectId"` (ดีลใหม่ไม่มีโครงการ = ว่าง) ·
--    🔴 ไม่ล้าง/ไม่เขียนทับ `sales_orders."projectId"` ของใบเดิม — ค่านี้อยู่ในลายนิ้วมืออนุมัติ SO
--    (`salesOrderApprovalContent` · 362 ใบ) ล้างเมื่อไรลายนิ้วมือไม่ตรงทั้งชุด
--
--  🛑 ลำดับขึ้นระบบ: **รันไฟล์นี้ก่อน deploy โค้ดของ PR นี้** — โค้ดใหม่ปิด Won ดีลที่ไม่มีโครงการได้
--     ถ้าฐานยังไม่ปะ RPC จะตอบ `deal_project_required` (400 · ไม่มีอะไรเปลี่ยน) และใบสั่งขายของดีลนั้นยื่นไม่ผ่าน
--     · รันแล้วโค้ดที่ deploy อยู่ทำงานเหมือนเดิม: route เก่ายังบังคับเลือกโครงการเองก่อนถึงฐาน
--  ⚠️ เนื้อ RPC มาจาก `pg_get_functiondef` ของตัวที่รันจริง (แบบ 0382/0404/0412/0416) — ห้ามยกเนื้อจากไฟล์เก่า:
--     ข้อความยึดต้องเจอ **ครั้งเดียวพอดี** ทั้งใน prosrc และ functiondef ไม่งั้นหยุดทั้งไฟล์ · มีป้ายของจุดนั้นแล้ว = ข้าม
--  ✅ รันซ้ำได้ (ปะแล้วข้าม)
--
--  ── ตรวจหลังรัน (อ่านอย่างเดียว) ─ คาด: patched = 3 · still_gated = 0 ──
--   SELECT
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public' AND strpos(p.prosrc, '0434/P1') > 0
--        AND p.proname IN ('accept_quotation_atomic', 'submit_sales_order_with_signature_evidence_atomic',
--                          'approve_sales_order_with_signature_evidence_atomic')) AS patched,
--    (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--      WHERE n.nspname = 'public'
--        AND (strpos(p.prosrc, 'deal_project_required') > 0
--             OR strpos(p.prosrc, 'v_order."projectId" IS NULL AND v_order.origin') > 0)) AS still_gated;
--
--  ── ถอยกลับ (ใส่ด่านคืน · ใช้ได้ตลอด แต่ดีลที่ปิด Won ไปแล้วโดยไม่มีโครงการจะติดด่านอีกครั้งตอนยื่น SO) ──
--   BEGIN;
--   DO $undo$ DECLARE r record; v_def text; BEGIN
--     FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public' AND strpos(p.prosrc, '0434/P1') > 0 LOOP
--       v_def := pg_get_functiondef(r.oid);
--       v_def := replace(v_def, '/* 0434/P1a — ไม่บังคับโครงการตอนปิด Won (มติ 13/11/2026) */',
--         'IF v_deal."projectId" IS NULL THEN RAISE EXCEPTION ''deal_project_required''; END IF;');
--       v_def := replace(v_def, '/* 0434/P1b — ใบสั่งขายไม่บังคับโครงการ (แทน 0416/E1 · มติ 13/11/2026) */',
--         'OR (v_order."projectId" IS NULL AND v_order.origin IS DISTINCT FROM ''excise'') /* 0416/E1 */');
--       EXECUTE v_def;
--     END LOOP; END $undo$;
--   COMMIT;

BEGIN;

DO $patch$
DECLARE
  v_patches constant text[][] := ARRAY[
    ARRAY['accept_quotation_atomic', '0434/P1a',
      'IF v_deal."projectId" IS NULL THEN RAISE EXCEPTION ''deal_project_required''; END IF;',
      '/* 0434/P1a — ไม่บังคับโครงการตอนปิด Won (มติ 13/11/2026) */'],
    ARRAY['submit_sales_order_with_signature_evidence_atomic', '0434/P1b',
      'OR (v_order."projectId" IS NULL AND v_order.origin IS DISTINCT FROM ''excise'') /* 0416/E1 */',
      '/* 0434/P1b — ใบสั่งขายไม่บังคับโครงการ (แทน 0416/E1 · มติ 13/11/2026) */'],
    ARRAY['approve_sales_order_with_signature_evidence_atomic', '0434/P1b',
      'OR (v_order."projectId" IS NULL AND v_order.origin IS DISTINCT FROM ''excise'') /* 0416/E1 */',
      '/* 0434/P1b — ใบสั่งขายไม่บังคับโครงการ (แทน 0416/E1 · มติ 13/11/2026) */']
  ];
  i integer;
  v_fn text;
  v_marker text;
  v_anchor text;
  v_new text;
  v_n integer;
  v_oid oid;
  v_src text;
  v_def text;
  v_src_hits integer;
  v_def_hits integer;
BEGIN
  FOR i IN 1 .. array_length(v_patches, 1) LOOP
    v_fn := v_patches[i][1];
    v_marker := v_patches[i][2];
    v_anchor := v_patches[i][3];
    v_new := v_patches[i][4];

    SELECT count(*) INTO v_n
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    IF v_n <> 1 THEN RAISE EXCEPTION 'mig_0434_patch_overload % count=%', v_fn, v_n; END IF;

    SELECT p.oid, p.prosrc INTO v_oid, v_src
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = v_fn;
    v_def := pg_get_functiondef(v_oid);

    IF strpos(v_src, v_marker) > 0 THEN
      RAISE NOTICE '0434: % % — ปะไว้แล้ว', v_fn, v_marker;
      CONTINUE;
    END IF;

    v_src_hits := (length(v_src) - length(replace(v_src, v_anchor, ''))) / length(v_anchor);
    v_def_hits := (length(v_def) - length(replace(v_def, v_anchor, ''))) / length(v_anchor);
    IF v_src_hits <> 1 OR v_def_hits <> 1 THEN
      RAISE EXCEPTION 'mig_0434_patch_anchor % % src=% def=%', v_fn, v_marker, v_src_hits, v_def_hits;
    END IF;

    EXECUTE replace(v_def, v_anchor, v_new);
    RAISE NOTICE '0434: % % — ปะแล้ว', v_fn, v_marker;
  END LOOP;

  -- ตรวจซ้ำหลังปะ: ด่านโครงการต้องไม่เหลือในสามตัวนี้
  IF EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname IN ('accept_quotation_atomic', 'submit_sales_order_with_signature_evidence_atomic',
                         'approve_sales_order_with_signature_evidence_atomic')
       AND (strpos(p.prosrc, 'deal_project_required') > 0
            OR strpos(p.prosrc, 'v_order."projectId" IS NULL') > 0)
  ) THEN
    RAISE EXCEPTION 'mig_0434_gate_still_present';
  END IF;
END
$patch$;

COMMIT;
