// ── จอของ "ยื่นโดยยังไม่ตั้งงานบริการ" (U3 · mig 0404 · มติเจ้าของ 01/10 "ผูกรอบบริการให้ข้ามได้ มาใส่ทีหลัง Actual ได้"
//    → ทาง "ฝ่ายขายกดข้ามเอง" · แผน IMPL_PLAN_DEFER §5) — ตัวช่วยล้วนของจอ + ยามซอร์สของการต่อสาย + ยามเอกสาร ───────────────────
//
// ส่วนที่ 1: ตัวช่วยล้วน (`serviceSetupDraft.js`) ไล่กับตัวตัดสินจริงของ `serviceSetup.js` — ป้าย 'ข้ามได้' ของแผงแดง ·
//            ประกาศสี่แบบบนใบรออนุมัติ · หัว/ป้ายของแบนเนอร์และการ์ดรางหลังอนุมัติ · หัวการ์ดงานบริการ · แถบผู้อนุมัติ
// ส่วนที่ 2: ยามซอร์ส — แผงแดง (`SubmitGateNotice`) · ประกาศ (`ServiceDeferNotice`) · หน้าใบ (`pressSkipSubmit` · ทัก · ป้าย · จุดเมานต์) ·
//            ทะเบียนใบสั่งขาย (ป้ายต่อท้ายแถวคิว) — หน้าใบเป็น JSX ที่รันใต้ node ไม่ได้ ⇒ อ่านซอร์ส (ตัดคอมเมนต์ก่อน)
//            ⭐ พฤติกรรมจริงของสายทั้งเส้น (กดยื่น → แผงแดง → ปุ่มข้าม → โมดัล → PATCH · ติดด่าน · ใบขยับ · เน็ตหลุด · โมดัลอนุมัติ · หลังอนุมัติ)
//              ถูกกดจริงบนคอมโพเนนต์ตัวจริงใน Chrome ที่ `mockups/so-service-lines/ui-harness-0404/drive.mjs` (นอก repo · 1440 และ 390)
// ส่วนที่ 3: ยามเอกสาร — หัวข้อของ 0404 ใน docs/so-service-setup.md ตรงกับโค้ด (ตารางกลุ่มข้อ · ชื่อที่อ้าง · สถานะ · สารบัญ)
// 🔴 กติกาที่ยามนี้ล็อก: จอไม่ตัดสินเองว่าข้ามได้ไหม (ถาม `view.skip` / `view.deferred` ของก้อน GET) · ไม่พิมพ์คำไทยของงานนี้เอง (แคตตาล็อก) ·
//    ปุ่มข้ามกดได้เสมอ (ติดด่าน = บอกเหตุตอนกด) · แดงหลังกดเท่านั้น · เวลาของใบไปตามตัวอักษร · เขียนข้อมูลไม่ลองซ้ำ · ไม่มี style={{
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  SERVICE_BACKFILL_STATE_LABELS, SERVICE_DEFER_TEXT, SERVICE_DEFERRED_TEXT, SERVICE_REOPENED_TEXT, SERVICE_SETUP_ISSUE_TEXT,
  SERVICE_SETUP_SQL_MESSAGES, serviceSetupDeferSplit, serviceSetupDeferred, serviceSetupIssueGroup, serviceSetupIssues, serviceSetupSkipState,
  serviceSetupView, serviceSetupWarnings,
} from './serviceSetup.js';
import {
  backfillBannerText, backfillCopyOfView, backfillRailOnTop, deferNoticeOfView, serviceCardMeta, skipTagsShown, stripParts, submitGateGroups,
} from '../../components/salesPlanning/serviceSetup/serviceSetupDraft.js';

const SRC = path.resolve(process.cwd(), 'src');
const read = (rel) => readFileSync(path.join(SRC, rel), 'utf8');
/* ตัดคอมเมนต์ก่อน — คำอธิบายในคอมเมนต์ต้องไม่ทำให้ยามเขียว/แดงผิด */
const code = (rel) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
const FOLDER = 'components/salesPlanning/serviceSetup';
const PAGE = 'app/sales-planning/sales-orders/[id]/page.js';
const LIST = 'app/sales-planning/sales-orders/page.js';
const page = code(PAGE);

/** ข้อความตั้งแต่ `from` ถึง `to` ตัวแรกหลังจากนั้น (ไม่รวม `to`) — หาไม่เจอ = ยามพัง ไม่ใช่ผ่านเงียบ */
function slice(src, from, to) {
  const start = src.indexOf(from);
  assert.ok(start >= 0, `หา "${from}" ไม่เจอ — ชื่อ/ขอบเขตเปลี่ยนแล้ว อัปเดตยามนี้ด้วย`);
  const end = src.indexOf(to, start + from.length);
  assert.ok(end > start, `หา "${to}" ต่อจาก "${from}" ไม่เจอ`);
  return src.slice(start, end);
}
const count = (src, re) => (src.match(re) || []).length;
/* คำไทยของงานนี้ที่ต้องมาจากแคตตาล็อกเท่านั้น (จอ/หน้าพิมพ์เอง = แดง) */
const FEATURE_WORDS = /ยื่นโดยยังไม่ตั้งงานบริการ|ข้ามตอนยื่น|ข้ามการตั้ง|ข้ามได้|ยังไม่ส่ง TS|ยังไม่ส่งงาน/;

/* ══ บริบทตัวอย่าง (รูปเดียวกับที่ serviceSetupRepo โหลด) — ใบสาย SERVICE 3 รายการ ══════════════════════════════════ */
const FG = { id: 'P1', fgCode: 'FG-364-02-001-1061', isActive: true, approvalStatus: 'approved', customerId: 'C1', name: 'SDS WHITE TEA & FIG' };
const ZONES = [
  { id: 'Z1', code: 'ZN-1', name: 'Lobby', siteId: 'S1', isActive: true },
  { id: 'Z2', code: 'ZN-2', name: 'Lift Hall', siteId: 'S1', isActive: true },
  { id: 'Z4', code: 'ZN-4', name: 'Lobby ชั้น 11', siteId: 'S2', isActive: true },
];
const SITES = [
  { id: 'S1', code: 'ST-1', name: 'อวานี สุขุมวิท', customerId: 'C1', kind: 'customer', isActive: true },
  { id: 'S2', code: 'ST-2', name: 'อวานี ริเวอร์ไซด์', customerId: 'C1', kind: 'customer', isActive: true },
];
const line = (n, over = {}) => ({
  id: `L${n}`, lineNo: n, sortOrder: n, fgCode: null, productId: null, description: `รายการ ${n}`, qty: 12, unit: 'เดือน', metadata: {},
  serviceKind: null, serviceProductId: null, serviceFgCode: null, serviceRounds: null, servicePeriodFrom: null, servicePeriodTo: null, ...over,
});
const inst = (seq, over = {}) => ({
  id: `I${seq}`, seq, amount: 46545, status: 'pending', dueDate: `2026-1${seq}-30`, billingDate: null, billingEvent: null, coversFrom: null, coversTo: null, ...over,
});
const UNSET_LINES = () => [
  line(1, { fgCode: FG.fgCode, productId: 'P1' }),
  line(2),
  line(3, { qty: 1, unit: 'งาน' }),
];
const DONE_LINES = () => [
  line(1, { fgCode: FG.fgCode, productId: 'P1', serviceRounds: 12 }),
  line(2, { serviceKind: 'package', serviceProductId: 'P1', serviceFgCode: FG.fgCode, serviceRounds: 12 }),
  line(3, { qty: 1, unit: 'งาน', serviceKind: 'not_service' }),
];
const DONE_ALLOCS = () => [
  { id: 'A1', salesOrderLineId: 'L1', zoneId: 'Z1', packsPerRound: 2, sortOrder: 0 },
  { id: 'A2', salesOrderLineId: 'L1', zoneId: 'Z2', packsPerRound: 1, sortOrder: 1 },
  { id: 'A3', salesOrderLineId: 'L2', zoneId: 'Z4', packsPerRound: 1, sortOrder: 0 },
];
const COVERED = () => [inst(1, { coversFrom: '2026-10-01', coversTo: '2027-03-31' }), inst(2, { coversFrom: '2027-04-01', coversTo: '2027-09-30' })];
const DEFER = { serviceSetupDeferredAt: '2026-10-08T02:30:00Z', serviceSetupDeferredById: 'U-AE', serviceSetupDeferredByName: 'Kamonrat Pipattanapong' };
const DONE = { servicePeriodFrom: '2026-10-01', servicePeriodTo: '2027-09-30' };

function ctxOf({ order = {}, lines = UNSET_LINES(), allocations = [], installments = [inst(1), inst(2)], predecessor = null } = {}) {
  return {
    order: {
      id: 'SO1', orderNumber: 'SO-26100012-0', status: 'draft', origin: 'pipeline', customerId: 'C1', dealId: 'DL1', deal: { id: 'DL1', line: 'SERVICE' },
      projectId: null, project: null, totalAmount: 93090, actualAmount: 87000, supersededById: null, revisedFromId: null,
      servicePeriodMode: 'whole', servicePeriodFrom: null, servicePeriodTo: null, serviceTermsOpenedAt: null, serviceSetupState: null,
      updatedAt: '2026-10-08T02:18:00.123456+00:00', ...order,
    },
    lines, allocations, installments,
    zonesById: new Map(ZONES.map((zone) => [zone.id, zone])),
    sitesById: new Map(SITES.map((site) => [site.id, site])),
    productsById: new Map([[FG.id, FG]]),
    fgOptions: [{ ...FG, ownerArCode: null }],
    fgOptionIds: new Set(['P1']),
    siblingSites: [], customerBillingRule: null, contract: null, liveTermsByZone: new Map(), predecessor, unsaved: false,
  };
}
const viewOf = (ctx, who = { canEdit: true, userId: 'U-AE', role: 'ae' }) => serviceSetupView(ctx, who);
const SUBMITTED = { status: 'pending_approval', submittedBy: 'U-AE', submittedByName: 'Kamonrat Pipattanapong', submittedAt: '2026-10-08T02:30:00Z' };
const APPROVED = { status: 'approved', approvedAt: '2026-10-08T04:00:00Z' };

