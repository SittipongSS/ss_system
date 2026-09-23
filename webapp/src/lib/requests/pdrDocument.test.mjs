// ── เอกสาร PDR (FM-RD-01) — หัวใบและค่าที่มาตรฐานเอกสารคุม ──────────────
//
// เทสต์ชุดนี้เกิดจากบั๊กจริงสี่ตัวที่หลุดออกกระดาษพร้อมกัน เพราะไม่เคยมีใครเรนเดอร์
// เอกสารตัวนี้ในเทสต์เลย มีแต่เทสต์ของทะเบียนช่อง (pdrFields.test.mjs)
import test from 'node:test';
import assert from 'node:assert/strict';
import { PDR_PAGE_BUDGET_MM, pdrBriefBlockMm, pdrSignaturesMm, renderPdrDocument } from './pdrDocument.js';
import { PDR_FIELDS, PDR_SIGNER_FIELDS } from './pdrFields.js';
import { COMPANY_PROFILE_FALLBACK } from '@/lib/companyProfile';
import { buildStandardPreviewHTML } from '@/lib/documents/standardPreview';
import { renderProductSpecDocument } from '@/lib/sales/productSpecDocument';
import { buildQuotationMasterPreview } from '@/lib/sales/quotationMasterTemplate';
import { renderQuotationMasterDocumentHTML } from '@/lib/sales/quotationMasterDocument';
import { estimateTextLines } from '@/lib/sales/productSpecLayout';

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
  // ⭐ ป้าย "ต่อ" ทั้งสองภาษาแบบใบเสนอราคา/FM-SA-04 (มติ 23/09) — "(ต่อ)" ต่อคำไทย · "(cont.)" ต่อคำอังกฤษ
  assert.match(html, /<h3>2\. ข้อกำหนดผลิตภัณฑ์ \(ต่อ\) <span>\/ PRODUCT SPECIFICATIONS \(cont\.\)<\/span><\/h3>/);
  // ทุกแผ่นต้องมีหัวข้ออย่างน้อยหนึ่งอัน — แผ่นที่ไม่มีเลยคือแผ่นที่อ่านไม่รู้เรื่อง
  for (const sheet of html.split('class="sheet explicit-page"').slice(1)) {
    assert.match(sheet, /<h3[ >]/, 'มีแผ่นที่ไม่มีหัวข้อเลย');
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

/* ⭐ หัวข้อแบบใบเสนอราคา/FM-SA-04 (มติผู้ใช้ 2026-09-23 "ใช้ 04 / QT เป็นต้นแบบ") — "ไทย <span>/ ENGLISH</span>"
   คำไทย = ชื่อหมวดในทะเบียน (ตัวเดียวกับฟอร์ม/จอสรุป) · คำอังกฤษ = หัวข้อของกระดาษ FM-RD-01 เดิม · เลขหมวดคงเดิม
   (หมวด 1 ชื่อ "ข้อมูลลูกค้า/แบรนด์" ตามมติ 2026-09-11 — ยังเป็นคำเดิม แค่ย้ายมานำหน้า) */
test('⭐ หัวข้อสองภาษาแบบ 04/QT: คำไทยจากทะเบียนนำ · อังกฤษของกระดาษเดิมเป็นภาษารอง · เลขหมวดคงเดิม', () => {
  const html = render();
  for (const heading of [
    'ข้อมูลคำขอ <span>/ REQUEST INFORMATION</span>',
    '1. ข้อมูลลูกค้า/แบรนด์ <span>/ CUSTOMER / BRAND INFORMATION</span>',
    '2. ข้อกำหนดผลิตภัณฑ์ <span>/ PRODUCT SPECIFICATIONS</span>',
    'ข้อกำหนดด้านเอกสารและกฎระเบียบ <span>/ REGULATORY &amp; COMPLIANCE REQUIREMENTS</span>',
  ]) assert.ok(html.includes(`<h3>${heading}</h3>`), `ไม่มีหัวข้อ ${heading}`);
  // หัวช่องลงนาม = คำเดียวกับ FM-SA-04 (พจนานุกรมของใบเสนอราคา)
  assert.match(html, /<h3 class="signHeading">การตรวจสอบและอนุมัติ <span>\/ FINAL REVIEW &amp; APPROVAL<\/span><\/h3>/);
  // หัวข้ออังกฤษล้วนแบบเดิมต้องไม่เหลือ (ไม่งั้นกระดาษมีสองแบบหัวข้อปนกัน)
  assert.equal(/<h3>(Request Information|2\. Product Specifications|Final Review)/.test(html), false);
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

// 🐞 ม-151 · #1791 ต่อไทย/ต่างชาติเข้า 1.8 ผ่าน `pdrFieldText` แต่เอกสารวาดช่องเลือกเป็นกล่องติ๊กเอง
//    ⇒ จอสรุปขึ้น "ลูกค้าเก่า · ลูกค้าไทย" แต่กระดาษไม่มีไทย/ต่างชาติเลย (ผู้ใช้ทักจาก RQ-FD-26090194)
test('1.8 บนกระดาษ: กล่องติ๊กใหม่/เก่า + ไทย/ต่างชาติ ติ๊กตามทะเบียนลูกค้า', () => {
  const tick = (html, label) => {
    const m = html.match(new RegExp(`<li( class="on")?>[^<]*${label}</li>`));
    assert.ok(m, `ไม่เจอตัวเลือก ${label}`);
    return !!m[1];
  };
  const foreign = render({
    request: { kind: 'scent_dev', docNo: 'SB-1', customerName: 'X', status: 'pending', pdrCustomerKind: 'existing',
      pdrContext: { customerOrigin: 'foreign' } },
  });
  assert.equal(tick(foreign, 'ลูกค้าเก่า'), true);
  assert.equal(tick(foreign, 'ลูกค้าใหม่'), false);
  assert.equal(tick(foreign, 'ลูกค้าต่างชาติ'), true);
  assert.equal(tick(foreign, 'ลูกค้าไทย'), false);
  const thai = render({
    request: { kind: 'formula_dev', variant: 'npd', docNo: 'RQ-FD-1', customerName: 'X', status: 'pending',
      pdrCustomerKind: 'existing', pdrContext: { customerOrigin: 'thai' } },
  });
  assert.equal(tick(thai, 'ลูกค้าไทย'), true);
  assert.equal(tick(thai, 'ลูกค้าต่างชาติ'), false);
  // ใบที่ยังไม่รู้ลูกค้า = กล่องว่างทั้งคู่ (ไม่เดาว่าเป็นไทย)
  const unknown = render();
  assert.equal(tick(unknown, 'ลูกค้าไทย'), false);
  assert.equal(tick(unknown, 'ลูกค้าต่างชาติ'), false);
});


// ── หน้าตาแบบใบเสนอราคา / FM-SA-04 (มติผู้ใช้ 2026-09-23 "ปรับ เอกสาร PDR ให้ใช้ 04 / QT เป็นต้นแบบ") ──────────
const cssRules = (html) => {
  const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  return [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ selector: m[1].trim().replace(/\s+/g, ' '), body: m[2] }));
};
const declOf = (rules, selector, prop) => {
  const rule = rules.find((r) => r.selector === selector);
  assert.ok(rule, `ไม่มีกฎ ${selector}`);
  return new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`).exec(rule.body)?.[1].trim();
};
const accentUsers = (html) => cssRules(html).filter((r) => /var\(\s*--doc-accent/.test(r.body)).map((r) => r.selector).sort();

test('🔴 accent อยู่ที่ชื่อเอกสารที่เดียว — กฎที่ใช้ accent เป็นชุดเดียวกับใบเสนอราคา', () => {
  const quotation = accentUsers(renderQuotationMasterDocumentHTML(buildQuotationMasterPreview('standard', 'approved', 'v4'), { toolbar: false }));
  assert.deepEqual(quotation, ['.identityBlock h1'], 'ต้นแบบ: ใบเสนอราคาใช้ accent ที่ชื่อเอกสารเท่านั้น');
  const html = render({ briefs: [BRIEF], request: { ...NPD, kind: 'scent_dev', variant: null } });
  assert.deepEqual(accentUsers(html), quotation);
  // 🐞 เดิมเลขข้อ (.no) กับคำขยาย (.note) เป็นสี accent — ทั้งแผ่นมีจุดส้มเป็นร้อยจุด
  const own = cssRules(html).filter((r) => r.selector.includes('.pdr'));
  assert.ok(own.length > 20, 'หากฎของใบนี้ไม่เจอ (ตัวแยก CSS พัง)');
  own.forEach((r) => assert.doesNotMatch(r.body, /--doc-accent/, `${r.selector} ยังใช้ accent`));
});

test('⭐ หัวข้อ · ป้ายแถว · เส้นตาราง ชุดเดียวกับ FM-SA-04', () => {
  const pdr = cssRules(render());
  const spec = cssRules(renderProductSpecDocument({
    snapshot: {}, document: null, revision: null, company: COMPANY_PROFILE_FALLBACK, standard: null, toolbar: false,
  }));
  for (const prop of ['margin', 'color', 'font-size']) {
    assert.equal(declOf(pdr, '.pdr h3', prop), declOf(spec, '.specsheet h3', prop), `หัวข้อ ${prop}`);
  }
  for (const prop of ['color', 'font-size', 'font-weight']) {
    assert.equal(declOf(pdr, '.pdr h3 span', prop), declOf(spec, '.specsheet h3 span', prop), `ภาษารองของหัวข้อ ${prop}`);
  }
  for (const prop of ['color', 'background', 'font-weight']) {
    assert.equal(declOf(pdr, '.pdr table.kv th', prop), declOf(spec, '.specsheet table.kv th', prop), `ป้ายแถว ${prop}`);
  }
  assert.equal(
    declOf(pdr, '.pdr table.kv th, .pdr table.kv td', 'border'),
    declOf(spec, '.specsheet table th, .specsheet table td', 'border'),
    'เส้นตาราง',
  );
});

/* ⭐ ช่องลงนามแบบ QT/SO/FM-SA-04 — กล่องของเปลือก (`signatureSection`) 7 ช่อง ลำดับตามทะเบียน
   หัวกล่อง = หน่วยงาน (`paperTeam`) · บรรทัดรอง = ตำแหน่งตามทะเบียน · ชื่อที่รู้พิมพ์ในวงเล็บ · ว่าง = เส้นให้เขียนมือ */
// ช่องลงนามทุกแถว (`<section class="signatures">` แถวละหนึ่ง) → [{ cols, boxes }]
const signRows = (html) => [...html.matchAll(/<section class="signatures"( style="--sig-cols: (\d+)")?[^>]*>([\s\S]*?)<\/section>/g)]
  .map((m) => ({ cols: m[2] ? Number(m[2]) : 3, boxes: m[3].split(/<div class="(?:signed)?">/).slice(1) }));

/* ⭐ มติผู้ใช้ 2026-09-23 "final review แบ่งสองบรรทัดตามฝ่ายแล้วขยายให้กว้างพอดีกระดาษ" — แถวบนฝ่ายขาย 3 ช่อง ·
   แถวล่าง RD 4 ช่อง · แต่ละแถวแบ่งความกว้างเต็มกระดาษตามจำนวนช่องของตัวเอง (ไม่มีช่องว่างค้างท้ายแถว) */
test('⭐ ช่องลงนาม: สองแถวตามฝ่าย (ขาย 3 · RD 4) เต็มความกว้าง · ลำดับตามทะเบียน · ชื่อในวงเล็บ · ว่าง = เส้น', () => {
  const html = render({
    request: { docNo: 'SB-1', status: 'acknowledged', requestedByName: 'ก ผู้เปิดใบ', pdrSignChemist: 'ข นักเคมี' },
  });
  assert.equal(html.includes('table class="sign"'), false, 'ตารางลายเซ็นแบบเดิมยังอยู่');
  const rows = signRows(html);
  assert.equal(rows.length, 2, 'ต้องเป็นสองแถว');
  const [sales, rd] = rows;
  // จำนวนคอลัมน์ของแถว = จำนวนช่องของแถว ⇒ กล่องแบ่งเต็มความกว้าง ไม่มีช่องว่างค้าง
  assert.deepEqual([sales.cols, sales.boxes.length, rd.cols, rd.boxes.length], [3, 3, 4, 4]);
  const roleOf = (box) => /<h2>[^<]*<span>([^<]*)<\/span><\/h2>/.exec(box)?.[1].replace(/&amp;/g, '&');
  assert.deepEqual(sales.boxes.map(roleOf), ['Account Executive', ...PDR_SIGNER_FIELDS.filter((f) => f.paperRow === 'sales').map((f) => f.label)]);
  assert.deepEqual(rd.boxes.map(roleOf), PDR_SIGNER_FIELDS.filter((f) => f.paperRow === 'rd').map((f) => f.label));
  // ทะเบียนต้องระบุแถวและหน่วยงานครบทุกช่อง — ไม่งั้นช่องตกแถวผิดฝ่าย/หัวกล่องเป็นคำอังกฤษซ้ำบรรทัดรอง
  PDR_SIGNER_FIELDS.forEach((f) => {
    assert.ok(['sales', 'rd'].includes(f.paperRow), `${f.key} ไม่มี paperRow`);
    assert.ok(f.paperTeam, `${f.key} ไม่มี paperTeam`);
  });
  assert.match(sales.boxes[0], /<h2>ฝ่ายขาย <span>Account Executive<\/span><\/h2>/);
  assert.match(sales.boxes[0], /<strong>\(ก ผู้เปิดใบ\)<\/strong>/);
  const chemist = rd.boxes.find((box) => roleOf(box) === 'Product Development Chemist');
  assert.match(chemist, /<strong>\(ข นักเคมี\)<\/strong>/);
  // ช่องที่ยังไม่มีชื่อ = เส้นให้เขียนมือ ไม่ใช่ N/A (ช่องลงนามต้องเขียนมือได้)
  assert.match(sales.boxes[1], /<strong>\(_+\)<\/strong>/);
  assert.equal([...sales.boxes, ...rd.boxes].some((box) => box.includes('N/A')), false);
  // CSS: ความกว้างคอลัมน์เดินตาม --sig-cols ของแต่ละแถว (ไม่ตรึงจำนวนคอลัมน์ตายตัว)
  assert.match(html, /\.pdr \.signatures \{ grid-template-columns: repeat\(var\(--sig-cols\), minmax\(0, 1fr\)\)/);
  // Status อยู่ก้อนเดียวกับช่องลงนาม (ชิดล่างด้วยกัน · ไม่หลุดไปลอยแผ่นใหม่คนเดียว)
  const tail = html.slice(html.indexOf('<div class="signTail">'));
  assert.ok(tail.lastIndexOf('class="signatures"') < tail.indexOf('class="status"'));
  assert.match(tail, /<span class="st on">☑ In Progress<\/span>/);
});

/* 🐞 ตัวจองความสูงก้อนท้าย — วัดจริง (headless Chrome · 2026-09-23) ชื่อยาวเท่ากันทั้ง 7 ช่อง · ก้อน .signTail ทั้งก้อน
   ตัวจองต้อง ≥ ที่วัดได้ทุกความยาว ไม่งั้นแผ่นสุดท้ายที่เต็มพอดีจะโดน overflow: hidden ตัดช่องลงนามแถวล่างทิ้ง
   (ก่อนมีตัวนี้ ชื่อ 80 ตัวขึ้นไปล้นแผ่นจริง — ช่องชื่อรับได้ 200) */
test('🔴 ตัวจองความสูงช่องลงนาม ≥ ความสูงที่วัดจริงทุกความยาวชื่อ (ไทย/ละติน/ตัวพิมพ์ใหญ่ 16–200 ตัว · สองแถวตามฝ่าย)', () => {
  const th = 'กนกวรรณ ประเสริฐศักดิ์สิทธิ์วงศ์ไพบูลย์สุขสวัสดิ์มหาศาลรุ่งเรืองกิจเจริญยิ่งยงคงกระพันชาตรีพิพัฒน์ '.repeat(5);
  const en = 'Christopher Alexander Montgomery Smith Johnson Williamson Richardson '.repeat(5);
  const c36 = 'MR. WORAWUT WONGWATTANAKUL (MANAGER)';
  const c82 = 'MR. WORAWUT WONGWATTANAKUL (MANAGER) / MS. WILHELMINA MAXWELL-WOODWARD (DIRECTOR)';
  const mw = 'MW'.repeat(100);
  // [ชื่อ, ความยาว, วัดได้เมื่อทุกช่องชื่อนี้, วัดได้เมื่อเฉพาะแถวขายชื่อนี้ (แถว RD ชื่อสั้น)] — รอบวัด 23/09 (แถวละฝ่าย)
  const MEASURED = [
    [th, 16, 87.31, 87.31], [th, 30, 87.31, 87.31], [th, 34, 91.81, 87.31], [th, 60, 96.31, 91.81],
    [th, 80, 100.81, 91.81], [th, 120, 109.8, 96.31], [th, 200, 132.56, 105.3],
    [en, 16, 87.31, 87.31], [en, 26, 87.31, 87.31], [en, 28, 91.81, 87.31], [en, 40, 96.31, 91.81],
    [en, 50, 100.81, 91.81], [en, 80, 105.3, 91.81], [en, 120, 119.06, 96.31], [en, 200, 146.31, 109.8],
    // 🐞 ผลตรวจก่อน merge: ตัวพิมพ์ใหญ่ละตินกว้างกว่าที่รอบแรกเดา (22 ตัว/บรรทัด) — ตกบรรทัดเร็วกว่า
    [c36, 36, 100.81, 91.81], [c82, 82, 114.3, 96.31], [mw, 200, 173.3, 123.56],
  ];
  const columns = ['requestedByName', ...PDR_SIGNER_FIELDS.map((f) => f.column)];
  const rdColumns = PDR_SIGNER_FIELDS.filter((f) => f.paperRow === 'rd').map((f) => f.column);
  for (const [source, length, allMm, salesMm] of MEASURED) {
    const name = source.slice(0, length);
    const all = Object.fromEntries(columns.map((c) => [c, name]));
    const salesOnly = { ...all, ...Object.fromEntries(rdColumns.map((c) => [c, 'สั้น'])) };
    assert.ok(pdrSignaturesMm(all) >= allMm, `ชื่อ ${length} ตัวทุกช่อง: จอง ${pdrSignaturesMm(all)} < วัดได้ ${allMm}`);
    assert.ok(pdrSignaturesMm(salesOnly) >= salesMm, `ชื่อ ${length} ตัวแถวขาย: จอง ${pdrSignaturesMm(salesOnly)} < วัดได้ ${salesMm}`);
  }
  /* 🐞 ผลตรวจก่อน merge (mutation): ชุดข้างบนมีแค่ "ทุกช่องชื่อเดียวกัน" กับ "แถวขายยาว" ⇒ ตัวจองที่สลับความกว้างสองแถว
     หรืออ่านแค่ช่องแรกของแถวก็ยังผ่าน · เพิ่ม "แถว RD ยาวอย่างเดียว" และ "ชื่อยาวช่องเดียว" (ไม่ใช่ช่องแรกของแถว) */
  const email = 'worawut.wongwattanakul.research.and.development.supervisor@scentandsense-laboratory.co.th'.repeat(3).slice(0, 200);
  const rd = PDR_SIGNER_FIELDS.filter((f) => f.paperRow === 'rd').map((f) => f.column);
  const only = (cols, name) => Object.fromEntries(cols.map((c) => [c, name]));
  for (const [request, mm, label] of [
    [only(rd, th.slice(0, 34)), 91.81, 'RD ไทย 34'], [only(rd, th.slice(0, 200)), 114.3, 'RD ไทย 200'],
    [only(rd, en.slice(0, 200)), 123.56, 'RD ละติน 200'], [only(rd, c82), 105.3, 'RD ตัวพิมพ์ใหญ่ 82'],
    [{ pdrSignFinalApprover: email }, 123.56, 'Final Approver อีเมล 200'], [{ pdrSignSalesManager: email }, 109.8, 'S&M Manager อีเมล 200'],
    [{ requestedByName: email }, 109.8, 'AE อีเมล 200'], [{ pdrSignChemist: en.slice(0, 200) }, 123.56, 'Chemist ละติน 200'],
  ]) assert.ok(pdrSignaturesMm(request) >= mm, `${label}: จอง ${pdrSignaturesMm(request)} < วัดได้ ${mm}`);
  // ช่องว่างทั้งหมด = ก้อนฐาน (วัดได้ 87.31)
  assert.ok(pdrSignaturesMm({}) >= 87.31);
});

/* ตัวจองลงนามนับเฉพาะบรรทัดชื่อ — หัวกล่อง (หน่วยงาน 8pt) กับบรรทัดตำแหน่ง (6.8pt) ต้องบรรทัดเดียวในช่องที่แคบที่สุด (แถว RD
   สี่ช่อง ~40mm) · ทะเบียนเปลี่ยนคำจนตกบรรทัดเมื่อไร ก้อนท้ายสูงเกินที่จองเงียบ ๆ ⇒ เทสต์นี้แดงก่อน */
test('หัวกล่อง/ตำแหน่งของช่องลงนามทุกช่องบรรทัดเดียวในช่องสี่ช่องต่อแถว', () => {
  for (const f of PDR_SIGNER_FIELDS) {
    assert.equal(estimateTextLines(f.paperTeam, 40, 8), 1, `หัวกล่อง ${f.paperTeam} ตกบรรทัด`);
    assert.equal(estimateTextLines(f.label, 40, 6.8), 1, `ตำแหน่ง ${f.label} ตกบรรทัด`);
  }
});

test('CSS ที่ตัวจองพึ่ง: กล่องบรีฟสองคอลัมน์เท่ากันเสมอ · ข้อความตัดคำกลางได้ · ชื่อผู้เซ็นตัดในช่อง', () => {
  const html = render({ briefs: [BRIEF] });
  const rules = cssRules(html);
  // 🐞 ผลตรวจก่อน merge: 1fr ให้ URL ยาวในชื่อบรีฟ/โน้ต Scentotype ถ่างคอลัมน์ (69/116mm) ⇒ กล่องสูงเกินที่จอง 45–83mm
  assert.equal(declOf(rules, '.pdr .briefBlock', 'grid-template-columns'), 'minmax(0, 1fr) minmax(0, 1fr)');
  for (const selector of ['.pdr .briefBlock h4', '.pdr .opts li', '.pdr .subHead', '.pdr .subBody', '.pdr .signatures strong']) {
    assert.equal(declOf(rules, selector, 'overflow-wrap'), 'anywhere', `${selector} ต้องตัดคำกลางได้`);
  }
  assert.equal(declOf(rules, '.pdr .prodRight', 'grid-template-columns'), 'minmax(0, 1fr) minmax(0, 1fr)');
});

// 🐞 หัวข้อค้างท้ายแผ่นโดยไม่มีแถวตาม — ตัวแบ่งหน้าเดิมบวกแค่แถวบรรทัดเดียวตอนตัดสินใจ ⇒ ใบตัวอย่างในหน้าตั้งค่า
//    มี "Regulatory & Compliance Requirements" ค้างท้ายหน้า 3 ส่วนแถวแรก (ช่องติ๊ก 7 ตัว) ขึ้นหน้า 4 ไปคนเดียว
test('🔴 หัวข้อไม่ค้างท้ายแผ่น — ตัวแบ่งหน้าคิดก้อนแรกที่ตามมาจริง', () => {
  const cases = [
    buildStandardPreviewHTML('pdr', null),
    render({ briefs: [BRIEF, BRIEF], request: { ...NPD, kind: 'scent_dev', variant: null, pdrDocuments: ['coa', 'msds', 'ifra', 'fda', 'halal', 'export', 'other'] } }),
    render({ request: { ...NPD, targets: Array.from({ length: 5 }, () => TARGET) } }),
  ];
  for (const html of cases) {
    for (const sheet of html.split('<div class="sheetContent">').slice(1)) {
      const content = sheet.split('<footer class="footer">')[0];
      assert.doesNotMatch(content, /<\/h3>\s*<\/div>\s*<\/article>|<\/h3>\s*<\/div>\s*$/, 'มีแผ่นที่จบด้วยหัวข้อ');
    }
  }
});

// ── บรีฟยาว (ตรวจ 2026-09-23 · PDR จริง 35 ใบ อ่านอย่างเดียว) ─────────────────────────────────────────
// 🐞 กล่องบรีฟตัดกลางไม่ได้ และต้นทุนเดิมนับ 75 ตัว/บรรทัดโดยไม่นับการขึ้นบรรทัดใหม่ ⇒ สามใบจริงพิมพ์บรีฟหายใต้
//    overflow: hidden ของแผ่น (RQ-SB-26090014 154+232mm · RQ-SB-26090185 80mm · RQ-SB-26090097 สี่แผ่น)
const THAI_RUN = 'กลิ่นเปิดสดชื่นแนวส้มเบอร์กาม็อทตามด้วยกลิ่นดอกไม้ขาวบางๆจบด้วยมัสก์นุ่มให้ความรู้สึกอบอุ่น';
const LATIN_RUN = 'Anticipation movement air a quiet spark getting closer effortless warm bright confident ';
const fillTo = (src, n) => src.repeat(Math.ceil(n / src.length)).slice(0, n);
const numbered = (n) => Array.from({ length: n }, (_, i) => `- บรรทัดที่ ${i + 1}`).join('\n');

/* ความสูงกล่องบรีฟที่วัดจริง (headless Chrome · zoom 1 · จอ = สื่อพิมพ์ · 2026-09-23) — ตัวจองต้อง ≥ ทุกกรณี
   (จองต่ำ = กล่องล้นแผ่นแล้วถูกตัดเงียบ ๆ) */
test('🔴 ต้นทุนกล่องบรีฟ ≥ ความสูงที่วัดจริง (สั้น · ไทยยาว · ขึ้นบรรทัดถี่ · คอลัมน์ขวายาว · โน้ต Scentotype)', () => {
  const MEASURED = [
    [{ brief: 'กลิ่นเปิดสดชื่นแนวส้ม', inspiration: 'เช้าวันหยุด', scentotypes: ['cheerer'], scentotypeNotes: { cheerer: 'สดใส' }, performance: ['lasting'] }, 89.96],
    [{ brief: fillTo(THAI_RUN, 1500), inspiration: fillTo(THAI_RUN, 400) }, 133.35],
    [{ brief: numbered(30) }, 167.75],
    [{ brief: 'สั้น', inspiration: fillTo(LATIN_RUN, 900), likedNotes: fillTo(THAI_RUN, 600) }, 192.62],
    [{
      label: fillTo(THAI_RUN, 120),
      scentotypes: ['cheerer', 'admirer', 'discoverer', 'enchanter', 'counselor'],
      scentotypeNotes: { cheerer: fillTo(THAI_RUN, 200), admirer: fillTo(LATIN_RUN, 200), discoverer: fillTo(THAI_RUN, 200), enchanter: fillTo(LATIN_RUN, 200), counselor: fillTo(THAI_RUN, 200) },
    }, 163.25],
  ];
  for (const [brief, mm] of MEASURED) {
    const est = pdrBriefBlockMm(brief, 0, 1);
    assert.ok(est >= mm, `จอง ${est.toFixed(2)} < วัดได้ ${mm}`);
  }
});

const cellTexts = (html, th) => [...html.matchAll(/<tr><th>([\s\S]*?)<\/th><td class="pre">([\s\S]*?)<\/td><\/tr>/g)]
  .filter((m) => m[1].includes(th))
  .map((m) => m[2].replace(/<strong class="lead">[\s\S]*?<\/strong>/, ''));
const squash = (text) => text.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, '');

/* ⭐ มติผู้ใช้ 2026-09-23 (ถามจากภาพก่อน/หลัง RQ-SB-26090185 "แยกทำไม บรีฟมันจัดกลุ่มอยู่มั้ย") — บรีฟที่ยาวกว่าหนึ่งแผ่น
   ต้อง **ยังเป็นกล่องสองคอลัมน์ของบรีฟเดียวกัน** ต่อข้ามแผ่น (หัวกล่อง "(ต่อ)") ไม่ใช่แตกเป็นแถวตาราง */
const briefSegments = (html) => [...html.matchAll(/<section class="briefBlock( cont)?">([\s\S]*?)<\/section>/g)]
  .map((m) => ({ cont: Boolean(m[1]), body: m[2] }));
const subBodies = (segments, label) => segments.flatMap((seg) => [...seg.body.matchAll(
  /<span class="subHead">(?:<span class="no">[^<]*<\/span>)?([^<]*)<\/span><span class="subBody">([\s\S]*?)<\/span><\/div>/g,
)].filter((m) => m[1].startsWith(label)).map((m) => m[2]));

test('🔴 บรีฟที่สูงกว่าหนึ่งแผ่น: ต่อข้ามแผ่นเป็นกล่องสองคอลัมน์เดิมพร้อม "(ต่อ)" · ข้อความครบทุกตัว ไม่มีอะไรหายจากกระดาษ', () => {
  const brief = {
    label: 'ยาวสุดเพดาน',
    brief: `${numbered(40)}\n${fillTo(THAI_RUN, 2000)}\n${fillTo(LATIN_RUN, 1200)}`.slice(0, 4000),
    inspiration: fillTo(THAI_RUN, 2000),
    likedNotes: fillTo(LATIN_RUN, 2000),
    dislikedNotes: 'หวานจัด',
    performance: ['lasting'],
  };
  assert.ok(pdrBriefBlockMm(brief, 0, 1) > PDR_PAGE_BUDGET_MM.rest, 'กรณีทดสอบต้องสูงกว่าหนึ่งแผ่นจริง');
  const html = render({ briefs: [brief] });
  const segments = briefSegments(html);
  assert.ok(segments.length >= 2, 'บรีฟ 4,000 ตัวต้องต่อข้ามแผ่น');
  // ทุกท่อนเป็นกล่องสองคอลัมน์ (ซ้าย/ขวา) ของบรีฟเดียวกัน — ไม่มีแถวตารางของบรีฟ
  segments.forEach((seg) => assert.ok(seg.body.includes('class="briefLeft"') && seg.body.includes('class="briefRight"')));
  assert.equal(html.includes('<td class="pre">'), false, 'บรีฟต้องไม่แตกเป็นแถวตาราง');
  assert.deepEqual(segments.map((seg) => seg.cont), [false, ...segments.slice(1).map(() => true)]);
  assert.match(segments[0].body, /<h4>2\.1 กลิ่นที่ต้องการ \/ บรีฟกลิ่น — ยาวสุดเพดาน<\/h4>/);
  segments.slice(1).forEach((seg) => assert.match(seg.body, /<h4>2\.1 กลิ่นที่ต้องการ \/ บรีฟกลิ่น — ยาวสุดเพดาน \(ต่อ\)<\/h4>/));
  // ต่อทุกท่อนกลับแล้วได้ข้อความครบ (ตัดที่ขอบคำ ไม่ตกหล่น ไม่ซ้ำ) — ทั้งบรีฟ (ซ้าย) และข้อย่อยที่ถูกตัดกลาง (ขวา)
  const briefParts = segments.flatMap((seg) => [...seg.body.matchAll(/<p class="briefText">([\s\S]*?)<\/p>/g)].map((m) => m[1]));
  assert.equal(squash(briefParts.join('')), squash(brief.brief), 'บรีฟไม่ครบ');
  for (const [label, text] of [['แรงบันดาลใจ', brief.inspiration], ['ช่วงกลิ่นที่ชื่นชอบ', brief.likedNotes]]) {
    const parts = subBodies(segments, label);
    assert.ok(parts.length >= 1, `ไม่มี ${label}`);
    assert.equal(squash(parts.join('')), squash(text), `${label} ไม่ครบ`);
  }
  // ข้อย่อยที่ถูกตัดกลาง ป้ายซ้ำบนท่อนถัดไปพร้อม "(ต่อ)"
  assert.ok(segments.slice(1).some((seg) => /<\/span>(แรงบันดาลใจ|ช่วงกลิ่นที่ชื่นชอบ)[^<]* \(ต่อ\)<\/span>/.test(seg.body)));
  // 2.1.4/2.1.5 ยังพิมพ์ครบทุกตัวเลือก ครั้งเดียว
  assert.equal((html.match(/<span class="no">2\.1\.4<\/span>Performance/g) || []).length, 1);
  assert.equal((html.match(/<span class="no">2\.1\.5<\/span>Scentotype/g) || []).length, 1);
  assert.match(html, /<li class="on">☑ กลิ่นติดทน/);
  for (const label of ['CHEERER', 'ADMIRER', 'DISCOVERER', 'ENCHANTER', 'COUNSELOR']) assert.ok(html.includes(label));
});

test('บรีฟที่ลงหนึ่งแผ่นได้ยังเป็นกล่องสองคอลัมน์ตามกระดาษ', () => {
  const html = render({ briefs: [BRIEF] });
  assert.ok(html.includes('<section class="briefBlock">'));
  assert.equal(html.includes('<td class="pre">'), false);
});

// 🐞 ผลตรวจก่อน merge: แท็บ (วางจาก Excel/Sheets) วาดกว้างถึงจุดหยุด 8 ช่อง แต่ตัวประมาณนับเท่าช่องว่างเดียว ⇒ บรีฟล้นแผ่น
test('🔴 แท็บในบรีฟแปลงเป็นช่องว่างก่อนทั้งวาดและประมาณ — สองฝั่งนับของชิ้นเดียวกัน', () => {
  const row = ['Top', 'Bergamot', 'Lemon', 'Mandarin', 'Grapefruit', 'Neroli', '10%', 'สดชื่น'];
  const tabbed = Array.from({ length: 12 }, () => row.join('\t')).join('\n');
  const spaced = Array.from({ length: 12 }, () => row.join('    ')).join('\n');
  assert.equal(pdrBriefBlockMm({ brief: tabbed }), pdrBriefBlockMm({ brief: spaced }));
  for (const briefs of [[{ brief: tabbed, inspiration: `a\tb` }], [{ brief: Array.from({ length: 90 }, () => row.join('\t')).join('\n') }]]) {
    const html = render({ briefs });
    assert.equal(html.replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '').includes('\t'), false, 'ยังมีแท็บหลุดลงกระดาษ');
  }
});

// 🐞 ผลตรวจก่อน merge: CR เดี่ยว (HTML ตีเป็นขึ้นบรรทัด) กับ NBSP (Chrome ไม่ตัดตรงนั้น) — ประมาณไม่ตรงกับที่วาด ⇒ แปลงก่อน
test('🔴 CR เดี่ยว / CRLF / NBSP ในบรีฟแปลงก่อนทั้งวาดและประมาณ', () => {
  const lines = Array.from({ length: 30 }, (_, i) => `บรรทัด ${i + 1}`);
  assert.equal(pdrBriefBlockMm({ brief: lines.join('\r') }), pdrBriefBlockMm({ brief: lines.join('\n') }));
  assert.equal(pdrBriefBlockMm({ brief: lines.join('\r\n') }), pdrBriefBlockMm({ brief: lines.join('\n') }));
  assert.equal(pdrBriefBlockMm({ inspiration: 'หอม\u00a0สดชื่น'.repeat(80) }), pdrBriefBlockMm({ inspiration: 'หอม สดชื่น'.repeat(80) }));
  const html = render({ briefs: [{ brief: lines.join('\r'), inspiration: 'หอม\u00a0สดชื่น' }] })
    .replace(/<style>[\s\S]*?<\/style>|<script>[\s\S]*?<\/script>/g, '');
  assert.equal(/[\r\u00a0]/.test(html), false);
});

// 🐞 ผลตรวจก่อน merge: คำเดียวยาวกว่าที่เหลือ (ไม่มีขอบคำ) ตัดไม่ได้เลย ⇒ วางทั้งก้อนแล้วล้นแผ่น · ถอยไปตัดระดับตัวอักษร
test('🔴 บรีฟที่เป็นคำเดียวยาว (ไม่มีขอบคำ) ยังต่อข้ามแผ่นได้ และข้อความครบ', () => {
  const brief = { brief: '1234567890'.repeat(400), inspiration: 'W'.repeat(2000) };
  const html = render({ briefs: [brief] });
  const segments = briefSegments(html);
  assert.ok(segments.length >= 2);
  const briefParts = segments.flatMap((seg) => [...seg.body.matchAll(/<p class="briefText">([\s\S]*?)<\/p>/g)].map((m) => m[1]));
  assert.equal(squash(briefParts.join('')), brief.brief);
  assert.equal(squash(subBodies(segments, 'แรงบันดาลใจ').join('')), brief.inspiration);
});

// 🐞 ผลตรวจก่อน merge (มีมาก่อนรอบนี้): 2.9 สามช่อง × 2,000 ตัวเป็นแถวเดียวที่สูงกว่าแผ่น ⇒ ท้ายข้อความถูกตัดทิ้ง
test('🔴 แถวข้อที่สูงกว่าหนึ่งแผ่น (2.9 เต็มเพดาน) แยกเป็นแถวรายช่องที่ตัดข้ามแผ่นได้ · ข้อความครบ', () => {
  const request = {
    kind: 'scent_dev', docNo: 'SB-1', status: 'pending',
    pdrVpAttribute: fillTo(THAI_RUN, 2000), pdrVpBenefit: fillTo(LATIN_RUN, 2000), pdrVpValue: fillTo(THAI_RUN, 2000),
  };
  const html = render({ request });
  const rows = [...html.matchAll(/<tr><th><span class="no">2\.9<\/span>Value Proposition( \(ต่อ\))?<\/th><td class="pre">([\s\S]*?)<\/td><\/tr>/g)];
  assert.ok(rows.length > 3, `ต้องแตกเป็นหลายแถว ได้ ${rows.length}`);
  // หัวตัวหนาของแต่ละช่อง (☑ ชื่อช่อง) อยู่ส่วนแรกของช่องนั้นส่วนเดียว
  for (const label of ['Attribute', 'Benefit', 'Value']) {
    assert.equal(rows.filter((m) => new RegExp(`<strong class="lead">☑ ${label} `).test(m[2])).length, 1, `หัวช่อง ${label}`);
  }
  // ต่อทุกส่วนกลับแล้วได้ข้อความครบทั้งสามช่อง (ไม่ตกหล่น ไม่ซ้ำ)
  const joined = squash(rows.map((m) => m[2].replace(/<strong class="lead">[\s\S]*?<\/strong>/, '')).join(''));
  assert.equal(joined, squash(request.pdrVpAttribute + request.pdrVpBenefit + request.pdrVpValue));
  // ใบปกติ (ข้อความสั้น) ยังเป็นแถวเดียวตามกระดาษ
  const short = render({ request: { ...request, pdrVpAttribute: 'สั้น', pdrVpBenefit: '', pdrVpValue: '' } });
  assert.equal((short.match(/<span class="no">2\.9<\/span>/g) || []).length, 1);
});
