// ── docs/so-service-setup.md × สารบัญ — บรรทัดสถานะตรงกับของจริงหลังขึ้น prod (UAT 29/09 ข้อ 4) ─────────────────
//
// 🪤 สารบัญเคยเน่าเพราะเนื้อในเดินหน้าแต่บรรทัดสถานะไม่มีใครแก้ (docs/INDEX.md "กฎที่เจ็บมาแล้ว")
//    PR-A ขึ้น prod แล้ว (#1849 · 73458014) · mig 0392 รัน 29/09 · UAT ผ่าน 29/09 — หัวไฟล์/แถวสารบัญยังเขียน "ยังไม่รัน · ยังไม่ UAT"
// ⭐ ใบเข้าเกณฑ์ตั้งย้อนหลังตอนรัน 0392 = 60 · ขึ้นจริงตาม D25 = 49 (11 ใบงานออกแบบล้วน FG หมวด 03-xxx) — ไม่ใช่ "~59" ของตอนวางแผน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as draft from '../../components/salesPlanning/serviceSetup/serviceSetupDraft.js';
import * as roundsEntry from './serviceRoundsEntry.js';
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

test('หัวข้อปุ่ม "แก้งานบริการ" (mig 0396): สถานะจาก 5 คำ · บอกว่าเจ้าของต้องรัน 0396 ก่อน deploy · อ้างชื่อที่มีจริงในโค้ด', () => {
  const start = DOC.indexOf('### ปุ่ม "แก้งานบริการ" หลังอนุมัติ (mig 0396');
  assert.ok(start >= 0, 'หาหัวข้อปุ่มแก้งานบริการไม่เจอ');
  const section = DOC.slice(start, DOC.indexOf('\n## ', start));
  assert.match(section, new RegExp(`> สถานะ: ${STATUS_WORDS.source}`));
  assert.match(section, /เจ้าของต้องรัน `0396_so_service_reopen\.sql`/);
  for (const name of ['SERVICE_REOPEN_TEXT', 'SERVICE_REOPEN_BLOCKER_TEXT', 'SERVICE_REOPENED_TEXT']) {
    assert.ok(section.includes(`\`${name}\``), `เอกสารต้องอ้าง ${name}`);
    assert.equal(typeof serviceSetup[name], 'object', `${name} ต้องมีจริงใน serviceSetup.js`);
  }
  assert.equal(typeof serviceSetup.serviceSetupReopened, 'function');
  /* ทุกรหัสเหตุที่เอกสารเล่ามีข้อความจริงในแคตตาล็อก (เพิ่ม/ถอดรหัสแล้วลืมเอกสาร = แดง) */
  for (const code of ['plans_active', 'visits_live', 'site_visits_open', 'ml_set', 'legacy_terms', 'nothing_to_edit', 'money_fn', 'unread']) {
    assert.ok(section.includes(`\`${code}\``), `เอกสารต้องเล่ารหัส ${code}`);
    assert.equal(typeof serviceSetup.SERVICE_REOPEN_BLOCKER_TEXT[code], 'function', code);
  }
  assert.ok(section.includes(serviceSetup.SERVICE_REOPENED_TEXT.bannerTitle));
  assert.ok(section.includes(serviceSetup.SERVICE_REOPENED_TEXT.railTitle));
  assert.equal(typeof draft.backfillCopyOfView, 'function');
});