/* ══ ส่วนที่ 1: ตัวช่วยล้วน ══════════════════════════════════════════════════════════════════════════════════ */

test('แผงแดง: submitGateGroups ติด deferrable ตามตัวถามของผู้เรียก — ข้อของการตั้ง/ช่วงครอบ = ข้ามได้ · เงิน/บัญชี/คำเตือน = ไม่ · ไม่ส่งตัวถาม = แผงเดิม', () => {
  const ctx = ctxOf({ installments: [inst(1), inst(2, { dueDate: null })] });
  const issues = serviceSetupIssues(ctx);
  const split = serviceSetupDeferSplit(issues);
  assert.equal(split.deferrable, true);
  const groups = submitGateGroups(issues, serviceSetupWarnings(ctx), { deferrable: (entry) => serviceSetupIssueGroup(entry) !== 'blocking' });
  const items = groups.flatMap((group) => group.items);
  const byKey = (key) => items.filter((item) => item.entry.key === key);
  for (const key of ['kind_missing', 'rounds_missing', 'zones_missing', 'period_missing']) {
    assert.ok(byKey(key).length > 0 && byKey(key).every((item) => item.deferrable === true), `${key} ต้องติดป้าย`);
  }
  /* ช่วงครอบ 2 งวดรวมเป็นแถวเดียว — ข้อแรกตัดสิน */
  assert.equal(byKey('coverage_missing').length, 1, 'ช่วงครอบสองงวดรวมแถวเดียว');
  assert.equal(byKey('coverage_missing')[0].entries.length, 2);
  assert.equal(byKey('coverage_missing')[0].deferrable, true);
  /* กำหนดชำระ = ข้ามไม่ได้ */
  assert.deepEqual(byKey('due_missing').map((item) => item.deferrable), [false]);
  /* จำนวนแถวที่ติดป้าย = ข้อที่เลื่อนได้ทั้งหมด (นับข้อ ไม่ใช่แถว) */
  const tagged = items.filter((item) => item.deferrable).reduce((sum, item) => sum + (item.entries ? item.entries.length : 1), 0);
  assert.equal(tagged, split.setup.length + split.follow.length);
  assert.equal(tagged, serviceSetupSkipState(ctx, { canEdit: true, issues }).deferredCount, 'เท่ากับตัวเลขในบรรทัดท้ายแผง');

  /* ไม่ส่งตัวถาม = ทุกแถว false และแถวอย่างอื่นเท่าเดิมทุกช่อง (แผงเดิมของใบที่ไม่เกี่ยว/เส้นตั้งย้อนหลัง) */
  const plain = submitGateGroups(issues, serviceSetupWarnings(ctx));
  assert.ok(plain.flatMap((group) => group.items).every((item) => item.deferrable === false));
  const strip = (list) => list.map((group) => ({ ...group, items: group.items.map(({ deferrable, ...rest }) => rest) }));
  assert.deepEqual(strip(plain), strip(groups), 'ป้ายเป็นช่องเสริมอย่างเดียว — กลุ่ม/ลำดับ/ข้อความ/ไปแก้ ไม่เปลี่ยน');
  assert.deepEqual(submitGateGroups(issues, [], { deferrable: null }), submitGateGroups(issues, []));

  /* ของบัญชี (owner FN) ไม่มีทางติดป้าย แม้ตัวถามตอบ true · คำเตือนก็เช่นกัน */
  const fn = submitGateGroups(
    [{ key: 'coverage_gap', tab: 'payment', owner: 'FN', tag: 'รอฝ่ายบัญชี', installmentId: 'I2', seq: 2, message: 'งวด 2: ช่องโหว่' }],
    [{ key: 'coverage_overlap', tab: 'payment', owner: 'SA', message: 'งวด 1 กับ งวด 2 ครอบซ้อน' }],
    { deferrable: () => true },
  )[0].items;
  assert.deepEqual(fn.map((item) => [item.kind, item.deferrable, item.tag]), [['issue', false, 'รอฝ่ายบัญชี'], ['warning', false, 'เตือน · ไม่บล็อกการยื่น']]);
});

test('แผงแดง: ป้าย \'ข้ามได้\' ขึ้นเมื่อข้ามได้ หรือติดเพราะยังเหลือข้อที่ข้ามไม่ได้ — ใบ Rev. ที่ใบเดิมยังเดินรอบ (ข้ามไม่ได้ทั้งใบ) ไม่มีป้าย', () => {
  const can = { canEdit: true };
  const open = serviceSetupSkipState(ctxOf(), can);
  assert.deepEqual([open.visible, open.canSkip, skipTagsShown(open)], [true, true, true]);
  assert.equal(open.lead, SERVICE_DEFER_TEXT.panelLead(open.deferredCount));

  const blocked = serviceSetupSkipState(ctxOf({ installments: [inst(1), inst(2, { dueDate: null })] }), can);
  assert.deepEqual([blocked.visible, blocked.canSkip, blocked.blockingCount, skipTagsShown(blocked)], [true, false, 1, true],
    'แผงต้องแยกให้เห็นว่าข้อไหนเลื่อนได้ ข้อไหนต้องแก้ก่อน');
  assert.equal(blocked.lead, SERVICE_DEFER_TEXT.panelBlocked(blocked.deferredCount, 1));

  const running = { id: 'SO0', orderNumber: 'SO-26090001-0', activePlanSiteIds: ['S1', 'S2'] };
  const rev = serviceSetupSkipState(ctxOf({ order: { revisedFromId: 'SO0' }, predecessor: running }), can);
  assert.deepEqual([rev.visible, rev.canSkip, skipTagsShown(rev)], [true, false, false], 'ป้ายจะขัดกับบรรทัดท้ายแผง "ข้ามการตั้งงานบริการไม่ได้"');
  assert.equal(rev.lead, SERVICE_DEFER_TEXT.panelPredecessor('SO-26090001-0'));
  /* ใบ Rev. แบบนั้นที่มีข้อเรื่องเงินด้วย — ยังเป็นเหตุของใบเดิม (มาก่อน) ⇒ ไม่มีป้าย */
  const revMoney = serviceSetupSkipState(ctxOf({ order: { revisedFromId: 'SO0' }, predecessor: running, installments: [inst(1), inst(2, { dueDate: null })] }), can);
  assert.deepEqual([revMoney.blockingCount > 0, skipTagsShown(revMoney)], [true, false]);

  for (const none of [null, undefined, {}, serviceSetupSkipState(ctxOf(), { canEdit: false }), serviceSetupSkipState(ctxOf({ order: SUBMITTED }), can)]) {
    assert.equal(skipTagsShown(none), false);
  }
});

