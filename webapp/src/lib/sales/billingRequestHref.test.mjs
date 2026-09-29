// ── ลิงก์ "ขอใบวางบิลงวดนี้" บ้านเดียว (แผงงวด + แถวกระดิ่ง · กำหนดวางบิล รอบสอง 26/09) ──────────────────
// ⭐ ตรึงสองเรื่อง: รูปลิงก์ตรงกับที่แผงงวดเคยประกอบทุกตัวอักษร · ชื่อพารามิเตอร์ทุกตัว = ที่หน้าเปิดคำร้องอ่านจริง
//   (พิมพ์ผิดตัวเดียว = ฟอร์มว่างช่องนั้นเงียบ ๆ หรือคำร้องไม่ผูกงวด แล้วกระดิ่งเตือน "ยังไม่ขอ" ต่อไป)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { BILLING_REQUEST_KIND, billingRequestHref } from '@/lib/sales/billingRequestHref';
import { BILLING_LINK_KIND } from '@/lib/requests/billingInstallmentLink';

const ORDER = { id: 'SOR-50', quotationId: 'QT-50' };
const INST = { id: 'SOI-1', amount: 51385.68, billingDate: '2026-10-05' };

test('รูปลิงก์ตรึงทุกตัวอักษร (ลำดับพารามิเตอร์ · กลับหน้าใบ · งวด + วันวางบิลต่อท้าย) — เท่ากับ closure เดิมของแผงงวด', () => {
  assert.equal(billingRequestHref(ORDER, INST),
    '/requests/new?kind=billing_doc&quotationId=QT-50&salesOrderId=SOR-50&billAmount=51385.68'
    + '&returnTo=%2Fsales-planning%2Fsales-orders%2FSOR-50&installmentId=SOI-1&requiredDate=2026-10-05');
});

test('งวดไม่มี id = ไม่ผูกงวด · ไม่มีวันวางบิล = ไม่เติมวันที่ · ค่าว่างไม่พัง', () => {
  const noDate = new URL(billingRequestHref(ORDER, { id: 'SOI-1', amount: 100 }), 'http://x').searchParams;
  assert.equal(noDate.get('installmentId'), 'SOI-1');
  assert.equal(noDate.has('requiredDate'), false);
  const preview = new URL(billingRequestHref(ORDER, { amount: 100 }), 'http://x').searchParams;
  assert.equal(preview.has('installmentId'), false);
  const empty = new URL(billingRequestHref(null, null), 'http://x').searchParams;
  assert.equal(empty.get('kind'), 'billing_doc');
  assert.equal(empty.get('billAmount'), '');
  assert.equal(empty.get('returnTo'), '/sales-planning/sales-orders/');
});

test('หัวข้อคำร้องตรงกับที่ตัวผูกงวดรับ (billing_doc) — ต่างกันเมื่อไร server ไม่ผูกงวดให้', () => {
  assert.equal(BILLING_REQUEST_KIND, BILLING_LINK_KIND);
});

test('🔴 ทุกพารามิเตอร์ของลิงก์ = ที่หน้า /requests/new อ่านจริง', () => {
  const page = readFileSync(new URL('../../app/requests/new/page.js', import.meta.url), 'utf8');
  const read = new Set([...page.matchAll(/searchParams\.get\("(\w+)"\)/g)].map((m) => m[1]));
  const sent = [...new URL(billingRequestHref(ORDER, INST), 'http://x').searchParams.keys()];
  assert.deepEqual(sent.filter((key) => !read.has(key)), [], 'ลิงก์ส่งพารามิเตอร์ที่หน้าไม่อ่าน');
});

test('🔴 แผงงวดประกอบลิงก์ผ่านบ้านเดียวนี้ — ไม่มีสำเนา URLSearchParams ของ billing_doc ค้างในแผง', () => {
  /* ⭐ เทสต์รูปลิงก์ข้างบนตรึงแค่ lib · ถ้าแผงกลับไปประกอบเอง (closure เดิมก่อนรอบสอง) สองปุ่มจะเพี้ยนหากัน
     โดยไม่มีเทสต์ตัวไหนแดง ⇒ ยามนี้ดูที่ต้นทางของแผงตรง ๆ */
  const panel = readFileSync(new URL('../../components/salesPlanning/SalesOrderPaymentPanel.js', import.meta.url), 'utf8');
  assert.match(panel, /import \{ billingRequestHref \} from "@\/lib\/sales\/billingRequestHref";/);
  assert.match(panel, /billingRequestHref\(order, row\)/);
  assert.doesNotMatch(panel, /kind:\s*["']billing_doc["']/, 'แผงประกอบลิงก์ billing_doc เอง');
  assert.doesNotMatch(panel, /\.set\(["'](installmentId|requiredDate)["']/, 'แผงเติมพารามิเตอร์ของลิงก์เอง — ใช้ billingRequestHref');
});
