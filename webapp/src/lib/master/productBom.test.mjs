import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BOM_COLUMNS, BOM_LOCKED_FIELDS, BOM_TRANSITIONS,
  bomActionPatch, bomFilterValueOf, bomFormulaBound, bomLockMessage, bomLocked, bomLockedFieldChanges,
  bomSendBlocker, bomStatusOf, bomThreadEvent, bomTransitionError, hasBomStep,
} from './productBom.js';
import { UPDATE_KINDS, isQuietUpdateKind } from './updateTypes.js';

const ready = (over = {}) => ({
  id: 'P-1', fgCode: 'FG-0510-01-002-10001', categoryCode: '01-002', approvalStatus: 'approved', isActive: true,
  formulaId: 'FML-1', volume: 50, volumeUnit: 'ml', bomStatus: null, bomRound: 0, ...over,
});
const user = { id: 'U-SA', name: 'เอ ฝ่ายขาย' };
const NOW = '2026-11-03T03:00:00.000Z';

test('ขั้นลง BOM มีเฉพาะกลุ่ม 01/02 (มติข้อ 2) — 03/04 ไม่มีปุ่ม', () => {
  assert.equal(hasBomStep({ categoryCode: '01-002' }), true);
  assert.equal(hasBomStep({ categoryCode: '02-001' }), true);
  assert.equal(hasBomStep({ categoryCode: '03-002' }), false);
  assert.equal(hasBomStep({ categoryCode: '04-003' }), false);
  // แถวเก่าที่ไม่มีหมวด อ่านจากรหัส FG
  assert.equal(hasBomStep({ fgCode: 'FG-108-01-002-2009' }), true);
});

test('สถานะ: ค่าว่าง/แปลกปลอม = ยังไม่ส่ง · ล็อกตั้งแต่ส่งจนกว่าจะดึงกลับ/ตีกลับ (มติข้อ 6)', () => {
  assert.equal(bomStatusOf({}), null);
  assert.equal(bomStatusOf({ bomStatus: 'weird' }), null);
  assert.equal(bomLocked({ bomStatus: null }), false);
  assert.equal(bomLocked({ bomStatus: 'queued' }), true);
  assert.equal(bomLocked({ bomStatus: 'in_progress' }), true);
  assert.equal(bomLocked({ bomStatus: 'done' }), true);
  assert.equal(bomLocked({ bomStatus: 'returned' }), false);
});

test('ผูกสูตร/กลิ่นตามหมวด (มติข้อ 3) — ชุดของขวัญนับแถว · หัวน้ำหอมนับกลิ่น · ตัวเครื่องข้าม', () => {
  assert.equal(bomFormulaBound(ready()), true);
  assert.equal(bomFormulaBound(ready({ formulaId: null })), false);
  assert.equal(bomFormulaBound(ready({ categoryCode: '02-020', formulaId: null, scentId: 'SCT-1' })), true);
  assert.equal(bomFormulaBound(ready({ categoryCode: '02-020', formulaId: null, scentId: null })), false);
  assert.equal(bomFormulaBound(ready({ categoryCode: '01-037', formulaId: null }), { formulaComponents: [] }), false);
  assert.equal(bomFormulaBound(ready({ categoryCode: '01-037', formulaId: null }), { formulaComponents: [{ formulaId: 'F1' }] }), true);
  // R2 (มติเจ้าของ 11/11 · mig 0433): ฟอร์มบันทึกแถวที่ยังไม่เลือกสูตรได้ ⇒ ด่านส่งลง BOM ต้องเห็นว่าขาดแม้แถวเดียว
  const gift = ready({ categoryCode: '01-037', formulaId: null });
  assert.equal(bomFormulaBound(gift, { formulaComponents: [{ formulaId: 'F1' }, { formulaId: null }] }), false);
  assert.equal(bomFormulaBound(gift, { formulaComponents: [{ formulaId: 'F1' }, { formulaId: 'F2' }] }), true);
  assert.match(bomSendBlocker(gift, { formulaComponents: [{ formulaId: 'F1' }, { formulaId: '' }] }), /เลือกสูตรให้ครบทุกแถวในชุด/);
  assert.equal(bomFilterValueOf({ ...gift, giftSetFormulaIds: ['F1', null] }), 'blocked', 'ทะเบียนสินค้า: แถวที่ขาดสูตรมาเป็น null');
  assert.equal(bomFormulaBound(ready({ categoryCode: '02-024', formulaId: null })), true);
  assert.equal(bomFormulaBound(ready({ categoryCode: '02-035', formulaId: null })), true);
});

