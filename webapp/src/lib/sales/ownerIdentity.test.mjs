import test from 'node:test';
import assert from 'node:assert/strict';
import { buildOwnerResolver } from './ownerIdentity.js';

const USERS = [
  { id: 'u1', name: 'สมชาย ใจดี', team: 'KA' },
  { id: 'u2', name: 'สมหญิง รักงาน', team: 'ODM' },
];

test('id ตรงบัญชี → ได้ตัวตนพร้อมชื่อ/ทีมปัจจุบัน (ไม่สนชื่อ snapshot)', () => {
  const resolve = buildOwnerResolver(USERS);
  // ดีลเก่าเก็บชื่อก่อนเปลี่ยน — ตัวตนต้องมาจากบัญชี ไม่ใช่ snapshot
  assert.deepEqual(resolve('u1', 'สมชาย ชื่อเก่า'), USERS[0]);
});

test('id เก่า stale → ถอยไปจับด้วยชื่อ normalize (ครอบเว้นวรรค/ตัวพิมพ์)', () => {
  const resolve = buildOwnerResolver(USERS);
  assert.deepEqual(resolve('stale-id', ' สมชาย  ใจดี '), USERS[0]);
  assert.deepEqual(resolve(null, 'สมหญิง รักงาน'), USERS[1]);
});

test('จับไม่ได้เลย (ทั้ง id และชื่อ) → null ให้ผู้เรียก fallback ถัง legacy', () => {
  const resolve = buildOwnerResolver(USERS);
  assert.equal(resolve('stale-id', 'พนักงาน ลาออกแล้ว'), null);
  assert.equal(resolve(null, null), null);
});

test('ชื่อพ้องกันสองบัญชี → ห้ามเดาด้วยชื่อ แต่ id ยังจับได้ตรง ๆ', () => {
  const twins = [
    { id: 'a', name: 'สมชาย ใจดี', team: 'KA' },
    { id: 'b', name: 'สมชาย ใจดี', team: 'ODM' },
  ];
  const resolve = buildOwnerResolver(twins);
  // ชื่อชนกัน — จับด้วยชื่อไม่ได้ (รวมผิดคนแย่กว่าแยกไว้)
  assert.equal(resolve('stale-id', 'สมชาย ใจดี'), null);
  // id ตรงยังใช้ได้ปกติ
  assert.deepEqual(resolve('b', 'สมชาย ใจดี'), twins[1]);
});

test('บัญชีไม่มีชื่อ/ไม่มี id ไม่ทำให้พังและไม่ปนเข้า index', () => {
  const resolve = buildOwnerResolver([{ id: 'u9', name: '' }, { name: 'ไร้ id' }, null]);
  assert.equal(resolve('u9', 'ใคร ก็ได้')?.id, 'u9');
  assert.equal(resolve(null, 'ไร้ id'), null);
});
