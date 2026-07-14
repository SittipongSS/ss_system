import test from 'node:test';
import assert from 'node:assert/strict';
import { openQuotePrintWindow, prepareQuotePrintWindow, showQuotePrintError } from './quotePrint.js';

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

test('prepareQuotePrintWindow opens synchronously without noopener and keeps a writable reference', () => {
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
  assert.doesNotMatch(openArgs[2], /noopener/);
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

test('showQuotePrintError replaces the loading page with a safe error message', () => {
  const target = fakePrintWindow();
  showQuotePrintError(target, '<โหลดไม่สำเร็จ>');
  const html = target.writes.join('');
  assert.match(html, /ไม่สามารถพิมพ์ใบเสนอราคา/);
  assert.match(html, /&lt;โหลดไม่สำเร็จ&gt;/);
  assert.doesNotMatch(html, /<โหลดไม่สำเร็จ>/);
});
