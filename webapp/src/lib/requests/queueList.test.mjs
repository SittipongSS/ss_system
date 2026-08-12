// ── กรอง/จัดกลุ่ม/เรียง รายการคำร้อง (แบบ จ — โครงเดียวกับหน้ารายการดีล) ──
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FACET_NONE, REQUEST_GROUP_OPTIONS, REQUEST_SORT_OPTIONS, filterRequestRows,
  groupRequestRows, requestFacet, requestFacetOptions, requestFilterCount,
  requestSortDefaultDir, sortRequestRows,
} from './queueList.js';

const req = (over = {}) => ({
  id: 'DR-1', status: 'acknowledged', dept: 'RD', kind: 'material_price',
  customerId: 'C1', customerName: 'ลอรีอัล', acknowledgedAt: '2026-08-01', ...over,
});

test('มิติหนึ่งใบ — คืน key/label เสมอ ไม่มีเคสคืน null', () => {
  assert.deepEqual(requestFacet(req(), 'dept'), { key: 'RD', label: 'RD' });
  assert.equal(requestFacet(req({ kind: 'scent_dev' }), 'kind').key, 'scent_dev');
  // ป้ายชนิดมาจากทะเบียน ไม่ใช่รหัสดิบ
  assert.notEqual(requestFacet(req({ kind: 'scent_dev' }), 'kind').label, 'scent_dev');
  assert.equal(requestFacet(req({ dept: '' }), 'dept').key, FACET_NONE);
  assert.equal(requestFacet({}, 'ไม่รู้จัก').key, FACET_NONE);
});

test('⭐ ลูกค้าเทียบด้วย id ก่อนชื่อ — ชื่อพิมพ์คนละแบบต้องไม่แตกเป็นสองกลุ่ม', () => {
  const a = req({ customerId: 'C1', customerName: 'บจก. เอ' });
  const b = req({ customerId: 'C1', customerName: 'บริษัท เอ จำกัด' });
  assert.equal(requestFacet(a, 'customer').key, requestFacet(b, 'customer').key);
  // ไม่มี id → ถอยไปใช้ชื่อที่ normalize แล้ว (ตัวพิมพ์ไม่ทำให้แตกกลุ่ม)
  const noId = (name) => requestFacet(req({ customerId: null, customerName: name }), 'customer').key;
  assert.equal(noId('Loreal'), noId('LOREAL'));
  assert.equal(requestFacet(req({ customerId: null, customerName: '' }), 'customer').key, FACET_NONE);
});

test('ผู้รับเรื่อง = คนที่กดรับ · ยังไม่มีคนรับเป็นตัวเลือกจริง ไม่ใช่ null', () => {
  assert.equal(requestFacet(req({ acknowledgedById: 'U1', acknowledgedByName: 'ปกิตา' }), 'owner').key, 'U1');
  const none = requestFacet(req(), 'owner');
  assert.equal(none.key, FACET_NONE);
  assert.equal(none.label, 'ยังไม่มีคนรับ');
});

test('⭐ โครงการ — ป้ายมาจากรหัส+ชื่อที่ API แนบมา ไม่ใช่ uuid', () => {
  const withProject = req({ projectId: 'P-1', projectCode: 'PJ-001', projectName: 'ชุดของขวัญปีใหม่' });
  assert.deepEqual(requestFacet(withProject, 'project'),
    { key: 'P-1', label: 'PJ-001 — ชุดของขวัญปีใหม่' });
  // ใบที่ผูกโครงการที่โดนลบไปแล้ว (มี id ไม่มีชื่อ) ต้องยังเป็นกลุ่มของตัวเอง
  const orphan = requestFacet(req({ projectId: 'P-9' }), 'project');
  assert.equal(orphan.key, 'P-9');
  assert.notEqual(orphan.key, FACET_NONE, 'ผูกโครงการอยู่ ไม่ใช่ "ไม่ผูกโครงการ"');
  assert.equal(requestFacet(req({ projectId: null }), 'project').key, FACET_NONE);
  assert.equal(requestFacet(req({ projectId: null }), 'project').label, 'ไม่ผูกโครงการ');
  // มีแค่ชื่อหรือแค่รหัสก็อ่านออก
  assert.equal(requestFacet(req({ projectId: 'P-2', projectName: 'ชุด A' }), 'project').label, 'ชุด A');
  assert.equal(requestFacet(req({ projectId: 'P-3', projectCode: 'PJ-003' }), 'project').label, 'PJ-003');
});

