import test from 'node:test';
import assert from 'node:assert/strict';

import { salesOrderWorkTrack } from './salesOrderWorkTrack.js';

const scentWithRequest = (status) => ({
  hasDesignLines: true, count: 2, blocked: null,
  existing: { id: 'RQ1', docNo: 'SB-26080002', status },
});
const readinessReady = { state: 'ready', label: 'ของครบแล้ว', total: 7, arrived: 7 };
const readinessLate = { state: 'blocked', label: 'เลยกำหนดแล้ว 2 รายการ', total: 7, arrived: 4 };
const planRunning = { state: 'running', label: 'กำลังผลิต', jobs: [{}, {}] };

const keys = (track) => track.segments.map((s) => s.key);

/* ⚠️ ทุกเทสต์ที่คาดหวังช่วง ของเข้า/ผลิต ต้องส่ง `dealType` ที่มีสายผลิตมาด้วย —
   ตั้งแต่ 2026-08-17 รูปของเส้นมาจากประเภทดีล ไม่ใช่ตรึงสามช่วงให้ทุกใบ */
const NPD = 'NPD';

/* 🔴 กฎที่ต้องอยู่ตลอด — ใบขายสินค้าธรรมดาไม่ควรเห็นช่วงที่ไม่เกี่ยวกับมัน
   (กฎเดียวกับที่การ์ดบรีฟกลิ่นเดิมซ่อนทั้งใบเมื่อไม่มีบรรทัดออกแบบกลิ่น) */
test('ใบที่ไม่ใช่งานออกแบบกลิ่น — ช่วงบรีฟกลิ่นหายไปทั้งช่วง เหลือสองช่วง', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD, approved: true,
  });
  assert.deepEqual(keys(track), ['delivery', 'production']);
});

test('ใบ NPD ที่ขายบรรทัดออกแบบกลิ่นด้วย ได้ครบสามช่วง', () => {
  const track = salesOrderWorkTrack({
    scent: scentWithRequest('pending'), readiness: readinessReady, plan: planRunning, dealType: NPD, approved: true,
  });
  assert.deepEqual(keys(track), ['scent', 'delivery', 'production']);
});

/* 🔴 "ยังไม่เชื่อม" ต้องขึ้นคำชวนกด ไม่ใช่จุดเปล่า — จุดเปล่าไม่บอกว่าต้องทำอะไรต่อ */
test('ช่วงที่ยังไม่เชื่อมขึ้นคำชวน ไม่มีจุดสเตจ', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: true, count: 2, existing: null, blocked: null },
    readiness: { state: 'unknown' },
    plan: { state: 'none' },
    projectId: 'PJ1',
    dealType: NPD,
    approved: true,
  });
  for (const seg of track.segments) {
    assert.equal(seg.steps, undefined, `${seg.key} ไม่ควรมีจุด`);
    assert.ok(seg.connect?.message, `${seg.key} ต้องมีข้อความชวน`);
  }
  assert.equal(track.segments[1].connect.href, '/sa/projects/PJ1?tab=timeline');
});

test('เปิดคำร้องไม่ได้ → ขึ้นเหตุผล ไม่ขึ้นปุ่ม', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: true, count: 0, existing: null, blocked: 'ใบนี้ยังไม่อนุมัติ' },
    readiness: readinessReady, plan: planRunning,
  });
  assert.equal(track.segments[0].connect.message, 'ใบนี้ยังไม่อนุมัติ');
  assert.equal(track.segments[0].connect.actionLabel, null);
});

/* ⚠️ ใบที่ยังไม่อนุมัติ "ยังไม่มีงานผลิต" เป็นเรื่องปกติ ไม่ใช่สิ่งที่ต้องชวนให้กด */
test('ใบที่ยังไม่อนุมัติไม่ชวนให้ไปเปิดคิวงานผลิต', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: { state: 'none' }, dealType: NPD, approved: false,
  });
  const production = track.segments.at(-1);
  assert.equal(production.connect.actionLabel, null);
  assert.match(production.connect.message, /หลังใบนี้อนุมัติ/);
});

/* 🔴 "เลยกำหนด" เป็นสุขภาพของขั้นเดียวกัน ไม่ใช่ขั้นที่สี่ — จุดต้องคงเหลือ 3 */
test('ของเข้าเลยกำหนด: จุดยังมีสามจุด แต่จุดกลางเป็นแดง', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessLate, plan: planRunning, dealType: NPD, approved: true,
  });
  const delivery = track.segments[0];
  assert.equal(delivery.steps.length, 3);
  assert.equal(delivery.state, 'late');
  assert.deepEqual(delivery.steps.map((s) => s.state), ['done', 'late', 'todo']);
});

