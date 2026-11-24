// ── กระดิ่งวันกำหนดของฝ่ายบริการ (งวด 4 · มติเจ้าของ 24/11/2026 · docs/due-overdue-system.md §12) ─────────────────
//
// ⭐ สองเรื่อง ยิงจาก cron daily-digest (จ–ศ 08:30) — ฟังก์ชันบริสุทธิ์ทั้งไฟล์ ผู้เรียกส่ง `todayIso` วันไทยเข้ามา
//   1. **นัดค้าง** (`service_visit_overdue`) — นัดที่ยังเปิด (`isOpenVisit`: scheduled · in_progress) แต่วันนัดผ่านไปแล้ว
//      ⇒ **ช่างหลักของนัด** (`assigneeId`) คนเดียว (มติ "ช่างหลัก") · ไม่มีช่าง/ช่างปิดบัญชี ⇒ Planner (คนที่มอบหมายได้)
//      · ช่างผู้ช่วย (`assistantIds`) ไม่ได้ · ร่างไม่นับ (ยังไม่ใช่งาน — ตัวเดียวกับคิว/ป้ายเมนู)
//      · ครั้งเดียวต่อ (นัด × วันนัด) — เลื่อนนัดแล้วค้างอีก = ยิงใหม่ · ไม่ยิงย้อนนัดที่ค้างเกิน 7 วัน
//   2. **น้ำหอมใกล้หมด / น่าจะหมดแล้ว** (`service_refill_soon` · `service_refill_overdue`) — รายไซต์ ⇒ **Planner**
//      (มติ "Planner" · การเตือนไม่สร้างนัดเติมให้ ต้องมีคนจัด) · ยิงสองครั้ง (มติ "สองครั้ง"):
//      · ใกล้หมด = ไซต์มีเครื่อง `soon` (≤ `REFILL_SOON_DAYS` วัน) และยังไม่มีเครื่องที่หมดแล้ว — กุญแจ (ไซต์ × วันหมดที่เร็วสุด)
//        ⚠️ ไม่มีหน้าต่างย้อนหลัง: ช่วงใกล้หมดคือของที่ยังมาไม่ถึง (เช้าแรกหลังขึ้น prod ไซต์ที่อยู่ในช่วงอยู่แล้วเด้งครั้งเดียว)
//      · น่าจะหมดแล้ว = เครื่องที่เลยวันหมดมา 1–7 วัน — กุญแจ (ไซต์ × วันหมดล่าสุดที่เพิ่งเลย) ⇒ เครื่องอีกตัวในไซต์เดียวกันหมดทีหลัง = ยิงใหม่
//      · "มีนัดรองรับแล้ว" (`covered`) ไม่ยิง — ตัวตัดสินเดียวกับจอ (`refillStatus` ของ lib/service/refill.js)
import { isOpenVisit } from '@/lib/service/visitStatus';
import { isAssetOnSite } from '@/lib/service/sites';
import { refillStatus } from '@/lib/service/refill';
import { calendarDays, dueBellFresh } from '@/lib/dueState';
import { fmtDate } from '@/lib/format';

export const VISIT_OVERDUE_KIND = 'service_visit_overdue';
export const REFILL_SOON_KIND = 'service_refill_soon';
export const REFILL_OVERDUE_KIND = 'service_refill_overdue';
export const PLANNER_ROLE = 'ts_planner';

export const visitOverdueDedupeKey = (visitId, date) => `visit_overdue:${visitId}:${date}`;
export const refillSoonDedupeKey = (siteId, due) => `refill_soon:${siteId}:${due}`;
export const refillOverdueDedupeKey = (siteId, due) => `refill_overdue:${siteId}:${due}`;

const text = (value) => String(value ?? '').trim();
const dayOf = (value) => text(value).slice(0, 10);

/** Planner ที่ยังเปิดบัญชี — คนที่จัดคิว/มอบหมายนัดได้ (วันนี้มีคนเดียว · permissions.js) */
export function plannerIds(directory) {
  if (!directory?.values) return [];
  return [...directory.values()]
    .filter((user) => user?.id && !user.disabled && user.role === PLANNER_ROLE)
    .map((user) => String(user.id));
}

/** ป้ายไซต์ในข้อความ — รหัส + ชื่อ */
export function siteText(site) {
  return [text(site?.code), text(site?.name)].filter(Boolean).join(' ') || 'ไซต์';
}

/**
 * กระดิ่งนัดค้าง — หนึ่งแถวต่อนัด
 * @param visits    แถว `service_visits` ที่ยังเปิดและวันนัดอยู่ในหน้าต่าง (cron กรองมาแล้ว — ที่นี่ตัดสินซ้ำเองอีกชั้น)
 * @param sitesById Map siteId → ไซต์ (ชื่อในข้อความ)
 * @param directory Map id → ผู้ใช้ (ช่างปิดบัญชี ⇒ ถอยไป Planner · Planner มาจากตัวนี้)
 * @returns `{ notices, unrouted }` · unrouted = นัดที่ต้องเตือนแต่ไม่มีใครรับ (ไม่มีช่าง + ไม่มี Planner)
 */
