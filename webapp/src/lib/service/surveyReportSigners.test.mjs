// ── ผู้ลงนามของรายงานการประเมินพื้นที่ (PR-SIG §2 · มติเจ้าของ 09/10/2026) ──────────────────────────
//
// ⭐ ล็อกห้าเรื่อง:
//   ① ที่นั่ง = คนบนนัด (ผู้ประเมิน) + คนส่งผล (ผู้ตรวจสอบและอนุมัติ) — ที่นั่งที่ไม่มีชื่อไม่เกิด
//   ② ทุกแถวของตารางข้อความในสเปก §2.2 ตรงตัวอักษร · คนเดียวสองที่นั่ง = บรรทัดเดียว · ไม่มี id ของผู้ใช้ในข้อความ
//   ③ 🔴 กติกาปิด = ทุกฟังก์ชันเงียบ · ไม่รู้ = ไม่มี (fail closed)
//   ④ ลายเซ็นฉบับที่จะพิมพ์ออกเมื่อครบทุกที่นั่งเท่านั้น และไม่ออกเมื่อใบติดข้อกันของใบจากแบบ
//   ⑤ ไฟล์นี้ล้วน — ใบตัวอย่างฝั่ง client ลากมาได้ · ป้ายที่นั่งตรงกับหัวที่นั่งบนกระดาษ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SURVEY_SIGN_FAILURE, SURVEY_SIGN_PERMANENT_REASONS } from './surveyReportImages.js';
import {
  SURVEY_SIGN_ACCOUNT, SURVEY_SIGN_FAILURE_LABELS, SURVEY_SIGN_RULE, SURVEY_SIGN_SEATS, SURVEY_SIGN_SEAT_LABEL,
  surveyReportSeatEligible, surveyReportSignFileLines, surveyReportSignatureIssues, surveyReportSignerVersions, surveyReportSigners,
  surveyReportSignersText,
} from './surveyReportSigners.js';
import { buildSurveyReportSnapshot } from './surveyReportSnapshot.js';
import { surveyReportView } from './surveyReportView.js';
import { surveyReportInputsFromFixture, syntheticSurveyFixture } from './surveyReportTestKit.mjs';

const version = (id, extra = {}) => ({
  versionId: id, versionNumber: 1, storagePath: `users/x/${id}.png`, sha256: `sha256:${'a'.repeat(64)}`, width: 640, height: 240, ...extra,
});

/** อินพุตเล็ก ๆ ของใบลงหน้างาน — ผู้ประเมิน U-lead · ผู้ส่งผล U-head · ลายเซ็นตาม `have` */
function inputs({ have = ['U-lead', 'U-head'], rule = SURVEY_SIGN_RULE, ...over } = {}) {
  const base = {
    request: { id: 'DR-1', answeredAt: '2026-10-09T03:00:00.000Z', answeredById: 'U-head', answeredByName: 'Head Approver' },
    visit: { assigneeId: 'U-lead', assigneeName: 'Lead Assessor' },
    zones: [{ id: 'Z1', status: 'ok' }],
    signatures: Object.fromEntries(['U-lead', 'U-head'].map((id) => [id, have.includes(id) ? version(`V-${id}`) : null])),
    assigneeAccount: 'active',
    signerEligible: { assessor: true, approver: true },
  };
  return { ...base, ...(rule ? { signatureRule: rule } : {}), ...over };
}

/* ══ ① ที่นั่ง ═══════════════════════════════════════════════════════════ */

test('ที่นั่ง: ผู้ประเมิน = คนบนนัด · ผู้ตรวจสอบและอนุมัติ = คนส่งผล — ตามลำดับบนกระดาษ', () => {
  assert.deepEqual(surveyReportSigners(inputs()), [
    { seat: 'assessor', userId: 'U-lead', name: 'Lead Assessor' },
    { seat: 'approver', userId: 'U-head', name: 'Head Approver' },
  ]);
  assert.deepEqual(SURVEY_SIGN_SEATS, ['assessor', 'approver']);
});

