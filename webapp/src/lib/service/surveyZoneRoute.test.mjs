// ── หน้าพื้นที่ ↔ ประวัติเบราว์เซอร์ (แผน §10.5 · ตาราง §3.3) ──────────────────────────
//
// ⭐ ทุกแถวของตาราง §3.3 มีเทสต์ของมัน — ตัวต่อสายทำตาม effects ตามลำดับเป๊ะ ⇒ ลำดับใน effects คือสัญญา
// 🔴 เคสที่ห้ามพลาดที่สุด: **ค่าค้าง + ปุ่มย้อน** — เบราว์เซอร์ย้อนไปแล้วก่อนเราจะรู้ ⇒ ต้องดันชั้นเดิมกลับ
//    แล้วค่อยถาม · ไม่งั้นค่าที่ช่างพิมพ์หายโดยไม่มีคำถามสักคำ (เจ้าของเลือกไม่เก็บร่างในเครื่อง)
import test from 'node:test';
import assert from 'node:assert/strict';
import { SURVEY_ZONE_ROUTE_START, surveyZoneRouteStep } from './surveyZoneRoute.js';

const ZONES = ['z1', 'z2', 'z3'];
const ctx = (extra = {}) => ({ dirty: false, split: false, zoneIds: ZONES, defaultZoneId: 'z3', ...extra });
const step = (state, event, extra) => surveyZoneRouteStep(state, event, ctx(extra));
/** เดินหลายก้าวต่อกัน (ค่าค้าง/โหมดเดิมทุกก้าว) — คืนสภาพสุดท้าย */
const run = (events, extra) => events.reduce((s, e) => step(s, e, extra).state, SURVEY_ZONE_ROUTE_START);

const pagesOn = (zoneId) => run([{ type: 'init', zoneId: null }, { type: 'open', zoneId }]);
const splitOn = (zoneId) => run([{ type: 'init', zoneId }], { split: true });

test('ลิงก์ตรง ?zone= ปูสองชั้น — แทนที่ด้วยชั้นใบก่อน แล้วค่อยดันชั้นพื้นที่ ⇒ ย้อนครั้งแรกยังอยู่ในใบ', () => {
  const { state, effects } = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: 'z2' });
  assert.deepEqual(effects, [{ kind: 'replace', zoneId: null }, { kind: 'push', zoneId: 'z2' }]);
  assert.equal(state.shown, 'z2');
  assert.equal(state.above, true);
  assert.equal(state.mode, 'pages');
});

test('เปิดหน้าไม่มีลิงก์พื้นที่: หน้าเดียว = รายการ · สองบาน = พื้นที่ตั้งต้นทันที (บานขวาไม่ว่าง)', () => {
  const pages = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null });
  assert.deepEqual(pages.effects, [{ kind: 'replace', zoneId: null }]);
  assert.equal(pages.state.shown, null);

  const split = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null }, { split: true });
  assert.deepEqual(split.effects, [{ kind: 'replace', zoneId: null }, { kind: 'push', zoneId: 'z3' }]);
  assert.equal(split.state.shown, 'z3');
  assert.equal(split.state.mode, 'split');
});

test('ลิงก์ที่ชี้พื้นที่ที่ไม่มีแล้ว = เปิดเหมือนไม่มีลิงก์', () => {
  const pages = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: 'gone' });
  assert.deepEqual(pages.effects, [{ kind: 'replace', zoneId: null }]);
  assert.equal(pages.state.shown, null);
  const split = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: 'gone' }, { split: true });
  assert.equal(split.state.shown, 'z3');
});

test('รายการ → พื้นที่ = ดัน · พื้นที่ → พื้นที่ = แทนที่ (กองมีแค่สองชั้นเสมอ)', () => {
  const list = run([{ type: 'init', zoneId: null }]);
  const first = step(list, { type: 'open', zoneId: 'z1' });
  assert.deepEqual(first.effects, [
    { kind: 'push', zoneId: 'z1' }, { kind: 'scroll', to: 'top' }, { kind: 'focus', target: 'heading' },
  ]);
  const second = step(first.state, { type: 'open', zoneId: 'z2' });
  assert.equal(second.effects[0].kind, 'replace', 'ถัดไป/‹ › ห้ามดันชั้นซ้อน — ไม่งั้นย้อนทีละพื้นที่');
  assert.equal(second.effects[0].zoneId, 'z2');
  assert.equal(second.state.shown, 'z2');
});

test('เปิดพื้นที่เดิมซ้ำ / พื้นที่ที่ไม่รู้จัก = ไม่ทำอะไร', () => {
  const on = pagesOn('z1');
  assert.deepEqual(step(on, { type: 'open', zoneId: 'z1' }).effects, []);
  assert.deepEqual(step(on, { type: 'open', zoneId: 'nope' }).effects, []);
});

