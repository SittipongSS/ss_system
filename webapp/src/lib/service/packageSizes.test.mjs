// ── ทะเบียนขนาดแพ็คเกจ (mig 0398 · มติเจ้าของ 01/10) — ตัวตัดสินล้วน ───────────────────
//
// ⭐ ล็อกสี่เรื่อง: ① ทะเบียนเพิ่ม/แก้/ลบได้ แต่ระบบต้องเสนอขนาดได้คำตอบเดียวเสมอ (ช่วงไม่ซ้ำ · เปิดเพดานได้ตัวเดียว)
//   ② ระบบเสนอขนาดจาก ลบ.ม. + จำนวน 1 — สูตร ceil(ลบ.ม. ÷ 2,400) ไม่มีแล้ว ③ การเคาะของหัวหน้าเก็บ **ภาพนิ่ง**
//   (ขนาด · ที่ระบบเสนอ · เลือกเอง) ④ ขนาดที่ถูกลบจากทะเบียน = ใบที่ยังไม่ส่งผลต้องเลือกใหม่ก่อนส่ง
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PACKAGE_SIZE_EDIT_DENIED,
  PACKAGE_SIZE_REGISTRY_DOWN,
  normalizePackageSizeInput,
  packageMixText,
  packageRegistryWarnings,
  packageSizeBandText,
  packageSizeError,
  packageSizeRangeText,
  packageSizeUnchecked,
  packageSizeUsageText,
  sortPackageSizes,
  suggestedPackageSize,
  surveyPackageDecision,
  surveyPackageReviewRows,
  surveyPackageReviewText,
  surveyPackageSizeGates,
  surveyPackageSizeSendError,
  surveyRemeasureStamp,
  surveyRemeasureTouchesSuggestion,
} from './packageSizes.js';
import { surveyGateChecklist } from './survey.js';
import { surveyPackageCell } from './surveyDecision.js';

/* ชุดตั้งต้นของ 0398 — XS ห้องน้ำ (เลือกเอง ไม่มีช่วง) · SM ≤ 300 · ST ≤ 2,400 · XL เกิน 2,400 */
const XS = { code: 'XS', nameEn: 'Extra Small', maxCbm: null, autoSuggest: false, note: 'ห้องน้ำ' };
const SM = { code: 'SM', nameEn: 'Small', maxCbm: 300, autoSuggest: true, note: null };
const ST = { code: 'ST', nameEn: 'Standard', maxCbm: 2400, autoSuggest: true, note: null };
const XL = { code: 'XL', nameEn: 'Extra Large', maxCbm: null, autoSuggest: true, note: null };
const SEED = [XS, SM, ST, XL];
const MD = { code: 'MD', nameEn: 'Medium', maxCbm: 1000, autoSuggest: true, note: null };
const head = { canEdit: true, sizes: SEED };

const part = (w, l, h) => ({ widthM: w, lengthM: l, heightM: h });
/* 10×10×2 = 200 ลบ.ม. ⇒ ระบบเสนอ SM */
const zone = (over = {}) => ({
  id: 'SVZ1', zoneName: 'ล็อบบี้', status: 'ok', parts: [part(10, 10, 2)],
  packageQty: null, packageSize: null, packageSizeSuggested: null, packageSizeManual: false, packageNote: null,
  ...over,
});

/* ══ ① ฟอร์มทะเบียน ═══════════════════════════════════════════════════════ */

test('ล้างค่าฟอร์ม: รหัสเป็นตัวใหญ่ · ตัดช่องว่าง · ช่วงเป็นตัวเลขหรือ null', () => {
  assert.deepEqual(
    normalizePackageSizeInput({ code: ' md ', nameEn: '  Medium  ', maxCbm: '1,000', autoSuggest: true, note: '  ' }).value,
    { code: 'MD', nameEn: 'Medium', maxCbm: 1000, autoSuggest: true, note: null },
  );
  assert.equal(normalizePackageSizeInput({ code: 'XL', nameEn: 'x', maxCbm: '' }).value.maxCbm, null);
  assert.equal(normalizePackageSizeInput({ code: 'XL', nameEn: 'x', maxCbm: null }).value.maxCbm, null);
  assert.equal(normalizePackageSizeInput({ code: 'SM', nameEn: 'x', maxCbm: 300.5 }).value.maxCbm, 300.5);
  // ไม่ส่ง autoSuggest มา = ระบบเสนอ (ค่าตั้งต้นของคอลัมน์)
  assert.equal(normalizePackageSizeInput({ code: 'SM', nameEn: 'x' }).value.autoSuggest, true);
  assert.equal(normalizePackageSizeInput(null).value.code, '');
});

test('⭐ ขนาดที่หัวหน้าเลือกเอง (เช่น XS ห้องน้ำ) ไม่มีช่วง — ช่องช่วงที่ค้างมากับฟอร์มถูกทิ้ง ไม่ใช่ตีกลับ', () => {
  const { value } = normalizePackageSizeInput({ code: 'XS', nameEn: 'Extra Small', maxCbm: 300, autoSuggest: false });
  assert.equal(value.autoSuggest, false);
  assert.equal(value.maxCbm, null);
  assert.equal(packageSizeError('create', { code: 'RS', nameEn: 'Restroom', maxCbm: 50, autoSuggest: false }, head), null);
});

test('🔴 แก้ทะเบียนได้เฉพาะแอดมินและหัวหน้าฝ่ายบริการ — ไม่ส่งบริบทมา = ปฏิเสธ', () => {
  assert.equal(packageSizeError('create', MD), PACKAGE_SIZE_EDIT_DENIED);
  assert.equal(packageSizeError('update', MD, { canEdit: false, before: MD, sizes: SEED }), PACKAGE_SIZE_EDIT_DENIED);
  assert.equal(packageSizeError('delete', {}, { canEdit: false, before: ST, sizes: SEED }), PACKAGE_SIZE_EDIT_DENIED);
  assert.match(PACKAGE_SIZE_EDIT_DENIED, /แอดมินและหัวหน้าฝ่ายบริการ/);
});

