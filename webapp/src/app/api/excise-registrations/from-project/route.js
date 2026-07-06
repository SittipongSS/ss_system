import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { can, inScope, viewScope } from '@/lib/permissions';
import { loadProject } from '@/lib/pm/projectsRepo';

export const dynamic = 'force-dynamic';

function productName(product) {
  return product?.productDescriptionEn || product?.productDescription || product?.fgCode || null;
}

function brandName(product) {
  return product?.brandNameEn || product?.brandName || null;
}

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!can(user.role, 'products:edit')) return forbidden();

  const body = await req.json().catch(() => ({}));
  if (!body.projectId) return badRequest('ต้องระบุ projectId');

  const project = await loadProject(supabase, body.projectId);
  if (!project) return notFound('ไม่พบโปรเจกต์');
  if (!inScope(viewScope(user.role), user, project)) return forbidden();

  const { data: links, error: linkError } = await supabase
    .from('project_products')
    .select('*, product:products(*)')
    .eq('projectId', project.id);
  if (linkError) return fail(linkError.message, 500);
  if (!links?.length) return badRequest('โปรเจกต์นี้ยังไม่มี FG');

  const productIds = links.map((l) => l.productId).filter(Boolean);
  const { data: existing } = productIds.length
    ? await supabase
        .from('excise_registrations')
        .select('id, productId, customerId')
        .in('productId', productIds)
    : { data: [] };

  const existingKey = new Set((existing || []).map((r) => `${r.productId}:${r.customerId || project.customerId || ''}`));
  const candidate = links.find((link) => {
    const customerId = link.product?.customerId || project.customerId;
    return link.product && customerId && !existingKey.has(`${link.productId}:${customerId}`);
  });
  if (!candidate) return conflict('FG ในโปรเจกต์นี้ถูกสร้างทะเบียนภาษีไว้แล้ว หรือยังไม่มีลูกค้าเจ้าของ FG');

  const product = candidate.product;
  const customerId = product.customerId || project.customerId;
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .select('*')
    .eq('id', customerId)
    .maybeSingle();
  if (customerError) return fail(customerError.message, 500);
  if (!customer) return notFound('ไม่พบลูกค้าของ FG');

  const isExciseTaxable = product.isExciseTaxable !== false;
  const now = new Date().toISOString();
  const row = {
    id: genId('REG'),
    productId: product.id,
    customerId: customer.id,
    projectId: project.id,
    fgCode: product.fgCode,
    productName: productName(product),
    brandName: brandName(product),
    customerName: customer.name,
    taxId: customer.taxId,
    isExciseTaxable,
    taxableOverride: null,
    exciseTax: isExciseTaxable ? (product.exciseTax || 0) : 0,
    localTax: isExciseTaxable ? (product.localTax || 0) : 0,
    status: 'draft',
    team: project.team || user.team || null,
    ownerId: user.id || null,
    assignee: body.assignee || user.name || project.aeOwner || 'Sales',
    metadata: {
      productNameTh: product.productDescription || null,
      productNameEn: product.productDescriptionEn || null,
      brandNameTh: product.brandName || null,
      brandNameEn: product.brandNameEn || null,
      source: 'pm-project',
      projectCode: project.code,
      salesDealId: project.metadata?.salesDealId || null,
    },
    createdAt: now,
    updatedAt: now,
  };

  const { data, error } = await supabase
    .from('excise_registrations')
    .insert(row)
    .select()
    .single();
  if (error) {
    if (error.code === '23505') return conflict('สินค้านี้ถูกขึ้นทะเบียนให้ลูกค้ารายนี้แล้ว');
    return fail(error.message, 500);
  }

  await recordAudit({
    user,
    action: 'create',
    entityType: 'registration',
    entityId: data.id,
    after: data,
    summary: `สร้างทะเบียนภาษีจากโปรเจกต์ ${project.code} (${data.fgCode || ''})`.trim(),
    request: req,
  });

  return ok(data, 201);
});
