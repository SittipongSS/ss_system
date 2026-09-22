// ── ผูก/ถอดลีดต้นทางของดีลย้อนหลัง (มติผู้ใช้ 2026-09-22) ─────────────────────
//
// สามมติที่ล็อกไว้ที่นี่:
//   1. ลีดทุกสถานะผูกได้ รวม "ไม่ไปต่อ" · ยกเว้นรอคัดกรอง/รอกระจาย ซึ่งผูกได้เฉพาะ Admin/AE Supervisor
//   2. ถอดได้ · ลีดที่ไม่เหลือดีลกลับไปสถานะก่อนเปิดดีล โดยไม่มีวันติดตาม
//   3. คนผูกได้ = Admin/AE/Senior AE + AE Supervisor และต้องทำงานลีดใบนั้นได้
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  LEAD_LINK_ROLES,
  LEAD_LINK_STATUSES,
  LEAD_LINK_SUPERVISOR_STATUSES,
  canLinkLeadRole,
  dealLabelForLead,
  dealLeadLinkBlocker,
  dealLeadLinkError,
  dealLinkOptions,
  dealMetadataWithLead,
  dealMetadataWithoutLead,
  isDealLinkableToLead,
  latestQualifyEvent,
  DEAL_DELETE_LEAD_NOTE,
  LEAD_RELEASE_NOTE,
  leadLinkEffects,
  leadLinkError,
  leadLinkOptions,
  leadLinkPatch,
  leadLinkScopeOk,
  leadRevertStatus,
  leadUnlinkPatch,
} from './dealLeadLink.js';
import { LEAD_STATUSES, canCreateDealFromLead } from './leads.js';
import { LEAD_LINK_METADATA_KEYS, clientDealMetadataOnCreate, clientDealMetadataOnPatch } from './legacyDealSwitch.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const ADMIN = { role: 'admin', id: 'u-admin' };
const SUP = { role: 'ae_supervisor', id: 'u-sup' };
const SENIOR_A = { role: 'senior_ae', id: 'u-senior', team: 'A', teams: ['A'] };
const AE_A = { role: 'ae', id: 'u-ae', team: 'A', teams: ['A'] };
const AC_A = { role: 'ac', id: 'u-ac', team: 'A', teams: ['A'] };
const MKT = { role: 'marketing', id: 'u-mkt' };
const lead = (over = {}) => ({ id: 'LEAD-1', status: 'contacted', team: 'A', assigneeId: 'u-ae', createdBy: 'u-mkt', channel: 'line', contactName: 'คุณเอ', company: 'บจก. เอ', ...over });
const deal = (over = {}) => ({ id: 'DEAL-1', code: 'DL-26090001', title: 'กลิ่นล็อบบี้', origin: 'pipeline', leadId: null, metadata: {}, ...over });

/* ── ใคร ─────────────────────────────────────────────────────────────── */

test('คนผูกได้ = คนเปิดดีลจากลีดได้ + AE Supervisor (มติ 2026-09-22) · AC/marketing ไม่ได้', () => {
  for (const role of ['admin', 'ae', 'senior_ae']) {
    assert.ok(canCreateDealFromLead(role) && canLinkLeadRole(role), `${role} ต้องผูกได้`);
  }
  assert.ok(canLinkLeadRole('ae_supervisor'), 'หัวหน้าแก้ของลูกทีมได้');
  assert.ok(!canCreateDealFromLead('ae_supervisor'), 'แต่ปุ่มเปิดดีลจากลีดของหัวหน้ายังปิดตามมติ 2026-07-21');
  for (const role of ['ac', 'marketing', 'viewer', 'executive', 'rd', 'finance']) {
    assert.ok(!canLinkLeadRole(role), `${role} ห้ามผูก`);
  }
  assert.deepEqual([...LEAD_LINK_ROLES].sort(), ['admin', 'ae', 'ae_supervisor', 'senior_ae']);
});

