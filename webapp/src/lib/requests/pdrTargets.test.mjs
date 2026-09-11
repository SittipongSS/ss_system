// ── PDR 2.2/2.3 · ต้นทุน/ราคาขายรายสินค้า (mig 0229) ─────────────────────
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_PDR_TARGETS, PDR_TARGET_SPEC, emptyPdrTarget, normalizePdrTargets, pdrTargetFilled,
  pdrTargetScentError, pdrTargetValuesFrom, pdrTargetsProgress, pdrTargetsScentCount,
  pdrTargetsSubmitError,
} from './pdrTargets.js';

// ข้อ 2.1/2.4–2.7 ที่ยังไม่กรอก (mig 0352) — แถวที่ normalize แล้วมีคีย์ครบเสมอ
const BLANK_SPEC = {
  scentId: null, moqValue: null, moqUnit: null, texture: null, color: null,
  sizeValue: null, sizeUnit: null, qtyValue: null, qtyUnit: null, note: null,
};

test('แถวปกติ — สวิตช์เปิดแล้วเก็บรายละเอียดกับราคา · ลูกน้ำหลักพันรับได้', () => {
  const { targets, error } = normalizePdrTargets([
    {
      categoryCode: '02-010', fOn: true, fNote: 'เข้มข้น 20%', fPricePerKg: '1,200.50',
      fbOn: false, pricePerUnit: '590',
    },
  ]);
  assert.equal(error, null);
  assert.equal(targets.length, 1);
  assert.deepEqual(targets[0], {
    sortOrder: 1, categoryCode: '02-010',
    fOn: true, fNote: 'เข้มข้น 20%', fPricePerKg: 1200.5,
    fbOn: false, fbNote: null, fbPricePerKg: null,
    pricePerUnit: 590,
    ...BLANK_SPEC,
  });
});

test('⭐ ซ้ำหมวดได้ — สินค้าหมวดเดียวกันคนละสเปกคนละต้นทุน (มติผู้ใช้)', () => {
  const { targets, error } = normalizePdrTargets([
    { categoryCode: '02-010', fOn: true, fPricePerKg: '1200' },
    { categoryCode: '02-010', fOn: true, fPricePerKg: '1400' },
  ]);
  assert.equal(error, null);
  assert.deepEqual(targets.map((t) => t.fPricePerKg), [1200, 1400]);
  assert.deepEqual(targets.map((t) => t.sortOrder), [1, 2]);
});

test('⚠️ ปิดสวิตช์แล้วค่าที่เคยกรอกต้องถูกล้าง ไม่ค้างไปโผล่บนกระดาษ', () => {
  const { targets } = normalizePdrTargets([
    { categoryCode: '02-010', fOn: false, fNote: 'ของเก่าที่ค้างอยู่', fPricePerKg: '999' },
  ]);
  assert.equal(targets[0].fNote, null);
  assert.equal(targets[0].fPricePerKg, null);
});

test('หมวดต้องอยู่ในข้อ 1.11 — เอาหมวดออกจาก 1.11 แล้วแถวที่ค้างต้องถูกทัก', () => {
  const rows = [{ categoryCode: '02-999', fOn: true, fPricePerKg: '10' }];
  assert.match(normalizePdrTargets(rows, { categoryCodes: ['02-010'] }).error, /ข้อ 1\.11/);
  // ไม่ส่งรายการหมวดมา = ไม่ตรวจ (ใบเก่าที่ 1.11 ยังว่าง)
  assert.equal(normalizePdrTargets(rows).error, null);
  assert.equal(normalizePdrTargets(rows, { categoryCodes: ['02-999'] }).error, null);
});

test('ตัวเลขอ่านไม่ออก/ติดลบ ต้องบอกว่าแถวไหนช่องไหน', () => {
  const kg = normalizePdrTargets([{ categoryCode: '01-001', fOn: true, fPricePerKg: '1,200.-' }]).error;
  assert.match(kg, /รายการที่ 1/);
  assert.match(kg, /บาท\/Kg/);
  assert.match(kg, /1,200\.-/);

  const unit = normalizePdrTargets([{ categoryCode: '01-001', pricePerUnit: '-5' }]).error;
  assert.match(unit, /บาท\/ชิ้น/);
  assert.match(unit, /ไม่ติดลบ/);

  const fb = normalizePdrTargets([{ categoryCode: '01-001', fbOn: true, fbPricePerKg: 'สามพัน' }]).error;
  assert.match(fb, /เนื้อสาร \(FB\)/);
});

