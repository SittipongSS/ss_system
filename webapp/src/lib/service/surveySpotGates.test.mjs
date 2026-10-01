// ── ด่านรูปจุด (มติเจ้าของ 01/10) — G1 ช่างส่งงาน · G2 หัวหน้าส่งผล ─────────────────────
//
// G1 ช่างกด "ส่งงาน" ได้ต่อเมื่อ **ทุกจุดมีรูปที่ผูกกับจุดนั้นอย่างน้อยหนึ่งรูป** และถาด "ยังไม่ได้ผูกจุด" ว่าง
//    (ช่างผูกเองได้) · เหตุบอกชื่อพื้นที่ + เลขจุด ("Reception · จุด 1.3 ยังไม่มีรูป")
// G2 หัวหน้ากด "ส่งผลให้ฝ่ายขาย" ไม่ได้ ตราบใดที่ยังมีรูปในถาด — "มีรูปจุดที่ยังไม่ได้ผูก n รูป — ผูกก่อนส่งผล"
// ⭐ นับด้วยกติกาเดียวกับถาด (`isSpotPhoto` + `spotPhotoGroups().unlinked`) · พื้นที่ที่ถูกตัดไม่นับ
// ⭐ ด่านเดียวทั้ง server (route ส่งงาน · route ส่งผล) และจอ (การ์ดควบคุม · แถบส่งงาน · กล่องส่งงาน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SPOT_GATE_LINKED, SPOT_GATE_PHOTOS, spotGapNote, surveySpotGates, surveySpotPhotoGaps, surveySpotSendError,
  surveySpotSubmitError, surveySpotSubmitReason,
} from './surveySpotPhotos.js';
import { surveyFieldSubmitError, surveySendError } from './survey.js';
import { surveyControlView as controlView } from './surveyControl.js';
import { surveyFieldBarView, surveySubmitView, surveyZoneListView } from './surveyFieldView.js';

/* การ์ดได้ทะเบียนขนาดแพ็คเกจจาก GET ใบประเมินเสมอ (mig 0398) — ด่าน "ขนาดถูกลบ" มีเทสต์ของตัวเองใน surveyControl.test */
const SIZES = [{ code: 'ST', nameEn: 'Standard', maxCbm: null, autoSuggest: true }];
const surveyControlView = (args = {}) => controlView({ packageSizes: SIZES, ...args });

const part = (w, l, h) => ({ widthM: w, lengthM: l, heightM: h, label: null });
const WIDE = { id: 'W', docType: 'survey_wide', fileName: 'wide.jpg' };
const PLAN = { id: 'P', docType: 'survey_plan', fileName: 'plan.jpg' };
const spotPhoto = (id, spotId) => ({
  id, docType: 'survey_spot', fileName: `${id}.jpg`, createdAt: `2026-10-01T0${id.length % 9}:00:00+00:00`,
  metadata: spotId === undefined ? {} : { spotId },
});
const spots = (zoneId, n, selected = true) => Array.from({ length: n }, (_, i) => ({
  id: `${zoneId}-s${i + 1}`, label: `จุด ${i + 1}`, selected,
}));
/** พื้นที่ที่ครบทั้งหกข้อของ `SURVEY_GATES` — เหลือแค่เรื่องรูปจุด */
const zone = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneName: name, floor: null, status: 'ok',
  parts: [part(4, 5, 3)], spots: spots(id, 1), packageQty: 1, packageSize: 'ST', packageNote: '', note: '', ...extra,
});
/** ไฟล์ที่ทำให้ทุกจุดของพื้นที่มีรูป */
const allLinked = (z) => [WIDE, PLAN, ...z.spots.map((s) => spotPhoto(`F-${s.id}`, s.id))];

/* ══ ตัวนับ ══════════════════════════════════════════════════════════════ */

test('🔑 นับจุดที่ยังไม่มีรูป + รูปในถาด ต่อพื้นที่ · เลขจุด k.n = ลำดับพื้นที่ในใบ (รวมที่ตัด) · ลำดับจุดบนจอ', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 3) });
  const cut = zone('C', 'ห้องเก็บของ', { status: 'cut', cutReason: 'ลูกค้าไม่เอา' });
  const b = zone('B', 'ห้อง MD', { spots: spots('B', 2) });
  const files = {
    A: [WIDE, spotPhoto('F1', 'A-s1'), spotPhoto('F2', 'A-s2'), spotPhoto('F3')],
    C: [spotPhoto('F9')], // พื้นที่ที่ถูกตัด — ไม่นับทั้งจุดและถาด
    B: [WIDE, spotPhoto('F4', 'B-s2'), spotPhoto('F5', 'B-gone')], // ชี้จุดที่ลบไปแล้ว = ถาด
  };
  const gaps = surveySpotPhotoGaps([a, cut, b], files);
  assert.equal(gaps.active, 2);
  assert.equal(gaps.missingTotal, 2);
  assert.equal(gaps.unlinkedTotal, 2);
  assert.deepEqual(gaps.zones.map((z) => [z.zoneId, z.number, z.missing.map((m) => m.number), z.unlinked]), [
    ['A', 1, ['1.3'], 1],
    ['B', 3, ['3.1'], 1],
  ]);
  assert.equal(gaps.zones[0].zoneName, 'Reception');
});

