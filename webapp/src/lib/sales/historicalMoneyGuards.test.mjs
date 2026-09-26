// ── ยามเงินของใบสั่งขายย้อนหลัง (mig 0360 · แผน P1 §5) ──────────────────────────────────────
//
// 🔴 ใบย้อนหลังเกิดเป็น `approved` ณ เวลาคีย์ ⇒ ตัวอ่านไหนรวมยอดใบอนุมัติโดยไม่กรอง = ยอดของงานเก่า
//    ทั้งกองโผล่เป็นยอดขายของเดือนที่คีย์ (~220 ใบ) · ดีลภาชนะเป็น Won มูลค่า 0 ⇒ ตัวอ่าน KPI ระดับดีล
//    ที่ไม่ตัดจะนับ Won/ดีลทั้งหมด/Won รอยื่น SO เพี้ยน
// ⭐ ไฟล์นี้กันของใหม่ ไม่ใช่แค่ของที่แก้วันนี้ — สามยาม (คำสั่งอ่านใบสั่งขาย · import ตัวช่วย KPI ระดับดีล ·
//    literal) สแกนทั้ง src แล้วแดงเมื่อมีจุดที่ยังไม่ถูกจัดชั้น · ยามฝั่ง SQL อยู่ที่ historicalSalesOrderMigration
// ⚠️ รายการจัดชั้นทุกตัวต้องมีเหตุผล และต้องยังเจอของจริง (ghost check) — ไฟล์ย้าย/ถูกลบแล้วรายการค้าง = แดง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, sep } from 'node:path';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์โดยคงจำนวนบรรทัด — ข้อความในคอมเมนต์ต้องไม่ทำให้ยามผ่าน/แดงเอง */
const stripComments = (s) => s
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const code = (rel) => stripComments(read(rel));

function sourceFiles(dir = SRC) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sourceFiles(full));
    else if (entry.name.endsWith('.js') && !entry.name.includes('.test.')) out.push(relative(SRC, full).split(sep).join('/'));
  }
  return out;
}
const FILES = sourceFiles();

