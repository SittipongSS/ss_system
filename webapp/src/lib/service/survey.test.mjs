// ── ตรรกะใบประเมินพื้นที่ (mig 0314) — ตัวเลขล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CBM_PER_PACKAGE, normalizeSurveyPart, spotCounts, suggestedPackages,
  surveyTotals, surveyZoneSize, surveyZoneSummary,
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

// ── ⭐ สูตร 2,400 ลบ.ม. = 1 แพ็คเกจ ─────────────────────────────────────
test('สูตรปัดขึ้น อย่างน้อย 1 แพ็คเกจ', () => {
  assert.equal(CBM_PER_PACKAGE, 2400);
  assert.equal(suggestedPackages(70.56), 1);
  assert.equal(suggestedPackages(2400), 1);
  assert.equal(suggestedPackages(2400.01), 2);   // ขั้นบันได
  assert.equal(suggestedPackages(7200), 3);
  assert.equal(suggestedPackages(0), null);
  assert.equal(suggestedPackages(null), null);
});

test('🔴 ปัดเศษครั้งเดียวที่ระดับพื้นที่ ห้ามปัดรายส่วน', () => {
  // สองส่วนส่วนละ 100 ลบ.ม. รวม 200 ⇒ 1 แพ็คเกจ · ปัดรายส่วนจะได้ 2 ซึ่งผิดเท่าตัว
  const s = surveyZoneSize([part(10, 10, 1), part(10, 10, 1)]);
  assert.equal(s.volumeCbm, 200);
  assert.equal(suggestedPackages(s.volumeCbm), 1);
  assert.equal(suggestedPackages(100) + suggestedPackages(100), 2);
});

test('🔴 คิดรายพื้นที่ ห้ามเอาปริมาตรรวมทั้งใบมาหาร — กลิ่นไม่ข้ามผนัง', () => {
  const rows = [
    { parts: [part(12.4, 18, 2.8), part(8, 15.5, 2.8)] },   // 972.16 → 1
    { parts: [part(9, 14, 2.8)] },                          // 352.8  → 1
    { parts: [part(4.2, 6, 2.8)] },                         // 70.56  → 1
    { parts: [part(18, 20, 6.5), part(18, 4, 2.6)] },       // 2527.2 → 2
    { parts: [part(30, 40, 6)] },                           // 7200   → 3
  ];
  const t = surveyTotals(rows);
  assert.equal(t.suggestedPackages, 8);                      // หารรายพื้นที่
  assert.equal(suggestedPackages(t.volumeCbm), 5);           // รวมก่อนหาร — ผิด
});

// ── จุดติดตั้ง ──────────────────────────────────────────────────────────
test('จุดที่ติดตั้งได้ vs จุดที่เลือกติดตั้ง', () => {
  const c = spotCounts([{ selected: true }, { selected: true }, { selected: false }, {}]);
  assert.deepEqual(c, { total: 4, selected: 2 });
});

// ── สรุปรายแถว ─────────────────────────────────────────────────────────
test('ส่วนต่างจากสูตร: บวก = สูงกว่า · ลบ = ต่ำกว่า', () => {
  const row = { parts: [part(18, 20, 6.5), part(18, 4, 2.6)], packageQty: 3, spots: [{ selected: true }] };
  const s = surveyZoneSummary(row);
  assert.equal(s.suggestedPackages, 2);
  assert.equal(s.packageDelta, 1);
  assert.equal(surveyZoneSummary({ parts: [part(30, 40, 6)], packageQty: 1 }).packageDelta, -2);
});

test('ยังไม่กรอกแพ็คเกจ = null ไม่ใช่ 0 (0 แปลว่าตัดสินใจแล้วว่าไม่ใส่)', () => {
  const s = surveyZoneSummary({ parts: [part(3, 4, 2.8)] });
  assert.equal(s.packageQty, null);
  assert.equal(s.packageDelta, null);
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
  assert.equal(t.suggestedPackages, 6);
  assert.equal(t.packageQty, 7);
  assert.equal(t.spotsTotal, 12);
  assert.equal(t.spotsSelected, 9);
});