test('รูปที่ไม่ใช่รูปของจุดไม่นับ — ภาพกว้าง/ผังที่มี spotId ติดมา · PDF ในกองภาพจุด (กติกาเดียวกับถาด)', () => {
  const a = zone('A', 'Reception');
  const pdf = { id: 'PDF', docType: 'survey_spot', fileName: 'x.pdf', mimeType: 'application/pdf', metadata: {} };
  const wideWithSpot = { ...WIDE, metadata: { spotId: 'A-s1' } };
  const gaps = surveySpotPhotoGaps([a], { A: [wideWithSpot, pdf] });
  assert.equal(gaps.unlinkedTotal, 0, 'PDF ไม่อยู่ในถาด (ถาดบนจอไม่มีมัน) ⇒ ไม่บล็อก');
  assert.deepEqual(gaps.zones[0].missing.map((m) => m.number), ['1.1'], 'ภาพกว้างไม่ใช่รูปของจุด');
});

test('ไฟล์ยังไม่มา (`{}`) = ทุกจุดยังไม่มีรูป — fail-closed เหมือน `surveyDocCounts` · ค่าแปลกปลอมไม่พัง', () => {
  const gaps = surveySpotPhotoGaps([zone('A', 'Reception', { spots: spots('A', 2) })], {});
  assert.equal(gaps.missingTotal, 2);
  assert.deepEqual(surveySpotPhotoGaps(null, null), { zones: [], active: 0, missingTotal: 0, unlinkedTotal: 0 });
  assert.equal(surveySpotPhotoGaps([zone('A', 'x', { spots: null })], { A: null }).missingTotal, 0);
});

test('หมายเหตุต่อพื้นที่ (แถวในกล่องส่งงาน): เลขจุดที่ยังไม่มีรูป · จำนวนรูปในถาด', () => {
  const gaps = surveySpotPhotoGaps([zone('A', 'Reception', { spots: spots('A', 2) })], {
    A: [spotPhoto('F1'), spotPhoto('F2')],
  });
  assert.equal(spotGapNote(gaps.zones[0]), 'จุด 1.1, 1.2 ยังไม่มีรูป · ยังไม่ได้ผูกจุด 2 รูป');
  assert.equal(spotGapNote(null), null);
});

/* ══ G1 — ช่างส่งงาน ═════════════════════════════════════════════════════ */

test('🔑 G1: ทุกจุดมีรูป + ถาดว่าง = ส่งงานได้', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 2) });
  assert.equal(surveySpotSubmitError([a], { A: allLinked(a) }), null);
  assert.equal(surveySpotSubmitReason([a], { A: allLinked(a) }), null);
});

test('🔑 G1: จุดที่ยังไม่มีรูปบล็อก — เหตุบอกชื่อพื้นที่และเลขจุด', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 3) });
  const files = { A: [WIDE, spotPhoto('F1', 'A-s1'), spotPhoto('F2', 'A-s2')] };
  assert.equal(surveySpotSubmitError([a], files), 'ยังส่งงานไม่ได้ — Reception · จุด 1.3 ยังไม่มีรูป');
  assert.equal(surveySpotSubmitReason([a], files), 'Reception · จุด 1.3 ยังไม่มีรูป', 'แถบใช้เหตุตัวเดียวกันแบบไม่มีคำนำ');
});

test('🔑 G1: รูปในถาด "ยังไม่ได้ผูกจุด" บล็อกการส่งงานด้วย (ช่างผูกเองได้)', () => {
  const a = zone('A', 'Reception');
  const files = { A: [...allLinked(a), spotPhoto('F8'), spotPhoto('F9', 'A-deleted')] };
  const err = surveySpotSubmitError([a], files);
  assert.match(err, /^ยังส่งงานไม่ได้ — /);
  assert.match(err, /มีรูปที่ยังไม่ได้ผูกจุด 2 รูป/);
  assert.match(err, /Reception/);
});

test('G1: สองเรื่องพร้อมกัน = บอกครบทั้งสอง · หลายพื้นที่บอกสามพื้นที่แรก · จุดเยอะบอกห้าจุดแรก', () => {
  const zones = ['A', 'B', 'C', 'D'].map((id, i) => zone(id, `ห้อง ${i + 1}`, { spots: spots(id, id === 'A' ? 7 : 1) }));
  const err = surveySpotSubmitError(zones, { B: [spotPhoto('F1')] });
  assert.match(err, /ห้อง 1 · จุด 1\.1, 1\.2, 1\.3, 1\.4, 1\.5 และอีก 2 จุด ยังไม่มีรูป/);
  assert.match(err, /ห้อง 2 · จุด 2\.1 ยังไม่มีรูป/);
  assert.match(err, /และอีก 1 พื้นที่/);
  assert.match(err, /มีรูปที่ยังไม่ได้ผูกจุด 1 รูป \(ห้อง 2\)/);
});

