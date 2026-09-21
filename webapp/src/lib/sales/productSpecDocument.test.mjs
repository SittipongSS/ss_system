import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PRODUCT_SPEC_PAGE_BUDGET_MM, PRODUCT_SPEC_RENDERER_VERSION, PRODUCT_SPEC_WATERMARKS,
  applyProductSpecWatermark, productSpecDateText, productSpecRevText, productSpecWatermark,
  renderProductSpecDocument, supersededWatermark,
} from './productSpecDocument.js';
import { productSpecCertSeed, productSpecChecklistSeed } from './productSpecChecklist.js';
import { resolveCompanyBlock } from '@/lib/companyProfile';

/* 🪤 **บล็อกบริษัทรูปจริง** — `getPublishedCompanyProfile` คืนผลของ `resolveCompanyBlock`
   ซึ่งมีแค่ `legalNameTh`/`legalNameEn` ไม่มี `nameTh` · ชุดเดิมใส่ `nameTh` มาด้วยเลยบัง
   บั๊กที่หัวกระดาษพิมพ์ชื่อบริษัทเป็น "-" ไว้ทั้งชุด */
const company = resolveCompanyBlock({
  legalNameTh: 'บริษัท ทดสอบกระดาษ จำกัด',
  legalNameEn: 'PAPER TEST CO., LTD.',
  address: 'เลขที่ 000 กรุงเทพมหานคร',
  taxId: '0000000000000',
});

const snapshotOf = (over = {}) => ({
  schemaVersion: 1,
  capturedAt: '2026-09-17T03:00:00.000Z',
  spec: {
    texture: 'เหลว',
    standardPackaging: 'บรรจุขวดแก้วหัวสเปรย์',
    targetGroup: 'ผู้หญิงวัยเริ่มต้นทำงาน',
    keySellingPoint: null,
    pricingTier: null,
    productBenefit: null,
    longevity: null,
    dosagePerUse: null,
    certifications: productSpecCertSeed([{ key: 'fda', status: 'ready', note: 'เลข 10-1-68' }]),
  },
  /* ใบเต็มตามแบบฟอร์ม (ไม่ส่ง previousItems = ครบทุกแถว) แล้วกรอกค่าลงสองแถว
     ⚠️ ห้ามสร้างด้วย `productSpecChecklistSeed([สองแถว])` — ตั้งแต่มติ 21/09 ที่ 17 แถว
        ลบได้ การส่ง previousItems คือ "ยกมาเท่าที่ฉบับก่อนมี" ⇒ จะได้ใบสองแถว */
  items: productSpecChecklistSeed().map((row) => {
    if (row.itemKey === 'raw_material') return { ...row, detail: 'น้ำหอม', preparedByS: true };
    if (row.itemKey === 'card') return { ...row, preparedByCustomer: true };
    return row;
  }),
  product: {
    id: 'P-1',
    productDescription: 'Eau de Tea Valley 50 ml',
    fgCode: 'FG-0903-01-002-10043',
    brandName: 'Artepole',
    customerName: 'ลูกค้าในทะเบียนสินค้า',
    categoryName: 'BODY PERFUME · น้ำหอมสำหรับผิวกาย',
    scentText: null,
    volumeText: '50 ML',
  },
  order: {
    salesOrderId: 'SOR-1',
    salesOrderLineId: 'SOL-1',
    orderNumber: 'SO-26090176-0',
    quotationNumber: 'QT-26090271-0',
    confirmDocNo: null,
    confirmDocDate: null,
    qty: 1500,
    unit: 'ขวด',
    lineDescription: null,
    deliveryDueDate: '2026-10-30',
    customerName: 'บริษัท อาเตโพเล่ จำกัด',
    dealOwnerId: 'U-AE',
    dealOwnerName: 'สิทธิพงศ์ เจ้าของดีล',
    dealOwnerEmail: 'owner@example.com',
    dealOwnerPhone: '0613879399',
  },
  illustrations: [],
  ...over,
});

