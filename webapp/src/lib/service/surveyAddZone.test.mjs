// ── ช่างเพิ่มพื้นที่ที่เจอหน้างาน (มติข้อ 6 · แผน §9) ──────────────────────
//
// 🐞 **บั๊กที่เทสต์ชุดนี้เกิดมาเพื่อกัน**: `service_survey_zones.status` รับค่า `'added'`
//   มาตั้งแต่ mig 0314 และป้ายบนจอ SA ก็เขียนรอไว้แล้ว แต่ **ไม่มีจุดเขียนสักจุด** —
//   INSERT เส้นเดียวที่มีไม่เคยส่งคอลัมน์นี้ และ `PATCH` ปฏิเสธค่านี้ตรง ๆ
//   ⇒ ค่านี้ผ่านเทสต์ทั้งระบบมาตลอด เพราะไม่มีเทสต์ไหนถามว่า "มันไปถึงได้ยังไง"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isAddedZone, surveyAddZoneError, surveyTotals } from './survey.js';
import { normalizeAddedZone, surveyRowNameClash } from './surveyRequest.js';
import { busySurveyRequests, surveyZoneBusyError } from './zonePickState.js';

/** ตัดคอมเมนต์ออกก่อนค้นซอร์ส — ยามที่ห้ามพูดถึงคำไหน ทำให้ไฟล์อธิบายตัวเองไม่ได้
 *  (บทเรียนซ้ำจาก renewals.js และ recall/route.js) */
const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const request = (over = {}) => ({
  id: 'REQ1', kind: 'site_survey', docNo: 'RQ-1', siteId: 'SST1',
  answeredAt: null, cancelledAt: null, ...over,
});

/* ══ ด่าน ══════════════════════════════════════════════════════════════ */

test('🔑 ด่านเพิ่มพื้นที่ = ด่านเดียวกับการบันทึกผลวัด', () => {
  assert.equal(surveyAddZoneError(request(), { canWrite: true }), null);
  assert.match(surveyAddZoneError(request(), { canWrite: false }), /ถูกมอบหมาย/);
  // fail-closed: ไม่ส่งบริบทมา = ปฏิเสธ
  assert.ok(surveyAddZoneError(request()));
});

test('🔴 ส่งผลไปแล้ว/ยกเลิกแล้ว เพิ่มไม่ได้ — และต้องบอกทางออก', () => {
  const sent = surveyAddZoneError(request({ answeredAt: '2026-09-10T00:00:00Z' }), { canWrite: true });
  assert.match(sent, /ส่งผลให้ฝ่ายขายไปแล้ว/);
  assert.match(sent, /ยังไม่จบ/, 'ห้ามห้ามเฉย ๆ — ต้องบอกว่ากดอะไรต่อ');
  assert.match(surveyAddZoneError(request({ cancelledAt: 'x' }), { canWrite: true }), /ยกเลิก/);
});

/* ══ ฟอร์ม ═════════════════════════════════════════════════════════════ */

test('🔑 ชั้นบังคับ — ไม่มีชั้นก็ออกรหัส ZN ไม่ได้ (mig 0315)', () => {
  assert.deepEqual(
    normalizeAddedZone({ name: ' โถงลิฟต์ชั้น 3 ', floor: 'g', note: '' }).value,
    { name: 'โถงลิฟต์ชั้น 3', floor: 'GF', note: null },
  );
  assert.match(normalizeAddedZone({ name: 'โถง' }).error, /ชั้น/);
  assert.match(normalizeAddedZone({ name: 'โถง', floor: 'ชั้นบนสุด' }).error, /ชั้นต้องเป็น/);
  assert.match(normalizeAddedZone({ floor: '3' }).error, /ชื่อพื้นที่/);
});

/* 🔴 `status` ต้องไม่ใช่ของที่ client เลือกได้ — ไม่งั้นแถวที่ SA ขอมาย้อมตัวเองเป็น
   'added' ได้ แล้วป้ายบนจอโกหก */
test('🔴 ฟอร์มไม่มีช่อง status ให้ส่งมา', () => {
  const { value } = normalizeAddedZone({ name: 'โถง', floor: '3', status: 'ok' });
  assert.deepEqual(Object.keys(value).sort(), ['floor', 'name', 'note']);
});

