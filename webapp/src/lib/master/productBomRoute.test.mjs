import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bomNotice, makeProductBomHandler } from './productBomRoute.js';

/* ⚠️ เทสต์นี้ห้ามแตะฐานจริง (AGENTS.md) — supabase เป็นตัวจำลองในหน่วยความจำ · audit/เธรด/กระดิ่ง/ทะเบียนผู้ใช้ส่งตัวจดเข้าไป */
function fakeSupabase(row, { afterRead = null } = {}) {
  const state = { row: row ? { ...row } : null, updates: [] };
  const supabase = {
    from(table) {
      assert.equal(table, 'products');
      return {
        select: () => ({
          eq: (_col, id) => ({
            maybeSingle: async () => {
              const data = state.row && state.row.id === id ? { ...state.row } : null;
              afterRead?.(state); // จำลองคนอื่นเขียนระหว่างที่ handler ถือแถวเก่า
              return { data, error: null };
            },
          }),
        }),
        update(patch) {
          const filters = [];
          const chain = {
            eq(col, value) { filters.push([col, value]); return chain; },
            is(col, value) { filters.push([col, value]); return chain; },
            select: () => ({
              maybeSingle: async () => {
                const match = state.row && filters.every(([col, value]) => (state.row[col] ?? null) === value);
                if (!match) return { data: null, error: null };
                state.row = { ...state.row, ...patch };
                state.updates.push(patch);
                return { data: { ...state.row }, error: null };
              },
            }),
          };
          return chain;
        },
      };
    },
  };
  return { supabase, state };
}

const product = (over = {}) => ({
  id: 'P-1', fgCode: 'FG-0510-01-002-10001', productDescription: 'น้ำหอม 50 ml', customerId: 'C-1', customerName: 'ลูกค้า',
  categoryCode: '01-002', approvalStatus: 'approved', isActive: true, formulaId: 'FML-1', volume: 50, volumeUnit: 'ml',
  costPrice: 120, bomStatus: null, bomRound: 0, ...over,
});

function harness({ row, caretakerTeams = ['KA'], afterRead = null } = {}) {
  const calls = { audit: [], append: [], notify: [], directory: 0 };
  const directory = new Map([
    ['U-RD1', { id: 'U-RD1', role: 'rd_perfumer', disabled: false }],
    ['U-RD2', { id: 'U-RD2', role: 'rd_coordinator', disabled: false }],
    ['U-RD3', { id: 'U-RD3', role: 'rd', disabled: true }],
    ['U-AE', { id: 'U-AE', role: 'ae', disabled: false }],
  ]);
  const handler = makeProductBomHandler({
    audit: async (x) => { calls.audit.push(x); },
    append: async (_s, x) => { calls.append.push(x); return { row: { id: 'EUP-1' } }; },
    notify: async (_s, x) => { calls.notify.push(x); return { sent: x.userIds.length }; },
    loadDirectory: async () => { calls.directory += 1; return directory; },
    caretakerTeams: async () => caretakerTeams,
    loadGiftSetRows: async () => [],
  });
  const db = fakeSupabase(row, { afterRead });
  const call = async (user, body) => {
    const res = await handler({
      user, supabase: db.supabase,
      req: { json: async () => body },
      ctx: { params: Promise.resolve({ id: 'P-1' }) },
    });
    return { status: res.status, body: await res.json() };
  };
  return { call, calls, state: db.state };
}

const AE = { id: 'U-AE', name: 'เอ', role: 'ae', team: 'KA', teams: ['KA'], department: 'SA' };
const RD = { id: 'U-RD1', name: 'ริสา', role: 'rd_perfumer', department: 'RD' };

