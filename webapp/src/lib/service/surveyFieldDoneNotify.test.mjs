// ── กระดิ่ง "ช่างส่งงานหน้างานแล้ว" (มติผู้ใช้ 2026-09-21) ─────────────────────
//
// ⭐ ตรึงสามเรื่อง: ถึงหัวหน้าที่ **ส่งผลได้จริง** (ไม่ใช่ทั้งฝ่าย) · ไม่เด้งใส่คนกดเอง ·
//   ปลายทางคือแท็บที่เคาะแพ็คเกจได้ · และ route ยิงจริงหลังปิดนัด + ด่านส่งงานอยู่ก่อนเขียน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SURVEY_FIELD_DONE_KIND, surveyFieldDoneHref, surveyFieldDoneNotice } from './surveyFieldDoneNotify.js';
import { SERVICE_BELL_KINDS } from '../notifications.js';

const request = { id: 'RQ-1', docNo: 'RQ-26090118', title: 'ประเมินพื้นที่ชั้น 12' };
const visit = { id: 'SV-1', updatedAt: '2026-09-21T05:00:00.000Z' };
const users = [
  { id: 'U-MGR', role: 'ts_manager' },
  { id: 'U-AUD', role: 'ts_audit' },
  { id: 'U-SEN', role: 'ts_senior' },
  { id: 'U-PLN', role: 'ts_planner' },
  { id: 'U-OPS', role: 'ts' },
  { id: 'U-ADM', role: 'admin' },
  { id: 'U-OFF', role: 'ts_manager', disabled: true },
];

test('kind อยู่ในทะเบียนกล่องกระดิ่ง — ไม่งั้นแจ้งเตือนลงฐานแต่ไม่มีใครเห็น', () => {
  assert.ok(SERVICE_BELL_KINDS.includes(SURVEY_FIELD_DONE_KIND));
});

test('⭐ ถึงหัวหน้าสามตำแหน่งที่ส่งผลได้ — Planner/ช่าง/บัญชีที่ปิดแล้วไม่ได้รับ', () => {
  const n = surveyFieldDoneNotice({ request, visit, users, actor: { id: 'U-OPS', name: 'สมชาย' } });
  assert.deepEqual(n.userIds.sort(), ['U-AUD', 'U-MGR', 'U-SEN']);
  assert.equal(n.entityType, 'dept_request');
  assert.equal(n.entityId, 'RQ-1');
  assert.equal(n.href, '/service/surveys/RQ-1?tab=result');
  assert.equal(surveyFieldDoneHref('X'), '/service/surveys/X?tab=result');
});

test('Senior ที่ออกหน้างานเองแล้วกดส่ง ไม่ได้กระดิ่งของตัวเอง', () => {
  const n = surveyFieldDoneNotice({ request, visit, users, actor: { id: 'U-SEN', name: 'อาวุโส' } });
  assert.ok(!n.userIds.includes('U-SEN'));
});

test('ไม่มีหัวหน้าให้แจ้ง = ไม่ยิง', () => {
  assert.equal(surveyFieldDoneNotice({ request, visit, users: [{ id: 'U-OPS', role: 'ts' }] }), null);
  assert.equal(surveyFieldDoneNotice({ request: null, visit, users }), null);
});

test('ข้อความบอกผลวัดและสิ่งที่หัวหน้าต้องทำต่อ', () => {
  const n = surveyFieldDoneNotice({
    request, visit, users, actor: { id: 'U-OPS', name: 'สมชาย' },
    progress: { total: 3, done: 3 }, cut: 1,
  });
  assert.match(n.title, /RQ-26090118/);
  assert.match(n.body, /สมชาย/);
  assert.match(n.body, /วัด 3\/3 พื้นที่ · ตัดออก 1/);
  assert.match(n.body, /เคาะจุดติดตั้งและแพ็คเกจ/);
});

test('🔴 route ปิดนัด: ด่านส่งงานอยู่ก่อนเขียนใบ และกระดิ่งยิงหลังเขียนสำเร็จ', () => {
  const route = readFileSync(
    new URL('../../app/api/service/visits/[id]/route.js', import.meta.url), 'utf8');
  const gate = route.indexOf('surveyFieldSubmitError(surveyField.zones');
  const write = route.indexOf(".from('service_visits')\n      .update(");
  const bell = route.indexOf('notifySurveyFieldDone(supabase');
  assert.ok(gate > 0, 'ต้องถามด่านส่งงาน');
  assert.ok(write > 0, 'หาจุดเขียนใบไม่เจอ — เทสต์นี้ตาบอดแล้ว');
  assert.ok(gate < write, 'ด่านต้องอยู่ก่อนเขียน ไม่ใช่เขียนแล้วค่อยบอกว่าไม่ได้');
  assert.ok(bell > write, 'กระดิ่งต้องยิงหลังปิดนัดสำเร็จ');
  assert.match(route, /value\.status === 'done' && before\.status !== 'done'/,
    'ด่านต้องดูปลายทางของคำสั่ง (done) ไม่ใช่ชื่อปุ่ม');
});
