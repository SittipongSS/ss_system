// ── API ตัวเลขบนเมนูหลัก ─────────────────────────────────────────────────
// GET /api/nav/counts → { requests?, tasks?, rdRequests?, financeRequests?,
//                         serviceRequests?, leads?, quotations?, salesOrders?,
//                         contracts?, projectCloses?, scents?, formulas?, customers?,
//                         products?, visits?, serviceIntake?, mgmtTasks?,
//                         taxRegistrations?, taxFilings?, issues?, productionJobs?,
//                         payments? }
//
// คีย์ที่ผู้ใช้ไม่มีสิทธิ์เห็น **ไม่ถูกส่งมาเลย** (ไม่ใช่ส่ง 0) — เมนูที่ถูกกรองทิ้ง
// อยู่แล้วไม่ต้องมีตัวเลข และเลข 0 ที่หลุดมาจะกลายเป็นป้ายเปล่าบนเมนูของคนอื่น
//
// ⚠️ อยู่บน **ทุกหน้า** เหมือนกระดิ่ง ⇒ กติกาเดียวกัน: พังที่นี่ต้องไม่ทำ header พัง
// ตัวนับตัวไหนพัง ส่งเท่าที่ได้ ไม่ล้มทั้งคำขอ
//
// ⚠️ ตัวเลขต้องตรงกับหน้าปลายทางเสมอ — ใช้ loadVisibleRequests + helper ชุดเดียว
// กับที่หน้าคิวใช้ ห้ามเขียนเงื่อนไข "รอฉันตอบ" ใหม่ที่นี่ (ดู lib/nav/navCounts.js)
//
// 🔴 **ด่านของตัวนับต้องเป็นด่านเดียวกับที่เมนูใช้** (บทเรียนรอบตรวจ 2026-09-02) —
// ตัวนับที่แคบกว่าเมนูไม่ได้ "ปลอดภัยกว่า" มันคือเมนูที่ไม่มีวันมีป้ายสำหรับคนกลุ่มหนึ่ง
// ของจริง: ป้าย "งานวันนี้" เคยกั้นด้วย `canEditService` ส่วนเมนูกั้นด้วย `canDoFieldWork`
// ⇒ เจ้าหน้าที่หน้างาน (ถือ `service:work` ไม่ถือ `service:edit`) เห็นเมนูเปล่าตลอดกาล
// ทั้งที่เลขนั้นนับ **นัดที่มอบหมายให้ตัวเขาเอง**
import { withUser, ok, unauthorized } from '@/lib/http';
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import {
  can, canApproveMasterData, canConfirmPayment, canDoFieldWork, canEditService, canUser,
  canViewRequests,
} from '@/lib/permissions';
import { canViewLeads, applyLeadScope } from '@/lib/sales/leads';
import { loadRequests } from '@/lib/materialPricesAdmin';
import { loadVisibleRequests, answerableDepts } from '@/lib/requests/visibleRows';
import { deptHasOwnModule, deptsInSharedQueue } from '@/lib/requests/modules';
import {
  QUOTATION_ACTIONABLE_STATUSES, isQuotationWaitingOnMe,
} from '@/lib/sales/quotationWorkflow';
import { isSalesOrderReviewer, isSalesOrderWaitingOnMe } from '@/lib/sales/salesOrderWorkflow';
import { awaitsFinanceReview } from '@/lib/sales/salesOrderFinanceApproval';
import { isContractWaitingOnMe, latestContractRevisions } from '@/lib/sales/contracts';
import { externalDocReadyIds } from '@/lib/sales/contractExternalDocs';
import { canApproveProjectClose, isProjectCloseWaitingOnMe } from '@/lib/pm/projectClose';
import { isScentRegistrar } from '@/lib/master/scents';
import { isFormulaRegistrar } from '@/lib/master/formulas';
import { inSalesViewScope, isClosedStage, isWonStage } from '@/lib/salesPlanning';
import {
  FORECAST_ELIGIBLE_APPROVALS, FORECAST_ELIGIBLE_STATUSES, forecastSourceView,
} from '@/lib/sales/forecastSource';
import { loadVisits } from '@/lib/service/visitsRepo';
import { loadTerms } from '@/lib/service/termsRepo';
import { bindQueue } from '@/lib/service/intake';
import { waitingOnMeVisitCount } from '@/lib/service/myVisits';
import { listTasks } from '@/lib/mgmt/repo';
import { isMyOpenTask } from '@/lib/mgmt/constants';
import { businessDate } from '@/lib/businessDate';
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { deptOf, ownedStages } from '@/lib/excise/workflow';
import { isSystemAdmin } from '@/lib/issues/access';
import { canEditProduction } from '@/lib/permissions';
import {
  DEPT_QUEUE_COUNT_KEYS, LEAD_TODO_STATUS, deptRequestsTodoCount, myTasksTodoCount,
  pruneZeroCounts, requestsTodoCount,
} from '@/lib/nav/navCounts';

