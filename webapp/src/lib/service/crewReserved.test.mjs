// ── ขั้นเข้าติดตั้ง PR-4b: ร่างนัดติดตั้งที่ TS ยืนยันแล้ว "จองไว้" ในตัวนับภาระ/ตัวเลือกช่าง ──────────────────────
//
// ⭐ ค่าตั้งต้นข้อ 2 (docs/service-install-step.md §6): ร่างที่รอฝ่ายขายคอนเฟิร์มลูกค้า กันคิวช่างไว้ —
//    TS ต้องไม่วางช่างคนเดิมซ้ำวันเดียวกันโดยไม่รู้ · ร่างชนิดอื่นยังไม่นับภาระเหมือนเดิม (มติ 2026-08-28)
import test from 'node:test';
import assert from 'node:assert/strict';
import { isReservedDraft } from './visitStatus.js';
import { crewLoadPeople, freeCrewOn, isFreeRow, staffLoadOn } from './scheduleQueue.js';
import { CREW_RESERVED_TAG, crewPickerView } from './scheduleModal.js';
import { crewLoadFromQueue } from './useCrewLoad.js';

const DAY = '2026-11-19';
const RESERVED = {
  id: 'V1', code: 'SV-26110007', kind: 'install', status: 'draft', installRequestId: 'R1', tsConfirmedAt: '2026-11-09T03:00:00Z',
  scheduledDate: DAY, startTime: '09:00:00', endTime: '12:00:00', siteId: 'S1', assigneeId: 'U-NATE', assistantIds: ['U-PK'],
};
const ROUND_DRAFT = { id: 'V2', kind: 'service', status: 'draft', scheduledDate: DAY, siteId: 'S2', assigneeId: 'U-PEERA' };
const ON_TABLE = { id: 'V3', code: 'SV-3', kind: 'service', status: 'scheduled', scheduledDate: DAY, startTime: '13:00:00', endTime: '15:00:00', siteId: 'S3', assigneeId: 'U-NATE' };
const technicians = [
  { id: 'U-NATE', name: 'นที' }, { id: 'U-PK', name: 'ภาคิน' }, { id: 'U-PEERA', name: 'พีระ' }, { id: 'U-FREE', name: 'ว่าง' },
];

test('จองไว้ = นัดติดตั้งจากคำขอคิว · ร่าง · TS ยืนยันแล้ว เท่านั้น', () => {
  assert.equal(isReservedDraft(RESERVED), true);
  assert.equal(isReservedDraft({ ...RESERVED, tsConfirmedAt: null }), false, 'TS ยังไม่ยืนยัน');
  assert.equal(isReservedDraft({ ...RESERVED, installRequestId: null }), false, 'นัดติดตั้งเดิม (ก่อน 0425)');
  assert.equal(isReservedDraft({ ...RESERVED, status: 'scheduled' }), false, 'ขึ้นตารางแล้ว = นับเป็นนัดบนตาราง');
  assert.equal(isReservedDraft(ROUND_DRAFT), false, 'ร่างรอบบริการไม่จอง');
});

test('ภาระ: จองไว้นับแยก (หัวหน้างาน + ผู้ช่วย) ไม่ปนนัด/จุด/แพ็คบนตาราง · ร่างอื่นไม่นับ · ไม่นับซ้ำ', () => {
  const load = staffLoadOn([RESERVED, { ...RESERVED }, ROUND_DRAFT, ON_TABLE], DAY, { S1: { assets: 3, packs: 2 }, S3: { assets: 4, packs: 1 } });
  assert.deepEqual(load.get('U-NATE'), { visits: 1, assets: 4, packs: 1, assisting: 0, reserved: 1 });
  assert.deepEqual(load.get('U-PK'), { visits: 0, assets: 0, packs: 0, assisting: 0, reserved: 1 });
  assert.equal(load.has('U-PEERA'), false);
});

test('ว่างทั้งวัน: จองไว้ = ไม่ว่าง (การ์ด "วันนั้นว่าง n จาก m" กับตัวเลือกพูดคนชุดเดียวกัน)', () => {
  assert.equal(isFreeRow({ visits: 0, assisting: 0, reserved: 1 }), false);
  const { free, total } = freeCrewOn([RESERVED, ROUND_DRAFT], DAY, technicians);
  assert.deepEqual(free.map((p) => p.id), ['U-PEERA', 'U-FREE']);
  assert.equal(total, 4);
});

test('ตัวเลือกช่าง: ป้าย "จองไว้ n นัด" · เวลาทับกับร่างที่จองไว้ขึ้น (จองไว้)', () => {
  const people = crewLoadPeople({ visits: [RESERVED], dateIso: DAY, technicians });
  const view = crewPickerView({ technicians, load: { state: 'ok', people }, dateIso: DAY, timeWindow: { startTime: '10:00', endTime: '11:00' } });
  assert.match(view.head.text, /ไม่นับร่าง \(ยกเว้นติดตั้งที่จองไว้\)/);
  assert.equal(view.head.aside, 'วันนั้นว่าง 2 จาก 4 คน');
  const nate = view.busy.find((row) => row.id === 'U-NATE');
  assert.deepEqual(nate.tags.map((t) => t.text), [`${CREW_RESERVED_TAG} 1 นัด`]);
  assert.deepEqual(nate.overlaps.map((o) => o.text), ['เวลาทับ SV-26110007 09:00–12:00 (จองไว้)']);
  const pk = view.busy.find((row) => row.id === 'U-PK');
  assert.deepEqual(pk.overlaps, [], 'ผู้ช่วยไม่เป็นเจ้าของเวลาของนัด (กติกาเดิม)');
});

test('ภาระจากหน้าอื่น (?view=load): นัดที่กำลังแก้ไม่นับเป็นภาระของตัวเอง', () => {
  const data = { status: 'ok', visits: [RESERVED], workload: {}, closedSince: '', teams: [], members: [] };
  assert.equal(crewLoadFromQueue(data, DAY, { technicians }).people.find((p) => p.id === 'U-NATE').reserved, 1);
  assert.equal(crewLoadFromQueue(data, DAY, { technicians, excludeVisitId: 'V1' }).people.find((p) => p.id === 'U-NATE').reserved, 0);
});
