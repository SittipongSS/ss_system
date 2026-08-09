// ── เอกสาร PDR (FM-RD-01) — หัวใบและค่าที่มาตรฐานเอกสารคุม ──────────────
//
// เทสต์ชุดนี้เกิดจากบั๊กจริงสี่ตัวที่หลุดออกกระดาษพร้อมกัน เพราะไม่เคยมีใครเรนเดอร์
// เอกสารตัวนี้ในเทสต์เลย มีแต่เทสต์ของทะเบียนช่อง (pdrFields.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderPdrDocument } from './pdrDocument.js';
import { PDR_FIELDS } from './pdrFields.js';
import { COMPANY_PROFILE_FALLBACK } from '@/lib/companyProfile';

const STANDARD = {
  documentKey: 'pdr',
  titleTh: 'แบบฟอร์มคำขอพัฒนาผลิตภัณฑ์',
  titleEn: 'PRODUCT DEVELOPMENT REQUEST (PDR)',
  formCode: 'FM-RD-01',
  revision: '02',
  effectiveDate: '2026-02-06',
  accentKey: 'terracotta',
};

const render = (over = {}) => renderPdrDocument({
  request: { docNo: 'SB-26070001', customerName: 'บริษัท ตัวอย่าง จำกัด', status: 'pending' },
  briefs: [],
  company: COMPANY_PROFILE_FALLBACK,
  standard: STANDARD,
  ...over,
});

// 🐞 `company` ถูกส่งเข้าเปลือกดิบ ๆ ทั้งที่ resolveCompanyBlock คืน legalNameTh/legalNameEn
// ส่วนเปลือกอ่าน nameTh/nameEn ⇒ กระดาษที่ส่งลูกค้าขึ้นชื่อบริษัทเป็น "-"
// (billPrint/ganttPrint/reportPrint แม็ปไว้แล้วทั้งสามตัว PDR ตกขบวนตัวเดียว)
test('หัวใบขึ้นชื่อบริษัท ไม่ใช่ขีด — แม็ป legalNameTh/En เข้าเปลือก', () => {
  const html = render();
  assert.match(html, /<strong>บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด<\/strong>/);
  assert.equal(html.includes('<strong>-</strong>'), false, 'ชื่อบริษัทไทยขึ้นเป็นขีด');
  assert.equal(html.includes('<span>-</span>'), false, 'ชื่อบริษัทอังกฤษขึ้นเป็นขีด');
});

// 🐞 แถวหัวใบถูกส่งเป็นคู่ [label, value] แต่เปลือกอ่าน { label, value }
// ⇒ ได้ `<dt></dt><dd>-</dd>` สองแถว = หัวใบไม่มีทั้งเลขที่เอกสารและชื่อลูกค้า
test('หัวใบมีเลขที่เอกสารและชื่อลูกค้า — ส่งเป็น { label, value } ไม่ใช่คู่ array', () => {
  const html = render();
  assert.match(html, /<dt>เลขที่เอกสาร<\/dt><dd>SB-26070001<\/dd>/);
  assert.match(html, /<dt>ลูกค้า<\/dt><dd>บริษัท ตัวอย่าง จำกัด<\/dd>/);
  assert.equal(html.includes('<dt></dt>'), false, 'ป้ายแถวหัวใบหาย');
});

// ⭐ หน้าตั้งค่า → มาตรฐานเอกสาร ต้องคุมกระดาษได้จริง ไม่งั้นหน้านั้นไม่มีความหมาย
test('มาตรฐานที่เผยแพร่คุมรหัสฟอร์ม Rev วันที่มีผล และชื่อบนหัวใบ', () => {
  const html = render({
    standard: { ...STANDARD, formCode: 'FM-RD-09', revision: '05', effectiveDate: '2026-03-01', titleTh: 'ชื่อใหม่จากหน้าตั้งค่า' },
  });
  assert.match(html, /FM-RD-09: Rev\. No\.05\. 01\/03\/2569/);
  assert.match(html, /<h1>ชื่อใหม่จากหน้าตั้งค่า<\/h1>/);
});

