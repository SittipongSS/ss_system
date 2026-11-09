// ── TS ยืนยันวันติดตั้ง (ขั้นเข้าติดตั้ง PR-3a · ม็อก B2 · mig 0425) — ตัวตัดสินล้วน ไม่มี React ไม่มี DB ──────
//
// ⭐ มติเจ้าของ 09/11/2026: SA ขอวัน › **TS ยืนยันวัน** (ปรับวันได้ + เหตุที่ SA เห็น) › SA คอนเฟิร์มลูกค้าทุกครั้ง
//    · TS ยืนยันวันได้เมื่อมัดจำก่อนติดตั้งผ่าน (ด่านเดียวก่อนติดตั้ง · `installDepositGate`)
//    · TS แยกโซนเป็นหลายนัดได้ — นัดหนึ่งครอบโซนที่เลือก (`service_visit_zones`)
//    · TS วางเครื่องจากคลังรายโซน (`service_visit_planned_assets`) — หนึ่งเครื่อง = หนึ่งจุดบนจอช่าง
// ⭐ ผลของการยืนยัน = นัดติดตั้ง **ร่าง** (ด่านข้อ "นัดยืนยันกับลูกค้าแล้ว" ยังติด) — ช่างยังไม่เห็นจนกว่า SA คอนเฟิร์ม
// ⚠️ ตัวเดียวที่โมดัลของ TS และ API ถาม — ปุ่มกับ API ตอบคำเดียวกัน
import { isClosedVisit, isDraftVisit, isOpenVisit } from './visitStatus';

export const INSTALL_CONFIRM_TEXT = Object.freeze({
  notRequested: 'คำขอนี้ยังไม่ได้ขอคิวติดตั้ง',
  depositBlocked: 'มัดจำก่อนติดตั้งยังไม่ผ่าน — TS ยืนยันวันได้เมื่อบัญชีรับรอง',
  zonesRequired: 'เลือกโซนที่จะติดตั้งในนัดนี้อย่างน้อยหนึ่งโซน',
  zoneNotRequested: 'มีโซนที่ฝ่ายขายไม่ได้ขอติดตั้ง — โหลดใหม่แล้วเลือกใหม่',
  zoneBusy: 'มีโซนที่มีนัดติดตั้งอยู่แล้วหรือติดตั้งไปแล้ว — เลือกเฉพาะโซนที่ยังรอ',
  dateRequired: 'ระบุวันติดตั้ง',
  dateInvalid: 'รูปแบบวันที่ไม่ถูกต้อง',
  datePast: 'วันติดตั้งต้องไม่ก่อนวันนี้',
  timeInvalid: 'เวลาไม่ถูกต้อง (ชั่วโมง:นาที)',
  timePair: 'ระบุเวลาให้ครบทั้งเริ่มและจบ หรือเว้นว่างทั้งคู่ (ทั้งวัน)',
  timeOrder: 'เวลาเริ่มต้องก่อนเวลาจบ',
  assigneeRequired: 'เลือกหัวหน้างานของนัดนี้',
  reasonRequired: 'วันไม่ตรงกับที่ฝ่ายขายขอ — ใส่เหตุที่ปรับวันอย่างน้อย 5 ตัวอักษร (ฝ่ายขายเห็นตอนคอนเฟิร์มลูกค้า)',
  reasonLong: 'เหตุที่ปรับวันยาวเกิน 500 ตัวอักษร',
  assetsRequired: 'วางเครื่องจากคลังให้ทุกโซนในนัดนี้อย่างน้อยโซนละหนึ่งเครื่อง',
  assetZone: 'มีเครื่องที่วางไว้กับโซนที่ไม่อยู่ในนัดนี้',
  assetDuplicate: 'เครื่องเดียวกันถูกวางซ้ำ',
  assetNotInStock: 'มีเครื่องที่ไม่อยู่ในคลังแล้ว — โหลดใหม่แล้วเลือกเครื่องอื่น',
  assetPlannedElsewhere: 'มีเครื่องที่ถูกวางไว้ให้นัดติดตั้งอื่นแล้ว',
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (value) => String(value ?? '').trim();
const charCount = (value) => [...String(value ?? '')].length;
const at = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]) || [];

/**
 * โซนของคำขอที่ "ยังว่างให้ลงนัด" — ไม่มีนัดติดตั้งที่ยังมีชีวิตครอบ และยังไม่ติดตั้ง
 * @param visits นัดติดตั้งของคำขอ · `visitZonesByVisitId` · `doneZonesByVisitId` (โซนที่มีเครื่องผล done)
 */
export function installBusyZoneIds({ requestId, visits = [], visitZonesByVisitId = {}, doneZonesByVisitId = {} } = {}) {
  const busy = new Set();
  for (const v of visits || []) {
    if (!v || v.installRequestId !== requestId) continue;
    if (isDraftVisit(v) || isOpenVisit(v)) for (const z of at(visitZonesByVisitId, v.id)) busy.add(String(z));
    if (isClosedVisit(v)) for (const z of at(doneZonesByVisitId, v.id)) busy.add(String(z));
  }
  return busy;
}

