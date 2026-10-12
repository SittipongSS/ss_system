// ── ตัวเทียบของสคริปต์ check-line-pack-parity (อ่านอย่างเดียว · mig 0407 · docs/qt-pack-column.md) ──────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  PACKED_COVERAGE, PARITY_COVERAGE, QUOTATION_AUDIT_ACTIONS, QUOTATION_AUDIT_SELECT, QUOTATION_LINE_MONEY_SELECT,
  SALES_ORDER_LINE_MONEY_SELECT, checkRuleDiffs, fingerprintDiffs, headerTotalDiffs, lineMoneyDiffs, loadQuotationAuditSince,
  loadQuotationLineMoney, loadSalesOrderLineMoney, packCopyDiffs, packLossInAudit, packedCoverageGaps, packedLineCount, parityCoverageGaps,
  parseParityArgs, revisionPackLoss, sentWithoutPack,
} from './linePackParity.js';
import { quotationApprovalFingerprint } from './quotationApprovalFingerprint.js';
import { salesOrderApprovalFingerprint } from './salesOrderApprovalFingerprint.js';

const SOURCE = readFileSync(new URL('./linePackParity.js', import.meta.url), 'utf8');
const SCRIPT = readFileSync(new URL('../../../scripts/check-line-pack-parity.mjs', import.meta.url), 'utf8');
const row = (over = {}) => ({ id: 'L1', packQty: null, qty: 12, unitPrice: 3500, discountType: null, discountValue: 0, discountAmount: 0, lineTotal: 42000, ...over });

test('ตัวอ่าน: เอ่ยชื่อคอลัมน์ packQty ของสองตารางบรรทัด (ด่าน check:columns แดงจนกว่าจะรัน 0407) · ไล่หน้าครบ · เรียงนิ่ง', async () => {
  for (const select of [QUOTATION_LINE_MONEY_SELECT, SALES_ORDER_LINE_MONEY_SELECT]) {
    for (const column of ['id', '"packQty"', 'qty', '"unitPrice"', '"discountType"', '"discountValue"', '"discountAmount"', '"lineTotal"']) {
      assert.ok(select.split(', ').includes(column), `${column} ใน ${select}`);
    }
  }
  assert.ok(QUOTATION_LINE_MONEY_SELECT.includes('"quotationId"'));
  assert.ok(SALES_ORDER_LINE_MONEY_SELECT.includes('"salesOrderId"') && SALES_ORDER_LINE_MONEY_SELECT.includes('"quotationLineId"'));
  // ฐานปลอม: 2,300 แถว (เกินเพดาน 1,000 แถวต่อคำขอ) — ต้องได้ครบทุกแถวด้วย .range() ทีละหน้า
  const seen = [];
  const fake = (rows) => ({
    from: (table) => ({
      select: (columns) => ({
        order: (column, options) => ({
          range: async (from, to) => {
            seen.push({ table, columns, column, ascending: options?.ascending, from, to });
            return { data: rows.slice(from, to + 1), error: null };
          },
        }),
      }),
    }),
  });
  const many = Array.from({ length: 2300 }, (_, i) => ({ id: `L${i}` }));
  const quotation = await loadQuotationLineMoney(fake(many));
  assert.equal(quotation.error, null);
  assert.equal(quotation.data.length, 2300);
  const order = await loadSalesOrderLineMoney(fake(many.slice(0, 3)));
  assert.equal(order.data.length, 3);
  assert.deepEqual(seen.map((c) => [c.table, c.from, c.to]), [
    ['quotation_lines', 0, 999], ['quotation_lines', 1000, 1999], ['quotation_lines', 2000, 2999], ['sales_order_lines', 0, 999],
  ]);
  assert.ok(seen.every((c) => c.column === 'id' && c.ascending === true));
  assert.equal(seen[0].columns, QUOTATION_LINE_MONEY_SELECT);
  assert.equal(seen[3].columns, SALES_ORDER_LINE_MONEY_SELECT);
});

test('ตัวอ่าน: supabase ไม่ throw — error ของฐาน (เช่นยังไม่มีคอลัมน์) กลับมาในช่อง error ไม่ใช่แถวว่าง', async () => {
  const missing = { code: '42703', message: 'column quotation_lines.packQty does not exist' };
  const fake = { from: () => ({ select: () => ({ order: () => ({ range: async () => ({ data: null, error: missing }) }) }) }) };
  assert.deepEqual(await loadQuotationLineMoney(fake), { data: null, error: missing });
  assert.deepEqual(await loadSalesOrderLineMoney(fake), { data: null, error: missing });
});

