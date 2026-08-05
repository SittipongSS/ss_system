import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { isSuperuser } from '@/lib/permissions';
import { emptyProjectAfterDealDelete, loadProject } from '@/lib/pm/projectsRepo';
import {
  isForceRequest, isDryRun, canForceDelete,
  dealForcePreview, cleanupDealOrphans,
} from '@/lib/forceDelete';
import { resolveProbability } from '@/lib/sales/dealProbability';
import { validateDealOwner } from '@/lib/sales/dealOwner';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import {
  canEditSalesPlanning,
  canViewSalesPlanning,
  dealAuditLabel,
  forecastAmount,
  inSalesEditScope,
  inSalesViewScope,
  isValidStage,
  isWonStage,
  monthKey,
  normalizeDealType,
  normalizeStage,
  toMoney,
  toProbability,
} from '@/lib/salesPlanning';
import { loadForecastDrift } from '@/lib/salesPlanningForecast';
import { recalculateGraph, todayStr } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { activeProductTypeError } from '@/lib/master/productTypes';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { dealUnlinkedUpdate } from '@/lib/pm/projectUpdates';
import { dealForecastUpdate } from '@/lib/sales/dealUpdates';

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
  if (!deal) return notFound('ไม่พบดีล');
  if (!inSalesViewScope(user, deal)) return forbidden();
  const forecastDrift = await loadForecastDrift(supabase, deal).catch(() => null);
  return ok({ ...deal, forecastDrift });
});

