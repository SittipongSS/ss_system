import { genId } from '@/lib/id';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { insertRowWithEntityCode } from '@/lib/entityCode';
import { recordAudit } from '@/lib/audit';
import { autoProbability } from '@/lib/sales/dealProbability';
import { ownerLockedToSelf, validateDealOwner } from '@/lib/sales/dealOwner';
import { withUser, ok, fail, badRequest, forbidden, unauthorized } from '@/lib/http';
import {
  applyDealScope,
  canCreateDeal,
  canEditSalesPlanning,
  canViewSalesPlanning,
  dealAuditLabel,
  forecastAmount,
  inSalesEditScope,
  inSalesViewScope,
  monthKey,
  normalizeDealType,
  normalizeStage,
  toMoney,
  toProbability,
} from '@/lib/salesPlanning';
import { loadForecastDriftMap } from '@/lib/salesPlanningForecast';
import { buildDealTimelineRows, summarizeTimelineStep } from '@/lib/sales/dealTimelineGen';
import { businessDayKey } from '@/lib/datePeriods';
import { parseReportPeriodParams } from '@/lib/sales/reportPeriod';
import { dealInReportPeriod, normalizeDealAxis } from '@/lib/sales/dealPeriod';
import { attributionTeam, isSuperuser } from '@/lib/permissions';
import { sourceLeadIdOf } from '@/lib/sales/leads';
import { leadLinkError } from '@/lib/sales/dealLeadLink';
import { loadLeadForLink, recordLeadDealOpened } from '@/lib/sales/dealLeadLinkRepo';
import { CUSTOMER_NAME_SELECT, customerNameIn, customerSnapshotName } from '@/lib/master/customerName';
import { activeProductTypeError } from '@/lib/master/productTypes';
import { normalizeBusinessLine } from '@/lib/master/businessLines';
import { prepareDealValueItems, saveDealValueItems } from '@/lib/sales/dealValueItemsRepo';
import { missingDealDatesAfterWrite } from '@/lib/sales/dealRequiredFields';
import { clientDealMetadataOnCreate, isLegacyWonCreate, legacyWonCreateError } from '@/lib/sales/legacyDealSwitch';
import { businessDate } from '@/lib/businessDate';

export const dynamic = 'force-dynamic';

// ป้ายของสองช่องนี้ต้องตรงกับที่ตาเห็นบนฟอร์ม (ดู lib/sales/dealRequiredFields)
const DEAL_DATE_LABEL = { startDate: 'วันที่เริ่ม', endDate: 'วันที่สิ้นสุด (ลูกค้าต้องการรับ)' };

const selectDeal = `
  *,
  customer:customers(id, name, "nameEn", arCode)
`;

