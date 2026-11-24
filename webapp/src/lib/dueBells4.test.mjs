// ── งวด 4 วันกำหนด: กระดิ่งฝ่ายบริการ · ใบเสนอราคา · หนังสือรับรอง (มติเจ้าของ 24/11/2026 · docs/due-overdue-system.md §12) ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  PLANNER_ROLE, REFILL_OVERDUE_KIND, REFILL_SOON_KIND, VISIT_OVERDUE_KIND,
  plannerIds, refillNotices, siteRefillBell, visitOverdueNotices,
} from '@/lib/service/serviceDueBells';
import { QUOTE_VALIDITY_KIND, quoteValidityNotices, quoteValidityState } from '@/lib/sales/quoteValidityBell';
import {
  CERTIFICATE_EXPIRED_KIND, certificateExpiredNotices, customerCaretakerIds, latestCertificate,
} from '@/lib/master/certificateBell';
import { CUSTOMER_BELL_KINDS, NOTIFICATION_BOXES, QUOTATION_BELL_KINDS, SERVICE_BELL_KINDS } from '@/lib/notifications';

const TUE = '2026-11-24';

const directory = new Map([
  ['TECH', { id: 'TECH', role: 'ts', teams: [], disabled: false }],
  ['TECH-OFF', { id: 'TECH-OFF', role: 'ts', teams: [], disabled: true }],
  ['PLAN', { id: 'PLAN', role: PLANNER_ROLE, teams: [], disabled: false }],
  ['PLAN-OFF', { id: 'PLAN-OFF', role: PLANNER_ROLE, teams: [], disabled: true }],
  ['HEAD', { id: 'HEAD', role: 'ts_manager', teams: [], disabled: false }],
  ['AE-ODM', { id: 'AE-ODM', role: 'ae', teams: ['ODM'], disabled: false }],
  ['AE-KA', { id: 'AE-KA', role: 'ae', teams: ['KA'], disabled: false }],
  ['FN', { id: 'FN', role: 'finance', teams: ['ODM'], disabled: false }],
  ['ADMIN', { id: 'ADMIN', role: 'admin', teams: ['ODM'], disabled: false }],
  ['OWNER', { id: 'OWNER', role: 'ae', teams: ['ODM'], disabled: false }],
  ['OWNER-OFF', { id: 'OWNER-OFF', role: 'ae', teams: ['ODM'], disabled: true }],
]);

/* ── นัดค้าง ─────────────────────────────────────────────────────────────────── */

const visit = (over = {}) => ({
  id: 'V-1', code: 'SV-26110001', status: 'scheduled', scheduledDate: '2026-11-23', siteId: 'S-1', assigneeId: 'TECH', ...over,
});
const sitesById = new Map([['S-1', { id: 'S-1', code: 'ST-001', name: 'สาขาสีลม' }]]);

test('นัดค้าง: ช่างหลักคนเดียว · ครั้งเดียวต่อ (นัด × วันนัด) · ลิงก์ใบส่งงาน (มติ "ช่างหลัก")', () => {
  const { notices, unrouted } = visitOverdueNotices([visit()], { todayIso: TUE, sitesById, directory });
  assert.equal(unrouted, 0);
  assert.equal(notices.length, 1);
  const [n] = notices;
  assert.deepEqual(n.userIds, ['TECH'], 'ไม่หว่าน Planner/หัวหน้า เมื่อมีช่างหลัก');
  assert.equal(n.kind, VISIT_OVERDUE_KIND);
  assert.equal(n.entityType, 'service_visit');
  assert.equal(n.dedupeKey, 'visit_overdue:V-1:2026-11-23');
  assert.equal(n.title, 'นัดเลยกำหนด 1 วัน · SV-26110001');
  assert.match(n.body, /ST-001 สาขาสีลม/);
  assert.equal(n.href, '/service/visits/V-1');
});

