// ── จอทะเบียนขนาดแพ็คเกจ — ฟอร์มใบเดียว · ตัวกรอง · กล่องยืนยันลบ (mig 0398 · มติเจ้าของ 01/10 "เพิ่ม ลบ ได้") ──
//
// ⭐ ครอบสิ่งที่พังได้จริงบนจอ: ฟอร์มเพิ่มกับฟอร์มแก้ส่งคำขอคนละทรง · ช่องช่วงว่างกลายเป็น "ไม่มีเพดาน" เงียบ ๆ ·
//   ช่วงเดิมค้างมากับขนาดที่สลับเป็น "หัวหน้าเลือกเอง" · กล่องลบที่ถามว่า "แน่ใจไหม" แทนที่จะบอกผล ·
//   "ไม่ได้นับ" ถูกอ่านเป็น "ไม่มีใบใช้"
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_SIZE_BAND_OPTIONS, PACKAGE_SIZE_PICK_OPTIONS, emptyPackageSizeForm, packageSizeDeleteConfirm,
  packageSizeDeletedText, packageSizeFilterOptions, packageSizeFormError, packageSizeFormOf, packageSizeFormPayload,
  packageSizeLegendText, packageSizeRows,
} from './packageSizeForm.js';
import { normalizePackageSizeInput, packageSizeError } from './packageSizes.js';

/* ชุดตั้งต้นของ 0398 — เรียงสลับไว้ให้ตัวเรียงต้องทำงานจริง */
const SIZES = [
  { code: 'XL', nameEn: 'Extra Large', maxCbm: null, autoSuggest: true, note: null },
  { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true, note: null },
  { code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false, note: 'ห้องน้ำ' },
  { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true, note: null },
];
const byCode = (code) => SIZES.find((s) => s.code === code);
const edit = { canEdit: true, sizes: SIZES };

// ── ฟอร์ม ↔ แถวทะเบียน ───────────────────────────────────────────────────
test('ฟอร์มเปล่า = ระบบเสนอ · มีเพดาน (ทรงที่พบบ่อยที่สุดของขนาดใหม่) และยังกดบันทึกไม่ได้', () => {
  assert.deepEqual(emptyPackageSizeForm(), { code: '', nameEn: '', pick: 'auto', band: 'max', maxCbm: '', note: '' });
  assert.deepEqual(packageSizeFormOf(null), emptyPackageSizeForm());
  assert.notEqual(packageSizeFormError('create', emptyPackageSizeForm(), edit), null);
});

test('⭐ แถวทะเบียน → ฟอร์ม → คำขอ ได้แถวเดิมกลับมาทุกทรง (มีเพดาน · ไม่มีเพดาน · หัวหน้าเลือกเอง)', () => {
  assert.deepEqual(packageSizeFormOf(byCode('SM')), { code: 'SM', nameEn: 'Small', pick: 'auto', band: 'max', maxCbm: '300', note: '' });
  assert.deepEqual(packageSizeFormOf(byCode('XL')), { code: 'XL', nameEn: 'Extra Large', pick: 'auto', band: 'open', maxCbm: '', note: '' });
  assert.deepEqual(packageSizeFormOf(byCode('XS')), { code: 'XS', nameEn: 'Extra Small', pick: 'manual', band: 'max', maxCbm: '', note: 'ห้องน้ำ' });
  for (const size of SIZES) {
    const { value } = normalizePackageSizeInput(packageSizeFormPayload(packageSizeFormOf(size)));
    assert.deepEqual(value, size, size.code);
    // เปิดแก้แล้วไม่แตะอะไร = บันทึกได้ (ฟอร์มแก้ต้องไม่ติดด่านจากของที่ตัวเองโหลดมา)
    assert.equal(packageSizeFormError('update', packageSizeFormOf(size), { ...edit, before: size }), null, size.code);
  }
});

test('⭐ เพิ่มกับแก้ส่งคำขอทรงเดียวกัน — ห้าช่องเดิมเสมอ (ฟอร์มเดียว · กฎ AGENTS.md)', () => {
  const keys = ['code', 'nameEn', 'autoSuggest', 'maxCbm', 'note'];
  assert.deepEqual(Object.keys(packageSizeFormPayload(emptyPackageSizeForm())), keys);
  assert.deepEqual(Object.keys(packageSizeFormPayload(packageSizeFormOf(byCode('XS')))), keys);
  assert.deepEqual(
    packageSizeFormPayload({ code: ' md ', nameEn: ' Medium ', pick: 'auto', band: 'max', maxCbm: ' 1,000 ', note: ' ' }),
    { code: 'MD', nameEn: 'Medium', autoSuggest: true, maxCbm: '1,000', note: '' },
  );
});

