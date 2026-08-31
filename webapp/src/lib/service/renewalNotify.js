// ── กระดิ่งเตือน "รอบบริการใกล้หมด" (แผน §PR-E) ─────────────────────────────
//
// ⚠️ **ระบบนี้ไม่มี cron** — จึงกวาดตอนที่มีคนเปิดทะเบียนต่อสัญญา (แพตเทิร์นเดียวกับ
//   `contractQuotationSync` ที่ทำงานตอนเปิดทะเบียนสัญญา) · ไม่มีใครเปิดทั้งวัน =
//   ไม่มีใครได้แจ้งเตือน ซึ่งยอมรับได้ เพราะคนที่ต้องรู้คือคนที่เปิดทะเบียนอยู่แล้ว
//
// ⭐ **กันยิงซ้ำด้วยกุญแจ (siteId × วันหมด)** — `dedupeKey` ไปลงคอลัมน์ `updateId`
//   ซึ่งมี unique (userId, updateId) ⇒ เปิดหน้าวันละสิบรอบก็ได้แจ้งเตือนใบเดียว
//   และรอบถัดไปของไซต์เดิม (วันหมดใหม่) ยังยิงได้ เพราะกุญแจคนละตัว
//
// ⚠️ ผู้รับคือ **เจ้าของดีลที่ขายรอบนั้น** ไม่ใช่ "ทุกคนในทีมขาย" (กติกาผู้รับ mig 0185)
//   ไม่มีเจ้าของดีล = ไม่ยิง · การส่งหาทุกคนคือสิ่งที่ทำให้กระดิ่งกลายเป็นกองที่ไม่มีใครอ่าน
import { after } from 'next/server';
import { notifyUsers } from '@/lib/notifications';
import { fmtDate } from '@/lib/format';

export const RENEWAL_BELL_KIND = 'service_renewal_due';
export const RENEWAL_ENTITY_TYPE = 'service_renewal';

/** กุญแจกันยิงซ้ำ — หนึ่งไซต์ หนึ่งวันหมด หนึ่งครั้ง */
export const renewalDedupeKey = (siteId, endDate) => `renewal:${siteId}:${endDate}`;

/**
 * แถวไหนต้องยิงกระดิ่ง + ข้อความว่าอะไร — ฟังก์ชันบริสุทธิ์ เทสต์ได้
 *
 * ⚠️ **ไม่ยิงแถวที่มีคนรับเรื่องแล้ว** (`followup` เปิดอยู่) — คนนั้นกำลังตามอยู่แล้ว
 *   แจ้งซ้ำคือเสียงรบกวน · แถวที่ยังไม่มีใครแตะเท่านั้นที่เป็น "งานที่ยังไม่มีเจ้าของ"
 */
export function renewalNotices(rows = []) {
  const notices = [];
  for (const row of rows) {
    if (row?.followup) continue;
    const ownerId = row?.deal?.ownerId;
    if (!ownerId || !row.siteId || !row.endDate) continue;
    const site = row.site?.name || row.siteId;
    const customer = row.site?.customerName ? ` · ${row.site.customerName}` : '';
    notices.push({
      userIds: [String(ownerId)],
      entityType: RENEWAL_ENTITY_TYPE,
      entityId: row.siteId,
      kind: RENEWAL_BELL_KIND,
      dedupeKey: renewalDedupeKey(row.siteId, row.endDate),
      title: row.state === 'expired'
        ? `รอบบริการหมดแล้ว · ${site}`
        : `รอบบริการใกล้หมด · ${site}`,
      body: row.state === 'expired'
        ? `หมดเมื่อ ${fmtDate(row.endDate)}${customer} — ยังไม่มีใครเปิดเรื่องติดตาม`
        : `หมด ${fmtDate(row.endDate)} (อีก ${row.daysLeft} วัน)${customer} — ยังไม่มีใครเปิดเรื่องติดตาม`,
    });
  }
  return notices;
}

/**
 * ยิงจริง — fire-and-forget หลังจอได้ข้อมูลไปแล้ว
 *
 * ⚠️ ห้ามให้แจ้งเตือนที่ยิงพลาดทำให้ทะเบียนตอบ error — คนเปิดหน้ามาดูของ ไม่ได้มาส่งกระดิ่ง
 */
export function sweepRenewalNotices(supabase, rows = [], { actorName = null } = {}) {
  const notices = renewalNotices(rows);
  if (!notices.length) return 0;
  after(async () => {
    for (const notice of notices) {
      await notifyUsers(supabase, { ...notice, actorName, href: '/sa/renewals' });
    }
  });
  return notices.length;
}
