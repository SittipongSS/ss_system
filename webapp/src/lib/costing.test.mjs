// ระบบขอราคาต้นทุน (mig 0141) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalProgress,
  baselineTier,
  canEditCostingRequest,
  canViewCostingRequest,
  componentUnitCost,
  deriveRequestStatusAfterApproval,
  deriveRequestStatusAfterQuote,
  isMoqTier,
  itemUnitCost,
  normalizeCostingStatus,
  pricingProgress,
} from './costing.js';

const item = (approvalStatus) => ({ approvalStatus });

test('ตัวนับอนุมัติ: นับสดจากลูก แยก อนุมัติ/ตีกลับ/รออนุมัติ', () => {
  assert.deepEqual(
    approvalProgress([item('approved'), item('approved'), item('returned'), item('pending')]),
    { total: 4, approved: 2, returned: 1, pending: 1 },
  );
  assert.deepEqual(approvalProgress([]), { total: 0, approved: 0, returned: 0, pending: 0 });
});

test('ตัวนับราคา: บรรทัดค่าดำเนินการ (ไม่มี sourceDept) ไม่นับเข้าคิวขอราคา', () => {
  const components = [
    { sourceDept: 'RD', priceStatus: 'quoted' },
    { sourceDept: 'PC', priceStatus: 'pending' },
    { sourceDept: null, priceStatus: 'pending' }, // คิดภายใน ไม่ต้องรอใคร
  ];
  assert.deepEqual(pricingProgress(components), { total: 2, quoted: 1, pending: 1 });
});

test('สถานะใบหลังอนุมัติ: ครบทุกรายการ = อนุมัติ, มีตีกลับแม้รายการเดียว = ตีกลับ', () => {
  assert.equal(
    deriveRequestStatusAfterApproval([item('approved'), item('approved')], 'pending_exec'),
    'approved',
  );
  // ตีกลับ 1 ใน 3 → ใบกลับมาที่ฝ่ายขาย ทั้งที่มี 2 รายการอนุมัติแล้ว
  assert.equal(
    deriveRequestStatusAfterApproval([item('approved'), item('approved'), item('returned')], 'pending_exec'),
    'returned',
  );
  // ยังอนุมัติไม่ครบและไม่มีตีกลับ → ยังรอผู้บริหารอยู่
  assert.equal(
    deriveRequestStatusAfterApproval([item('approved'), item('pending')], 'pending_exec'),
    'pending_exec',
  );
  // อนุมัติรายการสุดท้ายหลังเคยตีกลับ → พลิกเป็นอนุมัติได้
  assert.equal(
    deriveRequestStatusAfterApproval([item('approved'), item('approved')], 'returned'),
    'approved',
  );
});

test('สถานะใบหลังอนุมัติ: ไม่แตะสถานะที่ไม่ได้อยู่ในช่วงอนุมัติ', () => {
  for (const status of ['draft', 'pricing', 'assembling', 'linked', 'cancelled']) {
    assert.equal(deriveRequestStatusAfterApproval([item('approved')], status), status, status);
  }
  // ใบไม่มีรายการ = ไม่มีอะไรให้ derive
  assert.equal(deriveRequestStatusAfterApproval([], 'pending_exec'), 'pending_exec');
});

test('สถานะใบหลังตอบราคา: ครบทุกบรรทัดที่ต้องถาม → พร้อมประกอบต้นทุน', () => {
  const all = [{ sourceDept: 'RD', priceStatus: 'quoted' }, { sourceDept: 'PC', priceStatus: 'quoted' }];
  assert.equal(deriveRequestStatusAfterQuote(all, 'pricing'), 'assembling');
  assert.equal(
    deriveRequestStatusAfterQuote([...all, { sourceDept: 'PC', priceStatus: 'pending' }], 'pricing'),
    'pricing',
  );
  // ใบที่ไม่มีบรรทัดต้องถามเลย ไม่ควรกระโดดข้ามไปเอง
  assert.equal(deriveRequestStatusAfterQuote([{ sourceDept: null, priceStatus: 'pending' }], 'pricing'), 'pricing');
  // สถานะอื่นไม่ถูกแตะ
  assert.equal(deriveRequestStatusAfterQuote(all, 'pending_exec'), 'pending_exec');
});

test('ต้นทุนต่อชิ้น: วัตถุดิบแปลงจากบาท/กก. ด้วยกรัมต่อชิ้น', () => {
  // 1,200 บาท/กก. ที่ 80 กรัม/ชิ้น = 96 บาท/ชิ้น
  assert.equal(
    componentUnitCost({ unitBasis: 'per_kg', pricePerKg: 1200, gramsPerUnit: 80 }),
    96,
  );
  assert.equal(componentUnitCost({ unitBasis: 'per_piece', pricePerUnit: 12.5 }), 12.5);
});

test('ต้นทุนต่อชิ้น: ยังไม่รู้ต้องเป็น null ไม่ใช่ 0 (0 แปลว่าฟรี)', () => {
  assert.equal(componentUnitCost({ unitBasis: 'per_kg', pricePerKg: null, gramsPerUnit: 80 }), null);
  assert.equal(componentUnitCost({ unitBasis: 'per_kg', pricePerKg: 1200, gramsPerUnit: null }), null);
  assert.equal(componentUnitCost({ unitBasis: 'per_kg', pricePerKg: 1200, gramsPerUnit: 0 }), null);
  assert.equal(componentUnitCost({ unitBasis: 'per_piece', pricePerUnit: null }), null);
  assert.equal(componentUnitCost(null), null);
  // ราคา 0 จริง ๆ (ของแถม) ต้องนับเป็น 0 ไม่ใช่ null
  assert.equal(componentUnitCost({ unitBasis: 'per_piece', pricePerUnit: 0 }), 0);
});

