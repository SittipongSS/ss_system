// ── docs/so-service-setup.md × สารบัญ — บรรทัดสถานะตรงกับของจริงหลังขึ้น prod (UAT 29/09 ข้อ 4) ─────────────────
//
// 🪤 สารบัญเคยเน่าเพราะเนื้อในเดินหน้าแต่บรรทัดสถานะไม่มีใครแก้ (docs/INDEX.md "กฎที่เจ็บมาแล้ว")
//    PR-A ขึ้น prod แล้ว (#1849 · 73458014) · mig 0392 รัน 29/09 · UAT ผ่าน 29/09 — หัวไฟล์/แถวสารบัญยังเขียน "ยังไม่รัน · ยังไม่ UAT"
// ⭐ ใบเข้าเกณฑ์ตั้งย้อนหลังตอนรัน 0392 = 60 · ขึ้นจริงตาม D25 = 49 (11 ใบงานออกแบบล้วน FG หมวด 03-xxx) — ไม่ใช่ "~59" ของตอนวางแผน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as draft from '../../components/salesPlanning/serviceSetup/serviceSetupDraft.js';
import * as serviceSetup from './serviceSetup.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const DOC = read('../../../../docs/so-service-setup.md');
const INDEX = read('../../../../docs/INDEX.md');
const STATUS_WORDS = /\*\*(รอดำเนินการ|กำลังดำเนินการ|รอตรวจ|เสร็จสมบูรณ์|ระงับ)\*\*/;

/** บล็อก `> …` แรกของไฟล์ = บรรทัดสถานะ (อาจยาวสองบรรทัด) */
function statusBlock(doc) {
  const lines = doc.split('\n');
  const start = lines.findIndex((line) => line.startsWith('> สถานะ:'));
  assert.ok(start >= 0, 'หาบรรทัด "> สถานะ:" ไม่เจอ');
  const block = [];
  for (let i = start; i < lines.length && lines[i].startsWith('> '); i += 1) block.push(lines[i]);
  return block.join('\n');
}

test('หัวไฟล์: คำสถานะจาก 5 คำ · PR-A ขึ้น prod (#1849 · 73458014) · mig 0392 รันแล้ว 29/09 · UAT ผ่าน 29/09', () => {
  const status = statusBlock(DOC);
  assert.match(status, new RegExp(`^> สถานะ: ${STATUS_WORDS.source}`));
  assert.match(status, /#1849/);
  assert.match(status, /73458014/);
  assert.match(status, /mig 0392 รันแล้ว 29\/09/);
  assert.match(status, /UAT ผ่าน 29\/09/);
  assert.doesNotMatch(status, /ยังไม่รัน|ยังไม่ UAT|กำลังทำ/, 'คำของตอนก่อนขึ้น prod ต้องไม่ค้าง');
});

test('จำนวนใบตั้งย้อนหลัง: 60 เข้าเกณฑ์ · 49 ตาม D25 · 11 ใบงานออกแบบล้วน 03-xxx — ไม่เหลือ "~59"', () => {
  assert.doesNotMatch(DOC, /~59|≈ 59/);
  assert.match(DOC, /60 ใบเข้าเกณฑ์ตอนรัน 0392 · ขึ้นจริง 49 ใบตาม D25 — อีก 11 ใบเป็นงานออกแบบล้วน/);
  assert.match(DOC, /`backfill_candidates` = 60 \(รันจริง 29\/09 · ขึ้นจริง 49 ใบตาม D25 — 11 ใบงานออกแบบล้วน FG หมวด 03-xxx/);
});

test('แถวสารบัญ: คำสถานะเท่าหัวไฟล์ · ขึ้น prod แล้ว · ไม่เหลือ "ยังไม่รัน" / "~59"', () => {
  const row = INDEX.split('\n').find((line) => line.startsWith('| [so-service-setup.md](so-service-setup.md) |'));
  assert.ok(row, 'หาแถว so-service-setup.md ในสารบัญไม่เจอ');
  const headWord = statusBlock(DOC).match(STATUS_WORDS)?.[1];
  const rowWord = row.match(/\| ([^|]+) \|$/)?.[1];
  assert.equal(rowWord, headWord, 'คำสถานะของแถวสารบัญต้องเท่าหัวไฟล์ (กฎ INDEX: แก้สถานะในคอมมิตเดียวกับโค้ด)');
  assert.match(row, /#1849/);
  assert.match(row, /mig 0392 รันแล้ว 29\/09/);
  assert.match(row, /49 ใบตาม D25 จาก 60/);
  assert.doesNotMatch(row, /ยังไม่รัน|~59/);
});

test('หัวข้อ "เก็บผล UAT 29/09" อ้างชื่อที่มีจริงในโค้ด (เปลี่ยนชื่อแล้วลืมเอกสาร = แดง)', () => {
  const start = DOC.indexOf('### เก็บผล UAT 29/09');
  assert.ok(start >= 0, 'หาหัวข้อ "เก็บผล UAT 29/09" ไม่เจอ');
  const section = DOC.slice(start, DOC.indexOf('\n## ', start));
  for (const name of ['backfillRailPressed', 'submitIssuesAfterSave', 'backfillRailOnTop']) {
    assert.ok(section.includes(`\`${name}`), `เอกสารต้องอ้าง ${name}`);
    assert.equal(typeof draft[name], 'function', `${name} ต้องมีจริงใน serviceSetupDraft.js`);
  }
  assert.ok(section.includes('`SERVICE_BACKFILL_RAIL_TEXT`'));
  assert.equal(typeof serviceSetup.SERVICE_BACKFILL_RAIL_TEXT?.periodWaitKind, 'function');
  assert.ok(section.includes(serviceSetup.SERVICE_BACKFILL_RAIL_TEXT.periodWaitKind('{n}')), 'ข้อความในเอกสารตรงกับแคตตาล็อก');
});
