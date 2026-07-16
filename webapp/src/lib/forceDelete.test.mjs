import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isForceRequest, isDryRun, canForceDelete,
  dealForcePreview, cleanupDealOrphans, quotationForcePreview,
} from './forceDelete.js';

test('isForceRequest / isDryRun: อ่าน query flag', () => {
  const req = (u) => ({ url: u });
  assert.equal(isForceRequest(req('https://x/api/deals/1?force=1')), true);
  assert.equal(isForceRequest(req('https://x/api/deals/1?force=true')), true);
  assert.equal(isForceRequest(req('https://x/api/deals/1')), false);
  assert.equal(isForceRequest(req('https://x/api/deals/1?force=0')), false);
  assert.equal(isDryRun(req('https://x/api/deals/1?dryRun=1')), true);
  assert.equal(isDryRun(req('https://x/api/deals/1')), false);
  // URL พังไม่ควร throw
  assert.equal(isForceRequest({ url: 'not a url' }), false);
});

test('canForceDelete: admin เท่านั้น (superuser อื่นไม่ได้)', () => {
  assert.equal(canForceDelete({ role: 'admin' }), true);
  assert.equal(canForceDelete({ role: 'ae_supervisor' }), false);
  assert.equal(canForceDelete({ role: 'senior_ae' }), false);
  assert.equal(canForceDelete(null), false);
});

// stub supabase: ตอบ count ตาม (table, column) ที่ map ไว้
function stubCount(map) {
  return {
    from(table) {
      const ctx = { table, col: null, val: null, extra: false };
      const builder = {
        select() { return builder; },
        eq(col, val) {
          if (ctx.col === null) { ctx.col = col; ctx.val = val; }
          else { ctx.extra = true; } // เงื่อนไขที่สอง เช่น status='accepted'
          return builder;
        },
        then(resolve) {
          const key = ctx.extra ? `${table}:${ctx.col}:extra` : `${table}:${ctx.col}`;
          resolve({ count: map[key] ?? 0 });
        },
      };
      return builder;
    },
  };
}

test('dealForcePreview: แสดง cascade เฉพาะรายการที่ count>0 + note ตามสถานะ', async () => {
  const supabase = stubCount({
    'quotations:dealId:extra': 1,   // accepted
    'sales_orders:dealId': 1,
    'quotations:dealId': 2,
    'inquiries:dealId': 3,
    'personal_tasks:dealId': 0,
    'project_tasks:projectId': 5,
    'excise_registrations:projectId': 1,
    'inquiries:projectId': 0,
  });
  const deal = { id: 'D1', stage: 'won', metadata: { sahamitPoId: 'PO1' } };
  const project = { id: 'P1', code: 'PJ-1' };
  const { cascade, notes } = await dealForcePreview(supabase, deal, { project, lastOfProject: true });
  const labels = cascade.map((c) => c.label);
  // accepted + sale order + quotations + excise + project + tasks + inquiries รวม แต่ไม่มี personal_tasks (0)
  assert.ok(labels.some((l) => l.includes('Actual')));
  assert.ok(labels.some((l) => l.includes('ทะเบียนสรรพสามิต')));
  assert.ok(labels.some((l) => l.includes('โครงการผลิต PJ-1')));
  assert.ok(!labels.some((l) => l.includes('งานส่วนตัว')));
  // inquiries รวมของดีล (3) + ของโครงการ (0) = 3
  const inq = cascade.find((c) => c.label.includes('เรื่องสอบถาม'));
  assert.equal(inq.count, 3);
  // note ทั้ง 2 (Won + PO สหมิตร)
  assert.equal(notes.length, 2);
});

test('quotationForcePreview: โชว์ Sale Order ที่จะ cascade + note accepted', async () => {
  const supabase = stubCount({ 'sales_orders:quotationId': 1 });
  const { cascade, notes } = await quotationForcePreview(supabase, { id: 'Q1', status: 'accepted' });
  assert.equal(cascade.length, 1);
  assert.ok(cascade[0].label.includes('Sale Order'));
  assert.equal(notes.length, 1);
});

test('cleanupDealOrphans: ลบ message+task+inquiry ของดีล และปลด parentDealId', async () => {
  const calls = [];
  const supabase = {
    from(table) {
      const b = {
        _table: table, _op: null, _col: null,
        select() { return { eq: (c, v) => ({ then: (r) => { b._col = c; r({ data: [{ id: 'IQ1' }] }); } }) }; },
        delete() { b._op = 'delete'; return b; },
        update(patch) { b._op = 'update'; b._patch = patch; return b; },
        in(col, vals) { calls.push({ table, op: b._op, in: col, vals }); return b; },
        eq(col, val) { calls.push({ table, op: b._op, eq: col, val, patch: b._patch }); return b; },
      };
      return b;
    },
  };
  await cleanupDealOrphans(supabase, 'D1');
  // ต้องลบ inquiry_messages + personal_tasks ตาม inquiryId, ลบ inquiries, ลบ personal_tasks.dealId, ปลด parentDealId
  assert.ok(calls.some((c) => c.table === 'inquiry_messages' && c.op === 'delete' && c.in === 'inquiryId'));
  assert.ok(calls.some((c) => c.table === 'personal_tasks' && c.op === 'delete' && c.in === 'inquiryId'));
  assert.ok(calls.some((c) => c.table === 'inquiries' && c.op === 'delete' && c.in === 'id'));
  assert.ok(calls.some((c) => c.table === 'personal_tasks' && c.op === 'delete' && c.eq === 'dealId' && c.val === 'D1'));
  assert.ok(calls.some((c) => c.table === 'sales_deals' && c.op === 'update' && c.eq === 'parentDealId' && c.patch?.parentDealId === null));
});
