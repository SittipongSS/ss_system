// "ดีล SCENT ต้นทาง" ของดีล NPD (ยุบดีล/โครงการ P2c-2 · มติเจ้าของ 13/11/2026 ③)
// ล็อก: เฉพาะ NPD · ต้นทางเป็น SCENT ลูกค้าเดียวกันที่ยังไม่ Lost · เปลี่ยนประเภทออกจาก NPD = ถอดให้ · ฟอร์ม/route ใช้ตัวเดียวกัน
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveSourceScent } from './dealScentSource.js';

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

const DEALS = [
  { id: 'S1', code: 'DL-1', dealType: 'SCENT', stage: 'won', customerId: 'C1', metadata: {} },
  { id: 'S-LOST', code: 'DL-2', dealType: 'SCENT', stage: 'lost', customerId: 'C1', metadata: {} },
  { id: 'S-OTHER', code: 'DL-3', dealType: 'SCENT', stage: 'quotation', customerId: 'C2', metadata: {} },
  { id: 'R1', code: 'DL-4', dealType: 'RE-ORDER', stage: 'quotation', customerId: 'C1', metadata: {} },
  { id: 'S-META', code: 'DL-5', dealType: null, stage: 'lead', customerId: 'C1', metadata: { projectType: 'SCENT' } },
];
const stub = {
  from: () => {
    let id = null;
    const chain = {
      select: () => chain,
      eq: (_c, v) => { id = v; return chain; },
      maybeSingle: async () => ({ data: DEALS.find((d) => d.id === id) || null, error: null }),
    };
    return chain;
  },
};
const next = { dealType: 'NPD', customerId: 'C1' };

test('NPD ชี้ SCENT ลูกค้าเดียวกัน · ประเภทอ่านจาก metadata ได้', async () => {
  assert.deepEqual(await resolveSourceScent(stub, { body: { sourceScentDealId: 'S1' }, next }), { ok: true, patch: { sourceScentDealId: 'S1' } });
  assert.deepEqual(await resolveSourceScent(stub, { body: { sourceScentDealId: 'S-META' }, next }), { ok: true, patch: { sourceScentDealId: 'S-META' } });
});

test('ปฏิเสธ: ไม่ใช่ SCENT · Lost · ลูกค้าคนละราย · ไม่พบ · ชี้ตัวเอง', async () => {
  assert.match((await resolveSourceScent(stub, { body: { sourceScentDealId: 'R1' }, next })).error, /ไม่ใช่ดีลประเภท SCENT/);
  assert.match((await resolveSourceScent(stub, { body: { sourceScentDealId: 'S-LOST' }, next })).error, /Lost/);
  assert.match((await resolveSourceScent(stub, { body: { sourceScentDealId: 'S-OTHER' }, next })).error, /ลูกค้ารายเดียวกับดีลนี้/);
  assert.match((await resolveSourceScent(stub, { body: { sourceScentDealId: 'NOPE' }, next })).error, /ไม่พบ/);
  assert.match((await resolveSourceScent(stub, { body: { sourceScentDealId: 'N1' }, current: { id: 'N1' }, next })).error, /ชี้ตัวเอง/);
});

test('ไม่ใช่ NPD: เลือกไม่ได้ · เปลี่ยนประเภทออกจาก NPD = ถอดต้นทางเดิมให้ · ค่าว่าง = ถอด · ไม่ส่งมา = ไม่แตะ', async () => {
  assert.match((await resolveSourceScent(stub, { body: { sourceScentDealId: 'S1' }, next: { dealType: 'RE-ORDER', customerId: 'C1' } })).error, /เฉพาะดีลประเภท NPD/);
  assert.deepEqual(await resolveSourceScent(stub, { body: { dealType: 'SCENT' }, current: { id: 'N', sourceScentDealId: 'S1' }, next: { dealType: 'SCENT' } }), { ok: true, patch: { sourceScentDealId: null } });
  assert.deepEqual(await resolveSourceScent(stub, { body: { sourceScentDealId: '' }, current: { id: 'N', sourceScentDealId: 'S1' }, next }), { ok: true, patch: { sourceScentDealId: null } });
  assert.deepEqual(await resolveSourceScent(stub, { body: { title: 'x' }, current: { id: 'N', sourceScentDealId: 'S1' }, next }), { ok: true, patch: {} });
  assert.deepEqual(await resolveSourceScent(stub, { body: { sourceScentDealId: '' }, next: { dealType: 'SCENT' } }), { ok: true, patch: {} });
});

test('route + ฟอร์ม: POST/PATCH ตรวจด้วยตัวเดียวกัน · ฟอร์มโชว์ช่องเฉพาะ NPD ใต้ช่องลูกค้า · ฟอร์มแก้โหลดค่าเดิม', () => {
  const post = read('../../app/api/sales-planning/deals/route.js');
  assert.match(post, /const scentSource = await resolveSourceScent\(supabase, \{ body, next: \{ dealType: createdType, customerId: body\.customerId \|\| null \} \}\);/);
  assert.match(post, /if \(customerIdFilter\) q = q\.eq\('customerId', customerIdFilter\);/, 'GET ต้องกรองลูกค้า/ประเภทให้ตัวเลือกของฟอร์ม');
  const patch = read('../../app/api/sales-planning/deals/[id]/route.js');
  assert.match(patch, /const scentSource = await resolveSourceScent\(supabase, \{\s+body,\s+current: before,/);
  const form = read('../../components/salesPlanning/DealFormFields.js');
  assert.match(form, /const sourceScentField = isNpd && \(/);
  assert.match(form, /\{pairRows\(\[customerField, brandField\]\)\}\s+\{pairRows\(\[sourceScentField\]\)\}/);
  assert.match(form, /dealType=SCENT/);
  for (const page of ['../../app/sales-planning/deals/page.js', '../../app/sales-planning/deals/[id]/page.js']) {
    assert.match(read(page), /sourceScentDealId: deal\.sourceScentDealId \|\| "",/, page);
  }
});
