// ── กฎเงินของบรรทัด: แพ็ค × จำนวน × ราคา แล้วหักส่วนลดรายการ (mig 0407 · docs/qt-pack-column.md) ─────────
//
// ไฟล์นี้มีสองชั้น
//  ① **ค่าทอง** — ยอดของบรรทัดหน้าตาแบบของจริงที่ **จับจากโค้ดก่อนแก้สูตร** (08/10 · รันเขียวบนต้นไม้ที่ยังไม่แก้)
//     บรรทัดที่ไม่มีเลขแพ็คต้องได้ค่าเดิมทุกบิต — ห้ามแก้ค่าให้เทสต์เขียว
//  ② **คู่เทียบ JS ↔ SQL** — ชุดตัวอย่างเดียวกับที่ไฟล์ 0407 ตรวจในตัว (quoteLinePackFixtures.json):
//     ทุกแถวผ่านสูตร JS แล้วได้ค่าที่จดไว้ และผ่านนิพจน์ของ CHECK (คิดแบบทศนิยมแท้) แล้วได้ผลรับ/ปฏิเสธที่จดไว้
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { quoteLineMoney, quoteLineNet, quoteTotals } from '../salesPlanning.js';
import { normalizeManualLines } from './quoteLines.js';
import { historicalLinesMoney, historicalServiceRpcArgs, planHistoricalServiceOrder } from './historicalOrderPlan.js';
import { checkRuleDiffs } from './linePackParity.js';
import { packFactorOf } from './linePacks.js';

const FIXTURES = JSON.parse(readFileSync(new URL('./quoteLinePackFixtures.json', import.meta.url), 'utf8'));

/* ═══ ① ค่าทอง ═══════════════════════════════════════════════════════════════════════════════════════ */

/* บรรทัดหน้าตาแบบของจริง: จำนวนเต็ม · ทศนิยม · ราคา 3 ตำแหน่ง · ส่วนลด % / บาท / เกินฐาน / ชนิดแปลก ·
   ค่าที่มาเป็นสตริงจากช่องกรอก · ยอดใหญ่ */
const GOLDEN_LINES = [
  { qty: 12, unitPrice: 3500 },
  { qty: 24, unitPrice: 3500, discountType: 'amount', discountValue: 14400 },
  { qty: 172, unitPrice: 2900 },
  { qty: 3, unitPrice: 33.33, discountType: 'percent', discountValue: 10 },
  { qty: 2, unitPrice: 105.005 },
  { qty: 1.5, unitPrice: 33.33 },
  { qty: 0.5, unitPrice: 0.03 },
  { qty: 3, unitPrice: 1234.56, discountType: 'percent', discountValue: 12.5 },
  { qty: 2, unitPrice: 500, discountType: 'percent', discountValue: 150 },
  { qty: 1, unitPrice: 100, discountType: 'amount', discountValue: 250 },
  { qty: '12', unitPrice: '3500.50' },
  { qty: '', unitPrice: 990 },
  { qty: 7, unitPrice: 0 },
  { qty: 1, unitPrice: 0.335 },
  { qty: 3, unitPrice: 1.005 },
  { qty: 2.5, unitPrice: 19.99, discountType: 'amount', discountValue: 0.01 },
  { qty: 9, unitPrice: 5800, discountType: 'amount', discountValue: 39150 },
  { qty: 2, unitPrice: 10, discountType: 'weird', discountValue: 4 },
  { qty: 1000000, unitPrice: 99999.99 },
  { qty: 3, unitPrice: 33.335 },
];
/* [ยอดก่อนลด, ส่วนลด, ยอดสุทธิ] ของ quoteLineNet — จับก่อนแก้สูตร */
const GOLDEN_NET = [
  [42000, 0, 42000], [84000, 14400, 69600], [498800, 0, 498800], [99.99, 10, 89.99], [210.01, 0, 210.01],
  [50, 0, 50], [0.02, 0, 0.02], [3703.68, 462.96, 3240.72], [1000, 1000, 0], [100, 100, 0],
  [42006, 0, 42006], [990, 0, 990], [0, 0, 0], [0.34, 0, 0.34], [3.01, 0, 3.01],
  [49.97, 0.01, 49.96], [52200, 39150, 13050], [20, 4, 16], [99999990000, 0, 99999990000], [100.01, 0, 100.01],
];
/* [ชนิดส่วนลดที่บันทึก, ค่าที่บันทึก] ของ quoteLineMoney — % เกิน 100 ตัดเหลือ 100 · ชนิดแปลก = ไม่ลด */
const GOLDEN_SAVED_DISCOUNT = [
  [null, 0], ['amount', 14400], [null, 0], ['percent', 10], [null, 0], [null, 0], [null, 0], ['percent', 12.5],
  ['percent', 100], ['amount', 250], [null, 0], [null, 0], [null, 0], [null, 0], [null, 0], ['amount', 0.01],
  ['amount', 39150], [null, 0], [null, 0], [null, 0],
];
const GOLDEN_TOTALS_VAT7 = { subtotal: 100000660206.06, discountAmount: 900, vatAmount: 7000046151.42, totalAmount: 107000705457.48 };
const GOLDEN_TOTALS_VAT0 = { subtotal: 100000660206.06, discountAmount: 2500016505.15, vatAmount: 0, totalAmount: 97500643700.91 };
/* ใบย้อนหลังคิดชนิดส่วนลดที่ไม่รู้จักเป็น "ไม่ลด" ทั้งในบรรทัดและยอดรวม ⇒ ต่างจาก quoteTotals ตรงบรรทัดชนิดแปลก (4 บาท) */
const GOLDEN_HISTORICAL = { subtotal: 100000660210.06, discountAmount: 900, vatAmount: 7000046151.7, totalAmount: 107000705461.76 };

