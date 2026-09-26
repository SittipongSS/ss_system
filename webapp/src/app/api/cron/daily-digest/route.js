import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, SALES_BELL_ROLES } from '@/lib/permissions';
import { holidaySet } from '@/lib/master/holidays';
import { businessDaysWaiting } from '@/lib/sales/handoffQueue';
import { overdueLeadNotices } from '@/lib/sales/leadNotify';
import { overdueSignatureNotices, pendingApprovalContracts, pendingApprovalNotices } from '@/lib/sales/contractNotify';
import { externalDocReadyIds } from '@/lib/sales/contractExternalDocs';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { notifyUsers } from '@/lib/notifications';
import { businessDayKey } from '@/lib/datePeriods';
import { loadUserDirectory } from '@/lib/usersRepo';
import { businessDate } from '@/lib/businessDate';
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { addDays } from '@/lib/sales/paymentCoverage';
import { BILLING_REMIND_DAYS } from '@/lib/sales/billingRule';
import { billingDueNotices } from '@/lib/sales/billingDueNotify';
import { SAHAMIT_AR_CODE } from '@/lib/sahamit/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// GET /api/cron/daily-digest — ทวงงานค้างเข้ากล่องแจ้งเตือน **รายคน**
// วันนี้มีสี่เรื่อง: ลีดค้างเกิน SLA · สัญญาค้างรอลงนามเกินเกณฑ์ · สัญญารอ AE Sup อนุมัติ
// · งวดชำระถึงรอบวางบิล (กำหนดวางบิล · mig 0389)
// เรียกโดย Vercel Cron (08:30 ไทย จ-ศ, ดู webapp/vercel.json) ด้วย Authorization:
// Bearer CRON_SECRET หรือ admin เปิดเองจากเบราว์เซอร์เพื่อทดสอบ
//
// 🪦 **เดิมชื่อ "สรุปประจำวัน" เพราะส่งการ์ด 4 ใบเข้า Google Chat** (งานค้างอนุมัติ ·
// ลีดค้างคิว · งานโครงการใกล้ครบกำหนด · รอยต่อเอกสารค้าง) · ท่อ Chat ถูกถอดออกทั้งระบบ
// 2026-08-12 (มติผู้ใช้: ใช้กระดิ่ง + ป้ายตัวเลขพอ) ⇒ **สามใบที่ไม่มีคู่ในกล่องแจ้งเตือน
// หายไปด้วย** เหลือแต่การทวงลีดซึ่งถึงตัวคนที่ต้องลงมือโดยตรงอยู่แล้ว
// ⚠️ ชื่อ path คงเดิมเพราะผูกกับ `crons` ใน vercel.json — เปลี่ยนชื่อ = ต้องแก้สองที่
// ให้ตรงกัน แล้ว cron เงียบทันทีถ้าพลาด (บทเรียน 401 ที่เพิ่งเจอ)

/* ทวงลีดที่เลย SLA เข้ากล่องแจ้งเตือนรายคน — หนึ่งคนได้เด้งเดียวต่อวัน
   กติกา "ใครค้างอะไร" อยู่ที่ `overdueLeadNotices` (lib/sales/leadNotify.js) ที่นี่แค่
   ดึงข้อมูลกับยิง · ยิงซ้ำวันเดียวกันไม่เกิดแถวซ้ำ (dedupeKey ต่อคนต่อวัน) */
