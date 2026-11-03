// มติเจ้าของ 03/11/2026 V20–V23: ตารางยื่นชำระของ RA แบบตารางเดิม (แถวละสินค้า จัดกลุ่มตาม SO · วันที่ส่งของ · รายเดือน)
// + วันที่ส่งของของ SO ค่าสรรพสามิต SA ใส่ตอนยื่น แล้วเขียนกลับ SO ต้นทาง (หลายรอบ = รอบล่าสุด)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filingDeliveryDate, filingMonthKey, filingTableBlockers, filingTableLine, loadRaFilingTable, retailPriceExVat, volumeText,
} from './raFilingTable.js';
import { filingDateText, filingMonthLabel } from './raFilingMonth.js';
import { EXCISE_DELIVERY_DATE_TEXT, exciseDeliveryDateBlocker, syncSourceDeliveryDate } from './exciseDeliveryDate.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('แถวสินค้า: แบรนด์ · ชื่อ · ปริมาณ "50 ML" · ราคาขายปลีกก่อน VAT (มีแต่ราคารวม VAT = ถอด 7%) · ภาษี', () => {
  assert.equal(volumeText({ volume: 50, volumeUnit: 'ml' }), '50 ML');
  assert.equal(volumeText({ volume: 0 }), '');
  assert.equal(retailPriceExVat({ retailPriceExVat: 1112.15 }), 1112.15);
  assert.equal(retailPriceExVat({ retailPriceExVat: 0, retailPriceIncVat: 107 }), 100);
  assert.equal(retailPriceExVat({}), null);
  const line = filingTableLine({ fgCode: 'FG-1-01-002-1', brandName: '', brandNameEn: 'COZE', productName: 'GOLDEN HOUR EDP', volume: 30, volumeUnit: 'ml', retailPriceExVat: 167.29 },
    { quantity: 5040, totalTax: 1234.567 });
  assert.deepEqual(line, {
    fgCode: 'FG-1-01-002-1', brand: 'COZE', description: line.description, volume: '30 ML', quantity: 5040, retailPriceExVat: 167.29, totalTax: 1234.57,
  });
  assert.ok(line.description, 'ชื่อสินค้าจาก productDisplayName');
  assert.equal(filingTableLine(null, { fgCode: 'FG-X', description: 'ของพิมพ์เอง', quantity: 2 }).description, 'ของพิมพ์เอง');
});

test('วันที่ส่งของ: SO ค่าสรรพสามิต → SO ต้นทาง → ไม่มี = "PO มาวันที่" (วันที่ของ SO ต้นทาง) · เดือนตามวันนั้น', () => {
  assert.deepEqual(filingDeliveryDate({ exciseOrder: { deliveryDueDate: '2026-10-15' }, salesOrder: { deliveryDueDate: '2026-10-20', orderDate: '2026-10-01' } }),
    { date: '2026-10-15', kind: 'delivery' });
  assert.deepEqual(filingDeliveryDate({ exciseOrder: { deliveryDueDate: null }, salesOrder: { deliveryDueDate: '2026-10-20' } }), { date: '2026-10-20', kind: 'delivery' });
  assert.deepEqual(filingDeliveryDate({ salesOrder: { orderDate: '2026-10-22T03:00:00Z' } }), { date: '2026-10-22', kind: 'po' });
  assert.deepEqual(filingDeliveryDate({}), { date: null, kind: null });
  assert.equal(filingMonthKey({ date: '2026-10-22' }), '2026-10');
  assert.deepEqual(filingMonthLabel('2026-10'), { short: 'M.10/69', long: 'ต.ค. 2569' });
  assert.match(filingDateText({ deliveryDate: '2026-10-22', deliveryKind: 'po' }), /^PO มาวันที่ /);
  assert.doesNotMatch(filingDateText({ deliveryDate: '2026-10-22', deliveryKind: 'delivery' }), /PO/);
});

