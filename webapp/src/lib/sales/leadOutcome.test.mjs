// ── "ลีดใบนี้ไปถึงไหน" — คำตอบเดียวของทั้งระบบ ────────────────────────────
//
// เทสต์ชุดนี้คุมสองเรื่องที่พังเงียบทั้งคู่:
//   1. **ตีกลับล้างคอลัมน์** ⇒ อ่านจากแถวแล้วนัดที่เกิดขึ้นจริงหายไปจากตัวเศษ
//   2. **เปิดดีลข้ามขั้นนัดได้** ⇒ นับแค่ "เคยนัด" แล้วผลลัพธ์ที่ดีที่สุดได้ศูนย์คะแนน
// ทั้งคู่ไม่มี error ไม่มีอะไรฟ้อง มีแต่ตัวเลขที่ต่ำกว่าความจริง
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { leadOutcome, leadOutcomeTotals, LEAD_LOST_UNCOUNTABLE } from './leads.js';

const lead = (over = {}) => ({ status: 'assigned', ...over });
const ev = (kind, over = {}) => ({ kind, createdAt: '2026-08-01T03:00:00Z', ...over });

/* ── แหล่งข้อมูล: แถว vs ประวัติ ─────────────────────────────────────────── */

test('ไม่ส่ง events มา = อ่านจากคอลัมน์ และบอกว่า basis เป็น row', () => {
  const o = leadOutcome(lead({ firstContactAt: '2026-08-02T03:00:00Z', meetingAt: '2026-08-05T03:00:00Z' }));
  assert.equal(o.basis, 'row');
  assert.equal(o.reachedContact, true);
  assert.equal(o.reachedMeeting, true);
});

/* ⚠️ ความต่างที่ไม่มีวันมีใครสังเกตเห็นถ้าไม่ล็อกไว้: `[]` แปลว่า "อ่านประวัติมาแล้ว
   ไม่มีอะไรเลย" ไม่ใช่ "ไม่ได้อ่าน" · ถอยไปใช้คอลัมน์เมื่อไรจะได้ระบบที่ตอบเหมือน
   ไม่เคยอ่านประวัติ ทั้งที่อ่านมาแล้ว */
test('events = [] ไม่ถอยไปใช้คอลัมน์ (คนละความหมายกับ null)', () => {
  const row = lead({ firstContactAt: '2026-08-02T03:00:00Z', meetingAt: '2026-08-05T03:00:00Z' });
  const fromRow = leadOutcome(row, null);
  const fromEmpty = leadOutcome(row, []);
  assert.equal(fromRow.reachedMeeting, true);
  assert.equal(fromEmpty.basis, 'events');
  assert.equal(fromEmpty.reachedMeeting, false);
});

/* ── 🐞 บั๊กหลักที่ฟังก์ชันนี้เกิดมาแก้ ──────────────────────────────────── */

/* `bounce` ล้าง `meetingAt` + `firstContactAt` (transition/route.js) ⇒ ลีดที่นัดประชุม
   ไปแล้วจริง ๆ แล้วถูกตีกลับ จะหายจากตัวเศษของอัตราแปลง · ยิ่งเปิดตีกลับอัตโนมัติ
   ตัวชี้วัดยิ่งถูกกลไกของระบบเองลบทิ้งเป็นประจำ */
test('ลีดที่นัดแล้วถูกตีกลับ: แถวบอกว่าไม่เคยนัด แต่ประวัติยังจำได้', () => {
  const bounced = lead({ status: 'new', firstContactAt: null, meetingAt: null });
  const history = [
    ev('bounce', { createdAt: '2026-08-10T03:00:00Z' }),
    ev('meeting', { createdAt: '2026-08-06T03:00:00Z' }),
    ev('contact', { createdAt: '2026-08-02T03:00:00Z' }),
  ];
  assert.equal(leadOutcome(bounced).reachedMeeting, false, 'คอลัมน์ถูกล้างไปแล้ว');
  assert.equal(leadOutcome(bounced, history).reachedMeeting, true, 'ประวัติไม่เคยถูกล้าง');
  assert.equal(leadOutcome(bounced, history).reachedContact, true);
});

/* ⚠️ ต่างจาก meetingTimesSinceBounce ที่ตัดที่ bounce โดยเจตนา — ตัวนั้นตอบ "นัดถัดไป
   ที่ต้องไป" ตัวนี้ตอบ "เคยไปถึงขั้นนัดไหม" · เอาโค้ดมาใช้ร่วมกันเมื่อไรพังทันที */
