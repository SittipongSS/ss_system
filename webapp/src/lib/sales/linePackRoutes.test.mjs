// ── เลขแพ็คของบรรทัดใบเสนอราคา: เทสต์ที่ **เรียกตัว handler จริง** ของสองเส้นทางที่เขียนบรรทัด (mig 0407 · docs/qt-pack-column.md) ──
//     PATCH /api/sales-planning/quotations/[id]          (บันทึกเนื้อหาใบ — รวมทางที่ส่งบรรทัดที่เก็บไว้กลับไปทั้งก้อน)
//     POST  /api/sales-planning/quotations/[id]/revise   (ออก Rev.)
//
// 🐞 รีวิว 08/10 (js-01): ยามของสองไฟล์นี้เคยเป็น "ยามซอร์ส" ล้วน (เช็กว่ามีข้อความเรียกฟังก์ชัน และลำดับของมัน) เพราะเชื่อว่า import
//    ตัว route ใต้ node ไม่ได้ — ตัวกลายพันธุ์เก้าตัวจึงรอดทั้งชุดเทสต์ 12,420 ตัว:
//      ถอดเลขแพ็คในทางที่ส่งบรรทัดที่เก็บไว้กลับไป · sync ราคาบนบรรทัดที่ถูกถอด · ถอดก่อนคิดยอด/ก่อน RPC · คิดยอดหัวใบจากบรรทัดที่ถูกถอด
//      · ลายนิ้วมือตอนส่งคิดจากบรรทัดที่ถูกถอด · ไม่ใช้ผลของด่าน (ทั้งสองเส้น) · sync ราคาของ Rev. บนบรรทัดที่ถูกถอด · ลบคีย์ก่อนสร้างแถว Rev.
//    ผลเมื่อเปิดช่อง: บันทึกแค่ VAT แล้วเลขแพ็ค 1 หายเงียบ (ยอดเท่าเดิม CHECK มองไม่เห็น) · ยอดหัวใบ = จำนวน × ราคา ทั้งที่บรรทัดเก็บ
//    แพ็ค × จำนวน × ราคา (ฐานไม่มีกฎผูกหัวใบกับบรรทัด และ Won / ยอดใบสั่งขาย / Actual อ่านยอดหัวใบ)
// ⭐ ไฟล์นี้ import ตัว handler จริงได้ด้วยท่าเดียวกับ lib/service/surveySendRoute.test.mjs: เสียบของปลอมที่ขอบ (ตัวตนผู้ใช้ · client ของฐาน ·
//    audit · ของข้างเคียงที่ไม่เกี่ยวกับบรรทัด) ผ่าน resolve hook แล้วเรียก PATCH / POST ด้วย Request จริง — โค้ดของ route เองถูกรัน ไม่ใช่สำเนาในเทสต์
//    (ครอบกิ่งที่แตะบรรทัด · ยอด · เลขแพ็ค — กิ่งที่อยู่/ผู้ติดต่อ/metadata ของ PATCH ไม่อยู่ในไฟล์นี้)
// ⭐ "ช่องเปิด" ในไฟล์นี้ = จำลองการแก้ค่าคงที่ QUOTE_PACK_INPUT_OPEN (ทางเดียวที่งวด PR-3 จะเปิดช่อง): ตัวห่อของ '@/lib/sales/linePacks'
//    ส่งออกสวิตช์เป็น live binding ที่เทสต์สลับได้ + ให้ด่าน linePackIssues ใช้ค่าตั้งต้นเดียวกัน ⇒ route ไม่ต้องมีช่องสำหรับเทสต์
//    (และยังไม่มี — ยาม linePackWritePaths.test.mjs) · ปิดสวิตช์จำลอง = โค้ดจริงของวันนี้ทุกบรรทัด
// 🔴 dev DB = prod DB: client ของฐานเป็นของปลอมในหน่วยความจำ · คีย์ของฐานจริงถูกลบออกจากโปรเซสนี้ · ตารางที่ไม่ได้ประกาศ = เทสต์แดง
import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

for (const key of [
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'SUPABASE_SECRET_KEY',
]) delete process.env[key];

const WEBAPP = process.cwd();
const fileUrl = (rel) => pathToFileURL(path.join(WEBAPP, rel)).href;
const dataUrl = (src) => `data:text/javascript,${encodeURIComponent(src)}`;
const T = (globalThis.__packRoutes = { user: null, supabase: null, audits: [], side: [] });

/* ── ของปลอมที่ขอบ ───────────────────────────────────────────────────────────────────────────────────────
   ตัวห่อ = ของจริงทุก export + ทับเฉพาะชื่อที่ระบุ (โมดูลอื่นในกราฟที่ import ชื่ออื่นจากไฟล์เดียวกันยังได้ของจริง) */
