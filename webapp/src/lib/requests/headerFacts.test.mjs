// หัวใบคำร้อง — ช่องไหนขึ้นเมื่อไร และเวลาถูกอ่านเป็นคำว่าอะไร
//
// ⚠️ เคสในไฟล์นี้มาจากของจริงที่ผู้ใช้แจ้งเองสองรอบ:
//   IS-26080003 — ใบที่มีบรรทัดไม่เคยโชว์ลูกค้า (ม-98)
//   ม-101       — สองวันกำหนดสลับกันใช้ช่องเดียว ⇒ เทียบกันไม่ได้
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ageLabel, committedVsRequested, countdownLabel, requestHeaderFacts, requestHeaderPeople,
} from './headerFacts.js';

const NOW = new Date('2026-08-11T09:00:00+07:00');

const base = {
  dept: 'RD',
  requestedByName: 'Panuwat Hongloylom',
  team: 'SV',
  customerName: 'สปาฟินเเลนด์',
  refCustomer: { id: 'CUS-1', arCode: 'AR-899' },
  submittedAt: '2026-08-10T12:09:12.347+00:00',
  requestedDueDate: '2026-08-18',
};

const keys = (facts) => facts.map((f) => f.key);
const byKey = (facts, key) => facts.find((f) => f.key === key);

// ── แถบข้อเท็จจริง = เรื่องเวลาล้วน ──────────────────────────────────────
test('แถบข้อเท็จจริงไม่มีลูกค้าและไม่มีคนแล้ว — สองอย่างนั้นอยู่บรรทัดบน (ม-101)', () => {
  const facts = requestHeaderFacts(base, { now: NOW });
  for (const gone of ['customer', 'contact', 'requester', 'created']) {
    assert.equal(keys(facts).includes(gone), false, `${gone} ต้องไม่อยู่ในแถบแล้ว`);
  }
  assert.deepEqual(keys(facts), ['submitted', 'requestedDue', 'committedDue']);
});

test('สองวันกำหนดอยู่คู่กันเสมอ แม้ฝ่ายยังไม่รับปาก', () => {
  const facts = requestHeaderFacts(base, { now: NOW });
  assert.equal(byKey(facts, 'requestedDue').value, '18/08/2026');
  const committed = byKey(facts, 'committedDue');
  assert.equal(committed.label, 'RD กำหนดส่ง');
  // ⚠️ ห้ามเป็นขีด — ขีดอ่านได้ทั้ง "ไม่มีกำหนด" และ "ระบบไม่รู้"
  assert.equal(committed.value, 'ยังไม่ระบุ');
  assert.equal(committed.sub, 'ระบุตอนกดรับเรื่อง');
});

test('รับปากวันแล้ว — บอกด้วยว่าเทียบกับที่ขอแล้วเป็นยังไง', () => {
  const facts = requestHeaderFacts(
    { ...base, requestedDueDate: '2026-08-14', committedDueDate: '2026-08-13' }, { now: NOW },
  );
  const committed = byKey(facts, 'committedDue');
  assert.equal(committed.value, '13/08/2026');
  assert.equal(committed.sub, 'เร็วกว่าที่ขอ 1 วัน');
  assert.equal(committed.tone, 'ok');
});

test('ฝ่ายให้วันช้ากว่าที่ขอ = ทาสีเตือน ไม่ใช่ปล่อยผ่านเงียบ ๆ', () => {
  const facts = requestHeaderFacts(
    { ...base, requestedDueDate: '2026-08-14', committedDueDate: '2026-08-20' }, { now: NOW },
  );
  assert.equal(byKey(facts, 'committedDue').sub, 'ช้ากว่าที่ขอ 6 วัน');
  assert.equal(byKey(facts, 'committedDue').tone, 'late');
});

test('ช่อง "ส่งเมื่อ" ใช้วันที่ส่ง ไม่ใช่วันที่สร้าง · ร่างที่ยังไม่ส่งบอกตรง ๆ', () => {
  assert.equal(byKey(requestHeaderFacts(base, { now: NOW }), 'submitted').value, '10/08/2026');
  const draft = byKey(requestHeaderFacts({ ...base, submittedAt: null }, { now: NOW }), 'submitted');
  assert.equal(draft.value, 'ยังไม่ได้ส่ง');
});

