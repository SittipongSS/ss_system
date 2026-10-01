// ── ตรรกะใบประเมินพื้นที่ (mig 0314) — ตัวเลขล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SURVEY_DOC_PLAN,
  SURVEY_DOC_WIDE,
  normalizeSurveyPart,
  packageNeedsNote,
  parseSurveyMeters,
  spotCounts,
  surveyEditLockError,
  surveyRecallError,
  surveyTotalsDiff,
  surveyFieldMissing,
  surveyFieldProgress,
  surveyFieldSubmitError,
  surveyGateChecklist,
  surveyPackageMixText,
  surveyPackagesText,
  surveyPartLetter,
  surveyResultMissing,
  surveySendError,
  surveyTotals,
  surveyZoneName,
  surveyZonePackageText,
  surveyZoneSize,
  surveyZoneSuggestedDiffText,
  surveyZoneSummary,
  surveyZoneSavePayload,
} from './survey.js';

const part = (w, l, h, label = null) => ({ widthM: w, lengthM: l, heightM: h, label });

// ── ส่วนของพื้นที่ ───────────────────────────────────────────────────────
test('ส่วนที่กรอกไม่ครบสามช่อง = แถวเสีย ต้องตีกลับ ไม่ใช่คิดเป็น 0', () => {
  assert.match(normalizeSurveyPart({ widthM: 3, lengthM: 4 }).error, /ต้องระบุสูง/);
  assert.match(normalizeSurveyPart({ widthM: 3, lengthM: 4, heightM: 0 }).error, /สูงต้องมากกว่า 0/);
  assert.equal(normalizeSurveyPart(part(3, 4, 2.8)).error, null);
});

test('เพดานกันพิมพ์ผิดหลัก — 500 ม. คือสนามบิน ไม่ใช่โซนในห้าง', () => {
  assert.match(normalizeSurveyPart(part(3, 4, 900)).error, /พิมพ์ผิดหลัก/);
});

/* 🐞 ช่องว่างจากจอเป็น `''` ไม่ใช่ `undefined` — `Number('')` = 0 ⇒ เดิมช่องที่ไม่ได้กรอก
   ถูกฟ้องว่า "ต้องมากกว่า 0" ทั้งที่ช่างไม่ได้พิมพ์ 0 · ช่องว่างต้องได้คำว่า "ต้องระบุ" */
test('ช่องว่าง = ยังไม่ได้ระบุ · พิมพ์มั่ว = ไม่ใช่ตัวเลข · 0 = ต้องมากกว่า 0 — สามเหตุ สามคำ', () => {
  assert.match(normalizeSurveyPart({ widthM: '3', lengthM: '4', heightM: '' }).error, /ต้องระบุสูง/);
  assert.match(normalizeSurveyPart({ widthM: '3', lengthM: '4', heightM: null }).error, /ต้องระบุสูง/);
  assert.match(normalizeSurveyPart({ widthM: 'x', lengthM: '4', heightM: '3' }).error, /กว้างต้องเป็นตัวเลข/);
  assert.match(normalizeSurveyPart({ widthM: '0', lengthM: '4', heightM: '3' }).error, /กว้างต้องมากกว่า 0/);
  assert.equal(normalizeSurveyPart({ widthM: '7,5', lengthM: '4', heightM: '3' }).value.widthM, 7.5);
  assert.equal(normalizeSurveyPart(null).error, 'ส่วนของพื้นที่: ต้องระบุกว้าง (เมตร)', 'null ต้องถูกตีกลับ ไม่ใช่ TypeError 500');
});

/* ⭐ แป้นทศนิยมของมือถือบางภาษาให้ "," แทน "." — ช่างพิมพ์ 7,5 หมายถึง 7.5 เสมอ
   (เพดาน 500 ม. ⇒ ไม่มีค่าจริงที่ต้องใช้ "," คั่นหลักพัน) */
test('แปลงตัวเลขเมตรจากช่องกรอก', () => {
  assert.equal(parseSurveyMeters(''), null);
  assert.equal(parseSurveyMeters('   '), null);
  assert.equal(parseSurveyMeters(null), null);
  assert.equal(parseSurveyMeters(undefined), null);
  assert.equal(parseSurveyMeters('7,5'), 7.5);
  assert.equal(parseSurveyMeters(' 2.80 '), 2.8);
  assert.equal(parseSurveyMeters(12), 12);
  assert.ok(Number.isNaN(parseSurveyMeters('x')));
  assert.ok(Number.isNaN(parseSurveyMeters('1,2,3')));
  assert.ok(Number.isNaN(parseSurveyMeters('Infinity')));
});

/* 🐞 UAT 25/09 — ช่องเป็นข้อความอิสระแล้ว (ไม่ใช่ type=number ที่เบราว์เซอร์กรองให้) ⇒ `Number()` รับรูปที่ช่าง
   ไม่ได้ตั้งใจ: '0x1F' → 31 · '1e2' → 100 · '+5' → 5 · และ **'1,200' → 1.2** — พิมพ์ผิดหน่วยแบบคั่นหลักพัน
   หลบเพดาน 500 ม. ไปเงียบ ๆ แล้วไหลเข้าพื้นที่/ปริมาตร/แพ็คเกจ ⇒ รับเฉพาะเลขล้วน + ทศนิยมหนึ่งตัว (จุด/จุลภาค)
   · รูปหลักพันที่กำกวม = ไม่รับ และข้อความบอกให้ใช้จุด */
test('🐞 แปลงเมตร: ฐานสิบหก · เลขชี้กำลัง · เครื่องหมาย · คั่นหลักพัน = ไม่ใช่ตัวเลข', () => {
  for (const raw of ['0x1F', '1e2', '+5', '1,200', '1,000', '12,500', '1.2.3', '1 200', '.', ',', '-']) {
    assert.ok(Number.isNaN(parseSurveyMeters(raw)), raw);
  }
  // ⚠️ รูปที่เป็นตัวเลขจริงยังเป็นตัวเลข — '.5' / '5.' (ช่อง type=number เดิมก็รับ) · ติดลบ = ตัวเลขที่ด่าน "ต้องมากกว่า 0" ตอบ
  //   (ถ้าเป็น NaN ช่างจะได้คำว่า "ต้องเป็นตัวเลข" ทั้งที่พิมพ์ตัวเลข)
  assert.equal(parseSurveyMeters('.5'), 0.5);
  assert.equal(parseSurveyMeters(',5'), 0.5);
  assert.equal(parseSurveyMeters('5.'), 5);
  assert.equal(parseSurveyMeters('-5'), -5);
  // จุลภาคทศนิยมที่ไม่ใช่รูปหลักพันยังรับ — แป้นทศนิยมของบางภาษา
  assert.equal(parseSurveyMeters('1,25'), 1.25);
  assert.equal(parseSurveyMeters('12,5'), 12.5);
  assert.equal(parseSurveyMeters('0,125'), 0.125, 'ขึ้นต้นด้วย 0 ไม่มีทางเป็นหลักพัน');
  assert.equal(parseSurveyMeters('2.125'), 2.125, 'จุดไม่กำกวม — สามตำแหน่งก็ทศนิยม');
  assert.equal(parseSurveyMeters('7'), 7);
});

