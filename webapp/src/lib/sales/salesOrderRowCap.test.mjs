// ── P0 ใบสั่งขายย้อนหลัง: จุดอ่านทั้งทะเบียนของใบสั่งขาย/บรรทัด/รอบขาย/งวด/สัญญา ต้องซอยและไล่หน้า ────
//
// 🐞 ใบย้อนหลังเกิดเป็น approved ทันที ⇒ ใบ +~220 · บรรทัด +~379 · รอบขายโซน +~379 · งวด/สัญญาหลักร้อย
// ลงในไม่กี่วัน ⇒ จุดอ่านที่เคย "เล็กพอ" ข้ามสองเส้นพร้อมกัน: เพดาน 1,000 แถว (ตัดเงียบ) และยาม URL
// 14,000 ไบต์ (`.in()` ของ id ~16 ตัวอักษร ชนที่ ~720 ตัว) · `check:rowcap` มองเห็นแค่เส้นแรก
// ⇒ เทสต์นี้ล็อกเส้นที่สอง: ทุก `.in()` ในคำสั่งอ่านตารางเหล่านี้ของไฟล์ที่แก้ใน P0 ต้องรับ `chunk`
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WEBAPP = process.cwd();
const TABLES = /\.from\(\s*['"](sales_orders|sales_order_lines|service_zone_terms|sales_order_installments|sales_contracts|service_zones|service_plans|service_visits|production_jobs)['"]\s*\)/;

const FILES = [
  'src/lib/service/termsRepo.js',
  'src/lib/service/gateContext.js',
  'src/app/api/sales-planning/sales-orders/route.js',
  'src/app/api/finance/payments/route.js',
  'src/lib/pm/productionJobsRepo.js',
  'src/app/api/service/visits/route.js',
  // ก้อนภาระ/ด่านของตารางสัปดาห์ย้ายมาอยู่ที่นี่ (2026-09-22) — ยามต้องตามโค้ดไปด้วย
  'src/lib/service/visitBundle.js',
  'src/app/api/sales-planning/renewals/route.js',
  'src/app/api/service/plans/route.js',
  // ตัวโหลดของรายงานยอดขายย้ายจาก api/sales-planning/report/route.js (2026-09-22) — ยามตามโค้ดไป
  'src/lib/sales/salesReportData.js',
  'src/lib/sales/handoffQueueData.js',
  // รอบ review ของ P0 (2026-09-14)
  'src/app/api/nav/counts/route.js',
  'src/app/api/sales-planning/contracts/route.js',
  'src/app/api/tax/orders/from-sales-order/route.js',
  'src/lib/sales/contractQuotationSync.js',
];

/* ข้อยกเว้นต้องมีเหตุผลด้านข้อมูล — ลิสต์ที่ไม่โตตามงานย้อนหลัง */
const ALLOWED = new Set([
  // ใบเสนอราคา Won ในขอบเขตดีล/โครงการ/AE คนเดียว · ใบย้อนหลังไม่มี quotationId (มติข้อ 3)
  'src/lib/sales/handoffQueueData.js → quotations.map((quote) => quote.id)',
  // คำสั่ง **เขียน** (ปิดร่างสัญญา) ของใบเสนอราคาใบเดียว — ลิสต์คือร่างที่ตามใบนั้น หลักหน่วย ไม่ใช่ตัวอ่านทะเบียน
  'src/lib/sales/contractQuotationSync.js → followers.map((row) => row.id)',
]);

const strip = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

/* ข้อความของ "คำสั่งเดียว" นับจากบรรทัด `.from(` — หยุดที่ `;` หรือบรรทัดที่ปิดวงเล็บจนติดลบ
   ⚠️ หน้าต่าง 16 บรรทัด — select ของทะเบียนการชำระมีคอมเมนต์คั่น 12 บรรทัดก่อนถึง `.in(` */
function statementFrom(lines, start) {
  let depth = 0;
  const out = [];
  for (let j = start; j < Math.min(start + 16, lines.length); j += 1) {
    const line = j === start ? lines[j].slice(lines[j].search(TABLES)) : lines[j];
    out.push(line);
    for (const ch of line) {
      if (ch === '(') depth += 1;
      else if (ch === ')') depth -= 1;
    }
    if (depth < 0 || /;\s*$/.test(line)) break;
  }
  return out.join('\n');
}

/* อาร์กิวเมนต์ที่สองของทุก `.in(col, arg)` — ไล่วงเล็บสมดุลเอง (arg อย่าง `orders.map((o) => o.id)`
   ซ้อนสองชั้น regex ธรรมดาจับไม่ติดแล้วปล่อยผ่านเงียบ ๆ) */
function inArgs(statement) {
  const args = [];
  for (const hit of statement.matchAll(/\.in\(\s*['"]\w+['"]\s*,/g)) {
    let depth = 1;
    let j = hit.index + hit[0].length;
    const begin = j;
    for (; j < statement.length && depth > 0; j += 1) {
      if (statement[j] === '(') depth += 1;
      else if (statement[j] === ')') depth -= 1;
    }
    args.push(statement.slice(begin, j - 1).trim());
  }
  return args;
}

test('ทุก .in() ในคำสั่งอ่านตารางสายใบสั่งขาย/บริการ ของไฟล์ P0 ต้องรับก้อน `chunk`', () => {
  const offenders = [];
  for (const file of FILES) {
    const lines = strip(fs.readFileSync(path.join(WEBAPP, file), 'utf8')).split('\n');
    lines.forEach((line, i) => {
      if (!TABLES.test(line)) return;
      const statement = statementFrom(lines, i);
      for (const arg of inArgs(statement)) {
        /* ข้ามได้เฉพาะ: ก้อนที่ซอยแล้ว · ค่าคงที่ · สตริงเดี่ยว · **array ของสตริงล้วน** เช่น ['pending_approval', 'rejected']
           ⚠️ เดิมข้ามทุก `[...]` ⇒ `[...orderByPlan.keys()]` แบบไม่ซอยก็ผ่านยามไปเงียบ ๆ */
        const literalArray = /^\[\s*(['"][^'"]*['"]\s*,?\s*)*\]$/.test(arg);
        if (arg === 'chunk' || literalArray || /^[A-Z_]+$/.test(arg) || /^['"]/.test(arg)) continue;
        const key = `${file} → ${arg}`;
        if (!ALLOWED.has(key)) offenders.push(`${file}:${i + 1} → .in(…, ${arg})`);
      }
    });
  }
  assert.deepEqual(offenders, [],
    'ลิสต์ id ที่โตตามทะเบียนต้องยิงผ่าน fetchInChunks(… fetchAllResult) หรือ fetchAllInChunks\n'
    + offenders.join('\n'));
});

test('ตัวโหลดทั้งทะเบียนที่เคยไม่มี .range() ต้องห่อตัวไล่หน้า', () => {
  const must = [
    ['src/lib/service/termsRepo.js', /fetchAllInChunks\(zoneIds,/, 'loadTerms({ zoneIds })'],
    ['src/lib/service/termsRepo.js', /return fetchAll\(\(\) => ordered\(supabase/, 'loadTerms() ไม่ส่งตัวกรอง'],
    ['src/app/api/finance/payments/route.js', /fetchAllResult\(\(\) => supabase\s*\n\s*\.from\('sales_order_installments'\)/, 'ทะเบียนการชำระ: งวดที่ตรึงแล้วทั้งระบบ'],
    ['src/lib/pm/productionJobsRepo.js', /fetchAll\(\(\) => \{\s*\n\s*let query = supabase\s*\n\s*\.from\('sales_orders'\)/, 'autoDraft: ใบอนุมัติทั้งทะเบียน'],
    ['src/app/api/sales-planning/contracts/route.js', /fetchAllResult\(\(\) => \{\s*\n\s*let query = supabase\.from\('sales_contracts'\)/, 'ทะเบียนสัญญา (เดิม .limit(500))'],
    ['src/app/api/nav/counts/route.js', /fetchInChunks\(orderIds, \(chunk\) => fetchAllResult\(\(\) => supabase\.from\('sales_order_lines'\)/, 'ป้ายคิวผูกโซน'],
    ['src/app/api/tax/orders/from-sales-order/route.js', /fetchAllResult\(\(\) => \{\s*\n\s*let query = supabase\s*\n\s*\.from\("sales_orders"\)/, 'ตัวเลือกยื่นภาษีจากใบสั่งขาย (เดิม .limit(200) ก่อนกรอง)'],
  ];
  const missing = must
    .filter(([file, pattern]) => !pattern.test(strip(fs.readFileSync(path.join(WEBAPP, file), 'utf8'))))
    .map(([file, , label]) => `${file} — ${label}`);
  assert.deepEqual(missing, []);
  const contracts = strip(fs.readFileSync(path.join(WEBAPP, 'src/app/api/sales-planning/contracts/route.js'), 'utf8'));
  assert.doesNotMatch(contracts, /\.limit\(500\)/, '.limit(500) ตัดทะเบียนสัญญาเงียบ ๆ เมื่อเกิน 500 แถว (รวมฉบับ Rev.)');
});

test('check:rowcap ขึ้นทะเบียนตารางสายใบสั่งขายที่โตตามงานย้อนหลังแล้ว', () => {
  const source = fs.readFileSync(path.join(WEBAPP, 'scripts/check-row-cap.mjs'), 'utf8');
  for (const table of ['sales_order_lines', 'service_zone_terms', 'sales_contracts']) {
    assert.match(source, new RegExp(`^\\s*${table}:\\s*\\d+,`, 'm'), `${table} ต้องอยู่ใน CAPS`);
  }
  assert.match(source, /^\s*service_zone_terms:\s*0,/m, 'service_zone_terms เริ่มที่ 0 — ทุกจุดอ่านต้องห่อตั้งแต่ต้น');
});
