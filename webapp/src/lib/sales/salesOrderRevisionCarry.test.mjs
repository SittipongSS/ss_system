import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { paidThrough } from './paymentCoverage.js';

const mig = (name) => readFileSync(new URL(`../../../supabase/migrations/${name}`, import.meta.url), 'utf8');

/* นิยามล่าสุดของ RPC ทอด SO → SO Rev. — ไฟล์นี้เป็นตัวที่ฐานจริงใช้อยู่
   ⚠️ ย้ายไป migration ใหม่เมื่อไร **ต้องมาแก้ที่นี่ด้วย** ไม่งั้นยามจะตรวจของเก่า
      แล้วเขียวทั้งที่ของจริงถอยกลับไปเป็นเวอร์ชันที่ไม่ก๊อปงวด */
const LATEST = '0346_so_revision_carry_installments.sql';
const sql = mig(LATEST);
const rpc = sql.slice(sql.indexOf('CREATE OR REPLACE FUNCTION public.revise_approved_sales_order_atomic'));

/* 🐞 **บั๊กที่ปิดงานหน้างานทั้งเส้น** — RPC ก๊อปแค่หัวใบกับบรรทัดขาย ⇒ ใบ Rev. ของงาน
   บริการเกิดมาไม่มีงวดสักแถว ⇒ paidThrough = null ⇒ ด่านเงินบล็อกนัดทั้งไซต์
   ทั้งที่ลูกค้าจ่ายล่วงหน้าไปแล้ว (แผน §9 เขียนเองว่าต้องปิดก่อน PR-C แต่ merge ไปก่อน) */
test('🐞 RPC ออก Rev. ต้องก๊อปแผนงวดชำระไปใบใหม่', () => {
  assert.match(rpc, /INSERT INTO public\.sales_order_installments/,
    'ไม่ก๊อปงวด = ใบ Rev. ของงานบริการลงคิวช่างไม่ได้ทั้งใบ');
  assert.match(rpc, /FROM public\.sales_order_installments inst/);
  assert.match(rpc, /inst\."salesOrderId" = v_source\.id/, 'ต้องก๊อปจากใบต้นทาง ไม่ใช่ทั้งตาราง');
});

/* 🔑 ช่วงครอบบริการคือหัวใจ — ไม่ก๊อปมันมา ก๊อปอย่างอื่นครบก็ยังบล็อกอยู่ดี
   เพราะ `paidThrough` นับเฉพาะงวดที่ **confirmed และมี coversTo** */
test('🔑 ต้องก๊อป coversFrom/coversTo — ตัวที่ด่านเงินใช้จริง', () => {
  assert.match(rpc, /"coversFrom", "coversTo"/, 'ช่วงครอบต้องอยู่ในลิสต์คอลัมน์');
  assert.match(rpc, /inst\."coversFrom", inst\."coversTo"/, 'และต้องอยู่ใน SELECT ด้วย');

  // ยืนยันเหตุผล: งวดที่ confirmed แต่ไม่มี coversTo ไม่ขยับ "จ่ายถึง" แม้แต่วันเดียว
  assert.equal(paidThrough([{ status: 'confirmed', coversTo: null }]), null);
  assert.equal(paidThrough([{ status: 'confirmed', coversTo: '2026-12-31' }]), '2026-12-31');
});

/* วันกำหนดชำระ SA พิมพ์เองทีละงวด (คำนวณแทนไม่ได้ — ของจริงผูกกับเหตุการณ์ ไม่ใช่วัน)
   ⇒ ไม่ก๊อป = SA ต้องนั่งพิมพ์ใหม่ทุกงวดทุกครั้งที่ออก Rev. */
test('ต้องก๊อปวันกำหนดชำระ ชื่องวด สัดส่วน และหมายเหตุด้วย', () => {
  for (const col of ['seq', 'label', 'percent', '"dueDate"', 'note']) {
    assert.ok(rpc.includes(col), `ลิสต์คอลัมน์ต้องมี ${col}`);
  }
});