test('สองบาน: กดแถวอื่น = แทนที่ชั้นบน แล้วเลื่อนบานขวา (โฟกัสยังอยู่ที่รายการ)', () => {
  const { state, effects } = step(splitOn('z1'), { type: 'open', zoneId: 'z2' }, { split: true });
  assert.deepEqual(effects, [{ kind: 'replace', zoneId: 'z2' }, { kind: 'scroll', to: 'pane' }]);
  assert.equal(state.shown, 'z2');
});

test('มีค่าค้างแล้วกดพื้นที่อื่น = ถาม ยังไม่ย้าย · ตอบทิ้ง = ทิ้งร่างแล้วค่อยย้าย · ตอบกลับ = อยู่ที่เดิม', () => {
  const on = pagesOn('z1');
  const asked = step(on, { type: 'open', zoneId: 'z2' }, { dirty: true });
  assert.deepEqual(asked.effects, [{ kind: 'ask', from: 'z1', to: 'z2', via: 'nav' }]);
  assert.equal(asked.state.shown, 'z1', 'ยังไม่ย้ายจนกว่าจะตอบ');

  const confirmed = step(asked.state, { type: 'confirm' }, { dirty: true });
  assert.deepEqual(confirmed.effects.slice(0, 2), [{ kind: 'resetDraft' }, { kind: 'replace', zoneId: 'z2' }]);
  assert.equal(confirmed.state.shown, 'z2');
  assert.equal(confirmed.state.pending, null);

  const cancelled = step(asked.state, { type: 'cancel' }, { dirty: true });
  assert.deepEqual(cancelled.effects, []);
  assert.equal(cancelled.state.shown, 'z1');
  assert.equal(cancelled.state.pending, null);
});

test('"← พื้นที่ทั้งหมด" ไม่มีค่าค้าง = ย้อนเอง (นับ skip) · เหตุการณ์ย้อนที่ตามมาไม่ถูกอ่านเป็นการกดของผู้ใช้', () => {
  const on = pagesOn('z2');
  const back = step(on, { type: 'list' });
  assert.deepEqual(back.effects, [
    { kind: 'back', steps: 1 }, { kind: 'scroll', to: 'restore' }, { kind: 'focus', target: 'row', zoneId: 'z2' },
  ]);
  assert.equal(back.state.shown, null);
  assert.equal(back.state.skip, 1);

  const echo = step(back.state, { type: 'pop', zoneId: null });
  assert.deepEqual(echo.effects, [], 'ย้อนที่เราสั่งเองต้องไม่ถามซ้ำ/ไม่ย้ายซ้ำ');
  assert.equal(echo.state.skip, 0);
});

test('"← พื้นที่ทั้งหมด" มีค่าค้าง = ถาม · ตอบทิ้ง = ทิ้งร่าง แล้วย้อนพร้อม skip', () => {
  const asked = step(pagesOn('z2'), { type: 'list' }, { dirty: true });
  assert.deepEqual(asked.effects, [{ kind: 'ask', from: 'z2', to: null, via: 'nav' }]);
  const confirmed = step(asked.state, { type: 'confirm' }, { dirty: true });
  assert.deepEqual(confirmed.effects.slice(0, 2), [{ kind: 'resetDraft' }, { kind: 'back', steps: 1 }]);
  assert.equal(confirmed.state.skip, 1);
  assert.equal(confirmed.state.shown, null);
});

test('🔴 ปุ่มย้อนของมือถือตอนมีค่าค้าง — ดันชั้นเดิมกลับ (undo) ก่อน แล้วค่อยถาม', () => {
  const on = pagesOn('z2');
  const popped = step(on, { type: 'pop', zoneId: null }, { dirty: true });
  assert.deepEqual(popped.effects, [
    { kind: 'push', zoneId: 'z2' },
    { kind: 'ask', from: 'z2', to: null, via: 'pop' },
  ], 'ลำดับสำคัญ: ดันกลับก่อน URL ถึงจะตรงกับจอระหว่างที่กล่องถามเปิดอยู่');
  assert.equal(popped.state.shown, 'z2', 'จอยังโชว์พื้นที่เดิมพร้อมค่าที่พิมพ์');

  const confirmed = step(popped.state, { type: 'confirm' }, { dirty: true });
  assert.deepEqual(confirmed.effects.slice(0, 2), [{ kind: 'resetDraft' }, { kind: 'back', steps: 1 }]);
  assert.equal(confirmed.state.skip, 1, 'ย้อนรอบนี้เป็นของเราเอง');
  assert.equal(confirmed.state.shown, null);

  const cancelled = step(popped.state, { type: 'cancel' }, { dirty: true });
  assert.equal(cancelled.state.shown, 'z2');
  assert.deepEqual(cancelled.effects, [], 'ชั้นที่ดันกลับไว้ตรงกับจอแล้ว');
});

