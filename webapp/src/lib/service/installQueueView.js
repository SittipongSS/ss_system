// ── แถวของแท็บ "รอติดตั้ง" ฝั่ง TS (ขั้นเข้าติดตั้ง PR-3b · ม็อก B1 · mig 0425) — ตัวตัดสินล้วน ─────────────────
//
// ⭐ หนึ่งแถว = หนึ่ง (ใบสั่งขาย × ไซต์) · ขั้นของแถวมาจาก `installQueue` (ขั้นที่ช้าที่สุดของโซนที่ขอ)
//    กลุ่มบนจอ: รอ TS ยืนยันวัน · รอมัดจำ · รอ SA คอนเฟิร์มลูกค้า · รอฝ่ายขาย (ยังไม่เลือก/ยังไม่ขอคิว)
//    · นัดยืนยันแล้ว/ติดตั้งแล้ว/Service ไม่อยู่ในแท็บนี้ (ไปอยู่ตารางนัดแล้ว หรือไม่ต้องติดตั้ง)
// ⭐ "รอฝ่ายขายเลือก" = ใบที่งานบริการเปิดแล้ว (รอบขายเปิด) แต่ไซต์ยังไม่มีคำตอบ ติดตั้ง/Service
//    ⚠️ จำกัดเฉพาะใบที่เปิดรอบขายภายใน `INSTALL_UNDECIDED_WINDOW_DAYS` วัน — ใบเก่าก่อนมีขั้นนี้ติดตั้งไปแล้วหมด
//       ไม่จำกัด = แท็บท่วมด้วยใบที่ไม่มีใครต้องทำอะไร (ค่าตั้งต้นที่ยังไม่ได้ถามเจ้าของ · บอกไว้ใน docs)
// 🔒 ไม่มีเงินในแถว — ด่านมัดจำได้งวดที่ไม่มียอด และยอดใบแค่ 0/null (ฝ่ายบริการไม่เห็นราคา)
import { installDepositGate } from './installDeposit';
import {
  INSTALL_STAGE_LABELS, INSTALL_STAGE_OWNERS, installSiteSummary, installZoneStage,
} from './installQueue';
import { installReaskedAfterConfirm } from './visitGate';
import { isDraftVisit, isOpenVisit } from './visitStatus';

export const INSTALL_UNDECIDED_WINDOW_DAYS = 60;
/* ขั้นที่อยู่ในแท็บ (ลำดับ = ลำดับกลุ่มบนจอ) */
export const INSTALL_QUEUE_STAGES = Object.freeze(['awaiting_ts', 'awaiting_deposit', 'awaiting_customer', 'not_requested', 'undecided']);
export const INSTALL_QUEUE_GROUP_LABELS = Object.freeze({
  awaiting_ts: 'รอ TS ยืนยันวัน',
  awaiting_deposit: 'รอมัดจำ',
  awaiting_customer: 'รอ SA คอนเฟิร์มลูกค้า',
  not_requested: 'รอฝ่ายขายขอคิว',
  undecided: 'รอฝ่ายขายเลือก ติดตั้ง/Service',
});
export const INSTALL_QUEUE_GROUP_HINTS = Object.freeze({
  awaiting_ts: 'มัดจำผ่านแล้ว หรือใบไม่มีงวดก่อนติดตั้ง — เลือกวัน เวลา ช่าง เครื่อง แล้วส่งให้ฝ่ายขายคอนเฟิร์มลูกค้า',
  awaiting_deposit: 'ขอคิวแล้ว · TS ยืนยันวันได้เมื่อบัญชีรับรองมัดจำ — ไม่ต้องทำอะไรที่นี่',
  awaiting_customer: 'TS ยืนยันวันแล้ว — นัดขึ้นงานช่างเมื่อฝ่ายขายโทรคอนเฟิร์มกับลูกค้า',
  not_requested: 'อ่านอย่างเดียว — ฝ่ายขายเลือกติดตั้งแล้ว ยังไม่ขอวัน',
  undecided: 'อ่านอย่างเดียว — ฝ่ายขายยังไม่ตอบว่าไซต์นี้ต้องติดตั้งหรือมีเครื่องอยู่แล้ว',
});