test('หัวข้อ "ช่วงบริการรายรายการ" (mig 0400): สถานะจาก 5 คำ · บอกว่าเจ้าของต้องรัน 0400 ก่อน merge/deploy · อยู่ก่อนหัวข้อปุ่มแก้งานบริการ · อ้างชื่อที่มีจริงในโค้ด', () => {
  const start = DOC.indexOf('### ช่วงบริการรายรายการ — สวิตช์ ‘ทั้งใบช่วงเดียว | แยกรายรายการ’ (mig 0400 · มติเจ้าของ 01/10)');
  assert.ok(start >= 0, 'หาหัวข้อช่วงบริการรายรายการไม่เจอ');
  const end = DOC.indexOf('### ปุ่ม "แก้งานบริการ" หลังอนุมัติ (mig 0396', start);
  assert.ok(end > start, 'หัวข้อนี้ต้องอยู่ก่อนหัวข้อปุ่มแก้งานบริการ');
  const section = DOC.slice(start, end);
  assert.match(section, new RegExp(`\\n> สถานะ: ${STATUS_WORDS.source}`));
  assert.match(section, /เจ้าของต้องรัน `0400_so_service_line_period\.sql`/);
  assert.ok(readFileSync(new URL('../../../supabase/migrations/0400_so_service_line_period.sql', import.meta.url), 'utf8').length > 0, 'ไฟล์ migration ที่เอกสารอ้างต้องมีจริง');
  for (const name of ['SERVICE_PERIOD_TEXT', 'servicePeriodModeOf', 'serviceLinePeriod', 'periodEnvelope', 'servicePeriodCounters', 'validateServiceSetupPatch']) {
    assert.ok(section.includes(`\`${name}\``), `เอกสารต้องอ้าง ${name}`);
    assert.ok(serviceSetup[name] !== undefined, `${name} ต้องมีจริงใน serviceSetup.js`);
  }
  for (const name of ['switchPeriodMode', 'applyPeriodToAllLines', 'sameSourceOf', 'localEnvelope', 'backfillRailChecks', 'lineMissing', 'setupPayload']) {
    assert.ok(section.includes(`\`${name}\``), `เอกสารต้องอ้าง ${name}`);
    assert.equal(typeof draft[name], 'function', `${name} ต้องมีจริงใน serviceSetupDraft.js`);
  }
  /* รหัส/ข้อที่เอกสารเล่ามีข้อความจริงในแคตตาล็อก (เปลี่ยนชื่อแล้วลืมเอกสาร = แดง) */
  for (const code of ['service_setup_period_mode_invalid', 'service_setup_period_derived', 'service_setup_line_period_mode', 'service_setup_line_period_invalid']) {
    assert.ok(section.includes(`\`${code}\``), `เอกสารต้องเล่ารหัส ${code}`);
    assert.equal(typeof serviceSetup.SERVICE_SETUP_SQL_MESSAGES[code]?.message, 'string', code);
  }
  assert.ok(section.includes('`line_period_missing`'));
  assert.equal(typeof serviceSetup.SERVICE_SETUP_ISSUE_TEXT.line_period_missing, 'function');
  /* คำบนจอที่เอกสารยกมาตรงกับแคตตาล็อก */
  for (const text of [
    serviceSetup.SERVICE_PERIOD_TEXT.wholeNote, serviceSetup.SERVICE_PERIOD_TEXT.envelopeLabel, serviceSetup.SERVICE_PERIOD_TEXT.sameForAll,
    serviceSetup.SERVICE_PERIOD_TEXT.none, serviceSetup.SERVICE_PERIOD_TEXT.followsOrder, serviceSetup.SERVICE_PERIOD_TEXT.lineEmpty,
    serviceSetup.SERVICE_PERIOD_TEXT.railLabelLine, serviceSetup.SERVICE_SETUP_GRID_TEXT.steps[0].label, serviceSetup.SERVICE_SETUP_GRID_TEXT.steps[0].hint,
  ]) {
    assert.ok(section.includes(text), `เอกสารต้องยกคำ "${text}" ตามแคตตาล็อก`);
  }
  /* "งานต่อ" ของหัวข้อ 30/09 ถูกปิดแล้ว (ไม่เหลือสถานะรอดำเนินการค้าง) · แถวสารบัญบอกว่าต้องรัน 0400 */
  assert.doesNotMatch(DOC, /ต้องมี migration · สถานะ \*\*รอดำเนินการ\*\*/);
  const row = INDEX.split('\n').find((line) => line.startsWith('| [so-service-setup.md](so-service-setup.md) |'));
  assert.match(row, /mig 0400/);
  assert.match(row, /เจ้าของรัน 0400 ก่อน merge\/deploy/);
});

