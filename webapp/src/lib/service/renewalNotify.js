// ── กระดิ่งเตือน "รอบบริการใกล้หมด / หมดแล้ว" (แผน §PR-E · งวด 3 วันกำหนด) ─────────────────────────────
//
// ⭐ **กวาดจาก cron `daily-digest` ทุกเช้า จ–ศ** (มติเจ้าของ 24/11/2026 "ย้ายเข้า cron ไม่ยิงย้อน")
//   🪦 เดิมกวาดตอนมีคนเปิดทะเบียนต่อสัญญา (GET ของ /api/sales-planning/renewals) ⇒ ไม่มีใครเปิดทั้งวัน = ไม่มีใครได้
//      แจ้งเตือน · และกวาดได้เฉพาะไซต์ที่คนเปิดมองเห็น (ขอบเขตของผู้เปิด) · GET ที่เขียนข้อมูล — ถอดแล้ว
//   ⭐ cron ใช้สิทธิ์ admin เห็นทุกไซต์ (`loadRenewalContext(supabase, null)` ใน renewalContext.js)
//
// ⭐ **กุญแจแยกตามสถานะ** — `renewal:{site}:{วันหมด}` (ใกล้หมด · ค่าเดิม — แถวที่ยิงไปแล้วไม่เด้งซ้ำ) กับ
//   `renewal_expired:{site}:{วันหมด}` (หมดแล้ว)
//   🐞 เดิมใช้กุญแจตัวเดียวทั้งสองสถานะ ⇒ ไซต์ที่เคยได้ "ใกล้หมด" ไปแล้ว **ไม่เคยได้ "หมดแล้ว"** (unique (userId, updateId))
//   รอบถัดไปของไซต์เดิม (วันหมดใหม่) ยังยิงได้ เพราะกุญแจคนละตัว
// ⭐ **"หมดแล้ว" ไม่ยิงย้อน** — เฉพาะรอบที่เพิ่งหมดไม่เกิน `DUE_BELL_LOOKBACK_DAYS` วัน (มติเดียวกัน) · ไซต์ที่หมดมานาน
//   ดูจากทะเบียน (แถวแดงบนสุด) · ไม่งั้นเช้าแรกหลังแก้ ทุกไซต์ที่หมดไปแล้วเด้งพร้อมกันเป็นกอง
//
// ⚠️ ผู้รับคือ **เจ้าของดีลที่ขายรอบนั้น** ไม่ใช่ "ทุกคนในทีมขาย" (กติกาผู้รับ mig 0185)
//   ไม่มีเจ้าของดีล = ไม่ยิง · การส่งหาทุกคนคือสิ่งที่ทำให้กระดิ่งกลายเป็นกองที่ไม่มีใครอ่าน
import { notifyUsers } from '@/lib/notifications';
import { fmtDate } from '@/lib/format';
import { DUE_BELL_LOOKBACK_DAYS } from '@/lib/dueState';

export const RENEWAL_BELL_KIND = 'service_renewal_due';
export const RENEWAL_ENTITY_TYPE = 'service_renewal';

/** กุญแจกันยิงซ้ำ "ใกล้หมด" — หนึ่งไซต์ หนึ่งวันหมด หนึ่งครั้ง (ค่าเดิม · ห้ามเปลี่ยนรูป — แถวที่ยิงไปแล้วจะเด้งซ้ำ) */
export const renewalDedupeKey = (siteId, endDate) => `renewal:${siteId}:${endDate}`;
/** กุญแจกันยิงซ้ำ "หมดแล้ว" — คนละตัวกับใกล้หมด (ไม่งั้นไซต์ที่ได้ "ใกล้หมด" ไปแล้วไม่เคยได้ "หมดแล้ว") */
export const renewalExpiredDedupeKey = (siteId, endDate) => `renewal_expired:${siteId}:${endDate}`;

/**
 * แถวไหนต้องยิงกระดิ่ง + ข้อความว่าอะไร — ฟังก์ชันบริสุทธิ์ เทสต์ได้
 *
 * ⚠️ **ไม่ยิงแถวที่มีคนรับเรื่องแล้ว** (`followup` เปิดอยู่) — คนนั้นกำลังตามอยู่แล้ว
 *   แจ้งซ้ำคือเสียงรบกวน · แถวที่ยังไม่มีใครแตะเท่านั้นที่เป็น "งานที่ยังไม่มีเจ้าของ"
 */
export function renewalNotices(rows = [], { lookbackDays = DUE_BELL_LOOKBACK_DAYS, directory = null } = {}) {
  const notices = [];
  for (const row of rows) {
    if (row?.followup) continue;
    const ownerId = row?.deal?.ownerId;
    if (!ownerId || !row.siteId || !row.endDate) continue;
    // เจ้าของดีลที่ปิดบัญชีแล้วไม่ได้กระดิ่ง (ไม่รู้จัก ≠ ปิดบัญชี — อ่านทะเบียนผู้ใช้พังต้องไม่ทำให้เงียบ)
    if (directory?.get?.(String(ownerId))?.disabled) continue;
    const expired = row.state === 'expired';
    // หมดแล้ว: เฉพาะรอบที่เพิ่งหมด 1..lookbackDays วัน (`daysLeft` ติดลบ) — ไม่ยิงย้อนไซต์ที่หมดมานาน
    if (expired && !(Number(row.daysLeft) < 0 && -Number(row.daysLeft) <= lookbackDays)) continue;
    const site = row.site?.name || row.siteId;
    const customer = row.site?.customerName ? ` · ${row.site.customerName}` : '';
    notices.push({
      userIds: [String(ownerId)],
      entityType: RENEWAL_ENTITY_TYPE,
      entityId: row.siteId,
      kind: RENEWAL_BELL_KIND,
      dedupeKey: expired ? renewalExpiredDedupeKey(row.siteId, row.endDate) : renewalDedupeKey(row.siteId, row.endDate),
      title: expired
        ? `รอบบริการหมดแล้ว · ${site}`
        : `รอบบริการใกล้หมด · ${site}`,
      body: expired
        ? `หมดเมื่อ ${fmtDate(row.endDate)}${customer} — ยังไม่มีใครเปิดเรื่องติดตาม`
        : `หมด ${fmtDate(row.endDate)} (อีก ${row.daysLeft} วัน)${customer} — ยังไม่มีใครเปิดเรื่องติดตาม`,
    });
  }
  return notices;
}

/**
 * ยิงจริง — cron daily-digest เรียกหลังโหลดแถวของทุกไซต์ (สิทธิ์ admin) · คืน `{ sent, notices, error? }`
 * ⚠️ `notifyUsers` กลืน error เอง — ส่งขึ้นเป็น error ของรอบนี้ (ไม่งั้นพังเงียบแบบที่ดูเหมือน "ไม่มีไซต์ใกล้หมด")
 */
export async function sendRenewalNotices(supabase, rows = [], { actorName = 'สรุปประจำวัน', directory = null } = {}) {
  const notices = renewalNotices(rows, { directory });
  let sent = 0;
  let error = null;
  for (const notice of notices) {
    const out = await notifyUsers(supabase, { ...notice, actorName, href: '/sa/contracts?tab=renewals' });
    sent += out.sent || 0;
    if (out.error && !error) error = out.error;
  }
  return error ? { sent, notices: notices.length, error } : { sent, notices: notices.length };
}
