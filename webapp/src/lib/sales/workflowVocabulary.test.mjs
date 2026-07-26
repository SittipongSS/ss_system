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
  assert.match(buttons, /withdraw: \{ cls: "btn-secondary", Icon: Undo2, label: "ดึงกลับมาแก้ไข" \}/);
  assert.match(buttons, /revise: \{ cls: "btn-secondary", Icon: Copy, label: "ออก Rev\." \}/);

  const qt = read('src/app/sales-planning/quotations/[id]/page.js');
  const so = read('src/app/sales-planning/sales-orders/[id]/page.js');
  assert.match(qt, /label: "ตีกลับให้แก้ไข"/);
  assert.match(so, /label: "ตีกลับให้แก้ไข"/);
});

// "ถอด" ยังใช้ได้ในความหมายอื่นที่ไม่เกี่ยวกับ workflow — ห้ามไล่แก้เหมารวม
test('unrelated uses of ถอด are left alone', () => {
  const orders = read('src/app/api/orders/route.js');
  assert.match(orders, /ถอด VAT/);   // ถอด VAT = คิดราคาก่อนภาษี
  const deals = read('src/app/api/sales-planning/deals/[id]/route.js');
  assert.match(deals, /ถอด timeline segment/);   // ถอดออกจากโครงการ
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
