import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { dealAuditLabel, forecastAmount, monthKey, toMoney } from '@/lib/salesPlanning';

// Won คือสถานะปิดสุดท้ายของดีลเสมอ — การมี/ผูก PM project เป็นมิติงานผลิตแยกต่างหาก
// ไม่ใช่สถานะดีล (เดิมเคยยกเป็น 'in_project'). คง arg projectId ไว้เพื่อความเข้ากันได้.
export function winStageForProject(_projectId) {
  return 'won';
}

export function buildWinPatch({ deal = {}, source = 'manual', now = new Date().toISOString(), wonValue, projectValue, projectId, wonMonth, metadata = {} } = {}) {
  const nextProjectId = projectId || deal.projectId || null;
  const extraMetadata = metadata && typeof metadata === 'object' ? metadata : {};
  // เดือนที่ปิดจริง (Won) — ผู้ใช้เลือกได้ตอนกด Won เพื่อให้ยอด AT ตกเดือนที่ถูกต้อง
  // (เช่น รับมัดจำคนละเดือนกับที่กดในระบบ). เก็บใน metadata (ไม่ต้อง migration);
  // dashboard ใช้ค่านี้ก่อน confirmedAt. ตกไปใช้เดือนของ confirmedAt/ตอนนี้ถ้าไม่ส่งมา.
  const chosenWonMonth = monthKey(wonMonth);
  const patch = {
    stage: winStageForProject(nextProjectId),
    depositPaid: true,
    confirmedAt: deal.confirmedAt || now,
    probability: 100,
    updatedAt: now,
    metadata: {
      ...(deal.metadata || {}),
      ...extraMetadata,
      wonSource: source,
      wonAt: now,
      ...(chosenWonMonth ? { wonMonth: chosenWonMonth } : {}),
    },
  };

  // มูลค่าปิดจริง (actual): ใช้ wonValue ที่ส่งมา (แหล่ง manual บังคับกรอก; แหล่ง PO
  // สหมิตรส่งมูลค่าที่ PO ครอบคลุมจริง). ตกไปใช้ค่าเดิมของดีล/มูลค่าคาดการณ์เพื่อกัน null.
  const actual = wonValue !== undefined ? wonValue : (deal.wonValue ?? projectValue ?? deal.projectValue);
  patch.wonValue = toMoney(actual);
  // projectValue = มูลค่า "คาดการณ์" — เขียนทับเฉพาะเมื่อผู้เรียกส่งมาโดยตรง (เช่น
  // สร้างดีลลูก/ดีล stub ที่คาดการณ์=จริง). การปิด Won ปกติไม่แตะ projectValue (freeze).
  if (projectValue !== undefined) patch.projectValue = toMoney(projectValue);
  // เดือนที่เลือกตอน Won ให้ย้าย "เดือนพยากรณ์" (FC) ตามไปด้วย เพื่อให้ FC กับ AT
  // อยู่เดือนเดียวกัน (วัดความแม่นยำได้ตรง). หลัง Won เดือนนี้ถูก Lock ที่ UI/API.
  if (chosenWonMonth) patch.forecastMonth = chosenWonMonth;
  if (nextProjectId) patch.projectId = nextProjectId;
  return patch;
}

export async function insertWinSideEffects({
  supabase,
  user,
  before = null,
  deal,
  source = 'manual',
  request,
  auditAction = 'update',
  auditSummary,
}) {
  if (!deal) return;

  if (!before || before.stage !== deal.stage) {
    await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'),
      dealId: deal.id,
      fromStage: before?.stage || null,
      toStage: deal.stage,
      changedBy: user.id || null,
      changedByName: user.name || null,
    });
  }

  await supabase.from('sales_deal_forecasts').insert({
    id: genId('DFC'),
    dealId: deal.id,
    forecastMonth: deal.forecastMonth || monthKey(new Date().toISOString()),
    forecastAmount: forecastAmount(deal),
    probability: deal.probability,
    source,
    createdBy: user.id || null,
    createdByName: user.name || null,
  });

  await recordAudit({
    user,
    action: auditAction,
    entityType: 'sales_deal',
    entityId: deal.id,
    before: before || undefined,
    after: deal,
    summary: auditSummary || `${auditAction} won sales deal ${dealAuditLabel(deal)}`,
    request,
  });
}

export async function markWon({ supabase, user, deal, source = 'manual', now = new Date().toISOString(), wonValue, projectValue, projectId, wonMonth, metadata = {}, request, auditSummary }) {
  const patch = buildWinPatch({ deal, source, now, wonValue, projectValue, projectId, wonMonth, metadata });
  const { data, error } = await supabase
    .from('sales_deals')
    .update(patch)
    .eq('id', deal.id)
    .select()
    .single();
  if (error) throw error;

  await insertWinSideEffects({
    supabase,
    user,
    before: deal,
    deal: data,
    source,
    request,
    auditAction: 'update',
    auditSummary,
  });

  return data;
}

export async function createWonDealStub({ supabase, user, row, source = 'manual', request, auditSummary }) {
  const now = new Date().toISOString();
  const rowMetadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {};
  const deal = {
    ...row,
    id: row.id || genId('DEAL'),
    stage: winStageForProject(row.projectId),
    projectValue: toMoney(row.projectValue),
    // ดีล stub เกิดตอนปิด Won อยู่แล้ว → คาดการณ์=จริง (wonValue = projectValue)
    wonValue: toMoney(row.wonValue ?? row.projectValue),
    probability: 100,
    forecastMonth: monthKey(row.forecastMonth || row.expectedCloseDate || now),
    depositPaid: true,
    confirmedAt: row.confirmedAt || now,
    metadata: {
      ...rowMetadata,
      wonSource: source,
      wonAt: now,
    },
  };

  const { data, error } = await supabase.from('sales_deals').insert(deal).select().single();
  if (error) throw error;

  await insertWinSideEffects({
    supabase,
    user,
    before: null,
    deal: data,
    source,
    request,
    auditAction: 'create',
    auditSummary,
  });

  return data;
}
