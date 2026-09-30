// ── ยามของเส้น PATCH /api/service/terms/[id] + ช่องแก้มาตรฐาน (PR-C · C-D8/C-D10) ───────────────────
//
// ⭐ เส้นนี้เป็นการเขียนเดียวของ PR-C ลงตาราง service_zone_terms — ทุกอย่างอื่นของรอบขายเป็นภาพนิ่งจากบรรทัดขาย
//   (mig 0392 ก๊อปตอนอนุมัติ) ⇒ ยามล็อกว่า: ด่าน TS เท่านั้น · เขียนแค่ standardMlPerMonth + updatedAt ·
//   รอบของใบที่ไม่มีผลแล้วแก้ไม่ได้ (409) · ลง audit · อ่านแถวทีละ id (ตารางติดเพดานแถว)
// ⭐ ช่องแก้บนจอ: เรียกผ่าน apiJson เท่านั้น · ปุ่ม "ใช้" แค่เติมร่าง ไม่เขียน · ไม่มีบันทึกเองตอนออกจากช่อง
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const WEBAPP = process.cwd();
/* ตัดคอมเมนต์ก่อนตรวจ — คอมเมนต์ในไฟล์เอ่ยชื่อสิ่งต้องห้ามไว้สอนคน */
const code = (p) => fs.readFileSync(path.join(WEBAPP, p), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

const ROUTE = 'src/app/api/service/terms/[id]/route.js';
const CELL = 'src/components/service/TermStandardMlCell.js';
const CELL_CSS = 'src/components/service/TermStandardMlCell.module.css';

test('เส้นนี้มีแค่ PATCH — ไม่มีทางสร้าง/ลบรอบขาย', () => {
  const src = code(ROUTE);
  assert.match(src, /export const PATCH = withUser\(/);
  assert.doesNotMatch(src, /export const (GET|POST|PUT|DELETE)\b/);
  assert.match(src, /export const dynamic = 'force-dynamic';/);
});

test('⭐ ด่านแรกคือ requireService({ user, edit: true }) — ก่อนอ่าน body และก่อนแตะฐาน', () => {
  const src = code(ROUTE);
  const gate = src.indexOf('requireService({ user, edit: true })');
  assert.ok(gate > 0, 'ต้องใช้ด่านแก้ของโมดูลบริการ (canEditService) — ts ที่ถือแค่ service:work ต้องได้ 403');
  assert.ok(gate < src.indexOf('req.json('), 'ตรวจสิทธิ์ก่อนอ่าน body');
  assert.ok(gate < src.indexOf('.from('), 'ตรวจสิทธิ์ก่อนแตะฐาน');
  assert.match(src, /if \(access\.response\) return access\.response;/);
});

test('ตัวตรวจ body = normalizeStandardMlPatch ตัวเดียวกับช่องบนจอ · ผิด = 400', () => {
  const src = code(ROUTE);
  assert.match(src, /normalizeStandardMlPatch\(await req\.json\(\)\.catch\(\(\) => null\)\)/);
  assert.match(src, /if \(error\) return badRequest\(error\);/);
  assert.equal(/\.\.\.body/.test(src), false, 'ห้าม spread body ลงแถว');
});

test('⭐ อ่านรอบขายทีละ id (ตารางติดเพดานแถว) · ไม่พบ = 404 · ใบไม่มีผล = 409 · ตัดสินด้วย termOrderActive ที่เดียว', () => {
  const src = code(ROUTE);
  assert.match(src, /\.from\('service_zone_terms'\)\.select\('\*'\)\.eq\('id', id\)\.maybeSingle\(\)/);
  assert.match(src, /notFound\(STANDARD_ML_MESSAGES\.notFound\)/);
  assert.match(src, /\.from\('sales_orders'\)\s*\.select\('id, "orderNumber", status, "supersededById"'\)\s*\.eq\('id', term\.salesOrderId\)\s*\.maybeSingle\(\)/);
  assert.match(src, /if \(!termOrderActive\(order\)\) return conflict\(STANDARD_ML_MESSAGES\.orderDead\);/);
  // house rule 18: คำสั่งอ่าน sales_orders ใหม่ต้องไม่เป็น "ผู้ต้องสงสัย" ของยามเงินใบย้อนหลัง
  assert.doesNotMatch(src, /['"]approved['"]/, 'สถานะเทียบที่ terms.js ที่เดียว');
  assert.doesNotMatch(src, /\.(eq|neq|in)\(\s*['"]status['"]/);
  assert.match(src, /\.from\('service_zones'\)\.select\('id, code, name'\)\.eq\('id', term\.zoneId\)\.maybeSingle\(\)/);
});

test('⭐ อ่านครบก่อนเขียน — ใบ/โซนอ่านพลาด = 500 ก่อนแตะแถว · ค่าเดิม = ตอบ changed: false ไม่เขียน', () => {
  const src = code(ROUTE);
  const update = src.indexOf('.update(');
  assert.ok(update > 0);
  for (const needle of [".from('sales_orders')", ".from('service_zones')", 'termOrderActive(order)', 'sameStandardMl(']) {
    assert.ok(src.indexOf(needle) > 0 && src.indexOf(needle) < update, `${needle} ต้องมาก่อน .update(`);
  }
  assert.match(src, /if \(sameStandardMl\(term\.standardMlPerMonth, value\)\) \{\s*return ok\(\{ term: pickTerm\(term\), changed: false \}\);/);
  // supabase ไม่ throw — ทุก error ที่แกะออกมาต้องถูกเช็ก
  const names = [...src.matchAll(/error: (\w+) \}/g)].map((m) => m[1]);
  assert.ok(names.length >= 4, `ต้องแกะ error ครบทุกคำสั่ง (เจอ ${names.join(', ')})`);
  for (const name of names) {
    assert.match(src, new RegExp(`if \\(${name}\\) return fail\\(${name}\\.message, 500\\);`), `${name} ต้องตอบ 500`);
  }
  assert.doesNotMatch(src, /\)\s*\.catch\(\s*\(\)\s*=>\s*\(\{/, 'ห้าม .catch บน builder');
});

test('⭐ เขียนแค่ standardMlPerMonth + updatedAt ของแถวเดียว', () => {
  const src = code(ROUTE);
  const update = src.match(/\.update\(\{([\s\S]*?)\}\)/);
  assert.ok(update, 'ต้องเขียนด้วย object literal (ให้ check:columns ตรวจชื่อคอลัมน์ได้)');
  const keys = [...update[1].matchAll(/(\w+):/g)].map((m) => m[1]).sort();
  assert.deepEqual(keys, ['standardMlPerMonth', 'updatedAt']);
  assert.match(src, /\.update\(\{[\s\S]*?\}\)\s*\.eq\('id', id\)\s*\.select\('id, "standardMlPerMonth", "updatedAt"'\)\s*\.single\(\)/);
  assert.equal((src.match(/\.update\(/g) || []).length, 1, 'เขียนครั้งเดียว');
  assert.doesNotMatch(src, /\.(insert|upsert|delete)\(/);
});

test('⭐ ลง audit หลังเขียน — entity service_zone_term · before/after เต็มแถว · สรุปด้วยตัวช่วยกลาง', () => {
  const src = code(ROUTE);
  const audit = src.indexOf('recordAudit({');
  assert.ok(audit > src.indexOf('.update('), 'audit หลังเขียนสำเร็จ');
  const call = src.slice(audit, src.indexOf('});', audit));
  assert.match(call, /action: 'update'/);
  assert.match(call, /entityType: 'service_zone_term'/);
  assert.match(call, /entityId: id/);
  assert.match(call, /before: term, after: \{ \.\.\.term, \.\.\.saved \}/, 'เต็มแถวก่อน/หลัง');
  assert.match(call, /summary: standardMlAuditSummary\(\{/);
  assert.match(call, /request: req/);
  assert.match(src, /return ok\(\{ term: pickTerm\(saved\), changed: true \}\);/);
});

/* ── ช่องแก้บนจอ ─────────────────────────────────────────────────────────────────────── */
test('ช่องแก้เรียกผ่าน apiJson เท่านั้น — PATCH พร้อม json (apiFetch เปล่าทิ้ง json เงียบ)', () => {
  const src = code(CELL);
  assert.match(src, /^"use client";/);
  assert.match(src, /import \{ apiJson \} from "@\/lib\/apiFetch";/);
  assert.doesNotMatch(src, /\bfetch\(/, 'ห้าม fetch ดิบ');
  assert.doesNotMatch(src, /\bapiFetch\(/, 'apiFetch ไม่แกะ body ให้ — ใช้ apiJson');
  const call = src.slice(src.indexOf('apiJson('), src.indexOf('});', src.indexOf('apiJson(')));
  assert.match(call, /`\/api\/service\/terms\/\$\{encodeURIComponent\(term\.id\)\}`/);
  assert.match(call, /method: "PATCH"/);
  assert.match(call, /json: \{ standardMlPerMonth: draftState\.value \}/);
  assert.match(call, /fallbackError: "บันทึกมาตรฐานไม่สำเร็จ"/);
});

test('⭐ ปุ่ม "ใช้" แค่เติมร่าง — ไม่เรียก API · ไม่มีบันทึกเองตอนออกจากช่อง', () => {
  const src = code(CELL);
  const start = src.indexOf('const applySuggestion = ');
  assert.ok(start > 0, 'ต้องมีตัวจัดการปุ่ม "ใช้" แยก');
  const body = src.slice(start, src.indexOf('};', start));
  assert.doesNotMatch(body, /apiJson|save\(/, '"ใช้" ต้องไม่เขียนฐาน (ระบบไม่เติมมาตรฐานให้เอง)');
  assert.match(body, /setDraft\(/);
  assert.match(src, /onClick=\{applySuggestion\}/);
  assert.doesNotMatch(src, /onBlur=/, 'ไม่มีบันทึกเองตอนออกจากช่อง');
  assert.match(src, /standardMlSuggestion\(term, \{ stamped \}\)/);
});

test('ช่องแก้: ไม่มีสิทธิ์ = ค่าอ่านอย่างเดียว · ฮุกทุกตัวก่อนทางออกนั้น · ผลสำเร็จ/ผิดพลาดบอกตรงช่อง', () => {
  const src = code(CELL);
  const readOnly = src.indexOf('if (!canEdit)');
  assert.ok(readOnly > 0);
  const hooks = [...src.matchAll(/\buse(State|Memo|Effect|Ref|Callback)\(/g)].map((m) => m.index);
  assert.ok(hooks.length > 0 && Math.max(...hooks) < readOnly, 'ฮุกต้องเรียกครบก่อน return แบบมีเงื่อนไข');
  assert.match(src.slice(readOnly, readOnly + 200), /standardMlText\(savedValue\)/);
  assert.match(src, /notifyToast\.success\(STANDARD_ML_MESSAGES\.saved\)/);
  assert.match(src, /onSaved\?\.\(\{ \.\.\.term, \.\.\.res\.term \}\)/);
  assert.match(src, /role="alert"/);
  assert.match(src, /type="number"/);
  assert.match(src, /inputMode="numeric"/);
  assert.match(src, /min=\{1\}/);
  assert.match(src, /step=\{1\}/);
  assert.match(src, /autoComplete="off"/);
  assert.match(src, /import styles from "\.\/TermStandardMlCell\.module\.css";/);
  assert.doesNotMatch(src, /style=\{\{/, 'audit:ui — สไตล์อยู่ใน .module.css');
  assert.ok(fs.existsSync(path.join(WEBAPP, CELL_CSS)));
  // ช่องอาจถูกวางในเซลล์ตาราง/ย่อหน้า — ทุกอย่างเป็น inline (house rule 20)
  assert.doesNotMatch(src, /<(div|p|section|StatusNotice)\b/);
});
