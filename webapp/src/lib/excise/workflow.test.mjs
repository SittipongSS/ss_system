import test from 'node:test';
import assert from 'node:assert/strict';
// ── ป้ายตัวเลขบนเมนู (ม-117) ─────────────────────────────────────────────
test('⭐ "รอฉันลงมือ" ของภาษี = ขั้นที่เลนฉันเป็นเจ้าของและยังไม่จบ', async () => {
  const { ownedStages, isTaxWaitingOnMe } = await import('./workflow.js');

  // ขึ้นทะเบียน: SA ถือร่าง+ตีกลับ · RA ถือใบที่รออนุมัติ
  assert.deepEqual(ownedStages('registration', 'SA'), ['draft', 'rejected']);
  assert.deepEqual(ownedStages('registration', 'RA'), ['pending_legal']);
  // ยื่นชำระ (v3 02/11): บันทึกการยื่นมีสองขั้น — RA ถือ "กำลังยื่น" · ชำระแล้ว = จบ · ฝ่ายขายไม่มีขั้นบนเส้นนี้
  // (งาน "รอ RA" ยังไม่มีแถว orders — ป้ายเมนูนับจากคิวคำนวณสดเพิ่มเอง · api/nav/counts)
  assert.deepEqual(ownedStages('payment', 'RA'), ['filing']);
  assert.deepEqual(ownedStages('payment', 'SA'), []);
  assert.equal(ownedStages('payment', 'RA').includes('complete'), false);

  // ขั้นจบแล้วไม่นับ — ไม่มีใครต้องทำอะไรต่อ
  assert.equal(ownedStages('registration', 'SA').includes('approved'), false);
  assert.equal(ownedStages('payment', 'SA').includes('delivered'), false);

  // แอดมินเห็นสองเลนแต่ไม่เป็นเจ้าของขั้นไหน ⇒ ไม่มีป้าย
  assert.deepEqual(ownedStages('registration', 'AD'), []);
  assert.deepEqual(ownedStages('payment', 'AD'), []);
  assert.deepEqual(ownedStages('registration', null), []);
  assert.deepEqual(ownedStages('nope', 'SA'), []);

  assert.equal(isTaxWaitingOnMe({ status: 'pending_legal' }, 'registration', 'RA'), true);
  assert.equal(isTaxWaitingOnMe({ status: 'pending_legal' }, 'registration', 'SA'), false);
  assert.equal(isTaxWaitingOnMe(null, 'registration', 'RA'), false);
});
