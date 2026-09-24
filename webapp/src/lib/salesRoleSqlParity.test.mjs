// ── ตำแหน่งฝ่ายขาย: ฝั่ง JS ↔ ฟังก์ชันในฐาน (mig 0382 · ผังตำแหน่ง 2026-09-24) ─────────────────
//
// ⭐ ฟังก์ชันอนุมัติในฐานเช็คตำแหน่งซ้ำอีกชั้น — สองฝั่งไม่ตรงกัน = จอให้กด route ยอม แต่ฐานตอบ forbidden
//    (หรือกลับกัน: ฐานยอมตำแหน่งที่จอกันไว้ ใครยิง API ตรงก็ผ่าน)
// ⚠️ เทสต์นี้อ่าน **ตัวหนังสือ SQL** · พฤติกรรมจริงของ 0382 ลองบนฮาร์เนส PGlite แล้ว (ตั้ง 13 ฟังก์ชันจากนิยามล่าสุด
//    ด้วย check_function_bodies = on → รัน 0382 สองรอบ → ทุกตัวเหลือเงื่อนไขใหม่หนึ่งจุด เนื้อส่วนอื่นเท่าเดิมทุกตัวอักษร ·
//    ฟังก์ชันหายหนึ่งตัว = ระเบิดทั้งไฟล์ไม่ทิ้งอะไรไว้ · เรียกจริงแล้ว CCO/CM/AE Sup ผ่าน AC Sup ตก)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { ROLES, SALES_MANAGER_ROLES, SALES_ROLES } from './permissions.js';
import { HISTORICAL_KEYER_ROLES } from './sales/historicalOrders.js';
import { isSalesOrderReviewer } from './sales/salesOrderWorkflow.js';

const MIGRATIONS = new URL('../../supabase/migrations/', import.meta.url);
const FILE = '0382_sales_role_hierarchy.sql';
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const SQL = read(FILE);
const CODE = stripComments(SQL);

