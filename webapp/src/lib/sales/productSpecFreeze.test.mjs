/* ── กระดาษ FM-SA-04 ฝั่ง server (productSpecFreeze) กับฐานจำลองในหน่วยความจำ ─────────
 *
 * ⚠️ ฐานจำลองนี้ไม่ใช่ Postgres — ไม่มี trigger "frozenHtml เขียนได้ครั้งเดียว" (ของจริงตรึงไว้ที่
 *    mig 0370 ⑧ + productSpecMigration.test.mjs) · ที่นี่ตรวจว่า **ตัวตรึงเองไม่เคยพยายามเขียนทับ**
 *    และเลือกแหล่งกระดาษ/ลายน้ำตามสถานะถูก
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  freezeProductSpecRevision, loadSpecPrintContext, pickDocumentRevision, renderProductSpecSample,
  renderSpecDocumentPaper, specPaperErrorResponse, supersedingRevNo,
} from './productSpecFreeze.js';
import { PRODUCT_SPEC_RENDERER_VERSION } from './productSpecDocument.js';
import { loadSpecDocument } from './productSpecStore.js';

function fakeDb(seed = {}, { fail = () => null, users = {}, beforeUpdate = null, files = {}, downloads = [] } = {}) {
  const tables = structuredClone(seed);
  const writes = [];
  const rowsOf = (table) => (tables[table] ||= []);
  const from = (table) => {
    const st = { action: 'select', filters: [], order: [], single: false, limit: null, range: null };
    const match = (row) => st.filters.every((keep) => keep(row));
    const run = () => {
      const failure = fail(table, st.action, st);
      if (failure) return { data: null, error: failure };
      if (st.action === 'update') {
        writes.push({ table, patch: st.patch });
        beforeUpdate?.(table, tables);
      }
      let out;
      if (st.action === 'update') {
        out = rowsOf(table).filter(match);
        for (const row of out) Object.assign(row, st.patch);
      } else {
        out = rowsOf(table).filter(match);
      }
      out = out.map((row) => structuredClone(row));
      out.sort((a, b) => {
        for (const [col, asc] of st.order) {
          if (a[col] === b[col]) continue;
          return (a[col] < b[col] ? -1 : 1) * (asc ? 1 : -1);
        }
        return 0;
      });
      if (st.range) out = out.slice(st.range[0], st.range[1] + 1);
      if (st.limit !== null) out = out.slice(0, st.limit);
      return st.single ? { data: out[0] ?? null, error: null } : { data: out, error: null };
    };
    const b = {
      select: () => b,
      update: (patch) => { st.action = 'update'; st.patch = patch; return b; },
      eq: (col, value) => { st.filters.push((row) => row[col] === value); return b; },
      neq: (col, value) => { st.filters.push((row) => row[col] !== value); return b; },
      in: (col, values) => { st.filters.push((row) => values.includes(row[col])); return b; },
      is: (col, value) => { st.filters.push((row) => (row[col] ?? null) === value); return b; },
      order: (col, opts = {}) => { st.order.push([col, opts.ascending !== false]); return b; },
      limit: (n) => { st.limit = n; return b; },
      range: (a, z) => { st.range = [a, z]; return b; },
      maybeSingle: () => { st.single = true; return b; },
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    };
    return b;
  };
  return {
    from,
    tables,
    writes,
    auth: {
      admin: {
        getUserById: async (id) => ({ data: { user: users[id] || null }, error: null }),
      },
    },
    // bucket ลายเซ็น (ส่วนตัว) — `files[path]` = ไบต์ของไฟล์ · Error = ดาวน์โหลดล้ม · ไม่มี = ไม่พบไฟล์
    storage: {
      from: (bucket) => ({
        download: async (path) => {
          downloads.push(`${bucket}/${path}`);
          const file = files[path];
          if (file instanceof Error) return { data: null, error: file };
          if (!file) return { data: null, error: { message: 'Object not found' } };
          return { data: new Blob([file]), error: null };
        },
      }),
    },
  };
}

const NOW = '2026-09-22T03:00:00.000Z';

const frozenSnapshot = (label) => ({
  schemaVersion: 1,
  capturedAt: '2026-09-17T03:00:00.000Z',
  spec: {
    texture: `เนื้อของ${label}`, standardPackaging: null, targetGroup: null, keySellingPoint: null,
    pricingTier: null, productBenefit: null, longevity: null, dosagePerUse: null, certifications: [],
  },
  items: [{ sortOrder: 0, itemKey: null, itemLabel: `checklist ของ${label}`, detail: null, preparedByS: true, preparedByCustomer: false, note: null }],
  product: { id: 'P-1', productDescription: 'Eau de Tea Valley 50 ml', fgCode: 'FG-0903-01-002-10043', brandName: 'Artepole' },
  order: {
    orderNumber: 'SO-26090176-0', quotationNumber: 'QT-26090271-0', qty: 500, unit: 'ขวด',
    deliveryDueDate: '2026-10-30', customerName: 'บริษัท อาเตโพเล่ จำกัด',
    dealOwnerId: 'U-AE', dealOwnerName: 'เจ้าของดีลในภาพนิ่ง', dealOwnerEmail: 'snap@example.com', dealOwnerPhone: '0811111111',
  },
  illustrations: [{ attachmentId: 'ATT-OLD', caption: 'รูปที่ตรึงไว้', sortOrder: 0, fileName: 'old.jpg' }],
});

const stamps = (status) => ({
  submittedAt: status === 'draft' ? null : '2026-09-17T03:00:00.000Z',
  submittedBy: status === 'draft' ? null : 'U-AC',
  submittedByName: status === 'draft' ? null : 'ชลิตา เอซี',
  aeApprovedAt: ['pending_ae_supervisor', 'approved', 'superseded'].includes(status) ? '2026-09-18T03:00:00.000Z' : null,
  aeApprovedByName: ['pending_ae_supervisor', 'approved', 'superseded'].includes(status) ? 'สิทธิพงศ์ AE' : null,
  supApprovedAt: ['approved', 'superseded'].includes(status) ? '2026-09-19T03:00:00.000Z' : null,
  supApprovedByName: ['approved', 'superseded'].includes(status) ? 'พัชราภิชญ์ Sup' : null,
});

const rev = (id, revNo, status, over = {}) => ({
  id,
  documentId: 'PSD-1',
  revNo,
  status,
  reason: revNo > 0 ? 'แก้ขนาดบรรจุตามลูกค้าขอ' : null,
  snapshot: status === 'draft' ? null : frozenSnapshot(`Rev${revNo}`),
  illustrationIds: status === 'draft' ? [] : ['ATT-OLD'],
  frozenHtml: null,
  frozenAt: null,
  rendererVersion: null,
  createdAt: `2026-09-1${revNo}T00:00:00.000Z`,
  ...stamps(status),
  ...over,
});

const seed = (over = {}) => ({
  product_spec_documents: [{
    id: 'PSD-1', docNo: 'FM-SA-04-170969-004', status: 'active', specId: 'PSP-1', productId: 'P-1',
    salesOrderId: 'SOR-1', salesOrderLineId: 'SOL-1', currentRevNo: 1, createdAt: '2026-09-17T00:00:00.000Z',
  }],
  product_spec_document_revisions: [
    rev('R0', 0, 'superseded', { frozenHtml: '<html>Rev0-ตรึงแล้ว<article class="sheet explicit-page" aria-label="x"><!--psd:watermark--><!--/psd:watermark-->R0</article></html>' }),
    rev('R1', 1, 'approved'),
    rev('R2', 2, 'draft'),
  ],
  sales_orders: [{
    id: 'SOR-1', orderNumber: 'SO-26090176-1', status: 'approved', origin: 'pipeline', dealId: 'D-1',
    quotationId: null, customerName: 'บริษัท ลูกค้าปัจจุบัน จำกัด', metadata: { quoteNumber: 'QT-26090271-1' },
    deliveryDueDate: '2026-11-15',
  }],
  sales_deals: [{ id: 'D-1', ownerId: 'U-AE', ownerName: 'ชื่อในดีล' }],
  sales_order_lines: [{ id: 'SOL-1', salesOrderId: 'SOR-1', productId: 'P-1', qty: 2500, unit: 'ขวด' }],
  products: [{
    id: 'P-1', fgCode: 'FG-0903-01-002-10043', productDescription: 'Eau de Tea Valley 50 ml',
    brandName: 'Artepole', customerName: 'ลูกค้าในทะเบียน', categoryCode: '01-002', volume: 50, volumeUnit: 'ML',
  }],
  product_types: [{ mainCategoryCode: '01', typeCode: '002', nameTh: 'น้ำหอมสำหรับผิวกาย', nameEn: 'BODY PERFUME' }],
  product_specs: [{
    id: 'PSP-1', productId: 'P-1', texture: 'เนื้อสเปคสดวันนี้', standardPackaging: null, targetGroup: null,
    keySellingPoint: null, pricingTier: null, productBenefit: null, longevity: null, dosagePerUse: null,
    certifications: [],
  }],
  product_spec_items: [{
    id: 'PSI-1', specId: 'PSP-1', sortOrder: 0, itemKey: null, itemLabel: 'checklist สดวันนี้',
    detail: null, preparedByS: false, preparedByCustomer: true, note: null,
  }],
  attachments: [],
  organization_setting_versions: [{
    organizationId: 'primary', status: 'published', legalNameTh: 'บริษัท จากหน้าตั้งค่า จำกัด',
    legalNameEn: 'FROM SETTINGS CO., LTD.', registeredAddressTh: 'ที่อยู่จากตั้งค่า', taxId: '1111111111111',
  }],
  document_standard_versions: [{
    documentKey: 'productSpec', status: 'published', formCode: 'FM-SA-04', revision: '01',
    effectiveDate: '2026-01-15', accentKey: 'teal',
  }],
  ...over,
});

const USERS = {
  'U-AE': { id: 'U-AE', email: 'owner@example.com', user_metadata: { name: 'สิทธิพงศ์ เจ้าของดีล', phone: '0613879399' } },
};

const revWrites = (db) => db.writes.filter((w) => w.table === 'product_spec_document_revisions');
const frozenOf = (db, id) => db.tables.product_spec_document_revisions.find((row) => row.id === id);

/* ── ตรึงกระดาษ ────────────────────────────────────────────────────────── */

