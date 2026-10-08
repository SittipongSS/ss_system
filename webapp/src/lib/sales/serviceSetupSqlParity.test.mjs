// ── ฐาน ↔ JS ของงานบริการ (mig 0392 ↔ lib/sales/serviceSetup.js) ────────────────────────────────────
//
// ⭐ ตัวตัดสินเดียวกันมีสองบ้าน: ฐาน (RPC/trigger — ด่านสุดท้าย) กับ JS (จอ/route — บอกเหตุเป็นไทยก่อนกด)
//    ⇒ สองบ้านต้องพูดเรื่องเดียวกัน · ไฟล์นี้เทียบ
//      1) หมวดของ FG: รูปแบบ regex ของ fg_category_of = categoryOf
//      2) ชนิดของบรรทัด: ค่า '02-001' ของฐาน = SERVICE_ROUND_CATEGORY · ตารางอินพุต → ผลที่ PGlite ยืนยันแล้ว
//         (ฮาร์เนสเคส 9a) ต้องได้ผลเดียวกันจาก serviceLineRole
//      3) รหัสทุกตัวที่ sales_order_service_setup_errors ปล่อย มีข้อความไทยใน SERVICE_SETUP_ISSUE_TEXT
//         (ตัวของ 0392 + รหัสที่แพตช์ L1 ของ 0400 เติมเข้าไปในตัวที่รันอยู่: line_period_missing)
//      4) RAISE ทุกรหัสในฟังก์ชันของ 0392 + 0396 + 0400 มีข้อความไทย/สถานะใน SERVICE_SETUP_SQL_MESSAGES
//         (ยกเว้น service_setup_copy_line_mismatch ซึ่งยิงจากทางออก Rev. ⇒ อยู่ใน documentWorkflowErrors)
//      5) รหัสบล็อกทุกตัวที่ sales_order_service_reopen_blockers (0396) ปล่อย มีข้อความไทยใน SERVICE_REOPEN_BLOCKER_TEXT
//         และแคตตาล็อกไม่มีรหัสที่ฐานไม่เคยปล่อย (ยกเว้นรหัสฝั่ง JS: money_fn · unread)
//      6) ยื่นโดยยังไม่ตั้งงานบริการ (0404): รหัสของตัวห่อการยื่นมีข้อความ/สถานะ · "ข้อของการตั้งงานบริการ" ฝั่ง JS (กลุ่ม setup ของ
//         serviceSetupIssueGroup) = รหัสที่ตัวตรวจของฐานปล่อยให้ใบ pipeline พอดี ⇒ JS "ข้ามได้" ⟺ ฐาน "ยังไม่ครบ"
//         · เงื่อนไข "มีรายการที่ต้องตั้ง" และ "ใบเดิมของ Rev. ยังเดินรอบ" ของฐานคู่กับ serviceLineNeedsBackfill / ตัวโหลดใบเดิมของ JS
// ⚠️ ส่วน 2–4 import serviceSetup.js ของงาน U2a แบบ dynamic — ไม่มีไฟล์ = แดงพร้อมบอกเหตุ (ส่วน 1 ยังรันได้)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { categoryOf } from '../master/categoryOf.js';
import { SERVICE_ROUND_CATEGORY } from './serviceOrders.js';
import { WORKFLOW_ERROR_CODES } from './documentWorkflowErrors.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const CODE = stripComments(readFileSync(new URL('0392_so_service_setup.sql', MIGRATIONS), 'utf8'));
/* เปิดแก้งานบริการหลังอนุมัติ (mig 0396) — ฟังก์ชันใหม่สองตัว ไม่ปะของ 0392 */
const REOPEN_CODE = stripComments(readFileSync(new URL('0396_so_service_reopen.sql', MIGRATIONS), 'utf8'));
/* ช่วงบริการรายรายการ (mig 0400) — เขียนทับ save / copy / guard ของ 0392 ทั้งตัว (นิยามที่รันอยู่ = ตัวของ 0400) + ปะตัวตรวจสองจุด (L1 · L2)
   ตัวดิบเก็บไว้ด้วย: ข้อความที่ปะ (replacement) มีบรรทัดป้ายเป็นคอมเมนต์ */
