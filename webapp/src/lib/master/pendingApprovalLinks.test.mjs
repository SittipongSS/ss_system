// ── H3 (ตรวจตัวเลข 2026-10-08): การ์ด "สินค้า/ลูกค้ารออนุมัติ n" บนภาพรวม /database เปิดทะเบียนทั้งกอง ──
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PENDING_APPROVAL_HREF } from './pendingApprovalLinks.js';
import { MENU_GROUPS } from '../../config/menuRegistry.js';

const menuCountHref = (href) => MENU_GROUPS.flatMap((g) => g.items || []).find((i) => i.href === href)?.countHref;
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('ลิงก์ "รออนุมัติ" ของการ์ด = ลิงก์ของป้ายตัวเลขบนเมนู (นับชุดเดียวกัน ต้องเปิดชุดเดียวกัน)', () => {
  assert.equal(PENDING_APPROVAL_HREF.products, menuCountHref('/database/products'));
  assert.equal(PENDING_APPROVAL_HREF.customers, menuCountHref('/database/customers'));
});

test('ทะเบียนปลายทางอ่าน `?count=` ค่าเดียวกับที่ลิงก์ส่ง แล้วตั้งตัวกรอง "รออนุมัติ"', () => {
  const read = (href) => new URL(href, 'http://x').searchParams.get('count');
  const products = src('../../app/database/products/page.js');
  assert.match(products, new RegExp(`useSearchParams\\(\\)\\.get\\("count"\\) === "${read(PENDING_APPROVAL_HREF.products)}"`));
  assert.match(products, /fromNavCount \? PENDING_ONLY : EMPTY/);
  const customers = src('../../app/database/customers/page.js');
  assert.match(customers, new RegExp(`useSearchParams\\(\\)\\.get\\("count"\\) === "${read(PENDING_APPROVAL_HREF.customers)}"`));
  assert.match(customers, /useState\(fromNavCount \? \["pending"\] : \[\]\)/);
});

test('การ์ดรออนุมัติบน /database ใช้ลิงก์ชุดนี้ — ไม่เปิดทะเบียนเปล่าอีก', () => {
  const page = src('../../app/database/page.js');
  assert.match(page, /label="สินค้ารออนุมัติ"[^\n]*onClick=\{\(\) => router\.push\(PENDING_APPROVAL_HREF\.products\)\}/);
  assert.match(page, /label="ลูกค้ารออนุมัติ"[^\n]*onClick=\{\(\) => router\.push\(PENDING_APPROVAL_HREF\.customers\)\}/);
});