test('ตรึง Rev ที่อนุมัติแล้ว — เรนเดอร์จากภาพนิ่ง + ผู้ลงนามสามขั้น แล้วเขียน frozenHtml/frozenAt/rendererVersion', async () => {
  const db = fakeDb(seed(), { users: USERS });
  const res = await freezeProductSpecRevision(db, { documentId: 'PSD-1', revisionId: 'R1', now: NOW });
  assert.equal(res.error, undefined, res.error);
  const row = frozenOf(db, 'R1');
  assert.equal(row.frozenHtml, res.frozenHtml);
  assert.equal(row.frozenAt, NOW);
  assert.equal(row.rendererVersion, PRODUCT_SPEC_RENDERER_VERSION);

  const html = row.frozenHtml;
  assert.match(html, /เนื้อของRev1/, 'ต้องมาจากภาพนิ่งของ Rev');
  assert.doesNotMatch(html, /เนื้อสเปคสดวันนี้/, '🔴 กระดาษที่ตรึงต้องไม่อ่านสเปคสด');
  // เลขที่รูป DDMMYY-XXX-RR (มติ 22/09) · RR = Rev ของเอกสารที่ตรึง
  assert.match(html, /<dt>เลขที่<\/dt><dd>170969-004-01<\/dd>/);
  assert.match(html, /ชลิตา เอซี[\s\S]*สิทธิพงศ์ AE[\s\S]*พัชราภิชญ์ Sup/);
  assert.match(html, /<strong>บริษัท จากหน้าตั้งค่า จำกัด<\/strong>/, 'หัวกระดาษต้องใช้ข้อมูลบริษัทที่เผยแพร่');
  assert.match(html, /FM-SA-04: Rev\. No\.01\./, 'บรรทัดแบบฟอร์มมาจากมาตรฐานที่เผยแพร่');
  assert.match(html, /<dt>ผู้ติดต่อฝ่ายขาย<\/dt><dd>เจ้าของดีลในภาพนิ่ง<\/dd>/, 'ผู้ติดต่อฝ่ายขายมาจากภาพนิ่ง ไม่ใช่เจ้าของดีลวันนี้');
  // 🪤 ภาพนิ่ง v1 (ไม่มีก้อน customer / docLanguage) ยังตรึงได้ — ใบไทย ช่องที่ไม่มีเป็นขีด
  assert.match(html, /<h1>รายละเอียดผลิตภัณฑ์<\/h1>/);
  assert.match(html, /<dt>เลขผู้เสียภาษี<\/dt><dd>-<\/dd>/);
  assert.doesNotMatch(html, /class="watermark"/, 'ฉบับอนุมัติที่ตรึงต้องไม่มีลายน้ำ');
});