test('ที่นั่งที่ไม่มีชื่อไม่เกิด: ไม่มีนัด (ใบจากแบบ) · ยังไม่ส่งผล · ชื่อว่าง — id ว่างได้เป็น null', () => {
  assert.deepEqual(surveyReportSigners(inputs({ visit: null })).map((s) => s.seat), ['approver']);
  assert.deepEqual(surveyReportSigners(inputs({ visit: { assigneeId: 'U-lead', assigneeName: '  ' } })).map((s) => s.seat), ['approver']);
  assert.deepEqual(
    surveyReportSigners(inputs({ request: { id: 'DR-1', answeredAt: null, answeredByName: 'Head Approver' } })).map((s) => s.seat),
    ['assessor'],
  );
  assert.deepEqual(surveyReportSigners(inputs({ request: { id: 'DR-1', answeredAt: 'x', answeredByName: '' } })).map((s) => s.seat), ['assessor']);
  assert.deepEqual(surveyReportSigners(inputs({ visit: { assigneeId: null, assigneeName: 'ชื่อเฉย ๆ' } }))[0], {
    seat: 'assessor', userId: null, name: 'ชื่อเฉย ๆ',
  });
  assert.deepEqual(surveyReportSigners({}), []);
  assert.deepEqual(surveyReportSigners(null), []);
  // ไม่ถามกติกา — ที่นั่งมีชื่อไหมเป็นเรื่องของข้อมูล
  assert.equal(surveyReportSigners(inputs({ rule: null })).length, 2);
});

test('ป้ายที่นั่งเป็นคำเดียวกับหัวที่นั่งบนกระดาษ (surveyReportView) · ที่ไปเพิ่มลายเซ็น = /account', () => {
  const built = buildSurveyReportSnapshot(surveyReportInputsFromFixture(syntheticSurveyFixture()), { mode: 'freeze' });
  const view = surveyReportView(built.snapshot, { version: 'customer' });
  assert.equal(SURVEY_SIGN_SEAT_LABEL.assessor, view.signoff.assessor.title);
  assert.equal(SURVEY_SIGN_SEAT_LABEL.approver, view.signoff.approver.title);
  assert.deepEqual(SURVEY_SIGN_ACCOUNT, { label: 'บัญชีของฉัน', href: '/account' });
  assert.equal(SURVEY_SIGN_RULE, 'required');
});

/* ══ ② ข้อความ (สเปก §2.2 — ตรงตัวอักษร) ══════════════════════════════════ */

const texts = (i) => surveyReportSignatureIssues(i).map((row) => row.text);

test('🔴 ข้อความ: ผู้ประเมินยังไม่มีลายเซ็น', () => {
  assert.deepEqual(surveyReportSignatureIssues(inputs({ have: ['U-head'] })), [{
    kind: 'content', sign: true, userId: 'U-lead', seats: ['assessor'],
    text: 'ผู้ประเมิน Lead Assessor ยังไม่มีลายเซ็นในระบบ — ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” ก่อน',
  }]);
});

test('🔴 ข้อความ: ผู้ส่งผลยังไม่มีลายเซ็น — ใบยังไม่ส่ง (เสนอให้หัวหน้าอีกคนส่ง) กับใบที่ส่งไปแล้ว (เสนอดึงผลกลับ)', () => {
  assert.deepEqual(surveyReportSignatureIssues(inputs({ have: ['U-lead'], answerPending: true })), [{
    kind: 'content', sign: true, userId: 'U-head', seats: ['approver'],
    text: 'ผู้ตรวจสอบและอนุมัติ Head Approver (ผู้ส่งผล) ยังไม่มีลายเซ็นในระบบ — เพิ่มที่ “บัญชีของฉัน” ก่อนส่งผล หรือให้หัวหน้าที่มีลายเซ็นแล้วเป็นผู้ส่งผล',
  }]);
  assert.deepEqual(texts(inputs({ have: ['U-lead'] })), [
    'ผู้ตรวจสอบและอนุมัติ Head Approver (ผู้ส่งผล) ยังไม่มีลายเซ็นในระบบ — ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” หรือดึงผลกลับแล้วให้หัวหน้าที่มีลายเซ็นส่งใหม่',
  ]);
});

test('🔴 ข้อความ: คนเดียวสองที่นั่ง = บรรทัดเดียว เอ่ยทั้งสองที่นั่ง', () => {
  const same = inputs({
    request: { id: 'DR-1', answeredAt: '2026-10-09T03:00:00.000Z', answeredById: 'U-lead', answeredByName: 'Lead Assessor' },
    signatures: { 'U-lead': null },
  });
  assert.deepEqual(surveyReportSignatureIssues(same), [{
    kind: 'content', sign: true, userId: 'U-lead', seats: ['assessor', 'approver'],
    text: 'Lead Assessor (ผู้ประเมิน และผู้ตรวจสอบและอนุมัติ) ยังไม่มีลายเซ็นในระบบ — ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” ก่อน',
  }]);
  // กำลังกดส่งผลเอง: คนที่กดปุ่มได้ยังเข้าระบบได้ — ไม่บอกว่าบัญชีถูกปิดแม้ตัวอ่านบัญชีตอบว่าไม่พบ
  assert.equal(texts({ ...same, answerPending: true, assigneeAccount: 'missing' })[0], surveyReportSignatureIssues(same)[0].text);
});