const revisionOf = (over = {}) => ({
  id: 'PSDR-1',
  revNo: 2,
  status: 'approved',
  submittedByName: 'ชลิตา เอซี',
  submittedAt: '2026-09-17T03:00:00.000Z',
  aeApprovedByName: 'สิทธิพงศ์ เจ้าของดีล',
  aeApprovedAt: '2026-09-18T03:00:00.000Z',
  supApprovedByName: 'พัชราภิชญ์ ซุปเปอร์ไวเซอร์',
  // 🪤 ตี 1 เวลาไทยของวันที่ 20 = 18:00 UTC ของวันที่ 19 — ต้องพิมพ์ 20/09/2569
  supApprovedAt: '2026-09-19T18:00:00.000Z',
  ...over,
});

const baseInput = (over = {}) => ({
  snapshot: snapshotOf(),
  document: { id: 'PSD-1', docNo: 'FM-SA-04-170969-004', status: 'active' },
  revision: revisionOf(),
  watermark: null,
  company,
  standard: null,
  toolbar: false,
  ...over,
});

const sheetCount = (html) => (html.match(/class="sheet /g) || []).length;
const headings = (html) => (html.match(/<h3>[^<]*<\/h3>/g) || []).map((h) => h.replace(/<\/?h3>/g, ''));

test('ใช้เปลือกเอกสารกลาง — ได้ .sheet · หัวเอกสาร · ท้ายกระดาษ ชุดเดียวกับใบเสนอราคา', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /class="documentHeader"/);
  assert.match(html, /class="partyGrid"/);
  assert.match(html, /class="footer"/);
  assert.match(html, /class="sheetContent"/);
  assert.ok(sheetCount(html) >= 1);
});

test('🐞 หัวกระดาษพิมพ์ชื่อบริษัทจากบล็อกรูปจริง (legalNameTh) — ไม่ใช่ "-"', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /<strong>บริษัท ทดสอบกระดาษ จำกัด<\/strong>/);
  assert.doesNotMatch(html, /<div>\s*<strong>-<\/strong>/);
  // ท้ายกระดาษก็ใช้ชื่อเดียวกัน
  assert.match(html, /<footer class="footer">\s*<span>บริษัท ทดสอบกระดาษ จำกัด<\/span>/);
});

test('🪤 สามเลขบนกระดาษอยู่ครบและไม่สลับกัน — Reversion No. คือ Rev ของเอกสาร', () => {
  const html = renderProductSpecDocument(baseInput());
  // เวอร์ชันของ **แบบฟอร์ม** (ค่าสำรองเมื่อยังไม่มีมาตรฐานเผยแพร่)
  assert.match(html, /FM-SA-04: Rev\. No\.00\. 08\/05\/2568/);
  // เลขที่ของเอกสาร
  assert.match(html, /Document No\.<\/dt><dd>FM-SA-04-170969-004</);
  // Rev ของเอกสาร — เติมศูนย์สองหลัก
  assert.match(html, /Reversion No\.<\/dt><dd>02</);
});

test('แบบฟอร์มที่เผยแพร่คุมบรรทัดแบบฟอร์ม — คนละเลขกับ Rev ของเอกสาร', () => {
  const html = renderProductSpecDocument(baseInput({
    standard: { formCode: 'FM-SA-04', revision: '01', effectiveDate: '2026-01-15', accentKey: 'teal' },
    revision: revisionOf({ revNo: 0 }),
  }));
  assert.match(html, /FM-SA-04: Rev\. No\.01\./);
  assert.match(html, /Reversion No\.<\/dt><dd>00</);
});

test('ตัวอย่างจากหน้าสินค้า — Document No. / Reversion No. เป็นขีด และลายน้ำ "ตัวอย่าง"', () => {
  const html = renderProductSpecDocument(baseInput({
    document: null,
    revision: null,
    snapshot: snapshotOf({
      order: Object.fromEntries(Object.keys(snapshotOf().order).map((key) => [key, null])),
    }),
    watermark: productSpecWatermark({ sample: true }),
  }));
  assert.match(html, /Document No\.<\/dt><dd>-</);
  assert.match(html, /Reversion No\.<\/dt><dd>-</);
  assert.doesNotMatch(html, /FM-SA-04-\d{6}-\d{3}/, 'ตัวอย่างต้องไม่มีเลขที่เอกสาร');
  assert.match(html, /class="watermark">ตัวอย่าง</);
  // ไม่มี SO = ไม่มีเจ้าของดีล · ลูกค้าถอยไปชื่อในทะเบียนสินค้า
  assert.match(html, /ลูกค้าในทะเบียนสินค้า/);
});

