// ── ยามต้นทางของเส้นเขียนใบสั่งขายย้อนหลัง (mig 0360) ──────────────────────────────────
// เส้นที่ทดสอบด้วย supabase ปลอมไม่ได้ทั้งเส้น (route ยาว · ต้องมีตัวตนจริง) → ตรึงรูปในซอร์สไว้
// ⚠️ ยามรายการเงิน/ตัวอ่าน KPI ทั้งระบบเป็นของไฟล์ historicalMoneyGuards (งานรอบถัดไป) ไม่ใช่ไฟล์นี้
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอ`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}

test('PATCH ใบสั่งขาย set_payment_gate_exemption: สิทธิ์ AE Sup/Admin · ใบย้อนหลังที่อนุมัติ · ใบ 0 บาทถอดไม่ได้ · audit', () => {
  const route = stripComments(read('app/api/sales-planning/sales-orders/[id]/route.js'));
  const block = slice(route, "if (action === 'set_payment_gate_exemption')", "if (action === 'set_service_rounds')");
  for (const needle of [
    'canKeyHistoricalSalesOrder(user)', 'isHistoricalOrder(before)', "before.status !== 'approved'",
    'paymentNotRequired(before.totalAmount)', 'exemptReasonError(reason)', 'historicalRowsOnly(',
    ".eq('status', 'approved')", 'recordAudit(',
  ]) {
    assert.ok(block.includes(needle), `ขาด ${needle}`);
  }
  /* 🐞 exempt ที่ไม่ใช่ boolean (ลืมส่ง / "true" / 1) ต้อง 400 — ห้ามตกทางถอดการยกเว้น */
  const typed = block.indexOf("if (typeof body.exempt !== 'boolean')");
  assert.ok(typed > 0 && typed < block.indexOf('const exempt = body.exempt;'), 'ตรวจชนิดก่อนอ่านค่า');
  assert.match(block, /if \(typeof body\.exempt !== 'boolean'\) \{\s*return badRequest\(/);
  assert.doesNotMatch(block, /body\.exempt === true/);
});

test('POST งวด action append: ด่านก่อนทางกู้เดิม · RPC ล็อกหัวใบ · ใบย้อนหลังไม่ตกไปข้อความใบเสนอราคา', () => {
  const route = stripComments(read('app/api/sales-planning/sales-orders/[id]/installments/route.js'));
  const post = slice(route, 'export const POST', 'export const PATCH');
  const append = post.indexOf("body?.action === 'append'");
  const recovery = post.indexOf('ensureInstallments(');
  assert.ok(append > 0 && recovery > append, 'append ต้องมาก่อน ensureInstallments');
  const block = post.slice(append, recovery);
  for (const needle of [
    'canKeyHistoricalSalesOrder(user)', 'inSalesEditScope(user, order.deal)', 'isHistoricalOrder(order)',
    'validateHistoricalInstallments(', "rpc('append_historical_installments'", 'recordAudit(', 'documentWorkflowError(',
  ]) {
    assert.ok(block.includes(needle), `ขาด ${needle}`);
  }
  assert.match(block, /if \(isHistoricalOrder\(order\)\) \{\s*return badRequest\(/);
  assert.doesNotMatch(block, /freezeInstallments/);
});

test('PATCH ดีล: ย้ายเจ้าของดีลภาชนะ = AE Sup/Admin + ตรวจดีลภาชนะของ AE ปลายทางก่อนเขียน + แปล error ของฐาน', () => {
  const route = stripComments(read('app/api/sales-planning/deals/[id]/route.js'));
  const patch = slice(route, 'export const PATCH', 'export const DELETE');
  const move = patch.indexOf('const historicalOwnerMove');
  const owner = patch.indexOf("if ('ownerId' in body)");
  const write = patch.indexOf('.update(patch)');
  assert.ok(owner > 0 && move > owner && write > move, 'ด่านย้ายเจ้าของต้องอยู่หลัง validateDealOwner และก่อนเขียนดีล');
  const gate = patch.slice(move, write);
  for (const needle of ['isHistoricalDeal(before)', 'canKeyHistoricalSalesOrder(user)', 'historicalRowsOnly(', 'historicalOwnerTakenMessage(']) {
    assert.ok(gate.includes(needle), `ขาด ${needle}`);
  }
  /* ทีมตามดีล (คำตอบข้อ 1): AE ปลายทางไม่มีทีม = 400 · team ถูกทับด้วยทีมของ AE ปลายทางเสมอ (body.team ค้างไม่รอด) */
  assert.match(patch, /ownerTeam = checked\.team \|\| null;/);
  assert.match(gate, /if \(!ownerTeam\) \{\s*return badRequest\('AE คนนี้ยังไม่มีทีม/);
  const noTeam = gate.indexOf('if (!ownerTeam)');
  const retag = gate.indexOf('patch.team = ownerTeam;');
  assert.ok(gate.indexOf('canKeyHistoricalSalesOrder(user)') < noTeam && noTeam < retag, 'สิทธิ์ → ทีม → ทับทีม');
  assert.ok(retag < gate.indexOf('historicalRowsOnly('), 'ทับทีมก่อนค้นดีลชน/เขียน');
  assert.ok(patch.includes('historicalDealWriteMessage(error)'), 'error ตอนเขียนดีลต้องผ่าน historicalDealWriteMessage');
});

test('โอนงานพนักงาน: ดีลเปิดเท่านั้นที่ย้าย · พรีวิว (GET) และผลลัพธ์บอกดีลภาชนะที่ยังค้าง', () => {
  const route = stripComments(read('app/api/users/[id]/transfer/route.js'));
  assert.match(route, /export async function GET\(/);
  const update = slice(route, ".from('sales_deals')\n      .update(", '.select(');
  assert.ok(update.includes(".not('stage', 'in'"), 'ดีลที่ย้ายต้องยังกรองเฉพาะดีลเปิด');
  assert.doesNotMatch(update, /origin/);
  assert.ok(route.includes('historicalRowsOnly('));
  assert.ok(route.includes('result.historicalDeals ='));
});

test('POST สัญญา: ดีลภาชนะรับเฉพาะเอกสารแทนสัญญาชนิดบริการ · ไม่แตะใบเสนอราคาที่ไม่มีอยู่จริง', () => {
  const route = stripComments(read('app/api/sales-planning/contracts/route.js'));
  const post = slice(route, 'export const POST');
  assert.ok(post.includes('isHistoricalDeal(deal)'));
  assert.ok(post.includes("!external || body.kind !== 'service'"));
  const guard = post.indexOf('isHistoricalDeal(deal)');
  assert.ok(guard < post.indexOf('contractEligibility('), 'ด่านดีลภาชนะต้องมาก่อนด่านสิทธิ์ออกสัญญา');
  assert.doesNotMatch(post, /\bquotation\.[A-Za-z]/, 'ใบเสนอราคาของดีลภาชนะเป็น null — ต้อง quotation?.');
});

test('literal "historical" และตัวกรอง .eq("origin") มีบ้านเดียว — ไฟล์ที่เส้นเขียนแตะไม่พิมพ์เอง', () => {
  for (const rel of [
    'lib/sales/historicalOrderPlan.js',
    'lib/sales/historicalOrderCommit.js',
    'app/api/sales-planning/sales-orders/historical/route.js',
    'app/api/sales-planning/sales-orders/[id]/route.js',
    'app/api/sales-planning/sales-orders/[id]/installments/route.js',
    'app/api/sales-planning/deals/[id]/route.js',
    'app/api/sales-planning/contracts/route.js',
    'app/api/users/[id]/transfer/route.js',
    'lib/sales/serviceContractLink.js',
    'lib/sales/contracts.js',
  ]) {
    const code = stripComments(read(rel));
    assert.doesNotMatch(code, /['"`]historical['"`]/, rel);
    assert.doesNotMatch(code, /\.(n?eq)\(\s*['"]origin['"]/, rel);
  }
});

/* ── ตัดสินจุดที่ TS ไม่พบหน้างาน (มติ 16/09/2026 ข้อ 23 · mig 0362) ──────────── */
test('PATCH ใบสั่งขาย: ตัดสินจุดที่ TS ไม่พบ — สิทธิ์ · ใบย้อนหลังที่อนุมัติ · ตัดสินซ้ำไม่ได้ · audit', () => {
  const route = stripComments(read('app/api/sales-planning/sales-orders/[id]/route.js'));
  const block = slice(route, "if (action === 'rename_installation_point'", "if (action === 'set-doc-language')");
  for (const needle of [
    'canKeyHistoricalSalesOrder(user)', 'isHistoricalOrder(before)', "before.status !== 'approved'",
    'lineAwaitingSiteDecision(line)', 'installationPointError(point)', 'siteNoteError(', 'recordAudit(',
  ]) {
    assert.ok(block.includes(needle), `ขาด ${needle}`);
  }
  /* 🪤 ตัวกรองตอนเขียนต้องบอกสถานะที่คาดไว้ด้วย — TS ถอนการแจ้งพอดีตอนฝ่ายขายกด
     ต้องได้ 0 แถวแล้วตอบ 409 ไม่ใช่เขียนตราปิดทับบรรทัดที่ไม่มีธงแล้ว */
  assert.ok(block.includes(".not('siteNotFoundAt', 'is', null)"));
  assert.ok(block.includes(".is('siteClosedAt', null)"));
  assert.ok(block.includes(".eq('salesOrderId', id)"), 'บรรทัดต้องเป็นของใบนี้');

  /* ⭐ แก้ชื่อจุด = **ข้อยกเว้นเดียว** ของ "บรรทัด SO เป็นภาพนิ่ง" — ต้องไม่ลามไปช่องอื่น
     ⛔ และต้องไม่มีทางถอดบรรทัด/คิดเงินหัวใบใหม่ (ข2 ยังไม่ทำ) */
  for (const forbidden of ['qty:', 'unitPrice:', 'lineTotal:', 'totalAmount', '.delete()']) {
    assert.ok(!block.includes(forbidden), `🔴 การตัดสินจุดห้ามแตะ ${forbidden}`);
  }
  assert.ok(block.includes('siteFlagClearPatch()'), 'แก้ชื่อต้องล้างธงทั้งชุด');
  assert.ok(block.includes('siteClosePatch('), 'ปิดจุดต้องใช้ตัวประกอบก้อนเดียวกับเทสต์หน่วย');
});

test('ทาง TS เขียนได้เฉพาะธง · ทางฝ่ายขายเขียนได้เฉพาะตราปิด/ชื่อจุด (คนละชุดคอลัมน์)', () => {
  /* TS **อ่าน** ตราปิดได้ (ต้องรู้ว่าถอนการแจ้งไม่ได้แล้ว) แต่ **เขียนไม่ได้**
     · ล้างธงตอนถอน (`siteFlagClearPatch`) ล้างตราปิดไปด้วย ซึ่งเป็นการล้าง ไม่ใช่การประทับ */
  const ts = stripComments(read('app/api/service/intake/site-not-found/route.js'));
  assert.ok(!ts.includes('siteClosePatch('), '🔴 ทางของ TS ห้ามประทับตราปิดจุด');
  assert.ok(!ts.includes('installationPoint:'), '🔴 TS ห้ามแก้ชื่อจุดบนเอกสารของฝ่ายขาย');
  const sales = stripComments(read('app/api/sales-planning/sales-orders/[id]/route.js'));
  const block = slice(sales, "if (action === 'rename_installation_point'", "if (action === 'set-doc-language')");
  assert.ok(!block.includes('siteNotFoundPatch('), '🔴 ฝ่ายขายห้ามตั้งธงแทน TS');
});