test('🔴 ข้อความ: ผู้ประเมินที่บัญชีถูกปิดหรือถูกลบ — บอกตามจริง ไม่ชี้ไป “บัญชีของฉัน” · ยังเป็น content + sign', () => {
  for (const account of ['disabled', 'missing']) {
    assert.deepEqual(surveyReportSignatureIssues(inputs({ have: ['U-head'], assigneeAccount: account })), [{
      kind: 'content', sign: true, userId: 'U-lead', seats: ['assessor'],
      text: 'ผู้ประเมิน Lead Assessor ยังไม่มีลายเซ็นในระบบ และบัญชีถูกปิดหรือถูกลบแล้ว — เพิ่มลายเซ็นไม่ได้ แจ้งผู้ดูแลระบบ',
    }], account);
  }
  // ไม่รู้สถานะบัญชี (อ่านตำแหน่งไม่สำเร็จ) = ข้อความปกติ · บัญชีปิดแต่มีลายเซ็นแล้ว = ไม่มีบรรทัด
  assert.match(texts(inputs({ have: ['U-head'], assigneeAccount: null }))[0], /ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” ก่อน$/);
  assert.deepEqual(texts(inputs({ assigneeAccount: 'disabled' })), []);
  // สถานะบัญชีเป็นของผู้ประเมิน — ไม่แตะบรรทัดของผู้ส่งผล
  assert.match(texts(inputs({ have: [], assigneeAccount: 'disabled' }))[1], /^ผู้ตรวจสอบและอนุมัติ Head Approver \(ผู้ส่งผล\) ยังไม่มีลายเซ็นในระบบ — ให้เจ้าตัวเพิ่ม/);
});

test('🔴 ข้อความ: ที่นั่งที่พิมพ์ชื่อแต่ไม่ได้ผูกบัญชี = content ล้วน ไม่มี sign (ไม่มีใครเพิ่มลายเซ็นให้ได้)', () => {
  const orphan = inputs({ visit: { assigneeId: null, assigneeName: 'ช่างรายวัน' } });
  assert.deepEqual(surveyReportSignatureIssues(orphan), [{
    kind: 'content', text: 'ผู้ประเมิน ช่างรายวัน ไม่ได้ผูกกับบัญชีผู้ใช้ — ออกเอกสารไม่ได้ แจ้งผู้จัดคิวหรือผู้ดูแลระบบ',
  }]);
  const noHead = inputs({ request: { id: 'DR-1', answeredAt: 'x', answeredById: null, answeredByName: 'หัวหน้าเก่า' } });
  assert.deepEqual(texts(noHead), ['ผู้ตรวจสอบและอนุมัติ หัวหน้าเก่า ไม่ได้ผูกกับบัญชีผู้ใช้ — ออกเอกสารไม่ได้ แจ้งผู้จัดคิวหรือผู้ดูแลระบบ']);
});

test('สองคนไม่มีลายเซ็น = สองบรรทัด ผู้ประเมินก่อน · ทุกคนมีลายเซ็น = ไม่มีบรรทัด · ไม่มี id ของผู้ใช้ในข้อความไหนเลย', () => {
  const both = surveyReportSignatureIssues(inputs({ have: [] }));
  assert.deepEqual(both.map((row) => row.seats), [['assessor'], ['approver']]);
  assert.deepEqual(texts(inputs()), []);
  const every = [
    inputs({ have: [] }), inputs({ have: [], answerPending: true }), inputs({ have: [], assigneeAccount: 'disabled' }),
    inputs({ visit: { assigneeId: null, assigneeName: 'ช่างรายวัน' }, have: [] }),
  ].flatMap(texts);
  assert.ok(every.length >= 7);
  for (const line of every) {
    assert.doesNotMatch(line, /U-lead|U-head/, line);
    assert.ok(!line.includes('undefined') && !line.includes('null'), line);
  }
});

/* ══ ③ กติกาปิด · ไม่รู้ = ไม่มี ══════════════════════════════════════════ */

