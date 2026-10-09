import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { referencedOrderIds, relatedOrderRows } from './relatedOrders.js';
import { linePackQtyText } from '../sales/linePackView.js';
import { fmtNumber } from '../format.js';

const req = (over) => ({ id: 'DR-1', docNo: 'RQ-1', kind: 'scent_dev', status: 'acknowledged', ...over });

test('เอา id ใบสั่งขายที่ถูกอ้าง — ไม่ซ้ำ และข้ามใบที่ไม่ได้อ้าง', () => {
  const ids = referencedOrderIds([
    req({ salesOrderId: 'SOR-1' }),
    req({ id: 'DR-2', salesOrderId: 'SOR-1' }),
    req({ id: 'DR-3', salesOrderId: null }),
    req({ id: 'DR-4', salesOrderId: 'SOR-2' }),
  ]);
  assert.deepEqual(ids, ['SOR-1', 'SOR-2']);
  assert.deepEqual(referencedOrderIds(), []);
});

test('ใบเดียวถูกอ้างหลายคำร้อง = แถวเดียว คำร้องอยู่ในแถวนั้น', () => {
  const rows = relatedOrderRows({
    requests: [req({ salesOrderId: 'SOR-1' }), req({ id: 'DR-2', docNo: 'RQ-2', salesOrderId: 'SOR-1' })],
    orders: [{ id: 'SOR-1', orderNumber: 'SO-001', orderDate: '2026-08-01' }],
  });
  assert.equal(rows.length, 1);
  assert.deepEqual(rows[0].requests.map((r) => r.docNo), ['RQ-1', 'RQ-2']);
});

test('🐞 คำร้องที่ชี้ใบซึ่งถูกลบไปแล้ว ต้องไม่กลายเป็นแถวเปล่า', () => {
  const rows = relatedOrderRows({
    requests: [req({ salesOrderId: 'SOR-หาย' })],
    orders: [{ id: 'SOR-1', orderNumber: 'SO-001' }],
  });
  assert.deepEqual(rows, []);
});

test('บรรทัดสินค้าเข้าใบของตัวเอง เรียงตาม sortOrder', () => {
  const rows = relatedOrderRows({
    requests: [req({ salesOrderId: 'SOR-1' })],
    orders: [{ id: 'SOR-1', orderNumber: 'SO-001' }],
    lines: [
      { id: 'L2', salesOrderId: 'SOR-1', fgCode: 'FG-2', sortOrder: 2 },
      { id: 'L1', salesOrderId: 'SOR-1', fgCode: 'FG-1', sortOrder: 1 },
      { id: 'LX', salesOrderId: 'SOR-อื่น', fgCode: 'FG-9', sortOrder: 1 },
    ],
  });
  assert.deepEqual(rows[0].lines.map((l) => l.fgCode), ['FG-1', 'FG-2']);
});

test('ใบใหม่สุดขึ้นก่อน · ใบที่ไม่มีวันที่ไปท้าย ไม่ใช่หายไป', () => {
  const rows = relatedOrderRows({
    requests: [
      req({ salesOrderId: 'A' }), req({ id: 'DR-2', salesOrderId: 'B' }), req({ id: 'DR-3', salesOrderId: 'C' }),
    ],
    orders: [
      { id: 'A', orderDate: '2026-07-01' },
      { id: 'B', orderDate: '2026-08-20' },
      { id: 'C', orderDate: null },
    ],
  });
  assert.deepEqual(rows.map((r) => r.id), ['B', 'A', 'C']);
});

/* ── เลขแพ็คของบรรทัด (mig 0407 · งวด PR-2 · docs/qt-pack-column.md) ───────────────────────────────────
   RD อ่านบรรทัดของใบเพื่อรู้ว่าต้องได้ของเท่าไร — บรรทัด 2 แพ็ค × 12 เดือน ต้องไม่อ่านว่า "12 เดือน" */