test('ขอบเขตลีด: AE ผู้รับมอบเท่านั้น · Senior ทีมเดียวกัน · หัวหน้า/แอดมินทุกใบ', () => {
  assert.ok(leadLinkScopeOk(AE_A, lead()));
  assert.ok(!leadLinkScopeOk(AE_A, lead({ assigneeId: 'someone-else' })), 'AE คนอื่นในทีมห้าม');
  assert.ok(!leadLinkScopeOk({ ...AE_A, id: 'u-mkt' }, lead({ assigneeId: 'x' })),
    'AE ที่ "กรอกลีดเอง" แต่ไม่ได้รับมอบ ไม่ใช่คนทำงานใบนั้น (ต่างจาก inLeadScope)');
  assert.ok(leadLinkScopeOk(SENIOR_A, lead({ assigneeId: 'x' })));
  assert.ok(!leadLinkScopeOk(SENIOR_A, lead({ team: 'B' })));
  assert.ok(leadLinkScopeOk({ role: 'senior_ae', id: 's2', team: 'B', teams: ['B', 'A'] }, lead()), 'Senior หลายทีม');
  assert.ok(leadLinkScopeOk(SUP, lead({ team: null, assigneeId: null })));
  assert.ok(leadLinkScopeOk(ADMIN, lead({ team: 'Z' })));
  assert.ok(!leadLinkScopeOk(AC_A, lead()), 'AC ทำงานลีดได้แต่ผูกดีลไม่ได้');
  assert.ok(!leadLinkScopeOk(MKT, lead()));
});

/* ── สถานะไหน ────────────────────────────────────────────────────────── */

test('ทุกสถานะผูกได้ รวมไม่ไปต่อ · รอคัดกรอง/รอกระจาย เฉพาะหัวหน้าและแอดมิน', () => {
  assert.deepEqual([...LEAD_LINK_STATUSES, ...LEAD_LINK_SUPERVISOR_STATUSES].sort(), [...LEAD_STATUSES].sort(),
    'ทุกสถานะของลีดต้องมีคำตอบ — เพิ่มสถานะใหม่แล้วลืมตัดสินที่นี่ = ผูกไม่ได้เงียบ ๆ');
  for (const status of LEAD_LINK_STATUSES) {
    assert.equal(leadLinkError({ user: AE_A, lead: lead({ status }) }), null, `AE ผูกลีด ${status} ได้`);
  }
  for (const status of LEAD_LINK_SUPERVISOR_STATUSES) {
    // ลีดที่ถูกตีกลับจนไม่มีทีม — AE/Senior มองไม่เห็นอยู่แล้ว (ด่านสิทธิ์ตอบก่อน)
    const orphan = lead({ status, team: null, assigneeId: null });
    assert.equal(leadLinkError({ user: SUP, lead: orphan }), null, `หัวหน้าผูกลีด ${status} ได้`);
    assert.equal(leadLinkError({ user: ADMIN, lead: orphan }), null);
    // ใบที่ยังมีทีมค้าง (screened รอมอบหมาย) — Senior เห็น แต่ต้องบอกเหตุ ไม่ใช่เงียบ
    const denied = leadLinkError({ user: SENIOR_A, lead: lead({ status, assigneeId: null }) });
    assert.equal(denied?.status, 400);
    assert.match(denied.message, /AE Supervisor หรือแอดมิน/);
  }
});

test('ด่านตอบ HTTP code ตามชนิด: สิทธิ์ 403 · สถานะ 400 · ไม่พบ 404', () => {
  assert.equal(leadLinkError({ user: AE_A, lead: null }).status, 404);
  assert.equal(leadLinkError({ user: AC_A, lead: lead() }).status, 403);
  assert.equal(leadLinkError({ user: AE_A, lead: lead({ assigneeId: 'x' }) }).status, 403);
  // ถอด = ตรวจสิทธิ์อย่างเดียว (ไม่ตรวจสถานะ)
  assert.equal(leadLinkError({ user: SENIOR_A, lead: lead({ status: 'screened' }), forUnlink: true }), null);
  assert.equal(leadLinkError({ user: AE_A, lead: lead({ assigneeId: 'x' }), forUnlink: true }).status, 403,
    'เจ้าของดีลห้ามย้อนสถานะลีดที่ไม่ใช่งานของตัวเอง');
  // ข้อความต้องพูดถึงการกระทำที่ผู้ใช้กำลังทำ (ถอด ≠ ผูก)
  assert.match(leadLinkError({ user: AE_A, lead: lead({ assigneeId: 'x' }), forUnlink: true }).message, /เป็นคนถอด/);
  assert.match(leadLinkError({ user: AE_A, lead: lead({ assigneeId: 'x' }) }).message, /เป็นคนผูก/);
});