test('🔴 กติกาปิด (ไม่มีคีย์ · ค่าอื่น) = ไม่มีบรรทัด ไม่มีผู้ลงนาม — แม้ไม่มีใครมีลายเซ็นเลย', () => {
  for (const rule of [null, 'off', 'on', true, 'REQUIRED']) {
    const off = inputs({ have: [], rule });
    assert.deepEqual(surveyReportSignatureIssues(off), [], String(rule));
    assert.deepEqual(surveyReportSignerVersions(inputs({ rule })), [], String(rule));
  }
  assert.deepEqual(surveyReportSignatureIssues(undefined), []);
  assert.deepEqual(surveyReportSignerVersions(undefined), []);
});

test('🔴 fail closed: กติกาเปิดแล้ว `signatures` หาย/ผิดรูป/แถวไม่มีฉบับ = ไม่มีใครมีลายเซ็น', () => {
  for (const signatures of [undefined, null, 'x', [], { 'U-lead': {} }, { 'U-lead': 'yes', 'U-head': { versionNumber: 1 } }]) {
    const i = inputs({ signatures });
    assert.equal(surveyReportSignatureIssues(i).length, 2, JSON.stringify(signatures));
    assert.deepEqual(surveyReportSignerVersions(i), [], JSON.stringify(signatures));
  }
  // คีย์ที่สืบทอดมา (ไม่ใช่ของตัวเอง) ไม่นับเป็นลายเซ็น
  const inherited = Object.create({ 'U-lead': version('V-x'), 'U-head': version('V-y') });
  assert.equal(surveyReportSignatureIssues(inputs({ signatures: inherited })).length, 2);
});

/* ══ ④ ลายเซ็นฉบับที่จะพิมพ์ ═══════════════════════════════════════════════ */

test('⭐ ลายเซ็นฉบับที่จะพิมพ์: คนละแถว พร้อมฉบับ — ออกเมื่อทุกที่นั่งที่พิมพ์ชื่อมีลายเซ็น', () => {
  assert.deepEqual(surveyReportSignerVersions(inputs()), [
    { seats: ['assessor'], userId: 'U-lead', name: 'Lead Assessor', version: version('V-U-lead') },
    { seats: ['approver'], userId: 'U-head', name: 'Head Approver', version: version('V-U-head') },
  ]);
  // ขาดคนเดียว = ว่างทั้งลิสต์ ("ไม่ว่าง" ต้องแปลว่าพิมพ์ได้ครบ)
  assert.deepEqual(surveyReportSignerVersions(inputs({ have: ['U-lead'] })), []);
  assert.deepEqual(surveyReportSignerVersions(inputs({ have: ['U-head'] })), []);
  assert.deepEqual(surveyReportSignerVersions(inputs({ visit: { assigneeId: null, assigneeName: 'ช่างรายวัน' } })), []);
});

test('คนเดียวสองที่นั่ง = แถวเดียว (ตัวเตรียมไฟล์อ่านลายเซ็นครั้งเดียว)', () => {
  const same = inputs({
    request: { id: 'DR-1', answeredAt: 'x', answeredById: 'U-lead', answeredByName: 'Lead Assessor' },
    signatures: { 'U-lead': version('V-1') },
  });
  assert.deepEqual(surveyReportSignerVersions(same), [
    { seats: ['assessor', 'approver'], userId: 'U-lead', name: 'Lead Assessor', version: version('V-1') },
  ]);
});

test('🔴 ใบที่มีพื้นที่ประเมินจากแบบ (ข้อกันเอกสาร) ไม่มีผู้ลงนามให้เตรียม — พื้นที่จากแบบที่ถูกตัดไม่นับ', () => {
  const mixed = inputs({ zones: [{ id: 'Z1', status: 'ok' }, { id: 'Z2', status: 'ok', method: 'drawing' }] });
  assert.deepEqual(surveyReportSignerVersions(mixed), []);
  const cut = inputs({ zones: [{ id: 'Z1', status: 'ok' }, { id: 'Z2', status: 'cut', method: 'drawing' }] });
  assert.equal(surveyReportSignerVersions(cut).length, 2);
  // ตัวหาบรรทัดไม่ดูข้อกัน — คนที่ข้ามคือ `surveyReportFreezeIssues` (เทสต์ของภาพนิ่งล็อกไว้)
  assert.equal(surveyReportSignatureIssues({ ...mixed, signatures: {} }).length, 2);
});

test('ไม่แก้อินพุต · ผลนิ่ง · แถวที่คืนไม่ใช่ตัวเดียวกับของอินพุต (ผู้เรียกแก้ `seats` แล้วของเดิมไม่เพี้ยน)', () => {
  const i = inputs({ have: ['U-head'] });
  const before = structuredClone(i);
  const a = surveyReportSignatureIssues(i);
  a[0].seats.push('x');
  assert.deepEqual(i, before);
  assert.deepEqual(surveyReportSignatureIssues(i)[0].seats, ['assessor']);
  const full = inputs();
  surveyReportSignerVersions(full)[0].seats.push('x');
  assert.deepEqual(surveyReportSignerVersions(full)[0].seats, ['assessor']);
});

