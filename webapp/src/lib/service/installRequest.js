// ── คำขอคิวติดตั้งฝั่งฝ่ายขาย (ขั้นเข้าติดตั้ง PR-2b · mig 0425) — ตัวตัดสินล้วน ไม่มี React ไม่มี DB ──────────
//
// ⭐ มติเจ้าของ 02/11 + 09/11/2026 (docs/service-install-step.md):
//    · ฝ่ายขายตอบรายไซต์ "ติดตั้ง / Service" — Service = เครื่องอยู่แล้ว (ต่อสัญญา) ไม่เข้าคิวติดตั้ง
//    · ขอคิวได้ทันทีหลังใบอนุมัติและงานบริการอนุมัติ (รอบขายเปิดแล้ว) — TS เห็นคำขอเลย แต่ยืนยันวันได้เมื่อมัดจำผ่าน
//    · แก้วันที่ขอเองได้จนกว่า TS ยืนยันวัน · หลังจากนั้นเป็นทาง "ลูกค้าขอเปลี่ยนวัน" (งวด PR-4)
// ⚠️ **ตัวเดียวที่ทั้งการ์ดบนใบสั่งขายและ API ถาม** — ปุ่มกับ API ตอบคำเดียวกันเสมอ (กติกา GatedAction)
// ⚠️ ขั้นของคำขอ (รอมัดจำ · รอ TS ยืนยันวัน · …) ถาม `installQueue.js` — ไฟล์นี้ไม่คิดขั้นเอง
import { installDepositGate } from './installDeposit';
// ใบย้อนหลัง — ตัวตัดสินเดียว (literal ของ origin มีบ้านเดียวที่ historicalOrders.js)
import { isHistoricalOrder } from '@/lib/sales/historicalOrders';
import {
  INSTALL_STAGE_LABELS, INSTALL_STAGE_OWNERS, INSTALL_STAGE_SERVICE,
  installContractReadiness, installSiteSummary, installZoneStage,
} from './installQueue';
import { installCustomerVisitError } from './installCustomer';
import { installReaskedAfterConfirm } from './visitGate';
import { isClosedVisit, isDraftVisit, isOpenVisit } from './visitStatus';

export const INSTALL_MODES = Object.freeze(['install', 'none']);
export const INSTALL_MODE_LABELS = Object.freeze({ install: 'ติดตั้ง', none: 'Service · เครื่องอยู่แล้ว' });

export const INSTALL_REQUEST_LIMITS = Object.freeze({ contactName: 150, contactPhone: 40, note: 1000 });

export const INSTALL_REQUEST_TEXT = Object.freeze({
  off: 'ยังไม่เปิดใช้ขั้นเข้าติดตั้ง',
  noRight: 'ไม่มีสิทธิ์แก้ใบสั่งขายนี้',
  notApproved: 'ขอคิวติดตั้งได้หลังใบสั่งขายอนุมัติ',
  superseded: 'ใบนี้ถูกออก Rev. ทับแล้ว — ขอคิวที่ใบ Rev.',
  termsClosed: 'งานบริการของใบนี้ยังไม่อนุมัติ — ขอคิวติดตั้งได้หลังผู้จัดการฝ่ายขายตรวจงานบริการ',
  historical: 'ใบสั่งขายย้อนหลังไม่มีขั้นเข้าติดตั้ง',
  siteNotInOrder: 'ไซต์นี้ไม่อยู่ในงานบริการของใบสั่งขายนี้',
  modeInvalid: 'เลือกได้แค่ "ติดตั้ง" หรือ "Service"',
  modeLocked: 'ไซต์นี้มีนัดติดตั้งอยู่แล้ว — เปลี่ยนเป็น Service ไม่ได้',
  modeNotInstall: 'ไซต์นี้เลือกเป็น Service — เปลี่ยนเป็น "ติดตั้ง" ก่อนขอคิว',
  zonesRequired: 'เลือกโซนที่ต้องติดตั้งอย่างน้อยหนึ่งโซน',
  zoneNotInSite: 'มีโซนที่ไม่อยู่ในไซต์นี้ของใบสั่งขาย — โหลดหน้าใหม่แล้วเลือกใหม่',
  dateRequired: 'ระบุวันที่ลูกค้าต้องการให้เข้าติดตั้ง',
  dateInvalid: 'รูปแบบวันที่ไม่ถูกต้อง',
  datePast: 'วันที่ต้องการต้องไม่ก่อนวันนี้',
  timeInvalid: 'เวลาไม่ถูกต้อง (ชั่วโมง:นาที)',
  timePair: 'ระบุช่วงเวลาให้ครบทั้งเริ่มและจบ หรือเว้นว่างทั้งคู่ (ทั้งวัน)',
  timeOrder: 'เวลาเริ่มต้องก่อนเวลาจบ',
  contactLong: `ชื่อผู้ติดต่อยาวเกิน ${150} ตัวอักษร`,
  phoneLong: `เบอร์ติดต่อยาวเกิน ${40} ตัวอักษร`,
  noteLong: `หมายเหตุยาวเกิน ${1000} ตัวอักษร`,
  tsConfirmed: 'TS ยืนยันวันแล้ว — แก้วันที่ขอเองไม่ได้ (ใช้ "ลูกค้าขอเปลี่ยนวัน" ในขั้นคอนเฟิร์มลูกค้า)',
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (value) => String(value ?? '').trim();
const charCount = (value) => [...String(value ?? '')].length;
const at = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]) || [];