async function notifyOverdueLeads(supabase) {
  const { data, error } = await supabase
    .from('sales_leads')
    .select('id, contactName, status, team, assigneeId, createdAt, screenedAt, assignedAt, followUpAt')
    // ⭐ `contacted` เข้ามาพร้อม mig 0289 — สถานะนี้เคยไม่มีนาฬิกาเลย ลีดที่ติดต่อแล้ว
    // จึงเงียบหายไปจากการทวงทั้งหมด · นับจาก `followUpAt` (วันที่ AE รับปากลูกค้าไว้)
    .in('status', ['new', 'screened', 'assigned', 'contacted']);
  if (error) return { sent: 0, error: error.message };
  if (!data?.length) return { sent: 0, reason: 'ไม่มีลีดค้าง' };

  const [holidays, directory] = await Promise.all([
    holidaySet().catch(() => new Set()),
    loadUserDirectory(supabase).catch(() => new Map()),
  ]);
  const now = new Date().toISOString();
  // ⚠️ ก๊อปที่ 2 ของ 3 — ต้องตรงกับ SINCE_OF ใน lib/sales/leadNotify.js เป๊ะ
  // (อีกตัวอยู่ที่ lib/sales/leadDigest.js) · `contacted` คืน null ได้ ตัวกรองฝั่ง
  // overdueLeadNotices ตัดใบพวกนั้นออกเอง
  const sinceOf = {
    new: (l) => l.createdAt,
    screened: (l) => l.screenedAt || l.createdAt,
    assigned: (l) => l.assignedAt || l.createdAt,
    contacted: (l) => l.followUpAt || null,
  };
  const notices = overdueLeadNotices(data, {
    directory,
    ageOf: (lead) => businessDaysWaiting(sinceOf[lead.status]?.(lead), now, holidays),
    dayKey: businessDayKey(now),
  });
  if (!notices.length) return { sent: 0, reason: 'ไม่มีลีดเลย SLA' };

  let sent = 0;
  for (const notice of notices) {
    const result = await notifyUsers(supabase, {
      userIds: notice.userIds,
      entityType: 'lead',
      entityId: notice.entityId,
      kind: 'lead_overdue',
      title: notice.title,
      body: notice.body,
      dedupeKey: notice.dedupeKey,
      // สรุปหลายใบ → พาไปที่ *คิว* ไม่ใช่ใบใดใบหนึ่ง (การ์ด "ค้างคิว" อยู่บนหน้านั้นแล้ว)
      href: '/sa/leads',
      actorName: 'สรุปประจำวัน',
    });
    sent += result.sent || 0;
  }
  return { sent, notices: notices.length };
}

/* ทวงสัญญาที่ค้างขั้น "รอลงนาม" เกินเกณฑ์ — หนึ่งคนได้เด้งเดียวต่อวันเหมือนกัน
   กติกา "ใบไหนสาย ใครต้องรู้" อยู่ที่ `overdueSignatureNotices` (lib/sales/contractNotify.js)

   ⚠️ **ต้องอยู่ที่ cron ไม่ใช่ตอนเปิดทะเบียน** — ทะเบียนสัญญากรองตามขอบเขตของคนเปิด
      ⇒ กวาดตอนนั้นจะทวงได้เฉพาะคนที่เปิดหน้าอยู่ ซึ่งคือคนที่ไม่ต้องทวง · ที่นี่ใช้
      สิทธิ์ admin จึงเห็นทุกใบทุกทีม */
async function notifyOverdueContracts(supabase) {
  const { data, error } = await supabase
    .from('sales_contracts')
    .select('id, "contractNo", status, "issuedAt", "ownerId", "createdBy", "customerName"')
    .eq('status', 'awaiting_signature');
  if (error) return { sent: 0, error: error.message };
  if (!data?.length) return { sent: 0, reason: 'ไม่มีใบรอลงนาม' };

  const now = new Date();
  const notices = overdueSignatureNotices(data, { now, dayKey: businessDayKey(now.toISOString()) });
  if (!notices.length) return { sent: 0, reason: 'ไม่มีใบค้างเกินเกณฑ์' };

  let sent = 0;
  for (const notice of notices) {
    const result = await notifyUsers(supabase, {
      userIds: notice.userIds,
      entityType: 'sales_contract',
      entityId: notice.entityId,
      kind: notice.kind,
      title: notice.title,
      body: notice.body,
      dedupeKey: notice.dedupeKey,
      // สรุปหลายใบ → พาไปที่ *คิวของฉัน* ไม่ใช่ใบใดใบหนึ่ง (ตัวกรอง ?waiting=1 มีอยู่แล้ว)
      href: '/sa/contracts?waiting=1',
      actorName: 'สรุปประจำวัน',
    });
    sent += result.sent || 0;
  }
  return { sent, notices: notices.length };
}