test('G1: พื้นที่ที่ถูกตัดไม่ต้องมีรูปจุด · พื้นที่ไม่มีจุดเลย = เรื่องของด่าน "จุดติดตั้ง" เดิม ไม่ซ้ำที่นี่', () => {
  const cut = zone('C', 'คลัง', { status: 'cut', cutReason: 'ลูกค้าไม่เอา', spots: spots('C', 2) });
  assert.equal(surveySpotSubmitError([cut], { C: [spotPhoto('F1')] }), null);
  assert.equal(surveySpotSubmitError([zone('A', 'Reception', { spots: [] })], {}), null);
});

test('⭐ ใบเก่า (รูปทุกใบ metadata {}) — ด่านใช้ตามปกติ (เจ้าของรับแล้ว 01/10)', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 2) });
  const files = { A: [WIDE, spotPhoto('F1'), spotPhoto('F2')] };
  assert.match(surveySpotSubmitError([a], files), /จุด 1\.1, 1\.2 ยังไม่มีรูป/);
  assert.match(surveySpotSendError([a], files), /มีรูปจุดที่ยังไม่ได้ผูก 2 รูป — ผูกก่อนส่งผล/);
});

/* ══ G2 — หัวหน้าส่งผล ═══════════════════════════════════════════════════ */

test('🔑 G2: รูปในถาดบล็อกการส่งผล — "มีรูปจุดที่ยังไม่ได้ผูก n รูป — ผูกก่อนส่งผล"', () => {
  const a = zone('A', 'Reception');
  const b = zone('B', 'ห้อง MD');
  const files = { A: [...allLinked(a), spotPhoto('F8')], B: [...allLinked(b), spotPhoto('F9'), spotPhoto('F7')] };
  assert.equal(surveySpotSendError([a, b], files), 'มีรูปจุดที่ยังไม่ได้ผูก 3 รูป — ผูกก่อนส่งผล (Reception · ห้อง MD)');
});

test('🔑 G2: จุดที่ไม่มีรูปไม่บล็อกการส่งผล เมื่อช่างส่งงานแล้ว (มติ G2 = ถาดอย่างเดียว · เอกสาร §8.1)', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 2) });
  const files = { A: [WIDE, PLAN, spotPhoto('F1', 'A-s1')] };
  assert.equal(surveySpotSendError([a], files), null);
  assert.equal(surveySpotSendError([a], files, { closesVisit: false }), null);
});

test('🔴 G2 + ส่งผลปิดนัดที่ยังเปิด (มติ 24/09 ข้อ 2) — ส่งผลแทนการส่งงาน ⇒ G1 ต้องผ่านด้วย', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 2) });
  const files = { A: [WIDE, PLAN, spotPhoto('F1', 'A-s1')] };
  const err = surveySpotSendError([a], files, { closesVisit: true });
  assert.match(err, /Reception · จุด 1\.2 ยังไม่มีรูป/);
  assert.match(err, /ส่งผลจะปิดนัด/);
  assert.equal(surveySpotSendError([zone('A', 'x')], { A: allLinked(zone('A', 'x')) }, { closesVisit: true }), null);
});

test('G2: พื้นที่ที่ถูกตัดไม่นับรูปในถาด', () => {
  const cut = zone('C', 'คลัง', { status: 'cut', cutReason: 'ลูกค้าไม่เอา' });
  assert.equal(surveySpotSendError([cut], { C: [spotPhoto('F1')] }), null);
});

/* 🔑 **ความครอบของด่าน** — ส่งผลที่ปิดนัดให้ช่างต้องปฏิเสธทุกกรณีที่ช่างส่งงานไม่ได้ (เทสต์เดิมของ survey.test
   ตรึงด่านหกข้อไว้ · ตัวนี้ตรึงด่านรูปจุดที่มาเพิ่ม) ไม่งั้นส่งผลจะปิดนัดเป็น "เข้าแล้ว" ทั้งที่ของช่างยังไม่ครบ */
