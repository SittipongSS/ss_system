// ── ยามของใบค่าสรรพสามิต (mig 0414 · แผนรื้อสรรพสามิต PR1 · docs/excise-qt-so-rework-plan.md หมวด 3.7 + 4) ──────────
//
// ใบเสนอราคา/ใบสั่งขายค่าสรรพสามิตเป็นแถวจริงใน `quotations`/`sales_orders` (`origin = 'excise'`) ที่ **ไม่มีดีล** แต่ผูก
// SO ลูกค้าต้นทาง (`sourceSalesOrderId`) — สองเรื่องที่ต้องไม่พลาดก่อนมีใบแรก:
//   1. ไม่นับ Actual / รออนุมัติ / FC — ตัวตัดสินระดับแถวตัดออก (แบบตัดออก: แถวที่ไม่พก origin ยังนับเหมือนเดิม)
//   2. สิทธิ์ถอยไปดีลของ SO ต้นทาง — ใบที่ไม่มีดีลเลยต้องไม่หายจากทุกจอ (และต้องไม่เปิดให้ทุกคน)
// ยามระดับ select (คำสั่งอ่านต้องพก origin) อยู่ที่ historicalMoneyGuards.test.mjs ข้อ 5b
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';
import {
  EXCISE_STATUS_NOTE, isActualOrder, isExciseOrder, isHistoricalOrder,
} from './historicalOrders.js';
import {
  canIssueSalesOrderRevision, canRevokeSalesOrderApproval, salesOrderAmountKind, splitSalesOrderAmounts,
} from './salesOrderWorkflow.js';
import { actualModeEligibility, salesOrderActualEvents, salesOrderCountedActual } from './salesOrderActualMode.js';
import { isQuotationAwaitingMyApproval, quotationApprovalContext } from './quotationWorkflow.js';
import { ORIGIN_FILTERS } from './salesOrderListFilter.js';
import { attachSourceDeals, inSalesDocScope, loadScoped, salesDocScopeDeal } from '../scopedRow.js';

const approvedOrder = (extra = {}) => ({
  id: 'SO-1', status: 'approved', actualAmount: 1000, totalAmount: 1070, approvedAt: '2026-10-28T03:00:00Z', ...extra,
});

// ── 1. ตัวตัดสิน Actual ระดับแถว ───────────────────────────────────────────────────────────
test('ใบค่าสรรพสามิตที่อนุมัติแล้วไม่นับ Actual / รออนุมัติ ทุกตัวตัดสิน', () => {
  const excise = approvedOrder({ origin: 'excise' });
  assert.equal(isExciseOrder(excise), true);
  assert.equal(isActualOrder(excise), false);
  assert.equal(salesOrderAmountKind(excise), 'excluded');
  assert.equal(salesOrderAmountKind({ ...excise, status: 'pending_approval' }), 'excluded');
  assert.equal(salesOrderCountedActual(excise), 0);
  assert.deepEqual(salesOrderActualEvents(excise, []), []);
  const split = splitSalesOrderAmounts([excise, { ...excise, id: 'SO-2', status: 'pending_approval' }]);
  assert.equal(split.actual, 0);
  assert.equal(split.actualCount, 0);
  assert.equal(split.pendingApproval, 0);
  assert.equal(split.pendingApprovalCount, 0);
  assert.equal(actualModeEligibility(excise, 3).eligible, false);
  assert.match(actualModeEligibility(excise, 3).reason, /ค่าสรรพสามิต/);
  assert.match(EXCISE_STATUS_NOTE, /ไม่นับ Actual/);
});

test('🔴 แบบตัดออก: แถวที่ไม่พก origin ยังนับ Actual (รายงานยอดขายกรอง pipeline ใน query แล้วไม่ select origin)', () => {
  const bare = approvedOrder();
  assert.equal(isActualOrder(bare), true);
  assert.equal(salesOrderAmountKind(bare), 'actual');
  assert.equal(salesOrderCountedActual(bare), 1000);
  assert.equal(salesOrderActualEvents(bare, []).length, 1);
  assert.equal(salesOrderAmountKind(approvedOrder({ origin: 'pipeline' })), 'actual');
  // ใบย้อนหลังยังตัดเหมือนเดิม
  assert.equal(isHistoricalOrder(approvedOrder({ origin: 'historical' })), true);
  assert.equal(salesOrderAmountKind(approvedOrder({ origin: 'historical' })), 'excluded');
});

