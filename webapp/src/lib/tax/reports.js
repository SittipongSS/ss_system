// ── Excise-tax reports: server-side aggregation ───────────────────────────
// Two reports only — การขึ้นทะเบียน (registrations) and การยื่นภาษี (order items).
// Uniform shape so the UI table, the Excel exporter and the PDF printer render
// any report generically:
//
//   { type, title, columns: [{ key, label, money?, date?, num?, multiline? }],
//     rows: [...], summary: { <colKey>: value, _label } }
//
// `multiline` columns carry a 2-line string ("main\nsub") that every renderer
// splits into a main line + a small secondary line.
//
// Server-only: uses the service-role admin client. The API route decides team
// scope (via viewScope, passes `team`) and whether cost/profit is visible
// (`margin` — LG/admin only).
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ORDER_SELECT } from '@/lib/tax/orders';
import { statusMeta } from '@/lib/excise/workflow';
import { TEAM_LABELS } from '@/lib/permissions';
import { brandLabel } from '@/lib/master/brands';

const inRange = (value, from, to) => {
  if (!value) return false;
  const t = new Date(value).getTime();
  if (isNaN(t)) return false;
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 86399999) return false;
  return true;
};
const sum = (arr, pick) => arr.reduce((s, x) => s + (Number(pick(x)) || 0), 0);
const money = (v) => '฿' + (Number(v) || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const statusLabel = (s) => statusMeta(s).label;
const teamLabel = (t) => (t ? (TEAM_LABELS[t] || t) : '-');
const two = (a, b) => `${a}\n${b}`;

// ตัวกรองรับได้ทั้งค่าเดียว/หลายค่า (comma-separated จาก query string หรือ array) —
// ตัวกรองทั้งระบบเป็น multi-select (มติผู้ใช้ 2026-07-18); ว่าง/'all' = ไม่กรอง
const asList = (v) => {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (!v || v === 'all') return [];
  return String(v).split(',').filter(Boolean);
};

async function fetchRegistrations({ team, customerId } = {}) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('excise_registrations').select('*');
  if (team) q = q.eq('team', team);
  const customerIds = asList(customerId);
  if (customerIds.length) q = q.in('customerId', customerIds);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
async function fetchOrders({ team, customerId } = {}) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('orders').select(ORDER_SELECT);
  if (team) q = q.eq('team', team);
  const customerIds = asList(customerId);
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
    .select('id, volume, volumeUnit, costPrice, materialCost, laborCost, shippingCost, factoryProfit, retailPriceIncVat, retailPriceExVat');
  if (error) throw error;
  const m = new Map();
  for (const p of data || []) m.set(p.id, p);
  return m;
}