const netOf = (n) => [n.gross, n.discountAmount, n.lineTotal];
/* ค่าที่ "ไม่ใช่เลขแพ็ค" — สิ่งที่ select * คืนหลังรัน 0407 (null) และช่องที่ยังไม่ได้พิมพ์ */
const NOT_A_PACK = [null, undefined, '', '   '];

test('ค่าทอง: quoteLineNet ของบรรทัดที่ไม่มีเลขแพ็ค = ค่าที่จับไว้ก่อนแก้สูตร ทุกบรรทัด', () => {
  assert.deepEqual(GOLDEN_LINES.map((l) => netOf(quoteLineNet(l))), GOLDEN_NET);
});

test('ค่าทอง: quoteLineMoney คืนห้าคีย์เดิม (ไม่มีคีย์เลขแพ็ค) และค่าเดิม', () => {
  GOLDEN_LINES.forEach((line, i) => {
    const m = quoteLineMoney(line);
    assert.deepEqual(Object.keys(m), ['discountType', 'discountValue', 'gross', 'discountAmount', 'lineTotal'], `บรรทัด ${i + 1}`);
    assert.deepEqual([m.discountType, m.discountValue], GOLDEN_SAVED_DISCOUNT[i], `บรรทัด ${i + 1}`);
    // ชนิดแปลกถูกทิ้งก่อนคิดเงิน ⇒ บรรทัดนั้นไม่ลด (quoteLineNet ตรง ๆ ยังนับเป็นบาท — ค่าทองข้างบน)
    const expected = line.discountType === 'weird' ? [20, 0, 20] : GOLDEN_NET[i];
    assert.deepEqual(netOf(m), expected, `บรรทัด ${i + 1}`);
  });
});

test('ค่าทอง: quoteTotals (ส่วนลดท้ายใบ + VAT) และยอดของใบย้อนหลัง = ค่าที่จับไว้ก่อนแก้สูตร', () => {
  assert.deepEqual(quoteTotals(GOLDEN_LINES, { discountType: 'amount', discountValue: 900, vatRate: 7 }), GOLDEN_TOTALS_VAT7);
  assert.deepEqual(quoteTotals(GOLDEN_LINES, { discountType: 'percent', discountValue: 2.5, vatRate: 0 }), GOLDEN_TOTALS_VAT0);
  const { lines, ...totals } = historicalLinesMoney(GOLDEN_LINES, 7, { discountType: 'amount', discountValue: 900 });
  assert.deepEqual(totals, GOLDEN_HISTORICAL);
  assert.deepEqual(lines, GOLDEN_LINES.map((l) => quoteLineMoney(l)));
});

