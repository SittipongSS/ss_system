// ── การ์ดควบคุมของใบประเมิน + หัวพื้นที่ที่พับได้ — ตัวตัดสินล้วน (PR2) ──────
//
// ⭐ ครอบ **ทุกสถานะที่แบบที่อนุมัติระบุไว้**: ยังไม่เริ่ม · กำลังวัด · วัดครบยังไม่เคาะ ·
//   ส่งแล้ว · ดึงกลับ · ยกเลิก · ปิดโดยไม่ได้ตอบ · คนดูอย่างเดียว · ช่าง vs หัวหน้า ·
//   ไม่มีพื้นที่ · พื้นที่เดียว · พื้นที่ที่ถูกตัด · และ **อ่านข้อมูลไม่สำเร็จ**
//   (ข้อสุดท้ายคือกับดักประจำรีโปนี้: `supabase-js` ไม่ throw ⇒ อ่านพลาดกลายเป็น
//    "ไม่มีข้อมูล" เงียบ ๆ ถ้าไม่มีใครดักไว้)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// 📍 `surveyRecallRecord` อยู่ใน `survey.js` (ฝั่งกฎ) เพราะ **server อ่านมันด้วย** —
//    `surveyRepo` แกะแถวเดียวกันตอนตอบ GET ⇒ ชั้นต้องไหลทางเดียว จอ → กฎ ไม่ใช่ repo → จอ
import { surveyRecallRecord } from './survey.js';
import {
  SURVEY_UNKNOWN_TEXT,
  surveyControlView,
  surveyFoldDefaults,
  surveyNameList,
  surveyTotalsText,
  surveyZoneDraftSignature,
  surveyZoneFacts,
} from './surveyControl.js';

// ── ของตั้งต้น ───────────────────────────────────────────────────────────
const part = (w, l, h) => ({ widthM: w, lengthM: l, heightM: h, label: null });
const WIDE = { docType: 'survey_wide' };
const PLAN = { docType: 'survey_plan' };

/** พื้นที่ที่ครบทั้งหกข้อ — 4×5×3 = 60 ลบ.ม. ⇒ สูตรบอก 1 แพ็คเกจ ⇒ เคาะ 1 ไม่ต้องมีเหตุผล */
const readyZone = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneName: name, floor: '02', status: 'ok',
  parts: [part(4, 5, 3)], spots: [{ id: `${id}-s1`, label: 'มุมโซฟา', selected: true }],
  packageQty: 1, packageNote: '', note: '', ...extra,
});
/** พื้นที่ที่ช่างยังไม่ได้แตะเลย */
const emptyZone = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneName: name, floor: '02', status: 'ok',
  parts: [], spots: [], packageQty: null, packageNote: '', note: '', ...extra,
});
/** พื้นที่ที่ช่างวัดครบแล้ว แต่หัวหน้ายังไม่เคาะ (ไม่มีผัง · ไม่ได้เลือกจุด · ไม่มีแพ็คเกจ) */
const measuredZone = (id, name, extra = {}) => ({
  id, zoneId: `SZN-${id}`, zoneName: name, floor: '02', status: 'ok',
  parts: [part(4, 5, 3)], spots: [{ id: `${id}-s1`, label: 'มุมโซฟา', selected: false }],
  packageQty: null, packageNote: '', note: '', ...extra,
});

const readyFiles = [WIDE, PLAN];
const measuredFiles = [WIDE];
/** ช่างครบ + ผังมาแล้ว เหลือของหัวหน้าที่เคาะบนแท็บสรุป (เลือกจุด · แพ็คเกจ) */
const plannedFiles = [WIDE, PLAN];

const request = (extra = {}) => ({
  id: 'DR-1', docNo: 'RQ-AS-26090106', title: 'S&S ประเมินพื้นที่',
  kind: 'site_survey', dept: 'TS', status: 'acknowledged',
  siteId: 'SS-1', customerId: 'CU-1', committedDueDate: '2026-09-14',
  requestedByName: 'Admin S&S', ...extra,
});

const HEAD = { canWrite: true, canDecide: true };
const CREW = { canWrite: true, canDecide: false };
const VIEWER = { canWrite: false, canDecide: false };

const recallRow = {
  id: 'EUP-1',
  body: 'TS ดึงผลประเมินกลับมาแก้ — ลูกค้าแจ้งว่า Studio 03 รีโนเวทเสร็จแล้ว'
    + ' · ตัวเลขที่ส่งไปแล้ว 2 พื้นที่ · 40 ตร.ม. · 2 แพ็คเกจ (อย่าเพิ่งใช้ตั้งราคา)',
  meta: { totals: { zones: 2, areaSqm: 40, packageQty: 2 } },
  authorId: 'U-1', authorName: 'Local D.', createdAt: '2026-09-15T02:12:00.000Z',
};

// ══ ชื่อพื้นที่ในที่แคบ ═════════════════════════════════════════════════
test('ชื่อพื้นที่เกิน 3 ชื่อยุบเป็น "อีก n" — รางกว้าง 330px ไม่ใช่ที่ของสิบชื่อ', () => {
  assert.equal(surveyNameList(['ก', 'ข']), 'ก · ข');
  assert.equal(surveyNameList(['ก', 'ข', 'ค', 'ง', 'จ']), 'ก · ข · ค อีก 2');
  assert.equal(surveyNameList([]), '');
});

// ══ แถวดึงกลับ ═════════════════════════════════════════════════════════
test('แกะเหตุผลออกจากบรรทัดเธรดได้ พร้อมตัวเลขเดิมใน meta', () => {
  const r = surveyRecallRecord(recallRow);
  assert.equal(r.reason, 'ลูกค้าแจ้งว่า Studio 03 รีโนเวทเสร็จแล้ว');
  assert.equal(r.byName, 'Local D.');
  assert.deepEqual(r.totals, { zones: 2, areaSqm: 40, packageQty: 2 });
  assert.equal(surveyTotalsText(r.totals), '2 พื้นที่ · 40 ตร.ม. · 2 แพ็คเกจ');
});

test('แกะไม่ออก = คืนประโยคเต็ม ไม่ใช่ว่าง · ไม่มี totals = "ไม่ทราบ" ไม่ใช่ศูนย์', () => {
  const r = surveyRecallRecord({ body: 'ข้อความเก่าที่ไม่มีขีดคั่น', meta: null, createdAt: 'x' });
  assert.equal(r.reason, 'ข้อความเก่าที่ไม่มีขีดคั่น');
  assert.equal(r.totals, null);
  assert.equal(surveyTotalsText(null), SURVEY_UNKNOWN_TEXT);
  assert.equal(surveyRecallRecord(null), null);
});

