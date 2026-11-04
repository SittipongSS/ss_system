// ── ใช้ Artwork ของสินค้ายื่นทะเบียนสรรพสามิต (มติเจ้าของ 04/11/2026 "ปุ่มใช้ไฟล์นี้ยื่น") ──────────────────────────────
//
// ⭐ สิ่งที่ไฟล์นี้ล็อก: ลำดับด่านเก้าข้อพร้อมข้อความไทยตรงตัว · **ไม่มีอะไรถูกคัดลอกก่อนด่านครบ** · ไฟล์ใหม่เป็นคนละใบกับ
//    ไฟล์ของสินค้า (ลบแถวของทะเบียนไม่แตะ Artwork ของสินค้า) · ใบรับออกให้คนกดด้วย id ของไฟล์ใหม่ · ออกใบรับไม่ได้ = ลบไฟล์ใหม่
//    · ตัวฝั่งเบราว์เซอร์สองจังหวะ (คัดลอก → แนบเป็น "ฉลาก / Artwork ที่ยื่น" พร้อม `sourceAttachmentId`)
// ⚠️ supabase ปลอมในหน่วยความจำ · Drive / ใบรับ / ด่านสิทธิ์เป็นตัวปลอมที่จดทุกการเรียก — ไม่มีอะไรถึงฐานหรือ Drive จริง
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import {
  ARTWORK_SOURCE_KEY, PRODUCT_ARTWORK_DOC_TYPE, REGISTRATION_ARTWORK_COPY_ERRORS as ERR, REGISTRATION_ARTWORK_DOC_TYPE,
  copyProductArtworkToRegistration, registrationArtworkSource,
} from './registrationArtworkCopy.js';
import {
  REUSE_SOURCE_DOC_TYPE, REUSE_SOURCE_KEY, REUSE_TARGET_DOC_TYPE, reusableProductArtwork, reuseProductArtwork,
} from './registrationArtworkReuse.js';
import { ATTACHMENT_TYPES } from '../master/attachmentTypes.js';

const admin = { id: 'U-ADMIN', name: 'แอดมิน', role: 'admin' };
const reg = (o = {}) => ({ id: 'REG-1', productId: 'PRD-1', customerId: 'CUS-1', status: 'draft', team: 'KA', ...o });
const product = (o = {}) => ({ id: 'PRD-1', fgCode: 'FG-0903-01-002-10154', customerId: 'CUS-1', ...o });
const artwork = (o = {}) => ({
  id: 'ATT-ART-1', entityType: 'product', entityId: 'PRD-1', docType: 'artwork', fileName: 'label.pdf', mimeType: 'application/pdf',
  driveFileId: 'SRC-ART-1', fileUrl: 'https://drive.google.com/file/d/SRC-ART-1/view', metadata: {}, ...o,
});

/* supabase ปลอม — รองรับเฉพาะรูปที่ตัวกลางใช้: select · eq (รวม `metadata->>key`) · limit · maybeSingle */
function fakeDb(seed = {}, { failOn = null } = {}) {
  const calls = [];
  const valueOf = (row, col) => {
    const m = /^(\w+)->>(\w+)$/.exec(col);
    return m ? row?.[m[1]]?.[m[2]] : row?.[col];
  };
  const from = (table) => {
    const q = { table, filters: [], limit: null };
    const run = () => {
      calls.push({ table, filters: q.filters.map((f) => [...f]) });
      if (failOn === table) return { data: null, error: { message: `boom ${table}` } };
      let rows = (seed[table] || []).filter((row) => q.filters.every(([col, val]) => String(valueOf(row, col) ?? '') === String(val ?? '')));
      if (q.limit != null) rows = rows.slice(0, q.limit);
      return { data: rows, error: null };
    };
    const builder = {
      select: () => builder,
      eq: (col, val) => { q.filters.push([col, val]); return builder; },
      limit: (n) => { q.limit = n; return Promise.resolve(run()); },
      maybeSingle: () => { const r = run(); return Promise.resolve(r.error ? r : { data: r.data[0] || null, error: null }); },
    };
    return builder;
  };
  return { from, calls };
}