const wrap = (rel, body) => dataUrl(`
  import * as real from ${JSON.stringify(fileUrl(rel))};
  export * from ${JSON.stringify(fileUrl(rel))};
  const T = globalThis.__packRoutes;
  ${body}
`);
const STUBS = {
  '@/lib/authUser': dataUrl('export async function getCurrentUser() { return globalThis.__packRoutes.user; }'),
  '@/lib/supabaseAdmin': dataUrl(`export function getSupabaseAdmin() {
    const s = globalThis.__packRoutes.supabase;
    if (!s) throw new Error('fake supabase missing');
    return s;
  }`),
  '@/lib/audit': wrap('src/lib/audit.js', 'export async function recordAudit(entry) { T.audits.push(entry); }'),
  // ของข้างเคียงของการออก Rev. ที่ไม่เกี่ยวกับบรรทัด (สัญญาที่อ้างใบเดิม · เหตุการณ์ลงเธรด) — จดไว้ว่าถูกเรียก ไม่แตะฐาน
  '@/lib/sales/contractQuotationSync': wrap('src/lib/sales/contractQuotationSync.js',
    'export async function syncContractsForQuotation(_supabase, arg) { T.side.push(["contracts", arg?.quotation?.id, arg?.quotation?.status]); }'),
  '@/lib/sales/documentThread': wrap('src/lib/sales/documentThread.js',
    'export async function appendDocumentEvent(_supabase, arg) { T.side.push(["thread", arg?.doc?.id, arg?.action]); }'),
  /* สวิตช์จำลอง: `packInputOpen = QUOTE_PACK_INPUT_OPEN` (ค่าตั้งต้นของพารามิเตอร์) ถูกคิดทุกครั้งที่เรียก จึงเห็นค่าที่เทสต์เพิ่งสลับ
     · ด่าน linePackIssues ของจริงอ่านค่าคงที่ในไฟล์ของมันเอง ⇒ ตัวห่อส่งค่าตั้งต้นเดียวกันให้ (ผู้เรียกที่ระบุ open เองยังชนะ) */
  '@/lib/sales/linePacks': wrap('src/lib/sales/linePacks.js', `
    export let QUOTE_PACK_INPUT_OPEN = real.QUOTE_PACK_INPUT_OPEN;
    export function linePackIssues(lines, options = {}) { return real.linePackIssues(lines, { open: QUOTE_PACK_INPUT_OPEN, ...options }); }
    T.setOpen = (value) => { QUOTE_PACK_INPUT_OPEN = value; };
    T.switchIs = () => QUOTE_PACK_INPUT_OPEN;
  `),
};
register(dataUrl(`
  const STUBS = ${JSON.stringify(STUBS)};
  export async function resolve(s, c, n) {
    if (Object.hasOwn(STUBS, s)) return { url: STUBS[s], shortCircuit: true };
    return n(s === 'next/headers' ? 'next/headers.js' : s, c);
  }
`));

/* ⚠️ โมดูลของแอปทุกตัวต้องเข้ามา **หลัง** register — import แบบ static ถูกโหลดก่อนบรรทัดข้างบนจะรัน
   (quoteLines.js จะผูกกับ linePacks ตัวจริงไปแล้ว และสวิตช์จำลองจะไปไม่ถึงตัว normalize) */
const { PATCH } = await import('../../app/api/sales-planning/quotations/[id]/route.js');
const { POST: REVISE } = await import('../../app/api/sales-planning/quotations/[id]/revise/route.js');
const { quoteLineNet, quoteTotals } = await import('../salesPlanning.js');
const { normalizeManualLines } = await import('./quoteLines.js');
const { buildQuotationRevisionContent } = await import('./quotationRevision.js');
const { quotationApprovalFingerprint } = await import('./quotationApprovalFingerprint.js');
const realPacks = await import('./linePacks.js');
const { LINE_PACK_TEXT } = realPacks;

/* ── ฐานปลอม: ตัวสร้างคำสั่งแบบ supabase-js (ต่อโซ่ได้ · await ได้ทุกจุด) — จดทุกคำสั่งตามลำดับ ส่งให้ตัวตอบของตารางนั้น ──
   ตารางที่ไม่มีตัวตอบ / RPC ที่ไม่ได้ประกาศ = โยน (เทสต์แดง) — เส้นทางเริ่มอ่าน/เขียนของใหม่เมื่อไรต้องรู้ */
function fakeDb(tables, rpcs = {}) {
  const calls = [];
  const run = (q) => {
    calls.push(q);
    const answer = tables[q.table];
    if (!answer) throw new Error(`unexpected table: ${q.table} (${q.op})`);
    return answer(q);
  };
  return {
    calls,
    from(table) {
      const q = { table, op: 'select', columns: null, payload: null, filters: [], single: null };
      const builder = {
        select(columns) { if (q.op === 'select') q.columns = columns ?? '*'; return builder; },
        insert(rows) { q.op = 'insert'; q.payload = rows; return builder; },
        update(values) { q.op = 'update'; q.payload = values; return builder; },
        delete() { q.op = 'delete'; return builder; },
        eq(column, value) { q.filters.push(['eq', column, value]); return builder; },
        in(column, values) { q.filters.push(['in', column, values]); return builder; },
        order() { return builder; },
        limit() { return builder; },
        maybeSingle() { q.single = 'maybe'; return builder; },
        single() { q.single = 'one'; return builder; },
        then(resolve, reject) { return Promise.resolve().then(() => run(q)).then(resolve, reject); },
      };
      return builder;
    },
    async rpc(name, args) {
      calls.push({ table: null, op: 'rpc', name, args });
      if (!rpcs[name]) throw new Error(`unexpected rpc: ${name}`);
      return rpcs[name](args);
    },
  };
}
const filterOf = (q, kind, column) => q.filters.find((f) => f[0] === kind && f[1] === column)?.[2];
const written = (db) => db.calls.filter((c) => c.op !== 'select');