const pick = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]);

/**
 * @param data `{ requests, requestZones, orders, sites, zones, allocations, installments, visits,
 *               visitZonesByVisitId, doneZonesByVisitId }` — อาร์เรย์/Map ตามชื่อ (ตัวโหลดเป็นคนประกอบ)
 * @returns แถวเรียงตามขั้น แล้ววันที่ต้องการ (ใกล้ก่อน) แล้วรหัสไซต์
 */
export function installQueueRows({
  requests = [], requestZones = [], orders = new Map(), sites = new Map(), zones = new Map(), allocations = [],
  installments = [], visits = [], visitZonesByVisitId = {}, doneZonesByVisitId = {},
} = {}) {
  const asked = new Map();
  for (const rz of requestZones) (asked.get(rz.requestId) || asked.set(rz.requestId, []).get(rz.requestId)).push(String(rz.zoneId));
  const packs = new Map();
  for (const a of allocations) packs.set(`${a.salesOrderId}|${a.zoneId}`, (packs.get(`${a.salesOrderId}|${a.zoneId}`) || 0) + (Number(a.packsPerRound) || 0));
  const installmentsByOrder = new Map();
  for (const i of installments) (installmentsByOrder.get(i.salesOrderId) || installmentsByOrder.set(i.salesOrderId, []).get(i.salesOrderId)).push(i);
  const live = (o) => o && o.status === 'approved' && !o.supersededById;

  const rows = [];
  const decided = new Set();
  for (const r of requests) {
    decided.add(`${r.salesOrderId}|${r.siteId}`);
    if (r.mode !== 'install') continue;
    const order = pick(orders, r.salesOrderId);
    if (!live(order)) continue;
    const deposit = installDepositGate(order, installmentsByOrder.get(order.id) || []);
    const zoneIds = asked.get(r.id) || [];
    const zoneRows = zoneIds.map((zoneId) => {
      const zone = pick(zones, zoneId) || { id: zoneId };
      const stage = r.requestedAt
        ? installZoneStage({ request: r, zoneId, visits, visitZonesByVisitId, doneZonesByVisitId, deposit })
        : 'not_requested';
      const visit = (visits || []).find((v) => v.installRequestId === r.id && (isDraftVisit(v) || isOpenVisit(v))
        && (pick(visitZonesByVisitId, v.id) || []).map(String).includes(zoneId)) || null;
      return { zoneId, code: zone.code || null, name: zone.name || null, packsPerRound: packs.get(`${r.salesOrderId}|${zoneId}`) || null, stage, visitId: visit?.id || null };
    });
    const summary = r.requestedAt ? installSiteSummary(zoneRows.map((z) => z.stage)) : { stage: 'not_requested', installed: 0, total: zoneRows.length };
    if (!INSTALL_QUEUE_STAGES.includes(summary.stage)) continue;
    const pendingVisits = (visits || []).filter((v) => v.installRequestId === r.id && (isDraftVisit(v) || isOpenVisit(v)));
    rows.push(rowOf({ request: r, order, site: pick(sites, r.siteId), zones: zoneRows, stage: summary.stage, deposit, visits: pendingVisits, visitZonesByVisitId }));
  }

  /* ไซต์ของใบที่เปิดรอบขายแล้วแต่ยังไม่มีคำตอบ (ตัวโหลดตัดหน้าต่างวันมาแล้ว) */
  const undecided = new Map();
  for (const a of allocations) {
    const order = pick(orders, a.salesOrderId);
    const zone = pick(zones, a.zoneId);
    if (!live(order) || !order.serviceTermsOpenedAt || !zone?.siteId) continue;
    const key = `${order.id}|${zone.siteId}`;
    if (decided.has(key)) continue;
    if (!undecided.has(key)) undecided.set(key, { order, siteId: zone.siteId, zones: [] });
    if (!undecided.get(key).zones.some((z) => z.zoneId === zone.id)) {
      undecided.get(key).zones.push({ zoneId: zone.id, code: zone.code || null, name: zone.name || null, packsPerRound: packs.get(`${order.id}|${zone.id}`) || null, stage: 'undecided', visitId: null });
    }
  }
  for (const { order, siteId, zones: zoneRows } of undecided.values()) {
    rows.push(rowOf({ request: null, order, site: pick(sites, siteId) || { id: siteId }, zones: zoneRows, stage: 'undecided', deposit: installDepositGate(order, installmentsByOrder.get(order.id) || []), visits: [] }));
  }

  const rank = (s) => INSTALL_QUEUE_STAGES.indexOf(s);
  return rows.sort((a, b) => rank(a.stage) - rank(b.stage)
    || String(a.requestedDate || '9999').localeCompare(String(b.requestedDate || '9999'))
    || String(a.siteCode || '').localeCompare(String(b.siteCode || '')));
}

