// ── /sahamit/po: ตัวกรองสถานะ = คำบนป้ายในตาราง (ตรวจตัวกรองทั้งระบบ 08/10 · H7) ─────────────────
//
// 🐞 ตัวกรองใช้ `poRollupStatus` (รอส่ง/ส่งบางส่วน/ส่งครบ) ส่วนป้ายใช้ขั้นผลิตจากบรรทัดวัสดุ (รอวัสดุ/…/ปิดงาน)
//    ⇒ คำบนตัวเลือกไม่มีบนป้ายสักใบ (ของจริง 19/10: 112/112 ใบไม่ตรง) · ใบที่ปิดงานแล้วถูกจัดเป็น "รอส่ง"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { poDisplayStatus, poRollupStatus, poStatusOptions, PO_STATUS_LABEL } from './po.js';

const po = (poNumber, lineStatuses) => ({
  id: poNumber, poNumber, lines: lineStatuses.map((status, i) => ({ id: `${poNumber}-${i}`, status })),
});
// แถวของ /api/sahamit/material = บรรทัดที่ยังไม่ยกเลิก + การติดตามวัสดุ
const mat = (poNumber, status, arrived = false) => ({
  poNumber, status, tracking: arrived ? { pmArrivedAt: '2026-10-01', rmArrivedAt: '2026-10-02' } : null,
});

const pos = [
  po('PO-WAIT', ['open', 'open']),
  po('PO-READY', ['open']),
  po('PO-MADE', ['produced']),
  po('PO-SENT', ['delivered', 'delivered']),
  po('PO-CLOSED', ['closed', 'closed']),
  po('PO-CXL', ['cancelled']),
  po('PO-EMPTY', []),
];
const material = [
  mat('PO-WAIT', 'open'), mat('PO-WAIT', 'open', true),
  mat('PO-READY', 'open', true),
  mat('PO-MADE', 'produced', true),
  mat('PO-SENT', 'delivered', true), mat('PO-SENT', 'delivered', true),
  mat('PO-CLOSED', 'closed', true), mat('PO-CLOSED', 'closed', true),
];
const byPo = (rows) => {
  const m = new Map();
  for (const r of rows) m.set(r.poNumber, [...(m.get(r.poNumber) || []), r]);
  return m;
};

test('🔴 ป้ายของใบ: ขั้นผลิตจากบรรทัดวัสดุ · ไม่มีบรรทัดวัสดุ = สถานะส่งของของตัว PO', () => {
  const m = byPo(material);
  const label = (p) => poDisplayStatus(p, m.get(p.poNumber)).label;
  assert.deepEqual(Object.fromEntries(pos.map((p) => [p.poNumber, label(p)])), {
    'PO-WAIT': 'รอวัสดุ', 'PO-READY': 'พร้อมผลิต', 'PO-MADE': 'ผลิตเสร็จ', 'PO-SENT': 'ส่งแล้ว',
    'PO-CLOSED': 'ปิดงาน', 'PO-CXL': 'ยกเลิก', 'PO-EMPTY': 'รอส่ง',
  });
  // 🐞 ของเดิม: ตัวกรองจัดใบที่ปิดงานแล้วเป็น "รอส่ง"
  assert.equal(PO_STATUS_LABEL[poRollupStatus(pos.find((p) => p.poNumber === 'PO-CLOSED'))], 'รอส่ง');
});

test('🔴 ตัวเลือกตัวกรอง = คำบนป้ายที่มีจริง · เลือกคำไหนได้แถวที่ป้ายเขียนคำนั้นทุกแถว', () => {
  const m = byPo(material);
  const shown = pos.map((p) => ({ p, s: poDisplayStatus(p, m.get(p.poNumber)) }));
  const options = poStatusOptions(shown.map((x) => x.s));
  assert.deepEqual(options.map((o) => o.label), ['รอวัสดุ', 'พร้อมผลิต', 'ผลิตเสร็จ', 'ส่งแล้ว', 'ปิดงาน', 'รอส่ง', 'ยกเลิก']);
  for (const option of options) {
    // ตัวกรองของหน้า: `statusSel.includes(statusOf(po).label)`
    const picked = shown.filter((x) => [option.value].includes(x.s.label));
    assert.ok(picked.length > 0, option.label);
    assert.ok(picked.every((x) => x.s.label === option.label), `${option.label}: ทุกแถวที่ได้ต้องมีป้ายคำนั้น`);
  }
});

test('สายวัสดุโหลดไม่ขึ้น — ป้ายกับตัวเลือกถอยไปสถานะส่งของพร้อมกัน (ยังเป็นคำเดียวกัน)', () => {
  const shown = pos.map((p) => poDisplayStatus(p, []));
  assert.deepEqual(poStatusOptions(shown).map((o) => o.label), ['รอส่ง', 'ส่งครบ', 'ยกเลิก']);
  assert.equal(poDisplayStatus(pos[0], undefined).label, 'รอส่ง');
});

test('คำซ้ำจากสองแหล่ง ("ยกเลิก") เป็นตัวเลือกเดียว', () => {
  const options = poStatusOptions([
    { key: 'stage:cancelled', label: 'ยกเลิก' }, { key: 'po:cancelled', label: 'ยกเลิก' }, { key: 'po:open', label: 'รอส่ง' },
  ]);
  assert.deepEqual(options.map((o) => o.label), ['รอส่ง', 'ยกเลิก']);
});

/* ── ยามอ่านซอร์ส (จอเป็น JSX) — ป้าย ตัวกรอง และการเรียงของหน้าใช้ตัวเดียวกัน ── */
test('🔴 หน้า /sahamit/po: ป้าย ตัวกรอง และการเรียงอ่านสถานะจาก poDisplayStatus ตัวเดียว', () => {
  const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  const page = live(readFileSync(new URL('../../app/sahamit/po/page.js', import.meta.url), 'utf8'));
  assert.match(page, /const statusOf = useCallback\(\(po\) => poDisplayStatus\(po, matByPo\.get\(po\.poNumber\)\), \[matByPo\]\);/);
  assert.match(page, /if \(statusSel\.length && !statusSel\.includes\(statusOf\(po\)\.label\)\) return false;/);
  assert.match(page, /const statusOptions = useMemo\(\(\) => poStatusOptions\(pos\.map\(statusOf\)\), \[pos, statusOf\]\);/);
  assert.match(page, /const shown = poDisplayStatus\(po, lines\);/);
  assert.doesNotMatch(page, /poRollupStatus\(/, 'ห้ามมีตัวตัดสินสถานะชุดที่สองบนหน้านี้');
});
