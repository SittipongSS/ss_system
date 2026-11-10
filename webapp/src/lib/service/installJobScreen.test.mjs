// ── ขั้นเข้าติดตั้ง PR-5b: คำ/สถานะของจอหน้างานติดตั้ง + ทางเข้าจากงานของฉัน ────────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  installJobSteps, installMissingText, installOpenZones, installSpotDirty, installSpotDraft, installStartState,
  installZoneBadge, installZoneMachines,
} from './installJobScreen.js';
import { installJobView } from './installJob.js';

const TODAY = '2027-01-05';
const zonesById = new Map([['Z1', { id: 'Z1', code: 'ZN-01', name: 'ทางเข้าหลัก' }], ['Z2', { id: 'Z2', code: 'ZN-02', name: 'โซนผักผลไม้' }]]);
const assetsById = new Map([
  ['A1', { id: 'A1', code: 'MC-0231', label: 'OV-10', colour: 'ขาว' }], ['A2', { id: 'A2', code: 'MC-0232', label: 'OV-10', colour: 'ขาว' }],
  ['A3', { id: 'A3', code: 'MC-0198', label: 'OV-08', colour: 'ดำ' }],
]);
const view = (results = []) => installJobView({
  visitZones: [{ zoneId: 'Z1' }, { zoneId: 'Z2' }],
  planned: [{ zoneId: 'Z1', assetId: 'A1', sortOrder: 0 }, { zoneId: 'Z1', assetId: 'A2', sortOrder: 1 }, { zoneId: 'Z2', assetId: 'A3', sortOrder: 0 }],
  results, zonesById, assetsById,
});

test('แถบขั้นใช้คำ "เริ่มงาน › ทำงาน › ส่งงาน" (มติ 09/11) · เดินตามสถานะนัด', () => {
  const labels = (visit) => installJobSteps(visit).map((s) => `${s.label}:${s.state}`).join(' ');
  assert.equal(labels({ status: 'scheduled' }), 'เริ่มงาน:now ทำงาน:todo ส่งงาน:todo');
  assert.equal(labels({ status: 'in_progress', actualStartTime: '09:05:00' }), 'เริ่มงาน:done ทำงาน:now ส่งงาน:todo');
  assert.equal(installJobSteps({ status: 'in_progress', actualStartTime: '09:05:00' })[0].note, 'เริ่ม 09:05 น.');
  assert.equal(labels({ status: 'partial' }), 'เริ่มงาน:done ทำงาน:done ส่งงาน:done');
});

test('ปุ่มเริ่มงาน: วันนี้กดได้ · งานวันอื่น/ร่าง โชว์แต่กดไม่ได้พร้อมเหตุ · เริ่มแล้ว/ปิดแล้ว ไม่มีปุ่ม', () => {
  assert.deepEqual(installStartState({ status: 'scheduled', scheduledDate: TODAY }, TODAY), { show: true, can: true, reason: null });
  assert.match(installStartState({ status: 'scheduled', scheduledDate: '2027-01-12' }, TODAY).reason, /12\/01\/2027 — ยังกดเริ่มไม่ได้/);
  assert.equal(installStartState({ status: 'draft', scheduledDate: TODAY }, TODAY).can, false);
  assert.equal(installStartState({ status: 'in_progress' }, TODAY).show, false);
  assert.equal(installStartState({ status: 'done' }, TODAY).show, false);
});

test('รายการโซน: ป้ายสถานะ · เครื่องแบบย่อ · แถบล่างบอกจุดที่ขาด · โซนที่ต้องตอบตอนส่ง', () => {
  const v = view([{ assetId: 'A1', outcome: 'done' }]);
  assert.deepEqual(installZoneBadge(v.zones[0]), { text: 'กำลังทำ 1/2 จุด', tone: 'info' });
  assert.deepEqual(installZoneBadge(v.zones[1]), { text: 'ยังไม่เริ่ม 0/1', tone: 'neutral' });
  assert.equal(installZoneMachines(v.zones[0]), 'OV-10 ขาว × 2 · 2 จุด');
  assert.equal(installMissingText(v), 'ยังขาด 2 จุด ใน 2 โซน');
  assert.deepEqual(installOpenZones(v).map((z) => z.zoneId), ['Z1', 'Z2']);
  const full = view([{ assetId: 'A1', outcome: 'done' }, { assetId: 'A2', outcome: 'done' }, { assetId: 'A3', outcome: 'unable', reason: 'ผนังกระจก' }]);
  assert.equal(installMissingText(full), 'ครบทุกจุดแล้ว — กดส่งงาน');
  assert.deepEqual(installZoneBadge(full.zones[1]), { text: 'ครบ · ติดตั้ง 0/1 · ติดไม่ได้ 1', tone: 'warning' });
});

test('ร่างของจุด: เริ่มจากค่าที่บันทึก · แก้แล้วขึ้น "ยังไม่ได้บันทึก"', () => {
  const spot = view([{ assetId: 'A1', outcome: 'done' }]).zones[0].spots[0];
  const draft = installSpotDraft(spot);
  assert.equal(draft.outcome, 'done');
  assert.equal(installSpotDirty(draft, spot), false);
  assert.equal(installSpotDirty({ ...draft, spotName: 'ฝั่งซ้าย' }, spot), true);
});

test('งานของฉัน: นัดติดตั้งพาเข้าหน้างาน /service/today/[id] (เริ่มงาน · ไปต่อ · ปุ่มบนการ์ด) ไม่ใช่แผ่นปิดงาน', () => {
  const page = readFileSync(new URL('../../app/service/today/page.js', import.meta.url), 'utf8');
  assert.match(page, /isInstallStepVisit\(visit\) && !viewingOther\) \{\s*router\.push\(`\/service\/today\/\$\{visit\.id\}`\)/);
  assert.match(page, /canEdit && !surveyLink && !installLink && \(running \|\| \(done && !crewShell\)\)/, 'ปิดงานด้วยแผ่นเดิมไม่ใช้กับนัดติดตั้ง');
  const job = readFileSync(new URL('../../app/service/today/[visitId]/page.js', import.meta.url), 'utf8');
  assert.match(job, /<Workspace hideHeader back=\{\{ href: "\/service\/today", label: "งานของฉัน" \}\}>/);
});

test('หน้าจัดคิว (PR-3c): กลุ่มคำขอติดตั้งอยู่แท็บรอจัด เฉพาะคนแก้งานบริการได้ · หยิบเฉพาะขั้นรอ TS · โมดัลตัวเดียวกับแท็บรอติดตั้ง', () => {
  const page = readFileSync(new URL('../../app/service/schedule/page.js', import.meta.url), 'utf8');
  assert.match(page, /\{bucket === "waiting" && canEdit && \(\s*<InstallScheduleGroup technicians=\{technicians\} canConfirm=\{canEdit\} onChanged=\{\(\) => loadQueue\(\)\} \/>/);
  const group = readFileSync(new URL('../../components/service/install/InstallScheduleGroup.js', import.meta.url), 'utf8');
  assert.match(group, /filter\(\(r\) => r\.stage === "awaiting_ts"\)/);
  assert.match(group, /import InstallConfirmModal from "\.\/InstallConfirmModal";/);
  assert.match(group, /apiJson\("\/api\/service\/install-queue"/);
});
