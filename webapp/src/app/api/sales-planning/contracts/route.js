import { businessDate } from '@/lib/businessDate';
import { pickDocumentAddresses } from '@/lib/master/addresses';
import { genId } from '@/lib/id';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { loadScoped } from '@/lib/scopedRow';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesViewScope } from '@/lib/salesPlanning';
import {
  CONTRACT_SOURCES,
  EXTERNAL_DOC_KINDS,
  contractEligibility,
  contractKindLabel,
  isContractKind,
  isContractWaitingOnMe,
  latestContractRevisions,
} from '@/lib/sales/contracts';
import { contractFieldDefaults, hasContractTemplate, MISSING_TEMPLATE_NOTE } from '@/lib/sales/contractTemplates';
import { quotationClosure } from '@/lib/sales/contractQuotationState';
import { syncContractsAgainstQuotations } from '@/lib/sales/contractQuotationSync';

export const dynamic = 'force-dynamic';

const LIST_SELECT = '*, deal:sales_deals(id, code, title, stage, dealType, team, ownerId, ownerName, customerName, projectId)';

// GET /api/sales-planning/contracts — ทะเบียนสัญญาทุกใบ (เมนู "สัญญา")
//   ?dealId=…  → เฉพาะของดีลนั้น (การ์ดในหน้าดีล)
//   ?status=…  → กรองสถานะ
// scope ตามดีลแม่เหมือนใบเสนอราคา — AE เห็นของทีมตัวเอง ผู้บริหารเห็นทั้งหมด
export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const dealId = params.get('dealId');
  const status = params.get('status');

  let query = supabase.from('sales_contracts').select(LIST_SELECT)
    .order('createdAt', { ascending: false })
    .limit(500);
  if (dealId) query = query.eq('dealId', dealId);
  const { data, error } = await query;
  if (error) return fail(error.message, 500);

  const visible = (data || []).filter((row) => row.deal && inSalesViewScope(user, row.deal));
  /* ⭐ เหลือเฉพาะฉบับล่าสุดของแต่ละสาย (mig 0280) — ทะเบียนต้องไม่โชว์ฉบับเก่าปนกับ
     ฉบับปัจจุบัน · ฉบับเก่ายังเปิดดูได้จากหน้าใบของมันเอง (ลิงก์ในสายฉบับ) */
  /* ⭐ ไล่ปิดร่างที่ใบเสนอราคาถูกปิดไปแล้ว (มติผู้ใช้ 2026-08-22) — ทำตรงนี้เพราะสถานะ
     ใบเสนอราคาเปลี่ยนได้จากทางที่โค้ดฝั่งสัญญาไม่ได้ถือมีดด้วย (RPC ของ accept/won ·
     แก้มือบนฐาน) ⇒ ไล่เฉพาะตอนออก Rev. อย่างเดียวจะมีร่างค้างที่ไม่มีวันปิด
     ⚠️ ทำก่อนคัดฉบับล่าสุด/กรองสถานะ เพราะแถวที่เพิ่งถูกยกเลิกต้องโชว์สถานะใหม่ทันที */
  const { quotationById, cancelledIds } = await syncContractsAgainstQuotations(supabase, visible, { actor: user });

  const rows = latestContractRevisions(visible)
    .map((row) => (cancelledIds.has(row.id) ? { ...row, status: 'cancelled' } : row))
    .filter((row) => !status || status === 'all' || row.status === status)
    // เนื้อเอกสารที่ตรึงไว้หนักและไม่มีใครใช้ในลิสต์ — ตัดออกก่อนส่ง
    .map(({ issuedHtml, ...row }) => ({
      ...row,
      hasIssuedDocument: !!issuedHtml,
      // ⚠️ ส่ง `user` ทั้งก้อน ไม่ใช่แค่ id — เลนผู้รับรอง (AE Sup) อ่านบทบาท
      _waitingOnMe: isContractWaitingOnMe(row, { userId: user.id, user }),
      // ป้าย "ใบเสนอราคาถูกปิด" บนทะเบียน — ใบที่ออกเลขแล้วไม่ถูกแตะ แต่ต้องเห็นว่ามีเรื่อง
      _quotationClosure: quotationClosure(quotationById.get(row.quotationId)) || null,
    }));
  return ok(rows);
});

