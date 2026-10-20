import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MISSING_JUMP_WAIT_MS, createMissingJump } from './missingJump.js';

/* ══ ปุ่ม "ยังขาด" พาไปถึงช่อง — จังหวะเลื่อน (รีวิว UAT S4 รอบ 4 ข้อ 9) ══════════════════════════════════════
   🐞 เดิมเลื่อนใน `setTimeout(0)` ทันที ⇒ กดจากแท็บอื่น บล็อกสถานที่เกิดใหม่แล้วไทล์ไซต์มาทีหลังเหนือบล็อกไฟล์แบบ
      ดันบล็อกตกขอบจอ · เทสต์ใช้นาฬิกาปลอม — ไม่มีเบราว์เซอร์ ไม่มีเวลาจริง */
function fakeTimers() {
  let now = 0;
  let seq = 0;
  const queue = new Map(); // id → { at, fn }
  return {
    setTimeout(fn, ms = 0) { seq += 1; queue.set(seq, { at: now + ms, fn, seq }); return seq; },
    clearTimeout(id) { queue.delete(id); },
    /** เดินนาฬิกาไปข้างหน้า แล้วรันทุกตัวที่ถึงเวลา ตามลำดับเวลา→ลำดับที่ตั้ง */
    advance(ms = 0) {
      const until = now + ms;
      for (;;) {
        const due = [...queue.entries()].filter(([, t]) => t.at <= until)
          .sort((a, b) => a[1].at - b[1].at || a[1].seq - b[1].seq)[0];
        if (!due) break;
        queue.delete(due[0]);
        now = due[1].at;
        due[1].fn();
      }
      now = until;
    },
  };
}

const setup = () => {
  const timers = fakeTimers();
  const scrolled = [];
  const jump = createMissingJump({ scroll: (anchor) => scrolled.push(anchor), timers });
  return { timers, scrolled, jump };
};

test('บล็อกเหนือที่หมายนิ่งแล้ว (แท็บเปิดอยู่แล้ว / ไม่มีบล็อกสถานที่) — เลื่อนจังหวะถัดไปครั้งเดียว', () => {
  const { timers, scrolled, jump } = setup();
  jump.jump('req-required-files', { ready: () => true });
  assert.deepEqual(scrolled, [], 'ยังไม่เลื่อนในคลิกเดียวกัน — รอแท็บใหม่ลง DOM ก่อน');
  timers.advance(0);
  assert.deepEqual(scrolled, ['req-required-files']);
  timers.advance(MISSING_JUMP_WAIT_MS * 2);
  assert.deepEqual(scrolled, ['req-required-files'], 'เพดานเวลาต้องถูกยกเลิก — ไม่เลื่อนซ้ำ');
});

test('🔴 กดจากแท็บอื่น: ไทล์สถานที่ยังไม่มา = ยังไม่เลื่อน · เลื่อนหลังบล็อกสถานที่บอกว่าจบ (ตัวที่รีวิวจับได้)', () => {
  const { timers, scrolled, jump } = setup();
  let settled = false;
  jump.jump('req-required-files', { ready: () => settled });
  timers.advance(0);
  assert.deepEqual(scrolled, [], 'เลื่อนตอนนี้ = เลื่อนก่อนไทล์มา แล้วบล็อกถูกดันตกจอ');
  timers.advance(400);
  assert.deepEqual(scrolled, []);
  // ลิสต์ไซต์ + ทะเบียนพื้นที่มาแล้ว (หรือพังทั้งคู่ — นับว่าจบเหมือนกัน)
  settled = true;
  jump.settled();
  assert.deepEqual(scrolled, [], 'ยังรอให้ไทล์ที่เพิ่งมาลง DOM ก่อนหนึ่งจังหวะ');
  timers.advance(0);
  assert.deepEqual(scrolled, ['req-required-files']);
  timers.advance(MISSING_JUMP_WAIT_MS * 2);
  assert.deepEqual(scrolled, ['req-required-files'], 'เลื่อนครั้งเดียว — เพดานเวลาไม่ยิงซ้ำ');
});

test('🔴 คำขอค้าง (apiFetch ไม่มีเพดานเวลา) — ครบเพดานแล้วเลื่อนเลย ปุ่มไม่เงียบถาวร · จบทีหลังไม่เลื่อนซ้ำ', () => {
  const { timers, scrolled, jump } = setup();
  jump.jump('req-required-files', { ready: () => false });
  timers.advance(MISSING_JUMP_WAIT_MS - 1);
  assert.deepEqual(scrolled, []);
  timers.advance(1);
  assert.deepEqual(scrolled, ['req-required-files']);
  jump.settled();
  timers.advance(0);
  assert.deepEqual(scrolled, ['req-required-files'], 'โหลดจบหลังเลื่อนไปแล้ว = ไม่กระชากจออีกรอบ');
});

test('บล็อกจบก่อนจังหวะถัดไปของปุ่ม (ไม่มีลูกค้า = จบทันทีตอนเกิด) — เลื่อนครั้งเดียว ไม่ใช่สองครั้ง', () => {
  const { timers, scrolled, jump } = setup();
  let settled = false;
  jump.jump('req-required-files', { ready: () => settled });
  settled = true;
  jump.settled(); // effect ของบล็อกที่เพิ่งเกิด รายงานก่อนตัวจับเวลาของปุ่ม
  timers.advance(0);
  assert.deepEqual(scrolled, ['req-required-files']);
});

test('ไม่มีที่หมาย (ช่องขาดที่ไม่ใช่บล็อกไฟล์) = ไม่เลื่อน และทิ้งการเลื่อนที่ค้างของปุ่มก่อน', () => {
  const { timers, scrolled, jump } = setup();
  jump.jump('req-required-files', { ready: () => false });
  jump.jump(null);
  jump.settled();
  timers.advance(MISSING_JUMP_WAIT_MS * 2);
  assert.deepEqual(scrolled, []);
});

test('คนสลับแท็บเองระหว่างรอ (`cancel`) — บล็อกโหลดเสร็จทีหลังต้องไม่กระชากจอ · เพดานเวลาก็ไม่ยิง', () => {
  const { timers, scrolled, jump } = setup();
  jump.jump('req-required-files', { ready: () => false });
  timers.advance(0);
  jump.cancel();
  jump.settled();
  timers.advance(MISSING_JUMP_WAIT_MS * 2);
  assert.deepEqual(scrolled, []);
});

test('กดซ้ำระหว่างรอ — เลื่อนไปที่หมายล่าสุดครั้งเดียว', () => {
  const { timers, scrolled, jump } = setup();
  let settled = false;
  jump.jump('a', { ready: () => settled });
  timers.advance(100);
  jump.jump('b', { ready: () => settled });
  settled = true;
  jump.settled();
  timers.advance(MISSING_JUMP_WAIT_MS * 2);
  assert.deepEqual(scrolled, ['b']);
});
