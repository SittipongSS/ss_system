// ── PR-C C5: บรรทัด "เปิดด่านเงินของนัดบริการของใบนี้" ในโมดัล FN รับรองงวด — ต่อสายครบสามทางเรียก ──────────────
//
// ⭐ C-D14/C-D15 (IMPL_PLAN_C · r2 F1 · critique M3/L7): บัญชีรับรองงวดของใบบริการที่เปิดงานแล้ว (mig 0392) ต้องเห็นก่อนกดว่า
//   "จ่ายถึง" ขยับด่านเงินของนัดบริการของใบนี้ถึงวันไหน กี่โซน · ใบที่ไม่ผูกสัญญาได้ท่อนต่อท้ายว่านัดยังติดด่านสัญญา
//   ⇒ ตัวเลขมาจาก **server** เท่านั้น (หน้าใบ: GET ใบ `serviceTermZones` · ทะเบียน: แถวทะเบียน) — ไม่คิดจากงวด/จัดสรรที่จอ
// ⭐ สามทางเรียกพูดประโยคเดียวกัน (`FN_SERVICE_GATE_LINE` ผ่าน `paymentConfirmPrompt`):
//   โมดัลรับรองบนใบ · "บันทึกการรับชำระ" ของบัญชีบนแผงงวด (reportPrompt) · โมดัลรับรองบนทะเบียนการชำระ
// ⚠️ อ่านรอบขายไม่ขึ้นบนหน้าใบ = ไม่บล็อกหน้าใบ (`serviceTermZonesError` · จำนวน null ⇒ ไม่มีบรรทัด ไม่ใช่ "0 โซน")
//   ส่วนทะเบียนการชำระโยนเหมือนทุกก้อนที่ทะเบียนอ่าน (ตัวเลขทั้งหน้าผิดเงียบ ๆ แย่กว่า 500)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FN_SERVICE_GATE_LINE, FN_SERVICE_GATE_UNREAD_MODAL, FN_SERVICE_GATE_UNREAD_PANEL, paymentConfirmPrompt } from '../approvalPrompt.js';
import { installmentConfirmOutlook } from './salesOrderPayments.js';
import { coversDate, hasOverdueUnconfirmed } from './paymentCoverage.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const code = (rel) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอใน source`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}
const count = (text, needle) => text.split(needle).length - 1;

const SO_ROUTE = 'app/api/sales-planning/sales-orders/[id]/route.js';
const FN_ROUTE = 'app/api/finance/payments/route.js';
const DIALOG = 'components/salesPlanning/InstallmentConfirmDialog.js';
const PANEL = 'components/salesPlanning/SalesOrderPaymentPanel.js';
const FN_PAGE = 'app/finance/payments/page.js';