test('ปุ่มย้อนไม่มีค่าค้าง (หน้าเดียว) = กลับรายการ คืนตำแหน่งเลื่อน โฟกัสแถวเดิม', () => {
  const { state, effects } = step(pagesOn('z1'), { type: 'pop', zoneId: null });
  assert.equal(state.shown, null);
  assert.equal(state.above, false);
  assert.deepEqual(effects, [{ kind: 'scroll', to: 'restore' }, { kind: 'focus', target: 'row', zoneId: 'z1' }]);
});

test('ไปหน้า (Forward) ถึงชั้นพื้นที่: ไม่มีค่าค้าง = โชว์พื้นที่นั้น · มีค่าค้าง = แทน URL กลับแล้วถาม', () => {
  const list = run([{ type: 'init', zoneId: null }, { type: 'open', zoneId: 'z1' }, { type: 'pop', zoneId: null }]);
  const forward = step(list, { type: 'pop', zoneId: 'z1' });
  assert.equal(forward.state.shown, 'z1');
  assert.deepEqual(forward.effects, [{ kind: 'scroll', to: 'top' }, { kind: 'focus', target: 'heading' }]);

  const dirtyForward = step(pagesOn('z1'), { type: 'pop', zoneId: 'z2' }, { dirty: true });
  assert.deepEqual(dirtyForward.effects, [
    { kind: 'replace', zoneId: 'z1' },
    { kind: 'ask', from: 'z1', to: 'z2', via: 'pop' },
  ]);
  const confirmed = step(dirtyForward.state, { type: 'confirm' }, { dirty: true });
  assert.deepEqual(confirmed.effects.slice(0, 2), [{ kind: 'resetDraft' }, { kind: 'replace', zoneId: 'z2' }]);
  assert.equal(confirmed.state.shown, 'z2');
});

test('สองบาน: ย้อนลงชั้นใบ ไม่มีค่าค้าง = ออกจากหน้า (ย้อนต่ออีกชั้น)', () => {
  const { state, effects } = step(splitOn('z2'), { type: 'pop', zoneId: null }, { split: true });
  assert.deepEqual(effects, [{ kind: 'back', steps: 1 }]);
  assert.equal(state.skip, 1);
});

test('🔴 สองบาน: ย้อนออกตอนมีค่าค้าง = ดันกลับแล้วถาม · ตอบทิ้ง = ย้อนสองชั้น (go -2) ออกจากหน้า', () => {
  const popped = step(splitOn('z2'), { type: 'pop', zoneId: null }, { split: true, dirty: true });
  assert.deepEqual(popped.effects, [
    { kind: 'push', zoneId: 'z2' },
    { kind: 'ask', from: 'z2', to: null, via: 'leave' },
  ]);
  const confirmed = step(popped.state, { type: 'confirm' }, { split: true, dirty: true });
  // 🐞 review 26/09 ไม่ทิ้งร่างก่อนออก — ออกจริงหน้าถูกถอดเอง · ออกไม่ได้ (แท็บใหม่) ค่าต้องยังอยู่
  assert.deepEqual(confirmed.effects, [{ kind: 'back', steps: 2 }]);
});

test('สลับแท็บ: ไม่มีค่าค้าง = สลับเลย · มีค่าค้าง = ถาม แล้วสลับเมื่อตอบทิ้ง', () => {
  const on = pagesOn('z1');
  // `zoneId` = ชั้นพื้นที่ของรายการนี้ — แท็บสรุปคงกุญแจไว้ แท็บหน้างานเขียน ?zone= กลับ
  assert.deepEqual(step(on, { type: 'tab', tab: 'result' }).effects, [{ kind: 'tab', tab: 'result', zoneId: 'z1' }]);

  const asked = step(on, { type: 'tab', tab: 'result' }, { dirty: true });
  assert.deepEqual(asked.effects, [{ kind: 'ask', from: 'z1', to: 'result', via: 'tab' }]);
  const confirmed = step(asked.state, { type: 'confirm' }, { dirty: true });
  assert.deepEqual(confirmed.effects, [{ kind: 'resetDraft' }, { kind: 'tab', tab: 'result', zoneId: 'z1' }]);

  const list = run([{ type: 'init', zoneId: null }]);
  assert.deepEqual(step(list, { type: 'tab', tab: 'result' }).effects, [{ kind: 'tab', tab: 'result' }],
    'หน้ารายการ (ไม่มีชั้นพื้นที่) = ไม่พกพื้นที่');
});

/* ══ 🐞 UAT 25/09 — รีวิวเส้นประวัติของจอหน้างาน (#15–#18) ══════════════════════════════════════════════ */

