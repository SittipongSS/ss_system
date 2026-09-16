// สวิตช์ "ดีลเก่าจากระบบเดิม" — ไม่มียอด ไม่นับ Actual ไม่เข้า FC (มติผู้ใช้ 2026-09-14)
//
// 🐞 ที่มา: 2026-08-08 → 2026-09-14 ฟอร์มสัญญาว่ายอดที่พิมพ์เข้า Actual ทันที · POST เขียน
// wonValue + actualSource='legacy' · แต่ trigger 0110 (นิยามล่าสุด 0353) เขียนทับจาก SO อนุมัติ
// ตั้งแต่ INSERT ⇒ ยอด 15 ใบ 1,956,850 ไม่เคยนับ แต่ค้างใน projectValue เป็น FC
// เทสต์ JS ที่ปั้นข้อมูล actualSource 'legacy' ผ่านมาตลอด เพราะไม่มีใครเทียบกับฐาน
//
// ยามชุดนี้ล็อก:
//   ① ด่านกลาง (lib/sales/legacyDealSwitch) — ตีกลับยอด/แถวมูลค่า/วันอนาคต · ถอดคีย์ของระบบ · อ่านบันทึก
//   ② route สร้าง/แก้ดีลเรียกด่านกลาง ไม่ประทับ Actual เอง
//   ③ คำบนฟอร์มเลิกสัญญา Actual
//   ④ ตัวบ่งชี้ดีลเก่าที่สร้างเป็น Won (มติผู้ใช้ 2026-09-15) — แต่งคีย์หลบไม่ได้ · ธง legacy แก้ทีหลังไม่ได้ ·
//      มีที่เดียว ไม่มีของซ้ำ
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  LEGACY_CLOSED_NOTE_KEYS,
  LEGACY_WON_FUTURE_DATE_ERROR,
  LEGACY_WON_VALUE_ERROR,
  SERVER_ONLY_DEAL_METADATA_KEYS,
  clientDealMetadataOnCreate,
  clientDealMetadataOnPatch,
  hasLegacySwitchFlag,
  isLegacyWonCreate,
  legacyClosedNoteOf,
  legacyWonCreateError,
  stripServerOnlyDealMetadata,
} from './legacyDealSwitch.js';
import { dealActualFromSalesOrders } from './salesOrderWorkflow.js';
import { isLegacyWonAtCreate, isWonAwaitingSo, wonAwaitingSoAmountOf, wonAwaitingSoCountOf } from './dashboardMetrics.js';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const stripComments = (source) => source
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .split('\n')
  .map((line) => line.replace(/(^|[^:"'`])\/\/.*$/, '$1'))
  .join('\n');

const POST_ROUTE = 'src/app/api/sales-planning/deals/route.js';
const PATCH_ROUTE = 'src/app/api/sales-planning/deals/[id]/route.js';
const FORM = 'src/components/salesPlanning/DealFormFields.js';
const MODAL = 'src/components/salesPlanning/DealCreateModal.js';
const VALUE_LINES = 'src/components/salesPlanning/DealValueLines.js';
const DEALS_PAGE = 'src/app/sales-planning/deals/page.js';
const DEAL_DETAIL = 'src/app/sales-planning/deals/[id]/page.js';

const TODAY = '2026-09-14';
const legacyWon = (over = {}) => ({
  stage: 'won', metadata: { legacy: true }, valueItems: [], projectValue: '', expectedCloseDate: '2026-05-15', ...over,
});

/* ── ① ด่านกลาง ──────────────────────────────────────────────────────────── */

test('ดีลเก่าที่สร้างเป็น Won ต้องไม่มีมูลค่า — ส่งยอดหรือแถวมา = ตีกลับ ไม่ทิ้งเงียบ', () => {
  const opts = { stage: 'won', today: TODAY };
  assert.equal(legacyWonCreateError(legacyWon(), opts), null);
  assert.equal(legacyWonCreateError(legacyWon({ projectValue: 0, valueItems: undefined }), opts), null);
  assert.equal(legacyWonCreateError(legacyWon({ projectValue: 30000 }), opts), LEGACY_WON_VALUE_ERROR);
  assert.equal(legacyWonCreateError(legacyWon({ projectValue: '-5' }), opts), LEGACY_WON_VALUE_ERROR);
  assert.equal(
    legacyWonCreateError(legacyWon({ valueItems: [{ categoryCode: '01-002', qty: 1, unitPrice: 30000 }] }), opts),
    LEGACY_WON_VALUE_ERROR,
  );
  // แถวราคา 0 ก็ไม่รับ — โหมดนี้ไม่มีตารางมูลค่าให้กรอกเลย
  assert.equal(
    legacyWonCreateError(legacyWon({ valueItems: [{ categoryCode: '01-002', qty: 1, unitPrice: 0 }] }), opts),
    LEGACY_WON_VALUE_ERROR,
  );
  assert.match(LEGACY_WON_VALUE_ERROR, /ไม่นับเป็นยอดขาย \(Actual\) และไม่เข้า FC/);
  assert.match(LEGACY_WON_VALUE_ERROR, /ใบสั่งขายที่อนุมัติแล้วเท่านั้น/);
});

test('ด่านใช้เฉพาะดีลเก่าที่สร้างเป็น Won — ขั้นอื่นและดีลปกติเดินทางเดิม', () => {
  // สวิตช์ + ขั้นอื่น = ดีลปกติที่มีมูลค่าคาดการณ์ได้
  assert.equal(legacyWonCreateError(legacyWon({ stage: 'qualified', projectValue: 30000 }), { stage: 'qualified', today: TODAY }), null);
  // Won ที่ไม่มีธง — route ตีกลับด้วยด่านเดิม (ต้องปิด Won ผ่านใบเสนอราคา) ไม่ใช่ด่านนี้
  assert.equal(legacyWonCreateError({ projectValue: 30000, metadata: {} }, { stage: 'won', today: TODAY }), null);
  assert.equal(legacyWonCreateError(undefined, { stage: 'won', today: TODAY }), null);
});

test('วันที่ปิดในระบบเดิมเลยวันนี้ไม่ได้ (ของจริง DL-26080133 = 2026-12-31)', () => {
  const opts = { stage: 'won', today: TODAY };
  assert.equal(legacyWonCreateError(legacyWon({ expectedCloseDate: '2026-12-31' }), opts), LEGACY_WON_FUTURE_DATE_ERROR);
  assert.equal(legacyWonCreateError(legacyWon({ expectedCloseDate: TODAY }), opts), null);
  assert.equal(legacyWonCreateError(legacyWon({ expectedCloseDate: '2026-09-15T00:00:00Z' }), opts), LEGACY_WON_FUTURE_DATE_ERROR);
  // ยอดผิดชนะวันผิด — ข้อความเรื่องมูลค่าสำคัญกว่า
  assert.equal(legacyWonCreateError(legacyWon({ expectedCloseDate: '2026-12-31', projectValue: 1 }), opts), LEGACY_WON_VALUE_ERROR);
});

test('ถอดคีย์ของระบบจาก metadata ที่ client ส่งมา — ไม่แตะค่าอื่นและไม่แก้ object ต้นทาง', () => {
  assert.deepEqual(SERVER_ONLY_DEAL_METADATA_KEYS,
    ['actualSource', 'legacyClosedValue', 'legacyClosedDate', 'wonSource', 'acceptedQuotationId']);
  assert.deepEqual(LEGACY_CLOSED_NOTE_KEYS, ['legacyClosedValue', 'legacyClosedDate']);
  // ⚠️ ธง legacy ต้องไม่อยู่ในรายการ — ด่าน POST อ่านมัน และแถวที่บันทึกต้องเก็บไว้ให้ isLegacyWonAtCreate
  assert.ok(!SERVER_ONLY_DEAL_METADATA_KEYS.includes('legacy'), 'ห้ามถอดธง legacy');
  const input = {
    legacy: true, brand: 'X', actualSource: 'legacy', legacyClosedValue: 1, legacyClosedDate: '2026-01-01',
    wonSource: 'quotation', acceptedQuotationId: 'QT-FAKE',
  };
  assert.deepEqual(stripServerOnlyDealMetadata(input), { legacy: true, brand: 'X' });
  assert.equal(input.legacyClosedValue, 1, 'ห้ามแก้ object ของผู้เรียก');
  assert.equal(input.acceptedQuotationId, 'QT-FAKE', 'ห้ามแก้ object ของผู้เรียก');
  for (const bad of [null, undefined, [], 'x', 5]) assert.deepEqual(stripServerOnlyDealMetadata(bad), {});
});

/* ── ④ ตัวบ่งชี้ดีลเก่าที่สร้างเป็น Won ───────────────────────────────────────── */

test('คำขอที่แต่ง wonSource / acceptedQuotationId มาเองหลบตัวบ่งชี้ดีลเก่าไม่ได้ — POST และ PATCH (มติผู้ใช้ 2026-09-15)', () => {
  // POST: metadata ที่บันทึก = ค่าที่ถอดแล้ว + คีย์ที่ route เติมเอง + คีย์ที่ trigger เขียน (รูปเดียวกับ deals/route.js)
  const forged = { legacy: true, wonSource: 'quotation', acceptedQuotationId: 'QT-FAKE' };
  const created = {
    stage: 'won', projectValue: 0, confirmedAt: '2026-05-15',
    metadata: { ...clientDealMetadataOnCreate(forged), projectType: 'NPD', brand: '', actualSource: 'sale_order', wonMonth: null },
  };
  assert.equal(created.metadata.legacy, true, 'ธง legacy ต้องรอดการถอด');
  assert.equal(isLegacyWonAtCreate(created), true);
  assert.equal(isWonAwaitingSo(created), false, 'ดีลเก่าที่สร้างเป็น Won ต้องไม่กลับเข้ากอง Won รอยื่น SO');
  // มูลค่าดีล 0 หลุดกองอยู่แล้ว (มติ 2026-09-16) — ยืนยันว่าตัดด้วยธงดีลเก่า ไม่ใช่เพราะมูลค่า 0
  assert.equal(isWonAwaitingSo({ ...created, projectValue: 283350 }), false, 'ดีลเก่ามูลค่าจริงก็ต้องไม่เข้ากอง');
  // PATCH: ถอดจากค่าที่ส่งมาก่อน merge — แต่งคีย์ใส่ดีลเก่าไม่ได้ (รูปเดียวกับ deals/[id]/route.js)
  const patchedLegacy = { ...created, metadata: { ...created.metadata, ...clientDealMetadataOnPatch({ wonSource: 'quotation', acceptedQuotationId: 'QT-FAKE' }) } };
  assert.equal(isLegacyWonAtCreate(patchedLegacy), true);
  // …และค่าที่ RPC รับใบเสนอราคาเขียนไว้อยู่ต่อ ไม่ว่า client จะส่งอะไรมาทับ (สำเนาเก่าบนจอ · ค่าว่าง)
  const accepted = { stage: 'won', projectValue: 50000, metadata: { legacy: true, acceptedQuotationId: 'QT-1', wonSource: 'quotation', wonMonth: null } };
  const patchedAccepted = {
    ...accepted,
    metadata: { ...accepted.metadata, ...clientDealMetadataOnPatch({ acceptedQuotationId: null, wonSource: 'manual', brand: 'Y' }) },
  };
  assert.equal(patchedAccepted.metadata.acceptedQuotationId, 'QT-1');
  assert.equal(patchedAccepted.metadata.wonSource, 'quotation');
  assert.equal(patchedAccepted.metadata.brand, 'Y');
  assert.equal(isLegacyWonAtCreate(patchedAccepted), false);
  assert.equal(isWonAwaitingSo(patchedAccepted), true);
});

test('ธง legacy แก้ทีหลังไม่ได้: PATCH ไม่รับค่าจาก client · POST รับเฉพาะ true จริง (ตรวจรอบสอง 2026-09-15)', () => {
  // บล็อก B DL-26080340 (283,350 · 2025-11) — รูปแถวจริงบน prod: Won · legacy true · ไม่มี acceptedQuotationId/wonSource
  const blockB = {
    stage: 'won', projectValue: 283350, confirmedAt: '2025-11-20',
    metadata: { legacy: true, projectType: 'NPD', brand: '', actualSource: 'sale_order', legacyClosedValue: 283350 },
  };
  assert.equal(isLegacyWonAtCreate(blockB), true);
  // PATCH {metadata:{legacy:false}} (รูปเดียวกับ deals/[id]/route.js) — ธงเดิมอยู่ต่อ กองยังเป็น 0/0
  for (const sent of [{ legacy: false }, { legacy: null }, { legacy: 'false' }, { legacy: false, brand: 'Z' }]) {
    const patched = { ...blockB, metadata: { ...blockB.metadata, ...clientDealMetadataOnPatch(sent) } };
    assert.equal(patched.metadata.legacy, true, `PATCH ${JSON.stringify(sent)} ต้องไม่แก้ธง legacy`);
    assert.equal(isLegacyWonAtCreate(patched), true, JSON.stringify(sent));
    assert.equal(wonAwaitingSoAmountOf(patched), 0, JSON.stringify(sent));
    assert.equal(wonAwaitingSoCountOf(patched), 0, JSON.stringify(sent));
  }
  // คีย์อื่นยัง merge ได้ตามเดิม
  assert.deepEqual(clientDealMetadataOnPatch({ legacy: false, brand: 'Z', wonSource: 'x' }), { brand: 'Z' });
  // กลับด้าน: ใส่ธงให้ดีลที่ไม่ใช่ดีลเก่าผ่าน PATCH ไม่ได้เช่นกัน
  const normalWon = { stage: 'won', projectValue: 50000, metadata: { brand: '' } };
  const flagged = { ...normalWon, metadata: { ...normalWon.metadata, ...clientDealMetadataOnPatch({ legacy: true }) } };
  assert.equal('legacy' in flagged.metadata, false);
  assert.equal(wonAwaitingSoCountOf(flagged), 1);
  for (const bad of [null, undefined, [], 'x']) assert.deepEqual(clientDealMetadataOnPatch(bad), {});

  // POST: ด่านกับตัวบ่งชี้อ่านธงตัวเดียวกัน — ค่า truthy ที่ไม่ใช่ true ไม่ใช่ดีลเก่า ⇒ route ตีกลับ "ต้องปิด Won ผ่านใบเสนอราคา"
  for (const flag of [1, 'true', 'yes', {}]) {
    const body = { metadata: { legacy: flag }, projectValue: 0, expectedCloseDate: '2026-05-15' };
    assert.equal(hasLegacySwitchFlag(body.metadata), false, JSON.stringify(flag));
    assert.equal(isLegacyWonCreate(body, 'won'), false, `legacy ${JSON.stringify(flag)} ต้องไม่ผ่านด่านสร้างที่ Won`);
    assert.equal(legacyWonCreateError(body, { stage: 'won', today: TODAY }), null, 'ด่านมูลค่าไม่ใช่ตัวตีกลับ — ด่านสถานะใน route ต่างหาก');
    assert.equal('legacy' in clientDealMetadataOnCreate(body.metadata), false, 'แถวที่บันทึกต้องไม่มีธงรูปแปลก');
  }
  assert.equal(isLegacyWonCreate({ metadata: { legacy: true } }, 'won'), true);
  assert.deepEqual(clientDealMetadataOnCreate({ legacy: true, brand: 'X', acceptedQuotationId: 'QT-FAKE' }), { legacy: true, brand: 'X' });
  assert.deepEqual(clientDealMetadataOnCreate({ legacy: false, leadId: 'L1' }), { leadId: 'L1' });
  for (const bad of [null, undefined, [], 'x']) assert.deepEqual(clientDealMetadataOnCreate(bad), {});
});

test('ตัวบ่งชี้ดีลเก่าที่สร้างเป็น Won มีที่เดียว (isLegacyWonAtCreate) — ห้ามเขียนเงื่อนไขซ้ำในโค้ดแอป', () => {
  const HOME = 'src/lib/sales/dashboardMetrics.js';
  // ตัวอ่านธงสวิตช์อยู่ที่เดียว (hasLegacySwitchFlag) — ด่านสร้างกับตัวบ่งชี้ต้องอ่านผ่านตัวนี้ทั้งคู่
  const FLAG_HOME = 'src/lib/sales/legacyDealSwitch.js';
  const files = [...sourceFiles('src/components'), ...sourceFiles('src/app'), ...sourceFiles('src/lib')];
  assert.ok(files.includes(HOME) && files.includes(FLAG_HOME));
  for (const rel of files) {
    const src = stripComments(read(rel));
    if (rel !== HOME) assert.doesNotMatch(src, /wonSource\s*!==?\s*['"`]quotation['"`]/, rel);
    if (rel === FLAG_HOME) continue;
    // ทั้งแบบเข้มและแบบ truthy (แบบ truthy คือบั๊กที่ด่าน POST กับตัวบ่งชี้ตัดสินไม่ตรงกัน)
    assert.doesNotMatch(src, /metadata\??\.legacy\s*[!=]==?\s*true/, rel);
    assert.doesNotMatch(src, /Boolean\([^)]*metadata\??\.legacy\s*\)/, rel);
    assert.doesNotMatch(src, /!\s*[\w.?]*metadata\??\.legacy\b/, rel);
  }
  assert.match(read(FLAG_HOME), /export const hasLegacySwitchFlag = \(metadata\) => metadata\?\.legacy === true;/);
  assert.match(stripComments(read(FLAG_HOME)), /export const isLegacyWonCreate = \(body = \{\}, stage\) => stage === 'won' && hasLegacySwitchFlag\(body\?\.metadata\);/);
  assert.match(read(HOME), /export const isLegacyWonAtCreate = \(d\) => isWonDeal\(d\)\s*&& hasLegacySwitchFlag\(d\?\.metadata\)/);
  assert.match(stripComments(read(HOME)), /export const isWonAwaitingSo = \(d\) => isWonDeal\(d\)\s*&& !isLegacyWonAtCreate\(d\)/);
  // หน้าดีลใช้ตัวเดียวกันผ่านตัวเลือกคำใต้การ์ด
  assert.match(stripComments(read('src/lib/sales/dealAmountDisplay.js')), /if \(isLegacyWonAtCreate\(deal\)\) \{/);
});

test('บันทึกยอดปิดในระบบเดิมบนหน้าดีล — อ่านอย่างเดียว · บอกว่ายอดยังอยู่ใน FC หรือไม่', () => {
  assert.equal(legacyClosedNoteOf(null), null);
  assert.equal(legacyClosedNoteOf({ metadata: {} }), null);
  for (const value of [0, -1, 'abc', null]) {
    assert.equal(legacyClosedNoteOf({ metadata: { legacyClosedValue: value } }), null);
  }
  // บล็อก A (ล้าง FC แล้ว)
  assert.deepEqual(
    legacyClosedNoteOf({ projectValue: 0, metadata: { legacyClosedValue: 204000, legacyClosedDate: '2026-05-15' } }),
    { value: 204000, date: '2026-05-15', stillInForecast: false },
  );
  // บล็อก B (รอเจ้าของยืนยัน — ยอด FC ยังอยู่)
  assert.equal(legacyClosedNoteOf({ projectValue: 600000, metadata: { legacyClosedValue: 600000 } }).stillInForecast, true);
  assert.equal(legacyClosedNoteOf({ metadata: { legacyClosedValue: 5, legacyClosedDate: '15/05/2026' } }).date, null);
});

test('Actual ไม่มีที่มาแบบ legacy อีก — มาจาก SO อนุมัติเท่านั้น', () => {
  assert.equal(dealActualFromSalesOrders({ wonValue: 5, metadata: { actualSource: 'legacy' } }), 0);
  assert.equal(dealActualFromSalesOrders({ wonValue: 5, metadata: { actualSource: 'sale_order' } }), 5);
  assert.doesNotMatch(stripComments(read('src/lib/sales/salesOrderWorkflow.js')), /'legacy'/);
});

/* ── ② route ─────────────────────────────────────────────────────────────── */

test('POST สร้างดีล: ไม่ประทับ Actual เอง · เรียกด่านกลางก่อนเตรียมแถวมูลค่า · ถอดคีย์ของระบบ', () => {
  const src = stripComments(read(POST_ROUTE));
  // ทั้งคำ ไม่ใช่แค่รูปบรรทัดที่ลบไป — `wonValue: projectValue` / `row.wonValue = …` ก็คือบั๊กเดิม
  // (หลังตัดคอมเมนต์ route นี้ไม่มีสองคำนี้เลย)
  assert.doesNotMatch(src, /\bactualSource\b/, 'ห้ามประทับ actualSource จากฟอร์ม — เป็นของ trigger');
  assert.doesNotMatch(src, /['"`]legacy['"`]/);
  assert.doesNotMatch(src, /\bwonValue\b/, 'wonValue เป็นของ trigger (คิดจาก SO อนุมัติ)');
  assert.match(src, /legacyWonCreateError\(body, \{ stage, today: businessDate\(\) \}\)/);
  const gate = src.indexOf('legacyWonCreateError(body');
  const items = src.indexOf('prepareDealValueItems(body');
  assert.ok(gate > 0 && items > 0 && gate < items,
    'ด่านดีลเก่าต้องมาก่อน prepareDealValueItems — ไม่งั้นคำขอที่ส่งแถวมาได้ error รายแถวแทนข้อความของด่าน');
  assert.match(src, /confirmedAt: stage === 'won' \? \(body\.expectedCloseDate \|\| null\) : null/,
    'วันที่ปิดในระบบเดิมมีตัวอ่าน (wonMonthOf) — อย่าลบเพราะคิดว่าเป็นเรื่องยอด');
  assert.match(src, /\.\.\.clientDealMetadataOnCreate\(body\.metadata\)/);
  assert.doesNotMatch(src, /\.\.\.stripServerOnlyDealMetadata\(body\.metadata\)/, 'POST ต้องเก็บธง legacy แบบ true จริงเท่านั้น');
  assert.doesNotMatch(src, /\.\.\.\(body\.metadata \|\| \{\}\)/);
  // ด่านสถานะใช้ตัวอ่านธงตัวเดียวกับตัวบ่งชี้ — ไม่ใช่ truthy
  assert.match(src, /if \(stage === 'won' && !isLegacyWonCreate\(body, stage\)\) \{/);
});

test('PATCH ดีล: ถอดคีย์ของระบบ + ธง legacy จากค่าที่ส่งมาก่อน merge — บันทึกของ mig 0359 และธงเดิมอยู่รอด', () => {
  const src = stripComments(read(PATCH_ROUTE));
  assert.match(src, /\{ \.\.\.\(before\.metadata \|\| \{\}\), \.\.\.clientDealMetadataOnPatch\(body\.metadata\) \}/);
  assert.doesNotMatch(src, /stripServerOnlyDealMetadata/, 'PATCH ต้องไม่รับธง legacy จาก client');
  assert.doesNotMatch(src, /\.\.\.body\.metadata\s*\}/);
});

test('คอมเมนต์ที่อ้างว่า trigger 0107/0108 ปล่อยยอดที่กรอกเองต้องไม่กลับมา', () => {
  for (const rel of [POST_ROUTE, 'src/lib/sales/salesOrderWorkflow.js', 'src/lib/sales/forecastSourceRepo.js']) {
    const raw = read(rel);
    assert.doesNotMatch(raw, /DB \(0107\/0108\)/, rel);
    assert.doesNotMatch(raw, /ของดีลย้ายระบบใหม่เป็น 'sale_order'/, rel);
    assert.doesNotMatch(raw, /ยอดสดชนะยอดย้าย/, rel);
  }
});

/* ── ③ ฟอร์ม ─────────────────────────────────────────────────────────────── */

function sourceFiles(rel, out = []) {
  for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
    const child = `${rel}/${entry.name}`;
    if (entry.isDirectory()) sourceFiles(child, out);
    else if (/\.(js|jsx)$/.test(entry.name)) out.push(child);
  }
  return out;
}

test('ไม่มีจอไหนสัญญาว่ายอดดีลเก่าเข้า Actual อีก', () => {
  const PROMISES = [
    'Actual) ทันที',
    'Won เก่าคิดเป็นยอดจริง',
    'มูลค่าที่ปิด',
    'ยอด Won เข้าเดือน',
    'ยอดปิดจริงจากระบบเดิม',
    'ถ้ามีใบสั่งขายมาผูกภายหลัง',
  ];
  for (const rel of [...sourceFiles('src/components'), ...sourceFiles('src/app')]) {
    const src = read(rel);
    for (const phrase of PROMISES) assert.ok(!src.includes(phrase), `${rel} ยังมี "${phrase}"`);
  }
  assert.doesNotMatch(stripComments(read('src/lib/sales/dealRequiredFields.js')), /มูลค่าที่ปิด/);
});

test('ฟอร์มดีลเก่า Won: ไม่มีตารางมูลค่า · บอกกติกาใหม่ · วันที่เป็นวันที่ปิดในระบบเดิม', () => {
  const form = read(FORM);
  assert.match(form, /\{legacyWon \? pairRows\(\[legacyValueNote\]\) : valueField\}/);
  assert.ok(form.includes('ไม่นับเป็นยอดขาย (Actual) และไม่เข้า FC'));
  assert.ok(form.includes('ยอดขายจริงมาจากใบสั่งขายที่อนุมัติแล้วเท่านั้น'));
  assert.ok(form.includes('วันที่ปิดในระบบเดิม'));
  assert.ok(form.includes('"ไม่มียอด"'), 'ใต้ขั้น Won ของดีลเก่าต้องไม่เขียน Actual');
  // วันที่สิ้นสุด: โหมดปกติยังบอกว่ารายงานวางแผนผลิตนับยอด (จริง) — โหมดดีลเก่า Won ต้องแยกกิ่งก่อนถึงคำนั้น
  // (ดีลยอด 0 ถูกข้ามที่ forecast-report ⇒ "รายงานวางแผนผลิตนับยอดดีลนี้" เป็นเท็จ)
  assert.match(form, /\{legacyWon\s*\?\s*"วันที่ลูกค้ารับของในระบบเดิม[^"]*ไม่มียอดในรายงานวางแผนผลิต"\s*:\s*form\.endDate/,
    'help ของวันที่สิ้นสุดในโหมดดีลเก่า Won ต้องไม่บอกว่ารายงานวางแผนผลิตนับยอด');
  const legacyEndHelp = form.indexOf('"วันที่ลูกค้ารับของในระบบเดิม');
  const countsPromise = form.indexOf('รายงานวางแผนผลิตนับยอดดีลนี้');
  assert.ok(legacyEndHelp > 0 && countsPromise > legacyEndHelp,
    'คำ "รายงานวางแผนผลิตนับยอดดีลนี้" ต้องอยู่หลังกิ่ง legacyWon เท่านั้น');
  // ตารางมูลค่าไม่มีช่องคำอธิบายเสริมแล้ว — ผู้เรียกเดียวของมันคือคำสัญญา Actual
  assert.doesNotMatch(stripComments(read(VALUE_LINES)), /\bhint\b/);
});

test('โมดัลสร้าง: ส่ง "ไม่มีมูลค่า" ชัด ๆ ในโหมดดีลเก่า Won และตรวจด่านเดียวกับ server', () => {
  const modal = stripComments(read(MODAL));
  assert.match(modal, /\.\.\.\(legacyWon \? \{ valueItems: \[\], projectValue: 0 \} : \{\}\)/);
  assert.match(modal, /legacyWonCreateError\(\{ \.\.\.payload, metadata \}, \{ stage: draft\.stage, today: businessDate\(\) \}\)/);
  assert.doesNotMatch(modal, /มูลค่าที่ปิด/);
  // โหมดดีลเก่ามีเฉพาะตอนสร้าง (probabilityMode="auto") — ฟอร์มแก้ส่ง legacyWon ไปก็เป็นโค้ดตาย
  for (const rel of [DEALS_PAGE, DEAL_DETAIL]) {
    assert.doesNotMatch(stripComments(read(rel)), /legacyWon/, rel);
  }
});

test('หน้าดีลโชว์บันทึกยอดปิดในระบบเดิม — ไม่ใช่ Actual และบอกตามจริงว่ายอดยังอยู่ใน FC หรือไม่', () => {
  const page = read(DEAL_DETAIL);
  assert.match(page, /legacyClosedNoteOf\(deal\)/);
  assert.ok(page.includes('ยอดปิดในระบบเดิม'));
  assert.ok(page.includes('ไม่นับเป็นยอดขาย (Actual) และไม่เข้า FC'));
  assert.match(page, /legacyNote\.stillInForecast/);
  // คำใต้การ์ดของดีลเก่าที่สร้างเป็น Won (มติผู้ใช้ 2026-09-15) — หน้าส่งดีลให้ตัวเลือกคำ ไม่ตัดสินเอง
  assert.match(stripComments(page), /wonDealForecastHint\(\{\s*deal,/);
});
