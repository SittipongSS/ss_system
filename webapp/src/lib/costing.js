// ── ระบบขอราคาผลิต (Costing Request, mig 0141) ────────────────────────
// ฝ่ายขายเปิดใบผูกดีล → กางบรรทัดต้นทุนจากแม่แบบของประเภทสินค้า (mig 0140) →
// RD ตอบราคาวัตถุดิบ / PC ตอบราคาบรรจุภัณฑ์ → ผู้บริหารอนุมัติราคาผลิต
// **รายสินค้า** → ป้อนกลับเป็นต้นทุน FG
//
// มติที่ฝังอยู่ในไฟล์นี้ (2026-07-22):
//   • อนุมัติรายสินค้า — สถานะใบคำนวณจากลูกทุกครั้ง ไม่มีใครกดเปลี่ยนตรง ๆ
//   • ตัวนับ "อนุมัติแล้ว x/y" นับสดเสมอ ไม่เก็บเป็นคอลัมน์ (กันเลขเพี้ยนจากของจริง)
//   • ชั้น MOQ ดูจากการเทียบ qty กับ moq ของใบ ไม่เก็บธงซ้ำ
import {
  canApproveCosting, canQuoteCosting, canUser, canViewCosting, isSuperuser, normalizeDepartment,
} from '@/lib/permissions';
import { inSalesEditScope, inSalesViewScope } from '@/lib/salesPlanning';
import { businessMonthKey } from '@/lib/businessDate';

export const COSTING_STATUSES = [
  'draft', 'pricing', 'assembling', 'pending_exec', 'returned', 'approved', 'linked', 'cancelled',
];

export const COSTING_STATUS_LABELS = {
  draft: 'ร่าง',
  pricing: 'รอราคา RD/PC',
  assembling: 'กำลังประกอบต้นทุน',
  pending_exec: 'รอผู้บริหารอนุมัติ',
  returned: 'ตีกลับให้แก้',
  approved: 'อนุมัติครบแล้ว',
  linked: 'ป้อนต้นทุนแล้ว',
  cancelled: 'ยกเลิก',
};

// สีของ pill ตามระบบ token (ห้ามใส่ hex ตรง ๆ — ดู material-design skill)
export const COSTING_STATUS_TONES = {
  draft: 'var(--text-3)',
  pricing: 'var(--blue)',
  assembling: 'var(--teal)',
  pending_exec: 'var(--amber)',
  returned: 'var(--red)',
  approved: 'var(--green)',
  linked: 'var(--violet)',
  cancelled: 'var(--text-3)',
};

// สถานะที่ถือว่า "ใบยังเดินอยู่" — ใช้กรองคิวและเตือนตอนดีลหลุด
export const COSTING_OPEN_STATUSES = ['draft', 'pricing', 'assembling', 'pending_exec', 'returned'];

export const ITEM_APPROVAL_STATUSES = ['pending', 'approved', 'returned'];
export const ITEM_APPROVAL_LABELS = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  returned: 'ตีกลับ',
};

export function normalizeCostingStatus(value) {
  return COSTING_STATUSES.includes(value) ? value : 'draft';
}

// ── ตัวนับความคืบหน้า — นับสดจากลูกเสมอ ────────────────────────────────
export function approvalProgress(items = []) {
  const total = items.length;
  let approved = 0;
  let returned = 0;
  for (const item of items) {
    if (item?.approvalStatus === 'approved') approved += 1;
    else if (item?.approvalStatus === 'returned') returned += 1;
  }
  return { total, approved, returned, pending: total - approved - returned };
}

export function pricingProgress(components = []) {
  // บรรทัดค่าดำเนินการคิดภายใน ไม่ต้องรอใครตอบ — ไม่นับเข้าตัวหารของคิวขอราคา
  const asked = components.filter((c) => c?.sourceDept);
  const quoted = asked.filter((c) => c?.priceStatus === 'quoted');
  return { total: asked.length, quoted: quoted.length, pending: asked.length - quoted.length };
}

