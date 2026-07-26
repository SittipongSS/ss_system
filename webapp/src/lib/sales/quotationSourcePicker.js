// ── "ทำไมลูกค้ารายนี้ไม่อยู่ในลิสต์ออกใบเสนอราคา" ────────────────────────────────
// ลิสต์ลูกค้าบนหน้าสร้างใบเสนอราคาไม่ใช่ทะเบียนลูกค้า แต่ derive จาก "ดีลที่ออกใบได้"
// (มติ 2026-07-15: ลูกค้า → โครงการ → ดีล) — prod 2026-07-26 มีลูกค้าใช้งานได้ 89 ราย
// แต่เลือกได้ 11 ราย เพราะดีล 131/145 ใบยังไม่ผูกโครงการ. เดิมหายไปเงียบ ๆ ผู้ใช้จึง
// คิดว่าระบบพัง (เสียเวลาสืบทีละเคส) — มติผู้ใช้ 2026-07-26: **คงกติกาไว้ แต่ต้องบอกเหตุ
// ตอนค้นไม่เจอ** พร้อมทางไปแก้ ไม่ใช่โชว์ทุกรายให้ลิสต์ยาว

export const QUOTATION_DEAL_EXCLUDED_STAGES = ['won', 'in_project', 'lost'];

// ดีลที่ออกใบเสนอราคาได้: ผูกโครงการ + มีลูกค้า + stage ยังเปิด + เป็นดีลที่ผู้ใช้แก้ไขได้
// (canEdit มาจาก API — edit scope; ไม่ใช่ view scope ไม่งั้น POST จะเด้ง forbidden)
export function eligibleQuotationDeals(deals = []) {
  return (Array.isArray(deals) ? deals : []).filter((deal) => deal?.projectId
    && deal?.customerId
    && deal?.canEdit
    && !QUOTATION_DEAL_EXCLUDED_STAGES.includes(deal?.stage));
}

const norm = (value) => String(value || '').trim().toLocaleLowerCase('th');

// เหตุผลเรียงตาม "ใกล้ออกใบได้ที่สุดก่อน" — ผู้ใช้จะได้เห็นงานที่เหลืออีกก้าวเดียวก่อน
const REASONS = {
  closed_stage: {
    code: 'closed_stage',
    label: 'ดีลปิดแล้ว (Won / ไม่สำเร็จ) — ออกใบใหม่ไม่ได้',
    action: 'เปิดหน้าดีล',
  },
  no_project: {
    code: 'no_project',
    label: 'ดีลยังไม่ผูกโครงการ — ออกใบยังไม่ได้',
    action: 'ไปผูกโครงการที่หน้าดีล',
  },
  not_editable: {
    code: 'not_editable',
    label: 'เป็นดีลของทีมอื่น (คุณแก้ไขไม่ได้)',
    action: 'เปิดหน้าดีล',
  },
  no_deal: {
    code: 'no_deal',
    label: 'ยังไม่มีดีล — ต้องสร้างดีลก่อนออกใบ',
    action: 'ไปหน้าดีล',
  },
};

function reasonForDeals(deals) {
  if (!deals.length) return REASONS.no_deal;
  const open = deals.filter((d) => !QUOTATION_DEAL_EXCLUDED_STAGES.includes(d.stage));
  const openEditable = open.filter((d) => d.canEdit);
  if (openEditable.some((d) => !d.projectId)) return REASONS.no_project;
  if (open.length && !openEditable.length) return REASONS.not_editable;
  if (!open.length) return REASONS.closed_stage;
  return REASONS.no_project;
}

function pickDeal(deals, code) {
  if (code === 'no_project') {
    return deals.find((d) => d.canEdit && !d.projectId
      && !QUOTATION_DEAL_EXCLUDED_STAGES.includes(d.stage)) || deals[0] || null;
  }
  if (code === 'closed_stage') {
    return deals.find((d) => QUOTATION_DEAL_EXCLUDED_STAGES.includes(d.stage)) || deals[0] || null;
  }
  return deals[0] || null;
}

// คืนรายชื่อลูกค้าที่ "ค้นเจอในทะเบียน แต่ออกใบไม่ได้" พร้อมเหตุและดีลที่ควรไปจัดการ
// customers = ลิสต์ที่ picker มองเห็นอยู่แล้ว (กรองทีม/อนุมัติแล้ว — ดู useCustomerRecord)
export function blockedQuotationCustomers({
  search = '',
  customers = [],
  deals = [],
  limit = 3,
} = {}) {
  const needle = norm(search);
  if (needle.length < 2) return [];

  const eligibleIds = new Set(eligibleQuotationDeals(deals).map((deal) => deal.customerId));
  const dealsByCustomer = new Map();
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (!deal?.customerId) continue;
    if (!dealsByCustomer.has(deal.customerId)) dealsByCustomer.set(deal.customerId, []);
    dealsByCustomer.get(deal.customerId).push(deal);
  }

  const matched = (Array.isArray(customers) ? customers : []).filter((customer) => {
    if (!customer?.id || eligibleIds.has(customer.id)) return false;
    return `${norm(customer.name)} ${norm(customer.arCode)}`.includes(needle);
  });

  return matched.slice(0, limit).map((customer) => {
    const own = dealsByCustomer.get(customer.id) || [];
    const reason = reasonForDeals(own);
    const deal = pickDeal(own, reason.code);
    return {
      customerId: customer.id,
      customerName: customer.name || customer.id,
      reasonCode: reason.code,
      reason: reason.label,
      actionLabel: reason.action,
      dealId: deal?.id || null,
      dealTitle: deal?.title || null,
      href: deal?.id ? `/sa/deals/${deal.id}` : '/sa/deals',
    };
  });
}
