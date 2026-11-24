// ── ใบเสนอราคาเลยวันยืนราคา (งวด 4 วันกำหนด · มติเจ้าของ 24/11/2026 · docs/due-overdue-system.md §12) ─────────
//
// ⭐ ใบที่นับ = **สถานะ `sent`** (ป้าย "อนุมัติแล้ว" — ออกให้ลูกค้าได้แล้ว รอคำตอบ) และดีลยังไม่ปิด (Won/Lost)
//   ร่าง · ถูกปฏิเสธ · Won · ยกเลิก · ถูกแก้ไข (มีฉบับใหม่) · ปิด ไม่มีคำถามเรื่องยืนราคาแล้ว
// ⭐ ผู้รับ = **เจ้าของดีล** (มติ) · ใบไม่มีดีล (ใบค่าสรรพสามิต) ⇒ คนออกใบ · บัญชีที่ปิดแล้วไม่ได้
// ⭐ ครั้งเดียวต่อ (ใบ × วันยืนราคา) — แก้วันยืนราคาแล้วเลยอีก = ยิงใหม่ · ไม่ยิงย้อนใบที่เลยเกิน 7 วัน
// ⭐ หน้าใบเสนอราคาใช้ `quoteValidityState` ตัวเดียวกันวาดป้ายใต้ "ยืนราคาถึง" — จอกับกระดิ่งพูดเรื่องเดียวกัน
// ⚠️ ฟังก์ชันบริสุทธิ์ — cron daily-digest ดึงใบ + ดีล แล้วส่ง `todayIso` วันไทยเข้ามา
import { CLOSED_STAGES } from '@/lib/salesPlanning';
import { calendarDays, dueBellFresh, dueInfo } from '@/lib/dueState';
import { fmtDate, fmtMoney } from '@/lib/format';

export const QUOTE_VALIDITY_KIND = 'quotation_validity_expired';
export const quoteValidityDedupeKey = (quoteId, validUntil) => `quote_validity:${quoteId}:${validUntil}`;
/** สถานะที่ยังรอลูกค้าตอบ — ป้าย "อนุมัติแล้ว" (QUOTE_STATUS_LABELS) */
export const QUOTE_AWAITING_STATUS = 'sent';

const text = (value) => String(value ?? '').trim();

/**
 * ป้ายวันยืนราคาของใบ — `{ key, days, text, tone }` ของ `dueInfo` หรือ null เมื่อไม่ต้องบอกอะไร
 * (ใบไม่อยู่สถานะรอลูกค้า · ดีลปิดแล้ว · ไม่มีวันยืนราคา)
 */
export function quoteValidityState(quote, { todayIso, dealStage = null } = {}) {
  if (!quote || quote.status !== QUOTE_AWAITING_STATUS) return null;
  if (dealStage && CLOSED_STAGES.includes(dealStage)) return null;
  const validUntil = text(quote.validUntil).slice(0, 10);
  if (!validUntil || !todayIso) return null;
  return dueInfo(validUntil, todayIso);
}

/**
 * กระดิ่งใบที่เพิ่งเลยวันยืนราคา — หนึ่งแถวต่อใบ ถึงเจ้าของดีลคนเดียว
 * @param quotes    แถว `quotations` (cron กรอง status/วันมาแล้ว — ที่นี่ตัดสินซ้ำเอง)
 * @param dealsById Map dealId → `{ ownerId, stage }`
 * @param directory Map id → ผู้ใช้ (ตัดบัญชีที่ปิดแล้ว)
 */
export function quoteValidityNotices(quotes = [], { todayIso, dealsById = new Map(), directory = null } = {}) {
  const out = [];
  for (const quote of quotes || []) {
    if (!quote?.id) continue;
    const deal = quote.dealId ? dealsById.get?.(quote.dealId) || null : null;
    const state = quoteValidityState(quote, { todayIso, dealStage: deal?.stage || null });
    const validUntil = text(quote.validUntil).slice(0, 10);
    if (state?.key !== 'late' || !dueBellFresh(validUntil, todayIso)) continue;
    const owner = text(deal?.ownerId) || text(quote.createdBy);
    if (!owner || directory?.get?.(owner)?.disabled) continue;
    const number = text(quote.quoteNumber) || 'ใบเสนอราคา';
    out.push({
      userIds: [owner],
      entityType: 'quotation',
      entityId: quote.id,
      kind: QUOTE_VALIDITY_KIND,
      dedupeKey: quoteValidityDedupeKey(quote.id, validUntil),
      title: `ใบเสนอราคาเลยวันยืนราคา ${calendarDays(validUntil, todayIso)} วัน · ${number}`,
      body: [
        text(quote.customerName),
        Number(quote.totalAmount) > 0 ? `฿${fmtMoney(quote.totalAmount)}` : '',
        `ยืนราคาถึง ${fmtDate(validUntil)} · ลูกค้ายังไม่ตอบรับ`,
      ].filter(Boolean).join(' · '),
      href: `/sales-planning/quotations/${quote.id}`,
    });
  }
  return out;
}
