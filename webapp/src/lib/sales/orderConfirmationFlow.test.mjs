import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quotationWonEffects } from './quotationWonPrompt.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const quote = { totalAmount: 599200, vatAmount: 39200 };

/* ── โมดัลปิด Won: บอกผลลัพธ์ให้ครบก่อนกด (กติกาเดียวกับ approvalPrompt) ────── */
test('ผลลัพธ์ของการปิด Won บอกครบทั้งดีล ใบอื่น และก้าวถัดไป', () => {
  const effects = quotationWonEffects({ quote, deal: { title: 'KA_Artepol ฤดูร้อน' } });
  const text = effects.map((e) => e.text).join('\n');
  assert.deepEqual(effects.map((e) => e.id), ['won', 'closed', 'order', 'undo'], 'ทุกข้อมี id ให้จอเลือกไอคอน');
  assert.match(text, /KA_Artepol ฤดูร้อน.*Won/s);
  assert.match(text, /ใบเสนอราคาฉบับอื่น/);
  // มติ 25/09 (mig 0388): ใบที่ถูกปิดไม่ใช่ทางเดียว — ย้อนการรับเปิดคืนสถานะเดิม
  assert.match(text, /ย้อนการรับใบนี้ ใบเหล่านั้นเปิดกลับเป็นสถานะเดิม/);
  assert.match(text, /ใบสั่งขาย/);
  assert.match(text, /ย้อนการรับใบ/);
  // ⚠️ ห้ามพูดถึงหลักฐาน/ไฟล์แนบอีก — ย้ายไปหน้าสร้างใบสั่งขายแล้ว
  assert.doesNotMatch(text, /แนบไฟล์|หลักฐานการชำระ/);
  // ⚠️ ยอดเงินไม่อยู่ในลิสต์ผลลัพธ์ — โมดัลโชว์เป็นแถวของตัวเอง (อ่านก่อนกด)
  assert.doesNotMatch(text, /มูลค่าปิด/);
});

test('ใบยอด 0 ต้องทวนว่ามูลค่าปิดของดีลจะเป็น 0', () => {
  const effects = quotationWonEffects({ quote: { totalAmount: 0, vatAmount: 0 }, deal: { title: 'ดีล' } });
  assert.ok(effects.some((e) => e.id === 'zero' && /ยอดเป็น 0 บาท/.test(e.text)));
});

/* ── ratchet: ด่านและเส้นทางที่ย้ายแล้ว ต้องไม่ถูกย้ายกลับเงียบ ๆ ───────────── */
test('ปิด Won ไม่ตรวจหลักฐาน และไม่ผูก/ไม่บังคับโครงการแล้ว (0434)', () => {
  const accept = read('app/api/sales-planning/quotations/[id]/accept/route.js');
  assert.doesNotMatch(accept, /validateWonEvidence|validateOrderConfirmation/, 'ปิด Won ต้องไม่ตรวจเอกสารยืนยัน');
  assert.match(accept, /p_evidence: \{\}/, 'ส่งหลักฐานว่างเสมอ — คอลัมน์ won\\* เหลือไว้ให้ใบเก่า');
  /* มติเจ้าของ 13/11/2026 (ถอดโครงการทาง ก. · P1) — ห้ามด่าน/การผูกโครงการไหลกลับมาที่การปิด Won */
  assert.doesNotMatch(accept, /linkDealToProject/, 'ปิด Won ต้องไม่ผูกโครงการ');
  assert.doesNotMatch(accept, /if \(!deal\.projectId\)|body\.projectId\)/, 'ปิด Won ต้องไม่บังคับ/ไม่อ่านโครงการจาก body');
  const dialog = read('components/salesPlanning/QuotationWonDialog.js');
  assert.doesNotMatch(dialog, /projectId|SearchableSelect/, 'โมดัลปิด Won ต้องไม่ถามโครงการ');
});

test('เอกสารยืนยันเป็นด่านของการยื่นอนุมัติ ไม่ใช่ของการสร้างใบ', () => {
  const detail = read('app/api/sales-planning/sales-orders/[id]/route.js');
  const create = read('app/api/sales-planning/sales-orders/route.js');
  assert.match(detail, /salesOrderConfirmationGate\(before, before\.quotation\)/, 'ด่านอยู่ที่ action submit');
  // เทียบเฉพาะการ *เรียกใช้* — ชื่อนี้โผล่ในคอมเมนต์ของ route สร้างใบเพื่อชี้ว่าด่านอยู่ที่ไหน
  assert.doesNotMatch(create, /salesOrderConfirmationGate\(/, 'ตอนสร้างใบต้องไม่มีด่านนี้ — ใบร่างที่ยังรอ PO ต้องออกได้');
  // ใบร่างเติมเอกสารทีหลังได้ (ไม่งั้นต้องออกใบใหม่ทุกครั้งที่ PO มาช้า)
  assert.match(detail, /'confirmation' in body/, 'action save ต้องรับเอกสารยืนยันด้วย');
});

test('ฟอร์มหน้าสร้างส่งข้อมูลไปกับการออกใบในคำขอเดียว', () => {
  const create = read('app/api/sales-planning/sales-orders/route.js');
  assert.match(create, /p_overrides: \{/, 'referenceDoc/หมายเหตุ/เอกสารยืนยัน ไปพร้อม RPC ที่ออกเลขใบ');
  assert.match(create, /applyCreateFormPayments/, 'กำหนดชำระรายงวด + เงินงวดแรกถูกเขียนต่อทันที');
  // 🛑 งวดร่างต้องเป็น pending เสมอ (CHECK ของ 0259) — ห้ามเขียน status จากฟอร์ม
  assert.doesNotMatch(create, /status: 'reported'/, 'ฟอร์มสร้างต้องไม่ตั้งสถานะงวดเอง');
});

test('หน้าใบเสนอราคาพาไปหน้าฟอร์ม ไม่ใช่ยิงสร้างใบทันที', () => {
  const page = read('app/sales-planning/quotations/[id]/page.js');
  assert.match(page, /\/sa\/sales-orders\/new\?quotationId=/, 'ปุ่มออกใบสั่งขายเป็นลิงก์ไปหน้าฟอร์ม');
  assert.doesNotMatch(page, /method: "POST",\s*headers: \{ "content-type": "application\/json" \},\s*body: JSON\.stringify\(\{ quotationId/,
    'ต้องไม่มีเส้นสร้างใบตรงจากหน้าใบเสนอราคาอีก (เลขที่ใบใช้ซ้ำไม่ได้)');
});
