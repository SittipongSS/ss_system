// มติเจ้าของ 25/11/2026 (หลังขึ้น #2128): สามข้อของโมดูลสรรพสามิต
//  ① ทะเบียน SO แท็บสรรพสามิต: คอลัมน์ "วันที่ส่งของ" · สหมิตร = วันที่เอกสาร PO (กติกาเดียวกับตาราง RA)
//  ② ตารางยื่นชำระ: งานรอ RA/กำลังมา เปิดเป็นหน้าเต็ม · "เริ่มยื่น" อยู่การ์ดจัดการ (เดิมโมดัล)
//  ③ หน้าขึ้นทะเบียน: คอลัมน์ลูกค้าโชว์เบอร์โทร + ลิงก์ไปหน้ารายละเอียดลูกค้า
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { deliveryShownText, exciseOrderDeliveryShown } from './raFilingMonth.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('① วันที่ส่งของของใบค่าสรรพสามิต: วันของใบเอง · สหมิตร = วันที่ PO ของ SO ลูกค้าต้นทาง · ไม่มี = ว่าง', () => {
  const excise = { id: 'X', deliveryDueDate: '2026-11-16' };
  const source = { id: 'S', customerId: 'CUS-A', confirmDocType: 'po', confirmDocDate: '2026-11-05', deliveryDueDate: '2027-01-13' };
  assert.deepEqual(exciseOrderDeliveryShown(excise, source, 'CUS-SHM'), { date: '2026-11-16', kind: 'delivery' });
  assert.deepEqual(exciseOrderDeliveryShown(excise, { ...source, customerId: 'CUS-SHM' }, 'CUS-SHM'), { date: '2026-11-05', kind: 'po' });
  assert.deepEqual(exciseOrderDeliveryShown({ id: 'X', deliveryDueDate: null }, source, 'CUS-SHM'), { date: null, kind: 'delivery' },
    'ไม่ถอยไปวันของใบต้นทาง (แบ่งรอบ · V22)');
  assert.deepEqual(exciseOrderDeliveryShown(excise, null, 'CUS-SHM'), { date: '2026-11-16', kind: 'delivery' }, 'ไม่พบใบต้นทาง = วันของใบเอง');
  assert.equal(deliveryShownText('2026-11-05', 'po'), 'PO 05/11/2026');
  assert.equal(deliveryShownText('2026-11-16', 'delivery'), '16/11/2026');
  assert.equal(deliveryShownText(null, 'po'), '');

  const route = read('../../app/api/sales-planning/sales-orders/route.js');
  assert.match(route, /const sahamitCustomerId = \[\.\.\.arById\]\.find\(\(\[, ar\]\) => ar === SAHAMIT_AR_CODE\)\?\.\[0\] \|\| null;/);
  assert.match(route, /\.\.\.\(isExciseOrder\(row\)\s*\? \{ exciseDelivery: exciseOrderDeliveryShown\(row, orderById\.get\(row\.sourceSalesOrderId\) \|\| null, sahamitCustomerId\) \}/,
    'ใบต้นทางอยู่ในชุดเดียวกันของทะเบียน — ไม่ยิงเพิ่ม');
  const page = read('../../app/sales-planning/sales-orders/page.js');
  assert.match(page, /const exciseView = lineView === EXCISE_LINE_VIEW;/);
  assert.match(page, /\(serviceView \? 2 : 0\) \+ \(exciseView \? 1 : 0\);/, 'colSpan ของหัวกลุ่ม/แถวว่างนับคอลัมน์ใหม่');
  assert.match(page, /\{exciseView && <th>วันที่ส่งของ<\/th>\}/);
  assert.match(page, /\{exciseView && <td className="mono">\{exciseDeliveryCell\(row\)\}<\/td>\}/);
  assert.match(page, /<span className="cell-num-bad">\{shown\?\.kind === "po" \? "ยังไม่มีวันที่ PO" : "ยังไม่ใส่"\}<\/span>/);
});