/* ── ข้อมูลตัวอย่าง ─────────────────────────────────────────────────────────────────────────────────── */
const SDS_FG = 'FG-278-02-001-0757';          // หมวด 02-001 (ระบบกระจายกลิ่น SDS)
const PERFUME_FG = 'FG-336-01-009-1290';      // หมวดอื่น
const product = (id, fgCode, costPrice, saleUnit) => ({
  id, fgCode, customerId: 'CUS-1', categoryCode: null, productDescription: `สินค้า ${id}`, productDescriptionEn: null,
  brandName: null, brandNameEn: null, volume: null, volumeUnit: null, saleUnit, costPrice,
});
const MASTER = [product('P1', SDS_FG, 3500, 'แพ็คเกจ'), product('P2', SDS_FG, 3500, 'แพ็คเกจ'), product('P9', PERFUME_FG, 100, 'ชิ้น')];
const DRIFTED = [product('P1', SDS_FG, 4000, 'แพ็คเกจ'), product('P2', SDS_FG, 4000, 'แพ็คเกจ'), product('P9', PERFUME_FG, 100, 'ชิ้น')];
/* บรรทัดที่เก็บไว้ หน้าตาแบบที่ select * คืน (`packQty` = undefined → ไม่มีคีย์ = ฐานก่อนรัน 0407 · null = หลังรัน) */
const stored = (id, over = {}) => {
  const base = {
    id, quotationId: 'QT-1', productId: 'P1', fgCode: SDS_FG, description: 'สินค้า P1', qty: 12, unit: 'แพ็คเกจ', unitPrice: 3500,
    discountType: null, discountValue: 0, discountAmount: 0, source: 'manual', sortOrder: 0, metadata: {}, serviceRounds: null,
    createdAt: '2026-10-01T00:00:00Z', packQty: null, ...over,
  };
  const { packQty, ...rest } = base;
  const net = quoteLineNet(base);
  const line = { ...rest, discountAmount: net.discountAmount, lineTotal: over.lineTotal ?? net.lineTotal };
  return packQty === undefined ? line : { ...line, packQty };
};
/* สามบรรทัด: หมวด 02-001 มีเลขแพ็ค 2 + ส่วนลดบาท · หมวด 02-001 มีเลขแพ็ค 1 (จุดบอดของ CHECK) · หมวดอื่นไม่มีเลขแพ็ค */
const PACK_LINES = () => [
  stored('QTL-1', { packQty: 2, unit: 'เดือน', discountType: 'amount', discountValue: 14400 }),
  stored('QTL-2', { productId: 'P2', description: 'สินค้า P2', packQty: 1, unit: 'เดือน', sortOrder: 1 }),
  stored('QTL-3', { productId: 'P9', fgCode: PERFUME_FG, description: 'สินค้า P9', qty: 3, unit: 'ชิ้น', unitPrice: 100, sortOrder: 2 }),
];
/* ใบของวันนี้: ไม่มีเลขแพ็คสักบรรทัด — ขายสองแพ็คด้วยการพิมพ์ 24 ลงช่องจำนวน */
const TODAY_LINES = (packKey) => [
  stored('QTL-1', { qty: 24, discountType: 'amount', discountValue: 14400, packQty: packKey }),
  stored('QTL-2', { productId: 'P2', description: 'สินค้า P2', sortOrder: 1, packQty: packKey }),
  stored('QTL-3', { productId: 'P9', fgCode: PERFUME_FG, description: 'สินค้า P9', qty: 3, unit: 'ชิ้น', unitPrice: 100, sortOrder: 2, packQty: packKey }),
];
const DEAL = { id: 'DL-1', title: 'ดีลทดสอบ', stage: 'quotation', dealType: null, team: null, ownerId: null, ownerName: null, customerId: 'CUS-1', customerName: 'ลูกค้าทดสอบ', projectId: null };
const USER = { id: 'U-1', name: 'ผู้ทดสอบ', role: 'admin' };
function quoteOf(lines, over = {}) {
  const vatRate = over.vatRate ?? 7;
  return {
    id: 'QT-1', dealId: 'DL-1', quoteNumber: 'QT-26100001-0', baseNumber: 'QT-26100001', revisionNo: 0, status: 'draft',
    approvalStatus: 'not_submitted', approvalFingerprint: null, quoteDate: '2026-10-08', validUntil: null,
    customerId: 'CUS-1', customerName: 'ลูกค้าทดสอบ', customerNameEn: null, customerTaxId: null, billingAddress: 'ที่อยู่', shippingAddress: null,
    billingAddressEn: null, shippingAddressEn: null, branchCode: null, billingAddressId: null, shippingAddressId: null,
    contactName: null, contactPhone: null, contactEmail: null, discountType: null, discountValue: 0, vatRate,
    ...quoteTotals(lines, { vatRate }), paymentPlan: { type: 'full' }, paymentTerms: null, notes: null, referenceNote: null,
    metadata: {}, docLanguage: 'th', lines, deal: DEAL, ...over,
  };
}
const productsAnswer = (products) => (q) => ({ data: products.filter((p) => (filterOf(q, 'in', 'id') || []).includes(p.id)), error: null });
const totalsOf = (row) => ({ subtotal: row.subtotal, discountAmount: row.discountAmount, vatAmount: row.vatAmount, totalAmount: row.totalAmount });
const pick = (rows, keys) => rows.map((row) => keys.map((key) => row[key]));

async function withSwitch(open, fn) {
  T.setOpen(open);
  try { return await fn(); } finally { T.setOpen(realPacks.QUOTE_PACK_INPUT_OPEN); }
}
async function answer(response) {
  return { status: response.status, body: await response.json() };
}