/* ══ ④ข บัญชีของคนบนที่นั่งต้อง "นั่งที่นั่งนั้นได้" (ผลรีวิว 09/10 — มีลายเซ็นอย่างเดียวไม่พอ) ════════════════════
   ผู้ประเมิน = บัญชีฝ่ายบริการ · ผู้ตรวจสอบและอนุมัติ = ผู้มีสิทธิ์ส่งผลประเมิน — ตัวโหลดอ่านบัญชีแล้วตั้ง `signerEligible`
   🐞 รหัสผู้รับผิดชอบของนัดเป็นช่องที่แก้ได้ (PATCH นัด · เส้นมอบหมายของคำร้อง) และใบเก่าถูกตอบโดยคนที่ไม่ใช่หัวหน้าได้
      ⇒ เดิมลายเซ็นของใครก็ตามที่รหัสชี้ไปขึ้นกระดาษที่ส่งลูกค้า */

const eligible = (assessor, approver) => ({ signerEligible: { assessor, approver } });

test('🔴 ธงของที่นั่ง: `true`/`false` ตรงตัวเท่านั้น — ไม่มีคีย์ · ผิดรูป · ค่าอื่น = ไม่รู้ (null)', () => {
  assert.equal(surveyReportSeatEligible(inputs(), 'assessor'), true);
  assert.equal(surveyReportSeatEligible(inputs(eligible(false, true)), 'assessor'), false);
  for (const store of [undefined, null, 'yes', [], [true, true], {}, { assessor: 1 }, { assessor: 'true' }, { assessor: null }, { assessor: undefined }]) {
    assert.equal(surveyReportSeatEligible(inputs({ signerEligible: store }), 'assessor'), null, JSON.stringify(store));
  }
  // คีย์ที่สืบทอดมา (ไม่ใช่ของตัวเอง) ไม่นับ
  assert.equal(surveyReportSeatEligible({ signerEligible: Object.create({ assessor: true }) }, 'assessor'), null);
  assert.equal(surveyReportSeatEligible(null, 'assessor'), null);
});

test('🔴 ผู้ประเมินที่บัญชีไม่ใช่ฝ่ายบริการ **แม้มีลายเซ็น**: บรรทัด content ล้วน (ไม่มี sign — เพิ่มลายเซ็นไม่ช่วย) · ไม่มีผู้ลงนามให้เตรียม = ไม่มีใครอ่านไฟล์ของเขา', () => {
  const outsider = inputs(eligible(false, true)); // ทั้งสองคนมีลายเซ็นครบ
  assert.deepEqual(surveyReportSignatureIssues(outsider), [{
    kind: 'content',
    text: 'ผู้ประเมิน Lead Assessor ไม่ใช่บัญชีฝ่ายบริการ — เอกสารพิมพ์ลายเซ็นของบัญชีนี้ไม่ได้ แจ้งผู้จัดคิวให้แก้ผู้รับผิดชอบของนัด',
  }]);
  assert.deepEqual(surveyReportSignerVersions(outsider), [], 'ลิสต์ว่าง = ตัวเตรียมไฟล์ไม่ถูกเรียกกับใครเลย');
  // ยังไม่มีลายเซ็นด้วย = บรรทัดเดียว (ไม่ชวนให้เพิ่มลายเซ็นที่เพิ่มแล้วก็ไม่ถูกพิมพ์)
  assert.deepEqual(texts(inputs({ have: ['U-head'], ...eligible(false, true) })), [surveyReportSignatureIssues(outsider)[0].text]);
  // บัญชีถูกลบแต่ยังมีลายเซ็นค้างอยู่ = นั่งไม่ได้เหมือนกัน
  assert.equal(surveyReportSignatureIssues(inputs({ assigneeAccount: 'missing', ...eligible(false, true) })).length, 1);
  assert.equal(surveyReportSignatureIssues(inputs({ assigneeAccount: 'missing', ...eligible(false, true) }))[0].sign, undefined);
  // 🔑 ข้อยกเว้นเดียว: บัญชีถูกลบ **และไม่มีลายเซ็น** = บรรทัดเดิมของบัญชีที่ถูกปิด/ถูกลบ (พูดตรงกว่า · ยังเป็น content + sign)
  assert.deepEqual(surveyReportSignatureIssues(inputs({ have: ['U-head'], assigneeAccount: 'missing', ...eligible(false, true) })), [{
    kind: 'content', sign: true, userId: 'U-lead', seats: ['assessor'],
    text: 'ผู้ประเมิน Lead Assessor ยังไม่มีลายเซ็นในระบบ และบัญชีถูกปิดหรือถูกลบแล้ว — เพิ่มลายเซ็นไม่ได้ แจ้งผู้ดูแลระบบ',
  }]);
});