test('ด่านส่ง: ต้องอนุมัติแล้ว + ผูกสูตร + มีปริมาตร · ไม่ผ่าน = ข้อความไทยบอกเหตุ', () => {
  assert.equal(bomSendBlocker(ready()), '');
  assert.match(bomSendBlocker(ready({ approvalStatus: 'pending' })), /รออนุมัติ/);
  assert.match(bomSendBlocker(ready({ approvalStatus: 'rejected' })), /ตีกลับ/);
  assert.match(bomSendBlocker(ready({ isActive: false })), /พักใช้งาน/);
  assert.match(bomSendBlocker(ready({ formulaId: null })), /ผูกสูตรจากทะเบียน/);
  assert.match(bomSendBlocker(ready({ categoryCode: '02-020', formulaId: null })), /ผูกกลิ่น/);
  assert.match(bomSendBlocker(ready({ volume: null })), /ปริมาตร/);
  // ขาดสองอย่าง = บอกทั้งสองในข้อความเดียว
  assert.match(bomSendBlocker(ready({ formulaId: null, volume: 0 })), /ผูกสูตร.*·.*ปริมาตร/);
  assert.match(bomSendBlocker(ready({ bomStatus: 'queued' })), /ส่งไปแล้ว/);
  // ส่งใหม่หลังตีกลับได้
  assert.equal(bomSendBlocker(ready({ bomStatus: 'returned' })), '');
  // แถว approvalStatus ว่าง (ก่อน mig 0027) นับเป็นอนุมัติแล้ว — กติกาเดียวกับทั้งระบบ
  assert.equal(bomSendBlocker(ready({ approvalStatus: null })), '');
});

test('ทางเดินสถานะ: ดึงกลับได้เฉพาะรอรับเรื่อง · เสร็จจากรอรับเรื่องได้ตรง ๆ · ย้อนจากเสร็จได้', () => {
  assert.equal(bomTransitionError('pullback', ready({ bomStatus: 'queued' })), '');
  assert.match(bomTransitionError('pullback', ready({ bomStatus: 'in_progress' })), /RD รับเรื่องแล้ว/);
  assert.equal(bomTransitionError('done', ready({ bomStatus: 'queued' })), '');
  assert.equal(bomTransitionError('done', ready({ bomStatus: 'in_progress' })), '');
  assert.notEqual(bomTransitionError('done', ready({ bomStatus: 'done' })), '');
  assert.notEqual(bomTransitionError('accept', ready({ bomStatus: 'in_progress' })), '', 'รับซ้ำไม่ได้');
  assert.equal(bomTransitionError('reopen', ready({ bomStatus: 'done' })), '');
  assert.notEqual(bomTransitionError('send', ready({ bomStatus: 'queued' })), '', 'ส่งซ้ำไม่ได้');
  assert.equal(bomTransitionError('nope', ready()), 'ไม่รู้จักคำสั่งนี้');
  // ทุกคำสั่งมีฝั่งชัด (route ใช้ตัดสินสิทธิ์)
  for (const rule of Object.values(BOM_TRANSITIONS)) assert.ok(['sales', 'rd'].includes(rule.side));
});

