import { businessDate } from '@/lib/businessDate';
import { genId } from '@/lib/id';
import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning } from '@/lib/salesPlanning';
import { ADDENDUM_DOC_TITLE, addendumEligibility, addendumLinesFromFormulas } from '@/lib/sales/contractAddenda';
import { ADDENDUM_TEMPLATE } from '@/lib/sales/contractTemplateAddendum';

export const dynamic = 'force-dynamic';

// ค่าตั้งต้นของช่องกรอกอ่านจากแม่แบบที่เดียว — แก้คำในแม่แบบแล้วใบใหม่ต้องตามทันที
const templateDefault = (key) => ADDENDUM_TEMPLATE.fields.find((field) => field.key === key)?.default || '';

// GET /api/sales-planning/contracts/[id]/addenda — บันทึกเพิ่มเติมของสัญญาใบนี้
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { response } = await loadScoped(supabase, 'sales_contracts', id, user, 'view');
  if (response) return response;

  const { data, error } = await supabase
    .from('sales_contract_addenda')
    .select('id, "docNo", "addendumNo", status, "addendumDate", "requestDocNo", "signedDate", lines')
    .eq('contractId', id)
    .order('addendumNo', { ascending: true });
  if (error) return fail(error.message, 500);
  return ok(data || []);
});

/* POST — สร้างร่างบันทึกเพิ่มเติมจากคำร้องพัฒนากลิ่นที่ปิดเรื่องแล้ว
   ⚠️ ตารางสูตร **ตรึงลงใบตั้งแต่ตอนสร้าง** — ทะเบียนสูตรแก้ทีหลังต้องไม่ไปเปลี่ยน
      กระดาษที่ลูกค้าเซ็นไปแล้ว (กติกาเดียวกับ issuedHtml) */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const { id } = await ctx.params;

  const { row: contract, response } = await loadScoped(supabase, 'sales_contracts', id, user, 'edit');
  if (response) return response;

  const body = await req.json().catch(() => ({}));
  if (!body?.requestId) return badRequest('เลือกคำร้องพัฒนากลิ่นที่ปิดเรื่องแล้วก่อน');

  const { data: request, error: requestError } = await supabase
    .from('dept_requests').select('id, "docNo", kind, status, "customerName", "customerId"')
    .eq('id', body.requestId).maybeSingle();
  if (requestError) return fail(requestError.message, 500);

  /* ⚠️ ด่าน "คำร้องนี้ถูกใช้ไปแล้ว" ต้องถามฐานตอนกด ไม่ใช่เชื่อลิสต์ที่จอโหลดไว้ —
     สองคนเปิดหน้าเดียวกันคนละจังหวะ ลิสต์ของคนที่เปิดค้างไว้ยังมีใบนั้นอยู่
     (unique index ของ mig 0282 กันอีกชั้น แต่ผู้ใช้จะเจอ error ดิบแทนข้อความที่อ่านออก) */
  let takenByDocNo = null;
  if (request?.id) {
    const { data: taken, error: takenError } = await supabase
      .from('sales_contract_addenda').select('"docNo", "addendumNo"')
      .eq('requestId', request.id).neq('status', 'cancelled').limit(1);
    if (takenError) return fail(takenError.message, 500);
    if (taken?.length) takenByDocNo = taken[0].docNo || `ร่างครั้งที่ ${taken[0].addendumNo}`;
  }

  const eligibility = addendumEligibility({ contract, request, takenByDocNo });
  if (!eligibility.ok) return fail(eligibility.reason, 409);

  // สูตรที่คำร้องนี้ผลิตออกมา — อ่านจากแถวคำร้อง (`producedFormulaId`) ไม่ใช่เดาจากชื่อ
  const { data: items, error: itemError } = await supabase
    .from('dept_request_items').select('"producedFormulaId", "producedScentId", "sortOrder"')
    .eq('requestId', request.id).order('sortOrder', { ascending: true });
  if (itemError) return fail(itemError.message, 500);

  const formulaIds = [...new Set((items || []).map((item) => item.producedFormulaId).filter(Boolean))];
  if (!formulaIds.length) {
    return fail('คำร้องนี้ยังไม่มีสูตรที่ขึ้นทะเบียนแล้ว — บันทึกเพิ่มเติมต้องมีรหัสสูตรให้อ้าง', 409);
  }
  const { data: formulas, error: formulaError } = await supabase
    .from('formulas').select('id, code, name, "formulaDate", "scentId"').in('id', formulaIds);
  if (formulaError) return fail(formulaError.message, 500);

  // เรียงตามลำดับแถวของคำร้อง ไม่ใช่ลำดับที่ฐานคืนมา
  const byId = new Map((formulas || []).map((formula) => [formula.id, formula]));
  const ordered = formulaIds.map((formulaId) => byId.get(formulaId)).filter(Boolean);

  /* ⚠️ อ่านครั้งที่ล่าสุดพลาด = ห้ามเดาว่า "ยังไม่มีเลย" แล้วออกครั้งที่ 1 ทับของเดิม
     (UNIQUE ของ mig 0282 จะกันไว้อีกชั้น แต่ผู้ใช้จะเจอ error ดิบแทนข้อความที่อ่านออก) */
  const { data: maxRow, error: maxError } = await supabase
    .from('sales_contract_addenda').select('"addendumNo"')
    .eq('contractId', contract.id).order('addendumNo', { ascending: false }).limit(1);
  if (maxError) return fail(maxError.message, 500);
  const nextNo = Number(maxRow?.[0]?.addendumNo ?? 0) + 1;

  const row = {
    id: genId('CAD'),
    contractId: contract.id,
    addendumNo: nextNo,
    status: 'draft',
    addendumDate: body.addendumDate || businessDate(),
    requestId: request.id,
    requestDocNo: request.docNo || null,
    lines: addendumLinesFromFormulas(ordered),
    fields: {
      addendumPlace: contract.fields?.contractPlace || '',
      contractorSignerName: contract.fields?.contractorSignerName || '',
      clientSignerTitle: templateDefault('clientSignerTitle'),
    },
    templateKey: ADDENDUM_TEMPLATE.key,
    team: contract.team,
    ownerId: contract.ownerId,
    ownerName: contract.ownerName,
    metadata: { contractNo: contract.contractNo, customerName: contract.customerName },
    createdBy: user.id || null,
    createdByName: user.name || null,
  };

  const { data, error } = await supabase.from('sales_contract_addenda').insert(row).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_contract_addendum',
    entityId: data.id,
    after: data,
    summary: `สร้างร่าง${ADDENDUM_DOC_TITLE} ครั้งที่ ${nextNo} ของสัญญา ${contract.contractNo}`,
    request: req,
  });
  return ok(data, 201);
});