/**
 * ใครขอคิว/เลือกโหมดของใบนี้ได้ตอนนี้ — ด่านระดับใบ (ทั้งการ์ดและ API)
 * @param order   ใบสั่งขาย (status · origin · supersededById · serviceTermsOpenedAt)
 * @param canEdit สิทธิ์แก้ใบจาก server (`canEditSalesPlanning && inSalesEditScope`)
 * @param enabled สวิตช์ `SERVICE_INSTALL_STEP` (route อ่าน · จออ่านจาก payload)
 */
export function installOrderError(order, { canEdit = false, enabled = false } = {}) {
  if (!enabled) return INSTALL_REQUEST_TEXT.off;
  if (!canEdit) return INSTALL_REQUEST_TEXT.noRight;
  if (isHistoricalOrder(order)) return INSTALL_REQUEST_TEXT.historical;
  if (order?.supersededById) return INSTALL_REQUEST_TEXT.superseded;
  if (order?.status !== 'approved') return INSTALL_REQUEST_TEXT.notApproved;
  if (!order?.serviceTermsOpenedAt) return INSTALL_REQUEST_TEXT.termsClosed;
  return null;
}

/* นัดติดตั้งของคำขอที่ยังมีชีวิต (ร่าง/นัดไว้/กำลังทำ) — ปิด/ยกเลิก/เลื่อนแล้วไม่นับ */
const pendingVisits = (visits, requestId) => (visits || [])
  .filter((v) => v && v.installRequestId === requestId && (isDraftVisit(v) || isOpenVisit(v)));

/**
 * เปลี่ยนโหมดรายไซต์ได้ไหม
 * ⚠️ install → none ห้ามเมื่อมีนัดติดตั้งที่ยังมีชีวิต (TS ยืนยันวันไปแล้ว) — ต้องจบนัดก่อน · none → install ได้เสมอ
 */
export function installModeError({ mode, request = null, visits = [], siteInOrder = true } = {}) {
  if (!INSTALL_MODES.includes(mode)) return INSTALL_REQUEST_TEXT.modeInvalid;
  if (!siteInOrder) return INSTALL_REQUEST_TEXT.siteNotInOrder;
  if (mode === 'none' && request && pendingVisits(visits, request.id).length) return INSTALL_REQUEST_TEXT.modeLocked;
  return null;
}

/**
 * ตรวจค่าที่ขอคิว → `{ value, error }` (ข้อแรกที่ผิด · ค่าที่ตัดช่องว่างแล้ว)
 * @param input       `{ zoneIds, requestedDate, requestedStartTime, requestedEndTime, contactName, contactPhone, note }`
 * @param siteZoneIds โซนของไซต์นี้ที่อยู่ในงานบริการของใบ
 * @param todayIso    วันนี้ตามเวลาไทย
 * @param request     คำขอเดิม (มีนัดที่ TS ยืนยันแล้ว = แก้เองไม่ได้)
 */
