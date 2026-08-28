import { viewScope, inPmProjectScope, canDeleteRecord, can, redactProductMargin } from '@/lib/permissions';
import { mergeTemplateTasks, recalculateGraph, resolveSchedule } from '@/lib/pm/schedule';
import { setHolidays } from '@/lib/pm/dateHelpers';
import { holidaySet } from '@/lib/master/holidays';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { loadProject, deleteProjectDeep } from '@/lib/pm/projectsRepo';
import { resolveProjectAcOwner, resolveProjectAeOwner, resolveProjectSupervisor } from '@/lib/pm/projectOwner';
import { isForceRequest, canForceDelete, forceDeleteProjectExcise } from '@/lib/forceDelete';
import { genId } from '@/lib/id';
import { pickFields } from '@/lib/validate';
import { recordAudit } from '@/lib/audit';
import { rollupDeals } from '@/lib/sales/projectRollup';
import { sortDealsByOrder } from '@/lib/pm/dealOrder';
import { latestQuotationRevisions } from '@/lib/sales/quotationRevisionChain';
import { canApproveProjectClose, projectWriteBlockedError } from '@/lib/pm/projectClose';
import { activeProductTypeError, categoryFlagsOf } from '@/lib/master/productTypes';
import { normalizeBusinessLine } from '@/lib/master/businessLines';
import { loadWorkflowTemplateForDeal, WorkflowTemplateError } from '@/lib/admin/workflowTemplates';
import { loadDeliveries, loadProjectSalesOrders } from '@/lib/pm/deliveriesRepo';
import { canEditDeliveries } from '@/lib/pm/deliveries';
import { canViewUpdates } from '@/lib/master/updateAccess';

export const dynamic = 'force-dynamic';

// Fields a client may PATCH on a project (commercial/ISO header — not scope/owner).
const EDITABLE = [
  'code', 'name', 'customerId', 'customerName', 'type', 'urgency',
  // สายธุรกิจ (mig 0191) — แก้ได้ตลอด เพราะโครงการเก่าเป็น NULL ทั้งหมดและ
  // ต้องมีคนมาเลือกทีหลัง · ต่างจาก `type` ที่ล็อกหลังสร้าง (แม่แบบ gen ไปแล้ว)
  'line',
  /* ⭐ **สามฝ่ายของโครงการรับมาแค่ `id`** — ชื่อ (`aeOwner`/`acOwner`/`aeSupervisor`)
     ถูกเขียนจาก server ตามบัญชีที่ id ชี้ ไม่อยู่ในลิสต์นี้โดยเจตนา
     🐞 ของเดิมรับชื่อจาก client ด้วย ⇒ ยิงชื่ออย่างเดียวโดยไม่ส่ง id ก็ผ่าน แล้วชื่อ
     บนใบจะบอกว่าเป็นคนหนึ่ง ส่วน id (ตัวที่ใช้จริงกับสิทธิ์/แจ้งเตือน) ยังเป็นอีกคน —
     กับดักเดิมของบ้านนี้ที่ mig 0190 เกิดมาเพื่อแก้ · ฟอร์มส่งคู่กันอยู่แล้ว
     ⚠️ `team`/`ownerId` ก็ไม่อยู่ในลิสต์เช่นกัน — เดินตามผู้ดูแล (ดูบล็อกใน PATCH) */
  'aeOwnerId', 'acOwnerId', 'aeSupervisorId', 'status', 'startDate', 'dueDate',
  'productMainCategory', 'productSubCategory',
  'docNumber', 'productName', 'productCode', 'orderQty', 'productionQty',
  'customerEmail', 'preparedBy', 'reviewedBy',
  'metadata',
];

