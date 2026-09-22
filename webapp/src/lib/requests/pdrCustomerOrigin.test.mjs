// ── PDR 1.8 ไทย / ต่างชาติ — เติมจากทะเบียนลูกค้า (มติผู้ใช้ 2026-09-23) ─────────────────────
// ผู้ใช้: *"อยากให้เพิ่ม ลูกค้า ไทย ต่างชาติ ใน 1.8"* · เลือก "เติมจากทะเบียนลูกค้า" (ไม่มีช่องเลือกบนใบ · ไม่มี migration)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PDR_FIELDS, PDR_CUSTOMER_ORIGINS, pdrContext, pdrCustomerOrigin, pdrFieldText,
} from './pdrFields.js';

const field = PDR_FIELDS.find((f) => f.key === 'customerKind');
const read = (rel) => readFileSync(rel, 'utf8');

test('ไทย/ต่างชาติ มาจากธง isForeign ของทะเบียนลูกค้า · ไม่มีลูกค้า = ไม่รู้', () => {
  assert.equal(pdrCustomerOrigin({ id: 'C1', isForeign: true }), 'foreign');
  assert.equal(pdrCustomerOrigin({ id: 'C1', isForeign: false }), 'thai');
  assert.equal(pdrCustomerOrigin({ id: 'C1' }), 'thai');
  assert.equal(pdrCustomerOrigin(null), null);
  assert.equal(pdrContext({ customer: { id: 'C1', isForeign: true } }).customerOrigin, 'foreign');
  assert.equal(pdrContext({}).customerOrigin, null);
  assert.deepEqual(PDR_CUSTOMER_ORIGINS.map((o) => o.label), ['ลูกค้าไทย', 'ลูกค้าต่างชาติ']);
});

test('ข้อความ 1.8 = ใหม่/เก่า · ไทย/ต่างชาติ — ขึ้นได้แม้ยังไม่เลือกใหม่/เก่า · ไม่มี context = แบบเดิม', () => {
  assert.equal(field.no, '1.8');
  const ctx = { customerOrigin: 'foreign' };
  assert.equal(pdrFieldText(field, { pdrCustomerKind: 'existing' }, ctx), 'ลูกค้าเก่า · ลูกค้าต่างชาติ');
  assert.equal(pdrFieldText(field, { pdrCustomerKind: 'new' }, { customerOrigin: 'thai' }), 'ลูกค้าใหม่ · ลูกค้าไทย');
  assert.equal(pdrFieldText(field, {}, ctx), 'ลูกค้าต่างชาติ');
  assert.equal(pdrFieldText(field, { pdrCustomerKind: 'existing' }), 'ลูกค้าเก่า');
  assert.equal(pdrFieldText(field, {}), null);
});

test('ต่อสาย: server select isForeign · ฟอร์มโชว์ค่าจากทะเบียนใต้ช่อง 1.8', () => {
  assert.match(read('src/lib/materialPricesAdmin.js'), /from\('customers'\)\.select\('id, name, "nameEn", "arCode", "isForeign",/);
  const form = read('src/components/requests/PdrForm.js');
  assert.match(form, /customerOrigin = null,\n\s*\} = context;/);
  assert.match(form, /PDR_CUSTOMER_ORIGINS\.find\(\(o\) => o\.value === customerOrigin\)/);
  // รายชื่อลูกค้าที่ฟอร์มสร้างใบใช้ต้องมีธงนี้ (ไม่งั้นทุกใบใหม่ขึ้น "ลูกค้าไทย")
  assert.match(read('src/app/api/customers/route.js'), /'isForeign'/);
});