/* ── ดีลไหน ─────────────────────────────────────────────────────────── */

test('ดีลที่ไม่มีวันมาจากลีด (SO ย้อนหลัง · สหมิตร) ผูกไม่ได้ พร้อมเหตุ', () => {
  assert.equal(dealLeadLinkBlocker(deal()), null);
  assert.equal(dealLeadLinkBlocker(deal({ stage: 'won' })), null, 'Won ผูกได้');
  assert.equal(dealLeadLinkBlocker(deal({ stage: 'lost' })), null, 'Lost ผูกได้ (เปิดดีลไปแล้วจริง)');
  assert.equal(dealLeadLinkBlocker(deal({ metadata: { legacy: true } })), null, 'ดีลเก่าจากสวิตช์ผูกได้');
  // CHECK sales_deals_historical_shape (mig 0360) บังคับ leadId ว่าง ⇒ ต้องตอบก่อนถึงฐาน
  assert.match(dealLeadLinkBlocker(deal({ origin: 'historical' })), /ย้อนหลัง/);
  assert.match(dealLeadLinkBlocker(deal({ metadata: { source: 'sahamit-forecast' } })), /สหมิตร/);
  assert.match(dealLeadLinkBlocker(deal({ metadata: { source: 'sahamit-po' } })), /สหมิตร/);
});

test('ดีลที่มีลีดอยู่แล้ว = 409 บอกทางออก (ถอดก่อน) · ใบเดิมซ้ำก็บอกว่าผูกอยู่แล้ว', () => {
  const same = dealLeadLinkError({ user: AE_A, deal: deal({ leadId: 'LEAD-1' }), lead: lead() });
  assert.equal(same.status, 409);
  assert.match(same.message, /อยู่แล้ว/);
  const other = dealLeadLinkError({ user: AE_A, deal: deal({ leadId: 'LEAD-9' }), lead: lead() });
  assert.equal(other.status, 409);
  assert.match(other.message, /ถอด/);
  assert.equal(dealLeadLinkError({ user: AE_A, deal: deal(), lead: lead() }), null);
});

/* ── เขียนอะไร ──────────────────────────────────────────────────────── */

test('metadata หลังผูก: กระจก leadId ตรงคอลัมน์ · source ไม่ทับของเดิม · ถอดแล้วสะอาด', () => {
  const linked = dealMetadataWithLead({ brand: 'X', projectType: 'SCENT' }, lead());
  assert.deepEqual(linked, { brand: 'X', projectType: 'SCENT', leadId: 'LEAD-1', source: 'lead', leadChannel: 'line' });
  assert.equal(dealMetadataWithLead({ source: 'other' }, lead()).source, 'other', 'source ของเส้นอื่นห้ามถูกทับ');
  assert.deepEqual(dealMetadataWithLead(null, lead()).leadId, 'LEAD-1');
  assert.deepEqual(dealMetadataWithoutLead(linked), { brand: 'X', projectType: 'SCENT' });
  assert.deepEqual(dealMetadataWithoutLead({ leadId: 'L', source: 'other', leadChannel: 'x' }), { source: 'other' });
  assert.deepEqual(dealMetadataWithoutLead(undefined), {});
});