/* ทวง AE Supervisor เรื่องสัญญาที่รอเขากด — เอกสารแทนสัญญาที่แนบแล้ว + ใบรอรับรองการลงนาม
   กติกาอยู่ที่ `pendingApprovalNotices` (lib/sales/contractNotify.js)
   ⭐ ผู้รับคือ AE Supervisor ที่ยังใช้งานอยู่ (`SALES_BELL_ROLES`) · ไม่มีสักคน ค่อยถอยไป admin —
     คนที่กดได้ต้องมีสักคนรู้ ไม่งั้นใบค้างแบบเดิม (ของจริง: ค้าง 12 วัน)
   ⚠️ CD/CM อนุมัติขั้นนี้ได้ (`canApproveExternalContract`) แต่ **ไม่รับกระดิ่ง** — มติ 2026-09-24 ข้อ 6
      เหมือนคิวคัดกรองลีด/FM-SA-04 (เข้าไปดูคิวเอง)
   ⚠️ ไม่ส่งหา admin ตอนมี AE Sup อยู่ — admin กดได้ทุกด่านก็จริง แต่ไม่ใช่เจ้าของขั้นนี้ */
async function notifyPendingContractApprovals(supabase) {
  /* 🔴 `metadata` ต้องมาด้วย (รีวิว 25/09) — เอกสารแทนสัญญาของใบสั่งขายย้อนหลัง (0374) เป็นร่าง external
     ที่มีไฟล์แนบแล้ว แต่เป็นงานของคิวใบสั่งขาย · ขาดคอลัมน์นี้ = `isSubstituteContract` ตอบ false ⇒ AE Sup
     ได้กระดิ่งของใบที่ `?waiting=1` ไม่แสดง (ตัวนับป้ายเลือกคอลัมน์ชุดเดียวกันด้วยเหตุผลเดียวกัน)
     ⚠️ คอมเมนต์อยู่เหนือ `.from()` — check:columns มองหา `.select()` ในระยะ 200 ตัวอักษรหลัง `.from()` */
  const { data, error } = await fetchAllResult(() => supabase
    .from('sales_contracts')
    .select('id, "contractNo", status, source, metadata, "ownerId", "createdBy", "customerName", "createdAt"')
    .in('status', ['draft', 'awaiting_approval'])
    .order('id', { ascending: true }));
  if (error) return { sent: 0, error: error.message };
  const rows = data || [];
  if (!rows.length) return { sent: 0, reason: 'ไม่มีใบรออนุมัติ' };

  /* cron ไม่มีผู้ใช้ ⇒ ต้องเปิด anyViewer ไม่งั้นตัวหาคืนชุดว่างเสมอ (ด่านผู้อนุมัติ)
     🔴 `strict` (รีวิว 25/09) — อ่านไฟล์แนบพังแล้วได้ชุดว่าง = ร่างที่แนบแล้วทุกใบหายจากกระดิ่ง และ cron รายงาน
        "ไม่มีใบรออนุมัติ" ทั้งที่มี (ความเงียบแบบเดียวกับที่ฟีเจอร์นี้เกิดมาแก้) ⇒ โยนให้ GET บันทึกเป็น error แทน */
  const [docReadyIds, directory] = await Promise.all([
    externalDocReadyIds(supabase, rows, null, { anyViewer: true, strict: true }),
    loadUserDirectory(supabase).catch(() => new Map()),
  ]);
  const pending = pendingApprovalContracts(rows, { docReadyIds });
  if (!pending.length) return { sent: 0, reason: 'ไม่มีใบรออนุมัติ' };

  const active = [...directory.values()].filter((u) => u && !u.disabled);
  let approverIds = active.filter((u) => SALES_BELL_ROLES.includes(u.role)).map((u) => u.id);
  if (!approverIds.length) approverIds = active.filter((u) => u.role === 'admin').map((u) => u.id);
  /* ⚠️ มีใบรอแต่ไม่มีผู้รับ ≠ ไม่มีใบรอ — ทะเบียนผู้ใช้อ่านพัง (`loadUserDirectory` หยุดเงียบ ๆ) หรือไม่มีบัญชี
     AE Sup/admin ที่เปิดอยู่เลย ⇒ รายงานเป็น error ให้คนที่เปิด cron เองเห็น */
  if (!approverIds.length) {
    return { sent: 0, pending: pending.length, error: `มีใบรออนุมัติ ${pending.length} ใบ แต่ไม่พบผู้รับกระดิ่ง (AE Supervisor/admin)` };
  }

  const now = new Date();
  const notices = pendingApprovalNotices(rows, {
    docReadyIds, approverIds, dayKey: businessDayKey(now.toISOString()),
  });

  let sent = 0;
  for (const notice of notices) {
    const result = await notifyUsers(supabase, {
      userIds: notice.userIds,
      entityType: 'sales_contract',
      entityId: notice.entityId,
      kind: notice.kind,
      title: notice.title,
      body: notice.body,
      dedupeKey: notice.dedupeKey,
      // ตัวกรอง ?waiting=1 ของทะเบียนใช้เลนผู้รับรองตัวเดียวกับป้ายบนเมนู
      href: '/sa/contracts?waiting=1',
      actorName: 'สรุปประจำวัน',
    });
    sent += result.sent || 0;
  }
  return { sent, notices: notices.length };
}

