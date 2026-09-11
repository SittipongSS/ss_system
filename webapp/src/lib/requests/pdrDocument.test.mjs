// ── เอกสาร PDR (FM-RD-01) — หัวใบและค่าที่มาตรฐานเอกสารคุม ──────────────
//
// เทสต์ชุดนี้เกิดจากบั๊กจริงสี่ตัวที่หลุดออกกระดาษพร้อมกัน เพราะไม่เคยมีใครเรนเดอร์
// เอกสารตัวนี้ในเทสต์เลย มีแต่เทสต์ของทะเบียนช่อง (pdrFields.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDR_PAGE_BUDGET_MM, renderPdrDocument } from './pdrDocument.js';
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

// ⚠️ `kind` ต้องมาด้วย — บรีฟกลิ่นพิมพ์เฉพาะรูปทรงที่มีบรีฟ (พัฒนากลิ่น) ตามทะเบียนหัวข้อ
const render = (over = {}) => renderPdrDocument({
  request: { kind: 'scent_dev', docNo: 'SB-26070001', customerName: 'บริษัท ตัวอย่าง จำกัด', status: 'pending' },
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
test('หัวใบมีเลขที่คำร้องและวันที่ — ส่งเป็น { label, value } ไม่ใช่คู่ array', () => {
  const html = render();
  assert.match(html, /<dt>เลขที่คำร้อง<\/dt><dd>SB-26070001<\/dd>/);
  assert.equal(html.includes('<dt></dt>'), false, 'ป้ายแถวหัวใบหาย');
});

/* ⭐ **เลขที่เอกสารของฝ่าย RD อยู่เหนือเลขที่คำร้อง** (มติผู้ใช้ 2026-08-20 ·
   IS-26080030 ข้อ 1) — อ่านคู่กับรหัสแบบฟอร์มบรรทัดบนได้เป็น FM-RD-01-200869-016
   ⚠️ **ลำดับสำคัญ** ไม่ใช่แค่ "มีอยู่" — สองเลขหน้าตาไม่เหมือนกันก็จริง แต่คนที่ชิน
   กับกระดาษเดิมกวาดตาหาเลข ISO ที่บรรทัดแรกของบล็อกเสมอ */
test('หัวใบ: เลขที่เอกสาร (DDMMYY-XXX) มาก่อนเลขที่คำร้อง', () => {
  const html = render({
    request: { docNo: 'SB-26070001', pdrRefNo: '200869-016', status: 'acknowledged' },
  });
  assert.match(html, /<dt>เลขที่เอกสาร<\/dt><dd>200869-016<\/dd>/);
  assert.ok(
    html.indexOf('เลขที่เอกสาร') < html.indexOf('เลขที่คำร้อง'),
    'เลขที่เอกสารต้องอยู่เหนือเลขที่คำร้อง',
  );
});

// ใบที่ยังไม่มีใครรับเรื่องยังไม่มีเลขอ้างอิง — ต้องพิมพ์ได้ตามปกติ (ช่องว่างเป็นขีด
// ตามเปลือก ไม่ใช่ N/A ซึ่งเป็นคำของช่องในเนื้อเอกสาร)
test('ยังไม่ได้รับเรื่อง = แถวเลขที่เอกสารเป็นขีด ไม่ใช่เอกสารพัง', () => {
  const html = render();
  assert.match(html, /<dt>เลขที่เอกสาร<\/dt><dd>-<\/dd>/);
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
test('เอกสารแบ่งเป็นแผ่น A4 · หัวเอกสารเฉพาะแผ่นแรก · ท้ายกระดาษทุกแผ่น', () => {
  const html = render({ briefs: [BRIEF] });
  const pages = sheets(html);
  assert.ok(pages >= 2, `ควรมีมากกว่าหนึ่งแผ่น ได้ ${pages}`);
  // ⭐ หัวเอกสารพิมพ์แผ่นเดียว (IS-26080030 — RD ขอให้ลดจำนวนหน้า)
  assert.equal((html.match(/class="documentHeader"/g) || []).length, 1);
  // ท้ายกระดาษยังต้องมีครบทุกแผ่น — เป็นที่เดียวที่แผ่นหลัง ๆ บอกได้ว่าตัวเองคือใบไหน
  assert.equal((html.match(/class="footer"/g) || []).length, pages);
  assert.match(html, new RegExp(`หน้า ${pages} / ${pages}`));
});

// 🐞 ตัดหัวออกแล้วแต่ยังใช้งบต่อแผ่นก้อนเดิม = แผ่นหลังเว้นที่ว่างไว้เท่าหัวเอกสารทุกแผ่น
// ⇒ จำนวนหน้าไม่ลดสักแผ่น ซึ่งเป็นเหตุผลทั้งหมดที่ผู้ใช้ขอมา (IS-26080030)
// ⚠️ 60mm = ความสูงหัวเอกสารที่วัดจริง (60.06mm · รอบวัด 2026-08-20 · หัวใบ 3 แถว) — วัดใหม่เมื่อไร
// ต้องขยับทั้งงบและเลขนี้พร้อมกัน ไม่งั้นค่าใดค่าหนึ่งจะเงียบ ๆ ไม่ตรงกับกระดาษ
test('แผ่นที่ไม่มีหัวเอกสารได้งบเพิ่มเท่าความสูงหัวเอกสาร', () => {
  const { first, rest } = PDR_PAGE_BUDGET_MM;
  assert.equal(rest - first, 60, `ส่วนต่างงบต้องเท่าความสูงหัวเอกสาร (${rest} - ${first})`);
});

// ⚠️ ท้ายกระดาษเดิมมีแค่รหัสแบบฟอร์ม ซึ่งเหมือนกันทุกใบ — พอหัวเอกสารเหลือแผ่นเดียว
// แผ่นที่หลุดจากปึกจะไม่มีอะไรบอกว่ามาจากคำร้องใบไหนเลย
test('ท้ายกระดาษมีเลขที่คำร้องคู่กับรหัสแบบฟอร์ม', () => {
  const html = render({ briefs: [BRIEF] });
  const footers = html.match(/<footer class="footer">[\s\S]*?<\/footer>/g) || [];
  assert.ok(footers.length >= 2, 'ต้องมีท้ายกระดาษมากกว่าหนึ่งแผ่น');
  for (const footer of footers) {
    assert.match(footer, /FM-RD-01: Rev\. No\.02\..* · SB-26070001/);
  }
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

// ⭐ หัวใบเก็บเฉพาะตัวระบุใบ (มติผู้ใช้ 2026-08-14 ถอด "ลูกค้า" ออก ต่อจาก 08-09
// ที่ถอด "โครงการ") — ชื่อลูกค้าเป็นข้อมูลของงาน พิมพ์อยู่แล้วที่ข้อ 1.3 ชื่อบริษัท
test('หัวใบมีแค่ เลขที่เอกสาร → วันที่', () => {
  const html = render({ request: HEADER_CTX });
  const at = (label) => html.indexOf(`<dt>${label}</dt>`);
  assert.ok(at('เลขที่เอกสาร') < at('วันที่'));
  assert.match(html, /<dt>วันที่<\/dt><dd>2026-07-20<\/dd>/);
  assert.equal(html.includes('<dt>โครงการ</dt>'), false, 'โครงการยังอยู่บนหัวใบ');
  assert.equal(html.includes('<dt>ลูกค้า</dt>'), false, 'ลูกค้ายังอยู่บนหัวใบ');
  // ชื่อลูกค้าต้องยังอยู่บนกระดาษ — แค่ย้ายที่ ไม่ใช่หายไป
  assert.match(html, /<th><span class="no">1\.3<\/span>ชื่อบริษัท<\/th>/);
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
  // ⚠️ ข้อ 2.1–2.7 อยู่ในกล่องสินค้า (mig 0352) — ใบที่ไม่มีสินค้าไม่มีเลขพวกนั้นให้พิมพ์
  const html = render({
    request: { kind: 'scent_dev', docNo: 'SB-1', status: 'pending', targets: [{ categoryCode: '01-006' }] },
  });
  for (const no of ['1.1', '1.7', '1.7.1', '1.10', '1.14', '1.15', '2.1', '2.2', '2.7.3', '2.8', '2.9', '2.10']) {
    assert.match(html, new RegExp(`<span class="no">${no.replaceAll('.', '\\.')}</span>`), `ขาดเลขข้อ ${no}`);
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

// ── แบบฟอร์มรอบใหม่ (มติผู้ใช้ 2026-09-11 · mig 0352) ─────────────────────────
const TARGET = {
  categoryCode: '01-006', scentId: 'SC-1', scentCode: 'PF9120101', scentName: 'Lumière Signature',
  fOn: true, fNote: 'Woody Floral', fPricePerKg: 1800, pricePerUnit: 390,
  moqValue: 1000, moqUnit: 'ชิ้น', texture: 'standard', color: 'ใส',
  sizeValue: 100, sizeUnit: 'ml', qtyValue: 500, qtyUnit: 'ชิ้น', note: 'ขวดแก้วสีชา',
};
const NPD = {
  kind: 'formula_dev', variant: 'npd', docNo: 'RQ-FD-26090012', status: 'pending',
  targets: [TARGET, { ...TARGET, scentId: 'SC-2', scentCode: 'PF9120102', scentName: 'Lumière Lobby', sizeValue: 50 }],
  pdrContext: { scentCount: 2, customerAddress: '99/1 ถ.รัชดาภิเษก กรุงเทพฯ 10400' },
};

test('⭐ หมวด 1 ชื่อใหม่ "Customer / Brand Information · ข้อมูลลูกค้า/แบรนด์"', () => {
  assert.match(render(), /<h3>1\. Customer \/ Brand Information · ข้อมูลลูกค้า\/แบรนด์<\/h3>/);
});

test('⭐ พัฒนาสูตร NPD: ไม่มีกล่องบรีฟ · บอกว่ากลิ่นไปอยู่ไหน · กล่องสินค้าพิมพ์กลิ่นจากทะเบียน', () => {
  const html = render({ request: NPD, briefs: [BRIEF] });
  // บรีฟที่หลุดมาต้องไม่ถูกพิมพ์ — ตัวตัดสินคือทะเบียนหัวข้อ ไม่ใช่จำนวนก้อน
  assert.equal(html.includes('บรีฟกลิ่นที่'), false);
  assert.equal(html.includes('กลิ่นที่ต้องการ / บรีฟกลิ่น'), false);
  assert.match(html, /ไม่มีบรีฟกลิ่น — กลิ่นเลือกจากทะเบียนในข้อ 2\.1/);
  assert.match(html, /<h4>สินค้าที่ 1 — /);
  assert.match(html, /<h4>สินค้าที่ 2 — /);
  assert.match(html, /กลิ่น \(จากทะเบียน\)<\/span>\s*<span class="subBody">PF9120101 Lumière Signature/);
  assert.match(html, /100 ml · 500 ชิ้น/);
  assert.match(html, /1,000 ชิ้น/, 'MOQ ต้องคั่นหลักพัน');
  // 2.5 พิมพ์ครบทุกตัวเลือกพร้อมช่องติ๊ก
  assert.match(html, /<li class="on">☑ STANDARD<\/li><li>☐ PREMIUM<\/li>/);
  // 1.12 บอกว่านับจากไหน
  assert.match(html, /นับจากกลิ่นของสินค้าในข้อ 2/);
});

test('พัฒนากลิ่น: กล่องสินค้าพิมพ์ 2.1 ว่า "ตามบรีฟ" · บรีฟพิมพ์ 2.1.4 Performance ก่อน 2.1.5 Scentotype', () => {
  const html = render({
    request: { kind: 'scent_dev', docNo: 'SB-1', status: 'pending', targets: [{ ...TARGET, scentId: null }] },
    briefs: [BRIEF],
  });
  assert.match(html, /ตามบรีฟกลิ่นข้อ 2\.1 ด้านบน/);
  assert.equal(html.includes('ไม่มีบรีฟกลิ่น'), false);
  const perf = html.indexOf('<span class="no">2.1.4</span>Performance');
  const st = html.indexOf('<span class="no">2.1.5</span>Scentotype');
  assert.ok(perf > 0 && st > perf, 'ลำดับต้องเป็น 2.1.4 Performance → 2.1.5 Scentotype');
});

test('1.7 ที่อยู่ลูกค้าจากทะเบียน · 1.7.1 เปิดสวิตช์ = "ที่อยู่เดียวกับลูกค้า" · สวิตช์ไม่มีแถวของตัวเอง', () => {
  const same = render({ request: { ...NPD, pdrShipToSameAsCustomer: true, pdrShipTo: 'ค้างจากเดิม' } });
  assert.match(same, /ที่อยู่ลูกค้า<\/th><td>99\/1 ถ\.รัชดาภิเษก/);
  assert.match(same, /ที่อยู่จัดส่งตัวอย่าง<\/th><td>ที่อยู่เดียวกับลูกค้า \(ข้อ 1\.7\)/);
  assert.equal(same.includes('ส่งตัวอย่างไปที่อยู่เดียวกับลูกค้า</th>'), false, 'สวิตช์ต้องไม่มีแถวบนกระดาษ');
  // ⚠️ ใบเก่า (สวิตช์ NULL) พิมพ์ข้อความเดิมตามเดิม — ไม่ต้อง backfill
  const old = render({ request: { ...NPD, pdrShipTo: 'โกดังบางนา' } });
  assert.match(old, /ที่อยู่จัดส่งตัวอย่าง<\/th><td>โกดังบางนา/);
});

test('1.15 Archetype: พิมพ์ครบ 12 ตัว · ตัวที่ติ๊กต่อข้อความเขียนต่อ', () => {
  const html = render({
    request: { ...NPD, pdrArchetypes: ['caregiver'], pdrArchetypeNotes: { caregiver: 'ดูแลแขกเหมือนคนในบ้าน' } },
  });
  assert.match(html, /<li class="on">☑ CAREGIVER — ดูแลแขกเหมือนคนในบ้าน<\/li>/);
  for (const label of ['INNOCENT', 'EVERYMAN', 'HERO', 'EXPLORER', 'REBEL', 'LOVER', 'CREATOR', 'JESTER', 'SAGE', 'MAGICIAN', 'RULER']) {
    assert.match(html, new RegExp(`<li>☐ ${label}</li>`), `ขาด ${label}`);
  }
  assert.equal(html.includes('Archetype — เขียนต่อ</th>'), false, 'ข้อความเขียนต่อต้องไม่มีแถวแยก');
});

test('ใบที่ยังไม่มีสินค้า = แถว N/A ไม่ใช่หายไปทั้งข้อ', () => {
  const html = render({ request: { ...NPD, targets: [] } });
  assert.match(html, /<th>สินค้าที่ขอพัฒนา<\/th><td><span class="na">N\/A<\/span>/);
});

// ⚠️ สินค้ามากต้องดันหน้าเพิ่ม ไม่ใช่ยัดลงแผ่นเดิมจน `overflow: hidden` กินทิ้ง
test('สินค้ายิ่งมาก หน้ายิ่งเพิ่ม — กล่องสินค้าเข้าโมเดลต้นทุนด้วย', () => {
  const one = sheets(render({ request: { ...NPD, targets: [TARGET] } }));
  const many = sheets(render({ request: { ...NPD, targets: Array.from({ length: 8 }, () => TARGET) } }));
  assert.ok(many > one, `8 สินค้าต้องใช้หน้ามากกว่า 1 สินค้า (${many} vs ${one})`);
});
