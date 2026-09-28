// ── ด่านเงินของใบบริการขยับไหมหลังรัน 0391 — ธงรายใบก่อน/หลัง (อ่านอย่างเดียว) ──────────────────────────
//
// ⭐ ทำไมต้องมี (#1683 · แผน PR-A §2.2 · §3.5): `orderHasServiceRounds` คือสวิตช์ของด่าน "ใบบริการต้องมีช่วงครอบ
//   ก่อนบัญชีรับรองงวด" — 0391 เพิ่ม `serviceFgCode` ให้บรรทัดพิมพ์เองนับเป็นแพ็คเกจ **เฉพาะหลังใบประทับ
//   `serviceTermsOpenedAt`** ⇒ ใบที่ยังไม่ประทับต้องได้ธงเดิมทุกใบ ถ้าขยับ = บัญชีรับรองงวดของใบจริงไม่ได้ทันที
//   ไม่ใช่ตัวเลขที่ฮาร์ดโค้ดไว้ (prod ขยับทุกวัน) — เทียบ **ธงรายใบ** กับฐานที่จับไว้ก่อนรัน 0391
//
// ประชากร: ใบ pipeline ทุกใบที่ไม่ใช่ cancelled/revised — route งวดถามด่านนี้กับทุกสถานะ (installments/route.js)
//   รวมร่าง Rev. ที่มีงวดย้ายมา · `select('*')` ทนคอลัมน์ 0391 ที่ยังไม่มีก่อนรัน
// บริบท: ต้องโหลดโครงการ/ดีลมาด้วย — ไม่งั้นสายของใบเป็น null แล้ว `orderHasServiceRounds` ตอบ false ทุกใบ
//   (สคริปต์จะ "ผ่าน" โดยไม่ได้พิสูจน์อะไรเลย) ⇒ ยืนยันว่ามีอย่างน้อยหนึ่งใบที่ธงเป็นจริงด้วย
//
// Usage (รันจากโฟลเดอร์ webapp — loader map '@/' ไปที่ <cwd>/src · อ่าน .env.local):
//   node --import ./scripts/test-loader.mjs scripts/check-service-money-scope.mjs --save-baseline   (ก่อนรัน 0391)
//   node --import ./scripts/test-loader.mjs scripts/check-service-money-scope.mjs --compare         (หลัง deploy)
//   --out <ไฟล์>  ใช้ไฟล์อื่นแทนค่าตั้งต้น (ซ้อมรันโดยไม่ทับฐานจริง)
//
// ⚠️ อ่านอย่างเดียว — SELECT ล้วน ไม่มีการเขียนฐานเลย (dev DB = prod DB) · เขียนแค่ไฟล์ JSON ของฐานเทียบ
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fetchAllResult } from '../src/lib/supabaseFetchAll.js';
import { fetchInChunks } from '../src/lib/supabaseInChunks.js';
import { pipelineRowsOnly } from '../src/lib/sales/historicalOrders.js';
import { orderHasServiceRounds } from '../src/lib/sales/serviceOrders.js';

const DEFAULT_OUT = '/Users/scentandsense/ss-team/mockups/so-service-lines/money-scope-baseline.json';

const args = process.argv.slice(2);
const mode = args.includes('--save-baseline') ? 'save' : args.includes('--compare') ? 'compare' : null;
const outIndex = args.indexOf('--out');
const OUT = outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : DEFAULT_OUT;
if (!mode) {
  console.error('ระบุโหมด: --save-baseline (ก่อนรัน 0391) หรือ --compare (หลัง deploy) · --out <ไฟล์> ได้');
  process.exit(2);
}

try {
  const env = readFileSync(new URL('../.env.local', import.meta.url), 'utf8');
  for (const line of env.split('\n')) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
} catch { /* ไม่มี .env.local — ใช้ env ของเชลล์ */ }

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error('ไม่มี SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (ตั้งใน .env.local)');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

const die = (what, error) => {
  console.error(`✗ อ่าน ${what} ไม่สำเร็จ: ${error?.message || error}`);
  process.exit(1);
};

