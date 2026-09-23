// ── ภาระรายคนของโมดัลลงคิวบนหน้าใบคำร้อง (มติเจ้าของ 23/09) ──────────────────────
//
// ⭐ หน้าใบคำร้องไม่ได้ถือรายการงาน ⇒ โมดัลลงคิวโหลดเอง (`useCrewLoad`) แต่ตัวเลขต้องมาจาก
//    **สูตรเดียวกับหน้าจัดคิว** (`crewLoadPeople`) — เปิดโมดัลจากสองหน้าต้องเห็นภาระของคนเดียวกันเท่ากัน
// ⚠️ ไม่รู้ = `unknown` ไม่ใช่ศูนย์ (ศูนย์ที่เดาเองอ่านว่า "ว่าง" แล้วงานถูกยัดให้คนที่เต็มแล้ว)
// ⚠️ ตัวฮุกเป็น React (ไม่มี test runner ฝั่ง React) ⇒ เทสต์ตรรกะล้วนที่ฮุกเรียก + ยามซอร์สของการยิง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crewLoadFromQueue } from './useCrewLoad.js';
import { crewLoadPeople } from './scheduleQueue.js';

const TODAY = '2026-09-24';
const visits = [
  { id: 'a', status: 'scheduled', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U1', assistantIds: ['U2'] },
  { id: 'b', status: 'draft', scheduledDate: TODAY, siteId: 'S1', assigneeId: 'U2' },   // ร่างไม่นับ
];
const technicians = [{ id: 'U1', name: 'สมชาย' }, { id: 'U2', name: 'วิชัย' }];
const loaded = {
  status: 'ok',
  visits,
  workload: { S1: { assets: 6, packs: 2 } },
  closedSince: '2026-09-10',
  teams: [{ code: 'TS-A', name: 'ทีมเหนือ' }],
  members: [{ userId: 'U1', teamCode: 'TS-A' }],
};

test('⭐ ตัวเลขเท่าสูตรของหน้าจัดคิว (crewLoadPeople) บนข้อมูลชุดเดียวกัน', () => {
  const answer = crewLoadFromQueue(loaded, TODAY, { technicians });
  assert.equal(answer.state, 'ok');
  assert.deepEqual(answer.people, crewLoadPeople({
    visits, dateIso: TODAY, workload: loaded.workload, technicians,
    crewByUser: new Map([['U1', 'TS-A']]), teamNames: new Map([['TS-A', 'ทีมเหนือ']]),
  }));
  assert.deepEqual(answer.people[0], {
    id: 'U1', name: 'สมชาย', team: 'ทีมเหนือ', visits: 1, assets: 6, packs: 2, assisting: 0, note: '',
  });
  assert.equal(answer.people[1].assisting, 1, 'ไปช่วยนับ · ร่างที่ตั้งชื่อไว้ไม่นับ');
  assert.equal(answer.people[1].visits, 0);
});

test('⚠️ ไม่รู้ = unknown ไม่ใช่ศูนย์ — ยังไม่โหลด · กำลังโหลด · พัง · วันเก่ากว่าที่รายการงานเก็บ', () => {
  for (const status of ['idle', 'loading', 'error']) {
    assert.deepEqual(crewLoadFromQueue({ ...loaded, status }, TODAY, { technicians }), { state: 'unknown', people: [] }, status);
  }
  assert.deepEqual(crewLoadFromQueue(null, TODAY, { technicians }), { state: 'unknown', people: [] });
  // ปิดแล้วเกิน 14 วัน ไม่อยู่ในรายการงาน ⇒ ภาระของวันนั้นไม่รู้จริง
  assert.deepEqual(crewLoadFromQueue(loaded, '2026-09-09', { technicians }), { state: 'unknown', people: [] });
  assert.equal(crewLoadFromQueue(loaded, '2026-09-10', { technicians }).state, 'ok');
});

test('ยังไม่มีวัน = null (ตัวเลือกบอกให้เลือกวันก่อนเอง) · โหลดทีมไม่ได้ = ไม่มีชื่อทีม แต่ตัวเลขยังอยู่', () => {
  assert.equal(crewLoadFromQueue(loaded, '', { technicians }), null);
  const noTeams = crewLoadFromQueue({ ...loaded, teams: [], members: [] }, TODAY, { technicians });
  assert.equal(noTeams.people[0].team, '');
  assert.equal(noTeams.people[0].assets, 6);
});

test('ฮุกยิงเฉพาะตอน enabled · ขอแค่ภาระ (view=load) · ผ่าน apiFetch', () => {
  const src = readFileSync(new URL('./useCrewLoad.js', import.meta.url), 'utf8');
  assert.match(src, /if \(!enabled\) return undefined;/);
  assert.match(src, /apiFetch\("\/api\/service\/visits\/queue\?view=load"\)/, 'ภาระอย่างเดียว — ไม่เอาบริบทด่าน/ร่าง/คำร้อง');
  assert.match(src, /apiFetch\("\/api\/teams\?department=TS"\)/);
  assert.doesNotMatch(src, /(?<![A-Za-z])fetch\(/, 'ห้าม fetch ดิบ (AGENTS.md)');
});
