// ── หัวเอกสาร: ค่าในแถวหัวใบไม่ตัดบรรทัด (ผู้ใช้ขอ 23/09: "ไม่ให้ตกบรรทัดทุกเอกสาร") ──
//
// ค่าแถวหัวใบคือเลขที่/วันที่ — เลขที่ที่ถูกตัดกลาง ("CT-SD-" / "26080001-0") อ่านเป็นคนละใบได้
// ⚠️ กฎนี้อยู่ที่เปลือกกลาง ⇒ ใช้กับ **ทุกเอกสาร** ที่ผ่านเปลือก (ใบเสนอราคา · ใบสั่งขาย ·
// สัญญา · บันทึกเพิ่มเติม · FM-SA-04 · PDR · ไทม์ไลน์ · ใบภาษี · รายงาน)
import test from 'node:test';
import assert from 'node:assert/strict';
import { documentHeader, documentShellCss } from './documentShell.js';

test('ค่าในแถวหัวใบไม่ตัดบรรทัดเป็นค่าตั้งต้น', () => {
  assert.match(documentShellCss(), /\.identityBlock dd \{[^}]*white-space: nowrap/);
  const html = documentHeader({ titleTh: 'ใบเสนอราคา', rows: [{ label: 'เลขที่', value: 'QT-26080231-0' }] });
  assert.match(html, /<dd>QT-26080231-0<\/dd>/);
});

test('แถวข้อความอิสระขอตัดบรรทัดได้ด้วย wrap: true', () => {
  assert.match(documentShellCss(), /\.identityBlock dd\.wrap \{ white-space: normal/);
  const html = documentHeader({
    titleTh: 'รายงาน',
    rows: [{ label: 'ลูกค้า', value: 'บริษัท ชื่อยาวมาก จำกัด (มหาชน)', wrap: true }],
  });
  assert.match(html, /<dd class="wrap">บริษัท ชื่อยาวมาก จำกัด \(มหาชน\)<\/dd>/);
});