// GET /api/pm/projects/[id] — project + its tasks + linked products (FG).
export const GET = withUser(async ({ user, supabase, ctx }) => {
  const { id } = await ctx.params;

  // PM is sales-only: gate on pm:view. RA/unknown roles have viewScope 'all'
  // (or none) but no pm:view — without this they'd read any project's full
  // snapshot (tasks + products + personal tasks) by id.
  if (!user) return unauthorized();
  if (!can(user.role, 'pm:view')) return forbidden();

  const project = await loadProject(supabase, id).catch((e) => { throw e; });
  if (!project) return notFound('ไม่พบโครงการ');
  /* ⚠️ ต้องเป็นเงื่อนไขเดียวกับตัวกรองของลิสต์ (`or(team.in.(…),ownerId.eq.ฉัน)`)
     ไม่งั้นได้กับดักเดิมของระบบนี้: แถวที่ **เห็นในลิสต์** แต่กดเข้าไปเจอ 403 —
     `inScope('team')` ตัดทีมของคนกับทีมของแถว ซึ่งได้ชุดว่างเสมอเมื่อแถวไม่มีทีม
     (เจ้าของงานที่บัญชียังไม่ถูกจัดทีม) · `inPmProjectScope` = ทีม **หรือ** เป็นเจ้าของ
     ซึ่งตรงกับสองสาขาของลิสต์พอดี และเป็นด่านเดียวกับที่ PATCH ใช้อยู่แล้ว */
  if (viewScope(user?.role) === 'team' && !inPmProjectScope(user, project)) {
    return forbidden();
  }

  const [{ data: tasks }, { data: links }] = await Promise.all([
    supabase.from('project_tasks').select('*').eq('projectId', project.id).order('stepOrder', { ascending: true }),
    supabase.from('project_products').select('*, product:products(*)').eq('projectId', project.id),
  ]);

  // redact ต้นทุน/มาร์จิ้นของ FG ตามสิทธิ์ผู้เรียก (เหมือน /api/products) — pm:view มี
  // ทั้ง rd/staff/viewer ที่ห้ามเห็น costPrice/มาร์จิ้น; ไม่ redact = รั่วผ่าน fetch ตรง.
  const projectProducts = (links || []).map((l) => ({
    ...l,
    product: redactProductMargin(user, l.product),
  }));

  // ดีลที่ผูกโครงการนี้ — เฟส B: หลายดีลต่อโครงการ (SCENT→NPD→RE-ORDER…) อ่านเป็น list.
  // ดีลก่อตั้ง = ตัวแรกสุด (createdAt เก่าสุด) — คง dealId/dealStage ชี้ดีลก่อตั้งไว้
  // 1 เฟส เพื่อ backward compat กับ UI ที่ยังไม่ย้ายไปใช้ deals[] (ตัดในเฟสถัดไป).
  const { data: linkedDeals } = await supabase
    .from('sales_deals')
    // ⚠️ `ownerId` ต้องมีเสมอ — ด่านของเธรดดีล (scope 'own' ของ AE) เทียบช่องนี้
    // ขาดไปเมื่อไร AE จะไม่เห็นความเคลื่อนไหวของดีลตัวเองบนหน้าโครงการ
    /* ⚠️ `projectId` ต้องติดมาด้วย ทั้งที่ทุกแถวมีค่าเท่ากับโครงการใบนี้อยู่แล้ว —
       แถวดีลถูกส่งต่อเข้า `DealPicker` / `quotationDealBlocker` / `dealRequestEntries`
       ซึ่งอ่านช่องนี้เพื่อตอบว่า "ดีลผูกโครงการหรือยัง"
       🐞 ไม่มีช่องนี้ = ดีลของโครงการตัวเองขึ้นว่า **"ยังไม่ผูกโครงการ"** ⇒ ตัวเลือก
       ดีลบนหน้าโครงการเตือนผิด และปุ่มเปิดคำร้องบอกว่าเปิดไม่ได้ทั้งที่เปิดได้ */
    .select('id, title, stage, dealType, "projectId", "customerId", "customerName", projectValue, wonValue, forecastMonth, formulaName, ownerId, ownerName, team, probability, expectedCloseDate, metadata, createdAt')
    .eq('projectId', project.id)
    .order('createdAt', { ascending: true });
  const deals = sortDealsByOrder(linkedDeals || [], project.metadata?.dealOrder || []);
  const foundingDeal = deals[0] || null;
  const dealsRollup = rollupDeals(deals);

  // งานในโครงการมาจาก /sa/tasks ที่ผูกกับดีล ไม่สร้างความสัมพันธ์กับโครงการโดยตรง
  // อีกต่อไป แต่ยังรวม projectId เดิมไว้เพื่อรองรับข้อมูลเก่าและงานที่สร้างก่อนย้ายกฎ.
  const dealIds = deals.map((deal) => deal.id);
  let personalTasksQuery = supabase.from('personal_tasks').select('*');
  personalTasksQuery = dealIds.length
    ? personalTasksQuery.or(`projectId.eq.${project.id},dealId.in.(${dealIds.join(',')})`)
    : personalTasksQuery.eq('projectId', project.id);
  const { data: personalTasks } = await personalTasksQuery.order('createdAt', { ascending: false });

  // ศูนย์รวมโครงการ: โครงการ = จิ๊กซอว์ครอบดีล — ดึงของ "ใต้ดีล" (ใบเสนอราคา /
  // ความเคลื่อนไหว / ประวัติสถานะ) ของทุกดีลมารวมระดับโครงการ (อ่านอย่างเดียว —
  // เพิ่ม/แก้ทำที่หน้าดีลตามเดิม)
  let quotations = [];
  let salesOrders = [];
  let dealActivities = [];
  let dealStageHistory = [];
  let inquiries = [];
  let hiddenDealFeeds = 0;
  let dealFeedIds = [];
  if (deals.length) {
    const dealIds = deals.map((d) => d.id);

    // ⭐ ความเคลื่อนไหวของดีล (เธรด + ประวัติสถานะ) มีด่านของตัวเองซึ่ง **แคบกว่า**
    // ด่านของหน้าโครงการ: หน้านี้เปิดด้วย `pm:view` ซึ่ง role `staff` (PC/PD/WH/QC)
    // ก็มี ทั้งที่ไม่มี `salesplan:view` เลย → อ่านตารางตรงแบบเดิมเท่ากับปล่อย
    // บทสนทนาในดีลให้คนที่เปิดหน้าดีลไม่ได้อ่าน
    // ⚠️ ใช้ทะเบียน `canViewUpdates` ตัวเดียวกับ GET /api/updates เสมอ — ห้ามเขียน
    // กฎใหม่ตรงนี้ ไม่งั้นสองด่านจะเพี้ยนกันเองในวันที่ทะเบียนเปลี่ยน
    const dealVisibility = await Promise.all(
      deals.map((deal) => canViewUpdates(supabase, 'deal', deal, user)),
    );
    const feedDealIds = deals.filter((_, i) => dealVisibility[i]).map((deal) => deal.id);
    // จำนวนที่ถูกกรองออกส่งไปให้หน้าจอบอกผู้ใช้ตรง ๆ — เส้นเรื่องที่สั้นลงเงียบ ๆ
    // อ่านเหมือน "ไม่มีความเคลื่อนไหว" ซึ่งคนละความหมายกับ "คุณไม่มีสิทธิ์เห็น"
    hiddenDealFeeds = deals.length - feedDealIds.length;
    // ตัวกรอง "เลือกดีล" บนหน้าโครงการต้องเสนอเฉพาะใบที่อ่านเธรดได้จริง ไม่งั้น
    // เลือกแล้วได้ผลว่างโดยไม่รู้ว่าเพราะไม่มีความเคลื่อนไหวหรือไม่มีสิทธิ์
    dealFeedIds = feedDealIds;
    const emptyRows = Promise.resolve({ data: [] });

    const [{ data: quotes }, { data: orderRows }, { data: acts }, { data: hist },
      { data: inquiryRows, error: inquiryError }] = await Promise.all([
      supabase.from('quotations')
        .select('id, dealId, quoteNumber, status, approvalStatus, totalAmount, revisionNo, quoteDate, createdAt')
        .in('dealId', dealIds).order('createdAt', { ascending: false }),
      supabase.from('sales_orders')
        .select('id, dealId, quotationId, orderNumber, status, orderDate, actualAmount, totalAmount')
        .in('dealId', dealIds).order('orderDate', { ascending: false }),
      // mig 0169: ฟีดดีลอยู่ในเธรดกลางแล้ว (dealId → entityId, dueDate/activityAt/
      // meetingMode → meta) · normalize กลับเป็นรูปเดิมด้านล่างเพื่อไม่ให้ ProjectDealsHub
      // ต้องรู้จัก schema ของตารางกลาง
      feedDealIds.length ? supabase.from('entity_updates')
        .select('id, entityId, kind, body, meta, authorName, createdAt')
        .eq('entityType', 'deal').in('entityId', feedDealIds).is('deletedAt', null)
        .order('createdAt', { ascending: false }).limit(60) : emptyRows,
      feedDealIds.length ? supabase.from('sales_deal_stage_history')
        .select('id, dealId, fromStage, toStage, changedByName, changedAt')
        .in('dealId', feedDealIds).order('changedAt', { ascending: false }).limit(40) : emptyRows,
      // 🐞 เคยชี้ตาราง `inquiries` ซึ่งถูก DROP ไปใน mig 0174 — คำร้องอยู่ที่
      // `dept_requests` แล้ว · การ์ดคำร้องบนหน้าโครงการจึงว่างเปล่าเงียบ ๆ เพราะ
      // `const { data }` ทิ้ง error ไป (ดู lib rule: supabase masked query errors)
      supabase.from('dept_requests').select('*').or(`projectId.eq.${project.id},dealId.in.(${dealIds.join(',')})`).order('createdAt', { ascending: false }),
    ]);
    quotations = latestQuotationRevisions(quotes || []);
    salesOrders = orderRows || [];
    dealActivities = (acts || []).map((a) => ({
      id: a.id,
      dealId: a.entityId,
      kind: a.kind,
      body: a.body,
      dueDate: a.meta?.dueDate || null,
      activityAt: a.meta?.activityAt || null,
      meetingMode: a.meta?.meetingMode || null,
      createdByName: a.authorName || null,
      createdAt: a.createdAt,
    }));
    dealStageHistory = hist || [];
    // ⚠️ อย่าทิ้ง error เส้นนี้: ตอนตารางหายไปกับ mig 0174 การ์ดคำร้องว่างเปล่า
    // โดยไม่มีอะไรบอก อยู่หลายวันกว่าจะเจอ
    if (inquiryError) throw inquiryError;
    inquiries = inquiryRows || [];
  } else {
    // เส้นทางโครงการที่ยังไม่มีดีล — ตารางเดียวกับด้านบน (เคยค้างที่ `inquiries`)
    const { data, error: reqError } = await supabase.from('dept_requests')
      .select('*').eq('projectId', project.id).order('createdAt', { ascending: false });
    if (reqError) throw reqError;
    inquiries = data || [];
  }

  // ของเข้า PM/RM (mig 0176) — โหลดมากับหน้าโครงการเลย เพราะทั้งพาเนล "ของเข้า"
  // และป้ายสรุปบนขั้นไทม์ไลน์ใช้ชุดเดียวกัน (ยิงสองรอบ = ตัวเลขสองที่ไม่ตรงกันได้)
  // deliverySalesOrders = ตัวเลือก SO ให้ผูกรายแถว (mig 0177 — ของเข้าติดตามเพื่อ
  // ตอบว่าใบสั่งขายใบไหนเริ่มผลิตได้)
  const [deliveries, deliverySalesOrders] = await Promise.all([
    loadDeliveries(supabase, project.id),
    loadProjectSalesOrders(supabase, project),
  ]);

  // Tell the client whether THIS user may edit THIS record (cap + row scope),
  // so the UI gates edit controls by ownership — not just the pm:edit cap.
  const canEdit = inPmProjectScope(user, project);
  // สิทธิ์ลบ (deleteScope 'projects') — กติกาเดียวกับที่ DELETE ข้างล่างบังคับ
  // 🐞 หน้ารายการส่งค่านี้มาตั้งแต่แรก แต่หน้ารายละเอียดไม่เคยส่ง → การ์ด Control
  // ที่ถาม `canDelete` จะไม่เห็นปุ่มลบเลย (ของเดิมหน้านี้เดาเอาจาก canEdit)
  const canDelete = canDeleteRecord(user, 'projects', project);
  // ⚠️ สิทธิ์แก้ของเข้า ≠ canEdit ของโครงการ — PC (role staff) แก้ได้ทั้งที่
  // pmEditScope = 'none' ไม่งั้นคนที่รู้กำหนดจริงจะเป็นคนเดียวที่อัปเดตไม่ได้
  const canEditDeliveryRows = canEditDeliveries(user, project);
  // me: ใช้ฝั่ง client gate ปุ่มจัดการ "งานเพิ่มเติม" (owner/assignee/lead) + กรอง
  // ผู้รับมอบใน dropdown ตามทีมโครงการ.
  const me = user ? { id: user.id, name: user.name, role: user.role, team: user.team ?? null, teams: user.teams ?? [] } : null;
  // วันที่ของ Rev ที่ "อยู่ตอนนี้" (currentRev เป็นตัวชี้ — อาจถูกย้อนถอยหลังได้) — โชว์ในหัวพิมพ์
  // และ maxRev = เลข Rev สูงสุดที่เคยออก → ใช้คำนวณเลข Rev ถัดไป (ออก Rev ใหม่ = max+1 ไม่ชนเลข)
  let revisedAt = null;
  let maxRev = null;
  {
    const { data: maxRow, error: maxRowError } = await supabase
      .from('project_doc_revisions')
      .select('revNo')
      .eq('projectId', project.id)
      .eq('kind', 'rev')
      .order('revNo', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (maxRowError) return fail(maxRowError.message, 500);
    maxRev = maxRow?.revNo ?? null;
  }
  if (project.currentRev != null) {
    const { data: rev } = await supabase
      .from('project_doc_revisions')
      .select('createdAt')
      .eq('projectId', project.id)
      .eq('kind', 'rev')
      .eq('revNo', project.currentRev)
      .maybeSingle();
    revisedAt = rev?.createdAt ?? null;
  }
  return ok({ ...project, tasks: tasks || [], projectProducts, personalTasks: personalTasks || [], inquiries, deliveries, deliverySalesOrders, canEdit, canDelete, canEditDeliveries: canEditDeliveryRows, canApproveClose: canApproveProjectClose(user), me, revisedAt, maxRev, deals, dealsRollup, quotations, salesOrders, dealActivities, dealStageHistory, hiddenDealFeeds, dealFeedIds, dealId: foundingDeal?.id ?? null, dealStage: foundingDeal?.stage ?? null });
});

// PATCH /api/pm/projects/[id]
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  const { id: idOrCode } = await ctx.params;

  const project = await loadProject(supabase, idOrCode);
  if (!project) return notFound('ไม่พบโครงการ');
  if (!inPmProjectScope(user, project)) {
    return forbidden();
  }
  // ด่านหลังปิด (เฟส F): closed แล้วห้ามแก้เนื้อหา — ต้อง reopen ผ่าน /close ก่อน
  const closedErr = projectWriteBlockedError(project);
  if (closedErr) return conflict(closedErr);
  // From here on use the resolved internal id for all DB keys/FK subqueries.
  const id = project.id;

  const body = await req.json();
  const updates = pickFields(body, EDITABLE, { nullable: ['startDate', 'dueDate', 'line'] });
  // สายธุรกิจ: '' จากฟอร์ม → null (CHECK ของ 0191 ปฏิเสธ '') · ค่าที่ไม่รู้จัก → 400
  // ⚠️ ห้ามเงียบแล้วใส่ค่าให้เอง — เหตุผลเดียวกับที่คอลัมน์นี้ไม่มี default
  if (updates.line !== undefined) {
    const line = normalizeBusinessLine(updates.line);
    if (line === undefined) return badRequest('สายธุรกิจต้องเป็น PRODUCT หรือ SERVICE');
    updates.line = line;
  }
  // metadata: merge ทับของเดิมเสมอ — ห้าม replace ทั้งก้อน (กติกาเดียวกับ PATCH ดีล)
  // 🐞 เดิมเขียนทับทั้งก้อนจากสิ่งที่ client ส่งมา ทำให้กุญแจที่ route อื่นเขียนไว้หลุดหาย
  // เงียบ ๆ: `dealOrder` (PUT /deal-order — ลำดับ segment ของดีล + stepOrder ที่จัดตามนั้น),
  // `salesDealId`/`salesDealTitle`/`source` (create-project). ฟอร์มฝั่งหน้าเว็บ spread ของเดิม
  // มาให้ก็จริง แต่มันคือ snapshot ตอนเปิดฟอร์ม — จัดลำดับดีลระหว่างฟอร์มเปิดค้างแล้วกดบันทึก
  // = ลำดับที่เพิ่งจัดถูกย้อนกลับ. ค่าไม่ใช่ object (null/'') ไม่รับ: ไม่มีเส้นทางล้างทั้งก้อน
  if (updates.metadata !== undefined) {
    if (!updates.metadata || typeof updates.metadata !== 'object' || Array.isArray(updates.metadata)) {
      delete updates.metadata;
    } else {
      updates.metadata = { ...(project.metadata || {}), ...updates.metadata };
    }
  }
  if (
    updates.productMainCategory !== undefined &&
    (updates.productMainCategory || '') !== (project.productMainCategory || '')
  ) {
    const categoryError = await activeProductTypeError(updates.productMainCategory || null);
    if (categoryError) return badRequest(categoryError);
  }
  /* ── เปลี่ยนผู้ดูแล (AE) = ย้ายขอบเขตของโครงการตามไปด้วย ────────────────────
     `team` + `ownerId` คือสองช่องที่ลิสต์ใช้กรอง (ไม่ใช่ `aeOwnerId`) ⇒ ปล่อยให้ค้าง
     ของเจ้าของเดิม = ผู้ดูแลคนใหม่ไม่เห็นโครงการที่เพิ่งรับมาในลิสต์ตัวเอง ซึ่งเป็น
     บั๊กเดียวกับตอนสร้าง (ดู lib/pm/projectOwner.js)
     ⚠️ สองช่องนี้ **ไม่อยู่ใน EDITABLE โดยเจตนา** — server เป็นคนเขียนจาก id ที่ตรวจแล้ว
     เท่านั้น ห้ามเปิดให้ client ส่งมาเอง (ไม่งั้นยกโครงการเข้าทีมที่ตัวเองไม่ได้อยู่ได้)
     ด่านทีมของ resolveProjectAeOwner กันคนสั่งระดับทีมไม่ให้ยกข้ามทีมอยู่แล้ว
     จึงไม่ต้องตรวจ inPmProjectScope ซ้ำหลังแก้ */
  if (updates.aeOwnerId !== undefined && (updates.aeOwnerId || null) !== (project.aeOwnerId || null)) {
    if (!updates.aeOwnerId) return badRequest('ล้างผู้ดูแลโครงการไม่ได้ — เลือก AE คนใหม่แทน');
    const checked = await resolveProjectAeOwner(supabase, updates.aeOwnerId, user, project.team);
    if (!checked.ok) return badRequest(checked.error);
    updates.aeOwnerId = checked.aeOwnerId;
    // ชื่อเดินคู่ id เสมอ — คนละคนแล้ว ไม่ใช่ "คนเดิมเปลี่ยนชื่อ" (กติกาห้ามซิงก์ชื่อ
    // ใน personNameFanOut.js พูดถึงการ **เปลี่ยนชื่อบัญชี** ไม่ใช่การเปลี่ยนตัวคน)
    updates.aeOwner = checked.aeOwner;
    // ผู้ดูแลคนใหม่ที่บัญชียังไม่ถูกจัดทีม → **คงทีมเดิมไว้** ห้ามล้างเป็น null:
    // ทีมเดิมคือคนที่ทำงานใบนี้อยู่จริง และ null จะพาโครงการหายจากลิสต์ของทั้งทีม
    updates.team = checked.team || project.team || null;
    updates.ownerId = checked.ownerId;
  }
  /* ผู้ประสานงาน (AC) — ตรวจเมื่อค่าเปลี่ยนเท่านั้น เพราะ `acOwnerId` คือปลายทาง
     แจ้งเตือน (updateAccess) ⇒ id ที่ไม่ใช่บัญชี AC ของทีมนี้ แปลว่าความเคลื่อนไหว
     ของโครงการวิ่งไปหาคนที่ไม่เกี่ยวข้อง
     ⚠️ ไม่แตะ `team`/`ownerId` — AC เป็นผู้ประสานงาน ไม่ใช่เจ้าของงาน
     ⚠️ **ล้างทิ้งไม่ได้** (มติผู้ใช้ 2026-08-14: โครงการมีครบสามฝ่าย) — แต่ใบเก่าที่
     ช่องนี้ว่างอยู่แล้วยังแก้ช่องอื่นได้ตามปกติ ด่านนี้ยิงเฉพาะตอน "มีอยู่แล้วแล้วล้าง" */
  if (updates.acOwnerId !== undefined && (updates.acOwnerId || null) !== (project.acOwnerId || null)) {
    if (!updates.acOwnerId) return badRequest('ล้างผู้ประสานงาน (AC) ไม่ได้ — เลือกคนใหม่แทน');
    const team = updates.team !== undefined ? updates.team : project.team;
    const coordinator = await resolveProjectAcOwner(supabase, updates.acOwnerId, team);
    if (!coordinator.ok) return badRequest(coordinator.error);
    updates.acOwnerId = coordinator.acOwnerId;
    // ชื่อเดินคู่ id เสมอ — เปลี่ยนคนแล้วชื่อบนใบต้องเปลี่ยนตาม
    updates.acOwner = coordinator.acOwner;
  }
  /* ผู้ตรวจสอบ (AE Supervisor) — ล้างทิ้งไม่ได้เช่นกัน · ชื่อไหลต่อไปขึ้นใบเสนอราคา
     (หน้าออกใบอ่าน `project.aeSupervisor` มาตั้งต้น) จึงต้องเป็นชื่อของบัญชีจริง */
  if (updates.aeSupervisorId !== undefined
      && (updates.aeSupervisorId || null) !== (project.aeSupervisorId || null)) {
    if (!updates.aeSupervisorId) return badRequest('ล้างผู้ตรวจสอบ (AE Supervisor) ไม่ได้ — เลือกคนใหม่แทน');
    const supervisor = await resolveProjectSupervisor(supabase, updates.aeSupervisorId);
    if (!supervisor.ok) return badRequest(supervisor.error);
    updates.aeSupervisorId = supervisor.aeSupervisorId;
    updates.aeSupervisor = supervisor.aeSupervisor;
  }
  updates.updatedAt = new Date().toISOString();

  const { data, error } = await supabase.from('projects').update(updates).eq('id', id).select().single();
  if (error) {
    // code ซ้ำ (unique constraint) → 409 ให้ตรงกับ POST แทน 500 ที่กำกวม
    if (error.code === '23505') return fail('รหัสโครงการซ้ำ: ' + (updates.code ?? ''), 409);
    return fail(error.message, 500);
  }

  // ข้อ 2: หมวดสินค้าพลิกสถานะสรรพสามิต (product_types.isExcise — mig 0131 เลิก
  // hardcode 01-002) → ปรับชุดขั้นตอนแบบ incremental (เพิ่ม/ลบเฉพาะขั้นตอน
  // สรรพสามิต, คงความคืบหน้าเดิม + ขั้นตอนที่เพิ่มเอง).
  const oldCat = project.productMainCategory || '';
  const newCat = updates.productMainCategory !== undefined ? (updates.productMainCategory || '') : oldCat;
  let newCatFlags = null;
  let exciseFlipped = false;
  if (newCat !== oldCat) {
    const [oldFlags, nextFlags] = await Promise.all([categoryFlagsOf(oldCat), categoryFlagsOf(newCat)]);
    newCatFlags = nextFlags;
    exciseFlipped = oldFlags.isExcise !== nextFlags.isExcise;
  }
  // วันเริ่มเปลี่ยน → คำนวณ timeline ใหม่ (forward จากวันเริ่ม). dueDate เป็นแค่เป้าหมาย
  // (โชว์เป็นหมุดบน Gantt) ไม่ขับการคำนวณแล้ว — เปลี่ยน dueDate จึงไม่ต้องเลื่อนขั้นตอน.
  const dateChanged =
    ('startDate' in updates && (updates.startDate || null) !== (project.startDate || null));
  if (exciseFlipped) {
    setHolidays([...(await holidaySet())]);
    const { data: existing, error: existingError } = await supabase
      .from('project_tasks').select('*').eq('projectId', id).order('stepOrder', { ascending: true });
    if (existingError) return fail(existingError.message, 500);
    // เฟส B: โครงการหลาย segment (หลายดีล) — merge/resync ทั้งชุดจะจับคู่ชื่อข้าม segment
    // แล้วลบงานผิดตัว → ข้าม resync อัตโนมัติ (จัดการขั้นสรรพสามิตของ segment ใหม่
    // ตั้งแต่ตอน gen ด้วย categoryOnly อยู่แล้ว; ปรับย้อนหลังทำมือ/เฟสถัดไป)
    const segIds = new Set((existing || []).map((t) => t.dealId).filter(Boolean));
    if (segIds.size > 1) {
      await recordAudit({ user, action: 'update', entityType: 'project', entityId: id, before: project, after: data, summary: `เปลี่ยนหมวดสินค้า ${data.code || id} (หลาย segment — ข้าม resync ขั้นตอนอัตโนมัติ)`, request: req });
      return ok(data);
    }
    const versionIds = [...new Set((existing || [])
      .filter((task) => task.origin !== 'custom')
      .map((task) => task.workflowTemplateVersionId)
      .filter(Boolean))];
    let templateOptions = {};
    // Pre-0121 tasks have no provenance and intentionally stay on the static/
    // legacy-aware path. A single pinned version is safe to load even after it
    // becomes Archived; multiple versions in one segment require explicit UAT.
    if (versionIds.length === 1) {
      try {
        // แม่แบบ = คู่ (สายของโครงการ, ประเภทงาน) ตั้งแต่ 2026-08-20 — โครงการสายบริการ
        // ปักหมุดเวอร์ชันของคีย์ SERVICE-* ⇒ ส่งแค่ `data.type` จะเด้ง version mismatch
        templateOptions = await loadWorkflowTemplateForDeal(supabase, { line: data.line, dealType: data.type }, versionIds[0]);
      } catch (templateError) {
        return fail(templateError.message || 'โหลด Workflow Template ไม่สำเร็จ', templateError instanceof WorkflowTemplateError ? templateError.status : 500);
      }
    } else if (versionIds.length > 1) {
      return conflict('ขั้นตอนของ segment นี้อ้างหลาย Template version กรุณาตรวจข้อมูลก่อน resync');
    }
    // ธงของหมวดใหม่ — ให้ template rule แบบ token flag:excise (mig 0131) กรองถูกชุด
    templateOptions.categoryFlags = newCatFlags;
    const { templateRows, customRows, toDeleteIds, existingIds } = mergeTemplateTasks(data, existing || [], templateOptions);

    if (toDeleteIds.length) await supabase.from('project_tasks').delete().in('id', toDeleteIds);

    await Promise.all([
      // template rows: insert ตัวใหม่, update ตัวที่ reuse id เดิม
      ...templateRows.map((r) => {
        if (existingIds.has(r.id)) {
          const { id: _i, projectId: _p, ...upd } = r;
          return supabase.from('project_tasks').update(upd).eq('id', r.id);
        }
        return supabase.from('project_tasks').insert(r);
      }),
      // custom rows: ปรับลำดับให้อยู่ท้าย + ตัด dangling predecessors (ถ้ามี — mergeTemplateTasks
      // ใส่ field predecessors มาเฉพาะแถวที่ต้องล้าง reference ไปขั้นที่ถูกลบ)
      ...customRows.map((r) => {
        const upd = { stepOrder: r.stepOrder };
        if (r.predecessors !== undefined) upd.predecessors = r.predecessors;
        return supabase.from('project_tasks').update(upd).eq('id', r.id);
      }),
    ]);
  } else if (dateChanged) {
    // หมวดไม่เปลี่ยน แต่วันเริ่ม/วันจบเปลี่ยน → คำนวณ start/finish ทุก task ใหม่
    setHolidays([...(await holidaySet())]);
    // query พังแล้วเงียบ = ไม่ได้เลื่อนวันของ task ใด ๆ ทั้งที่ผู้ใช้เปลี่ยนวันโครงการไปแล้ว
    // → ไทม์ไลน์ค้างวันเก่าโดยไม่มีอะไรบอก
    const { data: existing, error: existingError } = await supabase
      .from('project_tasks').select('*').eq('projectId', id).order('stepOrder', { ascending: true });
    if (existingError) return fail(existingError.message, 500);
    if (existing && existing.length) {
      const recalced = recalculateGraph(existing, resolveSchedule(data).anchor);
      await Promise.all(
        recalced
          .filter((r, i) => r.startDate !== existing[i].startDate || r.finishDate !== existing[i].finishDate)
          .map((r) => supabase.from('project_tasks').update({
            startDate: r.startDate, finishDate: r.finishDate, cellsOverride: r.cellsOverride ?? null,
          }).eq('id', r.id)),
      );
    }
  }

  // Update project_products if provided
  let productWarning = null;
  if (body.projectProducts && Array.isArray(body.projectProducts)) {
    // Delete existing
    await supabase.from('project_products').delete().eq('projectId', id);
    // Insert new
    if (body.projectProducts.length > 0) {
      const ppRows = body.projectProducts.map((p) => ({
        id: genId('PP'),
        projectId: id,
        productId: p.productId,
        orderQty: p.orderQty || null,
        productionQty: p.productionQty || null,
      }));
      const { error: ppErr } = await supabase.from('project_products').insert(ppRows);
      // ลบของเดิมไปแล้ว แต่ insert ใหม่ fail → แจ้ง warning (อย่าตอบเหมือนสำเร็จ)
      if (ppErr) { console.error('Failed to link products during PATCH:', ppErr.message); productWarning = 'อัปเดตรายการสินค้า (FG) ไม่สำเร็จ — โปรดตรวจ/ผูกใหม่ที่หน้าโครงการ'; }
    }
  }

  // เฟส B: เลิก sync ชื่อโครงการ→ชื่อดีล — โครงการมีได้หลายดีล (ชื่อดีล ≠ ชื่อโครงการ
  // อีกต่อไป) การ sync จะทับชื่อทุกดีลด้วยชื่อเดียว. ฝั่งดีล→โครงการก็ตัดคู่กัน.

  const summary = data.status !== project.status
    ? `เปลี่ยนสถานะโครงการ ${data.code || id}: ${project.status} → ${data.status}` : null;
  await recordAudit({ user, action: 'update', entityType: 'project', entityId: id, before: project, after: data, summary, request: req });
  return ok({ ...data, ...(productWarning ? { productWarning } : {}) });
});

