import test from 'node:test';
import assert from 'node:assert/strict';
import {
  customerTaxSiblingIdMap, customerTaxSiblingIds, taxGroupKey, taxSiblingIdsFromRows,
} from './customerTaxSiblings.js';

/* ── "นิติบุคคลเดียวกัน" ต้องเข้มกว่าด่านตอนบันทึกลูกค้ามาก ────────────────────
   ด่านฟอร์ม (`taxIdFormatError`) ปล่อยค่าที่มีตัวอักษรผ่านทั้งหมด และ `taxIdKey`
   เติมศูนย์ให้เลข 12 หลัก ⇒ ค่าขยะกลายเป็นคีย์ที่ "ไม่ว่าง" ได้ · ถ้าจับกลุ่มด้วย
   "มีคีย์ไหม" บริษัทคนละรายที่กรอกเหมือนกันจะสลับทะเบียน FG กันทันที */

const cust = (over = {}) => ({
  id: 'C1', arCode: 'AR-001', name: 'บริษัท ก', taxId: '0105561194100',
  branchCode: '00000', isActive: true, isForeign: false, approvalStatus: 'approved', ...over,
});

test('เลขไทย 13 หลักล้วน = จับกลุ่มได้', () => {
  assert.equal(taxGroupKey(cust()), '0105561194100');
  // ศูนย์นำหน้าหายตอนผ่าน Excel — ต้องเป็นกลุ่มเดียวกับ 13 หลัก
  assert.equal(taxGroupKey(cust({ taxId: '105561194100' })), '0105561194100');
  // เก็บมาพร้อมขีดคั่น
  assert.equal(taxGroupKey(cust({ taxId: '0-1055-61194-10-0' })), '0105561194100');
});

test('เลขที่จับกลุ่มไม่ได้ = คีย์ว่าง (ไม่มีใบพี่น้อง)', () => {
  for (const taxId of ['', null, undefined, 'N/A', 'na', 'ABC', 'AC4978805', '12345', '0105561194100X']) {
    assert.equal(taxGroupKey(cust({ taxId })), '', `${taxId} ต้องไม่จับกลุ่ม`);
  }
  // เลขซ้ำตัวเดียวทั้งชุด = ค่าที่คนกรอกใส่แทน "ยังไม่รู้" ไม่ใช่เลขจริง
  // ('000000000000' 12 หลักถูก taxIdKey เติมศูนย์จนกลายเป็นคีย์ 13 หลักที่ใช้ได้สนิท)
  assert.equal(taxGroupKey(cust({ taxId: '000000000000' })), '');
  assert.equal(taxGroupKey(cust({ taxId: '0000000000000' })), '');
  assert.equal(taxGroupKey(cust({ taxId: '1111111111111' })), '');
  // ลูกค้าต่างชาติไม่จับกลุ่ม — taxIdMatchFilter หาคีย์ที่มีตัวอักษรไม่เจออยู่แล้ว
  assert.equal(taxGroupKey(cust({ isForeign: true })), '');
});

// ── stub supabase ────────────────────────────────────────────────────────────
const fakeSupabase = (rows) => ({
  from: (table) => {
    assert.equal(table, 'customers');
    // `.or()` ของจริงกว้างเกินตั้งใจ (ดึงหลวมแล้วกรองซ้ำใน JS) — stub จึงคืนทุกแถว
    // ส่วน `.in()` กรองจริงเหมือน PostgREST
    const select = () => {
      let scoped = rows;
      const chain = {
        eq: (col, value) => ({
          maybeSingle: async () => ({ data: scoped.find((r) => r[col] === value) || null, error: null }),
        }),
        or: () => chain,
        order: () => chain,
        in: (col, values) => { scoped = scoped.filter((r) => values.includes(r[col])); return chain; },
        range: async () => ({ data: scoped, error: null }),
        // builder จริงของ supabase-js เป็น thenable — `fetchInChunks` await ตัว query ตรง ๆ
        then: (resolve) => resolve({ data: scoped, error: null }),
      };
      return chain;
    };
    return { select };
  },
});

const HEAD = cust({ id: 'C-HEAD', arCode: 'AR-148', branchCode: '00000' });
const BRANCH = cust({ id: 'C-BRANCH', arCode: 'AR-636', branchCode: '00002' });

