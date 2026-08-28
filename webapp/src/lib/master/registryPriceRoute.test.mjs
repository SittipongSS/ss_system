// ปุ่มใส่ราคา F/FB บนทะเบียนกลิ่น/สูตร (มติผู้ใช้ 2026-08-10)
//
// ล็อกกติกา 4 ข้อ:
//   1) ราคาลงทะเบียนวัสดุผ่านตัวตนเดิม — กดใส่ราคาซ้ำต้องต่อ rev บนวัสดุตัวเดิม
//      ไม่ใช่เกิดวัสดุตัวใหม่ (บั๊กที่ ensureMaterial ถูกเขียนมาปิด ห้ามไหลกลับ)
//   2) pointer scentId/formulaId ประทับครั้งแรกครั้งเดียว — ห้ามทับของเดิม
//   3) สิทธิ์ = ฝ่าย RD (canQuoteMaterial) · ร่างที่ยังไม่รับเข้าทะเบียนใส่ราคาไม่ได้
//   4) F/FB เป็นราคาเดียวต่อ กก. — tier เดียว qty=null เสมอ
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { priceRegistryEntry } from '../materialPricesAdmin.js';
import { makeRegistryPriceHandler } from './registryPriceRoute.js';
import { SCENT_STATUS_LABELS, isScentUsable } from './scents.js';

// fake supabase ครอบสามตาราง + RPC ของสายราคา — บันทึกทุก insert/update/rpc
function fakeSupabase({ materials = [] } = {}) {
  const calls = { inserts: [], updates: [], rpcs: [] };
  const revisionRow = { id: 'REV-1', revisionNo: 2, materialId: materials[0]?.id || 'MAT-NEW' };

  function chain(table) {
    const c = {
      _filters: {},
      select() { return c; },
      eq(col, val) { c._filters[col] = val; return c; },
      is(col, val) { c._filters[col] = val; return c; },
      in() { return c; },
      order() { return Promise.resolve({ data: c._rows(), error: null }); },
      single() { return Promise.resolve({ data: c._one(), error: null }); },
      maybeSingle() { return Promise.resolve({ data: c._one(), error: null }); },
      // ตารางลูก (rev/tiers) ถูก await ตรง ๆ หลัง .in() — ต้อง thenable
      then(resolve) { return resolve({ data: c._rows(), error: null }); },
      insert(row) {
        calls.inserts.push({ table, row });
        // แถวใหม่ต้องหาเจอในภายหลัง — appendMaterialRevision อ่านซ้ำด้วย id
        if (table === 'material_prices') materials.push({ ...row });
        return { select: () => ({ single: () => Promise.resolve({ data: { ...row }, error: null }) }) };
      },
      update(patch) {
        calls.updates.push({ table, patch });
        return { eq: () => Promise.resolve({ error: null }) };
      },
      _rows() {
        if (table === 'material_prices') return materials;
        return []; // revisions/tiers — ไม่มีของเดิมในเทสต์ชุดนี้
      },
      _one() {
        if (table === 'material_prices') {
          return materials.find((m) => m.id === c._filters.id) || null;
        }
        if (table === 'material_price_revisions') return revisionRow;
        return null;
      },
    };
    return c;
  }

  return {
    calls,
    from: (table) => chain(table),
    rpc(name, args) {
      calls.rpcs.push({ name, args });
      return Promise.resolve({ data: { revisionId: 'REV-1' }, error: null });
    },
  };
}

const SCENT = {
  id: 'SCT-1', code: 'PF1093001', name: 'ARMANI POWER OF YOU',
  customerId: 'CUS-1', customerName: 'บริษัท สหมิตร โปรดักส์ จำกัด', status: 'developing',
};