test('ช่องช่วงที่มองไม่เห็นไม่ถูกส่ง — "หัวหน้าเลือกเอง" และ "ไม่มีเพดาน" ทิ้งตัวเลขที่ค้างในฟอร์ม', () => {
  const stale = { code: 'MD', nameEn: 'Medium', maxCbm: '1000', note: '' };
  assert.equal(packageSizeFormPayload({ ...stale, pick: 'manual', band: 'max' }).maxCbm, null);
  assert.equal(packageSizeFormPayload({ ...stale, pick: 'manual', band: 'max' }).autoSuggest, false);
  assert.equal(packageSizeFormPayload({ ...stale, pick: 'auto', band: 'open' }).maxCbm, null);
  assert.equal(packageSizeFormPayload({ ...stale, pick: 'auto', band: 'max' }).maxCbm, '1000');
});

// ── ด่านของปุ่มบันทึก ───────────────────────────────────────────────────
test('🔴 เลือก "ไม่เกิน … ลบ.ม." แล้วเว้นตัวเลขว่าง ≠ ไม่มีเพดาน — ฟอร์มตีกลับก่อนถึงด่านกลาง', () => {
  const form = { code: 'MD', nameEn: 'Medium', pick: 'auto', band: 'max', maxCbm: '  ', note: '' };
  assert.match(packageSizeFormError('create', form, edit), /ระบุขนาดพื้นที่สูงสุด/);
  // ด่านกลางเองอ่านค่าว่างเป็น "ไม่มีเพดาน" แล้วจะฟ้องเรื่อง XL — ข้อความที่ไม่ตรงกับสิ่งที่คนทำ
  assert.equal(packageSizeError('create', packageSizeFormPayload(form), edit), 'มีขนาดไม่มีเพดานอยู่แล้ว: XL');
  // กดเลือก "ไม่มีเพดาน" เอง = ได้ข้อความของด่านกลาง
  assert.equal(packageSizeFormError('create', { ...form, band: 'open' }, edit), 'มีขนาดไม่มีเพดานอยู่แล้ว: XL');
  // หัวหน้าเลือกเอง ไม่มีช่องช่วง ⇒ ไม่ถูกถามเรื่องช่วง
  assert.equal(packageSizeFormError('create', { ...form, pick: 'manual' }, edit), null);
});

test('⭐ เหตุที่ขึ้นเรียงตามลำดับช่องบนฟอร์ม — รหัส → ชื่อ → ช่วง (ฟอร์มเปล่าไม่ถามเรื่องช่วงก่อนรหัส)', () => {
  const form = emptyPackageSizeForm();
  assert.match(packageSizeFormError('create', form, edit), /รหัสขนาดต้องเป็นตัวอักษรอังกฤษตัวใหญ่หรือตัวเลข 2–4 ตัว/);
  assert.equal(packageSizeFormError('create', { ...form, code: 'MD' }, edit), 'ต้องระบุชื่อเต็มของขนาด');
  assert.match(packageSizeFormError('create', { ...form, code: 'MD', nameEn: 'Medium' }, edit), /ระบุขนาดพื้นที่สูงสุด/);
  assert.equal(packageSizeFormError('create', { ...form, code: 'MD', nameEn: 'Medium', maxCbm: '1000' }, edit), null);
  // รหัสซ้ำมาก่อนช่องช่วงที่ยังว่าง
  assert.equal(packageSizeFormError('create', { ...form, code: 'ST', nameEn: 'x' }, edit), 'รหัส ST มีอยู่แล้วในทะเบียน');
  // อ่านทะเบียนไม่สำเร็จ = บอกเหตุนั้น ไม่ใช่ไล่ถามช่อง
  assert.equal(packageSizeFormError('create', form, { canEdit: true, sizes: null }), 'อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ — ลองใหม่');
});