const PERIOD_RAW = readFileSync(new URL('0400_so_service_line_period.sql', MIGRATIONS), 'utf8');
const PERIOD_CODE = stripComments(PERIOD_RAW);
/* ยื่นโดยยังไม่ตั้งงานบริการ (mig 0404) — ฟังก์ชันใหม่สองตัว (ตัวห่อการยื่น · ตัวล้างตราของ trigger) + ปะตัวเปิดรอบขายหนึ่งจุด (D1)
   ตัวดิบเก็บไว้ด้วย: บล็อกที่ปะ (D1) มีบรรทัดป้ายเป็นคอมเมนต์ */
const DEFER_RAW = readFileSync(new URL('0404_so_service_setup_defer.sql', MIGRATIONS), 'utf8');
const DEFER_CODE = stripComments(DEFER_RAW);

function fnBodyIn(code, label, name) {
  const from = code.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(from >= 0, `${label} ต้องนิยาม ${name}`);
  return code.slice(code.indexOf('AS $$', from) + 5, code.indexOf('\n$$;', from));
}
const fnBody = (name) => fnBodyIn(CODE, '0392', name);
/* ตัวฟังก์ชันทั้งหมดของไฟล์ (ไม่รวมบล็อก DO ของด่านก่อนรัน/ปะ/ตรวจท้าย — รหัส mig_039x_* เป็นของคนรัน migration) */
const functionBodiesOf = (code, label) => [...code.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)]
  .map((m) => fnBodyIn(code, label, m[1])).join('\n');
const allFunctionBodies = () => [functionBodiesOf(CODE, '0392'), functionBodiesOf(REOPEN_CODE, '0396'), functionBodiesOf(PERIOD_CODE, '0400'),
  functionBodiesOf(DEFER_CODE, '0404')].join('\n');
/* ข้อความที่ 0400 ปะเข้าตัวตรวจรายการที่ยังขาด — แถว VALUES ของ DO $patch$: [ป้าย, ข้อความใหม่] */
const periodPatchRows = () => [...PERIOD_RAW.matchAll(/\('sales_order_service_setup_errors',\s*\$re\$[\s\S]*?\$re\$,\s*\$rp\$([\s\S]*?)\$rp\$,\s*'([^']+)'\)/g)]
  .map((m) => ({ marker: m[2], replacement: m[1] }));

async function serviceSetupModule() {
  try {
    return await import('./serviceSetup.js');
  } catch (error) {
    assert.fail(`serviceSetup.js (U2a) ยังโหลดไม่ได้ — ${error.message}`);
  }
  return null;
}

test('fg_category_of ใช้รูปแบบเดียวกับ categoryOf (\\d{2}-\\d{3} ตัวแรกของรหัส)', () => {
  const sql = /substring\(p_code from '([^']+)'\)/.exec(fnBody('fg_category_of'));
  assert.ok(sql, 'fg_category_of ต้องเป็น substring(p_code from \'<regex>\')');
  const jsSrc = readFileSync(new URL('../master/categoryOf.js', import.meta.url), 'utf8');
  const js = /fgCode\.match\(\/([^/]+)\/\)/.exec(jsSrc);
  assert.ok(js, 'categoryOf ต้อง match ด้วย regex ตัวเดียว');
  assert.equal(js[1].replace(/[()]/g, ''), sql[1]);
  // ตัวอย่างจริงทั้งสองทรงของรหัส (ออโต้ 4 หลัก / กรอกมือ 3 หลัก) + ของเสีย
  const sqlLike = (code) => (code == null ? null : (new RegExp(sql[1]).exec(code)?.[0] ?? null));
  for (const code of ['FG-0521-02-001-00012', 'FG-885-02-001-2159', 'FG-0521-03-002-00001', '02-001', 'abc', '', null]) {
    assert.equal(sqlLike(code), categoryOf(code), String(code));
  }
});