/* PATCH ของใบ `quote` — คืนคำตอบ + ทุกคำสั่งที่ไปถึงฐานปลอม */
async function patchQuote({ quote, body, products = MASTER, rpcError = null }) {
  const db = fakeDb({
    quotations: (q) => {
      if (q.op !== 'select') throw new Error(`PATCH ต้องเขียนใบผ่าน RPC เท่านั้น — เจอ ${q.op} quotations`);
      return { data: structuredClone(quote), error: null };
    },
    products: productsAnswer(products),
    product_types: () => ({ data: [], error: null }),
  }, { save_quotation_content: () => ({ data: null, error: rpcError }) });
  Object.assign(T, { user: USER, supabase: db, audits: [], side: [] });
  const request = new Request(`http://localhost/api/sales-planning/quotations/${quote.id}`, { method: 'PATCH', body: JSON.stringify(body) });
  const result = await answer(await PATCH(request, { params: Promise.resolve({ id: quote.id }) }));
  const saves = db.calls.filter((c) => c.op === 'rpc');
  return { ...result, db, saves, save: saves[0]?.args ?? null };
}

/* POST …/revise ของใบ `quote` (อนุมัติแล้ว) */
async function reviseQuote({ quote, body = {}, products = MASTER, lineInsertError = null }) {
  const db = fakeDb({
    quotations: (q) => {
      if (q.op === 'select' && filterOf(q, 'eq', 'id')) return { data: structuredClone(quote), error: null };
      if (q.op === 'select' && filterOf(q, 'eq', 'baseNumber')) return { data: { revisionNo: quote.revisionNo }, error: null };
      if (q.op === 'insert') return { data: { ...q.payload }, error: null };
      if (q.op === 'update') return { data: { id: filterOf(q, 'eq', 'id') }, error: null };
      if (q.op === 'delete') return { data: null, error: null };
      throw new Error(`unexpected quotations ${q.op}`);
    },
    quotation_lines: (q) => {
      if (q.op === 'insert') return { data: null, error: lineInsertError };
      if (q.op === 'delete') return { data: null, error: null };
      throw new Error(`unexpected quotation_lines ${q.op}`);
    },
    customers: () => ({ data: { addresses: [], address: null, shippingAddress: null, branchCode: null, taxId: null, nameEn: null, contacts: [], contactPerson: null, contactPhone: null }, error: null }),
    products: productsAnswer(products),
    product_types: () => ({ data: [], error: null }),
  });
  Object.assign(T, { user: USER, supabase: db, audits: [], side: [] });
  const request = new Request(`http://localhost/api/sales-planning/quotations/${quote.id}/revise`, { method: 'POST', body: JSON.stringify(body) });
  const result = await answer(await REVISE(request, { params: Promise.resolve({ id: quote.id }) }));
  const of = (table, op) => db.calls.filter((c) => c.table === table && c.op === op);
  return {
    ...result, db,
    header: of('quotations', 'insert')[0]?.payload ?? null,
    lineInserts: of('quotation_lines', 'insert').map((c) => c.payload),
    sourceUpdate: of('quotations', 'update')[0] ?? null,
    headerDeletes: of('quotations', 'delete'),
  };
}
const approved = (lines, over = {}) => {
  const quote = quoteOf(lines, { status: 'sent', approvalStatus: 'approved', ...over });
  return { ...quote, approvalFingerprint: quotationApprovalFingerprint(quote, lines) };
};

/* ═══ ตัวตั้งของไฟล์ ═══════════════════════════════════════════════════════════════════════════════════════ */

test('ตัวตั้ง: สวิตช์จำลอง = ค่าคงที่จริง (ปิด) จนกว่าเทสต์จะสลับ · สลับแล้วไปถึงค่าตั้งต้นของตัว normalize · ตัวประกอบ Rev. · ด่าน — แล้วกลับมาปิด', async () => {
  assert.equal(realPacks.QUOTE_PACK_INPUT_OPEN, false, 'งวด PR-1: ช่องจริงปิด');
  assert.equal(T.switchIs(), false);
  const line = { description: 'x', qty: 1, unitPrice: 1, packQty: 2 };
  assert.throws(() => normalizeManualLines([line]), realPacks.LinePackError);
  assert.throws(() => buildQuotationRevisionContent({ lines: [line], vatRate: 7 }, {}), realPacks.LinePackError);
  await withSwitch(true, async () => {
    assert.equal(T.switchIs(), true);
    assert.deepEqual(normalizeManualLines([line]).map((l) => [l.packQty, l.lineTotal]), [[2, 2]]);
    assert.deepEqual(buildQuotationRevisionContent({ lines: [line], vatRate: 7 }, {}).lines.map((l) => l.packQty), [2]);
  });
  assert.equal(T.switchIs(), false);
  assert.throws(() => normalizeManualLines([line]), realPacks.LinePackError);
  // ค่าคงที่จริงไม่ถูกแตะ — สิ่งที่สลับคือ binding ของตัวห่อ
  assert.equal(realPacks.QUOTE_PACK_INPUT_OPEN, false);
});

test('ตัวตั้ง: โค้ดของแอปทุกไฟล์ที่ใช้ linePacks เรียกผ่าน \'@/lib/sales/linePacks\' — ทางอื่น (relative) = สวิตช์จำลองของไฟล์นี้ไปไม่ถึงไฟล์นั้น', () => {
  const root = path.join(WEBAPP, 'src');
  const importers = [];
  let scanned = 0;
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.(js|jsx|mjs)$/.test(entry) || /\.test\./.test(entry)) continue;
      scanned += 1;
      const src = readFileSync(full, 'utf8');
      for (const m of src.matchAll(/from\s+['"]([^'"]*linePacks(?:\.js)?)['"]/g)) importers.push([path.relative(root, full), m[1]]);
    }
  })(root);
  assert.ok(scanned > 500, `อ่านได้แค่ ${scanned} ไฟล์ — ตัวเดินโฟลเดอร์น่าจะพัง`);
  assert.ok(importers.length >= 7, `เจอผู้ใช้ linePacks แค่ ${importers.length} ไฟล์`);
  assert.deepEqual(importers.filter(([, spec]) => spec !== '@/lib/sales/linePacks'), []);
  // สองเส้นทางที่ไฟล์นี้ทดสอบอยู่ในรายการ — และตัว normalize / ตัวประกอบ Rev. / ตัวสร้างใบ ที่อ่านค่าตั้งต้นจากสวิตช์
  const files = importers.map(([file]) => file);
  for (const file of ['app/api/sales-planning/quotations/[id]/route.js', 'app/api/sales-planning/quotations/[id]/revise/route.js',
    'lib/sales/quoteLines.js', 'lib/sales/quotationRevision.js', 'lib/sales/createQuotationDraft.js']) assert.ok(files.includes(file), file);
});

