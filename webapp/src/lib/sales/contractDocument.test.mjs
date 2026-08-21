import { test } from 'node:test';
import assert from 'node:assert/strict';

import { buildContractHTML, fillTokens, thaiContractDate } from './contractDocument';

const COMPANY = {
  legalNameTh: 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด',
  legalNameEn: 'SCENT AND SENSE LABORATORY CO., LTD.',
  address: '2/4 ซอยเพชรเกษม 35/1 แขวงบางหว้า เขตภาษีเจริญ กรุงเทพมหานคร 10160',
  taxId: '0105557081665',
  phone: '02-000-0000',
  line: '@scentandsense',
};

const CONTRACT = {
  id: 'CTR-1',
  kind: 'scent_design',
  status: 'awaiting_signature',
  contractNo: 'CT-26080001',
  contractDate: '2026-08-20',
  customerName: 'บริษัท ลา วิช บางกอก จำกัด',
  templateKey: 'scent_design',
  metadata: { quoteNumber: 'QT-26080012-0', dealTitle: 'กลิ่นใหม่ลาวิช' },
  fields: {
    contractPlace: 'บริษัท เซนท์ แอนด์ เซนส์ แลบอราทอรี่ จำกัด',
    clientName: 'บริษัท ลา วิช บางกอก จำกัด',
    clientRegNo: '0105563135135',
    clientAddress: '408/2 ซอยลาดพร้าว 94 แขวงพลับพลา เขตวังทองหลาง กรุงเทพมหานคร 10310',
    contractorSignerName: 'นางสาวรุจิรา ตระกูลยิ่งเจริญ',
    designDays: '30-45',
    revisionRounds: 2,
    replyDays: 7,
    revisionFee: 3000,
    formulaDeadlineDays: 45,
    sampleKeepCount: 3,
    termYears: 1,
  },
};

test('วันที่บนสัญญาเป็น พ.ศ. ตามรูปประโยคของต้นฉบับ', () => {
  assert.equal(thaiContractDate('2026-08-20'), '20 เดือน สิงหาคม พ.ศ. 2569');
  assert.equal(thaiContractDate(''), null);
});

test('ช่องที่ยังไม่กรอกกลายเป็นเส้นให้เขียนมือ ไม่ใช่ค่าว่างเงียบ ๆ', () => {
  assert.match(fillTokens('ผู้ว่าจ้าง {{clientName}}', {}), /_{5,}/);
  assert.equal(fillTokens('ผู้ว่าจ้าง {{clientName}}', { clientName: 'ก' }), 'ผู้ว่าจ้าง ก');
});

test('เอกสารที่เรนเดอร์มีเลขที่ · คู่สัญญา · และข้อสัญญาครบทั้งสามหมวด', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY, options: { toolbar: false } });
  assert.match(html, /CT-26080001/);
  assert.match(html, /บริษัท ลา วิช บางกอก จำกัด/);
  assert.match(html, /หมวด 1 ขอบเขตและรายละเอียดการจ้างออกแบบกลิ่นน้ำหอม/);
  assert.match(html, /หมวด 2 ขอบเขตและรายละเอียดการออกแบบกลิ่น/);
  assert.match(html, /หมวด 3 ข้อตกลงอื่น/);
  // ตัวเลขจากช่องกรอกถูกเติมลงข้อสัญญาจริง (ไม่ใช่ token ค้าง)
  assert.match(html, /30-45 วัน/);
  assert.match(html, /3,000 บาท/);
  assert.doesNotMatch(html, /\{\{\w+\}\}/);
  // ฉบับตรึงต้องไม่มีแถบปุ่มของหน้าจอ
  assert.doesNotMatch(html, /class="toolbar no-print"/);
});

test('ร่างที่ยังไม่ออกเลข พิมพ์ออกมาพร้อมลายน้ำ "ฉบับร่าง" · ใบยกเลิกได้ลายน้ำ "ยกเลิก"', () => {
  const draft = buildContractHTML({ ...CONTRACT, contractNo: null, status: 'draft' }, { company: COMPANY });
  assert.match(draft, /ฉบับร่าง/);
  const cancelled = buildContractHTML({ ...CONTRACT, status: 'cancelled' }, { company: COMPANY });
  assert.match(cancelled, /ยกเลิก/);
});

