// ── ช่างแจ้งหัวหน้าว่าแก้ตามที่ส่งกลับแล้ว (มติผู้ใช้ 2026-09-22) ─────────────────────
//
// ⭐ ตรึงสี่เรื่อง: สภาพ "ค้างแก้" อ่านจากเธรดถูก (รวมแถวเก่าที่ไม่มี meta.note) · ด่านเดียวกับ
//   route · กระดิ่งถึงหัวหน้า+คนที่ส่งกลับ ไม่เด้งใส่คนกด · route เขียนหลังผ่านด่านและไม่ผูกตัวตนช่าง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SEND_BACK_DONE_KIND, SEND_BACK_KIND, SURVEY_DOC_WIDE,
  surveySendBackBody, surveySendBackDoneBody, surveySendBackDoneError, surveySendBackDoneItems,
  surveySendBackOnSheet,
  surveySendBackState,
} from './survey.js';
import { SURVEY_SEND_BACK_DONE_KIND, surveySendBackDoneNotice } from './surveyFieldDoneNotify.js';
import { SERVICE_BELL_KINDS } from '../notifications.js';
import { UPDATE_KINDS, isQuietUpdateKind } from '../master/updateTypes.js';

const back = (at, extra = {}) => ({ id: `B-${at}`, kind: SEND_BACK_KIND, createdAt: at, authorId: 'U-HEAD', authorName: 'หัวหน้า', meta: { note: 'ถ่ายภาพกว้างเพิ่ม' }, ...extra });
const done = (at, extra = {}) => ({ id: `D-${at}`, kind: SEND_BACK_DONE_KIND, createdAt: at, authorId: null, authorName: 'สมชาย', meta: { note: 'ถ่ายแล้ว' }, ...extra });

test('สภาพค้างแก้ — ส่งกลับล่าสุดยังไม่มีแจ้งตามหลัง = ค้าง · แจ้งแล้ว = ไม่ค้าง · ส่งกลับซ้ำ = ค้างใหม่', () => {
  assert.deepEqual(surveySendBackState([]), { pending: false, sentBack: null, done: null });
  const one = surveySendBackState([back('2026-09-22T03:00:00Z')]);
  assert.equal(one.pending, true);
  assert.equal(one.sentBack.note, 'ถ่ายภาพกว้างเพิ่ม');
  assert.equal(one.sentBack.byId, 'U-HEAD');

  const fixed = surveySendBackState([done('2026-09-22T04:00:00Z'), back('2026-09-22T03:00:00Z')]);
  assert.equal(fixed.pending, false);
  assert.equal(fixed.done.note, 'ถ่ายแล้ว');

  // ลำดับแถวที่ส่งมาไม่มีผล — ตัวตัดสินเรียงเอง
  const again = surveySendBackState([back('2026-09-22T03:00:00Z'), done('2026-09-22T04:00:00Z'), back('2026-09-22T05:00:00Z')]);
  assert.equal(again.pending, true, 'ส่งกลับอีกรอบหลังแจ้งแล้ว = ค้างใหม่');
  assert.equal(again.sentBack.at, '2026-09-22T05:00:00Z');
});

test('แถวเก่า (ก่อนเก็บ meta.note) — ตัดข้อความของหัวหน้าออกจาก body ได้ถูก', () => {
  const gaps = [{ label: 'ภาพกว้างครบทุกพื้นที่', zones: ['แพนทรี'] }];
  const legacy = back('2026-09-20T03:00:00Z', { meta: { gates: ['wide'] }, body: surveySendBackBody(gaps, 'ถ่ายห้องแพนทรีให้เห็นทั้งห้อง · ฝั่งตู้เย็น') });
  assert.equal(surveySendBackState([legacy]).sentBack.note, 'ถ่ายห้องแพนทรีให้เห็นทั้งห้อง · ฝั่งตู้เย็น');
});

/* ══ ส่งกลับทีละข้อ · แจ้งแก้แล้วพร้อมข้อที่ติ๊ก (แผน §10.5 S3 · ม็อก A-5) ══════════════ */

