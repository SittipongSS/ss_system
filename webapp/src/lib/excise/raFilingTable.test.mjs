// มติเจ้าของ 03/11/2026 V20–V23: ตารางยื่นชำระของ RA แบบตารางเดิม (แถวละสินค้า จัดกลุ่มตาม SO · วันที่ส่งของ · รายเดือน)
// + วันที่ส่งของของ SO ค่าสรรพสามิต SA ใส่ตอนยื่น แล้วเขียนกลับ SO ต้นทาง (หลายรอบ = รอบล่าสุด)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  filingDeliveryDate, filingDeliveryMonth, filingTableBlockers, filingTableLine, isSahamitFilingOrder, loadRaFilingTable, salesOrderPoDocDate, quoteLineTableLine, retailPriceExVat, taxPerUnitCheck, volumeText,
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
  const bilingual = filingTableLine({ brandName: 'เซนท์ สตูดิโอ', brandNameEn: 'Scent Studio', productNameTh: 'โรเซ่ โรส', productNameEn: 'Rosé Rose Eau De Parfum' });
  assert.equal(bilingual.brand, 'Scent Studio', 'อังกฤษก่อนแบบตารางเดิม');
  assert.equal(bilingual.description, 'Rosé Rose Eau De Parfum');
  assert.equal(filingTableLine({ brandName: 'แบรนด์ไทย', productNameTh: 'ชื่อไทยล้วน' }).description, 'ชื่อไทยล้วน', 'ไม่มีอังกฤษ = ไทย');
  const line = filingTableLine({ fgCode: 'FG-1-01-002-1', brandName: '', brandNameEn: 'COZE', productName: 'GOLDEN HOUR EDP', volume: 30, volumeUnit: 'ml', retailPriceExVat: 167.29 },
    { quantity: 5040, totalTax: 1234.567 });
  assert.deepEqual(line, {
    fgCode: 'FG-1-01-002-1', brand: 'COZE', description: line.description, volume: '30 ML', quantity: 5040,
    retailPriceIncVat: null, retailPriceExVat: 167.29, taxPerUnit: 0.24, taxCheck: null, totalTax: 1234.57,
  }, 'ไม่ส่งภาษี/หน่วย = ถอดจากภาษีรวม ÷ จำนวน · ไม่มีราคารวม VAT = รีเช็คไม่ได้');
  assert.ok(line.description, 'ชื่อสินค้าจาก productDisplayName');
  assert.equal(filingTableLine(null, { fgCode: 'FG-X', description: 'ของพิมพ์เอง', quantity: 2 }).description, 'ของพิมพ์เอง');
});

test('V25: งานกำลังมาดึงรายการจากใบเสนอราคาค่าสรรพสามิต — สินค้าต้นทาง · จำนวนหน่วยจริง · ภาษีก่อน VAT · ราคาที่ใบตรึง (ถอด 7%)', () => {
  const line = {
    qty: 600, packQty: null, lineTotal: 58722, description: 'FG-108-01-002-0326 โรเซ่ โรส · 50 ml',
    metadata: { lineKind: 'excise_charge', sourceFgCode: 'FG-108-01-002-0326', sourceProductId: 'P-1', retailPriceIncVat: 1190 },
  };
  const product = { fgCode: 'FG-108-01-002-0326', productName: 'Scent Studio Rosé Rose Eau De Parfum', brandName: 'Scent Studio', volume: 50, volumeUnit: 'ml', retailPriceExVat: 999 };
  const row = quoteLineTableLine(line, product);
  assert.equal(row.brand, 'Scent Studio');
  assert.equal(row.volume, '50 ML');
  assert.equal(row.quantity, 600);
  assert.equal(row.retailPriceExVat, 1112.15, 'ราคาที่ใบตรึงไว้ชนะราคาปัจจุบันของสินค้า (ตรงตารางเดิม 1,112.15)');
  assert.equal(row.totalTax, 58722);
  assert.equal(quoteLineTableLine({ ...line, qty: 2, packQty: 3 }, product).quantity, 6, 'แพ็ค × จำนวน');
  assert.equal(quoteLineTableLine(line, null).description, 'FG-108-01-002-0326 โรเซ่ โรส · 50 ml', 'ไม่มีสินค้า = คำของบรรทัด');
});

