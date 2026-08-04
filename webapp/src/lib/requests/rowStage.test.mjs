// สถานะของแถวคำร้อง + เวลารายก้าว (mig 0202)
//
// ⚠️ ไฟล์นี้ล็อกสิ่งที่ **คิว · รางแนวตั้ง · ปุ่มหลัก** ใช้ร่วมกัน — ถ้ากฎที่นี่เพี้ยน
// สามที่นั้นจะเพี้ยนพร้อมกันโดยไม่มีใครเห็น เพราะมันอ่านจากแหล่งเดียวกัน
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ROW_STAGES, ROW_STAGE_LABELS, ROW_STAGE_TONES,
  canPriceRow, isRowSettled, nextStepForRow, requestRowSummary, rowLeadTimes, rowStage,
} from './rowStage.js';

const REQ = { id: 'DR-1', dept: 'RD', requestedById: 'U-AE' };
const SA = { id: 'U-AE', role: 'ae', department: 'SA' };
const RD = { id: 'U-RD', role: 'rd', department: 'RD' };

// แถวที่เดินมาถึงก้าวที่ระบุ (สะสมช่องตามลำดับจริง)
const at = (stage) => {
  const r = { id: 'DRI-1', lineKind: 'scent_dev', answerStatus: 'pending' };
  if (stage === 'awaiting_ack') return r;
  r.ackAt = '2026-08-02';
  if (stage === 'developing') return r;
  r.readyAt = '2026-08-12';
  if (stage === 'ready') return r;
  r.pickedUpAt = '2026-08-13';
  if (stage === 'picked_up') return r;
  r.sentAt = '2026-08-14';
  if (stage === 'sent') return r;
  r.outcomeAt = '2026-08-18';
  if (stage === 'revised')  return { ...r, outcome: 'revise' };
  if (stage === 'declined') return { ...r, outcome: 'rejected', answerStatus: 'declined' };
  const confirmed = { ...r, outcome: 'confirmed', confirmedQty: 1 };
  if (stage === 'awaiting_price') return confirmed;
  return { ...confirmed, answerStatus: 'done' };  // done
};

test('ทุกขั้นมีป้ายและโทนครบ — ไม่มีขั้นไหนขึ้นจอเป็นค่าว่าง', () => {
  for (const s of ROW_STAGES) {
    assert.ok(ROW_STAGE_LABELS[s], `${s} ต้องมีป้าย`);
    assert.ok(ROW_STAGE_TONES[s], `${s} ต้องมีโทน`);
  }
});

test('ขั้นของแถวอ่านจากช่องที่ถูกกรอกแล้ว — ช่องล่าสุดชนะ', () => {
  for (const s of ROW_STAGES) {
    assert.equal(rowStage(at(s)), s, s);
  }
  assert.equal(rowStage(null), null);
});

test('ใส่ราคาได้เฉพาะตอนลูกค้าคอนเฟิร์มแล้ว — ด่านชั้นเดียวเพราะราคาอยู่ในใบเดิม', () => {
  assert.equal(canPriceRow(at('awaiting_price')), true);
  for (const s of ['sent', 'revised', 'declined', 'done', 'developing']) {
    assert.equal(canPriceRow(at(s)), false, s);
  }
});

test('แถวที่จบแล้ว: ลูกค้าขอแก้ก็ถือว่าจบ — งานไปต่อที่แถวใหม่', () => {
  for (const s of ['done', 'declined', 'revised']) {
    assert.equal(isRowSettled(at(s)), true, s);
  }
  for (const s of ['awaiting_ack', 'sent', 'awaiting_price']) {
    assert.equal(isRowSettled(at(s)), false, s);
  }
});

test('บรรทัดวัสดุไม่มี 4 ก้าว — ตอบราคาแล้วข้ามไปจบเลย', () => {
  // ⭐ ไม่มีสาขาแยกตาม lineKind ในโค้ด เพราะช่องก้าวของบรรทัดวัสดุว่างอยู่แล้ว
  const material = { id: 'DRI-2', lineKind: 'material', answerStatus: 'pending' };
  assert.equal(rowStage(material), 'awaiting_ack');
  assert.equal(rowStage({ ...material, ackAt: '2026-08-02' }), 'developing');
  assert.equal(rowStage({ ...material, answerStatus: 'done' }), 'done');
  assert.equal(rowStage({ ...material, answerStatus: 'declined' }), 'declined');
});