test('ด่านกลางตัวเดียวกับ route — รหัสซ้ำ · ช่วงชน · ตัวเลขอ่านไม่ออก · ไม่มีสิทธิ์ · ผ่าน', () => {
  const md = { code: 'MD', nameEn: 'Medium', pick: 'auto', band: 'max', maxCbm: '1,000', note: '' };
  assert.equal(packageSizeFormError('create', md, edit), null);
  assert.equal(packageSizeFormError('create', { ...md, code: 'st' }, edit), 'รหัส ST มีอยู่แล้วในทะเบียน');
  assert.equal(packageSizeFormError('create', { ...md, maxCbm: '2,400' }, edit), 'ช่วงไม่เกิน 2,400 ลบ.ม. มีอยู่แล้ว: ST');
  assert.match(packageSizeFormError('create', { ...md, maxCbm: '1,5' }, edit), /ต้องเป็นตัวเลขมากกว่า 0/);
  assert.match(packageSizeFormError('create', { ...md, code: 'M' }, edit), /2–4 ตัว/);
  assert.equal(packageSizeFormError('create', { ...md, nameEn: ' ' }, edit), 'ต้องระบุชื่อเต็มของขนาด');
  // ไม่มีสิทธิ์ = ข้อความสิทธิ์ ไม่ใช่ข้อความช่องว่าง (ลำดับของด่าน)
  assert.equal(packageSizeFormError('create', emptyPackageSizeForm(), { canEdit: false, sizes: SIZES }),
    'แก้ทะเบียนขนาดแพ็คเกจได้เฉพาะแอดมินและหัวหน้าฝ่ายบริการ');
  // แก้: ช่วงของตัวเองไม่ชนตัวเอง · รหัสแก้ไม่ได้
  const st = packageSizeFormOf(byCode('ST'));
  assert.equal(packageSizeFormError('update', { ...st, maxCbm: '2,000' }, { ...edit, before: byCode('ST') }), null);
  assert.match(packageSizeFormError('update', { ...st, code: 'SD' }, { ...edit, before: byCode('ST') }), /รหัส ST แก้ไม่ได้/);
});

test('สลับ XS เป็น "ระบบเสนอ" ต้องตอบเรื่องช่วงเอง — ไม่ได้ "ไม่มีเพดาน" มาโดยไม่ได้เลือก', () => {
  const xs = { ...packageSizeFormOf(byCode('XS')), pick: 'auto' };
  assert.equal(xs.band, 'max');
  assert.match(packageSizeFormError('update', xs, { ...edit, before: byCode('XS') }), /ระบุขนาดพื้นที่สูงสุด/);
});

test('ตัวเลือกของฟอร์มเป็นชุดเล็กที่กางให้เห็น — สองแผ่นต่อกลุ่ม พร้อมคำอธิบาย', () => {
  assert.deepEqual(PACKAGE_SIZE_PICK_OPTIONS.map((o) => [o.value, o.label]),
    [['auto', 'ระบบเสนอจาก ลบ.ม.'], ['manual', 'หัวหน้าเลือกเอง']]);
  assert.deepEqual(PACKAGE_SIZE_BAND_OPTIONS.map((o) => [o.value, o.label]),
    [['max', 'ไม่เกิน … ลบ.ม.'], ['open', 'ไม่มีเพดาน']]);
  for (const o of [...PACKAGE_SIZE_PICK_OPTIONS, ...PACKAGE_SIZE_BAND_OPTIONS]) assert.ok(o.description, o.value);
});

// ── ตาราง ──────────────────────────────────────────────────────────────
test('ตัวกรองสามตัวพร้อมจำนวน — ป้ายจำนวนเป็นตัวเลข ไม่ต่อในชื่อ', () => {
  assert.deepEqual(packageSizeFilterOptions(SIZES), [
    { value: 'all', label: 'ทั้งหมด', count: 4 },
    { value: 'auto', label: 'ระบบเสนอจาก ลบ.ม.', count: 3 },
    { value: 'manual', label: 'หัวหน้าเลือกเอง', count: 1 },
  ]);
  assert.deepEqual(packageSizeFilterOptions([]).map((f) => f.count), [0, 0, 0], 'ทะเบียนว่างจริง = ศูนย์');
  // 🔴 ยังไม่รู้ (กำลังโหลด/โหลดพัง) = ไม่มีป้ายจำนวน — "ทั้งหมด 0" บนจอที่โหลดพังอ่านว่าทะเบียนว่าง
  assert.deepEqual(packageSizeFilterOptions(null).map((f) => f.count), [null, null, null]);
  assert.deepEqual(packageSizeFilterOptions(null).map((f) => f.value), ['all', 'auto', 'manual'], 'แถบยังยืนอยู่ระหว่างโหลด');
});

