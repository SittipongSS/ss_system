// ── ทะเบียนไซต์บริการ + เครื่องกระจายกลิ่น (mig 0187) — logic ล้วน ────────
//
// ⭐ ที่มา: ทีม SV ขายระบบกระจายกลิ่นได้ แต่หลังปิดการขายไม่มีตารางไหนรู้ว่าเครื่อง
// อยู่ที่ไหน · `customers` มีที่อยู่ช่องเดียว → ลูกค้า 12 สาขาเก็บไม่ได้ตั้งแต่ต้น
//
// ไฟล์นี้ไม่แตะ DB — ใช้ได้ทั้ง client (ฟอร์ม/ปฏิทิน) และ server (validate ก่อน insert)
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { ASSET_KINDS, ASSET_KIND_LABELS, assetKindPerUnitRow, normalizeAssetSettings } from './assetKinds';

export const ASSET_STATUSES = ['active', 'repair', 'removed'];
export const ASSET_STATUS_LABELS = {
  active: 'ใช้งาน',
  repair: 'ส่งซ่อม',
  removed: 'ถอดออกแล้ว',
};

// 0 = อาทิตย์ … 6 = เสาร์ (ตรงกับ Date.getDay() — ห้ามใช้ระบบเลขของตัวเอง
// เพราะทุกที่ในโค้ดที่คำนวณวันใช้ getDay() อยู่แล้ว)
export const WEEKDAYS = [0, 1, 2, 3, 4, 5, 6];
export const WEEKDAY_LABELS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_HHMM = /^([01]\d|2[0-3]):([0-5]\d)(:[0-5]\d)?$/;

function dateError(value, label) {
  if (!value) return null;
  const text = String(value);
  if (!ISO_DATE.test(text)) return `${label}ไม่ถูกต้อง`;
  const year = Number(text.slice(0, 4));
  if (year < 2000 || year > 2100) return `${label}อยู่นอกช่วงปีที่เป็นไปได้ (${year})`;
  return null;
}

