import { randomUUID } from 'node:crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { viewScope, canApproveMasterData, redactProductMargin } from '@/lib/permissions';
import { categoryOf } from '@/lib/master/productTypes';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';
// Approval gate: by default GET returns only APPROVED products, so downstream
// consumers (excise registration, PM pickers, order lines) never see a pending
// row. The management page passes ?manage=1 to see all statuses.
export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const manage = new URL(request.url).searchParams.get('manage') === '1';

  let query = supabase.from('products').select('*').order('createdAt', { ascending: false });
  // Team-scoped roles only see their own team's products; 'all' sees everything.
  if (viewScope(user?.role) === 'team') query = query.eq('team', user?.team ?? null);
  // Treat legacy NULL as approved (pre-0027 rows). Filter only outside manage view.
  if (!manage) query = query.or('approvalStatus.eq.approved,approvalStatus.is.null');

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // Hide retired (isActive=false) products from downstream pickers; keep them in
  // the management view. Filtered in JS so it stays resilient before migration
  // 0036 runs (missing column reads as undefined → treated as active).
  const rows = manage ? (data || []) : (data || []).filter((p) => p.isActive !== false);
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
  // ราคาโรงงาน/ราคาขายปลีก เป็น optional — เก็บ null ไว้ตามจริง แต่ในการคำนวณ
  // ภาษี/ต้นทุน ให้ถือว่า 0 เพื่อกัน NaN เมื่อยังไม่ได้กรอกราคา.
  const costPriceNum = costPrice == null || costPrice === '' ? 0 : Number(costPrice);
  const retailPriceIncVatNum =
    retailPriceIncVat == null || retailPriceIncVat === '' ? 0 : Number(retailPriceIncVat);
  // Taxability is auto-derived from the FG code, but LG may override it.
  const autoTaxable = !!(fgCode && fgCode.includes('01-002'));
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

  // Every FG belongs to a customer (chosen at creation). customerName is a
  // snapshot taken server-side so the catalog row is stable even if the
  // customer is later renamed. Category is derived from the FG code.
  const categoryCode = body.categoryCode || categoryOf(fgCode);

  // AE / AC creations land as 'pending'; Senior AE+ auto-approve their own.
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
    brandName: body.brandName ?? null,
    volume,
    volumeUnit: body.volumeUnit || 'ml',
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
  await recordAudit({ user, action: 'create', entityType: 'product', entityId: data.id, after: data, request });
  return Response.json(data, { status: 201 });
}
