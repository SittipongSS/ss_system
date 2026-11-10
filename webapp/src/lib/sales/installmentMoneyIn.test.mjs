// "ชุดเงินเข้า" ในลิ้นชักฝ่ายขาย (รื้อ SO + บัญชี PR-5) — ปุ่ม · ด่านชุดเดียวกับ PATCH · อัปสลิปครั้งเดียวต่อไฟล์ · ต่อสาย
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MONEY_IN_SHOWN_LOCKS, moneyInButtons, moneyInGateOptions, moneyInLocks,
} from './installmentMoneyIn.js';
import { paymentEvidenceRef, uploadPaymentEvidenceList, uploadPaymentEvidenceOnce } from './paymentEvidenceUpload.js';
import { INSTALLMENT_ACTUAL_REPORT_BLOCKED } from './salesOrderActualMode.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const code = (rel) => readFileSync(join(SRC, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

const OPEN = { report: null, evidenceAdd: 'x', withdraw: 'x', outcome: 'reported', room: 8, prepaid: false };
const labels = (row, entry) => moneyInButtons(row, entry).map((b) => `${b.action}:${b.label}${b.lock ? ' (ดับ)' : ''}`);

test('ปุ่มแจ้งชำระ: ป้ายตามปลายทาง (ปกติ · แจ้งใหม่ · งวดร่าง) · คนที่รับรองเองได้ไม่ได้ปุ่มนี้ในลิ้นชัก', () => {
  assert.deepEqual(labels({ status: 'pending' }, OPEN), ['report:แจ้งลูกค้าจ่ายแล้ว']);
  assert.deepEqual(labels({ status: 'rejected' }, OPEN), ['report:แจ้งใหม่']);
  assert.deepEqual(labels({ status: 'pending' }, { ...OPEN, outcome: 'pending' }), ['report:บันทึกว่าลูกค้าจ่ายแล้ว']);
  assert.deepEqual(labels({ status: 'pending' }, { ...OPEN, outcome: 'confirmed' }), [], 'บัญชี/แอดมิน = บันทึกรับชำระขั้นเดียวที่หน้าใบ/หน้างานบัญชี');
  assert.deepEqual(labels({ status: 'reported' }, OPEN), [], 'งวดที่แจ้งแล้วไม่ใช่ปุ่มแจ้ง');
});

test('ติดด่าน: แจ้งชำระของใบ Actual รายงวด = โชว์ดับพร้อมเหตุ · เหตุอื่น (สิทธิ์/สถานะใบ/ลำดับงวด) = ไม่โชว์', () => {
  const [locked] = moneyInButtons({ status: 'pending' }, { ...OPEN, report: INSTALLMENT_ACTUAL_REPORT_BLOCKED });
  assert.equal(locked.action, 'report');
  assert.equal(locked.lock, INSTALLMENT_ACTUAL_REPORT_BLOCKED);
  assert.ok(MONEY_IN_SHOWN_LOCKS.includes(INSTALLMENT_ACTUAL_REPORT_BLOCKED));
  assert.deepEqual(labels({ status: 'pending' }, { ...OPEN, report: 'ไม่มีสิทธิ์แจ้งชำระ' }), []);
});

test('แนบสลิปเพิ่ม / ดึงกลับ: ขึ้นเมื่อด่านผ่านเท่านั้น (แผงงวดซ่อนตาม gate เหมือนกัน) · งวดร่างที่บันทึกแล้ว = "ลบบันทึกการจ่าย"', () => {
  const reported = { ...OPEN, report: 'x', evidenceAdd: null, withdraw: null };
  assert.deepEqual(labels({ status: 'reported' }, reported), ['evidence-add:แนบสลิปเพิ่ม', 'withdraw:ดึงกลับการแจ้งชำระ']);
  assert.deepEqual(labels({ status: 'confirmed' }, { ...reported, withdraw: 'x' }), ['evidence-add:แนบสลิปเพิ่ม']);
  assert.deepEqual(labels({ status: 'confirmed' }, { ...reported, withdraw: 'x', room: 0 }), [], 'ครบเพดานหลักฐานแล้ว');
  assert.deepEqual(labels({ status: 'pending' }, { ...reported, prepaid: true }), ['evidence-add:แนบสลิปเพิ่ม', 'withdraw:ลบบันทึกการจ่าย'],
    'งวดร่างที่บันทึกเงินไว้แล้วไม่ขึ้นปุ่มแจ้งซ้ำ');
  assert.deepEqual(moneyInButtons({ status: 'confirmed', refunded: true }, reported), []);
  assert.deepEqual(moneyInButtons({ status: 'pending' }, null), [], 'ยังไม่ได้ด่านจาก server = ไม่มีปุ่ม');
});

