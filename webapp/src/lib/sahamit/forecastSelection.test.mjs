// ── /sahamit/forecast แท็บรายเดือน · "สร้างแผนการขาย": รายการที่เลือก = ติ๊กอยู่ และอยู่บนจอ (ตรวจตัวเลข 20/10 · M24b) ──
//
// 🐞 เลขบนแถบ/ปุ่ม/โมดัล ("เลือก N รายการ" · "สร้างแผนการขาย (N)" · "สร้าง N ดีล") นับ `selectedLines.size` ทั้งก้อน
//    ขณะที่จำนวนชิ้น/มูลค่า/ด่านเดือนส่งก่อน PO วนเฉพาะแถวบนจอ (ผ่านคำค้น/หมวด) ⇒ ติ๊ก 10 แล้วค้นจนเหลือ 3:
//    แถบบอก 10 กับยอดของ 3 และกดสร้างได้ 10 ดีล (7 ใบที่มองไม่เห็นไม่ผ่านด่านเดือนด้วย)
// ⭐ ตัวนับ ยอด ด่าน และ lineIds ที่ส่งไปสร้างดีลออกจากลูปเดียว (`forecastSelectionOf` · `selection.ids`)
//    + `pruneSelection` ตัดรายการที่หลุดจากจอออกจากการเลือก (ร่วมสายกับ /tax ที่ล้างการเลือกเมื่อกรอง แต่ที่นี่ตัดเฉพาะที่หลุด)
// เทสต์สองชั้น: รันสูตรของจริงด้วยข้อมูลล้วน + ยามซอร์สว่าจอเรียกสูตรนั้นทั้งสองจุด (จอเป็น JSX + "use client")
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { forecastSelectionOf, pruneSelection } from './forecastSelection.js';
import { deliveryBeforePo } from './dealDates.js';

const live = (source) => source.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const page = live(readFileSync(new URL('../../app/sahamit/forecast/page.js', import.meta.url), 'utf8'));

// ทรงแถวของ lineList บนจอ: { id, fgCode, month, qty, price, amount, mapped }
const row = (i, extra = {}) => ({
  id: `L${i}`, fgCode: i < 3 ? 'FG-HIT' : 'FG-MISS', month: '2026-12', qty: 10, price: 5, amount: 50, mapped: false, ...extra,
});
const all = Array.from({ length: 10 }, (_, i) => row(i));
const search = (rows) => rows.filter((r) => r.fgCode === 'FG-HIT');          // ค้น "hit" ⇒ เหลือ 3 แถวบนจอ
const selectableOf = (rows) => rows.filter((r) => !r.mapped);                 // ทรงเดียวกับ selectableLines ของจอ

test('🔴 M24b: ติ๊ก 10 ค้นเหลือ 3 ⇒ นับ 3 · ส่ง 3 · ยอดของ 3 แถวเดียวกัน', () => {
  const selected = new Set(all.map((r) => r.id));
  const s = forecastSelectionOf(search(all), selected);
  assert.equal(s.count, 3);
  assert.equal(s.count, s.ids.length, 'ตัวนับ = ไอดีที่ส่งไปสร้าง');
  assert.deepEqual(s.ids, ['L0', 'L1', 'L2']);
  assert.equal(s.qty, 30, 'ยอดชิ้นของชุดเดียวกับตัวนับ');
  assert.equal(s.value, 150);
  // ทุกไอดีที่ส่ง = แถวที่เห็นบนจอและเลือกได้
  const onScreen = new Set(selectableOf(search(all)).map((r) => r.id));
  assert.ok(s.ids.every((id) => onScreen.has(id) && selected.has(id)));
});

test('🔴 M24b: แถวที่มีดีลแล้ว (mapped) ไม่นับ แม้ยังติ๊กค้าง · แถวไม่มีราคานับเป็น unpriced ไม่เข้ามูลค่า', () => {
  const rows = search(all).map((r) => (r.id === 'L0' ? { ...r, mapped: true } : r.id === 'L1' ? { ...r, price: null, amount: null } : r));
  const s = forecastSelectionOf(rows, new Set(['L0', 'L1', 'L2']));
  assert.deepEqual(s.ids, ['L1', 'L2']);
  assert.equal(s.count, 2);
  assert.equal(s.qty, 20);
  assert.equal(s.unpriced, 1);
  assert.equal(s.value, 50);
});

