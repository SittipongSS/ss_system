import test from 'node:test';
import assert from 'node:assert/strict';
// ── ป้ายตัวเลขบนเมนู (ม-117) ─────────────────────────────────────────────
test('⭐ "รอฉันลงมือ" ของภาษี = ขั้นที่เลนฉันเป็นเจ้าของและยังไม่จบ', async () => {
  const { ownedStages, isTaxWaitingOnMe } = await import('./workflow.js');

  // ขึ้นทะเบียน: SA ถือร่าง+ตีกลับ · LG ถือใบที่รออนุมัติ
  assert.deepEqual(ownedStages('registration', 'SA'), ['draft', 'rejected']);
  assert.deepEqual(ownedStages('registration', 'LG'), ['pending_legal']);
  // ยื่นชำระ: SA ถือเตรียมใบ/รอรับเงิน/ชำระแล้ว(รอส่งเอกสาร) · LG ถือรอยื่น/กำลังยื่น
  assert.deepEqual(ownedStages('payment', 'LG'), ['received', 'filing']);
  assert.deepEqual(ownedStages('payment', 'SA'), ['draft', 'pending', 'complete']);

  // ขั้นจบแล้วไม่นับ — ไม่มีใครต้องทำอะไรต่อ
  assert.equal(ownedStages('registration', 'SA').includes('approved'), false);
  assert.equal(ownedStages('payment', 'SA').includes('delivered'), false);

  // แอดมินเห็นสองเลนแต่ไม่เป็นเจ้าของขั้นไหน ⇒ ไม่มีป้าย
  assert.deepEqual(ownedStages('registration', 'AD'), []);
  assert.deepEqual(ownedStages('payment', 'AD'), []);
  assert.deepEqual(ownedStages('registration', null), []);
  assert.deepEqual(ownedStages('nope', 'SA'), []);

  assert.equal(isTaxWaitingOnMe({ status: 'pending_legal' }, 'registration', 'LG'), true);
  assert.equal(isTaxWaitingOnMe({ status: 'pending_legal' }, 'registration', 'SA'), false);
  assert.equal(isTaxWaitingOnMe(null, 'registration', 'LG'), false);
});