// ══ ข้อเท็จจริงบนหัวพื้นที่ที่พับอยู่ ═════════════════════════════════════
test('หัวที่พับตอบได้โดยไม่ต้องเปิด — ครบแล้วได้ตัวเลข ยังไม่ครบได้ "ขาด: …"', () => {
  const done = surveyZoneFacts(readyZone('z1', 'Studio 01'), readyFiles);
  assert.equal(done.tone, 'done');
  assert.equal(done.areaSqm, 20);
  assert.equal(done.volumeCbm, 60);
  assert.equal(done.suggestedPackages, 1);
  assert.equal(done.packageQty, 1);
  assert.equal(done.spotsTotal, 1);
  assert.equal(done.spotsSelected, 1);
  assert.deepEqual(done.photos, { wide: 1, plan: 1, spot: 0, total: 2 });
  assert.equal(done.missingText, null);
  assert.equal(done.ready, true);

  const todo = surveyZoneFacts(emptyZone('z3', 'Studio 03'), []);
  assert.equal(todo.tone, 'todo');
  assert.equal(todo.missingText, 'ขาด: ขนาด · ภาพกว้าง · จุดติดตั้ง');
  assert.equal(todo.crewComplete, false);
});

test('⚠️ บรรทัด "ขาด" บนหัวพื้นที่เป็นของช่างเท่านั้น — ของหัวหน้าเคาะที่อีกแท็บ', () => {
  const f = surveyZoneFacts(measuredZone('z3', 'Studio 03'), measuredFiles);
  assert.equal(f.missingText, null, 'ช่างครบแล้ว หัวไม่ควรขึ้น "ขาด"');
  assert.equal(f.crewComplete, true);
  assert.equal(f.ready, false);
  assert.deepEqual(f.missingHead.map((g) => g.short), ['ภาพผัง', 'เลือกจุด', 'แพ็คเกจ']);
});

test('พื้นที่ที่ถูกตัดออกไม่ต้องผ่านด่านไหนเลย — หัวโชว์เหตุผลที่ตัด', () => {
  const f = surveyZoneFacts(emptyZone('z3', 'Studio 03', { status: 'cut', cutReason: 'ยังรีโนเวทไม่เสร็จ' }), []);
  assert.equal(f.tone, 'cut');
  assert.equal(f.cutReason, 'ยังรีโนเวทไม่เสร็จ');
  assert.deepEqual(f.missing, []);
});

test('🔴 "ยังไม่มีรหัส ZN" กับ "อ่านรหัสไม่สำเร็จ" ต้องแยกกันบนหัวพื้นที่', () => {
  const pending = surveyZoneFacts({ ...emptyZone('z9', 'พื้นที่ใหม่'), zoneId: null, zoneCode: null }, []);
  assert.equal(pending.zoneCode, null);
  assert.equal(pending.zoneCodeUnknown, false);
  const broken = surveyZoneFacts({ ...emptyZone('z9', 'Studio 09'), zoneCode: null, zoneCodeUnknown: true }, []);
  assert.equal(broken.zoneCodeUnknown, true);
});

// ══ ค่าเปิด/ปิดตั้งต้น ═════════════════════════════════════════════════
test('ค่าพับตั้งต้น: เปิดเฉพาะพื้นที่ที่คนดูแก้ได้และยังขาดของช่าง', () => {
  const zones = [readyZone('z1', 'Studio 01'), readyZone('z2', 'Studio 02'), emptyZone('z3', 'Studio 03')];
  const files = { z1: readyFiles, z2: readyFiles, z3: [] };
  assert.deepEqual(surveyFoldDefaults(zones, files, { canWrite: true }), { z1: false, z2: false, z3: true });
});

test('ใบที่ส่งแล้ว · ใบที่ยกเลิก · คนดูอย่างเดียว = พับหมด', () => {
  const zones = [readyZone('z1', 'Studio 01'), readyZone('z2', 'Studio 02'), emptyZone('z3', 'Studio 03')];
  const files = { z1: readyFiles, z2: readyFiles, z3: [] };
  assert.deepEqual(surveyFoldDefaults(zones, files, { canWrite: true, locked: true }),
    { z1: false, z2: false, z3: false });
  assert.deepEqual(surveyFoldDefaults(zones, files, { canWrite: false }),
    { z1: false, z2: false, z3: false });
});

test('🐞 canWrite ของ server ไม่รู้จักการล็อก — ส่ง request มาแล้วต้องพับเองได้', () => {
  /* `visitWriteAccess` ตอบแค่ "เป็นช่างของนัดใบนี้ไหม" ไม่เคยดู answeredAt/cancelledAt
     ⇒ ค่าที่ GET ส่งออกมาจริงคือ `canWrite: true` แม้บนใบที่ส่งไปแล้ว · ถ้าตัวตัดสิน
     เชื่อค่านั้นดิบ ๆ ใบที่ส่งแล้วจะกางพื้นที่ที่ "ยังขาด" ค้างทั้งหน้าโดยแก้อะไรไม่ได้ */
  const zones = [readyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02'), emptyZone('z3', 'Studio 03')];
  const files = { z1: readyFiles, z2: [], z3: [] };
  const sent = request({ answeredAt: '2026-09-14T10:20:00.000Z', answeredByName: 'Local D.' });
  assert.deepEqual(surveyFoldDefaults(zones, files, { canWrite: true, request: sent }),
    { z1: false, z2: false, z3: false }, 'ใบที่ส่งแล้ว = พับหมด');
  assert.deepEqual(surveyFoldDefaults(zones, files, { canWrite: true, request: request({ cancelledAt: 'x' }) }),
    { z1: false, z2: false, z3: false }, 'ใบที่ยกเลิก = พับหมด');
  assert.deepEqual(surveyFoldDefaults(zones, files, { canWrite: true, request: request() }),
    { z1: false, z2: true, z3: true }, 'ใบที่ยังเปิดอยู่ = เปิดของที่ยังขาด');

  // ทางที่จอควรใช้จริง: ค่าหักลบมาให้แล้วในคำตอบก้อนเดียวกับการ์ด
  const v = surveyControlView({ request: sent, zones, filesByZone: files, viewer: HEAD });
  assert.deepEqual(v.foldDefaults, { z1: false, z2: false, z3: false });
  assert.deepEqual(
    surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD }).foldDefaults,
    { z1: false, z2: true, z3: true },
  );
});