test('ด่านอื่น: ไม่เลือกหมวด · รายละเอียดยาวเกิน · เกินจำนวนแถว', () => {
  assert.match(normalizePdrTargets([{ categoryCode: '  ' }]).error, /ยังไม่ได้เลือกประเภทสินค้า/);
  assert.match(
    normalizePdrTargets([{ categoryCode: '01-001', fOn: true, fNote: 'ก'.repeat(201) }]).error,
    /ยาวเกิน 200/,
  );
  const many = Array.from({ length: MAX_PDR_TARGETS + 1 }, () => ({ categoryCode: '01-001' }));
  assert.match(normalizePdrTargets(many).error, new RegExp(`สูงสุด ${MAX_PDR_TARGETS}`));
});

test('ใบที่ยังไม่กรอกอะไรเลยต้องบันทึกได้ — ไม่มีแถวไหนบังคับ', () => {
  assert.deepEqual(normalizePdrTargets([]), { targets: [], error: null });
  assert.deepEqual(normalizePdrTargets(null), { targets: [], error: null });
  assert.equal(normalizePdrTargets([{ categoryCode: '02-010' }]).error, null);
});

// 🐞 เจอตอนกดบันทึกจริง: route ประกอบแถวเป็น `{ id: DPT-…, requestId, ...t }` ⇒ ถ้า
// ตัวแปลงคืน `id` ติดมาด้วย มันจะทับ id ที่เพิ่งสร้าง (เป็น null) แล้ว insert ตกที่
// PRIMARY KEY ⇒ ทั้งใบพังเป็น 500 โดยหน้าจอบอกแค่ "บันทึกไม่สำเร็จ"
test('⭐ ผลลัพธ์ต้องไม่มีคีย์ `id` ติดมา — id เป็นของฝั่งที่เขียนลง DB เท่านั้น', () => {
  const { targets } = normalizePdrTargets([
    { id: 'DPT-เก่า', categoryCode: '02-010', fOn: true, fPricePerKg: '10' },
    { categoryCode: '02-010' },
  ]);
  for (const row of targets) {
    assert.equal(Object.hasOwn(row, 'id'), false, `แถวยังมีคีย์ id: ${JSON.stringify(row)}`);
  }
});

test('ทางกลับ: แถวจาก DB → ค่าฟอร์ม เป็นสตริงทุกช่องยกเว้นสวิตช์', () => {
  const values = pdrTargetValuesFrom({
    id: 'DPT-1', categoryCode: '02-010', fOn: true, fNote: null, fPricePerKg: 1200.5,
    fbOn: false, fbNote: null, fbPricePerKg: null, pricePerUnit: 590,
  });
  assert.deepEqual(values, {
    id: 'DPT-1', categoryCode: '02-010',
    fOn: true, fNote: '', fPricePerKg: '1200.5',
    fbOn: false, fbNote: '', fbPricePerKg: '',
    pricePerUnit: '590',
    // แถวเก่า (ก่อน 0352) ไม่มีสเปก — ตัวเลขว่าง · หน่วยตั้งต้นรอไว้ (ไม่ถูกบันทึกจนกว่าจะมีตัวเลข)
    scentId: '', moqValue: '', moqUnit: 'ชิ้น', texture: '', color: '',
    sizeValue: '', sizeUnit: 'ml', qtyValue: '', qtyUnit: 'ชิ้น', note: '',
  });
  // แถวเปล่าของฟอร์มต้องผ่านด่านได้ทันทีหลังกดปุ่มเพิ่ม
  assert.equal(normalizePdrTargets([emptyPdrTarget('02-010')]).error, null);
});

test('เกจนับเฉพาะแถวที่กรอกจริง — กดเพิ่มเฉย ๆ ยังไม่นับ', () => {
  assert.equal(pdrTargetFilled(emptyPdrTarget('02-010')), false);
  assert.equal(pdrTargetFilled({ categoryCode: '01-001', fOn: true }), true);
  assert.equal(pdrTargetFilled({ categoryCode: '01-001', pricePerUnit: '590' }), true);
  assert.deepEqual(
    pdrTargetsProgress([emptyPdrTarget('01-001'), { categoryCode: '01-002', fbOn: true }]),
    { total: 2, filled: 1 },
  );
});

// ── ข้อ 2.x รายสินค้า (มติผู้ใช้ 2026-09-11 · mig 0352) ───────────────────────

