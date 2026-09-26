// ── ปุ่มลงมือในแถวแจ้งเตือน: ฝังลิงก์ปุ่มใน `href` แล้วแกะกลับ (กำหนดวางบิล รอบสอง · 26/09) ──────────────
// ⭐ ตาราง notifications ไม่มีช่องเก็บลิงก์ปุ่ม (0185 · ห้ามออก mig) ⇒ คู่ฝัง/แกะต้องไปกลับได้ไม่เพี้ยน
//   และแถวที่ไม่มีปุ่มต้องได้ `href` เดิมทุกตัวอักษร (แจ้งเตือนชนิดอื่นทั้งระบบผ่านตัวแกะนี้)
import test from 'node:test';
import assert from 'node:assert/strict';

import { NOTIFICATION_ACTION_PARAM, hrefWithAction, splitNotificationAction } from '@/lib/notificationAction';

const ASK = '/requests/new?kind=billing_doc&quotationId=QT-50&salesOrderId=SOR-50&billAmount=100'
  + '&returnTo=%2Fsales-planning%2Fsales-orders%2FSOR-50&installmentId=SOI-1&requiredDate=2026-10-05';

test('ไปกลับได้: แถวพาไปที่เดิม · ลิงก์ปุ่มครบทุกพารามิเตอร์ (รวม returnTo ที่เข้ารหัสซ้อน)', () => {
  const href = hrefWithAction('/sa/sales-orders/SOR-50?tab=payment', ASK);
  assert.match(href, new RegExp(`^/sa/sales-orders/SOR-50\\?tab=payment&${NOTIFICATION_ACTION_PARAM}=`));
  assert.deepEqual(splitNotificationAction(href), { href: '/sa/sales-orders/SOR-50?tab=payment', actionHref: ASK });
  // แถวไม่มี query / มี hash — พารามิเตอร์ต้องอยู่ก่อน `#` และ hash ต้องกลับมาครบ
  assert.deepEqual(splitNotificationAction(hrefWithAction('/deals/D-1', ASK)), { href: '/deals/D-1', actionHref: ASK });
  assert.deepEqual(splitNotificationAction(hrefWithAction('/deals/D-1?tab=a#thread', ASK)),
    { href: '/deals/D-1?tab=a#thread', actionHref: ASK });
});

test('แถวที่ไม่มีปุ่ม = href เดิมทุกตัวอักษร (ไม่ประกอบใหม่) · ค่าว่างไม่พัง', () => {
  for (const href of ['/requests/RQ-1', '/finance/payments?billing=soon', '/x?a=1&b=%E0%B8%81', null]) {
    assert.deepEqual(splitNotificationAction(href), { href, actionHref: null }, String(href));
  }
  assert.deepEqual(splitNotificationAction(undefined), { href: null, actionHref: null });
});

test('🔴 ลิงก์ปุ่มต้องเป็นเส้นทางภายในแอป — ภายนอก/`//`/`/\\` ไม่ฝัง และถ้าหลุดมาในแถวก็ไม่ขึ้นปุ่ม', () => {
  assert.equal(hrefWithAction('/sa/sales-orders/SOR-50', 'https://evil.example/x'), '/sa/sales-orders/SOR-50');
  assert.equal(hrefWithAction('/sa/sales-orders/SOR-50', '//evil.example/x'), '/sa/sales-orders/SOR-50');
  // เบราว์เซอร์อ่าน `/\evil` เป็น `//evil` (protocol-relative) — ต้องทิ้งเหมือน `//`
  assert.equal(hrefWithAction('/sa/sales-orders/SOR-50', '/\\evil.example/x'), '/sa/sales-orders/SOR-50');
  const backslash = `/sa/sales-orders/SOR-50?${NOTIFICATION_ACTION_PARAM}=${encodeURIComponent('/\\evil.example')}`;
  assert.deepEqual(splitNotificationAction(backslash), { href: '/sa/sales-orders/SOR-50', actionHref: null });
  assert.equal(hrefWithAction('/sa/sales-orders/SOR-50', ''), '/sa/sales-orders/SOR-50');
  assert.equal(hrefWithAction('', ASK), '', 'แถวไม่มีลิงก์ = ไม่มีที่ให้ฝัง');
  const forged = `/sa/sales-orders/SOR-50?tab=payment&${NOTIFICATION_ACTION_PARAM}=${encodeURIComponent('https://evil.example')}`;
  assert.deepEqual(splitNotificationAction(forged), { href: '/sa/sales-orders/SOR-50?tab=payment', actionHref: null });
});
