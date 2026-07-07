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
import { createWonDealStub, markWon } from '@/lib/salesPlanningWin';
import { monthKey } from '@/lib/salesPlanning';

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

function poReceivedAt(po, fallback) {
  return po.receivedDate ? `${po.receivedDate}T00:00:00.000Z` : fallback;
}

function lineDeliveryMonth(line, po) {
  return monthOf(line.expectedDate || line.dueDate || po.dueDate);
}

function fgSet(lines) {
  return new Set((lines || []).map((line) => String(line.fgCode || '').trim()).filter(Boolean));
}

function dealEligibleForWin(deal) {
  return !!deal && !deal.projectId && !['won', 'in_project', 'lost'].includes(deal.stage);
}

// จับคู่ดีลผ่าน junction sales_deal_forecast_lines — mapping ที่ผู้ใช้เลือกเองใน
// Phase 1 (create-sales-deal) เป็นแหล่งความจริง. นับ overlap ราย line ที่ fgCode
// ตรงกับ PO และเดือน demand อยู่ในเดือนส่งมอบของ PO.
async function findForecastDealViaJunction(supabase, customerId, deliveryMonths, poFgCodes) {
  const { data: links, error } = await supabase
    .from('sales_deal_forecast_lines')
    .select('dealId, fgCode, demandMonth')
    .eq('customerId', customerId);
  if (error) throw error;

  const overlapByDeal = new Map();
  for (const link of links || []) {
    const fg = String(link.fgCode || '').trim();
    if (!fg || !poFgCodes.has(fg)) continue;
    const month = monthKey(link.demandMonth);
    if (month && !deliveryMonths.has(month)) continue;
    overlapByDeal.set(link.dealId, (overlapByDeal.get(link.dealId) || 0) + 1);
  }
  if (!overlapByDeal.size) return null;

  const { data: deals, error: dealError } = await supabase
    .from('sales_deals')
    .select('*')
    .in('id', [...overlapByDeal.keys()]);
  if (dealError) throw dealError;

  return (deals || [])
    .filter(dealEligibleForWin)
    .map((deal) => ({ deal, score: overlapByDeal.get(deal.id) || 0 }))
    .sort((a, b) => b.score - a.score || String(a.deal.expectedCloseDate || '').localeCompare(String(b.deal.expectedCloseDate || '')))[0]?.deal || null;
}

// Fallback สำหรับดีลเก่าที่สร้างจาก sync-sales-planning (ก่อน Phase 1) ซึ่งเก็บ
// เดือน demand ไว้ใน metadata.sahamitDemandMonth ไม่มีแถวใน junction.
function scoreForecastDeal(deal, deliveryMonths, poFgCodes) {
  const meta = deal.metadata || {};
  if (meta.source !== 'sahamit-forecast') return -1;
  if (!dealEligibleForWin(deal)) return -1;
  const demandMonth = monthKey(meta.sahamitDemandMonth);
  if (!demandMonth || !deliveryMonths.has(demandMonth)) return -1;
  const dealFgCodes = Array.isArray(meta.fgCodes) ? meta.fgCodes : [];
  const overlap = dealFgCodes.filter((fg) => poFgCodes.has(String(fg || '').trim())).length;
  return overlap || 1;
}

async function findForecastDealForPo(supabase, customerId, lines, po) {
  const deliveryMonths = new Set((lines || []).map((line) => lineDeliveryMonth(line, po)).filter(Boolean));
  if (!deliveryMonths.size) return null;
  const poFgCodes = fgSet(lines);

  // 1) mapping ที่ผู้ใช้เลือกเอง (Phase 1) มาก่อนเสมอ
  const viaJunction = await findForecastDealViaJunction(supabase, customerId, deliveryMonths, poFgCodes);
  if (viaJunction) return viaJunction;

  // 2) heuristic เดิมสำหรับดีลเก่าที่ยังไม่มีแถว junction
  const { data, error } = await supabase
    .from('sales_deals')
    .select('*')
    .eq('customerId', customerId);
  if (error) throw error;
  return (data || [])
    .map((deal) => ({ deal, score: scoreForecastDeal(deal, deliveryMonths, poFgCodes) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || String(a.deal.expectedCloseDate || '').localeCompare(String(b.deal.expectedCloseDate || '')))[0]?.deal || null;
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
    const projectValue = poLineValue(activeLines, productIndex);
    const matchedDeal = await findForecastDealForPo(supabase, customer.id, activeLines, po);
    if (matchedDeal) {
      deal = await markWon({
        supabase,
        user,
        deal: matchedDeal,
        source: 'sahamit-po',
        now: poReceivedAt(po, now),
        projectValue,
        projectId: project.id,
        request,
        auditSummary: `mark Sahamit forecast deal won from PO ${po.poNumber}`,
        metadata: {
          sahamitPoId: po.id,
          poNumber: po.poNumber,
          poReceivedDate: po.receivedDate || null,
          poDueDate: po.dueDate || null,
          projectCode: project.code,
          quoteRef: po.quoteRef || null,
          wonMatchedBy: 'fc-vs-po',
        },
      });
    } else {
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
          projectValue,
          forecastMonth: po.receivedDate || po.dueDate || now,
          expectedCloseDate: po.receivedDate || po.docDate || todayStr(),
          confirmedAt: poReceivedAt(po, now),
          notes: po.note || null,
          ownerId: user.id || null,
          ownerName: user.name || null,
          team: user.team || 'KA',
          projectId: project.id,
          metadata: {
            source: 'sahamit-po',
            sahamitPoId: po.id,
            poNumber: po.poNumber,
            poReceivedDate: po.receivedDate || null,
            poDueDate: po.dueDate || null,
            projectCode: project.code,
            quoteRef: po.quoteRef || null,
            bypassPipeline: true,
          },
        },
      });
    }
    if (deal?.id) {
      await supabase
        .from('projects')
        .update({ metadata: { ...(project.metadata || {}), salesDealId: deal.id } })
        .eq('id', project.id);
    }
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