test('ใบพี่น้องอนุมัติแล้ว = อยู่ในกลุ่มทั้งสองทาง', async () => {
  const sb = fakeSupabase([HEAD, BRANCH]);
  assert.deepEqual(await customerTaxSiblingIds(sb, 'C-BRANCH'), ['C-BRANCH', 'C-HEAD']);
  assert.deepEqual(await customerTaxSiblingIds(sb, 'C-HEAD'), ['C-HEAD', 'C-BRANCH']);
});

test('ใบพี่น้องที่ยังไม่อนุมัติ/ถูกตีกลับ = ไม่เข้ากลุ่ม', async () => {
  for (const approvalStatus of ['pending', 'rejected']) {
    const sb = fakeSupabase([BRANCH, { ...HEAD, approvalStatus }]);
    assert.deepEqual(await customerTaxSiblingIds(sb, 'C-BRANCH'), ['C-BRANCH']);
  }
});

// แถวยุคเก่าไม่มีช่องสถานะ = อนุมัติแล้ว (กติกาเดียวกับ GET /api/products)
test('ใบพี่น้องยุคเก่าที่ approvalStatus เป็น null = เข้ากลุ่ม', async () => {
  const sb = fakeSupabase([BRANCH, { ...HEAD, approvalStatus: null }]);
  assert.deepEqual(await customerTaxSiblingIds(sb, 'C-BRANCH'), ['C-BRANCH', 'C-HEAD']);
});

/* ⭐ ใบ **พักใช้** ยังนับเป็นพี่น้อง — การยุบใบซ้ำในทะเบียนทำด้วยการพักใช้ ไม่ใช่ลบ
   ⇒ FG ที่ค้างอยู่ในใบที่พักใช้ต้องยังหยิบมาใช้จากใบหลักได้ */
test('ใบพี่น้องที่พักใช้ = ยังเข้ากลุ่ม', async () => {
  const sb = fakeSupabase([BRANCH, { ...HEAD, isActive: false }]);
  assert.deepEqual(await customerTaxSiblingIds(sb, 'C-BRANCH'), ['C-BRANCH', 'C-HEAD']);
});

test('ชื่อสาขาเป็นข้อความ (แจ้งวัฒนะ) ยังเข้ากลุ่ม — กลุ่มตัดสินที่เลข ไม่ใช่สาขา', async () => {
  const sb = fakeSupabase([BRANCH, { ...HEAD, branchCode: 'แจ้งวัฒนะ' }]);
  assert.deepEqual(await customerTaxSiblingIds(sb, 'C-BRANCH'), ['C-BRANCH', 'C-HEAD']);
});

test('เลขขยะเหมือนกันทั้งคู่ = ยังเป็นคนละนิติบุคคล', async () => {
  const sb = fakeSupabase([
    { ...BRANCH, taxId: 'N/A' },
    { ...HEAD, taxId: 'N/A' },
  ]);
  assert.deepEqual(await customerTaxSiblingIds(sb, 'C-BRANCH'), ['C-BRANCH']);
});

test('หาใบตั้งต้นไม่เจอ = ไม่มีขอบเขต (ผู้เรียกต้องไม่ปล่อยทั้งทะเบียนหลุด)', async () => {
  assert.deepEqual(await customerTaxSiblingIds(fakeSupabase([HEAD]), 'ไม่มีใบนี้'), []);
  assert.deepEqual(await customerTaxSiblingIds(fakeSupabase([HEAD]), ''), []);
});

// ── รุ่นหลายใบ: ต้องได้ผลเท่ากับเรียกทีละใบ แต่ยิงคิวรีคงที่ (กัน N+1) ──────────
test('customerTaxSiblingIdMap ให้ผลเท่ากับเรียกทีละใบ', async () => {
  const LONE = cust({ id: 'C-LONE', arCode: 'AR-900', taxId: '0107553000166' });
  const sb = fakeSupabase([HEAD, BRANCH, LONE]);
  const map = await customerTaxSiblingIdMap(sb, ['C-BRANCH', 'C-LONE', 'C-BRANCH']);
  assert.deepEqual(map.get('C-BRANCH'), ['C-BRANCH', 'C-HEAD']);
  assert.deepEqual(map.get('C-LONE'), ['C-LONE']);
});

test('customerTaxSiblingIdMap: ใบที่หาไม่เจอ/ไม่มีเลข = ได้ตัวเองกลับไป', async () => {
  const sb = fakeSupabase([{ ...BRANCH, taxId: null }]);
  const map = await customerTaxSiblingIdMap(sb, ['C-BRANCH', 'ไม่มีใบนี้']);
  assert.deepEqual(map.get('C-BRANCH'), ['C-BRANCH']);
  assert.deepEqual(map.get('ไม่มีใบนี้'), ['ไม่มีใบนี้']);
  assert.deepEqual((await customerTaxSiblingIdMap(sb, [])).size, 0);
});

