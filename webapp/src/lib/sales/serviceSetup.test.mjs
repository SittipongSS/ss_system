// ── งานบริการรายบรรทัดของใบสั่งขาย (mig 0391 · PR-A) — ตัวตัดสินล้วน ทดสอบได้โดยไม่แตะ DB ──────────────
//
// สิ่งที่ชุดนี้ล็อกไว้: ชนิดของบรรทัด (D2) · ด่านยื่น (ข้อที่ยังขาด · fail-closed) · กติกางวด (D7/D8) ·
// ขั้นของงาน/ล็อก (D9/D25/D28) · ก้อนที่จอส่งมาบันทึก · ข้อความของโมดัล/แถบ/หัวใบ (ภาคผนวก A)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICE_KIND_OPTIONS,
  SERVICE_SETUP_ISSUE_TEXT,
  SERVICE_SETUP_LIMITS,
  SERVICE_SETUP_SQL_MESSAGES,
  isManualSalesLine,
  issuesByTab,
  lineCategoryCode,
  lineDerivedText,
  lineQtyCrossCheck,
  lineSetupTotals,
  periodEndFromMonths,
  periodSpan,
  roundChipsFromPeriod,
  serviceBackfillAwaitingReview,
  serviceBackfillNeeded,
  serviceBackfillState,
  serviceBackfillSubmitPrompt,
  serviceLineLabel,
  serviceLineRole,
  serviceLineRoleSource,
  servicePeriodOf,
  serviceSetupApprovalChecklist,
  serviceSetupApprovalEffects,
  serviceSetupAuditSnapshot,
  serviceSetupEditError,
  serviceSetupFieldId,
  serviceSetupFlow,
  serviceSetupFooterText,
  serviceSetupHeroFact,
  serviceSetupIssues,
  serviceSetupRequired,
  serviceSetupRevisionLine,
  serviceSetupSqlIssues,
  serviceSetupSqlMessage,
  serviceSetupStripText,
  serviceSetupSubmitLine,
  serviceSetupTotals,
  serviceSetupView,
  serviceSetupWarnings,
  validateServiceSetupPatch,
} from './serviceSetup.js';
import { SERVICE_ROUND_CATEGORY } from './serviceOrders.js';
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

/* ตารางความจริงเดียวกับ CASE ของ `sales_order_line_service_role` (0391) — ค่าว่าง '' = ไม่มี (NULLIF) · ไม่ trim */
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
  assert.equal(issues[0].message, 'รายการ 1 · 02-001 : ระบบกระจายกลิ่น (สาขา 1): ยังไม่เลือกว่าเป็น แพ็คเกจบริการรายรอบ หรือ ไม่ใช่งานบริการรายรอบ');
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

test('ขาดแพ็คต่อรอบ / รอบบริการ / โซน · โซนค้างบนบรรทัดที่ไม่ใช่งานบริการ', () => {
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
  assert.equal(issues[0].message, 'รายการ 2 · Lobby Z2: ยังไม่ใส่แพ็คต่อรอบ');
  assert.equal(issues[3].message, 'รายการ 6: ตั้งเป็นไม่ใช่งานบริการรายรอบแต่ยังมีโซนค้าง — บันทึกงานบริการใหม่');
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
  assert.equal(issues[0].message, 'รายการ 1 · 02-001 : ระบบกระจายกลิ่น (สาขา 1): ยังไม่เลือกว่าเป็น แพ็คเกจบริการรายรอบ หรือ ไม่ใช่งานบริการรายรอบ');
  assert.equal(issues[1].message, 'รายการ 1 · Lobby Z1: ยังไม่ใส่แพ็คต่อรอบ');
  assert.equal(issues[2].message, 'ยังไม่ใส่ช่วงบริการ (วันเริ่ม–วันสิ้นสุด)');
  assert.match(issues[3].message, /^รายการ 2: แพ็คเกจ FG-0521-02-001-00012 ใช้ไม่ได้แล้ว/);
  // รับ DETAIL ดิบ (CSV) ได้ด้วย
  assert.equal(serviceSetupSqlIssues('rounds_missing:SOL-2,zones_missing:SOL-2', ctx).length, 2);
});