test('🔴 ไฟล์นี้กับสคริปต์อ่านอย่างเดียว — ไม่มีคำสั่งเขียนฐานสักคำ และไม่มีไฟล์ของแอป import ตัวเทียบ', () => {
  for (const [name, text] of [['linePackParity.js', SOURCE], ['check-line-pack-parity.mjs', SCRIPT]]) {
    assert.doesNotMatch(text, /\.(insert|update|upsert|delete|rpc)\s*\(/, `${name} ต้องไม่มีคำสั่งเขียน/เรียก RPC`);
  }
  // ชื่อตารางเป็นค่าตรง ๆ ในคำสั่งเดียวกับ .select() และห่อ fetchAllResult (ด่าน check:columns · check:rowcap)
  assert.match(SOURCE, /fetchAllResult\(\(\) => supabase\.from\('quotation_lines'\)\.select\(QUOTATION_LINE_MONEY_SELECT\)\.order\('id'/);
  assert.match(SOURCE, /fetchAllResult\(\(\) => supabase\.from\('sales_order_lines'\)\.select\(SALES_ORDER_LINE_MONEY_SELECT\)\.order\('id'/);
  // ไม่มีไฟล์โค้ดของแอปเอ่ยชื่อโมดูลนี้ — ผู้ใช้คือสคริปต์กับเทสต์เท่านั้น (ถ้าแอป import เข้าไป คำขอของแอปจะเอ่ยชื่อคอลัมน์ก่อนมีคอลัมน์ได้)
  const root = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/+$/, '');
  const importers = [];
  let scanned = 0;
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const path = `${dir}/${entry}`;
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (!/\.(js|jsx|mjs)$/.test(entry) || /\.test\./.test(entry) || path.endsWith('/lib/sales/linePackParity.js')) continue;
      scanned += 1;
      if (/linePackParity/.test(readFileSync(path, 'utf8'))) importers.push(path.slice(root.length + 1));
    }
  })(root);
  assert.ok(scanned > 500, `อ่านได้แค่ ${scanned} ไฟล์ — ตัวเดินโฟลเดอร์น่าจะพัง`);
  assert.deepEqual(importers, []);
  assert.match(SCRIPT, /from '\.\.\/src\/lib\/sales\/linePackParity\.js'/);
});

test('lineMoneyDiffs: บรรทัดที่สูตร JS ให้ยอดไม่ตรงกับที่เก็บ — ลืมตัวคูณแพ็ค · คูณทั้งที่ไม่มีเลขแพ็ค · ส่วนลดไม่ตรง', () => {
  const rows = [
    row({ id: 'ok-null' }),
    row({ id: 'ok-pack', packQty: 2, lineTotal: 84000 }),
    row({ id: 'ok-string', qty: '12', unitPrice: '3500', lineTotal: '42000.00' }),
    row({ id: 'ok-discount', packQty: 2, discountType: 'amount', discountValue: 14400, discountAmount: 14400, lineTotal: 69600 }),
    row({ id: 'forgot', packQty: 2, lineTotal: 42000 }),
    row({ id: 'multiplied', packQty: null, lineTotal: 84000 }),
    row({ id: 'discount', discountType: 'percent', discountValue: 10, discountAmount: 0, lineTotal: 42000 }),
  ];
  const diffs = lineMoneyDiffs(rows);
  assert.deepEqual(diffs.map((d) => [d.id, d.field]), [
    ['forgot', 'lineTotal'], ['multiplied', 'lineTotal'], ['discount', 'lineTotal'], ['discount', 'discountAmount'],
  ]);
  assert.deepEqual(diffs[0], { id: 'forgot', field: 'lineTotal', stored: 42000, computed: 84000 });
  assert.deepEqual(lineMoneyDiffs([]), []);
  assert.deepEqual(lineMoneyDiffs(null), []);
});

test('checkRuleDiffs: นิพจน์ของ CHECK แบบทศนิยมแท้ — ปฏิเสธเกิน 0.01 · ผ่านด้วยค่าคลาด · ครึ่งสตางค์ปัดออกจากศูนย์ · ค่าที่อ่านไม่ได้แยกกอง', () => {
  const result = checkRuleDiffs([
    row({ id: 'exact' }),
    row({ id: 'exact-pack', packQty: 2, lineTotal: 84000 }),
    row({ id: 'forgot', packQty: 2, lineTotal: 42000 }),
    row({ id: 'multiplied', lineTotal: 84000 }),
    row({ id: 'half-satang', packQty: 3, qty: 1.5, unitPrice: 33.33, lineTotal: 149.98 }), // ฐาน 149.99 · JS 149.98
    row({ id: 'half-satang-db', packQty: 3, qty: 1.5, unitPrice: 33.33, lineTotal: 149.99 }),
    row({ id: 'one-off', qty: 3, unitPrice: 33.33, lineTotal: 100 }), // 99.99 → ต่าง 0.01 พอดี = ผ่าน
    row({ id: 'two-off', qty: 3, unitPrice: 33.33, lineTotal: 100.01 }),
    row({ id: 'raw-float', qty: 1.5, unitPrice: 33.33, lineTotal: 49.995 }), // ผลคูณดิบที่ตัวตั้งต้นจากโครงการเคยเก็บ
    row({ id: 'discount-null', discountAmount: null }),
    row({ id: 'strings', qty: '12', unitPrice: '3500.00', discountAmount: '0', lineTotal: '42000.00' }),
    row({ id: 'tiny', qty: 1, unitPrice: 1e-7, lineTotal: 0 }),
    row({ id: 'bad-pack', packQty: 1.5 }),
    row({ id: 'bad-total', lineTotal: null }),
    row({ id: 'bad-qty', qty: 'abc' }),
  ]);
  assert.deepEqual(result.refused.map((r) => r.id), ['forgot', 'multiplied', 'two-off']);
  assert.deepEqual(result.inexact.map((r) => r.id), ['half-satang', 'one-off', 'raw-float']);
  assert.deepEqual(result.unreadable.map((r) => r.id), ['bad-pack', 'bad-total', 'bad-qty']);
  assert.deepEqual(result.refused[0], { id: 'forgot', expected: 84000, stored: 42000 });
  assert.equal(result.inexact[0].expected, 149.99, 'ฐานปัดครึ่งสตางค์ขึ้น (149.985 → 149.99)');
  assert.deepEqual(checkRuleDiffs(null), { refused: [], inexact: [], unreadable: [] });
});

test('checkRuleDiffs: ส่วนลดที่เก็บถูกลบออกตามที่เก็บ (ฐานไม่คิดส่วนลดใหม่) · ยอดติดลบไม่เกิดจากการปัด', () => {
  const { refused, inexact } = checkRuleDiffs([
    row({ id: 'a', packQty: 2, discountAmount: 14400, lineTotal: 69600 }),
    row({ id: 'b', packQty: 2, discountAmount: 14400, lineTotal: 84000 }), // ส่วนลดไม่ถูกหัก
    row({ id: 'c', packQty: 2, discountAmount: 14400.005, lineTotal: 69600 }), // ต่าง 0.005 = ผ่านด้วยค่าคลาด
    row({ id: 'd', qty: 1, unitPrice: 100, discountAmount: 100, lineTotal: 0 }),
  ]);
  assert.deepEqual(refused.map((r) => r.id), ['b']);
  assert.deepEqual(inexact.map((r) => r.id), ['c']);
});

test('packCopyDiffs ⭐ จุดบอดของ CHECK: บรรทัดใบสั่งขายที่เลขแพ็ค 1 หายระหว่างทางก๊อป (ยอดเท่าเดิม) ถูกรายงาน', () => {
  const quotationLines = [
    { id: 'Q1', packQty: 1 }, { id: 'Q2', packQty: 2 }, { id: 'Q3', packQty: null }, { id: 'Q4' }, { id: 'Q5', packQty: 43 },
  ];
  const orderLines = [
    { id: 'S1', quotationLineId: 'Q1', packQty: null }, // เลขแพ็ค 1 หาย — CHECK ผ่าน เพราะยอดไม่เปลี่ยน
    { id: 'S2', quotationLineId: 'Q2', packQty: 2 },
    { id: 'S3', quotationLineId: 'Q3' }, // ไม่มีคีย์ = null เหมือนกัน
    { id: 'S4', quotationLineId: 'Q4', packQty: null },
    { id: 'S5', quotationLineId: 'Q5', packQty: 4 }, // เลขเพี้ยน
    { id: 'S6', quotationLineId: 'Q3', packQty: 1 }, // งอกขึ้นมาเอง
    { id: 'S7', quotationLineId: null, packQty: 9 }, // ใบย้อนหลัง — ไม่มีบรรทัดต้นทาง ไม่เทียบ
    { id: 'S8', quotationLineId: 'Q-หาย', packQty: 9 }, // บรรทัดต้นทางหาไม่เจอ ไม่เทียบ
    { id: 'S2-rev', quotationLineId: 'Q2', packQty: 2 }, // ฉบับ Rev. ของใบสั่งขายชี้บรรทัดต้นทางเดิม
  ];
  assert.deepEqual(packCopyDiffs(orderLines, quotationLines), [
    { id: 'S1', quotationLineId: 'Q1', salesOrderPack: null, quotationPack: 1 },
    { id: 'S5', quotationLineId: 'Q5', salesOrderPack: 4, quotationPack: 43 },
    { id: 'S6', quotationLineId: 'Q3', salesOrderPack: 1, quotationPack: null },
  ]);
  assert.deepEqual(packCopyDiffs([], quotationLines), []);
  assert.deepEqual(packCopyDiffs(null, null), []);
});

test('ลืมตัวคูณแพ็ค: ตัวเทียบทั้งสองฝั่ง (สูตร JS · กฎของฐาน) รายงานแถวเดียวกัน', () => {
  const rows = [row({ id: 'ok', packQty: 2, lineTotal: 84000 }), row({ id: 'forgot', packQty: 2, lineTotal: 42000 }), row({ id: 'forgot-43', packQty: 43, qty: 4, unitPrice: 2900, lineTotal: 11600 })];
  assert.deepEqual(lineMoneyDiffs(rows).map((d) => d.id), ['forgot', 'forgot-43']);
  assert.deepEqual(checkRuleDiffs(rows).refused.map((d) => d.id), ['forgot', 'forgot-43']);
});

test('headerTotalDiffs: ยอดหัวใบเทียบกับ quoteTotals ของบรรทัดที่เก็บ (ส่วนลดท้ายใบ + VAT) — บรรทัดที่มีเลขแพ็คเข้ายอดรวมแบบคูณแล้ว', () => {
  const lines = [row({ packQty: 2, lineTotal: 84000 }), row({ id: 'L2', qty: 1, unitPrice: 1000, lineTotal: 1000 })];
  const good = { id: 'QT-1', quoteNumber: 'QT-26100001-0', discountType: 'amount', discountValue: 5000, vatRate: 7, subtotal: 85000, vatAmount: 5600, totalAmount: 85600, lines };
  assert.deepEqual(headerTotalDiffs([good]), []);
  // หัวใบที่คิดแบบลืมตัวคูณ (12 × 3,500 + 1,000)
  const stale = { ...good, id: 'QT-2', quoteNumber: 'QT-26100002-0', subtotal: 43000, vatAmount: 2660, totalAmount: 40660 };
  assert.deepEqual(headerTotalDiffs([good, stale]), [{ id: 'QT-2', number: 'QT-26100002-0', fields: ['subtotal', 'vatAmount', 'totalAmount'] }]);
  assert.deepEqual(headerTotalDiffs([{ id: 'QT-3', subtotal: 0, vatAmount: 0, totalAmount: 0, lines: [] }]), []);
  assert.deepEqual(headerTotalDiffs(null), []);
});

test('fingerprintDiffs: นับเฉพาะใบที่มีลายนิ้วมือเก็บไว้ · ใบที่เนื้อหาถูกแตะหลังอนุมัติถูกรายงาน · คีย์ packQty: null ไม่ทำให้ต่าง', () => {
  const base = {
    quoteDate: '2026-10-08', subtotal: 42000, vatRate: 7, vatAmount: 2940, totalAmount: 44940,
    lines: [{ id: 'L1', sortOrder: 0, productId: 'P1', fgCode: 'FG-278-02-001-0757', description: 'SDS', qty: 12, unitPrice: 3500, discountAmount: 0, lineTotal: 42000 }],
  };
  const stored = quotationApprovalFingerprint(base);
  const quotes = [
    { ...base, id: 'A', quoteNumber: 'QT-A', approvalStatus: 'approved', status: 'sent', approvalFingerprint: stored },
    // หลังรัน 0407: select * คืน packQty: null บนทุกบรรทัด — ลายนิ้วมือต้องยังตรง
    { ...base, id: 'B', quoteNumber: 'QT-B', approvalStatus: 'approved', status: 'accepted', approvalFingerprint: stored, lines: base.lines.map((l) => ({ ...l, packQty: null })) },
    // บรรทัดถูกแตะหลังอนุมัติ (ได้เลขแพ็คมา) — ต้องถูกรายงาน
    { ...base, id: 'C', quoteNumber: 'QT-C', approvalStatus: 'approved', status: 'sent', approvalFingerprint: stored, lines: base.lines.map((l) => ({ ...l, packQty: 1 })) },
    { ...base, id: 'D', quoteNumber: 'QT-D', approvalStatus: 'not_submitted', status: 'draft', approvalFingerprint: null },
  ];
  assert.deepEqual(fingerprintDiffs(quotes, quotationApprovalFingerprint), {
    checked: 3, diffs: [{ id: 'C', number: 'QT-C', approvalStatus: 'approved', status: 'sent' }],
  });
  const order = { id: 'SO-1', orderNumber: 'SO-26100001-0', status: 'approved', subtotal: 42000, totalAmount: 44940, lines: base.lines };
  const orderStored = salesOrderApprovalFingerprint(order);
  assert.deepEqual(fingerprintDiffs([{ ...order, approvalFingerprint: orderStored }], salesOrderApprovalFingerprint), { checked: 1, diffs: [] });
  assert.deepEqual(
    fingerprintDiffs([{ ...order, approvalFingerprint: orderStored, totalAmount: 1 }], salesOrderApprovalFingerprint).diffs,
    [{ id: 'SO-1', number: 'SO-26100001-0', approvalStatus: null, status: 'approved' }],
  );
  assert.deepEqual(fingerprintDiffs(null, quotationApprovalFingerprint), { checked: 0, diffs: [] });
});

/* ═══ ด่านความครบ: "ไม่มีจุดต่าง" ต้องมาจากการเทียบจริง (รีวิว 08/10 js-03) ═══════════════════════════════════════════
   🐞 เดิมสคริปต์นับแต่จุดต่าง ⇒ อ่านได้ 0 แถว = "ต่าง 0 จาก 0" ทุกหัวข้อ แล้ว exit 0 — ขั้นพิสูจน์ของงานเงินผ่านโดยไม่ได้เทียบอะไร */

const FULL = { quotationLines: 1202, salesOrderLines: 445, quotations: 585, salesOrders: 250, linkedOrderLines: 440, quotationFingerprints: 559, salesOrderFingerprints: 244 };

test('🔴 parityCoverageGaps: หัวข้อไหนเทียบ 0 รายการ = ช่องโหว่เสมอ (ขั้นต่ำตั้งต้น 1 ทุกหัวข้อ) · ขั้นต่ำที่ผู้รันกำหนดกัน "อ่านได้ไม่ครบ"', () => {
  assert.deepEqual(PARITY_COVERAGE.map(([key]) => key), Object.keys(FULL));
  assert.deepEqual(parityCoverageGaps(FULL), []);
  // ไม่ได้อ่านอะไรเลย: ทุกหัวข้อถูกรายงาน ตามลำดับ พร้อมป้ายไทย
  const none = parityCoverageGaps({ quotationLines: 0, salesOrderLines: 0, quotations: 0, salesOrders: 0, linkedOrderLines: 0, quotationFingerprints: 0, salesOrderFingerprints: 0 });
  assert.deepEqual(none.map((g) => [g.key, g.got, g.min]), Object.keys(FULL).map((key) => [key, 0, 1]));
  assert.ok(none.every((g) => typeof g.label === 'string' && g.label.length > 5));
  // ขาดทีละหัวข้อ — แต่ละตัวถูกจับเดี่ยว ๆ (รวม "ไม่มีใบไหนมีลายนิ้วมือ" และ "ไม่มีบรรทัดใบสั่งขายที่ผูกบรรทัดใบเสนอราคา")
  for (const key of Object.keys(FULL)) {
    assert.deepEqual(parityCoverageGaps({ ...FULL, [key]: 0 }).map((g) => g.key), [key], key);
  }
  // ค่าที่ไม่ใช่จำนวนเต็ม ≥ 0 / ไม่มีคีย์ / ไม่ส่งอะไรมา = นับเป็น 0 — ไม่มีทาง "ผ่านเพราะอ่านค่าไม่ออก"
  for (const bad of [undefined, null, NaN, -1, 1.5, '12', true]) {
    assert.deepEqual(parityCoverageGaps({ ...FULL, quotationLines: bad }).map((g) => g.key), ['quotationLines'], String(bad));
  }
  assert.equal(parityCoverageGaps().length, 7);
  assert.equal(parityCoverageGaps(null, null).length, 7);
  // ขั้นต่ำที่ผู้รันกำหนด: ต่ำกว่า = ช่องโหว่ · เท่ากัน = ผ่าน · ขั้นต่ำ 0 หรือค่าที่ใช้ไม่ได้ ไม่ได้ปิดด่าน (ยังเป็น 1)
  assert.deepEqual(parityCoverageGaps(FULL, { quotationLines: 1202, salesOrderLines: 445, quotationFingerprints: 559, salesOrderFingerprints: 244 }), []);
  assert.deepEqual(parityCoverageGaps(FULL, { quotationLines: 1203 }).map((g) => [g.key, g.got, g.min]), [['quotationLines', 1202, 1203]]);
  assert.deepEqual(parityCoverageGaps(FULL, { salesOrderFingerprints: 245 }).map((g) => g.key), ['salesOrderFingerprints']);
  for (const off of [0, -5, null, 'x', 0.5]) {
    assert.deepEqual(parityCoverageGaps({ ...FULL, quotations: 0 }, { quotations: off }).map((g) => [g.key, g.min]), [['quotations', 1]], String(off));
  }
});

test('parseParityArgs: รู้จักสามตัวเลือก — ที่เหลือและรูปที่ผิดถูกรายงาน ไม่เดาแทน', () => {
  /* ⭐ ย้ายโดยเจตนา (รีวิวเงิน 09/10 · งวด PR-3 ประตูทางเดียว): ผลของตัวอ่านตัวเลือกมีสองช่องเวลาเพิ่ม (packLaunch · auditSince — null เมื่อไม่ใส่)
     ช่องเดิมสามช่องและค่าของมันเท่าเดิมทุกกรณี */
  assert.deepEqual(parseParityArgs([]), { beforeMigration: false, floors: {}, problems: [], packLaunch: null, auditSince: null });
  assert.deepEqual(parseParityArgs(), { beforeMigration: false, floors: {}, problems: [], packLaunch: null, auditSince: null });
  assert.deepEqual(parseParityArgs(['--before-migration', '--expect-min-lines=1202,445', '--expect-min-fingerprints=559,244']), {
    beforeMigration: true,
    floors: { quotationLines: 1202, salesOrderLines: 445, quotationFingerprints: 559, salesOrderFingerprints: 244 },
    problems: [],
    packLaunch: null,
    auditSince: null,
  });
  for (const bad of ['--expect-min-lines', '--expect-min-lines=', '--expect-min-lines=12', '--expect-min-lines=1,2,3', '--expect-min-lines=a,b',
    '--expect-min-lines=-1,2', '--expect-min-lines=1.5,2', '--expect-min-fingerprints=1, 2', '--expect-min-lines=1,']) {
    const parsed = parseParityArgs([bad]);
    assert.equal(parsed.problems.length, 1, bad);
    assert.deepEqual(parsed.floors, {}, bad);
  }
  assert.deepEqual(parseParityArgs(['--force', 'x']).problems.length, 2);
});

/* ═══ ประตูทางเดียว (งวด PR-3 · มติเจ้าของ 08/10 · แผน IMPL_PLAN_PR3 §10 + §12 C2): จำนวนบรรทัดที่มีเลขแพ็คต้องไม่ลดลง ═══════════════
   เลขแพ็คที่หายพร้อมยอดที่หดตาม (รุ่นก่อนงวด PR-1 บันทึกทับ · ลบด้วยมือ) เป็นแถวที่ถูกต้องในทุกหัวข้อของสคริปต์ — จำนวนนี้คือสิ่งเดียวที่มองเห็น */

test('--expect-min-packed: ตัวอ่านตัวเลือกเก็บขั้นต่ำสองคีย์ของตัวเอง (ไม่ปนกับด่านความครบ) · รูปที่ผิดถูกรายงานเหมือนตัวเลือกอื่น', () => {
  assert.deepEqual(parseParityArgs(['--expect-min-packed=3,2']), { beforeMigration: false, floors: { packedQuotationLines: 3, packedSalesOrderLines: 2 }, problems: [], packLaunch: null, auditSince: null });
  assert.deepEqual(parseParityArgs(['--expect-min-packed=0,0']).floors, { packedQuotationLines: 0, packedSalesOrderLines: 0 }, '0,0 = วันที่ยังไม่มีใบไหนมีเลขแพ็ค');
  assert.deepEqual(parseParityArgs(['--expect-min-lines=1202,445', '--expect-min-fingerprints=559,244', '--expect-min-packed=7,4']).floors, {
    quotationLines: 1202, salesOrderLines: 445, quotationFingerprints: 559, salesOrderFingerprints: 244, packedQuotationLines: 7, packedSalesOrderLines: 4,
  });
  for (const bad of ['--expect-min-packed', '--expect-min-packed=', '--expect-min-packed=3', '--expect-min-packed=a,b', '--expect-min-packed=-1,0', '--expect-min-packed=1,2,3']) {
    const parsed = parseParityArgs([bad]);
    assert.equal(parsed.problems.length, 1, bad);
    assert.deepEqual(parsed.floors, {}, bad);
  }
  // ขั้นต่ำของเลขแพ็คไม่ไปเปิด/ปิดด่านความครบ และกลับกัน
  assert.deepEqual(parityCoverageGaps(FULL, { packedQuotationLines: 999999 }), []);
  assert.deepEqual(PACKED_COVERAGE.map(([key]) => key), ['packedQuotationLines', 'packedSalesOrderLines']);
  for (const [key] of PACKED_COVERAGE) assert.ok(!PARITY_COVERAGE.some(([coverageKey]) => coverageKey === key));
});

test('packedLineCount / packedCoverageGaps 🔴 น้อยกว่ารอบก่อน = ช่องโหว่ · เท่ากัน/มากกว่า = ผ่าน · ไม่กำหนด = ไม่ตรวจ (0 เป็นค่าที่ถูกต้องได้ — ต่างจากด่านความครบ)', () => {
  assert.equal(packedLineCount([row(), row({ packQty: 1 }), row({ packQty: 2 }), row({ packQty: undefined }), { id: 'x' }, row({ packQty: 43 })]), 3, 'เลขแพ็ค 1 นับ (จุดบอดของ CHECK)');
  assert.equal(packedLineCount([]), 0);
  assert.equal(packedLineCount(null), 0);
  const counts = { packedQuotationLines: 5, packedSalesOrderLines: 2 };
  assert.deepEqual(packedCoverageGaps(counts, {}), [], 'ไม่ใส่ตัวเลือก = ไม่ตรวจ (พฤติกรรมเดิมของสคริปต์)');
  assert.deepEqual(packedCoverageGaps(counts), []);
  assert.deepEqual(packedCoverageGaps(counts, null), []);
  assert.deepEqual(packedCoverageGaps(counts, { packedQuotationLines: 5, packedSalesOrderLines: 2 }), []);
  assert.deepEqual(packedCoverageGaps(counts, { packedQuotationLines: 4, packedSalesOrderLines: 0 }), []);
  assert.deepEqual(packedCoverageGaps(counts, { packedQuotationLines: 6, packedSalesOrderLines: 2 }).map((g) => [g.key, g.got, g.min]), [['packedQuotationLines', 5, 6]]);
  assert.deepEqual(packedCoverageGaps(counts, { packedQuotationLines: 6, packedSalesOrderLines: 3 }).map((g) => g.key), ['packedQuotationLines', 'packedSalesOrderLines']);
  assert.ok(packedCoverageGaps(counts, { packedSalesOrderLines: 3 }).every((g) => typeof g.label === 'string' && g.label.length > 5));
  // วันแรก: ยังไม่มีใบไหนมีเลขแพ็ค — `0,0` ผ่าน (ด่านความครบจะไม่ยอมให้ 0 ผ่าน แต่ที่นี่ 0 คือความจริง)
  assert.deepEqual(packedCoverageGaps({ packedQuotationLines: 0, packedSalesOrderLines: 0 }, { packedQuotationLines: 0, packedSalesOrderLines: 0 }), []);
  // เลขแพ็คหายหมด (รุ่นเก่าบันทึกทับ): รอบก่อนมี 5 / 2 รอบนี้ 0 / 0 — ทั้งสองหัวข้อถูกรายงาน
  assert.deepEqual(packedCoverageGaps({ packedQuotationLines: 0, packedSalesOrderLines: 0 }, counts).map((g) => [g.key, g.got, g.min]),
    [['packedQuotationLines', 0, 5], ['packedSalesOrderLines', 0, 2]]);
  // จำนวนที่อ่านไม่ออก = 0 (ไม่มีทาง "ผ่านเพราะอ่านค่าไม่ออก") · ขั้นต่ำที่ไม่ใช่จำนวนเต็ม ≥ 0 = ไม่ตรวจ (ตัวอ่านตัวเลือกไม่ปล่อยค่าแบบนี้ออกมาอยู่แล้ว)
  for (const bad of [undefined, null, NaN, -1, 1.5, '5']) assert.deepEqual(packedCoverageGaps({ packedQuotationLines: bad }, { packedQuotationLines: 1 }).map((g) => g.got), [0], String(bad));
  for (const off of [-1, 1.5, 'x', null]) assert.deepEqual(packedCoverageGaps(counts, { packedQuotationLines: off }), [], String(off));
});

/* ── สคริปต์ทั้งตัว กับ "ฐานปลอม" ที่เป็นเซิร์ฟเวอร์ HTTP ในเครื่อง — พิสูจน์ exit code จริง ───────────────────────────
   🔴 ชี้ SUPABASE_URL ไปที่ 127.0.0.1 ด้วยคีย์ปลอม — สคริปต์ไม่ทับ env ที่ตั้งไว้แล้ว (.env.local เติมเฉพาะคีย์ที่ยังว่าง)
      และมันมีแต่คำขอ GET · เซิร์ฟเวอร์ปลอมจดทุกคำขอ: เจอเมธอดอื่น = เทสต์แดง */
const WEBAPP_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const qtLine = (id, over = {}) => ({ id, quotationId: 'Q1', productId: null, fgCode: null, description: id, qty: 12, unit: 'เดือน', unitPrice: 3500, discountType: null, discountValue: 0, discountAmount: 0, lineTotal: 42000, sortOrder: 0, metadata: {}, packQty: null, ...over });
function parityDatabase({ fingerprints = true } = {}) {
  const lines = [qtLine('QTL-1'), qtLine('QTL-2', { qty: 3, unitPrice: 100, lineTotal: 300, sortOrder: 1 })];
  const quote = { id: 'Q1', quoteNumber: 'QT-26100001-0', status: 'sent', approvalStatus: 'approved', quoteDate: '2026-10-08', subtotal: 42300, discountType: null, discountValue: 0, discountAmount: 0, vatRate: 7, vatAmount: 2961, totalAmount: 45261, lines };
  const orderLines = [{ ...qtLine('SOL-1'), quotationId: undefined, salesOrderId: 'SO1', quotationLineId: 'QTL-1' }];
  const order = { id: 'SO1', orderNumber: 'SO-26100001-0', status: 'approved', subtotal: 42000, totalAmount: 44940, lines: orderLines };
  return {
    quotation_lines: lines,
    sales_order_lines: orderLines,
    quotations: [{ ...quote, approvalFingerprint: fingerprints ? quotationApprovalFingerprint(quote) : null }],
    sales_orders: [{ ...order, approvalFingerprint: fingerprints ? salesOrderApprovalFingerprint(order) : null }],
  };
}
async function runParityScript(tables, args = []) {
  const requests = [];
  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    const table = url.pathname.replace(/^\/rest\/v1\//, '');
    requests.push({ method: req.method, table });
    const rows = tables[table];
    if (req.method !== 'GET' || !rows) { res.writeHead(500, { 'content-type': 'application/json' }); res.end(JSON.stringify({ message: `unexpected ${req.method} ${url.pathname}` })); return; }
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || rows.length);
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(rows.slice(offset, offset + limit)));
  });
  await new Promise((resolve) => { server.listen(0, '127.0.0.1', resolve); });
  try {
    const child = spawn(process.execPath, ['--import', './scripts/test-loader.mjs', 'scripts/check-line-pack-parity.mjs', ...args], {
      cwd: WEBAPP_ROOT,
      env: { ...process.env, SUPABASE_URL: `http://127.0.0.1:${server.address().port}`, SUPABASE_SERVICE_ROLE_KEY: 'test-key-not-real' },
    });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    const status = await new Promise((resolve) => { child.on('close', resolve); });
    return { status, stdout, stderr, requests };
  } finally {
    await new Promise((resolve) => { server.close(resolve); });
  }
}
const OK_LINE = '✓ ไม่มีจุดต่าง';