test('ส่ง: นับรอบ · ประทับคนส่ง · ล้างผลของรอบก่อน', () => {
  const plan = bomActionPatch('send', ready({ bomStatus: 'returned', bomRound: 1, bomCode: 'OLD', bomAcceptedBy: 'U-RD' }), { user, now: NOW });
  assert.equal(plan.error, undefined);
  assert.equal(plan.from, 'returned');
  assert.equal(plan.patch.bomStatus, 'queued');
  assert.equal(plan.patch.bomRound, 2);
  assert.equal(plan.patch.bomSentBy, 'U-SA');
  assert.equal(plan.patch.bomSentByName, 'เอ ฝ่ายขาย');
  assert.equal(plan.patch.bomCode, null);
  assert.equal(plan.patch.bomAcceptedBy, null);
  assert.equal(plan.patch.bomUpdatedAt, NOW);
  // ข้อมูลไม่ครบ = ไม่มี patch
  assert.match(bomActionPatch('send', ready({ formulaId: null }), { user }).error, /ผูกสูตร/);
  // ชุดของขวัญ: ส่งแถวสูตรมาด้วยจึงผ่าน
  const set = ready({ categoryCode: '01-037', formulaId: null });
  assert.ok(bomActionPatch('send', set, { user }).error);
  assert.equal(bomActionPatch('send', set, { user, formulaComponents: [{ formulaId: 'F1' }] }).error, undefined);
});

test('ดึงกลับ: กลับเป็นยังไม่ส่ง และไม่นับเป็นรอบ', () => {
  const plan = bomActionPatch('pullback', ready({ bomStatus: 'queued', bomRound: 1, bomSentBy: 'U-SA' }), { user, now: NOW });
  assert.equal(plan.to, null);
  assert.equal(plan.patch.bomStatus, null);
  assert.equal(plan.patch.bomRound, 0);
  assert.equal(plan.patch.bomSentBy, null);
});

test('ตีกลับต้องมีเหตุผล (มติข้อ 4) · เสร็จ: รหัสไม่บังคับ (มติข้อ 7) · เสร็จจากรอรับเรื่อง = คนกดเป็นคนรับด้วย', () => {
  const rd = { id: 'U-RD', name: 'ริสา' };
  assert.match(bomActionPatch('return', ready({ bomStatus: 'queued' }), { user: rd, reason: '  ' }).error, /เหตุผล/);
  const ret = bomActionPatch('return', ready({ bomStatus: 'in_progress' }), { user: rd, reason: 'สูตรผิดตัว', now: NOW });
  assert.equal(ret.patch.bomStatus, 'returned');
  assert.equal(ret.patch.bomReturnReason, 'สูตรผิดตัว');
  assert.equal(ret.patch.bomReturnedByName, 'ริสา');

  const quick = bomActionPatch('done', ready({ bomStatus: 'queued' }), { user: rd, now: NOW });
  assert.equal(quick.patch.bomStatus, 'done');
  assert.equal(quick.patch.bomCode, null);
  assert.equal(quick.patch.bomAcceptedBy, 'U-RD');
  const coded = bomActionPatch('done', ready({ bomStatus: 'in_progress', bomAcceptedBy: 'U-X' }), { user: rd, bomCode: ' BOM-001 ', note: 'ตรวจแล้ว', now: NOW });
  assert.equal(coded.patch.bomCode, 'BOM-001');
  assert.equal(coded.patch.bomNote, 'ตรวจแล้ว');
  assert.equal(coded.patch.bomAcceptedBy, undefined, 'รับเรื่องไว้แล้ว ไม่เขียนทับคนรับ');
  assert.match(bomActionPatch('done', ready({ bomStatus: 'in_progress' }), { user: rd, bomCode: 'x'.repeat(61) }).error, /ไม่เกิน/);

  const back = bomActionPatch('reopen', ready({ bomStatus: 'done', bomCode: 'BOM-001' }), { user: rd, now: NOW });
  assert.equal(back.patch.bomStatus, 'in_progress');
  assert.equal(back.patch.bomDoneAt, null);
  assert.equal(back.patch.bomCode, undefined, 'ย้อนแล้วรหัสเดิมยังอยู่');
});

