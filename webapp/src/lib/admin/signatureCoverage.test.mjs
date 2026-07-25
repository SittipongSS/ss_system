import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSignatureCoverage,
  coverageSeverity,
  isGoLiveReady,
  isSignatureCohortRole,
  signatureRequirement,
} from './signatureCoverage.js';

const build = (users, { signed = [], deals = [], pending = [], submittable = [] } = {}) =>
  buildSignatureCoverage({
    users,
    activeSignatureUserIds: new Set(signed),
    dealCounts: new Map(deals),
    pendingCounts: new Map(pending),
    submittableCounts: new Map(submittable),
  });

test('cohort ครอบทั้งผู้อนุมัติและผู้ยื่น — ac นับด้วย, legal/viewer ไม่นับ', () => {
  assert.ok(isSignatureCohortRole('admin'));
  assert.ok(isSignatureCohortRole('ae_supervisor'));
  assert.ok(isSignatureCohortRole('ae'));
  assert.ok(isSignatureCohortRole('senior_ae'));
  // AC อนุมัติไม่ได้ แต่ "ยื่นอนุมัติ" ได้ และการยื่นบันทึกหลักฐานลายเซ็น → ต้องอยู่ใน cohort
  assert.ok(isSignatureCohortRole('ac'));
  assert.equal(isSignatureCohortRole('legal'), false);
  assert.equal(isSignatureCohortRole('viewer'), false);
});

test('ต้องมีลายเซ็นเมื่อเป็นผู้อนุมัติเสมอ ถือดีล หรือมีเอกสารค้างยื่นในมือ', () => {
  assert.equal(signatureRequirement('admin', 0), 'required');
  assert.equal(signatureRequirement('ae_supervisor', 0), 'required');
  assert.equal(signatureRequirement('ae', 0), 'optional');
  assert.equal(signatureRequirement('ae', 3), 'required');
  assert.equal(signatureRequirement('senior_ae', 1), 'required');
  // เส้นผู้ยื่น: AC ไม่ถือดีลเลย แต่มีเอกสารค้างต้องยื่น = ต้องมีลายเซ็น
  assert.equal(signatureRequirement('ac', 0, 0), 'optional');
  assert.equal(signatureRequirement('ac', 0, 2), 'required');
  assert.equal(signatureRequirement('ae', 0, 1), 'required');
});

test('มีงานค้างอยู่จริง + ไม่มีลายเซ็น = blocking (ทั้งเส้นอนุมัติและเส้นยื่น)', () => {
  assert.equal(coverageSeverity({ hasSignature: false, pendingQuotations: 2, submittableDocs: 0, requirement: 'required' }), 'blocking');
  assert.equal(coverageSeverity({ hasSignature: false, pendingQuotations: 0, submittableDocs: 3, requirement: 'required' }), 'blocking');
  assert.equal(coverageSeverity({ hasSignature: false, pendingQuotations: 0, submittableDocs: 0, requirement: 'required' }), 'at_risk');
  assert.equal(coverageSeverity({ hasSignature: false, pendingQuotations: 0, submittableDocs: 0, requirement: 'optional' }), 'optional');
  // มีลายเซ็นแล้วถือว่าพร้อม แม้จะมีใบค้างอยู่ (ใบค้างไม่ใช่ปัญหาลายเซ็น)
  assert.equal(coverageSeverity({ hasSignature: true, pendingQuotations: 5, submittableDocs: 4, requirement: 'required' }), 'ready');
});

test('สรุปนับเอกสารที่ค้างเพราะผู้สร้างยังไม่มีลายเซ็น', () => {
  const { rows, summary } = build(
    [
      { id: 'ac-1', name: 'เอซีไม่มีลายเซ็น', role: 'ac' },
      { id: 'ac-2', name: 'เอซีมีลายเซ็น', role: 'ac' },
    ],
    { signed: ['ac-2'], submittable: [['ac-1', 3], ['ac-2', 5]] },
  );
  const blocked = rows.find((r) => r.id === 'ac-1');
  assert.equal(blocked.severity, 'blocking');
  assert.equal(blocked.requirement, 'required');
  assert.equal(summary.blockedSubmissions, 3); // นับแค่คนที่ยังไม่มีลายเซ็น
});

test('เรียงคนที่บล็อกงานอยู่ขึ้นก่อน แล้วค่อยไล่ตามจำนวนใบค้าง', () => {
  const { rows } = build(
    [
      { id: 'u-ready', name: 'พร้อม', role: 'ae' },
      { id: 'u-idle', name: 'ว่าง', role: 'ae' },
      { id: 'u-block-1', name: 'ค้างน้อย', role: 'ae' },
      { id: 'u-block-9', name: 'ค้างเยอะ', role: 'ae' },
      { id: 'u-risk', name: 'เสี่ยง', role: 'ae_supervisor' },
    ],
    {
      signed: ['u-ready'],
      deals: [['u-ready', 2], ['u-block-1', 1], ['u-block-9', 4]],
      pending: [['u-block-1', 1], ['u-block-9', 9]],
    },
  );

  assert.deepEqual(rows.map((row) => row.id), ['u-block-9', 'u-block-1', 'u-risk', 'u-idle', 'u-ready']);
});

test('สรุปยอดนับเฉพาะคนที่ต้องมีจริง และรวมใบที่ถูกบล็อก', () => {
  const { summary } = build(
    [
      { id: 'admin', name: 'แอดมิน', role: 'admin' },
      { id: 'sup', name: 'หัวหน้า', role: 'ae_supervisor' },
      { id: 'ae-busy', name: 'เอถือดีล', role: 'ae' },
      { id: 'ae-idle', name: 'เอว่าง', role: 'ae' },
      { id: 'ac', name: 'เอซี', role: 'ac' },
    ],
    {
      signed: ['admin'],
      deals: [['ae-busy', 3]],
      pending: [['ae-busy', 4], ['sup', 2]],
    },
  );

  assert.equal(summary.cohort, 5); // ac อยู่ใน cohort แล้ว (ยื่นอนุมัติได้)
  // ac ไม่ถือดีลและไม่มีเอกสารค้างยื่นในเคสนี้ → optional เหมือน ae-idle
  assert.equal(summary.required, 3); // admin + sup + ae-busy (ae-idle ไม่ถือดีล)
  assert.equal(summary.requiredReady, 1);
  assert.equal(summary.blocking, 2); // sup + ae-busy มีใบค้างและไม่มีลายเซ็น
  assert.equal(summary.blockedQuotations, 6);
});

test('go-live เขียวเมื่อคนที่ต้องมีมีครบทุกคน', () => {
  assert.equal(isGoLiveReady({ required: 3, requiredReady: 3 }), true);
  assert.equal(isGoLiveReady({ required: 3, requiredReady: 2 }), false);
  // ไม่มีใครใน cohort เลย = ข้อมูลผิดปกติ ไม่ใช่ "พร้อม"
  assert.equal(isGoLiveReady({ required: 0, requiredReady: 0 }), false);
});