test('ใบค่าสรรพสามิตย้อนอนุมัติ/ออก Rev. ไม่ได้ (CHECK สาย excise ตรึง revisionNo = 0 — ย้อนแล้วจะค้างถาวร)', () => {
  const excise = approvedOrder({ origin: 'excise' });
  assert.equal(canRevokeSalesOrderApproval(excise, { reviewer: true }), false);
  assert.equal(canRevokeSalesOrderApproval(approvedOrder(), { reviewer: true }), true);
  const revoked = { ...excise, status: 'approval_revoked' };
  assert.equal(canIssueSalesOrderRevision(revoked, { reviewer: true }), false);
  assert.equal(canIssueSalesOrderRevision({ ...approvedOrder(), status: 'approval_revoked' }, { reviewer: true }), true);
});

test('ชิปที่มา "ใบจากใบเสนอราคา" ไม่รวมใบค่าสรรพสามิต (กองเดียวกับการ์ด Actual)', () => {
  const pipeline = Object.values(ORIGIN_FILTERS).find((f) => f.label === 'ใบจากใบเสนอราคา');
  assert.ok(pipeline);
  assert.equal(pipeline.match(approvedOrder({ origin: 'excise' })), false);
  assert.equal(pipeline.match(approvedOrder({ origin: 'pipeline' })), true);
  assert.equal(pipeline.match(approvedOrder()), true);
});

// ── 2. ขอบเขตของใบไม่มีดีล ─────────────────────────────────────────────────────────────────
const aeOdm = { id: 'U-1', role: 'ae', team: 'ODM', teams: ['ODM'] };
const dealOdm = { id: 'D-1', team: 'ODM', ownerId: 'U-1', ownerName: 'AE ODM', stage: 'won' };
const dealOther = { id: 'D-2', team: 'Services', ownerId: 'U-9', ownerName: 'คนอื่น', stage: 'won' };

test('inSalesDocScope: ดีลของใบก่อน · ไม่มีดีลถอยไปดีลของ SO ต้นทาง · ไม่มีทั้งคู่ = ปฏิเสธแม้ role เห็นทุกทีม', () => {
  assert.equal(inSalesDocScope(aeOdm, { deal: dealOdm }, 'view'), true);
  assert.equal(inSalesDocScope(aeOdm, { deal: dealOther }, 'view'), false);
  assert.equal(inSalesDocScope(aeOdm, { deal: null, sourceDeal: dealOdm }, 'edit'), true);
  assert.equal(inSalesDocScope(aeOdm, { deal: null, sourceDeal: dealOther }, 'edit'), false);
  // ดีลของใบชนะเสมอ — ใบ pipeline ไม่ถูกตัดสินด้วยดีลอื่น
  assert.equal(salesDocScopeDeal({ deal: dealOther, sourceDeal: dealOdm }), dealOther);
  // 🐞 `inSalesViewScope(user, null)` ตอบ true ให้ role ขอบเขต 'all' — ตัวกลางต้องไม่พาใบกำพร้าไปถึงตรงนั้น
  assert.equal(inSalesDocScope({ id: 'U-0', role: 'admin' }, { deal: null }, 'view'), false);
});

/* supabase ปลอมของ loadSourceDeals — `.from('sales_orders').select().in().order().range()` · จดคำสั่งไว้ตรวจ */
function sourceDb(rows) {
  const calls = [];
  return {
    calls,
    from(table) {
      const q = { table, filters: [] };
      calls.push(q);
      const b = {
        select(cols) { q.select = cols; return b; },
        in(col, ids) { q.filters.push([col, ids]); return b; },
        order() { return b; },
        range: async () => ({ data: rows.filter((r) => (q.filters[0]?.[1] || []).includes(r.id)), error: null }),
      };
      return b;
    },
  };
}