/* ⭐ เตือน "ถึงรอบวางบิล" ก่อนวันวางบิลของงวด 0..BILLING_REMIND_DAYS วัน (กำหนดวางบิล · มติเจ้าของ 25–26/09)
   ฝ่ายขาย = หนึ่งแถวต่องวด (เจ้าของดีล + เจ้าของใบ) · FN = แถวสรุปวันละแถว ทุกคนในฝ่าย (มติรอบสาม ข้อ 5)
   กติกา "งวดไหนต้องเตือน ใครได้ ข้อความว่าอะไร" อยู่ที่ `billingDueNotices` (lib/sales/billingDueNotify.js)
   ที่นี่แค่ดึงข้อมูลกับยิง
   ⚠️ หน้าต่าง 0..N วัน ไม่ใช่ "วันนี้ = วันวางบิล − N" — cron วิ่งแค่ จ–ศ ⇒ จับวันตรงเป๊ะจะหลุดทุกงวดที่วันเตือน
      ตรงเสาร์อาทิตย์ · กันยิงซ้ำด้วย dedupeKey ต่องวดต่อวันวางบิล (FN ต่อคนต่อวัน)
   ⚠️ ต้องอยู่ที่ cron (สิทธิ์ admin เห็นทุกใบทุกทีม) ไม่ใช่กวาดตอนเปิดแผงงวด — กวาดตอนเปิดหน้า = เตือนได้แค่คนที่เปิดอยู่
   🔴 ก่อนรัน mig 0389 คอลัมน์ `billingDate` ยังไม่มี ⇒ query ตอบ 42703 · ต้องรายงานเป็น error
      ไม่ใช่ "ไม่มีงวดถึงรอบ" (supabase ไม่ throw — ทิ้ง `.error` = เงียบแบบที่ดูเหมือนปกติ)
   ⚠️ admin เปิด route นี้เองจากเบราว์เซอร์ = ยิงจริงถึงคนจริง (ฐาน dev = ฐาน prod) — dedupe กันแค่รอบซ้ำ ไม่กันรอบแรก */