test('หัวข้อ "สลับ ④⑤ + หน่วยเดือน" (มติเจ้าของ 08/10): สถานะจาก 5 คำ · ไม่มี migration · อยู่ก่อนหัวข้อช่วงบริการรายรายการ · ลำดับ/หน่วย/ชื่อที่เล่าตรงกับโค้ด', () => {
  const start = DOC.indexOf('### สลับ ④⑤ + หน่วยเดือน (มติเจ้าของ 08/10');
  assert.ok(start >= 0, 'หาหัวข้อสลับ ④⑤ + หน่วยเดือนไม่เจอ');
  const end = DOC.indexOf('### ช่วงบริการรายรายการ — สวิตช์', start);
  assert.ok(end > start, 'หัวข้อนี้ต่อจากหัวข้อรื้อตาราง 30/09 (ก่อนหัวข้อช่วงบริการรายรายการ)');
  const section = DOC.slice(start, end);
  assert.match(section, new RegExp(`\\n> สถานะ: ${STATUS_WORDS.source}`));
  assert.match(section, /ไม่มี migration/);
  assert.ok(section.includes('อยากสลับ ข้อ 4 กับ ข้อ 5 เปลี่ยน หน่วยรอบบริการ จาก รอบ เป็น เดือน'), 'ยกคำของเจ้าของตามตัวอักษร');
  /* ลำดับ ①→⑥ และหน่วยที่เอกสารเล่า = แคตตาล็อก (สลับกลับ/เปลี่ยนหน่วยแล้วลืมเอกสาร = แดง) */
  const { steps } = serviceSetup.SERVICE_SETUP_GRID_TEXT;
  assert.deepEqual(steps.map((step) => step.key), ['kind', 'fg', 'zones', 'packs', 'rounds', 'total']);
  let cursor = 0;
  for (const step of steps) {
    const at = section.indexOf(step.label, cursor);
    assert.ok(at >= cursor, `เอกสารต้องเล่าคอลัมน์ "${step.label}" ตามลำดับของแคตตาล็อก`);
    cursor = at + step.label.length;
  }
  const { roundUnit } = serviceSetup.SERVICE_SETUP_LINE_TEXT;
  assert.equal(roundUnit, 'เดือน');
  assert.ok(section.includes(`"${steps.at(-1).hint}"`), 'คำใบ้ของ ⑥');
  assert.ok(section.includes(`"${serviceSetup.SERVICE_SETUP_LINE_TEXT.roundsText(12)}"`), 'ประโยครอบ');
  assert.ok(section.includes(serviceSetup.lineRoundsLowText(1, { from: '2026-10-01', to: '2027-09-30' }, { stage: 'read' })), 'คำเตือนรอบน้อย');
  assert.ok(section.includes(roundsEntry.SERVICE_ROUNDS_EDIT_TEXT.requiredMonths), 'คำของดินสอ');
  /* ชื่อที่เอกสารอ้างมีจริงในโค้ด */
  for (const name of ['issuesInColumnOrder', 'serviceCardMeta', 'backfillBannerText']) {
    assert.ok(section.includes(`\`${name}\``), `เอกสารต้องอ้าง ${name}`);
    assert.equal(typeof draft[name], 'function', `${name} ต้องมีจริงใน serviceSetupDraft.js`);
  }
  for (const name of ['serviceReopenFieldsText', 'serviceSetupIssues', 'roundsLowOf']) {
    assert.ok(section.includes(`\`${name}\``), `เอกสารต้องอ้าง ${name}`);
    assert.equal(typeof serviceSetup[name], 'function', `${name} ต้องมีจริงใน serviceSetup.js`);
  }
  assert.ok(section.includes('`serviceRoundsRequiredText(order)`'));
  assert.equal(typeof roundsEntry.serviceRoundsRequiredText, 'function');
  /* สารบัญบอกมติ 08/10 และลำดับใหม่ */
  const row = INDEX.split('\n').find((line) => line.startsWith('| [so-service-setup.md](so-service-setup.md) |'));
  assert.match(row, /มติ 08\/10 สลับ ④⑤/);
  assert.match(row, /ไซต์ · โซน → รอบละกี่แพ็ค → จำนวนรอบบริการ → รวม/);

  /* ── ผลตรวจทาน 08/10 (หลังรอบแรก) — สิ่งที่เอกสารต้องเล่าตรงกับโค้ด ── */
  /* ① ประโยคสรุปตัวเลขที่เอกสารยกมา = ตัวที่โค้ดพิมพ์จริง (ลำดับคอลัมน์ ③ → ④ → ⑤ → ⑥) */
  const stripOf = (rounds) => serviceSetup.serviceSetupStripText({
    order: { id: 'SO1', customerId: 'C1', servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-03-31' },
    lines: [{ id: 'L1', lineNo: 1, fgCode: 'FG-364-02-001-1061', productId: 'P1', serviceRounds: rounds, metadata: {} }],
    allocations: [{ salesOrderLineId: 'L1', zoneId: 'Z1', packsPerRound: 1, sortOrder: 0 }],
    zonesById: new Map([['Z1', { id: 'Z1', siteId: 'S1' }]]),
  });
  const summary = 'แต่ละครั้ง 1 โซนใน 1 ไซต์ · ครั้งละ 1 แพ็ค · จำนวนรอบบริการ 6 เดือน · รวมทั้งใบ 6 แพ็ค';
  assert.ok(stripOf(6).startsWith(`งานบริการ: ${summary} · `), stripOf(6));
  assert.ok(section.includes(`"${summary}"`), 'เอกสารยกประโยคสรุปตามลำดับที่โค้ดพิมพ์');
  assert.doesNotMatch(section, /ประโยคสรุปตัวเลขยังขึ้นด้วยจำนวนรอบบริการ/, 'คำของรอบแรก (ยังไม่สลับประโยคสรุป) ต้องไม่ค้าง');
  /* ② ลำดับ Tab = ที่ตาเห็นทั้งสองผัง: เอกสารอ้างตัวอ่านธงพับและธงของ CSS ที่มีจริง · ไม่เหลือคำว่า "ไม่ตรงกับที่ตาเห็น" ของรอบแรก */
  const grid = read('../../components/salesPlanning/serviceSetup/ServiceSetupGrid.js');
  const gridCss = read('../../components/salesPlanning/serviceSetup/ServiceSetupGrid.module.css');
  for (const name of ['useGridFolded', '--svc-grid-folded']) {
    assert.ok(section.includes(`\`${name}\``), `เอกสารต้องอ้าง ${name}`);
    assert.ok(grid.includes(name), `${name} ต้องมีจริงใน ServiceSetupGrid.js`);
  }
  assert.ok(gridCss.includes('--svc-grid-folded: 1'));
  assert.doesNotMatch(section, /ลำดับ Tab ยังเป็นของ DOM/, 'ข้อจำกัดของรอบแรกแก้แล้ว — เอกสารต้องไม่บอกว่ายังไม่ตรง');
  /* ③ การ์ดราง: ป้ายสองแถวที่เอกสารเล่า = ป้ายที่ `backfillRailChecks` พิมพ์ */
  const rail = draft.backfillRailChecks({ lines: [], issues: [], totals: {} });
  for (const key of ['lines', 'zones']) {
    const { label } = rail.find((item) => item.key === key);
    assert.ok(section.includes(`"${label}"`), `เอกสารต้องเล่าป้ายแถว ${key}: ${label}`);
  }
  /* ④ ที่ที่ยังพูด "รอบ" โดยตั้งใจ ต้องมีหน้าสรุปไซต์ของทะเบียนไซต์ (อยู่ใต้ /database ไม่ใช่ /service — ผลตรวจทานชี้ว่าตกรายการ) */
  assert.ok(section.includes('`webapp/src/app/database/sites/[id]/page.js`'));
  assert.match(read('../../app/database/sites/[id]/page.js'), /label: ROUNDS_SOLD_LABEL, value: `\$\{fmtNumber\(roundsSold\)\} รอบ`/,
    'หน้าสรุปไซต์ยังพูด "รอบ" (นอกขอบเขตมติ 08/10) — ถ้าเปลี่ยนแล้วให้แก้รายการในเอกสารด้วย');
});

/* ผลตรวจทาน 08/10 (text-docs-stale-unit): ส่วนที่ไม่มีวันที่กำกับ ("ทะเบียนใบสั่งขาย") และหัวข้อ UAT 29/09 เล่าคำของแคตตาล็อกเป็น "ของปัจจุบัน"
   ⇒ บรรทัดคิวต้องพูดหน่วย/ลำดับปัจจุบัน และข้อของ 29/09 ที่ยกคำเก่าต้องชี้ไปหัวข้อ 08/10 */
test('08/10 เอกสารนอกหัวข้อของมติ: บรรทัดคิวของทะเบียนพูดหน่วย/ลำดับปัจจุบัน · ข้อของ 29/09 ที่ยกคำเก่าชี้ไปหัวข้อ 08/10', () => {
  const { roundUnit } = serviceSetup.SERVICE_SETUP_LINE_TEXT;
  const registry = DOC.slice(DOC.indexOf('### ทะเบียนใบสั่งขาย (`/sa/sales-orders`)'));
  assert.ok(registry.includes(`"ลูกค้า · แต่ละครั้ง z โซนใน s ไซต์ · จำนวนรอบบริการ r ${roundUnit} · ไม่นับ Actual · ยื่นโดย ชื่อ dd/mm/yyyy"`),
    'บรรทัดคิว: โซน/ไซต์ก่อนจำนวนรอบบริการ + หน่วยจากแคตตาล็อก');
  /* ลำดับเดียวกับที่จอประกอบจริง */
  const page = read('../../app/sales-planning/sales-orders/page.js');
  assert.ok(page.includes('แต่ละครั้ง ${naText(review.zones)} โซนใน ${naText(review.sites)} ไซต์ · ${naText(review.roundsLabel)} · ไม่นับ Actual'));
  const uat = DOC.slice(DOC.indexOf('### เก็บผล UAT 29/09'), DOC.indexOf('### รื้อหน้าตาช่องผูกงานบริการเป็นตาราง'));
  assert.ok(uat.length > 0, 'หาหัวข้อเก็บผล UAT 29/09 ไม่เจอ');
  assert.ok(uat.includes(`\`roundsText\` = "${serviceSetup.SERVICE_SETUP_LINE_TEXT.roundsLabel} r ${roundUnit}"`), 'ข้อ 29/09 ที่ยก "r รอบ" ต้องบอกคำปัจจุบัน');
  assert.ok(uat.includes(`\`roundsCount\` = "${serviceSetup.SERVICE_SETUP_LINE_TEXT.roundsCount(12)}"`));
  assert.ok(uat.includes(serviceSetup.lineRoundsLowText(1, { from: '2026-10-01', to: '2027-09-30' }, { stage: 'read' }).replace(/ — ตรวจอีกครั้ง$/, '')),
    'ข้อคำเตือนรอบน้อยของ 29/09 ต้องบอกประโยคปัจจุบัน');
  assert.equal(uat.split('ดูหัวข้อ "สลับ ④⑤ + หน่วยเดือน (มติเจ้าของ 08/10)"').length - 1, 2, 'สองข้อที่ยกคำเก่าชี้ไปหัวข้อ 08/10');
});
