// ── จองานบริการรายบรรทัดของใบสั่งขาย (U6 · mig 0391 · PR-A) — ตรรกะของร่าง + ยามซอร์สของคอมโพเนนต์ ───────────────
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
  EMPTY_DRAFT, PERIOD_FIELD_ID, SAVE_FIELD_ID, backfillBannerText, backfillRailChecks, linesCardMeta, backfillStateOfView, derivedRoleOf, draftDirty, fieldErrorsView,
  intOrRaw, issueHeadTail, lineFieldId, lineFieldIds, lineMissing, localSetupCtx, mergedLines, patchDraftLine, rebaseDraft,
  setupPayload, stripParts, submitGateGroups, surveyRequestHref, zonePacksFieldId,
} from '../../components/salesPlanning/serviceSetup/serviceSetupDraft.js';
import {
  ZONES_BULK_NONE_PICKED, ZONES_BULK_PACKS_INVALID, zonesBulkCapText, zonesBulkConsequence, zonesBulkPlan,
} from '../../components/service/zonesBulkPlan.js';
import { SERVICE_SETUP_LIMITS, serviceSetupFieldId, serviceSetupTotals } from './serviceSetup.js';

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

test('lineMissing — ยังไม่เลือกชนิด · นับของที่ยังว่าง · ตั้งครบ · ไม่ใช่งานบริการที่ยังมีโซนค้าง', () => {
  const view = viewFixture();
  const [l1, l2, l3, l4] = mergedLines(view, EMPTY_DRAFT, { fgById: fgById(view) });
  assert.deepEqual(lineMissing(l1), { state: 'unset', count: 1, label: 'ยังไม่เลือกชนิด' });
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
  /* zones_on_not_service ชี้ `svc-line-<id>-zones` บนบรรทัดที่ไม่มีตารางโซน — id ต้องอยู่ที่ข้อความแดงของบรรทัดนั้น */
  assert.match(code(`${FOLDER}/ServiceLineSetupBlock.js`),
    /<span className=\{styles\.fieldError\} role="alert" id=\{lineFieldId\(line\.lineId, "zones"\)\} tabIndex=\{-1\}>\{zonesError\}<\/span>/);
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
      { key: 'rounds_missing', tab: 'overview', lineId: 'L3', message: 'รายการ 3: ยังไม่ใส่รอบบริการ' },
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
  assert.deepEqual(issueHeadTail('รายการ 3: ยังไม่ใส่รอบบริการ'), { head: 'รายการ 3', rest: ': ยังไม่ใส่รอบบริการ' });
  assert.deepEqual(issueHeadTail('รายการ 5 · Floor 2: ยังไม่ใส่แพ็คต่อรอบ'), { head: 'รายการ 5 · Floor 2', rest: ': ยังไม่ใส่แพ็คต่อรอบ' });
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
  assert.equal(rows.lines.sub, 'รายการ 1: ยังไม่เลือกชนิด', 'บรรทัดรองสั้น — ไม่ยกข้อความเต็มที่พกคำอธิบายบรรทัดมา (ดัน dt จนหดเหลือคำละบรรทัด)');
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
  assert.deepEqual([rows.lines.value, rows.lines.sub], ['0/5 รายการ', 'รายการ 1: ยังไม่เลือกชนิด · อีก 4 รายการ']);
  assert.deepEqual([rows.zones.value, rows.zones.ok, rows.zones.sub], ['0/5 รายการ', false, 'รอเลือกชนิด 5 รายการ']);
  assert.deepEqual([rows.period.value, rows.period.ok], ['ยังไม่ใส่', false], 'บรรทัดที่ยังไม่เลือกชนิดอาจเป็นแพ็คเกจ — ไม่ใช่ "ไม่ต้องใส่"');
  assert.notEqual(rows.period.sub, 'ไม่มีแพ็คเกจ — ไม่ต้องใส่');
  for (const key of ['installments', 'billing']) {
    assert.deepEqual([rows[key].value, rows[key].ok], ['รอเลือกชนิดรายการ', false], key);
  }
  // ทุกบรรทัดไม่ใช่งานบริการจริง = ไม่ต้องใส่ช่วงบริการ/งวด
  const none = Object.fromEntries(backfillRailChecks(viewFixture({
    flow: 'backfill', period: null, allocations: [], totals: { packageLines: 0, unsetLines: 0 }, issues: [],
    lines: [viewFixture().lines[3]],
  })).map((row) => [row.key, row]));
  assert.deepEqual([none.period.sub, none.period.ok], ['ไม่มีแพ็คเกจ — ไม่ต้องใส่', true]);
  assert.equal(none.installments.ok, true);
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
    'งวด 1–3, 5–12: ยังไม่เลือกรอบวางบิล (ลูกค้ามีรอบวางบิล) · 11 งวด — เติมทีเดียวได้ด้วย ‘เติมตามรอบ เดือนละงวด…’ ที่แท็บการชำระ');
  assert.equal(merged.entry.installmentId, 'I1', '"ไปแก้" พาไปงวดแรก');
  assert.equal(merged.entries.length, 11);
  assert.equal(issueHeadTail(merged.entry.message).head, 'งวด 1–3, 5–12', 'หัวตัวหนาครอบช่วงงวด');
  assert.equal(payment.items[1].entry.message, 'งวด 4: ยังไม่ใส่กำหนดชำระ — หรือเลือก ‘รอเหตุการณ์’', 'ข้อเดี่ยวไม่เปลี่ยน');
  // ลูกค้าวางบิลได้ทุกวัน — ไม่ชวนไปปุ่มเติมตามรอบ (ปุ่มไม่มีสำหรับรอบแบบนี้)
  const anyday = [1, 2].map((seq) => ({ ...billing(seq, 'anyday'), message: `งวด ${seq}: ยังไม่ใส่วันวางบิล (ลูกค้าวางบิลได้ทุกวัน) — ใส่วันที่คอลัมน์วันวางบิล หรือเลือก ‘รอเหตุการณ์’` }));
  assert.equal(submitGateGroups(anyday, [])[0].items[0].entry.message,
    'งวด 1–2: ยังไม่ใส่วันวางบิล (ลูกค้าวางบิลได้ทุกวัน) — ใส่วันที่คอลัมน์วันวางบิล หรือเลือก ‘รอเหตุการณ์’ · 2 งวด');
});