test('⭐ ทุกคีย์ของแถวเดินครบวง: ฟอร์ม → normalize → DB → ฟอร์ม ไม่มีคีย์ไหนหายเงียบ', () => {
  // 🔴 PATCH ลบแล้ว insert แถวใหม่ด้วยคีย์ที่ normalizer คืน ⇒ คีย์ที่ตกหล่นตัวใดตัวหนึ่ง
  //    ใน 3 ที่ (แถวเปล่า · ทางกลับ · normalizer) = ค่าที่คนพิมพ์หายตอนกดบันทึกครั้งถัดไป
  const filled = {
    ...emptyPdrTarget('02-010'),
    scentId: 'SC-1', moqValue: '1,000', moqUnit: 'ขวด', texture: 'premium', color: 'ใส',
    sizeValue: '50', sizeUnit: 'ml', qtyValue: '3', qtyUnit: 'ชิ้น', note: 'ขวดแก้วฝาไม้',
  };
  const { targets, error } = normalizePdrTargets([filled], { pickScent: true });
  assert.equal(error, null);
  const back = pdrTargetValuesFrom({ id: 'DPT-9', ...targets[0] });
  for (const f of PDR_TARGET_SPEC) {
    const keys = f.type === 'amount' ? [f.valueField, f.unitField] : [f.field];
    for (const k of keys) {
      assert.ok(Object.hasOwn(emptyPdrTarget(), k), `แถวเปล่าไม่มี ${k}`);
      assert.ok(Object.hasOwn(targets[0], k), `normalizer ไม่คืน ${k}`);
      assert.notEqual(back[k], '', `ทางกลับทำ ${k} หาย`);
    }
  }
  assert.equal(back.moqValue, '1000');
  assert.equal(back.scentId, 'SC-1');
});

test('สเปกรายสินค้า: ตัวเลขไม่ติดลบ · หน่วยต้องอยู่ในลิสต์ · หน่วยไม่มีตัวเลข = ไม่เก็บ', () => {
  const row = (over) => normalizePdrTargets([{ categoryCode: '01-001', ...over }]);
  assert.match(row({ sizeValue: '-5' }).error, /ขนาดบรรจุ ต้องเป็นตัวเลขไม่ติดลบ/);
  assert.match(row({ qtyValue: 'สามขวด' }).error, /จำนวนต่อกลิ่น ต้องเป็นตัวเลข/);
  assert.match(row({ sizeValue: '50', sizeUnit: 'ถัง' }).error, /หน่วยของขนาดบรรจุ "ถัง" ไม่อยู่ในลิสต์/);
  // ⚠️ หน่วยตั้งต้นที่ฟอร์มเติมให้ทุกแถว ต้องไม่ถูกบันทึกเมื่อยังไม่มีตัวเลข
  const blank = row({ sizeUnit: 'ml', qtyUnit: 'ชิ้น' }).targets[0];
  assert.equal(blank.sizeUnit, null);
  assert.equal(blank.qtyUnit, null);
  assert.match(row({ texture: 'silky' }).error, /ลักษณะเนื้อผลิตภัณฑ์ ไม่ถูกต้อง/);
  assert.equal(row({ texture: 'standard' }).targets[0].texture, 'standard');
  assert.match(row({ color: 'ก'.repeat(201) }).error, /สีเนื้อผลิตภัณฑ์ ยาวเกิน 200/);
  assert.match(row({ note: 'ก'.repeat(501) }).error, /หมายเหตุ ยาวเกิน 500/);
});

test('⭐ กลิ่นรายแถวเก็บเฉพาะรูปทรงที่เลือกกลิ่นจากทะเบียน — ที่อื่นล้างทิ้ง', () => {
  // ใบพัฒนากลิ่นไม่มีช่องนี้ ค่าที่หลุดมาจะไปโผล่บนกระดาษเหมือนใบนี้ขอกลิ่นเดิม
  assert.equal(normalizePdrTargets([{ categoryCode: '01-001', scentId: 'SC-1' }]).targets[0].scentId, null);
  assert.equal(
    normalizePdrTargets([{ categoryCode: '01-001', scentId: ' SC-1 ' }], { pickScent: true }).targets[0].scentId,
    'SC-1',
  );
  // ⭐ ร่างเว้นว่างได้ — ด่านอยู่ตอนกดส่ง (`pdrTargetsSubmitError`) ไม่ใช่ตอนบันทึก
  assert.equal(normalizePdrTargets([{ categoryCode: '01-001' }], { pickScent: true }).error, null);
});

