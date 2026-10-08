// ── ตัวเทียบของสคริปต์ check-line-pack-parity (อ่านอย่างเดียว · mig 0407 · docs/qt-pack-column.md) ──────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import {
  PARITY_COVERAGE, QUOTATION_LINE_MONEY_SELECT, SALES_ORDER_LINE_MONEY_SELECT, checkRuleDiffs, fingerprintDiffs, headerTotalDiffs,
  lineMoneyDiffs, loadQuotationLineMoney, loadSalesOrderLineMoney, packCopyDiffs, parityCoverageGaps, parseParityArgs,
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
  assert.deepEqual(parseParityArgs([]), { beforeMigration: false, floors: {}, problems: [] });
  assert.deepEqual(parseParityArgs(), { beforeMigration: false, floors: {}, problems: [] });
  assert.deepEqual(parseParityArgs(['--before-migration', '--expect-min-lines=1202,445', '--expect-min-fingerprints=559,244']), {
    beforeMigration: true,
    floors: { quotationLines: 1202, salesOrderLines: 445, quotationFingerprints: 559, salesOrderFingerprints: 244 },
    problems: [],
  });
  for (const bad of ['--expect-min-lines', '--expect-min-lines=', '--expect-min-lines=12', '--expect-min-lines=1,2,3', '--expect-min-lines=a,b',
    '--expect-min-lines=-1,2', '--expect-min-lines=1.5,2', '--expect-min-fingerprints=1, 2', '--expect-min-lines=1,']) {
    const parsed = parseParityArgs([bad]);
    assert.equal(parsed.problems.length, 1, bad);
    assert.deepEqual(parsed.floors, {}, bad);
  }
  assert.deepEqual(parseParityArgs(['--force', 'x']).problems.length, 2);
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
  for (const args of [['--force'], ['--expect-min-lines=many']]) {
    const run = await runParityScript(parityDatabase(), args);
    assert.equal(run.status, 2, args.join(' '));
    assert.deepEqual(run.requests, []);
    assert.match(run.stderr, /ใช้ได้: --before-migration · --expect-min-lines=<QT>,<SO> · --expect-min-fingerprints=<QT>,<SO>/);
  }
});

test('สคริปต์ต่อสายด่านความครบ: นับจากสิ่งที่อ่าน/เทียบจริงทั้งเจ็ดหัวข้อ และออกด้วย exit 1 เมื่อมีจุดต่างหรือเทียบไม่ครบ', () => {
  for (const [key] of PARITY_COVERAGE) assert.match(SCRIPT, new RegExp(`\\b${key}: `), `สคริปต์ต้องส่ง ${key} ให้ด่านความครบ`);
  assert.match(SCRIPT, /const gaps = parityCoverageGaps\(counts, floors\);/);
  assert.match(SCRIPT, /if \(differences \|\| gaps\.length\) process\.exit\(1\);/);
  assert.ok(SCRIPT.indexOf('if (differences || gaps.length) process.exit(1);') < SCRIPT.indexOf("console.log('\\n✓ ไม่มีจุดต่าง"), 'ด่านอยู่ก่อนบรรทัดที่บอกว่าไม่มีจุดต่าง');
});