/* 🔴 CHECK `sales_order_installments_draft_pending` (0259) บังคับว่าแถวที่ยังไม่ freeze
   ต้องเป็น pending · ใบ Rev. เกิดมาเป็น draft ⇒ ก๊อปสถานะมาก็ INSERT ไม่ผ่าน
   และเหตุผลของ 0259 ใช้กับใบ Rev. เต็ม ๆ: ยอดกำลังจะเปลี่ยน หลักฐานจะผูกกับเลขที่จะถูกทับ */
test('🔴 ต้องบังคับ pending และห้ามก๊อปหลักฐาน/สถานะ/คนรับรอง', () => {
  const insert = rpc.slice(rpc.indexOf('INSERT INTO public.sales_order_installments'));
  const block = insert.slice(0, insert.indexOf('UPDATE public.sales_orders'));

  assert.match(block, /'pending'/, 'สถานะต้องถูกบังคับเป็น pending');
  /* ⚠️ `taxInvoiceNo` เป็น substring ของ `taxInvoiceNoXxx` ที่อาจเพิ่มวันหน้า —
     ยามนี้เทียบด้วย includes ⇒ ห้ามตั้งชื่อคอลัมน์ใหม่ที่ขึ้นต้นด้วยชื่อพวกนี้
     ⭐ ใบกำกับภาษี (0348) **ห้ามอุ้มข้ามใบ Rev.** — ใบที่ออกไปแล้วผูกกับยอดของใบเดิม
     ซึ่งอ่านย้อนได้ตลอด · ก๊อปมาแขวนใบใหม่ = เอกสารภาษีชี้ยอดคนละตัว */
  for (const banned of ['evidence', 'paidOn', 'reportedAt', 'confirmedAt', 'frozenAt', 'billingRequestId',
    'taxInvoiceNo', 'taxInvoiceDate', 'taxInvoiceRequestId', 'taxInvoiceItemId', 'taxInvoiceFile']) {
    assert.ok(!block.includes(banned),
      `ห้ามก๊อป ${banned} — เงินที่รับมาจริงอยู่ที่ใบเดิมซึ่งอ่านย้อนได้ตลอด`);
  }
});

/* id ที่เดาได้จาก (ใบใหม่ : งวดเดิม) — แพตเทิร์นเดียวกับบรรทัดขาย ⇒ ตามรอยย้อนได้
   ว่าแถวไหนมาจากงวดไหน และรันซ้ำได้ผลเดิม */
test('id ของงวดที่ก๊อปต้องผูกกับงวดต้นทาง', () => {
  assert.match(rpc, /'SOI-' \|\| md5\(p_revision_id \|\| ':' \|\| inst\.id\)/);
});

/* 🪤 RPC ตัวนี้ถูกเขียนทับมาแล้วห้ารอบ (0161 → 0166 → 0326 → 0340 → 0343 → 0346)
   ทุกรอบคัดทั้งก้อนมาแก้ ⇒ ก้อนที่เติมทีหลังหลุดได้ง่ายมาก · ยามนี้ตรึงว่าของที่
   รอบก่อน ๆ เติมไว้ยังอยู่ครบ ไม่ใช่ตรวจแค่ของที่รอบนี้เพิ่ม */
test('🪤 คอลัมน์ที่ migration รอบก่อน ๆ เติมไว้ ต้องยังถูกก๊อปอยู่', () => {
  for (const col of [
    '"serviceContractId"',   // 0340 — ใบบริการผูกสัญญาไว้แล้ว
    '"docLanguage"',         // 0340 — ภาษาเอกสาร
    '"confirmAttachments"',  // 0340 — หลักฐานยืนยันคำสั่งซื้อ
    '"customerNameEn"',      // 0343 — ชื่ออังกฤษ
    '"serviceRounds"',       // 0326 — จำนวนรอบขายรายบรรทัด
  ]) {
    assert.ok(rpc.includes(col), `${col} หลุดจาก RPC — Rev. จะทิ้งค่านั้นเงียบ ๆ`);
  }
});