test('นัดที่อยู่ก่อน bounce ยังนับ — ไม่ตัดประวัติที่ขอบรอบ', () => {
  const history = [ev('bounce', { createdAt: '2026-08-10T03:00:00Z' }), ev('meeting', { createdAt: '2026-08-01T03:00:00Z' })];
  assert.equal(leadOutcome(lead({ status: 'new' }), history).reachedMeeting, true);
});

test('followup นับเป็นการติดต่อ (การติดต่อครั้งที่ 2 ขึ้นไป)', () => {
  assert.equal(leadOutcome(lead(), [ev('followup')]).reachedContact, true);
});

test('เหตุการณ์ที่ไม่ใช่การคุยกับลูกค้า ไม่นับเป็นติดต่อ', () => {
  const admin = [ev('create'), ev('screen'), ev('assign'), ev('reassign'), ev('update')];
  const o = leadOutcome(lead(), admin);
  assert.equal(o.reachedContact, false);
  assert.equal(o.reachedMeeting, false);
});

/* ── ชนะ / แพ้ ──────────────────────────────────────────────────────────── */

test('ชนะ/แพ้อ่านจากสถานะ ไม่ใช่ประวัติ (สองสถานะนี้ไม่มีทางถอย)', () => {
  assert.equal(leadOutcome(lead({ status: 'qualified' })).won, true);
  assert.equal(leadOutcome(lead({ status: 'disqualified' })).lost, true);
  const still = leadOutcome(lead({ status: 'meeting' }));
  assert.equal(still.won, false);
  assert.equal(still.lost, false);
});

/* ⭐ `LEAD_TRANSITIONS.contacted` มี `create_deal` ⇒ ปิดดีลได้โดยไม่ต้องนัด
   ข้อมูลจริง ส.ค. 2026: นัด 2 แต่เปิดลูกค้า 4 */
test('เปิดดีลโดยไม่ผ่านนัด = ชนะ แต่ไม่เคยนัด', () => {
  const o = leadOutcome(lead({ status: 'qualified' }), [ev('create_deal'), ev('contact')]);
  assert.equal(o.won, true);
  assert.equal(o.reachedMeeting, false);
});

/* ── ตัวส่วน ─────────────────────────────────────────────────────────────── */

test('ลีดซ้ำ / ข้อมูลติดต่อผิด หลุดจากตัวส่วน', () => {
  for (const code of LEAD_LOST_UNCOUNTABLE) {
    assert.equal(leadOutcome(lead({ status: 'disqualified', disqualifiedCode: code })).countable, false, code);
  }
});

test('แพ้ด้วยเหตุผลอื่น ยังอยู่ในตัวส่วน (แพ้จริงต้องถูกนับ)', () => {
  for (const code of ['no_response', 'budget', 'not_target', 'timing', 'competitor', 'other']) {
    assert.equal(leadOutcome(lead({ status: 'disqualified', disqualifiedCode: code })).countable, true, code);
  }
});

/* คอลัมน์ `disqualifiedCode` ยังไม่มีในฐานข้อมูล — ใบเก่าทุกใบจะคืน undefined
   ต้องนับต่อเหมือนเดิม ไม่ใช่หลุดจากตัวส่วนกันทั้งกอง */
test('ใบเก่าที่ยังไม่มีรหัสเหตุผล = นับตามเดิม', () => {
  assert.equal(leadOutcome(lead({ status: 'disqualified' })).countable, true);
  assert.equal(leadOutcome(lead({ status: 'disqualified', disqualifiedCode: null })).countable, true);
});

test('ใบที่ยังเดินอยู่ อยู่ในตัวส่วนเสมอ', () => {
  for (const status of ['new', 'screened', 'assigned', 'contacted', 'meeting']) {
    assert.equal(leadOutcome(lead({ status })).countable, true, status);
  }
});

/* ── ผลรวม ──────────────────────────────────────────────────────────────── */

const totalsOf = (leads) => leadOutcomeTotals(leads.map((l) => leadOutcome(l)));

test('ตัวเศษ = เคยนัด หรือ เปิดดีล — ใบที่เข้าทั้งสองเงื่อนไขนับครั้งเดียว', () => {
  const t = totalsOf([
    lead({ status: 'meeting', meetingAt: '2026-08-05T03:00:00Z' }),          // นัดอย่างเดียว
    lead({ status: 'qualified' }),                                            // เปิดดีลโดยไม่นัด
    lead({ status: 'qualified', meetingAt: '2026-08-06T03:00:00Z' }),         // ทั้งสองอย่าง
    lead({ status: 'assigned' }),                                             // ยังไม่ถึงไหน
  ]);
  assert.equal(t.countable, 4);
  assert.equal(t.reached, 3, 'ใบที่ทั้งนัดและเปิดดีลต้องไม่ถูกนับสองครั้ง');
  assert.equal(t.wonWithoutMeeting, 1);
  assert.equal(t.pct, 75);
});