test('🐞 รีเฟรชบนชั้นพื้นที่ของเราเอง (กุญแจ surveyZone ตรงกับ ?zone=) — ไม่แทนที่/ไม่ดันซ้ำ · ชั้นใบอยู่ข้างล่างแล้ว', () => {
  for (const split of [false, true]) {
    const { state, effects } = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: 'z2', here: 'z2' }, { split });
    assert.deepEqual(effects, [], `${split ? 'สองบาน' : 'หน้าเดียว'}: เดิม [replace ใบ, push z2] ⇒ กองเป็น [ใบ, ใบ, z2]`);
    assert.equal(state.shown, 'z2');
    assert.equal(state.above, true, 'ย้อนครั้งถัดไปคือลงชั้นใบ — ด่านค่าค้างต้องทำงาน');
  }
  // ลิงก์จากกระดิ่ง (รายการใหม่ ไม่มีกุญแจ) ยังปูสองชั้นเหมือนเดิม
  assert.deepEqual(step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: 'z2', here: null }).effects,
    [{ kind: 'replace', zoneId: null }, { kind: 'push', zoneId: 'z2' }]);
});

test('🐞 เริ่มบนชั้นพื้นที่ของเรา แต่ต้องโชว์พื้นที่อื่น = แทนที่ชั้นบน · ไม่มีพื้นที่ให้โชว์ (หน้าเดียว) = ย้อนลงชั้นใบ', () => {
  // แท็บสรุปที่เคยเป็นชั้นพื้นที่ (URL ไม่มี ?zone= แต่กุญแจยังอยู่) → กลับหน้างาน = พื้นที่เดิม
  const kept = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null, here: 'z1' });
  assert.deepEqual(kept.effects, []);
  assert.equal(kept.state.shown, 'z1');
  // "เปิด X" ที่จองไว้ก่อนเริ่ม
  const other = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: 'z3', here: 'z1' });
  assert.deepEqual(other.effects, [{ kind: 'replace', zoneId: 'z3' }]);
  assert.equal(other.state.above, true);
  // พื้นที่ของชั้นนี้ถูกลบไปแล้ว — หน้าเดียวกลับรายการด้วยการย้อน (นับ skip) ไม่ใช่แทนที่เป็นใบซ้ำ
  const gone = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null, here: 'deleted' });
  assert.deepEqual(gone.effects, [{ kind: 'back', steps: 1 }]);
  assert.equal(gone.state.shown, null);
  assert.equal(gone.state.above, false);
  assert.equal(gone.state.skip, 1);
  // สองบาน: พื้นที่ที่ถูกลบ = พื้นที่ตั้งต้นแทนที่ชั้นบน
  const splitGone = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null, here: 'deleted' }, { split: true });
  assert.deepEqual(splitGone.effects, [{ kind: 'replace', zoneId: 'z3' }]);
});

test('🐞 สองบาน: ย้อนออกแล้วตกชั้นใบซ้ำของหน้านี้เอง = ดันพื้นที่ที่โชว์อยู่กลับ — ด่านค่าค้างไม่หลุด', () => {
  const left = step(splitOn('z1'), { type: 'pop', zoneId: null }, { split: true });
  assert.deepEqual(left.effects, [{ kind: 'back', steps: 1 }]);
  // การย้อนของเราไปตกรายการของหน้านี้ (กองเก่า [ใบ, ใบ, z1]) — เหตุการณ์ย้อนยังมาถึงหน้านี้
  const landed = step(left.state, { type: 'pop', zoneId: null }, { split: true });
  assert.deepEqual(landed.effects, [{ kind: 'push', zoneId: 'z1' }]);
  assert.equal(landed.state.above, true, 'เดิม above:false + shown z1 ⇒ พิมพ์แล้วย้อนอีกครั้งออกหน้าไม่ถาม');
  assert.equal(landed.state.skip, 0);
  // ช่างพิมพ์ต่อแล้วย้อน = ถามเหมือนเดิม
  const asked = step(landed.state, { type: 'pop', zoneId: null }, { split: true, dirty: true });
  assert.equal(asked.effects.at(-1).kind, 'ask');
  // หน้าเดียว: skip ของ "← พื้นที่ทั้งหมด" ยังถูกกินเงียบเหมือนเดิม
  const pages = step(pagesOn('z1'), { type: 'list' });
  assert.deepEqual(step(pages.state, { type: 'pop', zoneId: null }).effects, []);
});

