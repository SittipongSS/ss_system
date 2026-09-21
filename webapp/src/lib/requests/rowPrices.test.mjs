// ผู้ใช้ 2026-09-22: "เมื่อส่งราคาแล้ว อยากให้โชว์ราคาด้วย ตอนนี้ ในหน้ารายการคำร้อง และ หน้ารายละเอียดคำร้อง ไม่ได้โชว์ราคาเลย"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { requestPriceSummary, rowPriceLines } from './rowPrices.js';
import { REQUEST_COLUMN_PRESETS, requestColumns } from './queueColumns.js';
import { briefBoard } from './briefBoard.js';

const rev = (short, price, extra = {}) => ({ revisionId: `R-${short}`, short, price, perUnit: 'กก.', ...extra });

test('ช่องราคาของแถว: ทุกช่องที่ใส่ (เรียงจาก server) · rev เก่าช่องเดียวยังโชว์ · ยังไม่ใส่ = ว่าง', () => {
  assert.deepEqual(
    rowPriceLines({ pricedResults: [rev('F', 2800), rev('FB', 950, { validUntil: '2026-12-31' })] })
      .map((p) => [p.short, p.price, p.validUntil]),
    [['F', 2800, null], ['FB', 950, '2026-12-31']],
  );
  assert.deepEqual(rowPriceLines({ pricedResult: rev('F', 1018.88) }).map((p) => p.price), [1018.88]);
  assert.deepEqual(rowPriceLines({}), []);
  assert.deepEqual(rowPriceLines({ pricedResults: [rev('F', null)] }), []);
});

test('ราคาทั้งใบ (คิว): นับเฉพาะรายการที่ส่งงานแล้ว · บอกใส่แล้วกี่รายการ', () => {
  const items = [
    { id: 'A', label: 'Eau de Optimist #1', producedScentId: 'S1', pricedResults: [rev('F', 1018.88)] },
    { id: 'B', label: 'Secret Valley #1', producedScentId: 'S2', pricedResults: [rev('F', 413.01)] },
    { id: 'C', label: 'Parfum de Arte #1', producedScentId: 'S3' },
    { id: 'D', label: 'รอบแก้ที่ยังไม่ส่ง' },
    // ลูกค้าไม่เอา/ถูกรอบแก้แทน — ไม่มีวันได้ราคา ไม่นับเป็นรายการที่รอราคา (SB-26080011 เคยขึ้น 2/4)
    { id: 'E', label: 'ไม่เอา', producedScentId: 'S4', outcome: 'rejected', answerStatus: 'declined' },
    { id: 'F', label: 'รอบแรก', producedScentId: 'S5', outcome: 'revise' },
  ];
  const s = requestPriceSummary(items);
  assert.equal(s.priced, 2);
  assert.equal(s.total, 3);
  assert.deepEqual(s.lines.map((l) => l.label), ['Eau de Optimist #1', 'Secret Valley #1']);
  assert.deepEqual(requestPriceSummary([]), { lines: [], priced: 0, total: 0 });
});

test('คอลัมน์ราคาในคิวโผล่เฉพาะเมื่อมีใบที่ใส่ราคาแล้ว · ไม่ส่งแถว = พฤติกรรมเดิม', () => {
  assert.ok(REQUEST_COLUMN_PRESETS.queue.includes('price'));
  assert.ok(REQUEST_COLUMN_PRESETS.history.includes('price'));
  const none = [{ items: [{ id: 'x', producedScentId: 'S' }] }];
  const some = [...none, { items: [{ id: 'y', producedFormulaId: 'F', pricedResults: [rev('FB', 900)] }] }];
  assert.ok(!requestColumns('queue', none).includes('price'));
  assert.ok(requestColumns('queue', some).includes('price'));
  assert.ok(requestColumns('queue').includes('price'));
  // พาเนลส่งแถวทั้งชุดที่กรองแล้ว (ไม่ใช่หน้าปัจจุบัน) — คอลัมน์ไม่กระพริบตอนเปลี่ยนหน้า
  assert.match(readFileSync('src/components/requests/RequestQueuePanel.js', 'utf8'),
    /requestColumns\(columns, visibleRows\)/);
});

test('ตารางในใบ (พัฒนากลิ่น): แถวมีราคาครบทุกช่อง', () => {
  const [group] = briefBoard([{ id: 'B1' }], [
    { id: 'A', lineKind: 'scent_dev', briefId: 'B1', label: 'x', producedScentId: 'S1',
      pricedResults: [rev('F', 2800), rev('B', 300), rev('FB', 950)] },
  ]);
  assert.deepEqual(group.directions[0].prices.map((p) => p.short), ['F', 'B', 'FB']);
});
