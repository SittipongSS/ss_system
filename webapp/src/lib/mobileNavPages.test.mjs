import test from 'node:test';
import assert from 'node:assert/strict';
import { paginateMobileNav, pageIndexOfActive, MOBILE_NAV_SLOTS } from './mobileNavPages.js';

const names = (pages) => pages.map((p) => p.map((x) => (x ? x.n : '·')).join(','));
const mk = (n) => Array.from({ length: n }, (_, i) => ({ n: `m${i + 1}` }));

test('เมนูไม่เกิน 5 ตัว = หน้าเดียว ไม่เติมช่องว่าง (5 ใน 7 ระบบเป็นแบบนี้)', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    const pages = paginateMobileNav(mk(n));
    assert.equal(pages.length, 1, `${n} เมนูต้องได้หน้าเดียว`);
    assert.equal(pages[0].length, n, 'หน้าเดียวห้ามเติมช่องว่าง — ปุ่มจะแคบลงโดยไม่จำเป็น');
  }
});

test('⭐ แบ่งสมดุล ไม่ใช่เต็มหน้าแรกก่อน — ฐานข้อมูล 7 เมนูต้องเป็น 4+3 ไม่ใช่ 5+2', () => {
  // วัดจริง 2026-08-02: แบ่ง 5+2 ทำให้หน้าสองโล่ง 3 ช่อง ดูเหมือนแถบพัง
  assert.deepEqual(names(paginateMobileNav(mk(7))), ['m1,m2,m3,m4', 'm5,m6,m7,·']);
  assert.deepEqual(names(paginateMobileNav(mk(6))), ['m1,m2,m3', 'm4,m5,m6']);
  // ระบบขาย 9 เมนู = 5+4
  assert.deepEqual(names(paginateMobileNav(mk(9))), ['m1,m2,m3,m4,m5', 'm6,m7,m8,m9,·']);
});

test('⭐ ทุกหน้ามีจำนวนช่องเท่ากัน — ไม่งั้นปุ่มเปลี่ยนขนาดตอนปัดข้ามหน้า', () => {
  for (const n of [6, 7, 8, 9, 10, 11, 13]) {
    const pages = paginateMobileNav(mk(n));
    const widths = new Set(pages.map((p) => p.length));
    assert.equal(widths.size, 1, `${n} เมนู: หน้ามีช่องไม่เท่ากัน (${[...widths].join('/')})`);
    assert.ok(pages[0].length <= MOBILE_NAV_SLOTS, `${n} เมนู: หน้าหนึ่งเกิน ${MOBILE_NAV_SLOTS} ช่อง`);
  }
});

test('เมนูทุกตัวต้องอยู่บนแถบ ห้ามหล่นหาย — นี่คือเงื่อนไขหลักของมติผู้ใช้', () => {
  for (const n of [1, 4, 5, 7, 9, 12]) {
    const flat = paginateMobileNav(mk(n)).flat().filter(Boolean).map((x) => x.n);
    assert.deepEqual(flat, mk(n).map((x) => x.n), `${n} เมนู: มีเมนูหล่นหายหรือสลับลำดับ`);
  }
});

test('รายการว่างไม่ได้หน้าเปล่า — ผู้ใช้บางฝ่ายไม่มีเมนูในบางระบบ', () => {
  assert.deepEqual(paginateMobileNav([]), []);
  assert.deepEqual(paginateMobileNav(null), []);
});

test('🔴 หาหน้าที่มีเมนูที่กำลังเปิดอยู่ — "งานของฉัน" เป็นตัวที่ 9 = อยู่หน้า 2', () => {
  // ถ้าไม่เลื่อนไปหน้านั้นตอนเข้าหน้าใหม่ ผู้ใช้จะเปิดมาเห็นหน้าที่ไม่มีปุ่มของตัวเอง
  const pages = paginateMobileNav(mk(9));
  assert.equal(pageIndexOfActive(pages, (x) => x.n === 'm9'), 1);
  assert.equal(pageIndexOfActive(pages, (x) => x.n === 'm1'), 0);
  // ไม่เจอ = อยู่หน้าแรกไว้ก่อน (เช่นเปิดหน้าที่ไม่ได้อยู่ในเมนู)
  assert.equal(pageIndexOfActive(pages, () => false), 0);
});
