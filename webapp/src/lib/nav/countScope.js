// ── ขอบเขตของตัวเลขแต่ละคีย์ — "ของฉัน" กับ "ของฝ่าย/ของบริษัท" ไม่ใช่เรื่องเดียวกัน
//
// 🔴 **ห้ามเขียนว่า "รอคุณ" กับยอดที่ไม่ใช่งานส่วนตัว** (ADR 0016) — คิวของฝ่าย RD/FN/TS
//    ลีดของหัวหน้า/การตลาด อนุมัติข้อมูลหลัก และเลนภาษี เป็นยอด **ทั้งฝ่าย/ทั้งบริษัท**
//    ป้ายที่บอกว่า "รอคุณ 93" ทั้งที่เป็นคิวของทั้งฝ่าย คือป้ายที่โกหกคนอ่าน
//
// ⭐ คืน `null` = **route ไม่ยิงตัวนับนี้ให้คนนี้** ⇒ หน้าแรกไม่ต้องจองช่องตัวเลขให้แถวนั้น
//    ⚠️ ต้องถามด่าน **ตัวเดียวกับ** `app/api/nav/counts/route.js` ทุกคีย์ — ถามคนละด่าน
//    เมื่อไร หน้าแรกจะจองช่องให้แถวที่ไม่มีวันมีเลข (หรือไม่จอง แล้วชื่อเมนูตัดใหม่ตอนเลขมา)
//    ⚠️ รวมถึงจุดที่ route ใช้ `can(user.role, …)` ซึ่ง **ไม่อ่าน `extraCaps`** — ที่นี่ก็ต้องไม่อ่าน
//
// กติกาของ `'mine'`: เป็นของฉันได้ก็ต่อเมื่อ **ทุกเลน** ที่ตัวนับรวมให้คนนี้เป็นงานส่วนตัว
import {
  can, canApproveMasterData, canConfirmPayment, canDoFieldWork, canEditProduction,
  canEditService, canUser, canViewRequests, hasTeamScope, isReadOnlyObserver, isSuperuser,
} from '@/lib/permissions';
import { NAV_COUNT_KEYS } from '@/lib/nav/useNavCounts';
import { DEPT_QUEUE_COUNT_KEYS } from '@/lib/nav/navCounts';
import { answerableDepts } from '@/lib/requests/visibleRows';
import { deptHasOwnModule, deptsInSharedQueue } from '@/lib/requests/modules';
import { canViewLeads } from '@/lib/sales/leads';
import { salesPlanningViewScope } from '@/lib/salesPlanning';
import { canApproveExternalContract } from '@/lib/sales/contracts';
import { isSalesOrderReviewer } from '@/lib/sales/salesOrderWorkflow';
import { canApproveProjectClose } from '@/lib/pm/projectClose';
import { isScentRegistrar } from '@/lib/master/scents';
import { isFormulaRegistrar } from '@/lib/master/formulas';
import { deptOf, ownedStages } from '@/lib/excise/workflow';
import { isSystemAdmin } from '@/lib/issues/access';

/** ยอดรวมของทั้งฝ่าย/ทั้งบริษัทเมื่อเป็นแอดมิน — แอดมินเห็นของทุกคน ไม่ใช่ของตัวเอง */
const companyIfSuper = (user, otherwise) => (isSuperuser(user?.role) ? 'company' : otherwise);