test('รหัส 2–4 ตัว A–Z/0–9 · ห้ามซ้ำ · ชื่อเต็ม 1–60 · หมายเหตุไม่เกิน 500', () => {
  assert.equal(packageSizeError('create', MD, head), null);
  assert.match(packageSizeError('create', { ...MD, code: 'M' }, head), /2–4 ตัว/);
  assert.match(packageSizeError('create', { ...MD, code: 'MEDIUM' }, head), /2–4 ตัว/);
  assert.match(packageSizeError('create', { ...MD, code: 'M-D' }, head), /2–4 ตัว/);
  assert.match(packageSizeError('create', { ...MD, code: 'ก1' }, head), /2–4 ตัว/);
  assert.match(packageSizeError('create', { ...MD, code: 'st' }, head), /ST มีอยู่แล้ว/);
  assert.match(packageSizeError('create', { ...MD, nameEn: '  ' }, head), /ชื่อเต็ม/);
  assert.match(packageSizeError('create', { ...MD, nameEn: 'x'.repeat(61) }, head), /60 ตัวอักษร/);
  assert.match(packageSizeError('create', { ...MD, note: 'x'.repeat(501) }, head), /500 ตัวอักษร/);
});

test('ช่วงพื้นที่ต้องเป็นตัวเลขมากกว่า 0 — พิมพ์มั่ว/ศูนย์/ติดลบ ถูกตีกลับ', () => {
  for (const bad of ['abc', 0, -5, '1,5']) {
    assert.match(packageSizeError('create', { ...MD, maxCbm: bad }, head), /มากกว่า 0/, String(bad));
  }
});

test('🔴 ระบบต้องเสนอได้คำตอบเดียว: ช่วงซ้ำกันไม่ได้ · ขนาดไม่มีเพดานมีได้ตัวเดียว', () => {
  assert.match(packageSizeError('create', { ...MD, maxCbm: 300 }, head), /มีอยู่แล้ว: SM/);
  assert.equal(packageSizeError('create', { ...MD, maxCbm: null }, head), 'มีขนาดไม่มีเพดานอยู่แล้ว: XL');
  // แก้ตัวเองไม่ชนกับตัวเอง
  assert.equal(packageSizeError('update', { ...XL, nameEn: 'Extra Large+' }, { ...head, before: XL }), null);
  assert.equal(packageSizeError('update', { ...SM, maxCbm: 350 }, { ...head, before: SM }), null);
  // ย้ายช่วงไปชนเพื่อน / เปิดเพดานทั้งที่มี XL อยู่ = ไม่ได้
  assert.match(packageSizeError('update', { ...SM, maxCbm: 2400 }, { ...head, before: SM }), /มีอยู่แล้ว: ST/);
  assert.match(packageSizeError('update', { ...ST, maxCbm: null }, { ...head, before: ST }), /ไม่มีเพดานอยู่แล้ว: XL/);
  // ขนาดที่เลือกเองไม่กินโควตา "ไม่มีเพดาน" — XS (ไม่มีช่วง) อยู่ร่วมกับ XL ได้
  assert.equal(packageSizeError('create', { code: 'RS', nameEn: 'Restroom', autoSuggest: false }, head), null);
});

test('🔴 รหัสแก้ไม่ได้ — ผลประเมินที่เคาะไปแล้วเก็บรหัสไว้เป็นภาพนิ่ง', () => {
  assert.match(packageSizeError('update', { ...ST, code: 'SD' }, { ...head, before: ST }), /รหัส.*แก้ไม่ได้/);
  assert.match(packageSizeError('update', ST, { ...head, before: null }), /ไม่พบขนาดนี้/);
});

test('ลบได้ทุกขนาด ยกเว้นขนาดสุดท้ายที่เหลือ · ไม่พบ = บอกว่าไม่พบ', () => {
  assert.equal(packageSizeError('delete', {}, { ...head, before: ST }), null);
  assert.match(packageSizeError('delete', {}, { canEdit: true, before: ST, sizes: [ST] }), /อย่างน้อยหนึ่งขนาด/);
  assert.match(packageSizeError('delete', {}, { ...head, before: null }), /ไม่พบขนาดนี้/);
});

test('⚠️ ไม่มีทะเบียนให้เทียบ (อ่านไม่สำเร็จ) = ปฏิเสธ ไม่ใช่ปล่อยให้ซ้ำ', () => {
  assert.equal(packageSizeError('create', MD, { canEdit: true }), PACKAGE_SIZE_REGISTRY_DOWN);
  assert.equal(packageSizeError('delete', {}, { canEdit: true, before: ST, sizes: null }), PACKAGE_SIZE_REGISTRY_DOWN);
});

/* ══ ลำดับ + ข้อความช่วง ═══════════════════════════════════════════════════ */

test('⭐ ลำดับมาจากข้อมูล ไม่ใช่ช่องเรียง: เลือกเอง (ตามรหัส) → ช่วงน้อยไปมาก → ไม่มีเพดานท้ายสุด', () => {
  const shuffled = [XL, ST, { code: 'RS', nameEn: 'Restroom', maxCbm: null, autoSuggest: false }, MD, XS, SM];
  assert.deepEqual(sortPackageSizes(shuffled).map((s) => s.code), ['RS', 'XS', 'SM', 'MD', 'ST', 'XL']);
  assert.deepEqual(sortPackageSizes(null), []);
  assert.equal(shuffled[0].code, 'XL', 'ไม่แก้อาร์เรย์ต้นทาง');
});

