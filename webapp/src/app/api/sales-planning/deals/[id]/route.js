import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { canDeleteRecord, isSuperuser } from '@/lib/permissions';
import { loadProject, deleteProjectDeep, projectHasExciseRegistrations } from '@/lib/pm/projectsRepo';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import {
  canEditSalesPlanning,
  canViewSalesPlanning,
  dealAuditLabel,
  forecastAmount,
  inSalesEditScope,
  inSalesViewScope,
  monthKey,
  normalizeProjectType,
  normalizeStage,
  toMoney,
  toProbability,
} from '@/lib/salesPlanning';
import { buildWinPatch } from '@/lib/salesPlanningWin';
import { loadForecastDrift } from '@/lib/salesPlanningForecast';

export const dynamic = 'force-dynamic';

const selectDeal = `
  *,
  customer:customers(id, name, arCode)
`;

async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select(selectDeal).eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const deal = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบโครงการ');
  if (!inSalesViewScope(user, deal)) return forbidden();
  const forecastDrift = await loadForecastDrift(supabase, deal).catch(() => null);
  return ok({ ...deal, forecastDrift });
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const before = await loadDeal(supabase, id);
  if (!before) return notFound('ไม่พบโครงการ');
  if (!inSalesEditScope(user, before)) return forbidden();

  const body = await req.json();
  if ('title' in body && !body.title?.trim()) return badRequest('ต้องระบุชื่อโครงการ');

  const alreadyWon = ['won', 'in_project'].includes(before.stage);
  const nextStage = 'stage' in body ? normalizeStage(body.stage) : before.stage;
  const nextDepositPaid = 'depositPaid' in body ? !!body.depositPaid : !!before.depositPaid;
  if (nextStage === 'won' && !nextDepositPaid) return badRequest('Won ต้องยืนยันว่าได้รับมัดจำแล้ว');

  // ปิด Won ผ่าน PATCH ก็ต้องมีมูลค่าปิดจริง (wonValue) เหมือนปุ่มปิด Won
  const transitioningToWon = nextStage === 'won' && !alreadyWon;
  const bodyWonValue = 'wonValue' in body ? toMoney(body.wonValue, null) : undefined;
  if (transitioningToWon && (bodyWonValue == null || bodyWonValue <= 0)) {
    return badRequest('ต้องระบุมูลค่าปิดจริง (Won) มากกว่า 0');
  }

  const patch = {
    updatedAt: new Date().toISOString(),
  };
  for (const key of ['customerId', 'customerName', 'expectedCloseDate', 'depositPaid', 'lostReason', 'notes', 'ownerId', 'ownerName', 'team', 'metadata']) {
    if (key in body) patch[key] = body[key] === '' ? null : body[key];
  }
  if ('title' in body) patch.title = body.title.trim();
  if ('stage' in body) patch.stage = nextStage;
  // projectValue = มูลค่าคาดการณ์ — freeze เมื่อปิด Won แล้ว (แก้ไม่ได้อีก); ก่อน Won แก้ได้
  if ('projectValue' in body && !alreadyWon) patch.projectValue = toMoney(body.projectValue);
  // wonValue = มูลค่าปิดจริง — แก้ได้เมื่อ Won แล้ว (แก้ตัวเลขจริงย้อนหลัง)
  if (bodyWonValue != null && alreadyWon) patch.wonValue = bodyWonValue;
  if ('probability' in body || 'stage' in body) patch.probability = toProbability(body.probability ?? before.probability, nextStage);
  // เดือนพยากรณ์ (FC): ย้ายได้เฉพาะก่อนปิด Won — หลัง Won ล็อก (เดือนถูกตรึงตอนปิด
  // เพื่อวัดความแม่นยำ FC vs AT). การปิด Won จะตั้ง forecastMonth ผ่าน buildWinPatch เอง.
  if (('forecastMonth' in body || 'expectedCloseDate' in body) && !alreadyWon) {
    patch.forecastMonth = monthKey(body.forecastMonth || body.expectedCloseDate) || null;
  }
  if (nextStage === 'won') {
    Object.assign(patch, buildWinPatch({
      deal: before,
      source: 'manual',
      now: patch.updatedAt,
      // ปิด Won ใหม่ → ใช้ wonValue ที่กรอก; ที่ Won อยู่แล้ว → คงค่าเดิม (buildWinPatch fallback)
      wonValue: transitioningToWon ? bodyWonValue : (bodyWonValue ?? before.wonValue),
      projectId: before.projectId,
      metadata: 'metadata' in body ? body.metadata : {},
    }));
    if (body.confirmedAt) patch.confirmedAt = body.confirmedAt;
  }
  if (nextStage !== 'won' && 'stage' in body) patch.confirmedAt = null;
  if (nextStage !== 'lost' && 'stage' in body) patch.lostReason = null;

  // โครงการที่ backfill มาจาก PM เก่า (needsReview, stage=timeline_proposed) — เมื่อ
  // ผู้ดูแลเติมมูลค่าคาดการณ์ (projectValue>0) หรือปิด Won ด้วยมูลค่าจริง (wonValue>0)
  // ให้ปลดธง needsReview/bypassPipeline เพื่อให้เข้ายอด/FC ตามปกติ (เฟส 5).
  // ต้องคิด "หลัง" buildWinPatch: ตอนปิด Won มันเพิ่งตั้ง patch.wonValue และเขียนทับ
  // patch.metadata กลับเป็นค่าเดิม (ที่ยังมี needsReview=true) — ถ้าเช็คก่อนหน้าจะพลาด.
  const filledForecast = Number(patch.projectValue ?? before.projectValue) > 0;
  const filledWon = Number(patch.wonValue ?? before.wonValue) > 0;
  if (before.metadata?.needsReview && (filledForecast || filledWon)) {
    patch.metadata = { ...(patch.metadata || before.metadata || {}), needsReview: false, bypassPipeline: false };
  }
  // projectType (NPD/RE-ORDER) + brand — merge ทับ metadata ล่าสุดเสมอ (หลัง buildWinPatch/needsReview)
  if ('projectType' in body) {
    patch.metadata = { ...(patch.metadata || before.metadata || {}), projectType: normalizeProjectType(body.projectType) };
  }
  if ('brand' in body) {
    patch.metadata = { ...(patch.metadata || before.metadata || {}), brand: body.brand || '' };
  }

  const { data, error } = await supabase
    .from('sales_deals')
    .update(patch)
    .eq('id', id)
    .select(selectDeal)
    .single();
  if (error) return fail(error.message, 500);

  // Keep the linked PM project's name in sync with the deal title (two-way sync;
  // the project PATCH mirrors the reverse). Direct table write, no loop.
  if (before.projectId && 'title' in body && before.title !== data.title) {
    await supabase.from('projects').update({ name: data.title, updatedAt: patch.updatedAt }).eq('id', before.projectId);
  }

  if (before.stage !== data.stage) {
    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'),
      dealId: data.id,
      fromStage: before.stage,
      toStage: data.stage,
      changedBy: user.id || null,
      changedByName: user.name || null,
    });
  }

  if (before.forecastMonth !== data.forecastMonth || before.projectValue !== data.projectValue || before.probability !== data.probability) {
    await supabase.from('sales_deal_forecasts').insert({
      id: genId('DFC'),
      dealId: data.id,
      forecastMonth: data.forecastMonth || monthKey(new Date().toISOString()),
      forecastAmount: forecastAmount(data),
      probability: data.probability,
      source: 'sales',
      createdBy: user.id || null,
      createdByName: user.name || null,
    });
  }

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal',
    entityId: data.id,
    before,
    after: data,
    summary: `แก้ไข sales deal ${dealAuditLabel(data)}`,
    request: req,
  });

  return ok(data);
});

