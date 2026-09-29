// ── การ์ดควบคุมของใบประเมิน + ข้อเท็จจริงรายพื้นที่ — ตัวตัดสินล้วน (PR2) ──────
//
// ⭐ ครอบ **ทุกสถานะที่แบบที่อนุมัติระบุไว้**: ยังไม่เริ่ม · กำลังวัด · วัดครบยังไม่เคาะ ·
//   ส่งแล้ว · ดึงกลับ · ยกเลิก · ปิดโดยไม่ได้ตอบ · คนดูอย่างเดียว · ช่าง vs หัวหน้า ·
//   ไม่มีพื้นที่ · พื้นที่เดียว · พื้นที่ที่ถูกตัด · และ **อ่านข้อมูลไม่สำเร็จ**
//   (ข้อสุดท้ายคือกับดักประจำรีโปนี้: `supabase-js` ไม่ throw ⇒ อ่านพลาดกลายเป็น
//    "ไม่มีข้อมูล" เงียบ ๆ ถ้าไม่มีใครดักไว้)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
// 📍 `surveyRecallRecord` อยู่ใน `survey.js` (ฝั่งกฎ) เพราะ **server อ่านมันด้วย** —
//    `surveyRepo` แกะแถวเดียวกันตอนตอบ GET ⇒ ชั้นต้องไหลทางเดียว จอ → กฎ ไม่ใช่ repo → จอ
import { surveyRecallRecord } from './survey.js';
import {
  SURVEY_UNKNOWN_TEXT,
  surveyControlView,
  surveyDraftSync,
  surveyZoneChangedSections,
  surveyNameList,
  surveyResultZoneCell,
  surveySendBackAskText,
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

// ══ ช่อง "พื้นที่ · ผลวัดจากช่าง" ของตารางสรุป (AW-3 · §10.5 S2) ═══════════════
test('ช่องพื้นที่บนตารางสรุป: ตร.ม. · ลบ.ม. · ขนาดรายส่วน — ส่วนเดียวกับหลายส่วน', () => {
  const one = surveyResultZoneCell(readyZone('z1', 'Reception', { parts: [part(8, 6, 3)] }), []);
  assert.equal(one.figures, '48 ตร.ม. · 144 ลบ.ม.');
  assert.equal(one.dims, '8 × 6 × 3 ม.');
  assert.equal(one.partsText, null, 'ส่วนเดียวไม่ต้องบอกจำนวนส่วน');

  const two = surveyResultZoneCell(readyZone('z2', 'ห้อง Treatment', {
    parts: [part(7.5, 4, 3), part(3, 2, 3)],
  }), []);
  assert.equal(two.figures, '36 ตร.ม. · 108 ลบ.ม.');
  assert.equal(two.dims, '7.5 × 4 × 3 + 3 × 2 × 3 ม.');
  assert.equal(two.partsText, '2 ส่วน');
});

test('🐞 ช่องขนาดที่ยังว่างต้องเป็นขีด ไม่ใช่ "× 0" — ศูนย์อ่านเหมือนวัดได้ศูนย์เมตร', () => {
  /* เดิมตารางเขียน `fmtNumber(p.heightM)` ตรง ๆ ⇒ `fmtNumber('')` = "0" ⇒ "8 × 6 × 0" */
  const half = surveyResultZoneCell(emptyZone('z1', 'Reception', { parts: [part(8, 6, '')] }), []);
  assert.equal(half.dims, '8 × 6 × — ม.');
  assert.equal(half.figures, null, 'ยังไม่มีส่วนที่วัดครบ = ยังไม่มีตัวเลขพื้นที่ ไม่ใช่ 0 ตร.ม.');
  const none = surveyResultZoneCell(emptyZone('z2', 'MD'), []);
  assert.equal(none.dims, null);
  assert.equal(none.figures, null);
});

test('รูปจากช่างบนช่องพื้นที่: ภาพกว้างก่อน แล้วภาพจุด · ไม่เอาผัง ไม่เอาไฟล์ที่ไม่ใช่รูป · นับครบทุกไฟล์', () => {
  const img = (id, docType, fileName = `${id}.jpg`) => ({ id, docType, fileName, mimeType: 'image/jpeg', driveFileId: `d-${id}` });
  const files = [
    img('s1', 'survey_spot'), img('w1', 'survey_wide'), img('p1', 'survey_plan'),
    { id: 'w2', docType: 'survey_wide', fileName: 'แบบ.pdf', mimeType: 'application/pdf' },
    img('w3', 'survey_wide'),
  ];
  const cell = surveyResultZoneCell(readyZone('z1', 'Reception'), files);
  assert.deepEqual(cell.thumbs.map((t) => [t.file.id, t.kind, t.startsGroup]),
    [['w1', 'wide', false], ['w3', 'wide', false], ['s1', 'spot', true]]);
  assert.deepEqual(cell.thumbs.map((t) => t.label), ['ภาพกว้าง', 'ภาพกว้าง', 'ภาพจุด']);
  assert.equal(cell.thumbs[0].href, '/api/master/attachments/w1/file', 'เปิดผ่าน proxy ที่ตรวจสิทธิ์ ตัวเดียวกับแผงไฟล์แนบ');
  assert.deepEqual(cell.photos, { wide: 3, plan: 1, spot: 1 }, 'ตัวนับนับไฟล์จริงทุกใบ ไม่ใช่เฉพาะที่มีภาพย่อ');
  assert.equal(cell.moreThumbs, 0);

  const many = surveyResultZoneCell(readyZone('z1', 'Reception'),
    ['a', 'b', 'c', 'd', 'e'].map((id) => img(id, 'survey_wide')));
  assert.equal(many.thumbs.length, 3, 'ภาพย่อไม่เกินสามช่อง — ช่องแคบ ตัวนับบอกที่เหลือ');
  assert.equal(many.moreThumbs, 2);
  assert.deepEqual(surveyResultZoneCell(readyZone('z1', 'R'), []).thumbs, []);
  // แถวที่ไม่มีที่อยู่ไฟล์ = ไม่มีภาพย่อ (ลิงก์ที่ไม่มีปลายทาง) แต่ยังนับ
  const lost = surveyResultZoneCell(readyZone('z1', 'R'), [{ id: 'x', docType: 'survey_wide', mimeType: 'image/png' }]);
  assert.deepEqual([lost.thumbs.length, lost.photos.wide], [0, 1]);
});

test('🔴 "ยังไม่มีรหัส ZN" กับ "อ่านรหัสไม่สำเร็จ" ต้องแยกกันบนหัวพื้นที่', () => {
  const pending = surveyZoneFacts({ ...emptyZone('z9', 'พื้นที่ใหม่'), zoneId: null, zoneCode: null }, []);
  assert.equal(pending.zoneCode, null);
  assert.equal(pending.zoneCodeUnknown, false);
  const broken = surveyZoneFacts({ ...emptyZone('z9', 'Studio 09'), zoneCode: null, zoneCodeUnknown: true }, []);
  assert.equal(broken.zoneCodeUnknown, true);
});

// ══ ค่าเปิด/ปิดตั้งต้น — ถอดแล้ว (§10.5 S10) ═══════════════════════════════════
// 🔄 แบบ A ไม่มีอะไรพับ ⇒ `surveyFoldDefaults` ถอด · ของที่เคยตรึงไว้ย้ายไป `surveyFieldView.test.mjs`:
//    พื้นที่ตั้งต้นของบานขวา (`surveyDefaultZoneId`) และ 🐞 `canWrite` ของ server ไม่รู้จักการล็อก
test('ตัวตัดสินไม่ส่งค่าพับตั้งต้นแล้ว — ไม่มีจอไหนพับพื้นที่', () => {
  const v = surveyControlView({ request: request(), zones: [emptyZone('z1', 'Studio 01')], filesByZone: {}, viewer: HEAD });
  assert.equal(v.foldDefaults, undefined);
  const src = readFileSync(new URL('./surveyControl.js', import.meta.url), 'utf8');
  assert.doesNotMatch(src, /export function surveyFoldDefaults/);
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

/* 🐞 รีวิว 24/09 — ฝ่ายขายกด "ปิดเรื่อง" ไปก่อนมติข้อ 3 (closedAt มี · ใบยัง acknowledged) = เปิดกลับได้ด้วย "ยังไม่จบ"
   การ์ดเคยบอก "เปิดใบใหม่" (คำของใบที่ปิดโดยไม่ได้ประเมิน ซึ่งเปิดกลับไม่ได้จริง) ⇒ คนวัดซ้ำทั้งใบโดยไม่จำเป็น */
test('🔴 ฝ่ายขายปิดไปก่อนได้ผล — ล็อก · บอกทาง "ยังไม่จบ" ไม่ใช่ "เปิดใบใหม่"', () => {
  const zones = [measuredZone('z1', 'Studio 01')];
  const v = surveyControlView({
    request: request({ status: 'acknowledged', closedAt: '2026-09-19T02:00:00.000Z' }),
    zones, filesByZone: { z1: measuredFiles }, viewer: HEAD,
  });
  assert.equal(v.flags.locked, true);
  assert.equal(v.send.show, false);
  assert.equal(v.status.headline, 'ฝ่ายขายปิดเรื่องไปก่อนได้ผล');
  assert.match(v.status.sub, /“ยังไม่จบ”/);
  assert.doesNotMatch(v.status.sub, /เปิดใบใหม่/);
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

// ── นัดยังเปิด = ช่างยังไม่กดส่งงาน (มติผู้ใช้ 2026-09-21) ─────────────────
const live = { id: 'SVV-1', status: 'in_progress' };
const scheduled = { id: 'SVV-1', status: 'scheduled' };
const doneZones = () => [measuredZone('z1', 'Studio 01')];
const doneFiles = { z1: measuredFiles };

test('🐞 วัดครบแต่นัดยังเปิด — รางต้องไม่บอกช่างว่า "รอหัวหน้าเคาะ" ข้างปุ่มส่งงานที่ยังไม่ได้กด', () => {
  const crew = surveyControlView({ request: request(), zones: doneZones(), filesByZone: doneFiles, visit: live, viewer: CREW });
  assert.equal(crew.status.key, 'awaiting-submit');
  assert.equal(crew.status.headline, 'วัดครบแล้ว — กด “ส่งงาน” เพื่อแจ้งหัวหน้า');
  assert.equal(crew.status.sub, 'วัดแล้ว 1 / 1 พื้นที่ · ส่งแล้วหัวหน้าเคาะจุดและแพ็คเกจต่อ', 'บรรทัดรองบอกก้าวถัดไปของใคร ไม่ท่องพาดหัวซ้ำ');
  assert.equal(crew.notices.find((n) => n.key === 'crew-done'), undefined, 'ยังไม่จบ ห้ามขึ้นเขียว');
  // พาดหัวพูดที่เดียว — ไม่มีกล่องแจ้งซ้ำคำสั่ง (และคำว่า "แถบล่าง" ชี้ผิดทิศบนจอแคบ)
  assert.ok(!crew.notices.some((n) => /ส่งงาน/.test(n.text)), 'คำสั่งกดส่งงานต้องมีที่เดียว');

  // ส่งงานแล้ว (นัดปิด) = พาดหัวเดิม · ไม่มีกล่องแจ้งซ้ำ (แถบบอกผลของช่างพูดแล้ว)
  const done = surveyControlView({ request: request(), zones: doneZones(), filesByZone: doneFiles, visit: { ...live, status: 'done' }, viewer: CREW });
  assert.equal(done.status.key, 'awaiting-decision');
  assert.equal(done.notices.find((n) => n.key === 'crew-done'), undefined);
  // ใบไม่มีนัด (ข้อมูลเก่า) — กล่องแจ้งเดิมยังเป็นที่เดียวที่บอก
  const legacy = surveyControlView({ request: request(), zones: doneZones(), filesByZone: doneFiles, viewer: CREW });
  assert.ok(legacy.notices.find((n) => n.key === 'crew-done'));
});

test('ถ้อยคำเดินตามคนอ่าน — หัวหน้า · Senior ที่อยู่บนนัด · คนอ่านอย่างเดียว', () => {
  const head = surveyControlView({ request: request(), zones: doneZones(), filesByZone: doneFiles, visit: live, viewer: HEAD });
  assert.equal(head.status.headline, 'วัดครบแล้ว — ช่างยังไม่กดส่งงาน');
  assert.match(head.status.sub, /เคาะจุดและแพ็คเกจได้เลย/, 'หัวหน้าไม่ต้องรอช่าง');

  // 🐞 Senior ที่ออกหน้างานเอง = คนส่งงานเอง ไม่ใช่ "ช่างยังไม่กดส่งงาน"
  const senior = surveyControlView({ request: request(), zones: doneZones(), filesByZone: doneFiles, visit: live, viewer: { ...HEAD, onVisit: true } });
  assert.equal(senior.status.headline, 'วัดครบแล้ว — กด “ส่งงาน” เพื่อปิดงานหน้างาน');
  assert.equal(senior.flags.controlFirst, false, 'Senior ที่ออกหน้างานต้องเห็นพื้นที่+แถบส่งงานก่อนการ์ด');
  assert.match(senior.status.sub, /ส่งงานแล้วเคาะจุดและแพ็คเกจต่อได้เลย/);
  // ส่งงานแล้ว — งานถัดไปของ Senior คือเคาะ/ส่งผลบนการ์ด ⇒ การ์ดกลับมาก่อน
  const seniorDone = surveyControlView({ request: request(), zones: doneZones(), filesByZone: doneFiles, visit: { ...live, status: 'done' }, viewer: { ...HEAD, onVisit: true } });
  assert.equal(seniorDone.flags.controlFirst, true);
  assert.equal(seniorDone.status.key, 'awaiting-decision');
  assert.equal(seniorDone.notices.find((n) => n.key === 'crew-done'), undefined, 'หัวหน้าไม่ใช่ผู้รับกล่องของช่าง');

  // 🐞 คนอ่านอย่างเดียวไม่มีปุ่มส่งงาน ⇒ ห้ามสั่งให้กด
  const reader = surveyControlView({ request: request(), zones: doneZones(), filesByZone: doneFiles, visit: live, viewer: VIEWER });
  assert.equal(reader.status.headline, 'วัดครบแล้ว — ช่างยังไม่กดส่งงาน');
  assert.doesNotMatch(reader.status.sub, /คุณ/);
});

test('ยังไม่กดเริ่มงาน — "ยังไม่เริ่มงานหน้างาน" ไม่ว่าจะกรอกล่วงหน้าไปเท่าไร (แถบมีแค่ปุ่มเริ่มงาน)', () => {
  const none = surveyControlView({
    request: request(), zones: [emptyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')],
    filesByZone: {}, visit: scheduled, viewer: CREW,
  });
  assert.equal(none.status.key, 'not-started');
  assert.equal(none.status.headline, 'ยังไม่เริ่มงานหน้างาน');

  const some = surveyControlView({
    request: request(), zones: [measuredZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')],
    filesByZone: { z1: measuredFiles }, visit: scheduled, viewer: CREW,
  });
  assert.equal(some.status.key, 'not-started');
  assert.equal(some.status.sub, 'วัดแล้ว 1 / 2 พื้นที่ · เหลือ Studio 02', 'คำเดียวกับหัวลิสต์/ป้ายการ์ด');

  // 🐞 กรอกครบก่อนกดเริ่ม — ห้ามสั่ง "กด ส่งงาน" เพราะแถบยังมีแค่ "เริ่มงาน"
  const all = surveyControlView({ request: request(), zones: doneZones(), filesByZone: doneFiles, visit: scheduled, viewer: CREW });
  assert.equal(all.status.key, 'not-started');
  assert.ok(!all.notices.some((n) => /ส่งงาน/.test(n.text)));
});

// ── วงส่งกลับให้ช่างแก้ (มติผู้ใช้ 2026-09-22) ─────────────────────────────
test('การ์ดของหัวหน้าบอกว่ารอช่างแก้ หรือช่างแจ้งแล้ว — ช่างไม่เห็นกล่องนี้ (อยู่บนแถบแทน)', () => {
  const sentBack = { id: 'B-1', at: '2026-09-22T03:00:00.000Z', byName: 'หัวหน้า', note: 'ถ่ายภาพกว้างเพิ่ม' };
  const zones = [measuredZone('z1', 'Studio 01')];
  const files = { z1: measuredFiles };
  const pending = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD, sendBack: { pending: true, sentBack, done: null } });
  const p = pending.notices.find((n) => n.key === 'send-back-pending');
  assert.ok(p, 'หัวหน้าต้องเห็นว่ารอช่างอยู่');
  assert.match(p.text, /ถ่ายภาพกว้างเพิ่ม/);
  assert.match(p.text, /รอช่างแจ้งว่าแก้แล้ว/);

  const done = { id: 'D-1', at: '2026-09-22T04:00:00.000Z', byName: 'สมชาย', note: 'ถ่ายแล้ว' };
  const fixed = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD, sendBack: { pending: false, sentBack, done } });
  assert.match(fixed.notices.find((n) => n.key === 'send-back-done').text, /ช่างแจ้งว่าแก้แล้ว .*สมชาย — ถ่ายแล้ว/);

  const crew = surveyControlView({ request: request(), zones, filesByZone: files, viewer: CREW, sendBack: { pending: true, sentBack, done: null } });
  assert.ok(!crew.notices.some((n) => n.key.startsWith('send-back')));
  // ใบที่ส่งผลแล้ว = วงนี้จบ ไม่ต้องบอก
  const sent = surveyControlView({ request: request({ answeredAt: 'x' }), zones, filesByZone: files, viewer: HEAD, sendBack: { pending: true, sentBack, done: null } });
  assert.ok(!sent.notices.some((n) => n.key.startsWith('send-back')));
});

/* ⭐ ส่งกลับทีละข้อ (แผน §10.5 S3) — หัวหน้าต้องเห็นว่าขอไปกี่เรื่อง เรื่องอะไร และช่างติ๊กมากี่ข้อ
   ⚠️ ข้อเดียว = คำเดิมเป๊ะ (ไม่มีเลขข้อ) · ข้อที่ช่างไม่ได้ติ๊กต้องมีชื่อ — ตัวเลข "1 / 2" เฉย ๆ
     หัวหน้าต้องเดาเองว่าข้อไหนค้าง · ไม่รู้ว่าติ๊กอะไร (แท็บเก่า/ปิดให้ตอนส่งงาน) = ไม่มีตัวนับ */
test('🔑 การ์ดของหัวหน้า: ส่งกลับหลายข้อขึ้นเลขข้อ · ช่างแจ้ง "แก้แล้ว 1 / 2 ข้อ" พร้อมข้อที่ยังไม่ติ๊ก', () => {
  const items = ['ห้อง Treatment ขอภาพส่วน B อีกรูป', 'จุดมุมเตียงที่ 1 ขอรูปใกล้อีกรูป'];
  const sentBack = { id: 'B-1', at: '2026-09-29T02:10:00.000Z', byName: 'Arnon', note: items.join('\n'), items };
  const zones = [measuredZone('z1', 'Studio 01')];
  const files = { z1: measuredFiles };
  const pending = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD, sendBack: { pending: true, sentBack, done: null } });
  // ข้อความเดียวกันใช้ในกล่องยืนยันของช่าง — ข้อเดียว/ไม่มี items (ตัวอ่านรุ่นเก่า) = ข้อความเดิมเป๊ะ
  assert.equal(surveySendBackAskText({ note: 'ถ่ายภาพกว้างเพิ่ม', items: ['ถ่ายภาพกว้างเพิ่ม'] }), 'ถ่ายภาพกว้างเพิ่ม');
  assert.equal(surveySendBackAskText({ note: 'ถ่ายภาพกว้างเพิ่ม' }), 'ถ่ายภาพกว้างเพิ่ม');
  assert.equal(surveySendBackAskText(null), '');
  const p = pending.notices.find((n) => n.key === 'send-back-pending');
  assert.match(p.text, /2 ข้อ: \(1\) ห้อง Treatment ขอภาพส่วน B อีกรูป \(2\) จุดมุมเตียงที่ 1 ขอรูปใกล้อีกรูป · รอช่างแจ้งว่าแก้แล้ว$/);
  assert.doesNotMatch(p.text, /\n/, 'กล่องแจ้งไม่ตัดบรรทัดตาม \\n — ข้อต้องคั่นให้อ่านออกบนบรรทัดเดียว');

  const half = { id: 'D-1', at: '2026-09-29T02:40:00.000Z', byName: 'Phuwadol', note: null, doneItems: [0], itemCount: 2 };
  const fixed = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD, sendBack: { pending: false, sentBack, done: half } });
  const f = fixed.notices.find((n) => n.key === 'send-back-done');
  assert.match(f.text, /^ช่างแจ้งว่าแก้แล้ว 1 \/ 2 ข้อ · /);
  assert.match(f.text, /Phuwadol/);
  assert.match(f.text, /ยังไม่ติ๊ก: \(2\) จุดมุมเตียงที่ 1 ขอรูปใกล้อีกรูป/);
  assert.equal(f.tone, 'warning', 'ยังมีข้อที่ช่างไม่ได้ติ๊ก — ไม่ใช่กล่องเขียวว่าเรียบร้อย');

  const all = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD, sendBack: { pending: false, sentBack, done: { ...half, doneItems: [0, 1] } } });
  const a = all.notices.find((n) => n.key === 'send-back-done');
  assert.match(a.text, /^ช่างแจ้งว่าแก้แล้ว 2 \/ 2 ข้อ · /);
  assert.doesNotMatch(a.text, /ยังไม่ติ๊ก/);
  assert.equal(a.tone, 'success');

  // ไม่รู้ว่าติ๊กอะไร = คำเดิม ไม่มีตัวนับ
  const unknownTicks = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD, sendBack: { pending: false, sentBack, done: { ...half, doneItems: null, itemCount: null } } });
  const u = unknownTicks.notices.find((n) => n.key === 'send-back-done');
  assert.doesNotMatch(u.text, /ข้อ/);
  assert.equal(u.tone, 'success');
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