test('🔑 ข้อที่หัวหน้าขอ — อ่าน meta.items · แถวที่ไม่มี (ก่อน S3) ได้บรรทัดของ note เป็นข้อ', () => {
  const items = ['ห้อง Treatment ขอภาพส่วน B อีกรูป', 'จุดมุมเตียงที่ 1 ขอรูปใกล้อีกรูป'];
  const now = surveySendBackState([back('2026-09-29T02:10:00Z', { meta: { gates: [], items, note: items.join('\n') } })]);
  assert.deepEqual(now.sentBack.items, items);
  assert.equal(now.sentBack.note, items.join('\n'), 'note ยังอยู่ — แถบเดิมของช่างอ่านตัวนี้');

  // meta.note บรรทัดเดียว (22/09–S3) = หนึ่งข้อ
  assert.deepEqual(surveySendBackState([back('2026-09-22T03:00:00Z')]).sentBack.items, ['ถ่ายภาพกว้างเพิ่ม']);
  // แถวเก่าสุด (ไม่มี meta.note) — ข้อความที่ตัดจาก body = หนึ่งข้อ
  const gaps = [{ label: 'ภาพกว้างครบทุกพื้นที่', zones: ['แพนทรี'] }];
  const legacy = back('2026-09-20T03:00:00Z', { meta: { gates: ['wide'] }, body: surveySendBackBody(gaps, 'ถ่ายห้องแพนทรีให้เห็นทั้งห้อง') });
  assert.deepEqual(surveySendBackState([legacy]).sentBack.items, ['ถ่ายห้องแพนทรีให้เห็นทั้งห้อง']);
  // meta.items ผิดทรง/ว่างทั้งแถว = ไม่เชื่อ ถอยไปอ่าน note
  const junk = back('2026-09-29T02:10:00Z', { meta: { items: [' ', 7, null], note: 'ขอรูปใกล้อีกรูป\nขอภาพกว้างอีกมุม' } });
  assert.deepEqual(surveySendBackState([junk]).sentBack.items, ['ขอรูปใกล้อีกรูป', 'ขอภาพกว้างอีกมุม']);
  // ไม่มีข้อความเลย = ไม่มีข้อ (ไม่ใช่ข้อว่างหนึ่งข้อ)
  assert.deepEqual(surveySendBackState([back('2026-09-20T03:00:00Z', { meta: {}, body: '' })]).sentBack.items, []);
});

test('🔑 แถวแจ้งแก้แล้วพกข้อที่ติ๊ก · แถวเก่า/แถวปิดให้เองตอนส่งงาน = ไม่รู้ (null) ไม่ใช่ "ไม่ได้ติ๊กสักข้อ"', () => {
  const b = back('2026-09-29T02:10:00Z', { meta: { items: ['ก ข ค', 'ง จ ฉ'], note: 'ก ข ค\nง จ ฉ' } });
  const ticked = surveySendBackState([b, done('2026-09-29T02:40:00Z', { meta: { note: null, sendBackId: b.id, doneItems: [0], itemCount: 2 } })]);
  assert.deepEqual(ticked.done.doneItems, [0]);
  assert.equal(ticked.done.itemCount, 2);

  const old = surveySendBackState([b, done('2026-09-29T02:40:00Z')]);
  assert.equal(old.done.doneItems, null);
  assert.equal(old.done.itemCount, null);
  const auto = surveySendBackState([b, done('2026-09-29T02:40:00Z', { meta: { auto: 'submit', sendBackId: b.id } })]);
  assert.equal(auto.done.doneItems, null);
  // ของเสียในแถว = ไม่รู้ (ไม่เดาว่าติ๊กข้อไหน)
  const bad = surveySendBackState([b, done('2026-09-29T02:40:00Z', { meta: { doneItems: [0, 'x'], itemCount: 2 } })]);
  assert.equal(bad.done.doneItems, null);
});

