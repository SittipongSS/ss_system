// ── รายการงานของหน้าจัดตาราง (/service/schedule) — ตัวตัดสินล้วน ไม่มี React ──────
//
// ⭐ มติผู้ใช้ 2026-09-22: รายการงานวางคู่กับตารางสัปดาห์ และ **ไม่ผูกกับสัปดาห์ที่เปิด**
//    (docs/service-field-operations.md ข้อ F-6 สัญญา "คิวรอจัดถาวร" ไว้) · ตัวกรองทีมคุมทั้งหน้า
//    สัปดาห์คุมแค่ปฏิทิน · งานที่ยังไม่มีเจ้าหน้าที่ขึ้นให้ทุกทีมเห็น
//
// ⚠️ **ตัวตัดสินเดียวของถัง/กลุ่ม/ช่วง** — จอ (scheduleQueueView) ประกอบแถวจากที่นี่ ห้ามคิดเงื่อนไขเอง
//    · สถานะอ่านจาก visitStatus.js เท่านั้น (ห้ามเทียบสตริงสถานะที่นี่)
//    · ด่านอ่านจาก visitGate.js ตัวเดียวกับ server
// ⚠️ **ไม่เรียก `businessDate()` เอง** — ทุกฟังก์ชันรับ "วันนี้" ผ่าน `win` (จาก `queueWindow`)
//    ⇒ เทสต์ตรึงวันได้ และจอกับ API ใช้วันอ้างอิงเดียวกันได้ (`asOf` ของ response)
import { ALL_TEAMS, NO_TEAM } from './crewTeams';
import { overdueDays } from './myVisits';
import { gateNeedsOthers, gatePassed } from './visitGate';
import { isClosedVisit, isDraftVisit, isLiveVisit, isOpenVisit } from './visitStatus';

// ── ถังของรายการงาน ────────────────────────────────────────────────────────
export const QUEUE_BUCKETS = Object.freeze(['waiting', 'overdue', 'scheduled', 'closed']);
export const QUEUE_BUCKET_LABELS = Object.freeze({ waiting: 'รอจัด', overdue: 'ค้าง', scheduled: 'จัดแล้ว', closed: 'ปิดแล้ว' });
/* หน่วยของตัวเลขบนถัง — ร่างยังไม่ใช่นัด (ยังไม่ถึงมือใคร) จึงนับเป็น "ใบ" */
export const QUEUE_BUCKET_UNITS = Object.freeze({ waiting: 'ใบ', overdue: 'นัด', scheduled: 'นัด', closed: 'นัด' });

/* ร่างที่ติดด่านและวันเสนอไกลกว่านี้ พับเข้ากลุ่ม "far" (ซ่อนหลังปุ่ม)
   ⭐ รอบบริการสร้างร่างล่วงหน้า 90 วัน ⇒ ไม่พับ = เม็ดตัวเลขของ "รอจัด" ไม่มีวันลงถึง 0
      แล้วคนก็เลิกอ่าน (กติกาเดียวกับป้ายที่นับแผนล่วงหน้า — myVisits.waitingOnMeVisitCount)
   ⚠️ ร่างที่ **ผ่านด่านแล้ว** ไม่พับไม่ว่าวันไหน — กดปล่อยได้ทันที ไม่ใช่ของที่ "ยังไม่ต้องรีบ" */
export const QUEUE_SOON_DAYS = 14;

/* นัดที่ปิดแล้วโผล่ในแท็บ "ปิดแล้ว" ย้อนหลังกี่วัน — server ตัดช่วงโหลดด้วยเลขเดียวกัน
   ⇒ จอกับ API ต้องอ่านค่าจากที่นี่ที่เดียว ไม่งั้นแท็บจะว่างทั้งที่มีนัดปิดอยู่จริง */
export const QUEUE_CLOSED_DAYS = 14;

// ── ช่วงของถัง "จัดแล้ว" ──────────────────────────────────────────────────
export const QUEUE_RANGES = Object.freeze(['all', '7d', 'unassigned']);
export const QUEUE_RANGE_LABELS = Object.freeze({ all: 'ทั้งหมด', '7d': '7 วัน', unassigned: 'ยังไม่มีเจ้าหน้าที่' });

