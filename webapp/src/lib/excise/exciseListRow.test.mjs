import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXCISE_LIST_LABEL, listDealLine, listDealOf, listDealTypeOf } from './exciseListRow.js';
import { quotationPassesListFilters } from '../sales/quotationListFilter.js';

/* ── ใบค่าสรรพสามิตในตารางรายการ (มติเจ้าของ 29/10): "ค่าสรรพสามิต · <ดีลของ SO ต้นทาง>" · ประเภท OTHER ───────────── */
const sourceDeal = { id: 'D1', title: 'KA_Scent Studio_EDP 03,14', ownerId: 'U-1', ownerName: 'Sittipong' };
const excise = { id: 'QX', quoteNumber: 'QT-26100568-0', origin: 'excise', deal: null, sourceDeal, customerName: 'ลูกค้า', status: 'sent' };
const pipeline = { id: 'Q1', quoteNumber: 'QT-1', origin: 'pipeline', deal: { id: 'D2', title: 'ดีลขาย', dealType: 'NPD', ownerId: 'U-2' }, customerName: 'ลูกค้า', status: 'sent' };

test('บรรทัดดีล/ประเภทของแถว: ใบค่าสรรพสามิตใช้ดีลต้นทาง + คำนำ "ค่าสรรพสามิต" · ประเภท OTHER · ใบขายปกติเหมือนเดิม', () => {
  assert.deepEqual(listDealLine(excise), { prefix: EXCISE_LIST_LABEL, dealId: 'D1', title: 'KA_Scent Studio_EDP 03,14' });
  assert.equal(listDealTypeOf(excise), 'OTHER');
  assert.equal(listDealOf(excise).ownerId, 'U-1');
  assert.deepEqual(listDealLine(pipeline), { prefix: null, dealId: 'D2', title: 'ดีลขาย' });
  assert.equal(listDealTypeOf(pipeline), 'NPD');
  assert.equal(listDealTypeOf({ origin: 'pipeline', deal: null }), null, 'ใบเก่าไม่มีดีล = ไม่เดาประเภท');
  assert.equal(listDealOf({ origin: 'pipeline', deal: null, sourceDeal }), null, 'ดีลต้นทางใช้เฉพาะใบค่าสรรพสามิต');
});

test('ตัวกรองตาราง QT: ประเภท OTHER · ผู้ดูแล = เจ้าของดีลต้นทาง · ค้น "ค่าสรรพสามิต" หรือชื่อดีลต้นทางเจอ', () => {
  const pass = (row, filters) => quotationPassesListFilters(row, filters, {});
  assert.equal(pass(excise, { type: ['OTHER'] }), true);
  assert.equal(pass(excise, { type: ['NPD'] }), false);
  assert.equal(pass(excise, { owner: ['U-1'] }), true);
  assert.equal(pass(excise, { query: 'ค่าสรรพสามิต' }), true);
  assert.equal(pass(excise, { query: 'scent studio_edp' }), true);
  assert.equal(pass(pipeline, { query: 'ค่าสรรพสามิต' }), false);
  assert.equal(pass(pipeline, { type: ['NPD'], owner: ['U-2'] }), true);
});

test('จอ: ตาราง QT ใช้ตัวช่วยกลาง (บรรทัดดีล · ประเภท · ผู้ดูแล) · ตาราง SO พูดคำเดียวกัน', () => {
  const qt = readFileSync(new URL('../../app/sales-planning/quotations/page.js', import.meta.url), 'utf8');
  assert.match(qt, /const dealLine = listDealLine\(r\);/);
  assert.match(qt, /const dealType = listDealTypeOf\(r\);/);
  assert.match(qt, /livePersonName\(directory, listDealOf\(row\)\?\.ownerId, listDealOf\(row\)\?\.ownerName\)/);
  const so = readFileSync(new URL('../../app/sales-planning/sales-orders/page.js', import.meta.url), 'utf8');
  assert.match(so, /excise \? `ค่าสรรพสามิต · \$\{naText\(row\.sourceDeal\?\.title\)\}`/);
});
