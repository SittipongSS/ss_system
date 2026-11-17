// เอกสารไทม์ไลน์ FM-PD-05 ของดีล — งวด P2b ยุบดีล/โครงการ (มติเจ้าของ 13/11/2026 ①②)
import test from 'node:test';
import assert from 'node:assert/strict';
import { dealTimelineDocument } from './dealTimelineDocument.js';

const PROJECT = {
  id: 'P1', code: 'PJ-1', name: 'โครงการ', customerName: 'ลูกค้าโครงการ',
  aeOwner: 'AE โครงการ', preparedBy: 'คนกดสร้างโครงการ', acOwner: 'AC โครงการ', aeSupervisor: 'Supervisor โครงการ',
  timelineDocBase: 'PT-261100341', timelineDocNumber: 'PT-261100341-0',
  timelineStandardSnapshot: { id: 'STD-PROJECT' },
  metadata: { brand: 'แบรนด์โครงการ' },
};

test('① ดีลในโครงการ: เลขที่เอกสาร = รหัสดีล (ไม่ยืม PT/PJ ของโครงการ) · AE = เจ้าของดีลสด', () => {
  const result = dealTimelineDocument(
    { id: 'D1', code: 'DL-1', title: 'ดีล', ownerName: 'AE ดีล', categoryCode: '01', dealType: 'NPD' },
    { project: PROJECT, projectTasks: [{ id: 'T1', dealId: 'D1' }], projectProducts: [{ id: 'PP1' }] },
  );
  assert.equal(result.code, 'DL-1');
  assert.equal(result.timelineDocBase, null);
  assert.equal(result.timelineDocNumber, null);
  assert.equal(result.aeOwner, 'AE ดีล');
  assert.deepEqual(result.tasks.map((task) => task.id), ['T1']);
  assert.deepEqual(result.deals.map((d) => d.title), ['ดีล'], 'แถวโครงการ/ประเภทบนหัวกระดาษ = ดีลใบนี้ใบเดียว');
  assert.equal(result.timelineStandardSnapshot.id, 'STD-PROJECT', 'ฟอร์มที่โครงการตรึงไว้ยังใช้ต่อ');
  assert.equal(result.metadata.brand, 'แบรนด์โครงการ');
});

test('② AC/ผู้ตรวจสอบ มาจากช่องบนดีลก่อน · ไม่ใช้ preparedBy (คนกดสร้างโครงการ)', () => {
  const withDealFields = dealTimelineDocument(
    { id: 'D1', code: 'DL-1', ownerName: 'AE', acOwnerName: 'AC ดีล', aeSupervisorName: 'Sup ดีล' },
    { project: PROJECT },
  );
  assert.equal(withDealFields.preparedBy, 'AC ดีล');
  assert.equal(withDealFields.aeSupervisor, 'Sup ดีล');
  const fallback = dealTimelineDocument({ id: 'D1', code: 'DL-1', ownerName: 'AE' }, { project: PROJECT });
  assert.equal(fallback.preparedBy, 'AC โครงการ', 'ดีลยังว่าง ⇒ AC ที่เลือกไว้บนโครงการ ไม่ใช่ preparedBy');
  assert.equal(fallback.aeSupervisor, 'Supervisor โครงการ');
});

test('ดีลลอย: ข้อมูลจากดีล · metadata เดิมยังเป็นค่าสำรอง', () => {
  const result = dealTimelineDocument({
    id: 'D2', code: 'DL-2', title: 'ดีลลอย', customerName: 'ลูกค้าดีล', ownerName: 'AE ดีล',
    startDate: '2026-07-01', metadata: { brand: 'แบรนด์ดีล', preparedBy: 'AC เก่า', aeSupervisor: 'Sup เก่า' },
  }, { projectTasks: [{ id: 'T2' }] });
  assert.equal(result.code, 'DL-2');
  assert.equal(result.preparedBy, 'AC เก่า');
  assert.equal(result.aeSupervisor, 'Sup เก่า');
  assert.equal(result.metadata.brand, 'แบรนด์ดีล');
  assert.equal(result.timelineStandardSnapshot, null, 'ไม่มีโครงการ/Rev. = ใช้มาตรฐานที่เผยแพร่อยู่');
});

test('ผู้ประสานงาน ไม่ fallback เป็นเจ้าของดีลเมื่อยังไม่ระบุ AC', () => {
  const result = dealTimelineDocument({ id: 'D3', title: 'ดีลไม่มี AC', ownerName: 'AE ดีล', metadata: {} }, {});
  assert.equal(result.aeOwner, 'AE ดีล');
  assert.equal(result.preparedBy, '');
});

test('Rev. บนเอกสารสด: ยังไม่ออก/แก้หลังออก = ไม่ปั๊มเลข · ออกแล้วไม่แก้ = Rev. + วันที่ออก', () => {
  const overview = { timelineRevision: { maxRev: 2, revisedAt: '2026-11-13T03:00:00Z' } };
  assert.equal(dealTimelineDocument({ id: 'D', code: 'DL-9' }, overview).rev, null);
  const stale = dealTimelineDocument({ id: 'D', code: 'DL-9', timelineRev: 2, timelineRevStale: true }, overview);
  assert.equal(stale.rev, null);
  assert.equal(stale.revDate, null);
  const issued = dealTimelineDocument({ id: 'D', code: 'DL-9', timelineRev: 2, timelineRevStale: false }, overview);
  assert.equal(issued.rev, 2);
  assert.equal(issued.revDate, '2026-11-13T03:00:00Z');
});

test('พิมพ์ Rev. เก่า: ใช้เลข/วันที่/มาตรฐานจาก snapshot ไม่ใช่ของดีลตอนนี้', () => {
  const result = dealTimelineDocument(
    { id: 'D', code: 'DL-9', timelineRev: 5, timelineRevStale: false },
    { project: PROJECT, projectTasks: [{ id: 'old' }] },
    { rev: 1, revDate: '2026-10-01T00:00:00Z', standard: { id: 'STD-AT-ISSUE' } },
  );
  assert.equal(result.rev, 1);
  assert.equal(result.revDate, '2026-10-01T00:00:00Z');
  assert.equal(result.timelineStandardSnapshot.id, 'STD-AT-ISSUE');
});