async function notifyBillingDue(supabase) {
  const todayIso = businessDate();
  const until = addDays(todayIso, BILLING_REMIND_DAYS);
  /* กรองหน้าต่างวันที่ที่ query เลย (งวดทั้งระบบโต ~150–180 แถว/เดือน) — ตัวตัดสินจริงยังเป็น
     `needsBillingReminder` ในไฟล์กติกา ที่นี่แค่ไม่ลากงวดที่ไม่มีทางถึงรอบมาทั้งตาราง
     · `pending` เท่านั้น: แจ้งชำระแล้ว (reported) = ลูกค้าจ่ายแล้ว รอบัญชีตรวจ ไม่มีอะไรให้วางบิล
     · `frozenAt` ต้องมี: งวดร่างยอดยังเดินตามแผน QT (ทะเบียนการชำระก็ไม่แสดง) */
  const { data: installments, error } = await fetchAllResult(() => supabase
    .from('sales_order_installments')
    .select('id, "salesOrderId", seq, label, amount, status, kind, "frozenAt", "refundedAt", "billingDate", "billingRequestId"')
    .eq('status', 'pending')
    .not('frozenAt', 'is', null)
    .gte('billingDate', todayIso)
    .lte('billingDate', until)
    .order('id', { ascending: true }));
  if (error) {
    const missing = error.code === '42703' ? 'ยังไม่ได้รัน mig 0389 (ไม่มีคอลัมน์วันวางบิล) — ' : '';
    return { sent: 0, error: `${missing}${error.message}` };
  }
  const rows = installments || [];
  if (!rows.length) return { sent: 0, reason: 'ไม่มีงวดถึงรอบวางบิล' };

  const orderIds = [...new Set(rows.map((r) => r.salesOrderId).filter(Boolean))];
  /* `ownerId` = เจ้าของใบ ณ ตอนอนุมัติ (mig 0294) · เจ้าของดีลวันนี้ต้องไปอ่านที่ดีล
     `origin` + `quotationId` = วัตถุดิบของด่านงวด (`historicalInstallmentLock` · `pipelineInstallmentLock`) ที่ตัวคัด
     ถามแทนลิสต์สถานะ — ร่าง Rev. ยังเตือน (มติ D3) · ร่างที่ QT ถูกถอด Won ไม่เตือน ⇒ ต้องรู้สถานะของ QT */
  const { data: orders, error: orderError } = await fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase
    .from('sales_orders')
    .select('id, "orderNumber", status, origin, "totalAmount", "customerId", "customerName", "ownerId", "dealId", "quotationId"')
    .in('id', chunk)
    .order('id', { ascending: true })));
  if (orderError) return { sent: 0, error: orderError.message };

  const dealIds = [...new Set((orders || []).map((o) => o.dealId).filter(Boolean))];
  const customerIds = [...new Set((orders || []).map((o) => o.customerId).filter(Boolean))];
  const quoteIds = [...new Set((orders || []).map((o) => o.quotationId).filter(Boolean))];
  const requestIds = [...new Set(rows.map((r) => r.billingRequestId).filter(Boolean))];
  /* ⚠️ `loadUserDirectory(...).catch` ต้องมาก่อน query ของ supabase ในลิสต์นี้ — ยาม supabaseNeverThrows
     ไล่จาก `supabase.from(` ไปหา `.catch(` ตัวถัดไป · วางไว้ท้ายแล้วยามอ่านว่า builder ถูกต่อ `.catch` */
  const [directory, dealResult, customerResult, quoteResult, requestResult] = await Promise.all([
    loadUserDirectory(supabase).catch(() => new Map()),
    fetchInChunks(dealIds, (chunk) => fetchAllResult(() => supabase
      .from('sales_deals').select('id, "ownerId"').in('id', chunk).order('id', { ascending: true }))),
    /* `arCode` = บรรทัดรองของกระดิ่ง + ตัวตัดลูกค้าสหมิตร (เงินเก็บนอกระบบ · มติ 24/09)
       `name`/`nameEn` = ชื่อสำรองเมื่อสำเนาชื่อบนใบว่าง (ลูกค้าที่มีแต่ชื่ออังกฤษ) */
    fetchInChunks(customerIds, (chunk) => fetchAllResult(() => supabase
      .from('customers').select('id, "arCode", name, "nameEn"').in('id', chunk).order('id', { ascending: true }))),
    // สถานะของ QT = ตัวตัดสิน "ร่างที่ใช้ต่อไม่ได้" ของ `pipelineInstallmentLock` (ไม่มีค่า = ด่านไม่ตัดสิน)
    fetchInChunks(quoteIds, (chunk) => fetchAllResult(() => supabase
      .from('quotations').select('id, status, "quoteNumber"').in('id', chunk).order('id', { ascending: true }))),
    /* "ขอใบวางบิลแล้ว" = ลิงก์ที่ชี้คำร้องที่ส่งแล้วและยังไม่ถูกยกเลิก — ยกเลิกคำร้องไม่ล้างลิงก์บนงวด และปุ่มขอใบ
       ผูกงวดตั้งแต่บันทึกร่าง ⇒ ต้องอ่านสถานะคำร้องจริง ไม่ใช่ดูแค่ว่า `billingRequestId` มีค่า */
    fetchInChunks(requestIds, (chunk) => fetchAllResult(() => supabase
      .from('dept_requests').select('id, status').in('id', chunk).order('id', { ascending: true }))),
  ]);
  const failed = dealResult.error || customerResult.error || quoteResult.error || requestResult.error;
  if (failed) return { sent: 0, error: failed.message };

  const dealById = new Map((dealResult.data || []).map((d) => [d.id, d]));
  const quoteById = new Map((quoteResult.data || []).map((q) => [q.id, q]));
  const ordersById = new Map((orders || []).map((o) => [o.id, {
    ...o, deal: dealById.get(o.dealId) || null, quotation: quoteById.get(o.quotationId) || null,
  }]));
  const customersById = new Map((customerResult.data || []).map((c) => [c.id, c]));
  const requestsById = new Map((requestResult.data || []).map((r) => [String(r.id), r]));

  const { candidates, sales, fn } = billingDueNotices(rows, {
    todayIso, ordersById, customersById, requestsById, directory, skipArCodes: [SAHAMIT_AR_CODE],
  });
  if (!candidates.length) return { sent: 0, reason: 'ไม่มีงวดถึงรอบวางบิล (ขอใบวางบิลแล้ว/ใบไม่ต้องเก็บเงิน/ลูกค้านอกระบบ)' };

  let sent = 0;
  /* ⚠️ `notifyUsers` กลืน error เอง (ไม่ throw) แล้วคืน `{ sent: 0, error }` — upsert พัง (ฐานล่ม · หัวข้อตก CHECK ของ 0185)
     ต้องขึ้นเป็น error ของรอบนี้ ไม่ใช่ `sent: 0` เฉย ๆ ที่อ่านเหมือน "ไม่มีใครต้องรู้" · เก็บตัวแรกพอ (ตัวถัดไปมักเหตุเดียวกัน) */
  let notifyError = null;
  for (const notice of [...sales, fn].filter(Boolean)) {
    const result = await notifyUsers(supabase, { ...notice, actorName: 'สรุปประจำวัน' });
    sent += result.sent || 0;
    if (result.error && !notifyError) notifyError = `${notice.kind}: ${result.error}`;
  }
  const out = { sent, candidates: candidates.length, sales: sales.length, finance: fn ? fn.userIds.length : 0 };
  const errors = [];
  if (notifyError) errors.push(`ยิงกระดิ่งไม่สำเร็จ — ${notifyError}`);
  /* ⚠️ มีงวดถึงรอบแต่ไม่มีผู้รับฝั่ง FN ≠ ไม่มีงวด — ทะเบียนผู้ใช้อ่านพัง (`loadUserDirectory` หยุดเงียบ ๆ)
     หรือไม่มีบัญชีฝ่าย FN ที่เปิดอยู่ ⇒ รายงานเป็น error ให้คนที่เปิด cron เองเห็น (ฝั่งขายยังยิงไปแล้ว) */
  if (!fn) errors.push(`มีงวดถึงรอบวางบิล ${candidates.length} งวด แต่ไม่พบผู้ใช้ฝ่าย FN ที่เปิดอยู่ — กระดิ่งฝั่งบัญชีไม่ถูกส่ง`);
  if (errors.length) out.error = errors.join(' · ');
  return out;
}

