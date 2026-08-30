// ── ผลรายเครื่อง + สถานะที่สรุปจากลูก (mig 0301 · F-4) ────────────────────
//
// ⭐ กฎที่เทสต์นี้ล็อก: **เจ้าหน้าที่ไม่ได้เลือกเองว่าใบจบแบบไหน** ถ้าให้เลือก คนจะกด "เสร็จ"
// เพราะเป็นปุ่มที่จบงานเร็วที่สุดเสมอ แล้ว "ทำไม่ครบ" จะไม่มีวันปรากฏในระบบ
// ทั้งที่ของจริงเกิดทุกเดือน (ใบส่งงาน 01/08/69: เครื่อง 4 ตัวทำแล้ว Reed 6 ขวดยังไม่ได้ทำ)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASSET_OUTCOMES, deriveVisitStatus, normalizeAssetResult, pendingAssets, assetResultFlags,
} from './visitAssets.js';

const R = (assetId, outcome, extra = {}) => ({ assetId, outcome, ...extra });

test('ไม่มีเครื่องให้ทำเลย = done ไม่ใช่ unable', () => {
  // งานตรวจพื้นที่ · ไซต์ที่ยังไม่ลงทะเบียนเครื่อง — ไม่มีอะไรให้ทำตั้งแต่แรก
  assert.equal(deriveVisitStatus([]), 'done');
  assert.equal(deriveVisitStatus(undefined), 'done');
});

test('ทุกตัวจบ = done · เปลี่ยนเครื่องนับเป็นงานที่ทำแล้ว', () => {
  assert.equal(deriveVisitStatus([R('A', 'done'), R('B', 'done')]), 'done');
  assert.equal(deriveVisitStatus([R('A', 'done'), R('B', 'swapped')]), 'done');
  assert.equal(deriveVisitStatus([R('A', 'swapped')]), 'done');
});

test('⭐ บางตัวทำไม่ได้ = partial — เคสจริงจากใบส่งงาน 01/08/69', () => {
  const rows = [R('m1', 'done'), R('m2', 'done'), R('m3', 'swapped'), R('reed', 'unable')];
  assert.equal(deriveVisitStatus(rows), 'partial');
});

test('ไม่มีตัวไหนจบเลย = unable', () => {
  assert.equal(deriveVisitStatus([R('A', 'unable'), R('B', 'unable')]), 'unable');
});

test('แถวที่ผลไม่ถูกต้องถูกทิ้ง ไม่ใช่ทำให้ทั้งใบเพี้ยน', () => {
  // ค่าที่ไม่รู้จัก (ข้อมูลเก่า/ยิงมั่ว) ต้องไม่ถูกนับเป็น "จบแล้ว" เงียบ ๆ
  assert.equal(deriveVisitStatus([R('A', 'done'), R('B', 'weird')]), 'done');
  assert.equal(deriveVisitStatus([R('B', 'weird')]), 'done');
});

test('ทำไม่ได้/เปลี่ยนเครื่อง ต้องมีเหตุผล — done ไม่ต้อง', () => {
  assert.ok(normalizeAssetResult(R('A', 'done')).value);
  assert.match(normalizeAssetResult(R('A', 'unable')).error, /เหตุผล/);
  assert.match(normalizeAssetResult(R('A', 'unable', { reason: 'สั้น' })).error, /เหตุผล/);
  assert.ok(normalizeAssetResult(R('A', 'unable', { reason: 'รอ RD ปรับสูตร' })).value);
});

test('เปลี่ยนเครื่องต้องบอกตัวแทน และห้ามเป็นตัวเดิม', () => {
  assert.match(normalizeAssetResult(R('A', 'swapped', { reason: 'เครื่องชำรุด' })).error, /เอาเครื่องไหนมาแทน/);
  assert.match(
    normalizeAssetResult(R('A', 'swapped', { reason: 'เครื่องชำรุด', replacedByAssetId: 'A' })).error,
    /ไม่ใช่ตัวเดิม/,
  );
  const ok = normalizeAssetResult(R('A', 'swapped', { reason: 'เครื่องชำรุด', replacedByAssetId: 'B' }));
  assert.equal(ok.value.replacedByAssetId, 'B');
});

test('เครื่องที่เอามาแทนถูกล้างทิ้งเมื่อผลไม่ใช่ swapped — ค่าค้างจากการกดสลับต้องไม่หลุดลง DB', () => {
  const { value } = normalizeAssetResult(R('A', 'done', { replacedByAssetId: 'B' }));
  assert.equal(value.replacedByAssetId, null);
});

test('เครื่องที่ถอดออก/ส่งซ่อมไม่ต้องมีคำตอบ — ไม่ได้อยู่หน้างานให้ทำ', () => {
  const assets = [
    { id: 'A', status: 'active', label: 'เครื่อง 1' },
    { id: 'B', status: 'removed', label: 'เครื่องเก่า' },
    { id: 'C', status: 'repair', label: 'ส่งซ่อม' },
    { id: 'D', status: 'active', label: 'เครื่อง 2' },
  ];
  const pending = pendingAssets(assets, [R('A', 'done')]);
  assert.deepEqual(pending.map((a) => a.id), ['D']);
});

test('ป้าย "ต้องดู" พูดเฉพาะสิ่งที่ผิดปกติ — ใบที่เรียบร้อยไม่มีข้อความ', () => {
  const byId = new Map([['A', { label: 'เครื่องที่ 1' }], ['R', { label: 'Reed' }]]);
  assert.deepEqual(assetResultFlags([R('A', 'done')], byId), []);
  const flags = assetResultFlags([R('A', 'swapped'), R('R', 'unable')], byId);
  assert.equal(flags.length, 2);
  assert.match(flags[0], /เปลี่ยนเครื่อง 1 ตัว — เครื่องที่ 1/);
  assert.match(flags[1], /ทำไม่ได้ 1 รายการ — Reed/);
});

test('ชุดผลมีสามค่าเท่านั้น — เพิ่มค่าใหม่ต้องมาแก้กติกาการสรุปด้วย', () => {
  assert.deepEqual(ASSET_OUTCOMES, ['done', 'unable', 'swapped']);
});