test('เวลารายก้าว — วัดได้ว่าใครดองกี่วัน', () => {
  const t = rowLeadTimes(at('awaiting_price'));
  assert.equal(t.develop, 10);   // 2 ส.ค. → 12 ส.ค.  (ฝ่ายปลายทางทำ)
  assert.equal(t.pickup, 1);     // 12 → 13           (ผู้ขอไปรับ)
  assert.equal(t.deliver, 1);    // 13 → 14           (ผู้ขอส่งลูกค้า)
  assert.equal(t.customer, 4);   // 14 → 18           (ลูกค้าตอบ)
  assert.equal(t.total, 16);
  assert.equal(t.disordered, false);
});

test('ยังไม่ถึงก้าวไหน = null ไม่ใช่ 0 — "ยังไม่เกิด" กับ "เกิดวันเดียวกัน" คนละเรื่อง', () => {
  const t = rowLeadTimes(at('ready'));
  assert.equal(t.develop, 10);
  assert.equal(t.pickup, null);
  assert.equal(t.customer, null);
});

test('รับเรื่องระดับใบใช้เป็นจุดตั้งต้นได้ เมื่อแถวยังไม่มี ackAt ของตัวเอง', () => {
  const row = { readyAt: '2026-08-12' };
  assert.equal(rowLeadTimes(row).develop, null);
  assert.equal(rowLeadTimes(row, { ackFallback: '2026-08-02' }).develop, 10);
});

test('วันที่เรียงผิดไม่ทำให้พัง — clamp เป็น 0 แล้วชูธงให้จอเตือน', () => {
  // migration จงใจไม่ใส่ CHECK เรียงวันที่ (ผู้ใช้แก้ย้อนหลังเป็นเรื่องปกติ)
  // ⇒ ติดลบเกิดได้จริง ต้องไม่โชว์ "-3 วัน" และต้องไม่เงียบ
  const t = rowLeadTimes({ ackAt: '2026-08-12', readyAt: '2026-08-09', sentAt: '2026-08-09' });
  assert.equal(t.develop, 0);
  assert.equal(t.disordered, true);
});

test('ก้าวถัดไปบอกทั้งฝั่งและว่าเป็นตาเราไหม — คิวกับหน้ารายละเอียดอ่านตัวเดียวกัน', () => {
  const ack = nextStepForRow(at('awaiting_ack'), REQ, RD);
  assert.equal(ack.owner, 'dept');
  assert.equal(ack.label, 'รับเรื่อง');
  assert.equal(ack.isMine, true, 'RD คือฝ่ายปลายทางของใบนี้');
  assert.equal(nextStepForRow(at('awaiting_ack'), REQ, SA).isMine, false);

  // ก้าวของผู้ขอ — ฝั่งกลับกัน
  const pick = nextStepForRow(at('ready'), REQ, SA);
  assert.equal(pick.owner, 'requester');
  assert.equal(pick.isMine, true);
  assert.equal(nextStepForRow(at('ready'), REQ, RD).isMine, false);

  // ราคาเป็นก้าวของฝ่ายปลายทาง ไม่ใช่ของผู้ขอ
  assert.equal(nextStepForRow(at('awaiting_price'), REQ, RD).owner, 'dept');

  // แถวที่จบแล้วไม่มีก้าวถัดไป
  for (const s of ['done', 'declined', 'revised']) {
    assert.equal(nextStepForRow(at(s), REQ, RD), null, s);
  }
});

test('สรุปทั้งใบ — แยกงานที่ค้างที่ฝ่ายออกจากงานที่ค้างที่ผู้ขอ', () => {
  // 🐞 ตัวเลขงานค้างของฝ่ายวันนี้รวมงานที่ไม่ใช่ของฝ่ายเข้าไปด้วย เพราะไม่มีใคร
  // แยก "รอเราทำ" ออกจาก "รออีกฝั่งทำ" — สรุปนี้คือที่มาของตัวเลข "รอฝ่ายขายทำต่อ"
  const s = requestRowSummary([
    at('awaiting_ack'),    // รอฝ่าย
    at('developing'),      // รอฝ่าย
    at('ready'),           // รอผู้ขอ
    at('sent'),            // รอผู้ขอ (รอลูกค้าตอบ แต่คนกดคือผู้ขอ)
    at('awaiting_price'),  // รอฝ่าย
    at('done'),            // จบ
    at('revised'),         // จบ (ไปต่อที่แถวใหม่)
  ]);
  assert.deepEqual(s, { total: 7, waitingDept: 3, waitingRequester: 2, settled: 2 });
});
