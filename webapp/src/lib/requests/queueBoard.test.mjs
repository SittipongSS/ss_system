// แถบตัวเลข + ก้าวถัดไปของคิว (P6b)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  QUEUE_COUNT_META, matchesQueueCount, queueCounts, requestNextStep,
} from './queueBoard.js';

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
  const counts = queueCounts(rows, { todayIso: '2026-08-05' });
  // ⚠️ เทียบกับ **ทะเบียน** ไม่ใช่ก้อนที่พิมพ์ไว้ — เพิ่มตัวเลขใหม่แล้วเทสต์นี้จะ
  // ดับด้วยเหตุผลผิด ๆ (คีย์ใหม่ ≠ ใบที่ปิดถูกนับ) · สิ่งที่ตรึงคือ "ทุกช่องเป็น 0"
  assert.deepEqual(counts, Object.fromEntries(QUEUE_COUNT_META.map((m) => [m.key, 0])));
});

// 🐞 ผู้ใช้ถามเอง 2026-08-11 ว่า "ตีกลับอยู่ไหน" — ไล่โค้ดแล้วพบว่าใบที่ถูกตีกลับ
// กลับเป็น `draft` ⇒ ป้ายขึ้น "ยังไม่ได้ส่ง" เหมือนร่างที่ไม่เคยส่ง และ **ไม่ถูกนับ
// ในแถบตัวเลขสักช่อง** ⇒ ค้างได้ไม่จำกัดโดยไม่มีอะไรทวง
test('⭐ ใบที่ถูกตีกลับต้องแยกจากร่างที่ไม่เคยส่ง — ทั้งป้ายและตัวเลข', async () => {
  const { bouncedDaysText } = await import('./queueBoard.js');
  const t = { todayIso: '2026-08-11' };
  const fresh = req({ id: 'A', status: 'draft' });
  const bounced = req({ id: 'B', status: 'draft', bouncedAt: '2026-08-08T03:00:00Z', bounceReason: 'ยังไม่แนบสเปก' });

  assert.equal(requestNextStep(fresh).label, 'ยังไม่ได้ส่ง');
  assert.equal(requestNextStep(fresh).bounced, undefined);
  assert.equal(requestNextStep(bounced).label, 'ตีกลับ — ต้องแก้');
  assert.equal(requestNextStep(bounced).bounced, true);
  // ⚠️ ยังเป็นงานของ **ผู้ขอ** ไม่ใช่ของฝ่าย — ฝ่ายส่งคืนไปแล้ว
  assert.equal(requestNextStep(bounced).owner, 'requester');

  const counts = queueCounts([fresh, bounced], t);
  assert.equal(counts.bounced, 1, 'ใบตีกลับต้องถูกนับ');
  // ไม่ไหลไปช่องอื่น — ไม่ใช่ "กำลังดำเนินการ" และไม่ใช่ "เลยกำหนด"
  assert.equal(counts.working, 0);
  assert.equal(counts.overdue, 0);
  assert.equal(counts.unacked, 0);
  assert.equal(counts.waitingRequester, 0, 'draft ไม่ควรไหลเข้าช่องของใบที่เปิดอยู่');

  // นับวันค้างจาก bouncedAt — ใบตีกลับไม่มีกำหนดส่งให้นับถอยหลัง
  assert.equal(bouncedDaysText(bounced, t).days, 3);
  assert.match(bouncedDaysText(bounced, t).note, /ค้าง 3 วัน/);
  assert.equal(bouncedDaysText(bounced, { todayIso: '2026-08-08' }).note, 'ตีกลับวันนี้');
  assert.equal(bouncedDaysText(fresh, t), null, 'ร่างที่ไม่เคยส่งไม่มีวันตีกลับ');
  // ใบที่ส่งใหม่แล้ว (pending) ไม่ใช่ใบตีกลับอีกต่อไป แม้ยังมี bouncedAt ติดอยู่
  const resent = req({ id: 'C', status: 'pending', bouncedAt: '2026-08-08T03:00:00Z' });
  assert.equal(bouncedDaysText(resent, t), null);
  assert.equal(queueCounts([resent], t).bounced, 0);
});