test('🔴 สคริปต์ทั้งตัว: อ่านได้ 0 แถวทุกตาราง = exit 1 พร้อมบอกหัวข้อที่เทียบไม่ครบ — ไม่พิมพ์ "ไม่มีจุดต่าง" (เดิม exit 0)', async () => {
  for (const args of [[], ['--before-migration']]) {
    const run = await runParityScript({ quotation_lines: [], sales_order_lines: [], quotations: [], sales_orders: [] }, args);
    assert.equal(run.status, 1, `${args.join(' ') || '(ไม่มีตัวเลือก)'}: ${run.stdout}${run.stderr}`);
    assert.ok(!run.stdout.includes(OK_LINE), 'ต้องไม่บอกว่าไม่มีจุดต่าง');
    assert.equal((run.stderr.match(/✗ เทียบไม่ครบ · /g) || []).length, 7, run.stderr);
    assert.match(run.stderr, /เทียบไม่ครบ 7 หัวข้อ — ผลรอบนี้ใช้เป็นหลักฐานไม่ได้/);
    assert.ok(run.requests.length >= 4 && run.requests.every((r) => r.method === 'GET'), 'มีแต่คำขอ GET');
  }
});

test('สคริปต์ทั้งตัว: ฐานที่ทุกยอดตรง = exit 0 และพิมพ์ตัวเลือกตรึงจำนวนของรอบนี้ · ตั้งขั้นต่ำสูงกว่าที่อ่านได้ / ไม่มีใบไหนมีลายนิ้วมือ = exit 1', async () => {
  const good = await runParityScript(parityDatabase());
  assert.equal(good.status, 0, `${good.stdout}${good.stderr}`);
  assert.ok(good.stdout.includes(OK_LINE));
  assert.match(good.stdout, /--expect-min-lines=2,1 --expect-min-fingerprints=1,1/);
  assert.deepEqual([...new Set(good.requests.map((r) => r.table))].sort(), ['quotation_lines', 'quotations', 'sales_order_lines', 'sales_orders']);
  assert.ok(good.requests.every((r) => r.method === 'GET'));
  // ขั้นต่ำเท่าที่อ่านได้ = ผ่าน · สูงกว่า = ไม่ผ่าน (ทั้งบรรทัดและลายนิ้วมือ)
  assert.equal((await runParityScript(parityDatabase(), ['--expect-min-lines=2,1', '--expect-min-fingerprints=1,1'])).status, 0);
  const fewLines = await runParityScript(parityDatabase(), ['--expect-min-lines=3,1']);
  assert.equal(fewLines.status, 1);
  assert.match(fewLines.stderr, /✗ เทียบไม่ครบ · บรรทัดใบเสนอราคาที่อ่านได้: 2 \(ต้องไม่ต่ำกว่า 3\)/);
  assert.ok(!fewLines.stdout.includes(OK_LINE));
  const fewPrints = await runParityScript(parityDatabase(), ['--expect-min-fingerprints=1,2']);
  assert.equal(fewPrints.status, 1);
  assert.match(fewPrints.stderr, /ลายนิ้วมือใบสั่งขายที่เทียบได้: 1 \(ต้องไม่ต่ำกว่า 2\)/);
  // ไม่มีใบไหนมีลายนิ้วมือเก็บไว้ ⇒ หัวข้อ ⑤ ไม่ได้เทียบอะไร — เดิมผ่าน
  const noPrints = await runParityScript(parityDatabase({ fingerprints: false }));
  assert.equal(noPrints.status, 1, noPrints.stdout);
  assert.equal((noPrints.stderr.match(/✗ เทียบไม่ครบ · /g) || []).length, 2, noPrints.stderr);
  // ไม่มีบรรทัดใบสั่งขายไหนผูกบรรทัดใบเสนอราคา ⇒ หัวข้อ ③ (เลขแพ็คของสำเนา = ต้นทาง) ไม่ได้เทียบอะไร — เดิมผ่าน
  const unlinked = parityDatabase();
  unlinked.sales_order_lines = unlinked.sales_order_lines.map((line) => ({ ...line, quotationLineId: null }));
  const noLink = await runParityScript(unlinked);
  assert.equal(noLink.status, 1, noLink.stdout);
  assert.match(noLink.stderr, /✗ เทียบไม่ครบ · บรรทัดใบสั่งขายที่เทียบกับบรรทัดใบเสนอราคาต้นทางได้: 0 \(ต้องไม่ต่ำกว่า 1\)/);
  assert.equal((noLink.stderr.match(/✗ เทียบไม่ครบ · /g) || []).length, 1, noLink.stderr);
  // จุดต่างจริงยังถูกรายงานเหมือนเดิม (ยอดบรรทัดไม่ตรงสูตร)
  const wrong = parityDatabase();
  wrong.quotation_lines[0] = { ...wrong.quotation_lines[0], lineTotal: 84000 };
  const diff = await runParityScript(wrong);
  assert.equal(diff.status, 1);
  assert.match(diff.stderr, /✗ พบจุดต่าง/);
  assert.ok(!diff.stdout.includes(OK_LINE));
});