export function installRequestInput(input = {}, { siteZoneIds = [], todayIso = null, request = null, visits = [] } = {}) {
  if (request?.mode === 'none') return { error: INSTALL_REQUEST_TEXT.modeNotInstall };
  if (request && pendingVisits(visits, request.id).some((v) => v.tsConfirmedAt)) {
    return { error: INSTALL_REQUEST_TEXT.tsConfirmed };
  }
  const allowed = new Set((siteZoneIds || []).map(String));
  const zoneIds = [...new Set((Array.isArray(input.zoneIds) ? input.zoneIds : []).map(text).filter(Boolean))];
  if (!zoneIds.length) return { error: INSTALL_REQUEST_TEXT.zonesRequired };
  if (zoneIds.some((id) => !allowed.has(id))) return { error: INSTALL_REQUEST_TEXT.zoneNotInSite };

  const requestedDate = text(input.requestedDate);
  if (!requestedDate) return { error: INSTALL_REQUEST_TEXT.dateRequired };
  if (!DATE_RE.test(requestedDate) || Number.isNaN(Date.parse(`${requestedDate}T00:00:00Z`))) {
    return { error: INSTALL_REQUEST_TEXT.dateInvalid };
  }
  if (todayIso && requestedDate < todayIso) return { error: INSTALL_REQUEST_TEXT.datePast };

  const start = text(input.requestedStartTime).slice(0, 5);
  const end = text(input.requestedEndTime).slice(0, 5);
  if ((start && !TIME_RE.test(start)) || (end && !TIME_RE.test(end))) return { error: INSTALL_REQUEST_TEXT.timeInvalid };
  if (Boolean(start) !== Boolean(end)) return { error: INSTALL_REQUEST_TEXT.timePair };
  if (start && end && start >= end) return { error: INSTALL_REQUEST_TEXT.timeOrder };

  const contactName = text(input.contactName);
  const contactPhone = text(input.contactPhone);
  const note = text(input.note);
  if (charCount(contactName) > INSTALL_REQUEST_LIMITS.contactName) return { error: INSTALL_REQUEST_TEXT.contactLong };
  if (charCount(contactPhone) > INSTALL_REQUEST_LIMITS.contactPhone) return { error: INSTALL_REQUEST_TEXT.phoneLong };
  if (charCount(note) > INSTALL_REQUEST_LIMITS.note) return { error: INSTALL_REQUEST_TEXT.noteLong };

  return {
    value: {
      zoneIds,
      requestedDate,
      requestedStartTime: start || null,
      requestedEndTime: end || null,
      contactName: contactName || null,
      contactPhone: contactPhone || null,
      note: note || null,
    },
  };
}

/**
 * ภาพรวมรายไซต์ของใบ — การ์ด "ติดตั้ง · เข้าบริการ" บนใบสั่งขาย
 * @param ctx ผลของ `loadServiceSetupContext` (allocations · zonesById · sitesById · installments · order)
 * @param requests `service_install_requests` ของใบ · `requestZones` `[{ requestId, zoneId }]`
 * @param visits นัดติดตั้งของคำขอเหล่านั้น · `visitZonesByVisitId` · `doneZonesByVisitId`
 * @returns `{ deposit, sites: [...], readiness }` — ไซต์เรียงตามรหัส · โซนเรียงตามลำดับในใบ
 */