test('ไม่มีคอลัมน์สถานะทะเบียน (V20) — ขาดทะเบียน/ราคาบอกที่หัวกลุ่ม', () => {
  assert.deepEqual(filingTableBlockers([{ needsRegistration: true }, { needsRegistration: true, taxBaseMissing: true }, {}]), [
    'ยังไม่มีทะเบียน 2 รายการ — เริ่มยื่นไม่ได้', 'ไม่มีราคาขายปลีก 1 รายการ (ภาษี ฿0)',
  ]);
  const table = read('../../components/excise/FilingLinesTable.js');
  assert.match(table, /const COLUMNS = \["วันที่ส่งของ", "แบรนด์", "รายการ", "ปริมาณ", "จำนวน", "ราคาขายปลีกก่อน VAT", "ภาษี", "สถานะชำระ"\];/);
  assert.doesNotMatch(table.match(/const COLUMNS = \[[^\]]*\]/)[0], /ทะเบียน/, 'ไม่มีคอลัมน์ทะเบียน');
});

// ฐานจำลองแบบเล็ก (อ่านอย่างเดียว) — กรอง in · ไม่มีวันแตะฐานจริง
function fakeDb(tables) {
  const run = (q) => ({ data: (tables[q.table] || []).filter((row) => q.filters.every(([column, value]) => value.includes(row[column]))), error: null });
  return {
    from: (table) => {
      const q = { table, filters: [] };
      const builder = {
        select: () => builder, order: () => builder, range: () => builder,
        in: (column, value) => { q.filters.push([column, value]); return builder; },
        then: (resolve, reject) => Promise.resolve(run(q)).then(resolve, reject),
      };
      return builder;
    },
  };
}

test('ตัวโหลด: คิวที่พร้อม = รายการสดจาก SO · กำลังมา = ไม่มีรายการ · บันทึก = รายการที่ตรึง · คีย์ตรงกับแถวงานของหน้า', async () => {
  const db = fakeDb({
    orders: [{ id: 'ORD-1', salesOrderId: 'SO-B', exciseSalesOrderId: 'SO-EB', items: [{ quantity: 600, totalTax: 50, product: { fgCode: 'FG-2', productName: 'Rosé', brandName: 'Scent Studio', volume: 50, volumeUnit: 'ml', retailPriceExVat: 1112.15 } }] }],
    sales_orders: [
      { id: 'SO-B', deliveryDueDate: null, orderDate: '2026-10-01' },
      { id: 'SO-EB', deliveryDueDate: '2026-10-15', orderDate: '2026-10-10' },
      { id: 'SO-U', deliveryDueDate: null, orderDate: '2026-10-22' },
    ],
    products: [{ id: 'P-1', fgCode: 'FG-1', productName: 'GOLDEN HOUR', brandNameEn: 'COZE', volume: 30, volumeUnit: 'ml', retailPriceExVat: 167.29 }],
  });
  const table = await loadRaFilingTable(db, {
    loadQueue: async () => [
      { key: 'excise:SO-E', ready: true, salesOrder: { id: 'SO-A' }, exciseOrder: { id: 'SO-E' } },
      { key: 'upcoming:QT-9', ready: false, salesOrder: { id: 'SO-U' } },
    ],
    loadSource: async (_supabase, { exciseSalesOrderId }) => {
      assert.equal(exciseSalesOrderId, 'SO-E');
      return {
        salesOrder: { id: 'SO-A', deliveryDueDate: '2026-10-28', orderDate: '2026-10-02' },
        exciseOrder: { id: 'SO-E', deliveryDueDate: null },
        resolved: { lines: [{ productId: 'P-1', fgCode: 'FG-1', quantity: 5040, totalTax: 99, needsRegistration: true }] },
      };
    },
  });
  const byKey = new Map(table.map((row) => [row.key, row]));
  assert.deepEqual(byKey.get('excise:SO-E').lines.map((line) => [line.brand, line.volume, line.quantity]), [['COZE', '30 ML', 5040]]);
  assert.equal(byKey.get('excise:SO-E').deliveryDate, '2026-10-28', 'SO ค่าสรรพสามิตยังไม่มีวัน = วันของ SO ต้นทาง');
  assert.deepEqual(byKey.get('excise:SO-E').blockers, ['ยังไม่มีทะเบียน 1 รายการ — เริ่มยื่นไม่ได้']);
  assert.deepEqual(byKey.get('upcoming:QT-9'), { key: 'upcoming:QT-9', deliveryDate: '2026-10-22', deliveryKind: 'po', month: '2026-10', lines: [], blockers: [] });
  const record = byKey.get('order:ORD-1');
  assert.equal(record.deliveryDate, '2026-10-15', 'บันทึก: วันของ SO ค่าสรรพสามิตของรอบนั้น');
  assert.deepEqual(record.lines.map((line) => [line.brand, line.quantity, line.retailPriceExVat]), [['Scent Studio', 600, 1112.15]]);
  const page = read('../../app/tax/filings/page.js');
  assert.match(page, /useApiList\(canReadTable \? "\/api\/tax\/orders\/table" : null\)/);
  assert.match(page, /\.map\(\(row\) => \(\{ \.\.\.row, detail: detailByKey\.get\(row\.key\) \|\| null \}\)\)/, 'ติดรายการกับแถวงานด้วยคีย์');
  assert.match(page, /if \(month !== "all" && r\.detail\?\.month !== month\) return false;/);
});