// POST /api/sales-planning/contracts — สร้างร่างสัญญาจากดีล
//
// ⚠️ **ด่านออกสัญญาอยู่ที่นี่ด้วย ไม่ใช่แค่บนจอ** — จอซ่อนปุ่มได้ก็จริง แต่ใบที่ยิงตรง
//    เข้ามาต้องถูกปฏิเสธด้วยเหตุผลเดียวกัน (contractEligibility ตัวเดียวกันสองที่)
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const body = await req.json();
  if (!body?.dealId) return badRequest('ต้องระบุดีลของสัญญา');
  if (!isContractKind(body.kind)) return badRequest('ชนิดสัญญาไม่ถูกต้อง');

  /* ── ที่มาของสัญญา (mig 0322 · มติผู้ใช้ 2026-08-30) ────────────────────
     ⭐ **สาย external ข้ามด่านแม่แบบโดยเจตนา** — เหตุผลทั้งหมดที่มันมีอยู่คือใบที่
     *ไม่มี* แม่แบบให้เจน (สัญญาบริการยังไม่มีต้นฉบับ) แต่ของจริงลูกค้าเซ็น PO/อีเมล
     มาแล้ว ⇒ ถ้ายังบังคับ `hasContractTemplate` ทางนี้ก็ตันเหมือนเดิม ไม่มีประโยชน์
     ⚠️ ใบ generated ยังต้องมีแม่แบบเหมือนเดิมทุกประการ — ห้ามผ่อนให้ทั้งสองสาย */
  const source = CONTRACT_SOURCES.includes(body.source) ? body.source : 'generated';
  const external = source === 'external';
  if (!external && !hasContractTemplate(body.kind)) return badRequest(MISSING_TEMPLATE_NOTE);
  if (external && !EXTERNAL_DOC_KINDS.includes(body.externalDocKind)) {
    return badRequest('เลือกชนิดเอกสารที่ใช้แทนสัญญาก่อน');
  }

  const { row: deal, response } = await loadScoped(supabase, 'sales_deals', body.dealId, user, 'edit');
  if (response) return response;

  // โครงการ (สายธุรกิจ) + ใบเสนอราคาของดีล = วัตถุดิบของด่าน
  const [{ data: project }, { data: quotations, error: quoteError }] = await Promise.all([
    deal.projectId
      ? supabase.from('projects').select('id, code, line, name').eq('id', deal.projectId).maybeSingle()
      : Promise.resolve({ data: null }),
    // ⚠️ ไล่ทีละหน้า — ใบของดีลหนึ่งใบสะสมได้เรื่อย ๆ ตามจำนวน Rev.
    fetchAllResult(() => supabase.from('quotations')
      .select('id, quoteNumber, status, approvalStatus, totalAmount, customerId, customerName, createdAt, "billingAddress"')
      .eq('dealId', deal.id).order('id', { ascending: true })),
  ]);
  if (quoteError) return fail(quoteError.message, 500);

  const eligibility = contractEligibility({
    kind: body.kind, deal, project, quotations: quotations || [],
  });
  if (!eligibility.ok) return fail(eligibility.reason, 409);

  // ใบเสนอราคาที่อ้าง: ที่ผู้ใช้เลือก ถ้าไม่เลือกใช้ใบอนุมัติล่าสุด
  const approved = eligibility.quotations;
  const quotation = body.quotationId
    ? approved.find((q) => q.id === body.quotationId)
    : approved.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  if (!quotation) return fail('ใบเสนอราคาที่เลือกยังไม่ผ่านการอนุมัติ', 409);

  const customerId = quotation.customerId || deal.customerId || null;
  const { data: customer } = customerId
    ? await supabase.from('customers')
      .select('id, name, "taxId", address, addresses, "shippingAddress", "branchCode"')
      .eq('id', customerId).maybeSingle()
    : { data: null };

  /* ⚠️ ที่อยู่บนสัญญาต้องมาจากทางเดียวกับใบเสนอราคา — คอลัมน์ `customers.address`
     เป็นแค่ "กระจก" ของที่อยู่หลักยุคเก่า ซึ่งของจริงมีทั้งชื่อบริษัทปนอยู่ในนั้นและ
     ตำบล/อำเภอ/จังหวัดซ้ำสองรอบ ⇒ สัญญาพิมพ์ที่อยู่คนละแบบกับใบเสนอราคาของตัวเอง
     ลำดับ: ที่อยู่ที่ **ใบเสนอราคาใบนั้นออกบิล** → ที่อยู่ออกบิลหลักของลูกค้า → กระจกเดิม */
  const billing = pickDocumentAddresses(customer || {}).snapshot.billingAddress;
  const contractCustomer = customer
    ? { ...customer, address: quotation.billingAddress || billing || customer.address || '' }
    : null;

  const row = {
    id: genId('CTR'),
    kind: body.kind,
    status: 'draft',
    source,
    /* CHECK `sales_contracts_external_kind` บังคับให้ generated เป็น NULL —
       ส่งค่าว่างมาก็ต้องเป็น null จริง ๆ ไม่ใช่ '' ไม่งั้นฐานตีกลับ 23514 */
    externalDocKind: external ? body.externalDocKind : null,
    externalRef: external ? (String(body.externalRef || '').trim().slice(0, 200) || null) : null,
    dealId: deal.id,
    quotationId: quotation.id,
    customerId,
    // ชื่อลูกค้าบนสัญญา = สำเนา ณ วันที่ทำ ไม่ซิงก์ตามทะเบียนภายหลัง
    customerName: customer?.name || quotation.customerName || deal.customerName || null,
    contractDate: body.contractDate || businessDate(),
    fields: contractFieldDefaults(body.kind, { customer: contractCustomer, quotation, current: body.fields || {} }),
    templateKey: body.kind,
    team: deal.team || null,
    ownerId: deal.ownerId || user.id || null,
    ownerName: deal.ownerName || user.name || null,
    notes: body.notes || null,
    metadata: {
      dealTitle: deal.title || null,
      dealCode: deal.code || null,
      projectCode: project?.code || null,
      quoteNumber: quotation.quoteNumber || null,
      quoteTotal: quotation.totalAmount ?? null,
    },
    createdBy: user.id || null,
    createdByName: user.name || null,
  };

  const { data, error } = await supabase.from('sales_contracts').insert(row).select().single();
  if (error) return fail(error.message, 500);

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_contract',
    entityId: data.id,
    after: data,
    summary: `สร้างร่าง${contractKindLabel(data.kind)} ของดีล ${deal.title || deal.id}`,
    request: req,
  });
  return ok(data, 201);
});