// ── กลุ่มย่อยของถัง "รอจัด" — ลำดับนี้คือลำดับบนจอ ─────────────────────────
export const WAITING_GROUPS = Object.freeze(['ready', 'ts', 'others', 'far']);
export const WAITING_GROUP_LABELS = Object.freeze({
  ready: 'พร้อมปล่อย',
  ts: 'ติดด่าน · ฝ่าย TS แก้ได้เอง',
  others: 'ติดด่าน · รอฝ่ายอื่น',
  far: `ร่างล่วงหน้าเกิน ${QUEUE_SOON_DAYS} วัน`,
});

/** 'YYYY-MM-DD' ± วัน — เลขคณิตปฏิทินที่เที่ยงคืน UTC ล้วน ไม่มีโซนเวลาเข้ามาเกี่ยว
 *  ค่าที่ไม่ใช่วันที่ (หรือจำนวนวันที่ไม่ใช่ตัวเลข) = null
 *  ⚠️ ประกอบสตริงจากส่วน UTC เอง ไม่ใช้ `.toISOString().slice(0, 10)` — เหตุผลเดียวกับ
 *     `addDays` ใน lib/sales/paymentCoverage.js (รูปนั้นคือรูปที่ด่าน check:thaitime ไล่จับ) */
export function addDaysIso(iso, days) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!match) return null;
  const shift = Number(days || 0);
  if (!Number.isFinite(shift)) return null;
  const base = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  base.setUTCDate(base.getUTCDate() + shift);
  const year = base.getUTCFullYear();
  const month = String(base.getUTCMonth() + 1).padStart(2, '0');
  const day = String(base.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** หน้าต่างวันของรายการงาน — คำนวณครั้งเดียวต่อการเรนเดอร์ แล้วส่งให้ทุกตัวตัดสิน
 *  · weekUntil   = วันนี้ + 6  (ขอบ "7 วัน" · ตรงกับ serviceCounts.week ของหน้าภาพรวม)
 *  · soonUntil   = วันนี้ + 13 (ร่างติดด่านที่ไกลกว่านี้พับเป็น "far")
 *  · closedSince = วันนี้ − 14 (ขอบล่างของแท็บ "ปิดแล้ว" · ตัวเดียวกับที่ API ใช้โหลด)
 *  🔴 **วันที่ไม่ถูกต้อง = โยน error** — ขอบทุกตัวกลายเป็น null แล้วการเทียบสตริงตอบ false หมด
 *     ⇒ นัดค้าง/นัดที่จัดแล้วหายจากทุกถังเงียบ ๆ ซึ่งอ่านเป็น "คิวว่าง" · พังดัง ๆ ดีกว่า */
export function queueWindow(todayIso) {
  const weekUntil = addDaysIso(todayIso, 6);
  if (!weekUntil) throw new TypeError(`queueWindow: todayIso ต้องเป็น 'YYYY-MM-DD' (ได้ ${JSON.stringify(todayIso)})`);
  return {
    todayIso,
    weekUntil,
    soonUntil: addDaysIso(todayIso, QUEUE_SOON_DAYS - 1),
    closedSince: addDaysIso(todayIso, -QUEUE_CLOSED_DAYS),
  };
}

/* รับได้ทั้งหน้าต่างเต็มจาก `queueWindow` · สตริงวันนี้ · หรือ `{ todayIso, closedSince }` บางส่วน
   (เช่น `asOf`/`closedSince` ที่ API ส่งกลับมา) — ช่องที่ขาดเติมจาก todayIso */
function asWindow(win) {
  if (win && typeof win === 'object' && win.todayIso && win.weekUntil && win.soonUntil && win.closedSince) return win;
  if (typeof win === 'string') return queueWindow(win);
  const base = queueWindow(win?.todayIso);
  const given = Object.fromEntries(Object.entries(win || {}).filter(([, value]) => value != null));
  return { ...base, ...given };
}

/* วันนัดเป็นสตริงวันที่ล้วน · ⚠️ `scheduledDate` เป็น NOT NULL (mig 0188) — ว่างคือข้อมูลเสีย */
const dateOf = (visit) => String(visit?.scheduledDate || '');

const pick = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]);