test('ข้อความช่วง: เลือกเอง · ≤ 300 ลบ.ม. · เกิน 2,400 ลบ.ม.', () => {
  assert.equal(packageSizeBandText(XS, SEED), 'เลือกเอง');
  assert.equal(packageSizeBandText(SM, SEED), '≤ 300 ลบ.ม.');
  assert.equal(packageSizeBandText(ST, SEED), '≤ 2,400 ลบ.ม.');
  assert.equal(packageSizeBandText(XL, SEED), 'เกิน 2,400 ลบ.ม.');
  // ไม่มีช่วงไหนเลย = ขนาดไม่มีเพดานครอบทุกพื้นที่
  assert.equal(packageSizeBandText(XL, [XS, XL]), 'ทุกขนาดพื้นที่');
});

test('บรรทัดรองของตารางทะเบียน: ระบบเสนอเมื่อไร', () => {
  assert.equal(packageSizeRangeText(SM, SEED), 'ระบบเสนอเมื่อไม่เกิน 300 ลบ.ม.');
  assert.equal(packageSizeRangeText(ST, SEED), 'ระบบเสนอเมื่อเกิน 300 ถึง 2,400 ลบ.ม.');
  assert.equal(packageSizeRangeText(XL, SEED), 'ระบบเสนอเมื่อเกิน 2,400 ลบ.ม.');
  assert.equal(packageSizeRangeText(XS, SEED), 'ระบบไม่เสนอ — หัวหน้าเลือกเอง');
});

/* ══ ② ระบบเสนอขนาด ═══════════════════════════════════════════════════════ */

test('⭐ ระบบเสนอ = ขนาดที่ช่วงเล็กที่สุดซึ่งยังครอบปริมาตร · จำนวนเสนอ 1 เสมอ', () => {
  assert.deepEqual(suggestedPackageSize(278.08, SEED), { code: 'SM', qty: 1 });
  assert.deepEqual(suggestedPackageSize(300, SEED), { code: 'SM', qty: 1 });
  assert.deepEqual(suggestedPackageSize(671.67, SEED), { code: 'ST', qty: 1 });
  assert.deepEqual(suggestedPackageSize(2400, SEED), { code: 'ST', qty: 1 });
  assert.deepEqual(suggestedPackageSize(2400.01, SEED), { code: 'XL', qty: 1 });
  // 🔄 สูตรเดิม ceil(7,200 ÷ 2,400) = 3 แพ็คเกจ — ตอนนี้คือ XL 1 แพ็ค แล้วหัวหน้าปรับเอง
  assert.deepEqual(suggestedPackageSize(7200, SEED), { code: 'XL', qty: 1 });
});

test('ยังไม่มีปริมาตร = ยังไม่เสนอ', () => {
  for (const v of [0, null, undefined, '', 'x', -3]) assert.equal(suggestedPackageSize(v, SEED), null, String(v));
});

test('🔴 ขนาดที่หัวหน้าเลือกเอง (XS) ไม่ถูกเสนอเด็ดขาด — ต่อให้พื้นที่เล็กแค่ไหน', () => {
  assert.equal(suggestedPackageSize(1, SEED).code, 'SM');
  assert.equal(suggestedPackageSize(1, [XS]), null);
});

test('⭐ เพิ่มขนาดใหม่ในทะเบียน = ข้อเสนอเปลี่ยนตามทันที (MD ≤ 1,000 รับ 671.67 แทน ST)', () => {
  assert.deepEqual(suggestedPackageSize(671.67, [...SEED, MD]), { code: 'MD', qty: 1 });
  assert.deepEqual(suggestedPackageSize(1000.5, [...SEED, MD]), { code: 'ST', qty: 1 });
});

test('ไม่มีขนาดไม่มีเพดาน = พื้นที่ที่ใหญ่เกินทุกช่วงไม่มีข้อเสนอ (ลบ XL ทิ้ง) · ทะเบียนอ่านไม่ได้ = ไม่เสนอ', () => {
  assert.equal(suggestedPackageSize(5000, [XS, SM, ST]), null);
  assert.deepEqual(suggestedPackageSize(2000, [XS, SM, ST]), { code: 'ST', qty: 1 });
  assert.equal(suggestedPackageSize(200, null), null);
});

test('คำเตือนของทะเบียน: ไม่มีขนาดไม่มีเพดาน · ไม่มีขนาดที่ระบบเสนอเลย', () => {
  assert.deepEqual(packageRegistryWarnings(SEED), []);
  assert.deepEqual(packageRegistryWarnings([XS, SM, ST]), ['พื้นที่เกิน 2,400 ลบ.ม. ระบบจะไม่เสนอขนาด']);
  assert.match(packageRegistryWarnings([XS])[0], /ไม่มีขนาดที่ระบบเสนอ/);
});

test('สัดส่วนขนาดของทั้งใบ "SM 1 · ST 1" — เรียงตามทะเบียน · รหัสที่ถูกลบไปแล้วต่อท้าย', () => {
  assert.equal(packageMixText({ ST: 1, SM: 1 }, SEED), 'SM 1 · ST 1');
  assert.equal(packageMixText({ XL: 2, XS: 3, ZZ: 1 }, SEED), 'XS 3 · XL 2 · ZZ 1');
  assert.equal(packageMixText({ ST: 1, SM: 1 }, null), 'SM 1 · ST 1', 'ไม่มีทะเบียน = เรียงตามรหัส');
  assert.equal(packageMixText({}, SEED), '');
  assert.equal(packageMixText(null, SEED), '');
});

