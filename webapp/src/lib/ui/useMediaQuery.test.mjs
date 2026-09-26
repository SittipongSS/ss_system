// ── `useMediaQuery` — ความกว้างจอตัดสินใน JS ด้วยเส้นเดียวกับ CSS (แผน §10.5 จอหน้างานแบบ A · แผนลงมือ §3.1) ──
//
// ⭐ จอหน้างานสลับ "สองหน้า ↔ สองบาน" ที่ 1000px และรางหัวหน้าที่ 1200px ใน JS (โครงต้นไม้เดียว หมุน
//   แท็บเล็ตแล้วหน้าพื้นที่ไม่ถูกสร้างใหม่) ⇒ ตัวอ่านต้อง (1) ฝั่ง server ตอบ false เสมอ (2) ฟังชุดเดียวต่อ
//   หนึ่งเงื่อนไข ไม่ผูกใหม่ทุกรอบวาด (3) ไม่มี `matchMedia` = ไม่ระเบิด
import test from 'node:test';
import assert from 'node:assert/strict';
import { mediaQueryStore } from './useMediaQuery.js';

function fakeWindow(matches) {
  const listeners = new Set();
  const lists = [];
  return {
    listeners,
    lists,
    matchMedia(query) {
      const list = {
        query,
        get matches() { return matches(query); },
        addEventListener: (type, fn) => { if (type === 'change') listeners.add(fn); },
        removeEventListener: (type, fn) => { if (type === 'change') listeners.delete(fn); },
      };
      lists.push(list);
      return list;
    },
  };
}

test('อ่านค่าจริงของเบราว์เซอร์ · ฝั่ง server = false เสมอ (หน้าเป็นโครงรอข้อมูลอยู่แล้ว ไม่มีจังหวะกะพริบ)', () => {
  const saved = globalThis.window;
  try {
    globalThis.window = fakeWindow((q) => q === '(min-width: 1000px)');
    assert.equal(mediaQueryStore('(min-width: 1000px)').read(), true);
    assert.equal(mediaQueryStore('(min-width: 1200px)').read(), false);
    assert.equal(mediaQueryStore('(min-width: 1000px)').readOnServer(), false);
  } finally {
    globalThis.window = saved;
  }
});

test('หนึ่งเงื่อนไข = ตัวฟังชุดเดียว (ฟังก์ชันตัวเดิมทุกรอบวาด) · เลิกฟังแล้วถอดจริง', () => {
  const saved = globalThis.window;
  try {
    const win = fakeWindow(() => false);
    globalThis.window = win;
    const a = mediaQueryStore('(min-width: 680px)');
    assert.equal(mediaQueryStore('(min-width: 680px)'), a,
      'useSyncExternalStore ผูกใหม่ทุกครั้งที่ subscribe เปลี่ยนตัว — ต้องเป็นตัวเดิม');
    const onChange = () => {};
    const stop = a.subscribe(onChange);
    assert.equal(win.listeners.has(onChange), true);
    stop();
    assert.equal(win.listeners.has(onChange), false);
  } finally {
    globalThis.window = saved;
  }
});

test('ไม่มี window / matchMedia (server · เบราว์เซอร์เก่า) = false และไม่ระเบิด', () => {
  const saved = globalThis.window;
  try {
    delete globalThis.window;
    const store = mediaQueryStore('(min-width: 999999px)');
    assert.equal(store.read(), false);
    assert.equal(typeof store.subscribe(() => {}), 'function');
    globalThis.window = {};
    assert.equal(store.read(), false);
  } finally {
    globalThis.window = saved;
  }
});
