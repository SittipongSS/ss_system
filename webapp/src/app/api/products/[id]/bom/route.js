// ── ขั้นลง BOM ของ FG (มติเจ้าของ 03/11/2026 · mig 0419) — กติกาทั้งหมดอยู่ใน lib/master/productBomRoute.js
// ⚠️ proxy: เส้นนี้เปิดให้ทั้ง `products:edit` (ฝั่งขายส่ง/ดึงกลับ) และฝ่าย RD (รับ/ตีกลับ/เสร็จ) — ด่านรายปุ่มอยู่ใน handler
import { withUser } from '@/lib/http';
import { makeProductBomHandler } from '@/lib/master/productBomRoute';

export const dynamic = 'force-dynamic';

export const POST = withUser(makeProductBomHandler());
