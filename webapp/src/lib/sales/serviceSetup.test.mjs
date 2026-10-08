// ── งานบริการรายบรรทัดของใบสั่งขาย (mig 0392 · PR-A) — ตัวตัดสินล้วน ทดสอบได้โดยไม่แตะ DB ──────────────
//
// สิ่งที่ชุดนี้ล็อกไว้: ชนิดของบรรทัด (D2) · ด่านยื่น (ข้อที่ยังขาด · fail-closed) · กติกางวด (D7/D8) ·
// ขั้นของงาน/ล็อก (D9/D25/D28) · ก้อนที่จอส่งมาบันทึก · ข้อความของโมดัล/แถบ/หัวใบ (ภาคผนวก A)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_BACKFILL_STATE_LABELS,
  SERVICE_DEFER_TEXT,
  SERVICE_DEFERRED_TEXT,
  SERVICE_KIND_OPTIONS,
  SERVICE_PERIOD_MODE_LINE,
  SERVICE_PERIOD_MODE_WHOLE,
  SERVICE_PERIOD_TEXT,
  SERVICE_SETUP_GRID_TEXT,
  SERVICE_REOPEN_BLOCKER_TEXT,
  SERVICE_REOPEN_TEXT,
  SERVICE_REOPENED_TEXT,
  SERVICE_SETUP_EDIT_TEXT,
  SERVICE_SETUP_ISSUE_TEXT,
  SERVICE_SETUP_LINE_TEXT,
  SERVICE_SETUP_LIMITS,
  SERVICE_SETUP_SQL_MESSAGES,
  isManualSalesLine,
  issuesByTab,
  lineCategoryCode,
  linePeriodOf,
  lineDerivedText,
  lineQtyCrossCheck,
  lineRoundsLowText,
  lineRoundsSentence,
  lineSetupTotals,
  lineTotalText,
  periodEndFromMonths,
  periodEnvelope,
  periodSpan,
  roundChipsFromPeriod,
  roundsLowOf,
  serviceBackfillAwaitingReview,
  serviceBackfillNeeded,
  serviceBackfillState,
  serviceBackfillSubmitPrompt,
  serviceDeferPrompt,
  serviceLineLabel,
  serviceLineRole,
  serviceLineRoleSource,
  serviceLinePeriod,
  servicePeriodCounters,
  servicePeriodModeOf,
  servicePeriodOf,
  serviceSetupApprovalChecklist,
  serviceSetupApprovalEffects,
  serviceSetupApprovalGate,
  serviceSetupAuditSnapshot,
  serviceSetupDeferSplit,
  serviceSetupDeferred,
  serviceSetupEditError,
  serviceSetupFieldId,
  serviceSetupFlow,
  serviceSetupFooterText,
  serviceSetupHeroFact,
  serviceSetupIssueGroup,
  serviceSetupIssues,
  serviceSetupRequired,
  serviceSetupRevisionLine,
  serviceSetupSkipMoneyIssues,
  serviceSetupSkipState,
  serviceSetupSqlIssues,
  serviceSetupSqlMessage,
  serviceSetupStripText,
  serviceSetupSubmitLine,
  serviceSetupTotals,
  serviceSetupView,
  serviceSetupWarnings,
  serviceRoundsText,
  serviceReopenAvailable,
  serviceReopenBlockedText,
  serviceReopenBlockers,
  serviceReopenFieldsText,
  serviceReopenMoneyCodes,
  serviceReopenMoneyIssues,
  serviceReopenPrompt,
  serviceReopenStateError,
  serviceSetupReopened,
  validServicePeriod,
  validateServiceSetupPatch,
} from './serviceSetup.js';
import { approvalPrompt } from '../approvalPrompt.js';
import { SERVICE_ROUND_CATEGORY, orderHasServiceRounds } from './serviceOrders.js';
import { effectiveBillingRule } from './billingRule.js';
import { bindTargetError } from '../service/intake.js';

/* ── ของจริงย่อส่วน ─────────────────────────────────────────────────────────────────────────────────── */

const SERVICE_DEAL = { id: 'DL1', line: 'SERVICE' };
const PRODUCT_DEAL = { id: 'DL2', line: 'PRODUCT' };
const STAMP = '2026-10-01T03:00:00Z';

const orderOf = (over = {}) => ({
  id: 'SO1', orderNumber: 'SO-26100005-0', status: 'draft', origin: 'pipeline', customerId: 'C1',
  dealId: 'DL1', deal: SERVICE_DEAL, projectId: null, project: null, totalAmount: 120000, actualAmount: 120000,
  servicePeriodFrom: null, servicePeriodTo: null, serviceTermsOpenedAt: null, serviceSetupState: null,
  supersededById: null, updatedAt: '2026-09-28T03:00:00Z', ...over,
});

/* QT-26090261-0: บรรทัด "เพิ่มรายการเอง" 10 บรรทัด · 12 แพ็คเกจ · ไม่มีหมวด */
const manual = (i, over = {}) => ({
  id: `SOL-${i}`, lineNo: i, sortOrder: i, quotationLineId: `QL-${i}`, fgCode: null, productId: null,
  description: '02-001 : ระบบกระจายกลิ่น', qty: 12, unit: 'แพ็คเกจ', metadata: { note: `สาขา ${i}` },
  serviceKind: null, serviceProductId: null, serviceFgCode: null, serviceRounds: null, ...over,
});
const fgLine = (i, fgCode, over = {}) => manual(i, { fgCode, productId: `PR-${i}`, description: 'ระบบกระจายกลิ่น · 1 package', ...over });

const PRODUCT = { id: 'P1', fgCode: 'FG-0521-02-001-00012', isActive: true, approvalStatus: 'approved', customerId: 'C1', name: 'SDS' };
const site = (id, over = {}) => ({ id, code: `ST-${id}`, name: `ไซต์ ${id}`, customerId: 'C1', kind: 'customer', isActive: true, ...over });
const zone = (id, siteId, over = {}) => ({ id, code: `ZN-${id}`, name: `Lobby ${id}`, siteId, isActive: true, ...over });
const alloc = (lineId, zoneId, packsPerRound = 1, sortOrder = 0) => ({ id: `SLZ-${lineId}-${zoneId}`, salesOrderLineId: lineId, zoneId, packsPerRound, sortOrder });

const done = (i, over = {}) => manual(i, {
  serviceKind: 'package', serviceProductId: 'P1', serviceFgCode: PRODUCT.fgCode, serviceRounds: 12, ...over,
});

/* 12 งวดรายเดือน 01/10/2026–30/09/2027 ครอบต่อกันพอดี */
const monthlyRows = (over = {}) => Array.from({ length: 12 }, (_, i) => {
  const from = new Date(Date.UTC(2026, 9 + i, 1));
  const to = new Date(Date.UTC(2026, 10 + i, 0));
  const iso = (d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  return { id: `I${i + 1}`, seq: i + 1, status: 'pending', amount: 10000, dueDate: iso(from), billingDate: null, billingEvent: null, coversFrom: iso(from), coversTo: iso(to), ...over };
});

function ctxOf({
  order = orderOf(), lines = [], allocations = [], zones = [], sites = [site('S1')], products = [PRODUCT],
  installments = monthlyRows(), customerBillingRule = null, fgOptionIds = new Set(['P1']), ...rest
} = {}) {
  return {
    order,
    lines,
    allocations,
    zonesById: new Map(zones.map((z) => [z.id, z])),
    sitesById: new Map(sites.map((s) => [s.id, s])),
    productsById: new Map(products.map((p) => [p.id, p])),
    fgOptions: products.map((p) => ({ ...p, ownerArCode: null })),
    fgOptionIds,
    siblingSites: [],
    installments,
    customerBillingRule,
    contract: null,
    liveTermsByZone: new Map(),
    predecessor: null,
    unsaved: false,
    ...rest,
  };
}

const PERIOD = { servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-09-30' };

/* ใบที่ตั้งครบ: 10 บรรทัด · บรรทัดละโซน · 1 แพ็ค/รอบ · 12 รอบ · ช่วงบริการ 12 เดือน · งวดครบ */
function completeCtx(over = {}) {
  const lines = Array.from({ length: 10 }, (_, k) => done(k + 1));
  const sites = Array.from({ length: 10 }, (_, k) => site(`S${k + 1}`));
  const zones = Array.from({ length: 10 }, (_, k) => zone(`Z${k + 1}`, `S${k + 1}`));
  const allocations = lines.map((line, k) => alloc(line.id, `Z${k + 1}`));
  return ctxOf({ order: orderOf(PERIOD), lines, sites, zones, allocations, ...over });
}

const keys = (issues) => issues.map((i) => i.key);

/* ══ ชนิดของบรรทัด (D2) ═════════════════════════════════════════════════════════════════════════════ */

test('หมวดของแพ็คเกจเท่ากับ SERVICE_ROUND_CATEGORY ของตัวตัดสินฝั่งเงิน', () => {
  assert.equal(SERVICE_ROUND_CATEGORY, '02-001');
  assert.equal(serviceLineRole(fgLine(1, 'FG-0521-02-001-00012')), 'package');
});

test('ชนิดของบรรทัด: ค่าที่เก็บ > FG > หมวดของบรรทัดพิมพ์เอง > ยังไม่รู้', () => {
  assert.equal(isManualSalesLine(manual(1)), true);
  assert.equal(isManualSalesLine(fgLine(1, 'FG-1-02-001-1')), false);
  assert.equal(isManualSalesLine({ productId: 'P9' }), false);

  assert.equal(serviceLineRole(manual(1)), 'unset');
  assert.equal(serviceLineRoleSource(manual(1)), 'none');
  const cat = manual(1, { metadata: { categoryCode: '02-001', categoryName: 'ระบบกระจายกลิ่น' } });
  assert.equal(serviceLineRole(cat), 'package');
  assert.equal(serviceLineRoleSource(cat), 'category');
  assert.equal(serviceLineRole(manual(1, { metadata: { categoryCode: '03-002' } })), 'not_service');
  // ค่าที่เก็บชนะหมวด
  const override = manual(1, { metadata: { categoryCode: '02-001' }, serviceKind: 'not_service' });
  assert.equal(serviceLineRole(override), 'not_service');
  assert.equal(serviceLineRoleSource(override), 'stored');
  // บรรทัด FG ตัดสินจากหมวดของ FG เสมอ
  assert.equal(serviceLineRole(fgLine(2, 'FG-260-02-011-0921')), 'not_service');
  assert.equal(serviceLineRoleSource(fgLine(2, 'FG-260-02-011-0921')), 'fg');
  assert.equal(serviceLineRole({ productId: 'P9', fgCode: null }), 'not_service');
  // alias ของ route รายการ (ไม่มี metadata ทั้งก้อน)
  assert.equal(serviceLineRole({ id: 'x', fgCode: null, productId: null, categoryCode: '02-001' }), 'package');
  assert.equal(lineCategoryCode({ fgCode: null, categoryCode: '02-001' }), '02-001');
  assert.equal(lineCategoryCode(fgLine(1, 'FG-015-02-001-0908')), '02-001');
});

/* ตารางความจริงเดียวกับ CASE ของ `sales_order_line_service_role` (0392) — ค่าว่าง '' = ไม่มี (NULLIF) · ไม่ trim */
test('ชนิดของบรรทัดตรงกับ sales_order_line_service_role ของฐานทุกกรณีขอบ', () => {
  const cases = [
    [{ serviceKind: 'package', fgCode: 'FG-1-03-002-1' }, 'package'],            // ค่าที่เก็บชนะ (CHECK กันไว้ที่ฐานอยู่แล้ว)
    [{ fgCode: '', productId: '' }, 'unset'],
    [{ fgCode: null, productId: 'P1' }, 'not_service'],                          // มีสินค้าแต่ไม่มีรหัส = FG ที่ไม่ใช่ 02-001
    [{ fgCode: 'FG-0233-02-001-00001', productId: null }, 'package'],
    [{ fgCode: null, productId: null, metadata: { categoryCode: '' } }, 'unset'],
    [{ fgCode: null, productId: null, metadata: { categoryCode: '02-001' } }, 'package'],
    [{ fgCode: null, productId: null, metadata: { categoryCode: 'X' } }, 'not_service'], // มีค่าแต่ไม่ใช่รหัสหมวด
    [{ fgCode: null, productId: null, metadata: null }, 'unset'],
  ];
  for (const [line, role] of cases) assert.equal(serviceLineRole(line), role, JSON.stringify(line));
});

test('คำอธิบายสั้นของบรรทัด: รหัส · 40 ตัวแรก (หมายเหตุ)', () => {
  assert.equal(serviceLineLabel(manual(4)), '02-001 : ระบบกระจายกลิ่น (สาขา 4)');
  assert.equal(serviceLineLabel(fgLine(1, 'FG-1-02-001-1', { metadata: {} })), 'FG-1-02-001-1 · ระบบกระจายกลิ่น · 1 package');
  const long = serviceLineLabel(manual(1, { description: 'ก'.repeat(60), metadata: {} }));
  assert.equal(long, `${'ก'.repeat(40)}…`);
});

/* ══ ข้อที่ยังขาด ══════════════════════════════════════════════════════════════════════════════════ */

test('QT-26090261-0: บรรทัดพิมพ์เอง 10 บรรทัดไม่มีหมวด = ยังไม่เลือกชนิด 10 ข้อ (ยังไม่มีแพ็คเกจ ⇒ ไม่ถามช่วงบริการ/งวด)', () => {
  const lines = Array.from({ length: 10 }, (_, k) => manual(k + 1));
  const issues = serviceSetupIssues(ctxOf({ lines }));
  assert.deepEqual(keys(issues), Array(10).fill('kind_missing'));
  assert.equal(issues[0].message, 'รายการ 1 · 02-001 : ระบบกระจายกลิ่น (สาขา 1): ยังไม่ตอบว่าเป็นงานบริการไหม (ใช่ / ไม่ใช่)');
  assert.deepEqual({ area: issues[0].area, tab: issues[0].tab, owner: issues[0].owner, field: issues[0].field, lineId: issues[0].lineId, lineNo: issues[0].lineNo },
    { area: 'lines', tab: 'overview', owner: 'SA', field: 'kind', lineId: 'SOL-1', lineNo: 1 });
});

test('บรรทัดเดียวกันแต่มีหมวด 02-001 (#1844) = แพ็คเกจ · ขาดแพ็คเกจ ×10 ไม่ใช่ขาดชนิด (เท่ากับ PGlite ข้อ 9)', () => {
  const lines = Array.from({ length: 10 }, (_, k) => manual(k + 1, { metadata: { categoryCode: '02-001' } }));
  const issues = serviceSetupIssues(ctxOf({ lines }));
  assert.equal(issues.filter((i) => i.key === 'fg_missing').length, 10);
  assert.equal(issues.filter((i) => i.key === 'kind_missing').length, 0);
  assert.ok(keys(issues).includes('rounds_missing'));
  assert.ok(keys(issues).includes('zones_missing'));
  assert.ok(keys(issues).includes('period_missing'));
  assert.equal(issues.find((i) => i.key === 'fg_missing').message, 'รายการ 1: ยังไม่เลือกแพ็คเกจ (FG หมวด 02-001)');
});

test('หมวดอื่น (03-002) = ไม่ใช่งานบริการ ไม่มีข้อที่ต้องทำ · ชนิดที่เก็บไว้ชนะหมวด', () => {
  assert.deepEqual(serviceSetupIssues(ctxOf({ lines: [manual(1, { metadata: { categoryCode: '03-002' } })] })), []);
  const stored = manual(1, { metadata: { categoryCode: '02-001' }, serviceKind: 'not_service' });
  assert.deepEqual(serviceSetupIssues(ctxOf({ lines: [stored] })), []);
});

test('ใบที่ตั้งครบ = ผ่าน · หนึ่งบรรทัด 57 โซนรวมตัวเลขถูก', () => {
  assert.deepEqual(serviceSetupIssues(completeCtx()), []);
  const sites = Array.from({ length: 26 }, (_, k) => site(`S${k}`));
  const zones = Array.from({ length: 57 }, (_, k) => zone(`Z${k}`, `S${k % 26}`));
  const line = done(1, { qty: 57, serviceRounds: 12 });
  const allocations = zones.map((z, k) => alloc(line.id, z.id, k % 2 ? 2 : 1, k));
  const ctx = ctxOf({ order: orderOf(PERIOD), lines: [line], sites, zones, allocations });
  assert.deepEqual(serviceSetupIssues(ctx), []);
  const lt = lineSetupTotals(line, ctx);
  assert.deepEqual(lt, { zones: 57, sites: 26, packsPerRound: 29 + 28 * 2, packsTotal: (29 + 56) * 12, rounds: 12 });
  const totals = serviceSetupTotals(ctx);
  assert.equal(totals.zones, 57);
  assert.equal(totals.sites, 26);
  assert.equal(totals.packsPerRound, 85);
  assert.equal(totals.packsTotal, 1020);
  assert.equal(totals.completeLines, 1);
});

test('ใบที่ไม่มีแพ็คเกจเลย (ทุกบรรทัดไม่ใช่งานบริการ) = ผ่าน ไม่ต้องมีช่วงบริการ', () => {
  const lines = [manual(1, { serviceKind: 'not_service' }), fgLine(2, 'FG-0233-03-002-00001')];
  assert.deepEqual(serviceSetupIssues(ctxOf({ lines, installments: [] })), []);
});

test('ใบยอด 0 ที่มีแพ็คเกจ: ขาดแค่ช่วงบริการ ไม่มีข้อเรื่องงวด', () => {
  const ctx = completeCtx({ order: orderOf({ totalAmount: 0 }), installments: [] });
  assert.deepEqual(keys(serviceSetupIssues(ctx)), ['period_missing']);
  assert.equal(serviceSetupIssues(ctx)[0].message, 'ยังไม่ใส่ช่วงบริการ (วันเริ่ม–วันสิ้นสุด)');
});

test('ยังไม่มีงวดชำระ = ข้อเดียวของแท็บการชำระ', () => {
  const issues = serviceSetupIssues(completeCtx({ installments: [] }));
  assert.deepEqual(keys(issues), ['installments_missing']);
  assert.equal(issues[0].tab, 'payment');
  assert.equal(issues[0].message, 'ยังไม่มีงวดชำระ — กด ‘เริ่มติดตามการชำระ’ ที่แท็บการชำระ');
});

test('งวดผูกเหตุการณ์ (ไม่มีกำหนดชำระ) ผ่าน · ไม่มีทั้งสองอย่าง = ขาดกำหนดชำระ', () => {
  const rows = monthlyRows();
  rows[2] = { ...rows[2], dueDate: null, billingEvent: 'หลังติดตั้ง' };
  assert.deepEqual(serviceSetupIssues(completeCtx({ installments: rows })), []);
  rows[3] = { ...rows[3], dueDate: null };
  const issues = serviceSetupIssues(completeCtx({ installments: rows }));
  assert.deepEqual(keys(issues), ['due_missing']);
  assert.deepEqual([issues[0].installmentId, issues[0].seq, issues[0].field], ['I4', 4, 'dueDate']);
  assert.equal(issues[0].message, 'งวด 4: ยังไม่ใส่กำหนดชำระ — หรือเลือก ‘รอเหตุการณ์’');
});

test('ลูกค้ามีรอบวางบิลรายเดือน: ต้องมีวันวางบิลหรือเหตุการณ์ · ลูกค้าไม่มีเครดิตไม่ต้อง', () => {
  const monthly = { billing: { mode: 'monthly', days: [25] }, payment: { mode: 'credit', days: 30 } };
  const rows = monthlyRows();
  const issues = serviceSetupIssues(completeCtx({ installments: rows, customerBillingRule: monthly }));
  assert.equal(issues.filter((i) => i.key === 'billing_missing').length, 12);
  assert.equal(issues[0].message, 'งวด 1: ยังไม่เลือกรอบวางบิล (ลูกค้ามีรอบวางบิล)');
  const billed = rows.map((r) => ({ ...r, billingDate: r.dueDate }));
  assert.deepEqual(serviceSetupIssues(completeCtx({ installments: billed, customerBillingRule: monthly })), []);
  const event = rows.map((r) => ({ ...r, billingEvent: 'ก่อนส่งสินค้า' }));
  assert.deepEqual(serviceSetupIssues(completeCtx({ installments: event, customerBillingRule: monthly })), []);
  assert.deepEqual(serviceSetupIssues(completeCtx({ installments: rows, customerBillingRule: { credit: false } })), []);
});

test('D7 ตามกติกาของ #1846 (effectiveBillingRule): วันวางบิลบังคับเฉพาะลูกค้าเครดิต · ไม่มีเครดิต/ยังไม่ตั้ง = กำหนดชำระพอ', () => {
  /* ไม่มีเครดิต = "วางบิลได้ทุกวัน + ชำระวันวางบิล" (มติ 28/09 ข้อ 17) — รูปที่อ่านแล้วส่งกลับเข้ามาต้องยังเป็นไม่มีเครดิต
     (ไม่ใช่ "ทุกวัน + เครดิต 0 วัน" ที่ขอวันวางบิล · B3) */
  const noCredit = effectiveBillingRule({ credit: false });
  assert.equal(noCredit.noCredit, true);
  for (const rule of [null, { credit: false }, { credit: false, note: 'โอนทันที' }, noCredit]) {
    assert.deepEqual(serviceSetupIssues(completeCtx({ customerBillingRule: rule })), [], JSON.stringify(rule));
  }
  const rows = monthlyRows();
  rows[0] = { ...rows[0], dueDate: null };
  assert.deepEqual(keys(serviceSetupIssues(completeCtx({ installments: rows, customerBillingRule: noCredit }))), ['due_missing'],
    'ไม่มีเครดิต: ขาดแค่กำหนดชำระ ไม่ขอวันวางบิล');
  // ลูกค้าเครดิต — รูปดิบและรูปที่อ่านแล้วได้ผลเดียวกัน · รายเดือน/ทุกวันบอกรูปของรอบให้แผงรวมข้อ
  const anyday = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } };
  const monthly = { billing: { mode: 'monthly', days: [10, 25] }, payment: { mode: 'credit', days: 30 } };
  for (const [rule, mode] of [[anyday, 'anyday'], [effectiveBillingRule(anyday), 'anyday'], [monthly, 'monthly'], [effectiveBillingRule(monthly), 'monthly']]) {
    const billing = serviceSetupIssues(completeCtx({ customerBillingRule: rule })).filter((i) => i.key === 'billing_missing');
    assert.equal(billing.length, 12, JSON.stringify(rule));
    assert.ok(billing.every((i) => i.billingMode === mode), mode);
  }
});

test('D7 ลำดับข้อของงวดเดียว = วันวางบิล → กำหนดชำระ (ลำดับคอลัมน์ของตารางงวด #1846)', () => {
  const credit = { billing: { mode: 'monthly', days: [25] }, payment: { mode: 'credit', days: 30 } };
  const rows = monthlyRows();
  rows[1] = { ...rows[1], dueDate: null };
  const issues = serviceSetupIssues(completeCtx({ installments: rows, customerBillingRule: credit }));
  assert.deepEqual(issues.filter((i) => i.seq === 2).map((i) => i.key), ['billing_missing', 'due_missing']);
  assert.deepEqual(issues.slice(0, 3).map((i) => [i.key, i.seq]), [['billing_missing', 1], ['billing_missing', 2], ['due_missing', 2]]);
});

test('งวดที่บัญชีรับรองแล้วไม่มีช่วงครอบ = คำเตือนของบัญชี ไม่ใช่ข้อที่บล็อก', () => {
  const rows = monthlyRows();
  rows[0] = { ...rows[0], status: 'confirmed', coversFrom: null, coversTo: null };
  const ctx = completeCtx({ installments: rows });
  assert.deepEqual(serviceSetupIssues(ctx), []);
  const warnings = serviceSetupWarnings(ctx);
  assert.deepEqual(warnings.map((w) => [w.key, w.owner, w.seq, w.tag]), [['fn_coverage_missing', 'FN', 1, 'รอฝ่ายบัญชี']]);
  assert.equal(warnings[0].message, 'งวด 1 (บัญชีรับรองแล้ว): ยังไม่มีช่วงครอบ — ฝ่ายบัญชีกรอกที่แผงงวด');
});

test('ช่วงครอบขาด / เริ่มช้า / จบสั้น = บล็อก พร้อมวันที่', () => {
  const gap = monthlyRows();
  gap[5] = { ...gap[5], coversFrom: '2027-03-10' };
  const g = serviceSetupIssues(completeCtx({ installments: gap }));
  assert.deepEqual(keys(g), ['coverage_gap']);
  assert.equal(g[0].message, 'ช่วงครอบขาด 01/03/2027–09/03/2027');
  assert.deepEqual([g[0].installmentId, g[0].seq, g[0].field, g[0].tab], ['I6', 6, 'coverage', 'payment']);

  const late = monthlyRows();
  late[0] = { ...late[0], coversFrom: '2026-10-05' };
  assert.equal(serviceSetupIssues(completeCtx({ installments: late }))[0].message, 'งวดแรกครอบไม่ตรงวันเริ่มบริการ (01/10/2026–04/10/2026)');

  const short = monthlyRows();
  short[11] = { ...short[11], coversTo: '2027-09-20' };
  const s = serviceSetupIssues(completeCtx({ installments: short }));
  assert.deepEqual(keys(s), ['coverage_end']);
  assert.equal(s[0].message, 'ช่วงครอบไม่ตรงวันสิ้นสุดบริการ (21/09/2027–30/09/2027)');
});

test('ช่วงครอบซ้อน = เตือน (ไม่บล็อก) บอกงวดคู่', () => {
  const rows = monthlyRows();
  rows[1] = { ...rows[1], coversFrom: '2026-10-25' };
  const ctx = completeCtx({ installments: rows });
  assert.deepEqual(serviceSetupIssues(ctx), []);
  const [w] = serviceSetupWarnings(ctx);
  assert.equal(w.key, 'coverage_overlap');
  assert.equal(w.owner, 'SA');
  assert.deepEqual([w.tab, serviceSetupFieldId(w)], ['payment', 'inst-I2-coverage']);
  assert.equal(w.message, 'งวด 1 กับ งวด 2 ครอบซ้อน 25/10/2026–31/10/2026');
});

test('งวดที่ยังไม่รับรองขาดช่วงครอบ = บอกเฉพาะงวดที่ขาด ไม่มีช่องโหว่ปลอม', () => {
  const rows = monthlyRows();
  rows[4] = { ...rows[4], coversFrom: null, coversTo: null };
  rows[7] = { ...rows[7], coversTo: null };
  const issues = serviceSetupIssues(completeCtx({ installments: rows }));
  assert.deepEqual(keys(issues), ['coverage_missing', 'coverage_missing']);
  assert.equal(issues[0].message, 'งวด 5: ยังไม่ใส่ช่วงครอบบริการ');
  assert.deepEqual(serviceSetupWarnings(completeCtx({ installments: rows })), []);
});

test('งวดคืนเงินแล้วไม่นับ', () => {
  const rows = [...monthlyRows(), { id: 'I99', seq: 13, status: 'confirmed', amount: 1, refundedAt: '2026-10-02T00:00:00Z', coversFrom: null, coversTo: null }];
  const ctx = completeCtx({ installments: rows });
  assert.deepEqual(serviceSetupIssues(ctx), []);
  assert.deepEqual(serviceSetupWarnings(ctx), []);
});

test('โซนปิดใช้งาน / โซนของลูกค้ารายอื่น = โซนใช้ไม่ได้ ด้วยข้อความของ bindTargetError', () => {
  const ctx = completeCtx();
  ctx.zonesById.set('Z3', zone('Z3', 'S3', { isActive: false }));
  ctx.sitesById.set('S5', site('S5', { customerId: 'C9' }));
  const issues = serviceSetupIssues(ctx);
  assert.deepEqual(keys(issues), ['zone_invalid', 'zone_invalid']);
  const expected3 = bindTargetError({ order: ctx.order, zone: ctx.zonesById.get('Z3'), site: ctx.sitesById.get('S3') });
  assert.equal(issues[0].message, `รายการ 3: ${expected3}`);
  assert.deepEqual([issues[0].lineId, issues[0].zoneId, issues[0].field], ['SOL-3', 'Z3', 'zones']);
  assert.match(issues[1].message, /^รายการ 5: .*ลูกค้ารายอื่น/);
});

test('แพ็คเกจไม่อยู่ในตัวเลือก FG ของนิติบุคคล = ของนิติบุคคลอื่น', () => {
  const issues = serviceSetupIssues(completeCtx({ fgOptionIds: new Set(['P-other']) }));
  assert.equal(issues.length, 10);
  assert.equal(issues[0].key, 'fg_foreign');
  assert.equal(issues[0].message, 'รายการ 1: แพ็คเกจ FG-0521-02-001-00012 เป็นของนิติบุคคลอื่น — เลือก FG ของลูกค้าในใบ');
});

test('แพ็คเกจปิดใช้งาน/ยังไม่อนุมัติ/ไม่ใช่ 02-001 = ใช้ไม่ได้แล้ว', () => {
  for (const product of [{ ...PRODUCT, isActive: false }, { ...PRODUCT, approvalStatus: 'pending' }, { ...PRODUCT, fgCode: 'FG-0521-02-002-00012' }]) {
    const issues = serviceSetupIssues(completeCtx({ products: [product] }));
    assert.equal(issues[0].key, 'fg_invalid');
    assert.equal(issues[0].message, 'รายการ 1: แพ็คเกจ FG-0521-02-001-00012 ใช้ไม่ได้แล้ว (ปิดใช้งาน/ยังไม่อนุมัติ/ไม่ใช่หมวด 02-001) — เลือกใหม่');
  }
});

test('D30: สินค้าถูกลบ (serviceProductId เป็น null แต่ serviceFgCode ค้าง) = ยังไม่เลือกแพ็คเกจ', () => {
  const ctx = completeCtx();
  ctx.lines[0] = { ...ctx.lines[0], serviceProductId: null, serviceFgCode: 'FG-0521-02-001-00012' };
  const issues = serviceSetupIssues(ctx);
  assert.deepEqual(keys(issues), ['fg_missing']);
  assert.equal(issues[0].lineId, 'SOL-1');
});

test('ขาด รอบละกี่แพ็ค / จำนวนรอบบริการ / โซน · โซนค้างบนบรรทัดที่ไม่ใช่งานบริการ', () => {
  const ctx = completeCtx();
  ctx.allocations[1] = { ...ctx.allocations[1], packsPerRound: null };
  ctx.lines[2] = { ...ctx.lines[2], serviceRounds: null };
  ctx.allocations = ctx.allocations.filter((a) => a.salesOrderLineId !== 'SOL-4');
  ctx.lines[5] = { ...ctx.lines[5], serviceKind: 'not_service' };
  const issues = serviceSetupIssues(ctx);
  assert.deepEqual(issues.map((i) => [i.key, i.lineNo, i.zoneId ?? null]), [
    ['packs_missing', 2, 'Z2'],
    ['rounds_missing', 3, null],
    ['zones_missing', 4, null],
    ['zones_on_not_service', 6, null],
  ]);
  assert.equal(issues[0].message, 'รายการ 2 · Lobby Z2: ยังไม่ใส่รอบละกี่แพ็ค');
  assert.equal(issues[1].message, 'รายการ 3: ยังไม่ใส่จำนวนรอบบริการ');
  assert.equal(issues[3].message, 'รายการ 6: ตอบว่าไม่ใช่งานบริการแต่ยังมีโซนค้าง — บันทึกงานบริการใหม่');
});

test('ctx.unsaved = ข้อเดียว "ยังไม่บันทึก" ไม่ตรวจอย่างอื่น', () => {
  const issues = serviceSetupIssues({ ...ctxOf({ lines: [manual(1)] }), unsaved: true });
  assert.deepEqual(keys(issues), ['unsaved']);
  assert.equal(issues[0].message, 'มีการแก้ไขงานบริการที่ยังไม่บันทึก — กด ‘บันทึกงานบริการ’ ก่อนยื่น');
});

test('🔴 ไม่ได้โหลดตัวเลือก FG = throw (fail-closed) ไม่ใช่ข้ามข้อ "นิติบุคคลอื่น"', () => {
  assert.throws(() => serviceSetupIssues(completeCtx({ fgOptionIds: null })),
    { message: 'serviceSetupIssues: ctx.fgOptionIds ต้องโหลดมาก่อน (withFgOptions)' });
  assert.throws(() => serviceSetupIssues({}), /withFgOptions/);
});

test('ข้อรายแท็บ + id ของช่อง', () => {
  const rows = monthlyRows();
  rows[0] = { ...rows[0], coversFrom: null };
  const ctx = completeCtx({ installments: rows });
  ctx.allocations[0] = { ...ctx.allocations[0], packsPerRound: null };
  ctx.order = { ...ctx.order, servicePeriodFrom: null, servicePeriodTo: null };
  const issues = serviceSetupIssues(ctx);
  assert.deepEqual(issuesByTab(issues), { overview: 2, payment: 1 });
  assert.deepEqual(issues.map(serviceSetupFieldId), ['svc-zone-SOL-1-Z1-packs', 'svc-period', 'inst-I1-coverage']);
  assert.equal(serviceSetupFieldId({ key: 'kind_missing', field: 'kind', lineId: 'SOL-9' }), 'svc-line-SOL-9-kind');
  assert.equal(serviceSetupFieldId({ key: 'installments_missing', field: null }), null);
  assert.equal(serviceSetupFieldId('period'), 'svc-period');
});