test('F4/F14: ข้อบล็อกของบัญชี (FN) ไม่มี "ไปแก้" + ป้ายรอฝ่ายบัญชี · กลุ่มที่มีแต่คำเตือนนับเป็น "เตือน n ข้อ"', () => {
  const groups = submitGateGroups(
    [
      { key: 'rounds_missing', tab: 'overview', lineId: 'L3', message: 'รายการ 3: ยังไม่ใส่รอบบริการ' },
      { key: 'coverage_gap', tab: 'payment', owner: 'FN', tag: 'รอฝ่ายบัญชี', installmentId: 'I2', message: 'ช่วงครอบขาด … ที่บัญชีรับรองแล้ว — ฝ่ายบัญชีแก้ที่แผงงวด' },
    ],
    [],
  );
  const fn = groups[1].items[0];
  assert.deepEqual([fn.kind, fn.tag, fn.jump], ['issue', 'รอฝ่ายบัญชี', false]);
  const warnOnly = submitGateGroups(
    [{ key: 'rounds_missing', tab: 'overview', lineId: 'L3', message: 'รายการ 3: ยังไม่ใส่รอบบริการ' }],
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
  assert.equal(zonesBulkConsequence(assessed, { lineNo: 1 }), 'จะเพิ่ม 3 โซนใต้รายการ 1 · แพ็คต่อรอบตามผลประเมิน 1 โซน · ยังว่าง 2 โซน');

  const equal = zonesBulkPlan({ selectedIds: ['Z1', 'Z2'], zonesById, mode: 'equal', equalPacks: ' 3 ' });
  assert.deepEqual(equal.rows, [{ zoneId: 'Z1', packsPerRound: 3 }, { zoneId: 'Z2', packsPerRound: 3 }]);
  assert.equal(zonesBulkConsequence(equal, { lineNo: 2, mode: 'equal' }), 'จะเพิ่ม 2 โซนใต้รายการ 2 · แพ็คต่อรอบเท่ากันทุกโซน 3 แพ็ค');
  assert.equal(zonesBulkPlan({ selectedIds: ['Z1'], zonesById, existingCount: 499, cap: 500 }).error, null, 'เต็มพอดี 500 ยังเพิ่มได้');
});

/* ══ ส่วนที่ 2: ยามซอร์ส (แผน §2.7) ═══════════════════════════════════════════════════════════════════ */

test('D19: ไม่มีปุ่ม "ขอ TS เพิ่มไซต์" / TaskFormModal / มอบหมายงานข้ามฝ่าย — มีแค่ลิงก์คำร้อง + บรรทัดแนะนำ', () => {
  const paths = code(`${FOLDER}/ServiceRegistryPaths.js`);
  assert.doesNotMatch(paths, /TaskFormModal|personal-tasks|ขอ TS เพิ่มไซต์/);
  assert.match(paths, /surveyRequestHref\(\{ dealId, orderId \}\)/);
  assert.match(read(`${FOLDER}/ServiceRegistryPaths.js`), /แจ้งหัวหน้า TS ให้เพิ่มที่ ทะเบียนไซต์ › เพิ่มไซต์ย้อนหลัง/);
  for (const rel of UI_FILES) assert.doesNotMatch(code(rel), /TaskFormModal|personal-tasks/, rel);
});

test('QuotationReadOnlyLineItems — renderAfterRow เป็นทางเลือก: ไม่ส่ง = ไม่มีแถวต่อท้าย (ใบเสนอราคา/ขั้น ④ เหมือนเดิม)', () => {
  const source = code('components/salesPlanning/QuotationLineItems.js');
  const ro = source.slice(source.indexOf('export function QuotationReadOnlyLineItems'), source.indexOf('export default function'));
  assert.match(ro, /\n\s*renderAfterRow,\n/, 'ไม่มีค่าตั้งต้น');
  assert.match(ro, /const after = renderAfterRow \? renderAfterRow\(line, index\) : null;/);
  assert.match(ro, /\{after != null && after !== false \? \(\s*<tr className=\{styles\.afterRow\}><td colSpan=\{7\} className="ui-cell-wide">\{after\}<\/td><\/tr>\s*\) : null\}/);
  assert.equal((ro.match(/<tr/g) || []).length, 4, 'หัว · บรรทัด · แถวต่อท้าย (มีเงื่อนไข) · แถวว่าง — ไม่มีแถวอื่นงอก');
  const editable = source.slice(source.indexOf('export default function'));
  assert.doesNotMatch(editable, /renderAfterRow/, 'ตารางแบบแก้ของใบเสนอราคาไม่แตะ');
  assert.match(read('components/salesPlanning/QuotationLineItems.module.css'), /\.readOnlyTable tbody tr\.afterRow > td \{/);
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

test('แผ่นชนิดรายการไม่มีค่าตั้งต้น — ค่ามาจากชนิดของบรรทัด (ยังไม่รู้ = null) · ตัวเลือกจาก SERVICE_KIND_OPTIONS', () => {
  const block = code(`${FOLDER}/ServiceLineSetupBlock.js`);
  const tiles = block.slice(block.indexOf('<OptionTiles'), block.indexOf('/>', block.indexOf('<OptionTiles')));
  assert.match(tiles, /value=\{line\.role === SERVICE_ROLE_UNSET \? null : line\.role\}/);
  assert.match(tiles, /options=\{SERVICE_KIND_OPTIONS\}/);
  assert.match(tiles, /invalid=\{!!kindError\}/);
});

test('กฎ 3: สีแดงมาหลังกดเท่านั้น — ทุก invalid/data-invalid/data-bad อ้างผลหลังกด (highlight · error · pressed · blocked)', () => {
  for (const rel of JSX_FILES) {
    const source = code(rel);
    for (const match of source.matchAll(/(?:\binvalid|data-invalid|data-bad)=\{([^}]*)\}/g)) {
      assert.match(match[1], /error|Error|pressed|blocked/, `${rel}: ${match[0]}`);
    }
  }
  /* ข้อความแดงของช่องมาจาก highlightOf (แผงแดงของหน้า/ผลบันทึกไม่ผ่าน) ไม่ใช่ตัวตรวจบนจอ */
  const block = code(`${FOLDER}/ServiceLineSetupBlock.js`);
  assert.match(block, /const kindError = highlightOf\(lineFieldId\(line\.lineId, "kind"\)\);/);
  assert.match(block, /error=\{highlightOf\(lineFieldId\(line\.lineId, "fg"\)\)\}/);
  assert.match(block, /error=\{highlightOf\(lineFieldId\(line\.lineId, "rounds"\)\)\}/);
  assert.match(block, /return <Tag tone=\{pressed \? "danger" : "neutral"\}>/, 'ป้ายสถานะเป็นกลางก่อนกด');
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
  const rows = code(`${FOLDER}/ServiceZoneRows.js`);
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
    'ตั้งแพ็คเกจ · โซน · แพ็คต่อรอบ · รอบ · ช่วงบริการ แล้วยื่นให้ผู้จัดการฝ่ายขายตรวจ · ยอด/Actual/เอกสารไม่เปลี่ยน');
  assert.equal(backfillBannerText(view('submitted', { submittedAt: '2026-09-28T03:00:00Z', submittedByName: 'Lalida Chaiwanna' })),
    'ยื่นตรวจงานบริการแล้ว — รอผู้จัดการฝ่ายขายตรวจ (ตีกลับก่อนจึงแก้ได้) · ยื่นเมื่อ 28/09/2026 โดย Lalida Chaiwanna · ยอด/Actual/เอกสารไม่เปลี่ยน');
  const panel = code(`${FOLDER}/ServiceBackfillPanel.js`);
  assert.match(panel, /backfillBannerText\(view\)/);
  const meta = linesCardMeta({
    order: { quotationId: 'QT1', quotation: { quoteNumber: 'QT-26090261-0' } },
    view: view('submitted', { submittedAt: '2026-09-28T03:00:00Z' }), flow: 'backfill', editable: false, lineCount: 5, totals: { zones: 0 },
  });
  assert.equal(meta, '5 รายการ · ราคา/จำนวนจาก QT-26090261-0 แก้ไม่ได้ · งานบริการตั้งย้อนหลัง ยื่นตรวจ 28/09/2026');
  assert.match(code(`${FOLDER}/SalesOrderServiceLines.js`), /meta=\{linesCardMeta\(/);
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
  const rows = code(`${FOLDER}/ServiceZoneRows.js`);
  assert.doesNotMatch(rows, /ท้ายตาราง/);
  assert.match(rows, /โหลดทะเบียนไซต์ไม่สำเร็จ — กด “ลองโหลดอีกครั้ง” ด้านบนตาราง/);
  assert.match(rows, /const removeBlocked = registry\.error/);
  assert.match(rows, /if \(removeBlocked\) \{/);
});