test('ชื่อซ้ำกับแถวที่ใบนี้มีอยู่แล้ว ตีกลับ — และแถวที่ถูกตัดออกก็นับ', () => {
  const rows = [{ zoneName: 'ล็อบบี้ ชั้น G', status: 'ok' }, { zoneName: 'โถงเหนือ', status: 'cut' }];
  // เทียบแบบเดียวกับ unique index ของ DB (ตัดช่องว่างซ้ำ · ไม่สนตัวพิมพ์)
  assert.match(surveyRowNameClash('ล็อบบี้  ชั้น g', rows), /มีพื้นที่ชื่อ/);
  const cut = surveyRowNameClash('โถงเหนือ', rows);
  assert.match(cut, /เอากลับเข้าใบแทน/, 'ของที่ถูกตัดออกยังอยู่ในใบ — ต้องบอกทางที่ถูก');
  assert.equal(surveyRowNameClash('พื้นที่ใหม่จริง', rows), null);
});

/* ══ ยอดรวม ════════════════════════════════════════════════════════════ */

test('🔑 นับพื้นที่ที่ TS เพิ่มเองแยกจากที่ SA ขอมา', () => {
  const t = surveyTotals([
    { status: 'ok', parts: [], spots: [] },
    { status: 'added', parts: [], spots: [] },
    { status: 'cut', parts: [], spots: [] },
  ]);
  assert.equal(t.zones, 2, 'แถวที่เพิ่มหน้างานนับเป็นพื้นที่จริง ไม่ใช่ของนอกใบ');
  assert.equal(t.addedZones, 1);
  assert.equal(t.cutZones, 1);
  assert.equal(surveyTotals([]).addedZones, 0);
  assert.equal(isAddedZone({ status: 'added' }), true);
  assert.equal(isAddedZone({}), false);
});

/* ══ ยามผูกกับซอร์สจริง ═══════════════════════════════════════════════ */

test('🔴 เส้นสร้างแถวต้องมีอยู่จริง และตั้ง status ที่นั่นที่เดียว', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/route.js');
  assert.match(route, /export const POST/);
  assert.match(route, /status: 'added'/);
  assert.match(route, /surveyAddZoneError\(/, 'ต้องใช้ตัวตัดสินกลาง ไม่ใช่เขียนเงื่อนไขซ้ำ');
});

/* 🔴 **กับดักที่ใหญ่ที่สุดของข้อนี้** — พื้นที่ใหม่ของ SA รอรหัส ZN ถึงตอน "กดส่งใบ"
   แต่พื้นที่ที่เพิ่มหน้างานเกิด *หลัง* ใบถูกส่งไปแล้ว ⇒ ไม่มีจังหวะนั้นให้รออีก
   ⇒ ปล่อย zoneId ว่าง = แถวหายจากทะเบียนพื้นที่ของลูกค้าสองชั้น (ชั้นอ่าน `.in('zoneId')`
     และชั้นคำนวณ `if (!row.zoneId) continue`) ⇒ ขายไม่ได้ ลงเครื่องไม่ได้ เงียบสนิท */
test('🔴 พื้นที่ที่เพิ่มหน้างานต้องได้รหัส ZN ทันที ไม่ใช่รอกดส่งใบ', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/route.js');
  assert.match(route, /materializeSurveyZones\(/);
  // ล้มแล้วต้องถอนแถวคืน — แถวที่ไม่มี zoneId ยังล็อกใบไม่ให้ส่งผลได้ (ด่านบล็อกทั้งใบ)
  assert.match(route, /delete\(\)\.eq\('id', row\.id\)/);
});

test('🔴 ประตูใหม่ต้องเจอยาม "ใบสั่งวัดค้าง" ตัวเดียวกับฟอร์มของ SA', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/route.js');
  assert.match(route, /busySurveyRequests\(/);
  assert.match(route, /r\.requestId !== id/, 'ต้องตัดใบของตัวเองออก ไม่งั้นฟ้องว่าตัวเองค้าง');

  // ตัวตัดสินย้ายออกมาแล้วต้องยังให้คำตอบเดิมกับผู้เรียกเดิม
  const openRows = [{ zoneId: 'Z1', requestId: 'R9', status: 'ok' }];
  const byId = new Map([['R9', { id: 'R9', docNo: 'RQ-9', status: 'acknowledged' }]]);
  assert.equal(busySurveyRequests(openRows, byId).get('Z1').docNo, 'RQ-9');
  assert.match(surveyZoneBusyError([{ zoneId: 'Z1' }], openRows, byId), /RQ-9/);
});