test('🔴 ข้อที่ติ๊กมาจากจอ — เลขข้อจำนวนเต็ม อยู่ในช่วง ไม่ซ้ำ · ไม่ส่งมา = ไม่รู้ (แท็บเก่า)', () => {
  assert.deepEqual(surveySendBackDoneItems(undefined, 2), { value: null, error: null });
  assert.deepEqual(surveySendBackDoneItems(null, 2), { value: null, error: null });
  assert.deepEqual(surveySendBackDoneItems([], 2), { value: [], error: null });
  assert.deepEqual(surveySendBackDoneItems([1, 0], 2), { value: [0, 1], error: null }, 'เรียงให้ — ลำดับที่ติ๊กไม่มีความหมาย');
  for (const raw of [[2], [-1], [0, 0], [0.5], ['0'], 'x', { 0: 0 }, [null]]) {
    const r = surveySendBackDoneItems(raw, 2);
    assert.equal(r.value, null, JSON.stringify(raw));
    assert.match(r.error, /ข้อ/, JSON.stringify(raw));
  }
  // ใบที่ไม่มีข้อเลย (แถวเก่าที่อ่านข้อความไม่ออก) — ติ๊กอะไรก็นอกช่วง
  assert.ok(surveySendBackDoneItems([0], 0).error);
});

test('🔑 บรรทัดเธรดของการแจ้งบอก "แก้แล้ว n / m ข้อ" เมื่อรู้ · ไม่รู้ = คำเดิมเป๊ะ', () => {
  assert.equal(surveySendBackDoneBody('', { doneCount: 1, itemCount: 2 }), 'ช่างแจ้งว่าแก้ตามที่หัวหน้าแจ้งแล้ว · แก้แล้ว 1 / 2 ข้อ');
  assert.equal(surveySendBackDoneBody(' ถ่ายแล้ว ', { doneCount: 2, itemCount: 2 }), 'ช่างแจ้งว่าแก้ตามที่หัวหน้าแจ้งแล้ว · แก้แล้ว 2 / 2 ข้อ — ถ่ายแล้ว');
  assert.equal(surveySendBackDoneBody('', { doneCount: null, itemCount: 2 }), 'ช่างแจ้งว่าแก้ตามที่หัวหน้าแจ้งแล้ว');
  assert.equal(surveySendBackDoneBody('', { doneCount: 0, itemCount: 0 }), 'ช่างแจ้งว่าแก้ตามที่หัวหน้าแจ้งแล้ว', 'ไม่มีข้อ = ไม่มีตัวนับ');
});

const wide = { docType: SURVEY_DOC_WIDE };
const zone = (over = {}) => ({ id: 'A', zoneName: 'แพนทรี', parts: [{ widthM: 3, lengthM: 4, heightM: 2.6 }], spots: [{ id: 's' }], ...over });
const request = (over = {}) => ({ id: 'RQ-1', status: 'acknowledged', answeredAt: null, closedAt: null, cancelledAt: null, ...over });

test('ด่านแจ้งว่าแก้แล้ว — ล็อก · สิทธิ์ · ไม่มีเรื่องค้าง · ยังขาด · ผ่าน', () => {
  const ok = { canWrite: true, pending: true, rows: [zone()], filesByZone: { A: [wide] } };
  assert.equal(surveySendBackDoneError(request(), ok), null);
  assert.match(surveySendBackDoneError(request({ answeredAt: 'x' }), ok), /ส่งผล/);
  assert.match(surveySendBackDoneError(request(), { ...ok, canWrite: false }), /ถูกมอบหมาย/);
  assert.match(surveySendBackDoneError(request(), { ...ok, pending: false }), /ไม่มีเรื่องที่หัวหน้าแจ้งให้แก้ค้างอยู่/);
  // 🔴 แจ้งว่าแก้แล้วทั้งที่ยังขาด = หัวหน้าเปิดมาเจอของเดิม
  const err = surveySendBackDoneError(request(), { ...ok, filesByZone: { A: [] } });
  assert.match(err, /^ยังแจ้งไม่ได้/);
  assert.match(err, /ภาพกว้าง \(แพนทรี\)/);
});

test('บรรทัดเธรด — ข้อความของช่าง (ถ้ามี) · ปิดให้เองตอนส่งงาน', () => {
  assert.equal(surveySendBackDoneBody(''), 'ช่างแจ้งว่าแก้ตามที่หัวหน้าแจ้งแล้ว');
  assert.equal(surveySendBackDoneBody(' ถ่ายแล้ว '), 'ช่างแจ้งว่าแก้ตามที่หัวหน้าแจ้งแล้ว — ถ่ายแล้ว');
  assert.match(surveySendBackDoneBody('', { auto: true }), /ส่งงานหน้างานแล้ว/);
});

