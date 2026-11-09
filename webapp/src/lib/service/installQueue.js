// ── ขั้นของคำขอติดตั้ง (mig 0425) — ตัวตัดสินล้วน ไม่มี React ไม่มี DB ─────────────────────────
//
// ⭐ มติเจ้าของ 02/11 + 09/11/2026 (แผนเต็ม ~/ss-team/mockups/service-install/PLAN.md):
//    SA เลือกรายไซต์ "ติดตั้ง / Service" › ขอคิวติดตั้ง › (มัดจำก่อนติดตั้งผ่าน) › TS ยืนยันวัน (ปรับได้ + เหตุ)
//    › SA คอนเฟิร์มลูกค้า **ทุกครั้ง** › นัดขึ้นงานช่าง › ติดตั้ง › (สัญญาทำหลังทุกไซต์ติดตั้งเสร็จ)
//
// ⭐ **ขั้นคำนวณสดเสมอ ไม่มีคอลัมน์สถานะ** (SO-centric ข้อ 7) — ฐานเก็บแค่ร่องรอยการตัดสินใจของคน:
//    คำขอ (`service_install_requests`) · โซนที่ขอ · นัด (`tsConfirmedAt` · `customerConfirmedAt`)
//    · โซนของนัด · เครื่องที่วาง · ผลรายเครื่อง (`service_visit_assets.outcome`)
// ⚠️ **ตัวตัดสินเดียว** ของ "คำขอนี้อยู่ขั้นไหน" — การ์ดบนหน้าใบสั่งขาย (SA) · แท็บรอติดตั้ง (TS) ·
//    การ์ดในหน้าจัดคิว · ป้ายแท็บสัญญา ถามที่นี่ที่เดียว ห้ามเขียนเงื่อนไขซ้ำรายจอ
// ⚠️ ด่านมัดจำถาม `installDepositGate` ตัวเดียวกับด่านนัด (visitGate) — ปุ่มยืนยันวันกับด่านตอนเลื่อนร่าง
//    ขึ้นตารางพูดเรื่องเดียวกันเสมอ
import { GATE_OWNERS, installReaskedAfterConfirm } from './visitGate';
import { isClosedVisit, isDraftVisit, isOpenVisit } from './visitStatus';

/* ลำดับขั้น — ลำดับนี้คือ "เดินหน้าไปแค่ไหน" (ใช้หาขั้นที่ช้าที่สุดของไซต์) และลำดับกลุ่มบนจอ
   `service` (เลือก Service · เครื่องอยู่แล้ว) อยู่นอกเส้นติดตั้ง — ไม่เข้าคิว ไม่นับในความคืบหน้า */
export const INSTALL_STAGES = Object.freeze([
  'undecided', 'not_requested', 'awaiting_deposit', 'awaiting_ts', 'awaiting_customer', 'confirmed', 'installed',
]);
export const INSTALL_STAGE_SERVICE = 'service';

export const INSTALL_STAGE_LABELS = Object.freeze({
  undecided: 'รอฝ่ายขายเลือก ติดตั้ง/Service',
  not_requested: 'ยังไม่ขอคิว',
  awaiting_deposit: 'รอมัดจำ',
  awaiting_ts: 'รอ TS ยืนยันวัน',
  awaiting_customer: 'รอ SA คอนเฟิร์มลูกค้า',
  confirmed: 'นัดยืนยันแล้ว',
  installed: 'ติดตั้งแล้ว',
  service: 'Service · ไม่ต้องติดตั้ง',
});

/* เจ้าของเรื่องของแต่ละขั้น — ใครต้องขยับ (ค่าเดียวกับ GATE_OWNERS ของด่าน · ไม่สะกดเอง)
   `confirmed` = ช่างไปติดตั้ง (งานของ TS) · ติดตั้งแล้ว/Service = ไม่มีใครต้องทำต่อในเส้นนี้ */
export const INSTALL_STAGE_OWNERS = Object.freeze({
  undecided: GATE_OWNERS.SA,
  not_requested: GATE_OWNERS.SA,
  awaiting_deposit: GATE_OWNERS.FN,
  awaiting_ts: GATE_OWNERS.TS,
  awaiting_customer: GATE_OWNERS.SA,
  confirmed: GATE_OWNERS.TS,
  installed: null,
  service: null,
});

const STAGE_RANK = Object.freeze(Object.fromEntries(INSTALL_STAGES.map((s, i) => [s, i])));

/* นัดติดตั้งของคำขอนี้ที่ "ยังมีชีวิต" — ร่าง/นัดไว้/กำลังทำ · ปิด/ยกเลิก/เลื่อนแล้ว ไม่นับ */
const isPendingInstallVisit = (visit) => isDraftVisit(visit) || isOpenVisit(visit);

/**
 * ขั้นของ **หนึ่งโซน** ในคำขอติดตั้ง
 * @param request   แถว `service_install_requests` (null = ฝ่ายขายยังไม่เลือก)
 * @param zoneId    โซนที่ถาม
 * @param visits    นัดติดตั้งของคำขอนี้ (`installRequestId` = request.id) — ทุกสถานะ
 * @param visitZonesByVisitId  visitId → zoneId[] (`service_visit_zones`)
 * @param doneZonesByVisitId   visitId → zoneId[] ที่มีเครื่องผล `done` อย่างน้อยหนึ่งเครื่อง
 *                             (ผู้เรียกประกอบจาก planned assets × visit assets)
 * @param deposit   ผลของ `installDepositGate` ของใบนี้
 */
