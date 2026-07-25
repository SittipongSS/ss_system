// เคสขอราคาวัสดุ (mig 0158) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASK_OPEN_STATUSES,
  acknowledgeAskError,
  answerAskError,
  askDocScope,
  askProgress,
  canAnswerAsk,
  canManageAsk,
  cancelAskError,
  closeAskError,
  deleteAskError,
  deriveAskStatusAfterAnswer,
  normalizeAskItems,
  normalizeAskTiers,
  submitAskError,
} from './materialAsks.js';

const rd = { id: 'u-rd', role: 'rd', department: 'RD' };
const pc = { id: 'u-pc', role: 'staff', department: 'PC' };
const sale = { id: 'u-sale', role: 'ae', team: 'KA' };

test('เลขที่เคสแยกตามฝ่ายผู้ตอบ', () => {
  assert.equal(askDocScope('PC'), 'PM');
  assert.equal(askDocScope('RD'), 'RM');
});

test('normalize รายการ: ทุกรายการต้องเป็นฝ่ายเดียวกับหัวเคส', () => {
  const ok = normalizeAskItems([
    { kind: 'PM', label: '  ขวดแก้ว   30ml ', spec: 'สีชา สกรีน 1 จุด', tiers: [3000, 1000] },
    { kind: 'PM', label: 'ฝาไม้', materialId: 'MAT-1' },
  ], { dept: 'PC' });
  assert.equal(ok.error, null);
  assert.equal(ok.items[0].label, 'ขวดแก้ว 30ml');
  assert.deepEqual(ok.items[0].tiers, [1000, 3000], 'เรียงจากน้อยไปมากให้เอง');
  assert.equal(ok.items[1].materialId, 'MAT-1');
  assert.equal(ok.items[0].sortOrder, 1);

  // ⚠️ ปนฝ่ายไม่ได้ — เลขที่เคสผูกกับฝ่าย ปนแล้วเคสจะไปโผล่ผิดคิว
  assert.match(
    normalizeAskItems([{ kind: 'PM', label: 'ขวด' }, { kind: 'RM_F', label: 'หัวน้ำหอม' }], { dept: 'PC' }).error,
    /เป็นของฝ่าย RD แต่เคสนี้ส่งไปฝ่าย PC/,
  );
  assert.match(normalizeAskItems([], { dept: 'PC' }).error, /อย่างน้อย 1 รายการ/);
  assert.match(normalizeAskItems([{ kind: 'labor', label: 'x' }], { dept: 'PC' }).error, /ชนิดวัสดุไม่ถูกต้อง/);
  assert.match(normalizeAskItems([{ kind: 'PM', label: ' ' }], { dept: 'PC' }).error, /ต้องระบุชื่อวัสดุ/);
});

test('normalize รายการ: ถามวัสดุตัวเดียวกันซ้ำในเคสเดียวไม่ได้', () => {
  // ตอบแล้วจะไม่รู้ว่าคำตอบไหนคู่กับรายการไหน
  assert.match(
    normalizeAskItems([
      { kind: 'PM', label: 'ขวด', materialId: 'MAT-1' },
      { kind: 'PM', label: 'ขวดอีกอัน', materialId: 'MAT-1' },
    ], { dept: 'PC' }).error,
    /ถามวัสดุตัวนี้ซ้ำ/,
  );
  // ของใหม่เทียบด้วยชื่อ (ยังไม่มี id) — ตัวพิมพ์/ช่องว่างไม่นับว่าต่าง
  assert.match(
    normalizeAskItems([
      { kind: 'PM', label: 'ขวดแก้ว 30ml' },
      { kind: 'PM', label: '  ขวดแก้ว   30ML  ' },
    ], { dept: 'PC' }).error,
    /ถามวัสดุตัวนี้ซ้ำ/,
  );
});

test('ชั้นจำนวนที่ขอ: ใส่เองอิสระ ไม่มีชุดค่าบังคับ', () => {
  assert.deepEqual(normalizeAskTiers([5000, 800, 1000]).tiers, [800, 1000, 5000]);
  assert.deepEqual(normalizeAskTiers([{ qty: 2500 }]).tiers, [2500]);
  // ไม่ระบุเลย = ขอราคาเดียว (ไม่ใช่ error)
  assert.deepEqual(normalizeAskTiers([]), { tiers: [], error: null });
  assert.match(normalizeAskTiers([0]).error, /มากกว่า 0/);
  assert.match(normalizeAskTiers([-5]).error, /มากกว่า 0/);
  assert.match(normalizeAskTiers([1000, 1000]).error, /ซ้ำ/);
});