/* ── ลายเซ็นบนกระดาษ (มติผู้ใช้ 2026-09-22 "final review ต้องปรับให้เหมือน QT และ SO") ──────────────── */

const SIGNERS = { submittedBy: 'U-AC', aeApprovedBy: 'U-ADMIN', supApprovedBy: 'U-SUP' };
const signatureSeed = (over = {}) => seed({
  product_spec_document_revisions: [rev('R1', 1, 'approved', SIGNERS)],
  user_signatures: [
    { userId: 'U-AC', activeVersionId: 'V-AC' },
    { userId: 'U-ADMIN', activeVersionId: 'V-ADMIN' },
    // U-SUP ยังไม่อัปโหลดลายเซ็น
  ],
  user_signature_versions: [
    { id: 'V-AC', storageBucket: 'signature-assets', storagePath: 'users/ac.png', mimeType: 'image/png' },
    { id: 'V-ADMIN', storageBucket: 'signature-assets', storagePath: 'users/admin.png', mimeType: 'image/png' },
  ],
  ...over,
});
const SIGNER_USERS = {
  ...USERS,
  'U-AC': { id: 'U-AC', app_metadata: { role: 'ac' } },
  'U-ADMIN': { id: 'U-ADMIN', app_metadata: { role: 'admin' } },
  'U-SUP': { id: 'U-SUP', app_metadata: { role: 'ae_supervisor' } },
};
const PNG_BYTES = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const PNG_URI = `data:image/png;base64,${Buffer.from(PNG_BYTES).toString('base64')}`;
const signatureBoxes = (html) => html.slice(html.indexOf('<section class="signatures"')).split(/<div class="(?:signed)?">/).slice(1);