test('⭐ ตัวเลือกในแผงกรองสร้างจากแถวจริง — ไม่ใช่ทะเบียนทั้งก้อน', () => {
  const rows = [req(), req({ id: '2' }), req({ id: '3', dept: 'PC' })];
  const options = requestFacetOptions(rows, 'dept');
  assert.deepEqual(options.map((o) => o.value), ['PC', 'RD']);
  assert.match(options.find((o) => o.value === 'RD').label, /\(2\)/);
  // ชนิดที่ไม่มีใบเลยต้องไม่โผล่ (กดแล้วได้ตารางว่างเสมอ)
  assert.equal(requestFacetOptions(rows, 'kind').length, 1);
  // "ไม่ระบุ…" อยู่ท้ายสุดเสมอ
  const mixed = requestFacetOptions([...rows, req({ id: '4', dept: '' })], 'dept');
  assert.equal(mixed.at(-1).value, FACET_NONE);
});

test('⭐ ในหมวดเดียวกัน = หรือ · ข้ามหมวด = และ · หมวดว่าง = ไม่กรอง', () => {
  const rows = [
    req({ id: 'A', dept: 'RD', kind: 'material_price' }),
    req({ id: 'B', dept: 'PC', kind: 'material_price' }),
    req({ id: 'C', dept: 'RD', kind: 'scent_dev' }),
  ];
  assert.deepEqual(filterRequestRows(rows, {}).map((r) => r.id), ['A', 'B', 'C']);
  assert.deepEqual(filterRequestRows(rows, { dept: [] }).map((r) => r.id), ['A', 'B', 'C']);
  assert.deepEqual(filterRequestRows(rows, { dept: ['RD', 'PC'] }).map((r) => r.id), ['A', 'B', 'C']);
  assert.deepEqual(
    filterRequestRows(rows, { dept: ['RD'], kind: ['material_price'] }).map((r) => r.id),
    ['A'],
  );
  assert.equal(requestFilterCount({ dept: ['RD'], kind: ['a', 'b'] }), 3);
  assert.equal(requestFilterCount({}), 0);
});

test('⭐ ใบที่ไม่มีค่าในคีย์ที่เรียง ไปท้ายเสมอ ไม่ว่าทิศไหน', () => {
  const rows = [
    req({ id: 'ว่าง', committedDueDate: null }),
    req({ id: 'ช้า', committedDueDate: '2026-08-20' }),
    req({ id: 'เร็ว', committedDueDate: '2026-08-02' }),
  ];
  assert.deepEqual(sortRequestRows(rows, { key: 'due', dir: 'asc' }).map((r) => r.id),
    ['เร็ว', 'ช้า', 'ว่าง']);
  assert.deepEqual(sortRequestRows(rows, { key: 'due', dir: 'desc' }).map((r) => r.id),
    ['ช้า', 'เร็ว', 'ว่าง']);
});

test('เรียงแล้วไม่แก้ของเดิมในที่ · ใบที่เท่ากันคงลำดับเดิม (เสถียร)', () => {
  const rows = [req({ id: 'A' }), req({ id: 'B' }), req({ id: 'C' })];
  const before = rows.map((r) => r.id);
  const sorted = sortRequestRows(rows, { key: 'due' });
  assert.deepEqual(rows.map((r) => r.id), before, 'ห้ามสลับ array ที่ผู้เรียกส่งมา');
  assert.deepEqual(sorted.map((r) => r.id), ['A', 'B', 'C']);
});

test('ค่าตั้งต้นคือความเร่ง — ใบที่ยังไม่มีใครรับขึ้นก่อนตามคำโปรยของหน้า', () => {
  const rows = [
    req({ id: 'รับแล้ว', acknowledgedAt: '2026-08-01', committedDueDate: '2026-08-30' }),
    req({ id: 'ยังไม่รับ', status: 'pending', acknowledgedAt: null, submittedAt: '2026-08-09' }),
  ];
  assert.equal(sortRequestRows(rows, { key: 'urgency' })[0].id, 'ยังไม่รับ');
  assert.equal(REQUEST_SORT_OPTIONS[0].key, 'urgency');
  assert.equal(requestSortDefaultDir('urgency'), 'asc');
  assert.equal(requestSortDefaultDir('created'), 'desc', 'เปิดล่าสุด = ใหม่ก่อน');
});

