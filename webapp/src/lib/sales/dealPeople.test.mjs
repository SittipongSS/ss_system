// AC ผู้ประสานงาน + AE Supervisor บนดีล (ยุบดีล/โครงการ P2c-1 · มติเจ้าของ 13/11/2026 ② ⑤ ⑥)
// ล็อก: บังคับทุกครั้งที่บันทึกฟอร์ม · ล้างค่าที่มีไม่ได้ · ตัวตรวจคนชุดเดียวกับโครงการ · ฝั่งจอใช้ตัวตรวจกลาง ·
//       PDR อ่าน AE/AC จากดีลก่อนโครงการ · เธรดดีลแจ้งเจ้าของ + AC (ไม่แจ้ง Sup)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveDealPeople } from './dealPeople.js';
import { missingDealFieldKeys, missingDealFieldsMessage } from './dealRequiredFields.js';
import { pdrContext } from '../requests/pdrFields.js';
import { UPDATE_ENTITIES } from '../master/updateAccess.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const USERS = {
  'u-ac': { id: 'u-ac', app_metadata: { role: 'ac', team: 'KA', teams: ['KA'] }, user_metadata: { name: 'AC คนหนึ่ง' } },
  'u-ac-odm': { id: 'u-ac-odm', app_metadata: { role: 'ac', team: 'ODM', teams: ['ODM'] }, user_metadata: { name: 'AC ODM' } },
  'u-sup': { id: 'u-sup', app_metadata: { role: 'ae_supervisor', team: 'KA' }, user_metadata: { name: 'Sup ใหญ่' } },
  'u-ae': { id: 'u-ae', app_metadata: { role: 'ae', team: 'KA' }, user_metadata: { name: 'AE' } },
};
const stub = {
  auth: { admin: { getUserById: async (id) => (USERS[id] ? { data: { user: USERS[id] }, error: null } : { data: null, error: { message: 'User not found', status: 404 } }) } },
};

test('สร้าง/บันทึกฟอร์ม: ต้องมีทั้ง AC และ Sup · เติมชื่อจากบัญชี', async () => {
  assert.match((await resolveDealPeople(stub, { body: {}, team: 'KA', required: true })).error, /ผู้ประสานงาน \(AC\)/);
  assert.match((await resolveDealPeople(stub, { body: { acOwnerId: 'u-ac' }, team: 'KA', required: true })).error, /ผู้ตรวจสอบ/);
  const ok = await resolveDealPeople(stub, { body: { acOwnerId: 'u-ac', aeSupervisorId: 'u-sup' }, team: 'KA', required: true });
  assert.deepEqual(ok, { ok: true, patch: { acOwnerId: 'u-ac', acOwnerName: 'AC คนหนึ่ง', aeSupervisorId: 'u-sup', aeSupervisorName: 'Sup ใหญ่' } });
});

test('ตัวตรวจคนชุดเดียวกับโครงการ: AC ต้องสาย AC + ทีมทับ · Sup ต้องหัวหน้าฝ่ายขาย · ข้อความพูดว่า "ดีล"', async () => {
  const wrongTeam = await resolveDealPeople(stub, { body: { acOwnerId: 'u-ac-odm', aeSupervisorId: 'u-sup' }, team: 'KA', required: true });
  assert.match(wrongTeam.error, /ดีลนี้เป็นของทีม KA/);
  const notAc = await resolveDealPeople(stub, { body: { acOwnerId: 'u-ae', aeSupervisorId: 'u-sup' }, team: 'KA', required: true });
  assert.match(notAc.error, /ผู้ประสานงานดีลต้องเป็นตำแหน่งสาย AC/);
  const notSup = await resolveDealPeople(stub, { body: { acOwnerId: 'u-ac', aeSupervisorId: 'u-ae' }, team: 'KA', required: true });
  assert.match(notSup.error, /ผู้ตรวจสอบดีลต้องเป็นตำแหน่งหัวหน้าฝ่ายขาย/);
});