test('นัดค้าง: ไม่มีช่าง/ช่างปิดบัญชี ⇒ Planner ที่เปิดอยู่ (ลิงก์หน้าจัดคิว) · ไม่มี Planner = unrouted', () => {
  for (const assigneeId of [null, 'TECH-OFF']) {
    const { notices } = visitOverdueNotices([visit({ assigneeId })], { todayIso: TUE, sitesById, directory });
    assert.deepEqual(notices[0].userIds, ['PLAN'], `assignee=${assigneeId}`);
    assert.equal(notices[0].href, '/service/schedule?visit=V-1');
    assert.match(notices[0].body, /ยังไม่มีช่างที่รับผิดชอบ/);
  }
  const noPlanner = new Map([...directory].filter(([, u]) => u.role !== PLANNER_ROLE));
  const { notices, unrouted } = visitOverdueNotices([visit({ assigneeId: null })], { todayIso: TUE, directory: noPlanner });
  assert.equal(notices.length, 0);
  assert.equal(unrouted, 1, 'ต้องนับไว้ให้ cron รายงาน ไม่ใช่เงียบ');
});

test('นัดค้าง: ร่าง/ปิด/ยกเลิก/เลื่อน ไม่ยิง · วันนัดวันนี้ยังไม่ค้าง · ค้างเกิน 7 วันไม่ยิงย้อน', () => {
  const skip = [
    visit({ status: 'draft' }), visit({ status: 'done' }), visit({ status: 'partial' }), visit({ status: 'unable' }),
    visit({ status: 'cancelled' }), visit({ status: 'rescheduled' }),
    visit({ scheduledDate: TUE }), visit({ scheduledDate: '2026-11-16' }),
  ];
  assert.equal(visitOverdueNotices(skip, { todayIso: TUE, directory }).notices.length, 0);
  assert.equal(visitOverdueNotices([visit({ status: 'in_progress', scheduledDate: '2026-11-17' })], { todayIso: TUE, directory }).notices.length, 1,
    'กดเริ่มแล้วแต่ไม่ปิด = ค้าง · เลย 7 วันยังยิง');
});

test('Planner = role ts_planner ที่เปิดบัญชี — หัวหน้า TS ไม่นับ', () => {
  assert.deepEqual(plannerIds(directory), ['PLAN']);
  assert.deepEqual(plannerIds(null), []);
});

/* ── น้ำหอม ──────────────────────────────────────────────────────────────────── */

// ขวด 300 ml · 10 ml/วัน = 30 วัน · ติดตั้ง/เติมล่าสุด 2026-10-26 ⇒ หมด 2026-11-25 (อีก 1 วัน)
const asset = (over = {}) => ({ id: 'A-1', siteId: 'S-1', status: 'active', bottleMl: 300, mlPerDay: 10, installedAt: '2026-10-26', ...over });
const site = (over = {}) => ({ id: 'S-1', code: 'ST-001', name: 'สาขาสีลม', customerName: 'บริษัท ก', isActive: true, ...over });

test('น้ำหอมรายไซต์: ใกล้หมด (ไม่มีนัดรองรับ) ⇒ กุญแจไซต์ × วันหมดที่เร็วสุด · ไปที่ Planner', () => {
  const assetsBySite = new Map([['S-1', [asset(), asset({ id: 'A-2', bottleMl: 400 })]]]);
  const { notices } = refillNotices([site()], { todayIso: TUE, assetsBySite, directory });
  assert.equal(notices.length, 1);
  const [n] = notices;
  assert.deepEqual(n.userIds, ['PLAN']);
  assert.equal(n.kind, REFILL_SOON_KIND);
  assert.equal(n.entityType, 'service_site');
  assert.equal(n.dedupeKey, 'refill_soon:S-1:2026-11-25');
  assert.equal(n.title, 'น้ำหอมใกล้หมด 2 เครื่อง · ST-001 สาขาสีลม');
  assert.match(n.body, /อีก 1 วัน/);
  assert.equal(n.href, '/database/sites/S-1');
});

test('น้ำหอมรายไซต์: มีนัดก่อนวันหมด (covered) ⇒ ไม่ยิง · ยังไกล (ok) ⇒ ไม่ยิง · ไซต์ปิดใช้ ⇒ ไม่ยิง', () => {
  const assetsBySite = new Map([['S-1', [asset()]]]);
  const covered = new Map([['S-1', { nextVisitDate: '2026-11-25' }]]);
  assert.equal(refillNotices([site()], { todayIso: TUE, assetsBySite, scheduleBySite: covered, directory }).notices.length, 0);
  const far = new Map([['S-1', [asset({ bottleMl: 1000 })]]]);
  assert.equal(refillNotices([site()], { todayIso: TUE, assetsBySite: far, directory }).notices.length, 0);
  assert.equal(refillNotices([site({ isActive: false })], { todayIso: TUE, assetsBySite, directory }).notices.length, 0);
  const inStock = new Map([['S-1', [asset({ status: 'in_stock' })]]]);
  assert.equal(refillNotices([site()], { todayIso: TUE, assetsBySite: inStock, directory }).notices.length, 0);
});