test('🔴 M24b: ด่านเดือนวนชุดเดียวกับตัวนับ — แถวที่มองไม่เห็นไม่ทำให้ด่านติด', () => {
  const rows = all.map((r) => (r.fgCode === 'FG-MISS' ? { ...r, month: '2026-01' } : r)); // แถวที่ค้นไม่เจอ = ส่งก่อนเดือน PO
  const isEarly = (r) => deliveryBeforePo({ poMonth: '2026-06', demandMonth: r.month });
  const selected = new Set(all.map((r) => r.id));
  assert.equal(forecastSelectionOf(search(rows), selected, { isEarly }).early.length, 0, 'บนจอเหลือแต่เดือน 12 ⇒ ผ่านด่าน');
  const wide = forecastSelectionOf(rows, selected, { isEarly });
  assert.equal(wide.early.length, 7);
  assert.ok(wide.early.every((r) => wide.ids.includes(r.id)), 'แถวที่ติดด่าน ⊆ ชุดที่นับ');
});

test('M24b: ไม่ได้ติ๊กอะไร / ติ๊กแต่ไม่อยู่บนจอ ⇒ 0 ทุกช่อง', () => {
  assert.deepEqual(forecastSelectionOf(all, new Set()), { ids: [], count: 0, qty: 0, value: 0, unpriced: 0, early: [] });
  assert.equal(forecastSelectionOf(search(all), new Set(['L5', 'L9'])).count, 0);
});

test('🔴 M24b: pruneSelection ตัดเฉพาะที่หลุดจากจอ · ไม่มีอะไรหลุด = คืนตัวเดิม (ไม่วนเรนเดอร์)', () => {
  const selected = new Set(all.map((r) => r.id));
  const pruned = pruneSelection(selected, selectableOf(search(all)));
  assert.deepEqual([...pruned], ['L0', 'L1', 'L2']);
  assert.notEqual(pruned, selected);
  // ค่าที่ตัดแล้ว = ค่าที่ตัวนับเห็นอยู่แล้ว (นับก่อน/หลังตัดเท่ากัน)
  assert.equal(forecastSelectionOf(search(all), pruned).count, forecastSelectionOf(search(all), selected).count);
  // ไม่มีอะไรหลุด ⇒ ตัวเดิม (identity) — setState ด้วยตัวเดิมไม่เรนเดอร์ซ้ำ
  assert.equal(pruneSelection(pruned, selectableOf(search(all))), pruned);
  assert.equal(pruneSelection(new Set(), []).size, 0);
  // แถวที่เพิ่งมีดีล (reloadMapped) หลุดจาก selectableLines ⇒ หลุดจากการเลือก
  const afterMapped = search(all).map((r) => (r.id === 'L0' ? { ...r, mapped: true } : r));
  assert.deepEqual([...pruneSelection(pruned, selectableOf(afterMapped))], ['L1', 'L2']);
});

test('🔴 M24b: จอเรียกสูตรตัวกลางทั้งตัวนับและตัวตัด · ส่ง lineIds ชุดเดียวกับที่นับ', () => {
  const selection = page.match(/const selection = useMemo\(\(\) => \{[\s\S]*?\}, \[selectedLines, lineList, dealMonth\]\);/)?.[0] || '';
  assert.ok(selection, 'หาก้อน selection ไม่เจอ');
  assert.match(selection, /return forecastSelectionOf\(lineList, selectedLines, \{ isEarly \}\);/);
  assert.match(page, /setSelectedLines\(\(prev\) => pruneSelection\(prev, selectableLines\)\);\s*\}, \[selectableLines\]\);/,
    'ต้องมี effect ตัดการเลือกตาม selectableLines');
  assert.match(page, /lineIds: selection\.ids,/, 'ส่งไปสร้างเฉพาะที่นับบนแถบ');
  assert.match(page, /if \(!selectedRound \|\| !selection\.count\) return;/);
  assert.doesNotMatch(page, /selectedLines\.size/, 'ห้ามนับการเลือกทั้งก้อนที่มองไม่เห็น');
  assert.doesNotMatch(page, /lineIds: \[\.\.\.selectedLines\]/);
});
