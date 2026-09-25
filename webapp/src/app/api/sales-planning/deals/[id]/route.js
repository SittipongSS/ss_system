import { genId } from '@/lib/id';
import { recordAudit } from '@/lib/audit';
import { requestsLinkedTo, sentRequestsBlockMessage } from '@/lib/requests/cascadeDelete';
import { requestCascadeAuditor } from '@/lib/requests/cascadeAudit';
import { caretakerTeamsOf, hasTeam, isSalesManager, userTeams, viewScopeUser } from '@/lib/permissions';
import { emptyProjectAfterDealDelete, loadProject } from '@/lib/pm/projectsRepo';
import {
  isForceRequest, isDryRun, canForceDelete,
  dealForcePreview, cleanupDealOrphans,
  dealSignedDocuments, dealSignedBlockMessage, forceDeleteDealDocuments,
  exciseFilingsOfDeal, exciseFilingBlockMessage,
  contractsOfDeal, contractBlockMessage,
} from '@/lib/forceDelete';
import { resolveProbability } from '@/lib/sales/dealProbability';
import { validateDealOwner } from '@/lib/sales/dealOwner';
import { dealCustomerPatchError } from '@/lib/sales/dealCustomerAdopt';
import { isForeignKeyViolation } from '@/lib/sales/salesOrderWorkflow';
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
import { customerSnapshotName } from '@/lib/master/customerName';
import { activeProductTypeError } from '@/lib/master/productTypes';
import { normalizeBusinessLine } from '@/lib/master/businessLines';
import { loadDealValueItems, prepareDealValueItems, saveDealValueItems } from '@/lib/sales/dealValueItemsRepo';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { dealUnlinkedUpdate } from '@/lib/pm/projectUpdates';
import { dealForecastUpdate } from '@/lib/sales/dealUpdates';
import { buildDealTimelineRows } from '@/lib/sales/dealTimelineGen';
import { purgeAttachments } from '@/lib/master/attachments';
import { purgeSalesOrderFiles, salesOrderIdsOfDeal } from '@/lib/sales/salesOrderAttachmentAccess';
import { isDealFormSave, missingDealDatesAfterWrite } from '@/lib/sales/dealRequiredFields';
import { clientDealMetadataOnPatch } from '@/lib/sales/legacyDealSwitch';
import { loadLeadForLink, releaseLeadAfterDealGone } from '@/lib/sales/dealLeadLinkRepo';
import { dealLabelForLead } from '@/lib/sales/dealLeadLink';
import { naText } from '@/lib/format';
import { historicalDealWriteMessage } from '@/lib/sales/documentWorkflowErrors';
import {
  HISTORICAL_UNAPPROVED_STATUSES, canMoveHistoricalDealOwner, historicalDealPatchError, historicalOwnerTakenMessage,
  historicalRowsOnly, isHistoricalDeal,
} from '@/lib/sales/historicalOrders';

export const dynamic = 'force-dynamic';

// ป้ายต้องตรงกับที่ตาเห็นบนฟอร์ม (ดู lib/sales/dealRequiredFields)
const DEAL_DATE_LABEL = { startDate: 'วันที่เริ่ม', endDate: 'วันที่สิ้นสุด (ลูกค้าต้องการรับ)' };

