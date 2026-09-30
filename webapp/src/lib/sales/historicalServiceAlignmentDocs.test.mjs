// ── ยามเอกสารของ PR-D (ใบสั่งขายย้อนหลัง · แพ็คต่อรอบ + รอบบังคับ + วันวางบิลขั้น ③ · mig 0394 · IMPL_PLAN_D §4.7 D6) ──
//
// 🔴 เอกสารมติของรีโปนี้เคยเน่ามาแล้ว (AGENTS.md: "สถานะที่หัวไฟล์เคยเน่า") — รอบนี้มีสามประโยคที่ **เคยจริง แล้วเท็จทันที
//    ที่ 0394 รัน** และถ้าไม่มีใครเฝ้า จะส่งคนไปทำงานซ้ำ/ตัดสินจากข้อมูลผิด:
//   1. docs/billing-cycle.md "ยังไม่ทำ" — "ใบย้อนหลังยังไม่เก็บวันวางบิล (RPC ไม่มีสองคอลัมน์)" ⇒ คนถัดไปจะเขียน RPC ซ้ำ
//   2. docs/historical-sales-orders.md §2.4/§10 — "RPC อนุมัติเขียน packageQty = qty (ภาระงาน TS นับ 12 แพ็ค)"
//      ⇒ หลัง 0394 term = แพ็คต่อรอบของโซนผ่านตัวกลางของ 0392 · ใครอ่านของเก่าจะ "แก้" ของที่แก้แล้ว
//   3. ลำดับ deploy — ค่าที่ SELECT ตรวจหลังรันต้องตรงกับหัวไฟล์ migration ตัวจริง ไม่ใช่เลขที่พิมพ์ลอย ๆ
// ⭐ ยามอ่าน **ของจริงสองฝั่ง** (เอกสาร ↔ migration/โค้ด) แบบเดียวกับ serviceSetupLeftoverCopy.test.mjs —
//    เปลี่ยนโค้ดแล้วลืมเอกสาร (หรือกลับกัน) = แดง
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { HISTORICAL_BILLING_TEXT, HISTORICAL_SERVICE_TEXT } from './historicalIntakeForm.js';
import { HISTORICAL_SETUP_ISSUE_TEXT, PACKS_ROUNDS_HEAD } from './historicalOrderCopy.js';
import { WORKFLOW_ERROR_CODES } from './documentWorkflowErrors.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const WEBAPP = join(HERE, '../../..');
const REPO = join(WEBAPP, '..');
const read = (path) => readFileSync(path, 'utf8');
const doc = (name) => read(join(REPO, 'docs', name));
const src = (rel) => read(join(WEBAPP, 'src', rel));
const MIGRATION = read(join(WEBAPP, 'supabase/migrations/0394_historical_so_service_alignment.sql'));

