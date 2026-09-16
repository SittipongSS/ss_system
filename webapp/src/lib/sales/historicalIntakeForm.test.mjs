// ── ตัวตัดสินฝั่งจอของโมดัลคีย์ใบสั่งขายย้อนหลัง (เฟส 2a) ───────────────────────────────
//
// ⭐ เทสต์ชุดนี้ยิงตรงที่ตัวตัดสิน **ไม่ต้องเรนเดอร์ React** — สิ่งที่ต้องกันคือ:
//   1. body ของพรีวิวกับของบันทึกเป็นก้อนเดียวกัน (ลายนิ้วมือคำขอถึงจะตรง)
//   2. กับดักเงียบสามตัวของ API (`zoneId` · `status` ของงวด · `running:false`)
//   3. ใบยอด 0 ส่ง `paymentGateExemptReason: null` เสมอ แม้ผู้คีย์เคยพิมพ์เหตุผลไว้
//   4. error แต่ละรหัสมีทางออกของตัวเอง และรหัสการคีย์ถูกใช้ซ้ำ/ทิ้งตามที่ควร
//   5. **ปุ่มที่โผล่จริงบนจอ "บันทึกไม่สำเร็จ"** (`historicalExitActions`) — ตัวตัดสินถูกคุ้ม
//      มาตลอด แต่ JSX ที่แปลงมันเป็นปุ่มเคยถอดออกได้โดยชุดเทสต์ยังเขียว
//   6. **ด่านใบซ้ำ** (`historicalDuplicateGate`) — ด่านเดียวที่กันใบซ้ำก่อนถึง server
//   7. **ใบซ้ำต้องไม่ไปจอ failed** (`historicalSaveFailureState`) — จอนั้นเหลือปุ่ม "ปิด" ปุ่มเดียว
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  HISTORICAL_INTAKE_STEP_ORDER, emptyHistoricalInstallment, emptyHistoricalIntake, emptyHistoricalLine,
  firstStepWithIssues, historicalDoneSummary, historicalDuplicateGate, historicalExitActions,
  historicalIntakeBody, historicalIntakeLocalIssues, historicalIntakeZeroValue, historicalSaveExit,
  historicalSaveFailureState, historicalSaveLabel, issuesForStep, newHistoricalIntakeKey,
  stepOfIntakeField,
} from './historicalIntakeForm.js';
import { ZERO_VALUE_EXEMPT_REASON } from './historicalOrders.js';

/** ใบที่กรอกครบพร้อมส่ง — จุดตั้งต้นของเทสต์ส่วนใหญ่ */
const filled = (extra = {}) => ({
  ...emptyHistoricalIntake(),
  customerId: 'CUS-1',
  ownerId: 'user-1',
  team: 'SV',
  orderDate: '2024-06-01',
  amountsIncludeVat: true,
  vatRate: 7,
  refs: { quote: 'Q#250313-0004-D', express: '', invoice: 'IV6801041' },
  notes: 'เงื่อนไขเก็บเงินเดิม',
  lines: [{ ...emptyHistoricalLine(), installationPoint: 'Empire Tower ล็อบบี้ ชั้น G', productId: 'PRD-1', qty: '2', serviceRounds: '36', lineAmount: 60320 }],
  installments: [{ ...emptyHistoricalInstallment(), label: 'งวด 3/3', amount: 30160, dueDate: '2026-09-30' }],
  ...extra,
});

// ── ขั้นและการแมปช่อง ──────────────────────────────────────────────────────────────

test('ขั้นเรียง ใบ → จุดติดตั้ง → งวดและด่านเงิน → ตรวจก่อนบันทึก', () => {
  assert.deepEqual(HISTORICAL_INTAKE_STEP_ORDER, ['doc', 'lines', 'money', 'review']);
});

/* ชื่อช่องมาจาก `planHistoricalOrder` ตรง ๆ — แมปผิดที่เดียว = ผู้คีย์เด้งไปขั้นที่ไม่มีช่องนั้น */
test('ช่องของ plan.errors ถูกจัดเข้าขั้นที่ช่องนั้นอยู่จริง', () => {
  for (const field of ['customerId', 'ownerId', 'team', 'orderDate', 'vatRate', 'notes', 'running', 'deal']) {
    assert.equal(stepOfIntakeField(field), 'doc', field);
  }
  for (const field of ['refs.quote', 'refs.express', 'refs.invoice']) {
    assert.equal(stepOfIntakeField(field), 'doc', field);
  }
  assert.equal(stepOfIntakeField('lines'), 'lines');
  assert.equal(stepOfIntakeField('lines.0'), 'lines');
  assert.equal(stepOfIntakeField('installments'), 'money');
  assert.equal(stepOfIntakeField('installments.2'), 'money');
  assert.equal(stepOfIntakeField('paymentGateExemptReason'), 'money');
  // ช่องที่ยังไม่รู้จัก (API เพิ่มช่องใหม่) ต้องไม่หายเงียบ — ตกที่ขั้นแรกซึ่งเห็นแน่นอน
  assert.equal(stepOfIntakeField('somethingNew'), 'doc');
});