const selectDeal = `
  *,
  customer:customers(id, name, "nameEn", arCode)
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
  /* รายการมูลค่าคาดการณ์รายหมวด (mig 0264) — มากับใบเสมอ เพราะฟอร์มแก้ต้องได้ของ
     ชุดเดียวกับที่บันทึกไว้ · ดีลเก่าคืน [] ตามจริง
     ⚠️ ห้ามกลืน error เป็น [] — ฟอร์มจะเปิดมาว่างแล้วกดบันทึกทับแถวจริงทิ้ง */
  let valueItems = [];
  try {
    valueItems = await loadDealValueItems(supabase, id);
  } catch (itemsError) {
    return fail(itemsError.message, 500);
  }
  return ok({ ...deal, forecastDrift, valueItems });
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
  /* ดีลของใบสั่งขายย้อนหลัง (mig 0360) — ช่องที่ CHECK sales_deals_historical_shape ตรึงไว้ (ลูกค้า · สาย · ประเภท ·
     ทีมว่าง) ตีกลับเป็นไทยก่อนถึงฐาน · ย้ายเจ้าของ/เปลี่ยนเป็นทีมที่มีจริงผ่านได้ (ด่านย้ายเจ้าของอยู่ข้างล่าง) */
  const historicalPatchError = historicalDealPatchError(before, body);
  if (historicalPatchError) return conflict(historicalPatchError);

  /* ⭐ **ลูกค้าของดีลมีด่านแล้ว** (มติผู้ใช้ 2026-08-24 รอบสอง) — ของเดิมปล่อย
     `customerId` จาก body เข้าคอลัมน์ตรง ๆ ไม่ตรวจอะไรเลย ⇒ เดินอ้อมด่านของ
     `link-project` ได้ทั้งชุด (prod หลุดจริง 1 ใบ: DL-26080193 ดีลของ หจก. ผูก
     โครงการของ บจก. พร้อมใบเสนอราคา 2 ใบ) · กติกาอยู่ที่ lib/sales/dealCustomerAdopt
     ที่เดียว ใช้ร่วมกับเส้นทาง "ตั้งลูกค้าตอนออกใบเสนอราคา"
     ⚠️ `customerName` ไม่รับจาก body อีกต่อไป — อ่านจากทะเบียนเสมอ ไม่งั้นชื่อกับ id
     หลุดจากกันได้ (ส่งชื่อรายหนึ่งพร้อม id อีกรายหนึ่ง) */
  const patch = {
    updatedAt: new Date().toISOString(),
  };
  /* 🐞 ตรวจ 2026-09-16: ล้างวันที่คาดปิดได้เงียบ ๆ ⇒ ดีลเปิดหลุดจาก FC ทุกเดือน (เดือน FC มาจากช่องนี้ช่องเดียว)
     และดีล Won ก็เสียวันอ้างอิงของตัวเอง · ทั้งฟอร์มสร้างและฟอร์มแก้บังคับช่องนี้อยู่แล้ว ⇒ ปฏิเสธการล้างค่าทุกกรณี */
  if ('expectedCloseDate' in body && !monthKey(body.expectedCloseDate)) {
    return badRequest('ต้องระบุวันที่คาดปิด — เดือน FC ของดีลมาจากช่องนี้');
  }
  for (const key of ['expectedCloseDate', 'lostReason', 'notes', 'team']) {
    if (key in body) patch[key] = body[key] === '' ? null : body[key];
  }
  if ('customerId' in body) {
    const nextCustomerId = body.customerId === '' ? null : body.customerId;
    if (String(before.customerId || '') !== String(nextCustomerId || '')) {
      let customer = null;
      if (nextCustomerId) {
        const { data, error: customerError } = await supabase
          .from('customers').select('id, name, "nameEn", team, teams, "approvalStatus", "isActive"')
          .eq('id', nextCustomerId).maybeSingle();
        // อ่านไม่ได้ ≠ ไม่มีลูกค้ารายนี้ — ไม่งั้นด่านตอบ "ไม่พบลูกค้าที่เลือก" ผิดเรื่อง
        if (customerError) return fail(customerError.message, 500);
        customer = data || null;
        // ขอบเขตทีมตรวจที่นี่ (ต้องใช้ user) — ที่เหลือเป็นกติกาบริสุทธิ์ใน lib
        const teams = caretakerTeamsOf(customer);
        if (customer && viewScopeUser(user) === 'team' && userTeams(user).length
          && teams.length && !hasTeam(user, teams)) {
          return badRequest('ลูกค้ารายนี้อยู่ในความดูแลของทีมอื่น');
        }
      }
      // นับของที่งอกจากดีลแล้ว เฉพาะตอนที่ดีลมีลูกค้าอยู่ก่อน (เติมช่องว่างไม่ต้องนับ)
      let counts = {};
      if (before.customerId) {
        const [q, so, rq] = await Promise.all([
          supabase.from('quotations').select('id', { count: 'exact', head: true }).eq('dealId', before.id),
          supabase.from('sales_orders').select('id', { count: 'exact', head: true }).eq('dealId', before.id),
          supabase.from('dept_requests').select('id', { count: 'exact', head: true }).eq('dealId', before.id),
        ]);
        /* 🐞 เดิมไม่ดู error — นับพลาด = count เป็น null → 0 ⇒ ด่านเห็นว่ายังไม่มีเอกสาร
           แล้วปล่อยสลับลูกค้าบนดีลที่มี QT/SO/คำร้องอยู่แล้ว (อาการ DL-26080193 ข้างบน)
           ยังไม่ได้เขียนอะไรเลย ⇒ หยุดตรงนี้ปลอดภัย */
        const countError = q.error || so.error || rq.error;
        if (countError) return fail(countError.message, 500);
        counts = { quotations: q.count || 0, salesOrders: so.count || 0, requests: rq.count || 0 };
      }
      const gateError = dealCustomerPatchError({
        deal: before,
        customer,
        // ขอ id ที่ไม่มีในทะเบียน ต้องตีกลับ ไม่ใช่ตีความเป็น "ล้างลูกค้า"
        requestedId: nextCustomerId,
        project: before.projectId ? await loadProject(supabase, before.projectId) : null,
        counts,
        isWon: alreadyWon,
      });
      if (gateError) return badRequest(gateError);
      patch.customerId = nextCustomerId;
      // ลูกค้าที่มีแต่ชื่ออังกฤษต้องไม่ถูกประทับเป็น null ลงคอลัมน์สำเนา
      patch.customerName = customerSnapshotName(customer);
    }
  }
  /* เปลี่ยนผู้รับผิดชอบ — ด่านเดียวกับตอนสร้าง (lib/sales/dealOwner.js)
     🐞 ของเดิม ownerId/ownerName ไหลจาก body ตรงเข้า patch: ปลอมชื่อได้ และยกดีลให้
     คนที่แตะดีลของตัวเองไม่ได้ก็ได้ (ด่าน inSalesEditScope ข้างล่างตรวจแค่ว่า **ผู้แก้**
     ยังเห็นแถวหลังแก้อยู่ไหม ไม่ได้ตรวจว่าผู้รับเป็นใคร) */
  let ownerTeam = null;
  if ('ownerId' in body) {
    const checked = await validateDealOwner(supabase, body.ownerId, user, body.team);
    if (!checked.ok) return badRequest(checked.error);
    patch.ownerId = checked.ownerId;
    patch.ownerName = checked.ownerName;
    ownerTeam = checked.team || null;
    if (ownerTeam) patch.team = ownerTeam;
  }
  /* ── ย้ายเจ้าของดีลของใบสั่งขายย้อนหลังทีละใบ (คำตอบข้อ 4 · mig 0360) ─────────────────
     ⭐ ปุ่มโอนงานพนักงานไม่ย้ายดีลภาชนะ (ดีล Won อยู่นอกเงื่อนไขโอน) ⇒ ทางย้ายคือ PATCH `{ ownerId }` ทีละใบ
       · AE ปลายทางผ่าน validateDealOwner ข้างบนแล้ว (AE/Senior AE ที่ยังใช้งานอยู่ · ทีมตามเจ้าของ)
     ⚠️ เฉพาะ AE Supervisor/Admin (canMoveHistoricalDealOwner) — ดีลภาชนะถือใบย้อนหลังทุกใบของคู่ (ลูกค้า × AE)
        · แคบกว่าผู้คีย์ใบโดยเจตนา (0374 ขยายผู้คีย์เป็นฝ่ายขายทุกตำแหน่ง แต่การย้ายเจ้าของยังเป็นของหัวหน้า)
     ⚠️ AE ปลายทางมีดีลภาชนะของลูกค้ารายนี้อยู่แล้ว = 409 (P1 ไม่รวมดีล) · UNIQUE ของ 0360 คือด่านสุดท้าย
       (แข่งกันพอดี ⇒ historicalDealWriteMessage ตอนเขียนข้างล่าง) */
  const historicalOwnerMove = isHistoricalDeal(before) && 'ownerId' in patch
    && String(patch.ownerId || '') !== String(before.ownerId || '');
  if (historicalOwnerMove) {
    if (!canMoveHistoricalDealOwner(user)) {
      return forbidden('ย้ายเจ้าของดีลของใบสั่งขายย้อนหลังได้เฉพาะ AE Supervisor หรือ Admin');
    }
    /* ทีมตามดีล = ทีมของ AE ปลายทาง (คำตอบข้อ 1) — ด่านเดียวกับตอนคีย์ (historicalOrderPlan · RPC
       historical_so_team_required) · 🐞 ไม่ตรวจ = AE ที่ยังไม่มีทีมรับดีลไปโดย team ค้างเป็นทีมคนเดิม
       (0360 CHECK ผ่านเพราะ team ไม่ว่าง) · ทับ team ทุกครั้ง — body.team ที่ค้างมาต้องไม่คงทีมเก่าไว้ */
    if (!ownerTeam) {
      return badRequest('AE คนนี้ยังไม่มีทีม — ตั้งทีมที่หน้าจัดทีมก่อน จึงย้ายดีลของใบย้อนหลังให้ได้ (ทีมตามดีล)');
    }
    patch.team = ownerTeam;
    /* ใบย้อนหลังที่ยังไม่อนุมัติ (ร่าง · รออนุมัติ · ตีกลับ) ค้างอยู่ = ย้ายไม่ได้ (409) — เอกสารแทนสัญญาร่างของใบ
       ถือทีม/เจ้าของตามดีลตอนคีย์ (0374) และการย้ายนี้ไม่ได้ซิงก์สองช่องนั้นของสัญญา
       ⇒ ย้ายไปแล้วเจ้าของใหม่จัดการไฟล์สัญญาร่างของใบตัวเองไม่ได้ · ให้ปิดเรื่องก่อน (อนุมัติ หรือยกเลิก) แล้วค่อยย้าย
       ⚠️ ใบที่อนุมัติแล้วไม่ติด — เอกสารแทนสัญญาอนุมัติพร้อมใบไปแล้ว (ไม่ใช่ร่างที่ยังต้องแนบไฟล์) ย้ายได้ตามคำตอบข้อ 4 */
    const { data: unapproved, error: unapprovedError } = await historicalRowsOnly(supabase.from('sales_orders')
      .select('id, "orderNumber"').eq('dealId', id))
      .in('status', [...HISTORICAL_UNAPPROVED_STATUSES]).limit(1);
    if (unapprovedError) return fail(unapprovedError.message, 500);
    if (unapproved?.length) {
      const which = unapproved[0].orderNumber || unapproved[0].id;
      return conflict(`ดีลนี้มีใบย้อนหลังที่ยังไม่อนุมัติ (${which}) — อนุมัติหรือยกเลิกก่อนย้ายเจ้าของ`);
    }
    const { data: taken, error: takenError } = await historicalRowsOnly(supabase.from('sales_deals')
      .select('id, code').eq('customerId', before.customerId).eq('ownerId', patch.ownerId))
      .neq('id', id).limit(1);
    if (takenError) return fail(takenError.message, 500);
    if (taken?.length) return conflict(historicalOwnerTakenMessage(patch.ownerName, taken[0].code));
  }
  // metadata: merge ทับของเดิมเสมอ — ห้าม replace ทั้งก้อน เพราะกุญแจระบบที่ flow อื่น
  // เขียนไว้ (acceptedQuotationId/wonDocType/wonMonth จาก accept_quotation RPC,
  // sahamitPoId/poLineIds/sahamitMergedIntoDealId จาก settle สหมิตร) จะหลุดหายเงียบ ๆ
  // — trigger 0110 กู้คืนแค่ actualSource/wonMonth/wonValueExVat. ค่าไม่ใช่ object
  // (null/'') ไม่รับ: endpoint นี้ไม่มีเส้นทางล้าง metadata ทั้งก้อน
  // · คีย์ของระบบ (actualSource · legacyClosedValue/Date ของ mig 0359 · wonSource/acceptedQuotationId
  //   ของ RPC รับใบเสนอราคา) client แก้ไม่ได้ — ถอดจาก **ค่าที่ส่งมา** ก่อน merge ค่าเดิมใน before จึงอยู่ต่อ
  //   (ถอดจากผลรวม = ลบบันทึก 0359 และตัดดีลออกจากใบเสนอราคาที่รับทุกครั้งที่ PATCH)
  // · ธง legacy เป็นของตอนสร้างเท่านั้น — PATCH ไม่รับค่าจาก client เลย ค่าใน before อยู่ต่อเสมอ
  //   🐞 ไม่ถอด = ส่ง {metadata:{legacy:false}} มาเองบนดีลเก่าที่สร้างเป็น Won ผ่านทุกด่านข้างบน ⇒ ตัวบ่งชี้
  //   isLegacyWonAtCreate หลุด ดีลกลับเข้ากอง "Won รอยื่น SO" · ถอดเฉพาะเส้นนี้ (POST ต้องเก็บธง)
  if (body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)) {
    patch.metadata = { ...(before.metadata || {}), ...clientDealMetadataOnPatch(body.metadata) };
  }
  /* ⭐ บันทึกจากฟอร์มดีล ต้องมีวันเริ่ม + วันสิ้นสุดเสมอ (มติผู้ใช้ 2026-09-02)
     ⚠️ ตรวจจาก **ดีลหลังบันทึก** ไม่ใช่จาก body — PATCH เส้นนี้มีผู้เรียกแบบ action
        (เปลี่ยนขั้น · ผูก/ปลดโครงการ) ที่ส่งมาไม่กี่ช่อง · ถ้าตรวจ body ตรง ๆ ปุ่มพวกนั้น
        จะถูกบล็อกบนดีลเก่าที่ยังไม่มีวัน ทั้งที่ไม่ได้แตะวันเลย
     ⚠️ `isDealFormSave` แยกสองเส้นด้วย `title` ซึ่งฟอร์มส่งมาทุกครั้ง ส่วน action ไม่เคยส่ง */
  // ดีลของใบสั่งขายย้อนหลังไม่มีวันเริ่ม/สิ้นสุด (ไม่ได้เดินในท่อ) — บันทึกจากฟอร์มต้องไม่ถูกบังคับกรอกวัน
  if (isDealFormSave(body) && !isHistoricalDeal(before)) {
    const missingDates = missingDealDatesAfterWrite(before, body);
    if (missingDates.length) {
      return badRequest(`กรุณากรอก ${missingDates.map((key) => DEAL_DATE_LABEL[key]).join(' · ')}`);
    }
  }
  if ('title' in body) patch.title = body.title.trim();
  if ('stage' in body) patch.stage = nextStage;
  /* มูลค่าคาดการณ์ (mig 0264): ฟอร์มส่ง `valueItems` มาทั้งชุด — ยอดรวมกับหมวดของดีล
     คิดจากแถวเท่านั้น (ช่องยอดรวมล็อก) · ผู้เรียกเก่าที่ยังส่ง projectValue ดิบ ๆ
     ยังใช้ได้ แต่ถ้าส่ง valueItems มาด้วย แถวชนะเสมอ ไม่งั้นจะมียอดสองความจริง
     freeze เมื่อปิด Won แล้ว เหมือนเดิม (ยอดของดีล Won คือ Actual ไม่ใช่ประมาณการ) */
  /* ⭐ mig 0337: ยอดที่คนกรอกลง `forecastManualValue` **เสมอ** ส่วน `projectValue`
     (ยอดที่ทั้งระบบอ่านเป็น FC) เขียนต่อเฉพาะตอนที่ดีลยังอยู่ที่ที่มา 'manual'
     ดีลที่เดินตามใบเสนอราคาอยู่แล้ว การแก้แถวมูลค่าคือการแก้ "ยอดที่เคยเดาไว้"
     ซึ่งเก็บไว้เทียบความแม่น ไม่ใช่การเปลี่ยน FC — ถ้าเขียนทับ FC ที่นี่ ยอดบนจอ
     จะไม่ตรงกับใบที่การ์ดบอกว่ากำลังเดินตามอยู่ */
  const followsQuotation = before.forecastSource === 'quotation';
  const setManualValue = (value) => {
    patch.forecastManualValue = value;
    if (!followsQuotation) patch.projectValue = value;
  };
  const wantsValueItems = 'valueItems' in body && !alreadyWon;
  let preparedItems = null;
  if (wantsValueItems) {
    const prepared = await prepareDealValueItems(body.valueItems);
    if (prepared.error) return badRequest(prepared.error);
    preparedItems = prepared.items;
    setManualValue(prepared.projectValue);
    // แถวแรก = หมวดของดีล (ตัวกรองขั้นตอนไทม์ไลน์) · ไม่มีแถว = ไม่มีหมวด
    patch.categoryCode = prepared.categoryCode;
  } else if ('projectValue' in body && !alreadyWon) {
    setManualValue(toMoney(body.projectValue));
  }
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
  // เดือน FC ตามวันที่คาดปิด (ด่านกันค่าว่างอยู่ข้างบนสุดของ patch แล้ว) — หลัง Won ล็อก ไม่ขยับตาม
  if ('expectedCloseDate' in body && !alreadyWon) {
    patch.forecastMonth = monthKey(body.expectedCloseDate);
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
  /* สายธุรกิจของดีล (mig 0274) — อีกครึ่งของกุญแจแม่แบบไทม์ไลน์
     ⚠️ ดีลที่ผูกโครงการแล้วห้ามสลับสาย: โครงการประกาศสายของมันเอง และ segment
     ในโครงการถูก gen ด้วยแม่แบบสายนั้นไปแล้ว ⇒ ต้องย้าย/แก้ที่โครงการแทน
     ⚠️ ล้างค่าเป็นว่างไม่ได้ (ถอยกลับไปเป็น "ไม่รู้สาย" ไม่มีประโยชน์กับใคร) */
  /* ⚠️ ค่าว่าง = "ไม่แตะช่องนี้" ไม่ใช่ "ล้างสาย" — ฟอร์มแก้ดีลส่งทั้งฟอร์มกลับมา
     เสมอ ⇒ ตีค่าว่างเป็น error จะทำให้ **แก้ดีลเก่า (ก่อน mig 0275) ไม่ได้เลย**
     ทั้งที่คนแค่มาแก้ชื่อ */
  if ('line' in body && (body.line ?? '') !== '') {
    const nextLine = normalizeBusinessLine(body.line);
    if (!nextLine) return badRequest('สายธุรกิจต้องเป็น PRODUCT หรือ SERVICE');
    if (nextLine !== (before.line || null)) {
      if (before.projectId) return badRequest('ดีลนี้ผูกโครงการแล้ว — เปลี่ยนสายธุรกิจที่โครงการแทน');
      patch.line = nextLine;
    }
  }
  // ชื่อสูตรกลิ่น (SCENT) — แก้ได้ตลอด (จุดปลั๊กอิน RD ในอนาคต)
  if ('formulaName' in body) {
    patch.formulaName = (body.formulaName || '').trim() || null;
  }
  // หมวดสินค้า (DL1 — mig 0094): ใช้กรองขั้นตอนของ timeline template ตามหมวด
  // ⚠️ ส่ง valueItems มาแล้ว = หมวดมาจากแถวแรก (ข้างบน) — ช่อง categoryCode ดิบ
  // ที่ตามมาทีหลังต้องไม่ทับ ไม่งั้นหมวดของดีลจะไม่ตรงกับแถวของตัวเอง
  if ('categoryCode' in body && !wantsValueItems) {
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
  if (error) {
    // CHECK/UNIQUE/trigger ของดีลภาชนะ (mig 0360) แปลเป็นไทย · ที่เหลือคง 500 ตามเดิม
    const mapped = historicalDealWriteMessage(error);
    return mapped ? fail(mapped[0], mapped[1]) : fail(error.message, 500);
  }
  if (!data) return conflict('ดีลถูกแก้ไขพร้อมกัน (สถานะเปลี่ยนระหว่างบันทึก) — รีเฟรชหน้าแล้วลองใหม่');

  /* ใบย้อนหลังของดีลภาชนะเดินตามเจ้าของดีล (คำตอบข้อ 4) — เจ้าของที่ trigger 0294 แช่ไว้มีไว้ตรึง "เจ้าของยอด"
     แต่ใบย้อนหลังไม่นับเป็นยอดขายเลย ⇒ ค้างชื่อคนเดิม = กระดิ่งใบกำกับ/ทะเบียนการชำระชี้คนที่ไม่ได้ดูแลแล้ว
     ⚠️ ห้ามตอบ 500 ถ้าพลาด — แถวดีลย้ายไปแล้ว · log + คำเตือนกลับไปกับดีล */
  let historicalOwnerWarning = null;
  let restampedOrders = [];
  if (historicalOwnerMove) {
    const { data: moved, error: moveError } = await historicalRowsOnly(supabase.from('sales_orders')
      .update({ ownerId: data.ownerId, ownerName: data.ownerName, updatedAt: patch.updatedAt })
      .eq('dealId', id)).select('id, "orderNumber"');
    if (moveError) {
      console.error(`[deal-patch ${id}] ย้ายเจ้าของใบสั่งขายย้อนหลังตามดีลไม่สำเร็จ:`, moveError.message);
      historicalOwnerWarning = `ย้ายเจ้าของดีลแล้ว แต่ชื่อเจ้าของบนใบสั่งขายย้อนหลังยังเป็นคนเดิม: ${moveError.message}`;
    } else {
      restampedOrders = moved || [];
    }
  }

  /* แถวมูลค่ารายหมวด — เขียนทับทั้งชุดหลังแถวดีลผ่าน optimistic lock แล้ว
     ⚠️ ล้มตรงนี้ = ยอดรวมในแถวดีลเป็นของใหม่แต่แถวยังเป็นของเก่า ⇒ ต้องตอบ error
     ให้ผู้ใช้กดบันทึกซ้ำ (เขียนทับทั้งชุด กดซ้ำจึงปลอดภัยเสมอ)
     🐞 เดิม return 500 ทันทีตรงนี้ ⇒ ข้ามทุกอย่างข้างล่าง (regen/เลื่อนไทม์ไลน์ · ประวัติ
     สถานะ · เธรด FC · snapshot FC · audit) ทั้งที่แถวดีลเปลี่ยนไปแล้ว และกดซ้ำก็ไม่ได้คืน
     — รอบสอง before คือค่าใหม่แล้ว ทุกเงื่อนไข "เปลี่ยนไหม" ข้างล่างจึงเป็นเท็จ
     ⇒ จำ error ไว้ ทำของประกอบให้ครบก่อน แล้วค่อยตอบ 500 ท้าย handler */
  let valueItemsError = null;
  if (preparedItems) {
    const { error: itemsError } = await saveDealValueItems(supabase, id, preparedItems);
    if (itemsError) {
      console.error(`[deal-patch ${id}] บันทึกรายการมูลค่าคาดการณ์ไม่สำเร็จ:`, itemsError);
      valueItemsError = itemsError;
    }
  }

  /* ประเภทดีล/สายธุรกิจ/หมวดสินค้าเปลี่ยน = template ของไทม์ไลน์เปลี่ยน → gen ชุดขั้นตอนใหม่
     ให้เอง (มติผู้ใช้ 2026-08-08 "แก้ดีลแล้วไทม์ไลน์อัปเดตตาม") เงื่อนไขปลอดภัย:
     - เฉพาะไทม์ไลน์ลอย (ผูกโครงการแล้วจัดการฝั่ง PM ตามกติกาเดิม)
     - เฉพาะเมื่อยังไม่เริ่มทำสักขั้น (ทุก task ยัง Pending) — เริ่มแล้วห้ามทิ้งงานคน
     - gen ชุดใหม่ไม่ได้ (template ว่าง/ไม่ตรงหมวด) = คงชุดเดิมไว้ ไม่ลบทิ้งก่อน */
  /* ไทม์ไลน์ตามไม่ทัน = ต้องบอก ไม่ใช่ตอบ 200 เงียบ ๆ — บันทึกซ้ำไม่ช่วย เพราะรอบสอง
     before คือค่าใหม่แล้ว (typeChanged/วันเริ่มเปลี่ยน เป็นเท็จหมด) · ห้าม 500 เพราะแถวดีล
     ลงไปแล้ว ⇒ log + timelineWarning คู่กับ stageHistoryWarning */
  let timelineWarning = null;
  const addTimelineWarning = (message) => {
    timelineWarning = timelineWarning ? `${timelineWarning} · ${message}` : message;
  };
  let regenerated = false;
  const typeChanged = 'dealType' in patch && (patch.dealType || null) !== (before.dealType || null);
  const categoryChanged = 'categoryCode' in patch && (patch.categoryCode || null) !== (before.categoryCode || null);
  // สายเปลี่ยน = แม่แบบคนละใบ ⇒ ต้อง regen ด้วยเงื่อนไขเดียวกับประเภท/หมวด
  const lineChanged = 'line' in patch && (patch.line || null) !== (before.line || null);
  if ((typeChanged || categoryChanged || lineChanged) && !data.projectId) {
    const { data: floating, error: floatingError } = await supabase
      .from('project_tasks').select('id, status')
      .eq('dealId', id).is('projectId', null);
    if (floatingError) {
      console.error(`[deal-patch ${id}] อ่านไทม์ไลน์ลอยก่อน regen ไม่สำเร็จ:`, floatingError.message);
      addTimelineWarning(`บันทึกดีลแล้ว แต่ไทม์ไลน์ยังเป็นชุดเดิม (อ่านไทม์ไลน์เดิมไม่สำเร็จ): ${floatingError.message}`);
    } else if (floating?.length && floating.every((t) => t.status === 'Pending')) {
      let freshRows = [];
      try {
        ({ rows: freshRows } = await buildDealTimelineRows(supabase, data));
      } catch (genError) {
        // template ของประเภทใหม่ยังไม่พร้อม (หรืออ่าน template ไม่ขึ้น) — คงไทม์ไลน์เดิมไว้
        console.error(`[deal-patch ${id}] gen ไทม์ไลน์ตามประเภท/สาย/หมวดใหม่ไม่ได้:`, genError.message);
        addTimelineWarning(`บันทึกดีลแล้ว แต่ไทม์ไลน์ยังเป็นชุดเดิม: ${genError.message}`);
      }
      if (freshRows.length) {
        /* 🐞 เดิมลบชุดเดิมก่อนแล้วค่อยใส่ชุดใหม่ และไม่ดู error ของ insert ⇒ ใส่ไม่ลง = ดีล
           ไม่เหลือไทม์ไลน์ลอยสักขั้น ตอบ 200 เงียบ ๆ (ผิดกติกา "ไม่ลบทิ้งก่อน" ข้างบนเอง)
           ทางกู้เหลือแค่ปุ่ม "สร้างไทม์ไลน์" ซึ่งดันขั้นไปเสนอไทม์ไลน์ด้วย
           ⇒ ใส่ชุดใหม่ก่อน แล้วลบเฉพาะ id ชุดเดิมที่ตรวจแล้วว่า Pending (ไม่มี unique/FK
           ชี้ project_tasks ⇒ สองชุดอยู่ร่วมกันชั่วครู่ได้) */
        const { error: insError } = await supabase.from('project_tasks').insert(freshRows);
        if (insError) {
          console.error(`[deal-patch ${id}] ใส่ไทม์ไลน์ชุดใหม่ไม่สำเร็จ (คงชุดเดิมไว้):`, insError.message);
          addTimelineWarning(`บันทึกดีลแล้ว แต่ไทม์ไลน์ยังเป็นชุดเดิม (สร้างชุดใหม่ไม่สำเร็จ): ${insError.message}`);
        } else {
          const { error: dropError } = await supabase
            .from('project_tasks').delete()
            .eq('dealId', id).is('projectId', null)
            .in('id', floating.map((t) => t.id));
          if (!dropError) {
            regenerated = true;
          } else {
            // ชุดเดิมลบไม่ออก = ซ้อนสองชุด ⇒ ถอนชุดใหม่ออก ให้เหลือชุดเดิมชุดเดียว
            const { error: undoError } = await supabase
              .from('project_tasks').delete().in('id', freshRows.map((t) => t.id));
            if (undoError) {
              regenerated = true; // ชุดใหม่ค้างอยู่ — ไม่เลื่อนวันซ้ำทับกราฟที่ปนกันสองชุด
              console.error(`[deal-patch ${id}] ไทม์ไลน์ซ้อนสองชุด — ลบชุดเดิมไม่ได้ (${dropError.message}) และถอนชุดใหม่ไม่ได้ (${undoError.message}) · ชุดใหม่:`,
                freshRows.map((t) => t.id));
              addTimelineWarning(`บันทึกดีลแล้ว แต่ไทม์ไลน์ของดีลซ้อนกันสองชุด — ลบไทม์ไลน์แล้วสร้างใหม่ที่หน้าดีล: ${dropError.message}`);
            } else {
              console.error(`[deal-patch ${id}] ลบไทม์ไลน์ชุดเดิมไม่สำเร็จ (ถอนชุดใหม่ออกแล้ว):`, dropError.message);
              addTimelineWarning(`บันทึกดีลแล้ว แต่ไทม์ไลน์ยังเป็นชุดเดิม (แทนที่ชุดเดิมไม่สำเร็จ): ${dropError.message}`);
            }
          }
        }
      }
    }
  }

  // วันที่เริ่มดีลเปลี่ยน → เลื่อนไทม์ไลน์ลอยของดีลตาม (sync แบบเดียวกับฝั่งโครงการ
  // ที่ PATCH startDate แล้ว recalculateGraph ทุกขั้นตอน). เฉพาะดีลที่ยังไม่ผูกโครงการ —
  // ผูกแล้ว segment อยู่ใต้ anchor ของโครงการ จัดการที่หน้าโครงการตามกติกาเดิม.
  // (regen ข้างบนใช้ startDate ใหม่เป็น anchor แล้ว — ไม่ต้องเลื่อนซ้ำ)
  if (!regenerated && 'startDate' in body && (data.startDate || null) !== (before.startDate || null) && !data.projectId) {
    const { data: floating, error: floatingError } = await supabase
      .from('project_tasks').select('*')
      .eq('dealId', id).is('projectId', null)
      .order('stepOrder', { ascending: true });
    if (floatingError) {
      console.error(`[deal-patch ${id}] อ่านไทม์ไลน์ลอยเพื่อเลื่อนตามวันเริ่มไม่สำเร็จ:`, floatingError.message);
      addTimelineWarning(`บันทึกดีลแล้ว แต่ยังไม่ได้เลื่อนไทม์ไลน์ตามวันเริ่มใหม่: ${floatingError.message}`);
    } else if (floating?.length) {
      setHolidays([...(await holidaySet())]);
      // เกณฑ์ anchor เดียวกับตอน gen ไทม์ไลน์ดีล: ไม่ระบุวันเริ่ม = วันนี้
      const recalced = recalculateGraph(floating, data.startDate || todayStr());
      /* 🐞 เดิมทิ้งผลของ Promise.all ทั้งก้อน — พลาดกี่ขั้นก็ไม่รู้ ไทม์ไลน์/Gantt เลื่อน
         ครึ่ง ๆ กลาง ๆ ทั้งที่ startDate ของดีลเป็นวันใหม่แล้ว และบันทึกซ้ำไม่เลื่อนให้อีก */
      const results = await Promise.all(
        recalced
          .filter((r, i) => r.startDate !== floating[i].startDate || r.finishDate !== floating[i].finishDate)
          .map((r) => supabase.from('project_tasks').update({
            startDate: r.startDate, finishDate: r.finishDate, cellsOverride: r.cellsOverride ?? null,
          }).eq('id', r.id)),
      );
      const failed = results.filter((r) => r.error);
      if (failed.length) {
        console.error(`[deal-patch ${id}] เลื่อนไทม์ไลน์ตามวันเริ่มไม่สำเร็จ ${failed.length}/${results.length} ขั้นตอน:`, failed[0].error.message);
        addTimelineWarning(`บันทึกดีลแล้ว แต่เลื่อนไทม์ไลน์ตามวันเริ่มใหม่ไม่ครบ (${failed.length} จาก ${results.length} ขั้นตอน): ${failed[0].error.message}`);
      }
    }
  }

  // เฟส B: เลิก sync ชื่อดีล→ชื่อโครงการ — โครงการมีได้หลายดีล ชื่อไม่ผูกกันอีกต่อไป
  // (ฝั่งโครงการ→ดีล ตัดคู่กันใน api/pm/projects/[id]/route.js)

  /* 🐞 เดิมไม่รับ error — insert พัง = ขั้นใน DB เปลี่ยนแล้ว แต่เส้นเรื่องของดีลไม่มี
     บรรทัดนี้ และ `daysInStage` (นับจาก stageHistory[0]) ไปนับจากการเปลี่ยนครั้งก่อน
     ⚠️ ห้ามตอบ 500: แถวดีลลงไปแล้ว ผู้ใช้จะเห็น "บันทึกไม่สำเร็จ" ทั้งที่
     สำเร็จ และกดซ้ำก็ไม่ช่วย — รอบสอง before.stage คือขั้นใหม่แล้ว ประวัติจึงไม่ถูกเขียน
     อยู่ดี (แถม FC/เธรด/audit ข้างล่างหายไปด้วย) ⇒ log + ส่งคำเตือนกลับไปกับดีล */
  let stageHistoryWarning = null;
  if (before.stage !== data.stage) {
    const { error: historyError } = await supabase.from('sales_deal_stage_history').insert({
      id: genId('DSH'),
      dealId: data.id,
      fromStage: before.stage,
      toStage: data.stage,
      changedBy: user.id || null,
      changedByName: user.name || null,
    });
    if (historyError) {
      console.error(`[deal-patch ${data.id}] บันทึกประวัติสถานะ ${before.stage} → ${data.stage} ไม่สำเร็จ:`, historyError.message);
      stageHistoryWarning = `บันทึกดีลแล้ว แต่ลงประวัติการเปลี่ยนสถานะไม่สำเร็จ: ${historyError.message}`;
    }
  }

  // 🐞 ตัวเลขที่ขยับเคยลงแต่ตาราง forecast (เพื่อ KPI) แล้ว **ไม่มีใครเห็นบนหน้าจอ
  // เลย** — คนเปิดดีลย้อนหลังไม่รู้ว่ามูลค่าเคยเป็นเท่าไรและใครแก้ · เขียนลงเธรดคู่กัน
  const forecastEvent = dealForecastUpdate(before, data);
  if (forecastEvent) {
    await appendUpdate(supabase, { entityType: 'deal', entityId: data.id, ...forecastEvent, user });
  }

  if (before.forecastMonth !== data.forecastMonth || before.projectValue !== data.projectValue || before.probability !== data.probability) {
    // snapshot ประวัติ FC — รายงาน FC อ่านจาก sales_deals ไม่ใช่ตารางนี้ · พลาดแค่ log
    const { error: forecastError } = await supabase.from('sales_deal_forecasts').insert({
      id: genId('DFC'),
      dealId: data.id,
      forecastMonth: data.forecastMonth || monthKey(new Date().toISOString()),
      forecastAmount: forecastAmount(data),
      probability: data.probability,
      source: 'sales',
      createdBy: user.id || null,
      createdByName: user.name || null,
    });
    if (forecastError) console.error(`[deal-patch ${data.id}] บันทึกประวัติ FC ไม่สำเร็จ:`, forecastError.message);
  }

  await recordAudit({
    user,
    action: 'update',
    entityType: 'sales_deal',
    entityId: data.id,
    before,
    after: data,
    summary: historicalOwnerMove
      ? `ย้ายเจ้าของดีลของใบสั่งขายย้อนหลัง ${dealAuditLabel(data)}: ${naText(before.ownerName)} → ${naText(data.ownerName)}`
        + ` · ใบย้อนหลังย้ายตาม ${restampedOrders.length} ใบ`
        + (restampedOrders.length ? ` (${restampedOrders.map((o) => o.orderNumber).join(', ')})` : '')
      : `แก้ไข sales deal ${dealAuditLabel(data)}`,
    request: req,
  });

  // แถวมูลค่าพังตอบ 500 ให้กดบันทึกซ้ำ (ดูที่ saveDealValueItems) — ของประกอบข้างบนลงครบแล้ว
  // คำเตือนอื่นพ่วงไปในข้อความเดียวกัน ไม่งั้นหายไปพร้อม body ของ 200
  if (valueItemsError) {
    const others = [stageHistoryWarning, timelineWarning].filter(Boolean);
    return fail(`บันทึกรายการมูลค่าคาดการณ์ไม่สำเร็จ: ${valueItemsError}${others.length ? ` · ${others.join(' · ')}` : ''}`, 500);
  }

  // ท่าเดียวกับ timelineWarning/valueItemsWarning ของ POST — ดีลบันทึกแล้วแต่ของประกอบไม่ครบ
  // ⚠️ ยังไม่มีจอไหนอ่านสองช่องนี้ (ฟอร์มแก้ดีลอ่าน body แค่ตอน !res.ok)
  return ok({
    ...data,
    ...(stageHistoryWarning ? { stageHistoryWarning } : {}),
    ...(timelineWarning ? { timelineWarning } : {}),
    // คีย์ `warning` = คีย์ที่จออ่านอยู่แล้ว (RESPONSE_WARNING_KEYS) — ตั้งชื่อใหม่ = ไม่มีจอไหนเห็น
    ...(historicalOwnerWarning ? { warning: historicalOwnerWarning } : {}),
  });
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

  /* ⛔ ดีลของใบสั่งขายย้อนหลัง (mig 0360) ที่ยังถือใบ — FK dealId ของใบสั่งขายเป็น ON DELETE CASCADE (0107)
     ⇒ ลบดีล = ใบย้อนหลังทุกใบของลูกค้า × AE คู่นี้หายเงียบ ๆ · ด่านนี้ครอบทั้งทางปกติ ทางบังคับ และพรีวิว
     ⚠️ นับไม่ขึ้นต้องหยุด ไม่ใช่ถือว่า 0 */
  let historicalOrdersBlock = null;
  if (isHistoricalDeal(before)) {
    const { count: orderCount, error: orderCountError } = await supabase
      .from('sales_orders').select('id', { count: 'exact', head: true }).eq('dealId', id);
    if (orderCountError) return fail(orderCountError.message, 500);
    if ((orderCount || 0) > 0) {
      historicalOrdersBlock = `ดีลนี้ถือใบสั่งขายย้อนหลัง ${orderCount} ใบ — ให้ผู้ดูแลระบบลบที่ใบก่อน แล้วจึงลบดีลได้`;
    }
  }

  // พรีวิวสำหรับปุ่ม force ในหน้าเว็บ — ไม่ลบอะไร, เฉพาะ admin.
  if (dryRun) {
    if (!canForceDelete(user)) return forbidden();
    // บังคับลบก็ข้ามไม่ได้ ⇒ พรีวิวต้องบอก blocked ไม่ใช่ชวนกดยืนยันที่ยังไงก็ล้ม
    if (historicalOrdersBlock) return ok({ dryRun: true, cascade: [], notes: [historicalOrdersBlock], blocked: true });
    const preview = await dealForcePreview(supabase, before, { project });
    return ok({ dryRun: true, ...preview });
  }
  if (historicalOrdersBlock) return conflict(historicalOrdersBlock);

  // กันลบสิ่งที่นับเป็นยอด/มีหลักฐานทางบัญชีแล้ว (M8): โครงการที่ปิด Won,
  // หรือมาจาก PO สหมิตร (settle เข้ายอดแล้ว) — ให้ยกเลิกด้วยวิธีอื่นแทนการลบ.
  // force (admin) ข้ามด่านเหล่านี้ทั้งหมด แล้วรับผิดชอบ cascade เอง.
  if (!force) {
    // ลบโครงการที่ปิด Won = อำนาจของผู้มีอำนาจตัดสิน (AC Supervisor ไม่ได้ · ผังตำแหน่ง 2026-09-24)
    if (isWonStage(before.stage) && !isSalesManager(user.role)) {
      return conflict('โครงการนี้ปิดการขาย (Won) แล้ว — ลบไม่ได้ เพราะถูกนับเป็นยอดขาย (ต้องการสิทธิ์แอดมิน)');
    }
    // ใบเสนอราคา accepted = แหล่งยอด Actual — ห้ามลบแม้ superuser (กติกาเดียวกับ
    // DELETE quotation) เพราะ FK cascade จะพาใบ accepted + Sale Order หายเงียบ
    // โดย audit ไม่บันทึกเอกสารการเงินที่ถูกทำลาย. ต้องย้อนการรับ (0138) หรือ
    // ย้อน Won ผ่านยกเลิก SO (0116) ก่อน.
    // ⚠️ นับไม่ขึ้นต้องหยุด ไม่ใช่ถือว่า 0 — ด่านนี้คือสิ่งเดียวที่กั้น cascade ข้างบนไว้
    const { count: acceptedCount, error: acceptedError } = await supabase
      .from('quotations').select('id', { count: 'exact', head: true })
      .eq('dealId', id).eq('status', 'accepted');
    if (acceptedError) return fail(acceptedError.message, 500);
    if ((acceptedCount || 0) > 0) {
      return conflict('ดีลนี้มีใบเสนอราคาที่รับแล้ว (Won) — ลบไม่ได้ เพราะเป็นหลักฐานยอด Actual: ถ้ามี SO อนุมัติแล้วใช้ “ยกเลิกใบสั่งขายพร้อมย้อนสถานะ”; ถ้ายังไม่มี SO ให้เจ้าของดีลหรือ AE Supervisor ใช้ “ย้อนการรับ” บนหน้าใบเสนอราคา');
    }
    if (before.metadata?.sahamitPoId) {
      return conflict('โครงการนี้มาจาก PO สหมิตร — ลบไม่ได้ (จัดการที่เอกสาร PO แทน)');
    }
    /* ⛔ คำร้องที่ส่งถึงฝ่ายอื่นแล้ว — ลบพ่วงไม่ได้ (กติกาเดียวกับ trigger guard_dept_request)
       🐞 เดิม cleanupDealOrphans ลบทุกใบผ่าน RPC บังคับลบ ทั้งที่ผู้ลบเป็น AE ⇒ คำร้องหายเงียบ
          11 ใบ (เช่น RQ-IQ-26090026 ที่ RD ตอบราคาแล้ว) · ดู lib/requests/cascadeDelete
       ⚠️ อ่านไม่ขึ้นต้องหยุด ไม่ใช่ถือว่าไม่มีคำร้อง */
    let linkedRequests;
    try {
      linkedRequests = await requestsLinkedTo(supabase, 'dealId', id);
    } catch (requestError) {
      return fail(`${requestError.message} — ยังไม่ได้ลบดีล`, 500);
    }
    const requestBlock = sentRequestsBlockMessage(linkedRequests, 'ดีล');
    if (requestBlock) return conflict(requestBlock);
  }

  // ใบยื่นชำระภาษีของ SO ในดีล: FK RESTRICT ที่ break-glass ก็ข้ามไม่ได้ — ดักก่อน
  // ทั้งสองเส้นทาง ไม่งั้น error ดิบจาก Postgres หลุดขึ้นหน้าดีลเป็น 500
  const filings = await exciseFilingsOfDeal(supabase, id);
  if (filings.length) return conflict(exciseFilingBlockMessage(filings, 'ดีล'));

  /* 🐞 **สัญญาเป็น FK RESTRICT เหมือนกัน แต่เส้นลบจริงไม่เคยตรวจ** (พบ 2026-08-28)
     `dealForcePreview` (?dryRun=1) ตรวจและตอบ `blocked:true` ถูกต้อง แต่พอกดลบจริง
     ไปตายที่ `sales_contracts_dealId_fkey` แล้วตกลง catch ที่ตอบข้อความชี้ผิดทาง
     ("หลักฐานลายเซ็น/ฉบับตรึง") ⇒ แอดมินลบไม่ได้ และไม่รู้ว่าติดอะไร
     ⚠️ **ไม่ครอบด้วย `if (!force)`** — สัญญาเป็นเอกสารผูกพันตามกฎหมาย break-glass
     ก็ข้ามไม่ได้ตามเจตนา mig 0278 · ด่านนี้จึงบอก "ทางออก" ไม่ใช่ "ปฏิเสธเปล่า ๆ" */
  let dealContracts;
  try {
    dealContracts = await contractsOfDeal(supabase, id);
  } catch (contractError) {
    // ตรวจไม่ได้ ≠ ไม่มี — หยุดไว้ก่อน ดีกว่าเดินหน้าลบแล้วพบทีหลังว่ามีสัญญาอยู่
    return fail(contractError.message, 500);
  }
  if (dealContracts.length) return conflict(contractBlockMessage(dealContracts, 'ดีล'));

  // ใบเสนอราคา/ใบสั่งขายที่มีหลักฐานลายเซ็น (0125) หรือฉบับตรึง (0130/0148): ลูกพวกนี้
  // เป็น FK RESTRICT ⇒ cascade จากการลบดีลถูกฐานข้อมูลปฏิเสธกลางทาง แล้วข้อความดิบ
  // ("...violates foreign key constraint document_signature_evidence_quotationId_fkey")
  // ขึ้นหน้าดีลทั้งดุ้น (prod 2026-08-20). แปลงเป็นข้อความที่บอกชื่อใบและทางออก —
  // ?force=1 ของผู้ดูแลระบบไปลบผ่าน RPC break-glass ด้านล่างแทน
  let signedDocs;
  try {
    signedDocs = await dealSignedDocuments(supabase, id);
  } catch (signedError) {
    return fail(`${signedError.message} — ยังไม่ได้ลบดีล`, 500);
  }
  const hasSignedDocs = signedDocs.quotations.length + signedDocs.salesOrders.length > 0;
  if (hasSignedDocs && !force) return conflict(dealSignedBlockMessage(signedDocs));

  // เฟส B: โครงการมีได้หลายดีลและเป็นเอนทิตีอิสระที่อาจมีดีลอื่นมาผูกแทน — ลบดีลจึง
  // "ไม่ลบโครงการตาม" แม้เป็นดีลสุดท้าย (ปล่อยโครงการว่างดีลไว้ รอดีลใหม่มาผูก).
  // แค่ถอด timeline segment ของดีลนี้ออก; การลบโครงการทำที่หน้าโครงการโดยตรง.
  const detachedFromProject = project?.id || null;

  // เก็บกวาดลูกดีลที่ไม่มี FK จริง (งานส่วนตัว/คำร้องข้ามฝ่าย/parent-ref) ก่อนลบแม่ —
  // ต้องทำ **ทุกครั้ง** ไม่ใช่เฉพาะตอน force: เดิมอยู่ใต้ `if (force)` ทำให้การลบดีล
  // ตามปกติทิ้งงานที่ผูกดีลค้างไว้ชี้ดีลที่ไม่มีอยู่แล้ว — เข้าถึงจากดีลไม่ได้อีกและ
  // ไม่มีเส้นทางไหนตามลบให้ (prod 2026-07-30 เจอค้าง 5 งานจากดีลที่ถูกลบไปแล้ว).
  try {
    // ร่างที่ยังไม่ส่ง (ทางปกติ) หรือทุกใบ (บังคับลบ) — จด audit ทีละใบก่อนลบเสมอ
    await cleanupDealOrphans(supabase, id, {
      auditRequests: requestCascadeAuditor({
        user, request: req,
        cause: `การลบดีล ${before.code || id}${force ? ' (บังคับลบ — สิทธิ์ผู้ดูแลระบบ)' : ''}`,
      }),
    });
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

  // บังคับลบ: เอกสารการขายต้องไปทาง RPC break-glass เสมอ (mig 0152/0168) ไม่ใช่ปล่อยให้
  // cascade ของ DB จัดการ — หลักฐาน/ฉบับตรึงเป็น RESTRICT ที่ cascade ข้ามไม่ได้ และ RPC
  // เป็นที่เดียวที่ตั้ง flag ให้ guard ยอมลบแล้วเก็บกวาดตามลำดับ FK ให้ครบ
  if (force) {
    try {
      await forceDeleteDealDocuments(supabase, id, user);
    } catch (docError) {
      return fail(`${docError.message} — ยังไม่ได้ลบดีล`, 500);
    }
  }

  /* ใบสั่งขายของดีลหายตาม cascade (FK dealId ON DELETE CASCADE · 0107) ⇒ จดรายชื่อไว้ก่อนลบ แล้วกวาดไฟล์ในแท็บ
     "เอกสาร" ของใบพวกนั้นหลังลบสำเร็จ · ⚠️ อ่านไม่ขึ้น = หยุดก่อนลบ ไม่ใช่ถือว่าไม่มีใบ (ไฟล์จะกำพร้าเงียบ) */
  const childOrders = await salesOrderIdsOfDeal(supabase, id);
  if (childOrders.error) return fail(`ตรวจใบสั่งขายของดีลไม่สำเร็จ: ${childOrders.error} — ยังไม่ได้ลบดีล`, 500);

  // ไฟล์แนบของดีล (entityType `deal`) — polymorphic ไม่มี FK cascade ⇒ กวาดก่อนแถวหาย
  // (เธรดถูกกวาดอยู่แล้วด้วย purgeUpdates ข้างล่าง — ไฟล์แนบเคยตกหล่นข้างเดียว)
  await purgeAttachments('deal', id);
  const { error } = await supabase.from('sales_deals').delete().eq('id', id);
  if (error) {
    // ตาข่ายชั้นสอง: ยังมีลูกที่ FK RESTRICT อยู่ (เช่นเอกสารที่เพิ่งถูกเซ็นหลังเราตรวจ)
    // — ห้ามปล่อยข้อความ Postgres ดิบออกหน้าเว็บ (ชื่อ constraint/ตารางหลุด)
    if (isForeignKeyViolation(error)) {
      console.error(`[deal delete ${id}] foreign key violation:`, error);
      return conflict('ลบดีลไม่ได้: ยังมีเอกสารอ้างดีลนี้อยู่ (หลักฐานลายเซ็น/ฉบับตรึงของใบเสนอราคาหรือใบสั่งขาย) — กรุณาจัดการเอกสารเหล่านั้นที่หน้าเอกสารก่อน');
    }
    return fail(error.message, 500);
  }
  // เธรดความเคลื่อนไหว (mig 0169) เป็น polymorphic ไม่มี FK — ของเดิมหายเองเพราะ
  // sales_deal_activities มี ON DELETE CASCADE แต่ตารางกลางไม่มี ต้องกวาดเอง
  // ไม่งั้นเหลือเธรดของดีลที่ไม่มีอยู่แล้วค้างในฟีดรวมข้ามโมดูล
  await purgeUpdates(supabase, 'deal', id);
  await purgeSalesOrderFiles(supabase, childOrders.ids);

  // ⚠️ เธรดของ**โครงการแม่**ต้องรู้ว่าดีลใบนี้หลุดไป — ความเคลื่อนไหวของมันที่เคย
  // ไหลเข้าหน้าโครงการหายไปทั้งชุดพร้อมกัน ถ้าไม่มีบรรทัดอธิบาย เส้นเรื่องจะเป็นรู
  // (เขียนหลังลบสำเร็จ และไม่เช็ค error — เธรดพลาดต้องไม่ทำให้การลบที่สำเร็จแล้วล้ม)
  if (detachedFromProject) {
    await appendUpdate(supabase, {
      entityType: 'project', entityId: detachedFromProject,
      ...dealUnlinkedUpdate(before, { reason: force ? 'ลบดีล (บังคับ)' : 'ลบดีล' }), user,
    });
  }

  /* ลีดต้นทาง (มติผู้ใช้ 2026-09-22) — ลบดีล = ดีลหลุดจากลีด กติกาเดียวกับ "ถอดลีดต้นทาง":
     ลีดที่ไม่เหลือดีลแล้วกลับไปสถานะก่อนเปิดดีล + บันทึกประวัติ `unlink_deal`
     🐞 เดิมลบดีลแล้วลีดค้าง "เปิดลูกค้าแล้ว" ทั้งที่ไม่มีดีลเหลือ (prod 21/09: LEAD-mt8h2nk93ozb)
        ⇒ KPI นับเป็นลีดที่แปลงสำเร็จ และไม่มีใครรู้ว่าต้องตามต่อ
     ⚠️ หลังลบสำเร็จแล้ว — พลาดตรงนี้เป็นคำเตือน ไม่ใช่ error (ดีลหายไปแล้ว) */
  let leadWarning = null;
  if (before.leadId) {
    const { data: sourceLead, error: sourceLeadError } = await loadLeadForLink(supabase, before.leadId);
    if (sourceLeadError) {
      leadWarning = `ลบดีลแล้ว แต่อ่านลีดต้นทางไม่สำเร็จ (${sourceLeadError.message}) — สถานะลีดยังไม่ถูกย้อน แจ้งแอดมิน`;
    } else if (sourceLead) {
      const released = await releaseLeadAfterDealGone(supabase, {
        lead: sourceLead, deal: before, user, req,
        reason: `ลบดีล ${dealLabelForLead(before)}${force ? ' (บังคับ)' : ''}`,
      });
      leadWarning = released.warning;
    }
    if (leadWarning) console.error(`[deal delete ${id}] ลีดต้นทาง ${before.leadId}:`, leadWarning);
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
  return ok({
    ok: true, deletedProject: null, detachedFromProject, emptyProject, forced: force,
    ...(leadWarning ? { leadWarning } : {}),
  });
});