test('แถวของตารางเรียงตามทะเบียน (เลือกเอง → ช่วงน้อยไปมาก → ไม่มีเพดาน) แล้วกรอง · ตัวกรองไม่รู้จัก = ทั้งหมด', () => {
  assert.deepEqual(packageSizeRows(SIZES).map((s) => s.code), ['XS', 'SM', 'ST', 'XL']);
  assert.deepEqual(packageSizeRows(SIZES, 'auto').map((s) => s.code), ['SM', 'ST', 'XL']);
  assert.deepEqual(packageSizeRows(SIZES, 'manual').map((s) => s.code), ['XS']);
  assert.deepEqual(packageSizeRows(SIZES, 'nope').map((s) => s.code), ['XS', 'SM', 'ST', 'XL']);
  // ขนาดใหม่ลงตรงตำแหน่งของช่วงเองโดยไม่มีช่อง "ลำดับ" ในฟอร์ม
  const more = [...SIZES, { code: 'MD', nameEn: 'Medium', maxCbm: 1000, autoSuggest: true }];
  assert.deepEqual(packageSizeRows(more).map((s) => s.code), ['XS', 'SM', 'MD', 'ST', 'XL']);
  assert.deepEqual(packageSizeRows(undefined), []);
});

test('บรรทัดอธิบายช่วง — ประกอบจากทะเบียนจริง ขนาดที่ระบบเสนอมาก่อน ไม่ใช่ตัวเลขที่พิมพ์ตายไว้', () => {
  assert.equal(packageSizeLegendText(SIZES), 'SM ≤ 300 ลบ.ม. · ST ≤ 2,400 ลบ.ม. · XL เกิน 2,400 ลบ.ม. · XS เลือกเอง');
  const noSt = SIZES.filter((s) => s.code !== 'ST');
  assert.equal(packageSizeLegendText(noSt), 'SM ≤ 300 ลบ.ม. · XL เกิน 300 ลบ.ม. · XS เลือกเอง', 'ลบ ST แล้ว XL เริ่มต่อจาก 300 เอง');
  assert.equal(packageSizeLegendText([]), '');
});

// ── กล่องยืนยันลบ ───────────────────────────────────────────────────────
test('⭐ กล่องลบบอกผล: กี่ใบที่ยังไม่ส่งผลต้องเลือกขนาดใหม่ · ใบที่ส่งผลแล้วไม่เปลี่ยน', () => {
  const view = packageSizeDeleteConfirm(byCode('ST'), { ...edit, usage: { ST: { surveys: 3, zones: 5 }, SM: { surveys: 1, zones: 1 } } });
  assert.equal(view.blocked, null);
  assert.equal(view.title, 'ลบขนาด ST ออกจากทะเบียน');
  assert.equal(view.message,
    'ลบขนาด ST? ใบประเมินที่ยังไม่ส่งผล 3 ใบ (5 พื้นที่) ใช้ขนาดนี้ — หัวหน้าต้องเลือกขนาดใหม่ก่อนส่งผล');
  assert.match(view.detail, /ใบที่ส่งผลแล้วไม่เปลี่ยน/);
  assert.equal(view.confirmLabel, 'ลบ');
});

/* 🐞 UAT PR-P 01/10 — GET ส่งเลขที่ใบมาอยู่แล้ว (`docNos`) แต่กล่องบอกแค่ "3 ใบ (5 พื้นที่)" ⇒ หัวหน้าไม่รู้ว่าต้องไปเลือกใหม่ที่ใบไหน */
test('⭐ กล่องลบบอกด้วยว่าใบไหน — เลขที่ใบจาก `docNos` · เกิน 10 ใบบอกจำนวนที่เหลือ · ไม่มีใบใช้/ไม่รู้ = ไม่มีบรรทัดนี้', () => {
  const usage = { ST: { surveys: 3, zones: 5, docNos: ['RQ-AS-26090188', 'RQ-AS-26090201', 'RQ-AS-26090214'] } };
  const view = packageSizeDeleteConfirm(byCode('ST'), { ...edit, usage });
  assert.equal(view.docsText, 'ใบที่ต้องเลือกขนาดใหม่: RQ-AS-26090188 · RQ-AS-26090201 · RQ-AS-26090214');
  assert.match(view.detail, /ใบที่ส่งผลแล้วไม่เปลี่ยน/, 'ผลกับใบที่ส่งแล้วยังบอกเหมือนเดิม');
  const many = Array.from({ length: 13 }, (_, i) => `RQ-AS-${String(i + 1).padStart(3, '0')}`);
  const long = packageSizeDeleteConfirm(byCode('ST'), { ...edit, usage: { ST: { surveys: 13, zones: 20, docNos: many } } });
  assert.equal(long.docsText, `ใบที่ต้องเลือกขนาดใหม่: ${many.slice(0, 10).join(' · ')} และอีก 3 ใบ`);
  // นับได้แต่ server รุ่นเก่าไม่ส่งเลขที่ใบ · ไม่มีใบใช้ · ไม่ได้นับ = ไม่มีบรรทัด (ไม่ขึ้นหัวข้อเปล่า)
  assert.equal(packageSizeDeleteConfirm(byCode('ST'), { ...edit, usage: { ST: { surveys: 3, zones: 5 } } }).docsText, null);
  assert.equal(packageSizeDeleteConfirm(byCode('XL'), { ...edit, usage }).docsText, null);
  assert.equal(packageSizeDeleteConfirm(byCode('ST'), { ...edit, usage: null }).docsText, undefined);
});