/* 🔴 หัวใจของขั้น ①: "ต้องมีอย่างน้อย 1 จุดติดตั้ง" จริงเสมอตอนอยู่ขั้นแรก
   ⇒ ถ้าโชว์ที่ขั้น ① ผู้คีย์จะเห็นข้อผิดพลาดที่แก้ตรงนั้นไม่ได้ทุกครั้งที่กดต่อไป */
test('⭐ ขั้น ① ไม่โชว์ error ของจุดติดตั้ง — มันเป็นเรื่องของขั้น ②', () => {
  const errors = [
    { field: 'customerId', message: 'ต้องเลือกลูกค้า' },
    { field: 'lines', message: 'ต้องมีอย่างน้อย 1 จุดติดตั้ง' },
  ];
  assert.deepEqual(issuesForStep(errors, 'doc').map((e) => e.field), ['customerId']);
  assert.deepEqual(issuesForStep(errors, 'lines').map((e) => e.field), ['lines']);
  assert.equal(firstStepWithIssues(errors), 'doc');
  assert.equal(firstStepWithIssues([{ field: 'installments.0', message: 'x' }]), 'money');
  assert.equal(firstStepWithIssues([]), null);
});

// ── สี่ช่องที่ API เติมคำตอบให้เงียบ ๆ ────────────────────────────────────────────────

/* 🐞 ไม่ส่ง `amountsIncludeVat` = server ถือว่า true · ไม่ส่ง `vatRate` = 7 · ไม่ส่ง `team`
   = ทีมหลักของ AE ⇒ ผู้คีย์ไม่มีทางรู้ว่าใบลงฐาน VAT ไหน/ทีมไหน (ทีมอยู่ในลายนิ้วมือคำขอ
   ⇒ แก้ทีหลังไม่ได้) — สี่ตัวนี้จึงเป็นด่านฝั่งจอโดยเจตนา ไม่ใช่กฎซ้ำ */
test('⭐ ยอดรวม VAT / อัตรา VAT ต้องเลือกเอง — ค่าตั้งต้นเงียบ ๆ ของ API ไม่นับว่าเลือกแล้ว', () => {
  const fresh = emptyHistoricalIntake();
  const fields = historicalIntakeLocalIssues(fresh).map((issue) => issue.field);
  assert.deepEqual(fields, ['amountsIncludeVat', 'vatRate']);

  // เลือก "ยังไม่รวม VAT" (false) และ 0% — ทั้งคู่เป็นค่าที่ falsy ต้องนับว่าเลือกแล้ว
  const picked = { ...fresh, amountsIncludeVat: false, vatRate: 0 };
  assert.deepEqual(historicalIntakeLocalIssues(picked), []);
});

test('ช่องทีมบังคับเฉพาะตอน AE อยู่ตั้งแต่ 2 ทีม', () => {
  const state = { ...emptyHistoricalIntake(), amountsIncludeVat: true, vatRate: 7 };
  assert.deepEqual(historicalIntakeLocalIssues(state, { ownerTeams: ['SV'] }), []);
  assert.deepEqual(historicalIntakeLocalIssues(state, { ownerTeams: [] }), []);

  const two = historicalIntakeLocalIssues(state, { ownerTeams: ['ODM', 'SV'] });
  assert.deepEqual(two.map((issue) => issue.field), ['team']);
  assert.equal(stepOfIntakeField(two[0].field), 'doc');

  assert.deepEqual(historicalIntakeLocalIssues({ ...state, team: 'SV' }, { ownerTeams: ['ODM', 'SV'] }), []);
  // ทีมที่ค้างอยู่แต่ไม่ใช่ทีมของ AE คนใหม่ = ยังไม่ได้เลือก (server จะถอยเป็นทีมหลักเงียบ ๆ)
  assert.deepEqual(
    historicalIntakeLocalIssues({ ...state, team: 'KA' }, { ownerTeams: ['ODM', 'SV'] }).map((i) => i.field),
    ['team'],
  );
});

/* 🔴 API **ไม่มีบูลีนของสวิตช์ยกเว้น** — `planHistoricalOrder` อ่านแต่ข้อความเหตุผล และ
   เหตุผล null = "ไม่ยกเว้น" ซึ่งไม่ใช่ error ⇒ สวิตช์เปิด + เหตุผลว่าง = ใบลงฐานแบบไม่ยกเว้น
   โดยไม่มีอะไรฟ้อง (แถบท้ายขั้น ③ เคยบอกตรงข้ามว่า "ด่านเงินยกเว้นแล้ว") · นัดบริการติดด่าน
   ทุกครั้ง และเฟส 2a ไม่มีจอยกเว้นย้อนหลัง ⇒ ทางกลับเดียวคือแอดมินลบใบแล้วคีย์ใหม่ */
