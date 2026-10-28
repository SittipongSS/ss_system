// ── เลขแพ็คของบรรทัดใบเสนอราคา: เทสต์ที่ **เรียกตัว handler จริง** ของทุกเส้นทางที่เขียนบรรทัดหรือปล่อยใบออกจากมือ (mig 0407 · docs/qt-pack-column.md) ──
//     POST  /api/sales-planning/deals/[id]/quotations     (สร้างใบ — ผ่าน createQuotationDraft)
//     PATCH /api/sales-planning/quotations/[id]           (บันทึกเนื้อหาใบ — รวมทางที่ส่งบรรทัดที่เก็บไว้กลับไปทั้งก้อน · ส่งลูกค้าทางเดิม)
//     POST  /api/sales-planning/quotations/[id]/revise    (ออก Rev.)
//     POST  /api/sales-planning/quotations/[id]/submit    (ยื่นอนุมัติ)          ← ด่านใหม่ของงวด PR-3
//     POST  /api/sales-planning/quotations/[id]/approval  (อนุมัติ = ส่งลูกค้า)   ← ด่านใหม่ของงวด PR-3
//
// 🐞 รีวิว 08/10 (js-01): ยามของสองไฟล์นี้เคยเป็น "ยามซอร์ส" ล้วน (เช็กว่ามีข้อความเรียกฟังก์ชัน และลำดับของมัน) เพราะเชื่อว่า import
//    ตัว route ใต้ node ไม่ได้ — ตัวกลายพันธุ์เก้าตัวจึงรอดทั้งชุดเทสต์ 12,420 ตัว:
//      ถอดเลขแพ็คในทางที่ส่งบรรทัดที่เก็บไว้กลับไป · sync ราคาบนบรรทัดที่ถูกถอด · ถอดก่อนคิดยอด/ก่อน RPC · คิดยอดหัวใบจากบรรทัดที่ถูกถอด
//      · ลายนิ้วมือตอนส่งคิดจากบรรทัดที่ถูกถอด · ไม่ใช้ผลของด่าน (ทั้งสองเส้น) · sync ราคาของ Rev. บนบรรทัดที่ถูกถอด · ลบคีย์ก่อนสร้างแถว Rev.
// ⭐ ไฟล์นี้ import ตัว handler จริงได้ด้วยท่าเดียวกับ lib/service/surveySendRoute.test.mjs: เสียบของปลอมที่ขอบ (ตัวตนผู้ใช้ · client ของฐาน ·
//    audit · ของข้างเคียงที่ไม่เกี่ยวกับบรรทัด) ผ่าน resolve hook แล้วเรียก handler ด้วย Request จริง — โค้ดของ route เองถูกรัน ไม่ใช่สำเนาในเทสต์
// ⭐ งวด PR-3 (มติเจ้าของ 08/10 ข้อ A2–A4 + คำตัดสินข้อ 2–4): สวิตช์จริงเปิดแล้ว — เทสต์ที่ไม่ห่ออะไรคือ **ทางจริงของวันนี้**
//    · `withSwitch(false)` = จำลองค่าคงที่เป็น false ผ่านตัวห่อของ '@/lib/sales/linePacks' (สวิตช์เป็น live binding ที่เทสต์สลับได้ + ด่านใช้ค่าตั้งต้นเดียวกัน)
//      สำหรับเส้นทาง PATCH · ออก Rev. · สร้างใบ ผลนี้คือ **คำตอบของรุ่น PR-1 / PR-2 (รุ่นที่ถอยกลับไปได้)** — โค้ดสามเส้นนี้ในรุ่นนั้นเดินกิ่งเดียวกัน
//      🔴 ไม่ใช่สถานะที่ตั้งได้ในโค้ดรุ่นนี้: ห้ามตั้ง QUOTE_PACK_INPUT_OPEN กลับเป็น false (เหตุอยู่ที่ linePacks.js และเทสต์ท้ายไฟล์)
//    · route ไม่มีช่องสำหรับเทสต์ (ยาม linePackWritePaths.test.mjs) — ทางเดียวที่เทสต์ไปถึงกิ่งปิดของ route คือสวิตช์จำลองนี้
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
  /* ของข้างเคียงของการอนุมัติ / เปลี่ยนภาษา ที่ไม่เกี่ยวกับด่าน (ฉบับตรึง · PDF · ข้อมูลบริษัท · ยอด FC) — จดไว้ว่าถูกเรียก ไม่แตะฐาน
     ⇒ ด่านที่ปฏิเสธต้องไม่ทิ้งรอยอะไรไว้ใน T.side เลย */
  '@/lib/sales/issuedQuotationSnapshot': wrap('src/lib/sales/issuedQuotationSnapshot.js', `
    export async function captureIssuedQuotationSnapshot(_supabase, arg) {
      T.side.push(["snapshot", arg?.quote?.id, (arg?.quote?.lines || []).map((line) => line.packQty ?? null)]);
      return { snapshot: { id: "SNAP-1" }, artifact: { content: "<html></html>" } };
    }
    export async function reissueQuotationDocumentForLanguage(_supabase, arg) {
      T.side.push(["reissue", arg?.quote?.id, arg?.quote?.docLanguage]);
      return { snapshot: { id: "SNAP-2" }, artifact: { content: "<html></html>" } };
    }
  `),
  '@/lib/sales/issuedQuotationPdf': wrap('src/lib/sales/issuedQuotationPdf.js',
    'export function captureIssuedQuotationPdfLater(_supabase, arg) { T.side.push(["pdf", arg?.quotationId]); }'),
  '@/lib/admin/organizationSettings': wrap('src/lib/admin/organizationSettings.js',
    'export async function getPublishedCompanyProfile() { return { name: "บริษัททดสอบ" }; }'),
  '@/lib/sales/forecastSourceRepo': wrap('src/lib/sales/forecastSourceRepo.js',
    'export async function applyForecastSource(_supabase, dealId, opts) { T.side.push(["forecast", dealId, opts?.cause]); return { changed: false }; }'),
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
const { POST: SUBMIT } = await import('../../app/api/sales-planning/quotations/[id]/submit/route.js');
const { POST: APPROVE } = await import('../../app/api/sales-planning/quotations/[id]/approval/route.js');
const { POST: CREATE } = await import('../../app/api/sales-planning/deals/[id]/quotations/route.js');
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
        is(column, value) { q.filters.push(['is', column, value]); return builder; },
        in(column, values) { q.filters.push(['in', column, values]); return builder; },
        order() { return builder; },
        // ไล่หน้า (fetchAll) — ด่านสินค้า 04-003 ของใบขาย (exciseChargeLinesAdded) อ่านทะเบียนสินค้าผ่าน fetchAllInChunks
        range() { return builder; },
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
/* ใบเก่า (ก่อนมีช่อง "แพ็ค/เดือน" — 192 บรรทัดบนฐานจริงวันที่เปิดช่อง): ไม่มีเลขแพ็คสักบรรทัด ขายสองแพ็คด้วยการพิมพ์ 24 ลงช่องจำนวน
   บรรทัด 1–2 เป็นหมวด 02-001 · บรรทัด 3 หมวดอื่น */
