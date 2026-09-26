// ── "มาถึงหน้านี้ด้วยการกดย้อนไหม" (historyArrival) — เบราว์เซอร์ปลอม: pathname + ตัวฟัง popstate ─────────────
//
// ⭐ ตัวเดียวที่ทั้งระบบถาม (ตำแหน่งเลื่อน · ตัวกรองที่จำไว้) — ซอร์สตรึงไว้แล้วใน useStickyState.test.mjs
//   ที่นี่ตรึง **พฤติกรรม** ตามลำดับเหตุการณ์จริง (โมดูลถือสถานะระดับไฟล์ ⇒ เดินเรื่องต่อกันในไฟล์เดียว)
import test from 'node:test';
import assert from 'node:assert/strict';

const listeners = [];
globalThis.window = {
  location: { pathname: '/home' },
  addEventListener: (type, fn) => { if (type === 'popstate') listeners.push(fn); },
};
const { default: arrivedByHistory } = await import('./historyArrival.js');

/* ย้อน/เดินหน้า = เบราว์เซอร์เปลี่ยน URL แล้วยิง popstate · ลิงก์ = pushState (ไม่มี popstate) แล้วผู้อ่านถามตอน pathname เปลี่ยน */
const pop = (path) => { window.location.pathname = path; listeners.forEach((fn) => fn()); };
const arrive = (path) => { window.location.pathname = path; return arrivedByHistory(path); };

test('🐞 UAT 25/09 ย้อนในหน้าเดียวกัน (จอหน้างาน: ‹ พื้นที่ทั้งหมด · ปุ่มย้อนจากหน้าพื้นที่) ไม่ติดธงให้ลิงก์ถัดไป', () => {
  assert.equal(arrive('/home'), false);
  assert.equal(arrive('/service/surveys/DR-1'), false);
  pop('/service/surveys/DR-1');
  pop('/service/surveys/DR-1');
  assert.equal(arrive('/sa/deals'), false,
    'เดิม: ธงค้างจาก popstate ในหน้าเดียวกัน ⇒ เมนูล่างไปหน้าอื่นได้ตำแหน่งเลื่อน/ตัวกรองเก่า');
});

test('ย้อนข้ามหน้ายังนับเป็นการกดย้อน — และธงเคลียร์เมื่อไปต่อด้วยลิงก์', () => {
  pop('/service/surveys/DR-1');
  assert.equal(arrivedByHistory('/service/surveys/DR-1'), true);
  assert.equal(arrivedByHistory('/service/surveys/DR-1'), true, 'ผู้อ่านหลายตัวในรอบเดียวได้คำตอบเดียวกัน');
  assert.equal(arrive('/sa/leads'), false);
  pop('/sa/deals');
  pop('/service/surveys/DR-1');
  assert.equal(arrivedByHistory('/service/surveys/DR-1'), true, 'ย้อนสองครั้งติดก่อนผู้อ่านทัน = ยังนับ');
});
