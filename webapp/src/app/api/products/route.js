import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canApproveMasterData, canUser, redactProductMargin } from '@/lib/permissions';
import { registrationStatusOf } from '@/lib/excise/recommendation';
import { categoryOf, categoryFlagsOf, activeProductTypeError } from '@/lib/master/productTypes';
import { recordAudit } from '@/lib/audit';
import { chatCard, sendChat } from '@/lib/chat';
import { recordProductPriceHistory } from '@/lib/master/priceHistory';

export const dynamic = 'force-dynamic';
// Approval gate: by default GET returns only APPROVED products, so downstream
// consumers (excise registration, PM pickers, order lines) never see a pending
// row. The management page passes ?manage=1 to see all statuses.
export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const url = new URL(request.url);
  const manage = url.searchParams.get('manage') === '1';
  // A PM project is bound to one customer, and that customer's FGs may have been
  // registered by a DIFFERENT team (product.team = creator's team, not the
  // customer's). Scoping by customerId therefore intentionally BYPASSES team
  // scope so the project product-picker can see all of its customer's FGs.
  // The approval gate + isActive filter + margin redaction below still apply.
  const customerId = url.searchParams.get('customerId');

  let query = supabase.from('products').select('*').order('createdAt', { ascending: false });
  if (customerId) query = query.eq('customerId', customerId);
  // NO team scope on read (มติ 2026-07-20): the FG catalog is shared master data,
  // like product_types. `product.team` records who CREATED the row, not who owns
  // the product — the owner is the customer — so scoping reads by it hid FGs from
  // the very teams selling them. That mismatch already forced the ?customerId=
  // bypass above (a443cbe) for the PM picker; scoping the list view had the same
  // bug with no escape hatch. Confidentiality is handled where it belongs:
  // redactProductMargin strips cost/margin below, and writes stay team-scoped via
  // editScope in POST/PATCH.
  // Treat legacy NULL as approved (pre-0027 rows). Filter only outside manage view.
  if (!manage) query = query.or('approvalStatus.eq.approved,approvalStatus.is.null');

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // Hide retired (isActive=false) products from downstream pickers; keep them in
  // the management view. Filtered in JS so it stays resilient before migration
  // 0036 runs (missing column reads as undefined → treated as active).
  const rows = manage ? (data || []) : (data || []).filter((p) => p.isActive !== false);
  // สถานะขึ้นทะเบียนสรรพสามิตสรุปราย FG ('none'|'in_progress'|'approved') สำหรับ
  // ตัวกรองหน้า list — ข้อมูลทะเบียนเป็นความลับของระบบภาษี จึงแนบเฉพาะผู้ที่เห็น
  // ระบบภาษี (history:view เหมือน lib/master/relations); role อื่นไม่ได้ field นี้เลย
  // (UI ใช้การมี field เป็นสัญญาณซ่อนตัวกรอง). โหลดชุดเดียวด้วย .in() — ห้าม N+1.
  if (rows.length && canUser(user, 'history:view')) {
    const { data: regRows, error: regError } = await supabase
      .from('excise_registrations')
      .select('id, productId, status')
      .in('productId', rows.map((p) => p.id));
    if (regError) return Response.json({ error: regError.message }, { status: 500 });
    const byProduct = new Map();
    for (const r of regRows || []) {
      if (!byProduct.has(r.productId)) byProduct.set(r.productId, []);
      byProduct.get(r.productId).push(r);
    }
    for (const p of rows) p.registrationStatus = registrationStatusOf(byProduct.get(p.id));
  }
  // Strip the confidential cost breakdown/profit for non-margin roles.
  return Response.json(rows.map((p) => redactProductMargin(user, p)));
}

