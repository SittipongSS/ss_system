// ── Excise-tax reports: server-side aggregation ───────────────────────────
// One module, five reports. Each returns a uniform shape so the UI table, the
// Excel exporter, and the PDF printer can all render any report generically:
//
//   { type, title, columns: [{ key, label, money?, date?, num? }], rows: [...],
//     summary: { <colKey>: value, _label } }
//
// Server-only: uses the service-role admin client. The API route decides team
// scope (via viewScope) and passes `team` here; null = all teams.
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { ORDER_SELECT } from '@/lib/tax/orders';

// Date basis helpers -------------------------------------------------------
const inRange = (value, from, to) => {
  if (!value) return false;
  const t = new Date(value).getTime();
  if (isNaN(t)) return false;
  if (from && t < new Date(from).getTime()) return false;
  // `to` is inclusive of the whole day
  if (to && t > new Date(to).getTime() + 86399999) return false;
  return true;
};
const monthKey = (value) => {
  const d = new Date(value);
  if (isNaN(d.getTime())) return '-';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const sum = (arr, pick) => arr.reduce((s, x) => s + (Number(pick(x)) || 0), 0);

// Fetch helpers (team scope applied when `team` is provided) ----------------
async function fetchRegistrations({ team, customerId } = {}) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('excise_registrations').select('*');
  if (team) q = q.eq('team', team);
  if (customerId) q = q.eq('customerId', customerId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}
async function fetchOrders({ team, customerId } = {}) {
  const supabase = getSupabaseAdmin();
  let q = supabase.from('orders').select(ORDER_SELECT);
  if (team) q = q.eq('team', team);
  if (customerId) q = q.eq('customerId', customerId);
  const { data, error } = await q;
  if (error) throw error;
  return data || [];
}

// 1) การขึ้นทะเบียน — registrations within createdAt range, summary by status.
export async function registrationReport(filter = {}) {
  const { from, to } = filter;
  const regs = (await fetchRegistrations(filter)).filter(
    (r) => !from && !to ? true : inRange(r.createdAt, from, to),
  );
  const rows = regs.map((r) => ({
    fgCode: r.fgCode,
    productName: r.productName,
    brandName: r.brandName,
    customerName: r.customerName,
    status: r.status,
    exciseTax: r.exciseTax,
    localTax: r.localTax,
    approvalNumber: r.approvalNumber,
    approvedAt: r.approvedAt,
    createdAt: r.createdAt,
    team: r.team,
  }));
  return {
    type: 'registration',
    title: 'รายงานการขึ้นทะเบียนสรรพสามิต',
    columns: [
      { key: 'fgCode', label: 'รหัส FG' },
      { key: 'productName', label: 'สินค้า' },
      { key: 'brandName', label: 'แบรนด์' },
      { key: 'customerName', label: 'ลูกค้า' },
      { key: 'status', label: 'สถานะ' },
      { key: 'exciseTax', label: 'ภาษีสรรพสามิต/หน่วย', money: true },
      { key: 'localTax', label: 'ภาษีท้องถิ่น/หน่วย', money: true },
      { key: 'approvalNumber', label: 'เลขอนุมัติ' },
      { key: 'approvedAt', label: 'วันอนุมัติ', date: true },
      { key: 'createdAt', label: 'วันที่ยื่น', date: true },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} รายการ`,
      status: `อนุมัติ ${rows.filter((r) => r.status === 'approved').length} · รอ ${rows.filter((r) => r.status === 'pending_legal').length} · ตีกลับ ${rows.filter((r) => r.status === 'rejected').length}`,
    },
  };
}

// 2) สรุปภาษีตามรอบยื่น — filed orders grouped by month of filedAt.
export async function taxByPeriod(filter = {}) {
  const { from, to } = filter;
  const orders = (await fetchOrders(filter)).filter(
    (o) => o.filedAt && (!from && !to ? true : inRange(o.filedAt, from, to)),
  );
  const groups = new Map();
  for (const o of orders) {
    const k = monthKey(o.filedAt);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(o);
  }
  const rows = [...groups.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([period, list]) => ({
      period,
      count: list.length,
      totalExciseTax: sum(list, (o) => o.totalExciseTax),
      totalLocalTax: sum(list, (o) => o.totalLocalTax),
      totalTax: sum(list, (o) => o.totalTax),
    }));
  return {
    type: 'period',
    title: 'สรุปภาษีตามรอบยื่น (รายเดือน)',
    columns: [
      { key: 'period', label: 'รอบยื่น (ปี-เดือน)' },
      { key: 'count', label: 'จำนวนใบ', num: true },
      { key: 'totalExciseTax', label: 'ภาษีสรรพสามิต', money: true },
      { key: 'totalLocalTax', label: 'ภาษีท้องถิ่น', money: true },
      { key: 'totalTax', label: 'รวมภาษี', money: true },
    ],
    rows,
    summary: {
      _label: `รวม ${orders.length} ใบ`,
      totalExciseTax: sum(rows, (r) => r.totalExciseTax),
      totalLocalTax: sum(rows, (r) => r.totalLocalTax),
      totalTax: sum(rows, (r) => r.totalTax),
    },
  };
}

// 3) ภาษีแยกตามลูกค้า — all orders in createdAt range grouped by customer.
export async function taxByCustomer(filter = {}) {
  const { from, to } = filter;
  const orders = (await fetchOrders(filter)).filter(
    (o) => !from && !to ? true : inRange(o.createdAt, from, to),
  );
  const groups = new Map();
  for (const o of orders) {
    const k = o.customerId || o.customerName || '-';
    if (!groups.has(k)) groups.set(k, { name: o.customerName, taxId: o.customerTaxId, list: [] });
    groups.get(k).list.push(o);
  }
  const rows = [...groups.values()]
    .map((g) => ({
      customerName: g.name,
      taxId: g.taxId,
      count: g.list.length,
      totalExciseTax: sum(g.list, (o) => o.totalExciseTax),
      totalLocalTax: sum(g.list, (o) => o.totalLocalTax),
      totalTax: sum(g.list, (o) => o.totalTax),
    }))
    .sort((a, b) => b.totalTax - a.totalTax);
  return {
    type: 'customer',
    title: 'ภาษีแยกตามลูกค้า',
    columns: [
      { key: 'customerName', label: 'ลูกค้า' },
      { key: 'taxId', label: 'เลขผู้เสียภาษี' },
      { key: 'count', label: 'จำนวนใบ', num: true },
      { key: 'totalExciseTax', label: 'ภาษีสรรพสามิต', money: true },
      { key: 'totalLocalTax', label: 'ภาษีท้องถิ่น', money: true },
      { key: 'totalTax', label: 'รวมภาษี', money: true },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} ลูกค้า`,
      totalExciseTax: sum(rows, (r) => r.totalExciseTax),
      totalLocalTax: sum(rows, (r) => r.totalLocalTax),
      totalTax: sum(rows, (r) => r.totalTax),
    },
  };
}