const TODAY_LINES = (packKey) => [
  stored('QTL-1', { qty: 24, discountType: 'amount', discountValue: 14400, packQty: packKey }),
  stored('QTL-2', { productId: 'P2', description: 'สินค้า P2', sortOrder: 1, packQty: packKey }),
  stored('QTL-3', { productId: 'P9', fgCode: PERFUME_FG, description: 'สินค้า P9', qty: 3, unit: 'ชิ้น', unitPrice: 100, sortOrder: 2, packQty: packKey }),
];
/* ใบที่ไม่มีบรรทัดหมวด 02-001 เลย (ใบที่ไม่ใช่งานบริการ — ส่วนใหญ่ของระบบ): ด่านเลขแพ็คต้องไม่แตะใบพวกนี้สักทาง */
const PLAIN_LINES = (packKey = null) => [
  stored('QTL-1', { productId: 'P9', fgCode: PERFUME_FG, description: 'สินค้า P9', qty: 3, unit: 'ชิ้น', unitPrice: 100, packQty: packKey }),
  stored('QTL-2', { productId: null, fgCode: null, description: 'ค่าขนส่ง', qty: 1, unit: 'งาน', unitPrice: 500, sortOrder: 1, packQty: packKey }),
  stored('QTL-3', { productId: null, fgCode: null, description: 'ค่าติดตั้ง', qty: 2, unit: 'งาน', unitPrice: 250, sortOrder: 2, metadata: { categoryCode: '02-010', categoryName: 'ค่าติดตั้ง' }, packQty: packKey }),
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

/* ทะเบียนลูกค้าของใบตัวอย่าง — มีที่อยู่สองแถวและผู้ติดต่อสองคน ให้คำขอ "เลือกที่อยู่ / เลือกผู้ติดต่อ" ของ PATCH เดินได้จริง */
const CUSTOMER = {
  id: 'CUS-1', taxId: null, nameEn: null, address: null, shippingAddress: null, branchCode: null, contactPerson: null, contactPhone: null,
  addresses: [
    { id: 'ADR-1', label: 'สำนักงานใหญ่', address: '99 ถนนทดสอบ กรุงเทพฯ', useFor: 'both' },
    { id: 'ADR-2', label: 'คลังสินค้า', address: '1 ถนนคลัง สมุทรปราการ', useFor: 'both' },
  ],
  contacts: [{ name: 'คุณเอ', phone: '020000001', email: 'a@example.test' }, { name: 'คุณบี', phone: '020000002', email: '' }],
};

/* PATCH ของใบ `quote` — คืนคำตอบ + ทุกคำสั่งที่ไปถึงฐานปลอม
   ⚠️ ไม่ประกาศตาราง `products` ให้ (`products: null`) ได้ — คำขอที่ไม่เขียนบรรทัด/ยอดต้องไม่อ่านทะเบียนสินค้าเลย (อ่าน = เทสต์แดง) */
async function patchQuote({ quote, body, products = MASTER, rpcError = null, user = USER }) {
  const db = fakeDb({
    quotations: (q) => {
      if (q.op !== 'select') throw new Error(`PATCH ต้องเขียนใบผ่าน RPC เท่านั้น — เจอ ${q.op} quotations`);
      return { data: structuredClone(quote), error: null };
    },
    customers: () => ({ data: structuredClone(CUSTOMER), error: null }),
    ...(products ? { products: productsAnswer(products), product_types: () => ({ data: [], error: null }) } : {}),
  }, { save_quotation_content: () => ({ data: null, error: rpcError }) });
  Object.assign(T, { user, supabase: db, audits: [], side: [] });
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
/* ใบที่ยื่นแล้วรออนุมัติ — `by` = คนที่ยื่น (ผู้อนุมัติที่เป็นคนเดียวกันได้ข้อความคนละแบบ) */
const pending = (lines, by = 'U-2', over = {}) => {
  const quote = quoteOf(lines, {
    approvalStatus: 'pending', approvalRequestedBy: by, approvalRequestedByName: 'ผู้ยื่น', approvalRequestedAt: '2026-10-09T03:00:00Z',
    updatedAt: '2026-10-09T03:00:00Z', ...over,
  });
  return { ...quote, approvalFingerprint: quotationApprovalFingerprint(quote, lines) };
};

/* POST …/submit และ POST …/approval ของใบ `quote` — ฐานปลอมมี **ตารางเดียว** (quotations) + RPC ลงนามตัวเดียว:
   handler ไปอ่านตารางอื่น (เช่นทะเบียนสินค้า) หรือเรียก RPC อื่น = เทสต์แดง (แผน PR-3 §12 C12: ด่านตัดสินจากบรรทัดที่เก็บไว้) */
async function workflowCall({ handler, action, rpcName, quote, user = USER, body = {} }) {
  const db = fakeDb({
    quotations: (q) => {
      if (q.op !== 'select') throw new Error(`${action} ต้องเขียนใบผ่าน RPC ลงนามเท่านั้น — เจอ ${q.op} quotations`);
      return { data: structuredClone(quote), error: null };
    },
  }, {
    [rpcName]: (args) => ({
      data: {
        document: { id: quote.id, quoteNumber: quote.quoteNumber, approvalFingerprint: args.p_document_fingerprint, approvalStatus: action === 'submit' ? 'pending' : 'approved', status: action === 'submit' ? quote.status : 'sent' },
        evidence: { id: args.p_evidence_id },
      },
      error: null,
    }),
  });
  Object.assign(T, { user, supabase: db, audits: [], side: [] });
  const request = new Request(`http://localhost/api/sales-planning/quotations/${quote.id}/${action}`, { method: 'POST', body: JSON.stringify(body) });
  const result = await answer(await handler(request, { params: Promise.resolve({ id: quote.id }) }));
  const signs = db.calls.filter((c) => c.op === 'rpc');
  return { ...result, db, signs, sign: signs[0]?.args ?? null };
}
const submitQuote = (args) => workflowCall({ handler: SUBMIT, action: 'submit', rpcName: 'submit_quotation_with_signature_evidence_atomic', ...args });
const approveQuote = (args) => workflowCall({ handler: APPROVE, action: 'approval', rpcName: 'approve_quotation_with_signature_evidence_atomic', ...args });

/* POST /api/sales-planning/deals/[id]/quotations — เส้นทางสร้างใบมาตรฐาน (คนกรอกบรรทัดเอง) ทั้งเส้นผ่าน createQuotationDraft */
async function createQuote({ body, products = MASTER, lineInsertError = null }) {
  const db = fakeDb({
    sales_deals: (q) => {
      if (q.op !== 'select') throw new Error(`unexpected sales_deals ${q.op}`);
      return { data: structuredClone(DEAL), error: null };
    },
    customers: () => ({ data: structuredClone(CUSTOMER), error: null }),
    products: productsAnswer(products),
    product_types: () => ({ data: [], error: null }),
    document_standard_versions: () => ({ data: null, error: null }),
    quotation_lines: (q) => {
      if (q.op !== 'insert') throw new Error(`unexpected quotation_lines ${q.op}`);
      return lineInsertError ? { data: null, error: lineInsertError } : { data: structuredClone(q.payload), error: null };
    },
    quotations: (q) => {
      if (q.op === 'delete') return { data: null, error: null };
      throw new Error(`สร้างใบต้องเขียนหัวใบผ่าน RPC ออกเลขเท่านั้น — เจอ ${q.op} quotations`);
    },
  }, { create_quotation_with_number: (args) => ({ data: { ...args.p_row, quoteNumber: 'QT-26100009-0', baseNumber: 'QT-26100009' }, error: null }) });
  Object.assign(T, { user: USER, supabase: db, audits: [], side: [] });
  const request = new Request(`http://localhost/api/sales-planning/deals/${DEAL.id}/quotations`, { method: 'POST', body: JSON.stringify(body) });
  const result = await answer(await CREATE(request, { params: Promise.resolve({ id: DEAL.id }) }));
  const of = (table, op) => db.calls.filter((c) => c.table === table && c.op === op);
  return {
    ...result, db,
    header: db.calls.find((c) => c.op === 'rpc')?.args?.p_row ?? null,
    lineInserts: of('quotation_lines', 'insert').map((c) => c.payload),
  };
}

/* แถวที่ฐานจะคืนเมื่ออ่านใบที่เพิ่งถูกเขียน: แถวที่คำขอ INSERT ไม่เอ่ยคีย์ packQty = NULL (คอลัมน์ไม่มีค่าตั้งต้น) */
const asStored = (rows) => rows.map((row) => ({ ...row, packQty: row.packQty ?? null }));
/* ใบร่างของฉบับ Rev. ที่เส้นทางออก Rev. เพิ่งสร้าง — ประกอบจากหัวใบและแถวที่มัน INSERT เอง (ไม่ใช่ข้อมูลที่เทสต์แต่งขึ้น) */
const draftFromRevision = (run) => ({ ...run.header, lines: asStored(run.lineInserts[0] || []), deal: DEAL });
/* เลขแพ็คที่ถูกเก็บ = เลขที่ส่งมา ทุกตัวอักษร: ข้อความฐานสิบของค่าที่เก็บ === ข้อความที่ส่งมา (ตัดช่องว่างหัวท้าย) — ไม่ปัด ไม่แปลง ไม่เติม */
const samePackText = (storedValue, sentValue) => String(storedValue) === String(sentValue).trim();

/* ═══ ตัวตั้งของไฟล์ ═══════════════════════════════════════════════════════════════════════════════════════ */

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 ข้อ A2–A4 · แผน IMPL_PLAN_PR3 §4 แถว 10 + §12 C2): เดิมสวิตช์จำลองเริ่มที่ "ปิด"
   (= ค่าคงที่จริงของงวด PR-1) แล้วเทสต์สลับเป็นเปิด — วันนี้ค่าคงที่จริงคือเปิด สวิตช์จำลองจึงเริ่มเปิด และ `withSwitch(false)` คือสิ่งที่ต้องไปถึง
   ตัว normalize · ตัวประกอบ Rev. · ด่าน แล้วกลับมาเปิด (ข้อยืนยันเดิมทุกข้ออยู่ครบ กลับทิศเท่านั้น) */
test('ตัวตั้ง: สวิตช์จำลอง = ค่าคงที่จริง (เปิด) จนกว่าเทสต์จะสลับ · สลับเป็นปิดแล้วไปถึงค่าตั้งต้นของตัว normalize · ตัวประกอบ Rev. · ด่าน — แล้วกลับมาเปิด', async () => {
  assert.equal(realPacks.QUOTE_PACK_INPUT_OPEN, true, 'งวด PR-3: ช่องจริงเปิด');
  assert.equal(T.switchIs(), true);
  const line = { description: 'x', qty: 1, unitPrice: 1, packQty: 2 };
  const wrapped = await import('@/lib/sales/linePacks');
  assert.deepEqual(normalizeManualLines([line]).map((l) => [l.packQty, l.lineTotal]), [[2, 2]]);
  assert.deepEqual(buildQuotationRevisionContent({ lines: [line], vatRate: 7 }, {}).lines.map((l) => l.packQty), [2]);
  assert.deepEqual(wrapped.linePackIssues([line]).map((issue) => issue.code), ['not_allowed'], 'ด่าน (ตัวห่อ) เปิด: บรรทัดที่ไม่มีหมวดถือเลขแพ็ค');
  await withSwitch(false, async () => {
    assert.equal(T.switchIs(), false);
    assert.throws(() => normalizeManualLines([line]), realPacks.LinePackError);
    assert.throws(() => buildQuotationRevisionContent({ lines: [line], vatRate: 7 }, {}), realPacks.LinePackError);
    assert.deepEqual(wrapped.linePackIssues([line]).map((issue) => issue.code), ['closed']);
    // ตัวเลือกที่ผู้เรียกระบุเองยังชนะค่าตั้งต้นของตัวห่อ (numbering ของ route ไปถึงตัวจริง)
    assert.deepEqual(wrapped.linePackIssues([{ ...line, sortOrder: 4 }], { numbering: 'submitted' }), [{ index: 0, row: 5, code: 'closed' }]);
  });
  assert.equal(T.switchIs(), true);
  assert.deepEqual(normalizeManualLines([line]).map((l) => l.packQty), [2]);
  // ค่าคงที่จริงไม่ถูกแตะ — สิ่งที่สลับคือ binding ของตัวห่อ
  assert.equal(realPacks.QUOTE_PACK_INPUT_OPEN, true);
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
  // ทุกเส้นทางที่ไฟล์นี้ทดสอบอยู่ในรายการ — และตัว normalize / ตัวประกอบ Rev. / ตัวสร้างใบ ที่อ่านค่าตั้งต้นจากสวิตช์
  const files = importers.map(([file]) => file);
  for (const file of ['app/api/sales-planning/quotations/[id]/route.js', 'app/api/sales-planning/quotations/[id]/revise/route.js',
    'app/api/sales-planning/quotations/[id]/submit/route.js', 'app/api/sales-planning/quotations/[id]/approval/route.js',
    'lib/sales/quoteLines.js', 'lib/sales/quotationRevision.js', 'lib/sales/createQuotationDraft.js']) assert.ok(files.includes(file), file);
});

/* ═══ PATCH — บันทึกเนื้อหาใบ ═════════════════════════════════════════════════════════════════════════════ */

test('⭐ PATCH แก้แค่ VAT (ส่งบรรทัดที่เก็บไว้กลับไปทั้งก้อน): เลขแพ็ค 2 และ 1 ไปถึง p_lines ครบ · ยอดบรรทัดเท่าเดิม · ยอดหัวใบ = ผลรวมของบรรทัดชุดนั้น', async () => {
  const quote = quoteOf(PACK_LINES());
  assert.deepEqual(totalsOf(quote), { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 }, 'ตัวตั้ง: 69,600 + 42,000 + 300');
  const run = await patchQuote({ quote, body: { vatRate: 0 } });
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

test('⭐ PATCH ส่วนลดท้ายใบ + ราคาทะเบียนขยับ: ยอดบรรทัดคิดใหม่ = แพ็ค × จำนวน × ราคาใหม่ − ส่วนลดรายการ · เลขแพ็คไม่ถูกแตะ · หัวใบตาม', async () => {
  const quote = quoteOf(PACK_LINES());
  const run = await patchQuote({ quote, products: DRIFTED, body: { discountType: 'amount', discountValue: 900 } });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.deepEqual(pick(run.save.p_lines, ['packQty', 'unitPrice', 'lineTotal', 'unit']), [
    [2, 4000, 81600, 'เดือน'], [1, 4000, 48000, 'เดือน'], [null, 100, 300, 'ชิ้น'],
  ], '2 × 12 × 4,000 − 14,400 · 1 × 12 × 4,000 · บรรทัดหมวดอื่นเท่าเดิม');
  assert.deepEqual(totalsOf(run.save.p_content), { subtotal: 129900, discountAmount: 900, vatAmount: 9030, totalAmount: 138030 });
  assert.deepEqual(totalsOf(run.save.p_content), quoteTotals(run.save.p_lines, { discountType: 'amount', discountValue: 900, vatRate: 7 }));
});

test('⭐ PATCH พร้อมบรรทัดจากจอ: เลขแพ็คที่จอส่งมา (ตัวเลข / ข้อความ) ไปถึง p_lines เป็นตัวเลข · ราคาจากทะเบียน · หน่วย = เดือน · หัวใบตาม', async () => {
  const quote = quoteOf(TODAY_LINES(null));
  const body = {
    lines: [
      { productId: 'P1', fgCode: SDS_FG, description: 'จอส่งอะไรมาก็ได้', qty: 12, unitPrice: 1, packQty: 2, discountType: 'amount', discountValue: 14400 },
      { productId: 'P2', fgCode: SDS_FG, description: 'x', qty: 12, unitPrice: 1, packQty: '1' },
      { productId: 'P9', fgCode: PERFUME_FG, description: 'x', qty: 3, unitPrice: 1, packQty: null },
    ],
  };
  const run = await patchQuote({ quote, body });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.deepEqual(pick(run.save.p_lines, ['packQty', 'unitPrice', 'lineTotal', 'unit']), [
    [2, 3500, 69600, 'เดือน'], [1, 3500, 42000, 'เดือน'], [undefined, 100, 300, 'ชิ้น'],
  ]);
  assert.equal('packQty' in run.save.p_lines[2], false, 'บรรทัดที่ไม่มีเลขแพ็คไม่มีคีย์ — RPC เก็บ NULL');
  assert.deepEqual(totalsOf(run.save.p_content), { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 });
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 · แผน §4 แถว 11 + §12 C2): เดิมชื่อ "ช่องปิด (โค้ดจริงของวันนี้)" — วันนี้โค้ดจริงเปิด
   เทสต์จึงรันใต้ `withSwitch(false)` และมีความหมายใหม่: คำตอบของรุ่น PR-1 / PR-2 ที่ถอยกลับไปได้ (ปฏิเสธดัง ๆ ไม่ล้างเลขให้) · ข้อยืนยันเดิมทุกข้อ */
test('🔴 PATCH — คำตอบของรุ่น PR-1 / PR-2 (รุ่นที่ถอยกลับไปได้): บรรทัดที่เก็บไว้มีเลขแพ็ค = 400 บอกเลขรายการ — ไม่เรียก RPC ไม่ล้างเลขให้ (ผลของด่านถูกใช้)', async () => {
  const quote = quoteOf(PACK_LINES());
  for (const body of [{ vatRate: 0 }, { discountType: 'percent', discountValue: 5 }]) {
    const run = await withSwitch(false, () => patchQuote({ quote, body }));
    assert.deepEqual([run.status, run.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.closed}`], JSON.stringify(body));
    assert.deepEqual(written(run.db), [], 'ไม่มีคำสั่งเขียน/เรียก RPC');
    assert.deepEqual(T.audits, []);
  }
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 · แผน §4 แถว 12 + §12 C2): เหมือนข้างบน — ใต้ `withSwitch(false)` */
test('🔴 PATCH — คำตอบของรุ่น PR-1 / PR-2 (รุ่นที่ถอยกลับไปได้): จอส่งเลขแพ็คมากับบรรทัด = 400 บอกเลขรายการ — ไม่อ่านทะเบียน ไม่เรียก RPC (ไม่ตัดคีย์ทิ้งแล้วบันทึกต่อ)', async () => {
  const quote = quoteOf(TODAY_LINES(null));
  for (const packQty of [2, '2', 1, 0, 'abc']) {
    const run = await withSwitch(false, () => patchQuote({
      quote,
      body: { lines: [{ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12 }, { productId: 'P2', fgCode: SDS_FG, description: 'x', qty: 12, packQty }] },
    }));
    assert.deepEqual([run.status, run.body.error], [400, `รายการ 2: ${LINE_PACK_TEXT.closed}`], `packQty=${JSON.stringify(packQty)}`);
    assert.deepEqual(run.db.calls.map((c) => c.table), ['quotations'], 'อ่านแค่ใบ — แล้วหยุด');
  }
});

test('🔴 PATCH ด่านบนบรรทัดชุดสุดท้าย (มติ A2–A4): หมวด 02-001 ไม่มีเลขแพ็ค = 400 · เลขแพ็คบนหมวดอื่น = 400 · ค่าที่ใช้ไม่ได้ (0 · 1.5 · 10000 · ข้อความ) = 400 — บอกเลขรายการ ไม่เรียก RPC', async () => {
  const quote = quoteOf(TODAY_LINES(null));
  const sds = (over = {}) => ({ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12, ...over });
  const perfume = (over = {}) => ({ productId: 'P9', fgCode: PERFUME_FG, description: 'x', qty: 3, ...over });
  const typed = (over = {}) => ({ description: 'ค่าบริการรายเดือน', qty: 6, unitPrice: 1200, metadata: { categoryCode: '02-001' }, ...over });
  const cases = [
    [{ lines: [sds({ packQty: 2 }), sds()] }, `รายการ 2: ${LINE_PACK_TEXT.required}`],
    [{ lines: [sds({ packQty: 2 }), sds({ packQty: null }), sds({ packQty: '' }), sds({ packQty: '  ' })] }, `รายการ 2, 3, 4: ${LINE_PACK_TEXT.required}`],
    [{ lines: [perfume({ packQty: 2 }), sds({ packQty: 1 })] }, `รายการ 1: ${LINE_PACK_TEXT.notAllowed}`],
    // บรรทัดพิมพ์เอง: หมวด 02-001 ต้องกรอก (มติ A3 — หมวดอย่างเดียว) · ไม่มีหมวด / หมวดอื่น ห้ามมีเลข
    [{ lines: [typed(), typed({ packQty: 3 })] }, `รายการ 1: ${LINE_PACK_TEXT.required}`],
    [{ lines: [typed({ packQty: 3 }), typed({ packQty: 3, metadata: { categoryCode: '02-010' } }), typed({ packQty: 1, metadata: {} })] }, `รายการ 2, 3: ${LINE_PACK_TEXT.notAllowed}`],
    // หลายชนิดในคำขอเดียว: ผิดหมวดก่อน แล้วที่ยังไม่กรอก
    [{ lines: [sds(), perfume({ packQty: 2 }), sds({ packQty: 1 }), sds()] }, `รายการ 2: ${LINE_PACK_TEXT.notAllowed} · รายการ 1, 4: ${LINE_PACK_TEXT.required}`],
    // ทางที่ส่งบรรทัดที่เก็บไว้กลับไป: ใบเก่าหมวด 02-001 ที่ยังไม่มีเลขแพ็ค — การบันทึกเนื้อหาต้องกรอกก่อน (มติ A4)
    [{ vatRate: 0 }, `รายการ 1, 2: ${LINE_PACK_TEXT.required}`],
    [{ discountType: 'percent', discountValue: 5 }, `รายการ 1, 2: ${LINE_PACK_TEXT.required}`],
  ];
  // ค่าที่ใช้ไม่ได้ทุกรูป: ปฏิเสธด้วย invalid — ไม่ปัด (1.5 ≠ 2) ไม่ตัด (10000 ≠ 1000) ไม่แปลง ("1,200" ≠ 1200) ไม่เก็บ NULL แทน
  for (const packQty of [0, '0', 1.5, '1.5', 10000, '10000', 'abc', '1,200', '2 แพ็ค', -2, '02', true, {}, [2]]) {
    cases.push([{ lines: [sds({ packQty: 2 }), sds({ packQty })] }, `รายการ 2: ${LINE_PACK_TEXT.invalid}`]);
  }
  for (const [body, message] of cases) {
    const run = await patchQuote({ quote, body });
    assert.deepEqual([run.status, run.body.error], [400, message], JSON.stringify(body));
    assert.deepEqual(Object.keys(run.body), ['error'], 'รูปคำตอบ: { error } อย่างเดียว');
    assert.deepEqual(written(run.db), []);
    assert.deepEqual([T.audits, T.side], [[], []]);
  }
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · **มติเจ้าของ 08/10 ข้อ A4: "เมื่อแก้หรือออก Rev."** · แผน §4 แถว 13): เดิมเทสต์นี้ยึดว่า
   "ใบของวันนี้แก้แค่ VAT แล้วผ่านเหมือนเดิม" — วันนี้ใบเก่าที่มีบรรทัดหมวด 02-001 ถูกปฏิเสธจนกว่าคนขายจะแยกแพ็ค (การเปลี่ยนที่ตั้งใจ)
   ข้อยืนยันเดิม (ยอดเดิมทุกตัว ทั้งฐานก่อน/หลังรัน 0407) อยู่ครบสองที่: (ก) คำตอบของรุ่น PR-1 / PR-2 (ใต้ withSwitch(false))
   (ข) ใบที่ไม่มีบรรทัดหมวด 02-001 บนโค้ดวันนี้ — ใบพวกนั้นต้องบันทึกได้เหมือนเดิมทุกตัวเลข */
test('🔴 PATCH ของใบเก่าหมวด 02-001 ที่ยังไม่ได้แยกแพ็ค: แก้แค่ VAT = 400 บอกรายการ 1, 2 ไม่เรียก RPC (มติ A4) · รุ่น PR-1 / PR-2 ผ่านเหมือนเดิม · ใบที่ไม่มีหมวด 02-001 ผ่านเหมือนเดิม', async () => {
  for (const [label, packKey] of [['ก่อนรัน 0407', undefined], ['หลังรัน 0407', null]]) {
    const quote = quoteOf(TODAY_LINES(packKey));
    assert.deepEqual(totalsOf(quote), { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 });
    // วันนี้ (ช่องเปิด): ปฏิเสธ — ไม่มีอะไรถูกเขียน ยอดที่เก็บไว้ไม่ขยับ
    const refused = await patchQuote({ quote, body: { vatRate: 0 } });
    assert.deepEqual([refused.status, refused.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.required}`], label);
    assert.deepEqual(written(refused.db), [], `${label}: ไม่เรียก RPC`);
    assert.deepEqual(T.audits, []);
    // (ก) คำตอบของรุ่น PR-1 / PR-2 (รุ่นที่ถอยกลับไปได้): ผ่านด้วยยอดเดิมทุกตัว — บรรทัดหมวด 02-001 ไม่ถูกถามเลขแพ็คในช่วงนั้น
    const run = await withSwitch(false, () => patchQuote({ quote, body: { vatRate: 0 } }));
    assert.equal(run.status, 200, `${label}: ${JSON.stringify(run.body)}`);
    assert.deepEqual(pick(run.save.p_lines, ['id', 'qty', 'unitPrice', 'lineTotal', 'unit']), [
      ['QTL-1', 24, 3500, 69600, 'แพ็คเกจ'], ['QTL-2', 12, 3500, 42000, 'แพ็คเกจ'], ['QTL-3', 3, 100, 300, 'ชิ้น'],
    ], label);
    // คีย์ packQty ของแถวที่ส่งกลับ = ตามที่ฐานคืนมา (ไม่มี / null) — ไม่มีแถวไหนได้ตัวเลข
    assert.deepEqual(run.save.p_lines.map((row) => ('packQty' in row ? row.packQty : 'ไม่มีคีย์')), Array(3).fill(packKey === undefined ? 'ไม่มีคีย์' : null), label);
    assert.deepEqual(totalsOf(run.save.p_content), { subtotal: 111900, discountAmount: 0, vatAmount: 0, totalAmount: 111900 }, label);
  }
  // (ข) ใบที่ไม่มีบรรทัดหมวด 02-001 บนโค้ดวันนี้: ผ่านเหมือนเดิม — บรรทัดกลับไปถึง RPC ตามที่เก็บ ไม่มีแถวไหนได้เลขแพ็ค
  for (const [label, packKey] of [['ก่อนรัน 0407', undefined], ['หลังรัน 0407', null]]) {
    const quote = quoteOf(PLAIN_LINES(packKey));
    assert.deepEqual(totalsOf(quote), { subtotal: 1300, discountAmount: 0, vatAmount: 91, totalAmount: 1391 });
    for (const body of [{ vatRate: 0 }, { discountType: 'amount', discountValue: 100 }, { lines: quote.lines }]) {
      const run = await patchQuote({ quote, body });
      assert.equal(run.status, 200, `${label} ${JSON.stringify(Object.keys(body))}: ${JSON.stringify(run.body)}`);
      assert.deepEqual(pick(run.save.p_lines, ['qty', 'unitPrice', 'lineTotal', 'unit']), [[3, 100, 300, 'ชิ้น'], [1, 500, 500, 'งาน'], [2, 250, 500, 'งาน']], label);
      for (const row of run.save.p_lines) assert.ok(row.packQty === null || row.packQty === undefined, 'ไม่มีแถวไหนได้เลขแพ็ค');
      assert.equal(run.save.p_content.subtotal, 1300);
    }
  }
});

/* ── เลขรายการในข้อความ = แถวที่คนเห็นบนจอ (งวด PR-3 · แผน §1 D2) ─────────────────────────────────────── */

test('⭐ PATCH เลขรายการ: จอส่ง [แพ็ค 2, จำนวน 0, ไม่มีแพ็ค] = "รายการ 3" (เดิมบอก 2) · บรรทัดที่เก็บไว้ sortOrder 0, 2, 5 = รายการ 1–3 ตามที่หน้าใบเรียง', async () => {
  const quote = quoteOf(TODAY_LINES(null));
  const sds = (over = {}) => ({ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12, ...over });
  const sent = await patchQuote({ quote, body: { lines: [sds({ packQty: '2' }), sds({ qty: 0 }), sds()] } });
  assert.deepEqual([sent.status, sent.body.error], [400, `รายการ 3: ${LINE_PACK_TEXT.required}`]);
  assert.deepEqual(written(sent.db), []);
  // บรรทัดจำนวน 0 ที่ไม่มีเลขแพ็คถูกตัดตามเดิม ไม่ถูกปฏิเสธ: คำขอเดียวกันที่แถว 3 กรอกแล้ว = ผ่าน สองบรรทัดถูกบันทึก
  const dropped = await patchQuote({ quote, body: { lines: [sds({ packQty: '2' }), sds({ qty: 0 }), sds({ packQty: 1 })] } });
  assert.equal(dropped.status, 200, JSON.stringify(dropped.body));
  assert.deepEqual(pick(dropped.save.p_lines, ['packQty', 'qty', 'sortOrder']), [[2, 12, 0], [1, 12, 2]]);
  // บรรทัดที่เก็บไว้ (ใบที่เคยมีแถวจำนวน 0 ถูกตัด — sortOrder มีช่องว่าง · ฐานคืนแถวไม่เรียง): แก้แค่ VAT → เลขรายการตามที่จอเรียง
  const gaps = quoteOf([
    stored('QTL-c', { sortOrder: 5 }),                                                            // จอ: รายการ 3 — ยังไม่กรอก
    stored('QTL-a', { packQty: 2, unit: 'เดือน', sortOrder: 0 }),                                  // จอ: รายการ 1 — กรอกแล้ว
    stored('QTL-b', { productId: 'P2', description: 'สินค้า P2', sortOrder: 2 }),                  // จอ: รายการ 2 — ยังไม่กรอก
  ]);
  const vat = await patchQuote({ quote: gaps, body: { vatRate: 0 } });
  assert.deepEqual([vat.status, vat.body.error], [400, `รายการ 2, 3: ${LINE_PACK_TEXT.required}`], 'ไม่ใช่ "รายการ 1, 3" (ตำแหน่งในอาร์เรย์) และไม่ใช่ "รายการ 3, 6" (sortOrder + 1)');
});

/* ── เซิร์ฟเวอร์ไม่แก้เลขแพ็ค: สิ่งที่ถูกเก็บ = สิ่งที่ส่งมา ทุกตัวอักษร (งวด PR-3 · แผน §3.4) ────────────────── */

test('🔴 PATCH ไม่เขียนเลขแพ็คใหม่: เลขที่ไปถึง p_lines = เลขที่จอส่งมาทุกตัวอักษร (1 · 2 · 43 · 9999 · ข้อความ · มีช่องว่าง) · บรรทัดที่ไม่ส่งเลขไม่ได้เลข — ไม่ปัด ไม่เติม ไม่ล้าง', async () => {
  const quote = quoteOf(TODAY_LINES(null));
  const sent = ['1', 1, '2', 2, '43', 43, '9999', 9999, ' 7 ', '10', '100', '1000', 250];
  const body = {
    lines: [
      ...sent.map((packQty, i) => ({ productId: i % 2 ? 'P2' : 'P1', fgCode: SDS_FG, description: `แถว ${i + 1}`, qty: 4, packQty })),
      { productId: 'P9', fgCode: PERFUME_FG, description: 'หมวดอื่น', qty: 3 },
      { productId: 'P9', fgCode: PERFUME_FG, description: 'หมวดอื่น', qty: 3, packQty: null },
      { description: 'พิมพ์เอง', qty: 1, unitPrice: 500, packQty: '' },
    ],
  };
  const run = await patchQuote({ quote, body });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  const rows = run.save.p_lines;
  assert.equal(rows.length, sent.length + 3);
  sent.forEach((value, i) => {
    assert.ok(samePackText(rows[i].packQty, value), `แถว ${i + 1}: ส่ง ${JSON.stringify(value)} เก็บ ${JSON.stringify(rows[i].packQty)}`);
    assert.equal(typeof rows[i].packQty, 'number');
    assert.equal(rows[i].lineTotal, Number(String(value).trim()) * 4 * 3500, `แถว ${i + 1}: ยอด = แพ็ค × จำนวน × ราคา`);
    assert.equal(rows[i].unit, 'เดือน');
  });
  // ข้อความ JSON ของเลขแพ็คทั้งชุดที่จะถูกเก็บ เทียบกับที่ส่งมา (ตัดช่องว่าง) — ตัวต่อตัว
  assert.equal(JSON.stringify(rows.slice(0, sent.length).map((row) => String(row.packQty))), JSON.stringify(sent.map((value) => String(value).trim())));
  for (const row of rows.slice(sent.length)) assert.equal('packQty' in row, false, 'บรรทัดที่ไม่ส่งเลขแพ็ค: ไม่มีคีย์ (RPC เก็บ NULL) — เซิร์ฟเวอร์ไม่เติมค่าตั้งต้น');
  assert.deepEqual(totalsOf(run.save.p_content), quoteTotals(rows, { vatRate: 7 }));
  // ทางที่ส่งบรรทัดที่เก็บไว้กลับไป (ไม่มีบรรทัดในคำขอ): เลขแพ็คของทุกแถวกลับไปถึง RPC เหมือนที่อ่านมาทุกไบต์ — รวมแถวที่เป็น null
  const storedQuote = quoteOf([
    stored('QTL-1', { packQty: 1, unit: 'เดือน' }), stored('QTL-2', { packQty: 9999, qty: 1, unit: 'เดือน', sortOrder: 1 }),
    stored('QTL-3', { packQty: 43, qty: 4, unitPrice: 3500, unit: 'เดือน', sortOrder: 2 }),
    stored('QTL-4', { productId: 'P9', fgCode: PERFUME_FG, description: 'สินค้า P9', qty: 3, unit: 'ชิ้น', unitPrice: 100, sortOrder: 3 }),
  ]);
  for (const patchBody of [{ vatRate: 0 }, { discountType: 'amount', discountValue: 1 }, { discountValue: 0 }]) {
    const back = await patchQuote({ quote: storedQuote, body: patchBody });
    assert.equal(back.status, 200, JSON.stringify(back.body));
    assert.equal(JSON.stringify(back.save.p_lines.map((row) => row.packQty)), JSON.stringify(storedQuote.lines.map((row) => row.packQty)), JSON.stringify(patchBody));
    assert.equal(JSON.stringify(back.save.p_lines.map((row) => row.packQty)), '[1,9999,43,null]');
  }
  // ราคาทะเบียนขยับ (เซิร์ฟเวอร์คิดยอดใหม่): เลขแพ็คยังเป็นของเดิมทุกแถว — คิดยอดด้วยเลขนั้น ไม่ได้แก้มัน
  const drifted = await patchQuote({ quote: storedQuote, products: DRIFTED, body: { vatRate: 0 } });
  assert.equal(JSON.stringify(drifted.save.p_lines.map((row) => row.packQty)), '[1,9999,43,null]');
  assert.deepEqual(drifted.save.p_lines.map((row) => row.lineTotal), [48000, 39996000, 688000, 300]);
});

/* ── ใบเก่า: คนขายแยก 172 → 43 × 4 เอง ยอดเท่าเดิม (มติ A4 · แผน §8.1) ─────────────────────────────────── */

test('⭐ PATCH แยกแพ็คของใบเก่า: ที่เก็บ 172 × 2,900 และ 24 × 3,500 − 14,400 (ไม่มีเลขแพ็ค) + จอส่ง 43 × 4 และ 2 × 12 → p_lines พกเลขที่คนพิมพ์ ยอดบรรทัดและยอดหัวใบเท่าเดิมทุกสตางค์', async () => {
  const OLD_MASTER = [product('P1', SDS_FG, 2900, 'แพ็คเกจ'), product('P2', SDS_FG, 3500, 'แพ็คเกจ'), product('P9', PERFUME_FG, 100, 'ชิ้น')];
  const old = quoteOf([
    stored('QTL-1', { qty: 172, unitPrice: 2900 }),
    stored('QTL-2', { productId: 'P2', description: 'สินค้า P2', qty: 24, discountType: 'amount', discountValue: 14400, sortOrder: 1 }),
  ]);
  assert.deepEqual(old.lines.map((l) => [l.packQty, l.qty, l.lineTotal]), [[null, 172, 498800], [null, 24, 69600]]);
  assert.deepEqual(totalsOf(old), { subtotal: 568400, discountAmount: 0, vatAmount: 39788, totalAmount: 608188 });
  // จอส่งบรรทัดที่โหลดมาทั้งก้อน (คีย์ของฐานติดมาด้วย) โดยแก้สองช่อง: แพ็ค/เดือน และจำนวน
  const resplit = [
    { ...old.lines[0], packQty: '43', qty: 4 },
    { ...old.lines[1], packQty: '2', qty: 12 },
  ];
  const run = await patchQuote({ quote: old, products: OLD_MASTER, body: { lines: resplit, vatRate: 7 } });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.deepEqual(pick(run.save.p_lines, ['packQty', 'qty', 'unitPrice', 'discountAmount', 'lineTotal', 'unit']), [
    [43, 4, 2900, 0, 498800, 'เดือน'], [2, 12, 3500, 14400, 69600, 'เดือน'],
  ], '43 × 4 × 2,900 = 498,800 · 2 × 12 × 3,500 − 14,400 = 69,600 — ยอดเดิมของทั้งสองบรรทัด');
  assert.deepEqual(totalsOf(run.save.p_content), totalsOf(old), 'ยอดหัวใบไม่ขยับ');
  // เนื้อหาเปลี่ยน (จำนวน + เลขแพ็ค) ⇒ การอนุมัติเดิมถูกล้าง: ใบต้องยื่นใหม่ — ลายนิ้วมือของฉบับที่แยกแล้วต่างจากฉบับเดิม
  assert.equal(run.save.p_content.approvalStatus, 'not_submitted');
  assert.notEqual(quotationApprovalFingerprint({ ...old, ...run.save.p_content }, run.save.p_lines), quotationApprovalFingerprint(old, old.lines));
  // แยกผิด (เลขแพ็ค 2 แต่จำนวนยังเป็น 24): เซิร์ฟเวอร์ไม่เดาและไม่แก้ให้ — เก็บตามที่ส่ง ยอด = 2 × 24 × 3,500 − 14,400 (จอเป็นคนเตือน "ยอดเดิม")
  const doubled = await patchQuote({ quote: old, products: OLD_MASTER, body: { lines: [resplit[0], { ...old.lines[1], packQty: '2' }] } });
  assert.equal(doubled.status, 200);
  assert.deepEqual(pick(doubled.save.p_lines, ['packQty', 'qty', 'lineTotal']), [[43, 4, 498800], [2, 24, 153600]]);
  // เลขแพ็ค 1 กับจำนวนเดิม = ยอดเดิม (ทางของรายการเหมาจ่าย · มติ A3) — รับ
  const lump = await patchQuote({ quote: old, products: OLD_MASTER, body: { lines: old.lines.map((line) => ({ ...line, packQty: 1 })) } });
  assert.equal(lump.status, 200);
  assert.deepEqual(pick(lump.save.p_lines, ['packQty', 'qty', 'lineTotal', 'unit']), [[1, 172, 498800, 'เดือน'], [1, 24, 69600, 'เดือน']]);
  assert.deepEqual(totalsOf(lump.save.p_content), totalsOf(old));
});

/* ── คำขอที่ไม่เขียนบรรทัด/ยอด ไม่ผ่านด่านเลขแพ็ค (แผน PR-3 §12 C4 — คำตัดสินของผู้ตรวจแผน ทับ D7) ───────────────
   ⚠️ ถ้าวันหนึ่งมีคนขยายด่านมาครอบคำขอพวกนี้ เทสต์นี้ต้องถูกย้ายโดยเจตนา พร้อมเหตุ — ไม่ใช่ลบ:
      ใบออกจากมือได้ทางยื่น / อนุมัติ / ส่ง เท่านั้น (ทั้งสามมีด่าน) · ไม่มีจอไหนส่งคำขอแบบนี้ · และด่านที่นี่ = ใบเก่าแก้ที่อยู่/ผู้ติดต่อไม่ได้ */
test('🔴 PATCH ที่ไม่เขียนบรรทัดหรือยอด ของร่างเก่าหมวด 02-001 **ไม่ถูกกั้น** (§12 C4): หมายเหตุ · วันที่ · เงื่อนไขชำระ · งวด · อ้างอิง · ที่อยู่ · ผู้ติดต่อ · metadata · สถานะร่าง = 200 เรียก RPC ด้วย p_lines null', async () => {
  const quote = quoteOf(TODAY_LINES(null));
  const bodies = [
    { notes: 'ลูกค้าขอเลื่อนส่ง' },
    { quoteDate: '2026-10-09', validUntil: '2026-11-08' },
    { paymentTerms: 'เครดิต 30 วัน' },
    { paymentPlan: { type: 'full' } },
    { referenceNote: 'PO-778' },
    { billingAddressId: 'ADR-2', shippingAddressId: 'ADR-1' },
    { contactIndex: 1 },
    { metadata: { internalNote: 'ตามเรื่องวันศุกร์' } },
    { status: 'draft' },
  ];
  for (const body of bodies) {
    // `products: null` = ฐานปลอมไม่มีตารางสินค้า: คำขอพวกนี้ต้องไม่อ่านทะเบียนสินค้า (ไม่ได้คิดบรรทัดใหม่)
    const run = await patchQuote({ quote, body, products: null });
    assert.equal(run.status, 200, `${JSON.stringify(body)}: ${JSON.stringify(run.body)}`);
    assert.equal(run.saves.length, 1, JSON.stringify(body));
    assert.equal(run.save.p_lines, null, `${JSON.stringify(body)}: ไม่เขียนบรรทัด`);
    for (const key of ['subtotal', 'totalAmount', 'vatAmount']) assert.equal(key in run.save.p_content, false, `${JSON.stringify(body)}: ไม่เขียนยอด ${key}`);
  }
  // สิ่งที่คำขอเปลี่ยนจริงไปถึง RPC (ไม่ใช่ผ่านเพราะไม่ได้ทำอะไร)
  const address = await patchQuote({ quote, body: { billingAddressId: 'ADR-2', shippingAddressId: 'ADR-1' }, products: null });
  assert.deepEqual([address.save.p_content.billingAddressId, address.save.p_content.billingAddress, address.save.p_content.shippingAddressId],
    ['ADR-2', '1 ถนนคลัง สมุทรปราการ', 'ADR-1']);
  const contact = await patchQuote({ quote, body: { contactIndex: 1 }, products: null });
  assert.deepEqual([contact.save.p_content.contactName, contact.save.p_content.contactPhone], ['คุณบี', '020000002']);
  // ภาษาเอกสารของใบเก่าที่อนุมัติแล้ว (ปุ่มสลับภาษาของหน้าต่างพิมพ์ — ผู้เรียกจริงรายเดียวที่ไม่ส่งบรรทัด): ผ่าน และฉบับตรึงภาษาใหม่ถูกออก
  const approvedOld = approved(TODAY_LINES(null));
  const language = await patchQuote({ quote: approvedOld, body: { docLanguage: 'en' }, products: null });
  assert.equal(language.status, 200, JSON.stringify(language.body));
  assert.deepEqual([language.save.p_content.docLanguage, language.save.p_lines], ['en', null]);
  assert.equal('approvalStatus' in language.save.p_content, false, 'เปลี่ยนภาษาไม่ล้างการอนุมัติ');
});

/* ── ส่งลูกค้าทางเดิม (PATCH { status: 'sent' }) — มติ 08/10 ข้อ 3 ─────────────────────────────────────── */

/* ⭐ ปรับคำอธิบายตามงวด PR-3 (มติเจ้าของ 08/10 ข้อ 3): เดิมคอมเมนต์บอกว่า "ทางนี้ไม่เขียนบรรทัด จึงไม่ผ่านด่านเลขแพ็ค" — วันนี้ทางส่งมีด่านของตัวเอง
   ใบตัวอย่างนี้ผ่านเพราะบรรทัดหมวด 02-001 มีเลขแพ็คครบ · ข้อยืนยันเดิม (ลายนิ้วมือคิดจากบรรทัดที่พกเลขแพ็ค) ไม่ขยับ */
test('⭐ PATCH ส่งลูกค้า (คีย์ status อย่างเดียว) ของใบที่อนุมัติแล้วและบรรทัดมีเลขแพ็คครบ: ผ่านด่านเลขแพ็ค · ลายนิ้วมือตอนส่งคิดจากบรรทัดที่พกเลขแพ็ค = ตรงกับที่อนุมัติ → ส่งได้', async () => {
  const lines = PACK_LINES();
  const quote = approved(lines, { status: 'draft' });
  // ลายนิ้วมือของใบนี้ต้องต่างจากใบเดียวกันที่ไม่มีเลขแพ็ค — ไม่งั้นเทสต์นี้พิสูจน์อะไรไม่ได้
  assert.notEqual(quote.approvalFingerprint, quotationApprovalFingerprint(quote, lines.map(({ packQty, ...rest }) => rest)));
  const run = await patchQuote({ quote, body: { status: 'sent' }, products: null });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.save.p_content.status, 'sent');
  assert.equal(run.save.p_lines, null, 'ส่งลูกค้าไม่เขียนบรรทัด');
  // ใบเดียวกันแต่ลายนิ้วมือที่เก็บไว้เป็นของเนื้อหาที่ไม่มีเลขแพ็ค (= เนื้อหาถูกแตะหลังอนุมัติ) → ส่งไม่ได้
  const touched = { ...quote, approvalFingerprint: quotationApprovalFingerprint(quote, lines.map(({ packQty, ...rest }) => rest)) };
  const refused = await patchQuote({ quote: touched, body: { status: 'sent' }, products: null });
  assert.equal(refused.status, 400);
  assert.deepEqual(written(refused.db), []);
});

test('🔴 PATCH ส่งลูกค้า ของใบเก่าหมวด 02-001 ที่ยังไม่ได้แยกแพ็ค: ใบที่อนุมัติแล้ว = 400 บอกรายการ + "ออก Rev." ไม่เรียก RPC · ใบที่ยังไม่ยื่น/รออนุมัติได้ข้อความของขั้นนั้นก่อน (ด่านอยู่หลังด่านความพร้อม)', async () => {
  // ใบเก่าที่อนุมัติแล้วแต่ยังเป็นร่าง (อนุมัติก่อน mig 0165 · หรือใบ grandfather not_required) — ลายนิ้วมือตรง ⇒ ด่านความพร้อมผ่าน แล้วมาติดด่านเลขแพ็ค
  for (const approvalStatus of ['approved', 'not_required']) {
    const old = approved(TODAY_LINES(null), { status: 'draft', approvalStatus });
    const run = await patchQuote({ quote: old, body: { status: 'sent' }, products: null });
    assert.deepEqual([run.status, run.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.required} — ${LINE_PACK_TEXT.beforeSend}`], approvalStatus);
    assert.equal(run.body.error, 'รายการ 1, 2: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ — ออก Rev. แล้วกรอกในฉบับใหม่ก่อนส่งลูกค้า');
    assert.deepEqual(written(run.db), [], 'ไม่เรียก RPC — ใบไม่ถูกส่ง');
    assert.deepEqual(T.audits, []);
  }
  // เลขรายการ = ลำดับที่หน้าใบเรียง (บรรทัดที่เก็บไว้ sortOrder 0, 2, 5 · อาร์เรย์ไม่เรียง)
  const gaps = approved([stored('QTL-c', { sortOrder: 5 }), stored('QTL-a', { packQty: 2, unit: 'เดือน', sortOrder: 0 }), stored('QTL-b', { productId: 'P2', sortOrder: 2 })], { status: 'draft' });
  const numbered = await patchQuote({ quote: gaps, body: { status: 'sent' }, products: null });
  assert.equal(numbered.body.error, `รายการ 2, 3: ${LINE_PACK_TEXT.required} — ${LINE_PACK_TEXT.beforeSend}`);
  // ร่างเก่าที่ยังไม่ยื่น: ข้อความของขั้นยื่น ไม่ใช่ข้อความเลขแพ็ค (คำแนะนำ "ออก Rev." ผิดสำหรับใบที่แค่ต้องยื่น)
  const draft = await patchQuote({ quote: quoteOf(TODAY_LINES(null)), body: { status: 'sent' }, products: null });
  assert.equal(draft.status, 400);
  assert.match(draft.body.error, /ยังไม่ได้ยื่นอนุมัติ/);
  assert.doesNotMatch(draft.body.error, /แพ็ค\/เดือน|ออก Rev\./);
  assert.deepEqual(written(draft.db), []);
  // ใบที่ไม่มีบรรทัดหมวด 02-001 และอนุมัติแล้ว: ส่งได้เหมือนเดิม
  const plain = approved(PLAIN_LINES(null), { status: 'draft' });
  const sent = await patchQuote({ quote: plain, body: { status: 'sent' }, products: null });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.save.p_content.status, 'sent');
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 · แผน §4 แถว 14): ข้อยืนยันเดิม (23514 → ข้อความไทย ไม่ลง audit) ไม่ขยับ
   แต่ใบตัวอย่างต้องผ่านด่านเลขแพ็คก่อนจึงจะไปถึง RPC ⇒ เปลี่ยนจากใบเก่าที่ไม่มีเลขแพ็ค (วันนี้ถูกด่านปฏิเสธ) เป็นใบที่บรรทัดมีเลขแพ็คครบ */
test('PATCH: ฐานปฏิเสธด้วย CHECK ของ 0407 (กฎเงินของบรรทัด) = 500 ข้อความไทย ไม่ใช่ชื่อ constraint ดิบ — ไม่ลง audit', async () => {
  const quote = quoteOf(PACK_LINES());
  const rpcError = { code: '23514', message: 'new row for relation "quotation_lines" violates check constraint "quotation_lines_line_money_rule"' };
  const run = await patchQuote({ quote, body: { vatRate: 0 }, rpcError });
  assert.equal(run.saves.length, 1, 'ใบนี้ผ่านด่านเลขแพ็คไปถึง RPC');
  assert.deepEqual([run.status, run.body.error], [500, LINE_PACK_TEXT.moneyRule]);
  assert.deepEqual(T.audits, []);
  const other = await patchQuote({ quote, body: { vatRate: 0 }, rpcError: { code: '23505', message: 'duplicate key' } });
  assert.deepEqual([other.status, other.body.error], [500, 'duplicate key'], 'error อื่นส่งข้อความเดิม');
  // ใบที่ไม่มีบรรทัดหมวด 02-001 ก็ได้ข้อความเดียวกันเมื่อ CHECK ปฏิเสธ
  const plain = await patchQuote({ quote: quoteOf(PLAIN_LINES(null)), body: { vatRate: 0 }, rpcError });
  assert.deepEqual([plain.status, plain.body.error], [500, LINE_PACK_TEXT.moneyRule]);
});

/* ── ยามในฐานของ mig 0410 (งวด PR-G): ข้อความไทยของ trigger ตามตัวอักษรจากไฟล์ migration ('' → ' · %s เติมตามลำดับ) ──
   ไม่มีโค้ดแอปที่ต้องแก้: route ส่ง error.message ต่อเมื่อรหัสไม่ใช่ 23514 (lineMoneyRuleMessage) — สองเทสต์นี้ยึดว่าจอได้ข้อความนั้นตรงตัว */
const GUARD_MESSAGES = [...readFileSync(path.join(WEBAPP, 'supabase/migrations/0410_quotation_line_pack_guard.sql'), 'utf8')
  .matchAll(/'(ไม่ได้บันทึก:(?:[^']|'')*)'/g)].map((m) => m[1].replaceAll("''", "'"));
const guardMessage = (index, ...values) => values.reduce((text, value) => text.replace('%s', String(value)), GUARD_MESSAGES[index]);

test('PATCH: ฐานปฏิเสธด้วยยาม 0410 (P0001 · บันทึกที่ทำเลขแพ็คหาย) = 500 ข้อความไทยของฐานตรงตัว — ไม่ถูกแปลงเป็นข้อความกฎเงิน · ไม่ลง audit', async () => {
  assert.equal(GUARD_MESSAGES.length, 3);
  const quote = quoteOf(PACK_LINES());
  const message = guardMessage(0, quote.quoteNumber, 2);
  assert.ok(message.startsWith(`ไม่ได้บันทึก: ใบเสนอราคา ${quote.quoteNumber} รายการที่ 2 (หมวด 02-001)`) && message.endsWith('[quotation_line_pack_lost]'));
  const run = await patchQuote({ quote, body: { vatRate: 0 }, rpcError: { code: 'P0001', message, details: 'quotation_line_pack_lost reason=rewrite' } });
  assert.equal(run.saves.length, 1, 'ใบนี้ผ่านด่านเลขแพ็คของเซิร์ฟเวอร์ไปถึง RPC (รุ่นปัจจุบันไม่ชนยาม — ฐานปฏิเสธแทนรุ่นเก่า)');
  assert.deepEqual([run.status, run.body.error], [500, message]);
  assert.deepEqual(T.audits, [], 'RPC ถอยทั้งก้อน — ไม่มีอะไรถูกบันทึก จึงไม่ลง audit');
});

/* ═══ POST …/revise — ออก Rev. ════════════════════════════════════════════════════════════════════════════ */

test('⭐ ออก Rev. ของใบที่บรรทัดมีเลขแพ็ค 2 และ 1: แถวที่ INSERT พกเลขแพ็คครบทุกแถวรูปเดียวกัน · ยอด = แพ็ค × จำนวน × ราคา − ส่วนลด · หัวใบฉบับใหม่ = ผลรวมของแถวชุดนั้น', async () => {
  const quote = approved(PACK_LINES());
  const run = await reviseQuote({ quote });
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
  // เลขแพ็คของฉบับใหม่ = ของใบเดิมทุกไบต์ (ทางก๊อป — ไม่มีอะไรถูกเขียนใหม่)
  assert.equal(JSON.stringify(rows.map((row) => row.packQty)), JSON.stringify(quote.lines.map((row) => row.packQty)));
  assert.deepEqual(totalsOf(run.header), { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 });
  assert.deepEqual(totalsOf(run.header), quoteTotals(rows, { vatRate: 7 }));
  assert.deepEqual([run.header.quoteNumber, run.header.revisionNo, run.header.status, run.header.approvalStatus], ['QT-26100001-1', 1, 'draft', 'not_submitted']);
  // ใบเดิมกลายเป็น revised หลังบรรทัดเข้าครบ · ของข้างเคียงถูกเรียกหลังจากนั้น
  assert.deepEqual([run.sourceUpdate.payload.status, filterOf(run.sourceUpdate, 'eq', 'id')], ['revised', 'QT-1']);
  assert.deepEqual(T.side, [['contracts', 'QT-1', 'revised'], ['thread', 'QT-1', 'revise']]);
  assert.equal(T.audits.length, 1);
});

test('⭐ ออก Rev. + ราคาทะเบียนขยับ: ยอดของฉบับใหม่ = แพ็ค × จำนวน × ราคาใหม่ − ส่วนลดรายการ · เลขแพ็คไม่ถูกแตะ · หัวใบตาม', async () => {
  const quote = approved(PACK_LINES());
  const run = await reviseQuote({ quote, products: DRIFTED });
  assert.equal(run.status, 201, JSON.stringify(run.body));
  const rows = run.lineInserts[0];
  assert.deepEqual(pick(rows, ['packQty', 'unitPrice', 'lineTotal']), [[2, 4000, 81600], [1, 4000, 48000], [null, 100, 300]]);
  assert.deepEqual(totalsOf(run.header), { subtotal: 129900, discountAmount: 0, vatAmount: 9093, totalAmount: 138993 });
  assert.deepEqual(totalsOf(run.header), quoteTotals(rows, { vatRate: 7 }));
});

/* ⭐ ย้ายความคาดหวังโดยเจตนา (งวด PR-3 · มติเจ้าของ 08/10 · แผน §4 แถว 15 + §12 C2): ใต้ `withSwitch(false)` = คำตอบของรุ่น PR-1 / PR-2 */
test('🔴 ออก Rev. — คำตอบของรุ่น PR-1 / PR-2 (รุ่นที่ถอยกลับไปได้): บรรทัดที่สืบทอดจากใบเดิมมีเลขแพ็ค = 400 บอกเลขรายการ — ไม่มีแถวไหนถูกสร้าง ใบเดิมไม่ถูกแตะ (ไม่ออกฉบับที่เลขแพ็คหาย)', async () => {
  const quote = approved(PACK_LINES());
  const run = await withSwitch(false, () => reviseQuote({ quote }));
  assert.deepEqual([run.status, run.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.closed}`]);
  assert.deepEqual(written(run.db), []);
  assert.deepEqual([T.side, T.audits], [[], []]);
  // จอส่งบรรทัดใหม่ที่มีเลขแพ็คมากับคำขอออก Rev. ก็ถูกปฏิเสธเหมือนกัน
  const sent = await withSwitch(false, () => reviseQuote({ quote: approved(TODAY_LINES(null)), body: { lines: [{ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12, packQty: 2 }] } }));
  assert.deepEqual([sent.status, sent.body.error], [400, `รายการ 1: ${LINE_PACK_TEXT.closed}`]);
  assert.deepEqual(written(sent.db), []);
});

test('ออก Rev. ด่านบนบรรทัดของฉบับใหม่: เลขแพ็คบนหมวดอื่น / ค่าที่ใช้ไม่ได้ = 400 ก่อนสร้างแถวใด ๆ · หมวด 02-001 ที่ยังไม่มีเลขแพ็ค **ไม่ถูกบังคับ** ตอนออก Rev. (มติ 08/10 ข้อ 3)', async () => {
  const bad = await reviseQuote({
    quote: approved(TODAY_LINES(null)),
    body: { lines: [{ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12, packQty: 2 }, { productId: 'P9', fgCode: PERFUME_FG, description: 'x', qty: 3, packQty: 4 }] },
  });
  assert.deepEqual([bad.status, bad.body.error], [400, `รายการ 2: ${LINE_PACK_TEXT.notAllowed}`]);
  assert.deepEqual(written(bad.db), [], 'ผลของด่านถูกใช้ — ไม่มีหัวใบ/บรรทัดของฉบับใหม่ค้าง');
  for (const packQty of [0, 1.5, 10000, 'abc']) {
    const invalid = await reviseQuote({ quote: approved(TODAY_LINES(null)), body: { lines: [{ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12, packQty }] } });
    assert.deepEqual([invalid.status, invalid.body.error], [400, `รายการ 1: ${LINE_PACK_TEXT.invalid}`], `packQty=${JSON.stringify(packQty)}`);
    assert.deepEqual(written(invalid.db), []);
  }
  // ใบเก่าหมวด 02-001 ที่ไม่มีเลขแพ็ค: ออก Rev. ได้ (ด่านบังคับกรอกทักตอนบันทึก/ยื่นร่างฉบับนั้น)
  const old = await reviseQuote({ quote: approved(TODAY_LINES(null)) });
  assert.equal(old.status, 201, JSON.stringify(old.body));
  assert.deepEqual(pick(old.lineInserts[0], ['qty', 'lineTotal']), [[24, 69600], [12, 42000], [3, 300]]);
  for (const row of old.lineInserts[0]) assert.equal('packQty' in row, false);
});

/* ⭐ ปรับตามงวด PR-3 (มติเจ้าของ 08/10 ข้อ 3: "ออก Rev. ก๊อปบรรทัดตามที่เป็น"): เดิมชื่อ "(ไม่มีเลขแพ็ค · ช่องปิด)" และรันบนค่าตั้งต้นที่ปิด —
   วันนี้รันทั้งค่าตั้งต้น (เปิด) และคำตอบของรุ่น PR-1 / PR-2: ผลต้องเท่ากันทุกตัว (ทางก๊อปล้วน ไม่มีอะไรขึ้นกับสวิตช์) */
test('ออก Rev. ของใบเก่า (ไม่มีเลขแพ็ค): แถวที่ INSERT ไม่มีคีย์ packQty สักแถว — คำขอไม่เอ่ยชื่อคอลัมน์ ใช้ได้ทั้งก่อนและหลังรัน 0407 · ยอดเดิม · เท่ากันทั้งวันนี้และรุ่น PR-1 / PR-2', async () => {
  for (const open of [true, false]) {
    for (const [label, packKey] of [['ก่อนรัน 0407', undefined], ['หลังรัน 0407', null]]) {
      const run = await withSwitch(open, () => reviseQuote({ quote: approved(TODAY_LINES(packKey)) }));
      assert.equal(run.status, 201, `${label}: ${JSON.stringify(run.body)}`);
      const rows = run.lineInserts[0];
      assert.deepEqual(pick(rows, ['qty', 'unitPrice', 'discountAmount', 'lineTotal', 'unit']), [
        [24, 3500, 14400, 69600, 'แพ็คเกจ'], [12, 3500, 0, 42000, 'แพ็คเกจ'], [3, 100, 0, 300, 'ชิ้น'],
      ], label);
      for (const row of rows) assert.equal('packQty' in row, false, `${label}: คำขอ INSERT ต้องไม่เอ่ยชื่อคอลัมน์`);
      assert.deepEqual(totalsOf(run.header), { subtotal: 111900, discountAmount: 0, vatAmount: 7833, totalAmount: 119733 }, label);
    }
  }
});

test('ออก Rev.: ฐานปฏิเสธบรรทัดด้วยยาม 0410 (P0001 · Rev. ที่เลขแพ็คของต้นทางหาย) = 500 ข้อความไทยของฐานตรงตัว + ถอนหัวใบฉบับใหม่ · ใบเดิมไม่ถูกเปลี่ยนเป็น revised', async () => {
  const source = approved(PACK_LINES());
  const message = guardMessage(1, 'QT-26100001-1', 1, source.quoteNumber);
  assert.ok(message.includes(`ทั้งที่ฉบับต้นทาง ${source.quoteNumber} มีเลขแพ็คของรายการนี้`) && message.endsWith('[quotation_line_pack_lost]'));
  const run = await reviseQuote({ quote: source, lineInsertError: { code: 'P0001', message } });
  assert.deepEqual([run.status, run.body.error], [500, message]);
  assert.equal(run.headerDeletes.length, 1);
  assert.equal(filterOf(run.headerDeletes[0], 'eq', 'id'), run.header.id, 'ถอนใบที่เพิ่งสร้าง ไม่ใช่ใบเดิม');
  assert.equal(run.sourceUpdate, null, 'ใบต้นทางไม่ถูกเปลี่ยนเป็น revised (การเปลี่ยนสถานะอยู่หลังบรรทัด)');
  assert.deepEqual([T.side, T.audits], [[], []]);
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

/* ── สายโซ่ของใบเก่า (มติ 08/10 ข้อ 3 · A4): ออก Rev. ก๊อป NULL → ร่างฉบับนั้นบันทึก/ยื่นไม่ได้จนกว่าจะแยกแพ็ค → แยกแล้วไปต่อได้ ───── */

test('⭐ ใบเก่าที่อนุมัติแล้ว → ออก Rev. (NULL คง NULL ไม่ถูกปฏิเสธ) → ร่างฉบับใหม่: บันทึกโดยไม่กรอก = 400 · ยื่นโดยไม่กรอก = 400 "แก้ไขข้อมูล" → แยก 24 = 2 × 12 แล้วบันทึกได้ ยอดเท่าเดิม → ยื่นได้', async () => {
  const source = approved(TODAY_LINES(null));
  const rev = await reviseQuote({ quote: source });
  assert.equal(rev.status, 201, JSON.stringify(rev.body));
  // ร่างของฉบับ Rev. — ประกอบจากหัวใบและแถวที่เส้นทางออก Rev. เขียนเอง
  const draft = draftFromRevision(rev);
  assert.deepEqual([draft.status, draft.approvalStatus, draft.revisionNo], ['draft', 'not_submitted', 1]);
  assert.deepEqual(pick(draft.lines, ['packQty', 'qty', 'lineTotal']), [[null, 24, 69600], [null, 12, 42000], [null, 3, 300]], 'ก๊อปตามที่เป็น — ระบบไม่เดาเลขแพ็ค');
  assert.deepEqual(totalsOf(draft), totalsOf(source));
  // (1) บันทึกร่างนั้นโดยไม่กรอก (จอส่งบรรทัดที่โหลดมาทั้งก้อน) = ปฏิเสธ บอกรายการ
  const untouched = await patchQuote({ quote: draft, body: { lines: draft.lines, vatRate: 7 } });
  assert.deepEqual([untouched.status, untouched.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.required}`]);
  assert.deepEqual(written(untouched.db), []);
  // (2) ยื่นร่างนั้นโดยไม่แตะ = ปฏิเสธ บอกปุ่มที่ต้องกด — ไม่มีการลงนาม
  const submitUntouched = await submitQuote({ quote: draft });
  assert.deepEqual([submitUntouched.status, submitUntouched.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.required} — ${LINE_PACK_TEXT.beforeSubmit}`]);
  assert.deepEqual(submitUntouched.signs, []);
  // (3) คนขายแยกแพ็คเอง: 24 = 2 × 12 และ 12 = 1 × 12 → บันทึกได้ ยอดบรรทัดและหัวใบเท่าเดิม
  const resplit = [{ ...draft.lines[0], packQty: '2', qty: 12 }, { ...draft.lines[1], packQty: '1' }, draft.lines[2]];
  const saved = await patchQuote({ quote: draft, body: { lines: resplit, vatRate: 7 } });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.deepEqual(pick(saved.save.p_lines, ['packQty', 'qty', 'lineTotal', 'unit']), [[2, 12, 69600, 'เดือน'], [1, 12, 42000, 'เดือน'], [undefined, 3, 300, 'ชิ้น']]);
  assert.deepEqual(totalsOf(saved.save.p_content), totalsOf(source));
  // (4) ร่างที่แยกแล้ว (ตามที่ RPC จะเก็บ) ยื่นได้ — ลายนิ้วมือที่ลงนามคิดจากบรรทัดที่พกเลขแพ็ค
  const fixed = { ...draft, ...saved.save.p_content, lines: asStored(saved.save.p_lines) };
  const submitted = await submitQuote({ quote: fixed });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));
  assert.equal(submitted.signs.length, 1);
  assert.equal(submitted.sign.p_document_fingerprint, quotationApprovalFingerprint(fixed, fixed.lines));
  assert.notEqual(submitted.sign.p_document_fingerprint, quotationApprovalFingerprint(draft, draft.lines), 'ฉบับที่แยกแพ็คแล้ว ≠ ฉบับที่ยังไม่แยก');
});

/* ═══ POST /api/sales-planning/deals/[id]/quotations — สร้างใบ (เส้นทางมาตรฐาน: คนกรอกบรรทัดเอง) ═════════════════ */

test('⭐ สร้างใบ (handler จริง): ใบที่บรรทัดหมวด 02-001 มีเลขแพ็คครบ = 201 · แถวที่ INSERT พกเลขที่ส่งมาทุกตัวอักษร · ยอด = แพ็ค × จำนวน × ราคาทะเบียน · หัวใบ = ผลรวมของแถวชุดนั้น', async () => {
  const body = {
    lines: [
      { productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12, unitPrice: 1, packQty: '2', discountType: 'amount', discountValue: 14400 },
      { productId: 'P2', fgCode: SDS_FG, description: 'x', qty: 12, packQty: 1 },
      { productId: 'P9', fgCode: PERFUME_FG, description: 'x', qty: 3 },
      { description: 'ค่าบริการรายเดือน', qty: 6, unitPrice: 1200, packQty: '3', discountType: 'percent', discountValue: 5, metadata: { categoryCode: '02-001' } },
    ],
  };
  const run = await createQuote({ body });
  assert.equal(run.status, 201, JSON.stringify(run.body));
  assert.equal(run.lineInserts.length, 1);
  const rows = run.lineInserts[0];
  assert.deepEqual(pick(rows, ['packQty', 'qty', 'unitPrice', 'discountAmount', 'lineTotal', 'unit']), [
    [2, 12, 3500, 14400, 69600, 'เดือน'], [1, 12, 3500, 0, 42000, 'เดือน'], [null, 3, 100, 0, 300, 'ชิ้น'], [3, 6, 1200, 1080, 20520, 'เดือน'],
  ]);
  ['2', 1, null, '3'].forEach((sent, i) => (sent === null ? assert.equal(rows[i].packQty, null) : assert.ok(samePackText(rows[i].packQty, sent), `แถว ${i + 1}`)));
  for (const row of rows) assert.equal('packQty' in row, true, 'ทุกแถวของคำขอเดียวมีคีย์ชุดเดียวกัน');
  assert.deepEqual(totalsOf(run.header), { subtotal: 132420, discountAmount: 0, vatAmount: 9269.4, totalAmount: 141689.4 });
  assert.deepEqual(totalsOf(run.header), quoteTotals(rows, { vatRate: 7 }));
  assert.deepEqual([run.header.status, run.header.approvalStatus], ['draft', 'not_submitted']);
  assert.deepEqual(run.body.lines.map((line) => line.packQty), [2, 1, null, 3]);
  assert.equal(T.audits.length, 1);
});

test('🔴 สร้างใบ (handler จริง · มติ A2 "บังคับใส่"): หมวด 02-001 ไม่มีเลขแพ็ค / เลขแพ็คบนหมวดอื่น / ค่าที่ใช้ไม่ได้ = 400 { error } บอกเลขรายการ — ไม่ออกเลขใบ ไม่เขียนบรรทัด', async () => {
  const sds = (over = {}) => ({ productId: 'P1', fgCode: SDS_FG, description: 'x', qty: 12, ...over });
  const perfume = (over = {}) => ({ productId: 'P9', fgCode: PERFUME_FG, description: 'x', qty: 3, ...over });
  const cases = [
    [[sds(), sds({ packQty: 2 })], `รายการ 1: ${LINE_PACK_TEXT.required}`],
    [[sds({ packQty: 2 }), sds({ qty: 0 }), sds()], `รายการ 3: ${LINE_PACK_TEXT.required}`],
    [[perfume({ packQty: 2 })], `รายการ 1: ${LINE_PACK_TEXT.notAllowed}`],
    [[{ description: 'ค่าบริการ', qty: 1, unitPrice: 500, metadata: { categoryCode: '02-001' } }], `รายการ 1: ${LINE_PACK_TEXT.required}`],
  ];
  for (const packQty of [0, 1.5, 10000, 'abc', '1,200']) cases.push([[sds({ packQty: 1 }), sds({ packQty })], `รายการ 2: ${LINE_PACK_TEXT.invalid}`]);
  for (const [lines, message] of cases) {
    const run = await createQuote({ body: { lines } });
    assert.deepEqual([run.status, run.body], [400, { error: message }], JSON.stringify(lines));
    assert.deepEqual(written(run.db), [], 'ไม่มีคำสั่งเขียน/ออกเลขใบ');
    assert.deepEqual(T.audits, []);
  }
  // คำตอบของรุ่น PR-1 / PR-2: ใบเดียวกับกรณีแรกถูกสร้างได้ (บรรทัดหมวด 02-001 ไม่ถูกถามเลขแพ็ค) แต่เลขแพ็คที่ส่งมาถูกปฏิเสธ
  const closedPack = await withSwitch(false, () => createQuote({ body: { lines: [sds(), sds({ packQty: 2 })] } }));
  assert.deepEqual([closedPack.status, closedPack.body.error], [400, `รายการ 2: ${LINE_PACK_TEXT.closed}`]);
  const closedPlain = await withSwitch(false, () => createQuote({ body: { lines: [sds(), sds()] } }));
  assert.equal(closedPlain.status, 201);
  for (const row of closedPlain.lineInserts[0]) assert.equal('packQty' in row, false);
});

test('สร้างใบ (handler จริง) ที่ไม่มีบรรทัดหมวด 02-001 และใบเปล่า: ผ่านเหมือนเดิม — แถวที่ INSERT ไม่มีคีย์ packQty (คำขอไม่เอ่ยชื่อคอลัมน์)', async () => {
  const run = await createQuote({ body: { lines: [{ productId: 'P9', fgCode: PERFUME_FG, description: 'x', qty: 3 }, { description: 'ค่าขนส่ง', qty: 1, unitPrice: 500, packQty: null }] } });
  assert.equal(run.status, 201, JSON.stringify(run.body));
  assert.deepEqual(pick(run.lineInserts[0], ['qty', 'unitPrice', 'lineTotal']), [[3, 100, 300], [1, 500, 500]]);
  for (const row of run.lineInserts[0]) assert.equal('packQty' in row, false);
  // ปุ่ม "สร้างใบเสนอราคา" ของหน้าดีลส่งคำขอเปล่า — ใบเปล่าไม่มีบรรทัดให้ด่านทัก
  const empty = await createQuote({ body: {} });
  assert.equal(empty.status, 201, JSON.stringify(empty.body));
  assert.deepEqual(empty.lineInserts, []);
});

/* ═══ POST …/submit — ยื่นอนุมัติ (ด่านใหม่ของงวด PR-3 · มติ 08/10 ข้อ 3) ═══════════════════════════════════════ */

test('🔴 ยื่นอนุมัติร่างเก่าหมวด 02-001 ที่ยังไม่ได้แยกแพ็ค = 400 { error } บอกรายการ + "กด แก้ไขข้อมูล" — ไม่ลงนาม ไม่เขียนอะไร · เลขรายการตามที่หน้าใบเรียง', async () => {
  const run = await submitQuote({ quote: quoteOf(TODAY_LINES(null)) });
  assert.deepEqual([run.status, run.body], [400, { error: 'รายการ 1, 2: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ — กด “แก้ไขข้อมูล” แล้วกรอกให้ครบก่อนยื่นอนุมัติ' }]);
  assert.deepEqual(run.signs, [], 'RPC ลงนามไม่ถูกเรียก');
  assert.deepEqual(run.db.calls.map((c) => [c.table, c.op]), [['quotations', 'select']], 'อ่านใบครั้งเดียว — ไม่อ่านทะเบียนสินค้า ไม่เขียนอะไร');
  assert.deepEqual([T.side, T.audits], [[], []], 'ไม่มีเหตุการณ์ลงเธรด ไม่มี audit');
  // ฐานก่อนรัน 0407 (แถวไม่มีคีย์ packQty) ได้คำตอบเดียวกัน
  const noKey = await submitQuote({ quote: quoteOf(TODAY_LINES(undefined)) });
  assert.equal(noKey.body.error, run.body.error);
  // บรรทัดที่เก็บไว้ sortOrder 0, 2, 5 (อาร์เรย์ไม่เรียง): รายการ 2, 3
  const gaps = quoteOf([stored('QTL-c', { sortOrder: 5 }), stored('QTL-a', { packQty: 2, unit: 'เดือน', sortOrder: 0 }), stored('QTL-b', { productId: 'P2', sortOrder: 2 })]);
  const numbered = await submitQuote({ quote: gaps });
  assert.equal(numbered.body.error, `รายการ 2, 3: ${LINE_PACK_TEXT.required} — ${LINE_PACK_TEXT.beforeSubmit}`);
  // บรรทัดพิมพ์เองหมวด 02-001 ก็ถูกทัก · เลขแพ็คค้างบนบรรทัดหมวดอื่น (สินค้าถูกย้ายหมวดหลังบันทึก) ก็ยื่นไม่ได้
  const typed = quoteOf([stored('QTL-1', { productId: null, fgCode: null, description: 'ค่าบริการ', qty: 6, unitPrice: 1200, metadata: { categoryCode: '02-001' } })]);
  assert.equal((await submitQuote({ quote: typed })).body.error, `รายการ 1: ${LINE_PACK_TEXT.required} — ${LINE_PACK_TEXT.beforeSubmit}`);
  const stray = quoteOf([stored('QTL-1', { productId: 'P9', fgCode: PERFUME_FG, qty: 3, unitPrice: 100, packQty: 2 })]);
  const strayRun = await submitQuote({ quote: stray });
  assert.deepEqual([strayRun.status, strayRun.body.error], [400, `รายการ 1: ${LINE_PACK_TEXT.notAllowed} — ${LINE_PACK_TEXT.beforeSubmit}`]);
  assert.deepEqual(strayRun.signs, []);
});

test('⭐ ยื่นอนุมัติใบที่บรรทัดหมวด 02-001 มีเลขแพ็คครบ = 200 · RPC ลงนามถูกเรียกครั้งเดียวด้วยลายนิ้วมือที่มีคีย์เลขแพ็ค · ใบที่ไม่มีหมวด 02-001 ยื่นได้ด้วยลายนิ้วมือเดิม', async () => {
  const quote = quoteOf(PACK_LINES(), { updatedAt: '2026-10-09T02:00:00Z' });
  const run = await submitQuote({ quote });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.signs.length, 1);
  assert.equal(run.signs[0].name, 'submit_quotation_with_signature_evidence_atomic');
  assert.deepEqual([run.sign.p_quote_id, run.sign.p_expected_updated_at, run.sign.p_actor_id], ['QT-1', '2026-10-09T02:00:00Z', 'U-1']);
  assert.equal(run.sign.p_document_fingerprint, quotationApprovalFingerprint(quote, quote.lines));
  // ลายนิ้วมือนี้มีคีย์เลขแพ็คอยู่จริง: ต่างจากใบเดียวกันที่ไม่มีเลขแพ็ค และต่างเมื่อเลขแพ็ค 1 หาย (จุดบอดของ CHECK)
  assert.notEqual(run.sign.p_document_fingerprint, quotationApprovalFingerprint(quote, quote.lines.map(({ packQty, ...rest }) => rest)));
  assert.notEqual(run.sign.p_document_fingerprint, quotationApprovalFingerprint(quote, quote.lines.map((line) => (line.packQty === 1 ? { ...line, packQty: null } : line))));
  assert.deepEqual(T.side, [['thread', 'QT-1', 'submit']]);
  assert.equal(T.audits.length, 1);
  // ใบที่ไม่มีบรรทัดหมวด 02-001: ด่านไม่แตะ — ลายนิ้วมือที่ลงนามเท่ากันทั้งแถวที่มีคีย์ packQty: null (หลัง 0407) และไม่มีคีย์ (ก่อน 0407)
  const prints = [];
  for (const packKey of [undefined, null]) {
    const plain = quoteOf(PLAIN_LINES(packKey));
    const plainRun = await submitQuote({ quote: plain });
    assert.equal(plainRun.status, 200, JSON.stringify(plainRun.body));
    prints.push(plainRun.sign.p_document_fingerprint);
  }
  assert.equal(prints[0], prints[1], 'ลายนิ้วมือของใบที่ไม่มีเลขแพ็คไม่ขึ้นกับการมีคีย์ packQty: null');
});

