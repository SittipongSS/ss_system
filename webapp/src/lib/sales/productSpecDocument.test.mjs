import assert from 'node:assert/strict';
import test from 'node:test';
import { PRODUCT_SPEC_PAGE_BUDGET_MM, renderProductSpecDocument } from './productSpecDocument.js';
import { productSpecCertSeed, productSpecChecklistSeed } from './productSpecChecklist.js';

const company = {
  legalNameTh: 'บริษัท เซ็นท์ แอนด์ เซ้นส์ จำกัด',
  nameTh: 'บริษัท เซ็นท์ แอนด์ เซ้นส์ จำกัด',
  address: 'เลขที่ 000 กรุงเทพมหานคร',
  taxId: '0000000000000',
};

const baseInput = (over = {}) => ({
  issue: {
    docNo: 'FM-SA-04-170969-004',
    revNo: 2,
    createdDateText: '17/09/2569',
    customerName: 'บริษัท อาเตโพเล่ จำกัด',
    brandName: 'Artepole',
    quotationNumber: 'QT-26090271-0',
    orderNumber: 'SO-26090176-0',
    deliveryDueDateText: '30/10/2569',
    qty: '500',
    unit: 'ขวด',
  },
  revision: {
    revNo: 2,
    texture: 'เหลว',
    standardPackaging: 'บรรจุขวดแก้วหัวสเปรย์',
    targetGroup: 'ผู้หญิงวัยเริ่มต้นทำงาน',
    createdByName: 'ชลิตา',
    approvedByName: 'พัชราภิชญ์',
    /* ใบเต็มตามแบบฟอร์ม (ไม่ส่ง previousItems = ครบทุกแถว) แล้วกรอกค่าลงสองแถว
       ⚠️ ห้ามสร้างด้วย `productSpecChecklistSeed([สองแถว])` — ตั้งแต่มติ 21/09 ที่ 17 แถว
          ลบได้ การส่ง previousItems คือ "ยกมาเท่าที่ฉบับก่อนมี" ⇒ จะได้ใบสองแถว */
    items: productSpecChecklistSeed().map((row) => {
      if (row.itemKey === 'raw_material') return { ...row, detail: 'น้ำหอม', preparedByS: true };
      if (row.itemKey === 'card') return { ...row, preparedByCustomer: true };
      return row;
    }),
    certifications: productSpecCertSeed([{ key: 'fda', status: 'ready', note: 'เลข 10-1-68' }]),
  },
  product: {
    productDescription: 'Eau de Tea Valley 50 ml',
    fgCode: 'FG-0903-01-002-10043',
    categoryName: 'BODY PERFUME · น้ำหอมสำหรับผิวกาย',
    volumeText: '50 ML',
  },
  company,
  contact: { name: 'สิทธิพงศ์', email: 'sittipong@example.com', phone: '0613879399' },
  standard: null,
  toolbar: false,
  ...over,
});

const sheetCount = (html) => (html.match(/class="sheet /g) || []).length;

test('ใช้เปลือกเอกสารกลาง — ได้ .sheet · หัวเอกสาร · ท้ายกระดาษ ชุดเดียวกับใบเสนอราคา', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /class="documentHeader"/);
  assert.match(html, /class="partyGrid"/);
  assert.match(html, /class="footer"/);
  assert.match(html, /class="sheetContent"/);
  assert.ok(sheetCount(html) >= 1);
});

test('🪤 สามเลขบนกระดาษอยู่ครบและไม่สลับกัน', () => {
  const html = renderProductSpecDocument(baseInput());
  // เวอร์ชันของ **แบบฟอร์ม** (ค่าสำรองเมื่อยังไม่มีมาตรฐานเผยแพร่)
  assert.match(html, /FM-SA-04: Rev\. No\.00\. 08\/05\/2568/);
  // เลขรันของการออกครั้งนี้
  assert.match(html, /Document No\.[\s\S]*?FM-SA-04-170969-004/);
  // เวอร์ชันสเปกของสินค้า — เติมศูนย์สองหลัก
  assert.match(html, /Reversion No\.[\s\S]*?>02</);
});

