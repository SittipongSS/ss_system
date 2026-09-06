// ── กระดิ่งทวง "สัญญาค้างรอลงนาม" ──────────────────────────────────────────
//
// ⭐ ทะเบียนสัญญามีการ์ด "ค้างเกิน 14 วัน" อยู่แล้ว แต่การ์ดเห็นได้เฉพาะคนที่**เปิด
//    ทะเบียน** · ใบที่ส่งไปให้ลูกค้าเซ็นแล้วเงียบคือใบที่ไม่มีใครเปิดไปดู ⇒ ตัวเลขบน
//    การ์ดจึงไม่เคยถึงตาคนที่ต้องโทรตาม · ที่นี่ยิงเข้ากระดิ่งของ **เจ้าของใบ** แทน
//
// ⚠️ **ยิงจาก cron ไม่ใช่ตอนเปิดหน้า** (ต่างจาก `renewalNotify` / `contractQuotationSync`
//    ที่กวาดตอนมีคนเปิดทะเบียน) — เพราะทะเบียนสัญญาถูกกรองตามขอบเขตของคนเปิด
//    (`loadScoped`) ⇒ AE คนหนึ่งเปิดหน้าแล้วจะเห็นเฉพาะใบของตัวเอง กวาดตอนนั้นก็
//    ทวงได้เฉพาะคนที่บังเอิญเปิดหน้า ซึ่งคือคนที่ไม่ต้องทวงอยู่แล้ว
//    ⇒ ไปอยู่ที่ `/api/cron/daily-digest` ซึ่งรันด้วยสิทธิ์ admin เห็นทุกใบ
//
// ⭐ **หนึ่งคนหนึ่งเด้งต่อวัน** (กติกาผู้รับ mig 0185) — ไม่ใช่หนึ่งใบหนึ่งเด้ง
//    คนที่มีใบค้าง 6 ใบต้องได้ข้อความเดียวที่บอกว่า 6 ใบ ไม่ใช่กระดิ่ง 6 อัน
import { SIGNATURE_LATE_DAYS, daysAwaitingSignature } from '@/lib/sales/contracts';

export const CONTRACT_OVERDUE_KIND = 'contract_signature_overdue';
export const CONTRACT_ENTITY_TYPE = 'sales_contract';

/** กุญแจกันยิงซ้ำ — หนึ่งคน หนึ่งวัน หนึ่งครั้ง (เปิด cron ซ้ำวันเดียวกันไม่เกิดแถวซ้ำ) */
export const overdueSignatureDedupeKey = (dayKey, userId) => `CTLATE-${dayKey}-${userId}`;

/**
 * ใครต้องถูกทวงวันนี้ + ข้อความว่าอะไร — ฟังก์ชันบริสุทธิ์ เทสต์ได้ ไม่แตะฐานข้อมูล
 *
 * @param contracts แถวจาก `sales_contracts` — ใช้ `status` · `issuedAt` · `contractNo`
 *                  · `ownerId` · `createdBy` · `customerName`
 * @param now       เวลาอ้างอิง (ฉีดเข้ามาเพื่อให้เทสต์ไม่อ่านนาฬิกาจริง)
 * @param dayKey    วันตามนาฬิกาไทย (`businessDayKey`) — ใช้เป็นกุญแจกันยิงซ้ำ
 *
 * ⚠️ เกณฑ์ "สาย" ใช้ `SIGNATURE_LATE_DAYS` ตัวเดียวกับการ์ดสรุป · ราง · ป้ายบนใบ
 *    เทียบด้วย `>` เหมือนกันหมด — ถ้าที่นี่ใช้ `>=` คนจะได้กระดิ่งก่อนที่การ์ดจะนับให้
 * ⚠️ **ผู้รับคือเจ้าของใบ ไม่ใช่ทั้งทีม** — ไม่มีทั้ง `ownerId` และ `createdBy` = ไม่ยิง
 *    (ส่งหาทุกคนคือสิ่งที่ทำให้กระดิ่งกลายเป็นกองที่ไม่มีใครอ่าน)
 */
export function overdueSignatureNotices(contracts = [], { now = new Date(), dayKey = null } = {}) {
  const late = [];
  for (const contract of contracts || []) {
    const days = daysAwaitingSignature(contract, now);
    if (days === null || days <= SIGNATURE_LATE_DAYS) continue;
    const userId = contract.ownerId || contract.createdBy;
    if (!userId) continue;
    late.push({ contract, days, userId: String(userId) });
  }
  if (!late.length) return [];

  // จัดกลุ่มตาม "ใครต้องโทรตาม" — คนเดียวถือหลายใบได้ และต้องได้ข้อความเดียว
  const buckets = new Map();
  for (const row of late) {
    if (!buckets.has(row.userId)) buckets.set(row.userId, []);
    buckets.get(row.userId).push(row);
  }

  return [...buckets.entries()].map(([userId, rows]) => {
    const sorted = [...rows].sort((a, b) => b.days - a.days);
    const worst = sorted[0];
    const label = worst.contract.contractNo || 'ใบที่ยังไม่มีเลขที่';
    const customer = worst.contract.customerName ? ` · ${worst.contract.customerName}` : '';
    return {
      userIds: [userId],
      /* ผูกกับใบที่ค้างนานสุด — ลบใบนั้นแล้วแจ้งเตือนถูกกวาดตาม (purgeNotificationsMany)
         แพตเทิร์นเดียวกับการทวงลีดค้าง ซึ่งก็รวมหลายใบไว้ในเด้งเดียวเหมือนกัน */
      entityId: worst.contract.id,
      kind: CONTRACT_OVERDUE_KIND,
      dedupeKey: overdueSignatureDedupeKey(dayKey, userId),
      title: `สัญญารอลงนามค้าง ${sorted.length} ใบ · นานสุด ${worst.days} วัน`,
      body: `${label}${customer} ออกไปแล้ว ${worst.days} วันยังไม่ได้ฉบับเซ็นกลับ — ตามลูกค้าหรือบันทึกลงนามให้เรียบร้อย`,
    };
  });
}
