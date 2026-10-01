// ── GET ของนัด = ข้อมูลของหน้างานช่าง (แผน operation-crew C9 · §5 · S3) ────────────────────────────────
//
// ⭐ หน้างาน `/service/today/[visitId]` อ่านจาก GET เดียว — เพิ่ม `site` · `crew` · `viewerRole` บนคำตอบเดิม
//    · `viewerRole: null` = จอช่างเขียน "งานนี้ไม่ได้มอบให้คุณ" · ชื่อผู้ช่วยถามรายคน (`crew[].you` = คนเปิดจอ)
// ⚠️ มติ 28/09 Q2: ไม่มีจำนวนแพ็ก/แผนรายโซนในงวดนี้ (S9) — คีย์เดิมของคำตอบต้องอยู่ครบ (ใบส่งงาน/แผ่นปิดงานใช้อยู่)
// ⚠️ เรียก handler ตัวจริงผ่าน supabase ปลอมที่จำแถว (`routeTestKit.mjs`) — ไม่มี client จริงในเทสต์นี้
import test from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb, callRoute, tech, mate, planner } from './routeTestKit.mjs';
import { businessDate } from '../../businessDate.js';
import { visitCrewRole } from './visitCrew.js';

const { GET } = await import('../../../app/api/service/visits/[id]/route.js');

const TODAY = businessDate();
const visitRow = (o = {}) => ({
  id: 'V1', code: 'SV-26090001', siteId: 'S1', kind: 'refill', status: 'scheduled',
  scheduledDate: TODAY, assigneeId: 'U-TECH', assigneeName: 'ช่างเอ', assistantIds: ['U-MATE'],
  attachments: [], ...o,
});
const seed = (visit = {}) => fakeDb({
  service_visits: [visitRow(visit)],
  service_sites: [{ id: 'S1', name: 'อาคารทดสอบ', accessNote: 'แลกบัตรที่ รปภ. ก่อนขึ้นลิฟต์' }],
  service_assets: [{ id: 'A1', siteId: 'S1', status: 'active', label: 'เครื่อง A1', zoneId: 'Z1' }],
  service_zones: [{ id: 'Z1', siteId: 'S1', name: 'ล็อบบี้', isActive: true }],
}, { users: { 'U-MATE': { email: 'mate@example.test', user_metadata: { name: 'ช่างบี' } } } });
const get = (db, user) => callRoute(GET, { user, db, path: '/api/service/visits/V1', params: { id: 'V1' } });

test('visitCrewRole: คนไป · ผู้ช่วย · ไม่อยู่ในทีม · ค่าว่าง', () => {
  const visit = visitRow();
  assert.equal(visitCrewRole(visit, 'U-TECH'), 'lead');
  assert.equal(visitCrewRole(visit, 'U-MATE'), 'helper');
  assert.equal(visitCrewRole(visit, 'U-PLAN'), null);
  assert.equal(visitCrewRole(visit, null), null);
  assert.equal(visitCrewRole(visit, ''), null);
  assert.equal(visitCrewRole(null, 'U-TECH'), null);
  // คนไปที่ถูกใส่ซ้ำเป็นผู้ช่วย = คนไป
  assert.equal(visitCrewRole(visitRow({ assistantIds: ['U-TECH'] }), 'U-TECH'), 'lead');
});

test('⭐ GET เพิ่ม site · crew · viewerRole ของคนเปิดจอ — คีย์เดิมอยู่ครบ', async () => {
  const lead = await get(seed(), tech);
  assert.equal(lead.status, 200, lead.json.error);
  for (const key of ['visit', 'items', 'assets', 'zones', 'results', 'resultAssets', 'zoneGates']) {
    assert.ok(key in lead.json, key);
  }
  assert.equal(lead.json.site.name, 'อาคารทดสอบ');
  assert.equal(lead.json.site.accessNote, 'แลกบัตรที่ รปภ. ก่อนขึ้นลิฟต์');
  assert.equal(lead.json.viewerRole, 'lead');
  assert.deepEqual(lead.json.crew.map(({ name, lead: l, you }) => ({ name, lead: l, you })), [
    { name: 'ช่างเอ', lead: true, you: true },
    { name: 'ช่างบี', lead: false, you: false },
  ]);
  assert.equal(lead.json.crewUnknown, false);

  const helper = await get(seed(), mate);
  assert.equal(helper.json.viewerRole, 'helper');
  assert.deepEqual(helper.json.crew.map((c) => c.you), [false, true]);
});

test('คนที่ไม่อยู่ในทีม (ผู้จัดคิว) เปิดได้ตามเดิม แต่ viewerRole = null · ไม่มีคีย์แพ็ก/แผน (มติ 28/09 Q2)', async () => {
  const { status, json } = await get(seed(), planner);
  assert.equal(status, 200, json.error);
  assert.equal(json.viewerRole, null);
  for (const key of ['zonePlans', 'packageQty', 'packs', 'packsPerRound']) assert.equal(key in json, false, key);
});

test('อ่านชื่อผู้ช่วยไม่ได้ = crewUnknown ไม่ล้มทั้งใบ · บัญชีที่ลบไปแล้ว = gone', async () => {
  const db = seed({ assistantIds: ['U-GONE'] });
  const { status, json } = await get(db, tech);
  assert.equal(status, 200, json.error);
  assert.equal(json.crew[1].gone, true);

  const broken = seed();
  broken.auth.admin.getUserById = async () => { throw new Error('network down'); };
  const res = await get(broken, tech);
  assert.equal(res.status, 200, res.json.error);
  assert.equal(res.json.crewUnknown, true);
  assert.equal(res.json.crew[1].name, null);
});