test('⭐ ใบตีกลับต้องอยู่บนสุดของคิว ไม่ใช่ตกกลุ่ม "จบแล้ว" กับใบที่ปิดไปจริง', async () => {
  const { QUEUE_GROUPS, groupQueueRows, queueCountMeta, requestGroupKey, startHereRequest } =
    await import('./queueBoard.js');
  const t = { todayIso: '2026-08-11' };
  const bounced = req({ id: 'B', status: 'draft', bouncedAt: '2026-08-08T03:00:00Z' });
  const fresh = req({ id: 'A', status: 'draft' });

  // 🐞 draft ไม่อยู่ใน REQUEST_OPEN_STATUSES ⇒ เดิมได้คีย์ 'settled'
  assert.equal(requestGroupKey(bounced, t), 'bounced');
  assert.equal(requestGroupKey(fresh, t), 'settled', 'ร่างที่ไม่เคยส่งยังไม่ใช่ของค้าง');
  assert.equal(QUEUE_GROUPS[0].key, 'bounced', 'กลุ่มตีกลับต้องเป็นกลุ่มแรก');

  const groups = groupQueueRows([req({ id: 'P', status: 'pending' }), bounced, fresh], t);
  assert.equal(groups[0].group, 'bounced');
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['B']);

  // การ์ด "เริ่มที่นี่" ต้องชี้ใบตีกลับก่อน — เดิมถูกกรองทิ้งพร้อมกลุ่ม settled
  const pick = startHereRequest([fresh, bounced], t);
  assert.equal(pick.request.id, 'B');
  assert.equal(pick.next.bounced, true);

  // แถบตัวเลขของ *ฝ่าย* ไม่ต้องมีกล่องที่เป็น 0 ตลอดกาล
  const deptKeys = queueCountMeta({ scope: 'dept' }).map((m) => m.key);
  assert.ok(!deptKeys.includes('bounced'));
  assert.equal(queueCountMeta().length, QUEUE_COUNT_META.length);
});

test('🔴 กดตัวเลขแล้วได้จำนวนใบเท่าตัวเลขนั้นเป๊ะ ๆ — ตัวนับกับตัวกรองใช้กติกาเดียวกัน', () => {
  // ⭐ ตัวเลขบนแถบกดกรองได้แล้ว · ถ้าตัวนับกับตัวกรองเขียนเงื่อนไขคนละชุด จะได้
  // อาการ "กด «เลยกำหนด 2» แล้วขึ้นสามใบ" ซึ่งหาไม่เจอเพราะทั้งสองฝั่งดูถูกในตัวเอง
  const today = '2026-08-05';
  const rows = [
    req({ id: 'A', status: 'pending' }),
    req({ id: 'B', committedDueDate: '2026-08-01', items: [waitDept] }),
    req({ id: 'C', items: [waitDept] }),
    req({ id: 'D', items: [done, done] }),
    req({ id: 'E', status: 'closed' }),
    req({ id: 'F', status: 'draft' }),
  ];
  const counts = queueCounts(rows, { todayIso: today });
  for (const meta of QUEUE_COUNT_META) {
    const filtered = rows.filter((r) => matchesQueueCount(r, meta.key, { todayIso: today }));
    assert.equal(filtered.length, counts[meta.key], meta.key);
  }
  // กันเทสต์ที่ผ่านเพราะทุกตัวเป็น 0 — ต้องมีของจริงให้เทียบอย่างน้อยหนึ่งตัว
  assert.ok(Object.values(counts).some((n) => n > 0));
});

