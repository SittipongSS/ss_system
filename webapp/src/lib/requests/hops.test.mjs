// ด่านของก้าว — ต้องครอบทุกข้อที่ constraint ของ mig 0202 บังคับ
//
// ⚠️ ถ้าด่านที่นี่ไม่ครบ ผู้ใช้จะได้ error ดิบจาก Postgres ภาษาอังกฤษที่อ่านไม่รู้เรื่อง
// แทนที่จะได้ข้อความไทยที่บอกว่าต้องกรอกอะไรเพิ่ม
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  HOP_OWNER, ROW_HOPS, ROW_OUTCOMES,
  followUpRowFrom, hopLabel, hopPatch, hopStageError, hopUpdateKind, hopValuesError,
} from './hops.js';
import { UPDATE_KINDS } from '@/lib/master/updateTypes';
import { rowStage } from './rowStage.js';

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
  return r;  // sent
};

test('ทุกก้าวมีเจ้าของฝั่ง — ไม่มีก้าวไหนที่ใครก็กดได้', () => {
  for (const hop of ROW_HOPS) {
    assert.ok(['dept', 'requester'].includes(HOP_OWNER[hop]), hop);
  }
});

test('เดินข้ามขั้นไม่ได้ และข้อความต้องบอกขั้นปัจจุบันด้วย', () => {
  // ⚠️ "ข้ามขั้นไม่ได้" เฉย ๆ ไม่ช่วยให้ผู้ใช้รู้ว่าต้องทำอะไรก่อน
  assert.equal(hopStageError(at('awaiting_ack'), 'ack'), null);
  const early = hopStageError(at('awaiting_ack'), 'send');
  assert.match(early, /ยังไม่ถึงขั้นนี้/);
  assert.match(early, /รอรับเรื่อง/, 'ต้องบอกขั้นปัจจุบัน');

  const late = hopStageError(at('sent'), 'ack');
  assert.match(late, /ผ่านขั้นนี้ไปแล้ว/);
  assert.match(late, /ส่งให้ลูกค้าแล้ว/);

  assert.match(hopStageError(null, 'ack'), /ไม่พบรายการ/);
  assert.match(hopStageError(at('sent'), 'บิน'), /ก้าวไม่ถูกต้อง/);
});

test('ก้าวที่บันทึกเวลาต้องมีวันที่ — ไม่งั้นตัวเลข lead time หายทั้งแถวโดยไม่มีอะไรฟ้อง', () => {
  for (const hop of ['ready', 'pickup', 'send']) {
    assert.match(hopValuesError(hop, {}), /ต้องระบุวันที่/, hop);
    assert.equal(hopValuesError(hop, { at: '2026-08-12' }), null, hop);
  }
  assert.match(hopValuesError('ready', { at: '12/08/2026' }), /วันที่ไม่ถูกต้อง/);
  // รับเรื่องไม่บังคับวันที่ (ค่าตั้งต้น = วันนี้) แต่ถ้าใส่วันนัดส่งต้องถูกรูปแบบ
  assert.equal(hopValuesError('ack', {}), null);
  assert.match(hopValuesError('ack', { dueAt: 'พรุ่งนี้' }), /วันที่รับปาก/);
});

test('บันทึกคำตอบลูกค้า — ด่านตรงกับ constraint ของ 0202 ทุกข้อ', () => {
  assert.match(hopValuesError('outcome', { at: '2026-08-18' }), /ลูกค้าตอบว่าอย่างไร/);
  assert.match(hopValuesError('outcome', { outcome: 'confirmed' }), /วันที่ลูกค้าตอบ/);
  // คอนเฟิร์มต้องมีจำนวน — ตัวเลขนี้ใช้กระทบยอดกับใบสั่งขาย
  assert.match(
    hopValuesError('outcome', { outcome: 'confirmed', at: '2026-08-18' }),
    /จำนวนที่ลูกค้าคอนเฟิร์ม/,
  );
  assert.equal(
    hopValuesError('outcome', { outcome: 'confirmed', at: '2026-08-18', confirmedQty: 1 }),
    null,
  );
  // ไม่เอา = ปิดแถวถาวร ต้องบอกเหตุผล (constraint answer_evidence บังคับ declineReason)
  assert.match(
    hopValuesError('outcome', { outcome: 'rejected', at: '2026-08-18' }),
    /สิ่งที่ลูกค้าบอก/,
  );
  assert.equal(
    hopValuesError('outcome', { outcome: 'rejected', at: '2026-08-18', note: 'ไม่ชอบโทนไม้' }),
    null,
  );
  // ขอแก้ก็บังคับ — ข้อความนี้กลายเป็นบรีฟของแถวใหม่ที่เกิดตามมา ปล่อยว่างแล้ว
  // ฝ่ายปลายทางจะเห็นแถว "รอรับเรื่อง" โผล่มาโดยไม่รู้ว่าต้องแก้อะไร
  assert.match(
    hopValuesError('outcome', { outcome: 'revise', at: '2026-08-18' }),
    /สิ่งที่ลูกค้าบอก/,
  );
  assert.equal(
    hopValuesError('outcome', { outcome: 'revise', at: '2026-08-18', note: 'ขอไม้เพิ่ม' }),
    null,
  );
});