test('⭐ สวิตช์ยกเว้นเปิดแต่เหตุผลว่าง = ด่านของขั้น ③ ไม่ใช่ใบที่บันทึกได้', () => {
  const base = { ...emptyHistoricalIntake(), amountsIncludeVat: true, vatRate: 7 };
  const open = { ...base, exempt: true, exemptReason: '   ' };
  const issues = historicalIntakeLocalIssues(open);
  assert.deepEqual(issues.map((issue) => issue.field), ['paymentGateExemptReason']);
  assert.match(issues[0].message, /10–500/, 'ต้องเป็นข้อความตัวเดียวกับที่ server ตอบ (exemptReasonError)');
  assert.equal(stepOfIntakeField(issues[0].field), 'money', 'ต้องเด้งกลับไปที่ขั้นที่ช่องเหตุผลอยู่');

  // สั้นเกิน 10 ตัวก็ยังไม่ผ่าน · ครบแล้วผ่าน
  assert.equal(historicalIntakeLocalIssues({ ...base, exempt: true, exemptReason: 'สั้นไป' }).length, 1);
  assert.deepEqual(historicalIntakeLocalIssues({ ...base, exempt: true, exemptReason: 'เก็บเงินนอกระบบครบแล้ว' }), []);
  // ปิดสวิตช์ = ไม่ใช่การตัดสินใจที่ค้าง ⇒ ไม่มีด่าน
  assert.deepEqual(historicalIntakeLocalIssues({ ...base, exempt: false, exemptReason: '' }), []);
});

/* ใบยอด 0 ยกเว้นอัตโนมัติและตัวประกอบ body ทิ้งเหตุผลเสมอ ⇒ ด่านข้างบนต้องไม่ไปบังคับให้พิมพ์
   เหตุผลที่ไม่มีวันถูกส่ง (สวิตช์ของใบยอด 0 ล็อกเปิดไว้) */
test('ใบยอด 0 ไม่ติดด่านเหตุผล — ยกเว้นอัตโนมัติ เหตุผลเป็นของระบบ', () => {
  const zero = filled({
    lines: [{ ...emptyHistoricalLine(), installationPoint: 'จุด', qty: '1', lineAmount: 0 }],
    exempt: true,
    exemptReason: '',
  });
  assert.deepEqual(historicalIntakeLocalIssues(zero), []);
});

// ── ตัวประกอบ body ────────────────────────────────────────────────────────────────

test('พรีวิวกับบันทึกใช้ body ก้อนเดียวกัน ต่างแค่ preview/intakeKey/acknowledgeDuplicates', () => {
  const state = filled();
  const preview = historicalIntakeBody(state, { preview: true, intakeKey: 'key-1' });
  const commit = historicalIntakeBody(state, { preview: false, intakeKey: 'key-1', acknowledgeDuplicates: true });
  assert.equal(preview.preview, true);
  assert.equal(commit.preview, false);
  assert.equal(commit.acknowledgeDuplicates, true);
  assert.equal(preview.acknowledgeDuplicates, undefined);
  const { preview: _p1, acknowledgeDuplicates: _a1, ...restPreview } = preview;
  const { preview: _p2, acknowledgeDuplicates: _a2, ...restCommit } = commit;
  assert.deepEqual(restPreview, restCommit, 'ทุกช่องที่เหลือต้องเท่ากันเป๊ะ ไม่งั้นลายนิ้วมือคำขอเพี้ยน');
});

/* 🪤 กับดักเงียบของ API — ส่งคีย์พวกนี้ไปแม้ค่าเป็น null ก็ตีกลับทั้งใบ */
test('🪤 บรรทัดไม่มีคีย์ zoneId · งวดไม่มีคีย์ status · running เป็น true ตายตัว', () => {
  const state = filled();
  state.lines[0].zoneId = null;              // ของที่หลุดมาจาก state (เช่นก๊อปแถวเก่า)
  state.installments[0].status = 'pending';
  const body = historicalIntakeBody(state, { preview: true, intakeKey: 'k' });
  assert.equal(Object.prototype.hasOwnProperty.call(body.lines[0], 'zoneId'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(body.installments[0], 'status'), false);
  assert.equal(body.running, true);
  assert.deepEqual(Object.keys(body.lines[0]).sort(),
    ['installationPoint', 'lineAmount', 'productId', 'qty', 'serviceRounds']);
  assert.deepEqual(Object.keys(body.installments[0]).sort(),
    ['amount', 'coversFrom', 'coversTo', 'dueDate', 'label']);
  // `key` ของ React ต้องไม่หลุดขึ้น API ด้วย
  assert.equal(body.lines[0].key, undefined);
});

test('ไม่ส่งรหัสการคีย์ตอนยังไม่มี — พรีวิวไม่บังคับ แต่บันทึกบังคับ (route ตรวจเอง)', () => {
  const body = historicalIntakeBody(filled(), { preview: true });
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'intakeKey'), false);
  assert.equal(historicalIntakeBody(filled(), { preview: true, intakeKey: 'k' }).intakeKey, 'k');
});