test('แพตช์ลีดตอนผูก: qualified อยู่แล้วไม่แตะ · ไม่ไปต่อเก็บเหตุผลเดิมไว้', () => {
  const now = '2026-09-22T03:00:00.000Z';
  assert.equal(leadLinkPatch(lead({ status: 'qualified' }), now), null, 'ลีด 1 ใบหลายดีล — ไม่ขยับ');
  assert.deepEqual(leadLinkPatch(lead(), now), { status: 'qualified', closedAt: now, updatedAt: now });
  const lost = leadLinkPatch(lead({ status: 'disqualified', disqualifiedCode: 'competitor' }), now);
  assert.ok(!('disqualifiedCode' in lost) && !('disqualifiedReason' in lost) && !('revisitAt' in lost),
    'ห้ามล้างเหตุผลไม่ไปต่อ — ถอดแล้วต้องกลับไปพร้อมเหตุผลเดิม');
  // ลีดไร้ผู้รับ (หัวหน้าผูกใบรอคัดกรอง) ⇒ ผู้ดูแลดีลเป็นผู้รับผิดชอบ ไม่งั้นหลุดตาราง AE ของ KPI
  const owner = { ownerId: 'u-ae', ownerName: 'AE หนึ่ง', team: 'ODM' };
  assert.deepEqual(leadLinkPatch(lead({ status: 'new', team: null, assigneeId: null }), now, owner),
    { status: 'qualified', closedAt: now, updatedAt: now, assigneeId: 'u-ae', assigneeName: 'AE หนึ่ง', team: 'ODM', assignedAt: now, firstAssignedAt: now });
  assert.equal(leadLinkPatch(lead({ status: 'screened', team: 'SV', assigneeId: null }), now, owner).team, undefined,
    'ลีดที่มีทีมแล้วไม่ถูกย้ายทีม');
  assert.equal(leadLinkPatch(lead(), now, owner).assigneeId, undefined, 'ลีดที่มีผู้รับแล้วไม่ถูกเปลี่ยนมือ');
});

test('ถอด: กลับไปสถานะก่อนเปิดดีลจากเหตุการณ์ล่าสุด · ไม่เจอก็ถอยตามร่องรอยบนแถว', () => {
  const events = [
    { kind: 'contact', fromStatus: 'assigned', toStatus: 'contacted', createdAt: '2026-09-01T00:00:00Z' },
    { kind: 'create_deal', fromStatus: 'contacted', toStatus: 'qualified', createdAt: '2026-09-02T00:00:00Z' },
    { kind: 'unlink_deal', fromStatus: 'qualified', toStatus: 'contacted', createdAt: '2026-09-03T00:00:00Z' },
    { kind: 'disqualify', fromStatus: 'contacted', toStatus: 'disqualified', createdAt: '2026-09-04T00:00:00Z' },
    { kind: 'link_deal', fromStatus: 'disqualified', toStatus: 'qualified', createdAt: '2026-09-05T00:00:00Z' },
    // ดีลใบที่สองของลีดที่ qualified แล้ว — ไม่ใช่จุดที่ลีด "เข้า" qualified
    { kind: 'link_deal', fromStatus: 'qualified', toStatus: 'qualified', createdAt: '2026-09-06T00:00:00Z' },
  ];
  assert.equal(leadRevertStatus(events, lead({ status: 'qualified' })), 'disqualified');
  assert.equal(leadRevertStatus([...events].reverse(), lead({ status: 'qualified' })), 'disqualified', 'ไม่ขึ้นกับลำดับที่ส่งมา');
  // ปิดเข้า qualified ไม่สำเร็จ (fromStatus = toStatus เดิม) ต้องไม่ถูกนับ
  assert.equal(leadRevertStatus([{ kind: 'create_deal', fromStatus: 'contacted', toStatus: 'contacted', createdAt: '2026-09-09' }],
    lead({ status: 'qualified', firstContactAt: '2026-09-01' })), 'contacted');
  // ไม่มีเหตุการณ์ (ดีลก่อน mig 0199 · บันทึกประวัติล้มตอนผูก) — ถอยตามร่องรอยบนแถว
  assert.equal(leadRevertStatus([], lead({ status: 'qualified', meetingAt: '2026-08-01T00:00:00Z' })), 'meeting');
  assert.equal(leadRevertStatus(null, lead({ status: 'qualified', meetingAt: null, firstContactAt: '2026-08-01' })), 'contacted');
  assert.equal(leadRevertStatus([], lead({ status: 'qualified', meetingAt: null, firstContactAt: null })), 'assigned');
  // 🐞 รอบแรก: ลีดที่ผูกจาก "ไม่ไปต่อ" แล้วประวัติหาย เปิดกลับเป็น "ติดต่อแล้ว" (ผิดมติข้อ B)
  assert.equal(leadRevertStatus([], lead({ status: 'qualified', disqualifiedCode: 'competitor' })), 'disqualified');
  assert.equal(leadRevertStatus([], lead({ status: 'qualified', disqualifiedReason: 'ข้อความเก่า' })), 'disqualified');
  assert.equal(leadRevertStatus([], lead({ status: 'qualified', team: null, assigneeId: null })), 'new');
  assert.equal(leadRevertStatus([], lead({ status: 'qualified', assigneeId: null })), 'screened');
  assert.equal(latestQualifyEvent(events).kind, 'link_deal');
  assert.equal(latestQualifyEvent([]), null);
});