test('⭐ ตรึงกระดาษ = ฝังรูปลายเซ็นที่ใช้งานอยู่ของผู้ลงนามแต่ละขั้น + ตำแหน่งเต็มจาก role ในบัญชี', async () => {
  const downloads = [];
  const db = fakeDb(signatureSeed(), {
    users: SIGNER_USERS, downloads, files: { 'users/ac.png': PNG_BYTES, 'users/admin.png': PNG_BYTES },
  });
  const res = await freezeProductSpecRevision(db, { documentId: 'PSD-1', revisionId: 'R1', now: NOW });
  assert.equal(res.error, undefined, res.error);
  const boxes = signatureBoxes(frozenOf(db, 'R1').frozenHtml);
  assert.equal(boxes.length, 4);
  // ขั้น 1–2 มีรูปจริงเป็น data URI (กระดาษที่ตรึงไม่พึ่งไฟล์ภายนอก) · ขั้น 3 ยังไม่อัปโหลด = กล่องลายเซ็นอิเล็กทรอนิกส์
  assert.ok(boxes[0].includes(`<img class="signatureImage" src="${PNG_URI}"`));
  assert.ok(boxes[1].includes(`<img class="signatureImage" src="${PNG_URI}"`));
  assert.match(boxes[2], /class="signaturePreview"[\s\S]*<strong>พัชราภิชญ์ Sup<\/strong>/);
  assert.deepEqual(boxes.map((box) => box.match(/<span>([^<]*)<\/span>/)?.[1]), [
    'Account Coordinator', 'Administrator', 'Account Executive Supervisor', 'Customer',
  ]);
  assert.match(boxes[3], /class="signatureSpace">ลงชื่อ</, 'ช่องลูกค้าว่างเสมอ');
  assert.deepEqual(downloads.sort(), ['signature-assets/users/ac.png', 'signature-assets/users/admin.png']);
});

test('🔴 โหลดรูปลายเซ็น/บัญชีผู้ลงนามไม่ได้ ไม่ขวางการตรึง — กล่องลายเซ็นอิเล็กทรอนิกส์ + ตำแหน่งของช่อง + มี log', async (t) => {
  const logged = [];
  t.mock.method(console, 'error', (...args) => { logged.push(args.join(' ')); });
  t.mock.method(console, 'warn', () => {});
  const db = fakeDb(signatureSeed(), {
    users: {}, files: { 'users/ac.png': new Error('storage down'), 'users/admin.png': new Error('storage down') },
  });
  db.auth.admin.getUserById = async () => ({ data: null, error: { message: 'auth down' } });
  const res = await freezeProductSpecRevision(db, { documentId: 'PSD-1', revisionId: 'R1', now: NOW });
  assert.equal(res.error, undefined, res.error);
  const boxes = signatureBoxes(frozenOf(db, 'R1').frozenHtml);
  assert.doesNotMatch(frozenOf(db, 'R1').frozenHtml, /<img class="signatureImage"/);
  boxes.slice(0, 3).forEach((box) => assert.match(box, /class="signaturePreview"/));
  assert.deepEqual(boxes.map((box) => box.match(/<span>([^<]*)<\/span>/)?.[1]).slice(0, 3), [
    'Account Coordinator', 'Account Executive', 'Account Executive Supervisor',
  ]);
  assert.ok(logged.some((line) => /storage down/.test(line)), 'ดาวน์โหลดรูปล้มต้องลง log');
  assert.ok(logged.some((line) => /auth down/.test(line)), 'อ่านบัญชีผู้ลงนามล้มต้องลง log');
});

test('Rev ที่รออนุมัติ (พิมพ์จากภาพนิ่ง) มีรูปของขั้นที่เซ็นแล้ว · ร่างไม่โหลดลายเซ็นเลย', async () => {
  const downloads = [];
  const pending = fakeDb(signatureSeed({
    product_spec_document_revisions: [rev('R1', 1, 'pending_ae_supervisor', { ...SIGNERS, supApprovedBy: null })],
  }), { users: SIGNER_USERS, downloads, files: { 'users/ac.png': PNG_BYTES, 'users/admin.png': PNG_BYTES } });
  const res = await paper(pending, null);
  assert.equal(res.error, undefined, res.error);
  assert.match(res.html, /class="watermark">ฉบับร่าง</);
  const boxes = signatureBoxes(res.html);
  assert.deepEqual(boxes.map((box) => box.includes('<img class="signatureImage"')), [true, true, false, false]);
  assert.match(boxes[2], /class="signatureSpace">ลงชื่อ</, 'ขั้นที่ยังไม่ถึง = ช่องเซ็นมือ');

  const draftDownloads = [];
  const draft = fakeDb(signatureSeed({ product_spec_document_revisions: [rev('R0', 0, 'draft')] }), {
    users: SIGNER_USERS, downloads: draftDownloads, files: { 'users/ac.png': PNG_BYTES },
  });
  const draftPaper = await paper(draft, null);
  assert.equal(draftPaper.error, undefined, draftPaper.error);
  assert.equal(draftDownloads.length, 0);
  assert.equal((draftPaper.html.match(/class="signatureSpace"/g) || []).length, 4);
});

test('ตรึงซ้ำ = คืนของเดิม ไม่เขียนทับ (frozenHtml เขียนได้ครั้งเดียว)', async () => {
  const db = fakeDb(seed(), { users: USERS });
  const res = await freezeProductSpecRevision(db, { documentId: 'PSD-1', revisionId: 'R0', now: NOW });
  assert.equal(res.alreadyFrozen, true);
  assert.match(res.frozenHtml, /Rev0-ตรึงแล้ว/);
  assert.equal(revWrites(db).length, 0, 'ต้องไม่ยิง UPDATE เลย');
});

