// ── บันทึกผลวัดรายพื้นที่ (PATCH ของช่าง) — แถวว่าง · ตัด/เอากลับ · ล็อกใบที่ปิดแล้ว ──────
//
// 🐞 **บั๊กที่เทสต์ชุดนี้เกิดมาเพื่อกัน** (เจอตอนรื้อจอหน้างาน 25/09)
//   ① **ตัดพื้นที่ที่ยังไม่เคยวัดไม่ได้** — การ์ดส่งร่างทั้งก้อนไปพร้อมคำขอตัด และร่างของ
//      พื้นที่ที่ยังไม่วัดมี "ส่วน" ว่างหนึ่งแถวเสมอ ⇒ server ตีกลับ "ต้องระบุกว้าง" ⇒ ทางออก
//      ที่ข้อความส่งงานชี้ให้ ("ตัดพื้นที่นี้ออก") ใช้ไม่ได้กับกรณีที่ต้องใช้มันที่สุด
//   ② **แถวว่างแถวเดียวล็อกการบันทึกทั้งพื้นที่** — กด "+ เพิ่มจุด" แล้วไม่ได้พิมพ์ = บันทึก
//      ขนาดที่วัดครบแล้วไม่ได้ไปด้วย
//   ③ **PATCH ไม่เห็นใบที่ปิดแล้ว** — ด่านกลางอ่าน `status`/`closedAt` แต่ route เลือกมาแค่
//      `answeredAt`/`cancelledAt` ⇒ จอบอกล็อก แต่ยิง API ตรงยังเขียนได้
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SURVEY_ZONE_STALE_CODE,
  SURVEY_ZONE_STALE_TEXT,
  isBlankSurveyPart,
  isBlankSurveySpot,
  normalizeSurveyParts,
  normalizeSurveySpots,
  surveyEditLockError,
  surveyZoneLatestRow,
  surveyZoneNextBase,
  surveyZoneSavePayload,
  surveyZoneStaleBody,
  surveyZoneStaleError,
  surveyZoneStaleReply,
} from './survey.js';
import { surveyZoneDraftSignature } from './surveyControl.js';

/** ตัดคอมเมนต์ออกก่อนค้นซอร์ส — ยามต้องจับโค้ด ไม่ใช่คำอธิบายของโค้ด */
const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ทรงที่จอส่งมาจริง — ช่อง input ให้ค่าเป็นสตริงเสมอ และแถวใหม่มี id ชั่วคราว `new-…` */
const blankPart = (id = 'new-a') => ({ id, label: '', widthM: '', lengthM: '', heightM: '' });
const part = (id, w, l, h, label = '') => ({ id, label, widthM: w, lengthM: l, heightM: h });
const blankSpot = (id = 'new-s') => ({ id, label: '', note: '' });

/* ══ ① ② แถวว่างไม่ใช่แถวเสีย ═══════════════════════════════════════════ */

test('🐞 ส่วนว่างแถวเดียว = ไม่มีส่วน ไม่ใช่ "ต้องระบุกว้าง"', () => {
  assert.deepEqual(normalizeSurveyParts([blankPart()]), { value: [], error: null });
  // ไม่ส่งมาเลย = ไม่แตะช่องนี้ (ต่างจากส่ง [] ที่แปลว่า "ไม่มีส่วน")
  assert.deepEqual(normalizeSurveyParts(undefined), { value: undefined, error: null });
  assert.match(normalizeSurveyParts('x').error, /ไม่ถูกต้อง/);
});

test('แถวว่างปนกับแถวจริง — แถวว่างหายไป แถวจริงอยู่ครบตามลำดับ', () => {
  const { value, error } = normalizeSurveyParts([
    part('p1', '8', '6', '3', 'โถง'), blankPart('new-b'), part('p2', 3, 2, 3),
  ]);
  assert.equal(error, null);
  assert.deepEqual(value.map((p) => p.id), ['p1', 'p2']);
  assert.deepEqual(value[0], { id: 'p1', label: 'โถง', widthM: 8, lengthM: 6, heightM: 3 });
});