test('ช่องว่างกลายเป็น null ไม่ใช่สตริงว่าง — เลขเอกสารเดิมที่เว้นไว้ต้องไม่กลายเป็นค่าที่ค้นเจอ', () => {
  const body = historicalIntakeBody(filled(), { preview: true, intakeKey: 'k' });
  assert.equal(body.refs.express, null);
  assert.equal(body.refs.quote, 'Q#250313-0004-D');
  assert.equal(body.team, 'SV');
  assert.equal(historicalIntakeBody(emptyHistoricalIntake(), { preview: true }).notes, null);
});

// ── ใบยอด 0 ───────────────────────────────────────────────────────────────────────

test('ใบยอด 0 = มีบรรทัดและยอดรวมเป็น 0 เท่านั้น', () => {
  const zero = filled({ lines: [{ ...emptyHistoricalLine(), installationPoint: 'จุด', qty: '1', lineAmount: 0 }] });
  assert.equal(historicalIntakeZeroValue(zero), true);
  assert.equal(historicalIntakeZeroValue(filled()), false);
  // ยังไม่กรอกยอด ≠ ยอด 0 (server ก็ถือว่า linesMoneyOk เท็จ ⇒ ไม่ใช่ใบยอด 0)
  assert.equal(historicalIntakeZeroValue(filled({ lines: [{ ...emptyHistoricalLine(), lineAmount: null }] })), false);
  assert.equal(historicalIntakeZeroValue({ ...emptyHistoricalIntake(), lines: [] }), false);
});

/* 🔴 มติข้อ 11: ใบยอด 0 ยกเว้นด่านเงิน **อัตโนมัติและถอนไม่ได้** — API ไม่บังคับข้อนี้
   (ส่งเหตุผลไป = เก็บเหตุผลนั้นแทนข้อความตายตัวและเลิกถือว่าอัตโนมัติ) ⇒ กรอบนี้จริงได้
   เพราะตัวประกอบ body ทิ้งเหตุผลที่ผู้คีย์เคยพิมพ์ไว้ก่อนยอดกลายเป็น 0 */
test('⭐ ใบยอด 0 ส่ง paymentGateExemptReason: null เสมอ แม้เคยเปิดสวิตช์และพิมพ์เหตุผลไว้', () => {
  const zero = filled({
    lines: [{ ...emptyHistoricalLine(), installationPoint: 'จุด', qty: '1', lineAmount: 0 }],
    exempt: true,
    exemptReason: 'ลูกค้าชำระผ่าน Express แล้วทั้งหมด',
  });
  const body = historicalIntakeBody(zero, { preview: true, intakeKey: 'k' });
  assert.equal(body.paymentGateExemptReason, null);
  assert.notEqual(body.paymentGateExemptReason, ZERO_VALUE_EXEMPT_REASON,
    'ห้ามส่งข้อความตายตัวกลับไป — ปล่อยให้ server เป็นคนเติมเองถึงจะนับว่าอัตโนมัติ');
});

test('ใบยอดปกติ: ปิดสวิตช์ = null · เปิดสวิตช์ = เหตุผลที่พิมพ์', () => {
  assert.equal(historicalIntakeBody(filled({ exempt: false, exemptReason: 'พิมพ์ค้างไว้' }), {}).paymentGateExemptReason, null);
  assert.equal(
    historicalIntakeBody(filled({ exempt: true, exemptReason: '  เก็บเงินนอกระบบครบแล้ว  ' }), {}).paymentGateExemptReason,
    'เก็บเงินนอกระบบครบแล้ว',
  );
});

// ── รหัสการคีย์ ────────────────────────────────────────────────────────────────────

test('รหัสการคีย์ออกใหม่ได้ไม่ซ้ำ และใช้ซ้ำได้ตลอดใบเดียวกัน', () => {
  const a = newHistoricalIntakeKey();
  const b = newHistoricalIntakeKey();
  assert.notEqual(a, b);
  assert.ok(a.length > 8 && a.length <= 200, 'ยาวไม่เกินเพดาน 200 ของ route');
  // ส่งซ้ำด้วยรหัสเดิม + ข้อมูลเดิม = body เดิมทุกตัวอักษร ⇒ RPC คืนใบเดิม (replayed)
  const state = filled();
  assert.deepEqual(
    historicalIntakeBody(state, { preview: false, intakeKey: a }),
    historicalIntakeBody(state, { preview: false, intakeKey: a }),
  );
});

// ── ทางออกตอนบันทึกไม่สำเร็จ ─────────────────────────────────────────────────────────

const apiError = (status, data) => ({ name: 'ApiError', status, data, message: data?.error });

/* 🔴 รหัสคีย์ชน = ข้อมูลชุดนี้ใช้ต่อไม่ได้เลย — ห้ามมีปุ่ม "กลับไปแก้" เพราะแก้แล้วกด
   ใหม่จะชนอีกทุกครั้ง (RPC เทียบลายนิ้วมือกับใบที่มีอยู่แล้วของรหัสนั้น) */