/** นัดใบนี้อยู่ถังไหน — 'waiting' | 'overdue' | 'scheduled' | 'closed' | null
 *  · waiting   = ร่าง **ทุกวัน** (รวมร่างที่วันเสนอผ่านไปแล้ว — ดู `isStaleDraft`)
 *  · overdue   = ยังรอลงมือ (`isOpenVisit`) และวันนัดเลยวันนี้ไปแล้ว · ไม่มีขอบล่าง
 *  · scheduled = ยังรอลงมือ และวันนัดตั้งแต่วันนี้ไป
 *  · closed    = ปิดแล้ว (`isClosedVisit`) ภายใน QUEUE_CLOSED_DAYS วัน นับจากวันเข้าจริง
 *  · null      = ยกเลิก · เลื่อนแล้ว · ปิดเก่ากว่าขอบ — ไม่อยู่ในรายการงาน (โผล่เป็นชิปจาง ๆ บนปฏิทินพอ)
 *  🔴 **ร่างไม่มีทางเป็น overdue/scheduled** — ร่างไม่ใช่งานของใคร (มติ 2026-08-28)
 *     ⇒ ถ้าวันหนึ่ง `isOpenVisit` รวมร่างเข้าไป ร่างจะไปนับเป็นนัดค้างของหน้าภาพรวมด้วย เทสต์ล็อกไว้
 *  ⚠️ ค้าง = `date < วันนี้` ตรงกับ `serviceCounts().overdue` ของหน้าภาพรวม (เทสต์เทียบตัวเลขกัน) */
export function queueBucketOf(visit, win) {
  const w = asWindow(win);
  if (isDraftVisit(visit)) return 'waiting';
  const date = dateOf(visit);
  if (isOpenVisit(visit)) {
    if (!date) return null;  // ตรงกับ serviceCounts ที่ไม่นับแถวไร้วัน
    return date < w.todayIso ? 'overdue' : 'scheduled';
  }
  if (isClosedVisit(visit)) {
    /* วันเข้าจริงก่อน — ใบที่ปิดวันนี้ของนัดเมื่อเดือนก่อนคือของที่เพิ่งเกิด ไม่ใช่ของเก่า
       (API โหลดถังนี้ด้วย actualDate >= closedSince เหมือนกัน) */
    const closedOn = String(visit?.actualDate || visit?.scheduledDate || '');
    return closedOn && closedOn >= w.closedSince ? 'closed' : null;
  }
  return null;
}

/** ร่างที่วันเสนอผ่านไปแล้ว — ยังอยู่ถัง "รอจัด" (ไม่ใช่ "ค้าง") แต่ต้องขึ้นบนสุดพร้อมป้ายเตือน
 *  ⚠️ ห้ามปล่อยด่วนจากแถว — ต้องเปิดโมดัลให้แก้วันก่อน ไม่งั้นได้นัดที่เกิดมาก็ค้างเลย */
export function isStaleDraft(visit, win) {
  if (!isDraftVisit(visit)) return false;
  const date = dateOf(visit);
  return !!date && date < asWindow(win).todayIso;
}

/** กลุ่มย่อยของร่างในถัง "รอจัด" — 'ready' | 'ts' | 'others' | 'far' (นัดที่ไม่ใช่ร่าง = null)
 *  @param gate รายการข้อจาก `evaluateVisitGate` ของนัดนั้น (ตัวเดียวกับที่ server ใช้ปฏิเสธ)
 *  · ready  = ผ่านด่านครบ — **วันไหนก็ได้** (ไม่พับเป็น far)
 *  · far    = ติดด่าน และวันเสนอเลย soonUntil
 *  · ts     = ติดด่านเฉพาะข้อที่ TS แก้เอง (มอบหมายคน · วัน/เวลาเข้าไซต์)
 *  · others = มีข้อที่ต้องรอฝ่ายอื่น (สัญญา · เงิน)
 *  🔴 **ไม่มีผลด่าน = ไม่พร้อม** — `gatePassed([])` ตอบ true (ไม่มีข้อติด) ⇒ ส่ง gate ว่าง/ลืมส่ง
 *     จะกลายเป็น "พร้อมปล่อย" ทั้งที่ไม่ได้ตรวจอะไรเลย (กติกา gateContext: ไม่มีบริบท = ติด)
 *     ⇒ ไม่มีผลด่านตกกลุ่ม others (ไม่รู้ว่าติดอะไร = TS ก็ไม่รู้จะแก้อะไร) */