test('🐞 สองบาน: ย้อนออกตอนมีของค้างระดับหน้า (การเคาะ · ข้อความถึงหัวหน้า · รูปที่ยังส่ง) = ดันกลับแล้วถาม · ตอบทิ้ง = go -2', () => {
  const popped = step(splitOn('z2'), { type: 'pop', zoneId: null }, { split: true, pageDirty: true, tab: 'field' });
  assert.deepEqual(popped.effects, [
    { kind: 'push', zoneId: 'z2' },
    { kind: 'ask', from: 'z2', to: null, via: 'leave' },
  ], 'เดิมพื้นที่ไม่มีค่าค้าง = ตัวต่อสายสั่งย้อนออกเอง ของค้างระดับหน้าหายไม่ถาม');
  const confirmed = step(popped.state, { type: 'confirm' }, { split: true, pageDirty: true });
  assert.deepEqual(confirmed.effects, [{ kind: 'back', steps: 2 }]);
  const cancelled = step(popped.state, { type: 'cancel' }, { split: true, pageDirty: true });
  assert.deepEqual(cancelled.effects, []);
  assert.equal(cancelled.state.above, true);
});

test('🐞 สองบาน: ย้อนออกจากแท็บสรุปตอนมีการเคาะค้าง = ดันรายการแท็บสรุปกลับ (แท็บไม่เด้งไปหน้างานใต้กล่องถาม)', () => {
  const popped = step(splitOn('z2'), { type: 'pop', zoneId: null }, { split: true, pageDirty: true, tab: 'result' });
  assert.deepEqual(popped.effects[0], { kind: 'push', zoneId: 'z2', tab: 'result' });
  assert.equal(popped.effects[1].via, 'leave');
});

test('หน้าเดียว: ของค้างระดับหน้าไม่ทำให้ย้อนจากพื้นที่ลงรายการต้องถาม (ยังอยู่ในหน้า)', () => {
  const { effects } = step(pagesOn('z1'), { type: 'pop', zoneId: null }, { pageDirty: true });
  assert.deepEqual(effects, [{ kind: 'scroll', to: 'restore' }, { kind: 'focus', target: 'row', zoneId: 'z1' }]);
});

test('🐞 กดแท็บที่เลือกอยู่แล้ว = ไม่ทำอะไร — ไม่ถาม "ทิ้ง?" ไม่เขียน URL ใบเปล่าทับ ?zone=', () => {
  const on = splitOn('z2');
  assert.deepEqual(step(on, { type: 'tab', tab: 'field' }, { split: true, tab: 'field', dirty: true }).effects, [],
    'เดิม: กล่องทิ้งค่าของการย้ายที่ไม่ได้ไปไหน');
  assert.deepEqual(step(on, { type: 'tab', tab: 'field' }, { split: true, tab: 'field' }).effects, [],
    'เดิม: {kind:"tab"} → เขียน URL ใบเปล่าทับรายการ ?zone=z2');
  // กลับจากแท็บสรุป = พกพื้นที่ที่บานขวาโชว์อยู่ ⇒ URL เป็น ?zone=z2 (รีเฟรชได้พื้นที่เดิม)
  assert.deepEqual(step(on, { type: 'tab', tab: 'field' }, { split: true, tab: 'result' }).effects,
    [{ kind: 'tab', tab: 'field', zoneId: 'z2' }]);
});

test('🐞 สองบานที่เริ่มตอนไม่มีพื้นที่ — พื้นที่มาถึงทีหลัง = ดันพื้นที่ตั้งต้นขึ้นบานขวา (ท่าเดียวกับหมุนจอ)', () => {
  const empty = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null }, { split: true, zoneIds: [], defaultZoneId: null });
  assert.equal(empty.state.shown, null);
  const arrived = step(empty.state, { type: 'zones' }, { split: true });
  // ชั้นเปล่าถูกดันไว้ตั้งแต่เริ่ม (review 26/09) ⇒ พื้นที่ที่มาถึงแทนที่ชั้นนั้น (กองยังสองชั้น)
  assert.deepEqual(arrived.effects, [{ kind: 'replace', zoneId: 'z3' }], 'เดิม: ไม่มีผล บานขวาค้างคำว่าง');
  assert.equal(arrived.state.shown, 'z3');
  assert.equal(arrived.state.above, true);
  // หน้าเดียวที่อยู่หน้ารายการ = ไม่ยุ่ง
  assert.deepEqual(step(run([{ type: 'init', zoneId: null }]), { type: 'zones' }).effects, []);
});

test('หมุนแท็บเล็ตเป็นแนวนอนตอนอยู่หน้ารายการ = ดันพื้นที่ตั้งต้นขึ้นบานขวา (ไม่ย้ายโฟกัส)', () => {
  const list = run([{ type: 'init', zoneId: null }]);
  const { state, effects } = step(list, { type: 'mode' }, { split: true });
  assert.deepEqual(effects, [{ kind: 'push', zoneId: 'z3' }]);
  assert.equal(state.mode, 'split');
  assert.equal(state.shown, 'z3');
});

