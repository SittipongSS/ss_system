// mig 0359 — ย้ายยอดที่พิมพ์ในสวิตช์ดีลเก่าไปเป็นบันทึก "ยอดปิดในระบบเดิม" (มติผู้ใช้ 2026-09-14)
//
// ไฟล์นี้รันมือบนฐานจริง (ไม่มีฐาน dev แยก) ⇒ ยามรูปทรงคือด่านเดียวก่อนถึงมือผู้ใช้:
//   · DML ล้วน ไม่แตะ trigger/ฟังก์ชัน (มติข้อ 1 · และไม่ให้ soPendingApprovalMigration อ่านผิดไฟล์)
//   · รายชื่อ id ชัดเจน ไม่วนทุกดีล (บทเรียน 0279) · ห้ามแตะ DL-26080394 (มี SO อนุมัติแล้ว)
//   · audit before ก่อนทุก UPDATE · ด่าน Won/legacy/ไม่มี SO · รันซ้ำได้
//   · บล็อก B (ดีลที่อาจยังผลิตอยู่) ต้องเป็นคอมเมนต์ รอเจ้าของยืนยัน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEGACY_CLOSED_NOTE_KEYS } from './legacyDealSwitch.js';

const raw = readFileSync(
  new URL('../../../supabase/migrations/0359_legacy_deal_closed_value_note.sql', import.meta.url),
  'utf8',
);
// ส่วนที่รันจริง = ตัดคอมเมนต์ทั้งบรรทัด · คอมเมนต์ท้ายบรรทัด · บล็อก /* */
const exec = raw
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n')
  .filter((line) => !line.trim().startsWith('--'))
  .map((line) => line.replace(/--.*$/, ''))
  .join('\n');
const statements = exec.split(';');

const BLOCK_A = {
  'DEAL-msmq1f4i8jdh': 'DL-26080119',
  'DEAL-mso2whm714hu': 'DL-26080143',
  'DEAL-mtclsh5v11135': 'DL-26080384',
  'DEAL-mtclxp1c1y5': 'DL-26080385',
};
const BLOCK_B = {
  'DEAL-mtjj5bkd314k8': 'DL-260900424',
  'DEAL-mt8660q31616': 'DL-26080340',
  'DEAL-mtiaoz3i115l1': 'DL-26090005',
  'DEAL-msqy1mna15ve': 'DL-26080160',
  'DEAL-mtjjdmno29qr': 'DL-260900425',
  'DEAL-mts2kiwy3rne': 'DL-260900461',
  'DEAL-mts2m2z4739k': 'DL-260900462',
  'DEAL-mt0zkjhh1a6q': 'DL-26080238',
  'DEAL-mt0yzt6d419so': 'DL-26080236',
  'DEAL-mtwuygxk1ftc': 'DL-260900491',
  'DEAL-mu10cfma1ect': 'DL-260900501',
};

test('0359 เป็นของจริง: ธุรกรรมเดียว · DML ล้วน · ไม่มีลูปทุกดีล', () => {
  assert.doesNotMatch(raw, /^SELECT 1;/m, 'ยังเป็นไฟล์จองเลข');
  assert.match(exec, /^BEGIN;/m);
  assert.match(exec, /^COMMIT;/m);
  assert.doesNotMatch(exec, /CREATE\s+OR\s+REPLACE\s+FUNCTION|CREATE\s+TRIGGER|ALTER\s+TABLE|CREATE\s+(UNIQUE\s+)?INDEX/i);
  assert.doesNotMatch(exec, /DROP\s+(TABLE|TRIGGER|FUNCTION|INDEX|COLUMN)|DELETE\s+FROM/i);
  assert.doesNotMatch(exec, /FOR\s+\w+\s+IN\s+SELECT/i, 'ห้ามวนดีล (บทเรียน 0279)');
  // soPendingApprovalMigration.test อ่านข้อความนี้ทั้งไฟล์รวมคอมเมนต์ — ห้ามเอ่ยถึงแม้ในหัวไฟล์
  assert.doesNotMatch(raw, /CREATE OR REPLACE FUNCTION public\./);
});

test('0359 รายชื่อ 15 ใบชัดเจน — id คู่รหัส · บล็อก A 4 ใบ 311,500 · รวม 1,956,850', () => {
  const rows = [...exec.matchAll(/\('(DEAL-[a-z0-9]+)',\s*'(DL-\d+)',\s*(\d+),\s*DATE '(\d{4}-\d{2}-\d{2})',\s*'([AB])'\)/g)];
  assert.equal(rows.length, 15);
  const byId = Object.fromEntries(rows.map(([, id, code, value, date, block]) => [id, { code, value: Number(value), date, block }]));
  for (const [id, code] of Object.entries(BLOCK_A)) assert.deepEqual([byId[id]?.code, byId[id]?.block], [code, 'A'], id);
  for (const [id, code] of Object.entries(BLOCK_B)) assert.deepEqual([byId[id]?.code, byId[id]?.block], [code, 'B'], id);
  const sum = (block) => rows.filter((r) => !block || r[5] === block).reduce((total, r) => total + Number(r[3]), 0);
  assert.equal(sum(), 1956850);
  assert.equal(sum('A'), 311500);
  assert.equal(sum('B'), 1645350);
  // เป้าหมายทุกชุดมาจากรายชื่อนี้เท่านั้น
  for (const table of ['_m0359_note', '_m0359_zero']) {
    const create = statements.find((s) => new RegExp(`CREATE TEMP TABLE ${table} ON COMMIT DROP AS`).test(s));
    assert.ok(create, table);
    assert.match(create, /JOIN _m0359_list l ON l\.id = d\.id AND l\.code = d\.code/, table);
  }
});