test('⭐ 409 รหัสคีย์ชน → เปิดใบที่สร้างไว้ · ไม่มี "กลับไปแก้" · รหัสหมดอายุ', () => {
  const exit = historicalSaveExit(apiError(409, {
    error: 'คำขอนี้ถูกบันทึกไปแล้วด้วยข้อมูลอีกชุด (หรือใบถูกยกเลิกแล้ว) — เปิดใบที่สร้างไว้แทนการส่งซ้ำ',
    code: 'historical_so_intake_key_conflict',
    existingOrderId: 'SOR-Habcdef0123456789',
  }));
  assert.equal(exit.kind, 'intake_key_conflict');
  assert.equal(exit.existingOrderId, 'SOR-Habcdef0123456789');
  assert.equal(exit.canOpenExisting, true);
  assert.equal(exit.canEdit, false);
  assert.equal(exit.canRetry, false);
  assert.equal(exit.keySpent, true);
  assert.match(exit.hint, /รหัสการคีย์ของรอบนี้ใช้ต่อไม่ได้/);
  assert.match(exit.message, /เปิดใบที่สร้างไว้แทนการส่งซ้ำ/, 'ข้อความต้องเป็นของ server ไม่ใช่คำที่ตั้งเอง');
});

test('409 ชนการย้ายเจ้าของดีล → บันทึกอีกครั้งด้วยรหัสเดิม พร้อมคำยืนยันว่ายังไม่มีอะไรลงฐาน', () => {
  const exit = historicalSaveExit(apiError(409, {
    error: 'มีการย้ายเจ้าของดีลของลูกค้านี้พร้อมกัน กดบันทึกอีกครั้ง',
    code: 'historical_so_container_deal_race',
  }));
  assert.equal(exit.kind, 'container_deal_race');
  assert.equal(exit.canRetry, true);
  assert.equal(exit.keySpent, false);
  /* 🔴 ข้อเท็จจริงที่ต่างจากเน็ตหลุดและเป็นข้อเดียวที่ผู้คีย์ต้องรู้: RPC raise ข้างในทรานแซกชัน
     ⇒ ยังไม่มีอะไรลงฐาน · ใช้คำของเน็ตหลุด ("ห้ามแก้ฟอร์มก่อนกด") = ไม่ตอบคำถามที่เขากลัว */
  assert.match(exit.hint, /ยังไม่มีอะไรลงฐาน/);
  assert.notEqual(exit.hint, historicalSaveExit({ message: 'เน็ตหลุด' }).hint,
    'สองสถานการณ์นี้ต้องไม่ใช้ข้อความเดียวกัน');
});

test('409 ใบซ้ำที่ยังไม่ยืนยัน → กลับขั้น ④ พร้อมรายการชุดใหม่', () => {
  const duplicates = [{ id: 'SOR-H1', orderNumber: 'SO-26090040-0', orderDate: '2024-06-01', status: 'approved', refs: [] }];
  const exit = historicalSaveExit(apiError(409, {
    error: 'พบใบสั่งขายย้อนหลังของลูกค้านี้ที่วันที่หรือเลขเอกสารเดิมตรงกัน — ตรวจรายการแล้วยืนยันว่าไม่ซ้ำก่อนบันทึก',
    code: 'historical_so_duplicate_unacknowledged',
    duplicates,
  }));
  assert.equal(exit.kind, 'duplicate');
  assert.equal(exit.goToStep, 'review');
  assert.deepEqual(exit.duplicates, duplicates);
  assert.equal(exit.canRetry, false, 'กดบันทึกซ้ำเฉย ๆ จะชนด่านเดิม — ต้องเปิดสวิตช์ก่อน');
});

test('400 ข้อมูลผิด → ก้อนเดียวบอกทุกช่อง แล้วพาไปขั้นที่ช่องแรกอยู่', () => {
  const errors = [
    { field: 'installments.0', message: 'งวดที่ 1: ชื่องวดต้องมี 1–120 ตัวอักษร' },
    { field: 'orderDate', message: 'วันที่ใบ (วันเริ่มสัญญาจริง) ต้องอยู่ระหว่าง 01/01/2000 ถึงวันนี้' },
  ];
  const exit = historicalSaveExit(apiError(400, { error: errors[0].message, errors }));
  assert.equal(exit.kind, 'invalid');
  assert.equal(exit.canEdit, true);
  assert.equal(exit.goToStep, 'doc', 'ขั้นแรกที่มีปัญหา ไม่ใช่ช่องแรกในอาร์เรย์');
  assert.deepEqual(exit.errors, errors);
});

/* 403 ของ route ไม่มี `code` · 503 ก็ไม่มี ⇒ ต้องถอยไปดู status ไม่ใช่รอ code */
test('403 และ 503 ไม่มีรหัสติดมา — ปิดอย่างเดียว ไม่มีทางลองใหม่', () => {
  const forbidden = historicalSaveExit(apiError(403, { error: 'คีย์ใบสั่งขายย้อนหลังได้เฉพาะ AE Supervisor หรือ Admin' }));
  assert.equal(forbidden.kind, 'forbidden');
  assert.equal(forbidden.canRetry, false);
  assert.equal(forbidden.canEdit, false);

  const schema = historicalSaveExit(apiError(503, { error: 'ฐานข้อมูลยังไม่ได้รัน migration 0360 (ใบสั่งขายย้อนหลัง) — แจ้งผู้ดูแลระบบ' }));
  assert.equal(schema.kind, 'schema');
  assert.equal(schema.canRetry, false);
  assert.equal(schema.canEdit, false);
});

