// ── มาตรฐาน มล./เดือนของรอบขาย (PR-C · C-D8) ──────────────────────────────────────────────
// PATCH { standardMlPerMonth: จำนวนเต็ม 1–1,000,000 | null } → 200 { term: { id, standardMlPerMonth, updatedAt }, changed }
//        · 400 ก้อนผิด/คีย์อื่นติดมา · 403 ไม่ใช่ TS ที่แก้ได้ · 404 ไม่พบรอบขาย · 409 ใบสั่งขายของรอบนี้ไม่มีผลแล้ว · 500
//
// ⭐ การเขียนเดียวของ PR-C ลง `service_zone_terms` — ทุกช่องอื่นของรอบขายเป็นภาพนิ่งจากบรรทัดขาย (mig 0392)
//   ⇒ เขียนแค่ `standardMlPerMonth` + `updatedAt` ของแถวเดียว · ไม่มี optimistic lock (ช่องเดียว · ลง audit · คนหลังชนะ)
// ⚠️ ด่านจริงคือ `requireService({ edit: true })` = `canEditService` (ถือ service:edit **และ** เป็นคนในโมดูล)
//    proxy ปล่อยทั้ง ts (service:work) และฝ่ายขาย (service:edit ของการสร้างไซต์) มาถึงนี่ — ดู proxy.test.mjs
// ⚠️ รอบของใบที่ถูกแทน/ยกเลิก/ย้อนอนุมัติ = 409 — ค่าที่ตั้งบนรอบตายไม่มีจอไหนอ่าน (หน้าโซนรวมเฉพาะรอบที่มีผล)
//    ใบ Rev. พามาตรฐานจากรอบเดิมไปเอง (mig 0392:854-861) ⇒ ไม่มีเหตุต้องแก้ของใบเก่า
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, notFound } from '@/lib/http';
import { requireService } from '@/lib/service/sitesRepo';
import { termOrderActive } from '@/lib/service/terms';
import {
  STANDARD_ML_MESSAGES, normalizeStandardMlPatch, sameStandardMl, standardMlAuditSummary,
} from '@/lib/service/termStandardMl';

export const dynamic = 'force-dynamic';

const pickTerm = (row) => ({ id: row.id, standardMlPerMonth: row.standardMlPerMonth ?? null, updatedAt: row.updatedAt ?? null });

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  try {
    const access = requireService({ user, edit: true });
    if (access.response) return access.response;

    const { value, error } = normalizeStandardMlPatch(await req.json().catch(() => null));
    if (error) return badRequest(error);

    // ตารางติดเพดานแถว (check:rowcap) — อ่านด้วย primary key แถวเดียวเสมอ
    const { data: term, error: termError } = await supabase
      .from('service_zone_terms').select('*').eq('id', id).maybeSingle();
    if (termError) return fail(termError.message, 500);
    if (!term) return notFound(STANDARD_ML_MESSAGES.notFound);

    /* ใบแม่ + โซน อ่านก่อนเขียนเสมอ — อ่านพลาด = 500 โดยยังไม่แตะแถว
       ⚠️ คอลัมน์ระบุชื่อ · ค้นด้วย id · กรองสถานะใน JS (termOrderActive) — ไม่เป็นผู้ต้องสงสัยของยามเงินใบย้อนหลัง */
    const [orderRes, zoneRes] = await Promise.all([
      supabase.from('sales_orders')
        .select('id, "orderNumber", status, "supersededById"')
        .eq('id', term.salesOrderId)
        .maybeSingle(),
      supabase.from('service_zones').select('id, code, name').eq('id', term.zoneId).maybeSingle(),
    ]);
    const { data: order, error: orderError } = orderRes;
    if (orderError) return fail(orderError.message, 500);
    const { data: zone, error: zoneError } = zoneRes;
    if (zoneError) return fail(zoneError.message, 500);
    if (!termOrderActive(order)) return conflict(STANDARD_ML_MESSAGES.orderDead);

    // ค่าเดิม = ไม่เขียน ไม่ลง audit (กดบันทึกซ้ำจากสองแท็บไม่ทิ้งแถวขยะ)
    if (sameStandardMl(term.standardMlPerMonth, value)) {
      return ok({ term: pickTerm(term), changed: false });
    }

    const { data: saved, error: updateError } = await supabase
      .from('service_zone_terms')
      .update({ standardMlPerMonth: value, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select('id, "standardMlPerMonth", "updatedAt"')
      .single();
    if (updateError) return fail(updateError.message, 500);

    await recordAudit({
      user, action: 'update', entityType: 'service_zone_term', entityId: id,
      before: term, after: { ...term, ...saved },
      summary: standardMlAuditSummary({
        before: term.standardMlPerMonth,
        after: saved.standardMlPerMonth,
        zoneLabel: zone?.code || zone?.name || term.zoneId,
        orderNumber: order?.orderNumber || null,
      }),
      request: req,
    });
    return ok({ term: pickTerm(saved), changed: true });
  } catch (e) {
    return fail(e.message, 500);
  }
});