test('ต้นทุนรวมต่อชิ้น: บอกได้ว่ายังไม่ครบเมื่อบรรทัดบังคับยังไม่มีราคา', () => {
  const full = itemUnitCost([
    { unitBasis: 'per_kg', pricePerKg: 1000, gramsPerUnit: 20, required: true },   // 20
    { unitBasis: 'per_piece', pricePerUnit: 8, required: true },                    // 8
  ]);
  assert.equal(full.total, 28);
  assert.equal(full.complete, true);

  // บรรทัดบังคับยังไม่มีราคา → ตัวเลขยังไม่ใช่ของจริง
  const partial = itemUnitCost([
    { unitBasis: 'per_piece', pricePerUnit: 8, required: true },
    { unitBasis: 'per_piece', pricePerUnit: null, required: true },
  ]);
  assert.equal(partial.total, 8);
  assert.equal(partial.complete, false);

  // บรรทัดไม่บังคับที่ยังไม่มีราคา ไม่ทำให้ใบไม่ครบ
  const optional = itemUnitCost([
    { unitBasis: 'per_piece', pricePerUnit: 8, required: true },
    { unitBasis: 'per_piece', pricePerUnit: null, required: false },
  ]);
  assert.equal(optional.complete, true);
});

test('ชั้น MOQ: เทียบกับ moq ของใบ ไม่ได้เก็บธงไว้', () => {
  assert.equal(isMoqTier({ qty: 1000 }, 1000), true);
  assert.equal(isMoqTier({ qty: '1000' }, 1000), true);
  assert.equal(isMoqTier({ qty: 500 }, 1000), false);
});

test('ชั้นอ้างอิงสำหรับป้อนต้นทุนกลับ FG: ชั้น MOQ ก่อน ไม่มีก็เอาชั้นน้อยสุดที่มีราคา', () => {
  const tiers = [
    { qty: 500, approvedUnitPrice: 120 },
    { qty: 1000, approvedUnitPrice: 100 },
    { qty: 3000, approvedUnitPrice: 90 },
  ];
  assert.equal(baselineTier(tiers, 1000).qty, 1000);
  // ชั้น MOQ ยังไม่มีราคา → ตกไปชั้นน้อยสุดที่มีราคาจริง
  assert.equal(baselineTier([{ qty: 1000, approvedUnitPrice: null }, ...tiers.slice(0, 1)], 1000).qty, 500);
  assert.equal(baselineTier([{ qty: 1000, approvedUnitPrice: null }], 1000), null);
  assert.equal(baselineTier([], 1000), null);
});

test('normalizeCostingStatus: ค่าแปลกปลอมตกเป็นร่างเสมอ', () => {
  assert.equal(normalizeCostingStatus('approved'), 'approved');
  assert.equal(normalizeCostingStatus('bogus'), 'draft');
  assert.equal(normalizeCostingStatus(undefined), 'draft');
});

// ── สิทธิ์รายใบ ────────────────────────────────────────────────────────
const req = (extra = {}) => ({
  status: 'pricing', team: 'KA', requestedById: 'u-ae', ...extra,
});

test('เห็นใบ: RD/PC เห็นคิวทั้งฝ่าย, ผู้บริหารเห็นหมด, ฝ่ายขายตาม scope ดีล', () => {
  assert.equal(canViewCostingRequest({ role: 'rd', department: 'RD' }, req()), true);
  assert.equal(canViewCostingRequest({ role: 'staff', department: 'PC' }, req()), true);
  assert.equal(canViewCostingRequest({ role: 'executive' }, req()), true);
  // AE เจ้าของใบเห็น; AE ทีมอื่นไม่เห็น
  assert.equal(canViewCostingRequest({ id: 'u-ae', role: 'ae', team: 'KA' }, req()), true);
  assert.equal(canViewCostingRequest({ id: 'u-other', role: 'ae', team: 'ODM' }, req()), false);
  // ฝ่ายที่ไม่เกี่ยวข้องเลย (คลัง) ไม่เห็น แม้ถือ cap ผ่าน role staff
  assert.equal(canViewCostingRequest({ role: 'staff', department: 'WH' }, req()), false);
});

test('แก้ใบ: ปิดตายเมื่ออนุมัติครบ/ป้อนต้นทุนแล้ว/ยกเลิก', () => {
  const ae = { id: 'u-ae', role: 'ae', team: 'KA' };
  assert.equal(canEditCostingRequest(ae, req({ status: 'draft' })), true);
  assert.equal(canEditCostingRequest(ae, req({ status: 'returned' })), true);
  for (const status of ['approved', 'linked', 'cancelled']) {
    assert.equal(canEditCostingRequest(ae, req({ status })), false, status);
  }
  // ผู้บริหารไม่ใช่คนแก้ใบ (อนุมัติอย่างเดียว)
  assert.equal(canEditCostingRequest({ role: 'executive' }, req({ status: 'draft' })), false);
  // admin break-glass แก้ได้
  assert.equal(canEditCostingRequest({ role: 'admin' }, req({ status: 'draft' })), true);
});