test('วันที่บนกระดาษเป็น พ.ศ. ทั้งใบ และเป็นวันไทย (ไม่ใช่วันแบบ UTC)', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /วันที่จัดทำ<\/dt><dd>17\/09\/2569</);
  assert.match(html, /กำหนดส่งสินค้า<\/dt><dd>30\/10\/2569</);
  assert.match(html, /20\/09\/2569/, 'อนุมัติตี 1 เวลาไทยต้องเป็นวันที่ 20');
  assert.doesNotMatch(html, /\/2026</, 'ห้ามมีปี ค.ศ. หลุดบนกระดาษ');
});

test('ตัวจัดวันที่ พ.ศ. — วันในปฏิทินไม่ขยับ · จุดเวลาเป็นวันไทย · ว่าง = null', () => {
  assert.equal(productSpecDateText('2026-10-30'), '30/10/2569');
  assert.equal(productSpecDateText('2026-09-19T18:00:00.000Z'), '20/09/2569');
  assert.equal(productSpecDateText(new Date('2026-01-01T00:00:00.000Z')), '01/01/2569');
  assert.equal(productSpecDateText(null), null);
  assert.equal(productSpecDateText(''), null);
  assert.equal(productSpecDateText('ไม่ใช่วันที่'), null);
});

test('Rev บนหัวกระดาษ — สองหลัก · ไม่มี = null', () => {
  assert.equal(productSpecRevText(0), '00');
  assert.equal(productSpecRevText(12), '12');
  assert.equal(productSpecRevText(null), null);
  assert.equal(productSpecRevText(undefined), null);
});

test('อ้างอิง: ใบเสนอราคา / ใบสั่งขาย · จำนวนมีคั่นหลักพัน · ชื่อลูกค้ามาจาก SO ในภาพนิ่ง', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /QT-26090271-0 \/ SO-26090176-0/);
  assert.match(html, /1,500 ขวด/);
  assert.match(html, /บริษัท อาเตโพเล่ จำกัด/);
  assert.match(html, /Artepole/);
});

test('ลายเซ็นสามขั้นมาจากตราประทับของ Rev — ผู้ยื่น · AE เจ้าของดีล · AE Sup · ลูกค้าว่าง', () => {
  const html = renderProductSpecDocument(baseInput());
  const sigs = html.slice(html.indexOf('class="sigs"'));
  const order = ['Account Coordinator', 'ชลิตา เอซี', '17/09/2569',
    'Account Executive', 'สิทธิพงศ์ เจ้าของดีล', '18/09/2569',
    'Account Executive Supervisor', 'พัชราภิชญ์ ซุปเปอร์ไวเซอร์', '20/09/2569', 'Customer'];
  let at = 0;
  for (const text of order) {
    const found = sigs.indexOf(text, at);
    assert.ok(found >= at, `ลำดับลายเซ็นผิดที่ "${text}"`);
    at = found + text.length;
  }
  assert.equal((html.match(/class="sigSpace"/g) || []).length, 4, 'ต้องเว้นที่เซ็นมือทั้งสี่ช่อง');
});

test('ร่างที่ยังไม่ยื่น — ช่องลายเซ็นว่างทั้งหมด ไม่ใช่ชื่อคนเปิด', () => {
  const html = renderProductSpecDocument(baseInput({
    revision: {
      id: 'PSDR-2', revNo: 0, status: 'draft', submittedByName: null, aeApprovedByName: null, supApprovedByName: null,
    },
  }));
  const sigs = html.slice(html.indexOf('class="sigs"'));
  assert.doesNotMatch(sigs, /ชลิตา|พัชราภิชญ์/);
});

test('⭐ Contact for Sales = AE เจ้าของดีลจากภาพนิ่ง (ชื่อ · อีเมล · เบอร์)', () => {
  const html = renderProductSpecDocument(baseInput());
  const contact = html.slice(html.indexOf('Contact for Sales'), html.indexOf('Final Review'));
  assert.match(contact, /สิทธิพงศ์ เจ้าของดีล/);
  assert.match(contact, /owner@example\.com/);
  assert.match(contact, /0613879399/);
});