test('PATCH: บันทึกฟอร์มบนดีลเก่าที่ว่าง = ต้องเลือก · action ไม่บังคับ · ล้างค่าที่มีไม่ได้ · ไม่ส่งมา = ใช้ของเดิม', async () => {
  const empty = { acOwnerId: null, aeSupervisorId: null, team: 'KA' };
  assert.equal((await resolveDealPeople(stub, { body: { title: 'x' }, current: empty, team: 'KA', required: true })).ok, false);
  assert.deepEqual(await resolveDealPeople(stub, { body: { stage: 'won' }, current: empty, team: 'KA', required: false }), { ok: true, patch: {} });
  const filled = { acOwnerId: 'u-ac', aeSupervisorId: 'u-sup', team: 'KA' };
  assert.equal((await resolveDealPeople(stub, { body: { acOwnerId: '' }, current: filled, team: 'KA', required: false })).ok, false, 'ล้าง AC ไม่ได้');
  assert.deepEqual(await resolveDealPeople(stub, { body: { title: 'x' }, current: filled, team: 'KA', required: true }), { ok: true, patch: {} });
});

test('ฝั่งจอ: ตัวตรวจช่องบังคับกลางรวม AC/Sup · ดีลภาชนะ SO ย้อนหลังไม่บังคับ', () => {
  const base = { stage: 'lead', valueItems: [{}], expectedCloseDate: '2026-12-01', startDate: '2026-11-01', endDate: '2026-12-31' };
  assert.deepEqual(missingDealFieldKeys(base), ['acOwnerId', 'aeSupervisorId']);
  assert.match(missingDealFieldsMessage(base), /ผู้ประสานงาน \(AC\) · ผู้ตรวจสอบ \(AE Supervisor\)/);
  assert.deepEqual(missingDealFieldKeys(base, { historical: true }), []);
  assert.deepEqual(missingDealFieldKeys({ ...base, acOwnerId: 'a', aeSupervisorId: 's' }), []);
});

test('route: POST บังคับเสมอ · PATCH บังคับเมื่อบันทึกฟอร์ม (ยกเว้นภาชนะย้อนหลัง) · ฟอร์มแก้ทั้งสองหน้าโหลดค่าเดิม', () => {
  const post = read('../../app/api/sales-planning/deals/route.js');
  assert.match(post, /resolveDealPeople\(supabase, \{\s+body, team: owner\?\.team \|\| attributionTeam\(user, body\.team\), required: true,/);
  assert.match(post, /\.\.\.people\.patch,/);
  const patch = read('../../app/api/sales-planning/deals/[id]/route.js');
  assert.match(patch, /required: isDealFormSave\(body\) && !isHistoricalDeal\(before\)/);
  for (const page of ['../../app/sales-planning/deals/page.js', '../../app/sales-planning/deals/[id]/page.js']) {
    const src = read(page);
    assert.match(src, /acOwnerId: deal\.acOwnerId \|\| "",\s+aeSupervisorId: deal\.aeSupervisorId \|\| "",/, `${page} ต้องโหลดค่าเดิม ไม่งั้นช่องว่างทุกครั้ง`);
    assert.match(src, /historical: isHistoricalDeal\(/);
  }
  const form = read('../../components/salesPlanning/DealFormFields.js');
  assert.match(form, /\{pairRows\(\[acField, supervisorField\]\)\}/);
  assert.match(form, /PROJECT_PEOPLE_ROLES\.preparedBy/);
  assert.match(form, /PROJECT_PEOPLE_ROLES\.aeSupervisor/);
});

test('PDR: ผู้ร้องขอ AE/AC มาจากดีล · โครงการไม่มีผลแล้ว (งวด P3b-3)', () => {
  const ctx = pdrContext({
    request: { requestedByName: 'คนยื่น' },
    project: { aeOwner: 'AE โครงการ', acOwner: 'AC โครงการ' },
    deal: { ownerName: 'AE ดีล', acOwnerName: 'AC ดีล', title: 'ดีล' },
  });
  assert.equal(ctx.requester, 'AE ดีล');
  assert.equal(ctx.coordinator, 'AC ดีล');
  const fallback = pdrContext({ request: { requestedByName: 'คนยื่น' }, project: { aeOwner: 'AE โครงการ', acOwner: 'AC โครงการ' }, deal: { title: 'ดีล' } });
  assert.deepEqual([fallback.requester, fallback.coordinator], ['คนยื่น', null], 'ไม่ถอยไปโครงการแล้ว');
  assert.doesNotMatch(read('../materialPricesAdmin.js'), /from\('projects'\)/);
  assert.match(read('../materialPricesAdmin.js'), /select\('id, code, title, "ownerName", "acOwnerName"'\)/);
});

test('เธรดดีลแจ้งเจ้าของ + AC (ไม่แจ้ง Sup)', () => {
  assert.deepEqual(UPDATE_ENTITIES.deal.recipients({ ownerId: 'o', acOwnerId: 'a', aeSupervisorId: 's' }), ['o', 'a']);
});
