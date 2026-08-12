import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildIssuedQuotationPayload,
  buildIssuedQuotationArtifactHtml,
  captureIssuedQuotationSnapshot,
  loadSignatureImageDataUri,
  issuedContentFingerprint,
  artifactSha256,
  ISSUED_QUOTATION_LAYOUT_VERSION,
  issuedQuotationLocale,
} from './issuedQuotationSnapshot.js';

const baseQuote = {
  id: 'QT-1',
  quoteNumber: 'QT-2026-0001',
  quoteDate: '2026-07-20',
  validUntil: '2026-08-20',
  revisionNo: 0,
  customerName: 'ลูกค้า ก',
  branchCode: null,
  billingAddress: '123 ถนนทดสอบ',
  shippingAddress: '123 ถนนทดสอบ',
  contactName: 'คุณเอ',
  contactPhone: '0800000000',
  subtotal: 1000,
  discountType: null,
  discountValue: 0,
  discountAmount: 0,
  vatRate: 7,
  vatAmount: 70,
  totalAmount: 1070,
  paymentPlan: { type: 'full', paymentMethod: 'โอน' },
  paymentTerms: 'เครดิต 30 วัน',
  notes: 'หมายเหตุ',
  approvedByName: 'เจ้าของดีล',
  approvedAt: '2026-07-20T03:00:00.000Z',
  createdByName: 'ผู้สร้าง',
  approvalStatus: 'pending',
  deal: { title: 'ดีลทดสอบ', ownerName: 'เจ้าของดีล' },
  lines: [
    { id: 'L1', sortOrder: 1, fgCode: 'FG-1', description: 'สินค้า A', qty: 2, unitPrice: 500, lineTotal: 1000 },
  ],
};

const evidence = {
  id: 'DSE-1',
  documentStandardVersionId: 'DSV-1',
  controlledFormSnapshot: { versionId: 'DSV-1', formCode: 'FM-SA-01', revision: '00', versionNumber: 1 },
};

test('payload pins commercial content, customer, company and standard', () => {
  const payload = buildIssuedQuotationPayload(baseQuote, evidence);
  assert.equal(payload.document.quoteNumber, 'QT-2026-0001');
  assert.equal(payload.content.totalAmount, 1070);
  assert.equal(payload.customer.customerName, 'ลูกค้า ก');
  assert.equal(payload.standard.formCode, 'FM-SA-01');
  assert.ok(payload.company.legalName, 'company snapshot is captured');
});

test('content fingerprint is deterministic and content-sensitive', () => {
  const a = issuedContentFingerprint(buildIssuedQuotationPayload(baseQuote, evidence));
  const b = issuedContentFingerprint(buildIssuedQuotationPayload(baseQuote, evidence));
  assert.equal(a, b);
  assert.match(a, /^sha256:[0-9a-f]{64}$/);

  const changed = { ...baseQuote, totalAmount: 2000, subtotal: 1900 };
  const c = issuedContentFingerprint(buildIssuedQuotationPayload(changed, evidence));
  assert.notEqual(a, c);
});

test('artifact renders approved HTML without draft watermark', () => {
  const html = buildIssuedQuotationArtifactHtml(baseQuote);
  assert.match(html, /^<!doctype html>/);
  assert.ok(!html.includes('>ฉบับร่าง<'), 'approved artifact carries no draft watermark');
  assert.match(artifactSha256(html), /^sha256:[0-9a-f]{64}$/);
});

test('artifact sha256 is stable for identical HTML', () => {
  const html = buildIssuedQuotationArtifactHtml(baseQuote);
  assert.equal(artifactSha256(html), artifactSha256(html));
});

// mock supabase สำหรับ capture: ทะเบียนลูกค้า + user_signatures (ไม่มีลายเซ็น = ข้าม storage)
// + จับ args ที่ส่งเข้า RPC ไว้ตรวจ
function captureClient(customer, sink) {
  return {
    from(table) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({ data: table === 'customers' ? customer : null }),
      };
      return q;
    },
    async rpc(name, args) {
      sink.name = name;
      sink.args = args;
      return { data: { snapshot: { id: 'ISD-1' } }, error: null };
    },
  };
}