export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const before = await loadDeal(supabase, id);
  if (!before) return notFound('ไม่พบดีล');
  if (!inSalesEditScope(user, before)) return forbidden();

  const body = await req.json();
  if ('title' in body && !body.title?.trim()) return badRequest('ต้องระบุชื่อดีล');
  // ปฏิเสธ stage เพี้ยน (สะกดผิด/พิมพ์ใหญ่) แทนที่จะให้ normalizeStage ดันไป 'lead' เงียบ ๆ
  if ('stage' in body && !isValidStage(body.stage)) return badRequest(`สถานะดีล "${body.stage}" ไม่ถูกต้อง`);

  const alreadyWon = isWonStage(before.stage);
  const nextStage = 'stage' in body ? normalizeStage(body.stage) : before.stage;
  const transitioningToWon = nextStage === 'won' && !alreadyWon;
  if (transitioningToWon) return badRequest('ปิด Won ผ่านใบเสนอราคาเท่านั้น');
  if (alreadyWon && nextStage !== before.stage) return badRequest('ดีล Won แล้ว ไม่สามารถเปลี่ยนสถานะจากฟอร์มดีลได้');

  const patch = {
    updatedAt: new Date().toISOString(),
  };
  for (const key of ['customerId', 'customerName', 'expectedCloseDate', 'lostReason', 'notes', 'team']) {
    if (key in body) patch[key] = body[key] === '' ? null : body[key];
  }
  /* เปลี่ยนผู้รับผิดชอบ — ด่านเดียวกับตอนสร้าง (lib/sales/dealOwner.js)
     🐞 ของเดิม ownerId/ownerName ไหลจาก body ตรงเข้า patch: ปลอมชื่อได้ และยกดีลให้
     คนที่แตะดีลของตัวเองไม่ได้ก็ได้ (ด่าน inSalesEditScope ข้างล่างตรวจแค่ว่า **ผู้แก้**
     ยังเห็นแถวหลังแก้อยู่ไหม ไม่ได้ตรวจว่าผู้รับเป็นใคร) */
  if ('ownerId' in body) {
    const checked = await validateDealOwner(supabase, body.ownerId, user);
    if (!checked.ok) return badRequest(checked.error);
    patch.ownerId = checked.ownerId;
    patch.ownerName = checked.ownerName;
    if (checked.team) patch.team = checked.team;
  }
  // metadata: merge ทับของเดิมเสมอ — ห้าม replace ทั้งก้อน เพราะกุญแจระบบที่ flow อื่น
  // เขียนไว้ (acceptedQuotationId/wonDocType/wonMonth จาก accept_quotation RPC,
  // sahamitPoId/poLineIds/sahamitMergedIntoDealId จาก settle สหมิตร) จะหลุดหายเงียบ ๆ
  // — trigger 0110 กู้คืนแค่ actualSource/wonMonth/wonValueExVat. ค่าไม่ใช่ object
  // (null/'') ไม่รับ: endpoint นี้ไม่มีเส้นทางล้าง metadata ทั้งก้อน
  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    patch.metadata = { ...(before.metadata || {}), ...body.metadata };
  }
  if ('title' in body) patch.title = body.title.trim();
  if ('stage' in body) patch.stage = nextStage;
  // projectValue = มูลค่าคาดการณ์ — freeze เมื่อปิด Won แล้ว (แก้ไม่ได้อีก); ก่อน Won แก้ได้
  if ('projectValue' in body && !alreadyWon) patch.projectValue = toMoney(body.projectValue);
  // FC% — freeze เมื่อปิด Won แล้ว เหมือน projectValue บรรทัดบน: 100 ของดีล Won คือ
  // "ยอดจริง (Actual)" ไม่ใช่ FC (มติผู้ใช้ 2026-07-29) และ 100 ไม่ใช่ตัวเลือกในฟอร์มแล้ว
  // — ฟอร์มแก้ดีลส่ง probability ที่ผ่าน snapForecastLevel มาทั้งก้อนทุกครั้ง ถ้าไม่กันไว้
  // การเปิดดีล Won แล้วกดบันทึก (เช่น แก้หมายเหตุ) จะเขียนทับ 100 ด้วย 80 เงียบ ๆ
  // เดิมบั๊กนี้ไม่กัดเพราะ snap(100) = 100 ตอนที่ 100 ยังเป็นระดับที่เลือกได้
  // ⭐ ขั้นเปลี่ยน = FC ตามกติกาเสมอ (มติผู้ใช้ 2026-08-05) — ไม่ฟังค่าที่ client ส่งมา
  // ฟอร์มแก้ดีลส่ง probability เดิมมาทั้งก้อนทุกครั้ง ถ้ายอมรับค่านั้น ดีลที่เพิ่งถูกดัน
  // ไปขั้น "เสนอราคา" จะค้าง FC 20% ต่อไป ทั้งที่หลักฐานเปลี่ยนแล้ว
  // เลือกเองยังได้อยู่ — แต่ต้องเป็นการบันทึกที่ **ไม่ได้ขยับขั้น** เท่านั้น
  const stageChanged = 'stage' in body && nextStage !== before.stage;
  if (stageChanged && !alreadyWon) {
    patch.probability = await resolveProbability(supabase, { ...before, ...patch, stage: nextStage });
  } else if ('probability' in body && !alreadyWon) {
    patch.probability = toProbability(body.probability, nextStage);
  }
  // เดือนพยากรณ์ (FC): อนุมานจาก "วันที่คาดปิด" อย่างเดียว (มติผู้ใช้ 2026-07-16 —
  // ฟอร์มไม่มีช่องเดือนแล้ว ไม่รับค่า forecastMonth จาก client). ขยับได้เฉพาะก่อนปิด
  // Won — หลัง Won ล็อก (เดือนถูกตรึงตอนปิดเพื่อวัดความแม่นยำ FC vs AT; buildWinPatch
  // เป็นคนตั้งตอนนั้นเอง).
  if ('expectedCloseDate' in body && !alreadyWon) {
    patch.forecastMonth = monthKey(body.expectedCloseDate) || null;
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
  // ประเภทดีล (SCENT/NPD/RE-ORDER) — คอลัมน์จริง + เขียน metadata.projectType คู่ (transition
  // 1 เฟส); merge ทับ metadata ล่าสุดเสมอ (หลัง buildWinPatch/needsReview). รับทั้ง body.dealType
  // (UI ใหม่) และ body.projectType (caller เก่า).
  if ('dealType' in body || 'projectType' in body) {
    const nextType = normalizeDealType(body.dealType ?? body.projectType);
    patch.dealType = nextType;
    patch.metadata = { ...(patch.metadata || before.metadata || {}), projectType: nextType };
  }
  // ชื่อสูตรกลิ่น (SCENT) — แก้ได้ตลอด (จุดปลั๊กอิน RD ในอนาคต)
  if ('formulaName' in body) {
    patch.formulaName = (body.formulaName || '').trim() || null;
  }
  // หมวดสินค้า (DL1 — mig 0094): ใช้เลือก timeline template ตามหมวด
  if ('categoryCode' in body) {
    patch.categoryCode = (body.categoryCode || '').trim() || null;
    if (patch.categoryCode !== (before.categoryCode || null)) {
      const categoryError = await activeProductTypeError(patch.categoryCode);
      if (categoryError) return badRequest(categoryError);
    }
  }
  // วันที่เริ่ม/สิ้นสุดของดีล (mig 0095)
  if ('startDate' in body) patch.startDate = body.startDate || null;
  if ('endDate' in body) patch.endDate = body.endDate || null;
  if ('brand' in body) {
    patch.metadata = { ...(patch.metadata || before.metadata || {}), brand: body.brand || '' };
  }

  // กันย้ายดีลออกนอกขอบเขตตัวเอง: ถ้า team/ownerId เปลี่ยน แถวหลังแก้ต้องยังอยู่ใน
  // edit-scope ของผู้แก้ (POST เช็คแบบเดียวกันบน row ที่สร้าง — เดิม PATCH เชื่อ client)
  if (('team' in body || 'ownerId' in body) && !inSalesEditScope(user, { ...before, ...patch })) {
    return forbidden('ย้ายดีลไปทีม/เจ้าของนอกขอบเขตของคุณไม่ได้');
  }

  // optimistic lock ที่ stage (แนวเดียวกับ SO ที่ .eq('status', before.status)):
  // guard ข้างบน (alreadyWon/transitioningToWon/confirmedAt=null) คิดจาก before —
  // ถ้าใบเสนอราคาถูก accept (stage → won) ระหว่างฟอร์มเปิดค้าง การเขียนแบบไม่เช็ค
  // จะทับ stage กลับและล้าง confirmedAt ทั้งที่ใบ accepted ค้างอยู่
  const { data, error } = await supabase
    .from('sales_deals')
    .update(patch)
    .eq('id', id)
    .eq('stage', before.stage)
    .select(selectDeal)
    .maybeSingle();
  if (error) return fail(error.message, 500);
  if (!data) return conflict('ดีลถูกแก้ไขพร้อมกัน (สถานะเปลี่ยนระหว่างบันทึก) — รีเฟรชหน้าแล้วลองใหม่');

  // วันที่เริ่มดีลเปลี่ยน → เลื่อนไทม์ไลน์ลอยของดีลตาม (sync แบบเดียวกับฝั่งโครงการ
  // ที่ PATCH startDate แล้ว recalculateGraph ทุกขั้นตอน). เฉพาะดีลที่ยังไม่ผูกโครงการ —
  // ผูกแล้ว segment อยู่ใต้ anchor ของโครงการ จัดการที่หน้าโครงการตามกติกาเดิม.
  if ('startDate' in body && (data.startDate || null) !== (before.startDate || null) && !data.projectId) {
    const { data: floating } = await supabase
      .from('project_tasks').select('*')
      .eq('dealId', id).is('projectId', null)
      .order('stepOrder', { ascending: true });
    if (floating?.length) {
      setHolidays([...(await holidaySet())]);
      // เกณฑ์ anchor เดียวกับตอน gen ไทม์ไลน์ดีล: ไม่ระบุวันเริ่ม = วันนี้
      const recalced = recalculateGraph(floating, data.startDate || todayStr());
      await Promise.all(
        recalced
          .filter((r, i) => r.startDate !== floating[i].startDate || r.finishDate !== floating[i].finishDate)
          .map((r) => supabase.from('project_tasks').update({
            startDate: r.startDate, finishDate: r.finishDate, cellsOverride: r.cellsOverride ?? null,
          }).eq('id', r.id)),
      );
    }
  }

  // เฟส B: เลิก sync ชื่อดีล→ชื่อโครงการ — โครงการมีได้หลายดีล ชื่อไม่ผูกกันอีกต่อไป
  // (ฝั่งโครงการ→ดีล ตัดคู่กันใน api/pm/projects/[id]/route.js)

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

  // 🐞 ตัวเลขที่ขยับเคยลงแต่ตาราง forecast (เพื่อ KPI) แล้ว **ไม่มีใครเห็นบนหน้าจอ
  // เลย** — คนเปิดดีลย้อนหลังไม่รู้ว่ามูลค่าเคยเป็นเท่าไรและใครแก้ · เขียนลงเธรดคู่กัน
  const forecastEvent = dealForecastUpdate(before, data);
  if (forecastEvent) {
    await appendUpdate(supabase, { entityType: 'deal', entityId: data.id, ...forecastEvent, user });
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

// ลบดีล = ลบเฉพาะดีล + ลูกฝั่งขาย (activities/history/forecasts/quotations/
// forecast_lines cascade เองผ่าน FK). โครงการ PM ที่ผูกอยู่ "ไม่ลบตาม" — โครงการเป็น
// เอนทิตีใหญ่กว่าและมีได้หลายดีล (เฟส B) อาจมีดีลอื่นมาผูกแทน แม้เป็นดีลสุดท้ายก็ปล่อย
// โครงการว่างดีลไว้ได้; ลบดีลจึงแค่ถอด timeline segment ของดีลนี้ออกจากโครงการ.
// การลบโครงการเองทำที่ /api/pm/projects/[id]. กันลบเคสที่จะทำให้ยอด/ประวัติหาย.
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();

  const { id } = await ctx.params;
  const before = await loadDeal(supabase, id);
  if (!before) return notFound('ไม่พบดีล');
  if (!inSalesEditScope(user, before)) return forbidden();

  // force = ทางลัดผู้ดูแลระบบ (role admin เท่านั้น) ที่ข้าม guard ทางธุรกิจแล้ว
  // cascade ลูกที่ไม่มี FK ให้ครบ; dryRun = พรีวิวว่าจะลบอะไรพ่วง (admin เท่านั้น).
  const force = isForceRequest(req) && canForceDelete(user);
  const dryRun = isDryRun(req);

  // โครงการ PM ที่ผูก (ถ้ามี) — โหลดไว้เพื่อข้อความ/พรีวิวเท่านั้น; ลบดีลไม่ลบโครงการ
  let project = null;
  if (before.projectId) project = await loadProject(supabase, before.projectId);

  // พรีวิวสำหรับปุ่ม force ในหน้าเว็บ — ไม่ลบอะไร, เฉพาะ admin.
  if (dryRun) {
    if (!canForceDelete(user)) return forbidden();
    const preview = await dealForcePreview(supabase, before, { project });
    return ok({ dryRun: true, ...preview });
  }

  // กันลบสิ่งที่นับเป็นยอด/มีหลักฐานทางบัญชีแล้ว (M8): โครงการที่ปิด Won,
  // หรือมาจาก PO สหมิตร (settle เข้ายอดแล้ว) — ให้ยกเลิกด้วยวิธีอื่นแทนการลบ.
  // force (admin) ข้ามด่านเหล่านี้ทั้งหมด แล้วรับผิดชอบ cascade เอง.
  if (!force) {
    if (isWonStage(before.stage) && !isSuperuser(user.role)) {
      return conflict('โครงการนี้ปิดการขาย (Won) แล้ว — ลบไม่ได้ เพราะถูกนับเป็นยอดขาย (ต้องการสิทธิ์แอดมิน)');
    }
    // ใบเสนอราคา accepted = แหล่งยอด Actual — ห้ามลบแม้ superuser (กติกาเดียวกับ
    // DELETE quotation) เพราะ FK cascade จะพาใบ accepted + Sale Order หายเงียบ
    // โดย audit ไม่บันทึกเอกสารการเงินที่ถูกทำลาย. ต้องย้อนการรับ (0138) หรือ
    // ย้อน Won ผ่านยกเลิก SO (0116) ก่อน.
    const { count: acceptedCount } = await supabase
      .from('quotations').select('id', { count: 'exact', head: true })
      .eq('dealId', id).eq('status', 'accepted');
    if ((acceptedCount || 0) > 0) {
      return conflict('ดีลนี้มีใบเสนอราคาที่รับแล้ว (Won) — ลบไม่ได้ เพราะเป็นหลักฐานยอด Actual: ถ้ามี SO อนุมัติแล้วใช้ “ยกเลิกใบสั่งขายพร้อมย้อนสถานะ”; ถ้ายังไม่มี SO ให้หัวหน้าทีม/แอดมินใช้ “ย้อนการรับ” บนหน้าใบเสนอราคา');
    }
    if (before.metadata?.sahamitPoId) {
      return conflict('โครงการนี้มาจาก PO สหมิตร — ลบไม่ได้ (จัดการที่เอกสาร PO แทน)');
    }
  }

  // เฟส B: โครงการมีได้หลายดีลและเป็นเอนทิตีอิสระที่อาจมีดีลอื่นมาผูกแทน — ลบดีลจึง
  // "ไม่ลบโครงการตาม" แม้เป็นดีลสุดท้าย (ปล่อยโครงการว่างดีลไว้ รอดีลใหม่มาผูก).
  // แค่ถอด timeline segment ของดีลนี้ออก; การลบโครงการทำที่หน้าโครงการโดยตรง.
  const detachedFromProject = project?.id || null;

  // เก็บกวาดลูกดีลที่ไม่มี FK จริง (งานส่วนตัว/คำร้องข้ามฝ่าย/parent-ref) ก่อนลบแม่ —
  // ต้องทำ **ทุกครั้ง** ไม่ใช่เฉพาะตอน force: เดิมอยู่ใต้ `if (force)` ทำให้การลบดีล
  // ตามปกติทิ้งงานที่ผูกดีลค้างไว้ชี้ดีลที่ไม่มีอยู่แล้ว — เข้าถึงจากดีลไม่ได้อีกและ
  // ไม่มีเส้นทางไหนตามลบให้ (prod 2026-07-30 เจอค้าง 5 งานจากดีลที่ถูกลบไปแล้ว).
  try {
    await cleanupDealOrphans(supabase, id);
  } catch (cleanupError) {
    return fail(`เก็บกวาดงาน/คำร้องที่ผูกดีลไม่สำเร็จ: ${cleanupError.message} — ยังไม่ได้ลบดีล`, 500);
  }

  // ลบ task ทั้งหมดของดีลนี้ — ทั้ง segment ใต้โครงการ (mig 0090) และไทม์ไลน์ลอย
  // (projectId ว่าง). FK dealId เป็น SET NULL ถ้าไม่ลบเองจะเหลือ task ของดีลที่หายไป
  // ค้างในโครงการ (แถวไร้เจ้าของ) — โครงการและ task ของดีลอื่นไม่ถูกแตะ.
  // ⚠️ ต้องหยุดเมื่อลบไม่สำเร็จ: พอแถวดีลหายไปแล้ว SET NULL จะล้าง dealId ของขั้นตอน
  // ที่เหลือทิ้ง กลายเป็นแถวไร้เจ้าของที่ตามเก็บไม่ได้อีกเลย = ไทม์ไลน์ค้างถาวร.
  const { error: taskError } = await supabase.from('project_tasks').delete().eq('dealId', id);
  if (taskError) return fail(`ลบไทม์ไลน์ของดีลไม่สำเร็จ: ${taskError.message} — ยังไม่ได้ลบดีล`, 500);

  const { error } = await supabase.from('sales_deals').delete().eq('id', id);
  if (error) return fail(error.message, 500);
  // เธรดความเคลื่อนไหว (mig 0169) เป็น polymorphic ไม่มี FK — ของเดิมหายเองเพราะ
  // sales_deal_activities มี ON DELETE CASCADE แต่ตารางกลางไม่มี ต้องกวาดเอง
  // ไม่งั้นเหลือเธรดของดีลที่ไม่มีอยู่แล้วค้างในฟีดรวมข้ามโมดูล
  await purgeUpdates(supabase, 'deal', id);

  // ⚠️ เธรดของ**โครงการแม่**ต้องรู้ว่าดีลใบนี้หลุดไป — ความเคลื่อนไหวของมันที่เคย
  // ไหลเข้าหน้าโครงการหายไปทั้งชุดพร้อมกัน ถ้าไม่มีบรรทัดอธิบาย เส้นเรื่องจะเป็นรู
  // (เขียนหลังลบสำเร็จ และไม่เช็ค error — เธรดพลาดต้องไม่ทำให้การลบที่สำเร็จแล้วล้ม)
  if (detachedFromProject) {
    await appendUpdate(supabase, {
      entityType: 'project', entityId: detachedFromProject,
      ...dealUnlinkedUpdate(before, { reason: force ? 'ลบดีล (บังคับ)' : 'ลบดีล' }), user,
    });
  }

  // โครงการที่ไม่เหลือดีลผูกเลย = โครงเปล่า — ไม่ลบให้เอง (เฟส B: อาจรอดีลใหม่มาผูก)
  // แต่ต้องส่งกลับให้หน้าเว็บถามผู้ใช้ว่าจะลบทิ้งด้วยไหม ไม่งั้นค้างในรายการเงียบ ๆ.
  // นับพลาดตรงนี้ไม่ใช่เหตุให้ทั้ง request ล้ม (ดีลถูกลบไปแล้ว) — log แล้วไปต่อ.
  let emptyProject = null;
  if (project) {
    try {
      emptyProject = await emptyProjectAfterDealDelete(supabase, project);
    } catch (emptyError) {
      console.error('[deal-delete] ตรวจว่าโครงการเหลือดีลไหมไม่สำเร็จ:', emptyError.message);
    }
  }

  const forceNote = force ? ' (บังคับลบ — สิทธิ์ผู้ดูแลระบบ)' : '';
  const detachNote = detachedFromProject
    ? ` (ถอดออกจากโครงการ ${project.code || project.id} — โครงการยังอยู่)`
    : '';
  await recordAudit({
    user,
    action: 'delete',
    entityType: 'sales_deal',
    entityId: id,
    before,
    summary: `ลบดีล ${dealAuditLabel(before)}${detachNote}${forceNote}`,
    request: req,
  });
  return ok({ ok: true, deletedProject: null, detachedFromProject, emptyProject, forced: force });
});