test('สคริปต์ทั้งตัว: ตัวเลือกที่ไม่รู้จักหรือผิดรูป = exit 2 ก่อนยิงคำขอใด ๆ', async () => {
  for (const args of [['--force'], ['--expect-min-lines=many'], ['--expect-min-packed=some'], ['--pack-launch=2026-10-12'], ['--audit-since=2026-10-13T00:00:00Z']]) {
    const run = await runParityScript(parityDatabase(), args);
    assert.equal(run.status, 2, args.join(' '));
    assert.deepEqual(run.requests, []);
    assert.match(run.stderr, /ใช้ได้: --before-migration · --expect-min-lines=<QT>,<SO> · --expect-min-fingerprints=<QT>,<SO> · --expect-min-packed=<QT>,<SO> · --pack-launch=<เวลา ISO> · --audit-since=<เวลา ISO>/);
  }
});

/* ฐานปลอมที่มีใบแพ็คหนึ่งใบ: บรรทัดใบเสนอราคา 2 × 12 × 3,500 และ 1 × 12 × 3,500 (เลขแพ็ค 1) + ใบสั่งขายที่ก๊อปบรรทัดแรก — ทุกยอดและลายนิ้วมือตรง */
function packedDatabase() {
  const lines = [qtLine('QTL-1', { packQty: 2, lineTotal: 84000 }), qtLine('QTL-2', { packQty: 1, sortOrder: 1 }), qtLine('QTL-3', { qty: 3, unitPrice: 100, lineTotal: 300, sortOrder: 2 })];
  const quote = { id: 'Q1', quoteNumber: 'QT-26100001-0', status: 'sent', approvalStatus: 'approved', quoteDate: '2026-10-08', subtotal: 126300, discountType: null, discountValue: 0, discountAmount: 0, vatRate: 7, vatAmount: 8841, totalAmount: 135141, lines };
  const orderLines = [{ ...qtLine('SOL-1', { packQty: 2, lineTotal: 84000 }), quotationId: undefined, salesOrderId: 'SO1', quotationLineId: 'QTL-1' }];
  const order = { id: 'SO1', orderNumber: 'SO-26100001-0', status: 'approved', subtotal: 84000, totalAmount: 89880, lines: orderLines };
  return {
    quotation_lines: lines, sales_order_lines: orderLines,
    quotations: [{ ...quote, approvalFingerprint: quotationApprovalFingerprint(quote) }],
    sales_orders: [{ ...order, approvalFingerprint: salesOrderApprovalFingerprint(order) }],
  };
}