test('🔑 ด่านส่งผลที่ปิดนัด ครอบด่านส่งงานของช่างรวมรูปจุด ทุกกรณี', () => {
  const base = zone('A', 'Reception', { spots: spots('A', 2) });
  const zoneVariants = [base, zone('A', 'Reception', { spots: [] }), { ...base, status: 'cut', cutReason: 'ลูกค้าไม่เอา' }];
  const fileVariants = [
    [WIDE, PLAN],
    [WIDE, PLAN, spotPhoto('F1', 'A-s1')],
    [WIDE, PLAN, spotPhoto('F1', 'A-s1'), spotPhoto('F2', 'A-s2')],
    [WIDE, PLAN, spotPhoto('F1', 'A-s1'), spotPhoto('F2', 'A-s2'), spotPhoto('F3')],
    [WIDE, PLAN, spotPhoto('F3')],
  ];
  let refusals = 0;
  for (const z of zoneVariants) {
    for (const files of fileVariants) {
      const rows = [z];
      const byZone = { A: files };
      const crew = surveyFieldSubmitError(rows, byZone) || surveySpotSubmitError(rows, byZone);
      if (!crew) continue;
      refusals += 1;
      assert.ok(
        surveySendError(rows, byZone, { canSend: true }) || surveySpotSendError(rows, byZone, { closesVisit: true }),
        `ช่างส่งงานไม่ได้ แต่ส่งผลปิดนัดผ่าน: ${JSON.stringify({ status: z.status, spots: z.spots.length, files: files.map((f) => f.id) })}`,
      );
    }
  }
  assert.ok(refusals >= 5);
});

/* ══ แถวด่าน (การ์ด) ═════════════════════════════════════════════════════ */

test('แถวด่าน: ช่าง = ทุกจุดมีรูป + ผูกครบ (ของช่าง) · หัวหน้า = ผูกครบ (ของหัวหน้า) · ปิดนัด = ทุกจุดมีรูปด้วย', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 2) });
  const files = { A: [WIDE, PLAN, spotPhoto('F1', 'A-s1'), spotPhoto('F2')] };
  const crew = surveySpotGates([a], files, { mode: 'submit' });
  assert.deepEqual(crew.map((g) => [g.key, g.owner, g.ok]), [[SPOT_GATE_PHOTOS, 'crew', false], [SPOT_GATE_LINKED, 'crew', false]]);
  assert.deepEqual(crew.map((g) => [g.done, g.total, g.zones]), [[0, 1, ['Reception']], [0, 1, ['Reception']]]);
  assert.equal(crew[0].reason, 'Reception · จุด 1.2 ยังไม่มีรูป');
  const head = surveySpotGates([a], files, { mode: 'send' });
  assert.deepEqual(head.map((g) => [g.key, g.owner, g.ok]), [[SPOT_GATE_LINKED, 'head', false]]);
  assert.equal(head[0].reason, 'มีรูปจุดที่ยังไม่ได้ผูก 1 รูป — ผูกก่อนส่งผล (Reception)');
  const closing = surveySpotGates([a], files, { mode: 'send', closesVisit: true });
  assert.deepEqual(closing.map((g) => g.key), [SPOT_GATE_PHOTOS, SPOT_GATE_LINKED]);
  // ผ่าน = ไม่มีเหตุ
  const ok = surveySpotGates([a], { A: allLinked(a) }, { mode: 'submit' });
  assert.ok(ok.every((g) => g.ok && g.reason === null && g.done === 1 && g.total === 1));
});

/* ══ จอ — ถามด่านตัวเดียวกับ server ══════════════════════════════════════ */

const request = (extra = {}) => ({
  id: 'DR-1', docNo: 'RQ-AS-26100001', kind: 'site_survey', dept: 'TS', status: 'acknowledged', ...extra,
});
const HEAD = { canWrite: true, canDecide: true };
const CREW = { canWrite: true, canDecide: false };
const doneVisit = { id: 'SVV-1', code: 'SV-2610001', status: 'done', scheduledDate: '2026-10-01', actualDate: '2026-10-01' };
const liveVisit = { ...doneVisit, status: 'in_progress', actualStartTime: '09:00:00' };

test('🔑 การ์ดหัวหน้า: รูปในถาด = ปุ่มส่งผลยังโชว์แต่กดไม่ได้ · เหตุ = ข้อความเดียวกับ server · แถวด่านมีเหตุ', () => {
  const a = zone('A', 'Reception');
  const files = { A: [...allLinked(a), spotPhoto('F9')] };
  const view = surveyControlView({ request: request(), zones: [a], filesByZone: files, visit: doneVisit, viewer: HEAD, today: '2026-10-01' });
  assert.equal(view.send.show, true);
  assert.equal(view.send.allowed, false);
  assert.equal(view.send.reason.detail, surveySpotSendError([a], files));
  assert.match(view.send.reason.text, /มีรูปจุดที่ยังไม่ได้ผูก 1 รูป — ผูกก่อนส่งผล/);
  assert.deepEqual(view.send.reason.target, { kind: 'zone', zoneId: 'A', label: 'เปิด Reception' }, 'ถาดอยู่ในหน้าพื้นที่');
  const row = view.gates.find((g) => g.key === SPOT_GATE_LINKED);
  assert.equal(row.ok, false);
  assert.equal(row.reason, 'มีรูปจุดที่ยังไม่ได้ผูก 1 รูป — ผูกก่อนส่งผล (Reception)');
  assert.equal(view.gatesFailed, 1);
  assert.notEqual(view.status.key, 'ready', 'ยังส่งไม่ได้ = ไม่ใช่ "พร้อมส่งผล"');
  assert.deepEqual(view.zoneGaps.rows.map((r) => [r.zoneId, r.head, r.targets[0]?.kind]), [['A', ['ผูกรูปจุด'], 'zone']]);
  // ผูกครบแล้ว = ส่งได้ · จุดที่ไม่มีรูปไม่บล็อกหลังช่างส่งงาน
  const two = zone('A', 'Reception', { spots: spots('A', 2) });
  const ok = surveyControlView({
    request: request(), zones: [two], filesByZone: { A: [WIDE, PLAN, spotPhoto('F1', 'A-s1')] },
    visit: doneVisit, viewer: HEAD, today: '2026-10-01',
  });
  assert.equal(ok.send.allowed, true);
  assert.equal(ok.status.key, 'ready');
  assert.ok(ok.gates.find((g) => g.key === SPOT_GATE_LINKED).ok);
  assert.equal(ok.gates.some((g) => g.key === SPOT_GATE_PHOTOS), false);
});

