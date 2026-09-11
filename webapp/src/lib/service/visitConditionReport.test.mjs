// ── ช่างแจ้งเครื่องชำรุดจากหน้างาน (ข้อ H) ─────────────────────────────────────
//
// ของเดิม: ไม่มีทางไหนเขียน `service_assets.condition` จากงานหน้างานเลย — คำสั่งแจ้งสภาพ
// อยู่หน้าเครื่องซึ่ง role ช่างเปิดไม่ได้ ⇒ เห็นเครื่องเสียกับตาแต่ทะเบียนยังบอกว่า "ปกติ"
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { brokenReportInput, brokenReportPlan } from './visitConditionReport.js';
import { normalizeAssetResult } from './visitAssets.js';
import { assetMovePatch, assetMoveRow } from './assetMoves.js';
import { reportFlags } from './visitReport.js';
import { assetTimeline } from './assetHistory.js';

const code = (url) => readFileSync(new URL(url, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const visit = (over = {}) => ({ id: 'SVV1', code: 'SV-26090001', siteId: 'ST1', kind: 'refill', actualDate: '2026-09-11', ...over });
const asset = (over = {}) => ({ id: 'A1', label: 'เครื่องล็อบบี้', siteId: 'ST1', status: 'active', condition: 'ok', ...over });

/* ══ ตัวตรวจผลรายเครื่อง ═════════════════════════════════════════════════ */

test('🔴 แจ้งชำรุดต้องบอกอาการ — ทำแล้วแต่เครื่องมีปัญหาก็ต้องมีอาการ', () => {
  const { error } = normalizeAssetResult({ assetId: 'A1', outcome: 'done', broken: true });
  assert.match(error, /อาการ/);
  const ok = normalizeAssetResult({ assetId: 'A1', outcome: 'done', broken: true, reason: 'ปั๊มไม่พ่น' });
  assert.equal(ok.error, null);
  assert.equal(ok.broken, true);
  assert.equal(ok.value.reason, 'ปั๊มไม่พ่น', 'อาการเก็บในผลรายนัดด้วย — ใบส่งงานอ่านได้');
});

test('สวิตช์ชำรุดอยู่นอกแถวผลรายนัด (ตารางนั้นไม่มีคอลัมน์นี้) และต้องเป็น true จริง ๆ', () => {
  const { value, broken } = normalizeAssetResult({ assetId: 'A1', outcome: 'done', broken: true, reason: 'ปั๊มไม่พ่น' });
  assert.equal(Object.hasOwn(value, 'broken'), false, '`...value` ถูกกางลง insert ตรง ๆ');
  assert.equal(broken, true);
  // สตริง "true"/"false" จากฟอร์มเก่า ต้องไม่กลายเป็นแจ้งชำรุด
  assert.equal(normalizeAssetResult({ assetId: 'A1', outcome: 'done', broken: 'true' }).broken, false);
  assert.equal(normalizeAssetResult({ assetId: 'A1', outcome: 'done' }).broken, false);
});

/* ══ แผนแจ้งชำรุด ═════════════════════════════════════════════════════════ */

test('⭐ แจ้งชำรุด = คำสั่ง "แจ้งเปลี่ยนสภาพ" — สภาพเป็นชำรุด เครื่องยังอยู่ที่เดิม', () => {
  const plan = brokenReportPlan({
    visit: visit(), reports: [{ assetId: 'A1', reason: 'ปั๊มไม่พ่น' }], siteAssets: [asset()], today: '2026-09-11',
  });
  assert.equal(plan.errors.length, 0);
  const [{ asset: a, input }] = plan.moves;
  const patch = assetMovePatch(a, 'condition', input);
  assert.deepEqual(patch, { condition: 'broken' }, 'ไม่แตะสถานะ/ไซต์ — เสียแต่ยังตั้งอยู่ที่ลูกค้า');
  const row = assetMoveRow(a, 'condition', input, { fromSite: { name: 'ไซต์ A' } });
  assert.equal(row.conditionBefore, 'ok');
  assert.equal(row.conditionAfter, 'broken');
  assert.equal(row.reason, 'ปั๊มไม่พ่น', 'อาการขึ้นบนประวัติของเครื่อง');
  assert.match(row.note, /\(SVV1\)/, 'อ่านย้อนได้ว่าแจ้งจากนัดไหน');
});

test('🔑 บันทึกซ้ำ ("แก้ผลการเข้า") ต้องเงียบ — เครื่องที่ชำรุดอยู่แล้วข้าม ไม่ใช่ติดด่านจนบันทึกไม่ได้', () => {
  const plan = brokenReportPlan({
    visit: visit(), reports: [{ assetId: 'A1', reason: 'ปั๊มไม่พ่น' }],
    siteAssets: [asset({ condition: 'broken' })], today: '2026-09-11',
  });
  assert.deepEqual(plan.moves, []);
  assert.deepEqual(plan.errors, []);
  assert.equal(plan.skipped.length, 1);
});

test('🔴 แจ้งได้เฉพาะเครื่องที่ติดตั้งอยู่ที่ไซต์ของนัดนี้ — ช่างไม่ได้สิทธิ์แตะเครื่องทั้งบริษัท', () => {
  const cases = [
    [], // ไม่อยู่ในไซต์นี้เลย
    [asset({ siteId: 'ST9' })],
    [asset({ status: 'in_stock', siteId: null })],
    [asset({ status: 'repair' })],
    [asset({ status: 'removed' })],
  ];
  for (const siteAssets of cases) {
    const plan = brokenReportPlan({ visit: visit(), reports: [{ assetId: 'A1', reason: 'ปั๊มไม่พ่น' }], siteAssets, today: '2026-09-11' });
    assert.equal(plan.moves.length, 0, JSON.stringify(siteAssets));
    assert.match(plan.errors[0].error, /ติดตั้งอยู่ที่ไซต์ของนัดนี้/);
  }
});

test('วันที่ของประวัติ = วันที่เข้าจริง · ยังไม่ประทับ = วันนี้ตามนาฬิกาไทยที่ผู้เรียกส่งมา', () => {
  assert.equal(brokenReportInput(visit(), 'ปั๊มไม่พ่น', '2026-09-12').movedAt, '2026-09-11');
  assert.equal(brokenReportInput(visit({ actualDate: null }), 'ปั๊มไม่พ่น', '2026-09-12').movedAt, '2026-09-12');
  assert.ok(brokenReportInput(visit(), 'ก'.repeat(900), '2026-09-12').reason.length <= 500, 'เพดาน CHECK');
});

/* ══ ผู้อ่าน: หัวหน้าต้องเห็น ═════════════════════════════════════════════ */

test('⭐ ใบส่งงานขึ้นป้าย "เครื่องชำรุด" จากสภาพในทะเบียนของเครื่องที่นัดนี้แตะ', () => {
  const assetsById = new Map([['A1', asset({ condition: 'broken' })], ['A2', asset({ id: 'A2', label: 'เครื่องหลังร้าน' })]]);
  const flags = reportFlags({
    visit: { status: 'done', customerSignatureUrl: 'x', attachments: [{}] },
    results: [{ assetId: 'A1', outcome: 'done' }, { assetId: 'A2', outcome: 'done' }], assetsById,
  });
  const broken = flags.find((f) => f.kind === 'broken');
  assert.ok(broken);
  assert.match(broken.label, /เครื่องชำรุด 1 ตัว/);
  assert.equal(broken.detail, 'เครื่องล็อบบี้');
  // ซ่อมแล้ว (กลับเป็นปกติ) ป้ายหายเอง ไม่ค้างบนใบเก่า
  assetsById.set('A1', asset({ condition: 'ok' }));
  assert.equal(reportFlags({ visit: { status: 'done' }, results: [{ assetId: 'A1', outcome: 'done' }], assetsById })
    .some((f) => f.kind === 'broken'), false);
});

test('ประวัติเครื่องบอกทิศของสภาพ ("แจ้งว่าชำรุด") และบอกว่าใครแจ้ง', () => {
  const rows = assetTimeline({
    asset: asset({ condition: 'broken' }),
    moves: [{ id: 'M1', kind: 'condition', movedAt: '2026-09-11', conditionAfter: 'broken', reason: 'ปั๊มไม่พ่น', createdByName: 'ช่างต้า' }],
  });
  const row = rows.find((r) => r.key === 'move-M1');
  assert.equal(row.label, 'แจ้งว่าชำรุด');
  assert.equal(row.by, 'ช่างต้า');
  assert.match(row.detail, /ปั๊มไม่พ่น/);
  const page = code('../../app/service/assets/[id]/page.js');
  assert.match(page, /row\.by && <span className=\{styles\.reason\}>โดย \{row\.by\}<\/span>/, 'ประกอบไว้แล้วต้องขึ้นจอด้วย');
});

/* ══ ยามซอร์ส ═══════════════════════════════════════════════════════════ */

test('🔑 PUT ผลรายเครื่อง: ตรวจแจ้งชำรุดก่อนลบ/เขียน · สั่งผ่านตัวเขียนกลาง · ก่อนวงเปลี่ยนเครื่อง', () => {
  const route = code('../../app/api/service/visits/[id]/assets/route.js');
  const planAt = route.indexOf('brokenReportPlan({');
  const deleteAt = route.indexOf(".from('service_visit_assets').delete()");
  const commitAt = route.indexOf("kind: 'condition'");
  const swapAt = route.indexOf('const swaps = incoming.filter');
  assert.ok(planAt > 0 && deleteAt > planAt, 'แจ้งไม่ได้ต้องตีกลับก่อนเขียนอะไรเลย');
  assert.ok(commitAt > deleteAt && swapAt > commitAt, 'เสียก่อน แล้วค่อยถูกเปลี่ยนออก');
  assert.match(route, /guard: \{ siteId: visit\.siteId, condition: asset\.condition \}/);
  assert.match(route, /if \(broken\) reports\.push/);
});

test('แผ่นปิดงาน: สวิตช์ชำรุดเฉพาะเครื่องที่ยังปกติ · ซ่อนตอน "ไปแล้วเข้าไม่ได้" · ช่องอาการขึ้นเมื่อติ๊ก', () => {
  const sheet = code('../../components/service/CloseVisitSheet.js');
  assert.match(sheet, /asset\.condition === "broken" \? \(/);
  assert.match(sheet, /\) : !unable && \(/);
  assert.match(sheet, /onClick=\{\(\) => setField\(asset\.id, "broken", !row\.broken\)\}/);
  assert.match(sheet, /row\.outcome && \(row\.outcome !== "done" \|\| row\.broken\)/);
});

test('ช่องสภาพเครื่องถูกล็อกในฟอร์มแก้ข้อมูลด้วย — เปลี่ยนได้ทางคำสั่ง/นัดเท่านั้น', () => {
  const moves = code('./assetMoves.js');
  assert.match(moves, /\['condition', 'สภาพเครื่อง'\]/);
});