test('ความคืบหน้า: ตอบไม่ได้ก็นับว่าตอบแล้ว', () => {
  const items = [
    { priceStatus: 'quoted' },
    { priceStatus: 'no_quote' },
    { priceStatus: 'pending' },
  ];
  assert.deepEqual(askProgress(items), { done: 2, total: 3, complete: false });
  assert.deepEqual(askProgress(items.slice(0, 2)), { done: 2, total: 2, complete: true });
  assert.deepEqual(askProgress([]), { done: 0, total: 0, complete: false });
});

test('สถานะเคส derive จากรายการ ไม่เก็บตัวนับ', () => {
  const done = [{ priceStatus: 'quoted' }, { priceStatus: 'no_quote' }];
  assert.equal(deriveAskStatusAfterAnswer(done, 'acknowledged'), 'answered');
  assert.equal(deriveAskStatusAfterAnswer([...done, { priceStatus: 'pending' }], 'acknowledged'), 'acknowledged');
  // ปิด/ยกเลิกแล้วห้ามถูกดึงกลับมาเปิดโดยอัตโนมัติ
  assert.equal(deriveAskStatusAfterAnswer(done, 'closed'), 'closed');
  assert.equal(deriveAskStatusAfterAnswer(done, 'cancelled'), 'cancelled');
});

test('สิทธิ์: ตอบ = ฝ่ายเจ้าของ · จัดการ = ผู้เปิดเคส', () => {
  const pmAsk = { dept: 'PC', requestedById: 'u-sale', status: 'pending' };
  const rmAsk = { dept: 'RD', requestedById: 'u-sale', status: 'pending' };

  assert.equal(canAnswerAsk(pc, pmAsk), true);
  assert.equal(canAnswerAsk(rd, pmAsk), false, 'RD ตอบเคส PM ไม่ได้');
  assert.equal(canAnswerAsk(rd, rmAsk), true);
  assert.equal(canAnswerAsk(sale, pmAsk), false, 'เซลตอบราคาเองไม่ได้');
  assert.equal(canAnswerAsk({ role: 'admin' }, pmAsk), true, 'admin break-glass');

  assert.equal(canManageAsk(sale, pmAsk), true);
  assert.equal(canManageAsk(pc, pmAsk), false, 'ฝ่ายผู้ตอบไม่ใช่เจ้าของเคส');
  assert.equal(canManageAsk({ id: 'other', role: 'ae' }, pmAsk), false);
  assert.equal(canManageAsk({ role: 'admin' }, pmAsk), true);
});

test('ด่านแต่ละ action', () => {
  const draft = { status: 'draft', submittedAt: null };
  const pending = { status: 'pending', submittedAt: '2026-07-26T00:00:00Z' };
  const acked = { status: 'acknowledged' };
  const answered = { status: 'answered' };
  const closed = { status: 'closed' };
  const done = [{ priceStatus: 'quoted' }];
  const partial = [{ priceStatus: 'quoted' }, { priceStatus: 'pending' }];

  assert.equal(submitAskError(draft, done), null);
  assert.match(submitAskError(draft, []), /อย่างน้อย 1 รายการ/);
  assert.match(submitAskError(pending, done), /ส่งไปแล้ว/);

  assert.equal(acknowledgeAskError(pending), null);
  assert.match(acknowledgeAskError(draft), /ยังไม่ถูกส่ง/);
  assert.match(acknowledgeAskError(acked), /รับเรื่องไปแล้ว/);

  assert.equal(answerAskError(pending), null, 'ตอบได้เลยโดยไม่ต้องกดรับเรื่องก่อน');
  assert.equal(answerAskError(acked), null);
  assert.match(answerAskError(draft), /ยังไม่ถูกส่ง/);
  assert.match(answerAskError(closed), /ปิดไปแล้ว/);

  assert.equal(closeAskError(answered, done), null);
  assert.match(closeAskError(acked, partial), /ยังมีรายการที่ยังไม่ได้ตอบ/);
  assert.match(closeAskError(closed, done), /ปิดแล้ว/);

  assert.equal(cancelAskError(pending), null);
  assert.match(cancelAskError(answered), /ปิดเคสแทน/);
  assert.match(cancelAskError(closed), /ยกเลิกไม่ได้/);

  assert.equal(deleteAskError(draft), null);
  assert.match(deleteAskError(pending), /เฉพาะร่างที่ยังไม่ส่ง/);

  assert.deepEqual(ASK_OPEN_STATUSES, ['pending', 'acknowledged']);
});