test('ของครบแล้ว = ช่วงนั้น done ทุกจุด', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD, approved: true,
  });
  const delivery = track.segments[0];
  assert.equal(delivery.state, 'done');
  assert.deepEqual(delivery.steps.map((s) => s.state), ['done', 'done', 'live']);
});

test('คำร้องปิดเรื่องแล้ว = ช่วงบรีฟกลิ่น done', () => {
  const track = salesOrderWorkTrack({
    scent: scentWithRequest('closed'), readiness: readinessReady, plan: planRunning, approved: true,
  });
  assert.equal(track.segments[0].state, 'done');
  assert.equal(track.segments[0].steps.at(-1).state, 'live');
});

/* current = "ตอนนี้ติดอยู่ตรงไหน" ซึ่งเป็นคำถามที่เส้นนี้มีไว้ตอบ */
test('current คือช่วงแรกที่ยังไม่จบ', () => {
  const track = salesOrderWorkTrack({
    scent: scentWithRequest('closed'), readiness: readinessLate, plan: planRunning, dealType: NPD, approved: true,
  });
  assert.equal(track.current.key, 'delivery');
});

test('ทุกช่วงจบแล้ว current ตกที่ช่วงสุดท้าย ไม่ใช่ null', () => {
  const track = salesOrderWorkTrack({
    scent: scentWithRequest('closed'),
    readiness: readinessReady,
    plan: { state: 'done', label: 'ผลิตเสร็จแล้ว', jobs: [{}] },
    dealType: NPD,
    approved: true,
  });
  assert.equal(track.current.key, 'production');
});

// ── รูปของเส้นมาจากประเภทดีล (มติผู้ใช้ 2026-08-17) ────────────────────────
/* 🔴 SO ที่ขาย "ออกแบบกลิ่น" ล้วนเคยขึ้น "ยังไม่ผูกรายการของเข้า" + "ยังไม่มีงานผลิต"
   ทั้งที่ไม่มีวันมี — ทวงงานที่ไม่มีอยู่จริง คือสิ่งที่กฎนี้มาแก้ */
test('SCENT: เหลือช่วงเดียวคือบรีฟกลิ่น — ไม่มีของเข้า ไม่มีผลิต', () => {
  const track = salesOrderWorkTrack({
    scent: scentWithRequest('pending'), readiness: readinessReady, plan: planRunning,
    dealType: 'SCENT', approved: true,
  });
  assert.deepEqual(keys(track), ['scent']);
});

test('RE-ORDER: ของเข้า + ผลิต ไม่มีบรีฟกลิ่น', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning,
    dealType: 'RE-ORDER', approved: true,
  });
  assert.deepEqual(keys(track), ['delivery', 'production']);
});

/* OTHER ยังไม่นิยามสายเดินงาน — ไม่ใช่ "ตกไปใช้ของ NPD" */
test('OTHER: ไม่มีสายเดินงาน — คืน null ไม่ใช่สองช่วงเปล่า', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning,
    dealType: 'OTHER', approved: true,
  });
  assert.equal(track, null);
});

test('ประเภทดีลที่ไม่รู้จัก/ไม่มีค่า ไม่ยัดสายผลิตให้เอง', () => {
  assert.equal(salesOrderWorkTrack({}), null);
  assert.equal(salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: 'ประเภทใหม่',
  }), null);
});

/* 🔴 ภาระภาษีมาจาก *ของที่ขาย* ไม่ใช่ชนิดดีล — ตัดตามชนิดดีลเมื่อไร ใบ OTHER
   ที่ขายสินค้าในพิกัดจะไม่เหลือทางสร้างใบยื่นเลย (การ์ดล่างถอดไปแล้ว) */
test('OTHER ที่ขายสินค้าสรรพสามิต ยังเหลือช่วงสรรพสามิต ไม่ใช่เส้นว่าง', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: 'OTHER',
    excise: excise({ lines: [exciseLine('FG-1', 'approved')], eligible: true }), approved: true,
  });
  assert.deepEqual(keys(track), ['registration', 'filing']);
});

test('SCENT ที่ไม่มีบรรทัดออกแบบกลิ่นและไม่มีสรรพสามิต = ไม่มีเส้นเลย', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning,
    dealType: 'SCENT', approved: true,
  });
  assert.equal(track, null);
});

// ── สรรพสามิต (มติผู้ใช้ 2026-08-17) ──────────────────────────────────────
const exciseLine = (fgCode, registrationState) => ({ fgCode, registrationState, salesOrderLineId: `L-${fgCode}` });
const excise = (over = {}) => ({
  loading: false, schemaReady: true, filing: null, eligible: false, amountToCollect: 0, lines: [], ...over,
});

/* 🔴 ใบขายของนอกพิกัดต้องไม่เห็นเรื่องภาษีเลย — กฎเดียวกับช่วงบรีฟกลิ่น */
test('ใบที่ไม่มีสินค้าสรรพสามิต — หายทั้งสองช่วง', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [] }), approved: true,
  });
  assert.deepEqual(keys(track), ['delivery', 'production']);
});