test('ด่านชุดเดียวกับ PATCH งวด: ทุกตัวเลือกที่ไม่ได้มาจาก body ของคำขอ อยู่ใน moneyInGateOptions', () => {
  const route = code('app/api/sales-planning/sales-orders/[id]/installments/route.js');
  const start = route.indexOf('const gate = installmentActionError(row, action, user, {\n      paidOn, reason,');
  assert.ok(start > 0, 'หา literal ด่านของ PATCH ไม่เจอ — ยามนี้ต้องแก้ตามรูปใหม่');
  const literal = route.slice(start, route.indexOf('});', start));
  const keys = new Set([...literal.slice(literal.indexOf('{') + 1).matchAll(/(?:^|[\s,{])([a-zA-Z]+)(?=\s*[:,\n])/g)].map((m) => m[1]));
  const BODY = ['paidOn', 'reason', 'billingRequestId', 'coversFrom', 'coversTo', 'taxInvoiceNo', 'taxInvoiceDate', 'refundedOn', 'creditNoteNo', 'evidenceCount'];
  for (const key of BODY) keys.delete(key);
  // ค่าใน literal ที่ตัวจับเก็บติดมา (ไม่ใช่คีย์) — `rows: siblings` · `?? null`
  for (const noise of ['siblings', 'null']) keys.delete(noise);
  assert.ok(keys.has('rows') && keys.has('installStepEnabled'), 'แกะคีย์ของ literal ไม่ออก');
  const helper = Object.keys(moneyInGateOptions({ id: 'SOR-1', status: 'approved', totalAmount: 100, lines: [] }, [], 'report'));
  for (const key of keys) assert.ok(helper.includes(key), `PATCH ส่ง ${key} ให้ด่าน แต่ moneyInGateOptions ไม่ส่ง — ปุ่มในลิ้นชักจะบอกอย่าง API บอกอีกอย่าง`);
  for (const key of ['rows', 'orderTotal', 'serviceRounds', 'orderLock', 'historical', 'contractEnd', 'orderCancelled', 'order', 'dealOwnerId', 'installStepEnabled']) {
    assert.ok(helper.includes(key), key);
  }
});

test('moneyInLocks: หนึ่งก้อนต่องวด · ปลายทางของการแจ้ง · เพดานไฟล์ของโมดัลแนบเพิ่ม', () => {
  const order = { id: 'SOR-1', status: 'approved', origin: 'pipeline', totalAmount: 100, lines: [], deal: { ownerId: 'U1' } };
  const rows = [
    { id: 'I1', salesOrderId: 'SOR-1', seq: 1, status: 'pending', amount: 100, frozenAt: '2026-11-01T00:00:00Z', evidence: [] },
    { id: 'I2', salesOrderId: 'SOR-1', seq: 2, status: 'pending', amount: 0, frozenAt: null, evidence: [] },
  ];
  const locks = moneyInLocks(order, rows, { id: 'U1', role: 'sales', department: 'SA' }, { todayIso: '2026-11-11' });
  assert.deepEqual(Object.keys(locks), ['I1', 'I2']);
  for (const entry of Object.values(locks)) {
    assert.deepEqual(Object.keys(entry).sort(), ['evidenceAdd', 'outcome', 'prepaid', 'report', 'room', 'withdraw']);
  }
  assert.equal(locks.I2.outcome, 'pending', 'งวดยังไม่ตรึง = บันทึกเก็บไว้ (งวดร่าง)');
  assert.equal(locks.I1.room, 8);
});

test('อัปสลิปครั้งเดียวต่อไฟล์ต่อใบ — กดส่งใหม่หลังล้มไม่อัปซ้ำ (กติกา "กดส่งซ้ำต้องไม่อัปไฟล์ซ้ำ")', async () => {
  const calls = [];
  const upload = async ({ file, entityType, entityId }) => {
    calls.push(`${entityType}:${entityId}:${file.name}`);
    return { url: null, storageBucket: 'b', storagePath: `p/${file.name}` };
  };
  const a = { name: 'a.pdf', type: 'application/pdf', size: 10 };
  const b = { name: 'b.jpg', type: 'image/jpeg', size: 20 };
  const first = await uploadPaymentEvidenceList([a, b], { orderId: 'SOR-1', upload });
  const again = await uploadPaymentEvidenceList([a, b], { orderId: 'SOR-1', upload });
  assert.deepEqual(calls, ['sales_order_payment_evidence:SOR-1:a.pdf', 'sales_order_payment_evidence:SOR-1:b.jpg']);
  assert.deepEqual(again, first);
  assert.deepEqual(first[0], paymentEvidenceRef({ storageBucket: 'b', storagePath: 'p/a.pdf' }, a));
  // ใบอื่น = อัปใหม่ (path ของ bucket แยกตามใบ)
  await uploadPaymentEvidenceOnce(a, { orderId: 'SOR-2', upload });
  assert.equal(calls.length, 3);
  // ล้มกลางทาง: ใบที่ผ่านไปแล้วยังจำไว้
  const c = { name: 'c.png', type: 'image/png', size: 5 };
  const d = { name: 'd.png', type: 'image/png', size: 5 };
  let fail = true;
  const flaky = async (args) => {
    if (args.file === d && fail) throw new Error('เน็ตสะดุด');
    return upload(args);
  };
  await assert.rejects(uploadPaymentEvidenceList([c, d], { orderId: 'SOR-1', upload: flaky }), /เน็ตสะดุด/);
  fail = false;
  await uploadPaymentEvidenceList([c, d], { orderId: 'SOR-1', upload: flaky });
  assert.equal(calls.filter((x) => x.endsWith('c.png')).length, 1, 'ใบแรกอัปครั้งเดียว');
});

test('ต่อสาย: GET งวดส่ง moneyIn · ลิ้นชักฝ่ายขายใช้โมดัลชุดเดียวกับแผงงวด · เปลือกบัญชีดูอย่างเดียว · หน้าใบอัปผ่านตัวจำ ref', () => {
  const route = code('app/api/sales-planning/sales-orders/[id]/installments/route.js');
  const get = route.slice(route.indexOf('export const GET = withUser('), route.indexOf('export const POST = withUser('));
  assert.match(get, /const moneyIn = moneyInLocks\(order, installments, user, \{\s*todayIso: businessDate\(\), installStepEnabled: installStepEnabled\(\),\s*serviceRounds: orderHasServiceRounds\(order, order\.lines\),\s*\}\);/);
  assert.match(get, /return ok\(\{ installments, moneyIn \}\);/);
  assert.doesNotMatch(get, /\.(insert|update|upsert|delete)\(/, 'GET อ่านอย่างเดียว');
  const drawer = code('components/salesPlanning/SalesMoneyInDrawer.js');
  assert.match(drawer, /<InstallmentReportDialog/);
  assert.match(drawer, /<InstallmentEvidenceAddDialog/);
  assert.match(drawer, /const buttons = moneyInButtons\(target, live\.moneyIn\?\.\[target\.id\]\);/);
  assert.match(drawer, /await uploadPaymentEvidenceList\(files, \{ orderId, upload: uploadFileBytes \}\)/);
  assert.match(drawer, /expectedUpdatedAt: target\.updatedAt \|\| undefined,/);
  assert.match(drawer, /if \(res\.status === 409\) await read\(\);/);
  const panel = code('components/salesPlanning/SalesOrderPaymentPanel.js');
  assert.match(panel, /<InstallmentReportDialog/);
  assert.match(panel, /<InstallmentEvidenceAddDialog/);
  assert.doesNotMatch(panel, /<PendingFiles/, 'โมดัลของแผงย้ายไปตัวกลางแล้ว — ห้ามมีสำเนาที่สอง');
  const list = code('app/sales-planning/sales-orders/page.js');
  assert.match(list, /<SalesMoneyInDrawer row=\{drawerRow\} focusSeq=\{drawer\.seq\} showActual=\{showActual\} moneyIn=\{!financeShell\}/);
  const page = code('app/sales-planning/sales-orders/[id]/page.js');
  assert.match(page, /return uploadPaymentEvidenceOnce\(file, \{ orderId: id, upload: uploadFileBytes \}\);/);
});
