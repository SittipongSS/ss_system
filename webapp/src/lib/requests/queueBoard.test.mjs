// แถบตัวเลข + ก้าวถัดไปของคิว (P6b)
import test from 'node:test';
import assert from 'node:assert/strict';
import { QUEUE_COUNT_META, queueCounts, requestNextStep } from './queueBoard.js';

const req = (over = {}) => ({ id: 'DR-1', status: 'acknowledged', dept: 'RD', items: [], ...over });
// แถวที่รอฝ่ายส่งของ (รับเรื่องแล้ว ยังไม่ส่ง) · แถวที่รอผู้ขอไปรับ (ส่งแล้ว)
const waitDept = { ackAt: '2026-08-01', answerStatus: 'pending' };
const waitRequester = { ackAt: '2026-08-01', readyAt: '2026-08-02', answerStatus: 'pending' };
const done = { answerStatus: 'done' };

test('ใบร่างรอผู้ขอ · ใบที่ปิดแล้วไม่ต้องการอะไรอีก', () => {
  assert.deepEqual(requestNextStep(req({ status: 'draft' })), { owner: 'requester', label: 'ยังไม่ได้ส่ง' });
  assert.equal(requestNextStep(req({ status: 'closed' })), null);
  assert.equal(requestNextStep(req({ status: 'cancelled' })), null);
  assert.equal(requestNextStep(null), null);
});

test('ใบที่ยังไม่มีบรรทัด — คอขวดอยู่ที่ฝ่ายเสมอ', () => {
  // สอบถาม / พัฒนากลิ่นก่อน RD ส่งของ · ไม่มีแถวให้นับ แต่ไม่ได้แปลว่าไม่มีงาน
  assert.equal(requestNextStep(req({ status: 'pending' })).owner, 'dept');
  assert.match(requestNextStep(req({ status: 'pending' })).label, /รอรับเรื่อง/);
  assert.equal(requestNextStep(req({ status: 'acknowledged' })).owner, 'dept');
});

test('⭐ ใบที่มีทั้งสองฝั่ง — ฝ่ายมาก่อน เพราะฝ่ายถือคอขวด', () => {
  // ผู้ขอทำต่อไม่ได้จนกว่าของจะมา ⇒ บอกว่า "รอผู้ขอ" จะพาคนไปจี้ผิดคน
  const both = req({ items: [waitDept, waitRequester] });
  assert.equal(requestNextStep(both).owner, 'dept');
});

test('ทุกแถวจบแต่ใบยังไม่ปิด — คนที่ต้องกดปิดคือผู้ขอ', () => {
  const all = req({ items: [done, done] });
  assert.equal(requestNextStep(all).owner, 'requester');
  assert.match(requestNextStep(all).label, /รอปิดเรื่อง/);
});

test('⭐ "เลยกำหนด" นับเฉพาะใบที่รับปากวันไว้แล้ว', () => {
  // ใบที่ยังไม่รับเรื่องไม่มีกำหนดให้เลย — เป็นคนละปัญหาคนละทางแก้
  // รวมกันเมื่อไร ตัวเลขจะบอกไม่ได้ว่าต้องไปทำอะไร
  const rows = [
    req({ status: 'pending' }),                                   // ยังไม่รับ ไม่มีกำหนด
    req({ committedDueDate: '2026-08-01' }),                      // เลยกำหนด
    req({ committedDueDate: '2026-12-31' }),                      // ยังไม่ถึง
  ];
  const c = queueCounts(rows, { todayIso: '2026-08-05' });
  assert.equal(c.unacked, 1);
  assert.equal(c.overdue, 1);
});

test('⭐ ตัวที่ 4 แยกงานที่ไม่ใช่ของฝ่ายออกจากตัวเลขงานค้าง', () => {
  // วันนี้คิวนับทุกใบที่ยัง open เป็นงานค้างของฝ่าย ทั้งที่ครึ่งหนึ่งรอผู้ขออยู่
  // ⇒ ตัวเลขสูงกว่าความจริงตลอดเวลา และไม่มีใครเชื่อมันอีกเลย
  const rows = [
    req({ items: [waitDept] }),        // ฝ่ายต้องทำ
    req({ items: [waitRequester] }),   // รอผู้ขอ
    req({ items: [done] }),            // ครบแล้ว รอปิด (ก็คือรอผู้ขอ)
  ];
  const c = queueCounts(rows, { todayIso: '2026-08-05' });
  assert.equal(c.working, 1);
  assert.equal(c.waitingRequester, 2);
});

