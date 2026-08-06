// ── กติกาค้นกลาง + ด่านกันตัวเลือกดีลแตกกลับไปเป็นของใครของมัน ────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { filterByQuery, matchesQuery } from './pickerSearch.js';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('matchesQuery: หลายคำต้องเจอทุกคำ ไม่สนตัวพิมพ์ ไม่สนช่องว่างเกิน', () => {
  assert.equal(matchesQuery('Rinvala Sachet · FC 2026-11', 'rinvala 2026-11'), true);
  assert.equal(matchesQuery('Rinvala Sachet · FC 2026-11', 'rinvala 2026-08'), false);
  assert.equal(matchesQuery('Rinvala Sachet', '  RINVALA   sachet '), true);
  // คำค้นว่าง = ผ่านทุกอย่าง (ผู้เรียกไม่ต้องเช็คเองก่อน)
  assert.equal(matchesQuery('อะไรก็ได้', ''), true);
  assert.equal(matchesQuery('', 'x'), false);
});

test('filterByQuery: ใช้ search ก่อน label และคืนของเดิมเมื่อไม่มีคำค้น', () => {
  const rows = [
    { label: 'ดีล A', search: 'ดีล A บจก.รินวาลา' },
    { label: 'ดีล B' },
  ];
  assert.deepEqual(filterByQuery(rows, 'รินวาลา').map((r) => r.label), ['ดีล A']);
  assert.deepEqual(filterByQuery(rows, 'ดีล').map((r) => r.label), ['ดีล A', 'ดีล B']);
  assert.equal(filterByQuery(rows, '   ').length, 2);
});

// ⭐ ratchet: ทุกจุดที่ให้ผู้ใช้เลือกดีลต้องผ่าน DealPicker ตัวกลาง — เดิมมีคู่ช่อง
// "โครงการ + ดีล" กระจาย 4 หน้า แต่ละที่กรอง/ค้น/เขียนป้ายไม่เหมือนกัน
test('หน้าที่ต้องเลือกดีล ใช้ DealPicker ตัวกลาง ไม่ประกอบ dropdown เอง', () => {
  const callers = [
    'components/pm/TaskFormModal.js',
    'components/requests/RequestForm.js',
    'app/sales-planning/quotations/new/page.js',
  ];
  for (const rel of callers) {
    const source = fs.readFileSync(path.join(SRC, rel), 'utf8');
    assert.match(source, /from "@\/components\/pm\/DealPicker"/, `${rel} ต้องใช้ DealPicker`);
    assert.doesNotMatch(source, /entity="deal"/, `${rel} ยังประกอบดรอปดาวน์ดีลเอง`);
  }
});

test('ตัวเลือกสองชั้นมีที่เดียว — DealPicker ห่อ TwoPanePicker ไม่ใช่เขียนแผงเอง', () => {
  const picker = fs.readFileSync(path.join(SRC, 'components/pm/DealPicker.js'), 'utf8');
  assert.match(picker, /from "@\/components\/ui\/TwoPanePicker"/);
  assert.doesNotMatch(picker, /createPortal/, 'พฤติกรรมแผงต้องอยู่ที่ตัวกลางเท่านั้น');
});

test('ช่องค้นในแผงลอยใช้คลาสกลาง .ui-select-search และคลาสนั้นห้ามถูกบีบ', () => {
  const picker = fs.readFileSync(path.join(SRC, 'components/ui/TwoPanePicker.js'), 'utf8');
  assert.match(picker, /className="ui-select-search"/);
  const globals = fs.readFileSync(path.join(SRC, 'app/globals.css'), 'utf8');
  const block = globals.slice(globals.indexOf('.ui-select-search {'));
  assert.match(block.slice(0, block.indexOf('}')), /flex:\s*0 0 auto/,
    'ช่องค้นต้องไม่ถูกบีบเตี้ยเมื่ออยู่ในคอลัมน์สูงคงที่');
});
