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
import { fetchInChunks } from '@/lib/supabaseInChunks';
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
import { historicalRowsOnly, pipelineRowsOnly } from '@/lib/sales/historicalOrders';
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
import { bindQueue, planQueue } from '@/lib/service/intake';
import { waitingOnMeVisitCount } from '@/lib/service/myVisits';
import { listTasks } from '@/lib/mgmt/repo';
import { isMyOpenTask } from '@/lib/mgmt/constants';
import { businessDate } from '@/lib/businessDate';
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { deptOf, ownedStages } from '@/lib/excise/workflow';
import { applyExciseListScope } from '@/lib/excise/listScope';
import { isSystemAdmin } from '@/lib/issues/access';
import { canEditProduction } from '@/lib/permissions';
import {
  DEPT_QUEUE_COUNT_KEYS, LEAD_TODO_STATUS, deptRequestsTodoCount, myTasksTodoCount,
  requestsTodoCount, withCountStatus,
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
  /* 🔴 ต้องโยน error ขึ้นไปให้ `attempt()` เห็น — `fetchAllResult` คืน { data: null, error }
     เมื่อพัง · ทิ้ง error ที่นี่ = ป้าย "งานของฉัน" นับขาดหรือหายเงียบ ๆ
     ⚠️ ฟังก์ชันนี้อยู่นอก handler GET ⇒ ด่าน uncheckedReads มองไม่เห็น ต้องเช็คเอง */
  const [{ data: byOwner, error: ownerError }, { data: byAssignee, error: assigneeError },
    { data: byProxy, error: proxyError }] = await Promise.all([
    page('ownerId'), page('assigneeId'), page('proxyBy'),
  ]);
  if (ownerError || assigneeError || proxyError) throw ownerError || assigneeError || proxyError;
  const seen = new Set();
  return [...(byOwner || []), ...(byAssignee || []), ...(byProxy || [])]
    .filter((task) => (seen.has(task.id) ? false : seen.add(task.id)));
}