test('kind ลงทะเบียนครบ — กระดิ่งอยู่ในกล่อง · บรรทัดเธรดเงียบ (ตัวที่แจ้งคือ notifyUsers)', () => {
  assert.ok(SERVICE_BELL_KINDS.includes(SURVEY_SEND_BACK_DONE_KIND));
  assert.ok(UPDATE_KINDS.dept_request[SEND_BACK_DONE_KIND], 'ไม่ลงทะเบียน = ป้ายในเธรดกลายเป็น "ข้อความ"');
  assert.equal(isQuietUpdateKind('dept_request', SEND_BACK_DONE_KIND), true, 'ไม่เงียบ = หัวหน้าที่ส่งกลับได้สองเด้ง');
});

test('⭐ กระดิ่งถึงหัวหน้าที่ส่งผลได้ + คนที่ส่งกลับ (แม้เป็นแอดมิน) · ไม่เด้งใส่คนกด', () => {
  const users = [
    { id: 'U-MGR', role: 'ts_manager' }, { id: 'U-SEN', role: 'ts_senior' }, { id: 'U-PLN', role: 'ts_planner' },
    { id: 'U-OPS', role: 'ts' }, { id: 'U-ADM', role: 'admin' }, { id: 'U-OFF', role: 'ts_audit', disabled: true },
  ];
  const sentBack = { id: 'B-1', byId: 'U-ADM', note: 'ถ่ายภาพกว้างเพิ่ม', at: '2026-09-22T03:00:00Z' };
  const n = surveySendBackDoneNotice({ request: { id: 'RQ-1', docNo: 'RQ-26090118' }, users, actor: { id: 'U-OPS', name: 'สมชาย' }, sentBack, note: 'ถ่ายแล้ว', doneId: 'D-1' });
  assert.deepEqual(n.userIds.sort(), ['U-ADM', 'U-MGR', 'U-SEN']);
  assert.equal(n.kind, SURVEY_SEND_BACK_DONE_KIND);
  assert.equal(n.href, '/service/surveys/RQ-1?tab=result');
  assert.match(n.body, /ถ่ายภาพกว้างเพิ่ม/);
  assert.match(n.body, /ถ่ายแล้ว/);
  assert.doesNotMatch(n.body, /แก้แล้ว \d/, 'ไม่รู้ข้อที่ติ๊ก = ไม่มีตัวนับ');
  // ⭐ ส่งกลับหลายข้อ — กระดิ่งอ่านข้อคั่นด้วยจุด (ไม่ใช่ขึ้นบรรทัดในกระดิ่ง) และบอกว่าแก้กี่ข้อ
  const many = surveySendBackDoneNotice({
    request: { id: 'RQ-1' }, users, actor: { id: 'U-OPS', name: 'สมชาย' },
    sentBack: { ...sentBack, items: ['ขอภาพส่วน B', 'ขอรูปใกล้มุมเตียง'], note: 'ขอภาพส่วน B\nขอรูปใกล้มุมเตียง' },
    doneItems: [0], itemCount: 2,
  });
  assert.match(many.body, /ที่แจ้งไว้: ขอภาพส่วน B · ขอรูปใกล้มุมเตียง/);
  assert.match(many.body, /แก้แล้ว 1 \/ 2 ข้อ/);
  // Senior ที่ส่งกลับเองแล้วมากดแจ้งเอง ไม่ได้กระดิ่งของตัวเอง
  const self = surveySendBackDoneNotice({ request: { id: 'RQ-1' }, users, actor: { id: 'U-SEN' }, sentBack: { ...sentBack, byId: 'U-SEN' } });
  assert.ok(!self.userIds.includes('U-SEN'));
});