test('น้ำหอมรายไซต์: เพิ่งหมด 1–7 วัน ⇒ กระดิ่งครั้งที่สอง (มติ "สองครั้ง") · หมดนานแล้วไม่ยิงย้อน และไม่ถอยไปยิง "ใกล้หมด"', () => {
  // ติดตั้ง 2026-10-20 + 30 วัน = หมด 2026-11-19 (เลย 5 วัน)
  const late = asset({ installedAt: '2026-10-20' });
  const bell = siteRefillBell([late, asset({ id: 'A-2' })], { todayIso: TUE });
  assert.deepEqual(bell, { state: 'overdue', due: '2026-11-19', machines: 1 });
  const { notices } = refillNotices([site()], { todayIso: TUE, assetsBySite: new Map([['S-1', [late, asset({ id: 'A-2' })]]]), directory });
  assert.equal(notices[0].kind, REFILL_OVERDUE_KIND);
  assert.equal(notices[0].dedupeKey, 'refill_overdue:S-1:2026-11-19');
  assert.equal(notices[0].title, 'น้ำหอมน่าจะหมดแล้ว 1 เครื่อง · ST-001 สาขาสีลม');

  const old = asset({ installedAt: '2026-09-01' });
  assert.deepEqual(siteRefillBell([old, asset({ id: 'A-2' })], { todayIso: TUE }), { state: null, due: null, machines: 1 },
    'เครื่องหมดนานแล้ว + เครื่องใกล้หมด = เงียบ (Planner จัดนัดเดียวเติมทุกเครื่อง · ไม่ยิงย้อน)');
});

test('น้ำหอมรายไซต์: เครื่องอีกตัวเพิ่งหมดทีหลัง ⇒ กุญแจวันหมดล่าสุดที่เพิ่งเลย (ยิงใหม่)', () => {
  const a = asset({ installedAt: '2026-10-20' });               // หมด 19/11
  const b = asset({ id: 'A-2', installedAt: '2026-10-23' });    // หมด 22/11
  assert.equal(siteRefillBell([a, b], { todayIso: TUE }).due, '2026-11-22');
});

test('น้ำหอมรายไซต์: ไม่มี Planner = unrouted (cron รายงาน)', () => {
  const noPlanner = new Map([...directory].filter(([, u]) => u.role !== PLANNER_ROLE));
  const out = refillNotices([site()], { todayIso: TUE, assetsBySite: new Map([['S-1', [asset()]]]), directory: noPlanner });
  assert.deepEqual(out, { notices: [], unrouted: 1 });
});

/* ── ใบเสนอราคา ──────────────────────────────────────────────────────────────── */

const quote = (over = {}) => ({
  id: 'QT-1', quoteNumber: 'QT-26110001', status: 'sent', validUntil: '2026-11-23', customerName: 'บริษัท ก',
  totalAmount: 12500, dealId: 'D-1', createdBy: 'AE-KA', ...over,
});
const dealsById = new Map([['D-1', { id: 'D-1', ownerId: 'OWNER', stage: 'proposal' }]]);

test('ใบเสนอราคาเลยวันยืนราคา: เจ้าของดีลคนเดียว · ครั้งเดียวต่อ (ใบ × วันยืนราคา) (มติ)', () => {
  const [n, ...rest] = quoteValidityNotices([quote()], { todayIso: TUE, dealsById, directory });
  assert.equal(rest.length, 0);
  assert.deepEqual(n.userIds, ['OWNER'], 'เจ้าของดีล ไม่ใช่คนออกใบ');
  assert.equal(n.kind, QUOTE_VALIDITY_KIND);
  assert.equal(n.entityType, 'quotation');
  assert.equal(n.dedupeKey, 'quote_validity:QT-1:2026-11-23');
  assert.equal(n.title, 'ใบเสนอราคาเลยวันยืนราคา 1 วัน · QT-26110001');
  assert.match(n.body, /ยืนราคาถึง 23\/11\/2026 · ลูกค้ายังไม่ตอบรับ/);
  assert.equal(n.href, '/sales-planning/quotations/QT-1');
});

