// ── เนื้อเอกสาร FM-SA-04 บนจอ (หน้าเอกสาร + หน้าออกเอกสาร): แถว "จำนวนผลิต" ของบรรทัดที่มีเลขแพ็ค ─────────────────────
//
// 🐞 ตรวจ 2026-10-09 (งวด PR-2 · docs/qt-pack-column.md): แถวนี้เป็นตัวโชว์ตัวเดียวที่ไม่มีเทสต์ยึดนิพจน์ — สองท่าแก้ผิดรอดทุกเทสต์:
//   (ก) `(linePackQtyText(order), null) ?? …`   (ข) `linePackQtyText(summary) ?? …`
//   ทั้งคู่ทำให้จอโชว์ "12 เดือน" ของบรรทัด 2 แพ็ค × 12 เดือน ขณะที่กระดาษพิมพ์ "2 แพ็ค × 12 เดือน"
//   ยามทะเบียนตัวอ่าน (linePackReaders) ขอแค่ว่าไฟล์เรียกตัวช่วยสักที่ — ไม่รู้ว่าเรียกกับอะไรและผลถูกใช้ไหม
//
// ไฟล์เป็น JSX (โหลดในเทสต์ไม่ได้) ⇒ ยึดสองชั้น: ข้อความของนิพจน์ตรงตัว + **รันนิพจน์ที่ตัดจากซอร์สจริง** กับใบที่มี/ไม่มีเลขแพ็ค
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { NA, naText } from '../../lib/format.js';
import { linePackQtyText } from '../../lib/sales/linePackView.js';

const source = await readFile(new URL('./SpecDocumentContent.js', import.meta.url), 'utf8');

/* นิพจน์ในปีกกาของ <dd> ของแถว "จำนวนผลิต" — ตัดจากซอร์ส ไม่ได้พิมพ์ซ้ำที่นี่ */
function quantityExpression() {
  const row = source.match(/<div><dt>จำนวนผลิต<\/dt><dd>\{(.+)\}<\/dd><\/div>/);
  assert.ok(row, 'ไม่เจอแถว "จำนวนผลิต" — แถวเปลี่ยนรูป ต้องแก้ตัวตัดของเทสต์นี้ให้ยังรันนิพจน์จริงได้');
  return row[1];
}
/* รันนิพจน์จริงกับ order ที่ส่งให้ — ชื่อที่นิพจน์เห็นมีสามตัวเท่านั้น (ชื่ออื่น = ReferenceError = แดง) */
const quantityText = (order) => new Function('order', 'naText', 'linePackQtyText', `return (${quantityExpression()});`)(order, naText, linePackQtyText);

test('0407 แถว "จำนวนผลิต": นิพจน์ตรงตัว — บรรทัดที่มีเลขแพ็คใช้ linePackQtyText(order) · บรรทัดอื่นนิพจน์เดิมอยู่หลัง ?? ครบ', () => {
  assert.match(source, /import \{ linePackQtyText \} from "@\/lib\/sales\/linePackView";/);
  assert.equal(
    quantityExpression(),
    'order.qty === null ? naText(null) : (linePackQtyText(order) ?? `${order.qty}${order.unit ? ` ${order.unit}` : ""}`)',
  );
  // ตัวช่วยถูกเรียกที่เดียวในไฟล์ และกับ order (ใบสั่งผลิตของ docContentSummary) — ไม่ใช่ summary / บรรทัดอื่น
  assert.deepEqual(source.match(/linePackQtyText\([^)]*\)/g), ['linePackQtyText(order)']);
  assert.match(source, /const order = summary\.order;/);
});

test('0407 แถว "จำนวนผลิต": ใบที่มีเลขแพ็คโชว์ แพ็ค × เดือน เหมือนกระดาษ (รันนิพจน์จริงจากซอร์ส)', () => {
  assert.equal(quantityText({ qty: 12, unit: 'เดือน', packQty: 2 }), '2 แพ็ค × 12 เดือน');
  assert.equal(quantityText({ qty: 12, unit: 'เดือน', packQty: '2' }), '2 แพ็ค × 12 เดือน', 'เลขแพ็คที่มาเป็นสตริงจาก JSON');
  // หน่วยของบรรทัดที่มีเลขแพ็คคือเดือนเสมอ ไม่ว่าหน่วยที่เก็บเป็นอะไร (มติ A1) · เลขหลักพันมีจุลภาค
  assert.equal(quantityText({ qty: 24, unit: 'แพ็คเกจ', packQty: 1 }), '1 แพ็ค × 24 เดือน');
  assert.equal(quantityText({ qty: 1200, unit: null, packQty: 9999 }), '9,999 แพ็ค × 1,200 เดือน');
});

test('0407 แถว "จำนวนผลิต": ใบที่ไม่มีเลขแพ็คได้ข้อความเดิมทุกตัวอักษร — ทุกค่าที่ไม่ใช่เลขแพ็ค', () => {
  // ข้อความเดิมของแถวนี้ (ก่อนมีเลขแพ็ค): `${order.qty}${order.unit ? ` ${order.unit}` : ""}` — ไม่ผ่านตัวจัดรูปตัวเลข
  for (const packQty of [undefined, null, '', '   ', 'abc', 0, '0', '02', 1.5, 10000, true]) {
    const label = `packQty=${JSON.stringify(packQty) ?? 'undefined'}`;
    assert.equal(quantityText({ qty: 12, unit: 'เดือน', packQty }), '12 เดือน', label);
    assert.equal(quantityText({ qty: 1200, unit: 'ชิ้น', packQty }), '1200 ชิ้น', label);
    assert.equal(quantityText({ qty: 12, unit: null, packQty }), '12', label);
    assert.equal(quantityText({ qty: 0, unit: 'ชิ้น', packQty }), '0 ชิ้น', label);
  }
  assert.equal(quantityText({ qty: 12, unit: 'เดือน' }), '12 เดือน', 'ไม่มีคีย์ packQty เลย (ภาพนิ่งของใบที่ออกก่อนงวดนี้)');
  // ไม่มีจำนวน = ขีด ไม่ว่ามีเลขแพ็คหรือไม่ (เอกสารที่ไม่ได้มาจากบรรทัดใบสั่งขาย)
  assert.equal(quantityText({ qty: null, unit: 'เดือน' }), NA);
  assert.equal(quantityText({ qty: null, unit: 'เดือน', packQty: 2 }), NA);
});