export const dynamic = 'force-dynamic';

// งานส่วนตัวที่ฉันเกี่ยวข้อง — สามสาย ตรงกับที่ /api/pm/my-work ใช้กับ scope 'mine'
// (ownerId · assigneeId · proxyBy) · ตัด assignedBy ออกเพราะงานที่ "ฉันมอบให้คนอื่น"
// ไม่ใช่งานที่รอฉันทำ — มันอยู่แท็บ "มอบหมายโดยฉัน" ซึ่งไม่ได้ขึ้นเมนู
async function myOpenTasks(supabase, userId) {
  const columns = 'id,status,ownerId,assigneeId,proxyBy';
  /* ⚠️ ไล่ทีละหน้า — `personal_tasks` เกิน 1,000 แถวไปแล้วทั้งตาราง แม้สามก้อนนี้จะกรอง
     รายคน แต่คนที่ทำงานมานานพอจะแตะเพดานได้เอง แล้วป้ายบนเมนูจะนับไม่ครบเงียบ ๆ */
  const page = (column) => fetchAllResult(() => supabase
    .from('personal_tasks').select(columns).eq(column, userId).order('id', { ascending: true }));
  const [{ data: byOwner }, { data: byAssignee }, { data: byProxy }] = await Promise.all([
    page('ownerId'), page('assigneeId'), page('proxyBy'),
  ]);
  const seen = new Set();
  return [...(byOwner || []), ...(byAssignee || []), ...(byProxy || [])]
    .filter((task) => (seen.has(task.id) ? false : seen.add(task.id)));
}

