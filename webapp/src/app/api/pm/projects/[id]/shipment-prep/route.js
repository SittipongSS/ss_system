import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, forbidden, notFound, unauthorized, badRequest } from '@/lib/http';
import { can, viewScope, pmEditScope, inScope } from '@/lib/permissions';
import { loadProject } from '@/lib/pm/projectsRepo';

export const dynamic = 'force-dynamic';

function productDescription(product) {
  return product?.productDescriptionEn
    || product?.productDescription
    || product?.brandNameEn
    || product?.brandName
    || product?.fgCode
    || 'สินค้า';
}

function toQty(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

async function nextPrepNumber(supabase, now = new Date()) {
  const prefix = `SP-${now.getFullYear().toString().slice(-2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
  const { data } = await supabase
    .from('shipment_prep')
    .select('prepNumber')
    .ilike('prepNumber', `${prefix}%`)
    .order('prepNumber', { ascending: false })
    .limit(1);
  const last = data?.[0]?.prepNumber;
  const next = last ? (parseInt(last.slice(prefix.length), 10) || 0) + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}

async function loadPrep(supabase, projectId) {
  const { data: prep, error } = await supabase
    .from('shipment_prep')
    .select('*')
    .eq('projectId', projectId)
    .maybeSingle();
  if (error) throw error;
  if (!prep) return null;

  const { data: lines, error: lineError } = await supabase
    .from('shipment_prep_lines')
    .select('*')
    .eq('shipmentPrepId', prep.id)
    .order('sortOrder', { ascending: true });
  if (lineError) throw lineError;
  return { ...prep, lines: lines || [] };
}

async function requireProjectAccess({ user, supabase, id, edit = false }) {
  if (!user) return { response: unauthorized() };
  if (!can(user.role, 'pm:view')) return { response: forbidden() };

  const project = await loadProject(supabase, id);
  if (!project) return { response: notFound('ไม่พบโปรเจกต์') };

  if (edit) {
    if (!inScope(pmEditScope(user.role), user, project)) return { response: forbidden() };
  } else if (viewScope(user.role) === 'team' && !inScope('team', user, project)) {
    return { response: forbidden() };
  }

  return { project };
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;
  const access = await requireProjectAccess({ user, supabase, id });
  if (access.response) return access.response;

  const prep = await loadPrep(supabase, access.project.id);
  return ok({ project: access.project, shipmentPrep: prep });
});

export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  const { id } = await ctx.params;
  const access = await requireProjectAccess({ user, supabase, id, edit: true });
  if (access.response) return access.response;
  const project = access.project;

  const existing = await loadPrep(supabase, project.id);
  if (existing) return ok({ ...existing, reused: true });

  const body = await req.json().catch(() => ({}));
  const { data: links, error: linkError } = await supabase
    .from('project_products')
    .select('*, product:products(id, fgCode, productDescription, productDescriptionEn, brandName, brandNameEn, volume, volumeUnit)')
    .eq('projectId', project.id);
  if (linkError) return fail(linkError.message, 500);
  if (!links?.length) return badRequest('ต้องผูก FG ในโปรเจกต์ก่อนสร้างเอกสารเตรียมส่งของ');

  const prepId = genId('SHP');
  const prep = {
    id: prepId,
    projectId: project.id,
    projectCode: project.code || null,
    prepNumber: await nextPrepNumber(supabase),
    status: 'draft',
    customerId: project.customerId || null,
    customerName: project.customerName || null,
    dueDate: project.dueDate || null,
    remarks: body.remarks || null,
    metadata: {
      source: 'pm-project',
      projectCode: project.code || null,
      salesDealId: project.metadata?.salesDealId || null,
      quotationNumber: project.metadata?.quotationNumber || null,
      poNumber: project.metadata?.poNumber || null,
    },
    createdBy: user.id,
    createdByName: user.name || user.email || user.id,
  };

  const { data: inserted, error: insertError } = await supabase
    .from('shipment_prep')
    .insert(prep)
    .select()
    .single();
  if (insertError) {
    if (insertError.code === '23505') {
      const reused = await loadPrep(supabase, project.id);
      if (reused) return ok({ ...reused, reused: true });
    }
    return fail(insertError.message, 500);
  }

  const lineRows = links.map((row, index) => {
    const product = row.product || {};
    const qty = toQty(row.orderQty || row.productionQty);
    return {
      id: genId('SHL'),
      shipmentPrepId: prepId,
      productId: row.productId || null,
      fgCode: product.fgCode || null,
      description: productDescription(product),
      qty,
      unit: product.volumeUnit || null,
      sortOrder: index,
      metadata: {
        volume: product.volume || null,
        orderQty: row.orderQty || null,
        productionQty: row.productionQty || null,
      },
    };
  });

  const { error: lineError } = await supabase.from('shipment_prep_lines').insert(lineRows);
  if (lineError) {
    await supabase.from('shipment_prep').delete().eq('id', prepId);
    return fail(lineError.message, 500);
  }

  await recordAudit({
    user,
    action: 'create',
    entityType: 'shipment_prep',
    entityId: prepId,
    after: { ...inserted, lines: lineRows },
    summary: `สร้างเอกสารเตรียมส่งของจากโปรเจกต์ ${project.code || project.id}`.trim(),
    request: req,
  });

  return ok({ ...inserted, lines: lineRows, reused: false }, 201);
});