test('checklist พิมพ์ครบทุกแถวและติ๊กตรงกับผู้จัดเตรียม', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /Checklist Project/);
  assert.match(html, /วัตถุดิบ\/สารประกอบ/);
  assert.match(html, /สายคาดกล่อง/);          // แถวที่ 16 ของทะเบียน
  assert.ok((html.match(/☑/g) || []).length >= 3, 'ต้องมีช่องที่ติ๊กแล้ว');
  assert.ok((html.match(/☐/g) || []).length >= 20, 'แถวที่ยังไม่ติ๊กต้องพิมพ์ช่องว่างไว้ให้ติ๊กมือ');
});

test('🐞 ไม่มี "(ต่อ)" ปลอม — หัวข้อที่ขึ้นหน้าใหม่ไม่ใช่การตัดกลางหัวข้อ', () => {
  // ใบมาตรฐาน 17 แถว: หัวข้อ Checklist ล้นแผ่นแรกพอดี ⇒ ของเดิมพิมพ์ "Checklist Project (ต่อ)"
  // ตามด้วย "Checklist Project" ซ้อนกัน
  const html = renderProductSpecDocument(baseInput());
  const list = headings(html);
  for (let index = 0; index < list.length; index += 1) {
    const cont = list[index].match(/^(.*) \(ต่อ\)$/);
    if (!cont) continue;
    assert.notEqual(list[index + 1], cont[1], `"${list[index]}" ตามด้วยหัวข้อเดิมที่ยังไม่เคยเริ่ม`);
    assert.ok(list.slice(0, index).includes(cont[1]), `"${list[index]}" ต่อจากหัวข้อที่ยังไม่เคยขึ้น`);
  }
  assert.equal(list.filter((h) => h === 'Checklist Project').length, 1);
});

test('หัวข้อไม่ค้างท้ายแผ่น — แถวแรกที่สูงกว่าปกติต้องตามหัวข้อไปหน้าใหม่ด้วย', () => {
  const long = 'รายละเอียดยาวมาก '.repeat(18);
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({
      items: [{ itemKey: null, itemLabel: 'แถวสูง', detail: long, note: long, preparedByS: true }],
    }),
  }));
  const pages = html.split('class="sheet ').slice(1);
  for (const page of pages) {
    const body = page.replace(/<footer[\s\S]*$/, '');
    // หัวข้อที่เป็นสิ่งสุดท้ายของแผ่น = หัวข้อลอย
    assert.doesNotMatch(body, /<h3>[^<]*<\/h3>\s*<\/div>\s*$/, 'มีหัวข้อค้างท้ายแผ่นโดยไม่มีแถวตาม');
  }
  const list = headings(html);
  assert.ok(!list.includes('Checklist Project (ต่อ)'), 'แถวเดียวของหัวข้อไม่ใช่การตัดกลางหัวข้อ');
});

test('ตัดกลางหัวข้อจริง = หน้าใหม่เปิดด้วย "(ต่อ)" และพิมพ์หัวตารางซ้ำ', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({
      items: Array.from({ length: 40 }, (_, i) => ({
        itemKey: null,
        itemLabel: `รายการที่ ${i + 1}`,
        detail: 'รายละเอียดยาว '.repeat(12),
        note: 'หมายเหตุยาว '.repeat(10),
        preparedByS: true,
      })),
    }),
  }));
  assert.ok(headings(html).includes('Checklist Project (ต่อ)'));
  assert.ok((html.match(/<th class="no">ลำดับ<\/th>/g) || []).length >= 2, 'หัวตารางต้องพิมพ์ซ้ำบนหน้าใหม่');
});

test('ลบ checklist หมดใบ = ไม่มีหัวข้อ Checklist บนกระดาษ (ไม่ใช่หัวข้อกับตารางเปล่า)', () => {
  const html = renderProductSpecDocument(baseInput({ snapshot: snapshotOf({ items: [] }) }));
  assert.ok(!html.includes('Checklist Project'), 'หัวข้อยังขึ้นทั้งที่ไม่มีแถว');
  assert.match(html, /Certification &amp; Documents/, 'หัวข้อถัดไปต้องยังอยู่');
});

test('ช่องที่ไม่ได้กรอกพิมพ์ N/A — ไม่ใช่เว้นว่างจนอ่านไม่ออกว่าถามแล้วหรือยัง', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /class="na">N\/A/);
});

