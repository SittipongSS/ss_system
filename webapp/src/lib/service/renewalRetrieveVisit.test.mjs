// ── นัดถอนเครื่องอัตโนมัติเมื่อไม่ต่อสัญญา (PR-E · มติผู้ใช้ 2026-09-01) ──────────
import test from 'node:test';
import assert from 'node:assert/strict';
import { ensureRetrieveVisit, RETRIEVE_VISIT_KIND } from './renewalRetrieveVisit.js';

const SITE = { id: 'ST1', name: 'ไซต์ A' };
const USER = { id: 'u-ae', name: 'AE หนึ่ง' };

/* fake supabase ทั่วไป: ทุก .from(table)…chain… ตกลงที่ค่าตั้งต้นของตารางนั้น
   (ไม่ตรวจตัวกรอง — ด่านตัวกรองเป็นหน้าที่ของ PostgREST ไม่ใช่ของเทสต์นี้)
   · .rpc('create_entity_rows_with_code', …) เลียนแบบตัวจริง: คืนแถวพร้อม code */
function fakeSupabase(tables = {}) {
  const chain = (rows) => {
    const builder = {
      select: () => builder,
      eq: () => builder,
      in: () => builder,
      order: () => builder,
      limit: () => builder,
      then: (resolve) => resolve({ data: rows, error: null }),
    };
    return builder;
  };
  return {
    from: (table) => chain(tables[table] || []),
    rpc: (name, args) => {
      assert.equal(name, 'create_entity_rows_with_code');
      const rows = (args.p_rows || []).map((row, i) => ({ ...row, code: `SV-2609${String(i + 1).padStart(4, '0')}` }));
      return Promise.resolve({ data: rows, error: null });
    },
  };
}

test('ไซต์ไม่มีนัดถอนค้างอยู่ — สร้างนัดใหม่เป็นร่าง (ยังไม่มีเจ้าหน้าที่)', async () => {
  const supabase = fakeSupabase({ service_visits: [], service_zones: [] });
  const { visit, error } = await ensureRetrieveVisit(supabase, {
    site: SITE, followup: { declineReason: 'ลูกค้าปิดสาขา' }, user: USER, todayIso: '2026-09-01',
  });
  assert.equal(error, null);
  assert.equal(visit.kind, RETRIEVE_VISIT_KIND);
  assert.equal(visit.siteId, 'ST1');
  assert.equal(visit.status, 'draft');          // ยังไม่มีเจ้าหน้าที่ ⇒ ติดด่าน "assignee"
  assert.equal(visit.scheduledDate, '2026-09-01');
  assert.match(visit.note, /ลูกค้าไม่ต่อสัญญาบริการ — ลูกค้าปิดสาขา/);
  assert.ok(visit.code);
});

test('ไม่มีเหตุผลก็สร้างได้ — โน้ตไม่มีท่อนเหตุผลค้าง', async () => {
  const supabase = fakeSupabase({ service_visits: [], service_zones: [] });
  const { visit } = await ensureRetrieveVisit(supabase, { site: SITE, followup: {}, user: USER, todayIso: '2026-09-01' });
  assert.equal(visit.note, 'ลูกค้าไม่ต่อสัญญาบริการ');
});

test('ไซต์มีนัดถอนค้างอยู่แล้ว (ร่าง/ขึ้นตาราง) — ไม่สร้างซ้ำ', async () => {
  for (const status of ['draft', 'scheduled', 'in_progress', 'rescheduled']) {
    const supabase = fakeSupabase({
      service_visits: [{ id: 'V1', kind: RETRIEVE_VISIT_KIND, status }],
      service_zones: [],
    });
    const { visit, error } = await ensureRetrieveVisit(supabase, { site: SITE, followup: {}, user: USER });
    assert.equal(visit, null, `status=${status} ควรไม่สร้างซ้ำ`);
    assert.equal(error, null);
  }
});

test('นัดถอนเก่าที่ปิดจบ/ยกเลิกแล้วไม่นับ — สร้างใบใหม่ได้ (ต่อสัญญาแล้วต่อมาไม่ต่ออีกรอบ)', async () => {
  for (const status of ['done', 'partial', 'unable', 'cancelled']) {
    const supabase = fakeSupabase({
      service_visits: [{ id: 'V0', kind: RETRIEVE_VISIT_KIND, status }],
      service_zones: [],
    });
    const { visit, error } = await ensureRetrieveVisit(supabase, { site: SITE, followup: {}, user: USER, todayIso: '2026-09-01' });
    assert.equal(error, null);
    assert.ok(visit, `status=${status} ควรสร้างใบใหม่ได้`);
  }
});

test('นัดชนิดอื่นของไซต์เดียวกันไม่นับเป็นนัดถอนที่ค้างอยู่', async () => {
  const supabase = fakeSupabase({
    service_visits: [{ id: 'V1', kind: 'refill', status: 'scheduled' }],
    service_zones: [],
  });
  const { visit } = await ensureRetrieveVisit(supabase, { site: SITE, followup: {}, user: USER, todayIso: '2026-09-01' });
  assert.ok(visit);
});

test('ไม่มีไซต์ = ปฏิเสธพร้อมเหตุผล ไม่ยิงคำสั่งใด ๆ', async () => {
  const { visit, error } = await ensureRetrieveVisit({ from() { throw new Error('ไม่ควรถูกเรียก'); } }, { followup: {} });
  assert.equal(visit, null);
  assert.match(error, /ไม่พบไซต์/);
});
