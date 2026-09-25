// สิทธิ์ไฟล์แนบของใบสั่งขาย (แท็บ "เอกสาร" · มติเจ้าของ 25/09/2569) + ด่านกันลืมต่อ 5 จุด
//
// ⚠️ ครึ่งหลังอ่านซอร์ส เพราะ handler แตะ DB จึงรันตรงไม่ได้ — การลืมต่อจุดใดจุดหนึ่งคือความพังที่เงียบที่สุด
//   (ไฟล์ไม่ขึ้น / อัปไม่ได้ / ใครก็ลบได้ / พรีวิวไม่ขึ้น) · แพตเทิร์นเดียวกับ salesAttachmentAccess.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SALES_ORDER_ATTACHMENT_TABLE, canAttachToSalesOrder, canRemoveSalesOrderFile, canViewSalesOrderAttachment,
  isSalesOrderAttachment, moveSalesOrderAttachments, purgeSalesOrderFiles, salesOrderAttachBlock,
} from './salesOrderAttachmentAccess.js';
import { SALES_ATTACHMENT_TABLE } from './salesAttachmentAccess.js';
import { PARENT_TABLE } from '../master/attachments.js';
import { ATTACHMENT_TYPES } from '../master/attachmentTypes.js';

const admin = { id: 'u-admin', role: 'admin' };
const ae = { id: 'u-ae', role: 'ae', teams: ['KA'] };
const otherAe = { id: 'u-ae2', role: 'ae', teams: ['KA'] };
const viewer = { id: 'u-viewer', role: 'viewer' };
const order = { id: 'SO-1', dealId: 'D-1', status: 'approved', ownerId: null };

/* supabase ปลอม — ตอบเฉพาะการอ่านดีลของใบ (`from('sales_deals')...maybeSingle()`) */
function fakeDb({ deal = { id: 'D-1', team: 'KA', ownerId: 'u-ae' }, error = null } = {}) {
  const calls = [];
  const chain = {
    select() { return chain; },
    eq(col, val) { calls.push([col, val]); return chain; },
    maybeSingle: async () => ({ data: error ? null : deal, error }),
  };
  return { calls, from(table) { calls.push(['from', table]); return chain; } };
}

test('ใบสั่งขายเป็น entity แนบไฟล์ของตัวเอง — ไม่อยู่ในตารางของดีล/สัญญา (ไม่มี `team` บนแถว)', () => {
  assert.equal(isSalesOrderAttachment('sales_order'), true);
  assert.equal(isSalesOrderAttachment('deal'), false);
  assert.equal(SALES_ORDER_ATTACHMENT_TABLE.sales_order, 'sales_orders');
  // 🔴 ลงใน SALES_ATTACHMENT_TABLE = ตัดสินด้วย team/ownerId ของแถวใบ ซึ่งใบไม่มี team ⇒ ด่านทีมตกเงียบทุกคน
  assert.equal(SALES_ATTACHMENT_TABLE.sales_order, undefined);
  assert.equal(PARENT_TABLE.sales_order, 'sales_orders');
  assert.ok(ATTACHMENT_TYPES.sales_order?.length, 'ต้องลงทะเบียนชนิดเอกสาร ไม่งั้น ATTACHMENT_ENTITY_TYPES ไม่รู้จัก');
});

test('สิทธิ์ตัดสินผ่าน **ดีลของใบ** — ทีมเดียวกับดีลอ่าน/แนบได้ · คนดูอย่างเดียวแนบไม่ได้', async () => {
  const db = fakeDb();
  assert.equal(await canViewSalesOrderAttachment(db, order, ae), true);
  assert.equal(await canAttachToSalesOrder(db, order, ae), true);
  assert.ok(db.calls.some(([k, v]) => k === 'from' && v === 'sales_deals'));
  assert.ok(db.calls.some(([k, v]) => k === 'id' && v === 'D-1'));
  assert.equal(await canAttachToSalesOrder(fakeDb(), order, viewer), false);
});

test('อ่านดีลพัง = ไม่ผ่าน (fail closed) · ไม่มีดีล = แอดมินอย่างเดียว', async () => {
  const broken = fakeDb({ error: { message: 'boom' } });
  assert.equal(await canViewSalesOrderAttachment(broken, order, ae), false);
  assert.equal(await canAttachToSalesOrder(broken, order, admin), false);
  const orphan = fakeDb({ deal: null });
  assert.equal(await canViewSalesOrderAttachment(orphan, order, ae), false);
  assert.equal(await canViewSalesOrderAttachment(orphan, order, admin), true);
  assert.equal(await canAttachToSalesOrder(fakeDb(), null, admin), false);
});