/* Drive + ใบรับ + ด่านสิทธิ์ปลอม — จดทุกการเรียก */
function fakeDeps(o = {}) {
  const log = [];
  const deps = {
    canEditRegistrationFiles: async () => { log.push('canEdit'); return o.canEdit ?? true; },
    canViewProductFiles: async () => { log.push('canView'); return o.canView ?? true; },
    getFileMeta: async (id) => {
      log.push(`meta:${id}`);
      if (o.metaThrows) throw new Error('drive down');
      return { id, name: 'label.pdf', mimeType: 'application/pdf', size: '4', trashed: false, ...(o.meta || {}) };
    },
    getFileStream: async (id) => { log.push(`stream:${id}`); return Readable.from([Buffer.from('ABCD')]); },
    uploadForEntity: async (args) => {
      log.push(`upload:${args.entityType}:${args.entityId}:${args.name}`);
      if (o.uploadThrows) throw new Error('quota');
      return { id: 'COPY-1', webViewLink: 'https://drive.google.com/file/d/COPY-1/view' };
    },
    deleteFile: async (id) => { log.push(`delete:${id}`); },
    recordUploadReceipt: async (_db, args) => { log.push(`receipt:${args.driveFileId}:${args.userId}:${args.entityType}:${args.entityId}`); return o.receipt ?? { error: null }; },
    maxBytes: o.maxBytes,
  };
  return { deps, log };
}

const seed = (o = {}) => ({ products: [product()], attachments: [artwork()], ...o });
const run = (args, depsOverride = {}, dbOverride = {}) => {
  const { deps, log } = fakeDeps(depsOverride);
  const db = fakeDb(dbOverride.seed || seed(), dbOverride);
  return copyProductArtworkToRegistration(db, { registration: reg(), attachmentId: 'ATT-ART-1', user: admin, ...args }, deps)
    .then((result) => ({ result, log, db }));
};

test('ข้อความที่ผู้ใช้เห็น — ตรงตัว (แก้คำ = แก้ที่นี่ด้วย)', () => {
  assert.equal(ERR.status, 'ทะเบียนนี้ยื่นให้ RA แล้ว — ใช้ไฟล์ของสินค้าได้เฉพาะตอนเป็นฉบับร่างหรือถูกตีกลับ');
  assert.equal(ERR.used, 'ใช้ไฟล์นี้กับทะเบียนนี้ไปแล้ว');
  assert.equal(ERR.source, 'ไม่พบ Artwork นี้ในสินค้าของทะเบียน');
});

test('① รูปของ id ผิด = 400 ไม่แตะฐาน ไม่แตะ Drive', async () => {
  for (const attachmentId of [null, '', '   ', 42, { id: 'x' }, ['ATT-ART-1'], 'x'.repeat(201)]) {
    const { result, log, db } = await run({ attachmentId });
    assert.deepEqual(result, { status: 400, body: { error: ERR.shape } }, String(attachmentId));
    assert.deepEqual(log, []);
    assert.equal(db.calls.length, 0);
  }
  assert.equal(registrationArtworkSource(' ATT-1 '), 'ATT-1');
});

test('② ไม่พบทะเบียน / ไม่มีผู้ใช้ = 404 · ③ แนบเอกสารทะเบียนไม่ได้ = 403 — ก่อนถามสินค้าหรือ Drive', async () => {
  let r = await run({ registration: null });
  assert.equal(r.result.status, 404);
  assert.equal(r.result.body.error, ERR.registration);
  r = await run({ user: null });
  assert.equal(r.result.status, 404);
  r = await run({}, { canEdit: false });
  assert.deepEqual(r.result, { status: 403, body: { error: ERR.forbidden } });
  assert.deepEqual(r.log, ['canEdit']);
  assert.equal(r.db.calls.length, 0);
});

test('④ ทะเบียนที่ยื่นแล้ว/อนุมัติแล้ว = 409 · ร่างกับตีกลับผ่าน', async () => {
  for (const status of ['pending_legal', 'approved']) {
    const { result, log } = await run({ registration: reg({ status }) });
    assert.deepEqual(result, { status: 409, body: { error: ERR.status } }, status);
    assert.ok(!log.some((l) => l.startsWith('meta:') || l.startsWith('upload:')));
  }
  for (const status of ['draft', 'rejected']) {
    const { result } = await run({ registration: reg({ status }) });
    assert.equal(result.status, 201, status);
  }
});