test('วันที่ส่งของ (เจ้าของ 04/11): วันของ SO ค่าสรรพสามิตเท่านั้น · ยังไม่ส่ง = ว่าง ("—") · ไม่มี "PO มาวันที่" แล้ว — เป็นคอลัมน์ ไม่ใช่ตัวแบ่งเดือน', () => {
  assert.equal(filingDeliveryDate({ exciseOrder: { deliveryDueDate: '2026-10-15' }, salesOrder: { deliveryDueDate: '2026-10-20', orderDate: '2026-10-01' } }), '2026-10-15');
  assert.equal(filingDeliveryDate({ exciseOrder: { deliveryDueDate: null }, salesOrder: { deliveryDueDate: '2026-10-20' } }), null,
    'งานค่าสรรพสามิตไม่ถอยไปวันของ SO ต้นทาง — แบ่งรอบแล้ว SO ต้นทางถือวันของรอบล่าสุด (V22)');
  assert.equal(filingDeliveryDate({ viaExcise: true, salesOrder: { deliveryDueDate: '2026-10-20', orderDate: '2026-10-01' } }), null, 'กำลังมา (ยังไม่มี SO ค่าสรรพสามิต) = ยังไม่ส่ง');
  assert.equal(filingDeliveryDate({ salesOrder: { deliveryDueDate: '2026-10-20' } }), '2026-10-20', 'งานไม่เรียกเก็บ = กำหนดส่งของ SO ลูกค้า');
  assert.equal(filingDeliveryDate({ salesOrder: { orderDate: '2026-10-22T03:00:00Z' } }), null, 'วันที่ PO ไม่ใช่วันที่ส่งของ');
  assert.equal(filingDeliveryDate({}), null);
  // มติเจ้าของ 25/11 (แทน V24 "เดือนที่ยื่น"): เดือนของตาราง = เดือนของวันที่ส่ง · ไม่มีวัน = null (กองท้าย)
  assert.equal(filingDeliveryMonth('2026-11-30'), '2026-11');
  assert.equal(filingDeliveryMonth('2026-12-01'), '2026-12', 'วันในปฏิทิน — ไม่เลื่อนตามเขตเวลา');
  assert.equal(filingDeliveryMonth(null), null);
  assert.equal(filingDeliveryMonth('2026-11-30T18:00:00Z'), null, 'รับเฉพาะวันล้วน');
  assert.deepEqual(filingMonthLabel('2026-10'), { short: 'M.10/69', long: 'ต.ค. 2569' });
  assert.deepEqual(filingMonthLabel(null), { short: '(ยังไม่มีวันที่ส่ง)', long: 'ยังไม่มีวันที่ส่งของ' });
  assert.doesNotMatch(filingDateText({ deliveryDate: '2026-10-22' }), /PO/);
  assert.equal(filingDateText({ deliveryDate: null }), '', 'ยังไม่ส่ง = ว่าง · จอโชว์ "—"');
  assert.doesNotMatch(read('./raFilingMonth.js'), /PO มาวันที่ \$/, 'ไม่มีทางกลับไปเขียน "PO มาวันที่"');
});