test('🔴 ผู้ส่งผลที่ไม่ใช่ผู้มีสิทธิ์ส่งผลประเมิน **แม้มีลายเซ็น** (ใบที่ตอบผ่านปุ่มทั่วไปก่อน 24/09): content ล้วน ให้ดึงผลกลับ · ไม่มีผู้ลงนามให้เตรียม', () => {
  const sales = inputs(eligible(true, false));
  assert.deepEqual(surveyReportSignatureIssues(sales), [{
    kind: 'content',
    text: 'ผู้ตรวจสอบและอนุมัติ Head Approver (ผู้ส่งผล) ไม่ใช่ผู้มีสิทธิ์ส่งผลประเมิน (หัวหน้าฝ่ายบริการ) — เอกสารพิมพ์ลายเซ็นของบัญชีนี้ไม่ได้ ดึงผลกลับแล้วให้หัวหน้าฝ่ายบริการส่งใหม่',
  }]);
  assert.deepEqual(surveyReportSignerVersions(sales), []);
  // ผู้ส่งผลนั่งไม่ได้ + ผู้ประเมินยังไม่มีลายเซ็น = สองบรรทัด ผู้ประเมินก่อน (ลำดับบนกระดาษ) · บรรทัดลายเซ็นของผู้ส่งผลไม่ขึ้น
  const mixed = surveyReportSignatureIssues(inputs({ have: [], ...eligible(true, false) }));
  assert.deepEqual(mixed.map((row) => [row.kind, row.sign === true, row.text.slice(0, 12)]), [
    ['content', true, 'ผู้ประเมิน L'], ['content', false, 'ผู้ตรวจสอบแล'],
  ]);
  // ไม่มีรหัสผู้ใช้ในบรรทัดไหน และบรรทัดของบัญชีที่นั่งไม่ได้ไม่พกคีย์ `userId`
  for (const row of [...surveyReportSignatureIssues(sales), ...surveyReportSignatureIssues(inputs(eligible(false, true)))]) {
    assert.deepEqual(Object.keys(row), ['kind', 'text']);
    assert.doesNotMatch(row.text, /U-lead|U-head/);
  }
});

test('🔴 คนเดียวสองที่นั่ง: นั่งที่นั่งผู้ประเมินไม่ได้ (เช่นแอดมินถูกใส่เป็นผู้รับผิดชอบของนัดแล้วส่งผลเอง) = บรรทัดของที่นั่งนั้น · ที่นั่งที่เหลือถูกถามเรื่องลายเซ็นตามเดิม', () => {
  const same = {
    request: { id: 'DR-1', answeredAt: '2026-10-09T03:00:00.000Z', answeredById: 'U-lead', answeredByName: 'Lead Assessor' },
    signatures: { 'U-lead': null },
    answerPending: true,
    ...eligible(false, true),
  };
  assert.deepEqual(surveyReportSignatureIssues(inputs(same)), [
    { kind: 'content', text: 'ผู้ประเมิน Lead Assessor ไม่ใช่บัญชีฝ่ายบริการ — เอกสารพิมพ์ลายเซ็นของบัญชีนี้ไม่ได้ แจ้งผู้จัดคิวให้แก้ผู้รับผิดชอบของนัด' },
    {
      kind: 'content', sign: true, userId: 'U-lead', seats: ['approver'],
      text: 'ผู้ตรวจสอบและอนุมัติ Lead Assessor (ผู้ส่งผล) ยังไม่มีลายเซ็นในระบบ — เพิ่มที่ “บัญชีของฉัน” ก่อนส่งผล หรือให้หัวหน้าที่มีลายเซ็นแล้วเป็นผู้ส่งผล',
    },
  ]);
  assert.deepEqual(surveyReportSignerVersions(inputs({ ...same, signatures: { 'U-lead': version('V-1') } })), []);
});