test('กลิ่นที่ไม่เคยมีวัสดุ: สร้างวัสดุ RM_F + ประทับ scentId + ต่อ rev ราคาเดียว', async () => {
  const supabase = fakeSupabase({ materials: [] });
  await priceRegistryEntry(supabase, {
    kind: 'RM_F', stampColumn: 'scentId', source: SCENT, price: 1200, user: { id: 'U1', name: 'RD' },
  });

  assert.equal(supabase.calls.inserts.length, 1, 'ต้องสร้างวัสดุใหม่ 1 ตัว');
  assert.equal(supabase.calls.inserts[0].row.kind, 'RM_F');
  assert.equal(supabase.calls.inserts[0].row.label, SCENT.name);
  // pointer ประทับหลังสร้าง (แถวใหม่ยังไม่มี scentId)
  const stamp = supabase.calls.updates.find((u) => u.patch.scentId);
  assert.equal(stamp?.patch.scentId, 'SCT-1');
  // F ไม่มีชั้นจำนวน — tier เดียว qty=null หน่วยต่อ กก.
  assert.equal(supabase.calls.rpcs.length, 1);
  assert.deepEqual(supabase.calls.rpcs[0].args.p_tiers, [{ qty: null, price: 1200 }]);
  assert.equal(supabase.calls.rpcs[0].args.p_unit_basis, 'per_kg');
});

test('กลิ่นที่มีวัสดุผูกแล้ว: ต่อ rev บนตัวเดิม ไม่สร้างใหม่ ไม่ทับ pointer', async () => {
  const existing = {
    id: 'MAT-1', kind: 'RM_F', label: 'ARMANI POWER OF YOU',
    customerId: 'CUS-1', scentId: 'SCT-1', status: 'active', revisions: [],
  };
  const supabase = fakeSupabase({ materials: [existing] });
  await priceRegistryEntry(supabase, {
    kind: 'RM_F', stampColumn: 'scentId', source: SCENT, price: 1350, user: null,
  });

  assert.equal(supabase.calls.inserts.length, 0, 'ห้ามเกิดวัสดุตัวที่สอง');
  assert.equal(supabase.calls.updates.length, 0, 'pointer เดิมอยู่แล้ว ห้ามแตะ');
  assert.equal(supabase.calls.rpcs[0].args.p_material_id, 'MAT-1');
});

// ── ด่านของ handler (สิทธิ์ · สถานะ · ราคา) ─────────────────────────────
const handler = makeRegistryPriceHandler({
  kind: 'RM_F',
  stampColumn: 'scentId',
  entityType: 'scent',
  entityLabel: 'กลิ่น',
  find: async (_supabase, id) => (id === 'SCT-1' ? SCENT
    : id === 'SCT-DRAFT' ? { ...SCENT, id, status: 'draft' } : null),
  usableError: (scent) => (isScentUsable(scent)
    ? null
    : `กลิ่นสถานะ "${SCENT_STATUS_LABELS[scent.status] || scent.status}" ยังใส่ราคาไม่ได้ — ต้องรับเข้าทะเบียนก่อน`),
});

const call = ({ user, id = 'SCT-1', body = { price: 1200 }, supabase = fakeSupabase() }) =>
  handler({
    user, supabase,
    req: { json: async () => body },
    ctx: { params: Promise.resolve({ id }) },
  });

const RD = { id: 'U1', name: 'RD Staff', role: 'rd', department: 'RD' };

test('ฝ่ายที่ไม่ใช่ RD ใส่ราคาไม่ได้', async () => {
  const res = await call({ user: { id: 'U2', role: 'ae', department: 'SA' } });
  assert.equal(res.status, 403);
});

test('ร่างที่ยังไม่รับเข้าทะเบียน ใส่ราคาไม่ได้ พร้อมบอกสถานะในข้อความ', async () => {
  const res = await call({ user: RD, id: 'SCT-DRAFT' });
  assert.equal(res.status, 400);
  const { error } = await res.json();
  // ข้อความต้องเรียกชื่อสถานะตามป้ายจริงบนจอ (form-design-rules §2)
  assert.match(error, /รอเข้าทะเบียน/);
});

test('ราคาว่าง/ติดลบ โดนตีกลับ', async () => {
  for (const price of ['', -5]) {
    const res = await call({ user: RD, body: { price } });
    assert.equal(res.status, 400, `price=${JSON.stringify(price)}`);
  }
});

test('RD ใส่ราคาสำเร็จ — ได้เลข rev กลับ', async () => {
  const res = await call({ user: RD });
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.revisionId, 'REV-1');
});