test("ชนิดของบรรทัด: หมวดแพ็คเกจในฐาน = SERVICE_ROUND_CATEGORY ('02-001') ทุกจุด", () => {
  const role = fnBody('sales_order_line_service_role');
  const literals = [...role.matchAll(/= '(\d{2}-\d{3})'/g)].map((m) => m[1]);
  assert.equal(literals.length, 2, 'FG และ metadata.categoryCode');
  for (const lit of literals) assert.equal(lit, SERVICE_ROUND_CATEGORY);
  for (const name of ['sales_order_service_setup_errors', 'save_sales_order_service_setup']) {
    for (const m of fnBody(name).matchAll(/fg_category_of\([^)]*\) = '([^']+)'/g)) assert.equal(m[1], SERVICE_ROUND_CATEGORY, name);
  }
  /* ตัวบันทึกที่รันอยู่ = ตัวของ 0400 (เขียนทับทั้งตัว) — หมวดของแพ็คเกจต้องยังเป็นค่าเดียวกัน และต้องยังตรวจอยู่ */
  const saveNow = [...fnBodyIn(PERIOD_CODE, '0400', 'save_sales_order_service_setup').matchAll(/fg_category_of\([^)]*\) = '([^']+)'/g)];
  assert.equal(saveNow.length, 1, '0400: ตัวบันทึกตรวจหมวดของแพ็คเกจที่เลือกหนึ่งจุด (เท่า 0392)');
  for (const m of saveNow) assert.equal(m[1], SERVICE_ROUND_CATEGORY, '0400 save_sales_order_service_setup');
});

/* ตารางเดียวกับฮาร์เนส PGlite เคส 9a — ผลฝั่งฐานยืนยันบน PGlite แล้ว (null = ยังไม่เลือก ↔ 'unset' ของ JS) */
const FG_PKG = 'FG-0521-02-001-00012';
const FG_03 = 'FG-0521-03-002-00001';
const ROLE_FIXTURE = [
  { line: { metadata: { categoryCode: '02-001' } }, sql: 'package' },
  { line: { metadata: { categoryCode: '03-002' } }, sql: 'not_service' },
  { line: { metadata: { categoryCode: '' } }, sql: null },
  { line: { metadata: {} }, sql: null },
  { line: { fgCode: FG_PKG, productId: 'P_PKG', metadata: {} }, sql: 'package' },
  { line: { fgCode: FG_03, productId: 'P_03', metadata: { categoryCode: '02-001' } }, sql: 'not_service' },
  { line: { productId: 'P_X', metadata: {} }, sql: 'not_service' },
  { line: { serviceKind: 'not_service', metadata: { categoryCode: '02-001' } }, sql: 'not_service' },
  { line: { serviceKind: 'package', metadata: {} }, sql: 'package' },
  // สตริงว่าง = ไม่มี · ไม่ trim (ตรงกับ CHECK ที่ดู IS NULL) — ช่องว่างล้วนนับเป็นมีค่า
  { line: { fgCode: '  ', productId: '', metadata: { categoryCode: '  ' } }, sql: 'not_service' },
  { line: { metadata: { categoryCode: ' 02-001 ' } }, sql: 'package' },
  { line: { metadata: { categoryCode: 'abc' } }, sql: 'not_service' },
  { line: { metadata: { categoryCode: null } }, sql: null },
  { line: { fgCode: '', productId: '', metadata: {} }, sql: null },
  { line: { metadata: { categoryCode: '  ' } }, sql: 'not_service' },
];

test('🔴 serviceLineRole (JS) ตอบเหมือน sales_order_line_service_role (ฐาน) ทุกแถวของตาราง 9a', async () => {
  const { serviceLineRole, SERVICE_ROLE_UNSET } = await serviceSetupModule();
  for (const { line, sql } of ROLE_FIXTURE) {
    assert.equal(serviceLineRole(line), sql ?? SERVICE_ROLE_UNSET, JSON.stringify(line));
  }
});

