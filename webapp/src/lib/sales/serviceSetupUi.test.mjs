// ── จองานบริการรายบรรทัดของใบสั่งขาย (U6 · mig 0392 · PR-A) — ตรรกะของร่าง + ยามซอร์สของคอมโพเนนต์ ───────────────
//
// ส่วนที่ 1: ตรรกะล้วน (`serviceSetupDraft.js` · `zonesBulkPlan.js`) — ก้อนบันทึกต้องส่งเฉพาะสิ่งที่ต่างจากฐาน,
//            เวลาของใบไปตามตัวอักษร, id ของช่องตรงกับ `serviceSetupFieldId`, แผงแดงจัดกลุ่มตามแท็บ ฯลฯ
// ส่วนที่ 2: ยามซอร์ส (แผน §2.7) — ไม่มีปุ่มขอ TS/TaskFormModal (D19) · ตารางใบเสนอราคาเหมือนเดิมเมื่อไม่ส่ง renderAfterRow ·
//            ไม่มี style={{ · ช่องค้นหา autoComplete="off" · apiJson เท่านั้น · แผ่นชนิดไม่มีค่าตั้งต้น · แดงหลังกดเท่านั้น ·
//            icon ของ StatusNotice/Tag เป็นตัวคอมโพเนนต์ · หน้าต่างเพิ่มหลายโซนมีเพดาน 500
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

import {
  EMPTY_DRAFT, PERIOD_FIELD_ID, SAVE_FIELD_ID, backfillBannerText, backfillCopyOfView, backfillRailChecks, backfillRailOnTop, backfillRailPressed, linesCardMeta,
  backfillStateOfView,
  derivedRoleOf, draftDirty, fieldErrorsView, intOrRaw, issueHeadTail, lineFieldId, lineFieldIds, lineMissing, localSetupCtx, mergedLines, patchDraftLine,
  issuesInColumnOrder, rebaseDraft, serviceCardMeta, setupPayload, stripParts, submitGateGroups, submitIssuesAfterSave, surveyRequestHref, zonePacksFieldId,
  applyPeriodToAllLines, baseLineOf, copyLinePeriod, ctxLineOf, linePeriodCounters, localEnvelope, periodModeOfDraft, sameSourceOf, switchPeriodMode,
  wholePeriodOfDraft,
  deferNoticeOfView, skipTagsShown,
} from '../../components/salesPlanning/serviceSetup/serviceSetupDraft.js';
import {
  ZONES_BULK_NONE_PICKED, ZONES_BULK_PACKS_INVALID, zonesBulkCapText, zonesBulkConsequence, zonesBulkPlan,
} from '../../components/service/zonesBulkPlan.js';
import {
  SERVICE_BACKFILL_RAIL_TEXT, SERVICE_BACKFILL_STATE_LABELS, SERVICE_DEFER_TEXT, SERVICE_DEFERRED_TEXT, SERVICE_PERIOD_TEXT, SERVICE_REOPEN_TEXT,
  SERVICE_REOPENED_TEXT, SERVICE_SETUP_GRID_TEXT,
  SERVICE_SETUP_LIMITS, SERVICE_SETUP_LINE_TEXT, SERVICE_SETUP_PANEL_TEXT, serviceLinePeriod, serviceSetupFieldId, serviceSetupIssues, serviceSetupTotals,
} from './serviceSetup.js';
import { salesOrderMoneyOutcome } from './salesOrderPayments.js';

const SRC = path.resolve(process.cwd(), 'src');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์ก่อนยามซอร์ส — คำอธิบายในคอมเมนต์ (เช่น "ห้ามมี TaskFormModal") ต้องไม่ทำให้ยามแดง */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');

const FOLDER = 'components/salesPlanning/serviceSetup';
const UI_FILES = [
  ...readdirSync(path.join(SRC, FOLDER)).filter((name) => name.endsWith('.js')).map((name) => `${FOLDER}/${name}`),
  'components/service/ZonesBulkModal.js',
  'components/service/zonesBulkPlan.js',
];
const JSX_FILES = UI_FILES.filter((rel) => !/Draft\.js$|Plan\.js$|\/use[A-Z]/.test(rel));

/* ── ก้อน GET ตัวอย่าง (รูปของ serviceSetupView) ─────────────────────────────────────────────────── */
function viewFixture(overrides = {}) {
  return {
    orderId: 'SO-1',
    updatedAt: '2026-09-28T10:11:12.345678+00:00',
    flow: 'pipeline',
    mode: 'edit',
    period: { from: '2026-10-01', to: '2027-09-30' },
    state: { setupState: null },
    lines: [
      /* 1: พิมพ์เอง ไม่มีหมวด — ต้องเลือกชนิด */
      { lineId: 'L1', lineNo: 1, role: 'unset', roleSource: 'none', kind: null, serviceProductId: null, serviceFgCode: null, rounds: null, fgCode: null, productId: null, description: 'สาขาบางนา', qty: 12, unit: 'แพ็คเกจ', categoryCode: null },
      /* 2: พิมพ์เอง หมวด 02-001 — แพ็คเกจตามหมวด ตั้งครบแล้ว */
      { lineId: 'L2', lineNo: 2, role: 'package', roleSource: 'category', kind: null, serviceProductId: 'P1', serviceFgCode: 'FG-015-02-001-0908', rounds: 12, fgCode: null, productId: null, description: 'สาขา Emquartier', qty: 12, unit: 'แพ็คเกจ', categoryCode: '02-001' },
      /* 3: FG หมวด 02-001 */
      { lineId: 'L3', lineNo: 3, role: 'package', roleSource: 'fg', kind: null, serviceProductId: null, serviceFgCode: null, rounds: null, fgCode: 'FG-015-02-001-0001', productId: 'P9', description: 'แพ็คเกจ', qty: 1, unit: 'แพ็คเกจ', categoryCode: '02-001' },
      /* 4: FG หมวดอื่น */
      { lineId: 'L4', lineNo: 4, role: 'not_service', roleSource: 'fg', kind: null, serviceProductId: null, serviceFgCode: null, rounds: null, fgCode: 'FG-015-03-002-0100', productId: 'P8', description: 'ขวด', qty: 1, unit: 'ขวด', categoryCode: '03-002' },
    ],
    allocations: [
      { id: 'A1', lineId: 'L2', zoneId: 'Z1', packsPerRound: 1, sortOrder: 0 },
    ],
    zones: [{ id: 'Z1', code: 'ZN-1', name: 'Floor 1', siteId: 'S1', isActive: true }],
    sites: [{ id: 'S1', code: 'ST-1', name: 'เอ็มควอเทียร์', customerId: 'C1', isActive: true, kind: 'customer' }],
    fgOptions: [{ id: 'P1', fgCode: 'FG-015-02-001-0908', name: 'SDS', ownerArCode: null }, { id: 'P2', fgCode: 'FG-790-02-001-0001', name: 'ของพี่น้อง', ownerArCode: 'AR-0790' }],
    issues: [],
    warnings: [],
    totals: { packageLines: 2 },
    ...overrides,
  };
}
const fgById = (view) => new Map(view.fgOptions.map((option) => [option.id, option]));

/* ══ ส่วนที่ 1: ตรรกะล้วน ═══════════════════════════════════════════════════════════════════════════ */

test('derivedRoleOf — FG ตามหมวดของรหัส · พิมพ์เองตามหมวดที่เลือก · ไม่มีหมวด = ให้คนเลือก (null)', () => {
  assert.equal(derivedRoleOf({ fgCode: 'FG-1-02-001-1' }), 'package');
  assert.equal(derivedRoleOf({ fgCode: 'FG-1-03-002-1' }), 'not_service');
  assert.equal(derivedRoleOf({ productId: 'P1' }), 'not_service', 'บรรทัดสินค้าที่ไม่มีรหัส = ไม่ใช่แพ็คเกจ (ตัวเดียวกับ derivedLineRole)');
  assert.equal(derivedRoleOf({ categoryCode: '02-001' }), 'package');
  assert.equal(derivedRoleOf({ categoryCode: '03-002' }), 'not_service');
  assert.equal(derivedRoleOf({}), null);
});

test('mergedLines — ฐานอย่างเดียว: ไม่มีค่าตั้งต้นให้ชนิด · ช่องตัวเลขเป็นข้อความ · แถวโซนจากฐานมี key z:<zoneId>', () => {
  const lines = mergedLines(viewFixture(), EMPTY_DRAFT, { fgById: fgById(viewFixture()) });
  assert.deepEqual(lines.map((line) => line.role), ['unset', 'package', 'package', 'not_service']);
  assert.equal(lines[0].kind, null, 'บรรทัดที่ยังไม่เลือกชนิดต้องไม่ถูกเดาให้');
  assert.equal(lines[1].roleSource, 'category');
  assert.equal(lines[1].rounds, '12');
  assert.deepEqual(lines[1].zones, [{ key: 'z:Z1', zoneId: 'Z1', packsPerRound: '1' }]);
  assert.equal(lines[2].manual, false);
});

test('mergedLines — ร่างทับฐาน: เลือกแพ็คเกจแล้วรหัส FG ตามตัวเลือก · ชนิดบนบรรทัด FG ไม่มีผล', () => {
  const view = viewFixture();
  let draft = patchDraftLine(EMPTY_DRAFT, 'L1', { kind: 'package', serviceProductId: 'P2' });
  draft = patchDraftLine(draft, 'L3', { kind: 'not_service' });
  const [l1, , l3] = mergedLines(view, draft, { fgById: fgById(view) });
  assert.equal(l1.role, 'package');
  assert.equal(l1.roleSource, 'stored');
  assert.equal(l1.serviceFgCode, 'FG-790-02-001-0001');
  assert.equal(l3.role, 'package', 'บรรทัด FG ตัดสินจากหมวดของ FG เสมอ (CHECK ของฐาน)');
});

test('setupPayload — ไม่มีร่าง = null · ส่งเฉพาะคีย์ที่ต่างจากฐาน · เวลาของใบไปตามตัวอักษร (ไมโครวินาทีไม่หาย)', () => {
  const view = viewFixture();
  assert.equal(setupPayload(view, EMPTY_DRAFT), null);
  assert.equal(setupPayload(null, EMPTY_DRAFT), null);

  let draft = patchDraftLine(EMPTY_DRAFT, 'L1', { kind: 'package', serviceProductId: 'P1', rounds: '12' });
  draft = patchDraftLine(draft, 'L2', { rounds: '12' });  // เท่าฐาน → ไม่ส่ง
  const payload = setupPayload(view, draft);
  assert.equal(payload.expectedUpdatedAt, '2026-09-28T10:11:12.345678+00:00');
  assert.equal(Object.prototype.hasOwnProperty.call(payload, 'period'), false);
  assert.deepEqual(payload.lines, [{ lineId: 'L1', kind: 'package', serviceProductId: 'P1', rounds: 12 }]);
});

test('setupPayload — ช่วงบริการ: เปลี่ยน = ส่ง · ล้างทั้งสองช่อง = null · ครึ่งเดียว = ส่งให้ server ตีกลับรายช่อง', () => {
  const view = viewFixture();
  assert.deepEqual(setupPayload(view, { ...EMPTY_DRAFT, period: { from: '2026-10-01', to: '2028-09-30' } }).period,
    { from: '2026-10-01', to: '2028-09-30' });
  assert.equal(setupPayload(view, { ...EMPTY_DRAFT, period: { from: '', to: '' } }).period, null);
  assert.deepEqual(setupPayload(view, { ...EMPTY_DRAFT, period: { from: '2026-10-01', to: '' } }).period, { from: '2026-10-01', to: '' });
  assert.equal(setupPayload(view, { ...EMPTY_DRAFT, period: { from: '2026-10-01', to: '2027-09-30' } }), null, 'เท่าฐาน = ไม่มีอะไรบันทึก');
  const noPeriod = viewFixture({ period: null });
  assert.equal(setupPayload(noPeriod, { ...EMPTY_DRAFT, period: { from: '', to: '' } }), null);
});

test('setupPayload — โซน: แถวว่างไม่ถูกส่ง · ชุดเท่าฐาน = ไม่ส่ง · แพ็คที่พิมพ์ผิดส่งตามที่พิมพ์ (server ตีกลับรายช่อง)', () => {
  const view = viewFixture();
  const same = patchDraftLine(EMPTY_DRAFT, 'L2', { zones: [{ key: 'z:Z1', zoneId: 'Z1', packsPerRound: '1' }, { key: 'n:1', zoneId: '', packsPerRound: '' }] });
  assert.equal(setupPayload(view, same), null, 'แถวที่ยังไม่เลือกโซนไม่ใช่การแก้');
  assert.equal(draftDirty(view, same), false);

  const changed = patchDraftLine(EMPTY_DRAFT, 'L2', { zones: [{ key: 'z:Z1', zoneId: 'Z1', packsPerRound: '1.5' }, { key: 'n:2', zoneId: 'Z2', packsPerRound: '' }] });
  assert.deepEqual(setupPayload(view, changed).lines, [{
    lineId: 'L2', zones: [{ zoneId: 'Z1', packsPerRound: '1.5' }, { zoneId: 'Z2', packsPerRound: null }],
  }]);
  assert.equal(draftDirty(view, changed), true);
});

test('setupPayload — บรรทัด FG ไม่ส่ง kind/serviceProductId เด็ดขาด (server ตีกลับ service_setup_kind_on_fg_line)', () => {
  const view = viewFixture();
  const draft = patchDraftLine(EMPTY_DRAFT, 'L3', { kind: 'not_service', serviceProductId: 'P1', rounds: '6' });
  assert.deepEqual(setupPayload(view, draft).lines, [{ lineId: 'L3', rounds: 6 }]);
});

test('setupPayload — สลับเป็น "ไม่ใช่งานบริการ" ส่งชนิด + ล้างแพ็คเกจ/รอบ/โซนที่ฐานถืออยู่ไปพร้อมกัน', () => {
  const view = viewFixture();
  const draft = patchDraftLine(EMPTY_DRAFT, 'L2', { kind: 'not_service', serviceProductId: null, rounds: '', zones: [] });
  assert.deepEqual(setupPayload(view, draft).lines, [{ lineId: 'L2', kind: 'not_service', serviceProductId: null, rounds: null, zones: [] }]);
});

test('intOrRaw — ว่าง = null · จำนวนเต็ม = ตัวเลข · อย่างอื่นส่งตามที่พิมพ์', () => {
  assert.equal(intOrRaw(''), null);
  assert.equal(intOrRaw('  '), null);
  assert.equal(intOrRaw('12'), 12);
  assert.equal(intOrRaw(' 7 '), 7);
  assert.equal(intOrRaw('0'), 0);
  assert.equal(intOrRaw('1.5'), '1.5');
  assert.equal(intOrRaw('abc'), 'abc');
});

test('rebaseDraft — ฐานใหม่เท่าร่างแล้ว = ร่างว่าง (ตัวเดิม) · ที่ยังต่างค้างไว้ให้บันทึกต่อ', () => {
  const view = viewFixture();
  const draft = patchDraftLine(patchDraftLine(EMPTY_DRAFT, 'L2', { rounds: '24' }), 'L1', { kind: 'not_service' });
  const saved = viewFixture({
    updatedAt: '2026-09-28T10:20:00.000001+00:00',
    lines: view.lines.map((line) => (line.lineId === 'L2' ? { ...line, rounds: 24 } : line)),
  });
  const next = rebaseDraft(saved, draft);
  assert.deepEqual(next.lines, { L1: { kind: 'not_service' } });
  assert.equal(setupPayload(saved, next).expectedUpdatedAt, '2026-09-28T10:20:00.000001+00:00', 'บันทึกรอบถัดไปใช้เวลาของฐานใหม่');
  const all = viewFixture({ lines: saved.lines.map((line) => (line.lineId === 'L1' ? { ...line, kind: 'not_service' } : line)) });
  assert.equal(rebaseDraft(all, next), EMPTY_DRAFT);
  assert.equal(rebaseDraft(null, draft), EMPTY_DRAFT);
});

test('localSetupCtx + serviceSetupTotals — ชิป "งานบริการครบ x/n" ตามร่างทันที', () => {
  const view = viewFixture();
  const zonesById = new Map([['Z1', { id: 'Z1', siteId: 'S1' }], ['Z2', { id: 'Z2', siteId: 'S2' }]]);
  const before = serviceSetupTotals(localSetupCtx(mergedLines(view, EMPTY_DRAFT, { fgById: fgById(view) }), zonesById));
  assert.equal(before.lineCount, 4);
  assert.equal(before.completeLines, 2, 'L2 ตั้งครบ + L4 ไม่ใช่งานบริการ');
  assert.equal(before.unsetLines, 1);

  let draft = patchDraftLine(EMPTY_DRAFT, 'L1', { kind: 'package', serviceProductId: 'P1', rounds: '12', zones: [{ key: 'n:1', zoneId: 'Z2', packsPerRound: '2' }] });
  draft = patchDraftLine(draft, 'L3', { rounds: '12', zones: [{ key: 'n:2', zoneId: 'Z1', packsPerRound: '1' }] });
  const after = serviceSetupTotals(localSetupCtx(mergedLines(view, draft, { fgById: fgById(view) }), zonesById));
  assert.equal(after.completeLines, 4);
  assert.equal(after.zones, 2);
  assert.equal(after.sites, 2);
  assert.equal(after.packsPerRound, 4);
  assert.equal(after.packsTotal, 48);
});

test('lineMissing — ยังไม่ตอบ ‘งานบริการ?’ · นับของที่ยังว่าง · ตั้งครบ · ไม่ใช่งานบริการที่ยังมีโซนค้าง', () => {
  const view = viewFixture();
  const [l1, l2, l3, l4] = mergedLines(view, EMPTY_DRAFT, { fgById: fgById(view) });
  assert.deepEqual(lineMissing(l1), { state: 'unset', count: 1, label: 'ยังไม่ตอบ' });
  assert.deepEqual(lineMissing(l2), { state: 'complete', count: 0, label: 'ตั้งครบ' });
  assert.equal(lineMissing(l3).count, 2, 'FG 02-001: ยังไม่มีรอบ + ยังไม่มีโซน (ไม่ต้องเลือก FG)');
  assert.equal(lineMissing(l4).label, null);
  const withBlankPacks = { ...l2, zones: [...l2.zones, { key: 'n:1', zoneId: 'Z2', packsPerRound: '' }] };
  assert.equal(lineMissing(withBlankPacks).label, 'ยังขาด 1 ข้อ');
  assert.equal(lineMissing({ ...l4, zones: [{ zoneId: 'Z1' }] }).count, 1);
});

test('id ของช่องบนจอ = `serviceSetupFieldId` ของตัวตัดสิน (ปุ่ม "ไปแก้" ต้องหาช่องเจอ)', () => {
  for (const field of ['kind', 'period', 'fg', 'zones', 'rounds']) {
    assert.equal(lineFieldId('SOL-a', field), serviceSetupFieldId({ lineId: 'SOL-a', field }));
  }
  assert.equal(zonePacksFieldId('SOL-a', 'ZN-1'), serviceSetupFieldId({ lineId: 'SOL-a', zoneId: 'ZN-1', field: 'packs' }));
  assert.equal(PERIOD_FIELD_ID, serviceSetupFieldId({ field: 'period' }));
  const view = viewFixture();
  const [, l2] = mergedLines(view, EMPTY_DRAFT, { fgById: fgById(view) });
  assert.deepEqual(lineFieldIds(l2),
    ['svc-line-L2-kind', 'svc-line-L2-period', 'svc-line-L2-fg', 'svc-line-L2-zones', 'svc-line-L2-rounds', 'svc-zone-L2-Z1-packs']);
  /* zones_on_not_service ชี้ `svc-line-<id>-zones` บนบรรทัดที่ไม่มีก้อนโซน — id ต้องอยู่ที่แถบ "ไม่ใช่งานบริการ" ของบรรทัดนั้น
     (เฉพาะตอนมีข้อความแดง) · บรรทัดที่เป็นงานบริการ id อยู่ท้ายก้อนโซน (โหมดแก้ — ปุ่มเพิ่มโซน) / ช่องโซนแรก (โหมดอ่าน) */
  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  assert.match(grid, /id=\{line\.role === SERVICE_KIND_NOT_SERVICE && zonesError \? lineFieldId\(line\.lineId, "zones"\) : undefined\}/);
  /* ช่องของก้อนโซนมี key (เรียงใน DOM ตามผัง — มติ 08/10 ลำดับ Tab = ที่ตาเห็น) ⇒ แถวปุ่มเพิ่มโซนคือ key="foot" · id ยังอยู่ที่เดิม */
  assert.match(grid, /<div key="foot" className=\{styles\.zoneFoot\} id=\{editable \? zonesFieldId : undefined\}>/);
  assert.match(grid, /id=\{!editable && index === 0 \? zonesFieldId : undefined\}/);
  assert.match(grid, /id=\{lineFieldId\(line\.lineId, "rounds"\)\}/);
  assert.match(grid, /id=\{row\.zoneId \? zonePacksFieldId\(lineId, row\.zoneId\) : undefined\}/);
  assert.match(grid, /id=\{lineFieldId\(line\.lineId, "kind"\)\} data-invalid=\{error \? "" : undefined\}/);
});

test('fieldErrorsView — 400 ของการบันทึก → ช่องที่แดง (รายช่อง · รายโซน · ข้อความรวม)', () => {
  const view = fieldErrorsView([
    { lineId: null, field: 'period', message: 'ช่วงผิด' },
    { lineId: 'L2', zoneId: 'Z1', field: 'packs', message: 'แพ็คผิด' },
    { lineId: 'L2', zoneId: 'Z9', field: 'zones', message: 'โซนปิด' },
    { lineId: 'L2', zoneId: 'Z8', field: 'zones', message: 'ซ้ำ' },
    { lineId: 'L1', field: 'kind', message: 'ชนิดผิด' },
    { lineId: 'X', field: 'line', message: 'ไม่อยู่ในใบ' },
    { lineId: null, field: 'payload', message: 'รูปผิด' },
    { lineId: null, field: 'payload', message: 'รูปผิด' },
  ]);
  assert.equal(view.byField.get('svc-period'), 'ช่วงผิด');
  assert.equal(view.byField.get('svc-zone-L2-Z1-packs'), 'แพ็คผิด');
  assert.equal(view.byField.get('svc-line-L2-zones'), 'โซนปิด · ซ้ำ');
  assert.equal(view.byZone.get('L2:Z9'), 'โซนปิด');
  assert.equal(view.byField.get('svc-line-L1-kind'), 'ชนิดผิด');
  assert.deepEqual(view.general, ['ไม่อยู่ในใบ', 'รูปผิด']);
});

test('submitGateGroups — จัดตามแท็บ · "n ข้อ" นับเฉพาะข้อที่บล็อก · คำเตือนบัญชีไม่มี "ไปแก้"', () => {
  const groups = submitGateGroups(
    [
      { key: 'rounds_missing', tab: 'overview', lineId: 'L3', message: 'รายการ 3: ยังไม่ใส่จำนวนรอบบริการ' },
      { key: 'due_missing', tab: 'payment', installmentId: 'I7', message: 'งวด 7: ยังไม่ใส่กำหนดชำระ' },
    ],
    [
      { key: 'coverage_overlap', tab: 'payment', owner: 'SA', message: 'งวด 1 กับ งวด 2 ครอบซ้อน' },
      { key: 'fn_coverage_missing', tab: 'payment', owner: 'FN', tag: 'รอฝ่ายบัญชี', message: 'งวด 3 (บัญชีรับรองแล้ว): ยังไม่มีช่วงครอบ' },
    ],
  );
  assert.deepEqual(groups.map((group) => [group.key, group.title, group.count, group.items.length]), [
    ['overview', 'รายการ (แท็บภาพรวม)', 1, 1],
    ['payment', 'งวดชำระ (แท็บการชำระ)', 1, 3],
  ]);
  const [, sa, fn] = groups[1].items;
  assert.deepEqual([sa.kind, sa.tag, sa.jump], ['warning', 'เตือน · ไม่บล็อกการยื่น', true]);
  assert.deepEqual([fn.kind, fn.tag, fn.jump], ['warning', 'รอฝ่ายบัญชี', false]);
  assert.deepEqual(submitGateGroups([], []), [], 'กลุ่มว่างไม่ขึ้น');
});

/* มติเจ้าของ 08/10 (สลับ ④⑤): แผงแดงไล่ข้อของรายการเดียวกันตามคอลัมน์ของตาราง — … ไซต์ · โซน → รอบละกี่แพ็ค → จำนวนรอบบริการ
   🔴 จัดที่จอเท่านั้น: `serviceSetupIssues` (และรหัส DETAIL ของฐาน) ยังเรียง รอบ → โซน → แพ็ค ตามสัญญาเดิมของ server (ไม่มี migration) */