test('ข้อความ "ใบที่ยังไม่ส่งผลใช้ขนาดนี้" ของกล่องยืนยันลบและ audit', () => {
  assert.equal(packageSizeUsageText({ surveys: 3, zones: 5 }), 'ใบประเมินที่ยังไม่ส่งผล 3 ใบ (5 พื้นที่) ใช้ขนาดนี้');
  assert.equal(packageSizeUsageText(undefined), 'ไม่มีใบประเมินที่ยังไม่ส่งผลใช้ขนาดนี้');
  assert.equal(packageSizeUsageText({ surveys: 0, zones: 0 }), 'ไม่มีใบประเมินที่ยังไม่ส่งผลใช้ขนาดนี้');
});

/* ══ ③ การเคาะของหัวหน้า (route PUT + ร่างบนจอถามตัวเดียวกัน) ══════════════ */

test('⭐ เคาะตามที่ระบบเสนอ: ประทับขนาด + ที่ระบบเสนอ + "ไม่ใช่เลือกเอง" · ไม่ต้องมีเหตุผล', () => {
  const out = surveyPackageDecision(zone(), { packageSize: 'sm', packageQty: 1 }, SEED);
  assert.equal(out.error, null);
  assert.deepEqual(out.patch, {
    packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', packageSizeManual: false,
  });
});

test('🔴 ต่างจากที่ระบบเสนอต้องบอกเหตุผล — ทั้งขนาดและจำนวน (กติกา 0345 เดิม)', () => {
  const NOTE = 'แพ็คเกจต่างจากที่ระบบเสนอ — ต้องบอกเหตุผลด้วย';
  assert.equal(surveyPackageDecision(zone(), { packageSize: 'ST', packageQty: 1 }, SEED).error, NOTE);
  assert.equal(surveyPackageDecision(zone(), { packageSize: 'SM', packageQty: 2 }, SEED).error, NOTE);
  const ok = surveyPackageDecision(zone(), { packageSize: 'ST', packageQty: 1, packageNote: ' เพดานสูง ลมโกรก ' }, SEED);
  assert.equal(ok.error, null);
  assert.deepEqual(ok.patch, {
    packageQty: 1, packageSize: 'ST', packageSizeSuggested: 'SM', packageSizeManual: false, packageNote: 'เพดานสูง ลมโกรก',
  });
});

test('⭐ เลือก XS ให้ห้องน้ำไม่ต้องบอกเหตุผล — ประทับ "เลือกเอง" ลงแถว (แต่จำนวนที่ไม่ใช่ 1 ยังต้องบอก)', () => {
  const out = surveyPackageDecision(zone(), { packageSize: 'XS', packageQty: 1 }, SEED);
  assert.equal(out.error, null);
  assert.equal(out.patch.packageSizeManual, true);
  assert.equal(out.patch.packageSizeSuggested, 'SM');
  assert.match(surveyPackageDecision(zone(), { packageSize: 'XS', packageQty: 2 }, SEED).error, /ต้องบอกเหตุผล/);
});

test('ระบบเสนอไม่ได้ (ไม่มีปริมาตร/เกินทุกช่วง) = ไม่มีอะไรให้ "ต่าง" ⇒ ไม่ต้องมีเหตุผล', () => {
  const out = surveyPackageDecision(zone({ parts: [] }), { packageSize: 'ST', packageQty: 3 }, SEED);
  assert.equal(out.error, null);
  assert.equal(out.patch.packageSizeSuggested, null);
});

test('🔴 รหัสที่ไม่มีในทะเบียน = ตีกลับพร้อมบอกให้โหลดใหม่ · จำนวนต้องมีขนาด · ขนาดต้องมีจำนวน', () => {
  assert.equal(surveyPackageDecision(zone(), { packageSize: 'ZZ', packageQty: 1 }, SEED).error,
    'ไม่พบขนาดแพ็คเกจ ZZ ในทะเบียน — โหลดหน้าใหม่');
  assert.equal(surveyPackageDecision(zone(), { packageQty: 1, packageSize: null }, SEED).error, 'เลือกขนาดแพ็คเกจด้วย');
  assert.equal(surveyPackageDecision(zone(), { packageSize: 'SM' }, SEED).error, 'ระบุจำนวนแพ็คเกจด้วย');
  assert.match(surveyPackageDecision(zone(), { packageSize: 'SM', packageQty: 0 }, SEED).error, /จำนวนเต็มอย่างน้อย 1/);
  assert.match(surveyPackageDecision(zone(), { packageSize: 'SM', packageQty: 1.5 }, SEED).error, /จำนวนเต็มอย่างน้อย 1/);
  assert.match(surveyPackageDecision(zone(), { packageSize: 'SM', packageQty: 120 }, SEED).error, /พิมพ์ผิดหลัก/);
  assert.match(surveyPackageDecision(zone(), { packageNote: 'x'.repeat(501) }, SEED).error, /ยาวเกิน 500/);
});

/* แท็บที่เปิดค้างมาก่อน deploy ส่ง `{ packageQty, packageNote }` (ไม่มีคีย์ packageSize) — server ยังปฏิเสธเหมือนเดิม
   แต่ข้อความต้องบอกทางออกที่จอนั้นทำได้จริง: โหลดหน้าใหม่ (จอเก่าไม่มีแถบขนาด · ช่องเหตุผลโผล่ตามสูตร ÷2,400 เดิม) */