test('เอกสารตัดหน้าด้วยการวัดจริง — ไม่ประมาณเป็นมิลลิเมตร และไม่ครอบตัดเนื้อ', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY });
  // สายเนื้อหาที่อ่านครบได้เองแม้สคริปต์ไม่ทำงาน (แผ่นยืด ไม่ใช่ overflow:hidden)
  assert.match(html, /class="sheet flowSheet"/);
  assert.match(html, /\.contract \.flowSheet \{[^}]*height: auto/);
  // ตัววัดต้องเป็นความสูงจริงจากเบราว์เซอร์
  assert.match(html, /scrollHeight <= content\.clientHeight/);
  // บล็อกเดียวที่สูงเกินหนึ่งแผ่นต้องได้แผ่นยืด ไม่ใช่ถูกครอบตัด
  assert.match(html, /classList\.add\('tall'\)/);
  assert.match(html, /\.contract \.sheet\.tall \{[^}]*overflow: visible/);
  /* 🪤 กับดักที่เจอจริง: `.sheetContent` ของเปลือกเป็น flex column ซึ่ง **บีบ** ลูกให้
     พอดีแผ่น ⇒ เงื่อนไข "ล้นไหม" ไม่มีวันจริง แล้วทุกอย่างกองอยู่แผ่นเดียว */
  assert.match(html, /\.contract \.sheetContent \{ display: block/);
  // วัดหลังฟอนต์พร้อม — ฟอนต์สำรองสูงไม่เท่า Sarabun ที่ฝังไว้
  assert.match(html, /document\.fonts\.ready\.then\(run\)/);
});

test('ทุกแผ่นมีท้ายกระดาษ: ชื่อบริษัท · เลขที่สัญญา · เลขหน้า', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY });
  assert.match(html, /data-footer=/);
  assert.match(html, /เลขที่ CT-26080001/);
  assert.match(html, /'หน้า ' \+ \(f \+ 1\) \+ ' \/ ' \+ list\.length/);
  assert.match(html, /<footer class="footer">/);
});

test('ย่อหน้าของความนำและย่อหน้าปิดท้ายเข้าย่อหน้าแรก (ตามต้นฉบับ)', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY });
  assert.match(html, /class="blk intro"/);
  assert.match(html, /class="closing"/);
  assert.match(html, /\.contract \.closing \.clauseText \{ text-indent: 12mm/);
  // คำจำกัดความก็เป็นความเรียง ⇒ ย่อหน้าเหมือนกัน (มติผู้ใช้ 2026-08-21)
  assert.match(html, /class="blk defs"/);
  assert.match(html, /\.contract \.defs \.clauseText,/);
});

test('ชนิดที่ยังไม่มีแม่แบบต้องเรนเดอร์ไม่ได้ ไม่ใช่ออกกระดาษเปล่า', () => {
  assert.throws(() => buildContractHTML({ ...CONTRACT, kind: 'manufacturing' }, { company: COMPANY }), /แม่แบบ/);
});

test('ชื่อเอกสารอยู่กลางหน้าเนื้อหา ไม่ใช่ในหัวใบ · หัวใบไม่มีแถววันที่', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY });
  assert.match(html, /<h1 class="blk docTitle"[^>]*>สัญญาจ้างออกแบบกลิ่นและการพัฒนาสินค้า<\/h1>/);
  assert.match(html, /\.contract \.docTitle \{[^}]*text-align: center/);
  // หัวใบของเปลือกยังพิมพ์ชื่อเอกสารเสมอ — เอกสารนี้ซ่อนทิ้งเพื่อไม่ให้ชื่อขึ้นสองที่
  assert.match(html, /\.contract \.identityBlock h1[^{]*\{ display: none/);
  assert.match(html, /เลขที่สัญญา/);
  /* วันที่ขึ้นสองรูปโดยตั้งใจ (มติผู้ใช้ 2026-08-21): หัวใบเป็น DD/MM/พ.ศ. ไว้กวาดตาหา
     ส่วนในตัวสัญญาเขียนเต็มคำไว้อ่านเป็นประโยค — ค่าเดียวกัน มาจาก contractDate ตัวเดียว */
  assert.match(html, /วันที่สัญญา/);
  assert.match(html, /20\/08\/2569/);
  assert.match(html, /20 เดือน สิงหาคม พ.ศ. 2569/);
  // ไม่พิมพ์รุ่นแม่แบบบนกระดาษ — สัญญาไม่ใช่แบบฟอร์มควบคุมที่ต้องโชว์รหัส/รุ่น
  assert.doesNotMatch(html, /แม่แบบ scent_design/);
  assert.doesNotMatch(html, /Ver\.2026/);
});