test('ส่ง: ฝ่ายขายทีมที่ดูแล → รอรับเรื่อง · เธรด + audit + กระดิ่งถึง RD ทุกคนที่ยังใช้งาน (ไม่รวมตัวเอง/บัญชีปิด)', async () => {
  const h = harness({ row: product() });
  const res = await h.call(AE, { action: 'send' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.bomStatus, 'queued');
  assert.equal(res.body.costPrice, undefined, 'ไม่คืนราคาผลิต');
  assert.equal(h.state.row.bomRound, 1);
  assert.equal(h.calls.append[0].kind, 'bom_send');
  assert.equal(h.calls.audit.length, 1);
  assert.deepEqual(h.calls.notify[0].userIds.sort(), ['U-RD1', 'U-RD2']);
  assert.equal(h.calls.notify[0].href, '/rd/bom');
});

test('ส่ง: ทีมอื่นโดน 403 · RD กดส่งเองไม่ได้ · ข้อมูลไม่ครบ = 400 ไม่เขียนอะไร', async () => {
  const other = harness({ row: product(), caretakerTeams: ['B2B'] });
  assert.equal((await other.call(AE, { action: 'send' })).status, 403);
  const rd = harness({ row: product() });
  assert.equal((await rd.call(RD, { action: 'send' })).status, 403);
  const gap = harness({ row: product({ formulaId: null }) });
  const res = await gap.call(AE, { action: 'send' });
  assert.equal(res.status, 400);
  assert.match(res.body.error, /ผูกสูตร/);
  assert.equal(gap.state.updates.length, 0);
  assert.equal(gap.calls.audit.length, 0);
});

test('ฝั่ง RD: รับเรื่อง → ลงเสร็จ (รหัส BOM) · กระดิ่งผลไปหาคนส่ง · ฝ่ายขายกดปุ่มของ RD ไม่ได้', async () => {
  const h = harness({ row: product({ bomStatus: 'queued', bomRound: 1, bomSentBy: 'U-AE' }) });
  assert.equal((await h.call(AE, { action: 'accept' })).status, 403);
  const accepted = await h.call(RD, { action: 'accept' });
  assert.equal(accepted.status, 200);
  assert.equal(h.state.row.bomAcceptedByName, 'ริสา');
  assert.equal(h.calls.notify.length, 0, 'รับเรื่องไม่เด้ง');
  const done = await h.call(RD, { action: 'done', bomCode: 'BOM-26-001' });
  assert.equal(done.status, 200);
  assert.equal(h.state.row.bomStatus, 'done');
  assert.equal(h.state.row.bomCode, 'BOM-26-001');
  assert.deepEqual(h.calls.notify[0].userIds, ['U-AE']);
  assert.match(h.calls.notify[0].title, /ลง BOM แล้ว/);
});

test('ตีกลับต้องมีเหตุผล · มีแล้วกระดิ่งพร้อมเหตุผลไปหาคนส่ง', async () => {
  const h = harness({ row: product({ bomStatus: 'in_progress', bomSentBy: 'U-AE' }) });
  assert.equal((await h.call(RD, { action: 'return', reason: '' })).status, 400);
  const res = await h.call(RD, { action: 'return', reason: 'ปริมาตรไม่ตรงสเปค' });
  assert.equal(res.status, 200);
  assert.equal(h.state.row.bomStatus, 'returned');
  assert.equal(h.calls.notify[0].body, 'ปริมาตรไม่ตรงสเปค');
});

test('ชนกับคนที่กดก่อน = 409 ไม่ทับ: ดึงกลับหลัง RD รับเรื่อง · RD รับซ้ำ · สถานะเปลี่ยนระหว่างอ่านกับเขียน', async () => {
  const late = harness({ row: product({ bomStatus: 'in_progress', bomSentBy: 'U-AE' }) });
  const pull = await late.call(AE, { action: 'pullback' });
  assert.equal(pull.status, 409);
  assert.match(pull.body.error, /RD รับเรื่องแล้ว/);
  assert.equal((await late.call(RD, { action: 'accept' })).status, 409);

  // CAS: อ่านได้ queued แต่ตอนเขียนแถวกลายเป็น in_progress แล้ว (RD อีกคนกดก่อน) ⇒ 409 ไม่ทับ
  const race = harness({ row: product({ bomStatus: 'queued' }), afterRead: (state) => { state.row.bomStatus = 'in_progress'; } });
  const res = await race.call(RD, { action: 'accept' });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /มีคนเปลี่ยนสถานะ BOM ไปก่อนแล้ว/);
  assert.equal(race.state.updates.length, 0);
  assert.equal(race.calls.audit.length, 0, 'ไม่ได้เขียน = ไม่มี audit/เธรด/กระดิ่ง');
});

test('คำสั่งแปลก/สินค้ากลุ่ม 03 = 400 · ไม่ล็อกอิน = 401 · ไม่พบสินค้า = 404', async () => {
  const h = harness({ row: product() });
  assert.equal((await h.call(AE, { action: 'delete' })).status, 400);
  assert.equal((await h.call(null, { action: 'send' })).status, 401);
  const design = harness({ row: product({ categoryCode: '03-002' }) });
  assert.equal((await design.call(AE, { action: 'send' })).status, 400);
  const none = harness({ row: null });
  assert.equal((await none.call(AE, { action: 'send' })).status, 404);
});

test('bomNotice: ไม่มี RD ในระบบ = ไม่มีกระดิ่ง (ไม่ใช่ยิงหาใครก็ได้) · คนส่งกดเองไม่แจ้งตัวเอง', () => {
  assert.equal(bomNotice('send', product(), { directory: new Map(), actorId: 'U-AE' }), null);
  assert.equal(bomNotice('done', product({ bomSentBy: 'U-AE' }), { actorId: 'U-AE' }), null);
  assert.equal(bomNotice('accept', product({ bomSentBy: 'U-AE' }), { actorId: 'U-RD1' }), null);
});