export function visitOverdueNotices(visits = [], { todayIso, sitesById = new Map(), directory = null } = {}) {
  const planners = plannerIds(directory);
  const notices = [];
  let unrouted = 0;
  for (const visit of visits || []) {
    if (!visit?.id || !isOpenVisit(visit)) continue;
    const date = dayOf(visit.scheduledDate);
    if (!date || !dueBellFresh(date, todayIso)) continue;
    const tech = text(visit.assigneeId);
    const techLive = tech && !directory?.get?.(tech)?.disabled;
    const userIds = techLive ? [tech] : planners;
    if (!userIds.length) { unrouted += 1; continue; }
    const days = calendarDays(date, todayIso);
    const code = text(visit.code) || 'นัด';
    notices.push({
      userIds,
      entityType: 'service_visit',
      entityId: visit.id,
      kind: VISIT_OVERDUE_KIND,
      dedupeKey: visitOverdueDedupeKey(visit.id, date),
      title: `นัดเลยกำหนด ${days} วัน · ${code}`,
      body: [
        siteText(sitesById.get?.(visit.siteId)),
        `นัด ${fmtDate(date)} ยังไม่ปิดงาน`,
        techLive ? 'ปิดงานหรือเลื่อนนัด' : 'ยังไม่มีช่างที่รับผิดชอบ — มอบหมายช่างหรือเลื่อนนัด',
      ].join(' · '),
      /* ช่างเปิดใบส่งงานของนัด (หน้าที่ role ts เปิดได้ · notificationTargets) · Planner เปิดโมดัลนัดบนหน้าจัดคิว (มอบหมายได้) */
      href: techLive ? `/service/visits/${visit.id}` : `/service/schedule?visit=${encodeURIComponent(visit.id)}`,
    });
  }
  return { notices, unrouted };
}

/**
 * สถานะน้ำหอมของไซต์สำหรับกระดิ่ง — `{ state: 'overdue'|'soon'|null, due, machines }`
 * ⚠️ ตัวตัดสินรายเครื่องคือ `refillStatus` ตัวเดียวกับจอ — ที่นี่แค่ยุบเป็นระดับไซต์
 */
export function siteRefillBell(assets = [], { lastSiteRefillDate = null, nextVisitDate = null, todayIso } = {}) {
  const rows = (assets || []).filter(isAssetOnSite)
    .map((asset) => refillStatus(asset, { lastSiteRefillDate, nextVisitDate, todayIso }));
  const overdue = rows.filter((r) => r.state === 'overdue' && r.dueDate);
  if (overdue.length) {
    /* ไซต์ที่มีเครื่องหมดแล้วไม่ได้กระดิ่ง "ใกล้หมด" — Planner จัดนัดเดียวเติมทุกเครื่องอยู่แล้ว
       กุญแจ = วันหมดล่าสุดที่เพิ่งเลย (1–7 วัน) · ไม่มีเครื่องที่เพิ่งเลย = ไม่ยิง (ไม่ยิงย้อน) */
    const fresh = overdue.map((r) => r.dueDate).filter((d) => dueBellFresh(d, todayIso)).sort();
    return fresh.length
      ? { state: 'overdue', due: fresh[fresh.length - 1], machines: overdue.length }
      : { state: null, due: null, machines: overdue.length };
  }
  const soon = rows.filter((r) => r.state === 'soon' && r.dueDate).map((r) => r.dueDate).sort();
  return soon.length ? { state: 'soon', due: soon[0], machines: soon.length } : { state: null, due: null, machines: 0 };
}

/**
 * กระดิ่งน้ำหอม — หนึ่งแถวต่อไซต์ ถึง Planner
 * @param sites          ไซต์ลูกค้าที่ยังใช้งาน
 * @param assetsBySite   Map siteId → เครื่อง (`assetsForSites`)
 * @param scheduleBySite Map siteId → `{ lastRefillDate, nextVisitDate }` (`siteScheduleContext`)
 * @returns `{ notices, unrouted }`
 */
export function refillNotices(sites = [], {
  todayIso, assetsBySite = new Map(), scheduleBySite = new Map(), directory = null,
} = {}) {
  const planners = plannerIds(directory);
  const notices = [];
  let unrouted = 0;
  for (const site of sites || []) {
    if (!site?.id || site.isActive === false) continue;
    const ctx = scheduleBySite.get?.(site.id) || {};
    const bell = siteRefillBell(assetsBySite.get?.(site.id) || [], {
      lastSiteRefillDate: ctx.lastRefillDate || null, nextVisitDate: ctx.nextVisitDate || null, todayIso,
    });
    if (!bell.state) continue;
    if (!planners.length) { unrouted += 1; continue; }
    const where = siteText(site);
    const overdue = bell.state === 'overdue';
    const left = calendarDays(todayIso, bell.due);
    notices.push({
      userIds: planners,
      entityType: 'service_site',
      entityId: site.id,
      kind: overdue ? REFILL_OVERDUE_KIND : REFILL_SOON_KIND,
      dedupeKey: overdue ? refillOverdueDedupeKey(site.id, bell.due) : refillSoonDedupeKey(site.id, bell.due),
      title: overdue
        ? `น้ำหอมน่าจะหมดแล้ว ${bell.machines} เครื่อง · ${where}`
        : `น้ำหอมใกล้หมด ${bell.machines} เครื่อง · ${where}`,
      body: [
        text(site.customerName),
        overdue
          ? `คาดว่าหมดตั้งแต่ ${fmtDate(bell.due)}`
          : `คาดว่าหมด ${fmtDate(bell.due)} (${left === 0 ? 'วันนี้' : `อีก ${left} วัน`})`,
        'ยังไม่มีนัดเข้าเติม — จัดนัดเติม (ค่าคาดการณ์จากขนาดขวดและอัตราใช้)',
      ].filter(Boolean).join(' · '),
      href: `/database/sites/${site.id}`,
    });
  }
  return { notices, unrouted };
}