test('ใบเสนอราคา: สถานะอื่น · ดีล Won/Lost · วันยืนราคาวันนี้ · เลยเกิน 7 วัน · เจ้าของปิดบัญชี ⇒ ไม่ยิง', () => {
  const won = new Map([['D-1', { id: 'D-1', ownerId: 'OWNER', stage: 'won' }]]);
  const lost = new Map([['D-1', { id: 'D-1', ownerId: 'OWNER', stage: 'lost' }]]);
  const off = new Map([['D-1', { id: 'D-1', ownerId: 'OWNER-OFF', stage: 'proposal' }]]);
  for (const status of ['draft', 'accepted', 'rejected', 'cancelled', 'revised', 'closed']) {
    assert.equal(quoteValidityNotices([quote({ status })], { todayIso: TUE, dealsById, directory }).length, 0, status);
  }
  assert.equal(quoteValidityNotices([quote()], { todayIso: TUE, dealsById: won, directory }).length, 0);
  assert.equal(quoteValidityNotices([quote()], { todayIso: TUE, dealsById: lost, directory }).length, 0);
  assert.equal(quoteValidityNotices([quote({ validUntil: TUE })], { todayIso: TUE, dealsById, directory }).length, 0);
  assert.equal(quoteValidityNotices([quote({ validUntil: '2026-11-16' })], { todayIso: TUE, dealsById, directory }).length, 0);
  assert.equal(quoteValidityNotices([quote()], { todayIso: TUE, dealsById: off, directory }).length, 0);
});

test('ใบไม่มีดีล (ใบค่าสรรพสามิต) ⇒ คนออกใบ', () => {
  const [n] = quoteValidityNotices([quote({ dealId: null })], { todayIso: TUE, dealsById, directory });
  assert.deepEqual(n.userIds, ['AE-KA']);
});

test('ป้ายบนหน้าใบ = ตัวตัดสินเดียวกับกระดิ่ง — คำชุดกลาง', () => {
  assert.equal(quoteValidityState(quote(), { todayIso: TUE }).text, 'เลยกำหนด 1 วัน');
  assert.equal(quoteValidityState(quote({ validUntil: TUE }), { todayIso: TUE }).text, 'ครบกำหนดวันนี้');
  assert.equal(quoteValidityState(quote({ validUntil: '2026-11-26' }), { todayIso: TUE }).text, 'อีก 2 วัน');
  assert.equal(quoteValidityState(quote({ status: 'accepted' }), { todayIso: TUE }), null);
  assert.equal(quoteValidityState(quote(), { todayIso: TUE, dealStage: 'won' }), null);
  assert.equal(quoteValidityState(quote({ validUntil: null }), { todayIso: TUE }), null);
});

/* ── หนังสือรับรองบริษัท ─────────────────────────────────────────────────────── */

const cert = (issuedDate, id = 'AT-1') => ({ id, entityId: 'C-1', docType: 'company_certificate', metadata: { issuedDate } });
const customer = (over = {}) => ({ id: 'C-1', arCode: 'AR-001', name: 'บริษัท ก', nameEn: '', teams: ['ODM'], isActive: true, ...over });

test('หนังสือรับรอง: ฉบับที่ใช้ได้นานสุด · ไม่รู้วันที่ออกไม่นับ · ชนิดอื่นไม่นับ', () => {
  assert.deepEqual(latestCertificate([cert('2026-05-20'), cert('2026-01-10', 'AT-2')], TUE),
    { issuedDate: '2026-05-20', expiresAt: '2026-11-20' });
  assert.equal(latestCertificate([cert('')], TUE), null);
  assert.equal(latestCertificate([{ ...cert('2026-05-20'), docType: 'pp20' }], TUE), null);
});

