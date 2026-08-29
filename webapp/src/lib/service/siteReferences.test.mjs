// ── ด่านค่าอ้างอิงของไซต์บริการ (mig 0299 / 0313) ────────────────────────
// ทั้ง `projectId` และ `customerAddressId` **ไม่มี FK โดยเจตนา** (โครงการลบ/รวมได้
// แต่ไซต์ต้องอยู่ · ที่อยู่เป็นแถวใน jsonb ไม่ใช่ตาราง) ⇒ Postgres ไม่ช่วยตรวจให้
// ค่ามั่วจึงเข้าไปได้เงียบ ๆ ถ้าด่านนี้ไม่ทำงาน
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkSiteReferences } from './siteReferences.js';

// supabase ปลอมแค่เส้นที่ findProject ใช้จริง: from().select().eq().maybeSingle()
const db = (projects = []) => ({
  from(table) {
    assert.equal(table, 'projects');
    let id = null;
    const chain = {
      select: () => chain,
      eq: (col, value) => { assert.equal(col, 'id'); id = value; return chain; },
      maybeSingle: async () => ({ data: projects.find((p) => p.id === id) || null, error: null }),
    };
    return chain;
  },
});

const customer = { id: 'C1', name: 'ลูกค้า', addresses: [{ id: 'ADDR-1' }, { id: 'ADDR-2' }] };

test('ไม่ส่งค่าอ้างอิงมาเลย = ผ่าน (ไซต์ส่วนใหญ่ไม่มีโครงการ)', async () => {
  assert.equal(await checkSiteReferences(db(), { customerId: 'C1' }, customer), null);
});

test('ที่อยู่ต้นทางต้องเป็นแถวของลูกค้ารายนี้', async () => {
  const value = { customerId: 'C1', customerAddressId: 'ADDR-2' };
  assert.equal(await checkSiteReferences(db(), value, customer), null);
});

test('⭐ ที่อยู่ของลูกค้าคนอื่นถูกตีกลับ — ไม่งั้นปุ่ม "ดึงใหม่" ไปเทียบกับคนละบริษัท', async () => {
  const value = { customerId: 'C1', customerAddressId: 'ADDR-9' };
  assert.match(await checkSiteReferences(db(), value, customer), /ที่อยู่ต้นทาง/);
});

test('ลูกค้าที่ยังไม่มีที่อยู่เลย (แถวยุคเก่า) ไม่ทำให้ด่านพัง', async () => {
  const value = { customerId: 'C1', customerAddressId: 'ADDR-1' };
  assert.match(await checkSiteReferences(db(), value, { id: 'C1' }), /ที่อยู่ต้นทาง/);
});

test('โครงการที่ไม่มีจริงถูกตีกลับ', async () => {
  const value = { customerId: 'C1', projectId: 'PJ-9' };
  assert.match(await checkSiteReferences(db([]), value, customer), /ไม่พบโครงการ/);
});

test('⭐ โครงการของลูกค้ารายอื่น = ประทับผิดใบ — สืบย้อนแล้วได้คำตอบผิด', async () => {
  const projects = [{ id: 'PJ-9', code: 'PJ-26080001', customerId: 'C2' }];
  const value = { customerId: 'C1', projectId: 'PJ-9' };
  assert.match(await checkSiteReferences(db(projects), value, customer), /PJ-26080001 เป็นของลูกค้ารายอื่น/);
});

test('โครงการของลูกค้ารายเดียวกันผ่าน', async () => {
  const projects = [{ id: 'PJ-9', code: 'PJ-26080001', customerId: 'C1' }];
  const value = { customerId: 'C1', projectId: 'PJ-9', customerAddressId: 'ADDR-1' };
  assert.equal(await checkSiteReferences(db(projects), value, customer), null);
});

test('โครงการยุคเก่าที่ไม่มี customerId ไม่ถูกตีกลับ — ห้ามบล็อกด้วยข้อมูลที่ขาด', async () => {
  const projects = [{ id: 'PJ-9', code: 'PJ-0001', customerId: null }];
  assert.equal(await checkSiteReferences(db(projects), { customerId: 'C1', projectId: 'PJ-9' }, customer), null);
});