test('แพตช์ตอนไม่เหลือดีล: สถานะเปิดล้างวันติดตาม (ต้องบันทึกใหม่) · ไม่ไปต่อคงวันปิด', () => {
  const now = '2026-09-22T03:00:00.000Z';
  for (const status of ['contacted', 'meeting']) {
    assert.deepEqual(leadUnlinkPatch(status, now), { status, updatedAt: now, closedAt: null, followUpAt: null });
  }
  // 🐞 รอบแรกคง assignedAt เดิม ⇒ cron ตีกลับ (นับจาก assignedAt > 5 วันทำการ) ดึงลีดออกจากมือ AE เช้าถัดไป
  assert.deepEqual(leadUnlinkPatch('assigned', now), { status: 'assigned', updatedAt: now, closedAt: null, followUpAt: null, assignedAt: now });
  assert.ok(!('firstAssignedAt' in leadUnlinkPatch('assigned', now)), 'SLA กระจายเป็นของครั้งแรกตลอดกาล');
  assert.deepEqual(leadUnlinkPatch('disqualified', now), { status: 'disqualified', updatedAt: now });
  // กลับคิวคัดกรอง/รอกระจาย = คืนผู้รับ (และทีมสำหรับคิวคัดกรอง) ที่ตอนผูกประทับผู้ดูแลดีลไว้
  const unassigned = { assigneeId: null, assigneeName: null, assignedAt: null, firstAssignedAt: null };
  assert.deepEqual(leadUnlinkPatch('new', now), { status: 'new', updatedAt: now, closedAt: null, team: null, ...unassigned });
  // รอกระจาย: เริ่มนาฬิกาคัดกรองรอบนี้ใหม่ (ไม่งั้นสรุปเช้าทวงทั้งช่วงที่เปิดลูกค้าแล้ว) · ไม่แตะ firstScreenedAt
  assert.deepEqual(leadUnlinkPatch('screened', now), { status: 'screened', updatedAt: now, closedAt: null, ...unassigned, screenedAt: now });
  // กลับไม่ไปต่อ = คืนทีม/ผู้รับตามที่บันทึกไว้ในเหตุการณ์ผูก (ค่าก่อนผูก) · ก่อนผูกไม่มีผู้รับ = ถอดเวลามอบหมายที่ประทับด้วย
  const fromLost = { kind: 'link_deal', fromStatus: 'disqualified', toStatus: 'qualified', team: 'SV', assigneeId: null, assigneeName: null };
  assert.deepEqual(leadUnlinkPatch('disqualified', now, fromLost), { status: 'disqualified', updatedAt: now, team: 'SV', ...unassigned });
  const fromLostOwned = { ...fromLost, assigneeId: 'u-ae', assigneeName: 'AE' };
  assert.deepEqual(leadUnlinkPatch('disqualified', now, fromLostOwned), { status: 'disqualified', updatedAt: now, team: 'SV', assigneeId: 'u-ae', assigneeName: 'AE' },
    'มีผู้รับอยู่แล้วก่อนผูก = ไม่ได้ประทับ ⇒ ไม่แตะเวลามอบหมาย');
});