test('🔴 fail closed: ไม่รู้ว่าบัญชีนั่งได้ไหม (ไม่มีธง) = ไม่มีผู้ลงนามให้เตรียม + บรรทัดชนิด system · ชิ้นที่ตัดสินอ่านไม่สำเร็จ = ด่านพูดแทนแล้ว ไม่พูดซ้ำ', () => {
  for (const store of [undefined, null, {}, { assessor: true }, { approver: true }, { assessor: null, approver: null }]) {
    assert.deepEqual(surveyReportSignerVersions(inputs({ signerEligible: store })), [], JSON.stringify(store));
  }
  // ทุกคนมีลายเซ็น แต่ไม่รู้ว่าผู้ประเมินเป็นบัญชีฝ่ายบริการไหม
  assert.deepEqual(surveyReportSignatureIssues(inputs(eligible(null, true))), [
    { kind: 'system', text: 'ยืนยันบัญชีของผู้ประเมิน Lead Assessor ไม่สำเร็จ — ยังไม่ได้ออกเอกสาร กดอีกครั้ง' },
  ]);
  assert.deepEqual(surveyReportSignatureIssues(inputs(eligible(true, null))), [
    { kind: 'system', text: 'ยืนยันบัญชีของผู้ตรวจสอบและอนุมัติ Head Approver ไม่สำเร็จ — ยังไม่ได้ออกเอกสาร กดอีกครั้ง' },
  ]);
  // ตัวโหลดอ่านบัญชีผู้ประเมินไม่สำเร็จ (`assigneeRole` อยู่ใน unknown) = บรรทัด "อ่านตำแหน่งของผู้ประเมินไม่สำเร็จ" ของด่านพูดแทน
  assert.deepEqual(surveyReportSignatureIssues(inputs({ unknown: ['assigneeRole'], ...eligible(null, true) })), []);
  // 🔑 ไม่รู้เรื่องบัญชี **ไม่ลบ** ข้อ "ยังไม่มีลายเซ็น": ข้อนั้นจริงไม่ว่าบัญชีจะเป็นฝ่ายไหน (เส้นส่งผลยังตีกลับได้ก่อนเขียน)
  assert.deepEqual(surveyReportSignatureIssues(inputs({ have: ['U-head'], unknown: ['assigneeRole'], ...eligible(null, true) })), [{
    kind: 'content', sign: true, userId: 'U-lead', seats: ['assessor'],
    text: 'ผู้ประเมิน Lead Assessor ยังไม่มีลายเซ็นในระบบ — ให้เจ้าตัวเพิ่มที่ “บัญชีของฉัน” ก่อน',
  }]);
});

/* ══ วลีของกล่องยืนยัน · บรรทัดของไฟล์ลายเซ็น ══════════════════════════════ */

test('วลีผู้ลงนามของกล่องยืนยัน: สองคน · คนเดียวสองที่นั่ง · รับได้ทั้งแถวรายคนและแถวรายที่นั่ง', () => {
  assert.equal(surveyReportSignersText(surveyReportSignerVersions(inputs())), 'Lead Assessor (ผู้ประเมิน) และ Head Approver (ผู้ตรวจสอบและอนุมัติ)');
  assert.equal(surveyReportSignersText(surveyReportSigners(inputs())), 'Lead Assessor (ผู้ประเมิน) และ Head Approver (ผู้ตรวจสอบและอนุมัติ)');
  // ที่จอได้รับ: คัดแค่ `seats` กับ `name`
  assert.equal(
    surveyReportSignersText([{ seats: ['assessor', 'approver'], name: 'สมชาย ใจดี' }]),
    'สมชาย ใจดี ทั้งสองช่อง (ผู้ประเมิน และผู้ตรวจสอบและอนุมัติ)',
  );
  // แถวรายที่นั่งของคนเดียวกัน (มี userId) รวมเป็นคนเดียว · ลำดับที่ส่งมากลับด้านก็เรียงตามกระดาษ
  assert.equal(
    surveyReportSignersText([{ seat: 'approver', userId: 'U1', name: 'สมชาย ใจดี' }, { seat: 'assessor', userId: 'U1', name: 'สมชาย ใจดี' }]),
    'สมชาย ใจดี ทั้งสองช่อง (ผู้ประเมิน และผู้ตรวจสอบและอนุมัติ)',
  );
  assert.equal(
    surveyReportSignersText([{ seats: ['approver'], name: 'ข' }, { seats: ['assessor'], name: 'ก' }]),
    'ก (ผู้ประเมิน) และ ข (ผู้ตรวจสอบและอนุมัติ)',
  );
  assert.equal(surveyReportSignersText([{ seats: ['approver'], name: 'ข' }]), 'ข (ผู้ตรวจสอบและอนุมัติ)');
  for (const empty of [undefined, null, [], [{}], [{ seats: ['sales'], name: 'ค' }], [{ seats: ['assessor'], name: ' ' }]]) {
    assert.equal(surveyReportSignersText(empty), '', JSON.stringify(empty));
  }
});