test('🔴 route: ด่านอยู่ก่อนเขียน · เขียนพลาดห้ามแจ้ง · ไม่ผูกตัวตนช่าง · ส่งงานปิดเรื่องค้างให้', () => {
  const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const route = src('../../app/api/service/surveys/[id]/send-back-done/route.js');
  const gate = route.indexOf('surveySendBackDoneError(');
  const write = route.indexOf('appendUpdate(supabase');
  const bell = route.indexOf('notifySurveySendBackDone(supabase');
  assert.ok(gate > 0 && write > gate, 'ด่านต้องมาก่อนเขียน');
  assert.ok(bell > route.indexOf('if (writeError || !row)'), 'เขียนพลาดต้องตอบ error ก่อนถึงกระดิ่ง');
  assert.match(route, /user: \{ name: user\?\.name \|\| null, department: user\?\.department \|\| null \}/,
    'ห้ามส่ง user ทั้งก้อน — ช่างจะกลายเป็น past author ของใบที่เปิดไม่ได้');

  /* ⭐ ข้อที่ติ๊กตรวจทรงหลังด่าน ก่อนเขียน — ผิดทรง = 400 · ไม่ตรวจว่าแก้จริงไหม (ด่านของจริงคือของขาด) */
  const ticks = route.indexOf('surveySendBackDoneItems(body.doneItems');
  assert.ok(ticks > gate && ticks < write, 'ตรวจข้อที่ติ๊กหลังด่าน ก่อนเขียน');
  assert.match(route, /if \(ticks\.error\) return badRequest\(ticks\.error\)/);
  assert.match(route, /meta: \{ note: note \|\| null, sendBackId: sendBack\.sentBack\?\.id \|\| null, doneItems: ticks\.value, itemCount \}/);
  assert.match(route, /surveySendBackDoneBody\(note, \{ doneCount: ticks\.value\?\.length \?\? null, itemCount \}\)/);

  const sendBack = src('../../app/api/service/surveys/[id]/send-back/route.js');
  assert.match(sendBack, /meta: \{ gates: .*note \}/, 'ขาไปต้องเก็บข้อความของหัวหน้าไว้ให้แถบของช่างยกไปโชว์');

  const visits = src('../../app/api/service/visits/[id]/route.js');
  assert.match(visits, /loadSurveySendBackState\(supabase, before\.requestId\)/);
  assert.match(visits, /surveySendBackDoneBody\('', \{ auto: true \}\)/, 'ส่งงานต้องปิดเรื่องค้างให้ — ไม่งั้นช่างต้องกดแจ้งซ้ำ');
});

/* 🐞 UAT 25/09 — ข้อที่ติ๊กผูกกับรอบแค่บนจอ (`fixedTicks.id === sentBackId`) · คำขอไม่บอกรอบ ⇒ route เทียบ
   แค่ "จำนวนข้อ" ของรอบล่าสุดในฐาน · หัวหน้าส่งกลับรอบสองระหว่างที่แท็บช่างยังเปิดรอบแรกค้าง ⇒ ติ๊ก [0,1]
   ของรอบแรกไปปิดรอบสอง "แก้แล้ว 2 / 3 ข้อ" ในข้อที่ช่างไม่เคยเห็น และรอบสองหายจากค้าง
   ⇒ จอส่ง `sendBackId` ของรอบที่ติ๊ก · ไม่ตรงรอบล่าสุด = 409 · ไม่ส่งมา (แท็บเก่า) = แบบเดิม */