test('🔴 การ์ดหัวหน้า: ส่งผลที่จะปิดนัดที่ยังเปิด = ต้องมีรูปทุกจุดด้วย (ด่านเดียวกับ route)', () => {
  const two = zone('A', 'Reception', { spots: spots('A', 2) });
  const files = { A: [WIDE, PLAN, spotPhoto('F1', 'A-s1')] };
  const view = surveyControlView({ request: request(), zones: [two], filesByZone: files, visit: liveVisit, viewer: HEAD, today: '2026-10-01' });
  assert.ok(view.send.closesVisit);
  assert.equal(view.send.allowed, false);
  assert.equal(view.send.reason.detail, surveySpotSendError([two], files, { closesVisit: true }));
  assert.match(view.send.reason.detail, /จุด 1\.2 ยังไม่มีรูป/);
  assert.equal(view.gates.find((g) => g.key === SPOT_GATE_PHOTOS)?.ok, false);
});

test('การ์ดช่าง: ของที่ช่างต้องเก็บมีสองแถวรูปจุด (ทุกจุดมีรูป · ผูกครบ)', () => {
  const two = zone('A', 'Reception', { spots: spots('A', 2) });
  const view = surveyControlView({
    request: request(), zones: [two], filesByZone: { A: [WIDE, spotPhoto('F1', 'A-s1')] },
    visit: liveVisit, viewer: CREW, today: '2026-10-01',
  });
  assert.deepEqual(view.gates.filter((g) => g.key.startsWith('spot') && g.key !== 'spots').map((g) => [g.key, g.ok]),
    [[SPOT_GATE_PHOTOS, false], [SPOT_GATE_LINKED, true]]);
  assert.equal(view.gatesTitle, 'ของที่ช่างต้องเก็บ');
  assert.deepEqual(view.zoneGaps.rows.map((r) => r.crew), [['รูปจุด']]);
});

test('🔑 กล่องส่งงาน: ขาดแค่รูปจุด = เหตุของ server เป๊ะ · แถวพื้นที่ขึ้น "ไปแก้" พร้อมเลขจุด', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 3) });
  const files = { A: [WIDE, spotPhoto('F1', 'A-s1'), spotPhoto('F2', 'A-s2')] };
  const view = surveySubmitView({ outcome: 'entered', visit: liveVisit, zones: [a], filesByZone: files });
  assert.equal(view.blocker, surveySpotSubmitError([a], files));
  assert.equal(view.blocker, 'ยังส่งงานไม่ได้ — Reception · จุด 1.3 ยังไม่มีรูป');
  assert.deepEqual([view.rows[0].state, view.rows[0].go, view.rows[0].note], ['miss', true, 'จุด 1.3 ยังไม่มีรูป']);
  // ถาด
  const tray = surveySubmitView({
    outcome: 'entered', visit: liveVisit, zones: [zone('A', 'Reception')],
    filesByZone: { A: [...allLinked(zone('A', 'Reception')), spotPhoto('F9')] },
  });
  assert.match(tray.blocker, /มีรูปที่ยังไม่ได้ผูกจุด 1 รูป/);
  assert.equal(tray.rows[0].note, 'ยังไม่ได้ผูกจุด 1 รูป');
  // ครบ = ส่งได้ · เข้าไม่ได้ไม่ถามด่านนี้
  const ok = surveySubmitView({ outcome: 'entered', visit: liveVisit, zones: [zone('A', 'x')], filesByZone: { A: allLinked(zone('A', 'x')) } });
  assert.equal(ok.blocker, null);
  const unable = surveySubmitView({ outcome: 'unable', reason: 'อาคารปิดวันหยุดยาว', visit: liveVisit, zones: [a], filesByZone: files });
  assert.equal(unable.blocker, null);
});