test('⑤ แถวต้นทางต้องเป็น Artwork ของสินค้าของทะเบียนนี้ ที่คนกดอ่านได้ — ไม่ใช่ = 404 ไม่บอกว่ามีไฟล์', async () => {
  const cases = [
    seed({ attachments: [artwork({ entityId: 'PRD-OTHER' })] }),
    seed({ attachments: [artwork({ entityType: 'customer' })] }),
    seed({ attachments: [artwork({ docType: 'other' })] }),
    seed({ attachments: [artwork({ metadata: { retiredAt: '2026-11-01T00:00:00Z' } })] }),
    seed({ attachments: [] }),
    seed({ products: [] }),
  ];
  for (const s of cases) {
    const { result, log } = await run({}, {}, { seed: s });
    assert.deepEqual(result, { status: 404, body: { error: ERR.source } });
    assert.ok(!log.some((l) => l.startsWith('meta:')));
  }
  const noRead = await run({}, { canView: false });
  assert.deepEqual(noRead.result, { status: 404, body: { error: ERR.source } });
  const noProductId = await run({ registration: reg({ productId: null }) });
  assert.equal(noProductId.result.status, 404);
});

test('⑤ เอกสาร Google / แถวที่ไม่มีไฟล์ Drive = 400 บอกทางแนบเอง', async () => {
  for (const row of [artwork({ metadata: { kind: 'gdoc' } }), artwork({ driveFileId: null }), artwork({ driveFileId: '' })]) {
    const { result, log } = await run({}, {}, { seed: seed({ attachments: [row] }) });
    assert.deepEqual(result, { status: 400, body: { error: ERR.noBytes } });
    assert.ok(!log.some((l) => l.startsWith('meta:')));
  }
});

test('⑥ ใช้ไฟล์นี้กับทะเบียนนี้ไปแล้ว = 409 (ถามด้วย metadata->>sourceAttachmentId) · ใช้กับทะเบียนอื่นไม่นับ', async () => {
  const usedHere = { id: 'ATT-REG-1', entityType: 'registration', entityId: 'REG-1', docType: 'label_artwork', metadata: { [ARTWORK_SOURCE_KEY]: 'ATT-ART-1' } };
  let r = await run({}, {}, { seed: seed({ attachments: [artwork(), usedHere] }) });
  assert.deepEqual(r.result, { status: 409, body: { error: ERR.used } });
  assert.ok(!r.log.some((l) => l.startsWith('meta:')));
  const query = r.db.calls.find((c) => c.filters.some(([col]) => col === `metadata->>${ARTWORK_SOURCE_KEY}`));
  assert.deepEqual(query.filters, [['entityType', 'registration'], ['entityId', 'REG-1'], [`metadata->>${ARTWORK_SOURCE_KEY}`, 'ATT-ART-1']]);
  r = await run({}, {}, { seed: seed({ attachments: [artwork(), { ...usedHere, entityId: 'REG-2' }] }) });
  assert.equal(r.result.status, 201);
});

test('อ่านฐานพัง = 500 ไม่ใช่ปล่อยผ่าน', async () => {
  for (const failOn of ['products', 'attachments']) {
    const { result, log } = await run({}, {}, { failOn });
    assert.deepEqual(result, { status: 500, body: { error: ERR.read } }, failOn);
    assert.ok(!log.some((l) => l.startsWith('upload:')));
  }
});

test('⑦ ถาม Drive ไม่ได้ = 502 · ไฟล์ในถังขยะ/ของ Google/ไม่มีขนาด = 400 · ใหญ่เกิน = 400 ไม่คัดลอก', async () => {
  let r = await run({}, { metaThrows: true });
  assert.deepEqual(r.result, { status: 502, body: { error: ERR.driveCheck } });
  for (const meta of [{ trashed: true }, { mimeType: 'application/vnd.google-apps.document' }, { size: undefined }]) {
    r = await run({}, { meta });
    assert.deepEqual(r.result, { status: 400, body: { error: ERR.noBytes } }, JSON.stringify(meta));
    assert.ok(!r.log.some((l) => l.startsWith('upload:')));
  }
  r = await run({}, { meta: { size: '999' }, maxBytes: 10 });
  assert.deepEqual(r.result, { status: 400, body: { error: ERR.tooLarge } });
  assert.ok(!r.log.some((l) => l.startsWith('stream:') || l.startsWith('upload:')));
});