export function installSitesView(ctx, {
  requests = [], requestZones = [], visits = [], visitZonesByVisitId = {}, doneZonesByVisitId = {},
  installedAssets = [], siteAssets = [],
} = {}) {
  const deposit = installDepositGate(ctx?.order || null, ctx?.installments || []);
  const zonesById = ctx?.zonesById instanceof Map ? ctx.zonesById : new Map();
  const sitesById = ctx?.sitesById instanceof Map ? ctx.sitesById : new Map();
  const bySite = new Map();
  for (const alloc of (ctx?.allocations || []).slice().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))) {
    const zone = zonesById.get(alloc?.zoneId);
    if (!zone?.siteId) continue;
    if (!bySite.has(zone.siteId)) bySite.set(zone.siteId, new Map());
    const zones = bySite.get(zone.siteId);
    const prev = zones.get(zone.id);
    zones.set(zone.id, {
      zoneId: zone.id, code: zone.code || null, name: zone.name || null,
      packsPerRound: (prev?.packsPerRound || 0) + (Number(alloc.packsPerRound) || 0),
    });
  }
  const requestBySite = new Map((requests || []).map((r) => [r.siteId, r]));
  const askedByRequest = new Map();
  for (const row of requestZones || []) {
    if (!askedByRequest.has(row.requestId)) askedByRequest.set(row.requestId, new Set());
    askedByRequest.get(row.requestId).add(String(row.zoneId));
  }

  const sites = [...bySite.entries()].map(([siteId, zoneMap]) => {
    const site = sitesById.get(siteId) || { id: siteId };
    const request = requestBySite.get(siteId) || null;
    const asked = request ? (askedByRequest.get(request.id) || new Set()) : new Set();
    const zones = [...zoneMap.values()].map((zone) => {
      /* โซนที่ไม่ได้ขอติดตั้ง (คำขอเลือกบางโซน) ไม่มีขั้น — ไม่นับในความคืบหน้าของไซต์ */
      const inRequest = request?.mode === 'install' && asked.has(String(zone.zoneId));
      const stage = !request ? 'undecided'
        : request.mode === 'none' ? INSTALL_STAGE_SERVICE
          : !request.requestedAt ? 'not_requested'
            : inRequest
              ? installZoneStage({ request, zoneId: zone.zoneId, visits, visitZonesByVisitId, doneZonesByVisitId, deposit })
              : null;
      const visit = inRequest ? zoneVisit(request, zone.zoneId, visits, visitZonesByVisitId) : null;
      /* ⭐ PR-5c (A3/A6): ติดตั้งแล้ว = นัดที่ปิดแล้วของโซนนี้ + เครื่องผล done (รหัส · รุ่น · สี · จุด) */
      const installed = stage === 'installed' ? zoneInstalled(zone.zoneId, request, visits, installedAssets) : null;
      return { ...zone, requested: inRequest, stage, visit, installed };
    });
    const stages = request?.mode === 'install' && request.requestedAt
      ? zones.filter((z) => z.requested).map((z) => z.stage)
      : [request ? (request.mode === 'none' ? INSTALL_STAGE_SERVICE : 'not_requested') : 'undecided'];
    const summary = installSiteSummary(stages);
    return {
      siteId,
      siteCode: site.code || null,
      siteName: site.name || null,
      mode: request?.mode || null,
      request,
      zones,
      stage: summary.stage,
      stageLabel: INSTALL_STAGE_LABELS[summary.stage] || null,
      owner: summary.owner ?? INSTALL_STAGE_OWNERS[summary.stage] ?? null,
      installed: summary.installed,
      total: summary.total,
      hasPendingVisit: request ? pendingVisits(visits, request.id).length > 0 : false,
      visits: request ? siteVisits(request, visits, visitZonesByVisitId, zoneMap) : [],
      /* ไซต์ Service — เครื่องที่อยู่แล้ว (ทะเบียนเครื่อง · ใช้งานอยู่) สำหรับการ์ดผลติดตั้งในแท็บสัญญา */
      serviceAssets: request?.mode === 'none'
        ? (siteAssets || []).filter((a) => a.siteId === siteId).map(assetLine) : [],
    };
  }).sort((a, b) => String(a.siteCode || a.siteId).localeCompare(String(b.siteCode || b.siteId)));

  return { deposit, sites, readiness: installContractReadiness(sites.map((s) => ({ siteId: s.siteId, stage: s.stage }))) };
}