test('ค่าทอง: normalizeManualLines ของบรรทัดที่ไม่มีเลขแพ็ค — คีย์ชุดเดิมลำดับเดิม ยอดเดิม', () => {
  const KEYS = ['id', 'productId', 'fgCode', 'description', 'qty', 'unit', 'unitPrice', 'discountType', 'discountValue',
    'discountAmount', 'lineTotal', 'source', 'sortOrder', 'metadata'];
  const input = GOLDEN_LINES.map((l, i) => ({ ...l, description: `บรรทัด ${i + 1}`, unit: 'เดือน', metadata: { k: i } }));
  const out = normalizeManualLines(input);
  assert.equal(out.length, GOLDEN_LINES.length);
  out.forEach((line, i) => {
    assert.deepEqual(Object.keys(line), KEYS, `บรรทัด ${i + 1}`);
    const expected = GOLDEN_LINES[i].discountType === 'weird' ? [0, 20] : [GOLDEN_NET[i][1], GOLDEN_NET[i][2]];
    assert.deepEqual([line.discountAmount, line.lineTotal], expected, `บรรทัด ${i + 1}`);
    assert.deepEqual([line.discountType, line.discountValue], GOLDEN_SAVED_DISCOUNT[i], `บรรทัด ${i + 1}`);
    assert.equal(line.unit, 'เดือน', 'หน่วยที่คนเลือกไว้ไม่ถูกแตะ');
    assert.deepEqual(line.metadata, { k: i });
    assert.equal(line.sortOrder, i);
  });
});

test('ค่าทอง: คีย์ packQty ที่ไม่มีเลขแพ็ค (null · undefined · ว่าง) ไม่ขยับยอดสักบิต', () => {
  for (const value of NOT_A_PACK) {
    const withKey = GOLDEN_LINES.map((l) => ({ ...l, packQty: value }));
    assert.deepEqual(withKey.map((l) => netOf(quoteLineNet(l))), GOLDEN_NET);
    assert.deepEqual(quoteTotals(withKey, { discountType: 'amount', discountValue: 900, vatRate: 7 }), GOLDEN_TOTALS_VAT7);
    const { lines: _lines, ...totals } = historicalLinesMoney(withKey, 7, { discountType: 'amount', discountValue: 900 });
    assert.deepEqual(totals, GOLDEN_HISTORICAL);
  }
});

/* ═══ ② คู่เทียบ JS ↔ SQL — ชุดตัวอย่างเดียวกับ §3 ของไฟล์ 0407 ═══════════════════════════════════════════ */

const SQL_RULE = 'abs("lineTotal" - (round(COALESCE("packQty", 1) * qty * "unitPrice", 2) - COALESCE("discountAmount", 0))) <= 0.01';

test('ชุดตัวอย่าง: นิพจน์ของ CHECK ในไฟล์ JSON คือสูตรที่ตัวเทียบฝั่ง JS เลียนแบบ · จำนวนแถวตามแผน (20 + 9 + 19)', () => {
  assert.equal(FIXTURES.checkExpression, SQL_RULE);
  assert.deepEqual([FIXTURES.rule.length, FIXTURES.stored.length, FIXTURES.typing.length], [20, 9, 19]);
  const ids = [...FIXTURES.rule, ...FIXTURES.stored].map((row) => row.id);
  assert.equal(new Set(ids).size, ids.length, 'รหัสแถวไม่ซ้ำ');
});

test('⭐ ทุกแถว rule: quoteLineNet และ quoteLineMoney ได้ยอดก่อนลด · ส่วนลด · ยอดสุทธิ · ค่าส่วนลดที่บันทึก ตามที่จดไว้', () => {
  for (const row of FIXTURES.rule) {
    const input = { packQty: row.packQty, qty: row.qty, unitPrice: row.unitPrice, discountType: row.discountType, discountValue: row.discountValue };
    const money = quoteLineMoney(input);
    assert.deepEqual(netOf(money), [row.gross, row.discountAmount, row.lineTotal], `quoteLineMoney ${row.id}`);
    assert.equal(money.discountValue, row.savedDiscountValue, `ค่าส่วนลดที่บันทึก ${row.id}`);
    assert.equal(money.discountType, row.discountType, `ชนิดส่วนลด ${row.id}`);
    assert.deepEqual(Object.keys(money), ['discountType', 'discountValue', 'gross', 'discountAmount', 'lineTotal'], 'ไม่คืนคีย์เลขแพ็ค');
    // quoteLineNet รับค่าส่วนลดที่บันทึกได้จริง (หลังตัด % เกิน 100) — ตัวที่จอและยอดหัวใบเรียก
    const net = quoteLineNet({ ...input, discountValue: row.savedDiscountValue });
    assert.deepEqual(netOf(net), [row.gross, row.discountAmount, row.lineTotal], `quoteLineNet ${row.id}`);
    // เลขแพ็คที่มาเป็นสตริงจากช่องกรอกคิดเท่ากับตัวเลข
    if (row.packQty !== null) {
      assert.deepEqual(netOf(quoteLineNet({ ...input, packQty: String(row.packQty), discountValue: row.savedDiscountValue })), netOf(net), `สตริง ${row.id}`);
    }
  }
});