test('⭐ สำเร็จ: คัดลอกเป็นไฟล์ใหม่ในโฟลเดอร์ของทะเบียน · ใบรับของคนกดด้วย id ไฟล์ใหม่ · ไม่แตะ Artwork ของสินค้า', async () => {
  const { result, log } = await run({});
  assert.deepEqual(result, {
    status: 201,
    body: {
      url: 'https://drive.google.com/file/d/COPY-1/view', driveFileId: 'COPY-1', fileName: 'label.pdf',
      mimeType: 'application/pdf', sizeBytes: 4, sourceAttachmentId: 'ATT-ART-1',
    },
  });
  assert.deepEqual(log, [
    'canEdit', 'canView', 'meta:SRC-ART-1', 'stream:SRC-ART-1',
    'upload:registration:REG-1:label.pdf', 'receipt:COPY-1:U-ADMIN:registration:REG-1',
  ]);
  assert.ok(!log.some((l) => l.startsWith('delete:')));
});

test('⑧ คัดลอกไม่สำเร็จ = 502 · ⑨ ออกใบรับไม่ได้ = 503 + ลบไฟล์ใหม่ (ไม่ใช่ไฟล์ต้นทาง)', async () => {
  let r = await run({}, { uploadThrows: true });
  assert.deepEqual(r.result, { status: 502, body: { error: ERR.copy } });
  r = await run({}, { receipt: { error: { message: 'db down' } } });
  assert.deepEqual(r.result, { status: 503, body: { error: ERR.copy } });
  assert.ok(r.log.includes('delete:COPY-1'));
  assert.ok(!r.log.includes('delete:SRC-ART-1'));
});

test('ค่าคงที่สองฝั่งต้องตรงกัน (ฝั่งเบราว์เซอร์ import ตัว server ไม่ได้) และตรงทะเบียนชนิดเอกสาร', () => {
  assert.equal(REUSE_SOURCE_KEY, ARTWORK_SOURCE_KEY);
  assert.equal(REUSE_TARGET_DOC_TYPE, REGISTRATION_ARTWORK_DOC_TYPE);
  assert.equal(REUSE_SOURCE_DOC_TYPE, PRODUCT_ARTWORK_DOC_TYPE);
  assert.ok(ATTACHMENT_TYPES.registration.some((t) => t.key === REGISTRATION_ARTWORK_DOC_TYPE && t.required));
  assert.ok(ATTACHMENT_TYPES.product.some((t) => t.key === PRODUCT_ARTWORK_DOC_TYPE));
});

test('reusableProductArtwork: เฉพาะ Artwork ที่มีไฟล์ Drive · ตัดเอกสาร Google/ปลดระวาง/ปิดเนื้อหา/ใช้ไปแล้ว', () => {
  const rows = [
    artwork({ id: 'A1' }),
    artwork({ id: 'A2', docType: 'other' }),
    artwork({ id: 'A3', metadata: { kind: 'gdoc' } }),
    artwork({ id: 'A4', metadata: { retiredAt: 'x' } }),
    artwork({ id: 'A5', restricted: true }),
    artwork({ id: 'A6', driveFileId: null }),
    artwork({ id: 'A7' }),
  ];
  const regRows = [{ id: 'R1', docType: 'label_artwork', metadata: { [REUSE_SOURCE_KEY]: 'A7' } }];
  assert.deepEqual(reusableProductArtwork(rows, regRows).map((r) => r.id), ['A1']);
  assert.deepEqual(reusableProductArtwork(null, null), []);
});

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
async function withFetch(handler, runIt) {
  const original = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    const call = { url: String(url), method: init.method || 'GET', body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    return handler(call);
  };
  try {
    return { result: await runIt(), calls };
  } finally {
    globalThis.fetch = original;
  }
}
const COPY = { url: 'https://drive.google.com/file/d/COPY-1/view', driveFileId: 'COPY-1', fileName: 'label.pdf', mimeType: 'application/pdf', sizeBytes: 4, sourceAttachmentId: 'ATT-ART-1' };