test('🔴 ตรึงได้เฉพาะ Rev ที่อนุมัติ/ถูกแทน — ร่าง/รออนุมัติได้ 409 และไม่เขียนอะไร', async () => {
  for (const status of ['draft', 'pending_ae', 'pending_ae_supervisor', 'rejected']) {
    const db = fakeDb(seed({
      product_spec_document_revisions: [rev('R0', 0, status, { rejectionReason: 'x', rejectedStage: 'ae' })],
    }), { users: USERS });
    const res = await freezeProductSpecRevision(db, { documentId: 'PSD-1', revisionId: 'R0', now: NOW });
    assert.equal(res.status, 409, status);
    assert.equal(revWrites(db).length, 0, status);
  }
});

test('🔴 ตอนตรึง อ่านข้อมูลบริษัท/มาตรฐานไม่ได้ = ไม่ตรึง (ของที่ตรึงแก้ไม่ได้อีก)', async () => {
  for (const broken of ['organization_setting_versions', 'document_standard_versions']) {
    const db = fakeDb(seed(), {
      users: USERS,
      fail: (table) => (table === broken ? { message: 'connection reset' } : null),
    });
    const res = await freezeProductSpecRevision(db, { documentId: 'PSD-1', revisionId: 'R1', now: NOW });
    assert.ok(res.error, broken);
    assert.equal(frozenOf(db, 'R1').frozenHtml, null, broken);
    assert.equal(revWrites(db).length, 0, broken);
  }
});

test('🪤 แข่งกันตรึง — อีกคำขอตรึงไปก่อน = ใช้กระดาษของเขา ไม่ใช่ error และไม่ทับ', async () => {
  const db = fakeDb(seed(), {
    users: USERS,
    beforeUpdate: (table, tables) => {
      if (table !== 'product_spec_document_revisions') return;
      const row = tables.product_spec_document_revisions.find((r) => r.id === 'R1');
      if (!row.frozenHtml) row.frozenHtml = '<html>ของคำขอที่มาก่อน</html>';
    },
  });
  const res = await freezeProductSpecRevision(db, { documentId: 'PSD-1', revisionId: 'R1', now: NOW });
  assert.equal(res.error, undefined, res.error);
  assert.equal(res.alreadyFrozen, true);
  assert.equal(res.frozenHtml, '<html>ของคำขอที่มาก่อน</html>');
  assert.equal(frozenOf(db, 'R1').frozenHtml, '<html>ของคำขอที่มาก่อน</html>');
});

test('ไม่โดนแถวเพราะ Rev เปลี่ยนสถานะไปแล้ว = 409 สถานะเปลี่ยนแล้ว', async () => {
  const db = fakeDb(seed(), {
    users: USERS,
    beforeUpdate: (table, tables) => {
      if (table === 'product_spec_document_revisions') {
        tables.product_spec_document_revisions.find((r) => r.id === 'R1').status = 'pending_ae';
      }
    },
  });
  const res = await freezeProductSpecRevision(db, { documentId: 'PSD-1', revisionId: 'R1', now: NOW });
  assert.equal(res.status, 409);
  assert.match(res.error, /สถานะเปลี่ยนแล้ว/);
});

test('UPDATE ตรึงล้ม = คืน error (ไม่เงียบ)', async () => {
  const db = fakeDb(seed(), {
    users: USERS,
    fail: (table, action) => (table === 'product_spec_document_revisions' && action === 'update'
      ? { message: 'permission denied' } : null),
  });
  const res = await freezeProductSpecRevision(db, { documentId: 'PSD-1', revisionId: 'R1', now: NOW });
  assert.match(res.error, /permission denied/);
});

test('ตรึงด้วยผลโหลดที่มีอยู่แล้วได้ — แต่ต้องเป็นเอกสารเดียวกัน', async () => {
  const db = fakeDb(seed(), { users: USERS });
  const loaded = await loadSpecDocument(db, 'PSD-1');
  const wrong = await freezeProductSpecRevision(db, { documentId: 'PSD-อื่น', revisionId: 'R1', loaded, now: NOW });
  assert.equal(wrong.status, 404);
  const right = await freezeProductSpecRevision(db, { documentId: 'PSD-1', revisionId: 'R1', loaded, now: NOW });
  assert.equal(right.error, undefined, right.error);
});

/* ── เลือกฉบับ ─────────────────────────────────────────────────────────── */

test('เลือก Rev: ไม่ส่ง = ฉบับที่อนุมัติ · ยังไม่เคยอนุมัติ = ล่าสุด · ?rev=N · เลขผิด/ไม่มี', () => {
  const r0 = { id: 'R0', revNo: 0, status: 'superseded' };
  const r1 = { id: 'R1', revNo: 1, status: 'approved' };
  const r2 = { id: 'R2', revNo: 2, status: 'draft' };
  const loaded = { revisions: [r2, r1, r0], latest: r2, approved: r1 };
  assert.equal(pickDocumentRevision(loaded, null).revision, r1);
  assert.equal(pickDocumentRevision(loaded, '').revision, r1);
  assert.equal(pickDocumentRevision({ ...loaded, approved: null }, null).revision, r2);
  assert.equal(pickDocumentRevision(loaded, '0').revision, r0);
  assert.equal(pickDocumentRevision(loaded, ' 2 ').revision, r2);
  assert.equal(pickDocumentRevision(loaded, 'abc').status, 400);
  assert.equal(pickDocumentRevision(loaded, '-1').status, 400);
  const missing = pickDocumentRevision(loaded, '7');
  assert.equal(missing.status, 404);
  assert.match(missing.error, /Rev\.07/);
  assert.equal(pickDocumentRevision({ revisions: [] }, null).status, 404);
});