/* ═══ PATCH — บันทึกเนื้อหาใบ ═════════════════════════════════════════════════════════════════════════════ */

test('⭐ PATCH แก้แค่ VAT (ส่งบรรทัดที่เก็บไว้กลับไปทั้งก้อน · ช่องเปิด): เลขแพ็ค 2 และ 1 ไปถึง p_lines ครบ · ยอดบรรทัดเท่าเดิม · ยอดหัวใบ = ผลรวมของบรรทัดชุดนั้น', async () => {
  const quote = quoteOf(PACK_LINES());
  assert.deepEqual(totalsOf(quote), { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 }, 'ตัวตั้ง: 69,600 + 42,000 + 300');
  const run = await withSwitch(true, () => patchQuote({ quote, body: { vatRate: 0 } }));
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.saves.length, 1, 'เรียก RPC บันทึกครั้งเดียว');
  assert.equal(run.save.p_quote_id, 'QT-1');
  const rows = run.save.p_lines;
  assert.deepEqual(pick(rows, ['id', 'packQty', 'qty', 'unitPrice', 'lineTotal']), [
    ['QTL-1', 2, 12, 3500, 69600], ['QTL-2', 1, 12, 3500, 42000], ['QTL-3', null, 3, 100, 300],
  ], 'บรรทัดที่เก็บไว้กลับไปถึง RPC พร้อมเลขแพ็คเดิม — รวมเลข 1 ที่ CHECK มองไม่เห็นว่าหาย');
  for (const row of rows) assert.equal(row.lineTotal, quoteLineNet(row).lineTotal, `${row.id}: ยอดของบรรทัด = สูตรกลางของบรรทัดนั้น`);
  assert.deepEqual(totalsOf(run.save.p_content), { subtotal: 111900, discountAmount: 0, vatAmount: 0, totalAmount: 111900 }, 'หัวใบคิดจากบรรทัดที่มีเลขแพ็ค (ไม่ใช่ 69,900 = จำนวน × ราคา)');
  assert.deepEqual(totalsOf(run.save.p_content), quoteTotals(rows, { vatRate: 0 }));
  assert.equal(run.save.p_content.vatRate, 0);
  assert.equal(T.audits.length, 1, 'บันทึกสำเร็จแล้วลง audit');
});

test('⭐ PATCH ส่วนลดท้ายใบ + ราคาทะเบียนขยับ (ช่องเปิด): ยอดบรรทัดคิดใหม่ = แพ็ค × จำนวน × ราคาใหม่ − ส่วนลดรายการ · เลขแพ็คไม่ถูกแตะ · หัวใบตาม', async () => {
  const quote = quoteOf(PACK_LINES());
  const run = await withSwitch(true, () => patchQuote({ quote, products: DRIFTED, body: { discountType: 'amount', discountValue: 900 } }));
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.deepEqual(pick(run.save.p_lines, ['packQty', 'unitPrice', 'lineTotal', 'unit']), [
    [2, 4000, 81600, 'เดือน'], [1, 4000, 48000, 'เดือน'], [null, 100, 300, 'ชิ้น'],
  ], '2 × 12 × 4,000 − 14,400 · 1 × 12 × 4,000 · บรรทัดหมวดอื่นเท่าเดิม');
  assert.deepEqual(totalsOf(run.save.p_content), { subtotal: 129900, discountAmount: 900, vatAmount: 9030, totalAmount: 138030 });
  assert.deepEqual(totalsOf(run.save.p_content), quoteTotals(run.save.p_lines, { discountType: 'amount', discountValue: 900, vatRate: 7 }));
});

test('⭐ PATCH พร้อมบรรทัดจากจอ (ช่องเปิด): เลขแพ็คที่จอส่งมา (ตัวเลข / ข้อความ) ไปถึง p_lines เป็นตัวเลข · ราคาจากทะเบียน · หน่วย = เดือน · หัวใบตาม', async () => {
  const quote = quoteOf(TODAY_LINES(null));
  const body = {
    lines: [
      { productId: 'P1', fgCode: SDS_FG, description: 'จอส่งอะไรมาก็ได้', qty: 12, unitPrice: 1, packQty: 2, discountType: 'amount', discountValue: 14400 },
      { productId: 'P2', fgCode: SDS_FG, description: 'x', qty: 12, unitPrice: 1, packQty: '1' },
      { productId: 'P9', fgCode: PERFUME_FG, description: 'x', qty: 3, unitPrice: 1, packQty: null },
    ],
  };
  const run = await withSwitch(true, () => patchQuote({ quote, body }));
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.deepEqual(pick(run.save.p_lines, ['packQty', 'unitPrice', 'lineTotal', 'unit']), [
    [2, 3500, 69600, 'เดือน'], [1, 3500, 42000, 'เดือน'], [undefined, 100, 300, 'ชิ้น'],
  ]);
  assert.equal('packQty' in run.save.p_lines[2], false, 'บรรทัดที่ไม่มีเลขแพ็คไม่มีคีย์ — RPC เก็บ NULL');
  assert.deepEqual(totalsOf(run.save.p_content), { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 });
});