test('⭐ ตัวอย่างของเจ้าของ: 2 แพ็ค × 12 เดือน × 3,500 = 84,000 · ส่วนลดเป็นบาทหักจากยอดทั้งรายการ ไม่คูณจำนวนแพ็ค (มติ A1 · A5)', () => {
  assert.deepEqual(quoteLineNet({ packQty: 2, qty: 12, unitPrice: 3500 }), { gross: 84000, discountAmount: 0, lineTotal: 84000 });
  assert.deepEqual(quoteLineNet({ packQty: 2, qty: 12, unitPrice: 3500, discountType: 'amount', discountValue: 14400 }),
    { gross: 84000, discountAmount: 14400, lineTotal: 69600 });
  // คีย์แบบเดิม (จำนวน 24) กับแบบใหม่ (2 × 12) = เงินเท่ากันทุกสตางค์ — ใบเก่าที่ถูกแยกใหม่ตอนแก้/ออก Rev. ยอดไม่ขยับ (มติ A4)
  assert.deepEqual(quoteLineNet({ packQty: 2, qty: 12, unitPrice: 3500 }), quoteLineNet({ qty: 24, unitPrice: 3500 }));
  assert.deepEqual(quoteLineNet({ packQty: 43, qty: 4, unitPrice: 2900 }), quoteLineNet({ qty: 172, unitPrice: 2900 }));
  // ยอดรวมของใบเดินตามบรรทัด
  assert.deepEqual(
    quoteTotals([{ packQty: 2, qty: 12, unitPrice: 3500 }, { qty: 1, unitPrice: 1000 }], { vatRate: 7 }),
    { subtotal: 85000, discountAmount: 0, vatAmount: 5950, totalAmount: 90950 },
  );
});

test('⭐ ปัดสตางค์ครั้งเดียวหลังคูณครบสามตัว — ไม่ปัดต่อหน่วยแล้วคูณ (3 × 1.5 × 33.33 = 149.98 ไม่ใช่ 3 × 50.00)', () => {
  assert.equal(quoteLineNet({ packQty: 3, qty: 1.5, unitPrice: 33.33 }).gross, 149.98);
  assert.equal(quoteLineNet({ qty: 1.5, unitPrice: 33.33 }).gross, 50);
  assert.notEqual(quoteLineNet({ packQty: 3, qty: 1.5, unitPrice: 33.33 }).gross, 3 * quoteLineNet({ qty: 1.5, unitPrice: 33.33 }).gross);
  assert.equal(quoteLineNet({ packQty: 30, qty: 1.5, unitPrice: 33.33 }).gross, 1499.85);
});

test('⭐ JS ↔ SQL: ยอดที่ JS คิดจากทุกแถว rule ผ่าน CHECK · แถวครึ่งสตางค์ต่างจากฐานไม่เกิน 0.01 (เหตุที่ CHECK มีค่าคลาด)', () => {
  const asStored = FIXTURES.rule.map((row) => {
    const money = quoteLineMoney({ packQty: row.packQty, qty: row.qty, unitPrice: row.unitPrice, discountType: row.discountType, discountValue: row.discountValue });
    return { id: row.id, packQty: row.packQty, qty: row.qty, unitPrice: row.unitPrice, discountAmount: money.discountAmount, lineTotal: money.lineTotal };
  });
  const result = checkRuleDiffs(asStored);
  assert.deepEqual(result.refused, [], 'ไม่มีแถวไหนที่ JS คิดแล้วฐานปฏิเสธ');
  assert.deepEqual(result.unreadable, []);
  // แถวที่จดไว้ว่าฐานคิดยอดก่อนลดต่างจาก JS (sqlGross) = แถวที่ผ่านด้วยค่าคลาด และมีแค่แถวพวกนั้น
  const expectedInexact = FIXTURES.rule.filter((row) => row.sqlGross !== undefined && row.sqlGross !== row.gross).map((row) => row.id);
  assert.ok(expectedInexact.includes('I-half-satang-pack'));
  assert.deepEqual(result.inexact.map((entry) => entry.id).sort(), [...expectedInexact].sort());
  for (const entry of result.inexact) assert.ok(Math.abs(entry.expected - entry.stored) < 0.0100001, `${entry.id} ต่างไม่เกิน 1 สตางค์`);
});