test('patch เขียนช่องถูกก้าว และเติมวันนี้ให้เมื่อไม่ได้ระบุ', () => {
  const u = { id: 'U-RD', name: 'สมชาย' };
  const ack = hopPatch('ack', { dueAt: '2026-08-22' }, u, '2026-08-02');
  assert.deepEqual(ack, {
    ackAt: '2026-08-02', ackById: 'U-RD', ackByName: 'สมชาย', dueAt: '2026-08-22',
  });
  // ไม่ใส่วันนัดส่ง = ไม่เขียนช่องนั้นเลย (ไม่ใช่เขียน null ทับของเดิม)
  assert.equal('dueAt' in hopPatch('ack', {}, u, '2026-08-02'), false);

  assert.deepEqual(hopPatch('pickup', { at: '2026-08-13' }, u), {
    pickedUpAt: '2026-08-13', pickedUpById: 'U-RD', pickedUpByName: 'สมชาย',
  });
});

test('"ไม่เอา" ปิดแถวทันที · "ขอแก้" ไม่ปิด — งานไปต่อที่แถวใหม่', () => {
  const u = { id: 'U-AE', name: 'ก้อย' };
  const rejected = hopPatch('outcome', { outcome: 'rejected', at: '2026-08-18', note: 'ไม่เอา' }, u);
  assert.equal(rejected.answerStatus, 'declined');
  assert.equal(rejected.declineReason, 'ไม่เอา', 'constraint บังคับให้มีเหตุผล');
  assert.equal(rowStage({ ...at('sent'), ...rejected }), 'declined');

  const revise = hopPatch('outcome', { outcome: 'revise', at: '2026-08-18', note: 'ขอไม้เพิ่ม' }, u);
  assert.equal('answerStatus' in revise, false, 'ขอแก้ต้องไม่ปิด answerStatus');
  assert.equal(rowStage({ ...at('sent'), ...revise }), 'revised');

  const confirmed = hopPatch('outcome', { outcome: 'confirmed', at: '2026-08-18', confirmedQty: 5 }, u);
  assert.equal(confirmed.confirmedQty, 5);
  assert.equal(rowStage({ ...at('sent'), ...confirmed }), 'awaiting_price');
});

test('kind ของเหตุการณ์ต้องลงทะเบียนไว้จริง — ไม่งั้นเงียบสนิทบนจอ', () => {
  // ⚠️ appendUpdate เตือนอย่างเดียว ไม่ตีกลับ ⇒ kind ที่หลุดทะเบียนจะถูกบันทึกลง DB
  // แต่ไม่มีป้ายให้แสดง · เทสต์นี้คือด่านเดียวที่จับได้
  const registered = UPDATE_KINDS.dept_request;
  for (const hop of ROW_HOPS) {
    if (hop === 'outcome') continue;
    assert.ok(registered[hopUpdateKind(hop)], `${hop} → ${hopUpdateKind(hop)} ยังไม่ลงทะเบียน`);
  }
  for (const outcome of ROW_OUTCOMES) {
    assert.ok(registered[hopUpdateKind('outcome', outcome)], outcome);
  }
});

test('ป้ายของก้าวอ่านรู้เรื่อง และคำตอบลูกค้าแยกป้ายตามผล', () => {
  assert.equal(hopLabel('ack'), 'รับเรื่อง');
  assert.equal(hopLabel('outcome', 'confirmed'), 'ลูกค้าคอนเฟิร์ม');
  assert.equal(hopLabel('outcome', 'rejected'), 'ลูกค้าไม่เอา');
});