// ── สถานะใบ: คำนวณจากสถานะอนุมัติของลูกเสมอ ───────────────────────────
// เรียกทุกครั้งหลังอนุมัติ/ตีกลับรายสินค้า ในทรานแซกชันเดียวกับ action นั้น
// (ไม่มีปุ่ม "ปิดใบ" แยกให้ใครลืมกด). ใช้เฉพาะช่วงอนุมัติ — ก่อนหน้านั้นสถานะ
// ถูกขับด้วยเหตุการณ์อื่น (ส่งขอราคา/ราคาครบ) จึงคืนค่าเดิมไป
export function deriveRequestStatusAfterApproval(items = [], currentStatus = 'pending_exec') {
  if (currentStatus === 'cancelled' || currentStatus === 'linked') return currentStatus;
  if (!['pending_exec', 'returned', 'approved'].includes(currentStatus)) return currentStatus;
  if (items.length === 0) return currentStatus;

  const { total, approved, returned } = approvalProgress(items);
  // ตีกลับแม้รายการเดียว = ใบกลับไปอยู่ในมือฝ่ายขาย (รายการที่อนุมัติแล้วไม่หลุด)
  if (returned > 0) return 'returned';
  if (approved === total) return 'approved';
  return 'pending_exec';
}

// ── สูตรต้นทุนต่อชิ้น ──────────────────────────────────────────────────
// วัตถุดิบซื้อเป็นกิโล ต้องแปลงด้วยกรัม/ชิ้น; บรรจุภัณฑ์/ค่าดำเนินการเป็นบาท/ชิ้นอยู่แล้ว
// คืน null เมื่อยังไม่มีข้อมูลพอ (ยังไม่ตอบราคา / ยังไม่ระบุกรัม) — อย่าคืน 0
// เพราะ 0 แปลว่า "ฟรี" ซึ่งคนละความหมายกับ "ยังไม่รู้"
// null/undefined/'' = ยังไม่กรอก → null. ห้ามใช้ Number() ตรง ๆ เพราะ Number(null)
// และ Number('') คืน 0 ซึ่งจะกลายเป็น "ราคา 0 บาท" ทั้งที่แปลว่ายังไม่รู้ราคา
function numberOrNull(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export function componentUnitCost(component) {
  if (!component) return null;
  if (component.unitBasis === 'per_kg') {
    const pricePerKg = numberOrNull(component.pricePerKg);
    const grams = numberOrNull(component.gramsPerUnit);
    if (pricePerKg == null || grams == null || grams <= 0) return null;
    return (pricePerKg * grams) / 1000;
  }
  return numberOrNull(component.pricePerUnit);
}

// ต้นทุนรวมต่อชิ้นของสินค้าหนึ่งตัว
// complete = false แปลว่ายังมีบรรทัด "บังคับ" ที่ยังไม่มีราคา → ตัวเลขยังไม่ใช่ของจริง
export function itemUnitCost(components = []) {
  let total = 0;
  let complete = true;
  for (const component of components) {
    const cost = componentUnitCost(component);
    if (cost == null) {
      if (component?.required !== false) complete = false;
      continue;
    }
    total += cost;
  }
  return { total, complete };
}

// ── ชั้นจำนวน ──────────────────────────────────────────────────────────
export function isMoqTier(tier, moq) {
  return Number(tier?.qty) === Number(moq);
}

// ชั้นที่ใช้ป้อนต้นทุนกลับ FG (PR6) = ชั้น MOQ ถ้ามี ไม่งั้นชั้นน้อยสุดที่มีราคา
export function baselineTier(tiers = [], moq) {
  const priced = tiers.filter((t) => t?.approvedUnitPrice != null);
  if (!priced.length) return null;
  return priced.find((t) => isMoqTier(t, moq))
    || [...priced].sort((a, b) => Number(a.qty) - Number(b.qty))[0];
}

// ── ป้อนต้นทุนกลับสินค้า FG (PR6) ──────────────────────────────────────
// รายการที่พร้อมป้อนกลับ: อนุมัติราคาแล้ว + ผูก FG แล้ว + มีชั้นอ้างอิงที่มีราคา
export function feedCostError(item, moq) {
  if (!item) return 'ไม่พบรายการสินค้า';
  if (item.approvalStatus !== 'approved') return 'ต้องอนุมัติราคาผลิตของรายการนี้ก่อน';
  if (!item.productId) return 'รายการนี้ยังไม่ได้ผูกกับสินค้า (FG) ในระบบ';
  const tier = baselineTier(item.tiers || [], moq);
  if (!tier) return 'ยังไม่มีราคาที่อนุมัติในชั้นจำนวนใดเลย';
  return null;
}

// ต้นทุนที่จะเขียนลง products.costPrice = ราคาผลิตที่อนุมัติ ณ ชั้นอ้างอิง
// (ชั้น MOQ ก่อน ไม่มีก็ชั้นน้อยสุดที่มีราคา — ดู baselineTier)
export function feedCostValue(item, moq) {
  const tier = baselineTier(item?.tiers || [], moq);
  return tier ? Number(tier.approvedUnitPrice) : null;
}

// ใบจบสมบูรณ์เมื่อรายการที่อนุมัติทุกตัวถูกป้อนกลับ FG แล้ว
// (รายการที่ไม่ได้อนุมัติไม่นับ — ใบอาจมีบางตัวที่ถูกตีกลับแล้วเลิกทำ)
export function allApprovedItemsLinked(items = []) {
  const approved = items.filter((i) => i?.approvalStatus === 'approved');
  return approved.length > 0 && approved.every((i) => !!i.costFedAt);
}

// ── สิทธิ์รายใบ ────────────────────────────────────────────────────────
// เห็นใบ: ฝ่ายขายตาม scope ดีลเดิม (viewer/executive ได้ 'all' อยู่แล้ว);
// RD/PC เห็นทุกใบที่มีบรรทัดของฝ่ายตน — คิวเป็นของทั้งฝ่ายเหมือน inquiries
export function canViewCostingRequest(user, request) {
  if (!user || !request) return false;
  if (!canViewCosting(user)) return false;
  if (canQuoteCosting(user) || canApproveCosting(user)) return true;
  return inSalesViewScope(user, { team: request.team, ownerId: request.requestedById });
}

// ป้อนต้นทุนกลับ FG: ฝ่ายขายเจ้าของใบ + ต้องถือสิทธิ์แก้สินค้าด้วย (เพราะปลายทาง
// คือการเขียนราคาลง products). ทำได้เฉพาะตอนใบอนุมัติแล้ว — คนละด่านกับ
// canEditCostingRequest ซึ่งปิดตายหลังอนุมัติโดยตั้งใจ
export function canFeedCostFromRequest(user, request) {
  if (!user || !request) return false;
  if (!['approved', 'linked'].includes(request.status)) return false;
  if (!canUser(user, 'products:edit')) return false;
  if (isSuperuser(user.role)) return true;
  return inSalesEditScope(user, { team: request.team, ownerId: request.requestedById });
}

// แก้ใบ (ประกอบต้นทุน/เพิ่มสินค้า): ฝ่ายขายเจ้าของใบตาม scope แก้ไขเดิม
// ใบที่จบแล้วหรือยกเลิกแล้วแก้ไม่ได้
export function canEditCostingRequest(user, request) {
  if (!user || !request) return false;
  if (['approved', 'linked', 'cancelled'].includes(request.status)) return false;
  if (isSuperuser(user.role)) return true;
  return inSalesEditScope(user, { team: request.team, ownerId: request.requestedById });
}

// ── ขั้นตอนการเดินใบ ───────────────────────────────────────────────────
// ส่งให้ผู้บริหารได้เมื่อราคาครบและต้นทุนคำนวณได้จริง
// — ส่งไปทั้งที่ยังไม่มีราคา = ผู้บริหารตั้งราคาบนตัวเลขที่ไม่ครบ
// PR-B: ราคาวัสดุมาจากคลัง (เซลดึงเอง) — รับ status 'draft' ด้วย (ไม่มีขั้น pricing
// ที่รอ RD/PC ตอบในใบอีก). ส่ง libraryBlocker (จาก libraryPricingBlocker) มาเพื่อ
// บล็อกบรรทัดที่เกินอายุแล้วยังไม่ยืนยัน — ถ้าไม่ส่งมาจะข้ามการเช็คคลัง (เทสต์เดิม)
export function submitToExecError(request, libraryBlocker = null) {
  if (!request) return 'ไม่พบใบขอราคา';
  if (!['draft', 'assembling', 'returned', 'pricing'].includes(request.status)) {
    return 'ใบนี้ยังไม่อยู่ในขั้นตอนที่ส่งให้ผู้บริหารได้';
  }
  const items = request.items || [];
  if (!items.length) return 'ใบนี้ยังไม่มีรายการสินค้า';

  const pricing = pricingProgress(items.flatMap((i) => i.components || []));
  if (pricing.pending > 0) {
    return `ยังมีบรรทัดที่รอราคาอยู่ ${pricing.pending} รายการ`;
  }
  const incomplete = items.find((item) => !itemUnitCost(item.components || []).complete);
  if (incomplete) {
    return `ต้นทุนของ "${incomplete.productLabel}" ยังคำนวณไม่ครบ — ตรวจกรัม/ชิ้นและราคาให้ครบก่อน`;
  }
  // บรรทัดที่ดึงจากคลังแต่ราคาเกินอายุและยังไม่ยืนยัน (ส่งผลลัพธ์สำเร็จรูปมา)
  if (libraryBlocker) return libraryBlocker;
  return null;
}

// ผู้บริหารอนุมัติ/ตีกลับได้เฉพาะตอนใบรออนุมัติอยู่ และเฉพาะรายการที่ยังไม่ตัดสิน
export function canDecideItem(user, request, item) {
  if (!canApproveCosting(user)) return false;
  if (!['pending_exec', 'returned'].includes(request?.status)) return false;
  return item?.approvalStatus === 'pending';
}

// ── เลขที่เอกสาร: CR-YYMMXXXX (เลขรัน atomic ต่อเดือน — RPC เดิม mig 0096) ──
export async function generateCostingDocNo(supabase, now = new Date()) {
  const month = businessMonthKey(now);
  const { data, error } = await supabase.rpc('next_entity_number', { p_scope: 'CR', p_month: month });
  if (error) throw new Error(`ออกเลขที่ใบขอราคาไม่สำเร็จ: ${error.message}`);
  return `CR-${month}${String(data).padStart(4, '0')}`;
}

// ── บริบทจากดีล (optional — มติ 2026-07-23) ────────────────────────────
// ดีลไม่บังคับแล้ว: บางสินค้าที่ขอราคาผลิตอาจไม่ได้ไปต่อ. ถ้าเลือกดีล ลูกค้า/ทีม
// อ่านจากดีลจริงเสมอ (ไม่เชื่อ client — กันใบโผล่ใต้ลูกค้าผิดตัว); ไม่เลือกดีล =
// ใบสำรวจ ลูกค้า/ทีมมาจากที่ client ส่ง (customerName พิมพ์เอง) หรือว่างไว้ได้
export async function resolveCostingDealContext(supabase, user, dealId, fallback = {}) {
  if (!dealId) {
    return {
      deal: null,
      context: {
        dealId: null,
        projectId: null,
        customerId: fallback.customerId || null,
        customerName: fallback.customerName ? String(fallback.customerName).trim().slice(0, 300) : null,
        team: user?.team ?? null,
      },
    };
  }
  const { data: deal } = await supabase
    .from('sales_deals')
    .select('id, code, title, customerId, customerName, projectId, team, ownerId, status')
    .eq('id', dealId)
    .maybeSingle();
  if (!deal) return { error: 'ไม่พบดีล' };
  if (!isSuperuser(user?.role) && !inSalesEditScope(user, deal)) {
    return { error: 'ไม่มีสิทธิ์เปิดใบขอราคาในนามดีลนี้', status: 403 };
  }
  if (!deal.customerId) {
    return { error: 'ดีลนี้ยังไม่ได้ระบุลูกค้า — ระบุลูกค้าที่หน้าดีลก่อน' };
  }
  return {
    deal,
    context: {
      dealId: deal.id,
      projectId: deal.projectId ?? null,
      customerId: deal.customerId,
      customerName: deal.customerName ?? null,
      team: deal.team ?? user?.team ?? null,
    },
  };
}

// ── revise (ออกใบใหม่อ้างใบเดิม rev.2 — มติ 2026-07-23) ─────────────────
// revise ได้เฉพาะใบที่จบขั้นตอนแล้ว (อนุมัติ/ป้อนต้นทุน) — ใบที่ยังแก้ได้ให้แก้ในใบ
// เดิม ไม่ต้อง revise. คืนข้อความ error หรือ null
export function reviseError(request) {
  if (!request) return 'ไม่พบใบขอราคา';
  if (!['approved', 'linked'].includes(request.status)) {
    return 'ออกฉบับแก้ไขได้เฉพาะใบที่อนุมัติแล้ว — ใบที่ยังไม่จบให้แก้ในใบเดิม';
  }
  return null;
}

// สูตรบนรายการต่างจากสูตรปัจจุบันของสินค้าที่ผูกไว้ไหม — เตือน ไม่บล็อก
// item = { formulaCode, productId }, product = ข้อมูลสินค้าล่าสุด (อาจ null)
export function formulaDrift(item, product) {
  if (!item?.productId || !product) return null;
  const snap = String(item.formulaCode || '').trim();
  const current = String(product.formulaCode || '').trim();
  if (!snap || !current) return null;         // ไม่มีข้อมูลพอ = ไม่เตือน
  if (snap === current) return null;
  return { snapshot: snap, current };
}
