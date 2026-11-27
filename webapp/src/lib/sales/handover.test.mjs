// ส่งต่องานบริหารงานขาย (มติเจ้าของ 27/11/2026 · docs/sales-handover.md)
// ล็อก: ดีลไหนอยู่ในรายการ (เปิด + Won ที่งานยังไม่จบ) · อะไรย้ายตาม · ตัดกระดิ่งคนเดิม · แบ่งเป้า · กระดิ่งคนรับครั้งเดียว
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  dealHandoverGroup, isHandoverEligible, planDealHandover, handoverMetadata, handedOffFrom,
  withoutHandedOff, validateTargetSplit, canHandoverSalesWork,
} from './handover.js';
import { handoverDeal, handoverLead, handoverNotices, HANDOVER_NOTIFY_KIND } from './handoverWrite.js';
import { NOTIFICATION_BOXES, HANDOVER_BELL_KINDS, recipientsForUpdate } from '../notifications.js';
import { isQuietUpdateKind, isKnownUpdateKind } from '../master/updateTypes.js';
import { ORIGIN_HISTORICAL } from './historicalOrders.js';

/* ── ฐานจำลองในหน่วยความจำ — รองรับเฉพาะท่าที่ไฟล์ส่งต่องานใช้ (select/eq/in/is/not/gte/order/range/update/insert/maybeSingle) ── */
function fakeDb(tables, users = {}) {
  const log = { updates: [], inserts: [] };
  const match = (row, filters) => filters.every(([op, col, val]) => {
    const v = row[col];
    if (op === 'eq') return String(v) === String(val);
    if (op === 'is') return v == null && val == null;
    if (op === 'in') return val.map(String).includes(String(v));
    if (op === 'notin') return !val.map(String).includes(String(v));
    if (op === 'gte') return String(v) >= String(val);
    return true;
  });
  const from = (name) => {
    const state = { filters: [], patch: null, insert: null, single: false };
    const run = () => {
      const rows = tables[name] || (tables[name] = []);
      if (state.insert) {
        const list = Array.isArray(state.insert) ? state.insert : [state.insert];
        rows.push(...list.map((r) => ({ ...r })));
        log.inserts.push({ table: name, rows: list });
        return { data: list, error: null };
      }
      const hit = rows.filter((row) => match(row, state.filters));
      if (state.patch) {
        hit.forEach((row) => Object.assign(row, state.patch));
        log.updates.push({ table: name, ids: hit.map((r) => r.id), patch: state.patch });
      }
      const data = hit.map((r) => ({ ...r }));
      if (state.single) return { data: data[0] || null, error: null };
      return { data, error: null };
    };
    const b = {
      select: () => b, order: () => b, range: () => b,
      eq: (c, v) => { state.filters.push(['eq', c, v]); return b; },
      is: (c, v) => { state.filters.push(['is', c, v]); return b; },
      in: (c, v) => { state.filters.push(['in', c, v]); return b; },
      gte: (c, v) => { state.filters.push(['gte', c, v]); return b; },
      not: (c, op, v) => { state.filters.push(['notin', c, String(v).replace(/[()]/g, '').split(',')]); return b; },
      update: (p) => { state.patch = p; return b; },
      insert: (r) => { state.insert = r; return b; },
      maybeSingle: () => { state.single = true; return Promise.resolve(run()); },
      single: () => { state.single = true; return Promise.resolve(run()); },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return b;
  };
  return {
    from, log, tables,
    auth: { admin: { getUserById: async (id) => (users[id] ? { data: { user: users[id] }, error: null } : { data: null, error: { message: 'User not found', status: 404 } }) } },
  };
}

const USERS = {
  'u-old': { id: 'u-old', app_metadata: { role: 'senior_ae', team: 'SV', teams: ['SV'] }, user_metadata: { name: 'คนเดิม' } },
  'u-new': { id: 'u-new', app_metadata: { role: 'ae', team: 'SV' }, user_metadata: { name: 'คนรับ' } },
  'u-odm': { id: 'u-odm', app_metadata: { role: 'ae', team: 'ODM' }, user_metadata: { name: 'คน ODM' } },
  'u-ac': { id: 'u-ac', app_metadata: { role: 'ac', team: 'SV', teams: ['SV'] }, user_metadata: { name: 'AC SV' } },
  'u-sup': { id: 'u-sup', app_metadata: { role: 'ae_supervisor' }, user_metadata: { name: 'Sup' } },
  'u-admin': { id: 'u-admin', app_metadata: { role: 'admin' }, user_metadata: { name: 'แอดมิน' } },
};
const SUP = { id: 'u-sup', name: 'Sup', role: 'ae_supervisor', team: null, teams: [] };

/* ── ใครอยู่ในรายการ ───────────────────────────────────────────────────────── */
test('ดีลเปิดอยู่ในรายการเสมอ · Lost กับดีลภาชนะไม่อยู่', () => {
  assert.equal(dealHandoverGroup({ stage: 'quotation' }).group, 'open');
  assert.equal(dealHandoverGroup({ stage: 'lost' }).group, 'lost');
  assert.equal(dealHandoverGroup({ stage: 'won', origin: ORIGIN_HISTORICAL }).group, 'container');
  assert.ok(isHandoverEligible('open'));
  assert.ok(isHandoverEligible('won_open'));
  for (const g of ['won_done', 'lost', 'container']) assert.equal(isHandoverEligible(g), false, g);
});

test('⭐ Won งานยังไม่จบ = ยังไม่ออก SO · SO ยังไม่อนุมัติ · สัญญายังไม่จบ · ค้างรับเงิน (นิยามที่เจ้าของยืนยัน 27/11)', () => {
  const won = { stage: 'won', origin: 'pipeline' };
  assert.deepEqual(dealHandoverGroup(won, {}).reasons.map((r) => r.key), ['no_order']);
  // SO ที่ยกเลิก/ถูกแทนด้วย Rev. ไม่นับว่ามี SO
  assert.deepEqual(dealHandoverGroup(won, { orders: [{ id: 'o1', status: 'cancelled' }] }).reasons.map((r) => r.key), ['no_order']);
  assert.deepEqual(dealHandoverGroup(won, { orders: [{ id: 'o1', status: 'draft', orderNumber: 'SO-1' }] }).reasons.map((r) => r.key), ['order_unapproved']);
  const paid = { o1: [{ status: 'confirmed' }, { status: 'confirmed' }] };
  const unpaid = { o1: [{ status: 'confirmed' }, { status: 'reported' }] };
  const approved = [{ id: 'o1', status: 'approved', orderNumber: 'SO-1' }];
  assert.equal(dealHandoverGroup(won, { orders: approved, installmentsByOrder: paid }).group, 'won_done');
  const late = dealHandoverGroup(won, { orders: approved, installmentsByOrder: unpaid });
  assert.equal(late.group, 'won_open');
  assert.equal(late.reasons[0].label, 'ค้างรับเงิน 1/2 งวด');
  // Map ก็ใช้ได้ (ตัวอ่านคืน Map)
  assert.equal(dealHandoverGroup(won, { orders: approved, installmentsByOrder: new Map(Object.entries(unpaid)) }).group, 'won_open');
  const draftContract = dealHandoverGroup(won, { orders: approved, installmentsByOrder: paid, contracts: [{ status: 'draft' }] });
  assert.deepEqual(draftContract.reasons.map((r) => r.key), ['contract_open']);
  // สัญญาที่ลงนาม/ยกเลิก/ถูกแทนแล้ว = จบ
  for (const status of ['signed', 'cancelled', 'revised']) {
    assert.equal(dealHandoverGroup(won, { orders: approved, installmentsByOrder: paid, contracts: [{ status }] }).group, 'won_done', status);
  }
});

test('ของที่ย้ายตาม: SO ที่ยังไม่อนุมัติ · สัญญาที่ยังไม่จบ (ผู้ดูแล+ผู้สร้าง) · สัญญาที่ลงนามแล้ว (ผู้ดูแล)', () => {
  const plan = planDealHandover({
    orders: [
      { id: 'd', status: 'draft' }, { id: 'p', status: 'pending_approval' }, { id: 'r', status: 'rejected' },
      { id: 'v', status: 'approval_revoked' }, { id: 'a', status: 'approved' }, { id: 'c', status: 'cancelled' }, { id: 'x', status: 'revised' },
    ],
    contracts: [{ id: 'k1', status: 'draft' }, { id: 'k2', status: 'awaiting_signature' }, { id: 'k3', status: 'signed' }, { id: 'k4', status: 'cancelled' }],
  });
  assert.deepEqual(plan.orderIds, ['d', 'p', 'r', 'v'], 'SO ที่อนุมัติแล้ว (เจ้าของยอด) ห้ามแตะ');
  assert.deepEqual(plan.openContractIds, ['k1', 'k2']);
  assert.deepEqual(plan.signedContractIds, ['k3']);
});

test('สิทธิ์: AE Supervisor + Admin (+ CD/CM) · AE/Senior AE/AC ไม่ได้', () => {
  for (const role of ['ae_supervisor', 'admin', 'commercial_manager', 'commercial_director']) assert.ok(canHandoverSalesWork({ role }), role);
  for (const role of ['ae', 'senior_ae', 'ac', 'ac_supervisor', 'finance']) assert.equal(canHandoverSalesWork({ role }), false, role);
});

/* ── ตัดกระดิ่งคนเดิม ─────────────────────────────────────────────────────── */
test('metadata: จดคนเดิม · คนที่ได้ดีลกลับมาหลุดจากรายการ · กุญแจระบบอื่นอยู่ครบ', () => {
  const m1 = handoverMetadata({ acceptedQuotationId: 'QT-1' }, 'u-old', 'u-new');
  assert.equal(m1.acceptedQuotationId, 'QT-1');
  assert.deepEqual(handedOffFrom({ metadata: m1 }), ['u-old']);
  const m2 = handoverMetadata(m1, 'u-new', 'u-old');
  assert.deepEqual(handedOffFrom({ metadata: m2 }), ['u-new'], 'u-old ได้ดีลคืน ต้องได้กระดิ่งของดีลตัวเองอีกครั้ง');
  assert.deepEqual(handoverMetadata(null, null, 'u-new').handedOffFrom, []);
});

test('ผู้รับเธรด: ตัดคนที่ส่งต่อออกไป ยกเว้นถูก @ ถึง', () => {
  const deal = { metadata: { handedOffFrom: ['u-old'] } };
  assert.deepEqual(withoutHandedOff(['u-new', 'u-old', 'u-ac'], deal), ['u-new', 'u-ac']);
  assert.deepEqual(withoutHandedOff(['u-new', 'u-old'], deal, ['u-old']), ['u-new', 'u-old']);
  assert.deepEqual(withoutHandedOff(['u-a'], { metadata: {} }), ['u-a']);
});

test('⭐ recipientsForUpdate ของดีล: คนเดิมที่เคยโพสต์ในเธรดไม่ได้กระดิ่งหลังส่งต่อ', async () => {
  const db = fakeDb({ entity_updates: [{ entityType: 'deal', entityId: 'D1', authorId: 'u-old', kind: 'doc_submit' }] });
  const parent = { id: 'D1', ownerId: 'u-new', acOwnerId: 'u-ac', metadata: { handedOffFrom: ['u-old'] } };
  const ids = await recipientsForUpdate(db, { entityType: 'deal', entityId: 'D1', parent, actorId: 'u-sup', update: { body: 'x' } });
  assert.deepEqual(ids.sort(), ['u-ac', 'u-new']);
  // ดีลที่ไม่เคยส่งต่อ — คนเคยโพสต์ยังได้ตามเดิม
  const plain = await recipientsForUpdate(db, { entityType: 'deal', entityId: 'D1', parent: { ...parent, metadata: {} }, actorId: 'u-sup', update: { body: 'x' } });
  assert.ok(plain.includes('u-old'));
});

test('เธรด: ชนิด handover อยู่ในทะเบียนและเงียบ (กระดิ่งคนรับยิงจาก route ครั้งเดียว)', () => {
  assert.ok(isKnownUpdateKind('deal', 'handover'));
  assert.ok(isQuietUpdateKind('deal', 'handover'));
});

test('กระดิ่งคนรับเข้ากล่องกระดิ่ง', () => {
  assert.deepEqual(HANDOVER_BELL_KINDS, [HANDOVER_NOTIFY_KIND]);
  assert.ok(NOTIFICATION_BOXES.bell.kinds.includes(HANDOVER_NOTIFY_KIND));
});

test('กระดิ่งคนรับ: หนึ่งคนหนึ่งกระดิ่งต่อคำขอ · ใบเดียวพาไปที่ใบ · หลายใบพาไปที่รายการ', () => {
  const one = handoverNotices([{ kind: 'deal', id: 'D1', toId: 'u-new', label: 'DL-1', fromName: 'คนเดิม' }], { actorName: 'Sup' });
  assert.equal(one.length, 1);
  assert.equal(one[0].href, '/sa/deals/D1');
  assert.match(one[0].title, /DL-1/);
  const many = handoverNotices([
    { kind: 'deal', id: 'D1', toId: 'u-new', label: 'DL-1', fromName: 'คนเดิม' },
    { kind: 'deal', id: 'D2', toId: 'u-new', label: 'DL-2', fromName: 'คนเดิม' },
    { kind: 'lead', id: 'L1', toId: 'u-new', label: 'บริษัท ก', fromName: 'คนเดิม' },
    { kind: 'deal', id: 'D3', toId: 'u-odm', label: 'DL-3', fromName: 'คนเดิม' },
  ]);
  assert.equal(many.length, 2);
  const mine = many.find((n) => n.userId === 'u-new');
  assert.match(mine.title, /3 รายการ/);
  assert.match(mine.body, /ดีล 2 ใบ · ลีด 1 ใบ/);
  assert.equal(mine.href, '/sa/deals');
});

/* ── แบ่งเป้า ─────────────────────────────────────────────────────────────── */
test('แบ่งเป้า: ผลรวมต่อแถวต้องเท่าเป้าเดิมพอดี · แถวที่ไม่ใช่ของต้นทางตีกลับ', () => {
  const rows = [{ id: 'T1', period: '2026-12', team: 'SV', targetAmount: 1430000 }, { id: 'T2', period: '2027-01', team: 'SV', targetAmount: 100 }];
  const okSplit = validateTargetSplit(rows, [
    { sourceId: 'T1', toUserId: 'a', amount: 715000 }, { sourceId: 'T1', toUserId: 'b', amount: 715000 },
    { sourceId: 'T2', toUserId: 'a', amount: 100 }, { sourceId: 'T2', toUserId: 'b', amount: 0 },
  ]);
  assert.equal(okSplit.ok, true);
  assert.equal(okSplit.bySource.get('T2').length, 1, 'ยอด 0 ไม่สร้างแถว');
  const short = validateTargetSplit(rows, [{ sourceId: 'T1', toUserId: 'a', amount: 1000000 }, { sourceId: 'T2', toUserId: 'a', amount: 100 }]);
  assert.match(short.error, /ขาด 430,000/);
  assert.match(validateTargetSplit(rows, [{ sourceId: 'T9', toUserId: 'a', amount: 1 }]).error, /ไม่ใช่ของคนต้นทาง/);
  assert.match(validateTargetSplit(rows, [{ sourceId: 'T1', toUserId: '', amount: 1 }]).error, /คนรับเป้า/);
});

/* ── เขียนจริงบนฐานจำลอง ─────────────────────────────────────────────────── */
function dealFixture(extra = {}) {
  return fakeDb({
    sales_deals: [{
      id: 'D1', code: 'DL-1', title: 'ดีลทดสอบ', stage: 'won', origin: 'pipeline', team: 'SV',
      ownerId: 'u-old', ownerName: 'คนเดิม', acOwnerId: 'u-ac', acOwnerName: 'AC SV', aeSupervisorId: 'u-sup', aeSupervisorName: 'Sup',
      metadata: { acceptedQuotationId: 'Q1' }, ...extra,
    }],
    quotations: [{ id: 'Q1', dealId: 'D1', quoteNumber: 'QT-1', status: 'accepted' }],
    sales_orders: [{ id: 'S1', dealId: 'D1', orderNumber: 'SO-1', status: 'draft', createdBy: 'u-old' }, { id: 'S0', dealId: 'D1', orderNumber: 'SO-0', status: 'cancelled', createdBy: 'u-old' }],
    sales_contracts: [{ id: 'K1', dealId: 'D1', status: 'draft', kind: 'service', ownerId: 'u-old', createdBy: 'u-old', team: 'SV' }],
    sales_order_installments: [],
    entity_updates: [],
  }, USERS);
}

test('⭐ ส่งต่อดีล: เจ้าของ+ทีม · SO ร่าง · สัญญาร่าง ย้ายตาม · จดคนเดิม · audit + เธรดผ่านตัวที่ส่งเข้ามา', async () => {
  const db = dealFixture();
  const audits = [];
  const thread = [];
  const r = await handoverDeal(db, { dealId: 'D1', toUserId: 'u-new', team: 'SV' }, {
    actor: SUP, audit: async (a) => audits.push(a), appendUpdate: async (_s, u) => thread.push(u), now: '2026-11-27T00:00:00Z',
  });
  assert.equal(r.ok, true, r.error);
  const deal = db.tables.sales_deals[0];
  assert.equal(deal.ownerId, 'u-new');
  assert.equal(deal.ownerName, 'คนรับ');
  assert.equal(deal.metadata.acceptedQuotationId, 'Q1', 'metadata merge ไม่ใช่แทนทั้งก้อน');
  assert.deepEqual(deal.metadata.handedOffFrom, ['u-old']);
  assert.equal(deal.acOwnerId, 'u-ac', 'ไม่ส่ง AC = คงคนเดิม');
  assert.equal(db.tables.sales_orders.find((o) => o.id === 'S1').createdBy, 'u-new');
  assert.equal(db.tables.sales_orders.find((o) => o.id === 'S0').createdBy, 'u-old', 'ใบที่ยกเลิกไม่แตะ');
  const k = db.tables.sales_contracts[0];
  assert.equal(k.ownerId, 'u-new');
  assert.equal(k.createdBy, 'u-new');
  assert.deepEqual(r.moved, { orders: 1, contracts: 1 });
  assert.deepEqual(audits.map((a) => a.entityType), ['sales_deal', 'sales_order', 'sales_contract']);
  assert.equal(thread.length, 1);
  assert.equal(thread[0].kind, 'handover');
});

test('ส่งต่อดีล: ด่าน — คนรับเป็นเจ้าของอยู่แล้ว · งานจบแล้ว · ดีลภาชนะ · ย้ายทีมแล้ว AC ไม่อยู่ทีมใหม่', async () => {
  const ctx = { actor: SUP, audit: async () => {}, appendUpdate: async () => {} };
  assert.match((await handoverDeal(dealFixture(), { dealId: 'D1', toUserId: 'u-old' }, ctx)).error, /เจ้าของดีลนี้อยู่แล้ว/);
  const done = dealFixture();
  done.tables.sales_orders = [{ id: 'S1', dealId: 'D1', status: 'approved' }];
  done.tables.sales_order_installments = [{ id: 'I1', salesOrderId: 'S1', status: 'confirmed' }];
  done.tables.sales_contracts = [];
  const r1 = await handoverDeal(done, { dealId: 'D1', toUserId: 'u-new' }, ctx);
  assert.equal(r1.status, 409);
  assert.match(r1.error, /งานจบแล้ว/);
  const hist = await handoverDeal(dealFixture({ origin: ORIGIN_HISTORICAL }), { dealId: 'D1', toUserId: 'u-new' }, ctx);
  assert.match(hist.error, /ทีละใบ/);
  // ย้ายไป ODM โดยไม่เลือก AC ใหม่ ⇒ AC SV เดิมต้องโดนด่านทีม (ไม่ใช่หลุดไปเงียบ ๆ)
  const odm = await handoverDeal(dealFixture(), { dealId: 'D1', toUserId: 'u-odm', team: 'ODM' }, ctx);
  assert.equal(odm.ok, false);
  assert.equal(dealFixture().tables.sales_deals[0].ownerId, 'u-old');
});

test('ส่งต่อดีล: ด่าน optimistic — มีคนย้ายเจ้าของไประหว่างนั้น = 409 ไม่เขียนทับ', async () => {
  const db = dealFixture();
  const realFrom = db.from;
  let reads = 0;
  db.from = (name) => {
    const b = realFrom(name);
    if (name === 'sales_deals' && reads++ === 0) {
      // อ่านครั้งแรกได้คนเดิม แล้วมีคนย้ายไปก่อนเราเขียน
      const orig = b.maybeSingle;
      b.maybeSingle = async () => { const res = await orig(); db.tables.sales_deals[0].ownerId = 'u-odm'; return res; };
    }
    return b;
  };
  const r = await handoverDeal(db, { dealId: 'D1', toUserId: 'u-new' }, { actor: SUP, audit: async () => {}, appendUpdate: async () => {} });
  assert.equal(r.status, 409);
  assert.equal(db.tables.sales_deals[0].ownerId, 'u-odm');
});

test('ส่งต่อลีด: ด่านคนรับตัวเดียวกับหน้าลีด · ลงประวัติ reassign · ลีดปิดแล้วไม่แตะ', async () => {
  const db = fakeDb({
    sales_leads: [
      { id: 'L1', status: 'meeting', team: 'SV', assigneeId: 'u-old', assigneeName: 'คนเดิม', contactName: 'คุณ ก', firstContactAt: '2026-10-01' },
      { id: 'L2', status: 'qualified', team: 'SV', assigneeId: 'u-old' },
    ],
    lead_events: [],
  }, USERS);
  const ctx = { actor: SUP, audit: async () => {}, now: '2026-11-27T00:00:00Z' };
  const r = await handoverLead(db, { leadId: 'L1', toUserId: 'u-new', team: 'SV' }, ctx);
  assert.equal(r.ok, true, r.error);
  assert.equal(db.tables.sales_leads[0].assigneeId, 'u-new');
  assert.equal(db.tables.sales_leads[0].assignedAt, undefined, 'ติดต่อลูกค้าไปแล้ว = ไม่รีเซ็ตนาฬิกา');
  assert.equal(db.tables.lead_events[0].kind, 'reassign');
  assert.match((await handoverLead(db, { leadId: 'L2', toUserId: 'u-new' }, ctx)).error, /ปิดแล้ว/);
  assert.equal((await handoverLead(db, { leadId: 'L1', toUserId: 'u-odm' }, ctx)).ok, false, 'คนรับนอกทีมของลีด');
});
