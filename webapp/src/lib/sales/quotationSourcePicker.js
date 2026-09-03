// ── "ทำไมลูกค้ารายนี้ไม่อยู่ในลิสต์ออกใบเสนอราคา" ────────────────────────────────
// ลิสต์ลูกค้าบนหน้าสร้างใบเสนอราคาไม่ใช่ทะเบียนลูกค้า แต่ derive จาก "ดีลที่ออกใบได้"
//
// ⭐ **โครงการถูกถอดออกจากเงื่อนไข** (2026-08-24) — เดิมต้องผูกโครงการก่อนจึงออกใบได้
// ซึ่งกินลิสต์ไปเกือบหมด (prod 2026-07-26: ลูกค้าใช้งานได้ 89 ราย เลือกได้ 11 ราย
// เพราะดีล 131/145 ใบยังไม่ผูกโครงการ) · รอบนั้นแก้ด้วยการ "คงกติกาไว้ แต่บอกเหตุ"
// รอบนี้ผู้ใช้บอกว่ายังยุ่งยากอยู่ดี และตรวจแล้วว่าตอนออกใบไม่มีใครอ่านค่าโครงการเลย
// ⇒ ถอดกติกาทิ้ง · ด่าน "ต้องมีโครงการ" เหลือที่เดียวคือตอนรับใบปิด Won
// ตัวบอกเหตุยังอยู่ครบสำหรับเงื่อนไขที่เหลือ (ปิดแล้ว · ทีมอื่น · ยังไม่มีลูกค้า)

import { CLOSED_STAGES } from '@/lib/salesPlanning';
import { customerNameIn, customerNameSearchText } from '@/lib/master/customerName';

// = ดีลที่ปิดแล้วทุกแบบ (นิยามกลางที่ lib/salesPlanning) — คงชื่อเดิมไว้เพราะสื่อ
// เจตนาเฉพาะที่ของลิสต์นี้ ("ออกใบไม่ได้แล้ว") และมีเทสต์อ้างชื่อนี้อยู่
export const QUOTATION_DEAL_EXCLUDED_STAGES = CLOSED_STAGES;

/* ดีลที่ออกใบเสนอราคาได้: stage ยังเปิด + เป็นดีลที่ผู้ใช้แก้ไขได้
   (canEdit มาจาก API — edit scope; ไม่ใช่ view scope ไม่งั้น POST จะเด้ง forbidden)

   ⭐ **ไม่บังคับลูกค้าที่ตัวดีลแล้ว** (2026-08-24) — ใบเสนอราคายังต้องมีลูกค้าเสมอ
   แต่ดีลที่ยังไม่มีสามารถ "รับลูกค้าที่เลือกบนฟอร์ม" ไปตั้งให้ตัวเองได้ตอนบันทึก
   (ดู lib/sales/dealCustomerAdopt) ⇒ ตัดออกจากลิสต์ตั้งแต่ต้นทางคือปิดทางแก้
   ⚠️ ต้องตรงกับด่าน server ที่ `deals/[id]/quotations` และกับ `canQuoteDeal` เสมอ */
export function eligibleQuotationDeals(deals = []) {
  return (Array.isArray(deals) ? deals : []).filter((deal) => deal?.canEdit
    && !QUOTATION_DEAL_EXCLUDED_STAGES.includes(deal?.stage));
}

/* ดีลที่ยัง "ไม่มีเจ้าของลูกค้า" — ฟอร์มเอาไปต่อท้ายลิสต์ของลูกค้าที่เลือกไว้
   (เลือกแล้ว = ตั้งลูกค้ารายนั้นให้ดีลตอนบันทึก) */
export function unassignedQuotationDeals(deals = []) {
  return eligibleQuotationDeals(deals).filter((deal) => !deal.customerId);
}

const norm = (value) => String(value || '').trim().toLocaleLowerCase('th');