test('ข้อมูลคู่สัญญาและวันที่พิมพ์เป็นตัวหนา · ตัวเลขเงื่อนไขไม่หนา', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY });
  assert.match(html, /<strong class="fill">บริษัท ลา วิช บางกอก จำกัด<\/strong>/);
  assert.match(html, /<strong class="fill">0105563135135<\/strong>/);
  assert.match(html, /<strong class="fill">20 เดือน สิงหาคม พ.ศ. 2569<\/strong>/);
  // เงื่อนไขตัวเลขต้องเป็นข้อความธรรมดา — หนาหมดทั้งฉบับ = ไม่มีอะไรเด่น
  assert.doesNotMatch(html, /<strong class="fill">30-45<\/strong>/);
  assert.doesNotMatch(html, /<strong class="fill">3,000<\/strong>/);
});

test('ป้ายกับค่าในหัวใบเรียงตรงกัน — ป้ายยาวต้องไม่ดันค่าเยื้อง', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY });
  assert.match(html, /\.contract \.identityBlock dl div \{ grid-template-columns: 36mm/);
  assert.match(html, /\.contract \.identityBlock dd \{ text-align: right/);
  // ชื่อเอกสารถูกย้ายไปกลางหน้า ⇒ ฝั่งขวาต้องถูกดันลงไปจบระดับเดียวกับบล็อกบริษัท
  assert.match(html, /\.contract \.identityBlock dl \{ margin-top: auto/);
});

test('ย่อหน้าปิดท้ายต้องอยู่แผ่นเดียวกับช่องลงนามเสมอ', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY });
  /* บล็อกเดียวกัน = ตัวตัดหน้าย้ายไปทั้งก้อน · แยกเมื่อไรจะได้แผ่นที่มีแต่ช่องเซ็น
     ลอย ๆ ซึ่งอ่านไม่ต่อกับประโยค "ลงลายมือชื่อ … ต่อหน้าพยาน" */
  const block = /<section class="blk signPage">([\s\S]*?)<\/section>\s*<\/div>/.exec(html);
  assert.ok(block, 'ไม่พบบล็อกปิดท้าย+ลงนาม');
  assert.match(block[1], /ทั้งผู้ว่าจ้างและผู้รับจ้างต่างยึดถือไว้ฝ่ายละฉบับ/);
  assert.match(block[1], /class="signGrid"/);
  assert.match(block[1], /พยาน/);
});

test('หน้าพรีวิวมีปุ่มพิมพ์ + ตัวสลับภาษา · อังกฤษยังกดไม่ได้', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY });
  assert.match(html, /class="toolbar no-print"/);
  assert.match(html, /btn-print/);
  assert.match(html, />พิมพ์เอกสาร</);
  assert.match(html, /class="langSwitch"/);
  /* ยังไม่มีต้นฉบับสัญญาภาษาอังกฤษ ⇒ ปุ่มต้อง **มีแต่กดไม่ได้พร้อมเหตุผล**
     ไม่ใช่ซ่อนทิ้ง (ซ่อน = ไม่มีใครรู้ว่าจะมี) และไม่ใช่กดได้แล้วได้เอกสารครึ่งภาษา */
  assert.match(html, /data-lang="en"[^>]*disabled/);
  assert.match(html, /ยังไม่มีต้นฉบับสัญญาภาษาอังกฤษ/);
});

test('ช่องลงนามชิดท้ายกระดาษ · เลขที่สัญญาใช้สี accent · ชื่อเอกสารไม่ใหญ่เกิน', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY });
  // ดันเฉพาะช่องเซ็นลงล่าง และเปิด flex ได้หลังตัดหน้าเสร็จเท่านั้น (คลาสจากสคริปต์)
  assert.match(html, /classList\.add\('signSheet'\)/);
  assert.match(html, /\.contract \.sheet\.signSheet \.signPage \.signGrid \{ margin-top: auto/);
  assert.match(html, /\.contract \.identityBlock dl div:first-child dd \{ color: var\(--doc-accent\)/);
  assert.match(html, /\.contract \.docTitle \{[^}]*font-size: 13\.5pt/);
  // ช่องพยานต้องห่างจากช่องคู่สัญญาพอให้ลายเซ็นไม่ทับกัน
  assert.match(html, /\.contract \.signGrid \{[^}]*gap: 20mm 8mm/);
  // accent ของสัญญาต้องไม่ใช่ navy — เกือบเท่าสีตัวหนังสือ จนสี accent ไม่มีความหมาย
  assert.match(html, /--doc-accent:#ad5d43/);   // สีเดียวกับใบเสนอราคา
});

test('เนื้อสัญญาไม่ jusify — ภาษาไทยมีช่องว่างน้อย ยืดแล้วเป็นรูโหว่กลางบรรทัด', () => {
  const html = buildContractHTML(CONTRACT, { company: COMPANY });
  assert.match(html, /\.contract \.clauseText \{[^}]*text-align: left/);
  assert.doesNotMatch(html, /\.contract \.clauseText \{[^}]*text-align: justify/);
});