const stripComments = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const PAGE = stripComments(readFileSync(new URL('../../app/rd/sales-orders/page.js', import.meta.url), 'utf8'));
const ROUTE = stripComments(readFileSync(new URL('../../app/api/rd/sales-orders/route.js', import.meta.url), 'utf8'));

test('0407 บรรทัดของใบพกเลขแพ็คถึงจอ: route เลือก packQty คู่กับ qty (ไม่มีราคา) · relatedOrderRows ส่งบรรทัดทั้งแถว', () => {
  const select = ROUTE.match(/from\('sales_order_lines'\)\s*\.select\('([^']*)'\)/)?.[1] || '';
  const columns = select.split(',').map((col) => col.trim().replace(/"/g, ''));
  assert.ok(columns.includes('qty') && columns.includes('packQty'), select);
  assert.doesNotMatch(select, /unitPrice|lineTotal|discount/, 'RD ไม่ได้ราคา — เลขแพ็คไม่ใช่ราคา');
  const rows = relatedOrderRows({
    requests: [req({ salesOrderId: 'SOR-1' })],
    orders: [{ id: 'SOR-1', orderNumber: 'SO-001' }],
    lines: [
      { id: 'L1', salesOrderId: 'SOR-1', fgCode: 'FG-364-02-001-1061', qty: 12, unit: 'เดือน', packQty: 2, sortOrder: 1 },
      { id: 'L2', salesOrderId: 'SOR-1', fgCode: 'FG-2', qty: 24, unit: 'ขวด', packQty: null, sortOrder: 2 },
    ],
  });
  assert.deepEqual(rows[0].lines.map((l) => l.packQty), [2, null]);
});

test('0407 ข้อความจำนวนบนจอ RD: บรรทัดที่มีเลขแพ็ค = “2 แพ็ค × 12 เดือน” · บรรทัดอื่นข้อความเดิมทุกตัวอักษร', () => {
  // จอเขียนนิพจน์เดิมไว้หลัง `??` ครบ (ตัวช่วยคืน null เมื่อไม่มีเลขแพ็ค)
  assert.match(PAGE, /\? ` · \$\{linePackQtyText\(row\.lines\[0\]\) \?\? `\$\{fmtNumber\(row\.lines\[0\]\.qty\)\} \$\{row\.lines\[0\]\.unit \|\| ""\}`\}`\.trimEnd\(\)/);
  assert.match(PAGE, /import \{ linePackQtyText \} from "@\/lib\/sales\/linePackView";/);
  // นิพจน์ของจอ ลอกมาทั้งรูป — เทียบกับนิพจน์ของวันนี้
  const shown = (line) => (line.qty != null ? ` · ${linePackQtyText(line) ?? `${fmtNumber(line.qty)} ${line.unit || ''}`}`.trimEnd() : '');
  const today = (line) => (line.qty != null ? ` · ${fmtNumber(line.qty)} ${line.unit || ''}`.trimEnd() : '');
  assert.equal(shown({ qty: 12, unit: 'เดือน', packQty: 2 }), ' · 2 แพ็ค × 12 เดือน');
  assert.equal(shown({ qty: 12, unit: 'กิโลกรัม', packQty: '43' }), ' · 43 แพ็ค × 12 เดือน');
  for (const line of [{ qty: 12, unit: 'เดือน' }, { qty: 1500, unit: 'ขวด' }, { qty: 3, unit: null }, { qty: null, unit: 'ขวด' }, { qty: 0, unit: '' }]) {
    for (const packQty of [undefined, null, '', 'abc', 0, 1.5, 10000]) {
      assert.equal(shown({ ...line, packQty }), today(line), `${JSON.stringify(line)} · packQty: ${String(packQty)}`);
    }
  }
  assert.equal(today({ qty: 12, unit: 'เดือน' }), ' · 12 เดือน');
  assert.equal(today({ qty: 3, unit: null }), ' · 3');
});

