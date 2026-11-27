// ── "มาถึงหน้านี้ด้วยการกดย้อนไหม" (historyArrival) — เบราว์เซอร์ปลอม: pathname + ตัวฟัง popstate ─────────────
//
// ⭐ ตัวเดียวที่ทั้งระบบถาม (ตำแหน่งเลื่อน · ตัวกรองที่จำไว้) — ซอร์สตรึงไว้แล้วใน useStickyState.test.mjs
//   ที่นี่ตรึง **พฤติกรรม** ตามลำดับเหตุการณ์จริง (โมดูลถือสถานะระดับไฟล์ ⇒ เดินเรื่องต่อกันในไฟล์เดียว)
import test from 'node:test';
import assert from 'node:assert/strict';

const listeners = [];
const store = new Map();
globalThis.window = {
  location: { pathname: '/home', origin: 'http://localhost' },
  addEventListener: (type, fn) => { if (type === 'popstate') listeners.push(fn); },
  sessionStorage: {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  },
};
const { default: arrivedByHistory, noteReturnTrip } = await import('./historyArrival.js');

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

/* ⭐ คำขอเจ้าของ 27/11/2026: ปุ่ม "← กลับ" บนหน้ารายละเอียด (ลิงก์ ไม่ใช่ popstate) ต้องคืนตัวกรอง/การเรียง
   เหมือนกดย้อนของเบราว์เซอร์ — แต่เฉพาะเมื่อหน้านั้นถูกเปิดมาจากหน้ารายการนั้นจริง */
test('ปุ่มกลับไปหน้ารายการที่เปิดใบนี้มา = กดย้อน (ตัวกรองคืน)', () => {
  assert.equal(arrive('/sa/deals'), false);
  assert.equal(arrive('/sa/deals/D-1'), false, 'เปิดใบจากรายการ = ลิงก์ธรรมดา');
  assert.equal(noteReturnTrip('/sa/deals'), true, 'ใบนี้เปิดมาจาก /sa/deals');
  assert.equal(arrive('/sa/deals'), true, 'กดปุ่มกลับแล้วต้องได้ค่าที่จำไว้');
  assert.equal(arrivedByHistory('/sa/deals'), true, 'ผู้อ่านหลายตัวในรอบเดียวได้คำตอบเดียวกัน');
  assert.equal(arrive('/sa/leads'), false, 'ไปต่อด้วยเมนู = เข้าใหม่');
});

test('ใบที่เปิดมาจากที่อื่น (กระดิ่ง · ลิงก์ในใบอื่น) กดกลับแล้วได้หน้ารายการใหม่', () => {
  assert.equal(arrive('/home'), false);
  assert.equal(arrive('/sa/deals/D-2'), false, 'เปิดใบจากกระดิ่งบนหน้าแรก');
  assert.equal(noteReturnTrip('/sa/deals'), false, 'ผู้เปิดคือ /home ไม่ใช่ /sa/deals');
  assert.equal(arrive('/sa/deals'), false, 'มติ 2026-08-25: ไม่ใช่การย้อน = เริ่มใหม่');
});

test('กดย้อนกลับมาที่ใบเดิมไม่ลบผู้เปิด — รายการ → ใบ A → ใบ B → (ย้อน) ใบ A → กลับ ยังคืนค่า', () => {
  assert.equal(arrive('/sa/quotations'), false);
  assert.equal(arrive('/sa/quotations/Q-1'), false);
  assert.equal(arrive('/sa/deals/D-9'), false);
  pop('/sa/quotations/Q-1');
  assert.equal(arrivedByHistory('/sa/quotations/Q-1'), true);
  assert.equal(noteReturnTrip('/sa/quotations?x=1'), true, 'เทียบที่ pathname ไม่ใช่ query');
  assert.equal(arrive('/sa/quotations'), true);
});

test('กดกลับแล้วไปไม่ถึง (ยามฟอร์มค้างกันไว้) — ธงหมดอายุ ไม่ติดไปกับการเข้าจากเมนูทีหลัง', () => {
  assert.equal(arrive('/sa/contracts'), false);
  assert.equal(arrive('/sa/contracts/C-1'), false);
  assert.equal(noteReturnTrip('/sa/contracts'), true);
  const realNow = Date.now;
  Date.now = () => realNow() + 60_000;
  try {
    assert.equal(arrive('/sa/contracts'), false, 'เกินอายุแล้ว = เข้าใหม่');
  } finally {
    Date.now = realNow;
  }
});

test('ไปหน้าอื่นก่อนถึงปลายทาง — ธงของปุ่มกลับดับ', () => {
  assert.equal(arrive('/sa/leads'), false);
  assert.equal(arrive('/sa/leads/L-1'), false);
  assert.equal(noteReturnTrip('/sa/leads'), true);
  assert.equal(arrive('/sa/deals'), false, 'ปลายทางเปลี่ยน (เช่นกดเมนูอื่นทัน)');
  assert.equal(arrive('/sa/leads'), false, 'ธงต้องไม่ค้างมาถึงตอนเข้าจากเมนูทีหลัง');
});
