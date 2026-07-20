// เชื่อม PO สหมิตรเข้า "โครงการเดิม" ที่ผู้ใช้เลือก (มติ 2026-07-20) — ทางเลือกคู่กับ
// create-project (สร้างใหม่). mirror ฝั่งขาย deals/[id]/link-project: ตั้ง projectId +
// ต่อ timeline segment. เพิ่มการรวมสินค้าเข้า project_products (re-order ต้องมี qty ครบ).
// ท่อถัดไป (settle-deal → QT → SO) ทำงานเหมือนเดิมทันทีที่ PO มี projectId.
import { getSahamitContext, sahamitError, loadSahamitProducts, indexByFgCode } from '@/lib/sahamit/server';
import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { can } from '@/lib/permissions';
import { buildAppendedTasks, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { applyAutoStatuses } from '@/lib/pm/status';
import { loadProject } from '@/lib/pm/projectsRepo';
import { loadWorkflowTemplateForGeneration, WorkflowTemplateError } from '@/lib/admin/workflowTemplates';

export const dynamic = 'force-dynamic';

function toQty(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

async function loadPoWithLines(supabase, customerId, id) {
  const { data: po, error } = await supabase
    .from('sahamit_pos').select('*').eq('id', id).eq('customerId', customerId).maybeSingle();
  if (error) throw error;
  if (!po) return null;
  const { data: lines, error: lineError } = await supabase
    .from('sahamit_po_lines').select('*').eq('poId', po.id).eq('customerId', customerId);
  if (lineError) throw lineError;
  return { ...po, lines: lines || [] };
}

export async function POST(request, { params }) {
  const ctx = await getSahamitContext();
  if (!ctx.ok) return sahamitError(ctx);
  const { supabase, customerId, user } = ctx;
  if (!can(user.role, 'pm:edit')) return Response.json({ error: 'forbidden' }, { status: 403 });

  const { id } = await params;
  const po = await loadPoWithLines(supabase, customerId, id);
  if (!po) return Response.json({ error: 'PO not found' }, { status: 404 });

  // idempotent: PO ผูกโครงการแล้ว → คืนโครงการเดิม (ไม่เชื่อมซ้ำ)
  if (po.projectId) {
    const existing = await loadProject(supabase, po.projectId);
    if (existing) return Response.json({ project: existing, reused: true });
  }

  const body = await request.json().catch(() => ({}));
  const projectId = String(body.projectId || '').trim();
  if (!projectId) return Response.json({ error: 'ต้องระบุโครงการที่จะเชื่อม' }, { status: 400 });

  // โครงการต้องมีจริงและเป็นของลูกค้าสหมิตรรายเดียวกัน (กันเชื่อมข้ามลูกค้า)
  const project = await loadProject(supabase, projectId);
  if (!project) return Response.json({ error: 'ไม่พบโครงการ' }, { status: 404 });
  if (project.customerId !== customerId) {
    return Response.json({ error: 'โครงการนี้ไม่ใช่ของลูกค้าสหมิตร — เชื่อมข้ามลูกค้าไม่ได้' }, { status: 400 });
  }

  const activeLines = (po.lines || []).filter((line) => line.status !== 'cancelled' && toQty(line.qty) > 0);
  if (!activeLines.length) {
    return Response.json({ error: 'PO ต้องมีบรรทัดที่ใช้งานอย่างน้อย 1 รายการก่อนเชื่อมโครงการ' }, { status: 400 });
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
    return Response.json({ error: 'ไม่มี FG บน PO ที่ตรงกับข้อมูลสินค้า' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const startDate = body.startDate || po.receivedDate || po.docDate || todayStr();

  // สร้าง timeline segment ของ PO ไว้ในหน่วยความจำก่อน (validate ก่อนเขียน) — dealId=null
  // เพราะดีลยังไม่ถูกยืนยัน (ทำที่ขั้น settle-deal ถัดไป) เหมือน create-project
  setHolidays([...(await holidaySet())]);
  let templateOptions;
  try {
    templateOptions = await loadWorkflowTemplateForGeneration(supabase, 'RE-ORDER');
  } catch (templateError) {
    return Response.json({ error: templateError.message || 'cannot load Workflow Template' }, {
      status: templateError instanceof WorkflowTemplateError ? templateError.status : 500,
    });
  }
  const { data: existingTasks } = await supabase
    .from('project_tasks').select('id, stepOrder').eq('projectId', project.id);
  const segTasks = applyAutoStatuses(buildAppendedTasks(project, {
    dealType: 'RE-ORDER',
    dealId: null,
    startDate,
    existingTasks: existingTasks || [],
    ...templateOptions,
  }));
  // 0 แถว = template RE-ORDER หลังกรองหมวดไม่เหลือขั้นตอน (บทเรียน PR #588)
  if (!segTasks.length) {
    return Response.json({ error: 'Workflow Template RE-ORDER ที่เผยแพร่อยู่ไม่มีขั้นตอน — ตรวจการตั้งค่าที่ /settings/workflow-templates' }, { status: 400 });
  }

  // ── เชื่อม (guarded) ก่อน แล้วค่อยเติม segment/สินค้า ──
  // ตั้ง projectId แบบ .is('projectId', null) กันเชื่อมซ้ำ/แข่งกัน (แพ้ = มีคนเชื่อมไปแล้ว)
  const { data: updatedPo, error: linkError } = await supabase
    .from('sahamit_pos')
    .update({ projectId: project.id, updatedAt: now })
    .eq('id', po.id)
    .eq('customerId', customerId)
    .is('projectId', null)
    .select()
    .single();
  if (linkError) {
    if (linkError.code === 'PGRST116') {
      const latest = await loadPoWithLines(supabase, customerId, id);
      if (latest?.projectId) {
        const reused = await loadProject(supabase, latest.projectId);
        if (reused) return Response.json({ project: reused, reused: true });
      }
      return Response.json({ error: 'PO เชื่อมโครงการอื่นไปแล้ว' }, { status: 409 });
    }
    return Response.json({ error: linkError.message }, { status: 500 });
  }

  // ต่อ timeline segment ของ PO เข้าโครงการเดิม (best-effort หลังเชื่อม — segment ขาด
  // ไม่บล็อกท่อ QT; โครงการมี timeline เดิมอยู่แล้ว)
  const { error: taskError } = await supabase.from('project_tasks').insert(segTasks);
  if (taskError) {
    return Response.json({ error: `เชื่อมโครงการแล้วแต่ต่อไทม์ไลน์ไม่สำเร็จ: ${taskError.message}` }, { status: 500 });
  }

  // รวมสินค้า PO เข้า project_products ของโครงการเดิม (dedupe ตาม productId — มีแล้วบวก qty)
  const productQty = new Map();
  for (const { line, product } of knownLines) {
    productQty.set(product.id, (productQty.get(product.id) || 0) + toQty(line.qty));
  }
  const { data: currentPP } = await supabase
    .from('project_products').select('id, productId, orderQty, productionQty').eq('projectId', project.id);
  const ppByProduct = new Map((currentPP || []).map((r) => [r.productId, r]));
  const toInsert = [];
  for (const [productId, qty] of productQty.entries()) {
    const existingPP = ppByProduct.get(productId);
    if (existingPP) {
      await supabase.from('project_products').update({
        orderQty: String((Number(existingPP.orderQty) || 0) + qty),
        productionQty: String((Number(existingPP.productionQty) || 0) + qty),
      }).eq('id', existingPP.id);
    } else {
      toInsert.push({ id: genId('PP'), projectId: project.id, productId, orderQty: String(qty), productionQty: String(qty) });
    }
  }
  if (toInsert.length) await supabase.from('project_products').insert(toInsert);

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sahamit_po',
    entityId: po.id,
    summary: `เชื่อม PO ${po.poNumber} เข้าโครงการเดิม ${project.code || project.id} (${knownLines.length} รายการ)`,
    request,
  });

  return Response.json({ project, po: updatedPo, linked: true });
}