test('capture เติมข้อมูลลูกค้าที่ว่างจากทะเบียนก่อนตรึง — ฉบับตรึงต้องไม่แสดง "-"', async () => {
  // บั๊กจริง 2026-07-26: หน้ารายละเอียดเติมช่องว่างตอนอ่าน (GET) แต่ชั้น capture ไม่เติม
  // → เอกสารที่ "ออกจริง" (เล่นฉบับตรึง) แสดงเลขผู้เสียภาษี/ผู้ติดต่อเป็น '-'
  const sink = {};
  const client = captureClient({
    taxId: '0105561000000',
    address: null,
    shippingAddress: null,
    branchCode: '00001',
    contacts: [{ name: 'คุณบี', phone: '021112222' }],
  }, sink);
  await captureIssuedQuotationSnapshot(client, {
    quote: { ...baseQuote, customerId: 'C1', customerTaxId: null, contactName: null, contactPhone: null },
    evidence,
    user: { id: 'U1', name: 'ผู้อนุมัติ' },
  });
  assert.equal(sink.name, 'capture_issued_quotation_snapshot_atomic');
  assert.equal(sink.args.p_quotation_id, 'QT-1');
  assert.equal(sink.args.p_resolved_payload.customer.customerTaxId, '0105561000000');
  assert.equal(sink.args.p_resolved_payload.customer.contactName, 'คุณบี');
  assert.equal(sink.args.p_resolved_payload.customer.contactPhone, '021112222');
  // ต้องไปถึง HTML ที่ตรึงด้วย ไม่ใช่แค่ payload — HTML คือสิ่งที่ reprint เล่นซ้ำ
  assert.match(sink.args.p_artifact_html, /0105561000000/);
  assert.match(sink.args.p_artifact_html, /คุณบี/);
});

test('capture ใช้หลักฐานการยื่นที่ตรึงไว้ → ใบตรึงมีวันที่ + Evidence ของผู้เสนอราคา', async () => {
  // mig 0155: การยื่น = ลงนามผู้เสนอราคา → ฉบับตรึงต้องฝังรูปเวอร์ชันที่ลงนามจริง
  // (ไม่ใช่ลายเซ็นสดที่อาจถูกเปลี่ยนภายหลัง) พร้อมวันที่และ Evidence id
  const sink = {};
  const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const client = {
    from(table) {
      const q = {
        select: () => q,
        eq: () => q,
        maybeSingle: async () => ({
          data: table === 'document_signature_evidence'
            ? {
              id: 'DSE-SUBMIT',
              signerName: 'ผู้ยื่นจริง',
              signedAt: '2026-07-26T04:00:00.000Z',
              signatureAssetSnapshot: { storageBucket: 'sig', storagePath: 'p.png', mimeType: 'image/png' },
            }
            : null,
        }),
      };
      return q;
    },
    storage: {
      from: () => ({ download: async () => ({ data: { arrayBuffer: async () => png.buffer }, error: null }) }),
    },
    async rpc(name, args) { sink.args = args; return { data: {}, error: null }; },
  };
  await captureIssuedQuotationSnapshot(client, {
    quote: { ...baseQuote, proposerSignatureEvidenceId: 'DSE-SUBMIT' },
    evidence,
    user: { id: 'U1' },
  });
  assert.match(sink.args.p_artifact_html, /ผู้ยื่นจริง/);
  assert.match(sink.args.p_artifact_html, /Evidence DSE-SUBMIT/);
  assert.match(sink.args.p_artifact_html, /26\/07\/2026/);
});

test('capture ไม่ทับค่าที่ตรึงไว้แล้วด้วยทะเบียนลูกค้าปัจจุบัน', async () => {
  const sink = {};
  const client = captureClient({ taxId: 'ใหม่', contacts: [{ name: 'คนใหม่', phone: '099' }] }, sink);
  await captureIssuedQuotationSnapshot(client, {
    // ใบนี้ตรึงผู้ติดต่อไว้แล้ว (baseQuote) — ขาดแค่เลขภาษี
    quote: { ...baseQuote, customerId: 'C1', customerTaxId: null },
    evidence,
    user: { id: 'U1' },
  });
  assert.equal(sink.args.p_resolved_payload.customer.contactName, 'คุณเอ');
  assert.equal(sink.args.p_resolved_payload.customer.customerTaxId, 'ใหม่');
});

test('layout version is tagged for regeneration tracking', () => {
  assert.equal(ISSUED_QUOTATION_LAYOUT_VERSION, 'quote-master-v4.3');
});

test('artifact embeds approver signature image when provided', () => {
  const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=';
  const html = buildIssuedQuotationArtifactHtml(baseQuote, { approverSignatureImage: png });
  assert.match(html, /class="signatureImage"/);
  assert.ok(html.includes(png), 'ฝัง data URI ลายเซ็นในใบตรึง');
  // ไม่ส่งรูป → fallback ข้อความ ไม่มี <img>
  const noImg = buildIssuedQuotationArtifactHtml(baseQuote);
  assert.doesNotMatch(noImg, /class="signatureImage"/);
  assert.match(noImg, /ลายเซ็นอิเล็กทรอนิกส์/);
});

test('artifact embeds both approver + proposer signature images', () => {
  const approver = 'data:image/png;base64,QVBQ';
  const proposer = 'data:image/png;base64,UFJPUA==';
  const html = buildIssuedQuotationArtifactHtml(baseQuote, {
    approverSignatureImage: approver,
    proposerSignatureImage: proposer,
  });
  assert.ok(html.includes(approver), 'ฝังรูปผู้อนุมัติ');
  assert.ok(html.includes(proposer), 'ฝังรูปผู้เสนอราคา');
  assert.equal((html.match(/class="signatureImage"/g) || []).length, 2);
});

