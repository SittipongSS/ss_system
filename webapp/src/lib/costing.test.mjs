// ระบบขอราคาต้นทุน (mig 0141) — logic ล้วน ทดสอบได้โดยไม่แตะ DB
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  approvalProgress,
  baselineTier,
  canDecideItem,
  canEditCostingRequest,
  canQuoteComponent,
  canQuoteOnRequest,
  canViewCostingRequest,
  componentUnitCost,
  deriveRequestStatusAfterApproval,
  deriveRequestStatusAfterQuote,
  isMoqTier,
  itemUnitCost,
  normalizeCostingStatus,
  pricingProgress,
  submitForPricingError,
  submitToExecError,
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

// ── ขั้นตอนการเดินใบ (PR4) ────────────────────────────────────────────
test('ส่งขอราคา: ได้เฉพาะใบร่างที่มีรายการแล้ว', () => {
  const withItem = { status: 'draft', items: [{ id: 'i1' }] };
  assert.equal(submitForPricingError(withItem), null);
  assert.match(submitForPricingError({ status: 'draft', items: [] }), /ยังไม่มีรายการสินค้า/);
  assert.match(submitForPricingError({ status: 'pricing', items: [{}] }), /เฉพาะใบที่ยังเป็นร่าง/);
  assert.match(submitForPricingError(null), /ไม่พบใบขอราคา/);
});

test('ส่งผู้บริหาร: บล็อกเมื่อยังมีบรรทัดรอราคา', () => {
  const req = {
    status: 'assembling',
    items: [{
      productLabel: 'A',
      components: [
        { sourceDept: 'RD', priceStatus: 'quoted', unitBasis: 'per_kg', pricePerKg: 1000, gramsPerUnit: 20, required: true },
        { sourceDept: 'PC', priceStatus: 'pending', unitBasis: 'per_piece', pricePerUnit: null, required: true },
      ],
    }],
  };
  assert.match(submitToExecError(req), /รอราคาอยู่ 1 รายการ/);
});

test('ส่งผู้บริหาร: บล็อกเมื่อราคาครบแต่ต้นทุนยังคำนวณไม่ได้ (เช่นลืมกรัม/ชิ้น)', () => {
  const req = {
    status: 'assembling',
    items: [{
      productLabel: 'Reed 100ml',
      // ตอบราคาแล้วแต่ไม่มีกรัม/ชิ้น → แปลงเป็นบาท/ชิ้นไม่ได้
      components: [{ sourceDept: 'RD', priceStatus: 'quoted', unitBasis: 'per_kg', pricePerKg: 1200, gramsPerUnit: null, required: true }],
    }],
  };
  assert.match(submitToExecError(req), /Reed 100ml/);
  assert.match(submitToExecError(req), /คำนวณไม่ครบ/);
});

test('ส่งผู้บริหาร: ผ่านเมื่อราคาครบและต้นทุนคำนวณได้', () => {
  const req = {
    status: 'assembling',
    items: [{
      productLabel: 'A',
      components: [
        { sourceDept: 'RD', priceStatus: 'quoted', unitBasis: 'per_kg', pricePerKg: 1000, gramsPerUnit: 20, required: true },
        { sourceDept: null, priceStatus: 'pending', unitBasis: 'per_piece', pricePerUnit: 5, required: true },
      ],
    }],
  };
  assert.equal(submitToExecError(req), null);
  // สถานะที่ยังไม่ถึงขั้นส่ง
  assert.match(submitToExecError({ ...req, status: 'draft' }), /ยังไม่อยู่ในขั้นตอน/);
});

test('ตอบราคา: เฉพาะฝ่ายเจ้าของบรรทัด — ข้ามฝ่ายไม่ได้', () => {
  const rd = { role: 'rd', department: 'RD' };
  const pc = { role: 'staff', department: 'PC' };
  const rmLine = { sourceDept: 'RD' };
  const pmLine = { sourceDept: 'PC' };
  const internal = { sourceDept: null };

  assert.equal(canQuoteComponent(rd, rmLine), true);
  assert.equal(canQuoteComponent(rd, pmLine), false, 'RD ตอบราคาบรรจุภัณฑ์ของ PC ไม่ได้');
  assert.equal(canQuoteComponent(pc, pmLine), true);
  assert.equal(canQuoteComponent(pc, rmLine), false);
  // ค่าดำเนินการภายในไม่มีใครต้องตอบ
  assert.equal(canQuoteComponent(rd, internal), false);
  // ฝ่ายขาย/ผู้บริหารตอบราคาแทนไม่ได้
  assert.equal(canQuoteComponent({ role: 'ae', team: 'KA' }, rmLine), false);
  assert.equal(canQuoteComponent({ role: 'executive' }, rmLine), false);
  // admin break-glass ได้
  assert.equal(canQuoteComponent({ role: 'admin' }, rmLine), true);
});

test('ตอบราคา: ทำได้เฉพาะจังหวะที่ใบเปิดรับราคา', () => {
  for (const status of ['pricing', 'assembling', 'returned']) {
    assert.equal(canQuoteOnRequest({ status }), true, status);
  }
  for (const status of ['draft', 'pending_exec', 'approved', 'linked', 'cancelled']) {
    assert.equal(canQuoteOnRequest({ status }), false, status);
  }
});

test('อนุมัติรายการ: เฉพาะผู้บริหาร ตอนใบรออนุมัติ และรายการยังไม่ถูกตัดสิน', () => {
  const exec = { role: 'executive' };
  const req = { status: 'pending_exec' };
  assert.equal(canDecideItem(exec, req, { approvalStatus: 'pending' }), true);
  // ตัดสินไปแล้วกดซ้ำไม่ได้
  assert.equal(canDecideItem(exec, req, { approvalStatus: 'approved' }), false);
  assert.equal(canDecideItem(exec, req, { approvalStatus: 'returned' }), false);
  // ผิดจังหวะ
  assert.equal(canDecideItem(exec, { status: 'pricing' }, { approvalStatus: 'pending' }), false);
  // คนอื่นอนุมัติไม่ได้ แม้เป็นหัวหน้าฝ่ายขาย
  for (const role of ['ae_supervisor', 'senior_ae', 'ae', 'rd', 'viewer']) {
    assert.equal(canDecideItem({ role }, req, { approvalStatus: 'pending' }), false, role);
  }
  assert.equal(canDecideItem({ role: 'admin' }, req, { approvalStatus: 'pending' }), true);
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
