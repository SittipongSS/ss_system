// ── ถอดด่าน "ต้องมีโครงการ" (มติเจ้าของ 13/11/2026 · ถอดโครงการทาง ก. รอบ P1 · mig 0434) ─────────────
//
// ล็อกสามเรื่อง:
//  1. ข้อความยึดของ 0434 ตรงกับข้อความที่อยู่ในเนื้อฟังก์ชันตัวที่รันจริงตามสายไฟล์ ทุกตัวอักษร
//     (accept = 0361 · ยื่น/อนุมัติ SO = ข้อความที่ 0416/E1 ใส่ไว้) — พิมพ์ผิดตัวเดียว = migration หยุดทั้งไฟล์บน prod
//  2. 0434 ไม่แตะคอลัมน์ `sales_orders."projectId"` — ค่าอยู่ในลายนิ้วมืออนุมัติ SO (`salesOrderApprovalContent`)
//  3. route ยื่น SO ไม่บังคับโครงการ (ด่าน JS ชุดเดียวกับ RPC)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const mig = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');
const src = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

const SQL = mig('0434_project_gate_removal.sql');
const BODY = SQL.split('\nBEGIN;\n')[1] || '';

// แถว ARRAY['fn', 'marker', 'anchor', 'new'] ของ 0434 — อ่านเป็นข้อความ SQL ตามที่เขียน (quote คู่ยังเป็นคู่)
function patchRows(sql) {
  const rows = [];
  const re = /ARRAY\['([a-z_]+)', '(0434\/P1[ab])',\s*'((?:[^']|'')*)',\s*'((?:[^']|'')*)'\]/g;
  for (let m = re.exec(sql); m; m = re.exec(sql)) rows.push({ fn: m[1], marker: m[2], anchor: m[3], next: m[4] });
  return rows;
}
const unquote = (literal) => literal.replace(/''/g, "'");
const hits = (text, needle) => text.split(needle).length - 1;

test('0434: ปะสามฟังก์ชัน มีป้ายครบ · รันซ้ำได้ · ตรวจซ้ำหลังปะ', () => {
  const rows = patchRows(BODY);
  assert.deepEqual(rows.map((r) => `${r.fn}:${r.marker}`), [
    'accept_quotation_atomic:0434/P1a',
    'submit_sales_order_with_signature_evidence_atomic:0434/P1b',
    'approve_sales_order_with_signature_evidence_atomic:0434/P1b',
  ]);
  for (const r of rows) assert.ok(r.next.includes(r.marker), `${r.fn}: ข้อความใหม่ต้องพกป้าย ไม่งั้นรันซ้ำแล้วปะซ้อน`);
  assert.match(BODY, /IF strpos\(v_src, v_marker\) > 0 THEN/, 'มีป้ายแล้ว = ข้าม');
  assert.match(BODY, /IF v_src_hits <> 1 OR v_def_hits <> 1 THEN/, 'ข้อความยึดต้องเจอครั้งเดียวพอดี');
  assert.match(BODY, /RAISE EXCEPTION 'mig_0434_gate_still_present'/);
  assert.match(BODY, /pg_get_functiondef\(v_oid\)/, 'ปะจากตัวที่รันจริง ไม่ CREATE OR REPLACE จากไฟล์เก่า');
  assert.doesNotMatch(BODY, /CREATE OR REPLACE FUNCTION/);
});

test('0434/P1a: ข้อความยึดตรงกับด่านใน accept_quotation_atomic ของ 0361 ครั้งเดียวพอดี', () => {
  const [accept] = patchRows(BODY);
  const m0361 = mig('0361_deal_value_from_accepted_quotation.sql');
  const from = m0361.indexOf('CREATE OR REPLACE FUNCTION public.accept_quotation_atomic(');
  const fnText = m0361.slice(from, m0361.indexOf('\n$$;', from));
  assert.ok(from > 0 && fnText.length > 0);
  assert.equal(hits(fnText, unquote(accept.anchor)), 1);
  // 0388 ปะ accept ที่จุดอื่น (ตรา closedByAccept) — ต้องไม่แตะบรรทัดด่านโครงการ
  assert.equal(hits(mig('0388_unaccept_reopens_closed_siblings.sql'), 'deal_project_required'), 0);
});

test('0434/P1b: ข้อความยึดตรงกับสิ่งที่ 0416/E1 ใส่ไว้ในฟังก์ชันยื่น/อนุมัติ SO ทุกตัวอักษร', () => {
  const [, submit, approve] = patchRows(BODY);
  const m0416 = mig('0416_excise_sales_order_rpcs.sql').split('\nBEGIN;\n')[1];
  const e1 = [...m0416.matchAll(/ARRAY\['([a-z_]+)', '0416\/E1',\s*'(?:[^']|'')*',\s*'((?:[^']|'')*)'\]/g)];
  assert.deepEqual(e1.map((m) => m[1]), [
    'submit_sales_order_with_signature_evidence_atomic',
    'approve_sales_order_with_signature_evidence_atomic',
  ]);
  for (const m of e1) assert.equal(submit.anchor, m[2], `${m[1]}: ข้อความยึดของ 0434 ต้องเท่ากับข้อความใหม่ของ 0416/E1`);
  assert.equal(approve.anchor, submit.anchor);
  // ป้าย 0416/E1 ยังอยู่ในข้อความใหม่ ⇒ 0416 รันซ้ำแล้วข้าม ไม่ไปหาข้อความยึดเดิมที่หายไปแล้ว
  assert.ok(submit.next.includes('0416/E1'));
});

test('0434 ไม่แตะคอลัมน์ projectId ของใบสั่งขาย (อยู่ในลายนิ้วมืออนุมัติ SO)', () => {
  assert.doesNotMatch(BODY, /UPDATE\s+public\.sales_orders|ALTER\s+TABLE\s+public\.sales_orders/i);
  const fingerprint = src('lib/sales/salesOrderApprovalFingerprint.js');
  assert.match(fingerprint, /projectId: order\.projectId \|\| null/, 'คีย์ projectId ต้องยังอยู่ในเนื้อหาลายนิ้วมือ');
});

test('route ยื่น SO: ไม่บังคับโครงการ — ด่านชุดเดียวกับ RPC หลัง 0434', () => {
  const route = src('app/api/sales-planning/sales-orders/[id]/route.js');
  assert.doesNotMatch(route, /!before\.projectId/);
  assert.match(route, /เอกสารอ้างอิงไม่ครบ: ต้องมี QT Won, ดีล และลูกค้า/);
});