/* รุ่นบริสุทธิ์ — จอที่ถือทะเบียนลูกค้าอยู่แล้วใช้กรองลิสต์ได้โดยไม่ยิง query
   ต้องให้ผลตรงกับรุ่นที่ถามฐาน ไม่งั้นจอกับด่าน server พูดคนละเรื่อง */
test('taxSiblingIdsFromRows ให้ผลตรงกับรุ่นที่ถามฐาน', async () => {
  const rows = [HEAD, BRANCH];
  assert.deepEqual(taxSiblingIdsFromRows(rows, 'C-BRANCH'),
    await customerTaxSiblingIds(fakeSupabase(rows), 'C-BRANCH'));
  assert.deepEqual(taxSiblingIdsFromRows(rows, 'C-HEAD'),
    await customerTaxSiblingIds(fakeSupabase(rows), 'C-HEAD'));
});

test('taxSiblingIdsFromRows: ใบพี่น้องยังไม่อนุมัติ/เลขจับกลุ่มไม่ได้/ไม่มีใบในลิสต์', () => {
  assert.deepEqual(taxSiblingIdsFromRows([BRANCH, { ...HEAD, approvalStatus: 'pending' }], 'C-BRANCH'), ['C-BRANCH']);
  assert.deepEqual(taxSiblingIdsFromRows([{ ...BRANCH, taxId: 'N/A' }, { ...HEAD, taxId: 'N/A' }], 'C-BRANCH'), ['C-BRANCH']);
  // จอโหลดทะเบียนมาไม่ครบ = กรองแคบไว้ก่อน (ด่านจริงอยู่ฝั่ง server)
  assert.deepEqual(taxSiblingIdsFromRows([], 'C-BRANCH'), ['C-BRANCH']);
  assert.deepEqual(taxSiblingIdsFromRows([HEAD, BRANCH], ''), []);
});

/* 🪤 ลิสต์ id / ตัวกรอง ยาวเกิน ~16 KB = PostgREST ต่อไม่ติด แล้วโยน
   `TypeError: fetch failed` ดิบ ๆ (ดู lib/supabaseInChunks.js · #1660)
   คิวส่งงานกับลิสต์ใบยื่นภาษีส่งลูกค้าเข้ามาหลักร้อยได้ ⇒ ต้องซอยทั้งสองฝั่ง */
test('customerTaxSiblingIdMap ซอยลิสต์ id และตัวกรองเป็นก้อน — ไม่ยิงก้อนเดียวยาว ๆ', async () => {
  const many = Array.from({ length: 400 }, (_, i) => cust({
    id: `CUS-${String(i).padStart(4, '0')}`,
    arCode: `AR-${i}`,
    // เลขคนละตัวทุกใบ ⇒ ได้ 400 คีย์ = ตัวกรองยาวสุด
    taxId: String(1000000000000 + i),
  }));
  const calls = { in: [], or: [] };
  const sb = {
    from: () => {
      let scoped = many;
      const chain = {
        eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }),
        or: (filter) => { calls.or.push(filter.length); return chain; },
        order: () => chain,
        in: (col, values) => { calls.in.push(values.length); scoped = many.filter((r) => values.includes(r[col])); return chain; },
        range: async () => ({ data: scoped, error: null }),
        then: (resolve) => resolve({ data: scoped, error: null }),
      };
      return { select: () => chain };
    },
  };
  const map = await customerTaxSiblingIdMap(sb, many.map((c) => c.id));
  assert.equal(map.size, 400);
  assert.deepEqual(map.get('CUS-0007'), ['CUS-0007']); // เลขไม่ซ้ำใคร = ไม่มีพี่น้อง
  assert.ok(calls.in.length > 1, 'ลิสต์ id ต้องถูกซอย');
  assert.ok(Math.max(...calls.in) <= 150, `ก้อน id ใหญ่สุด ${Math.max(...calls.in)} ต้องไม่เกิน 150`);
  assert.ok(calls.or.length > 1, 'ตัวกรองต้องถูกซอย');
  assert.ok(Math.max(...calls.or) < 8000, `ตัวกรองยาวสุด ${Math.max(...calls.or)} ไบต์ ต้องห่างจากเพดาน 16 KB`);
});
