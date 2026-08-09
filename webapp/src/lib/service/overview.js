// ── ภาพรวมระบบธุรกิจบริการ (X-1) — logic ล้วน ─────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-01: **ไม่ทำปฏิทินรวมกับสายผลิต** — TS กับ PD เป็นคนละทีม
// ปฏิบัติงาน หน้าที่รวมสองระบบจะกลายเป็นหน้าที่ทุกคนต้องกรองของคนอื่นทิ้งก่อนอ่าน
//
// ⭐ หน้านี้ตอบสามคำถามของหัวหน้าทีมบริการตอนเช้า:
//    1. มีอะไรค้างจากเมื่อวานไหม   2. วันนี้ใครไปไหน   3. ไซต์ไหนกำลังจะมีปัญหา
//
// ⚠️ ข้อ 3 คือของที่ระบบเก่าไม่มี — ไซต์ที่น้ำหอมจะหมดแต่ยังไม่มีนัด คือลูกค้าที่
// กำลังจะโทรมาบ่น · ตัวเลขนี้ต้องอยู่หน้าแรก ไม่ใช่ซ่อนในแท็บของหน้าไซต์
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { accessConflict } from './sites';
import { dayLoad, overlaps, sortByTime } from './rounds';
import { businessDate } from '@/lib/businessDate';

const OPEN_STATUSES = ['scheduled'];
const isOpen = (visit) => OPEN_STATUSES.includes(visit?.status);

const shiftDays = (iso, days) => {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  d.setDate(d.getDate() + days);
  return toLocalISODate(d);
};

// ── ตัวเลขหัวหน้าจอ ──────────────────────────────────────────────────────
//
// ⚠️ นับเฉพาะนัดที่ยัง "เปิด" อยู่ — ที่ปิด/ยกเลิก/เลื่อนแล้วไม่ใช่งานค้าง ·
// ถ้านับรวม ตัวเลข "ค้าง" จะโตขึ้นตลอดกาลจนไม่มีความหมาย
export function serviceCounts(visits = [], todayIso = businessDate()) {
  const weekEnd = shiftDays(todayIso, 6);
  let overdue = 0;
  let today = 0;
  let week = 0;
  let unassigned = 0;

  for (const visit of visits) {
    if (!isOpen(visit)) continue;
    const date = String(visit.scheduledDate || '');
    if (date && date < todayIso) overdue += 1;
    else if (date === todayIso) today += 1;
    if (date >= todayIso && date <= weekEnd) {
      week += 1;
      // ไม่มีช่าง = ยังไม่มีใครรับผิดชอบ · นับเฉพาะในสัปดาห์นี้เพราะนัดไกล ๆ
      // ยังไม่ต้องมอบหมายก็ปกติ (ตารางช่างยังไม่นิ่ง)
      if (!visit.assigneeId) unassigned += 1;
    }
  }
  return { overdue, today, week, unassigned };
}

// ── สิ่งที่ต้องจัดการก่อน — เรียงตามความเจ็บ ไม่ใช่ตามวันที่ ──────────────
//
// ลำดับ: นัดค้าง → เวลาทับกัน → ชนช่วงเข้าไซต์ → ยังไม่มอบหมายช่าง
// ⚠️ **เตือน ไม่บล็อก** ทุกข้อ (กติกาเดียวกับทั้งโมดูล) — รายการนี้คือรายการที่
//    ให้คนไปตัดสินใจ ไม่ใช่รายการความผิด
export function serviceAttention(visits = [], sitesById = new Map(), todayIso = businessDate()) {
  const overlapIds = new Set();
  for (const pair of overlaps(visits)) {
    if (pair.a?.id) overlapIds.add(pair.a.id);
    if (pair.b?.id) overlapIds.add(pair.b.id);
  }
  const soonEnd = shiftDays(todayIso, 6);
  const rows = [];

  for (const visit of visits) {
    if (!isOpen(visit)) continue;
    const date = String(visit.scheduledDate || '');
    const reasons = [];

    if (date && date < todayIso) {
      const lateDays = Math.max(1, Math.round(
        (new Date(`${todayIso}T00:00:00`).getTime() - new Date(`${date}T00:00:00`).getTime()) / 86400000,
      ));
      reasons.push({ kind: 'overdue', message: `เลยวันนัดมา ${lateDays} วันแล้วยังไม่ปิดงาน` });
    }

    if (overlapIds.has(visit.id)) {
      reasons.push({ kind: 'overlap', message: 'เวลาทับกับนัดอื่นของช่างคนเดียวกัน' });
    }

    const site = sitesById.get(visit.siteId) || null;
    const conflict = accessConflict(site, {
      date: visit.scheduledDate,
      startTime: visit.startTime,
      endTime: visit.endTime,
    });
    if (conflict) reasons.push({ kind: conflict.kind, message: conflict.message });

    // ยังไม่มอบหมาย: ฟ้องเฉพาะนัดที่ถึงคิวภายในสัปดาห์นี้ (รวมที่ค้างมาแล้ว)
    if (!visit.assigneeId && date && date <= soonEnd) {
      reasons.push({ kind: 'unassigned', message: 'ยังไม่ได้มอบหมายช่าง' });
    }

    if (reasons.length) rows.push({ visit, site, reasons });
  }

  const weight = (row) => {
    if (row.reasons.some((r) => r.kind === 'overdue')) return 0;
    if (row.reasons.some((r) => r.kind === 'overlap')) return 1;
    if (row.reasons.some((r) => r.kind === 'unassigned')) return 3;
    return 2;
  };
  return rows.sort((a, b) => {
    const wa = weight(a);
    const wb = weight(b);
    if (wa !== wb) return wa - wb;
    const da = String(a.visit.scheduledDate || '');
    const db = String(b.visit.scheduledDate || '');
    if (da !== db) return da.localeCompare(db);
    return String(a.visit.code || '').localeCompare(String(b.visit.code || ''));
  });
}

