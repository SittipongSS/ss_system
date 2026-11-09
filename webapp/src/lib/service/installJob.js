// ── หน้างานติดตั้งของช่าง (ขั้นเข้าติดตั้ง PR-5a · ม็อก C1/C2/C3 · mig 0425 + 0429) — ตัวตัดสินล้วน ───────────────
//
// ⭐ มติเจ้าของ 09/11/2026: จอช่างทรงเดียวกับจอประเมินพื้นที่ — รายการโซนทั้งหมดพร้อมสถานะ › แตะโซน = รายการจุด
//    · หนึ่งจุด = หนึ่งเครื่องที่ TS วางไว้ (`service_visit_planned_assets`) · ทำโซน/จุดไหนก่อนก็ได้ · ข้ามได้
//    · "ติดตั้งแล้ว" = รูป + ชื่อจุดที่ติดจริง · "ติดไม่ได้" = เหตุ (เครื่องกลับคลัง)
//    · ส่งงาน: โซนที่ยังไม่มีผลต้องเลือก "ไปทำต่อ" หรือ "ติดไม่ได้ทั้งโซน" ก่อน · ไม่มีลายเซ็นลูกค้า
// ⭐ ผลรายเครื่องอยู่ `service_visit_assets` (outcome done/unable + reason) ตารางเดิม — ขั้นของคำขอ (installQueue)
//    อ่านที่เดิม · ชื่อจุด/รูปอยู่แถวเครื่องที่วาง (mig 0429) · ส่งงานแล้วชื่อจุดลง `service_assets.spot` พร้อมคำสั่งย้าย install
// ⚠️ ตัวเดียวที่จอช่างและ API ถาม — ปุ่มกับ API ตอบคำเดียวกัน
import { visitFileKey } from './visitFiles';

export const INSTALL_SPOT_LIMITS = Object.freeze({ spotName: 150, reason: 500, zoneNote: 1000, sendNote: 1000 });
export const INSTALL_ZONE_RESOLUTIONS = Object.freeze(['later', 'unable']);
export const INSTALL_ZONE_RESOLUTION_LABELS = Object.freeze({ later: 'ไปทำต่อ', unable: 'ติดไม่ได้ทั้งโซน' });

export const INSTALL_JOB_TEXT = Object.freeze({
  notInstall: 'นัดนี้ไม่ใช่งานติดตั้งจากคำขอคิว',
  notRunning: 'ยังไม่ได้เริ่มงาน — กด "เริ่มงาน" ที่หน้างานก่อนบันทึกผล',
  spotMissing: 'ไม่พบจุดนี้ในงาน — โหลดหน้าใหม่',
  zoneMissing: 'ไม่พบโซนนี้ในงาน — โหลดหน้าใหม่',
  outcomeInvalid: 'ผลของจุดเลือกได้แค่ "ติดตั้งแล้ว" หรือ "ติดไม่ได้"',
  nameRequired: 'ติดตั้งแล้วต้องมีชื่อจุด',
  photoRequired: 'ติดตั้งแล้วต้องมีรูปของจุด',
  photoNotOnVisit: 'รูปนี้ยังไม่ได้แนบกับงาน — ถ่ายใหม่อีกครั้ง',
  nameLong: 'ชื่อจุดยาวเกิน 150 ตัวอักษร',
  reasonRequired: 'ติดไม่ได้ต้องใส่เหตุอย่างน้อย 5 ตัวอักษร',
  reasonLong: 'เหตุยาวเกิน 500 ตัวอักษร',
  noteLong: 'หมายเหตุยาวเกิน 1000 ตัวอักษร',
  zoneUnresolved: 'มีโซนที่ยังไม่มีผล — เลือก "ไปทำต่อ" หรือ "ติดไม่ได้ทั้งโซน" ก่อนส่ง',
  zoneReasonRequired: 'ติดไม่ได้ทั้งโซนต้องใส่เหตุอย่างน้อย 5 ตัวอักษร',
  nothingToSend: 'ยังไม่มีผลสักจุด — ถ้าวันนี้ทำไม่ได้ทั้งงาน เลือก "ติดไม่ได้ทั้งโซน" พร้อมเหตุ',
});

const text = (value) => String(value ?? '').trim();
const charCount = (value) => [...String(value ?? '')].length;
const at = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]);