/* ⭐ ย้ายความคาดหวังโดยเจตนา (รีวิวเงิน 09/10 money-packed-count-is-weak-detector · มติเจ้าของ 08/10 — ประตูทางเดียวของงวด PR-3):
   เดิมข้อความของจำนวนที่ลดคือ "✗ เลขแพ็คหาย … ตรวจว่าแอปที่รันอยู่ไม่ใช่รุ่นก่อนงวด PR-1" — พูดเป็นข้อเท็จจริง ทั้งที่คนขายลบใบร่าง/ลบบรรทัดได้ตามปกติ
   วันนี้: จำนวนที่ลด = **"ต้องดู"** · ยัง exit 1 เมื่อไม่มีตัวจับที่ชี้บรรทัด (ไม่ใส่ --pack-launch) และข้อความบอกให้รันพร้อมตัวเลือกนั้น
   ไม่ได้คลายยาม: กรณี "ยอดหดเงียบ" เดิมยัง exit 1 · และถูกจับได้แม่นกว่าเดิมด้วยหัวข้อ ⑧ (เทสต์ถัดไป) */
test('🔴 สคริปต์ทั้งตัว + --expect-min-packed: พิมพ์จำนวนบรรทัดที่มีเลขแพ็คและตัวเลือกตรึงของรอบนี้ · ถึงขั้นต่ำ = exit 0 · น้อยกว่ารอบก่อน (ไม่มี --pack-launch) = exit 1 "ต้องดู" · ไม่ใส่ = เหมือนเดิม', async () => {
  const packed = await runParityScript(packedDatabase());
  assert.equal(packed.status, 0, `${packed.stdout}${packed.stderr}`);
  assert.match(packed.stdout, /บรรทัดใบเสนอราคา 3 \(มีเลขแพ็ค 2\) · บรรทัดใบสั่งขาย 1 \(มีเลขแพ็ค 1\)/);
  assert.match(packed.stdout, /--expect-min-lines=3,1 --expect-min-fingerprints=1,1 --expect-min-packed=2,1/);
  assert.ok(packed.requests.every((r) => r.method === 'GET'));
  // ถึงขั้นต่ำพอดี / ต่ำกว่าที่มี = ผ่าน
  for (const floor of ['2,1', '1,0', '0,0']) assert.equal((await runParityScript(packedDatabase(), [`--expect-min-packed=${floor}`])).status, 0, floor);
  // ⚠️ เลขแพ็คของบรรทัดเดียวหายพร้อมยอดที่หดตาม — แถวที่ "ถูกต้อง" ทุกหัวข้อ: บรรทัดเดิม 2 × 12 × 3,500 = 84,000 กลายเป็น 12 × 3,500 = 42,000 กับ NULL
  //    หัวใบและลายนิ้วมือถูกเขียนใหม่ให้ตรงกัน (สิ่งที่รุ่นก่อนงวด PR-1 ทำเมื่อบันทึกใบ) ⇒ ไม่มีจุดต่างสักจุด มีแต่จำนวนที่ลดลง
  const shrunk = packedDatabase();
  shrunk.quotation_lines[0] = { ...shrunk.quotation_lines[0], packQty: null, lineTotal: 42000 };
  const header = { ...shrunk.quotations[0], subtotal: 84300, vatAmount: 5901, totalAmount: 90201, lines: shrunk.quotation_lines };
  shrunk.quotations = [{ ...header, approvalFingerprint: quotationApprovalFingerprint(header) }];
  shrunk.sales_order_lines = shrunk.sales_order_lines.map((line) => ({ ...line, packQty: null, lineTotal: 42000 }));
  const order = { ...shrunk.sales_orders[0], subtotal: 42000, totalAmount: 44940, lines: shrunk.sales_order_lines };
  shrunk.sales_orders = [{ ...order, approvalFingerprint: salesOrderApprovalFingerprint(order) }];
  const silent = await runParityScript(shrunk);
  assert.equal(silent.status, 0, `ไม่ใส่ตัวเลือก: ทุกหัวข้อเดิมมองไม่เห็นว่ายอดหด — ${silent.stdout}${silent.stderr}`);
  assert.match(silent.stdout, /มีเลขแพ็ค 1\) · บรรทัดใบสั่งขาย 1 \(มีเลขแพ็ค 0\)/);
  const caught = await runParityScript(shrunk, ['--expect-min-packed=2,1']);
  assert.equal(caught.status, 1, `${caught.stdout}${caught.stderr}`);
  assert.match(caught.stderr, /✗ ต้องดู · บรรทัดใบเสนอราคาที่มีเลขแพ็ค น้อยกว่ารอบก่อน: 1 \(รอบก่อน 2\)/);
  assert.match(caught.stderr, /✗ ต้องดู · บรรทัดใบสั่งขายที่มีเลขแพ็ค น้อยกว่ารอบก่อน: 0 \(รอบก่อน 1\)/);
  assert.match(caught.stderr, /รันใหม่พร้อม --pack-launch=/);
  assert.match(caught.stderr, /ลดลงเพราะลบใบร่าง\/ลบบรรทัดตามปกติก็ได้/, 'ข้อความไม่กล่าวหาว่ารุ่นเก่าเขียนทับ');
  assert.doesNotMatch(caught.stderr, /✗ เลขแพ็คหาย · /);
  assert.ok(!caught.stdout.includes(OK_LINE), 'ต้องไม่บอกว่าไม่มีจุดต่าง');
  assert.ok(caught.requests.every((r) => r.table !== 'audit_logs'), 'ไม่ใส่ --pack-launch = ไม่อ่าน audit');
  // ฐานที่ยังไม่มีเลขแพ็คเลย (วันนี้): `0,0` ผ่าน · ตั้งขั้นต่ำเกิน = exit 1
  assert.equal((await runParityScript(parityDatabase(), ['--expect-min-packed=0,0'])).status, 0);
  const none = await runParityScript(parityDatabase(), ['--expect-min-packed=1,0']);
  assert.equal(none.status, 1);
  assert.equal((none.stderr.match(/✗ ต้องดู · /g) || []).length, 1, none.stderr);
});

/* ═══ ตัวจับที่ชี้บรรทัด (รีวิวเงิน 09/10 · งวด PR-3 ประตูทางเดียว) ═══════════════════════════════════════════════════════════
   จำนวนบรรทัดที่มีเลขแพ็คเป็นตัวจับที่อ่อน: ของที่หายถูกชดเชยด้วยบรรทัดใหม่ = มองไม่เห็น · ลบใบ/ลบบรรทัดตามปกติ = ร้องผิด
   สามตัวข้างล่างใช้ความจริงที่ด่านของงวด PR-3 รับประกัน (บันทึกบรรทัด/ยื่น/อนุมัติ ⇒ บรรทัดหมวด 02-001 ต้องมีเลขแพ็ค) ซึ่งรุ่นก่อนงวด PR-1 ละเมิด */
const SDS_FG = 'FG-278-02-001-0757';
const CANDLE_FG = 'FG-278-01-003-0763';
const auditLine = (id, over = {}) => ({ id, quotationId: 'Q1', productId: 'P-SDS', fgCode: SDS_FG, description: 'SDS', qty: 12, unit: 'เดือน', unitPrice: 3500, discountType: null, discountValue: 0, discountAmount: 0, lineTotal: 84000, sortOrder: 0, metadata: {}, packQty: 2, ...over });
const auditEntry = (id, before, after, over = {}) => ({
  id, action: 'update', entityId: 'Q1', actorName: 'ผู้ขาย ก', summary: 'แก้ไขใบเสนอราคา QT-26100001-0', createdAt: '2026-10-13T02:00:00.000Z',
  before: before ? { id: 'Q1', quoteNumber: 'QT-26100001-0', lines: before } : null,
  after: after ? { id: 'Q1', quoteNumber: 'QT-26100001-0', lines: after } : null,
  ...over,
});