/* ── อ่าน ─────────────────────────────────────────────────────────────────────────────────────────── */
async function loadFlags() {
  const { data: orders, error: ordersError } = await fetchAllResult(
    () => pipelineRowsOnly(supabase.from('sales_orders').select('*'))
      .not('status', 'in', '(cancelled,revised)')
      .order('id'),
  );
  if (ordersError) die('sales_orders', ordersError);

  const orderIds = orders.map((o) => o.id);
  const { data: lines, error: linesError } = await fetchInChunks(orderIds, (chunk) => fetchAllResult(
    () => supabase.from('sales_order_lines').select('*').in('salesOrderId', chunk).order('id'),
  ));
  if (linesError) die('sales_order_lines', linesError);

  const projectIds = orders.map((o) => o.projectId).filter(Boolean);
  const { data: projects, error: projectsError } = await fetchInChunks(projectIds, (chunk) => fetchAllResult(
    () => supabase.from('projects').select('id, line').in('id', chunk).order('id'),
  ));
  if (projectsError) die('projects', projectsError);

  const dealIds = orders.map((o) => o.dealId).filter(Boolean);
  const { data: deals, error: dealsError } = await fetchInChunks(dealIds, (chunk) => fetchAllResult(
    () => supabase.from('sales_deals').select('id, line').in('id', chunk).order('id'),
  ));
  if (dealsError) die('sales_deals', dealsError);

  const ctx = {
    projectsById: new Map(projects.map((p) => [p.id, p])),
    dealsById: new Map(deals.map((d) => [d.id, d])),
  };
  const linesByOrder = new Map();
  for (const line of lines) {
    if (!linesByOrder.has(line.salesOrderId)) linesByOrder.set(line.salesOrderId, []);
    linesByOrder.get(line.salesOrderId).push(line);
  }

  const rows = {};
  for (const order of orders) {
    const orderLines = linesByOrder.get(order.id) || [];
    rows[order.id] = {
      orderNumber: order.orderNumber || null,
      flag: orderHasServiceRounds(order, orderLines, ctx),
      status: order.status,
      stamped: !!order.serviceTermsOpenedAt,
      manualPackage: orderLines.some((l) => !l.fgCode && !l.productId && l.serviceFgCode),
    };
  }
  return rows;
}

/* ── รัน ──────────────────────────────────────────────────────────────────────────────────────────── */
const rows = await loadFlags();
const ids = Object.keys(rows);
const flagged = ids.filter((id) => rows[id].flag).length;
console.log(`ใบ pipeline ที่ไม่ใช่ cancelled/revised: ${ids.length} ใบ · ธงด่านเงิน (orderHasServiceRounds) จริง ${flagged} ใบ`);
if (!ids.length) die('ประชากร', 'ไม่มีใบเลย — ตรวจการเชื่อมต่อ/ตัวกรอง');
if (!flagged) die('บริบทสาย', 'ธงจริง 0 ใบ — สายของใบอ่านไม่ได้ (โครงการ/ดีลไม่มา) สคริปต์ไม่ได้พิสูจน์อะไร');

if (mode === 'save') {
  const capturedAt = new Date().toISOString();
  const baseline = {
    capturedAt,
    rows: Object.fromEntries(ids.map((id) => [id, { flag: rows[id].flag, status: rows[id].status, stamped: rows[id].stamped }])),
  };
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(baseline, null, 2)}\n`);
  console.log(`✓ บันทึกฐานเทียบ ${ids.length} ใบ → ${OUT}`);
  process.exit(0);
}

let baseline;
try {
  baseline = JSON.parse(readFileSync(OUT, 'utf8'));
} catch (error) {
  die(`ฐานเทียบ ${OUT} (รัน --save-baseline ก่อนรัน 0391)`, error);
}
const before = baseline.rows || {};
const fail = [];
const stamped = [];
const appeared = [];
const gone = [];
for (const id of ids) {
  const was = before[id];
  const now = rows[id];
  if (!was) { appeared.push(id); continue; }
  if (now.stamped && !was.stamped) {
    stamped.push({ id, now, was });
    continue;
  }
  if (!now.stamped && now.flag !== was.flag) fail.push({ id, now, was });
}
for (const id of Object.keys(before)) if (!rows[id]) gone.push(id);

const tag = (id) => `${rows[id]?.orderNumber || id}`;
console.log(`ฐานเทียบจับไว้เมื่อ ${baseline.capturedAt} · ${Object.keys(before).length} ใบ`);
console.log(`FAIL (ยังไม่ประทับแต่ธงเปลี่ยน): ${fail.length}`);
for (const { id, now, was } of fail) console.log(`  ✗ ${tag(id)} · ${was.flag} → ${now.flag} · สถานะ ${was.status} → ${now.status}`);
console.log(`INFO ประทับหลังจับฐาน: ${stamped.length} (ธงพลิกเป็นแคบได้เฉพาะใบที่มีบรรทัดพิมพ์เองที่ตั้งแพ็คเกจ)`);
for (const { id, now, was } of stamped) {
  const expected = now.flag === was.flag || (now.flag && now.manualPackage);
  console.log(`  ${expected ? '·' : '?'} ${tag(id)} · ${was.flag} → ${now.flag}${now.manualPackage ? ' · มีแพ็คเกจพิมพ์เอง' : ''}`);
}
console.log(`INFO ใบใหม่ ${appeared.length} · หายไป (ยกเลิก/ถูก Rev. ทับ) ${gone.length}`);
if (fail.length) {
  console.error('✗ ด่านเงินขยับบนใบที่ยังไม่ประทับ — ตรวจตัวตัดสิน effectiveServiceFgCode ก่อนปลดล็อก');
  process.exit(1);
}
console.log('✓ ไม่มีใบที่ยังไม่ประทับเปลี่ยนธงด่านเงิน');
