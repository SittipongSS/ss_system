import { can, inScope, isSuperuser } from '@/lib/permissions';
import { businessMonthKey } from '@/lib/businessDate';

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
  quotations: true, // เฟส D: FM-SA-01 เต็มรูป (เมนู /sa/quotations + editor + revise + พิมพ์)
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
  // viewer = whole-system read-only observer → sees every team's deals/pipeline,
  // exactly like a superuser's view (edit stays 'none' via salesPlanningEditScope).
  if (role === 'viewer') return 'all';
  // rd (ฝ่ายวิจัยและพัฒนา) ต้องเห็นดีล/โครงการทุกทีมเพื่อมีบริบทเต็มตอนตอบ
  // ข้อสอบถามจากฝ่ายขาย — อ่านอย่างเดียวเหมือน viewer (edit ยัง 'none').
  if (role === 'rd') return 'all';
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

// สร้าง "ดีล" ได้เฉพาะ AE / Senior AE (งานหน้าบ้าน — เจ้าของดีลคือ AE เสมอ);
// AC เป็น back-office ไม่เปิดดีล. superuser (admin / sales head) เปิดได้ในฐานะกำกับดูแล.
// แก้ไข/ดูดีลยังใช้ scope เดิม (canEditSalesPlanning + inSalesEditScope).
export function canCreateDeal(user) {
  return !!user && (user.role === 'ae' || user.role === 'senior_ae' || isSuperuser(user.role));
}

export function canEditSalesTarget(user) {
  // Targets are reserved for the sales head and admin. Plain salesplan:edit
  // (ae/ac) and team leads do NOT grant this.
  return !!user && can(user.role, 'salesplan:target');
}

export function canReviewSalesForecast(user) {
  return !!user && can(user.role, 'salesplan:review');
}

