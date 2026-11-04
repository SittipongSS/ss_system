// ── Excise-tax reports: server-side aggregation ───────────────────────────
// การขึ้นทะเบียน (registrations) + สินค้าที่ขาดราคาขายปลีก — การยื่นภาษีย้ายไปประกอบบนจอ (lib/excise/raFilingExport.js · 04/11).
// Uniform shape so the UI table, the Excel exporter and the PDF printer render
// any report generically:
//
//   { type, title, columns: [{ key, label, money?, date?, num?, multiline?, only? }],
//     rows: [...], summary: { <colKey>: value, _label } }
//
// `multiline` columns carry a 2-line string ("main\nsub") that every renderer
// splits into a main line + a small secondary line.
// `only: 'excel' | 'print'` keeps a column to one renderer — for values that read
// best split into columns in Excel but must share one cell to fit the A4 width.
//
// Server-only: uses the service-role admin client. The API route decides team
// scope (บังคับตาม role → `scopeTeam`) แยกจากตัวกรองทีมที่ผู้ใช้เลือก (`team`) — ดู
// reportFilters.js · และตัดสินว่าเห็นราคาผลิต/กำไรไหม (`margin` — RA/admin เท่านั้น)
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { applyTeamScope, asList } from '@/lib/tax/reportFilters';
import { statusMeta } from '@/lib/excise/workflow';
import { teamNameOf } from '@/lib/master/teams';
import { brandLabel } from '@/lib/master/brands';
import { productBrandName, productDisplayName } from '@/lib/master/productIdentity';
import { fmtNumber } from '@/lib/format';
import { exciseTaxLineForRegistration } from '@/lib/tax/exciseBilling';
import { missingRetailPriceProducts } from '@/lib/tax/taxableProducts';
import { withinDateRange } from '@/lib/tax/period';

/* ⭐ ช่วงวันของรายงาน = ตัวตัดสินเดียวกับตารางคิว (`withinDateRange` · วันไทยของ createdAt) — ตรวจตัวเลข M7 20/10/2026
   🐞 เดิมแปลง from เป็น Date ตรง ๆ = เที่ยงคืน **UTC** (เครื่อง Vercel) ⇒ ใบที่สร้างตี 1–7 โมงเช้าวันแรกของช่วงหลุดจากไฟล์
      ทั้งที่การ์ด "เดือนนี้" บนภาพรวมนับมัน · และแถวที่ไม่มีวันที่สร้างหลุดจากไฟล์ ขณะที่ตารางยังโชว์
   ⇒ คิวส่ง from/to ชุดเดียวกับที่ตารางกรอง (ไม่ส่ง ids เมื่อไม่ได้ค้น/ติ๊ก) ไฟล์จึงต้องได้แถวชุดเดียวกับจอ (มติ §3.1) */
