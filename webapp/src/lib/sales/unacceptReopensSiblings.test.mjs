// ── ย้อนการรับใบเสนอราคา = เปิดใบพี่น้องที่ "การรับใบนี้" ปิดไว้คืน (มติเจ้าของ 25/09 · mig 0388) ──────────
//
// 🐞 ต้นเรื่อง: รับใบ (accept_quotation_atomic 0361) ปิดใบอื่นในดีลเป็น 'closed' โดยไม่จำว่าเดิมเป็นอะไร
//   และย้อนการรับ (unaccept_quotation_atomic 0380) คืนแค่ใบหลัก ⇒ ใบพี่น้องค้าง 'closed' บนดีลที่กลับมาเปิด
//   ไม่มีปุ่มไหนพาออก (แก้ · ออก Rev. · รับ · ยกเลิก ปฏิเสธใบ closed ทุกทาง) — ทั้งที่โมดัลย้อนการรับเอง
//   ชวนว่า "ดีลนี้ต้องปิดด้วยใบเสนอราคาอีกใบ" · ใบ pending ที่ถูกปิดหลุดคิวผู้อนุมัติถาวร
//
// ⚠️ รีโปนี้ไม่มีฐานให้เทสต์ต่อ (dev DB = prod DB) ⇒ ไฟล์นี้ล็อก "รูปของโค้ด" ส่วนพฤติกรรมจริงของ SQL
//   พิสูจน์บน PGlite ก่อน merge (รายงานใน PR) · ตัวปะของ 0388 ต้องเจอจุดปะในนิยามล่าสุดของรีโป **ครั้งเดียวพอดี**
//   ไม่งั้นรันบนฐานจริงแล้ว RAISE ทั้งไฟล์ (ยามเดียวกับที่ migration ตรวจเอง)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  REOPENABLE_QUOTATION_STATUSES,
  inferredReopenStatus,
} from './quotationUnaccept.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const MIG = join(HERE, '../../../supabase/migrations');
const SRC = join(HERE, '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');
const strip = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FILE_0388 = readdirSync(MIG).find((f) => f.startsWith('0388_'));
const SQL = FILE_0388 ? readFileSync(join(MIG, FILE_0388), 'utf8') : '';

