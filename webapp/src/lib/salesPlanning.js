import { can, inScope, isSuperuser } from '@/lib/permissions';

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
  forecastReview: false, // "ทบทวนพยากรณ์ยอด" panel on the overview
  sahamitRisk: false,    // "ความเสี่ยง / ตรวจย้อน FC สหมิตร" KPI + panel
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
  if (isSuperuser(role)) return 'all';
  if (role === 'senior_ae' || role === 'ac') return 'team';
  if (role === 'ae') return 'own';
  return 'none';
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
  // Targets are reserved for the sales head and admin. Plain salesplan:edit
  // (ae/ac) and team leads do NOT grant this.
  return !!user && can(user.role, 'salesplan:target');
}

export function canReviewSalesForecast(user) {
  return !!user && can(user.role, 'salesplan:review');
}

export function inSalesViewScope(user, record) {
  return inScope(salesPlanningViewScope(user?.role), user, record)
    || inPmBackfillOwnerScope(user, record);
}

function normalizeOwnerName(value) {
  return String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function inPmBackfillOwnerScope(user, record) {
  if (salesPlanningEditScope(user?.role) !== 'own') return false;
  if (record?.metadata?.source !== 'pm-backfill') return false;
  const userName = normalizeOwnerName(user?.name);
  const ownerName = normalizeOwnerName(record?.ownerName);
  return !!userName && userName === ownerName;
}

export function inSalesEditScope(user, record) {
  return inScope(salesPlanningEditScope(user?.role), user, record)
    || inPmBackfillOwnerScope(user, record);
}

export function monthKey(value) {
  if (!value) return null;
  const s = String(value).slice(0, 7);
  return /^\d{4}-\d{2}$/.test(s) ? s : null;
}

export function yearKey(value) {
  if (!value) return null;
  const s = String(value).slice(0, 4);
  return /^\d{4}$/.test(s) ? s : null;
}

// Normalize a target period into { period, periodType } or null. Yearly targets
// use a 'YYYY' key, monthly targets a 'YYYY-MM' key.
export function normalizeTargetPeriod(period, periodType) {
  const type = periodType === 'year' ? 'year' : 'month';
  const key = type === 'year' ? yearKey(period) : monthKey(period);
  return key ? { period: key, periodType: type } : null;
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

// ประเภทโครงการ (ตรงกับ projects.type ของ PM) — เลือกตั้งแต่หน้าโครงการขาย เพื่อส่ง
// เป็นค่าตั้งต้นตอนสร้างไทม์ไลน์ PM. เก็บใน sales_deals.metadata.projectType (ไม่มี column แยก).
export const PROJECT_TYPES = ['NPD', 'RE-ORDER'];
export function normalizeProjectType(value) {
  return value === 'RE-ORDER' ? 'RE-ORDER' : 'NPD';
}

export function forecastAmount(deal) {
  // Probability weighting was dropped — "คาดการณ์" duplicated "มูลค่า", so the
  // forecast is simply the full project value.
  return toMoney(deal?.projectValue);
}

export function applyDealScope(query, user) {
  const scope = salesPlanningViewScope(user?.role);
  if (scope === 'team') return query.eq('team', user?.team ?? null);
  if (scope === 'own') {
    const id = user?.id ?? '';
    const name = user?.name ?? '';
    return name ? query.or(`ownerId.eq.${id},ownerName.eq.${name}`) : query.eq('ownerId', id);
  }
  if (scope === 'none') return query.eq('id', '__no_sales_planning_scope__');
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