function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอ`);
  const end = to ? text.indexOf(to, start + from.length) : -1;
  return text.slice(start, end < 0 ? undefined : end);
}

// ── 1. คำสั่งอ่าน sales_orders ─────────────────────────────────────────────────────────────
/* "คำสั่ง" = ย้อนขึ้นไปหาต้นคำสั่งไม่เกิน 4 บรรทัด (ตัวห่อ `fetchAllResult(() => pipelineRowsOnly(supabase`
   อยู่บรรทัดก่อน `.from(`) แล้วเดินลงจนเจอ `;` หรือ `,` ที่วงเล็บปิดครบ (สมาชิกของ Promise.all) ไม่เกิน 20 บรรทัด
   + บรรทัดที่ต่อตัวแปรเดิมทีหลัง (`query = pipelineRowsOnly(query);`) — แพตเทิร์น `let query = supabase…` */
const SO_FROM = /\.from\(\s*['"]sales_orders['"]\s*\)/;
const DEALS_FROM = /\.from\(\s*['"]sales_deals['"]\s*\)/;
function salesOrderStatements(text, FROM = SO_FROM) {
  const lines = text.split('\n');
  const out = [];
  lines.forEach((line, i) => {
    if (!FROM.test(line)) return;
    let start = i;
    for (let k = 0; k < 4 && start > 0; k += 1) {
      const prev = lines[start - 1].trim();
      if (!prev || /[;{},]$/.test(prev)) break;
      start -= 1;
    }
    let end = i;
    let depth = 0;
    for (let j = start; j < Math.min(i + 20, lines.length); j += 1) {
      for (const ch of lines[j]) {
        if (ch === '(' || ch === '[') depth += 1;
        else if (ch === ')' || ch === ']') depth -= 1;
      }
      end = j;
      if (/;\s*$/.test(lines[j])) break;
      if (j >= i && depth <= 0 && /,\s*$/.test(lines[j])) break;
    }
    const base = lines.slice(start, end + 1).join('\n');
    let body = base;
    const assigned = base.match(/\b(?:let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^=]/);
    if (assigned) {
      const reassign = new RegExp(`^\\s*(?:if \\([^)]*\\)\\s*)?${assigned[1]}\\s*=\\s*[^=]`);
      for (let j = end + 1; j < Math.min(end + 10, lines.length); j += 1) {
        if (!lines[j].trim()) continue;
        if (!reassign.test(lines[j])) break;
        body += `\n${lines[j]}`;
      }
    }
    out.push({ line: i + 1, base, body });
  });
  return out;
}
/* ผู้ต้องสงสัย = อ่านอย่างเดียว และแตะ "ใบอนุมัติ / ยอดเงิน / ตัวกรองสถานะ / ทั้งแถว" */
const isCandidate = (body) => !/\.(insert|update|delete|upsert)\(/.test(body)
  && (/['"]approved['"]/.test(body)
    || /\b(actualAmount|totalAmount|subtotal|vatAmount)\b/.test(body)
    || /\.(eq|neq|in)\(\s*['"]status['"]/.test(body)
    || /\.select\(\s*['"]\*/.test(body));
const isById = (body) => /\.eq\(\s*['"]id['"]/.test(body);

/* ต้องกรองที่ query — รวมยอด/เข้าคิวงานจากใบอนุมัติทั้งทะเบียน (count = จำนวนคำสั่งที่ไม่ใช่ by-id ในไฟล์) */
const MUST_FILTER = new Map([
  ['lib/sales/salesReportData.js', { count: 2, reason: 'รายงานยอดขาย (จอ + Excel): ใบอนุมัติในงวด + ใบรออนุมัติ' }],
  ['lib/pm/productionJobsRepo.js', { count: 1, reason: 'ร่างงานผลิตอัตโนมัติจากใบอนุมัติทั้งทะเบียน' }],
  ['lib/sales/handoffQueueData.js', { count: 1, reason: 'คิวรอยื่นภาษี (แดชบอร์ดของฉัน · ภาพรวมดีล · ปิดโครงการ)' }],
  ['app/api/tax/orders/from-sales-order/route.js', { count: 1, reason: 'ตัวเลือกใบสั่งขายที่รอยื่นภาษี' }],
  /* 0374: ใบย้อนหลังมีร่าง/ตีกลับได้แล้ว แต่ส่งอนุมัติโดยไม่เก็บลายเซ็น (CHECK บังคับว่าง) — นับเข้า "ต้องยื่น" = ชี้ผู้คีย์
     ไปอัปลายเซ็นที่ไม่มีวันถูกใช้ (ย้ายจาก SCOPED_SAFE ที่เคยอ้างว่า "ใบย้อนหลังเกิดเป็นอนุมัติแล้ว") */
  ['app/api/admin/signature-coverage/route.js', { count: 1, reason: 'รายงานความพร้อมลายเซ็น: ร่าง/ตีกลับที่ผู้สร้างต้องยื่นพร้อมลายเซ็น' }],
  /* PR3 (mig 0378): ต้นทางของ "ยกเงินจากใบที่ยกเลิก" = ใบที่ยกเลิกของดีลเดียวกัน — ใบย้อนหลังไม่มีทางนี้ (RPC รับเฉพาะ pipeline) */
  ['lib/sales/salesOrderInstallmentsStore.js', { count: 1, reason: 'ต้นทางเงินค้าง: ใบ pipeline ที่ยกเลิกของดีลเดียวกัน (loadCarrySources)' }],
]);
/* โหลดใบเดียวด้วย id — ไฟล์ต้องตัดสินใบย้อนหลังเองด้วย isHistoricalOrder( */
const PER_ID_GUARDED = new Map([
  ['app/api/tax/orders/from-sales-order/route.js', 'GET ตอบ "ไม่เข้าเกณฑ์" · POST ปฏิเสธ'],
  ['app/api/sales-planning/sales-orders/[id]/route.js',
    'loadOrder — ส่งอนุมัติ/อนุมัติใบย้อนหลังแยกกิ่ง (historicalOrderWorkflow · ไม่นับ Actual) · แก้ใบ/ย้อนอนุมัติ/ออก Rev./คืนร่าง/ย้อน Won/ลบ ตัดสินจาก before · งวดไม่ทับยอดตามแผน'],
  ['app/api/sales-planning/sales-orders/[id]/installments/route.js',
    'loadOrderForUser — งวดของใบย้อนหลังล็อกจนอนุมัติ (historicalInstallmentLock) · ไม่ทับยอดตามแผน · ไม่มีทางเพิ่มงวด/ทางกู้จากใบเสนอราคา'],
]);
/* เห็นใบย้อนหลังโดยตั้งใจ · count = จำนวนคำสั่งผู้ต้องสงสัยทั้งไฟล์ (ทั้ง by-id และไม่ใช่)
   🐞 ของเดิมยกเว้นทั้งไฟล์ ⇒ เพิ่มยอด "ใบอนุมัติทั้งทะเบียน" ใหม่ในทะเบียนการชำระ/ทะเบียน SO แล้วเขียวต่อ
   (ใบย้อนหลัง approvedAt = เวลาคีย์ ⇒ ~220 ใบโผล่เป็นยอดเดือนนี้) · เลขตรึงไว้ ⇒ คำสั่งใหม่ต้องจัดชั้นใหม่เสมอ */
const SEES_HISTORICAL = new Map([
  ['app/api/nav/counts/route.js', { count: 5, reason: 'เลนอนุมัติ = รออนุมัติ/ตีกลับ รวมใบย้อนหลังโดยตั้งใจ (AE Sup อนุมัติ · ตีกลับให้ผู้คีย์ · 0374) — นับจำนวนใบ ไม่รวมยอด · เลนร่างของใบย้อนหลัง (ผู้คีย์บันทึกค้าง · historicalRowsOnly) · เลนย้อนการอนุมัติรอเจ้าของดีลออก Rev. (มติ 24/09 · pipelineRowsOnly — ใบย้อนหลังย้อนอนุมัติไม่ได้) นับจำนวนใบ ไม่รวมยอด · เลนบัญชีต้อง financeStatus pending (ใบย้อนหลัง NULL) · ป้ายงานเข้าใหม่ของ TS นับถังผูกโซน + ถังตั้งรอบ (ใบย้อนหลังผูกโซนตอน AE Sup อนุมัติ ⇒ มาเข้าถังตั้งรอบตรง ๆ · มติ 22/09) — นับแถว ไม่รวมยอด' }],
  ['app/api/service/intake/route.js', { count: 1, reason: 'คิวงานเข้าใหม่ของ TS — ใบย้อนหลังที่อนุมัติแล้วมาพร้อมโซนที่ผูกตอนอนุมัติ (ถังตั้งรอบ · มติ 22/09) · ยอดใช้ตัดสินใบ ฿0 เท่านั้น (paymentNotRequired) ไม่ออกไปกับ response' }],
  ['lib/service/gateContext.js', { count: 1, reason: 'บริบทด่านเข้าไซต์ — ใบของรอบขาย (ใบย้อนหลังที่อนุมัติแล้วด้วยโดยตั้งใจ) · ยอดใช้ตัดสินใบ ฿0 ของข้อ② เท่านั้น (paymentNotRequired) ส่งออกเป็น 0/null ไม่รวมยอด (มติ 22/09)' }],
  ['app/api/finance/payments/route.js', { count: 1, reason: 'ทะเบียนการชำระ — งวดที่ยังต้องเก็บของใบย้อนหลังเป็นเงินจริง (คำตอบข้อ 2) · แถวพก origin' }],
  /* กำหนดวางบิล (mig 0389 · 26/09): กระดิ่งถึงรอบวางบิล — งวดปกติของใบย้อนหลังที่อนุมัติแล้วก็ต้องวางบิลจริง
     (เหตุผลเดียวกับทะเบียนการชำระ) · งวดยกมาถูกตัดที่ตัวคัด (billingDueCandidates) */
  ['app/api/cron/daily-digest/route.js', { count: 1, reason: 'กระดิ่งถึงรอบวางบิล — ใบของงวดที่ถึงรอบ (id จากงวด) · ยอดใช้ตัดสินใบ ฿0 เท่านั้น (paymentNotRequired) ไม่รวมยอด' }],
  ['app/api/sales-planning/sales-orders/route.js', { count: 1, reason: 'ทะเบียนใบสั่งขาย — แถวโชว์ได้ ยอดผ่าน salesOrderAmountKind (ใบย้อนหลัง = excluded)' }],
  ['app/api/sales-planning/deals/[id]/overview/route.js', { count: 1, reason: 'ใบของดีลใบเดียว — ยอดผ่าน splitSalesOrderAmounts/salesOrderAmountKind' }],
  ['app/api/sales-planning/deals/[id]/route.js', { count: 1, reason: 'ด่านย้ายเจ้าของดีลภาชนะ (0374) — หาใบย้อนหลังที่ยังไม่อนุมัติของดีลเดียวผ่าน historicalRowsOnly · ไม่รวมยอด' }],
]);
/* ขอบเขตของคำสั่งทำให้ใบย้อนหลังเข้ามาไม่ได้ · count ความหมายเดียวกับข้างบน */
const SCOPED_SAFE = new Map([
  ['app/api/pm/projects/[id]/route.js', { count: 1, reason: 'ดีลของโครงการ — ดีลภาชนะไม่มีโครงการ (CHECK "projectId" IS NULL)' }],
  ['app/api/pm/projects/[id]/deliveries/generate/route.js', { count: 1, reason: 'ดีลของโครงการ — เหตุผลเดียวกัน' }],
  ['lib/pm/deliveriesRepo.js', { count: 1, reason: 'projectId / ดีลของโครงการ — ใบย้อนหลังไม่มีโครงการ' }],
  ['app/api/sales-planning/quotations/[id]/route.js', { count: 1, reason: 'quotationId ใบเดียว — ใบย้อนหลังไม่มีใบเสนอราคา' }],
]);

test('🪤 ทุกคำสั่งอ่านใบสั่งขายที่แตะยอด/สถานะ ถูกจัดชั้นแล้ว — ของใหม่ต้องกรอง pipeline หรือบอกเหตุผล', () => {
  const offenders = [];
  const tally = new Map();
  for (const rel of FILES) {
    const text = code(rel);
    if (!SO_FROM.test(text)) continue;
    for (const { line, base, body } of salesOrderStatements(text)) {
      if (!isCandidate(body)) continue;
      const byId = isById(base);
      const t = tally.get(rel) || { plain: 0, byId: 0 };
      if (byId) t.byId += 1; else t.plain += 1;
      tally.set(rel, t);
      if (MUST_FILTER.has(rel) && !byId) {
        if (!body.includes('pipelineRowsOnly(')) offenders.push(`${rel}:${line} — ต้องห่อ pipelineRowsOnly(`);
        continue;
      }
      if (byId && PER_ID_GUARDED.has(rel)) continue;
      if (SEES_HISTORICAL.has(rel) || SCOPED_SAFE.has(rel)) continue;
      offenders.push(`${rel}:${line} — ยังไม่ถูกจัดชั้น`);
    }
  }
  assert.deepEqual(offenders, [],
    'คำสั่งอ่านใบสั่งขายที่รวมยอด/กรองสถานะอนุมัติ ต้อง: ห่อ pipelineRowsOnly (lib/sales/historicalOrders) '
    + 'หรือเข้าชั้น PER_ID_GUARDED / SEES_HISTORICAL / SCOPED_SAFE พร้อมเหตุผล\n' + offenders.join('\n'));

  for (const rel of PER_ID_GUARDED.keys()) {
    assert.ok(code(rel).includes('isHistoricalOrder('), `${rel} โหลดใบเดียวแต่ไม่ตัดสินใบย้อนหลัง`);
  }
  const ghosts = [];
  for (const [rel, { count }] of MUST_FILTER) {
    const found = tally.get(rel)?.plain || 0;
    if (found !== count) ghosts.push(`${rel}: คาด ${count} คำสั่ง เจอ ${found}`);
  }
  for (const rel of PER_ID_GUARDED.keys()) if (!tally.get(rel)?.byId) ghosts.push(`${rel}: ไม่มีคำสั่งโหลดใบเดียวแล้ว`);
  for (const [rel, { count }] of [...SEES_HISTORICAL, ...SCOPED_SAFE]) {
    const t = tally.get(rel);
    const found = t ? t.plain + t.byId : 0;
    if (!found) ghosts.push(`${rel}: ไม่มีคำสั่งผู้ต้องสงสัยแล้ว — ถอดออกจากรายการ`);
    else if (found !== count) ghosts.push(`${rel}: คาด ${count} คำสั่ง เจอ ${found} — คำสั่งใหม่ในไฟล์ยกเว้นต้องจัดชั้นใหม่ (กรอง pipeline หรือแก้ count พร้อมเหตุผล)`);
  }
  assert.deepEqual(ghosts, []);
});

test('ตัวแยกคำสั่งเห็นตัวห่อบรรทัดก่อนหน้า · ตัวแปรที่ต่อทีหลัง · ไม่ลากสมาชิกข้างเคียงของ Promise.all', () => {
  const wrapped = salesOrderStatements([
    '  const { data } = await fetchAllResult(() => pipelineRowsOnly(supabase',
    "    .from('sales_orders')",
    "    .select('id, \"actualAmount\"'))",
    "    .eq('status', 'approved')",
    "    .order('id', { ascending: true }));",
  ].join('\n'));
  assert.equal(wrapped.length, 1);
  assert.ok(isCandidate(wrapped[0].body) && wrapped[0].body.includes('pipelineRowsOnly('));

  const later = salesOrderStatements([
    '  const rows = await fetchAll(() => {',
    '    let query = supabase',
    "      .from('sales_orders')",
    "      .select('id')",
    "      .eq('status', 'approved')",
    "      .order('id', { ascending: true });",
    '',
    '    query = pipelineRowsOnly(query);',
    "    if (dealIds) query = query.in('dealId', dealIds);",
    '    return query;',
  ].join('\n'));
  assert.ok(later[0].body.includes('pipelineRowsOnly(query)'));
  assert.doesNotMatch(later[0].body, /return query/);

  const deals = [
    'async function loadWonTotalUnfiltered(supabase) {',
    '  const { data, error } = await fetchAllResult(() => supabase',
    "    .from('sales_deals').select(DEAL_COLUMNS).order('id', { ascending: true }));",
    '  if (error) throw error;',
    '}',
    'async function loadAllDeals(supabase) {',
    '  const { data, error } = await fetchAllResult(() => pipelineRowsOnly(supabase',
    "    .from('sales_deals').select(DEAL_COLUMNS)).order('id', { ascending: true }));",
    '}',
    'async function loadOne(supabase, id) {',
    "  const { data } = await supabase.from('sales_deals').select('*').eq('id', id).maybeSingle();",
    '}',
    "const write = await supabase.from('sales_deals').update({ stage: 'won' }).eq('stage', 'open');",
  ].join('\n');
  assert.deepEqual(unfilteredDealReads(deals).map((s) => s.line), [3, 11], 'ไม่ห่อ + by-id ในไฟล์ที่ไม่ตัดสินเอง');
  assert.deepEqual(unfilteredDealReads(`${deals}\nif (isHistoricalDeal(d)) return;`).map((s) => s.line), [3],
    'by-id ผ่านได้เมื่อไฟล์ตัดสิน isHistoricalDeal( เอง · คำสั่งเขียนไม่นับ');

  const sibling = salesOrderStatements([
    '  const [a, b] = await Promise.all([',
    "    supabase.from('quotations').select('id, \"totalAmount\"').eq('dealId', id),",
    "    supabase.from('sales_orders').select('id, status').eq('dealId', id),",
    "    supabase.from('orders').select('*').eq('dealId', id),",
    '  ]);',
  ].join('\n'));
  assert.equal(sibling.length, 1);
  assert.equal(isCandidate(sibling[0].body), false, 'totalAmount ของใบเสนอราคา/select * ของตารางอื่นต้องไม่ลากเข้ามา');
});

// ── 2. import ตัวช่วย KPI ระดับดีล ─────────────────────────────────────────────────────────
const DEAL_KPI_FROM_METRICS = new Set([
  'isWonDeal', 'wonAmountOf', 'wonMonthOf', 'isWonAwaitingSo', 'wonAwaitingSoAmountOf', 'wonAwaitingSoCountOf',
  'forecastAccuracyRollup',
]);
function dealKpiImports(text) {
  const names = [];
  for (const [, list, from] of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const fromMetrics = /dashboardMetrics(\.js)?$/.test(from);
    for (const raw of list.split(',')) {
      const name = raw.trim().split(/\s+as\s+/)[0];
      if (!name) continue;
      if ((fromMetrics && DEAL_KPI_FROM_METRICS.has(name)) || name === 'dealActualFromSalesOrders') names.push(name);
    }
  }
  return names;
}
/* ไฟล์ที่อ่าน KPI ระดับดีลโดยไม่กรองเอง — ต้องมีเหตุผลว่าทำไมดีลภาชนะเข้าไม่ถึง */
const DEAL_KPI_ALLOWLIST = new Map([
  ['lib/sales/pendingApprovalRollup.js', 'ตัวรวมล้วน — รับดีลที่แดชบอร์ดตัดที่ query แล้ว'],
  ['lib/sales/wonAwaitingSoRollup.js', 'ตัวรวมล้วน — isWonAwaitingSo ตัดดีลภาชนะเองอีกชั้น'],
  ['lib/sales/reportPendingApproval.js', 'ดีลมาจากใบรออนุมัติที่รายงานกรอง pipeline แล้ว — ใบย้อนหลังไม่มีสถานะรออนุมัติ'],
  ['lib/sales/projectRollup.js', 'ดีลของโครงการ — ดีลภาชนะไม่มีโครงการ (CHECK "projectId" IS NULL)'],
  ['app/sales-planning/leads/[id]/page.js', 'ดีลของลีดใบเดียว — ดีลภาชนะไม่มีลีด (CHECK "leadId" IS NULL)'],
  ['app/sales-planning/deals/[id]/page.js', 'หน้าดีลใบเดียว — ยอดผ่าน splitSalesOrderAmounts (ใบย้อนหลัง excluded) · คำใต้การ์ดจาก wonDealForecastHint (kind historical)'],
]);

/* 🐞 ตัวตรวจระดับไฟล์อย่างเดียวผ่านทั้งไฟล์เมื่อเจอ token กันสักตัว ⇒ คำสั่งอ่าน sales_deals ตัวที่สองที่ไม่กรอง
   ในไฟล์ที่กรองอยู่แล้ว (แดชบอร์ด/ประวัติยอด) เขียวต่อ แล้วนับดีลภาชนะ ~160 ใบเข้า Won/ดีลทั้งหมด/อัตราชนะ
   ⇒ ไฟล์ในขอบเขตที่ไม่อยู่ในรายการยกเว้น: **ทุกคำสั่งอ่าน** sales_deals ต้องห่อ pipelineRowsOnly( ที่ query
   · ยกเว้นโหลดดีลใบเดียวด้วย id ในไฟล์ที่ตัดสินเองด้วย isHistoricalDeal( (แนวเดียวกับ PER_ID_GUARDED)
   · ไฟล์ที่รับอาร์เรย์มาจากที่อื่น (ไม่มีคำสั่งอ่านเอง) ยังตัดสินด้วย token ระดับไฟล์ตามเดิม */
function unfilteredDealReads(text) {
  const perIdGuarded = text.includes('isHistoricalDeal(');
  return salesOrderStatements(text, DEALS_FROM)
    .filter(({ body }) => !/\.(insert|update|delete|upsert)\(/.test(body))
    .filter(({ base, body }) => !body.includes('pipelineRowsOnly(') && !(perIdGuarded && isById(base)));
}

test('🪤 ไฟล์ที่ import ตัวช่วย KPI ระดับดีล ต้องตัดดีลภาชนะเอง หรืออยู่ในรายการพร้อมเหตุผล', () => {
  const offenders = [];
  const inScope = new Set();
  for (const rel of FILES) {
    const text = code(rel);
    const names = dealKpiImports(text);
    if (!names.length) continue;
    inScope.add(rel);
    if (DEAL_KPI_ALLOWLIST.has(rel)) continue;
    const guarded = /\bisKpiDeal\b/.test(text) || text.includes('pipelineRowsOnly(') || text.includes('isHistoricalDeal(');
    if (!guarded) offenders.push(`${rel} (${names.join(', ')})`);
    for (const { line } of unfilteredDealReads(text)) {
      offenders.push(`${rel}:${line} — คำสั่งอ่าน sales_deals ต้องห่อ pipelineRowsOnly(`);
    }
  }
  assert.deepEqual(offenders, [],
    'อ่าน Won/Actual/Won รอยื่น SO ระดับดีลโดยไม่ตัดดีลของใบสั่งขายย้อนหลัง — ใช้ .filter(isKpiDeal) · pipelineRowsOnly(query) '
    + 'หรือเพิ่มเหตุผลใน DEAL_KPI_ALLOWLIST\n' + offenders.join('\n'));
  const ghosts = [...DEAL_KPI_ALLOWLIST.keys()].filter((rel) => !inScope.has(rel));
  assert.deepEqual(ghosts, [], 'รายการยกเว้นที่ไม่ได้ import ตัวช่วยพวกนี้แล้ว — ถอดออก');
});

// ── 3–4. ตัวอ่าน KPI ระดับดีลที่ระบุชื่อ ──────────────────────────────────────────────────────
test('กอง Won รอยื่น SO ตัดดีลภาชนะ — ต่อท้ายหลังดีลเก่าที่สร้างเป็น Won', () => {
  assert.match(code('lib/sales/dashboardMetrics.js'),
    /export const isWonAwaitingSo = \(d\) => isWonDeal\(d\)\s*&& !isLegacyWonAtCreate\(d\)\s*&& !isHistoricalDeal\(d\)/);
  assert.match(code('lib/sales/dashboardMetrics.js'), /export \{ isKpiDeal \} from '@\/lib\/sales\/historicalOrders';/);
});

test('ตัวอ่าน KPI ระดับดีลที่ระบุชื่อ: แดชบอร์ด · ประวัติยอด · แดชบอร์ดของฉัน · หน้าดีล · ลิ้นชัก', () => {
  const dashboard = code('app/api/sales-planning/dashboard/route.js');
  assert.ok(slice(dashboard, 'async function loadAllDeals', '\n}\n').includes('pipelineRowsOnly('), 'loadAllDeals');
  const history = code('app/api/sales-planning/history/route.js');
  assert.ok(history.includes('pipelineRowsOnly(') && history.includes('isHistoricalDeal(d)'), 'history');
  const mine = code('lib/sales/myDashboardTotals.js');
  assert.ok(slice(mine, 'export function summarizeMyDeals', '\n}\n').includes('.filter(isKpiDeal)'), 'summarizeMyDeals');
  assert.match(code('app/sales-planning/deals/page.js'), /const kpiDeals = deals\.filter\(inScopeDeal\)\.filter\(isKpiDeal\)/);
  assert.match(code('components/salesPlanning/DealDrillDownModal.js'),
    /let filtered = \(data \|\| \[\]\)\.filter\(isKpiDeal\)\.filter\(/);
  assert.match(code('lib/sales/dealAmountDisplay.js'), /if \(isHistoricalDeal\(deal\)\) return \{ kind: WON_HINT_KINDS\.HISTORICAL/);
});

// ── 5. literal มีบ้านเดียว ────────────────────────────────────────────────────────────────
test('🪤 literal "historical" และตัวกรอง .eq("origin") มีบ้านเดียวคือ lib/sales/historicalOrders.js', () => {
  const offenders = [];
  for (const rel of FILES) {
    if (rel === 'lib/sales/historicalOrders.js') continue;
    const text = code(rel);
    if (/['"`]historical['"`]/.test(text)) offenders.push(`${rel} — literal 'historical'`);
    if (/\.(n?eq)\(\s*['"]origin['"]/.test(text)) offenders.push(`${rel} — .eq('origin', …)`);
  }
  assert.deepEqual(offenders, [],
    'ใช้ ORIGIN_HISTORICAL / isHistoricalOrder / isHistoricalDeal / pipelineRowsOnly / historicalRowsOnly แทน\n'
    + offenders.join('\n'));
});

// ── 6–8. ผลิต · ภาษี · หลักฐาน ─────────────────────────────────────────────────────────────
test('งานผลิต: ร่างอัตโนมัติกรองใบย้อนหลังที่ query และเลือก origin ให้ตัวสร้างร่างกันอีกชั้น', () => {
  const repo = slice(code('lib/pm/productionJobsRepo.js'), 'export async function approvedOrdersWithLines', '\n}\n');
  assert.match(repo, /\.select\('[^']*\borigin\b[^']*'\)/);
  assert.ok(repo.includes('query = pipelineRowsOnly(query);'));
  assert.match(code('lib/pm/productionPlan.js'), /order\.status !== 'approved' \|\| isHistoricalOrder\(order\)\) return \[\];/);
});

test('ยื่นภาษีจากใบสั่งขาย: GET และ POST ตัดสินใบย้อนหลังก่อนคำนวณ/สร้างใบยื่น', () => {
  const route = code('app/api/tax/orders/from-sales-order/route.js');
  const get = slice(route, 'export const GET', 'export const POST');
  const post = slice(route, 'export const POST');
  assert.ok(get.includes('isHistoricalOrder(salesOrder)'));
  assert.ok(get.indexOf('isHistoricalOrder(salesOrder)') < get.indexOf('resolveContext('), 'GET ต้องตอบก่อนคำนวณสินค้า');
  assert.ok(post.includes('isHistoricalOrder(salesOrder)'));
  assert.ok(post.indexOf('isHistoricalOrder(salesOrder)') < post.indexOf('insertOrder('), 'POST ต้องปฏิเสธก่อนสร้างใบยื่น');
});

/* ⚠️ แก้ยามโดยตั้งใจใน PR1 (mig 0376): payment-file ไม่ต่อ id เองแล้ว — ถามตัวตัดสินกลาง `isInstallmentEvidencePath`
   (ใบที่ถืองวด + ใบ/QT ใน movedFrom) ซึ่ง **ทิ้ง id ว่างเอง** ⇒ ใบย้อนหลัง (ไม่มี QT) ยังไม่เปิดโฟลเดอร์ QT ของใบไหนเลย
   · ตัวทิ้ง id ว่างตรึงด้วยเทสต์เรียกตรงที่ upload/installmentEvidenceOwners.test.mjs ("id ว่าง/เพี้ยนไม่กลายเป็นตัวจับทุกใบ") */
test('ไฟล์หลักฐาน: ถามโฟลเดอร์ใบเสนอราคาเฉพาะใบที่มี quotationId (id ว่าง = ตัวตรวจ path จับทุกใบ)', () => {
  const payment = code('app/api/sales-planning/sales-orders/[id]/payment-file/route.js');
  assert.match(payment, /const allowed = isInstallmentEvidencePath\(att\.storagePath, row, order\);/);
  assert.doesNotMatch(payment, /isQuotationEvidencePath\(|isSalesOrderEvidencePath\(/, 'ห้ามต่อ id เองในเราต์ — ตัวทิ้ง id ว่างอยู่ใน lib');
  const owners = code('lib/upload/privateEvidence.js');
  assert.match(owners, /const ownerId = \(value\) => \(typeof value === 'string' && value\.trim\(\) \? value\.trim\(\) : null\);/);
  const confirm = code('app/api/sales-planning/sales-orders/[id]/confirm-file/route.js');
  assert.match(confirm, /!\(order\.quotationId && isQuotationEvidencePath\(att\.storagePath, order\.quotationId\)\)/);
  assert.doesNotMatch(confirm, /\|\|\s*!isQuotationEvidencePath\(/);
});

// ── 9. คำสั่งบนใบสั่งขายใบเดียว ──────────────────────────────────────────────────────────────
test('ใบสั่งขาย [id]: ย้อนอนุมัติ · ออก Rev. · คืนร่าง · ย้อน Won ปฏิเสธใบย้อนหลังก่อนเรียกฐาน', () => {
  const route = code('app/api/sales-planning/sales-orders/[id]/route.js');
  const block = (from, to, before) => {
    const text = slice(route, from, to);
    const guard = text.indexOf('isHistoricalOrder(before)');
    assert.ok(guard > 0, `${from} ไม่ตรวจใบย้อนหลัง`);
    assert.ok(guard < text.indexOf(before), `${from}: ด่านต้องมาก่อน ${before}`);
  };
  block("if (action === 'revoke')", "if (action === 'revise')", 'revoke_sales_order_approval_atomic');
  block("if (action === 'revise')", "if (action === 'save')", 'revise_approved_sales_order_atomic');
  block("if (action === 'restore')", 'export const DELETE', '.update(patch)');
  const cancel = slice(route, "if (action === 'cancel')", "if (action === 'finance_approve')");
  const reversal = cancel.indexOf('reverseTo && isHistoricalOrder(before)');
  assert.ok(reversal > 0 && reversal < cancel.indexOf('cancel_sales_order_with_reversal_atomic'));
  const language = slice(route, "if (action === 'set-doc-language')", "if (action === 'withdraw')");
  assert.ok(language.includes('canSwitchSalesOrderDocLanguage(before)'));
});

test('ใบสั่งขาย [id] DELETE: ใบย้อนหลังลบแบบปกติได้เฉพาะตอนไม่มีของปลายน้ำ · audit เก็บรอบขาย/รอบบริการ · ปลดรอบบริการหลังลบ', () => {
  const del = slice(code('app/api/sales-planning/sales-orders/[id]/route.js'), 'export const DELETE');
  for (const needle of [
    "from('service_zone_terms')", "from('service_plans')", "from('sales_order_installments')", 'historicalDeleteBlock(',
    'fetchAllResult(', '{ ...before, installments: installmentRows, zoneTerms, servicePlans }', "update({ salesOrderId: null",
    'installmentsResult.error',
  ]) {
    assert.ok(del.includes(needle), `ขาด ${needle}`);
  }
  /* 🐞 before.installments มาจาก loadOrder ที่กลืน error งวดเป็น [] ⇒ ด่านต้องได้งวดที่อ่านใหม่ (error = 500) */
  assert.match(del, /historicalDeleteBlock\(\{\s*order: \{ \.\.\.before, installments: installmentRows \},/);
  assert.doesNotMatch(del, /historicalDeleteBlock\(\{\s*order: before\b/);
  const block = del.indexOf('historicalDeleteBlock(');
  assert.ok(del.indexOf("from('sales_order_installments')") < block, 'อ่านงวดก่อนถามด่าน');
  assert.ok(block < del.indexOf("supabase.from('sales_orders').delete()"), 'ด่านต้องมาก่อนลบจริง');
  assert.ok(block < del.indexOf("rpc('force_delete_sales_order'"));
  assert.ok(del.indexOf("update({ salesOrderId: null") > del.indexOf("rpc('force_delete_sales_order'"), 'ปลดรอบบริการหลังลบสำเร็จเท่านั้น');
});

// ── 10. ดีลภาชนะ ─────────────────────────────────────────────────────────────────────────────
test('ดีลภาชนะ: PATCH ตีกลับช่องที่ CHECK ตรึง · ฟอร์มไม่บังคับวัน · DELETE ติดเมื่อยังถือใบ (ครอบทางบังคับ)', () => {
  const route = code('app/api/sales-planning/deals/[id]/route.js');
  const patch = slice(route, 'export const PATCH', 'export const DELETE');
  const guard = patch.indexOf('historicalDealPatchError(before, body)');
  assert.ok(guard > 0 && guard < patch.indexOf('.update(patch)'));
  assert.ok(patch.includes('isDealFormSave(body) && !isHistoricalDeal(before)'));
  assert.ok(patch.includes('historicalDealWriteMessage('));
  const del = slice(route, 'export const DELETE');
  const hist = del.indexOf('isHistoricalDeal(before)');
  assert.ok(hist > 0 && hist < del.indexOf('if (!force) {'), 'ด่านต้องมาก่อน if (!force) — ครอบทั้งสองทาง');
  assert.ok(hist < del.indexOf('if (dryRun) {'), 'พรีวิวต้องบอก blocked ด้วย');
  assert.match(del, /from\('sales_orders'\)\.select\('id', \{ count: 'exact', head: true \}\)\.eq\('dealId', id\)/);
});

test('ดีลภาชนะ: ไทม์ไลน์ · สร้างโครงการ · ผูกโครงการ ปฏิเสธก่อนเขียนอะไร', () => {
  const timeline = slice(code('app/api/sales-planning/deals/[id]/timeline/route.js'), 'export const POST');
  const t = timeline.indexOf('isHistoricalDeal(deal)');
  assert.ok(t > 0 && t < timeline.indexOf("from('project_tasks')"));
  const create = code('app/api/sales-planning/deals/[id]/create-project/route.js');
  const c = create.indexOf('isHistoricalDeal(deal)');
  assert.ok(c > 0 && c < create.indexOf("insertRowWithEntityCode(supabase, 'PJ'"));
  const link = slice(code('lib/sales/dealProjectLink.js'), 'export async function linkDealToProject');
  const l = link.indexOf('isHistoricalDeal(deal)');
  assert.ok(l > 0 && l < link.indexOf('loadProject('));
});

// ── 11–12. เส้นเขียน ─────────────────────────────────────────────────────────────────────────
test('เส้นคีย์/ส่ง/อนุมัติใบย้อนหลังไม่หยิบผลข้างเคียงของการอนุมัติปกติ (หยุดยอดงวดตามแผน · ยอดงวดสด · ฉบับตรึง)', () => {
  /* 0374: ใบเกิดเป็นร่างแล้วแก้ในฟอร์มเดิม (PATCH historical/[id]) — งวดยังไม่หยุดยอดจน AE Sup อนุมัติ และขั้นอนุมัติ
     หยุดยอดใน RPC ของตัวเอง ⇒ ทั้งเส้นสร้าง/แก้/ส่ง/อนุมัติห้ามแตะตัวหยุดยอด/ตัวคิดยอดสดตามแผน (ยอดจะขึ้น "ชำระเต็มจำนวน" ปลอม) */
  for (const rel of [
    'lib/sales/historicalOrderCommit.js',
    'lib/sales/historicalOrderWorkflow.js',
    'app/api/sales-planning/sales-orders/historical/route.js',
    'app/api/sales-planning/sales-orders/historical/[id]/route.js',
  ]) {
    assert.doesNotMatch(code(rel), /import[^;]*\b(freezeInstallments|withLiveAmounts|captureIssuedSalesOrderSnapshot)\b/, rel);
  }
  /* งวด: ไม่มีทางคีย์งวดเพิ่มแล้ว (RPC ถูก DROP ใน 0374) · ใบย้อนหลังตัดสินด้วย isHistoricalOrder ทั้งตัวทับยอดและด่าน */
  const installments = code('app/api/sales-planning/sales-orders/[id]/installments/route.js');
  assert.ok(!installments.includes('append_historical_installments'));
  assert.ok(installments.includes('isHistoricalOrder(order)') && installments.includes('historicalInstallmentLock(order)'));
  /* หน้าใบ: งวดของใบย้อนหลังไม่ผ่าน withLiveAmounts */
  const load = slice(code('app/api/sales-planning/sales-orders/[id]/route.js'), 'async function loadOrder', '\n}\n');
  assert.match(load, /installments: historical\s*\? installmentRows\s*: withLiveAmounts\(/);
});

// ── 13. จอ ────────────────────────────────────────────────────────────────────────────────────
test('หน้าใบสั่งขาย: ป้าย Actual เดินตามกองของยอด · ไม่เสนอย้อน Won/คืนร่าง · ไม่ลิงก์ใบเสนอราคาที่ไม่มี', () => {
  const page = code('app/sales-planning/sales-orders/[id]/page.js');
  assert.match(page, /hint: amountKind === "actual" \? fmtMoney\(order\.actualAmount\)/);
  assert.match(page, /value: amountKind === "actual" \? fmtMoney\(order\.actualAmount\)/);
  assert.doesNotMatch(page, /(hint|value): approved \?/);
  assert.match(page, /const showReversal = [^;]*!isHistoricalOrder\(order\)/);
  assert.match(page, /\{ id: "restore",[^\n]*!isHistoricalOrder\(order\)/);
  /* เจตนาเดิม: คำอธิบายสถานะของใบย้อนหลังต้องไม่ใช่ของใบปกติ ("ยอดถูกนับเป็น Actual แล้ว")
     0374 ย้ายทั้งชุดไป `historicalStatusCopy` (ทุกสถานะ ไม่ใช่เฉพาะ "อนุมัติแล้ว") ซึ่งมียามของตัวเอง
     ที่ไล่ทุกสตริงว่าไม่มีประโยคไหนบอกว่า "นับ Actual" ⇒ ยามที่นี่เฝ้าว่าหน้าใบยังหยิบจากที่นั่น */
  assert.match(page, /const historicalCopy = historical \? historicalStatusCopy\(order\.status\) : null/);
  assert.match(page, /const status = historicalCopy/);
  assert.match(page, /\{order\.quotationId \? \(\s*<ContextCard icon=\{FileText\} href=\{`\/sa\/quotations\/\$\{order\.quotationId\}`\}/);
  assert.match(page, /actions=\{order\.quotationId \? <Link href=\{`\/sa\/quotations\/\$\{order\.quotationId\}`\}/);
  assert.match(page, /confirmationOnFile\?\.source === "order" \|\| !order\.quotationId/);
});

test('ค้นหา: ทะเบียนใบสั่งขายและทะเบียนการชำระค้นด้วยเลขเอกสารเดิมได้', () => {
  assert.match(code('app/sales-planning/sales-orders/page.js'), /row\.referenceDoc, \.\.\.historicalRefsOf\(row\)\]/);
  const payments = code('app/api/finance/payments/route.js');
  for (const col of ['origin', '"historicalQuoteRef"', '"historicalExpressRef"', '"historicalInvoiceRef"']) {
    assert.ok(payments.includes(col), `ทะเบียนการชำระต้องเลือก ${col}`);
  }
});