test('วันที่ส่งของของ SO ค่าสรรพสามิต: ยื่นไม่ได้ถ้าว่าง · ยื่นแล้วเขียนกลับ SO ต้นทาง (รอบล่าสุดเขียนทับ · audit)', async () => {
  assert.equal(exciseDeliveryDateBlocker({ deliveryDueDate: null }), EXCISE_DELIVERY_DATE_TEXT.required);
  assert.equal(exciseDeliveryDateBlocker({ deliveryDueDate: '2026-11-10' }), null);

  const rows = { 'SO-A': { id: 'SO-A', orderNumber: 'SO-26100349-0', status: 'approved', deliveryDueDate: '2026-10-28' } };
  const writes = [];
  const db = {
    from: () => {
      const q = { filters: {}, patch: null };
      const builder = {
        select: () => builder,
        eq: (column, value) => { q.filters[column] = value; return builder; },
        update: (patch) => { q.patch = patch; return builder; },
        maybeSingle: async () => {
          const row = rows[q.filters.id];
          if (!row || (q.filters.status && row.status !== q.filters.status)) return { data: null, error: null };
          if (q.patch) { Object.assign(row, q.patch); writes.push(q.patch); }
          return { data: { ...row }, error: null };
        },
      };
      return builder;
    },
  };
  const audits = [];
  const excise = { id: 'SO-E2', orderNumber: 'SO-26110395-0', sourceSalesOrderId: 'SO-A', deliveryDueDate: '2026-11-10' };
  assert.deepEqual(await syncSourceDeliveryDate(db, excise, { user: { id: 'U' }, audit: async (entry) => audits.push(entry) }), { updated: true });
  assert.equal(rows['SO-A'].deliveryDueDate, '2026-11-10', 'รอบล่าสุดเขียนทับ (V22)');
  assert.match(audits[0].summary, /2026-10-28 → 2026-11-10/);
  assert.deepEqual(await syncSourceDeliveryDate(db, excise, { audit: async () => assert.fail('วันเดิม = ไม่เขียน') }), { updated: false });
  rows['SO-A'].status = 'pending_approval';
  assert.deepEqual(await syncSourceDeliveryDate(db, { ...excise, deliveryDueDate: '2026-12-01' }, { audit: async () => assert.fail() }), { updated: false }, 'SO ต้นทางไม่ได้อนุมัติ = ไม่แตะ');
  assert.equal(writes.length, 1);

  const route = read('../../app/api/sales-planning/sales-orders/[id]/route.js');
  assert.match(route, /const deliveryGate = exciseDeliveryDateBlocker\(before\);\s*if \(deliveryGate\) return badRequest\(deliveryGate\);/);
  assert.match(route, /if \(isExciseOrder\(before\)\) \{\s*const synced = await syncSourceDeliveryDate\(supabase, before, \{ user, request: req \}\);/);
  const create = read('../../app/api/sales-planning/sales-orders/route.js');
  assert.match(create, /if \(excise && !deliveryDueValue && quote\.sourceSalesOrderId\)/, 'ตอนออกใบเว้นว่าง = ใช้กำหนดส่งของ SO ต้นทาง');
  for (const page of ['../../app/sales-planning/sales-orders/new/page.js', '../../app/sales-planning/sales-orders/[id]/page.js']) {
    assert.match(read(page), /excise=\{(excise|isExciseOrder\(order\))\}/, `${page}: ช่องเป็น "วันที่ส่งของ" บนใบค่าสรรพสามิต`);
  }
});