test('🔑 แถบส่งงาน: ขาดรูปจุด = "ยังส่งไม่ได้" + เหตุเดียวกัน (ปุ่มยังกดได้ เปิดกล่องที่บอกรายพื้นที่)', () => {
  const bar = surveyFieldBarView({
    visit: liveVisit, progress: { done: 1, total: 1 }, spotReason: 'Reception · จุด 1.3 ยังไม่มีรูป',
  });
  assert.equal(bar.head, 'ยังส่งไม่ได้');
  assert.equal(bar.sub, 'Reception · จุด 1.3 ยังไม่มีรูป');
  assert.equal(bar.action.blocker, 'Reception · จุด 1.3 ยังไม่มีรูป');
  assert.equal(bar.action.gated, false, 'ส่งงานไม่ติดด่านแบบระบบ — กดได้แล้วกล่องบอกรายพื้นที่');
  assert.equal(bar.action.emphasis, 'quiet');
  // ของหกข้อยังขาด = พูดเรื่องนั้นก่อน (เหตุเดิม)
  const both = surveyFieldBarView({
    visit: liveVisit, progress: { done: 0, total: 1 }, leftNames: ['Reception'], crewGaps: [{}], spotReason: 'x',
  });
  assert.equal(both.sub, 'ยังขาด Reception');
  assert.equal(surveyFieldBarView({ visit: liveVisit, progress: { done: 1, total: 1 } }).head, 'ครบทุกพื้นที่แล้ว');
});

test('🐞 review 01/10: ถ่ายก่อนตั้งชื่อ (รูปบน id ร่าง `new-…`) + พื้นที่ค้าง = แถบ/กล่องบอก "ยังไม่บันทึก" ไม่ใช่ "รูปในถาด"', () => {
  /* ตัวนับเห็นแต่ `zone.spots` ที่บันทึกแล้ว ⇒ รูปบนแถวร่างตกถาดในสายตามัน ขณะที่หน้าพื้นที่วางรูปไว้ใต้แถว (ถาดว่าง)
     · งานถัดไปจริงคือบันทึก — save เก็บ id ร่างไว้ รูปจึงเข้าแถวของมันเองหลังบันทึก */
  const a = zone('A', 'Reception', { spots: [{ id: 'S1', label: 'มุมโซฟา', selected: true }] });
  const files = { A: [WIDE, PLAN, spotPhoto('F1', 'S1'), spotPhoto('F2', 'new-abc')] };
  const spotReason = surveySpotSubmitReason([a], files);
  assert.match(spotReason, /มีรูปที่ยังไม่ได้ผูกจุด 1 รูป/, 'ของที่บันทึกแล้วยังเห็นรูปร่างเป็นรูปในถาด (ตั้งฉาก)');
  const bar = surveyFieldBarView({ visit: liveVisit, progress: { done: 1, total: 1 }, spotReason, dirtyZoneIds: ['A'] });
  assert.equal(bar.sub, 'มีค่าที่ยังไม่บันทึก — กดบันทึกพื้นที่นี้ก่อน');
  assert.equal(bar.action.blocker, bar.sub);
  // บันทึกแล้ว (ไม่ค้าง) แต่ถาดยังมีรูปจริง = เหตุรูปจุดกลับมา
  assert.equal(surveyFieldBarView({ visit: liveVisit, progress: { done: 1, total: 1 }, spotReason }).sub, spotReason);

  const dialog = surveySubmitView({ outcome: 'entered', visit: liveVisit, zones: [a], filesByZone: files, dirtyZoneIds: ['A'] });
  assert.match(dialog.blocker, /^มีค่าที่ยังไม่บันทึก: Reception/);
  assert.deepEqual([dialog.rows[0].state, dialog.rows[0].note, dialog.rows[0].go], ['dirty', 'ยังไม่บันทึก', true]);
  // ไม่ค้าง = แถวกลับเป็นเรื่องรูปจุด
  const clean = surveySubmitView({ outcome: 'entered', visit: liveVisit, zones: [a], filesByZone: files });
  assert.deepEqual([clean.rows[0].state, clean.rows[0].note], ['miss', 'ยังไม่ได้ผูกจุด 1 รูป']);
});

/* ══ รายการพื้นที่ — ตัวนับเดียวกับแถบ/กล่อง/route (🐞 review 01/10: วงติ๊กครบเหนือแถบที่บอกว่าส่งไม่ได้) ═════ */

