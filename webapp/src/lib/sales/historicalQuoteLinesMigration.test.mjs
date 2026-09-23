// ── ยามของ mig 0379 — บรรทัดโซนของใบสั่งขายย้อนหลัง = บรรทัดใบเสนอราคา (มติเจ้าของ 23/09/2026) ─────────
//
// ⭐ "3500 x 1 ชุด x 12 เดือน · มันต้องไม่ควรแตกต่างจาก form ใบเสนอราคา" ⇒ ฐานบังคับสูตรเดียวกับใบเสนอราคา:
//    จำนวน × ราคา/หน่วย (ราคาผลิตในทะเบียน) − ส่วนลดรายการ = จำนวนเงิน
//    ไฟล์นี้นิยามใหม่ **สองตัวเท่านั้น** (ตัวตรวจบรรทัด · ตัวเขียนบรรทัด+งวด) โดยคงตัวของ 0374 ไว้ทุกคำสั่ง แล้วเติม
//
// ⚠️ เทสต์นี้อ่าน **ตัวหนังสือ SQL** — พฤติกรรมจริงพิสูจน์ด้วยฮาร์เนส PGlite (scratch · โหลด migration จริงทุกไฟล์
//    0001–0375 · ใบรูป 0374 ทุกสถานะ · รัน 0379 สองรอบ · ตารางความตรงกัน JS↔SQL 1,200 กรณี) และบล็อก "ลองก่อนรันจริง"
//    บนหัวไฟล์ · ยามที่นี่กันคนแก้ไฟล์ทีหลังแล้วลบด่านที่ฮาร์เนสพิสูจน์ไว้ทิ้งเงียบ ๆ
// ⚠️ ค่าที่ JS ต้องตรงกับ SQL (ชนิดส่วนลด · คอลัมน์ราคา · สถานะที่แก้ได้ · ป้ายงวดยกมา) เทียบกับค่าคงที่ฝั่ง JS ตรง ๆ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { QUOTE_DISCOUNT_TYPES } from '../salesPlanning.js';
import { QUOTE_PRICE_FIELD } from './quoteLines.js';
import { HISTORICAL_EDITABLE_STATUSES, OPENING_INSTALLMENT_LABEL } from './historicalOrders.js';

const MIGRATIONS = new URL('../../../supabase/migrations/', import.meta.url);
const FILE_0374 = '0374_historical_so_approval_flow.sql';
const FILE_0379 = '0379_historical_so_quote_lines.sql';
const read = (name) => readFileSync(new URL(name, MIGRATIONS), 'utf8');
const stripComments = (sql) => sql.replace(/--[^\n]*/g, '');
const squeeze = (sql) => stripComments(sql).replace(/\s+/g, ' ').trim();

const RAW = read(FILE_0379);
const SQL = stripComments(RAW);
const HEADER = RAW.slice(0, RAW.indexOf('\nBEGIN;'));
const SQL_0374 = stripComments(read(FILE_0374));

const SIGNATURES = {
  historical_so_check_lines: 'jsonb, text',
  historical_so_write_children: 'text, jsonb, jsonb, numeric, text, text',
};

function fnIn(sql, name) {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const from = sql.indexOf(marker);
  assert.ok(from >= 0, `ไม่มีนิยาม ${name}`);
  const to = sql.indexOf('\n$$;', from);
  assert.ok(to > from, `หาปลายนิยาม ${name} ไม่เจอ`);
  return sql.slice(from, to);
}
const fn = (name) => fnIn(SQL, name);
const fn0374 = (name) => fnIn(SQL_0374, name);
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* คำสั่งของ 0374 (คั่นด้วย ;) ต้องอยู่ใน 0379 ครบทุกคำสั่ง ยกเว้นที่ประกาศว่าเปลี่ยน — "คงตัวเดิมทุกบรรทัดแล้วเติม" */
const statements = (body) => squeeze(body).split(';').map((s) => s.trim()).filter(Boolean);