test('ยื่นอนุมัติ: ข้อความของสถานะ (ยื่นไปแล้ว · อนุมัติแล้ว · ใบ grandfather) มาก่อนด่านเลขแพ็ค — ใบเก่าที่ไม่ได้อยู่ในขั้นยื่นไม่ได้ข้อความเลขแพ็ค', async () => {
  const lines = TODAY_LINES(null);
  for (const [approvalStatus, pattern] of [['pending', /ยื่นอนุมัติไปแล้ว/], ['approved', /อนุมัติแล้ว/], ['not_required', /ออกก่อนระบบอนุมัติ/]]) {
    const run = await submitQuote({ quote: quoteOf(lines, { approvalStatus }) });
    assert.equal(run.status, 400);
    assert.match(run.body.error, pattern, approvalStatus);
    assert.doesNotMatch(run.body.error, /แพ็ค\/เดือน/, approvalStatus);
    assert.deepEqual(run.signs, []);
  }
});

/* ═══ POST …/approval — อนุมัติ = ส่งลูกค้า (ด่านใหม่ของงวด PR-3 · มติ 08/10 ข้อ 3 · แผน §1 D5 + §12 C3) ═══════════ */

test('🔴 อนุมัติใบเก่าหมวด 02-001 ที่ยื่นไว้ก่อนวันเปิดช่อง = 400 บอกรายการ + ปุ่มที่คนนั้นมี: ผู้อนุมัติที่ไม่ใช่คนยื่น → "ตีกลับให้แก้ไข" · ผู้อนุมัติที่ยื่นเอง → "ดึงกลับมาแก้ไข" — ไม่ลงนามทั้งสองกรณี', async () => {
  const lines = TODAY_LINES(null);
  // ผู้อนุมัติ (U-1) ไม่ใช่คนยื่น (U-2)
  const other = await approveQuote({ quote: pending(lines, 'U-2') });
  assert.deepEqual([other.status, other.body], [400, { error: 'รายการ 1, 2: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ — กด “ตีกลับให้แก้ไข” ให้ผู้จัดทำกรอกให้ครบก่อน' }]);
  assert.equal(other.body.error, `รายการ 1, 2: ${LINE_PACK_TEXT.required} — ${LINE_PACK_TEXT.beforeApprove}`);
  // ผู้อนุมัติเป็นคนยื่นเอง (เจ้าของดีลยื่นใบของตัวเอง — ทางปกติ): ไม่มีปุ่มตีกลับ มีแต่ดึงกลับ
  const own = await approveQuote({ quote: pending(lines, 'U-1') });
  assert.deepEqual([own.status, own.body], [400, { error: 'รายการ 1, 2: รายการหมวด 02-001 ต้องกรอก “แพ็ค/เดือน” ทุกรายการ — กด “ดึงกลับมาแก้ไข” แล้วกรอกให้ครบก่อนยื่นใหม่' }]);
  assert.equal(own.body.error, `รายการ 1, 2: ${LINE_PACK_TEXT.required} — ${LINE_PACK_TEXT.beforeApproveOwn}`);
  for (const run of [other, own]) {
    assert.deepEqual(run.signs, [], 'RPC ลงนามไม่ถูกเรียก');
    assert.deepEqual(run.db.calls.map((c) => [c.table, c.op]), [['quotations', 'select']], 'อ่านใบครั้งเดียว — ไม่อ่านทะเบียนสินค้า ไม่เขียนอะไร');
  }
  assert.deepEqual([T.side, T.audits], [[], []], 'ไม่มีฉบับตรึง · PDF · เหตุการณ์ลงเธรด · ยอด FC · audit');
  // เจ้าของดีลที่ไม่ใช่ผู้ดูแลระบบและยื่นเอง ได้ข้อความ "ดึงกลับ" เหมือนกัน (ตัดสินจาก id คนยื่น ไม่ใช่ role)
  const owner = { id: 'U-9', name: 'เจ้าของดีล', role: 'ae' };
  const ownerQuote = { ...pending(lines, 'U-9'), deal: { ...DEAL, ownerId: 'U-9' } };
  const ownerRun = await approveQuote({ quote: ownerQuote, user: owner });
  assert.deepEqual([ownerRun.status, ownerRun.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.required} — ${LINE_PACK_TEXT.beforeApproveOwn}`]);
  // เลขรายการ = ลำดับที่หน้าใบเรียง
  const gaps = pending([stored('QTL-c', { sortOrder: 5 }), stored('QTL-a', { packQty: 2, unit: 'เดือน', sortOrder: 0 }), stored('QTL-b', { productId: 'P2', sortOrder: 2 })], 'U-2');
  assert.equal((await approveQuote({ quote: gaps })).body.error, `รายการ 2, 3: ${LINE_PACK_TEXT.required} — ${LINE_PACK_TEXT.beforeApprove}`);
});

test('⭐ อนุมัติใบที่บรรทัดหมวด 02-001 มีเลขแพ็คครบ = 200 · RPC ลงนามครั้งเดียวด้วยลายนิ้วมือที่มีคีย์เลขแพ็ค · ฉบับตรึงได้บรรทัดพร้อมเลขแพ็ค · ใบที่ไม่มีหมวด 02-001 อนุมัติได้เหมือนเดิม', async () => {
  const quote = pending(PACK_LINES(), 'U-2');
  const run = await approveQuote({ quote, body: { note: 'ผ่าน' } });
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.signs.length, 1);
  assert.equal(run.signs[0].name, 'approve_quotation_with_signature_evidence_atomic');
  assert.equal(run.sign.p_document_fingerprint, quotationApprovalFingerprint(quote, quote.lines));
  assert.equal(run.sign.p_document_fingerprint, quote.approvalFingerprint, 'เท่ากับลายนิ้วมือที่ลงนามตอนยื่น (เนื้อหาไม่ถูกแตะระหว่างทาง)');
  assert.equal(run.sign.p_approval_notes, 'ผ่าน');
  assert.deepEqual(T.side, [['snapshot', 'QT-1', [2, 1, null]], ['pdf', 'QT-1'], ['thread', 'QT-1', 'approve'], ['forecast', 'DL-1', 'quotation_approved']]);
  assert.equal(T.audits.length, 1);
  // ผู้อนุมัติที่ยื่นเองก็อนุมัติได้เมื่อเลขแพ็คครบ
  assert.equal((await approveQuote({ quote: pending(PACK_LINES(), 'U-1') })).status, 200);
  // ใบที่ไม่มีบรรทัดหมวด 02-001 ที่รออนุมัติอยู่: ผ่านเหมือนเดิม
  const plain = pending(PLAIN_LINES(null), 'U-2');
  const plainRun = await approveQuote({ quote: plain });
  assert.equal(plainRun.status, 200, JSON.stringify(plainRun.body));
  assert.equal(plainRun.sign.p_document_fingerprint, plain.approvalFingerprint);
});

test('อนุมัติ: ข้อความของสถานะ (ยังไม่ยื่น · อนุมัติแล้ว · ดีล Lost · ไม่มีสิทธิ์) มาก่อนด่านเลขแพ็ค', async () => {
  const lines = TODAY_LINES(null);
  const notSubmitted = await approveQuote({ quote: quoteOf(lines) });
  assert.match(notSubmitted.body.error, /ยังไม่ได้ยื่นอนุมัติ/);
  const done = await approveQuote({ quote: approved(lines) });
  assert.match(done.body.error, /อนุมัติแล้ว/);
  const lost = await approveQuote({ quote: { ...pending(lines, 'U-2'), deal: { ...DEAL, stage: 'lost' } } });
  assert.match(lost.body.error, /Lost แล้ว/);
  const stranger = await approveQuote({ quote: pending(lines, 'U-2'), user: { id: 'U-7', name: 'คนนอกดีล', role: 'ae' } });
  assert.equal(stranger.status, 403);
  for (const run of [notSubmitted, done, lost, stranger]) {
    assert.doesNotMatch(run.body.error, /แพ็ค\/เดือน/);
    assert.deepEqual(run.signs, []);
  }
});

/* ═══ ลายนิ้วมือการอนุมัติ: เปลี่ยนเฉพาะใบที่ได้เลขแพ็ค ═══════════════════════════════════════════════════════ */

test('⭐ ลายนิ้วมือการอนุมัติขยับเฉพาะใบที่ได้เลขแพ็ค: ใบที่ไม่มีเลขแพ็ค (คีย์ไม่มี / null / ว่าง) = ค่าเดียวกัน · ได้เลขแพ็คบรรทัดเดียว = เปลี่ยน · เลข 1 ≠ ไม่มีเลข · 2 ≠ 1', () => {
  const base = quoteOf(TODAY_LINES(undefined));
  const print = (lines) => quotationApprovalFingerprint(base, lines);
  const noKey = print(TODAY_LINES(undefined));
  assert.equal(print(TODAY_LINES(null)), noKey, 'packQty: null (select * หลังรัน 0407)');
  assert.equal(print(TODAY_LINES(undefined).map((line) => ({ ...line, packQty: '' }))), noKey, 'ช่องว่างจากจอ');
  assert.equal(print(TODAY_LINES(undefined).map((line) => ({ ...line, packQty: '   ' }))), noKey);
  const withPack = (index, packQty) => TODAY_LINES(null).map((line, i) => (i === index ? { ...line, packQty } : line));
  const one = print(withPack(1, 1));
  const two = print(withPack(1, 2));
  assert.notEqual(one, noKey, 'เลขแพ็ค 1 ≠ ไม่มีเลขแพ็ค (เอกสารคนละหน้าตา)');
  assert.notEqual(two, one);
  assert.equal(print(withPack(1, '2')), two, 'ข้อความ "2" กับตัวเลข 2 = เนื้อหาเดียวกัน');
  assert.notEqual(print(withPack(0, 1)), one, 'เลขเดียวกันบนคนละบรรทัด = คนละเนื้อหา');
});

/* ═══ เหตุที่ห้ามตั้งสวิตช์กลับ (แผน §12 C2) ═══════════════════════════════════════════════════════════════════ */

test('🔴 สวิตช์เป็น false บนโค้ดงวด PR-3 ≠ รุ่น PR-2: ใบที่มีเลขแพ็คถูกกั้นทั้งยื่น · อนุมัติ · ส่ง และข้อความบอกให้ "ลบตัวเลข" — ทางฉุกเฉินจึงเป็นการ deploy รุ่น PR-2 กลับ ไม่ใช่การแก้ค่าคงที่', async () => {
  const lines = PACK_LINES();
  /* รุ่น PR-2 ไม่มีด่านที่ยื่น / อนุมัติ / ส่ง ⇒ ใบที่มีเลขแพ็คเดินงานต่อได้ และจอของรุ่นนั้นลบเลขแพ็คไม่ได้
     โค้ดรุ่นนี้ + สวิตช์ปิด: ด่านทั้งสามตอบ "ยังไม่เปิดให้กรอก … ลบตัวเลขในช่องนั้นออก" และจอรุ่นนี้มีช่องให้ลบจริง ⇒ ยอดหดเป็นแถวที่ฐานรับ */
  const submit = await withSwitch(false, () => submitQuote({ quote: quoteOf(lines) }));
  assert.deepEqual([submit.status, submit.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.closed} — ${LINE_PACK_TEXT.beforeSubmit}`]);
  const approve = await withSwitch(false, () => approveQuote({ quote: pending(lines, 'U-2') }));
  assert.deepEqual([approve.status, approve.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.closed} — ${LINE_PACK_TEXT.beforeApprove}`]);
  const send = await withSwitch(false, () => patchQuote({ quote: approved(lines, { status: 'draft' }), body: { status: 'sent' }, products: null }));
  assert.deepEqual([send.status, send.body.error], [400, `รายการ 1, 2: ${LINE_PACK_TEXT.closed} — ${LINE_PACK_TEXT.beforeSend}`]);
  for (const run of [submit, approve]) assert.deepEqual(run.signs, []);
  assert.match(LINE_PACK_TEXT.closed, /ลบตัวเลขในช่องนั้นออกแล้วบันทึกอีกครั้ง/, 'ข้อความของกิ่งปิดสั่งให้ลบเลขแพ็ค — ในรุ่น PR-2 ทำตามไม่ได้ ในรุ่นนี้ทำได้');
  // และถ้าคนขายทำตามข้อความนั้นบนโค้ดรุ่นนี้ (ลบเลข 2 ออก) บรรทัดถูกบันทึกเป็น จำนวน × ราคา — ไม่มีอะไรปฏิเสธ
  const obeyed = await withSwitch(false, () => patchQuote({
    quote: quoteOf(lines),
    body: { lines: lines.map((line) => ({ ...line, packQty: '' })) },
  }));
  assert.equal(obeyed.status, 200);
  assert.deepEqual(pick(obeyed.save.p_lines, ['qty', 'lineTotal']), [[12, 27600], [12, 42000], [3, 300]], '2 × 12 × 3,500 − 14,400 = 69,600 หดเหลือ 12 × 3,500 − 14,400 = 27,600 เงียบ ๆ');
  // ค่าคงที่จริงของไฟล์นี้ยังเป็น true — เทสต์ linePacks.test.mjs ยึดทั้งค่าและประโยคห้ามตั้งกลับ
  assert.equal(realPacks.QUOTE_PACK_INPUT_OPEN, true);
});