test('⭐ ด่านกดส่งของ NPD: ต้องมีสินค้า ≥ 1 และทุกแถวต้องมีกลิ่น', () => {
  assert.match(pdrTargetsSubmitError([]), /อย่างน้อย 1 รายการ/);
  assert.match(pdrTargetsSubmitError(null), /อย่างน้อย 1 รายการ/);
  assert.match(
    pdrTargetsSubmitError([{ scentId: 'SC-1' }, { scentId: '' }]),
    /รายการที่ 2 ยังไม่ได้เลือกกลิ่น/,
  );
  assert.equal(pdrTargetsSubmitError([{ scentId: 'SC-1' }, { scentId: 'SC-2' }]), null);
});

test('⭐ กลิ่นที่อ้างต้องมีจริง · ของลูกค้าเจ้าของใบ · ใช้ทำสูตรได้', () => {
  const scents = [
    { id: 'SC-1', code: 'S001', name: 'มะลิ', customerId: 'C-1', status: 'active' },
    { id: 'SC-2', code: 'S002', name: 'กุหลาบ', customerId: 'C-2', status: 'active' },
    { id: 'SC-3', code: 'S003', name: 'ร่าง', customerId: 'C-1', status: 'draft' },
  ];
  const at = (scentId) => pdrTargetScentError([{ scentId }], scents, { customerId: 'C-1' });
  assert.equal(at('SC-1'), null);
  assert.match(at('SC-9'), /ไม่พบกลิ่นนี้ในทะเบียน/);
  // มติ 9: กลิ่นข้ามลูกค้าไม่ได้ — ตัวกรองบนจอไม่กันคนยิง API ตรง
  assert.match(at('SC-2'), /S002 เป็นของลูกค้ารายอื่น/);
  assert.match(at('SC-3'), /S003 ยังใช้ทำสูตรไม่ได้/);
  assert.equal(pdrTargetScentError([{ scentId: null }], scents, { customerId: 'C-1' }), null);
});

test('1.12 จำนวนกลิ่นของใบ NPD = กลิ่นไม่ซ้ำในแถวสินค้า · ยังไม่เลือก = ยังไม่รู้', () => {
  assert.equal(pdrTargetsScentCount([{ scentId: 'A' }, { scentId: 'A' }, { scentId: 'B' }]), 2);
  assert.equal(pdrTargetsScentCount([{ scentId: '' }]), null);
  assert.equal(pdrTargetsScentCount([]), null);
});

test('เกจนับสเปกรายสินค้าด้วย แต่หน่วยตั้งต้นอย่างเดียวไม่นับ', () => {
  assert.equal(pdrTargetFilled({ ...emptyPdrTarget('01-001') }), false, 'หน่วยตั้งต้นไม่ใช่การกรอก');
  assert.equal(pdrTargetFilled({ ...emptyPdrTarget('01-001'), sizeValue: '50' }), true);
  assert.equal(pdrTargetFilled({ ...emptyPdrTarget('01-001'), scentId: 'SC-1' }), true);
  assert.equal(pdrTargetFilled({ ...emptyPdrTarget('01-001'), note: 'ฝาไม้' }), true);
});

test('สิทธิ์ไม่ตรวจกลิ่นซ้ำเป็นของ "แถวเดิมที่ถือกลิ่นเดิม" และใช้ได้ครั้งเดียวต่อแถว', async () => {
  const { pdrTargetKeep } = await import('./pdrTargetScents.js');
  const keep = pdrTargetKeep([{ id: 'DPT-1', scentId: 'SC-old' }], [{ id: 'DPT-1' }, { id: 'DPT-1' }, {}]);
  assert.equal(keep({ scentId: 'SC-old' }, 0), true, 'แถวเดิม กลิ่นเดิม');
  assert.equal(keep({ scentId: 'SC-old' }, 1), false, 'id เดิมซ้ำในแถวที่สอง = ไม่ได้สิทธิ์');
  assert.equal(keep({ scentId: 'SC-old' }, 2), false, 'แถวใหม่หยิบกลิ่นเดิมมาใช้ต้องโดนตรวจ');
  const keep2 = pdrTargetKeep([{ id: 'DPT-1', scentId: 'SC-old' }], [{ id: 'DPT-1' }]);
  assert.equal(keep2({ scentId: 'SC-new' }, 0), false, 'แถวเดิมที่เปลี่ยนกลิ่น = กลิ่นใหม่ต้องโดนตรวจ');
});