/* 🔄 **ปุ่มส่งกลับไม่ผูกกับของขาดแล้ว** (แผน §10.5 S4 · ม็อก AW-2) — หัวหน้าเปิดรูปแล้วเห็นว่าภาพกว้างถ่ายไม่ถึง
   ส่วน B ทั้งที่ด่านสามข้อของช่างเขียวครบ (A-5) ⇒ เดิมปุ่มหายไปพร้อมของขาด ขอรูปเพิ่มในระบบไม่ได้
   ⚠️ `crewPending` ยังอยู่และยังหมายถึง "มีของช่างค้าง" — ปุ่มขึ้นตาม `sendBackAction.show` ตัวเดียว
   ⚠️ ไม่มีช่างบนนัด = ไม่มีใครไปทำอะไรมาให้ส่งกลับ (ไม่ใช่ด่านที่รอให้ผ่าน) ⇒ ไม่มีปุ่ม */
test('🔄 sendBackAction — หัวหน้าส่งกลับได้แม้ฝั่งช่างครบ 3/3 · ล็อกแล้ว/ไม่มีช่าง/ไม่ใช่หัวหน้า = ไม่มีปุ่ม', () => {
  const crewDone = ['z1', 'z2', 'z3'].map((id, i) => measuredZone(id, `Studio 0${i + 1}`));
  const files = { z1: measuredFiles, z2: measuredFiles, z3: measuredFiles };
  const visit = { id: 'SVV-1', status: 'done', assigneeId: 'U-9', assistantIds: ['U-7'] };
  const v = surveyControlView({ request: request(), zones: crewDone, filesByZone: files, viewer: HEAD, visit });
  assert.equal(v.sendBackAction.show, true, 'ฝั่งช่างครบแล้วก็ยังขอเพิ่มได้ (A-5/AW-2)');
  assert.equal(v.sendBackAction.label, 'ส่งกลับให้ช่างแก้', 'คำของม็อก AW-2');
  assert.equal(v.zoneGaps.crewPending, false, 'crewPending ยังหมายถึง "มีของช่างค้าง" — ไม่ได้ถูกยืดความหมาย');
  assert.equal(v.sendBackAction.message, 'ฝั่งช่างครบทุกพื้นที่แล้ว — ช่างจะได้เฉพาะข้อที่พิมพ์ด้านล่าง',
    'กล่องยืนยันไม่มีของขาดให้เล่า ต้องไม่ขึ้น "ข้อที่ติด: " ว่าง ๆ');

  // ยังมีของช่างค้าง — ปุ่มยังอยู่ และกล่องยืนยันเล่าว่าติดตรงไหน (คำเดิม)
  const gaps = surveyControlView({
    request: request(), zones: [measuredZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')],
    filesByZone: { z1: measuredFiles }, viewer: HEAD, visit,
  });
  assert.equal(gaps.sendBackAction.show, true);
  assert.equal(gaps.sendBackAction.message, 'ข้อที่ติด: Studio 02 (ขนาด · ภาพกว้าง · จุดติดตั้ง)');

  const locked = surveyControlView({
    request: request({ answeredAt: '2026-09-29T07:20:00.000Z' }), zones: crewDone, filesByZone: files, viewer: HEAD, visit,
  });
  assert.equal(locked.sendBackAction.show, false, 'ส่งผลแล้ว — ต้องดึงกลับก่อน');
  const noCrew = surveyControlView({ request: request(), zones: crewDone, filesByZone: files, viewer: HEAD, visit: null });
  assert.equal(noCrew.sendBackAction.show, false, 'ยังไม่มีช่างบนนัด = ไม่มีใครได้รับ');
  const crew = surveyControlView({ request: request(), zones: crewDone, filesByZone: files, viewer: CREW, visit });
  assert.equal(crew.sendBackAction.show, false, 'ปุ่มของหัวหน้า');
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
  /* 🔄 ผังย้ายไปแท็บสรุปส่งผลแล้ว (มติเจ้าของ 25/09 · §10.5 S2) — ฝั่งช่างครบ = ไม่มีอะไรให้ทำ
     ในพื้นที่ ⇒ ปุ่ม "เปิด Studio 02" ที่เคยพาไปอัปผังคือปุ่มที่พาไปหน้าที่ไม่มีช่องอัปแล้ว */
  assert.deepEqual(second.targets.map((t) => t.label), ['เคาะที่สรุปส่งผล']);
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

test('ขาดแค่ "ภาพผัง" — ผังอัปที่แท็บสรุปส่งผล: แท็บหน้างานพาไปแท็บนั้น · อยู่แท็บนั้นแล้วไม่มีปุ่มพาไป', () => {
  /* 🔄 กลับทิศจากเทสต์เดิม (มติเจ้าของ 25/09 · §10.5 S2) — เดิมช่องอัป `survey_plan` อยู่ในการ์ด
     พื้นที่ของแท็บหน้างาน ⇒ ปุ่มที่พาไปแท็บสรุปคือทางตัน · ตอนนี้ช่องอัปย้ายไปคอลัมน์ "ภาพผังที่
     มาร์กจุดแล้ว" ของตารางสรุป และการ์ดพื้นที่ไม่มีช่องผังแล้ว ⇒ ปุ่ม "เปิด Studio 01" คือทางตันแทน */
  const zones = [readyZone('z1', 'Studio 01'), readyZone('z2', 'Studio 02')];
  const files = { z1: [WIDE], z2: [WIDE] };
  const v = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD, tab: 'field' });
  assert.equal(v.send.reason.key, 'head-gaps');
  assert.equal(v.send.reason.text, 'ยังส่งไม่ได้ — ติด 1 ข้อ ที่ Studio 01 · Studio 02');
  assert.deepEqual(v.send.reason.target, { kind: 'tab', tab: 'result', label: 'ไปเคาะที่แท็บสรุปส่งผล' });
  assert.deepEqual(v.zoneGaps.rows[0].targets, [{ kind: 'tab', tab: 'result', label: 'เคาะที่สรุปส่งผล' }]);
  /* กฎ "ไปไหน" ต้องมีชุดเดียว — บรรทัดใต้ปุ่มส่งกับกลุ่มด่านต่อพื้นที่ต่างกันได้แค่ **คำบนปุ่ม** */
  const where = ({ kind, tab, zoneId }) => ({ kind, tab, zoneId });
  assert.deepEqual(where(v.send.reason.target), where(v.zoneGaps.rows[0].targets[0]), 'กฎ "ไปไหน" ต้องมีชุดเดียว');
  // อยู่แท็บสรุปแล้ว = ช่องอัปผังอยู่ตรงหน้า ไม่มีที่ไหนให้พาไป
  const onResult = surveyControlView({ request: request(), zones, filesByZone: files, viewer: HEAD, tab: 'result' });
  assert.equal(onResult.send.reason.target, null);
  assert.deepEqual(onResult.zoneGaps.rows[0].targets, []);
  // ยังติดของช่างด้วย = พาไปพื้นที่เหมือนเดิม (ผังไม่ดึงไปแท็บสรุปแซงของที่ช่างต้องเก็บ)
  const both = surveyControlView({
    request: request(), zones: [emptyZone('z1', 'Studio 01')], filesByZone: {}, viewer: HEAD, tab: 'field',
  });
  assert.deepEqual(both.zoneGaps.rows[0].targets, [{ kind: 'zone', zoneId: 'z1', label: 'เปิด Studio 01' }]);
});

test('ช่องอัปภาพผังบนตารางสรุป — เฉพาะคนเคาะที่เขียนผลวัดของใบนี้ได้ และใบยังไม่ล็อก', () => {
  const zones = [measuredZone('z1', 'Studio 01')];
  const flag = (viewer, req = request()) => surveyControlView({
    request: req, zones, filesByZone: { z1: measuredFiles }, viewer,
  }).flags.canUploadPlan;
  assert.equal(flag(HEAD), true);
  // 🔴 ส่งผลได้แต่เขียนผลวัดไม่ได้ (ผู้บริหารที่ดูภาพรวม) — server ตีกลับ 403 ⇒ ห้ามยื่นปุ่ม
  assert.equal(flag({ canWrite: false, canDecide: true }), false);
  assert.equal(flag(CREW), false, 'ผังเป็นของหัวหน้า — ช่างอ่านอย่างเดียว');
  assert.equal(flag(HEAD, request({ answeredAt: '2026-09-14T10:20:00.000Z' })), false, 'ส่งแล้ว = ล็อก');
  assert.equal(flag(HEAD, request({ status: 'closed', closedAt: '2026-09-14T10:20:00.000Z' })), false);
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
  /* ⭐ รางหน้างาน (`fieldRail` · มติเจ้าของ 25/09) — ขั้นกลางเดินตามนัด ไม่ใช่ "รอ TS ตอบ" ในเธรด
     ⚠️ ชื่อขั้นชุดเดียวกับไทม์ไลน์บนหน้าคำร้อง (ทั้งสองจออ่าน `requestRailSteps`) */
  const zones = [readyZone('z1', 'Studio 01'), emptyZone('z2', 'Studio 02')];
  const visit = { id: 'v1', code: 'SV-1', status: 'in_progress', scheduledDate: '2026-09-14', actualStartTime: '10:12:00' };
  const v = surveyControlView({ request: request(), zones, filesByZone: { z1: readyFiles }, viewer: HEAD, visit });
  assert.equal(v.step.total, 6);
  assert.equal(v.step.index, 3);
  assert.equal(v.step.label, 'เข้าพื้นที่');
  assert.equal(v.step.hint, 'วัดแล้ว 1/2 พื้นที่');
  assert.deepEqual(v.step.steps.map((s) => s.label),
    ['ส่งคำร้อง', 'รับเรื่อง', 'ลงคิว / นัด', 'เข้าพื้นที่', 'ส่งผล', 'ปิดเรื่อง']);

  // ช่างส่งงานแล้ว (นัดปิด) = ขั้นส่งผล · ไม่มีนัดที่ใช้ได้ = ขั้นลงคิว
  const done = surveyControlView({ request: request(), zones, filesByZone: { z1: readyFiles }, viewer: HEAD, visit: { ...visit, status: 'done' } });
  assert.equal(done.step.label, 'ส่งผล');
  const unable = surveyControlView({ request: request(), zones, viewer: HEAD, visit: { ...visit, status: 'unable' } });
  assert.equal(unable.step.label, 'ลงคิว / นัด');
  assert.match(unable.step.hint, /ทำไม่ได้/);
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

/* ⭐ **กำหนดของจอนี้คือวันส่งผล** (มติผู้ใช้ 2026-09-21 · mig 0368) — ทั้งจอเป็นเรื่อง
   การส่งตัวเลขให้ฝ่ายขาย · วันนัดเข้าพื้นที่มีแถวของตัวเองอยู่แล้ว */
test('🔴 กำหนดบนจอส่งผลนับจากวันส่งผล — ใบเก่าที่ไม่มีวันนั้นถอยไปใช้วันนัด', () => {
  const zones = [emptyZone('z1', 'Studio 01')];
  const withResult = {
    request: request({ committedResultDate: '2026-09-18' }), zones, viewer: HEAD, today: '2026-09-16',
  };
  assert.equal(surveyControlView(withResult).due.date, '2026-09-18');
  assert.equal(surveyControlView(withResult).due.overdueDays, null,
    'วันนัดเลยมาแล้วแต่ยังไม่ถึงวันส่งผล = ยังไม่เลยกำหนด');
  assert.equal(surveyControlView({ ...withResult, today: '2026-09-20' }).due.overdueDays, 2);

  // ใบที่ลงคิวไว้ก่อน mig 0368 มีแต่วันนัด — ห้ามกลายเป็น "ไม่มีกำหนด"
  const legacy = { request: request(), zones, viewer: HEAD, today: '2026-09-16' };
  assert.equal(surveyControlView(legacy).due.date, '2026-09-14');
  assert.equal(surveyControlView(legacy).due.overdueDays, 2);
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

test('จอส่ง dirtyZoneIds ที่ยกธงจากหน้าพื้นที่จริง ๆ — ด่านของ PR2 ถึงจะมีคนยิงให้', () => {
  const page = readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /dirtyZoneIds,/, 'ต้องส่งเข้า surveyControlView');
  assert.match(page, /onDirtyChange=\{handleDirtyZone\}/, 'หน้าพื้นที่เป็นคนบอกว่าตัวเองมีค่าค้าง');
  /* 🔄 §10.5 S7 — ค่าพับตั้งต้น/ย่อ-ขยายทุกพื้นที่ถอดแล้ว (แบบ A: หน้าหนึ่งพื้นที่เดียว ไม่มีอะไรพับ) */
  assert.doesNotMatch(page, /foldDefaults|isZoneOpen|ย่อทุกพื้นที่/);
  assert.match(page, /useUnsavedChanges\(/, 'ทุกทางออกจากหน้าถามก่อนทิ้ง (ลิงก์ · รีเฟรช · ปิดแท็บ)');
  assert.match(page, /useSurveyZoneRoute\(/, 'ย้าย/ย้อนในหน้าถามก่อนทิ้งผ่านตัวต่อสายประวัติ');
  /* ⭐ **ไม่มีร่างในเครื่อง** (มติเจ้าของ · แผนลงมือ §3.4) — ความเสี่ยงที่รับไว้คือ iOS ปิดแท็บระหว่างเปิดกล้อง
     ⇒ ยามคือไม่มีไฟล์ไหนของจอนี้แตะที่เก็บของเบราว์เซอร์เลย */
  const service = new URL('../../components/service/', import.meta.url);
  const files = [
    readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8'),
    readFileSync(new URL('useSurveyZoneRoute.js', service), 'utf8'),
    ...readdirSync(service).filter((f) => /^Survey.*\.js$/.test(f)).map((f) => readFileSync(new URL(f, service), 'utf8')),
  ];
  assert.ok(files.length >= 9, 'ต้องอ่านไฟล์ของจอนี้ครบ (หน้า + ตัวต่อสาย + คอมโพเนนต์ Survey*)');
  for (const src of files) assert.doesNotMatch(src, /localStorage|sessionStorage|indexedDB/);
});

test('หน้าพื้นที่: ป้ายค้าง/ป้ายพัง · error ประกาศตัว · ท้ายหน้ามาจากตัวตัดสิน', () => {
  const zonePage = readFileSync(new URL('../../components/service/SurveyZonePage.js', import.meta.url), 'utf8');
  const fieldView = readFileSync(new URL('./surveyFieldView.js', import.meta.url), 'utf8');
  assert.match(fieldView, /ยังไม่บันทึก/);
  assert.match(zonePage, /บันทึกไม่สำเร็จ/);
  assert.match(zonePage, /role="alert"/, 'error ต้องประกาศตัวเอง ไม่ใช่ตัวหนังสือเงียบ ๆ');
  assert.match(zonePage, /surveyZoneFooterView\(/, '"ถัดไป" · "บันทึกพื้นที่นี้" · เหตุที่กดไม่ได้ มาจากตัวตัดสิน ไม่คิดในจอ');
  assert.match(zonePage, /surveyZoneStateBadge\(/);
  assert.match(zonePage, /data-osk-hide=""/, 'ท้ายหน้าหลบตอนแป้นพิมพ์บนจอขึ้น');
});

test('หน้าพื้นที่รับแถวที่โหลดใหม่กลับเข้ามา — ค่าค้างปลอมล็อกปุ่มส่งผลไม่ได้', () => {
  const zonePage = readFileSync(new URL('../../components/service/SurveyZonePage.js', import.meta.url), 'utf8');
  /* 🐞 จอนี้โหลดซ้ำเองเมื่อสลับกลับมาที่แท็บ และนัดหนึ่งใบมีช่างได้หลายคน ⇒ ช่างอีกคน
     บันทึกพื้นที่เดียวกันเมื่อไร หน้าที่ไม่เคยอ่าน prop กลับเข้ามาจะโชว์ค่าเก่า ·
     ขึ้นป้าย "ยังไม่บันทึก" ทั้งที่ไม่มีใครพิมพ์ · แล้วธงนั้นวิ่งไป `dirtyZoneIds`
     ล็อกปุ่มส่งผลถาวรโดยโทษผู้ใช้ (พิสูจน์สดแล้ว: ฐานเป็น 12 · ช่องยังเป็น 4)
     🔄 §10.5 S7 — กติกา "รับ / ชน" อยู่ที่ตัวตัดสินล้วน `surveyDraftSync` (สี่กรณีข้างล่าง) */
  assert.match(zonePage, /surveyDraftSync\(/, 'ถามตัวตัดสินตัวเดียว ไม่เขียน if ชุดที่สองในจอ');
  assert.match(zonePage, /savedSigRef/, 'ต้องจำลายเซ็นของแถวที่รับมาล่าสุดไว้เทียบ');
  assert.match(zonePage, /adoptRow\(zoneRef\.current\)/, 'ไม่มีของค้าง = รับแถวใหม่มาเลย');
  assert.match(zonePage, /ถูกแก้จากที่อื่น/, 'มีของค้างจริง = บอกว่าแถวถูกแก้ ไม่ใช่เงียบแล้วให้ทับ');
  assert.match(zonePage, /ใช้ค่าล่าสุดจากฐาน/, 'ต้องมีทางออกที่ไม่ใช่การกดบันทึกทับ');
});

/* ── ตัวตัดสิน "รับแถวใหม่ หรือบอกว่าชน" (ยกจากการ์ดเป็นของล้วน · แผน §10.5 S5) ──────────────
   ⭐ สี่กรณีเดียวกับที่การ์ดทำมาตลอด — หน้าพื้นที่ของแบบ A (S7) ถามตัวนี้แทนการเขียน if ชุดที่สอง */
const SIG = {
  old: surveyZoneDraftSignature({ parts: [part(4, 5, 3)] }),
  fresh: surveyZoneDraftSignature({ parts: [part(12, 5, 3)] }),
  typing: surveyZoneDraftSignature({ parts: [part(4, 5, 3.2)] }),
};

test('surveyDraftSync ① แถวที่โหลดมาเท่าเดิม = ไม่ต้องทำอะไร (แม้ผู้ใช้มีของค้าง)', () => {
  assert.equal(surveyDraftSync({ prevSavedSig: SIG.old, savedSig: SIG.old, draftSig: SIG.typing, sentSig: null }), 'same');
});

test('surveyDraftSync ② ไม่มีของค้าง (ร่าง = แถวเดิม) แล้วอีกคนบันทึก = รับแถวใหม่ลงช่อง', () => {
  assert.equal(surveyDraftSync({ prevSavedSig: SIG.old, savedSig: SIG.fresh, draftSig: SIG.old, sentSig: null }), 'adopt');
  assert.equal(surveyDraftSync({ prevSavedSig: SIG.old, savedSig: SIG.fresh, draftSig: SIG.fresh, sentSig: null }), 'adopt',
    'พิมพ์ตรงกับแถวใหม่พอดี = ไม่มีอะไรชน');
});

test('surveyDraftSync ③ แถวใหม่คือผลการบันทึกของเราเอง (server ปรับรูปเลขแล้ว) = รับ ไม่ใช่ "ยังไม่บันทึก" ค้าง', () => {
  assert.equal(surveyDraftSync({ prevSavedSig: SIG.old, savedSig: SIG.fresh, draftSig: SIG.typing, sentSig: SIG.typing }), 'adopt');
  assert.equal(surveyDraftSync({ prevSavedSig: SIG.old, savedSig: SIG.typing, draftSig: SIG.fresh, sentSig: SIG.typing }), 'same',
    'พิมพ์ต่อระหว่างรอคำตอบของตัวเอง = เก็บร่างไว้ แต่ไม่ใช่การชนกับใคร');
});

test('surveyDraftSync ④ มีของค้างจริง แล้วอีกคนแก้แถวเดียวกัน = ชน (เก็บร่าง บอกว่าถูกแก้จากที่อื่น)', () => {
  assert.equal(surveyDraftSync({ prevSavedSig: SIG.old, savedSig: SIG.fresh, draftSig: SIG.typing, sentSig: null }), 'conflict');
  assert.equal(surveyDraftSync({ prevSavedSig: SIG.old, savedSig: SIG.fresh, draftSig: SIG.typing }), 'conflict',
    'ไม่ส่ง sentSig = ยังไม่เคยบันทึกจากจอนี้');
});

/* 🐞 UAT 25/09 — ลายเซ็นใช้ `Number()` ⇒ '7,5' ได้ NaN แล้วเก็บข้อความดิบ ทั้งที่ตัวบันทึกอ่านเป็น 7.5
   ⇒ ช่างแป้นจุลภาคที่พิมพ์ต่อระหว่างรอบันทึกเจอป้าย "ถูกแก้จากที่อื่น" เพราะการบันทึกของตัวเอง
   และพิมพ์ '7,5' ทับค่า 7.5 เดิม = พื้นที่ขึ้น "ยังไม่บันทึก" ล็อกปุ่มส่งผลจนกว่าจะกดบันทึกซ้ำ */
test('🐞 ลายเซ็น: "7,5" กับ 7.5 คือค่าเดียวกัน · บันทึกของตัวเองจากแป้นจุลภาคไม่ใช่การชน', () => {
  const comma = surveyZoneDraftSignature({ parts: [part('7,5', '5', '3')] });
  const saved = surveyZoneDraftSignature({ parts: [part(7.5, 5, 3)] });
  assert.equal(comma, saved, 'ตัวบันทึกกับลายเซ็นต้องอ่านเลขด้วยตัวเดียวกัน');
  const typingMore = surveyZoneDraftSignature({ parts: [part('7,5', '5', '3,2')] });
  assert.equal(surveyDraftSync({ prevSavedSig: SIG.old, savedSig: saved, draftSig: typingMore, sentSig: comma }), 'same',
    'แถวใหม่คือผลบันทึกของเราเอง — ไม่ใช่ "ถูกแก้จากที่อื่น"');
  // ค่าที่ตัวบันทึกไม่รับ ยังเป็นข้อความดิบ — ไม่หายเป็น "ว่าง" และไม่เท่าเลขที่เดาเอา
  assert.notEqual(surveyZoneDraftSignature({ parts: [part('1,200', '5', '3')] }),
    surveyZoneDraftSignature({ parts: [part(1.2, 5, 3)] }));
  assert.notEqual(surveyZoneDraftSignature({ parts: [part('abc', '', '')] }), surveyZoneDraftSignature({ parts: [] }));
});

/* 🔄 §10.5 S7 — ยาม "ถัดไปต้องเดินไปข้างหน้า" (บั๊ก 1↔5 ของหน้าเดิม) ย้ายไปเป็นเทสต์ของตัวตัดสิน `surveyNextStep`
   (surveyFieldView.test.mjs) · หน้าไม่มีตัวหาพื้นที่ถัดไปของตัวเองแล้ว */
test('หน้าไม่หาพื้นที่ถัดไปเอง — ถามตัวตัดสิน surveyNextStep', () => {
  const page = readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /surveyNextStep\(\{/);
  assert.doesNotMatch(page, /nextGapZone|const order = new Map\(zones\.map/);
});

/* ══ สามข้อที่เจอตอนตรวจก่อน merge 2026-09-16 ═══════════════════════════ */

test('🐞 ร่างของหัวหน้าต้องอยู่ที่หน้า — สลับแท็บแล้วของที่เคาะไว้ห้ามหาย', () => {
  /* เดิม `drafts` เป็น useState ของ SurveyResultTable ซึ่งหน้านี้ unmount ทิ้งทุกครั้ง
     ที่สลับไปแท็บ "หน้างาน" ⇒ ของที่หัวหน้าเคาะหายเงียบ · แถม effect ที่ยิงธง
     `pendingDecisionZoneIds` ไม่มี cleanup ⇒ ปุ่มส่งค้างบล็อกด้วยเหตุผลที่ไม่จริงแล้ว */
  const page = readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  const table = readFileSync(new URL('../../components/service/SurveyResultTable.js', import.meta.url), 'utf8');
  assert.match(page, /const \[decisionDrafts, setDecisionDrafts\] = useState\(\{\}\)/,
    'ร่างเป็นของหน้า ไม่ใช่ของตารางที่ถูก unmount');
  assert.match(page, /drafts=\{decisionDrafts\}/);
  assert.match(page, /onDraftsChange=\{setDecisionDrafts\}/);
  assert.match(page, /surveyPendingDecisions\(zones, decisionDrafts\)\.ids/,
    'ของค้างเป็นค่าที่คำนวณได้ ไม่ใช่ธงที่ต้องรอตารางยิงมา');
  assert.doesNotMatch(table, /useState\(\{\}\)/, 'ตารางต้องไม่ถือร่างเป็น state ของตัวเอง');
  assert.doesNotMatch(table, /onPendingChange/, 'ไม่มีธงให้ค้างอีกแล้ว');
  assert.doesNotMatch(page, /pendingDecisionZoneIds\] = useState/,
    'state คู่ขนานคือที่มาของธงค้าง');
});

test('🐞 ป้าย "นัดยังไม่ปิด" ขึ้นเฉพาะใบที่ส่งผลไปแล้ว — หน้าส่ง sent ให้ตัวตัดสินป้ายนัด', () => {
  /* มติ: กดส่งผลไม่ได้ปิดนัด ⇒ ป้ายอำพันเตือนเรื่องนัดที่ค้าง · เดิมเงื่อนไขไม่เคยถาม
     `sent` เลย ⇒ นัดที่เพิ่งตั้งบนใบที่ยังไม่มีใครแตะก็ขึ้นคำเตือนทันทีที่เปิดจอ
     🔄 §10.5 S9: กติกาย้ายไปตัวตัดสิน `surveyVisitBadge` (เทสต์ด้วยข้อมูลใน surveyFieldView.test.mjs — "ถาม sent ก่อนเสมอ")
        ⇒ ที่นี่ตรึงแค่ว่าหน้าเรียกตัวนั้นพร้อมธงส่งผล ไม่ได้ประกอบป้ายเอง */
  const page = readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8');
  assert.match(page, /const visitBadge = surveyVisitBadge\(visit, \{ sent: view\.flags\.sent \}\);/,
    'ป้ายต้องถามว่าส่งผลไปหรือยัง');
  const pageCode = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(pageCode, /"นัดยังไม่ปิด"|"กำลังเข้าพื้นที่"/, 'คำบนป้ายมาจากตัวตัดสิน — หน้าไม่เขียนเอง');
});

/* 🔄 §10.5 S10 — เทสต์ "หัวใบจอประเมินพื้นที่เรียบ" (หน้าไม่ขอ prop `flat` ของ `DetailOverview`) ถอดแล้ว:
   จอนี้ไม่มี `DetailOverview` (S9 · ตรึงใน `surveyFieldScreen.test.mjs`) · หัวตัวใหม่ `SurveyJobHeader`
   เข้าทะเบียนหัวของ `components/ui/pageHeaderFlat.test.mjs` ซึ่งคุมหัวทุกตัวของระบบแทน */

// ── ส่งผลปิดนัดที่ยังเปิดให้ด้วย (มติเจ้าของ 24/09 ข้อ 2) ─────────────────────
/* ⭐ โมดัลยืนยันต้องบอกผลก่อนกด ("ปิดนัด SV-… เป็น “เข้าแล้ว” ไปพร้อมกัน") ⇒ การ์ดส่ง `send.closesVisit`
   จากตัวตัดสินตัวเดียวกับที่ route ใช้ปิดจริง · จอส่ง `id` กลับไปให้ route ยืนยันว่าเป็นนัดเดียวกัน */
const readyHead = (visit, extra = {}) => surveyControlView({
  request: request(), zones: [readyZone('z1', 'Studio 01')], filesByZone: { z1: readyFiles },
  visit, viewer: HEAD, today: '2026-09-24', ...extra,
});

test('⭐ นัดกำลังทำ: ส่งผลได้ และบอกว่าจะปิดนัดไหน · เก็บเวลาเริ่มที่ช่างกด · ไม่มีเวลาจบ', () => {
  const v = readyHead({
    id: 'SVV-1', code: 'SV-2609001', status: 'in_progress', scheduledDate: '2026-09-22',
    actualDate: '2026-09-22', actualStartTime: '14:05:00',
  });
  assert.equal(v.send.allowed, true, 'การส่งผลไม่รอช่างกดส่งงาน');
  assert.deepEqual(v.send.closesVisit, {
    id: 'SVV-1', code: 'SV-2609001', status: 'in_progress', statusLabel: 'กำลังทำ',
    actualDate: '2026-09-22', startTime: '14:05',
  });
});

test('นัดยังนัดไว้ (ไม่เคยกดเริ่ม): บอกวันเข้าที่จะบันทึก และไม่มีเวลาเข้าจริง', () => {
  const v = readyHead({ id: 'SVV-1', code: 'SV-2609001', status: 'scheduled', scheduledDate: '2026-09-23' });
  assert.equal(v.send.allowed, true);
  assert.equal(v.send.closesVisit.status, 'scheduled');
  assert.equal(v.send.closesVisit.statusLabel, 'นัดไว้');
  assert.equal(v.send.closesVisit.actualDate, '2026-09-23');
  assert.equal(v.send.closesVisit.startTime, null);
});

test('นัดปิดไปแล้ว / ทำไม่ได้ / ไม่มีนัด = ส่งผลไม่แตะนัด (`closesVisit` ว่าง)', () => {
  for (const status of ['done', 'unable', 'cancelled']) {
    const v = readyHead({ id: 'SVV-1', status, scheduledDate: '2026-09-22', actualDate: '2026-09-22' });
    assert.equal(v.send.closesVisit, null, status);
    assert.equal(v.send.allowed, true, status);
  }
  assert.equal(readyHead(null).send.closesVisit, null);
});

test('🔴 นัดยังเป็นร่าง: ปุ่มส่งผลโชว์แต่กดไม่ได้ พร้อมเหตุผลเดียวกับที่ server ตอบ', () => {
  const v = readyHead({ id: 'SVV-1', code: 'SV-2609001', status: 'draft', scheduledDate: '2026-09-26' });
  assert.equal(v.send.show, true, 'ติดด่าน = โชว์แล้วบอกเหตุ');
  assert.equal(v.send.allowed, false);
  assert.equal(v.send.reason.key, 'visit-draft');
  assert.match(v.send.reason.text, /SV-2609001 ยังเป็นร่าง/);
  assert.equal(v.send.reason.detail, v.send.reason.text);
  assert.equal(v.send.closesVisit, null);
});

test('ด่านหกข้อยังพูดก่อนเรื่องร่าง — ของที่ต้องไปแก้หน้างานสำคัญกว่า', () => {
  const v = surveyControlView({
    request: request(), zones: [measuredZone('z1', 'Studio 01')], filesByZone: { z1: measuredFiles },
    visit: { id: 'SVV-1', status: 'draft', scheduledDate: '2026-09-26' }, viewer: HEAD, today: '2026-09-24',
  });
  assert.equal(v.send.allowed, false);
  assert.notEqual(v.send.reason.key, 'visit-draft');
});

// ── จอประเมิน: ส่งผล = ตอบใบ + ปิดนัด (มติเจ้าของ 24/09 ข้อ 2) — ต่อสายจากตัวตัดสินถึงโมดัลและคำขอ ─────────
/* 🐞 route ส่งผลตีกลับ 409 ทุกครั้งที่มีนัดค้างแต่จอไม่ส่ง `closeVisitId` ⇒ จอต้องส่งรหัสนัด **ตัวที่โมดัลบอก**
   และโมดัลต้องวาดผลทุกข้อจาก `surveySendConfirm` (อ่าน `send.closesVisit` ตัวเดียวกับที่ route ใช้ปิดจริง) */
const surveyPageCode = () => readFileSync(new URL('../../app/service/surveys/[id]/page.js', import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('⭐ ปุ่มส่งผลส่งรหัสนัดที่โมดัลบอก · toast บอกผลกับนัด · ล้มแล้วโยนกลับให้โมดัลบอก (ไม่ใช่ toast ที่หาย)', () => {
  const page = surveyPageCode();
  const send = page.slice(page.indexOf('const send = async'), page.indexOf('const recall = async'));
  assert.match(send, /json: \{ closeVisitId: view\.send\.closesVisit\?\.id \?\? null \}/,
    'รหัสนัดต้องมาจาก `send.closesVisit` ตัวเดียวกับที่โมดัลวาด');
  assert.match(send, /surveySendDoneText\(res\?\.closedVisit\)/);
  assert.match(send, /catch \(e\) \{\s*await load\(\{ background: true \}\);\s*throw e;/,
    'ล้ม = อ่านใบใหม่ (โมดัลวาดนัด/ด่านล่าสุด) แล้วโยน error ให้กล่องบอกตรงนั้น');
  assert.doesNotMatch(send, /kind: "error"/, 'error 409 ยาว ๆ เคยหายไปกับ toast 3.6 วิ');
});

test('⭐ โมดัลส่งผลวาดผลทุกข้อจาก `surveySendConfirm` · ป้ายปุ่มพูดตามผล · ส่งไม่ได้แล้ว = ปุ่มเดียว "ปิด"', () => {
  const page = surveyPageCode();
  assert.match(page, /surveySendConfirm\(\{\s*docNo: data\?\.request\?\.docNo, closesVisit: view\.send\.closesVisit,[\s\S]{0,160}sendBackPending: view\.send\.sendBackPending,\s*\}\)/,
    '🐞 review 26/09: ส่งกลับค้าง = โมดัลบอกก่อนกด');
  const at = page.indexOf('title="ส่งผลประเมินให้ฝ่ายขาย"');
  const dialog = page.slice(at, page.indexOf('</ConfirmDialog>', at));
  assert.match(dialog, /confirmLabel=\{view\.send\.allowed \? sendConfirm\.confirmLabel : "ปิด"\}/);
  assert.match(dialog, /hideCancel=\{!view\.send\.allowed\}/);
  assert.match(dialog, /sendConfirm\.effects\.map\(\(line\) => <li key=\{line\}>\{thaiText\(line\)\}<\/li>\)/);
  assert.match(dialog, /!view\.send\.show \? `\$\{view\.status\.headline\} — \$\{view\.status\.sub\}`/,
    'ใบถูกล็อกระหว่างที่กล่องเปิด = บอกสถานะล่าสุด ไม่ใช่ตัวเลขชวนส่ง');
  assert.doesNotMatch(dialog, /ใบจะปิดเมื่อฝ่ายขายกดรับผล/, 'ข้อความเดิมไม่บอกเรื่องนัดเลย');
});

/* 🐞 review 26/09 — ส่งกลับได้แม้ด่านเขียวหมด (S4) ⇒ "ส่งกลับค้าง" กับ "ส่งผลได้" เกิดพร้อมกันได้แล้ว · ส่งผลตอนนั้น
   = ใบล็อก ช่างแก้ต่อไม่ได้ ⇒ การ์ดส่ง `send.sendBackPending` ให้โมดัลเตือน (ไม่ใช่เหตุบล็อก — หัวหน้าตัดสินใจส่งได้) */
test('🐞 ส่งกลับค้างแต่ด่านเขียวหมด: ส่งผลยังกดได้ + `send.sendBackPending` บอกจำนวนข้อให้โมดัล', () => {
  const sentBack = {
    id: 'B-1', at: '2026-09-26T03:00:00.000Z', byName: 'หัวหน้า', note: 'ขอภาพกว้างส่วน B',
    items: ['ขอภาพกว้างส่วน B', 'ถ่ายผังใหม่'],
  };
  const pending = readyHead(null, { sendBack: { pending: true, sentBack, done: null } });
  assert.equal(pending.send.allowed, true, 'เตือน ไม่บล็อก');
  assert.equal(pending.send.reason, null);
  assert.deepEqual(pending.send.sendBackPending, { itemCount: 2 });

  const fixed = readyHead(null, { sendBack: { pending: false, sentBack, done: { id: 'D-1' } } });
  assert.equal(fixed.send.sendBackPending, null, 'ช่างแจ้งแล้ว = ไม่มีอะไรให้เตือน');
  assert.equal(readyHead(null).send.sendBackPending, null, 'อ่านเธรดไม่ได้/ไม่เคยส่งกลับ = ไม่เตือน');
  const sent = readyHead(null, { request: request({ answeredAt: '2026-09-26T04:00:00Z' }), sendBack: { pending: true, sentBack, done: null } });
  assert.equal(sent.send.sendBackPending, null, 'ใบล็อกแล้ว = ไม่มีปุ่มส่ง');
  const crew = readyHead(null, { viewer: CREW, sendBack: { pending: true, sentBack, done: null } });
  assert.equal(crew.send.sendBackPending, null, 'ไม่มีสิทธิ์ส่ง = ไม่มีโมดัล');
});

test('🐞 review 26/09 รอบสอง: บันทึกส่งเฉพาะส่วนที่แก้ — ผู้ช่วยเพิ่มจุดบนร่างที่มีส่วนว่าง ไม่ลบขนาดที่คนนำเพิ่งวัด', () => {
  const origin = { parts: [], spots: [], note: '' };
  const baseSig = surveyZoneDraftSignature(origin);
  const helperDraft = { parts: [{ id: 'p1', label: '', widthM: '', lengthM: '', heightM: '' }], spots: [{ label: 'มุมเตียง' }], note: '' };
  assert.deepEqual(surveyZoneChangedSections(baseSig, helperDraft), { parts: false, spots: true, note: false },
    'ส่วนว่างที่จอเติมให้ไม่ใช่ "แก้ขนาด"');
  assert.deepEqual(surveyZoneChangedSections(baseSig, { ...helperDraft, parts: [{ widthM: '7,5', lengthM: '4', heightM: '3' }] }),
    { parts: true, spots: true, note: false });
  assert.deepEqual(surveyZoneChangedSections(baseSig, { ...origin, note: ' ลูกค้าขอเลี่ยงมุม ' }), { parts: false, spots: false, note: true });
  assert.equal(surveyZoneChangedSections(null, helperDraft), null, 'ไม่รู้แถวตั้งต้น = ส่งทั้งก้อนแบบเดิม');
  assert.equal(surveyZoneChangedSections('ไม่ใช่ JSON', helperDraft), null);
  const zone = readFileSync(new URL('../../components/service/SurveyZonePage.js', import.meta.url), 'utf8');
  assert.match(zone, /const changed = surveyZoneChangedSections\(baseSig, draft\);/);
  assert.match(zone, /let payload = pick\(baseRef\.current\?\.sig\);/);
  assert.match(zone, /await onSave\(\{ \.\.\.payload, baseUpdatedAt: base \?\? undefined \}\);/);
});