test('ลบ = คนแนบเองหรือแอดมิน (มติ 25/09) — คนในทีมเดียวกันลบไฟล์ของคนอื่นไม่ได้', () => {
  const mine = { id: 'A-1', uploadedBy: 'u-ae' };
  assert.equal(canRemoveSalesOrderFile(mine, ae), true);
  assert.equal(canRemoveSalesOrderFile(mine, otherAe), false);
  assert.equal(canRemoveSalesOrderFile(mine, admin), true);
  // แถวเก่าที่ไม่มีผู้แนบ — ไม่มีใครเป็นเจ้าของ ⇒ แอดมินเท่านั้น (ไม่ใช่ทุกคนเพราะ undefined === undefined)
  assert.equal(canRemoveSalesOrderFile({ id: 'A-2', uploadedBy: null }, { id: undefined, role: 'ae' }), false);
  assert.equal(canRemoveSalesOrderFile(null, admin), false);
});

test('ด่านสถานะ: แนบได้ทุกสถานะ ยกเว้นใบยกเลิกและฉบับที่ถูก Rev. แทน — และบอกทางไปต่อ', () => {
  for (const status of ['draft', 'pending_approval', 'approved', 'rejected', 'approval_revoked']) {
    assert.equal(salesOrderAttachBlock({ status }), null, status);
  }
  assert.match(salesOrderAttachBlock({ status: 'cancelled' }), /ยกเลิก/);
  assert.match(salesOrderAttachBlock({ status: 'revised' }), /ฉบับล่าสุด/);
  assert.ok(salesOrderAttachBlock(null));
});

test('ออก Rev. ย้ายไฟล์แนบไปใบใหม่ด้วย entityType + entityId ของใบเดิมเท่านั้น', async () => {
  const seen = [];
  const chain = {
    update(patch) { seen.push(['update', patch]); return chain; },
    eq(col, val) { seen.push([col, val]); return chain; },
    select: async () => ({ data: [{ id: 'A-1' }, { id: 'A-2' }], error: null }),
  };
  const res = await moveSalesOrderAttachments({ from: () => chain }, 'SO-1', 'SO-2');
  assert.deepEqual(res, { moved: 2, error: null });
  assert.deepEqual(seen, [['update', { entityId: 'SO-2' }], ['entityType', 'sales_order'], ['entityId', 'SO-1']]);

  const broken = {
    update() { return broken; },
    eq() { return broken; },
    select: async () => ({ data: null, error: { message: 'nope' } }),
  };
  const failing = { from: () => broken };
  assert.deepEqual(await moveSalesOrderAttachments(failing, 'SO-1', 'SO-2'), { moved: 0, error: 'nope' });
  assert.deepEqual(await moveSalesOrderAttachments({}, 'SO-1', 'SO-1'), { moved: 0, error: null });
});

// ── ⚠️ ด่านกันลืมต่อ 5 จุด ────────────────────────────────────────────────
const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

test('จุด 1–2: GET/POST /api/attachments รู้จักแถวแม่ของใบสั่งขาย + ด่านสถานะก่อนแตะ Drive', () => {
  const whole = read('../../app/api/attachments/route.js');
  assert.match(whole, /SALES_ORDER_ATTACHMENT_TABLE\[entityType\]/);
  const route = whole.slice(whole.indexOf('export async function POST'));
  const gate = route.indexOf('salesOrderAttachBlock(parent)');
  assert.ok(gate > 0, 'POST ต้องเรียกด่านสถานะของใบสั่งขาย');
  assert.ok(gate > route.indexOf('canEditAttachmentParent('), 'ด่านสถานะมาหลังด่านสิทธิ์');
  assert.ok(gate < route.indexOf('buildGoogleAttachment('), 'ด่านสถานะต้องมาก่อนสร้างเอกสารบน Drive');
  const ladder = read('../master/attachmentAccess.js');
  assert.match(ladder, /canViewSalesOrderAttachment\(supabase, parent, user\)/);
  assert.match(ladder, /canAttachToSalesOrder\(supabase, parent, user\)/);
});

