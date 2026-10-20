// ── /sahamit/po: ตัวกรองสถานะ = คำบนป้ายในตาราง (ตรวจตัวกรองทั้งระบบ 08/10 · H7) ─────────────────
//
// 🐞 ตัวกรองใช้ `poRollupStatus` (รอส่ง/ส่งบางส่วน/ส่งครบ) ส่วนป้ายใช้ขั้นผลิตจากบรรทัดวัสดุ (รอวัสดุ/…/ปิดงาน)
//    ⇒ คำบนตัวเลือกไม่มีบนป้ายสักใบ (ของจริง 19/10: 112/112 ใบไม่ตรง) · ใบที่ปิดงานแล้วถูกจัดเป็น "รอส่ง"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  poDeliveryOptions, poDisplayStatus, poMatchesDelivery, poRollupStatus, poStatusOptions, PO_STATUS_LABEL,
  poMatchesSearch, poLineMatchesSearch, poTableLines, poLineDisplayStatus, poMatchesPoFilters,
} from './po.js';

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

/* ── หมวด "การส่งของ" (รอบตรวจ 19/10 ของ H7) ─────────────────────────────────────────────────────────────
   🐞 พอตัวกรอง "สถานะ" เป็นคำบนป้าย (ขั้นผลิต) ใบที่ส่งไปบางบรรทัดขึ้น "รอวัสดุ" (ขั้นต่ำสุด) และไม่มีตัวเลือกไหนแยกใบ
      "ส่งบางส่วน" ได้อีก · ภาพรวม /sahamit ยังนับตาม `poRollupStatus` ⇒ เลขบนภาพรวมสร้างซ้ำบนหน้า PO ไม่ได้ */
const partly = po('PO-PART', ['delivered', 'open']);
const partlyMaterial = [mat('PO-PART', 'delivered', true), mat('PO-PART', 'open')];

test('🔴 ใบส่งบางส่วนที่ป้ายเป็น "รอวัสดุ" ยังกรองด้วยการส่งของได้', () => {
  assert.equal(poDisplayStatus(partly, partlyMaterial).label, 'รอวัสดุ');
  const all = [...pos, partly];
  assert.deepEqual(all.filter((p) => poMatchesDelivery(p, ['partial'])).map((p) => p.poNumber), ['PO-PART']);
  // ไม่เลือกอะไร = ไม่กรอง
  assert.equal(all.filter((p) => poMatchesDelivery(p, [])).length, all.length);
});

test('🔴 ตัวเลือก "การส่งของ" = คำของ PO_STATUS_LABEL ที่มีจริง · รอส่ง+ส่งบางส่วน = ชุด "PO ที่ต้องการการติดตาม" ของภาพรวม', () => {
  const all = [...pos, partly];
  assert.deepEqual(poDeliveryOptions(all), [
    { value: 'open', label: 'รอส่ง' }, { value: 'partial', label: 'ส่งบางส่วน' },
    { value: 'delivered', label: 'ส่งครบ' }, { value: 'cancelled', label: 'ยกเลิก' },
  ]);
  // ภาพรวม /sahamit นับรายการติดตามด้วยกติกานี้ (ยามซอร์สข้างล่างจับถ้าภาพรวมเปลี่ยนกติกา)
  const dashboardFollowUp = all.filter((p) => ['open', 'partial'].includes(poRollupStatus(p))).map((p) => p.poNumber);
  const picked = all.filter((p) => poMatchesDelivery(p, ['open', 'partial'])).map((p) => p.poNumber);
  assert.deepEqual(picked, dashboardFollowUp);
  assert.ok(picked.includes('PO-CLOSED'), 'ใบปิดงานแล้วที่ตัว PO ยังเป็นรอส่ง — ภาพรวมนับ ตัวกรองต้องเจอเหมือนกัน');
  const dashboard = readFileSync(new URL('../../app/sahamit/page.js', import.meta.url), 'utf8');
  assert.match(dashboard, /\["open", "partial"\]\.includes\(poRollupStatus\(p\)\)/, 'กติกาของภาพรวมเปลี่ยน — แก้หมวด "การส่งของ" ให้ตรงด้วย');
});