/* 🔴 คอลัมน์เดียวเก็บได้ค่าเดียว — เขียน 'cut' ทับ 'added' = ป้ายหายถาวร
   แล้วกด "เอากลับเข้าใบ" จะได้แถวที่โผล่มาเป็นของ SA ทั้งที่ SA ไม่เคยขอ */
test('🔴 แถวที่เพิ่มหน้างาน ตัดออกไม่ได้ — ต้องลบทิ้ง', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js');
  assert.match(route, /row\.status === 'added'/);
  assert.match(route, /export const DELETE/);
  assert.match(route, /row\.status !== 'added'/, 'DELETE ต้องกันไม่ให้ลบแถวที่ SA ขอมา');
});

/* ด่านหกข้อบล็อก **ทั้งใบ ไม่ใช่รายแถว** ⇒ แถวที่เพิ่มผิดแล้วกรอกไม่จบจะล็อกใบตลอดกาล
   ถ้าไม่มีทางลบ · และไฟล์ของแถวต้องหายตามไปด้วย (ด่าน attachmentCascade ใน CI) */
test('🔴 ลบแถวต้องกวาดไฟล์แนบ และผ่านตัวกวาดตัวกลางตัวเดียว', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js');
  assert.match(route, /purgeSurveyZoneRows\(/);
  assert.doesNotMatch(route, /from\('service_survey_zones'\)\.delete\(\)/,
    'ห้ามลบแถวเองที่ route — เส้นลบทุกเส้นต้องผ่านตัวกวาดที่กวาดไฟล์ให้ด้วย');

  const cleanup = code('./surveyCancelCleanup.js');
  assert.match(cleanup, /purgeAttachments\('service_survey_zone'/);
});

/* ⚠️ โซนที่ขายไปแล้ว/มีเครื่อง ต้องอยู่ต่อ **พร้อมประวัติการวัด** ⇒ ถามก่อนลบแถว */
test('🔴 ลบแถวแล้วโซนกำพร้าต้องถูกถอนออกจากทะเบียนด้วย และตัดสินก่อนลบ', () => {
  const route = code('../../app/api/service/surveys/[id]/zones/[zoneId]/route.js');
  const decideAt = route.indexOf('zoneReleaseDecision(supabase');
  const purgeAt = route.indexOf('purgeSurveyZoneRows(supabase');
  assert.ok(decideAt > 0 && purgeAt > decideAt, 'ต้องตัดสินชะตาโซนก่อนแตะแถวผลวัด');
  assert.match(route, /deleteZoneRow\(/);
});

test('🔑 กระดิ่งตอนส่งผลต้องบอกว่ามีพื้นที่ที่ TS เพิ่มเอง (แผน §9 ข้อ 3)', () => {
  const send = code('../../app/api/service/surveys/[id]/send/route.js');
  assert.match(send, /totals\.addedZones \? ` · TS เพิ่มหน้างาน/);
});

test('🔑 ป้าย "เพิ่มหน้างาน" ต้องขึ้นทั้งจอช่างและจอสรุป (แผน §9 ข้อ 1)', () => {
  const card = code('../../components/service/SurveyZoneCard.js');
  assert.match(card, /"added"/);
  assert.match(card, /เพิ่มหน้างาน/);
  assert.match(card, /ลบพื้นที่นี้ทิ้ง/, 'แถวที่เพิ่มเองต้องมีทางลบบนจอ ไม่ใช่มีแต่ที่ API');

  const table = code('../../components/service/SurveyResultTable.js');
  assert.match(table, /zone\.status === "added"/);

  // ป้ายฝั่ง SA มีมาตั้งแต่แรกแล้ว — เทสต์ไว้กันคนลบทิ้งเพราะคิดว่าเป็นโค้ดตาย
  const detail = code('../../components/requests/details/SurveyDetail.js');
  assert.match(detail, /added: "เจ้าหน้าที่เพิ่มหน้างาน"/);
});

test('🔑 จอหน้างานต้องมีปุ่มเพิ่ม + ยิงเข้าเส้นสร้างแถว', () => {
  const page = code('../../app/service/surveys/[id]/page.js');
  assert.match(page, /เพิ่มพื้นที่ที่เจอหน้างาน/);
  assert.match(page, /method: "POST", json: draft/);
  assert.match(page, /method: "DELETE"/);
  assert.match(page, /surveyAddZoneError\(/, 'ปุ่มต้องปิดด้วยด่านตัวเดียวกับ server');
});