test('รหัสจากฐาน → ข้อภาษาไทยพร้อมเลขรายการ', () => {
  const ctx = completeCtx();
  ctx.lines[0] = { ...ctx.lines[0], serviceKind: null };
  const issues = serviceSetupSqlIssues(['kind_missing:SOL-1', 'packs_missing:SOL-1:Z1', 'period_missing', 'fg_invalid:SOL-2', 'zone_invalid:SOL-3:Z3'], ctx);
  assert.deepEqual(issues.map((i) => [i.key, i.lineNo ?? null, i.zoneId ?? null]), [
    ['kind_missing', 1, null], ['packs_missing', 1, 'Z1'], ['period_missing', null, null], ['fg_invalid', 2, null], ['zone_invalid', 3, 'Z3'],
  ]);
  assert.equal(issues[0].message, 'รายการ 1 · 02-001 : ระบบกระจายกลิ่น (สาขา 1): ยังไม่ตอบว่าเป็นงานบริการไหม (ใช่ / ไม่ใช่)');
  assert.equal(issues[1].message, 'รายการ 1 · Lobby Z1: ยังไม่ใส่รอบละกี่แพ็ค');
  assert.equal(issues[2].message, 'ยังไม่ใส่ช่วงบริการ (วันเริ่ม–วันสิ้นสุด)');
  assert.match(issues[3].message, /^รายการ 2: แพ็คเกจ FG-0521-02-001-00012 ใช้ไม่ได้แล้ว/);
  // รับ DETAIL ดิบ (CSV) ได้ด้วย
  assert.equal(serviceSetupSqlIssues('rounds_missing:SOL-2,zones_missing:SOL-2', ctx).length, 2);
});

test('ทุกรหัสข้อที่ยังขาด/คำเตือนมีข้อความ · ข้อความของฐานไม่มีคีย์ที่เป็นสตริงย่อยของอีกคีย์', () => {
  for (const key of ['kind_missing', 'fg_missing', 'fg_invalid', 'fg_foreign', 'zones_missing', 'packs_missing', 'zone_invalid',
    'zones_on_not_service', 'rounds_missing', 'period_missing', 'installments_missing', 'due_missing', 'billing_missing',
    'coverage_missing', 'coverage_start', 'coverage_gap', 'coverage_end', 'unsaved', 'coverage_overlap', 'fn_coverage_missing', 'rounds_low']) {
    assert.equal(typeof SERVICE_SETUP_ISSUE_TEXT[key], 'function', key);
    assert.ok(SERVICE_SETUP_ISSUE_TEXT[key]({ n: 1, seq: 1, a: 1, b: 2 }).length > 0, key);
  }
  const codes = Object.keys(SERVICE_SETUP_SQL_MESSAGES);
  for (const a of codes) for (const b of codes) if (a !== b) assert.ok(!b.includes(a), `${a} อยู่ใน ${b}`);
  for (const [code, { message, status }] of Object.entries(SERVICE_SETUP_SQL_MESSAGES)) {
    assert.ok(message && [400, 403, 404, 409].includes(status), code);
  }
  assert.deepEqual(serviceSetupSqlMessage({ message: 'P0001: workflow_stale' }),
    { code: 'workflow_stale', message: 'ใบนี้ถูกแก้จากอีกหน้าต่าง — โหลดข้อมูลล่าสุดแล้ว', status: 409 });
  assert.equal(serviceSetupSqlMessage(new Error('something else')), null);
});

/* ══ ขั้นของงาน · ล็อก (D9/D25/D28) ═══════════════════════════════════════════════════════════════════ */

test('ต้องตั้งเฉพาะใบ pipeline บนสาย SERVICE', () => {
  assert.equal(serviceSetupRequired(orderOf()), true);
  assert.equal(serviceSetupRequired(orderOf({ deal: PRODUCT_DEAL, dealId: 'DL2' })), false);
  assert.equal(serviceSetupRequired(orderOf({ deal: { id: 'DL1', line: null } })), false);
  assert.equal(serviceSetupRequired(orderOf({ origin: 'historical' })), false);
  assert.equal(serviceSetupRequired(null), false);
  // ค่าที่ตัวโหลดคิดไว้ให้ (order.businessLine) ใช้ได้เมื่อไม่มีก้อนดีล/โครงการแนบ
  assert.equal(serviceSetupRequired({ origin: 'pipeline', businessLine: 'SERVICE' }), true);
  assert.equal(serviceSetupRequired({ origin: 'pipeline', businessLine: 'PRODUCT' }), false);
  // คิวหลายใบส่ง Map
  const ctx = { projectsById: new Map([['PJ', { id: 'PJ', line: 'SERVICE' }]]), dealsById: new Map() };
  assert.equal(serviceSetupRequired({ origin: 'pipeline', projectId: 'PJ' }, ctx), true);
});

test('ขั้นของงาน: pipeline / backfill / stamped / locked / none', () => {
  const lines = [manual(1)];
  assert.equal(serviceSetupFlow(orderOf({ status: 'draft' }), { lines }), 'pipeline');
  assert.equal(serviceSetupFlow(orderOf({ status: 'rejected' }), { lines }), 'pipeline');
  assert.equal(serviceSetupFlow(orderOf({ status: 'approved' }), { lines }), 'backfill');
  assert.equal(serviceSetupFlow(orderOf({ status: 'approved', serviceTermsOpenedAt: STAMP }), { lines }), 'stamped');
  for (const status of ['pending_approval', 'approval_revoked', 'revised', 'cancelled']) {
    assert.equal(serviceSetupFlow(orderOf({ status }), { lines }), 'locked', status);
  }
  assert.equal(serviceSetupFlow(orderOf({ deal: PRODUCT_DEAL }), { lines }), 'none');
  // ไม่ส่ง ctx.lines ใช้ order.lines
  assert.equal(serviceSetupFlow(orderOf({ status: 'approved', lines })), 'backfill');
});

test('D25: ใบอนุมัติแล้วที่ทุกบรรทัดเป็น FG หมวด 03 = ไม่มีอะไรให้ตั้ง (none) ไม่ขึ้นที่ไหนเลย', () => {
  const lines = [fgLine(1, 'FG-0233-03-002-00001'), fgLine(2, 'FG-0233-03-001-00002')];
  const order = orderOf({ status: 'approved' });
  assert.equal(serviceSetupFlow(order, { lines }), 'none');
  assert.equal(serviceBackfillNeeded(order, lines), false);
  // บรรทัดยังไม่รู้ชนิด 1 บรรทัดก็พอให้ต้องตั้ง
  assert.equal(serviceBackfillNeeded(order, [...lines, manual(3)]), true);
  assert.equal(serviceBackfillNeeded(orderOf({ status: 'approved', serviceTermsOpenedAt: STAMP }), [manual(3)]), false);
  assert.equal(serviceBackfillNeeded(orderOf({ status: 'approved', supersededById: 'SO2' }), [manual(3)]), false);
  assert.equal(serviceBackfillNeeded(orderOf({ status: 'approved', origin: 'historical' }), [manual(3)]), false);
  assert.equal(serviceBackfillNeeded(orderOf({ status: 'draft' }), [manual(3)]), false);
});

test('D28: รอผู้จัดการตรวจ = อนุมัติอยู่ · ไม่ถูก Rev. ทับ · ยังไม่ประทับ · ยื่นแล้ว · ไม่ใช่ใบย้อนหลัง', () => {
  const submitted = orderOf({ status: 'approved', serviceSetupState: 'submitted', serviceSetupSubmittedAt: STAMP });
  assert.equal(serviceBackfillAwaitingReview(submitted), true);
  for (const status of ['approval_revoked', 'revised', 'cancelled']) {
    assert.equal(serviceBackfillAwaitingReview({ ...submitted, status }), false, `ค่าค้างบนใบ ${status} ต้องไม่มีผล`);
  }
  assert.equal(serviceBackfillAwaitingReview({ ...submitted, serviceTermsOpenedAt: STAMP }), false);
  assert.equal(serviceBackfillAwaitingReview({ ...submitted, supersededById: 'SO2' }), false);
  assert.equal(serviceBackfillAwaitingReview({ ...submitted, origin: 'historical' }), false);
  assert.equal(serviceBackfillAwaitingReview({ ...submitted, serviceSetupState: 'rejected' }), false);
  assert.equal(serviceBackfillAwaitingReview(null), false);
});

test('สถานะการตั้งย้อนหลัง: ยื่นแล้ว / ตีกลับ / กำลังตั้ง / ยังไม่เริ่ม', () => {
  const approved = orderOf({ status: 'approved' });
  assert.equal(serviceBackfillState({ ...approved, serviceSetupState: 'submitted' }), 'submitted');
  assert.equal(serviceBackfillState({ ...approved, serviceSetupState: 'rejected' }), 'rejected');
  assert.equal(serviceBackfillState(approved, { hasDraftData: true }), 'editing');
  assert.equal(serviceBackfillState(approved), 'not_started');
  // ค่าค้าง 'submitted' บนใบที่ย้อนการอนุมัติแล้ว ไม่ใช่ "รอตรวจ"
  assert.equal(serviceBackfillState({ ...approved, status: 'approval_revoked', serviceSetupState: 'submitted' }), 'not_started');
});

test('แก้ได้ไหม (ภาคผนวก A.3) — กติกาเดียวกับ sales_order_service_setup_editable', () => {
  const can = { canEdit: true };
  assert.equal(serviceSetupEditError(orderOf(), { canEdit: false }), 'ตั้งงานบริการได้เฉพาะฝ่ายขายที่ดูแลใบนี้');
  assert.equal(serviceSetupEditError(orderOf({ deal: PRODUCT_DEAL }), can), 'ใบนี้ไม่ใช่ใบสายบริการ — ไม่มีงานบริการให้ตั้ง');
  assert.equal(serviceSetupEditError(orderOf({ status: 'draft' }), can), null);
  assert.equal(serviceSetupEditError(orderOf({ status: 'rejected' }), can), null);
  assert.equal(serviceSetupEditError(orderOf({ status: 'pending_approval' }), can), 'รออนุมัติ — ดึงกลับก่อนแก้');
  assert.equal(serviceSetupEditError(orderOf({ status: 'approval_revoked' }), can), 'ย้อนการอนุมัติแล้ว — ออก Rev. แล้วแก้ที่ใบ Rev.');
  assert.equal(serviceSetupEditError(orderOf({ status: 'approved' }), can), null);
  assert.equal(serviceSetupEditError(orderOf({ status: 'approved', serviceSetupState: 'rejected' }), can), null);
  assert.equal(serviceSetupEditError(orderOf({ status: 'approved', serviceSetupState: 'submitted' }), can),
    'ยื่นตรวจงานบริการแล้ว — รอผู้จัดการฝ่ายขายตรวจ (ตีกลับก่อนจึงแก้ได้)');
  assert.equal(serviceSetupEditError(orderOf({ status: 'approved', serviceTermsOpenedAt: STAMP }), can),
    'อนุมัติแล้ว — แพ็คเกจ/โซน/รอบละกี่แพ็ค/ช่วงบริการล็อก · เปิดแก้ด้วย ‘แก้งานบริการ’ (ก่อน TS เริ่มงาน) หรือย้อนการอนุมัติแล้วออก Rev. (จำนวนรอบบริการยังแก้ได้)');
  for (const status of ['revised', 'cancelled']) {
    assert.equal(serviceSetupEditError(orderOf({ status }), can), 'ใบนี้ปิดไปแล้ว — แก้งานบริการไม่ได้');
  }
  assert.equal(serviceSetupEditError(orderOf({ status: 'approved', supersededById: 'SO2' }), can), 'ใบนี้ปิดไปแล้ว — แก้งานบริการไม่ได้');
});

test('ช่วงบริการของใบ: pipeline จากหัวใบ · ย้อนหลังจากสัญญา', () => {
  assert.deepEqual(servicePeriodOf(orderOf(PERIOD)), { from: '2026-10-01', to: '2027-09-30' });
  assert.equal(servicePeriodOf(orderOf({ servicePeriodFrom: '2026-10-01' })), null);
  assert.deepEqual(servicePeriodOf({ origin: 'historical' }, { effectiveDate: '2026-01-01', expiryDate: '2026-12-31' }),
    { from: '2026-01-01', to: '2026-12-31' });
  assert.equal(servicePeriodOf({ origin: 'historical' }, null), null);
});

/* ══ ช่วงบริการ: ชิป/ข้อความ ══════════════════════════════════════════════════════════════════════════ */

test('ชิปรอบจากช่วงบริการ', () => {
  assert.deepEqual(roundChipsFromPeriod({ from: '2026-10-01', to: '2027-09-30' }).map((c) => [c.key, c.rounds, c.label]), [
    ['monthly', 12, 'ทุกเดือน ≈ 12'], ['biweekly', 26, 'ทุก 2 สัปดาห์ ≈ 26'], ['quarterly', 4, 'ทุกไตรมาส ≈ 4'],
  ]);
  const odd = roundChipsFromPeriod({ from: '2026-09-02', to: '2027-09-25' });
  assert.equal(odd.find((c) => c.key === 'monthly').rounds, 12);
  assert.equal(odd.find((c) => c.key === 'biweekly').rounds, 27);
  assert.deepEqual(roundChipsFromPeriod(null), []);
  assert.deepEqual(roundChipsFromPeriod({ from: '2026-10-01' }), []);
});

test('ความยาวช่วง + วันสิ้นสุดจากชิป "12 เดือน"', () => {
  assert.deepEqual(periodSpan({ from: '2026-10-01', to: '2027-09-30' }), { months: 12, days: 0, label: '12 เดือน' });
  assert.deepEqual(periodSpan({ from: '2026-09-02', to: '2027-09-25' }), { months: 12, days: 24, label: '12 เดือน 24 วัน' });
  assert.deepEqual(periodSpan({ from: '2026-10-01', to: '2026-10-10' }), { months: 0, days: 10, label: '10 วัน' });
  assert.deepEqual(periodSpan(null), { months: 0, days: 0, label: '' });
  assert.equal(periodEndFromMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(periodEndFromMonths('2026-10-01', 12), '2027-09-30');
  assert.equal(periodEndFromMonths('2026-10-01', 24), '2028-09-30');
  assert.equal(periodEndFromMonths(null, 12), null);
  assert.equal(periodEndFromMonths('2026-10-01', 0), null);
});

test('จำนวนในใบเทียบแพ็คที่ตั้ง (ภาคผนวก A.4)', () => {
  const ctx = completeCtx();
  const line = ctx.lines[0];
  assert.deepEqual(lineQtyCrossCheck(line, lineSetupTotals(line, ctx)), { tone: 'ok', text: 'จำนวนในใบ 12 แพ็คเกจ · ตรงกับทั้งรายการ ✓' });
  const two = { ...ctx, allocations: [...ctx.allocations, alloc('SOL-1', 'Z2', 1, 1)] };
  assert.deepEqual(lineQtyCrossCheck(line, lineSetupTotals(line, two)),
    { tone: 'warn', text: 'จำนวนในใบ 12 แพ็คเกจ ≠ ทั้งรายการ 24 แพ็ค — ตรวจอีกครั้ง (ไม่บังคับให้เท่า)' });
  assert.deepEqual(lineQtyCrossCheck(manual(1, { serviceKind: 'package' }), { zones: 0 }),
    { tone: 'none', text: 'จำนวนในใบ 12 แพ็คเกจ — ตรวจได้เมื่อเลือกโซนแล้ว' });
  assert.deepEqual(lineQtyCrossCheck(manual(1, { serviceKind: 'package', unit: 'เดือน' }), { zones: 3 }),
    { tone: 'info', text: 'จำนวนในใบ 12 เดือน = ระยะเวลา ไม่ได้นับเป็นแพ็ค' });
  assert.equal(lineQtyCrossCheck(manual(1, { serviceKind: 'not_service' }), { zones: 0 }).tone, 'none');
  assert.equal(lineDerivedText(lineSetupTotals(line, ctx)), 'จำนวนรอบบริการ 12 รอบ · แต่ละครั้ง 1 แพ็ค · รวมทั้งรายการ 12 แพ็ค');
  assert.equal(lineDerivedText({ rounds: null }), null);
  assert.equal(serviceSetupFooterText(serviceSetupTotals(ctx)),
    'งานบริการทั้งใบ: 10 รายการแพ็คเกจ · จำนวนรอบบริการ 12 รอบ · แต่ละครั้ง 10 โซนใน 10 ไซต์ · ครั้งละ 10 แพ็ค · รวมทั้งใบ 120 แพ็ค');
});

/* ══ ก้อนที่จอส่งมาบันทึก ══════════════════════════════════════════════════════════════════════════ */

test('validateServiceSetupPatch — ก้อนดีได้ payload ที่ทำรูปแล้ว (จำนวนเต็ม · sortOrder ตามลำดับ)', () => {
  const ctx = completeCtx();
  const { value, errors } = validateServiceSetupPatch({
    expectedUpdatedAt: ctx.order.updatedAt,
    period: { from: '2026-10-01', to: '2027-09-30' },
    lines: [{ lineId: 'SOL-1', kind: 'package', serviceProductId: 'P1', rounds: '12', zones: [{ zoneId: 'Z1', packsPerRound: '2' }, { zoneId: 'Z2', packsPerRound: null }] }],
  }, ctx);
  assert.deepEqual(errors, []);
  assert.deepEqual(value, {
    period: { from: '2026-10-01', to: '2027-09-30' },
    lines: [{ lineId: 'SOL-1', kind: 'package', serviceProductId: 'P1', rounds: 12, zones: [
      { zoneId: 'Z1', packsPerRound: 2, sortOrder: 0 }, { zoneId: 'Z2', packsPerRound: null, sortOrder: 1 },
    ] }],
  });
  // คีย์ที่ไม่ส่ง = ไม่เปลี่ยน · period: null = ล้าง
  assert.deepEqual(validateServiceSetupPatch({ period: null }, ctx), { value: { period: null }, errors: [] });
});

test('validateServiceSetupPatch — กติกาเดียวกับ RPC บันทึก', () => {
  const ctx = completeCtx();
  const sites = [site('S1')];
  const manyZones = Array.from({ length: 501 }, (_, k) => zone(`M${k}`, 'S1'));
  const big = { ...ctx, zonesById: new Map(manyZones.map((z) => [z.id, z])), sitesById: new Map(sites.map((s) => [s.id, s])) };
  const err = (body, c = ctx) => validateServiceSetupPatch(body, c).errors;

  assert.equal(err({ lines: [{ lineId: 'SOL-1', zones: manyZones.map((z) => ({ zoneId: z.id, packsPerRound: 1 })) }] }, big)[0].message,
    'เกิน 500 โซนต่อรายการ — แยกรายการที่ใบเสนอราคา');
  assert.equal(SERVICE_SETUP_LIMITS.zonesPerLine, 500);
  const dup = err({ lines: [{ lineId: 'SOL-1', zones: [{ zoneId: 'Z1', packsPerRound: 1 }, { zoneId: 'Z1', packsPerRound: 2 }] }] });
  assert.deepEqual(dup, [{ lineId: 'SOL-1', zoneId: 'Z1', field: 'zones', message: 'เลือกโซนเดียวกันซ้ำในรายการเดียว' }]);
  for (const packs of [0, 10000, 1.5, 'abc']) {
    assert.deepEqual(err({ lines: [{ lineId: 'SOL-1', zones: [{ zoneId: 'Z1', packsPerRound: packs }] }] }),
      [{ lineId: 'SOL-1', zoneId: 'Z1', field: 'packs', message: 'รอบละกี่แพ็ค ต้องเป็นจำนวนเต็ม 1–9999' }], String(packs));
  }
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-1', rounds: 0 }] }), [{ lineId: 'SOL-1', field: 'rounds', message: 'จำนวนรอบบริการ ต้องเป็นจำนวนเต็ม 1–999' }]);
  assert.equal(err({ lines: [{ lineId: 'SOL-1', rounds: 1000 }] })[0].field, 'rounds');

  const withFg = completeCtx({ lines: [fgLine(1, 'FG-0233-02-001-00001'), manual(2, { serviceKind: 'not_service' })] });
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-1', kind: 'package' }] }, withFg),
    [{ lineId: 'SOL-1', field: 'kind', message: 'รายการที่มีรหัส FG ตอบ ‘งานบริการ?’ เองไม่ได้ — ระบบตัดสินจากหมวดของ FG' }]);
  assert.equal(err({ lines: [{ lineId: 'SOL-1', serviceProductId: null }] }, withFg)[0].field, 'kind');
  // FG บนบรรทัดที่ไม่ใช่งานบริการ
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-2', serviceProductId: 'P1' }] }, withFg),
    [{ lineId: 'SOL-2', field: 'fg', message: 'รายการนี้ยังไม่ได้ตอบว่าเป็นงานบริการ — ตอบ ‘ใช่’ ก่อน แล้วจึงเลือก FG/โซน/รอบ' }]);
  assert.equal(err({ lines: [{ lineId: 'SOL-2', zones: [{ zoneId: 'Z1', packsPerRound: 1 }] }] }, withFg)[0].field, 'zones');
  // ล้างได้เสมอ (สลับเป็นไม่ใช่งานบริการ)
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-2', serviceProductId: null, rounds: null, zones: [] }] }, withFg), []);
  // บรรทัด FG 02-001 ใส่รอบ/โซนได้
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-1', rounds: 12, zones: [{ zoneId: 'Z1', packsPerRound: 1 }] }] }, withFg), []);

  assert.deepEqual(err({ lines: [{ lineId: 'SOL-404' }] }),
    [{ lineId: 'SOL-404', field: 'line', message: 'มีรายการที่ไม่ได้อยู่ในใบนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง' }]);
  assert.equal(err({ lines: [{ lineId: 'SOL-1', kind: 'bogus' }] })[0].message, 'คำตอบ ‘งานบริการ?’ ไม่ถูกต้อง');
  assert.equal(err({ period: { from: '2027-01-01', to: '2026-01-01' } })[0].field, 'period');
  assert.equal(err({ period: { from: '1999-12-31', to: '2026-01-01' } })[0].field, 'period');
  assert.equal(err({ period: { from: '2026-02-30', to: '2026-03-01' } })[0].field, 'period');
  assert.equal(err(null)[0].field, 'payload');
  assert.equal(err({ lines: 'x' })[0].field, 'payload');
  assert.equal(validateServiceSetupPatch({ lines: [{ lineId: 'SOL-404' }] }, ctx).value, null);
});

test('validateServiceSetupPatch — โซนใช้ไม่ได้ + แพ็คเกจนอกตัวเลือก + ไม่ได้โหลดตัวเลือก = throw', () => {
  const ctx = completeCtx();
  ctx.zonesById.set('Z3', zone('Z3', 'S3', { isActive: false }));
  const [bad] = validateServiceSetupPatch({ lines: [{ lineId: 'SOL-1', zones: [{ zoneId: 'Z3', packsPerRound: 1 }] }] }, ctx).errors;
  assert.deepEqual([bad.field, bad.zoneId], ['zones', 'Z3']);
  assert.match(bad.message, /ถูกปิดใช้งาน/);
  const [missing] = validateServiceSetupPatch({ lines: [{ lineId: 'SOL-1', zones: [{ zoneId: 'ZX', packsPerRound: 1 }] }] }, ctx).errors;
  assert.match(missing.message, /ไม่พบโซนในทะเบียน/);
  const [foreign] = validateServiceSetupPatch({ lines: [{ lineId: 'SOL-1', serviceProductId: 'P-other' }] }, ctx).errors;
  assert.equal(foreign.field, 'fg');
  assert.throws(() => validateServiceSetupPatch({ lines: [{ lineId: 'SOL-1', serviceProductId: 'P1' }] }, { ...ctx, fgOptionIds: null }), /withFgOptions/);
});

/* ══ ข้อความของโมดัล / แถบ / หัวใบ (ภาคผนวก A.5) ═════════════════════════════════════════════════════ */

test('โมดัลยืนยัน "ยื่นตรวจงานบริการ": บอกว่าถอนเองไม่ได้ · ยอด/Actual ไม่เปลี่ยน · ป้ายไม่มีคำว่า Actual', () => {
  const prompt = serviceBackfillSubmitPrompt(completeCtx({ order: orderOf({ ...PERIOD, status: 'approved' }) }));
  assert.equal(prompt.title, 'ยื่นตรวจงานบริการ');
  assert.equal(prompt.subject, 'งานบริการของ SO-26100005-0');
  assert.equal(prompt.effects[0], 'ส่งการตั้งค่างานบริการ (10 โซนใน 10 ไซต์ · ช่วงบริการ 01/10/2026–30/09/2027) ให้ผู้จัดการฝ่ายขายตรวจ');
  assert.ok(prompt.effects.some((e) => e.includes('ถอนเองไม่ได้')));
  assert.ok(prompt.effects.some((e) => e.includes('ไม่เปลี่ยน')));
  assert.equal(prompt.confirmLabel, 'ยื่นตรวจงานบริการ');
  assert.doesNotMatch(prompt.confirmLabel, /Actual/);
});

test('ผลของการอนุมัติใบ (pipeline) ตามลำดับ · เฉพาะข้อที่เกิดจริง', () => {
  const ctx = completeCtx();
  ctx.lines.push(manual(11, { serviceKind: 'not_service', description: 'ค่าขนส่ง' }));
  ctx.liveTermsByZone = new Map([['Z1', [{ term: { id: 'T1', salesOrderId: 'SO9' }, order: { id: 'SO9', orderNumber: 'SO-26080073-0' } }]]]);
  const effects = serviceSetupApprovalEffects(ctx, { flow: 'pipeline' });
  assert.deepEqual(effects, [
    'เปิดงานบริการให้ TS: จำนวนรอบบริการ 12 รอบ · แต่ละครั้ง 10 โซนใน 10 ไซต์ · ครั้งละ 10 แพ็ค · รวมทั้งใบ 120 แพ็ค — ขึ้นที่ “งานเข้าใหม่ › รอตั้งรอบ” ทันที ไม่ต้องผูกโซนอีก',
    'ช่วงบริการ 01/10/2026–30/09/2027 · งวด 12 งวดครอบต่อเนื่อง — ช่างเข้าไซต์ได้เฉพาะวันที่บัญชีรับรองงวดที่ครอบแล้ว',
    'ยังไม่ผูกสัญญา — นัดบริการติดด่านสัญญาจนกว่าจะผูกสัญญาที่ลงนามแล้วที่แท็บ “สัญญา”',
    'ไม่ใช่งานบริการรายรอบ 1 รายการ (ค่าขนส่ง) — ไม่ส่งให้ TS',
    '1 โซนมีรอบขายของ SO-26080073-0 ที่ยังมีผล (ต่ออายุ)',
    'หลังอนุมัติ แพ็คเกจ/โซน/รอบละกี่แพ็ค/ช่วงบริการล็อก — เปิดแก้ด้วย ‘แก้งานบริการ’ ได้ก่อน TS เริ่มงาน (ผู้จัดการฝ่ายขายอนุมัติอีกครั้ง)'
      + ' · หลังจากนั้นย้อนการอนุมัติแล้วออก Rev. (จำนวนรอบบริการยังแก้ได้)',
  ]);
  // สัญญาลงนามแล้ว = ไม่มีคำเตือนสัญญา · ใบยอด 0 · ใบ Rev. ย้ายรอบ · งวดรับรองแล้วไม่มีช่วงครอบ
  const rows = monthlyRows();
  rows[0] = { ...rows[0], status: 'confirmed', coversFrom: null, coversTo: null };
  const rev = completeCtx({
    installments: rows,
    contract: { id: 'CT1', contractNo: 'CT-2609-0001', status: 'signed' },
    predecessor: { id: 'SO0', orderNumber: 'SO-26090001-0', activePlanSiteIds: ['S1', 'S2', 'S99'] },
  });
  const revEffects = serviceSetupApprovalEffects(rev, { flow: 'pipeline' });
  assert.ok(!revEffects.some((e) => e.startsWith('ยังไม่ผูกสัญญา')));
  assert.ok(revEffects.includes('ย้ายรอบบริการ 2 ไซต์จาก SO-26090001-0 มาใบนี้ · ไซต์ที่ใบนี้ไม่มีแล้ว 1 ไซต์ TS จะเห็นเป็นรอบของใบเดิมให้ตัดสิน'));
  assert.ok(revEffects.includes('งวดที่บัญชีรับรองแล้ว 1 งวดยังไม่มีช่วงครอบ — ช่างเข้าไซต์ได้เมื่อบัญชีกรอกช่วงครอบให้'));
  const zero = serviceSetupApprovalEffects(completeCtx({ order: orderOf({ ...PERIOD, totalAmount: 0 }), installments: [] }));
  assert.equal(zero[1], 'ช่วงบริการ 01/10/2026–30/09/2027 · ใบยอด 0 บาท — ไม่มีงวด');
  // ไม่มีแพ็คเกจเลย
  assert.deepEqual(serviceSetupApprovalEffects(ctxOf({ lines: [manual(1, { serviceKind: 'not_service' })] })),
    ['ใบนี้ไม่มีแพ็คเกจบริการ — ไม่มีอะไรส่งให้ TS']);
  assert.deepEqual(serviceSetupApprovalChecklist(ctx), ['ตรวจแพ็คเกจ · ไซต์ · โซน · จำนวนรอบบริการ · รอบละกี่แพ็ค ในการ์ดงานบริการ']);
  // รอบไม่เท่ากัน
  const mixed = completeCtx();
  mixed.lines[0] = { ...mixed.lines[0], serviceRounds: 8 };
  assert.match(serviceSetupApprovalEffects(mixed)[0], /^เปิดงานบริการให้ TS: จำนวนรอบบริการ 8–12 รอบ · /);
});

test('ผลของการอนุมัติงานบริการย้อนหลัง: ไม่แตะ Actual/ยอด/สถานะ · ด่านเงินเริ่มใช้ · ไม่มีคำว่า "นับ Actual"', () => {
  const order = orderOf({
    ...PERIOD, status: 'approved', approvedAt: '2026-09-17T09:00:00Z', actualAmount: 250380, totalAmount: 250380,
    serviceSetupState: 'submitted', serviceSetupSubmittedAt: STAMP,
  });
  const ctx = completeCtx({ order });
  const effects = serviceSetupApprovalEffects(ctx, { flow: 'backfill' });
  assert.equal(effects[0], 'เปิดงานบริการให้ TS: จำนวนรอบบริการ 12 รอบ · แต่ละครั้ง 10 โซนใน 10 ไซต์ · ครั้งละ 10 แพ็ค · รวมทั้งใบ 120 แพ็ค — ขึ้นที่ “งานเข้าใหม่ › รอตั้งรอบ” ทันที ไม่ต้องผูกโซนอีก');
  assert.equal(effects[1], 'ไม่แตะยอด Actual · ยอดใบ · เอกสารที่ออกแล้ว · สถานะใบ (อนุมัติแล้วเหมือนเดิม) — Actual ก.ย. 2026 ฿250,380.00 · ยอดรวม ฿250,380.00 · งวดชำระ 12 งวด เท่าเดิม');
  assert.equal(effects[2], 'ด่านเงินของบัญชีเริ่มใช้กับใบนี้: งวดที่ยังไม่รับรองต้องมีช่วงครอบก่อนรับรอง (ครบแล้ว 12 งวด)');
  assert.equal(effects[3], 'ยังไม่ผูกสัญญา — นัดบริการติดด่านสัญญาจนกว่าจะผูกสัญญาที่ลงนามแล้วที่แท็บ “สัญญา”');
  assert.equal(effects.at(-1),
    'หลังอนุมัติล็อก — เปิดแก้ด้วย ‘แก้งานบริการ’ ได้ก่อน TS เริ่มงาน · หลังจากนั้นย้อนการอนุมัติใบแล้วออก Rev. (จำนวนรอบบริการยังแก้ได้)');
  assert.ok(effects.every((e) => !e.includes('นับ Actual')));
  assert.deepEqual(serviceSetupApprovalChecklist(ctx, { flow: 'backfill' }), [
    'ตรวจแพ็คเกจ · ไซต์ · โซน · จำนวนรอบบริการ · รอบละกี่แพ็ค ในการ์ดงานบริการ', 'ช่วงบริการตรงกับหมายเหตุของแต่ละสาขา', 'งวดที่ยังไม่รับรองมีช่วงครอบครบ 12 งวด',
  ]);
});

test('บรรทัดยืนยันการยื่น · แถบผู้อนุมัติ · บรรทัดออก Rev.', () => {
  const ctx = completeCtx();
  assert.equal(serviceSetupSubmitLine(ctx),
    'ส่งการตั้งค่างานบริการ (10 โซนใน 10 ไซต์ · ช่วงบริการ 01/10/2026–30/09/2027) ให้ผู้อนุมัติตรวจ — ระหว่างรออนุมัติแก้ไม่ได้ ดึงกลับได้');
  assert.equal(serviceSetupSubmitLine(ctxOf({ lines: [manual(1, { serviceKind: 'not_service' })] })), null);
  assert.equal(serviceSetupStripText(ctx),
    'งานบริการ: จำนวนรอบบริการ 12 รอบ · แต่ละครั้ง 10 โซนใน 10 ไซต์ · ครั้งละ 10 แพ็ค · รวมทั้งใบ 120 แพ็ค · ช่วง 01/10/2026–30/09/2027 · สัญญา: ยังไม่ผูก');
  assert.match(serviceSetupStripText({ ...ctx, contract: { contractNo: 'CT-2609-0001', status: 'signed' } }), /สัญญา: CT-2609-0001$/);
  assert.equal(serviceSetupRevisionLine(ctx), 'คัดลอกงานบริการ 10 รายการ · 10 โซน · ช่วงบริการ 01/10/2026–30/09/2027 ไปใบ Rev.');
  assert.equal(serviceSetupRevisionLine(ctxOf({ lines: [manual(1)] })), null);
});