// 'HH:MM' หรือ 'HH:MM:SS' → นาทีตั้งแต่เที่ยงคืน · คืน null ถ้าไม่ใช่เวลา
export function minutesOf(time) {
  const m = TIME_HHMM.exec(String(time ?? ''));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

// ตัดวินาทีทิ้งให้เหลือ 'HH:MM' — Postgres คืน time เป็น '10:00:00'
export const toHHMM = (time) => {
  const m = TIME_HHMM.exec(String(time ?? ''));
  return m ? `${m[1]}:${m[2]}` : '';
};

function normalizeAccessDays(value) {
  if (value === undefined || value === null || value === '') return { value: [], error: null };
  if (!Array.isArray(value)) return { value: null, error: 'วันที่เข้าได้ต้องเป็นรายการ' };
  const days = [];
  for (const raw of value) {
    const day = Number(raw);
    if (!WEEKDAYS.includes(day)) return { value: null, error: 'วันที่เข้าได้ไม่ถูกต้อง' };
    if (!days.includes(day)) days.push(day);
  }
  // เรียงเสมอ — ไม่งั้น [1,3] กับ [3,1] เป็นคนละค่าใน DB ทั้งที่หมายถึงอย่างเดียวกัน
  return { value: days.sort((a, b) => a - b), error: null };
}

// ── ตรวจข้อมูลไซต์ก่อนแตะ DB — คืนข้อความไทย หรือ null ถ้าผ่าน ────────────
export function normalizeSiteInput(body = {}) {
  const customerId = String(body.customerId ?? '').trim();
  if (!customerId) return { value: null, error: 'ต้องเลือกลูกค้า' };

  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อไซต์' };
  if (name.length > 150) return { value: null, error: 'ชื่อไซต์ยาวเกิน 150 ตัวอักษร' };

  const text = (field, label, max) => {
    const value = String(body[field] ?? '').trim();
    if (value.length > max) return { error: `${label}ยาวเกิน ${max} ตัวอักษร` };
    return { value: value || null };
  };

  const fields = {};
  for (const [field, label, max] of [
    ['routeZone', 'เขตวิ่งงาน', 50],
    ['address', 'ที่อยู่', 500],
    ['mapUrl', 'ลิงก์แผนที่', 500],
    ['contactName', 'ชื่อผู้ติดต่อ', 100],
    ['contactPhone', 'เบอร์ผู้ติดต่อ', 50],
    ['accessNote', 'เงื่อนไขการเข้าไซต์', 1000],
    ['note', 'หมายเหตุ', 1000],
  ]) {
    const res = text(field, label, max);
    if (res.error) return { value: null, error: res.error };
    fields[field] = res.value;
  }

  // ── ช่วงเวลาที่ไซต์ให้เข้า ──
  const accessFrom = String(body.accessFrom ?? '').trim();
  const accessTo = String(body.accessTo ?? '').trim();
  for (const [value, label] of [[accessFrom, 'เวลาเริ่มเข้าได้'], [accessTo, 'เวลาสิ้นสุดเข้าได้']]) {
    if (value && minutesOf(value) === null) return { value: null, error: `${label}ไม่ถูกต้อง` };
  }
  if (accessFrom && accessTo && minutesOf(accessFrom) >= minutesOf(accessTo)) {
    return { value: null, error: 'เวลาเริ่มเข้าได้ต้องก่อนเวลาสิ้นสุด' };
  }

  const days = normalizeAccessDays(body.accessDays);
  if (days.error) return { value: null, error: days.error };

  return {
    value: {
      customerId,
      customerName: String(body.customerName ?? '').trim() || null,
      name,
      ...fields,
      accessFrom: accessFrom ? toHHMM(accessFrom) : null,
      accessTo: accessTo ? toHHMM(accessTo) : null,
      accessDays: days.value,
      isActive: body.isActive === undefined ? true : !!body.isActive,
      ownerId: body.ownerId || null,
      ownerName: body.ownerName || null,
    },
    error: null,
  };
}

// ── ตรวจข้อมูลเครื่อง ────────────────────────────────────────────────────
export function normalizeAssetInput(body = {}) {
  const label = String(body.label ?? '').trim().replace(/\s+/g, ' ');
  if (!label) return { value: null, error: 'ต้องระบุชื่อ/ตำแหน่งเครื่อง' };
  if (label.length > 150) return { value: null, error: 'ชื่อเครื่องยาวเกิน 150 ตัวอักษร' };

  const status = body.status ?? 'active';
  if (!ASSET_STATUSES.includes(status)) return { value: null, error: 'สถานะเครื่องไม่ถูกต้อง' };

  // ชนิดอุปกรณ์ (mig 0298) — ทะเบียนอยู่ assetKinds.js ไม่ใช่ CHECK ใน DB
  const kind = body.kind ?? 'diffuser';
  if (!ASSET_KINDS.includes(kind)) return { value: null, error: 'ชนิดอุปกรณ์ไม่ถูกต้อง' };
  const perUnitRow = assetKindPerUnitRow(kind);

  const model = String(body.model ?? '').trim();
  if (model.length > 100) return { value: null, error: 'รุ่นยาวเกิน 100 ตัวอักษร' };
  const serial = String(body.serial ?? '').trim();
  if (serial.length > 100) return { value: null, error: 'Serial ยาวเกิน 100 ตัวอักษร' };
  // serial เป็นของรายเครื่อง — ชนิดแถวรวม (reed/สบู่/แอลกอฮอล์) ไม่มี serial รายจุด
  if (serial && !perUnitRow) return { value: null, error: `${ASSET_KIND_LABELS[kind]}เป็นแถวรวมทั้งชุด ไม่มี Serial รายจุด — ใส่รายละเอียดในหมายเหตุแทน` };

  const colour = String(body.colour ?? '').trim();
  if (colour.length > 50) return { value: null, error: 'สียาวเกิน 50 ตัวอักษร' };
  const floor = String(body.floor ?? '').trim();
  if (floor.length > 50) return { value: null, error: 'ชั้นยาวเกิน 50 ตัวอักษร' };
  const spot = String(body.spot ?? '').trim();
  if (spot.length > 150) return { value: null, error: 'จุดติดตั้งยาวเกิน 150 ตัวอักษร' };

  // ⚠️ ปริมาณเป็นตัวเลือก — เครื่องที่ยังไม่รู้อัตราสิ้นเปลืองมีจริง
  //    ห้ามแปลงค่าว่างเป็น 0 (0 ml/วัน = ไม่มีวันหมด → ระบบจะไม่เตือนเลย)
  const numbers = {};
  for (const [field, label2] of [['bottleMl', 'ขนาดขวด'], ['mlPerDay', 'อัตราใช้ต่อวัน'], ['qty', 'จำนวนจุด']]) {
    const raw = body[field];
    if (raw === undefined || raw === null || String(raw).trim() === '') { numbers[field] = null; continue; }
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return { value: null, error: `${label2}ต้องเป็นตัวเลขมากกว่า 0` };
    numbers[field] = value;
  }
  // จำนวนจุดเป็นของชนิดแถวรวมเท่านั้น — diffuser หนึ่งแถวคือหนึ่งเครื่องเสมอ
  if (perUnitRow && numbers.qty !== null) return { value: null, error: 'เครื่องกระจายกลิ่นนับแถวละเครื่อง — ไม่มีช่องจำนวนจุด' };
  if (!perUnitRow && numbers.qty === null) return { value: null, error: `ต้องระบุจำนวนจุดของ${ASSET_KIND_LABELS[kind]} (ชนิดนี้เก็บเป็นแถวเดียวทั้งชุด)` };

  const { value: settings, error: settingsError } = normalizeAssetSettings(kind, body.settings);
  if (settingsError) return { value: null, error: settingsError };

  for (const [field, label2] of [['installedAt', 'วันที่ติดตั้ง'], ['removedAt', 'วันที่ถอด']]) {
    const err = dateError(body[field], label2);
    if (err) return { value: null, error: err };
  }
  if (body.installedAt && body.removedAt && String(body.removedAt) < String(body.installedAt)) {
    return { value: null, error: 'วันที่ถอดต้องไม่ก่อนวันที่ติดตั้ง' };
  }

  const note = String(body.note ?? '').trim();
  if (note.length > 1000) return { value: null, error: 'หมายเหตุยาวเกิน 1000 ตัวอักษร' };

  return {
    value: {
      label,
      kind,
      model: model || null,
      serial: serial || null,
      colour: colour || null,
      floor: floor || null,
      spot: spot || null,
      // ⚠️ โซนตรวจความเป็นเจ้าของ (อยู่ไซต์เดียวกัน) ที่ route — ที่นี่ส่งผ่านอย่างเดียว
      zoneId: body.zoneId || null,
      qty: numbers.qty,
      settings,
      productId: body.productId || null,
      productName: String(body.productName ?? '').trim() || null,
      scentId: body.scentId || null,
      bottleMl: numbers.bottleMl,
      mlPerDay: numbers.mlPerDay,
      installedAt: body.installedAt || null,
      removedAt: body.removedAt || null,
      status,
      note: note || null,
    },
    error: null,
  };
}

// ── ช่วงเวลาที่ไซต์ให้เข้า — ข้อความสรุปสำหรับหน้าจอ ─────────────────────
export function accessWindowText(site) {
  if (!site) return '';
  const from = toHHMM(site.accessFrom);
  const to = toHHMM(site.accessTo);
  const days = Array.isArray(site.accessDays) ? site.accessDays : [];
  const parts = [];
  if (days.length && days.length < 7) parts.push(days.map((d) => WEEKDAY_LABELS[d]).join(' '));
  if (from && to) parts.push(`${from}–${to}`);
  else if (from) parts.push(`ตั้งแต่ ${from}`);
  else if (to) parts.push(`ถึง ${to}`);
  return parts.join(' · ');
}

export const hasAccessWindow = (site) => !!accessWindowText(site);

// นัดเวลานี้เข้าไซต์ได้ไหม — ใช้ตอน S-2 (ตอนนี้ใช้บนหน้าทะเบียนเพื่อพรีวิว)
//
// ⚠️ **เตือน ไม่บล็อก** (หลักการข้อ 2 ของแผน) — ลูกค้าอนุโลมเป็นครั้ง ๆ ได้
// ระบบที่บล็อกจะถูกเลี่ยงไปนัดนอกระบบ แล้วตารางก็ตายทั้งใบ
// ⚠️ นัดที่ **ยังไม่ระบุเวลา** ไม่ถือว่าผิด — ไม่รู้เวลา ไม่ใช่ ผิด
export function accessConflict(site, { date = null, startTime = null, endTime = null } = {}) {
  if (!site) return null;

  if (date) {
    const days = Array.isArray(site.accessDays) ? site.accessDays : [];
    const dt = new Date(`${date}T00:00:00`);
    if (days.length && !Number.isNaN(dt.getTime()) && !days.includes(dt.getDay())) {
      return { kind: 'day', message: `ไซต์นี้ให้เข้าเฉพาะ ${days.map((d) => WEEKDAY_LABELS[d]).join(' ')}` };
    }
  }

  const from = minutesOf(site.accessFrom);
  const to = minutesOf(site.accessTo);
  if (from === null && to === null) return null;

  const start = minutesOf(startTime);
  const end = minutesOf(endTime);
  if (start === null && end === null) return null; // ยังไม่ระบุเวลา → ไม่ตัดสิน

  const window = `${toHHMM(site.accessFrom) || '—'}–${toHHMM(site.accessTo) || '—'}`;
  if (from !== null && start !== null && start < from) {
    return { kind: 'time', message: `เข้าก่อนเวลาที่ไซต์อนุญาต (${window})` };
  }
  if (to !== null && end !== null && end > to) {
    return { kind: 'time', message: `ออกหลังเวลาที่ไซต์อนุญาต (${window})` };
  }
  // นัดที่ระบุแค่เวลาเริ่ม แต่เริ่มหลังเวลาปิดไซต์ไปแล้ว
  if (to !== null && end === null && start !== null && start >= to) {
    return { kind: 'time', message: `เริ่มหลังเวลาที่ไซต์ปิดรับ (${window})` };
  }
  return null;
}

// ── น้ำหอมจะหมดวันไหน ────────────────────────────────────────────────────
// ประเมินจาก ขนาดขวด ÷ อัตราใช้ต่อวัน นับจากวันที่เติมล่าสุด
// คืน null เมื่อข้อมูลไม่พอ — **ห้ามเดา** เพราะป้าย "ใกล้หมด" ที่มั่วจะถูกเมิน
// ทั้งกระดานภายในสองสัปดาห์ แล้วป้ายจริงก็ถูกเมินไปด้วย
export function refillDueDate(asset, lastRefillIso) {
  if (!asset?.bottleMl || !asset?.mlPerDay) return null;
  const anchor = lastRefillIso || asset.installedAt;
  if (!anchor) return null;
  const start = new Date(`${anchor}T00:00:00`);
  if (Number.isNaN(start.getTime())) return null;
  const days = Math.floor(Number(asset.bottleMl) / Number(asset.mlPerDay));
  if (!Number.isFinite(days) || days <= 0) return null;
  start.setDate(start.getDate() + days);
  // ⚠️ ห้ามใช้ toISOString().slice(0,10) — เที่ยงคืนเวลาไทยแปลงเป็น UTC แล้ว
  // **วันถอยไป 1 วัน** (UTC+7) ซึ่งทำให้วันเตือนมาเร็วกว่าจริงเสมอโดยไม่มีใครเห็น
  return toLocalISODate(start);
}

// สรุปเครื่องของไซต์ — ตัวเลขที่หัวการ์ดต้องตอบได้ใน 3 วินาที
export function assetRollup(assets = []) {
  const active = assets.filter((a) => a.status === 'active').length;
  const repair = assets.filter((a) => a.status === 'repair').length;
  const removed = assets.filter((a) => a.status === 'removed').length;
  return { total: assets.length, active, repair, removed };
}