test('บรรทัดของไฟล์ลายเซ็น: เหตุถาวรบอกชื่อกับเหตุ · เหตุชั่วคราวบอกแค่ว่าดึงไม่สำเร็จ · ไม่ซ้ำ', () => {
  const failed = [
    { userId: 'U-lead', name: 'Lead Assessor', seats: ['assessor'], versionId: 'V1', reason: 'sign_blank', permanent: true },
    { userId: 'U-head', name: 'Head Approver', seats: ['approver'], versionId: 'V2', reason: 'sign_timeout', permanent: false },
    { userId: 'U-x', name: '', seats: ['approver'], versionId: 'V3', reason: 'ไม่รู้จัก', permanent: true },
    { userId: 'U-lead', name: 'Lead Assessor', seats: ['assessor'], versionId: 'V1', reason: 'sign_blank', permanent: true },
  ];
  assert.deepEqual(surveyReportSignFileLines(failed), [
    'ลายเซ็นของ Lead Assessor ใช้พิมพ์ไม่ได้ (ภาพลายเซ็นว่างหรือจางเกินไป)',
    'ลายเซ็นของ ผู้ลงนาม ใช้พิมพ์ไม่ได้ (เปิดไฟล์ลายเซ็นไม่ได้)',
  ]);
  assert.deepEqual(surveyReportSignFileLines(failed, { permanent: true }), surveyReportSignFileLines(failed));
  assert.deepEqual(surveyReportSignFileLines(failed, { permanent: false }), ['ดึงลายเซ็นของ Head Approver ไม่สำเร็จ']);
  assert.deepEqual(surveyReportSignFileLines(null), []);
  for (const line of [...surveyReportSignFileLines(failed), ...surveyReportSignFileLines(failed, { permanent: false })]) {
    assert.doesNotMatch(line, /U-lead|U-head|V1|V2|sign_/);
  }
});

test('🔴 ป้ายของเหตุถาวรครบทุกเหตุของตัวเตรียมลายเซ็น และไม่มีป้ายของเหตุชั่วคราว (เพิ่มเหตุใหม่ต้องตัดสินก่อนว่าถาวรไหม)', () => {
  assert.deepEqual(Object.keys(SURVEY_SIGN_FAILURE_LABELS).sort(), [...SURVEY_SIGN_PERMANENT_REASONS].sort());
  assert.deepEqual(SURVEY_SIGN_FAILURE_LABELS, {
    sign_path: 'ที่เก็บไฟล์ลายเซ็นไม่ถูกต้อง',
    sign_missing: 'ไฟล์ลายเซ็นหายจากที่เก็บ',
    sign_mismatch: 'ไฟล์ลายเซ็นไม่ตรงกับที่บันทึกไว้',
    sign_undecodable: 'เปิดไฟล์ลายเซ็นไม่ได้',
    sign_blank: 'ภาพลายเซ็นว่างหรือจางเกินไป',
  });
  const transient = Object.values(SURVEY_SIGN_FAILURE).filter((reason) => !SURVEY_SIGN_PERMANENT_REASONS.includes(reason));
  assert.deepEqual(transient.sort(), ['prepare_failed', 'sharp_unavailable', 'sign_storage', 'sign_timeout']);
  for (const reason of transient) assert.equal(Object.hasOwn(SURVEY_SIGN_FAILURE_LABELS, reason), false, reason);
});

/* ══ ⑤ ไฟล์นี้ล้วน ════════════════════════════════════════════════════════ */

test('🔴 ซอร์ส: ไม่อ่าน env · ไม่มี node: / server-only / dynamic import — import ได้ตัวเดียวคือ surveyMethod (โมดูลใบ)', () => {
  const src = readFileSync(new URL('./surveyReportSigners.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  assert.deepEqual([...src.matchAll(/^import[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1]), ['./surveyMethod']);
  assert.doesNotMatch(src, /process\.env|server-only|node:|import\(|require\(/);
  // ไม่มีชื่อคลัง/คอลัมน์ที่อยู่ไฟล์ถูกอ่านที่นี่ — ที่อยู่ไฟล์เดินทางอยู่ในก้อน `version` ทั้งก้อน ไม่ถูกแกะ
  assert.doesNotMatch(src, /signature-assets|\.storagePath/);
});
