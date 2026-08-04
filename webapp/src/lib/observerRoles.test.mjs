// ── viewer กับ executive ต้องไม่แตกออกจากกันเงียบ ๆ ────────────────────────
//
// `isReadOnlyObserver` เขียนเตือนไว้เองว่า "ทุกที่ที่เคยเทียบ role === 'viewer'
// ต้องเปลี่ยนมาใช้ตัวนี้ ไม่งั้น executive จะได้ (หรือเสีย) ของโดยไม่มีใครตั้งใจ"
// — แต่ไม่มีอะไรบังคับกฎนั้น
//
// เจอจริง 2026-08-04 (ตรวจสิทธิ์รายตำแหน่ง): `canSeeDealKpi` และ `salesDealScopes`
// ยังสะกด 'viewer' เอง ⇒ ผู้บริหารเห็น KPI ลีด / KPI งาน / KPI ฝ่าย RD ได้หมด
// แต่ **ไม่เห็น KPI ดีล** ซึ่งเป็นตัวที่ตำแหน่งนี้ต้องดูที่สุด
// อาการแบบ "ขาด" หลุดง่ายกว่าแบบ "เกิน" เพราะไม่มีใครมาแจ้งว่าเห็นของที่ไม่ควรเห็น
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import {
  ROLES, capsFor, isReadOnlyObserver,
  canSeeDealKpi, canSeeLeadKpi, canSeeTaskKpi, canSeeRdKpi,
  salesDealScopes, pmTaskScopes, viewScope, editScope,
} from './permissions.js';

const OBSERVERS = ['viewer', 'executive'];

test('isReadOnlyObserver ครอบทั้งสองตำแหน่ง', () => {
  for (const role of OBSERVERS) assert.equal(isReadOnlyObserver(role), true, role);
  for (const role of ROLES.filter((r) => !OBSERVERS.includes(r))) {
    assert.equal(isReadOnlyObserver(role), false, role);
  }
});

test('ผู้สังเกตการณ์เห็น KPI ครบทุกตัวเท่ากัน — ไม่มีตัวไหนขาดไปเฉพาะคนใดคนหนึ่ง', () => {
  const gates = { deal: canSeeDealKpi, lead: canSeeLeadKpi, task: canSeeTaskKpi, rd: canSeeRdKpi };
  for (const [name, gate] of Object.entries(gates)) {
    assert.equal(gate('viewer'), gate('executive'), `KPI ${name}: viewer กับ executive ไม่ตรงกัน`);
    assert.equal(gate('viewer'), true, `KPI ${name}: ผู้สังเกตการณ์ต้องเห็น`);
  }
});

test('scope ของผู้สังเกตการณ์เหมือนกันทุกโมดูล', () => {
  assert.deepEqual(salesDealScopes('viewer'), salesDealScopes('executive'));
  assert.deepEqual(pmTaskScopes('viewer'), pmTaskScopes('executive'));
  // ไม่มีดีล/งานของตัวเอง และไม่มีทีม → 'all' อย่างเดียวคือ scope เดียวที่มีความหมาย
  assert.deepEqual(salesDealScopes('viewer'), ['all']);
  assert.deepEqual(pmTaskScopes('viewer'), ['all']);
});

test('ผู้สังเกตการณ์อ่านได้ทุกทีม แต่เขียนไม่ได้เลย', () => {
  for (const role of OBSERVERS) {
    assert.equal(viewScope(role), 'all', role);
    assert.equal(editScope(role), 'none', role);
    const writeCaps = capsFor(role).filter((c) => /:(edit|act|delete|manage|approve|quote)$/.test(c));
    // executive มี costing:approve ตัวเดียวที่เป็นอำนาจของตำแหน่ง (มติ 2026-07-22)
    const allowed = role === 'executive' ? ['costing:approve'] : [];
    assert.deepEqual(writeCaps, allowed, `${role} มี cap เขียนเกินที่ตั้งใจ: ${writeCaps}`);
  }
});

// ratchet: ห้ามกลับไปสะกด role === 'viewer' เอง (แพตเทิร์นเดียวกับที่ล็อก
// ['won','in_project'] ไว้ใน dealStageOrder.test.mjs)
// ⚠️ `^[^/]*` = ตัดบรรทัดที่มี `//` นำหน้าออก — ไม่งั้นคอมเมนต์ที่อธิบายบั๊กนี้
// (รวมถึงคอมเมนต์ในไฟล์นี้เอง) จะถูกนับเป็นการละเมิดกฎ
const SPELLS_VIEWER = 'role === .viewer.';
const grep = (cwd, args) => {
  try {
    return execSync(`git grep -n -E "^[^/]*${SPELLS_VIEWER}" -- ${args}`, { cwd, encoding: 'utf8' });
  } catch (error) {
    if (error.status !== 1) throw error; // exit 1 = ไม่เจอ = ผ่าน
    return '';
  }
};

test('ไม่มีใครสะกด role === "viewer" เองนอกจากนิยาม isReadOnlyObserver', () => {
  const root = dirname(fileURLToPath(import.meta.url)).replace(/[/\\]lib$/, '');
  const hits = grep(root, '"*.js" ":!*permissions.js" ":!*.test.mjs"');
  assert.equal(hits.trim(), '', `ต้องใช้ isReadOnlyObserver แทน:\n${hits}`);
});

test('ใน permissions.js เองก็เหลือ role === "viewer" ได้แค่ในนิยาม isReadOnlyObserver', () => {
  const root = dirname(fileURLToPath(import.meta.url));
  const lines = grep(root, '"permissions.js"').trim().split('\n').filter(Boolean);
  assert.equal(
    lines.length, 1,
    `permissions.js ต้องมีที่เดียว (นิยาม isReadOnlyObserver) แต่เจอ ${lines.length} จุด:\n${lines.join('\n')}`,
  );
  assert.match(lines[0], /return role === 'viewer' \|\| role === 'executive'/);
});