test('loadSignatureImageDataUri: downloads PNG → data URI; null on missing/failed', async () => {
  const bytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG magic
  const okClient = {
    storage: {
      from: () => ({ download: async () => ({ data: { arrayBuffer: async () => bytes.buffer }, error: null }) }),
    },
  };
  const asset = { storageBucket: 'signature-assets', storagePath: 'users/u1/sig.png', mimeType: 'image/png' };
  const uri = await loadSignatureImageDataUri(okClient, asset);
  assert.match(uri, /^data:image\/png;base64,/);
  assert.ok(uri.length > 'data:image/png;base64,'.length, 'มี base64 payload');

  // ไม่มี asset / ไม่มี path → null (ไม่บล็อกการออกใบ)
  assert.equal(await loadSignatureImageDataUri(okClient, null), null);
  assert.equal(await loadSignatureImageDataUri(okClient, { storageBucket: 'b' }), null);

  // storage error → null
  const errClient = {
    storage: { from: () => ({ download: async () => ({ data: null, error: new Error('nope') }) }) },
  };
  assert.equal(await loadSignatureImageDataUri(errClient, asset), null);
});

test('ใบที่ตรึงใช้มาตรฐานเอกสารที่ตรึงไว้ใน evidence ไม่ใช่ค่าสำรอง', () => {
  // controlledFormSnapshot = ค่าที่ RPC ตรึงตอนอนุมัติ (mig 0125) — ใบที่ออกไปแล้วต้องคง
  // รหัสแบบฟอร์มเดิมเสมอ แม้มาตรฐานที่เผยแพร่จะถูกแก้ทีหลัง (ADR 0011)
  const html = buildIssuedQuotationArtifactHtml(baseQuote, {
    standard: {
      formCode: 'FM-SA-77',
      revision: '05',
      effectiveDate: '2026-01-15',
      titleTh: 'ใบเสนอราคา (ควบคุม)',
      titleEn: 'CONTROLLED QUOTATION',
      accentKey: 'terracotta',
    },
  });
  assert.match(html, /FM-SA-77/);
  assert.match(html, /Rev\. No\.05/);
  assert.match(html, /15\/01\/2569/);
  assert.match(html, /ใบเสนอราคา \(ควบคุม\)/);
  // ไม่มีมาตรฐานส่งมา → ตกไปใช้ค่าสำรองเดิม เอกสารยังออกได้
  assert.match(buildIssuedQuotationArtifactHtml(baseQuote), /FM-SA-01/);
});

// ── ภาษาเอกสารกับฉบับตรึง (IS-26080005 · mig 0238) ─────────────────────────

test('ฉบับตรึงบันทึกภาษาของใบ — payload + locale ตรงกับที่ใบเลือกไว้', () => {
  assert.equal(buildIssuedQuotationPayload(baseQuote, {}).document.docLanguage, 'th');
  assert.equal(
    buildIssuedQuotationPayload({ ...baseQuote, docLanguage: 'en' }, {}).document.docLanguage,
    'en',
  );
  assert.equal(issuedQuotationLocale(baseQuote), 'th-TH');
  assert.equal(issuedQuotationLocale({ ...baseQuote, docLanguage: 'en' }), 'en-US');
  // ค่าเพี้ยน/ใบเก่าที่ไม่มีคอลัมน์ = ไทย ไม่ใช่ค่าดิบที่หลุดเข้าไปในหลักฐาน
  assert.equal(buildIssuedQuotationPayload({ ...baseQuote, docLanguage: 'jp' }, {}).document.docLanguage, 'th');
  assert.equal(issuedQuotationLocale({ ...baseQuote, docLanguage: 'jp' }), 'th-TH');
});

test('ใบอังกฤษกับใบไทยคนละ fingerprint — ภาษาเป็นส่วนหนึ่งของเนื้อหาที่ตรึง', () => {
  const th = issuedContentFingerprint(buildIssuedQuotationPayload(baseQuote, {}));
  const en = issuedContentFingerprint(buildIssuedQuotationPayload({ ...baseQuote, docLanguage: 'en' }, {}));
  assert.notEqual(th, en);
});

test('artifact ที่ตรึงถูกอบเป็นภาษาของใบแล้ว — reprint จึงเปลี่ยนภาษาตามค่าปัจจุบันไม่ได้', () => {
  const html = buildIssuedQuotationArtifactHtml({ ...baseQuote, docLanguage: 'en' });
  assert.match(html, /<html lang="en">/);
  assert.ok(html.includes('Grand Total'));
  assert.ok(!html.includes('ยอดรวมทั้งสิ้น'));
  // ใบเดิมที่ไม่ได้เลือกภาษา = ไทยเหมือนเดิมทุกใบ
  const thai = buildIssuedQuotationArtifactHtml(baseQuote);
  assert.match(thai, /<html lang="th">/);
  assert.ok(thai.includes('ยอดรวมทั้งสิ้น'));
});