test('หัวใบ "รอบบริการที่ขาย": ยังไม่ตั้ง · ประทับแล้วรอบไม่เท่ากัน · ย้อนหลังรอตรวจ', () => {
  const unset = serviceSetupHeroFact(ctxOf({ lines: [manual(1)] }), { flow: 'pipeline' });
  assert.deepEqual(unset, { label: 'รอบบริการที่ขาย', value: 'ยังไม่ตั้ง', sub: 'ตั้งที่ตารางรายการ แล้วยื่นอนุมัติ', tone: 'muted' });
  assert.equal(serviceSetupHeroFact(ctxOf({ lines: [manual(1)], order: orderOf({ status: 'approved' }) }), { flow: 'backfill' }).sub,
    'ตั้งที่ตารางรายการ แล้วยื่นตรวจ');

  const stamped = completeCtx({ order: orderOf({ ...PERIOD, status: 'approved', serviceTermsOpenedAt: STAMP }) });
  stamped.lines[0] = { ...stamped.lines[0], serviceRounds: 8 };
  assert.deepEqual(serviceSetupHeroFact(stamped, { flow: 'stamped' }),
    { label: 'รอบบริการที่ขาย', value: '8–12 รอบ', sub: 'แต่ละครั้ง 10 โซน · ครั้งละ 10 แพ็ค', tone: null });

  const waiting = completeCtx({ order: orderOf({ ...PERIOD, status: 'approved', serviceSetupState: 'submitted', serviceSetupSubmittedAt: STAMP }) });
  const hero = serviceSetupHeroFact(waiting, { flow: 'backfill' });
  assert.equal(hero.value, '12 รอบ');
  assert.ok(hero.sub.endsWith(' · รอตรวจ'));
});

/* ══ มติเจ้าของ 29/09: "จำนวนรอบบริการ" ก่อน แล้วค่อยบอกว่า "แต่ละครั้งกี่แพ็ค" ═════════════════════════════════════
   ประโยคเดียวทั้งโหมดแก้/อ่าน: แพ็คเกจ FG-… → จำนวนรอบบริการ n รอบ (ตลอดช่วงบริการ …) → แต่ละครั้ง: • ไซต์ · โซน — p แพ็ค → รวมทั้งรายการ n×Σp แพ็ค */

test('29/09 จำนวนรอบบริการก่อน: คำของบรรทัดมาจากแคตตาล็อกเดียว (ประโยครอบ · รอบละกี่แพ็ค · รวมทั้งรายการ)', () => {
  assert.equal(SERVICE_SETUP_LINE_TEXT.roundsLabel, 'จำนวนรอบบริการ');
  assert.equal(SERVICE_SETUP_LINE_TEXT.packsLabel, 'รอบละกี่แพ็ค', 'มติ 30/09: "ต้องไปกี่รอบ รอบละกี่แพ็ค"');
  assert.equal(SERVICE_SETUP_LINE_TEXT.eachTime, 'แต่ละครั้ง');
  assert.equal(SERVICE_SETUP_LINE_TEXT.zonePacks(2), '2 แพ็ค');
  assert.equal(SERVICE_SETUP_LINE_TEXT.zonePacks(1200), '1,200 แพ็ค');
  assert.equal(SERVICE_SETUP_LINE_TEXT.noPacks, 'ยังไม่ใส่รอบละกี่แพ็ค');
  const period = { from: '2026-10-22', to: '2027-10-21' };
  assert.equal(lineRoundsSentence(12, period), 'จำนวนรอบบริการ 12 รอบ (ตลอดช่วงบริการ 22/10/2026–21/10/2027)');
  assert.equal(lineRoundsSentence(1, null), 'จำนวนรอบบริการ 1 รอบ (ยังไม่ใส่ช่วงบริการ)');
  assert.equal(lineRoundsSentence(3, { from: '2026-10-22', to: '' }), 'จำนวนรอบบริการ 3 รอบ (ยังไม่ใส่ช่วงบริการ)', 'ช่วงครึ่งเดียว = ยังไม่ใส่');
  assert.equal(lineRoundsSentence(null, period), 'ยังไม่ใส่จำนวนรอบบริการ');
  assert.equal(lineTotalText({ packsPerRound: 2, packsTotal: 24 }), 'รวมทั้งรายการ 24 แพ็ค');
  assert.equal(lineTotalText({ packsPerRound: 2, packsTotal: null }), 'รวมทั้งรายการ — แพ็ค', 'ยังไม่มีรอบ');
  assert.equal(lineTotalText({ zones: 0, packsPerRound: 0, packsTotal: 0, rounds: 12 }), 'รวมทั้งรายการ — แพ็ค', 'มีรอบแต่ยังไม่มีโซน/แพ็ค ≠ 0 แพ็ค');
  assert.equal(serviceRoundsText({ roundsMin: 12, roundsMax: 12, roundsMixed: false }), 'จำนวนรอบบริการ 12 รอบ');
  assert.equal(serviceRoundsText({ roundsMin: 8, roundsMax: 12, roundsMixed: true }), 'จำนวนรอบบริการ 8–12 รอบ');
  assert.equal(serviceRoundsText({ roundsMin: null }), null);
  assert.equal(SERVICE_SETUP_ISSUE_TEXT.rounds_missing({ n: 3 }), 'รายการ 3: ยังไม่ใส่จำนวนรอบบริการ');
  assert.equal(SERVICE_SETUP_ISSUE_TEXT.packs_missing({ n: 3, zone: 'Office' }), 'รายการ 3 · Office: ยังไม่ใส่รอบละกี่แพ็ค');
  assert.deepEqual(lineQtyCrossCheck(done(1), { zones: 1, packsTotal: null }),
    { tone: 'none', text: 'จำนวนในใบ 12 แพ็คเกจ — ตรวจได้เมื่อใส่จำนวนรอบบริการและรอบละกี่แพ็คแล้ว' });
});

/* มติเจ้าของ 29/09 รอบสอง: "ไปกี่รอบ เปลี่ยน เป็น คำว่า จำนวนรอบบริการ" — คำเดียวทุกแคตตาล็อก (ป้ายช่อง · ข้อที่ยังขาด ·
   ข้อความ SQL · คำเตือนรอบน้อย · ประโยครอบ) · ช่องหัวใบที่ป้าย "รอบบริการที่ขาย" บอกแล้ว ใช้ตัวเลขล้วน "12 รอบ" */
test('29/09 รอบสอง: "ไปกี่รอบ" → "จำนวนรอบบริการ" ทุกแคตตาล็อก · ตัวเลขล้วนสำหรับช่องหัวใบ', () => {
  assert.equal(SERVICE_SETUP_LINE_TEXT.noRounds, 'ยังไม่ใส่จำนวนรอบบริการ');
  assert.equal(SERVICE_SETUP_LINE_TEXT.roundsCount(12), '12 รอบ');
  assert.equal(SERVICE_SETUP_LINE_TEXT.roundsCount(8, 12), '8–12 รอบ');
  assert.equal(SERVICE_SETUP_LINE_TEXT.roundsCount(1200), '1,200 รอบ');
  assert.equal(SERVICE_SETUP_LINE_TEXT.roundsText(12), 'จำนวนรอบบริการ 12 รอบ');
  assert.equal(SERVICE_SETUP_LINE_TEXT.roundsText(8, 12), 'จำนวนรอบบริการ 8–12 รอบ');
  assert.equal(SERVICE_SETUP_SQL_MESSAGES.service_setup_rounds_invalid.message, 'จำนวนรอบบริการ ต้องเป็นจำนวนเต็ม 1–999');
  assert.match(SERVICE_SETUP_SQL_MESSAGES.sales_order_service_setup_locked.message, / \(จำนวนรอบบริการยังแก้ได้หลังอนุมัติ\)$/);
  assert.equal(SERVICE_KIND_OPTIONS.find((o) => o.value === 'package').description,
    'แพ็คเกจที่ TS ต้องไปบริการตามรอบ — เลือก FG หมวด 02-001 → ไซต์ · โซน → จำนวนรอบบริการ → รอบละกี่แพ็ค');
  assert.equal(SERVICE_SETUP_ISSUE_TEXT.rounds_low({ rounds: 1, months: 12, stage: 'read' }),
    'จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง');
});

test('29/09 SO-26090247-0 (ภาพของเจ้าของ): FG 02-001 · 12 เดือน · จำนวนรอบบริการ 1 รอบ · Office 2 แพ็ค ⇒ รวมทั้งรายการ 2 แพ็ค + คำเตือนรอบน้อย', () => {
  const order = orderOf({
    status: 'approved', servicePeriodFrom: '2026-10-22', servicePeriodTo: '2027-10-21', serviceTermsOpenedAt: '2026-09-29T04:08:11Z',
  });
  const lines = [1, 2].map((i) => fgLine(i, 'FG-364-02-001-1061', { qty: 12, unit: 'เดือน', serviceRounds: 1 }));
  const ctx = ctxOf({
    order, lines, sites: [site('S1')], zones: [zone('Z1', 'S1', { name: 'Office' })],
    allocations: [alloc('SOL-1', 'Z1', 2), alloc('SOL-2', 'Z1', 2)],
  });
  assert.equal(lineTotalText(lineSetupTotals(lines[0], ctx)), 'รวมทั้งรายการ 2 แพ็ค');
  assert.equal(lineRoundsSentence(1, servicePeriodOf(order)), 'จำนวนรอบบริการ 1 รอบ (ตลอดช่วงบริการ 22/10/2026–21/10/2027)');
  assert.deepEqual(roundsLowOf(1, servicePeriodOf(order)), { rounds: 1, months: 12 });
  /* คำเตือนไม่บล็อก — ไม่อยู่ในข้อที่ยังขาด */
  assert.deepEqual(serviceSetupIssues(ctx).filter((i) => i.key === 'rounds_low'), []);
  const warnings = serviceSetupWarnings(ctx).filter((w) => w.key === 'rounds_low');
  assert.deepEqual(warnings.map((w) => [w.lineId, w.lineNo, w.area, w.tab, w.field, w.owner]), [
    ['SOL-1', 1, 'lines', 'overview', 'rounds', 'SA'],
    ['SOL-2', 2, 'lines', 'overview', 'rounds', 'SA'],
  ]);
  assert.equal(warnings[0].message, 'รายการ 1: จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็ยื่นได้)');
  assert.equal(serviceSetupFieldId(warnings[0]), 'svc-line-SOL-1-rounds', '"ไปแก้" ของคำเตือนพาไปช่องจำนวนรอบบริการ');
  /* บนบรรทัด (ไม่มีเลขรายการ) — ใบอนุมัติแล้วแก้รอบได้ที่ดินสอ ⇒ ไม่พูดว่า "ยื่น" */
  assert.equal(lineRoundsLowText(1, servicePeriodOf(order), { stage: 'approved' }),
    'จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (จำนวนรอบบริการยังแก้ได้หลังอนุมัติ)');
  assert.equal(lineRoundsLowText(1, servicePeriodOf(order)), 'จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็ยื่นได้)');
  assert.equal(lineRoundsLowText(1, servicePeriodOf(order), { stage: 'read' }), 'จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง');
  assert.equal(lineRoundsLowText(12, servicePeriodOf(order)), null);
});

test('29/09 คำเตือนรอบน้อย: รอบ < ครึ่งหนึ่งของเดือนเต็มในช่วงบริการ · ไม่มีช่วง/ไม่มีรอบ = ไม่เตือน', () => {
  const year = { from: '2026-10-01', to: '2027-09-30' };
  assert.deepEqual(roundsLowOf(5, year), { rounds: 5, months: 12 });
  assert.equal(roundsLowOf(6, year), null, 'ครึ่งหนึ่งพอดีไม่เตือน');
  assert.equal(roundsLowOf(12, year), null);
  assert.deepEqual(roundsLowOf(1, { from: '2026-10-16', to: '2027-01-15' }), { rounds: 1, months: 3 });
  assert.equal(roundsLowOf(1, { from: '2026-10-01', to: '2026-11-30' }), null, '2 เดือน · 1 รอบ = ครึ่งพอดี');
  assert.equal(roundsLowOf(1, { from: '2026-10-01', to: '2026-10-20' }), null, 'ไม่ถึงเดือน');
  assert.equal(roundsLowOf(null, year), null);
  assert.equal(roundsLowOf('1', year), null, 'ข้อความที่พิมพ์ต้องแปลงก่อน — ตัวตัดสินรับจำนวนเต็ม');
  assert.equal(roundsLowOf(1, null), null);
  assert.equal(roundsLowOf(1, { from: '2027-09-30', to: '2026-10-01' }), null, 'ช่วงกลับหัว');

  /* ใบร่างที่ตั้งครบ: บรรทัด 1 จำนวนรอบบริการ 1 รอบ ⇒ คำเตือนข้อเดียว (ขึ้นก่อนคำเตือนงวด) · ยื่นได้ · ผู้อนุมัติเห็นในสิ่งที่ต้องตรวจก่อนกด */
  const rows = monthlyRows();
  rows[1] = { ...rows[1], coversFrom: '2026-10-15' };
  const ctx = completeCtx({ installments: rows });
  ctx.lines[0] = { ...ctx.lines[0], serviceRounds: 1 };
  assert.deepEqual(serviceSetupIssues(ctx), []);
  const warnings = serviceSetupWarnings(ctx);
  assert.deepEqual(warnings.map((w) => w.key), ['rounds_low', 'coverage_overlap']);
  assert.deepEqual(serviceSetupApprovalChecklist(ctx), [
    'ตรวจแพ็คเกจ · ไซต์ · โซน · จำนวนรอบบริการ · รอบละกี่แพ็ค ในการ์ดงานบริการ',
    'รายการ 1: จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็อนุมัติได้)',
  ]);
  const backfill = completeCtx({ order: orderOf({ ...PERIOD, status: 'approved', serviceSetupState: 'submitted' }) });
  backfill.lines[0] = { ...backfill.lines[0], serviceRounds: 2 };
  assert.ok(serviceSetupApprovalChecklist(backfill, { flow: 'backfill' })
    .includes('รายการ 1: จำนวนรอบบริการ 2 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็อนุมัติได้)'));
  /* ไม่ใช่แพ็คเกจ / ยังไม่มีรอบ / ไม่มีช่วงบริการ = ไม่เตือน */
  const quiet = completeCtx({ order: orderOf() });
  quiet.lines[0] = { ...quiet.lines[0], serviceRounds: 1 };
  assert.deepEqual(serviceSetupWarnings(quiet).filter((w) => w.key === 'rounds_low'), []);
  const view = serviceSetupView(ctx, { canEdit: true, userId: 'U1', role: 'ae' });
  assert.equal(view.warnings[0].key, 'rounds_low');
});

test('ก้อน audit ก่อน/หลัง', () => {
  const snap = serviceSetupAuditSnapshot(completeCtx());
  assert.deepEqual(snap.period, { from: '2026-10-01', to: '2027-09-30' });
  /* mig 0400: ก้อน audit พกโหมด + ช่วงของรายการ (โหมดทั้งใบ = 'whole' · ช่วงของรายการว่าง) */
  assert.equal(snap.periodMode, 'whole');
  assert.deepEqual(snap.lines[0], { lineId: 'SOL-1', kind: 'package', serviceFgCode: 'FG-0521-02-001-00012', rounds: 12, period: null, zones: [{ zoneId: 'Z1', packsPerRound: 1 }] });
});

/* ══ ก้อน GET ══════════════════════════════════════════════════════════════════════════════════════ */

test('serviceSetupView — ร่าง: โหมดแก้ · ทุกช่องที่จอใช้มีครบ', () => {
  const ctx = completeCtx();
  ctx.lines[0] = { ...ctx.lines[0], serviceKind: null, metadata: { note: 'สาขาบางนา', categoryCode: '02-001', categoryName: 'ระบบกระจายกลิ่น' } };
  const view = serviceSetupView(ctx, { canEdit: true, userId: 'U1', role: 'ae' });
  for (const key of ['orderId', 'updatedAt', 'flow', 'mode', 'editBlockedReason', 'period', 'state', 'lines', 'allocations', 'zones', 'sites',
    'fgOptions', 'siblingSites', 'issues', 'warnings', 'totals', 'approvalEffects', 'approvalChecklist', 'approvalSubject', 'submitLine',
    'stripText', 'hero', 'backfillSubmitPrompt', 'revisedFrom', 'backfill', 'liveTermsInfo']) {
    assert.ok(Object.prototype.hasOwnProperty.call(view, key), key);
  }
  assert.equal(view.flow, 'pipeline');
  assert.equal(view.mode, 'edit');
  assert.equal(view.editBlockedReason, null);
  assert.deepEqual(view.lines[0], {
    lineId: 'SOL-1', lineNo: 1, role: 'package', roleSource: 'category', kind: null, serviceProductId: 'P1',
    serviceFgCode: 'FG-0521-02-001-00012', rounds: 12, period: null, fgCode: null, productId: null, description: '02-001 : ระบบกระจายกลิ่น',
    note: 'สาขาบางนา', qty: 12, unit: 'แพ็คเกจ', categoryCode: '02-001', categoryName: 'ระบบกระจายกลิ่น',
  });
  assert.deepEqual(view.allocations[0], { id: 'SLZ-SOL-1-Z1', lineId: 'SOL-1', zoneId: 'Z1', packsPerRound: 1, sortOrder: 0 });
  assert.deepEqual(view.fgOptions[0], { id: 'P1', fgCode: 'FG-0521-02-001-00012', name: 'SDS', ownerArCode: null });
  assert.equal(view.issues.length, 0);
  assert.equal(view.backfillSubmitPrompt, null);
  assert.deepEqual(view.backfill, { canSubmit: false, canReview: false, reviewBlockedReason: null, needsOverrideReason: false });
  // ไม่มีสิทธิ์ = อ่านอย่างเดียวพร้อมเหตุ
  const read = serviceSetupView(ctx, { canEdit: false, userId: 'U1', role: 'ae' });
  assert.equal(read.mode, 'read');
  assert.equal(read.editBlockedReason, 'ตั้งงานบริการได้เฉพาะฝ่ายขายที่ดูแลใบนี้');
});

test('serviceSetupView — ย้อนหลังรอตรวจ: ผู้ยื่นที่ไม่ใช่ admin ถูกบล็อก · admin ที่ยื่นเองต้องใส่เหตุผล · ผู้จัดการอีกคนตรวจได้', () => {
  const order = orderOf({
    ...PERIOD, status: 'approved', serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-09-28T03:00:00Z',
    serviceSetupSubmittedById: 'U1', serviceSetupSubmittedByName: 'Sittipong K.',
  });
  const ctx = completeCtx({ order });
  const self = serviceSetupView(ctx, { canEdit: true, userId: 'U1', role: 'ae_supervisor' });
  assert.equal(self.flow, 'backfill');
  assert.equal(self.mode, 'read');
  assert.equal(self.editBlockedReason, 'ยื่นตรวจงานบริการแล้ว — รอผู้จัดการฝ่ายขายตรวจ (ตีกลับก่อนจึงแก้ได้)');
  assert.deepEqual(self.backfill, { canSubmit: false, canReview: true, reviewBlockedReason: 'ยื่นเองอนุมัติเองไม่ได้', needsOverrideReason: false });
  assert.equal(self.approvalSubject, 'SO-26100005-0 · ยื่นโดย Sittipong K. 28/09/2026');
  assert.ok(self.approvalEffects[1].startsWith('ไม่แตะยอด Actual'));
  assert.ok(self.hero.sub.endsWith(' · รอตรวจ'));
  const admin = serviceSetupView(ctx, { canEdit: true, userId: 'U1', role: 'admin' });
  assert.deepEqual(admin.backfill, { canSubmit: false, canReview: true, reviewBlockedReason: null, needsOverrideReason: true });
  const other = serviceSetupView(ctx, { canEdit: true, userId: 'U2', role: 'commercial_manager' });
  assert.deepEqual(other.backfill, { canSubmit: false, canReview: true, reviewBlockedReason: null, needsOverrideReason: false });
  const ae = serviceSetupView(ctx, { canEdit: true, userId: 'U3', role: 'ae' });
  assert.equal(ae.backfill.canReview, false);
  // ค่าค้างบนใบที่ย้อนการอนุมัติแล้ว = ไม่มีใครตรวจได้
  const revoked = serviceSetupView(completeCtx({ order: { ...order, status: 'approval_revoked' } }), { canEdit: true, userId: 'U2', role: 'admin' });
  assert.equal(revoked.flow, 'locked');
  assert.equal(revoked.backfill.canReview, false);
});

test('serviceSetupView — ย้อนหลังยังไม่ยื่น: ยื่นได้ + โมดัลยืนยัน · ใบที่ไม่มีอะไรให้ตั้ง = none', () => {
  const ctx = completeCtx({ order: orderOf({ ...PERIOD, status: 'approved' }) });
  const view = serviceSetupView(ctx, { canEdit: true, userId: 'U1', role: 'ae' });
  assert.equal(view.flow, 'backfill');
  assert.equal(view.mode, 'edit');
  assert.equal(view.backfill.canSubmit, true);
  assert.equal(view.backfillSubmitPrompt.confirmLabel, 'ยื่นตรวจงานบริการ');
  const nothing = completeCtx({ order: orderOf({ status: 'approved' }), lines: [fgLine(1, 'FG-0233-03-002-00001')], allocations: [] });
  const none = serviceSetupView(nothing, { canEdit: true, userId: 'U1', role: 'ae' });
  assert.equal(none.flow, 'none');
  assert.equal(none.mode, 'read');
  assert.equal(none.backfill.canSubmit, false);
});

test('serviceSetupView — ข้อมูลต่ออายุ + ใบก่อนหน้า', () => {
  const ctx = completeCtx({
    liveTermsByZone: new Map([['Z2', [{ term: { id: 'T', salesOrderId: 'SO7' }, order: { id: 'SO7', orderNumber: 'SO-26080073-0' } }]]]),
    predecessor: { id: 'SO0', orderNumber: 'SO-26090001-0', activePlanSiteIds: [] },
  });
  const view = serviceSetupView(ctx, { canEdit: true, userId: 'U1', role: 'ae' });
  assert.deepEqual(view.liveTermsInfo, [{ zoneId: 'Z2', orderNumbers: ['SO-26080073-0'] }]);
  assert.deepEqual(view.revisedFrom, { id: 'SO0', orderNumber: 'SO-26090001-0' });
});

test('ข้อ ① "งานบริการ?" ไม่มีค่าตั้งต้น — ใช่/ไม่ใช่ ตามแคตตาล็อก (มติ 30/09)', () => {
  assert.deepEqual(SERVICE_KIND_OPTIONS.map((o) => [o.value, o.label]), [
    ['package', 'ใช่'], ['not_service', 'ไม่ใช่'],
  ]);
  assert.ok(SERVICE_KIND_OPTIONS.every((o) => !('default' in o)));
});

/* ══ รอบแก้หลังรีวิว (29/09) ═════════════════════════════════════════════════════════════════════════ */

/* ใบแพ็คเกจหนึ่งบรรทัด ช่วงบริการปี 2026 — งวดส่งเข้ามาเอง */
const year2026 = (installments, over = {}) => ctxOf({
  order: orderOf({ servicePeriodFrom: '2026-01-01', servicePeriodTo: '2026-12-31', ...over }),
  lines: [done(1)], sites: [site('S1')], zones: [zone('Z1', 'S1')], allocations: [alloc('SOL-1', 'Z1')], installments,
});
const inst = (seq, status, coversFrom, coversTo, over = {}) => ({
  id: `I${seq}`, seq, status, amount: 10000, dueDate: coversFrom || '2026-01-01', billingDate: null, billingEvent: null,
  coversFrom, coversTo, ...over,
});
/* ยาม: ข้อของฝ่ายขายต้องไม่ชี้เซลล์ของงวดที่บัญชีรับรองแล้ว (ฝ่ายขายแก้ไม่ได้ — "ไปแก้" ตกบนเซลล์ล็อก) */
const assertNoSaIssueOnConfirmed = (issues, installments) => {
  const confirmed = new Set(installments.filter((row) => row.status === 'confirmed').map((row) => row.id));
  for (const issue of issues) {
    if (issue.owner === 'SA') assert.equal(confirmed.has(issue.installmentId), false, `${issue.key} ชี้งวดที่รับรองแล้ว ${issue.installmentId}`);
  }
};

test('F3: งวดที่รับรองแล้วไม่มีช่วงครอบ ไม่ปิดการเทียบช่วงบริการทั้งชุด — ช่องโหว่/จบสั้นที่งวดนั้นอธิบายไม่ได้ยังบล็อก', () => {
  const rows = [
    inst(1, 'confirmed', null, null),
    inst(2, 'pending', '2026-05-01', '2026-06-30'),
    inst(3, 'pending', '2026-09-01', '2026-09-30'),
  ];
  const ctx = year2026(rows);
  const issues = serviceSetupIssues(ctx);
  assert.deepEqual(keys(issues), ['coverage_gap', 'coverage_end'], 'เริ่มช้า 01/01–30/04 ถูกตัด (งวด 1 ที่ไม่มีช่วงครอบอธิบายได้)');
  assert.equal(issues[0].message, 'ช่วงครอบขาด 01/07/2026–31/08/2026');
  assert.equal(issues[1].message, 'ช่วงครอบไม่ตรงวันสิ้นสุดบริการ (01/10/2026–31/12/2026)');
  assert.deepEqual(serviceSetupWarnings(ctx).map((w) => [w.key, w.seq]), [['fn_coverage_missing', 1]]);
  assertNoSaIssueOnConfirmed(issues, rows);
});

test('F3: งวด 1 รับรองแล้วไม่มีช่วงครอบ + งวด 2–12 ครอบที่เหลือพอดี = ไม่มีข้อ (ไม่มีเสียงรบกวน) · เหลือคำเตือนบัญชี', () => {
  const rows = [inst(1, 'confirmed', null, null)];
  for (let m = 2; m <= 12; m += 1) {
    const mm = String(m).padStart(2, '0');
    const last = new Date(Date.UTC(2026, m, 0)).getUTCDate();
    rows.push(inst(m, 'pending', `2026-${mm}-01`, `2026-${mm}-${last}`));
  }
  const ctx = year2026(rows);
  assert.deepEqual(serviceSetupIssues(ctx), []);
  assert.deepEqual(serviceSetupWarnings(ctx).map((w) => w.key), ['fn_coverage_missing']);
});

test('F3: ช่องโหว่ถูกตัดเฉพาะเมื่องวดที่ไม่มีช่วงครอบอยู่ระหว่างสองงวดที่ขนาบช่องนั้น', () => {
  const rows = [
    inst(1, 'pending', '2026-01-01', '2026-03-31'),
    inst(2, 'confirmed', null, null),
    inst(3, 'pending', '2026-05-01', '2026-08-31'),
    inst(4, 'pending', '2026-10-01', '2026-12-31'),
  ];
  const issues = serviceSetupIssues(year2026(rows));
  assert.deepEqual(keys(issues), ['coverage_gap']);
  assert.equal(issues[0].message, 'ช่วงครอบขาด 01/09/2026–30/09/2026', 'ช่อง เม.ย. (งวด 2 อยู่ระหว่าง 1–3) ถูกตัด · ช่อง ก.ย. ยังบล็อก');
  // ครอบเกินวันสิ้นสุดบริการ ไม่ใช่ช่องของงวดที่ขาด ⇒ ยังบล็อก
  const over = [inst(1, 'pending', '2026-01-01', '2026-06-30'), inst(2, 'pending', '2026-07-01', '2027-01-31'), inst(3, 'confirmed', null, null)];
  assert.deepEqual(keys(serviceSetupIssues(year2026(over))), ['coverage_end']);
});

test('F4: งวดแรกที่บัญชีรับรองแล้วครอบไม่ตรงวันเริ่ม = ข้อชี้ช่วงบริการ (ช่องของฝ่ายขาย) ไม่ใช่เซลล์ที่ล็อก', () => {
  const rows = [
    inst(1, 'confirmed', '2026-02-01', '2026-04-30'),
    inst(2, 'pending', '2026-05-01', '2026-08-31'),
    inst(3, 'pending', '2026-09-01', '2026-12-31'),
  ];
  const issues = serviceSetupIssues(year2026(rows));
  assert.deepEqual(keys(issues), ['coverage_start']);
  const [issue] = issues;
  assert.deepEqual([issue.owner, issue.installmentId, issue.tab, issue.field], ['SA', null, 'overview', 'period']);
  assert.equal(serviceSetupFieldId(issue), 'svc-period');
  assert.equal(issue.message,
    'งวด 1 (บัญชีรับรองแล้ว): ครอบ 01/02/2026–30/04/2026 ไม่ตรงวันเริ่มบริการ — ปรับช่วงบริการให้ตรง หรือให้ฝ่ายบัญชีแก้ช่วงครอบของงวดนั้น');
  assertNoSaIssueOnConfirmed(issues, rows);

  const endRows = [
    inst(1, 'pending', '2026-01-01', '2026-04-30'),
    inst(2, 'pending', '2026-05-01', '2026-08-31'),
    inst(3, 'confirmed', '2026-09-01', '2026-11-30'),
  ];
  const end = serviceSetupIssues(year2026(endRows));
  assert.deepEqual(keys(end), ['coverage_end']);
  assert.deepEqual([end[0].installmentId, end[0].field, serviceSetupFieldId(end[0])], [null, 'period', 'svc-period']);
  assert.equal(end[0].message,
    'งวด 3 (บัญชีรับรองแล้ว): ครอบ 01/09/2026–30/11/2026 ไม่ตรงวันสิ้นสุดบริการ — ปรับช่วงบริการให้ตรง หรือให้ฝ่ายบัญชีแก้ช่วงครอบของงวดนั้น');
});

test('F4: ช่องโหว่ก่อนงวดที่รับรองแล้ว = ชี้งวดก่อนหน้าที่ยังแก้ได้ · ขนาบด้วยงวดรับรองทั้งสองข้าง = ของบัญชี ไม่มี "ไปแก้"', () => {
  const rows = [inst(1, 'pending', '2026-01-01', '2026-04-30'), inst(2, 'confirmed', '2026-06-01', '2026-12-31')];
  const issues = serviceSetupIssues(year2026(rows));
  assert.deepEqual(keys(issues), ['coverage_gap']);
  assert.deepEqual([issues[0].owner, issues[0].installmentId, issues[0].seq], ['SA', 'I1', 1]);
  assert.equal(issues[0].message, 'ช่วงครอบขาด 01/05/2026–31/05/2026');
  assertNoSaIssueOnConfirmed(issues, rows);

  const both = [inst(1, 'confirmed', '2026-01-01', '2026-04-30'), inst(2, 'confirmed', '2026-06-01', '2026-12-31')];
  const fn = serviceSetupIssues(year2026(both));
  assert.deepEqual(keys(fn), ['coverage_gap'], 'ยังบล็อก (ช่องโหว่ในช่วงที่จ่ายแล้ว) แต่เป็นของบัญชี');
  assert.deepEqual([fn[0].owner, fn[0].tag], ['FN', 'รอฝ่ายบัญชี']);
  assert.equal(fn[0].message, 'ช่วงครอบขาด 01/05/2026–31/05/2026 ระหว่างงวด 1 กับ งวด 2 ที่บัญชีรับรองแล้ว — ฝ่ายบัญชีแก้ที่แผงงวด');
});

test('F5: บรรทัดพิมพ์เองที่ฝ่ายขายเลือก "ไม่ใช่งานบริการ" ยังอยู่ในขั้นตั้งย้อนหลัง (ผู้จัดการตรวจ · เปลี่ยนกลับได้)', () => {
  const order = orderOf({ status: 'approved' });
  const lines = [manual(1, { serviceKind: 'not_service' })];
  assert.equal(serviceBackfillNeeded(order, lines), true);
  assert.equal(serviceSetupFlow(order, { lines }), 'backfill');
  const view = serviceSetupView(ctxOf({ order, lines, installments: [] }), { canEdit: true, userId: 'U1', role: 'ae' });
  assert.deepEqual([view.flow, view.mode, view.backfill.canSubmit], ['backfill', 'edit', true]);
  assert.deepEqual(view.issues, [], 'ไม่มีแพ็คเกจ = ยื่นตรวจได้ทันที (ผู้จัดการยืนยันว่า "ไม่มีงานบริการ")');
  // หมวดของบรรทัดบอกเองว่าไม่ใช่งานบริการ = ไม่มีอะไรให้ตั้ง (D25) · เลือกทับเป็นแพ็คเกจ = ต้องตั้ง
  const cat03 = (kind) => [manual(1, { metadata: { categoryCode: '03-002' }, serviceKind: kind })];
  assert.equal(serviceBackfillNeeded(order, cat03('not_service')), false);
  assert.equal(serviceSetupFlow(order, { lines: cat03('not_service') }), 'none');
  assert.equal(serviceBackfillNeeded(order, cat03('package')), true);
  assert.equal(serviceBackfillNeeded(order, [fgLine(1, 'FG-0233-03-002-00001')]), false);
});

test('F7: ข้อ "ยังไม่บันทึก" ชี้ปุ่ม "บันทึกงานบริการ" (svc-save) ไม่ใช่ null', () => {
  const [issue] = serviceSetupIssues({ unsaved: true });
  assert.equal(issue.key, 'unsaved');
  assert.equal(serviceSetupFieldId(issue), 'svc-save');
});

test('F10: ลูกค้าวางบิลได้ทุกวัน (ไม่มีรอบ) — ข้อความไม่ชวนไปหา "รอบ" ที่ไม่มีอยู่ · ข้อบอกรูปของรอบไว้ให้แผงรวมข้อ', () => {
  const anyday = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } };
  const issues = serviceSetupIssues(completeCtx({ customerBillingRule: anyday }));
  assert.equal(issues.filter((i) => i.key === 'billing_missing').length, 12);
  assert.equal(issues[0].message, 'งวด 1: ยังไม่ใส่วันวางบิล (ลูกค้าวางบิลได้ทุกวัน) — ใส่วันที่คอลัมน์วันวางบิล หรือเลือก ‘รอเหตุการณ์’');
  assert.equal(issues[0].billingMode, 'anyday');
  const monthly = { billing: { mode: 'monthly', days: [25] }, payment: { mode: 'credit', days: 30 } };
  const m = serviceSetupIssues(completeCtx({ customerBillingRule: monthly }));
  assert.equal(m[0].message, 'งวด 1: ยังไม่เลือกรอบวางบิล (ลูกค้ามีรอบวางบิล)');
  assert.equal(m[0].billingMode, 'monthly');
});