/* ชุดตำแหน่งในฟังก์ชันกลาง — `COALESCE(p_role, '') IN (...)` */
function helperRoles(name) {
  const from = CODE.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(p_role text)`);
  assert.ok(from >= 0, `0382 ต้องสร้าง ${name}`);
  const body = CODE.slice(from, CODE.indexOf('$$;', CODE.indexOf('AS $$', from)));
  const m = /COALESCE\(p_role, ''\) IN \(([^)]*)\)/.exec(body);
  assert.ok(m, `${name}: หาเงื่อนไข IN ไม่เจอ`);
  return [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
}

/* แถวปะของ 0382 — (ชื่อฟังก์ชัน, ข้อความเดิม, ข้อความใหม่) */
function patchRows() {
  const block = CODE.slice(CODE.indexOf('FROM (VALUES'), CODE.indexOf(') AS t(fn, old_expr, new_expr)'));
  const rows = [...block.matchAll(/\('([a-z_]+)',\s*\$o\$([\s\S]*?)\$o\$,\s*\$n\$([\s\S]*?)\$n\$\)/g)];
  return rows.map((m) => ({ fn: m[1], oldExpr: m[2], newExpr: m[3] }));
}

/* นิยามล่าสุดของฟังก์ชันใน migration ที่มาก่อน `before` — ตัดตั้งแต่ CREATE ถึงปลาย dollar-quote ของตัวมันเอง */
function latestDefinitions(before) {
  const defs = new Map();
  for (const file of files.filter((f) => f < before)) {
    const text = stripComments(read(file));
    const re = /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public\.([a-z0-9_]+)\s*\(/gi;
    let m;
    while ((m = re.exec(text))) {
      const as = /\bAS\s+(\$[a-z_]*\$)/i.exec(text.slice(m.index));
      if (!as) continue;
      const bodyFrom = m.index + as.index + as[0].length;
      const bodyTo = text.indexOf(as[1], bodyFrom);
      defs.set(m[1], { file, body: text.slice(bodyFrom, bodyTo) });
    }
    for (const d of text.matchAll(/DROP\s+FUNCTION\s+(?:IF\s+EXISTS\s+)?public\.([a-z0-9_]+)/gi)) {
      if (defs.get(d[1])?.file !== file) defs.delete(d[1]);
    }
  }
  return defs;
}

const count = (hay, needle) => hay.split(needle).length - 1;
const sorted = (xs) => [...xs].sort();

test('ฟังก์ชันกลางในฐาน = กลุ่มตำแหน่งฝั่ง JS', () => {
  assert.deepEqual(sorted(helperRoles('is_sales_manager_role')), sorted(['admin', ...SALES_MANAGER_ROLES]));
  assert.deepEqual(sorted(helperRoles('is_sales_keyer_role')), sorted(HISTORICAL_KEYER_ROLES));
  assert.deepEqual(sorted(HISTORICAL_KEYER_ROLES), sorted(['admin', ...SALES_ROLES]));
  // ผู้อนุมัติใบสั่งขายฝั่ง JS ตัดสินจากชุดเดียวกับฐานทุกตำแหน่งในระบบ
  const managers = helperRoles('is_sales_manager_role');
  for (const role of ROLES) assert.equal(isSalesOrderReviewer(role), managers.includes(role), role);
  // AC Supervisor ไม่อนุมัติ (มติข้อ 1)
  assert.equal(managers.includes('ac_supervisor'), false);
});

test('0382 ปะครบ 13 ฟังก์ชัน · ข้อความเดิมเจอครั้งเดียวพอดีในนิยามล่าสุดก่อน 0382', () => {
  const rows = patchRows();
  assert.equal(rows.length, 13);
  const defs = latestDefinitions(FILE);
  const keyerFns = ['create_historical_sales_order', 'update_historical_sales_order', 'submit_historical_sales_order'];
  for (const { fn, oldExpr, newExpr } of rows) {
    const def = defs.get(fn);
    assert.ok(def, `${fn}: ไม่มีนิยามก่อน 0382`);
    assert.equal(count(def.body, oldExpr), 1, `${fn} (${def.file}): ข้อความเดิมต้องเจอครั้งเดียวพอดี`);
    const helper = keyerFns.includes(fn) ? 'public.is_sales_keyer_role(p_actor_role)' : 'public.is_sales_manager_role(p_actor_role)';
    assert.ok(newExpr.includes(helper), `${fn}: ต้องเรียก ${helper}`);
    assert.doesNotMatch(newExpr, /'ae_supervisor'|'senior_ae'/, `${fn}: ข้อความใหม่ห้ามมีชื่อตำแหน่ง`);
  }
  // carry ยอมบัญชีด้วย (0378) — ต้องไม่หายตอนปะ
  const carry = rows.find((r) => r.fn === 'carry_sales_order_installments');
  assert.match(carry.newExpr, /COALESCE\(p_actor_role, ''\) = 'finance'/);
});

test('ไม่มีฟังก์ชันไหนที่เขียนรายชื่อตำแหน่งฝ่ายขายตรง ๆ หลุดจาก 0382', () => {
  const patched = new Set(patchRows().map((r) => r.fn));
  const literal = /p_actor_role[^;]*NOT IN \([^)]*'(?:ae_supervisor|senior_ae|ac|ae)'/;
  const found = [...latestDefinitions(FILE)].filter(([, def]) => literal.test(def.body)).map(([name]) => name);
  assert.deepEqual(sorted(found), sorted(patched));
});

test('🔒 migration หลัง 0382 ห้ามเขียนรายชื่อตำแหน่งฝ่ายขายเองในด่าน p_actor_role — เรียกฟังก์ชันกลาง', () => {
  const later = files.filter((f) => f > FILE);
  const offenders = later.filter((f) => /p_actor_role[^;]*(?:NOT\s+)?IN\s*\([^)]*'(?:ae_supervisor|ac_supervisor|senior_ae|senior_ac|cco|commercial_manager)'/
    .test(stripComments(read(f))));
  assert.deepEqual(offenders, [], 'ใช้ public.is_sales_manager_role() / is_sales_keyer_role() แทน');
});

test('0382: ทำในทรานแซกชันเดียว · ตรวจท้ายว่าไม่เหลือ · สิทธิ์ของฟังก์ชันกลางแบบ 0336', () => {
  assert.match(CODE, /^\s*BEGIN;/m);
  assert.match(CODE, /COMMIT;\s*$/);
  assert.match(CODE, /RAISE EXCEPTION '0382: ยังเหลือฟังก์ชันที่เขียนรายชื่อตำแหน่งตรง ๆ/);
  for (const name of ['is_sales_manager_role', 'is_sales_keyer_role']) {
    assert.ok(CODE.includes(`REVOKE ALL ON FUNCTION public.${name}(text) FROM PUBLIC, anon, authenticated;`), name);
    assert.ok(CODE.includes(`GRANT EXECUTE ON FUNCTION public.${name}(text) TO service_role;`), name);
  }
  // ปะจากนิยามที่รันอยู่จริง ไม่ก๊อปเนื้อฟังก์ชันมาทั้งตัว
  assert.match(CODE, /pg_get_functiondef\(v_proc\.oid\)/);
  assert.equal(count(CODE, 'CREATE OR REPLACE FUNCTION'), 2, 'สร้างเฉพาะฟังก์ชันกลางสองตัว');
});