test('🔴 แถวที่กรอกมาบางช่อง = แถวเสีย ยังต้องตีกลับ (ไม่ใช่คิดเป็น 0 และไม่ใช่ทิ้งเงียบ)', () => {
  assert.match(normalizeSurveyParts([part('p1', '3', '4', '')]).error, /ต้องระบุสูง/);
  // ชื่อส่วนอย่างเดียวก็นับว่า "เริ่มกรอกแล้ว" — ทิ้งเงียบ = ชื่อที่ช่างพิมพ์ไว้หายไปเฉย ๆ
  assert.match(normalizeSurveyParts([{ ...blankPart(), label: 'ปีกเหนือ' }]).error, /ต้องระบุกว้าง/);
  assert.match(normalizeSurveyParts([part('p1', '0', '4', '3')]).error, /กว้างต้องมากกว่า 0/);
});

test('🔴 เพดาน 20 ส่วนนับเฉพาะแถวจริง — แถวว่างที่ค้างบนจอไม่ทำให้ชนเพดาน', () => {
  const real = Array.from({ length: 20 }, (_, i) => part(`p${i}`, 1, 1, 1));
  assert.match(normalizeSurveyParts([...real, part('p20', 1, 1, 1)]).error, /ไม่เกิน 20 ส่วน/);
  const ok = normalizeSurveyParts([...real, blankPart()]);
  assert.equal(ok.error, null);
  assert.equal(ok.value.length, 20);
});

test('แถวใหม่ที่ไม่มี id ได้ id จาก server — แถวว่างไม่กินเลข', () => {
  let n = 0;
  const newId = () => `PRT-${++n}`;
  const { value } = normalizeSurveyParts([blankPart(''), { ...part('', 3, 4, 2.8) }], { newId });
  assert.deepEqual(value.map((p) => p.id), ['PRT-1']);
});

test('🐞 จุดว่าง = ไม่มีจุด · บันทึกที่ไม่มีชื่อจุดยังต้องตีกลับ', () => {
  assert.deepEqual(normalizeSurveySpots([blankSpot()], []), { value: [], error: null });
  assert.deepEqual(normalizeSurveySpots(undefined, []), { value: undefined, error: null });
  assert.match(normalizeSurveySpots([{ id: 's1', label: '', note: 'ปลั๊กอยู่ใต้โซฟา' }], []).error, /ต้องมีชื่อ/);
  const real = Array.from({ length: 30 }, (_, i) => ({ id: `s${i}`, label: `จุด ${i}` }));
  assert.equal(normalizeSurveySpots([...real, blankSpot()], []).error, null);
  assert.match(normalizeSurveySpots([...real, { id: 's30', label: 'เกิน' }], []).error, /ไม่ควรเกิน 30 จุด/);
});

test('🔴 `selected` มาจากที่หัวหน้าเคาะไว้เสมอ — ค่าที่จอส่งมาไม่มีผล', () => {
  const before = [{ id: 's1', label: 'มุมโซฟา', selected: true }, { id: 's2', label: 'ข้างเคาน์เตอร์', selected: false }];
  const { value } = normalizeSurveySpots([
    { id: 's1', label: 'มุมโซฟา', note: ' ปลั๊กอยู่ใต้โซฟา ', selected: false },
    { id: 's2', label: 'ข้างเคาน์เตอร์', selected: true },
    blankSpot(),
  ], before, { newId: () => 'SPT-X' });
  assert.deepEqual(value, [
    { id: 's1', label: 'มุมโซฟา', note: 'ปลั๊กอยู่ใต้โซฟา', selected: true },
    { id: 's2', label: 'ข้างเคาน์เตอร์', note: null, selected: false },
  ]);
});

