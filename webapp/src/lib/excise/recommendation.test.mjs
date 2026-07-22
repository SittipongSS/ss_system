// Tests helper คำแนะนำขึ้นทะเบียนสรรพสามิต — แบนเนอร์หน้า detail + สรุปสถานะ
// ให้ตัวกรองหน้า list. Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exciseRecommendationState, registrationStatusOf } from './recommendation.js';

const EXCISE = { isExcise: true, requiresFdaNotice: false };
const NON_EXCISE = { isExcise: false, requiresFdaNotice: false };
const FG = { id: 'PRD-1', isActive: true, isExciseTaxable: true };

test('ไม่เข้าข่าย → null: หมวดอื่น / พักใช้ / ยกเว้นรายตัว', () => {
  assert.equal(exciseRecommendationState(FG, NON_EXCISE, []), null);
  assert.equal(exciseRecommendationState(FG, undefined, []), null);
  assert.equal(exciseRecommendationState({ ...FG, isActive: false }, EXCISE, []), null);
  assert.equal(exciseRecommendationState({ ...FG, isExciseTaxable: false }, EXCISE, []), null);
  assert.equal(exciseRecommendationState(null, EXCISE, []), null);
});

test('ยังไม่มีทะเบียน → unregistered (ชวนส่งขึ้นทะเบียน)', () => {
  assert.deepEqual(exciseRecommendationState(FG, EXCISE, []), { kind: 'unregistered' });
  assert.deepEqual(exciseRecommendationState(FG, EXCISE, undefined), { kind: 'unregistered' });
});

test('สถานะทะเบียนคุมชนิดแบนเนอร์ — approved = เงียบ', () => {
  const by = (status) => exciseRecommendationState(FG, EXCISE, [{ id: 'REG-1', status }]);
  assert.equal(by('approved'), null);
  assert.equal(by('draft').kind, 'incomplete');
  assert.equal(by('rejected').kind, 'rejected');
  assert.equal(by('pending_legal').kind, 'pending');
  // สถานะไม่รู้จัก → ถือว่ายังทำไม่เสร็จ (ไม่เงียบหาย)
  assert.equal(by('whatever').kind, 'incomplete');
  // reg แนบมากับผล เพื่อลิงก์ไปหน้าทะเบียน
  assert.equal(by('draft').reg.id, 'REG-1');
});

test('หลายทะเบียน: มี approved สักแถว → เงียบ; ไม่มีก็ยึดแถวแรก (ล่าสุด)', () => {
  const regs = [{ id: 'REG-2', status: 'draft' }, { id: 'REG-1', status: 'approved' }];
  assert.equal(exciseRecommendationState(FG, EXCISE, regs), null);
  const pending = [{ id: 'REG-3', status: 'pending_legal' }, { id: 'REG-2', status: 'rejected' }];
  assert.deepEqual(exciseRecommendationState(FG, EXCISE, pending), { kind: 'pending', reg: pending[0] });
});

test('registrationStatusOf สรุปเป็น 3 ค่า สำหรับตัวกรอง list', () => {
  assert.equal(registrationStatusOf([]), 'none');
  assert.equal(registrationStatusOf(undefined), 'none');
  assert.equal(registrationStatusOf([{ status: 'draft' }]), 'in_progress');
  assert.equal(registrationStatusOf([{ status: 'rejected' }]), 'in_progress');
  assert.equal(registrationStatusOf([{ status: 'pending_legal' }]), 'in_progress');
  assert.equal(registrationStatusOf([{ status: 'draft' }, { status: 'approved' }]), 'approved');
});
