// ── การเคาะแบบกดบันทึกเอง — ตัวตัดสินล้วน (PR5) ──────────────────────────
//
// ⭐ ครอบสิ่งที่พังได้จริงตอนเลิกบันทึกทุกคลิก: ร่างที่กลับมาเท่าเดิม · เคาะต่างจากที่ระบบเสนอ
//   โดยไม่ใส่เหตุผล · จุดที่หายไประหว่างเปิดจอค้าง · พื้นที่ที่ถูกตัด · payload ที่
//   ส่งเกินจนทับของคนอื่น
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  surveyDecisionBase, surveyDecisionDirty, surveyDecisionDraft, surveyDecisionError,
  surveyDecisionPayload, surveyPackageCell, surveyPendingDecisions, surveySuggestedFor,
} from './surveyDecision.js';

const part = (w, l, h) => ({ widthM: w, lengthM: l, heightM: h, label: null });
/* ทะเบียนขนาดชุดตั้งต้นของ 0398 — จอได้มาจาก GET ใบประเมิน (`packageSizes`) */
const SIZES = [
  { code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false },
  { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true },
  { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true },
  { code: 'XL', nameEn: 'Extra Large', maxCbm: null, autoSuggest: true },
];
const ctx = { sizes: SIZES };
/** 4×5×3 = 60 ลบ.ม. ⇒ ระบบเสนอ SM · 1 แพ็ค */
const zone = (extra = {}) => ({
  id: 'z1', zoneName: 'Studio 01', status: 'measured',
  parts: [part(4, 5, 3)],
  spots: [{ id: 's1', label: 'มุมซ้าย', selected: false }, { id: 's2', label: 'มุมขวา', selected: true }],
  packageQty: null, packageSize: null, packageSizeSuggested: null, packageSizeManual: false, packageNote: null,
  ...extra,
});
/** พื้นที่ที่เคาะตามที่ระบบเสนอไว้แล้ว */
const decided = (extra = {}) => zone({ packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', ...extra });

test('ที่ระบบเสนอของพื้นที่ตั้งต้นคือ SM · 1 แพ็ค — ทุกเคสข้างล่างอิงตัวนี้', () => {
  assert.deepEqual(surveySuggestedFor(zone(), SIZES), { code: 'SM', qty: 1 });
  // ยังไม่วัด / ไม่มีทะเบียน = ยังไม่เสนอ (ไม่ใช่เดา)
  assert.equal(surveySuggestedFor(zone({ parts: [] }), SIZES), null);
  assert.equal(surveySuggestedFor(zone(), null), null);
});

test('ค่าตั้งต้นของร่างคือสิ่งที่อยู่ในฐาน — จุดที่เลือกมาเรียงแล้ว', () => {
  assert.deepEqual(surveyDecisionBase(zone()), { packageQty: null, packageSize: null, packageNote: '', spotIds: ['s2'] });
  assert.deepEqual(surveyDecisionBase(decided({ packageQty: 2, packageNote: ' ห้องสูง ' })),
    { packageQty: 2, packageSize: 'SM', packageNote: 'ห้องสูง', spotIds: ['s2'] });
});

test('ยังไม่เคาะ = packageQty เป็น null ไม่ใช่ 0 และไม่ใช่ที่ระบบเสนอ · ไม่มีจำนวน = ไม่มีขนาด', () => {
  assert.equal(surveyDecisionBase(zone({ packageQty: 0 })).packageQty, null);
  assert.equal(surveyDecisionDraft(zone(), { packageQty: '' }).packageQty, null);
  /* 🔑 ยังไม่เลือกให้เอง (PR-P §1) — ร่างที่ระบบเติมให้ = dirty ⇒ ยามออกจากหน้าเด้งทั้งที่ยังไม่ได้แตะอะไร */
  assert.equal(surveyDecisionDraft(zone(), null).packageSize, null);
  assert.equal(surveyDecisionDirty(zone(), null), false);
});

test('⭐ แตะขนาดตอนจำนวนยังว่าง = จำนวน 1 · ล้างจำนวน = ขนาดหายไปด้วย', () => {
  assert.deepEqual(surveyDecisionDraft(zone(), { packageSize: 'st' }),
    { packageQty: 1, packageSize: 'ST', packageNote: '', spotIds: ['s2'] });
  // เคาะจำนวนไว้แล้ว = แตะขนาดไม่ทับจำนวน
  assert.equal(surveyDecisionDraft(decided({ packageQty: 3 }), { packageSize: 'ST' }).packageQty, 3);
  // ล้างจำนวนเอง = ยังไม่เคาะ ⇒ ไม่มีขนาด (server ล้างภาพนิ่งทั้งสามช่องเหมือนกัน)
  assert.deepEqual(surveyDecisionDraft(decided(), { packageQty: '' }),
    { packageQty: null, packageSize: null, packageNote: '', spotIds: ['s2'] });
  assert.equal(surveyDecisionDirty(zone(), { packageSize: 'SM', packageQty: '' }), false, 'แตะขนาดแล้วล้างจำนวน = เท่าเดิม');
});

test('ร่างที่ไม่ได้แตะ = ไม่ dirty', () => {
  assert.equal(surveyDecisionDirty(zone(), null), false);
  assert.equal(surveyDecisionDirty(decided(), { packageQty: 1 }), false);
  assert.equal(surveyDecisionDirty(decided(), { packageSize: 'SM' }), false);
  assert.equal(surveyDecisionDirty(decided(), { packageSize: 'ST' }), true, 'เปลี่ยนขนาดอย่างเดียวก็ dirty');
});

test('⭐ ติ๊กออกแล้วติ๊กกลับ = ไม่ dirty — ลำดับที่คนติ๊กไม่ใช่ข้อมูล', () => {
  const z = zone({ spots: [{ id: 's1', selected: true }, { id: 's2', selected: true }] });
  assert.equal(surveyDecisionDirty(z, { spotIds: ['s2', 's1'] }), false);
  assert.equal(surveyDecisionDirty(z, { spotIds: ['s1'] }), true);
});

test('พิมพ์เหตุผลแล้วลบกลับเป็นค่าว่าง = ไม่ dirty (ช่องว่างล้วนไม่นับ)', () => {
  assert.equal(surveyDecisionDirty(zone(), { packageNote: '   ' }), false);
  assert.equal(surveyDecisionDirty(zone(), { packageNote: 'สูงกว่าปกติ' }), true);
});

test('พื้นที่ที่ถูกตัดออกไม่มีวัน dirty — แก้อะไรไม่ได้อยู่แล้ว', () => {
  assert.equal(surveyDecisionDirty(zone({ status: 'cut' }), { packageQty: 9 }), false);
});

// ── ด่านก่อนบันทึก — ต้องตรงกับ route PUT เป๊ะ (ตัวตัดสินตัวเดียวกัน: surveyPackageDecision) ──────────
const NOTE = 'แพ็คเกจต่างจากที่ระบบเสนอ — ต้องบอกเหตุผลด้วย';

test('🔴 เคาะต่างจากที่ระบบเสนอโดยไม่บอกเหตุผล = บันทึกไม่ได้ (ทั้งจำนวนและขนาด)', () => {
  assert.equal(surveyDecisionError(zone(), { packageSize: 'SM', packageQty: 3 }, ctx), NOTE);
  assert.equal(surveyDecisionError(zone(), { packageSize: 'ST' }, ctx), NOTE);
  assert.equal(surveyDecisionError(zone(), { packageSize: 'ST', packageNote: 'เพดานสูง 6 ม.' }, ctx), null);
});

test('เคาะตรงกับที่ระบบเสนอไม่ต้องมีเหตุผล · XS ที่หัวหน้าเลือกเองก็ไม่ต้อง', () => {
  assert.equal(surveyDecisionError(zone(), { packageSize: 'SM' }, ctx), null);
  assert.equal(surveyDecisionError(zone(), { packageSize: 'XS' }, ctx), null);
});

test('🔴 เคาะจำนวนโดยยังไม่เลือกขนาด = บันทึกไม่ได้', () => {
  assert.equal(surveyDecisionError(zone(), { packageQty: 1 }, ctx), 'เลือกขนาดแพ็คเกจด้วย');
});

test('🔴 ขนาดที่เคาะไว้ถูกลบจากทะเบียน — แก้จำนวนต้องเลือกขนาดใหม่ก่อน', () => {
  const gone = SIZES.filter((s) => s.code !== 'SM');
  assert.equal(surveyDecisionError(decided(), { packageQty: 2, packageNote: 'x' }, { sizes: gone }),
    'ขนาดแพ็คเกจ SM ถูกลบจากทะเบียนแล้ว — เลือกใหม่');
  assert.equal(surveyDecisionError(decided(), { packageSize: 'XL', packageNote: 'x' }, { sizes: gone }), null);
});

test('⚠️ จอไม่ได้ส่งทะเบียนมา/อ่านไม่สำเร็จ = เคาะขนาดไม่ได้ (fail-closed) ไม่ใช่ปล่อยไปตายที่ server', () => {
  assert.equal(surveyDecisionError(zone(), { packageSize: 'SM' }), 'อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ — ลองใหม่');
  assert.equal(surveyDecisionError(zone(), { packageSize: 'SM' }, { sizes: null }), 'อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ — ลองใหม่');
  // แก้จุดติดตั้งอย่างเดียวไม่ต้องใช้ทะเบียน
  assert.equal(surveyDecisionError(decided(), { spotIds: ['s1'] }), null);
});

test('🔑 ด่านอ่านจากค่าหลังรวมร่างกับแถว — ลบเหตุผลทิ้งบนแถวที่เคาะต่างไว้แล้ว = ติด', () => {
  const z = decided({ packageQty: 3, packageNote: 'เพดานสูง' });
  assert.equal(surveyDecisionError(z, { packageNote: '' }, ctx), NOTE);
});

test('ตัวเลขนอกช่วงที่ server รับ ถูกจับที่จอก่อน', () => {
  assert.match(surveyDecisionError(zone(), { packageSize: 'SM', packageQty: 120, packageNote: 'x' }, ctx), /พิมพ์ผิดหลัก/);
  assert.match(surveyDecisionError(zone(), { packageSize: 'SM', packageNote: 'x'.repeat(501) }, ctx), /ยาวเกิน 500/);
});

test('🔴 จุดที่เลือกหายไปจากรายการของช่างระหว่างเปิดจอค้าง = บันทึกไม่ได้ ไม่ใช่ 400 ที่ server', () => {
  assert.match(surveyDecisionError(zone(), { spotIds: ['s9'] }, ctx), /ไม่อยู่ในรายการที่ช่างแจ้งมา/);
});

// ── payload ────────────────────────────────────────────────────────────
test('ไม่มีอะไรเปลี่ยน = ไม่มี payload', () => {
  assert.equal(surveyDecisionPayload(zone(), null), null);
});

test('⭐ ส่งเฉพาะช่องที่เปลี่ยน — แก้จุดอย่างเดียวไม่ส่งช่องแพ็คเกจไปทับ', () => {
  assert.deepEqual(surveyDecisionPayload(decided(), { spotIds: ['s1', 's2'] }),
    { selectedSpotIds: ['s1', 's2'] });
});

test('⭐ ขนาด · จำนวน · เหตุผล ไปด้วยกันเสมอ (ด่านของ server อ่านสามช่องคู่กัน)', () => {
  assert.deepEqual(surveyDecisionPayload(zone(), { packageSize: 'ST', packageQty: 3, packageNote: 'เพดานสูง' }),
    { packageQty: 3, packageSize: 'ST', packageNote: 'เพดานสูง' });
  assert.deepEqual(surveyDecisionPayload(zone({ packageNote: 'เดิม' }), { packageSize: 'SM' }),
    { packageQty: 1, packageSize: 'SM', packageNote: 'เดิม' });
  // แก้เหตุผลอย่างเดียว ขนาด/จำนวนเดิมไปด้วย — server ไม่ประทับใหม่เพราะค่าไม่เปลี่ยน
  assert.deepEqual(surveyDecisionPayload(decided(), { packageNote: 'หมายเหตุ' }),
    { packageQty: 1, packageSize: 'SM', packageNote: 'หมายเหตุ' });
});

test('ล้างจำนวนแพ็คเกจส่ง null ไปให้ server ทั้งจำนวนและขนาด ไม่ใช่ข้ามช่องนั้น', () => {
  assert.deepEqual(surveyDecisionPayload(decided({ packageQty: 2, packageNote: 'x' }), { packageQty: null }),
    { packageQty: null, packageSize: null, packageNote: 'x' });
});

// ── สรุปทั้งใบ ──────────────────────────────────────────────────────────
test('สรุปการเคาะที่ค้าง — นับเฉพาะแถวที่ต่างจากฐาน', () => {
  const zones = [zone({ id: 'a' }), zone({ id: 'b' }), zone({ id: 'c', status: 'cut' })];
  const out = surveyPendingDecisions(zones, { a: { packageSize: 'SM' }, c: { packageQty: 9 } }, ctx);
  assert.deepEqual(out.ids, ['a']);
  assert.equal(out.count, 1);
  assert.equal(out.canSave, true);
});

test('🔴 มีแถวไหนติดด่าน = กดบันทึกไม่ได้ทั้งชุด — บันทึกครึ่งใบอธิบายยากกว่าเดิม', () => {
  const zones = [zone({ id: 'a' }), zone({ id: 'b' })];
  const out = surveyPendingDecisions(zones, { a: { packageSize: 'SM' }, b: { packageSize: 'SM', packageQty: 5 } }, ctx);
  assert.deepEqual(out.ids, ['a', 'b']);
  assert.equal(out.canSave, false);
  assert.equal(out.blocked.length, 1);
  assert.equal(out.blocked[0].id, 'b');
  assert.match(out.blocked[0].error, /ต้องบอกเหตุผล/);
});

test('ไม่มีของค้าง = กดบันทึกไม่ได้ (ปุ่มไม่มีอะไรให้ทำ)', () => {
  assert.equal(surveyPendingDecisions([zone()], {}, ctx).canSave, false);
});

/* ══ ช่อง "แพ็คเกจ" ของแท็บสรุปส่งผล — ทุกอย่างที่จอวาดมาจาก `surveyPackageCell` (mig 0398) ═══════════════ */
const decide = { sizes: SIZES, canDecide: true };

test('⭐ แถบขนาด = ทุกขนาดในทะเบียนตามลำดับทะเบียน (เลือกเอง → ช่วงน้อยไปมาก → ไม่มีเพดาน) · ป้ายเป็นรหัส', () => {
  const cell = surveyPackageCell(zone(), null, decide);
  assert.deepEqual(cell.options.map((o) => o.value), ['XS', 'SM', 'ST', 'XL']);
  assert.deepEqual(cell.options.map((o) => o.label), ['XS', 'SM', 'ST', 'XL']);
  assert.ok(cell.options.every((o) => !o.disabled && !o.tone));
  // ช่วงของขนาดอยู่ใน title / ชื่อที่ screen reader อ่าน — ป้ายบนแผ่นสั้นพอให้สี่ขนาดอยู่แถวเดียว
  assert.equal(cell.options[1].title, 'Small · ≤ 300 ลบ.ม.');
  assert.equal(cell.options[0].ariaLabel, 'ขนาด XS Extra Small เลือกเอง');
  assert.equal(cell.options[3].ariaLabel, 'ขนาด XL Extra Large เกิน 2,400 ลบ.ม.');
  // เพิ่มขนาดในทะเบียน = โผล่ในแถบตรงตำแหน่งของช่วง โดยจอไม่ต้องแก้
  const more = surveyPackageCell(zone(), null, { ...decide, sizes: [...SIZES, { code: 'MD', nameEn: 'Medium', maxCbm: 1000, autoSuggest: true }] });
  assert.deepEqual(more.options.map((o) => o.value), ['XS', 'SM', 'MD', 'ST', 'XL']);
});

test('⭐ ยังไม่เคาะ = ไม่เลือกให้ แต่มีปุ่มรับข้อเสนอทีเดียวจบ (ขนาด + จำนวน 1)', () => {
  const cell = surveyPackageCell(zone(), null, decide);
  assert.equal(cell.size, null);
  assert.equal(cell.qty, null);
  assert.equal(cell.valueText, null);
  assert.equal(cell.hint, 'ระบบเสนอ SM (≤ 300 ลบ.ม.) · 1 แพ็ค');
  assert.equal(cell.qtyHint, 'เสนอ 1 แพ็ค');
  assert.deepEqual(cell.accept, { label: 'ใช้ที่ระบบเสนอ: SM · 1 แพ็ค', patch: { packageSize: 'SM', packageQty: 1 } });
  assert.equal(cell.needNote, false);
  // กดรับ = ร่างที่บันทึกได้เลย ไม่ต้องมีเหตุผล
  const after = surveyPackageCell(zone(), cell.accept.patch, decide);
  assert.equal(after.valueText, 'SM · 1 แพ็ค');
  assert.equal(after.accept, null, 'เคาะแล้วไม่มีปุ่มรับข้อเสนอ');
  assert.equal(after.overrideText, null);
  assert.equal(after.needNote, false);
  assert.equal(surveyDecisionError(zone(), cell.accept.patch, ctx), null);
});

test('เคาะต่างจากที่ระบบเสนอ — บอกว่าหัวหน้าเลือกอะไรแทน และช่องเหตุผลโผล่ตรงกับด่านบันทึก', () => {
  const st = surveyPackageCell(zone(), { packageSize: 'ST' }, decide);
  assert.equal(st.size, 'ST');
  assert.equal(st.qty, 1, 'แตะขนาดตอนจำนวนว่าง = 1');
  assert.equal(st.overrideText, 'หัวหน้าเลือก ST แทน');
  assert.equal(st.needNote, true);
  assert.match(surveyDecisionError(zone(), { packageSize: 'ST' }, ctx), /ต้องบอกเหตุผล/);
  // จำนวนไม่ใช่ 1 ก็ต้องมีเหตุผล แม้ขนาดตรง
  const two = surveyPackageCell(zone(), { packageSize: 'SM', packageQty: 2 }, decide);
  assert.equal(two.overrideText, null);
  assert.equal(two.needNote, true);
  // พิมพ์เหตุผลแล้ว `needNote` ยังเป็นจริง (ช่องต้องอยู่ต่อ) แต่ด่านผ่าน
  const noted = { packageSize: 'ST', packageNote: 'เพดานสูง' };
  assert.equal(surveyPackageCell(zone(), noted, decide).needNote, true);
  assert.equal(surveyDecisionError(zone(), noted, ctx), null);
});

test('⭐ XS (หัวหน้าเลือกเอง) ไม่ถามเหตุผล — ระบบดูห้องน้ำไม่ออกจากปริมาตร', () => {
  const cell = surveyPackageCell(zone(), { packageSize: 'XS' }, decide);
  assert.equal(cell.valueText, 'XS · 1 แพ็ค');
  assert.equal(cell.overrideText, 'หัวหน้าเลือก XS แทน');
  assert.equal(cell.needNote, false);
  assert.equal(surveyDecisionError(zone(), { packageSize: 'XS' }, ctx), null);
});

test('แถวที่ back-fill เป็น ST (ไม่มีภาพนิ่งที่ระบบเสนอ) ที่ยังไม่ถูกแตะ ไม่โดนย้อนบังคับเหตุผล', () => {
  const old = zone({ packageQty: 2, packageSize: 'ST' });
  const cell = surveyPackageCell(old, null, decide);
  assert.equal(cell.valueText, 'ST · 2 แพ็ค');
  assert.equal(cell.needNote, false);
  // แตะจำนวน = server ประทับข้อเสนอสด (SM) ⇒ ต้องมีเหตุผลตั้งแต่บนจอ
  assert.equal(surveyPackageCell(old, { packageQty: 3 }, decide).needNote, true);
});

/* 🐞 review PR-P — 60 ลบ.ม. เคาะ 1 แพ็คด้วยสูตรเดิม แล้ว 0398 ตั้งเป็น ST: จอเคยเขียน "หัวหน้าเลือก ST แทน" ทั้งที่ไม่มีใครเลือก
   และไม่มีอะไรทักก่อนส่งผล ⇒ ใบที่ค้างตอน deploy ไปถึงฝ่ายขายเป็น ST เงียบ ๆ */
test('🔴 ขนาดที่ไม่เคยถูกเทียบกับข้อเสนอ (back-fill ST) ≠ "หัวหน้าเลือกแทน" — บรรทัดทักกลาง ๆ + ปุ่มใช้ที่ระบบเสนอ · ไม่บล็อก', () => {
  const old = zone({ packageQty: 1, packageSize: 'ST' });
  const cell = surveyPackageCell(old, null, decide);
  assert.equal(cell.hint, 'ระบบเสนอ SM (≤ 300 ลบ.ม.) · 1 แพ็ค');
  assert.equal(cell.overrideText, null, 'ไม่มีใครเลือก ST "แทน" อะไร');
  assert.equal(cell.reviewText, 'ST ตั้งไว้ก่อนมีข้อเสนอของระบบ — ตรวจขนาดก่อนส่งผล');
  assert.deepEqual(cell.accept, { label: 'ใช้ที่ระบบเสนอ: SM · 1 แพ็ค', patch: { packageSize: 'SM', packageQty: 1 } });
  assert.equal(cell.needNote, false, 'ทักอย่างเดียว — บังคับหรือไม่เป็นเรื่องของเจ้าของ');
  assert.equal(surveyDecisionDirty(old, null), false, 'แค่เปิดจอต้องไม่กลายเป็น "ยังไม่บันทึก"');

  // กดรับ = ร่างที่บันทึกได้เลย (server ประทับ SM) · บรรทัดทักและปุ่มหายไป
  const taken = surveyPackageCell(old, cell.accept.patch, decide);
  assert.equal(taken.valueText, 'SM · 1 แพ็ค');
  assert.equal(taken.reviewText, null);
  assert.equal(taken.accept, null);
  assert.equal(taken.needNote, false);
  assert.equal(surveyDecisionError(old, cell.accept.patch, ctx), null);

  // แถวเก่าขนาดใหญ่ (ST × 2 ตามสูตรเดิม · 3,600 ลบ.ม.) — ข้อเสนอใหม่คือ XL · 1
  const big = surveyPackageCell(zone({ parts: [part(30, 30, 4)], packageQty: 2, packageSize: 'ST' }), null, decide);
  assert.equal(big.reviewText, 'ST ตั้งไว้ก่อนมีข้อเสนอของระบบ — ตรวจขนาดก่อนส่งผล');
  assert.equal(big.accept.label, 'ใช้ที่ระบบเสนอ: XL · 1 แพ็ค');

  // หัวหน้าเปลี่ยนขนาดเองในร่าง = เขาเลือกแล้วจริง ⇒ กลับเข้ากติกาปกติ ("เลือก … แทน" + เหตุผล)
  const picked = surveyPackageCell(old, { packageSize: 'XL' }, decide);
  assert.equal(picked.reviewText, null);
  assert.equal(picked.overrideText, 'หัวหน้าเลือก XL แทน');
  assert.equal(picked.accept, null);
  assert.equal(picked.needNote, true);
});

test('บรรทัดทักขึ้นเฉพาะที่ควรขึ้น — ขนาดตรงข้อเสนอ · จำนวนอย่างเดียวที่ต่าง · มีภาพนิ่ง · ดูอย่างเดียว · ถูกลบ = ไม่ทัก', () => {
  const quiet = (row, opts = decide) => {
    const cell = surveyPackageCell(row, null, opts);
    return [cell.reviewText, cell.accept];
  };
  // back-fill ST บนพื้นที่ที่ระบบก็เสนอ ST (20×20×3 = 1,200 ลบ.ม.) — ไม่มีอะไรให้ทัก
  const mid = [part(20, 20, 3)];
  assert.deepEqual(quiet(zone({ parts: mid, packageQty: 1, packageSize: 'ST' })), [null, null]);
  // จำนวน 2 บนแถวเก่าคือเลขที่หัวหน้าเคาะเองจริง (กติกาเดิมบังคับเหตุผลไว้แล้ว) — ไม่ชวนกดทับเป็น 1
  assert.deepEqual(quiet(zone({ parts: mid, packageQty: 2, packageSize: 'ST', packageNote: 'เพดานสูง' })), [null, null]);
  // มีภาพนิ่ง = หัวหน้าเคาะหลังมีขนาด ⇒ "หัวหน้าเลือก ST แทน" ตามเดิม
  const chosen = surveyPackageCell(zone({ packageQty: 1, packageSize: 'ST', packageSizeSuggested: 'SM', packageNote: 'เพดานสูง' }), null, decide);
  assert.equal(chosen.reviewText, null);
  assert.equal(chosen.overrideText, 'หัวหน้าเลือก ST แทน');
  assert.equal(chosen.accept, null);
  // ดูอย่างเดียว (ใบล็อก · ฝ่ายขาย) / ทะเบียนอ่านไม่ขึ้น / ระบบเสนอไม่ได้ = ไม่ทัก ไม่มีปุ่ม
  const old = zone({ packageQty: 1, packageSize: 'ST' });
  assert.deepEqual(quiet(old, { sizes: SIZES, canDecide: false }), [null, null]);
  assert.deepEqual(quiet(old, { sizes: null, canDecide: true }), [null, null]);
  assert.deepEqual(quiet(zone({ parts: [], packageQty: 1, packageSize: 'ST' })), [null, null]);
  // ขนาดถูกลบจากทะเบียน = เรื่องของแผ่นแดง "เลือกขนาดใหม่" (ด่านส่งผลบล็อกอยู่แล้ว) — ไม่ซ้อนสองข้อความ
  const gone = surveyPackageCell(old, null, { sizes: SIZES.filter((s) => s.code !== 'ST'), canDecide: true });
  assert.equal(gone.reviewText, null);
  assert.equal(gone.overrideText, null);
  assert.equal(gone.goneText, 'ขนาด ST ถูกลบจากทะเบียนแล้ว — เลือกขนาดใหม่');
});

test('🔴 ขนาดที่เคาะไว้ถูกลบจากทะเบียน — ยังเห็นเป็นแผ่นแดงกดไม่ได้ท้ายแถบ พร้อมเหตุ', () => {
  const sizes = SIZES.filter((s) => s.code !== 'ST');
  const row = zone({ packageQty: 1, packageSize: 'ST', packageSizeSuggested: 'SM', packageNote: 'เพดานสูง' });
  const cell = surveyPackageCell(row, null, { sizes, canDecide: true });
  assert.equal(cell.gone, 'ST');
  assert.equal(cell.goneText, 'ขนาด ST ถูกลบจากทะเบียนแล้ว — เลือกขนาดใหม่');
  assert.deepEqual(cell.options.map((o) => o.value), ['XS', 'SM', 'XL', 'ST']);
  assert.deepEqual(cell.options.at(-1), {
    value: 'ST', label: 'ST (ถูกลบ)', disabled: true, gone: true, tone: 'danger',
    title: 'ขนาด ST ถูกลบจากทะเบียนแล้ว', ariaLabel: 'ขนาด ST ถูกลบจากทะเบียนแล้ว',
  });
  assert.equal(cell.size, 'ST', 'แถวยังถือรหัสเดิม — ต้องเห็นว่าถืออะไรอยู่');
  // เลือกขนาดใหม่ = แผ่นแดงหายไป
  const fixed = surveyPackageCell(row, { packageSize: 'XL' }, { sizes, canDecide: true });
  assert.equal(fixed.gone, null);
  assert.deepEqual(fixed.options.map((o) => o.value), ['XS', 'SM', 'XL']);
  // แก้แค่จำนวนโดยยังถือขนาดที่ถูกลบ = บันทึกไม่ได้ (ตัวเดียวกับที่ server ตอบ)
  assert.equal(surveyDecisionError(row, { packageQty: 2 }, { sizes }), 'ขนาดแพ็คเกจ ST ถูกลบจากทะเบียนแล้ว — เลือกใหม่');
});

test('🔴 อ่านทะเบียนไม่สำเร็จ = เคาะขนาดไม่ได้ (fail-closed) — จอได้เหตุ ไม่ใช่แถบว่าง', () => {
  const cell = surveyPackageCell(decided(), null, { sizes: null, canDecide: true });
  // ข้อความบนจอไม่มี "ลองใหม่" — ทางออกคือปุ่ม "โหลดใหม่" ที่จอวางไว้ (UAT PR-P 01/10) · ตัวที่ server ตอบตอนบันทึกยังเป็นคำเดิม
  assert.equal(cell.registryDown, 'อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ');
  assert.equal(cell.canStep, false);
  assert.deepEqual(cell.options, []);
  assert.equal(cell.accept, null);
  assert.equal(cell.valueText, 'SM · 1 แพ็ค', 'ค่าที่เคาะไว้ยังอ่านได้');
  assert.equal(surveyPackageCell(decided(), null, decide).registryDown, null);
});

test('ระบบเสนอไม่ได้ — บอกเหตุ (ยังไม่วัด · ทะเบียนว่าง · ไม่มีขนาดรองรับ) และไม่มีปุ่มรับข้อเสนอ', () => {
  const unmeasured = surveyPackageCell(zone({ parts: [] }), null, decide);
  assert.equal(unmeasured.hint, 'ยังไม่มีปริมาตร — ระบบยังเสนอขนาดไม่ได้');
  assert.equal(unmeasured.accept, null);
  assert.equal(unmeasured.qtyHint, null);
  /* 🐞 UAT PR-P 01/10 — ทะเบียนว่าง: ประโยคเดียวกันเคยขึ้นสองครั้งในช่อง (ช่องขนาด + บรรทัดข้อเสนอ) และ −/+ ยังกดได้
     ⇒ บอกครั้งเดียว (`emptyText` · จอต่อลิงก์ไปทะเบียนเอง) · ไม่มีบรรทัดข้อเสนอ · ตัวเพิ่ม/ลดจำนวนปิด */
  const empty = surveyPackageCell(zone(), null, { sizes: [], canDecide: true });
  assert.deepEqual([empty.emptyRegistry, empty.emptyText, empty.hint, empty.canStep, empty.accept],
    [true, 'ยังไม่มีขนาดในทะเบียน', null, false, null]);
  assert.deepEqual([unmeasured.emptyRegistry, unmeasured.emptyText, unmeasured.canStep], [false, null, true]);
  // 60 ลบ.ม. แต่ทะเบียนมีแค่ขนาดที่หัวหน้าเลือกเอง + ช่วง ≤ 50
  const narrow = [{ code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false }, { code: 'MN', nameEn: 'Mini', maxCbm: 50, autoSuggest: true }];
  const none = surveyPackageCell(zone(), null, { sizes: narrow, canDecide: true });
  assert.equal(none.hint, 'ไม่มีขนาดในทะเบียนที่ระบบเสนอให้ 60 ลบ.ม. — เลือกเอง');
  assert.equal(none.accept, null);
});

test('⭐ ดูอย่างเดียว (ใบล็อก/ช่าง) เล่าที่ระบบเสนอจากภาพนิ่งบนแถว ไม่ใช่จากทะเบียนวันนี้', () => {
  // ตอนเคาะระบบเสนอ SM · วันนี้ทะเบียนถูกแก้จน 60 ลบ.ม. ตกช่วงอื่น — ใบที่ส่งแล้วต้องเล่าเรื่องเดิม
  const edited = [{ code: 'TN', nameEn: 'Tiny', maxCbm: 100, autoSuggest: true }, ...SIZES];
  const row = zone({ packageQty: 1, packageSize: 'ST', packageSizeSuggested: 'SM', packageNote: 'เพดานสูง' });
  const view = surveyPackageCell(row, null, { sizes: edited, canDecide: false });
  assert.deepEqual(view.suggested, { code: 'SM', qty: 1 });
  assert.equal(view.hint, 'ระบบเสนอ SM · 1 แพ็ค', 'ไม่มีช่วงในวงเล็บ — ไม่รู้ว่าช่วงตอนนั้นคือเท่าไร');
  assert.equal(view.overrideText, 'หัวหน้าเลือก ST แทน');
  assert.equal(view.valueText, 'ST · 1 แพ็ค');
  assert.equal(view.accept, null);
  // คนเคาะที่ยังไม่แตะแถว ก็อ่านภาพนิ่งเดียวกัน (ตัวที่ด่านเหตุผลอ่าน) + บรรทัดกลาง ๆ ว่าทะเบียนตอนนี้เสนออะไร
  const head = surveyPackageCell(row, null, { sizes: edited, canDecide: true });
  assert.equal(head.hint, 'ตอนเคาะระบบเสนอ SM · 1 แพ็ค');
  assert.equal(head.overrideText, 'หัวหน้าเลือก ST แทน', 'เลือกแทน SM จริง ตอนเคาะ');
  assert.equal(head.registryText, 'ทะเบียนตอนนี้เสนอ TN (≤ 100 ลบ.ม.)');
  // แตะขนาด/จำนวน = ข้อเสนอสด (ตัวที่ server จะประทับเมื่อบันทึก)
  assert.equal(surveyPackageCell(row, { packageQty: 2 }, { sizes: edited, canDecide: true }).hint, 'ระบบเสนอ TN (≤ 100 ลบ.ม.) · 1 แพ็ค');
  // ไม่มีภาพนิ่ง (back-fill) + ดูอย่างเดียว = ไม่มีบรรทัดระบบเสนอ
  const old = surveyPackageCell(zone({ packageQty: 2, packageSize: 'ST' }), null, { sizes: SIZES, canDecide: false });
  assert.equal(old.hint, null);
  assert.equal(old.qtyHint, null);
  // ยังไม่เคาะ + ดูอย่างเดียว = ไม่มีค่า ไม่มีปุ่ม
  const blank = surveyPackageCell(zone(), null, { sizes: SIZES, canDecide: false });
  assert.equal(blank.valueText, null);
  assert.equal(blank.accept, null);
});

/* ══ UAT PR-P 01/10 ═══════════════════════════════════════════════════════ */

/* 🐞 ร่างเคยตัดช่องว่างหัวท้ายทุกครั้งที่กดแป้น ⇒ เว้นวรรคท้ายคำหายก่อนตัวอักษรถัดไปจะมา: พิมพ์ " ห้อง A กับ B" ได้ "ห้องAกับB"
   และข้อความที่ติดกันนั้นคือสิ่งที่ถูกส่ง · PR-P ทำให้ช่องนี้บังคับกับทุกขนาดที่ต่างจากข้อเสนอ */
test('🔴 เหตุผล: ร่างถือข้อความตามที่พิมพ์ (เว้นวรรคครบ) — ตัดช่องว่างหัวท้ายเฉพาะตอนเทียบและตอนส่ง', () => {
  const row = zone({ packageQty: 2, packageSize: 'ST', packageSizeSuggested: 'SM', packageNote: 'ลูกค้าขอกลิ่นเข้ม' });
  // จำลองการพิมพ์ทีละแป้น: ค่าที่จอวาดกลับเข้าช่องต้องเท่ากับที่เพิ่งพิมพ์ทุกครั้ง
  let typed = 'ลูกค้าขอกลิ่นเข้ม';
  for (const key of ' ห้อง A กับ B') {
    typed += key;
    assert.equal(surveyDecisionDraft(row, { packageNote: typed }).packageNote, typed);
  }
  assert.equal(typed, 'ลูกค้าขอกลิ่นเข้ม ห้อง A กับ B');
  assert.deepEqual(surveyDecisionPayload(row, { packageNote: `${typed}  ` }),
    { packageQty: 2, packageSize: 'ST', packageNote: 'ลูกค้าขอกลิ่นเข้ม ห้อง A กับ B' }, 'ส่ง = ตัดหัวท้าย เก็บช่องว่างข้างใน');
  // เว้นวรรคท้ายอย่างเดียวไม่ใช่การแก้ — ไม่ขึ้น "ยังไม่บันทึก" · ไม่มีอะไรให้ส่ง
  assert.equal(surveyDecisionDirty(row, { packageNote: 'ลูกค้าขอกลิ่นเข้ม ' }), false);
  assert.equal(surveyDecisionPayload(row, { packageNote: 'ลูกค้าขอกลิ่นเข้ม ' }), null);
  // ช่องว่างล้วน = ยังไม่ได้บอกเหตุผล (ด่านเดียวกับ server)
  assert.match(surveyDecisionError(row, { packageNote: '   ' }, ctx), /ต้องบอกเหตุผล/);
  assert.equal(surveyPackageCell(row, { packageNote: '   ' }, decide).noteMissing, true);
  assert.equal(surveyPackageCell(row, { packageNote: ' ก ' }, decide).noteMissing, false);
});

/* 🐞 แอดมินเพิ่ม "MD ≤ 1,000" ในทะเบียน ⇒ ห้อง 671.67 ลบ.ม. ที่เคาะ ST ตามที่ระบบเสนอเป๊ะ ขึ้นว่า "ระบบเสนอ MD · หัวหน้าเลือก ST แทน"
   ทั้งที่ไม่มีใครเลือกแทนอะไร ไม่มีช่องเหตุผล และด่านของ server (อ่านภาพนิ่ง) ก็ไม่ถาม */
test('🔴 เคาะตามที่ระบบเสนอแล้วทะเบียนถูกแก้ทีหลัง ≠ "หัวหน้าเลือกแทน" — แถวที่ยังไม่แตะเล่าข้อเสนอจากภาพนิ่ง', () => {
  const MD = { code: 'MD', nameEn: 'Medium', maxCbm: 1000, autoSuggest: true };
  const seven = { sizes: [...SIZES, MD], canDecide: true };
  const lounge = zone({ parts: [part(14.3, 7.7, 6.1)], packageQty: 1, packageSize: 'ST', packageSizeSuggested: 'ST' });
  const cell = surveyPackageCell(lounge, null, seven);
  assert.equal(cell.hint, 'ตอนเคาะระบบเสนอ ST · 1 แพ็ค');
  assert.equal(cell.overrideText, null, 'ไม่มีใครเลือก ST "แทน" อะไร');
  assert.equal(cell.reviewText, null);
  assert.equal(cell.registryText, 'ทะเบียนตอนนี้เสนอ MD (≤ 1,000 ลบ.ม.)');
  assert.equal(cell.needNote, false, 'ตรงกับด่านของ server — แถวที่ไม่ถูกแตะไม่ถูกย้อนบังคับเหตุผล');
  assert.equal(surveyDecisionDirty(lounge, null), false);
  // กดตามข้อเสนอใหม่ได้ทีเดียว (ไม่บังคับ) — บันทึกได้เลย ไม่ต้องมีเหตุผล
  assert.deepEqual(cell.accept, { label: 'ใช้ที่ระบบเสนอ: MD · 1 แพ็ค', patch: { packageSize: 'MD', packageQty: 1 } });
  assert.equal(surveyDecisionError(lounge, cell.accept.patch, { sizes: seven.sizes }), null);
  // จำนวนที่ไม่ใช่ 1 คือเลขที่หัวหน้าเคาะเอง (พร้อมเหตุผล) — บอกว่าทะเบียนเปลี่ยน แต่ไม่ชวนกดทับกลับเป็น 1
  const two = surveyPackageCell(zone({ parts: [part(14.3, 7.7, 6.1)], packageQty: 2, packageSize: 'ST', packageSizeSuggested: 'ST', packageNote: 'ใช้สองจุด' }), null, seven);
  assert.deepEqual([two.registryText, two.accept], ['ทะเบียนตอนนี้เสนอ MD (≤ 1,000 ลบ.ม.)', null]);
  // ทะเบียนไม่เปลี่ยน = บรรทัดเดิมพร้อมช่วง ไม่มีบรรทัดทะเบียน ไม่มีปุ่ม
  const same = surveyPackageCell(lounge, null, decide);
  assert.deepEqual([same.hint, same.registryText, same.accept, same.overrideText], ['ระบบเสนอ ST (≤ 2,400 ลบ.ม.) · 1 แพ็ค', null, null, null]);
  // แตะจำนวน = server ประทับข้อเสนอสด (MD) ⇒ จอเล่าข้อเสนอสด + "เลือก ST แทน" + เหตุผล — แล้วกดกลับเป็นค่าเดิมก็กลับเป็นภาพนิ่ง
  const touched = surveyPackageCell(lounge, { packageQty: 2 }, seven);
  assert.deepEqual([touched.hint, touched.overrideText, touched.registryText, touched.needNote],
    ['ระบบเสนอ MD (≤ 1,000 ลบ.ม.) · 1 แพ็ค', 'หัวหน้าเลือก ST แทน', null, true]);
  assert.equal(surveyPackageCell(lounge, { packageQty: 1 }, seven).hint, 'ตอนเคาะระบบเสนอ ST · 1 แพ็ค');
  // หัวหน้าเลือกแทนข้อเสนอจริงตอนเคาะ (พร้อมเหตุผล) — ยังเล่าว่าเลือกแทน และไม่ชวนกดทับ
  const chosen = surveyPackageCell(zone({ parts: [part(14.3, 7.7, 6.1)], packageQty: 1, packageSize: 'XL', packageSizeSuggested: 'ST', packageNote: 'เพดานสูง' }), null, seven);
  assert.deepEqual([chosen.hint, chosen.overrideText, chosen.accept], ['ตอนเคาะระบบเสนอ ST · 1 แพ็ค', 'หัวหน้าเลือก XL แทน', null]);
  // ขนาดถูกลบ = ไม่ใช่ "หัวหน้าเลือก MD แทน" — เล่าข้อเสนอสด (ตัวที่จะใช้ตอนเลือกใหม่) + กดรับได้ทีเดียว
  const gone = surveyPackageCell(zone({ packageQty: 1, packageSize: 'MD', packageSizeSuggested: 'MD' }), null, decide);
  assert.deepEqual([gone.gone, gone.hint, gone.overrideText, gone.registryText], ['MD', 'ระบบเสนอ SM (≤ 300 ลบ.ม.) · 1 แพ็ค', null, null]);
  assert.deepEqual(gone.accept, { label: 'ใช้ที่ระบบเสนอ: SM · 1 แพ็ค', patch: { packageSize: 'SM', packageQty: 1 } });
});

/* 🐞 แตะขนาดแล้วจำนวนเป็น 1 ทันที และ −/+ ไม่ลงต่ำกว่า 1 ⇒ แตะพลาดแล้วทางกลับทางเดียวคือ "ยกเลิก" ที่ทิ้งการเคาะของทุกพื้นที่ */
test('⭐ ถอยเฉพาะพื้นที่: `reset` คืนสามช่องของแพ็คเกจเป็นค่าในฐาน — จุดที่เลือกในร่างยังอยู่', () => {
  const blank = zone();
  assert.equal(surveyPackageCell(blank, null, decide).reset, null, 'ยังไม่แตะ = ไม่มีปุ่ม');
  const tapped = { packageSize: 'ST', spotIds: ['s1'] };
  const cell = surveyPackageCell(blank, tapped, decide);
  assert.equal(cell.reset.label, 'ล้างที่เคาะ');
  const back = { ...tapped, ...cell.reset.patch };
  assert.deepEqual(surveyDecisionDraft(blank, back), { packageQty: null, packageSize: null, packageNote: '', spotIds: ['s1'] });
  assert.equal(surveyPackageCell(blank, back, decide).reset, null);
  // แถวที่บันทึกแล้ว: คืนค่าที่บันทึกไว้ (ขนาด · จำนวน · เหตุผล)
  const saved = decided();
  const edited = { packageSize: 'XL', packageQty: 3, packageNote: 'ลองดู' };
  const editedCell = surveyPackageCell(saved, edited, decide);
  assert.equal(editedCell.reset.label, 'คืนค่าที่บันทึกไว้');
  assert.equal(surveyDecisionDirty(saved, { ...edited, ...editedCell.reset.patch }), false);
  // แก้เหตุผลอย่างเดียวก็ถอยได้ · คนดูอย่างเดียวไม่มีปุ่ม
  assert.equal(surveyPackageCell(saved, { packageNote: 'x' }, decide).reset.label, 'คืนค่าที่บันทึกไว้');
  assert.equal(surveyPackageCell(saved, edited, { sizes: SIZES, canDecide: false }).reset, null);
});