test('attachSourceDeals เติม `sourceDeal` ไม่แตะ `deal` · แถวที่มีดีลแล้วไม่ยิงคำขอ · อ่านเฉพาะช่องขอบเขต', async () => {
  const db = sourceDb([{ id: 'SO-SRC', deal: dealOdm }]);
  const excise = { id: 'QT-X', origin: 'excise', deal: null, sourceSalesOrderId: 'SO-SRC' };
  const pipeline = { id: 'QT-P', deal: dealOther, sourceSalesOrderId: null };
  const { error } = await attachSourceDeals(db, [excise, pipeline]);
  assert.equal(error, null);
  assert.equal(excise.deal, null, '⛔ ดีลต้นทางห้ามลง row.deal (quotationCancelRepo ส่ง quote.deal เข้าตัวคิด FC)');
  assert.equal(excise.sourceDeal, dealOdm);
  assert.equal('sourceDeal' in pipeline, false);
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].table, 'sales_orders');
  assert.doesNotMatch(db.calls[0].select, /\*/, 'ดีลเอาเฉพาะช่องขอบเขต/ป้าย ไม่ลาก metadata ทั้งก้อน');
  assert.match(db.calls[0].select, /team/);
  assert.match(db.calls[0].select, /ownerId/);

  const none = sourceDb([]);
  assert.deepEqual(await attachSourceDeals(none, [pipeline]), { error: null });
  assert.equal(none.calls.length, 0, 'ไม่มีใบไม่มีดีล = ไม่ยิงคำขอเพิ่ม (ทะเบียนทั้งหน้า)');
});

test('loadScoped ใบสั่งขายค่าสรรพสามิต: ผ่านด่านด้วยดีลของ SO ต้นทาง · ต้นทางอยู่นอกขอบเขต = 403', async () => {
  const exciseRow = { id: 'SO-X', origin: 'excise', deal: null, sourceSalesOrderId: 'SO-SRC' };
  const makeDb = (sourceDeal) => ({
    from(table) {
      const b = {
        select() { return b; },
        eq() { return b; },
        in() { return b; },
        order() { return b; },
        maybeSingle: async () => ({ data: { ...exciseRow }, error: null }),
        range: async () => ({ data: table === 'sales_orders' ? [{ id: 'SO-SRC', deal: sourceDeal }] : [], error: null }),
      };
      return b;
    },
  });
  const ok = await loadScoped(makeDb(dealOdm), 'sales_orders', 'SO-X', aeOdm, 'view');
  assert.equal(ok.response, undefined);
  assert.equal(ok.row.deal, null);
  assert.equal(ok.row.sourceDeal.id, 'D-1');
  const denied = await loadScoped(makeDb(dealOther), 'sales_orders', 'SO-X', aeOdm, 'view');
  assert.equal(denied.response.status, 403);
});

// ── 3. "รอฉันอนุมัติ" ของใบไม่มีดีล ───────────────────────────────────────────────────────────
test('ใบเสนอราคาค่าสรรพสามิตขึ้น "รอฉันอนุมัติ" ให้เจ้าของดีลของ SO ต้นทาง แม้ดีลนั้น Won แล้ว', () => {
  const quote = {
    origin: 'excise', status: 'sent', approvalStatus: 'pending', deal: null, sourceDeal: { ownerId: 'U-1', stage: 'won' },
  };
  const ctx = quotationApprovalContext(quote, 'U-1');
  assert.deepEqual(ctx, { userId: 'U-1', dealOwnerId: 'U-1', dealClosed: false });
  assert.equal(isQuotationAwaitingMyApproval(quote, ctx), true);
  assert.equal(isQuotationAwaitingMyApproval(quote, quotationApprovalContext(quote, 'U-9')), false);
  // ใบ pipeline ของดีลที่ปิดแล้วยังไม่นับเหมือนเดิม
  const closed = { status: 'sent', approvalStatus: 'pending', deal: { ownerId: 'U-1', stage: 'won' } };
  assert.equal(quotationApprovalContext(closed, 'U-1').dealClosed, true);
  assert.equal(isQuotationAwaitingMyApproval(closed, quotationApprovalContext(closed, 'U-1')), false);
});

