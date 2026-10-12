import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROLES, SALES_ROLES, SERVICE_DEPARTMENT, canBeServiceAssignee, canSendSurveyResult, rolesForDepartment } from '../permissions.js';
import {
  SERVICE_SIGNER_ROLES,
  SIGNATURE_COHORT_ROLES,
  buildSignatureCoverage,
  canViewSignatureCoverage,
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

test('cohort ครอบทั้งผู้อนุมัติและผู้ยื่น — ac นับด้วย, RA/viewer ไม่นับ', () => {
  assert.ok(isSignatureCohortRole('admin'));
  assert.ok(isSignatureCohortRole('ae_supervisor'));
  assert.ok(isSignatureCohortRole('ae'));
  assert.ok(isSignatureCohortRole('senior_ae'));
  // AC อนุมัติไม่ได้ แต่ "ยื่นอนุมัติ" ได้ และการยื่นบันทึกหลักฐานลายเซ็น → ต้องอยู่ใน cohort
  assert.ok(isSignatureCohortRole('ac'));
  assert.equal(isSignatureCohortRole('ra'), false);
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

// ── ด่านสิทธิ์ ───────────────────────────────────────────────────────────────

test('แอดมินเปิดรายงานได้ — regression: users:view ไม่มี role ไหนถือเลย', () => {
  // บั๊กจริง: route เช็คแค่ canUser(user,'users:view') → แอดมินโดน 403 ทุกครั้ง
  // เพราะ users:view อยู่ใน GRANTABLE_CAPS อย่างเดียว ไม่มีใครได้มาจาก role
  assert.equal(canViewSignatureCoverage({ role: 'admin' }), true);
  assert.equal(canViewSignatureCoverage({ role: 'admin', extraCaps: [] }), true);
});

test('ผู้ได้รับ grant users:view เปิดได้ ส่วน role อื่นเปิดไม่ได้', () => {
  assert.equal(canViewSignatureCoverage({ role: 'ae_supervisor', extraCaps: ['users:view'] }), true);
  assert.equal(canViewSignatureCoverage({ role: 'ae_supervisor', extraCaps: [] }), false);
  assert.equal(canViewSignatureCoverage({ role: 'ae' }), false);
  assert.equal(canViewSignatureCoverage(null), false);
});

// ── บัญชีที่ถูกปิด ───────────────────────────────────────────────────────────

test('คนที่ถูกปิดบัญชีไม่นับใน cohort — ล็อกอินไม่ได้ก็อัปลายเซ็นไม่ได้', () => {
  // ถ้ายังนับ คนลาออกจะค้างเป็น "ต้องมีลายเซ็น" ถาวร แล้วไฟเขียว go-live ไม่มีวันขึ้น
  const result = build([
    { id: 'u1', name: 'แอดมินที่ทำงานอยู่', role: 'admin' },
    { id: 'u2', name: 'หัวหน้าที่ลาออกแล้ว', role: 'ae_supervisor', disabled: true },
  ], { signed: ['u1'] });
  assert.deepEqual(result.rows.map((r) => r.id), ['u1']);
  assert.equal(result.summary.cohort, 1);
  assert.equal(result.summary.required, 1);
  assert.equal(isGoLiveReady(result.summary), true);
});

// ── ฝ่ายบริการ — ผู้ลงนามของรายงานการประเมินพื้นที่ (PR-SIG §6 · มติเจ้าของ 09/10/2026) ──────────────

test('🔴 ฝ่ายบริการทุกตำแหน่งอยู่ใน cohort — รวม Planner (ถูกมอบหมายนัดได้) · รายชื่อมาจากทะเบียนตำแหน่งกลาง ไม่พิมพ์เอง', () => {
  assert.deepEqual([...SERVICE_SIGNER_ROLES], rolesForDepartment(SERVICE_DEPARTMENT));
  assert.deepEqual([...SERVICE_SIGNER_ROLES].sort(), ['ts', 'ts_audit', 'ts_manager', 'ts_planner', 'ts_senior']);
  for (const role of SERVICE_SIGNER_ROLES) assert.ok(isSignatureCohortRole(role), role);
  assert.deepEqual(SIGNATURE_COHORT_ROLES, ['admin', ...SALES_ROLES, ...SERVICE_SIGNER_ROLES]);
  assert.equal(new Set(SIGNATURE_COHORT_ROLES).size, SIGNATURE_COHORT_ROLES.length, 'ไม่มีตำแหน่งซ้ำ');

  /* ทุกตำแหน่งที่ลงชื่อบนเอกสารได้ต้องอยู่ในรายงาน: ผู้ประเมิน = ใครก็ได้ที่ถูกมอบหมายนัด (ทั้งฝ่ายบริการ) ·
     ผู้ตรวจสอบและอนุมัติ = ใครก็ได้ที่ส่งผลได้ (หัวหน้าฝ่ายบริการ + admin + CD/CM) — เพิ่มตำแหน่งใหม่แล้วลืมรายงานนี้ เทสต์นี้ฟ้อง */
  for (const role of ROLES) {
    const user = { id: `u-${role}`, role };
    if (canBeServiceAssignee(user) || canSendSurveyResult(user)) assert.ok(isSignatureCohortRole(role), `${role} ลงชื่อบนรายงานการประเมินพื้นที่ได้`);
  }
  // ตำแหน่งนอกสองฝ่ายยังไม่นับ
  for (const role of ['ra', 'rd', 'finance', 'pc', 'wh', 'qc', 'marketing', 'secretary', 'executive', 'viewer']) {
    assert.equal(isSignatureCohortRole(role), false, role);
  }
});

test('ฝ่ายบริการ "ต้องมี" เสมอ — ไม่ขึ้นกับดีลหรือเอกสารค้าง · ยังไม่มีลายเซ็น = เสี่ยง (ไม่ใช่ "ยังไม่จำเป็น")', () => {
  for (const role of SERVICE_SIGNER_ROLES) {
    assert.equal(signatureRequirement(role, 0, 0), 'required', role);
    assert.equal(coverageSeverity({ hasSignature: false, pendingQuotations: 0, submittableDocs: 0, requirement: signatureRequirement(role, 0, 0) }), 'at_risk', role);
  }
  // ฝ่ายขายที่ไม่ได้ถืออะไรยังเป็น "ยังไม่จำเป็น" เหมือนเดิม
  assert.equal(signatureRequirement('ae', 0, 0), 'optional');
  assert.equal(signatureRequirement('ac', 0, 0), 'optional');

  const { rows, summary } = build(
    [
      { id: 'ts-1', name: 'ช่าง', role: 'ts' },
      { id: 'ts-2', name: 'ผู้จัดคิว', role: 'ts_planner' },
      { id: 'ts-3', name: 'หัวหน้าบริการ', role: 'ts_manager' },
      { id: 'ts-4', name: 'ช่างที่ลาออก', role: 'ts_senior', disabled: true },
      { id: 'ae-1', name: 'เอว่าง', role: 'ae' },
    ],
    { signed: ['ts-3'] },
  );
  assert.deepEqual(rows.map((r) => [r.id, r.requirement, r.severity]), [
    ['ts-1', 'required', 'at_risk'],
    ['ts-2', 'required', 'at_risk'],
    ['ae-1', 'optional', 'optional'],
    ['ts-3', 'required', 'ready'],
  ]);
  assert.equal(summary.cohort, 4, 'บัญชีที่ถูกปิดไม่นับ');
  assert.equal(summary.required, 3);
  assert.equal(summary.requiredReady, 1);
  assert.equal(summary.blocking, 0, 'ฝ่ายบริการไม่มีใบรออนุมัติ/เอกสารรอยื่นให้นับ');
  assert.equal(isGoLiveReady(summary), false);
  // แถวของฝ่ายบริการมีคีย์ชุดเดียวกับแถวอื่น (หน้ารายงานไม่ต้องรู้ว่าเป็นฝ่ายไหน)
  assert.deepEqual(Object.keys(rows[0]), Object.keys(rows[2]));
});

test('🔴 การ์ด "คนที่ยังไม่มีลายเซ็น" ของหน้าตั้งค่าและคำอธิบายเมนู พูดถึงรายงานการประเมินพื้นที่ — ไม่บอกฝ่ายบริการว่า "อนุมัติเอกสารไม่ได้"', () => {
  /* 🐞 ฝ่ายบริการเข้ากลุ่ม "ต้องมีลายเซ็น" ทันทีที่โค้ดขึ้นระบบ (สวิตช์ลายเซ็นจริงยังปิด) ⇒ ตัวเลขบนการ์ดเพิ่มตามจำนวนบัญชีฝ่ายบริการ
     คู่กับคำว่า "อนุมัติเอกสารไม่ได้จนกว่าจะอัปโหลด" — ไม่จริงสองชั้น: ฝ่ายบริการไม่ได้อนุมัติใบเสนอราคา/ใบสั่งขาย และยังไม่มีอะไรถูกกั้น
     ⇒ ประโยคบอก "ต้องมีก่อนทำอะไร" (จริงทั้งตอนสวิตช์เปิดและปิด) และเอ่ยเอกสารของฝ่ายบริการด้วย */
  const read = (rel) => readFileSync(join(process.cwd(), rel), 'utf8');
  const hub = read('src/app/settings/page.js');
  assert.match(hub, /note: missingSignatures \? "ต้องอัปโหลดก่อนอนุมัติเอกสาร หรือลงนามรายงานการประเมินพื้นที่" : "ผู้ที่ต้องมีลายเซ็นมีครบแล้ว"/);
  assert.doesNotMatch(hub, /อนุมัติเอกสารไม่ได้จนกว่าจะอัปโหลด|ผู้อนุมัติมีลายเซ็นครบแล้ว/);
  const nav = read('src/config/settingsNav.js');
  assert.match(nav, /blurb: 'ใครยังไม่มีลายเซ็นทั้งที่ต้องอนุมัติใบเสนอราคา\/ใบสั่งขาย หรือลงนามรายงานการประเมินพื้นที่'/);
  // หน้ารายงานเองพูดเรื่องเดียวกัน (แก้ไปแล้วในงวด B) — สามที่ต้องไม่เถียงกัน
  assert.match(read('src/app/settings/signature-coverage/page.js'), /รายงานการประเมินพื้นที่/);
});
