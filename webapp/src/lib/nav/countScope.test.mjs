// ── ขอบเขตของตัวเลขรายคีย์ (ADR 0016 · PR1) ───────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { countScopeFor, countScopeForHref, COUNT_SCOPE_KEYS } from './countScope.js';
import { NAV_COUNT_KEYS } from './useNavCounts.js';
import { ROLES } from '@/lib/permissions';

const user = (over = {}) => ({ id: 'u1', role: 'ae', teams: [], extraCaps: [], ...over });

test('⭐ ทุกคีย์ที่มีป้ายบนเมนู ต้องมีกฎขอบเขต — ไม่งั้นหน้าแรกไม่รู้จะวาดป้ายแบบไหน', () => {
  const keys = new Set(Object.values(NAV_COUNT_KEYS));
  for (const key of keys) assert.ok(COUNT_SCOPE_KEYS.includes(key), `คีย์ ${key} ไม่มีกฎขอบเขต`);
  for (const key of COUNT_SCOPE_KEYS) assert.ok(keys.has(key), `กฎขอบเขต ${key} ไม่มีเมนูคู่กัน`);
});

test('ไม่มี role ⇒ null ทุกคีย์', () => {
  for (const key of COUNT_SCOPE_KEYS) assert.equal(countScopeFor(key, null), null, key);
});

test('แอดมินได้ขอบเขตของทุกคีย์ที่ route ยิงให้ — ยกเว้นเลนภาษีที่เขาไม่ได้เป็นเจ้าของขั้น', () => {
  const admin = user({ role: 'admin' });
  const none = COUNT_SCOPE_KEYS.filter((key) => countScopeFor(key, admin) === null);
  // AD เห็นสองเลนภาษีแต่ไม่เป็นเจ้าของขั้นไหนเลย (ownedStages ว่าง) ⇒ ไม่มีป้าย ตรงกับ route
  assert.deepEqual(none.sort(), ['taxFilings', 'taxRegistrations']);
});

/* 🔴 ข้อห้ามของ ADR 0016: ยอดของทั้งฝ่าย/ทั้งบริษัท ห้ามอ่านว่า "รอคุณ" */
test('⭐ คีย์ที่เป็นงานของฝ่าย/บริษัท ต้องไม่ได้ขอบเขต mine กับใครเลย', () => {
  const shared = ['rdRequests', 'financeRequests', 'serviceRequests', 'customers', 'products',
    'serviceIntake', 'payments', 'productionJobs', 'taxRegistrations', 'taxFilings'];
  for (const role of [...ROLES, 'user']) {
    for (const dept of [null, 'RD', 'FN', 'TS']) {
      const u = user({ role, department: dept, teams: ['SV'] });
      for (const key of shared) {
        assert.notEqual(countScopeFor(key, u), 'mine', `${role}/${dept}: ${key}`);
      }
    }
  }
});

test('ลีด: การตลาด/หัวหน้า = ทั้งบริษัท · senior_ae/ac = ทั้งฝ่าย · ae = ของฉัน', () => {
  assert.equal(countScopeFor('leads', user({ role: 'marketing' })), 'company');
  assert.equal(countScopeFor('leads', user({ role: 'ae_supervisor' })), 'company');
  assert.equal(countScopeFor('leads', user({ role: 'admin' })), 'company');
  assert.equal(countScopeFor('leads', user({ role: 'senior_ae' })), 'dept');
  assert.equal(countScopeFor('leads', user({ role: 'ac' })), 'dept');
  assert.equal(countScopeFor('leads', user({ role: 'ae' })), 'mine');
});

test('คิวคำร้องของฝ่าย: ได้เฉพาะฝ่ายที่ตอบได้จริง และเป็นยอดของฝ่ายเสมอ', () => {
  const rd = user({ role: 'rd', department: 'RD' });
  assert.equal(countScopeFor('rdRequests', rd), 'dept');
  assert.equal(countScopeFor('financeRequests', rd), null, 'RD ไม่ได้ป้ายคิวของบัญชี');
  assert.equal(countScopeFor('financeRequests', user({ role: 'finance', department: 'FN' })), 'dept');
});

test('คำร้อง: มีคิวของฝ่ายรวมอยู่ด้วย = ของฝ่าย · ไม่มี = ของฉัน', () => {
  // ฝ่ายขายเปิดคำร้องเอง ไม่มีคิวฝ่ายรวมอยู่ในเลขนี้
  assert.equal(countScopeFor('requests', user({ role: 'ae' })), 'mine');
  // ฝ่ายที่ตอบคิวรวมได้ (เช่น PC/WH ผ่าน requests:answer) ต้องไม่ใช่ 'mine'
  const pc = user({ role: 'pc', department: 'PC' });
  if (countScopeFor('requests', pc)) assert.equal(countScopeFor('requests', pc), 'dept');
});

test('ใบสั่งขาย/สัญญา: คนที่รับรองใบของคนอื่น = ทั้งบริษัท · เจ้าของใบ = ของฉัน', () => {
  assert.equal(countScopeFor('salesOrders', user({ role: 'ae_supervisor' })), 'company');
  assert.equal(countScopeFor('salesOrders', user({ role: 'finance' })), 'company');
  assert.equal(countScopeFor('salesOrders', user({ role: 'ae' })), 'mine');
  assert.equal(countScopeFor('contracts', user({ role: 'ae_supervisor' })), 'company');
  assert.equal(countScopeFor('contracts', user({ role: 'ae' })), 'mine');
});

test('ภาษี: เลนของฝ่าย (SA/RA) ได้ dept · คนนอกสองเลนไม่มีป้าย', () => {
  assert.equal(countScopeFor('taxFilings', user({ role: 'ae' })), 'dept');
  assert.equal(countScopeFor('taxRegistrations', user({ role: 'ra' })), 'dept');
  assert.equal(countScopeFor('taxFilings', user({ role: 'rd' })), null);
});

/* ⚠️ `can(user.role, …)` ไม่อ่าน extraCaps — ที่นี่ต้องเพี้ยนตาม route ให้เป๊ะ
   ไม่งั้นหน้าแรกจองช่องตัวเลขให้แถวที่ route ไม่เคยยิงให้ */
test('สิทธิ์รายคนไม่เปิดตัวนับที่ด่านของ route ถาม role อย่างเดียว', () => {
  const sa = user({ role: 'ae', extraCaps: ['mgmt:view'] });
  assert.equal(countScopeFor('mgmtTasks', sa), null, 'ตรงกับ route ที่ถาม can(user.role, ...)');
});

test('countScopeForHref: เมนูที่ไม่มีคีย์ = ไม่มีป้าย', () => {
  assert.equal(countScopeForHref('/sa/tasks', user({ role: 'ae' })), 'mine');
  assert.equal(countScopeForHref('/sa/deals', user({ role: 'ae' })), null);
});