test('ตัวบอกว่าแถวว่าง: ทุกช่องที่คนพิมพ์ได้ว่าง (id ไม่นับ) · 0 ไม่ใช่ค่าว่าง', () => {
  assert.equal(isBlankSurveyPart(blankPart()), true);
  assert.equal(isBlankSurveyPart({ id: 'PRT-1', label: '  ', widthM: null, lengthM: undefined, heightM: ' ' }), true);
  assert.equal(isBlankSurveyPart(null), true);
  assert.equal(isBlankSurveyPart({ ...blankPart(), widthM: 0 }), false, '0 คือค่าที่พิมพ์ผิด ต้องถูกฟ้อง ไม่ใช่ถูกทิ้ง');
  assert.equal(isBlankSurveyPart('ขยะ'), false, 'ของแปลกไม่ใช่แถวว่าง — ต้องไปเจอด่านแล้วถูกตีกลับ');
  assert.equal(isBlankSurveySpot(blankSpot()), true);
  assert.equal(isBlankSurveySpot({ id: 's', label: '', note: 'x' }), false);
});

/* ══ ร่างบนจอ → ของที่ส่ง (จอถามตัวเดียวกับ server) ═══════════════════════ */

test('⭐ ร่างที่ถูกต้องกลายเป็นตัวเลขจริง — "7,5" = 7.5 · แถวว่างไม่ถูกส่ง', () => {
  const { payload, blocker, issues } = surveyZoneSavePayload({
    parts: [part('p1', '7,5', '4', '3', ' ส่วน A '), part('p2', '3', '2', '3'), blankPart('new-z')],
    spots: [{ id: 's1', label: ' มุมเตียงที่ 1 ', note: '', selected: true }, blankSpot()],
    note: '  ลูกค้าขอให้เลี่ยงช่วงเที่ยง  ',
  });
  assert.equal(blocker, null);
  assert.deepEqual(issues, []);
  assert.deepEqual(payload, {
    parts: [
      { id: 'p1', label: 'ส่วน A', widthM: 7.5, lengthM: 4, heightM: 3 },
      { id: 'p2', label: null, widthM: 3, lengthM: 2, heightM: 3 },
    ],
    // ⚠️ ไม่ส่ง `selected` — เป็นของหัวหน้า เส้นนี้ไม่รับอยู่แล้ว
    spots: [{ id: 's1', label: 'มุมเตียงที่ 1', note: null }],
    note: 'ลูกค้าขอให้เลี่ยงช่วงเที่ยง',
  });
  // ของที่จอส่งต้องผ่าน server เสมอ — ตัวเดียวกันตัดสินทั้งสองฝั่ง
  assert.equal(normalizeSurveyParts(payload.parts).error, null);
  assert.equal(normalizeSurveySpots(payload.spots, []).error, null);
});

test('⭐ ร่างว่างทั้งพื้นที่บันทึกได้ — จุด/หมายเหตุไปก่อนได้ ขนาดตามมาทีหลัง', () => {
  const { payload, blocker } = surveyZoneSavePayload({
    parts: [blankPart()], spots: [{ id: 's1', label: 'ข้างประตู', note: '' }], note: '',
  });
  assert.equal(blocker, null);
  assert.deepEqual(payload.parts, []);
  assert.equal(payload.spots.length, 1);
});

