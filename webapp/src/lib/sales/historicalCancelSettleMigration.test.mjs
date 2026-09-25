// ── ยาม SQL ของ 0387 · ผู้จัดการฝ่ายขายยกเลิกใบย้อนหลังที่อนุมัติแล้ว = งวดยกมาเป็นโมฆะตามใบ (มติเจ้าของ 24/09) ──────
// ⭐ "ย้อน/ยกเลิก ให้สิทธิกับผู้ที่สามารถกดอนุมัติ" — ใบที่อนุมัติแล้วยกเลิกไม่ได้เลยถ้างวดยกมาขึ้นคิวบัญชี (ขั้นอนุมัติดันขึ้นให้เอง)
//    ⇒ ฐานจัดการงวดยกมาในทรานแซกชันเดียวกับการยกเลิก · งวดปกติที่มีเงินยังบล็อก (บัญชีถอนคำรับรอง/ตีกลับก่อน)
// ⭐ พฤติกรรมจริงพิสูจน์ด้วย PGlite ใน scratch (โหลด schema + 0001–0387 · ยกเลิกสำเร็จ/ปฏิเสธ · race ฝั่งงวด)
//    ไฟล์นี้ตรึง "รูป" ที่ห้ามไหลกลับ เพราะ npm test ไม่มีฐาน
// ⚠️ อ่าน source เป็นสตริง (ตัดคอมเมนต์ก่อน) ⇒ พิสูจน์แค่ "รูปนี้ยังอยู่" — ของจริงอยู่ที่ PGlite
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { WORKFLOW_ERROR_CODES, documentWorkflowError } from './documentWorkflowErrors.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const mig = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const FILE = '0387_historical_so_cancel_settles_opening.sql';
const sql = mig(FILE);
const stripComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
const stripJsComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
const code = stripComments(sql);