test('ไม่มีคอลัมน์สถานะทะเบียน (V20) — ขาดทะเบียน/ราคาบอกที่หัวกลุ่ม', () => {
  assert.deepEqual(filingTableBlockers([{ needsRegistration: true }, { needsRegistration: true, taxBaseMissing: true }, {}]), [
    'ยังไม่มีทะเบียน 2 รายการ — เริ่มยื่นไม่ได้', 'ไม่มีราคาขายปลีก 1 รายการ (ภาษี ฿0)',
  ]);
  const table = read('../../components/excise/FilingLinesTable.js');
  assert.match(table, /const COLUMNS = \["วันที่ส่งของ", "แบรนด์", "รายการ", "ปริมาณ", "จำนวน", "ราคาขายปลีก \(รวม VAT\)", "ราคาขายปลีกก่อน VAT", "ภาษี\/หน่วย \(8\.8%\)", "ภาษีรวม", "สถานะชำระ"\];/);
  assert.doesNotMatch(table.match(/const COLUMNS = \[[^\]]*\]/)[0], /ทะเบียน/, 'ไม่มีคอลัมน์ทะเบียน');
});

// ฐานจำลองแบบเล็ก (อ่านอย่างเดียว) — กรอง in · ไม่มีวันแตะฐานจริง
function fakeDb(tables) {
  const run = (q) => ({ data: (tables[q.table] || []).filter((row) => q.filters.every(([column, value]) => value.includes(row[column]))), error: null });
  return {
    from: (table) => {
      const q = { table, filters: [] };
      const builder = {
        select: () => builder, order: () => builder, range: () => builder, limit: () => builder,
        in: (column, value) => { q.filters.push([column, value]); return builder; },
        eq: (column, value) => { q.filters.push([column, [value]]); return builder; },
        then: (resolve, reject) => Promise.resolve(run(q)).then(resolve, reject),
      };
      return builder;
    },
  };
}