test('🐞 จอ: "1,200" ถูกตีกลับพร้อมบอกให้ใช้จุดทศนิยม · ค่าพิมพ์มั่วอื่นได้คำเดิม', () => {
  const size = (widthM) => surveyZoneSavePayload({ parts: [{ label: '', widthM, lengthM: '4', heightM: '3' }] });
  const text = size('1,200').blocker;
  assert.match(text, /^ส่วน A ความกว้างต้องเป็นตัวเลข/);
  assert.match(text, /1,200 อ่านได้ทั้ง 1\.2 และ 1200/);
  assert.match(text, /ทศนิยมให้ใช้จุด/);
  assert.equal(size('x').blocker, 'ส่วน A ความกว้างต้องเป็นตัวเลข');
  assert.match(normalizeSurveyPart({ widthM: '1,200', lengthM: '4', heightM: '3' }).error, /ทศนิยมให้ใช้จุด/,
    'server พูดเหมือนจอ (แท็บเก่าที่ส่งข้อความดิบ)');
});

test('ชื่อส่วนบนจอเป็นตัวอักษร A B C… ตามลำดับแถว', () => {
  assert.equal(surveyPartLetter(0), 'A');
  assert.equal(surveyPartLetter(1), 'B');
  assert.equal(surveyPartLetter(19), 'T');
  assert.equal(surveyPartLetter(26), '27', 'เกินตัวอักษรแล้วใช้เลขลำดับ ไม่ใช่ undefined');
});

// ── ⭐ หนึ่งพื้นที่วัดได้หลายส่วน ────────────────────────────────────────
test('⭐ รูปตัว L — สองส่วนบวกกัน', () => {
  const s = surveyZoneSize([part(12.4, 18, 2.8, 'ปีกทิศเหนือ'), part(8, 15.5, 2.8, 'ปีกทิศตะวันออก')]);
  assert.equal(s.areaSqm, 347.2);
  assert.equal(s.volumeCbm, 972.16);
  assert.equal(s.complete, true);
});

test('⭐ ความสูงอยู่รายส่วน — ล็อบบี้โถงกลางสูง ทางเดินข้างเตี้ย', () => {
  const two = surveyZoneSize([part(18, 20, 6.5, 'โถงกลาง'), part(18, 4, 2.6, 'ทางเดินข้าง')]);
  const one = surveyZoneSize([part(18, 24, 6.5)]);
  assert.equal(two.areaSqm, one.areaSqm);          // พื้นที่เท่ากันเป๊ะ
  assert.equal(two.volumeCbm, 2527.2);
  assert.equal(one.volumeCbm, 2808);
  // บังคับสูงเดียวทั้งพื้นที่ = ปริมาตรเกินจริง 11%
  assert.ok((one.volumeCbm - two.volumeCbm) / one.volumeCbm > 0.1);
});

test('ส่วนที่ยังไม่ได้วัดถูกข้าม แต่ทำให้ยังไม่ complete', () => {
  const s = surveyZoneSize([part(3, 4, 2.8), { widthM: null, lengthM: null, heightM: null }]);
  assert.equal(s.measuredParts, 1);
  assert.equal(s.complete, false);
});

// ── 🔄 สูตร 2,400 ลบ.ม. = 1 แพ็คเกจ ถอดแล้ว (มติเจ้าของ 01/10 · mig 0398) ─────────────
/* พื้นที่หนึ่งมี **ขนาดเดียว + จำนวน** — ขนาดเสนอจากช่วง ลบ.ม. ของทะเบียน (`suggestedPackageSize` · packageSizes.js)
   ⇒ ไฟล์กฎของใบประเมินต้องไม่เหลือสูตรหารและต้องไม่รู้จักทะเบียน (ทุกด่านที่นี่อ่านจากแถวล้วน) */