test('🔴 PATCH ขณะช่องปิด (โค้ดจริงของวันนี้): บรรทัดที่เก็บไว้มีเลขแพ็ค = 400 บอกเลขรายการ — ไม่เรียก RPC ไม่ล้างเลขให้ (ผลของด่านถูกใช้)', async () => {
  const quote = quoteOf(PACK_LINES());
  for (const body of [{ vatRate: 0 }, { discountType: 'percent', discountValue: 5 }]) {
    const run = await patchQuote({ quote, body });
    assert.deepEqual([run.status, run.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.closed}`], JSON.stringify(body));
    assert.deepEqual(written(run.db), [], 'ไม่มีคำสั่งเขียน/เรียก RPC');
    assert.deepEqual(T.audits, []);
  }
});

test('🔴 PATCH ขณะช่องปิด: จอส่งเลขแพ็คมากับบรรทัด = 400 บอกเลขรายการ — ไม่อ่านทะเบียน ไม่เรียก RPC (ไม่ตัดคีย์ทิ้งแล้วบันทึกต่อ)', async () => {
  const quote = quoteOf(TODAY_LINES(null));
  for (const packQty of [2, '2', 1, 0, 'abc']) {
    const run = await patchQuote({
      quote,
      body: { lines: [{ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12 }, { productId: 'P2', fgCode: SDS_FG, description: 'x', qty: 12, packQty }] },
    });
    assert.deepEqual([run.status, run.body.error], [400, `รายการ 2: ${LINE_PACK_TEXT.closed}`], `packQty=${JSON.stringify(packQty)}`);
    assert.deepEqual(run.db.calls.map((c) => c.table), ['quotations'], 'อ่านแค่ใบ — แล้วหยุด');
  }
});

test('PATCH (ช่องเปิด) ด่านบนบรรทัดชุดสุดท้าย: หมวด 02-001 ไม่มีเลขแพ็ค = 400 · เลขแพ็คบนหมวดอื่น = 400 · ค่าที่ใช้ไม่ได้ = 400 — ไม่เรียก RPC', async () => {
  const quote = quoteOf(TODAY_LINES(null));
  const sds = (over = {}) => ({ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12, ...over });
  const perfume = (over = {}) => ({ productId: 'P9', fgCode: PERFUME_FG, description: 'x', qty: 3, ...over });
  const cases = [
    [{ lines: [sds({ packQty: 2 }), sds()] }, `รายการ 2: ${LINE_PACK_TEXT.required}`],
    [{ lines: [perfume({ packQty: 2 }), sds({ packQty: 1 })] }, `รายการ 1: ${LINE_PACK_TEXT.notAllowed}`],
    [{ lines: [sds({ packQty: 1.5 })] }, `รายการ 1: ${LINE_PACK_TEXT.invalid}`],
    // ทางที่ส่งบรรทัดที่เก็บไว้กลับไป: ใบเก่าหมวด 02-001 ที่ยังไม่มีเลขแพ็ค — วันที่เปิดช่อง การบันทึกเนื้อหาต้องกรอกก่อน (มติ A4)
    [{ vatRate: 0 }, `รายการ 1, 2: ${LINE_PACK_TEXT.required}`],
  ];
  for (const [body, message] of cases) {
    const run = await withSwitch(true, () => patchQuote({ quote, body }));
    assert.deepEqual([run.status, run.body.error], [400, message], JSON.stringify(body));
    assert.deepEqual(written(run.db), []);
  }
});

test('PATCH ของใบวันนี้ (ไม่มีเลขแพ็ค · ช่องปิด): แก้ VAT ผ่านเหมือนเดิมทั้งฐานก่อนรัน 0407 (ไม่มีคีย์) และหลังรัน (packQty: null) — ยอดเดิมทุกตัว', async () => {
  for (const [label, packKey] of [['ก่อนรัน 0407', undefined], ['หลังรัน 0407', null]]) {
    const quote = quoteOf(TODAY_LINES(packKey));
    assert.deepEqual(totalsOf(quote), { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 });
    const run = await patchQuote({ quote, body: { vatRate: 0 } });
    assert.equal(run.status, 200, `${label}: ${JSON.stringify(run.body)}`);
    assert.deepEqual(pick(run.save.p_lines, ['id', 'qty', 'unitPrice', 'lineTotal', 'unit']), [
      ['QTL-1', 24, 3500, 69600, 'แพ็คเกจ'], ['QTL-2', 12, 3500, 42000, 'แพ็คเกจ'], ['QTL-3', 3, 100, 300, 'ชิ้น'],
    ], label);
    // คีย์ packQty ของแถวที่ส่งกลับ = ตามที่ฐานคืนมา (ไม่มี / null) — ไม่มีแถวไหนได้ตัวเลข
    assert.deepEqual(run.save.p_lines.map((row) => ('packQty' in row ? row.packQty : 'ไม่มีคีย์')), Array(3).fill(packKey === undefined ? 'ไม่มีคีย์' : null), label);
    assert.deepEqual(totalsOf(run.save.p_content), { subtotal: 111900, discountAmount: 0, vatAmount: 0, totalAmount: 111900 }, label);
  }
});

test('⭐ PATCH ส่งลูกค้า (คีย์ status อย่างเดียว) ของใบที่อนุมัติแล้วและบรรทัดมีเลขแพ็ค: ลายนิ้วมือตอนส่งคิดจากบรรทัดที่พกเลขแพ็ค = ตรงกับที่อนุมัติ → ส่งได้', async () => {
  const lines = PACK_LINES();
  const quote = approved(lines, { status: 'draft' });
  // ลายนิ้วมือของใบนี้ต้องต่างจากใบเดียวกันที่ไม่มีเลขแพ็ค — ไม่งั้นเทสต์นี้พิสูจน์อะไรไม่ได้
  assert.notEqual(quote.approvalFingerprint, quotationApprovalFingerprint(quote, lines.map(({ packQty, ...rest }) => rest)));
  const run = await patchQuote({ quote, body: { status: 'sent' } });   // ช่องปิด — ทางนี้ไม่เขียนบรรทัด จึงไม่ผ่านด่านเลขแพ็ค
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.save.p_content.status, 'sent');
  assert.equal(run.save.p_lines, null, 'ส่งลูกค้าไม่เขียนบรรทัด');
  // ใบเดียวกันแต่ลายนิ้วมือที่เก็บไว้เป็นของเนื้อหาที่ไม่มีเลขแพ็ค (= เนื้อหาถูกแตะหลังอนุมัติ) → ส่งไม่ได้
  const touched = { ...quote, approvalFingerprint: quotationApprovalFingerprint(quote, lines.map(({ packQty, ...rest }) => rest)) };
  const refused = await patchQuote({ quote: touched, body: { status: 'sent' } });
  assert.equal(refused.status, 400);
  assert.deepEqual(written(refused.db), []);
});

test('PATCH: ฐานปฏิเสธด้วย CHECK ของ 0407 (กฎเงินของบรรทัด) = 500 ข้อความไทย ไม่ใช่ชื่อ constraint ดิบ — ไม่ลง audit', async () => {
  const quote = quoteOf(TODAY_LINES(null));
  const rpcError = { code: '23514', message: 'new row for relation "quotation_lines" violates check constraint "quotation_lines_line_money_rule"' };
  const run = await patchQuote({ quote, body: { vatRate: 0 }, rpcError });
  assert.deepEqual([run.status, run.body.error], [500, LINE_PACK_TEXT.moneyRule]);
  assert.deepEqual(T.audits, []);
  const other = await patchQuote({ quote, body: { vatRate: 0 }, rpcError: { code: '23505', message: 'duplicate key' } });
  assert.deepEqual([other.status, other.body.error], [500, 'duplicate key'], 'error อื่นส่งข้อความเดิม');
});

/* ═══ POST …/revise — ออก Rev. ════════════════════════════════════════════════════════════════════════════ */

test('⭐ ออก Rev. ของใบที่บรรทัดมีเลขแพ็ค 2 และ 1 (ช่องเปิด): แถวที่ INSERT พกเลขแพ็คครบทุกแถวรูปเดียวกัน · ยอด = แพ็ค × จำนวน × ราคา − ส่วนลด · หัวใบฉบับใหม่ = ผลรวมของแถวชุดนั้น', async () => {
  const quote = approved(PACK_LINES());
  const run = await withSwitch(true, () => reviseQuote({ quote }));
  assert.equal(run.status, 201, JSON.stringify(run.body));
  assert.equal(run.lineInserts.length, 1);
  const rows = run.lineInserts[0];
  assert.deepEqual(pick(rows, ['packQty', 'qty', 'unitPrice', 'discountAmount', 'lineTotal', 'unit']), [
    [2, 12, 3500, 14400, 69600, 'เดือน'], [1, 12, 3500, 0, 42000, 'เดือน'], [null, 3, 100, 0, 300, 'ชิ้น'],
  ], 'เลขแพ็ค 1 รอดการออก Rev. (ยอดเท่าเดิม — ฐานมองไม่เห็นถ้าหาย)');
  for (const row of rows) {
    assert.equal('packQty' in row, true, 'ทุกแถวของคำขอเดียวมีคีย์ชุดเดียวกัน');
    assert.equal(row.quotationId, run.header.id);
    assert.equal(row.lineTotal, quoteLineNet(row).lineTotal);
    assert.notEqual(row.id, undefined);
  }
  assert.ok(!rows.some((row) => ['QTL-1', 'QTL-2', 'QTL-3'].includes(row.id)), 'แถวของฉบับใหม่ได้ id ใหม่');
  assert.deepEqual(totalsOf(run.header), { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 });
  assert.deepEqual(totalsOf(run.header), quoteTotals(rows, { vatRate: 7 }));
  assert.deepEqual([run.header.quoteNumber, run.header.revisionNo, run.header.status, run.header.approvalStatus], ['QT-26100001-1', 1, 'draft', 'not_submitted']);
  // ใบเดิมกลายเป็น revised หลังบรรทัดเข้าครบ · ของข้างเคียงถูกเรียกหลังจากนั้น
  assert.deepEqual([run.sourceUpdate.payload.status, filterOf(run.sourceUpdate, 'eq', 'id')], ['revised', 'QT-1']);
  assert.deepEqual(T.side, [['contracts', 'QT-1', 'revised'], ['thread', 'QT-1', 'revise']]);
  assert.equal(T.audits.length, 1);
});

test('⭐ ออก Rev. + ราคาทะเบียนขยับ (ช่องเปิด): ยอดของฉบับใหม่ = แพ็ค × จำนวน × ราคาใหม่ − ส่วนลดรายการ · เลขแพ็คไม่ถูกแตะ · หัวใบตาม', async () => {
  const quote = approved(PACK_LINES());
  const run = await withSwitch(true, () => reviseQuote({ quote, products: DRIFTED }));
  assert.equal(run.status, 201, JSON.stringify(run.body));
  const rows = run.lineInserts[0];
  assert.deepEqual(pick(rows, ['packQty', 'unitPrice', 'lineTotal']), [[2, 4000, 81600], [1, 4000, 48000], [null, 100, 300]]);
  assert.deepEqual(totalsOf(run.header), { subtotal: 129900, discountAmount: 0, vatAmount: 9093, totalAmount: 138993 });
  assert.deepEqual(totalsOf(run.header), quoteTotals(rows, { vatRate: 7 }));
});

test('🔴 ออก Rev. ขณะช่องปิด: บรรทัดที่สืบทอดจากใบเดิมมีเลขแพ็ค = 400 บอกเลขรายการ — ไม่มีแถวไหนถูกสร้าง ใบเดิมไม่ถูกแตะ (ไม่ออกฉบับที่เลขแพ็คหาย)', async () => {
  const quote = approved(PACK_LINES());
  const run = await reviseQuote({ quote });
  assert.deepEqual([run.status, run.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.closed}`]);
  assert.deepEqual(written(run.db), []);
  assert.deepEqual([T.side, T.audits], [[], []]);
  // จอส่งบรรทัดใหม่ที่มีเลขแพ็คมากับคำขอออก Rev. ก็ถูกปฏิเสธเหมือนกัน
  const sent = await reviseQuote({ quote: approved(TODAY_LINES(null)), body: { lines: [{ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12, packQty: 2 }] } });
  assert.deepEqual([sent.status, sent.body.error], [400, `รายการ 1: ${LINE_PACK_TEXT.closed}`]);
  assert.deepEqual(written(sent.db), []);
});