// ── ไซต์ที่น้ำหอมกำลังจะหมดแต่ยังไม่มีนัดครอบ ────────────────────────────
//
// ใช้ `refill` ที่ /api/service/sites?withSchedule=1 คำนวณมาแล้ว — **ไม่คำนวณซ้ำ
// ที่ฝั่งจอ** เพราะสูตรเดียวกันสองที่จะเพี้ยนหากันวันที่แก้ข้างเดียว
// ⚠️ `covered` (มีนัดก่อนวันหมด) ไม่เข้ารายการนี้ — นั่นคือของที่จัดการแล้ว
export function refillWatchlist(sites = []) {
  return sites
    .filter((site) => site.isActive !== false && (site.refill?.needsAttention || 0) > 0)
    .sort((a, b) => {
      // เลยกำหนดมาก่อน แล้วค่อยเรียงตามวันที่คาดว่าหมด (ไม่รู้วันไปท้าย)
      const ao = a.refill?.overdue || 0;
      const bo = b.refill?.overdue || 0;
      if ((ao > 0) !== (bo > 0)) return bo - ao;
      const ad = a.refill?.earliestDue || '';
      const bd = b.refill?.earliestDue || '';
      if (!ad && !bd) return String(a.name || '').localeCompare(String(b.name || ''), 'th');
      if (!ad) return 1;
      if (!bd) return -1;
      return ad.localeCompare(bd);
    });
}

// รวมจำนวนเครื่องที่ต้องเข้าเติม — ตัวเลขเดียวบนการ์ดหัวหน้าจอ
export function refillTotals(sites = []) {
  let overdue = 0;
  let soon = 0;
  let unknown = 0;
  for (const site of sites) {
    if (site.isActive === false) continue;
    overdue += site.refill?.overdue || 0;
    soon += site.refill?.soon || 0;
    unknown += site.refill?.unknown || 0;
  }
  return { overdue, soon, unknown, sites: refillWatchlist(sites).length };
}

// ── วันนี้ใครไปไหน ───────────────────────────────────────────────────────
// ⚠️ นัดที่ยังไม่มอบหมายรวมเป็นแถว "ยังไม่มอบหมาย" แถวเดียว ไม่ใช่ซ่อนหาย —
//    ของที่ไม่มีเจ้าของคือของที่ต้องเห็นที่สุด
export function todayByTechnician(visits = [], todayIso = businessDate()) {
  const rows = visits.filter((v) => isOpen(v) && String(v.scheduledDate || '') === todayIso);
  return dayLoad(rows)
    .map((entry) => ({ ...entry, visits: sortByTime(entry.visits) }))
    .sort((a, b) => {
      // ยังไม่มอบหมายขึ้นบนสุดเสมอ
      if (!a.assigneeId !== !b.assigneeId) return a.assigneeId ? 1 : -1;
      return String(a.assigneeName || '').localeCompare(String(b.assigneeName || ''), 'th');
    });
}
