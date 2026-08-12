// ── API ตัวเลขบนเมนูหลัก ─────────────────────────────────────────────────
// GET /api/nav/counts → { requests?, tasks?, rdRequests?, leads?, quotations?,
//                         salesOrders?, projectCloses?, scents?, formulas?, customers? }
//
// คีย์ที่ผู้ใช้ไม่มีสิทธิ์เห็น **ไม่ถูกส่งมาเลย** (ไม่ใช่ส่ง 0) — เมนูที่ถูกกรองทิ้ง
// อยู่แล้วไม่ต้องมีตัวเลข และเลข 0 ที่หลุดมาจะกลายเป็นป้ายเปล่าบนเมนูของคนอื่น
//
// ⚠️ อยู่บน **ทุกหน้า** เหมือนกระดิ่ง ⇒ กติกาเดียวกัน: พังที่นี่ต้องไม่ทำ header พัง
// ตัวนับตัวไหนพัง ส่งเท่าที่ได้ ไม่ล้มทั้งคำขอ
//
// ⚠️ ตัวเลขต้องตรงกับหน้าปลายทางเสมอ — ใช้ loadVisibleRequests + helper ชุดเดียว
// กับที่หน้าคิวใช้ ห้ามเขียนเงื่อนไข "รอฉันตอบ" ใหม่ที่นี่ (ดู lib/nav/navCounts.js)
import { withUser, ok, unauthorized } from '@/lib/http';
import {
  can, canAccessRd, canApproveMasterData, canViewRequests, normalizeDepartment,
} from '@/lib/permissions';
import { canViewLeads, applyLeadScope } from '@/lib/sales/leads';
import { loadRequests } from '@/lib/materialPricesAdmin';
import { loadVisibleRequests, answerableDepts } from '@/lib/requests/visibleRows';
import { DEPTS_WITH_OWN_MODULE, deptsInSharedQueue } from '@/lib/requests/modules';
import {
  QUOTATION_ACTIONABLE_STATUSES, isQuotationWaitingOnMe,
} from '@/lib/sales/quotationWorkflow';
import { isSalesOrderWaitingOnMe } from '@/lib/sales/salesOrderWorkflow';
import { canApproveProjectClose, isProjectCloseWaitingOnMe } from '@/lib/pm/projectClose';
import { isScentRegistrar } from '@/lib/master/scents';
import { isFormulaRegistrar } from '@/lib/master/formulas';
import { isClosedStage } from '@/lib/salesPlanning';
import {
  LEAD_TODO_STATUS, deptRequestsTodoCount, myTasksTodoCount, pruneZeroCounts, requestsTodoCount,
} from '@/lib/nav/navCounts';

export const dynamic = 'force-dynamic';

// งานส่วนตัวที่ฉันเกี่ยวข้อง — สามสาย ตรงกับที่ /api/pm/my-work ใช้กับ scope 'mine'
// (ownerId · assigneeId · proxyBy) · ตัด assignedBy ออกเพราะงานที่ "ฉันมอบให้คนอื่น"
// ไม่ใช่งานที่รอฉันทำ — มันอยู่แท็บ "มอบหมายโดยฉัน" ซึ่งไม่ได้ขึ้นเมนู
async function myOpenTasks(supabase, userId) {
  const columns = 'id,status,ownerId,assigneeId,proxyBy';
  const [{ data: byOwner }, { data: byAssignee }, { data: byProxy }] = await Promise.all([
    supabase.from('personal_tasks').select(columns).eq('ownerId', userId),
    supabase.from('personal_tasks').select(columns).eq('assigneeId', userId),
    supabase.from('personal_tasks').select(columns).eq('proxyBy', userId),
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

  if (canAccessRd(user)) {
    jobs.push(attempt('rdRequests', async () => {
      // ⚠️ ฝ่ายของผู้ใช้ใช้ได้เฉพาะเมื่อมันเป็นฝ่ายที่ **มีโมดูลของตัวเอง** —
      // admin สังกัดฝ่ายขาย (SA) ซึ่งไม่มีคิวโมดูล ⇒ ใช้ตรง ๆ แล้วจะได้ 0 เสมอ
      // ทั้งที่หน้า /rd/requests ตรงหน้าเขาโชว์ของค้างอยู่ (เจอตอนตรวจบนจอ)
      // ถอยไปฝ่ายแรกในลิสต์กลาง = ฝ่ายเดียวกับที่หน้านั้นเปิดให้ดู
      const own = normalizeDepartment(user.department);
      const dept = DEPTS_WITH_OWN_MODULE.includes(own) ? own : DEPTS_WITH_OWN_MODULE[0];
      return deptRequestsTodoCount(await loadRequests(supabase, { dept, lean: true }), dept);
    }));
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

    jobs.push(attempt('salesOrders', async () => {
      const { data } = await supabase
        .from('sales_orders')
        .select('id, status, createdBy')
        .eq('status', 'rejected')
        .eq('createdBy', user.id)
        .limit(5000);
      return (data || []).filter((row) => isSalesOrderWaitingOnMe(row, { userId: user.id })).length;
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

  // ลูกค้ารออนุมัติ — ผู้อนุมัติข้อมูลหลักเท่านั้น (canApproveMasterData)
  if (canApproveMasterData(user.role)) {
    jobs.push(attempt('customers', async () => {
      const { count } = await supabase
        .from('customers').select('id', { count: 'exact', head: true })
        .eq('approvalStatus', 'pending');
      return count || 0;
    }));
  }

  await Promise.all(jobs);
  return ok(pruneZeroCounts(counts));
});
