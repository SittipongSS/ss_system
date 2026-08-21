import { genId } from '@/lib/id';
import { businessDate } from '@/lib/businessDate';
import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning } from '@/lib/salesPlanning';
import {
  canReviseContract, contractKindLabel, contractReviseBlockReason, contractRevisionKey,
} from '@/lib/sales/contracts';

export const dynamic = 'force-dynamic';

// POST /api/sales-planning/contracts/[id]/revise — ออกฉบับแก้ไข (Rev.)
//
// กติกาเดียวกับใบเสนอราคา: คัดลอกทั้งใบเป็น **ร่างใหม่** ที่ถือเลขฐานเดิมและเลขฉบับถัดไป
// ส่วนใบเดิมกลายเป็น `revised` = อ่านอย่างเดียว (ฉบับตรึงยังพิมพ์ซ้ำได้เหมือนวันที่ส่งไป)
//
// ⚠️ เลขที่ของฉบับใหม่ออกตอน "กดออกสัญญา" ไม่ใช่ตอนนี้ — ร่างไม่มีเลขที่เสมอ
//    (RPC ของ mig 0280 เห็น baseNumber แล้วจะใช้เลขฐานเดิม ไม่กินเลขรันใหม่)
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: contract, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'edit');
  if (response) return response;
  if (!canReviseContract(contract)) return fail(contractReviseBlockReason(contract), 409);

  const base = contractRevisionKey(contract);
  // เลขฉบับถัดไปดูจาก "ทั้งสาย" ไม่ใช่จากใบที่กด — กันเลขชนเมื่อมีคนออก Rev. คู่ขนาน
  const { data: siblings, error: siblingError } = await supabase
    .from('sales_contracts').select('"revisionNo"').eq('baseNumber', base)
    .order('revisionNo', { ascending: false }).limit(1);
  if (siblingError) return fail(siblingError.message, 500);
  const nextRevision = Number(siblings?.[0]?.revisionNo ?? contract.revisionNo ?? 0) + 1;

  const row = {
    id: genId('CTR'),
    kind: contract.kind,
    status: 'draft',
    dealId: contract.dealId,
    quotationId: contract.quotationId,
    customerId: contract.customerId,
    customerName: contract.customerName,
    team: contract.team,
    ownerId: contract.ownerId,
    ownerName: contract.ownerName,
    // วันที่สัญญาของฉบับแก้ไข = วันที่ออกฉบับใหม่ (ไม่ใช่วันของฉบับเดิม)
    contractDate: businessDate(),
    fields: contract.fields || {},
    templateKey: contract.templateKey,
    notes: contract.notes,
    baseNumber: base,
    revisionNo: nextRevision,
    revisedFromId: contract.id,
    metadata: { ...(contract.metadata || {}), revisedFrom: contract.contractNo || contract.id },
    createdBy: user.id || null,
    createdByName: user.name || null,
  };

  const { data: created, error: insertError } = await supabase
    .from('sales_contracts').insert(row).select().single();
  if (insertError) return fail(insertError.message, 500);

  /* ใบเดิมเป็น `revised` **หลัง** ฉบับใหม่เกิดแล้วเท่านั้น — สลับลำดับเมื่อไร ใบเดิมจะ
     กลายเป็นอ่านอย่างเดียวทั้งที่ยังไม่มีฉบับใหม่ให้ทำงานต่อ (ทางตันที่กู้เองไม่ได้) */
  const { error: markError } = await supabase.from('sales_contracts')
    .update({ status: 'revised', updatedAt: new Date().toISOString() })
    .eq('id', contract.id);
  if (markError) return fail(markError.message, 500);

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_contract',
    entityId: contract.id,
    before: contract,
    after: { ...contract, status: 'revised' },
    summary: `ออกฉบับแก้ไข${contractKindLabel(contract.kind)} ${contract.contractNo} → ฉบับที่ ${nextRevision}`,
    request: req,
  });

  const { issuedHtml, ...rest } = created;
  return ok(rest, 201);
});