test('ตอบแล้ว X/Y ขึ้นเฉพาะใบที่มีบรรทัด · ด่วนขึ้นเฉพาะใบที่ติ๊กด่วน', () => {
  const plain = keys(requestHeaderFacts(base, { now: NOW }));
  assert.equal(plain.includes('progress'), false);
  assert.equal(plain.includes('urgent'), false);

  const rich = keys(requestHeaderFacts(
    { ...base, urgent: true, urgentReason: 'ลูกค้านัดประชุม 18/8' },
    { hasItems: true, progress: { done: 0, total: 3 }, now: NOW },
  ));
  assert.deepEqual(rich, ['submitted', 'progress', 'urgent', 'requestedDue', 'committedDue']);
});

test('ไม่มีใบ = ไม่มีช่อง (หน้าจอเรนเดอร์ก่อนโหลดเสร็จได้)', () => {
  assert.deepEqual(requestHeaderFacts(null, {}), []);
  assert.equal(requestHeaderPeople(null), null);
});

// ── ชิปคนสองฝั่ง ────────────────────────────────────────────────────────
test('ใบของเพื่อนร่วมทีมโชว์ชื่อผู้ยื่น · ใบของตัวเองบอกว่า "ใบของฉัน"', () => {
  const other = requestHeaderPeople(base, { mine: false });
  assert.equal(other.requester.label, 'ผู้ยื่น');
  assert.equal(other.requester.name, 'Panuwat Hongloylom');
  assert.equal(other.requester.team, 'SV');

  const own = requestHeaderPeople(base, { mine: true });
  assert.equal(own.requester.label, 'ใบของฉัน');
  assert.equal(own.requester.mine, true);
});

// ⚠️ ผู้รับเรื่องเคยเป็นชิปคู่กับผู้ยื่น แล้วผู้ใช้เลือกกลับไปใช้บรรทัด "รับเรื่องโดย …"
// ใต้หัวใบแทน (ม-101.2) — ชิปจึงมีฝั่งเดียว · เทสต์นี้กันการเติมกลับโดยไม่ตั้งใจ
test('ชิปมีเฉพาะผู้ยื่น — ผู้รับเรื่องอยู่บรรทัดใต้หัวใบ ไม่ใช่ในชิป', () => {
  const people = requestHeaderPeople(
    { ...base, acknowledgedByName: 'ProjectCo.Krapook', acknowledgedAt: '2026-08-11T02:36:34Z' }, {},
  );
  assert.deepEqual(Object.keys(people), ['requester']);
});

// ── คำบอกเวลา ──────────────────────────────────────────────────────────
// ⚠️ **สร้างวันจาก NOW เสมอ ห้ามสะกดเวลาพร้อม offset** — "วันนี้/เมื่อวาน" นับที่
// ปฏิทิน **ตามเขตเวลาของเครื่องที่รัน** (กติกาเดียวกับ `fmtDate`) ⇒ ค่าอย่าง
// `2026-08-11T01:00+07:00` เป็นวันที่ 11 ที่ไทย แต่เป็นวันที่ 10 บนรันเนอร์ที่เป็น UTC
// เทสต์เดิมเขียนแบบนั้นแล้วผ่านบนเครื่องไทย · แดงบน CI (เจอจริง 2026-08-11)
const daysAgo = (n) => new Date(NOW.getTime() - n * 24 * 60 * 60 * 1000);

test('คำบอกอายุใบอ่านเป็นภาษาคน', () => {
  assert.equal(ageLabel(daysAgo(0), NOW), 'วันนี้');
  assert.equal(ageLabel(daysAgo(1), NOW), 'เมื่อวาน');
  assert.equal(ageLabel(daysAgo(6), NOW), 'ค้างมา 6 วัน');
  assert.equal(ageLabel(null, NOW), null);
});

test('นับถอยหลังบอกทั้งก่อนและหลังกำหนด', () => {
  assert.equal(countdownLabel('2026-08-14', NOW), 'อีก 3 วัน');
  assert.equal(countdownLabel('2026-08-11', NOW), 'ครบกำหนดวันนี้');
  assert.equal(countdownLabel('2026-08-09', NOW), 'เลยกำหนดมา 2 วัน');
});

test('เทียบสองวัน — ตรงวันพอดีก็ต้องบอก ไม่ใช่เงียบ', () => {
  assert.deepEqual(committedVsRequested('2026-08-14', '2026-08-14'), { text: 'ตรงกับที่ขอ', tone: 'ok' });
  assert.equal(committedVsRequested('2026-08-13', '2026-08-14').tone, 'ok');
  assert.equal(committedVsRequested('2026-08-20', '2026-08-14').tone, 'late');
  assert.equal(committedVsRequested(null, '2026-08-14'), null);
});