test('🔴 packLossInAudit: การบันทึกที่เขียนบรรทัดหมวด 02-001 ใหม่โดยไม่มีเลขแพ็ค ทั้งที่ก่อนบันทึกมี = ลายเซ็นของรุ่นก่อนงวด PR-1 — บอกรายการ เลขแพ็คเดิม ยอดเดิม', () => {
  const packed = [auditLine('L1'), auditLine('L2', { packQty: 1, lineTotal: 42000, sortOrder: 1 }), auditLine('L3', { productId: 'P-CD', fgCode: CANDLE_FG, packQty: null, qty: 50, unitPrice: 250, lineTotal: 12500, sortOrder: 2 })];
  /* รุ่นเก่าบันทึกทับ: ทุกบรรทัดถูกเขียนใหม่ (id ใหม่) · เลขแพ็คเป็น NULL · ยอด = จำนวน × ราคา — แถวที่ CHECK รับทุกแถว */
  const overwritten = [auditLine('N1', { packQty: null, lineTotal: 42000 }), auditLine('N2', { packQty: null, lineTotal: 42000, sortOrder: 1 }), { ...packed[2], id: 'N3' }];
  const loss = packLossInAudit([auditEntry(901, packed, overwritten)]);
  assert.equal(loss.compared, 1);
  assert.deepEqual(loss.removed, []);
  assert.deepEqual(loss.stripped, [{
    auditId: 901, at: '2026-10-13T02:00:00.000Z', actor: 'ผู้ขาย ก', quotationId: 'Q1', number: 'QT-26100001-0',
    rows: [{ row: 1, packQty: 2, lineTotal: 84000, now: 42000 }, { row: 2, packQty: 1, lineTotal: 42000, now: 42000 }],
  }], 'เลขแพ็ค 1 ที่หาย (ยอดไม่เปลี่ยน) ก็ถูกรายงาน — จำนวนกับ CHECK มองไม่เห็นตัวนี้');

  /* สิ่งที่รุ่นตั้งแต่งวด PR-3 ทำได้ทั้งหมด **ไม่ถูกกล่าวหา** */
  const cases = {
    'บันทึกบรรทัดใหม่ เลขแพ็คครบ (แก้เลข/จำนวน)': [packed, [auditLine('N1', { packQty: 3, lineTotal: 126000 }), auditLine('N2', { packQty: 1, lineTotal: 42000, sortOrder: 1 }), { ...packed[2], id: 'N3' }]],
    'บันทึกที่ไม่เขียนบรรทัด (หมายเหตุ/วันที่) — id เดิมทุกบรรทัด': [packed, packed.map((line) => ({ ...line }))],
    'ใบเก่าที่ไม่เคยมีเลขแพ็ค (บรรทัดหมวด 02-001 ว่างทั้งก่อนและหลัง)': [[auditLine('L1', { packQty: null, lineTotal: 42000 })], [auditLine('L1', { packQty: null, lineTotal: 42000 })]],
    'ใบที่ไม่มีบรรทัดหมวด 02-001': [[packed[2]], [{ ...packed[2], id: 'N3', qty: 60, lineTotal: 15000 }]],
  };
  for (const [name, [before, after]] of Object.entries(cases)) {
    const result = packLossInAudit([auditEntry(1, before, after)]);
    assert.deepEqual([result.stripped, result.removed], [[], []], name);
    assert.equal(result.compared, 1, name);
  }
  /* ใบที่มีทั้งบรรทัดที่มีเลขแพ็คและบรรทัดหมวด 02-001 ที่ไม่มี (เกิดได้เฉพาะจากความเสียหายก่อนหน้า) แล้วถูกบันทึกแบบ **ไม่เขียนบรรทัด** (id เดิมทุกบรรทัด):
     การบันทึกครั้งนี้ไม่ได้ทำอะไรหาย ⇒ ไม่ถูกกล่าวหาซ้ำ (ตัวตัดสินคือ "บรรทัดที่เขียนใหม่" ไม่ใช่ "มีบรรทัดที่ขาดเลข") */
  const mixed = [auditLine('L1'), auditLine('L2', { packQty: null, lineTotal: 42000, sortOrder: 1 })];
  assert.deepEqual(packLossInAudit([auditEntry(8, mixed, mixed.map((line) => ({ ...line })))]), { compared: 1, stripped: [], removed: [] });
  /* ลบบรรทัดที่มีเลขแพ็ค · เปลี่ยนสินค้าออกจากหมวด 02-001 (จอล้างเลขให้ต่อหน้าคนเปลี่ยน) = ทำได้ ⇒ "removed" (ข้อมูล) ไม่ใช่ "stripped" */
  const lineDeleted = packLossInAudit([auditEntry(2, packed, [auditLine('N2', { packQty: 1, lineTotal: 42000, sortOrder: 0 }), { ...packed[2], id: 'N3', sortOrder: 1 }])]);
  assert.deepEqual(lineDeleted.stripped, []);
  assert.equal(lineDeleted.removed.length, 1);
  assert.equal(lineDeleted.removed[0].how, 'ลบบรรทัด / เปลี่ยนสินค้าหรือหมวด');
  const swapped = packLossInAudit([auditEntry(3, [packed[0]], [auditLine('N1', { productId: 'P-CD', fgCode: CANDLE_FG, packQty: null, unitPrice: 250, lineTotal: 3000 })])]);
  assert.deepEqual(swapped.stripped, []);
  assert.deepEqual(swapped.removed.map((entry) => entry.rows), [[{ row: 1, packQty: 2, lineTotal: 84000, now: 3000 }]]);
  /* ลบใบทั้งใบ (action delete — มีแต่ before): ข้อมูลที่อธิบายว่าทำไมจำนวนลด */
  const deleted = packLossInAudit([auditEntry(4, packed, null, { action: 'delete' })]);
  assert.deepEqual([deleted.compared, deleted.stripped.length, deleted.removed.length, deleted.removed[0].how, deleted.removed[0].rows.length], [0, 0, 1, 'ลบใบ', 2]);
  /* การยื่น/อนุมัติเก็บ after ที่ไม่มีบรรทัด ⇒ ไม่มีอะไรให้เทียบ ไม่นับ ไม่ร้อง */
  assert.deepEqual(packLossInAudit([auditEntry(5, packed, null), { ...auditEntry(6, packed, overwritten), after: { id: 'Q1' } }]), { compared: 0, stripped: [], removed: [] });
  /* บรรทัดพิมพ์เองหมวด 02-001 (ไม่มีรหัส FG — หมวดอยู่ใน metadata) ก็ถูกจับ */
  const typedBefore = [auditLine('T1', { productId: null, fgCode: null, metadata: { categoryCode: '02-001' }, packQty: 3, qty: 6, unitPrice: 1200, lineTotal: 21600 })];
  const typedAfter = [{ ...typedBefore[0], id: 'T9', packQty: null, lineTotal: 7200 }];
  assert.deepEqual(packLossInAudit([auditEntry(7, typedBefore, typedAfter)]).stripped[0].rows, [{ row: 1, packQty: 3, lineTotal: 21600, now: 7200 }]);
  /* `since`: แถวก่อนเวลาที่กำหนดไม่นับ (ฐานที่ไม่กรองให้ / หน้าที่ซ้อนกัน) */
  assert.equal(packLossInAudit([auditEntry(901, packed, overwritten)], { since: '2026-10-13T02:00:00.001Z' }).stripped.length, 0);
  assert.equal(packLossInAudit([auditEntry(901, packed, overwritten)], { since: '2026-10-13T02:00:00.000Z' }).stripped.length, 1);
  assert.deepEqual(packLossInAudit(null), { compared: 0, stripped: [], removed: [] });
  /* 🔴 กรณีที่จำนวนมองไม่เห็น: รุ่นเก่าทำเลขแพ็คของใบหนึ่งหาย 2 บรรทัด วันเดียวกันมีใบใหม่ที่มีเลขแพ็ค 5 บรรทัด — จำนวนรวมเพิ่ม แต่ตัวนี้ยังชี้ใบที่เสีย */
  assert.deepEqual(packedCoverageGaps({ packedQuotationLines: 40 - 2 + 5, packedSalesOrderLines: 0 }, { packedQuotationLines: 40, packedSalesOrderLines: 0 }), [], 'จำนวน: ผ่าน');
  assert.equal(loss.stripped[0].number, 'QT-26100001-0');
});

test('🔴 revisionPackLoss: ฉบับ Rev. มีบรรทัดหมวด 02-001 ที่ขาดเลขแพ็ค ทั้งที่ต้นทางมี (รุ่นเก่าออก Rev. / บันทึกทับ) · Rev. ของใบเก่าที่ไม่เคยมีเลขแพ็คไม่ถูกกล่าวหา', () => {
  const source = { id: 'Q1', quoteNumber: 'QT-26100001-0', status: 'revised', lines: [auditLine('L1'), auditLine('L2', { packQty: 1, lineTotal: 42000, sortOrder: 1 })] };
  const goodRev = { id: 'Q2', quoteNumber: 'QT-26100001-1', revisedFromId: 'Q1', lines: [auditLine('R1'), auditLine('R2', { packQty: 1, lineTotal: 42000, sortOrder: 1 })] };
  assert.deepEqual(revisionPackLoss([source, goodRev]), { checked: 1, diffs: [] });
  const badRev = { ...goodRev, lines: [auditLine('R1', { packQty: null, lineTotal: 42000 }), auditLine('R2', { packQty: null, lineTotal: 42000, sortOrder: 1 })] };
  assert.deepEqual(revisionPackLoss([source, badRev]), {
    checked: 1,
    diffs: [{ id: 'Q2', number: 'QT-26100001-1', sourceId: 'Q1', sourceNumber: 'QT-26100001-0', rows: [{ row: 1, lineTotal: 42000 }, { row: 2, lineTotal: 42000 }], sourcePacked: 2 }],
  });
  // Rev. ของใบเก่า (ต้นทางไม่มีเลขแพ็ค): ก๊อป NULL ตามที่เป็น — มติข้อ 3 ไม่ใช่ข้อผิด
  const oldSource = { id: 'Q3', quoteNumber: 'QT-26080001-0', lines: [auditLine('O1', { packQty: null, lineTotal: 42000 })] };
  const oldRev = { id: 'Q4', quoteNumber: 'QT-26080001-1', revisedFromId: 'Q3', lines: [auditLine('O2', { packQty: null, lineTotal: 42000 })] };
  assert.deepEqual(revisionPackLoss([oldSource, oldRev]), { checked: 1, diffs: [] });
  // ร่าง Rev. ที่คนขายลบบรรทัด 02-001 ออก / เปลี่ยนเป็นสินค้าหมวดอื่น: ไม่มีบรรทัดหมวด 02-001 ที่ขาดเลข ⇒ ไม่ถูกกล่าวหา
  const edited = { ...goodRev, lines: [auditLine('R1', { productId: 'P-CD', fgCode: CANDLE_FG, packQty: null, unitPrice: 250, lineTotal: 3000 })] };
  assert.deepEqual(revisionPackLoss([source, edited]).diffs, []);
  // หาต้นทางไม่เจอ / ไม่ใช่ Rev. = ไม่นับ
  assert.deepEqual(revisionPackLoss([{ id: 'Q9', revisedFromId: 'gone', lines: [auditLine('X', { packQty: null })] }, source]), { checked: 0, diffs: [] });
  assert.deepEqual(revisionPackLoss(null), { checked: 0, diffs: [] });
});