/* นัดที่บอกสถานะของโซน — นัดที่ยังมีชีวิตก่อน แล้วค่อยนัดล่าสุดที่ปิดแล้ว (สรุปบนการ์ด) */
function zoneVisit(request, zoneId, visits, visitZonesByVisitId) {
  const mine = (visits || []).filter((v) => v && v.installRequestId === request.id
    && at(visitZonesByVisitId, v.id).map(String).includes(String(zoneId)));
  const pick = mine.find((v) => isDraftVisit(v) || isOpenVisit(v))
    || mine.filter(isClosedVisit).sort((a, b) => String(b.scheduledDate || '').localeCompare(String(a.scheduledDate || '')))[0];
  if (!pick) return null;
  return {
    id: pick.id, code: pick.code || null, status: pick.status, scheduledDate: pick.scheduledDate || null,
    startTime: pick.startTime || null, endTime: pick.endTime || null, tsConfirmedAt: pick.tsConfirmedAt || null,
    customerConfirmedAt: pick.customerConfirmedAt || null, dateChangeReason: pick.dateChangeReason || null,
  };
}

/* นัดติดตั้งที่ยังมีชีวิตของไซต์ — แถวคำตอบของลูกค้าบนการ์ด (PR-4 · ม็อก A5)
   `awaitingCustomer` = ปุ่ม "คอนเฟิร์มลูกค้า" ขึ้น (ตัวตัดสินเดียวกับ API: `installCustomerVisitError`)
   `reasked` = ขอเปลี่ยนวันแล้ว รอ TS · `stuck` = คอนเฟิร์มแล้วแต่ยังเป็นร่าง (ด่านข้ออื่นติด · TS ปล่อยที่หน้าจัดคิว) */
function siteVisits(request, visits, visitZonesByVisitId, zoneMap) {
  return pendingVisits(visits, request.id)
    .sort((a, b) => String(a.scheduledDate || '').localeCompare(String(b.scheduledDate || '')) || String(a.id).localeCompare(String(b.id)))
    .map((v) => {
      const zoneIds = at(visitZonesByVisitId, v.id).map(String);
      const draft = isDraftVisit(v);
      const reasked = draft && installReaskedAfterConfirm(request, v);
      return {
        id: v.id, code: v.code || null, status: v.status,
        scheduledDate: v.scheduledDate || null, startTime: v.startTime || null, endTime: v.endTime || null,
        assigneeName: v.assigneeName || null,
        tsConfirmedAt: v.tsConfirmedAt || null, tsConfirmedByName: v.tsConfirmedByName || null,
        customerConfirmedAt: v.customerConfirmedAt || null, customerConfirmedByName: v.customerConfirmedByName || null,
        dateChangeReason: v.dateChangeReason || null,
        zoneIds,
        zoneNames: zoneIds.map((id) => zoneMap.get(id)?.name || zoneMap.get(id)?.code).filter(Boolean),
        reasked,
        stuck: draft && !reasked && Boolean(v.customerConfirmedAt),
        awaitingCustomer: installCustomerVisitError(v, request, 'confirm') === null,
      };
    });
}

const assetLine = (a) => ({
  assetId: a.assetId || a.id, code: a.code || null, label: a.label || null, model: a.model || null,
  colour: a.colour || null, spot: a.spot || null, zoneId: a.zoneId || null,
});

/* ผลติดตั้งของโซน — นัดปิดล่าสุดที่มีเครื่องผล done ในโซนนี้ (โซนที่ติดข้ามหลายนัด = รวมเครื่องทุกนัด · วันที่ของนัดล่าสุด) */
function zoneInstalled(zoneId, request, visits, installedAssets) {
  const mine = (installedAssets || []).filter((a) => String(a.zoneId) === String(zoneId)
    && (visits || []).some((v) => v.id === a.visitId && v.installRequestId === request?.id && isClosedVisit(v)));
  if (!mine.length) return null;
  const byId = new Map((visits || []).map((v) => [v.id, v]));
  const last = [...new Set(mine.map((a) => a.visitId))].map((id) => byId.get(id)).filter(Boolean)
    .sort((a, b) => String(b.actualDate || b.scheduledDate || '').localeCompare(String(a.actualDate || a.scheduledDate || '')))[0] || null;
  return {
    visitId: last?.id || null,
    visitCode: last?.code || null,
    date: last?.actualDate || last?.scheduledDate || null,
    assets: mine.map(assetLine),
  };
}

