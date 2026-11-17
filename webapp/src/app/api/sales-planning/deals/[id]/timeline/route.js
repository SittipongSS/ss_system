import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { advanceStage, dealAuditLabel } from '@/lib/salesPlanning';
import { genId } from '@/lib/id';
import { activeProductTypeError } from '@/lib/master/productTypes';
import { WorkflowTemplateError } from '@/lib/admin/workflowTemplates';
import { attachRowsToProject, buildDealTimelineRows } from '@/lib/sales/dealTimelineGen';
import { projectWriteBlockedError } from '@/lib/pm/projectClose';
import { propagateAndPersist } from '@/lib/pm/status';
import { isHistoricalDeal } from '@/lib/sales/historicalOrders';
import { canEditDealTimeline } from '@/lib/sales/dealTimelineAccess';
import { fetchAllResult } from '@/lib/supabaseFetchAll';

export const dynamic = 'force-dynamic';

// DL1: ไทม์ไลน์ของดีลเอง — task ลอย (projectId ว่าง, mig 0094) เกิดที่ดีลตั้งแต่
// ยังไม่มีโครงการ. ตอนผูกโครงการ (link-project/create-project) task ชุดนี้ถูก
// "รับเลี้ยง" เข้าโครงการ (เติม projectId) — ไม่ gen ซ้ำ.
// ⭐ งวด P2b (ยุบดีล/โครงการ · มติเจ้าของ 13/11/2026): ดีลที่อยู่ในโครงการสร้าง/ลบไทม์ไลน์ของตัวเองที่หน้าดีลได้
//    (เดิมตอบ 409 "จัดการที่หน้าโครงการ") — ชุดที่สร้างประทับ projectId ของดีล ต่อท้ายลำดับของโครงการ
//    และปักหมุดขั้นราก (กติกาเดียวกับ segment ที่ผูกเข้าโครงการ · `attachRowsToProject`)