test('08/10 แผงแดงเรียงข้อของรายการตามคอลัมน์: แพ็คก่อนจำนวนรอบบริการ — ลำดับของ server ไม่ถูกแตะ', () => {
  const view = viewFixture();
  const zonesById = new Map(['Z1', 'Z2', 'Z3'].map((id) => [id, { id, code: `ZN-${id}`, name: `Floor ${id}`, siteId: 'S1', isActive: true }]));
  const sitesById = new Map(view.sites.map((site) => [site.id, site]));
  const order = { id: 'SO-1', status: 'draft', origin: 'pipeline', customerId: 'C1', servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-09-30', totalAmount: 0 };
  const line = (n, over = {}) => ({
    id: `L${n}`, lineNo: n, fgCode: 'FG-015-02-001-0001', productId: 'P9', description: 'แพ็คเกจ', serviceKind: null, serviceRounds: null, metadata: {}, ...over,
  });
  const serverIssues = serviceSetupIssues({
    order, lines: [line(1), line(2, { serviceRounds: 12 }), line(3)],
    allocations: [
      { salesOrderLineId: 'L1', zoneId: 'Z1', packsPerRound: 1, sortOrder: 0 },
      { salesOrderLineId: 'L1', zoneId: 'Z2', packsPerRound: null, sortOrder: 1 },
      { salesOrderLineId: 'L2', zoneId: 'Z3', packsPerRound: null, sortOrder: 0 },
    ],
    zonesById, sitesById, productsById: new Map(), fgOptionIds: new Set(), installments: [],
  });
  const codes = (list) => list.map((issue) => [issue.key, issue.lineId, issue.zoneId].filter(Boolean).join(':'));
  /* server (ตรงกับ `sales_order_service_setup_errors` ของฐาน): จำนวนรอบบริการ → โซน → แพ็ครายโซน */
  assert.deepEqual(codes(serverIssues), ['rounds_missing:L1', 'packs_missing:L1:Z2', 'packs_missing:L2:Z3', 'rounds_missing:L3', 'zones_missing:L3']);
  /* จอ: ข้อจำนวนรอบบริการของรายการย้ายไปต่อท้ายข้อของรายการนั้น — ข้ออื่นและลำดับข้ามรายการคงเดิม */
  assert.deepEqual(codes(issuesInColumnOrder(serverIssues)),
    ['packs_missing:L1:Z2', 'rounds_missing:L1', 'packs_missing:L2:Z3', 'zones_missing:L3', 'rounds_missing:L3']);
  assert.deepEqual(codes(serverIssues).slice(0, 2), ['rounds_missing:L1', 'packs_missing:L1:Z2'], 'ไม่แก้อาร์เรย์ของผู้เรียก');
  const [overview] = submitGateGroups(serverIssues, []);
  assert.deepEqual(overview.items.map((item) => item.entry.key), ['packs_missing', 'rounds_missing', 'packs_missing', 'zones_missing', 'rounds_missing']);
  assert.equal(overview.count, 5, '"n ข้อ" ยังนับทุกข้อ');
  /* ข้อที่ไม่มีรายการ (ช่วงบริการของใบ · งวด) และข้อของรายการอื่นไม่ถูกลากตาม */
  const mixed = [
    { key: 'rounds_missing', lineId: 'A', tab: 'overview' }, { key: 'zones_missing', lineId: 'A', tab: 'overview' },
    { key: 'kind_missing', lineId: 'B', tab: 'overview' }, { key: 'period_missing', tab: 'overview' }, { key: 'due_missing', seq: 1, tab: 'payment' },
  ];
  assert.deepEqual(issuesInColumnOrder(mixed).map((issue) => issue.key), ['zones_missing', 'rounds_missing', 'kind_missing', 'period_missing', 'due_missing']);
  assert.deepEqual(issuesInColumnOrder(null), []);
  /* หัวการ์ด: ประโยคที่ไล่ขั้นเดินตามหัวตาราง และอ่านคำจากแคตตาล็อก */
  assert.equal(serviceCardMeta({ view, flow: 'pipeline', editable: true, totals: {} }),
    `ทุกรายการต้องตอบว่าเป็นงานบริการไหม · ถ้าใช่ เลือกแพ็คเกจ → ไซต์ · โซน → ${SERVICE_SETUP_LINE_TEXT.packsLabel} → ${SERVICE_SETUP_LINE_TEXT.roundsLabel} · แก้ได้จนกว่าจะยื่นอนุมัติ`);
  assert.match(code(`${FOLDER}/serviceSetupDraft.js`), /for \(const entry of issuesInColumnOrder\(issues\)\) \{/, 'แผงแดงผ่านตัวจัดลำดับเสมอ (ทั้งข้อจากก้อน GET และรหัสจากฐาน)');
});

test('issueHeadTail — หัวตัวหนาเฉพาะ "รายการ n …" / "งวด n …"', () => {
  assert.deepEqual(issueHeadTail('รายการ 3: ยังไม่ใส่จำนวนรอบบริการ'), { head: 'รายการ 3', rest: ': ยังไม่ใส่จำนวนรอบบริการ' });
  assert.deepEqual(issueHeadTail('รายการ 5 · Floor 2: ยังไม่ใส่รอบละกี่แพ็ค'), { head: 'รายการ 5 · Floor 2', rest: ': ยังไม่ใส่รอบละกี่แพ็ค' });
  assert.deepEqual(issueHeadTail('รายการ 1: จำนวนรอบบริการ 1 เดือน แต่ช่วงบริการยาว 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็ยื่นได้)'),
    { head: 'รายการ 1', rest: ': จำนวนรอบบริการ 1 เดือน แต่ช่วงบริการยาว 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็ยื่นได้)' });
  assert.deepEqual(issueHeadTail('ช่วงครอบขาด 01/04/2027–30/04/2027'), { head: '', rest: 'ช่วงครอบขาด 01/04/2027–30/04/2027' });
});

test('backfillStateOfView — ขั้น backfill เท่านั้น · รอตรวจ/ตีกลับ/กำลังตั้ง/ยังไม่เริ่ม', () => {
  assert.equal(backfillStateOfView(viewFixture()), null, 'ใบร่าง (pipeline) ไม่มีสถานะย้อนหลัง');
  assert.equal(backfillStateOfView(null), null);
  const backfill = (state, extra = {}) => viewFixture({ flow: 'backfill', state: { setupState: state }, ...extra });
  assert.equal(backfillStateOfView(backfill('submitted')), 'submitted');
  assert.equal(backfillStateOfView(backfill('rejected')), 'rejected');
  assert.equal(backfillStateOfView(backfill(null)), 'editing', 'มีช่วงบริการ/โซนบันทึกแล้ว');
  assert.equal(backfillStateOfView(backfill(null, {
    period: null, allocations: [], lines: viewFixture().lines.map((line) => ({ ...line, kind: null, serviceProductId: null })),
  })), 'not_started');
});

test('backfillRailChecks — แถวตรวจของการ์ดราง (x/n · ช่วงบริการ · งวด) จากข้อที่ยังขาดของ server', () => {
  const view = viewFixture({
    flow: 'backfill',
    issues: [
      { key: 'kind_missing', lineId: 'L1', tab: 'overview', message: 'รายการ 1 · …: ยังไม่เลือกว่าเป็น …' },
      { key: 'zones_missing', lineId: 'L3', tab: 'overview', message: 'รายการ 3: ยังไม่เลือกไซต์ · โซน' },
      { key: 'coverage_missing', installmentId: 'I1', tab: 'payment', message: 'งวด 1: ยังไม่ใส่ช่วงครอบบริการ' },
    ],
  });
  const rows = Object.fromEntries(backfillRailChecks(view).map((row) => [row.key, row]));
  assert.equal(rows.lines.value, '3/4 รายการ');
  assert.equal(rows.lines.ok, false);
  assert.equal(rows.lines.sub, 'รายการ 1: ยังไม่ตอบ ‘งานบริการ?’', 'บรรทัดรองสั้น — ไม่ยกข้อความเต็มที่พกคำอธิบายบรรทัดมา (ดัน dt จนหดเหลือคำละบรรทัด)');
  /* บรรทัดที่ยังไม่เลือกชนิด (L1) ยังไม่ครบ — ไม่นับเป็นเสร็จของแถวโซน */
  assert.equal(rows.zones.value, '1/3 รายการ', 'นับเฉพาะบรรทัดที่ไม่ใช่ "ไม่ใช่งานบริการ" · บรรทัดที่ยังไม่เลือกชนิดไม่ใช่ "ครบ"');
  assert.equal(rows.zones.ok, false);
  assert.equal(rows.period.value, '01/10/2026–30/09/2027');
  assert.equal(rows.period.ok, true);
  assert.equal(rows.installments.value, 'ยังขาด 1 ข้อ');
  assert.equal(rows.installments.ok, false);
  const missingPeriod = Object.fromEntries(backfillRailChecks(viewFixture({ period: null, issues: [{ key: 'period_missing', tab: 'overview' }] }))
    .map((row) => [row.key, row]));
  assert.deepEqual([missingPeriod.period.value, missingPeriod.period.ok], ['ยังไม่ใส่', false]);
});

test('F9: แถวตรวจของการ์ดราง — วันวางบิล/กำหนดชำระแยกจากช่วงครอบ (ไม่นับวันวางบิลเป็น "ช่วงครอบ")', () => {
  const billing = Array.from({ length: 12 }, (_, i) => ({
    key: 'billing_missing', tab: 'payment', installmentId: `I${i + 1}`, seq: i + 1, message: `งวด ${i + 1}: ยังไม่เลือกรอบวางบิล (ลูกค้ามีรอบวางบิล)`,
  }));
  const view = viewFixture({
    flow: 'backfill', totals: { packageLines: 2, unsetLines: 0 },
    issues: [...billing, { key: 'coverage_end', tab: 'payment', installmentId: 'I12', seq: 12, message: 'ช่วงครอบไม่ตรงวันสิ้นสุดบริการ (…)' }],
  });
  const rows = Object.fromEntries(backfillRailChecks(view).map((row) => [row.key, row]));
  assert.equal(rows.installments.label, 'ช่วงครอบของงวดที่ยังไม่รับรอง');
  assert.equal(rows.installments.value, 'ยังขาด 1 ข้อ');
  assert.equal(rows.billing.label, 'วันวางบิล · กำหนดชำระ');
  assert.deepEqual([rows.billing.value, rows.billing.ok, rows.billing.sub], ['ยังขาด 12 ข้อ', false, 'เติมที่แท็บการชำระ']);
  assert.deepEqual(backfillRailChecks(view).map((row) => row.key), ['lines', 'zones', 'period', 'installments', 'billing']);
});

test('F9: ใบเดิมที่ยังไม่เริ่ม (ทุกบรรทัดยังไม่เลือกชนิด) — แถวอื่นไม่บอกว่าครบ/ไม่ต้องใส่', () => {
  const unsetLine = (n) => ({ lineId: `U${n}`, lineNo: n, role: 'unset', roleSource: 'none', kind: null, serviceProductId: null, serviceFgCode: null, rounds: null, fgCode: null, productId: null, description: `สาขา ${n}`, categoryCode: null });
  const lines = [1, 2, 3, 4, 5].map(unsetLine);
  const view = viewFixture({
    flow: 'backfill', period: null, allocations: [], lines, totals: { packageLines: 0, unsetLines: 5 },
    issues: lines.map((l) => ({ key: 'kind_missing', tab: 'overview', lineId: l.lineId, lineNo: l.lineNo, message: `รายการ ${l.lineNo} · ${l.description} ที่ยาวมากจนดันคอลัมน์: ยังไม่เลือกว่าเป็น …` })),
  });
  const rows = Object.fromEntries(backfillRailChecks(view).map((row) => [row.key, row]));
  assert.deepEqual([rows.lines.value, rows.lines.sub], ['0/5 รายการ', 'รายการ 1: ยังไม่ตอบ ‘งานบริการ?’ · อีก 4 รายการ']);
  assert.deepEqual([rows.zones.value, rows.zones.ok, rows.zones.sub], ['0/5 รายการ', false, 'รอตอบ ‘งานบริการ?’ 5 รายการ']);
  assert.deepEqual([rows.period.value, rows.period.ok], ['ยังไม่ใส่', false], 'บรรทัดที่ยังไม่เลือกชนิดอาจเป็นแพ็คเกจ — ไม่ใช่ "ไม่ต้องใส่"');
  assert.notEqual(rows.period.sub, 'ไม่มีแพ็คเกจ — ไม่ต้องใส่');
  for (const key of ['installments', 'billing']) {
    assert.deepEqual([rows[key].value, rows[key].ok], ['รอตอบ ‘งานบริการ?’', false], key);
  }
  // ทุกบรรทัดไม่ใช่งานบริการจริง = ไม่ต้องใส่ช่วงบริการ/งวด
  const none = Object.fromEntries(backfillRailChecks(viewFixture({
    flow: 'backfill', period: null, allocations: [], totals: { packageLines: 0, unsetLines: 0 }, issues: [],
    lines: [viewFixture().lines[3]],
  })).map((row) => [row.key, row]));
  assert.deepEqual([none.period.sub, none.period.ok], ['ไม่มีแพ็คเกจ — ไม่ต้องใส่', true]);
  assert.equal(none.installments.ok, true);
});

test('UAT 29/09 ข้อ 2: แถว "ช่วงบริการ" ที่ยังไม่ใส่ระหว่างรอเลือกชนิด บอกเหตุบนบรรทัดรองแบบแถวโซน (แผงแดงไม่มีข้อช่วงบริการ)', () => {
  const unsetLine = (n) => ({ lineId: `U${n}`, lineNo: n, role: 'unset', roleSource: 'none', kind: null, serviceProductId: null, serviceFgCode: null, rounds: null, fgCode: null, productId: null, description: `สาขา ${n}`, categoryCode: null });
  const kindIssues = (lines) => lines.map((l) => ({ key: 'kind_missing', tab: 'overview', lineId: l.lineId, lineNo: l.lineNo, message: `รายการ ${l.lineNo} · …` }));
  /* ยังไม่มีแพ็คเกจที่บันทึกแล้ว ⇒ server ไม่ขึ้น period_missing (serviceSetupIssues: เฉพาะ packageLines > 0)
     แต่แถวยังไม่ยอมบอกว่าครบ (บรรทัดที่ยังไม่เลือกชนิดอาจเป็นแพ็คเกจ) ⇒ หลังกดยื่นแถวแดงโดยไม่มีข้อในแผง — บรรทัดรองต้องบอกเหตุ */
  const lines = [unsetLine(1), unsetLine(2), viewFixture().lines[3]];
  const waiting = Object.fromEntries(backfillRailChecks(viewFixture({
    flow: 'backfill', period: null, allocations: [], lines, totals: { packageLines: 0, unsetLines: 2 }, issues: kindIssues(lines.slice(0, 2)),
  })).map((row) => [row.key, row]));
  assert.deepEqual([waiting.period.value, waiting.period.ok, waiting.period.sub],
    ['ยังไม่ใส่', false, 'รอตอบ ‘งานบริการ?’ 2 รายการ · ต้องใส่ถ้ามีงานบริการ']);
  assert.equal(waiting.zones.sub, 'รอตอบ ‘งานบริการ?’ 2 รายการ', 'แถวโซนพูดแบบเดิม');

  /* มีแพ็คเกจที่บันทึกแล้ว ⇒ server ขึ้น period_missing (อยู่ในแผงแดงแล้ว) — ไม่พูดว่า "ถ้ามีแพ็คเกจ" ทั้งที่มีแล้ว */
  const withPackage = Object.fromEntries(backfillRailChecks(viewFixture({
    flow: 'backfill', period: null, totals: { packageLines: 1, unsetLines: 1 }, issues: [{ key: 'period_missing', tab: 'overview' }],
  })).map((row) => [row.key, row]));
  assert.deepEqual([withPackage.period.value, withPackage.period.ok, withPackage.period.sub], ['ยังไม่ใส่', false, null]);

  /* ใส่ช่วงแล้ว = บรรทัดรองเป็นคำอ่านช่วงเหมือนเดิม (ไม่ใช่คำรอเลือกชนิด) */
  const withPeriod = Object.fromEntries(backfillRailChecks(viewFixture({
    flow: 'backfill', lines, totals: { packageLines: 0, unsetLines: 2 }, issues: kindIssues(lines.slice(0, 2)),
  })).map((row) => [row.key, row]));
  assert.equal(withPeriod.period.value, '01/10/2026–30/09/2027');
  assert.doesNotMatch(String(withPeriod.period.sub), /รอตอบ/);

  /* ข้อความอยู่ในแคตตาล็อก (ภาคผนวก A.7) — ตัวคิดแถวไม่เขียนภาษาไทยของบรรทัดรองเอง */
  assert.equal(SERVICE_BACKFILL_RAIL_TEXT.waitKind('2'), 'รอตอบ ‘งานบริการ?’ 2 รายการ');
  assert.equal(SERVICE_BACKFILL_RAIL_TEXT.periodWaitKind('2'), 'รอตอบ ‘งานบริการ?’ 2 รายการ · ต้องใส่ถ้ามีงานบริการ');
  const draft = code(`${FOLDER}/serviceSetupDraft.js`);
  assert.match(draft, /SERVICE_BACKFILL_RAIL_TEXT\.waitKind\(fmtNumber\(unset\)\)/);
  assert.match(draft, /SERVICE_BACKFILL_RAIL_TEXT\.periodWaitKind\(fmtNumber\(unset\)\)/);
  assert.doesNotMatch(draft, /`รอเลือกชนิด \$\{/, 'บรรทัดรองรอเลือกชนิดมาจากแคตตาล็อกเท่านั้น');
});

test('UAT 29/09 ข้อ 1: การ์ดรางแดงจากด่านของ server เท่านั้น · ด่าน "ยังไม่บันทึก" ของจอไม่ทำให้แถว (คิดจากของที่บันทึกแล้ว) แดง', () => {
  const checkedAt = '2026-09-29T03:00:00.000Z';
  const unsaved = { issues: serviceSetupIssues({ unsaved: true }), warnings: [], flow: 'backfill', source: 'client', checkedAt };
  const server = { issues: [{ key: 'kind_missing', tab: 'overview', lineId: 'L1', message: 'รายการ 1 · …' }], warnings: [], flow: 'backfill', source: 'server', checkedAt };
  assert.equal(backfillRailPressed(unsaved), false, 'ตรวจของที่ยังไม่บันทึกไม่ได้ — แถวของการ์ดคิดจากของเก่าที่คนแก้ไปแล้ว');
  assert.equal(backfillRailPressed(server), true);
  assert.equal(backfillRailPressed({ ...server, flow: 'pipeline' }), false, 'การ์ดรางเป็นของใบเดิม (backfill) เท่านั้น');
  assert.equal(backfillRailPressed({ ...server, source: undefined }), false, 'ไม่บอกที่มา = ไม่แดง (กฎ 3 — ปลอดภัยไว้ก่อน)');
  assert.equal(backfillRailPressed(null), false);
});

test('UAT 29/09 ข้อ 1: บันทึกงานบริการสำเร็จ = ล้างแผงแดงที่มีแต่ข้อ "ยังไม่บันทึก" · แผงของ server คงไว้ตัวเดิม (ภาพ ณ ตอนกด)', () => {
  const checkedAt = '2026-09-29T03:00:00.000Z';
  const unsaved = { issues: serviceSetupIssues({ unsaved: true }), warnings: [], flow: 'backfill', source: 'client', checkedAt };
  assert.equal(unsaved.issues[0].key, 'unsaved');
  assert.equal(submitIssuesAfterSave(unsaved), null);
  assert.equal(submitIssuesAfterSave({ ...unsaved, flow: 'pipeline' }), null, 'ยื่นอนุมัติก็เหมือนกัน');
  const server = { issues: [{ key: 'kind_missing', tab: 'overview', lineId: 'L1', message: 'รายการ 1 · …' }], warnings: [], flow: 'backfill', source: 'server', checkedAt };
  assert.equal(submitIssuesAfterSave(server), server, 'ตัวเดิม — memo ของช่องแดงไม่ขยับ (ตารางไม่ลืมว่าแก้ช่องไหนไปแล้ว)');
  const mixed = { ...server, issues: [...unsaved.issues, ...server.issues] };
  assert.equal(submitIssuesAfterSave(mixed), mixed, 'มีข้ออื่นปน = ไม่ใช่ของ "ยังไม่บันทึก" ล้วน — ไม่ล้าง');
  assert.equal(submitIssuesAfterSave(null), null);
});

test('UAT 29/09 ข้อ 3 (มติเจ้าของ): การ์ดราง "งานบริการ (ใบเดิม)" อยู่บนสุดของรางขวาระหว่างยังไม่ยื่นตรวจ · ยื่นแล้ว/รอตรวจกลับที่เดิม', () => {
  const backfill = (state, extra = {}) => viewFixture({ flow: 'backfill', state: { setupState: state }, ...extra });
  assert.equal(backfillRailOnTop(backfill(null)), true, 'กำลังตั้ง');
  assert.equal(backfillRailOnTop(backfill('rejected')), true, 'ตีกลับ — แก้แล้วยื่นใหม่');
  assert.equal(backfillRailOnTop(backfill(null, {
    period: null, allocations: [], lines: viewFixture().lines.map((line) => ({ ...line, kind: null, serviceProductId: null })),
  })), true, 'ยังไม่เริ่ม');
  assert.equal(backfillRailOnTop(backfill('submitted')), false, 'ยื่นตรวจแล้ว (รอผู้จัดการตรวจ) = ใต้การ์ดจัดการเอกสาร');
  assert.equal(backfillRailOnTop(viewFixture()), false, 'ใบร่าง (pipeline) ไม่มีการ์ดนี้');
  assert.equal(backfillRailOnTop(viewFixture({ flow: 'stamped' })), false, 'อนุมัติงานบริการแล้ว');
  assert.equal(backfillRailOnTop(null), false, 'ก้อน GET ยังไม่มา');
});

test('F10: แผงแดงรวมข้อซ้ำรายงวด (12× วันวางบิล) เป็นแถวเดียว "งวด 1–12 … · 12 งวด" · นับข้อยังเท่าเดิม · ไปแก้ที่งวดแรก', () => {
  const billing = (seq, billingMode = 'monthly') => ({
    key: 'billing_missing', tab: 'payment', installmentId: `I${seq}`, seq, field: 'billingDate', owner: 'SA', billingMode,
    message: `งวด ${seq}: ยังไม่เลือกรอบวางบิล (ลูกค้ามีรอบวางบิล)`,
  });
  const issues = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12].map((seq) => billing(seq));
  issues.push({ key: 'due_missing', tab: 'payment', installmentId: 'I4', seq: 4, field: 'dueDate', message: 'งวด 4: ยังไม่ใส่กำหนดชำระ — หรือเลือก ‘รอเหตุการณ์’' });
  const [payment] = submitGateGroups(issues, []);
  assert.equal(payment.count, 12, 'หัวกลุ่ม/ป้ายแท็บยังนับทุกข้อ');
  assert.equal(payment.items.length, 2);
  const merged = payment.items[0];
  assert.equal(merged.entry.message,
    'งวด 1–3, 5–12: ยังไม่เลือกรอบวางบิล (ลูกค้ามีรอบวางบิล) · 11 งวด — เติมทีเดียวได้ด้วย ‘ตั้งวันงวด’ → ‘เติมวันงวดที่ว่าง…’ ที่แท็บการชำระ');
  assert.equal(merged.entry.installmentId, 'I1', '"ไปแก้" พาไปงวดแรก');
  assert.equal(merged.entries.length, 11);
  assert.equal(issueHeadTail(merged.entry.message).head, 'งวด 1–3, 5–12', 'หัวตัวหนาครอบช่วงงวด');
  assert.equal(payment.items[1].entry.message, 'งวด 4: ยังไม่ใส่กำหนดชำระ — หรือเลือก ‘รอเหตุการณ์’', 'ข้อเดี่ยวไม่เปลี่ยน');
  /* ลูกค้าวางบิลได้ทุกวัน — แผง "เติมวันงวดที่ว่าง…" ของ #1846 เติมได้ทุกชนิดของรอบ (ปุ่มเติมตามรอบเดิมมีแค่รายเดือน) ⇒ บอกทางเดียวกัน */
  const anyday = [1, 2].map((seq) => ({ ...billing(seq, 'anyday'), message: `งวด ${seq}: ยังไม่ใส่วันวางบิล (ลูกค้าวางบิลได้ทุกวัน) — ใส่วันที่คอลัมน์วันวางบิล หรือเลือก ‘รอเหตุการณ์’` }));
  assert.equal(submitGateGroups(anyday, [])[0].items[0].entry.message,
    'งวด 1–2: ยังไม่ใส่วันวางบิล (ลูกค้าวางบิลได้ทุกวัน) — ใส่วันที่คอลัมน์วันวางบิล หรือเลือก ‘รอเหตุการณ์’ · 2 งวด — เติมทีเดียวได้ด้วย ‘ตั้งวันงวด’ → ‘เติมวันงวดที่ว่าง…’ ที่แท็บการชำระ');
});

test('#1846: ข้อวันงวดที่รวมหลายงวด (วันวางบิล · กำหนดชำระ) "ไปแก้" = เปิดแผงเติมของโหมดตั้งวันงวด · ช่วงครอบ/ข้อเดี่ยว = ไปที่ช่อง', () => {
  const issue = (key, seq, field, extra = {}) => ({
    key, tab: 'payment', installmentId: `I${seq}`, seq, field, owner: 'SA', message: `งวด ${seq}: ${key}`, ...extra,
  });
  // ลำดับจากด่าน: รายงวด วันวางบิล → กำหนดชำระ → ช่วงครอบ (serviceSetupIssues)
  const issues = [1, 2, 3].flatMap((seq) => [
    issue('billing_missing', seq, 'billingDate', { billingMode: 'anyday' }),
    issue('due_missing', seq, 'dueDate'),
    issue('coverage_missing', seq, 'coverage'),
  ]);
  const [payment] = submitGateGroups(issues, []);
  assert.equal(payment.count, 9);
  assert.deepEqual(payment.items.map((item) => [item.entry.key, item.entry.dateFill, item.jump]), [
    ['billing_missing', 'empty', true], ['due_missing', 'empty', true], ['coverage_missing', undefined, true],
  ], 'กลุ่มเรียงตามลำดับคอลัมน์ วันวางบิล → กำหนดชำระ · เฉพาะกลุ่มวันงวดเปิดแผงเติม');
  // ทางลัดบอกครั้งเดียวต่อแผง (สองกลุ่มวันงวดเปิดแผงเติมอันเดียวกัน — ต่อทั้งสองแถว = คำเดิมซ้ำ)
  const hinted = payment.items.filter((item) => item.entry.message.endsWith('‘เติมวันงวดที่ว่าง…’ ที่แท็บการชำระ'));
  assert.deepEqual(hinted.map((item) => item.entry.key), ['billing_missing']);
  // ลูกค้าที่ไม่ต้องมีวันวางบิล (ไม่มีเครดิต/ยังไม่ตั้ง) — กลุ่มกำหนดชำระได้ทางลัดเอง
  const dueOnly = submitGateGroups([1, 2].map((seq) => issue('due_missing', seq, 'dueDate')), [])[0].items;
  assert.equal(dueOnly[0].entry.dateFill, 'empty');
  assert.equal(dueOnly[0].entry.message, 'งวด 1–2: due_missing · 2 งวด — เติมทีเดียวได้ด้วย ‘ตั้งวันงวด’ → ‘เติมวันงวดที่ว่าง…’ ที่แท็บการชำระ');
  // งวดที่แผงเติมไม่แตะทั้งสองทาง (`dateFill: null` จากด่าน — เช่น แจ้งชำระแล้ว) = ไม่มีธง · ไม่มีทางลัด · ไปที่ช่องงวดแรก
  const locked = [1, 2, 3].map((seq) => issue('billing_missing', seq, 'billingDate', { billingMode: 'anyday', dateFill: null }));
  const [lockedItem] = submitGateGroups(locked, [])[0].items;
  assert.equal(lockedItem.entry.dateFill, undefined);
  assert.equal(lockedItem.entry.message, 'งวด 1–3: billing_missing · 3 งวด', 'ทางลัดพูดว่า "เติมทีเดียวได้" — ห้ามบอกเมื่อแผงเติมไม่แตะ');
  assert.equal(serviceSetupFieldId(lockedItem.entry), 'inst-I1-billingDate');
  // กลุ่มปน (บางงวดไม่มีทางไหนแตะ) = ทางลัดไม่จริงทั้งกลุ่ม ⇒ ไปที่ช่องเหมือนกัน · กลุ่มถัดไปที่เติมได้ทั้งกลุ่มยังได้ทางลัด
  const mixed = submitGateGroups([
    issue('billing_missing', 1, 'billingDate', { dateFill: 'empty' }), issue('billing_missing', 2, 'billingDate', { dateFill: null }),
    issue('due_missing', 1, 'dueDate', { dateFill: 'empty' }), issue('due_missing', 3, 'dueDate', { dateFill: 'empty' }),
  ], [])[0].items;
  assert.deepEqual(mixed.map((item) => [item.entry.key, item.entry.dateFill]), [['billing_missing', undefined], ['due_missing', 'empty']]);
  assert.ok(mixed[1].entry.message.endsWith('‘เติมวันงวดที่ว่าง…’ ที่แท็บการชำระ'));
  // ข้อเดี่ยว = ไปที่เซลล์ของงวดนั้น (แตะเซลล์ = เข้าโหมดตั้งวันที่งวดนั้นเอง) · ไม่มีธงเปิดแผงเติม (ธงรายงวดของด่านไม่หลุดมาเป็นคำขอเปิดแผง)
  const single = submitGateGroups([issue('billing_missing', 4, 'billingDate', { billingMode: 'monthly', dateFill: 'empty' })], [])[0].items[0];
  assert.equal(single.entry.dateFill, undefined);
  assert.equal(serviceSetupFieldId(single.entry), 'inst-I4-billingDate');
});

test('backfill ลูกค้าเครดิต (SO-26090206-0 · AR-015): งวดมีกำหนดชำระแล้วขาดวันวางบิล = "ไปแก้" เปิดแผงเติมพร้อม "จัดใหม่งวดที่มีวันแล้วด้วย" · ทางลัดบอกว่าวันถูกคิดใหม่', () => {
  const issue = (key, seq, field, extra = {}) => ({
    key, tab: 'payment', installmentId: `I${seq}`, seq, field, owner: 'SA', message: `งวด ${seq}: ${key}`, ...extra,
  });
  const seqs = Array.from({ length: 12 }, (_, i) => i + 1);
  // ทุกงวดของกลุ่มแตะได้ด้วย "จัดใหม่" เท่านั้น ⇒ ธงของกลุ่ม 'dated' (หน้าใบส่ง includeDated ต่อ) · ทางลัดคำของการจัดใหม่
  const [datedItem] = submitGateGroups(seqs.map((seq) => issue('billing_missing', seq, 'billingDate', { billingMode: 'anyday', dateFill: 'dated' })), [])[0].items;
  assert.equal(datedItem.entry.dateFill, 'dated');
  assert.equal(datedItem.entry.message, `งวด 1–12: billing_missing · 12 งวด${SERVICE_SETUP_PANEL_TEXT.dateFillRedateHint}`);
  assert.equal(SERVICE_SETUP_PANEL_TEXT.dateFillRedateHint,
    ' — จัดวันใหม่ทีเดียวได้ด้วย ‘ตั้งวันงวด’ → ‘เติมวันงวดที่ว่าง…’ → ‘จัดใหม่งวดที่มีวันแล้วด้วย’ ที่แท็บการชำระ'
    + ' (วันเดิมถูกแทนด้วยวันที่คิดตามรอบวางบิลของลูกค้า · ตรวจในตารางก่อนบันทึก)');
  assert.equal(serviceSetupFieldId(datedItem.entry), 'inst-I1-billingDate', 'เปิดแผงไม่ได้ = ถอยไปช่องของงวดแรกเหมือนเดิม');
  // กลุ่มปน ว่าง + มีวันแล้ว = ยังเปิดแผงได้ทั้งกลุ่ม (จัดใหม่ครอบงวดที่ว่างด้วย) ⇒ 'dated'
  const [both] = submitGateGroups([
    issue('billing_missing', 1, 'billingDate', { dateFill: 'empty' }), issue('billing_missing', 2, 'billingDate', { dateFill: 'dated' }),
  ], [])[0].items;
  assert.equal(both.entry.dateFill, 'dated');
  assert.ok(both.entry.message.endsWith(SERVICE_SETUP_PANEL_TEXT.dateFillRedateHint));
  // สองกลุ่มที่เปิดแผงคนละแบบ = ต่างคนต่างได้ทางลัดของตัวเอง (ครั้งเดียวต่อแบบ — แบบเดียวกันซ้ำ = คำเดิมซ้ำ)
  const two = submitGateGroups([
    ...[1, 2].map((seq) => issue('billing_missing', seq, 'billingDate', { dateFill: 'dated' })),
    ...[1, 2].map((seq) => issue('due_missing', seq, 'dueDate', { dateFill: 'empty' })),
  ], [])[0].items;
  assert.deepEqual(two.map((item) => item.entry.dateFill), ['dated', 'empty']);
  assert.ok(two[0].entry.message.endsWith(SERVICE_SETUP_PANEL_TEXT.dateFillRedateHint));
  assert.ok(two[1].entry.message.endsWith(SERVICE_SETUP_PANEL_TEXT.dateFillHint));
  // ด่านที่ยังไม่ส่งธง (ก้อน GET รุ่นก่อน) = ถือว่าค่าตั้งต้นเติมได้เหมือนเดิม · null = ไม่มีทางไหนแตะ (ไม่ใช่ "ไม่ส่ง")
  const [legacy] = submitGateGroups([1, 2].map((seq) => issue('due_missing', seq, 'dueDate')), [])[0].items;
  assert.equal(legacy.entry.dateFill, 'empty');
});

test('F4/F14: ข้อบล็อกของบัญชี (FN) ไม่มี "ไปแก้" + ป้ายรอฝ่ายบัญชี · กลุ่มที่มีแต่คำเตือนนับเป็น "เตือน n ข้อ"', () => {
  const groups = submitGateGroups(
    [
      { key: 'rounds_missing', tab: 'overview', lineId: 'L3', message: 'รายการ 3: ยังไม่ใส่จำนวนรอบบริการ' },
      { key: 'coverage_gap', tab: 'payment', owner: 'FN', tag: 'รอฝ่ายบัญชี', installmentId: 'I2', message: 'ช่วงครอบขาด … ที่บัญชีรับรองแล้ว — ฝ่ายบัญชีแก้ที่แผงงวด' },
    ],
    [],
  );
  const fn = groups[1].items[0];
  assert.deepEqual([fn.kind, fn.tag, fn.jump], ['issue', 'รอฝ่ายบัญชี', false]);
  const warnOnly = submitGateGroups(
    [{ key: 'rounds_missing', tab: 'overview', lineId: 'L3', message: 'รายการ 3: ยังไม่ใส่จำนวนรอบบริการ' }],
    [{ key: 'fn_coverage_missing', tab: 'payment', owner: 'FN', tag: 'รอฝ่ายบัญชี', message: 'งวด 1 (บัญชีรับรองแล้ว): ยังไม่มีช่วงครอบ' }],
  );
  assert.deepEqual(warnOnly.map((g) => [g.key, g.count, g.warnCount]), [['overview', 1, 0], ['payment', 0, 1]]);
});

test('F7: id ของปุ่ม "บันทึกงานบริการ" = serviceSetupFieldId ของข้อ "ยังไม่บันทึก"', () => {
  assert.equal(SAVE_FIELD_ID, 'svc-save');
  assert.equal(serviceSetupFieldId({ key: 'unsaved', field: 'save' }), SAVE_FIELD_ID);
});

test('stripParts — แถบผู้อนุมัติแยกป้าย/ส่วน · แยกไม่ได้ = ก้อนเดียว', () => {
  assert.deepEqual(stripParts('งานบริการ: 6 โซน · 5 ไซต์ · สัญญา: ยังไม่ผูก'), { label: 'งานบริการ:', parts: ['6 โซน', '5 ไซต์', 'สัญญา: ยังไม่ผูก'] });
  assert.deepEqual(stripParts('ข้อความเฉย ๆ'), { label: '', parts: ['ข้อความเฉย ๆ'] });
  assert.deepEqual(stripParts(''), { label: '', parts: [] });
});

test('surveyRequestHref — ลิงก์คำร้องประเมินพื้นที่พก kind · dealId · salesOrderId · returnTo (D19)', () => {
  const href = surveyRequestHref({ dealId: 'D-1', orderId: 'SO-1' });
  const url = new URL(href, 'https://x.test');
  assert.equal(url.pathname, '/requests/new');
  assert.equal(url.searchParams.get('kind'), 'site_survey');
  assert.equal(url.searchParams.get('dealId'), 'D-1');
  assert.equal(url.searchParams.get('salesOrderId'), 'SO-1');
  assert.equal(url.searchParams.get('returnTo'), '/sa/sales-orders/SO-1');
});

test('zonesBulkPlan — ติ๊กศูนย์/เกินเพดาน/แพ็คเท่ากันผิด = ติดด่าน · ตามผลประเมินนับโซนที่ว่าง', () => {
  const zonesById = new Map([['Z1', { assessedPackages: 2 }], ['Z2', { assessedPackages: null }], ['Z3', { assessedPackages: 1.5 }]]);
  assert.equal(zonesBulkPlan({ selectedIds: [], zonesById }).error, ZONES_BULK_NONE_PICKED);
  assert.equal(zonesBulkPlan({ selectedIds: ['Z1', 'Z2'], zonesById, existingCount: 499, cap: 500 }).error, zonesBulkCapText(500));
  assert.equal(zonesBulkCapText(500), 'เกิน 500 โซนต่อรายการ — แยกรายการที่ใบเสนอราคา');
  assert.equal(zonesBulkPlan({ selectedIds: ['Z1'], zonesById, mode: 'equal', equalPacks: '0' }).error, ZONES_BULK_PACKS_INVALID);
  assert.equal(zonesBulkPlan({ selectedIds: ['Z1'], zonesById, mode: 'equal', equalPacks: '' }).error, ZONES_BULK_PACKS_INVALID);

  const assessed = zonesBulkPlan({ selectedIds: ['Z1', 'Z2', 'Z3', 'Z1'], zonesById });
  assert.equal(assessed.error, null);
  assert.deepEqual(assessed.rows, [{ zoneId: 'Z1', packsPerRound: 2 }, { zoneId: 'Z2', packsPerRound: null }, { zoneId: 'Z3', packsPerRound: null }]);
  assert.deepEqual([assessed.count, assessed.assessed, assessed.blank], [3, 1, 2]);
  assert.equal(zonesBulkConsequence(assessed, { lineNo: 1 }), 'จะเพิ่ม 3 โซนใต้รายการ 1 · รอบละกี่แพ็ค: ตามผลประเมิน 1 โซน · ยังว่าง 2 โซน');

  const equal = zonesBulkPlan({ selectedIds: ['Z1', 'Z2'], zonesById, mode: 'equal', equalPacks: ' 3 ' });
  assert.deepEqual(equal.rows, [{ zoneId: 'Z1', packsPerRound: 3 }, { zoneId: 'Z2', packsPerRound: 3 }]);
  assert.equal(zonesBulkConsequence(equal, { lineNo: 2, mode: 'equal' }), 'จะเพิ่ม 2 โซนใต้รายการ 2 · แต่ละครั้งเท่ากันทุกโซน ครั้งละ 3 แพ็ค');
  assert.equal(zonesBulkPlan({ selectedIds: ['Z1'], zonesById, existingCount: 499, cap: 500 }).error, null, 'เต็มพอดี 500 ยังเพิ่มได้');
});

/* ══ มติเจ้าของ 29/09: "จำนวนรอบบริการ" ก่อน แล้วค่อยบอกว่า "แต่ละครั้งกี่แพ็ค" (ทั้งโหมดแก้และโหมดอ่าน) ═════════════════ */

test('29/09 จำนวนรอบบริการก่อน: ไม่มีคำเก่า (แพ็คต่อรอบ · แพ็ค/รอบ · รอบ/โซน · รอบบริการ (ต่อโซน)) บนจองานบริการ', () => {
  for (const rel of UI_FILES) {
    assert.doesNotMatch(code(rel), /แพ็คต่อรอบ|แพ็ค\/รอบ|รอบ\/โซน|รอบบริการ \(ต่อโซน\)|ต่อรอบ <b>/, rel);
  }
  assert.equal(ZONES_BULK_PACKS_INVALID, 'รอบละกี่แพ็ค ต้องเป็นจำนวนเต็ม 1–9999');
});

/* ══ มติเจ้าของ 30/09 (เลือกทาง A 01/10): การ์ด "งานบริการ" เป็นตาราง หนึ่งแถวต่อรายการ ═════════════════════════════════
   "มันต้องเลือกว่า รายการ เป็นงานบริการมั้ย ถ้าเป็น ก็มาเลือกว่า FG ไหน / Site Zone อะไร / ต้องไปกี่รอบ รอบละกี่แพ็ค
    ผลรวมแพ็คที่ใช้ทั้งหมด รายบรรทัด รวมทุกบรรทัด"
   ⭐ มติเจ้าของ 08/10: "อยากสลับ ข้อ 4 กับ ข้อ 5 เปลี่ยน หน่วยรอบบริการ จาก รอบ เป็น เดือน"
    ⇒ ① งานบริการ? → ② FG → ③ ไซต์ · โซน → ④ รอบละกี่แพ็ค (ต่อโซน · แพ็ค) → ⑤ จำนวนรอบบริการ (ต่อรายการ · เดือน) → ⑥ รวมแพ็ค
    (เดิม ④ จำนวนรอบบริการ → ⑤ รอบละกี่แพ็ค · หน่วย "รอบ") — ยามข้างล่างยึดลำดับ/หน่วยใหม่ทั้งหัว · DOM · CSS · แถวท้าย */

test('30/09 + 08/10 หัวคอลัมน์ ①→⑥ ตามลำดับของเจ้าของ — มาจากแคตตาล็อกเดียว (SERVICE_SETUP_GRID_TEXT.steps)', () => {
  assert.deepEqual(SERVICE_SETUP_GRID_TEXT.steps.map((step) => step.key), ['kind', 'fg', 'zones', 'packs', 'rounds', 'total']);
  assert.deepEqual(SERVICE_SETUP_GRID_TEXT.steps.map((step) => step.label),
    ['งานบริการ? · ช่วงบริการ', 'แพ็คเกจ FG', 'ไซต์ · โซน', 'รอบละกี่แพ็ค', 'จำนวนรอบบริการ', 'รวมแพ็ค']);
  /* คำใบ้ของ ④⑤⑥ — ⑥ พูดหน่วยเดือน "รอบละ × เดือน" (เดิม "รอบละ × รอบ") และอ่านหน่วยจาก `roundUnit` ที่เดียว */
  assert.deepEqual(SERVICE_SETUP_GRID_TEXT.steps.slice(3).map((step) => step.hint), ['ต่อโซน', 'ตลอดช่วงบริการ', `รอบละ × ${SERVICE_SETUP_LINE_TEXT.roundUnit}`]);
  assert.equal(SERVICE_SETUP_LINE_TEXT.roundUnit, 'เดือน');
  /* mig 0400 (มติเจ้าของ 01/10 รอบสอง): ช่วงบริการของรายการอยู่ใต้คำตอบในคอลัมน์ ① — หัวคอลัมน์บอกทั้งสองเรื่อง */
  assert.equal(SERVICE_SETUP_GRID_TEXT.steps[0].hint, 'ใช่ = ส่ง TS + ใส่ช่วง');
  assert.equal(SERVICE_SETUP_GRID_TEXT.steps.find((step) => step.key === 'rounds').label, SERVICE_SETUP_LINE_TEXT.roundsLabel);
  assert.equal(SERVICE_SETUP_GRID_TEXT.steps.find((step) => step.key === 'packs').label, SERVICE_SETUP_LINE_TEXT.packsLabel);
  assert.deepEqual(SERVICE_SETUP_GRID_TEXT.steps.map((step) => step.required), [true, true, true, true, true, false]);
  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  assert.match(grid, /const STEPS = SERVICE_SETUP_GRID_TEXT\.steps;/);
  assert.match(grid, /\{STEPS\.map\(\(step, index\) => \(/, 'หัวคอลัมน์วาดจากแคตตาล็อก ไม่เรียงเองในไฟล์');
});

test('30/09 + 08/10 แถวของรายการ: # · รายการ · ① · (② · ก้อน ③④⑤ · ⑥) — ในก้อนโซน ช่องโซน → ช่องแพ็ค → ช่องรอบ · ตอนพับเรียงตามลำดับเดียวกัน', () => {
  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  const line = grid.slice(grid.indexOf('function GridLine('), grid.indexOf('function GridFoot('));
  const at = (source, needle) => {
    const index = source.indexOf(needle);
    assert.ok(index >= 0, `ขาด ${needle}`);
    return index;
  };
  const ret = line.slice(line.lastIndexOf('return ('));
  assert.ok(at(ret, '<ItemCell') < at(ret, '<KindCell'));
  assert.ok(at(ret, '<KindCell') < at(ret, '{rest}'));
  assert.ok(at(line, '<FgCell') < at(line, '<ZoneBlock'));
  assert.ok(at(line, '<ZoneBlock') < at(line, '<TotalCell'));
  const block = grid.slice(grid.indexOf('function ZoneBlock('), grid.indexOf('function GridLine('));
  /* มติเจ้าของ 08/10 (สลับ ④⑤): ลำดับใน DOM ของแถวโซน = โซน → แพ็ค → รอบ (= ลำดับปุ่ม Tab บนจอกว้าง) — เดิม โซน → รอบ → แพ็ค */
  assert.ok(at(block, 'className={styles.zoneCell}') < at(block, 'className={styles.packsCell}'));
  assert.ok(at(block, 'className={styles.packsCell}') < at(block, 'className={styles.roundsCell}'));
  /* ช่อง ⑤ (จำนวนรอบบริการ + ชิป) มีครั้งเดียวต่อรายการ — กล่อง key="rounds" (แถวโซนอื่นได้ช่องว่าง key `pad:` · หน้าตาเดียวกับ rowspan ของม็อก) */
  assert.match(block, /<div key="rounds" className=\{styles\.roundsCell\} data-first="">\s*<StackLabel step="rounds" \/>\s*\{roundsCell\}\s*<\/div>/);
  assert.match(block, /if \(index > 0\) roundsPads\.push\(<div key=\{`pad:\$\{rowKey\}`\} className=\{styles\.roundsCell\} \/>\);/);
  const css = read(`${FOLDER}/ServiceSetupGrid.module.css`);
  /* ⭐ มติเจ้าของ 08/10 + ผลตรวจทาน (ui-1): ลำดับปุ่ม Tab = ลำดับที่ตาเห็น **ทั้งผังตารางและการ์ดพับ** — CSS `order` ย้ายได้แค่ภาพ
     ⇒ ช่องของก้อนโซนเป็นลูกโดยตรงของก้อน (มี key · ไม่มีกล่องห่อรายแถว `.zoneRow` แบบเดิม) และก้อนโซนเรียงใน DOM ตามผังที่ใช้:
       ตาราง   : (โซน → แพ็ค → รอบ/ช่องว่าง) ทีละแถว → ปุ่มเพิ่มโซน → คำเตือนรอบน้อย
       การ์ดพับ : โซนทั้งหมด → ปุ่มเพิ่มโซน → แพ็ครายโซน → รอบ → คำเตือนรอบน้อย
     การ์ดพับไม่ได้มีแค่มือถือ — คอลัมน์เอกสารข้างรางขวาแคบกว่าเกณฑ์ที่จอกว้างราว 1051–1338px ด้วย
     (วัดจากคอมโพเนนต์ตัวจริงใน Chrome 08/10 · ฮาร์เนส mockups/so-service-lines/ui-harness-months: tabcheck.mjs กด Tab จริง 11 ฉาก × 6 ขนาดจอ) */
  assert.doesNotMatch(grid, /styles\.zoneRow/, 'ไม่มีกล่องห่อรายแถว — มีแล้วช่องสลับลำดับข้ามแถวไม่ได้');
  assert.doesNotMatch(css, /\.zoneRow\b/);
  assert.match(block, /key=\{`zone:\$\{rowKey\}`\} className=\{styles\.zoneCell\}/);
  assert.match(block, /key=\{`packs:\$\{rowKey\}`\} className=\{styles\.packsCell\}/);
  assert.match(block, /const cells = folded\s*\? \[\.\.\.zoneCells, foot, \.\.\.packsCells, roundsBox, note\]\s*: \[\.\.\.zoneRows\.flatMap\(\(_, index\) => \[zoneCells\[index\], packsCells\[index\], index === 0 \? roundsBox : roundsPads\[index - 1\]\]\), foot, note\];/,
    'ลำดับใน DOM ของสองผัง');
  assert.match(block, /<div className=\{styles\.zoneBlock\} data-invalid=\{zonesError \? "" : undefined\}>\s*\{cells\}\s*<\/div>/);
  /* ตารางรู้ว่าพับอยู่จาก CSS เอง (ธง `--svc-grid-folded` ที่บล็อก @container ตั้ง) — ไม่มีเลขความกว้างซ้ำในคอมโพเนนต์ */
  const hook = grid.slice(grid.indexOf('function useGridFolded('), grid.indexOf('function StackLabel('));
  assert.match(hook, /getComputedStyle\(node\)\.getPropertyValue\("--svc-grid-folded"\)\.trim\(\) === "1"/);
  assert.match(hook, /new ResizeObserver\(read\)/);
  assert.doesNotMatch(hook, /\b900\b|matchMedia|innerWidth/, 'เกณฑ์ความกว้างอยู่ที่ CSS ที่เดียว');
  assert.match(hook, /node\.focus\(\{ preventScroll: true \}\)/, 'ผังสลับระหว่างพิมพ์ = คืนโฟกัสให้ช่องเดิม');
  assert.match(grid, /const folded = useGridFolded\(gridRef\);/);
  assert.match(grid, /<div ref=\{gridRef\} className=\{styles\.grid\} role="group"/);
  assert.match(line, /<ZoneBlock\s+line=\{line\}\s+editable=\{editable\}\s+folded=\{folded\}/);
  assert.match(css, /\.grid \{\s*--svc-grid-folded: 0;/);
  /* หัว · ก้อนโซน · แถวท้าย เรียงคอลัมน์เดียวกัน: … ③ โซน (ยืด) | ④ แพ็ค | ⑤ รอบ | ⑥ รวม */
  assert.match(css, /\.head \{\s*display: grid;\s*grid-template-columns:\s*var\(--c-idx\) var\(--c-item\) var\(--c-kind\) var\(--c-fg\) minmax\(0, 1fr\)\s*var\(--c-packs\) var\(--c-rounds\) var\(--c-total\);/);
  assert.match(css, /\.zoneBlock \{\s*display: grid;\s*min-width: 0;\s*grid-template-columns: minmax\(0, 1fr\) var\(--c-packs\) var\(--c-rounds\);/);
  assert.match(css, /\.foot \{\s*display: grid;\s*grid-template-columns:\s*var\(--c-idx\) var\(--c-item\) var\(--c-kind\) var\(--c-fg\) minmax\(0, 1fr\)\s*var\(--c-packs\) var\(--c-rounds\) var\(--c-total\);/);
  /* การ์ดพับ: ③ โซนทั้งหมด (+ ปุ่มเพิ่มโซน) → ④ แพ็ครายโซน → ⑤ รอบ (+ คำเตือนรอบน้อย)
     `order` = ตัวสำรองของเฟรมแรกก่อน JS อ่านธง (DOM ยังเรียงแบบตาราง) — ภาพต้องถูกทั้งสองกรณี · ธงพับตั้งในบล็อกเดียวกัน */
  const stacked = css.slice(css.indexOf('@container (max-width: 900px)'));
  assert.match(stacked, /\.grid \{ --svc-grid-folded: 1; \}/);
  assert.equal(css.split('--svc-grid-folded: 1').length - 1, 1, 'ธงพับตั้งที่บล็อก @container ที่เดียว');
  assert.match(stacked, /\.zoneCell,\s*\.zoneFoot \{ order: 1; \}/);
  assert.match(stacked, /\.packsCell \{ order: 2; \}/);
  assert.match(stacked, /\.roundsCell,\s*\.roundsNote \{ order: 3; \}/);
  assert.match(stacked, /\.roundsCell:not\(\[data-first\]\) \{ display: none; \}/);
  /* ข้อความแดงของช่องแพ็คขึ้นบรรทัดของตัวเองตอนพับ (ไม่บีบชื่อโซน — วัดจากจอ 390px 08/10) */
  assert.match(stacked, /\.packsCell \.error \{\s*flex-basis: 100%;\s*\}/);
  /* แถวท้าย: ช่อง รอบละ (แพ็ค) → จำนวนรอบบริการ (เดือน) → รวม — ลำดับเดียวกับคอลัมน์ ④⑤⑥ · หน่วยจากแคตตาล็อก */
  const foot = grid.slice(grid.indexOf('function GridFoot('), grid.indexOf('export default function ServiceSetupGrid('));
  assert.ok(at(foot, 'data-col="packs"') < at(foot, 'data-col="rounds"'));
  assert.ok(at(foot, 'data-col="rounds"') < at(foot, 'data-col="total"'));
  assert.match(foot, /<b>\{rounds \?\? NA\}<\/b> <span className=\{styles\.unit\}>\{SERVICE_SETUP_LINE_TEXT\.roundUnit\}<\/span>/);
  assert.doesNotMatch(grid, />รอบ<|>แพ็ค<|\} รอบ`/, 'ตารางไม่สะกดหน่วยเอง — อ่านจาก SERVICE_SETUP_LINE_TEXT.roundUnit / packUnit');
  /* ⑥ = รอบละ (Σ ทุกโซน) × จำนวนรอบบริการ + เทียบจำนวนในใบ (ไม่บังคับให้เท่า) · แถวท้ายรวมทุกรายการ */
  const total = grid.slice(grid.indexOf('function TotalCell('), grid.indexOf('function ZonePick('));
  assert.match(total, /const totals = lineSetupTotals\(ctxLine, ctx\);/);
  /* สูตรใต้ตัวเลข "1 × 6 เดือน" — หน่วยจากแคตตาล็อก (มติ 08/10) */
  assert.match(total, /× \$\{totals\.rounds \? fmtNumber\(totals\.rounds\) : NA\} \$\{SERVICE_SETUP_LINE_TEXT\.roundUnit\}`\}/);
  assert.match(total, /const cross = lineQtyCrossCheck\(ctxLine, totals\);/);
  assert.match(grid, /<GridFoot totals=\{totals\} \/>/);
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  assert.match(lines, /<ServiceSetupGrid\s+lines=\{merged\}/);
  assert.match(lines, /totals=\{totals\}/);
});

/* ── เลขแพ็คของบรรทัด (mig 0407 · งวด PR-2 · docs/qt-pack-column.md) — ตารางงานบริการ "อ่าน" เลขแพ็คของใบ ยังไม่มีช่องกรอก ── */
test('0407 บรรทัดที่มีเลขแพ็ค: ctxLineOf ส่งเลขแพ็คต่อให้ตัวเทียบ · “ในใบ 2 แพ็ค × 12 เดือน” · บรรทัดเดิมรูปเดิมทุกคีย์', () => {
  const view = viewFixture();
  const merged = mergedLines(view, EMPTY_DRAFT, { fgById: fgById(view) });
  const today = Object.keys(ctxLineOf(merged[1]));
  assert.equal(today.includes('packQty'), false, 'บรรทัดที่ไม่มีเลขแพ็ค: ไม่มีคีย์ (ไม่ใช่ null)');
  // ค่าที่ไม่ใช่เลขแพ็คไม่เพิ่มคีย์ — รูปเท่าเดิมทุกตัว
  for (const packQty of [null, undefined, '', 'abc', 0, 1.5, 10000]) {
    assert.deepEqual(ctxLineOf({ ...merged[1], packQty }), ctxLineOf(merged[1]), `packQty: ${String(packQty)}`);
  }
  const pack = ctxLineOf({ ...merged[1], qty: 12, unit: 'เดือน', packQty: '2' });
  assert.equal(pack.packQty, 2);
  assert.deepEqual(Object.keys(pack).filter((key) => key !== 'packQty'), today);
  // view → mergedLines พกคีย์จากก้อน GET มาถึงแถวบนจอ (`...line`)
  const packView = viewFixture();
  packView.lines = packView.lines.map((line) => (line.lineId === 'L2' ? { ...line, qty: 12, unit: 'เดือน', packQty: 2 } : line));
  const packMerged = mergedLines(packView, EMPTY_DRAFT, { fgById: fgById(packView) });
  assert.equal(packMerged[1].packQty, 2);
  assert.equal(Object.prototype.hasOwnProperty.call(packMerged[0], 'packQty'), false);

  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  const item = grid.slice(grid.indexOf('function ItemCell('), grid.indexOf('function KindCell('));
  /* ข้อความเดิมของบรรทัดที่ไม่มีเลขแพ็คอยู่หลัง `??` ครบทั้งนิพจน์ — ตัวช่วยคืน null เมื่อไม่มีเลขแพ็ค */
  assert.match(item, /const qtyText = linePackQtyText\(line\) \?\? \(line\.qty === null \|\| line\.qty === undefined \|\| line\.qty === ""\s*\? null\s*: `\$\{Number\.isFinite\(qty\) \? fmtNumber\(qty\) : String\(line\.qty\)\}\$\{line\.unit \? ` \$\{line\.unit\}` : ""\}`\);/);
  assert.match(item, /\{qtyText \? <span className=\{styles\.itemQty\}>ในใบ \{qtyText\}<\/span> : null\}/);
  /* คำสั้นใต้ ⑥: บรรทัดที่มีเลขแพ็คบอกหน่วยรวม + หน่วยจากแคตตาล็อก · บรรทัดอื่นนิพจน์เดิม */
  const cross = grid.slice(grid.indexOf('const CROSS_SHORT'), grid.indexOf('function TotalCell('));
  assert.match(cross, /warn: \(line\) => \(lineHasPacks\(line\)\s*\? `≠ ในใบ \$\{fmtNumber\(lineUnitsTotal\(line\)\)\} \$\{SERVICE_SETUP_LINE_TEXT\.packUnit\} · ตรวจอีกครั้ง`\s*: `≠ ในใบ \$\{naText\(line\.qty === null \|\| line\.qty === undefined \? null : fmtNumber\(Number\(line\.qty\)\)\)\} · ตรวจอีกครั้ง`\),/);
  /* 🔴 อ่านอย่างเดียว: ตารางงานบริการไม่มีช่องกรอก/ตัวส่งค่าเลขแพ็ค (งวด PR-4 เป็นเจ้าของ) */
  for (const rel of UI_FILES.filter((file) => file.startsWith(FOLDER))) {
    assert.doesNotMatch(code(rel), /packQty\s*=[^=]|onPatch\([^)]*packQty|name="packQty"|<(?:Input|input|MoneyInput|Select)\b[^>]*packQty/, `${rel} ต้องไม่เขียนเลขแพ็ค`);
  }
});

test('30/09 ช่องตัวเลข/ป้ายจากแคตตาล็อกเดียว — จำนวนรอบบริการ · รอบละกี่แพ็ค · ยังไม่ใส่ · ดินสอของใบอนุมัติแล้ว', () => {
  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  assert.match(grid, /aria-label=\{`\$\{SERVICE_SETUP_LINE_TEXT\.roundsLabel\} รายการ \$\{line\.lineNo\}`\}/);
  assert.match(grid, /aria-label=\{`\$\{SERVICE_SETUP_LINE_TEXT\.packsLabel\} /);
  assert.match(grid, /<span className=\{styles\.unit\}>\{SERVICE_SETUP_LINE_TEXT\.packUnit\}<\/span>/);
  assert.match(grid, /<span className=\{styles\.unit\}>\{SERVICE_SETUP_LINE_TEXT\.roundUnit\}<\/span>/);
  assert.match(grid, /SERVICE_SETUP_LINE_TEXT\.noRounds/);
  assert.match(grid, /SERVICE_SETUP_LINE_TEXT\.noPacks/);
  assert.match(grid, /roundChipsFromPeriod\(period\)\.filter\(\(chip\) => chip\.key === "monthly"\)/, 'ชิป ทุกเดือน ≈ n อยู่ใต้ช่องจำนวนรอบบริการ');
  const read = grid.slice(grid.indexOf('function RoundsRead('), grid.indexOf('/* ── ⑥'));
  assert.match(read, /\{canEditRounds \? <StampedRoundsEdit line=\{line\} onRoundsSave=\{onRoundsSave\} \/> : null\}/, 'ดินสออยู่ช่อง ⑤ (จำนวนรอบบริการ · มติ 08/10) ของใบที่ประทับแล้ว');
  /* ดินสอพูดหน่วยเดียวกับตาราง: ล้างค่าไม่ได้ = "…อย่างน้อย 1 เดือน" (ใบ pipeline · `requiredMonths`) */
  assert.match(grid, /setError\(SERVICE_ROUNDS_EDIT_TEXT\.requiredMonths\)/);
});

test('29/09 คำเตือนรอบน้อย: เทาใต้ก้อนโซน ทั้งโหมดแก้และโหมดอ่าน (ใบอนุมัติแล้วด้วย) · ไม่แดง · คำตามขั้นของใบ', () => {
  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  assert.match(grid, /const roundsLow = lineRoundsLowText\(positiveIntOrNull\(line\.rounds\), period, \{ stage: editable \? "submit" : roundsLowStage \}\);/);
  /* 08/10: คำเตือนอยู่กล่องของตัวเองท้ายก้อนโซน (`.roundsNote`) — การ์ดพับตามหลังช่อง ⑤ ที่มันพูดถึง (เดิมอยู่ในแถวปุ่มเพิ่มโซน
     ซึ่งพอ ④ แพ็ครายโซนมาคั่น จะลอยห่างจากช่องจำนวนรอบบริการ) · ยังเป็นบรรทัดเทา role="status" ไม่แดง */
  /* กล่องมี key="note" — ก้อนโซนประกอบลำดับช่องเองตามผัง (มติ 08/10: ลำดับ Tab = ที่ตาเห็น) · คำเตือนอยู่ท้ายสุดทั้งสองผัง */
  assert.match(grid, /const note = roundsLow \? \(\s*<div key="note" className=\{styles\.roundsNote\}>\s*<span className=\{styles\.note\} role="status">\{roundsLow\}<\/span>\s*<\/div>\s*\) : null;/);
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  assert.match(lines, /roundsLowStage=\{flow === "stamped" \? "approved" : "read"\}/);
  const css = read(`${FOLDER}/ServiceSetupGrid.module.css`);
  assert.match(css, /\.hint,\s*\.note \{[^}]*color: var\(--text-3\);/, 'เทา ไม่ใช่แดง/เหลือง');
  assert.match(css, /\.roundsNote \{\s*display: flex;\s*grid-column: 1 \/ -1;/, 'จอกว้าง: กินเต็มก้อนโซน');
});

/* มติเจ้าของ 29/09 รอบสอง: "ไปกี่รอบ เปลี่ยน เป็น คำว่า จำนวนรอบบริการ" — ทุกผิวอ่านคำจากแคตตาล็อก ห้ามเหลือคำเก่าในโค้ด
   (คอมเมนต์ที่เล่าที่มาไม่นับ) · `ไป ${…} รอบ` แบบเดิม = ประโยครอบที่ไม่ผ่านแคตตาล็อก ("ยกไป ${…}" ของคำอื่นไม่ใช่ — มีสระ/พยัญชนะนำ) */
test('29/09 รอบสอง: ไม่มี "ไปกี่รอบ" / "ไป n รอบ" เหลือบนผิวงานบริการ — คำมาจาก SERVICE_SETUP_LINE_TEXT', () => {
  const surfaces = [
    ...UI_FILES,
    'lib/sales/serviceSetup.js',
    'lib/sales/salesOrderPayments.js',
    'lib/service/legacySetupQueue.js',
    'app/service/intake/page.js',
    'app/sales-planning/sales-orders/page.js',
    'app/sales-planning/sales-orders/[id]/page.js',
    'app/api/sales-planning/sales-orders/route.js',
  ];
  for (const rel of surfaces) {
    const src = code(rel);
    assert.doesNotMatch(src, /ไปกี่รอบ/, rel);
    assert.doesNotMatch(src, /(?<![฀-๿])ไป (?:\$\{[^}]*\}|\d+)(?:–(?:\$\{[^}]*\}|\d+))? รอบ/, rel);
  }
  assert.match(code('components/salesPlanning/serviceSetup/ServiceSetupGrid.js'),
    /aria-label=\{`แก้\$\{SERVICE_SETUP_LINE_TEXT\.roundsLabel\} รายการ \$\{line\.lineNo\}`\}/, 'ดินสอ: "แก้จำนวนรอบบริการ รายการ n"');
  /* salesOrderPayments.js import serviceSetup.js ไม่ได้ (วง) ⇒ เขียน literal เอง — ยึดให้ตรงกับแคตตาล็อก */
  const revoke = salesOrderMoneyOutcome({ id: 'SO1', status: 'approved' }, [], 'revoke', { serviceRounds: true }).at(-1);
  /* ไล่ตามลำดับหัวตาราง ②→⑤ (มติเจ้าของ 08/10): แพ็คเกจ/โซน/รอบละกี่แพ็ค/จำนวนรอบบริการ/ช่วงบริการ */
  assert.ok(revoke.includes(`แพ็คเกจ/โซน/${SERVICE_SETUP_LINE_TEXT.packsLabel}/${SERVICE_SETUP_LINE_TEXT.roundsLabel}/ช่วงบริการ`), revoke);
});

/* ⭐ มติเจ้าของ 08/10 ("อยากสลับ ข้อ 4 กับ ข้อ 5 …") + ผลตรวจทาน (ui-2): แถวตรวจของการ์ดรางจัดกลุ่มตามคอลัมน์ของตาราง —
   แถวแรก = ① ② "งานบริการ? · แพ็คเกจ" · แถวสอง = ก้อนโซน ③ ④ ⑤ "ไซต์ · โซน · รอบละกี่แพ็ค · จำนวนรอบบริการ"
   (เดิม 30/09: "งานบริการ? · แพ็คเกจ · จำนวนรอบบริการ" อยู่เหนือ "ไซต์ · โซน · รอบละกี่แพ็ค" — สวนกับแบนเนอร์/ตาราง/แผงแดงของหน้าเดียวกัน)
   🔴 จัดที่จอเท่านั้น: กุญแจของข้อและลำดับของ server ไม่ถูกแตะ */
test('30/09 + 08/10 การ์ดราง/ข้อสั้น — แถวบรรทัด "งานบริการ? · แพ็คเกจ" · แถวโซน "ไซต์ · โซน · รอบละกี่แพ็ค · จำนวนรอบบริการ" (ลำดับคอลัมน์)', () => {
  const view = viewFixture({
    flow: 'backfill',
    issues: [
      { key: 'rounds_missing', lineId: 'L3', tab: 'overview', message: 'รายการ 3: ยังไม่ใส่จำนวนรอบบริการ' },
      { key: 'packs_missing', lineId: 'L2', zoneId: 'Z1', tab: 'overview', message: 'รายการ 2 · Floor 1: ยังไม่ใส่รอบละกี่แพ็ค' },
    ],
  });
  const rows = Object.fromEntries(backfillRailChecks(view).map((row) => [row.key, row]));
  assert.equal(rows.lines.label, 'งานบริการ? · แพ็คเกจ');
  assert.deepEqual([rows.lines.value, rows.lines.sub, rows.lines.ok], ['4/4 รายการ', null, true], 'ข้อจำนวนรอบบริการไม่นับในแถว ① ② แล้ว');
  assert.equal(rows.zones.label, `ไซต์ · โซน · ${SERVICE_SETUP_LINE_TEXT.packsLabel} · ${SERVICE_SETUP_LINE_TEXT.roundsLabel}`);
  assert.equal(rows.zones.label, 'ไซต์ · โซน · รอบละกี่แพ็ค · จำนวนรอบบริการ');
  /* สองรายการติดข้อ (รายการ 3 ขาดจำนวนรอบบริการ · รายการ 2 ขาดแพ็ค · รายการ 1 ยังไม่ตอบ ⇒ ครบ 0 จาก 3 รายการที่อาจเป็นงานบริการ)
     — ข้อแรกตามลำดับที่ server ส่ง (ข้ามรายการไม่สลับ) */
  assert.deepEqual([rows.zones.value, rows.zones.sub, rows.zones.ok], ['0/3 รายการ', 'รายการ 3: ยังไม่ใส่จำนวนรอบบริการ · อีก 1 รายการ', false]);

  /* รายการเดียวขาดทั้งจำนวนรอบบริการและแพ็ค: server ส่ง รอบ → แพ็ค · การ์ดรางขึ้นข้อแพ็คก่อน (ลำดับคอลัมน์ ④ → ⑤ — ตัวจัดเดียวกับแผงแดง) */
  const sameLine = Object.fromEntries(backfillRailChecks(viewFixture({
    flow: 'backfill',
    issues: [
      { key: 'rounds_missing', lineId: 'L2', tab: 'overview', message: 'รายการ 2: ยังไม่ใส่จำนวนรอบบริการ' },
      { key: 'packs_missing', lineId: 'L2', zoneId: 'Z1', tab: 'overview', message: 'รายการ 2 · Floor 1: ยังไม่ใส่รอบละกี่แพ็ค' },
    ],
  })).map((row) => [row.key, row]));
  assert.deepEqual([sameLine.zones.value, sameLine.zones.sub], ['1/3 รายการ', 'รายการ 2: ยังไม่ใส่รอบละกี่แพ็ค']);
  assert.equal(sameLine.lines.ok, true);
  const draft = code(`${FOLDER}/serviceSetupDraft.js`);
  assert.match(draft, /const issues = issuesInColumnOrder\(view\.issues\);/, 'การ์ดรางไล่ข้อผ่านตัวจัดลำดับเดียวกับแผงแดง');
  /* แบนเนอร์ของหน้าเดียวกันไล่ลำดับเดียวกัน */
  assert.match(backfillBannerText(viewFixture({ flow: 'backfill' })), /แพ็คเกจ · ไซต์ · โซน · รอบละกี่แพ็ค · จำนวนรอบบริการ · ช่วงบริการ/);
});

/* ══ ส่วนที่ 2: ยามซอร์ส (แผน §2.7) ═══════════════════════════════════════════════════════════════════ */

test('D19: ไม่มีปุ่ม "ขอ TS เพิ่มไซต์" / TaskFormModal / มอบหมายงานข้ามฝ่าย — มีแค่ลิงก์คำร้อง + บรรทัดแนะนำ', () => {
  const paths = code(`${FOLDER}/ServiceRegistryPaths.js`);
  assert.doesNotMatch(paths, /TaskFormModal|personal-tasks|ขอ TS เพิ่มไซต์/);
  assert.match(paths, /surveyRequestHref\(\{ dealId, orderId \}\)/);
  assert.match(read(`${FOLDER}/ServiceRegistryPaths.js`), /แจ้งหัวหน้า TS ให้เพิ่มที่ ทะเบียนไซต์ › เพิ่มไซต์ย้อนหลัง/);
  for (const rel of UI_FILES) assert.doesNotMatch(code(rel), /TaskFormModal|personal-tasks/, rel);
});

test('01/10: การ์ดราคาไม่มีอะไรของงานบริการแทรก — QuotationReadOnlyLineItems ไม่มี renderAfterRow แล้ว (ตารางเดียวกับใบเสนอราคาทุกตัวอักษร)', () => {
  const source = code('components/salesPlanning/QuotationLineItems.js');
  assert.doesNotMatch(source, /renderAfterRow|afterRow/);
  assert.doesNotMatch(read('components/salesPlanning/QuotationLineItems.module.css'), /afterRow/);
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  const priceCard = lines.slice(lines.indexOf('<QuotationReadOnlyLineItems'), lines.indexOf('/>', lines.indexOf('<QuotationReadOnlyLineItems')));
  assert.doesNotMatch(priceCard, /renderAfterRow/);
  assert.match(lines, /\{SERVICE_SETUP_GRID_TEXT\.pointer\}/, 'ท้ายการ์ดราคาชี้ไปการ์ดงานบริการ');
});

test('ไม่มี style={{ …}} · จอเรียก API ผ่าน apiJson/apiFetch เท่านั้น · เขียนข้อมูลไม่ลองซ้ำ', () => {
  for (const rel of UI_FILES) {
    const source = code(rel);
    assert.doesNotMatch(source, /style=\{\{/, `${rel}: สไตล์ต้องอยู่ใน .module.css`);
    assert.doesNotMatch(source.replace(/\bapiFetch\(|\bapiJson\(/g, ''), /\bfetch\(/, `${rel}: ห้าม fetch ดิบ`);
    assert.doesNotMatch(source, /retry:\s*true/, `${rel}: PATCH/POST ห้ามลองซ้ำ`);
  }
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  assert.match(lines, /apiJson\(`\/api\/sales-planning\/sales-orders\/\$\{encodeURIComponent\(orderId\)\}\/service-setup`, \{\s*method: "PATCH", json: payload, fallbackError: SAVE_FAILED,\s*\}\)/);
  const hook = code(`${FOLDER}/useServiceSetup.js`);
  assert.match(hook, /apiJson\(setupUrl\(orderId\), \{ cache: "no-store"/);
  assert.match(hook, /apiJson\(registryUrl\(customerId\), \{ cache: "no-store"/);
  assert.doesNotMatch(hook, /useRevalidateOnFocus/, 'โหลดใหม่เงียบ ๆ ระหว่างแก้ = expectedUpdatedAt ขยับตาม ทับของอีกหน้าต่าง');
});

test('เวลาของใบ (expectedUpdatedAt) ไม่ผ่าน Date — ส่งค่าจาก GET ตามตัวอักษร', () => {
  const draft = code(`${FOLDER}/serviceSetupDraft.js`);
  assert.match(draft, /expectedUpdatedAt: view\.updatedAt \?\? null/);
  assert.doesNotMatch(draft, /new Date\(|Date\.parse|toISOString/);
});

test('ช่องค้นหา/ช่องกรอกทุกช่องมี autoComplete="off"', () => {
  for (const rel of JSX_FILES) {
    const source = code(rel);
    for (const match of source.matchAll(/<(input|Input)\b[\s\S]*?\/>/g)) {
      if (/type="checkbox"/.test(match[0])) continue;
      assert.match(match[0], /autoComplete="off"/, `${rel}: ${match[0].slice(0, 80)}…`);
    }
  }
  assert.match(code('components/service/ZonesBulkModal.js'), /type="search"\s*autoComplete="off"/);
});

test('① งานบริการ? ไม่มีค่าตั้งต้น — ปุ่มแยก ✓ ใช่ / ✕ ไม่ใช่ จาก SERVICE_KIND_OPTIONS · ยังไม่ตอบ = ไม่มีปุ่มไหนถูกเลือก + คำชวน · ลูกศรไม่เปลี่ยนคำตอบเอง', () => {
  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  const answer = grid.slice(grid.indexOf('function AnswerButtons('), grid.indexOf('/* ── ① งานบริการ? ── */'));
  assert.match(answer, /const value = line\.role === SERVICE_ROLE_UNSET \? null : line\.role;/, 'ยังไม่รู้ = null (ไม่มีค่าตั้งต้น)');
  assert.match(answer, /\{SERVICE_KIND_OPTIONS\.map\(\(option, index\) => \{/);
  assert.match(answer, /role="radiogroup"/);
  assert.match(answer, /role="radio"\s+aria-checked=\{on\}/);
  assert.match(answer, /onClick=\{\(\) => onPick\(option\.value\)\}/);
  /* ตอบ "ไม่ใช่" ล้างแพ็คเกจ/โซน — ลูกศรย้ายโฟกัสอย่างเดียว ห้ามเรียก onPick */
  const move = answer.slice(answer.indexOf('const moveFocus'), answer.indexOf('return ('));
  assert.match(move, /buttons\.current\[next\]\?\.focus\(\);/);
  assert.doesNotMatch(move, /onPick/);
  assert.match(answer, /\{answered \? null : <span className=\{styles\.answerAsk\}>\{SERVICE_SETUP_GRID_TEXT\.pickAnswer\}<\/span>\}/);
  assert.equal(SERVICE_SETUP_GRID_TEXT.pickAnswer, 'เลือกคำตอบ');
  assert.doesNotMatch(grid, /Segmented/, 'แถบสองช่องในกรอบเดียวดูเป็นแถบเทาแถบเดียวตอนยังไม่ตอบ (ภาพของเจ้าของ 01/10)');
  assert.match(grid, /id=\{lineFieldId\(line\.lineId, "kind"\)\} data-invalid=\{error \? "" : undefined\}/);
  const css = read(`${FOLDER}/ServiceSetupGrid.module.css`);
  assert.match(css, /--c-kind: 156px;/, 'คอลัมน์ ① กว้างพอสองปุ่ม + ช่องวันของช่วงบริการ (เดิม 132px · mig 0400) — "ไม่ใช่" ไม่ชนขอบ');
  assert.match(css, /\.kind\[data-invalid\] \.answerButton \{\s*border-color: var\(--red\);/);
  assert.match(css, /\.answerAsk \{[^}]*color: var\(--accent-ink\);/, 'คำชวนไม่ใช่สีแดง (กฎ 3)');
});

test('กฎ 3: สีแดงมาหลังกดเท่านั้น — ทุก invalid/data-invalid/data-bad อ้างผลหลังกด (highlight · error · pressed · blocked)', () => {
  for (const rel of JSX_FILES) {
    const source = code(rel);
    for (const match of source.matchAll(/(?:\binvalid|data-invalid|data-bad)=\{([^}]*)\}/g)) {
      assert.match(match[1], /error|Error|pressed|blocked/, `${rel}: ${match[0]}`);
    }
  }
  /* ข้อความแดงของช่องมาจาก highlightOf (แผงแดงของหน้า/ผลบันทึกไม่ผ่าน) ไม่ใช่ตัวตรวจบนจอ */
  const block = code(`${FOLDER}/ServiceSetupGrid.js`);
  assert.match(block, /const kindError = highlightOf\(lineFieldId\(line\.lineId, "kind"\)\);/);
  assert.match(block, /error=\{highlightOf\(lineFieldId\(line\.lineId, "fg"\)\)\}/);
  assert.match(block, /error=\{highlightOf\(lineFieldId\(lineId, "rounds"\)\)\}/);
  assert.match(block, /const tone = missing\.state === "complete" \? "ok" : pressed \? "error" : "neutral";/, 'ป้ายสถานะเป็นกลางก่อนกด');
  const rail = code(`${FOLDER}/ServiceBackfillPanel.js`);
  assert.match(rail, /data-bad=\{pressed && !row\.ok \? "" : undefined\}/, 'แถวตรวจของการ์ดรางแดงหลังกดเท่านั้น');
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  assert.match(lines, /return saveErrors\?\.byField\.get\(fieldId\) \|\| pageHighlight\.get\(fieldId\) \|\| null;/);
});

test('icon ของ StatusNotice/Tag เป็นตัวคอมโพเนนต์ ไม่ใช่ JSX (systemRules กฎ 8)', () => {
  for (const rel of JSX_FILES) {
    const source = code(rel);
    for (const match of source.matchAll(/<(StatusNotice|Tag)\b[^>]*\bicon=\{(<?)/g)) {
      assert.equal(match[2], '', `${rel}: ${match[0]}`);
    }
  }
});

test('หน้าต่างเพิ่มหลายโซนมีเพดาน 500 โซนต่อรายการ (เท่ากับ CHECK ของฐาน)', () => {
  assert.equal(SERVICE_SETUP_LIMITS.zonesPerLine, 500);
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  assert.match(lines, /cap=\{SERVICE_SETUP_LIMITS\.zonesPerLine\}/);
  const modal = code('components/service/ZonesBulkModal.js');
  assert.match(modal, /zonesBulkPlan\(\{ selectedIds: picked, zonesById: index\.zonesById, mode, equalPacks, existingCount, cap \}\)/);
  const rows = code(`${FOLDER}/ServiceSetupGrid.js`);
  assert.match(rows, /const cap = SERVICE_SETUP_LIMITS\.zonesPerLine;/);
});

test('แผงแดงพูดตาม SERVICE_SETUP_PANEL_TEXT ที่เดียว · ปุ่มงานบริการย้อนหลังมาจากสิทธิ์ที่ server คิด', () => {
  const gate = code(`${FOLDER}/SubmitGateNotice.js`);
  assert.match(gate, /title=\{SERVICE_SETUP_PANEL_TEXT\.title\(flow, list\.length\)\}/);
  assert.match(gate, /SERVICE_SETUP_PANEL_TEXT\.subtitle\(flow\)/);
  assert.match(gate, /SERVICE_SETUP_PANEL_TEXT\.checkedAt\(fmtDateTime\(checkedAt\)\)/);
  assert.doesNotMatch(gate, /ยื่นอนุมัติไม่ได้|ยื่นตรวจไม่ได้/);
  const rail = code(`${FOLDER}/ServiceBackfillPanel.js`);
  assert.match(rail, /const rights = view\.backfill \|\| \{\};/);
  assert.match(rail, /rights\.canSubmit && !submitted/);
  assert.match(rail, /rights\.canReview/);
  assert.match(rail, /disabled=\{busy \|\| !!rights\.reviewBlockedReason\}/);
  assert.doesNotMatch(rail, /apiJson|apiFetch/, 'หน้าเป็นเจ้าของโมดัล/คำสั่ง — การ์ดแค่เรียก callback');
  assert.doesNotMatch(rail, /นับ Actual/);
});

test('ไฟล์ที่มี JSX เป็น client component · CSS ไม่ยืมข้ามโฟลเดอร์', () => {
  for (const rel of JSX_FILES) {
    assert.match(read(rel), /^"use client";/, rel);
    for (const match of read(rel).matchAll(/import \w+ from "([^"]+\.module\.css)";/g)) {
      assert.match(match[1], /^\.\//, `${rel}: ${match[1]} ต้องเป็นชีตในโฟลเดอร์เดียวกัน`);
    }
  }
  assert.match(read(`${FOLDER}/useServiceSetup.js`), /^"use client";/);
});

/* ══ รอบแก้หลังรีวิว (29/09) — ยามซอร์ส/ตัวช่วยของคอมโพเนนต์ ══════════════════════════════════════════ */

test('F7: แถบบันทึกลอยอยู่นอกการ์ด (การ์ด overflow:hidden ทำให้ sticky ไม่ติดจอ) · ปุ่มบันทึกมี id ให้ "ไปแก้" พามา', () => {
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  const cardClose = lines.lastIndexOf('</DetailCard>');
  const bar = lines.indexOf('form-action-bar is-page');
  assert.ok(cardClose > 0 && bar > cardClose, 'แถบบันทึกต้องเป็นพี่น้องหลังการ์ด ไม่ใช่ลูกของการ์ด');
  assert.match(lines, /id=\{SAVE_FIELD_ID\}/, 'id อยู่ที่ปุ่มบันทึก (ไม่ใช่ที่แถบ — ตัวแรกที่โฟกัสได้ในแถบคือปุ่มทิ้งการแก้)');
  const saveButton = lines.slice(lines.indexOf('id={SAVE_FIELD_ID}') - 200, lines.indexOf('id={SAVE_FIELD_ID}') + 200);
  assert.match(saveButton, /บันทึกงานบริการ/);
});

test('F8: บันทึกสำเร็จไม่ล้าง "ช่องที่แก้แล้ว" (แดงเก่าไม่กลับมา) · บันทึกไม่ผ่านปลดเฉพาะช่องที่ผลตีกลับชี้', () => {
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  const save = lines.slice(lines.indexOf('const save = async () => {'), lines.indexOf('const discard = () => {'));
  assert.doesNotMatch(save, /setTouched\(new Set\(\)\)/, 'ห้ามล้างทั้งชุด — ช่องที่แก้แล้วจะกลับไปอ่านแดงของแผงเก่า');
  assert.match(save, /for \(const fieldId of errors\.byField\.keys\(\)\) next\.delete\(fieldId\);/);
});

test('F14/F16: หัวกลุ่มที่มีแต่คำเตือนไม่ขึ้น "0 ข้อ" สีแดง · ปุ่ม "ไปแก้" อ้างข้อความของแถวตัวเอง (aria-describedby)', () => {
  const gate = code(`${FOLDER}/SubmitGateNotice.js`);
  assert.match(gate, /group\.count \? <span className=\{styles\.groupCount\}>\{SERVICE_SETUP_PANEL_TEXT\.count\(group\.count\)\}<\/span>/);
  assert.match(gate, /SERVICE_SETUP_PANEL_TEXT\.warnCount\(group\.warnCount\)/);
  assert.match(gate, /const baseId = useId\(\);/);
  assert.match(gate, /<span id=\{textId\} className=\{styles\.itemText\}>/);
  assert.match(gate, /aria-describedby=\{textId\}/);
});

test('F12: แบนเนอร์ของใบที่ยื่นตรวจแล้วบอกว่ารอผู้จัดการ (ไม่ใช่สั่งให้ตั้งแล้วยื่นซ้ำ) · หัวการ์ดบอกวันยื่นตรวจ', () => {
  const view = (state, extra = {}) => viewFixture({ flow: 'backfill', state: { setupState: state, ...extra } });
  assert.equal(backfillBannerText(view(null)),
    /* ลำดับเดียวกับหัวตาราง (มติเจ้าของ 08/10: รอบละกี่แพ็คก่อนจำนวนรอบบริการ) */
    'ตั้งงานบริการ (แพ็คเกจ · ไซต์ · โซน · รอบละกี่แพ็ค · จำนวนรอบบริการ · ช่วงบริการ) แล้วยื่นให้ผู้จัดการฝ่ายขายตรวจ · ยอด/Actual/เอกสารไม่เปลี่ยน');
  assert.equal(backfillBannerText(view('submitted', { submittedAt: '2026-09-28T03:00:00Z', submittedByName: 'Lalida Chaiwanna' })),
    'ยื่นตรวจงานบริการแล้ว — รอผู้จัดการฝ่ายขายตรวจ (ตีกลับก่อนจึงแก้ได้) · ยื่นเมื่อ 28/09/2026 โดย Lalida Chaiwanna · ยอด/Actual/เอกสารไม่เปลี่ยน');
  const panel = code(`${FOLDER}/ServiceBackfillPanel.js`);
  assert.match(panel, /backfillBannerText\(view\)/);
  assert.equal(linesCardMeta({ order: { quotationId: 'QT1', quotation: { quoteNumber: 'QT-26090261-0' } }, lineCount: 5 }),
    '5 รายการ · ราคา/จำนวนจาก QT-26090261-0 แก้ไม่ได้');
  assert.equal(serviceCardMeta({
    view: view('submitted', { submittedAt: '2026-09-28T03:00:00Z' }), flow: 'backfill', editable: false, totals: { zones: 0 },
  }), 'ตั้งย้อนหลัง · ยื่นตรวจ 28/09/2026');
  assert.match(code(`${FOLDER}/SalesOrderServiceLines.js`), /meta=\{linesCardMeta\(\{ order, lineCount: tableLines\.length \}\)\}/);
  assert.match(code(`${FOLDER}/SalesOrderServiceLines.js`), /meta=\{serviceCardMeta\(\{ view, flow, editable, totals \}\)\}/);
});

test('F13: แถวตรวจของการ์ดราง — บรรทัดรองอยู่ใต้ป้าย (ซ้าย) · ช่องขวามีแต่ค่าสั้นไม่ตัดบรรทัด', () => {
  const panel = code(`${FOLDER}/ServiceBackfillPanel.js`);
  assert.match(panel, /<dt>\s*\{row\.label\}\s*\{row\.sub \? <span className=\{styles\.checkSub\}>\{row\.sub\}<\/span> : null\}\s*<\/dt>/);
  assert.match(panel, /<dd><span className=\{styles\.checkValue\}>\{row\.value\}<\/span><\/dd>/);
  const css = read(`${FOLDER}/ServiceBackfillPanel.module.css`);
  assert.match(css, /\.checkValue \{[^}]*white-space: nowrap;/);
  assert.match(css, /\.checkSub \{[^}]*display: block;[^}]*overflow-wrap: anywhere;/);
});

test('F17: ทะเบียนไซต์โหลดไม่ขึ้น — ข้อความชี้ปุ่มลองโหลดที่อยู่ "ด้านบนตาราง" · ลบโซนไม่ได้จนกว่าโหลดได้ (บอกเหตุตอนกด)', () => {
  const rows = code(`${FOLDER}/ServiceSetupGrid.js`);
  assert.doesNotMatch(rows, /ท้ายตาราง/);
  assert.match(rows, /โหลดทะเบียนไซต์ไม่สำเร็จ — กด “ลองโหลดอีกครั้ง” ด้านบนตาราง/);
  assert.match(rows, /const removeBlocked = registry\.error/);
  assert.match(rows, /if \(removeBlocked\) \{/);
});

/* ══ ปุ่ม "แก้งานบริการ" หลังอนุมัติ (mig 0396 · แผน IMPL_PLAN_REOPEN §6 · มติเจ้าของ 30/09 ข้อ 4.1–4.6) ═══════════════════════════ */

/* ก้อน `view.reopened` ของ GET (serviceSetupView — `{ at, byId, byName, reason, fields }`) */
const REOPENED = Object.freeze({
  at: '2026-09-30T03:15:00Z', byId: 'U-KP', byName: 'Kamonrat Pipattanapong', reason: 'SA คีย์โซนผิด — รายการ 2 (ชั้น 1) ต้องเป็นอีกโซน',
  fields: 'ไซต์ · โซน · จำนวนรอบบริการ · รอบละกี่แพ็ค · ช่วงบริการ — แพ็คเกจของรายการที่มีรหัส FG แก้ไม่ได้ (ต้องออก Rev.)',
});

test('0396: แบนเนอร์/การ์ดรางของใบที่เปิดแก้ — หัว/ป้าย/บรรทัด "เปิดแก้ … โดย … · เหตุผล" จาก SERVICE_REOPENED_TEXT · ใบเดิมคำเดิมทุกตัวอักษร', () => {
  const legacy = backfillCopyOfView(viewFixture({ flow: 'backfill', state: { setupState: null } }));
  assert.equal(legacy.reopened, null);
  assert.equal(legacy.bannerTitle, 'ใบนี้อนุมัติก่อนมีการตั้งงานบริการ');
  assert.equal(legacy.eyebrow, 'Service setup · ใบเดิม');
  assert.equal(legacy.title, 'งานบริการ (ใบเดิม)');
  assert.equal(legacy.meta, 'ตั้งย้อนหลังบนใบที่อนุมัติแล้ว — ผู้จัดการฝ่ายขายตรวจก่อนส่งให้ TS');
  assert.equal(legacy.firstStep, 'ตั้งค่า');
  assert.equal(legacy.stateLabel, SERVICE_BACKFILL_STATE_LABELS.editing);
  assert.equal(legacy.reopenLine, null);
  assert.equal(legacy.bannerLead, null);

  const editing = backfillCopyOfView(viewFixture({ flow: 'backfill', state: { setupState: null }, reopened: REOPENED }));
  assert.equal(editing.bannerTitle, SERVICE_REOPENED_TEXT.bannerTitle);
  assert.equal(editing.eyebrow, SERVICE_REOPENED_TEXT.railEyebrow);
  assert.equal(editing.title, SERVICE_REOPENED_TEXT.railTitle);
  assert.equal(editing.meta, SERVICE_REOPENED_TEXT.railMeta);
  assert.equal(editing.firstStep, 'เปิดแก้', 'ขั้นแรกของรางตามม็อก ReopenEditing');
  assert.equal(editing.stateLabel, 'ฝ่ายขายกำลังแก้');
  assert.equal(editing.reopenLine, `เปิดแก้ 30/09/2026 โดย Kamonrat Pipattanapong · ${REOPENED.reason}`);
  assert.equal(editing.bannerLead, null, 'ขั้นแก้: บรรทัดหลักของแบนเนอร์บอกใคร/ทำไมอยู่แล้ว');
  /* บรรทัดหลักของแบนเนอร์ขั้นแก้ = ใคร · เมื่อไร · เหตุผล + ช่องที่แก้ได้ของใบนี้ (R20) */
  const line = backfillBannerText(viewFixture({ flow: 'backfill', state: { setupState: null }, reopened: REOPENED }));
  assert.equal(line, SERVICE_REOPENED_TEXT.bannerLine(REOPENED));
  assert.ok(line.includes(REOPENED.reason) && line.includes(REOPENED.fields) && line.includes('Kamonrat Pipattanapong'), line);

  /* ขั้นรอตรวจ: บรรทัดหลักเป็นของการยื่น (ตัวเดิม) · ใคร/ทำไมขึ้นเป็นบรรทัดนำ (ม็อก ReopenReview) */
  const submittedView = viewFixture({
    flow: 'backfill', state: { setupState: 'submitted', submittedAt: '2026-09-30T05:00:00Z', submittedByName: 'Kamonrat Pipattanapong' }, reopened: REOPENED,
  });
  const submitted = backfillCopyOfView(submittedView);
  assert.equal(submitted.stateLabel, SERVICE_BACKFILL_STATE_LABELS.submitted);
  assert.equal(submitted.bannerLead, submitted.reopenLine);
  assert.match(backfillBannerText(submittedView), /^ยื่นตรวจงานบริการแล้ว — รอผู้จัดการฝ่ายขายตรวจ/);
  /* ตีกลับ = ป้ายตีกลับตัวกลาง (เหตุผลของผู้จัดการขึ้นบรรทัดของมันเอง) */
  assert.equal(backfillCopyOfView(viewFixture({ flow: 'backfill', state: { setupState: 'rejected' }, reopened: REOPENED })).stateLabel,
    SERVICE_BACKFILL_STATE_LABELS.rejected);
  /* ไม่ใช่ขั้น backfill (ประทับแล้วอนุมัติใหม่ · คอลัมน์ 0396 ยังอยู่ แต่ GET ไม่ส่ง reopened) = ไม่มีป้าย */
  assert.equal(backfillCopyOfView(viewFixture({ flow: 'stamped', reopened: null })).stateLabel, null);
});

test('0396: หัวการ์ดงานบริการของใบที่เปิดแก้ — ขั้นแก้ "เปิดแก้หลังอนุมัติ — แก้ได้จนกว่าจะยื่นตรวจ" · รอตรวจ "เปิดแก้หลังอนุมัติ · ยื่นตรวจ …"', () => {
  const editing = serviceCardMeta({ view: viewFixture({ flow: 'backfill', reopened: REOPENED }), flow: 'backfill', editable: true, totals: {} });
  assert.ok(editing.endsWith(` · ${SERVICE_REOPENED_TEXT.cardMeta}`), editing);
  assert.equal(serviceCardMeta({
    view: viewFixture({ flow: 'backfill', state: { setupState: 'submitted', submittedAt: '2026-09-30T05:00:00Z' }, reopened: REOPENED }),
    flow: 'backfill', editable: false, totals: {},
  }), 'เปิดแก้หลังอนุมัติ · ยื่นตรวจ 30/09/2026');
  /* ใบเดิมคำเดิม */
  assert.ok(serviceCardMeta({ view: viewFixture({ flow: 'backfill' }), flow: 'backfill', editable: true, totals: {} }).endsWith(' · แก้ได้จนกว่าจะยื่นตรวจ'));
});

test('0396: ปุ่ม "แก้งานบริการ" อยู่หัวการ์ดงานบริการ ต่อจากชิป "งานบริการครบ x/n" — โชว์ตาม server (canReopen) · ทุกการกดผ่าน onReopen (ก้อนสดบอกเหตุ)', () => {
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  const actions = lines.slice(lines.indexOf('const serviceActions = ('), lines.indexOf('/* ท้ายการ์ดงานบริการมีของเมื่อไร'));
  assert.ok(actions.indexOf('งานบริการครบ') >= 0 && actions.indexOf('<Button') > actions.indexOf('งานบริการครบ'), 'ปุ่มต่อท้ายชิป (ม็อก BindGridMulti กรอบ ข)');
  /* ไม่มีสิทธิ์ = ไม่โชว์ · การ์ดไม่คิดเงื่อนไขเอง (ก้อน view.reopen ของ server เท่านั้น) */
  assert.match(lines, /const reopen = view\?\.reopen \|\| null;/);
  assert.match(lines, /const showReopen = !!reopen\?\.canReopen && typeof onReopen === "function";/);
  assert.match(actions, /\{showReopen \? \(\s*<Button/);
  const button = actions.slice(actions.indexOf('<Button'), actions.indexOf('</Button>'));
  /* 🐞 ตรวจทาน ui-stale-reopen-blocker: ห้ามตอบ "ติดด่าน" จากก้อนที่โหลดพร้อมหน้า (GatedAction ไม่เรียก onReopen เลย ⇒ เหตุเก่าค้างจน F5)
     ⇒ ทุกการกดไปหน้า (`openServiceReopen` อ่านก้อนสดแล้ว toast เหตุ) · เหตุเก่าเหลือแค่ title ชี้เมาส์ */
  assert.doesNotMatch(lines, /<GatedAction|blocker=\{reopen/, 'การ์ดไม่ตัดสินจากเหตุในก้อนเก่า');
  assert.match(button, /title=\{reopen\.blockedReason \|\| undefined\}/);
  assert.match(button, /disabled=\{reopenBusy\}/, 'disabled = กำลังยิงคำสั่งเท่านั้น (ไม่ใช่ด่านของข้อมูล)');
  assert.match(button, /onClick=\{\(\) => onReopen\(\)\}/);
  assert.match(button, /icon=\{<SquarePen size=\{13\} aria-hidden="true" \/>\}/);
  assert.match(button, /\{SERVICE_REOPEN_TEXT\.button\}/);
  assert.equal(SERVICE_REOPEN_TEXT.button, 'แก้งานบริการ');
  /* การ์ดไม่ยิงเปิดแก้เอง — หน้าเป็นเจ้าของโมดัลเหตุผล + POST (แบบเดียวกับยื่น/อนุมัติ/ตีกลับ) */
  assert.doesNotMatch(lines, /reopen['"]\s*[,}]|action:\s*['"]reopen/);
  assert.doesNotMatch(lines, /"แก้งานบริการ"|>แก้งานบริการ</, 'คำของปุ่มอยู่ที่ SERVICE_REOPEN_TEXT ที่เดียว');
});

test('0396: ท้ายการ์ดของใบประทับแล้วบอกสองทาง (ภาคผนวก A.5) — มีปุ่ม = กด ‘แก้งานบริการ’ ก่อน TS เริ่มงาน · ไม่มีสิทธิ์ = บอกว่าใครเปิดแก้ได้', () => {
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  assert.match(lines, /\{reopen\?\.visible \? SERVICE_REOPEN_TEXT\.stampedFooter : SERVICE_REOPEN_TEXT\.stampedFooterNoRight\}/);
  assert.doesNotMatch(lines, /= ย้อนการอนุมัติแล้วออก Rev\./, 'ข้อความเก่า ("แก้ = ย้อนการอนุมัติ" ทางเดียว) ต้องไม่เหลือ');
  for (const footer of [SERVICE_REOPEN_TEXT.stampedFooter, SERVICE_REOPEN_TEXT.stampedFooterNoRight]) {
    assert.ok(footer.includes(`/${SERVICE_SETUP_LINE_TEXT.packsLabel}/`), footer);
    assert.ok(footer.includes('ย้อนการอนุมัติแล้วออก Rev.'), footer);
    assert.doesNotMatch(footer, /ไปกี่รอบ/);
  }
  assert.ok(SERVICE_REOPEN_TEXT.stampedFooter.includes('‘แก้งานบริการ’'));
  /* ดินสอรอบมีเฉพาะคนที่แก้ใบได้ ⇒ ท้ายของคนไม่มีสิทธิ์ไม่พูดถึงดินสอ */
  assert.ok(SERVICE_REOPEN_TEXT.stampedFooter.includes(`${SERVICE_SETUP_LINE_TEXT.roundsLabel}แก้ที่ดินสอได้เสมอ`));
  assert.doesNotMatch(SERVICE_REOPEN_TEXT.stampedFooterNoRight, /ดินสอ/);
});

test('0396: การ์ดราง/แบนเนอร์อ่านคำจาก backfillCopyOfView — ไม่พิมพ์หัว "ใบเดิม" เองในคอมโพเนนต์ · บรรทัดเปิดแก้ไม่แดง', () => {
  const panel = code(`${FOLDER}/ServiceBackfillPanel.js`);
  assert.equal((panel.match(/backfillCopyOfView\(view\)/g) || []).length, 2, 'แบนเนอร์ + การ์ดราง');
  for (const prop of ['title={copy.bannerTitle}', 'eyebrow={copy.eyebrow}', 'title={copy.title}', 'meta={copy.meta}', 'label: copy.firstStep']) {
    assert.ok(panel.includes(prop), prop);
  }
  assert.equal((panel.match(/\{copy\.stateLabel\}/g) || []).length, 2, 'ป้ายสถานะทั้งสองชิ้นมาจากตัวเดียว');
  assert.doesNotMatch(panel, /ใบนี้อนุมัติก่อนมีการตั้งงานบริการ|Service setup · ใบเดิม|SERVICE_BACKFILL_STATE_LABELS\[/);
  assert.match(panel, /\{copy\.reopenLine \? <p className=\{styles\.railReopen\}>\{copy\.reopenLine\}<\/p> : null\}/);
  assert.match(panel, /\{copy\.bannerLead \? <span className=\{styles\.bannerLine\}>\{copy\.bannerLead\}<\/span> : null\}/);
  const css = read(`${FOLDER}/ServiceBackfillPanel.module.css`);
  const rule = css.slice(css.indexOf('.railReopen {'), css.indexOf('}', css.indexOf('.railReopen {')));
  assert.doesNotMatch(rule, /--red|--amber/, 'เปิดแก้ไม่ใช่ข้อผิด — โทนข้อมูล (กฎ 3)');
});

/* ══ mig 0400 (มติเจ้าของ 01/10): ช่วงบริการ "ทั้งใบช่วงเดียว | แยกรายรายการ" — ร่าง + จอ ══════════════════════════════════
   เจ้าของ: "ช่วงบริการตามสัญญา ตอนนี้ SO บาง SO แต่ละรายการจะช่วงไม่เหมือนกัน บางใบทั้งใบ บางใบรายรายการ ทำสวิตซ์"
   รอบสอง: "ช่วงบริการ เอาไว้ คอลัมน์ 1 งานบริการดีกว่า ถ้าใช่ก็ให้กรอก ไม่ใช่ก็ปิดหรือเทาไป" → อนุมัติ "ไม่ใช่ = ปิดช่วง"
   ฐานของเทสต์: `viewFixture()` = ใบโหมดทั้งใบ (L2 พิมพ์เอง + L3 FG เป็นงานบริการ · L1 ยังไม่ตอบ · L4 FG หมวดอื่น)
                `lineView()` = ใบที่บันทึกเป็นแยกรายรายการ (L2 มีช่วง · L3 ยังไม่ใส่ ⇒ ช่วงของใบว่าง) */
const P = Object.freeze({ from: '2026-09-02', to: '2027-09-01' });
const WHOLE = Object.freeze({ from: '2026-10-01', to: '2027-09-30' });
function lineView(overrides = {}) {
  return viewFixture({
    periodMode: 'line', period: null, linePeriods: { total: 2, filled: 1 },
    lines: viewFixture().lines.map((line) => ({ ...line, period: line.lineId === 'L2' ? { ...P } : null })),
    ...overrides,
  });
}
const periodsOf = (view, draft) => Object.fromEntries(mergedLines(view, draft, { fgById: fgById(view) }).map((line) => [line.lineId, line.period]));

test('0400 mergedLines — ช่วงของรายการมีค่าเฉพาะโหมดแยกรายรายการ + บรรทัดงานบริการ (ร่างถ้าแตะ ไม่งั้นฐาน) · โหมดทั้งใบ = null ทุกบรรทัด', () => {
  const whole = viewFixture();
  assert.equal(periodModeOfDraft(whole, EMPTY_DRAFT), 'whole', 'ก้อน GET ไม่มี periodMode (ใบเดิม) = ทั้งใบ');
  assert.equal(periodModeOfDraft(null, EMPTY_DRAFT), 'whole');
  assert.deepEqual(periodsOf(whole, EMPTY_DRAFT), { L1: null, L2: null, L3: null, L4: null });
  assert.deepEqual(periodsOf(whole, patchDraftLine(EMPTY_DRAFT, 'L2', { period: P })), { L1: null, L2: null, L3: null, L4: null },
    'คีย์ช่วงของรายการค้างในร่างได้ แต่โหมดทั้งใบไม่ใช้');

  const view = lineView();
  assert.equal(periodModeOfDraft(view, EMPTY_DRAFT), 'line');
  assert.equal(periodModeOfDraft(view, { ...EMPTY_DRAFT, periodMode: 'whole' }), 'whole', 'ร่างที่สลับไว้ชนะค่าที่บันทึก');
  assert.deepEqual(baseLineOf(view, 'L2').period, P);
  assert.deepEqual(periodsOf(view, EMPTY_DRAFT), { L1: null, L2: P, L3: null, L4: null });
  const typed = patchDraftLine(patchDraftLine(EMPTY_DRAFT, 'L3', { period: { from: '2026-09-26', to: '' } }), 'L4', { period: P });
  assert.deepEqual(periodsOf(view, typed), { L1: null, L2: P, L3: { from: '2026-09-26', to: '' }, L4: null },
    'ครึ่งเดียวเก็บตามที่พิมพ์ · บรรทัดที่ไม่ใช่งานบริการไม่มีช่วงแม้ร่างมีคีย์');
  assert.equal(periodsOf(view, patchDraftLine(EMPTY_DRAFT, 'L2', { period: { from: '', to: '' } })).L2, null, 'ล้างสองช่อง = null');
  /* ตอบ "ไม่ใช่" (ร่างของบรรทัดถูกแทนทั้งก้อน) = ปิดช่วง · ตอบ "ใช่" ทีหลัง = ช่วงว่าง (ไม่เติมให้เอง) */
  const answeredNo = { ...EMPTY_DRAFT, lines: { L2: { kind: 'not_service', serviceProductId: null, rounds: '', zones: [] } } };
  assert.equal(periodsOf(view, answeredNo).L2, null);
  assert.equal(periodsOf(view, { ...EMPTY_DRAFT, lines: { L1: { kind: 'package' } } }).L1, null);
  /* บริบทบนจอ: ชื่อคอลัมน์เดียวกับฐาน + โหมด ⇒ ตัวรวม/ชิป/คำเตือนรอบน้อยของ serviceSetup.js ตามร่างทันที */
  const merged = mergedLines(view, EMPTY_DRAFT, { fgById: fgById(view) });
  assert.deepEqual([ctxLineOf(merged[1]).servicePeriodFrom, ctxLineOf(merged[1]).servicePeriodTo], [P.from, P.to]);
  assert.deepEqual([ctxLineOf(merged[2]).servicePeriodFrom, ctxLineOf(merged[2]).servicePeriodTo], [null, null]);
  const zonesById = new Map([['Z1', { id: 'Z1', siteId: 'S1' }]]);
  const ctx = localSetupCtx(merged, zonesById, { periodMode: 'line' });
  assert.equal(ctx.periodMode, 'line');
  assert.equal(Object.prototype.hasOwnProperty.call(localSetupCtx(merged, zonesById), 'periodMode'), false, 'ไม่ส่งโหมด = รูปเดิม (ตัวรวมถือว่าทั้งใบ)');
  assert.deepEqual(serviceLinePeriod(ctx.lines[1], ctx), P);
  assert.equal(serviceLinePeriod(ctx.lines[2], ctx), null);
  assert.deepEqual([serviceSetupTotals(ctx).completeLines, serviceSetupTotals(ctx).periodFilled, serviceSetupTotals(ctx).periodLines], [2, 1, 2]);
  const cleared = localSetupCtx(mergedLines(view, patchDraftLine(EMPTY_DRAFT, 'L2', { period: { from: '', to: '' } }), { fgById: fgById(view) }), zonesById, { periodMode: 'line' });
  assert.equal(serviceSetupTotals(cleared).completeLines, 1, 'โหมดแยกรายรายการ: รายการที่ไม่มีช่วงของตัวเองยังไม่ครบ (ชิป "งานบริการครบ x/n")');
});

test('0400 switchPeriodMode — ทั้งใบ → แยกรายรายการ: ร่างได้แค่คีย์โหมด · รายการงานบริการที่ยังว่างเห็นช่วงของใบบนจอเป็นค่าตั้งต้น (คิดตอนวาด) · กลับทั้งใบ = ไม่มีอะไรค้าง', () => {
  const view = viewFixture();
  const toLine = switchPeriodMode(view, EMPTY_DRAFT, 'line');
  assert.deepEqual(toLine, { lines: {}, periodMode: 'line' }, '🔴 สวิตช์ไม่เขียนช่วงใดลงร่าง (ค่าที่ไม่มีใครพิมพ์ห้ามอยู่ในร่าง)');
  assert.deepEqual(periodsOf(view, toLine), { L1: null, L2: { ...WHOLE }, L3: { ...WHOLE }, L4: null },
    'เติมเฉพาะรายการที่เป็นงานบริการ (L1 ยังไม่ตอบ · L4 ไม่ใช่งานบริการ ไม่ถูกแตะ)');
  assert.deepEqual(EMPTY_DRAFT, { lines: {} }, 'ไม่แตะของเดิม');
  assert.deepEqual(setupPayload(view, toLine), {
    expectedUpdatedAt: view.updatedAt, periodMode: 'line',
    lines: [{ lineId: 'L2', period: { ...WHOLE } }, { lineId: 'L3', period: { ...WHOLE } }],
  }, 'ก้อนบันทึก = สิ่งที่เห็นบนจอ (ทุกรายการงานบริการ)');
  assert.equal(Object.prototype.hasOwnProperty.call(setupPayload(view, toLine), 'period'), false, 'โหมดแยกรายรายการไม่ส่งช่วงของใบ (server ตีกลับ period_derived)');
  assert.equal(switchPeriodMode(view, toLine, 'line'), toLine, 'กดโหมดที่อยู่แล้ว = ร่างตัวเดิม');

  /* ช่วงของใบที่พิมพ์ไว้แต่ยังไม่บันทึก = ตัวที่เห็นบนจอ ⇒ ใช้ตัวนั้น · รายการที่มีช่วงในร่างแล้วไม่ถูกทับ */
  const typed = { from: '2026-11-01', to: '2027-10-31' };
  const own = { from: '2026-12-01', to: '2027-11-30' };
  const seeded = switchPeriodMode(view, { ...patchDraftLine(EMPTY_DRAFT, 'L3', { period: own }), period: typed }, 'line');
  assert.deepEqual([periodsOf(view, seeded).L2, periodsOf(view, seeded).L3], [typed, own]);
  assert.equal(Object.prototype.hasOwnProperty.call(setupPayload(view, seeded), 'period'), false);
  /* ช่วงของใบยังไม่ครบ/กลับหัว = ไม่เติม — ก้อนบันทึกส่ง null ชัด ๆ ให้ทุกรายการงานบริการ (RPC เติมช่วงของใบให้รายการที่ไม่เอ่ยถึง) */
  for (const bad of [{ from: '2026-11-01', to: '' }, { from: '2027-11-01', to: '2026-10-31' }, { from: '', to: '' }]) {
    const none = switchPeriodMode(view, { ...EMPTY_DRAFT, period: bad }, 'line');
    assert.deepEqual(none.lines, {}, JSON.stringify(bad));
    assert.deepEqual(periodsOf(view, none), { L1: null, L2: null, L3: null, L4: null }, JSON.stringify(bad));
    assert.deepEqual(setupPayload(view, none).lines, [{ lineId: 'L2', period: null }, { lineId: 'L3', period: null }]);
  }
  /* ล้างช่วงที่ถูกเติมของรายการหนึ่ง = บันทึกแล้วต้องว่างตามจอ (ไม่ใช่ได้ช่วงของใบกลับมา) */
  const clearedOne = patchDraftLine(toLine, 'L3', { period: { from: '', to: '' } });
  assert.equal(periodsOf(view, clearedOne).L3, null);
  assert.deepEqual(setupPayload(view, clearedOne).lines, [{ lineId: 'L2', period: { ...WHOLE } }, { lineId: 'L3', period: null }]);
  /* ตอบ ‘ใช่’ ระหว่างที่สลับไว้ = รายการใหม่ได้ช่วงของใบบนจอเหมือนรายการอื่น (RPC เติมให้แบบเดียวกันตอนบันทึก) */
  const answeredYes = { ...toLine, lines: { L1: { kind: 'package' } } };
  assert.deepEqual(periodsOf(view, answeredYes).L1, { ...WHOLE });
  assert.deepEqual(setupPayload(view, answeredYes).lines.find((entry) => entry.lineId === 'L1'), { lineId: 'L1', kind: 'package', period: { ...WHOLE } });

  /* เลิกการสลับ (ใบที่บันทึกเป็นทั้งใบ): คีย์โหมดหาย · `period` ของร่างไม่ถูกแตะ · ไม่มีคีย์ช่วงของรายการซ่อนอยู่ในร่าง */
  const edited = patchDraftLine(toLine, 'L2', { period: own });
  const back = switchPeriodMode(view, edited, 'whole');
  assert.equal(Object.prototype.hasOwnProperty.call(back, 'periodMode'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(back, 'period'), false, '🐞 ห้ามเติมช่วงรวมลงช่วงของใบที่ไม่เคยแยกรายรายการ');
  assert.deepEqual(back.lines, {}, '🔴 ช่วงของรายการที่พิมพ์ระหว่างสลับไม่ค้างในร่าง (พักไว้ที่ parked)');
  assert.deepEqual(back.parked, { lines: { L2: own } });
  assert.equal(setupPayload(view, back), null);
  assert.equal(draftDirty(view, back), false);
  assert.deepEqual(periodsOf(view, back), { L1: null, L2: null, L3: null, L4: null });
  const typedBack = switchPeriodMode(view, patchDraftLine(seeded, 'L2', { period: own }), 'whole');
  assert.deepEqual(typedBack.period, typed, 'ช่วงของใบที่พิมพ์ไว้ก่อนสลับยังอยู่');
  assert.deepEqual(setupPayload(view, typedBack), { expectedUpdatedAt: view.updatedAt, period: typed });
  /* สลับอีกรอบ = ช่วงของรายการที่พิมพ์ไว้กลับมา (ไม่ถูกเติมทับ) · รายการที่ไม่ได้แตะตามช่วงของใบบนจอ · ของที่พักไว้ถูกหยิบออก */
  const again = switchPeriodMode(view, back, 'line');
  assert.deepEqual(again, { lines: { L2: { period: own } }, periodMode: 'line' });
  assert.deepEqual(periodsOf(view, again), { L1: null, L2: own, L3: { ...WHOLE }, L4: null });
  /* คีย์อื่นของบรรทัด (รอบ) อยู่ครบทั้งขาไปและขากลับ */
  const withRounds = patchDraftLine(patchDraftLine(toLine, 'L2', { rounds: '6' }), 'L2', { period: own });
  const parkedRounds = switchPeriodMode(view, withRounds, 'whole');
  assert.deepEqual([parkedRounds.lines, parkedRounds.parked], [{ L2: { rounds: '6' } }, { lines: { L2: own } }]);
  assert.deepEqual(switchPeriodMode(view, parkedRounds, 'line').lines, { L2: { rounds: '6', period: own } });
  assert.equal(switchPeriodMode(view, EMPTY_DRAFT, 'whole'), EMPTY_DRAFT, 'กดโหมดที่ใช้อยู่ = ร่างตัวเดิม');
});

test('0400 switchPeriodMode — แยกรายรายการ (บันทึกแล้ว) → ทั้งใบ: ช่องของใบเห็นช่วงรวมของรายการบนจอ (คิดตอนวาด) · ก้อนบันทึกส่งช่วงของใบเสมอ · สลับกลับได้ครบ', () => {
  const view = lineView();
  const toWhole = switchPeriodMode(view, EMPTY_DRAFT, 'whole');
  assert.deepEqual(toWhole, { lines: {}, periodMode: 'whole' }, '🔴 สวิตช์ไม่เขียนช่วงรวมลงร่าง');
  assert.deepEqual(wholePeriodOfDraft(view, toWhole), { ...P }, 'ช่วงรวมของรายการที่มีช่วง (L2) — L3 ยังว่าง');
  assert.deepEqual(setupPayload(view, toWhole), { expectedUpdatedAt: view.updatedAt, periodMode: 'whole', period: { ...P } });
  assert.deepEqual(periodsOf(view, toWhole), { L1: null, L2: null, L3: null, L4: null }, 'โหมดทั้งใบ: คอลัมน์ ① ไม่มีช่วงของรายการ');
  /* ใบที่ช่วงของรายการครบ (ช่วงของใบที่เก็บ = ช่วงรวม): ก้อนบันทึกยังส่งช่วงของใบชัด ๆ — สิ่งที่เห็นคือสิ่งที่บันทึก */
  const own = { from: '2026-09-26', to: '2027-09-25' };
  const complete = lineView({
    period: { from: P.from, to: own.to }, linePeriods: { total: 2, filled: 2 },
    lines: lineView().lines.map((line) => (line.lineId === 'L3' ? { ...line, period: own } : line)),
  });
  assert.deepEqual(setupPayload(complete, switchPeriodMode(complete, EMPTY_DRAFT, 'whole')),
    { expectedUpdatedAt: complete.updatedAt, periodMode: 'whole', period: { from: P.from, to: own.to } });
  assert.equal(draftDirty(complete, switchPeriodMode(complete, EMPTY_DRAFT, 'whole')), true);
  /* 🐞 ตรวจทาน ui-line-to-whole-cleared-period: ล้างสองช่องของใบแล้วบันทึก = ต้องส่ง null ชัด ๆ (ไม่ส่ง = RPC เก็บช่วงรวมเดิมให้เอง
     ⇒ ช่องที่จอโชว์ว่าว่างกลับมามีช่วงหลังบันทึก) · ใบที่ช่วงของใบที่เก็บว่างอยู่แล้ว (รายการยังไม่ครบ) ก็ต้องส่ง */
  for (const base of [view, complete]) {
    const cleared = { ...switchPeriodMode(base, EMPTY_DRAFT, 'whole'), period: { from: '', to: '' } };
    const payload = setupPayload(base, cleared);
    assert.equal(Object.prototype.hasOwnProperty.call(payload, 'period'), true);
    assert.equal(payload.period, null);
    assert.equal(payload.periodMode, 'whole');
  }
  /* ช่วงรวมคิดจากรายการบนจอ (รวมที่แก้ในร่าง) · ช่วงของใบที่พิมพ์ไว้แล้วไม่ถูกทับ */
  const edited = patchDraftLine(EMPTY_DRAFT, 'L3', { period: own });
  const editedWhole = switchPeriodMode(view, edited, 'whole');
  assert.deepEqual(wholePeriodOfDraft(view, editedWhole), { from: P.from, to: own.to });
  assert.equal(Object.prototype.hasOwnProperty.call(editedWhole, 'period'), false);
  assert.deepEqual(editedWhole.lines, { L3: { period: own } }, 'คีย์ช่วงของรายการ (ของโหมดที่บันทึกไว้) ค้างในร่าง');
  assert.equal(Object.prototype.hasOwnProperty.call(setupPayload(view, editedWhole), 'lines'), false, 'โหมดทั้งใบไม่ส่งช่วงของรายการ');
  const typed = { from: '2026-08-01', to: '2027-07-31' };
  assert.deepEqual(wholePeriodOfDraft(view, switchPeriodMode(view, { ...edited, period: typed }, 'whole')), typed);
  /* ไม่มีรายการไหนมีช่วง = ช่องของใบว่าง · ก้อนบันทึกส่ง null */
  const empty = lineView({ lines: lineView().lines.map((line) => ({ ...line, period: null })) });
  assert.equal(wholePeriodOfDraft(empty, switchPeriodMode(empty, EMPTY_DRAFT, 'whole')), null);
  assert.equal(setupPayload(empty, switchPeriodMode(empty, EMPTY_DRAFT, 'whole')).period, null);
  /* สลับกลับ = คีย์โหมดหาย · ช่วงของรายการ (ฐาน + ร่าง) กลับมาครบ */
  const backToLine = switchPeriodMode(view, editedWhole, 'line');
  assert.equal(Object.prototype.hasOwnProperty.call(backToLine, 'periodMode'), false);
  assert.deepEqual(periodsOf(view, backToLine), { L1: null, L2: P, L3: own, L4: null });
  assert.deepEqual(setupPayload(view, backToLine), { expectedUpdatedAt: view.updatedAt, lines: [{ lineId: 'L3', period: own }] });
  assert.equal(setupPayload(view, switchPeriodMode(view, toWhole, 'line')), null);
  assert.deepEqual(switchPeriodMode(view, toWhole, 'line'), { lines: {} }, 'ดูแล้วสลับกลับ = ร่างว่าง ไม่มีคีย์ `period`/`parked` ค้าง');
  /* ช่วงของใบที่พิมพ์ระหว่างสลับ: สลับกลับ = พักไว้ (ไม่ค้างเป็นคีย์ `period` ในร่างของใบแยกรายรายการ) · สลับมาอีกรอบ = ได้คืน */
  const typedWhole = { ...toWhole, period: typed };
  const parked = switchPeriodMode(view, typedWhole, 'line');
  assert.equal(Object.prototype.hasOwnProperty.call(parked, 'period'), false, '🔴 ช่วงของใบที่พิมพ์ระหว่างสลับไม่ค้างในร่าง');
  assert.deepEqual(parked.parked, { period: typed });
  assert.equal(setupPayload(view, parked), null);
  assert.deepEqual(switchPeriodMode(view, parked, 'whole'), { lines: {}, periodMode: 'whole', period: typed });
});

/* ══ ตรวจทาน ui-leftover-seeded-periods (สามเส้น) — ค่าที่สวิตช์เติมให้ห้ามค้างในร่างเหมือนคนพิมพ์ ══════════════════════════════ */
test('🔴 0400 สวิตช์ (1): สลับไป-กลับ แก้ช่วงของใบ แล้วสลับใหม่ = รายการได้ช่วงของใบที่เห็นบนจอ **ตอนนี้** (ไม่ใช่ช่วงของรอบแรก)', () => {
  const view = viewFixture();
  const peek = switchPeriodMode(view, switchPeriodMode(view, EMPTY_DRAFT, 'line'), 'whole');
  assert.equal(peek.parked, undefined);
  assert.deepEqual(peek, { lines: {} }, 'ดูแล้วสลับกลับ = ร่างว่าง ไม่มีอะไรซ่อน');
  const NEW = { from: '2027-01-01', to: '2027-12-31' };
  const again = switchPeriodMode(view, { ...peek, period: NEW }, 'line');
  assert.deepEqual(periodsOf(view, again), { L1: null, L2: NEW, L3: NEW, L4: null });
  assert.deepEqual(setupPayload(view, again), {
    expectedUpdatedAt: view.updatedAt, periodMode: 'line', lines: [{ lineId: 'L2', period: NEW }, { lineId: 'L3', period: NEW }],
  });
  /* รายการที่คนพิมพ์เองระหว่างรอบแรกยังเป็นของคนพิมพ์ · รายการที่ไม่ได้แตะตามช่วงใหม่ */
  const own = { from: '2026-12-01', to: '2027-11-30' };
  const typedOne = switchPeriodMode(view, patchDraftLine(switchPeriodMode(view, EMPTY_DRAFT, 'line'), 'L3', { period: own }), 'whole');
  assert.deepEqual(periodsOf(view, switchPeriodMode(view, { ...typedOne, period: NEW }, 'line')), { L1: null, L2: NEW, L3: own, L4: null });
});

test('🔴 0400 สวิตช์ (2): แค่สลับไปดูแล้วสลับกลับ → อีกหน้าต่างบันทึกเป็นแยกรายรายการ → โหลดใหม่หลัง 409 = ไม่มีช่วงที่ไม่มีใครพิมพ์โผล่มาทับ', () => {
  const view = viewFixture();
  const other = { L2: { from: '2026-09-02', to: '2027-09-01' }, L3: { from: '2026-09-26', to: '2027-09-25' } };
  const fresh = viewFixture({
    updatedAt: '2026-09-28T11:00:00.000001+00:00', periodMode: 'line', period: { from: '2026-09-02', to: '2027-09-25' },
    linePeriods: { total: 2, filled: 2 }, lines: view.lines.map((line) => ({ ...line, period: other[line.lineId] || null })),
  });
  /* (ก) ดูแล้วสลับกลับ แล้วแก้รอบของรายการเดียว */
  const peeked = patchDraftLine(switchPeriodMode(view, switchPeriodMode(view, EMPTY_DRAFT, 'line'), 'whole'), 'L2', { rounds: '6' });
  assert.deepEqual(setupPayload(view, peeked), { expectedUpdatedAt: view.updatedAt, lines: [{ lineId: 'L2', rounds: 6 }] });
  const rebased = rebaseDraft(fresh, peeked);
  assert.deepEqual(rebased, { lines: { L2: { rounds: '6' } } }, 'ค้างแค่รอบที่คนแก้');
  assert.deepEqual(periodsOf(fresh, rebased), { L1: null, ...other, L4: null }, 'ช่วงของอีกหน้าต่างอยู่ครบบนจอ');
  assert.deepEqual(setupPayload(fresh, rebased), { expectedUpdatedAt: fresh.updatedAt, lines: [{ lineId: 'L2', rounds: 6 }] }, '🔴 ก้อนบันทึกไม่มีช่วงของรายการ');
  /* (ข) พิมพ์ช่วงของรายการระหว่างดู แล้วสลับกลับ (พักไว้) — ฐานใหม่มา = ของที่พักไว้ถูกทิ้ง ไม่กลายเป็นของค้าง */
  const own = { from: '2026-12-01', to: '2027-11-30' };
  const parked = patchDraftLine(switchPeriodMode(view, patchDraftLine(switchPeriodMode(view, EMPTY_DRAFT, 'line'), 'L3', { period: own }), 'whole'), 'L2', { rounds: '6' });
  assert.deepEqual(parked.parked, { lines: { L3: own } });
  assert.deepEqual(rebaseDraft(fresh, parked), { lines: { L2: { rounds: '6' } } });
  assert.equal(rebaseDraft(view, switchPeriodMode(view, patchDraftLine(switchPeriodMode(view, EMPTY_DRAFT, 'line'), 'L3', { period: own }), 'whole')), EMPTY_DRAFT,
    'ร่างที่เหลือแต่ของที่พักไว้ = ร่างว่างเมื่อฐานมาใหม่');
  /* (ค) ยังสลับค้างอยู่ (เห็นค่าตั้งต้นห้ารายการ) แล้วอีกหน้าต่างบันทึกเป็นแยกรายรายการ: ค่าตั้งต้นไม่ใช่ของค้าง ⇒ ร่างว่าง */
  assert.equal(rebaseDraft(fresh, switchPeriodMode(view, EMPTY_DRAFT, 'line')), EMPTY_DRAFT);
  /* ที่คนพิมพ์จริงระหว่างสลับค้างอยู่ยังเป็นของค้าง (ต่างจากฐานใหม่) */
  assert.deepEqual(rebaseDraft(fresh, patchDraftLine(switchPeriodMode(view, EMPTY_DRAFT, 'line'), 'L3', { period: own })), { lines: { L3: { period: own } } });
});

test('🔴 0400 สวิตช์ (3): ใบแยกรายรายการ สลับทั้งใบ → กลับ → แก้ช่วงของรายการ → สลับทั้งใบอีกครั้ง = ช่องของใบเป็นช่วงรวมใหม่ · ฐานใหม่ไม่ถูกช่วงของใบที่ค้างทับ', () => {
  const view = lineView();
  const first = switchPeriodMode(view, EMPTY_DRAFT, 'whole');
  assert.deepEqual(wholePeriodOfDraft(view, first), { ...P });
  const back = switchPeriodMode(view, first, 'line');
  assert.deepEqual(back, { lines: {} }, 'ไม่มีคีย์ `period` ซ่อนอยู่');
  const own = { from: '2026-09-26', to: '2027-09-25' };
  const second = switchPeriodMode(view, patchDraftLine(back, 'L3', { period: own }), 'whole');
  assert.deepEqual(wholePeriodOfDraft(view, second), { from: P.from, to: own.to }, 'ช่วงรวมใหม่ (รวมรายการที่เพิ่งแก้)');
  assert.deepEqual(setupPayload(view, second), { expectedUpdatedAt: view.updatedAt, periodMode: 'whole', period: { from: P.from, to: own.to } });
  /* อีกหน้าต่างสลับใบเป็นทั้งใบแล้วบันทึกช่วงของตัวเอง → แท็บนี้ (ดูทั้งใบแล้วสลับกลับ) โหลดใหม่: ไม่มีช่วงของใบค้างไปทับ */
  const savedWhole = viewFixture({ updatedAt: '2026-09-28T11:00:00.000001+00:00', period: { from: '2026-10-15', to: '2027-10-14' } });
  assert.equal(rebaseDraft(savedWhole, back), EMPTY_DRAFT);
  const typed = { from: '2026-08-01', to: '2027-07-31' };
  const parked = switchPeriodMode(view, { ...first, period: typed }, 'line');
  assert.equal(rebaseDraft(savedWhole, parked), EMPTY_DRAFT, 'ช่วงของใบที่พิมพ์ระหว่างสลับแล้วสลับกลับ (พักไว้) ไม่ทับช่วงที่อีกหน้าต่างบันทึก');
  assert.equal(setupPayload(savedWhole, parked), null);
});

test('0400 setupPayload — โหมดส่งเมื่อเปลี่ยน · ช่วงของใบเฉพาะโหมดทั้งใบ · ช่วงของรายการเฉพาะแยกรายรายการ + งานบริการ + ต่างจากฐาน', () => {
  const view = lineView();
  assert.equal(setupPayload(view, EMPTY_DRAFT), null);
  assert.equal(setupPayload(view, { ...EMPTY_DRAFT, periodMode: 'line' }), null, 'โหมดเท่าที่บันทึก = ไม่ส่ง');
  assert.equal(setupPayload(view, { ...EMPTY_DRAFT, period: { ...WHOLE } }), null, 'โหมดแยกรายรายการไม่ส่งช่วงของใบ แม้ร่างมีคีย์');
  assert.equal(setupPayload(view, patchDraftLine(EMPTY_DRAFT, 'L2', { period: { ...P } })), null, 'เท่าฐาน = ไม่มีอะไรบันทึก');
  assert.deepEqual(setupPayload(view, patchDraftLine(EMPTY_DRAFT, 'L2', { period: { from: '', to: '' } })).lines, [{ lineId: 'L2', period: null }], 'ล้าง = null');
  assert.deepEqual(setupPayload(view, patchDraftLine(EMPTY_DRAFT, 'L2', { period: { from: P.from, to: '' } })).lines,
    [{ lineId: 'L2', period: { from: P.from, to: '' } }], 'ครึ่งเดียวส่งตามที่พิมพ์ (server ตีกลับที่ช่องของรายการ)');
  /* บรรทัด FG ที่เป็นงานบริการ: บรรทัดมีแต่ period — ไม่พ่วง kind/serviceProductId */
  assert.deepEqual(setupPayload(view, patchDraftLine(EMPTY_DRAFT, 'L3', { period: { ...P } })).lines, [{ lineId: 'L3', period: { ...P } }]);
  /* บรรทัดที่ไม่ใช่งานบริการ/ยังไม่ตอบ ไม่ส่งช่วง */
  assert.equal(setupPayload(view, patchDraftLine(patchDraftLine(EMPTY_DRAFT, 'L4', { period: { ...P } }), 'L1', { period: { ...P } })), null);
  /* ตอบ "ไม่ใช่" = ไม่ส่งช่วง (RPC ล้างช่วงของบรรทัดที่ไม่ใช่แพ็คเกจเอง) */
  const answeredNo = { ...EMPTY_DRAFT, lines: { L2: { kind: 'not_service', serviceProductId: null, rounds: '', zones: [] } } };
  assert.deepEqual(setupPayload(view, answeredNo).lines, [{ lineId: 'L2', kind: 'not_service', serviceProductId: null, rounds: null, zones: [] }]);
  /* ตอบ "ใช่" พร้อมใส่ช่วง = ส่งทั้งคำตอบและช่วงในบรรทัดเดียว */
  const answeredYes = { ...EMPTY_DRAFT, lines: { L1: { kind: 'package', period: { ...P } } } };
  assert.deepEqual(setupPayload(view, answeredYes).lines, [{ lineId: 'L1', kind: 'package', period: { ...P } }]);
  /* โหมดทั้งใบ: คีย์ช่วงของรายการในร่างไม่ถูกส่ง */
  assert.equal(setupPayload(viewFixture(), patchDraftLine(EMPTY_DRAFT, 'L2', { period: { ...P } })), null);
  /* เวลาของใบไปตามตัวอักษรทุกแบบของก้อน */
  assert.equal(setupPayload(view, { ...EMPTY_DRAFT, periodMode: 'whole' }).expectedUpdatedAt, '2026-09-28T10:11:12.345678+00:00');
});

test('0400 rebaseDraft — คีย์โหมด/ช่วงของรายการที่ยังอยู่ในก้อนบันทึกคงไว้ · ฐานใหม่เท่าร่างแล้ว = ร่างว่าง · ค่าตั้งต้นของสวิตช์ไม่เคยอยู่ในร่าง', () => {
  const view = viewFixture();
  const toLine = switchPeriodMode(view, EMPTY_DRAFT, 'line');
  assert.deepEqual(rebaseDraft(view, toLine), { lines: {}, periodMode: 'line' }, 'ฐานยังเป็นทั้งใบ (เช่นโหลดใหม่หลัง 409) = โหมดยังค้าง · ค่าตั้งต้นคิดใหม่จากฐานใหม่');
  assert.deepEqual(periodsOf(view, rebaseDraft(view, toLine)), { L1: null, L2: { ...WHOLE }, L3: { ...WHOLE }, L4: null });
  /* ฐานใหม่เปลี่ยนช่วงของใบ (อีกหน้าต่างแก้) ระหว่างที่ยังสลับค้าง = ค่าตั้งต้นตามช่วงของใบใหม่ */
  const moved = viewFixture({ period: { from: '2026-11-01', to: '2027-10-31' } });
  assert.deepEqual(periodsOf(moved, rebaseDraft(moved, toLine)).L2, { from: '2026-11-01', to: '2027-10-31' });
  const own = { from: '2026-12-01', to: '2027-11-30' };
  const typed = patchDraftLine(toLine, 'L3', { period: own });
  assert.deepEqual(rebaseDraft(view, typed), { lines: { L3: { period: own } }, periodMode: 'line' }, 'ช่วงที่คนพิมพ์ค้างครบ');
  const saved = viewFixture({
    periodMode: 'line', linePeriods: { total: 2, filled: 2 },
    lines: view.lines.map((line) => ({ ...line, period: ['L2', 'L3'].includes(line.lineId) ? { ...WHOLE } : null })),
  });
  assert.equal(rebaseDraft(saved, toLine), EMPTY_DRAFT);
  const half = viewFixture({ periodMode: 'line', period: null, lines: view.lines.map((line) => ({ ...line, period: line.lineId === 'L2' ? { ...WHOLE } : null })) });
  assert.equal(rebaseDraft(half, toLine), EMPTY_DRAFT, 'โหมดเท่าฐานแล้ว · ไม่มีช่วงที่คนพิมพ์ = ไม่มีอะไรค้าง (L3 ว่างตามฐานใหม่)');
  assert.deepEqual(rebaseDraft(half, typed), { lines: { L3: { period: own } } }, 'ที่คนพิมพ์และยังต่างค้างไว้ · โหมดเท่าฐานแล้วไม่ค้าง');
  /* สลับโหมดบนใบที่รายการไม่มีร่าง: ก้อนบันทึกมี null ของทุกรายการงานบริการ แต่ร่างไม่มีคีย์ให้เก็บ — ต้องไม่พัง */
  const noPeriod = viewFixture({ period: null });
  assert.deepEqual(rebaseDraft(noPeriod, { ...EMPTY_DRAFT, periodMode: 'line' }), { lines: {}, periodMode: 'line' });
  /* แยกรายรายการ → ทั้งใบ ที่ยังไม่บันทึก: โหมดคงไว้ · ช่วงของใบค้างเฉพาะที่คนพิมพ์ (ช่วงรวมคิดตอนวาด) */
  const lineSaved = lineView();
  assert.deepEqual(rebaseDraft(lineSaved, switchPeriodMode(lineSaved, EMPTY_DRAFT, 'whole')), { lines: {}, periodMode: 'whole' });
  const typedWhole = { from: '2026-08-01', to: '2027-07-31' };
  assert.deepEqual(rebaseDraft(lineSaved, { ...switchPeriodMode(lineSaved, EMPTY_DRAFT, 'whole'), period: typedWhole }),
    { lines: {}, periodMode: 'whole', period: typedWhole });
});

test('0400 ตัวช่วยของจอ — ใช้ช่วงเดียวกันทุกรายการ · เหมือนรายการ n · ช่วงรวม/ตัวนับบนจอ · ป้ายรายการนับช่วงที่ยังขาด', () => {
  const view = lineView();
  const all = applyPeriodToAllLines(view, patchDraftLine(EMPTY_DRAFT, 'L3', { rounds: '12' }), WHOLE);
  assert.deepEqual(all.lines, { L2: { period: { ...WHOLE } }, L3: { rounds: '12', period: { ...WHOLE } } }, 'ทุกรายการงานบริการ · คีย์อื่นของร่างอยู่ครบ');
  assert.deepEqual(setupPayload(view, all).lines, [{ lineId: 'L2', period: { ...WHOLE } }, { lineId: 'L3', rounds: 12, period: { ...WHOLE } }]);
  assert.equal(applyPeriodToAllLines(viewFixture(), EMPTY_DRAFT, WHOLE), EMPTY_DRAFT, 'โหมดทั้งใบ = ไม่ทำอะไร');

  const merged = mergedLines(view, EMPTY_DRAFT, { fgById: fgById(view) });
  assert.deepEqual(sameSourceOf(merged), { lineId: 'L2', lineNo: 2, period: { ...P } }, 'รายการงานบริการแรกที่มีช่วงใช้ได้');
  assert.equal(sameSourceOf(mergedLines(view, patchDraftLine(EMPTY_DRAFT, 'L2', { period: { from: P.from, to: '' } }))), null, 'ครึ่งเดียวไม่ใช่ต้นทาง');
  assert.equal(sameSourceOf(mergedLines(viewFixture(), EMPTY_DRAFT)), null, 'โหมดทั้งใบไม่มีต้นทาง');
  assert.deepEqual(copyLinePeriod(EMPTY_DRAFT, 'L3', P).lines, { L3: { period: { ...P } } });

  assert.deepEqual(localEnvelope(merged), { ...P });
  assert.deepEqual(linePeriodCounters(merged), { total: 2, filled: 1 });
  const both = mergedLines(view, copyLinePeriod(EMPTY_DRAFT, 'L3', { from: '2026-09-26', to: '2027-09-25' }));
  assert.deepEqual(localEnvelope(both), { from: '2026-09-02', to: '2027-09-25' }, 'เริ่มแรกสุด → จบสุดท้าย');
  assert.deepEqual(linePeriodCounters(both), { total: 2, filled: 2 });
  assert.equal(localEnvelope(mergedLines(viewFixture(), EMPTY_DRAFT)), null);

  const [, l2, l3] = merged;
  assert.deepEqual(lineMissing(l2, { periodMode: 'line' }), { state: 'complete', count: 0, label: 'ตั้งครบ' });
  assert.equal(lineMissing({ ...l2, period: null }, { periodMode: 'line' }).label, 'ยังขาด 1 ข้อ', 'ม็อก: รายการที่ยังไม่ใส่ช่วง = ยังขาด 1 ข้อ');
  assert.equal(lineMissing({ ...l2, period: { from: P.from, to: '' } }, { periodMode: 'line' }).count, 1, 'ครึ่งเดียว = ยังขาด');
  assert.equal(lineMissing(l3, { periodMode: 'line' }).count, 3, 'FG 02-001: ช่วง + รอบ + โซน');
  assert.equal(lineMissing({ ...l2, period: null }, { periodMode: 'whole' }).state, 'complete', 'โหมดทั้งใบไม่นับช่วงของรายการ');
  assert.equal(lineMissing({ ...l2, period: null }).state, 'complete');
});

test('0400 fieldErrorsView — ช่วงของรายการ (มี lineId) ขึ้นที่ช่องของรายการ · ช่วงของใบ/โหมด ขึ้นที่แถบช่วงบริการ', () => {
  const view = fieldErrorsView([
    { lineId: 'L2', field: 'period', message: 'ช่วงของรายการผิด' },
    { lineId: null, field: 'period', message: 'ช่วงของใบคิดจากรายการ' },
    { lineId: null, field: 'periodMode', message: 'โหมดผิด' },
  ]);
  assert.equal(view.byField.get('svc-line-L2-period'), 'ช่วงของรายการผิด');
  assert.equal(view.byField.get(lineFieldId('L2', 'period')), 'ช่วงของรายการผิด');
  assert.equal(view.byField.get(PERIOD_FIELD_ID), 'ช่วงของใบคิดจากรายการ · โหมดผิด');
  assert.deepEqual(view.general, []);
  assert.equal(serviceSetupFieldId({ key: 'line_period_missing', field: 'period', lineId: 'L2' }), lineFieldId('L2', 'period'));
  assert.equal(serviceSetupFieldId({ key: 'period_missing', field: 'period' }), PERIOD_FIELD_ID);
});

test('0400 การ์ดรางใบเดิม — แถว "ช่วงบริการ" ของใบแยกรายรายการ = ม็อก (ป้าย / x/y รายการ / รายการ n ยังไม่ใส่ · ช่วงรวม …) · เริ่มตั้งแล้วเมื่อสลับโหมด', () => {
  const periods = [['2026-09-02', '2027-09-01'], ['2026-09-22', '2027-09-21'], null, ['2026-09-26', '2027-09-25'], ['2026-09-11', '2027-09-10']];
  const railView = (missing = [3]) => viewFixture({
    flow: 'backfill', periodMode: 'line', period: null,
    lines: periods.map((p, i) => ({
      lineId: `L${i + 1}`, lineNo: i + 1, role: 'package', roleSource: 'stored', kind: 'package', serviceProductId: 'P1', serviceFgCode: 'FG-015-02-001-0908',
      rounds: 12, period: p && !missing.includes(i + 1) ? { from: p[0], to: p[1] } : null, fgCode: null, productId: null,
    })),
    linePeriods: { total: 5, filled: 5 - missing.length },
    totals: { packageLines: 5, unsetLines: 0 },
    issues: missing.map((n) => ({ key: 'line_period_missing', tab: 'overview', field: 'period', lineId: `L${n}`, lineNo: n })),
  });
  const row = (view) => backfillRailChecks(view).find((item) => item.key === 'period');
  assert.deepEqual(row(railView()), {
    key: 'period', label: 'ช่วงบริการ · แยกรายรายการ', value: '4/5 รายการ',
    sub: 'รายการ 3 ยังไม่ใส่ · ช่วงรวม 02/09/2026–25/09/2027', ok: false,
  });
  assert.deepEqual([row(railView([3, 5])).value, row(railView([3, 5])).sub],
    ['3/5 รายการ', 'รายการ 3 ยังไม่ใส่ · อีก 1 รายการ · ช่วงรวม 02/09/2026–25/09/2027']);
  assert.deepEqual(row(railView([])), {
    key: 'period', label: 'ช่วงบริการ · แยกรายรายการ', value: '5/5 รายการ', sub: 'ช่วงรวม 02/09/2026–25/09/2027', ok: true,
  });
  assert.equal(row({ ...railView([]), issues: [{ key: 'period_missing', tab: 'overview' }] }).ok, false, 'ช่วงของใบว่างทั้งที่รายการครบ (ด่านกันพลาด) = ยังไม่ผ่าน');
  /* 🐞 ตรวจทาน ui-rail-period-row-red-no-reason: รายการงานบริการใส่ช่วงครบ แต่ยังมีรายการที่ไม่ตอบ ‘งานบริการ?’ = แถวยังไม่ผ่าน
     (รายการนั้นอาจเป็นงานบริการ) และ **บรรทัดรองต้องบอกเหตุ** — เดิม "5/5 รายการ · ช่วงรวม …" แดงหลังกดยื่นโดยไม่มีคำอธิบาย */
  const withUnset = { ...railView([]), totals: { packageLines: 5, unsetLines: 1 }, issues: [{ key: 'kind_missing', tab: 'overview', lineId: 'L9', lineNo: 6 }] };
  assert.deepEqual(row(withUnset), {
    key: 'period', label: 'ช่วงบริการ · แยกรายรายการ', value: '5/5 รายการ',
    sub: `${SERVICE_BACKFILL_RAIL_TEXT.periodWaitKind('1')} · ช่วงรวม 02/09/2026–25/09/2027`, ok: false,
  });
  assert.match(row(withUnset).sub, /^รอตอบ ‘งานบริการ\?’ 1 รายการ/);
  /* มีข้อช่วงของรายการอยู่แล้ว = ข้อนั้นบอกเหตุเอง (ไม่ซ้อนคำรอตอบ) */
  const unsetAndMissing = { ...railView([3]), totals: { packageLines: 5, unsetLines: 1 } };
  assert.equal(row(unsetAndMissing).sub, 'รายการ 3 ยังไม่ใส่ · ช่วงรวม 02/09/2026–25/09/2027');
  /* ยังไม่มีรายการงานบริการที่บันทึกแล้ว = คำเดิมของแถวทั้งใบ */
  const waiting = viewFixture({
    flow: 'backfill', periodMode: 'line', period: null, linePeriods: { total: 0, filled: 0 }, totals: { packageLines: 0, unsetLines: 2 }, issues: [],
  });
  assert.deepEqual([row(waiting).label, row(waiting).value, row(waiting).sub, row(waiting).ok],
    ['ช่วงบริการ · แยกรายรายการ', 'ยังไม่ใส่', SERVICE_BACKFILL_RAIL_TEXT.periodWaitKind('2'), false]);
  /* โหมดทั้งใบ: แถวเดิมทุกตัวอักษร */
  assert.deepEqual(row(viewFixture({ flow: 'backfill' })), { key: 'period', label: 'ช่วงบริการ', value: '01/10/2026–30/09/2027', sub: '12 เดือน', ok: true });
  assert.deepEqual(backfillRailChecks(railView()).map((item) => item.key), ['lines', 'zones', 'period', 'installments', 'billing']);

  const blank = { flow: 'backfill', state: { setupState: null }, period: null, allocations: [], lines: viewFixture().lines.map((line) => ({ ...line, kind: null, serviceProductId: null })) };
  assert.equal(backfillStateOfView(blank), 'not_started');
  assert.equal(backfillStateOfView({ ...blank, periodMode: 'line' }), 'editing', 'สลับเป็นแยกรายรายการแล้วบันทึก = เริ่มตั้งแล้ว (ช่วงของใบว่างจนกว่ารายการจะครบ)');
});

test('0400 จอ: สวิตช์บนแถบช่วงบริการ · ช่วงของรายการใต้คำตอบในคอลัมน์ ① · ชิป/คำเตือนรอบจากช่วงของรายการ · คำจาก SERVICE_PERIOD_TEXT', () => {
  const strip = code(`${FOLDER}/ServicePeriodField.js`);
  const block = code(`${FOLDER}/ServiceLinePeriod.js`);
  const modal = code(`${FOLDER}/ServicePeriodApplyAllModal.js`);
  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);

  /* แถบ: สวิตช์สองทางจากแคตตาล็อก · ลูกศรไม่สลับโหมดเอง · โหมดอ่านไม่มีสวิตช์ */
  assert.deepEqual(SERVICE_PERIOD_TEXT.modes.map((option) => [option.value, option.label]), [['whole', 'ทั้งใบช่วงเดียว'], ['line', 'แยกรายรายการ']]);
  assert.match(strip, /const MODE_OPTIONS = SERVICE_PERIOD_TEXT\.modes\.map\(/);
  assert.match(strip, /<Segmented[\s\S]*?options=\{MODE_OPTIONS\}[\s\S]*?ariaLabel=\{SERVICE_PERIOD_TEXT\.modeAria\}[\s\S]*?selection="radio"\s*activationMode="manual"\s*\/>/);
  /* ตรวจทาน ui-switch-not-radiogroup: สวิตช์ต้องเป็น radiogroup / radio + aria-checked ตามม็อก (เดิม role="group" + aria-pressed) —
     โหมดนี้เป็นทางเลือกของ Segmented: ไม่ส่ง `selection` = DOM เดิม (แถบอื่นทั้งระบบไม่เปลี่ยน) */
  /* ตรวจทาน ui-date-inputs-no-autocomplete-off: ช่องวันของแถบ · ของรายการ · ของโมดัล "ใช้ช่วงเดียวกันทุกรายการ" ล้วนเป็น DateInput
     (ไม่มี prop autoComplete ให้ส่ง) ⇒ กฎ "input ทุกช่อง autoComplete="off"" ต้องอยู่ที่ตัว DateInput เอง */
  const dateInput = code('components/ui/DateInput.js');
  assert.match(dateInput, /<input\s+id=\{id\}\s+name=\{name\}\s+type="text"\s+inputMode="numeric"\s+autoComplete="off"/);
  assert.equal((dateInput.match(/<input\b/g) || []).length, 1, 'DateInput มี input ตัวเดียว');
  for (const file of ['ServicePeriodField.js', 'ServiceLinePeriod.js', 'ServicePeriodApplyAllModal.js']) {
    const src = code(`${FOLDER}/${file}`);
    assert.match(src, /<DateInput\b/, `${file} ใช้ DateInput`);
    assert.doesNotMatch(src, /<input\b/, `${file}: ไม่มี input ดิบ (ช่องวันต้องผ่าน DateInput)`);
  }
  /* ช่องของทั้งใบบนจอ = `wholePeriodOfDraft` (ร่างถ้าพิมพ์ · ใบแยกรายรายการที่ร่างสลับมา = ช่วงรวมของรายการ) — ไม่อ่าน `draft.period` ตรง ๆ */
  const card = code(`${FOLDER}/SalesOrderServiceLines.js`);
  assert.match(card, /const period = useMemo\(\(\) => wholePeriodOfDraft\(view, draft\), \[view, draft\]\);/);
  assert.doesNotMatch(card, /hasOwnProperty\.call\(draft, "period"\)/);
  const segmented = code('components/ui/Segmented.js');
  assert.match(segmented, /selection = "toggle",/);
  assert.match(segmented, /const radio = selection === "radio";/);
  assert.match(segmented, /role=\{radio \? "radiogroup" : "group"\}/);
  assert.match(segmented, /role=\{radio \? "radio" : undefined\}\s*aria-checked=\{radio \? active : undefined\}\s*aria-pressed=\{radio \? undefined : active\}/);
  assert.match(segmented, /tabIndex=\{active \|\| \(!hasSelectedOption && index === firstEnabledIndex\) \? 0 : -1\}/, 'roving tabindex เดิม');
  assert.match(segmented, /if \(activationMode === "automatic"\) onChange\?\.\(items\[nextIndex\]\.value\);/, 'manual = ลูกศรย้ายโฟกัสอย่างเดียว');
  const readOnly = strip.slice(strip.indexOf('if (!editable) {'), strip.indexOf('const chipValue'));
  assert.doesNotMatch(readOnly, /Segmented|DateInput/, 'ไม่มีสิทธิ์/ใบล็อก = ไม่มีสวิตช์ ไม่มีช่องกรอก');
  assert.match(readOnly, /SERVICE_PERIOD_TEXT\.readModeLine : SERVICE_PERIOD_TEXT\.readModeWhole/);
  /* แยกรายรายการ: กล่องช่วงรวมอ่านอย่างเดียวคือที่หมายของข้อช่วงของใบ (svc-period · tabIndex -1) */
  assert.match(strip, /id=\{PERIOD_FIELD_ID\}\s+tabIndex=\{-1\}\s+className=\{styles\.periodEnvelope\}\s+role="group"\s+aria-label=\{SERVICE_PERIOD_TEXT\.envelopeAria\}/);
  assert.match(strip, /\{total \? \(\s*<Button[\s\S]{0,200}?onClick=\{\(\) => onApplyAll\?\.\(\)\}>\s*\{SERVICE_PERIOD_TEXT\.sameForAll\}/, 'ไม่มีรายการงานบริการ = ไม่มีปุ่มใช้ช่วงเดียวกัน');
  assert.match(strip, /\{!byLine && pendingClear > 0 \? \(\s*<StatusNotice tone="warning">\{SERVICE_PERIOD_TEXT\.clearNotice\(pendingClear\)\}<\/StatusNotice>/);
  assert.match(strip, /<DateInput\s+id=\{PERIOD_FIELD_ID\}/, 'โหมดทั้งใบ: id อยู่ที่ช่องวันเริ่มบริการเหมือนเดิม');

  /* การ์ด: โหมดบนจอจากร่าง · แถบโหมดแยกรายรายการวาดช่วงรวมจากรายการบนจอ (ไม่ใช่ view.period) · สลับ/ใช้ทุกรายการล้างแดงของช่องที่เติม */
  assert.match(lines, /const periodMode = periodModeOfDraft\(view, draft\);/);
  assert.match(lines, /const ctx = useMemo\(\(\) => localSetupCtx\(merged, zonesById, \{ periodMode \}\), \[merged, zonesById, periodMode\]\);/);
  assert.match(lines, /const envelope = useMemo\(\(\) => localEnvelope\(merged\), \[merged\]\);/);
  assert.match(lines, /period=\{byLine \? envelope : period\}/);
  assert.match(lines, /const pendingClear = view\?\.periodMode === SERVICE_PERIOD_MODE_LINE && !byLine \? Number\(view\?\.linePeriods\?\.filled \|\| 0\) : 0;/);
  assert.match(lines, /setDraft\(\(current\) => switchPeriodMode\(view, current, next\)\);\s*touch\(\[PERIOD_FIELD_ID, \.\.\.periodFieldIds\]\);/);
  assert.match(lines, /setDraft\(\(current\) => applyPeriodToAllLines\(view, current, next\)\);\s*touch\(periodFieldIds\);/);
  assert.match(lines, /<ServiceSetupGrid\s+lines=\{merged\}\s+editable=\{editable\}\s+period=\{period\}\s+periodMode=\{periodMode\}/);
  assert.match(lines, /\{editable && byLine && applyAllOpen \? \(\s*<ServicePeriodApplyAllModal/);

  /* ตาราง: บล็อกช่วงอยู่ใต้คำตอบทั้งสามแบบ (FG · อ่าน · แก้) · ก้อนโซนได้ช่วงของรายการ */
  const kind = grid.slice(grid.indexOf('function KindCell('), grid.indexOf('function FgCell('));
  assert.match(kind, /const periodBlock = <ServiceLinePeriod line=\{line\} editable=\{editable\} \{\.\.\.period\} \/>;/);
  assert.equal(kind.split('{periodBlock}').length - 1, 3, 'ใต้คำตอบของบรรทัด FG · โหมดอ่าน · โหมดแก้');
  assert.ok(kind.indexOf('<AnswerButtons') < kind.lastIndexOf('{periodBlock}'), 'บล็อกช่วงอยู่ใต้ปุ่มคำตอบ (ตอนพับเป็นการ์ดจึงอยู่ก่อน ②)');
  assert.match(grid, /const linePeriod = periodMode === "line" \? line\.period : period;/);
  /* `folded` (มติ 08/10 — ลำดับใน DOM ตามผัง) แทรกระหว่าง editable กับ period — ช่วงที่ก้อนโซนใช้ยังเป็นของรายการเหมือนเดิม */
  assert.match(grid, /<ZoneBlock\s+line=\{line\}\s+editable=\{editable\}\s+folded=\{folded\}\s+period=\{linePeriod\}\s+periodWait=\{byLine && !validServicePeriod\(linePeriod\)\}/);
  assert.match(grid, /onChange: \(next\) => onLineChange\?\.\(\{ period: next \}, \[periodField\]\),/);
  assert.match(grid, /error: highlightOf\(periodField\),/, 'แดงของช่วงของรายการมาจาก highlightOf เท่านั้น (กฎ 3)');
  assert.match(grid, /<LineStatus missing=\{lineMissing\(line, \{ periodMode \}\)\} pressed=\{pressed\} \/>/);
  assert.match(grid, /sameSourceOf\(lines\)/, 'ต้นทางของ "เหมือนรายการ n" คิดครั้งเดียวทั้งตาราง');
  assert.match(grid, /\) : periodWait \? \(\s*<span className=\{styles\.chips\}>\s*<span className=\{styles\.chipWait\} title=\{SERVICE_PERIOD_TEXT\.roundsChipWaitTitle\}>\{SERVICE_PERIOD_TEXT\.roundsChipWait\}<\/span>/);

  /* บล็อกช่วงของรายการ: id ของช่อง "เริ่ม" · ไม่ใช่งานบริการ = บรรทัดเดียว · ยังไม่ตอบ = ไม่วาด · ช่องกรอกเฉพาะโหมดแก้ */
  assert.match(block, /id=\{lineFieldId\(line\.lineId, "period"\)\}/);
  assert.match(block, /if \(line\.role === SERVICE_KIND_NOT_SERVICE\) return <span className=\{styles\.linePeriodNone\}>\{SERVICE_PERIOD_TEXT\.none\}<\/span>;/);
  assert.match(block, /if \(line\.role !== SERVICE_KIND_PACKAGE\) return null;/);
  assert.ok(block.indexOf('if (!editable) {') < block.indexOf('<DateInput'), 'โหมดอ่านออกก่อนถึงช่องกรอก');
  assert.equal((block.match(/<DateInput\b/g) || []).length, 2);
  assert.equal((block.match(/invalid=\{!!error\}/g) || []).length, 2);
  assert.match(block, /sameSource\.lineId !== line\.lineId/);
  assert.match(block, /SERVICE_PERIOD_TEXT\.sameAs\(source\.lineNo\)/);
  assert.match(block, /label: SERVICE_PERIOD_TEXT\.monthChipShort\(months\), disabled: !from/, 'ชิป 12 ด. / 24 ด. กดได้เมื่อมีวันเริ่ม');
  assert.match(block, /data-wait=\{readout \? undefined : ""\}/);
  /* โมดัล: ยืนยันกดได้เสมอ บอกเหตุตอนกด (แดงหลังกด) */
  assert.match(modal, /setError\(SERVICE_SETUP_SQL_MESSAGES\.service_setup_line_period_invalid\.message\);\s*return;/);
  assert.match(modal, /onApply\?\.\(valid\);/);
  assert.doesNotMatch(modal, /disabled=\{/, 'ปุ่มโชว์เสมอ บอกเหตุตอนกด');

  /* คำของม็อกมาจากแคตตาล็อกที่เดียว — สามไฟล์นี้ไม่พิมพ์เอง */
  const mockStrings = Object.values(SERVICE_PERIOD_TEXT).filter((value) => typeof value === 'string' && value.length >= 6);
  assert.ok(mockStrings.length >= 14);
  for (const [name, source] of [['ServicePeriodField.js', strip], ['ServiceLinePeriod.js', block], ['ServicePeriodApplyAllModal.js', modal]]) {
    for (const value of [...mockStrings, 'ทั้งใบช่วงเดียว', 'แยกรายรายการ', 'เหมือนรายการ', 'ใส่ช่วงแล้ว']) {
      assert.equal(source.includes(value), false, `${name}: "${value}" ต้องอ่านจาก SERVICE_PERIOD_TEXT`);
    }
    assert.match(source, /SERVICE_PERIOD_TEXT\./, name);
    assert.doesNotMatch(source, /สาขาแรกเริ่ม/, `${name}: คำแนะนำเก่า (ทางอ้อมที่สวิตช์นี้มาแทน)`);
  }
  assert.match(strip, /\{backfill && !byLine \? <p className=\{styles\.hint\}>\{SERVICE_PERIOD_TEXT\.backfillHint\}<\/p> : null\}/);
});

test('0400 CSS: คอลัมน์ ① 156px · บล็อกช่วงไม่แดงก่อนกด · ตอนพับเป็นการ์ดไม่ยืดเต็มการ์ดและไม่ล้นขอบ · ลำดับ ①→⑥ (④⑤ ตามมติ 08/10)', () => {
  const gridCss = read(`${FOLDER}/ServiceSetupGrid.module.css`);
  const fieldsCss = read(`${FOLDER}/ServiceSetupFields.module.css`);
  assert.match(gridCss, /--c-kind: 156px;/);
  for (const name of ['idx: 30px', 'item: 130px', 'fg: 152px', 'rounds: 124px', 'packs: 88px', 'total: 84px']) {
    assert.ok(gridCss.includes(`--c-${name};`), `คอลัมน์อื่นไม่ขยับ (${name}) — ส่วนที่เพิ่มเอาจากคอลัมน์ ③`);
  }
  assert.match(gridCss, /\.chipWait \{[^}]*border: 1px dashed var\(--border-strong\);[^}]*color: var\(--text-3\);/);
  /* มติเจ้าของ 08/10 (ลำดับ Tab = ที่ตาเห็นทั้งสองผัง): ไม่มีกล่องห่อรายแถว `.zoneRow` แล้ว — ช่องของแถวโซนเป็นลูกโดยตรงของก้อนโซน
     (ผังตารางยังได้สามช่องต่อแถวจาก grid 3 คอลัมน์ของ `.zoneBlock` เหมือนเดิม — ยามคอลัมน์อยู่เทสต์แถวของรายการ) */
  assert.doesNotMatch(gridCss, /\.zoneRow\b/);
  assert.match(gridCss, /\.zoneBlock \{\s*display: grid;\s*min-width: 0;\s*grid-template-columns: minmax\(0, 1fr\) var\(--c-packs\) var\(--c-rounds\);/);
  const stacked = gridCss.slice(gridCss.indexOf('@container (max-width: 900px)'));
  assert.match(stacked, /\.zoneCell,\s*\.zoneFoot \{ order: 1; \}/);
  /* มติเจ้าของ 08/10 (สลับ ④⑤): ตอนพับ ④ แพ็ครายโซน มาก่อน ⑤ รอบ — ความกว้างคอลัมน์ทุกตัวเท่าเดิม (ยามข้างบน) */
  assert.match(stacked, /\.packsCell \{ order: 2; \}/);
  assert.match(stacked, /\.roundsCell,\s*\.roundsNote \{ order: 3; \}/);
  assert.match(stacked, /\.line \{\s*display: flex;\s*flex-direction: column;\s*align-items: stretch;/, 'ก้อนโซนไม่กว้างตามเนื้อจนล้นขอบการ์ดบนมือถือ');
  assert.match(gridCss, /\.packsCell \.num input \{\s*width: 48px;/, 'ช่องแพ็ค (④) + หน่วย อยู่ในคอลัมน์ 88px');
  /* บล็อกช่วง: ช่องวันกินที่เหลือของคอลัมน์ · คำชวน "ยังไม่ใส่ช่วง" ไม่แดง · ตอนพับไม่ยืดเต็มการ์ด */
  assert.match(fieldsCss, /\.linePeriodDate \{[^}]*grid-template-columns: 26px minmax\(0, 1fr\);/);
  assert.match(fieldsCss, /\.linePeriodDate :global\(\.date-input-wrap\) \{\s*width: 100%;\s*min-width: 0;\s*\}/);
  assert.match(fieldsCss, /\.linePeriodReadout\[data-wait\] \{\s*color: var\(--accent-ink\);\s*\}/);
  assert.match(fieldsCss, /@container \(max-width: 900px\) \{\s*\.linePeriod \{\s*max-width: 220px;\s*\}\s*\}/);
  assert.match(fieldsCss, /\.linePeriodChips :global\(\.choice-chip\) \{\s*min-height: 24px;/, 'เป้ากดไม่ต่ำกว่า 24px');
  assert.match(fieldsCss, /\.linePeriodSame \{[^}]*min-height: 24px;/);
  const periodRules = fieldsCss.slice(fieldsCss.indexOf('.periodTop {'));
  const reds = [...periodRules.matchAll(/([^{}]+)\{[^}]*var\(--red\)[^}]*\}/g)].map((match) => match[1].trim());
  assert.deepEqual(reds, ['.periodEnvelope[data-invalid]'], 'สีแดงของส่วนใหม่มีที่เดียว: กล่องช่วงรวมหลังกด (data-invalid จาก error)');
});

/* ══ mig 0404 (มติเจ้าของ 01/10 "ผูกรอบบริการให้ข้ามได้ มาใส่ทีหลัง Actual ได้" → "ฝ่ายขายกดข้ามเอง"): ยื่นโดยยังไม่ตั้งงานบริการ ══════════════
   ตัวช่วยของจอจากก้อน GET รูป `viewFixture` (ก้อนที่จอได้รับ — ไม่ผ่านตัวตัดสิน) · ไล่กับตัวตัดสินจริง + ยามซอร์สของหน้าใบอยู่ที่ serviceDeferUi.test.mjs */
const DEFERRED = Object.freeze({
  at: '2026-10-08T02:30:00Z', byId: 'U-AE', byName: 'Kamonrat Pipattanapong', stage: 'approved', active: true, missing: 5, blocking: 0,
});

test('0404: กติกาของโฟลเดอร์ใช้กับ ServiceDeferNotice เอง · แบนเนอร์/การ์ดราง/หัวการ์ดของใบที่อนุมัติโดยข้าม — คำจาก SERVICE_DEFERRED_TEXT · ป้ายขั้นของใบเดิม', () => {
  /* ไฟล์ใหม่อยู่ในชุดที่ยามของโฟลเดอร์ไล่ ("use client" · ไม่มี style={{ · CSS โฟลเดอร์เดียวกัน · icon เป็นคอมโพเนนต์ · แดงหลังกด) */
  assert.ok(UI_FILES.includes(`${FOLDER}/ServiceDeferNotice.js`));
  assert.ok(JSX_FILES.includes(`${FOLDER}/ServiceDeferNotice.js`));

  const view = (state, extra = {}) => viewFixture({ flow: 'backfill', state: { setupState: state, ...extra }, deferred: DEFERRED });
  const editing = backfillCopyOfView(view(null));
  assert.equal(editing.bannerTitle, SERVICE_DEFERRED_TEXT.bannerTitle);
  assert.equal(editing.eyebrow, SERVICE_DEFERRED_TEXT.railEyebrow);
  assert.equal(editing.title, SERVICE_DEFERRED_TEXT.railTitle);
  assert.equal(editing.meta, SERVICE_DEFERRED_TEXT.railMeta);
  assert.equal(editing.firstStep, 'ตั้งค่า', 'ใบไม่เคยตั้ง — ขั้นแรกของรางยังเป็น "ตั้งค่า" (ไม่ใช่ "เปิดแก้" ของ 0396)');
  assert.equal(editing.stateLabel, SERVICE_BACKFILL_STATE_LABELS.editing, 'ป้ายขั้นของใบเดิม — จริงกับใบที่ข้าม');
  assert.equal(editing.reopenLine, 'ข้ามการตั้งงานบริการตอนยื่น 08/10/2026 โดย Kamonrat Pipattanapong');
  assert.equal(editing.bannerLead, null, 'ขั้นตั้ง: บรรทัดหลักของแบนเนอร์บอกใคร/เมื่อไรอยู่แล้ว');
  assert.equal(editing.deferred, DEFERRED);
  assert.equal(backfillBannerText(view(null)), SERVICE_DEFERRED_TEXT.bannerLine(DEFERRED));
  assert.ok(backfillBannerText(view(null)).includes('จำนวนรอบบริการ') && backfillBannerText(view(null)).includes('รอบละกี่แพ็ค'));
  assert.equal(backfillCopyOfView(view('rejected')).stateLabel, SERVICE_BACKFILL_STATE_LABELS.rejected);
  const submitted = view('submitted', { submittedAt: '2026-10-09T03:00:00Z', submittedByName: 'Kamonrat Pipattanapong' });
  assert.equal(backfillCopyOfView(submitted).bannerLead, editing.reopenLine, 'รอตรวจ: ใครข้าม/เมื่อไรเป็นบรรทัดนำ (ช่องเดียวกับบรรทัดเปิดแก้)');
  assert.match(backfillBannerText(submitted), /^ยื่นตรวจงานบริการแล้ว — รอผู้จัดการฝ่ายขายตรวจ/);
  assert.equal(serviceCardMeta({ view: submitted, flow: 'backfill', editable: false, totals: {} }), `${SERVICE_DEFERRED_TEXT.cardMetaSubmitted} · ยื่นตรวจ 09/10/2026`);
  assert.ok(serviceCardMeta({ view: view(null), flow: 'backfill', editable: true, totals: {} }).endsWith(` · ${SERVICE_DEFERRED_TEXT.cardMeta}`));
  /* ใบร่าง/ใบประทับแล้วที่ก้อนไม่มี deferred = หัวการ์ดเดิม */
  assert.ok(serviceCardMeta({ view: viewFixture(), flow: 'pipeline', editable: true, totals: {} }).endsWith(' · แก้ได้จนกว่าจะยื่นอนุมัติ'));
  /* การ์ดราง/แบนเนอร์วาดจากช่องเดิมของ copy — คอมโพเนนต์ไม่ต้องรู้จักการข้าม (ไม่พิมพ์คำเอง) */
  const panel = code(`${FOLDER}/ServiceBackfillPanel.js`);
  assert.doesNotMatch(panel, /deferred|SERVICE_DEFERRED_TEXT|ข้าม/);
});

test('0404: ประกาศบนใบรออนุมัติ + ป้าย \'ข้ามได้\' ของแผงแดง จากก้อน GET — สี่แบบ · ไม่ใช่ขั้นรออนุมัติ = ไม่มี · ตัวถามไม่ส่ง = แผงเดิม', () => {
  const pending = (over) => ({ deferred: { ...DEFERRED, stage: 'pending', missing: 5, ...over } });
  assert.deepEqual(deferNoticeOfView(pending({ active: true, blocking: 0 })).lines,
    [SERVICE_DEFERRED_TEXT.pendingLine(DEFERRED, 5), SERVICE_DEFERRED_TEXT.pendingHow]);
  assert.deepEqual(deferNoticeOfView(pending({ active: true, blocking: 2 })).lines,
    [SERVICE_DEFERRED_TEXT.pendingLine(DEFERRED, 5), SERVICE_DEFERRED_TEXT.pendingBlocked(2)]);
  assert.deepEqual(deferNoticeOfView(pending({ active: false, missing: 0, blocking: 0 })),
    { tone: 'info', title: SERVICE_DEFERRED_TEXT.pendingTitle, tag: null, lines: [SERVICE_DEFERRED_TEXT.pendingComplete(DEFERRED)] });
  assert.deepEqual(deferNoticeOfView(pending({ active: false, missing: 0, blocking: 3 })),
    { tone: 'warning', title: SERVICE_DEFERRED_TEXT.pendingTitle, tag: null, lines: [SERVICE_DEFERRED_TEXT.pendingStuck(DEFERRED, 3)] });
  assert.equal(deferNoticeOfView(pending({ active: true, blocking: 0 })).tag, SERVICE_DEFERRED_TEXT.badge);
  assert.equal(deferNoticeOfView({ deferred: DEFERRED }), null, 'อนุมัติแล้ว = หน้าที่ของแบนเนอร์');
  assert.equal(deferNoticeOfView(viewFixture()), null);

  /* ป้ายแถว: ตัวถามของผู้เรียก (ข้อตัวเดิม) · FN/คำเตือนไม่ติด · ไม่ส่ง = false */
  const issues = [
    { key: 'kind_missing', tab: 'overview', lineId: 'L1', message: 'รายการ 1: ยังไม่ตอบว่าเป็นงานบริการไหม' },
    { key: 'due_missing', tab: 'payment', installmentId: 'I2', seq: 2, message: 'งวด 2: ยังไม่ใส่กำหนดชำระ' },
  ];
  const asked = [];
  const groups = submitGateGroups(issues, [], { deferrable: (entry) => { asked.push(entry); return entry.key === 'kind_missing'; } });
  assert.deepEqual(groups.flatMap((group) => group.items).map((item) => [item.entry.key, item.deferrable]), [['kind_missing', true], ['due_missing', false]]);
  assert.ok(asked.every((entry) => issues.includes(entry)), 'ตัวถามได้ข้อตัวเดิมของผู้เรียก (เทียบตัวตนได้)');
  assert.ok(submitGateGroups(issues, []).flatMap((group) => group.items).every((item) => item.deferrable === false));

  /* skipTagsShown จากก้อน `view.skip` รูปของ GET */
  const skip = { visible: true, canSkip: false, blockedReason: SERVICE_DEFER_TEXT.blocked(1), lead: SERVICE_DEFER_TEXT.panelBlocked(4, 1), deferredCount: 4, blockingCount: 1, prompt: null };
  assert.equal(skipTagsShown(skip), true);
  assert.equal(skipTagsShown({ ...skip, canSkip: true, blockedReason: null, lead: SERVICE_DEFER_TEXT.panelLead(4), blockingCount: 0 }), true);
  assert.equal(skipTagsShown({ ...skip, blockedReason: SERVICE_DEFER_TEXT.predecessorRunning('SO-1', 2), lead: SERVICE_DEFER_TEXT.panelPredecessor('SO-1') }), false);
  assert.equal(skipTagsShown({ ...skip, visible: false }), false);
});

/* ══ "ค้าง n วัน" บนแบนเนอร์/การ์ดรางของเส้นตั้งย้อนหลัง (มติเจ้าของ 08/10 "ตามงานค้าง") ════════════════════════════════════════
   ตรวจข้อมูลจริง 08/10: 59 ใบสายบริการอนุมัติแล้วงานยังไม่ถึง TS · นานสุด 56 วัน · ไม่มีจอไหนบอกอายุ
   ⭐ ชิปตัวเดียวทุกผิว (`ServiceAgingChip`) วาดจากก้อน `view.aging` ที่ server คิดด้วยวันไทย — คอมโพเนนต์ไม่อ่านนาฬิกา ไม่พิมพ์คำเอง */
test('ตามงานค้าง: แบนเนอร์ + การ์ดรางมีชิปอายุข้างป้ายขั้น จาก `view.aging` · ป้ายขั้นยังมาจาก copy ตัวเดียว · ไม่มี style ฝัง', () => {
  const panel = code(`${FOLDER}/ServiceBackfillPanel.js`);
  assert.match(panel, /import ServiceAgingChip from "@\/components\/salesPlanning\/ServiceAgingChip";/);
  assert.equal((panel.match(/<ServiceAgingChip aging=\{view\.aging\} \/>/g) || []).length, 2, 'แบนเนอร์ + การ์ดราง');
  assert.equal((panel.match(/\{copy\.stateLabel\}/g) || []).length, 2, 'ป้ายขั้นยังมีสองที่ จากตัวเดียว');
  /* แบนเนอร์: ชิป + ป้ายขั้นในกล่องเดียวของช่อง action · การ์ดราง: สองป้ายเป็นลูกของช่อง actions ตรง ๆ (แถว flex ที่ห่อได้อยู่แล้ว) */
  assert.match(panel, /action=\{<span className=\{styles\.stateTags\}><ServiceAgingChip aging=\{view\.aging\} \/><Tag tone=\{STATE_TONE\[state\]\}>\{copy\.stateLabel\}<\/Tag><\/span>\}/);
  assert.match(panel, /actions=\{<><ServiceAgingChip aging=\{view\.aging\} \/><Tag tone=\{STATE_TONE\[state\]\}>\{copy\.stateLabel\}<\/Tag><\/>\}/);
  assert.doesNotMatch(panel, /style=\{\{/);
  /* ไฟล์นี้ไม่พิมพ์คำของชิป ไม่คิดวัน ไม่อ่านนาฬิกา — ทั้งหมดมากับก้อนของ server */
  assert.doesNotMatch(panel, /ค้าง|serviceBackfillAging|SERVICE_BACKFILL_AGING_TEXT|new Date\(|businessDate/);
  const css = read(`${FOLDER}/ServiceBackfillPanel.module.css`);
  assert.match(css, /\.stateTags \{[^}]*display: inline-flex;[^}]*flex-wrap: wrap;[^}]*align-items: center;[^}]*gap: var\(--space-2\);/);
});

/* ⚠️ ผลตรวจทาน 08/10 (หลังเห็นจอจริง): เกณฑ์ที่สอง (≥ 30 วัน) เปลี่ยนจาก "จุดนำ" เป็น **ไอคอนนาฬิกาทราย** — บนแท็บ TS ป้ายขั้นที่อยู่ข้างชิปมี
   จุดนำเสมอ และแถวที่รอไซต์เป็นโทนเตือนเหมือนกัน ⇒ "● ยังไม่เริ่ม" กับ "● ค้าง 30 วัน" หน้าตาเดียวกัน ระดับ 30 วันมองไม่ออก
   · ยังเป็นโทนเตือนของระบบ (ไม่ใช้แดง ไม่ตั้งสีใหม่) · ไอคอนผ่านช่อง `icon` เดิมของ StatusBadge */
test('ตามงานค้าง: `ServiceAgingChip` — ชิ้นเดียวทุกผิว · โทน/ไอคอนนาฬิกาทราย/คำบอกมาจากก้อน · ไม่มีป้าย = ไม่วาด · ไม่มีคำไทย/ตรรกะของวันในคอมโพเนนต์', () => {
  const chip = code('components/salesPlanning/ServiceAgingChip.js');
  assert.match(chip, /import StatusBadge from "@\/components\/ui\/StatusBadge";/);
  assert.match(chip, /import \{ Hourglass \} from "lucide-react";/, 'ไอคอน "รอ" ตัวที่ระบบใช้อยู่แล้ว');
  assert.equal((chip.match(/^import /gm) || []).length, 2, 'พึ่งแค่ป้ายกลางของระบบ + ไอคอน (ไม่ดึง lib ของงานบริการเข้าจอที่ใช้ชิป)');
  assert.match(chip, /if \(!aging\?\.label\) return null;/, 'วันเดียวกัน/ไม่มีนาฬิกา/ไม่มีวันนี้ = ไม่วาดอะไร');
  assert.match(chip, /<StatusBadge\s+tone=\{aging\.tone\}\s+icon=\{aging\.strong \? Hourglass : undefined\}\s+iconSize=\{12\}\s+size="sm"\s+label=\{aging\.label\}\s+title=\{aging\.title \|\| undefined\}\s+\/>/);
  assert.doesNotMatch(chip, /\bdot\b/, 'เกณฑ์ที่สองไม่ใช้จุดนำ — ซ้ำกับจุดนำของป้ายขั้นข้าง ๆ บนแท็บ TS');
  assert.doesNotMatch(chip, /[\u0E00-\u0E7F]/, 'คำทั้งหมดอยู่ที่ SERVICE_BACKFILL_AGING_TEXT (lib/sales/serviceBackfillAging.js)');
  assert.doesNotMatch(chip, /style=\{\{|new Date\(|className=/, 'ไม่มีสี/ทรงของตัวเอง — ใช้โทนของ StatusBadge เท่านั้น');
  assert.doesNotMatch(chip, /"use client"/, 'ไม่มี state/hook — ใช้ได้ทั้งจอ server และ client');
  /* ทุกผิวที่บอกสถานะตั้งงานบริการย้อนหลังใช้ชิปตัวนี้ (ไม่วาด StatusBadge ของอายุเอง) */
  for (const rel of [
    `${FOLDER}/ServiceBackfillPanel.js`,
    'app/sales-planning/sales-orders/page.js',
    'app/service/intake/page.js',
  ]) {
    assert.match(code(rel), /import ServiceAgingChip from "@\/components\/salesPlanning\/ServiceAgingChip";/, rel);
    assert.doesNotMatch(code(rel), /aging\.tone|aging\.strong|aging\?\.tone/, `${rel}: โทน/ไอคอนตัดสินในชิปที่เดียว`);
  }
});