const inRange = (value, from, to) => withinDateRange(value, from, to);
const money = (v) => '฿' + fmtNumber(v, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusLabel = (s) => statusMeta(s).label;
/* ป้ายทีมมาจากทะเบียนจริงที่ route โหลดมาให้ (filter.teamNames) — ผูกครั้งเดียวต่อรายงาน
   ไม่ใช่ต่อแถว · ไม่ส่งมา = คืนรหัสดิบ (ดูเหตุผลที่ `teamNameOf`) */
const teamLabelOf = (names) => (t) => (t ? teamNameOf(names, t) : '-');
const two = (a, b) => `${a}\n${b}`;

async function fetchRegistrations(filter = {}) {
  const supabase = getSupabaseAdmin();
  let q = applyTeamScope(supabase.from('excise_registrations').select('*'), filter);
  const customerIds = asList(filter.customerId);
  if (customerIds.length) q = q.in('customerId', customerIds);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
// Master products keyed by id — for cost/profit + retail prices on the
// registration report (the registration snapshot doesn't store these).
async function fetchProductMap() {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from('products')
    .select('id, volume, volumeUnit, costPrice, materialCost, laborCost, shippingCost, factoryProfit, retailPriceIncVat, retailPriceExVat, exciseTax, localTax');
  if (error) throw error;
  const m = new Map();
  for (const p of data || []) m.set(p.id, p);
  return m;
}

// ทะเบียนหมวดสินค้า — ใช้ตัดสินว่าหมวดไหนติ๊ก "ต้องเสียภาษีสรรพสามิต"
async function fetchProductTypes() {
  const { data, error } = await getSupabaseAdmin()
    .from('product_types').select('"mainCategoryCode", "typeCode", "isExcise"');
  if (error) throw error;
  return data || [];
}

// 1) รายงานการขึ้นทะเบียน — one row per registration.
export async function registrationReport(filter = {}) {
  const { from, to, margin, status, ids } = filter;
  const idSet = ids && ids.length ? new Set(ids) : null;
  const statuses = asList(status);
  const regs = (await fetchRegistrations(filter)).filter(
    (r) => inRange(r.createdAt, from, to)
      && (!statuses.length || statuses.includes(r.status))
      && (!idSet || idSet.has(r.id)),
  );
  const products = await fetchProductMap();
  const teamName = teamLabelOf(filter.teamNames);

  const rows = regs.map((r) => {
    const p = products.get(r.productId) || {};
    const exVat = p.retailPriceExVat != null ? p.retailPriceExVat : (p.retailPriceIncVat ? p.retailPriceIncVat / 1.07 : 0);
    const row = {
      id: r.id,
      product: [
        [r.fgCode || '-', productBrandName(r)].filter(Boolean).join(' · '),
        productDisplayName(r),
      ].filter(Boolean).join('\n'),
      size: p.volume != null ? `${p.volume} ${p.volumeUnit || 'ml'}` : '-',
      customer: two(r.customerName || '-', r.taxId || '-'),
      retail: two(`${money(p.retailPriceIncVat)} (รวม VAT)`, `${money(exVat)} (ถอด VAT)`),
      /* ภาษี/ชิ้น + เลขทะเบียน — สองค่าที่คิวบนจอมีแต่รายงานไม่มี (มติผู้ใช้ 03/11/2026)
         ⚠️ ภาษีคิดด้วยตัวเดียวกับคิว (`/api/excise-registrations`) และใบยื่นจริง: อัตราจากสินค้า
            ทะเบียนที่ติ๊กยกเว้น = "ยกเว้น" ไม่ใช่ 0 (ตัดสินจากธง ไม่ใช่จากยอด — #1923) */
      tax: r.isExciseTaxable === false
        ? 'ยกเว้น'
        : exciseTaxLineForRegistration({ registration: r, product: p, quantity: 1 }).totalTax,
      approvalNumber: r.approvalNumber || '-',
      owner: two(r.assignee || '-', teamName(r.team)),
      status: statusLabel(r.status),
      // กระดาษ: เลขทะเบียนเป็นบรรทัดรองใต้สถานะ (ทรงเดียวกับคิวบนจอ) — ดูเหตุผลที่คอลัมน์ข้างล่าง
      statusNumber: r.approvalNumber ? two(statusLabel(r.status), r.approvalNumber) : statusLabel(r.status),
    };
    if (margin) {
      // Factory cost broken down into its components + profit (cost = วัตถุดิบ +
      // ค่าแรง + ค่าจัดส่ง). Three lines, the same grouping as the queue on
      // /tax/registrations: ราคาผลิต · กำไร on the main line, two parts per sub line.
      // ⚠️ Was five lines (one per value) ⇒ a printed row stood 16mm tall, twice what
      // the page budget assumed, and the sheet clipped ~7 rows per page (03/11/2026).
      row.factory = [
        `ราคาผลิต ${money(p.costPrice)} · กำไร ${money(p.factoryProfit)}`,
        `วัตถุดิบ ${money(p.materialCost)} · ค่าแรง ${money(p.laborCost)}`,
        `ค่าจัดส่ง ${money(p.shippingCost)}`,
      ].join('\n');
    }
    return row;
  });

  const columns = [
    { key: 'product', label: 'รหัสสินค้า / สินค้า / แบรนด์', multiline: true },
    { key: 'size', label: 'ขนาด' },
    { key: 'customer', label: 'ลูกค้า / เลขผู้เสียภาษี', multiline: true },
    ...(margin ? [{ key: 'factory', label: 'ราคาผลิต / กำไร (แจกแจงต้นทุน)', multiline: true }] : []),
    // หัวสั้น — "(รวม VAT)" / "(ถอด VAT)" อยู่ในค่าทุกบรรทัดแล้ว · หัวยาวเคยเป็นตัวกำหนดความกว้างคอลัมน์ (~35mm บนกระดาษ)
    { key: 'retail', label: 'ราคาขายปลีก', multiline: true },
    { key: 'tax', label: 'ภาษี/ชิ้น', money: true },
    { key: 'owner', label: 'ผู้รับผิดชอบ / ทีม', multiline: true },
    /* Excel ได้สถานะกับเลขทะเบียนแยกคอลัมน์ (กรอง/เรียงได้) · กระดาษรวมเป็นคอลัมน์เดียว
       🐞 03/11/2026 เลขทะเบียน 28 ตัวอักษรไม่มีช่องว่าง = ตัดบรรทัดไม่ได้ ⇒ เป็นคอลัมน์ของตัวเอง
          กว้าง 45mm บีบคอลัมน์อื่นจนตัดบรรทัดเกือบทุกแถว และหน้าล้นทั้งที่ตัวแบ่งหน้าคิดว่าพอดี
          ⇒ บนกระดาษเป็นบรรทัดรอง (ตัวเล็ก) ใต้สถานะ — คอลัมน์เดียวราว 37mm */
    { key: 'status', label: 'สถานะ', only: 'excel' },
    { key: 'approvalNumber', label: 'เลขทะเบียน', only: 'excel' },
    { key: 'statusNumber', label: 'สถานะ / เลขทะเบียน', multiline: true, only: 'print' },
  ];

  return {
    type: 'registration',
    title: 'รายงานการขึ้นทะเบียนสรรพสามิต',
    columns,
    rows,
    summary: {
      _label: `รวม ${rows.length} รายการ`,
    },
  };
}

/* 2) รายงานการยื่นภาษี — **ถอดแล้ว 04/11/2026** (มติเจ้าของ "Excel แบน · พิมพ์ตามจอ")
   หน้า /tax/filings ประกอบไฟล์จากแถวที่จอวาดอยู่เอง (`lib/excise/raFilingExport.js`) — รายงานนี้อ่านเฉพาะบันทึกการยื่น
   (ไม่มีงานกำลังมา/รอ RA) · คอลัมน์ของรุ่นก่อนตารางแบบเดิม (V20) · และเทียบ `ids` (รหัสบันทึก) กับรหัสรายการสินค้า
   ⇒ ติ๊ก/ค้นหาแล้วได้ไฟล์ว่าง · `?type=filing` ตอบ 400 พร้อมรายชื่อชนิดที่เหลือ */

/* 3) สินค้าที่ต้องเสียภาษีแต่ยังไม่มีราคาขายปลีก — ที่รวมให้ตามไปเติม
 *
 * 🐞 **พบตอนตรวจระบบ 2026-08-16:** ภาษีสรรพสามิตคิดจากราคาขายปลีก (ถอด VAT × 8.8%)
 * ⇒ สินค้าที่ยังไม่มีราคาจะได้ `exciseTax` = 0 · ตอนพบมี 17 จาก 94 ตัวในหมวดที่ต้อง
 * เสียภาษี และทั้งหมดอนุมัติ+ใช้งานอยู่ ⇒ ขายเมื่อไรยื่นภาษีขาดโดยไม่มีอะไรฟ้อง
 *
 * ⚠️ ราคาขายปลีก **กรอกตั้งแต่ตอนเปิดสินค้าไม่ได้** (มันมาทีหลัง) ⇒ ระบบบล็อกที่
 * "ยื่นขึ้นทะเบียน" แทน (ดู lib/tax/requirements.js) · รายงานนี้คือฝั่งมองเห็น: ให้คน
 * ที่ดูแลภาษีเห็นทั้งกองว่าเหลือกี่ตัว แล้วส่งไฟล์ไปให้คนเติมราคาได้เลย
 */
export async function missingRetailPriceReport(filter = {}) {
  const supabase = getSupabaseAdmin();
  const [{ data: products, error }, types] = await Promise.all([
    supabase.from('products')
      .select('id, "fgCode", "productDescription", "productDescriptionEn", "brandName", "brandNameEn", "categoryCode", "retailPriceIncVat", "isExciseTaxable", "isActive", "approvalStatus", "customerName", assignee, team'),
    fetchProductTypes(),
  ]);
  if (error) throw error;

  // ⚠️ กฎ "ต้องเสียภาษีไหม / ขาดราคาไหม" อยู่ที่ `lib/tax/taxableProducts.js` ที่เดียว
  // — หน้าสินค้าใน /database ใช้ตัวเดียวกัน ไม่งั้นสองจอตอบคนละเลข (เคยเป็นแบบนั้นมาแล้ว)
  /* 🐞 คอลัมน์เดียวกันกับรายงานข้างบน แต่ของเดิมพิมพ์ **รหัสดิบ** ไม่เคยผ่านตัวแปลป้ายเลย
     ⇒ สองรายงานจากไฟล์เดียวกันเรียกทีมเดียวกันคนละแบบ */
  const teamName = teamLabelOf(filter.teamNames);
  const rows = missingRetailPriceProducts(products, types)
    .map((p) => ({
      id: p.id,
      product: [p.fgCode || '-', brandLabel(p.brandName, p.brandNameEn)].filter(Boolean).join(' · ')
        + '\n' + (productDisplayName(p) || ''),
      customer: p.customerName || '',
      category: p.categoryCode || '',
      owner: [p.assignee, p.team ? teamName(p.team) : null].filter(Boolean).join('\n'),
      state: [p.approvalStatus === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติ',
        p.isActive === false ? 'เลิกใช้' : 'ใช้งาน'].join(' · '),
    }))
    .sort((a, b) => a.product.localeCompare(b.product));

  return {
    type: 'missingRetailPrice',
    title: 'สินค้าที่ต้องเสียภาษีแต่ยังไม่มีราคาขายปลีก',
    columns: [
      { key: 'product', label: 'รหัส FG / แบรนด์ / สินค้า', multiline: true },
      { key: 'customer', label: 'ลูกค้า' },
      { key: 'category', label: 'หมวด' },
      { key: 'owner', label: 'ผู้รับผิดชอบ / ทีม', multiline: true },
      { key: 'state', label: 'สถานะสินค้า' },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} รายการ`,
      status: rows.length
        ? 'ยื่นขึ้นทะเบียนไม่ได้จนกว่าจะเติมราคาขายปลีก — ภาษีจะคิดออกมาเป็น 0'
        : 'ครบทุกตัวแล้ว',
    },
  };
}

export const REPORTS = {
  registration: registrationReport,
  missingRetailPrice: missingRetailPriceReport,
};

export async function buildReport(type, filter = {}) {
  const fn = REPORTS[type];
  if (!fn) throw new Error(`unknown report type: ${type}`);
  return fn(filter);
}