test('🔴 ทุกรหัสที่ sales_order_service_setup_errors ปล่อย มีข้อความไทยใน SERVICE_SETUP_ISSUE_TEXT', async () => {
  const { SERVICE_SETUP_ISSUE_TEXT } = await serviceSetupModule();
  const body = fnBody('sales_order_service_setup_errors');
  const codes = new Set([...body.matchAll(/'([a-z_]+):'/g)].map((m) => m[1]));
  if (body.includes("'period_missing'")) codes.add('period_missing');
  assert.deepEqual([...codes].sort(), ['fg_invalid', 'fg_missing', 'kind_missing', 'packs_missing', 'period_missing',
    'rounds_missing', 'zone_invalid', 'zones_missing', 'zones_on_not_service']);
  for (const code of codes) {
    assert.equal(typeof SERVICE_SETUP_ISSUE_TEXT[code], 'function', `SERVICE_SETUP_ISSUE_TEXT.${code}`);
  }
});

test('🔴 0400: รหัสที่แพตช์ L1 เติมเข้าตัวตรวจ (line_period_missing) มีข้อความไทยใน SERVICE_SETUP_ISSUE_TEXT · L2 ไม่เพิ่มรหัสใหม่', async () => {
  const { SERVICE_SETUP_ISSUE_TEXT } = await serviceSetupModule();
  const rows = periodPatchRows();
  assert.deepEqual(rows.map((r) => r.marker), ['0400/L1', '0400/L2'], 'ปะตัวตรวจสองแถว: L1 แล้ว L2');
  const [l1, l2] = rows;
  const codes = [...new Set([...l1.replacement.matchAll(/'([a-z_]+):'/g)].map((m) => m[1]))];
  assert.deepEqual(codes, ['line_period_missing'], 'L1 ปล่อยรหัสเดียว');
  for (const code of codes) assert.equal(typeof SERVICE_SETUP_ISSUE_TEXT[code], 'function', `SERVICE_SETUP_ISSUE_TEXT.${code}`);
  /* L2 แค่เปลี่ยนเงื่อนไขของ period_missing (อ่านรหัสของ L1 เป็นข้อความ ไม่ได้ปล่อย) — ไม่มี v_errors := … ใหม่ */
  assert.doesNotMatch(l2.replacement, /v_errors\s*:=/);
  assert.ok(l2.replacement.includes(`position('line_period_missing:' in array_to_string(v_errors, ',')) = 0`));
});