test('ตัวโหลด: คิวที่พร้อม = รายการสดจาก SO · กำลังมา = ไม่มีรายการ · บันทึก = รายการที่ตรึง · คีย์ตรงกับแถวงานของหน้า', async () => {
  const db = fakeDb({
    orders: [{ id: 'ORD-1', salesOrderId: 'SO-B', exciseSalesOrderId: 'SO-EB', filingStartedAt: '2026-10-20T03:00:00Z', items: [{ quantity: 600, totalTax: 50, product: { fgCode: 'FG-2', productName: 'Rosé', brandName: 'Scent Studio', volume: 50, volumeUnit: 'ml', retailPriceExVat: 1112.15 } }] }],
    sales_orders: [
      { id: 'SO-B', deliveryDueDate: null, orderDate: '2026-10-01' },
      { id: 'SO-EB', deliveryDueDate: '2026-10-15', orderDate: '2026-10-10' },
      { id: 'SO-U', deliveryDueDate: null, orderDate: '2026-10-22' },
    ],
    products: [{ id: 'P-1', fgCode: 'FG-1', productName: 'GOLDEN HOUR', brandNameEn: 'COZE', volume: 30, volumeUnit: 'ml', retailPriceExVat: 167.29 }],
    quotation_lines: [
      { id: 'L-1', quotationId: 'QT-9', qty: 5040, packQty: null, lineTotal: 9286.07, metadata: { lineKind: 'excise_charge', sourceProductId: 'P-1', retailPriceIncVat: 179 } },
      { id: 'L-2', quotationId: 'QT-9', qty: 1, packQty: null, lineTotal: 0, metadata: { lineKind: 'note' } },
    ],
  });
  const table = await loadRaFilingTable(db, {
    loadQueue: async () => [
      { key: 'excise:SO-E', ready: true, salesOrder: { id: 'SO-A' }, exciseOrder: { id: 'SO-E' } },
      { key: 'upcoming:QT-9', ready: false, salesOrder: { id: 'SO-U' }, exciseQuote: { id: 'QT-9' } },
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
  assert.equal(byKey.get('excise:SO-E').deliveryDate, null, 'SO ค่าสรรพสามิตยังไม่มีวัน = ยังไม่ส่ง (ไม่ถอยไปวันของ SO ต้นทาง)');
  assert.deepEqual(byKey.get('excise:SO-E').blockers, ['ยังไม่มีทะเบียน 1 รายการ — เริ่มยื่นไม่ได้']);
  const upcoming = byKey.get('upcoming:QT-9');
  assert.equal(upcoming.month, null, 'ยังไม่มีวันที่ส่ง = ไม่อยู่เดือนไหน (มติ 25/11 · เดิม V24 = เดือนนี้)');
  assert.equal(upcoming.deliveryDate, null, 'กำลังมา = ยังไม่ส่ง (ไม่ใช่วันที่ PO)');
  assert.deepEqual(upcoming.lines.map((line) => [line.brand, line.quantity, line.totalTax]), [['COZE', 5040, 9286.07]], 'รายการจากใบเสนอราคา (V25) · ตัดบรรทัดที่ไม่ใช่ค่าภาษี');
  assert.equal(byKey.get('excise:SO-E').month, null, 'SO ค่าสรรพสามิตยังไม่มีวัน = กอง "ยังไม่มีวันที่ส่ง"');
  const record = byKey.get('order:ORD-1');
  assert.equal(record.deliveryDate, '2026-10-15', 'บันทึก: วันของ SO ค่าสรรพสามิตของรอบนั้น');
  assert.equal(record.month, '2026-10', 'บันทึก: เดือนของวันที่ส่ง (15 ต.ค.) ไม่ใช่เดือนที่เริ่มยื่น (มติ 25/11)');
  assert.equal(record.deliveryDateKind, 'delivery');
  assert.deepEqual(record.lines.map((line) => [line.brand, line.quantity, line.retailPriceExVat]), [['Scent Studio', 600, 1112.15]]);
  const page = read('../../app/tax/filings/page.js');
  assert.match(page, /useApiList\(canReadTable \? "\/api\/tax\/orders\/table" : null\)/);
  assert.match(page, /const detail = detailByKey\.get\(row\.key\) \|\| null;[\s\S]*?return \{ \.\.\.row, detail, search:/, 'ติดรายการกับแถวงานด้วยคีย์');
  assert.match(page, /if \(month !== "all" && r\.detail\?\.month !== month\) return false;/);
});

test('สหมิตร (มติเจ้าของ 25/11): ช่องวันที่ = วันที่เอกสาร PO แทนวันที่ส่งของ · แบ่งเดือนด้วยวันนั้น · จอนำด้วย "PO"', async () => {
  const sahamit = { customerId: 'CUS-S', confirmDocType: 'po', confirmDocDate: '2026-11-05', deliveryDueDate: '2027-01-13' };
  assert.equal(isSahamitFilingOrder(sahamit, 'CUS-S'), true);
  assert.equal(isSahamitFilingOrder(sahamit, null), false, 'ไม่รู้รหัสลูกค้าสหมิตร = ไม่ใช่ (ไม่เดา)');
  assert.equal(isSahamitFilingOrder({ customerId: 'CUS-X' }, 'CUS-S'), false);
  assert.equal(salesOrderPoDocDate(sahamit), '2026-11-05');
  assert.equal(salesOrderPoDocDate({ ...sahamit, confirmDocType: 'order_confirmation' }), null, 'เอกสารยืนยันชนิดอื่นไม่ใช่วันที่ PO');
  assert.equal(filingDeliveryDate({ salesOrder: sahamit, sahamitCustomerId: 'CUS-S' }), '2026-11-05', 'ไม่เรียกเก็บ (รวมในราคา) = วันที่ PO ไม่ใช่กำหนดส่ง');
  assert.equal(
    filingDeliveryDate({ exciseOrder: { deliveryDueDate: '2027-01-20' }, salesOrder: sahamit, sahamitCustomerId: 'CUS-S' }),
    '2026-11-05', 'งานค่าสรรพสามิตของสหมิตรก็ใช้วันที่ PO ของ SO ลูกค้า',
  );
  assert.equal(filingDeliveryDate({ salesOrder: { ...sahamit, confirmDocType: null, confirmDocDate: null }, sahamitCustomerId: 'CUS-S' }), null,
    'สหมิตรที่ไม่มี PO = "—" (ไม่ถอยไปวันส่ง)');
  assert.equal(filingDeliveryDate({ salesOrder: sahamit }), '2027-01-13', 'ไม่ส่งรหัสสหมิตร = กติกาเดิม');
  assert.equal(filingDateText({ deliveryDate: '2026-11-05', deliveryDateKind: 'po' }), 'PO 05/11/2026');
  assert.equal(filingDateText({ deliveryDate: '2026-11-05', deliveryDateKind: 'delivery' }), '05/11/2026');

  const db = fakeDb({
    orders: [],
    customers: [{ id: 'CUS-S', arCode: 'AR-109' }, { id: 'CUS-X', arCode: 'AR-001' }],
    sales_orders: [],
    products: [],
    quotation_lines: [],
  });
  const table = await loadRaFilingTable(db, {
    loadQueue: async () => [
      { key: 'notbilled:SO-S', ready: true, salesOrder: { id: 'SO-S' } },
      { key: 'notbilled:SO-N', ready: true, salesOrder: { id: 'SO-N' } },
    ],
    loadSource: async (_supabase, { salesOrderId }) => ({
      salesOrder: salesOrderId === 'SO-S'
        ? { id: 'SO-S', ...sahamit }
        : { id: 'SO-N', customerId: 'CUS-X', confirmDocType: 'po', confirmDocDate: '2026-10-01', deliveryDueDate: '2026-12-11' },
      exciseOrder: null,
      resolved: { lines: [] },
    }),
  });
  const byKey = new Map(table.map((row) => [row.key, row]));
  assert.deepEqual(
    [byKey.get('notbilled:SO-S').deliveryDate, byKey.get('notbilled:SO-S').deliveryDateKind, byKey.get('notbilled:SO-S').month],
    ['2026-11-05', 'po', '2026-11'],
    'สหมิตร: วันที่ PO 5 พ.ย. ⇒ M.11/69 (ไม่ใช่เดือนส่ง ม.ค.)',
  );
  assert.deepEqual(
    [byKey.get('notbilled:SO-N').deliveryDate, byKey.get('notbilled:SO-N').deliveryDateKind, byKey.get('notbilled:SO-N').month],
    ['2026-12-11', 'delivery', '2026-12'],
    'ลูกค้าอื่นที่มี PO: ยังเป็นวันที่ส่งของ',
  );
  const loader = read('./raFilingTable.js');
  assert.match(loader, /supabase\.from\('customers'\)\.select\('id'\)\.eq\('arCode', SAHAMIT_AR_CODE\)\.limit\(1\)/);
  assert.match(loader, /\.select\('id, "deliveryDueDate", "customerId", "confirmDocType", "confirmDocDate"'\)/, 'กลุ่มกำลังมา/บันทึกอ่านช่อง PO ด้วย');
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

test('รีเช็คภาษี (เจ้าของ 03/11): ราคาขายปลีกรวม VAT + ภาษี/หน่วย · ระบบคิดสูตร 8.8% ซ้ำแล้วเตือนแถวที่ไม่ตรง', () => {
  // ตัวอย่างจริงของ QT-26100568-2: Rosé Rose 50 ML ราคา 1,190 รวม VAT → ถอด VAT 1,112.15 × 8.8% = 97.87
  assert.deepEqual(taxPerUnitCheck(1190, 97.87), { expected: 97.87, ok: true });
  assert.deepEqual(taxPerUnitCheck(110, 9.05), { expected: 9.05, ok: true });
  assert.equal(taxPerUnitCheck(1190, 95).ok, false, 'ภาษี/หน่วยไม่ตรงสูตร');
  assert.equal(taxPerUnitCheck(null, 97.87), null, 'ไม่มีราคาขายปลีก = เทียบไม่ได้');
  const row = quoteLineTableLine({ qty: 600, packQty: null, unitPrice: 97.87, lineTotal: 58722, metadata: { lineKind: 'excise_charge', retailPriceIncVat: 1190 } }, null);
  assert.equal(row.retailPriceIncVat, 1190);
  assert.equal(row.retailPriceExVat, 1112.15);
  assert.equal(row.taxPerUnit, 97.87, 'ภาษี/หน่วย = ราคาต่อหน่วยของบรรทัดค่าสรรพสามิต');
  assert.equal(row.taxCheck.ok, true);
  const record = filingTableLine({ retailPriceIncVat: 1190 }, { quantity: 10, totalTax: 978.7, taxPerUnit: 88.97 + 8.9 });
  assert.equal(record.taxPerUnit, 97.87, 'บันทึก: สรรพสามิต/หน่วย + ท้องถิ่น/หน่วย');
  const table = read('../../components/excise/FilingLinesTable.js');
  assert.match(table, /"ราคาขายปลีก \(รวม VAT\)", "ราคาขายปลีกก่อน VAT", "ภาษี\/หน่วย \(8\.8%\)", "ภาษีรวม"/);
  assert.match(table, /line\.taxCheck && !line\.taxCheck\.ok/);
});

test('ย่อ/ขยาย (เจ้าของ 04/11): หัวเดือนย่อทั้งเดือน + ย่อ/ขยายทุกงาน · หัวงานย่อรายการ · หัวงานบอกจำนวนรายการกับภาษีรวมตลอด', () => {
  const table = read('../../components/excise/FilingLinesTable.js');
  assert.match(table, /aria-expanded=\{monthOpen\} onClick=\{\(\) => toggle\(monthKey\)\}/);
  assert.match(table, /if \(!monthOpen\) return \[monthHeader\];/, 'เดือนที่ย่อเหลือหัวเดือนแถวเดียว');
  assert.match(table, /setMany\(groupKeys, !allGroupsClosed\)/);
  assert.match(table, /aria-expanded=\{open\}/);
  assert.match(table, /if \(!open\) return \[header\];/, 'งานที่ย่อเหลือหัวงาน (ลิงก์ · สถานะ · ด่าน · ช่องติ๊กพิมพ์)');
  // จัดแนว (05/11): จำนวนรายการ/ยอดรวมของงานอยู่ในคอลัมน์ "ภาษี/หน่วย"/"ภาษีรวม" ของหัวงาน — โชว์ทั้งตอนกางและตอนย่อ
  assert.match(table, /\{lines\.length \? `\$\{fmtNumber\(lines\.length\)\} รายการ` : null\}/, 'ยอดของงานโชว์ทั้งตอนกางและตอนย่อ');
  assert.match(table, /<td className=\{`\$\{styles\.num\} mono \$\{styles\.tax\}`\}>\{lines\.length \? fmtMoney\(filingLinesTaxTotal\(lines\)\) : null\}<\/td>/);
  const head = table.match(/<div className=\{styles\.groupHead\}>[\s\S]*?<\/div>/)[0];
  assert.ok(head.indexOf('className={styles.toggle}') < head.indexOf('<Link'), 'ปุ่มลูกศรอยู่หน้าลิงก์ ไม่ซ้อนกัน');
  assert.doesNotMatch(head.slice(head.indexOf('className={styles.toggle}'), head.indexOf('</button>')), /<Link/, 'ลิงก์ไม่อยู่ในปุ่ม');
});

test('ยอดรวม (เจ้าของ 04/11): หัวเดือน = งาน · รายการ · ภาษีรวมของแถวที่ผ่านตัวกรอง · งานที่ยังไม่มีรายการไม่อยู่ในยอดและจอต้องบอก', async () => {
  const { filingMonthTotals, filingLinesTaxTotal } = await import('./raFilingMonth.js');
  // ตัวเลขจริง 04/11 (หัวงานสามงานของ M.11/69): 350,175 + 196,006.50 + 160,370
  const rows = [
    { key: 'a', detail: { lines: [{ totalTax: 293610 }, { totalTax: 40725 }, { totalTax: 15840 }] } },
    { key: 'b', detail: { lines: [{ totalTax: 58722 }, { totalTax: 24887.5 }, { totalTax: 9680 }, { totalTax: 58722 }, { totalTax: 31675 }, { totalTax: 12320 }] } },
    { key: 'c', detail: { lines: [{ totalTax: 80185 }, { totalTax: 80185 }] } },
  ];
  assert.equal(filingLinesTaxTotal(rows[1].detail.lines), 196006.5);
  assert.deepEqual(filingMonthTotals(rows), { jobs: 3, lines: 11, totalTax: 706551.5, missing: 0 });
  assert.equal(filingLinesTaxTotal([{ totalTax: 0.1 }, { totalTax: 0.2 }]), 0.3, 'ปัดสองตำแหน่ง ไม่มีเศษทศนิยมลอย');
  assert.deepEqual(filingMonthTotals([...rows, { key: 'd', detail: null }]), { jobs: 4, lines: 11, totalTax: 706551.5, missing: 1 });
  assert.deepEqual(filingMonthTotals([{ key: 'e', detail: { lines: [] } }]), { jobs: 1, lines: 0, totalTax: 0, missing: 0 });
  const table = read('../../components/excise/FilingLinesTable.js');
  assert.match(table, /const totals = filingMonthTotals\(bucket\.rows\);/, 'ยอดหัวเดือนคิดจากแถวที่จอวาด (ผ่านตัวกรองแล้ว)');
  assert.match(table, /<strong className=\{styles\.monthTotal\}>\{fmtMoney\(totals\.totalTax\)\}<\/strong>/, 'ยอดเดือนอยู่ในคอลัมน์ "ภาษีรวม"');
  assert.match(table, /ไม่รวม \{fmtNumber\(totals\.missing\)\} งานที่ยังไม่มีรายการ/);
});

test('จัดแนว (เจ้าของ 05/11 "align ข้อมูล จะได้ตรวจง่าย"): หัวเดือน/หัวงานลงคอลัมน์เดียวกับแถวสินค้า', () => {
  const table = read('../../components/excise/FilingLinesTable.js');
  assert.match(table, /const LEAD_SPAN = COLUMNS\.indexOf\("ภาษี\/หน่วย \(8\.8%\)"\);/, 'ข้อความของหัวกินคอลัมน์ก่อน "ภาษี/หน่วย"');
  // หัวงาน: ข้อความ (LEAD_SPAN) + จำนวนรายการ + ยอดรวม + สถานะ = ครบทุกคอลัมน์ ⇒ ยอด/สถานะตั้งตรงกับแถวสินค้า
  const group = table.slice(table.indexOf('<td colSpan={LEAD_SPAN}>'), table.indexOf('if (!open) return [header];'));
  assert.equal((group.match(/<td\b/g) || []).length, 4, 'หัวงาน = 1 ช่องข้อความ + 3 ช่องท้าย');
  assert.match(group, /<td><StatusBadge status=\{row\.status\} \/><\/td>/, 'สถานะอยู่ใต้ "สถานะชำระ"');
  const month = table.slice(table.indexOf('<td colSpan={LEAD_SPAN + (selectable ? 1 : 0)}>'), table.indexOf('if (!monthOpen) return [monthHeader];'));
  assert.equal((month.match(/<td\b/g) || []).length, 4, 'หัวเดือน = 1 ช่องข้อความ + 3 ช่องท้าย');
  const css = read('../../components/excise/FilingLinesTable.module.css');
  assert.match(css, /\.groupHead \{\s*display: grid;\s*grid-template-columns: auto 8\.5rem minmax\(0, 16rem\) minmax\(0, 1fr\);/, 'เลข SO · ลูกค้า · ขั้น ตั้งตรงกันทุกงาน');
});
