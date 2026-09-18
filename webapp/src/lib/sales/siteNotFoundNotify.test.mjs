// ── กระดิ่ง "TS ไม่พบจุดนี้หน้างาน" (มติข้อ 23.2 · ข2) ─────────────────────────
//
// ⭐ กระดิ่งที่ยิงผิดคนคือกระดิ่งที่คนรับทำอะไรต่อไม่ได้ — เทสต์นี้ตรึงว่า **ถึงผู้คีย์ใบ**
//   ไม่ใช่ AE ของดีล (คนละคนโดยออกแบบ · `createdBy` vs `ownerId`)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  SITE_NOT_FOUND_ENTITY_TYPE, SITE_NOT_FOUND_KIND, siteNotFoundDedupeKey, siteNotFoundNotice,
} from './siteNotFoundNotify.js';
import { SALES_ORDER_BELL_KINDS } from '../notifications.js';

const AT = '2026-09-18T03:00:00.000Z';
const order = (extra = {}) => ({
  id: 'SOR-H1', orderNumber: 'SO-26090044-0', createdBy: 'U-SUP', ownerId: 'U-AE', ...extra,
});
const line = (point) => ({ id: `SOL-${point}`, installationPoint: point });

test('kind อยู่ในทะเบียนกล่องกระดิ่ง — ไม่งั้นแจ้งเตือนลงฐานแต่ไม่มีใครเห็น', () => {
  assert.ok(SALES_ORDER_BELL_KINDS.includes(SITE_NOT_FOUND_KIND));
  assert.equal(SITE_NOT_FOUND_ENTITY_TYPE, 'sales_order');
});

test('⭐ ถึงผู้คีย์ใบเท่านั้น — AE ของดีลไม่ได้รับ (มติข้อ 23.2)', () => {
  const n = siteNotFoundNotice({ order: order(), lines: [line('ล็อบบี้')], actorId: 'U-TS', at: AT });
  assert.deepEqual(n.userIds, ['U-SUP']);
  assert.ok(!n.userIds.includes('U-AE'), 'AE ของดีลดูจากชิปในทะเบียนอยู่แล้ว');
  assert.equal(n.entityId, 'SOR-H1');
  assert.equal(n.href, '/sa/sales-orders/SOR-H1');
});

test('ข้อความบอกจำนวนจุด + ชื่อจุดสามตัวแรก และทางออกทั้งสาม', () => {
  const lines = ['ล็อบบี้', 'ชั้น 3', 'ชั้น 5', 'ชั้น 7'].map(line);
  const n = siteNotFoundNotice({ order: order(), lines, actorId: 'U-TS', at: AT });
  assert.match(n.title, /4 จุด/);
  assert.match(n.title, /SO-26090044-0/);
  assert.match(n.body, /ล็อบบี้ · ชั้น 3 · ชั้น 5/);
  assert.match(n.body, /และอีก 1 จุด/);
  for (const way of ['แก้ชื่อจุดส่งกลับ', 'ปิดจุด', 'ถอดออกจากใบ']) {
    assert.ok(n.body.includes(way), `ข้อความต้องบอกทาง ${way}`);
  }
});

test('ไม่มีใครต้องรู้ = ไม่ยิง (ไม่ใช่ยิงแถวเปล่า)', () => {
  assert.equal(siteNotFoundNotice({ order: order({ createdBy: null }), lines: [line('ก')] }), null);
  assert.equal(siteNotFoundNotice({ order: order(), lines: [] }), null);
  assert.equal(siteNotFoundNotice({ order: order(), lines: [{ id: 'x' }] }), null, 'จุดไม่มีชื่อ = ไม่มีอะไรให้อ่าน');
  assert.equal(siteNotFoundNotice({ order: null, lines: [line('ก')] }), null);
  // แอดมินสวมสองบทบาท: แจ้งเองแล้วไม่ต้องเด้งใส่ตัวเอง
  assert.equal(siteNotFoundNotice({ order: order(), lines: [line('ก')], actorId: 'U-SUP' }), null);
});

test('🪤 กุญแจกันซ้ำผูกกับ "รอบการแจ้ง" ไม่ใช่รายบรรทัด', () => {
  const lines = [line('ก'), line('ข')];
  const a = siteNotFoundNotice({ order: order(), lines, actorId: 'U-TS', at: AT });
  const b = siteNotFoundNotice({ order: order(), lines: [lines[0]], actorId: 'U-TS', at: AT });
  assert.equal(a.dedupeKey, b.dedupeKey, 'แจ้งหลายจุดพร้อมกัน = กระดิ่งใบเดียว');
  // ถอนแล้วแจ้งใหม่ได้เวลาใหม่ ⇒ กระดิ่งรอบสองต้องไม่ถูกกลืน
  const later = siteNotFoundNotice({ order: order(), lines, actorId: 'U-TS', at: '2026-09-19T01:00:00.000Z' });
  assert.notEqual(a.dedupeKey, later.dedupeKey);
  assert.equal(siteNotFoundDedupeKey('SOR-H1', AT), 'sitenf:SOR-H1:2026-09-18T03:00:00');
});

test('🔴 route ของ TS ยิงกระดิ่งเฉพาะตอนแจ้ง และอ่าน createdBy มาด้วย', () => {
  const route = readFileSync(new URL('../../app/api/service/intake/site-not-found/route.js', import.meta.url), 'utf8');
  assert.match(route, /"createdBy"/, 'ไม่ select createdBy = ไม่มีใครให้ยิง');
  assert.match(route, /if \(action === 'flag'\) \{\s*notifySiteNotFound\(/,
    'ถอนการแจ้งต้องไม่ยิง — ไม่มีอะไรให้ฝ่ายขายทำต่อ');
  // fire-and-forget: ห้าม await ไม่งั้นกระดิ่งพังแล้วการแจ้งจุดตอบ error
  assert.ok(!route.includes('await notifySiteNotFound('), '🔴 ห้าม await กระดิ่ง');
});