test('🔴 ร่างที่ server จะตีกลับ ไม่ถูกส่ง — บอกส่วน/จุดที่ติดด้วยชื่อที่ตาเห็นบนจอ', () => {
  const missing = surveyZoneSavePayload({
    parts: [part('p1', '7.5', '4', '3'), part('p2', '3', '2', '')], spots: [], note: '',
  });
  assert.equal(missing.payload, null);
  assert.equal(missing.blocker, 'ส่วน B ยังขาดความสูง');
  assert.deepEqual(missing.issues, [{ section: 'size', index: 1, field: 'heightM', text: 'ส่วน B ยังขาดความสูง' }]);

  // ขาดหลายช่องในส่วนเดียว = ประโยคเดียว ไม่ใช่ประโยคละช่อง
  const two = surveyZoneSavePayload({ parts: [part('p1', '3', '', '')], spots: [], note: '' });
  assert.equal(two.blocker, 'ส่วน A ยังขาดความยาว · ความสูง');
  assert.deepEqual(two.issues.map((i) => i.field), ['lengthM', 'heightM']);

  assert.equal(surveyZoneSavePayload({ parts: [part('p1', 'x', '4', '3')] }).blocker, 'ส่วน A ความกว้างต้องเป็นตัวเลข');
  assert.equal(surveyZoneSavePayload({ parts: [part('p1', '0', '4', '3')] }).blocker, 'ส่วน A ความกว้างต้องมากกว่า 0');
  assert.match(surveyZoneSavePayload({ parts: [part('p1', '900', '4', '3')] }).blocker, /ส่วน A ความกว้าง 900 ม\. ดูเหมือนพิมพ์ผิดหลัก/);

  // ลำดับบนจอนับแถวว่างด้วย — ช่างเห็น "ส่วน B" ตรงไหน ข้อความต้องชี้ตรงนั้น
  const afterBlank = surveyZoneSavePayload({ parts: [blankPart(), part('p2', '3', '', '3')] });
  assert.equal(afterBlank.blocker, 'ส่วน B ยังขาดความยาว');

  const spot = surveyZoneSavePayload({
    parts: [], spots: [{ id: 's1', label: 'มุมเตียง', note: '' }, { id: 's2', label: '', note: 'ขอรูปใกล้' }], note: '',
  });
  assert.equal(spot.payload, null);
  assert.equal(spot.blocker, 'จุดที่ 2 ยังไม่มีชื่อ');
  assert.deepEqual(spot.issues, [{ section: 'spots', index: 1, field: 'label', text: 'จุดที่ 2 ยังไม่มีชื่อ' }]);
});

test('เพดานส่วน/จุดของ server ใช้กับร่างบนจอด้วย', () => {
  const parts = Array.from({ length: 21 }, (_, i) => part(`p${i}`, 1, 1, 1));
  assert.match(surveyZoneSavePayload({ parts }).blocker, /ไม่เกิน 20 ส่วน/);
});

/* ══ ③ ด่านล็อกของ PATCH ต้องเห็นทุกคอลัมน์ที่ด่านกลางอ่าน ═══════════════════ */

test('🐞 ใบที่ปิดแล้ว (ปิดเรื่อง/ปิดโดยไม่ประเมิน) ต้องล็อกทั้งจอและ route', () => {
  assert.match(surveyEditLockError({ id: 'R1', status: 'closed' }), /ถูกปิดไปแล้ว/);
  assert.match(surveyEditLockError({ id: 'R1', status: 'acknowledged', closedAt: '2026-09-24T03:00:00Z' }), /ยังไม่จบ/);

  const route = code('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js');
  const lock = route.slice(route.indexOf('async function requestLock'), route.indexOf('export const PATCH'));
  const select = lock.match(/\.select\('([^']*)'\)/)?.[1] ?? '';
  /* ⚠️ ยืนยันแบบบวกรายคอลัมน์ — เลือกขาดคอลัมน์ไหน ด่านข้อนั้นอ่านได้ undefined แล้วปล่อยผ่าน
     เงียบ ๆ (ไม่มี error ให้เห็น เพราะคอลัมน์ที่ไม่ถูกเลือกไม่ใช่คอลัมน์ที่ไม่มีอยู่) */
  for (const column of ['status', '"answeredAt"', '"cancelledAt"', '"closedAt"']) {
    assert.ok(select.split(',').map((c) => c.trim()).includes(column), `requestLock ต้องเลือก ${column}`);
  }
});

/* ══ route + การ์ดต้องถามตัวตัดสินชุดเดียว ══════════════════════════════════ */

test('🔴 route ใช้ตัวจัดแถวของกลาง — ไม่มีกฎแถวว่างชุดที่สองใน route', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js');
  assert.match(route, /normalizeSurveyParts\(body\.parts, \{ newId: \(\) => genId\('PRT'\) \}\)/);
  assert.match(route, /normalizeSurveySpots\(body\.spots, row\.spots, \{ newId: \(\) => genId\('SPT'\) \}\)/);
  assert.doesNotMatch(route, /function normalize(Parts|Spots)\b/, 'ห้ามมีตัวจัดแถวของตัวเองใน route');
});