test('คีย์ที่ไม่รู้จักไม่จับใบไหนเลย — ไม่ใช่จับทั้งหมด', () => {
  // ตัวกรองที่ "จับทุกใบ" ตอนคีย์เพี้ยนจะดูเหมือนไม่ได้กรอง ⇒ บั๊กเงียบ
  assert.equal(matchesQueueCount(req({ status: 'pending' }), 'ไม่มีคีย์นี้', {}), false);
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

test('⚠️ จัดกลุ่มจริง ไม่ใช่แทรกเส้นตอนคีย์เปลี่ยน — ไม่งั้นหัวข้อเดิมโผล่ซ้ำ', async () => {
  const { groupQueueRows } = await import('./queueBoard.js');
  // เรียงสลับกลุ่มมาโดยตั้งใจ (compareRequestUrgency ไม่ได้เรียงตามลำดับกลุ่มนี้เป๊ะ)
  const rows = [
    req({ id: 'A', status: 'pending' }),
    req({ id: 'B', committedDueDate: '2026-12-31' }),
    req({ id: 'C', status: 'pending' }),
    req({ id: 'D', committedDueDate: '2026-08-01' }),
  ];
  const groups = groupQueueRows(rows, { todayIso: '2026-08-05' });
  assert.deepEqual(groups.map((g) => g.group), ['unacked', 'overdue', 'open']);
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['A', 'C'], 'รวมกลุ่มเดียวกันไว้ด้วยกัน');
  // ลำดับในกลุ่มต้องคงเดิม (ผู้เรียกเรียงมาแล้วด้วย compareRequestUrgency)
  assert.deepEqual(groups[2].rows.map((r) => r.id), ['B']);
});

test('กลุ่มที่ว่างถูกตัดทิ้ง — หัวข้อลอยที่ไม่มีของข้างใต้อ่านเหมือนข้อมูลหาย', async () => {
  const { groupQueueRows } = await import('./queueBoard.js');
  const groups = groupQueueRows([req({ status: 'pending' })], { todayIso: '2026-08-05' });
  assert.deepEqual(groups.map((g) => g.group), ['unacked']);
  assert.deepEqual(groupQueueRows([], {}), []);
});

// ── "เริ่มที่นี่" ─────────────────────────────────────────────────────────
test('⭐ เริ่มที่นี่ต้องเป็นใบบนสุดของคิวเสมอ — ไม่ใช่เกณฑ์ความเร่งชุดใหม่', async () => {
  const { startHereRequest, groupQueueRows } = await import('./queueBoard.js');
  const { compareRequestUrgency } = await import('./queue.js');
  const t = { todayIso: '2026-08-05' };
  const rows = [
    req({ id: 'B', committedDueDate: '2026-12-31', acknowledgedAt: '2026-08-01', items: [waitDept] }),
    req({ id: 'D', committedDueDate: '2026-08-01', acknowledgedAt: '2026-08-01', items: [waitDept] }),
    req({ id: 'A', status: 'pending', submittedAt: '2026-08-02' }),
  ];
  const pick = startHereRequest(rows, t);
  // ใบที่ยังไม่มีใครรับมาก่อนเสมอ (กลุ่มแรกของ groupQueueRows)
  assert.equal(pick.request.id, 'A');
  assert.equal(pick.group, 'unacked');
  // 🪤 ห้ามหลุดเป็นเกณฑ์ของตัวเอง — ต้องตรงกับแถวแรกที่คิวเรียงไว้เป๊ะ
  const firstInQueue = groupQueueRows(rows.slice().sort(compareRequestUrgency), t)[0].rows[0];
  assert.equal(pick.request.id, firstInQueue.id);
});

test('เริ่มที่นี่ — ก้าวถัดไปกับกำหนดส่งมาจากตัวเดียวกับคิว · นับ "ที่เหลือ" ไม่ใช่ทั้งหมด', async () => {
  const { startHereRequest, requestDueText } = await import('./queueBoard.js');
  const t = { todayIso: '2026-08-05' };
  const rows = [
    req({ id: 'A', acknowledgedAt: '2026-08-01', committedDueDate: '2026-08-01', items: [waitDept] }),
    req({ id: 'B', acknowledgedAt: '2026-08-01', committedDueDate: '2026-08-20', items: [waitDept] }),
  ];
  const pick = startHereRequest(rows, t);
  assert.equal(pick.request.id, 'A');
  assert.deepEqual(pick.next, requestNextStep(pick.request));
  assert.deepEqual(pick.due, requestDueText(pick.request, t));
  assert.equal(pick.due.overdue, true);
  assert.equal(pick.remaining, 1, 'ชี้ไปแล้วหนึ่งใบ เหลืออีกหนึ่ง — ไม่ใช่ 2');
});

// ── คิวถัดไป (หน้าภาพรวมฝ่าย · แบบ ก) ────────────────────────────────────
test('⭐ คิวถัดไปเรียงชุดเดียวกับ "เริ่มที่นี่" และตัดใบที่การ์ดชี้ไปแล้วออก', async () => {
  const { nextUpRows, startHereRequest } = await import('./queueBoard.js');
  const t = { todayIso: '2026-08-05' };
  const rows = [
    req({ id: 'B', acknowledgedAt: '2026-08-01', committedDueDate: '2026-12-31', items: [waitDept] }),
    req({ id: 'D', acknowledgedAt: '2026-08-01', committedDueDate: '2026-08-01', items: [waitDept] }),
    req({ id: 'A', status: 'pending', submittedAt: '2026-08-02' }),
  ];
  const pick = startHereRequest(rows, t);
  const next = nextUpRows(rows, t);
  assert.equal(pick.request.id, 'A', 'ใบที่ยังไม่มีใครรับมาก่อน');
  assert.equal(next.some((r) => r.id === pick.request.id), false, 'ห้ามพูดซ้ำใบที่การ์ดชี้');
  // เลยกำหนดมาก่อนใบที่ยังมีเวลา — เกณฑ์เดียวกับคิว ไม่ใช่ลำดับของตัวเอง
  assert.deepEqual(next.map((r) => r.id), ['D', 'B']);
});

test('คิวถัดไป — จำกัดจำนวนได้ · ใบที่จบแล้วไม่นับ · ไม่มีอะไรค้าง = []', async () => {
  const { nextUpRows } = await import('./queueBoard.js');
  const t = { todayIso: '2026-08-05' };
  const many = ['A', 'B', 'C', 'D', 'E'].map((id, i) => req({
    id, acknowledgedAt: '2026-08-01', committedDueDate: `2026-08-1${i}`, items: [waitDept],
  }));
  assert.equal(nextUpRows(many, { ...t, limit: 2 }).length, 2);
  assert.equal(nextUpRows(many, t).length, 4, 'ตัดหัวหนึ่งใบ เหลือสี่');
  assert.deepEqual(nextUpRows([], t), []);
  assert.deepEqual(nextUpRows([req({ status: 'closed' })], t), []);
  // ใบเดียวทั้งคิว = การ์ดชี้ไปแล้ว ไม่มีอะไรต่อ
  assert.deepEqual(nextUpRows([req({ status: 'pending' })], t), []);
});

test('เริ่มที่นี่ — ใบที่จบแล้วไม่นับ และไม่มีอะไรค้าง = null', async () => {
  const { startHereRequest } = await import('./queueBoard.js');
  const t = { todayIso: '2026-08-05' };
  assert.equal(startHereRequest([], t), null);
  assert.equal(startHereRequest([req({ status: 'closed' }), req({ status: 'cancelled' })], t), null);
  // ⚠️ ใบที่ทุกแถวจบแล้วแต่ยังไม่ปิด **ยังต้องนับ** — มันรอผู้ขอกดปิด
  const pick = startHereRequest([req({ id: 'Z', acknowledgedAt: '2026-08-01', items: [done] })], t);
  assert.equal(pick.request.id, 'Z');
  assert.equal(pick.next.label, 'รอปิดเรื่อง');
  assert.equal(pick.remaining, 0);
});
