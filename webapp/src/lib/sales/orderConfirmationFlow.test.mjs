import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { quotationWonEffects, selectableProjectsForWon } from './quotationWonPrompt.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => readFileSync(join(SRC, rel), 'utf8');

const quote = { totalAmount: 599200, vatAmount: 39200 };

/* ── โมดัลปิด Won: บอกผลลัพธ์ให้ครบก่อนกด (กติกาเดียวกับ approvalPrompt) ────── */
test('ผลลัพธ์ของการปิด Won บอกครบทั้งดีล ใบอื่น และก้าวถัดไป', () => {
  const effects = quotationWonEffects({ quote, deal: { title: 'KA_Artepol ฤดูร้อน' } });
  assert.match(effects.join('\n'), /KA_Artepol ฤดูร้อน.*Won/s);
  assert.match(effects.join('\n'), /ใบเสนอราคาฉบับอื่น/);
  assert.match(effects.join('\n'), /ใบสั่งขาย/);
  assert.match(effects.join('\n'), /ย้อนการรับใบ/);
  // ⚠️ ห้ามพูดถึงหลักฐาน/ไฟล์แนบอีก — ย้ายไปหน้าสร้างใบสั่งขายแล้ว
  assert.doesNotMatch(effects.join('\n'), /แนบไฟล์|หลักฐานการชำระ/);
});

test('ดีลลอย: ผลลัพธ์บอกด้วยว่าไทม์ไลน์ลอยถูกรับเข้าโครงการ ไม่ใช่สร้างใหม่ทับ', () => {
  const effects = quotationWonEffects({
    quote, deal: { title: 'ดีลลอย' }, project: { code: 'PRJ-1', name: 'โครงการเดิม' }, linkingProject: true,
  });
  assert.match(effects[0], /PRJ-1 · โครงการเดิม/);
  assert.match(effects[0], /ไม่สร้างทับ/);
});

test('ใบยอด 0 ต้องทวนว่ามูลค่าปิดของดีลจะเป็น 0', () => {
  const effects = quotationWonEffects({ quote: { totalAmount: 0, vatAmount: 0 }, deal: { title: 'ดีล' } });
  assert.ok(effects.some((line) => /ยอดเป็น 0 บาท/.test(line)));
});

/* ── ลิสต์โครงการในโมดัล = กติกาเดียวกับ linkDealToProject ─────────────────── */
test('เลือกได้เฉพาะโครงการของลูกค้าเดียวกัน ยังไม่ปิด และสายธุรกิจตรงกัน', () => {
  const projects = [
    { id: 'P1', customerId: 'C1', line: 'product' },
    { id: 'P2', customerId: 'C2', line: 'product' },              // คนละลูกค้า
    { id: 'P3', customerId: 'C1', line: 'service' },              // คนละสาย
    { id: 'P4', customerId: 'C1', line: 'product', closeStatus: 'closed' }, // ปิดแล้ว
    { id: 'P5', customerId: null, line: 'product' },              // ไม่รู้ลูกค้า = ไม่เดา
    { id: 'P6', customerId: 'C1', line: null },                   // โครงการเก่ายังไม่ระบุสาย
  ];
  const usable = selectableProjectsForWon(projects, { customerId: 'C1', line: 'product' });
  assert.deepEqual(usable.map((p) => p.id), ['P1', 'P6']);
});

test('ดีลที่ยังไม่ระบุสาย ไม่กรองสายทิ้ง (ไปตรวจซ้ำที่ server)', () => {
  const usable = selectableProjectsForWon(
    [{ id: 'P1', customerId: 'C1', line: 'service' }],
    { customerId: 'C1', line: null },
  );
  assert.deepEqual(usable.map((p) => p.id), ['P1']);
});

/* ── ratchet: ด่านและเส้นทางที่ย้ายแล้ว ต้องไม่ถูกย้ายกลับเงียบ ๆ ───────────── */
test('ปิด Won ไม่ตรวจหลักฐานอีกแล้ว และผูกโครงการในคำขอเดียวกัน', () => {
  const accept = read('app/api/sales-planning/quotations/[id]/accept/route.js');
  assert.doesNotMatch(accept, /validateWonEvidence|validateOrderConfirmation/, 'ปิด Won ต้องไม่ตรวจเอกสารยืนยัน');
  assert.match(accept, /p_evidence: \{\}/, 'ส่งหลักฐานว่างเสมอ — คอลัมน์ won\\* เหลือไว้ให้ใบเก่า');
  assert.match(accept, /linkDealToProject/, 'ผูกโครงการอยู่ในคำขอเดียวกับการปิด Won');
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