test('⚠️ คำขอจากจอรุ่นก่อน deploy (มีจำนวน ไม่มีคีย์ขนาด) — ยังตีกลับ และบอกให้โหลดหน้าใหม่', () => {
  const HINT = ' (หน้านี้เป็นรุ่นเก่า — โหลดหน้าใหม่แล้วเคาะอีกครั้ง)';
  // ยังไม่เคาะ: จอเก่าไม่มีแถบขนาดให้เลือก
  assert.equal(surveyPackageDecision(zone(), { packageQty: 1, packageNote: '' }, SEED).error, `เลือกขนาดแพ็คเกจด้วย${HINT}`);
  // back-fill ST แล้วจอเก่าเปลี่ยนจำนวน: server ประทับข้อเสนอสด ⇒ ต้องมีเหตุผล แต่จอเก่าอาจไม่มีช่องให้พิมพ์
  const legacy = zone({ packageQty: 1, packageSize: 'ST', packageSizeSuggested: null });
  const old = surveyPackageDecision(legacy, { packageQty: 2, packageNote: '' }, SEED);
  assert.equal(old.error, `แพ็คเกจต่างจากที่ระบบเสนอ — ต้องบอกเหตุผลด้วย${HINT}`);
  assert.equal(old.patch, null, 'ไม่มีอะไรถูกเขียน (fail-closed)');
  // จอรุ่นนี้ส่งคีย์ขนาดเสมอ (แม้เป็น null) ⇒ ข้อความล้วน — `needNote` ของจอเทียบข้อความนี้ตรง ๆ
  assert.equal(surveyPackageDecision(legacy, { packageQty: 2, packageSize: 'ST', packageNote: '' }, SEED).error,
    'แพ็คเกจต่างจากที่ระบบเสนอ — ต้องบอกเหตุผลด้วย');
  // จอเก่าล้างจำนวน / แก้เหตุผลอย่างเดียว = ยังทำได้ตามปกติ ไม่มีข้อความแถม
  assert.equal(surveyPackageDecision(legacy, { packageQty: null, packageNote: '' }, SEED).error, null);
  assert.equal(surveyPackageDecision(legacy, { packageNote: 'หมายเหตุ' }, SEED).error, null);
});