// ลบโครงการ (ดีล) = ลบทั้งสาย: ดีล + PM project + ลูกทั้งหมด (Sales เป็นแม่).
// ตารางลูกฝั่งขาย (activities/history/forecasts/quotations/forecast_lines) cascade
// เองผ่าน FK; ฝั่ง project ลบผ่าน deleteProjectDeep. กันลบเคสที่จะทำให้ยอด/ประวัติหาย.
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const before = await loadDeal(supabase, id);
  if (!before) return notFound('ไม่พบโครงการ');
  if (!inSalesEditScope(user, before)) return forbidden();

  // กันลบสิ่งที่นับเป็นยอด/มีหลักฐานทางบัญชีแล้ว (M8): โครงการที่ปิด Won,
  // หรือมาจาก PO สหมิตร (settle เข้ายอดแล้ว) — ให้ยกเลิกด้วยวิธีอื่นแทนการลบ.
  if (['won', 'in_project'].includes(before.stage) && !isSuperuser(user.role)) {
    return conflict('โครงการนี้ปิดการขาย (Won) แล้ว — ลบไม่ได้ เพราะถูกนับเป็นยอดขาย (ต้องการสิทธิ์แอดมิน)');
  }
  if (before.metadata?.sahamitPoId) {
    return conflict('โครงการนี้มาจาก PO สหมิตร — ลบไม่ได้ (จัดการที่เอกสาร PO แทน)');
  }

  // มี PM project ผูกอยู่ → ต้องมีสิทธิ์ลบ project ด้วย (กัน AE ลบดีลแล้วลาก
  // timeline ที่ทีมทำไปด้วย) + กันลบถ้ามีทะเบียนสรรพสามิต (link ไม่มี FK จะกำพร้า).
  let project = null;
  let removed = null;
  if (before.projectId) {
    project = await loadProject(supabase, before.projectId);
    if (project) {
      if (!canDeleteRecord(user, 'projects', project)) {
        return forbidden('โครงการนี้มีงานผลิต (PM) ผูกอยู่ — ต้องมีสิทธิ์ลบโครงการผลิตด้วยจึงจะลบได้');
      }
      if (await projectHasExciseRegistrations(supabase, project.id)) {
        return conflict('โครงการนี้มีทะเบียนสรรพสามิตผูกอยู่ — ยกเลิก/ลบทะเบียนก่อนจึงจะลบโครงการได้');
      }
      removed = await deleteProjectDeep(supabase, project.id).catch((e) => { throw e; });
    }
  }

  const { error } = await supabase.from('sales_deals').delete().eq('id', id);
  if (error) return fail(error.message, 500);

  if (project) {
    await recordAudit({
      user,
      action: 'delete',
      entityType: 'project',
      entityId: project.id,
      before: project,
      summary: `ลบโครงการผลิต ${project.code || project.id} (พร้อมโครงการขาย ${dealAuditLabel(before)})`,
      request: req,
    });
  }
  await recordAudit({
    user,
    action: 'delete',
    entityType: 'sales_deal',
    entityId: id,
    before,
    summary: `ลบโครงการ ${dealAuditLabel(before)}${project ? ` + งานผลิต ${project.code || project.id}` : ''}`,
    request: req,
  });
  return ok({ ok: true, deletedProject: project?.id || null, removed });
});