test('รุ่นสี่ (mig 0393): งวดที่ติ๊ก "งวดนี้ไม่ต้องวางบิล" ไม่ติดข้อวันวางบิล — ติ๊กคู่กับวันวางบิลไม่ได้ ⇒ ขอ = ยื่นไม่ได้ตลอดไป', () => {
  const required = { v: 4, need: 'required', billing: { mode: 'anyday' }, creditDays: 30, runs: null };
  const billingOf = (issues) => issues.filter((i) => i.key === 'billing_missing').map((i) => i.seq);
  // ลูกค้าต้องวางบิล: ทุกงวดที่ไม่มีวันวางบิลติด · งวด 1–2 ติ๊ก (เช่น มัดจำโอนก่อน) = ไม่ติด
  assert.equal(billingOf(serviceSetupIssues(completeCtx({ customerBillingRule: required }))).length, 12);
  const skipped = monthlyRows().map((row, i) => (i < 2 ? { ...row, billingSkip: true } : row));
  const issues = serviceSetupIssues(completeCtx({ customerBillingRule: required, installments: skipped }));
  assert.deepEqual(billingOf(issues), [3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  // กำหนดชำระยังบังคับเหมือนเดิม (ติ๊กยกเว้นแค่วันวางบิล)
  const noDue = monthlyRows({ dueDate: null, billingSkip: true });
  assert.equal(serviceSetupIssues(completeCtx({ customerBillingRule: required, installments: noDue }))
    .filter((i) => i.key === 'due_missing').length, 12);
  // ลูกค้าไม่ต้องวางบิล = ไม่มีข้อวันวางบิลเลย (nagsMissingBilling)
  assert.deepEqual(billingOf(serviceSetupIssues(completeCtx({ customerBillingRule: { v: 4, need: 'none', billing: null, creditDays: null, runs: null } }))), []);
});

test('#1846: ข้อวันงวดบอกว่าแผง "เติมวันงวดที่ว่าง…" แตะงวดนั้นแบบไหน (`dateFill` — ตัวเลือกงวดของแผง `fillTargetsOf`)', () => {
  const anyday = { billing: { mode: 'anyday' }, payment: { mode: 'credit', days: 30 } };
  const monthly = { billing: { mode: 'monthly', days: [25] }, payment: { mode: 'credit', days: 30 } };
  const billingOf = (issues) => issues.filter((i) => i.key === 'billing_missing');
  const dueOf = (issues) => issues.filter((i) => i.key === 'due_missing');
  const modes = (issues) => [...new Set(issues.map((i) => i.dateFill))];
  // เครดิต (ทุกวัน) + งวดมีกำหนดชำระแล้ว ขาดแค่วันวางบิล = ค่าตั้งต้นของแผงไม่แตะ (เติมเฉพาะงวดที่ว่างทั้งคู่) แต่ "จัดใหม่งวดที่มีวันแล้วด้วย"
  // แตะ ⇒ 'dated' — จอ backfill SO-26090206-0 (AR-015 · 12 งวด กำหนดชำระวันที่ 25 ไม่มีวันวางบิล)
  const dated = billingOf(serviceSetupIssues(completeCtx({ customerBillingRule: anyday })));
  assert.equal(dated.length, 12);
  assert.deepEqual(modes(dated), ['dated']);
  assert.equal('dateFillable' in dated[0], false, 'ธงบูลีนเดิมถูกแทน — ไม่มีสองชื่อพูดเรื่องเดียวกัน');
  // งวดที่ว่างทั้งคู่ = ค่าตั้งต้นของแผงเติมได้ ทั้งข้อวันวางบิลและข้อกำหนดชำระ
  const blank = serviceSetupIssues(completeCtx({ customerBillingRule: anyday, installments: monthlyRows({ dueDate: null }) }));
  assert.deepEqual(modes(billingOf(blank)), ['empty']);
  assert.deepEqual(modes(dueOf(blank)), ['empty']);
  // รายเดือน = งวดที่ยังไม่มีวันวางบิลเติมได้เสมอ (คงกำหนดชำระเดิม — planMonthlyFill)
  assert.deepEqual(modes(billingOf(serviceSetupIssues(completeCtx({ customerBillingRule: monthly })))), ['empty']);
  // มีวันวางบิลแล้วแต่ไม่มีกำหนดชำระ = ค่าตั้งต้นไม่แตะ (ทุกชนิดเติมเฉพาะงวดที่ยังไม่มีวันวางบิล) · จัดใหม่แตะ ⇒ 'dated'
  const billedOnly = dueOf(serviceSetupIssues(completeCtx({ installments: monthlyRows({ dueDate: null, billingDate: '2026-10-01' }) })));
  assert.equal(billedOnly.length, 12);
  assert.deepEqual(modes(billedOnly), ['dated']);
  // งวดที่ทั้งสองทางไม่แตะ (แจ้งชำระแล้ว — ไม่อยู่ในสถานะเปิดของตัวเติม) = null · ตัวตัดสินเดียวกับแผง ไม่ใช่กติกาที่เขียนซ้ำ
  const reported = monthlyRows().map((row, i) => (i < 2 ? { ...row, status: 'reported' } : row));
  const mixed = billingOf(serviceSetupIssues(completeCtx({ customerBillingRule: anyday, installments: reported })));
  assert.deepEqual(mixed.map((i) => i.dateFill), [null, null, ...Array(10).fill('dated')]);
});

test('F4: ครอบซ้อนที่งวดถูกซ้อนรับรองแล้ว = คำเตือนชี้งวดคู่ที่ยังแก้ได้ · รับรองทั้งคู่ = คำเตือนของบัญชี', () => {
  const rows = [inst(1, 'pending', '2026-01-01', '2026-06-30'), inst(2, 'confirmed', '2026-06-01', '2026-12-31')];
  const [w] = serviceSetupWarnings(year2026(rows));
  assert.deepEqual([w.key, w.owner, w.installmentId], ['coverage_overlap', 'SA', 'I1']);
  const both = [inst(1, 'confirmed', '2026-01-01', '2026-06-30'), inst(2, 'confirmed', '2026-06-01', '2026-12-31')];
  const [fn] = serviceSetupWarnings(year2026(both));
  assert.deepEqual([fn.owner, fn.tag], ['FN', 'รอฝ่ายบัญชี']);
});

test('F5: ใบเดิมที่ฝ่ายขายตัดสินว่าไม่มีแพ็คเกจเลย — โมดัลยื่น/อนุมัติพูดว่า "ยืนยันว่าไม่มีงานบริการ" ไม่ใช่ "เปิด 0 โซนให้ TS"', () => {
  const order = orderOf({ status: 'approved', approvedAt: '2026-09-17T09:00:00Z', actualAmount: 1000, totalAmount: 1000 });
  const ctx = ctxOf({ order, lines: [manual(1, { serviceKind: 'not_service', description: 'ค่าออกแบบ' })], installments: [] });
  const prompt = serviceBackfillSubmitPrompt(ctx);
  assert.equal(prompt.effects[0], 'ส่งการตัดสินว่าใบนี้ไม่มีแพ็คเกจบริการรายรอบ (ไม่ใช่งานบริการรายรอบ 1 รายการ) ให้ผู้จัดการฝ่ายขายตรวจ');
  const effects = serviceSetupApprovalEffects(ctx, { flow: 'backfill' });
  assert.equal(effects[0], 'ไม่มีแพ็คเกจบริการรายรอบ — ไม่เปิดโซนให้ TS (ยืนยันว่าใบนี้ไม่มีงานบริการ) · ไม่ใช่งานบริการรายรอบ 1 รายการ');
  assert.ok(effects.every((e) => !e.startsWith('ด่านเงินของบัญชีเริ่มใช้')), 'ไม่มีแพ็คเกจ = ด่านเงินไม่ขยาย');
  assert.deepEqual(serviceSetupApprovalChecklist(ctx, { flow: 'backfill' }), ['ตรวจว่าทุกรายการไม่ใช่งานบริการรายรอบจริง (ดูคำอธิบาย/หมายเหตุของแต่ละรายการ)']);
});

/* ══ เปิดแก้งานบริการหลังอนุมัติ (mig 0396 · มติเจ้าของ 29–30/09 · แผน IMPL_PLAN_REOPEN §5) ═══════════════════════ */

const S247_FG = 'FG-364-02-001-1061';
const REOPEN_AT = '2026-09-30T08:15:00Z';
/* ใบที่อนุมัติแล้วและส่งงานให้ TS แล้ว (ทรง SO-26090247-0: 2 บรรทัด FG 02-001 · โซนเดียว 2 แพ็ค · 12 รอบ · งวดเดียวแจ้งชำระแล้ว) */
const stampedOrder = (over = {}) => orderOf({
  orderNumber: 'SO-26090247-0', status: 'approved', approvedAt: '2026-09-29T04:00:00Z', serviceTermsOpenedAt: STAMP,
  servicePeriodFrom: '2026-10-22', servicePeriodTo: '2027-10-21', actualAmount: 84000, totalAmount: 84000, ...over,
});
function s247Ctx({ order = stampedOrder(), ...over } = {}) {
  return ctxOf({
    order,
    lines: [fgLine(1, S247_FG, { serviceRounds: 12 }), fgLine(2, S247_FG, { serviceRounds: 12 })],
    zones: [zone('Z1', 'S1', { name: 'Office' })],
    allocations: [alloc('SOL-1', 'Z1', 2, 0), alloc('SOL-2', 'Z1', 2, 0)],
    installments: [{ id: 'I1', seq: 1, status: 'reported', amount: 84000, dueDate: '2026-09-28', billingDate: null, billingEvent: null,
      coversFrom: '2026-10-22', coversTo: '2027-10-21' }],
    ...over,
  });
}
/* ใบที่เปิดแก้แล้ว (0396): ตราถูกล้าง + คอลัมน์เปิดแก้ */
const reopenedOrder = (over = {}) => stampedOrder({
  serviceTermsOpenedAt: null, serviceSetupReopenedAt: REOPEN_AT, serviceSetupReopenedById: 'U-AE',
  serviceSetupReopenedByName: 'Kamonrat P.', serviceSetupReopenedReason: 'SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน', ...over,
});

test('0396 ปุ่มแก้งานบริการโชว์ไหม: มีสิทธิ์ × ใบประทับ × มีอะไรให้แก้ — ขั้นอื่น/ไม่มีสิทธิ์/ไม่มีของ = ไม่โชว์', () => {
  const can = { canEdit: true };
  const ctx = s247Ctx();
  assert.equal(serviceSetupFlow(ctx.order, ctx), 'stamped');
  assert.equal(serviceReopenAvailable(ctx.order, ctx, can), true);
  assert.equal(serviceReopenAvailable(ctx.order, ctx, { canEdit: false }), false, 'ไม่มีสิทธิ์ = ไม่โชว์');
  assert.equal(serviceReopenAvailable(ctx.order, ctx), false, 'ค่าตั้งต้นไม่มีสิทธิ์');
  const at = (order, lines = ctx.lines) => serviceReopenAvailable(order, { ...ctx, order, lines }, can);
  assert.equal(at(stampedOrder({ serviceTermsOpenedAt: null })), false, 'ยังไม่ประทับ (ขั้นตั้งย้อนหลัง) — ปุ่มยื่นตรวจเดิมทำงาน');
  assert.equal(at(stampedOrder({ status: 'draft', serviceTermsOpenedAt: null })), false, 'ร่าง');
  assert.equal(at(stampedOrder({ status: 'pending_approval' })), false, 'รออนุมัติ');
  assert.equal(at(stampedOrder({ status: 'approval_revoked' })), false, 'ย้อนการอนุมัติแล้ว');
  assert.equal(at(stampedOrder({ supersededById: 'SO2' })), false, 'ถูก Rev. ทับ');
  assert.equal(at(stampedOrder({ origin: 'historical' })), false, 'ใบย้อนหลังไม่อยู่ในเส้นนี้');
  assert.equal(at(stampedOrder({ deal: PRODUCT_DEAL })), false, 'สายสินค้า');
  assert.equal(at(stampedOrder(), [fgLine(1, 'FG-0233-03-002-00001')]), false, 'ไม่มีอะไรให้แก้ (FG 03 ล้วน)');
  assert.equal(at(stampedOrder(), [manual(1, { serviceKind: 'not_service' })]), true, 'บรรทัดพิมพ์เองที่ตอบว่าไม่ใช่ = แก้คำตอบได้');
});

test('0396 ด่านของ POST: ไม่มีสิทธิ์ → ขั้นผิด → ไม่มีอะไรให้แก้ → ผ่าน (กติกาเดียวกับการโชว์ปุ่ม)', () => {
  const ctx = s247Ctx();
  assert.equal(serviceReopenStateError(ctx.order, ctx, { canEdit: false }), SERVICE_SETUP_EDIT_TEXT.noRight);
  const backfill = s247Ctx({ order: reopenedOrder() });
  assert.equal(serviceReopenStateError(backfill.order, backfill, { canEdit: true }),
    'แก้งานบริการได้เฉพาะใบที่อนุมัติแล้วและส่งงานให้ TS แล้ว (ยังไม่ถูกย้อน/ออก Rev./ยกเลิก) — โหลดหน้าใหม่');
  const nothing = { ...ctx, lines: [fgLine(1, 'FG-0233-03-002-00001')] };
  assert.equal(serviceReopenStateError(nothing.order, nothing, { canEdit: true }), 'ใบนี้ไม่มีรายการที่ตั้งงานบริการได้');
  assert.equal(serviceReopenStateError(ctx.order, ctx, { canEdit: true }), null);
});

test('0396 รหัสบล็อก → ข้อความ: แยกจำนวน · ตัดซ้ำ · สตริงคั่นจุลภาค · รหัสไม่รู้จักยังบล็อก', () => {
  assert.deepEqual(serviceReopenBlockers(['plans_active:1', 'visits_live:3', 'nothing_to_edit', 'plans_active:1']), [
    { code: 'plans_active', count: 1, text: 'TS ตั้งรอบบริการของใบนี้แล้ว 1 รอบ' },
    { code: 'visits_live', count: 3, text: 'มีนัดบริการจากรอบของใบนี้ 3 นัด' },
    { code: 'nothing_to_edit', count: null, text: 'ใบนี้ไม่มีรายการที่ตั้งงานบริการได้' },
  ]);
  assert.deepEqual(serviceReopenBlockers('site_visits_open:2, ml_set:1,,legacy_terms:1').map((b) => b.text), [
    'มีนัดอื่นที่ไซต์ของใบนี้ 2 นัด (สร้างหรือผ่านด่านหลังส่ง TS)',
    'TS ตั้งมาตรฐาน มล./เดือนไว้แล้ว 1 รอบขาย (ถอนแล้วค่าหาย)',
    'มีรอบขายที่ไม่ได้เกิดจากการตั้งงานบริการ 1 แถว — แจ้งผู้ดูแลระบบ',
  ]);
  assert.deepEqual(serviceReopenBlockers(['unread', 'money_fn:2']).map((b) => [b.code, b.count]), [['unread', null], ['money_fn', 2]]);
  assert.deepEqual(serviceReopenBlockers(['plans_paused:4']),
    [{ code: 'plans_paused', count: 4, text: 'ตรวจพบเงื่อนไขที่ระบบไม่รู้จัก (plans_paused:4) — แจ้งผู้ดูแลระบบ' }]);
  assert.deepEqual(serviceReopenBlockers([]), []);
  assert.deepEqual(serviceReopenBlockers(null), []);
  assert.deepEqual(Object.keys(SERVICE_REOPEN_BLOCKER_TEXT).sort(),
    ['legacy_terms', 'ml_set', 'money_fn', 'nothing_to_edit', 'plans_active', 'site_visits_open', 'unread', 'visits_live']);
});

test('0396 ข้อความบล็อกรวม (toast ของ GatedAction / 409): งานของ TS = ทางออก Rev. · บัญชีล้วน = ให้บัญชีแก้ · ไม่มีรหัส = null', () => {
  assert.equal(serviceReopenBlockedText([]), null);
  assert.equal(serviceReopenBlockedText(['plans_active:1', 'visits_live:3']),
    'แก้งานบริการไม่ได้ — TS ตั้งรอบบริการของใบนี้แล้ว 1 รอบ · มีนัดบริการจากรอบของใบนี้ 3 นัด'
    + ' · ทางแก้: ย้อนการอนุมัติแล้วออก Rev. (Rev. พารอบบริการและมาตรฐาน มล. ไปด้วย)');
  // งานของ TS ชนะ — ท้ายเดียวเสมอ
  const both = serviceReopenBlockedText(['ml_set:1', 'money_fn:1']);
  assert.ok(both.endsWith(SERVICE_REOPEN_TEXT.tailRevise), both);
  assert.ok(!both.includes(SERVICE_REOPEN_TEXT.tailFn));
  assert.equal(serviceReopenBlockedText(['money_fn:2']),
    'แก้งานบริการไม่ได้ — งวดชำระมี 2 ข้อที่ฝ่ายบัญชีต้องแก้ก่อน — เปิดแก้ตอนนี้แล้วจะยื่นตรวจกลับไม่ได้ และ TS จะไม่มีงานของใบนี้ระหว่างรอ'
    + ' · ให้ฝ่ายบัญชีแก้ช่วงครอบของงวดที่รับรองแล้วที่แท็บการชำระ แล้วกด ‘แก้งานบริการ’ อีกครั้ง');
  assert.equal(serviceReopenBlockedText(['unread']), 'แก้งานบริการไม่ได้ — ตรวจไม่ได้ว่า TS เริ่มงานของใบนี้หรือยัง — โหลดหน้าใหม่แล้วลองอีกครั้ง');
  assert.equal(serviceReopenBlockedText(['legacy_terms:1']), 'แก้งานบริการไม่ได้ — มีรอบขายที่ไม่ได้เกิดจากการตั้งงานบริการ 1 แถว — แจ้งผู้ดูแลระบบ');
});

test('0396 ด่านเงินของการยื่นกลับ (R4 g): ช่องโหว่ระหว่างงวดที่บัญชีรับรองแล้ว = money_fn · ข้อของฝ่ายขาย = แค่เตือน · ไม่มีแพ็คเกจ = ว่าง', () => {
  const fnRows = [inst(1, 'confirmed', '2026-01-01', '2026-04-30'), inst(2, 'confirmed', '2026-06-01', '2026-12-31')];
  const fnCtx = year2026(fnRows);
  const fn = serviceReopenMoneyIssues(fnCtx);
  assert.deepEqual(fn.fn.map((i) => [i.key, i.owner]), [['coverage_gap', 'FN']]);
  assert.deepEqual(fn.sa, []);
  assert.deepEqual(serviceReopenMoneyCodes(fnCtx), ['money_fn:1']);
  // ส่งข้อที่คิดไว้แล้วมาได้ (ไม่คิดซ้ำ)
  assert.deepEqual(serviceReopenMoneyCodes({}, serviceSetupIssues(fnCtx)), ['money_fn:1']);

  const saCtx = year2026([inst(1, 'pending', '2026-01-01', '2026-12-31', { dueDate: null })]);
  assert.deepEqual(serviceReopenMoneyCodes(saCtx), [], 'ข้อของฝ่ายขายไม่บล็อก');
  assert.deepEqual(serviceReopenMoneyIssues(saCtx).sa.map((i) => i.key), ['due_missing']);

  // ขอบช่วงเป็นงวดที่รับรองแล้ว — ชี้ช่องช่วงบริการ (area 'period') แต่ยังเป็นด่านเงินของฝ่ายขาย
  const edge = year2026([inst(1, 'confirmed', '2026-02-01', '2026-12-31')]);
  assert.deepEqual(serviceReopenMoneyIssues(edge).sa.map((i) => [i.key, i.area]), [['coverage_start', 'period']]);

  const none = ctxOf({ order: stampedOrder(), lines: [manual(1, { serviceKind: 'not_service' })], installments: [] });
  assert.deepEqual(serviceReopenMoneyIssues(none), { fn: [], sa: [] });
  assert.deepEqual(serviceReopenMoneyCodes(none), []);
  // fail-closed เหมือน serviceSetupIssues — ไม่มีตัวเลือก FG = throw
  assert.throws(() => serviceReopenMoneyCodes({ ...fnCtx, fgOptionIds: null }), /fgOptionIds/);
});

test('0396 ด่านเงิน (ตรวจทาน lib-01): ช่องโหว่ของบัญชีที่ซ่อนหลังงวดยังไม่รับรองที่ขาดช่วงครอบ = money_fn · งวดขาดที่ปิดช่องเองได้ = ไม่บล็อก', () => {
  // งวด 1–2 บัญชีรับรองแล้ว (ช่อง เม.ย. ระหว่างกัน) · งวด 3 ยังไม่รับรองและยังไม่มีช่วงครอบ ⇒ ด่านหลักหยุดเทียบ เห็นแค่ข้อของฝ่ายขาย
  const masked = year2026([
    inst(1, 'confirmed', '2026-01-01', '2026-03-31'),
    inst(2, 'confirmed', '2026-05-01', '2026-11-30'),
    inst(3, 'pending', null, null),
  ]);
  const main = serviceSetupIssues(masked);
  assert.ok(main.some((i) => i.key === 'coverage_missing' && i.owner === 'SA'));
  assert.ok(main.every((i) => i.owner !== 'FN'), 'ด่านหลักไม่เห็นช่องของบัญชี (ต้นเหตุของทางตัน)');
  // …แต่เปิดแก้ต้องเห็น: ฝ่ายขายเติมงวด 3 แล้ว ยื่นกลับจะเจอ coverage_gap ของบัญชี
  assert.deepEqual(serviceReopenMoneyIssues(masked).fn.map((i) => [i.key, i.owner, i.installmentId]), [['coverage_gap', 'FN', 'I2']]);
  assert.deepEqual(serviceReopenMoneyCodes(masked), ['money_fn:1']);
  assert.deepEqual(serviceReopenMoneyCodes(masked, main), ['money_fn:1'], 'ส่งข้อที่คิดไว้แล้วมาก็ยังเห็น (อ่านงวดจาก ctx)');
  // ใบเดียวกันที่งวด 3 ครอบ ธ.ค. แล้ว — ด่านหลักเห็นเอง · นับครั้งเดียว
  const unmasked = year2026([
    inst(1, 'confirmed', '2026-01-01', '2026-03-31'),
    inst(2, 'confirmed', '2026-05-01', '2026-11-30'),
    inst(3, 'pending', '2026-12-01', '2026-12-31'),
  ]);
  assert.deepEqual(serviceReopenMoneyCodes(unmasked), ['money_fn:1']);
  // งวดที่ยังไม่รับรองและขาดช่วงครอบอยู่ระหว่างสองงวดที่ขนาบช่อง (ตามลำดับงวด) = ฝ่ายขายเติมปิดช่องได้เอง ⇒ ไม่บล็อก
  const fillable = year2026([
    inst(1, 'confirmed', '2026-01-01', '2026-03-31'),
    inst(2, 'pending', null, null),
    inst(3, 'confirmed', '2026-05-01', '2026-12-31'),
  ]);
  assert.deepEqual(serviceReopenMoneyCodes(fillable), []);
  assert.deepEqual(serviceReopenMoneyIssues(fillable).sa.map((i) => i.key), ['coverage_missing']);
});

test('0396 โมดัลเปิดแก้ (ตรวจทาน lib-02): ข้อ ④ "ด่านช่วงครอบหลวม" ขึ้นเฉพาะเมื่อสวิตช์ระดับใบพลิกจริง — มีบรรทัด FG 02-001 ปน = ไม่ขึ้น', () => {
  const relaxLine = (effects) => effects.find((e) => e.startsWith('ระหว่างแก้ ด่านช่วงครอบของบัญชีหลวมลงชั่วคราว')) || null;
  // บรรทัดพิมพ์เองล้วน: ประทับ = ด่านเปิด · ล้างตรา = ปิด ⇒ บอก
  const manualOnly = completeCtx({ order: stampedOrder({ ...PERIOD }) });
  assert.equal(orderHasServiceRounds(manualOnly.order, manualOnly.lines), true);
  assert.equal(orderHasServiceRounds({ ...manualOnly.order, serviceTermsOpenedAt: null }, manualOnly.lines), false);
  assert.ok(relaxLine(serviceReopenPrompt(manualOnly).effects));
  // ปนบรรทัด FG 02-001: ด่านเปิดทั้งก่อนและหลังล้างตรา ⇒ ห้ามบอกว่าหลวม
  const mixed = completeCtx({ order: stampedOrder({ ...PERIOD }) });
  mixed.lines.push(fgLine(11, S247_FG, { serviceRounds: 12 }));
  mixed.allocations.push(alloc('SOL-11', 'Z1'));
  assert.equal(orderHasServiceRounds({ ...mixed.order, serviceTermsOpenedAt: null }, mixed.lines), true);
  assert.equal(relaxLine(serviceReopenPrompt(mixed).effects), null);
  // บรรทัด FG ที่ไม่ใช่แพ็คเกจ (03) ไม่เปิดด่าน ⇒ ยังบอก
  const freight = completeCtx({ order: stampedOrder({ ...PERIOD }) });
  freight.lines.push(fgLine(11, 'FG-0233-03-002-00001'));
  assert.ok(relaxLine(serviceReopenPrompt(freight).effects));
});

test('0396 ช่องที่แก้ได้หลังเปิดแก้ (R20): บรรทัด FG = แก้แพ็คเกจไม่ได้ · มีบรรทัดพิมพ์เอง = แก้แพ็คเกจได้ · คำจากแคตตาล็อก', () => {
  const { roundsLabel, packsLabel } = SERVICE_SETUP_LINE_TEXT;
  assert.equal(serviceReopenFieldsText(s247Ctx()),
    `ไซต์ · โซน · ${roundsLabel} · ${packsLabel} · ช่วงบริการ — แพ็คเกจของรายการที่มีรหัส FG แก้ไม่ได้ (ต้องออก Rev.)`);
  assert.equal(serviceReopenFieldsText(completeCtx()),
    `แพ็คเกจ (รายการพิมพ์เอง) · ไซต์ · โซน · ${roundsLabel} · ${packsLabel} · ช่วงบริการ`);
  const mixed = completeCtx();
  mixed.lines.push(fgLine(11, S247_FG));
  assert.ok(serviceReopenFieldsText(mixed).startsWith('แพ็คเกจ (รายการพิมพ์เอง) · '));
  assert.ok(serviceReopenFieldsText(mixed).endsWith('— แพ็คเกจของรายการที่มีรหัส FG แก้ไม่ได้ (ต้องออก Rev.)'));
  // บรรทัด FG ที่ไม่ใช่งานบริการ (03) ไม่นับเป็น "แพ็คเกจ FG"
  const withFreight = completeCtx();
  withFreight.lines.push(fgLine(11, 'FG-0233-03-002-00001'));
  assert.ok(!serviceReopenFieldsText(withFreight).includes('รหัส FG'));
});

test('0396 โมดัลเปิดแก้ (ภาคผนวก A.3): ใบ FG ล้วน = 3 ข้อ · แพ็คเกจของบรรทัดพิมพ์เอง = +ด่านช่วงครอบหลวม · ข้อด่านเงินของฝ่ายขาย = +ข้อ 5', () => {
  const prompt = serviceReopenPrompt(s247Ctx());
  assert.equal(prompt.title, 'แก้งานบริการหลังอนุมัติ');
  assert.equal(prompt.confirmLabel, 'เปิดแก้งานบริการ');
  assert.deepEqual(prompt.effects, [
    'ถอนงานบริการที่ส่ง TS แล้ว 1 โซนใน 1 ไซต์ (TS ยังไม่เริ่มงาน) — หายจาก “งานเข้าใหม่ › รอตั้งรอบ” ทันที',
    `ตารางงานบริการกลับมาแก้ได้ (${serviceReopenFieldsText(s247Ctx())}) แล้วต้องกด ‘ยื่นตรวจงานบริการ’ ให้ผู้จัดการฝ่ายขายอนุมัติอีกครั้ง จึงส่ง TS`,
    'ไม่แตะ Actual · ยอดใบ · เอกสาร · งวดชำระ · สถานะใบ (อนุมัติแล้วเหมือนเดิม) — Actual ก.ย. 2026 ฿84,000.00 · ยอดรวม ฿84,000.00 · งวดชำระ 1 งวด เท่าเดิม',
  ]);
  // ป้อน approvalPrompt → ReasonDialog ได้ตรง ๆ
  const dialog = approvalPrompt(prompt);
  assert.equal(dialog.title, 'แก้งานบริการหลังอนุมัติ');
  assert.equal(dialog.description, 'ยืนยันเปิดแก้ งานบริการของ SO-26090247-0 หรือไม่');
  assert.equal(dialog.confirmLabel, 'เปิดแก้งานบริการ');
  assert.ok(dialog.detail.startsWith('สิ่งที่จะเกิดขึ้นทันที:\n· ถอนงานบริการที่ส่ง TS แล้ว'));

  const manualCtx = completeCtx({ order: stampedOrder({ ...PERIOD }) });
  const manualPrompt = serviceReopenPrompt(manualCtx);
  assert.equal(manualPrompt.effects.length, 4);
  assert.equal(manualPrompt.effects[3],
    'ระหว่างแก้ ด่านช่วงครอบของบัญชีหลวมลงชั่วคราว — แพ็คเกจที่ตั้งให้รายการพิมพ์เอง 10 รายการยังไม่นับจนผู้จัดการอนุมัติงานบริการอีกครั้ง');

  const saMoney = completeCtx({ order: stampedOrder({ ...PERIOD }), installments: monthlyRows({ dueDate: null }) });
  const withMoney = serviceReopenPrompt(saMoney);
  assert.equal(withMoney.effects.length, 5);
  assert.match(withMoney.effects[4], /^ยื่นตรวจกลับได้เมื่อด่านงวดชำระผ่านด้วย — ตอนนี้ยังขาด 12 ข้อ \(งวด 1: ยังไม่ใส่กำหนดชำระ .* ฯลฯ\)$/);

  // ใบประทับที่ไม่มีโซน (ตอบว่าไม่ใช่งานบริการครบ) — ไม่พูดว่า "ถอน 0 โซน"
  const zero = serviceReopenPrompt(ctxOf({ order: stampedOrder(), lines: [manual(1, { serviceKind: 'not_service' })], installments: [] }));
  assert.equal(zero.effects[0], 'ใบนี้ยังไม่มีโซนที่ส่งให้ TS — ไม่มีอะไรหายจาก “งานเข้าใหม่ › รอตั้งรอบ”');
});

test('0396 "ใบนี้ถูกเปิดแก้หลังอนุมัติ" มีค่าเฉพาะตอนอยู่ในเส้นตั้งย้อนหลัง — อนุมัติใหม่แล้ว/ถูก Rev. ทับ/ย้อนการอนุมัติ = null', () => {
  assert.deepEqual(serviceSetupReopened(reopenedOrder()), {
    at: REOPEN_AT, byId: 'U-AE', byName: 'Kamonrat P.', reason: 'SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน',
  });
  assert.deepEqual(serviceSetupReopened(reopenedOrder({ serviceSetupState: 'submitted' }))?.byName, 'Kamonrat P.', 'รอตรวจยังเป็นใบที่เปิดแก้');
  assert.equal(serviceSetupReopened(reopenedOrder({ serviceTermsOpenedAt: STAMP })), null, 'อนุมัติใหม่แล้ว — คอลัมน์ค้างเป็นประวัติ');
  assert.equal(serviceSetupReopened(reopenedOrder({ supersededById: 'SO2' })), null);
  assert.equal(serviceSetupReopened(reopenedOrder({ status: 'approval_revoked' })), null);
  assert.equal(serviceSetupReopened(reopenedOrder({ origin: 'historical' })), null);
  assert.equal(serviceSetupReopened(stampedOrder({ serviceTermsOpenedAt: null })), null, 'ใบเดิมที่ไม่เคยเปิดแก้');
  assert.equal(serviceSetupReopened(null), null);
});

test('0396 view.reopen: ปุ่มโชว์ + ไม่มีรหัส = โมดัล · รหัสของฐาน = เหตุบล็อก · ไม่ได้อ่านรหัส = unread · ไม่มีสิทธิ์ = ไม่โชว์', () => {
  const ctx = s247Ctx();
  const open = serviceSetupView(ctx, { canEdit: true, userId: 'U-AE', role: 'ae', reopenBlockers: [] });
  assert.equal(open.flow, 'stamped');
  assert.equal(open.mode, 'read');
  assert.deepEqual(Object.keys(open.reopen).sort(), ['blockedReason', 'blockers', 'canReopen', 'prompt', 'visible']);
  assert.equal(open.reopen.visible, true);
  assert.equal(open.reopen.canReopen, true);
  assert.equal(open.reopen.blockedReason, null);
  assert.deepEqual(open.reopen.blockers, []);
  assert.deepEqual(open.reopen.prompt, serviceReopenPrompt(ctx));
  assert.equal(open.reopened, null, 'ใบประทับ = ยังไม่ได้เปิดแก้');

  const blocked = serviceSetupView(ctx, { canEdit: true, userId: 'U-AE', role: 'ae', reopenBlockers: ['plans_active:1'] });
  assert.equal(blocked.reopen.visible, true, 'บล็อก = ยังโชว์ (บอกเหตุตอนกด)');
  assert.equal(blocked.reopen.blockedReason, serviceReopenBlockedText(['plans_active:1']));
  assert.equal(blocked.reopen.prompt, null);
  assert.deepEqual(blocked.reopen.blockers.map((b) => b.code), ['plans_active']);

  const unread = serviceSetupView(ctx, { canEdit: true, userId: 'U-AE', role: 'ae' });
  assert.equal(unread.reopen.blockedReason, serviceReopenBlockedText(['unread']), 'ไม่ได้อ่านรหัสของฐาน = ปิดไว้ก่อน');

  const reader = serviceSetupView(ctx, { canEdit: false, userId: 'U-FN', role: 'finance', reopenBlockers: [] });
  assert.deepEqual(reader.reopen, { visible: false, canReopen: false, blockedReason: null, blockers: [], prompt: null });

  // รหัส JS (money_fn) ต่อท้ายรหัสของฐานเสมอ · ส่งมาเองแล้วก็ไม่ซ้ำ
  const fnRows = [
    { ...monthlyRows()[0], id: 'I1', seq: 1, status: 'confirmed', coversFrom: '2026-10-22', coversTo: '2027-01-21' },
    { ...monthlyRows()[1], id: 'I2', seq: 2, status: 'confirmed', coversFrom: '2027-03-01', coversTo: '2027-10-21' },
  ];
  const money = s247Ctx({ installments: fnRows });
  const moneyView = serviceSetupView(money, { canEdit: true, userId: 'U-AE', role: 'ae', reopenBlockers: ['visits_live:2', 'money_fn:9'] });
  assert.deepEqual(moneyView.reopen.blockers.map((b) => [b.code, b.count]), [['visits_live', 2], ['money_fn', 1]]);
  assert.ok(moneyView.reopen.blockedReason.endsWith(SERVICE_REOPEN_TEXT.tailRevise));
});

test('0396 ใบที่เปิดแก้แล้ว: flow backfill · view.reopened (ผู้/เวลา/เหตุ/ช่องที่แก้ได้) · หัวใบ · ผู้จัดการเห็นเหตุผล · ด่านเงิน "ใช้ตามเดิม"', () => {
  const ctx = s247Ctx({ order: reopenedOrder() });
  const view = serviceSetupView(ctx, { canEdit: true, userId: 'U-AE', role: 'ae', reopenBlockers: ['plans_active:1'] });
  assert.equal(view.flow, 'backfill');
  assert.equal(view.mode, 'edit');
  assert.equal(view.backfill.canSubmit, true);
  assert.equal(view.reopen.visible, false, 'เปิดแก้แล้ว — ปุ่มยื่นตรวจทำงานแทน');
  assert.deepEqual(view.reopened, {
    at: REOPEN_AT, byId: 'U-AE', byName: 'Kamonrat P.', reason: 'SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน',
    fields: serviceReopenFieldsText(ctx),
  });
  assert.deepEqual([view.state.reopenedAt, view.state.reopenedByName, view.state.reopenedReason],
    [REOPEN_AT, 'Kamonrat P.', 'SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน']);
  assert.ok(view.hero.sub.endsWith(' · เปิดแก้ — ยังไม่ส่ง TS'), view.hero.sub);
  assert.equal(SERVICE_REOPENED_TEXT.bannerLine(view.reopened),
    `เปิดแก้โดย Kamonrat P. 30/09/2026 · เหตุผล: SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน — แก้ ${view.reopened.fields}`
    + ' แล้วยื่นให้ผู้จัดการฝ่ายขายตรวจ · ยอด/Actual/เอกสารไม่เปลี่ยน');
  assert.equal(SERVICE_REOPENED_TEXT.railLine(view.reopened), 'เปิดแก้ 30/09/2026 โดย Kamonrat P. · SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน');

  // ยื่นตรวจแล้ว → ผู้จัดการ: เหตุผลขึ้นเป็นข้อแรกของสิ่งที่ต้องตรวจ · ด่านเงิน "ใช้ตามเดิม" · หัวใบกลับเป็น "รอตรวจ"
  const sent = s247Ctx({ order: reopenedOrder({ serviceSetupState: 'submitted', serviceSetupSubmittedById: 'U-AE', serviceSetupSubmittedByName: 'Kamonrat P.' }) });
  const review = serviceSetupView(sent, { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' });
  assert.equal(review.backfill.canReview, true);
  assert.equal(review.approvalChecklist[0], 'เหตุที่เปิดแก้: SA คีย์โซนผิด — รายการ 2 ต้องเป็นอีกโซน (Kamonrat P. 30/09/2026)');
  assert.ok(review.approvalEffects.includes('ด่านเงินของบัญชีใช้กับใบนี้ตามเดิม: งวดที่ยังไม่รับรองต้องมีช่วงครอบก่อนรับรอง (ครบแล้ว 1 งวด)'));
  assert.ok(!review.approvalEffects.some((e) => e.startsWith('ด่านเงินของบัญชีเริ่มใช้')));
  assert.ok(review.hero.sub.endsWith(' · รอตรวจ'), review.hero.sub);

  // ใบเดิมที่ไม่เคยเปิดแก้ — ไม่มีข้อเหตุผล · ด่านเงิน "เริ่มใช้" เหมือนเดิม
  const legacy = s247Ctx({ order: stampedOrder({ serviceTermsOpenedAt: null, serviceSetupState: 'submitted' }) });
  assert.equal(serviceSetupView(legacy, { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' }).reopened, null);
  assert.ok(serviceSetupApprovalChecklist(legacy, { flow: 'backfill' })[0].startsWith('ตรวจแพ็คเกจ'));
  assert.ok(serviceSetupApprovalEffects(legacy, { flow: 'backfill' }).some((e) => e.startsWith('ด่านเงินของบัญชีเริ่มใช้')));
});

test('0396 อนุมัติงานบริการย้อนหลังของใบ Rev. ย้ายรอบบริการของใบเดิมเหมือนอนุมัติใบ (R13)', () => {
  const ctx = s247Ctx({
    order: reopenedOrder({ serviceSetupState: 'submitted', revisedFromId: 'SO0' }),
    predecessor: { id: 'SO0', orderNumber: 'SO-26090001-0', activePlanSiteIds: ['S1', 'S9'] },
  });
  assert.ok(serviceSetupApprovalEffects(ctx, { flow: 'backfill' })
    .includes('ย้ายรอบบริการ 1 ไซต์จาก SO-26090001-0 มาใบนี้ · ไซต์ที่ใบนี้ไม่มีแล้ว 1 ไซต์ TS จะเห็นเป็นรอบของใบเดิมให้ตัดสิน'));
});

test('0396 คำ: ท้ายการ์ดใบประทับ · toast · ข้อความฐานใหม่ — อ่านคำรอบ/แพ็คจากแคตตาล็อก ไม่มีคำเก่า', () => {
  const { roundsLabel, packsLabel } = SERVICE_SETUP_LINE_TEXT;
  assert.equal(SERVICE_REOPEN_TEXT.button, 'แก้งานบริการ');
  assert.equal(SERVICE_REOPEN_TEXT.stampedFooter,
    `หลังอนุมัติ แพ็คเกจ/โซน/${packsLabel}/ช่วงบริการล็อก — กด ‘แก้งานบริการ’ เพื่อเปิดแก้ได้ก่อน TS เริ่มงาน`
    + ` · หลังจากนั้นย้อนการอนุมัติแล้วออก Rev. · ${roundsLabel}แก้ที่ดินสอได้เสมอ`);
  assert.ok(SERVICE_REOPEN_TEXT.stampedFooterNoRight.includes(packsLabel));
  assert.ok(!SERVICE_REOPEN_TEXT.stampedFooterNoRight.includes('‘แก้งานบริการ’'), 'ไม่มีสิทธิ์ = ไม่ชี้ปุ่มที่ตัวเองไม่เห็น');
  assert.equal(SERVICE_REOPEN_TEXT.toast(2), 'เปิดแก้งานบริการแล้ว (ถอนจาก TS 2 รอบขาย) — แก้ในการ์ด ‘งานบริการ’ แล้วกด ‘ยื่นตรวจงานบริการ’');
  assert.equal(SERVICE_REOPEN_TEXT.toast(0), 'เปิดแก้งานบริการแล้ว — แก้ในการ์ด ‘งานบริการ’ แล้วกด ‘ยื่นตรวจงานบริการ’');
  assert.deepEqual([SERVICE_REOPEN_TEXT.reasonMin, SERVICE_REOPEN_TEXT.reasonMax], [10, 500]);
  for (const code of ['service_setup_reopen_state_invalid', 'service_setup_reopen_blocked', 'service_setup_reopen_busy']) {
    assert.equal(SERVICE_SETUP_SQL_MESSAGES[code].status, 409, code);
    assert.equal(serviceSetupSqlMessage({ message: code }).code, code, 'แปลรหัสได้ตรงตัว (ไม่ชนคีย์อื่น)');
  }
  assert.equal(serviceSetupSqlMessage({ message: 'service_setup_state_invalid' }).code, 'service_setup_state_invalid');
  assert.match(SERVICE_SETUP_SQL_MESSAGES.sales_order_service_setup_locked.message, /กด ‘แก้งานบริการ’ \(ก่อน TS เริ่มงาน\)/);
  const texts = [
    ...Object.values(SERVICE_REOPEN_TEXT).map((v) => (typeof v === 'function' ? v(3) : String(v))),
    ...Object.values(SERVICE_REOPEN_BLOCKER_TEXT).map((fn) => fn(3)),
    ...Object.values(SERVICE_REOPENED_TEXT).map((v) => (typeof v === 'function' ? String(v({ at: REOPEN_AT, byName: 'x', reason: 'y', fields: 'z' }) ?? '') : String(v))),
    ...['not_started', 'editing', 'submitted', 'rejected'].map((state) => SERVICE_REOPENED_TEXT.stateLabel(state)),
    SERVICE_SETUP_EDIT_TEXT.stamped,
    SERVICE_SETUP_SQL_MESSAGES.service_setup_reopen_blocked.message,
    ...serviceReopenPrompt(completeCtx({ order: stampedOrder({ ...PERIOD }) })).effects,
  ];
  for (const t of texts) {
    assert.doesNotMatch(t, /ไปกี่รอบ|แต่ละครั้งกี่แพ็ค/, t);
    assert.doesNotMatch(t, /(?<![฀-๿])ไป \d+ รอบ/, t);
  }
});

/* ══ ช่วงบริการ "ทั้งใบช่วงเดียว | แยกรายรายการ" (mig 0400 · มติเจ้าของ 01/10) ═════════════════════════════════════
   ของจริงย่อส่วน: SO-26090206-0 (Jim Thompson) 5 สาขา 4 ช่วง — แต่ละรายการมีช่วงของตัวเอง · ช่วงของใบ = ช่วงรวม
   (RPC เก็บเมื่อรายการแพ็คเกจครบทุกรายการ · ยังไม่ครบ = ว่าง) */

const LINE = { servicePeriodMode: 'line' };
const lp = (from, to) => ({ servicePeriodFrom: from, servicePeriodTo: to });
const P12 = lp('2026-10-01', '2027-09-30');           // 12 เดือน — ตรงกับ 12 งวดของ monthlyRows()
const codesOf = (issues) => issues.map((i) => [i.key, i.lineId, i.zoneId].filter((v) => v !== null && v !== undefined).join(':'));

/* n รายการแพ็คเกจที่ตั้งครบ (FG · 12 รอบ · โซนละไซต์) · `periods[k]` = ช่วงของรายการ k+1 (null = ยังไม่ใส่) */
function lineModeCtx(periods, { order = {}, ...over } = {}) {
  const lines = periods.map((period, k) => done(k + 1, period || {}));
  const sites = lines.map((_, k) => site(`S${k + 1}`));
  const zones = lines.map((_, k) => zone(`Z${k + 1}`, `S${k + 1}`));
  const allocations = lines.map((line, k) => alloc(line.id, `Z${k + 1}`));
  return ctxOf({ order: orderOf({ ...LINE, ...order }), lines, sites, zones, allocations, ...over });
}

test('0400 โหมดช่วงบริการของใบ: line เฉพาะใบ pipeline ที่เก็บ line · ใบย้อนหลัง/ไม่มีคอลัมน์/ค่าอื่น = whole', () => {
  assert.equal(SERVICE_PERIOD_MODE_WHOLE, 'whole');
  assert.equal(SERVICE_PERIOD_MODE_LINE, 'line');
  assert.equal(servicePeriodModeOf(orderOf(LINE)), 'line');
  assert.equal(servicePeriodModeOf(orderOf({ servicePeriodMode: 'whole' })), 'whole');
  assert.equal(servicePeriodModeOf(orderOf()), 'whole', 'select ที่ไม่พกคอลัมน์ = ทั้งใบ');
  assert.equal(servicePeriodModeOf(orderOf({ origin: 'historical', servicePeriodMode: 'line' })), 'whole', 'ใบย้อนหลังช่วงเดียวเสมอ');
  for (const bad of [null, undefined, {}, { servicePeriodMode: 'LINE' }, { servicePeriodMode: 1 }, { servicePeriodMode: null }]) {
    assert.equal(servicePeriodModeOf(bad), 'whole', JSON.stringify(bad));
  }
});

test('0400 ตัวช่วยช่วง: ช่วงที่ใช้ได้ · ช่วงของบรรทัด · ช่วงรวม · ช่วงที่ใช้กับบรรทัดตามโหมด', () => {
  assert.deepEqual(validServicePeriod({ from: '2026-10-01', to: '2027-09-30' }), { from: '2026-10-01', to: '2027-09-30' });
  for (const bad of [null, {}, { from: '2026-10-01' }, { from: '2026-10-02', to: '2026-10-01' }, { from: '2026-02-30', to: '2026-03-01' }, { from: 'x', to: 'y' }]) {
    assert.equal(validServicePeriod(bad), null, JSON.stringify(bad));
  }
  assert.deepEqual(linePeriodOf(done(1, P12)), { from: '2026-10-01', to: '2027-09-30' });
  assert.equal(linePeriodOf(done(1)), null, 'บรรทัดจาก select เดิม (ไม่มีคอลัมน์) = ไม่มีช่วง');
  assert.equal(linePeriodOf({ servicePeriodFrom: null, servicePeriodTo: null }), null);
  assert.equal(linePeriodOf({ servicePeriodFrom: '', servicePeriodTo: '' }), null, 'ช่องว่างจากจอ = ไม่มีช่วง');
  assert.deepEqual(linePeriodOf({ servicePeriodFrom: '2026-10-01', servicePeriodTo: null }), { from: '2026-10-01', to: null }, 'ครึ่งเดียวคืนตามที่มี (ตัวตรวจตัดสินว่าใช้ไม่ได้)');

  assert.deepEqual(periodEnvelope([
    { from: '2026-09-25', to: '2027-09-24' }, { from: '2026-09-02', to: '2027-09-01' }, null,
    { from: '2026-09-26', to: '2027-09-25' }, { from: '2026-10-01', to: '' }, { from: '2028-01-01', to: '2027-01-01' },
  ]), { from: '2026-09-02', to: '2027-09-25' }, 'เริ่มแรกสุด → จบสุดท้าย · ข้ามช่วงที่ใช้ไม่ได้');
  assert.equal(periodEnvelope([]), null);
  assert.equal(periodEnvelope([null, { from: '2026-10-01', to: null }]), null);
  assert.equal(periodEnvelope(null), null);

  const line = done(1, lp('2026-11-01', '2026-11-30'));
  const whole = { order: orderOf(PERIOD) };
  assert.deepEqual(serviceLinePeriod(line, whole), { from: '2026-10-01', to: '2027-09-30' }, 'โหมดทั้งใบ = ช่วงของใบ (ไม่อ่านช่วงของบรรทัด)');
  assert.deepEqual(serviceLinePeriod(line, { order: orderOf({ ...PERIOD, ...LINE }) }), { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(serviceLinePeriod(done(2), { order: orderOf({ ...PERIOD, ...LINE }) }), null, 'แยกรายรายการ: ยังไม่ใส่ = null ไม่ถอยไปช่วงรวม');
  assert.deepEqual(serviceLinePeriod(line, { periodMode: 'line' }), { from: '2026-11-01', to: '2026-11-30' }, 'จอส่งโหมดมาเอง (ไม่มีใบ)');
  assert.equal(serviceLinePeriod(line, {}), null, 'ไม่มีทั้งใบและโหมด = ทั้งใบ ซึ่งไม่มีช่วง');
  assert.deepEqual(serviceLinePeriod(line, { order: orderOf({ ...PERIOD, ...LINE }), periodMode: 'whole' }), { from: '2026-10-01', to: '2027-09-30' },
    'ctx.periodMode ชนะโหมดของใบ');
});

test('0400 ข้อที่ยังขาด โหมดแยกรายรายการ: line_period_missing เป็นข้อแรกของรายการ · ไม่มี period_missing คู่กัน (ลำดับเดียวกับฐาน · PL1 ของฮาร์เนส)', () => {
  /* ฮาร์เนส PL1: a = ครบ+ช่วง · b = โซนแล้วไม่มีรอบไม่มีช่วง · c = ตอบใช่อย่างเดียว · d = ยังไม่ตอบ */
  const lines = [
    done(1, P12),
    done(2, { serviceRounds: null }),
    manual(3, { serviceKind: 'package' }),
    manual(4),
  ];
  const ctx = ctxOf({
    order: orderOf(LINE), lines,
    sites: [site('S1'), site('S2')], zones: [zone('Z1', 'S1'), zone('Z2', 'S2')],
    allocations: [alloc('SOL-1', 'Z1'), alloc('SOL-2', 'Z2')],
  });
  const issues = serviceSetupIssues(ctx);
  assert.deepEqual(codesOf(issues), [
    'line_period_missing:SOL-2', 'rounds_missing:SOL-2',
    'line_period_missing:SOL-3', 'fg_missing:SOL-3', 'rounds_missing:SOL-3', 'zones_missing:SOL-3',
    'kind_missing:SOL-4',
  ]);
  const first = issues[0];
  assert.equal(first.message, 'รายการ 2: ยังไม่ใส่ช่วงบริการของรายการ (วันเริ่ม–วันสิ้นสุด)');
  assert.deepEqual({ area: first.area, tab: first.tab, owner: first.owner, field: first.field, lineId: first.lineId, lineNo: first.lineNo },
    { area: 'lines', tab: 'overview', owner: 'SA', field: 'period', lineId: 'SOL-2', lineNo: 2 });
  assert.equal(serviceSetupFieldId(first), 'svc-line-SOL-2-period', '"ไปแก้" ลงที่ช่อง "เริ่ม" ของรายการ ไม่ใช่ช่วงของใบ');
  assert.deepEqual(issuesByTab(issues), { overview: 7, payment: 0 });

  /* ฮาร์เนส PL4: สองรายการไม่มีช่วง */
  const pl4 = ctxOf({
    order: orderOf(LINE), lines: [done(1, { serviceRounds: 12 }), done(2, { serviceRounds: null })],
    sites: [site('S1')], zones: [zone('Z2', 'S1')], allocations: [alloc('SOL-2', 'Z2')],
  });
  assert.deepEqual(codesOf(serviceSetupIssues(pl4)),
    ['line_period_missing:SOL-1', 'zones_missing:SOL-1', 'line_period_missing:SOL-2', 'rounds_missing:SOL-2']);
  /* ช่วงของรายการครึ่งเดียว/กลับหัว (ฐานกันด้วย CHECK — จอส่งมาได้) = ยังไม่มีช่วง */
  for (const bad of [lp('2026-10-01', null), lp('2027-01-01', '2026-01-01')]) {
    assert.equal(codesOf(serviceSetupIssues(lineModeCtx([P12, bad])))[0], 'line_period_missing:SOL-2', JSON.stringify(bad));
  }
});

test('0400 🔴 period_missing ปิดเมื่อพลาด (L2): รายการครบแต่ช่วงของใบว่าง = period_missing · ครบ + ช่วงรวม = ผ่าน (PL3 ของฮาร์เนส)', () => {
  const two = [lp('2026-10-01', '2027-03-31'), lp('2027-04-01', '2027-09-30')];
  /* ไม่ควรเกิดผ่าน RPC (ทุกการบันทึกคิดช่วงรวมให้) — แก้ข้อมูลนอกทางแล้วช่วงของใบหาย: ด่านต้องไม่ปล่อยผ่านเงียบ */
  const emptied = lineModeCtx(two);
  assert.deepEqual(codesOf(serviceSetupIssues(emptied)), ['period_missing']);
  assert.equal(serviceSetupFieldId(serviceSetupIssues(emptied)[0]), 'svc-period');
  /* ครบ + ช่วงรวมที่ RPC เก็บ (01/10/2026–30/09/2027) + 12 งวดครอบต่อเนื่อง = ผ่าน */
  assert.deepEqual(serviceSetupIssues(lineModeCtx(two, { order: PERIOD })), []);
  /* ใบที่ไม่มีแพ็คเกจเลย (โหมด line) = ผ่าน ไม่ถามช่วง */
  assert.deepEqual(serviceSetupIssues(ctxOf({ order: orderOf(LINE), lines: [manual(1, { serviceKind: 'not_service' })], installments: [] })), []);
});

test('0400 โหมดทั้งใบเหมือนเดิมทุกตัวอักษร: ไม่มีคอลัมน์ใหม่ = มีคอลัมน์แต่เป็น whole · ช่วงของรายการที่ค้าง (ไม่ควรมี) ไม่ถูกอ่าน', () => {
  const base = completeCtx();
  base.lines[1] = { ...base.lines[1], serviceRounds: null };
  base.allocations[2] = { ...base.allocations[2], packsPerRound: null };
  const withCols = {
    ...base,
    order: { ...base.order, servicePeriodMode: 'whole' },
    lines: base.lines.map((line, k) => ({ ...line, ...(k === 0 ? lp('2026-11-01', '2026-11-30') : lp(null, null)) })),
  };
  const noPeriod = (ctx) => ({ ...ctx, order: { ...ctx.order, servicePeriodFrom: null, servicePeriodTo: null } });
  for (const [a, b] of [[base, withCols], [noPeriod(base), noPeriod(withCols)]]) {
    assert.deepEqual(serviceSetupIssues(b), serviceSetupIssues(a));
    assert.deepEqual(serviceSetupWarnings(b), serviceSetupWarnings(a));
    assert.equal(serviceSetupStripText(b), serviceSetupStripText(a));
    assert.equal(serviceSetupSubmitLine(b), serviceSetupSubmitLine(a));
    assert.equal(serviceSetupRevisionLine(b), serviceSetupRevisionLine(a));
    assert.deepEqual(serviceSetupApprovalEffects(b), serviceSetupApprovalEffects(a));
    assert.deepEqual(serviceSetupApprovalChecklist(b), serviceSetupApprovalChecklist(a));
    assert.deepEqual(serviceSetupHeroFact(b, { flow: 'pipeline' }), serviceSetupHeroFact(a, { flow: 'pipeline' }));
  }
  assert.equal(keys(serviceSetupIssues(noPeriod(withCols))).includes('line_period_missing'), false);
  assert.equal(keys(serviceSetupIssues(noPeriod(withCols))).at(-1), 'period_missing', 'ทั้งใบ: period_missing ข้อท้ายของงานบริการเหมือนเดิม');
  /* ตัวเลขทั้งใบ: คีย์เดิมทุกตัวค่าเดิม (คีย์ใหม่ต่อท้าย) */
  const { periodLines, periodFilled, ...rest } = serviceSetupTotals(withCols);
  const { periodLines: p0, periodFilled: f0, ...rest0 } = serviceSetupTotals(base);
  assert.deepEqual(rest, rest0);
  assert.deepEqual([periodLines, p0, f0], [10, 10, 0]);
  assert.equal(periodFilled, 1, 'นับช่วงของบรรทัดที่มีอยู่จริง (โหมดทั้งใบฐานล้างให้เป็น 0)');
});

test('0400 ด่านช่วงครอบของงวดเทียบกับช่วงรวมของใบ: รายการครบ = เทียบ · ยังไม่ครบ (ช่วงของใบว่าง) = ไม่มีข้อช่วงครอบ มีแต่ข้อรายรายการ', () => {
  const two = [lp('2026-10-01', '2027-03-31'), lp('2027-04-01', '2027-09-30')];
  /* ครบ: ช่วงรวม 01/10/2026–31/10/2027 (รายการ 2 จบช้ากว่างวด) ⇒ งวดครอบจบสั้น */
  const longer = lineModeCtx([two[0], lp('2027-04-01', '2027-10-31')], { order: { servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-10-31' } });
  const end = serviceSetupIssues(longer);
  assert.deepEqual(keys(end), ['coverage_end']);
  assert.match(end[0].message, /^ช่วงครอบไม่ตรงวันสิ้นสุดบริการ \(01\/10\/2027–31\/10\/2027\)$/);
  /* ครบ: ช่วงรวมเริ่มก่อนงวดแรก ⇒ เริ่มช้า */
  const earlier = lineModeCtx([lp('2026-09-02', '2027-03-31'), two[1]], { order: { servicePeriodFrom: '2026-09-02', servicePeriodTo: '2027-09-30' } });
  assert.deepEqual(keys(serviceSetupIssues(earlier)), ['coverage_start']);
  /* ยังไม่ครบ: RPC ไม่เก็บช่วงรวมครึ่งเดียว ⇒ ช่วงของใบว่าง ⇒ ไม่มี coverage_start/gap/end (ไม่เทียบกับช่วงที่ยังขยับ) */
  const partial = lineModeCtx([two[0], null]);
  assert.deepEqual(codesOf(serviceSetupIssues(partial)), ['line_period_missing:SOL-2']);
  assert.deepEqual(serviceSetupWarnings(partial).filter((w) => w.key.startsWith('coverage')), []);
  /* ด่านเงินของการเปิดแก้ (0396) อ่านช่วงของใบตัวเดียวกัน — ยังไม่ครบ = ไม่มีข้อของบัญชี */
  assert.deepEqual(serviceReopenMoneyIssues(partial), { fn: [], sa: [] });
  assert.deepEqual(serviceReopenMoneyCodes(partial), []);
});

test('0400 ตัวเลขทั้งใบ: ตัวนับช่วง · "ครบ" ของโหมดแยกรายรายการต้องมีช่วงของรายการ · บริบทที่ไม่มีใบ/โหมด (คิวรายการใบ) = ทั้งใบ', () => {
  const ctx = lineModeCtx([P12, null, lp('2026-12-01', '2027-11-30')]);
  const totals = serviceSetupTotals(ctx);
  assert.deepEqual([totals.lineCount, totals.packageLines, totals.completeLines, totals.periodLines, totals.periodFilled], [3, 3, 2, 3, 2]);
  assert.deepEqual(servicePeriodCounters(ctx), { total: 3, filled: 2 });
  /* รูปของคิวรายการใบ (`serviceSetupTotals({ lines, allocations, zonesById })`) — ไม่มีใบ ไม่มีโหมด = ทั้งใบ: "ครบ" ไม่ถามช่วง */
  const bare = { lines: ctx.lines, allocations: ctx.allocations, zonesById: ctx.zonesById };
  assert.equal(serviceSetupTotals(bare).completeLines, 3);
  assert.equal(serviceSetupTotals({ ...bare, order: orderOf() }).completeLines, 3);
  /* จอ/ถังใบเดิมของ TS ส่งโหมดมาเอง */
  assert.equal(serviceSetupTotals({ ...bare, periodMode: 'line' }).completeLines, 2);
  assert.equal(serviceSetupTotals({ ...bare, periodMode: 'whole', order: orderOf(LINE) }).completeLines, 3, 'ctx.periodMode ชนะโหมดของใบ');
  /* รายการไม่ใช่งานบริการ/ยังไม่ตอบ ไม่อยู่ในตัวนับช่วง */
  const mixed = ctxOf({ order: orderOf(LINE), lines: [done(1, P12), manual(2, { serviceKind: 'not_service' }), manual(3)] });
  assert.deepEqual(servicePeriodCounters(mixed), { total: 1, filled: 1 });
  assert.deepEqual(servicePeriodCounters({}), { total: 0, filled: 0 });
});

test('0400 คำเตือนรอบน้อยคิดจากช่วงของรายการนั้น (ไม่ใช่ช่วงรวมของใบ)', () => {
  /* รายการ 1: 1 รอบใน 12 เดือน = เตือน · รายการ 2: 1 รอบในช่วง 1 เดือน = ไม่เตือน (ช่วงรวมของใบ 13 เดือนไม่เกี่ยว) · รายการ 3 ไม่มีช่วง = ไม่เตือน */
  const ctx = lineModeCtx([P12, lp('2027-10-01', '2027-10-31'), null], { order: { servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-10-31' } });
  ctx.lines = ctx.lines.map((line) => ({ ...line, serviceRounds: 1 }));
  const low = serviceSetupWarnings(ctx).filter((w) => w.key === 'rounds_low');
  assert.deepEqual(low.map((w) => [w.lineId, w.message]), [
    ['SOL-1', 'รายการ 1: จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็ยื่นได้)'],
  ]);
  assert.deepEqual(serviceSetupApprovalChecklist(ctx).filter((line) => line.includes('ตรวจอีกครั้ง')),
    ['รายการ 1: จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็อนุมัติได้)']);
  /* ใบเดียวกันโหมดทั้งใบ: ทุกรายการเทียบกับช่วงของใบ 13 เดือน */
  const whole = { ...ctx, order: { ...ctx.order, servicePeriodMode: 'whole' } };
  assert.deepEqual(serviceSetupWarnings(whole).filter((w) => w.key === 'rounds_low').map((w) => w.lineId), ['SOL-1', 'SOL-2', 'SOL-3']);
});

test('0400 validateServiceSetupPatch — โหมด + ช่วงของรายการ: ก้อนดีได้ payload ตามตัวอักษร · คีย์ที่ไม่รู้จักไม่ถูกตีกลับ', () => {
  const whole = completeCtx();
  const line = lineModeCtx([P12, null, null]);
  /* สลับเป็นแยกรายรายการ + ใส่ช่วงรายรายการในก้อนเดียว (ใบยังเป็น whole) */
  const body = {
    expectedUpdatedAt: whole.order.updatedAt, periodMode: 'line', somethingNew: 1,
    lines: [
      { lineId: 'SOL-1', period: { from: ' 2026-09-02 ', to: '2027-09-01' }, futureKey: true },
      { lineId: 'SOL-2', period: null },
      { lineId: 'SOL-3', rounds: '12' },
    ],
  };
  assert.deepEqual(validateServiceSetupPatch(body, whole), {
    value: {
      periodMode: 'line',
      lines: [
        { lineId: 'SOL-1', period: { from: '2026-09-02', to: '2027-09-01' } },
        { lineId: 'SOL-2', period: null },
        { lineId: 'SOL-3', rounds: 12 },
      ],
    },
    errors: [],
  });
  /* ใบเป็น line อยู่แล้ว: ไม่ต้องส่งโหมด (จอส่งเฉพาะที่ต่าง) · รายการที่มีแต่ `period` ใช้ได้กับรายการ FG ด้วย */
  assert.deepEqual(validateServiceSetupPatch({ lines: [{ lineId: 'SOL-2', period: { from: '2026-09-25', to: '2027-09-24' } }] }, line), {
    value: { lines: [{ lineId: 'SOL-2', period: { from: '2026-09-25', to: '2027-09-24' } }] }, errors: [],
  });
  const fgCtx = ctxOf({ order: orderOf(LINE), lines: [fgLine(1, 'FG-0233-02-001-00001')] });
  assert.deepEqual(validateServiceSetupPatch({ lines: [{ lineId: 'SOL-1', period: { from: '2026-10-01', to: '2026-10-01' } }] }, fgCtx).errors, []);
  /* โหมดอย่างเดียว (ใบไม่มีแพ็คเกจ / สลับกลับ) = ก้อนที่ใช้ได้ */
  assert.deepEqual(validateServiceSetupPatch({ periodMode: 'whole' }, line), { value: { periodMode: 'whole' }, errors: [] });
  assert.deepEqual(validateServiceSetupPatch({ periodMode: 'line' }, whole), { value: { periodMode: 'line' }, errors: [] });
  /* สลับกลับเป็นทั้งใบพร้อมช่วงของใบ · ช่วงของรายการ null รับทั้งสองโหมด */
  assert.deepEqual(validateServiceSetupPatch({ periodMode: 'whole', period: { from: '2026-09-02', to: '2027-09-25' }, lines: [{ lineId: 'SOL-1', period: null }] }, line), {
    value: { periodMode: 'whole', period: { from: '2026-09-02', to: '2027-09-25' }, lines: [{ lineId: 'SOL-1', period: null }] }, errors: [],
  });
  assert.deepEqual(validateServiceSetupPatch({ lines: [{ lineId: 'SOL-1', period: null }] }, whole).errors, [], 'ล้างช่วงของรายการได้ในโหมดทั้งใบ');
});

test('0400 validateServiceSetupPatch — ข้อผิดใหม่ทุกข้อ (กติกา/ลำดับเดียวกับ RPC รุ่น 0400/F1)', () => {
  const whole = completeCtx();
  const line = lineModeCtx([P12, null]);
  const err = (body, c) => validateServiceSetupPatch(body, c).errors;
  const T = SERVICE_SETUP_SQL_MESSAGES;

  /* โหมดผิดค่า — ฐานรับเฉพาะสตริง 'whole' / 'line' */
  for (const bad of ['x', 'LINE', '', 1, null, true, [], {}]) {
    assert.deepEqual(err({ periodMode: bad }, whole), [{ lineId: null, field: 'periodMode', message: 'โหมดช่วงบริการไม่ถูกต้อง — โหลดหน้าใหม่แล้วลองอีกครั้ง' }], JSON.stringify(bad));
    assert.equal(validateServiceSetupPatch({ periodMode: bad }, whole).value, null);
  }
  /* โหมดผิดค่า ⇒ ที่เหลือตรวจด้วยโหมดที่เก็บ: ใบ line + ช่วงของใบ = สองข้อ */
  assert.deepEqual(err({ periodMode: 'x', period: null }, line).map((e) => e.field), ['periodMode', 'period']);

  /* ช่วงของใบในโหมด (ผลลัพธ์) line = ช่วงของใบคิดจากรายการ — รวม null · จอรุ่นเก่าที่ยังเห็นช่องวันของใบ */
  const derived = [{ lineId: null, field: 'period', message: T.service_setup_period_derived.message }];
  assert.deepEqual(err({ period: { from: '2026-10-01', to: '2027-09-30' } }, line), derived);
  assert.deepEqual(err({ period: null }, line), derived);
  assert.deepEqual(err({ periodMode: 'line', period: { from: '2026-10-01', to: '2027-09-30' } }, whole), derived, 'สลับเป็น line ในก้อนเดียวกัน');
  assert.deepEqual(err({ periodMode: 'whole', period: { from: '2026-10-01', to: '2027-09-30' } }, line), [], 'สลับกลับเป็น whole แล้วส่งช่วงของใบได้');
  assert.equal(derived[0].message, 'ใบนี้ตั้งช่วงบริการแยกรายรายการ — ช่วงของใบคิดจากรายการ แก้ที่ช่วงของแต่ละรายการ (โหลดหน้าใหม่)');

  /* ช่วงของรายการในโหมด (ผลลัพธ์) whole */
  const p = { from: '2026-10-01', to: '2027-09-30' };
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-1', period: p }] }, whole),
    [{ lineId: 'SOL-1', field: 'period', message: 'ใบนี้ใช้ช่วงบริการช่วงเดียวทั้งใบ — สลับเป็น ‘แยกรายรายการ’ ก่อนจึงใส่ช่วงของรายการได้' }]);
  assert.deepEqual(err({ periodMode: 'whole', lines: [{ lineId: 'SOL-1', period: p }] }, line).map((e) => e.message), [T.service_setup_line_period_mode.message]);

  /* รูปของช่วงของรายการ */
  for (const bad of [{ from: '2027-01-01', to: '2026-01-01' }, { from: '1999-12-31', to: '2026-01-01' }, { from: '2026-01-01', to: '2101-01-01' },
    { from: '2026-02-30', to: '2026-03-01' }, { from: '2026-10-01' }, { from: '2026-10-01', to: '' }, {}, 'x', 5, [], { from: 20261001, to: 20270930 }]) {
    assert.deepEqual(err({ lines: [{ lineId: 'SOL-1', period: bad }] }, line),
      [{ lineId: 'SOL-1', field: 'period', message: 'ช่วงบริการของรายการไม่ถูกต้อง — ต้องมีทั้งวันเริ่มและวันสิ้นสุด วันเริ่มไม่เกินวันสิ้นสุด (ปี ค.ศ. 2000–2100)' }], JSON.stringify(bad));
  }

  /* ช่วงบนรายการที่ไม่ใช่แพ็คเกจ (ไม่ใช่งานบริการ · ยังไม่ตอบ · ตอบ "ไม่ใช่" ในก้อนเดียวกัน) = ตัวเดิม service_setup_not_package — ก่อนข้อโหมด */
  const roles = ctxOf({ order: orderOf(LINE), lines: [manual(1, { serviceKind: 'not_service' }), manual(2), done(3)] });
  const notPackage = 'รายการนี้ยังไม่ได้ตอบว่าเป็นงานบริการ — ตอบ ‘ใช่’ ก่อน แล้วจึงเลือก FG/โซน/รอบ';
  for (const lineId of ['SOL-1', 'SOL-2']) {
    assert.deepEqual(err({ lines: [{ lineId, period: p }] }, roles), [{ lineId, field: 'period', message: notPackage }], lineId);
    assert.deepEqual(err({ lines: [{ lineId, period: null }] }, roles), [], `${lineId}: null ล้างได้เสมอ`);
  }
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-3', kind: 'not_service', period: p }] }, roles), [{ lineId: 'SOL-3', field: 'period', message: notPackage }]);
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-2', kind: 'package', period: p }] }, roles), [], 'ตอบ "ใช่" ในก้อนเดียวกันแล้วใส่ช่วงได้');
  assert.deepEqual(err({ periodMode: 'whole', lines: [{ lineId: 'SOL-1', period: p }] }, roles), [{ lineId: 'SOL-1', field: 'period', message: notPackage }],
    'ไม่ใช่แพ็คเกจมาก่อนข้อโหมด (ลำดับของฐาน)');

  /* รายการเดียวผิด = ทั้งก้อนไม่ไปถึงฐาน */
  assert.equal(validateServiceSetupPatch({ lines: [{ lineId: 'SOL-1', period: p }, { lineId: 'SOL-2', period: 'x' }] }, line).value, null);
});

test('0400 id ของช่อง: period ที่มี lineId = ช่วงของรายการ · ไม่มี = ช่วงของใบ (period_missing · ข้อช่วงครอบที่ชี้ช่วงของใบ)', () => {
  assert.equal(serviceSetupFieldId({ key: 'line_period_missing', field: 'period', lineId: 'SOL-3' }), 'svc-line-SOL-3-period');
  assert.equal(serviceSetupFieldId({ lineId: 'SOL-3', field: 'period', message: 'x' }), 'svc-line-SOL-3-period', 'fieldErrors ของ PATCH (ไม่มี key)');
  assert.equal(serviceSetupFieldId({ key: 'period_missing', field: 'period' }), 'svc-period');
  assert.equal(serviceSetupFieldId({ lineId: null, field: 'period' }), 'svc-period');
  assert.equal(serviceSetupFieldId({ key: 'coverage_start', field: 'period', installmentId: null, seq: 1 }), 'svc-period');
  assert.equal(serviceSetupFieldId('period'), 'svc-period');
  assert.equal(serviceSetupFieldId('period_missing'), 'svc-period');
  /* F4 เดิม: ข้อขอบช่วงของงวดที่รับรองแล้วยังชี้ช่วงของใบ (โหมด line = กล่องช่วงรวม) */
  const rows = monthlyRows();
  rows[0] = { ...rows[0], status: 'confirmed', coversFrom: '2026-10-05' };
  const ctx = lineModeCtx([lp('2026-10-01', '2027-03-31'), lp('2027-04-01', '2027-09-30')], { order: PERIOD, installments: rows });
  const start = serviceSetupIssues(ctx).find((i) => i.key === 'coverage_start');
  assert.ok(start, 'ต้องมีข้อ coverage_start');
  assert.equal(serviceSetupFieldId(start), 'svc-period');
});

test('0400 รหัสจากฐาน line_period_missing:<บรรทัด> → ข้อภาษาไทยพร้อมเลขรายการ + ช่องของรายการ', () => {
  const ctx = lineModeCtx([P12, null, null]);
  const issues = serviceSetupSqlIssues('line_period_missing:SOL-2,rounds_missing:SOL-2,line_period_missing:SOL-9', ctx);
  assert.deepEqual(issues.map((i) => [i.key, i.lineId, i.lineNo, i.field]), [
    ['line_period_missing', 'SOL-2', 2, 'period'], ['rounds_missing', 'SOL-2', 2, 'rounds'], ['line_period_missing', 'SOL-9', '?', 'period'],
  ]);
  assert.equal(issues[0].message, 'รายการ 2: ยังไม่ใส่ช่วงบริการของรายการ (วันเริ่ม–วันสิ้นสุด)');
  assert.equal(serviceSetupFieldId(issues[0]), 'svc-line-SOL-2-period');
  assert.equal(typeof SERVICE_SETUP_ISSUE_TEXT.line_period_missing, 'function');
});

test('0400 ก้อน GET + ก้อน audit: โหมด · ช่วงรวมที่เก็บ (null จนกว่าจะครบ) · ตัวนับ · ช่วงรายรายการ', () => {
  const partial = lineModeCtx([lp('2026-09-02', '2027-09-01'), null, lp('2026-09-26', '2027-09-25')]);
  const view = serviceSetupView(partial, { canEdit: true, userId: 'U1', role: 'ae' });
  assert.equal(view.periodMode, 'line');
  assert.equal(view.period, null, 'ยังไม่ครบ = ช่วงของใบว่าง (แถบวาดช่วงรวมจากรายการบนจอ ไม่ใช่จากคีย์นี้)');
  assert.deepEqual(view.linePeriods, { total: 3, filled: 2 });
  assert.deepEqual(view.lines.map((l) => l.period), [{ from: '2026-09-02', to: '2027-09-01' }, null, { from: '2026-09-26', to: '2027-09-25' }]);
  assert.deepEqual(view.totals.periodLines, 3);
  assert.equal(view.hero.value, 'ยังไม่ตั้ง', 'หัวใบ: ยังไม่ครบ = ยังไม่ตั้ง');
  assert.deepEqual(view.issues.map((i) => i.key), ['line_period_missing']);

  const full = lineModeCtx([lp('2026-10-01', '2027-03-31'), lp('2027-04-01', '2027-09-30')], { order: PERIOD });
  const done2 = serviceSetupView(full, { canEdit: true, userId: 'U1', role: 'ae' });
  assert.deepEqual([done2.periodMode, done2.period, done2.linePeriods], ['line', { from: '2026-10-01', to: '2027-09-30' }, { total: 2, filled: 2 }]);
  assert.equal(done2.hero.value, '12 รอบ');
  assert.deepEqual(done2.issues, []);

  const whole = serviceSetupView(completeCtx(), { canEdit: true, userId: 'U1', role: 'ae' });
  assert.deepEqual([whole.periodMode, whole.period, whole.linePeriods], ['whole', { from: '2026-10-01', to: '2027-09-30' }, { total: 10, filled: 0 }]);
  assert.ok(whole.lines.every((l) => l.period === null));

  const snap = serviceSetupAuditSnapshot(partial);
  assert.equal(snap.periodMode, 'line');
  assert.equal(snap.period, null);
  assert.deepEqual(snap.lines.map((l) => l.period), [{ from: '2026-09-02', to: '2027-09-01' }, null, { from: '2026-09-26', to: '2027-09-25' }]);
});

test('0400 ประโยคที่พิมพ์ช่วงของใบ: โหมดแยกรายรายการต่อท้าย "(ช่วงรวม · แยกรายรายการ)" · ผู้อนุมัติได้ข้อ "ตรวจช่วงของแต่ละรายการ"', () => {
  const full = lineModeCtx([lp('2026-10-01', '2027-03-31'), lp('2027-04-01', '2027-09-30')], { order: PERIOD });
  const tail = '01/10/2026–30/09/2027 (ช่วงรวม · แยกรายรายการ)';
  assert.equal(SERVICE_PERIOD_TEXT.envelopeSuffix, ' (ช่วงรวม · แยกรายรายการ)');
  assert.equal(serviceSetupSubmitLine(full),
    `ส่งการตั้งค่างานบริการ (2 โซนใน 2 ไซต์ · ช่วงบริการ ${tail}) ให้ผู้อนุมัติตรวจ — ระหว่างรออนุมัติแก้ไม่ได้ ดึงกลับได้`);
  assert.equal(serviceSetupStripText(full),
    `งานบริการ: จำนวนรอบบริการ 12 รอบ · แต่ละครั้ง 2 โซนใน 2 ไซต์ · ครั้งละ 2 แพ็ค · รวมทั้งใบ 24 แพ็ค · ช่วง ${tail} · สัญญา: ยังไม่ผูก`);
  assert.equal(serviceSetupRevisionLine(full), `คัดลอกงานบริการ 2 รายการ · 2 โซน · ช่วงบริการ ${tail} ไปใบ Rev.`);
  assert.equal(serviceSetupApprovalEffects(full)[1], `ช่วงบริการ ${tail} · งวด 12 งวดครอบต่อเนื่อง — ช่างเข้าไซต์ได้เฉพาะวันที่บัญชีรับรองงวดที่ครอบแล้ว`);
  assert.equal(serviceBackfillSubmitPrompt(full).effects[0],
    `ส่งการตั้งค่างานบริการ (2 โซนใน 2 ไซต์ · ช่วงบริการ ${tail}) ให้ผู้จัดการฝ่ายขายตรวจ`);
  /* ยังไม่ครบ: ช่วงของใบว่าง = ขีด + ท้ายเดิม (บอกว่าใบนี้แยกรายรายการ) */
  const partial = lineModeCtx([P12, null]);
  assert.match(serviceSetupStripText(partial), / · ช่วง — \(ช่วงรวม · แยกรายรายการ\) · สัญญา: ยังไม่ผูก$/);
  /* บรรทัดออก Rev.: รายการ FG ที่มีแต่ช่วงของตัวเองก็นับ (Rev. พาโหมด + ช่วงของรายการไปด้วย) */
  const onlyPeriod = ctxOf({ order: orderOf(LINE), lines: [fgLine(1, 'FG-0233-02-001-00001', P12)] });
  assert.equal(serviceSetupRevisionLine(onlyPeriod), 'คัดลอกงานบริการ 1 รายการ · 0 โซน · ช่วงบริการ — (ช่วงรวม · แยกรายรายการ) ไปใบ Rev.');
  assert.equal(serviceSetupRevisionLine(ctxOf({ order: orderOf(LINE), lines: [fgLine(1, 'FG-0233-02-001-00001')] })), null, 'ไม่มีอะไรตั้งไว้เลย = ไม่มีบรรทัด');
  /* จอของหน้าใบ (page.js) ส่งโหมดผ่าน ctx.periodMode — ใบที่จอประกอบเองไม่จำเป็นต้องพก servicePeriodMode */
  const local = { order: { ...orderOf(PERIOD) }, lines: full.lines, allocations: full.allocations, zonesById: full.zonesById, periodMode: 'line' };
  assert.equal(serviceSetupRevisionLine(local), `คัดลอกงานบริการ 2 รายการ · 2 โซน · ช่วงบริการ ${tail} ไปใบ Rev.`);

  /* ข้อตรวจของผู้อนุมัติ — ต่อจากข้อตรวจตาราง ทั้งเส้นอนุมัติใบและเส้นงานบริการย้อนหลัง */
  const check = 'ตรวจช่วงบริการของแต่ละรายการในคอลัมน์ ① (แยกรายรายการ 2 รายการ)';
  assert.deepEqual(serviceSetupApprovalChecklist(full), ['ตรวจแพ็คเกจ · ไซต์ · โซน · จำนวนรอบบริการ · รอบละกี่แพ็ค ในการ์ดงานบริการ', check]);
  const backfill = serviceSetupApprovalChecklist({ ...full, order: { ...full.order, status: 'approved' } }, { flow: 'backfill' });
  assert.deepEqual(backfill.slice(0, 3), ['ตรวจแพ็คเกจ · ไซต์ · โซน · จำนวนรอบบริการ · รอบละกี่แพ็ค ในการ์ดงานบริการ', check, 'ช่วงบริการตรงกับหมายเหตุของแต่ละสาขา']);
  assert.equal(serviceSetupApprovalChecklist(completeCtx()).some((line) => line.includes('แยกรายรายการ')), false, 'โหมดทั้งใบไม่มีข้อนี้');
  assert.deepEqual(serviceSetupApprovalChecklist(ctxOf({ order: orderOf(LINE), lines: [manual(1, { serviceKind: 'not_service' })] })), [], 'ไม่มีแพ็คเกจ = ไม่มีข้อตรวจ');
});

test('0400 แคตตาล็อก: หัวคอลัมน์ ① · คำของม็อกที่เจ้าของอนุมัติ (ตามตัวอักษร) · รหัสฐานใหม่สี่ตัว · ไม่มีคำต้องห้าม', () => {
  assert.deepEqual({ ...SERVICE_SETUP_GRID_TEXT.steps[0] }, { key: 'kind', label: 'งานบริการ? · ช่วงบริการ', hint: 'ใช่ = ส่ง TS + ใส่ช่วง', required: true });
  assert.deepEqual(SERVICE_SETUP_GRID_TEXT.steps.map((step) => step.key), ['kind', 'fg', 'zones', 'rounds', 'packs', 'total'], 'ลำดับ ①→⑥ ไม่เปลี่ยน');
  assert.deepEqual(SERVICE_SETUP_GRID_TEXT.steps.slice(1).map((step) => step.label), ['แพ็คเกจ FG', 'ไซต์ · โซน', 'จำนวนรอบบริการ', 'รอบละกี่แพ็ค', 'รวมแพ็ค']);

  const T = SERVICE_PERIOD_TEXT;
  /* คำจากม็อก PeriodSwitchWhole / PeriodSwitchPerLine รอบสอง */
  assert.deepEqual([T.label, T.modeAria, T.startLabel, T.endLabel, T.wholeNote], [
    'ช่วงบริการ (ตามสัญญา)', 'ช่วงบริการใช้กับทั้งใบหรือแยกรายรายการ', 'วันเริ่มบริการ', 'วันสิ้นสุดบริการ', 'ทุกรายการในใบใช้ช่วงนี้',
  ]);
  assert.deepEqual(T.modes.map((mode) => ({ ...mode })), [{ value: 'whole', label: 'ทั้งใบช่วงเดียว' }, { value: 'line', label: 'แยกรายรายการ' }]);
  assert.deepEqual([T.monthChip(12), T.monthChip(24), T.monthChipShort(12), T.monthChipShort(24), T.readout('12 เดือน')],
    ['12 เดือน', '24 เดือน', '12 ด.', '24 ด.', '= 12 เดือน']);
  assert.deepEqual([T.envelopeLabel, T.envelopeHow, T.envelopeAria, T.counter(4, 5), T.sameForAll], [
    'ช่วงรวมของใบ', '· คิดจากรายการ (เริ่มแรกสุด → จบสุดท้าย)', 'ช่วงรวมของใบ (อ่านอย่างเดียว)', 'ใส่ช่วงแล้ว 4/5 รายการ', 'ใช้ช่วงเดียวกันทุกรายการ…',
  ]);
  assert.equal(T.lineHint, 'ใส่ช่วงของแต่ละรายการที่คอลัมน์ ① ใต้คำตอบ ‘ใช่’ · ด่านช่วงครอบของงวดชำระตรวจกับช่วงรวมของใบ · TS เริ่มตั้งรอบของแต่ละไซต์จากช่วงของรายการนั้น');
  assert.deepEqual([T.lineLabel, T.from, T.to, T.lineEmpty, T.followsOrder, T.none], ['ช่วงบริการ', 'เริ่ม', 'ถึง', 'ยังไม่ใส่ช่วง', 'ตามช่วงของทั้งใบ', 'ไม่มีช่วงบริการ']);
  assert.deepEqual([T.lineGroupAria(3), T.lineStartAria(3), T.lineEndAria(3), T.sameAs(1), T.sameAsTitle(1)], [
    'ช่วงบริการของรายการ 3', 'วันเริ่มบริการ รายการ 3', 'วันสิ้นสุดบริการ รายการ 3', 'เหมือนรายการ 1', 'คัดลอกช่วงบริการของรายการ 1 มาใส่',
  ]);
  assert.deepEqual([T.roundsChipWait, T.roundsChipWaitTitle], ['ทุกเดือน ≈ —', 'ใส่ช่วงบริการของรายการนี้ก่อน จึงคิดจำนวนรอบรายเดือนได้']);
  assert.deepEqual([T.railLabelLine, T.railCount(4, 5), T.railMissing(3), T.railMore(1), T.railEnvelope('02/09/2026–25/09/2027')], [
    'ช่วงบริการ · แยกรายรายการ', '4/5 รายการ', 'รายการ 3 ยังไม่ใส่', 'อีก 1 รายการ', 'ช่วงรวม 02/09/2026–25/09/2027',
  ]);
  /* คำที่ไม่อยู่ในม็อก (แจ้งเจ้าของใน PR) — ยึดไว้ให้จอกับเอกสารพูดตรงกัน */
  assert.equal(T.clearNotice(4), 'บันทึกแล้วช่วงของ 4 รายการจะถูกแทนด้วยช่วงของทั้งใบ — ยังไม่บันทึก สลับกลับเป็น ‘แยกรายรายการ’ ได้');
  assert.deepEqual([T.applyAllTitle, T.applyAllBody(5), T.applyAllConfirm, T.readModeWhole, T.readModeLine, T.envelopeEmpty], [
    'ใช้ช่วงเดียวกันทุกรายการ', 'แทนช่วงของรายการที่เป็นงานบริการทั้ง 5 รายการ — ยังไม่บันทึกจนกด ‘บันทึกงานบริการ’', 'ใช้กับทุกรายการ',
    'ทั้งใบช่วงเดียว', 'แยกรายรายการ', 'ยังไม่มีรายการที่ใส่ช่วง',
  ]);
  assert.equal(T.backfillHint, 'ถ้าแต่ละสาขาเริ่มไม่พร้อมกัน สลับเป็น ‘แยกรายรายการ’ แล้วใส่ช่วงของแต่ละรายการ');
  assert.equal(T.checklistLine(5), 'ตรวจช่วงบริการของแต่ละรายการในคอลัมน์ ① (แยกรายรายการ 5 รายการ)');
  assert.ok(Object.isFrozen(T) && Object.isFrozen(T.modes) && T.modes.every(Object.isFrozen));

  /* รหัสของ RPC รุ่น 0400/F1 — สถานะตามสัญญา (400 · 409 · 400 · 400) · ไม่มีคีย์ไหนเป็นสตริงย่อยของอีกคีย์ */
  const M = SERVICE_SETUP_SQL_MESSAGES;
  assert.deepEqual(['service_setup_period_mode_invalid', 'service_setup_period_derived', 'service_setup_line_period_mode', 'service_setup_line_period_invalid']
    .map((code) => M[code]?.status), [400, 409, 400, 400]);
  const codes = Object.keys(M);
  for (const a of codes) for (const b of codes) if (a !== b) assert.ok(!b.includes(a), `${a} อยู่ใน ${b}`);
  assert.deepEqual(serviceSetupSqlMessage({ message: 'P0001: service_setup_line_period_invalid' })?.code, 'service_setup_line_period_invalid');
  assert.deepEqual(serviceSetupSqlMessage({ message: 'service_setup_period_invalid' })?.code, 'service_setup_period_invalid', 'รหัสเดิมยังถูกแปลเป็นตัวเอง');
  assert.deepEqual(serviceSetupSqlMessage({ message: 'service_setup_period_mode_invalid' })?.code, 'service_setup_period_mode_invalid');

  /* คำต้องห้าม (มติ 29/09) ไม่กลับมากับคำใหม่ */
  const all = JSON.stringify([
    ...Object.values(T).map((v) => (typeof v === 'function' ? v(1, 2) : v)),
    ...Object.values(M).map((m) => m.message), SERVICE_SETUP_ISSUE_TEXT.line_period_missing({ n: 1 }),
    ...SERVICE_SETUP_GRID_TEXT.steps.map((step) => `${step.label} ${step.hint}`),
  ]);
  assert.doesNotMatch(all, /ไปกี่รอบ/);
});

/* ══ ยื่นโดยยังไม่ตั้งงานบริการ (mig 0404 · มติเจ้าของ 01/10 "ผูกรอบบริการให้ข้ามได้ มาใส่ทีหลัง Actual ได้" → "ฝ่ายขายกดข้ามเอง") ══════════════
   ⭐ ผู้ยื่นกด 'ยื่นโดยยังไม่ตั้งงานบริการ' บนแผงแดงได้เมื่อยังมี **ข้อของการตั้งงานบริการ** — ข้อพวกนั้น (+ ข้อที่ตามมา) ถูกเลื่อน
     งวดชำระ/วันวางบิล/กำหนดชำระ/ข้อของบัญชียังบล็อก · อนุมัติแล้วนับ Actual แต่ไม่เปิดรอบขาย ไม่ประทับ ⇒ ใบเข้าเส้นตั้งย้อนหลังเดิม
   🔴 ใบที่ไม่มีตราการข้าม (ทุกใบที่มีอยู่วันนี้) ต้องได้ผลเดิมทุกตัวอักษร — ชุดนี้ยึดทั้งสองด้าน */

const DEFER_AT = '2026-10-02T02:30:00Z';
const deferCols = (over = {}) => ({
  serviceSetupDeferredAt: DEFER_AT, serviceSetupDeferredById: 'U-AE', serviceSetupDeferredByName: 'Kamonrat P.', ...over,
});
const DEFER_INFO = { at: DEFER_AT, byId: 'U-AE', byName: 'Kamonrat P.' };
/* ใบร่างที่ยังไม่ตอบ 'งานบริการ?' สักรายการ (2 บรรทัดพิมพ์เอง) — ไม่มีรายการแพ็คเกจ ⇒ `serviceSetupIssues` ไม่มีข้อของงวดเลย
   (งวดของก้อนนี้ครบ: 12 งวด มีกำหนดชำระ + ช่วงครอบ ⇒ ด่านเงินของการยื่นแบบข้าม `serviceSetupSkipMoneyIssues` ก็ผ่าน) */
const unansweredCtx = (over = {}) => ctxOf({ lines: [manual(1), manual(2)], ...over });
/* ใบที่มีแพ็คเกจหนึ่งรายการตั้งครบ แต่ยังไม่ใส่ช่วงบริการ (ข้อเดียวของการตั้งงานบริการ: period_missing) */
const noPeriodCtx = (over = {}) => ctxOf({
  lines: [done(1)], zones: [zone('Z1', 'S1')], allocations: [alloc('SOL-1', 'Z1', 2)], ...over,
});
const SKIP_NONE = { visible: false, canSkip: false, blockedReason: null, lead: null, deferredCount: 0, blockingCount: 0, extraIssues: [], prompt: null };
const PREDECESSOR = { id: 'SO0', orderNumber: 'SO-26090001-0' };
/* ช่องโหว่ระหว่างสองงวดที่บัญชีรับรองแล้ว (ของฝ่ายบัญชี — ฝ่ายขายแก้ไม่ได้) บนใบที่ยังมีรายการไม่ตอบ */
const fnGapCtx = (over = {}) => ctxOf({
  order: orderOf({ servicePeriodFrom: '2026-10-22', servicePeriodTo: '2027-10-21' }),
  lines: [fgLine(1, S247_FG, { serviceRounds: 12 }), manual(2)],
  zones: [zone('Z1', 'S1')], allocations: [alloc('SOL-1', 'Z1', 2)],
  installments: [
    { ...monthlyRows()[0], id: 'I1', seq: 1, status: 'confirmed', coversFrom: '2026-10-22', coversTo: '2027-01-21' },
    { ...monthlyRows()[1], id: 'I2', seq: 2, status: 'confirmed', coversFrom: '2027-03-01', coversTo: '2027-10-21' },
  ],
  ...over,
});

test('0404 กลุ่มของข้อที่ยังขาด: ทุกคีย์ของ SERVICE_SETUP_ISSUE_TEXT ถูกตัดสิน (ตาราง D-F4) · ของบัญชีและคีย์ที่ไม่รู้จัก = บล็อก', () => {
  const GROUPS = {
    kind_missing: 'setup', fg_missing: 'setup', fg_invalid: 'setup', zones_missing: 'setup', packs_missing: 'setup', zone_invalid: 'setup',
    zones_on_not_service: 'setup', rounds_missing: 'setup', period_missing: 'setup', line_period_missing: 'setup',
    fg_foreign: 'follow', coverage_missing: 'follow', coverage_start: 'follow', coverage_gap: 'follow', coverage_end: 'follow',
    installments_missing: 'blocking', billing_missing: 'blocking', due_missing: 'blocking', unsaved: 'blocking',
    /* คำเตือน — ไม่เคยเป็นข้อที่บล็อก ถ้าหลุดเข้ามาเป็นข้อ = บล็อก (fail-closed) */
    coverage_overlap: 'blocking', fn_coverage_missing: 'blocking', rounds_low: 'blocking',
  };
  assert.deepEqual(Object.keys(SERVICE_SETUP_ISSUE_TEXT).sort(), Object.keys(GROUPS).sort(),
    'เพิ่มคีย์ข้อที่ยังขาดใหม่ = ต้องตัดสินว่าการข้ามเลื่อนข้อนั้นได้ไหม (แผน IMPL_PLAN_DEFER ตาราง D-F4)');
  for (const [key, group] of Object.entries(GROUPS)) assert.equal(serviceSetupIssueGroup({ key, owner: 'SA' }), group, key);
  /* ข้อของฝ่ายบัญชี = บล็อกเสมอ แม้คีย์จะเป็นกลุ่มที่เลื่อนได้ (D-F16) */
  for (const key of Object.keys(GROUPS)) assert.equal(serviceSetupIssueGroup({ key, owner: 'FN' }), 'blocking', `FN ${key}`);
  for (const bad of [{ key: 'historical_zone_mismatch' }, { key: 'something_new' }, { key: '' }, { key: null }, {}, null, undefined, 'kind_missing']) {
    assert.equal(serviceSetupIssueGroup(bad), 'blocking', JSON.stringify(bad));
  }
  /* ของจริงจากตัวตัดสิน: ช่องโหว่ระหว่างงวดที่บัญชีรับรองแล้ว = ของบัญชี ⇒ บล็อก · รายการที่ยังไม่ตอบ = setup */
  const real = serviceSetupIssues(fnGapCtx());
  assert.deepEqual(real.map((i) => [i.key, i.owner, serviceSetupIssueGroup(i)]),
    [['kind_missing', 'SA', 'setup'], ['coverage_gap', 'FN', 'blocking']]);
});

test('0404 serviceSetupDeferSplit: มีข้อกลุ่ม setup = เลื่อน setup + follow · ไม่มี = ไม่มีอะไรเลื่อน (ทุกข้อบล็อก ลำดับเดิม)', () => {
  const i = (key, over = {}) => ({ key, owner: 'SA', ...over });
  const mixed = [i('kind_missing'), i('coverage_missing', { seq: 1 }), i('due_missing'), i('fg_foreign'), i('coverage_gap', { owner: 'FN' }), i('period_missing')];
  const split = serviceSetupDeferSplit(mixed);
  assert.deepEqual(keys(split.setup), ['kind_missing', 'period_missing']);
  assert.deepEqual(keys(split.follow), ['coverage_missing', 'fg_foreign']);
  assert.deepEqual(split.blocking.map((x) => [x.key, x.owner]), [['due_missing', 'SA'], ['coverage_gap', 'FN']]);
  assert.equal(split.deferrable, true);
  assert.equal(split.setup[0], mixed[0], 'ข้อเดิมตัวเดิม (จอเทียบด้วยตัวตน)');

  const followOnly = [i('coverage_missing'), i('fg_foreign'), i('coverage_end')];
  const none = serviceSetupDeferSplit(followOnly);
  assert.deepEqual(none, { setup: [], follow: [], blocking: followOnly, deferrable: false }, 'ไม่มีข้อของการตั้งงานบริการ = ข้อที่ตามมาบล็อกตามเดิม');
  assert.notEqual(none.blocking, followOnly, 'สำเนา ไม่ใช่อาร์เรย์ของผู้เรียก');
  assert.deepEqual(serviceSetupDeferSplit([]), { setup: [], follow: [], blocking: [], deferrable: false });
  assert.deepEqual(serviceSetupDeferSplit(), { setup: [], follow: [], blocking: [], deferrable: false });
  assert.deepEqual(serviceSetupDeferSplit(null), { setup: [], follow: [], blocking: [], deferrable: false });
  assert.deepEqual(serviceSetupDeferSplit(serviceSetupIssues({ unsaved: true })).deferrable, false, 'ยังไม่บันทึก = ข้ามไม่ได้');
});

test('0404 ปุ่มข้ามบนแผงแดง (serviceSetupSkipState): โชว์เมื่อมีสิทธิ์ · ใบร่าง/ตีกลับ · มีข้อของการตั้งงานบริการ · มีรายการที่ต้องตั้ง', () => {
  const can = { canEdit: true };
  /* ทุกรายการยังไม่ตอบ · งวดครบ (กำหนดชำระ + ไม่ใช่ลูกค้าเครดิต) ⇒ ข้ามได้ทั้งใบ */
  const open = serviceSetupSkipState(unansweredCtx(), can);
  assert.deepEqual(Object.keys(open), ['visible', 'canSkip', 'blockedReason', 'lead', 'deferredCount', 'blockingCount', 'extraIssues', 'prompt']);
  assert.deepEqual(open.extraIssues, []);
  assert.deepEqual([open.visible, open.canSkip, open.blockedReason, open.deferredCount, open.blockingCount], [true, true, null, 2, 0]);
  assert.equal(open.lead, SERVICE_DEFER_TEXT.panelLead(2));
  assert.deepEqual(open.prompt, serviceDeferPrompt(unansweredCtx()));
  assert.deepEqual(keys(serviceSetupIssues(unansweredCtx())), ['kind_missing', 'kind_missing'], 'ไม่มีข้อของงวดเลย');
  assert.deepEqual(serviceSetupSkipState(unansweredCtx({ order: orderOf({ status: 'rejected' }) }), can).canSkip, true, 'ใบถูกตีกลับยื่นใหม่แบบข้ามได้');
  /* ส่งข้อที่คิดไว้แล้วได้ — ผลเดียวกัน และไม่คิดซ้ำ (บริบทไม่มี fgOptionIds ก็ไม่ throw) */
  const given = serviceSetupSkipState({ ...unansweredCtx(), fgOptionIds: null }, { canEdit: true, issues: serviceSetupIssues(unansweredCtx()) });
  assert.deepEqual(given, open);
  assert.throws(() => serviceSetupSkipState({ ...unansweredCtx(), fgOptionIds: null }, can), /fgOptionIds/, 'ไม่ส่งข้อ = คิดเอง (fail-closed)');

  /* ไม่มีสิทธิ์ / ไม่ใช่ใบร่าง-ตีกลับ / ไม่ใช่สายบริการ / ใบย้อนหลัง = ก้อนกลาง (ไม่มี undefined) */
  assert.deepEqual(serviceSetupSkipState(unansweredCtx(), { canEdit: false }), SKIP_NONE);
  assert.deepEqual(serviceSetupSkipState(unansweredCtx()), SKIP_NONE, 'ไม่ส่ง canEdit = ไม่มีสิทธิ์');
  for (const status of ['pending_approval', 'approved', 'approval_revoked', 'cancelled', 'revised']) {
    assert.deepEqual(serviceSetupSkipState(unansweredCtx({ order: orderOf({ status }) }), can), SKIP_NONE, status);
  }
  assert.deepEqual(serviceSetupSkipState(unansweredCtx({ order: orderOf({ deal: PRODUCT_DEAL, dealId: 'DL2' }) }), can), SKIP_NONE);
  assert.deepEqual(serviceSetupSkipState(unansweredCtx({ order: orderOf({ origin: 'historical' }) }), can), SKIP_NONE);
  assert.deepEqual(serviceSetupSkipState({}, can), SKIP_NONE);
  assert.notEqual(serviceSetupSkipState({}, can), serviceSetupSkipState({}, can), 'ก้อนกลางสร้างใหม่ทุกครั้ง');

  /* งานบริการครบ = ไม่มีอะไรให้ข้าม (กด 'ยื่นอนุมัติ' ตามปกติ) */
  assert.deepEqual(serviceSetupIssues(completeCtx()), []);
  assert.deepEqual(serviceSetupSkipState(completeCtx(), can), SKIP_NONE);
  /* ขาดแต่ข้อที่ตามมา (ช่วงครอบของงวด / แพ็คเกจของนิติบุคคลอื่น) — ฐานเห็นว่าครบ ⇒ ข้ามไม่ได้ ปุ่มไม่ขึ้น */
  const coverageOnly = completeCtx({ installments: monthlyRows({ coversFrom: null, coversTo: null }) });
  assert.deepEqual([...new Set(keys(serviceSetupIssues(coverageOnly)))], ['coverage_missing']);
  assert.deepEqual(serviceSetupSkipState(coverageOnly, can), SKIP_NONE);
  const foreignOnly = completeCtx({ fgOptionIds: new Set() });
  assert.deepEqual([...new Set(keys(serviceSetupIssues(foreignOnly)))], ['fg_foreign']);
  assert.deepEqual(serviceSetupSkipState(foreignOnly, can), SKIP_NONE);
  /* มีข้อของการตั้งงานบริการ แต่ไม่มีรายการที่ต้องตั้ง (FG หมวดอื่นที่มีโซนค้าง) — คู่กับ service_setup_defer_nothing ของฐาน */
  const strayZone = ctxOf({ lines: [fgLine(1, 'FG-0521-03-002-00001')], zones: [zone('Z1', 'S1')], allocations: [alloc('SOL-1', 'Z1', 1)] });
  assert.deepEqual(keys(serviceSetupIssues(strayZone)), ['zones_on_not_service']);
  assert.deepEqual(serviceSetupSkipState(strayZone, can), SKIP_NONE);

  /* ข้อของการตั้งงานบริการ + ข้อที่ตามมา = ข้ามได้ทั้งคู่ · โมดัลบอกว่าช่วงครอบเลื่อนไปตรวจทีหลัง */
  const withCoverage = noPeriodCtx({ installments: monthlyRows({ coversFrom: null, coversTo: null }) });
  assert.deepEqual([...new Set(keys(serviceSetupIssues(withCoverage)))], ['period_missing', 'coverage_missing']);
  const both = serviceSetupSkipState(withCoverage, can);
  assert.deepEqual([both.visible, both.canSkip, both.deferredCount, both.blockingCount], [true, true, 13, 0]);
  assert.ok(both.prompt.effects.includes(SERVICE_DEFER_TEXT.effectCoverage(12)));

  /* ข้อของการตั้งงานบริการ + ข้อที่ข้ามไม่ได้ (ยังไม่มีงวดชำระ) = ปุ่มยังโชว์ กดแล้วบอกเหตุ · ไม่มีโมดัล */
  const noMoney = noPeriodCtx({ installments: [] });
  assert.deepEqual(keys(serviceSetupIssues(noMoney)), ['period_missing', 'installments_missing']);
  const blocked = serviceSetupSkipState(noMoney, can);
  assert.deepEqual([blocked.visible, blocked.canSkip, blocked.deferredCount, blocked.blockingCount, blocked.prompt], [true, false, 1, 1, null]);
  assert.equal(blocked.blockedReason, SERVICE_DEFER_TEXT.blocked(1));
  assert.equal(blocked.lead, SERVICE_DEFER_TEXT.panelBlocked(1, 1));
  /* กำหนดชำระ/วันวางบิลที่ยังไม่ใส่ก็บล็อก (ไม่ใช่เรื่องของการตั้งงานบริการ) */
  const noDue = serviceSetupSkipState(noPeriodCtx({ installments: monthlyRows({ dueDate: null }) }), can);
  assert.deepEqual([noDue.canSkip, noDue.deferredCount, noDue.blockingCount], [false, 1, 12]);
  /* ข้อของฝ่ายบัญชี (ช่องโหว่ระหว่างงวดที่รับรองแล้ว) บล็อกการข้าม — ฝ่ายขายพาใบไปถึง TS เองไม่ได้ (D-F16) */
  const fn = serviceSetupSkipState(fnGapCtx(), can);
  assert.deepEqual([fn.visible, fn.canSkip, fn.deferredCount, fn.blockingCount], [true, false, 1, 1]);
});

test('0404 🔴 ใบ Rev. ของใบที่ TS ยังเดินรอบบริการอยู่ข้ามไม่ได้ (D-F18) — ปุ่มโชว์ กดแล้วบอกเหตุ · ใบเดิมไม่มีรอบเดิน = ข้ามได้', () => {
  const running = unansweredCtx({
    order: orderOf({ revisedFromId: 'SO0' }), predecessor: { ...PREDECESSOR, activePlanSiteIds: ['S1', 'S9'] },
  });
  const skip = serviceSetupSkipState(running, { canEdit: true });
  assert.deepEqual([skip.visible, skip.canSkip, skip.prompt, skip.deferredCount, skip.blockingCount], [true, false, null, 2, 0]);
  assert.equal(skip.blockedReason, SERVICE_DEFER_TEXT.predecessorRunning('SO-26090001-0', 2));
  assert.equal(skip.lead, SERVICE_DEFER_TEXT.panelPredecessor('SO-26090001-0'), 'บรรทัดท้ายแผงไม่พูดว่า "เหลือ 0 ข้อ"');
  /* เหตุของใบเดิมมาก่อนเหตุของข้อที่ข้ามไม่ได้ (แก้งวดแล้วก็ยังข้ามไม่ได้) */
  const runningNoMoney = noPeriodCtx({ installments: [], order: orderOf({ revisedFromId: 'SO0' }), predecessor: { ...PREDECESSOR, activePlanSiteIds: ['S1'] } });
  assert.equal(serviceSetupSkipState(runningNoMoney, { canEdit: true }).blockedReason, SERVICE_DEFER_TEXT.predecessorRunning('SO-26090001-0', 1));

  const idle = unansweredCtx({ order: orderOf({ revisedFromId: 'SO0' }), predecessor: { ...PREDECESSOR, activePlanSiteIds: [] } });
  assert.equal(serviceSetupSkipState(idle, { canEdit: true }).canSkip, true, 'รอบของใบเดิมตายไปกับใบที่ถูกแทนแล้ว — ไม่มีอะไรค้าง');

  /* ด่านอนุมัติรู้กรณีเดียวกัน: มีตราการข้าม + ยังขาดข้อของการตั้ง แต่ใบเดิมมีรอบเดิน ⇒ ไม่ใช่การอนุมัติแบบข้าม ทุกข้อหยุดการอนุมัติ */
  const pendingRunning = { ...running, order: { ...running.order, status: 'pending_approval', ...deferCols() } };
  const gate = serviceSetupApprovalGate(pendingRunning);
  assert.deepEqual([gate.deferring, keys(gate.blocking), gate.deferredIssues], [false, ['kind_missing', 'kind_missing'], []]);
});

test('0404 🔴 ใบ Rev. ของใบที่ TS ตั้งมาตรฐาน มล./เดือนบนรอบขายไว้แล้วข้ามไม่ได้ (ค่ามาตรฐานถูกยกทอดเดียว — ตรวจทานรอบสุดท้าย) · ด่านอนุมัติรู้กรณีเดียวกัน', () => {
  const rev = (predecessor, over = {}) => unansweredCtx({ order: orderOf({ revisedFromId: 'SO0' }), predecessor: { ...PREDECESSOR, activePlanSiteIds: [], ...predecessor }, ...over });
  const withMl = rev({ standardMlTermCount: 3 });
  const skip = serviceSetupSkipState(withMl, { canEdit: true });
  assert.deepEqual([skip.visible, skip.canSkip, skip.prompt, skip.deferredCount, skip.blockingCount], [true, false, null, 2, 0]);
  assert.equal(skip.blockedReason, SERVICE_DEFER_TEXT.predecessorStandard('SO-26090001-0', 3));
  assert.equal(skip.lead, SERVICE_DEFER_TEXT.panelPredecessorStandard('SO-26090001-0'), 'บรรทัดท้ายแผงบอกเหตุของใบเดิม ไม่ใช่ "เหลือ 0 ข้อ"');
  assert.notEqual(skip.lead, SERVICE_DEFER_TEXT.panelBlocked(skip.deferredCount, skip.blockingCount), 'จอไม่ติดป้าย ‘ข้ามได้’ บนใบที่ข้ามไม่ได้ทั้งใบ (skipTagsShown เทียบบรรทัดนี้)');
  /* รอบที่ยังเดินมาก่อนค่ามาตรฐาน (TS กำลังบริการอยู่) · ไม่มีทั้งสอง = ข้ามได้ · ไม่ใช่จำนวนเต็มบวก = ไม่นับ (แถวที่ไม่พกช่องนี้ = พฤติกรรมเดิม) */
  assert.equal(serviceSetupSkipState(rev({ activePlanSiteIds: ['S1'], standardMlTermCount: 2 }), { canEdit: true }).blockedReason,
    SERVICE_DEFER_TEXT.predecessorRunning('SO-26090001-0', 1));
  for (const standardMlTermCount of [0, undefined, null, -1, 'x', 1.5]) {
    assert.equal(serviceSetupSkipState(rev({ standardMlTermCount }), { canEdit: true }).canSkip, true, String(standardMlTermCount));
  }
  assert.equal(serviceSetupSkipState(unansweredCtx({ predecessor: null }), { canEdit: true }).canSkip, true, 'ไม่ใช่ใบ Rev.');
  /* เหตุของใบเดิมมาก่อนเหตุของข้อที่ข้ามไม่ได้ */
  const mlNoMoney = noPeriodCtx({ installments: [], order: orderOf({ revisedFromId: 'SO0' }), predecessor: { ...PREDECESSOR, activePlanSiteIds: [], standardMlTermCount: 1 } });
  assert.equal(serviceSetupSkipState(mlNoMoney, { canEdit: true }).blockedReason, SERVICE_DEFER_TEXT.predecessorStandard('SO-26090001-0', 1));

  /* ด่านอนุมัติ: มีตราการข้าม + ยังขาดข้อของการตั้ง แต่รอบขายของใบเดิมมีค่ามาตรฐาน ⇒ ฐานไม่เข้า D1 (RAISE ไม่ครบ) ⇒ JS ไม่ถือว่าเป็นการอนุมัติแบบข้าม */
  const pending = { ...withMl, order: { ...withMl.order, status: 'pending_approval', ...deferCols() } };
  const gate = serviceSetupApprovalGate(pending);
  assert.deepEqual([gate.deferring, keys(gate.blocking), gate.deferredIssues], [false, ['kind_missing', 'kind_missing'], []]);
  const view = serviceSetupView(pending, { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' });
  assert.deepEqual([view.deferred.active, view.deferred.missing, view.deferred.blocking], [false, 0, 2], 'ประกาศบนใบ = "ข้ามไม่ได้แล้ว · ตีกลับ" (pendingStuck)');
});

test('0404 🔴 ด่านเงินของการยื่นแบบข้าม (lib-01): ใบที่ยังไม่ตอบ ‘งานบริการ?’ ถูกตรวจงวดชำระ/วันวางบิล/กำหนดชำระเหมือนมีแพ็คเกจ — ล้างคำตอบแล้วข้ามไม่ได้', () => {
  const can = { canEdit: true };
  const answered = (installments, over = {}) => ctxOf({ lines: [done(1), manual(2)], zones: [zone('Z1', 'S1')], allocations: [alloc('SOL-1', 'Z1', 2)], installments, ...over });
  const dueless = [{ ...monthlyRows()[0], dueDate: null }];

  /* ① ตอบ ‘ใช่’ หนึ่งรายการ · ไม่มีงวด → ข้อเงินอยู่ใน serviceSetupIssues แล้ว (กลุ่ม blocking) · ไม่มีข้อเพิ่ม */
  const a1 = answered([]);
  assert.ok(keys(serviceSetupIssues(a1)).includes('installments_missing'));
  assert.deepEqual(serviceSetupSkipMoneyIssues(a1), [], 'ใบที่มีแพ็คเกจแล้ว: ไม่ซ้ำกับข้อของ serviceSetupIssues');
  const s1 = serviceSetupSkipState(a1, can);
  assert.deepEqual([s1.canSkip, s1.blockingCount, s1.extraIssues], [false, 1, []]);

  /* ② ทุกรายการยังไม่ตอบ · ไม่มีงวด → serviceSetupIssues ไม่มีข้อเงิน (เหมือนเดิม) แต่การยื่นแบบข้ามติด "ยังไม่มีงวดชำระ" */
  const u1 = unansweredCtx({ installments: [] });
  assert.deepEqual(keys(serviceSetupIssues(u1)), ['kind_missing', 'kind_missing'], 'ข้อของการยื่นปกติไม่เปลี่ยน');
  assert.deepEqual(keys(serviceSetupSkipMoneyIssues(u1)), ['installments_missing']);
  const s2 = serviceSetupSkipState(u1, can);
  assert.deepEqual([s2.visible, s2.canSkip, s2.deferredCount, s2.blockingCount, s2.prompt], [true, false, 2, 1, null]);
  assert.deepEqual(keys(s2.extraIssues), ['installments_missing']);
  assert.equal(s2.blockedReason, SERVICE_DEFER_TEXT.blocked(1));
  assert.equal(s2.lead, SERVICE_DEFER_TEXT.panelBlocked(2, 1), 'ป้าย ‘ข้ามได้’ ยังขึ้นบนข้อของการตั้งงานบริการ (skipTagsShown)');

  /* ③ ตอบ ‘ใช่’ · งวดไม่มีกำหนดชำระ → ติด · ④ ล้างคำตอบ (ทุกรายการยังไม่ตอบ) งวดเดิม → **ยังติด** (ช่องโหว่ที่ตรวจทานเจอ) */
  const s3 = serviceSetupSkipState(answered(dueless), can);
  assert.equal(s3.canSkip, false);
  assert.ok(keys(serviceSetupIssues(answered(dueless))).includes('due_missing'));
  const u2 = unansweredCtx({ installments: dueless });
  assert.deepEqual(keys(serviceSetupIssues(u2)), ['kind_missing', 'kind_missing']);
  const s4 = serviceSetupSkipState(u2, can);
  assert.deepEqual([s4.canSkip, s4.blockingCount, keys(s4.extraIssues)], [false, 1, ['due_missing']]);
  assert.deepEqual([s4.extraIssues[0].installmentId, s4.extraIssues[0].seq, s4.extraIssues[0].owner], ['I1', 1, 'SA'], 'ข้อพกงวดที่ต้องแก้ — แผงแดงมี "ไปแก้"');
  /* ลูกค้าเครดิต: วันวางบิลก็บังคับ */
  const credit = { billing: { mode: 'monthly', days: [25] }, payment: { mode: 'credit', days: 30 } };
  const u3 = unansweredCtx({ installments: [{ ...monthlyRows()[0], billingDate: null }], customerBillingRule: credit });
  const billing = keys(serviceSetupSkipMoneyIssues(u3));
  assert.deepEqual(billing, ['billing_missing']);
  assert.deepEqual(billing, keys(serviceSetupIssues(answered([{ ...monthlyRows()[0], billingDate: null }], { customerBillingRule: credit }))
    .filter((i) => serviceSetupIssueGroup(i) === 'blocking')), 'ข้อเงินเท่ากับของใบเดียวกันที่ตอบ ‘ใช่’ แล้ว');

  /* ข้อช่วงครอบ (เลื่อนได้) ไม่ถูกเติม — งวดมีกำหนดชำระแต่ไม่มีช่วงครอบ = ข้ามได้ */
  const u4 = unansweredCtx({ installments: monthlyRows({ coversFrom: null, coversTo: null }) });
  assert.deepEqual(serviceSetupSkipMoneyIssues(u4), []);
  assert.equal(serviceSetupSkipState(u4, can).canSkip, true);
  /* ยอดศูนย์ = ไม่ต้องมีงวด · ทุกรายการตอบ ‘ไม่ใช่’ (เหลือข้อโซนค้าง) = ไม่มีข้อเพิ่ม · ยังไม่บันทึก = ไม่คิด */
  assert.deepEqual(serviceSetupSkipMoneyIssues(unansweredCtx({ installments: [], order: orderOf({ totalAmount: 0 }) })), []);
  const notService = ctxOf({ lines: [manual(1, { serviceKind: 'not_service' })], zones: [zone('Z1', 'S1')], allocations: [alloc('SOL-1', 'Z1', 1)], installments: [] });
  assert.deepEqual(keys(serviceSetupIssues(notService)), ['zones_on_not_service']);
  assert.deepEqual(serviceSetupSkipMoneyIssues(notService), []);
  assert.deepEqual(serviceSetupSkipMoneyIssues({ unsaved: true }), []);

  /* ด่านอนุมัติของใบรออนุมัติที่ยังข้ามอยู่: ข้อเงินชุดเดียวกันหยุดการอนุมัติ (งวดถูกลบ/แก้ระหว่างรออนุมัติ) · ใบที่ไม่มีตรา = ทุกข้อเหมือนเดิม */
  const pending = { ...u1, order: { ...u1.order, status: 'pending_approval', ...deferCols() } };
  const gate = serviceSetupApprovalGate(pending);
  assert.deepEqual([gate.deferring, keys(gate.blocking), keys(gate.deferredIssues)], [true, ['installments_missing'], ['kind_missing', 'kind_missing']]);
  const view = serviceSetupView(pending, { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' });
  assert.deepEqual(keys(view.issues), ['installments_missing'], 'โมดัลอนุมัติ: "งานบริการยังขาด 1 ข้อ"');
  assert.deepEqual([view.deferred.active, view.deferred.missing, view.deferred.blocking], [true, 2, 1]);
  const plain = { ...u1, order: { ...u1.order, status: 'pending_approval' } };
  assert.deepEqual(keys(serviceSetupApprovalGate(plain).blocking), ['kind_missing', 'kind_missing'], 'ไม่มีตราการข้าม = ด่านเดิมทุกตัวอักษร (ไม่มีข้อเพิ่ม)');
  /* ก้อน GET ของใบร่าง: `issues` ไม่มีข้อเพิ่ม (ไม่ใช่ข้อของการยื่นปกติ) — อยู่ที่ `skip.extraIssues` */
  const draft = serviceSetupView(u1, { canEdit: true, userId: 'U-AE', role: 'ae' });
  assert.deepEqual(keys(draft.issues), ['kind_missing', 'kind_missing']);
  assert.deepEqual(keys(draft.skip.extraIssues), ['installments_missing']);
});

test('0404 โมดัลยืนยันการข้าม: บอกผลครบ (ข้ามกี่ข้อ · นับ Actual แต่ยังไม่ส่ง TS · ทางเดินหลังอนุมัติ · ล้างเมื่อดึงกลับ/ตีกลับ) · ป้อน approvalPrompt ได้', () => {
  const prompt = serviceDeferPrompt(unansweredCtx());
  assert.deepEqual(prompt, {
    title: 'ยื่นอนุมัติโดยยังไม่ตั้งงานบริการ',
    verb: 'ยื่น',
    subject: 'SO-26100005-0 ให้ AE Supervisor ตรวจอนุมัติ โดยยังไม่ตั้งงานบริการ',
    effects: [
      'ข้ามการตั้งงานบริการ 2 ข้อ — ผู้อนุมัติเห็นว่าใบนี้ยังไม่ตั้งงานบริการ และตีกลับให้ตั้งก่อนได้',
      'เมื่ออนุมัติ: ยอดนับเป็น Actual ทันที แต่ยังไม่ส่งงานบริการให้ TS — ไม่มีโซนขึ้น “งานเข้าใหม่ › รอตั้งรอบ”',
      'หลังอนุมัติ ใบขึ้น ‘ยังไม่ตั้งงานบริการ’ ในคิว ‘รอฉันลงมือ’ ของเจ้าของดีล — ตั้งงานบริการให้ครบ กด ‘ยื่นตรวจงานบริการ’ แล้วผู้จัดการฝ่ายขายอนุมัติอีกครั้ง จึงส่ง TS',
      'ดึงกลับหรือถูกตีกลับ = การข้ามถูกล้าง ต้องเลือกใหม่ตอนยื่นครั้งถัดไป',
    ],
    confirmLabel: 'ยื่นโดยยังไม่ตั้งงานบริการ',
  });
  const dialog = approvalPrompt(prompt);
  assert.equal(dialog.title, 'ยื่นอนุมัติโดยยังไม่ตั้งงานบริการ');
  assert.equal(dialog.description, 'ยืนยันยื่น SO-26100005-0 ให้ AE Supervisor ตรวจอนุมัติ โดยยังไม่ตั้งงานบริการ หรือไม่');
  assert.equal(dialog.confirmLabel, 'ยื่นโดยยังไม่ตั้งงานบริการ');
  for (const line of prompt.effects) assert.ok(dialog.detail.includes(`· ${line}`));

  /* บรรทัดช่วงครอบขึ้นเฉพาะเมื่อมีข้อช่วงครอบที่ถูกเลื่อน — นับเฉพาะข้อช่วงครอบ ไม่นับแพ็คเกจของนิติบุคคลอื่น */
  const i = (key) => ({ key, owner: 'SA' });
  const withFollow = serviceDeferPrompt(unansweredCtx(), serviceSetupDeferSplit([i('kind_missing'), i('fg_foreign'), i('coverage_missing'), i('coverage_end')]));
  assert.equal(withFollow.effects[0], SERVICE_DEFER_TEXT.effectSkip(4));
  assert.equal(withFollow.effects[3], 'ช่วงครอบบริการของงวดชำระ 2 ข้อเลื่อนไปตรวจตอนยื่นตรวจงานบริการ');
  assert.equal(withFollow.effects.length, 5);
  const foreign = serviceDeferPrompt(unansweredCtx(), serviceSetupDeferSplit([i('kind_missing'), i('fg_foreign')]));
  assert.equal(foreign.effects.length, 4, 'ไม่มีข้อช่วงครอบ = ไม่มีบรรทัดนั้น');
  assert.equal(serviceDeferPrompt({}, serviceSetupDeferSplit([i('kind_missing')])).subject, 'ใบสั่งขายนี้ ให้ AE Supervisor ตรวจอนุมัติ โดยยังไม่ตั้งงานบริการ');
});

test('0404 "ใบนี้ยื่นโดยยังไม่ตั้งงานบริการ" (serviceSetupDeferred): รออนุมัติ = pending · อนุมัติแล้วยังไม่ประทับ = approved · อื่น ๆ = null', () => {
  const flagged = (over = {}) => orderOf({ ...deferCols(), ...over });
  assert.deepEqual(serviceSetupDeferred(flagged({ status: 'pending_approval' })), { ...DEFER_INFO, stage: 'pending' });
  assert.deepEqual(serviceSetupDeferred(flagged({ status: 'approved' })), { ...DEFER_INFO, stage: 'approved' });
  assert.deepEqual(serviceSetupDeferred(flagged({ status: 'approved', serviceSetupState: 'submitted' }))?.stage, 'approved', 'รอผู้จัดการตรวจยังเป็นใบที่ข้าม');
  assert.deepEqual(serviceSetupDeferred(flagged({ status: 'approved', serviceSetupState: 'rejected' }))?.stage, 'approved');
  /* ตราคงอยู่เป็นประวัติ แต่ป้ายไม่ขึ้น: ประทับแล้ว · ถูก Rev. ทับ · ย้อนการอนุมัติ · ยกเลิก · ถูกแทน */
  assert.equal(serviceSetupDeferred(flagged({ status: 'approved', serviceTermsOpenedAt: STAMP })), null);
  assert.equal(serviceSetupDeferred(flagged({ status: 'approved', supersededById: 'SO2' })), null);
  for (const status of ['approval_revoked', 'cancelled', 'revised']) assert.equal(serviceSetupDeferred(flagged({ status })), null, status);
  /* ร่าง/ตีกลับมีตราไม่ได้ (CHECK + trigger ของ 0404) — ถ้าหลุดมาก็ไม่ขึ้นป้าย */
  for (const status of ['draft', 'rejected']) assert.equal(serviceSetupDeferred(flagged({ status })), null, status);
  assert.equal(serviceSetupDeferred(flagged({ status: 'pending_approval', origin: 'historical' })), null, 'ใบย้อนหลังไม่เกี่ยว');
  assert.equal(serviceSetupDeferred(orderOf({ status: 'pending_approval' })), null, 'ไม่มีตรา');
  assert.equal(serviceSetupDeferred(orderOf({ status: 'pending_approval', serviceSetupDeferredAt: null, serviceSetupDeferredByName: 'x' })), null);
  assert.equal(serviceSetupDeferred(null), null);
  assert.equal(serviceSetupDeferred(undefined), null);
  /* select ที่พกแค่เวลา + ชื่อ (คิว TS) — byId เป็น null ไม่ใช่ undefined */
  assert.deepEqual(serviceSetupDeferred({ status: 'approved', origin: 'pipeline', serviceSetupDeferredAt: DEFER_AT, serviceSetupDeferredByName: 'Kamonrat P.' }),
    { at: DEFER_AT, byId: null, byName: 'Kamonrat P.', stage: 'approved' });
});

test('0404 ข้าม ↔ เปิดแก้หลังอนุมัติ (0396): เหตุการณ์ที่เกิดทีหลังชนะ — ตัวตัดสินสองตัวไม่ตอบพร้อมกัน (D-F10)', () => {
  /* ข้ามตอนยื่น → อนุมัติ → ตั้ง → ผู้จัดการอนุมัติ (ประทับ) → ฝ่ายขายกด 'แก้งานบริการ' ⇒ "เปิดแก้หลังอนุมัติ" */
  const reopenedLater = reopenedOrder(deferCols({ serviceSetupDeferredAt: '2026-09-20T02:00:00Z' }));
  assert.equal(serviceSetupReopened(reopenedLater)?.byName, 'Kamonrat P.');
  assert.equal(serviceSetupDeferred(reopenedLater), null);
  /* เคยเปิดแก้ → ยกเลิก → กู้คืนเป็นร่าง → ยื่นโดยยังไม่ตั้งงานบริการ → อนุมัติ ⇒ "ข้ามตอนยื่น" (ช่องของ 0396 ค้างเป็นประวัติ) */
  const deferredLater = reopenedOrder(deferCols({ serviceSetupDeferredAt: '2026-10-05T02:00:00Z' }));
  assert.equal(serviceSetupReopened(deferredLater), null);
  assert.deepEqual(serviceSetupDeferred(deferredLater), { at: '2026-10-05T02:00:00Z', byId: 'U-AE', byName: 'Kamonrat P.', stage: 'approved' });
  /* เวลาเท่ากันพอดี / เวลาที่อ่านไม่ออก = การเปิดแก้ชนะ (พฤติกรรมเดิมของ 0396) */
  assert.ok(serviceSetupReopened(reopenedOrder(deferCols({ serviceSetupDeferredAt: REOPEN_AT }))));
  assert.ok(serviceSetupReopened(reopenedOrder(deferCols({ serviceSetupDeferredAt: 'ไม่ใช่เวลา' }))));
  /* เวลาแบบ Postgres (ไมโครวินาที + เขตเวลา) เทียบได้ — ละเอียดถึงมิลลิวินาที (สองเหตุการณ์นี้ห่างกันเป็นขั้นของงาน ไม่ใช่เสี้ยววินาที) */
  assert.equal(serviceSetupReopened(reopenedOrder(deferCols({ serviceSetupDeferredAt: '2026-09-30T08:15:00.001000+00:00' }))), null);
  assert.equal(serviceSetupReopened(reopenedOrder(deferCols({ serviceSetupDeferredAt: '2026-09-30T15:15:01.123456+07:00' }))), null);
  assert.ok(serviceSetupReopened(reopenedOrder(deferCols({ serviceSetupDeferredAt: '2026-09-30T15:14:59.999999+07:00' }))), 'ข้ามก่อนเปิดแก้ 1 วินาที (เขตเวลาไทย)');
  /* ระหว่างรออนุมัติ การเปิดแก้ครั้งเก่าไม่มีผลอยู่แล้ว (สถานะไม่ใช่อนุมัติ) ⇒ ใบขึ้นเป็นใบที่ข้าม */
  assert.deepEqual(serviceSetupDeferred(reopenedOrder(deferCols({ status: 'pending_approval', serviceSetupDeferredAt: '2026-10-05T02:00:00Z' })))?.stage, 'pending');
  /* ผู้เรียกที่ select ไม่พกคอลัมน์ของ 0404 = เหมือนเดิม */
  assert.deepEqual(serviceSetupReopened(reopenedOrder()), serviceSetupReopened(reopenedOrder({ serviceSetupDeferredAt: undefined })));
});

test('0404 ด่านอนุมัติใบ (serviceSetupApprovalGate): ไม่มีตรา = ทุกข้อหยุด (เหมือนเดิม) · ยังข้ามอยู่ = หยุดเฉพาะข้อที่ข้ามไม่ได้', () => {
  const pending = (ctx, flag = true) => ({ ...ctx, order: { ...ctx.order, status: 'pending_approval', ...(flag ? deferCols() : {}) } });

  /* ไม่มีตรา — ทุกข้อหยุดการอนุมัติ (อาร์เรย์เดิม) */
  const plainIssues = serviceSetupIssues(pending(unansweredCtx(), false));
  const plain = serviceSetupApprovalGate(pending(unansweredCtx(), false), plainIssues);
  assert.deepEqual([plain.deferred, plain.deferring, plain.deferredIssues], [null, false, []]);
  assert.equal(plain.blocking, plainIssues, 'ไม่ข้าม = ข้อชุดเดิมทั้งชุด');

  /* มีตรา + ยังขาดข้อของการตั้ง ⇒ อนุมัติแบบไม่เปิดรอบขาย: ไม่มีข้อไหนหยุด */
  const skipping = serviceSetupApprovalGate(pending(unansweredCtx()));
  assert.deepEqual(skipping.deferred, { ...DEFER_INFO, stage: 'pending' });
  assert.deepEqual([skipping.deferring, skipping.blocking, keys(skipping.deferredIssues)], [true, [], ['kind_missing', 'kind_missing']]);

  /* มีตรา + ข้อของการตั้ง + ข้อที่ตามมา ⇒ เลื่อนทั้งคู่ */
  const follow = serviceSetupApprovalGate(pending(noPeriodCtx({ installments: monthlyRows({ coversFrom: null, coversTo: null }) })));
  assert.deepEqual([follow.deferring, follow.blocking.length, follow.deferredIssues.length], [true, 0, 13]);

  /* มีตรา + ข้อของการตั้ง + ข้อที่ข้ามไม่ได้ (งวดหายระหว่างรออนุมัติ) ⇒ หยุดเฉพาะข้อที่ข้ามไม่ได้ */
  const mixed = serviceSetupApprovalGate(pending(noPeriodCtx({ installments: [] })));
  assert.deepEqual([mixed.deferring, keys(mixed.blocking), keys(mixed.deferredIssues)], [true, ['installments_missing'], ['period_missing']]);
  const fn = serviceSetupApprovalGate(pending(fnGapCtx()));
  assert.deepEqual([fn.deferring, fn.blocking.map((i) => [i.key, i.owner])], [true, [['coverage_gap', 'FN']]], 'ข้อของบัญชีหยุดการอนุมัติเสมอ');

  /* มีตรา แต่ไม่เหลือข้อของการตั้ง (ฐานเห็นว่าครบ ⇒ เปิดรอบขายตามปกติ) ⇒ ด่านเต็มชุดของวันนี้: ข้อที่ตามมาก็หยุด */
  const stuck = serviceSetupApprovalGate(pending(completeCtx({ installments: monthlyRows({ coversFrom: null, coversTo: null }) })));
  assert.deepEqual([stuck.deferring, stuck.blocking.length, stuck.deferredIssues], [false, 12, []]);
  assert.ok(stuck.deferred, 'ตรายังอยู่ — แค่ไม่มีผลกับการอนุมัติ');
  const foreign = serviceSetupApprovalGate(pending(completeCtx({ fgOptionIds: new Set() })));
  assert.deepEqual([foreign.deferring, [...new Set(keys(foreign.blocking))]], [false, ['fg_foreign']]);
  /* มีตรา + ครบทุกอย่าง ⇒ ไม่มีอะไรหยุด และไม่ใช่การอนุมัติแบบข้าม */
  const complete = serviceSetupApprovalGate(pending(completeCtx()));
  assert.deepEqual([complete.deferring, complete.blocking, complete.deferredIssues], [false, [], []]);

  /* เส้นตั้งย้อนหลัง (อนุมัติแล้ว) ไม่ใช่ด่านนี้ — ทุกข้อหยุดการยื่นตรวจ/อนุมัติงานบริการเหมือนเดิม */
  const approved = unansweredCtx({ order: orderOf({ status: 'approved', ...deferCols() }) });
  const backfill = serviceSetupApprovalGate(approved);
  assert.deepEqual([backfill.deferred?.stage, backfill.deferring, keys(backfill.blocking)], ['approved', false, ['kind_missing', 'kind_missing']]);

  /* 🔴 fail-closed: ไม่ส่งข้อ = คิดเองจากบริบท ซึ่งต้องโหลดตัวเลือก FG มาแล้ว */
  assert.throws(() => serviceSetupApprovalGate({ ...pending(unansweredCtx()), fgOptionIds: null }), /fgOptionIds/);
});

test('0404 🔴 โมดัลอนุมัติของใบที่ข้าม: ใบที่ทุกรายการยังไม่ตอบ (ไม่มีแพ็คเกจให้นับ) ต้องพูดว่า "ยังไม่ส่ง TS" ไม่ใช่ "ใบนี้ไม่มีแพ็คเกจบริการ"', () => {
  const ctx = unansweredCtx({ order: orderOf({ status: 'pending_approval', ...deferCols() }) });
  assert.equal(serviceSetupTotals(ctx).packageLines, 0);
  assert.deepEqual(serviceSetupApprovalEffects(ctx), [
    'ยังไม่ส่งงานบริการให้ TS — ผู้ยื่นเลือกข้ามการตั้งงานบริการ (ยังขาด 2 ข้อ) · ไม่มีโซนขึ้น “งานเข้าใหม่ › รอตั้งรอบ”',
    'หลังอนุมัติ ใบขึ้น ‘ยังไม่ตั้งงานบริการ’ ในคิว ‘รอฉันลงมือ’ ของเจ้าของดีล — ฝ่ายขายตั้งงานบริการ กด ‘ยื่นตรวจงานบริการ’ แล้วผู้จัดการฝ่ายขายอนุมัติอีกครั้ง จึงส่ง TS',
  ]);
  assert.deepEqual(serviceSetupApprovalChecklist(ctx),
    ['ใบนี้ยื่นโดยยังไม่ตั้งงานบริการ (Kamonrat P. 02/10/2026) — ถ้าต้องให้ตั้งก่อน กด ‘ตีกลับให้แก้ไข’ แทนการอนุมัติ']);
  assert.equal(serviceSetupStripText(ctx), 'งานบริการ: ข้ามการตั้งตอนยื่น · ยังขาด 2 ข้อ · อนุมัติแล้วยังไม่ส่ง TS');
  assert.ok(serviceSetupStripText(ctx).includes(SERVICE_DEFERRED_TEXT.stripWarn), 'แถบหาคำเตือนด้วยสตริงย่อยนี้');
  assert.deepEqual(serviceSetupHeroFact(ctx), { label: 'รอบบริการที่ขาย', value: 'ยังไม่ตั้ง', sub: 'ข้ามตอนยื่น — ตั้งหลังอนุมัติ', tone: 'muted' });
  /* ไม่เตือนเรื่องสัญญา (ยังไม่มีอะไรส่งให้ TS) และไม่พูดว่าเปิดงานให้ TS */
  assert.ok(!serviceSetupApprovalEffects(ctx).some((line) => line.includes('ยังไม่ผูกสัญญา') || line.startsWith('เปิดงานบริการให้ TS')));
  /* ใบเดียวกันที่ไม่มีตรา — คำเดิมทุกตัวอักษร (ใบแบบนี้ผ่านด่านยื่นไม่ได้อยู่แล้ว แต่คำของผิวต้องไม่เปลี่ยน) */
  const plain = unansweredCtx({ order: orderOf({ status: 'pending_approval' }) });
  assert.deepEqual(serviceSetupApprovalEffects(plain), ['ใบนี้ไม่มีแพ็คเกจบริการ — ไม่มีอะไรส่งให้ TS']);
  assert.deepEqual(serviceSetupApprovalChecklist(plain), []);
  assert.equal(serviceSetupStripText(plain), 'งานบริการ: ใบนี้ไม่มีแพ็คเกจบริการ');
  /* ตอบ 'ไม่ใช่' แล้วแต่โซนค้าง (ไม่มีทั้งแพ็คเกจและรายการที่ยังไม่ตอบ) ก็ยังเป็นใบที่ข้าม */
  const stray = ctxOf({
    order: orderOf({ status: 'pending_approval', ...deferCols() }),
    lines: [manual(1, { serviceKind: 'not_service' })], zones: [zone('Z1', 'S1')], allocations: [alloc('SOL-1', 'Z1', 1)],
  });
  assert.equal(serviceSetupHeroFact(stray).sub, SERVICE_DEFERRED_TEXT.heroPending);
  assert.equal(serviceSetupApprovalEffects(stray)[0], SERVICE_DEFERRED_TEXT.approveEffectNoTs(1));
  /* ผู้เรียกที่ไม่มีตัวเลือก FG ต้องส่งข้อมาเอง (ใบรออนุมัติที่มีตรา) — ไม่ส่ง = throw ไม่เดา */
  const bare = { ...ctx, fgOptionIds: null };
  assert.throws(() => serviceSetupApprovalEffects(bare), /fgOptionIds/);
  assert.deepEqual(serviceSetupApprovalEffects(bare, { issues: serviceSetupIssues(ctx) }), serviceSetupApprovalEffects(ctx));
  assert.equal(serviceSetupStripText(bare, { issues: serviceSetupIssues(ctx) }), serviceSetupStripText(ctx));
});

test('0404 ก้อน GET ของใบร่าง: `skip` (ปุ่มข้าม) คิดจากทุกข้อ · `deferred` null · ผิวอื่นเหมือนเดิม', () => {
  const view = serviceSetupView(unansweredCtx(), { canEdit: true, userId: 'U-AE', role: 'ae' });
  assert.equal(view.flow, 'pipeline');
  assert.equal(view.deferred, null);
  assert.deepEqual(view.skip, serviceSetupSkipState(unansweredCtx(), { canEdit: true }));
  assert.equal(view.skip.canSkip, true);
  assert.deepEqual(keys(view.issues), ['kind_missing', 'kind_missing'], 'ใบร่าง: issues = ทุกข้อ (แผงแดงวาดจากชุดนี้)');
  assert.deepEqual(view.approvalEffects, ['ใบนี้ไม่มีแพ็คเกจบริการ — ไม่มีอะไรส่งให้ TS']);
  /* ผู้อ่านที่แก้ใบไม่ได้ไม่เห็นปุ่ม */
  assert.deepEqual(serviceSetupView(unansweredCtx(), { canEdit: false, userId: 'U-FN', role: 'finance' }).skip, SKIP_NONE);
  /* ใบที่ตั้งครบ / ใบสถานะอื่น = ก้อนกลาง */
  assert.deepEqual(serviceSetupView(completeCtx(), { canEdit: true }).skip, SKIP_NONE);
  assert.deepEqual(serviceSetupView(s247Ctx(), { canEdit: true, reopenBlockers: [] }).skip, SKIP_NONE);
  assert.equal(serviceSetupView(s247Ctx(), { canEdit: true, reopenBlockers: [] }).deferred, null);
});

test('0404 ก้อน GET ของใบรออนุมัติที่ข้าม (D-F11): issues = ข้อที่หยุดการอนุมัติเท่านั้น · `deferred` บอก active/missing/blocking สี่แบบ', () => {
  const pending = (ctx) => ({ ...ctx, order: { ...ctx.order, status: 'pending_approval', submittedByName: 'Kamonrat P.', submittedAt: DEFER_AT, ...deferCols() } });
  const sup = { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' };

  /* ① ยังข้ามอยู่ ไม่มีข้อที่ข้ามไม่ได้ — อนุมัติได้เลย (ไม่เปิดรอบขาย) */
  const a = serviceSetupView(pending(unansweredCtx()), sup);
  assert.deepEqual([a.flow, a.mode], ['locked', 'read']);
  assert.deepEqual(a.issues, [], 'โมดัลอนุมัติไม่ขึ้น "อนุมัติไม่ได้ — งานบริการยังขาด n ข้อ"');
  assert.deepEqual(a.deferred, { ...DEFER_INFO, stage: 'pending', active: true, missing: 2, blocking: 0 });
  assert.deepEqual(a.skip, SKIP_NONE, 'ยื่นไปแล้ว — ไม่มีปุ่มข้าม');
  assert.equal(a.reopened, null);
  assert.deepEqual(a.approvalEffects, [SERVICE_DEFERRED_TEXT.approveEffectNoTs(2), SERVICE_DEFERRED_TEXT.approveEffectAfter]);
  assert.deepEqual(a.approvalChecklist, [SERVICE_DEFERRED_TEXT.approveCheck(a.deferred)]);
  assert.equal(a.stripText, SERVICE_DEFERRED_TEXT.strip(2));
  assert.deepEqual([a.hero.value, a.hero.sub], ['ยังไม่ตั้ง', SERVICE_DEFERRED_TEXT.heroPending]);
  assert.equal(a.approvalSubject, 'SO-26100005-0 · ยื่นโดย Kamonrat P. 02/10/2026', 'ประโยคหัวโมดัลไม่เปลี่ยน');
  assert.equal(a.editBlockedReason, serviceSetupEditError(pending(unansweredCtx()).order, { canEdit: true }), 'รออนุมัติยังแก้ไม่ได้ตามเดิม');

  /* ② ยังข้ามอยู่ + มีข้อที่ข้ามไม่ได้ (งวดถูกลบระหว่างรออนุมัติ) — อนุมัติไม่ได้ ต้องตีกลับ */
  const b = serviceSetupView(pending(noPeriodCtx({ installments: [] })), sup);
  assert.deepEqual(keys(b.issues), ['installments_missing']);
  assert.deepEqual(b.deferred, { ...DEFER_INFO, stage: 'pending', active: true, missing: 1, blocking: 1 });
  assert.deepEqual(b.approvalEffects, [SERVICE_DEFERRED_TEXT.approveEffectNoTs(1), SERVICE_DEFERRED_TEXT.approveEffectAfter]);

  /* ③ เลือกข้ามไว้ แต่ตอนนี้ครบแล้ว — อนุมัติ = เปิดงานให้ TS ตามปกติ (ตราไม่มีผล) */
  const plainComplete = { ...completeCtx(), order: { ...completeCtx().order, status: 'pending_approval', submittedByName: 'Kamonrat P.', submittedAt: DEFER_AT } };
  const plainView = serviceSetupView(plainComplete, sup);
  const c = serviceSetupView(pending(completeCtx()), sup);
  assert.deepEqual(c.issues, []);
  assert.deepEqual(c.deferred, { ...DEFER_INFO, stage: 'pending', active: false, missing: 0, blocking: 0 });
  assert.deepEqual(c.approvalEffects, [SERVICE_DEFERRED_TEXT.approveEffectComplete, ...plainView.approvalEffects], 'บรรทัดเดิมครบ + บอกว่าตราการข้ามไม่มีผลแล้ว');
  assert.ok(c.approvalEffects[1].startsWith('เปิดงานบริการให้ TS'));
  assert.deepEqual([c.approvalChecklist, c.stripText, c.hero], [plainView.approvalChecklist, plainView.stripText, plainView.hero]);

  /* ④ เลือกข้ามไว้ แต่ข้ามไม่ได้แล้ว (ไม่เหลือข้อของการตั้ง) และยังขาดข้ออื่น — อนุมัติไม่ได้ · ไม่สัญญาอะไร */
  const stuckCtx = completeCtx({ installments: monthlyRows({ coversFrom: null, coversTo: null }) });
  const d = serviceSetupView(pending(stuckCtx), sup);
  assert.equal(d.issues.length, 12);
  assert.deepEqual(d.deferred, { ...DEFER_INFO, stage: 'pending', active: false, missing: 0, blocking: 12 });
  const plainStuck = serviceSetupView({ ...stuckCtx, order: pending(stuckCtx).order && { ...stuckCtx.order, status: 'pending_approval', submittedByName: 'Kamonrat P.', submittedAt: DEFER_AT } }, sup);
  assert.deepEqual(d.approvalEffects, plainStuck.approvalEffects, 'ไม่มีบรรทัด "ครบแล้ว" ระหว่างที่ยังขาดข้อ');
  assert.deepEqual([d.approvalChecklist, d.stripText, d.hero, d.issues], [plainStuck.approvalChecklist, plainStuck.stripText, plainStuck.hero, plainStuck.issues]);

  /* ใบรออนุมัติที่ไม่มีตรา: issues = ทุกข้อ (เหมือนเดิม) · deferred null */
  const noFlag = serviceSetupView({ ...unansweredCtx(), order: orderOf({ status: 'pending_approval' }) }, sup);
  assert.deepEqual([keys(noFlag.issues), noFlag.deferred], [['kind_missing', 'kind_missing'], null]);
});

test('0404 ก้อน GET หลังอนุมัติแบบข้าม: เส้นตั้งย้อนหลังเดิมทั้งเส้น (แก้ได้ · ยื่นตรวจ · ผู้จัดการตรวจ) + ป้าย "ข้ามตอนยื่น"', () => {
  const approved = (ctx, over = {}) => ({ ...ctx, order: { ...ctx.order, status: 'approved', approvedAt: '2026-10-03T03:00:00Z', ...deferCols(), ...over } });
  const ae = { canEdit: true, userId: 'U-AE', role: 'ae' };

  const view = serviceSetupView(approved(unansweredCtx()), ae);
  assert.deepEqual([view.flow, view.mode, view.backfill.canSubmit], ['backfill', 'edit', true], 'เส้นเดิมรับใบนี้โดยไม่มีอะไรเปลี่ยน');
  assert.equal(serviceBackfillNeeded(approved(unansweredCtx()).order, [manual(1), manual(2)]), true);
  assert.deepEqual(view.deferred, { ...DEFER_INFO, stage: 'approved', active: true, missing: 2, blocking: 0 });
  assert.deepEqual(keys(view.issues), ['kind_missing', 'kind_missing'], 'เส้นตั้งย้อนหลัง: issues = ทุกข้อ (ด่านยื่นตรวจเต็มชุด)');
  assert.deepEqual(view.skip, SKIP_NONE);
  assert.equal(view.reopened, null);
  assert.equal(view.reopen.visible, false, 'ยังไม่ประทับ — ไม่มีปุ่มแก้งานบริการ');
  assert.equal(view.hero.sub, 'ตั้งที่ตารางรายการ แล้วยื่นตรวจ · ข้ามตอนยื่น — ยังไม่ส่ง TS');
  assert.ok(view.backfillSubmitPrompt, 'โมดัลยื่นตรวจงานบริการตัวเดิม');

  /* ตั้งครบแล้วยื่นตรวจ → ผู้จัดการ: ข้อแรกของสิ่งที่ต้องตรวจบอกว่าใบนี้อนุมัติมาโดยข้าม · ด่านเงิน "เริ่มใช้" (ประทับครั้งแรก) */
  const sent = approved(completeCtx(), { serviceSetupState: 'submitted', serviceSetupSubmittedById: 'U-AE', serviceSetupSubmittedByName: 'Kamonrat P.', serviceSetupSubmittedAt: '2026-10-04T03:00:00Z' });
  const review = serviceSetupView(sent, { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' });
  assert.equal(review.backfill.canReview, true);
  assert.equal(review.approvalChecklist[0], 'ใบนี้อนุมัติโดยข้ามการตั้งงานบริการตอนยื่น (Kamonrat P. 02/10/2026)');
  assert.ok(review.approvalChecklist[1].startsWith('ตรวจแพ็คเกจ'));
  assert.ok(review.approvalEffects.some((e) => e.startsWith('ด่านเงินของบัญชีเริ่มใช้กับใบนี้')), 'คำของใบเดิมจริงกับใบนี้ (ยังไม่เคยประทับ)');
  assert.ok(review.approvalEffects[0].startsWith('เปิดงานบริการให้ TS'));
  assert.ok(review.hero.sub.endsWith(' · รอตรวจ'), review.hero.sub);
  assert.deepEqual(review.deferred, { ...DEFER_INFO, stage: 'approved', active: true, missing: 0, blocking: 0 });
  /* ไม่ใช่ใบที่ข้าม = ไม่มีข้อนั้น (คำเดิม) */
  const legacy = { ...sent, order: { ...sent.order, serviceSetupDeferredAt: null, serviceSetupDeferredById: null, serviceSetupDeferredByName: null } };
  assert.ok(serviceSetupApprovalChecklist(legacy, { flow: 'backfill' })[0].startsWith('ตรวจแพ็คเกจ'));
  assert.deepEqual(serviceSetupApprovalChecklist(sent, { flow: 'backfill' }).slice(1), serviceSetupApprovalChecklist(legacy, { flow: 'backfill' }));
  assert.deepEqual(serviceSetupApprovalEffects(sent, { flow: 'backfill' }), serviceSetupApprovalEffects(legacy, { flow: 'backfill' }));

  /* ผู้จัดการอนุมัติแล้ว (ประทับ) — ตราคงเป็นประวัติ ทุกผิวเท่ากับใบประทับปกติ · ปุ่ม 'แก้งานบริการ' ของ 0396 ใช้ได้ */
  const stampedFlag = s247Ctx({ order: stampedOrder(deferCols()) });
  const opts = { canEdit: true, userId: 'U-AE', role: 'ae', reopenBlockers: [] };
  assert.deepEqual(serviceSetupView(stampedFlag, opts), serviceSetupView(s247Ctx(), opts));
  assert.equal(serviceSetupView(stampedFlag, opts).reopen.visible, true);
});

test('0404 ตราการข้ามที่ค้างบนใบสถานะอื่นไม่มีผลกับผิวไหนเลย (ย้อนการอนุมัติ · ยกเลิก · ถูกแทน · ถูก Rev. ทับ)', () => {
  const opts = { canEdit: true, userId: 'U-AE', role: 'ae' };
  for (const over of [{ status: 'approval_revoked' }, { status: 'cancelled' }, { status: 'revised', supersededById: 'SO2' }, { status: 'approved', supersededById: 'SO2' }]) {
    for (const make of [unansweredCtx, completeCtx, noPeriodCtx]) {
      const plain = make();
      const withFlag = { ...plain, order: { ...plain.order, ...over, ...deferCols() } };
      const without = { ...plain, order: { ...plain.order, ...over } };
      const strip = ({ order, ...rest }) => rest;
      assert.deepEqual(serviceSetupView(withFlag, opts), serviceSetupView(without, opts), JSON.stringify(over));
      assert.deepEqual(strip(withFlag), strip(without));
    }
  }
});

test('0404 แคตตาล็อก: คีย์ตามสัญญากับจอ · คำตามแผน (ตามตัวอักษร) · คำรอบ/แพ็คจากแคตตาล็อกกลาง · ไม่มีคำต้องห้าม', () => {
  const T = SERVICE_DEFER_TEXT;
  const D = SERVICE_DEFERRED_TEXT;
  assert.deepEqual(Object.keys(T), ['button', 'deferTag', 'panelLead', 'panelBlocked', 'blocked', 'predecessorRunning', 'panelPredecessor',
    'predecessorStandard', 'panelPredecessorStandard',
    'title', 'verb', 'subject', 'effectSkip', 'effectApprove', 'effectAfter', 'effectCoverage', 'effectReset', 'confirmLabel', 'toast', 'gone', 'complete',
    'unsavedDocument', 'failed', 'loadFailed', 'noSites']);
  assert.deepEqual(Object.keys(D), ['badge', 'who', 'pendingTitle', 'pendingLine', 'pendingHow', 'pendingComplete', 'pendingBlocked', 'pendingStuck',
    'strip', 'stripWarn', 'heroPending', 'approveCheck', 'approveEffectNoTs', 'approveEffectAfter', 'approveEffectComplete', 'approvedToast',
    'bannerTitle', 'bannerLine', 'railEyebrow', 'railTitle', 'railMeta', 'railLine', 'actualNote', 'cardMeta', 'cardMetaSubmitted', 'heroSuffix',
    'queueLabel', 'queueTag', 'auditTag', 'checklistLine', 'tsPrefix', 'tsSub', 'tsOrphanTitle']);
  assert.ok(Object.isFrozen(T) && Object.isFrozen(D));

  /* ปุ่ม · แผงแดง · โมดัล */
  assert.deepEqual([T.button, T.deferTag, T.title, T.verb, T.confirmLabel], ['ยื่นโดยยังไม่ตั้งงานบริการ', 'ข้ามได้', 'ยื่นอนุมัติโดยยังไม่ตั้งงานบริการ', 'ยื่น', 'ยื่นโดยยังไม่ตั้งงานบริการ']);
  assert.equal(T.panelLead(3), 'ยังไม่พร้อมตั้งงานบริการ? ยื่นได้เลยโดยข้าม 3 ข้อที่ติดป้าย ‘ข้ามได้’ — อนุมัติแล้วนับ Actual ทันที · TS ยังไม่ได้รับงานจนกว่าจะตั้งงานบริการและผู้จัดการฝ่ายขายอนุมัติ');
  assert.equal(T.panelBlocked(3, 2), 'ข้ามการตั้งงานบริการได้ 3 ข้อ แต่ยังเหลือ 2 ข้อที่ข้ามไม่ได้ (งวดชำระ · วันวางบิล · กำหนดชำระ · ข้อที่รอฝ่ายบัญชี) — แก้ก่อนแล้วจึงยื่น');
  assert.equal(T.blocked(2), 'ยื่นโดยยังไม่ตั้งงานบริการยังไม่ได้ — เหลือ 2 ข้อที่ข้ามไม่ได้ (งวดชำระ · วันวางบิล · กำหนดชำระ · ข้อที่รอฝ่ายบัญชี) แก้ที่แท็บการชำระก่อน');
  assert.equal(T.predecessorRunning('SO-26090001-0', 2), 'ยื่นโดยยังไม่ตั้งงานบริการไม่ได้ — SO-26090001-0 ยังมีรอบบริการที่ TS เดินอยู่ 2 ไซต์ · ต้องตั้งงานบริการของใบ Rev. นี้ให้ครบแล้วกด ‘ยื่นอนุมัติ’ ตามปกติ รอบบริการจึงย้ายมาใบนี้');
  assert.equal(T.predecessorRunning(null, 1), 'ยื่นโดยยังไม่ตั้งงานบริการไม่ได้ — ใบเดิม ยังมีรอบบริการที่ TS เดินอยู่ 1 ไซต์ · ต้องตั้งงานบริการของใบ Rev. นี้ให้ครบแล้วกด ‘ยื่นอนุมัติ’ ตามปกติ รอบบริการจึงย้ายมาใบนี้');
  assert.equal(T.panelPredecessor('SO-26090001-0'), 'ใบนี้เป็น Rev. ของ SO-26090001-0 ที่ TS ยังเดินรอบบริการอยู่ — ข้ามการตั้งงานบริการไม่ได้ ต้องตั้งให้ครบก่อนยื่น');
  assert.deepEqual([T.toast, T.gone, T.complete], [
    'ยื่นอนุมัติแล้ว — ข้ามการตั้งงานบริการไว้ · ตั้งได้หลังอนุมัติ',
    'ใบนี้ยื่นโดยยังไม่ตั้งงานบริการไม่ได้แล้ว — โหลดข้อมูลล่าสุดแล้ว',
    'งานบริการครบแล้ว — กด ‘ยื่นอนุมัติ’ ตามปกติ',
  ]);
  /* ตรวจทานรอบสุดท้าย (08/10): ใบ Rev. ที่ TS ตั้งมาตรฐาน มล./เดือนบนรอบขายของใบเดิม · ของที่ยังไม่บันทึก · ยื่นไม่ผ่าน/โหลดไม่ขึ้น · ลูกค้ายังไม่มีไซต์ */
  assert.equal(T.predecessorStandard('SO-26090001-0', 3), 'ยื่นโดยยังไม่ตั้งงานบริการไม่ได้ — TS ตั้งมาตรฐาน มล./เดือนบนรอบขายของ SO-26090001-0 ไว้แล้ว 3 รอบขาย · ต้องตั้งงานบริการของใบ Rev. นี้ให้ครบแล้วกด ‘ยื่นอนุมัติ’ ตามปกติ ค่ามาตรฐานจึงถูกยกมาใบนี้');
  assert.equal(T.predecessorStandard(null, 1).startsWith('ยื่นโดยยังไม่ตั้งงานบริการไม่ได้ — TS ตั้งมาตรฐาน มล./เดือนบนรอบขายของ ใบเดิม ไว้แล้ว 1 รอบขาย'), true);
  assert.equal(T.panelPredecessorStandard('SO-26090001-0'), 'ใบนี้เป็น Rev. ของ SO-26090001-0 ที่ TS ตั้งมาตรฐาน มล./เดือนไว้แล้ว — ข้ามการตั้งงานบริการไม่ได้ ต้องตั้งให้ครบก่อนยื่น');
  assert.equal(T.unsavedDocument, 'มีการแก้ไขที่ยังไม่บันทึก (ข้อมูลใบสั่งขาย · ไฟล์ยืนยันคำสั่งซื้อ · วันของงวดชำระ) — บันทึกก่อน แล้วจึงกด ‘ยื่นโดยยังไม่ตั้งงานบริการ’');
  assert.deepEqual([T.failed, T.loadFailed], [
    'ยื่นโดยยังไม่ตั้งงานบริการไม่สำเร็จ — ยังไม่ได้ยื่น ลองกดอีกครั้ง',
    'โหลดงานบริการล่าสุดไม่สำเร็จ — ยังไม่ได้ยื่น ลองกดอีกครั้ง',
  ]);
  /* ประกาศ "ลูกค้ายังไม่มีไซต์" ของใบร่าง — ห้ามพูดว่า "ยื่นอนุมัติไม่ได้จนกว่ามีโซน" (ไม่จริงแล้ว: ยื่นโดยยังไม่ตั้งงานบริการได้) และต้องชี้ทางไปปุ่มข้าม */
  assert.equal(T.noSites('ลูกค้า AR-0100'), 'ลูกค้า AR-0100 ยังไม่มีไซต์ในทะเบียน — เลือกโซนไม่ได้ · บันทึกร่างได้ · ยื่นอนุมัติตามปกติต้องมีโซนก่อน — ถ้ายังไม่พร้อม กด ‘ยื่นอนุมัติ’ แล้วเลือก ‘ยื่นโดยยังไม่ตั้งงานบริการ’ (ตั้งหลังอนุมัติ)');
  assert.doesNotMatch(T.noSites('x'), /ยื่นอนุมัติไม่ได้/);
  assert.ok(T.noSites('x').includes(T.button), 'ชี้ชื่อปุ่มตรงกับปุ่มจริง');
  assert.equal(T.noSites().startsWith('ลูกค้า ยังไม่มีไซต์'), true);
  assert.equal(D.tsOrphanTitle(2), 'รอบที่ยังผูกใบเดิม 2 รอบ — ใบ Rev. ล่าสุดยังไม่ตั้งงานบริการ (ฝ่ายขายข้ามตอนยื่น) · ยังไม่ต้องปิดรอบหรือถอนเครื่อง รอฝ่ายขายตั้งงานบริการและผู้จัดการฝ่ายขายอนุมัติก่อน');

  /* ใบรออนุมัติ */
  const d = { ...DEFER_INFO, stage: 'pending' };
  assert.deepEqual([D.badge, D.pendingTitle, D.stripWarn, D.heroPending], ['ยังไม่ตั้งงานบริการ', 'ยื่นโดยยังไม่ตั้งงานบริการ', 'ยังไม่ส่ง TS', 'ข้ามตอนยื่น — ตั้งหลังอนุมัติ']);
  assert.equal(D.who(d), 'Kamonrat P. 02/10/2026');
  assert.equal(D.who({}), '— —');
  assert.equal(D.pendingLine(d, 4), 'Kamonrat P. เลือกข้ามการตั้งงานบริการตอนยื่น (02/10/2026) · ยังขาด 4 ข้อ — อนุมัติแล้วนับ Actual ทันที แต่ยังไม่ส่งงานให้ TS จนกว่าจะตั้งงานบริการและผู้จัดการฝ่ายขายอนุมัติ');
  assert.equal(D.pendingHow, 'ต้องการให้ตั้งก่อนอนุมัติ: ผู้ยื่นกด ‘ดึงกลับ’ หรือผู้อนุมัติกด ‘ตีกลับให้แก้ไข’ (การข้ามถูกล้าง ต้องเลือกใหม่ตอนยื่น)');
  assert.equal(D.pendingComplete(d), 'Kamonrat P. เลือกข้ามไว้ตอนยื่น (02/10/2026) แต่ตอนนี้งานบริการครบแล้ว — อนุมัติแล้วส่งงานให้ TS ตามปกติ');
  assert.equal(D.pendingBlocked(2), 'แต่ยังมี 2 ข้อที่ข้ามไม่ได้ — อนุมัติไม่ได้จนกว่าจะตีกลับให้ฝ่ายขายแก้');
  assert.equal(D.pendingStuck(d, 12), 'Kamonrat P. เลือกข้ามไว้ตอนยื่น (02/10/2026) แต่ตอนนี้ข้ามไม่ได้แล้ว และยังขาด 12 ข้อ — อนุมัติไม่ได้ · ตีกลับให้ฝ่ายขายแก้แล้วยื่นใหม่');
  assert.equal(D.pendingLine({}, 1).startsWith('ผู้ยื่น เลือกข้าม'), true, 'ไม่มีชื่อ = "ผู้ยื่น"');
  assert.equal(D.strip(1234), 'งานบริการ: ข้ามการตั้งตอนยื่น · ยังขาด 1,234 ข้อ · อนุมัติแล้วยังไม่ส่ง TS');
  assert.equal(D.approveEffectComplete, 'ผู้ยื่นเลือกข้ามไว้ตอนยื่น แต่ตอนนี้งานบริการครบแล้ว — อนุมัติแล้วเปิดงานให้ TS ตามปกติ');
  assert.equal(D.approvedToast, 'อนุมัติแล้ว · นับ Actual แล้ว — ยังไม่ส่งงานให้ TS (ข้ามการตั้งงานบริการตอนยื่น)');

  /* หลังอนุมัติ (เส้นตั้งย้อนหลัง) · คิว · audit · แท็บ TS */
  const { roundsLabel, packsLabel } = SERVICE_SETUP_LINE_TEXT;
  assert.equal(D.bannerTitle, 'ข้ามการตั้งงานบริการตอนยื่น');
  assert.equal(D.bannerLine(d), `ข้ามโดย Kamonrat P. 02/10/2026 — ตั้งงานบริการ (แพ็คเกจ · ไซต์ · โซน · ${roundsLabel} · ${packsLabel} · ช่วงบริการ) แล้วยื่นให้ผู้จัดการฝ่ายขายตรวจ · ยอด/Actual/เอกสารไม่เปลี่ยน`);
  assert.deepEqual([D.railEyebrow, D.railTitle, D.railMeta], ['Service setup · ข้ามตอนยื่น', 'งานบริการ (ข้ามตอนยื่น)', 'อนุมัติแล้วโดยยังไม่ตั้งงานบริการ — ผู้จัดการฝ่ายขายตรวจก่อนส่งให้ TS']);
  assert.equal(D.railLine(d), 'ข้ามการตั้งงานบริการตอนยื่น 02/10/2026 โดย Kamonrat P.');
  assert.equal(D.actualNote('2026-10-03T03:00:00Z'), 'ยอดถูกนับเป็น Actual แล้ว (อนุมัติ 03/10/2026) — การตั้งงานบริการทีหลังไม่เปลี่ยนยอดนี้');
  assert.deepEqual([D.cardMeta, D.cardMetaSubmitted, D.heroSuffix, D.queueLabel, D.queueTag, D.auditTag, D.tsPrefix], [
    'ข้ามการตั้งงานบริการตอนยื่น — แก้ได้จนกว่าจะยื่นตรวจ', 'ข้ามตอนยื่น', ' · ข้ามตอนยื่น — ยังไม่ส่ง TS',
    'งานบริการ (ข้ามตอนยื่น)', 'ยังไม่ตั้งงานบริการ (ข้ามตอนยื่น)', '(ข้ามตอนยื่น)', 'ข้ามตอนยื่น · ',
  ]);
  assert.equal(D.tsSub(d), 'ฝ่ายขายยื่นโดยยังไม่ตั้งงานบริการ 02/10/2026');
  /* ป้ายขั้นของเส้นตั้งย้อนหลังยังเป็นชุดเดิม (จริงกับใบที่ข้าม — ใบไม่เคยตั้ง) */
  assert.deepEqual(SERVICE_BACKFILL_STATE_LABELS, { not_started: 'ยังไม่เริ่ม', editing: 'ฝ่ายขายกำลังตั้ง', submitted: 'รอผู้จัดการตรวจ', rejected: 'ตีกลับ' });

  /* รหัสของตัวห่อการยื่น (0404) — 409 ทุกตัว · ไม่มีคีย์ไหนเป็นสตริงย่อยของอีกคีย์ · ผู้แปลหาเจอเป็นตัวเอง */
  const M = SERVICE_SETUP_SQL_MESSAGES;
  const NEW_CODES = ['service_setup_defer_state_invalid', 'service_setup_defer_nothing', 'service_setup_defer_terms_exist', 'service_setup_defer_plans_running'];
  assert.deepEqual(NEW_CODES.map((code) => M[code]?.status), [409, 409, 409, 409]);
  const codes = Object.keys(M);
  for (const a of codes) for (const b of codes) if (a !== b) assert.ok(!b.includes(a), `${a} อยู่ใน ${b}`);
  for (const code of NEW_CODES) assert.equal(serviceSetupSqlMessage({ message: `P0001: ${code}` })?.code, code);
  assert.equal(serviceSetupSqlMessage({ message: 'service_setup_state_invalid' })?.code, 'service_setup_state_invalid', 'รหัสเดิมยังถูกแปลเป็นตัวเอง');
  assert.equal(serviceSetupSqlMessage({ message: 'service_setup_legacy_terms_exist' })?.code, 'service_setup_legacy_terms_exist');
  assert.equal(M.service_setup_defer_nothing.message, 'งานบริการของใบนี้ครบแล้ว (หรือไม่มีรายการที่ต้องตั้ง) — กด ‘ยื่นอนุมัติ’ ตามปกติ');

  /* คำต้องห้าม (มติ 29/09) ไม่กลับมากับคำใหม่ · คำรอบ/แพ็คมาจากแคตตาล็อกกลางที่เดียว */
  const all = JSON.stringify([
    ...Object.values(T).map((v) => (typeof v === 'function' ? v(1, 2) : v)),
    ...Object.values(D).map((v) => (typeof v === 'function' ? v(d, 2) : v)),
    ...NEW_CODES.map((code) => M[code].message),
  ]);
  assert.doesNotMatch(all, /ไปกี่รอบ|แต่ละครั้งกี่แพ็ค|แพ็คต่อรอบ/);
  assert.equal(all.split(roundsLabel).length - 1, 1, 'คำ "จำนวนรอบบริการ" มีที่เดียว (บรรทัดแบนเนอร์) และมาจาก ROUNDS_TERM');
  assert.equal(all.split(packsLabel).length - 1, 1);
});
