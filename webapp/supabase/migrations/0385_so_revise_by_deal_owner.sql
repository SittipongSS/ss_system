-- ============================================================
--  Migration 0385: ออก Rev. ใบสั่งขายหลังย้อนการอนุมัติ — AE เจ้าของดีลกดได้ (มติผู้ใช้ 24/09/2026)
--
--  🐞 ต้นเรื่อง (prod 24/09): AE Sup ย้อนการอนุมัติ SO-26080138-0 แล้ว AE เจ้าของดีลไปต่อไม่ได้เลย —
--     ไม่มีปุ่มออก Rev. · แก้ใบเองไม่ได้ (สถานะกลางอ่านอย่างเดียว) · ยกเลิกเองไม่ได้ (งวด 1 บัญชีรับรองแล้ว)
--     ส่วน AE Sup กดออก Rev. เองก็ติดกับดัก: ใบ Rev. มีผู้กดเป็น "createdBy" ⇒ เธออนุมัติใบนั้นเองไม่ได้
--     (แบ่งแยกหน้าที่ · route + 0197) ต้องไปหาผู้จัดการคนอื่นหรือแอดมิน override
--  ⭐ สิทธิ์ผู้รีวิวคนเดียวไม่เคยมีใครตัดสิน — ติดมาจากยุคปุ่มเดียว (0161: ย้อน + ออก Rev. คลิกเดียว ดึง Actual)
--     พอ 0166 แยกเป็นสองขั้น เงื่อนไขตำแหน่งถูกก๊อปไปทั้งสองขั้น ทั้งที่ขั้นออก Rev. ไม่ขยับ Actual แล้ว
--
--  ── ทำอะไร ─────────────────────────────────────────────────────────────
--  ปะ revise_approved_sales_order_atomic (นิยามล่าสุด 0376 → ปะตำแหน่งโดย 0382) ให้ผ่านเมื่อ
--    ผู้มีอำนาจตัดสินของฝ่ายขาย (is_sales_manager_role — เหมือนเดิม) **หรือ** เจ้าของดีลของใบ ณ ตอนนี้
--  ⭐ เจ้าของดีล *ปัจจุบัน* (sales_deals."ownerId") ไม่ใช่ผู้สร้างใบ — กติกาเดียวกับการอนุมัติใบเสนอราคา (0165)
--     และการยื่นใบสั่งขาย (canSubmitSalesOrder) · ฐานอ่านเจ้าของเอง ไม่รับค่า true/false จากแอป
--  ⭐ ปะจากนิยามที่รันอยู่จริง (pg_get_functiondef) แบบ 0382 — ไม่ก๊อปเนื้อ ~200 บรรทัดมาไว้ที่นี่
--     ⇒ ก้อนย้ายงวดของ 0376 และด่านอื่นทุกตัวคงเดิมทุกตัวอักษร
--  ⛔ ไม่แตะ revoke_sales_order_approval_atomic — ย้อนการอนุมัติยังเป็นของผู้มีอำนาจตัดสินคนเดียว
--  ⛔ ไม่แตะตาราง/ข้อมูล
--
--  🛑 ต้องรัน 0382 ก่อน (เงื่อนไขที่ปะคือของ 0382) — ไม่เจอ = RAISE ทั้งไฟล์ถอยกลับ
--  ✅ รันซ้ำได้ — ปะแล้วถูกข้าม
--  ⚠️ DDL — รันมือบน Supabase SQL Editor · โค้ดขึ้นก่อนได้ (AE กดแล้วฐานยังตอบ forbidden เป็นไทยจนกว่าจะรัน)
--
--  ── ตรวจผลหลังรัน (อ่านอย่างเดียว) ─────────────────────────────────────
--  คาด: owner_rule = true · manager_rule = true
--
--   SELECT
--     strpos(p.prosrc, 'd."ownerId" = p_actor_id') > 0 AS owner_rule,
--     strpos(p.prosrc, 'public.is_sales_manager_role(p_actor_role)') > 0 AS manager_rule
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND p.proname = 'revise_approved_sales_order_atomic';
-- ============================================================

BEGIN;

DO $patch$
DECLARE
  v_old constant text := $o$NOT public.is_sales_manager_role(p_actor_role)$o$;
  v_new constant text := $n$NOT (public.is_sales_manager_role(p_actor_role) OR EXISTS (
    SELECT 1
      FROM public.sales_orders so_owner
      JOIN public.sales_deals d ON d.id = so_owner."dealId"
     WHERE so_owner.id = p_order_id
       AND d."ownerId" = p_actor_id
  ))$n$;
  v_proc record;
  v_hits int;
  v_patched int := 0;
  v_already int := 0;
BEGIN
  FOR v_proc IN
    SELECT p.oid, p.prosrc
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname = 'revise_approved_sales_order_atomic'
  LOOP
    IF strpos(v_proc.prosrc, v_new) > 0 THEN
      v_already := v_already + 1;
      CONTINUE;
    END IF;
    v_hits := (length(v_proc.prosrc) - length(replace(v_proc.prosrc, v_old, ''))) / length(v_old);
    IF v_hits <> 1 THEN
      RAISE EXCEPTION '0385: revise_approved_sales_order_atomic มีเงื่อนไขตำแหน่งของ 0382 % จุด (คาด 1) — รัน 0382 แล้วหรือยัง? ไม่ปะ', v_hits;
    END IF;
    EXECUTE replace(pg_get_functiondef(v_proc.oid), v_old, v_new);
    v_patched := v_patched + 1;
  END LOOP;
  IF v_patched = 0 AND v_already = 0 THEN
    RAISE EXCEPTION '0385: ไม่พบฟังก์ชัน revise_approved_sales_order_atomic — ไม่ปะ';
  END IF;
  RAISE NOTICE '0385: revise_approved_sales_order_atomic — ปะ % · ปะไว้แล้ว %', v_patched, v_already;
END
$patch$;

COMMIT;
