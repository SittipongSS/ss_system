// ── หน้าแรก: การจัดวางและสถานะของแถว (ADR 0016) ───────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  blockUnits, countKeyOf, legendState, panelBlocks, panelTotal, rowScope, rowState, sheetLayout,
} from './homeMenus.js';
import { menuGroupsForUser } from '@/config/menuRegistry';

const user = (over = {}) => ({ id: 'u1', role: 'admin', teams: [], extraCaps: [], ...over });
const blocksFor = (u) => panelBlocks(menuGroupsForUser(u));
/* คำตอบที่นับครบแล้ว — `attempted` คือ **ทุกคีย์ที่ route ยิงให้คนนี้** ไม่ใช่เฉพาะที่ได้เลข
   (คีย์ที่นับได้ 0 ถูก pruneZeroCounts ตัดออกจาก counts แต่ยังอยู่ใน _attempted) */
const ready = (counts, attempted = Object.keys(counts), over = {}) => ({
  counts, status: 'ready', attempted: new Set(attempted), failed: new Set(), stale: false, ...over,
});

test('แถว "ไปที่<ระบบ>" ขึ้นเฉพาะระบบที่หน้าแรกของมันไม่ใช่เมนูใดเมนูหนึ่ง', () => {
  const blocks = blocksFor(user());
  const sales = blocks.find((b) => b.system === 'salesplan');
  // บริหารงานขาย: landing = /sa ซึ่งเมนู "ภาพรวม" match ไว้แล้ว ⇒ ไม่ต้องมีแถวพิเศษ
  assert.ok(!sales.flow.some((item) => item.name.startsWith('ไปที่')), 'ไม่ควรมีแถวซ้ำกับเมนูแรกของระบบ');
  for (const block of blocks) {
    if (block.disabled) assert.deepEqual([block.flow, block.util], [[], []], block.system);
  }
});

test('ความสูงของแผงเป็นจำนวนแถว — หัว 1 + เมนู n + ช่องห่าง 1 · ระบบที่ปิด = 2', () => {
  const blocks = blocksFor(user());
  for (const block of blocks) {
    assert.equal(blockUnits(block), block.disabled ? 2 : block.flow.length + block.util.length + 2, block.system);
  }
});

test('≤ fit ระบบที่เปิดใช้ ⇒ หนึ่งระบบหนึ่งคอลัมน์ · ระบบที่ปิดต่อท้ายคอลัมน์ก่อนหน้า', () => {
  const blocks = [
    { system: 'a', disabled: false, flow: [1, 2], util: [] },
    { system: 'off', disabled: true, flow: [], util: [] },
    { system: 'b', disabled: false, flow: [1], util: [] },
  ];
  const layout = sheetLayout(blocks, 3);
  assert.equal(layout.mode, 'row');
  assert.equal(layout.cols, 2, 'สองระบบที่เปิดใช้ = สองคอลัมน์ (ระบบที่ปิดไม่กินคอลัมน์ของตัวเอง)');
  assert.deepEqual(layout.place.map((p) => p.x), [1, 1, 2]);
  assert.equal(layout.place[1].y, blockUnits(blocks[0]) + 1, 'ระบบที่ปิดอยู่ใต้แผงก่อนหน้า');
});

test('ขึ้นต้นด้วยระบบที่ปิด ⇒ ไปอยู่บนหัวคอลัมน์แรก ไม่ลอยเป็นคอลัมน์เปล่า', () => {
  const blocks = [
    { system: 'off', disabled: true, flow: [], util: [] },
    { system: 'a', disabled: false, flow: [1, 2], util: [] },
  ];
  const layout = sheetLayout(blocks, 2);
  assert.deepEqual(layout.place.map((p) => p.x), [1, 1]);
  assert.equal(layout.place[0].y, 1);
});

test('admin ที่ 4 คอลัมน์: ลำดับตาม catalog คงที่ · ทุกช่วงมีระบบที่เปิดใช้', () => {
  const blocks = blocksFor(user());
  const layout = sheetLayout(blocks, 4);
  assert.ok(layout.cols <= 4 && layout.cols >= 2);
  let prevX = 0;
  let prevY = 0;
  for (const place of layout.place) {
    assert.ok(place.x >= prevX, 'คอลัมน์ต้องไม่ถอยหลัง — ลำดับต้องอ่านบนลงล่าง ซ้ายไปขวา');
    if (place.x === prevX) assert.ok(place.y > prevY, 'ในคอลัมน์เดียวกันต้องไล่ลง');
    prevX = place.x;
    prevY = place.y;
  }
  // ทุกคอลัมน์ต้องมีแผงจริง ไม่ใช่มีแต่บรรทัดจาง
  const byColumn = new Map();
  layout.place.forEach((place, i) => {
    byColumn.set(place.x, (byColumn.get(place.x) || []).concat(blocks[i].disabled ? [] : [i]));
  });
  for (const [column, items] of byColumn) assert.ok(items.length > 0, `คอลัมน์ ${column} มีแต่ระบบที่ปิด`);
});