export function waitingGroupOf(gate, visit, win) {
  if (!isDraftVisit(visit)) return null;
  const items = Array.isArray(gate) && gate.length ? gate : null;
  if (items && gatePassed(items)) return 'ready';
  const date = dateOf(visit);
  if (date && date > asWindow(win).soonUntil) return 'far';
  if (items && !gateNeedsOthers(items)) return 'ts';
  return 'others';
}

/** อยู่ในช่วงที่เลือกของถัง "จัดแล้ว" ไหม — ใช้กับนัดที่อยู่ถังนั้นแล้ว (วันนัด ≥ วันนี้)
 *  · all        = ทุกใบ
 *  · 7d         = วันนัด ≤ วันนี้ + 6       (= serviceCounts().week)
 *  · unassigned = ไม่มีเจ้าหน้าที่ และ ≤ วันนี้ + 6 (= serviceCounts().unassigned)
 *  ⚠️ ขอบ 7 วันของ "ยังไม่มีเจ้าหน้าที่" จงใจ — นัดไกล ๆ ยังไม่มอบหมายก็ปกติ (ตารางคนยังไม่นิ่ง)
 *  ช่วงที่ไม่รู้จัก = ทั้งหมด (ค่าจาก URL ที่พิมพ์ผิดต้องไม่ทำให้รายการว่าง) */
export function inQueueRange(visit, range, win) {
  if (range !== '7d' && range !== 'unassigned') return true;
  const date = dateOf(visit);
  const inWeek = !!date && date <= asWindow(win).weekUntil;
  if (range === '7d') return inWeek;
  return inWeek && !visit?.assigneeId;
}

/** นัดใบนี้โผล่เมื่อมองจากทีมที่เลือกไหม
 *  ⭐ **งานที่ยังไม่มีเจ้าหน้าที่ขึ้นทุกทีม** (มติ 2026-09-22) — หัวหน้าทีมคือคนที่หยิบงานไปให้ลูกทีม
 *     ซ่อนมันเมื่อเลือกทีม = ซ่อนเหตุติดด่านที่พบบ่อยที่สุด · กริดใช้กติกาเดียวกัน (`teamViewRows`)
 *  ⚠️ ดูทีมของ **ผู้รับผิดชอบหลัก** เท่านั้น — ผู้ช่วยจากทีมอื่นไม่ดึงนัดข้ามไปโผล่อีกทีม */
export function teamViewVisit(visit, team, crewByUser) {
  if (!team || team === ALL_TEAMS) return true;
  if (!visit?.assigneeId) return true;
  return (pick(crewByUser, visit.assigneeId) || NO_TEAM) === team;
}

/* นัดที่ "กินเวลาของคน" ในวันนั้น — ร่าง/ยกเลิก/เลื่อนไม่นับ (`isLiveVisit`)
   ⚠️ นัดซ้ำ id เดียวกันนับครั้งเดียว — ผู้เรียกที่เผลอต่อรายการสองแหล่ง (สัปดาห์ + รายการงาน)
      ต้องไม่ทำให้ภาระเบิ้ล แล้วป้าย "เกินเพดาน" ขึ้นทั้งที่คนนั้นยังรับงานได้ */
function liveVisitsOn(visits, date) {
  const seen = new Set();
  const out = [];
  for (const visit of visits || []) {
    if (!isLiveVisit(visit) || dateOf(visit) !== date) continue;
    if (visit.id != null) {
      if (seen.has(visit.id)) continue;
      seen.add(visit.id);
    }
    out.push(visit);
  }
  return out;
}

const assistantsOf = (visit) => {
  const ids = new Set((Array.isArray(visit?.assistantIds) ? visit.assistantIds : []).filter(Boolean));
  // ผู้รับผิดชอบหลักที่ถูกใส่ซ้ำในผู้ช่วย ไม่ใช่ "ไปช่วยอีกนัด"
  if (visit?.assigneeId) ids.delete(visit.assigneeId);
  return ids;
};