test('หนังสือรับรองเพิ่งหมดอายุ: ฝ่ายขายทีมที่ดูแล (ไม่รวม FN/admin/ทีมอื่น) · ลิงก์แท็บเอกสาร', () => {
  const attachmentsByCustomer = new Map([['C-1', [cert('2026-05-20')]]]);
  const { notices, unrouted } = certificateExpiredNotices([customer()], { todayIso: TUE, attachmentsByCustomer, directory });
  assert.equal(unrouted, 0);
  const [n] = notices;
  assert.deepEqual(n.userIds.sort(), ['AE-ODM', 'OWNER']);
  assert.equal(n.kind, CERTIFICATE_EXPIRED_KIND);
  assert.equal(n.entityType, 'customer');
  assert.equal(n.dedupeKey, 'certificate_expired:C-1:2026-11-20');
  assert.equal(n.title, 'หนังสือรับรองบริษัทหมดอายุ · บริษัท ก');
  assert.equal(n.href, '/database/customers/C-1#customer-docs');
});

test('หนังสือรับรอง: แนบฉบับใหม่แล้ว · หมดนานแล้ว · ยังไม่หมด · ลูกค้าปิดใช้ ⇒ ไม่ยิง · ลูกค้าไม่มีทีม = unrouted', () => {
  const run = (rows, c = customer()) => certificateExpiredNotices([c], {
    todayIso: TUE, attachmentsByCustomer: new Map([['C-1', rows]]), directory,
  });
  assert.equal(run([cert('2026-05-20'), cert('2026-11-01', 'AT-2')]).notices.length, 0, 'ฉบับใหม่ยังใช้ได้');
  assert.equal(run([cert('2026-05-10')]).notices.length, 0, 'หมด 10/11 = เกิน 7 วัน');
  assert.equal(run([cert('2026-05-24')]).notices.length, 0, 'หมดวันนี้ ยังไม่เลย');
  assert.equal(run([cert('2026-05-20')], customer({ isActive: false })).notices.length, 0);
  assert.deepEqual(run([cert('2026-05-20')], customer({ teams: [], team: null })), { notices: [], unrouted: 1 });
  assert.deepEqual(customerCaretakerIds(customer({ teams: ['KA'] }), directory), ['AE-KA']);
});

/* ── ทะเบียนกระดิ่ง + cron ──────────────────────────────────────────────────── */

test('kind ใหม่อยู่ในทะเบียนกระดิ่งของโมดูล — ไม่งั้นเขียนลงตารางแต่ไม่ขึ้นกระดิ่ง', () => {
  for (const kind of [VISIT_OVERDUE_KIND, REFILL_SOON_KIND, REFILL_OVERDUE_KIND]) assert.ok(SERVICE_BELL_KINDS.includes(kind), kind);
  assert.ok(CUSTOMER_BELL_KINDS.includes(CERTIFICATE_EXPIRED_KIND));
  assert.ok(QUOTATION_BELL_KINDS.includes(QUOTE_VALIDITY_KIND));
  for (const kind of [VISIT_OVERDUE_KIND, REFILL_SOON_KIND, REFILL_OVERDUE_KIND, CERTIFICATE_EXPIRED_KIND, QUOTE_VALIDITY_KIND]) {
    assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(kind), `${kind} หลุดจากกระดิ่ง`);
  }
  assert.equal(NOTIFICATION_BOXES.bell.entityTypes.includes('quotation'), false, 'ใบเสนอราคาไม่มีเธรด — เข้าทาง kinds');
});

test('cron daily-digest เรียกครบสี่เรื่องของงวด 4 และกรองหน้าต่าง 7 วันที่ query', () => {
  const src = readFileSync(new URL('../app/api/cron/daily-digest/route.js', import.meta.url), 'utf8');
  for (const fn of ['notifyVisitOverdue', 'notifyRefill', 'notifyQuoteValidity', 'notifyCertificateExpired']) {
    assert.match(src, new RegExp(`\\[\\s*'\\w+',\\s*${fn}\\s*\\]`), `${fn} ไม่ได้ถูกเรียกในรอบเช้า`);
  }
  assert.match(src, /from\('service_visits'\)[\s\S]{0,200}\.in\('status', \['scheduled', 'in_progress'\]\)/);
  assert.match(src, /\.eq\('status', QUOTE_AWAITING_STATUS\)/);
});
