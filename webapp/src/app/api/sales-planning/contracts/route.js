import { businessDate } from '@/lib/businessDate';
import { pickDocumentAddresses } from '@/lib/master/addresses';
import { customerSnapshotName } from '@/lib/master/customerName';
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
import { externalDocLaneIds, externalDocReadyIds } from '@/lib/sales/contractExternalDocs';
import { syncContractsAgainstQuotations } from '@/lib/sales/contractQuotationSync';
import { isHistoricalDeal } from '@/lib/sales/historicalOrders';

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

  const { data, error } = await fetchAllResult(() => {
    let query = supabase.from('sales_contracts').select(LIST_SELECT)
      .order('createdAt', { ascending: false })
      .order('id', { ascending: true });
    if (dealId) query = query.eq('dealId', dealId);
    return query;
  });
  if (error) return fail(error.message, 500);

  const visible = (data || []).filter((row) => row.deal && inSalesViewScope(user, row.deal));
  /* ⭐ เหลือเฉพาะฉบับล่าสุดของแต่ละสาย (mig 0280) — ทะเบียนต้องไม่โชว์ฉบับเก่าปนกับ
     ฉบับปัจจุบัน · ฉบับเก่ายังเปิดดูได้จากหน้าใบของมันเอง (ลิงก์ในสายฉบับ) */
  /* ⭐ ไล่ปิดร่างที่ใบเสนอราคาถูกปิดไปแล้ว (มติผู้ใช้ 2026-08-22) — ทำตรงนี้เพราะสถานะ
     ใบเสนอราคาเปลี่ยนได้จากทางที่โค้ดฝั่งสัญญาไม่ได้ถือมีดด้วย (RPC ของ accept/won ·
     แก้มือบนฐาน) ⇒ ไล่เฉพาะตอนออก Rev. อย่างเดียวจะมีร่างค้างที่ไม่มีวันปิด
     ⚠️ ทำก่อนคัดฉบับล่าสุด/กรองสถานะ เพราะแถวที่เพิ่งถูกยกเลิกต้องโชว์สถานะใหม่ทันที */
  const { quotationById, cancelledIds } = await syncContractsAgainstQuotations(supabase, visible, { actor: user });

  const latest = latestContractRevisions(visible)
    .map((row) => (cancelledIds.has(row.id) ? { ...row, status: 'cancelled' } : row))
    .filter((row) => !status || status === 'all' || row.status === status);
  /* ใบ external ร่างที่แนบเอกสารแล้ว = งานของ AE Sup ไม่ใช่ของเจ้าของใบอีกต่อไป
     ⭐ **ถามครั้งเดียว ใช้สองเรื่อง** (2026-09-15) — `docAttached` บอก *ทุกคน* ว่าใบแนบแล้ว
       (รางขึ้น "รอ AE Supervisor อนุมัติ" แทน "แนบเอกสาร" ซึ่งเจ้าของใบเคยเห็นค้างไว้
       ทั้งที่แนบไปแล้ว) ส่วน `docReady` ตัดสินเลนคิว
     ⚠️ **เลนต้องเท่ากับป้ายเมนูเป๊ะ** — `externalDocLaneIds` ให้ผลเท่ากับที่ตัวนับป้ายถาม
        (`externalDocReadyIds` แบบไม่เปิดธง: ผู้อนุมัติ = ทุกใบ · เจ้าของ/คนสร้าง = ใบของตัวเอง)
        ⇒ ร่างที่แนบแล้วหลุดจากเลน "ค้างอยู่กับคุณ" ของเจ้าของใบทั้งสองที่พร้อมกัน (รีวิว 25/09)
     ⚠️ ไม่ยิงเลยถ้าไม่มีใบ external ร่างในชุดนี้ (เงื่อนไขอยู่ในตัวหาเอง) */
  const docAttached = await externalDocReadyIds(supabase, latest, user, { anyViewer: true });
  const docReady = externalDocLaneIds(latest, docAttached, user);

  const rows = latest
    // เนื้อเอกสารที่ตรึงไว้หนักและไม่มีใครใช้ในลิสต์ — ตัดออกก่อนส่ง
    .map(({ issuedHtml, ...row }) => ({
      ...row,
      hasIssuedDocument: !!issuedHtml,
      // ⚠️ ส่ง `user` ทั้งก้อน ไม่ใช่แค่ id — เลนผู้รับรอง (AE Sup) อ่านบทบาท
      _waitingOnMe: isContractWaitingOnMe(row, {
        userId: user.id, user, externalDocReady: docReady.has(row.id),
      }),
      // รางของใบ external อ่านธงนี้ — แนบแล้วคือรอผู้อนุมัติ ไม่ใช่รอเจ้าของไปแนบ
      _externalDocReady: docAttached.has(row.id),
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

  /* ⭐ ดีลของใบสั่งขายย้อนหลัง (mig 0360) — สัญญาของงานที่ขายนอกระบบคือ PO/อีเมล/สัญญาเก่าที่ลูกค้าเซ็นมาแล้ว
     ⇒ รับเฉพาะสาย external ชนิดบริการ · ไม่มีใบเสนอราคาให้อ้าง (quotationId ว่าง)
     ⚠️ ช่วงมีผลต้องครอบวันที่ใบ — ตรวจตอนผูกกับใบ (serviceContractLinkError) ไม่ใช่ตอนสร้าง */
  const historical = isHistoricalDeal(deal);
  if (historical && (!external || body.kind !== 'service')) {
    return fail('ดีลของใบสั่งขายย้อนหลังออกได้เฉพาะเอกสารแทนสัญญา ชนิดบริการ', 409);
  }

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
  const quotation = historical
    ? null
    : (body.quotationId
      ? approved.find((q) => q.id === body.quotationId)
      : approved.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0]);
  if (!historical && !quotation) return fail('ใบเสนอราคาที่เลือกยังไม่ผ่านการอนุมัติ', 409);

  const customerId = quotation?.customerId || deal.customerId || null;
  const { data: customer } = customerId
    ? await supabase.from('customers')
      .select('id, name, "nameEn", "taxId", address, addresses, "shippingAddress", "branchCode"')
      .eq('id', customerId).maybeSingle()
    : { data: null };

  /* ⚠️ ที่อยู่บนสัญญาต้องมาจากทางเดียวกับใบเสนอราคา — คอลัมน์ `customers.address`
     เป็นแค่ "กระจก" ของที่อยู่หลักยุคเก่า ซึ่งของจริงมีทั้งชื่อบริษัทปนอยู่ในนั้นและ
     ตำบล/อำเภอ/จังหวัดซ้ำสองรอบ ⇒ สัญญาพิมพ์ที่อยู่คนละแบบกับใบเสนอราคาของตัวเอง
     ลำดับ: ที่อยู่ที่ **ใบเสนอราคาใบนั้นออกบิล** → ที่อยู่ออกบิลหลักของลูกค้า → กระจกเดิม */
  const billing = pickDocumentAddresses(customer || {}).snapshot.billingAddress;
  const contractCustomer = customer
    ? { ...customer, address: quotation?.billingAddress || billing || customer.address || '' }
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
    quotationId: quotation?.id || null,
    customerId,
    // ชื่อลูกค้าบนสัญญา = สำเนา ณ วันที่ทำ ไม่ซิงก์ตามทะเบียนภายหลัง
    customerName: customerSnapshotName(customer) || quotation?.customerName || deal.customerName || null,
    contractDate: body.contractDate || businessDate(),
    /* 🔴 **ใบ external ไม่กิน `fields` ของแม่แบบ** — ช่องพวกนี้คือ *ช่องเติมของเอกสารที่
       ระบบเจน* ไม่ใช่ข้อมูลของสัญญา · ของเดิมเรียกโดยไม่ดู `source` ⇒ ใบ external ชนิด
       `scent_design` ได้ค่าชื่อ/เลขทะเบียน/ที่อยู่ + ค่าตั้งต้นครบทุกช่องตั้งแต่วันสร้าง
       แล้วเส้นพิมพ์ก็เรนเดอร์ "สัญญา" ที่ดูสมบูรณ์ออกมาโดยไม่มีใครตกลงด้วยสักบรรทัด
       · `templateKey` ก็ต้องว่าง — ใบนี้ไม่ได้อ้างแม่แบบใบไหน เอกสารของมันคือไฟล์ที่แนบ
       ⚠️ **ไม่ได้ปิดไม่ให้ external เลือกชนิดที่มีแม่แบบ** โดยเจตนา — PO ของลูกค้าครอบงาน
          ออกแบบกลิ่นได้จริง · ชนิดบอกว่า *สัญญาครอบงานอะไร* ไม่ได้บอกว่าเนื้อมาจากไหน */
    fields: external
      ? {}
      : contractFieldDefaults(body.kind, { customer: contractCustomer, quotation, current: body.fields || {} }),
    templateKey: external ? null : body.kind,
    team: deal.team || null,
    ownerId: deal.ownerId || user.id || null,
    ownerName: deal.ownerName || user.name || null,
    notes: body.notes || null,
    metadata: {
      dealTitle: deal.title || null,
      dealCode: deal.code || null,
      projectCode: project?.code || null,
      quoteNumber: quotation?.quoteNumber ?? null,
      quoteTotal: quotation?.totalAmount ?? null,
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
