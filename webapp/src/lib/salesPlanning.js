import { can, inScope, isSuperuser, viewScope } from '@/lib/permissions';

export const DEAL_STAGES = [
  'lead',
  'qualified',
  'quotation',
  'timeline_proposed',
  'awaiting_confirm',
  'deposit_pending',
  'won',
  'in_project',
  'lost',
];

export const STAGE_LABELS = {
  lead: 'ลีด',
  qualified: 'ผ่านคัดกรอง',
  quotation: 'เสนอราคา',
  timeline_proposed: 'เสนอไทม์ไลน์',
  awaiting_confirm: 'รอยืนยัน',
  deposit_pending: 'รอมัดจำ',
  won: 'ปิดได้ (Won)',
  in_project: 'เข้าโครงการ',
  lost: 'ไม่สำเร็จ (Lost)',
};

// Feature toggles — modules intentionally hidden in the UI for now (Phase 1
// keeps the commercial spine only). Flip to true to re-enable; backend/data and
// API routes stay intact so no data is lost while hidden.
export const SALES_FEATURES = {
  quotations: false,
  documents: false,
  shipment: false,
};

export const DEFAULT_PROBABILITY_BY_STAGE = {
  lead: 10,
  qualified: 30,
  quotation: 55,
  timeline_proposed: 65,
  awaiting_confirm: 75,
  deposit_pending: 90,
  won: 100,
  in_project: 100,
  lost: 0,
};

export function salesPlanningViewScope(role) {
  return viewScope(role);
}

export function salesPlanningEditScope(role) {
  // Commercial deals follow the generic editScope, NOT PM's team-collaborative
  // model: AE edits only its OWN deals; ac / senior_ae edit the whole team.
  if (isSuperuser(role)) return 'all';
  if (role === 'senior_ae' || role === 'ac') return 'team';
  if (role === 'ae') return 'own';
  return 'none';
}

export function canViewSalesPlanning(user) {
  return !!user && can(user.role, 'salesplan:view');
}

export function canEditSalesPlanning(user) {
  return !!user && can(user.role, 'salesplan:edit');
}

export function canEditSalesTarget(user) {
  // Targets are a supervisory tool — only salesplan:target holders (senior_ae /
  // ae_supervisor / admin). Plain salesplan:edit (ae/ac) does NOT grant this.
  return !!user && can(user.role, 'salesplan:target');
}

export function canReviewSalesForecast(user) {
  return !!user && can(user.role, 'salesplan:review');
}

export function inSalesViewScope(user, record) {
  return inScope(salesPlanningViewScope(user?.role), user, record);
}

export function inSalesEditScope(user, record) {
  return inScope(salesPlanningEditScope(user?.role), user, record);
}

export function monthKey(value) {
  if (!value) return null;
  const s = String(value).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

export function toMoney(value, fallback = 0) {
  if (value === '' || value == null) return fallback;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function toProbability(value, stage = 'lead') {
  if (value === '' || value == null) return DEFAULT_PROBABILITY_BY_STAGE[stage] ?? 10;
  const n = Number(value);
  if (!Number.isFinite(n)) return DEFAULT_PROBABILITY_BY_STAGE[stage] ?? 10;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function normalizeStage(value) {
  return DEAL_STAGES.includes(value) ? value : 'lead';
}

export function forecastAmount(deal) {
  // Probability weighting was dropped — "คาดการณ์" duplicated "มูลค่า", so the
  // forecast is simply the full project value.
  return toMoney(deal?.projectValue);
}

export function applyDealScope(query, user) {
  if (salesPlanningViewScope(user?.role) === 'team') return query.eq('team', user?.team ?? null);
  return query;
}

export function dealAuditLabel(deal) {
  return `${deal?.title || 'deal'}${deal?.customerName ? ` · ${deal.customerName}` : ''}`;
}

export async function generateQuoteNumber(supabase, now = new Date()) {
  const prefix = `QT-${now.getFullYear().toString().slice(-2)}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
  const { data: latest } = await supabase
    .from('quotations')
    .select('quoteNumber')
    .ilike('quoteNumber', `${prefix}%`)
    .order('quoteNumber', { ascending: false })
    .limit(1);
  let nextNum = 1;
  if (latest?.[0]?.quoteNumber) {
    const lastNum = parseInt(latest[0].quoteNumber.slice(prefix.length), 10);
    if (!Number.isNaN(lastNum)) nextNum = lastNum + 1;
  }
  return `${prefix}${nextNum.toString().padStart(3, '0')}`;
}

export function quoteTotals(lines = []) {
  const subtotal = lines.reduce((sum, line) => sum + toMoney(line.lineTotal ?? (toMoney(line.qty, 1) * toMoney(line.unitPrice))), 0);
  const vatAmount = 0;
  return { subtotal, vatAmount, totalAmount: subtotal + vatAmount };
}