test('ใบที่มีพื้นที่เดียว = เปิดเสมอ แม้คนดูแก้ไม่ได้ · พื้นที่ที่ตัดออกยังพับ', () => {
  const one = [readyZone('z1', 'Studio 01')];
  assert.deepEqual(surveyFoldDefaults(one, { z1: readyFiles }, VIEWER), { z1: true });
  const oneActivePlusCut = [readyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02', { status: 'cut' })];
  assert.deepEqual(surveyFoldDefaults(oneActivePlusCut, {}, VIEWER), { z1: true, z2: false });
});

test('ใบที่ไม่มีพื้นที่เลย = แผนที่ว่าง (ไม่พังตอนเป็น useState initializer)', () => {
  assert.deepEqual(surveyFoldDefaults([], {}, HEAD), {});
  assert.deepEqual(surveyFoldDefaults(undefined, undefined, undefined), {});
});

// ══ สถานะของใบ ═════════════════════════════════════════════════════════
test('ยังไม่เริ่มวัดเลย — "กำลังวัดหน้างาน" 0/3 พร้อมชื่อพื้นที่ที่เหลือ', () => {
  const zones = [emptyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02'), emptyZone('z3', 'Studio 03')];
  const v = surveyControlView({ request: request(), zones, filesByZone: {}, viewer: HEAD });
  assert.equal(v.status.key, 'measuring');
  assert.equal(v.status.tone, 'warning');
  assert.equal(v.status.headline, 'กำลังวัดหน้างาน');
  assert.equal(v.status.sub, 'วัดแล้ว 0 / 3 พื้นที่ · เหลือ Studio 01 · Studio 02 · Studio 03');
  assert.equal(v.progress.percent, 0);
});

test('วัดไปบางส่วน — 2/3 · แถบวัดคิด % จากพื้นที่ที่ยังอยู่ในใบ', () => {
  const zones = [readyZone('z1', 'Studio 01'), readyZone('z2', 'Studio 02'), emptyZone('z3', 'Studio 03')];
  const files = { z1: readyFiles, z2: readyFiles, z3: [] };
  const v = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD });
  assert.equal(v.status.key, 'measuring');
  assert.equal(v.status.sub, 'วัดแล้ว 2 / 3 พื้นที่ · เหลือ Studio 03');
  assert.equal(v.progress.done, 2);
  assert.equal(v.progress.total, 3);
  assert.equal(v.progress.percent, 67);
  assert.deepEqual(v.progress.leftNames, ['Studio 03']);
});

test('วัดครบแต่หัวหน้ายังไม่เคาะ — สถานะน้ำเงิน ไม่ใช่ "พร้อมส่ง"', () => {
  const zones = [measuredZone('z1', 'Studio 01'), measuredZone('z2', 'Studio 02')];
  const files = { z1: measuredFiles, z2: measuredFiles };
  const v = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD });
  assert.equal(v.status.key, 'awaiting-decision');
  assert.equal(v.status.tone, 'info');
  assert.equal(v.status.headline, 'วัดครบแล้ว — รอหัวหน้าเคาะ');
  assert.equal(v.send.allowed, false);
});

test('ผ่านครบหกข้อ — "พร้อมส่งผลให้ฝ่ายขาย" + ปุ่มส่งกดได้ ไม่มีเหตุผลค้าง', () => {
  const zones = [readyZone('z1', 'Studio 01'), readyZone('z2', 'Studio 02')];
  const files = { z1: readyFiles, z2: readyFiles };
  const v = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD });
  assert.equal(v.status.key, 'ready');
  assert.equal(v.status.sub, '2 พื้นที่ · 40 ตร.ม. · 2 แพ็คเกจ');
  assert.equal(v.send.show, true);
  assert.equal(v.send.allowed, true);
  assert.equal(v.send.reason, null);
  assert.equal(v.send.label, 'ส่งผลให้ฝ่ายขาย');
  assert.equal(v.gatesFailed, 0);
  assert.deepEqual(v.zoneGaps.rows, []);
});

test('ส่งแล้ว — เขียว พร้อมชื่อผู้ส่งและเวลา · ปุ่มส่งหาย ปุ่มดึงกลับมา', () => {
  const zones = [readyZone('z1', 'Studio 01')];
  const v = surveyControlView({
    request: request({ status: 'answered', answeredAt: '2026-09-14T10:20:00.000Z', answeredByName: 'Local D.' }),
    zones, filesByZone: { z1: readyFiles }, viewer: HEAD,
  });
  assert.equal(v.status.key, 'sent');
  assert.equal(v.status.tone, 'success');
  assert.match(v.status.sub, /^ส่งโดย Local D\. · 14\/09\/2026 17:20 · รอฝ่ายขายปิดเรื่อง$/);
  assert.equal(v.send.show, false);
  assert.equal(v.recallAction.show, true);
  assert.equal(v.recallAllowed, true);
  assert.equal(v.flags.locked, true);
});