test('🐞 ติ๊กของรอบแรกที่ส่งมาหลังหัวหน้าส่งกลับรอบสอง = ชน ไม่ใช่ไปปิดรอบสอง', () => {
  const round1 = back('2026-09-25T02:00:00Z', { meta: { items: ['ก ข ค', 'ง จ ฉ'] } });
  const round2 = back('2026-09-25T03:00:00Z', { meta: { items: ['ช ซ ฌ', 'ญ ฎ ฏ', 'ฐ ฑ ฒ'] } });
  const state = surveySendBackState([round1, round2]);
  assert.equal(state.pending, true);
  assert.equal(state.sentBack.id, round2.id, 'รอบที่ route ใช้คือรอบล่าสุดในฐาน');
  // ทรงของติ๊กรอบแรกผ่านกับรอบสองได้ — ด่านทรงอย่างเดียวจับไม่ได้ ต้องเทียบรอบ
  assert.deepEqual(surveySendBackDoneItems([0, 1], state.sentBack.items.length), { value: [0, 1], error: null });

  const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const route = src('../../app/api/service/surveys/[id]/send-back-done/route.js');
  const round = route.indexOf('body.sendBackId');
  assert.ok(round > route.indexOf('surveySendBackDoneError('), 'เทียบรอบหลังด่าน (ไม่มีเรื่องค้าง = ด่านบอกเหตุเอง)');
  assert.ok(round < route.indexOf('surveySendBackDoneItems(body.doneItems'), 'รอบผิด = 409 ก่อนตรวจทรง (ไม่ใช่ 400 "ผิดรูปแบบ")');
  assert.ok(round < route.indexOf('appendUpdate(supabase'), 'รอบผิดต้องไม่เขียนอะไรเลย');
  assert.match(route, /String\(body\.sendBackId\) !== String\(sendBack\.sentBack\?\.id/);
  assert.match(route, /return conflict\('หัวหน้าส่งกลับรอบใหม่แล้ว — โหลดหน้าใหม่แล้วดูข้อที่ขอก่อนแจ้ง'\)/);
  assert.match(route, /body\.sendBackId == null/, 'ไม่ส่งรอบมา (แท็บเก่า) = ทำแบบเดิม ไม่ตีกลับ');

  const page = src('../../app/service/surveys/[id]/page.js');
  assert.match(page, /json: \{ note: fixedNote\.trim\(\), doneItems, sendBackId: sentBackId \}/,
    'จอต้องบอกว่าติ๊กเป็นของรอบไหน');
});

/* 🐞 review 26/09 — **ส่งผลระหว่างที่ส่งกลับให้ช่างแก้ค้างอยู่** · ตั้งแต่ S4 ส่งกลับได้แม้ด่านเขียวหมด ⇒ ปุ่มส่งผลยังกดได้ตลอด
   ⇒ ใบล็อกแต่การ์ด/ป้าย "ส่งกลับให้แก้" ของช่างค้าง · แก้ที่ **สภาพตามที่ใบเห็น** ไม่ใช่เขียนแถวปิดลงเธรด
   (รอบสอง: แถว `send_back_done` อ่านทุกที่ว่า "ช่างแจ้งว่าแก้แล้ว" ⇒ ดึงผลกลับแล้วหัวหน้าเห็นกล่องเขียวที่ไม่จริง) */
test('🐞 ใบส่งผลแล้ว = เรื่องส่งกลับไม่ค้าง (ช่างแก้ต่อไม่ได้) · ดึงกลับ (answeredAt ว่าง) = ค้างตามจริงอีกครั้ง · ไม่เขียนแถวปลอม', () => {
  const pending = surveySendBackState([back('2026-09-26T03:00:00Z')]);
  assert.equal(pending.pending, true);
  const sent = surveySendBackOnSheet(pending, { answeredAt: '2026-09-26T05:00:00Z' });
  assert.equal(sent.pending, false);
  assert.equal(sent.closedBySend, true);
  assert.equal(sent.sentBack, pending.sentBack, 'ข้อที่ขอยังอยู่ (ประวัติ)');
  assert.equal(surveySendBackOnSheet(pending, { answeredAt: null }), pending, 'ดึงกลับแล้ว = ค้างตามจริง');
  // รอบสาม: ล็อกทางอื่นก็นับ — ยกเลิก · ปิดโดยไม่ได้ผล
  assert.equal(surveySendBackOnSheet(pending, { cancelledAt: '2026-09-26T06:00:00Z' }).pending, false);
  assert.equal(surveySendBackOnSheet(pending, { status: 'closed' }).pending, false);
  assert.equal(surveySendBackOnSheet(null, { answeredAt: 'x' }), null, 'อ่านไม่สำเร็จยังเป็น null');
  const settled = surveySendBackState([back('2026-09-26T03:00:00Z'), done('2026-09-26T04:00:00Z')]);
  assert.equal(surveySendBackOnSheet(settled, { answeredAt: 'x' }), settled, 'ไม่ค้างอยู่แล้ว = ไม่แตะ');

  const src = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.match(src('../../app/api/service/surveys/[id]/route.js'), /sendBack: surveySendBackOnSheet\(context\.sendBack, request\),/);
  assert.doesNotMatch(src('../../app/api/service/surveys/[id]/send/route.js'), /SEND_BACK_DONE_KIND/,
    'route ส่งผลไม่เขียนแถว "ช่างแจ้งว่าแก้แล้ว" แทนช่าง');
});
