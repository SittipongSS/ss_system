// ── ลายน้ำตอนเสิร์ฟของกระดาษที่ตรึงแล้ว (มติเจ้าของ 24/09/2026 · ยกเลิกสัญญาที่ลงนามแล้ว) ─────────────
//
// ⭐ สัญญา/บันทึกเพิ่มเติมที่ออกเลขแล้วเสิร์ฟ `issuedHtml` ที่ตรึงไว้ — ลายน้ำ "ยกเลิก" ของตัวเรนเดอร์ไม่เคยถึง
//    ใบที่ถูกยกเลิก *หลัง* ตรึง ⇒ ประทับตอนเสิร์ฟ ไม่เขียนกลับ (กระดาษที่ลูกค้าเซ็นต้องเป็นของเดิม)
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { stampWatermark, watermarkSheets } from './documentShell.js';
import { applyProductSpecWatermark } from '../sales/productSpecDocument.js';
import { PAGINATE_SCRIPT, buildContractHTML } from '../sales/contractDocument.js';

const COMPANY = { legalNameTh: 'บริษัท ทดสอบ จำกัด', address: 'กรุงเทพ', taxId: '0105557081665' };
const SIGNED = {
  id: 'CTR-1', kind: 'scent_design', status: 'signed', contractNo: 'CT-SD-26080001-0', contractDate: '2026-08-20',
  customerName: 'บริษัท ลูกค้า จำกัด', metadata: { quoteNumber: 'QT-1' }, fields: {},
};
const count = (html) => (html.match(/<div class="watermark">/g) || []).length;

test('ประทับหลังแท็กเปิดของทุกแผ่น · ไม่มีข้อความ/ไม่มีกระดาษ = คืนของเดิม', () => {
  const two = '<article class="sheet" aria-label="a">A</article><article class="sheet contPage">B</article>';
  const stamped = stampWatermark(two, 'ยกเลิก');
  assert.equal(count(stamped), 2);
  assert.equal(stamped.replace(/<div class="watermark">ยกเลิก<\/div>/g, ''), two);
  assert.equal(stampWatermark(two, null), two);
  assert.equal(stampWatermark(null, 'ยกเลิก'), null);
  assert.equal(stampWatermark('', 'ยกเลิก'), '');
});

test('ประทับซ้ำไม่ซ้อน — กระดาษที่มีลายน้ำอยู่แล้ว (ตรึงตอนยกเลิกไปแล้ว) คืนตามเดิม', () => {
  const once = stampWatermark('<article class="sheet">A</article>', 'ยกเลิก');
  assert.equal(stampWatermark(once, 'ยกเลิก'), once);
  // ⚠️ ดูที่ตัว <div> ไม่ใช่คำว่า .watermark — CSS กับสคริปต์ตัดหน้าของสัญญามีคำนี้ทุกใบ
  const contract = buildContractHTML(SIGNED, { company: COMPANY });
  assert.match(contract, /\.watermark/);
  assert.equal(count(contract), 0, 'ฉบับที่ลงนามแล้วไม่มีลายน้ำ');
  assert.equal(count(stampWatermark(contract, 'ยกเลิก')), 1);
});

test('สัญญาที่ตรึงไว้: ลายน้ำเข้าสายเนื้อหา แล้วสคริปต์ตัดหน้าคัดลอกไปทุกแผ่น', () => {
  const frozen = buildContractHTML(SIGNED, { company: COMPANY });
  const stamped = stampWatermark(frozen, 'ยกเลิก');
  const flowOpen = stamped.indexOf('class="sheet flowSheet"');
  assert.ok(flowOpen > 0);
  assert.ok(stamped.indexOf('<div class="watermark">ยกเลิก</div>', flowOpen) > flowOpen);
  assert.match(PAGINATE_SCRIPT, /flow\.querySelector\('\.watermark'\)/);
  assert.match(PAGINATE_SCRIPT, /page\.innerHTML = watermarkHtml/);
  // เอาลายน้ำออกแล้วต้องได้ฉบับตรึงเดิมทุกไบต์
  assert.equal(stamped.replace('<div class="watermark">ยกเลิก</div>', ''), frozen);
});

test('ตัวถอยของกระดาษ PSD ใช้ตัววางลายน้ำตัวเดียวกัน — พฤติกรรมเดิม (ไม่ข้ามแม้มีลายน้ำแล้ว)', () => {
  const legacy = '<div><article class="sheet explicit-page" aria-label="a">A</article><article class="sheet">B</article></div>';
  assert.equal(applyProductSpecWatermark(legacy, 'ยกเลิก'), watermarkSheets(legacy, 'ยกเลิก'));
  assert.equal(count(watermarkSheets(watermarkSheets(legacy, 'ก'), 'ข')), 4);
});
