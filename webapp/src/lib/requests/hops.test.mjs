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
  assert.match(late, /ส่งลูกค้าแล้ว/);

  assert.match(hopStageError(null, 'ack'), /ไม่พบรายการ/);
  assert.match(hopStageError(at('sent'), 'บิน'), /ก้าวไม่ถูกต้อง/);
});

test('ก้าวฝั่งผู้ขอที่บันทึกเหตุการณ์นอกระบบยังบังคับวันที่ — ก้าวส่งใช้ตราประทับ (ม-92)', () => {
  for (const hop of ['pickup', 'send', 'receive']) {
    assert.match(hopValuesError(hop, {}), /ต้องระบุวันที่/, hop);
    assert.equal(hopValuesError(hop, { at: '2026-08-12' }), null, hop);
  }
  // ⭐ ก้าวส่ง (ready) ว่างได้ — hopPatch ประทับวันไทยของวันที่กดให้เอง (ม-92:
  // "ไม่จำเป็นต้องใส่วันที่ ใช้ stamp วันเวลา") · ใส่มาก็ยังต้องถูกรูปแบบ
  assert.equal(hopValuesError('ready', {}), null);
  assert.match(hopValuesError('ready', { at: '12/08/2026' }), /วันที่ไม่ถูกต้อง/);
  // รับเรื่องไม่บังคับวันที่ (ค่าตั้งต้น = วันนี้) แต่ถ้าใส่วันนัดส่งต้องถูกรูปแบบ
  assert.equal(hopValuesError('ack', {}), null);
  assert.match(hopValuesError('ack', { dueAt: 'พรุ่งนี้' }), /วันที่รับปาก/);
});

test('ส่งเอกสารการเงินต้องมีเลขที่ — วันครบกำหนดไม่บังคับ (B-3 · R-6)', () => {
  const fn = { lineKind: 'billing_doc' };
  assert.match(hopValuesError('ready', {}, fn), /ต้องระบุเลขที่เอกสาร/);
  assert.match(hopValuesError('ready', { docNumber: '   ' }, fn), /ต้องระบุเลขที่เอกสาร/);
  assert.equal(hopValuesError('ready', { docNumber: 'IV-26080012' }, fn), null);
  assert.match(hopValuesError('ready', { docNumber: 'X'.repeat(61) }, fn), /ยาวเกิน 60/);
  // ⭐ ว่างได้ — ใบเสร็จออกหลังรับเงินแล้ว ไม่มีกำหนดชำระ
  assert.equal(hopValuesError('ready', { docNumber: 'IV-1', docDueDate: '' }, fn), null);
  assert.equal(hopValuesError('ready', { docNumber: 'IV-1', docDueDate: '2026-09-15' }, fn), null);
  assert.match(hopValuesError('ready', { docNumber: 'IV-1', docDueDate: '15/09/2026' }, fn), /วันครบกำหนด/);

  // ⚠️ **ห้ามลามไปรูปร่างอื่น** — เอกสารของ RD ไม่มีเลขที่ให้กรอก และบรรทัดพัฒนา
  // ก็ไม่มี · บังคับหมดเมื่อไร ฝ่ายอื่นกดส่งของไม่ได้เลยสักแถว
  assert.equal(hopValuesError('ready', {}, { lineKind: 'document' }), null);
  assert.equal(hopValuesError('ready', {}, { lineKind: 'product_dev' }), null);
  assert.equal(hopValuesError('ready', {}), null);
});