/* หัวข้อระดับ `## ` หนึ่งก้อน (ถึงหัวข้อระดับเดียวกันถัดไป) — หาไม่เจอ = แดง ไม่ใช่ตัดเงียบ */
function section(text, heading, level = '## ') {
  const start = text.indexOf(`\n${heading}`);
  assert.ok(start >= 0, `หาหัวข้อ "${heading}" ไม่เจอ`);
  const next = text.indexOf(`\n${level}`, start + heading.length + 1);
  return text.slice(start, next < 0 ? undefined : next);
}
/* ข้อ bullet หนึ่งข้อ (ถึง bullet ถัดไประดับเดียวกัน / บรรทัดว่าง / หัวข้อ) */
function bullet(text, head) {
  const start = text.indexOf(head);
  assert.ok(start >= 0, `หาข้อ "${head}" ไม่เจอ`);
  const rest = text.slice(start + head.length);
  const end = rest.search(/\n(?:- |\n|#)/);
  return text.slice(start, start + head.length + (end < 0 ? rest.length : end));
}

/* แถวปะของ $patch$ จบด้วยคอลัมน์ป้าย `'0394/Px')` (P7a/P7b ปะในบรรทัด ไม่มีคอมเมนต์ "-- 0394/Px" ⇒ ดูที่แถว ไม่ใช่ที่คอมเมนต์) */
const hasPatchRow = (m) => MIGRATION.includes(`'0394/${m}')`);
const MARKERS = ['P3', 'P4', 'P5', 'P6', 'P7a', 'P7b', 'P7c', 'P8', 'P9a', 'P9b', 'P9c'];
const HIST = doc('historical-sales-orders.md');
const BILL = doc('billing-cycle.md');
/* หาไม่เจอ = แดงรายเทสต์ (ไม่ใช่ทั้งไฟล์ล้มตอนโหลด) */
const prd = () => section(HIST, '## 8E. PR-D · mig 0394');

// ── 1. docs/billing-cycle.md: ช่อง "ยังไม่ทำ" ของใบย้อนหลังปิดแล้ว (0394/P7) ─────────────────────────────────

test('billing-cycle.md: "ยังไม่ทำ" ไม่อ้างว่าใบย้อนหลังไม่เก็บวันวางบิลแล้ว · ประโยคเดิมสามจุดถูกแทน', () => {
  const todo = section(BILL, '## ยังไม่ทำ');
  assert.doesNotMatch(todo, /ใบย้อนหลังยังไม่เก็บวันวางบิล/, '0394/P7 ปิดช่องนี้แล้ว — ข้อค้างนี้จะส่งคนไปเขียน RPC ซ้ำ');
  assert.doesNotMatch(BILL, /RPC ของใบย้อนหลังไม่มีสองคอลัมน์|RPC ยังไม่มีสองคอลัมน์/);
  assert.doesNotMatch(BILL, /\*\*ใบย้อนหลัง\*\*: ยังกำหนดชำระอย่างเดียว/);
  assert.doesNotMatch(BILL, /RPC ปรับแผน \(0377\) \/ ใบย้อนหลัง ไม่ได้แก้/, 'ตัวเขียนของใบย้อนหลังเขียนวันวางบิลแล้ว (0394/P7)');
});

test('billing-cycle.md: ใบย้อนหลังเขียนวันวางบิลผ่าน historical_so_write_children (0394/P7) — อ้างของที่มีจริงใน migration', () => {
  assert.match(BILL, /ใบย้อนหลัง[^\n]*`historical_so_write_children` \(0394\/P7\)/);
  for (const m of ['P7a', 'P7b', 'P7c']) assert.ok(hasPatchRow(m), `migration ต้องมีแถวปะ 0394/${m}`);
  /* ไม่มี "รอเหตุการณ์" สำหรับใบย้อนหลัง — เอกสารต้องพูดเหมือนตัวเขียน (ไม่มีคอลัมน์ billingEvent ใน INSERT ของงวด) */
  const hist = bullet(section(BILL, '## รอบหก'), '- **ใบย้อนหลัง**');
  assert.match(hist, /ไม่มี "?รอเหตุการณ์"?/);
  assert.match(hist, /ไม่ต้องวางบิล/, 'กติกาซ่อนคอลัมน์ต้องอยู่ในข้อนี้');
  assert.ok(hist.includes(HISTORICAL_BILLING_TEXT.sub), `ข้อนี้ต้องยกคำใต้หัวคอลัมน์ตามจอ: ${HISTORICAL_BILLING_TEXT.sub}`);
  assert.doesNotMatch(MIGRATION.replace(/^--[^\n]*$/gm, ''), /"billingEvent"/, 'ตัวเขียนไม่แตะ billingEvent');
});

test('billing-cycle.md: แถว "ใบย้อนหลังขั้น ③" ของแผนที่โค้ดชี้ตารางงวด + ตัวตัดสินคอลัมน์ที่มีอยู่จริง', () => {
  const row = BILL.split('\n').find((line) => line.startsWith('| ใบย้อนหลังขั้น ③ |'));
  assert.ok(row, 'หาแถวแผนที่โค้ด "ใบย้อนหลังขั้น ③" ไม่เจอ');
  assert.match(row, /`HistoricalInstallmentTable`/);
  assert.match(row, /`historicalBillingColumn`/);
  assert.match(row, /0394/);
  assert.ok(existsSync(join(WEBAPP, 'src/components/salesPlanning/historicalWizard/HistoricalInstallmentTable.js')));
  assert.match(src('lib/sales/historicalIntakeForm.js'), /export function historicalBillingColumn\(/);
  assert.match(src('components/salesPlanning/historicalWizard/HistoricalInstallmentTable.js'), /billingColumn/);
});

// ── 2. docs/historical-sales-orders.md §8E: เอกสารของ PR-D ตรงกับ migration ─────────────────────────────────

test('historical-sales-orders.md: หัวไฟล์ + §8E บอกสถานะ PR-D ด้วยคำสถานะของบ้าน (กำลังดำเนินการ)', () => {
  const head = HIST.slice(0, HIST.indexOf('\n## 0.'));
  assert.match(head, /PR-D[^\n]*0394[^\n]*`กำลังดำเนินการ`/, 'บรรทัดสถานะหัวไฟล์ต้องมี PR-D');
  assert.match(prd(), /`กำลังดำเนินการ`/);
  assert.match(prd(), /claude\/so-service-historical/);
});

test('§8E: ครบทั้ง 11 บล็อกที่ migration ปะ (0394/P3 … P9c) — และทุกป้ายที่เอกสารอ้างมีอยู่ใน migration จริง', () => {
  for (const m of MARKERS) {
    assert.ok(prd().includes(`\`0394/${m}\``), `§8E ต้องอธิบาย 0394/${m}`);
    assert.ok(hasPatchRow(m), `migration ไม่มีแถวปะ 0394/${m} แต่เอกสารอ้าง`);
  }
  const cited = [...prd().matchAll(/`0394\/(P\d+[a-c]?)`/g)].map((m) => m[1]);
  for (const m of cited) assert.ok(MARKERS.includes(m), `เอกสารอ้าง 0394/${m} ที่ไม่มีอยู่จริง`);
});

test('§8E: ทุกรหัสที่ 0394 RAISE มีในเอกสาร · ทุกรหัสที่เอกสารอ้างมีข้อความไทยจริง (ตารางกลาง / ตัวแปลของขั้นอนุมัติ)', () => {
  const body = MIGRATION.replace(/^--[^\n]*$/gm, '');
  const raised = new Set([...body.matchAll(/RAISE EXCEPTION '([a-z][a-z0-9_]+)/g)].map((m) => m[1]));
  assert.ok(raised.size >= 5, `อ่านรหัสจาก migration ได้น้อยผิดปกติ: ${[...raised]}`);
  for (const code of raised) assert.ok(prd().includes(`\`${code}\``), `§8E ต้องบอกรหัส ${code}`);

  const workflow = src('lib/sales/historicalOrderWorkflow.js');
  const special = new Set(['sales_order_service_setup_incomplete', 'historical_service_setup_incomplete']);
  for (const code of special) assert.ok(workflow.includes(`'${code}'`), `ตัวแปลของขั้นอนุมัติต้องมี ${code}`);
  /* ชื่อฟังก์ชันขึ้นต้นเหมือนรหัส (historical_so_write_children · sales_order_service_setup_errors) — ไม่ใช่รหัส ⇒ ตัดออก
     ด้วยรายชื่อฟังก์ชันจริงของ migration ที่ 0394 ปะ (ไม่ใช่รายชื่อพิมพ์มือ) */
  const functions = new Set(['0374_historical_so_approval_flow', '0379_historical_so_quote_lines', '0392_so_service_setup']
    .flatMap((name) => [...read(join(WEBAPP, `supabase/migrations/${name}.sql`)).matchAll(/FUNCTION public\.([a-z0-9_]+)\(/g)])
    .map((m) => m[1]));
  assert.ok(functions.has('historical_so_write_children') && functions.has('sales_order_service_setup_errors'));
  const cited = new Set([...prd().matchAll(/`((?:historical_so|mig_0394|service_setup|sales_order_service_setup|historical_service_setup)_[a-z0-9_]+)`/g)]
    .map((m) => m[1]).filter((name) => !functions.has(name)));
  for (const code of cited) {
    assert.ok(WORKFLOW_ERROR_CODES.includes(code) || special.has(code), `เอกสารอ้างรหัส ${code} ที่ไม่มีข้อความไทย`);
  }
  assert.ok(prd().includes('`historical_zone_mismatch`'));
  assert.ok(Object.hasOwn(HISTORICAL_SETUP_ISSUE_TEXT, 'historical_zone_mismatch'));
});

test('§8E: คำบนจอที่เอกสารยกมาตรงกับค่าคงที่ของ lib (ไม่ใช่คำที่พิมพ์ลอย ๆ)', () => {
  for (const quoted of [
    HISTORICAL_SERVICE_TEXT.roundsNote,
    HISTORICAL_SERVICE_TEXT.bulk.packsLabel,
    HISTORICAL_BILLING_TEXT.sub,
    /* ⭐ มติเจ้าของ 29/09 (ใบใหม่และใบย้อนหลัง): ป้ายช่อง + หัวแถวของขั้น ④/โมดัลอนุมัติ = คำของใบใหม่ */
    HISTORICAL_SERVICE_TEXT.packsLabel,
    PACKS_ROUNDS_HEAD,
  ]) assert.ok(prd().includes(`"${quoted}"`), `§8E ต้องยกคำตามจอ: "${quoted}"`);
  assert.doesNotMatch(prd(), /"แพ็คต่อรอบ[^"]*"/, '§8E ห้ามยกป้ายเดิมก่อนมติ 29/09 เป็นคำบนจอ');
  const wizard = src('components/salesPlanning/historicalWizard/HistoricalOrderWizard.js');
  const notice = 'โหลดข้อมูลประกอบของใบไม่ขึ้น (รอบละกี่แพ็ค · ไฟล์เอกสาร · งวด)';
  assert.ok(wizard.includes(notice), 'ด่าน DD17 ของโหมดแก้ต้องมีจริงในวิซาร์ด');
  assert.ok(prd().includes(notice), '§8E ต้องบอกด่าน DD17 ด้วยคำเดียวกับจอ');
});

test('§2.4 · §10 · §1.1 A6: ประโยค "packageQty = qty" ของยุค 0374/0379 ถูกกำกับว่า 0394 แก้แล้ว (ไม่ใช่ของปัจจุบัน)', () => {
  const trap = bullet(HIST, '⚠️ **ผลต่อ TS**');
  assert.match(trap, /0394/, '§2.4 ต้องบอกว่า term = แพ็คต่อรอบตั้งแต่ 0394');
  const todo = bullet(HIST, '**(23/09) packageQty ของ TS**');
  assert.match(todo, /0394/, '§10 ต้องบอกว่าข้อนี้ปิดด้วย 0394');
  const a6 = HIST.split('\n').find((line) => line.startsWith('| A6 |'));
  assert.ok(a6 && a6.includes('0394/P3'), 'A6 ต้องบอกว่ารอบขายเปิดผ่านตัวกลางตั้งแต่ 0394/P3');
});

test('§6.1: ตัวอย่าง body + p_lines + ช่อง error บอกคีย์ใหม่ packsPerRound / billingDate ตามโค้ด', () => {
  const api = section(HIST, '### 6.1', '### ');
  assert.match(api, /"packsPerRound"/);
  assert.match(api, /"billingDate"/);
  assert.match(api, /`p_lines` = `\{[^`]*packsPerRound[^`]*\}`/);
  assert.match(api, /zones\.<i>\.<[^>]*packsPerRound[^>]*>/);
  assert.match(api, /installments\.<i>\.<[^>]*billingDate[^>]*>/);
  const plan = src('lib/sales/historicalOrderPlan.js');
  assert.match(plan, /'packsPerRound'/);
  assert.match(plan, /billingDate/);
});

test('§9.3: ลำดับ deploy ของ 0394 + ค่าที่ SELECT ตรวจหลังรันต้องได้ = บรรทัด "คาด:" ในหัว migration', () => {
  const deploy = section(HIST, '### 9.3 ลำดับ deploy ของ 0394', '### ');
  const expected = MIGRATION.match(/--\s+คาด: ([^\n]+)/);
  assert.ok(expected, 'หัว migration ต้องมีบรรทัด "คาด:"');
  const values = expected[1].split(' · ').map((pair) => pair.split(' = ')[1]?.trim());
  assert.equal(values.length, 9, `ค่าคาดต้องมี 9 ช่อง: ${expected[1]}`);
  assert.ok(deploy.includes(values.join(' · ')), `§9.3 ต้องบอกค่าคาดชุดเดียวกับหัว migration: ${values.join(' · ')}`);
  assert.match(deploy, /freeze/i);
  assert.match(deploy, /0394_historical_so_service_alignment\.sql/);
  assert.match(deploy, /check:columns/);
});

test('§5: ตารางยามมีแถวของ 0394 ชี้ไฟล์เทสต์ที่มีอยู่จริง', () => {
  const guards = section(HIST, '## 5. ยามกันไหลกลับ');
  for (const file of [
    'historicalServiceAlignmentMigration.test.mjs',
    'historicalServiceAlignmentUi.test.mjs',
    'historicalServiceAlignmentDocs.test.mjs',
  ]) {
    assert.ok(guards.includes(file), `§5 ต้องมี ${file}`);
    assert.ok(existsSync(join(HERE, file)), `${file} ไม่มีอยู่จริง`);
  }
});