test('② งานรอ RA/กำลังมา = หน้าเต็ม /tax/filings/work/[key] · ปุ่มเริ่มยื่นในการ์ดจัดการ · ลิงก์ ?start= เก่าพามาหน้าใหม่ · โมดัลถอดแล้ว', () => {
  assert.equal(existsSync(new URL('../../components/excise/SalesOrderFilingModal.js', import.meta.url)), false, 'โมดัลเดิมถอดแล้ว');
  const work = read('../../app/tax/filings/work/[key]/page.js');
  assert.match(work, /useApiList\(canFile \? "\/api\/tax\/orders\/queue" : null\)/, 'คิวตัวเดียวกับหน้ารายการ');
  assert.match(work, /\(queue \|\| \[\]\)\.find\(\(item\) => item\.key === key\)/);
  assert.match(work, /<DocumentControlCard[\s\S]*?primaryAction=\{primaryAction\}/);
  assert.match(work, /<FilingWorkBody row=\{row\} preview=\{preview\} upcoming=\{upcoming\} \/>/);
  assert.match(work, /decodeURIComponent/, 'คีย์มี ":" — ถอดรหัสจาก URL');
  const list = read('../../app/tax/filings/page.js');
  assert.doesNotMatch(list, /SalesOrderFilingModal/);
  assert.match(list, /if \(startKey\) router\.replace\(raWorkHref\(\{ key: startKey \}\)\);/, 'แจ้งเตือน/บุ๊กมาร์กเก่าไม่ตาย');
});

test('③ ขึ้นทะเบียน: API แนบเบอร์โทรลูกค้า (สดจากทะเบียนลูกค้า) · คอลัมน์ลูกค้ากดไปหน้าลูกค้า · การ์ดจอแคบไม่ซ้อนลิงก์', () => {
  const api = read('../../app/api/excise-registrations/route.js');
  assert.match(api, /fetchInChunks\(customerIds, \(chunk\) => supabase\.from\('customers'\)\s*\.select\('id, phone, "contactPhone"'\)\s*\.in\('id', chunk\)\.limit\(chunk\.length\)\)/);
  assert.match(api, /customerPhone: phoneOf\.get\(r\.customerId\) \|\| null,/);
  const page = read('../../app/tax/registrations/page.js');
  assert.match(page, /<Link prefetch=\{false\} href=\{`\/database\/customers\/\$\{r\.customerId\}`\} className="linklike" title="เปิดหน้าลูกค้า">/);
  assert.match(page, /\{r\.customerPhone \? <div className="cell-sub font-mono">โทร \{r\.customerPhone\}<\/div> : null\}/);
  assert.match(page, /\{r\.customerPhone \? <span className="cell-sub font-mono"> · โทร \{r\.customerPhone\}<\/span> : null\}/, 'การ์ดโชว์เบอร์ (ทั้งการ์ดเป็นลิงก์อยู่แล้ว)');
});

test('④ เบอร์โทรลูกค้าบังคับตอนยื่นทะเบียน (เจ้าของ 25/11 "ถ้าไม่มี ต้องบังคับใส่ ไม่งั้นกดยื่นไม่ได้") — ขาด = ยื่นไม่ได้ · แก้ที่หน้าลูกค้า', async () => {
  const { registrationMissing } = await import('../tax/requirements.js');
  const base = {
    registration: { id: 'R1', customerId: 'C1', productId: null },
    hasArtwork: true,
    customerDocTypes: new Set(['address_map']),
  };
  const ok = { email: 'a@b.c', taxId: '0105565024543', branchCode: '00000' };
  const without = registrationMissing({ ...base, customer: { ...ok, phone: '', contactPhone: null } });
  assert.equal(without.ready, false);
  assert.deepEqual(without.missing.map((m) => [m.entity, m.docType, m.label]), [['customer', 'phone', 'เบอร์โทรลูกค้า']]);
  assert.equal(without.warnings.some((w) => w.field === 'customerPhone'), false, 'ไม่ใช่คำเตือนเบา ๆ แล้ว');
  assert.equal(registrationMissing({ ...base, customer: { ...ok, phone: '02-123-4567' } }).ready, true, 'เบอร์บริษัทพอ');
  assert.equal(registrationMissing({ ...base, customer: { ...ok, phone: '  ', contactPhone: '081-234-5678' } }).ready, true, 'เบอร์ผู้ติดต่อพอ');
  const panel = read('../../components/excise/RegistrationWorkModal.js');
  assert.match(panel, /item\.entity === "customer" && \["taxId", "branchCode", "phone"\]\.includes\(item\.docType\)/, 'เช็กลิสต์มีลิงก์ "แก้ที่หน้าลูกค้า"');
});
