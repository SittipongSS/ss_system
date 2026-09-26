import { genId } from '@/lib/id';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { recordAudit } from '@/lib/audit';
import { withUser, ok, fail, badRequest, conflict, forbidden, notFound, unauthorized } from '@/lib/http';
import { canEditSalesPlanning, canViewSalesPlanning, inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { closedProjectBlock } from '@/lib/sales/closedProjectGate';
import { isSalesOrderReviewer, isSalesOrderWaitingOnMe } from '@/lib/sales/salesOrderWorkflow';
import { isSalesOrderSelfApproval } from '@/lib/sales/salesOrderApprovalOverride';
import { awaitsFinanceReview } from '@/lib/sales/salesOrderFinanceApproval';
import { canConfirmPayment } from '@/lib/permissions';
import { salesOrderPaymentCell } from '@/lib/sales/salesOrderPayments';
import { ensureInstallments } from '@/lib/sales/salesOrderInstallmentsStore';
import { validateOrderConfirmation, sanitizeEvidenceAttachments, DEFAULT_EVIDENCE_BUCKET } from '@/lib/sales/orderConfirmationDocs';
import { parseDeliveryDueDate } from '@/lib/sales/salesOrderDeliveryDue';
import { parseCreateFormInstallments } from '@/lib/sales/salesOrderCreateInstallments';
import { applyCreateFormPayments } from '@/lib/sales/salesOrderCreatePayments';
import { missingStoredEvidence } from '@/lib/upload/privateEvidence';
import { businessDate } from '@/lib/businessDate';
import { orderBusinessLineOf, orderHasServiceRounds } from '@/lib/sales/serviceOrders';
import { paidThrough } from '@/lib/sales/paymentCoverage';

export const dynamic = 'force-dynamic';

export const GET = withUser(async ({ user, supabase }) => {
  if (!user) return unauthorized();
  if (!canViewSalesPlanning(user)) return forbidden();

  // ⚠️ ไล่ทีละหน้า — เพดาน 1,000 แถวตัดเงียบ ๆ · `orderDate` ซ้ำกันได้ทั้งวัน จึงพ่วง
  // `id` ปิดท้ายให้ลำดับนิ่ง ไม่งั้นไล่หน้าแล้วได้แถวซ้ำและแถวหายพร้อมกัน
  const { data: orders, error } = await fetchAllResult(() => supabase
    .from('sales_orders')
    .select('*')
    .order('orderDate', { ascending: false })
    .order('createdAt', { ascending: false })
    .order('id', { ascending: true }));
  if (error) return fail(error.message, 500);

  // 🐞 **บรรทัดของใบต้องมาด้วย** — หน้าเปิดคำร้องพัฒนากลิ่นอ่าน `so.lines` เพื่อรู้ว่า
  // ใบไหนเป็นงานออกแบบกลิ่น (ชุดหมวดอยู่ที่ `SCENT_DESIGN_CATEGORIES`) และขายกี่กลิ่น
  // ⚠️ อย่าไล่เขียนรหัสหมวดซ้ำในคอมเมนต์อีก — เพิ่ม 03-010 (แก้ไขกลิ่น) เมื่อ 2026-08-10
  // แล้วบรรทัดนี้ตกยุคทันที · ก่อนหน้านี้ API
  // ไม่เคยส่งมา ⇒ `lines` เป็น undefined เสมอ ⇒ จำนวนกลิ่นไม่ขึ้นและบล็อกบรีฟไม่งอก
  // สักก้อน = เลือกใบสั่งขายแล้วทำอะไรต่อไม่ได้เลย (ผู้ใช้เจอเองบนจอ)
  //
  // ⚠️ เอาเฉพาะช่องที่ผู้เรียกใช้จริง — ทั้งแถวมีราคาต่อหน่วยและส่วนลดซึ่งไม่เกี่ยวกับ
  // คำร้อง ยิ่งดึงมามาก ยิ่งมีของให้หลุดออกทาง response โดยไม่ตั้งใจ
  const todayIso = businessDate();
  const orderIds = (orders || []).map((row) => row.id);
  const { data: lines, error: lineError } = await fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_order_lines')
    /* 🚫 ธงของ 0362 (`siteNotFoundAt`/`siteClosedAt`) ไม่ถูกอ่านที่นี่แล้ว (มติ 22/09) — ชิป/ตัวกรอง
       "TS ไม่พบจุด" ถอดไปพร้อมเส้นนั้น · บรรทัดใบย้อนหลังผูกโซนตั้งแต่ตอนคีย์ ⇒ ไม่มีจุดลอยให้แจ้ง
       ⚠️ คอลัมน์ยังอยู่ในฐาน (0 แถว) — ไม่ต้องเลือกมาเพื่อให้ทะเบียนเบาลงอีกช่อง */
    .select('id, salesOrderId, qty, fgCode, description, sortOrder, "serviceRounds"')
    .in('salesOrderId', chunk)
    .order('salesOrderId', { ascending: true })
    .order('sortOrder', { ascending: true })
    .order('id', { ascending: true })));
  if (lineError) return fail(lineError.message, 500);
  const linesByOrder = new Map();
  for (const line of lines || []) {
    const list = linesByOrder.get(line.salesOrderId) || [];
    list.push(line);
    linesByOrder.set(line.salesOrderId, list);
  }

  // ⭐ ใบไหนถูกเปิดคำร้องพัฒนากลิ่นไปแล้ว — ฟอร์มเปิดคำร้องใช้กรอง dropdown
  // ให้ตรงกับป้าย "ใบสั่งขายออกแบบกลิ่น" · ไม่มีข้อมูลนี้ ผู้ใช้จะเลือกใบที่ใช้ไปแล้ว
  // กรอก PDR จนจบ แล้วโดนปฏิเสธตอนกดส่ง
  //
  // ⚠️ **เงื่อนไขต้องตรงกับ `dept_requests_pdr_so_uk` (mig 0219) เป๊ะ ๆ** — เหมือนที่
  // route ของ SO รายใบทำ · หลวมกว่านี้ = ใบที่ยกเลิกแล้วหายจากลิสต์ทั้งที่เปิดใหม่ได้
  //
  // ⚠️ อ่านด้วย service-role โดยตั้งใจ — ทะเบียนคำร้องมีขอบเขตของตัวเอง (ผู้ขอเห็น
  // เฉพาะของตัวเอง) ⇒ ถามผ่านทางนั้นจะได้ "ว่าง" ทั้งที่เพื่อนร่วมทีมเปิดไปแล้ว
  // · คืนออกไปแค่ id/docNo/status เท่าที่ลิสต์ต้องใช้
  const { data: scentRequests, error: scentRequestError } = await fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase
    .from('dept_requests').select('id, docNo, status, "salesOrderId"')
    .in('salesOrderId', chunk).eq('kind', 'scent_dev').neq('status', 'cancelled')
    .order('id', { ascending: true })));
  if (scentRequestError) return fail(scentRequestError.message, 500);
  const scentRequestByOrder = new Map(
    (scentRequests || []).map((row) => [row.salesOrderId, row]),
  );

  // รหัส AR โชว์เหนือชื่อลูกค้าในตาราง (มติผู้ใช้ 2026-08-12) — พ่วงจากทะเบียน
  // แพตเทิร์นเดียวกับ QT route · ids ว่างไม่ยิง query
  const customerIds = [...new Set((orders || []).map((row) => row.customerId).filter(Boolean))];
  let arById = new Map();
  if (customerIds.length) {
    /* ยิงทีละก้อน — id ลูกค้าเป็น 'CUS-'+uuid ยาว 40 ตัวอักษร ⇒ URL เกิน 16 KB ที่ ~330 ราย
       ทะเบียนลูกค้าวันนี้ 523 ราย (เหตุผลเต็มที่ lib/supabaseInChunks.js) */
    const { data: customers, error: customerError } = await fetchInChunks(customerIds, (chunk) => supabase
      .from('customers').select('id, "arCode"').in('id', chunk));
    if (customerError) return fail(customerError.message, 500);
    arById = new Map((customers || []).map((c) => [c.id, String(c.arCode || '').trim() || null]));
  }

  const dealIds = [...new Set((orders || []).map((row) => row.dealId).filter(Boolean))];
  const quoteIds = [...new Set((orders || []).map((row) => row.quotationId).filter(Boolean))];
  const [{ data: deals, error: dealError }, { data: quotes, error: quoteError }] = await Promise.all([
    dealIds.length
      /* 🪤 คอลัมน์สายธุรกิจชื่อ `line` ทั้งที่ `sales_deals` และ `projects` — `businessLine`
         เป็นชื่อในโค้ด JS เท่านั้น ไม่มีคอลัมน์นั้นจริง · ไม่ดึงมา = ทุกใบตอบสาย null
         ⇒ ตัวกรองสายบริการว่างเปล่าทั้งที่ข้อมูลมีอยู่ */
      ? fetchInChunks(dealIds, (chunk) => fetchAllResult(() => supabase.from('sales_deals').select('id, title, stage, dealType, team, ownerId, ownerName, customerName, projectId, line').in('id', chunk).order('id', { ascending: true })))
      : Promise.resolve({ data: [], error: null }),
    quoteIds.length
      // paymentPlan มาด้วยเพื่อบอกจำนวนงวด **ตามแผน** ของใบที่ยังไม่เริ่มติดตาม
      // (ไม่งั้นคอลัมน์งวดจะว่างทั้งที่ใบเสนอราคาระบุไว้แล้วว่าแบ่งกี่งวด)
      ? fetchInChunks(quoteIds, (chunk) => fetchAllResult(() => supabase.from('quotations').select('id, quoteNumber, status, paymentPlan').in('id', chunk).order('id', { ascending: true })))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (dealError || quoteError) return fail((dealError || quoteError).message, 500);

  /* ── งวดชำระของแต่ละใบ (mig 0245) — คอลัมน์ "เก็บแล้ว x/y" ในตาราง ────────
     ⚠️ ยิงรวดเดียวทั้งหน้าแล้วจัดกลุ่มใน JS — ห้ามยิงรายใบในลูป (N+1)
     ⚠️ ดึงแค่ 3 คอลัมน์ที่ใช้จริง ไม่เอา evidence/เหตุผลมาทั้งก้อน
     (`orderIds` ประกาศไว้ข้างบนแล้วตอนดึงบรรทัดของใบ)
     ⭐ `kind` (mig 0374) — งวดยกมาของใบย้อนหลังไม่นับเป็น "ต้องมีใบกำกับ" (ออกในระบบเดิมแล้ว · salesOrderPaymentCell)
     ⭐ `refundedAt` (mig 0378) — งวดที่บัญชีบันทึกคืนเงินแล้วไม่นับ "เก็บแล้ว"/"ต้องมีใบกำกับ" (review UI-2 · salesOrderPaymentCell)
       ⚠️ ก่อนรัน 0378 ไม่มีคอลัมน์ (42703) ⇒ ถอยไปอ่านชุดเดิม (ไม่มีงวดคืนเงินอยู่แล้ว) — PR3 สัญญาว่าทะเบียน/แผงไม่พังก่อนรันมิก
     ⚠️ คอมเมนต์ใหม่วางเหนือ `.from()` — ด่าน check:columns มองหา `.select(` ไม่เกิน 200 ตัวอักษรหลัง `.from(` */
  const installmentsByOrder = new Map();
  if (orderIds.length) {
    const { data: rows, error: installmentError } = await loadListInstallments(supabase, orderIds);
    // ตารางยังไม่ถูกสร้าง (ยังไม่รัน mig 0245) ต้องไม่ทำให้ทั้งหน้าพัง — คอลัมน์ว่างแทน
    if (installmentError) console.error('[sales-orders] โหลดงวดชำระไม่สำเร็จ:', installmentError.message);
    for (const row of rows || []) {
      const list = installmentsByOrder.get(row.salesOrderId) || [];
      list.push(row);
      installmentsByOrder.set(row.salesOrderId, list);
    }
  }

  const dealById = new Map((deals || []).map((row) => [row.id, row]));
  const quoteById = new Map((quotes || []).map((row) => [row.id, row]));

  /* ── สายธุรกิจของใบ + สรุปงานบริการ (PR-D · มติผู้ใช้ 2026-08-27) ─────────
     ⚠️ สายธุรกิจอ่าน **โครงการก่อน แล้วดีล** (orderBusinessLine) ⇒ ต้องมีโครงการด้วย
     ไม่งั้นใบที่อยู่ใต้โครงการสายบริการจะตอบสายตามดีลซึ่งอาจว่าง = หลุดจากตัวกรอง */
  const projectIds = [...new Set((deals || []).map((row) => row.projectId).filter(Boolean))];
  // ⚠️ ไล่ทีละหน้า — ทะเบียนโครงการโตเกิน 1,000 ได้ และ id ที่ส่งเข้ามาเป็นชุดใหญ่
  // ตามจำนวนดีลของทั้งทะเบียน (เพดานตัดเงียบ = ใบบางใบตอบสายผิดโดยไม่มีใครรู้)
  const { data: projects, error: projectError } = projectIds.length
    ? await fetchAllResult(() => supabase.from('projects').select('id, line')
      .in('id', projectIds).order('id', { ascending: true }))
    : { data: [], error: null };
  if (projectError) return fail(projectError.message, 500);
  const projectsById = new Map((projects || []).map((row) => [row.id, row]));

  /* ใบสาย SERVICE ที่มีแพ็คเกจบริการ — ของพ่วงข้างล่างยิงเฉพาะใบกลุ่มนี้
     (ทั้งทะเบียนมีหลายพันใบ แต่ใบบริการมีหลักสิบ ⇒ กรองก่อนค่อยยิง) */
  const serviceOrders = (orders || []).filter((row) => orderHasServiceRounds(
    { ...row, deal: dealById.get(row.dealId) || null },
    linesByOrder.get(row.id) || [],
    { projectsById, dealsById: dealById },
  ));
  const serviceOrderIds = serviceOrders.map((row) => row.id);

  // สัญญาที่ผูกกับใบ (mig 0324) — คอลัมน์ "สัญญา" ของมุมมองสายบริการ
  const contractIds = [...new Set(serviceOrders.map((row) => row.serviceContractId).filter(Boolean))];
  const { data: contracts, error: contractError } = await fetchInChunks(contractIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_contracts').select('id, "contractNo", status, kind').in('id', chunk).order('id', { ascending: true })));
  if (contractError) return fail(contractError.message, 500);
  const contractById = new Map((contracts || []).map((row) => [row.id, row]));

  /* รอบที่ทำไปแล้วของใบ — นัดที่ปิดงานแล้ว นับผ่าน service_plans."salesOrderId"
     ⚠️ **นัดนอกรอบ (planId ว่าง) ไม่ถูกนับ** โดยเจตนา — นัดที่ไม่ได้เกิดจากรอบขาย
     ของใบนี้ (งานซ่อมฉุกเฉิน ฯลฯ) ไม่ใช่รอบตามข้อผูกพัน
     ⚠️ ทั้งสองคิวรีกรองด้วย in(...) ของใบบริการเท่านั้น ไม่ใช่กวาดทั้งตาราง */
  const roundsDoneByOrder = new Map();
  if (serviceOrderIds.length) {
    const { data: plans, error: planError } = await fetchInChunks(serviceOrderIds, (chunk) => fetchAllResult(() => supabase
      .from('service_plans').select('id, "salesOrderId"').in('salesOrderId', chunk).order('id', { ascending: true })));
    if (planError) return fail(planError.message, 500);
    const orderByPlan = new Map((plans || []).map((row) => [row.id, row.salesOrderId]));
    if (orderByPlan.size) {
      const { data: visits, error: visitError } = await fetchInChunks([...orderByPlan.keys()], (chunk) => fetchAllResult(() => supabase
        .from('service_visits').select('"planId"').eq('status', 'done').in('planId', chunk).order('id', { ascending: true })));
      if (visitError) return fail(visitError.message, 500);
      for (const visit of visits || []) {
        const orderId = orderByPlan.get(visit.planId);
        if (orderId) roundsDoneByOrder.set(orderId, (roundsDoneByOrder.get(orderId) || 0) + 1);
      }
    }
  }
  const serviceIdSet = new Set(serviceOrderIds);
  const visible = (orders || [])
    .map((row) => ({
      ...row,
      customerArCode: arById.get(row.customerId) ?? null,
      lines: linesByOrder.get(row.id) || [],
      deal: dealById.get(row.dealId) || null,
      quotation: quoteById.get(row.quotationId) || null,
      scentRequest: scentRequestByOrder.get(row.id) || null,
      // สรุปงวดพอให้ตารางวาดได้ — รายละเอียดเต็มอยู่ที่หน้ารายละเอียดใบ
      // ⭐ `payment.nextDue` = กำหนดชำระถัดไปจากงวด (บรรทัด "กำหนด …" + การเรียง "กำหนดชำระ") แทน `paymentDueDate` ค่าตายของใบ
      //   (กำหนดวางบิลรอบสอง 26/09) — คิดจาก `status` + `dueDate` ที่ loadListInstallments เลือกมาอยู่แล้ว ไม่ต้องอ่านเพิ่ม
      payment: salesOrderPaymentCell(
        installmentsByOrder.get(row.id) || [],
        quoteById.get(row.quotationId)?.paymentPlan,
        todayIso,
        row.totalAmount,
        // ใบ revised (mig 0376: งวดย้ายไปใบ Rev. ทั้งแถว) = ไม่มีคอลัมน์งวด — ไม่ใช่ "ยังไม่เริ่มติดตาม" จากแผน QT
        row.status,
      ),
      /* ธงเดียวกับที่ป้ายตัวเลขบนเมนูนับ (ม-114) — ติดที่ server ด้วย helper ตัวเดียวกัน
         ไม่ให้จอเดาเอง ไม่งั้นเลขบนเมนูกับลิสต์ที่กรองแล้วไม่ตรงกัน

         🐞 **เลนบัญชีเคยตกจากธงนี้** (ตรวจ 2026-09-02) — ใบที่เก็บครบรอบัญชีปิดอยู่
         บนแกน `financeStatus` ไม่ใช่ `status` ⇒ ฝ่ายบัญชีได้ธง false ทุกใบ:
         เมนูใบสั่งขายไม่มีป้าย และถ้ากดลิงก์ `?count=salesOrders` มาก็ได้ลิสต์ว่าง
         ทั้งที่การ์ด "รอบัญชีตรวจ" บนหัวหน้าเดียวกันมีของอยู่ */
      /* ⚠️ ส่ง `role` ด้วยเสมอ — เลนผู้รีวิวตัดใบที่ตัวเองสร้าง/ยื่นออก ยกเว้น admin (อนุมัติใบตัวเองได้)
         ไม่ส่ง = admin ถูกตัดใบของตัวเองออก ⇒ ลิสต์ "รอฉันลงมือ" ไม่ตรงกับป้ายบนเมนู (nav/counts ส่ง role) */
      /* ⚠️ แนบ deal ให้ helper — ใบที่ถูกย้อนอนุมัติตัดสินจากเจ้าของดีล (มติ 24/09) · แถวดิบไม่มี deal = ลิสต์กับป้ายไม่ตรงกัน */
      _waitingOnMe: isSalesOrderWaitingOnMe({ ...row, deal: dealById.get(row.dealId) || null }, { userId: user.id, reviewer: isSalesOrderReviewer(user.role), role: user.role })
        || (canConfirmPayment(user) && awaitsFinanceReview(row, installmentsByOrder.get(row.id) || [])),
      /* ⭐ ชุดย่อย "รอฉันอนุมัติ" — ตัดใบที่ตัวเองสร้าง/ยื่นออก เพราะอนุมัติเองไม่ได้
         (admin ใช้สิทธิ์ฉุกเฉินได้ แต่ต้องไปทำที่หน้าใบพร้อมเหตุผล ไม่ใช่จากคิว) */
      _awaitingMyApproval: isSalesOrderReviewer(user.role)
        && row.status === 'pending_approval'
        && !isSalesOrderSelfApproval(row, user.id),
      /* ⭐ **แกนที่สองของใบเดียวกัน: ขั้นบัญชีตรวจ** (mig 0250 · `financeStatus`)
         ทะเบียนใบสั่งขายอยู่ในเมนูของฝ่ายบัญชีตั้งแต่มติ 2026-08-22 และหน้าสวมเปลือก
         ตามคนดู ⇒ คิวบนหัวหน้าต้องพูดงานของคนที่ยืนอยู่ ไม่ใช่ของสายขายเสมอ
         ⚠️ ด่านจริงยังอยู่ที่ `financeActionError` บนใบ — ธงนี้เป็นแค่ "มีอะไรรอฉัน" */
      /* ⚠️ ส่งงวดของใบเข้าไปด้วย (มติ 2026-08-30) — คิวบัญชีคือ "ใบที่เก็บครบแล้ว
         รอปิด" ไม่ใช่ทุกใบที่อนุมัติ · ไม่ส่งงวด = ด่านตอบ false ⇒ คิวจะว่างเงียบ ๆ */
      _awaitingFinanceReview: canConfirmPayment(user)
        && awaitsFinanceReview(row, installmentsByOrder.get(row.id) || []),
      /* ⭐ สายธุรกิจของใบ — ตัวกรอง segmented บนทะเบียน (PR-D)
         สามค่า: 'PRODUCT' · 'SERVICE' · null (ยังไม่ระบุ ซึ่งมีจริงเยอะ) */
      businessLine: orderBusinessLineOf(
        { ...row, deal: dealById.get(row.dealId) || null },
        { projectsById, dealsById: dealById },
      ),
      /* สรุปงานบริการ — มีเฉพาะใบที่เข้าเกณฑ์ "ใบมีรอบบริการ" (orderHasServiceRounds)
         ใบสายบริการที่ไม่มีบรรทัดแพ็คเกจได้ null ⇒ คอลัมน์โชว์ขีด ไม่ใช่ 0/0 */
      service: serviceIdSet.has(row.id) ? {
        contract: row.serviceContractId ? (contractById.get(row.serviceContractId) || null) : null,
        // จ่ายถึง = ปลายช่วงครอบของงวดที่บัญชีรับรองแล้ว (ตัวตัดสินเดียว: paidThrough)
        paidThrough: paidThrough(installmentsByOrder.get(row.id) || []),
        roundsSold: (linesByOrder.get(row.id) || [])
          .reduce((sum, line) => sum + (Number(line.serviceRounds) || 0), 0) || null,
        roundsDone: roundsDoneByOrder.get(row.id) || 0,
      } : null,
    }))
    .filter((row) => row.deal && inSalesViewScope(user, row.deal));

  return ok(visible);
});

/* ── ออกใบสั่งขายจากฟอร์มหน้าสร้าง (มติผู้ใช้ 2026-08-24) ──────────────────
   ⭐ **คำขอเดียวจบ** — ฟอร์มถือทุกอย่างไว้ในเครื่องแล้วยิงทีเดียวตอนกด "สร้าง"
   เพราะเลขที่ใบมาจากเคาน์เตอร์ที่ **ใช้ซ้ำไม่ได้** (mig 0241) ⇒ ห้ามสร้างใบเปล่า
   รอไว้แล้วค่อยเติมข้อมูล · ไฟล์ที่แนบพักไว้ใต้ใบเสนอราคาต้นทางก่อน (ยังไม่มี orderId)
   แล้ว ref ตามเข้าใบตอนสร้างสำเร็จ

   payload: { quotationId, referenceDoc?, notes?, deliveryDueDate?, confirmation?, installments?, firstPayment? }
   installments: [{ seq, dueDate?, billingDate?, billingEvent? }] — ดู salesOrderCreateInstallments.js
   ⚠️ **เอกสารยืนยันไม่บังคับตอนสร้าง** — AE ที่ยังรอ PO ต้องตั้งใบร่างไว้ก่อนได้
   ด่านจริงคือตอนยื่นอนุมัติ (`salesOrderConfirmationGate`) */
export const POST = withUser(async ({ user, supabase, req }) => {
  if (!user) return unauthorized();
  if (!canEditSalesPlanning(user)) return forbidden();
  const body = await req.json().catch(() => ({}));
  const quotationId = String(body.quotationId || '').trim();
  if (!quotationId) return badRequest('กรุณาระบุใบเสนอราคา Won');

  const { data: quote, error: quoteError } = await supabase
    .from('quotations')
    .select('id, quoteNumber, status, paymentPlan, totalAmount, deal:sales_deals(*)')
    .eq('id', quotationId)
    .maybeSingle();
  if (quoteError) return fail(quoteError.message, 500);
  if (!quote) return notFound('ไม่พบใบเสนอราคา');
  if (quote.status !== 'accepted') return badRequest('สร้างใบสั่งขายได้เฉพาะ QT ที่ Won แล้ว');
  if (!quote.deal || !inSalesEditScope(user, quote.deal)) return forbidden();
  // โครงการปิดแล้ว = ออก SO ใบใหม่ไม่ได้ (มติ B3). SO ที่ออกไปแล้วยังยื่น/อนุมัติต่อได้
  const closedProject = await closedProjectBlock(supabase, quote.deal.projectId, 'ออกใบสั่งขายใบใหม่');
  if (closedProject) return badRequest(closedProject);

  /* หลักฐานส่วนตัวต้องชี้เข้าโฟลเดอร์ของใบเสนอราคาใบนี้เท่านั้น (ref เก่าแบบ URL/Drive
     ยังผ่านได้) — กันแนบไฟล์ของใบอื่นมาเป็นหลักฐานของใบนี้ */
  const privateBucket = process.env.SUPABASE_PRIVATE_STORAGE_BUCKET || DEFAULT_EVIDENCE_BUCKET;
  const safeQuoteId = String(quote.id).replace(/[^a-zA-Z0-9_-]+/g, '_');
  const attachmentOptions = {
    allowedStorageBucket: privateBucket,
    allowedStoragePathPrefix: `quotations/${safeQuoteId}/order-confirmation/`,
  };
  const confirmCheck = validateOrderConfirmation(body.confirmation || {}, attachmentOptions);
  if (!confirmCheck.ok) return badRequest(confirmCheck.error);
  const confirmation = confirmCheck.confirmation;

  // กำหนดส่งสินค้า (0363) — ไม่บังคับ · ว่าง = ยังไม่ตกลงวันส่ง
  const deliveryDue = parseDeliveryDueDate(body.deliveryDueDate);
  if (!deliveryDue.ok) return badRequest(deliveryDue.error);

  // เงินงวดแรกที่ลูกค้าจ่ายมาแล้ว (ไม่บังคับ) — ลงเป็น "งวดร่างที่บันทึกเงินไว้"
  // สถานะยังเป็น pending ตาม CHECK ของ 0259 แล้วขึ้นเป็นคำแจ้งตอนใบอนุมัติ
  const firstPaidOn = String(body.firstPayment?.paidOn || '').trim() || null;
  const firstEvidence = sanitizeEvidenceAttachments(body.firstPayment?.evidence, attachmentOptions);
  if (firstPaidOn && !/^\d{4}-\d{2}-\d{2}$/.test(firstPaidOn)) return badRequest('รูปแบบวันที่ชำระงวดแรกไม่ถูกต้อง');
  if (firstPaidOn && !firstEvidence.length) return badRequest('บันทึกว่าลูกค้าจ่ายงวดแรกแล้ว ต้องแนบหลักฐานการชำระอย่างน้อย 1 ไฟล์');
  if (!firstPaidOn && firstEvidence.length) return badRequest('แนบหลักฐานการชำระงวดแรกแล้ว ต้องระบุวันที่ลูกค้าจ่ายด้วย');

  const storageMiss = await missingStoredEvidence(supabase, privateBucket, [
    ...(confirmation?.attachments || []), ...firstEvidence,
  ]);
  if (storageMiss) return badRequest(storageMiss);

  /* วันของงวด: กำหนดชำระ + วันวางบิล/รอเหตุการณ์ (mig 0389 · ม็อก billing-cycle จอ B) — ไม่บังคับ
     ⭐ ตรวจ **ก่อนออกเลขใบ** — เลขใบใช้ซ้ำไม่ได้ (0241) ⇒ ค่าผิดต้องตอบ 400 ตั้งแต่ยังไม่มีใบ
        (เดิมค่าผิดถูกข้ามเงียบ ๆ ใน applyCreateFormPayments แล้วใบออกไปโดยงวดไม่มีวันที่คนกรอก) */
  const installmentDates = parseCreateFormInstallments(body.installments);
  if (installmentDates.error) return badRequest(installmentDates.error);

  const orderId = genId('SOR');
  const { data: order, error } = await supabase.rpc('create_sales_order_draft', {
    p_quote_id: quotationId,
    p_order_id: orderId,
    p_actor_id: user.id || null,
    p_actor_name: user.name || null,
    p_overrides: {
      referenceDoc: String(body.referenceDoc || '').trim() || null,
      notes: typeof body.notes === 'string' ? body.notes : null,
      deliveryDueDate: deliveryDue.value,
      confirmDocType: confirmation?.docType || null,
      confirmDocNo: confirmation?.docNo || null,
      confirmDocDate: confirmation?.docDate || null,
      confirmAttachments: confirmation?.attachments || [],
    },
  });
  if (error) {
    if (error.code === '23505' || error.message?.includes('already_exists')) {
      return conflict('ใบเสนอราคาใบนี้ออกใบสั่งขายไปแล้ว');
    }
    return fail(error.message, /quotation_|sales_order_/.test(error.message || '') ? 400 : 500);
  }
  await recordAudit({ user, action: 'create', entityType: 'sales_order', entityId: orderId, before: null, after: order, summary: `create SO draft from ${quote.quoteNumber}`, request: req });

  /* ── งวดชำระเกิดพร้อมใบ ไม่ต้องรอใครกดปุ่ม (มติผู้ใช้ 2026-08-19) ─────────
     เดิม B-4 ปลดด่าน "ต้องอนุมัติก่อน" แล้ว แต่ยังต้องกด "เริ่มติดตามการชำระ" ก่อน
     ถึงจะมีแถวให้กรอกกำหนดชำระ · ปุ่มนั้นไม่รับ input และไม่มีการตัดสินใจอยู่ข้างหลัง
     (`ensureInstallments` idempotent · ด่านเดียวคือใบต้องไม่ถูกยกเลิก ซึ่งใบที่เพิ่งเกิด
     เป็นไปไม่ได้) ⇒ เป็นก้าวที่ไม่ได้ถามอะไรผู้ใช้ ยกมาทำให้ตรงนี้เลย

     ⚠️ **ไม่ส่ง `frozenAt`** — แถวที่ได้เป็นงวดร่าง ยอดยังเดินตามแผนของ QT
     ไม่เข้าทะเบียนการชำระของบัญชี และแจ้งชำระไม่ได้จนกว่าใบจะอนุมัติ (กติกาเดิมของ 0259)
     ⚠️ **ล้มแล้วไม่ล้มทั้งคำขอ** — ใบเกิดแล้วใน RPC ที่ commit ไปแล้ว ตอบ error กลับไป
     เท่ากับผู้ใช้เห็น "สร้างไม่สำเร็จ" ทั้งที่ใบมีอยู่จริง · งวดเป็นของที่ derive จาก QT
     กู้ได้ด้วยปุ่ม "เริ่มติดตามการชำระ" ที่ยังอยู่บนการ์ด และตอนอนุมัติก็สร้างให้อยู่ดี */
  let installmentWarning = null;
  try {
    await ensureInstallments(supabase, {
      order: { ...order, quotation: { paymentPlan: quote.paymentPlan } },
      user,
    });
    await applyCreateFormPayments(supabase, {
      orderId, dates: installmentDates.rows, firstPaidOn, firstEvidence,
    });
  } catch (installmentError) {
    console.error('create SO: installments failed', orderId, installmentError);
    installmentWarning = 'ออกใบสำเร็จ แต่ตั้งงวดชำระ (กำหนดชำระ · วันวางบิล) ตามที่กรอกไม่สำเร็จ — ตรวจการ์ด "การชำระ" บนใบ';
  }

  return ok(installmentWarning ? { ...order, warning: installmentWarning } : order, 201);
});

/* งวดของใบในหน้ารายการ — `taxInvoiceNo` = ตัวนับ "ใบกำกับ x/y" (mig 0348 · เอาแค่ "มีหรือยัง" ไม่ลากไฟล์มา) ·
   `refundedAt` = งวดที่คืนเงินแล้ว (0378) · ⚠️ ก่อนรัน 0378 = 42703 ⇒ อ่านชุดเดิม (ไม่มีงวดคืนเงินในฐานอยู่แล้ว) */
async function loadListInstallments(supabase, orderIds) {
  const withRefund = await fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_order_installments')
    .select('salesOrderId, status, kind, "dueDate", "coversFrom", "coversTo", "taxInvoiceNo", "refundedAt"')
    .in('salesOrderId', chunk)
    .order('salesOrderId', { ascending: true })
    .order('id', { ascending: true })));
  if (withRefund.error?.code !== '42703') return withRefund;
  return fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_order_installments')
    .select('salesOrderId, status, kind, "dueDate", "coversFrom", "coversTo", "taxInvoiceNo"')
    .in('salesOrderId', chunk)
    .order('salesOrderId', { ascending: true })
    .order('id', { ascending: true })));
}
