// พรีวิวย้อนการรับ (มติ 25/09 · mig 0388) — ตัวอ่านแถว: ถามใบของดีลเดียว · ตราอ่านผ่าน JSON path · อ่านไม่ขึ้น = throw
import test from 'node:test';
import assert from 'node:assert/strict';
import { previewQuotationUnaccept } from './quotationUnacceptRepo.js';

function stub({ rows = [], error = null } = {}) {
  const calls = { from: null, select: null, eq: [], order: [], range: [] };
  const chain = {
    select: (cols) => { calls.select = cols; return chain; },
    eq: (col, value) => { calls.eq.push([col, value]); return chain; },
    order: (col) => { calls.order.push(col); return chain; },
    range: async (from, to) => { calls.range.push([from, to]); return { data: error ? null : rows, error }; },
  };
  return { calls, supabase: { from: (table) => { calls.from = table; return chain; } } };
}

const QUOTE = {
  id: 'QT-X', quoteNumber: 'QT-26090001-0', dealId: 'DL-1',
  deal: { id: 'DL-1', projectId: 'PJ-1', project: { id: 'PJ-1', code: 'PJ-26080001', name: 'บางนา' } },
};

test('พรีวิว: อ่านใบของดีลนี้ดีลเดียว + ตราผ่าน JSON path · คิดรายการด้วยกติกาเดียวกับ RPC', async () => {
  const { calls, supabase } = stub({ rows: [
    { id: 'QT-X', quoteNumber: 'QT-26090001-0', status: 'accepted', approvalStatus: 'approved' },
    { id: 'QT-A', quoteNumber: 'QT-A-0', status: 'closed', approvalStatus: 'approved', closedByAccept: { quotationId: 'QT-X', prevStatus: 'sent' } },
    { id: 'QT-B', quoteNumber: 'QT-B-0', status: 'closed', approvalStatus: 'pending', closedByAccept: null },
    { id: 'QT-C', quoteNumber: 'QT-C-0', status: 'closed', approvalStatus: 'approved', closedByAccept: { quotationId: 'QT-OTHER', prevStatus: 'sent' } },
  ] });
  const preview = await previewQuotationUnaccept(supabase, QUOTE);
  assert.equal(calls.from, 'quotations');
  assert.match(calls.select, /closedByAccept:metadata->closedByAccept/);
  assert.match(calls.select, /acceptedAt/);
  assert.match(calls.select, /updatedAt/);
  assert.deepEqual(calls.eq, [['dealId', 'DL-1']]);
  assert.deepEqual(calls.range, [[0, 999]], 'ไล่ทีละหน้า (fetchAll) — ไม่ใช่ select ไร้ขอบเขต');
  assert.equal(preview.quoteNumber, 'QT-26090001-0');
  assert.deepEqual(preview.reopen.map((r) => [r.id, r.status, r.inferred]), [['QT-A', 'sent', false], ['QT-B', 'draft', true]]);
  assert.deepEqual(preview.project, { id: 'PJ-1', code: 'PJ-26080001', name: 'บางนา' });
});

test('พรีวิว: อ่านไม่ขึ้น = throw (ห้ามตอบ "ไม่มีใบให้เปิด") · โครงการที่ join ไม่มา ถอยเป็น id', async () => {
  const { supabase } = stub({ error: { message: 'boom' } });
  await assert.rejects(() => previewQuotationUnaccept(supabase, QUOTE), /อ่านใบเสนอราคาของดีลไม่สำเร็จ: boom/);
  const ok = stub({ rows: [] });
  const preview = await previewQuotationUnaccept(ok.supabase, { id: 'QT-X', dealId: 'DL-1', deal: { id: 'DL-1', projectId: 'PJ-9' } });
  assert.deepEqual(preview.project, { id: 'PJ-9', code: null, name: null });
  assert.deepEqual(preview.reopen, []);
});