test('ข้อความตอนถอด/ลบดีลบอกทั้งสองกรณี (สถานะเปิด · ไม่ไปต่อ) — ไม่สัญญาว่าต้องติดต่อใหม่ทุกกรณี', () => {
  assert.match(LEAD_RELEASE_NOTE, /ไม่มีวันติดตาม/);
  assert.match(LEAD_RELEASE_NOTE, /กลับเป็น "ไม่ไปต่อ" พร้อมเหตุผลเดิม/);
  assert.ok(DEAL_DELETE_LEAD_NOTE.includes(LEAD_RELEASE_NOTE));
});

/* ── ตัวเลือกบนโมดัล ─────────────────────────────────────────────────── */

test('ตัวเลือกลีด: ลีดของผู้ดูแลดีลขึ้นก่อน · ค้นด้วยเบอร์/อีเมลได้', () => {
  const rows = [
    lead({ id: 'L-other', assigneeId: 'u-x', contactName: 'คุณบี', createdAt: '2026-09-10' }),
    lead({ id: 'L-mine', assigneeId: 'u-ae', phone: '0812345678', email: 'a@b.co', createdAt: '2026-09-01' }),
  ];
  const options = leadLinkOptions(rows, { ownerId: 'u-ae', ownerName: 'เอ' });
  assert.deepEqual(options.map((o) => o.value), ['__group_mine', 'L-mine', '__group_others', 'L-other']);
  assert.ok(options[0].group && options[2].group);
  const mine = options.find((o) => o.value === 'L-mine');
  assert.match(mine.search, /0812345678/);
  assert.match(mine.search, /a@b\.co/);
  // ไม่มีลีดของผู้ดูแล = ไม่มีหัวกลุ่ม (หัวลอยคือคำโกหกว่ากลุ่มนั้นมีของ)
  assert.ok(leadLinkOptions([rows[0]], { ownerId: 'u-ae' }).every((o) => !o.group));
});

test('ตัวเลือกดีล (หน้าลีด): เฉพาะที่ยังไม่มีลีด + แก้ได้ + ไม่ใช่ดีลที่ไม่มีวันมาจากลีด', () => {
  const rows = [
    deal({ id: 'd-ok', ownerId: 'u-ae', canEdit: true, createdAt: '2026-09-02' }),
    deal({ id: 'd-other', ownerId: 'u-x', canEdit: true, createdAt: '2026-09-03' }),
    deal({ id: 'd-linked', canEdit: true, leadId: 'L9' }),
    deal({ id: 'd-readonly', canEdit: false }),
    deal({ id: 'd-hist', canEdit: true, origin: 'historical' }),
    deal({ id: 'd-sahamit', canEdit: true, metadata: { source: 'sahamit-forecast' } }),
  ];
  assert.deepEqual(rows.filter(isDealLinkableToLead).map((d) => d.id), ['d-ok', 'd-other']);
  const options = dealLinkOptions(rows, { assigneeId: 'u-ae', stageLabel: (s) => `[${s}]` });
  assert.deepEqual(options.filter((o) => !o.group).map((o) => o.value), ['d-ok', 'd-other']);
  assert.equal(options[0].group, true, 'ดีลของผู้รับผิดชอบลีดขึ้นก่อน');
});