// เหตุผลเรียงตาม "ใกล้ออกใบได้ที่สุดก่อน" — ผู้ใช้จะได้เห็นงานที่เหลืออีกก้าวเดียวก่อน
const REASONS = {
  closed_stage: {
    code: 'closed_stage',
    label: 'ดีลปิดแล้ว (Won / ไม่สำเร็จ) — ออกใบใหม่ไม่ได้',
    action: 'เปิดหน้าดีล',
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

/**
 * เหตุที่ **ดีลใบนี้** ออกใบเสนอราคาไม่ได้ — คืน `null` เมื่อออกได้
 *
 * ⭐ อยู่ไฟล์เดียวกับ `eligibleQuotationDeals` โดยเจตนา: ทั้งคู่คือกติกาข้อเดียวกัน
 *    มองคนละมุม (ลิสต์ "ใครออกได้" กับ "ทำไมใบนี้ออกไม่ได้") — แยกบ้านกันเมื่อไร
 *    วันหนึ่งจะเพี้ยนจากกันโดยไม่มีอะไรเตือน
 *
 * 🐞 **สิ่งที่ตัวนี้ปิด** — ปุ่ม "สร้างใบเสนอราคา" บนหน้าดีลเขียนเงื่อนไขชุดเดียวกันนี้
 *    ด้วยมือ (`canEdit && customerId && !isClosedStage` — สมัยนั้นมี `projectId` ด้วย)
 *    เงียบ ๆ* เมื่อไม่ผ่าน ⇒ ผู้ใช้เห็นการ์ดใบเสนอราคาแต่ไม่มีปุ่ม และไม่มีอะไรบอกว่า
 *    ทำไม · กติกาของระบบคือ **โชว์ปุ่มเสมอ แล้วบอกเหตุตอนกด** (แบบเดียวกับโมดัล
 *    ออกสัญญา: "ซ่อนปุ่มเงียบ ๆ = คนถามว่าปุ่มอยู่ไหน")
 *
 * ⚠️ ลำดับการตรวจ = ลำดับที่ผู้ใช้แก้ได้จริง (ปิดดีลแล้วแก้ไม่ได้เลยมาก่อน ส่วนที่
 *    เหลืออีกก้าวเดียวอยู่ท้าย) — เรียงสลับกันจะได้ข้อความที่ชี้ไปผิดที่
 *
 * @param deal ต้องมี `canEdit` ติดมาด้วย (หน้าดีลถือเป็นตัวแปรของหน้า ไม่ใช่ของแถว)
 */
export function quotationDealBlocker(deal) {
  if (!deal) return REASONS.no_deal.label;
  if (QUOTATION_DEAL_EXCLUDED_STAGES.includes(deal.stage)) return REASONS.closed_stage.label;
  if (!deal.canEdit) return REASONS.not_editable.label;
  /* ⚠️ **ไม่มีลูกค้า ≠ ออกใบไม่ได้** อีกต่อไป (2026-08-24) — ฟอร์มถามลูกค้าเป็นช่องแรก
     อยู่แล้ว และตั้งให้ดีลตอนบันทึก ⇒ บล็อกที่ปุ่มคือส่งคนไปแก้ที่หน้าดีลโดยไม่จำเป็น */
  return null;
}

// ── เหตุที่ลูกค้า "ไม่โผล่ในลิสต์เลย" (ไม่ใช่เรื่องดีล) ────────────────────────────
// ลิสต์ลูกค้าที่ picker เห็นถูกกรอง 3 ชั้น: อนุมัติแล้ว + ไม่ถูกพักใช้ + ทีมที่ดูแล
// (GET /api/customers) — สามเหตุนี้จึงหายเงียบสนิทแม้หลังมีตัวบอกเหตุรอบแรก เพราะ
// ตัวบอกเหตุค้นได้แค่ในลิสต์ที่ถูกกรองมาแล้ว. ต้องเทียบกับทะเบียนทั้งหมดจึงจะตอบได้
// (เคสจริง: แก้ที่อยู่ลูกค้า → ตกกลับรออนุมัติ → หายจากลิสต์ออกใบทันทีแบบไม่มีคำอธิบาย)
const REGISTRY_REASONS = {
  pending_approval: {
    code: 'pending_approval',
    label: 'ลูกค้ารออนุมัติ (ของใหม่ หรือถูกแก้ข้อมูลหลังอนุมัติ) — ออกใบได้เมื่อหัวหน้าอนุมัติแล้ว',
    action: 'เปิดทะเบียนลูกค้า',
    href: '/database/customers',
  },
  rejected: {
    code: 'rejected',
    label: 'ลูกค้าถูกปฏิเสธในทะเบียน — ต้องแก้ตามเหตุผลแล้วยื่นอนุมัติใหม่',
    action: 'เปิดทะเบียนลูกค้า',
    href: '/database/customers',
  },
  inactive: {
    code: 'inactive',
    label: 'ลูกค้าถูกพักใช้ (ปิดใช้งาน) — เปิดใช้งานก่อนจึงจะออกใบได้',
    action: 'เปิดทะเบียนลูกค้า',
    href: '/database/customers',
  },
  other_team: {
    code: 'other_team',
    label: 'ลูกค้าอยู่ในความดูแลของทีมอื่น — ให้ทีมที่ดูแลออกใบ หรือขอเพิ่มทีมของคุณเข้าไปดูแล',
    action: 'เปิดทะเบียนลูกค้า',
    href: '/database/customers',
  },
};

function registryReasonFor(customer) {
  const approval = customer?.approvalStatus;
  if (approval === 'rejected') return REGISTRY_REASONS.rejected;
  if (approval && approval !== 'approved') return REGISTRY_REASONS.pending_approval;
  if (customer?.isActive === false) return REGISTRY_REASONS.inactive;
  return REGISTRY_REASONS.other_team;
}

function reasonForDeals(deals) {
  if (!deals.length) return REASONS.no_deal;
  const open = deals.filter((d) => !QUOTATION_DEAL_EXCLUDED_STAGES.includes(d.stage));
  if (!open.length) return REASONS.closed_stage;
  // ⚠️ ลิสต์นี้ทำจากดีลที่ "มีลูกค้ารายนี้" อยู่แล้ว และโครงการ/ลูกค้าไม่ใช่ด่านอีกต่อไป
  // ⇒ เหตุที่เหลือมีทางเดียว: เปิดอยู่แต่ไม่ใช่ดีลที่คนนี้แก้ไขได้
  return REASONS.not_editable;
}

function pickDeal(deals, code) {
  if (code === 'closed_stage') {
    return deals.find((d) => QUOTATION_DEAL_EXCLUDED_STAGES.includes(d.stage)) || deals[0] || null;
  }
  return deals[0] || null;
}

// คืนรายชื่อลูกค้าที่ "ค้นเจอในทะเบียน แต่ออกใบไม่ได้" พร้อมเหตุและที่ควรไปจัดการ
// customers        = ลิสต์ที่ picker มองเห็น (กรองอนุมัติ+พักใช้+ทีม — ดู /api/customers)
// registryCustomers = ทะเบียนทั้งหมด (?manage=1) ใช้ตอบเฉพาะ "ทำไมไม่โผล่ในลิสต์เลย"
//                     ห้ามเอาไปทำตัวเลือกให้เลือก — กติกาการกรองยังเหมือนเดิมทุกจุด
export function blockedQuotationCustomers({
  search = '',
  customers = [],
  registryCustomers = [],
  deals = [],
  limit = 3,
} = {}) {
  const needle = norm(search);
  if (needle.length < 2) return [];
  // ชุดค้นต้องมีทั้งสองภาษา — ลูกค้าต่างชาติที่ไม่มีชื่อไทยเคยพิมพ์ชื่อจริงแล้วไม่เจอ
  // แม้แต่ข้อความบอกเหตุ (ตาเห็นบนแถว = ต้องค้นเจอ)
  const matchesNeedle = (customer) => `${norm(customerNameSearchText(customer))} ${norm(customer.arCode)}`.includes(needle);

  const eligibleIds = new Set(eligibleQuotationDeals(deals).map((deal) => deal.customerId));
  const dealsByCustomer = new Map();
  for (const deal of Array.isArray(deals) ? deals : []) {
    if (!deal?.customerId) continue;
    if (!dealsByCustomer.has(deal.customerId)) dealsByCustomer.set(deal.customerId, []);
    dealsByCustomer.get(deal.customerId).push(deal);
  }

  const visible = Array.isArray(customers) ? customers : [];
  const visibleIds = new Set(visible.map((customer) => customer?.id).filter(Boolean));
  // มองเห็นแต่ออกใบไม่ได้ → เหตุอยู่ที่ดีล (ยังไม่ผูกโครงการ / ปิดแล้ว / ทีมอื่นเป็นเจ้าของ)
  const blockedByDeal = visible
    .filter((customer) => customer?.id && !eligibleIds.has(customer.id) && matchesNeedle(customer))
    .map((customer) => {
      const own = dealsByCustomer.get(customer.id) || [];
      const reason = reasonForDeals(own);
      const deal = pickDeal(own, reason.code);
      return {
        customerId: customer.id,
        customerName: customerNameIn(customer) || customer.id,
        reasonCode: reason.code,
        reason: reason.label,
        actionLabel: reason.action,
        dealId: deal?.id || null,
        dealTitle: deal?.title || null,
        href: deal?.id ? `/sa/deals/${deal.id}` : '/sa/deals',
      };
    });

  // ไม่โผล่ในลิสต์เลย → เหตุอยู่ที่ตัวทะเบียนลูกค้าเอง (อนุมัติ/พักใช้/ทีมดูแล)
  const blockedByRegistry = (Array.isArray(registryCustomers) ? registryCustomers : [])
    .filter((customer) => customer?.id && !visibleIds.has(customer.id) && matchesNeedle(customer))
    .map((customer) => {
      const reason = registryReasonFor(customer);
      return {
        customerId: customer.id,
        customerName: customerNameIn(customer) || customer.id,
        reasonCode: reason.code,
        reason: reason.label,
        actionLabel: reason.action,
        dealId: null,
        dealTitle: null,
        href: reason.href,
      };
    });

  // เหตุที่ "ใกล้ออกใบได้" มาก่อน (ของที่เหลืออีกก้าวเดียว) แล้วจึงเหตุระดับทะเบียน
  return [...blockedByDeal, ...blockedByRegistry].slice(0, limit);
}