test('ออก Rev. (ช่องเปิด) ด่านบนบรรทัดของฉบับใหม่: เลขแพ็คบนหมวดอื่น = 400 ก่อนสร้างแถวใด ๆ · หมวด 02-001 ที่ยังไม่มีเลขแพ็ค **ไม่ถูกบังคับ** ตอนออก Rev. (มติ 08/10 ข้อ 3)', async () => {
  const bad = await withSwitch(true, () => reviseQuote({
    quote: approved(TODAY_LINES(null)),
    body: { lines: [{ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12, packQty: 2 }, { productId: 'P9', fgCode: PERFUME_FG, description: 'x', qty: 3, packQty: 4 }] },
  }));
  assert.deepEqual([bad.status, bad.body.error], [400, `รายการ 2: ${LINE_PACK_TEXT.notAllowed}`]);
  assert.deepEqual(written(bad.db), [], 'ผลของด่านถูกใช้ — ไม่มีหัวใบ/บรรทัดของฉบับใหม่ค้าง');
  // ใบเก่าหมวด 02-001 ที่ไม่มีเลขแพ็ค: ออก Rev. ได้ (ด่านบังคับกรอกทักตอนบันทึก/ส่งร่างฉบับนั้น)
  const old = await withSwitch(true, () => reviseQuote({ quote: approved(TODAY_LINES(null)) }));
  assert.equal(old.status, 201, JSON.stringify(old.body));
  assert.deepEqual(pick(old.lineInserts[0], ['qty', 'lineTotal']), [[24, 69600], [12, 42000], [3, 300]]);
  for (const row of old.lineInserts[0]) assert.equal('packQty' in row, false);
});