/* 🔴 ลำดับคือใจความ — ขึ้นทะเบียนต้องอยู่ **ก่อน** ของเข้า/ผลิต เพราะทะเบียนประกาศ
   ราคาขายปลีก+ฉลากต่อสรรพสามิต ต้องอนุมัติก่อนผลิตและส่งของจริง · ยื่นชำระอยู่ท้ายสุด */
test('ขึ้นทะเบียนอยู่ก่อนของเข้า ยื่นชำระอยู่ท้ายสุด', () => {
  const track = salesOrderWorkTrack({
    scent: scentWithRequest('closed'), readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'approved')] }), approved: true,
  });
  assert.deepEqual(keys(track), ['scent', 'registration', 'delivery', 'production', 'filing']);
});

test('ยังโหลดไม่เสร็จ ยังไม่วาดช่วงสรรพสามิต — กันขึ้นว่า "ไม่เกี่ยว" ทั้งที่ยังไม่รู้', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ loading: true, lines: [exciseLine('FG-1', 'none')] }), approved: true,
  });
  assert.deepEqual(keys(track), ['delivery', 'production']);
});

test('ทุก FG ขึ้นทะเบียนแล้ว = ช่วงนั้น done (จุดสุดท้ายเป็น live ตามทรงของช่วงอื่น)', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'approved'), exciseLine('FG-2', 'approved')] }), approved: true,
  });
  const reg = track.segments.find((s) => s.key === 'registration');
  assert.equal(reg.state, 'done');
  assert.deepEqual(reg.steps.map((s) => s.state), ['done', 'done', 'live']);
  assert.equal(reg.notes, undefined, 'ไม่มีของค้าง = ไม่ต้องมีรายการชื่อ FG');
});

/* 🔴 ไม่บล็อกการสร้างใบยื่น แต่ต้องแดงและ **บอกชื่อ FG** (มติผู้ใช้ 2026-08-17) —
   ตัวนับอย่างเดียวแปลว่าคนอ่านต้องไปไล่หาเองว่าตัวไหนค้าง */
test('FG ยังไม่ขึ้นทะเบียนเลย = แดง + บอกรหัส FG + ยังชวนไปเปิดทะเบียน', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'none'), exciseLine('FG-2', 'none')] }), approved: true,
  });
  const reg = track.segments.find((s) => s.key === 'registration');
  assert.equal(reg.state, 'late');
  assert.equal(reg.connect.href, '/tax/registrations');
  assert.deepEqual(reg.notes, [
    { state: 'none', label: 'ยังไม่ขึ้นทะเบียน', count: 2, codes: ['FG-1', 'FG-2'], more: 0 },
  ]);
});

test('ยื่นขึ้นทะเบียนแล้วรอนิติกรรม = live ไม่ใช่ late — งานเดินอยู่ ไม่ใช่ของค้างฝ่ายขาย', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'pending')] }), approved: true,
  });
  const reg = track.segments.find((s) => s.key === 'registration');
  assert.equal(reg.state, 'live');
  assert.deepEqual(reg.steps.map((s) => s.state), ['done', 'live', 'todo']);
});

test('ทะเบียนถูกตีกลับ = จุดถอยกลับมาที่ร่างและเป็นแดง ไม่ใช่งอกจุดที่สี่', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'rejected')] }), approved: true,
  });
  const reg = track.segments.find((s) => s.key === 'registration');
  assert.equal(reg.steps.length, 3);
  assert.equal(reg.state, 'late');
  assert.deepEqual(reg.steps.map((s) => s.state), ['late', 'todo', 'todo']);
  assert.deepEqual(reg.notes, [
    { state: 'rejected', label: 'ทะเบียนถูกตีกลับ', count: 1, codes: ['FG-1'], more: 0 },
  ]);
});

/* 🔴 ช่วงจบเมื่อ **ทุกตัว** ผ่าน ไม่ใช่ตัวที่เร็วที่สุดผ่าน */
test('FG หลายตัวสถานะต่างกัน — จุดยืนที่ตัวที่ถอยหลังสุด', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'approved'), exciseLine('FG-2', 'pending'), exciseLine('FG-3', 'draft')] }),
    approved: true,
  });
  const reg = track.segments.find((s) => s.key === 'registration');
  assert.equal(reg.state, 'late');
  assert.equal(reg.steps[0].state, 'late');
  assert.equal(reg.meta, 'ค้าง 2/3 FG');
  /* 🔴 แยกกลุ่มตามสาเหตุ — FG-3 ร่างค้าง (งานของฝ่ายขาย) กับ FG-2 รอนิติกรรม
     (งานของฝ่ายกฎหมาย) คนละคนต้องลงมือ กองรวมป้ายเดียวคือบอกให้ไปตามงานผิดคน */
  assert.deepEqual(reg.notes, [
    { state: 'draft', label: 'ร่างค้าง ยังไม่ยื่น', count: 1, codes: ['FG-3'], more: 0 },
    { state: 'pending', label: 'รอนิติกรรมตรวจ', count: 1, codes: ['FG-2'], more: 0 },
  ]);
});