test('ล้างจำนวน = ล้างภาพนิ่งทั้งสามช่อง (แม้จอส่งขนาดเดิมมาด้วย)', () => {
  const decided = zone({ packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM' });
  for (const body of [{ packageQty: null }, { packageQty: '', packageSize: 'SM' }]) {
    const out = surveyPackageDecision(decided, body, SEED);
    assert.equal(out.error, null);
    assert.deepEqual(out.patch, {
      packageQty: null, packageSize: null, packageSizeSuggested: null, packageSizeManual: false,
    });
  }
});

test('🔑 ประทับใหม่เฉพาะเมื่อขนาดหรือจำนวน **เปลี่ยน** — แก้เหตุผลอย่างเดียวใช้ภาพนิ่งบนแถว', () => {
  // แถวเก่าก่อนมีขนาด (back-fill ST · ไม่มีที่ระบบเสนอ) — ส่งค่าเดิมซ้ำ/แก้เหตุผล ไม่ถูกประทับ ⇒ ไม่มีด่านเหตุผลโผล่มาเอง
  const legacy = zone({ packageQty: 3, packageSize: 'ST', packageSizeSuggested: null, packageNote: 'เดิม' });
  const noteOnly = surveyPackageDecision(legacy, { packageQty: 3, packageSize: 'ST', packageNote: '' }, SEED);
  assert.equal(noteOnly.error, null);
  assert.deepEqual(noteOnly.patch, { packageQty: 3, packageSize: 'ST', packageNote: null });
  // เปลี่ยนจำนวน = ประทับที่ระบบเสนอ ณ ตอนนี้ ⇒ ด่านเหตุผลกลับมาทำงาน
  assert.match(surveyPackageDecision(legacy, { packageQty: 2, packageNote: '' }, SEED).error, /ต้องบอกเหตุผล/);
  // ลบเหตุผลของแถวที่เคาะต่างไว้แล้ว = ติด (ตรวจจากค่าหลังรวม)
  const differs = zone({ packageQty: 1, packageSize: 'ST', packageSizeSuggested: 'SM', packageNote: 'เพดานสูง' });
  assert.match(surveyPackageDecision(differs, { packageNote: '' }, SEED).error, /ต้องบอกเหตุผล/);
});

test('🔴 ขนาดที่เคาะไว้ถูกลบจากทะเบียนแล้ว — เปลี่ยนจำนวนโดยไม่เลือกขนาดใหม่ = ตีกลับ', () => {
  const gone = zone({ packageQty: 1, packageSize: 'ST', packageSizeSuggested: 'ST' });
  assert.equal(surveyPackageDecision(gone, { packageQty: 2, packageNote: 'x' }, [XS, SM, XL]).error,
    'ขนาดแพ็คเกจ ST ถูกลบจากทะเบียนแล้ว — เลือกใหม่');
  assert.equal(surveyPackageDecision(gone, { packageSize: 'SM', packageQty: 1 }, [XS, SM, XL]).error, null);
});

test('⚠️ อ่านทะเบียนไม่สำเร็จ = เคาะขนาด/จำนวนไม่ได้ (fail-closed) · แก้เหตุผลอย่างเดียวยังได้', () => {
  const down = surveyPackageDecision(zone(), { packageSize: 'SM', packageQty: 1 }, null);
  assert.equal(down.error, PACKAGE_SIZE_REGISTRY_DOWN);
  assert.equal(down.registryDown, true);
  const decided = zone({ packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM' });
  assert.equal(surveyPackageDecision(decided, { packageNote: 'หมายเหตุเพิ่ม' }, null).error, null);
});

test('ไม่มีช่องแพ็คเกจใน body = ไม่มี patch (route ไปตรวจช่องจุดติดตั้งต่อเอง)', () => {
  assert.deepEqual(surveyPackageDecision(zone(), { selectedSpotIds: ['s1'] }, SEED), { patch: {}, error: null });
});

/* ══ ③ข วัดใหม่หลังหัวหน้าเคาะ — route PATCH ของช่างประทับ "ที่ระบบเสนอ" ใหม่ ══════════════
   🐞 review PR-P: ภาพนิ่งประทับเฉพาะตอนเคาะ ⇒ ช่างวัดใหม่ทีหลัง ด่านเหตุผล (mig 0345) หลับ — ก่อนมีขนาดกติกานี้คิดสดจาก `parts` */
/* แถวหลัง PATCH ของช่าง = แถวเดิม + ส่วนใหม่ + สิ่งที่ตัวตัดสินสั่งประทับ (route ทำ `Object.assign(patch, restamp.patch)`) */
const remeasured = (row, parts, sizes = SEED) => ({ ...row, parts, ...surveyRemeasureStamp(row, parts, sizes).patch });
const packageGate = (row) => surveyGateChecklist([row], {}).find((g) => g.key === 'package');
const BIG = [part(30, 30, 4)]; // 3,600 ลบ.ม. ⇒ ระบบเสนอ XL

test('🔴 เคาะ SM × 1 ตามที่เสนอ แล้วช่างวัดใหม่ได้ 3,600 ลบ.ม. — ภาพนิ่งเป็น XL · ด่านแพ็คเกจถามเหตุผล · ช่องเหตุผลโผล่', () => {
  const row = zone({ packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM' });
  assert.equal(packageGate(row).ok, true, 'ก่อนวัดใหม่: ตรงกับที่เสนอ ไม่ต้องมีเหตุผล');

  const out = surveyRemeasureStamp(row, BIG, SEED);
  assert.equal(out.error, null);
  assert.deepEqual(out.patch, { packageSizeSuggested: 'XL' }, 'ประทับช่องเดียว — ขนาด/จำนวน/เลือกเอง ของหัวหน้าไม่ถูกแตะ');
  assert.equal(out.summary, ' · วัดใหม่หลังเคาะ: ระบบเสนอขนาด SM → XL');

  const after = remeasured(row, BIG);
  assert.equal(after.packageSize, 'SM');
  assert.equal(after.packageQty, 1);
  assert.equal(packageGate(after).ok, false, 'ไม่มีเหตุผล = ส่งผลไม่ได้');
  assert.equal(surveyPackageCell(after, null, { sizes: SEED, canDecide: true }).needNote, true);
  // ฝ่ายขาย (ดูอย่างเดียว) เห็นบรรทัด "ระบบเสนอ" จากภาพนิ่งใหม่
  assert.equal(surveyPackageCell(after, null, { sizes: SEED, canDecide: false }).hint, 'ระบบเสนอ XL · 1 แพ็ค');
  // หัวหน้าพิมพ์เหตุผลอย่างเดียว (ขนาด/จำนวนเดิม) = ผ่าน ทั้งด่านบันทึกและด่านส่งผล
  const noted = surveyPackageDecision(after, { packageQty: 1, packageSize: 'SM', packageNote: 'ติดตั้งได้จุดเดียว' }, SEED);
  assert.equal(noted.error, null);
  assert.equal(packageGate({ ...after, ...noted.patch }).ok, true);
});

test('🔴 เคาะก่อนมีปริมาตร (ภาพนิ่งว่าง) แล้วค่อยวัด — XS × 4 บนพื้นที่ 3,600 ลบ.ม. ต้องมีเหตุผล', () => {
  const early = surveyPackageDecision(zone({ parts: [] }), { packageSize: 'XS', packageQty: 4 }, SEED);
  assert.equal(early.error, null, 'ยังไม่มีปริมาตร = ระบบยังไม่เสนอ ⇒ ไม่มีอะไรให้ต่าง');
  const row = zone({ parts: [], ...early.patch });
  assert.equal(row.packageSizeSuggested, null);

  const after = remeasured(row, BIG);
  assert.equal(after.packageSizeSuggested, 'XL');
  assert.equal(after.packageSizeManual, true, 'ธง "เลือกเอง" ของหัวหน้าอยู่เหมือนเดิม');
  assert.equal(packageGate(after).ok, false, 'จำนวนไม่ใช่ 1 = ต้องบอกเหตุผล แม้เป็นขนาดที่เลือกเอง');
  // XS × 1 (ห้องน้ำ) วัดทีหลัง = ยังไม่ต้องมีเหตุผล (ขนาดที่ระบบไม่มีวันเสนอ)
  const restroom = zone({ parts: [], packageQty: 1, packageSize: 'XS', packageSizeManual: true });
  assert.equal(packageGate(remeasured(restroom, [part(2, 2, 3)])).ok, true);
});

test('แถว back-fill ST (ภาพนิ่งว่าง) ที่ถูกวัดใหม่จนปริมาตรเปลี่ยน = เข้ากติกาปกติ · ปริมาตรเท่าเดิมไม่ถูกย้อนบังคับ', () => {
  const legacy = zone({ packageQty: 1, packageSize: 'ST', packageSizeSuggested: null });
  // แก้ชื่อส่วน/สลับช่อง ปริมาตร 200 เท่าเดิม ⇒ ไม่อ่านทะเบียน ไม่ประทับ
  const renamed = [{ ...part(10, 10, 2), label: 'โถงหน้า' }];
  assert.equal(surveyRemeasureTouchesSuggestion(legacy, renamed), false);
  assert.deepEqual(surveyRemeasureStamp(legacy, renamed, null), { patch: {}, error: null, summary: '' });
  assert.deepEqual(surveyRemeasureStamp(legacy, [part(2, 10, 10)], SEED).patch, {});
  // ปริมาตรเปลี่ยน (200 → 150 ยังเป็น SM) ⇒ ประทับ SM ⇒ ST ที่ถืออยู่ต้องมีเหตุผล
  const after = remeasured(legacy, [part(10, 5, 3)]);
  assert.equal(after.packageSizeSuggested, 'SM');
  assert.equal(packageGate(after).ok, false);
});

test('วัดใหม่แต่ข้อเสนอยังเป็นขนาดเดิม = ประทับค่าเดิม ไม่มีท่อนสรุป audit · ทะเบียนที่ถูกแก้ไม่ย้อนบังคับแถวที่ปริมาตรเท่าเดิม', () => {
  const row = zone({ packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM' });
  const out = surveyRemeasureStamp(row, [part(10, 10, 2.5)], SEED); // 250 ลบ.ม. ยังเป็น SM
  assert.deepEqual(out, { patch: { packageSizeSuggested: 'SM' }, error: null, summary: '' });
  assert.equal(packageGate(remeasured(row, [part(10, 10, 2.5)])).ok, true);
  // ทะเบียนถูกแก้จน 200 ลบ.ม. ตกช่วง TN — ช่างบันทึกซ้ำโดยปริมาตรเท่าเดิม ต้องไม่ทำให้แถวที่เคาะแล้วต้องมีเหตุผลขึ้นมาเอง
  const edited = [{ code: 'TN', nameEn: 'Tiny', maxCbm: 250, autoSuggest: true }, ...SEED];
  assert.deepEqual(surveyRemeasureStamp(row, row.parts, edited).patch, {});
});

test('ยังไม่เคาะ / คำขอไม่แตะขนาด = ไม่มีอะไรให้ประทับ (PUT ประทับเองตอนเคาะ)', () => {
  assert.equal(surveyRemeasureTouchesSuggestion(zone(), BIG), false);
  assert.deepEqual(surveyRemeasureStamp(zone(), BIG, SEED).patch, {});
  const row = zone({ packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM' });
  assert.equal(surveyRemeasureTouchesSuggestion(row, undefined), false);
  assert.deepEqual(surveyRemeasureStamp(row, undefined, SEED).patch, {});
});

test('🔴 วัดใหม่แล้วอ่านทะเบียนไม่สำเร็จ = ไม่ให้บันทึก (ห้ามปล่อยภาพนิ่งเก่าค้าง) · ลบจนไม่เหลือปริมาตร = ล้างภาพนิ่งโดยไม่ต้องถามทะเบียน', () => {
  const row = zone({ packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM' });
  const down = surveyRemeasureStamp(row, BIG, null);
  assert.equal(down.patch, null);
  assert.equal(down.error, PACKAGE_SIZE_REGISTRY_DOWN);
  assert.equal(down.registryDown, true);
  const cleared = surveyRemeasureStamp(row, [], null);
  assert.deepEqual(cleared.patch, { packageSizeSuggested: null });
  assert.equal(cleared.error, null);
  assert.equal(cleared.summary, ' · วัดใหม่หลังเคาะ: ระบบเสนอขนาด SM → —');
  // เกินทุกช่วงและไม่มีขนาดไม่มีเพดาน (XL ถูกลบ) = ระบบเสนอไม่ได้ ⇒ ภาพนิ่งว่าง ไม่มีอะไรให้ต่าง
  assert.deepEqual(surveyRemeasureStamp(row, BIG, [XS, SM, ST]).patch, { packageSizeSuggested: null });
});

/* ══ ④ ขนาดถูกลบจากทะเบียน — ด่านส่งผล ════════════════════════════════════ */

const decided = (over = {}) => zone({ packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM', ...over });

test('ทุกขนาดที่เคาะยังอยู่ในทะเบียน = แถวด่านผ่าน · ทรงเดียวกับแถวด่านรูปจุด', () => {
  const rows = [decided({ id: 'A' }), decided({ id: 'B', zoneName: 'โถง', packageSize: 'ST' })];
  const gates = surveyPackageSizeGates(rows, SEED);
  assert.equal(gates.length, 1);
  assert.deepEqual(gates[0], {
    // `short` = สิ่งที่ต้องทำ (บรรทัด "หัวหน้าต้องทำ: …" ของการ์ด) ไม่ใช่สภาพ "ขนาดถูกลบ" (UAT PR-P 01/10)
    key: 'packageSizeGone', owner: 'head', short: 'เลือกขนาดใหม่', label: 'ขนาดแพ็คเกจที่เคาะยังอยู่ในทะเบียน',
    ok: true, done: 2, total: 2, zones: [], zoneIds: [], count: 0, reason: null,
  });
  assert.equal(surveyPackageSizeSendError(rows, SEED), null);
});

test('🔴 ขนาดถูกลบจากทะเบียน = ส่งผลไม่ได้ พร้อมเหตุที่บอกรหัสและชื่อพื้นที่', () => {
  const rows = [
    decided({ id: 'A', zoneName: 'ล็อบบี้', packageSize: 'ST' }),
    decided({ id: 'B', zoneName: 'โถงลิฟต์', packageSize: 'ST' }),
    decided({ id: 'C', zoneName: 'ห้องประชุม' }),
  ];
  const [gate] = surveyPackageSizeGates(rows, [XS, SM, XL]);
  assert.equal(gate.ok, false);
  assert.equal(gate.owner, 'head', 'หัวหน้าแก้เองได้ ไม่ต้องส่งกลับให้ช่าง');
  assert.deepEqual(gate.zones, ['ล็อบบี้', 'โถงลิฟต์']);
  assert.deepEqual(gate.zoneIds, ['A', 'B']);
  assert.equal(gate.count, 2);
  assert.equal(gate.done, 1);
  assert.equal(gate.total, 3);
  assert.equal(gate.reason, 'ขนาดแพ็คเกจ ST ถูกลบจากทะเบียนแล้ว — เลือกใหม่ (ล็อบบี้ · โถงลิฟต์)');
  assert.equal(surveyPackageSizeSendError(rows, [XS, SM, XL]), gate.reason);
});

test('หลายรหัสถูกลบ = บอกทุกรหัส · พื้นที่ที่ถูกตัดออก/ยังไม่เคาะ ไม่นับ', () => {
  const rows = [
    decided({ id: 'A', zoneName: 'ล็อบบี้', packageSize: 'ST' }),
    decided({ id: 'B', zoneName: 'ห้องน้ำ', packageSize: 'XS' }),
    decided({ id: 'C', zoneName: 'ลานจอด', packageSize: 'ST', status: 'cut' }),
    zone({ id: 'D', zoneName: 'ยังไม่เคาะ' }),
  ];
  const [gate] = surveyPackageSizeGates(rows, [SM, XL]);
  assert.equal(gate.reason,
    'ขนาดแพ็คเกจ ST ถูกลบจากทะเบียนแล้ว — เลือกใหม่ (ล็อบบี้) | ขนาดแพ็คเกจ XS ถูกลบจากทะเบียนแล้ว — เลือกใหม่ (ห้องน้ำ)');
  assert.equal(gate.total, 3, 'พื้นที่ที่ตัดออกไม่อยู่ในใบแล้ว');
  assert.deepEqual(gate.zoneIds, ['A', 'B']);
});

test('⚠️ อ่านทะเบียนไม่สำเร็จ = ด่านไม่ผ่าน (fail-closed) — ไม่รู้ว่าขนาดยังอยู่ไหม ห้ามปล่อยส่ง', () => {
  const rows = [decided({ id: 'A' })];
  for (const sizes of [null, undefined]) {
    const [gate] = surveyPackageSizeGates(rows, sizes);
    assert.equal(gate.ok, false);
    assert.equal(gate.reason, PACKAGE_SIZE_REGISTRY_DOWN);
    assert.deepEqual(gate.zoneIds, ['A']);
    assert.equal(surveyPackageSizeSendError(rows, sizes), PACKAGE_SIZE_REGISTRY_DOWN);
  }
  assert.equal(PACKAGE_SIZE_REGISTRY_DOWN, 'อ่านทะเบียนขนาดแพ็คเกจไม่สำเร็จ — ลองใหม่');
  // ยังไม่มีแถวไหนเคาะขนาด = ไม่มีอะไรให้ตรวจ (ด่าน "แพ็คเกจ" ของหกข้อบล็อกอยู่แล้ว)
  assert.equal(surveyPackageSizeGates([zone()], null)[0].ok, true);
});

/* ══ ⑤ ขนาดที่ไม่เคยถูกเทียบกับข้อเสนอของระบบ (back-fill ST ของ 0398) — UAT PR-P 01/10 ═══════════════ */

/* 🐞 บรรทัดทักเคยอยู่เฉพาะในแถวของตาราง ⇒ การ์ดขึ้น "ผ่านครบ" ปุ่มส่งเป็นกรมท่า โมดัลไม่พูดถึง — ตัวตัดสินนี้ให้ทั้งสามที่อ่านร่วมกัน */
test('🔴 แถวที่ต้องทักก่อนส่งผล: เคาะแล้ว · ไม่มีภาพนิ่ง "ที่ระบบเสนอ" · ขนาดยังอยู่ในทะเบียน · ระบบเสนอขนาดอื่น', () => {
  const backfill = zone({ id: 'B', zoneName: 'MeetingRoom1', packageQty: 1, packageSize: 'ST' }); // 200 ลบ.ม. ⇒ เสนอ SM
  assert.deepEqual(packageSizeUnchecked(backfill, SEED), { code: 'SM', qty: 1 });
  const rows = [zone({ id: 'A', packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM' }), backfill];
  assert.deepEqual(surveyPackageReviewRows(rows, SEED), [{ zoneId: 'B', zoneName: 'MeetingRoom1', size: 'ST', suggested: 'SM' }]);
  assert.equal(surveyPackageReviewText(surveyPackageReviewRows(rows, SEED)),
    'ขนาดที่ตั้งไว้ก่อนมีข้อเสนอของระบบ 1 พื้นที่ — MeetingRoom1 ยังเป็น ST (ระบบเสนอ SM)');
  assert.equal(surveyPackageReviewText([]), null);

  // ไม่ทัก — แต่ละข้อมีเหตุของมัน
  const quiet = (over, sizes = SEED) => packageSizeUnchecked(zone({ packageQty: 1, packageSize: 'ST', ...over }), sizes);
  assert.equal(quiet({ packageSizeSuggested: 'SM' }), null, 'มีภาพนิ่ง = หัวหน้าเคาะหลังมีขนาด (ด่านเหตุผลดูแลเอง)');
  assert.equal(quiet({ parts: [part(20, 20, 3)] }), null, 'ระบบก็เสนอ ST');
  assert.equal(quiet({ status: 'cut' }), null, 'พื้นที่ที่ถูกตัดออก');
  assert.equal(quiet({ packageQty: null }), null, 'ยังไม่เคาะ');
  assert.equal(quiet({ parts: [] }), null, 'ยังไม่มีปริมาตร ระบบเสนอไม่ได้');
  assert.equal(quiet({}, [XS, SM, XL]), null, 'ขนาดถูกลบ = ด่านของมันเอง ไม่ซ้อนสองข้อความ');
  assert.equal(quiet({}, null), null, 'อ่านทะเบียนไม่ได้ = ไม่รู้ ไม่ทัก (ด่านทะเบียนบล็อกอยู่แล้ว)');
  // จำนวนที่ไม่ใช่ 1 บนแถวเก่า แต่ขนาดตรงข้อเสนอ = เลขที่หัวหน้าเคาะเองจริง — ไม่ทัก
  assert.equal(packageSizeUnchecked(zone({ parts: [part(20, 20, 3)], packageQty: 2, packageSize: 'ST' }), SEED), null);
  // ตัวเดียวกับบรรทัดทักในแถว
  assert.equal(surveyPackageCell(backfill, null, { sizes: SEED, canDecide: true }).reviewText, 'ST ตั้งไว้ก่อนมีข้อเสนอของระบบ — ตรวจขนาดก่อนส่งผล');
});