test('สถานะของแถว: กำลังนับ · มีเลข · ศูนย์ · นับไม่สำเร็จ · ไม่มีตัวนับ', () => {
  const blocks = blocksFor(user());
  const sales = blocks.find((b) => b.system === 'salesplan');
  const leads = sales.flow.find((item) => item.href === '/sa/leads');
  const deals = sales.flow.find((item) => item.href === '/sa/deals');
  const me = user();

  assert.equal(rowState(leads, { status: 'loading' }, me), 'loading');
  assert.equal(rowState(leads, ready({ leads: 12 }), me), 'count');
  assert.equal(rowState(leads, ready({}, ['leads']), me), 'zero');
  assert.equal(rowState(leads, { ...ready({}, ['leads']), failed: new Set(['leads']) }, me), 'failed');
  // ทั้งคำขอพัง = ทุกแถวที่เป็นเลนเป็น "นับไม่สำเร็จ" ไม่ใช่ศูนย์
  assert.equal(rowState(leads, { status: 'error', counts: {}, failed: new Set() }, me), 'failed');
  assert.equal(rowState(deals, ready({}, ['leads']), me), 'plain', 'เมนูที่ไม่มีคีย์ตัวเลขต้องไม่จองช่อง');
  assert.equal(countKeyOf(deals), null);

  // payload รุ่นเก่า (ไม่มี _attempted) ⇒ ไม่มีเลข = ศูนย์
  assert.equal(rowState(leads, { counts: {}, status: 'ready', attempted: null, failed: new Set() }, me), 'zero');
  // คีย์ที่ route ไม่ได้ยิงให้ (ไม่อยู่ใน attempted) ⇒ คืนช่อง ไม่ใช่ศูนย์
  assert.equal(rowState(leads, { counts: {}, status: 'ready', attempted: new Set(['issues']), failed: new Set() }, me), 'plain');
});

test('⭐ ยอดของแผงคิดจากแถวที่วาดจริง — ของฉันกับของฝ่ายไม่รวมเป็นยอดเดียว', () => {
  const fn = user({ role: 'finance', department: 'FN' });
  const blocks = blocksFor(fn);
  const finance = blocks.find((b) => b.system === 'finance');
  const state = ready({ payments: 41, financeRequests: 6 });
  const total = panelTotal(finance, state, fn);
  assert.equal(total.mine + total.shared, 47);
  assert.ok(total.shared > 0, 'คิวบัญชีเป็นงานของฝ่าย ไม่ใช่ของคนคนเดียว');
  assert.equal(total.failed, 0);
  // 🐞 navCountForSystem นับเอกสารร่วมไว้ใต้ salesplan ⇒ ใช้กับแผงของ FN ไม่ได้
  assert.equal(rowScope({ href: '/finance/payments' }, fn), 'shared');
  assert.equal(rowScope({ href: '/sa/tasks' }, user({ role: 'ae' })), 'mine');
});

test('คำอธิบายป้ายบอกเฉพาะแบบที่อยู่บนจอ · "ไม่มีงานค้าง" พูดได้ต่อเมื่อนับครบแล้ว', () => {
  const me = user();
  const blocks = blocksFor(me);
  assert.deepEqual(
    { ...legendState(blocks, { status: 'loading' }, me), failedCount: 0 },
    { mine: false, shared: false, failedCount: 0, loading: true, allZero: false, stale: false },
  );
  const zero = legendState(blocks, ready({}, ['leads', 'issues']), me);
  assert.equal(zero.allZero, true);
  const withFail = legendState(blocks, { ...ready({}, ['leads']), failed: new Set(['leads']) }, me);
  assert.equal(withFail.allZero, false, 'มีแถวที่นับไม่สำเร็จ ห้ามพูดว่าไม่มีงานค้าง');
  assert.equal(withFail.failedCount, 1);
  const withCount = legendState(blocks, ready({ leads: 3 }), me);
  assert.equal(withCount.allZero, false);
  assert.equal(withCount.mine || withCount.shared, true);
});

test('คีย์ที่พังแต่ไม่มีแถวบนจอ ต้องไม่ถูกนับเข้าคำอธิบาย', () => {
  const fn = user({ role: 'finance', department: 'FN' });
  const blocks = blocksFor(fn);
  // mgmtTasks เป็นตัวนับของระบบที่ปิดอยู่ — ยิงที่ server แต่ไม่มีแถวให้ใครเห็น
  const legend = legendState(blocks, { ...ready({}, ['payments', 'mgmtTasks']), failed: new Set(['mgmtTasks']) }, fn);
  assert.equal(legend.failedCount, 0);
  assert.equal(legend.allZero, true);
});