test('หมุนตอนเปิดพื้นที่อยู่ = พื้นที่เดิม ไม่มีอะไรเปลี่ยนนอกจากโหมด (ค่าที่พิมพ์ไม่หาย)', () => {
  const { state, effects } = step(pagesOn('z1'), { type: 'mode' }, { split: true, dirty: true });
  assert.deepEqual(effects, []);
  assert.equal(state.shown, 'z1');
  assert.equal(state.mode, 'split');
  const back = step(state, { type: 'mode' }, { split: false });
  assert.equal(back.state.mode, 'pages');
  assert.equal(back.state.shown, 'z1');
});

test('พื้นที่ที่เปิดอยู่หายไป: หน้าเดียว = กลับรายการ · สองบาน = พื้นที่ตั้งต้น · ไม่ถามแม้มีค่าค้าง', () => {
  const pages = step(pagesOn('z2'), { type: 'zones' }, { zoneIds: ['z1', 'z3'], dirty: true });
  assert.deepEqual(pages.effects, [{ kind: 'back', steps: 1 }, { kind: 'focus', target: 'list' }]);
  assert.equal(pages.state.shown, null);
  assert.equal(pages.state.skip, 1);

  const split = step(splitOn('z2'), { type: 'zones' }, { split: true, zoneIds: ['z1', 'z3'] });
  assert.deepEqual(split.effects, [{ kind: 'replace', zoneId: 'z3' }, { kind: 'scroll', to: 'pane' }]);
  assert.equal(split.state.shown, 'z3');

  const unchanged = step(pagesOn('z2'), { type: 'zones' });
  assert.deepEqual(unchanged.effects, [], 'พื้นที่ยังอยู่ = ไม่มีอะไรต้องทำ');
});

test('สองบานที่ไม่เหลือพื้นที่เลย = ลงชั้นใบ (บานขวาว่าง)', () => {
  const { state } = step(splitOn('z2'), { type: 'zones' }, { split: true, zoneIds: [], defaultZoneId: null });
  assert.equal(state.shown, null);
});

test('ชั้นประวัติที่ชี้พื้นที่ที่ไม่รู้จัก = แทน URL กลับเป็นพื้นที่ที่จอโชว์อยู่', () => {
  const { state, effects } = step(pagesOn('z1'), { type: 'pop', zoneId: 'deleted-elsewhere' });
  assert.deepEqual(effects, [{ kind: 'replace', zoneId: 'z1' }]);
  assert.equal(state.shown, 'z1');
});

test('settle ล้างตัวนับย้อนที่ค้าง — แท็บใหม่ไม่มีหน้าก่อนหน้า คำสั่งย้อนของเราจึงไม่มีเหตุการณ์ตามมา', () => {
  const left = step(splitOn('z1'), { type: 'pop', zoneId: null }, { split: true });
  assert.equal(left.state.skip, 1);
  const settled = step(left.state, { type: 'settle' }, { split: true });
  assert.equal(settled.state.skip, 0);
  const forward = step(settled.state, { type: 'pop', zoneId: 'z1' }, { split: true });
  assert.equal(forward.state.shown, 'z1', 'การกดจริงครั้งถัดไปต้องไม่ถูกกินโดยตัวนับเก่า');
});

test('ยืนยันโดยไม่มีคำถามค้าง / เหตุการณ์แปลก / เรียกเปล่า = ไม่ทำอะไร และไม่ระเบิด', () => {
  const on = pagesOn('z1');
  assert.deepEqual(step(on, { type: 'confirm' }).effects, []);
  assert.deepEqual(step(on, { type: 'whatever' }).effects, []);
  assert.deepEqual(surveyZoneRouteStep().effects, []);
  assert.deepEqual(step(splitOn('z1'), { type: 'list' }, { split: true }).effects, [],
    'สองบานไม่มีปุ่ม "พื้นที่ทั้งหมด"');
});

/* ══ 🐞 review 26/09 — เริ่มบนแท็บสรุป · ชั้นเปล่าของสองบาน · ออกไม่ได้ในแท็บใหม่ · หมุนจอตอนอยู่แท็บสรุป ══════════ */