test('🔄 สูตร ceil(ลบ.ม. ÷ 2,400) ไม่มีแล้ว — survey.js ไม่ส่งออกสูตรและไม่ import ทะเบียนขนาด', async () => {
  const mod = await import('./survey.js');
  assert.equal(mod.suggestedPackages, undefined);
  assert.equal(mod.CBM_PER_PACKAGE, undefined);
  const src = readFileSync(new URL('./survey.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(src, /2400|Math\.ceil\(/, 'ห้ามมีสูตรหารปริมาตรกลับมา');
  assert.doesNotMatch(src, /^import [^;]*packageSizes/m, 'survey.js ต้องไม่ import ทะเบียนขนาด — packageSizes.js เป็นฝ่าย import ไฟล์นี้ (กันวงวน)');
});

test('🔴 ปริมาตรของพื้นที่ = ผลรวมทุกส่วน — ขนาดเสนอจากยอดรวมของพื้นที่ ไม่ใช่รายส่วน', () => {
  const s = surveyZoneSize([part(10, 10, 1), part(10, 10, 1)]);
  assert.equal(s.volumeCbm, 200);
});

test('⭐ ยอดรวมแยกตามขนาด — คิดรายพื้นที่ (กลิ่นไม่ข้ามผนัง) · แถวที่ยังไม่มีขนาดไม่เข้าสัดส่วน', () => {
  const rows = [
    { parts: [part(12.4, 18, 2.8), part(8, 15.5, 2.8)], packageQty: 1, packageSize: 'ST' },
    { parts: [part(9, 14, 2.8)], packageQty: 1, packageSize: 'ST' },
    { parts: [part(4.2, 6, 2.8)], packageQty: 1, packageSize: 'sm' },
    { parts: [part(30, 40, 6)], packageQty: 2, packageSize: 'XL' },
    { parts: [part(3, 3, 3)], packageQty: 1 },                       // เคาะจำนวนด้วยโค้ดเก่า ยังไม่มีขนาด
    { parts: [part(3, 3, 3)], packageQty: 9, packageSize: 'ST', status: 'cut' },
  ];
  const t = surveyTotals(rows);
  assert.equal(t.packageQty, 6);
  assert.deepEqual(t.packagesBySize, { ST: 2, SM: 1, XL: 2 });
  assert.equal(t.suggestedPackages, undefined, 'ยอด "สูตรบอก" ไม่มีแล้ว');
  assert.equal(surveyPackageMixText(t.packagesBySize), 'SM 1 · ST 2 · XL 2', 'ไม่มีลำดับทะเบียน = เรียงตามรหัส');
  assert.equal(surveyPackageMixText(t.packagesBySize, ['XL', 'ST']), 'XL 2 · ST 2 · SM 1', 'รหัสนอกลำดับต่อท้าย');
  assert.equal(surveyPackagesText(t), '6 แพ็คเกจ (SM 1 · ST 2 · XL 2)');
  // ยอดที่ตรึงไว้ก่อนมีขนาด (meta ของแถวดึงกลับรุ่นเก่า) = ตัวเลขล้วนเหมือนเดิม
  assert.equal(surveyPackagesText({ packageQty: 3 }), '3 แพ็คเกจ');
  assert.equal(surveyPackagesText(null), '0 แพ็คเกจ');
});

/* ── ถ้อยคำของช่องแพ็คเกจบนทุกจอที่ **อ่าน** ผล (หน้าคำร้องฝ่ายขาย · ทะเบียนโซน · ตัวเลือกพื้นที่ · ตารางดูอย่างเดียว) ── */
test('⭐ "SM · 1 แพ็ค" — ขนาด + จำนวนที่หัวหน้าเคาะ · ยังไม่เคาะ = null · แถวก่อนมีขนาด = จำนวนล้วน', () => {
  assert.equal(surveyZonePackageText({ packageSize: 'sm', packageQty: 1 }), 'SM · 1 แพ็ค');
  assert.equal(surveyZonePackageText({ packageSize: 'ST', packageQty: 2 }, { unit: false }), 'ST · 2', 'หัวคอลัมน์บอกหน่วยแล้ว');
  // เคาะด้วยโค้ดเก่า (ยังไม่ back-fill) — จำนวนต้องยังอ่านได้ ไม่ใช่ขีด
  assert.equal(surveyZonePackageText({ packageQty: 3 }), '3 แพ็ค');
  assert.equal(surveyZonePackageText({ packageQty: 3 }, { unit: false }), '3');
  // ยังไม่เคาะ = null ให้จอใส่ขีดเอง · ขนาดที่ไม่มีจำนวนไม่ใช่การเคาะ
  for (const row of [null, {}, { packageQty: null }, { packageQty: 0 }, { packageSize: 'SM' }, { packageSize: 'SM', packageQty: '' }]) {
    assert.equal(surveyZonePackageText(row), null, JSON.stringify(row));
  }
});

test('⭐ "ระบบเสนอ SM · 1 แพ็ค" ขึ้นเฉพาะเมื่อที่เคาะต่างจากที่ระบบเสนอ — ตรงกัน/ไม่มีภาพนิ่ง = null', () => {
  // ตรงกับที่เสนอทั้งขนาดและจำนวน = ไม่มีบรรทัด (บรรทัดที่พูดซ้ำค่าหลักคือเสียงรบกวน)
  assert.equal(surveyZoneSuggestedDiffText({ packageSize: 'SM', packageQty: 1, packageSizeSuggested: 'SM' }), null);
  // ขนาดต่าง
  assert.equal(surveyZoneSuggestedDiffText({ packageSize: 'ST', packageQty: 1, packageSizeSuggested: 'SM' }), 'ระบบเสนอ SM · 1 แพ็ค');
  // ขนาดตรง แต่จำนวนไม่ใช่ 1 — ระบบเสนอ 1 แพ็คเสมอ
  assert.equal(surveyZoneSuggestedDiffText({ packageSize: 'SM', packageQty: 2, packageSizeSuggested: 'sm' }, { unit: false }), 'ระบบเสนอ SM · 1');
  // XS ที่หัวหน้าเลือกเองก็ยังบอกว่าระบบเสนออะไร (ต่างได้ ไม่ต้องมีเหตุผล แต่ต้องเห็นว่าต่าง)
  assert.equal(surveyZoneSuggestedDiffText({ packageSize: 'XS', packageQty: 1, packageSizeSuggested: 'SM', packageSizeManual: true }), 'ระบบเสนอ SM · 1 แพ็ค');
  // แถวของหน้าคำร้อง (`surveyZoneFacts`) เรียกภาพนิ่งว่า `suggestedSize` — รับทั้งสองชื่อ
  assert.equal(surveyZoneSuggestedDiffText({ packageSize: 'ST', packageQty: 1, suggestedSize: 'SM' }), 'ระบบเสนอ SM · 1 แพ็ค');
  // ไม่มีภาพนิ่ง (back-fill ST · ระบบเสนอไม่ได้ตอนเคาะ) หรือยังไม่เคาะ = ไม่มีบรรทัด — ห้ามคำนวณสดจากทะเบียนวันนี้
  assert.equal(surveyZoneSuggestedDiffText({ packageSize: 'ST', packageQty: 2 }), null);
  assert.equal(surveyZoneSuggestedDiffText({ packageSizeSuggested: 'SM' }), null);
  assert.equal(surveyZoneSuggestedDiffText(null), null);
});

// ── จุดติดตั้ง ──────────────────────────────────────────────────────────
test('จุดที่ติดตั้งได้ vs จุดที่เลือกติดตั้ง', () => {
  const c = spotCounts([{ selected: true }, { selected: true }, { selected: false }, {}]);
  assert.deepEqual(c, { total: 4, selected: 2 });
});

// ── สรุปรายแถว ─────────────────────────────────────────────────────────
test('สรุปรายแถวพกภาพนิ่งตอนเคาะ: ขนาดที่เลือก + ขนาดที่ระบบเสนอ (ไม่มีส่วนต่างจากสูตรแล้ว)', () => {
  const row = {
    parts: [part(18, 20, 6.5), part(18, 4, 2.6)], packageQty: 1, packageSize: 'ST', packageSizeSuggested: 'XL',
    spots: [{ selected: true }],
  };
  const s = surveyZoneSummary(row);
  assert.equal(s.packageQty, 1);
  assert.equal(s.packageSize, 'ST');
  assert.equal(s.packageSizeSuggested, 'XL');
  assert.equal('suggestedPackages' in s, false);
  assert.equal('packageDelta' in s, false);
});

test('ยังไม่กรอกแพ็คเกจ = null ไม่ใช่ 0 (0 แปลว่าตัดสินใจแล้วว่าไม่ใส่)', () => {
  const s = surveyZoneSummary({ parts: [part(3, 4, 2.8)] });
  assert.equal(s.packageQty, null);
  assert.equal(s.packageSize, null);
  assert.equal(s.packageSizeSuggested, null);
});

// ── ยอดรวมทั้งใบ ───────────────────────────────────────────────────────
test('⭐ พื้นที่ที่ถูกตัดไม่นับรวมทุกตัวเลข — ไม่ใช่นับเป็น 0', () => {
  const t = surveyTotals([
    { parts: [part(10, 10, 3)], packageQty: 1, spots: [{ selected: true }] },
    { status: 'cut', cutReason: 'อาคารมีระบบของรายอื่นแล้ว', parts: [part(50, 50, 5)], packageQty: 9 },
  ]);
  assert.equal(t.zones, 1);
  assert.equal(t.cutZones, 1);
  assert.equal(t.areaSqm, 100);
  assert.equal(t.packageQty, 1);
});

test('ยอดรวมของตัวอย่างจริงในม็อก', () => {
  const t = surveyTotals([
    { parts: [part(18, 20, 6.5), part(18, 4, 2.6)], packageQty: 3, spots: [{ selected: true }, { selected: true }, { selected: true }, {}] },
    { parts: [part(14, 15, 3)], packageQty: 1, spots: [{ selected: true }, { selected: true }, {}] },
    { parts: [part(22, 26, 4.2)], packageQty: 2, spots: [{ selected: true }, { selected: true }, {}] },
    { parts: [part(6, 40, 3.2)], packageQty: 1, spots: [{ selected: true }, { selected: true }] },
  ]);
  assert.equal(t.areaSqm, 1454);
  assert.equal(t.volumeCbm, 6327.6);
  assert.equal(t.packageQty, 7);
  assert.equal(t.spotsTotal, 12);
  assert.equal(t.spotsSelected, 9);
});

/* ══ ด่านหกข้อ — บล็อกคนละที่ตามว่าใครแก้ได้ (มติผู้ใช้ 2026-08-29) ══════ */

const wide = { docType: SURVEY_DOC_WIDE };
const plan = { docType: SURVEY_DOC_PLAN };
const goodParts = [{ widthM: 10, lengthM: 10, heightM: 3 }];
const zone = (over = {}) => ({ id: 'SVZ1', zoneName: 'ล็อบบี้', parts: goodParts, spots: [{ id: 's1', label: 'เสากลาง' }], ...over });
/* การเคาะที่ผ่านด่านแพ็คเกจ — ขนาด + จำนวน ตรงกับที่ระบบเสนอ (10×10×3 = 300 ลบ.ม. ⇒ SM · 1 แพ็ค) */
const pkg = { packageQty: 1, packageSize: 'SM', packageSizeSuggested: 'SM' };

test('⭐ จอหน้างานบล็อกสามอย่าง: ขนาด · ภาพกว้าง · จุดที่ติดตั้งได้', () => {
  assert.deepEqual(surveyFieldMissing(zone(), [wide]), [], 'ครบสามอย่าง = ผ่าน');

  assert.match(surveyFieldMissing(zone({ parts: [] }), [wide])[0], /ยังไม่ได้วัดขนาด/);
  assert.match(surveyFieldMissing(zone(), [])[0], /ยังไม่มีภาพกว้าง/);
  assert.match(surveyFieldMissing(zone({ spots: [] }), [wide])[0], /จุดที่ติดตั้งได้/);
});

/* ⚠️ ส่วนที่กรอกไม่ครบสามช่อง = **แถวเสีย** ไม่ใช่แถวที่คิดเป็น 0 */
test('ส่วนที่กรอกไม่ครบสามช่องต้องถูกฟ้อง ไม่ใช่บวกเป็นศูนย์', () => {
  const half = [{ widthM: 10, lengthM: 10, heightM: 3 }, { widthM: 5, lengthM: 5 }];
  assert.match(surveyFieldMissing(zone({ parts: half }), [wide])[0], /กรอกไม่ครบสามช่อง 1 ส่วน/);
});

/* ⭐ ผังไม่บังคับที่หน้างาน — ช่างไม่ได้ถือผังไปด้วย · ด่านผังอยู่ที่ปุ่มส่งผล */
test('⭐ ผังไม่บล็อกที่หน้างาน แต่บล็อกที่ส่งผล', () => {
  assert.deepEqual(surveyFieldMissing(zone(), [wide]), [], 'ไม่มีผังก็จบงานหน้างานได้');
  const miss = surveyResultMissing(zone(), [wide]);
  assert.deepEqual(miss.field, [], 'ฝั่งหน้างานครบแล้ว');
  assert.match(miss.result.join(' '), /ภาพผัง/);
});

test('⭐ จอส่งผลบล็อกสามอย่าง: ผัง · จุดที่เลือก · แพ็คเกจ', () => {
  // เคาะตรงกับที่ระบบเสนอ (SM · 1) เพื่อไม่ให้ไปติดด่านเหตุผล (คนละข้อ)
  const full = zone({ spots: [{ id: 's1', label: 'เสากลาง', selected: true }], ...pkg });
  assert.deepEqual(surveyResultMissing(full, [wide, plan]).result, []);

  assert.match(surveyResultMissing(full, [wide]).result.join(' '), /ภาพผัง/);
  assert.match(surveyResultMissing(zone({ ...pkg }), [wide, plan]).result.join(' '), /เลือกจุด/);
  assert.deepEqual(surveyResultMissing({ ...full, packageQty: null }, [wide, plan]).result, ['ยังไม่ได้เคาะแพ็คเกจ']);
  // 🔴 จำนวนมีแต่ขนาดไม่มี (เคาะด้วยโค้ดเก่าระหว่างรัน 0398 กับ deploy) = ส่งผลไม่ได้
  assert.deepEqual(surveyResultMissing({ ...full, packageSize: null }, [wide, plan]).result, ['ยังไม่ได้เลือกขนาดแพ็คเกจ']);
});

/* ⚠️ พื้นที่ที่ถูกตัดไม่ต้องผ่านด่านไหนเลย — บังคับให้วัดของที่จะไม่ขายคือบังคับงานเปล่า */
test('⚠️ พื้นที่ที่ตัดออกไม่ติดด่านอะไรเลย', () => {
  const cut = { id: 'SVZ9', zoneName: 'ห้องน้ำ', status: 'cut', cutReason: 'ลูกค้าไม่เอา', parts: [], spots: [] };
  assert.deepEqual(surveyFieldMissing(cut, []), []);
  assert.deepEqual(surveyResultMissing(cut, []), { field: [], result: [] });
});

test('fail-closed — ไม่ใช่หัวหน้า ส่งผลไม่ได้', () => {
  assert.match(surveySendError([zone()], {}, {}), /หัวหน้าฝ่ายบริการ/);
});

/* ⚠️ ยังไม่โหลดไฟล์ = ยังไม่มีรูป ⇒ ด่านต้องปฏิเสธ ไม่ใช่ปล่อยผ่าน */
test('⚠️ ไม่ส่งไฟล์มาให้ = ถือว่ายังไม่มีรูป (fail-closed)', () => {
  const full = zone({ spots: [{ id: 's1', selected: true }], ...pkg });
  assert.match(surveySendError([full], {}, { canSend: true }), /ภาพ/);
});

/* ⚠️ ใบหนึ่งมีได้สิบพื้นที่ — ข้อความที่ไม่บอกว่าพื้นที่ไหน แปลว่าหัวหน้าต้องไล่เปิดเอง */
test('ข้อความบอกชื่อพื้นที่ที่ติด ไม่ใช่แค่ "ยังไม่ครบ"', () => {
  const ok = zone({ id: 'A', zoneName: 'ล็อบบี้', spots: [{ id: 's', selected: true }], ...pkg });
  const bad = zone({ id: 'B', zoneName: 'โถงลิฟต์', spots: [{ id: 's', selected: true }], ...pkg });
  const err = surveySendError([ok, bad], { A: [wide, plan], B: [wide] }, { canSend: true });
  assert.match(err, /โถงลิฟต์/);
  assert.doesNotMatch(err, /ล็อบบี้/, 'พื้นที่ที่ครบแล้วต้องไม่ถูกเอ่ยถึง');
});

test('ชื่อพื้นที่ที่คนอ่าน: ว่าง/ช่องว่าง = "พื้นที่ไม่มีชื่อ" — ตัวเดียวทั้งด่านและจอ (§10.5 S10)', () => {
  assert.equal(surveyZoneName({ zoneName: '  ห้อง MD ' }), 'ห้อง MD');
  for (const blank of [{ zoneName: '' }, { zoneName: '   ' }, { zoneName: null }, {}, null, undefined]) {
    assert.equal(surveyZoneName(blank), 'พื้นที่ไม่มีชื่อ');
  }
  /* 🐞 ด่านส่งผลเคยถอยไปที่ "พื้นที่" เฉย ๆ (และไม่ตัดช่องว่าง) ขณะที่รายการด่าน/ตารางเรียก "พื้นที่ไม่มีชื่อ" */
  const nameless = zone({ id: 'B', zoneName: '  ', spots: [{ id: 's', selected: true }], ...pkg });
  const err = surveySendError([nameless], { B: [wide] }, { canSend: true });
  assert.match(err, /ยังส่งผลไม่ได้ — พื้นที่ไม่มีชื่อ: /);
  const gate = surveyGateChecklist([nameless], { B: [wide] }).find((g) => !g.ok);
  assert.deepEqual(gate.zones, ['พื้นที่ไม่มีชื่อ'], 'รายการด่านเรียกพื้นที่เดียวกันด้วยชื่อเดียวกัน');
});

test('คำว่า "พื้นที่ไม่มีชื่อ" มีที่เดียว — จอ/ตัวตัดสินเรียก surveyZoneName ไม่เขียนเอง', () => {
  const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const code = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const rel of [
    './surveyControl.js', './surveyFieldView.js', './surveyDecision.js', './surveyJob.js',
    '../../components/service/SurveyResultTable.js', '../../components/service/SurveyZoneList.js',
    '../../components/service/SurveyZonePage.js', '../../components/service/SurveyControlCard.js',
    '../../app/service/surveys/[id]/page.js',
  ]) {
    assert.doesNotMatch(code(read(rel)), /พื้นที่ไม่มีชื่อ/, `${rel} เขียนชื่อสำรองเอง`);
  }
  assert.equal(code(read('./survey.js')).match(/พื้นที่ไม่มีชื่อ/g)?.length, 1);
});

test('ครบทุกพื้นที่ = ส่งผลได้', () => {
  const a = zone({ id: 'A', spots: [{ id: 's', selected: true }], ...pkg });
  assert.equal(surveySendError([a], { A: [wide, plan] }, { canSend: true }), null);
});

test('ใบที่ตัดพื้นที่ออกหมด ส่งผลไม่ได้ — ไม่มีอะไรให้ส่ง', () => {
  const cut = { id: 'C', zoneName: 'x', status: 'cut', cutReason: 'ลูกค้าไม่เอา' };
  assert.match(surveySendError([cut], {}, { canSend: true }), /ไม่มีพื้นที่/);
});

test('ความคืบหน้าหน้างานนับเฉพาะพื้นที่ที่ยังไม่ถูกตัด', () => {
  const done = zone({ id: 'A' });
  const todo = zone({ id: 'B', parts: [] });
  const cut = { id: 'C', status: 'cut', cutReason: 'ลูกค้าไม่เอา' };
  const p = surveyFieldProgress([done, todo, cut], { A: [wide], B: [wide] });
  assert.deepEqual({ total: p.total, done: p.done, complete: p.complete }, { total: 2, done: 1, complete: false });
});

// ── ช่างกด "ส่งงาน" (มติผู้ใช้ 2026-09-21: บล็อก บอกเหตุ) ─────────────────
test('⭐ ส่งงานได้เมื่อของฝั่งช่างครบ — ข้อของหัวหน้า (ผัง · เลือกจุด · แพ็คเกจ) ไม่บล็อก', () => {
  // ไม่มีผัง ไม่มีจุดที่เลือก ไม่มีแพ็คเกจ = งานของหัวหน้าที่ทำทีหลังได้
  assert.equal(surveyFieldSubmitError([zone({ id: 'A', packageQty: null })], { A: [wide] }), null);
});

test('🔴 ส่งงานไม่ได้เมื่อยังขาด — บอกข้อ + ชื่อพื้นที่ + ทางออกด้วยคำเดียวกับปุ่ม', () => {
  const a = zone({ id: 'A', zoneName: 'ล็อบบี้' });
  const b = zone({ id: 'B', zoneName: 'แพนทรี', parts: [], spots: [] });
  const err = surveyFieldSubmitError([a, b], { A: [wide], B: [] });
  assert.match(err, /^ยังส่งงานไม่ได้/);
  assert.match(err, /ขนาด \(แพนทรี\)/);
  assert.match(err, /ภาพกว้าง \(แพนทรี\)/);
  assert.match(err, /จุดติดตั้ง \(แพนทรี\)/);
  assert.doesNotMatch(err, /ล็อบบี้/, 'พื้นที่ที่ครบแล้วต้องไม่ถูกเอ่ยถึง');
  // ⚠️ ป้ายปุ่มบนการ์ดพื้นที่ — เปลี่ยนป้ายเมื่อไรต้องเปลี่ยนข้อความนี้ด้วย
  assert.match(err, /“ตัดพื้นที่นี้ออก”/);
});

test('พื้นที่ที่ตัดออกไม่ต้องวัด · ตัดออกหมดทั้งใบก็ส่งงานได้ (หัวหน้าเห็นเหตุผลเอง)', () => {
  const cut = { id: 'C', zoneName: 'ห้องเก็บของ', status: 'cut', cutReason: 'ลูกค้าไม่เอา', parts: [] };
  assert.equal(surveyFieldSubmitError([zone({ id: 'A' }), cut], { A: [wide] }), null);
  assert.equal(surveyFieldSubmitError([cut], {}), null);
});

test('ใบที่ไม่มีพื้นที่เลย ส่งงานไม่ได้ — ชี้ปุ่มเพิ่มพื้นที่หรือทาง "ไปแล้วเข้าไม่ได้"', () => {
  const err = surveyFieldSubmitError([], {});
  assert.match(err, /“เพิ่มพื้นที่ที่เจอหน้างาน”/);
  assert.match(err, /“ไปแล้วเข้าไม่ได้”/);
});

test('🔴 ป้ายปุ่มที่ข้อความส่งงานชี้ไปหา ต้องมีอยู่จริงบนจอ', () => {
  // 🔄 §10.5 S7 — "ตัดพื้นที่นี้ออก" อยู่ที่หน้าพื้นที่ · "เพิ่มพื้นที่ที่เจอหน้างาน" เป็นแถวท้ายรายการพื้นที่
  const zonePage = readFileSync(new URL('../../components/service/SurveyZonePage.js', import.meta.url), 'utf8');
  const list = readFileSync(new URL('../../components/service/SurveyZoneList.js', import.meta.url), 'utf8');
  const sheet = readFileSync(new URL('../../components/service/SurveySubmitDialog.js', import.meta.url), 'utf8');
  assert.match(zonePage, />\s*ตัดพื้นที่นี้ออก\s*</);
  assert.match(list, />\s*เพิ่มพื้นที่ที่เจอหน้างาน\s*</);
  assert.match(sheet, /label: "ไปแล้วเข้าไม่ได้"/);
});

/* 🔴 ต่างจากที่ระบบเสนอต้องบอกเหตุผล (mig 0345 · กติกาเดิม เปลี่ยนจาก "สูตร" เป็น "ที่ระบบเสนอ" ใน 0398)
   🔑 ด่านอ่านจาก **ภาพนิ่งบนแถว** ที่ route ประทับตอนเคาะ — ไม่ถามทะเบียน */
test('🔴 แพ็คเกจต่างจากที่ระบบเสนอต้องมีเหตุผล · ตรงกับที่เสนอไม่ต้อง', () => {
  const base = zone({ spots: [{ id: 's', selected: true }] });
  const sm = { packageSize: 'SM', packageSizeSuggested: 'SM' };
  assert.equal(packageNeedsNote({ ...base, ...sm, packageQty: 1 }), false, 'ตรงที่เสนอ (SM · 1) = ไม่ต้องมีเหตุผล');
  assert.equal(packageNeedsNote({ ...base, ...sm, packageQty: 3 }), true, 'ระบบเสนอจำนวน 1 เสมอ — 3 = ต่าง');
  assert.equal(packageNeedsNote({ ...base, ...sm, packageSize: 'ST', packageQty: 1 }), true, 'ขนาดไม่ตรงที่เสนอ');
  assert.equal(packageNeedsNote({ ...base, ...sm, packageQty: null }), false, 'ยังไม่เคาะ = ยังไม่ถึงข้อนี้');

  const files = [wide, plan];
  assert.deepEqual(surveyResultMissing({ ...base, ...sm, packageQty: 1 }, files).result, []);
  assert.deepEqual(surveyResultMissing({ ...base, ...sm, packageQty: 3 }, files).result,
    ['แพ็คเกจต่างจากที่ระบบเสนอ — ต้องบอกเหตุผล']);
  assert.deepEqual(
    surveyResultMissing({ ...base, ...sm, packageQty: 3, packageNote: 'กึ่งกลางแจ้ง ลมโกรก' }, files).result,
    [],
  );
});

test('⭐ ขนาดที่หัวหน้าเลือกเอง (XS ห้องน้ำ) ไม่ต้องมีเหตุผล — แต่จำนวนที่ไม่ใช่ 1 ยังต้องบอก', () => {
  const xs = { packageSize: 'XS', packageSizeSuggested: 'SM', packageSizeManual: true };
  assert.equal(packageNeedsNote({ ...xs, packageQty: 1 }), false);
  assert.equal(packageNeedsNote({ ...xs, packageQty: 2 }), true);
  assert.equal(packageNeedsNote({ ...xs, packageSizeManual: false, packageQty: 1 }), true);
});

test('⚠️ แถวก่อนมีขนาด (back-fill ST · ไม่มีที่ระบบเสนอ) ไม่ถูกย้อนบังคับเหตุผล — และด่านไม่ถามทะเบียน', () => {
  const legacy = zone({ spots: [{ id: 's', selected: true }], packageQty: 3, packageSize: 'ST' });
  assert.equal(packageNeedsNote(legacy), false);
  assert.deepEqual(surveyResultMissing(legacy, [wide, plan]).result, []);
  // รหัสที่ทะเบียนไม่มีแล้วก็ยังผ่านด่านแถวล้วน — "ขนาดถูกลบ" เป็นด่านแยกของใบที่ยังไม่ส่ง (packageSizes.js)
  assert.deepEqual(surveyResultMissing({ ...legacy, packageSize: 'ZZ' }, [wide, plan]).result, []);
});

/* 🐞 **รูที่เทสต์ฟังก์ชันมองไม่เห็น** — ด่านถูกหมด แต่ถ้า route ไม่เรียกก็ไม่มีผล
   (บทเรียนจากงานสัญญา 2026-09-03: ฟังก์ชันเขียว แต่ของจริงพังเพราะ route ไม่ส่งของเข้าไป)
   ⇒ ยามพวกนี้ผูกกับ **ซอร์สจริง** ไม่ใช่กับฟังก์ชัน */
test('🐞 ปุ่มส่งผลต้องถามด่านตัวเดียวกับจอ และอ่านไฟล์จริงมานับ', () => {
  const route = readFileSync(new URL('../../app/api/service/surveys/[id]/send/route.js', import.meta.url), 'utf8');
  assert.match(route, /surveySendError\(/, 'ต้องใช้ด่านตัวเดียวกับจอ ไม่ใช่เขียนเงื่อนไขซ้ำ');
  assert.match(route, /listAttachments\('service_survey_zone'/,
    'ต้องนับรูปจากไฟล์จริง — เชื่อค่าที่ client ส่งมาแปลว่าส่งใบไม่มีรูปออกไปได้');
  assert.match(route, /canSendSurveyResult\(/, 'ส่งผลได้เฉพาะหัวหน้าฝ่าย ไม่ใช่ canEditService');
  /* ⚠️ กติกาการเปลี่ยนสถานะต้องใช้ของกลาง ไม่ใช่เขียน 'answered' เอง —
     ใบที่ SA กดปิดไปก่อนต้องกลายเป็น closed ทันที (ปิดสองฝั่ง กดก่อน/หลังกันได้) */
  assert.match(route, /closureStatus\(/);
  assert.match(route, /answerRequestError\(/);

  /* 🐞 **ก๊อปกติกาสถานะมาครบ แต่ลืมบรรทัดที่แจกกระดิ่ง** (เจอ 06/09/2026)
     ในระบบนี้ "เขียนบรรทัดลงเธรด = ได้แจ้งเตือนฟรี" (`appendUpdate` เรียก
     `notifyThreadUpdate` ต่อให้เอง) ⇒ ไม่เขียนเธรด = TS กดส่งผลแล้วฝั่งฝ่ายขาย
     เงียบสนิท ทั้งที่ใบนี้คือของที่ SA รอเอาไปตั้งราคา
     ⚠️ ต้องส่ง **แถวหลังอัปเดต** ไม่ใช่แถวเดิม — ข้อความอ่าน `closedAt` มาตัดสินว่า
        "ปิดครบสองฝั่ง" หรือ "รอผู้ขอปิดเรื่อง" · ส่งแถวเก่าไปจะบอกผิด */
  assert.match(route, /appendRequestEvent\(/,
    'ส่งผลแล้วต้องมีบรรทัดในเธรด ไม่งั้นผู้ขอไม่ได้กระดิ่ง');
  assert.match(route, /request:\s*data\b/,
    'ต้องส่งแถวหลังอัปเดต ไม่ใช่ request เดิม');
});

/* 🔴 ช่างกับหัวหน้าเขียนคนละชุดช่อง — รวมเป็นเส้นเดียวเมื่อไร ช่างจะทับตัวเลข
   ที่หัวหน้าเคาะไปแล้วโดยไม่มีใครรู้ */
test('🔴 เส้นของช่างต้องไม่รับ packageQty · เส้นของหัวหน้าต้องไม่รับ parts', () => {
  const route = readFileSync(
    new URL('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js', import.meta.url), 'utf8');
  /* ⚠️ ตัดที่ **หัวคอมเมนต์ของ PUT** ไม่ใช่ที่ `export const PUT` — คอมเมนต์นั้นเอ่ยชื่อ
     ช่องของฝั่งหัวหน้าไว้ ถ้าตัดทีหลังมันจะตกอยู่ในก้อนของ PATCH แล้วยามจับผิดตัว */
  const putAt = route.indexOf('/* ── PUT:');
  const patch = route.slice(route.indexOf('export const PATCH'), putAt);
  const put = route.slice(putAt);

  assert.doesNotMatch(patch, /body\.packageQty/, 'ช่างเคาะแพ็คเกจไม่ได้');
  assert.doesNotMatch(patch, /selectedSpotIds/, 'ช่างเลือกจุดที่จะติดตั้งไม่ได้');
  assert.doesNotMatch(put, /body\.parts/, 'หัวหน้าแก้ขนาดที่ช่างวัดไม่ได้');
  assert.match(put, /canSendSurveyResult\(/, 'เคาะแพ็คเกจได้เฉพาะหัวหน้า');
  assert.match(patch, /visitWriteAccess\(/, 'ช่างเขียนได้เฉพาะใบที่ตัวเองถูกมอบหมาย');
});

/* ── ล็อกหลังส่งผล (🐞 UAT 06/09/2026) ─────────────────────────────────────
   จอปิดให้แล้วด้วย `!sent` แต่ server ไม่ได้ปิด ⇒ ยิง API ตรงยังแก้ตัวเลขของใบที่
   ส่งไปแล้วได้ 200 โดยไม่มีการส่งซ้ำ · SA ถือตัวเลขชุดหนึ่ง ฐานเก็บอีกชุดหนึ่ง */
test('🐞 ส่งผลแล้วต้องแก้ไม่ได้ทั้งสองเส้น — และต้องบอกทางออก', () => {
  assert.equal(surveyEditLockError({ id: 'R1' }), null, 'ใบที่ยังไม่ส่งต้องแก้ได้ตามปกติ');
  assert.match(surveyEditLockError({ id: 'R1', answeredAt: '2026-09-06T06:41:32Z' }), /ยังไม่จบ/,
    'ต้องบอกทางออก ไม่ใช่แค่ "แก้ไม่ได้"');
  assert.match(surveyEditLockError({ id: 'R1', cancelledAt: '2026-09-06T06:00:00Z' }), /ยกเลิก/);
  assert.match(surveyEditLockError(null), /ไม่พบ/);

  /* 🔑 **ผูกกับ `answeredAt` ไม่ใช่ `status`** — ใบที่ SA กด "ยังไม่จบ" กลับมามี
     status `acknowledged` เท่ากับใบที่ไม่เคยส่ง ⇒ ต้องกลับมาแก้ได้ */
  assert.equal(surveyEditLockError({ id: 'R1', status: 'acknowledged', answeredAt: null }), null);
});

test('🔴 route ของทั้งช่างและหัวหน้าต้องเรียกด่านล็อกก่อนเขียน', () => {
  const route = readFileSync(
    new URL('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js', import.meta.url), 'utf8');
  const putAt = route.indexOf('/* ── PUT:');
  const patch = route.slice(route.indexOf('export const PATCH'), putAt);
  const put = route.slice(putAt);

  assert.match(route, /surveyEditLockError/, 'ต้องใช้ด่านกลาง ไม่ใช่เขียน answeredAt เองในแต่ละเส้น');
  assert.match(patch, /requestLock\(/, 'เส้นของช่างต้องถามใบแม่ก่อนเขียน');
  assert.match(put, /requestLock\(/, 'เส้นของหัวหน้าต้องถามใบแม่ก่อนเขียน');
});

/* ══ §5E ④ ดึงผลประเมินกลับมาแก้ (มติข้อ 25) ═══════════════════════════════
   🔴 กลไกเดิมใช้ไม่ได้ — `reopenRequestError` บล็อก `closed` ไว้ชัดเจน แต่กรณีนี้
      คือ *หลัง SA ปิดใบไปแล้ว* พอดี ⇒ เป็นความสามารถใหม่ ต้องมีด่านของตัวเอง */
test('🔑 ดึงผลกลับ: สิทธิ์ · สถานะ · เหตุผล ครบสามชั้น', () => {
  const sent = { id: 'R1', answeredAt: '2026-09-06T00:00:00Z', closedAt: '2026-09-07T00:00:00Z' };
  const reason = 'กรอกแพ็คเกจล็อบบี้ผิดจาก 2 เป็น 3';

  assert.equal(surveyRecallError(sent, { reason, canRecall: true }), null,
    'ใบที่ปิดครบสองฝั่งแล้วต้องดึงกลับได้ — นี่คือเหตุผลที่ข้อนี้มีอยู่');

  assert.match(surveyRecallError(sent, { reason, canRecall: false }), /หัวหน้าฝ่ายบริการ/);
  assert.match(surveyRecallError(sent, { reason: 'สั้น', canRecall: true }), /10 ตัวอักษร/);
  // ยังไม่เคยส่งผล = แก้ได้อยู่แล้ว ไม่ต้องดึงกลับ
  assert.match(surveyRecallError({ id: 'R1' }, { reason, canRecall: true }), /ยังไม่ได้ส่งผล/);
  assert.match(surveyRecallError({ ...sent, cancelledAt: 'x' }, { reason, canRecall: true }), /ยกเลิก/);
  assert.match(surveyRecallError(null, { reason, canRecall: true }), /ไม่พบ/);
});

/* 🔴 **จุดอันตรายที่สุดของทั้งแผน** — SA อาจเอาตัวเลขผิดไปเสนอราคาไปแล้ว
   ⇒ ต้องบอกส่วนต่างตรง ๆ ไม่ใช่แค่ "ใบถูกแก้" */
test('🔴 ส่วนต่างต้องบอกเป็นเลขเก่า→ใหม่ เฉพาะตัวที่ใช้ตั้งราคา', () => {
  const before = { zones: 3, areaSqm: 320, packageQty: 6, spotsSelected: 4 };
  const after = { zones: 3, areaSqm: 300, packageQty: 5, spotsSelected: 9, packagesBySize: { ST: 5 } };
  const diff = surveyTotalsDiff(before, after);

  // ยอดเดิมตรึงไว้ก่อนมีขนาด (ไม่มี packagesBySize) ⇒ ไม่มีบรรทัด "ขนาด" — ไม่ใช่ "— → ST 5"
  assert.deepEqual(diff, ['ตร.ม. 320 → 300', 'แพ็คเกจ 6 → 5']);
  /* ⭐ ขนาดเปลี่ยนทั้งที่จำนวนรวมเท่าเดิม = ราคาเปลี่ยน ⇒ ต้องบอก */
  assert.deepEqual(
    surveyTotalsDiff({ ...after, packagesBySize: { ST: 5 } }, { ...after, packagesBySize: { SM: 1, ST: 4 } }),
    ['ขนาด ST 5 → SM 1 · ST 4'],
  );
  assert.deepEqual(surveyTotalsDiff(after, { ...after, packagesBySize: { ST: 5 } }), []);
  // จุดติดตั้งเป็นของหน้างาน ไม่ใช่ตัวคูณราคา ⇒ ไม่ต้องรบกวน SA
  assert.ok(!diff.join(' ').includes('9'));
  // ไม่มีอะไรเปลี่ยน / ไม่มีของเทียบ = เงียบ (ส่งรอบแรกก็เข้าทางนี้)
  assert.deepEqual(surveyTotalsDiff(before, before), []);
  assert.deepEqual(surveyTotalsDiff(null, after), []);
});

test('🔴 route ดึงกลับต้องล้างตราปิดทั้งสองฝั่ง และตรึงตัวเลขเดิมไว้ในเธรด', () => {
  const route = readFileSync(
    new URL('../../app/api/service/surveys/[id]/recall/route.js', import.meta.url), 'utf8');

  assert.match(route, /surveyRecallError\(/, 'ต้องใช้ด่านตัวเดียวกับปุ่มบนจอ');
  assert.match(route, /answeredAt: null/);
  /* ⚠️ ล้าง `closedAt` ด้วย — ไม่งั้นใบค้างสภาพที่ผู้ขอปิดแล้วแต่ฝ่ายยังไม่ตอบ
     ซึ่งไม่มีปุ่มไหนพาออกมาได้ */
  assert.match(route, /closedAt: null/);
  assert.match(route, /kind: 'recall'/, 'ต้องเขียนเธรด ไม่งั้น SA ไม่ได้กระดิ่ง');
  assert.match(route, /meta: \{ totals \}/, 'ต้องตรึงตัวเลขเดิมไว้ให้รอบส่งถัดไปเทียบ');
  /* ⚠️ ไม่แตะวันบนใบ — ต่างจาก §5E ② ตรงนี้ไม่ต้องไปวัดใหม่
     ⚠️ ตัดคอมเมนต์ออกก่อนตรวจ — หัวไฟล์ต้องอธิบายได้ว่า *ไม่* แตะอะไร (ยามที่ห้าม
        พูดถึงชื่อคอลัมน์ = ยามที่บังคับให้ลบเหตุผลทิ้ง — บทเรียนเดียวกับ renewals) */
  const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code, /committedDueDate/);
});

test('🔴 ส่งผลรอบใหม่ต้องหยิบตัวเลขเดิมจากแถว recall มาเทียบ', () => {
  const send = readFileSync(
    new URL('../../app/api/service/surveys/[id]/send/route.js', import.meta.url), 'utf8');
  assert.match(send, /surveyTotalsDiff\(/);
  assert.match(send, /\.eq\('kind', 'recall'\)/, 'ต้องอ่านแถวดึงกลับล่าสุด');
});

/* ══ ส่งผลปิดนัดให้ด้วย (มติเจ้าของ 24/09 ข้อ 2) ═══════════════════════════
 * เจ้าของ: "ส่งผลแล้วปิดนัดให้ด้วย แต่ต้องมีด่าน งานที่ต้องส่งด้วย เช่น ขนาด พื้นที่ รูป แพ็ค ที่ตกลงไว้"
 * 🔑 ด่านของการปิดทางนี้คือด่านส่งผลตัวเดียว — มันต้อง **ครอบ** ด่านส่งงานของช่างทุกกรณี
 *   ไม่งั้นส่งผลจะปิดนัดเป็น "เข้าแล้ว" ทั้งที่ของช่างยังไม่ครบ (สิ่งที่ช่างเองทำไม่ได้) */
test('🔑 ด่านส่งผลปฏิเสธทุกกรณีที่ด่านส่งงานของช่างปฏิเสธ — ไม่ต้องมีด่านที่สองตอนส่งผลปิดนัด', () => {
  const decided = (over = {}) => zone({ spots: [{ id: 's1', label: 'เสากลาง', selected: true }], ...pkg, ...over });
  const zoneVariants = [
    decided(),
    decided({ parts: [] }),
    decided({ parts: [{ widthM: 5, lengthM: 5 }] }),
    decided({ spots: [] }),
    { id: 'SVZ1', zoneName: 'ห้องน้ำ', status: 'cut', cutReason: 'ลูกค้าไม่เอา', parts: [], spots: [] },
  ];
  const fileVariants = [[], [wide], [plan], [wide, plan]];
  let fieldRefusals = 0;
  for (const a of zoneVariants) {
    for (const b of [null, ...zoneVariants]) {
      const rows = b ? [a, { ...b, id: 'SVZ2', zoneName: 'แพนทรี' }] : [a];
      for (const fa of fileVariants) {
        for (const fb of fileVariants) {
          const files = { SVZ1: fa, SVZ2: fb };
          if (!surveyFieldSubmitError(rows, files)) continue;
          fieldRefusals += 1;
          assert.ok(surveySendError(rows, files, { canSend: true }),
            `ช่างส่งงานไม่ได้ แต่ส่งผลผ่าน: ${JSON.stringify({ rows: rows.map((r) => r.status || 'ok'), fa, fb })}`);
        }
      }
    }
  }
  assert.ok(fieldRefusals > 50, 'ชุดทดสอบต้องมีกรณีที่ช่างส่งไม่ได้จริงจำนวนมาก');
  // ใบว่าง: ช่างส่งไม่ได้ ส่งผลก็ไม่ได้ · ตัดออกหมด: ช่างส่งได้ แต่ส่งผลไม่ได้ (เข้มกว่า)
  assert.ok(surveyFieldSubmitError([], {}) && surveySendError([], {}, { canSend: true }));
  const allCut = [{ id: 'C', zoneName: 'x', status: 'cut', cutReason: 'ลูกค้าไม่เอา' }];
  assert.equal(surveyFieldSubmitError(allCut, {}), null);
  assert.match(surveySendError(allCut, {}, { canSend: true }), /ไม่มีพื้นที่/);
  // "แพ็คที่ตกลงไว้" — ยังไม่เคาะ · ยังไม่เลือกขนาด · ต่างจากที่ระบบเสนอโดยไม่มีเหตุผล = ส่งผลไม่ได้
  assert.match(surveySendError([decided({ packageQty: null })], { SVZ1: [wide, plan] }, { canSend: true }), /ยังไม่ได้เคาะแพ็คเกจ/);
  assert.match(surveySendError([decided({ packageSize: null })], { SVZ1: [wide, plan] }, { canSend: true }), /ยังไม่ได้เลือกขนาดแพ็คเกจ/);
  assert.match(surveySendError([decided({ packageQty: 3 })], { SVZ1: [wide, plan] }, { canSend: true }), /เหตุผล/);
  assert.equal(surveySendError([decided()], { SVZ1: [wide, plan] }, { canSend: true }), null);
});

test('🐞 route ส่งผล: หานัดที่ค้าง · ปิดก่อนตอบใบ ผ่านลำดับกลางตัวเดียว · ผูกนัดกับโมดัล', () => {
  const route = readFileSync(new URL('../../app/api/service/surveys/[id]/send/route.js', import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(route, /findSurveyVisit\(supabase, id, \{ openOnly: true \}\)/, 'นัดที่ปิดคือนัดที่ยังกินสิทธิ์ใบ');
  assert.match(route, /surveySendWrites\(supabase, \{/, 'ลำดับปิดนัด → ตอบใบอยู่ที่ lib ตัวเดียว (เทสต์ลำดับอยู่ที่ surveySendClose.test)');
  assert.match(route, /closeVisitId: body\?\.closeVisitId \?\? null/, 'ต้องส่งรหัสนัดที่โมดัลบอกผู้ใช้ไปยืนยัน');
  /* 🔄 มติ 01/10 (ด่านรูปจุด): `today` คำนวณครั้งเดียว — ด่าน "ส่งผลนี้ปิดนัดไหม" กับการปิดจริงใช้วันเดียวกัน */
  assert.match(route, /const today = businessDate\(nowIso\)/, 'วันเข้าจริงของนัดที่ไม่เคยเริ่มคิดจากวันไทย');
  assert.match(route, /answerPatch: patch,\s*today,/, 'ลำดับกลางได้วันไทยตัวเดียวกับด่าน');
  assert.doesNotMatch(route, /from\('dept_requests'\)\.update\(/,
    'route ห้ามตอบใบเอง — ต้องผ่านลำดับกลาง ไม่งั้นตอบใบได้ก่อนปิดนัด');
  // ⭐ ปิดทางนี้ต้องลงเธรดของนัด (ไม่งั้นนัดที่ไม่มีเวลาจบดูเหมือนระบบทำหาย) — และลงก่อนตอบใบ (ใน onVisitClosed)
  assert.match(route, /onVisitClosed: async/);
  assert.match(route, /surveySendCloseBody\(closedVisit, user\)/);
  assert.match(route, /closedVisit: closedVisit \|\| null/, 'จอต้องรู้ว่านัดไหนถูกปิด');
});