// อนุมัติใบเสนอราคา = การเซ็นรับรองโดย "เจ้าของดีล" (มติผู้ใช้ 2026-07-18 —
// ผู้อนุมัติบน FM-SA-01 = AE เจ้าของโครงการ/ลูกค้า). ผู้สร้างใบ (AC/AE/Senior) อาจไม่ใช่
// เจ้าของ → เจ้าของต้องอนุมัติก่อนส่ง; ถ้าเจ้าของสร้างเอง = เซ็นเองได้ (creator === owner).
// superuser (admin/หัวหน้าขาย) อนุมัติได้ในฐานะกำกับดูแล. deal ต้องมาพร้อม ownerId.
export function canApproveQuotation(user, deal) {
  if (!user || !deal) return false;
  if (isSuperuser(user.role)) return true;
  return !!user.id && user.id === deal.ownerId;
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
// true เฉพาะเมื่อเป็น stage จริง — ใช้ที่ PATCH เพื่อ "ปฏิเสธ" ค่าเพี้ยน แทนที่จะให้
// normalizeStage เงียบ ๆ ดันไป 'lead' (ดีลถูกดีดถอยสุดทางโดยไม่มี error)
export function isValidStage(value) {
  return DEAL_STAGES.includes(value);
}

// ประเภทดีล 3 ค่า (เฟส A Sales Revamp) — คอลัมน์จริง sales_deals.dealType (migration 0088)
// ค่าตรงกับ projects.type ของ PM แบบ 1:1 → passthrough ตรงตอนสร้างโครงการ (เลือก template).
// SCENT = พัฒนากลิ่น · NPD = พัฒนาสินค้า · RE-ORDER = สั่งผลิตซ้ำ
// (transition: ยังเขียน metadata.projectType คู่ไว้ 1 เฟส ให้โค้ด/ข้อมูลเก่าอ่านได้)
export const DEAL_TYPES = ['SCENT', 'NPD', 'RE-ORDER'];
export const DEAL_TYPE_LABELS = {
  SCENT: 'พัฒนากลิ่น',
  NPD: 'พัฒนาสินค้า',
  'RE-ORDER': 'สั่งผลิตซ้ำ',
};
export function normalizeDealType(value) {
  return DEAL_TYPES.includes(value) ? value : 'NPD';
}
// alias เดิม (โค้ดเก่าเรียกชื่อนี้) — PROJECT_TYPES เดิมมีแค่ 2 ค่า ตอนนี้ = DEAL_TYPES
export const PROJECT_TYPES = DEAL_TYPES;
export const normalizeProjectType = normalizeDealType;
// อ่านประเภทจาก deal row: คอลัมน์จริงก่อน แล้ว fallback metadata (ข้อมูลก่อน backfill/แคชเก่า)
export function dealTypeOf(deal) {
  return normalizeDealType(deal?.dealType || deal?.metadata?.projectType);
}

// ลำดับทีมมาตรฐานทั้งระบบ: KA → ODM → SV (ทีมที่ไม่รู้จักไปท้ายสุด).
export const TEAM_ORDER = ['KA', 'ODM', 'SV'];
export function teamRank(team) {
  const i = TEAM_ORDER.indexOf(team);
  return i < 0 ? TEAM_ORDER.length : i;
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

// เลขใบเสนอราคา FM-SA-01: QT-YYMMXXXX-R (YY ค.ศ. · MM เดือน · XXXX เลขรันรีเซ็ต
// ต่อเดือน — มติ #3 · R = revision เริ่ม 0). เลขรันออกจาก DB แบบ atomic
// (RPC next_quote_number — mig 0092) กันเลขซ้ำเมื่อสร้างพร้อมกัน.
export async function generateQuoteNumber(supabase, now = new Date()) {
  const month = businessMonthKey(now);
  const { data, error } = await supabase.rpc('next_quote_number', { p_month: month });
  if (error) throw new Error(`ออกเลขใบเสนอราคาไม่สำเร็จ: ${error.message}`);
  const base = `QT-${month}${String(data).padStart(4, '0')}`;
  return { base, quoteNumber: `${base}-0` };
}

// ปัดเงินเป็น 2 ตำแหน่ง (สตางค์) — กันทศนิยมลอย (เช่น 99.999) หลุดลง DB/เอกสาร/ยอด Won
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// ส่วนลดหนึ่งชั้น (ใช้ทั้งรายบรรทัด + ท้ายใบ): percent = % ของฐาน, amount = บาทตรง
export function discountAmountOf(base, discountType, discountValue) {
  const b = toMoney(base);
  const v = toMoney(discountValue);
  if (!discountType || v <= 0) return 0;
  const amt = discountType === 'percent' ? (b * Math.min(v, 100)) / 100 : v;
  return Math.min(amt, b); // ส่วนลดไม่เกินฐาน — ยอดไม่ติดลบ
}

// ยอดสุทธิรายบรรทัด: qty × unitPrice − ส่วนลดบรรทัด (ปัดสตางค์)
export function quoteLineNet(line = {}) {
  const gross = round2(toMoney(line.qty, 1) * toMoney(line.unitPrice));
  const discountAmount = round2(discountAmountOf(gross, line.discountType, line.discountValue));
  return { gross, discountAmount, lineTotal: round2(gross - discountAmount) };
}

// รวมทั้งใบ (FM-SA-01): subtotal(หลังลดรายบรรทัด) − ส่วนลดท้ายใบ = ฐานภาษี → + VAT
// vatRate default 0 = "ราคารวม VAT แล้ว" (ราคาตั้งต้น seed จาก retailPriceIncVat);
// เลือก 7 เมื่อต้องการบวก VAT แยกท้ายใบ. ทุกยอดปัดสตางค์ก่อนคืน (กันทศนิยมลอยลง DB).
export function quoteTotals(lines = [], { discountType = null, discountValue = 0, vatRate = 0 } = {}) {
  const subtotal = round2(lines.reduce((sum, line) => sum + quoteLineNet(line).lineTotal, 0));
  const discountAmount = round2(discountAmountOf(subtotal, discountType, discountValue));
  const taxable = round2(subtotal - discountAmount);
  const vatAmount = round2(taxable * (toMoney(vatRate) / 100));
  return { subtotal, discountAmount, vatAmount, totalAmount: round2(taxable + vatAmount) };
}