// 1) รายงานการขึ้นทะเบียน — one row per registration.
export async function registrationReport(filter = {}) {
  const { from, to, margin, status, ids } = filter;
  const idSet = ids && ids.length ? new Set(ids) : null;
  const statuses = asList(status);
  const regs = (await fetchRegistrations(filter)).filter(
    (r) => (!from && !to ? true : inRange(r.createdAt, from, to))
      && (!statuses.length || statuses.includes(r.status))
      && (!idSet || idSet.has(r.id)),
  );
  const products = await fetchProductMap();

  const rows = regs.map((r) => {
    const p = products.get(r.productId) || {};
    const exVat = p.retailPriceExVat != null ? p.retailPriceExVat : (p.retailPriceIncVat ? p.retailPriceIncVat / 1.07 : 0);
    const row = {
      id: r.id,
      product: [r.fgCode || '-', r.productName || '', r.brandName || ''].filter(Boolean).join('\n'),
      size: p.volume != null ? `${p.volume} ${p.volumeUnit || 'ml'}` : '-',
      customer: two(r.customerName || '-', r.taxId || '-'),
      retail: two(`${money(p.retailPriceIncVat)} (รวม VAT)`, `${money(exVat)} (ถอด VAT)`),
      owner: two(r.assignee || '-', teamLabel(r.team)),
      status: statusLabel(r.status),
    };
    if (margin) {
      // Factory cost broken down into its components + profit (cost = วัตถุดิบ +
      // ค่าแรง + ค่าจัดส่ง). Rendered as a main line (ราคาผลิต) + sub lines.
      row.factory = [
        `ราคาผลิต ${money(p.costPrice)}`,
        `· วัตถุดิบ ${money(p.materialCost)}`,
        `· ค่าแรง ${money(p.laborCost)}`,
        `· ค่าจัดส่ง ${money(p.shippingCost)}`,
        `กำไร ${money(p.factoryProfit)}`,
      ].join('\n');
    }
    return row;
  });

  const columns = [
    { key: 'product', label: 'รหัสสินค้า / สินค้า / แบรนด์', multiline: true },
    { key: 'size', label: 'ขนาด' },
    { key: 'customer', label: 'ลูกค้า / เลขผู้เสียภาษี', multiline: true },
    ...(margin ? [{ key: 'factory', label: 'ราคาผลิต (แจกแจง) / กำไร', multiline: true }] : []),
    { key: 'retail', label: 'ราคาขายปลีก (รวม/ถอด VAT)', multiline: true },
    { key: 'owner', label: 'ผู้รับผิดชอบ / ทีม', multiline: true },
    { key: 'status', label: 'สถานะ' },
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

// 2) รายงานการยื่นภาษี — one row per order line item (within createdAt range).
export async function filingReport(filter = {}) {
  const { from, to, status, ids } = filter;
  const idSet = ids && ids.length ? new Set(ids) : null;
  const statuses = asList(status);
  const orders = (await fetchOrders(filter)).filter(
    (o) => (!from && !to ? true : inRange(o.createdAt, from, to)) && (!statuses.length || statuses.includes(o.status)),
  );
  const rows = [];
  for (const o of orders) {
    for (const it of o.items || []) {
      if (idSet && !idSet.has(it.id)) continue;
      const p = it.product || {};
      const exVat = p.retailPriceExVat != null ? p.retailPriceExVat : (p.retailPriceIncVat ? p.retailPriceIncVat / 1.07 : 0);
      rows.push({
        id: it.id,
        quotationRef: o.quotationRef,
        taxInvoiceNumber: o.taxInvoiceNumber || '-',
        product: [p.fgCode || it.registration?.fgCode || '-', p.productDescriptionEn || p.productDescription || it.registration?.productName || '', brandLabel(p.brandName, p.brandNameEn)].filter(Boolean).join('\n'),
        retail: two(`${money(p.retailPriceIncVat)} (รวม VAT)`, `${money(exVat)} (ถอด VAT)`),
        deliveryDate: o.deliveryDate && /^\d{4}-\d{2}-\d{2}/.test(o.deliveryDate) ? o.deliveryDate : null,
        qty: Number(it.quantity) || 0,
        tax: Number(it.totalTax) || 0,
        status: statusLabel(o.status),
      });
    }
  }
  return {
    type: 'filing',
    title: 'รายงานการยื่นชำระภาษีสรรพสามิต',
    columns: [
      { key: 'quotationRef', label: 'เลขที่ใบเสนอราคา' },
      { key: 'taxInvoiceNumber', label: 'เลขที่ใบกำกับภาษี' },
      { key: 'product', label: 'รหัส FG / สินค้า / แบรนด์', multiline: true },
      { key: 'retail', label: 'ราคาขายปลีก (รวม/ถอด VAT)', multiline: true },
      { key: 'deliveryDate', label: 'วันที่จัดส่ง', date: true },
      { key: 'qty', label: 'จำนวน', num: true },
      { key: 'tax', label: 'ยอดภาษี', money: true },
      { key: 'status', label: 'สถานะ' },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} รายการ`,
      qty: sum(rows, (r) => r.qty),
      tax: sum(rows, (r) => r.tax),
    },
  };
}

export const REPORTS = {
  registration: registrationReport,
  filing: filingReport,
};

export async function buildReport(type, filter = {}) {
  const fn = REPORTS[type];
  if (!fn) throw new Error(`unknown report type: ${type}`);
  return fn(filter);
}