/* ── ยามอ่านซอร์ส (จอเป็น JSX) — ป้าย ตัวกรอง และการเรียงของหน้าใช้ตัวเดียวกัน ── */
test('🔴 หน้า /sahamit/po: ป้าย ตัวกรอง และการเรียงอ่านสถานะจาก poDisplayStatus ตัวเดียว', () => {
  const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  const page = live(readFileSync(new URL('../../app/sahamit/po/page.js', import.meta.url), 'utf8'));
  assert.match(page, /const statusOf = useCallback\(\(po\) => poDisplayStatus\(po, matByPo\.get\(po\.poNumber\)\), \[matByPo\]\);/);
  assert.match(page, /if \(statusSel\.length && !statusSel\.includes\(statusOf\(po\)\.label\)\) return false;/);
  assert.match(page, /const statusOptions = useMemo\(\(\) => poStatusOptions\(pos\.map\(statusOf\)\), \[pos, statusOf\]\);/);
  assert.match(page, /const shown = poDisplayStatus\(po, lines\);/);
  assert.doesNotMatch(page, /poRollupStatus\(/, 'ห้ามมีตัวตัดสินสถานะชุดที่สองบนหน้านี้ — การส่งของผ่าน poMatchesDelivery/poDeliveryOptions');
  // หมวด "การส่งของ" แยกจาก "สถานะ" และเข้าร่วมตัวนับ/ปุ่มล้าง/รีเซ็ตหน้าเหมือนหมวดอื่น
  assert.match(page, /\{ key: "delivery", label: "การส่งของ", options: deliveryOptions, selected: deliverySel, onChange: setDeliverySel \}/);
  assert.match(page, /const deliveryOptions = useMemo\(\(\) => poDeliveryOptions\(pos\), \[pos\]\);/);
  assert.match(page, /if \(!poMatchesDelivery\(po, deliverySel\)\) return false;/);
  assert.match(page, /const filterCount = statusSel\.length \+ deliverySel\.length \+ destSel\.length;/);
  assert.match(page, /setDeliverySel\(\[\]\)/);
  assert.match(page, /\$\{deliverySel\.join\(","\)\}/);
});

/* ── M24a (ตรวจตัวเลข 20/10): คำค้นตัวเดียวของสองมุมมอง ─────────────────────────────────────────────────
   🐞 กองคำค้นของบรรทัด (มุมมองตาราง) ไม่มีสถานที่ส่ง ⇒ ค้น "บางปะกง" หัวบอก "แสดง N จาก 112 ใบ" แต่ตารางว่าง */

const DEST = { bangpakong: 'บางปะกง', photharam: 'โพธาราม', khonkaen: 'ขอนแก่น' };
const destLabel = (k) => DEST[k] || null;
const prodIdx = new Map([['fg-001', { name: 'น้ำหอมลาเวนเดอร์' }], ['fg-002', { name: 'สเปรย์มะลิ' }]]);
const searchOpts = { destLabel, prodIdx };
const sPos = [
  { id: 'A', poNumber: 'PO-2601', destination: 'bangpakong', lines: [
    { id: 'A1', fgCode: 'FG-001', productName: 'Lavender', status: 'open' },
    { id: 'A2', fgCode: 'FG-002', productName: null, status: 'produced' },
  ] },
  { id: 'B', poNumber: 'PO-2602', destination: 'photharam', lines: [
    { id: 'B1', fgCode: 'FG-002', productName: 'Jasmine', status: 'delivered' },
  ] },
  { id: 'C', poNumber: 'PO-2603', destination: null, lines: [
    { id: 'C1', fgCode: 'FG-009', productName: 'Rose', status: 'cancelled' },
  ] },
];
// ทรงของหน้า: grouped = poMatchesSearch · ตาราง = poTableLines (ไม่มีตัวกรองอื่น)
const groupedIds = (needle) => sPos.filter((p) => poMatchesSearch(p, needle, searchOpts)).map((p) => p.id);
const tablePoIds = (needle) => [...new Set(poTableLines(sPos, { needle, ...searchOpts }).map((r) => r.po.id))];

test('🔴 M24a: ทุกคำค้น (เลข PO · FG · สถานที่ส่ง · ชื่อสินค้า) — ใบที่หัวนับ = ใบที่มีแถวในตาราง', () => {
  for (const needle of ['po-2601', 'fg-002', 'บางปะกง', 'โพธาราม', 'ลาเวนเดอร์', 'jasmine', 'rose', '26', 'ไม่มีคำนี้', '']) {
    assert.deepEqual(tablePoIds(needle), groupedIds(needle), `คำค้น "${needle}"`);
  }
  // 🐞 ของเดิม: สถานที่ส่งอยู่แค่ในกองของใบ — ตารางว่างทั้งที่หัวบอก 1 ใบ
  assert.deepEqual(groupedIds('บางปะกง'), ['A']);
  assert.equal(poTableLines(sPos, { needle: 'บางปะกง', ...searchOpts }).length, 2, 'ทุกบรรทัดของใบปลายทางนั้น');
});

test('M24a: คำค้นระดับบรรทัดเลือกเฉพาะบรรทัดที่ตรง (ใบยังนับ เพราะมีอย่างน้อยหนึ่งบรรทัด)', () => {
  const rows = poTableLines(sPos, { needle: 'ลาเวนเดอร์', ...searchOpts });
  assert.deepEqual(rows.map((r) => r.line.id), ['A1']);
  assert.ok(poLineMatchesSearch(sPos[0], sPos[0].lines[1], 'po-2601', searchOpts), 'เลขที่ใบอยู่ในกองของทุกบรรทัด');
  assert.ok(!poLineMatchesSearch(sPos[0], sPos[0].lines[1], 'ลาเวนเดอร์', searchOpts));
});

/* ── M24a2: มุมมองตาราง — ป้าย ตัวกรอง และการเรียงใช้สถานะของบรรทัด ── */
const sMat = new Map([
  ['A1', { poLineId: 'A1', status: 'open', tracking: null }],
  ['A2', { poLineId: 'A2', status: 'produced', tracking: { pmArrivedAt: '2026-10-01', rmArrivedAt: '2026-10-01' } }],
  ['B1', { poLineId: 'B1', status: 'delivered', tracking: null }],
]);
const lineStatusOf = (l) => poLineDisplayStatus(l, sMat.get(l.id));

test('🔴 M24a2: ป้ายของบรรทัด = ขั้นผลิตจากแถววัสดุ · ไม่มีแถววัสดุ = ขั้นที่กดเดินเอง หรือสถานะส่งของ', () => {
  assert.deepEqual(Object.fromEntries(sPos.flatMap((p) => p.lines).map((l) => [l.id, lineStatusOf(l).label])), {
    A1: 'รอวัสดุ', A2: 'ผลิตเสร็จ', B1: 'ส่งแล้ว', C1: 'ยกเลิก',
  });
  /* สายวัสดุล้ม (ไม่มีแถววัสดุ):
     · 3 ขั้นที่กดเดินเอง (เก็บบนบรรทัด) ⇒ คำขั้นผลิตตัวเดียวกับตอนมีแถววัสดุ — ไม่ขึ้น "รอส่ง" ให้บรรทัดที่ปิดงานแล้ว
       🐞 (รีวิว 20/10) รุ่นแรกของ M24a2 ถอยทุกค่าไป poRollupStatus ⇒ closed/produced = "รอส่ง"
     · open/partial/cancelled ⇒ คำของ PO_STATUS_LABEL ตรงกับป้ายของใบบรรทัดเดียวที่ถอยแบบเดียวกัน */
  const fallback = (status) => poLineDisplayStatus({ id: 'X', fgCode: 'FG-1', status }, null).label;
  assert.deepEqual(Object.fromEntries(['open', 'partial', 'produced', 'delivered', 'closed', 'cancelled'].map((s) => [s, fallback(s)])), {
    open: 'รอส่ง', partial: 'ส่งบางส่วน', produced: 'ผลิตเสร็จ', delivered: 'ส่งแล้ว', closed: 'ปิดงาน', cancelled: 'ยกเลิก',
  });
  for (const status of ['produced', 'delivered', 'closed']) {
    const withMaterial = poLineDisplayStatus({ id: 'X', status }, { poLineId: 'X', status, tracking: null });
    assert.deepEqual(poLineDisplayStatus({ id: 'X', status }, null), withMaterial, `${status}: คำไม่ขึ้นกับสายวัสดุ`);
  }
  for (const status of ['open', 'partial', 'cancelled']) {
    const single = { id: 'P', poNumber: 'PO-1', lines: [{ id: 'X', fgCode: 'FG-1', status }] };
    assert.equal(poLineDisplayStatus(single.lines[0], null).label, poDisplayStatus(single, []).label, status);
  }
});

test('🔴 M24a2: สายวัสดุล้ม — มุมมองตารางยังได้แถวที่ป้ายเขียนคำที่เลือกทุกแถว', () => {
  const blockedOf = (l) => poLineDisplayStatus(l, undefined);   // matByLineId ว่าง (ไม่เคยโหลดสำเร็จ)
  const options = poStatusOptions(poTableLines(sPos, { lineStatusOf: blockedOf }).map((r) => r.status));
  assert.deepEqual(options.map((o) => o.label), ['ผลิตเสร็จ', 'ส่งแล้ว', 'รอส่ง', 'ยกเลิก']);
  for (const option of options) {
    const rows = poTableLines(sPos, { statusSel: [option.value], lineStatusOf: blockedOf });
    assert.ok(rows.length > 0, option.label);
    assert.ok(rows.every((r) => r.status.label === option.label), `${option.label}: ทุกแถวต้องมีป้ายคำนั้น`);
  }
});

test('🔴 M24a2: มุมมองตาราง เลือกคำไหน ได้แถวที่ป้ายเขียนคำนั้นทุกแถว (และไม่มีตัวเลือกที่ได้ 0 แถว)', () => {
  const all = poTableLines(sPos, { lineStatusOf });
  const options = poStatusOptions(all.map((r) => r.status));
  assert.deepEqual(options.map((o) => o.label), ['รอวัสดุ', 'ผลิตเสร็จ', 'ส่งแล้ว', 'ยกเลิก']);
  for (const option of options) {
    const rows = poTableLines(sPos, { statusSel: [option.value], lineStatusOf });
    assert.ok(rows.length > 0, option.label);
    assert.ok(rows.every((r) => r.status.label === option.label), `${option.label}: ทุกแถวต้องมีป้ายคำนั้น`);
  }
  // 🐞 ของเดิม: กรองที่ระดับใบ (ใบ A = "รอวัสดุ") แล้ววาดทุกบรรทัด ⇒ บรรทัด A2 "ผลิตเสร็จ" ติดมาด้วย
  assert.equal(poDisplayStatus(sPos[0], [...sMat.values()].filter((r) => r.poLineId.startsWith('A'))).label, 'รอวัสดุ');
  assert.deepEqual(poTableLines(sPos, { statusSel: ['รอวัสดุ'], lineStatusOf }).map((r) => r.line.id), ['A1']);
});

test('M24a2: ตัวกรองระดับใบ (การส่งของ · สถานที่ส่ง) ใช้ตัวเดียวกันทั้งสองมุมมอง', () => {
  assert.deepEqual(poTableLines(sPos, { destSel: ['photharam'], lineStatusOf }).map((r) => r.line.id), ['B1']);
  assert.deepEqual(poTableLines(sPos, { deliverySel: ['cancelled'], lineStatusOf }).map((r) => r.line.id), ['C1']);
  assert.ok(poMatchesPoFilters(sPos[0], {}), 'ไม่เลือกอะไร = ผ่าน');
});

test('🔴 หน้า /sahamit/po มุมมองตาราง: แถว/หัว/ป้ายมาจาก poTableLines + poLineDisplayStatus ตัวเดียว', () => {
  const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  const page = live(readFileSync(new URL('../../app/sahamit/po/page.js', import.meta.url), 'utf8'));
  assert.match(page, /if \(!poMatchesSearch\(po, q, searchOpts\)\) return false;/, 'มุมมองรายใบค้นผ่าน poMatchesSearch');
  assert.match(page, /poTableLines\(pos, \{ needle: q, statusSel, deliverySel, destSel, lineStatusOf, \.\.\.searchOpts \}\)/);
  assert.match(page, /const lineStatusOf = useCallback\(\(l\) => poLineDisplayStatus\(l, matByLineId\.get\(l\.id\)\), \[matByLineId\]\);/);
  assert.match(page, /<PoLinesTable lines=\{tableLines\}/, 'ตารางวาดจากชุดเดียวกับที่หัวนับ');
  assert.match(page, /แสดง \$\{tablePoCount\} จาก \$\{pos\.length\} ใบ · \$\{tableLines\.length\} รายการ/);
  assert.match(page, /\{r\.status\.label\}/, 'ป้ายในตารางเป็นคำของ poLineDisplayStatus');
  assert.match(page, /status: PO_DISPLAY_STATUS_ORDER\.indexOf\(r\.status\.key\)/, 'การเรียงสถานะใช้คีย์เดียวกับป้าย');
  assert.doesNotMatch(page, /const hay = \[/, 'ห้ามมีกองคำค้นชุดที่สองบนหน้า');
  assert.doesNotMatch(page, /lineStatusLabel\(/, 'ห้ามกลับไปอ่าน l.status ดิบเป็นป้าย');
});

/* ── M23 (ตรวจตัวเลข 20/10): แถว "PO ที่ต้องการการติดตาม" ของภาพรวม /sahamit ──────────────────────────────
   🐞 แถวพาไป `/sahamit/po?q=เลขที่` แต่หน้า PO ไม่อ่าน `?q=` เลย ⇒ กดแถวแล้วได้รายการทั้งหมด ไม่ใช่ใบที่กด
   ⭐ แถวเดียว = ใบเดียว ⇒ พาไปหน้า PO ใบนั้น (href ของแถวกับลิงก์ในเซลล์ตรงกันตัวอักษร — ROW_MIRROR) */
test('🔴 M23: แถวติดตามบนภาพรวม /sahamit เปิดหน้า PO ใบนั้น ไม่ใช่ ?q= ที่ปลายทางไม่อ่าน', () => {
  const live = (source) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  const dashboard = live(readFileSync(new URL('../../app/sahamit/page.js', import.meta.url), 'utf8'));
  assert.match(dashboard, /<DetailRow key=\{p\.id\} href=\{`\/sahamit\/po\/\$\{p\.id\}`\}/);
  assert.match(dashboard, /<Link\s+href=\{`\/sahamit\/po\/\$\{p\.id\}`\}/);
  assert.doesNotMatch(dashboard, /\/sahamit\/po\?q=/);
  const poList = readFileSync(new URL('../../app/sahamit/po/page.js', import.meta.url), 'utf8');
  assert.doesNotMatch(poList, /useSearchParams/, 'ถ้าหน้า PO เริ่มอ่าน ?q= เมื่อไร ทบทวนมติข้อนี้ (q จับได้หลายใบ)');
});