// ดีล + โครงการที่ดีลชี้อยู่ (join ในคำสั่งเดียว) — แยก `project` ออกจากแถวดีล ไม่ให้ติดไปกับ audit/update
async function loadDeal(supabase, id) {
  const { data, error } = await supabase.from('sales_deals').select('*, project:projects(*)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data) return { deal: null, project: null };
  const { project, ...deal } = data;
  return { deal, project: project || null };
}

// ด่านตัวกลางของไทม์ไลน์ดีล (ใช้ร่วมกับ route Rev.) — lib/sales/dealTimelineAccess.js
const guard = (user, deal) => (canEditDealTimeline(user, deal) ? null : forbidden());

// POST /api/sales-planning/deals/[id]/timeline { startDate?, categoryCode? }
// gen ไทม์ไลน์จาก template ตาม (ประเภทดีล + หมวดสินค้า) — anchor ที่ startDate
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const { deal, project } = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบดีล');
  const denied = guard(user, deal);
  if (denied) return denied;
  /* ดีลของใบสั่งขายย้อนหลัง (mig 0360) ไม่มีไทม์ไลน์ — ต้องตอบก่อนเขียน project_tasks (route นี้ insert งานก่อน UPDATE
     ดีล ⇒ ปล่อยไปชน CHECK ของดีลตอนเปลี่ยนประเภท = งานลอยค้างโดยดีลไม่ขยับ) */
  if (isHistoricalDeal(deal)) return conflict('ดีลของใบสั่งขายย้อนหลังไม่มีไทม์ไลน์');
  if (deal.stage === 'lost') return badRequest('ดีล Lost แล้ว สร้างไทม์ไลน์ไม่ได้');
  const closedErr = projectWriteBlockedError(project);
  if (closedErr) return conflict(closedErr);

  // นับไม่ขึ้น = ห้ามถือว่ายังไม่มี — ไม่งั้นได้ไทม์ไลน์ซ้อนสองชุด
  // ⚠️ นับทุกขั้นของดีล (มี/ไม่มี projectId) — ดีลในโครงการมีชุดอยู่แล้ว = ห้ามสร้างซ้อน
  const { count: existing, error: existingError } = await supabase
    .from('project_tasks').select('id', { count: 'exact', head: true })
    .eq('dealId', deal.id);
  if (existingError) return fail(existingError.message, 500);
  if ((existing || 0) > 0) return conflict('ดีลนี้มีไทม์ไลน์แล้ว — ลบก่อนถ้าต้องการสร้างใหม่');

  const body = await req.json().catch(() => ({}));
  // ตรวจ "หมวดพักใช้" เฉพาะตอน caller เปลี่ยนหมวด (ส่ง categoryCode ใหม่ที่ต่างจากเดิม)
  // — ดีลเดิมที่หมวดถูกพักใช้ทีหลังต้องสร้างไทม์ไลน์ต่อได้ (กติกาเดียวกับ deal PATCH:
  // historic deals may retain a category that was later deactivated).
  const categoryChanged = body.categoryCode != null
    && String(body.categoryCode).trim() !== (deal.categoryCode || '');
  if (categoryChanged) {
    const categoryError = await activeProductTypeError((body.categoryCode || '').trim() || null);
    if (categoryError) return badRequest(categoryError);
  }
  const now = new Date().toISOString();

  // ประเภทดีล = ตัวเลือก template. caller (โมดัลยืนยันก่อนสร้าง) ส่ง type มาให้ยืนยัน/
  // สลับได้ → ถ้าต่างจากที่เก็บ อัปเดต deal.dealType ให้ตรงไปเลย (กัน "ดึงผิดประเภท"
  // เพราะ dealType เก่าค้างผิด — มติ 2026-07-21). ไม่ส่ง = ใช้ประเภทที่ดีลเก็บไว้เดิม.
  // ลำดับ template→ธงหมวด→build อยู่ใน buildDealTimelineRows ที่เดียว (ใช้ร่วมกับ
  // auto-gen ตอนสร้างดีล และ regen ตอนแก้ประเภท/หมวด)
  let built;
  try {
    built = await buildDealTimelineRows(supabase, deal, {
      // ดีลในโครงการ: สายล็อกตามโครงการ (ฟอร์มดีลล็อกช่องนี้อยู่แล้ว) — ไม่รับสายจากโมดัล
      type: body.type, line: project ? (deal.line || project.line) : body.line,
      categoryCode: body.categoryCode, startDate: body.startDate,
    });
  } catch (error) {
    return fail(error.message || 'โหลด Workflow Template ไม่สำเร็จ', error instanceof WorkflowTemplateError ? error.status : 500);
  }
  const { genType, genLine, categoryCode } = built;
  let rows = built.rows;
  if (project && rows.length) {
    // ไล่หน้าครบ (check:rowcap) — โครงการใหญ่ไม่ควรถึง 1,000 ขั้น แต่ตัดเงียบ = ลำดับต่อท้ายชนของเดิม
    const { data: projectTasks, error: projectTasksError } = await fetchAllResult(() => supabase
      .from('project_tasks').select('id, stepOrder').eq('projectId', project.id)
      .order('id', { ascending: true }));
    if (projectTasksError) return fail(projectTasksError.message, 500);
    rows = attachRowsToProject(rows, project.id, projectTasks || []);
  }
  // 0 แถว = template หลังกรองหมวดสินค้าไม่เหลือขั้นตอนเลย (หมวดของดีลไม่ตรง step ไหน
  // หรือ published template ของประเภทนี้ว่าง). เดิม insert([]) แล้วตอบ 201 เงียบ ๆ →
  // หน้าโหลดใหม่เจอ 0 task โชว์ปุ่มเดิม = ผู้ใช้เห็นว่า "กดแล้วไม่ขึ้นอะไร". ปฏิเสธพร้อมบอกสาเหตุ
  if (!rows.length) {
    return badRequest(
      categoryCode
        ? `Workflow Template ${genType} ไม่มีขั้นตอนที่ตรงกับหมวดสินค้า ${categoryCode} — ตรวจ Template ที่ตั้งค่า หรือเปลี่ยนหมวดสินค้าบนดีล`
        : `Workflow Template ${genType} ที่เผยแพร่อยู่ไม่มีขั้นตอน — ตรวจการตั้งค่าที่ /settings/workflow-templates`,
    );
  }
  const { data: inserted, error: insErr } = await supabase.from('project_tasks').insert(rows).select();
  if (insErr) return fail(`สร้างไทม์ไลน์ไม่สำเร็จ: ${insErr.message}`, 500);

  // บันทึกหมวดที่ใช้ + ประเภทที่ยืนยัน + ขยับ stage เป็น timeline_proposed (เหมือน flow ผูกโครงการ)
  const patch = { updatedAt: now };
  if (categoryCode !== (deal.categoryCode || null)) patch.categoryCode = categoryCode;
  // สายที่ใช้ gen จริง เขียนกลับให้ตรงกัน (กติกาเดียวกับประเภทดีล) — ดีลเก่าที่ยัง
  // ไม่มีสายแล้วผู้ใช้เลือกในโมดัลยืนยัน จะได้ค่าติดตัวตั้งแต่รอบนี้
  if (genLine && genLine !== (deal.line || null)) patch.line = genLine;
  // ยืนยัน/สลับประเภทตอนสร้างไทม์ไลน์ → เขียนกลับให้ deal.dealType ตรงกับ template ที่ใช้จริง
  // (เขียน metadata.projectType คู่ตาม transition mig 0088)
  if (genType !== (deal.dealType || null)) {
    patch.dealType = genType;
    patch.metadata = { ...(deal.metadata || {}), projectType: genType };
  }
  // เดินหน้าอย่างเดียว — กติกามาจาก advanceStage ที่เดียว (เหมือน create-project/link-project)
  // 🐞 เดิมสะกดลิสต์สถานะเองแล้วมีขั้น "เสนอราคา" ติดมาด้วย → ดีลที่ออกใบเสนอราคาไปแล้ว
  // แล้วโครงการถูกลบ (FK SET NULL — mig 0064) กลับมาทำไทม์ไลน์ใหม่ จะถูก **ดึงถอย**
  // กลับมาขั้นเสนอไทม์ไลน์ทั้งที่ใบยังอยู่ (มติ B4 2026-07-28 ห้ามถอย —
  // dealStageOrder.test.mjs ตรึงกติกาไว้ในระดับฟังก์ชันแล้ว แต่ route นี้เลี่ยงฟังก์ชันไป)
  // ⚠️ ห้ามพิมพ์ลิสต์สถานะเป็นตัวอักษรที่นี่อีก แม้ในคอมเมนต์ — ตัวสแกนของเทสต์
  // (dealStageIntegrity.test.mjs) ไม่แยกโค้ดกับคอมเมนต์
  const nextStage = advanceStage(deal.stage, 'timeline_proposed');
  if (nextStage !== deal.stage) patch.stage = nextStage;
  const { data: updatedDeal, error: upErr } = await supabase
    .from('sales_deals').update(patch).eq('id', deal.id).select().single();
  if (upErr) return fail(upErr.message, 500);
  /* 🐞 เดิมไม่รับ error — insert พัง = ดีลขยับไปขั้นเสนอไทม์ไลน์แล้ว แต่เส้นเรื่องไม่มี
     บรรทัดนี้ และ daysInStage นับจากการเปลี่ยนครั้งก่อน (อาการเดียวกับ createQuotationDraft)
     ⚠️ ห้ามตอบ 500: ขั้นตอน + stage ลงไปแล้ว กดซ้ำจะเจอ "ดีลนี้มีไทม์ไลน์แล้ว" (409)
     และประวัติก็ไม่ถูกเขียนอยู่ดี ⇒ log + ส่งคำเตือนกลับไปกับผลลัพธ์ */
  let stageHistoryWarning = null;
  if (patch.stage) {
    const { error: historyError } = await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'), dealId: deal.id, fromStage: deal.stage, toStage: patch.stage,
      changedBy: user.id || null, changedByName: user.name || null,
    });
    if (historyError) {
      console.error(`[deal-timeline ${deal.id}] บันทึกประวัติสถานะ ${deal.stage} → ${patch.stage} ไม่สำเร็จ:`, historyError.message);
      stageHistoryWarning = `สร้างไทม์ไลน์แล้ว แต่ลงประวัติการเปลี่ยนสถานะไม่สำเร็จ: ${historyError.message}`;
    }
  }

  await recordAudit({
    user, action: 'update', entityType: 'sales_deal', entityId: deal.id, before: deal, after: updatedDeal,
    summary: `สร้างไทม์ไลน์ของดีล ${dealAuditLabel(deal)} (${genLine ? `${genLine} · ` : ''}${genType}${categoryCode ? ` · หมวด ${categoryCode}` : ''} · ${inserted.length} ขั้นตอน)`,
    request: req,
  });
  return ok({ deal: updatedDeal, tasks: inserted, ...(stageHistoryWarning ? { stageHistoryWarning } : {}) }, 201);
});