/* 🔴 ตัดรายการต้องนับให้เห็น ไม่ใช่ตัดเงียบ — "แสดง 6 ตัว" ที่ไม่บอกว่าเหลืออีกกี่ตัว
   อ่านเหมือนใบนี้มี FG ค้างแค่ 6 ตัว */
test('FG ค้างเกิน 6 ตัว — แสดง 6 แล้วบอกจำนวนที่เหลือ', () => {
  const many = Array.from({ length: 9 }, (_, i) => exciseLine(`FG-${i + 1}`, 'none'));
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: many }), approved: true,
  });
  const reg = track.segments.find((s) => s.key === 'registration');
  assert.equal(reg.notes[0].codes.length, 6);
  assert.equal(reg.notes[0].more, 3);
  assert.equal(reg.notes[0].count, 9);
});

/* 🔴 รหัส FG ในฐานข้อมูลจริงมีแท็บท้ายรหัส — ต้อง trim ก่อนขึ้นจอ */
test('รหัส FG ที่มีช่องว่างท้ายรหัส ต้องถูกตัดก่อนแสดง', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-108-01-002-0738\t\t', 'none')] }), approved: true,
  });
  const reg = track.segments.find((s) => s.key === 'registration');
  assert.deepEqual(reg.notes[0].codes, ['FG-108-01-002-0738']);
});

/* ⚠️ ใบที่ยังไม่อนุมัติ "ยังไม่มีใบยื่น" เป็นเรื่องปกติ — เหตุผลเดียวกับช่วงผลิต */
test('ใบยังไม่อนุมัติไม่ชวนให้กดสร้างใบยื่น', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'approved')], eligible: false }), approved: false,
  });
  const filing = track.segments.at(-1);
  assert.equal(filing.key, 'filing');
  assert.equal(filing.connect.actionLabel, undefined);
  assert.match(filing.connect.message, /หลังใบนี้อนุมัติ/);
});

test('พร้อมยื่น = ปุ่มสร้างใบยื่นอยู่บนเส้นเดินงาน พร้อมยอดเรียกเก็บ', () => {
  const onCreateFiling = () => {};
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'approved')], eligible: true, amountToCollect: 856, onCreateFiling }),
    approved: true,
  });
  const filing = track.segments.at(-1);
  assert.equal(filing.connect.actionLabel, 'สร้างใบยื่นชำระ');
  assert.equal(filing.connect.onClick, onCreateFiling);
  assert.equal(filing.connect.href, undefined, 'ปุ่มสร้างต้องเป็น onClick ไม่ใช่ลิงก์');
  assert.match(filing.meta, /856/);
});

test('มีใบยื่นแล้ว = รางขั้นของโมดูลภาษี + ลิงก์เปิดใบยื่น', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'approved')], filing: { id: 'ORD-9', status: 'received' } }),
    approved: true,
  });
  const filing = track.segments.at(-1);
  assert.equal(filing.state, 'live');
  assert.equal(filing.link.href, '/tax/filings/ORD-9');
  assert.deepEqual(filing.steps.map((s) => s.state), ['done', 'done', 'live', 'todo', 'todo', 'todo']);
});

/* 🪤 ระบบยอมให้สร้างใบยื่นทั้งที่ทะเบียนยังไม่อนุมัติ ⇒ ใบที่ยื่นแล้วยังต้องเห็นว่าทะเบียนค้าง */
test('สร้างใบยื่นแล้วแต่ทะเบียนยังค้าง — ช่วงขึ้นทะเบียนยังต้องแดงอยู่', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'draft')], filing: { id: 'ORD-9', status: 'pending' } }),
    approved: true,
  });
  const reg = track.segments.find((s) => s.key === 'registration');
  assert.equal(reg.state, 'late');
  assert.deepEqual(reg.notes[0].codes, ['FG-1']);
});

test('current ชี้ช่วงขึ้นทะเบียนเมื่อทะเบียนค้าง แม้ของเข้า/ผลิตจะเดินไปแล้ว', () => {
  const track = salesOrderWorkTrack({
    scent: { hasDesignLines: false }, readiness: readinessReady, plan: planRunning, dealType: NPD,
    excise: excise({ lines: [exciseLine('FG-1', 'none')] }), approved: true,
  });
  assert.equal(track.current.key, 'registration');
});
