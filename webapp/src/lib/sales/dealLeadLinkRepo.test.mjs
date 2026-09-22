// ── เส้นเขียนของการผูก/ถอดลีดต้นทาง บนฐานจำลองในหน่วยความจำ ─────────────────────
//
// ⚠️ ทำไมไม่ทดสอบบนฐานจริง: dev DB = prod DB · ผูก/ถอดคือการขยับสถานะลีดที่ KPI นับ
//    ⇒ ทดสอบลำดับ "เขียนอะไร · มีเงื่อนไขอะไร · พลาดแล้วบอกอะไร" ที่นี่แทน
//    (ตัวจำลองรองรับเฉพาะชุดคำสั่งที่ไฟล์ repo ใช้ — ตรงกับ PostgREST ในจุดที่สำคัญ:
//     update ที่ไม่มีแถวตรงเงื่อนไขคืน data = null ไม่ใช่ error เมื่อใช้ maybeSingle)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  linkDealToLead,
  recordLeadDealOpened,
  releaseLeadAfterDealGone,
  unlinkDealFromLead,
} from './dealLeadLinkRepo.js';

function fakeDb(seed = {}, { failInsert = {}, failCount = false } = {}) {
  const tables = {
    sales_deals: [], sales_leads: [], lead_events: [],
    ...Object.fromEntries(Object.entries(seed).map(([k, rows]) => [k, rows.map((r) => ({ ...r }))])),
  };
  const writes = [];
  const from = (table) => {
    const state = { table, op: 'select', filters: [], patch: null, row: null, head: false, count: null, limit: null, order: null };
    const matches = (row) => state.filters.every(([kind, col, val]) => {
      if (kind === 'eq') return row[col] === val;
      if (kind === 'is') return (row[col] ?? null) === val;
      if (kind === 'in') return val.includes(row[col]);
      return true;
    });
    const run = () => {
      const rows = tables[table];
      if (state.op === 'insert') {
        if (failInsert[table]?.(state.row)) return { data: null, error: { message: `new row violates check constraint "${table}_kind_check"` } };
        rows.push({ createdAt: new Date().toISOString(), ...state.row });
        writes.push({ table, op: 'insert', row: state.row });
        return { data: null, error: null };
      }
      if (state.op === 'update') {
        const hit = rows.filter(matches);
        for (const row of hit) Object.assign(row, state.patch);
        writes.push({ table, op: 'update', patch: state.patch, filters: state.filters, count: hit.length });
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (state.head) {
        if (failCount) return { count: null, error: { message: 'count failed' } };
        return { count: rows.filter(matches).length, error: null };
      }
      let out = rows.filter(matches).map((r) => ({ ...r }));
      if (state.order) {
        const [col, asc] = state.order;
        out.sort((a, b) => (asc ? 1 : -1) * String(a[col]).localeCompare(String(b[col])));
      }
      if (state.limit != null) out = out.slice(0, state.limit);
      return { data: out, error: null };
    };
    const builder = {
      select(_cols, opts = {}) { if (state.op === 'select') { state.head = !!opts.head; state.count = opts.count || null; } return builder; },
      insert(row) { state.op = 'insert'; state.row = row; return builder; },
      update(patch) { state.op = 'update'; state.patch = patch; return builder; },
      eq(col, val) { state.filters.push(['eq', col, val]); return builder; },
      is(col, val) { state.filters.push(['is', col, val]); return builder; },
      in(col, val) { state.filters.push(['in', col, val]); return builder; },
      order(col, { ascending = true } = {}) { state.order = [col, ascending]; return builder; },
      limit(n) { state.limit = n; return builder; },
      async maybeSingle() {
        const res = run();
        if (res.error) return res;
        const list = Array.isArray(res.data) ? res.data : [];
        return { data: list[0] || null, error: null };
      },
      then(resolve, reject) { return Promise.resolve(run()).then(resolve, reject); },
    };
    return builder;
  };
  return { from, tables, writes };
}

const AE = { role: 'ae', id: 'u-ae', name: 'AE หนึ่ง', team: 'ODM', teams: ['ODM'] };
const baseLead = (over = {}) => ({ id: 'LEAD-1', status: 'meeting', team: 'ODM', assigneeId: 'u-ae', channel: 'line', contactName: 'คุณเอ', company: 'บจก. เอ', followUpAt: null, meetingAt: '2026-09-10T03:00:00Z', closedAt: null, ...over });
const baseDeal = (over = {}) => ({ id: 'DEAL-1', code: 'DL-26090539', title: 'น้ำหอม 30 ml', origin: 'pipeline', stage: 'quotation', leadId: null, ownerId: 'u-ae', metadata: { brand: 'X' }, ...over });
const auditSink = () => { const rows = []; const fn = async (entry) => { rows.push(entry); }; fn.rows = rows; return fn; };

test('ผูกย้อนหลัง: ดีลได้ leadId + กระจก metadata · ลีดนัดแล้ว → เปิดลูกค้าแล้ว · ประวัติ link_deal · audit สองฝั่ง', async () => {
  const db = fakeDb({ sales_deals: [baseDeal()], sales_leads: [baseLead()] });
  const audit = auditSink();
  const res = await linkDealToLead(db, { deal: baseDeal(), leadId: 'LEAD-1', user: AE, audit });
  assert.equal(res.status, 200);
  assert.equal(res.data.leadWarning, undefined);
  const deal = db.tables.sales_deals[0];
  assert.equal(deal.leadId, 'LEAD-1');
  assert.deepEqual(deal.metadata, { brand: 'X', leadId: 'LEAD-1', source: 'lead', leadChannel: 'line' });
  assert.equal(db.tables.sales_leads[0].status, 'qualified');
  assert.ok(db.tables.sales_leads[0].closedAt);
  const [event] = db.tables.lead_events;
  assert.equal(event.kind, 'link_deal');
  assert.equal(event.fromStatus, 'meeting');
  assert.equal(event.toStatus, 'qualified');
  assert.match(event.reason, /DL-26090539/);
  assert.deepEqual(audit.rows.map((a) => a.entityType), ['sales_deal', 'sales_lead']);
  // เงื่อนไขกันกดพร้อมกัน — ดีลต้องยังว่าง · ลีดต้องยังเป็นสถานะที่ตรวจไว้
  const dealUpdate = db.writes.find((w) => w.table === 'sales_deals' && w.op === 'update');
  assert.ok(dealUpdate.filters.some(([k, c, v]) => k === 'is' && c === 'leadId' && v === null));
  const leadUpdate = db.writes.find((w) => w.table === 'sales_leads' && w.op === 'update');
  assert.ok(leadUpdate.filters.some(([k, c, v]) => k === 'eq' && c === 'status' && v === 'meeting'));
});

test('ผูก: ด่านไม่ผ่าน = ไม่เขียนอะไรเลย (AE คนอื่น · ดีลมีลีดแล้ว · ลีดไม่พบ)', async () => {
  for (const [label, seedLead, deal, leadId, status] of [
    ['AE ไม่ใช่ผู้รับมอบ', baseLead({ assigneeId: 'u-other' }), baseDeal(), 'LEAD-1', 403],
    ['ดีลมีลีดอยู่แล้ว', baseLead(), baseDeal({ leadId: 'LEAD-9' }), 'LEAD-1', 409],
    ['ลีดไม่พบ', baseLead(), baseDeal(), 'LEAD-nope', 404],
    ['ไม่ระบุลีด', baseLead(), baseDeal(), '', 400],
    ['ดีล SO ย้อนหลัง', baseLead(), baseDeal({ origin: 'historical' }), 'LEAD-1', 409],
  ]) {
    const db = fakeDb({ sales_deals: [deal], sales_leads: [seedLead] });
    const res = await linkDealToLead(db, { deal, leadId, user: AE, audit: auditSink() });
    assert.equal(res.status, status, label);
    assert.equal(db.writes.length, 0, `${label}: ห้ามเขียน`);
  }
});

test('ผูก: มีคนผูกไปก่อนระหว่างกด (แถวไม่ตรงเงื่อนไข) = 409 ไม่ขยับลีด', async () => {
  const db = fakeDb({ sales_deals: [baseDeal({ leadId: 'LEAD-X' })], sales_leads: [baseLead()] });
  // จอถือดีลเวอร์ชันก่อนหน้า (ยังว่าง) — ในฐานมีคนผูกไปแล้ว
  const res = await linkDealToLead(db, { deal: baseDeal(), leadId: 'LEAD-1', user: AE, audit: auditSink() });
  assert.equal(res.status, 409);
  assert.equal(db.tables.sales_leads[0].status, 'meeting');
  assert.equal(db.tables.lead_events.length, 0);
});

test('ผูก: ลีดเพิ่งถูกตีกลับระหว่างทำรายการ = ดีลผูกแล้ว แต่เตือน ไม่ทับสถานะที่แทรกมา', async () => {
  const db = fakeDb({ sales_deals: [baseDeal()], sales_leads: [baseLead({ status: 'new', team: null, assigneeId: null })] });
  // จอ/ด่านเห็นลีดตอนยังเป็น meeting
  const opened = await recordLeadDealOpened(db, { lead: baseLead(), deal: baseDeal(), user: AE, via: 'link', audit: auditSink() });
  assert.match(opened.warning, /ไม่สำเร็จ/);
  assert.equal(db.tables.sales_leads[0].status, 'new', 'ห้ามทับการตีกลับที่แทรกเข้ามา');
  assert.equal(db.tables.lead_events[0].toStatus, 'meeting', 'ประวัติต้องไม่อ้างว่าเปิดลูกค้าแล้ว');
});

test('ก่อนรัน mig 0371: ผูกสำเร็จแต่บันทึกประวัติไม่ลง = คำเตือน (ไม่เงียบ ไม่ 500)', async () => {
  const db = fakeDb({ sales_deals: [baseDeal()], sales_leads: [baseLead()] },
    { failInsert: { lead_events: (row) => row.kind === 'link_deal' } });
  const res = await linkDealToLead(db, { deal: baseDeal(), leadId: 'LEAD-1', user: AE, audit: auditSink() });
  assert.equal(res.status, 200);
  assert.match(res.data.leadWarning, /บันทึกประวัติ/);
});

test('ถอด: ลีดไม่เหลือดีล → กลับไปสถานะก่อนเปิดดีล · ล้างวันติดตาม · ประวัติ unlink_deal', async () => {
  const linkedDeal = baseDeal({ leadId: 'LEAD-1', metadata: { brand: 'X', leadId: 'LEAD-1', source: 'lead', leadChannel: 'line' } });
  const db = fakeDb({
    sales_deals: [linkedDeal],
    sales_leads: [baseLead({ status: 'qualified', closedAt: '2026-09-20T00:00:00Z', followUpAt: '2026-09-30T00:00:00Z' })],
    lead_events: [{ id: 'E1', leadId: 'LEAD-1', kind: 'link_deal', fromStatus: 'meeting', toStatus: 'qualified', createdAt: '2026-09-20T00:00:00Z' }],
  });
  const audit = auditSink();
  const res = await unlinkDealFromLead(db, { deal: linkedDeal, user: AE, audit });
  assert.equal(res.status, 200);
  assert.equal(res.data.leadWarning, undefined);
  const deal = db.tables.sales_deals[0];
  assert.equal(deal.leadId, null);
  assert.deepEqual(deal.metadata, { brand: 'X' });
  const lead = db.tables.sales_leads[0];
  assert.equal(lead.status, 'meeting');
  assert.equal(lead.followUpAt, null, 'ต้องบันทึกการติดต่อใหม่ (มติ 2026-09-22)');
  assert.equal(lead.closedAt, null);
  const unlink = db.tables.lead_events.find((e) => e.kind === 'unlink_deal');
  assert.equal(unlink.fromStatus, 'qualified');
  assert.equal(unlink.toStatus, 'meeting');
  assert.deepEqual(audit.rows.map((a) => a.entityType), ['sales_deal', 'sales_lead']);
});

test('ถอด: ลีดยังมีดีลอื่น = คงเปิดลูกค้าแล้ว (แค่บันทึกประวัติ)', async () => {
  const d1 = baseDeal({ leadId: 'LEAD-1' });
  const d2 = baseDeal({ id: 'DEAL-2', code: 'DL-2', leadId: 'LEAD-1' });
  const db = fakeDb({ sales_deals: [d1, d2], sales_leads: [baseLead({ status: 'qualified' })] });
  const res = await unlinkDealFromLead(db, { deal: d1, user: AE, audit: auditSink() });
  assert.equal(res.status, 200);
  assert.equal(db.tables.sales_leads[0].status, 'qualified');
  assert.equal(db.tables.lead_events[0].kind, 'unlink_deal');
  assert.equal(db.tables.lead_events[0].toStatus, 'qualified');
});

test('ถอด: เจ้าของดีลที่ไม่ได้ทำงานลีดใบนั้น ถอดไม่ได้ (ห้ามย้อนสถานะลีดของคนอื่น)', async () => {
  const d = baseDeal({ leadId: 'LEAD-1' });
  const db = fakeDb({ sales_deals: [d], sales_leads: [baseLead({ status: 'qualified', assigneeId: 'u-other' })] });
  const res = await unlinkDealFromLead(db, { deal: d, user: AE, audit: auditSink() });
  assert.equal(res.status, 403);
  assert.equal(db.writes.length, 0);
});

test('ลบดีล: ลีดที่เคย "ไม่ไปต่อ" แล้วถูกผูก → กลับเป็นไม่ไปต่อพร้อมเหตุผลเดิม', async () => {
  const lead = baseLead({ status: 'qualified', disqualifiedCode: 'competitor', disqualifiedReason: 'ไปเจ้าอื่น', closedAt: '2026-09-21T00:00:00Z' });
  const db = fakeDb({
    sales_deals: [],   // ดีลถูกลบไปแล้ว (FK SET NULL / แถวหาย) — ตัวนับต้องได้ 0
    sales_leads: [lead],
    lead_events: [
      { id: 'E0', leadId: 'LEAD-1', kind: 'disqualify', fromStatus: 'contacted', toStatus: 'disqualified', createdAt: '2026-09-08T00:00:00Z' },
      { id: 'E1', leadId: 'LEAD-1', kind: 'link_deal', fromStatus: 'disqualified', toStatus: 'qualified', createdAt: '2026-09-21T00:00:00Z' },
    ],
  });
  const released = await releaseLeadAfterDealGone(db, { lead, deal: baseDeal(), user: AE, reason: 'ลบดีล DL-1', audit: auditSink() });
  assert.equal(released.warning, null);
  const after = db.tables.sales_leads[0];
  assert.equal(after.status, 'disqualified');
  assert.equal(after.disqualifiedCode, 'competitor');
  assert.equal(after.closedAt, '2026-09-21T00:00:00Z', 'ปิดอยู่แล้ว — ไม่ล้างวันปิด');
});

test('ลบดีล: นับดีลที่เหลือไม่ได้ = ไม่เดา · คงสถานะแล้วเตือน', async () => {
  const lead = baseLead({ status: 'qualified' });
  const db = fakeDb({ sales_leads: [lead] }, { failCount: true });
  const released = await releaseLeadAfterDealGone(db, { lead, deal: baseDeal(), user: AE, reason: 'ลบดีล', audit: auditSink() });
  assert.match(released.warning, /ตรวจไม่ได้/);
  assert.equal(db.tables.sales_leads[0].status, 'qualified');
});

test('เปิดดีลใหม่จากลีด (POST /deals): kind create_deal · ลีด qualified แล้วไม่ขยับ แต่บันทึกทุกใบ', async () => {
  const db = fakeDb({ sales_leads: [baseLead({ status: 'qualified' })] });
  const opened = await recordLeadDealOpened(db, { lead: baseLead({ status: 'qualified' }), deal: baseDeal(), user: AE, via: 'create', audit: auditSink() });
  assert.equal(opened.warning, null);
  assert.equal(db.writes.filter((w) => w.table === 'sales_leads').length, 0);
  assert.equal(db.tables.lead_events[0].kind, 'create_deal');
  assert.equal(db.tables.lead_events[0].fromStatus, 'qualified');
});

test('หัวหน้าผูกลีดรอคัดกรอง: ผู้ดูแลดีลเป็นผู้รับผิดชอบ · ถอดแล้วคืนเป็นลีดไร้ทีมเหมือนเดิม', async () => {
  const SUP = { role: 'ae_supervisor', id: 'u-sup', name: 'หัวหน้า' };
  const orphan = baseLead({ status: 'new', team: null, assigneeId: null, assigneeName: null, meetingAt: null });
  const deal = baseDeal({ ownerId: 'u-ae', ownerName: 'AE หนึ่ง', team: 'ODM' });
  const db = fakeDb({ sales_deals: [deal], sales_leads: [orphan] });
  const linked = await linkDealToLead(db, { deal, leadId: 'LEAD-1', user: SUP, audit: auditSink() });
  assert.equal(linked.status, 200);
  const afterLink = db.tables.sales_leads[0];
  assert.equal(afterLink.status, 'qualified');
  assert.equal(afterLink.assigneeId, 'u-ae', 'ไม่ประทับ = ลีดชนะที่หลุดตาราง AE ของ KPI');
  assert.equal(afterLink.team, 'ODM');
  assert.ok(afterLink.assignedAt && afterLink.firstAssignedAt, 'แถว "มอบหมายแล้ว" ของ Funnel ต้องนับใบนี้ด้วย');
  // เหตุการณ์เก็บค่าก่อนผูก (ว่าง) ไว้คืนตอนถอด
  assert.equal(db.tables.lead_events[0].assigneeId, null);

  const res = await unlinkDealFromLead(db, { deal: db.tables.sales_deals[0], user: SUP, audit: auditSink() });
  assert.equal(res.status, 200);
  const afterUnlink = db.tables.sales_leads[0];
  assert.equal(afterUnlink.status, 'new');
  assert.equal(afterUnlink.team, null);
  assert.equal(afterUnlink.assigneeId, null);
  assert.equal(afterUnlink.assignedAt, null);
  assert.equal(afterUnlink.firstAssignedAt, null);
});

test('ถอดแล้วกลับ "รอติดต่อกลับ" = เริ่มนาฬิกา assignedAt ใหม่ (ไม่โดนตีกลับเช้าถัดไป)', async () => {
  const lead = baseLead({ status: 'qualified', assignedAt: '2026-08-01T00:00:00Z', meetingAt: null, firstContactAt: null });
  const db = fakeDb({
    sales_leads: [lead],
    lead_events: [{ id: 'E1', leadId: 'LEAD-1', kind: 'link_deal', fromStatus: 'assigned', toStatus: 'qualified', createdAt: '2026-09-01T00:00:00Z' }],
  });
  const now = '2026-09-22T03:00:00.000Z';
  await releaseLeadAfterDealGone(db, { lead, deal: baseDeal(), user: AE, reason: 'ลบดีล', now, audit: auditSink() });
  assert.equal(db.tables.sales_leads[0].status, 'assigned');
  assert.equal(db.tables.sales_leads[0].assignedAt, now);
});

test('แข่งกัน: ระหว่างย้อนสถานะมีดีลใหม่ผูกเข้ามา ⇒ คืนสถานะเปิดลูกค้าแล้ว', async () => {
  const lead = baseLead({ status: 'qualified', followUpAt: null });
  const db = fakeDb({
    sales_leads: [lead],
    lead_events: [{ id: 'E1', leadId: 'LEAD-1', kind: 'create_deal', fromStatus: 'meeting', toStatus: 'qualified', createdAt: '2026-09-01T00:00:00Z' }],
  });
  // จำลอง: นับครั้งแรกได้ 0 แล้วระหว่างนั้นมีดีลใหม่ผูกเข้ามา (นับครั้งที่สองเจอ 1)
  const realFrom = db.from;
  let counts = 0;
  db.from = (table) => {
    const q = realFrom(table);
    if (table !== 'sales_deals') return q;
    const origSelect = q.select;
    q.select = (cols, opts) => {
      if (opts?.head) { counts += 1; if (counts === 2) db.tables.sales_deals.push(baseDeal({ id: 'DEAL-new', leadId: 'LEAD-1' })); }
      return origSelect(cols, opts);
    };
    return q;
  };
  const released = await releaseLeadAfterDealGone(db, { lead, deal: baseDeal(), user: AE, reason: 'ถอดดีล', audit: auditSink() });
  assert.equal(counts, 2, 'ต้องนับซ้ำหลังย้อน');
  assert.equal(db.tables.sales_leads[0].status, 'qualified');
  assert.equal(released.lead.status, 'qualified');
  assert.equal(db.tables.lead_events.at(-1).toStatus, 'qualified');
});

test('แข่งกัน: ลีดโหลดมาเป็นเปิดลูกค้าแล้ว แต่ถูกย้อนไปก่อนเขียนดีลเสร็จ ⇒ ขยับกลับเป็นเปิดลูกค้าแล้ว', async () => {
  // ในฐานถูกย้อนเป็น meeting ไปแล้ว — ด่านเห็นตอนยัง qualified
  const db = fakeDb({ sales_leads: [baseLead({ status: 'meeting' })] });
  const opened = await recordLeadDealOpened(db, { lead: baseLead({ status: 'qualified' }), deal: baseDeal(), user: AE, via: 'link', audit: auditSink() });
  assert.equal(opened.warning, null);
  assert.equal(db.tables.sales_leads[0].status, 'qualified');
  assert.equal(db.tables.lead_events[0].fromStatus, 'meeting');
});