test('ไม่มีใบใช้ = บอกว่าไม่มี (ไม่สั่งให้ใครเลือกใหม่) · ผลกับใบที่ส่งแล้วยังบอกเหมือนเดิม', () => {
  const view = packageSizeDeleteConfirm(byCode('XL'), { ...edit, usage: { ST: { surveys: 3, zones: 5 } } });
  assert.equal(view.message, 'ลบขนาด XL? ไม่มีใบประเมินที่ยังไม่ส่งผลใช้ขนาดนี้');
  assert.doesNotMatch(view.message, /เลือกขนาดใหม่/);
  assert.match(view.detail, /ใบที่ส่งผลแล้วไม่เปลี่ยน/);
  // ทะเบียนนับแล้วได้ชุดว่าง = ไม่มีใบใช้ (ต่างจาก null ที่แปลว่าไม่ได้นับ)
  assert.equal(packageSizeDeleteConfirm(byCode('XL'), { ...edit, usage: {} }).message, 'ลบขนาด XL? ไม่มีใบประเมินที่ยังไม่ส่งผลใช้ขนาดนี้');
});

test('🔴 ไม่รู้จำนวน ≠ ไม่มีใบใช้ — usage เป็น null ต้องบอกว่ายังไม่ทราบ ไม่ใช่ "ไม่มีใบใช้"', () => {
  for (const usage of [null, undefined]) {
    const view = packageSizeDeleteConfirm(byCode('ST'), { ...edit, usage });
    assert.equal(view.blocked, null);
    assert.match(view.message, /ยังไม่ทราบว่ามีใบประเมินที่ยังไม่ส่งผลใช้ขนาดนี้กี่ใบ/);
    assert.doesNotMatch(view.message, /ไม่มีใบประเมิน/);
    assert.match(view.detail, /ระบบนับใบที่กระทบให้อีกครั้งตอนลบ/);
  }
});

test('ลบไม่ได้ = กล่องบอกเหตุ ไม่มีปุ่มลบ — ขนาดสุดท้าย · ไม่มีสิทธิ์', () => {
  const last = packageSizeDeleteConfirm(byCode('ST'), { canEdit: true, sizes: [byCode('ST')], usage: {} });
  assert.match(last.blocked, /ต้องเหลืออย่างน้อยหนึ่งขนาด/);
  assert.equal(last.message, last.blocked);
  assert.equal(last.detail, null);
  const denied = packageSizeDeleteConfirm(byCode('ST'), { canEdit: false, sizes: SIZES, usage: {} });
  assert.equal(denied.blocked, 'แก้ทะเบียนขนาดแพ็คเกจได้เฉพาะแอดมินและหัวหน้าฝ่ายบริการ');
});

test('ข้อความหลังลบใช้ตัวเลขที่ server นับ ณ ตอนลบ', () => {
  assert.equal(packageSizeDeletedText('st', { surveys: 2, zones: 3 }),
    'ลบขนาด ST แล้ว — ใบประเมินที่ยังไม่ส่งผล 2 ใบ (3 พื้นที่) ต้องเลือกขนาดใหม่ก่อนส่งผล');
  assert.equal(packageSizeDeletedText('ST', { surveys: 0, zones: 0 }), 'ลบขนาด ST แล้ว');
  assert.equal(packageSizeDeletedText('ST', null), 'ลบขนาด ST แล้ว');
});