test('เอกสารที่ขอได้พิมพ์ทั้งสองสถานะเสมอ และ อย. ใช้คำของตัวเอง', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /Certification &amp; Documents/);
  assert.match(html, /อยู่ระหว่างยื่น/);          // แถว อย.
  assert.match(html, /อยู่ระหว่างจัดเตรียม/);     // แถวอื่น
});

test('ท้ายกระดาษทุกแผ่นบอกได้ว่าเป็นใบไหนและ Rev ไหน แม้แผ่นนั้นไม่มีหัวเอกสาร', () => {
  const html = renderProductSpecDocument(baseInput());
  const pages = sheetCount(html);
  assert.ok(pages >= 2, 'ใบมาตรฐานต้องมีอย่างน้อยสองแผ่น (เทสต์ท้ายกระดาษจะไม่มีความหมาย)');
  assert.equal((html.match(/FM-SA-04-170969-004 Rev\.02/g) || []).length >= pages, true);
  assert.match(html, /หน้า 1 \/ /);
  // หัวเอกสารมีแผ่นเดียว
  assert.equal((html.match(/class="documentHeader"/g) || []).length, 1);
});

test('ข้อมูลยาวขึ้นหน้าใหม่ได้ ไม่ใช่ยัดแผ่นเดียวจนล้น', () => {
  const short = renderProductSpecDocument(baseInput());
  const long = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({
      items: Array.from({ length: 40 }, (_, i) => ({
        itemKey: null,
        itemLabel: `รายการที่ ${i + 1}`,
        detail: 'รายละเอียดยาว '.repeat(12),
        note: 'หมายเหตุยาว '.repeat(10),
        preparedByS: true,
      })),
    }),
  }));
  assert.ok(sheetCount(long) > sheetCount(short), 'ใบที่ยาวกว่าต้องได้หน้ามากกว่า');
});

test('🔴 งบต่อแผ่นต้องไม่โตขึ้นเอง — แผ่นแรกเสียที่ให้กล่องคู่สัญญา', () => {
  /* วัดจริง 2026-09-17: `.sheetContent` แผ่นแรก 212.2mm หัก `.partyGrid` 31.75 = 180.4
     ⇒ 173 เผื่อไว้ 7.4mm · ตัวเลขนี้โตขึ้นเมื่อไรแปลว่ามีคนเดาแทนการวัด แล้วแผ่นจะล้น
     เงียบ ๆ เพราะ `.sheet` เป็น overflow: hidden */
  assert.ok(PRODUCT_SPEC_PAGE_BUDGET_MM.first <= 180, 'งบแผ่นแรกต้องไม่เกินพื้นที่จริงหลังหักกล่องคู่สัญญา');
  assert.ok(PRODUCT_SPEC_PAGE_BUDGET_MM.rest <= 267, 'งบแผ่นถัดไปต้องไม่เกินพื้นที่จริง');
  assert.ok(PRODUCT_SPEC_PAGE_BUDGET_MM.rest > PRODUCT_SPEC_PAGE_BUDGET_MM.first,
    'แผ่นที่ไม่มีหัวเอกสารต้องได้ที่มากกว่าแผ่นแรก ไม่งั้นตัดหัวออกแล้วไม่ได้หน้าคืน');
});

test('🔴 หัวกระดาษกับกล่องอ้างอิงยังสามแถวเท่าตอนวัด — เพิ่มแถวต้องวัดงบใหม่', () => {
  const html = renderProductSpecDocument(baseInput());
  const identity = html.slice(html.indexOf('class="identityBlock"'), html.indexOf('</header>'));
  assert.equal((identity.match(/<dt>/g) || []).length, 3);
  const reference = html.slice(html.indexOf('Reference'), html.indexOf('</section>'));
  assert.equal((reference.match(/<dt>/g) || []).length, 3);
});

test('escape ค่าที่มาจากผู้ใช้ — ชื่อสินค้าที่มี < > ต้องไม่กลายเป็นแท็ก', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ product: { ...snapshotOf().product, productDescription: '<script>alert(1)</script>' } }),
  }));
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

/* ── ลายน้ำ ──────────────────────────────────────────────────────────── */