test('🔴 sentWithoutPack: ใบที่ยื่น/อนุมัติตั้งแต่วันเปิดช่อง ต้องไม่มีบรรทัดหมวด 02-001 ที่ขาดเลขแพ็ค — ใบเก่าที่ยื่น/อนุมัติก่อนหน้านั้นไม่นับ (มติ A4)', () => {
  const LAUNCH = '2026-10-12T03:00:00.000Z';
  const bare = [auditLine('L1', { packQty: null, lineTotal: 42000 }), auditLine('L2', { productId: 'P-CD', fgCode: CANDLE_FG, packQty: null, lineTotal: 3000, sortOrder: 1 })];
  const quote = (over) => ({ id: 'Q1', quoteNumber: 'QT-26100001-0', status: 'sent', approvalStatus: 'approved', approvalRequestedAt: null, approvedAt: null, lines: bare, ...over });
  // ใบเก่า: ยื่น/อนุมัติก่อนวันเปิดช่อง — หน้าตาเดิม ยอดเดิม ไม่ใช่ข้อผิด
  assert.deepEqual(sentWithoutPack([quote({ approvalRequestedAt: '2026-08-31T04:00:00Z', approvedAt: '2026-09-01T04:00:00Z' }), quote({ id: 'Q0' })], LAUNCH), { checked: 0, diffs: [] });
  // อนุมัติหลังวันเปิดช่องทั้งที่บรรทัดหมวด 02-001 ไม่มีเลขแพ็ค (ด่านอนุมัติของงวด PR-3 ไม่ให้ผ่าน — มาจากรุ่นที่ไม่มีด่าน)
  const late = sentWithoutPack([quote({ approvalRequestedAt: '2026-08-31T04:00:00Z', approvedAt: '2026-10-12T03:00:00.000Z' })], LAUNCH);
  assert.deepEqual(late, { checked: 1, diffs: [{ id: 'Q1', number: 'QT-26100001-0', approvalStatus: 'approved', status: 'sent', requestedAt: '2026-08-31T04:00:00Z', approvedAt: '2026-10-12T03:00:00.000Z', rows: [{ row: 1, lineTotal: 42000 }] }] });
  // ยื่นหลังวันเปิดช่อง (ยังไม่อนุมัติ) ก็นับ
  assert.equal(sentWithoutPack([quote({ approvalStatus: 'pending', approvalRequestedAt: '2026-10-13T00:00:00+07:00' })], LAUNCH).diffs.length, 1, '13/10 00:00 เวลาไทย = 12/10 17:00Z ≥ วันเปิด');
  assert.equal(sentWithoutPack([quote({ approvalStatus: 'pending', approvalRequestedAt: '2026-10-12T09:59:59+07:00' })], LAUNCH).checked, 0, 'ก่อนวันเปิดหนึ่งวินาที = ไม่นับ');
  assert.equal(sentWithoutPack([quote({ approvalStatus: 'pending', approvalRequestedAt: '2026-10-12T10:00:00+07:00' })], LAUNCH).diffs.length, 1);
  // ใบที่กรอกครบ / ใบที่ไม่มีบรรทัดหมวด 02-001: นับว่าตรวจ แต่ไม่มีข้อ
  const full = quote({ approvedAt: '2026-10-14T00:00:00Z', lines: [auditLine('L1'), bare[1]] });
  assert.deepEqual(sentWithoutPack([full, quote({ id: 'Q2', approvedAt: '2026-10-14T00:00:00Z', lines: [bare[1]] })], LAUNCH), { checked: 2, diffs: [] });
});

test('ตัวอ่าน audit: อ่านอย่างเดียว · กรองชนิด/การกระทำ/เวลา · ไล่หน้าครบ · เอ่ยชื่อคอลัมน์ที่มีจริง (ด่าน check:columns)', async () => {
  assert.equal(QUOTATION_AUDIT_SELECT, 'id, action, "entityId", "actorName", summary, "createdAt", before, after');
  assert.deepEqual([...QUOTATION_AUDIT_ACTIONS], ['update', 'delete']);
  assert.match(SOURCE, /fetchAllResult\(\s*\(\) => supabase\.from\('audit_logs'\)\.select\(QUOTATION_AUDIT_SELECT\)\.eq\('entityType', 'quotation'\)\.in\('action', QUOTATION_AUDIT_ACTIONS\)\.gte\('createdAt', sinceIso\)\.order\('id', \{ ascending: true \}\),\s*\{ pageSize: 100 \},\s*\);/);
  const calls = [];
  const rows = Array.from({ length: 230 }, (_, i) => ({ id: i + 1 }));
  const fake = {
    from: (table) => ({ select: (columns) => ({ eq: (column, value) => ({ in: (inColumn, list) => ({ gte: (gteColumn, since) => ({ order: () => ({
      range: async (from, to) => { calls.push({ table, columns, column, value, inColumn, list, gteColumn, since, from, to }); return { data: rows.slice(from, to + 1), error: null }; },
    }) }) }) }) }) }),
  };
  const read = await loadQuotationAuditSince(fake, '2026-10-12T03:00:00.000Z');
  assert.equal(read.error, null);
  assert.equal(read.data.length, 230);
  assert.deepEqual(calls.map((c) => [c.from, c.to]), [[0, 99], [100, 199], [200, 299]]);
  assert.deepEqual([calls[0].table, calls[0].column, calls[0].value, calls[0].inColumn, [...calls[0].list], calls[0].gteColumn, calls[0].since],
    ['audit_logs', 'entityType', 'quotation', 'action', ['update', 'delete'], 'createdAt', '2026-10-12T03:00:00.000Z']);
});

test('parseParityArgs: --pack-launch / --audit-since ต้องเป็นเวลา ISO ที่มีเขตเวลา — วันที่ลอย ๆ ถูกปฏิเสธ (เที่ยงคืนไทยกับ UTC ห่างกัน 7 ชั่วโมงของการบันทึก)', () => {
  assert.deepEqual(parseParityArgs(['--pack-launch=2026-10-12T10:00:00+07:00']), { beforeMigration: false, floors: {}, problems: [], packLaunch: '2026-10-12T03:00:00.000Z', auditSince: null });
  assert.equal(parseParityArgs(['--pack-launch=2026-10-12T03:00:00Z', '--audit-since=2026-10-13T08:30:15.123Z']).auditSince, '2026-10-13T08:30:15.123Z');
  for (const bad of ['--pack-launch', '--pack-launch=', '--pack-launch=2026-10-12', '--pack-launch=2026-10-12T10:00:00', '--pack-launch=12/10/2026', '--pack-launch=yesterday', '--pack-launch=2026-13-40T00:00:00Z']) {
    const parsed = parseParityArgs([bad]);
    assert.equal(parsed.problems.length, 1, bad);
    assert.equal(parsed.packLaunch, null, bad);
  }
  assert.equal(parseParityArgs(['--audit-since=2026-10-13T00:00:00Z']).problems.length, 1, 'ต้องใส่คู่กับ --pack-launch');
  assert.equal(parseParityArgs(['--pack-launch=2026-10-12T03:00:00Z', '--audit-since=2026-10-11T00:00:00Z']).problems.length, 1, 'ไล่ audit ก่อนวันเปิดช่องไม่ได้');
});