test('ใบที่ปิด/ยกเลิกแล้วไม่ถูกนับในแถบใดเลย', () => {
  const rows = [req({ status: 'closed' }), req({ status: 'cancelled' }), req({ status: 'draft' })];
  assert.deepEqual(queueCounts(rows, { todayIso: '2026-08-05' }),
    { unacked: 0, overdue: 0, working: 0, waitingRequester: 0 });
});

test('ทุกตัวเลขบนแถบมีป้ายและโทน — ไม่มีตัวไหนโผล่เป็นคีย์ดิบ', () => {
  const keys = Object.keys(queueCounts([], {}));
  assert.deepEqual(QUEUE_COUNT_META.map((m) => m.key).sort(), keys.sort());
  for (const m of QUEUE_COUNT_META) assert.ok(m.label && m.tone, m.key);
});

// ── แท็บ 3 ตัว + แถวคั่นกลุ่ม (P6c) ───────────────────────────────────────
import { QUEUE_GROUPS, QUEUE_TABS, queueTabRows, requestGroupKey } from './queueBoard.js';

test('⭐ แท็บไม่โตตามจำนวนฝ่าย — คงที่ 3 ตัว (R-4)', () => {
  // ของเดิมเป็น "คิวฝ่าย RD · คิวฝ่าย PC · ที่ฉันเปิด" ⇒ กลายเป็นสี่แท็บทันทีที่
  // ฝ่ายบัญชีเข้ามาใน P7 · คนที่อยู่หลายฝ่ายต้องไล่กดทีละแท็บเพื่อดูว่ามีงานอะไร
  assert.deepEqual(QUEUE_TABS.map((t) => t.key), ['todo', 'mine', 'history']);
});

test('"รอฉันตอบ" = ตาของฝ่ายที่ฉันอยู่ หรือตาของฉันในฐานะผู้ขอ', () => {
  const rows = [
    req({ id: 'A', dept: 'RD', items: [waitDept] }),          // ตาฝ่าย RD
    req({ id: 'B', dept: 'PC', items: [waitDept] }),          // ตาฝ่าย PC (ไม่ใช่ของฉัน)
    req({ id: 'C', dept: 'RD', items: [waitRequester], _mine: true }), // ตาฉัน (ผู้ขอ)
    req({ id: 'D', dept: 'RD', items: [waitRequester] }),     // ตาผู้ขอคนอื่น
    req({ id: 'E', status: 'closed' }),
  ];
  const got = queueTabRows(rows, { tab: 'todo', myDepts: ['RD'] }).map((r) => r.id);
  assert.deepEqual(got, ['A', 'C']);
});

test('⚠️ ใบร่างของตัวเองไม่โผล่ในสองแท็บ — ตัวเลขบนแท็บจะบวกเกินจริง', () => {
  const rows = [req({ id: 'D1', status: 'draft', _mine: true })];
  assert.deepEqual(queueTabRows(rows, { tab: 'todo', myDepts: ['RD'] }), []);
  assert.deepEqual(queueTabRows(rows, { tab: 'mine' }).map((r) => r.id), ['D1']);
});

test('⚠️ ประวัติ = ใบที่จบแล้ว ไม่ใช่ "ทุกใบ"', () => {
  // รวมใบที่ยังเปิดอยู่ด้วยจะซ้ำกับสองแท็บแรก แล้วไม่มีใครรู้ว่าต้องดูแท็บไหน
  const rows = [
    req({ id: 'X', status: 'closed' }),
    req({ id: 'Y', status: 'cancelled' }),
    req({ id: 'Z', items: [waitDept] }),
  ];
  assert.deepEqual(queueTabRows(rows, { tab: 'history' }).map((r) => r.id), ['X', 'Y']);
});

test('กลุ่มของแถวคั่น — ยังไม่รับ / เลยกำหนด / กำลังทำ / จบแล้ว', () => {
  const t = { todayIso: '2026-08-05' };
  assert.equal(requestGroupKey(req({ status: 'pending' }), t), 'unacked');
  assert.equal(requestGroupKey(req({ committedDueDate: '2026-08-01' }), t), 'overdue');
  assert.equal(requestGroupKey(req({ committedDueDate: '2026-12-31' }), t), 'open');
  assert.equal(requestGroupKey(req({ status: 'closed' }), t), 'settled');
  assert.equal(requestGroupKey(null, t), 'settled');
  // ทุกกลุ่มที่คืนได้ต้องมีป้าย ไม่งั้นแถวคั่นจะโผล่เป็นคีย์ดิบ
  const keys = QUEUE_GROUPS.map((g) => g.key);
  for (const k of ['unacked', 'overdue', 'open', 'settled']) assert.ok(keys.includes(k), k);
});
