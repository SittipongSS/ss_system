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
  rebaseDraft, serviceCardMeta, setupPayload, stripParts, submitGateGroups, submitIssuesAfterSave, surveyRequestHref, zonePacksFieldId,
} from '../../components/salesPlanning/serviceSetup/serviceSetupDraft.js';
import {
  ZONES_BULK_NONE_PICKED, ZONES_BULK_PACKS_INVALID, zonesBulkCapText, zonesBulkConsequence, zonesBulkPlan,
} from '../../components/service/zonesBulkPlan.js';
import {
  SERVICE_BACKFILL_RAIL_TEXT, SERVICE_BACKFILL_STATE_LABELS, SERVICE_REOPEN_TEXT, SERVICE_REOPENED_TEXT, SERVICE_SETUP_GRID_TEXT, SERVICE_SETUP_LIMITS,
  SERVICE_SETUP_LINE_TEXT, SERVICE_SETUP_PANEL_TEXT, serviceSetupFieldId, serviceSetupIssues, serviceSetupTotals,
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
  for (const field of ['kind', 'fg', 'zones', 'rounds']) {
    assert.equal(lineFieldId('SOL-a', field), serviceSetupFieldId({ lineId: 'SOL-a', field }));
  }
  assert.equal(zonePacksFieldId('SOL-a', 'ZN-1'), serviceSetupFieldId({ lineId: 'SOL-a', zoneId: 'ZN-1', field: 'packs' }));
  assert.equal(PERIOD_FIELD_ID, serviceSetupFieldId({ field: 'period' }));
  const view = viewFixture();
  const [, l2] = mergedLines(view, EMPTY_DRAFT, { fgById: fgById(view) });
  assert.deepEqual(lineFieldIds(l2), ['svc-line-L2-kind', 'svc-line-L2-fg', 'svc-line-L2-zones', 'svc-line-L2-rounds', 'svc-zone-L2-Z1-packs']);
  /* zones_on_not_service ชี้ `svc-line-<id>-zones` บนบรรทัดที่ไม่มีก้อนโซน — id ต้องอยู่ที่แถบ "ไม่ใช่งานบริการ" ของบรรทัดนั้น
     (เฉพาะตอนมีข้อความแดง) · บรรทัดที่เป็นงานบริการ id อยู่ท้ายก้อนโซน (โหมดแก้ — ปุ่มเพิ่มโซน) / ช่องโซนแรก (โหมดอ่าน) */
  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  assert.match(grid, /id=\{line\.role === SERVICE_KIND_NOT_SERVICE && zonesError \? lineFieldId\(line\.lineId, "zones"\) : undefined\}/);
  assert.match(grid, /<div className=\{styles\.zoneFoot\} id=\{editable \? zonesFieldId : undefined\}>/);
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

test('issueHeadTail — หัวตัวหนาเฉพาะ "รายการ n …" / "งวด n …"', () => {
  assert.deepEqual(issueHeadTail('รายการ 3: ยังไม่ใส่จำนวนรอบบริการ'), { head: 'รายการ 3', rest: ': ยังไม่ใส่จำนวนรอบบริการ' });
  assert.deepEqual(issueHeadTail('รายการ 5 · Floor 2: ยังไม่ใส่รอบละกี่แพ็ค'), { head: 'รายการ 5 · Floor 2', rest: ': ยังไม่ใส่รอบละกี่แพ็ค' });
  assert.deepEqual(issueHeadTail('รายการ 1: จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็ยื่นได้)'),
    { head: 'รายการ 1', rest: ': จำนวนรอบบริการ 1 รอบ ในช่วงบริการ 12 เดือน — ตรวจอีกครั้ง (ถ้าตั้งใจก็ยื่นได้)' });
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
    ผลรวมแพ็คที่ใช้ทั้งหมด รายบรรทัด รวมทุกบรรทัด" ⇒ ① งานบริการ? → ② FG → ③ ไซต์ · โซน → ④ จำนวนรอบบริการ → ⑤ รอบละกี่แพ็ค → ⑥ รวมแพ็ค */

test('30/09 หัวคอลัมน์ ①→⑥ ตามลำดับของเจ้าของ — มาจากแคตตาล็อกเดียว (SERVICE_SETUP_GRID_TEXT.steps)', () => {
  assert.deepEqual(SERVICE_SETUP_GRID_TEXT.steps.map((step) => step.key), ['kind', 'fg', 'zones', 'rounds', 'packs', 'total']);
  assert.deepEqual(SERVICE_SETUP_GRID_TEXT.steps.map((step) => step.label),
    ['งานบริการ?', 'แพ็คเกจ FG', 'ไซต์ · โซน', 'จำนวนรอบบริการ', 'รอบละกี่แพ็ค', 'รวมแพ็ค']);
  assert.equal(SERVICE_SETUP_GRID_TEXT.steps.find((step) => step.key === 'rounds').label, SERVICE_SETUP_LINE_TEXT.roundsLabel);
  assert.equal(SERVICE_SETUP_GRID_TEXT.steps.find((step) => step.key === 'packs').label, SERVICE_SETUP_LINE_TEXT.packsLabel);
  assert.deepEqual(SERVICE_SETUP_GRID_TEXT.steps.map((step) => step.required), [true, true, true, true, true, false]);
  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  assert.match(grid, /const STEPS = SERVICE_SETUP_GRID_TEXT\.steps;/);
  assert.match(grid, /\{STEPS\.map\(\(step, index\) => \(/, 'หัวคอลัมน์วาดจากแคตตาล็อก ไม่เรียงเองในไฟล์');
});

test('30/09 แถวของรายการ: # · รายการ · ① · (② · ก้อน ③④⑤ · ⑥) — ในก้อนโซน ช่องโซน → ช่องรอบ → ช่องแพ็ค · ตอนพับเรียงตามลำดับเดียวกัน', () => {
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
  assert.ok(at(block, 'className={styles.zoneCell}') < at(block, 'className={styles.roundsCell}'));
  assert.ok(at(block, 'className={styles.roundsCell}') < at(block, 'className={styles.packsCell}'));
  /* ช่อง ④ มีค่าเฉพาะแถวโซนแรก (หน้าตาเดียวกับ rowspan ของม็อก) */
  assert.match(block, /\{index === 0 \? \(\s*<>\s*<StackLabel step="rounds" \/>\s*\{roundsCell\}/);
  const css = read(`${FOLDER}/ServiceSetupGrid.module.css`);
  assert.match(css, /\.zoneRow \{\s*display: contents;\s*\}/);
  const stacked = css.slice(css.indexOf('@container (max-width: 900px)'));
  assert.match(stacked, /\.zoneCell,\s*\.zoneFoot \{ order: 1; \}/);
  assert.match(stacked, /\.roundsCell \{ order: 2; \}/);
  assert.match(stacked, /\.packsCell \{ order: 3; \}/);
  assert.match(stacked, /\.roundsCell:not\(\[data-first\]\) \{ display: none; \}/);
  /* ⑥ = รอบละ (Σ ทุกโซน) × จำนวนรอบบริการ + เทียบจำนวนในใบ (ไม่บังคับให้เท่า) · แถวท้ายรวมทุกรายการ */
  const total = grid.slice(grid.indexOf('function TotalCell('), grid.indexOf('function ZonePick('));
  assert.match(total, /const totals = lineSetupTotals\(ctxLine, ctx\);/);
  assert.match(total, /const cross = lineQtyCrossCheck\(ctxLine, totals\);/);
  assert.match(grid, /<GridFoot totals=\{totals\} \/>/);
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  assert.match(lines, /<ServiceSetupGrid\s+lines=\{merged\}/);
  assert.match(lines, /totals=\{totals\}/);
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
  assert.match(read, /\{canEditRounds \? <StampedRoundsEdit line=\{line\} onRoundsSave=\{onRoundsSave\} \/> : null\}/, 'ดินสออยู่ช่อง ④ ของใบที่ประทับแล้ว');
});

test('29/09 คำเตือนรอบน้อย: เทาใต้ก้อนโซน ทั้งโหมดแก้และโหมดอ่าน (ใบอนุมัติแล้วด้วย) · ไม่แดง · คำตามขั้นของใบ', () => {
  const grid = code(`${FOLDER}/ServiceSetupGrid.js`);
  assert.match(grid, /const roundsLow = lineRoundsLowText\(positiveIntOrNull\(line\.rounds\), period, \{ stage: editable \? "submit" : roundsLowStage \}\);/);
  assert.match(grid, /\{roundsLow \? <span className=\{styles\.note\} role="status">\{roundsLow\}<\/span> : null\}/);
  const lines = code(`${FOLDER}/SalesOrderServiceLines.js`);
  assert.match(lines, /roundsLowStage=\{flow === "stamped" \? "approved" : "read"\}/);
  const css = read(`${FOLDER}/ServiceSetupGrid.module.css`);
  assert.match(css, /\.hint,\s*\.note \{[^}]*color: var\(--text-3\);/, 'เทา ไม่ใช่แดง/เหลือง');
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
  assert.ok(revoke.includes(`/${SERVICE_SETUP_LINE_TEXT.roundsLabel}/โซน/${SERVICE_SETUP_LINE_TEXT.packsLabel}/`), revoke);
});

test('30/09 การ์ดราง/ข้อสั้นพูดคำใหม่ — แถวบรรทัด "งานบริการ? · แพ็คเกจ · จำนวนรอบบริการ" · แถวโซน "รอบละกี่แพ็ค"', () => {
  const view = viewFixture({
    flow: 'backfill',
    issues: [
      { key: 'rounds_missing', lineId: 'L3', tab: 'overview', message: 'รายการ 3: ยังไม่ใส่จำนวนรอบบริการ' },
      { key: 'packs_missing', lineId: 'L2', zoneId: 'Z1', tab: 'overview', message: 'รายการ 2 · Floor 1: ยังไม่ใส่รอบละกี่แพ็ค' },
    ],
  });
  const rows = Object.fromEntries(backfillRailChecks(view).map((row) => [row.key, row]));
  assert.equal(rows.lines.label, 'งานบริการ? · แพ็คเกจ · จำนวนรอบบริการ');
  assert.equal(rows.lines.sub, 'รายการ 3: ยังไม่ใส่จำนวนรอบบริการ');
  assert.equal(rows.zones.label, 'ไซต์ · โซน · รอบละกี่แพ็ค');
  assert.equal(rows.zones.sub, 'รายการ 2: ยังไม่ใส่รอบละกี่แพ็ค');
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
  assert.match(css, /--c-kind: 132px;/, 'คอลัมน์ ① กว้างพอสองปุ่ม — "ไม่ใช่" ไม่ชนขอบ');
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
    'ตั้งงานบริการ (แพ็คเกจ · ไซต์ · โซน · จำนวนรอบบริการ · รอบละกี่แพ็ค · ช่วงบริการ) แล้วยื่นให้ผู้จัดการฝ่ายขายตรวจ · ยอด/Actual/เอกสารไม่เปลี่ยน');
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
