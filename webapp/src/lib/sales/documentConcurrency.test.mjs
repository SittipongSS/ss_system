import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveExpectedUpdatedAt } from './documentConcurrency.js';

test('workflow actions require the document version the tab actually saw', () => {
  // เคสแท็บค้าง: หน้าเว็บถือค่าเก่า → ส่งเข้า RPC ตรง ๆ ให้ RPC เป็นผู้ตัดสินว่า stale
  const stale = resolveExpectedUpdatedAt({ expectedUpdatedAt: '2026-07-25T20:49:14.840307+00:00' });
  assert.equal(stale.ok, true);
  assert.equal(stale.value, '2026-07-25T20:49:14.840307+00:00');

  // ไม่ส่งมา = คำขอที่ข้ามด่านไม่ได้ (เดิม route เติม updatedAt ของตัวเองให้ = ด่าน no-op)
  for (const body of [{}, { expectedUpdatedAt: '' }, { expectedUpdatedAt: null }, undefined]) {
    const missing = resolveExpectedUpdatedAt(body);
    assert.equal(missing.ok, false);
    assert.match(missing.error, /โหลดหน้าใหม่/);
  }

  for (const bad of ['เมื่อวาน', '2026-13-45', 12345, {}]) {
    assert.equal(resolveExpectedUpdatedAt({ expectedUpdatedAt: bad }).ok, false);
  }
});

test('microsecond precision survives — normalizing it would break every action', () => {
  const micro = '2026-07-26T02:38:13.867067+00:00';
  const { value } = resolveExpectedUpdatedAt({ expectedUpdatedAt: micro });
  assert.equal(value, micro);
  assert.notEqual(value, new Date(micro).toISOString());
  // ช่องว่างรอบค่า trim ได้ แต่ตัวเลขห้ามเพี้ยน
  assert.equal(resolveExpectedUpdatedAt({ expectedUpdatedAt: ` ${micro} ` }).value, micro);
});