test('ขอแก้ = แถวใหม่ที่ยกของที่ขอมาทั้งชุด แต่ล้างสิ่งที่เกิดขึ้นแล้วทิ้ง', () => {
  // ⭐ มติ: แก้แล้วได้ "รายการใหม่" ไม่ใช่ Rev. ⇒ แถวใหม่ต้องเริ่มที่รอรับเรื่องอีกครั้ง
  // (ฝ่ายปลายทางรับเรื่องแก้ใหม่ ถามกลับได้ก่อนรับปากวัน)
  const old = {
    id: 'DRI-1', requestId: 'DR-1', lineKind: 'product_dev', sortOrder: 2,
    label: 'เนื้อเทียนซอย', spec: 'ฐานน้ำ', categoryCode: '01-002', scentId: 'SCT-9',
    qty: 5, unit: 'ชิ้น', kind: null, materialId: null, componentId: null, docType: null,
    // สิ่งที่เกิดขึ้นแล้ว — ต้องไม่ตามไปแถวใหม่
    ackAt: '2026-08-02', readyAt: '2026-08-12', pickedUpAt: '2026-08-13',
    sentAt: '2026-08-14', outcome: 'revise', outcomeAt: '2026-08-18',
    answerStatus: 'pending', answeredRevisionId: 'MPR-1', confirmedQty: 3,
  };
  const next = followUpRowFrom(old, 9);

  // ยกของที่ "ขอ" มาครบ
  assert.equal(next.label, 'เนื้อเทียนซอย');
  assert.equal(next.categoryCode, '01-002');
  assert.equal(next.scentId, 'SCT-9');
  assert.equal(next.qty, 5);
  assert.equal(next.lineKind, 'product_dev');
  assert.equal(next.sortOrder, 9);

  // สายพันธุ์ — อ่านย้อนได้ว่าแก้มาจากตัวไหน
  assert.equal(next.derivedFromItemId, 'DRI-1');

  // ⚠️ สิ่งที่เกิดขึ้นแล้วต้องไม่ตามมา — ไม่งั้นแถวใหม่จะเกิดมาพร้อมสถานะ "จบแล้ว"
  for (const field of [
    'ackAt', 'readyAt', 'pickedUpAt', 'sentAt', 'outcome', 'outcomeAt',
    'answeredRevisionId', 'confirmedQty', 'id',
  ]) {
    assert.equal(field in next, false, `${field} ต้องไม่ตามไปแถวใหม่`);
  }
  assert.equal(next.answerStatus, 'pending');
  assert.equal(rowStage(next), 'awaiting_ack', 'แถวใหม่ต้องเริ่มที่รอรับเรื่อง');
});

// ── ด่านของ route ต้องเรียงถูกลำดับ และไม่หายไปเงียบ ─────────────────────
//
// ⚠️ ด่านสามชั้นของ PATCH .../items/[itemId] อยู่คนละไฟล์กับกฎที่นี่ และ **ลำดับ
// สำคัญ**: ถ้า "ก้าวนี้เป็นของฝั่งไหน" มาก่อน "อ่านใบนี้ได้ไหม" คนนอกจะรู้ได้ว่า id
// นี้มีอยู่จริงจากข้อความ error ที่ต่างกัน · เทสต์นี้อ่านซอร์สเพราะ handler แตะ DB
// จึงรันตรง ๆ ไม่ได้ — มันจับ "ด่านถูกลบ/ถูกสลับที่" ซึ่งคือความพังที่เงียบที่สุด
test('route ของก้าว: ด่านครบและเรียงถูกลำดับ', () => {
  const src = readFileSync(
    new URL('../../app/api/sa/requests/[id]/items/[itemId]/route.js', import.meta.url),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

  const order = [
    'canReadRequestRow',      // 1 อ่านใบนี้ได้ไหม
    'REQUEST_OPEN_STATUSES',  // 2 ใบยังเปิดอยู่ไหม (ร่าง/ยกเลิก/ปิด เดินก้าวไม่ได้)
    'HOP_OWNER',              // 3 ก้าวนี้เป็นของฝั่งเรารึเปล่า
    'hopStageError',          // 4 แถวอยู่ขั้นที่เดินก้าวนี้ได้ไหม
    'hopValuesError',         // 5 ค่าที่ส่งมาครบไหม
  ].map((needle) => {
    // lastIndexOf = จุดที่ **ใช้งาน** ไม่ใช่บรรทัด import ⇒ ด่านที่เหลือแต่ import
    // (เผลอลบเงื่อนไขทิ้ง) จะร่วงลงมาอยู่หน้าด่านอื่นและเทสต์จับได้
    const i = src.lastIndexOf(needle);
    assert.notEqual(i, -1, `route ต้องยังเรียก ${needle}`);
    return { needle, i };
  });
  for (let n = 1; n < order.length; n += 1) {
    assert.ok(
      order[n].i > order[n - 1].i,
      `${order[n].needle} ต้องอยู่หลัง ${order[n - 1].needle}`,
    );
  }

  // วันของก้าวต้องเป็นวันไทย — nowIso.slice(0, 10) ให้วัน UTC ซึ่งก่อน 07:00 น.
  // ของไทยยังเป็นเมื่อวาน ⇒ ก้าวที่กดตอนเช้ามืดจะถูกบันทึกล่วงหน้าไปหนึ่งวัน
  assert.match(src, /const today = businessDate\(\)/);
});