export const GET = withUser(async ({ user, supabase }) => {
  if (!user?.id) return unauthorized();

  const jobs = [];
  const counts = {};
  const attempt = async (key, run) => {
    try { counts[key] = await run(); } catch (e) {
      // ตัวนับพังต้องไม่ทำให้เมนูทั้งแถบพัง — เงียบไว้ แล้วเมนูนั้นไม่มีป้าย
      console.error(`[nav/counts] ${key} failed`, e.message);
    }
  };

  if (canViewRequests(user)) {
    jobs.push(attempt('requests', async () => {
      // ขอบเขต 'mine' ชัดเจน — เมนูนับ "งานของคุณ" ไม่ใช่คิวทั้งระบบ
      // (ผู้ดูแลระบบที่ไม่ได้ระบุขอบเขตจะได้ทุกใบ ซึ่งไม่ใช่ความหมายของป้ายนี้)
      // `lean` = ข้ามการเติมชื่อโครงการ/รหัส AR ที่มีไว้ให้จออ่าน — ตัวกรองแถวไม่แตะ
      // สองช่องนั้น ตัวเลขจึงเท่าเดิม แต่ตัดไป 2 query ต่อการโหลดหนึ่งครั้ง
      const { rows } = await loadVisibleRequests(supabase, user, { scopeParam: 'mine', lean: true });
      return requestsTodoCount(rows, deptsInSharedQueue(answerableDepts(user)));
    }));
  }

  if (can(user.role, 'pm:view')) {
    jobs.push(attempt('tasks', async () => myTasksTodoCount(await myOpenTasks(supabase, user.id), user.id)));
  }

  /* ── คิวคำร้องของฝ่ายที่มีบ้านของตัวเอง — หนึ่งฝ่ายหนึ่งป้าย ────────────────
     ⭐ ไล่จาก **ฝ่ายที่ผู้ใช้ตอบได้จริง** ไม่ใช่ฝ่ายที่เขาสังกัด · ทางเก่ามีคีย์เดียว
     (`rdRequests`) แล้วถอยไปฝ่ายแรกในลิสต์เมื่อฝ่ายของผู้ใช้ไม่มีโมดูล ซึ่งเป็นการ
     **เดาแทน admin ว่าเป็น RD** — พอ FN/TS มีคิวของตัวเองด้วย การเดาก็ตอบผิดทันที
     และสองฝ่ายนั้นไม่มีป้ายเลยสักตัว (FN หนักกว่า: `deptsInSharedQueue` ตัดเขาออก
     จากป้ายคิวรวมไปแล้ว ⇒ ไม่เหลือเลขที่ไหนเลย)

     ⚠️ **ด่านตรงกับเมนูเป๊ะ** — เมนูทั้งสามตัวคือ `cap requests:answer` + ด่านฝ่าย
     (`canAccessRd` · `canAccessFinance` · `canAnswerServiceRequests`) ซึ่งรวมกันแล้ว
     เท่ากับสองเงื่อนไขนี้ · ที่ต้องถาม cap ซ้ำเพราะ `canAnswerRequestsFor` ปล่อย
     superuser ผ่านหมด ⇒ ae_supervisor (ไม่ถือ cap นี้ตามมติ) จะได้ป้ายของเมนูที่
     ตัวเองมองไม่เห็น */
  const moduleDepts = canUser(user, 'requests:answer')
    ? answerableDepts(user).filter(deptHasOwnModule)
    : [];
  for (const dept of moduleDepts) {
    const key = DEPT_QUEUE_COUNT_KEYS[dept];
    if (!key) continue;
    jobs.push(attempt(key, async () => deptRequestsTodoCount(
      await loadRequests(supabase, { dept, lean: true }), dept,
    )));
  }

  if (canViewLeads(user)) {
    jobs.push(attempt('leads', async () => {
      const { count } = await applyLeadScope(
        supabase.from('sales_leads').select('id', { count: 'exact', head: true }),
        user,
      ).eq('status', LEAD_TODO_STATUS);
      return count || 0;
    }));
  }

  /* ── เฟส 1: ขาย + ฐานข้อมูล ─────────────────────────────────────────────
     กติกาเดิมทุกข้อ: นับเฉพาะ "รอฉันลงมือ" · เงื่อนไขอยู่ใน helper ของโดเมนนั้น
     (`isQuotationWaitingOnMe` · `isSalesOrderWaitingOnMe` · `isProjectCloseWaitingOnMe`)
     ไม่เขียนใหม่ที่นี่ · route ทำหน้าที่แค่ **แคบชุดข้อมูลก่อนส่งให้ helper กรอง**

     ⚠️ ตัวที่ต้องรู้ "ใครเป็นเจ้าของดีล/ใครขอปิด" ดึงแถวผอม ๆ มากรองใน JS —
     ใช้ `head: true` ไม่ได้เพราะเงื่อนไขไม่ได้อยู่บนคอลัมน์ของตารางนั้นตัวเดียว
     ส่วนตัวที่เป็นสถานะล้วน (ทะเบียน/ลูกค้า) นับด้วย `head: true` ไม่ดึงแถวเลย */

  if (can(user.role, 'salesplan:view')) {
    jobs.push(attempt('quotations', async () => {
      const { data } = await supabase
        .from('quotations')
        .select('id, status, approvalStatus, createdBy, rejectionReason, deal:sales_deals(ownerId, stage)')
        .in('status', QUOTATION_ACTIONABLE_STATUSES)
        .limit(5000);
      return (data || []).filter((row) => isQuotationWaitingOnMe(row, {
        userId: user.id,
        dealOwnerId: row.deal?.ownerId ?? null,
        dealClosed: isClosedStage(row.deal?.stage),
      })).length;
    }));

    /* ── ที่มาของ FC: ดีลที่มีใบอนุมัติแล้วแต่ FC ยังไม่เดินตามใบ (mig 0337) ────
       ⚠️ ต้องนับด้วย `forecastSourceView` + `inSalesViewScope` **ชุดเดียวกับหน้า**
          /sa/forecast-review ไม่งั้นป้ายกับหน้าปลายทางบอกคนละจำนวน (กฎหัวไฟล์ navCounts)

       🐞 **สองรอบ ไม่ใช่รอบเดียว** (พบจากรีวิว 2026-09-02): รอบแรกใช้ใบที่ "มีสิทธิ์"
          หา *ว่าดีลไหนน่าสนใจ* · รอบสองดึงใบของดีลชุดนั้น **ทั้งหมดไม่กรองสถานะ**
          เพราะ resolver ต้องเห็นแถวที่ตัวชี้เดิมชี้อยู่ด้วย (ซึ่งมักเป็น 'revised')
          ถึงจะรู้ว่า "รอฉบับแก้อนุมัติอยู่" — เหตุผลเดียวกับ `forecastSourceRepo`
          ⇒ ถ้ากรองรอบเดียวแบบเดิม ป้ายกับหน้าจะไม่ตรงกันสองทาง: ดีลที่รอฉบับแก้
          จะถูกนับทั้งที่หน้าไม่แสดง และดีลที่ตัวชี้หลุดสิทธิ์จะไม่ถูกนับทั้งที่หน้าแสดง

       ⚠️ ดีลที่ `forecastSource='quotation'` ต้องเข้ากองด้วย แม้ตอนนี้จะไม่มีใบที่
          มีสิทธิ์เหลือแล้ว — นั่นคือเคส 'pointer_gone' ที่หน้าแสดงแต่เดิมป้ายมองไม่เห็น
       ⚠️ ป้ายนี้ยิงทุก 2 นาททุกคน จึงแคบด้วย dealIds เสมอ ไม่ดึงทั้งตาราง */
    jobs.push(attempt('forecastReview', async () => {
      const [{ data: seedQuotes }, { data: followingDeals }] = await Promise.all([
        supabase.from('quotations').select('"dealId"')
          .in('status', FORECAST_ELIGIBLE_STATUSES)
          .in('approvalStatus', FORECAST_ELIGIBLE_APPROVALS)
          .limit(5000),
        supabase.from('sales_deals').select('id')
          .eq('forecastSource', 'quotation')
          .limit(5000),
      ]);
      const dealIds = [...new Set([
        ...(seedQuotes || []).map((row) => row.dealId),
        ...(followingDeals || []).map((row) => row.id),
      ].filter(Boolean))];
      /* ⚠️ ไม่มีดีลที่ต้องดูที่มา ก็ยังต้องนับกองวันที่ขาดต่อ — early return ตรงนี้เมื่อไร
         ป้ายจะหายทั้งที่หน้ายังมีของ (เคสนี้เกิดจริงตอนรวมสองสายเข้าด้วยกัน) */
      const [{ data: deals }, { data: quotations }] = dealIds.length
        ? await Promise.all([
        supabase.from('sales_deals')
          .select('id, stage, "ownerId", "ownerName", team, "projectValue", "forecastManualValue", "forecastSource", "forecastQuotationId", "forecastPinnedAt"')
          .in('id', dealIds).limit(5000),
        supabase.from('quotations')
          .select('id, "dealId", "quoteNumber", "baseNumber", "revisionNo", status, "approvalStatus", "totalAmount", "vatAmount", "createdAt"')
          .in('dealId', dealIds).limit(5000),
        ])
        : [{ data: [] }, { data: [] }];

      /* กองที่สองของหน้าเดียวกัน: ดีลที่ยังไม่มีวันเริ่ม/วันรับของ — ป้ายต้องนับด้วย
         ไม่งั้นกดเข้าไปเจอเลขไม่ตรงกับที่เมนูบอก (กฎหัวไฟล์ navCounts)
         ⭐ "วันที่สิ้นสุด" = วันที่ลูกค้ารับของ ซึ่งรายงาน FC วางแผนผลิตใช้เป็นแกนเดือน
         ⚠️ คนละ query กับกองใบเสนอราคาข้างบน เพราะกองนี้ไม่เกี่ยวกับใบเลย และดีลที่
            ไม่มีใบก็ต้องถูกนับ ⇒ รวม dealIds ไม่ได้ */
      const { data: undated } = await supabase
        .from('sales_deals')
        .select('id, stage, "ownerId", "ownerName", team, "startDate", "endDate", "projectValue"')
        .or('startDate.is.null,endDate.is.null')
        .limit(5000);
      const needsDates = (undated || []).filter((deal) => {
        if (isWonStage(deal.stage) || deal.stage === 'lost') return false;
        if (!Number(deal.projectValue)) return false;
        return inSalesViewScope(user, deal);
      }).length;
      const byDeal = new Map();
      for (const quotation of quotations || []) {
        if (!byDeal.has(quotation.dealId)) byDeal.set(quotation.dealId, []);
        byDeal.get(quotation.dealId).push(quotation);
      }
      const needsSource = (deals || []).filter((deal) => {
        if (isWonStage(deal.stage) || deal.stage === 'lost') return false;
        if (!inSalesViewScope(user, deal)) return false;
        const dealQuotations = byDeal.get(deal.id) || [];
        if (!dealQuotations.length) return false;
        return forecastSourceView(deal, dealQuotations).needsDecision;
      }).length;
      return needsSource + needsDates;
    }));

    /* ── สัญญา: สองเลนของใบเดียวกัน (เจ้าของใบ / AE Sup ผู้รับรอง) ────────────
       ⚠️ ทะเบียนโชว์ **เฉพาะฉบับล่าสุดของแต่ละสาย** (mig 0280) ⇒ ต้องคัดด้วย
       `latestContractRevisions` ตัวเดียวกับที่ route ของทะเบียนใช้ ไม่งั้นป้ายนับ
       ฉบับเก่าที่หน้าปลายทางไม่แสดง
       ⚠️ **ไม่เรียก `syncContractsAgainstQuotations` ที่นี่** — ตัวนั้น *เขียน* ฐาน
       (ไล่ปิดร่างที่ใบเสนอราคาถูกปิดไปแล้ว) ซึ่งห้ามทำจากตัวนับที่ยิงทุก 2 นาที
       ทุกคน · ผลคือร่างกลุ่มนั้นถูกนับเกินจนกว่าจะมีคนเปิดทะเบียน — ซึ่งคือที่ที่
       ป้ายพาไปพอดี แล้วมันก็หายไปเอง */
    jobs.push(attempt('contracts', async () => {
      const { data } = await supabase
        .from('sales_contracts')
        /* ⚠️ ไม่ต้องกรอง scope ตามดีลเหมือน route ของทะเบียน — สองเลนนี้แคบตัวเอง
           อยู่แล้ว: เลนเจ้าของเทียบ `ownerId`/`createdBy` เป็นรายใบ ส่วนเลนผู้รับรอง
           เปิดให้ AE Supervisor/admin ซึ่ง scope เป็น 'all' อยู่แล้วทั้งคู่ */
        /* `source` ต้องมาด้วย — ใบ external ร่างที่แนบเอกสารแล้วเป็นงานของ AE Sup
           ไม่ใช่ของเจ้าของใบ · ขาดคอลัมน์นี้เมื่อไร ทุกใบตกเป็น generated แล้วเลนนั้นเงียบ */
        .select('id, status, source, "ownerId", "createdBy", "contractNo", "baseNumber", "revisionNo", "createdAt"')
        .in('status', ['draft', 'awaiting_signature', 'awaiting_approval'])
        .limit(5000);
      const latest = latestContractRevisions(data || []);
      /* ⚠️ ตัวนับนี้ยิงทุก 2 นาทีทุกคน ⇒ คิวรีเพิ่มต้องไม่เกิดเลยในกรณีปกติ
         `externalDocReadyIds` คืนชุดว่างโดยไม่แตะฐาน ถ้าคนดูไม่ใช่ผู้อนุมัติ
         หรือไม่มีใบ external ร่างอยู่ในชุดนี้ */
      const docReady = await externalDocReadyIds(supabase, latest, user);
      return latest.filter((row) => isContractWaitingOnMe(row, {
        userId: user.id, user, externalDocReady: docReady.has(row.id),
      })).length;
    }));
  }

  /* ── ใบสั่งขาย: สองแกนของใบเดียวกัน ────────────────────────────────────
     แกน `status`        → รออนุมัติ (ผู้รีวิว) · ถูกตีกลับ (ผู้จัดทำ)
     แกน `financeStatus` → เก็บครบทุกงวดแล้ว รอบัญชีปิดใบ (mig 0250 · มติ 2026-08-30)

     🐞 แกนที่สองเคยตกทั้งแกน ⇒ ฝ่ายบัญชีเห็นเมนู "ใบสั่งขาย" ไม่มีป้ายตลอดกาล
     ทั้งที่การ์ด "รอบัญชีตรวจ" บนหัวหน้าทะเบียนหน้าเดียวกันมีของอยู่ (ตรวจ 2026-09-02)
     ⚠️ ด่านของ block นี้จึงเป็น **สองด่านต่อกันด้วย OR** ตามเมนูที่คนสองกลุ่มเห็น */
  if (can(user.role, 'salesplan:view') || canConfirmPayment(user)) {
    jobs.push(attempt('salesOrders', async () => {
      /* ⚠️ ดึง **สองสถานะ** มาให้ helper ตัดสิน ไม่กรองซ้ำที่นี่ (ม-119) — เลนผู้รีวิว
         (รออนุมัติ) กับเลนผู้จัดทำ (ถูกตีกลับ) อยู่คนละ where ⇒ เขียนเงื่อนไขที่ route
         เมื่อไรก็มีกติกาสองชุดทันที · ชุดข้อมูลเล็ก (ค้างจริงเท่านั้น) */
      const reviewer = isSalesOrderReviewer(user.role);
      const approvalLane = can(user.role, 'salesplan:view')
        ? supabase.from('sales_orders').select('id, status, createdBy')
          .in('status', ['pending_approval', 'rejected']).limit(5000)
        : Promise.resolve({ data: [] });
      /* เลนบัญชี — **แคบด้วย `financeStatus` ก่อนเสมอ** ไม่ใช่ดึงใบ approved ทั้งหมด
         (ใบที่อนุมัติแล้วคือทะเบียนทั้งกอง ส่วนคิวบัญชีคือหลักสิบ)
         ⚠️ `awaitsFinanceReview` ต้องได้งวดของใบไปด้วย ไม่งั้นตอบ false ทุกใบ
         = คิวว่างเงียบ ๆ (กับดักที่เอกสารของมันเตือนไว้ตรง ๆ) */
      const financeLane = canConfirmPayment(user)
        ? supabase.from('sales_orders').select('id, status, "totalAmount", "financeStatus"')
          .eq('status', 'approved').eq('financeStatus', 'pending').limit(5000)
        : Promise.resolve({ data: [] });
      const [{ data: approvalRows }, { data: financeRows }] = await Promise.all([
        approvalLane, financeLane,
      ]);

      const waiting = (approvalRows || [])
        .filter((row) => isSalesOrderWaitingOnMe(row, { userId: user.id, reviewer })).length;
      if (!(financeRows || []).length) return waiting;

      const orderIds = financeRows.map((row) => row.id);
      // ⚠️ ไล่ทีละหน้า — ใบหนึ่งมีได้หลายงวด ⇒ คิวหลักร้อยใบก็แตะเพดาน 1,000 ของ
      // PostgREST ได้ · ตัดกลางทางเมื่อไร ใบท้าย ๆ จะกลายเป็น "ยังเก็บไม่ครบ" เงียบ ๆ
      const { data: installments } = await fetchAllResult(() => supabase
        .from('sales_order_installments')
        .select('"salesOrderId", status')
        .in('salesOrderId', orderIds)
        .order('id', { ascending: true }));
      const byOrder = new Map();
      for (const row of installments || []) {
        const list = byOrder.get(row.salesOrderId) || [];
        list.push(row);
        byOrder.set(row.salesOrderId, list);
      }
      // ⚠️ ใบที่นับสองแกนพร้อมกันไม่มี — approved ไม่มีทางเป็น pending_approval/rejected
      return waiting
        + financeRows.filter((row) => awaitsFinanceReview(row, byOrder.get(row.id) || [])).length;
    }));
  }

  if (canApproveProjectClose(user)) {
    jobs.push(attempt('projectCloses', async () => {
      const { data } = await supabase
        .from('projects')
        .select('id, "closeStatus", "closeRequestedBy"')
        .eq('closeStatus', 'pending_close')
        .limit(5000);
      return (data || []).filter((row) => isProjectCloseWaitingOnMe(row, user)).length;
    }));
  }

  // ทะเบียนกลิ่น/สูตร: `draft` = "รอเข้าทะเบียน" — งานของผู้รับเข้าทะเบียนเท่านั้น
  // (คนเสนอเห็นสถานะบนแถวของตัวเองอยู่แล้ว ป้ายบนเมนูจะกลายเป็นการทวงตัวเอง)
  if (isScentRegistrar(user)) {
    jobs.push(attempt('scents', async () => {
      const { count } = await supabase
        .from('scents').select('id', { count: 'exact', head: true }).eq('status', 'draft');
      return count || 0;
    }));
  }

  if (isFormulaRegistrar(user)) {
    jobs.push(attempt('formulas', async () => {
      const { count } = await supabase
        .from('formulas').select('id', { count: 'exact', head: true }).eq('status', 'draft');
      return count || 0;
    }));
  }

  /* ลูกค้า/สินค้ารออนุมัติ — ผู้อนุมัติข้อมูลหลักเท่านั้น (canApproveMasterData)
     🐞 **สินค้าเคยไม่มีตัวนับเลย** (ผู้ใช้แจ้ง 2026-09-02) ทั้งที่เป็นด่านเดียวกับลูกค้า
     เป๊ะ ๆ — ทะเบียนเดียวกัน สถานะเดียวกัน คนอนุมัติคนเดียวกัน ต่างกันแค่ตาราง
     ⚠️ แถวเก่าก่อน mig 0027 มี `approvalStatus` เป็น NULL = "อนุมัติแล้ว" (approvalStatusOf)
     ⇒ เทียบ `= 'pending'` ตรง ๆ ถูกแล้ว NULL ไม่เข้าคิว */
  if (canApproveMasterData(user.role)) {
    const pendingApproval = (table) => async () => {
      const { count } = await supabase
        .from(table).select('id', { count: 'exact', head: true })
        .eq('approvalStatus', 'pending');
      return count || 0;
    };
    jobs.push(attempt('customers', pendingApproval('customers')));
    jobs.push(attempt('products', pendingApproval('products')));
  }

  /* ── เฟส 2: บริการ + งานบริหาร ─────────────────────────────────────────
     สองโมดูลนี้มี "คิวของคนคนเดียว" เป็นหน้าอยู่แล้ว ป้ายจึงชี้ตรงเข้าไปได้เลย */

  /* นัดของเจ้าหน้าที่ — ช่วงวันเดียวกับที่หน้า "นัดของฉัน" โหลดเป็นค่าตั้งต้น (back/ahead 14)
     ⚠️ ต้องเท่ากัน ไม่งั้นป้ายนับนัดค้างที่เก่ากว่าที่หน้านั้นแสดง แล้วกดเข้าไปไม่เจอ

     🐞 **ด่านนี้เคยเป็น `canEditService` ซึ่งแคบกว่าเมนู** (ตรวจ 2026-09-02) — เมนู
     "งานวันนี้" กั้นด้วย `canDoFieldWork` ⇒ เจ้าหน้าที่หน้างาน (role `ts` ถือ
     `service:work` ไม่ถือ `service:edit`) เห็นเมนูที่ไม่มีวันขึ้นป้าย ทั้งที่ตัวเลขนี้
     นับ **นัดที่มอบหมายให้ตัวเขาเอง** (`assigneeId = user.id`) — คนที่ป้ายนี้ทำมาเพื่อเขา
     คือคนเดียวที่ไม่เคยได้เห็นมัน */
  if (canDoFieldWork(user)) {
    jobs.push(attempt('visits', async () => {
      const today = businessDate();
      const shift = (days) => {
        const d = new Date(`${today}T00:00:00`);
        d.setDate(d.getDate() + days);
        return toLocalISODate(d);
      };
      const visits = await loadVisits(supabase, {
        from: shift(-14), to: shift(14), assigneeId: String(user.id),
      });
      return waitingOnMeVisitCount(visits, today);
    }));
  }

  /* งานเข้าใหม่ — ใบสั่งขายสายบริการที่อนุมัติแล้วแต่ยังจัดสรรลงโซนไม่ครบ
     (ถังแรกของหน้า `/service/intake` ซึ่งเป็นแท็บตั้งต้นของหน้านั้นพอดี)

     ⭐ ที่มาของหน้านั้นคือ 102 จุดที่ลูกค้าจ่ายแล้วแต่ไม่มีคิวบริการ — คิวที่ไม่มีป้าย
     คือคิวที่ไม่มีใครเปิด แล้วตัวเลขนั้นก็โตอยู่เงียบ ๆ ต่อไป
     ⚠️ **นับถังเดียว ไม่รวม "รอตั้งรอบ"/"ครบรอบยังไม่มีนัด"** — สองถังนั้นต้องโหลด
     ไซต์/โซน/รอบ/นัดทั้งระบบ ซึ่งแพงเกินกว่าจะยิงทุก 2 นาทีทุกคน และป้ายก็จะไม่ตรง
     กับแท็บที่เปิดขึ้นมาเจอ
     ⚠️ ด่าน `canEditService` ตรงกับเมนู (คนที่ *วางคิว* ได้เท่านั้น คือ Planner/หัวหน้า)
     ⇒ จำนวนคนที่ยิงชุดนี้อยู่ในหลักหน่วย
     ⚠️ ไม่ส่ง contractsById/installmentsByOrderId — สองตัวนั้นมีไว้ทำชิปความพร้อม
     บนการ์ด ซึ่งตัวนับไม่อ่าน · ส่งไปก็ได้แค่ query ที่ไม่มีใครใช้
     ⚠️ select ของบรรทัดผอมกว่าที่หน้าคิวใช้ **ได้เฉพาะเพราะเราอ่านแค่จำนวนแถว** —
     ช่องที่ตัดออก (fgCode/description/unit/sortOrder) ไปโผล่ในเนื้อการ์ดเท่านั้น
     ไม่มีตัวไหนเปลี่ยนว่าใบเข้าคิวหรือไม่ (ตัวตัดสินคือ `qty` กับโซนที่จัดสรรไปแล้ว) */
  if (canEditService(user)) {
    jobs.push(attempt('serviceIntake', async () => {
      const { data: orders } = await fetchAllResult(() => supabase
        .from('sales_orders')
        .select('id, status, supersededById, projectId, dealId, orderNumber, approvedAt, orderDate')
        .eq('status', 'approved')
        .is('supersededById', null)
        .order('id', { ascending: true }));
      const orderIds = (orders || []).map((row) => row.id);
      if (!orderIds.length) return 0;
      const projectIds = [...new Set((orders || []).map((o) => o.projectId).filter(Boolean))];
      const dealIds = [...new Set((orders || []).map((o) => o.dealId).filter(Boolean))];
      const [lines, terms, projects, deals] = await Promise.all([
        fetchAllResult(() => supabase.from('sales_order_lines')
          .select('id, salesOrderId, quotationLineId, qty, "serviceRounds"')
          .in('salesOrderId', orderIds).order('id', { ascending: true }))
          .then((r) => r.data || []),
        loadTerms(supabase),
        projectIds.length
          ? fetchAllResult(() => supabase.from('projects').select('id, line')
            .in('id', projectIds).order('id', { ascending: true })).then((r) => r.data || [])
          : [],
        dealIds.length
          ? fetchAllResult(() => supabase.from('sales_deals').select('id, line')
            .in('id', dealIds).order('id', { ascending: true })).then((r) => r.data || [])
          : [],
      ]);
      const bind = bindQueue({
        orders: orders || [],
        lines,
        terms,
        projectsById: new Map(projects.map((p) => [p.id, p])),
        dealsById: new Map(deals.map((d) => [d.id, d])),
      });
      return bind.rows.length;
    }));
  }

  /* งวดที่ฝ่ายขายแจ้งแล้ว รอบัญชีตรวจหลักฐาน — คิวบนหัวหน้า `/finance/payments`
     ⚠️ สถานะ `reported` ที่เดียว ตรงกับ `pendingConfirmations` ของหน้านั้น
     (`confirmed` = จบแล้ว · `rejected` = กลับไปอยู่มือฝ่ายขาย ไม่ใช่งานของบัญชี) */
  if (canConfirmPayment(user)) {
    jobs.push(attempt('payments', async () => {
      const { count } = await supabase
        .from('sales_order_installments').select('id', { count: 'exact', head: true })
        .eq('status', 'reported');
      return count || 0;
    }));
  }

  // งานจากที่ประชุม — ⚠️ กรองปีเหมือนหน้ารายการ (ตัวกรองปีของหน้านั้นไม่มีตัวเลือก
  // "ทั้งหมด") ⇒ ป้ายนับปีปัจจุบันเท่านั้น ไม่งั้นเลขบนเมนูมีของที่หน้าไม่แสดง
  if (can(user.role, 'mgmt:view')) {
    jobs.push(attempt('mgmtTasks', async () => {
      const year = Number(businessDate().slice(0, 4));
      const tasks = await listTasks(supabase, { year });
      return tasks.filter((task) => isMyOpenTask(task, user.id)).length;
    }));
  }

  /* ── เฟส 3: ภาษีสรรพสามิต ───────────────────────────────────────────────
     โมดูลนี้ประกาศ **เจ้าของขั้น** ไว้ใน TRACKS อยู่แล้ว (SA / RA) ⇒ "รอฉันลงมือ"
     = แถวที่อยู่ขั้นซึ่งเลนของฉันเป็นเจ้าของและยังไม่จบ · ไม่ต้องเดา ไม่ต้องมีลิสต์ที่สอง
     ⚠️ แอดมิน (AD) ได้ลิสต์ว่าง = ไม่มีป้าย ตามที่โมดูลประกาศเองว่า "เห็นสองเลน
     แต่ไม่เป็นเจ้าของอะไร" · นับด้วย head:true ไม่ดึงแถวเลย */
  const taxDept = deptOf(user.role);
  const taxCount = async (table, trackKey) => {
    const stages = ownedStages(trackKey, taxDept);
    if (!stages.length) return 0;
    const { count } = await supabase
      .from(table).select('id', { count: 'exact', head: true }).in('status', stages);
    return count || 0;
  };

  if (can(user.role, 'history:view')) {
    jobs.push(attempt('taxRegistrations', () => taxCount('excise_registrations', 'registration')));
    jobs.push(attempt('taxFilings', () => taxCount('orders', 'payment')));
  }

  /* ── เฟส 4: แจ้งปัญหาระบบ + วางแผนผลิต ─────────────────────────────────
     เรื่องแจ้งปัญหามีสองเลนเหมือนคิวคำร้อง (คนดูแลระบบ / คนแจ้ง) — สถานะที่นับ
     ประกาศไว้ที่ `lib/issues/access.js` ที่เดียว ไม่เขียนซ้ำที่นี่ */
  jobs.push(attempt('issues', async () => {
    const query = supabase.from('system_issues').select('id', { count: 'exact', head: true });
    // แอดมิน = เรื่องที่ยังไม่มีใครรับ (ตรงกับแท็บตั้งต้นของหน้า /support)
    // คนแจ้ง = เรื่องของตัวเองที่แก้แล้วรอยืนยัน — ฝ่ายปล่อยมือแล้ว ผู้แจ้งมักไม่รู้ตัว
    const { count } = isSystemAdmin(user)
      ? await query.eq('status', 'pending')
      : await query.eq('status', 'resolved').eq('reportedById', String(user.id));
    return count || 0;
  }));

  // คิวงานผลิต — งานร่างที่ยังไม่ถูกวางคิว (ระบบกวาดมาจาก SO ที่อนุมัติแล้วให้เอง)
  if (canEditProduction(user)) {
    jobs.push(attempt('productionJobs', async () => {
      const { count } = await supabase
        .from('production_jobs').select('id', { count: 'exact', head: true }).eq('status', 'draft');
      return count || 0;
    }));
  }

  await Promise.all(jobs);
  return ok(pruneZeroCounts(counts));
});