function topLevelItems(block) {
  const inner = block.trim().replace(/^\(/, '').replace(/\)$/, '');
  const out = [];
  let depth = 0; let quote = null; let cur = '';
  for (const ch of inner) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.filter(Boolean);
}
function matchingParen(text, open) {
  let depth = 0; let quote = null;
  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') { depth -= 1; if (depth === 0) return i; }
  }
  return -1;
}
/* คอลัมน์ → ค่า ของ INSERT … SELECT … FROM (ตัดที่ FROM ชั้นนอกสุดตัวแรก) · ชื่อกับค่าต้องนับได้เท่ากัน */
function insertPairs(body, table) {
  const start = body.indexOf(`INSERT INTO public.${table} (`);
  assert.ok(start >= 0, `หา INSERT INTO public.${table} ไม่เจอ`);
  const block = body.slice(start);
  const open = block.indexOf('(');
  const close = matchingParen(block, open);
  const cols = topLevelItems(block.slice(open, close + 1)).map((c) => c.replace(/"/g, ''));
  const select = block.slice(close + 1).trimStart().replace(/^SELECT\s*/i, '');
  let depth = 0; let quote = null; let end = -1;
  for (let i = 0; i < select.length; i += 1) {
    const ch = select[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; continue; }
    if (ch === '(') depth += 1;
    if (ch === ')') depth -= 1;
    if (depth === 0 && /^FROM\b/i.test(select.slice(i, i + 5)) && /\s/.test(select[i - 1] || ' ')) { end = i; break; }
  }
  assert.ok(end > 0, `${table}: หา FROM ของ SELECT ไม่เจอ`);
  const vals = topLevelItems(`(${select.slice(0, end)})`);
  assert.equal(vals.length, cols.length, `${table}: INSERT มีชื่อคอลัมน์ ${cols.length} ตัว แต่ค่า ${vals.length} ตัว`);
  return Object.fromEntries(cols.map((c, i) => [c, vals[i].replace(/\s+/g, ' ')]));
}

/* ── 1) ตัวไฟล์ ─────────────────────────────────────────────────────────────── */

test('0379: หัวไฟล์บอกเหตุผล (มติ 23/09) · ลำดับรัน · ห้ามคีย์ช่วงรันถึง deploy · คำสั่งก่อนรัน · ลองแบบ ROLLBACK · ตรวจหลังรัน · ทางถอย', () => {
  assert.match(HEADER, /มติเจ้าของ 23\/09/);
  assert.match(HEADER, /3500 x 1 ชุด x 12 เดือน/);
  assert.match(HEADER, /รันก่อน merge โค้ด JS/);
  assert.match(HEADER, /ห้ามคีย์ช่วงรันถึง deploy/);
  // คำสั่งก่อนรัน: อ่านอย่างเดียว · เห็นจำนวน หน่วย ราคาในใบกับในทะเบียน และส่วนต่างของทุกบรรทัดใบย้อนหลังที่ยังไม่ยกเลิก
  const pre = HEADER.slice(HEADER.indexOf('ก่อนรัน'), HEADER.indexOf('ลองก่อนรันจริง'));
  for (const piece of ['SELECT o."orderNumber"', 'l.qty', 'l.unit', 'l."unitPrice"', 'l."lineTotal"', 'p."costPrice"',
    'round(l.qty * l."unitPrice", 2) - l."lineTotal"', "o.origin = 'historical'", "o.status <> 'cancelled'"]) {
    assert.ok(pre.includes(piece), `คำสั่งก่อนรันขาด ${piece}`);
  }
  assert.doesNotMatch(stripComments(pre.replace(/^--\s?/gm, '')), /\b(INSERT|UPDATE|DELETE)\b/, 'คำสั่งก่อนรันต้องอ่านอย่างเดียว');
  assert.match(HEADER, /ลองก่อนรันจริง/);
  assert.match(HEADER, /--\s+ROLLBACK;/);
  assert.match(HEADER, /public\.create_historical_sales_order\(/, 'บล็อกลองจริงต้องบันทึกใบจริงผ่านตัวเขียนแบบเข้ม');
  assert.match(HEADER, /ตรวจหลังรัน/);
  assert.match(HEADER, /has_function_privilege/);
  assert.match(HEADER, /── ถอยกลับ/);
  assert.match(HEADER, /discountAmount" > 0/, 'ทางถอยต้องตรวจก่อนว่ายังไม่มีบรรทัดที่มีส่วนลด');
});

test('0379: ทรานแซกชันเดียว แล้วสั่ง PostgREST โหลดสคีมาใหม่ · ไม่มีคำสั่งอันตราย', () => {
  assert.match(SQL, /^BEGIN;/m);
  assert.match(SQL, /^COMMIT;/m);
  assert.ok(SQL.indexOf("NOTIFY pgrst, 'reload schema';") > SQL.indexOf('\nCOMMIT;'));
  assert.doesNotMatch(SQL, /CREATE FUNCTION/, 'ฟังก์ชันต้อง CREATE OR REPLACE (รันซ้ำได้)');
  assert.doesNotMatch(SQL, /\bDROP\b/, 'ไม่มีอะไรให้ DROP — ลายเซ็นเดิมทั้งสองตัว');
  assert.doesNotMatch(SQL, /\bALTER\b/, 'ไม่แตะสคีมา/ตาราง');
  assert.doesNotMatch(SQL, /\bCASCADE\b/);
  assert.doesNotMatch(SQL, /EXECUTE\s+format/i);
  assert.doesNotMatch(SQL, /\bTRIGGER\b/);
  assert.doesNotMatch(SQL, /ADD CONSTRAINT|CREATE (?:UNIQUE )?INDEX/);
});

test('0379: นิยามแค่สองตัวด้วยลายเซ็นเดิมของ 0374 — ไม่มีข้อความที่ทำให้ยามตัวอื่นอ่านนิยามผิดไฟล์', () => {
  const created = [...SQL.matchAll(/CREATE OR REPLACE FUNCTION public\.([a-z0-9_]+)\(/g)].map((m) => m[1]).sort();
  assert.deepEqual(created, Object.keys(SIGNATURES).sort());
  for (const [name, args] of Object.entries(SIGNATURES)) {
    const argTypes = topLevelItems(fn(name).slice(fn(name).indexOf('('), matchingParen(fn(name), fn(name).indexOf('(')) + 1))
      .map((a) => a.trim().split(/\s+/).slice(1).join(' '));
    assert.equal(argTypes.join(', '), args, name);
    // ลายเซ็นเดียวกับของ 0374 ทุกตัวอักษร (ชื่อพารามิเตอร์ด้วย — CREATE OR REPLACE เปลี่ยนชื่อพารามิเตอร์ไม่ได้)
    const head = (body) => squeeze(body.slice(0, body.indexOf('AS $$')));
    assert.equal(head(fn(name)), head(fn0374(name)), `${name}: หัวฟังก์ชันต้องเท่า 0374`);
  }
  // ยาม "นิยามล่าสุด" ของไฟล์อื่นอ่านจากข้อความ `CREATE OR REPLACE FUNCTION public.<ชื่อ>(` (แม้ในคอมเมนต์) ⇒ ห้ามเอ่ยตัวอื่น
  for (const m of RAW.matchAll(/FUNCTION public\.([a-z0-9_]+)/g)) {
    assert.ok(m[1] in SIGNATURES, `0379 ห้ามมีข้อความ FUNCTION public.${m[1]}`);
  }
  assert.equal(RAW.split('CREATE OR REPLACE FUNCTION public.').length - 1, 2, 'นิยามละครั้ง ไม่มีในคอมเมนต์');
});

test('🔐 สิทธิ์: REVOKE สองตัวเหมือน 0374 ทุกตัวอักษร (รวม service_role) · ไม่มี GRANT · SET search_path · ไม่ SECURITY DEFINER', () => {
  for (const [name, args] of Object.entries(SIGNATURES)) {
    const revoke = new RegExp(`REVOKE ALL ON FUNCTION public\\.${escape(name)}\\(${escape(args)}\\)\\s+FROM PUBLIC, anon, authenticated, service_role;`);
    assert.match(SQL, revoke, name);
    assert.match(SQL_0374, revoke, `${name}: บรรทัดสิทธิ์ต้องเป็นบรรทัดเดียวกับของ 0374`);
    assert.match(fn(name), /LANGUAGE plpgsql\s+SET search_path = public\s+AS \$\$/, name);
    assert.doesNotMatch(fn(name), /SECURITY DEFINER/, `${name}: รันในนามผู้เรียก (RPC แบบ SECURITY DEFINER ของ 0374)`);
  }
  assert.doesNotMatch(SQL, /\bGRANT\b/);
});

test('0379: ด่านก่อนเขียน — DO block เดียว อ่านอย่างเดียว · นับบรรทัดใบย้อนหลังที่ยังไม่อนุมัติที่ยอดเกิน จำนวน × ราคา', () => {
  const outsideBodies = SQL.replace(/\$\$[\s\S]*?\$\$/g, ' ');
  assert.doesNotMatch(outsideBodies, /\b(INSERT INTO|UPDATE|DELETE FROM)\s+public\./, 'ไม่ backfill');
  const doBlocks = [...SQL.matchAll(/DO \$\$([\s\S]*?)\$\$;/g)].map((m) => m[1]);
  assert.equal(doBlocks.length, 1);
  assert.doesNotMatch(doBlocks[0], /\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b/);
  const guard = squeeze(doBlocks[0]);
  for (const piece of [
    "o.origin = 'historical'", "o.status IN ('draft', 'pending_approval', 'rejected')",
    'l."lineTotal" > round(l.qty * l."unitPrice", 2) + 0.01', "RAISE EXCEPTION 'mig_0379_historical_lines_not_quote_shaped",
  ]) {
    assert.ok(guard.includes(piece), `ด่านขาด ${piece}`);
  }
  // ด่านต้องมาก่อนนิยามใหม่ (ลำดับในไฟล์ = ลำดับตอนรัน)
  assert.ok(SQL.indexOf('DO $$') < SQL.indexOf('CREATE OR REPLACE FUNCTION'));
});

/* ── 2) ตัวตรวจบรรทัด ─────────────────────────────────────────────────────────── */

test('check_lines: ทุกคำสั่งของ 0374 อยู่ครบ (คงตัวเดิมแล้วเติม) · ยังคืน Σ lineTotal ให้ตัวเทียบยอดหัวใบของ RPC 0374', () => {
  const body = squeeze(fn('historical_so_check_lines'));
  const missing = statements(fn0374('historical_so_check_lines')).filter((stmt) => !body.includes(stmt));
  assert.deepEqual(missing, []);
  assert.ok(body.includes('v_sum := v_sum + v_line_total'));
  assert.ok(body.includes('RETURN v_sum'));
});

test('check_lines: ชนิดส่วนลด = QUOTE_DISCOUNT_TYPES · ไม่ลดต้องมีค่า 0 · % ≤ 100 · ค่า/ยอดส่วนลดไม่ติดลบ', () => {
  const body = squeeze(fn('historical_so_check_lines'));
  const m = /v_dtype NOT IN \(([^)]*)\)/.exec(body);
  assert.ok(m, 'ต้องมีด่านชนิดส่วนลด');
  assert.deepEqual([...m[1].matchAll(/'([a-z]+)'/g)].map((x) => x[1]), [...QUOTE_DISCOUNT_TYPES]);
  for (const piece of [
    "v_dtype := NULLIF(btrim(COALESCE(v_item->>'discountType', '')), '')",
    "v_dvalue := COALESCE(NULLIF(v_item->>'discountValue', '')::numeric, 0)",
    "v_damount := NULLIF(v_item->>'discountAmount', '')::numeric",
    'v_dvalue < 0', "v_dvalue = 'NaN'::numeric", '(v_dtype IS NULL AND v_dvalue <> 0)', "(v_dtype = 'percent' AND v_dvalue > 100)",
    "(v_damount IS NOT NULL AND (v_damount < 0 OR v_damount = 'NaN'::numeric))",
  ]) {
    assert.ok(body.includes(piece), `check_lines ขาด ${piece}`);
  }
  // แปลงค่าอยู่ใน BEGIN … EXCEPTION ⇒ ข้อความที่ไม่ใช่ตัวเลข = line_invalid ไม่ใช่ 22P02 ดิบ
  const parse = body.slice(body.indexOf('BEGIN v_qty :='), body.indexOf("EXCEPTION WHEN others THEN RAISE EXCEPTION 'historical_so_line_invalid'"));
  assert.ok(parse.includes('v_dvalue :=') && parse.includes('v_damount :='));
});

test('check_lines: สูตรเงินของใบเสนอราคา (quoteLineNet) · ค่าคลาด ±0.01 เท่า 0374 · มีทางหลวมของแถวที่เก็บแล้ว (ไม่มีคีย์ส่วนลด)', () => {
  const body = squeeze(fn('historical_so_check_lines'));
  for (const piece of [
    'v_line_gross := round(v_qty * v_unit_price, 2)',
    // ทางหลวม: ขั้นส่ง/อนุมัติของ 0374 ประกอบแถวที่เก็บเป็น jsonb ใหม่โดยไม่มีคีย์ส่วนลด ⇒ บรรทัดที่มีส่วนลดยังอนุมัติได้
    "IF v_damount IS NULL THEN IF v_line_total > v_line_gross + 0.01 THEN RAISE EXCEPTION 'historical_so_line_money_mismatch'",
    "v_expect := round(LEAST(CASE v_dtype WHEN 'percent' THEN v_line_gross * v_dvalue / 100 WHEN 'amount' THEN v_dvalue ELSE 0 END, v_line_gross), 2)",
    'abs(v_damount - v_expect) > 0.01',
    "abs(v_line_total - (v_line_gross - v_damount)) > 0.01 THEN RAISE EXCEPTION 'historical_so_line_money_mismatch'",
  ]) {
    assert.ok(body.includes(piece), `check_lines ขาด ${piece}`);
  }
  // ⚠️ ราคาไม่เทียบทะเบียนที่นี่ — ตัวนี้รันตอนอนุมัติด้วย (ทะเบียนเปลี่ยนราคาทีหลังต้องไม่ขวางการอนุมัติ)
  assert.ok(!body.includes('costPrice'), 'ตัวตรวจบรรทัดห้ามอ่านราคาในทะเบียน');
  // ขั้นส่ง/อนุมัติของ 0374 ยังประกอบแถวที่เก็บโดยไม่มีคีย์ส่วนลด — ทางหลวมมีไว้เพื่อสองตัวนี้ (ไม่แตะในไฟล์นี้)
  for (const name of ['submit_historical_sales_order', 'approve_historical_sales_order']) {
    const rebuilt = squeeze(fn0374(name));
    assert.ok(rebuilt.includes("'unitPrice', l.\"unitPrice\", 'lineTotal', l.\"lineTotal\""), name);
    assert.ok(!rebuilt.includes("'discountAmount'"), `${name} ของ 0374 ไม่ส่งคีย์ส่วนลด — ทางหลวมต้องอยู่`);
  }
});

/* ── 3) ตัวเขียนบรรทัด + งวด ─────────────────────────────────────────────────── */

test('write_children: ทุกคำสั่งของ 0374 อยู่ครบ ยกเว้น INSERT บรรทัด (ประกาศว่าเปลี่ยน) · ด่านสถานะมาก่อน DELETE ตัวแรก', () => {
  const body = squeeze(fn('historical_so_write_children'));
  const missing = statements(fn0374('historical_so_write_children'))
    .filter((stmt) => !stmt.includes('INSERT INTO public.sales_order_lines'))
    .filter((stmt) => !body.includes(stmt));
  assert.deepEqual(missing, []);
  const raw = fn('historical_so_write_children');
  const guard = raw.indexOf("RAISE EXCEPTION 'historical_so_edit_state_invalid'");
  const firstDelete = raw.indexOf('DELETE FROM');
  assert.ok(guard > 0 && firstDelete > guard, 'ด่านสถานะต้องมาก่อนลบ');
  const editable = `status NOT IN (${HISTORICAL_EDITABLE_STATUSES.map((s) => `'${s}'`).join(', ')})`;
  assert.ok(squeeze(raw.slice(0, guard)).includes(editable), 'สถานะที่แก้ได้ = HISTORICAL_EDITABLE_STATUSES');
  assert.ok(raw.includes(`THEN '${OPENING_INSTALLMENT_LABEL}'`), 'ป้ายงวดยกมาเดียวกับฝั่ง JS');
  assert.ok(!raw.includes('master_row_'));
  assert.ok(!/INSERT INTO public\.service_zone_terms|UPDATE public\.service_zone_terms/.test(raw));
  assert.match(raw, /GET DIAGNOSTICS v_inserted = ROW_COUNT;\s+IF v_inserted <> jsonb_array_length\(p_lines\)/);
});

test('write_children: ด่านบรรทัดแบบใบเสนอราคาอยู่ระหว่างด่านสถานะกับ DELETE — ส่วนลดต้องเป็นตัวเลข · ราคา = ราคาในทะเบียน · ยังไม่ตั้งราคา = ตีกลับ', () => {
  const raw = fn('historical_so_write_children');
  const guard = raw.indexOf("RAISE EXCEPTION 'historical_so_edit_state_invalid'");
  const firstDelete = raw.indexOf('DELETE FROM');
  const block = squeeze(raw.slice(guard, firstDelete));
  const price = `p."${QUOTE_PRICE_FIELD}"`;
  for (const piece of [
    "jsonb_typeof(e.l->'discountAmount') IS DISTINCT FROM 'number'",
    "jsonb_typeof(e.l->'discountValue') IS DISTINCT FROM 'number'",
    "RAISE EXCEPTION 'historical_so_line_invalid'",
    `COALESCE(${price}, 0) <= 0`, "RAISE EXCEPTION 'historical_so_line_unpriced'",
    `(e.l->>'unitPrice')::numeric IS DISTINCT FROM ${price}`, "RAISE EXCEPTION 'historical_so_line_price_not_registry'",
  ]) {
    assert.ok(block.includes(piece), `ด่านบรรทัดขาด ${piece}`);
  }
  // ตรวจครบก่อนแตะของเดิม: ทั้งสามรหัสมาก่อน DELETE ตัวแรก
  for (const code of ['historical_so_line_unpriced', 'historical_so_line_price_not_registry']) {
    const at = raw.indexOf(`RAISE EXCEPTION '${code}'`);
    assert.ok(at > guard && at < firstDelete, code);
  }
});

test('write_children: บรรทัดเก็บส่วนลดสามช่องจาก payload · metadata ว่าง (ไม่มี grossAmount) · คอลัมน์อื่นเท่า 0374', () => {
  const now = insertPairs(stripComments(fn('historical_so_write_children')), 'sales_order_lines');
  const before = insertPairs(stripComments(fn0374('historical_so_write_children')), 'sales_order_lines');
  assert.deepEqual(Object.keys(now), Object.keys(before), 'ชุดคอลัมน์เดิม ลำดับเดิม');
  assert.equal(now.discountType, "NULLIF(btrim(COALESCE(e.l->>'discountType', '')), '')");
  assert.equal(now.discountValue, "(e.l->>'discountValue')::numeric");
  assert.equal(now.discountAmount, "(e.l->>'discountAmount')::numeric");
  assert.equal(now.metadata, "'{}'::jsonb");
  assert.ok(!stripComments(fn('historical_so_write_children')).includes('grossAmount'));
  for (const col of Object.keys(before).filter((c) => !['discountType', 'discountValue', 'discountAmount', 'metadata'].includes(c))) {
    assert.equal(now[col], before[col], `${col} ต้องเท่า 0374`);
  }
  assert.equal(now.fgCode, 'p."fgCode"', 'รหัส FG จากทะเบียนสินค้า');
  assert.equal(now.serviceZoneId, 'z.id');
  assert.equal(now.quotationLineId, 'NULL');
  // ตัวเขียนของ 0374 เขียนส่วนลดเป็น 0 ตายตัว — เหตุผลที่ต้องรันไฟล์นี้ก่อน deploy JS (หัวไฟล์ข้อ "สลับลำดับ")
  assert.deepEqual([before.discountType, before.discountValue, before.discountAmount], ['NULL', '0', '0']);
  assert.match(HEADER, /ทิ้งส่วนลดเงียบ/);
});