test('⭐ จัดกลุ่มยึดลำดับแถวที่เรียงมาแล้ว · กลุ่ม "ไม่ระบุ" ไปท้าย', () => {
  const rows = [
    req({ id: 'A', dept: 'RD' }),
    req({ id: 'B', dept: '' }),
    req({ id: 'C', dept: 'PC' }),
    req({ id: 'D', dept: 'RD' }),
  ];
  assert.equal(groupRequestRows(rows, 'none'), null);
  assert.equal(groupRequestRows(rows, null), null);
  const groups = groupRequestRows(rows, 'dept');
  assert.deepEqual(groups.map((g) => g.key), ['RD', 'PC', FACET_NONE]);
  assert.deepEqual(groups[0].rows.map((r) => r.id), ['A', 'D']);
  // ผลรวมของทุกกลุ่มต้องเท่าจำนวนแถวที่ส่งเข้าไป — ไม่มีใบไหนหายระหว่างจัดกลุ่ม
  assert.equal(groups.reduce((n, g) => n + g.rows.length, 0), rows.length);
});

test('ทุกตัวเลือกจัดกลุ่มต้องจัดกลุ่มได้จริง — กันตัวเลือกที่ไม่มีคนรองรับ', () => {
  const rows = [
    req({ projectId: 'P-1', projectName: 'ชุด A' }),
    req({ id: '2', dept: 'PC', kind: 'scent_dev', customerId: 'C2', acknowledgedById: 'U9', projectId: 'P-2', projectName: 'ชุด B' }),
  ];
  for (const option of REQUEST_GROUP_OPTIONS) {
    if (option.value === 'none') continue;
    const groups = groupRequestRows(rows, option.value);
    assert.equal(groups.length, 2, `${option.value} ต้องแยกได้สองกลุ่ม`);
    for (const g of groups) assert.ok(g.label, `${option.value} ต้องมีป้ายกลุ่ม`);
  }
});

// ── รหัสลูกค้า (AR) คู่ชื่อกิจการ (IS-26080003) ────────────────────────────
// ⭐ มติผู้ใช้: "เลข AR ในตาราง เอาไว้ใต้ชื่อเล็ก ๆ ทุกตารางถ้ามีโชว์" — คิวคำร้อง
// จัดกลุ่ม/กรองตามลูกค้าได้ แต่เห็นแค่ชื่อกิจการ ⇒ เชื่อมกับรหัสกลิ่น/MU ไม่ได้
const withAr = (over = {}) => req({ customerArCode: 'AR-1001', ...over });

test('รหัส AR มาเป็น sub ของมิติลูกค้า — ไม่ใช่ส่วนหนึ่งของคีย์', () => {
  const facet = requestFacet(withAr(), 'customer');
  assert.equal(facet.sub, 'AR-1001');
  // ⚠️ ใบเก่าที่โหลดมาก่อนออกรหัส ต้องยังอยู่กลุ่มเดียวกับใบใหม่ของลูกค้ารายเดิม
  assert.equal(facet.key, requestFacet(req({ customerArCode: null }), 'customer').key);
  // ลูกค้าที่ยังไม่ได้ออกรหัส = ไม่มีบรรทัดเล็ก (ไม่ใช่ช่องว่างไปวาดบนจอ)
  assert.equal(requestFacet(req({ customerArCode: '   ' }), 'customer').sub, null);
  // มิติอื่นไม่มี sub ติดมาด้วย
  assert.equal(requestFacet(withAr(), 'dept').sub, undefined);
});

test('หัวกลุ่มลูกค้าพารหัส AR ไปด้วย แม้ใบแรกของกลุ่มจะยังไม่มีรหัส', () => {
  const [group] = groupRequestRows([
    req({ id: 'DR-1', customerArCode: null }),
    withAr({ id: 'DR-2' }),
  ], 'customer');
  assert.equal(group.rows.length, 2, 'ต้องเป็นกลุ่มเดียวกัน');
  assert.equal(group.sub, 'AR-1001');
});

test('เมนูกรองลูกค้าต่อท้ายรหัส AR — ชื่อบริษัทคล้ายกันจะได้แยกออก', () => {
  const [option] = requestFacetOptions([withAr(), withAr({ id: 'DR-2' })], 'customer');
  assert.equal(option.label, 'ลอรีอัล · AR-1001 (2)');
  // ไม่มีรหัส = ป้ายเหมือนเดิมทุกตัวอักษร
  assert.equal(requestFacetOptions([req()], 'customer')[0].label, 'ลอรีอัล (1)');
});
