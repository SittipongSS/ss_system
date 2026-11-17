// ── ตัวเลือกดีลแบบสองชั้น (ลูกค้า → ดีล) — ตรรกะล้วน ────────────────────────
//
// ⭐ ทำไมเป็นสองชั้น (มติผู้ใช้ 2026-08-06): ลิสต์ดีลบน prod ยาวเป็นร้อยใบ ชั้นเดียว
// ต้องเลื่อนยาวหรือรู้ชื่อดีลก่อนถึงจะค้นได้ · แผงซ้ายเป็นกลุ่มพร้อมจำนวนดีล แผงขวาเป็นดีลของกลุ่มนั้น
// แพตเทิร์นเดียวกับปุ่มตัวกรอง (components/ui/FilterPopover) ที่คนในระบบคุ้นอยู่แล้ว
//
// ⭐ กลุ่มฝั่งซ้าย = **ลูกค้า** (ยุบดีล/โครงการ P2d · มติเจ้าของ 13/11/2026) — เดิมเป็นโครงการ ซึ่งถูกซ่อนแล้ว
//   และบท "แฟ้มรวมหลายดีลของลูกค้า" ย้ายไปหน้าลูกค้าศูนย์รวม ⇒ คนคิดเป็น "ลูกค้ารายนี้มีดีลอะไรบ้าง"
//
// ถังพิเศษสองใบที่ต้องมีเสมอ:
//   · "ดีลทั้งหมด"     — คนที่จำได้แค่ชื่อดีลต้องค้นข้ามลูกค้าได้ในคลิกเดียว
//   · "ยังไม่มีลูกค้า"  — ดีลกลุ่มนี้มีจริงและผูกงานได้ ถ้าไม่มีถังมันจะหายไปเฉย ๆ

import { matchesQuery } from '@/lib/ui/pickerSearch';

export const ALL_DEALS_BUCKET = '__all_deals__';
export const NO_CUSTOMER_BUCKET = '__no_customer__';

/** รหัส AR ของลูกค้าเจ้าของดีล — มีเมื่อ endpoint ต้นทางแนบแถวลูกค้ามา (GET /deals แนบ `customer`) */
export const dealArCode = (deal) => deal?.customer?.arCode || deal?.customerArCode || '';

/** ป้ายลูกค้าของดีล — ว่าง = ยังไม่มีลูกค้า */
export const dealCustomerLabel = (deal) => String(deal?.customerName || deal?.customer?.name || '').trim();

/* กุญแจกลุ่ม: id ลูกค้าก่อน · ดีลเก่าที่มีแค่ชื่อ (ผูกก่อนมีทะเบียน) รวมด้วยชื่อ — ⚠️ รหัส AR ไม่ใช่ส่วนของกุญแจ
   (กติกาเดียวกับจัดกลุ่มตามลูกค้าของหน้ารายการดีล) */
const customerKeyOf = (deal) => {
  if (deal?.customerId) return `c:${deal.customerId}`;
  const name = dealCustomerLabel(deal).toLocaleLowerCase('th-TH');
  return name ? `n:${name}` : NO_CUSTOMER_BUCKET;
};

/** ข้อความที่ใช้ค้นดีลหนึ่งใบ — รหัส ชื่อ ลูกค้า (ชื่อ + AR) เดือน FC */
export const dealSearchText = (deal) => [
  deal?.code, deal?.title, dealCustomerLabel(deal), dealArCode(deal), deal?.forecastMonth,
].filter(Boolean).join(' ');

// กติกาค้นมาจากตัวกลางที่เดียว (lib/ui/pickerSearch) — ห้ามเขียนเงื่อนไขค้นซ้ำที่นี่
// ไม่งั้น "ค้นได้" ของแต่ละตัวเลือกจะแปลว่าคนละอย่างกัน
const matches = matchesQuery;

/**
 * ถังฝั่งซ้าย: ดีลทั้งหมด → ลูกค้า (เรียงตามชื่อ) → ยังไม่มีลูกค้า
 * ลูกค้าที่ไม่มีดีลไม่ถูกใส่มา — ถังที่เปิดแล้วว่างเปล่าคือคำโกหกว่ามีของให้เลือก
 */
export function buildDealBuckets(deals = []) {
  const byCustomer = new Map();
  for (const deal of deals) {
    const key = customerKeyOf(deal);
    if (!byCustomer.has(key)) byCustomer.set(key, []);
    byCustomer.get(key).push(deal);
  }

  const customerBuckets = [...byCustomer.entries()]
    .filter(([key]) => key !== NO_CUSTOMER_BUCKET)
    .map(([key, rows]) => {
      const name = rows.map(dealCustomerLabel).find(Boolean) || '';
      const arCode = rows.map(dealArCode).find(Boolean) || '';
      return {
        key,
        label: name,
        name,
        // รหัส AR อยู่บรรทัดรอง — ลูกค้าชื่อคล้ายกันแยกออกได้ด้วยรหัส
        code: arCode,
        search: `${name} ${arCode}`.trim(),
        deals: rows,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label, 'th'));

  const noCustomer = byCustomer.get(NO_CUSTOMER_BUCKET) || [];
  return [
    { key: ALL_DEALS_BUCKET, label: 'ดีลทั้งหมด', search: 'ดีลทั้งหมด all', deals },
    ...customerBuckets,
    ...(noCustomer.length
      ? [{ key: NO_CUSTOMER_BUCKET, label: 'ยังไม่มีลูกค้า', search: 'ยังไม่มีลูกค้า', deals: noCustomer }]
      : []),
  ];
}

/** กรองฝั่งซ้ายด้วยคำค้น — ถัง "ดีลทั้งหมด" ไม่เคยถูกกรองทิ้ง มันคือทางออกเมื่อหาไม่เจอ */
export function filterBuckets(buckets = [], query = '') {
  const needle = query.trim();
  if (!needle) return buckets;
  return buckets.filter((bucket) => bucket.key === ALL_DEALS_BUCKET || matches(bucket.search || bucket.label, needle));
}

/** กรองฝั่งขวาด้วยคำค้น (ชื่อดีล/ลูกค้า/รหัส/เดือน FC) */
export function filterDeals(deals = [], query = '') {
  const needle = query.trim();
  if (!needle) return deals;
  return deals.filter((deal) => matches(dealSearchText(deal), needle));
}

/** ถังที่ควรเปิดค้างไว้ตอนกางแผง — ของดีลที่เลือกอยู่ ไม่ใช่ถังแรกเสมอ */
export function initialBucketKey(deal) {
  if (!deal) return ALL_DEALS_BUCKET;
  return customerKeyOf(deal);
}