export function installZoneStage({
  request = null,
  zoneId,
  visits = [],
  visitZonesByVisitId = {},
  doneZonesByVisitId = {},
  deposit = null,
} = {}) {
  if (!request) return 'undecided';
  if (request.mode === 'none') return INSTALL_STAGE_SERVICE;
  const at = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]) || [];
  const covers = (visit) => at(visitZonesByVisitId, visit.id).map(String).includes(String(zoneId));
  const mine = (visits || []).filter((v) => v && v.installRequestId === request.id && covers(v));

  /* ติดตั้งแล้ว = นัดที่ปิดแล้วมีเครื่องในโซนนี้ผล "ติดตั้งแล้ว" อย่างน้อยหนึ่งเครื่อง
     ⚠️ โซนที่ปิดงานแล้วติดไม่ได้ทั้งโซน = ไม่นับ ⇒ ตกลงไปถามต่อข้างล่าง (กลับไปรอ TS ลงคิวใหม่ · มติ C3) */
  const installed = mine.some((v) => isClosedVisit(v)
    && at(doneZonesByVisitId, v.id).map(String).includes(String(zoneId)));
  if (installed) return 'installed';

  const live = mine.find(isPendingInstallVisit);
  if (live) {
    if (isOpenVisit(live)) return 'confirmed';
    // ร่าง — TS ยืนยันวันแล้ว
    if (installReaskedAfterConfirm(request, live)) return 'awaiting_ts';
    if (!live.customerConfirmedAt) return 'awaiting_customer';
    /* คอนเฟิร์มลูกค้าแล้วแต่ยังเป็นร่าง = ด่านข้ออื่นติดตอนเลื่อนขึ้นตาราง (บัญชีถอนคำรับรอง · ช่าง · ช่วงเข้าไซต์)
       ⇒ มัดจำไม่ผ่าน = รอมัดจำ · นอกนั้นเป็นเรื่องของ TS */
    return deposit?.state === 'blocked' ? 'awaiting_deposit' : 'awaiting_ts';
  }

  if (!request.requestedAt) return 'not_requested';
  if (!deposit || deposit.state === 'blocked') return 'awaiting_deposit';
  return 'awaiting_ts';
}

/**
 * สรุปรายไซต์ — แถวของแท็บรอติดตั้ง / การ์ดบนใบสั่งขาย
 * @param stages ขั้นรายโซนของไซต์ (จาก `installZoneStage`)
 * @returns {{ stage, owner, installed, total }}
 *   `stage` = ขั้นที่ **ช้าที่สุด** ในโซนที่ยังไม่ติดตั้ง (ไซต์เดินได้เร็วเท่าโซนที่ช้าสุด) · ติดตั้งครบ = 'installed'
 *   ไม่มีโซน (คำขอเปล่า) = 'not_requested' — ฝ่ายขายต้องเลือกโซนก่อน ไม่ใช่ "ติดตั้งครบ"
 */
export function installSiteSummary(stages = []) {
  const list = (stages || []).filter(Boolean);
  if (list.includes(INSTALL_STAGE_SERVICE)) {
    return { stage: INSTALL_STAGE_SERVICE, owner: null, installed: 0, total: 0 };
  }
  if (!list.length) {
    return { stage: 'not_requested', owner: INSTALL_STAGE_OWNERS.not_requested, installed: 0, total: 0 };
  }
  const installed = list.filter((s) => s === 'installed').length;
  const open = list.filter((s) => s !== 'installed');
  const stage = open.length
    ? open.reduce((slow, s) => ((STAGE_RANK[s] ?? 0) < (STAGE_RANK[slow] ?? 0) ? s : slow))
    : 'installed';
  return { stage, owner: INSTALL_STAGE_OWNERS[stage] ?? null, installed, total: list.length };
}

/**
 * พร้อมทำสัญญาหรือยัง (สัญญาเป็นราย SO · มติ 09/11/2026)
 * "ครบ" = ทุกไซต์ที่เลือก **ติดตั้ง** ติดตั้งครบทุกโซน · ไซต์ Service ไม่นับ · ไซต์ที่ฝ่ายขายยังไม่เลือก = ยังไม่ครบ
 * ⚠️ ระบบ **ชี้ ไม่ล็อก** — ปุ่มออกสัญญาเดิมกดได้ตลอด (มติ 09/11) · ค่านี้ใช้กับป้าย/การ์ดเท่านั้น
 * @param sites `[{ siteId, stage }]` — `stage` จาก `installSiteSummary`
 * @returns {{ ready, done, total, undecided }}
 */
export function installContractReadiness(sites = []) {
  const list = (sites || []).filter(Boolean);
  const undecided = list.filter((s) => s.stage === 'undecided').length;
  const installSites = list.filter((s) => s.stage !== INSTALL_STAGE_SERVICE && s.stage !== 'undecided');
  const done = installSites.filter((s) => s.stage === 'installed').length;
  const total = installSites.length + undecided;
  return { ready: undecided === 0 && done === installSites.length, done, total, undecided };
}