test('Rev ที่มาแทน = Rev ถัดไปที่ผ่านด่านครบ (ร่าง/ตีกลับระหว่างทางไม่นับ)', () => {
  const revisions = [
    { revNo: 3, status: 'approved' }, { revNo: 2, status: 'superseded' },
    { revNo: 1, status: 'rejected' }, { revNo: 0, status: 'superseded' },
  ];
  assert.equal(supersedingRevNo(revisions, { revNo: 0, status: 'superseded' }), 2);
  assert.equal(supersedingRevNo(revisions, { revNo: 2, status: 'superseded' }), 3);
  assert.equal(supersedingRevNo(revisions, { revNo: 3, status: 'approved' }), null);
  assert.equal(supersedingRevNo([], { revNo: 0, status: 'superseded' }), null);
});

/* ── กระดาษของเอกสาร: แหล่ง + ลายน้ำตามสถานะ ──────────────────────────────── */

async function paper(db, revNo) {
  const loaded = await loadSpecDocument(db, 'PSD-1');
  assert.equal(loaded.error, undefined, loaded.error);
  const picked = pickDocumentRevision(loaded, revNo);
  return renderSpecDocumentPaper(db, { loaded, revision: picked.revision, now: NOW });
}

test('approved = frozenHtml ทุกไบต์ (ตรึงให้ถ้ายังไม่มี) · เปิดครั้งที่สองไม่เขียนซ้ำ', async () => {
  const db = fakeDb(seed(), { users: USERS });
  const first = await paper(db, null);
  assert.equal(first.error, undefined, first.error);
  assert.equal(first.html, frozenOf(db, 'R1').frozenHtml);
  const writesAfterFirst = revWrites(db).length;
  const second = await paper(db, null);
  assert.equal(second.html, first.html);
  assert.equal(revWrites(db).length, writesAfterFirst, 'เปิดซ้ำต้องไม่ยิง UPDATE');
});

test('superseded = กระดาษที่ตรึงไว้ + ลายน้ำ "ถูกแทนด้วย Rev.01" ประทับทับ (เนื้อเดิม)', async () => {
  const db = fakeDb(seed(), { users: USERS });
  const res = await paper(db, '0');
  assert.match(res.html, /Rev0-ตรึงแล้ว/);
  assert.match(res.html, /class="watermark">ถูกแทนด้วย Rev\.01</);
  assert.equal(frozenOf(db, 'R0').frozenHtml.includes('watermark">'), false, 'ของที่ตรึงในฐานต้องไม่ถูกแตะ');
});

test('🔴 เอกสาร void = "ยกเลิก" บนทุก Rev รวมฉบับอนุมัติที่ตรึงไว้', async () => {
  const base = seed();
  base.product_spec_documents[0].status = 'void';
  const db = fakeDb(base, { users: USERS });
  for (const revNo of ['0', '1', '2']) {
    const res = await paper(db, revNo);
    assert.equal(res.error, undefined, res.error);
    assert.match(res.html, /class="watermark">ยกเลิก</, `Rev ${revNo}`);
    assert.doesNotMatch(res.html, /class="watermark">(ถูกแทนด้วย|ฉบับร่าง)/, `Rev ${revNo}`);
  }
});

test('⭐ ใบอังกฤษ = ลายน้ำอังกฤษ (DRAFT · SUPERSEDED BY · CANCELLED) ตามภาษาในภาพนิ่งของกระดาษ', async () => {
  // 🐞 ผลตรวจรอบสอง: ใบอังกฤษยังประทับ "ฉบับร่าง"/"ถูกแทนด้วย Rev.02" ทั้งที่ QT/SO อังกฤษพิมพ์ DRAFT/CANCELLED
  const english = (id, revNo, status, over = {}) => {
    const row = rev(id, revNo, status, over);
    return { ...row, snapshot: { ...row.snapshot, order: { ...row.snapshot.order, docLanguage: 'en' } } };
  };
  const base = seed({
    product_spec_document_revisions: [
      english('R0', 0, 'superseded', { frozenHtml: '<html>Rev0<article class="sheet explicit-page" aria-label="x"><!--psd:watermark--><!--/psd:watermark-->R0</article></html>' }),
      english('R1', 1, 'approved'),
      english('R2', 2, 'pending_ae'),
    ],
  });
  let db = fakeDb(base, { users: USERS });
  assert.match((await paper(db, '0')).html, /class="watermark">SUPERSEDED BY Rev\.01</);
  assert.match((await paper(db, '2')).html, /class="watermark">DRAFT</);
  base.product_spec_documents[0].status = 'void';
  db = fakeDb(base, { users: USERS });
  assert.match((await paper(db, '1')).html, /class="watermark">CANCELLED</);
});

