import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deptRequestsTodoCount, myTasksTodoCount, pruneZeroCounts, requestsTodoCount,
} from './navCounts.js';

const req = (over = {}) => ({
  id: 'r1', status: 'pending', dept: 'PC', kind: 'inquiry', _mine: false, ...over,
});

test('เลขบนเมนูคำร้อง = ใบที่รอฝ่ายฉันตอบ ไม่ใช่ทุกใบที่มองเห็น', () => {
  const rows = [
    req({ id: 'a', dept: 'PC' }),                       // รอฝ่ายฉัน
    req({ id: 'b', dept: 'RD' }),                       // ฝ่ายอื่น
    req({ id: 'c', dept: 'PC', status: 'draft', _mine: true }), // ร่างของฉัน ยังไม่ส่ง
  ];
  assert.equal(requestsTodoCount(rows, ['PC']), 1);
});

test('ร่างของตัวเองไม่นับ — ไม่งั้นเลขบนเมนูบวกซ้ำกับแท็บ "ที่ฉันเปิด"', () => {
  const rows = [req({ status: 'draft', _mine: true, dept: 'PC' })];
  assert.equal(requestsTodoCount(rows, ['PC']), 0);
});

// 🐞 ผู้ใช้ถามเอง 2026-08-12 — เมนูคำร้องไม่ขึ้นป้ายเลย ทั้งที่กดเข้าไปแล้วการ์ด
// "เริ่มที่นี่" ชี้ใบตีกลับให้แก้อยู่ตรงหน้า · ใบตีกลับเป็น `draft` ⇒ ตกด่านบรรทัดบน
test('⭐ ใบของฉันที่ถูกตีกลับต้องนับ — มันรอเราแก้อยู่ ไม่ใช่ร่างที่ยังไม่ได้ส่ง', () => {
  const bounced = req({ status: 'draft', _mine: true, dept: 'PC', bouncedAt: '2026-08-08T03:00:00Z' });
  assert.equal(requestsTodoCount([bounced], ['PC']), 1);
  // ไม่มีฝ่ายที่ตอบได้ก็ยังนับ — ใบนี้รอ **ผู้ขอ** ไม่ได้รอฝ่าย
  assert.equal(requestsTodoCount([bounced], []), 1);
  // ของเพื่อนร่วมทีมไม่ใช่ของค้างของเรา
  assert.equal(requestsTodoCount([{ ...bounced, _mine: false }], ['PC']), 0);
  // ส่งใหม่แล้วไม่ใช่ใบตีกลับอีก — นับเป็นใบที่รอฝ่ายตามปกติ ไม่ใช่นับสองรอบ
  assert.equal(requestsTodoCount([{ ...bounced, status: 'pending' }], ['PC']), 1);
});

// ── ยอดรวมรายระบบ (การ์ดหน้าแรก + เมนูสลับระบบ) ───────────────────────────
test('⭐ ทุกเมนูที่มีป้าย ต้องอยู่ในระบบใดระบบหนึ่งเสมอ', async () => {
  const { NAV_COUNT_KEYS, SYSTEM_COUNT_HREFS } = await import('./useNavCounts.js');
  // เมนูที่ตกสำรวจ = ป้ายขึ้นบนเมนู แต่การ์ดหน้าแรกยังโล่ง ⇒ คนสรุปว่าระบบนั้นว่าง
  const claimed = Object.values(SYSTEM_COUNT_HREFS).flat();
  assert.deepEqual(
    Object.keys(NAV_COUNT_KEYS).filter((href) => !claimed.includes(href)),
    [],
    'มี href ใน NAV_COUNT_KEYS ที่ไม่มีระบบไหนนับ',
  );
  // และห้ามนับซ้ำสองระบบ — ยอดรวมจะเกินจริง
  assert.equal(new Set(claimed).size, claimed.length);
});

test('ยอดรวมของระบบ = ผลบวกของเมนูในระบบนั้น · ศูนย์/ไม่มีสิทธิ์ = ไม่มีป้าย', async () => {
  const { navCountForSystem } = await import('./useNavCounts.js');
  // คีย์ที่ผู้ใช้ไม่มีสิทธิ์เห็นไม่ถูกส่งมาเลย (ดู api/nav/counts) — ตัวที่ขาดต้องนับเป็น 0
  assert.equal(navCountForSystem({ leads: 21, requests: 2 }, 'salesplan'), 23);
  assert.equal(navCountForSystem({ rdRequests: 16 }, 'rd'), 16);
  assert.equal(navCountForSystem({ rdRequests: 16 }, 'salesplan'), null);
  assert.equal(navCountForSystem({}, 'salesplan'), null);
  // ระบบที่ยังไม่มีเมนูมีป้ายสักตัว — ต้องเงียบ ไม่ใช่ 0
  assert.equal(navCountForSystem({ leads: 21 }, 'tax'), null);
});

test('ไม่มีฝ่ายที่ตอบได้ = ไม่มีอะไรรอเรา', () => {
  assert.equal(requestsTodoCount([req({ dept: 'PC' })], []), 0);
});

test('คิวของฝ่าย (RD) นับเฉพาะใบที่ยังรอฝ่ายนั้นตอบ', () => {
  const rows = [
    req({ id: 'a', dept: 'RD' }),
    req({ id: 'b', dept: 'PC' }),
  ];
  assert.equal(deptRequestsTodoCount(rows, 'RD'), 1);
  assert.equal(deptRequestsTodoCount(rows, null), 0);
});

test('งานของฉัน = ยังไม่เสร็จ + ฉันเป็นผู้รับผิดชอบ (งานที่ฉันมอบให้คนอื่นไม่นับ)', () => {
  const me = 'u1';
  const tasks = [
    { id: '1', status: 'Pending', assigneeId: me },              // ต้องทำ
    { id: '2', status: 'Completed', assigneeId: me },            // เสร็จแล้ว
    { id: '3', status: 'Pending', ownerId: me, assigneeId: 'u2' }, // ฉันมอบให้คนอื่น
    { id: '4', status: 'InProgress', proxyBy: me, assigneeId: 'u2' }, // ฉันดึงมาทำแทน
  ];
  assert.equal(myTasksTodoCount(tasks, me), 2);
});

test('ค่าศูนย์ถูกตัดทิ้ง — เมนูที่ไม่มีอะไรค้างต้องไม่มีป้าย', () => {
  assert.deepEqual(pruneZeroCounts({ requests: 3, tasks: 0, leads: 0 }), { requests: 3 });
});
