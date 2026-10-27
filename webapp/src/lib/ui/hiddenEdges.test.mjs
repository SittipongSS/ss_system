// ── คำใบ้ "ตารางเลื่อนแนวนอนได้" (TableScroll `edgeHint` · UAT FN 27/10 ข้อ 6) ──────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hiddenEdges } from './hiddenEdges.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

test('hiddenEdges: ฝั่งที่ยังซ่อนเนื้อ — ไม่ล้น = ว่าง · ต้น = end · กลาง = start end · สุดขวา = start · ทน 1px', () => {
  assert.equal(hiddenEdges({ scrollLeft: 0, scrollWidth: 840, clientWidth: 840 }), '');
  assert.equal(hiddenEdges({ scrollLeft: 0, scrollWidth: 841, clientWidth: 840 }), '', 'ปัดเศษ subpixel ไม่นับว่าล้น');
  assert.equal(hiddenEdges({ scrollLeft: 0, scrollWidth: 1010, clientWidth: 840 }), 'end');
  assert.equal(hiddenEdges({ scrollLeft: 80, scrollWidth: 1010, clientWidth: 840 }), 'start end');
  assert.equal(hiddenEdges({ scrollLeft: 170, scrollWidth: 1010, clientWidth: 840 }), 'start');
  assert.equal(hiddenEdges({ scrollLeft: 169.5, scrollWidth: 1010, clientWidth: 840 }), 'start');
  assert.equal(hiddenEdges(), '');
});

test('TableScroll edgeHint: ปิดเป็นค่าตั้งต้น · ประทับ data-hidden-edge · แผงงวดเปิดและวาดเงาซ้ายของกลุ่มตรึงขวา (ไม่ใช่ ≤640)', () => {
  const table = read('components/ui/Table.js');
  assert.match(table, /edgeHint = false,/);
  assert.match(table, /const \[boxRef, hiddenEdge\] = useHiddenEdges\(edgeHint\);/);
  assert.match(table, /data-hidden-edge=\{edgeHint && hiddenEdge \? hiddenEdge : undefined\}/);
  const css = read('components/salesPlanning/SalesOrderPaymentPanel.module.css');
  assert.match(css, /:global\(\[data-hidden-edge~="end"\]\) \.table > tbody > tr > td\.statusCell,/);
  const mobile = css.slice(css.indexOf('@media (max-width: 640px) {'));
  assert.match(mobile, /:global\(\[data-hidden-edge\]\) \.table > tbody > tr > td\.statusCell,\s*:global\(\[data-hidden-edge\]\) \.table > thead > tr > th\.statusHead \{ box-shadow: none; \}/);
});