test('🔴 สคริปต์ทั้งตัว + --pack-launch: ยอดหดเงียบจากรุ่นเก่าถูกชี้เป็นใบ/รายการ/ยอดเดิม แม้จำนวนบรรทัดที่มีเลขแพ็คไม่ลด · ลบบรรทัดตามปกติไม่ทำให้ exit 1', async () => {
  const LAUNCH = '--pack-launch=2026-10-12T03:00:00Z';
  /* ฐานที่สะอาด + audit ของการบันทึกปกติ: exit 0 · อ่าน audit_logs (GET) · พิมพ์ --audit-since ของรอบถัดไป */
  const clean = { ...packedDatabase(), audit_logs: [auditEntry(1, [auditLine('L1')], [auditLine('N1', { packQty: 3, lineTotal: 126000 })])] };
  const ok = await runParityScript(clean, [LAUNCH, '--expect-min-packed=2,1']);
  assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);
  assert.match(ok.stdout, /✓ ⑥ ฉบับ Rev\. พกเลขแพ็คครบ/);
  assert.match(ok.stdout, /✓ ⑦ ใบที่ยื่น\/อนุมัติตั้งแต่วันเปิดช่อง \(2026-10-12T03:00:00\.000Z\)/);
  assert.match(ok.stdout, /✓ ⑧ การบันทึกใบเสนอราคาตั้งแต่ 2026-10-12T03:00:00\.000Z ไม่ทำเลขแพ็คของบรรทัดหมวด 02-001 หาย: ต่าง 0 จาก 1/);
  assert.match(ok.stdout, /--pack-launch=2026-10-12T03:00:00\.000Z --audit-since=\d{4}-\d{2}-\d{2}T/);
  assert.ok(ok.requests.some((r) => r.table === 'audit_logs'));
  assert.ok(ok.requests.every((r) => r.method === 'GET'), 'มีแต่คำขอ GET');

  /* 🔴 รุ่นเก่าบันทึกทับใบ Q1 (เลขแพ็คสองบรรทัดหาย ยอดหด) และวันเดียวกันมีใบใหม่ Q2 ที่มีเลขแพ็คสามบรรทัด
        ⇒ จำนวนรวม 2 → 3 (ไม่ลด) · หัวใบ/ลายนิ้วมือถูกเขียนใหม่ให้ตรง ⇒ หัวข้อ ①–⑤ และจำนวน มองไม่เห็นเลย */
  const hit = packedDatabase();
  hit.quotation_lines = [
    { ...hit.quotation_lines[0], packQty: null, lineTotal: 42000 }, { ...hit.quotation_lines[1], packQty: null }, hit.quotation_lines[2],
    qtLine('Q2-1', { quotationId: 'Q2', packQty: 2, lineTotal: 84000 }), qtLine('Q2-2', { quotationId: 'Q2', packQty: 2, lineTotal: 84000, sortOrder: 1 }), qtLine('Q2-3', { quotationId: 'Q2', packQty: 1, sortOrder: 2 }),
  ];
  const q1 = { ...hit.quotations[0], subtotal: 84300, vatAmount: 5901, totalAmount: 90201, lines: hit.quotation_lines.slice(0, 3) };
  const q2 = { id: 'Q2', quoteNumber: 'QT-26100002-0', status: 'draft', approvalStatus: 'not_submitted', quoteDate: '2026-10-13', subtotal: 210000, discountType: null, discountValue: 0, discountAmount: 0, vatRate: 7, vatAmount: 14700, totalAmount: 224700, lines: hit.quotation_lines.slice(3) };
  hit.quotations = [{ ...q1, approvalFingerprint: quotationApprovalFingerprint(q1) }, { ...q2, approvalFingerprint: null }];
  hit.sales_order_lines = hit.sales_order_lines.map((line) => ({ ...line, packQty: null, lineTotal: 42000 }));
  const so = { ...hit.sales_orders[0], subtotal: 42000, totalAmount: 44940, lines: hit.sales_order_lines };
  hit.sales_orders = [{ ...so, approvalFingerprint: salesOrderApprovalFingerprint(so) }];
  const beforeSave = [auditLine('QTL-1', { productId: null, fgCode: null, metadata: { categoryCode: '02-001' } }), auditLine('QTL-2', { productId: null, fgCode: null, metadata: { categoryCode: '02-001' }, packQty: 1, lineTotal: 42000, sortOrder: 1 })];
  const afterSave = [{ ...beforeSave[0], id: 'NEW-1', packQty: null, lineTotal: 42000 }, { ...beforeSave[1], id: 'NEW-2', packQty: null }];
  hit.audit_logs = [auditEntry(77, beforeSave, afterSave, { actorName: 'dev server เก่า' })];
  const blind = await runParityScript(hit, ['--expect-min-packed=2,0']);
  assert.equal(blind.status, 0, `ไม่มี --pack-launch: จำนวน 3 ≥ 2 ทุกหัวข้อเดิมผ่าน — ${blind.stdout}${blind.stderr}`);
  const seen = await runParityScript(hit, [LAUNCH, '--expect-min-packed=2,0']);
  assert.equal(seen.status, 1, `${seen.stdout}${seen.stderr}`);
  assert.match(seen.stdout, /✗ ⑧ การบันทึกใบเสนอราคาตั้งแต่ 2026-10-12T03:00:00\.000Z ไม่ทำเลขแพ็คของบรรทัดหมวด 02-001 หาย: ต่าง 1 จาก 1/);
  assert.match(seen.stdout, /"auditId":77.*"number":"QT-26100001-0".*"rows":\[\{"row":1,"packQty":2,"lineTotal":84000,"now":42000\},\{"row":2,"packQty":1,"lineTotal":42000,"now":42000\}\]/);
  assert.match(seen.stderr, /rows\[\]\.packQty และ rows\[\]\.lineTotal คือค่าเดิมที่ต้องกู้คืน/);
  assert.match(seen.stderr, /dev server ของ worktree เก่า/);
  assert.ok(!seen.stdout.includes(OK_LINE));
  assert.doesNotMatch(seen.stdout, /--audit-since=/, 'รอบที่ไม่ผ่านไม่พิมพ์จุดเริ่มของรอบถัดไป (รอบหน้าต้องไล่ช่วงเดิมซ้ำ)');

  /* ลบบรรทัดที่มีเลขแพ็คตามปกติ: จำนวนลดจากรอบก่อน แต่หัวข้อ ⑥–⑧ ไม่พบของหาย ⇒ exit 0 พร้อมบอกว่าบรรทัดไหนถูกลบ (เดิม: exit 1 กล่าวหารุ่นเก่า) */
  const trimmed = { ...packedDatabase(), audit_logs: [auditEntry(5, [auditLine('A1'), auditLine('A2', { sortOrder: 1 })], [auditLine('B1')]), auditEntry(6, [auditLine('D1')], null, { action: 'delete', entityId: 'Q7', before: { id: 'Q7', quoteNumber: 'QT-26100007-0', lines: [auditLine('D1')] } })] };
  const legit = await runParityScript(trimmed, [LAUNCH, '--expect-min-packed=4,1']);
  assert.equal(legit.status, 0, `${legit.stdout}${legit.stderr}`);
  assert.match(legit.stdout, /ℹ️ บรรทัดใบเสนอราคาที่มีเลขแพ็ค น้อยกว่ารอบก่อน: 2 \(รอบก่อน 4\) — หัวข้อ ⑥–⑧ ไม่พบเลขแพ็คที่หาย/);
  assert.match(legit.stdout, /บรรทัดที่มีเลขแพ็คถูกลบ\/ย้ายหมวดด้วยการทำงานปกติ 2 บรรทัด/);
  assert.match(legit.stdout, /"how":"ลบใบ"/);
  assert.ok(legit.stdout.includes(OK_LINE));

  /* ⑥: ฉบับ Rev. ที่รุ่นเก่าออก (ต้นทางมีเลขแพ็ค ฉบับใหม่ไม่มี) — ไม่ต้องใส่ --pack-launch ก็ถูกจับ (อ่านจากใบที่โหลดอยู่แล้ว) */
  const rev = packedDatabase();
  const revLines = [qtLine('RV-1', { quotationId: 'Q5', fgCode: SDS_FG, productId: 'P-SDS' }), qtLine('RV-2', { quotationId: 'Q5', qty: 3, unitPrice: 100, lineTotal: 300, sortOrder: 1 })];
  rev.quotation_lines = [...rev.quotation_lines.map((line, index) => (index < 2 ? { ...line, fgCode: SDS_FG, productId: 'P-SDS' } : line)), ...revLines];
  const srcQuote = { ...rev.quotations[0], status: 'revised', lines: rev.quotation_lines.slice(0, 3) };
  const revQuote = { id: 'Q5', quoteNumber: 'QT-26100001-1', revisedFromId: 'Q1', status: 'draft', approvalStatus: 'not_submitted', quoteDate: '2026-10-13', subtotal: 42300, discountType: null, discountValue: 0, discountAmount: 0, vatRate: 7, vatAmount: 2961, totalAmount: 45261, lines: revLines };
  rev.quotations = [{ ...srcQuote, approvalFingerprint: quotationApprovalFingerprint(srcQuote) }, { ...revQuote, approvalFingerprint: null }];
  const revRun = await runParityScript(rev);
  assert.equal(revRun.status, 1, `${revRun.stdout}${revRun.stderr}`);
  assert.match(revRun.stdout, /✗ ⑥ ฉบับ Rev\. พกเลขแพ็คครบ.*ต่าง 1 จาก 1.*"number":"QT-26100001-1".*"sourceNumber":"QT-26100001-0"/);
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 · แผน IMPL_PLAN_PR3 §3.6 + §10): บรรทัด exit ของสคริปต์ได้เงื่อนไขที่สาม
   (บรรทัดที่มีเลขแพ็คน้อยกว่ารอบก่อน) — สองเงื่อนไขเดิมอยู่ครบ ลำดับเดิม และด่านยังอยู่ก่อนบรรทัดที่บอกว่าไม่มีจุดต่าง */
test('สคริปต์ต่อสายด่านความครบ: นับจากสิ่งที่อ่าน/เทียบจริงทั้งเจ็ดหัวข้อ และออกด้วย exit 1 เมื่อมีจุดต่าง · เทียบไม่ครบ · หรือบรรทัดที่มีเลขแพ็คน้อยกว่ารอบก่อน', () => {
  for (const [key] of PARITY_COVERAGE) assert.match(SCRIPT, new RegExp(`\\b${key}: `), `สคริปต์ต้องส่ง ${key} ให้ด่านความครบ`);
  assert.match(SCRIPT, /const gaps = parityCoverageGaps\(counts, floors\);/);
  for (const [key] of PACKED_COVERAGE) assert.match(SCRIPT, new RegExp(`\\b${key}: packedLineCount\\(`), `สคริปต์ต้องนับ ${key} จากแถวที่อ่านจริง`);
  assert.match(SCRIPT, /const packedGaps = packedCoverageGaps\(packedCounts, floors\);/);
  /* ⭐ ย้ายโดยเจตนา (รีวิวเงิน 09/10): เงื่อนไขที่สามเดิมคือ "จำนวนลด" (packedGaps.length) — วันนี้คือ "จำนวนลด **และไม่มีตัวจับที่ชี้บรรทัด**"
     (packedDropBlocks = ไม่ใส่ --pack-launch) · มี --pack-launch แล้วเลขแพ็คหายจริง = หัวข้อ ⑥–⑧ เข้า `differences` (exit 1 ทางเดิม) */
  assert.match(SCRIPT, /const packedDropBlocks = packedGaps\.length > 0 && !packLaunch;/);
  const EXIT = 'if (differences || gaps.length || packedDropBlocks) process.exit(1);';
  assert.equal(SCRIPT.split(EXIT).length - 1, 1, 'บรรทัด exit มีที่เดียว และมีครบสามเงื่อนไข');
  /* หัวข้อ ⑥ ⑦ ⑧ ผ่าน `section` ตัวเดียวกับหัวข้ออื่น ⇒ จุดต่างของมันถูกนับใน differences */
  for (const call of ['section(\'⑥ ', 'section(`⑦ ', 'section(`⑧ ']) assert.ok(SCRIPT.includes(call), `สคริปต์ต้องรายงานหัวข้อ ${call}`);
  assert.match(SCRIPT, /const revLoss = revisionPackLoss\(quotations\);/);
  assert.match(SCRIPT, /const unsent = sentWithoutPack\(quotations, packLaunch\);/);
  assert.match(SCRIPT, /const loss = packLossInAudit\(auditRows, \{ since: scanFrom \}\);/);
  assert.equal((SCRIPT.match(/process\.exit\(1\)/g) || []).length, 3, 'exit 1 สามจุด: ไม่มีคีย์ · อ่านไม่สำเร็จ (die) · ด่านท้ายสคริปต์');
  assert.ok(SCRIPT.indexOf(EXIT) < SCRIPT.indexOf("console.log('\\n✓ ไม่มีจุดต่าง"), 'ด่านอยู่ก่อนบรรทัดที่บอกว่าไม่มีจุดต่าง');
});
