// ── ความกว้างคอลัมน์ของตารางรายการที่มีคอลัมน์ "แพ็ค/เดือน" (ITEM_TABLE_PACK_CSS · docs/qt-pack-column.md) ──────
//
// ⭐ ทำไมต้องมี: กฎของตารางรายการในแผ่นกลาง (documentShellCss) ผูกตามลำดับคอลัมน์ และแผ่นกลางถูกฝังลงเอกสารทุกชนิด
//   ค่าของคอลัมน์แพ็คจึงเป็นค่าคงที่แยก ที่ตัวพิมพ์ใบเสนอราคา/ใบสั่งขายส่งเป็น extraCss เฉพาะใบที่มีเลขแพ็ค
//   เทสต์ชุดนี้ยึดสามข้อที่ทำให้ "ใบที่ไม่มีเลขแพ็คได้ไฟล์เดิมทุกไบต์ และเอกสารชนิดอื่นไม่ขยับ":
//     1. แผ่นกลางไม่มีคำว่า withPack เลย
//     2. ค่าคงที่มี selector ครบ 11 ตัวตามนี้เป๊ะ และมีแต่ความกว้างของ td
//     3. ใบแจ้งชำระภาษี (ใช้ .itemTable เหมือนกัน) ไม่ได้ค่าชุดนี้ไป
import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_TABLE_PACK_CSS, documentShellCss, renderDocumentHTML } from './documentShell.js';
import { buildBillPrintHTML } from '../tax/billPrint.js';

/* กฎทั้งหมดในค่าคงที่ — [selector, declaration] ตามลำดับในไฟล์ */
const rulesOf = (css) => [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => [m[1].trim(), m[2].trim()]);

test('แผ่นกลางของเอกสารไม่มีกฎของคอลัมน์แพ็ค — ทั้งกระดาษแนวตั้งและแนวนอน', () => {
  for (const orientation of ['portrait', 'landscape']) {
    assert.ok(!documentShellCss(orientation).includes('withPack'), `documentShellCss('${orientation}') ต้องไม่มี withPack`);
  }
  // เอกสารที่ไม่ส่ง extraCss ได้ <style> ของแผ่นกลางล้วน ๆ — ไม่มีอะไรต่อท้าย
  const html = renderDocumentHTML({ title: 't', pages: '<article class="sheet"></article>' });
  assert.ok(html.includes(`<style>${documentShellCss('portrait')}</style>`));
  assert.ok(!html.includes('withPack'));
});

test('ITEM_TABLE_PACK_CSS: selector ครบ 11 ตัว — สองคลาส 5 ตัว (คอลัมน์ 3–7) · สามคลาส 6 ตัว (คอลัมน์ 3–8) พร้อมความกว้าง', () => {
  assert.deepEqual(rulesOf(ITEM_TABLE_PACK_CSS), [
    // แพ็ค · จำนวน · หน่วย · ราคา/หน่วย · จำนวนเงิน
    ['.itemTable.withPack td:nth-child(3)', 'width: 17mm;'],
    ['.itemTable.withPack td:nth-child(4)', 'width: 15mm;'],
    ['.itemTable.withPack td:nth-child(5)', 'width: 13mm;'],
    ['.itemTable.withPack td:nth-child(6)', 'width: 21mm;'],
    ['.itemTable.withPack td:nth-child(7)', 'width: 23mm;'],
    // แพ็ค · จำนวน · หน่วย · ราคา/หน่วย · ส่วนลด · จำนวนเงิน
    ['.itemTable.withPack.withLineDiscount td:nth-child(3)', 'width: 17mm;'],
    ['.itemTable.withPack.withLineDiscount td:nth-child(4)', 'width: 13mm;'],
    ['.itemTable.withPack.withLineDiscount td:nth-child(5)', 'width: 13mm;'],
    ['.itemTable.withPack.withLineDiscount td:nth-child(6)', 'width: 19mm;'],
    ['.itemTable.withPack.withLineDiscount td:nth-child(7)', 'width: 18mm;'],
    ['.itemTable.withPack.withLineDiscount td:nth-child(8)', 'width: 21mm;'],
  ]);
});

test('ITEM_TABLE_PACK_CSS: มีแต่ความกว้างของ td ใต้ .itemTable.withPack — ไม่มีกฎชนิดอื่นที่จะไปขยับของอย่างอื่น', () => {
  const rules = rulesOf(ITEM_TABLE_PACK_CSS);
  for (const [selector, declaration] of rules) {
    assert.match(selector, /^\.itemTable\.withPack(\.withLineDiscount)? td:nth-child\([3-8]\)$/, selector);
    assert.match(declaration, /^width: \d+mm;$/, `${selector} { ${declaration} }`);
  }
  // ทุกตัวอักษรของค่าคงที่ถูกนับเป็นกฎข้างบนแล้ว — ไม่มี @media · คอมเมนต์ · กฎครึ่งตัวซ่อนอยู่นอก { }
  const rebuilt = rules.map(([selector, declaration]) => `\n  ${selector} { ${declaration} }`).join('');
  assert.equal(ITEM_TABLE_PACK_CSS, rebuilt);
  assert.ok(!/@|\bth\b|font|\/\*/.test(ITEM_TABLE_PACK_CSS));
});

test('ชุดสามคลาสชนะกฎของแผ่นกลางด้วยน้ำหนัก ไม่ใช่ลำดับในไฟล์ — ทุกคอลัมน์ที่แผ่นกลางตั้งไว้ถูกประกาศซ้ำครบ', () => {
  // แผ่นกลางตั้งความกว้างของคอลัมน์ 3–7 ไว้ (สองชุด: ปกติ กับ withLineDiscount) — คอลัมน์ไหนที่ชุดแพ็คไม่ประกาศ
  // จะหล่นไปใช้ค่าของแผ่นกลางซึ่งหมายถึง "คอลัมน์ที่อยู่ลำดับนั้นก่อนแทรกคอลัมน์แพ็ค" = ผิดคอลัมน์
  const shell = documentShellCss('portrait');
  const shellColumns = [...shell.matchAll(/\.itemTable(?:\.withLineDiscount)? td:nth-child\((\d)\)/g)].map((m) => Number(m[1]));
  const declared = (prefix) => rulesOf(ITEM_TABLE_PACK_CSS).filter(([s]) => s.startsWith(`${prefix} td`)).map(([s]) => Number(s.match(/\((\d)\)/)[1]));
  for (const column of new Set(shellColumns.filter((n) => n >= 3))) {
    assert.ok(declared('.itemTable.withPack').includes(column), `ชุดสองคลาสต้องประกาศคอลัมน์ ${column}`);
    assert.ok(declared('.itemTable.withPack.withLineDiscount').includes(column), `ชุดสามคลาสต้องประกาศคอลัมน์ ${column}`);
  }
});

test('ใบแจ้งชำระภาษีสรรพสามิตใช้ .itemTable ของตัวเอง — ไม่มีกฎหรือคลาสของคอลัมน์แพ็ค', () => {
  const html = buildBillPrintHTML({ id: 'TAX-1', items: [], customerName: 'ลูกค้า' }, {});
  assert.ok(html.includes('class="itemTable"'), 'ใบแจ้งชำระภาษียังมีตารางรายการ');
  assert.ok(!html.includes('withPack'));
});