test('ส่งเอกสารการเงินเขียนเลขที่ลงแถว — รูปร่างอื่นไม่มีคีย์นั้นเลย (B-3)', () => {
  const user = { id: 'U1', name: 'บัญชี' };
  const fn = { lineKind: 'billing_doc' };
  const patch = hopPatch('ready', { docNumber: ' IV-26080012 ', docDueDate: '2026-09-15' }, user, '2026-08-15', fn);
  assert.equal(patch.docNumber, 'IV-26080012');
  assert.equal(patch.docDueDate, '2026-09-15');
  assert.equal(patch.readyAt, '2026-08-15');
  // ว่าง = ล้างค่าเดิม ไม่ใช่ข้ามไป (ส่งซ้ำหลังแก้ต้องลบวันเดิมออกได้)
  assert.equal(hopPatch('ready', { docNumber: 'IV-1' }, user, '2026-08-15', fn).docDueDate, null);
  // ⚠️ รูปร่างอื่น **ต้องไม่มีคีย์เลย** — PostgREST ปฏิเสธทั้งก้อนถ้า DB ยังไม่มีคอลัมน์
  const other = hopPatch('ready', { docNumber: 'IV-1' }, user, '2026-08-15', { lineKind: 'document' });
  assert.equal('docNumber' in other, false);
  assert.equal('docDueDate' in other, false);
  assert.equal('docNumber' in hopPatch('ready', {}, user, '2026-08-15'), false);
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
  const file = readFileSync(
    new URL('../../app/api/sa/requests/[id]/items/[itemId]/route.js', import.meta.url),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  /* ⚠️ **ตัดเอาเฉพาะตัว PATCH** — ไฟล์นี้มี handler ที่สองแล้ว (DELETE รายการ ·
     2026-08-18) ซึ่งมีด่านของตัวเองคนละชุด · เทสต์นี้วัด "ลำดับด่านของก้าว" ซึ่งเป็น
     เรื่องของ PATCH ล้วน ⇒ ไม่ตัดก่อน `lastIndexOf` จะไปเจอด่านของ DELETE แทน
     แล้วฟ้องว่าเรียงผิดทั้งที่ของจริงถูก */
  const patchStart = file.indexOf('export async function PATCH');
  const patchEnd = file.indexOf('export async function DELETE');
  assert.ok(patchStart !== -1, 'route ต้องมี PATCH');
  const src = patchEnd > patchStart ? file.slice(patchStart, patchEnd) : file.slice(patchStart);

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

// ── สายของแถวเอกสาร — สองก้าวจบ receive/refuse (ม-85) ─────────────────────
//
// 🐞 บั๊กที่ชุดนี้ล็อก: เดิมแถวเอกสารเดินก้าวของสายพัฒนาได้ครบชุด แล้วไปตายที่
// ขั้นราคา (400 "ยังไม่ผูกกลิ่นหรือสูตร") ⇒ ค้างที่ "รอใส่ราคา" ถาวร ปิดใบไม่ได้
const docAt = (stage) => {
  const r = { id: 'DRI-D1', lineKind: 'document', answerStatus: 'pending' };
  if (stage === 'awaiting_ack') return r;
  r.ackAt = '2026-08-02';
  if (stage === 'developing') return r;
  r.readyAt = '2026-08-03';
  return r; // ready
};

test('⭐ แถวเอกสารเดินได้แค่ ack → ready → receive — ก้าวสายพัฒนาถูกตัดตั้งแต่ต้น', () => {
  assert.equal(hopStageError(docAt('awaiting_ack'), 'ack'), null);
  assert.equal(hopStageError(docAt('developing'), 'ready'), null);
  assert.equal(hopStageError(docAt('ready'), 'receive'), null);
  // ก้าวของสายพัฒนา — โดนด่าน lineKind ก่อนถึงด่านขั้น
  for (const hop of ['pickup', 'send', 'outcome']) {
    assert.match(hopStageError(docAt('ready'), hop), /สายพัฒนา/, hop);
  }
  // ฝั่งกลับกัน: แถวพัฒนาใช้ก้าวเอกสารไม่ได้
  assert.match(hopStageError(at('ready'), 'receive'), /ขอเอกสาร/);
  assert.match(hopStageError(at('developing'), 'refuse'), /ขอเอกสาร/);
});

test('receive: เขียน answerStatus=done + วันได้รับลง pickedUpAt — แถวจบจริง', () => {
  const patch = hopPatch('receive', { at: '2026-08-05' }, { id: 'U1', name: 'สมชาย' });
  assert.equal(patch.answerStatus, 'done');
  assert.equal(patch.pickedUpAt, '2026-08-05');
  assert.equal(patch.pickedUpByName, 'สมชาย');
  // แถวหลัง patch ต้องอ่านเป็น done — แถบ "มาแล้ว" ถึงจะนับได้จริง (เดิมนับ 0 เสมอ)
  assert.equal(rowStage({ ...docAt('ready'), ...patch }), 'done');
  // ⚠️ CHECK hop_chain: pickedUpAt ต้องมี readyAt — receive เดินได้เฉพาะหลัง ready
  assert.match(hopValuesError('receive', {}), /วันที่/);
});

test('refuse: บังคับเหตุผล · เขียน declined+declineReason · จากขั้นกำลังทำเท่านั้น', () => {
  assert.equal(hopStageError(docAt('developing'), 'refuse'), null);
  assert.match(hopStageError(docAt('ready'), 'refuse'), /ผ่านขั้นนี้ไปแล้ว/);
  // เหตุผลคือหลักฐาน — constraint answer_evidence บังคับคู่ declined+declineReason
  assert.match(hopValuesError('refuse', {}), /เหตุผล/);
  assert.match(hopValuesError('refuse', { note: '   ' }), /เหตุผล/);
  assert.equal(hopValuesError('refuse', { note: 'ต้องขอจากซัพพลายเออร์' }), null);
  const patch = hopPatch('refuse', { note: 'ต้องขอจากซัพพลายเออร์' }, { id: 'U1', name: 'ปาริชาต' });
  assert.equal(patch.answerStatus, 'declined');
  assert.equal(patch.declineReason, 'ต้องขอจากซัพพลายเออร์');
  assert.equal(rowStage({ ...docAt('developing'), ...patch }), 'declined');
});

test('แถวเอกสารเก่าที่หลงเดินสายพัฒนาไปแล้ว ยังจบด้วย receive ได้ — ไม่ติดถาวร', () => {
  const stray = { ...docAt('ready'), pickedUpAt: '2026-08-04' };            // picked_up
  assert.equal(hopStageError(stray, 'receive'), null);
  const sent = { ...stray, sentAt: '2026-08-05' };                          // sent
  assert.equal(hopStageError(sent, 'receive'), null);
});

test('receive/refuse ลงทะเบียนเป็นเหตุการณ์ในเธรดแล้ว — ไม่เงียบบนจอ', async () => {
  const registered = UPDATE_KINDS.dept_request;
  assert.ok(registered[hopUpdateKind('receive')], 'received ยังไม่ลงทะเบียน');
  assert.ok(registered[hopUpdateKind('refuse')], 'refused ยังไม่ลงทะเบียน');
  assert.equal(hopLabel('receive'), 'ได้รับแล้ว');
  assert.equal(hopLabel('refuse'), 'ปฏิเสธ');
  // ⭐ **"ส่งงาน" คำเดียวทุกสาย** (มติผู้ใช้ 2026-08-15 — ทับ ม-89 ที่เคยแยก
  // "ส่งเอกสาร" กับ "ส่งของ") · ล็อกไว้ว่าไม่มีสายไหนแตกคำกลับไปอีก
  const { hopLabelFor } = await import('./hops.js');
  for (const lineKind of ['document', 'billing_doc', 'scent_dev', 'product_dev']) {
    assert.equal(hopLabelFor({ lineKind }, 'ready'), 'ส่งงาน', lineKind);
  }
});

// ── ดึงกลับ — ก้าวถอยก้าวเดียวของระบบ (มติผู้ใช้ 2026-08-20) ───────────────
//
// 🐞 อาการที่ชุดนี้ปิด: ฝ่ายแนบไฟล์ผิดแล้วกดส่ง ⇒ แถวไปอยู่ขั้น "รอไปรับ" ซึ่งเป็น
// ตาของผู้ขอ · การ์ดไฟล์อ่านอย่างเดียว (ม-90) ⇒ ฝ่ายไม่มีทางแก้ไฟล์ของตัวเองเลย
test('⭐ ดึงกลับ: ของฝ่าย · เฉพาะสายเอกสารขั้น ready · เหตุผลบังคับ · ล้างตราก้าวส่งครบ', () => {
  assert.equal(HOP_OWNER.unready, 'dept');

  // ขั้น: ส่งแล้วแต่ผู้ขอยังไม่รับ = ดึงกลับได้ · ก่อนส่งยังไม่มีอะไรให้ถอย
  assert.equal(hopStageError(docAt('ready'), 'unready'), null);
  assert.match(hopStageError(docAt('developing'), 'unready'), /ยังไม่ถึงขั้นนี้/);
  // ⭐ **ผู้ขอกด "ได้รับแล้ว" = ปิดประตู** — ของที่อีกฝั่งรับไปใช้แล้วไม่ใช่ของที่
  // เจ้าของถอยคืนเงียบ ๆ ได้ (มติผู้ใช้: ดึงกลับได้จนกว่าผู้ขอจะกดรับ)
  const received = { ...docAt('ready'), pickedUpAt: '2026-08-04', answerStatus: 'done' };
  assert.equal(rowStage(received), 'done');
  assert.match(hopStageError(received, 'unready'), /ผ่านขั้นนี้ไปแล้ว/);
  // สายพัฒนาไม่มีก้าวนี้ — ก้าวส่งของมันสร้างกลิ่น/สูตรเข้าทะเบียนไปแล้ว
  assert.match(hopStageError(at('ready'), 'unready'), /ขอเอกสาร/);

  // เหตุผลบังคับเหมือน "ดึงกลับ" ที่อื่นในระบบ — อีกฝั่งเห็นแถวเด้งกลับเอง
  assert.match(hopValuesError('unready', {}), /เหตุผล/);
  assert.match(hopValuesError('unready', { note: '   ' }), /เหตุผล/);
  assert.equal(hopValuesError('unready', { note: 'แนบไฟล์ผิดใบ' }), null);

  const patch = hopPatch('unready', { note: 'แนบไฟล์ผิดใบ' }, { id: 'U9', name: 'ปาริชาต' });
  // ล้างครบสามช่อง — เหลือ readyById ค้าง = ประวัติบอกว่ามีคนส่งของที่ไม่มีวันส่ง
  assert.deepEqual(patch, { readyAt: null, readyById: null, readyByName: null });
  assert.equal(rowStage({ ...docAt('ready'), ...patch }), 'developing');
  // ⚠️ เลขที่เอกสารของบรรทัดการเงินต้องไม่ถูกล้าง — ใบที่ FN ออกไปแล้วยังเลขเดิม
  assert.ok(!('docNumber' in patch));
  assert.ok(!('docDueDate' in patch));
});

test('ดึงกลับ: มีคำ ป้าย และเหตุการณ์ในเธรดครบ — ไม่เงียบบนจอ', () => {
  assert.equal(hopLabel('unready'), 'ดึงกลับ');
  assert.ok(UPDATE_KINDS.dept_request[hopUpdateKind('unready')], 'unready ยังไม่ลงทะเบียน');
  // เหตุผลไม่มีคอลัมน์บนแถว ⇒ route ต้องพ่วงลงเนื้อเหตุการณ์ ไม่งั้นหายไปเลย
  const itemSrc = readFileSync('src/app/api/sa/requests/[id]/items/[itemId]/route.js', 'utf8');
  assert.ok(itemSrc.includes('unreadyReason'), 'route ต้องเก็บเหตุผลลงเธรด');
  // ปุ่มอยู่คู่ป้าย "รออีกฝั่ง" ของสายเอกสาร — ฝ่ายกดได้ทั้งที่ตาเป็นของผู้ขอ
  const barSrc = readFileSync('src/components/requests/NextStepBar.js', 'utf8');
  assert.ok(/canUnready = canDept && stage === "ready" && isDocLineKind/.test(barSrc));
});

test('🔴 route: ส่งเอกสารต้องเช็คไฟล์แนบก่อน — และปิดเรื่องเป็นของผู้ขอเท่านั้น (ม-89)', () => {
  const itemSrc = readFileSync('src/app/api/sa/requests/[id]/items/[itemId]/route.js', 'utf8');
  // ด่านไฟล์: มติ "การส่งเอกสาร RD ต้องแนบไฟล์เอกสารด้วย" — ส่งโดยไม่มีไฟล์ =
  // บอกว่าส่งแล้วทั้งที่ไม่มีอะไรให้รับ
  assert.ok(/isDocLineKind\(row\.lineKind\)/.test(itemSrc), 'ต้องแยกสายเอกสาร');
  assert.ok(itemSrc.includes('ต้องแนบไฟล์เอกสารบนรายการนี้ก่อนกดส่ง'), 'ต้องมีด่านไฟล์');
  // ปิดสองฝ่าย: ฝ่ายจบงานผ่านรายการ (ส่ง/ปฏิเสธ) แล้วผู้ขอเป็นคนกดปิด
  const headSrc = readFileSync('src/app/api/sa/requests/[id]/route.js', 'utf8');
  assert.ok(headSrc.includes('ปิดเรื่องได้เฉพาะฝ่ายผู้ขอ'), 'route ปิดต้องเหลือผู้ขอ');
});