export const GET = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  const params = new URL(req.url).searchParams;
  const stage = params.get('stage');
  /* ⭐ งวดชุดเดียวกับหน้ารายงาน/ลีด (มติผู้ใช้ 2026-09-22 "ทุกหน้าตัวคุมชุดเดียว") — ตัวอ่านกลาง
     `parseReportPeriodParams` รับทั้ง ?mode=… และพารามิเตอร์เดิม (?month= · ?year= = ทุกเดือนของปีนั้น)
     ดีลในงวด = เดือนคาดปิด (กติกาที่ lib/sales/dealPeriod · ไฟล์ FC ใช้ตัวเดียวกัน)
     ⚠️ งวดผิดรูป = ไม่กรอง (พฤติกรรมเดิมของ month= ที่อ่านไม่ออก) ไม่ใช่ 400 — จอเก่าที่ค้างในแท็บต้องไม่พัง */
  const parsedPeriod = parseReportPeriodParams(params, { today: businessDayKey(new Date().toISOString()) });
  const period = parsedPeriod && !parsedPeriod.error ? parsedPeriod : null;
  /* ⭐ แกนของงวด (มติผู้ใช้ 2026-09-22 รอบรื้อ): close = เดือนปิดการขาย (ค่าตั้งต้น · กรองที่ query) ·
     delivery = เดือนรับของ (endDate · demandMonth · ไม่มีวันรับของ = กองของงวดที่ปิด) — กติกาซับซ้อนกว่าที่ PostgREST
     เขียนได้ตรง ๆ ⇒ อ่านตามสิทธิ์/ขั้นแล้วคัดด้วยตัวตัดสินกลาง `dealInReportPeriod` (ดีลทั้งตาราง ~500 แถว) */
  const axis = normalizeDealAxis(params.get('axis'));

  /* ⚠️ **อ่านทุกหน้า ไม่ใช่หน้าแรก** — Supabase ตั้ง Max rows = 1000 และ PostgREST
     ตัดผลลัพธ์ **โดยไม่มี error** ⇒ วันที่ดีลเกินพันใบ ลิสต์นี้จะหายไปเงียบ ๆ พร้อม
     ตัวเลขสรุปทุกตัวที่หน้าจอคำนวณจากมัน (prod วันนี้ 297 ใบ — ยังไม่ถึง แต่เป็น
     ตารางที่โตตามงานขายทุกวัน)

     ⚠️ **ต้องส่งเป็น factory** ไม่ใช่ตัว builder — builder ของ supabase-js ยิงซ้ำ
     ไม่ได้ (ยิงแล้วจบ) `fetchAllResult` จึงต้องประกอบคำสั่งใหม่ทุกหน้า
     ⚠️ **ลำดับต้องนิ่ง** — `updatedAt` ซ้ำกันได้ ⇒ พ่วง `id` เป็นตัวตัดสิน ไม่งั้น
     แถวเดียวกันโผล่สองหน้าและอีกแถวหายไปเลย (บทเรียน #1276) */
  // ตัวกรองแยกออกมาเพื่อให้คำสั่งอ่านทั้งหน้าเหลือหนึ่ง statement (ดูด้านล่าง)
  const applyFilters = (q0) => {
    let q = applyDealScope(q0, user);
    if (stage && stage !== 'all') q = q.eq('stage', normalizeStage(stage));
    /* งวดที่ query = **อ่านชุดที่ใหญ่กว่าไว้ก่อน** แล้วคัดจริงด้วยตัวตัดสินกลางด้านล่าง (ทั้งสองแกน)
       แกนปิด: ช่วงวัน = วันคาดปิดในช่วง · รายเดือน/ทุกเดือน = เดือน FC ในงวด **หรือ** วันคาดปิดในงวด
       (ตัวตัดสินถอยไปใช้เดือนของวันคาดปิดเมื่อไม่มีเดือน FC — query เดิม `forecastMonth IN` อย่างเดียว
       ทิ้งดีลกลุ่มนั้นจากจอทั้งที่ไฟล์นับ) · แกนรับของ: กติกาซับซ้อนเกิน PostgREST ⇒ ไม่กรองที่ query */
    if (!period || axis === 'delivery') return q;
    if (period.mode === 'range') return q.gte('expectedCloseDate', period.from).lte('expectedCloseDate', period.to);
    return q.or(`forecastMonth.in.(${period.months.join(',')}),and(expectedCloseDate.gte.${period.from},expectedCloseDate.lte.${period.to})`);
  };

  const { data, error } = await fetchAllResult(() => applyFilters(supabase.from('sales_deals')
    .select(selectDeal)
    .order('updatedAt', { ascending: false })
    .order('id', { ascending: true })));
  if (error) return fail(error.message, 500);

  // Per-row edit flag so the UI hides actions that would 403 (AE sees the whole
  // team's pipeline but may only act on its own deals).
  const editor = canEditSalesPlanning(user);
  const driftMap = await loadForecastDriftMap(supabase, data || []).catch(() => new Map());
  const scoped = (data || []).filter((d) => inSalesViewScope(user, d));
  // คัดงวดด้วยตัวตัดสินกลางทั้งสองแกน — ชุดเดียวกับไฟล์ FC (query ด้านบนแค่ตัดให้เล็กลง)
  const visible = scoped.filter((d) => dealInReportPeriod(d, period, axis));

  /* ขั้นตอนปัจจุบันตามไทม์ไลน์ต่อดีล (คอลัมน์ "ขั้นตอน" — มติผู้ใช้ 2026-08-08)
     ดึง task ของทุกดีลที่เห็นในคำขอเดียวแล้วสรุปฝั่ง server — task ที่ถูกรับเลี้ยง
     เข้าโครงการแล้วยังถือ dealId เดิม (DL1) จึงตามด้วย dealId ได้ทั้งสองกรณี
     เลือกเฉพาะคอลัมน์ที่ใช้สรุป: ทั้งลิสต์คือหลักพันแถว อย่า select '*' */
  /* ⚠️ สามกับดักของการอ่านตารางที่โตเรื่อย ๆ ต้องครบพร้อมกัน (บทเรียนเดียวกับ #1721 ที่ api/pm/projects):
       · ซอยลิสต์ id ข้างนอก (fetchInChunks) — URL ของ .in() ยาวเกิน 16 KB แล้ว PostgREST ตอบ error
       · ไล่หน้าข้างใน (fetchAllResult) — เพดาน 1,000 แถวตัดเงียบ ไม่มี error (project_tasks 4,653 แถว)
       · เช็ก error — supabase ไม่ throw ⇒ เดิมคอลัมน์ "ขั้นตอน" ว่างทั้งลิสต์โดยไม่มีใครรู้ */
  const stepMap = new Map();
  if (visible.length) {
    const { data: taskRows, error: taskError } = await fetchInChunks(visible.map((d) => d.id), (chunk) => fetchAllResult(() => supabase
      .from('project_tasks')
      .select('dealId, name, status, stepOrder')
      .in('dealId', chunk)
      .order('stepOrder', { ascending: true })
      .order('id', { ascending: true })));
    if (taskError) return fail(taskError.message, 500);
    for (const task of taskRows || []) {
      if (!stepMap.has(task.dealId)) stepMap.set(task.dealId, []);
      stepMap.get(task.dealId).push(task);
    }
  }

  const rows = visible.map((d) => ({
    ...d,
    canEdit: editor && inSalesEditScope(user, d),
    forecastDrift: driftMap.get(d.id) || null,
    timelineStep: summarizeTimelineStep(stepMap.get(d.id)),
    /* ชื่อลูกค้าที่ฝังมากับแถวต้องตกไปอังกฤษได้ (แพตเทิร์นเดียวกับ deals/[id]/overview)
       — โมดัลเจาะดีลอ่าน `customer.name` ดิบ **ก่อน** `customerName` ⇒ ลูกค้าที่มีแต่
       ชื่ออังกฤษเคยขึ้นเป็น "ไม่ระบุลูกค้า" ทั้งที่สำเนาบนดีลมีชื่ออยู่
       ⚠️ จุดวาด ไม่ใช่จุดเขียน — ไม่ประทับกลับลงคอลัมน์ `customerName` ของดีล */
    customer: d.customer ? { ...d.customer, name: customerNameIn(d.customer) } : d.customer,
  }));
  return ok(rows);
});