test('ไม่มีมาตรฐาน = ตกไปใช้ค่าสำรอง FM-RD-01 Rev.02 — เอกสารต้องพิมพ์ได้เสมอ', () => {
  const html = render({ standard: null });
  assert.match(html, /FM-RD-01: Rev\. No\.02\. 06\/02\/2569/);
});

test('สี Accent มาจากมาตรฐาน ไม่ใช่ค่าตายตัวในไฟล์เอกสาร', () => {
  const navy = render({ standard: { ...STANDARD, accentKey: 'navy' } });
  const terracotta = render();
  const accentOf = (html) => /--doc-accent:(#[0-9a-f]{6})/.exec(html)?.[1];
  assert.notEqual(accentOf(navy), accentOf(terracotta));
});

// 🐞 `scentCount: briefs.length` ต่อไว้หลัง spread ⇒ ทับค่าจากใบสั่งขายทุกครั้ง ·
// ใบที่ AE รวบ 3 กลิ่นเป็นบรีฟเดียวจะพิมพ์ "1 กลิ่น" ทั้งที่ลูกค้าจ่ายค่าออกแบบมา 3
// (มติ 2026-08-08: จำนวนกลิ่นมาจากใบสั่งขาย ห้ามเดาจากจำนวนก้อนบรีฟ)
// ⚠️ อ่านค่าจาก **แถวของช่องนั้น** ไม่ใช่ค้นทั้งหน้า — หัวข้อ "2.1 กลิ่นที่ต้องการ"
// มีข้อความ "1 กลิ่น" อยู่ในตัวเอง การค้นทั้งหน้าจึงดับผิดตัว
const scentCountCell = (html) => /จำนวนกลิ่นที่ต้องการพัฒนา<\/th><td>([^<]*)/.exec(html)?.[1]?.trim();

test('จำนวนกลิ่นบนกระดาษมาจากใบสั่งขาย ไม่ใช่จำนวนก้อนบรีฟ', () => {
  const html = render({
    request: { docNo: 'SB-1', customerName: 'ก', status: 'pending', pdrContext: { scentCount: 3 } },
    briefs: [{ label: 'รวบเป็นก้อนเดียว' }],
  });
  assert.equal(scentCountCell(html), '3 กลิ่น');
});

test('ไม่รู้จำนวนกลิ่น = N/A ไม่ใช่เดาจากบรีฟ', () => {
  const html = render({ briefs: [{ label: 'ก' }, { label: 'ข' }] });
  assert.equal(scentCountCell(html), '');
  assert.match(html, /จำนวนกลิ่นที่ต้องการพัฒนา<\/th><td><span class="na">N\/A<\/span>/);
});

// พรีวิวในหน้าตั้งค่าฝังเป็น iframe — ปุ่มพิมพ์ในนั้นจะพิมพ์แค่ใบตัวอย่าง
test('toolbar: false ตัดแถบเครื่องมือออกสำหรับพรีวิว', () => {
  assert.equal(render().includes('toolbar no-print'), true);
  assert.equal(render({ toolbar: false }).includes('toolbar no-print'), false);
});

// ── หน้าตาตามกระดาษ FM-RD-01 ────────────────────────────────────────────
const BRIEF = {
  brief: 'กลิ่นเปิดสดชื่นแนวส้ม', inspiration: 'เช้าวันหยุด',
  scentotypes: ['cheerer'], scentotypeNotes: { cheerer: 'สดใส' }, performance: ['lasting'],
};
const sheets = (html) => (html.match(/class="sheet explicit-page"/g) || []).length;

// 🐞 เดิมทั้งใบเป็นแผ่นเดียวยาวติดกัน — ไม่ได้ห่อ `.sheet` ของเปลือกเลย ⇒ ไม่มีขอบ
// กระดาษ ไม่มีเลขหน้า ไม่มีท้ายกระดาษ และตอนสั่งพิมพ์เบราว์เซอร์ตัดหน้าเอาเองกลางตาราง
test('เอกสารแบ่งเป็นแผ่น A4 พร้อมหัวและท้ายกระดาษทุกแผ่น', () => {
  const html = render({ briefs: [BRIEF] });
  const pages = sheets(html);
  assert.ok(pages >= 2, `ควรมีมากกว่าหนึ่งแผ่น ได้ ${pages}`);
  // หัวเอกสารและท้ายกระดาษต้องมีครบทุกแผ่น ไม่ใช่เฉพาะแผ่นแรก
  assert.equal((html.match(/class="documentHeader"/g) || []).length, pages);
  assert.equal((html.match(/class="footer"/g) || []).length, pages);
  assert.match(html, new RegExp(`หน้า ${pages} / ${pages}`));
});

// ⚠️ บรีฟหลายก้อนต้องดันหน้าเพิ่ม ไม่ใช่ยัดลงแผ่นเดิมจน `overflow: hidden` กินทิ้ง
test('บรีฟยิ่งมาก หน้ายิ่งเพิ่ม — ไม่ยัดลงแผ่นเดิม', () => {
  const one = sheets(render({ briefs: [BRIEF] }));
  const many = sheets(render({ briefs: Array.from({ length: 4 }, () => BRIEF) }));
  assert.ok(many > one, `4 บรีฟต้องใช้หน้ามากกว่า 1 บรีฟ (${many} vs ${one})`);
});

// หัวข้อที่ถูกตัดกลางต้องพิมพ์ซ้ำพร้อม "(ต่อ)" — รวมถึงหน้าที่ขึ้นต้นด้วยกล่องบรีฟล้วน ๆ
test('หัวข้อที่ข้ามหน้าพิมพ์ซ้ำพร้อม (ต่อ)', () => {
  const html = render({ briefs: Array.from({ length: 4 }, () => BRIEF) });
  assert.match(html, /2\. Product Specifications \(ต่อ\)/);
  // ทุกแผ่นต้องมีหัวข้ออย่างน้อยหนึ่งอัน — แผ่นที่ไม่มีเลยคือแผ่นที่อ่านไม่รู้เรื่อง
  for (const sheet of html.split('class="sheet explicit-page"').slice(1)) {
    assert.match(sheet, /<h3>/, 'มีแผ่นที่ไม่มีหัวข้อเลย');
  }
});

// ⭐ มติผู้ใช้ 2026-08-09: หัวใบเก็บเฉพาะสิ่งที่ระบุตัวใบ · โครงการย้ายไปอยู่ในเนื้อหา
const HEADER_CTX = {
  docNo: 'SB-1',
  customerName: 'ลูกค้า ก',
  status: 'pending',
  pdrContext: { deal: 'น้ำหอมปรับอากาศ 2026', requestedAt: '2026-07-20' },
};

test('หัวใบมีแค่ เลขที่เอกสาร → ลูกค้า → วันที่', () => {
  const html = render({ request: HEADER_CTX });
  const at = (label) => html.indexOf(`<dt>${label}</dt>`);
  assert.ok(at('เลขที่เอกสาร') < at('ลูกค้า'));
  assert.ok(at('ลูกค้า') < at('วันที่'));
  assert.match(html, /<dt>วันที่<\/dt><dd>2026-07-20<\/dd>/);
  assert.equal(html.includes('<dt>โครงการ</dt>'), false, 'โครงการยังอยู่บนหัวใบ');
});

// ⭐ เอกสารของบริษัทเรียกดีลว่า "โครงการ" (QT/SO/ET/ไทม์ไลน์) ส่วนบนจอเป็น "ดีล"
// เพราะระบบมี *โครงการ* (รหัส PJ) เป็นอีกสิ่งหนึ่งจริง ๆ — ป้ายต่างกันผ่าน `docLabel`
test('โครงการอยู่ในเนื้อหา เหนือ 1.1 และใช้ป้าย "โครงการ" ไม่ใช่ "ดีล"', () => {
  const html = render({ request: HEADER_CTX });
  assert.match(html, /<th>โครงการ<\/th><td>น้ำหอมปรับอากาศ 2026<\/td>/);
  assert.equal(html.includes('<th>ดีล</th>'), false, 'เอกสารยังใช้คำว่า "ดีล"');
  // ⚠️ นำหน้าข้อ 1.1 — "งานนี้คืองานไหน" ต้องรู้ก่อนรายละเอียดผู้ติดต่อ
  assert.ok(html.indexOf('<th>โครงการ</th>') < html.indexOf('ชื่อผู้ติดต่อ'));
  // ⚠️ ป้ายในทะเบียนต้องยังเป็น "ดีล" — จอกับฟอร์มอ่านป้ายชุดนั้น
  assert.equal(PDR_FIELDS.find((f) => f.key === 'deal').label, 'ดีล');
});

// ช่องที่ประกาศ `inHeader` ต้องไม่โผล่ในตารางอีก — พิมพ์สองที่อ่านแล้วเหมือนคนละค่า
test('วันที่ร้องขอขึ้นหัวใบแล้วไม่พิมพ์ซ้ำในตาราง', () => {
  const html = render({ request: HEADER_CTX });
  assert.equal(html.includes('วันที่ร้องขอ</th>'), false, 'วันที่ร้องขอยังพิมพ์ซ้ำในตาราง');
  // ⚠️ แต่ทะเบียนต้องยังมีช่องนี้อยู่ — จอแสดงกับฟอร์มไม่มีหัวใบ ต้องโชว์ในลิสต์
  assert.ok(PDR_FIELDS.some((f) => f.key === 'requestedAt'));
});

// ⭐ กระดาษมีช่องติ๊กครบทุกตัวเลือก — พิมพ์เฉพาะตัวที่เลือกจะอ่านไม่ออกว่ามีอะไรให้เลือกอีก
test('ตัวเลือกพิมพ์ครบทุกตัวพร้อมช่องติ๊ก ตัวที่เลือกติ๊กเข้ม', () => {
  const html = render({ request: { docNo: 'SB-1', status: 'pending', pdrTexture: 'premium' } });
  assert.match(html, /<li class="on">☑ PREMIUM<\/li>/);
  assert.match(html, /<li>☐ STANDARD<\/li>/);
  // 2.1.4/2.1.5 ของบรีฟก็ต้องครบทั้งชุดเหมือนกัน
  const withBrief = render({ briefs: [BRIEF] });
  for (const label of ['CHEERER', 'ADMIRER', 'DISCOVERER', 'ENCHANTER', 'COUNSELOR']) {
    assert.ok(withBrief.includes(label), `ขาด Scentotype ${label}`);
  }
});

// ⭐ เลขข้อคือสิ่งที่ RD ใช้อ้างกันทางโทรศัพท์ ("ข้อ 2.8 ลูกค้ายังไม่ตอบ")
test('เลขข้อบนกระดาษพิมพ์นำหน้าป้าย และไม่หลุดไปอยู่บนจอ', () => {
  const html = render();
  for (const no of ['1.1', '1.10', '1.14', '2.2', '2.8', '2.9', '2.10']) {
    assert.match(html, new RegExp(`<span class="no">${no.replace('.', '\\.')}</span>`), `ขาดเลขข้อ ${no}`);
  }
  // ป้ายในทะเบียนต้องยังไม่มีเลขปน — จอกับฟอร์มอ่านป้ายชุดเดียวกันนี้
  assert.equal(PDR_FIELDS.some((f) => /^\d/.test(f.label)), false);
});

// กระดาษรวมหลายช่องไว้ในข้อเดียว (1.10 · 2.8 · 2.9) — พิมพ์แยกแถวแล้วเลขข้อจะนับไม่ตรง
test('ข้อที่กระดาษรวมไว้กล่องเดียว พิมพ์เป็นแถวเดียว', () => {
  const html = render();
  for (const [no, inside] of [
    ['1.10', ['DemoGraphic', 'PsychoGraphic', 'Painpoint']],
    ['2.8', ['ขวด', 'มีภาพประกอบ']],
    ['2.9', ['Attribute', 'Benefit', 'Value']],
  ]) {
    const row = new RegExp(`<span class="no">${no.replace('.', '\\.')}</span>[^<]*</th><td>(.*?)</td></tr>`, 's');
    const cellHtml = row.exec(html)?.[1] || '';
    for (const text of inside) assert.ok(cellHtml.includes(text), `ข้อ ${no} ขาด "${text}"`);
  }
});