test('ทุกรหัสข้อที่ยังขาด/คำเตือนมีข้อความ · ข้อความของฐานไม่มีคีย์ที่เป็นสตริงย่อยของอีกคีย์', () => {
  for (const key of ['kind_missing', 'fg_missing', 'fg_invalid', 'fg_foreign', 'zones_missing', 'packs_missing', 'zone_invalid',
    'zones_on_not_service', 'rounds_missing', 'period_missing', 'installments_missing', 'due_missing', 'billing_missing',
    'coverage_missing', 'coverage_start', 'coverage_gap', 'coverage_end', 'unsaved', 'coverage_overlap', 'fn_coverage_missing']) {
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
    'อนุมัติแล้ว — แพ็คเกจ/โซน/แพ็คต่อรอบ/ช่วงบริการล็อก · แก้ด้วยย้อนการอนุมัติแล้วออก Rev. (จำนวนรอบแก้ได้)');
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
  assert.equal(lineDerivedText(lineSetupTotals(line, ctx)), 'ต่อรอบ 1 แพ็ค · 12 รอบ · ทั้งรายการ 12 แพ็ค');
  assert.equal(lineDerivedText({ rounds: null }), null);
  assert.equal(serviceSetupFooterText(serviceSetupTotals(ctx)),
    'งานบริการทั้งใบ: 10 รายการแพ็คเกจ · 10 โซนใน 10 ไซต์ · ต่อรอบ 10 แพ็ค · ทั้งใบ 120 แพ็ค');
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
      [{ lineId: 'SOL-1', zoneId: 'Z1', field: 'packs', message: 'แพ็คต่อรอบต้องเป็นจำนวนเต็ม 1–9999' }], String(packs));
  }
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-1', rounds: 0 }] }), [{ lineId: 'SOL-1', field: 'rounds', message: 'รอบบริการต้องเป็นจำนวนเต็ม 1–999' }]);
  assert.equal(err({ lines: [{ lineId: 'SOL-1', rounds: 1000 }] })[0].field, 'rounds');

  const withFg = completeCtx({ lines: [fgLine(1, 'FG-0233-02-001-00001'), manual(2, { serviceKind: 'not_service' })] });
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-1', kind: 'package' }] }, withFg),
    [{ lineId: 'SOL-1', field: 'kind', message: 'รายการที่มีรหัส FG ตั้งชนิดเองไม่ได้ — ระบบตัดสินจากหมวดของ FG' }]);
  assert.equal(err({ lines: [{ lineId: 'SOL-1', serviceProductId: null }] }, withFg)[0].field, 'kind');
  // FG บนบรรทัดที่ไม่ใช่งานบริการ
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-2', serviceProductId: 'P1' }] }, withFg),
    [{ lineId: 'SOL-2', field: 'fg', message: 'รายการนี้ไม่ใช่แพ็คเกจบริการรายรอบ — เลือกชนิดเป็นแพ็คเกจก่อน แล้วจึงเลือก FG/โซน/รอบ' }]);
  assert.equal(err({ lines: [{ lineId: 'SOL-2', zones: [{ zoneId: 'Z1', packsPerRound: 1 }] }] }, withFg)[0].field, 'zones');
  // ล้างได้เสมอ (สลับเป็นไม่ใช่งานบริการ)
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-2', serviceProductId: null, rounds: null, zones: [] }] }, withFg), []);
  // บรรทัด FG 02-001 ใส่รอบ/โซนได้
  assert.deepEqual(err({ lines: [{ lineId: 'SOL-1', rounds: 12, zones: [{ zoneId: 'Z1', packsPerRound: 1 }] }] }, withFg), []);

  assert.deepEqual(err({ lines: [{ lineId: 'SOL-404' }] }),
    [{ lineId: 'SOL-404', field: 'line', message: 'มีรายการที่ไม่ได้อยู่ในใบนี้ — โหลดหน้าใหม่แล้วลองอีกครั้ง' }]);
  assert.equal(err({ lines: [{ lineId: 'SOL-1', kind: 'bogus' }] })[0].message, 'ชนิดรายการไม่ถูกต้อง');
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
    'เปิดงานบริการให้ TS: 10 โซนใน 10 ไซต์ · รวม 10 แพ็ค/รอบ · ขายไว้ 12 รอบ/โซน — ขึ้นที่ “งานเข้าใหม่ › รอตั้งรอบ” ทันที ไม่ต้องผูกโซนอีก',
    'ช่วงบริการ 01/10/2026–30/09/2027 · งวด 12 งวดครอบต่อเนื่อง — ช่างเข้าไซต์ได้เฉพาะวันที่บัญชีรับรองงวดที่ครอบแล้ว',
    'ยังไม่ผูกสัญญา — นัดบริการติดด่านสัญญาจนกว่าจะผูกสัญญาที่ลงนามแล้วที่แท็บ “สัญญา”',
    'ไม่ใช่งานบริการรายรอบ 1 รายการ (ค่าขนส่ง) — ไม่ส่งให้ TS',
    '1 โซนมีรอบขายของ SO-26080073-0 ที่ยังมีผล (ต่ออายุ)',
    'หลังอนุมัติ แพ็คเกจ/โซน/แพ็คต่อรอบ/ช่วงบริการล็อก — แก้ด้วยย้อนการอนุมัติแล้วออก Rev. (จำนวนรอบแก้ได้)',
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
  assert.deepEqual(serviceSetupApprovalChecklist(ctx), ['ตรวจแพ็คเกจ · โซน · แพ็คต่อรอบ · รอบ ในตารางรายการ']);
  // รอบไม่เท่ากัน
  const mixed = completeCtx();
  mixed.lines[0] = { ...mixed.lines[0], serviceRounds: 8 };
  assert.match(serviceSetupApprovalEffects(mixed)[0], /ขายไว้ 8–12 รอบ\/โซน/);
});