test('⭐ JS ↔ SQL: ทุกแถว stored ได้ผลรับ/ปฏิเสธตามที่จดไว้ — ลืมตัวคูณ = ปฏิเสธ · เลขแพ็ค 1 ที่หาย = ผ่าน (จุดบอดที่จดไว้)', () => {
  const { refused, unreadable } = checkRuleDiffs(FIXTURES.stored);
  assert.deepEqual(unreadable, []);
  const refusedIds = new Set(refused.map((entry) => entry.id));
  for (const row of FIXTURES.stored) {
    assert.equal(!refusedIds.has(row.id), row.ok, `${row.id}: ${row.note}`);
  }
  assert.equal(refusedIds.has('X-forgot-multiplier'), true);
  assert.equal(refusedIds.has('X-multiplied-no-pack'), true);
  assert.equal(refusedIds.has('X-pack1-lost'), false, 'จุดบอด: CHECK มองไม่เห็นเลขแพ็ค 1 ที่หาย — ยามทางก๊อปกับสคริปต์เทียบเป็นคนเห็น');
  assert.deepEqual([...refusedIds].sort(), FIXTURES.stored.filter((row) => !row.ok).map((row) => row.id).sort());
});

test('ทุกแถว typing: ช่องว่างและค่าที่ใช้ไม่ได้คิดเป็น ×1 · ค่าที่ใช้ได้คิดตามตัวคูณ — ไม่มีวันเป็น ×0 หรือเศษส่วน', () => {
  for (const row of FIXTURES.typing) {
    const net = quoteLineNet({ packQty: row.raw, qty: 12, unitPrice: 3500 });
    assert.equal(net.gross, row.factor * 42000, `packQty=${JSON.stringify(row.raw)}`);
    assert.equal(packFactorOf(row.raw), row.factor);
  }
  // 🪤 toMoney('0', 1) = 0 และ toMoney('1.5', 1) = 1.5 — ถ้าสูตรใช้ toMoney กับเลขแพ็ค สองแถวนี้จะได้ 0 กับ 63,000
  assert.equal(quoteLineNet({ packQty: '0', qty: 12, unitPrice: 3500 }).gross, 42000);
  assert.equal(quoteLineNet({ packQty: '1.5', qty: 12, unitPrice: 3500 }).gross, 42000);
});