test('ใบที่ตัดออกไม่อยู่ทั้งตัวเศษและตัวส่วน', () => {
  const t = totalsOf([
    lead({ status: 'qualified' }),
    lead({ status: 'disqualified', disqualifiedCode: 'duplicate' }),
    lead({ status: 'disqualified', disqualifiedCode: 'invalid' }),
  ]);
  assert.equal(t.total, 3);
  assert.equal(t.countable, 1);
  assert.equal(t.excluded, 2);
  assert.equal(t.pct, 100, 'สแปมที่เข้ามาไม่ควรลากอัตราแปลงลง');
});

/* ⚠️ 0% อ่านว่า "ทำไม่ได้เลย" ส่วน "ยังไม่มีข้อมูล" เป็นคนละเรื่อง — กลบเป็น 0 เมื่อไร
   จะได้คำตอบที่ดูปกติจนไม่มีใครสงสัย (กติกาเดียวกับ slaPendingTone) */
test('ไม่มีใบไหนอยู่ในตัวส่วน = null ไม่ใช่ 0', () => {
  assert.equal(leadOutcomeTotals([]).pct, null);
  assert.equal(totalsOf([lead({ status: 'disqualified', disqualifiedCode: 'invalid' })]).pct, null);
});

test('basis ของผลรวมจับได้ว่าจอผสมสองแหล่ง', () => {
  const rowOnly = [leadOutcome(lead()), leadOutcome(lead())];
  const evOnly = [leadOutcome(lead(), []), leadOutcome(lead(), [ev('contact')])];
  assert.equal(leadOutcomeTotals(rowOnly).basis, 'row');
  assert.equal(leadOutcomeTotals(evOnly).basis, 'events');
  assert.equal(leadOutcomeTotals([...rowOnly, ...evOnly]).basis, 'mixed');
  assert.equal(leadOutcomeTotals([]).basis, 'row', 'ก้อนว่างต้องไม่อ้างว่าอ่านประวัติมา');
});

/* ── ของที่ต้องไม่ระเบิด ────────────────────────────────────────────────── */

test('ค่าว่าง/ขยะ ไม่โยน error', () => {
  assert.equal(leadOutcome().basis, 'row');
  assert.equal(leadOutcome({}, [null, undefined, {}]).reachedContact, false);
  assert.equal(leadOutcomeTotals().total, 0);
  assert.equal(leadOutcomeTotals([null]).countable, 0);
});

/* ── 🪤 กันดริฟต์: ผลรวมต้องเท่ากับ channelRollup ที่มีอยู่เดิม ─────────────
   ตราบใดที่ยังไม่มีใบไหนถูกตีกลับและยังไม่มี disqualifiedCode ทั้งสองทางต้องได้เลข
   เดียวกันเป๊ะ · แดงเมื่อไรแปลว่านิยามสองที่เริ่มแยกจากกันแล้ว ซึ่งคือโรคที่ฟังก์ชันนี้
   เกิดมารักษา — ไม่ใช่ให้แก้เทสต์ ให้ไปแก้ที่มาให้มันกินตัวเดียวกัน */
test('เทียบกับ channelRollup ของเดิม: เลขต้องตรงกันบนข้อมูลที่ไม่ถูกตีกลับ', async () => {
  const { channelRollup } = await import('./leads.js');
  const rows = [
    { channel: 'phone', status: 'qualified', firstContactAt: 'x', meetingAt: 'y' },
    { channel: 'phone', status: 'contacted', firstContactAt: 'x' },
    { channel: 'website', status: 'meeting', firstContactAt: 'x', meetingAt: 'y' },
    { channel: 'website', status: 'disqualified', firstContactAt: 'x' },
    { channel: 'website', status: 'new' },
  ];
  const old = channelRollup(rows).reduce((a, c) => ({
    contacted: a.contacted + c.contacted, meeting: a.meeting + c.meeting,
    qualified: a.qualified + c.qualified, disqualified: a.disqualified + c.disqualified,
  }), { contacted: 0, meeting: 0, qualified: 0, disqualified: 0 });
  const now = totalsOf(rows);
  assert.equal(now.contacted, old.contacted);
  assert.equal(now.meeting, old.meeting);
  assert.equal(now.won, old.qualified);
  assert.equal(now.lost, old.disqualified);
});
