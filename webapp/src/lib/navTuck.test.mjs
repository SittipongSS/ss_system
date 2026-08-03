import test from 'node:test';
import assert from 'node:assert/strict';
import { nextNavTuck, NAV_REVEAL_AT, NAV_TUCK_AFTER, NAV_DEADZONE } from './navTuck.js';

/** ป้อนตำแหน่งเลื่อนเป็นลำดับ เหมือนที่เหตุการณ์ scroll ยิงเข้ามาจริง */
function play(positions, start = { tucked: false, lastY: 0 }) {
  let s = start;
  for (const y of positions) s = nextNavTuck({ y, lastY: s.lastY, tucked: s.tucked });
  return s;
}

test('ใกล้บนสุดต้องเห็นเมนูเสมอ แม้กำลังเลื่อนลง', () => {
  assert.equal(play([0]).tucked, false);
  assert.equal(play([NAV_REVEAL_AT]).tucked, false);
  // หุบอยู่แล้วแต่เลื่อนกลับมาบนสุด ต้องคลี่คืน
  assert.equal(nextNavTuck({ y: 0, lastY: 900, tucked: true }).tucked, false);
});

test('เลื่อนลงพ้น 72px แล้วหุบ', () => {
  assert.equal(play([40, 120]).tucked, true);
  assert.equal(play([200, 600]).tucked, true);
});

test('เลื่อนลงแต่ยังไม่พ้น 72px ยังไม่หุบ — ไม่งั้นหุบทั้งที่ยังเห็นหัวหน้าอยู่', () => {
  const s = play([20, 40, 60]);
  assert.equal(s.tucked, false, `ที่ y=60 (< ${NAV_TUCK_AFTER}) ยังไม่ควรหุบ`);
});

test('⭐ เลื่อนขึ้นแล้วคลี่คืนทันที', () => {
  const down = play([40, 300]);
  assert.equal(down.tucked, true);
  const up = nextNavTuck({ y: 260, lastY: down.lastY, tucked: down.tucked });
  assert.equal(up.tucked, false);
});

test('⭐ deadzone กันแถบสั่น — ขยับน้อยกว่า 4px ไม่เปลี่ยนสถานะ', () => {
  const tucked = play([40, 300]);
  assert.equal(tucked.tucked, true);
  // ขยับขึ้น 3px (น้อยกว่า deadzone) ต้องยังหุบอยู่
  const jitter = nextNavTuck({ y: 297, lastY: tucked.lastY, tucked: true });
  assert.equal(jitter.tucked, true);
  assert.equal(jitter.lastY, tucked.lastY, 'lastY ต้องไม่ขยับ เพื่อให้ระยะสะสมต่อได้');
});

test('⭐ เลื่อนช้า ๆ ทีละ 1px ต้องสะสมได้ ไม่ใช่ไม่มีผลตลอดกาล', () => {
  // 🐞 ถ้า lastY อัปเดตทุกครั้งแม้อยู่ใน deadzone การเลื่อนทีละ 1px จะไม่ถึงเกณฑ์เลย
  let s = { tucked: false, lastY: 100 };
  for (let y = 101; y <= 104; y += 1) s = nextNavTuck({ y, lastY: s.lastY, tucked: s.tucked });
  assert.equal(s.tucked, true, `สะสมครบ ${NAV_DEADZONE}px แล้วต้องมีผล`);
});

test('เลื่อนขึ้นช้า ๆ ก็ต้องสะสมได้เหมือนกัน', () => {
  let s = { tucked: true, lastY: 400 };
  for (let y = 399; y >= 396; y -= 1) s = nextNavTuck({ y, lastY: s.lastY, tucked: s.tucked });
  assert.equal(s.tucked, false);
});

test('อยู่นิ่ง ๆ ไม่เปลี่ยนสถานะ (เหตุการณ์ scroll ซ้ำที่ตำแหน่งเดิม)', () => {
  const a = nextNavTuck({ y: 500, lastY: 500, tucked: true });
  assert.equal(a.tucked, true);
  const b = nextNavTuck({ y: 500, lastY: 500, tucked: false });
  assert.equal(b.tucked, false);
});

test('🔴 วงจรป้อนกลับ: การหุบทำให้เบราว์เซอร์ขยับ scroll เอง แล้วถูกอ่านว่า "ผู้ใช้เลื่อนขึ้น"', () => {
  /* อาการที่ผู้ใช้เจอ: "พอ scroll น้อยมันจะกระพริบ"
     หุบ → header เตี้ยลง 44px → เอกสารเตี้ยลง → เบราว์เซอร์ขยับ scrollTop ชดเชย
     (scroll anchoring หรือการ clamp ท้ายเอกสาร) → เกิด scroll event ที่ dy = −44
     → ตัวจัดการอ่านว่าเลื่อนขึ้น → คลี่ → เอกสารสูงขึ้น → ขยับกลับ → หุบ → วนไม่จบ */
  const ROW = 44;
  let s = { tucked: false, lastY: 0 };
  const flips = [];
  let y = 0;
  for (let i = 0; i < 6; i += 1) {
    const before = s.tucked;
    s = nextNavTuck({ y, lastY: s.lastY, tucked: s.tucked, settling: s.settling });
    if (s.tucked !== before) {
      flips.push(`${before}→${s.tucked} ที่ y=${y}`);
      // เบราว์เซอร์ขยับ scroll ชดเชยความสูงที่เปลี่ยน แล้วยิง scroll event อีกครั้ง
      y += s.tucked ? -ROW : ROW;
    } else {
      y += 80; // ผู้ใช้เลื่อนลงต่อ
    }
  }
  assert.ok(flips.length <= 2,
    `สลับสถานะ ${flips.length} ครั้งจากการเลื่อนลงทางเดียว = กระพริบ: ${flips.join(' · ')}`);
});

test('ผู้ใช้เลื่อนขึ้นจริงหลังการชดเชย ยังต้องคลี่ให้', () => {
  // กันไม่ให้ตัวกัน "การขยับที่เราทำให้เกิดเอง" ไปกลืนเจตนาจริงของผู้ใช้
  let s = nextNavTuck({ y: 300, lastY: 0, tucked: false });
  assert.equal(s.tucked, true);
  s = nextNavTuck({ y: 256, lastY: s.lastY, tucked: s.tucked, settling: s.settling }); // การชดเชย
  assert.equal(s.tucked, true, 'การชดเชยของเบราว์เซอร์ต้องไม่ทำให้คลี่');
  s = nextNavTuck({ y: 200, lastY: s.lastY, tucked: s.tucked, settling: s.settling }); // ผู้ใช้เลื่อนขึ้นจริง
  assert.equal(s.tucked, false, 'ผู้ใช้เลื่อนขึ้นจริงต้องคลี่');
});