test('🔴 RAISE ทุกรหัสในฟังก์ชันของ 0392 + 0396 + 0400 + 0404 มีข้อความ/สถานะใน SERVICE_SETUP_SQL_MESSAGES (หรือ documentWorkflowErrors)', async () => {
  const { SERVICE_SETUP_SQL_MESSAGES } = await serviceSetupModule();
  const codes = new Set([...allFunctionBodies().matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map((m) => m[1]));
  assert.ok(codes.size >= 20, `เจอแค่ ${codes.size} รหัส — ตัวไล่น่าจะพัง`);
  const WORKFLOW_ONLY = new Set(['service_setup_copy_line_mismatch']);
  for (const code of codes) {
    if (WORKFLOW_ONLY.has(code)) {
      assert.ok(WORKFLOW_ERROR_CODES.includes(code), `${code}: ต้องอยู่ใน documentWorkflowErrors (ยิงจากทางออก Rev.)`);
      continue;
    }
    const entry = SERVICE_SETUP_SQL_MESSAGES[code];
    assert.ok(entry, `SERVICE_SETUP_SQL_MESSAGES.${code}`);
    assert.equal(typeof entry.message, 'string', `${code}.message`);
    assert.ok(Number.isInteger(entry.status) && entry.status >= 400, `${code}.status`);
  }
  // รหัสที่ JS ถือไว้แต่ฐานไม่เคยยิง = ข้อความที่ไม่มีทางเห็น (ไม่ผิด แต่บอกว่าสองบ้านเลื่อนกัน)
  const ghost = Object.keys(SERVICE_SETUP_SQL_MESSAGES).filter((code) => !codes.has(code));
  assert.deepEqual(ghost, [], 'SERVICE_SETUP_SQL_MESSAGES มีรหัสที่ 0392/0396/0400/0404 ไม่ได้ยิง');
  /* 0400 ยิงรหัสใหม่สี่ตัวจากตัวบันทึก — สถานะ HTTP ตามสัญญา (แผน IMPL_PLAN_PERIOD §1 D-P5): โหมดผิดรูป 400 · ส่งช่วงของใบมาขณะ
     โหมดแยกรายรายการ 409 (จอค้างรุ่นเก่า — โหลดใหม่) · ส่งช่วงของรายการมาขณะโหมดทั้งใบ 400 · ช่วงของรายการผิดรูป 400 */
  const periodCodes = new Set([...functionBodiesOf(PERIOD_CODE, '0400').matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map((m) => m[1]));
  const NEW_PERIOD_CODES = { service_setup_period_mode_invalid: 400, service_setup_period_derived: 409,
    service_setup_line_period_mode: 400, service_setup_line_period_invalid: 400 };
  for (const [code, status] of Object.entries(NEW_PERIOD_CODES)) {
    assert.ok(periodCodes.has(code), `0400 ต้องยิง ${code}`);
    assert.ok(!functionBodiesOf(CODE, '0392').includes(`'${code}'`), `${code} เป็นรหัสใหม่ของ 0400`);
    assert.equal(SERVICE_SETUP_SQL_MESSAGES[code].status, status, code);
  }
  /* ผู้แปลหาด้วย message.includes(code) ⇒ รหัสใหม่ต้องไม่เป็นสตริงย่อยของรหัสอื่น และรหัสอื่นต้องไม่เป็นสตริงย่อยของรหัสใหม่ */
  for (const code of Object.keys(NEW_PERIOD_CODES)) {
    for (const other of codes) {
      if (other === code) continue;
      assert.ok(!other.includes(code) && !code.includes(other), `${code} ↔ ${other}: เป็นสตริงย่อยของกัน`);
    }
  }
  // 0396 ยิงรหัสใหม่สามตัว (สถานะ · บล็อก · ระบบยุ่ง) — สถานะ HTTP ตามสัญญา §3.8 ของแผน
  const reopenCodes = new Set([...functionBodiesOf(REOPEN_CODE, '0396').matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map((m) => m[1]));
  for (const code of ['service_setup_reopen_state_invalid', 'service_setup_reopen_blocked', 'service_setup_reopen_busy']) {
    assert.ok(reopenCodes.has(code), `0396 ต้องยิง ${code}`);
    assert.equal(SERVICE_SETUP_SQL_MESSAGES[code].status, 409, code);
  }
});

/* ── ยื่นโดยยังไม่ตั้งงานบริการ (mig 0404) ──────────────────────────────────────────────────────────────────────────── */
const DEFER_WRAPPER = 'submit_sales_order_deferring_service_setup';
const NEW_DEFER_CODES = ['service_setup_defer_state_invalid', 'service_setup_defer_nothing', 'service_setup_defer_terms_exist', 'service_setup_defer_plans_running',
  'service_setup_defer_ml_set'];

test('🔴 0404: ตัวห่อการยื่นยิงแปดรหัส — ห้าตัวใหม่ (409) + สามตัวเดิม · ทุกตัวมีข้อความ · ไม่มีรหัสไหนเป็นสตริงย่อยของอีกรหัส', async () => {
  const { SERVICE_SETUP_SQL_MESSAGES, serviceSetupSqlMessage } = await serviceSetupModule();
  const wrapper = fnBodyIn(DEFER_CODE, '0404', DEFER_WRAPPER);
  const raised = [...wrapper.matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map((m) => m[1]);
  /* ลำดับ = ลำดับของด่านในฟังก์ชัน: สิทธิ์ → ไม่พบใบ → สถานะ → เวอร์ชัน → ไม่มีอะไรให้ข้าม → รอบขายค้าง → ใบเดิมยังเดินรอบ */
  assert.deepEqual(raised, ['service_setup_forbidden', 'sales_order_not_found', 'service_setup_defer_state_invalid', 'workflow_stale',
    'service_setup_defer_nothing', 'service_setup_defer_terms_exist', 'service_setup_defer_plans_running', 'service_setup_defer_ml_set']);
  assert.deepEqual(raised.map((code) => SERVICE_SETUP_SQL_MESSAGES[code]?.status), [403, 404, 409, 409, 409, 409, 409, 409]);
  const older = `${functionBodiesOf(CODE, '0392')}\n${functionBodiesOf(REOPEN_CODE, '0396')}\n${functionBodiesOf(PERIOD_CODE, '0400')}`;
  for (const code of NEW_DEFER_CODES) {
    assert.ok(!older.includes(`'${code}'`), `${code} เป็นรหัสใหม่ของ 0404`);
    assert.equal(serviceSetupSqlMessage({ message: `P0001: ${code}` })?.code, code, 'ผู้แปลหาเจอเป็นตัวเอง');
  }
  /* ผู้แปลหาด้วย message.includes(code) ⇒ รหัสใหม่ ↔ รหัสอื่นทุกตัว (ทุกไฟล์) ต้องไม่เป็นสตริงย่อยของกัน ทั้งสองทิศ */
  const every = new Set([...allFunctionBodies().matchAll(/RAISE EXCEPTION '([a-z_]+)'/g)].map((m) => m[1]));
  for (const code of NEW_DEFER_CODES) {
    for (const other of every) {
      if (other === code) continue;
      assert.ok(!other.includes(code) && !code.includes(other), `${code} ↔ ${other}: เป็นสตริงย่อยของกัน`);
    }
  }
  /* ตัวล้างตราของ trigger ไม่ยิงอะไร · ตัวห่อเรียกตัวยื่นเดิมด้วยพารามิเตอร์แปดตัวเดิมตามลำดับ (ผู้ลงนาม = ค่าที่ route ส่ง) */
  assert.doesNotMatch(fnBodyIn(DEFER_CODE, '0404', 'sales_order_service_defer_clear'), /RAISE/);
  assert.match(wrapper, /v_result := public\.submit_sales_order_with_signature_evidence_atomic\(\s*p_order_id, p_evidence_id, p_expected_updated_at, p_document_fingerprint,\s*p_actor_id, p_actor_name, p_actor_role, p_actor_team\s*\);/);
});

test('🔴 0404: "ข้อของการตั้งงานบริการ" ฝั่ง JS (กลุ่ม setup) = รหัสที่ตัวตรวจของฐานปล่อยให้ใบ pipeline พอดี — JS "ข้ามได้" ⟺ ฐาน "ยังไม่ครบ"', async () => {
  const { SERVICE_SETUP_ISSUE_TEXT, serviceSetupIssueGroup, serviceSetupDeferSplit } = await serviceSetupModule();
  /* รหัสของตัวตรวจที่รันอยู่สำหรับใบ pipeline = ตัวของ 0392 + รหัสที่ L1 ของ 0400 เติม (0394/P9c เติมรหัสของใบย้อนหลังเท่านั้น — ใบย้อนหลังมีตราการข้ามไม่ได้) */
  const body = fnBody('sales_order_service_setup_errors');
  const sqlCodes = new Set([...body.matchAll(/'([a-z_]+):'/g)].map((m) => m[1]));
  if (body.includes("'period_missing'")) sqlCodes.add('period_missing');
  for (const row of periodPatchRows()) for (const m of row.replacement.matchAll(/v_errors \|\| \('([a-z_]+):'/g)) sqlCodes.add(m[1]);
  assert.equal(sqlCodes.size, 10, [...sqlCodes].join(','));
  const jsSetup = Object.keys(SERVICE_SETUP_ISSUE_TEXT).filter((key) => serviceSetupIssueGroup({ key, owner: 'SA' }) === 'setup');
  assert.deepEqual(jsSetup.sort(), [...sqlCodes].sort(),
    'กลุ่ม setup ต้องเท่ากับรหัสของตัวตรวจฝั่งฐานพอดี — ขาด = ใบที่ฐานเห็นว่าไม่ครบแต่ JS ไม่ให้ข้าม · เกิน = JS ให้ข้ามแต่ฐานเปิดรอบขายตามปกติ');
  /* แต่ละรหัสของฐานตัวเดียวก็ทำให้ข้ามได้ · ข้อที่ฐานมองไม่เห็น (JS เท่านั้น) ตัวเดียวไม่ทำให้ข้ามได้ */
  for (const key of sqlCodes) assert.equal(serviceSetupDeferSplit([{ key, owner: 'SA' }]).deferrable, true, key);
  for (const key of Object.keys(SERVICE_SETUP_ISSUE_TEXT).filter((k) => !sqlCodes.has(k))) {
    assert.equal(serviceSetupDeferSplit([{ key, owner: 'SA' }]).deferrable, false, key);
  }
  /* ตัวห่อถามตัวตรวจตัวเดียวกันกับการอนุมัติ (ไม่มีอะไรให้ข้าม = ตัวตรวจว่าง) · แพตช์ D1 อยู่ในกิ่ง "ยังไม่ครบ" ของตัวเปิดรอบขาย */
  const wrapper = fnBodyIn(DEFER_CODE, '0404', DEFER_WRAPPER);
  assert.match(wrapper, /v_errors := public\.sales_order_service_setup_errors\(v_order\.id\);\s*IF cardinality\(v_errors\) = 0/);
  assert.ok(DEFER_RAW.includes("(IF cardinality\\(v_errors\\) > 0 THEN)(\\s*RAISE EXCEPTION 'sales_order_service_setup_incomplete')"), 'จุดปะ D1');
});

test('🔴 0404: เงื่อนไขของฐานที่ JS ต้องพูดตรงกัน — "มีรายการที่ต้องตั้ง" = serviceLineNeedsBackfill · "ใบเดิมของ Rev. ยังเดินรอบ" = ตัวโหลดใบเดิม', async () => {
  const { serviceLineNeedsBackfill } = await serviceSetupModule();
  const wrapper = fnBodyIn(DEFER_CODE, '0404', DEFER_WRAPPER);
  /* ① รายการที่ต้องตั้ง: ชนิดที่บรรทัดตัดสินได้เอง (ไม่ส่งชนิดที่เก็บ = NULL) ไม่ใช่ 'not_service' หรือฝ่ายขายเลือกเป็นแพ็คเกจ */
  assert.match(wrapper, /public\.sales_order_line_service_role\(NULL, l\."fgCode", l\."productId", l\.metadata\) IS DISTINCT FROM 'not_service'\s*OR l\."serviceKind" = 'package'/);
  /* ตาราง 9a (ผลฝั่งฐานยืนยันบน PGlite แล้ว): ชนิดที่ตัดสินเอง = แถวเดียวกันที่ไม่มี serviceKind */
  const derivedSql = (line) => {
    const { serviceKind, ...bare } = line;
    const hit = ROLE_FIXTURE.find((row) => !('serviceKind' in row.line) && JSON.stringify(row.line) === JSON.stringify(bare));
    assert.ok(hit, `ตาราง 9a ต้องมีแถวที่ไม่มี serviceKind ของ ${JSON.stringify(bare)}`);
    return hit.sql;
  };
  for (const { line } of ROLE_FIXTURE) {
    const sqlNeeds = derivedSql(line) !== 'not_service' || line.serviceKind === 'package';
    assert.equal(serviceLineNeedsBackfill(line), sqlNeeds, JSON.stringify(line));
  }
  /* ② ใบเดิมของ Rev. ยังเดินรอบ: ตัวห่อและแพตช์ D1 ใช้เงื่อนไขเดียวกับตัวย้ายรอบ (salesOrderId = revisedFromId ∧ isActive)
        · JS อ่านชุดเดียวกันใน loadPredecessor (`ctx.predecessor.activePlanSiteIds`) */
  assert.match(wrapper, /IF v_order\."revisedFromId" IS NOT NULL\s*AND EXISTS \(SELECT 1 FROM public\.service_plans sp\s*WHERE sp\."salesOrderId" = v_order\."revisedFromId" AND sp\."isActive"\) THEN\s*RAISE EXCEPTION 'service_setup_defer_plans_running';/);
  const d1 = DEFER_RAW.slice(DEFER_RAW.indexOf('-- 0404/D1 ▶', DEFER_RAW.indexOf('$patch$')), DEFER_RAW.indexOf('-- 0404/D1 ◀', DEFER_RAW.indexOf('$patch$')));
  assert.match(d1, /dp\."salesOrderId" = v_order\."revisedFromId" AND dp\."isActive"/);
  assert.match(d1, /v_order\."serviceSetupDeferredAt" IS NOT NULL/);
  assert.match(d1, /RETURN 0;/);
  assert.doesNotMatch(d1, /\b(UPDATE|INSERT|DELETE|PERFORM)\b/, 'บล็อก D1 อ่านอย่างเดียว');
  const repo = readFileSync(new URL('./serviceSetupRepo.js', import.meta.url), 'utf8');
  assert.match(repo, /from\('service_plans'\)\.select\('id, "siteId"'\)\s*\.eq\('salesOrderId', revisedFromId\)\.eq\('isActive', true\)/);
});

test('🔴 รหัสบล็อกทุกตัวของ sales_order_service_reopen_blockers (0396) มีข้อความไทยใน SERVICE_REOPEN_BLOCKER_TEXT', async () => {
  const { SERVICE_REOPEN_BLOCKER_TEXT, serviceReopenBlockers } = await serviceSetupModule();
  const body = fnBodyIn(REOPEN_CODE, '0396', 'sales_order_service_reopen_blockers');
  const codes = new Set([...body.matchAll(/'([a-z_]+):'/g)].map((m) => m[1]));
  if (body.includes("'nothing_to_edit'")) codes.add('nothing_to_edit');
  assert.deepEqual([...codes].sort(), ['legacy_terms', 'ml_set', 'nothing_to_edit', 'plans_active', 'site_visits_open', 'visits_live']);
  for (const code of codes) {
    assert.equal(typeof SERVICE_REOPEN_BLOCKER_TEXT[code], 'function', `SERVICE_REOPEN_BLOCKER_TEXT.${code}`);
    const [parsed] = serviceReopenBlockers([code === 'nothing_to_edit' ? code : `${code}:2`]);
    assert.equal(parsed.code, code);
    assert.doesNotMatch(parsed.text, /ไม่รู้จัก/, `${code} ต้องไม่ตกเป็นรหัสที่ไม่รู้จัก`);
  }
  // รหัสฝั่ง JS เท่านั้น — ฐานห้ามปล่อยชื่อซ้ำ (ไม่งั้นสองบ้านพูดคนละเรื่องด้วยรหัสเดียว)
  const JS_ONLY = ['money_fn', 'unread'];
  for (const code of JS_ONLY) assert.equal(codes.has(code), false, `${code} เป็นรหัสฝั่ง JS`);
  const ghost = Object.keys(SERVICE_REOPEN_BLOCKER_TEXT).filter((code) => !codes.has(code) && !JS_ONLY.includes(code));
  assert.deepEqual(ghost, [], 'SERVICE_REOPEN_BLOCKER_TEXT มีรหัสที่ฐานไม่ได้ปล่อย');
  // RPC ตีกลับด้วยรหัสบล็อกจากฟังก์ชันตัวเดียวกัน (GET กับ POST ถามที่เดียว)
  const reopen = fnBodyIn(REOPEN_CODE, '0396', 'reopen_sales_order_service_setup');
  assert.match(reopen, /public\.sales_order_service_reopen_blockers\(v_order\.id\)/);
  assert.match(reopen, /RAISE EXCEPTION 'service_setup_reopen_blocked' USING DETAIL = array_to_string\(v_blockers, ','\)/);
});