/* ตัวตัดสินรายคีย์ — เรียงตามลำดับใน route เพื่อให้ไล่เทียบทีละบรรทัดได้ */
const SCOPE_RULES = {
  // งานส่วนตัวล้วน — helper ที่ตัวนับใช้กรองด้วย user.id ทุกตัว
  requests: (user) => (canViewRequests(user)
    // ตัวนับส่งคิวของฝ่ายที่ฉันตอบได้เข้ามารวมด้วย ⇒ ไม่ใช่ของฉันคนเดียวอีกต่อไป
    ? (deptsInSharedQueue(answerableDepts(user)).length ? 'dept' : 'mine')
    : null),
  tasks: (user) => (can(user?.role, 'pm:view') ? 'mine' : null),
  quotations: (user) => (can(user?.role, 'salesplan:view') ? 'mine' : null),
  visits: (user) => (canDoFieldWork(user) ? 'mine' : null),
  mgmtTasks: (user) => (can(user?.role, 'mgmt:view') ? 'mine' : null),

  // คิวของฝ่าย — งานของทั้งฝ่าย ใครในฝ่ายหยิบก็ได้
  ...Object.fromEntries(Object.entries(DEPT_QUEUE_COUNT_KEYS).map(([dept, key]) => [key,
    (user) => (canUser(user, 'requests:answer')
      && answerableDepts(user).filter(deptHasOwnModule).includes(dept) ? 'dept' : null)])),

  leads: (user) => {
    if (!canViewLeads(user)) return null;
    const role = user?.role;
    // ตรงกับ applyLeadScope ทีละสาขา (lib/sales/leads.js)
    if (isSuperuser(role) || isReadOnlyObserver(role) || role === 'marketing') return 'company';
    if (hasTeamScope(role)) return 'dept';
    if (role === 'ae') return 'mine';
    return null;   // สาขาสุดท้ายของ applyLeadScope กรองทิ้งทั้งหมด = ไม่มีเลขให้ดู
  },
  forecastReview: (user) => {
    if (!can(user?.role, 'salesplan:view')) return null;
    const scope = salesPlanningViewScope(user?.role);
    return scope === 'all' ? 'company' : (scope === 'team' ? 'dept' : 'mine');
  },
  contracts: (user) => (can(user?.role, 'salesplan:view')
    // AE Sup/แอดมิน รับรองใบของคนอื่นด้วย ⇒ ไม่ใช่ยอดของตัวเอง
    ? (canApproveExternalContract(user) ? 'company' : 'mine')
    : null),
  salesOrders: (user) => {
    if (!(can(user?.role, 'salesplan:view') || canConfirmPayment(user))) return null;
    return isSalesOrderReviewer(user?.role) || canConfirmPayment(user) ? 'company' : 'mine';
  },
  projectCloses: (user) => (canApproveProjectClose(user) ? 'company' : null),

  scents: (user) => (isScentRegistrar(user) ? companyIfSuper(user, 'dept') : null),
  formulas: (user) => (isFormulaRegistrar(user) ? companyIfSuper(user, 'dept') : null),
  customers: (user) => (canApproveMasterData(user?.role) ? 'company' : null),
  products: (user) => (canApproveMasterData(user?.role) ? 'company' : null),

  serviceIntake: (user) => (canEditService(user) ? companyIfSuper(user, 'dept') : null),
  payments: (user) => (canConfirmPayment(user) ? companyIfSuper(user, 'dept') : null),
  productionJobs: (user) => (canEditProduction(user) ? companyIfSuper(user, 'dept') : null),

  // เลนภาษีเป็นของ **ฝ่าย** (SA / RA) ไม่ใช่ของคนคนเดียว — แอดมินไม่เป็นเจ้าของขั้นไหนเลย
  taxRegistrations: (user) => taxScope(user, 'registration'),
  taxFilings: (user) => taxScope(user, 'payment'),

  // แจ้งปัญหา: แอดมินเห็นเรื่องที่ยังไม่มีใครรับ (ของทั้งบริษัท) · คนอื่นเห็นเรื่องของตัวเอง
  issues: (user) => (isSystemAdmin(user) ? 'company' : 'mine'),
};

function taxScope(user, trackKey) {
  if (!can(user?.role, 'history:view')) return null;
  return ownedStages(trackKey, deptOf(user?.role)).length ? 'dept' : null;
}

/**
 * ขอบเขตของตัวเลขคีย์หนึ่งสำหรับคนดูคนหนึ่ง
 * @returns `'mine' | 'dept' | 'company'` · `null` = คนนี้ไม่มีตัวนับคีย์นี้
 */
export function countScopeFor(key, user) {
  if (!user?.role) return null;
  return SCOPE_RULES[key]?.(user) ?? null;
}

/** คีย์ทั้งหมดที่มีกฎขอบเขต — ต้องครบเท่า `NAV_COUNT_KEYS` (เทสต์ล็อกไว้) */
export const COUNT_SCOPE_KEYS = Object.keys(SCOPE_RULES);

/** ขอบเขตของแถวเมนู (เมนูที่ไม่มีป้ายเลย = ไม่มีคีย์ ⇒ null) */
export function countScopeForHref(href, user) {
  const key = NAV_COUNT_KEYS[href];
  return key ? countScopeFor(key, user) : null;
}