// 4) ภาษีแยกตามสินค้า/แบรนด์ — order line items grouped by product (FG).
export async function taxByProduct(filter = {}) {
  const { from, to } = filter;
  const orders = (await fetchOrders(filter)).filter(
    (o) => !from && !to ? true : inRange(o.createdAt, from, to),
  );
  const groups = new Map();
  for (const o of orders) {
    for (const it of o.items || []) {
      const p = it.product || {};
      const k = it.productId || p.fgCode || '-';
      if (!groups.has(k)) {
        groups.set(k, { fgCode: p.fgCode, productName: p.productDescription, brandName: p.brandName, qty: 0, list: [] });
      }
      const g = groups.get(k);
      g.qty += Number(it.quantity) || 0;
      g.list.push(it);
    }
  }
  const rows = [...groups.values()]
    .map((g) => ({
      fgCode: g.fgCode,
      productName: g.productName,
      brandName: g.brandName,
      qty: g.qty,
      totalExciseTax: sum(g.list, (it) => it.totalExciseTax),
      totalLocalTax: sum(g.list, (it) => it.totalLocalTax),
      totalTax: sum(g.list, (it) => it.totalTax),
    }))
    .sort((a, b) => b.totalTax - a.totalTax);
  return {
    type: 'product',
    title: 'ภาษีแยกตามสินค้า / แบรนด์',
    columns: [
      { key: 'fgCode', label: 'รหัส FG' },
      { key: 'productName', label: 'สินค้า' },
      { key: 'brandName', label: 'แบรนด์' },
      { key: 'qty', label: 'จำนวน (หน่วย)', num: true },
      { key: 'totalExciseTax', label: 'ภาษีสรรพสามิต', money: true },
      { key: 'totalLocalTax', label: 'ภาษีท้องถิ่น', money: true },
      { key: 'totalTax', label: 'รวมภาษี', money: true },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} สินค้า`,
      totalExciseTax: sum(rows, (r) => r.totalExciseTax),
      totalLocalTax: sum(rows, (r) => r.totalLocalTax),
      totalTax: sum(rows, (r) => r.totalTax),
    },
  };
}

// 5) ค้างยื่น / เกินกำหนด — orders not yet complete, with days overdue vs taxDueDate.
export async function agingReport(filter = {}) {
  const orders = (await fetchOrders(filter)).filter((o) => o.status !== 'complete');
  const now = Date.now();
  const rows = orders
    .map((o) => {
      const due = o.taxDueDate ? new Date(o.taxDueDate).getTime() : null;
      const daysOverdue = due && !isNaN(due) ? Math.floor((now - due) / 86400000) : null;
      return {
        id: o.id,
        quotationRef: o.quotationRef,
        customerName: o.customerName,
        status: o.status,
        taxDueDate: o.taxDueDate,
        daysOverdue,
        totalTax: o.totalTax,
      };
    })
    .sort((a, b) => (b.daysOverdue ?? -Infinity) - (a.daysOverdue ?? -Infinity));
  return {
    type: 'aging',
    title: 'รายการค้างยื่น / เกินกำหนด',
    columns: [
      { key: 'id', label: 'เลขที่' },
      { key: 'quotationRef', label: 'อ้างอิงใบเสนอราคา' },
      { key: 'customerName', label: 'ลูกค้า' },
      { key: 'status', label: 'สถานะ' },
      { key: 'taxDueDate', label: 'กำหนดยื่น', date: true },
      { key: 'daysOverdue', label: 'เกินกำหนด (วัน)', num: true },
      { key: 'totalTax', label: 'ภาษีค้าง', money: true },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} ใบค้าง`,
      daysOverdue: `เกินกำหนด ${rows.filter((r) => (r.daysOverdue ?? 0) > 0).length} ใบ`,
      totalTax: sum(rows, (r) => r.totalTax),
    },
  };
}

// Registry — maps ?type= to its builder. Used by the API route.
export const REPORTS = {
  registration: registrationReport,
  period: taxByPeriod,
  customer: taxByCustomer,
  product: taxByProduct,
  aging: agingReport,
};

export async function buildReport(type, filter = {}) {
  const fn = REPORTS[type];
  if (!fn) throw new Error(`unknown report type: ${type}`);
  return fn(filter);
}