/**
 * ภาพของงานติดตั้งหนึ่งนัด — รายการโซน (C1) + จุดในโซน (C2) + ตัวนับ
 * @param visitZones `[{ zoneId, note }]` ของนัด · `planned` `[{ zoneId, assetId, sortOrder, spotName, photoUrl, photoName }]`
 * @param results    `service_visit_assets` ของนัด `[{ assetId, outcome, reason }]`
 * @param zonesById / assetsById Map ของโซน/เครื่อง · `elsewhere` โซนของคำขอที่อยู่นัดอื่น `[{ zoneId, visitCode, scheduledDate }]`
 */
export function installJobView({
  visitZones = [], planned = [], results = [], zonesById = new Map(), assetsById = new Map(), elsewhere = [],
} = {}) {
  const resultOf = new Map((results || []).map((r) => [String(r.assetId), r]));
  const zones = (visitZones || []).map((vz) => {
    const zone = at(zonesById, vz.zoneId) || { id: vz.zoneId };
    const spots = (planned || [])
      .filter((p) => String(p.zoneId) === String(vz.zoneId))
      .sort((a, b) => (Number(a.sortOrder) || 0) - (Number(b.sortOrder) || 0))
      .map((p, i) => {
        const asset = at(assetsById, p.assetId) || { id: p.assetId };
        const result = resultOf.get(String(p.assetId)) || null;
        return {
          n: i + 1,
          assetId: p.assetId,
          code: asset.code || null,
          label: asset.label || null,
          model: asset.model || null,
          colour: asset.colour || null,
          spotName: p.spotName || null,
          photoUrl: p.photoUrl || null,
          photoName: p.photoName || null,
          outcome: result?.outcome === 'done' || result?.outcome === 'unable' ? result.outcome : null,
          reason: result?.reason || null,
        };
      });
    const done = spots.filter((s) => s.outcome === 'done').length;
    const unable = spots.filter((s) => s.outcome === 'unable').length;
    const answered = done + unable;
    return {
      zoneId: vz.zoneId,
      code: zone.code || null,
      name: zone.name || null,
      note: vz.note || null,
      spots,
      done,
      unable,
      total: spots.length,
      state: !answered ? 'not_started' : answered < spots.length ? 'working' : 'complete',
    };
  }).sort((a, b) => String(a.code || a.name || '').localeCompare(String(b.code || b.name || '')));
  const total = zones.reduce((n, z) => n + z.total, 0);
  const done = zones.reduce((n, z) => n + z.done, 0);
  const answered = zones.reduce((n, z) => n + z.done + z.unable, 0);
  return {
    zones,
    elsewhere: (elsewhere || []).map((e) => {
      const zone = at(zonesById, e.zoneId) || { id: e.zoneId };
      return { zoneId: e.zoneId, code: zone.code || null, name: zone.name || null, visitCode: e.visitCode || null, scheduledDate: e.scheduledDate || null };
    }),
    total,
    done,
    answered,
    missing: total - answered,
    zonesComplete: zones.filter((z) => z.state === 'complete').length,
  };
}

/** หาจุดในภาพของงาน — `{ zone, spot }` หรือ null */
export function findInstallSpot(view, assetId) {
  for (const zone of view?.zones || []) {
    const spot = zone.spots.find((s) => String(s.assetId) === String(assetId));
    if (spot) return { zone, spot };
  }
  return null;
}

/**
 * บันทึกจุดหนึ่งจุด → `{ value, error }`
 * @param body `{ assetId, spotName?, photoUrl?, photoName?, outcome?: 'done'|'unable'|'' , reason? }` — `outcome` ว่าง = ล้างผล (ยังไม่ตอบ)
 * @param ctx  `{ view, photoUrls: Set }` — รูปต้องแนบกับนัดแล้ว (`visits/[id]/photos`) จึงเปิดผ่านระบบได้
 */
