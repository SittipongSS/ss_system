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

/* ── ขั้นเดินงานของใบย้อนหลังบนเส้น PATCH ใบสั่งขาย (mig 0374 · มติ 22/09) ─────────────────────────────
   ⭐ กิ่งของใบย้อนหลังต้องมาก่อนโค้ดของใบปกติ — ทางของใบปกติเก็บลายเซ็น · ตรึงฉบับ · ตั้ง financeStatus · หยุดยอดงวดจากแผน
     ของใบเสนอราคา ซึ่ง CHECK ของ 0374 ห้าม (ลายเซ็น/financeStatus) หรือทำลายงวดที่คีย์ ("ชำระเต็มจำนวน" 100%) */
test('PATCH ใบสั่งขาย submit/approve: กิ่งใบย้อนหลังมาก่อนด่านและ RPC ของใบปกติ แล้วส่งต่อตัวเดินงานกลาง', () => {
  const route = stripComments(read('app/api/sales-planning/sales-orders/[id]/route.js'));
  const submit = slice(route, "if (action === 'submit')", "if (action === 'approve')");
  const s = submit.indexOf('if (isHistoricalOrder(before))');
  assert.ok(s > 0, 'submit ต้องตรวจใบย้อนหลังก่อน');
  assert.ok(s < submit.indexOf('submitHistoricalOrder('), 'ส่งต่อ submitHistoricalOrder');
  for (const pipeline of ["before.status)) return badRequest('SO ใบนี้ยื่นอนุมัติไม่ได้')", 'canSubmitSalesOrder(', 'salesOrderConfirmationGate(', 'submitSalesOrderWithSignatureEvidence(']) {
    assert.ok(submit.indexOf('submitHistoricalOrder(') < submit.indexOf(pipeline), `กิ่งใบย้อนหลังต้องมาก่อน ${pipeline}`);
  }
  const approve = slice(route, "if (action === 'approve')", "if (action === 'reject')");
  const a = approve.indexOf('if (isHistoricalOrder(before))');
  assert.ok(a > 0 && a < approve.indexOf('approveHistoricalOrder('), 'approve ต้องตรวจใบย้อนหลังแล้วส่งต่อ approveHistoricalOrder');
  for (const pipeline of ['if (!reviewer)', 'approveSalesOrderWithSignatureEvidence(', 'captureIssuedSalesOrderSnapshot(', "financeStatus: 'pending'", 'freezeInstallments(']) {
    assert.ok(approve.indexOf('approveHistoricalOrder(') < approve.indexOf(pipeline), `กิ่งใบย้อนหลังต้องมาก่อน ${pipeline}`);
  }
  // กิ่งใบย้อนหลังคืนคำตอบของตัวเดินงานเลย ไม่ไหลลงทางของใบปกติ
  assert.match(approve, /if \(isHistoricalOrder\(before\)\) \{\s*return historicalReply\(/);
  assert.match(submit, /if \(isHistoricalOrder\(before\)\) \{\s*return historicalReply\(/);
});

test('PATCH ใบสั่งขาย save: ใบย้อนหลังแก้ที่ฟอร์มคีย์ใบเท่านั้น — ปฏิเสธก่อนเขียน', () => {
  const route = stripComments(read('app/api/sales-planning/sales-orders/[id]/route.js'));
  const save = slice(route, "if (action === 'save')", "if (action === 'submit')");
  const guard = save.indexOf('if (isHistoricalOrder(before)) return fail(');
  assert.ok(guard > 0, 'save ต้องปฏิเสธใบย้อนหลัง');
  assert.ok(guard < save.indexOf('.update(patch)'), 'ด่านต้องมาก่อนเขียน');
  assert.ok(save.includes('แก้ใบย้อนหลังที่ฟอร์มคีย์ใบ'));
});

test('PATCH งวด: ส่งล็อกทั้งใบ + ธงใบย้อนหลังเข้าด่านเดียวกับปุ่ม · POST ไม่มีทางคีย์งวดเพิ่มแล้ว · ไม่ทับยอดใบย้อนหลัง', () => {
  const route = stripComments(read('app/api/sales-planning/sales-orders/[id]/installments/route.js'));
  const patch = slice(route, 'export const PATCH');
  const gate = slice(patch, 'installmentActionError(row, action, user, {', '});');
  assert.ok(gate.includes('orderLock: historicalInstallmentLock(order)'), 'ต้องส่ง orderLock');
  assert.ok(gate.includes('historical: isHistoricalOrder(order)'), 'ต้องส่งธงใบย้อนหลัง');
  // CHECK ของงวดที่หลุดด่าน = ข้อความไทยจากตารางกลาง ไม่ใช่ 500 ภาษาอังกฤษ
  const write = slice(patch, 'updated = await updateInstallment(', 'await recordAudit(');
  assert.ok(write.includes('documentWorkflowError(writeError'), 'แปล error ตอนเขียนงวด');
  const post = slice(route, 'export const POST', 'export const PATCH');
  assert.doesNotMatch(post, /append/);
  assert.ok(post.indexOf('if (isHistoricalOrder(order))') < post.indexOf('ensureInstallments('), 'ใบย้อนหลังตีกลับก่อนทางกู้จากใบเสนอราคา');
  assert.doesNotMatch(route, /validateHistoricalInstallments|append_historical_installments/);
  // ยอดของงวดบนจอ: ใบย้อนหลังไม่ผ่าน withLiveAmounts (แผนว่าง = "ชำระเต็มจำนวน" 100% ทับงวดที่คีย์)
  assert.match(route, /const installmentsForScreen = \(order, rows\) => \(isHistoricalOrder\(order\)\s*\? rows\s*: withLiveAmounts\(/);
  assert.equal((route.match(/withLiveAmounts\(/g) || []).length, 1, 'withLiveAmounts เหลือจุดเดียวในตัวเลือกยอด');
});

test('ยกเลิก/ลบใบย้อนหลัง: ไม่มีตัวยกเลิกสัญญาฝั่ง JS — trigger ของ 0374 ทำในทรานแซกชันเดียว · route แค่อ่านผล', () => {
  const route = stripComments(read('app/api/sales-planning/sales-orders/[id]/route.js'));
  const cancel = slice(route, "if (action === 'cancel')", "if (action === 'finance_approve')");
  const del = slice(route, 'export const DELETE');
  for (const [name, block] of [['cancel', cancel], ['DELETE', del]]) {
    assert.doesNotMatch(block, /from\('sales_contracts'\)/, `${name}: route ห้ามแตะตารางสัญญาเอง`);
    assert.doesNotMatch(block, /cancel_sales_contract|cancelHistoricalContract/, `${name}: ห้ามยกเลิกสัญญาซ้ำฝั่ง JS`);
    assert.ok(block.includes('historicalContractVoided(supabase, before)'), `${name}: อ่านผลของ trigger มาบอก`);
  }
  // ตัวอ่านผลในตัวเดินงานกลางอ่านอย่างเดียว — ตัวเดินงานทั้งไฟล์ไม่เขียนตารางเอง (เขียนผ่าน RPC เท่านั้น)
  const workflow = stripComments(read('lib/sales/historicalOrderWorkflow.js'));
  assert.doesNotMatch(workflow, /\.(update|insert|upsert|delete)\(/);
});

/* ยกเลิกใบย้อนหลังที่งวดรอบัญชีรับรอง = งวดค้างคิว "รอคุณรับรอง" + ป้ายเมนูบัญชีถาวร (ล็อกงวดของใบยกเลิกปิดรับรอง/ตีกลับ
   แต่คิว/ป้ายไม่ดูสถานะใบ) ⇒ บัญชีตีกลับก่อน แล้ว AE Sup ค่อยยกเลิก · ด่านกลางตัวเดียวกับปุ่ม */
test('ยกเลิกใบย้อนหลัง: งวดรอบัญชีรับรองบล็อกก่อนเขียน — อ่านงวดสดแบบโยน error · ถามด่านกลาง historicalCancelBlock', () => {
  const route = stripComments(read('app/api/sales-planning/sales-orders/[id]/route.js'));
  const cancel = slice(route, "if (action === 'cancel')", "if (action === 'finance_approve')");
  const gate = cancel.indexOf('historicalCancelBlock(before, liveInstallments)');
  assert.ok(gate > 0, 'ต้องถามด่านกลาง historicalCancelBlock');
  const load = cancel.lastIndexOf('await loadInstallments(supabase, id)', gate);
  assert.ok(load > 0, 'ต้องอ่านงวดสด ไม่ใช่ before.installments (loadOrder กลืนการอ่านพังเป็นรายการว่าง)');
  assert.doesNotMatch(cancel.slice(load, gate), /\.catch\(/, 'อ่านพังต้องตอบ error ไม่ใช่ปล่อยผ่าน');
  assert.match(cancel.slice(load, gate), /catch \(error\) \{ return fail\(/);
  // หลังด่านสิทธิ์ (คนที่ยกเลิกไม่ได้อยู่แล้วไม่ต้องเห็นเหตุเรื่องงวด) · ก่อนทุกทางเขียน
  assert.ok(cancel.indexOf("if (before.status === 'approved' && !reviewer)") < load);
  for (const write of ["rpc('cancel_sales_order_with_reversal_atomic'", ".update(patch)"]) {
    assert.ok(gate < cancel.indexOf(write), `ด่านต้องมาก่อน ${write}`);
  }
});

test('คืนร่างใบย้อนหลัง: ด่านเดิมอยู่ · คอมเมนต์อ้าง trigger no_reopen ของ 0374 (ไม่ใช่ CHECK อีกแล้ว)', () => {
  const raw = read('app/api/sales-planning/sales-orders/[id]/route.js');
  const restore = slice(raw, "if (action === 'restore')", 'export const DELETE');
  const guard = restore.indexOf('if (isHistoricalOrder(before))');
  assert.ok(guard > 0 && guard < restore.indexOf('.update(patch)'));
  assert.ok(restore.includes('sales_orders_historical_no_reopen'), 'คอมเมนต์ต้องอ้าง trigger ตัวจริง');
  assert.doesNotMatch(restore, /CHECK sales_orders_origin_shape ห้ามอยู่แล้ว/);
});

test('PATCH ดีล: ย้ายเจ้าของดีลภาชนะ = AE Sup/Admin + ตรวจดีลภาชนะของ AE ปลายทางก่อนเขียน + แปล error ของฐาน', () => {
  const route = stripComments(read('app/api/sales-planning/deals/[id]/route.js'));
  const patch = slice(route, 'export const PATCH', 'export const DELETE');
  const move = patch.indexOf('const historicalOwnerMove');
  const owner = patch.indexOf("if ('ownerId' in body)");
  const write = patch.indexOf('.update(patch)');
  assert.ok(owner > 0 && move > owner && write > move, 'ด่านย้ายเจ้าของต้องอยู่หลัง validateDealOwner และก่อนเขียนดีล');
  const gate = patch.slice(move, write);
  // ⚠️ ด่านย้ายเจ้าของ ≠ ด่านผู้คีย์ (0374 ขยายผู้คีย์เป็นฝ่ายขายทุกตำแหน่ง แต่ย้ายเจ้าของยังเป็นของหัวหน้า)
  assert.ok(!gate.includes('canKeyHistoricalSalesOrder('), 'ห้ามใช้ด่านผู้คีย์กับการย้ายเจ้าของ');
  for (const needle of ['isHistoricalDeal(before)', 'canMoveHistoricalDealOwner(user)', 'historicalRowsOnly(', 'historicalOwnerTakenMessage(']) {
    assert.ok(gate.includes(needle), `ขาด ${needle}`);
  }
  /* ทีมตามดีล (คำตอบข้อ 1): AE ปลายทางไม่มีทีม = 400 · team ถูกทับด้วยทีมของ AE ปลายทางเสมอ (body.team ค้างไม่รอด) */
  assert.match(patch, /ownerTeam = checked\.team \|\| null;/);
  assert.match(gate, /if \(!ownerTeam\) \{\s*return badRequest\('AE คนนี้ยังไม่มีทีม/);
  const noTeam = gate.indexOf('if (!ownerTeam)');
  const retag = gate.indexOf('patch.team = ownerTeam;');
  assert.ok(gate.indexOf('canMoveHistoricalDealOwner(user)') < noTeam && noTeam < retag, 'สิทธิ์ → ทีม → ทับทีม');
  assert.ok(retag < gate.indexOf('historicalRowsOnly('), 'ทับทีมก่อนค้นดีลชน/เขียน');
  assert.ok(patch.includes('historicalDealWriteMessage(error)'), 'error ตอนเขียนดีลต้องผ่าน historicalDealWriteMessage');
});

/* 0374: ใบย้อนหลังที่ยังไม่อนุมัติผูกเอกสารแทนสัญญาร่างที่ถือทีม/เจ้าของตามดีลตอนคีย์ — ย้ายเจ้าของไม่ซิงก์สองช่องนั้น
   ⇒ ต้องปิดเรื่องก่อน (อนุมัติ/ยกเลิก) · ด่านต้องอยู่หลังด่านสิทธิ์ และก่อนเขียนดีล/ย้ายเจ้าของบนใบ */
test('PATCH ดีล: ดีลภาชนะที่ยังมีใบย้อนหลังไม่อนุมัติ (ร่าง/รออนุมัติ/ตีกลับ) ย้ายเจ้าของไม่ได้ — ตรวจก่อนเขียน', () => {
  const route = stripComments(read('app/api/sales-planning/deals/[id]/route.js'));
  const patch = slice(route, 'export const PATCH', 'export const DELETE');
  const gate = patch.slice(patch.indexOf('const historicalOwnerMove'), patch.indexOf('.update(patch)'));
  const pending = gate.indexOf(".in('status', [...HISTORICAL_UNAPPROVED_STATUSES])");
  assert.ok(pending > 0, 'ต้องถามใบของดีลนี้ด้วยชุดสถานะกลาง HISTORICAL_UNAPPROVED_STATUSES');
  const query = gate.slice(gate.lastIndexOf('historicalRowsOnly(', pending), pending);
  assert.ok(query.includes("from('sales_orders')") && query.includes(".eq('dealId', id)"), 'ใบของดีลนี้เท่านั้น ผ่าน historicalRowsOnly');
  assert.ok(gate.indexOf('canMoveHistoricalDealOwner(user)') < pending, 'ด่านสิทธิ์มาก่อนอ่านใบ');
  assert.match(gate, /if \(unapprovedError\) return fail\(unapprovedError\.message, 500\);/);
  assert.match(gate, /return conflict\(`ดีลนี้มีใบย้อนหลังที่ยังไม่อนุมัติ \(\$\{which\}\) — อนุมัติหรือยกเลิกก่อนย้ายเจ้าของ`\);/);
  // ต้องอยู่ก่อนเขียนดีล และก่อนทางย้ายเจ้าของบนใบ (update sales_orders หลังเขียนดีล)
  assert.ok(patch.indexOf(".in('status', [...HISTORICAL_UNAPPROVED_STATUSES])") < patch.indexOf('.update(patch)'));
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
    'lib/sales/historicalOrderWorkflow.js',
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
