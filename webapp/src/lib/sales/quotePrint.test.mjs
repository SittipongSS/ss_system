import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildQuotePrintHTML,
  openQuotePrintWindow,
  prepareQuotePrintWindow,
  showQuotePrintError,
} from './quotePrint.js';

const originalWindow = globalThis.window;
test.afterEach(() => {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
});

function fakePrintWindow() {
  const writes = [];
  return {
    opener: {},
    closed: false,
    document: {
      open() { writes.length = 0; },
      write(value) { writes.push(value); },
      close() {},
    },
    writes,
  };
}

test('prepareQuotePrintWindow opens a writable preview tab synchronously', () => {
  const target = fakePrintWindow();
  let openArgs;
  globalThis.window = {
    open(...args) { openArgs = args; return target; },
    alert() { assert.fail('popup should open'); },
  };

  const result = prepareQuotePrintWindow();
  assert.equal(result, target);
  assert.equal(target.opener, null);
  assert.equal(openArgs[0], '');
  assert.equal(openArgs[1], '_blank');
  assert.equal(openArgs.length, 2);
  assert.match(target.writes.join(''), /กำลังเตรียมเอกสาร/);
});

test('openQuotePrintWindow renders into a window prepared during the click', () => {
  const target = fakePrintWindow();
  const result = openQuotePrintWindow({
    quoteNumber: 'QT-001', quoteDate: '2026-07-15', customerName: 'Test',
    lines: [], subtotal: 0, totalAmount: 0, vatRate: 0,
  }, target);

  assert.equal(result, target);
  assert.match(target.writes.join(''), /QT-001/);
  assert.match(target.writes.join(''), /window\.print/);
});

test('quotation print uses the Project Timeline document design system', () => {
  const html = buildQuotePrintHTML({
    quoteNumber: 'QT-001', quoteDate: '2026-07-15', customerName: 'Test',
    lines: [], subtotal: 0, totalAmount: 0, vatRate: 7, vatAmount: 0,
  });

  assert.match(html, /class="toolbar no-print"/);
  assert.match(html, /class="sheet"/);
  assert.match(html, /class="doc-top"/);
  assert.match(html, /class="header-grid"/);
  assert.match(html, /บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด/);
  assert.match(html, /QT-001<\/span><span>15\.07\.2026/);
  assert.doesNotMatch(html, /<span>วันที่ 15\.07\.2026/);
  assert.match(html, /background: #e8e2d9/);
  assert.match(html, /size: A4 portrait/);
});

test('quotation print shows the selected document people with legacy fallback', () => {
  const html = buildQuotePrintHTML({
    quoteNumber: 'QT-002', quoteDate: '2026-07-15', customerName: 'Test',
    lines: [], subtotal: 0, totalAmount: 0, vatRate: 0,
    createdByName: 'ผู้สร้างใบ',
    metadata: { aeOwner: 'สมชาย ดูแล', preparedBy: 'สมหญิง จัดทำ', aeSupervisor: 'สมศักดิ์ ตรวจสอบ' },
  });
  assert.match(html, /ผู้ดูแล \(AE\)<\/span><span class="v">สมชาย ดูแล/);
  assert.match(html, /สมหญิง จัดทำ<\/div><div class="role">ผู้จัดทำ \/ ผู้เสนอราคา/);
  assert.match(html, /สมศักดิ์ ตรวจสอบ<\/div><div class="role">ผู้ตรวจสอบ \/ ผู้อนุมัติ/);

  // ใบเก่าไม่มี metadata: ผู้จัดทำ fallback เป็นผู้สร้างใบ, ไม่มีบรรทัดผู้ดูแล
  const legacy = buildQuotePrintHTML({
    quoteNumber: 'QT-003', lines: [], subtotal: 0, totalAmount: 0, vatRate: 0,
    createdByName: 'ผู้สร้างใบ',
  });
  assert.match(legacy, /ผู้สร้างใบ<\/div><div class="role">ผู้จัดทำ \/ ผู้เสนอราคา/);
  assert.doesNotMatch(legacy, /ผู้ดูแล \(AE\)/);
});

test('quotation print totals follow the agreed footer structure', () => {
  const html = buildQuotePrintHTML({
    quoteNumber: 'QT-004', lines: [],
    subtotal: 100000, discountType: 'amount', discountValue: 5000, discountAmount: 5000,
    vatRate: 7, vatAmount: 6650, totalAmount: 101650,
  });
  assert.match(html, /ยอดรวมสินค้า\/บริการ<\/td><td class="n">100,000\.00/);
  assert.match(html, /หัก ส่วนลด<\/td><td class="n discount">-5,000\.00/);
  assert.match(html, /ยอดหลังหักส่วนลด<\/td><td class="n">95,000\.00/);
  assert.match(html, /ภาษีมูลค่าเพิ่ม 7%<\/td><td class="n">6,650\.00/);
  assert.match(html, /ยอดรวมทั้งสิ้น<\/td><td class="n">101,650\.00 บาท/);

  // ไม่มีส่วนลด → ไม่โชว์บรรทัดหักส่วนลด/ยอดหลังหักส่วนลด
  const noDiscount = buildQuotePrintHTML({
    quoteNumber: 'QT-005', lines: [], subtotal: 100000, vatRate: 7, vatAmount: 7000, totalAmount: 107000,
  });
  assert.doesNotMatch(noDiscount, /หัก ส่วนลด<\/td>/);
  assert.doesNotMatch(noDiscount, /ยอดหลังหักส่วนลด<\/td>/);
});

test('showQuotePrintError replaces the loading page with a safe error message', () => {
  const target = fakePrintWindow();
  showQuotePrintError(target, '<โหลดไม่สำเร็จ>');
  const html = target.writes.join('');
  assert.match(html, /ไม่สามารถพิมพ์ใบเสนอราคา/);
  assert.match(html, /&lt;โหลดไม่สำเร็จ&gt;/);
  assert.doesNotMatch(html, /<โหลดไม่สำเร็จ>/);
});