const count = (value) => {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

/** ภาระรายคนของวันหนึ่ง — Map<personId, { visits, assets, packs, assisting }>
 *  · ผู้รับผิดชอบหลัก: visits +1 และ จุด/แพ็คของไซต์จาก `workload[siteId]` ({ assets, packs })
 *  · ผู้ช่วยแต่ละคน: assisting +1 (ไม่บวกจุด/แพ็ค — ภาระของไซต์เป็นของคนรับผิดชอบหลัก
 *    กติกาเดียวกับ `dayWorkload` ของกริด ไม่งั้นตัวเลขของรายการงานกับของกริดพูดคนละเลข)
 *  ⚠️ นับเฉพาะ `isLiveVisit` — ร่างไม่นับภาระ (มติ 2026-08-28) · งานที่ปิดแล้ววันนั้นยังนับ
 *     (เวลาของวันนั้นใช้ไปแล้วจริง — นิยามเดียวกับ isLiveVisit)
 *  ⚠️ นัดที่ยังไม่มอบหมายไม่อยู่ใน Map (ไม่มีเจ้าของภาระ) */
export function staffLoadOn(visits, date, workload = {}) {
  const map = new Map();
  const rowOf = (id) => {
    let row = map.get(id);
    if (!row) {
      row = { visits: 0, assets: 0, packs: 0, assisting: 0 };
      map.set(id, row);
    }
    return row;
  };
  for (const visit of liveVisitsOn(visits, date)) {
    if (visit.assigneeId) {
      const row = rowOf(visit.assigneeId);
      const load = pick(workload, visit.siteId) || {};
      row.visits += 1;
      row.assets += count(load.assets);
      row.packs += count(load.packs);
    }
    for (const id of assistantsOf(visit)) rowOf(id).assisting += 1;
  }
  return map;
}

/** ใครว่างในวันนั้น — "วันนั้นว่าง 7 จาก 8 คน" บนแถวร่างที่ยังไม่มีเจ้าหน้าที่
 *  @param people รายชื่อที่อยู่ในมุมมองตอนนี้ [{ id, name }] (กรองทีมมาแล้ว)
 *  ⚠️ **ไปช่วยก็คือไม่ว่าง** — คนที่เป็นผู้ช่วยของนัดอื่นวันนั้นไม่ได้ว่างรับงานหลัก
 *  คืน { free: คนที่ว่าง (ลำดับเดิม), total: จำนวนคนในรายชื่อ } · รายชื่อซ้ำ id นับครั้งเดียว */
export function freeCrewOn(visits, date, people) {
  const busy = new Set();
  for (const visit of liveVisitsOn(visits, date)) {
    if (visit.assigneeId) busy.add(visit.assigneeId);
    for (const id of assistantsOf(visit)) busy.add(id);
  }
  const seen = new Set();
  const list = [];
  for (const person of people || []) {
    if (!person?.id || seen.has(person.id)) continue;
    seen.add(person.id);
    list.push(person);
  }
  return { free: list.filter((person) => !busy.has(person.id)), total: list.length };
}

/** สตริงค้นหาของแถว — **ตาเห็นบนแถว = ต้องค้นเจอ** (กติกา search haystack ของทั้งระบบ)
 *  รับอาร์เรย์ของข้อความ (ซ้อนอาร์เรย์ได้ · null/undefined/'' ข้ามไป) → ตัวพิมพ์เล็ก คั่นด้วยช่องว่าง
 *  ⇒ ผู้เรียกใช้ `haystack.includes(needle.toLowerCase())` */
export function queueHaystack(parts) {
  return (Array.isArray(parts) ? parts : [parts])
    .flat(Infinity)
    .filter((part) => part != null && part !== false && part !== '')
    .map((part) => String(part).trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** ค้างมากี่วัน (ตัวเลข) · ยังไม่เลยวัน = null — ตัวเดียวกับหน้า "นัดของฉัน" (`myVisits.overdueDays`)
 *  แค่รับวันนี้จาก `win` แทนการอ่านนาฬิกาเอง */
export function overdueDaysOf(visit, win) {
  return overdueDays(visit, asWindow(win).todayIso);
}