export function installSpotInput(body = {}, { view = null, photoUrls = new Set() } = {}) {
  const assetId = text(body.assetId);
  const hit = findInstallSpot(view, assetId);
  if (!hit) return { error: INSTALL_JOB_TEXT.spotMissing };
  const outcome = text(body.outcome);
  if (outcome && outcome !== 'done' && outcome !== 'unable') return { error: INSTALL_JOB_TEXT.outcomeInvalid };
  const spotName = text(body.spotName);
  const photoUrl = text(body.photoUrl);
  const photoName = text(body.photoName).slice(0, 255);
  const reason = text(body.reason);
  if (charCount(spotName) > INSTALL_SPOT_LIMITS.spotName) return { error: INSTALL_JOB_TEXT.nameLong };
  const photoKeys = new Set([...photoUrls].map((u) => visitFileKey(u)).filter(Boolean));
  if (photoUrl && !photoKeys.has(visitFileKey(photoUrl))) return { error: INSTALL_JOB_TEXT.photoNotOnVisit };
  if (outcome === 'done') {
    if (!spotName) return { error: INSTALL_JOB_TEXT.nameRequired };
    if (!photoUrl) return { error: INSTALL_JOB_TEXT.photoRequired };
  }
  if (outcome === 'unable') {
    if (charCount(reason) < 5) return { error: INSTALL_JOB_TEXT.reasonRequired };
    if (charCount(reason) > INSTALL_SPOT_LIMITS.reason) return { error: INSTALL_JOB_TEXT.reasonLong };
  }
  return {
    value: {
      assetId: hit.spot.assetId,
      zoneId: hit.zone.zoneId,
      spotName: spotName || null,
      photoUrl: photoUrl || null,
      photoName: photoUrl ? (photoName || spotName || null) : null,
      outcome: outcome || null,
      reason: outcome === 'unable' ? reason : null,
    },
  };
}

/** หมายเหตุโซน → `{ value, error }` */
export function installZoneNoteInput(body = {}, { view = null } = {}) {
  const zoneId = text(body.zoneId);
  if (!(view?.zones || []).some((z) => String(z.zoneId) === zoneId)) return { error: INSTALL_JOB_TEXT.zoneMissing };
  const note = text(body.note);
  if (charCount(note) > INSTALL_SPOT_LIMITS.zoneNote) return { error: INSTALL_JOB_TEXT.noteLong };
  return { value: { zoneId, note: note || null } };
}

/**
 * ส่งงาน → `{ value, error }` · `value` = แผนที่ route ทำตาม
 * @param body `{ zones: { [zoneId]: { resolution: 'later'|'unable', reason? } }, note? }` — ต้องตอบเฉพาะโซนที่ยังมีจุดไม่มีผล
 * @returns value `{ installs: [{ assetId, zoneId, spotName }], unable: [{ assetId, zoneId, reason }], later: [zoneId],
 *                  status: 'done'|'partial'|'unable', note }`
 *   สถานะของนัด: ทุกจุดติดตั้งแล้ว = done · ไม่มีจุดไหนติดตั้ง = unable · นอกนั้น partial (รวมโซนที่ "ไปทำต่อ")
 *   ⚠️ ไม่ใช้ `deriveVisitStatus` ของนัดตามรอบ — โซน "ไปทำต่อ" ไม่มีแถวผล ตัวนั้นจะอ่านเป็น done ทั้งที่งานยังไม่ครบ
 */
export function installSendInput(body = {}, { view = null } = {}) {
  const asked = body?.zones && typeof body.zones === 'object' ? body.zones : {};
  const note = text(body?.note);
  if (charCount(note) > INSTALL_SPOT_LIMITS.sendNote) return { error: INSTALL_JOB_TEXT.noteLong };
  const installs = [];
  const unable = [];
  const later = [];
  for (const zone of view?.zones || []) {
    for (const spot of zone.spots) {
      if (spot.outcome === 'done') installs.push({ assetId: spot.assetId, zoneId: zone.zoneId, spotName: spot.spotName });
      if (spot.outcome === 'unable') unable.push({ assetId: spot.assetId, zoneId: zone.zoneId, reason: spot.reason, saved: true });
    }
    const open = zone.spots.filter((s) => !s.outcome);
    if (!open.length) continue;
    const pick = asked[zone.zoneId] || {};
    const resolution = text(pick.resolution);
    if (!INSTALL_ZONE_RESOLUTIONS.includes(resolution)) return { error: INSTALL_JOB_TEXT.zoneUnresolved, zoneId: zone.zoneId };
    if (resolution === 'later') { later.push(zone.zoneId); continue; }
    const reason = text(pick.reason);
    if (charCount(reason) < 5) return { error: INSTALL_JOB_TEXT.zoneReasonRequired, zoneId: zone.zoneId };
    if (charCount(reason) > INSTALL_SPOT_LIMITS.reason) return { error: INSTALL_JOB_TEXT.reasonLong, zoneId: zone.zoneId };
    for (const spot of open) unable.push({ assetId: spot.assetId, zoneId: zone.zoneId, reason, saved: false });
  }
  const total = view?.total || 0;
  if (!installs.length && !unable.length) return { error: INSTALL_JOB_TEXT.nothingToSend };
  const status = installs.length === total && total > 0 ? 'done' : installs.length === 0 && !later.length ? 'unable' : 'partial';
  return { value: { installs, unable, later, status, note: note || null } };
}