// DELETE /api/sales-planning/deals/[id]/timeline — ลบไทม์ไลน์ของดีลทั้งชุด (ไว้สร้างใหม่)
// งวด P2b: ดีลในโครงการลบชุดของตัวเองได้ด้วย (ลบเฉพาะขั้นที่ dealId = ดีลนี้ · งานกลาง/ดีลอื่นไม่แตะ)
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const { deal, project } = await loadDeal(supabase, id);
  if (!deal) return notFound('ไม่พบดีล');
  const denied = guard(user, deal);
  if (denied) return denied;
  const closedErr = projectWriteBlockedError(project);
  if (closedErr) return conflict(closedErr);

  const { data: gone, error } = await supabase
    .from('project_tasks').delete().eq('dealId', deal.id).select('id');
  if (error) return fail(error.message, 500);
  // ขั้นของดีลอื่นในโครงการที่เคยรอขั้นที่ลบไป = พร้อมทำแล้ว → คำนวณสถานะทั้งโครงการใหม่
  if (project) await propagateAndPersist(supabase, project.id);

  await recordAudit({
    user, action: 'update', entityType: 'sales_deal', entityId: deal.id, before: deal,
    summary: `ลบไทม์ไลน์ของดีล ${dealAuditLabel(deal)} (${(gone || []).length} ขั้นตอน)`,
    request: req,
  });
  return ok({ removed: (gone || []).length });
});
