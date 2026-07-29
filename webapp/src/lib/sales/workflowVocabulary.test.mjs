import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// คำศัพท์ workflow เอกสาร (มติผู้ใช้ 2026-07-26) — คำเก่าสองคำต่างกันตัวสะกดเดียวแต่
// คนละความหมาย ("ถอนการยื่น" ของผู้ยื่น vs "ถอดอนุมัติ" ของผู้รีวิว) ผู้ใช้อ่านสลับกันตลอด
// จึงเปลี่ยนเป็นคู่คำที่กริยาบอกทิศทางเอง:
//   ตีกลับ (ให้แก้ไข)  = ผู้อนุมัติส่งกลับมาให้ผู้จัดทำ
//   ดึงกลับ (มาแก้ไข)  = ผู้ยื่นดึงคำขอของตัวเองคืน
//   ออก Rev.          = ออกฉบับใหม่จากใบที่อนุมัติแล้ว
//
// เทสต์นี้กันคำเก่ากลับมา — ไฟล์ใหม่ที่ลอกแพตเทิร์นจากโค้ดเก่าคือช่องทางหลักที่มันจะกลับมา
const FILES = [
  'src/components/ui/ActionButtons.js',
  'src/lib/sales/documentWorkflowErrors.js',
  'src/app/sales-planning/quotations/[id]/page.js',
  'src/app/sales-planning/sales-orders/[id]/page.js',
  'src/app/api/sales-planning/quotations/[id]/route.js',
  'src/app/api/sales-planning/quotations/[id]/revise/route.js',
  'src/app/api/sales-planning/quotations/[id]/withdraw/route.js',
  'src/app/api/sales-planning/quotations/[id]/reject/route.js',
  'src/app/api/sales-planning/sales-orders/[id]/route.js',
  // B5 (2026-07-28): "ดึงกลับ" ขยายมาที่ใบขอราคาผลิต — โมดูลใหม่คือช่องทางหลักที่คำเก่า
  // จะกลับมา เพราะคนลอกแพตเทิร์นจากไฟล์เก่ากว่า
  'src/lib/costing.js',
  'src/lib/costingUpdates.js',
  'src/app/sa/costing/[id]/page.js',
  'src/app/api/sa/costing/[id]/withdraw/route.js',
];

const read = (path) => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');

test('retired workflow wording never comes back', () => {
  for (const file of FILES) {
    const src = read(file);
    assert.doesNotMatch(src, /ถอนการยื่น/, `${file}: ใช้ "ดึงกลับ" แทน "ถอนการยื่น"`);
    assert.doesNotMatch(src, /ถอดอนุมัติ/, `${file}: ใช้ "ยกเลิกอนุมัติ" แทน "ถอดอนุมัติ"`);
    assert.doesNotMatch(src, /ออก Revision/, `${file}: ใช้ "ออก Rev." แทน "ออก Revision"`);
  }
});

test('the agreed pair reads its direction from the verb', () => {
  const buttons = read('src/components/ui/ActionButtons.js');
  // ดึงกลับ**มา** = ของเราเอง · ตีกลับ**ให้** = คนอื่นส่งมา (label เต็มอยู่ที่หน้าเว็บ)
  assert.match(buttons, /withdraw: \{ tone: "neutral", Icon: Undo2, label: "ดึงกลับมาแก้ไข" \}/);
  assert.match(buttons, /revise: \{ tone: "neutral", Icon: Copy, label: "ออก Rev\." \}/);

  const qt = read('src/app/sales-planning/quotations/[id]/page.js');
  const so = read('src/app/sales-planning/sales-orders/[id]/page.js');
  assert.match(qt, /label: "ตีกลับให้แก้ไข"/);
  assert.match(so, /label: "ตีกลับให้แก้ไข"/);
});