export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();

  // FG always belongs to a customer (selected in the create form).
  if (!body.customerId) return Response.json({ error: 'กรุณาเลือกลูกค้าเจ้าของสินค้า' }, { status: 400 });
  const { data: customer } = await supabase
    .from('customers').select('*').eq('id', body.customerId).maybeSingle();
  if (!customer) return Response.json({ error: 'ไม่พบลูกค้าที่เลือก' }, { status: 404 });

  // Duplicate FG Code check
  const { data: dup } = await supabase
    .from('products')
    .select('id')
    .eq('fgCode', body.fgCode)
    .maybeSingle();
  if (dup) {
    return Response.json({ error: 'รหัสสินค้า (FG Code) นี้ถูกขึ้นทะเบียนในระบบแล้ว' }, { status: 409 });
  }

  const { fgCode, volume, costPrice, retailPriceIncVat } = body;
  // ราคาผลิต/ราคาขายปลีก เป็น optional — เก็บ null ไว้ตามจริง แต่ในการคำนวณ
  // ภาษี/ต้นทุน ให้ถือว่า 0 เพื่อกัน NaN เมื่อยังไม่ได้กรอกราคา.
  const costPriceNum = costPrice == null || costPrice === '' ? 0 : Number(costPrice);
  const retailPriceIncVatNum =
    retailPriceIncVat == null || retailPriceIncVat === '' ? 0 : Number(retailPriceIncVat);
  // Every FG belongs to a customer (chosen at creation). customerName is a
  // snapshot taken server-side so the catalog row is stable even if the
  // customer is later renamed. Category is derived from the FG code.
  const categoryCode = body.categoryCode || categoryOf(fgCode);
  const categoryError = await activeProductTypeError(categoryCode);
  if (categoryError) return Response.json({ error: categoryError }, { status: 400 });

  // Taxability is auto-derived from the category's isExcise flag (mig 0131 —
  // not re-parsed from fgCode, and no hardcoded category code), but LG may
  // override it.
  const autoTaxable = (await categoryFlagsOf(categoryCode)).isExcise;
  const taxableOverride =
    typeof body.taxableOverride === 'boolean' ? body.taxableOverride : null;
  const isExciseTaxable = taxableOverride === null ? autoTaxable : taxableOverride;

  const retailPriceExVat = isExciseTaxable ? retailPriceIncVatNum / 1.07 : 0;
  const exciseTax = isExciseTaxable ? retailPriceExVat * 0.08 : 0;
  const localTax = isExciseTaxable ? exciseTax * 0.1 : 0;

  const factoryPrice = costPriceNum;
  const laborCost = volume >= 30 ? 5 : 2;
  const shippingCost = 1;
  const materialCost = factoryPrice * 0.65;
  const factoryProfit = factoryPrice - materialCost - laborCost - shippingCost;

  // AE / AC / Senior AE creations land as 'pending' — only AE Supervisor approves
  // (admin = sysadmin break-glass). Approvers auto-approve their own.
  const nowIso = new Date().toISOString();
  const autoApprove = canApproveMasterData(user?.role);

  // Whitelist the catalog fields we accept from the form (don't spread the
  // whole body — keeps stray status values out of the master row).
  const newProduct = {
    // Collision-proof id (was 'PRD-'+last-6-ms, repeated every ~16.7 min with
    // no DB unique). Mirrors customers (migration 0031/0035).
    id: 'PRD-' + randomUUID(),
    fgCode,
    customerId: customer.id,
    customerName: customer.name,
    productDescription: body.productDescription ?? null,
    productDescriptionEn: body.productDescriptionEn ?? null, // ชื่อสินค้า EN (0059)
    brandName: body.brandName ?? null,
    brandNameEn: body.brandNameEn ?? null, // snapshot EN ของแบรนด์ (0059)
    // ข้อมูลสูตร (0112) — optional ทั้งชุด: FG ที่ไม่มีสูตร (กล่อง/บรรจุภัณฑ์) ก็สร้างได้
    formulaName: body.formulaName?.trim() || null,
    formulaCode: body.formulaCode?.trim() || null,
    formulaDate: body.formulaDate || null,
    volume,
    volumeUnit: body.volumeUnit || 'ml',
    // หน่วยขายที่แสดงบนใบเสนอราคา/ใบสั่งขาย (0146) — ต่างจาก volumeUnit (ปริมาตรบรรจุ)
    saleUnit: body.saleUnit?.trim() || 'ชิ้น',
    // ชิ้นต่อลัง (ตัวแปลงหน่วยฝั่งสหมิตร, migration 0075) — optional, null = ยังไม่ตั้ง.
    piecesPerCase:
      body.piecesPerCase == null || body.piecesPerCase === '' ? null : Number(body.piecesPerCase),
    costPrice: costPrice == null || costPrice === '' ? null : costPriceNum,
    retailPriceIncVat:
      retailPriceIncVat == null || retailPriceIncVat === '' ? null : retailPriceIncVatNum,
    taxableOverride,
    isExciseTaxable,
    retailPriceExVat,
    exciseTax,
    localTax,
    laborCost,
    shippingCost,
    materialCost,
    factoryProfit,
    categoryCode: categoryCode ?? null,
    isActive: true, // สินค้าใหม่ใช้งานอยู่เสมอ (migration 0036)
    metadata: body.metadata || {},
    // Ownership comes from the server-side identity, not the client body.
    team: user?.team ?? null,
    ownerId: user?.id ?? null,
    assignee: body.assignee || user?.name || 'Sales',
    // Approval workflow (migration 0027).
    approvalStatus: autoApprove ? 'approved' : 'pending',
    submittedBy: user?.id ?? null,
    submittedByName: user?.name ?? null,
    approvedBy: autoApprove ? (user?.id ?? null) : null,
    approvedByName: autoApprove ? (user?.name ?? null) : null,
    approvedAt: autoApprove ? nowIso : null,
    createdAt: nowIso,
  };

  const { data, error } = await supabase.from('products').insert(newProduct).select().single();
  if (error) {
    // Unique violation (migration 0035) — a concurrent insert beat the app-level
    // dup check, or fgCode already exists.
    if (error.code === '23505') {
      return Response.json({ error: 'รหัสสินค้า (FG Code) นี้ถูกขึ้นทะเบียนในระบบแล้ว' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  await recordProductPriceHistory({
    user,
    productId: data.id,
    after: data,
    changeType: 'create',
    metadata: { fgCode: data.fgCode, customerId: data.customerId },
  });
  await recordAudit({ user, action: 'create', entityType: 'product', entityId: data.id, after: data, request });

  // แจ้งผู้อนุมัติเมื่อมีสินค้าใหม่ค้างรออนุมัติ (AE Supervisor สร้างเอง = approved ไม่ต้องแจ้ง)
  if (data.approvalStatus === 'pending') {
    sendChat('approvals', chatCard({
      title: '📦 สินค้าใหม่รออนุมัติ',
      subtitle: data.productDescriptionEn || data.productDescription || data.fgCode,
      rows: [
        { label: 'FG Code', value: data.fgCode },
        { label: 'ลูกค้า', value: data.customerName },
        { label: 'ทีม', value: data.team },
        { label: 'ผู้เพิ่ม', value: data.submittedByName },
      ],
      linkPath: '/database/products',
    }));
  }

  return Response.json(data, { status: 201 });
}