test('กระดาษของครั้งที่ออกอ้าง Rev. ของตัวเอง ไม่ใช่ฉบับล่าสุดของสินค้า', () => {
  const html = renderProductSpecDocument(baseInput({
    issue: { ...baseInput().issue, revNo: 1 },
    revision: { ...baseInput().revision, revNo: 5 },
  }));
  assert.match(html, /Reversion No\.[\s\S]*?>01</);
});

test('ยังไม่เคยออกเอกสาร = พรีวิวไม่มีเลขที่เอกสาร (ไม่เผาเลขให้พรีวิว)', () => {
  const html = renderProductSpecDocument(baseInput({
    issue: { docNo: '', revNo: 2, createdDateText: '17/09/2569' },
  }));
  assert.doesNotMatch(html, /FM-SA-04-\d{6}-\d{3}/);
  assert.match(html, /FM-SA-04: Rev\. No\.00/);
});

test('checklist พิมพ์ครบทุกแถวและติ๊กตรงกับผู้จัดเตรียม', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /Checklist Project/);
  assert.match(html, /วัตถุดิบ\/สารประกอบ/);
  assert.match(html, /สายคาดกล่อง/);          // แถวที่ 16 ของทะเบียน
  assert.ok((html.match(/☑/g) || []).length >= 3, 'ต้องมีช่องที่ติ๊กแล้ว');
  assert.ok((html.match(/☐/g) || []).length >= 20, 'แถวที่ยังไม่ติ๊กต้องพิมพ์ช่องว่างไว้ให้ติ๊กมือ');
});