// "ถอด" ยังใช้ได้ในความหมายอื่นที่ไม่เกี่ยวกับ workflow — ห้ามไล่แก้เหมารวม
test('unrelated uses of ถอด are left alone', () => {
  // ย้ายจาก api/orders/route.js มาที่เอกสารพิมพ์: คอมเมนต์ที่เคยอ้างถูกลบไปพร้อมสูตร
  // ภาษีเก่า (2026-07-29 — ยกการคิดภาษีไปที่ exciseBilling) ส่วนคำบนเอกสารจริงถาวรกว่า
  const billPrint = read('src/lib/tax/billPrint.js');
  assert.match(billPrint, /ถอด VAT/);   // ถอด VAT = คิดราคาก่อนภาษี
  const deals = read('src/app/api/sales-planning/deals/[id]/route.js');
  assert.match(deals, /ถอด timeline segment/);   // ถอดออกจากโครงการ
});

// มติ 2026-07-26: ผู้อนุมัติ/ผู้รีวิวดึงกลับไม่ได้แล้ว — ใช้ "ตีกลับ" ที่ทิ้งเหตุผลไว้แทน
// ด่านนี้อยู่ที่ predicate ตัวเดียวซึ่ง route ใช้ร่วมกับหน้าเว็บ ถ้าหน้าไหนเขียนตรรกะเองซ้ำ
// (แบบที่เคยเป็น) ปุ่มกับ API จะเพี้ยนหากันเงียบ ๆ อีกรอบ
test('both detail pages gate ดึงกลับ through the shared predicate, not a local copy', () => {
  const qt = read('src/app/sales-planning/quotations/[id]/page.js');
  const so = read('src/app/sales-planning/sales-orders/[id]/page.js');

  assert.match(qt, /canWithdrawSubmission = canWithdrawQuotationSubmission\(/);
  assert.match(so, /canWithdraw = canWithdrawSalesOrderSubmission\(/);
  // B5: ใบขอราคาผลิตเข้ากติกาเดียวกัน — predicate ตัวเดียวที่หน้าเว็บกับ route ใช้ร่วม
  const costing = read('src/app/sa/costing/[id]/page.js');
  const costingRoute = read('src/app/api/sa/costing/[id]/withdraw/route.js');
  assert.match(costing, /canWithdraw = canWithdrawCostingRequest\(/);
  assert.match(costingRoute, /withdrawFromExecError\(before, user\)/);

  // ตรรกะเดิมที่ยอมให้ผู้อนุมัติ/ผู้รีวิวดึงกลับต้องไม่หลงเหลือ
  assert.doesNotMatch(qt, /approvalRequestedBy === quote\?\.meId \|\| !!quote\?\.canApprove/);
  assert.doesNotMatch(so, /order\.submittedBy === order\.meId \|\| reviewer/);
});

// B5 ทางเลือก i (มติ 2026-07-26): อนุมัติ = ถือว่าส่งลูกค้าแล้ว (mig 0165)
// ปุ่ม "ส่งให้ลูกค้า" เดิมไม่ส่งอีเมล ไม่แจ้งเตือน แค่เปลี่ยนตัวอักษรบนป้ายสถานะ
test('the redundant ส่งให้ลูกค้า button is gone and Won takes the primary slot', () => {
  const qt = read('src/app/sales-planning/quotations/[id]/page.js');

  // เจาะจงที่ปุ่ม — ข้อความอธิบายสถานะยังพูดถึง "ถือว่าส่งให้ลูกค้าแล้ว" ได้ตามปกติ
  assert.doesNotMatch(qt, /label: "ส่งให้ลูกค้า"/);
  assert.doesNotMatch(qt, /sendToCustomer/);
  assert.doesNotMatch(qt, /id: "send-customer"/);

  // Won ต้องอยู่ใน primaryAction ไม่ใช่แถว secondary — ใบที่อนุมัติแล้วเคยไม่มีปุ่มหลักเลย
  assert.match(qt, /: canCloseWon\s+\? \{\s+id: "won",/);
  assert.doesNotMatch(qt, /id: "won",\s+kind: "approve",\s+label: "Won",\s+variant: "outline"/);
});
