import test from 'node:test';
import assert from 'node:assert/strict';
import { accessState } from './accessGate.js';

test('ยังไม่รู้ว่าใครเข้ามา = loading เสมอ ห้ามฟ้องว่าไม่มีสิทธิ์', () => {
  // RoleContext ตั้งต้น null และ AppLayout เซ็ต role หลัง network — ถ้าเผลอตัดสินตอนนี้
  // แอดมินตัวจริงจะเห็นจอ "ไม่มีสิทธิ์" แวบทุกครั้งที่เปิดหน้า
  assert.equal(accessState(null, false), 'loading');
  assert.equal(accessState(undefined, false), 'loading');
  assert.equal(accessState('', true), 'loading');
  assert.equal(accessState('   ', false), 'loading');
});

test('รู้ว่าใครเข้ามาแล้วค่อยตัดสิน', () => {
  assert.equal(accessState('admin', true), 'allowed');
  assert.equal(accessState('ae', false), 'denied');
});