// ── 4. ratchet: route ของใบเสนอราคา/ใบสั่งขายตัดสินขอบเขตผ่าน inSalesDocScope เท่านั้น ───────────────────
const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function jsFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsFiles(full));
    else if (entry.name.endsWith('.js') && !entry.name.includes('.test.')) out.push(relative(SRC, full).split(sep).join('/'));
  }
  return out;
}
/* ไฟล์ที่ตัดสินสิทธิ์ใบเสนอราคา/ใบสั่งขายรายแถว — route ของสองตาราง + ตัวช่วยที่ทะเบียน/งวดเรียก */
const DOC_SCOPE_FILES = [
  ...jsFiles(join(SRC, 'app/api/sales-planning/quotations')),
  ...jsFiles(join(SRC, 'app/api/sales-planning/sales-orders')),
  'lib/sales/installmentScheduleServer.js',
];

test('🪤 route ของใบเสนอราคา/ใบสั่งขายไม่เรียก inSales*Scope(user, <ใบ>.deal) ตรง ๆ — ใบค่าสรรพสามิตจะไม่มีใครเห็น', () => {
  const offenders = [];
  for (const rel of DOC_SCOPE_FILES) {
    const text = stripComments(readFileSync(join(SRC, rel), 'utf8'));
    text.split('\n').forEach((line, i) => {
      if (/\binSales(View|Edit)Scope\(\s*\w+\s*,\s*[\w$]+(\?)?\.deal\s*\)/.test(line)) offenders.push(`${rel}:${i + 1}`);
    });
  }
  assert.deepEqual(offenders, [],
    'ใช้ inSalesDocScope(user, row, mode) จาก lib/scopedRow.js (ถอยไปดีลของ SO ต้นทางให้ใบไม่มีดีล)\n' + offenders.join('\n'));
  assert.ok(DOC_SCOPE_FILES.length > 20, 'รายชื่อไฟล์ต้องครอบ route ทั้งสองตาราง');
});

test('ตัวโหลดหลักของสองตารางเติมดีลของ SO ต้นทาง (ทะเบียน · รายใบ · งวด · ป้ายเมนู · ไฟล์แนบ · หลักฐาน)', () => {
  const must = {
    'app/api/sales-planning/quotations/route.js': /attachSourceDeals\(supabase, data\)/,
    'app/api/sales-planning/quotations/[id]/route.js': /attachSourceDeals\(supabase, data \? \[data\] : \[\]\)/,
    'app/api/sales-planning/sales-orders/route.js': /sourceDeal: dealById\.get\(sourceDealIdOf\(row\)\)/,
    'app/api/sales-planning/sales-orders/[id]/route.js': /loadSourceDeals\(supabase, \[order\.sourceSalesOrderId\]\)/,
    'app/api/sales-planning/sales-orders/[id]/installments/route.js': /attachSourceDeals\(supabase, \[scoped\]\)/,
    'app/api/nav/counts/route.js': /quotationApprovalContext\(row, user\.id\)/,
    'lib/sales/salesOrderAttachmentAccess.js': /loadSourceDeals\(supabase, \[order\.sourceSalesOrderId\]\)/,
    'lib/upload/privateEvidence.js': /loadSourceDeals\(supabase, \[row\.sourceSalesOrderId\]\)/,
    'lib/sales/installmentScheduleServer.js': /loadSourceDeals\(/,
    'app/api/finance/payments/route.js': /sourceDealBySource\.get\(order\.sourceSalesOrderId\)/,
  };
  for (const [rel, re] of Object.entries(must)) {
    assert.match(stripComments(readFileSync(join(SRC, rel), 'utf8')), re, rel);
  }
});