/* นิยามล่าสุดของฟังก์ชันในรีโป (ไฟล์สุดท้ายที่ CREATE OR REPLACE มันทั้งตัว) — 0388 ปะทับ ไม่ได้เขียนทั้งตัว */
function latestBody(fn) {
  const files = readdirSync(MIG).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  const file = files.filter((f) => readFileSync(join(MIG, f), 'utf8').includes(`CREATE OR REPLACE FUNCTION public.${fn}(`)).at(-1);
  const sql = readFileSync(join(MIG, file), 'utf8');
  const start = sql.indexOf('AS $$', sql.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}(`)) + 'AS $$'.length;
  return { file, body: sql.slice(start, sql.indexOf('$$;', start)) };
}

/* ค่าคงที่ $tag$…$tag$ ใน DO block ของ 0388 */
function constant(tag) {
  const match = SQL.match(new RegExp(`\\$${tag}\\$([\\s\\S]*?)\\$${tag}\\$`));
  assert.ok(match, `0388 ต้องมีค่าคงที่ $${tag}$`);
  return match[1];
}
const hits = (text, needle) => text.split(needle).length - 1;

test('0388 มีอยู่ · ห่อ BEGIN/COMMIT · หัวไฟล์มีคำสั่งตรวจหลังรันแบบอ่านอย่างเดียว', () => {
  assert.ok(FILE_0388, 'ต้องมี migration 0388');
  assert.match(SQL, /^BEGIN;$/m);
  assert.match(SQL, /^COMMIT;$/m);
  assert.match(SQL, /ตรวจผลหลังรัน/);
  assert.match(SQL, /--\s+SELECT/);
  // ใบรุ่นเก่าที่ไม่มีใบ accepted ไหนในดีลพิสูจน์ได้ว่าเป็นคนปิด = ย้อนการรับจะไม่เปิดมัน — ให้เจ้าของเห็นก่อน/หลังรัน (คาด 0)
  assert.match(SQL, /AS legacy_unprovable/);
});

test('0388 ปะจากนิยามที่รันอยู่จริง (pg_get_functiondef) — ไม่เขียนสองฟังก์ชันทับทั้งตัว', () => {
  assert.doesNotMatch(SQL, /CREATE OR REPLACE FUNCTION public\.accept_quotation_atomic\(/);
  assert.doesNotMatch(SQL, /CREATE OR REPLACE FUNCTION public\.unaccept_quotation_atomic\(/);
  assert.match(SQL, /pg_get_functiondef\(/);
  // ⭐ นิยามล่าสุดในรีโปยังเป็นไฟล์เดิม ⇒ ยามทีละตัวอักษรของ 0380 (unacceptIgnoresRevised.test) ยังจับของเดิมได้
  assert.equal(latestBody('accept_quotation_atomic').file, '0361_deal_value_from_accepted_quotation.sql');
  assert.equal(latestBody('unaccept_quotation_atomic').file, '0380_unaccept_ignores_superseded_so.sql');
});

test('รับใบ: จุดปะเจอครั้งเดียวพอดีในนิยามล่าสุด · หลังปะ ใบที่ถูกปิดพกตรา closedByAccept {ใบที่รับ · สถานะเดิม}', () => {
  const { body } = latestBody('accept_quotation_atomic');
  const oldText = constant('acc_old');
  const newText = constant('acc_new');
  assert.equal(hits(body, oldText), 1, 'จุดปะของการรับใบต้องเจอครั้งเดียวพอดี');
  const patched = body.replace(oldText, newText);
  assert.match(patched, /'closedByAccept', jsonb_build_object\(/);
  assert.match(patched, /'quotationId', v_quote\.id/);
  // ⚠️ ฝั่งขวาของ SET อ่านค่าก่อน UPDATE ⇒ `status` ตรงนี้คือสถานะก่อนปิด
  assert.match(patched, /'prevStatus', status/);
  // เงื่อนไขว่าใบไหนถูกปิดไม่เปลี่ยน — ปะแค่สิ่งที่เขียนลงไป
  assert.match(patched, /AND status IN \('draft', 'sent', 'rejected'\);/);
  assert.equal(hits(patched, 'closedByAccept'), 1);
});

test('ย้อนการรับ: จุดปะสองจุดเจอครั้งเดียวพอดี · เปิดคืนเฉพาะตราของใบนี้ + ใบรุ่นเก่า · คืนรายการให้ route', () => {
  const { body } = latestBody('unaccept_quotation_atomic');
  for (const [oldTag, newTag] of [['un_decl_old', 'un_decl_new'], ['un_ret_old', 'un_ret_new']]) {
    assert.equal(hits(body, constant(oldTag)), 1, `${oldTag} ต้องเจอครั้งเดียวพอดี`);
    assert.equal(hits(constant(newTag), constant(oldTag)), oldTag === 'un_decl_old' ? 1 : 0);
  }
  const patched = body
    .replace(constant('un_decl_old'), constant('un_decl_new'))
    .replace(constant('un_ret_old'), constant('un_ret_new'));
  const flat = patched.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
  assert.match(flat, /v_reopened jsonb := '\[\]'::jsonb;/);
  // ตราของใบนี้เท่านั้น — ตราของการรับใบอื่นไม่แตะ
  assert.match(flat, /s\.metadata->'closedByAccept'->>'quotationId' = v_quote\.id/);
  // ใบรุ่นเก่า = ไม่มีตรา · เปิดเฉพาะที่พิสูจน์ได้ว่า "การรับใบนี้" ปิด: updatedAt = acceptedAt ของใบที่ย้อน
  //   (RPC รับใบเขียนสองช่องด้วย v_now ตัวเดียว) — อ่านจากใบที่ย้อนเองซึ่งล็อกอยู่ ไม่พึ่งแถวของใบอื่น
  assert.match(flat, /jsonb_typeof\(s\.metadata->'closedByAccept'\) IS DISTINCT FROM 'object' AND s\."updatedAt" = v_quote\."acceptedAt"/);
  // 🐞 รีวิว 25/09: กติกาเดิมเว้นด้วย NOT EXISTS ใบ cancelled ที่ acceptedAt ตรง — ใบนั้นถูกบังคับลบ/ลบทีหลัง
  //   = หาไม่เจอ = ใบที่การรับใบอื่นปิดถูกเปิดตอนย้อนการรับใบนี้ (ขัดมติข้อ 4) ⇒ ห้ามกลับมา
  assert.doesNotMatch(flat, /NOT EXISTS/, 'ใบรุ่นเก่าต้องพิสูจน์ว่าใบนี้ปิด ไม่ใช่ "หาใบอื่นที่ปิดไม่เจอ"');
  assert.doesNotMatch(flat, /o\.status = 'cancelled'/);
  assert.match(flat, /WHERE q\.id = t\.id AND q\.status = 'closed'/);
  assert.match(flat, /- 'closedByAccept'/, 'เปิดแล้วต้องลบตราทิ้ง — Rev. ก๊อป metadata ต่อ');
  assert.match(flat, /'reopenedQuotations', v_reopened/);
  // ใบหลักยังกลับเป็น sent ตามเดิม · ด่าน SO ที่ยังมีชีวิต (0380) ไม่ถูกแตะ
  assert.match(flat, /status = 'sent', metadata = COALESCE\(metadata, '\{\}'::jsonb\) \|\| jsonb_build_object\( 'unaccept'/);
  assert.match(flat, /status <> 'cancelled' AND "supersededById" IS NULL/);
});

test('กติกาเดาสถานะของใบรุ่นเก่า: SQL กับตัวพรีวิวฝั่ง JS พูดเหมือนกัน', () => {
  const flat = constant('un_ret_new').replace(/--[^\n]*/g, '').replace(/\s+/g, ' ');
  const allowed = REOPENABLE_QUOTATION_STATUSES.map((s) => `'${s}'`).join(', ');
  assert.match(flat, new RegExp(`t\\.stamp->>'prevStatus' IN \\(${allowed}\\) THEN t\\.stamp->>'prevStatus'`));
  assert.match(flat, /WHEN q\."approvalStatus" IN \('approved', 'not_required'\) THEN 'sent' ELSE 'draft'/);
  assert.equal(inferredReopenStatus('approved'), 'sent');
  assert.equal(inferredReopenStatus('not_required'), 'sent');
  for (const other of ['pending', 'not_submitted', 'rejected', null]) assert.equal(inferredReopenStatus(other), 'draft');
  // ชุดสถานะที่เปิดคืนได้ = ชุดที่การรับใบปิด (0361) — ต่างกันเมื่อไรคือเปิดใบเป็นสถานะที่ไม่เคยถูกปิดมา
  assert.match(latestBody('accept_quotation_atomic').body, new RegExp(`AND status IN \\(${allowed}\\);`));
});

test('0388 รันซ้ำได้ + ยามครั้งเดียวพอดี + ไม่แตะทางยกเลิก SO / บังคับลบ (มติข้อ 4)', () => {
  assert.match(SQL, /strpos\(v_proc\.prosrc, 'closedByAccept'\) > 0/);
  assert.match(SQL, /strpos\(v_proc\.prosrc, 'v_reopened'\) > 0/);
  assert.match(SQL, /RAISE EXCEPTION '0388:/);
  for (const fn of ['cancel_sales_order_with_reversal_atomic', 'revert_deal_out_of_won', 'force_delete_quotation']) {
    assert.doesNotMatch(SQL.replace(/--[^\n]*/g, ''), new RegExp(fn), `0388 ต้องไม่แตะ ${fn}`);
  }
});

test('route ย้อนการรับ: พรีวิวอยู่หลังด่านเดียวกับตอนกดจริง · เธรด + audit ทีละใบจากผลของ RPC', () => {
  const route = strip(read('app/api/sales-planning/quotations/[id]/unaccept/route.js'));
  const gate = route.indexOf('canUnacceptQuotation(user, before.deal)');
  const status = route.indexOf("before.status !== 'accepted'");
  const dryRun = route.indexOf('isDryRun(req)');
  const rpc = route.indexOf("supabase.rpc('unaccept_quotation_atomic'");
  assert.ok(gate > 0 && status > gate && dryRun > status && rpc > dryRun, 'พรีวิวต้องผ่านด่านสิทธิ์ + สถานะก่อน');
  assert.match(route, /previewQuotationUnaccept\(supabase, before\)/);
  assert.match(route, /result\?\.reopenedQuotations/);
  assert.match(route, /action: 'reopen'/);
  assert.match(route, /quotationReopenAuditSummary\(/);
  assert.match(route, /reopened/);
  // ห้ามโหลดใบเพิ่ม (systemRules กฎ 6) — พี่น้องอ่านเป็นลิสต์ตามดีลใน repo
  assert.equal((route.match(/from\(\s*['"]quotations['"]\s*\)/g) || []).length, 2, 'จุดโหลดใบของ route คงเดิม (ก่อน/หลัง)');
});

test('จอใบเสนอราคา: เปิดโมดัลย้อนการรับด้วยพรีวิวของ server · toast บอกผลจริง', () => {
  const page = read('app/sales-planning/quotations/[id]/page.js');
  assert.match(page, /\/unaccept\?dryRun=1/);
  assert.match(page, /quotationUnacceptPromptDetail\(/);
  assert.match(page, /quotationUnacceptToast\(/);
  // พิมพ์เหตุผลต้องไม่ทำพรีวิวหาย
  assert.match(page, /setUnacceptForm\(\(form\) => \(form \? \{ \.\.\.form, reason \} : form\)\)/);
});

test('ทางยกเลิก SO พร้อมย้อน Won + บังคับลบ บอกไว้ที่จุดเรียกว่าไม่เปิดใบพี่น้อง (มติข้อ 4)', () => {
  const soRoute = read('app/api/sales-planning/sales-orders/[id]/route.js');
  const qtRoute = read('app/api/sales-planning/quotations/[id]/route.js');
  assert.match(soRoute, /มติ 25\/09[^\n]*ไม่เปิดใบพี่น้อง/);
  assert.match(qtRoute, /มติ 25\/09[^\n]*ไม่เปิดใบพี่น้อง/);
});