test('🐞 ตัด/เอากลับส่งแค่สถานะ (หน้า) · บันทึกส่งของที่ผ่านตัวจัดแถวแล้วเท่านั้น (หน้าพื้นที่)', () => {
  /* 🔄 §10.5 S7 — กล่องเหตุผลตัดออกย้ายจากการ์ดขึ้นมาที่หน้า (เปิดได้จากเมนู ⋮ และแถวท้ายเนื้อของหน้าพื้นที่)
     ⇒ คำขอตัด/เอากลับอยู่ที่ page.js · คำขอบันทึกผลวัดยังอยู่ที่หน้าพื้นที่ (ร่างอยู่ที่นั่น) */
  const page = code('../../app/service/surveys/[id]/page.js');
  assert.match(page, /json: \{ status: "cut", cutReason: cutReason\.trim\(\) \}/);
  assert.match(page, /json: \{ status: "ok" \}/);
  assert.doesNotMatch(page, /status: "cut"[^}]*parts/, 'ตัดออกห้ามพ่วงร่างขนาด — ร่างว่างทำให้ตัดไม่ได้');
  const zonePage = code('../../components/service/SurveyZonePage.js');
  assert.doesNotMatch(zonePage, /status: "(cut|ok)"/, 'หน้าพื้นที่ไม่ยิงคำขอตัด/เอากลับเอง — ส่งเรื่องขึ้นหน้า');
  assert.doesNotMatch(zonePage, /onSave\(\{ parts/, 'ห้ามส่งร่างดิบ — ต้องผ่านตัวจัดแถวของกลาง');
  assert.match(zonePage, /surveyZoneSavePayload\(/);
  // 🔄 review 26/09 — ของที่ผ่านตัวจัดแถวแล้ว + รุ่นของแถวที่ร่างตั้งต้น (ด่านชนรุ่นข้างล่าง)
  // รอบสอง: ส่งเฉพาะส่วนที่แก้ (`payload` ตัดจาก `plan.payload` — ผ่านตัวจัดแถวแล้วเหมือนเดิม)
  assert.match(zonePage, /return keys\.length \? Object\.fromEntries\(keys\.map\(\(k\) => \[k, plan\.payload\[k\]\]\)\) : null;/);
  assert.match(zonePage, /onSave\(\{ \.\.\.payload, baseUpdatedAt: base \?\? undefined \}\)/);
});

/* ══ ④ ช่างสองคนบันทึกพื้นที่เดียวกัน — ด่านรุ่นของแถว (🐞 review 26/09) ══════════════
   🐞 หัวหน้าทีมกับผู้ช่วยเปิดพื้นที่เดียวกัน (ยังไม่มีขนาด ⇒ ร่างของทั้งคู่มีส่วนว่างหนึ่งแถว) · ผู้ช่วยพิมพ์จุด
     "มุมเตียง" · หัวหน้าทีมวัด 7.5 × 4 × 3 แล้วบันทึก · หน้าของผู้ช่วยยังไม่โหลดใหม่ แล้วกดบันทึก ⇒ ตัวจัดแถว
     ทิ้งส่วนว่าง = `parts: []` ⇒ PATCH เขียนทั้งก้อนทับขนาดที่เพิ่งวัดเงียบ ๆ (พื้นที่เด้งกลับเป็น "ขาดขนาด")
     ก่อนรื้อจอ server ตีกลับแถวว่าง ("ต้องระบุกว้าง") เลยไม่เคยทับ */
const T0 = '2026-09-26T03:00:00.123456+00:00';
const T1 = '2026-09-26T03:05:00.654321+00:00';
const T2 = '2026-09-26T03:09:00+00:00';

test('🐞 ร่างเก่าของผู้ช่วย (ส่วนว่าง + จุด) ส่ง `parts: []` — ด่านรุ่นต้องตีกลับ ไม่ใช่ทับขนาดที่อีกคนเพิ่งวัด', () => {
  const helper = surveyZoneSavePayload({ parts: [blankPart()], spots: [{ id: 'new-s', label: 'มุมเตียง', note: '' }], note: '' });
  assert.deepEqual(helper.payload.parts, [], 'ทรงที่ทำให้ทับได้ — ตัวจัดแถวรับ [] ว่า "ไม่มีส่วน"');
  const leadRow = { id: 'Z1', updatedAt: T1, parts: [{ id: 'p1', widthM: 7.5, lengthM: 4, heightM: 3 }] };
  assert.equal(surveyZoneStaleError(leadRow, T0), SURVEY_ZONE_STALE_TEXT, 'ร่างตั้งต้นจาก T0 แต่แถวในฐานเป็น T1 แล้ว');
  assert.equal(surveyZoneStaleError(leadRow, T1), null, 'รุ่นตรงกัน = บันทึกได้');
  // ⚠️ แท็บเก่าที่เปิดค้างไม่ส่งช่องนี้ — ต้องบันทึกได้เหมือนเดิม
  assert.equal(surveyZoneStaleError(leadRow, undefined), null);
  assert.equal(surveyZoneStaleError(leadRow, null), null);
  // เทียบเป็นสตริงตรง ๆ — เศษไมโครวินาทีต่างกัน = คนละรุ่น (ตัวแปลงเวลาของ JS ตัดทิ้งจนดูเป็นรุ่นเดียว)
  assert.equal(surveyZoneStaleError({ updatedAt: '2026-09-26T03:05:00.654321+00:00' }, '2026-09-26T03:05:00.654999+00:00'),
    SURVEY_ZONE_STALE_TEXT);
});

test('409 ของด่านรุ่นพกแถวล่าสุดกลับไป · จอแยกออกจาก 409 ตัวอื่น (ใบล็อก) ได้', () => {
  const row = { id: 'Z1', updatedAt: T1 };
  assert.deepEqual(surveyZoneStaleBody(row), { error: SURVEY_ZONE_STALE_TEXT, code: SURVEY_ZONE_STALE_CODE, zone: row });
  assert.deepEqual(surveyZoneStaleBody(), { error: SURVEY_ZONE_STALE_TEXT, code: SURVEY_ZONE_STALE_CODE, zone: null });

  // ทรงของ `ApiError` ที่ apiJson โยน — { message, status, data }
  const err = (status, data) => Object.assign(new Error(data?.error || 'x'), { status, data });
  assert.deepEqual(surveyZoneStaleReply(err(409, surveyZoneStaleBody(row))), { zone: row });
  assert.deepEqual(surveyZoneStaleReply(err(409, surveyZoneStaleBody(null))), { zone: null });
  // ใบถูกล็อก / ปิดแล้ว ก็เป็น 409 — ต้องขึ้นเป็น error ธรรมดา ไม่ใช่ป้าย "ถูกแก้จากที่อื่น"
  assert.equal(surveyZoneStaleReply(err(409, { error: 'ส่งผลไปแล้ว — ดึงกลับก่อนถึงจะแก้ได้' })), null);
  assert.equal(surveyZoneStaleReply(err(500, surveyZoneStaleBody(row))), null);
  assert.equal(surveyZoneStaleReply(new Error('เชื่อมต่อไม่ได้')), null);
  assert.equal(surveyZoneStaleReply(null), null);
});

test('ฐานของร่างขยับตามแถวใหม่ได้เฉพาะเมื่อค่าของช่างเท่าเดิม — ไม่งั้นช่างที่ไม่ได้ชนกับใครโดน 409 ฟรี', () => {
  const S0 = surveyZoneDraftSignature({ parts: [] });
  const S1 = surveyZoneDraftSignature({ parts: [part('p1', 7.5, 4, 3)] });
  const base = surveyZoneNextBase(null, { at: T0, sig: S0 });
  assert.deepEqual(base, { at: T0, sig: S0 }, 'เปิดหน้า = ร่างตั้งต้นจากแถวที่เห็น');

  // หัวหน้าเคาะแพ็คเกจ (PUT) / ตัด-เอากลับ เขียน updatedAt แต่ไม่แตะขนาด·จุด·หมายเหตุ ⇒ ไม่มีของใครให้ทับ
  assert.deepEqual(surveyZoneNextBase(base, { at: T1, sig: S0 }), { at: T1, sig: S0 });
  // ผลบันทึกของเราเอง (ผู้ใช้พิมพ์ต่อระหว่างรอ ⇒ ตัวรับแถวใหม่ตอบ 'same' ไม่ได้รับแถวลงช่อง)
  assert.deepEqual(surveyZoneNextBase(base, { at: T1, sig: S1 }, { sentSig: S1 }), { at: T1, sig: S1 });
  // 🔴 อีกคนแก้ค่า = ฐานอยู่ที่เดิม (ตัวเดิมเป๊ะ) ⇒ server ตีกลับ
  assert.equal(surveyZoneNextBase(base, { at: T1, sig: S1 }), base);
  assert.equal(surveyZoneNextBase(base, { at: T1, sig: S1 }, { sentSig: null }), base);
  // ไม่ถอยไปรุ่นที่เก่ากว่า (หน้าแม่ยังถือแถวเก่า หลังรับแถวที่ 409 พกมา) · รุ่นเดิม = ตัวเดิม
  const ahead = { at: T1, sig: S1 };
  assert.equal(surveyZoneNextBase(ahead, { at: T0, sig: S0 }, { sentSig: S0 }), ahead);
  assert.equal(surveyZoneNextBase(ahead, { at: T1, sig: S1 }), ahead);
  // สตริงของ PostgREST ที่ไม่มีเศษวินาที ("…:00+00:00") ยังเรียงถูก
  assert.deepEqual(surveyZoneNextBase(ahead, { at: T2, sig: S1 }), { at: T2, sig: S1 });
  // แถวไม่มีรุ่น (ไม่ควรเกิด — คอลัมน์ NOT NULL) = ไม่ขยับ
  assert.equal(surveyZoneNextBase(ahead, { at: null, sig: S1 }), ahead);
});

test('แถวที่ใหม่กว่า — prop ของหน้าแม่ vs แถวที่ 409 พกมา', () => {
  const prop = { id: 'Z1', updatedAt: T0 };
  const stale = { id: 'Z1', updatedAt: T1 };
  assert.equal(surveyZoneLatestRow(prop, stale), stale);
  assert.equal(surveyZoneLatestRow(stale, prop), stale);
  assert.equal(surveyZoneLatestRow(prop, null), prop);
  assert.equal(surveyZoneLatestRow(null, stale), stale);
  assert.equal(surveyZoneLatestRow(prop, { ...prop }), prop, 'รุ่นเท่ากัน = ตัวแรก (prop)');
  assert.equal(surveyZoneLatestRow(null, null), null);
});

test('🔴 route ถามด่านรุ่นก่อนเขียน · เขียนแบบมีเงื่อนไขกับรุ่นที่อ่าน · 0 แถว = 409 ไม่ใช่ 500/ทับ', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js');
  const patch = route.slice(route.indexOf('export const PATCH'), route.indexOf('export const PUT'));
  assert.match(patch, /surveyZoneStaleError\(row, body\.baseUpdatedAt\)/);
  assert.ok(patch.indexOf('surveyZoneStaleError(') < patch.indexOf('.update(patch)'), 'ถามก่อนเขียน');
  // ช่องระหว่างอ่านกับเขียน: อีกคนบันทึกแทรกกลาง = update ไม่โดนแถวไหน (supabase ไม่ throw และไม่ใช่ error)
  assert.match(patch, /\.update\(patch\)\.eq\('id', zoneId\)\.eq\('updatedAt', row\.updatedAt\)\.select\(\)\.maybeSingle\(\)/);
  assert.match(patch, /if \(!data\) \{/);
  assert.equal((patch.match(/surveyZoneStaleBody\(/g) || []).length, 2, '409 ทั้งสองทางพกแถวล่าสุด');
  assert.match(patch, /status: 409/);
});

test('🔴 หน้าพื้นที่: 409 ชนรุ่น = ป้าย "ถูกแก้จากที่อื่น" + ค่าที่พิมพ์อยู่ครบ · 409 อื่น = error เดิม', () => {
  const zonePage = code('../../components/service/SurveyZonePage.js');
  const save = zonePage.slice(zonePage.indexOf('const save = async'), zonePage.indexOf('const title = surveyZoneTitle('));
  assert.match(save, /surveyZoneStaleReply\(e\)/);
  assert.match(save, /setConflict\(true\)/);
  assert.doesNotMatch(save, /set(Parts|Spots|Note)\(/, 'ตีกลับแล้วค่าที่พิมพ์ต้องอยู่ครบ');
  // ป้ายขึ้นอยู่ = ผู้ใช้อ่านแล้วว่า "กดบันทึกจะทับของเขา" ⇒ กดอีกครั้งต้องทับได้จริง (ไม่งั้นป้ายโกหก)
  assert.match(save, /conflict\s*\?\s*surveyZoneLatestRow\(zoneRef\.current, staleRowRef\.current\)/);
  // ปุ่ม "ใช้ค่าล่าสุดจากฐาน" ต้องได้แถวที่ 409 พกมา — prop ยังเป็นรุ่นเก่าจนกว่าหน้าแม่จะโหลดใหม่
  const adopt = zonePage.slice(zonePage.indexOf('const adoptRow = useCallback'), zonePage.indexOf('useEffect(() => {', zonePage.indexOf('const adoptRow')));
  assert.match(adopt, /surveyZoneLatestRow\(row, staleRowRef\.current\)/);
  assert.match(adopt, /baseRef\.current = /);
});

test('🐞 review 26/09 รอบสาม: แท็บรุ่นเก่าส่งส่วน/จุดว่างทั้งก้อน (ไม่มีรุ่น) = ไม่แตะช่องนั้น — ไม่กลายเป็น [] ทับขนาดของอีกคน', async () => {
  const { surveyOnlyBlankRows } = await import('./survey.js');
  assert.equal(surveyOnlyBlankRows([{ id: 'x', label: '', widthM: '', lengthM: '', heightM: '' }], ['label', 'widthM', 'lengthM', 'heightM']), true);
  assert.equal(surveyOnlyBlankRows([{ label: '', widthM: '7.5' }], ['label', 'widthM', 'lengthM', 'heightM']), false);
  assert.equal(surveyOnlyBlankRows([], ['label']), false, '[] ชัด ๆ = ล้างทั้งหมด (จอรุ่นใหม่ส่งแบบนี้เท่านั้น)');
  assert.equal(surveyOnlyBlankRows(undefined, ['label']), false);
  const route = readFileSync(new URL('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js', import.meta.url), 'utf8');
  assert.match(route, /if \(body\.baseUpdatedAt === undefined\) \{\s*if \(surveyOnlyBlankRows\(body\.parts, \['label', 'widthM', 'lengthM', 'heightM'\]\)\) body\.parts = undefined;/);
});

test('🐞 review 26/09 รอบสาม: บันทึก — ไม่มีส่วนไหนต่างจากที่ตั้งต้น = ไม่ส่ง (รับแถวล่าสุด) · ลองซ้ำเทียบส่วนที่แก้ใหม่กับฐานใหม่ · ฐาน = แถวที่เพิ่งบันทึก', () => {
  const zonePage = readFileSync(new URL('../../components/service/SurveyZonePage.js', import.meta.url), 'utf8');
  assert.match(zonePage, /let payload = pick\(baseRef\.current\?\.sig\);\s*if \(!payload\) \{\s*adoptRow\(zoneRef\.current\);\s*return;/);
  assert.match(zonePage, /payload = pick\(next\.sig\);/);
  assert.match(zonePage, /if \(saved\?\.updatedAt\) baseRef\.current = \{ at: saved\.updatedAt, sig: surveyZoneDraftSignature\(saved\) \};/);
  const page = readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /const saved = await apiJson\(`\/api\/service\/surveys\/\$\{id\}\/zones\/\$\{zoneId\}`/);
  assert.match(page, /return saved;/);
});