test('รออนุมัติ/ตีกลับ = ภาพนิ่งของ Rev นั้น (ไม่ใช่สเปคสด) + "ฉบับร่าง" · ไม่ตรึงอะไร', async () => {
  for (const status of ['pending_ae', 'pending_ae_supervisor', 'rejected']) {
    const db = fakeDb(seed({
      product_spec_document_revisions: [rev('R0', 0, status, { rejectionReason: 'แก้ชื่อ', rejectedStage: 'ae' })],
    }), { users: USERS });
    const res = await paper(db, null);
    assert.equal(res.error, undefined, res.error);
    assert.match(res.html, /เนื้อของRev0/, status);
    assert.doesNotMatch(res.html, /เนื้อสเปคสดวันนี้/, status);
    assert.match(res.html, /class="watermark">ฉบับร่าง</, status);
    assert.equal(revWrites(db).length, 0, `${status}: ห้ามตรึง`);
  }
});

test('ร่าง = สเปค + SO ปัจจุบัน (สด) + เจ้าของดีลวันนี้ + "ฉบับร่าง" · ลายเซ็นว่าง', async () => {
  const db = fakeDb(seed(), { users: USERS });
  const res = await paper(db, '2');
  assert.equal(res.error, undefined, res.error);
  const { html } = res;
  assert.match(html, /เนื้อสเปคสดวันนี้/);
  assert.match(html, /checklist สดวันนี้/);
  assert.match(html, /2,500 ขวด/, 'จำนวนมาจากบรรทัด SO ปัจจุบัน');
  // ใบเสนอราคากับใบสั่งขายคนละแถว (มติ 22/09 "แยกข้อ")
  assert.match(html, /<dt>ใบเสนอราคา<\/dt><dd>QT-26090271-1<\/dd>/);
  assert.match(html, /<dt>ใบสั่งขาย<\/dt><dd>SO-26090176-1<\/dd>/);
  assert.match(html, /15\/11\/2569/, 'กำหนดส่งเป็น พ.ศ.');
  assert.match(html, /สิทธิพงศ์ เจ้าของดีล[\s\S]*061-387-9399[\s\S]*owner@example\.com/);
  assert.match(html, /<dt>เลขที่<\/dt><dd>170969-004-02<\/dd>/);
  assert.match(html, /class="watermark">ฉบับร่าง</);
  /* ลายเซ็นว่างทั้งแถว: สี่ช่องเป็นช่องเซ็นมือ ไม่มีรูป/กล่องลายเซ็นอิเล็กทรอนิกส์ ไม่มีชื่อ — ไม่เดาชื่อเจ้าของดีลด้วย
     🐞 ตรวจรอบสาม: ข้อนี้เคยหั่นจาก `class="sigs"` ที่ถอดไปแล้ว (indexOf = -1 ⇒ ได้ตัวอักษรสุดท้ายของไฟล์) ⇒ ผ่านเสมอ */
  const boxes = signatureBoxes(html);
  assert.equal(boxes.length, 4);
  for (const box of boxes) {
    assert.match(box, /class="signatureSpace">ลงชื่อ</);
    assert.doesNotMatch(box, /<img class="signatureImage"|class="signaturePreview"|ชลิตา|พัชราภิชญ์|สิทธิพงศ์/);
  }
  assert.equal(revWrites(db).length, 0);
});

test('⭐ ร่าง = ภาษาของ SO ปัจจุบัน + กล่องผู้ซื้อจากใบเสนอราคาที่ผูก (สด) — SO อังกฤษได้ PRODUCT SPEC', async () => {
  const base = seed({
    quotations: [{
      id: 'QT-ID', quoteNumber: 'QT-26090271-1', customerNameEn: 'CURRENT CUSTOMER CO., LTD.', customerTaxId: '0105561234567',
      branchCode: '00003', billingAddress: 'ที่อยู่ไทย', billingAddressEn: 'Current billing EN', shippingAddress: null,
      shippingAddressEn: null, contactName: 'คุณเบลล์', contactPhone: '0844326199',
    }],
  });
  base.sales_orders[0] = { ...base.sales_orders[0], quotationId: 'QT-ID', docLanguage: 'en' };
  const db = fakeDb(base, { users: USERS });
  const res = await paper(db, '2');
  assert.equal(res.error, undefined, res.error);
  const { html } = res;
  assert.match(html, /<h1>PRODUCT SPEC<\/h1>/);
  assert.match(html, /<strong>CURRENT CUSTOMER CO\., LTD\.<\/strong>/);
  assert.match(html, /<dt>Tax ID<\/dt><dd>0105561234567<\/dd>/);
  assert.match(html, /<dt>Branch<\/dt><dd>00003<\/dd>/);
  assert.match(html, /<dt>Shipping Address<\/dt><dd>Current billing EN<\/dd>/, 'ไม่มีที่อยู่จัดส่ง = ตามที่อยู่เอกสาร');
  assert.match(html, /<dt>Contact<\/dt><dd>คุณเบลล์ · 084-432-6199<\/dd>/);
  assert.match(html, /15\/11\/2026/, 'ใบอังกฤษ = ค.ศ.');
});

