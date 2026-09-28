// ── ฐาน ↔ JS ของงานบริการ (mig 0392 ↔ lib/sales/serviceSetup.js) ────────────────────────────────────
//
// ⭐ ตัวตัดสินเดียวกันมีสองบ้าน: ฐาน (RPC/trigger — ด่านสุดท้าย) กับ JS (จอ/route — บอกเหตุเป็นไทยก่อนกด)
//    ⇒ สองบ้านต้องพูดเรื่องเดียวกัน · ไฟล์นี้เทียบ
//      1) หมวดของ FG: รูปแบบ regex ของ fg_category_of = categoryOf
//      2) ชนิดของบรรทัด: ค่า '02-001' ของฐาน = SERVICE_ROUND_CATEGORY · ตารางอินพุต → ผลที่ PGlite ยืนยันแล้ว
//         (ฮาร์เนสเคส 9a) ต้องได้ผลเดียวกันจาก serviceLineRole
//      3) รหัสทุกตัวที่ sales_order_service_setup_errors ปล่อย มีข้อความไทยใน SERVICE_SETUP_ISSUE_TEXT
//      4) RAISE ทุกรหัสในฟังก์ชันของ 0392 มีข้อความไทย/สถานะใน SERVICE_SETUP_SQL_MESSAGES
//         (ยกเว้น service_setup_copy_line_mismatch ซึ่งยิงจากทางออก Rev. ⇒ อยู่ใน documentWorkflowErrors)
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

function fnBody(name) {
  const from = CODE.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`);
  assert.ok(from >= 0, `0392 ต้องนิยาม ${name}`);
  return CODE.slice(CODE.indexOf('AS $$', from) + 5, CODE.indexOf('\n$$;', from));
}
/* ตัวฟังก์ชันทั้งหมดของ 0392 (ไม่รวมบล็อก DO ของด่านก่อนรัน/ปะ/ตรวจท้าย — รหัส mig_0392_* เป็นของคนรัน migration) */
const allFunctionBodies = () => [...CODE.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)].map((m) => fnBody(m[1])).join('\n');

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

test('🔴 RAISE ทุกรหัสในฟังก์ชันของ 0392 มีข้อความ/สถานะใน SERVICE_SETUP_SQL_MESSAGES (หรือ documentWorkflowErrors)', async () => {
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
  assert.deepEqual(ghost, [], 'SERVICE_SETUP_SQL_MESSAGES มีรหัสที่ 0392 ไม่ได้ยิง');
});