test('500 และเน็ตหลุด → ลองอีกครั้งด้วยรหัสเดิม (ถ้าใบลงไปแล้วจะได้ใบเดิมคืน)', () => {
  const five = historicalSaveExit(apiError(500, { error: 'ตรวจฐานข้อมูลไม่สำเร็จ: timeout' }));
  assert.equal(five.kind, 'unknown');
  assert.equal(five.canRetry, true);

  const offline = historicalSaveExit({ name: 'ApiNetworkError', message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — ตรวจอินเทอร์เน็ตแล้วลองอีกครั้ง' });
  assert.equal(offline.canRetry, true);
  assert.match(offline.message, /เชื่อมต่อเซิร์ฟเวอร์ไม่ได้/);
});

/* 🔴 `documentWorkflowErrors` แปลงรหัสของสายนี้อีกหลายตัวเป็น 404/409/500 ที่มี `code`
   แต่**ไม่มี** `errors[]` ⇒ เคยตกถังเดียวกับเน็ตหลุด: ปุ่ม "บันทึกอีกครั้ง" ส่งก้อนเดิมได้
   รหัสเดิมวนไม่รู้จบ และไม่มี "กลับไปแก้" ⇒ ทางออกจริงคือปิด = เสียใบทั้งใบ
   ของจริงที่ไปถึงตรงนี้: อีกคนย้ายเจ้าของดีลภาชนะระหว่างคีย์ ⇒ RPC ค้นดีลใหม่แล้วพบว่า
   ไม่ได้อยู่ในสภาพที่ผูกใบได้ (`historical_so_deal_invalid` · 0360) — แก้ AE แล้วส่งใหม่ได้ */
test('⭐ 404/409 ที่มีรหัสแต่ไม่มี errors[] → กลับไปแก้ · ห้ามมี "บันทึกอีกครั้ง"', () => {
  for (const [status, code] of [
    [409, 'historical_so_deal_invalid'],
    [409, 'historical_so_customer_inactive'],
    [409, 'sales_deals_historical_shape'],
    [404, 'historical_so_customer_not_found'],
  ]) {
    const exit = historicalSaveExit(apiError(status, { error: 'ดีลของใบย้อนหลังไม่อยู่ในสภาพที่ผูกใบได้', code }));
    assert.equal(exit.kind, 'blocked', code);
    assert.equal(exit.canRetry, false, `${code}: ส่งก้อนเดิมซ้ำไม่มีวันผ่าน`);
    assert.equal(exit.canEdit, true, `${code}: RPC raise = ทรานแซกชันถอย รหัสการคีย์ยังใช้ได้`);
    assert.equal(exit.goToStep, 'doc', code);
    assert.equal(exit.keySpent, false, code);
    assert.deepEqual(historicalExitActions(exit).map((a) => a.key), ['close', 'edit'], code);
  }
});

/* 4xx ที่ไม่มีทั้งรหัสและ errors[] — เดาทางออกให้ไม่ได้ ⇒ ปิดพร้อมข้อความของ server
   (เดิมตกถังเน็ตหลุดเหมือนกัน คือเสนอให้กดซ้ำกับ error ที่กดซ้ำไม่ผ่าน) */
test('4xx ที่ไม่มีรหัสและไม่มี errors[] → ปิดอย่างเดียว ไม่เสนอให้กดซ้ำ', () => {
  const exit = historicalSaveExit(apiError(429, { error: 'ส่งคำขอถี่เกินไป' }));
  assert.equal(exit.canRetry, false);
  assert.equal(exit.canEdit, false);
  assert.equal(exit.hint, null);
  assert.deepEqual(historicalExitActions(exit).map((a) => a.key), ['close']);
});

// ── ปุ่มที่เรนเดอร์จริงบนจอ "บันทึกไม่สำเร็จ" ───────────────────────────────────────────

/* 🔴 ตัวตัดสินถูกคุ้มครบตั้งแต่ต้น แต่ JSX ที่แปลงมันเป็นปุ่มไม่มีใครคุ้ม — ถอด
   `{exit.canOpenExisting && …}` ออกแล้วชุดเทสต์ยังเขียว ทั้งที่ปุ่มนั้นเป็น **ที่เดียวบนจอ**
   ที่มี id ของใบที่เพิ่งเกิด (ข้อความ/คำแนะนำไม่มี id เลย) ⇒ ยกมาเป็นข้อมูลแล้วตรึงที่นี่ */
test('⭐ 409 รหัสคีย์ชน: ปุ่มต้องมี "เปิดใบที่สร้างไว้" พร้อม id — ไม่มี = ไม่มีทางรู้ว่าใบไหน', () => {
  const exit = historicalSaveExit(apiError(409, {
    error: 'คำขอนี้ถูกบันทึกไปแล้วด้วยข้อมูลอีกชุด',
    code: 'historical_so_intake_key_conflict',
    existingOrderId: 'SOR-Habcdef0123456789',
  }));
  const actions = historicalExitActions(exit);
  assert.deepEqual(actions.map((a) => a.key), ['close', 'open']);
  assert.equal(actions[1].orderId, 'SOR-Habcdef0123456789');
  assert.deepEqual(actions.map((a) => a.label), ['ปิด', 'เปิดใบที่สร้างไว้']);
});

/* 🔴 ถ้า "บันทึกอีกครั้ง" หายไปจากเน็ตหลุด ทางเดียวที่เหลือคือเปิดโมดัลใหม่ = ได้รหัสการคีย์
   ใหม่ = ด่านกันส่งซ้ำถูกข้าม ⇒ ใบซ้ำของจริง */
test('⭐ 500/เน็ตหลุด: ต้องมี "บันทึกอีกครั้ง" — ไม่มี = ผู้คีย์ถูกบังคับให้มินต์รหัสใหม่', () => {
  for (const err of [apiError(500, { error: 'timeout' }), { message: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' }]) {
    const actions = historicalExitActions(historicalSaveExit(err));
    assert.deepEqual(actions.map((a) => a.key), ['close', 'retry']);
  }
});

test('400 พร้อม errors[]: มี "กลับไปแก้" ที่พกช่องผิดและขั้นปลายทางไปด้วย', () => {
  const errors = [{ field: 'installments.0', message: 'งวดที่ 1: ชื่องวดต้องมี 1–120 ตัวอักษร' }];
  const actions = historicalExitActions(historicalSaveExit(apiError(400, { error: errors[0].message, errors })));
  assert.deepEqual(actions.map((a) => a.key), ['close', 'edit']);
  assert.deepEqual(actions[1].errors, errors);
  assert.equal(actions[1].goToStep, 'money');
  assert.equal(actions[1].carryMessage, null, 'มี error รายช่องแล้ว ไม่ต้องพกข้อความรวมไปซ้ำ');
});

/* 🐞 400 ที่ไม่มี `errors[]` (เช่น `historical_so_money_mismatch`) — ปุ่ม "กลับไปแก้" เคยล้าง
   ข้อความของ server ทิ้งแล้วทิ้งผู้คีย์ไว้ที่ขั้น ① กับแถบท้ายที่เขียนว่า "ครบแล้ว" */
test('⭐ 400 ที่ไม่มี errors[]: "กลับไปแก้" ต้องพกข้อความของ server ไปด้วย', () => {
  const exit = historicalSaveExit(apiError(400, {
    error: 'ยอดเงินของใบไม่สมดุล — โหลดพรีวิวใหม่แล้วบันทึกอีกครั้ง',
    code: 'historical_so_money_mismatch',
  }));
  const edit = historicalExitActions(exit).find((a) => a.key === 'edit');
  assert.ok(edit, 'ต้องมีทางกลับไปแก้');
  assert.equal(edit.carryMessage, 'ยอดเงินของใบไม่สมดุล — โหลดพรีวิวใหม่แล้วบันทึกอีกครั้ง');
  assert.deepEqual(edit.errors, []);
});

test('ทุกทางออกมี "ปิด" เป็นตัวแรกเสมอ และ 403/503 มีแค่ปิด', () => {
  for (const err of [apiError(403, { error: 'ไม่มีสิทธิ์' }), apiError(503, { error: 'ยังไม่ได้รัน 0360' })]) {
    assert.deepEqual(historicalExitActions(historicalSaveExit(err)).map((a) => a.key), ['close']);
  }
  assert.deepEqual(historicalExitActions(null).map((a) => a.key), ['close']);
});

/* 🔴 ทางออกของใบซ้ำตั้ง canRetry/canEdit/canOpenExisting เป็นเท็จหมด **โดยเจตนา** เพราะคน
   ที่พาไปขั้น ④ คือโมดัล ไม่ใช่จอ "บันทึกไม่สำเร็จ" ⇒ ถ้ามันหลุดไปจอนั้น ปุ่มที่เหลือคือ
   "ปิด" ปุ่มเดียว = ข้อมูลที่คีย์ทั้งใบหายและรหัสการคีย์หมดอายุ */
test('⭐ ใบซ้ำไม่มีวันไปจอ "บันทึกไม่สำเร็จ" — กลับขั้น ④ พร้อมสวิตช์ปิดเสมอ', () => {
  const duplicates = [{ id: 'SOR-H1', orderNumber: 'SO-26090040-0' }];
  const state = historicalSaveFailureState(historicalSaveExit(apiError(409, {
    error: 'พบใบสั่งขายย้อนหลังของลูกค้านี้ที่วันที่หรือเลขเอกสารเดิมตรงกัน',
    code: 'historical_so_duplicate_unacknowledged',
    duplicates,
  })));
  assert.equal(state.step, 'review');
  assert.equal(state.exit, null, 'ไม่ตั้ง exit = ไม่มีทางเรนเดอร์จอ failed');
  assert.deepEqual(state.duplicates, duplicates);
  assert.equal(state.acknowledged, false, 'รายการชุดใหม่ = ต้องตรวจใหม่ ไม่สืบทอดการยืนยันเดิม');
  assert.match(state.error, /ตรงกัน/);
});

test('รหัสอื่นไปจอ "บันทึกไม่สำเร็จ" โดยไม่แตะรายการใบซ้ำที่ค้างอยู่', () => {
  const exit = historicalSaveExit(apiError(500, { error: 'timeout' }));
  const state = historicalSaveFailureState(exit);
  assert.equal(state.step, 'failed');
  assert.equal(state.exit, exit);
  assert.equal(state.duplicates, null, 'null = อย่าไปยุ่งกับ state เดิม');
  assert.equal(state.error, '');
});

// ── ด่านใบซ้ำของขั้น ④ ─────────────────────────────────────────────────────────────

/* 🔴 ใบที่อาจซ้ำ **ไม่ใช่ error ของพรีวิว** (`plan.errors` ว่าง) — ถ้าด่านนี้หายไป ปุ่มบันทึก
   กดผ่านทันทีและ RPC ตอบ 409 `historical_so_duplicate_unacknowledged` ⇒ ด่านนี้คือสิ่งเดียว
   ที่กันใบซ้ำจริงก่อนถึง server */
test('⭐ มีใบที่อาจซ้ำและยังไม่เปิดสวิตช์ = ติดด่าน พร้อมเหตุผลที่จะโชว์ตอนกด', () => {
  const duplicates = [{ id: 'SOR-H1' }];
  const gated = historicalDuplicateGate({ duplicates, acknowledged: false, warnings: ['ด่านสัญญา'] });
  assert.equal(gated.gated, true);
  assert.match(gated.blockedNote, /เปิดสวิตช์นี้ก่อน/);
  assert.match(gated.buttonTitle, /ตรวจแล้ว ไม่ใช่ใบซ้ำ/);
  assert.equal(gated.footNote, 'ยังบันทึกไม่ได้ — เปิด “ตรวจแล้ว ไม่ใช่ใบซ้ำ” ก่อน · ข้อผิดพลาด 0 · คำเตือน 1 ข้อ');

  const open = historicalDuplicateGate({ duplicates, acknowledged: true, warnings: ['ด่านสัญญา'] });
  assert.equal(open.gated, false);
  assert.equal(open.blockedNote, null);
  assert.equal(open.footNote, 'ไม่มีข้อผิดพลาด · คำเตือน 1 ข้อ');
});

test('ไม่มีใบที่อาจซ้ำ = ไม่มีด่านนี้เลย (ไม่ใช่ด่านที่เปิดค้างไว้)', () => {
  const none = historicalDuplicateGate({ duplicates: [], acknowledged: false, warnings: [] });
  assert.equal(none.gated, false);
  assert.equal(none.footNote, 'ไม่มีข้อผิดพลาด · คำเตือน 0 ข้อ');
  assert.equal(historicalDuplicateGate().gated, false, 'ยังไม่มีพรีวิวก็ต้องไม่ระเบิด');
});

// ── ป้ายบนปุ่มและจอจบ ───────────────────────────────────────────────────────────────

test('ปุ่มบันทึกนับของที่จะสร้าง · ท่อนที่เป็น 0 หายไป · "ดีลใหม่" ขึ้นตามพรีวิว', () => {
  assert.equal(
    historicalSaveLabel({ lines: [1, 2], installments: [1], deal: { willCreate: true } }),
    'บันทึก · ใบ 1 · จุดติดตั้ง 2 · งวด 1 · ดีลใหม่ 1',
  );
  assert.equal(
    historicalSaveLabel({ lines: [1], installments: [], deal: { willCreate: false, code: 'DL-1' } }),
    'บันทึก · ใบ 1 · จุดติดตั้ง 1',
    'ใบที่ไม่มีงวดต้องไม่อ่านว่า "งวด 0"',
  );
});

test('จอจบอ่านจาก response ตรง ๆ — "(สร้างใหม่)" ขึ้นเฉพาะตอนดีลเพิ่งเกิด', () => {
  const result = {
    order: { orderNumber: 'SO-26090043-0' },
    lines: [1, 2],
    installments: [1],
    deal: { code: 'DL-260900017' },
    dealCreated: true,
  };
  assert.equal(historicalDoneSummary(result), 'SO-26090043-0 · 2 จุดติดตั้ง · งวด 1 รอชำระ · ดีล DL-260900017 (สร้างใหม่)');
  assert.equal(
    historicalDoneSummary({ ...result, installments: [], dealCreated: false }),
    'SO-26090043-0 · 2 จุดติดตั้ง · ดีล DL-260900017',
  );
});