test('ล็อกช่อง (มติข้อ 5): สูตร/กลิ่น/สูตรในชุด/ปริมาตร/หน่วย — ชื่อ/ลูกค้าแก้ได้ · ปริมาตรเทียบเป็นตัวเลข', () => {
  assert.deepEqual([...BOM_LOCKED_FIELDS], ['formulaId', 'scentId', 'formulaComponents', 'volume', 'volumeUnit']);
  const sent = ready({ bomStatus: 'queued' });
  assert.deepEqual(bomLockedFieldChanges(sent, ['productDescription', 'customerId', 'customerName']), []);
  assert.deepEqual(bomLockedFieldChanges(sent, ['formulaId', 'productDescription']), ['formulaId']);
  assert.deepEqual(bomLockedFieldChanges(sent, [], { giftSetChanged: true }), ['formulaComponents']);
  // "50.0" กับ 50 คือค่าเดียวกัน — ไม่ใช่การแก้ปริมาตร
  assert.deepEqual(bomLockedFieldChanges(sent, ['volume'], { updated: { volume: '50.0' } }), []);
  assert.deepEqual(bomLockedFieldChanges(sent, ['volume'], { updated: { volume: '60' } }), ['volume']);
  // ยังไม่ส่ง / ถูกตีกลับ = ไม่ล็อก
  assert.deepEqual(bomLockedFieldChanges(ready(), ['formulaId']), []);
  assert.deepEqual(bomLockedFieldChanges(ready({ bomStatus: 'returned' }), ['formulaId']), []);
  // ข้อความบอกทางออกตามสถานะ
  assert.match(bomLockMessage(sent, ['formulaId']), /ดึงกลับจาก RD/);
  assert.match(bomLockMessage(ready({ bomStatus: 'in_progress' }), ['volume']), /ให้ RD ตีกลับ/);
  assert.match(bomLockMessage(ready({ bomStatus: 'done' }), ['volume']), /สร้าง FG ใหม่/);
});

test('ทุกคำสั่งมีชนิดเหตุการณ์ในเธรดที่ลงทะเบียนแล้ว และเงียบ (กระดิ่งยิงตรงจาก route)', () => {
  for (const action of Object.keys(BOM_TRANSITIONS)) {
    const event = bomThreadEvent(action, ready(), { bomRound: 2, bomReturnReason: 'x', bomCode: 'B-1' });
    assert.ok(event?.kind, action);
    assert.ok(UPDATE_KINDS.product[event.kind], `${event.kind} ต้องอยู่ใน UPDATE_KINDS.product`);
    assert.equal(isQuietUpdateKind('product', event.kind), true, `${event.kind} ต้อง quiet`);
  }
  assert.match(bomThreadEvent('send', ready(), { bomRound: 2 }).body, /รอบที่ 2/);
  assert.match(bomThreadEvent('done', ready(), { bomCode: 'B-1' }).body, /B-1/);
});

test('คอลัมน์ของ mig 0419 ตรงกับ BOM_COLUMNS ทุกตัว (route ทั้งสองเส้นพึ่งชุดนี้)', () => {
  const sql = readFileSync(new URL('../../../supabase/migrations/0419_product_bom_handoff.sql', import.meta.url), 'utf8');
  const added = [...sql.matchAll(/ADD COLUMN IF NOT EXISTS "(bom[A-Za-z]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...added].sort(), [...BOM_COLUMNS].sort());
  // ข้อความตรวจหลังรันในหัวไฟล์บอกจำนวนให้ตรงด้วย
  assert.match(sql, new RegExp(`cols = ${BOM_COLUMNS.length}`));
});

test('PATCH สินค้าไม่เขียนช่อง BOM กลับ + ตีกลับช่องที่ล็อก (รูปโค้ด)', () => {
  const route = readFileSync(new URL('../../app/api/products/[id]/route.js', import.meta.url), 'utf8');
  assert.match(route, /for \(const key of BOM_COLUMNS\) delete updated\[key\]/);
  assert.match(route, /bomLockedFieldChanges\(product, changedFields, \{ updated \}\)/);
  // ล็อกต้องตัดสินก่อนเขียน — ตำแหน่งของด่านอยู่ก่อน `.update(updated)`
  assert.ok(route.indexOf("code: 'bom-locked'") < route.indexOf('.update(updated)'));
});