test('0359 ห้ามแตะดีลที่มี SO อนุมัติแล้ว (DL-26080394)', () => {
  assert.doesNotMatch(exec, /DEAL-mtcvj7525145n|DL-26080394/);
  assert.doesNotMatch(raw, /DEAL-mtcvj7525145n/);
});

test('0359 ด่านรายแถว: Won · legacy · ไม่มี SO อนุมัติ · ไม่มีใบเสนอราคา · ครบหรือไม่ทำเลย · รันซ้ำได้', () => {
  assert.match(exec, /d\.stage = 'won'/);
  assert.match(exec, /d\.metadata->>'legacy' = 'true'/);
  assert.match(exec, /NOT EXISTS \(SELECT 1 FROM public\.sales_orders so\s+WHERE so\."dealId" = d\.id AND so\.status = 'approved'\)/);
  assert.match(exec, /NOT EXISTS \(SELECT 1 FROM public\.quotations q WHERE q\."dealId" = d\.id\)/);
  assert.match(exec, /NOT \(d\.metadata \? 'legacyClosedValue'\)/, 'รอบสองต้องไม่เจอแถว');
  assert.match(exec, /d\."endDate" < DATE '2026-09-14'/, 'ล้าง FC เฉพาะดีลที่ endDate ผ่านไปแล้ว');
  assert.equal((exec.match(/RAISE EXCEPTION/g) || []).length, 2);
  // ใบที่ถูกลบก่อนรัน (มติข้อ 3 ยังค้าง) ต้องไม่ล้มทั้งไฟล์ — ด่านนับเทียบใบที่ยังอยู่ ไม่ใช่เลข 15/4 ตายตัว
  // และประกาศรหัสที่ข้าม (ไม่ข้ามเงียบ)
  assert.doesNotMatch(exec, /<>\s*(15|4)\b/, 'ด่านครบห้ามเทียบเลขตายตัว — ใบที่ถูกลบจะล้มทั้งไฟล์');
  assert.equal((exec.match(/IF v_targets \+ v_done <> v_live THEN/g) || []).length, 2);
  assert.match(exec, /FROM _m0359_list l JOIN public\.sales_deals d ON d\.id = l\.id;/, 'นับใบที่ยังอยู่ด้วย id อย่างเดียว');
  assert.match(exec, /RAISE NOTICE 'mig 0359: ข้ามดีลที่ถูกลบไปแล้ว/);
  assert.equal((exec.match(/ON CONFLICT \(id\) DO NOTHING/g) || []).length, 2, 'แถวประวัติ/เธรด id คงที่ — รันซ้ำไม่ซ้ำ');
});

test('0359 audit before ก่อนทุก UPDATE · ทุก UPDATE ผูกกับชุดเป้าหมาย', () => {
  const firstAudit = exec.indexOf('INSERT INTO public.audit_logs');
  assert.ok(firstAudit > 0);
  assert.ok(firstAudit < exec.indexOf('UPDATE public.sales_deals'), 'บันทึก before ก่อนเขียนบันทึก');
  assert.ok(exec.indexOf('ล้างมูลค่า FC ของ') < exec.indexOf('"projectValue"        = 0'), 'before ก่อนล้างยอด');
  assert.ok(exec.indexOf("'sales_deal_value_item'") < exec.indexOf('UPDATE public.sales_deal_value_items'));
  assert.match(exec, /'migration-0359', 'ระบบ \(mig 0359\)', 'system'/);
  assert.match(exec, /to_jsonb\(t\)/);
  const updates = statements.filter((s) => /UPDATE\s+public\.sales_deal/.test(s));
  assert.equal(updates.length, 3);
  for (const statement of updates) assert.match(statement, /FROM _m0359_/, statement);
});

test('0359 เขียนแค่บันทึกกับยอด FC — ไม่แตะ Actual/สถานะ และคำสั่งล้างยอดไม่ปลุก trigger', () => {
  assert.doesNotMatch(exec, /"wonValue"|'actualSource'|wonMonth/);
  for (const key of LEGACY_CLOSED_NOTE_KEYS) assert.ok(exec.includes(`'${key}'`), key);
  const zero = statements.find((s) => /UPDATE public\.sales_deals d SET\s+"projectValue"/.test(s));
  assert.ok(zero);
  const setList = zero.slice(zero.indexOf('SET'), zero.indexOf('FROM'));
  assert.doesNotMatch(setList, /metadata|stage|wonValue/,
    'enforce เป็น BEFORE UPDATE OF stage/wonValue/metadata — คำสั่งล้างยอดต้องไม่ปลุกมัน');
});

test('0359 บล็อก B (ดีลที่อาจยังผลิตอยู่) เป็นคอมเมนต์ รอเจ้าของยืนยัน · หัวไฟล์บอกเวลารันและรันซ้ำได้', () => {
  assert.doesNotMatch(exec, /_m0359_b\b/);
  assert.match(raw, /^-- CREATE TEMP TABLE _m0359_b/m);
  assert.match(raw, /^-- UPDATE public\.sales_deals/m);
  for (const id of Object.keys(BLOCK_B)) assert.ok(raw.includes(`--   ('${id}'`), id);
  assert.match(raw, /รันหลัง deploy/);
  assert.match(raw, /รันซ้ำได้/);
});