test('คีย์ชื่อคล้าย (packsPerRound · packs ของงานบริการ) ไม่ใช่ตัวคูณเงิน — มีแต่ packQty ที่คูณ', () => {
  const base = quoteLineNet({ qty: 12, unitPrice: 3500 });
  assert.deepEqual(quoteLineNet({ qty: 12, unitPrice: 3500, packsPerRound: 2, packs: 2, serviceRounds: 12 }), base);
  assert.deepEqual(quoteLineMoney({ qty: 12, unitPrice: 3500, packsPerRound: 2, packs: 2 }), quoteLineMoney({ qty: 12, unitPrice: 3500 }));
  const rows = [{ qty: 12, unitPrice: 3500, packsPerRound: 2, packs: 2 }];
  assert.deepEqual(historicalLinesMoney(rows, 7), historicalLinesMoney([{ qty: 12, unitPrice: 3500 }], 7));
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-5 · มติเจ้าของ 23/09 "ต้องไม่ควรแตกต่างจาก form ใบเสนอราคา" + 08/10 ข้อ A1–A2 · ข้อวินิจฉัย 7 ·
   แผน IMPL_PLAN_PR5 §5 แถว G6): เดิม `historicalLinesMoney` **ไม่อ่าน** `packQty` (แถวที่มีคีย์หลงมาได้ยอดเท่ากับไม่มีคีย์) — วันนี้เลขแพ็คของบรรทัด
   เป็นตัวคูณของยอดก่อนลด เหมือนสูตรกลางของใบเสนอราคา · ไม่ได้คลายด่าน: ความจริงเดิมยังอยู่ครบเป็นกรณีของมันเอง — แถวที่ **ไม่มีคีย์** ได้อ็อบเจกต์
   เดิมทุกช่อง · ค่าที่ไม่ใช่เลขแพ็ค (ว่าง · null · "0" · "1.5" · 10000) = คูณ 1 · `packsPerRound` อย่างเดียวไม่คูณอะไร · และข้อที่เข้มขึ้น:
   บรรทัดกับยอดรวมต้องคูณ **ตัวเดียวกัน** (ส่งเลขแพ็คเข้าข้างเดียว = บรรทัดกับยอดรวมพูดคนละเลข) */
test('🔴 ใบสั่งขายย้อนหลัง (งวด PR-5): historicalLinesMoney คูณเลขแพ็คของบรรทัด — บรรทัดและยอดรวมคูณตัวเดียวกัน · ไม่มีคีย์ / ค่าที่ไม่ใช่เลขแพ็ค = ผลเดิม', () => {
  const plain = [{ qty: 12, unitPrice: 3500, discountType: 'amount', discountValue: 1000 }, { qty: 3, unitPrice: 33.33 }];
  const header = { discountType: 'percent', discountValue: 10 };
  const expected = historicalLinesMoney(plain, 7, header);
  assert.equal(expected.lines[0].lineTotal, 41000, 'ไม่มีเลขแพ็ค: 12 × 3,500 − 1,000 (ค่าที่ตรึงไว้เดิม)');

  // เลขแพ็ค 2 บนบรรทัดแรก: 2 × 12 × 3,500 − 1,000 = 83,000 (ส่วนลดบาทไม่คูณแพ็ค — มติ A5) · ยอดรวม / VAT / ยอดทั้งสิ้นตามไปด้วย
  const packed = [{ ...plain[0], packQty: 2 }, plain[1]];
  const got = historicalLinesMoney(packed, 7, header);
  assert.equal(got.lines[0].lineTotal, 83000);
  assert.equal(got.lines[0].gross, 84000);
  assert.equal(got.lines[1].lineTotal, expected.lines[1].lineTotal, 'บรรทัดที่ไม่มีเลขแพ็คไม่ขยับ');
  // บรรทัดกับยอดรวมพูดเลขเดียวกันเสมอ (สูตรกลาง quoteTotals บนแถวชุดเดียวกัน)
  assert.equal(got.subtotal, Math.round(got.lines.reduce((sum, line) => sum + line.lineTotal, 0) * 100) / 100);
  assert.deepEqual(
    { subtotal: got.subtotal, discountAmount: got.discountAmount, vatAmount: got.vatAmount, totalAmount: got.totalAmount },
    quoteTotals(packed, { vatRate: 7, ...header }),
  );
  assert.deepEqual([got.subtotal, got.discountAmount, got.vatAmount, got.totalAmount], [83099.99, 8310, 5235.3, 80025.29]);
  assert.notDeepEqual(got, expected);
  // สตริงจากช่องกรอกก็คูณ (ตัวอ่านกลาง packFactorOf)
  assert.deepEqual(historicalLinesMoney([{ ...plain[0], packQty: '2' }, plain[1]], 7, header), got);
  // ตัวคืนค่าไม่พกคีย์ packQty (ห้าคีย์เดิมของ quoteLineMoney) — ผู้เรียกเป็นคนถือเลขแพ็คของบรรทัดเอง
  assert.deepEqual(Object.keys(got.lines[0]).sort(), ['discountAmount', 'discountType', 'discountValue', 'gross', 'lineTotal']);

  /* ความจริงเดิมที่ยังอยู่: ค่าที่ไม่ใช่เลขแพ็ค = คูณ 1 = ผลของแถวที่ไม่มีคีย์ ทั้งบรรทัดและยอดรวม */
  for (const notPack of ['', '   ', null, undefined, '0', '1.5', 10000, 0, 'abc', true]) {
    const rows = plain.map((row) => ({ ...row, packQty: notPack }));
    assert.deepEqual(historicalLinesMoney(rows, 7, header), expected, `packQty=${JSON.stringify(notPack)}`);
  }
  /* แพ็คต่อรอบของงานบริการอย่างเดียวไม่เปลี่ยนอะไร — และไม่ถูกอ่านแม้อยู่คู่กับเลขแพ็ค */
  assert.deepEqual(historicalLinesMoney(plain.map((row) => ({ ...row, packsPerRound: 2 })), 7, header), expected);
  assert.deepEqual(historicalLinesMoney(packed.map((row) => ({ ...row, packsPerRound: 7 })), 7, header), got);
  assert.deepEqual(historicalLinesMoney([null, undefined, {}], 0).lines, [quoteLineMoney({}), quoteLineMoney({}), quoteLineMoney({})]);
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-5 · มติเจ้าของ 23/09 + 08/10 ข้อ A1–A2 · ข้อวินิจฉัย 6–7 · แผน IMPL_PLAN_PR5 §5 แถว G7): เดิมแถวโซนที่มี
   `packQty` หลงมา **ไม่ไปถึง** บรรทัดของแผนและอาร์กิวเมนต์ RPC (ตัวเขียนของฐานเขียน NULL) — วันนี้เลขแพ็คเป็นช่องบังคับของฟอร์ม: ไปถึงบรรทัดของแผน
   เป็นตัวเลข · คูณยอด · ไปถึง `p_lines` เป็นตัวเลขพร้อมหน่วยที่เก็บ "เดือน" (ตัวเขียนของ 0409 เก็บลงคอลัมน์) · ไม่ได้คลายด่าน: ยอดเดิมของเทสต์
   (12 × 1,200 = 14,400) ยังตรึงอยู่เป็นกรณีเลขแพ็ค 1 · แถวที่ **ไม่มีคีย์** ไม่ได้ถูกคิดแบบคูณ 1 อีกแล้ว — ถูกตีกลับ (เข้มขึ้น) */
test('🔴 แผนใบสั่งขายย้อนหลัง (งวด PR-5): เลขแพ็คของแถวโซนไปถึงบรรทัดของแผนและอาร์กิวเมนต์ RPC เป็นตัวเลข และคูณยอด · ไม่มีคีย์ = ตีกลับ ไม่ใช่คูณ 1', () => {
  const customer = { id: 'CUS-1', name: 'บจก. ตัวอย่าง', approvalStatus: 'approved', isActive: true };
  const product = { id: 'P-PKG', fgCode: 'FG-SNS-02-001-0012', productDescription: 'แพ็คเกจกลิ่นรายเดือน', saleUnit: 'แพ็คเกจ', costPrice: 1200 };
  const ctx = {
    actor: { id: 'U-1', role: 'ae', team: 'SV', teams: ['SV'] },
    customer,
    owner: { ok: true, ownerId: 'U-1', ownerName: 'ผู้ขาย', team: 'SV', teams: ['SV'] },
    products: [product],
    zones: [{ id: 'Z-1', siteId: 'ST-1', name: 'ล็อบบี้', isActive: true }],
    sites: [{ id: 'ST-1', code: 'ST-1', name: 'สาขาหนึ่ง', customerId: 'CUS-1', kind: 'customer', isActive: true }],
    containerDeals: [], existingHistorical: [], liveTermsByZone: null, todayIso: '2026-09-22', selfOrderId: null,
  };
  const input = (zoneExtra, openingAmount = 14400) => ({
    customerId: 'CUS-1', ownerId: 'U-1',
    contract: { docKind: 'customer_po', ref: 'PO-1', startDate: '2026-01-01', endDate: '2026-12-31' },
    refs: { quote: null, express: null, invoice: 'IV-1' },
    vatRate: 0, notes: null,
    zones: [{ zoneId: 'Z-1', productId: 'P-PKG', qty: 12, discountType: null, discountValue: 0, rounds: 12, packsPerRound: 2, ...zoneExtra }],
    opening: { amount: openingAmount, coversTo: '2026-12-31', paidOn: '2026-09-15', note: 'เก็บครบแล้ว' },
    installments: [],
  });
  // ความจริงเดิม (ยอดที่ตรึงไว้): เลขแพ็ค 1 = 12 × 1,200 = 14,400 ทุกสตางค์
  const one = planHistoricalServiceOrder(input({ packQty: 1 }), ctx);
  assert.deepEqual(one.errors, [], 'แผนต้องผ่านครบ ไม่งั้นข้อข้างล่างไม่ได้พิสูจน์อะไร');
  assert.equal(one.lines.length, 1);
  assert.deepEqual([one.lines[0].packQty, one.lines[0].lineTotal, one.header.subtotal], [1, 14400, 14400]);

  // เลขแพ็ค 2: 2 × 12 × 1,200 = 28,800 — บรรทัดของแผน · หัวใบ · อาร์กิวเมนต์ของฐาน
  const two = planHistoricalServiceOrder(input({ packQty: 2 }, 28800), ctx);
  assert.deepEqual(two.errors, []);
  assert.equal(two.lines[0].packQty, 2);
  assert.equal(two.lines[0].lineTotal, 28800);
  assert.deepEqual([two.header.subtotal, two.header.totalAmount], [28800, 28800]);
  assert.equal(two.lines[0].unit, 'แพ็คเกจ', 'หน่วยของบรรทัดในแผน = หน่วยขายของทะเบียน (D6 — เปลี่ยน = ลิสต์สินค้าของจอถูกโหลดใหม่ทุกครั้งที่ตรวจ)');
  const args = historicalServiceRpcArgs(two);
  assert.ok(Array.isArray(args.p_lines) && args.p_lines.length === 1);
  assert.equal(args.p_lines[0].packQty, 2);
  assert.equal(typeof args.p_lines[0].packQty, 'number', 'ฐานรับเฉพาะ JSON number (0409/H1 · W0)');
  assert.equal(args.p_lines[0].unit, 'เดือน', 'หน่วยที่เก็บของบรรทัดที่มีเลขแพ็ค (ข้อวินิจฉัย 6)');
  assert.equal(args.p_lines[0].lineTotal, 28800);
  // ช่องกรอกส่งข้อความ "2" — แผนทำเป็นตัวเลขก่อนส่งฐาน
  const typed = planHistoricalServiceOrder(input({ packQty: '2' }, 28800), ctx);
  assert.deepEqual(typed.lines, two.lines);
  assert.equal(typeof historicalServiceRpcArgs(typed).p_lines[0].packQty, 'number');

  // แพ็คต่อรอบของงานบริการ (packsPerRound 2) ไม่ใช่ตัวคูณ — เปลี่ยนเป็น 7 ยอดเท่าเดิม
  assert.equal(planHistoricalServiceOrder(input({ packQty: 2, packsPerRound: 7 }, 28800), ctx).lines[0].lineTotal, 28800);

  // เข้มขึ้น: แถวที่ไม่มีคีย์เลขแพ็ค (ฟอร์มรุ่นก่อน) ไม่ถูกคิดแบบคูณ 1 — ตีกลับที่ช่องของมัน และไม่มียอด
  const missing = planHistoricalServiceOrder(input({}), ctx);
  assert.deepEqual(missing.errors.filter((e) => e.field === 'zones.0.packQty').length, 1);
  assert.deepEqual([missing.lines[0].packQty, missing.lines[0].lineTotal, missing.header.subtotal], [null, 0, 0]);
});

test('บรรทัดที่ไม่มีเลขแพ็ค (และเลขแพ็ค 1) ได้ยอดก่อนลดเท่ากับ round2(จำนวน × ราคา) ทุกบิต — ตารางทศนิยมที่ floating point เพี้ยนง่าย', () => {
  const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
  const QTYS = [1, 2, 3, 7, 12, 24, 172, 0.5, 1.5, 2.5, 0.1, 0.3, 1.1, 33.3333, 1000000];
  const PRICES = [0, 0.01, 0.03, 0.335, 1.005, 1.115, 19.99, 33.33, 33.335, 105.005, 1234.56, 2900, 3500, 99999.99, 0.1 + 0.2];
  let checked = 0;
  for (const qty of QTYS) {
    for (const unitPrice of PRICES) {
      const expected = round2(qty * unitPrice);
      for (const packQty of [undefined, null, '', 1, '1']) {
        const gross = quoteLineNet({ qty, unitPrice, packQty }).gross;
        assert.ok(Object.is(gross, expected), `qty ${qty} × ${unitPrice} (packQty ${String(packQty)}): ${gross} ≠ ${expected}`);
        checked += 1;
      }
      assert.ok(Object.is(quoteLineNet({ qty, unitPrice }).gross, expected));
    }
  }
  assert.equal(checked, QTYS.length * PRICES.length * 5);
});
