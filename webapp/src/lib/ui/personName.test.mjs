// จับคู่ "ชื่อบนช่อง" กลับเป็นบัญชี — ตัวที่ทำให้ projects.aeOwnerId (mig 0190) ตรงคน
import test from 'node:test';
import assert from 'node:assert/strict';
import { personFullName, personIdByName } from './personName.js';

const users = [
  { id: 'u1', name: 'Threerapong Phankam', role: 'ae' },
  { id: 'u2', name: 'Kantima Thadatharakiat', role: 'ae' },
  { id: 'u3', email: 'nobody@example.com', role: 'ac' },   // ไม่มีชื่อ → ใช้อีเมลแทน
  { id: 'u4', name: 'ชื่อซ้ำ ทดสอบ', role: 'ae' },
  { id: 'u5', name: 'ชื่อซ้ำ ทดสอบ', role: 'ac' },
];

test('ชื่อเต็มตรงกัน = ได้ id · ช่องว่าง/ไม่มีในระบบ = null', () => {
  assert.equal(personIdByName(users, 'Threerapong Phankam'), 'u1');
  assert.equal(personIdByName(users, '  Kantima Thadatharakiat  '), 'u2', 'ต้อง trim ก่อนเทียบ');
  assert.equal(personIdByName(users, 'nobody@example.com'), 'u3');
  assert.equal(personIdByName(users, ''), null);
  assert.equal(personIdByName(users, null), null);
  assert.equal(personIdByName([], 'Threerapong Phankam'), null);
});

// 🐞 ที่มาของทั้งเรื่อง: prod เก็บ "Threerapong P." ไว้ในโครงการ 6 ใบ ซึ่งไม่ตรงกับ
// ชื่อบัญชี — ตัวจับคู่ **ต้องไม่เดา** ให้ (การ backfill แบบเดาชื่อย่อทำครั้งเดียว
// ใน migration ที่มีคนตรวจผลได้ ไม่ใช่เดาสด ๆ ทุกครั้งที่มีคนโพสต์)
test('ชื่อย่อไม่จับคู่ให้ และชื่อซ้ำสองบัญชี = null ไม่ใช่เดาเอาตัวแรก', () => {
  assert.equal(personIdByName(users, 'Threerapong P.'), null);
  assert.equal(personIdByName(users, 'ชื่อซ้ำ ทดสอบ'), null);
});

test('personFullName: ไม่มีชื่อให้ถอยไปอีเมล ไม่ใช่คืนค่าว่าง', () => {
  assert.equal(personFullName({ name: ' A B ' }), 'A B');
  assert.equal(personFullName({ email: 'x@y.z' }), 'x@y.z');
  assert.equal(personFullName(null), '');
});