test('🔑 รายการพื้นที่: สามข้อครบแต่จุดยังไม่มีรูป/มีรูปในถาด = ยังไม่ ✓ + บรรทัดเหตุคำเดียวกับกล่องส่งงาน', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 3) });
  const b = zone('B', 'ห้อง MD');
  const c = zone('C', 'ห้อง Treatment');
  const zones = [a, b, c];
  const files = {
    A: [WIDE, spotPhoto('F1', 'A-s1'), spotPhoto('F2', 'A-s2')], // จุด 1.3 ยังไม่มีรูป
    B: [...allLinked(b), spotPhoto('F9')], // ถาด 1 รูป
    C: allLinked(c),
  };
  const view = surveyZoneListView({ zones, filesByZone: files, visit: liveVisit });
  assert.deepEqual(view.rows.map((r) => r.state), ['todo', 'todo', 'done']);
  assert.deepEqual(view.rows.map((r) => r.detail), ['missing', 'missing', 'marks']);
  assert.deepEqual(view.rows.map((r) => r.missingText), ['จุด 1.3 ยังไม่มีรูป', 'ยังไม่ได้ผูกจุด 1 รูป', null]);
  assert.ok(view.rows[0].marks.every((m) => m.ok), 'สามข้อของช่างครบจริง — ติ๊กยังเป็นติ๊ก');
  // คำเดียวกับแถวของกล่องส่งงาน (ตัวนับเดียวกัน)
  const dialog = surveySubmitView({ outcome: 'entered', visit: liveVisit, zones, filesByZone: files });
  assert.deepEqual(view.rows.map((r) => r.missingText), dialog.rows.map((r) => r.note));
  /* leftNames = สามข้อของช่างเท่านั้น ⇒ แถบพูดเหตุรูปจุดที่บอกเลขจุด (ละเอียดกว่า "ยังขาด Reception") */
  assert.deepEqual(view.leftNames, []);
  const bar = surveyFieldBarView({
    visit: liveVisit, progress: { done: 3, total: 3 }, leftNames: view.leftNames,
    spotReason: surveySpotSubmitReason(zones, files),
  });
  assert.equal(bar.sub, 'Reception · จุด 1.3 ยังไม่มีรูป | มีรูปที่ยังไม่ได้ผูกจุด 1 รูป (ห้อง MD)');
});

test('รายการพื้นที่: ของช่างขาดด้วย = บรรทัดเดียวต่อกัน · พื้นที่ค้าง/ตัดออกไม่ถามด่านรูปจุด', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 2) });
  const files = { A: [spotPhoto('F1', 'A-s1')] }; // ไม่มีภาพกว้าง + จุด 1.2 ไม่มีรูป
  const [row] = surveyZoneListView({ zones: [a], filesByZone: files, visit: liveVisit }).rows;
  assert.equal(row.missingText, 'ขาด: ภาพกว้าง · จุด 1.2 ยังไม่มีรูป');
  // ค้าง (สองบาน) = ตัวนับของที่บันทึกแล้วไม่ใช่ความจริงของแถว — ป้าย "กำลังแก้" พูดแทน (กติกาเดียวกับกล่องส่งงาน)
  const draftFiles = { A: [...allLinked(zone('A', 'x')), spotPhoto('F2', 'new-abc')] };
  const b = zone('A', 'Reception');
  const dirty = surveyZoneListView({
    zones: [b], filesByZone: draftFiles, visit: liveVisit, split: true, selectedZoneId: 'A', dirtyZoneId: 'A',
  }).rows[0];
  assert.deepEqual([dirty.state, dirty.spotNote, dirty.tags.editing], ['done', null, true]);
  assert.equal(surveyZoneListView({ zones: [b], filesByZone: draftFiles, visit: liveVisit }).rows[0].state, 'todo');
  const cut = surveyZoneListView({ zones: [zone('A', 'x', { status: 'cut' })], filesByZone: { A: [spotPhoto('F1')] }, visit: liveVisit });
  assert.deepEqual([cut.rows[0].state, cut.rows[0].missingText], ['cut', null]);
});

test('รายการพื้นที่: ด่านตามช่วง — นัดเปิด = G1 (จุดไม่มีรูป + ถาด) · นัดปิด/ไม่มีนัด = G2 (ถาดอย่างเดียว) · ก่อนเริ่มก็บอกเหตุ', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 2) });
  const noPhoto = { A: [WIDE, spotPhoto('F1', 'A-s1')] };
  const tray = { A: [...allLinked(a), spotPhoto('F9')] };
  const stateOf = (visit, files) => surveyZoneListView({ zones: [a], filesByZone: files, visit }).rows[0];
  assert.equal(stateOf(liveVisit, noPhoto).state, 'todo');
  assert.equal(stateOf({ ...liveVisit, status: 'scheduled' }, noPhoto).state, 'todo', 'นัดยังไม่เริ่ม — ส่งงาน/ส่งผลที่ปิดนัดยังต้องผ่าน G1');
  assert.equal(stateOf({ ...liveVisit, status: 'scheduled' }, noPhoto).detail, 'missing',
    'สามข้อครบ = วงติ๊กครบทั้งแถว ⇒ ต้องมีบรรทัดบอกว่าทำไมยังไม่ ✓');
  // ช่างส่งงานแล้ว = จุดที่ไม่มีรูปไม่บล็อกใคร (G2 = ถาดอย่างเดียว · ใบก่อนมติ) · ถาดยังบล็อกการส่งผล
  assert.equal(stateOf(doneVisit, noPhoto).state, 'done');
  assert.equal(stateOf(null, noPhoto).state, 'done');
  assert.deepEqual([stateOf(doneVisit, tray).state, stateOf(doneVisit, tray).missingText], ['todo', 'ยังไม่ได้ผูกจุด 1 รูป']);
  assert.deepEqual([stateOf(null, tray).state, stateOf(null, tray).detail], ['todo', 'missing']);
  // ของช่างขาดก่อนเริ่มงาน = วงเปล่าเหมือนเดิม (A-1: ยังไม่มีใครผิด)
  const empty = zone('A', 'Reception', { parts: [], spots: spots('A', 1) });
  assert.equal(surveyZoneListView({ zones: [empty], filesByZone: { A: [] }, visit: { ...liveVisit, status: 'scheduled' } }).rows[0].detail, 'marks');
});

