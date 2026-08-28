// ── ภาระของช่างนับเป็นเครื่อง+แพ็ค (F-6) ──────────────────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ASSETS_PER_DAY, dayWorkload, overloaded, siteWorkload, workloadText } from './visitLoad.js';

const assets = [
  { id: 'A1', siteId: 'S1', status: 'active' },
  { id: 'A2', siteId: 'S1', status: 'active' },
  { id: 'A3', siteId: 'S1', status: 'removed' },   // ถอดออกแล้ว ไม่ใช่ภาระ
  { id: 'B1', siteId: 'S2', status: 'active' },
];
const zones = [
  { id: 'Z1', siteId: 'S1' },
  { id: 'Z2', siteId: 'S2' },
];
const terms = [
  { id: 'T1', zoneId: 'Z1', packageQty: 2 },
  { id: 'T2', zoneId: 'Z1', packageQty: 1 },
  { id: 'T3', zoneId: 'Z2', packageQty: 4 },
];

test('⭐ นับเฉพาะเครื่องที่ยังอยู่หน้างาน — ที่ถอดออกแล้วไม่ใช่ภาระ', () => {
  assert.equal(siteWorkload({ siteId: 'S1', assets, zones, terms }).assets, 2);
});

test('แพ็คมาจากรอบขายของโซนในไซต์นั้น', () => {
  assert.equal(siteWorkload({ siteId: 'S1', assets, zones, terms }).packs, 3);
  assert.equal(siteWorkload({ siteId: 'S2', assets, zones, terms }).packs, 4);
});

test('⭐ นับเฉพาะรอบที่ยังมีผล เมื่อผู้เรียกส่งชุดมาให้ — ห้ามตัดสินสถานะเองที่นี่', () => {
  const active = new Set(['T1']);
  assert.equal(siteWorkload({ siteId: 'S1', assets, zones, terms, activeTermIds: active }).packs, 2);
});

test('ไซต์ที่ยังไม่มีข้อมูลคืน 0 ทั้งคู่ ไม่ใช่เดา', () => {
  assert.deepEqual(siteWorkload({ siteId: 'S9', assets, zones, terms }), { assets: 0, packs: 0 });
});

const visits = [
  { id: 'V1', assigneeId: 'U1', scheduledDate: '2026-09-01', siteId: 'S1' },
  { id: 'V2', assigneeId: 'U1', scheduledDate: '2026-09-01', siteId: 'S2' },
  { id: 'V3', assigneeId: 'U1', scheduledDate: '2026-09-02', siteId: 'S1' },
  { id: 'V4', assigneeId: null, scheduledDate: '2026-09-01', siteId: 'S1' },
];
const workloadOf = (siteId) => siteWorkload({ siteId, assets, zones, terms });

test('⭐ ภาระรายวันรวมเครื่องกับแพ็คของทุกนัดในวันนั้น', () => {
  const map = dayWorkload(visits, workloadOf);
  const day1 = map.get('U1|2026-09-01');
  assert.equal(day1.visits, 2);
  assert.equal(day1.assets, 3, 'S1 สองเครื่อง + S2 หนึ่งเครื่อง');
  assert.equal(day1.packs, 7);
});

test('นัดที่ยังไม่มอบหมายมีถังของตัวเอง ไม่ปนกับของใคร', () => {
  const map = dayWorkload(visits, workloadOf);
  assert.equal(map.get('__unassigned__|2026-09-01').visits, 1);
});

test('⭐ เตือนเกินภาระนับจาก **เครื่อง** ไม่ใช่จำนวนนัด', () => {
  assert.equal(overloaded({ visits: 9, assets: 9, packs: 2 }), false, '9 นัดแต่เครื่องน้อย = ยังไหว');
  assert.equal(overloaded({ visits: 2, assets: 20, packs: 4 }), true, '2 นัดแต่ 20 เครื่อง = เกิน');
  assert.equal(overloaded({ visits: 1, assets: MAX_ASSETS_PER_DAY }), false, 'เท่าเพดานพอดียังไม่เกิน');
});

test('⭐ ไซต์ที่ยังไม่ลงทะเบียนเครื่อง ต้องอ่านออกว่า "ไม่มีข้อมูล" ไม่ใช่ "งานเบา"', () => {
  assert.equal(workloadText({ visits: 2, assets: 0, packs: 0 }), '2 นัด');
  assert.equal(workloadText({ visits: 2, assets: 5, packs: 3 }), '2 นัด · 5 เครื่อง · 3 แพ็ค');
  assert.equal(workloadText({ visits: 1, assets: 4, packs: 0 }), '1 นัด · 4 เครื่อง');
  assert.equal(workloadText(null), '');
});