test('โมดัลบอกผลลัพธ์ (ไม่ใช่ "แน่ใจไหม") — ไม่ไปต่อต้องบอกว่าถอดแล้วกลับเป็นไม่ไปต่อ', () => {
  assert.deepEqual(leadLinkEffects(null), []);
  assert.match(leadLinkEffects(lead()).join(' '), /เปิดลูกค้าแล้ว/);
  assert.match(leadLinkEffects(lead({ status: 'qualified' })).join(' '), /สถานะลีดไม่เปลี่ยน/);
  assert.match(leadLinkEffects(lead({ status: 'disqualified' })).join(' '), /กลับเป็น "ไม่ไปต่อ"/);
  assert.match(leadLinkEffects(lead(), { via: 'create' }).join(' '), /บันทึกการเปิดดีล/);
  assert.match(leadLinkEffects(lead({ status: 'screened', assigneeId: null })).join(' '), /ผู้ดูแลดีลจะเป็นผู้รับผิดชอบลีด/);
  assert.doesNotMatch(leadLinkEffects(lead()).join(' '), /ผู้ดูแลดีลจะเป็นผู้รับผิดชอบลีด/);
  assert.equal(dealLabelForLead(deal()), 'DL-26090001 · กลิ่นล็อบบี้');
});

/* ── ทางเขียนคอลัมน์ต้องผ่านด่านเสมอ ─────────────────────────────────── */

test('PATCH ดีลเขียน metadata ของเส้นผูกลีดไม่ได้ · POST ยังเก็บ leadId ได้ (ผ่าน sourceLeadIdOf)', () => {
  assert.deepEqual(LEAD_LINK_METADATA_KEYS, ['leadId', 'source', 'leadChannel']);
  assert.deepEqual(clientDealMetadataOnPatch({ leadId: 'L', source: 'lead', leadChannel: 'line', brand: 'X' }), { brand: 'X' });
  assert.equal(clientDealMetadataOnCreate({ leadId: 'L' }).leadId, 'L');
});

test('POST /deals กับ /link-lead ใช้ด่านลีดตัวเดียวกัน · route ผูกผ่านด่านแก้ดีลก่อนเสมอ', () => {
  const post = read('src/app/api/sales-planning/deals/route.js');
  assert.match(post, /const denied = leadLinkError\(\{ user, lead \}\);/);
  assert.doesNotMatch(post, /LEAD_TRANSITIONS\[/, 'ด่านสถานะเดิม (contacted/meeting/qualified) ต้องไม่กลับมา');
  // ด่านลีดต้องมาก่อน insert — ลีดไม่ผ่าน = ไม่มีดีลเกิด
  assert.ok(post.indexOf('leadLinkError({ user, lead })') < post.indexOf("insertRowWithEntityCode(supabase, 'DL', row)"));
  const route = read('src/app/api/sales-planning/deals/[id]/link-lead/route.js');
  assert.match(route, /loadScoped\(supabase, 'sales_deals', id, user, 'edit'\)/);
  assert.match(route, /canEditSalesPlanning\(user\)/);
  const repo = read('src/lib/sales/dealLeadLinkRepo.js');
  assert.match(repo, /\.is\('leadId', null\)/, 'ผูกต้องกันกดพร้อมกันสองจอ');
  assert.match(repo, /\.eq\('leadId', deal\.leadId\)/, 'ถอดต้องกันลีดที่เพิ่งถูกเปลี่ยน');
  assert.match(repo, /\.eq\('status', current\.status\)/, 'ขยับลีดต้องมีเงื่อนไขสถานะที่ตรวจไว้');
  assert.match(repo, /\.eq\('status', 'qualified'\)/, 'ย้อนสถานะเฉพาะลีดที่ยัง qualified');
});

test('ลบดีลใช้กติกาเดียวกับถอด · รายการลีดที่ผูกได้กรองที่ server', () => {
  const del = read('src/app/api/sales-planning/deals/[id]/route.js');
  assert.match(del, /releaseLeadAfterDealGone\(supabase, \{/);
  // ย้อนหลังลบสำเร็จเท่านั้น (นับดีลที่เหลือจากฐาน)
  assert.ok(del.indexOf("from('sales_deals').delete().eq('id', id)") < del.indexOf('releaseLeadAfterDealGone(supabase'));
  const leads = read('src/app/api/sales-planning/leads/route.js');
  assert.match(leads, /params\.get\('linkable'\) === '1'/);
  assert.match(leads, /leads\.filter\(\(lead\) => !leadLinkError\(\{ user, lead \}\)\)/);
});
