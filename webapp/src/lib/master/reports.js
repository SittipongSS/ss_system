// ── Master Data: data-quality reports (server-side aggregation) ───────────
// Database module owns DATA-QUALITY reports — completeness of the central
// registry — NOT workflow metrics (those live under /tax, /pm). Three reports:
//   customer  — ลูกค้าที่ข้อมูลไม่ครบ / รออนุมัติ
//   product   — สินค้าที่ข้อมูลไม่ครบ / รออนุมัติ
//   usage     — สรุปการใช้งาน master + ตรวจข้อมูลกำพร้า (ไม่เคยถูกอ้างถึง)
//
// Uniform report shape (shared with tax/pm) so the same table / Excel / print
// renderers work generically:
//   { type, title, columns:[{key,label,money?,date?,num?,multiline?}], rows, summary }
//
// Server-only: service-role admin client. The API route decides team scope
// (passes `team` for products) + whether tax usage counts are visible (`tax`).
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { TEAM_LABELS } from '@/lib/permissions';

const inRange = (value, from, to) => {
  if (!from && !to) return true;
  if (!value) return false;
  const t = new Date(value).getTime();
  if (isNaN(t)) return false;
  if (from && t < new Date(from).getTime()) return false;
  if (to && t > new Date(to).getTime() + 86399999) return false;
  return true;
};
const teamLabel = (t) => (t ? (TEAM_LABELS[t] || t) : '-');
const two = (a, b) => `${a}\n${b}`;
const blank = (v) => v == null || String(v).trim() === '';
const APPROVAL_LABEL = { approved: 'อนุมัติแล้ว', pending: 'รออนุมัติ', rejected: 'ตีกลับ' };
const approvalLabel = (s) => APPROVAL_LABEL[s] || (s ? s : 'อนุมัติแล้ว'); // legacy NULL = approved

// Render a missing-field checklist as a "main\nsub" multiline cell.
const issuesCell = (missing) =>
  missing.length ? [`ขาด ${missing.length} จุด`, ...missing.map((m) => `· ${m}`)].join('\n') : 'ครบถ้วน';

// 1) คุณภาพข้อมูลลูกค้า — one row per customer (central registry; not team-scoped).
export async function customerQualityReport(filter = {}) {
  const { from, to, status, customerId } = filter;
  const supabase = getSupabaseAdmin();
  let q = supabase.from('customers').select('*').order('createdAt', { ascending: false });
  if (customerId) q = q.eq('id', customerId);
  const { data, error } = await q;
  if (error) throw error;

  const customers = (data || []).filter((c) => inRange(c.createdAt, from, to));

  const rows = [];
  let cleanCount = 0;
  for (const c of customers) {
    const approval = c.approvalStatus || 'approved';
    if (status && status !== 'all' && approval !== status) continue;
    const missing = [];
    // taxId บังคับเฉพาะนิติบุคคล (บุคคลธรรมดา/ต่างชาติอาจไม่มี)
    if (c.customerType !== 'individual' && blank(c.taxId)) missing.push('เลขผู้เสียภาษี');
    if (blank(c.arCode)) missing.push('รหัสลูกค้า (AR)');
    if (blank(c.email)) missing.push('อีเมล');
    if (blank(c.phone) && blank(c.contactPhone)) missing.push('เบอร์โทร');
    if (blank(c.address)) missing.push('ที่อยู่');
    if (blank(c.contactPerson) && !(Array.isArray(c.contacts) && c.contacts.length)) missing.push('ผู้ติดต่อ');
    if (!missing.length) cleanCount++;
    rows.push({
      id: c.id,
      _missing: missing.length,
      customer: two(c.name || '-', c.arCode || '— ไม่มีรหัส —'),
      taxId: blank(c.taxId) ? '—' : c.taxId,
      contact: two(blank(c.email) ? '— ไม่มีอีเมล —' : c.email, c.phone || c.contactPhone || '— ไม่มีเบอร์ —'),
      status: two(approvalLabel(approval), c.isActive === false ? 'พักการใช้งาน' : 'ใช้งาน'),
      issues: issuesCell(missing),
    });
  }

  return {
    type: 'customer',
    title: 'รายงานคุณภาพข้อมูลลูกค้า',
    columns: [
      { key: 'customer', label: 'ลูกค้า / รหัส AR', multiline: true },
      { key: 'taxId', label: 'เลขผู้เสียภาษี' },
      { key: 'contact', label: 'อีเมล / เบอร์โทร', multiline: true },
      { key: 'status', label: 'สถานะอนุมัติ / การใช้งาน', multiline: true },
      { key: 'issues', label: 'ข้อมูลที่ขาด', multiline: true },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} ราย`,
      issues: `ครบถ้วน ${cleanCount} · ข้อมูลไม่ครบ ${rows.length - cleanCount}`,
    },
  };
}

// 2) คุณภาพข้อมูลสินค้า — one row per product (team-scoped via filter.team).
export async function productQualityReport(filter = {}) {
  const { from, to, status, team, customerId } = filter;
  const supabase = getSupabaseAdmin();
  let q = supabase.from('products').select('*').order('createdAt', { ascending: false });
  if (team) q = q.eq('team', team);
  if (customerId) q = q.eq('customerId', customerId);
  const { data, error } = await q;
  if (error) throw error;

  const products = (data || []).filter((p) => inRange(p.createdAt, from, to));

  const rows = [];
  let cleanCount = 0;
  for (const p of products) {
    const approval = p.approvalStatus || 'approved';
    if (status && status !== 'all' && approval !== status) continue;
    const missing = [];
    if (blank(p.fgCode)) missing.push('รหัส FG');
    if (blank(p.customerId)) missing.push('ลูกค้าเจ้าของ');
    if (blank(p.brandName)) missing.push('แบรนด์');
    if (p.volume == null || p.volume === '') missing.push('ปริมาตร');
    if (p.retailPriceIncVat == null || p.retailPriceIncVat === 0) missing.push('ราคาขายปลีก');
    if (!missing.length) cleanCount++;
    rows.push({
      id: p.id,
      _missing: missing.length,
      product: two(p.fgCode || '— ไม่มีรหัส —', [p.productDescription, p.brandName].filter(Boolean).join(' · ') || '-'),
      customer: p.customerName || '— ไม่ผูกลูกค้า —',
      size: p.volume != null && p.volume !== '' ? `${p.volume} ${p.volumeUnit || 'ml'}` : '—',
      status: two(approvalLabel(approval), p.isActive === false ? 'พักการใช้งาน' : 'ใช้งาน'),
      owner: teamLabel(p.team),
      issues: issuesCell(missing),
    });
  }

  return {
    type: 'product',
    title: 'รายงานคุณภาพข้อมูลสินค้า',
    columns: [
      { key: 'product', label: 'รหัส FG / สินค้า', multiline: true },
      { key: 'customer', label: 'ลูกค้าเจ้าของ' },
      { key: 'size', label: 'ขนาด' },
      { key: 'status', label: 'สถานะอนุมัติ / การใช้งาน', multiline: true },
      { key: 'owner', label: 'ทีม' },
      { key: 'issues', label: 'ข้อมูลที่ขาด', multiline: true },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} รายการ`,
      issues: `ครบถ้วน ${cleanCount} · ข้อมูลไม่ครบ ${rows.length - cleanCount}`,
    },
  };
}