// DELETE /api/pm/projects/[id] — เฟส B โครงการเป็นเอนทิตีอิสระ (มีได้หลายดีล และ
// ลบดีลไม่ลบโครงการ). รับลบเฉพาะโครงการ "กำพร้า" (0 ดีล) — ไม่ว่าจะเป็นข้อมูล PM เก่า
// หรือโครงการที่ดีลถูกลบออกไปหมดแล้ว. โครงการที่ยังผูกดีลต้องลบดีลออกก่อน (กันดีลกำพร้า).
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  const { id: idOrCode } = await ctx.params;

  const project = await loadProject(supabase, idOrCode);
  if (!project) return notFound('ไม่พบโครงการ');
  const id = project.id;
  // delete scope: superuser=all; senior_ae=own team; others none (deleteScope 'projects')
  if (!canDeleteRecord(user, 'projects', project)) {
    return forbidden();
  }
  // force = ทางลัดผู้ดูแลระบบ (admin): ลบโครงการที่ยังผูกดีลได้ (ดีลจะถูกปลดลิงก์
  // projectId→null ผ่าน FK SET NULL — ไม่กำพร้า) + ลบทะเบียนสรรพสามิตพ่วง.
  const force = isForceRequest(req) && canForceDelete(user);

  /* ด่านหลังปิด (เฟส F): โครงการที่ปิดอนุมัติแล้วลบไม่ได้ — ต้อง reopen ก่อน
     ⭐ **ยกเว้นผู้ดูแลระบบที่กด ?force=1** (มติผู้ใช้ 2026-08-28 "ขอสิทธิ์ทุกอย่างให้
     แอดมิน รวมลบด้วย") — ของเดิมด่านนี้อยู่ **ก่อน** ตัวแปร force และคอมเมนต์กำกับ
     ไว้เองว่า "รวม force" ⇒ แอดมินต้องไปเปิดโครงการที่ปิดแล้วใหม่ก่อนเสมอ ซึ่งเป็น
     การแก้สถานะเอกสารจริงเพื่อจะลบทิ้ง = ทิ้งร่องรอยผิดไว้ในประวัติ */
  const closedErr = projectWriteBlockedError(project);
  if (closedErr && !force) return conflict(closedErr);

  // ผูกดีลอยู่ (กี่ใบก็ตาม — เฟส B หลายดีลต่อโครงการ) → ปฏิเสธ ให้ไปลบดีลก่อน
  // กันการลบ project ทิ้งไว้ให้ดีลกำพร้า. โครงการกำพร้า (0 ดีล) เท่านั้นที่ลบตรงนี้ได้.
  // การลบดีล "ไม่ลบโครงการให้อัตโนมัติ" — ลบดีลครบแล้วโครงการจะว่าง แล้วค่อยลบที่นี่.
  if (!force) {
    const { count: linkedCount } = await supabase
      .from('sales_deals').select('id', { count: 'exact', head: true }).eq('projectId', id);
    if ((linkedCount || 0) > 0) {
      return conflict('โครงการนี้ผูกกับดีลอยู่ — ลบดีลที่ผูกทั้งหมดที่หน้า "บริหารงานขาย" ก่อน แล้วจึงลบโครงการที่นี่ได้ (การลบดีลจะไม่ลบโครงการให้อัตโนมัติ)');
    }
  }

  try {
    if (force) await forceDeleteProjectExcise(supabase, id);
    await deleteProjectDeep(supabase, id);
  } catch (e) {
    return fail(e.message, 500);
  }
  await recordAudit({
    user, action: 'delete', entityType: 'project', entityId: id, before: project,
    summary: `ลบโครงการ ${force ? '(บังคับลบ — สิทธิ์ผู้ดูแลระบบ)' : '(กำพร้า)'} ${project.code || id} ${project.name || ''}`.trim(),
    request: req,
  });

  return ok({ success: true, forced: force });
});
