// ── ช่างแจ้งหัวหน้าว่าแก้ตามที่ส่งกลับแล้ว (มติผู้ใช้ 2026-09-22) ─────────────────────
//
// ⭐ ตรึงสี่เรื่อง: สภาพ "ค้างแก้" อ่านจากเธรดถูก (รวมแถวเก่าที่ไม่มี meta.note) · ด่านเดียวกับ
//   route · กระดิ่งถึงหัวหน้า+คนที่ส่งกลับ ไม่เด้งใส่คนกด · route เขียนหลังผ่านด่านและไม่ผูกตัวตนช่าง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SEND_BACK_DONE_KIND, SEND_BACK_KIND, SURVEY_DOC_WIDE,
  surveySendBackBody, surveySendBackDoneBody, surveySendBackDoneError, surveySendBackState,
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

  const sendBack = src('../../app/api/service/surveys/[id]/send-back/route.js');
  assert.match(sendBack, /meta: \{ gates: .*note \}/, 'ขาไปต้องเก็บข้อความของหัวหน้าไว้ให้แถบของช่างยกไปโชว์');

  const visits = src('../../app/api/service/visits/[id]/route.js');
  assert.match(visits, /loadSurveySendBackState\(supabase, before\.requestId\)/);
  assert.match(visits, /surveySendBackDoneBody\('', \{ auto: true \}\)/, 'ส่งงานต้องปิดเรื่องค้างให้ — ไม่งั้นช่างต้องกดแจ้งซ้ำ');
});