const fnBody = (name) => {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const from = code.indexOf(marker);
  assert.ok(from >= 0, `หานิยาม ${name} ไม่เจอ`);
  const to = code.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${name} ไม่เจอ`);
  return code.slice(from, to);
};
const SETTLE = fnBody('historical_so_cancel_settle');
const GUARD = fnBody('historical_so_installment_order_live');
const READY = fnBody('historical_so_cancel_settle_ready');

test('0387 ห่อด้วย BEGIN/COMMIT · มีคำสั่งตรวจผลแบบอ่านอย่างเดียวในหัวไฟล์ · รันซ้ำได้', () => {
  assert.match(code, /^\s*BEGIN;/);
  assert.match(code, /COMMIT;\s*$/);
  const header = sql.slice(0, sql.indexOf('BEGIN;'));
  assert.match(header, /ตรวจผลหลังรัน \(อ่านอย่างเดียว\)/);
  assert.match(header, /SELECT[\s\S]*FROM pg_trigger/);
  // DDL ทุกตัวรันซ้ำได้
  assert.equal((code.match(/CREATE TRIGGER /g) || []).length, 2);
  assert.equal((code.match(/DROP TRIGGER IF EXISTS /g) || []).length, 2);
  assert.doesNotMatch(code, /CREATE FUNCTION /, 'ต้องเป็น CREATE OR REPLACE');
});

/* ⭐ ด่านเงินอยู่ในฐาน ไม่ใช่แค่ route: ถ้า JS พลิกงวดก่อน/หลัง UPDATE แล้วล้มกลางทาง = ใบอนุมัติอยู่แต่งวดยกมาถูกตีกลับ
   (หรือใบยกเลิกแล้วแต่งวดค้างคิวบัญชี + ป้ายเมนูตลอดไป) · ป้ายเมนูของบัญชีนับ status='reported' ดิบ */
test('trigger ฝั่งใบ: AFTER UPDATE OF status · ใบย้อนหลังที่เพิ่งกลายเป็นยกเลิกเท่านั้น · ชื่อเรียงก่อนตัวยกเลิกสัญญาของ 0374', () => {
  assert.match(code, /DROP TRIGGER IF EXISTS sales_orders_historical_cancel_settle ON public\.sales_orders;\s*CREATE TRIGGER sales_orders_historical_cancel_settle\s+AFTER UPDATE OF status ON public\.sales_orders\s+FOR EACH ROW\s+WHEN \(NEW\.origin = 'historical' AND NEW\.status = 'cancelled' AND OLD\.status IS DISTINCT FROM 'cancelled'\)\s+EXECUTE FUNCTION public\.historical_so_cancel_settle\(\);/);
  // AFTER trigger ของ event เดียวกันยิงตามลำดับชื่อ — ด่านเงินต้องยิงก่อนตัวยกเลิกสัญญา (RAISE แล้วไม่มีอะไรค้าง)
  assert.ok('sales_orders_historical_cancel_settle' < 'sales_orders_historical_void_contract_upd');
});

test('ตัวจัดงวด: SECURITY DEFINER · ล็อกงวดของใบก่อน · งวดปกติที่มีเงิน/รอตรวจ = RAISE · งวดยกมารอตรวจ → ตีกลับพร้อมเหตุว่าเป็นการยกเลิก', () => {
  assert.match(SETTLE, /RETURNS trigger\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public/);
  const lock = SETTLE.indexOf('FOR UPDATE');
  const held = SETTLE.indexOf("RAISE EXCEPTION 'historical_so_cancel_money_held");
  const flip = SETTLE.indexOf('UPDATE public.sales_order_installments');
  assert.ok(lock > 0 && held > lock && flip > held, 'ล็อก → ตรวจเงิน → พลิกงวดยกมา');
  assert.match(SETTLE.slice(0, lock + 10), /FROM public\.sales_order_installments i\s+WHERE i\."salesOrderId" = NEW\.id\s+FOR UPDATE/);
  // งวดปกติ (รวมแถวเก่าที่ไม่มี kind) ที่รับเงินแล้ว/รอบัญชีตรวจ
  assert.match(SETTLE, /COALESCE\(i\.kind, 'regular'\) <> 'opening'\s+AND i\.status IN \('confirmed', 'reported'\)/);
  /* 🐞 review 25/09: หมายเหตุบังคับของงวดยกมาที่รับรองแล้ว (≥ 10 ตัวอักษร · มติ 24/09) เคยอยู่ฝั่ง JS อย่างเดียว — ตัดสินจากงวดที่อ่าน
     ก่อน UPDATE ⇒ บัญชีรับรองแทรกระหว่างอ่านกับเขียน = เงินที่รับรองแล้วโมฆะโดยไม่มีเหตุ ⇒ ฐานตัดสินซ้ำหลังล็อกงวด ก่อนพลิกงวดยกมา */
  const note = SETTLE.indexOf("RAISE EXCEPTION 'historical_so_cancel_note_required");
  assert.ok(note > held && note < flip, 'ล็อก → ด่านเงิน → หมายเหตุ → พลิกงวดยกมา');
  const noteGate = SETTLE.slice(held, note);
  assert.match(noteGate, /i\."salesOrderId" = NEW\.id\s+AND i\.kind = 'opening'\s+AND i\.status = 'confirmed'/);
  // นับแบบ length() = charLength ฝั่ง JS · ตัดช่องว่างก่อนนับ · ว่าง/NULL = 0
  assert.match(noteGate, /length\(btrim\(COALESCE\(NEW\."cancelReason", ''\)\)\) < 10/);
  const update = SETTLE.slice(flip);
  assert.match(update, /SET status = 'rejected'/);
  assert.match(update, /"rejectedAt" = now\(\)/);
  assert.match(update, /"rejectedByName" = NEW\."cancelledBy"/);
  assert.match(update, /"rejectedReason" = left\('ยกเลิกตามใบสั่งขายย้อนหลัง ' \|\| NEW\."orderNumber"\s*\|\| ' — งวดยกมาเป็นโมฆะ ไม่ใช่การตีกลับของบัญชี', 500\)/);
  assert.match(update, /WHERE i\."salesOrderId" = NEW\.id\s+AND i\.kind = 'opening'\s+AND i\.status = 'reported'/);
  // งวดยกมาที่รับรองแล้วคงไว้เป็นประวัติ (โมฆะตามกติกาฝั่ง JS) · ไม่แตะใบ/ยอด
  // (ด่านหมายเหตุอ่าน i.status = 'confirmed' ได้ — ห้ามแค่ "เขียน" สถานะอื่น · UPDATE มีตัวเดียวคือพลิกงวดยกมาที่รอตรวจ)
  assert.doesNotMatch(SETTLE, /SET status = '(confirmed|pending)'/);
  assert.equal((SETTLE.match(/\bUPDATE\s/g) || []).length, 1);
  assert.doesNotMatch(SETTLE, /(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s+public\.(sales_orders|sales_deals|quotations|sales_contracts)\b/i);
});

/* 🐞 race ฝั่งกลับ: บัญชีอ่านใบเป็นอนุมัติ → ผู้จัดการยกเลิกสำเร็จ → UPDATE ของบัญชีลงทีหลัง = งวดปกติที่มีเงินบนใบย้อนหลังที่ยกเลิก
   ซึ่งไม่มีทางออก (ใบย้อนหลังไม่มีทางยก/คืนเงิน · ล็อกทั้งใบปิดทุกคำสั่ง) ⇒ ฐานกันฝั่งงวดอีกชั้น */
test('trigger ฝั่งงวด: ห้ามแจ้ง/รับรองงวดของใบย้อนหลังที่ยกเลิกแล้ว · เฉพาะตอนสถานะเปลี่ยน · อ่านใบแบบไม่ล็อก (กัน deadlock)', () => {
  assert.match(code, /DROP TRIGGER IF EXISTS sales_order_installments_historical_cancelled_guard ON public\.sales_order_installments;\s*CREATE TRIGGER sales_order_installments_historical_cancelled_guard\s+BEFORE INSERT OR UPDATE OF status ON public\.sales_order_installments\s+FOR EACH ROW\s+WHEN \(NEW\.status IN \('reported', 'confirmed'\)\)\s+EXECUTE FUNCTION public\.historical_so_installment_order_live\(\);/);
  assert.match(GUARD, /RETURNS trigger\s+LANGUAGE plpgsql\s+SECURITY DEFINER\s+SET search_path = public/);
  assert.match(GUARD, /IF TG_OP = 'UPDATE' AND OLD\.status IS NOT DISTINCT FROM NEW\.status THEN\s+RETURN NEW;/);
  assert.match(GUARD, /FROM public\.sales_orders o\s+WHERE o\.id = NEW\."salesOrderId";/);
  assert.match(GUARD, /IF FOUND AND v_order\.origin = 'historical' AND v_order\.status = 'cancelled' THEN/);
  // ปฏิเสธอย่างเดียว — ไม่เขียนทับค่าในแถว (ยามทั้งระบบของ installmentReplanMigration.test ยอมข้อยกเว้นนี้เพราะข้อนี้)
  assert.doesNotMatch(GUARD, /NEW\.[a-z"]+\s*:=/i);
  assert.doesNotMatch(GUARD, /(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s/i);
  assert.match(GUARD, /RAISE EXCEPTION 'historical_so_installment_order_cancelled: %'/);
  assert.doesNotMatch(GUARD, /FOR (UPDATE|SHARE)/, 'ล็อกใบจากฝั่งงวด = ล็อกกลับลำดับกับตัวยกเลิก (deadlock)');
});

test('สิทธิ์: ฟังก์ชัน trigger ทั้งสองไม่ GRANT ใคร — REVOKE จาก PUBLIC · anon · authenticated · service_role', () => {
  for (const name of ['historical_so_cancel_settle', 'historical_so_installment_order_live']) {
    assert.match(code, new RegExp(`REVOKE ALL ON FUNCTION public\\.${name}\\(\\) FROM PUBLIC, anon, authenticated, service_role;`));
  }
  // GRANT ตัวเดียวของไฟล์ = ตัวถามความพร้อม ให้ service_role (route) — ข้างล่าง
  assert.deepEqual(code.match(/GRANT [^;]*;/g), ['GRANT EXECUTE ON FUNCTION public.historical_so_cancel_settle_ready() TO service_role;']);
});

/* 🐞 review 25/09 (fail closed): โค้ดขึ้น prod ก่อนรันมิกได้ (deploy อัตโนมัติวันละ 3 รอบ ไม่ถามมิก) — route ที่ปล่อยงวดยกมาให้ trigger
   ตีกลับจะยกเลิกผ่านโดยไม่มีใครตีกลับ ⇒ งวดค้าง "รอตรวจ" บนใบที่ยกเลิกถาวร · รันมิกทีหลังไม่ซ่อม (trigger ยิงตอนเปลี่ยนสถานะเท่านั้น)
   ⇒ route ถามตัวนี้ก่อนเขียน: ตอบ true เมื่อ trigger สองตัวของไฟล์นี้อยู่ **และเปิดอยู่** เท่านั้น (ไม่มีฟังก์ชัน = ยังไม่รัน = บล็อกแบบเดิม) */
test('ตัวถามความพร้อม: อ่านอย่างเดียว · trigger ทั้งสองตัวต้องอยู่และเปิด (O/A) · service_role เรียกได้ ตัวอื่นไม่ได้', () => {
  assert.match(READY, /RETURNS boolean\s+LANGUAGE sql\s+STABLE\s+SET search_path = pg_catalog, public/);
  assert.doesNotMatch(READY, /SECURITY DEFINER/, 'แค็ตตาล็อกอ่านได้อยู่แล้ว — ไม่ต้องยกสิทธิ์');
  assert.doesNotMatch(READY, /(UPDATE|INSERT\s+INTO|DELETE\s+FROM)\s/i);
  for (const [table, trigger] of [
    ['public.sales_orders', 'sales_orders_historical_cancel_settle'],
    ['public.sales_order_installments', 'sales_order_installments_historical_cancelled_guard'],
  ]) {
    assert.match(READY, new RegExp(`t\\.tgrelid = '${table.replace('.', '\\.')}'::regclass\\s+AND t\\.tgname = '${trigger}'`
      + `\\s+AND NOT t\\.tgisinternal\\s+AND t\\.tgenabled IN \\('O', 'A'\\)`));
  }
  assert.match(code, /REVOKE ALL ON FUNCTION public\.historical_so_cancel_settle_ready\(\) FROM PUBLIC, anon, authenticated;/);
  // หัวไฟล์: ไม่มีคำเก่าที่บอกว่า deploy ก่อนแล้วงวดค้างได้ · มีคำสั่งตรวจตัวถามความพร้อม
  const header = sql.slice(0, sql.indexOf('BEGIN;'));
  assert.doesNotMatch(header, /ค้าง reported บนใบที่ยกเลิก \(คิว\/ป้ายบัญชี\) จนกว่าจะรัน/);
  assert.match(header, /SELECT public\.historical_so_cancel_settle_ready\(\);/);
});

test('รหัสที่ 0387 โยนมีในตารางแปล · สถานะ 409 (ใบ/งวดขยับระหว่างทาง — ไม่ใช่ข้อมูลผิด)', () => {
  const raised = new Set([...code.matchAll(/RAISE EXCEPTION '([a-z0-9_]+)/g)].map((m) => m[1]));
  assert.deepEqual([...raised].sort(),
    ['historical_so_cancel_money_held', 'historical_so_cancel_note_required', 'historical_so_installment_order_cancelled']);
  for (const c of raised) assert.ok(WORKFLOW_ERROR_CODES.includes(c), `${c} ยังไม่มีข้อความไทย`);
  const held = documentWorkflowError({ message: 'historical_so_cancel_money_held: SO-26090010-0 (1 งวด)' });
  assert.equal(held.status, 409);
  // review 25/09: ถอนคำรับรองพาแถวกลับไป "รอตรวจ" ซึ่งยังบล็อก ⇒ ต้องบอกครบสองขั้น
  assert.match(held.message, /ถอนคำรับรองแล้วตีกลับ/);
  assert.match(held.message, /แล้วค่อยยกเลิกใบ/);
  const note = documentWorkflowError({ message: 'historical_so_cancel_note_required: SO-26090010-0' });
  assert.equal(note.status, 409);
  assert.match(note.message, /รับรองแล้ว/);
  assert.match(note.message, /อย่างน้อย 10 ตัวอักษร/);
  const cancelled = documentWorkflowError({ message: 'historical_so_installment_order_cancelled: SO-26090010-0' });
  assert.equal(cancelled.status, 409);
  assert.match(cancelled.message, /ถูกยกเลิกแล้ว/);
});

/* ⭐ กติกา "งวดยกมาของใบที่ตายแล้ว = โมฆะทุกสถานะ" ฝั่ง JS ตัดสินจาก kind ของแถวล้วน (ไม่ถาม origin ของใบ) —
   ถูกได้เพราะงวดยกมามีบนใบย้อนหลังเท่านั้น ⇒ ถ้ามีที่ใหม่เขียน kind='opening' ต้องมาทบทวนกติกานั้นก่อน */
test('🔒 ผู้เขียนงวดยกมามีแค่ใบย้อนหลัง — SQL/JS ที่เอ่ย kind opening อยู่ในรายชื่อที่ตรวจแล้วเท่านั้น', () => {
  const sqlFiles = readdirSync(MIGRATIONS).filter((n) => n.endsWith('.sql'))
    .filter((n) => stripComments(mig(n)).includes("'opening'"));
  assert.deepEqual(sqlFiles, [
    '0374_historical_so_approval_flow.sql', // ตัวเขียนใบย้อนหลัง (สร้าง/แก้)
    '0377_so_installment_replan.sql', // ปฏิเสธงวดยกมาในการปรับแผน
    '0379_historical_so_quote_lines.sql', // ตัวเขียนใบย้อนหลัง (บรรทัดแบบใบเสนอราคา)
    FILE,
  ]);
  const SRC = new URL('../../', import.meta.url);
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const url = new URL(name, dir);
    if (statSync(url).isDirectory()) return walk(new URL(`${name}/`, dir));
    return /\.js$/.test(name) ? [url] : [];
  });
  const jsFiles = walk(SRC)
    .filter((url) => /'opening'|OPENING_INSTALLMENT_KIND/.test(stripJsComments(readFileSync(url, 'utf8'))))
    .map((url) => url.pathname.slice(SRC.pathname.length)).sort();
  assert.deepEqual(jsFiles, [
    'lib/sales/historicalIntakeForm.js',
    'lib/sales/historicalOrderPlan.js',
    'lib/sales/historicalOrders.js',
    'lib/sales/historicalReviewView.js', // ขั้น ④: 'opening' = คีย์แถว/ช่องบนจอ (อ่านแผนอย่างเดียว ไม่เขียนงวด)
  ]);
});
