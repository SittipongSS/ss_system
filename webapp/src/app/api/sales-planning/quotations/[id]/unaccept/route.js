import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, dealAuditLabel, inSalesEditScope } from '@/lib/salesPlanning';
import { canUnacceptQuotation, normalizeUnacceptReason, unacceptReasonError } from '@/lib/sales/quotationUnaccept';
import { appendDocumentEvent } from '@/lib/sales/documentThread';
import { applyForecastSource } from '@/lib/sales/forecastSourceRepo';
import { settleProbabilityAfterUnaccept } from '@/lib/sales/dealProbability';

export const dynamic = 'force-dynamic';

const quoteSelect = '*, lines:quotation_lines(*), deal:sales_deals(id, title, stage, dealType, team, ownerId, ownerName, customerId, customerName, projectId)';

// ย้อนการรับใบเสนอราคา (มติผู้ใช้ 2026-07-21): inverse ของ accept สำหรับกรณีรับใบผิด
// ที่ยังไม่มี Sale Order — มี SO อนุมัติแล้วต้องไปทาง "ยกเลิกใบสั่งขายพร้อมย้อนสถานะ"
// (mig 0116) เพราะต้องถอนยอด Actual พร้อมกัน. ผู้สั่ง = เจ้าของดีลปัจจุบัน + ผู้มีอำนาจตัดสิน
// (มติ 24/09 · canUnacceptQuotation) + เหตุผลบังคับ 10–500 ตัวอักษร. งานจริงทั้งหมด atomic ใน
// RPC unaccept_quotation_atomic (mig 0138 → 0380 · ในฐานไม่มีด่านตำแหน่ง — ด่านอยู่ที่นี่ที่เดียว).
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const { data: before, error } = await supabase.from('quotations').select(quoteSelect).eq('id', id).maybeSingle();
  if (error) return fail(error.message, 500);
  if (!before) return notFound('ไม่พบใบเสนอราคา');
  if (!before.deal || !inSalesEditScope(user, before.deal)) return forbidden();
  // ⭐ ด่านเจ้าของดีลต้องรู้ดีลก่อน ⇒ ย้ายมาหลังโหลดใบ (เดิมเช็คตำแหน่งอย่างเดียวก่อนโหลด)
  if (!canUnacceptQuotation(user, before.deal)) {
    return forbidden('ย้อนการรับได้เฉพาะเจ้าของดีลหรือ AE Supervisor');
  }
  if (before.status !== 'accepted') return badRequest('ใบเสนอราคานี้ไม่ได้อยู่ในสถานะรับแล้ว (Won)');

  const body = await req.json().catch(() => ({}));
  const reasonProblem = unacceptReasonError(body.reason);
  if (reasonProblem) return badRequest(reasonProblem);
  const reason = normalizeUnacceptReason(body.reason);

  const { data: result, error: rpcError } = await supabase.rpc('unaccept_quotation_atomic', {
    p_quote_id: before.id,
    p_actor_id: user.id || null,
    p_actor_name: user.name || null,
    p_actor_role: user.role || null,
    p_reason: reason,
  });
  if (rpcError) {
    const message = rpcError.message || '';
    if (message.includes('sales_order_exists')) {
      return conflict('ใบนี้มี ใบสั่งขายที่ยังไม่ยกเลิก — SO ที่อนุมัติแล้วให้ใช้ "ยกเลิกใบสั่งขายพร้อมย้อนสถานะ" ที่หน้า SO; SO ร่าง/รออนุมัติให้ยกเลิก SO ก่อน');
    }
    if (message.includes('quotation_not_accepted')) return badRequest('ใบเสนอราคานี้ไม่ได้อยู่ในสถานะรับแล้ว (Won)');
    if (message.includes('deal_not_won')) return badRequest('ดีลไม่ได้อยู่สถานะ Won แล้ว — กรุณาโหลดหน้าใหม่');
    if (message.includes('unaccept_reason_invalid')) return badRequest('เหตุผลต้องมีความยาว 10–500 ตัวอักษร');
    const clientError = /quotation_not_found|deal_not_found/.test(message);
    return fail(message, clientError ? 400 : 500);
  }

  // เหตุการณ์ลงเธรดของใบ — ไม่เช็ค error โดยเจตนา (ดู submit/route.js)
  await appendDocumentEvent(supabase, {
    docType: 'quotation', doc: before, action: 'unaccept', opts: { reason }, user,
  });

  await recordAudit({
    user,
    action: 'update',
    entityType: 'quotation',
    entityId: before.id,
    before,
    after: result?.quotation,
    summary: `ย้อนการรับใบเสนอราคา ${before.quoteNumber} (เหตุผล: ${reason})`,
    request: req,
  });
  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal',
    entityId: before.deal.id,
    before: before.deal,
    after: result?.deal,
    summary: `ถอยดีล ${dealAuditLabel(before.deal)} ออกจาก Won — ย้อนการรับใบเสนอราคา ${before.quoteNumber}`,
    request: req,
  });

  /* ⭐ ยอดของดีลหลังย้อนรับใบ (มติผู้ใช้ 2026-09-16 · mig 0361) — ตอนรับใบ RPC ตั้งยอดดีล = ใบที่รับ และชี้ใบนั้น
     แต่ unaccept_quotation_atomic ไม่คืนสี่ช่องนั้น ⇒ ดีลที่กลับมาเปิดให้ตัวเลือกใบของดีลเปิดตัดสินใหม่
     best-effort: การย้อนรับใบ commit ไปแล้ว ห้ามพังเพราะยอดเขียนไม่ผ่าน แต่ก็ห้ามเงียบ —
     ส่ง `forecast` กลับไปแบบเดียวกับเส้นอนุมัติใบ (lib/sales/forecastSourceRepo: "ห้ามกลืน error เงียบ ๆ") */
  let forecast = null;
  try {
    forecast = await applyForecastSource(supabase, before.deal.id, { cause: 'unaccept' });
  } catch (forecastError) {
    console.error('forecast source apply failed', before.deal.id, forecastError);
    forecast = { changed: false, warning: forecastError.message };
  }

  /* ⭐ FC% หลังย้อนการรับใบ (มติผู้ใช้ 2026-09-25 ข้อ 3) — RPC ตั้ง FC ของดีลเป็นค่าตั้งต้นของขั้น
     (deal_probability_for_stage) ซึ่งผิดกับ NPD ที่โครงการยังมี SCENT Won ⇒ คิดใหม่ด้วยกติกา JS ตัวเดียว
     (resolveProbability) · และถ้าโครงการไม่เหลือ SCENT ที่ Won แล้ว NPD พี่น้องที่ cascade ตอนรับใบดันขึ้น 80
     กลับฐาน — เฉพาะดีลที่ไม่มีใครขยับ FC% หลัง cascade (ตัดสินจาก audit ดู lib/sales/dealProbability)
     ⚠️ ขานี้มีเฉพาะทางย้อนการรับใบ — ยกเลิก SO พร้อมย้อนสถานะ (0170) กับแอดมินลบใบบังคับ (0381) ไม่ถอยให้
        (มติ 25/09 ข้อ 4: ขอบเขตเดียวกับการเปิดใบพี่น้องคืน)
     best-effort แบบเดียวกับ cascade ขาเข้า: ย้อนรับใบ commit ไปแล้ว ⇒ ไม่ throw · ทุกแถวที่ขยับลง audit
     ⚠️ audit ลงผ่าน `record` ระหว่าง settle (หลังเขียนแต่ละแถว ก่อนขาอ่านตรวจซ้ำ) ไม่ใช่วนลงทีหลัง — คำขออื่นในโครงการ
        เดียวกันตัดสินจาก audit ระหว่างทาง (เหตุผลเต็มที่ pickUnacceptRecheck · review 25/09) */
  const probability = await settleProbabilityAfterUnaccept(supabase, result?.deal, {
    quoteNumber: before.quoteNumber,
    record: (row) => recordAudit({
      user,
      action: 'update',
      entityType: 'sales_deal',
      entityId: row.id,
      before: { probability: row.previousProbability },
      after: { probability: row.probability },
      summary: row.summary,
      request: req,
    }),
  });
  for (const warning of probability.warnings) console.error('probability after unaccept', before.deal.id, warning);

  const { data: after } = await supabase.from('quotations').select(quoteSelect).eq('id', id).maybeSingle();
  /* ⚠️ `deal` ที่ส่งกลับเป็น snapshot ของ RPC = **ก่อน** คิดยอดใหม่ · ยอดจริงหลังคิดใหม่อยู่ใน `forecast`
     (`value` / `previousValue` / `changed`) — จอโหลดหน้าใหม่เองอยู่แล้ว จึงไม่อ่านแถวดีลซ้ำที่นี่
     (การอ่านแถวเองบนตารางที่มีทะเบียนขอบเขตถูกด่าน systemRules กฎ 6 รูดเพดานอยู่) */
  return ok({ quotation: after || result?.quotation || null, deal: result?.deal || null, forecast });
});