test('ดึงกลับ — อำพัน + กล่องแจ้งเหตุผล/คนกด/ผลเดิม · ปุ่มส่งเปลี่ยนคำเป็น "อีกครั้ง"', () => {
  const zones = [readyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')];
  const v = surveyControlView({
    request: request(), zones, filesByZone: { z1: readyFiles, z2: [] },
    recall: surveyRecallRecord(recallRow), viewer: HEAD,
  });
  assert.equal(v.status.key, 'recalled');
  assert.equal(v.status.tone, 'warning');
  assert.equal(v.status.headline, 'ดึงผลกลับมาแก้');
  assert.equal(v.status.sub, 'วัดแล้ว 1 / 2 พื้นที่ · เหลือ Studio 02');
  assert.equal(v.send.label, 'ส่งผลให้ฝ่ายขายอีกครั้ง');
  const notice = v.notices.find((n) => n.key === 'recall');
  assert.equal(notice.text, 'ลูกค้าแจ้งว่า Studio 03 รีโนเวทเสร็จแล้ว');
  assert.match(notice.meta, /Local D\. · 15\/09\/2026 09:12 · ผลเดิม 2 พื้นที่ · 40 ตร\.ม\. · 2 แพ็คเกจ/);
  assert.equal(v.step.hint, 'ดึงกลับ 15/09/2026 09:12 — รอส่งอีกครั้ง');
});

test('🔴 ใบที่ดึงกลับแล้วส่งซ้ำ ต้องไม่ค้างสถานะ "ดึงกลับ" — แถว recall อยู่ตลอดไป', () => {
  const zones = [readyZone('z1', 'Studio 01')];
  const v = surveyControlView({
    request: request({ answeredAt: '2026-09-16T03:00:00.000Z', answeredByName: 'Local D.' }),
    zones, filesByZone: { z1: readyFiles }, recall: surveyRecallRecord(recallRow), viewer: HEAD,
  });
  assert.equal(v.status.key, 'sent');
  assert.equal(v.flags.recallPending, false);
  assert.equal(v.notices.find((n) => n.key === 'recall'), undefined);
});

test('คำร้องถูกยกเลิก — เทา · ไม่มีปุ่มส่ง ไม่มีปุ่มดึงกลับ · เหตุผลขึ้นกล่องแจ้ง', () => {
  const zones = [emptyZone('z1', 'Studio 01')];
  const v = surveyControlView({
    request: request({ status: 'cancelled', cancelledAt: '2026-09-15T04:05:00.000Z', cancelReason: 'ลูกค้าเลื่อนเปิดตึก' }),
    zones, filesByZone: {}, viewer: HEAD,
  });
  assert.equal(v.status.key, 'cancelled');
  assert.equal(v.status.tone, 'neutral');
  assert.equal(v.status.sub, 'ยกเลิกเมื่อ 15/09/2026 11:05 — แก้ผลและส่งไม่ได้');
  assert.equal(v.send.show, false);
  assert.equal(v.recallAction.show, false);
  assert.equal(v.recallAllowed, false);
  assert.equal(v.notices.find((n) => n.key === 'cancelled').text, 'ลูกค้าเลื่อนเปิดตึก');
  assert.equal(v.step.cancelled, true);
  assert.match(v.lockReason, /ยกเลิก/);
});

test('🐞 ส่งแล้วและฝ่ายขายปิดเรื่องแล้ว — ต้องไม่บอกว่า "รอฝ่ายขายปิดเรื่อง"', () => {
  /* ทางจบปกติของทุกใบ ไม่ใช่เคสขอบ: `closureStatus()` เขียน status='closed' ให้เอง
     เมื่อ answeredAt && closedAt ⇒ ของเดิมการ์ดบอกว่ารอ ขณะที่บรรทัดขั้นตอนข้าง ๆ
     ในคำตอบก้อนเดียวกันขึ้น "ปิดเรื่อง · ปิดโดย …" — เถียงกันเองบนจอเดียว */
  const v = surveyControlView({
    request: request({
      status: 'closed', answeredAt: '2026-09-14T10:20:00.000Z', answeredByName: 'Local D.',
      closedAt: '2026-09-15T03:00:00.000Z', closedByName: 'SA A.',
    }),
    zones: [readyZone('z1', 'Studio 01')], filesByZone: { z1: readyFiles }, viewer: HEAD,
  });
  assert.equal(v.status.key, 'sent');
  assert.equal(v.status.headline, 'ส่งผลแล้ว · ฝ่ายขายปิดเรื่องแล้ว');
  assert.equal(v.status.sub, 'ส่งโดย Local D. · 14/09/2026 17:20 · ฝ่ายขายปิดเรื่องแล้ว 15/09/2026 10:00');
  assert.equal(v.flags.settled, true);
  assert.equal(v.flags.closedWithoutAnswer, false, 'ปิดหลังส่ง ≠ ปิดทิ้งโดยไม่ตอบ');
  assert.equal(v.flags.locked, true);
  assert.equal(v.recallAction.show, true, 'ดึงกลับได้แม้ฝ่ายขายปิดไปแล้ว (§5E ④)');
});

test('ใบที่ปิดโดยไม่ได้ส่งผล (§5E ③) — ต้องเป็นสถานะของตัวเอง และบอกทางที่เหลือจริง', () => {
  const zones = [measuredZone('z1', 'Studio 01')];
  const v = surveyControlView({
    request: request({ status: 'closed', closedAt: '2026-09-15T04:05:00.000Z' }),
    zones, filesByZone: { z1: measuredFiles }, viewer: HEAD,
  });
  assert.equal(v.status.key, 'closed');
  assert.match(v.status.sub, /เปิดใบใหม่/);
  assert.equal(v.send.show, false);
  assert.equal(v.recallAction.show, false, 'ยังไม่เคยส่ง = ไม่มีอะไรให้ดึงกลับ');
  assert.equal(v.flags.locked, true);
  assert.equal(v.flags.closedWithoutAnswer, true);
  assert.equal(v.flags.settled, false);
});

test('ใบที่ไม่มีพื้นที่ / ถูกตัดออกหมด — ไม่ใช่ "กำลังวัด 0/0"', () => {
  const none = surveyControlView({ request: request(), zones: [], viewer: HEAD });
  assert.equal(none.status.key, 'no-zones');
  assert.equal(none.status.sub, 'ฝ่ายขายเป็นคนระบุพื้นที่ตอนเปิดใบ');
  assert.equal(none.send.allowed, false);

  const allCut = surveyControlView({
    request: request(),
    zones: [emptyZone('z1', 'Studio 01', { status: 'cut', cutReason: 'ปิดปรับปรุง' })],
    viewer: HEAD,
  });
  assert.equal(allCut.status.key, 'no-zones');
  assert.match(allCut.status.sub, /ถูกตัดออกหมดทั้ง 1 พื้นที่/);
  assert.match(allCut.send.reason.detail, /ไม่มีพื้นที่ที่ต้องประเมินเหลืออยู่เลย/);
});

test('พื้นที่ที่ถูกตัดไม่นับในแถบวัด แต่ต้องขึ้น "ตัดออก n"', () => {
  const zones = [
    readyZone('z1', 'Studio 01'),
    emptyZone('z2', 'Studio 02', { status: 'cut', cutReason: 'ปิดปรับปรุง' }),
  ];
  const v = surveyControlView({ request: request(), zones, filesByZone: { z1: readyFiles }, viewer: HEAD });
  assert.equal(v.progress.total, 1);
  assert.equal(v.progress.done, 1);
  assert.equal(v.progress.cut, 1);
  assert.equal(v.status.key, 'ready');
});

// ══ คนดูแต่ละแบบ ═══════════════════════════════════════════════════════
test('คนดูอย่างเดียว — ไม่มีปุ่มเลย + กล่องแจ้งบอกว่าใครบันทึกได้', () => {
  const zones = [emptyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')];
  const v = surveyControlView({ request: request(), zones, viewer: VIEWER });
  assert.equal(v.send.show, false);
  assert.equal(v.recallAction.show, false);
  assert.equal(v.flags.readOnly, true);
  assert.equal(v.notices.find((n) => n.key === 'read-only').text,
    'ดูได้อย่างเดียว — บันทึกผลได้เฉพาะช่างในนัดและหัวหน้าบริการ');
  assert.equal(v.nextZone.name, 'Studio 01');
});

test('ช่าง — เห็นเฉพาะสามข้อของตัวเอง หัวข้อ "ของที่ช่างต้องเก็บ" · เนื้อมาก่อนการ์ด', () => {
  const zones = [readyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')];
  const v = surveyControlView({ request: request(), zones, filesByZone: { z1: readyFiles }, viewer: CREW });
  assert.deepEqual(v.gates.map((g) => g.key), ['size', 'wide', 'spots']);
  assert.equal(v.gatesTitle, 'ของที่ช่างต้องเก็บ');
  assert.equal(v.send.show, false, 'ช่างไม่มีสิทธิ์ส่ง = ไม่โชว์ปุ่ม');
  assert.equal(v.flags.controlFirst, false, 'ช่างที่ยังกรอกได้ต้องเห็นพื้นที่ก่อนการ์ด');
  assert.equal(v.zoneGaps.crewPending, false, 'ปุ่มแจ้งช่างเป็นของหัวหน้า');
});

test('ช่างที่ทำส่วนของตัวเองครบแล้ว — บอกว่าต่อจากนี้เป็นของหัวหน้า', () => {
  const zones = [measuredZone('z1', 'Studio 01')];
  const v = surveyControlView({ request: request(), zones, filesByZone: { z1: measuredFiles }, viewer: CREW });
  assert.equal(v.notices.find((n) => n.key === 'crew-done').text,
    'ส่วนของช่างครบแล้ว — หัวหน้าบริการเป็นคนเคาะแพ็คเกจและส่งผล');
  assert.equal(v.gatesFailed, 0, 'ข้อของหัวหน้าไม่ใช่กำแพงของช่าง');
});

test('🐞 ช่างหลังส่งแล้ว ต้องไม่ถูกส่งไปกดปุ่มบนหน้าที่ role ts เปิดไม่ได้ (403)', () => {
  const zones = [readyZone('z1', 'Studio 01')];
  const v = surveyControlView({
    request: request({ answeredAt: '2026-09-14T10:20:00.000Z', answeredByName: 'Local D.' }),
    zones, filesByZone: { z1: readyFiles }, viewer: CREW,
  });
  const notice = v.notices.find((n) => n.key === 'crew-sent');
  assert.match(notice.text, /แจ้งหัวหน้าบริการให้กด "ดึงผลกลับมาแก้"/);
  assert.equal(v.notices.find((n) => n.key === 'read-only'), undefined);
  assert.equal(v.flags.controlFirst, true, 'ใบที่ล็อกแล้ว คำถามแรกคือสถานะ');
});

test('หัวหน้า — เห็นครบหกข้อ และเห็นปุ่มแจ้งช่างเมื่อยังมีของช่างค้าง', () => {
  const zones = [readyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')];
  const v = surveyControlView({
    request: request(), zones, filesByZone: { z1: readyFiles }, viewer: HEAD,
    visit: { id: 'SVV-1', assigneeId: 'U-9' },
  });
  assert.equal(v.gates.length, 6);
  assert.equal(v.gatesTitle, 'ด่านก่อนส่งผล');
  assert.equal(v.zoneGaps.crewPending, true);
  assert.deepEqual(v.zoneGaps.crewIds, ['U-9']);
  assert.equal(v.flags.controlFirst, true);
});

// ══ ด่านที่ติด รวมเป็นกลุ่มต่อพื้นที่ ═══════════════════════════════════
test('ด่านที่ติดรวมต่อพื้นที่ แยก "ช่างต้องเก็บ" กับ "หัวหน้าต้องทำ" พร้อมปุ่มพาไป', () => {
  const zones = [emptyZone('z1', 'Studio 01'), measuredZone('z2', 'Studio 02')];
  const v = surveyControlView({
    request: request(), zones, filesByZone: { z1: [], z2: measuredFiles }, viewer: HEAD, tab: 'field',
  });
  const [first, second] = v.zoneGaps.rows;
  assert.equal(first.zoneName, 'Studio 01');
  assert.deepEqual(first.crew, ['ขนาด', 'ภาพกว้าง', 'จุดติดตั้ง']);
  assert.equal(first.crewText, 'ช่างต้องเก็บ: ขนาด · ภาพกว้าง · จุดติดตั้ง');
  assert.equal(first.headText, 'หัวหน้าต้องทำ: ภาพผัง · เลือกจุด · แพ็คเกจ');
  assert.deepEqual(first.targets.map((t) => t.kind), ['zone'], 'ยังติดของช่าง = พาไปที่พื้นที่');
  assert.equal(second.crewText, null);
  assert.deepEqual(second.targets.map((t) => t.label), ['เปิด Studio 02', 'เคาะที่สรุปส่งผล']);
});

test('ด่านที่ติดแสดงไม่เกิน 3 พื้นที่ แล้วบอกว่าเหลืออีกกี่พื้นที่', () => {
  const zones = ['z1', 'z2', 'z3', 'z4', 'z5'].map((id, i) => emptyZone(id, `Studio 0${i + 1}`));
  const v = surveyControlView({ request: request(), zones, viewer: HEAD });
  assert.equal(v.zoneGaps.rows.length, 5);
  assert.equal(v.zoneGaps.shown.length, 3);
  assert.equal(v.zoneGaps.hidden, 2);
});

// ══ เหตุผลที่กดส่งไม่ได้ ════════════════════════════════════════════════
test('ลำดับเหตุผล ① การเคาะที่ยังไม่บันทึก มาก่อนทุกอย่าง', () => {
  const zones = [readyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')];
  const v = surveyControlView({
    request: request(), zones, filesByZone: { z1: readyFiles }, viewer: HEAD,
    pendingDecisionZoneIds: ['z1'], dirtyZoneIds: ['z2'], tab: 'field',
  });
  assert.equal(v.send.reason.key, 'result-dirty');
  assert.equal(v.send.reason.text, 'มีการเคาะที่ยังไม่บันทึก 1 พื้นที่ — บันทึกก่อนส่ง');
  assert.deepEqual(v.send.reason.target, { kind: 'tab', tab: 'result', label: 'ไปบันทึกการเคาะ' });
  assert.equal(v.send.allowed, false);
});

test('ลำดับเหตุผล ② ค่าที่พิมพ์ค้างในพื้นที่ — ปุ่มพาไปพื้นที่นั้น', () => {
  const zones = [readyZone('z1', 'Studio 01'), readyZone('z2', 'Studio 02')];
  const v = surveyControlView({
    request: request(), zones, filesByZone: { z1: readyFiles, z2: readyFiles }, viewer: HEAD,
    dirtyZoneIds: ['z2'],
  });
  assert.equal(v.send.reason.key, 'field-dirty');
  assert.equal(v.send.reason.text, 'Studio 02 มีค่าที่พิมพ์ค้าง ยังไม่บันทึก');
  assert.deepEqual(v.send.reason.target, { kind: 'zone', zoneId: 'z2', label: 'ไปที่ Studio 02' });
});

test('ลำดับเหตุผล ③ ด่านหกข้อ — ของช่างติด = พาไปพื้นที่ · เหลือแต่เลือกจุด/แพ็คเกจ = พาไปแท็บเคาะ', () => {
  const crewStuck = surveyControlView({
    request: request(),
    zones: [readyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')],
    filesByZone: { z1: readyFiles }, viewer: HEAD, tab: 'field',
  });
  assert.equal(crewStuck.send.reason.key, 'crew-gaps');
  // ⚠️ เลขที่ผู้ใช้อ่านต้องตรึงเป็นเลขจริง — /\d/ ปล่อยให้ตัวเลขบนจอเปลี่ยนโดยเทสต์ไม่ตก
  assert.equal(crewStuck.send.reason.text, 'ยังส่งไม่ได้ — ติด 6 ข้อ ที่ Studio 02 · รอช่างเก็บงาน');
  assert.match(crewStuck.send.reason.detail, /Studio 02/);
  assert.deepEqual(crewStuck.send.reason.target, { kind: 'zone', zoneId: 'z2', label: 'เปิด Studio 02' });

  // ผังมาแล้ว เหลือ "เลือกจุด · แพ็คเกจ" ซึ่งเคาะที่แท็บสรุป ⇒ ปุ่มพาไปแท็บนั้น
  const headStuck = surveyControlView({
    request: request(),
    zones: [measuredZone('z1', 'Studio 01')],
    filesByZone: { z1: plannedFiles }, viewer: HEAD, tab: 'field',
  });
  assert.equal(headStuck.send.reason.key, 'head-gaps');
  assert.deepEqual(headStuck.send.reason.target, { kind: 'tab', tab: 'result', label: 'ไปเคาะที่แท็บสรุปส่งผล' });
  // อยู่แท็บนั้นอยู่แล้ว = ไม่มีปุ่มพาไปไหน
  assert.equal(surveyControlView({
    request: request(), zones: [measuredZone('z1', 'Studio 01')],
    filesByZone: { z1: plannedFiles }, viewer: HEAD, tab: 'result',
  }).send.reason.target, null);
});

test('🐞 ขาดแค่ "ภาพผัง" — ปุ่มพาไปต้องเป็นพื้นที่ ไม่ใช่แท็บสรุปที่อัปผังไม่ได้', () => {
  /* ช่องอัป `survey_plan` อยู่ใน SurveyZoneCard ซึ่งเรนเดอร์เฉพาะแท็บหน้างาน ⇒ ปุ่มที่
     พาไปแท็บสรุปคือทางตัน · กฎเดียวกับที่กลุ่มด่านต่อพื้นที่ใช้อยู่แล้ว */
  const zones = [readyZone('z1', 'Studio 01'), readyZone('z2', 'Studio 02')];
  const files = { z1: [WIDE], z2: [WIDE] };
  const v = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD, tab: 'field' });
  assert.equal(v.send.reason.key, 'head-gaps');
  assert.equal(v.send.reason.text, 'ยังส่งไม่ได้ — ติด 1 ข้อ ที่ Studio 01 · Studio 02');
  assert.deepEqual(v.send.reason.target, { kind: 'zone', zoneId: 'z1', label: 'เปิด Studio 01' });
  assert.deepEqual(v.send.reason.target, v.zoneGaps.rows[0].targets[0], 'กฎ "ไปไหน" ต้องมีชุดเดียว');
  // อยู่แท็บสรุปแล้วก็ยังต้องพากลับเข้าพื้นที่ ไม่ใช่ตอบ null
  assert.deepEqual(surveyControlView({
    request: request(), zones, filesByZone: files, viewer: HEAD, tab: 'result',
  }).send.reason.target, { kind: 'zone', zoneId: 'z1', label: 'เปิด Studio 01' });
});

test('🐞 คนที่ไม่มีสิทธิ์ส่ง — บรรทัดย่อกับเหตุผลเต็มต้องพูดตรงกัน และไม่มีปุ่มพาไป', () => {
  /* ของเดิม text = "ยังส่งไม่ได้ — ติด 6 ข้อ … รอช่างเก็บงาน" แต่ detail = "เฉพาะหัวหน้า…"
     ⇒ ชวนช่างไปเก็บงานเพื่อกดปุ่มที่เขาไม่มีวันกดได้ */
  const v = surveyControlView({
    request: request(), zones: [readyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')],
    filesByZone: { z1: readyFiles }, viewer: CREW,
  });
  assert.equal(v.send.reason.key, 'no-permission');
  assert.equal(v.send.reason.text, 'ส่งผลประเมินได้เฉพาะหัวหน้าฝ่ายบริการ');
  assert.equal(v.send.reason.text, v.send.reason.detail);
  assert.equal(v.send.reason.target, null);
  assert.equal(v.send.show, false);
});

test('🔴 ค่าที่ยังไม่บันทึกต้อง fail-closed — id ที่แมตช์ไม่เจอก็ยังบล็อก · แถวที่ตัดออกไม่บล็อก', () => {
  const zones = [readyZone('z1', 'Studio 01')];
  const base = { request: request(), zones, filesByZone: { z1: readyFiles }, viewer: HEAD };
  const ghostDirty = surveyControlView({ ...base, dirtyZoneIds: ['ghost'] });
  assert.equal(ghostDirty.send.allowed, false, 'หาแถวไม่เจอ ≠ ไม่มีค่าค้าง');
  assert.equal(ghostDirty.send.reason.key, 'field-dirty');
  assert.equal(ghostDirty.send.reason.text, 'มีค่าที่พิมพ์ค้าง ยังไม่บันทึก — บันทึกก่อนส่ง');
  assert.equal(ghostDirty.send.reason.target, null, 'ไม่รู้ว่าพื้นที่ไหน = ไม่ชี้มั่ว');

  const ghostPending = surveyControlView({ ...base, pendingDecisionZoneIds: ['ghost'] });
  assert.equal(ghostPending.send.allowed, false);
  assert.equal(ghostPending.send.reason.text, 'มีการเคาะที่ยังไม่บันทึก 1 พื้นที่ — บันทึกก่อนส่ง');

  // แถวที่ถูกตัดออกแก้อะไรไม่ได้อยู่แล้ว ⇒ ค่าค้างบนนั้นต้องไม่ขวางการส่ง
  const cutDirty = surveyControlView({
    ...base,
    zones: [readyZone('z1', 'Studio 01'), emptyZone('zc', 'Studio 09', { status: 'cut', cutReason: 'ปิดปรับปรุง' })],
    dirtyZoneIds: ['zc'],
  });
  assert.equal(cutDirty.send.allowed, true);
  assert.equal(cutDirty.send.reason, null);
});

test('ไม่มีสิทธิ์ส่ง = ไม่โชว์ปุ่ม (ไม่ใช่ปุ่มจาง) · ด่าน server ยังตอบว่าทำไม', () => {
  const v = surveyControlView({
    request: request(), zones: [readyZone('z1', 'Studio 01')],
    filesByZone: { z1: readyFiles }, viewer: CREW,
  });
  assert.equal(v.send.show, false);
  assert.equal(v.send.allowed, false);
  assert.match(v.send.reason.detail, /ได้เฉพาะหัวหน้าฝ่ายบริการ/);
});

// ══ ขั้นของใบ + กำหนดส่ง ═══════════════════════════════════════════════
test('ขั้นของใบใช้ชุด 6 ขั้นเดียวกับหน้าคำร้อง — บรรทัดรองเล่าความคืบหน้าจริง', () => {
  const zones = [readyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')];
  const v = surveyControlView({ request: request(), zones, filesByZone: { z1: readyFiles }, viewer: HEAD });
  assert.equal(v.step.total, 6);
  assert.equal(v.step.index, 3);
  assert.equal(v.step.label, 'รอ TS ตอบ');
  assert.equal(v.step.hint, 'วัดแล้ว 1/2 พื้นที่');
  assert.deepEqual(v.step.steps.map((s) => s.label),
    ['จัดทำคำร้อง', 'รอรับเรื่อง', 'ลงคิว', 'รอ TS ตอบ', 'ตอบแล้ว', 'ปิดเรื่อง']);
});

test('วันเลยกำหนดมาจาก "วันนี้" ที่ผู้เรียกส่งมา ไม่ใช่นาฬิกาในฟังก์ชัน', () => {
  const zones = [emptyZone('z1', 'Studio 01')];
  const base = { request: request(), zones, viewer: HEAD };
  assert.equal(surveyControlView(base).due.overdueDays, null, 'ไม่ส่ง today = ไม่เดา');
  assert.equal(surveyControlView({ ...base, today: '2026-09-16' }).due.overdueDays, 2);
  assert.equal(surveyControlView({ ...base, today: '2026-09-14' }).due.overdueDays, null, 'ถึงกำหนดพอดี ≠ เลย');
  assert.equal(surveyControlView({
    ...base, today: '2026-09-16',
    request: request({ answeredAt: '2026-09-13T10:00:00.000Z' }),
  }).due.overdueDays, null, 'ส่งไปแล้วไม่ต้องเตือนว่าเลยกำหนด');
});

// ══ 🔴 อ่านไม่สำเร็จ ≠ ไม่มีข้อมูล ═══════════════════════════════════════
test('🔴 อ่านชิ้นประกอบไม่สำเร็จ ต้องขึ้นกล่องแจ้ง "ไม่ทราบ" ไม่ใช่เงียบ', () => {
  const zones = [readyZone('z1', 'Studio 01')];
  const v = surveyControlView({
    request: request(), zones, filesByZone: { z1: readyFiles }, viewer: HEAD,
    unknown: { site: true, zoneCodes: true },
  });
  const notice = v.notices.find((n) => n.key === 'unknown');
  assert.match(notice.text, /ข้อมูลไซต์ · รหัสพื้นที่ \(ZN\)/);
  assert.match(notice.text, /ไม่ทราบ/);
  assert.deepEqual(notice.keys, ['site', 'zoneCodes']);
  assert.deepEqual(v.unknown, { site: true, zoneCodes: true });
  assert.equal(v.status.key, 'ready', 'เนื้อหลักอ่านได้ ⇒ ยังตอบสถานะได้ตามปกติ');
});

test('🔴 อ่านแถวดึงกลับไม่สำเร็จ ห้ามแปลว่า "ไม่เคยถูกดึงกลับ"', () => {
  const zones = [emptyZone('z1', 'Studio 01')];
  const v = surveyControlView({
    request: request(), zones, viewer: HEAD, recall: null, unknown: { recall: true },
  });
  assert.equal(v.flags.recallPending, false);
  assert.equal(v.flags.recallKnown, false, 'จอต้องรู้ว่าคำตอบนี้เชื่อไม่ได้');
  assert.match(v.notices.find((n) => n.key === 'unknown').text, /ประวัติการดึงผลกลับ/);
});

test('ไม่มีอะไรอ่านพลาด = ไม่มีกล่องแจ้ง (ไม่ใช่กล่องเปล่า)', () => {
  const v = surveyControlView({
    request: request(), zones: [readyZone('z1', 'Studio 01')],
    filesByZone: { z1: readyFiles }, viewer: HEAD, unknown: {},
  });
  assert.equal(v.notices.find((n) => n.key === 'unknown'), undefined);
  assert.equal(v.flags.recallKnown, true);
});

test('เรียกแบบไม่มีอะไรเลย ต้องไม่ระเบิด — จอ loading เรียกก่อนข้อมูลมาถึงได้', () => {
  const v = surveyControlView();
  assert.equal(v.status.key, 'no-zones');
  assert.equal(v.send.show, false);
  assert.match(v.lockReason, /ไม่พบใบคำร้อง/);
  assert.equal(v.step.total, 6);
});

// ── PR4 · พื้นที่พับได้ ────────────────────────────────────────────────────

test('ลายเซ็นค่าที่กรอก: "8.00" กับ 8 คือค่าเดียวกัน (ไม่งั้นบันทึกแล้วยังค้าง "ยังไม่บันทึก")', () => {
  const typed = surveyZoneDraftSignature({
    parts: [{ id: 'new-abc', label: ' ปีกเหนือ ', widthM: '8.00', lengthM: '5', heightM: '3.0' }],
    spots: [{ id: 'new-xyz', label: 'มุมโซฟา', note: '' }],
    note: 'ฝ้าสูง',
  });
  const stored = surveyZoneDraftSignature({
    parts: [{ id: 'row-1', label: 'ปีกเหนือ', widthM: 8, lengthM: 5, heightM: 3 }],
    spots: [{ id: 'row-2', label: 'มุมโซฟา', note: null }],
    note: 'ฝ้าสูง',
  });
  assert.equal(typed, stored, 'server ปรับรูปเลขให้ตอนบันทึก — เทียบดิบ ๆ จะต่างทุกครั้ง');
});

test('ลายเซ็น: แถวว่างล้วนไม่นับ แต่แถวที่พิมพ์ไปแล้วช่องเดียวนับ', () => {
  const blank = surveyZoneDraftSignature({ parts: [{ label: '', widthM: '', lengthM: '', heightM: '' }] });
  assert.equal(blank, surveyZoneDraftSignature({ parts: [] }),
    'การ์ดเปิดมาพร้อมช่องเปล่าหนึ่งแถวเสมอ — ถ้านับ ทุกพื้นที่จะขึ้น "ยังไม่บันทึก" ตั้งแต่เปิดหน้า');
  assert.notEqual(surveyZoneDraftSignature({ parts: [{ label: '', widthM: '4', lengthM: '', heightM: '' }] }), blank);
  assert.notEqual(surveyZoneDraftSignature({ spots: [{ label: 'เสา 3', note: '' }] }),
    surveyZoneDraftSignature({ spots: [] }));
  assert.notEqual(surveyZoneDraftSignature({ note: 'x' }), surveyZoneDraftSignature({}));
});

test('ลายเซ็นไม่ระเบิดกับค่าที่ไม่ใช่ลิสต์ (ใบเก่า/ค่าที่อ่านมาเพี้ยน)', () => {
  assert.equal(surveyZoneDraftSignature(), surveyZoneDraftSignature({ parts: null, spots: undefined, note: null }));
});

test('จอส่ง dirtyZoneIds ที่ยกธงจากการ์ดจริง ๆ — ด่านของ PR2 ถึงจะมีคนยิงให้', () => {
  const page = readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /dirtyZoneIds,/, 'ต้องส่งเข้า surveyControlView');
  assert.match(page, /onDirtyChange=\{handleDirtyZone\}/, 'การ์ดเป็นคนบอกว่าตัวเองมีค่าค้าง');
  assert.match(page, /open=\{isZoneOpen\(zone\.id\)\}/);
  assert.match(page, /view\.foldDefaults/, 'ค่าเปิด/ปิดตั้งต้นมาจากตัวตัดสิน ไม่ใช่กฎชุดที่สองบนจอ');
  assert.match(page, /ย่อทุกพื้นที่/);
  assert.match(page, /ขยายทุกพื้นที่/);
  assert.doesNotMatch(page, /localStorage/, 'ค่าพับห้ามจำข้ามครั้ง (กติกาของแบบที่อนุมัติ)');
});

test('การ์ดพื้นที่: ป้ายค้าง/ป้ายพัง · บังคับเปิดเมื่อบันทึกไม่สำเร็จ · ลิงก์ไปพื้นที่ถัดไป', () => {
  const card = readFileSync(new URL('../../components/service/SurveyZoneCard.js', import.meta.url), 'utf8');
  assert.match(card, /ยังไม่บันทึก/);
  assert.match(card, /บันทึกไม่สำเร็จ/);
  assert.match(card, /role="alert"/, 'error ต้องประกาศตัวเอง ไม่ใช่ตัวหนังสือเงียบ ๆ');
  assert.match(card, /onSaveFailed\?\.\(zone\.id\)/, 'บันทึกไม่ผ่าน = บังคับเปิดพื้นที่นั้น');
  /* คำบนลิงก์เปลี่ยนตามทิศ — ดูเทสต์ "ลิงก์ถัดไปต้องเดินไปข้างหน้า" ข้างล่าง
     (เดิมพินไว้เป็น `ถัดไป: {nextZone.name}` ตายตัว ซึ่งเป็นคำที่ผิดตอนวนกลับต้นลิสต์) */
  assert.match(card, /\{nextZone\.back \? "กลับไปที่" : "ถัดไป:"\} \{nextZone\.name\} \(ยังไม่ครบ\)/);
  assert.match(card, /keepOpen: dirty \|\| !!error/,
    'พับพื้นที่ปัจจุบันได้เฉพาะตอนไม่มีค่าค้างและไม่มี error');
  assert.match(card, /surveyZoneFacts\(zone, shownFiles\)/,
    'ตัวเลขบนหัวมาจากตัวตัดสินกลาง + ไฟล์สดของแผงแนบ (ตัวนับรูปต้องขยับทันที)');
});

test('การ์ดรับแถวที่โหลดใหม่กลับเข้ามา — ค่าค้างปลอมล็อกปุ่มส่งผลไม่ได้', () => {
  const card = readFileSync(new URL('../../components/service/SurveyZoneCard.js', import.meta.url), 'utf8');
  /* 🐞 จอนี้โหลดซ้ำเองเมื่อสลับกลับมาที่แท็บ และนัดหนึ่งใบมีช่างได้หลายคน ⇒ ช่างอีกคน
     บันทึกพื้นที่เดียวกันเมื่อไร การ์ดที่ไม่เคยอ่าน prop กลับเข้ามาจะโชว์ค่าเก่า ·
     ขึ้นป้าย "ยังไม่บันทึก" ทั้งที่ไม่มีใครพิมพ์ · แล้วธงนั้นวิ่งไป `dirtyZoneIds`
     ล็อกปุ่มส่งผลถาวรโดยโทษผู้ใช้ (พิสูจน์สดแล้ว: ฐานเป็น 12 · ช่องยังเป็น 4) */
  assert.match(card, /savedSigRef/, 'ต้องจำลายเซ็นของแถวที่รับมาล่าสุดไว้เทียบ');
  assert.match(card, /adoptRow\(zoneRef\.current\)/, 'ไม่มีของค้าง = รับแถวใหม่มาเลย');
  assert.match(card, /ถูกแก้จากที่อื่น/, 'มีของค้างจริง = บอกว่าแถวถูกแก้ ไม่ใช่เงียบแล้วให้ทับ');
  assert.match(card, /ใช้ค่าล่าสุดจากฐาน/, 'ต้องมีทางออกที่ไม่ใช่การกดบันทึกทับ');
});

test('ลิงก์ "ถัดไป" ต้องเดินไปข้างหน้าในลิสต์ ไม่ใช่เด้งกลับใบแรกเสมอ', () => {
  const page = readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  /* 🐞 เดิม `rows.find(r => r.crew.length && r.zoneId !== zoneId)` = ใบแรกของลิสต์เสมอ
     ⇒ ใบ 5 พื้นที่ที่ขาดที่ 1 กับ 5 จะสลับ 1↔5 ไม่จบ และพับใบที่เพิ่งทำเสร็จทิ้ง */
  assert.match(page, /const order = new Map\(zones\.map/, 'ลำดับวัดจากลิสต์ที่ตาเห็น');
  assert.match(page, /order\.get\(r\.zoneId\) \?\? Infinity\) > here/, 'เลือกตัวที่อยู่หลังตำแหน่งปัจจุบัน');
  assert.match(page, /back: !ahead/, 'วนกลับต้นลิสต์เมื่อไร ต้องบอกการ์ดให้เปลี่ยนคำ');
});