test('🐞 review 26/09 เริ่มบนแท็บสรุป: ทุกการเขียนคง ?tab=result · สองบานปูชั้นใบ + ชั้นพื้นที่ · หน้าเดียวไม่ดันชั้น (เหมือนเดิม)', () => {
  const split = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null }, { split: true, tab: 'result' });
  assert.deepEqual(split.effects, [
    { kind: 'replace', zoneId: null },
    { kind: 'push', zoneId: 'z3', tab: 'result' },
  ], 'เดิม: ตัวต่อสายไม่เริ่มบนแท็บสรุป ⇒ ย้อนออกหน้าไม่ถาม · ชั้นใบเป็น URL หน้างาน (รอบสอง: ชั้นใบ ?tab=result ⇒ ย้อนตกแท็บสรุป)');
  assert.equal(split.state.above, true);
  assert.equal(split.state.shown, 'z3');

  const pages = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null }, { tab: 'result' });
  assert.deepEqual(pages.effects, [{ kind: 'replace', zoneId: null, tab: 'result' }]);
  assert.equal(pages.state.above, false, 'หน้าเดียว: ย้อนจากแท็บสรุปออกหน้าเหมือนเดิม (มติ: หน้าเดียวไม่ถามของค้างระดับหน้า)');

  // รีเฟรชบนแท็บสรุปที่เป็นชั้นพื้นที่ของเราอยู่แล้ว = ไม่แตะประวัติ
  const kept = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null, here: 'z1' }, { split: true, tab: 'result' });
  assert.deepEqual(kept.effects, []);
  assert.equal(kept.state.shown, 'z1');
  // พื้นที่ของชั้นถูกลบไปแล้ว — ไม่ย้อน (ย้อน = URL เปลี่ยน แท็บเด้งไปหน้างาน) · สองบาน: พื้นที่ตั้งต้นคงแท็บสรุป
  const splitGone = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null, here: 'deleted' }, { split: true, tab: 'result' });
  assert.deepEqual(splitGone.effects, [{ kind: 'replace', zoneId: 'z3', tab: 'result' }]);
  const pagesGone = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null, here: 'deleted' }, { tab: 'result' });
  assert.deepEqual(pagesGone.effects, [{ kind: 'replace', zoneId: null, layer: true, tab: 'result' }]);
  assert.equal(pagesGone.state.above, true);
  assert.equal(pagesGone.state.skip, 0);
});

test('🐞 review 26/09 สองบานที่ไม่มีพื้นที่ให้โชว์ = ชั้นเปล่า (ย้อนแล้วยังถึงด่านออกจากหน้า) · เริ่มบนชั้นเปล่าของเรา = ไม่แตะประวัติ', () => {
  const none = { split: true, defaultZoneId: null, zoneIds: ['z1'] };
  const fresh = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null }, none);
  assert.deepEqual(fresh.effects, [{ kind: 'replace', zoneId: null }, { kind: 'push', zoneId: null, layer: true }]);
  assert.equal(fresh.state.above, true);
  assert.equal(fresh.state.shown, null);
  const asked = step(fresh.state, { type: 'pop', zoneId: null }, { ...none, pageDirty: true });
  assert.deepEqual(asked.effects, [
    { kind: 'push', zoneId: null, layer: true },
    { kind: 'ask', from: null, to: null, via: 'leave' },
  ]);

  const refresh = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null, here: null, blank: true }, none);
  assert.deepEqual(refresh.effects, [], 'เดิม: [ใบ, ใบ, ชั้น] ทุกครั้งที่รีเฟรช');
  assert.equal(refresh.state.above, true);
  // พื้นที่มาทีหลัง = แทนที่ชั้นเปล่า
  const arrived = step(refresh.state, { type: 'zones' }, { split: true });
  assert.deepEqual(arrived.effects, [{ kind: 'replace', zoneId: 'z3' }]);
  // หน้าเดียวบนแท็บหน้างาน (หมุนจากสองบานแล้วรีเฟรช) = ย้อนลงชั้นใบเหมือนชั้นที่พื้นที่หายไป
  const pages = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null, here: null, blank: true });
  assert.deepEqual(pages.effects, [{ kind: 'back', steps: 1 }]);
});

test('🐞 review 26/09 สองบาน: พื้นที่ที่เปิดอยู่หายไปแล้วไม่เหลือพื้นที่ตั้งต้น = ชั้นเปล่าแทนที่ (ไม่ย้อนลงชั้นใบ)', () => {
  const { state, effects } = step(splitOn('z2'), { type: 'zones' }, { split: true, zoneIds: [], defaultZoneId: null });
  assert.deepEqual(effects, [{ kind: 'replace', zoneId: null, layer: true }, { kind: 'focus', target: 'list' }]);
  assert.equal(state.above, true, 'เดิม: ย้อนลงชั้นใบ ⇒ ย้อนครั้งถัดไปออกหน้าไม่ถาม');
  assert.equal(state.skip, 0);
});