export async function GET(request) {
  // ผ่านได้ 2 ทาง: Vercel Cron (Bearer CRON_SECRET) หรือ admin กดทดสอบเองจากเบราว์เซอร์
  //
  // ⚠️ ด่านนี้จะทำงานได้ก็ต่อเมื่อ proxy ปล่อย `/api/cron/` ผ่าน (bypassesSessionGate)
  // — cron ไม่มี cookie session · เคยโดน proxy ตอบ 401 แทนเงียบ ๆ อยู่ 4 สัปดาห์
  const auth = request.headers.get('authorization');
  const cronOk = !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!cronOk) {
    const user = await getCurrentUser();
    if (!can(user?.role, 'master:manage')) {
      return Response.json({ error: 'unauthorized' }, { status: 401 });
    }
  }

  const supabase = getSupabaseAdmin();
  const results = {};
  try {
    results.leadOverdue = await notifyOverdueLeads(supabase);
  } catch (e) {
    results.leadOverdue = { sent: 0, error: e?.message || String(e) };
  }
  /* ⚠️ แยก try ของตัวเอง — เรื่องหนึ่งพังต้องไม่กลืนอีกเรื่องหนึ่ง (cron รอบเดียวกัน
     ทำสองงานที่ไม่เกี่ยวกัน · ล้มรวมกันแล้วจะไล่ไม่ออกว่าเรื่องไหนเงียบเพราะอะไร) */
  try {
    results.contractOverdue = await notifyOverdueContracts(supabase);
  } catch (e) {
    results.contractOverdue = { sent: 0, error: e?.message || String(e) };
  }
  try {
    results.contractApproval = await notifyPendingContractApprovals(supabase);
  } catch (e) {
    results.contractApproval = { sent: 0, error: e?.message || String(e) };
  }
  try {
    results.billingDue = await notifyBillingDue(supabase);
  } catch (e) {
    results.billingDue = { sent: 0, error: e?.message || String(e) };
  }

  return Response.json({ ok: true, at: new Date().toISOString(), results });
}