test('🪤 ร่างที่บรรทัดชี้ไปบรรทัดของ SO อื่น = พิมพ์แบบไม่มีบรรทัด ไม่ยืมจำนวนของใบอื่น', async () => {
  const db = fakeDb(seed({
    sales_order_lines: [{ id: 'SOL-1', salesOrderId: 'SOR-อื่น', productId: 'P-1', qty: 9999, unit: 'ลัง' }],
  }), { users: USERS });
  const res = await paper(db, '2');
  assert.equal(res.error, undefined, res.error);
  assert.doesNotMatch(res.html, /9,999/);
});

test('ร่าง: อ่านรูปประกอบไม่ได้ = error ภาษาไทย ไม่ใช่ throw/500 ดิบ', async () => {
  const db = fakeDb(seed(), {
    users: USERS,
    fail: (table) => (table === 'attachments' ? { message: 'drive timeout' } : null),
  });
  const res = await paper(db, '2');
  assert.match(res.error, /drive timeout/);
  assert.equal(res.html, undefined);
});

test('ร่าง/ตัวอย่าง: อ่านบริษัทไม่ได้ = ใช้ค่าสำรองแล้วพิมพ์ต่อ (ไม่ใช่ล้มทั้งใบ)', async () => {
  const db = fakeDb(seed(), {
    users: USERS,
    fail: (table) => (table === 'organization_setting_versions' ? { message: 'down' } : null),
  });
  const warn = console.warn;
  console.warn = () => {};
  try {
    const context = await loadSpecPrintContext(db, { strict: false });
    assert.ok(context.company.legalNameTh, 'ต้องได้ชื่อบริษัทสำรอง');
    const res = await paper(db, '2');
    assert.equal(res.error, undefined, res.error);
    assert.doesNotMatch(res.html, /<div>\s*<strong>-<\/strong>/);
  } finally {
    console.warn = warn;
  }
});

/* ── ตัวอย่างจากหน้าสินค้า ───────────────────────────────────────────────── */

test('ตัวอย่าง = สเปคสด · ลายน้ำ "ตัวอย่าง" · เลขที่เป็นขีด · ใบไทย · บริษัทจากตั้งค่า', async () => {
  const db = fakeDb(seed(), { users: USERS });
  const res = await renderProductSpecSample(db, { productId: 'P-1', now: NOW });
  assert.equal(res.error, undefined, res.error);
  const { html } = res;
  assert.match(html, /class="watermark">ตัวอย่าง</);
  assert.match(html, /<dt>เลขที่<\/dt><dd>-<\/dd>/);
  assert.match(html, /<h1>รายละเอียดผลิตภัณฑ์<\/h1>/, 'ไม่มี SO = ใบไทย');
  assert.match(html, /เนื้อสเปคสดวันนี้/);
  assert.match(html, /<strong>บริษัท จากหน้าตั้งค่า จำกัด<\/strong>/);
  assert.match(html, /22\/09\/2569/, 'วันที่จัดทำ = วันนี้ (พ.ศ.)');
  assert.match(html, /ลูกค้าในทะเบียน/, 'ไม่มี SO = ชื่อลูกค้าจากทะเบียนสินค้า');
  assert.equal(revWrites(db).length, 0);
});

test('ตัวอย่างของสินค้าที่ยังไม่มีสเปค = error ภาษาไทยพร้อมสถานะ', async () => {
  const db = fakeDb(seed({ product_specs: [] }), { users: USERS });
  const res = await renderProductSpecSample(db, { productId: 'P-1', now: NOW });
  assert.match(res.error, /ยังไม่มีสเปค/);
  assert.equal(res.status, 400);
});

/* ── คำตอบของเราต์ ──────────────────────────────────────────────────────── */

test('ล้มแล้วแท็บที่เปิดด้วย window.open ได้หน้าภาษาไทย · apiFetch ได้ { error } ภาษาไทย', async () => {
  const htmlReq = new Request('http://x/doc', { headers: { accept: 'text/html,application/xhtml+xml' } });
  const page = specPaperErrorResponse(htmlReq, 'forbidden', 403);
  assert.equal(page.status, 403);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const text = await page.text();
  assert.match(text, /คุณไม่มีสิทธิ์เปิดเอกสารนี้/);
  assert.match(text, /lang="th"/);

  const jsonReq = new Request('http://x/doc', { headers: { accept: '*/*' } });
  const json = specPaperErrorResponse(jsonReq, 'ไม่พบเอกสารนี้', 404);
  assert.equal(json.status, 404);
  assert.deepEqual(await json.json(), { error: 'ไม่พบเอกสารนี้' });
});

test('escape ข้อความในหน้าแจ้งเหตุ', async () => {
  const req = new Request('http://x/doc', { headers: { accept: 'text/html' } });
  const text = await specPaperErrorResponse(req, '<script>x</script>', 500).text();
  assert.doesNotMatch(text, /<script>x<\/script>/);
});