test('🐞 review 26/09 หมุนจอตอนอยู่แท็บสรุป: เขียนคง ?tab=result · โหมดใหม่คุมปุ่มย้อน', () => {
  const list = run([{ type: 'init', zoneId: null }]);
  const toSplit = step(list, { type: 'mode' }, { split: true, tab: 'result' });
  assert.deepEqual(toSplit.effects, [{ kind: 'replace', zoneId: null }, { kind: 'push', zoneId: 'z3', tab: 'result' }],
    'เดิม: ?zone=z3 ทับแท็บสรุป · รอบสอง: คืนชั้นใบ (ที่สลับแท็บเขียนเป็น ?tab=result) เป็น URL หน้างานก่อนดัน');
  const blank = step(list, { type: 'mode' }, { split: true, tab: 'result', defaultZoneId: null });
  assert.deepEqual(blank.effects, [{ kind: 'replace', zoneId: null }, { kind: 'push', zoneId: null, layer: true, tab: 'result' }],
    'ไม่มีพื้นที่ตั้งต้น = ชั้นเปล่า');
  // แท็บหน้างาน: ชั้นใบเป็น URL หน้างานอยู่แล้ว = ดันอย่างเดียว
  assert.deepEqual(step(list, { type: 'mode' }, { split: true, tab: 'field' }).effects, [{ kind: 'push', zoneId: 'z3' }]);
  // 🐞 รอบสอง: สองบาน → หน้าเดียวบนแท็บหน้างานที่มีชั้นเปล่าค้าง = ย้อนทิ้งชั้นเปล่าเอง (ไม่งั้นย้อนครั้งแรกไม่ทำอะไร)
  const emptySplit = step(SURVEY_ZONE_ROUTE_START, { type: 'init', zoneId: null }, { split: true, defaultZoneId: null, zoneIds: ['z1'] });
  const dropped = step(emptySplit.state, { type: 'mode' }, { split: false, tab: 'field' });
  assert.deepEqual(dropped.effects, [{ kind: 'back', steps: 1 }]);
  assert.equal(dropped.state.above, false);
  assert.equal(dropped.state.skip, 1, 'เหตุการณ์ย้อนที่ตามมาเป็นของเราเอง');
  assert.deepEqual(step(emptySplit.state, { type: 'mode' }, { split: false, tab: 'result' }).effects, [], 'แท็บสรุปคงชั้นไว้');

  // สองบาน → หน้าเดียว บนแท็บสรุป แล้วย้อน = กลับรายการ (ไม่ใช่ย้อนออกทั้งหน้า)
  const pages = step(splitOn('z1'), { type: 'mode' }, { split: false, tab: 'result' });
  assert.deepEqual(pages.effects, []);
  const popped = step(pages.state, { type: 'pop', zoneId: null }, { split: false, tab: 'result', pageDirty: true });
  assert.deepEqual(popped.effects, [{ kind: 'scroll', to: 'restore' }, { kind: 'focus', target: 'row', zoneId: 'z1' }]);
  assert.equal(popped.state.shown, null);
});

test('🐞 review 26/09 ตอบ "ทิ้งแล้วออก": ไม่ทิ้งร่าง · ออกไม่ได้ (settle) = ชั้นใบคือรายการแรก ⇒ ย้อนครั้งหน้าไม่ถาม · ย้อนตกหน้านี้ = ย้อนต่อ', () => {
  const asked = step(splitOn('z2'), { type: 'pop', zoneId: null }, { split: true, dirty: true });
  const confirmed = step(asked.state, { type: 'confirm' }, { split: true, dirty: true });
  assert.deepEqual(confirmed.effects, [{ kind: 'back', steps: 2 }], 'เดิม: resetDraft ก่อน ⇒ แท็บใหม่ค่าหายแต่ไม่ได้ไปไหน');
  assert.equal(confirmed.state.leaving, true);

  // ไม่มีเหตุการณ์ย้อนตามมา = ไม่มีหน้าก่อนชั้นใบ
  const stuck = step(confirmed.state, { type: 'settle' }, { split: true, dirty: true });
  assert.equal(stuck.state.leaving, false);
  assert.equal(stuck.state.root, true);
  const again = step(stuck.state, { type: 'pop', zoneId: null }, { split: true, dirty: true, pageDirty: true });
  assert.deepEqual(again.effects, [], 'เดิม: ถาม "ทิ้งแล้วออก" ซ้ำทุกครั้งแล้วไม่ไปไหน');
  assert.equal(again.state.above, false);
  // ไปหน้ากลับถึงชั้นพื้นที่ = เหมือนเดิม
  assert.equal(step(again.state, { type: 'pop', zoneId: 'z2' }, { split: true }).state.above, true);

  // การย้อนของเราตกรายการของหน้านี้เอง (กองเก่า) = ผู้ใช้ตอบออกแล้ว ⇒ ย้อนต่อ ไม่ถามซ้ำ
  const landed = step(confirmed.state, { type: 'pop', zoneId: null }, { split: true, dirty: true, pageDirty: true });
  assert.deepEqual(landed.effects, [{ kind: 'back', steps: 1 }]);
  assert.equal(landed.state.leaving, true, 'ยังออกอยู่ — ย้อนต่อไม่ได้อีก (settle) = รายการแรกของแท็บ');
});
