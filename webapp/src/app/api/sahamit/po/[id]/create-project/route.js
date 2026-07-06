import { getSahamitContext, sahamitError, loadSahamitProducts, indexByFgCode } from '@/lib/sahamit/server';
import { monthOf } from '@/lib/sahamit/po';
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { can } from '@/lib/permissions';
import { buildProjectTasks, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { generateProjectCode, loadProject } from '@/lib/pm/projectsRepo';
import { createWonDealStub } from '@/lib/salesPlanningWin';

export const dynamic = 'force-dynamic';

function toQty(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function poLineValue(lines, productIndex) {
  return (lines || []).reduce((sum, line) => {
    const product = productIndex.get(String(line.fgCode || '').trim().toLowerCase());
    const price = Number(product?.price ?? 0);
    return sum + (toQty(line.qty) * (Number.isFinite(price) ? price : 0));
  }, 0);
}

async function loadPoWithLines(supabase, customerId, id) {
  const { data: po, error } = await supabase
    .from('sahamit_pos')
    .select('*')
    .eq('id', id)
    .eq('customerId', customerId)
    .maybeSingle();
  if (error) throw error;
  if (!po) return null;

  const { data: lines, error: lineError } = await supabase
    .from('sahamit_po_lines')
    .select('*')
    .eq('poId', po.id)
    .eq('customerId', customerId);
  if (lineError) throw lineError;
  return { ...po, lines: lines || [] };
}

export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, customer, user } = ctx;
  if (!can(user.role, 'pm:edit')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const po = await loadPoWithLines(supabase, customerId, id);
  if (!po) return Response.json({ error: 'PO not found' }, { status: 404 });

  if (po.projectId) {
    const project = await loadProject(supabase, po.projectId);
    if (project) return Response.json({ project, reused: true });
  }

  const activeLines = (po.lines || []).filter((line) => line.status !== 'cancelled' && toQty(line.qty) > 0);
  if (!activeLines.length) {
    return Response.json({ error: 'PO must have at least one active line before creating a project' }, { status: 400 });
  }

  let products;
  try {
    products = await loadSahamitProducts(supabase, customerId);
  } catch (e) {
    return Response.json({ error: `cannot load product catalog: ${e.message}` }, { status: 500 });
  }

  const productIndex = indexByFgCode(products);
  const knownLines = activeLines
    .map((line) => ({ line, product: productIndex.get(String(line.fgCode || '').trim().toLowerCase()) }))
    .filter((row) => row.product?.id);
  if (!knownLines.length) {
    return Response.json({ error: 'no PO line FG exists in product master' }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const now = new Date().toISOString();
  const startDate = body.startDate || po.receivedDate || po.docDate || todayStr();
  const dueDate = body.dueDate || po.dueDate || null;
  let projectCode = await generateProjectCode(supabase);
  let project = null;
  let projectError = null;

  const firstProduct = knownLines[0].product;
  const baseRow = {
    name: body.name || `RE-ORDER Sahamit PO ${po.poNumber}`,
    customerId: customer.id,
    customerName: customer.name || null,
    type: 'RE-ORDER',
    urgency: body.urgency || 'Schedule',
    aeOwner: user.name || '',
    acOwner: '',
    status: 'New',
    startDate,
    dueDate,
    productMainCategory: firstProduct.categoryCode || '',
    productSubCategory: firstProduct.category || '',
    docNumber: '',
    productName: firstProduct.name || '',
    productCode: knownLines.map((row) => row.line.fgCode).filter(Boolean).join(', '),
    orderQty: String(activeLines.reduce((sum, line) => sum + toQty(line.qty), 0) || ''),
    productionQty: '',
    aeSupervisor: '',
    keyAccountExec: user.name || '',
    customerEmail: customer.email || '',
    preparedBy: user.name || '',
    reviewedBy: '',
    team: user.team || 'KA',
    ownerId: user.id || null,
    metadata: {
      source: 'sahamit-po',
      sahamitPoId: po.id,
      poNumber: po.poNumber,
      quoteRef: po.quoteRef || null,
      destination: po.destination || null,
      deliveryMonth: monthOf(po.dueDate),
      receivedDate: po.receivedDate || null,
      docDate: po.docDate || null,
    },
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    const projectId = genId('PRJ');
    ({ data: project, error: projectError } = await supabase
      .from('projects')
      .insert({ ...baseRow, id: projectId, code: projectCode })
      .select()
      .single());
    if (!projectError) break;
    if (projectError.code === '23505') {
      projectCode = await generateProjectCode(supabase);
      continue;
    }
    break;
  }
  if (projectError) return Response.json({ error: projectError.message }, { status: 500 });

  const productQty = new Map();
  for (const { line, product } of knownLines) {
    const prev = productQty.get(product.id) || 0;
    productQty.set(product.id, prev + toQty(line.qty));
  }
  const projectProducts = [...productQty.entries()].map(([productId, qty]) => ({
    id: genId('PP'),
    projectId: project.id,
    productId,
    orderQty: String(qty),
    productionQty: String(qty),
  }));

  const { error: ppError } = await supabase.from('project_products').insert(projectProducts);
  if (ppError) {
    await supabase.from('projects').delete().eq('id', project.id);
    return Response.json({ error: `cannot attach products to project: ${ppError.message}` }, { status: 500 });
  }

  setHolidays([...(await holidaySet())]);
  const taskRows = applyAutoStatuses(buildProjectTasks(project, project.id));
  const { data: tasks, error: taskError } = taskRows.length
    ? await supabase.from('project_tasks').insert(taskRows).select()
    : { data: [], error: null };
  if (taskError) {
    await supabase.from('projects').delete().eq('id', project.id);
    return Response.json({ error: `cannot create PM tasks: ${taskError.message}` }, { status: 500 });
  }

  const { data: updatedPo, error: linkError } = await supabase
    .from('sahamit_pos')
    .update({ projectId: project.id, updatedAt: now })
    .eq('id', po.id)
    .eq('customerId', customerId)
    .is('projectId', null)
    .select()
    .single();
  if (linkError) {
    await supabase.from('projects').delete().eq('id', project.id);
    if (linkError.code === 'PGRST116') {
      const latest = await loadPoWithLines(supabase, customerId, id);
      if (latest?.projectId) {
        const reused = await loadProject(supabase, latest.projectId);
        if (reused) return Response.json({ project: reused, reused: true });
      }
      return Response.json({ error: 'PO is already linked to a project' }, { status: 409 });
    }
    return Response.json({ error: linkError.message }, { status: 500 });
  }

  let deal = null;
  let warning = null;
  try {
    deal = await createWonDealStub({
      supabase,
      user,
      source: 'sahamit-po',
      request,
      auditSummary: `create won-deal stub from Sahamit PO ${po.poNumber}`,
      row: {
        customerId: customer.id,
        customerName: customer.name || null,
        title: `Sahamit PO ${po.poNumber}`,
        projectValue: poLineValue(activeLines, productIndex),
        forecastMonth: po.receivedDate || po.dueDate || now,
        expectedCloseDate: po.receivedDate || po.docDate || todayStr(),
        notes: po.note || null,
        ownerId: user.id || null,
        ownerName: user.name || null,
        team: user.team || 'KA',
        projectId: project.id,
        metadata: {
          source: 'sahamit-po',
          sahamitPoId: po.id,
          poNumber: po.poNumber,
          projectCode: project.code,
          quoteRef: po.quoteRef || null,
          bypassPipeline: true,
        },
      },
    });
  } catch (e) {
    warning = `cannot create won-deal stub: ${e.message}`;
  }

  await recordAudit({
    user,
    action: 'create',
    entityType: 'project',
    entityId: project.id,
    after: { ...project, tasks: tasks || [], projectProducts, sahamitPo: updatedPo, salesDeal: deal || null },
    summary: `create RE-ORDER project ${project.code} from Sahamit PO ${po.poNumber}`,
    request,
  });
  await recordAudit({
    user,
    action: 'update',
    entityType: 'sahamit_po',
    entityId: po.id,
    before: po,
    after: updatedPo,
    summary: `link Sahamit PO ${po.poNumber} to PM project ${project.code}`,
    request,
  });

  return Response.json({
    project: { ...project, tasks: tasks || [] },
    po: updatedPo,
    salesDeal: deal || null,
    warning,
    reused: false,
  }, { status: 201 });
}