test('ลายน้ำตามสถานะ (มติ 21/09)', () => {
  const doc = { status: 'active' };
  for (const status of ['draft', 'pending_ae', 'pending_ae_supervisor', 'rejected']) {
    assert.equal(productSpecWatermark({ document: doc, revision: { status } }), 'ฉบับร่าง', status);
  }
  assert.equal(productSpecWatermark({ document: doc, revision: { status: 'approved' } }), null);
  assert.equal(productSpecWatermark({ document: doc, revision: { status: 'superseded' }, supersededByRevNo: 3 }), 'ถูกแทนด้วย Rev.03');
  assert.equal(productSpecWatermark({ sample: true }), 'ตัวอย่าง');
});

test('🔴 เอกสาร void ชนะทุกสถานะของ Rev — ฉบับอนุมัติของใบที่ยกเลิกต้องไม่ออกมาสะอาด', () => {
  for (const status of ['approved', 'superseded', 'draft', 'pending_ae']) {
    assert.equal(productSpecWatermark({ document: { status: 'void' }, revision: { status } }), 'ยกเลิก', status);
  }
});

test('🪤 สถานะที่ไม่รู้จัก = "ฉบับร่าง" — กระดาษไร้ลายน้ำต้องเป็นฉบับอนุมัติเท่านั้น', () => {
  assert.equal(productSpecWatermark({ document: { status: 'active' }, revision: { status: 'อะไรไม่รู้' } }), 'ฉบับร่าง');
  assert.equal(productSpecWatermark({}), 'ฉบับร่าง');
  assert.equal(supersededWatermark(null), 'ถูกแทนด้วย Rev. ใหม่');
});

test('ลายน้ำอยู่ทุกแผ่น และฉบับอนุมัติไม่มีลายน้ำ', () => {
  const draft = renderProductSpecDocument(baseInput({ watermark: PRODUCT_SPEC_WATERMARKS.draft }));
  assert.equal((draft.match(/class="watermark">ฉบับร่าง</g) || []).length, sheetCount(draft));
  const approved = renderProductSpecDocument(baseInput());
  assert.doesNotMatch(approved, /class="watermark"/);
});

test('⭐ กระดาษที่ตรึงแล้วประทับลายน้ำทับได้โดยเนื้อไม่เปลี่ยน · ไม่มีข้อความ = คืนของเดิมทุกไบต์', () => {
  const frozen = renderProductSpecDocument(baseInput());
  assert.equal(applyProductSpecWatermark(frozen, null), frozen);
  const stamped = applyProductSpecWatermark(frozen, 'ถูกแทนด้วย Rev.03');
  assert.equal((stamped.match(/class="watermark">ถูกแทนด้วย Rev\.03</g) || []).length, sheetCount(frozen));
  // เอาลายน้ำออกแล้วต้องได้กระดาษเดิมเป๊ะ — แตะเฉพาะช่องลายน้ำ
  assert.equal(stamped.replace(/<div class="watermark">[^<]*<\/div>/g, ''), frozen);
  // ประทับซ้ำ = แทนของเดิม ไม่ซ้อนสองชั้น
  const twice = applyProductSpecWatermark(stamped, 'ยกเลิก');
  assert.equal((twice.match(/class="watermark"/g) || []).length, sheetCount(frozen));
  assert.doesNotMatch(twice, /class="watermark">ถูกแทนด้วย/);
});

test('กระดาษที่ไม่มีช่องลายน้ำ (ตัวเรนเดอร์รุ่นอื่น) ยังได้ลายน้ำทุกแผ่น', () => {
  const legacy = '<div><article class="sheet explicit-page" aria-label="a">A</article><article class="sheet" aria-label="b">B</article></div>';
  const stamped = applyProductSpecWatermark(legacy, 'ยกเลิก');
  assert.equal((stamped.match(/class="watermark">ยกเลิก</g) || []).length, 2);
});

test('🪤 ข้อความผู้ใช้ปลอมช่องลายน้ำไม่ได้ (ถูก escape)', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ spec: { ...snapshotOf().spec, texture: '<!--psd:watermark-->แอบ<!--/psd:watermark-->' } }),
  }));
  const stamped = applyProductSpecWatermark(html, 'ยกเลิก');
  assert.match(stamped, /&lt;!--psd:watermark--&gt;แอบ/);
  assert.equal((stamped.match(/class="watermark"/g) || []).length, sheetCount(html));
});