/* กลุ่มเครื่องตามรุ่น + สี — "OV-10 ขาว ×2" */
export function machineGroupsText(assets = []) {
  const counts = new Map();
  for (const a of assets || []) {
    const key = [a.label || a.model || a.code, a.colour].filter(Boolean).join(' ') || 'เครื่อง';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()].map(([name, n]) => `${name} ×${n}`).join(' · ');
}

/**
 * การ์ด "ผลติดตั้งสำหรับทำสัญญา" ในแท็บสัญญา (PR-5c · ม็อก A6) — อ่านอย่างเดียว
 * ⭐ จำนวนเครื่องและจุดที่ติดจริง รวมทุกไซต์ของใบ (สัญญาเป็นราย SO) · ไซต์ Service ใช้เครื่องที่อยู่แล้วจากทะเบียนเครื่อง
 * ⚠️ ระบบ **ชี้ ไม่เติม** — ยังไม่เติมค่าลงสัญญาให้เอง (มติ 09/11)
 * @param view ผลของ `installSitesView`
 * @returns `{ readiness, sites: [{ siteId, siteCode, siteName, mode, rows: [{ zoneId, code, name, machines, codes, date, visitCode, pending }] }], totals }`
 */
export function installContractView(view) {
  const sites = (view?.sites || []).filter((s) => s.mode).map((site) => {
    if (site.mode === 'none') {
      const byZone = new Map();
      for (const a of site.serviceAssets || []) {
        if (!byZone.has(a.zoneId)) byZone.set(a.zoneId, []);
        byZone.get(a.zoneId).push(a);
      }
      const rows = [...byZone.entries()].map(([zoneId, assets]) => {
        const zone = site.zones.find((z) => String(z.zoneId) === String(zoneId)) || {};
        return {
          zoneId, code: zone.code || null, name: zone.name || null, machines: machineGroupsText(assets),
          codes: assets.map((a) => a.code).filter(Boolean), count: assets.length, date: null, visitCode: null, pending: false,
        };
      });
      return { siteId: site.siteId, siteCode: site.siteCode, siteName: site.siteName, mode: 'none', rows };
    }
    const rows = site.zones.filter((z) => z.requested).map((z) => (z.installed ? {
      zoneId: z.zoneId, code: z.code, name: z.name, machines: machineGroupsText(z.installed.assets),
      codes: z.installed.assets.map((a) => a.code).filter(Boolean), count: z.installed.assets.length,
      date: z.installed.date, visitCode: z.installed.visitCode, pending: false,
    } : {
      zoneId: z.zoneId, code: z.code, name: z.name, machines: null, codes: [], count: 0, date: null, visitCode: null,
      pending: true, stageLabel: INSTALL_STAGE_LABELS[z.stage] || null,
    }));
    return { siteId: site.siteId, siteCode: site.siteCode, siteName: site.siteName, mode: 'install', stage: site.stage, rows };
  });
  const installSites = sites.filter((s) => s.mode === 'install');
  const serviceSites = sites.filter((s) => s.mode === 'none');
  const installedAssets = installSites.flatMap((s) => s.rows.filter((r) => !r.pending));
  const allInstalled = (view?.sites || []).flatMap((s) => s.zones.filter((z) => z.installed).flatMap((z) => z.installed.assets));
  const allService = serviceSites.flatMap((s) => (view.sites.find((x) => x.siteId === s.siteId)?.serviceAssets || []));
  return {
    readiness: view?.readiness || null,
    sites,
    totals: {
      sites: sites.length,
      zones: installedAssets.length + serviceSites.reduce((n, s) => n + s.rows.length, 0),
      machines: allInstalled.length + allService.length,
      install: { sites: installSites.length, zones: installedAssets.length, machines: allInstalled.length, groups: machineGroupsText(allInstalled) },
      service: { sites: serviceSites.length, machines: allService.length },
    },
  };
}