test('🔴 GET ใบสั่งขาย: นับโซนของรอบขายที่มีผลเฉพาะใบที่เปิดงานแล้ว · อ่านไม่ขึ้นไม่บล็อกหน้าใบ (serviceTermZonesError · null)', () => {
  const route = code(SO_ROUTE);
  assert.match(route, /import \{[^}]*\bserviceTermZoneCount\b[^}]*\} from '@\/lib\/service\/terms';/);
  assert.match(route, /import \{[^}]*\btermOrderActive\b[^}]*\} from '@\/lib\/service\/terms';/);
  const load = slice(route, 'async function loadOrder(', 'async function loadApproverSignature(');
  assert.equal(count(load, ".from('service_zone_terms')"), 1, 'อ่านรอบขายของใบจุดเดียว');

  const block = slice(load, 'if (extras && termOrderActive(order) && order.serviceTermsOpenedAt) {', 'if (extras && historical) {');
  assert.match(block, /await fetchAllResult\(\(\) => supabase\.from\('service_zone_terms'\)\s*\.select\('id, "zoneId"'\)\.eq\('salesOrderId', order\.id\)\.order\('id', \{ ascending: true \}\)\)/);
  assert.match(block, /if \(termError\) \{[\s\S]*serviceTermZones = null;[\s\S]*serviceTermZonesError = `อ่านรอบขายของใบไม่สำเร็จ: /);
  assert.match(block, /serviceTermZones = serviceTermZoneCount\(termRows \|\| \[\], order\);/);
  assert.doesNotMatch(block, /\bthrow\b/, 'ข้อเท็จจริงของโมดัล — อ่านพลาดต้องไม่ทำให้หน้าใบ 500');
  assert.match(load, /let serviceTermZones = 0;\s*let serviceTermZonesError = null;/);

  const ret = slice(load, 'return {\n    ...order,', '};');
  assert.match(ret, /serviceTermZones,\s*serviceTermZonesError,\s*serviceContractLinked: !!order\.serviceContractId,/);
});

test('🔴 ทะเบียนการชำระ: โซนของรอบขายที่มีผลต่อใบ (ซอยก้อน + ไล่หน้า · อ่านไม่ขึ้น = โยน) + ธงผูกสัญญา เข้าแถวทะเบียน', () => {
  const route = code(FN_ROUTE);
  assert.match(route, /import \{[^}]*\bserviceTermZoneCount\b[^}]*\btermOrderActive\b[^}]*\} from '@\/lib\/service\/terms';/);
  const orders = slice(route, ".from('sales_orders')", '.in(');
  for (const column of ['"serviceTermsOpenedAt"', '"supersededById"', '"serviceContractId"']) {
    assert.ok(orders.includes(column), `select ใบต้องพก ${column}`);
  }
  const load = slice(route, 'async function loadLedger(', 'const listParam');
  assert.match(load, /\(orders \|\| \[\]\)\.filter\(\(o\) => termOrderActive\(o\) && o\.serviceTermsOpenedAt\)\.map\(\(o\) => o\.id\)/);
  assert.match(load, /fetchInChunks\(liveServiceOrderIds, \(chunk\) => fetchAllResult\(\(\) => supabase\s*\n\s*\.from\('service_zone_terms'\)\.select\('id, "salesOrderId", "zoneId"'\)\.in\('salesOrderId', chunk\)\.order\('id', \{ ascending: true \}\)\)\)/);
  assert.match(load, /if \(termError\) throw termError;/);
  const call = slice(load, 'return ledgerRow({', '});');
  assert.match(call, /serviceTermZones: serviceTermZonesByOrder\.get\(order\.id\) \|\| 0,/);
  assert.match(call, /serviceContractLinked: !!order\.serviceContractId,/);
  /* ค่าระดับใบ ⇒ ต้องรู้ก่อนสร้างแถว (ไม่ใช่ประทับทีหลังจากแถวที่กรองแล้ว) */
  assert.ok(load.indexOf('serviceTermZonesByOrder') < load.indexOf('return ledgerRow({'));
});

test('🔴 โมดัลรับรอง: ส่งจำนวนโซน + ธงผูกสัญญาเข้า paymentConfirmPrompt · ใบจาก GET ก่อน แถวทะเบียนรอง · ไม่รู้ = 0 / ผูกแล้ว', () => {
  const dialog = code(DIALOG);
  assert.match(dialog, /orderStatus = null,\s*serviceZones = 0, serviceContractLinked = true,\s*\} = \{\}\) \{/);
  const prompt = slice(dialog, 'paymentConfirmPrompt({', '});');
  assert.match(prompt, /serviceZoneCount: serviceZones,\s*serviceContractLinked,\s*orderStatus,\s*$/);
  const call = slice(dialog, 'const prompt = installmentConfirmPrompt({', '});');
  assert.match(call, /serviceZones: Number\(order\?\.serviceTermZones \?\? row\.serviceTermZones\) \|\| 0,/);
  assert.match(call, /serviceContractLinked: order\?\.serviceContractLinked \?\? row\.serviceContractLinked \?\? true,/);
});

test('🔴 แผงงวด: "บันทึกการรับชำระ" ของบัญชี (แจ้ง+รับรองในก้าวเดียว) พูดบรรทัดเดียวกับโมดัลรับรอง', () => {
  const panel = code(PANEL);
  const report = slice(panel, 'const reportPrompt = (row) => (confirmsNow(row)', ': null);');
  assert.match(report, /orderStatus: order\?\.status,\s*serviceZones: order\?\.serviceTermZones \?\? 0, serviceContractLinked: order\?\.serviceContractLinked \?\? true,/);
});

test('🔴 ทะเบียนการชำระ (จอ): โมดัลรับรองได้จำนวนโซน + ธงผูกสัญญาจากแถวทะเบียน', () => {
  const page = code(FN_PAGE);
  const dialog = slice(page, '<InstallmentConfirmDialog', '/>');
  assert.match(dialog, /status: confirmFor\.orderStatus,\s*serviceTermZones: confirmFor\.serviceTermZones, serviceContractLinked: confirmFor\.serviceContractLinked,/);
});

/* ── review 29/09: "ถึง {จ่ายถึง}" สัญญาเกินที่ด่านเงินเปิดจริง ────────────────────────────────────────────
   🐞 ด่านเงินของนัด (visitGate ข้อ②) = `coversDate(rows, วันนัด) && !hasOverdueUnconfirmed(rows, วันนัด)` — งวดอื่นที่ยังไม่รับรอง
      และครบกำหนดก่อนวันนัด บล็อกนัดวันนั้นทั้งที่ "จ่ายถึง" ครอบ ⇒ บรรทัดต้องพูดวันที่ด่านเปิดจริง (`gateOpenThrough`)
   ⚠️ `hasOverdueUnconfirmed` ใช้ due < วันนัด ⇒ นัดวันครบกำหนดพอดียังผ่าน ⇒ เพดาน = วันครบกำหนด (ไม่ใช่วันก่อนหน้า) */
const gateOpen = (rows, day) => coversDate(rows, day) && !hasOverdueUnconfirmed(rows, day);
const nextDay = (iso) => new Date(Date.parse(`${iso}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
const afterConfirm = (rows, id) => rows.map((r) => (r.id === id ? { ...r, status: 'confirmed' } : r));
const bullets = (p) => p.detail.split('\n').filter((l) => l.startsWith('· '));

test('🔴 (a) รับรองงวด 2 ทั้งที่งวด 1 ยังรอรับรองและครบกำหนดก่อน → เปิดด่านถึงวันครบกำหนดของงวด 1 เท่านั้น', () => {
  const rows = [
    { id: 'i1', seq: 1, status: 'reported', amount: 100, dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-12-31' },
    { id: 'i2', seq: 2, status: 'reported', amount: 100, dueDate: '2027-01-01', coversFrom: '2027-01-01', coversTo: '2027-03-31' },
  ];
  const outlook = installmentConfirmOutlook(rows[1], rows);
  assert.equal(outlook.paidThrough, '2027-03-31', '"จ่ายถึง" ไม่เปลี่ยนความหมาย');
  assert.equal(outlook.gateOpenThrough, '2026-10-01');
  assert.deepEqual(outlook.gateHeldBy, { seq: 1, dueDate: '2026-10-01' });
  const after = afterConfirm(rows, 'i2');
  assert.equal(gateOpen(after, outlook.gateOpenThrough), true, 'วันที่พูดต้องเปิดจริง');
  assert.equal(gateOpen(after, nextDay(outlook.gateOpenThrough)), false, 'วันถัดไปต้องยังติด');
});

test('🔴 (b) ใบจ่ายล่วงหน้า: งวดถัดไปครบกำหนด 16/10 ก่อนปลายช่วงงวดนี้ 26/10 → เปิดด่านถึง 16/10', () => {
  const rows = [
    { id: 's2', seq: 2, status: 'reported', amount: 100, dueDate: '2026-09-27', coversFrom: '2026-09-27', coversTo: '2026-10-26' },
    { id: 's3', seq: 3, status: 'pending', amount: 100, dueDate: '2026-10-16', coversFrom: '2026-10-27', coversTo: '2026-11-26' },
  ];
  const outlook = installmentConfirmOutlook(rows[0], rows);
  assert.equal(outlook.paidThrough, '2026-10-26');
  assert.equal(outlook.gateOpenThrough, '2026-10-16');
  assert.deepEqual(outlook.gateHeldBy, { seq: 3, dueDate: '2026-10-16' });
  const after = afterConfirm(rows, 's2');
  assert.equal(gateOpen(after, '2026-10-16'), true);
  assert.equal(gateOpen(after, '2026-10-17'), false);
});

test('(c) ไม่มีงวดอื่นค้างที่ครบกำหนดก่อน "จ่ายถึง" → วันเดียวกับจ่ายถึง · บรรทัดเดิมทุกตัวอักษร', () => {
  const rows = [
    { id: 'o1', seq: 1, status: 'reported', amount: 100, dueDate: '2026-10-01', coversFrom: '2026-10-01', coversTo: '2026-10-31' },
    { id: 'o2', seq: 2, status: 'pending', amount: 100, dueDate: '2026-10-31', coversFrom: '2026-11-01', coversTo: '2026-11-30' },
  ];
  const outlook = installmentConfirmOutlook(rows[0], rows);
  assert.equal(outlook.gateOpenThrough, '2026-10-31', 'ครบกำหนดวันเดียวกับปลายช่วง = ไม่ลด (due < วันนัด เท่านั้นที่บล็อก)');
  assert.equal(outlook.gateHeldBy, null);
  const after = afterConfirm(rows, 'o1');
  assert.equal(gateOpen(after, '2026-10-31'), true);
  assert.equal(gateOpen(after, '2026-11-01'), false);
  // ไม่มีช่วงครอบ = ไม่มีวันให้พูด
  assert.equal(installmentConfirmOutlook({ id: 'x', seq: 1, amount: 1 }, []).gateOpenThrough, null);
  assert.deepEqual(installmentConfirmOutlook(null, rows), { paidThrough: null, collected: 0, next: null, gateOpenThrough: null, gateHeldBy: null });
});

test('🔴 บรรทัดด่านเงินพูดวันที่ด่านเปิดจริง + งวดที่ยังค้าง — ไม่ใช่ "จ่ายถึง"', () => {
  const held = FN_SERVICE_GATE_LINE({ through: '16/10/2026', zones: 1, heldBy: { seq: 3, dueLabel: '16/10/2026' } });
  assert.equal(held, 'เปิดด่านเงินของนัดบริการของใบนี้ถึง 16/10/2026 (1 โซน) — นัดหลังจากนั้นยังติดด่านเงินจนกว่าจะรับรองงวดที่ 3 (ครบกำหนด 16/10/2026)');
  assert.equal(FN_SERVICE_GATE_LINE({ through: '16/10/2026', zones: 1, contractLinked: false, heldBy: { seq: 3, dueLabel: '16/10/2026' } }),
    `${held} · นัดยังติดด่านสัญญาจนกว่าฝ่ายขาย (SA) ผูกสัญญา`);
  const base = { label: 'งวดที่ 2', amount: '฿100.00', paidThroughLabel: '26/10/2026', serviceZoneCount: 1 };
  const prompt = paymentConfirmPrompt({ ...base, serviceGateThroughLabel: '16/10/2026', serviceGateHeld: { seq: 3, dueLabel: '16/10/2026' } });
  assert.equal(bullets(prompt)[1], `· ${held}`);
  assert.doesNotMatch(prompt.detail, /ถึง 26\/10\/2026/, 'ห้ามพูด "จ่ายถึง" เป็นวันที่ด่านเปิด เมื่อมีงวดค้างกดไว้');
  // ไม่ส่งวันเปิดด่าน = ถอยไปจ่ายถึง (ผู้เรียกเก่า)
  assert.deepEqual(paymentConfirmPrompt(base), paymentConfirmPrompt({ ...base, serviceGateThroughLabel: null, serviceGateHeld: null }));
});

test('🔴 โมดัล: ส่งวันเปิดด่าน (gateOpenThrough) + งวดที่ค้าง จาก outlook เข้า paymentConfirmPrompt — ก่อนคีย์โซน', () => {
  const dialog = code(DIALOG);
  const fn = slice(dialog, 'export function installmentConfirmPrompt(', 'export default function');
  assert.match(fn, /const gateThrough = outlook\?\.gateOpenThrough \|\| through;/);
  const prompt = slice(fn, 'paymentConfirmPrompt({', '});');
  assert.match(prompt, /serviceGateThroughLabel: gateThrough \? fmtDate\(gateThrough\) : null,/);
  assert.match(prompt, /serviceGateHeld: outlook\?\.gateHeldBy\s*\?\s*\{ seq: outlook\.gateHeldBy\.seq, dueLabel: fmtDate\(outlook\.gateHeldBy\.dueDate\) \}\s*:\s*null,/);
  assert.ok(prompt.indexOf('serviceGateThroughLabel') < prompt.indexOf('serviceZoneCount'));
});

/* ── review 29/09: `serviceTermZonesError` เคยไม่มีจอไหนอ่าน ⇒ อ่านรอบขายไม่ขึ้น = โมดัลไม่มีบรรทัดด่านเงิน และไม่บอกอะไรเลย
   (หน้าตาเหมือนใบที่ไม่มีโซนบริการทุกประการ — "อ่านพลาดต้องไม่เหมือนไม่มี") · เหลือง ไม่ใช่แดง (แดงเฉพาะหลังกด) */
test('🔴 อ่านรอบขายไม่ขึ้น: แผงงวด + โมดัลบันทึกการรับชำระ + โมดัลรับรอง บอกว่าไม่รู้ผลต่อนัดบริการ (StatusNotice เหลือง นอก <p>)', () => {
  assert.match(FN_SERVICE_GATE_UNREAD_PANEL, /ด่านเงินของนัดบริการ/);
  assert.match(FN_SERVICE_GATE_UNREAD_MODAL, /ด่านเงินของนัดบริการ/);
  const panel = code(PANEL);
  assert.match(panel, /\{order\?\.serviceTermZonesError \? <StatusNotice tone="warning">\{order\.serviceTermZonesError\} — \{FN_SERVICE_GATE_UNREAD_PANEL\}<\/StatusNotice> : null\}/);
  assert.ok(panel.indexOf('order?.serviceTermZonesError ? <StatusNotice') > panel.indexOf('order?.moneyLinksError ?'), 'อยู่ข้างแถบ moneyLinksError');
  const report = slice(panel, 'const prompt = reportPrompt(reportRow);', '</Modal>');
  assert.match(report, /\{prompt && order\?\.serviceTermZonesError \? <StatusNotice tone="warning">\{FN_SERVICE_GATE_UNREAD_MODAL\}<\/StatusNotice> : null\}/);
  const dialog = code(DIALOG);
  assert.match(dialog, /import StatusNotice from "@\/components\/ui\/StatusNotice";/);
  const body = slice(dialog, '<p className={styles.lead}>{prompt.description}</p>', '<dl className={styles.facts}>');
  assert.match(body, /\{order\?\.serviceTermZonesError && !historical \? <StatusNotice tone="warning">\{FN_SERVICE_GATE_UNREAD_MODAL\}<\/StatusNotice> : null\}/);
});