test('ประกาศบนใบรออนุมัติ (deferNoticeOfView): สี่แบบจาก active × blocking — ไม่สัญญาการอนุมัติที่ด่านจะปฏิเสธ · ไม่มีแบบไหนแดง', () => {
  const pending = (over = {}) => viewOf(ctxOf({ order: { ...SUBMITTED, ...DEFER }, ...over }), { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' });

  /* 1) ยังข้ามอยู่ ไม่มีข้อค้าง — ผลของการอนุมัติ + ทางให้ตั้งก่อน */
  const active = pending();
  assert.deepEqual([active.deferred.stage, active.deferred.active, active.deferred.missing, active.deferred.blocking], ['pending', true, 7, 0]);
  assert.deepEqual(deferNoticeOfView(active), {
    tone: 'warning', title: 'ยื่นโดยยังไม่ตั้งงานบริการ', tag: 'ยังไม่ตั้งงานบริการ',
    lines: [
      'Kamonrat Pipattanapong เลือกข้ามการตั้งงานบริการตอนยื่น (08/10/2026) · ยังขาด 7 ข้อ — อนุมัติแล้วนับ Actual ทันที แต่ยังไม่ส่งงานให้ TS จนกว่าจะตั้งงานบริการและผู้จัดการฝ่ายขายอนุมัติ',
      'ต้องการให้ตั้งก่อนอนุมัติ: ผู้ยื่นกด ‘ดึงกลับ’ หรือผู้อนุมัติกด ‘ตีกลับให้แก้ไข’ (การข้ามถูกล้าง ต้องเลือกใหม่ตอนยื่น)',
    ],
  });

  /* 2) ยังข้ามอยู่ แต่มีข้อที่ข้ามไม่ได้โผล่ระหว่างรอ — บอกว่าอนุมัติไม่ได้ ไม่ชวนให้กดอนุมัติ */
  const blocked = deferNoticeOfView(pending({ installments: [inst(1), inst(2, { dueDate: null })] }));
  assert.deepEqual([blocked.tone, blocked.tag], ['warning', 'ยังไม่ตั้งงานบริการ']);
  assert.equal(blocked.lines[1], 'แต่ยังมี 1 ข้อที่ข้ามไม่ได้ — อนุมัติไม่ได้จนกว่าจะตีกลับให้ฝ่ายขายแก้');
  assert.ok(blocked.lines[0].includes('ยังขาด 7 ข้อ'));
  assert.equal(blocked.lines.length, 2);

  /* 3) เลือกข้ามไว้ แต่ตอนนี้ครบแล้ว — โทนข้อมูล ไม่มีป้าย (การอนุมัติส่ง TS ตามปกติ) */
  const complete = deferNoticeOfView(pending({ order: { ...SUBMITTED, ...DEFER, ...DONE }, lines: DONE_LINES(), allocations: DONE_ALLOCS(), installments: COVERED() }));
  assert.deepEqual(complete, {
    tone: 'info', title: 'ยื่นโดยยังไม่ตั้งงานบริการ', tag: null,
    lines: ['Kamonrat Pipattanapong เลือกข้ามไว้ตอนยื่น (08/10/2026) แต่ตอนนี้งานบริการครบแล้ว — อนุมัติแล้วส่งงานให้ TS ตามปกติ'],
  });

  /* 4) เลือกข้ามไว้ แต่ไม่เหลือข้อของการตั้งให้ข้าม และยังขาดเรื่องเงิน — อนุมัติไม่ได้ */
  const stuck = deferNoticeOfView(pending({
    order: { ...SUBMITTED, ...DEFER, ...DONE }, lines: DONE_LINES(), allocations: DONE_ALLOCS(),
    installments: [inst(1, { coversFrom: '2026-10-01', coversTo: '2027-03-31' }), inst(2, { dueDate: null, coversFrom: '2027-04-01', coversTo: '2027-09-30' })],
  }));
  assert.deepEqual([stuck.tone, stuck.tag, stuck.lines], ['warning', null,
    ['Kamonrat Pipattanapong เลือกข้ามไว้ตอนยื่น (08/10/2026) แต่ตอนนี้ข้ามไม่ได้แล้ว และยังขาด 1 ข้อ — อนุมัติไม่ได้ · ตีกลับให้ฝ่ายขายแก้แล้วยื่นใหม่']]);

  for (const notice of [deferNoticeOfView(active), blocked, complete, stuck]) assert.ok(['warning', 'info'].includes(notice.tone), 'ไม่แดงก่อนกด (กฎ 3)');

  /* ไม่ใช่ขั้นรออนุมัติ / ไม่มีตราการข้าม = ไม่มีประกาศ */
  assert.equal(deferNoticeOfView(viewOf(ctxOf({ order: { ...SUBMITTED } }))), null, 'ใบรออนุมัติปกติ');
  assert.equal(deferNoticeOfView(viewOf(ctxOf({ order: { ...SUBMITTED, ...DEFER, ...APPROVED } }))), null, 'อนุมัติแล้ว = หน้าที่ของแบนเนอร์/การ์ดราง');
  assert.equal(deferNoticeOfView(viewOf(ctxOf())), null);
  assert.equal(deferNoticeOfView(null), null);
  assert.equal(deferNoticeOfView({}), null);
});

test('หลังอนุมัติ: แบนเนอร์/การ์ดรางพูด "ข้ามการตั้งงานบริการตอนยื่น" (ใคร · เมื่อไร) — ป้ายขั้นเป็นของใบเดิม · ใบเดิมและใบที่เปิดแก้คำเดิมทุกตัวอักษร', () => {
  const view = viewOf(ctxOf({ order: { ...SUBMITTED, ...DEFER, ...APPROVED } }));
  assert.deepEqual([view.flow, view.mode, view.deferred.stage, view.reopened], ['backfill', 'edit', 'approved', null]);
  const copy = backfillCopyOfView(view);
  assert.deepEqual(copy, {
    reopened: null,
    deferred: view.deferred,
    bannerTitle: 'ข้ามการตั้งงานบริการตอนยื่น',
    bannerLead: null,
    eyebrow: 'Service setup · ข้ามตอนยื่น',
    title: 'งานบริการ (ข้ามตอนยื่น)',
    meta: 'อนุมัติแล้วโดยยังไม่ตั้งงานบริการ — ผู้จัดการฝ่ายขายตรวจก่อนส่งให้ TS',
    firstStep: 'ตั้งค่า',
    stateLabel: SERVICE_BACKFILL_STATE_LABELS.not_started,
    reopenLine: 'ข้ามการตั้งงานบริการตอนยื่น 08/10/2026 โดย Kamonrat Pipattanapong',
  });
  assert.equal(backfillBannerText(view),
    'ข้ามโดย Kamonrat Pipattanapong 08/10/2026 — ตั้งงานบริการ (แพ็คเกจ · ไซต์ · โซน · จำนวนรอบบริการ · รอบละกี่แพ็ค · ช่วงบริการ) แล้วยื่นให้ผู้จัดการฝ่ายขายตรวจ · ยอด/Actual/เอกสารไม่เปลี่ยน');
  assert.equal(backfillRailOnTop(view), true, 'การ์ดรางอยู่บนสุดของรางขวาระหว่างยังไม่ยื่นตรวจ — กติกาเดิม');
  /* ไม่มีคำของใบเดิมบนใบที่ข้าม */
  for (const value of [copy.bannerTitle, copy.eyebrow, copy.title, copy.meta, backfillBannerText(view)]) assert.doesNotMatch(value, /ใบเดิม|ตั้งย้อนหลัง|ก่อนมีการตั้งงานบริการ/);

  /* ยื่นตรวจแล้ว: บรรทัดหลักเป็นของการยื่น (ตัวเดิม) · ใครข้าม/เมื่อไรขึ้นเป็นบรรทัดนำ + ค้างบนการ์ดราง */
  const submittedView = viewOf(ctxOf({
    order: {
      ...SUBMITTED, ...DEFER, ...APPROVED, ...DONE, serviceSetupState: 'submitted', serviceSetupSubmittedAt: '2026-10-09T03:00:00Z',
      serviceSetupSubmittedById: 'U-AE', serviceSetupSubmittedByName: 'Kamonrat Pipattanapong',
    },
    lines: DONE_LINES(), allocations: DONE_ALLOCS(), installments: COVERED(),
  }), { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' });
  const submitted = backfillCopyOfView(submittedView);
  assert.equal(submitted.stateLabel, SERVICE_BACKFILL_STATE_LABELS.submitted);
  assert.equal(submitted.bannerLead, 'ข้ามการตั้งงานบริการตอนยื่น 08/10/2026 โดย Kamonrat Pipattanapong');
  assert.equal(submitted.reopenLine, submitted.bannerLead);
  assert.match(backfillBannerText(submittedView), /^ยื่นตรวจงานบริการแล้ว — รอผู้จัดการฝ่ายขายตรวจ/);
  assert.equal(backfillRailOnTop(submittedView), false);
  /* หัวการ์ดงานบริการ */
  assert.equal(serviceCardMeta({ view: submittedView, flow: 'backfill', editable: false, totals: {} }), 'ข้ามตอนยื่น · ยื่นตรวจ 09/10/2026');
  const editing = serviceCardMeta({ view, flow: 'backfill', editable: true, totals: {} });
  assert.ok(editing.endsWith(' · ข้ามการตั้งงานบริการตอนยื่น — แก้ได้จนกว่าจะยื่นตรวจ'), editing);

  /* ใบเดิม (ไม่มีตราการข้าม) — คำเดิมทุกตัวอักษร */
  const legacyView = viewOf(ctxOf({ order: { ...SUBMITTED, ...APPROVED } }));
  const legacy = backfillCopyOfView(legacyView);
  assert.deepEqual([legacy.deferred, legacy.reopened, legacy.bannerTitle, legacy.eyebrow, legacy.title, legacy.meta, legacy.firstStep, legacy.reopenLine, legacy.bannerLead],
    [null, null, 'ใบนี้อนุมัติก่อนมีการตั้งงานบริการ', 'Service setup · ใบเดิม', 'งานบริการ (ใบเดิม)',
      'ตั้งย้อนหลังบนใบที่อนุมัติแล้ว — ผู้จัดการฝ่ายขายตรวจก่อนส่งให้ TS', 'ตั้งค่า', null, null]);
  assert.ok(serviceCardMeta({ view: legacyView, flow: 'backfill', editable: true, totals: {} }).endsWith(' · แก้ได้จนกว่าจะยื่นตรวจ'));
  assert.ok(!serviceCardMeta({ view: legacyView, flow: 'backfill', editable: true, totals: {} }).includes('ข้าม'));
  assert.equal(backfillBannerText(legacyView),
    'ตั้งงานบริการ (แพ็คเกจ · ไซต์ · โซน · จำนวนรอบบริการ · รอบละกี่แพ็ค · ช่วงบริการ) แล้วยื่นให้ผู้จัดการฝ่ายขายตรวจ · ยอด/Actual/เอกสารไม่เปลี่ยน');

  /* ใบที่ข้ามตอนยื่น → ประทับแล้ว → เปิดแก้หลังอนุมัติ: เหตุการณ์ที่เกิดทีหลังชนะ — server ส่ง reopened ไม่ส่ง deferred ⇒ ป้ายของ 0396 */
  const reopenedView = viewOf(ctxOf({
    order: {
      ...SUBMITTED, ...DEFER, ...APPROVED, serviceSetupReopenedAt: '2026-10-12T03:00:00Z', serviceSetupReopenedByName: 'Lalida Chaiwanna',
      serviceSetupReopenedReason: 'SA คีย์โซนผิด — ต้องเป็นอีกโซน',
    },
  }));
  assert.deepEqual([reopenedView.deferred, !!reopenedView.reopened], [null, true]);
  assert.equal(backfillCopyOfView(reopenedView).bannerTitle, SERVICE_REOPENED_TEXT.bannerTitle);
  assert.equal(backfillCopyOfView(reopenedView).deferred, null);
  /* ป้องกันสองชั้น: ถ้าก้อนพกทั้งสอง (ไม่ควรเกิด) ป้ายของการเปิดแก้ชนะ — ไม่ปนคำสองชุด */
  assert.equal(backfillCopyOfView({ ...view, reopened: reopenedView.reopened }).bannerTitle, SERVICE_REOPENED_TEXT.bannerTitle);
  /* ใบรออนุมัติ (stage 'pending') ไม่ใช่งานของแบนเนอร์ */
  assert.equal(backfillCopyOfView({ flow: 'backfill', state: {}, deferred: { stage: 'pending', at: DEFER.serviceSetupDeferredAt } }).deferred, null);
});

test('แถบผู้อนุมัติ: "อนุมัติแล้วยังไม่ส่ง TS" ขึ้นสีเตือน (คำจากแคตตาล็อก) · สัญญายังไม่ผูกยังเตือนเหมือนเดิม', () => {
  const strip = code(`${FOLDER}/ServiceSetupStrip.js`);
  assert.match(strip, /const warnPart = \(part\) => part\.includes\("ยังไม่ผูก"\) \|\| part\.includes\(SERVICE_DEFERRED_TEXT\.stripWarn\);/);
  assert.match(strip, /<span className=\{warnPart\(part\) \? styles\.stripWarn : undefined\}>\{part\}<\/span>/);
  const view = viewOf(ctxOf({ order: { ...SUBMITTED, ...DEFER } }), { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' });
  assert.equal(view.stripText, 'งานบริการ: ข้ามการตั้งตอนยื่น · ยังขาด 7 ข้อ · อนุมัติแล้วยังไม่ส่ง TS');
  const { label, parts } = stripParts(view.stripText);
  assert.equal(label, 'งานบริการ:');
  assert.deepEqual(parts.filter((part) => part.includes(SERVICE_DEFERRED_TEXT.stripWarn)), ['อนุมัติแล้วยังไม่ส่ง TS'], 'ส่วนเดียวที่ขึ้นสีเตือน');
});

/* ══ ส่วนที่ 2: ยามซอร์ส ══════════════════════════════════════════════════════════════════════════════════ */

test('SubmitGateNotice: ท้ายแผงขึ้นเมื่อหน้าส่ง skip เท่านั้น · บรรทัดเป็นของ server · ปุ่มกดได้เสมอ (ดับเฉพาะตอนยิง) · ป้ายเฉพาะแถวที่เลื่อนได้', () => {
  const gate = code(`${FOLDER}/SubmitGateNotice.js`);
  assert.match(gate, /issues = \[\], warnings = \[\], flow = "pipeline", checkedAt = null, onJump, skip = null, onSkip, skipBusy = false,/);
  assert.match(gate, /const skipRow = skip\?\.visible \? skip : null;/, 'ไม่ส่ง / ไม่ visible = ไม่มีท้ายแผง');
  assert.match(gate, /\{skipRow \? \(\s*<div className=\{styles\.skip\}>/);
  assert.equal(count(gate, /styles\.skip\b/g), 1, 'ท้ายแผงมีจุดเดียว');
  /* บรรทัดท้ายแผง = ของ server ทั้งบรรทัด — คอมโพเนนต์ไม่ประกอบ/ไม่เลือกข้อความเอง */
  assert.match(gate, /<p id=\{skipTextId\} className=\{styles\.skipText\}>\{thaiText\(skipRow\.lead\)\}<\/p>/);
  assert.doesNotMatch(gate, /panelLead|panelBlocked|panelPredecessor|deferredCount|blockingCount|canSkip/, 'จอไม่ตัดสินว่าข้ามได้ไหม/ไม่นับข้อเอง');
  /* ปุ่ม: คำจากแคตตาล็อก · ไม่ใช่ปุ่มหลัก · ดับได้เหตุเดียวคือหน้ากำลังยิงคำสั่ง · เหตุบล็อกเป็น title (บอกจริงตอนกด — หน้า) */
  const button = slice(gate, '<div className={styles.skip}>', '</div>');
  assert.match(button, /\{SERVICE_DEFER_TEXT\.button\}/);
  assert.match(button, /variant="outline"/);
  assert.doesNotMatch(button, /tone="(primary|accent|danger)"/);
  /* 🔴 ปุ่มห้ามใช้ `disabled` ของเบราว์เซอร์: หน้าตั้ง busy ระหว่างโหลดก้อนสดทุกครั้งที่กด — ปุ่มที่ถือโฟกัสถูก disabled = โฟกัสตกไป <body>
     (คนใช้คีย์บอร์ด/โปรแกรมอ่านจอหลุดตำแหน่ง · โมดัลที่เปิดตามมาคืนโฟกัสไม่ถูกที่ — ตรวจทานรอบสุดท้าย) ⇒ aria-disabled + ไม่รับการกดซ้ำ
     · เหตุเดียวที่ทำให้ปุ่มไม่รับการกดคือหน้ากำลังยิงคำสั่ง (ติดด่าน = โชว์แล้วบอกเหตุตอนกด — ห้ามดับปุ่มด้วยเหตุของข้อมูล) */
  assert.doesNotMatch(button, /\sdisabled=\{/, 'ห้าม disabled ของเบราว์เซอร์บนปุ่มข้าม (โฟกัสหลุด)');
  assert.deepEqual(button.match(/aria-disabled=\{[^}]*\}/g), ['aria-disabled={skipBusy || undefined}']);
  assert.match(button, /aria-busy=\{skipBusy \|\| undefined\}/);
  assert.match(button, /title=\{skipRow\.blockedReason \|\| undefined\}/);
  assert.match(button, /aria-describedby=\{skipTextId\}/);
  assert.match(button, /onClick=\{\(\) => \{ if \(!skipBusy\) onSkip\?\.\(\); \}\}/, 'กำลังยิงอยู่ = ไม่รับการกดซ้ำ');
  const skipCss = read(`${FOLDER}/SubmitGateNotice.module.css`);
  assert.match(skipCss, /\.skipButton\[aria-disabled="true"\] \{\s*opacity: var\(--op-disabled\);\s*cursor: not-allowed;\s*\}/, 'หน้าตาเท่าปุ่ม disabled ของระบบ');
  /* ป้ายแถว: ตัวตัดสินกลาง + ข้อของแผงเอง · เฉพาะเมื่อ skipTagsShown · ของบัญชีไม่มี (serviceSetupIssueGroup ตอบ blocking ให้ owner FN) */
  assert.match(gate, /const split = skipTagsShown\(skipRow\) \? serviceSetupDeferSplit\(list\) : null;/);
  assert.match(gate, /deferrable: split\?\.deferrable \? \(entry\) => serviceSetupIssueGroup\(entry\) !== "blocking" : null,/);
  assert.match(gate, /\{item\.deferrable \? <Tag tone="neutral">\{SERVICE_DEFER_TEXT\.deferTag\}<\/Tag> : null\}/);
  assert.equal(serviceSetupIssueGroup({ key: 'coverage_gap', owner: 'FN' }), 'blocking');
  /* ไม่พิมพ์คำของงานนี้เอง · หัว/คำอธิบายของแผงไม่เปลี่ยน */
  assert.doesNotMatch(gate, FEATURE_WORDS);
  assert.match(gate, /title=\{SERVICE_SETUP_PANEL_TEXT\.title\(flow, list\.length\)\}/);
  assert.doesNotMatch(gate, /style=\{\{/);

  /* CSS: ท้ายแผงพื้นกลาง (ไม่แดง) · จอแคบเรียงลง ปุ่มเต็มแถวสูงขนาดนิ้ว · แถวที่ติดป้ายให้ข้อความเต็มแถว */
  const css = read(`${FOLDER}/SubmitGateNotice.module.css`);
  const rule = (selector) => css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)));
  assert.match(rule('.skip'), /background: var\(--panel-solid\);/);
  assert.match(rule('.skip'), /border-top: 1px solid var\(--border\);/);
  assert.doesNotMatch(rule('.skip') + rule('.skipText') + rule('.skipButton'), /--red/, 'ทางเลือก ไม่ใช่ข้อผิด');
  /* จุดตัดจากชุดแนะนำของระบบ (breakpointScale.test.mjs) — 680px = จุดเดียวกับเลย์เอาต์หน้ารายละเอียด */
  assert.ok(css.includes('@media (max-width: 680px)'));
  const mobile = css.slice(css.indexOf('@media (max-width: 680px)'));
  assert.match(mobile, /\.skip \{\s*flex-direction: column;\s*align-items: stretch;\s*\}/);
  assert.match(mobile, /\.skip button\.skipButton \{\s*width: 100%;\s*min-height: var\(--ctl-h-touch\);\s*justify-content: center;\s*\}/);
  assert.match(mobile, /\.item\[data-deferrable\] \.itemText \{\s*flex-basis: 100%;\s*\}/);
  assert.match(gate, /data-deferrable=\{item\.deferrable \? "" : undefined\}/);
});

test('ServiceDeferNotice: client component วาดอย่างเดียว — แบบ/คำมาจาก deferNoticeOfView · ไม่แดง · CSS จากโฟลเดอร์เดียวกัน', () => {
  const raw = read(`${FOLDER}/ServiceDeferNotice.js`);
  assert.match(raw, /^"use client";/);
  const notice = code(`${FOLDER}/ServiceDeferNotice.js`);
  assert.match(notice, /const notice = deferNoticeOfView\(view\);\s*if \(!notice\) return null;/);
  assert.match(notice, /tone=\{notice\.tone\}/);
  assert.match(notice, /title=\{notice\.title\}/);
  assert.match(notice, /action=\{notice\.tag \? <Tag tone="warning">\{notice\.tag\}<\/Tag> : null\}/);
  assert.match(notice, /notice\.lines\.map\(\(line\) => <span key=\{line\} className=\{styles\.bannerLine\}>\{thaiText\(line\)\}<\/span>\)/);
  assert.match(notice, /import styles from "\.\/ServiceBackfillPanel\.module\.css";/);
  assert.doesNotMatch(notice, /tone="(error|danger)"|SERVICE_DEFERRED_TEXT|style=\{\{|apiJson|apiFetch/, 'ไม่ตัดสิน ไม่ยิง ไม่แดง');
  assert.doesNotMatch(notice, /[฀-๿]/, 'ไม่มีคำไทยในคอมโพเนนต์ — แคตตาล็อกที่เดียว');
});

test('หน้าใบ: pressSkipSubmit — ยังไม่บันทึก → ก้อนสด → ปุ่มไม่ควรมีแล้ว → ติดด่าน (บอกเหตุ) → โมดัลยืนยัน → PATCH พร้อมธงและเวอร์ชันตามตัวอักษร', () => {
  const press = slice(page, 'async function pressSkipSubmit() {', '\n  }\n');
  const at = (needle) => {
    const index = press.indexOf(needle);
    assert.ok(index >= 0, `pressSkipSubmit ขาด: ${needle}`);
    return index;
  };
  const unsavedAt = at('if (dirty || datesDirty || confirmFiles.length) {');
  const dirtyAt = at('if (setup.dirty) {');
  const freshAt = at('const fresh = await freshServiceView();');
  const goneAt = at('if (!skip?.visible) {');
  const panelAt = at('showSubmitIssues([...(fresh.issues || []), ...(skip.extraIssues || [])], fresh.warnings, "pipeline", "server", skip);\n    if (skip.blockedReason || !skip.prompt) {');
  const blockedAt = at('notifyToast.error(skip.blockedReason || SERVICE_DEFER_TEXT.gone);');
  const dialogAt = at('setConfirmState({');
  assert.ok(unsavedAt < dirtyAt && dirtyAt < freshAt && freshAt < goneAt && goneAt < panelAt && panelAt < blockedAt && blockedAt < dialogAt, 'ลำดับด่าน');

  /* 0) 🔴 ฟอร์มเอกสารของใบมีของที่ยังไม่บันทึก (โหมดแก้ไขข้อมูล · ไฟล์ยืนยันคำสั่งซื้อที่เลือกค้าง · ร่างวันของงวด) = ไม่ยิง บอกเหตุตอนกด
        ก่อนด่านอื่นทั้งหมด (ปุ่ม ‘ยื่นอนุมัติ’ ปกติหายไประหว่างแก้ แต่แผงแดงกับปุ่มนี้ยังอยู่ — ยื่นแล้ว load() เขียนทับฟอร์ม ของที่พิมพ์หายเงียบ) */
  assert.match(press, /if \(dirty \|\| datesDirty \|\| confirmFiles\.length\) \{\s*notifyToast\.error\(SERVICE_DEFER_TEXT\.unsavedDocument\);\s*return;\s*\}/);
  assert.ok(press.slice(0, unsavedAt).indexOf('freshServiceView') < 0 && press.slice(0, unsavedAt).indexOf('requestAction') < 0, 'ด่านของที่ยังไม่บันทึกมาก่อนการยิงใด ๆ');

  /* 1) ร่างงานบริการที่ยังไม่บันทึก = ข้อเดียวของจอ (ยังไม่ถาม server) */
  assert.match(press, /if \(setup\.dirty\) \{\s*showSubmitIssues\(serviceSetupIssues\(\{ unsaved: true \}\), \[\], "pipeline", "client"\);\s*return;\s*\}/);
  /* 2) โหลดไม่ขึ้น = ไม่ถือว่าผ่าน + ทักในจอ (แถบ error ของหน้าอยู่เหนือแผงแดง — พ้นจอ) */
  assert.match(press, /const fresh = await freshServiceView\(\);\s*if \(!fresh\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?notifyToast\.error\(SERVICE_DEFER_TEXT\.loadFailed\);\s*return;\s*\}\s*const skip = fresh\.skip \|\| null;/);
  /* 3) ปุ่มไม่ควรมีแล้วบนก้อนสด: ยังเป็นร่าง+มีข้อ = แผงของสด + ทัก · ครบแล้ว = ล้างแผง + ชวนยื่นปกติ · ไม่ใช่ร่าง = ล้างแผง + ทัก · โหลดตัวใบตาม */
  const gone = press.slice(goneAt, panelAt);
  assert.match(gone, /const stillDraft = fresh\.flow === "pipeline";/);
  assert.match(gone, /if \(stillDraft && fresh\.issues\?\.length\) \{\s*showSubmitIssues\(fresh\.issues, fresh\.warnings, "pipeline", "server"\);\s*notifyToast\.error\(SERVICE_DEFER_TEXT\.gone\);/);
  assert.match(gone, /setSubmitIssues\(null\);\s*if \(stillDraft\) notifyToast\.info\(SERVICE_DEFER_TEXT\.complete\);\s*else notifyToast\.error\(SERVICE_DEFER_TEXT\.gone\);/);
  assert.match(gone, /refreshOrder\(\);\s*return;\s*\}\s*$/);
  assert.doesNotMatch(gone, /setConfirmState/);
  /* 4) ติดด่าน = แผงของสด + เหตุเป็น toast · ไม่เปิดโมดัล */
  assert.match(press, /if \(skip\.blockedReason \|\| !skip\.prompt\) \{\s*notifyToast\.error\(skip\.blockedReason \|\| SERVICE_DEFER_TEXT\.gone\);\s*return;\s*\}/);
  /* 5) โมดัลยืนยัน: ผ่าน approvalPrompt (ผลบังคับ) — หัว/คำถาม/ผลของ server + สองบรรทัดของการยื่น + คำเตือนของฝ่ายขาย */
  const dialog = press.slice(dialogAt);
  assert.match(dialog, /\.\.\.approvalPrompt\(\{\s*title: skip\.prompt\.title,\s*subject: skip\.prompt\.subject,\s*verb: skip\.prompt\.verb,\s*effects: \[\.\.\.submitMoneyLines\(\), \.\.\.skip\.prompt\.effects, \.\.\.saWarningLines\(fresh\.warnings\)\],\s*confirmLabel: skip\.prompt\.confirmLabel,\s*\}\),/);
  /* 6) ยิง: ธง boolean + เวอร์ชันของก้อนสดตามตัวอักษร · โมดัลปิดเสมอ · เน็ตหลุดไม่ค้าง busy */
  assert.match(press, /const version = fresh\.updatedAt \?\? null;/);
  assert.match(dialog, /action: async \(\) => \{\s*try \{\s*await requestAction\("submit", \{ deferServiceSetup: true, expectedUpdatedAt: version \}\);\s*\} catch \(failure\) \{\s*(?:\/\*[\s\S]*?\*\/\s*)?const message = failure\?\.message \|\| SERVICE_DEFER_TEXT\.failed;\s*setBusy\(""\);\s*setError\(message\);\s*notifyToast\.error\(message\);\s*\}\s*return true;\s*\},/,
    'เน็ตหลุด: คืน busy + แถบ error + ทักในจอ · โมดัลปิดเสมอ');
  /* แผงของการกดปุ่มข้าม = ข้อของก้อนสด + ข้อเงินที่การยื่นแบบข้ามต้องการเพิ่ม (`skip.extraIssues`) + ก้อน `skip` ของคำตอบเดียวกัน */
  assert.equal(count(press, /skip\.extraIssues/g), 1);
  assert.doesNotMatch(press, /new Date\(|Date\.parse|toISOString|retry/);
  assert.doesNotMatch(press, /order\.updatedAt|setup\.data/, 'เวอร์ชัน/ข้อมาจากก้อนสดของการกดครั้งนี้ ไม่ใช่ของ render ก่อนหน้า');
  /* หน้าไม่ตัดสินเองว่าข้ามได้ไหม — ถามก้อน GET (ตัวตัดสินอยู่ที่ server) */
  assert.doesNotMatch(page, /serviceSetupDeferSplit|serviceSetupIssueGroup|serviceSetupSkipState|serviceSetupApprovalGate|serviceDeferPrompt/);
  /* การยื่นแบบข้ามมีทางเดียว */
  assert.equal(count(page, /deferServiceSetup: true/g), 1);
  assert.equal(count(page, /pressSkipSubmit/g), 2, 'ประกาศ + ส่งให้แผงแดง');
});

test('การ์ดงานบริการ: ประกาศ "ลูกค้ายังไม่มีไซต์" ของใบร่างไม่บอกว่ายื่นอนุมัติไม่ได้ — ชี้ทางไปปุ่มข้าม (คำจากแคตตาล็อก) · เส้นตั้งย้อนหลังคงคำเดิม', () => {
  const card = code(`${FOLDER}/SalesOrderServiceLines.js`);
  /* เดิม: `…บันทึกร่างได้ แต่${flow === "backfill" ? "ยื่นตรวจ" : "ยื่นอนุมัติ"}ไม่ได้จนกว่ามีโซน` — ไม่จริงกับใบร่างตั้งแต่ 0404 และซ่อนปุ่มข้ามจากคนที่เชื่อ */
  assert.doesNotMatch(card, /ยื่นอนุมัติ"\}ไม่ได้จนกว่ามีโซน|ยื่นอนุมัติไม่ได้จนกว่ามีโซน/);
  assert.match(card, /\{flow === "backfill"\s*\? `\$\{customerText\} ยังไม่มีไซต์ในทะเบียน — เลือกโซนไม่ได้ · บันทึกร่างได้ แต่ยื่นตรวจไม่ได้จนกว่ามีโซน`\s*: SERVICE_DEFER_TEXT\.noSites\(customerText\)\}/);
  assert.equal(count(card, /SERVICE_DEFER_TEXT\.noSites\(/g), 1);
  assert.ok(SERVICE_DEFER_TEXT.noSites('ลูกค้า AR-0100').includes(`‘${SERVICE_DEFER_TEXT.button}’`), 'ประโยคเอ่ยชื่อปุ่มจริง');
});

test('หน้าใบ: สองบรรทัดเรื่องเงินของการยื่นเขียนที่เดียว (submitMoneyLines) — โมดัลยื่นปกติและโมดัลข้ามใช้ตัวเดียวกัน', () => {
  const lines = slice(page, 'function submitMoneyLines() {', '\n  }\n');
  assert.match(lines, /"หลังยื่นแล้วเอกสารจะถูกล็อก ผู้ยื่นดึงเอกสารของตัวเองกลับได้",/);
  assert.match(lines, /`ยอด \$\{fmtMoney\(order\.actualAmount\)\} \(ก่อน VAT\) จะขึ้นเป็น "\$\{PENDING_APPROVAL_LABEL\}" บนภาพรวม ดีล และโครงการ — ยังไม่นับเป็น Actual จนกว่าจะอนุมัติ`,/);
  assert.equal(count(page, /หลังยื่นแล้วเอกสารจะถูกล็อก/g), 1);
  assert.equal(count(page, /จะขึ้นเป็น "\$\{PENDING_APPROVAL_LABEL\}" บนภาพรวม ดีล และโครงการ/g), 1);
  assert.equal(count(page, /submitMoneyLines\(\)/g), 3, 'ประกาศ + โมดัลยื่นปกติ + โมดัลข้าม');
  const confirm = slice(page, 'function openSubmitConfirm() {', '\n  }\n');
  assert.match(confirm, /detail: \[\s*\.\.\.submitMoneyLines\(\),\s*submitLine,\s*\.\.\.warningLines,\s*\]\.filter\(Boolean\)\.join\("\\n"\),/);
  assert.match(confirm, /action: \(\) => requestAction\("submit"\),/, 'ยื่นปกติไม่ส่งธงข้าม');
});

test('หน้าใบ: requestAction — ข้ามไม่ผ่านโหลดก้อนงานบริการใหม่เสมอ + ทักเหตุเมื่อ route ตอบข้อ · ทักหลังสำเร็จอ่านจากแถวที่ route คืน', () => {
  const request = slice(page, 'async function requestAction(action, payload = {}) {', '\n  async function save()');
  /* บล็อกเดิม (ยื่นไม่ผ่าน = ปิดโมดัล + แผงแดง) ยังอยู่ครบ — การข้ามใช้ทางเดียวกัน */
  assert.match(request, /if \(issues && action === "submit"\) \{\s*setConfirmState\(null\);\s*setError\(""\);\s*showSubmitIssues\(issues, data\.warnings, "pipeline", "server", data\.skip\);/,
    'แผงของ 400 พกก้อน skip ของคำตอบเดียวกัน (route ส่งมาเมื่อข้ามไม่ได้ · การยื่นปกติไม่ส่ง = ไม่มีท้ายแผง)');
  /* 🔴 ยื่นแบบข้ามไม่ผ่าน = ทักเหตุ **ทุกกรณี** (ไม่ใช่เฉพาะตอน route ตอบ issues): โมดัลปิดเสมอ + แถบ error ของหน้าอยู่เหนือแผงแดง (พ้นจอ)
     ⇒ 409 แท็บค้าง · ยังไม่มีลายเซ็น · รอบขายค้าง · 500 ต้องเห็นเหตุในจอ · ยังไม่มีลายเซ็น = ปุ่มไปหน้าบัญชีบน toast (ตรวจทานรอบสุดท้าย) */
  assert.match(request, /if \(action === "submit" && payload\.deferServiceSetup\) \{\s*const accountUrl = data\.accountUrl \|\| "";\s*notifyToast\.error\(data\.error \|\| SERVICE_DEFER_TEXT\.failed, accountUrl\s*\? \{ action: \{ label: "ไปบัญชีของฉัน", onClick: \(\) => router\.push\(accountUrl\) \} \}\s*: \{\}\);\s*\}/);
  assert.doesNotMatch(request, /if \(issues && action === "submit" && payload\.deferServiceSetup/, 'ห้ามผูกการทักกับ issues');
  assert.match(request, /if \(issues \|\| payload\.deferServiceSetup\) refreshServiceSetup\(\);/);
  assert.match(request, /refreshOrder\(\);\s*return false;/);
  /* ทัก: ใบที่อนุมัติโดยข้าม — จากแถวที่คืน (ตัวตัดสินกลาง) และอยู่ **ก่อน** กิ่ง "เปิดงานบริการ n โซน" */
  const deferredAt = request.indexOf('action === "approve" && setupRequired && serviceSetupDeferred(data)?.stage === "approved"');
  const openedAt = request.indexOf('action === "approve" && Number(data?.termsOpened) > 0');
  const skipToastAt = request.indexOf(': action === "submit" && payload.deferServiceSetup\n');
  assert.ok(deferredAt > 0 && openedAt > deferredAt && skipToastAt > openedAt, 'ลำดับกิ่งของข้อความทัก');
  assert.match(request, /serviceSetupDeferred\(data\)\?\.stage === "approved"\s*\? SERVICE_DEFERRED_TEXT\.approvedToast/);
  assert.match(request, /action === "submit" && payload\.deferServiceSetup\s*\? SERVICE_DEFER_TEXT\.toast/);
  assert.match(request, /`อนุมัติแล้ว · เปิดงานบริการ \$\{fmtNumber\(Number\(data\.termsOpened\)\)\} โซนให้ TS`/, 'กิ่งเดิมคงอยู่');
  assert.equal(count(page, /serviceSetupDeferred\(/g), 1, 'หน้าใช้ตัวตัดสินแถวใบจุดเดียว (แถวที่ route คืน) — ที่เหลือถาม view ของ GET');

  /* ของจริง: แถวที่อนุมัติโดยข้าม (ยังไม่ประทับ) = ทัก "ยังไม่ส่งงานให้ TS" · ฐานเห็นว่าครบแล้วเปิดรอบขาย (ประทับ) = ไม่เข้ากิ่งนี้ */
  const row = { id: 'SO1', origin: 'pipeline', status: 'approved', supersededById: null, ...DEFER };
  assert.equal(serviceSetupDeferred({ ...row, serviceTermsOpenedAt: null })?.stage, 'approved');
  assert.equal(serviceSetupDeferred({ ...row, serviceTermsOpenedAt: '2026-10-08T04:00:00Z' }), null);
  assert.equal(serviceSetupDeferred({ ...row, serviceTermsOpenedAt: null, serviceSetupDeferredAt: null }), null, 'ใบปกติ');
  assert.equal(SERVICE_DEFERRED_TEXT.approvedToast, 'อนุมัติแล้ว · นับ Actual แล้ว — ยังไม่ส่งงานให้ TS (ข้ามการตั้งงานบริการตอนยื่น)');
  assert.equal(SERVICE_DEFER_TEXT.toast, 'ยื่นอนุมัติแล้ว — ข้ามการตั้งงานบริการไว้ · ตั้งได้หลังอนุมัติ');
});

test('หน้าใบ: ท้ายแผงแดงเฉพาะแผงยื่นอนุมัติที่ server ตอบ · ประกาศ/ป้ายบนใบรออนุมัติผูกกับสถานะของตัวใบ · คำใต้สถานะสามทาง', () => {
  /* ท้ายแผง: แผงของเส้นตั้งย้อนหลัง (backfill) และด่าน "ยังไม่บันทึก" ของจอ (client) ไม่มีปุ่มข้าม */
  /* 🔴 ก้อน skip ของ **ภาพเดียวกับแผง** (`submitIssues.skip`) ไม่ใช่ก้อนงานบริการสดของหน้า — บันทึกงานบริการแล้วแผงคงภาพ ณ ตอนกด:
     อ่านก้อนสด = แถวยัง 7 ข้อแต่ท้ายแผงบอก "ข้าม 6 ข้อ" (ตรวจทานรอบสุดท้าย) */
  assert.match(page, /const submitGateSkip = submitIssues\?\.flow === "pipeline" && submitIssues\.source === "server" && submitIssues\.skip\?\.visible\s*\? submitIssues\.skip\s*: null;/);
  assert.doesNotMatch(page, /setupView\?\.skip/, 'ท้ายแผง/ปุ่มข้ามไม่อ่านก้อนสดของหน้า');
  assert.match(page, /const showSubmitIssues = \(issues, warnings, flow, source, skip = null\) => setSubmitIssues\(\{[^}]*\n\s*skip: skip\?\.visible \? skip : null,\n[^}]*\}\);/);
  /* ด่านก่อนยื่นอนุมัติ (ก้อนสด) พก skip ของก้อนเดียวกันเฉพาะแผงของการยื่นอนุมัติ (เส้นตั้งย้อนหลังไม่มีปุ่มข้าม) */
  assert.match(page, /showSubmitIssues\(fresh\.issues, fresh\.warnings, flow, "server", flow === "pipeline" \? fresh\.skip : null\);/);
  const mount = slice(page, '<SubmitGateNotice', '/>');
  for (const prop of ['skip={submitGateSkip}', 'onSkip={pressSkipSubmit}', 'skipBusy={!!busy}', 'onJump={jumpToIssue}', 'flow={submitIssues.flow}']) {
    assert.ok(mount.includes(prop), `แผงแดงขาด ${prop}`);
  }
  assert.equal(count(page, /<SubmitGateNotice\b/g), 1);

  /* ประกาศ + ป้าย: ก้อน GET (ตัวตัดสินกลาง) × สถานะของตัวใบ (ก้อนตามตัวใบช้ากว่าหนึ่งจังหวะ — ดึงกลับแล้วประกาศต้องไม่ค้าง) */
  assert.match(page, /const deferPending = setupRequired && order\.status === "pending_approval" && setupView\?\.deferred\?\.stage === "pending"\s*\? setupView\.deferred\s*: null;/);
  assert.equal(count(page, /<ServiceDeferNotice\b/g), 1);
  assert.match(page, /\{deferPending \? <ServiceDeferNotice view=\{setupView\} \/> : null\}/);
  const top = slice(page, '{setupFlow === "backfill" ? <ServiceBackfillBanner', '<Tabs');
  const stripAt = top.indexOf('<ServiceSetupStrip');
  const noticeAt = top.indexOf('<ServiceDeferNotice');
  const gateAt = top.indexOf('<SubmitGateNotice');
  assert.ok(stripAt > 0 && noticeAt > stripAt && gateAt > noticeAt, 'ลำดับเหนือแท็บ: แถบผู้อนุมัติ → ประกาศ → แผงแดง');
  assert.doesNotMatch(top, /style=\{\{/);
  assert.match(page, /\{deferPending\?\.active && <StatusBadge size="sm" tone="warning" label=\{SERVICE_DEFERRED_TEXT\.badge\} \/>\}/,
    'ป้ายบนหัวใบเฉพาะเมื่อยังข้ามอยู่ (อนุมัติตอนนี้ยังไม่ส่งงานให้ TS)');
  assert.equal(SERVICE_DEFERRED_TEXT.badge, 'ยังไม่ตั้งงานบริการ');

  /* คำใต้สถานะของใบที่อนุมัติแล้ว: เปิดแก้ → ข้ามตอนยื่น → ใบเดิม (ประโยคเดิมเป็นกิ่งสุดท้าย) */
  assert.match(page, /const backfillActualNote = showBackfillPanel\s*\? \(setupView\?\.reopened\s*\? SERVICE_REOPENED_TEXT\.actualNote\(order\.approvedAt\)\s*: setupView\?\.deferred\s*\? SERVICE_DEFERRED_TEXT\.actualNote\(order\.approvedAt\)\s*: `ยอดถูกนับเป็น Actual แล้ว \(อนุมัติ \$\{fmtDate\(order\.approvedAt\)\}\) — การตั้งงานบริการย้อนหลังไม่เปลี่ยนยอดนี้`\)\s*: null;/);
  assert.equal(SERVICE_DEFERRED_TEXT.actualNote('2026-10-08T04:00:00Z'), 'ยอดถูกนับเป็น Actual แล้ว (อนุมัติ 08/10/2026) — การตั้งงานบริการทีหลังไม่เปลี่ยนยอดนี้');
});

test('หน้าใบ: โมดัลอนุมัติ/Admin Override ไม่มีโค้ดเฉพาะของการข้าม — ผล/ข้อที่ต้องตรวจ/ข้อที่ติดมาจากก้อน GET สด (ซึ่งรู้เรื่องการข้ามแล้ว)', () => {
  const approve = slice(page, 'if (action === "approve") {', '\n      return;');
  assert.match(approve, /checklist: service\?\.approvalChecklist \|\| \[\],/);
  assert.match(approve, /\.\.\.\(service\?\.approvalEffects \|\| \[\]\),/);
  assert.match(approve, /if \(service\?\.issues\?\.length\) setError\(issuesErrorText\(serviceApproveBlockedText\(service\.issues\.length\), service\.issues\)\);/);
  assert.doesNotMatch(approve, /deferred|DEFER|skip/, 'ไม่แตกกิ่งที่จอ');
  assert.match(approve, /action: \(\) => requestAction\("approve"\),/, 'การอนุมัติไม่ส่งอะไรเพิ่ม — ฐานตัดสินจากตราบนใบ');
  assert.match(page, /\{setupRequired && setupView\?\.approvalEffects\?\.length \? \(\s*<StatusNotice tone="info" title="งานบริการของใบนี้">/);

  /* ของจริงที่โมดัลได้: ใบรออนุมัติที่ยังข้ามอยู่ — ข้อที่ต้องตรวจ = ใบนี้ข้าม (ใคร · เมื่อไร) · ผล = ยังไม่ส่ง TS + ทางเดินต่อ · ไม่มีข้อที่ติด */
  const view = viewOf(ctxOf({ order: { ...SUBMITTED, ...DEFER } }), { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' });
  assert.deepEqual(view.approvalChecklist, ['ใบนี้ยื่นโดยยังไม่ตั้งงานบริการ (Kamonrat Pipattanapong 08/10/2026) — ถ้าต้องให้ตั้งก่อน กด ‘ตีกลับให้แก้ไข’ แทนการอนุมัติ']);
  assert.deepEqual(view.approvalEffects, [SERVICE_DEFERRED_TEXT.approveEffectNoTs(7), SERVICE_DEFERRED_TEXT.approveEffectAfter]);
  assert.ok(view.approvalEffects[0].startsWith('ยังไม่ส่งงานบริการให้ TS'));
  assert.deepEqual(view.issues, [], 'ข้อที่ถูกเลื่อนไม่ขึ้นเป็น "อนุมัติไม่ได้ — งานบริการยังขาด n ข้อ"');
  /* มีข้อที่ข้ามไม่ได้ = โมดัลบอกตั้งแต่เปิด (เฉพาะข้อนั้น) */
  const blocked = viewOf(ctxOf({ order: { ...SUBMITTED, ...DEFER }, installments: [inst(1), inst(2, { dueDate: null })] }), { canEdit: true, userId: 'U-SUP', role: 'ae_supervisor' });
  assert.deepEqual(blocked.issues.map((issue) => issue.key), ['due_missing']);
});

test('หน้าใบ + ทะเบียน: ไม่พิมพ์คำไทยของงานนี้เอง — แคตตาล็อกของ serviceSetup.js ที่เดียว', () => {
  assert.doesNotMatch(page, FEATURE_WORDS);
  const list = code(LIST);
  assert.doesNotMatch(list, FEATURE_WORDS);
  for (const name of ['ServiceBackfillPanel.js', 'ServiceSetupStrip.js', 'SalesOrderServiceLines.js']) {
    assert.doesNotMatch(code(`${FOLDER}/${name}`), FEATURE_WORDS, name);
  }
  /* ตัวช่วยของจอเรียกแคตตาล็อก ไม่พิมพ์เอง */
  assert.doesNotMatch(code(`${FOLDER}/serviceSetupDraft.js`), FEATURE_WORDS);
  /* คำหลักของงานนี้ตามที่เจ้าของเห็นบนจอ (เปลี่ยนคำ = รู้ตัว) */
  assert.equal(SERVICE_DEFER_TEXT.button, 'ยื่นโดยยังไม่ตั้งงานบริการ');
  assert.equal(SERVICE_DEFER_TEXT.deferTag, 'ข้ามได้');
  assert.equal(SERVICE_DEFER_TEXT.title, 'ยื่นอนุมัติโดยยังไม่ตั้งงานบริการ');
  for (const value of Object.values({ ...SERVICE_DEFER_TEXT, ...SERVICE_DEFERRED_TEXT })) {
    const sample = typeof value === 'function' ? value({ byName: 'ก', at: '2026-10-08T02:30:00Z' }, 2) : value;
    assert.doesNotMatch(String(sample), /ไปกี่รอบ/, 'คำต้องห้าม');
  }
});

test('ทะเบียนใบสั่งขาย: แถวคิวของใบรออนุมัติที่ข้ามต่อท้ายป้ายของ server หลังยอด — ไม่แตะประโยคยอดก่อน VAT ที่ยามอื่นยึดไว้', () => {
  const list = code(LIST);
  const queue = slice(list, '<ApprovalQueue', 'rowHref=');
  assert.match(queue, /: `\$\{naText\(o\.customerName\)\} · \$\{fmtMoney\(o\.actualAmount\)\} ก่อน VAT`\)\s*\+ \(isHistoricalOrder\(o\) \? " · ใบย้อนหลัง · ไม่นับ Actual" : ""\)\s*\+ \(!financeShell && o\.serviceDeferredTag \? ` · \$\{o\.serviceDeferredTag\}` : ""\)\}/);
  assert.equal(count(list, /serviceDeferredTag/g), 2, 'จุดเดียว (เงื่อนไข + ค่า) — เปลือกบัญชีไม่ต่อ');
  /* แถวรอตรวจงานบริการ: ป้ายมากับแถว (`serviceReview.label` ของ server = "งานบริการ (ข้ามตอนยื่น)") — บรรทัดเดิมไม่แตะ */
  assert.match(queue, /primary=\{\(o\) => \(serviceReviewRow\(o\) \? `\$\{o\.serviceReview\?\.label \|\| SERVICE_REVIEW_LABEL\} · \$\{o\.orderNumber\}` : o\.orderNumber\)\}/);
  assert.equal(SERVICE_DEFERRED_TEXT.queueTag, 'ยังไม่ตั้งงานบริการ (ข้ามตอนยื่น)');
  assert.equal(SERVICE_DEFERRED_TEXT.queueLabel, 'งานบริการ (ข้ามตอนยื่น)');
});

/* ══ ส่วนที่ 3: ยามเอกสาร ══════════════════════════════════════════════════════════════════════════════════ */

test('docs/so-service-setup.md: หัวข้อของ 0404 — สถานะจาก 5 คำ · เจ้าของต้องรัน 0404 ก่อน merge/deploy · ตารางกลุ่มข้อตรงกับตัวตัดสิน · ชื่อที่อ้างมีจริง · แถวสารบัญ', () => {
  const DOC = readFileSync(new URL('../../../../docs/so-service-setup.md', import.meta.url), 'utf8');
  const INDEX = readFileSync(new URL('../../../../docs/INDEX.md', import.meta.url), 'utf8');
  const heading = '### ยื่นโดยยังไม่ตั้งงานบริการ — ข้ามตอนยื่น ตั้งหลังอนุมัติ (mig 0404 · มติเจ้าของ 01/10 · แบรนช์ `claude/so-service-defer`)';
  const start = DOC.indexOf(heading);
  assert.ok(start >= 0, 'หาหัวข้อของ 0404 ไม่เจอ');
  const end = DOC.indexOf('\n### ', start + heading.length);
  assert.ok(end > start);
  const section = DOC.slice(start, end);
  assert.match(section, /\n> สถานะ: \*\*(รอดำเนินการ|กำลังดำเนินการ|รอตรวจ|เสร็จสมบูรณ์|ระงับ)\*\*/);
  assert.match(section, /เจ้าของต้องรัน `0404_so_service_setup_defer\.sql` ที่ SQL Editor ก่อน merge\/deploy/);
  assert.ok(existsSync(new URL('../../../supabase/migrations/0404_so_service_setup_defer.sql', import.meta.url)), 'ไฟล์ migration ที่เอกสารอ้างต้องมีจริง');
  assert.match(section, /"เรื่อง ผูก รอบบริการ ให้ ข้ามได้ มาใส่ที่หลัง Actual ได้"/, 'คำของเจ้าของตามตัวอักษร');

  /* ตารางกลุ่มข้อ: ทุกรหัสในแคตตาล็อกของข้อที่ยังขาด/คำเตือนต้องอยู่ในตาราง และกลุ่มตรงกับ serviceSetupIssueGroup */
  const tableStart = section.indexOf('| รหัสข้อ |');
  assert.ok(tableStart >= 0, 'หาตารางกลุ่มข้อไม่เจอ');
  const table = section.slice(tableStart, section.indexOf('\n\n', tableStart));
  const groupOf = { 'ข้ามได้': 'setup', 'ข้ามได้เมื่อมีข้อของการตั้งงานบริการด้วย': 'follow', 'ข้ามไม่ได้': 'blocking' };
  const rows = table.split('\n').slice(2).map((row) => row.split('|').map((cell) => cell.trim()));
  const seen = new Set();
  for (const cells of rows) {
    const group = cells[2];
    if (!(group in groupOf)) continue;
    for (const key of cells[1].match(/`([a-z_]+)`/g) || []) {
      const name = key.slice(1, -1);
      seen.add(name);
      assert.equal(serviceSetupIssueGroup({ key: name, owner: 'SA' }), groupOf[group], `${name} ในเอกสาร = "${group}"`);
    }
  }
  const WARNINGS = ['coverage_overlap', 'fn_coverage_missing', 'rounds_low'];
  for (const key of Object.keys(SERVICE_SETUP_ISSUE_TEXT)) {
    if (WARNINGS.includes(key)) assert.ok(table.includes(`\`${key}\``), `คำเตือน ${key} ต้องอยู่ในตาราง`);
    else assert.ok(seen.has(key), `ข้อ ${key} ต้องอยู่ในตารางกลุ่มข้อของเอกสาร (เพิ่มข้อใหม่แล้วลืมเอกสาร = แดง)`);
  }
  assert.match(table, /`coverage_gap`[^|]*ของฝ่ายบัญชี/, 'ช่องโหว่ระหว่างงวดที่รับรองแล้ว (ของบัญชี) ข้ามไม่ได้');
  assert.equal(serviceSetupIssueGroup({ key: 'coverage_gap', owner: 'FN' }), 'blocking');

  /* ชื่อที่เอกสารอ้างมีจริง */
  const draft = { backfillCopyOfView, deferNoticeOfView, skipTagsShown, submitGateGroups };
  for (const name of Object.keys(draft)) {
    assert.ok(section.includes(`\`${name}\``), `เอกสารต้องอ้าง ${name}`);
    assert.equal(typeof draft[name], 'function');
  }
  const lib = { serviceSetupDeferred, serviceSetupSkipState, serviceSetupIssueGroup, serviceSetupDeferSplit };
  for (const name of [...Object.keys(lib), 'serviceSetupApprovalGate', 'SERVICE_DEFER_TEXT', 'SERVICE_DEFERRED_TEXT', 'submitOrderDeferringServiceSetup', 'pressSkipSubmit']) {
    assert.ok(section.includes(`\`${name}\``), `เอกสารต้องอ้าง ${name}`);
  }
  assert.match(page, /async function pressSkipSubmit\(\)/);
  assert.match(read('lib/sales/serviceSetupRepo.js'), /export async function submitOrderDeferringServiceSetup\(/);
  for (const sqlCode of ['service_setup_defer_state_invalid', 'service_setup_defer_nothing', 'service_setup_defer_terms_exist', 'service_setup_defer_plans_running']) {
    assert.ok(section.includes(`\`${sqlCode}\``), `เอกสารต้องเล่ารหัส ${sqlCode}`);
    assert.equal(SERVICE_SETUP_SQL_MESSAGES[sqlCode]?.status, 409, sqlCode);
  }
  for (const name of ['submit_sales_order_deferring_service_setup', 'sales_order_open_service_terms', 'sales_orders_service_defer_clear_trg',
    'serviceSetupDeferredAt', 'serviceSetupDeferredById', 'serviceSetupDeferredByName']) {
    assert.ok(section.includes(name), `เอกสารต้องเล่า ${name}`);
    assert.ok(readFileSync(new URL('../../../supabase/migrations/0404_so_service_setup_defer.sql', import.meta.url), 'utf8').includes(name), `${name} ต้องอยู่ในไฟล์ 0404`);
  }
  /* คำบนจอที่เอกสารยกมาตรงกับแคตตาล็อก */
  for (const text of [SERVICE_DEFER_TEXT.button, SERVICE_DEFER_TEXT.deferTag, SERVICE_DEFERRED_TEXT.badge, SERVICE_DEFERRED_TEXT.bannerTitle,
    SERVICE_DEFERRED_TEXT.railTitle, SERVICE_DEFERRED_TEXT.queueTag, SERVICE_DEFERRED_TEXT.queueLabel, SERVICE_DEFERRED_TEXT.approvedToast,
    SERVICE_DEFERRED_TEXT.tsPrefix.trim()]) {
    assert.ok(section.includes(text), `เอกสารต้องยกคำ "${text}" ตามแคตตาล็อก`);
  }
  /* สองใบที่ข้ามไม่ได้ + ย่อหน้าฝ่ายบัญชี + คำถามที่รอเจ้าของ */
  assert.match(section, /กู้คืนจากการยกเลิก/);
  assert.match(section, /ใบ Rev\. ของใบที่ TS ยังเดินรอบบริการ/);
  assert.match(section, /\*\*ฝ่ายบัญชี/);
  assert.match(section, /คำถามที่รอเจ้าของ/);

  /* สารบัญ: แถวของไฟล์นี้บอกว่ามีงาน 0404 และต้องรันก่อน merge/deploy · คำสถานะของแถวยังเท่าหัวไฟล์ */
  const row = INDEX.split('\n').find((line) => line.startsWith('| [so-service-setup.md](so-service-setup.md) |'));
  assert.ok(row, 'หาแถว so-service-setup.md ในสารบัญไม่เจอ');
  assert.match(row, /mig 0404/);
  assert.match(row, /เจ้าของรัน 0404 ก่อน merge\/deploy/);
  assert.match(row, /ยื่นโดยยังไม่ตั้งงานบริการ/);
  const headWord = DOC.split('\n').find((line) => line.startsWith('> สถานะ:')).match(/\*\*([^*]+)\*\*/)[1];
  assert.equal(row.match(/\| ([^|]+) \|$/)?.[1], headWord);
});