test('⭐ ฝั่งเบราว์เซอร์: คัดลอก แล้วแนบเป็น "ฉลาก / Artwork ที่ยื่น" ของทะเบียนพร้อม sourceAttachmentId', async () => {
  const { result, calls } = await withFetch((call) => (call.url.includes('artwork-from-product')
    ? json(201, COPY)
    : json(201, { id: 'ATT-NEW', docType: 'label_artwork' })), () => reuseProductArtwork({ registrationId: 'REG 1', attachmentId: 'ATT-ART-1' }));
  assert.deepEqual(result, { ok: true, error: null, attachment: { id: 'ATT-NEW', docType: 'label_artwork' } });
  assert.deepEqual(calls[0], { url: '/api/excise-registrations/REG%201/artwork-from-product', method: 'POST', body: { attachmentId: 'ATT-ART-1' } });
  assert.deepEqual(calls[1], {
    url: '/api/master/attachments',
    method: 'POST',
    body: {
      entityType: 'registration', entityId: 'REG 1', docType: 'label_artwork', fileUrl: COPY.url, driveFileId: 'COPY-1',
      fileName: 'label.pdf', mimeType: 'application/pdf', sizeBytes: 4, metadata: { sourceAttachmentId: 'ATT-ART-1' },
    },
  });
  assert.equal(calls.length, 2);
});

test('🔴 ฝั่งเบราว์เซอร์: เส้นคัดลอกปฏิเสธ = คืนข้อความ server ตรงตัว ไม่แนบ · id ว่าง = ไม่ยิงอะไร', async () => {
  let { result, calls } = await withFetch(() => json(409, { error: ERR.used }), () => reuseProductArtwork({ registrationId: 'REG-1', attachmentId: 'ATT-ART-1' }));
  assert.deepEqual(result, { ok: false, error: ERR.used, attachment: null });
  assert.equal(calls.length, 1);
  ({ result, calls } = await withFetch(() => json(201, COPY), () => reuseProductArtwork({ registrationId: '', attachmentId: 'ATT-ART-1' })));
  assert.equal(result.ok, false);
  assert.equal(calls.length, 0);
});

test('🔴 ฝั่งเบราว์เซอร์: แนบไม่ผ่าน = ถอยไฟล์ที่เพิ่งคัดลอก (DELETE /api/upload)', async () => {
  const { result, calls } = await withFetch((call) => {
    if (call.url.includes('artwork-from-product')) return json(201, COPY);
    if (call.method === 'DELETE') return json(200, { ok: true });
    return json(403, { error: 'ทะเบียนนี้อนุมัติแล้ว ถูกล็อก' });
  }, () => reuseProductArtwork({ registrationId: 'REG-1', attachmentId: 'ATT-ART-1' }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(result.ok, false);
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url === '/api/upload' && c.body?.driveFileId === 'COPY-1'));
});

test('ยามซอร์ส: route ส่งต่อตัวกลาง · แผงทะเบียนส่ง onItemsChange ที่คงตัว · หน้าสินค้าใช้ป้ายของสายสรรพสามิต', () => {
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  const read = (rel) => strip(readFileSync(new URL(rel, import.meta.url), 'utf8'));
  const ROUTE = read('../../app/api/excise-registrations/[id]/artwork-from-product/route.js');
  assert.match(ROUTE, /copyProductArtworkToRegistration\(supabase, \{ registration: registration \|\| null, attachmentId, user \}\)/);
  assert.doesNotMatch(ROUTE, /from\('attachments'\)\.insert/);

  /* 🐞 04/11/2026: arrow ใหม่ทุก render ⇒ effect ของ AttachmentsPanel ยิง onItemsChange ซ้ำ ⇒ /requirements วนไม่หยุด */
  const MODAL = read('../../components/excise/RegistrationWorkModal.js');
  assert.doesNotMatch(MODAL, /onItemsChange=\{\s*\(/);
  assert.match(MODAL, /const onRegistrationFiles = useCallback\(/);
  assert.match(MODAL, /const onCustomerFiles = useCallback\(/);

  /* 🐞 04/11/2026: ทะเบียนฉบับร่างขึ้น "รออนุมัติ" บนหน้าสินค้า (ProductStatusPill รู้จักแค่อนุมัติ/ตีกลับ) */
  const PAGE = read('../../app/database/products/[id]/page.js');
  assert.doesNotMatch(PAGE, /<ProductStatusPill/);
  assert.match(PAGE, /<ExciseStatusBadge status=\{r\.status\} \/>/);
});