/**
 * ตรวจค่าที่ TS ยืนยัน → `{ value, error }`
 * @param body `{ zoneIds, scheduledDate, startTime, endTime, assigneeId, assigneeName, assistantIds, plannedAssets: [{ zoneId, assetId }], dateChangeReason }`
 * @param ctx  `{ request, requestZoneIds, busyZoneIds: Set, deposit, todayIso, assetsById: Map(assetId → { status }), plannedElsewhere: Set(assetId) }`
 */
export function installConfirmInput(body = {}, {
  request = null, requestZoneIds = [], busyZoneIds = new Set(), deposit = null, todayIso = null,
  assetsById = new Map(), plannedElsewhere = new Set(),
} = {}) {
  if (!request || request.mode !== 'install' || !request.requestedAt) return { error: INSTALL_CONFIRM_TEXT.notRequested };
  if (!deposit || deposit.state !== 'ok') return { error: deposit?.reason ? `${INSTALL_CONFIRM_TEXT.depositBlocked} (${deposit.reason})` : INSTALL_CONFIRM_TEXT.depositBlocked };

  const allowed = new Set((requestZoneIds || []).map(String));
  const zoneIds = [...new Set((Array.isArray(body.zoneIds) ? body.zoneIds : []).map(text).filter(Boolean))];
  if (!zoneIds.length) return { error: INSTALL_CONFIRM_TEXT.zonesRequired };
  if (zoneIds.some((id) => !allowed.has(id))) return { error: INSTALL_CONFIRM_TEXT.zoneNotRequested };
  if (zoneIds.some((id) => busyZoneIds.has(id))) return { error: INSTALL_CONFIRM_TEXT.zoneBusy };

  const scheduledDate = text(body.scheduledDate);
  if (!scheduledDate) return { error: INSTALL_CONFIRM_TEXT.dateRequired };
  if (!DATE_RE.test(scheduledDate) || Number.isNaN(Date.parse(`${scheduledDate}T00:00:00Z`))) return { error: INSTALL_CONFIRM_TEXT.dateInvalid };
  if (todayIso && scheduledDate < todayIso) return { error: INSTALL_CONFIRM_TEXT.datePast };

  const startTime = text(body.startTime).slice(0, 5);
  const endTime = text(body.endTime).slice(0, 5);
  if ((startTime && !TIME_RE.test(startTime)) || (endTime && !TIME_RE.test(endTime))) return { error: INSTALL_CONFIRM_TEXT.timeInvalid };
  if (Boolean(startTime) !== Boolean(endTime)) return { error: INSTALL_CONFIRM_TEXT.timePair };
  if (startTime && endTime && startTime >= endTime) return { error: INSTALL_CONFIRM_TEXT.timeOrder };

  const assigneeId = text(body.assigneeId);
  if (!assigneeId) return { error: INSTALL_CONFIRM_TEXT.assigneeRequired };
  const assistantIds = [...new Set((Array.isArray(body.assistantIds) ? body.assistantIds : []).map(text).filter(Boolean))]
    .filter((id) => id !== assigneeId);

  /* เหตุที่ปรับวัน — บังคับเมื่อวันไม่ตรงกับที่ฝ่ายขายขอ (มติ N3) · วันตรงแล้วใส่มาก็เก็บ */
  const dateChangeReason = text(body.dateChangeReason);
  if (scheduledDate !== text(request.requestedDate) && charCount(dateChangeReason) < 5) return { error: INSTALL_CONFIRM_TEXT.reasonRequired };
  if (charCount(dateChangeReason) > 500) return { error: INSTALL_CONFIRM_TEXT.reasonLong };

  const plannedAssets = [];
  const seen = new Set();
  for (const item of Array.isArray(body.plannedAssets) ? body.plannedAssets : []) {
    const zoneId = text(item?.zoneId);
    const assetId = text(item?.assetId);
    if (!zoneId || !assetId) continue;
    if (!zoneIds.includes(zoneId)) return { error: INSTALL_CONFIRM_TEXT.assetZone };
    if (seen.has(assetId)) return { error: INSTALL_CONFIRM_TEXT.assetDuplicate };
    seen.add(assetId);
    const asset = assetsById instanceof Map ? assetsById.get(assetId) : assetsById?.[assetId];
    if (!asset || asset.status !== 'in_stock') return { error: INSTALL_CONFIRM_TEXT.assetNotInStock };
    if (plannedElsewhere.has(assetId)) return { error: INSTALL_CONFIRM_TEXT.assetPlannedElsewhere };
    plannedAssets.push({ zoneId, assetId });
  }
  if (zoneIds.some((zoneId) => !plannedAssets.some((p) => p.zoneId === zoneId))) return { error: INSTALL_CONFIRM_TEXT.assetsRequired };

  return {
    value: {
      zoneIds,
      scheduledDate,
      startTime: startTime || null,
      endTime: endTime || null,
      assigneeId,
      assigneeName: text(body.assigneeName) || null,
      assistantIds,
      plannedAssets,
      dateChangeReason: dateChangeReason || null,
    },
  };
}