test('ออก Rev. ของใบวันนี้ (ไม่มีเลขแพ็ค · ช่องปิด): แถวที่ INSERT ไม่มีคีย์ packQty สักแถว — คำขอไม่เอ่ยชื่อคอลัมน์ ใช้ได้ทั้งก่อนและหลังรัน 0407 · ยอดเดิม', async () => {
  for (const [label, packKey] of [['ก่อนรัน 0407', undefined], ['หลังรัน 0407', null]]) {
    const run = await reviseQuote({ quote: approved(TODAY_LINES(packKey)) });
    assert.equal(run.status, 201, `${label}: ${JSON.stringify(run.body)}`);
    const rows = run.lineInserts[0];
    assert.deepEqual(pick(rows, ['qty', 'unitPrice', 'discountAmount', 'lineTotal', 'unit']), [
      [24, 3500, 14400, 69600, 'แพ็คเกจ'], [12, 3500, 0, 42000, 'แพ็คเกจ'], [3, 100, 0, 300, 'ชิ้น'],
    ], label);
    for (const row of rows) assert.equal('packQty' in row, false, `${label}: คำขอ INSERT ต้องไม่เอ่ยชื่อคอลัมน์`);
    assert.deepEqual(totalsOf(run.header), { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 }, label);
  }
});

test('ออก Rev.: ฐานปฏิเสธบรรทัดด้วย CHECK ของ 0407 = 500 ข้อความไทย + ถอนหัวใบฉบับใหม่ที่เพิ่งสร้าง · ใบเดิมไม่ถูกเปลี่ยนเป็น revised', async () => {
  const lineInsertError = { code: '23514', message: 'new row for relation "quotation_lines" violates check constraint "quotation_lines_line_money_rule"' };
  const run = await reviseQuote({ quote: approved(TODAY_LINES(null)), lineInsertError });
  assert.deepEqual([run.status, run.body.error], [500, LINE_PACK_TEXT.moneyRule]);
  assert.equal(run.headerDeletes.length, 1);
  assert.equal(filterOf(run.headerDeletes[0], 'eq', 'id'), run.header.id, 'ถอนใบที่เพิ่งสร้าง ไม่ใช่ใบเดิม');
  assert.equal(run.sourceUpdate, null);
  assert.deepEqual([T.side, T.audits], [[], []]);
});