test('รุ่นตัวเรนเดอร์พอดีคอลัมน์ rendererVersion (≤ 40 ตัวอักษร)', () => {
  assert.ok(PRODUCT_SPEC_RENDERER_VERSION.length > 0 && PRODUCT_SPEC_RENDERER_VERSION.length <= 40);
});

/* ── ภาพประกอบ (แผ่นท้าย) — มาจากภาพนิ่ง ───────────────────────────────── */

const figure = (attachmentId, caption, sortOrder = null) => ({
  attachmentId, caption, sortOrder, fileName: `${attachmentId}.jpg`,
});

test('ไม่มีภาพ = ไม่มีหัวข้อภาพประกอบเลย (ไม่ใช่หัวข้อว่าง)', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.doesNotMatch(html, /ภาพประกอบรายละเอียดสินค้า/);
  assert.doesNotMatch(html, /class="figGrid"/);
});

test('ภาพขึ้นสองภาพต่อแถว พร้อมเลขลำดับและคำบรรยาย', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({
      illustrations: [
        figure('att-1', 'กล่องแบบใหม่ เปิดขึ้น', 0),
        figure('att-2', 'ใส่การ์ด', 1),
        figure('att-3', 'ปิดกล่อง', 2),
      ],
    }),
  }));
  assert.match(html, /ภาพประกอบรายละเอียดสินค้า/);
  // 3 ภาพ ⇒ สองแถว (2 + 1)
  assert.equal((html.match(/class="figGrid"/g) || []).length, 2);
  assert.match(html, /1\. กล่องแบบใหม่ เปิดขึ้น/);
  assert.match(html, /3\. ปิดกล่อง/);
});

test('รูปดึงผ่านเส้นไฟล์แนบของระบบด้วย attachmentId ของภาพนิ่ง — ไม่ใช่ URL ดิบจาก storage', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [figure('att-9', 'ภาพหนึ่ง', 0)] }),
  }));
  assert.match(html, /src="\/api\/master\/attachments\/att-9\/file"/);
});

test('ภาพที่ไม่มีคำบรรยายยังมีเลขลำดับ และ alt ไม่ว่าง (ไม่ใช่ N/A)', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [figure('att-x', '', 0)] }),
  }));
  assert.match(html, />1\.</);
  assert.match(html, /alt="ภาพประกอบที่ 1"/);
  assert.doesNotMatch(html, /alt="N\/A"/);
});

test('เรียงภาพตาม sortOrder ของภาพนิ่ง ด้วยตัวจัดลำดับตัวเดียวกับที่จอใช้', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [figure('b', 'สอง', 1), figure('a', 'หนึ่ง', 0)] }),
  }));
  assert.ok(html.indexOf('1. หนึ่ง') < html.indexOf('2. สอง'));
});

test('ภาพเยอะขึ้นหน้าใหม่ — ไม่ยัดแผ่นเดียว และหัวข้อภาพไม่ค้างท้ายแผ่น', () => {
  const few = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [figure('a', 'หนึ่ง', 0), figure('b', 'สอง', 1)] }),
  }));
  const many = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({
      illustrations: Array.from({ length: 14 }, (_, i) => figure(`att-${i}`, `ภาพที่ ${i + 1}`, i)),
    }),
  }));
  assert.ok(sheetCount(many) > sheetCount(few));
  for (const html of [few, many]) {
    const at = html.indexOf('<h3>ภาพประกอบรายละเอียดสินค้า</h3>');
    const pageEnd = html.indexOf('</article>', at);
    assert.ok(html.slice(at, pageEnd).includes('class="figGrid"'), 'หัวข้อภาพต้องมีแถวภาพตามอยู่แผ่นเดียวกัน');
  }
});

test('escape คำบรรยายที่ผู้ใช้พิมพ์', () => {
  const html = renderProductSpecDocument(baseInput({
    snapshot: snapshotOf({ illustrations: [figure('att-1', '<img onerror=alert(1)>', 0)] }),
  }));
  assert.doesNotMatch(html, /<img onerror/);
  assert.match(html, /&lt;img onerror/);
});