// 3) สรุปการใช้งาน + ข้อมูลกำพร้า — one row per customer with counts of the
// records that reference it. Tax usage (registrations/orders) is only counted
// for users who may see tax data (`filter.tax`); others see products/projects.
// "กำพร้า" = ไม่มีอะไรอ้างถึงเลย (ลูกค้าที่สร้างไว้แต่ไม่เคยใช้งาน).
export async function usageSummaryReport(filter = {}) {
  const { from, to, tax, customerId } = filter;
  const supabase = getSupabaseAdmin();

  const [custRes, prodRes, regRes, orderRes, projRes] = await Promise.all([
    supabase.from('customers').select('id, name, arCode, isActive, createdAt').order('createdAt', { ascending: false }),
    supabase.from('products').select('id, customerId'),
    tax ? supabase.from('excise_registrations').select('id, customerId') : Promise.resolve({ data: [] }),
    tax ? supabase.from('orders').select('id, customerId') : Promise.resolve({ data: [] }),
    supabase.from('projects').select('id, customerId'),
  ]);
  if (custRes.error) throw custRes.error;

  const tally = (res) => {
    const m = new Map();
    for (const r of res.data || []) {
      if (!r.customerId) continue;
      m.set(r.customerId, (m.get(r.customerId) || 0) + 1);
    }
    return m;
  };
  const prodN = tally(prodRes), regN = tally(regRes), orderN = tally(orderRes), projN = tally(projRes);

  let customers = (custRes.data || []).filter((c) => inRange(c.createdAt, from, to));
  if (customerId) customers = customers.filter((c) => c.id === customerId);

  let orphanCount = 0;
  const rows = customers.map((c) => {
    const products = prodN.get(c.id) || 0;
    const registrations = regN.get(c.id) || 0;
    const orders = orderN.get(c.id) || 0;
    const projects = projN.get(c.id) || 0;
    const total = products + registrations + orders + projects;
    if (total === 0) orphanCount++;
    return {
      id: c.id,
      customer: two(c.name || '-', c.arCode || '— ไม่มีรหัส —'),
      products,
      ...(tax ? { registrations, orders } : {}),
      projects,
      usage: total === 0 ? '⚠ ไม่เคยถูกใช้งาน' : 'มีการใช้งาน',
    };
  });

  return {
    type: 'usage',
    title: 'รายงานสรุปการใช้งานข้อมูลลูกค้า',
    columns: [
      { key: 'customer', label: 'ลูกค้า / รหัส AR', multiline: true },
      { key: 'products', label: 'สินค้า (FG)', num: true },
      ...(tax ? [
        { key: 'registrations', label: 'การขึ้นทะเบียน', num: true },
        { key: 'orders', label: 'คำสั่งซื้อ', num: true },
      ] : []),
      { key: 'projects', label: 'โครงการ', num: true },
      { key: 'usage', label: 'สถานะการใช้งาน' },
    ],
    rows,
    summary: {
      _label: `รวม ${rows.length} ราย`,
      usage: `กำพร้า (ไม่เคยถูกใช้งาน) ${orphanCount} ราย`,
    },
  };
}

export const MASTER_REPORTS = {
  customer: customerQualityReport,
  product: productQualityReport,
  usage: usageSummaryReport,
};

export async function buildMasterReport(type, filter = {}) {
  const fn = MASTER_REPORTS[type];
  if (!fn) throw new Error(`unknown master report type: ${type}`);
  return fn(filter);
}