test('รายการพื้นที่: ใบที่ล็อกแล้ว — ช่างไม่เห็นเรื่องถาด (ผูกเองไม่ได้ · มติ 26/09 เห็นแค่งานตัวเอง) · หัวหน้ายังเห็น', () => {
  const a = zone('A', 'Reception', { spots: spots('A', 2) });
  const tray = { A: [...allLinked(a), spotPhoto('F9')] };
  const rowOf = (opts) => surveyZoneListView({ zones: [a], filesByZone: tray, visit: doneVisit, ...opts }).rows[0];
  assert.equal(rowOf({ locked: true, canDecide: false }).state, 'done', 'ช่างบนใบล็อก: ไม่มีงานให้ทำ ⇒ ไม่ขึ้นยังขาด');
  assert.deepEqual([rowOf({ locked: true, canDecide: true }).state, rowOf({ locked: true, canDecide: true }).missingText],
    ['todo', 'ยังไม่ได้ผูกจุด 1 รูป'], 'หัวหน้าผูกบนใบล็อกได้ ⇒ ยังเห็นเหตุ');
  assert.equal(rowOf({ locked: false, canDecide: false }).state, 'todo', 'ใบยังเปิด ช่างผูกเองได้ ⇒ ยังเห็นเหตุ');
});

/* ══ ซอร์สจริง — route ต้องเรียกด่าน ไม่ใช่แค่ฟังก์ชันเขียว ═════════════════════════ */

const src = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('🐞 route ส่งผล: ถามด่านถาดตัวเดียวกับการ์ด · ปิดนัดหรือไม่มาจาก surveySendVisitStep ตัวเดียวกับที่ปิดจริง · ก่อนเขียนอะไร', () => {
  const route = src('../../app/api/service/surveys/[id]/send/route.js');
  assert.match(route, /surveySpotSendError\(zones, filesByZone, \{ closesVisit \}\)/);
  assert.match(route, /const closesVisit = surveySendVisitStep\(open, \{ today \}\)\.action === 'close'/);
  const gate = route.indexOf('surveySpotSendError(');
  assert.ok(gate > 0 && gate < route.indexOf('surveySendWrites('), 'ด่านต้องมาก่อนปิดนัด/ตอบใบ');
  assert.ok(route.indexOf('findSurveyVisit(') < gate, 'ต้องรู้ก่อนว่าส่งผลจะปิดนัดไหม');
});

test('🐞 route ปิดนัด (ส่งงาน): ถามด่านรูปจุดจากไฟล์ในฐาน ต่อจากด่านเดิม', () => {
  const route = src('../../app/api/service/visits/[id]/route.js');
  assert.match(route, /surveyFieldSubmitError\(surveyField\.zones, surveyField\.filesByZone\)\s*\|\|\s*surveySpotSubmitError\(surveyField\.zones, surveyField\.filesByZone\)/);
});

test('🐞 จอ: แถบส่งงานได้เหตุรูปจุด · การ์ดวาดเหตุของแถวด่าน · หน้าคำร้องได้ไฟล์ที่นับรูปจุดได้', () => {
  const page = src('../../app/service/surveys/[id]/page.js');
  assert.match(page, /spotReason: surveySpotSubmitReason\(zones, filesByZone\)/);
  const card = src('../../components/service/SurveyControlCard.js');
  assert.match(card, /gate\.reason/);
  /* 🔴 หน้าคำร้องเรียก `surveyControlView` ด้วยไฟล์ของ `loadSurveyRequestExtras` — ส่งแค่ docType = ทุกจุด "ยังไม่มีรูป"
     และถาดว่างเสมอ (`isSpotPhoto` ต้องรู้ชนิดไฟล์ · `spotId` อยู่ใน metadata) ⇒ ปุ่มบนหน้าคำร้องพูดคนละเรื่องกับ route */
  const extras = src('./surveyRequestExtras.js');
  assert.match(extras, /select\('id, "entityId", "docType", "mimeType", "fileName", metadata'\)/);
  assert.match(extras, /spotId: file\.metadata\?\.spotId \?\? null/);
});