test('จุด 3: DELETE/PATCH ดักใบสั่งขาย **นอก** บล็อก `if (table)` + ใช้กติกาคนแนบ', () => {
  const src = read('../../app/api/attachments/[id]/route.js');
  const branch = src.indexOf('isSalesOrderAttachment(att.entityType)');
  assert.ok(branch > 0, 'ต้องมีสาขาใบสั่งขายใน guardAttachmentWrite');
  assert.ok(branch < src.indexOf('const table = PARENT_TABLE[att.entityType]'), 'ต้องมาก่อนบล็อก PARENT_TABLE');
  // คนแนบ/แอดมิน **และ** ยังแก้ใบได้ — ต้องเป็นเงื่อนไขของ `allowed` ไม่ใช่แค่โผล่ในข้อความ error
  assert.match(src, /const allowed = canRemoveSalesOrderFile\(att, user\)\s*&& \(order \? await canAttachToSalesOrder\(supabase, order, user\)/);
  assert.match(src, /salesOrderAttachBlock\(order\)/);
});

test('กวาดไฟล์ของใบที่ลบแล้ว **ไม่ throw** — อ่านพังกลางทางแล้วงานหลังลบ (audit) ต้องเดินต่อได้', async () => {
  // listAttachments โยนเมื่ออ่านพัง — ตัวกวาดต้องกลืนแล้วรายงาน ไม่ใช่ปล่อยให้ route ตอบ 500 หลังลบใบไปแล้ว
  const boom = { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: async () => ({ data: null, error: new Error('read failed') }) }) }) }) }) };
  const res = await purgeSalesOrderFiles(boom, ['SO-1', 'SO-1', null]);
  assert.equal(res.count, 0);
  assert.deepEqual(res.errors, ['SO-1: read failed']); // ใบซ้ำ/ค่าว่างถูกตัด
  assert.deepEqual(await purgeSalesOrderFiles(boom, []), { count: 0, errors: [] });
});

test('จุด 5 + ปลายทาง: proxy ไฟล์ใช้บันไดกลาง · ลบใบ/ลบใบเสนอราคา/ลบดีล กวาดไฟล์ · ออก Rev. ย้ายไฟล์', () => {
  assert.equal(PARENT_TABLE.sales_order, 'sales_orders');
  const so = read('../../app/api/sales-planning/sales-orders/[id]/route.js');
  assert.match(so, /purgeSalesOrderFiles\(supabase, \[id\]\)/);
  // กวาด **หลัง** ลบใบสำเร็จ — ลบใบล้มแล้วไฟล์ต้องยังอยู่ · และก่อน audit (ตัวกวาดไม่ throw จึงไม่ข้าม audit)
  assert.ok(so.indexOf('purgeSalesOrderFiles(supabase, [id])') > so.indexOf("from('sales_orders').delete()"));
  assert.match(so, /moveAttachmentsAfterRevise\(\{ supabase, user, req, oldOrder: before, newOrder: revision \}\)/);
  // ใบสั่งขายหายตาม cascade ได้อีกสองทาง — ใบเสนอราคาต้นทาง · ดีล (บังคับลบ)
  const qt = read('../../app/api/sales-planning/quotations/[id]/route.js');
  assert.match(qt, /purgeSalesOrderFiles\(supabase, childOrderIds\)/);
  const deal = read('../../app/api/sales-planning/deals/[id]/route.js');
  const listed = deal.indexOf('salesOrderIdsOfDeal(supabase, id)');
  assert.ok(listed > 0 && listed < deal.indexOf("from('sales_deals').delete()"), 'ต้องจดรายชื่อใบก่อนลบดีล');
  assert.match(deal, /purgeSalesOrderFiles\(supabase, childOrders\.ids\)/);
});

test('เอกสาร Google ของใบที่ยกเลิก = ให้สิทธิ์อ่านอย่างเดียว (ไม่งั้นแก้เนื้อใน Drive ได้ทั้งที่ใบตรึงแล้ว)', () => {
  const route = read('../../app/api/attachments/route.js');
  assert.match(route, /const frozenOrder = entityType === 'sales_order' && user\?\.role !== 'admin' && !!salesOrderAttachBlock\(parent\);/);
  assert.match(route, /role: !frozenOrder && \(await canEditAttachmentParent\(/);
});