export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  // สร้างดีลได้เฉพาะ AE/Senior AE (+ superuser กำกับดูแล) — AC เปิดดีลไม่ได้ (มติผู้ใช้)
  if (!canCreateDeal(user)) return forbidden('เปิดดีลได้เฉพาะ AE / AC / Senior AE');

  const body = await req.json();
  if (!body.title?.trim()) return badRequest('ต้องระบุชื่อดีล');

  /* สายธุรกิจของดีล (mig 0274 · มติผู้ใช้ 2026-08-20) — **บังคับตั้งแต่วันเกิด**
     เพราะไทม์ไลน์ถูก gen พร้อมดีลใบนี้เลย (ดูท้ายไฟล์) และแม่แบบเป็นคู่
     (สาย, ประเภทดีล) ⇒ ไม่มีสาย = ไม่รู้ว่าจะเดินขั้นตอนของสายไหน
     ⚠️ ห้ามใส่ค่าตั้งต้นให้เอง — บทเรียนเดียวกับ `projects.type` ที่ default 'NPD'
     แล้วโครงการทั้ง 11 ใบบน prod เป็น NPD หมด (หัว mig 0191) */
  const line = normalizeBusinessLine(body.line);
  if (!line) return badRequest('ต้องเลือกสายธุรกิจของดีล (สินค้า หรือ บริการ)');

  let stage = normalizeStage(body.stage);
  // in_project ถูกยุบเป็น won แล้ว (mig 0082 ตัดออกจาก CHECK) — กัน insert พัง 500
  // ถ้า client ยังส่งค่าเก่ามา ให้ถือเป็น won.
  if (stage === 'in_project') stage = 'won';
  // ปิด Won ตอนสร้างดีลต้องผ่านใบเสนอราคา (M5)
  // ⚠️ ยกเว้น **ดีลเก่าจากระบบเดิม** (สวิตช์ในฟอร์ม · มติผู้ใช้ 2026-08-08 เปิดถาวรทุกคน) — บันทึกงานที่
  //    ปิดไปแล้วในระบบเก่าเพื่อติดตามต่อ · ⭐ มติผู้ใช้ 2026-09-14: ดีลแบบนี้ **ไม่มีมูลค่า** ไม่นับ Actual
  //    ไม่เข้า FC (Actual มาจาก SO อนุมัติเท่านั้น) ⇒ ส่งยอด/แถวมูลค่ามา = ตีกลับ ไม่ทิ้งเงียบ ๆ
  // ⚠️ ด่านนี้ต้องอยู่ **ก่อน** prepareDealValueItems — คำขอที่ส่งแถวมูลค่ามาต้องได้ข้อความของด่านนี้
  //    ไม่ใช่ error รายแถวของตารางมูลค่าที่ดีลแบบนี้ไม่มีให้กรอก
  // ⚠️ ธงต้องเป็น true จริง (isLegacyWonCreate → hasLegacySwitchFlag ตัวเดียวกับตัวบ่งชี้ isLegacyWonAtCreate)
  //    🐞 เดิมเช็ก truthy ⇒ legacy: 1 / 'true' ผ่านด่านได้ แต่ตัวบ่งชี้ไม่นับเป็นดีลเก่า ⇒ ค้างในกอง Won รอยื่น SO
  if (stage === 'won' && !isLegacyWonCreate(body, stage)) {
    return badRequest('สร้างดีลเป็น Won โดยตรงไม่ได้ ต้องปิด Won ผ่านใบเสนอราคา — ยกเว้นดีลเก่าจากระบบเดิม (เปิดสวิตช์ในฟอร์ม)');
  }
  const legacyError = legacyWonCreateError(body, { stage, today: businessDate() });
  if (legacyError) return badRequest(legacyError);

  /* มูลค่าคาดการณ์แยกตามหมวดสินค้า (mig 0264 — มติผู้ใช้ 2026-08-17)
     ส่ง valueItems มาเมื่อไร = ยอดรวมและหมวดของดีลมาจากแถวเท่านั้น
     (ช่องยอดรวมบนฟอร์ม **ล็อก** — ยอมรับ body.projectValue ต่อไปจะเปิดทางให้เกิด
     ดีลที่ยอดไม่ตรงกับผลบวกของแถวตัวเอง)
     ไม่ส่งมา = ทางเดิมทั้งดุ้น (ผู้เรียกเก่า/ดีลที่ยังไม่แตกหมวด) */
  const hasValueItems = Array.isArray(body.valueItems) && body.valueItems.length > 0;
  const prepared = hasValueItems ? await prepareDealValueItems(body.valueItems) : null;
  if (prepared?.error) return badRequest(prepared.error);

  const categoryCode = hasValueItems ? prepared.categoryCode : ((body.categoryCode || '').trim() || null);
  if (!hasValueItems) {
    const categoryError = await activeProductTypeError(categoryCode);
    if (categoryError) return badRequest(categoryError);
  }
  const projectValue = hasValueItems ? prepared.projectValue : toMoney(body.projectValue);

  /* ผู้รับผิดชอบ (AE) — ดีลเป็นหน้าที่ของ ae/senior_ae (มติผู้ใช้ 2026-08-08)
     ⚠️ ห้ามเชื่อ body: `ownerName` เป็นสตริงอิสระที่ถูกเก็บเป็น snapshot แล้วโชว์บน
     ตาราง/KPI และ `ownerId` มั่ว ๆ จะได้ดีลที่เจ้าของแตะไม่ได้ (ดู lib/sales/dealOwner.js)
     ae/senior_ae ไม่ระบุ = ตัวเองเป็นเจ้าของ (ฟอร์มล็อกชื่อตัวเองอยู่แล้ว)
     ส่วน ac / ae_supervisor / admin ปล่อยว่างไม่ได้ — ดีลจะตกเป็นของผู้ประสาน/
     ผู้กำกับเงียบ ๆ แล้วไม่มี AE คนไหนเห็นมันในคิว "ของฉัน" เลย */
  if (!body.ownerId && !ownerLockedToSelf(user.role)) {
    return badRequest('ต้องเลือกผู้รับผิดชอบ (AE) ของดีลนี้');
  }
  let owner = null;
  if (body.ownerId) {
    const checked = await validateDealOwner(supabase, body.ownerId, user, body.team);
    if (!checked.ok) return badRequest(checked.error);
    owner = checked;
  }

  let customerName = body.customerName || null;
  if (body.customerId) {
    const { data: customer } = await supabase
      .from('customers')
      .select(CUSTOMER_NAME_SELECT)
      .eq('id', body.customerId)
      .maybeSingle();
    // ลูกค้าที่มีแต่ชื่ออังกฤษเคยได้ null ทับชื่อที่ฟอร์มส่งมา — ดีลจึงเกิดมาพร้อมชื่อว่าง
    customerName = customerSnapshotName(customer) || customerName;
  }

  // ลีดต้นทาง: ตัดสินครั้งเดียวจากทั้งสองช่อง แล้วใช้ค่านี้ทั้งด่านตรวจสิทธิ์และคอลัมน์
  // (ดูเหตุผลเต็มที่ sourceLeadIdOf) — ห้ามอ่าน body.leadId / metadata.leadId ตรง ๆ อีก
  const leadSource = sourceLeadIdOf(body);
  if (leadSource.error) return badRequest(leadSource.error);
  const sourceLeadId = leadSource.leadId;

  // รหัสดีลฐาน DL-YYMMXXXX (atomic ต่อเดือน — mig 0096). แสดง DL-YYMMXXXX-0 ที่ UI/เอกสาร.
  // ⚠️ ไม่ใส่ code ตรงนี้ — ออกพร้อม insert ในทรานแซกชันเดียว (mig 0240) ไม่งั้นทุก
  // ครั้งที่ insert ล้ม รหัสดีลจะหายไปหนึ่งเลขโดยไม่มีใครรู้
  /* ⭐ วันเริ่ม/วันสิ้นสุดบังคับกรอก (มติผู้ใช้ 2026-09-02) — สูตรเดียวกับฟอร์ม
     ⚠️ **วันสิ้นสุด = วันที่ลูกค้ารับของ** ซึ่งรายงาน FC วางแผนผลิตใช้เป็นแกนเดือน
        ปล่อยว่างเมื่อไร รายงานต้องเดาเดือนจากวันปิดการขายแทน (ของจริงก่อนมีด่านนี้:
        70 ดีล = 26,534,973 บาท ไม่มีวันสิ้นสุด)
     ⚠️ ด่านอยู่ที่ **route ของฟอร์ม** ไม่ใช่ที่ฐาน — สายสหมิตรเขียน sales_deals ตรง ๆ
        ด้วย service-role และไม่มีวันพวกนี้โดยธรรมชาติ (FC มาจากรอบพยากรณ์) */
  const missingDates = missingDealDatesAfterWrite(null, body);
  if (missingDates.length) {
    return badRequest(`กรุณากรอก ${missingDates.map((key) => DEAL_DATE_LABEL[key]).join(' · ')}`);
  }

  const row = {
    id: genId('DEAL'),
    customerId: body.customerId || null,
    customerName,
    title: body.title.trim(),
    stage,
    projectValue,
    // mig 0337: ยอดที่คนกรอกอยู่ในช่องของมันเอง — projectValue เป็นแค่ "ยอดที่ใช้จริง"
    // ซึ่งดีลใหม่เริ่มที่ manual เสมอ (ยังไม่มีใบเสนอราคาให้เดินตาม)
    forecastManualValue: projectValue,
    // ⚠️ ไม่เขียน wonValue — trigger enforce_sales_order_actual_on_deal (0110 · นิยามล่าสุด 0353)
    //    คิดจาก SO อนุมัติทุกครั้งตั้งแต่ INSERT · ดีลเก่า Won มียอด 0 เสมอ (ด่าน legacyWonCreateError)
    // FC% มาจากกติกา ไม่ใช่จากฟอร์ม (มติผู้ใช้ 2026-08-05)
    // 🐞 ค่าตั้งต้นของฟอร์มคือ "50" มาตลอด ทั้งที่ขั้นตั้งต้นคือ 'lead' ⇒ ดีลใหม่ทุกใบ
    // เกิดมาที่ 50% ทั้งที่ยังไม่มีใบเสนอราคาสักใบ (ระดับ 50 = ออกใบเสนอราคาแล้ว)
    // ดีลตอนสร้างยังไม่ผูกโครงการ (POST ไม่รับ projectId — ผูกทีหลังที่ link-project
    // ซึ่งคิด FC ใหม่ให้) จึงไม่ต้องหาพี่น้อง SCENT ตรงนี้
    probability: autoProbability({ stage, dealType: normalizeDealType(body.dealType ?? body.projectType ?? body.metadata?.projectType) }),
    // เดือน FC อนุมานจากวันที่คาดปิดเสมอ (มติผู้ใช้ 2026-07-16 — ฟอร์มไม่มีช่องเดือนแล้ว
    // และไม่รับค่าจาก client); ไม่ระบุวันที่คาดปิด → ตกเป็นเดือนปัจจุบัน (default เดิมของฟอร์ม)
    forecastMonth: monthKey(body.expectedCloseDate) || monthKey(new Date().toISOString()),
    expectedCloseDate: body.expectedCloseDate || null,
    // ดีลเก่า Won: ช่อง "วันที่ปิดในระบบเดิม" (คีย์ expectedCloseDate) → confirmedAt
    // ⭐ เก็บไว้เพราะมีตัวอ่านจริง ไม่ใช่เพื่อยอด: wonMonthOf จัดดีล Won เข้าเดือน (wonMonth → confirmedAt
    //    → … → forecastMonth) ⇒ ไม่มีวันนี้ ดีลงานเก่าไปนับเป็นดีล Won ของเดือนที่คีย์ (wonCount ราย
    //    ประเภท/คน/ทีม · ลิ้นชัก "ปิดได้") · ยอดเป็น 0 เสมอ (มติผู้ใช้ 2026-09-14)
    confirmedAt: stage === 'won' ? (body.expectedCloseDate || null) : null,
    lostReason: stage === 'lost' ? (body.lostReason || null) : null,
    notes: body.notes || null,
    ownerId: owner?.ownerId || user.id || null,
    // ชื่อมาจาก server เสมอเมื่อมีการเลือกเจ้าของ — ไม่รับ body.ownerName อีก
    ownerName: owner?.ownerName || user.name || null,
    // ทีมตามเจ้าของ ไม่ใช่ตามคนกด — ไม่งั้นดีลที่ AC มอบให้ AE ทีมอื่นจะติดทีมของ AC
    // (เจ้าของมองไม่เห็นดีลตัวเอง) · เจ้าของที่ไม่มีทีม (admin) ตกกลับไปใช้ทีมคนกด
    // ทีมตามเจ้าของ ไม่ใช่ตามคนกด · เจ้าของอยู่หลายทีมได้ ⇒ ฟอร์มเลือกได้ว่าใบนี้เข้าทีมไหน
    // (validateDealOwner ตีค่าที่ไม่ใช่ทีมของเจ้าของทิ้งแล้ว) · ไม่มีเจ้าของ = ทีมของคนกด
    team: owner?.team || attributionTeam(user, body.team),
    // ประเภทดีล 3 ค่า (SCENT/NPD/RE-ORDER) = คอลัมน์จริง (mig 0088) — ค่าตรงกับ
    // projects.type ส่งต่อเป็น template ตอนสร้างโครงการ PM. transition: เขียน
    // metadata.projectType คู่ไว้ 1 เฟส ให้โค้ด/แคชเก่าอ่านได้.
    dealType: normalizeDealType(body.dealType ?? body.projectType ?? body.metadata?.projectType),
    // สายธุรกิจ (mig 0274) — ครึ่งที่สองของกุญแจแม่แบบไทม์ไลน์ · โครงการที่ก่อจาก
    // ดีลใบนี้ต้องเป็นสายเดียวกัน (ด่านที่ create-project/link-project)
    line,
    // ชื่อสูตรกลิ่น (ดีล SCENT — จุดปลั๊กอิน RD ในอนาคต)
    formulaName: (body.formulaName || '').trim() || null,
    // หมวดสินค้า (DL1 — mig 0094): ใช้เลือก timeline template ตามหมวด
    categoryCode,
    // วันที่เริ่ม/สิ้นสุดของดีล (mig 0095) — startDate ใช้เป็น anchor gen ไทม์ไลน์
    startDate: body.startDate || null,
    endDate: body.endDate || null,
    metadata: {
      // ⚠️ คีย์ของระบบถอดออกจากค่าที่ client ส่งมา (actualSource = trigger · legacyClosedValue/Date
      //    = mig 0359 · wonSource/acceptedQuotationId = RPC รับใบเสนอราคา — แต่งมาเองหลบตัวบ่งชี้ดีลเก่า
      //    ที่สร้างเป็น Won ได้) — SERVER_ONLY_DEAL_METADATA_KEYS ใน lib/sales/legacyDealSwitch
      //    ธง legacy ไม่ถูกถอด (ด่านข้างบนกับตัวบ่งชี้อ่านมัน) แต่เก็บเฉพาะ true จริง — ค่าอื่นไม่เก็บ
      ...clientDealMetadataOnCreate(body.metadata),
      projectType: normalizeDealType(body.dealType ?? body.projectType ?? body.metadata?.projectType),
      brand: (body.brand ?? body.metadata?.brand ?? '') || '',
      // สะท้อนคอลัมน์เสมอ กันไม่ให้เกิดสองความจริงในแถวเดียว (ผู้อ่านใหม่ต้องใช้คอลัมน์)
      ...(sourceLeadId ? { leadId: sourceLeadId } : {}),
    },
    leadId: sourceLeadId,
  };

  // The creator may only mint deals within its own edit scope: an AE cannot
  // hand ownership to another user, and team-scoped roles cannot create for
  // another team. Superusers (scope 'all') are unrestricted.
  if (!inSalesEditScope(user, row)) return forbidden();

  // แตกดีลจากลีด (ปุ่มที่หน้าลีด หรือเลือกลีดต้นทางในฟอร์มเพิ่มดีลที่หน้าดีล — มติ 2026-09-22)
  // ด่านเดียวกับ "ผูกลีดย้อนหลัง" (lib/sales/dealLeadLink · leadLinkError) — ใครผูกได้ · ลีดสถานะไหน
  // เชื่อค่าที่ client ส่งมาดิบ ๆ ไม่ได้ (เดิมยิงลีดทีมอื่น/สถานะใดก็บังคับ qualified ได้)
  // ⚠️ ด่านนี้ต้องผูกกับ `row.leadId` เท่านั้น = ค่าเดียวกับที่เขียนลงคอลัมน์ ห้ามเพิ่ม
  // เงื่อนไขอย่าง metadata.source มาคั่น ไม่งั้นจะกลับไปมี "ทางเขียนคอลัมน์ที่ไม่ผ่านด่าน"
  // ⚠️ ตรวจก่อน insert เสมอ — ลีดไม่ผ่าน = ไม่มีดีลเกิด
  let sourceLead = null;
  if (row.leadId) {
    const { data: lead, error: leadError } = await loadLeadForLink(supabase, row.leadId);
    if (leadError) return fail(leadError.message, 500);
    if (!lead) return badRequest('ไม่พบลีดต้นทาง');
    const denied = leadLinkError({ user, lead });
    if (denied) return fail(denied.message, denied.status);
    sourceLead = lead;
  }

  const { data: created, error } = await insertRowWithEntityCode(supabase, 'DL', row);
  if (error) return fail(error.message, 500);
  // ฟังก์ชัน SQL คืนเฉพาะแถวของ sales_deals — response เดิมมีลูกค้าที่ join ไว้ใน
  // selectDeal ติดมาด้วย จึงอ่านกลับอีกครั้งให้หน้าจอได้ของหน้าตาเดิม (อ่านไม่ได้ =
  // ใช้แถวดิบ ดีลถูกสร้างสำเร็จไปแล้ว ไม่ควรตอบ error เพราะ join ไม่มา)
  const { data: joined } = await supabase
    .from('sales_deals').select(selectDeal).eq('id', created.id).maybeSingle();
  const data = joined || created;

  /* แถวมูลค่ารายหมวด (mig 0264) — เขียนหลังดีลเกิดแล้วเพราะต้องมี dealId
     ⚠️ ยอดรวมในแถวดีลถูกเขียนไปแล้วตั้งแต่ insert ⇒ เขียนแถวไม่สำเร็จ = ยอดกับที่มา
     ไม่ตรงกัน ต้องบอกผู้ใช้ให้เข้าไปแก้ที่หน้าดีล (ล้มทั้งคำขอไม่ได้ — ดีลเกิดจริงแล้ว
     และการกด "สร้าง" ซ้ำจะได้ดีลซ้ำ ตามที่ DealCreateModal เตือนไว้) */
  let valueItemsWarning = null;
  if (hasValueItems) {
    const { error: itemsError } = await saveDealValueItems(supabase, data.id, prepared.items);
    if (itemsError) valueItemsWarning = `บันทึกรายการมูลค่าคาดการณ์ไม่สำเร็จ: ${itemsError} — ยอดรวม ${projectValue} บาทถูกบันทึกแล้ว แต่รายการแยกหมวดยังไม่ครบ แก้ได้ที่หน้าดีล`;
  }

  /* ไทม์ไลน์เกิดพร้อมดีลเสมอ ไม่ต้องกดสร้างเอง (มติผู้ใช้ 2026-08-08) — ฟอร์มสร้าง
     มีครบทุกอย่างที่ template ใช้แล้ว (ประเภทดีล/หมวดสินค้า/วันที่เริ่ม/เจ้าของ)
     · ไม่ขยับ stage เป็นเสนอไทม์ไลน์ — นั่นคือความหมายของ "การกดเสนอ" ที่ผู้ใช้ทำเอง
       (ปุ่มเดิมที่หน้าดีลยังอยู่สำหรับดีลเก่า/สร้างใหม่หลังลบ)
     · gen ไม่ได้ (template ไม่เผยแพร่/หมวดไม่ตรงสักขั้น) = ดีลต้องสร้างสำเร็จอยู่ดี
       ตอบ timelineWarning ให้ UI เตือน ไม่ใช่ล้มทั้งคำขอ */
  let timelineWarning = null;
  if (stage !== 'lost') {
    try {
      const { rows: timelineRows, genType } = await buildDealTimelineRows(supabase, data);
      if (!timelineRows.length) {
        timelineWarning = categoryCode
          ? `Workflow Template ${genType} ไม่มีขั้นตอนที่ตรงกับหมวดสินค้า ${categoryCode} — ดีลนี้ยังไม่มีไทม์ไลน์`
          : `Workflow Template ${genType} ที่เผยแพร่อยู่ไม่มีขั้นตอน — ดีลนี้ยังไม่มีไทม์ไลน์`;
      } else {
        const { error: timelineError } = await supabase.from('project_tasks').insert(timelineRows);
        if (timelineError) timelineWarning = `สร้างไทม์ไลน์ไม่สำเร็จ: ${timelineError.message}`;
      }
    } catch (timelineErr) {
      timelineWarning = `สร้างไทม์ไลน์ไม่สำเร็จ: ${timelineErr.message}`;
    }
  }

  /* ประวัติสถานะแรก + snapshot FC แรก — ดีลเกิดแล้ว ห้ามตอบ 500 (กดสร้างซ้ำ = ดีลซ้ำ)
     แถวหายไม่กระทบตัวเลขไหน: daysInStage ถอยไปนับจาก createdAt ซึ่งเป็นเวลาเดียวกัน
     และรายงาน FC อ่านจาก sales_deals ⇒ เสียแค่บรรทัด "เริ่ม → …" ในเส้นเรื่อง · log ไว้ */
  const { error: historyError } = await supabase.from('sales_deal_stage_history').insert({
    id: genId('DSH'),
    dealId: data.id,
    fromStage: null,
    toStage: data.stage,
    changedBy: user.id || null,
    changedByName: user.name || null,
  });
  if (historyError) console.error(`[deal-create ${data.id}] บันทึกประวัติสถานะแรกไม่สำเร็จ:`, historyError.message);
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
  if (forecastError) console.error(`[deal-create ${data.id}] บันทึก snapshot FC แรกไม่สำเร็จ:`, forecastError.message);

  await recordAudit({
    user,
    action: 'create',
    entityType: 'sales_deal',
    entityId: data.id,
    after: data,
    summary: `สร้าง sales deal ${dealAuditLabel(data)}`,
    request: req,
  });

  // ถ้าดีลนี้สร้างมาจากลีด (ผ่าน guard ด้านบนแล้ว): ลีดเป็น "เปิดลูกค้าแล้ว" (ครั้งแรก) +
  // บันทึกเหตุการณ์ create_deal ทุกครั้ง (ลีด 1 ใบมีได้หลายดีล) — เส้นเดียวกับผูกย้อนหลัง
  // ⚠️ ห้ามตอบ 500 จากตรงนี้: ดีลเกิดแล้ว กดสร้างซ้ำ = ดีลซ้ำ ⇒ พลาดอะไรกลายเป็น leadWarning
  let leadWarning = null;
  if (sourceLead) {
    const opened = await recordLeadDealOpened(supabase, { lead: sourceLead, deal: data, user, req, via: 'create' });
    leadWarning = opened.warning;
  }

  // timelineWarning / valueItemsWarning / leadWarning: ดีลสร้างสำเร็จแต่ของประกอบไม่ครบ —
  // โมดัลใช้แจ้งต่อ (ไม่ใช่ error: ดีลเกิดจริงแล้ว กดสร้างซ้ำจะได้ดีลซ้ำ)
  return ok({
    ...data,
    ...(timelineWarning ? { timelineWarning } : {}),
    ...(valueItemsWarning ? { valueItemsWarning } : {}),
    ...(leadWarning ? { leadWarning } : {}),
  }, 201);
});