test('ลบ checklist หมดใบ = ไม่มีหัวข้อ Checklist บนกระดาษ (ไม่ใช่หัวข้อกับตารางเปล่า)', () => {
  const html = renderProductSpecDocument({
    ...baseInput(),
    revision: { ...baseInput().revision, items: [] },
  });
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

test('ช่อง AE บนลายเซ็น = ผู้ยื่นอนุมัติ · ฉบับเก่าเส้นสี่ขั้นยังอ่านชื่อผู้ตรวจของตัวเอง', () => {
  const base = baseInput();
  const now = renderProductSpecDocument({
    ...base,
    revision: { ...base.revision, submittedByName: 'ชลิตา', reviewedByName: null },
  });
  assert.match(now, /ชลิตา/);

  const legacy = renderProductSpecDocument({
    ...base,
    revision: { ...base.revision, submittedByName: null, reviewedByName: 'ผู้ตรวจของเส้นเดิม' },
  });
  assert.match(legacy, /ผู้ตรวจของเส้นเดิม/);
});

test('ตารางลายเซ็นมีสี่ช่องและเว้นที่เซ็นมือไว้เสมอ', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.match(html, /Account Coordinator/);
  assert.match(html, /Account Executive Supervisor/);
  assert.match(html, /Customer/);
  assert.equal((html.match(/class="sigSpace"/g) || []).length, 4);
});

test('ท้ายกระดาษทุกแผ่นบอกได้ว่าเป็นใบไหน แม้แผ่นนั้นไม่มีหัวเอกสาร', () => {
  const html = renderProductSpecDocument(baseInput());
  const pages = sheetCount(html);
  assert.equal((html.match(/FM-SA-04-170969-004/g) || []).length >= pages, true);
  assert.match(html, /หน้า 1 \/ /);
  // หัวเอกสารมีแผ่นเดียว
  assert.equal((html.match(/class="documentHeader"/g) || []).length, 1);
});

test('ข้อมูลยาวขึ้นหน้าใหม่ได้ ไม่ใช่ยัดแผ่นเดียวจนล้น', () => {
  const short = renderProductSpecDocument(baseInput());
  const long = renderProductSpecDocument(baseInput({
    revision: {
      ...baseInput().revision,
      items: Array.from({ length: 40 }, (_, i) => ({
        itemKey: null,
        itemLabel: `รายการที่ ${i + 1}`,
        detail: 'รายละเอียดยาว '.repeat(12),
        note: 'หมายเหตุยาว '.repeat(10),
        preparedByS: true,
      })),
    },
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

test('escape ค่าที่มาจากผู้ใช้ — ชื่อสินค้าที่มี < > ต้องไม่กลายเป็นแท็ก', () => {
  const html = renderProductSpecDocument(baseInput({
    product: { ...baseInput().product, productDescription: '<script>alert(1)</script>' },
  }));
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /&lt;script&gt;/);
});

/* ── ภาพประกอบ (แผ่นท้าย) ─────────────────────────────────────────── */

const figure = (id, caption, over = {}) => ({
  id, createdAt: '2026-09-17T00:00:00Z', metadata: { caption }, ...over,
});

test('ไม่มีภาพ = ไม่มีหัวข้อภาพประกอบเลย (ไม่ใช่หัวข้อว่าง)', () => {
  const html = renderProductSpecDocument(baseInput());
  assert.doesNotMatch(html, /ภาพประกอบรายละเอียดสินค้า/);
  assert.doesNotMatch(html, /class="figGrid"/);
});

test('ภาพขึ้นสองภาพต่อแถว พร้อมเลขลำดับและคำบรรยาย', () => {
  const html = renderProductSpecDocument(baseInput({
    illustrations: [
      figure('att-1', 'กล่องแบบใหม่ เปิดขึ้น', { metadata: { caption: 'กล่องแบบใหม่ เปิดขึ้น', sortOrder: 0 } }),
      figure('att-2', 'ใส่การ์ด', { metadata: { caption: 'ใส่การ์ด', sortOrder: 1 } }),
      figure('att-3', 'ปิดกล่อง', { metadata: { caption: 'ปิดกล่อง', sortOrder: 2 } }),
    ],
  }));
  assert.match(html, /ภาพประกอบรายละเอียดสินค้า/);
  // 3 ภาพ ⇒ สองแถว (2 + 1)
  assert.equal((html.match(/class="figGrid"/g) || []).length, 2);
  assert.match(html, /1\. กล่องแบบใหม่ เปิดขึ้น/);
  assert.match(html, /3\. ปิดกล่อง/);
});

test('รูปดึงผ่านเส้นไฟล์แนบของระบบ — ไม่ใช่ URL ดิบจาก storage', () => {
  const html = renderProductSpecDocument(baseInput({
    illustrations: [figure('att-9', 'ภาพหนึ่ง')],
  }));
  assert.match(html, /src="\/api\/master\/attachments\/att-9\/file"/);
});

test('ภาพที่ไม่มีคำบรรยายยังมีเลขลำดับ และ alt ไม่ว่าง (ไม่ใช่ N/A)', () => {
  const html = renderProductSpecDocument(baseInput({
    illustrations: [figure('att-x', '')],
  }));
  assert.match(html, />1\.</);
  assert.match(html, /alt="ภาพประกอบที่ 1"/);
  assert.doesNotMatch(html, /alt="N\/A"/);
});

test('เรียงภาพด้วยตัวจัดลำดับตัวเดียวกับที่จอใช้', () => {
  const html = renderProductSpecDocument(baseInput({
    illustrations: [
      figure('b', 'สอง', { metadata: { caption: 'สอง', sortOrder: 1 } }),
      figure('a', 'หนึ่ง', { metadata: { caption: 'หนึ่ง', sortOrder: 0 } }),
    ],
  }));
  assert.ok(html.indexOf('1. หนึ่ง') < html.indexOf('2. สอง'));
});

test('ภาพเยอะขึ้นหน้าใหม่ — ไม่ยัดแผ่นเดียว', () => {
  const few = renderProductSpecDocument(baseInput({
    illustrations: [figure('a', 'หนึ่ง'), figure('b', 'สอง')],
  }));
  const many = renderProductSpecDocument(baseInput({
    illustrations: Array.from({ length: 14 }, (_, i) => figure(`att-${i}`, `ภาพที่ ${i + 1}`, {
      metadata: { caption: `ภาพที่ ${i + 1}`, sortOrder: i },
    })),
  }));
  assert.ok(sheetCount(many) > sheetCount(few));
});

test('escape คำบรรยายที่ผู้ใช้พิมพ์', () => {
  const html = renderProductSpecDocument(baseInput({
    illustrations: [figure('att-1', '<img onerror=alert(1)>')],
  }));
  assert.doesNotMatch(html, /<img onerror/);
  assert.match(html, /&lt;img onerror/);
});