function rowOf({ request, order, site, zones, stage, deposit, visits, visitZonesByVisitId = {} }) {
  return {
    key: request?.id || `${order.id}|${site?.id}`,
    requestId: request?.id || null,
    salesOrderId: order.id,
    orderNumber: order.orderNumber || null,
    customerName: order.customerName || null,
    siteId: site?.id || request?.siteId || null,
    siteCode: site?.code || null,
    siteName: site?.name || null,
    /* ช่วงที่ไซต์ให้เข้า — ตัวเลือกวัน+ช่าง (CrewSlotPicker) เตือน/เลื่อนเวลาให้ตามนี้
       · ไซต์ไม่กำหนดเวลา = ค่าว่างทั้งคู่ (รู้ว่าไม่จำกัด) · ไม่รู้จักไซต์ = null (ไม่รู้ ⇒ ไม่เตือน) */
    siteAccess: site?.code
      ? { accessFrom: site.accessFrom || null, accessTo: site.accessTo || null, accessDays: Array.isArray(site.accessDays) ? site.accessDays : [] }
      : null,
    stage,
    stageLabel: stage === 'not_requested' ? INSTALL_QUEUE_GROUP_LABELS.not_requested : (INSTALL_STAGE_LABELS[stage] || null),
    owner: INSTALL_STAGE_OWNERS[stage] ?? null,
    zones,
    requestedDate: request?.requestedDate || null,
    requestedStartTime: request?.requestedStartTime ? String(request.requestedStartTime).slice(0, 5) : null,
    requestedEndTime: request?.requestedEndTime ? String(request.requestedEndTime).slice(0, 5) : null,
    requestedAt: request?.requestedAt || null,
    requestedByName: request?.requestedByName || request?.decidedByName || null,
    contactName: request?.contactName || null,
    contactPhone: request?.contactPhone || null,
    note: request?.note || null,
    changeReason: request?.changeReason || null,
    deposit: { state: deposit.state, text: deposit.state === 'blocked' ? deposit.reason : deposit.detail },
    visits: visits.map((v) => {
      const draft = isDraftVisit(v);
      /* ⭐ ลูกค้าขอเปลี่ยนวันหลัง TS ยืนยัน (PR-4) — TS ยืนยันวันใหม่บนนัดนี้ (ปุ่ม "ยืนยันวันใหม่")
         · คอนเฟิร์มลูกค้าแล้วแต่ยังเป็นร่าง = ติดด่านข้ออื่นตอนเลื่อนขึ้นตาราง (ปล่อยที่หน้าจัดคิว) */
      const reasked = draft && Boolean(request) && installReaskedAfterConfirm(request, v);
      return {
        id: v.id, code: v.code || null, status: v.status || null,
        scheduledDate: v.scheduledDate || null, startTime: v.startTime || null, endTime: v.endTime || null,
        assigneeId: v.assigneeId || null, assigneeName: v.assigneeName || null,
        tsConfirmedAt: v.tsConfirmedAt || null, customerConfirmedAt: v.customerConfirmedAt || null,
        zoneIds: (pick(visitZonesByVisitId, v.id) || []).map(String),
        reasked,
        stuck: draft && !reasked && Boolean(v.customerConfirmedAt),
      };
    }),
  };
}