test('ผลของการอนุมัติงานบริการย้อนหลัง: ไม่แตะ Actual/ยอด/สถานะ · ด่านเงินเริ่มใช้ · ไม่มีคำว่า "นับ Actual"', () => {
  const order = orderOf({
    ...PERIOD, status: 'approved', approvedAt: '2026-09-17T09:00:00Z', actualAmount: 250380, totalAmount: 250380,
    serviceSetupState: 'submitted', serviceSetupSubmittedAt: STAMP,
  });
  const ctx = completeCtx({ order });
  const effects = serviceSetupApprovalEffects(ctx, { flow: 'backfill' });
  assert.equal(effects[0], 'เปิดงานบริการให้ TS: 10 โซนใน 10 ไซต์ · รวม 10 แพ็ค/รอบ · ขายไว้ 12 รอบ/โซน — ขึ้นที่ “งานเข้าใหม่ › รอตั้งรอบ” ทันที ไม่ต้องผูกโซนอีก');
  assert.equal(effects[1], 'ไม่แตะยอด Actual · ยอดใบ · เอกสารที่ออกแล้ว · สถานะใบ (อนุมัติแล้วเหมือนเดิม) — Actual ก.ย. 2026 ฿250,380.00 · ยอดรวม ฿250,380.00 · งวดชำระ 12 งวด เท่าเดิม');
  assert.equal(effects[2], 'ด่านเงินของบัญชีเริ่มใช้กับใบนี้: งวดที่ยังไม่รับรองต้องมีช่วงครอบก่อนรับรอง (ครบแล้ว 12 งวด)');
  assert.equal(effects[3], 'ยังไม่ผูกสัญญา — นัดบริการติดด่านสัญญาจนกว่าจะผูกสัญญาที่ลงนามแล้วที่แท็บ “สัญญา”');
  assert.equal(effects.at(-1), 'หลังอนุมัติล็อก — แก้ด้วยย้อนการอนุมัติใบแล้วออก Rev. (จำนวนรอบแก้ได้)');
  assert.ok(effects.every((e) => !e.includes('นับ Actual')));
  assert.deepEqual(serviceSetupApprovalChecklist(ctx, { flow: 'backfill' }), [
    'ตรวจแพ็คเกจ · โซน · แพ็คต่อรอบ · รอบ ในตารางรายการ', 'ช่วงบริการตรงกับหมายเหตุของแต่ละสาขา', 'งวดที่ยังไม่รับรองมีช่วงครอบครบ 12 งวด',
  ]);
});

test('บรรทัดยืนยันการยื่น · แถบผู้อนุมัติ · บรรทัดออก Rev.', () => {
  const ctx = completeCtx();
  assert.equal(serviceSetupSubmitLine(ctx),
    'ส่งการตั้งค่างานบริการ (10 โซนใน 10 ไซต์ · ช่วงบริการ 01/10/2026–30/09/2027) ให้ผู้อนุมัติตรวจ — ระหว่างรออนุมัติแก้ไม่ได้ ดึงกลับได้');
  assert.equal(serviceSetupSubmitLine(ctxOf({ lines: [manual(1, { serviceKind: 'not_service' })] })), null);
  assert.equal(serviceSetupStripText(ctx), 'งานบริการ: 10 โซน · 10 ไซต์ · 10 แพ็ค/รอบ · 12 รอบ/โซน · ช่วง 01/10/2026–30/09/2027 · สัญญา: ยังไม่ผูก');
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
    { label: 'รอบบริการที่ขาย', value: '8–12 รอบ/โซน', sub: '10 โซน · 10 แพ็ค/รอบ', tone: null });

  const waiting = completeCtx({ order: orderOf({ ...PERIOD, status: 'approved', serviceSetupState: 'submitted', serviceSetupSubmittedAt: STAMP }) });
  const hero = serviceSetupHeroFact(waiting, { flow: 'backfill' });
  assert.equal(hero.value, '12 รอบ/โซน');
  assert.ok(hero.sub.endsWith(' · รอตรวจ'));
});

test('ก้อน audit ก่อน/หลัง', () => {
  const snap = serviceSetupAuditSnapshot(completeCtx());
  assert.deepEqual(snap.period, { from: '2026-10-01', to: '2027-09-30' });
  assert.deepEqual(snap.lines[0], { lineId: 'SOL-1', kind: 'package', serviceFgCode: 'FG-0521-02-001-00012', rounds: 12, zones: [{ zoneId: 'Z1', packsPerRound: 1 }] });
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
    serviceFgCode: 'FG-0521-02-001-00012', rounds: 12, fgCode: null, productId: null, description: '02-001 : ระบบกระจายกลิ่น',
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

test('ตัวเลือกชนิดไม่มีค่าตั้งต้น — สองตัวเลือกตามแคตตาล็อก', () => {
  assert.deepEqual(SERVICE_KIND_OPTIONS.map((o) => [o.value, o.label]), [
    ['package', 'แพ็คเกจบริการรายรอบ'], ['not_service', 'ไม่ใช่งานบริการรายรอบ'],
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