export const GET = withUser(async ({ user, supabase }) => {
  if (!user?.id) return unauthorized();

  const jobs = [];
  const counts = {};
  /* คีย์ที่ "มีตัวนับสำหรับคนนี้" กับคีย์ที่ "นับแล้วไม่สำเร็จ" — ปลายทางต้องแยกสามอย่าง
     ออกจากกัน: นับแล้ว (รวมศูนย์) · นับไม่สำเร็จ · ไม่มีตัวนับสำหรับคนนี้ (ADR 0016)
     ⚠️ เก็บ **ทุกคีย์ที่เริ่มนับ** ไม่ใช่เฉพาะที่สำเร็จ — คีย์ที่นับได้ 0 ถูก
     `pruneZeroCounts` ตัดทิ้ง ถ้าไม่มีลิสต์นี้ปลายทางจะแยกศูนย์กับไม่มีสิทธิ์ไม่ออก */
  const attempted = [];
  const failed = [];
  const attempt = async (key, run) => {
    attempted.push(key);
    try { counts[key] = await run(); } catch (e) {
      // ตัวนับพังต้องไม่ทำให้เมนูทั้งแถบพัง — เมนูนั้นได้ป้าย "นับไม่สำเร็จ" ไม่ใช่ 0
      failed.push(key);
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
      const { count, error: leadError } = await applyLeadScope(
        supabase.from('sales_leads').select('id', { count: 'exact', head: true }),
        user,
      ).eq('status', LEAD_TODO_STATUS);
      if (leadError) throw leadError;
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
      /* 🔴 ต้องรับ `error` มาโยนต่อ — supabase **ไม่ throw** มันคืน { data: null, error }
         ⇒ `const { data }` เปล่า ๆ ทำให้ query ที่พังกลายเป็น `[]` แล้วป้ายขึ้น **0**
         โดย `attempt()` ข้างบนไม่เห็นอะไรเลย ไม่มีแม้แต่บรรทัด log
         โยนแล้ว attempt จะ log + ปล่อยให้เมนูนั้น **ไม่มีป้าย** ซึ่งอ่านออกว่าผิดปกติ
         ต่างจากเลข 0 ที่อ่านเหมือน "ไม่มีงานค้าง" (ดู [[nav-count-badges]]) */
      const { data, error: quoteError } = await fetchAllResult(() => supabase
        .from('quotations')
        .select('id, status, approvalStatus, createdBy, rejectionReason, deal:sales_deals(ownerId, stage)')
        .in('status', QUOTATION_ACTIONABLE_STATUSES)
        .order('id', { ascending: true }));
      if (quoteError) throw quoteError;
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
      /* ⚠️ ไล่ทีละหน้า ไม่ใช่ `.limit(5000)` — PostgREST ตัดที่ 1,000 แถวเสมอ (เพดานของโปรเจกต์)
         สองก้อนนี้โตตามจำนวนใบเสนอราคาที่อนุมัติแล้วและดีลที่ผูก FC กับใบ ⇒ วันหนึ่งถึงเพดานแน่
         และตอนถึงมันจะ **นับขาดเงียบ ๆ** ไม่มี error ให้จับ */
      const [{ data: seedQuotes, error: seedError }, { data: followingDeals, error: followingError }] = await Promise.all([
        fetchAllResult(() => supabase.from('quotations').select('"dealId"')
          .in('status', FORECAST_ELIGIBLE_STATUSES)
          .in('approvalStatus', FORECAST_ELIGIBLE_APPROVALS)
          .order('id', { ascending: true })),
        fetchAllResult(() => supabase.from('sales_deals').select('id')
          .eq('forecastSource', 'quotation')
          .order('id', { ascending: true })),
      ]);
      if (seedError || followingError) throw seedError || followingError;
      const dealIds = [...new Set([
        ...(seedQuotes || []).map((row) => row.dealId),
        ...(followingDeals || []).map((row) => row.id),
      ].filter(Boolean))];
      /* ⚠️ ไม่มีดีลที่ต้องดูที่มา ก็ยังต้องนับกองวันที่ขาดต่อ — early return ตรงนี้เมื่อไร
         ป้ายจะหายทั้งที่หน้ายังมีของ (เคสนี้เกิดจริงตอนรวมสองสายเข้าด้วยกัน) */
      /* ⚠️ ซอยลิสต์ + ไล่หน้า — `dealIds` โตตามใบเสนอราคา + ดีล · ส่งทั้งก้อนใน `.in()`
         ชนเพดาน URL (~780 id) แล้วทั้งคำขอพังคาที่ ส่วนผลลัพธ์ของดีลหนึ่งใบมีได้หลายฉบับ
         ⇒ ก้อนคืนมาเกิน 1,000 แถวได้ด้วย (ท่าเดียวกับ api/pm/projects) */
      const [{ data: deals, error: dealError }, { data: quotations, error: quotationError }] = dealIds.length
        ? await Promise.all([
        fetchInChunks(dealIds, (chunk) => fetchAllResult(() => supabase.from('sales_deals')
          .select('id, stage, "ownerId", "ownerName", team, "projectValue", "forecastManualValue", "forecastSource", "forecastQuotationId", "forecastPinnedAt"')
          .in('id', chunk).order('id', { ascending: true }))),
        fetchInChunks(dealIds, (chunk) => fetchAllResult(() => supabase.from('quotations')
          .select('id, "dealId", "quoteNumber", "baseNumber", "revisionNo", status, "approvalStatus", "totalAmount", "vatAmount", "createdAt"')
          .in('dealId', chunk).order('id', { ascending: true }))),
        ])
        : [{ data: [], error: null }, { data: [], error: null }];
      if (dealError || quotationError) throw dealError || quotationError;

      /* กองที่สองของหน้าเดียวกัน: ดีลที่ยังไม่มีวันเริ่ม/วันรับของ — ป้ายต้องนับด้วย
         ไม่งั้นกดเข้าไปเจอเลขไม่ตรงกับที่เมนูบอก (กฎหัวไฟล์ navCounts)
         ⭐ "วันที่สิ้นสุด" = วันที่ลูกค้ารับของ ซึ่งรายงาน FC วางแผนผลิตใช้เป็นแกนเดือน
         ⚠️ คนละ query กับกองใบเสนอราคาข้างบน เพราะกองนี้ไม่เกี่ยวกับใบเลย และดีลที่
            ไม่มีใบก็ต้องถูกนับ ⇒ รวม dealIds ไม่ได้ */
      const { data: undated, error: undatedError } = await fetchAllResult(() => supabase
        .from('sales_deals')
        .select('id, stage, "ownerId", "ownerName", team, "startDate", "endDate", "projectValue"')
        .or('startDate.is.null,endDate.is.null')
        .order('id', { ascending: true }));
      if (undatedError) throw undatedError;
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
      // เหตุผลเดียวกับตัวนับใบเสนอราคาข้างบน — ทิ้ง error = ป้ายขึ้น 0 เงียบ
      /* ⚠️ ไม่ต้องกรอง scope ตามดีลเหมือน route ของทะเบียน — สองเลนนี้แคบตัวเอง
         อยู่แล้ว: เลนเจ้าของเทียบ `ownerId`/`createdBy` เป็นรายใบ ส่วนเลนผู้รับรอง
         เปิดให้ AE Supervisor/admin ซึ่ง scope เป็น 'all' อยู่แล้วทั้งคู่ */
      /* `source` ต้องมาด้วย — ใบ external ร่างที่แนบเอกสารแล้วเป็นงานของ AE Sup
         ไม่ใช่ของเจ้าของใบ · ขาดคอลัมน์นี้เมื่อไร ทุกใบตกเป็น generated แล้วเลนนั้นเงียบ
         `metadata` ต้องมาด้วย (0374) — เอกสารแทนสัญญาของใบสั่งขายย้อนหลังที่ยังเป็นร่างเป็นงานของคิว
         ใบสั่งขาย (`isContractWaitingOnMe` ตัดจาก `metadata.historicalSalesOrderId`) · ขาดคอลัมน์นี้ = ใบที่แนบ
         ไฟล์แล้วนับซ้ำในป้ายสัญญาของ AE Sup ทั้งที่ปุ่มอนุมัติบนหน้าสัญญาถูกล็อก
         ⚠️ คอมเมนต์อยู่เหนือ `.from()` — check:columns มองหา `.select()` ในระยะ 200 ตัวอักษรหลัง `.from()` */
      const { data, error: contractError } = await fetchAllResult(() => supabase
        .from('sales_contracts')
        .select('id, status, source, metadata, "ownerId", "createdBy", "contractNo", "baseNumber", "revisionNo", "createdAt"')
        .in('status', ['draft', 'awaiting_signature', 'awaiting_approval'])
        .order('id', { ascending: true }));
      if (contractError) throw contractError;
      const latest = latestContractRevisions(data || []);
      /* ⚠️ ตัวนับนี้ยิงทุก 2 นาทีทุกคน ⇒ คิวรีเพิ่มต้องไม่เกิดเลยในกรณีปกติ
         `externalDocReadyIds` คืนชุดว่างโดยไม่แตะฐาน ถ้าไม่มีใบ external ร่างที่เลนของคนดูพลิกได้
         (ผู้อนุมัติ = ทุกใบ · คนอื่น = ใบที่ตัวเองเป็นเจ้าของ/คนสร้าง · รีวิว 25/09 — ร่างที่แนบแล้ว
         หลุดเลนของเจ้าของใบ ตรงกับรางที่บอก "รอ AE Supervisor อนุมัติ" และตรงกับทะเบียน) */
      // strict: อ่านไฟล์แนบไม่สำเร็จ = ป้ายต้องขึ้นขีด ไม่ใช่ลดจำนวนเงียบ ๆ (ADR 0016)
      const docReady = await externalDocReadyIds(supabase, latest, user, { strict: true });
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
         เมื่อไรก็มีกติกาสองชุดทันที · ชุดข้อมูลเล็ก (ค้างจริงเท่านั้น)
         ⭐ `submittedBy` ต้องมา — เลนผู้รีวิวตัดใบที่ตัวเองสร้าง/ยื่นออก (อนุมัติเองไม่ได้ · 22/09)
            ขาดคอลัมน์นี้ = ใบที่ AE Sup ยื่นแทนคนอื่นถูกนับเป็นงานรอตัวเองเงียบ ๆ
         ⭐ `origin` มาด้วย — helper ตัดสินใบย้อนหลังจากแถวเดียวกัน (ไม่เดาจากที่มาของ query) */
      const reviewer = isSalesOrderReviewer(user.role);
      const approvalLane = can(user.role, 'salesplan:view')
        ? fetchAllResult(() => supabase.from('sales_orders').select('id, status, createdBy, submittedBy, origin')
          .in('status', ['pending_approval', 'rejected']).order('id', { ascending: true }))
        : Promise.resolve({ data: [] });
      /* เลนร่างของใบสั่งขายย้อนหลัง (มติ 22/09 · mig 0374) — ร่างของใบนี้ = บันทึกค้างครึ่งทาง/ดึงกลับ
         ที่ผู้คีย์ต้องกลับมาทำต่อ (ร่างของใบปกติไม่นับ — ดู isSalesOrderWaitingOnMe) · แคบด้วยผู้สร้างที่ query
         ⚠️ ตัวกรองใบย้อนหลังผ่าน historicalRowsOnly เท่านั้น — literal ของ origin มีบ้านเดียว (historicalMoneyGuards) */
      const draftLane = can(user.role, 'salesplan:view')
        ? fetchAllResult(() => historicalRowsOnly(supabase.from('sales_orders').select('id, status, createdBy, origin'))
          .eq('status', 'draft').eq('createdBy', user.id).order('id', { ascending: true }))
        : Promise.resolve({ data: [] });
      /* เลนย้อนการอนุมัติ (มติ 24/09 · #1808) — ใบที่ผู้จัดการย้อนแล้วรอเจ้าของดีลปัจจุบันกด "ออก Rev."
         ⭐ ชุดข้อมูลเล็ก (ค้างจริงเท่านั้น) ⇒ ดึงทุกใบสถานะนี้ แล้วให้ helper ตัดสินจาก deal.ownerId ที่ฝังมา
         ⚠️ ขาด deal ใน select = helper ตอบ false ทุกใบ ⇒ ป้ายไม่ขึ้นเงียบ (navCounts.test ล็อกรูปไว้) */
      const revokedLane = can(user.role, 'salesplan:view')
        ? fetchAllResult(() => pipelineRowsOnly(supabase.from('sales_orders').select('id, status, createdBy, origin, deal:sales_deals(ownerId)'))
          .eq('status', 'approval_revoked').order('id', { ascending: true }))
        : Promise.resolve({ data: [] });
      /* เลนบัญชี — **แคบด้วย `financeStatus` ก่อนเสมอ** ไม่ใช่ดึงใบ approved ทั้งหมด
         (ใบที่อนุมัติแล้วคือทะเบียนทั้งกอง ส่วนคิวบัญชีคือหลักสิบ)
         ⚠️ `awaitsFinanceReview` ต้องได้งวดของใบไปด้วย ไม่งั้นตอบ false ทุกใบ
         = คิวว่างเงียบ ๆ (กับดักที่เอกสารของมันเตือนไว้ตรง ๆ) */
      const financeLane = canConfirmPayment(user)
        ? fetchAllResult(() => supabase.from('sales_orders').select('id, status, "totalAmount", "financeStatus"')
          .eq('status', 'approved').eq('financeStatus', 'pending').order('id', { ascending: true }))
        : Promise.resolve({ data: [] });
      const [
        { data: approvalRows, error: approvalError },
        { data: draftRows, error: draftError },
        { data: revokedRows, error: revokedError },
        { data: financeRows, error: financeError },
      ] = await Promise.all([approvalLane, draftLane, revokedLane, financeLane]);
      // ทิ้ง error ที่นี่ = เลนนั้นกลายเป็น [] ⇒ ป้ายนับขาดเงียบ (เลนบัญชีเคยเป็นทั้งเลน)
      if (approvalError || draftError || revokedError || financeError) throw approvalError || draftError || revokedError || financeError;

      // ⚠️ สามเลนไม่มีใบซ้อนกัน — แยกกันด้วยสถานะ (pending_approval/rejected · draft · approval_revoked)
      const waiting = [...(approvalRows || []), ...(draftRows || []), ...(revokedRows || [])]
        .filter((row) => isSalesOrderWaitingOnMe(row, { userId: user.id, reviewer, role: user.role })).length;
      if (!(financeRows || []).length) return waiting;

      const orderIds = financeRows.map((row) => row.id);
      // ⚠️ ไล่ทีละหน้า — ใบหนึ่งมีได้หลายงวด ⇒ คิวหลักร้อยใบก็แตะเพดาน 1,000 ของ
      // PostgREST ได้ · ตัดกลางทางเมื่อไร ใบท้าย ๆ จะกลายเป็น "ยังเก็บไม่ครบ" เงียบ ๆ
      // ⚠️ ซอยลิสต์ด้วย — ไล่หน้าอย่างเดียวส่งลิสต์ id ก้อนเดิมทุกหน้า ⇒ ใบรอบัญชีหลายร้อยใบชนเพดาน URL
      const { data: installments, error: installmentError } = await fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase
        .from('sales_order_installments')
        .select('"salesOrderId", status')
        .in('salesOrderId', chunk)
        .order('id', { ascending: true })));
      /* 🔴 งวดอ่านไม่ขึ้น = `awaitsFinanceReview` ตอบ false ทุกใบ = คิวบัญชีว่างเงียบ ๆ
         ซึ่งเป็นกับดักที่เอกสารของ helper ตัวนี้เตือนไว้ตรง ๆ */
      if (installmentError) throw installmentError;
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
      // เหตุผลเดียวกับตัวนับใบเสนอราคาข้างบน — ทิ้ง error = ป้ายขึ้น 0 เงียบ
      const { data, error: closeError } = await fetchAllResult(() => supabase
        .from('projects')
        .select('id, "closeStatus", "closeRequestedBy"')
        .eq('closeStatus', 'pending_close')
        .order('id', { ascending: true }));
      if (closeError) throw closeError;
      return (data || []).filter((row) => isProjectCloseWaitingOnMe(row, user)).length;
    }));
  }

  // ทะเบียนกลิ่น/สูตร: `draft` = "รอเข้าทะเบียน" — งานของผู้รับเข้าทะเบียนเท่านั้น
  // (คนเสนอเห็นสถานะบนแถวของตัวเองอยู่แล้ว ป้ายบนเมนูจะกลายเป็นการทวงตัวเอง)
  if (isScentRegistrar(user)) {
    jobs.push(attempt('scents', async () => {
      const { count, error: scentError } = await supabase
        .from('scents').select('id', { count: 'exact', head: true }).eq('status', 'draft');
      if (scentError) throw scentError;
      return count || 0;
    }));
  }

  if (isFormulaRegistrar(user)) {
    jobs.push(attempt('formulas', async () => {
      const { count, error: formulaError } = await supabase
        .from('formulas').select('id', { count: 'exact', head: true }).eq('status', 'draft');
      if (formulaError) throw formulaError;
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
      const { count, error: masterError } = await supabase
        .from(table).select('id', { count: 'exact', head: true })
        .eq('approvalStatus', 'pending');
      if (masterError) throw masterError;
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

  /* งานเข้าใหม่ — ถัง "รอตั้งไซต์/โซน" + ถัง "รอตั้งรอบ" ของหน้า `/service/intake`
     (ใบสายบริการที่อนุมัติแล้วแต่ยังจัดสรรลงโซนไม่ครบ · คู่ไซต์×ใบที่ขายแล้วแต่ยังไม่มีรอบ)

     ⭐ ที่มาของหน้านั้นคือ 102 จุดที่ลูกค้าจ่ายแล้วแต่ไม่มีคิวบริการ — คิวที่ไม่มีป้าย
     คือคิวที่ไม่มีใครเปิด แล้วตัวเลขนั้นก็โตอยู่เงียบ ๆ ต่อไป
     🔄 **นับถัง "รอตั้งรอบ" ด้วยแล้ว** (มติ 22/09 · mig 0374) — ใบสั่งขายย้อนหลังเลือกโซนจากทะเบียนตอนคีย์
     และรอบขายเกิดตอน AE Sup อนุมัติ ⇒ **ไม่เคยผ่านถังผูกโซน** มาโผล่ที่ถังตั้งรอบตรง ๆ · นับถังเดียวเหมือนเดิม
     = ใบย้อนหลังมาถึง TS โดยไม่มีสัญญาณอะไรเลย (กระดิ่งไม่ใช่ช่องทาง — แคบไว้ที่คำร้อง/แจ้งปัญหา/มอบหมายงาน)
     ⚠️ มีผลกับทุกใบ ไม่ใช่เฉพาะใบย้อนหลัง — ป้ายของใบ pipeline ที่ผูกโซนแล้วแต่ยังไม่ตั้งรอบก็นับด้วย
        (ตรงกับแท็บ "รอตั้งรอบ" ที่หน้าเปิดขึ้นมาเจอ: หน้าเลือกแท็บแรกที่มีงานเอง)
     ⚠️ **ยังไม่รวม "ครบรอบยังไม่มีนัด"** — ถังนั้นต้องโหลดนัดทั้งระบบ แพงเกินกว่าจะยิงทุก 2 นาที
     ⚠️ ด่าน `canEditService` ตรงกับเมนู (คนที่ *วางคิว* ได้เท่านั้น คือ Planner/หัวหน้า)
     ⇒ จำนวนคนที่ยิงชุดนี้อยู่ในหลักหน่วย · ถังตั้งรอบเพิ่มแค่สอง query ไล่หน้า (โซน · รอบ) ที่เลือกคอลัมน์ผอม
     ⚠️ ไม่ส่ง contractsById/installmentsByOrderId — สองตัวนั้นมีไว้ทำชิปความพร้อม/เงินครอบถึง
     บนการ์ด ซึ่งตัวนับไม่อ่าน · ส่งไปก็ได้แค่ query ที่ไม่มีใครใช้
     ⚠️ select ของบรรทัด/โซน/รอบผอมกว่าที่หน้าคิวใช้ **ได้เฉพาะเพราะเราอ่านแค่จำนวนแถว** —
     ช่องที่ตัดออก (fgCode/description/unit/sortOrder · ชื่อโซน · ชนิดรอบ) ไปโผล่ในเนื้อการ์ดเท่านั้น
     ไม่มีตัวไหนเปลี่ยนว่าแถวเข้าคิวหรือไม่ (ถังผูก: `qty` กับโซนที่จัดสรรแล้ว · ถังรอบ: term ที่มีผล ·
     `siteId` ของโซน · รอบที่ยังเปิดของคู่ไซต์×ใบ)
     ⚠️ โซนต้องเป็น **ทุกโซน** รวมที่ปิดใช้งาน — ตรงกับที่หน้าคิวโหลด (`loadAllZones`) · ตัดทิ้งแล้วป้ายนับไม่ตรงแท็บ
     ⭐ ใบสั่งขายย้อนหลังนับด้วยโดยตั้งใจ · ตัวนับอ่านแค่จำนวนแถว จึงไม่ต้องเลือก `origin`
     (bindQueue/planQueue ถือว่าไม่ส่งมา = pipeline · นับตรงกับแท็บ) */
  if (canEditService(user)) {
    jobs.push(attempt('serviceIntake', async () => {
      const { data: orders, error: orderError } = await fetchAllResult(() => supabase
        .from('sales_orders')
        .select('id, status, supersededById, projectId, dealId, orderNumber, approvedAt, orderDate')
        .eq('status', 'approved')
        .is('supersededById', null)
        .order('id', { ascending: true }));
      if (orderError) throw orderError;
      const orderIds = (orders || []).map((row) => row.id);
      if (!orderIds.length) return 0;
      const projectIds = [...new Set((orders || []).map((o) => o.projectId).filter(Boolean))];
      const dealIds = [...new Set((orders || []).map((o) => o.dealId).filter(Boolean))];
      /* 🔴 `.then((r) => r.data || [])` คือการทิ้ง error ทิ้งแบบที่ตาไม่เห็น — บรรทัดที่อ่าน
         ไม่ขึ้นกลายเป็นชุดว่าง แล้ว `bindQueue` ตอบว่า "ไม่มีใบค้าง" ทั้งที่ยังไม่รู้ด้วยซ้ำ
         ⇒ ทุกก้อนผ่าน `mustData` ซึ่งโยน error ขึ้นไปให้ `attempt()` เห็น */
      const mustData = (result) => {
        if (result?.error) throw result.error;
        return result?.data || [];
      };
      const [lines, terms, projects, deals, zones, plans] = await Promise.all([
        /* 🚫 ธง `"siteNotFoundAt"` (mig 0362) ไม่ต้องมีแล้ว (มติ 22/09) — ทางแจ้ง "ไม่พบจุดนี้หน้างาน"
           ถอดทั้งเส้น · บรรทัดของใบย้อนหลังผูกโซนตั้งแต่ตอนคีย์ ⇒ ไม่มีบรรทัดไหนหลุดจากแท็บด้วยธงอีก */
        fetchInChunks(orderIds, (chunk) => fetchAllResult(() => supabase.from('sales_order_lines')
          .select('id, salesOrderId, quotationLineId, qty, "serviceRounds"')
          .in('salesOrderId', chunk).order('id', { ascending: true })))
          .then(mustData),
        loadTerms(supabase),
        projectIds.length
          ? fetchInChunks(projectIds, (chunk) => fetchAllResult(() => supabase.from('projects').select('id, line')
            .in('id', chunk).order('id', { ascending: true }))).then(mustData)
          : [],
        dealIds.length
          ? fetchInChunks(dealIds, (chunk) => fetchAllResult(() => supabase.from('sales_deals').select('id, line')
            .in('id', chunk).order('id', { ascending: true }))).then(mustData)
          : [],
        // ถังตั้งรอบ: โซน (ไซต์ของ term) กับรอบ (คู่ไซต์×ใบที่มีรอบแล้ว) — ไล่หน้า เพดาน 1,000 แถวตัดเงียบ
        fetchAllResult(() => supabase.from('service_zones').select('id, "siteId", "isActive"')
          .order('id', { ascending: true })).then(mustData),
        fetchAllResult(() => supabase.from('service_plans').select('id, "siteId", "salesOrderId", "isActive"')
          .order('id', { ascending: true })).then(mustData),
      ]);
      const bind = bindQueue({
        orders: orders || [],
        lines,
        terms,
        projectsById: new Map(projects.map((p) => [p.id, p])),
        dealsById: new Map(deals.map((d) => [d.id, d])),
      });
      // ถัง "รอตั้งรอบ" — ใบชุดเดียวกัน (อนุมัติ · ไม่ถูก Rev. ทับ) คือใบที่ `termIsActive` ยอมรับ
      const plan = planQueue({
        zones, terms, plans,
        ordersById: new Map((orders || []).map((o) => [o.id, o])),
      });
      return bind.rows.length + plan.length;
    }));
  }

  /* งวดที่ฝ่ายขายแจ้งแล้ว รอบัญชีตรวจหลักฐาน — คิวบนหัวหน้า `/finance/payments`
     ⚠️ สถานะ `reported` ที่เดียว ตรงกับ `pendingConfirmations` ของหน้านั้น
     (`confirmed` = จบแล้ว · `rejected` = กลับไปอยู่มือฝ่ายขาย ไม่ใช่งานของบัญชี) */
  if (canConfirmPayment(user)) {
    jobs.push(attempt('payments', async () => {
      const { count, error: paymentError } = await supabase
        .from('sales_order_installments').select('id', { count: 'exact', head: true })
        .eq('status', 'reported');
      if (paymentError) throw paymentError;
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
    /* ⚠️ ต้องกรองขอบเขตทีมเหมือนลิสต์ (applyExciseListScope) — ไม่งั้น senior_ae / ac / ae
       ซึ่ง scope เป็น 'team' ได้ป้ายเท่ายอดทั้งบริษัท แล้วกดเข้าไปเจอแค่ของทีมตัวเอง */
    const { count, error: taxError } = await applyExciseListScope(
      supabase.from(table).select('id', { count: 'exact', head: true }).in('status', stages),
      user,
    );
    if (taxError) throw taxError;
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
    const { count, error: issueError } = isSystemAdmin(user)
      ? await query.eq('status', 'pending')
      : await query.eq('status', 'resolved').eq('reportedById', String(user.id));
    if (issueError) throw issueError;
    return count || 0;
  }));

  // คิวงานผลิต — งานร่างที่ยังไม่ถูกวางคิว (ระบบกวาดมาจาก SO ที่อนุมัติแล้วให้เอง)
  if (canEditProduction(user)) {
    jobs.push(attempt('productionJobs', async () => {
      const { count, error: jobError } = await supabase
        .from('production_jobs').select('id', { count: 'exact', head: true }).eq('status', 'draft');
      if (jobError) throw jobError;
      return count || 0;
    }));
  }

  await Promise.all(jobs);
  /* ⭐ ส่งสถานะรายคีย์ไปด้วย (`_attempted` / `_failed`) — ตัวเลขยังอยู่ชั้นบนสุดตามเดิม
     แท็บที่เปิดค้างไว้ก่อน deploy จึงอ่านได้เหมือนเดิมทุกอย่าง (ดู lib/nav/navCounts.js) */
  return ok(withCountStatus(counts, attempted, failed));
});
