// ── ทะเบียนไซต์บริการ + เครื่องกระจายกลิ่น (mig 0187) — logic ล้วน ────────
//
// ⭐ ที่มา: ทีม SV ขายระบบกระจายกลิ่นได้ แต่หลังปิดการขายไม่มีตารางไหนรู้ว่าเครื่อง
// อยู่ที่ไหน · `customers` มีที่อยู่ช่องเดียว → ลูกค้า 12 สาขาเก็บไม่ได้ตั้งแต่ต้น
//
// ไฟล์นี้ไม่แตะ DB — ใช้ได้ทั้ง client (ฟอร์ม/ปฏิทิน) และ server (validate ก่อน insert)
import { toLocalISODate } from '@/lib/pm/dateHelpers';
import { addressText } from '@/lib/master/addresses';
import { ASSET_KINDS, ASSET_KIND_LABELS, assetKindPerUnitRow, normalizeAssetSettings } from './assetKinds';

/* ── สถานะเครื่อง = "อยู่ขั้นไหนของวงจร" (mig 0332) ────────────────────────
   ⭐ `in_stock` เพิ่มพร้อมกับการทำคลังเป็น **ไซต์จริง** ⇒ "ถอดจากหน้างาน" ไม่ใช่
   สถานะอีกต่อไป มันคือการย้ายไซต์ (ลูกค้า → คลัง) · `removed` จึงเหลือความหมายเดียว
   คือ **ปลดระวาง** ไม่ใช่ "ถอดออกแล้ว" แบบเดิม
   ⚠️ คุมด้วย CHECK ใน DB ด้วย — เพิ่มค่าที่นี่อย่างเดียวไม่พอ ต้องมี migration เสมอ */
export const ASSET_STATUSES = ['active', 'in_stock', 'repair', 'removed'];
export const ASSET_STATUS_LABELS = {
  active: 'ใช้งาน',
  in_stock: 'อยู่ในคลัง',
  repair: 'ส่งซ่อม',
  removed: 'ปลดระวาง',
};

/* ── สภาพเครื่อง = แกนที่สอง แยกจาก "อยู่ขั้นไหน" (mig 0332) ──────────────
   ⭐ เครื่องเสียขณะยังตั้งอยู่หน้างานคือเรื่องที่แกนเดียวเล่าไม่ได้ — ต้องเลือก
   ระหว่าง active กับ broken แล้วอีกความจริงหายไป และตัวนับ "เครื่องที่ใช้งานอยู่"
   ของไซต์จะกระโดดทันทีที่มีคนแจ้งว่าเสีย ทั้งที่เครื่องยังอยู่ที่เดิม */
export const ASSET_CONDITIONS = ['ok', 'broken'];
export const ASSET_CONDITION_LABELS = {
  ok: 'ปกติ',
  broken: 'ชำรุด',
};

/* 🔑 **ตัวตัดสินตัวเดียวของทั้งระบบ**: เครื่องตัวนี้ "อยู่หน้างานลูกค้า" หรือเปล่า
   ⚠️ ก่อน 0332 โค้ดที่ถามคำถามนี้เขียนเป็น `status !== 'removed'` กระจาย 5 จุด
   ซึ่งพอมี `in_stock` เข้ามาจะกลายเป็น "เครื่องในคลังนับเป็นของหน้างาน" ทันที —
   ผลคือเตือนน้ำหอมใกล้หมดให้เครื่องบนชั้นวาง และภาระคิวช่างบวมตามสต๊อก
   ⇒ ทุกจุดต้องถามผ่านตัวนี้ ห้ามเทียบสตริงเอง */
export function isAssetOnSite(asset) {
  return asset?.status !== 'removed' && asset?.status !== 'in_stock';
}

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

/* ── สี่ช่องที่ก๊อปได้จาก `customers.addresses[]` มาตั้งต้นไซต์ (mig 0313) ────
   นอกจากสี่ช่องนี้ ไซต์กับที่อยู่ทางภาษีไม่มีอะไรตรงกันเลย — เขตวิ่งงาน · เวลาเข้า ·
   ผู้ดูแล เป็นของไซต์ล้วน · เลขสาขา/ตำบล-อำเภอ เป็นของใบกำกับล้วน

   ⚠️ **ก๊อปครั้งเดียวตอนคนกด ไม่ใช่ผูกให้เปลี่ยนตามกัน** — ห้างแก้ที่อยู่จดทะเบียน
      ไม่ได้แปลว่าเครื่องย้ายชั้น (โรคเดียวกับกระจกชื่อลูกค้าบนเอกสาร) */
export const SITE_ADDRESS_FIELDS = [
  ['address', 'ที่อยู่', (row) => addressText(row)],
  ['mapUrl', 'ลิงก์แผนที่', (row) => row?.mapUrl || ''],
  ['contactName', 'ผู้ติดต่อหน้างาน', (row) => row?.contactName || ''],
  ['contactPhone', 'เบอร์ผู้ติดต่อ', (row) => row?.contactPhone || ''],
];

const trimmed = (value) => String(value ?? '').trim();

/* ค่าที่ควรถูกก๊อปลงไซต์เมื่อกด "ดึงใหม่" — **ทะเบียนว่าง = ไม่แตะ**
   ⚠️ ไซต์จริงใบแรกบน production มี `mapUrl` แต่ไม่มี `address` ⇒ ถ้าดึงใหม่แล้วเอา
      ค่าว่างจากทะเบียนไปทับ หมุดแผนที่ที่เจ้าหน้าที่ใช้จริงหายทันที */
export function siteAddressCarry(site = {}, row) {
  const next = {};
  if (!row) return next;
  for (const [field, , pick] of SITE_ADDRESS_FIELDS) {
    next[field] = pick(row) || site[field] || '';
  }
  return next;
}

/* ช่องที่ **ทะเบียนมีค่า และไม่ตรงกับที่เก็บไว้บนไซต์** → [{ field, label }]
   ⚠️ ต้องนับเฉพาะช่องที่ `siteAddressCarry` เปลี่ยนได้จริง ไม่งั้นจอจะขึ้นปุ่ม
      "ดึงใหม่" แล้วกดไปไม่มีอะไรขยับ ซึ่งอ่านว่าปุ่มเสีย
   ⚠️ ไม่ใช่ error — ที่อยู่หน้างานต่างจากที่อยู่จดทะเบียนเป็นเรื่องปกติ (ล็อบบี้ห้าง ·
      พื้นที่เช่า) หน้าที่ของค่านี้คือ "บอกว่าต่าง" แล้วให้คนตัดสิน */
export function siteAddressDrift(site = {}, row) {
  if (!row) return [];
  return SITE_ADDRESS_FIELDS
    .filter(([field, , pick]) => {
      const source = trimmed(pick(row));
      return !!source && source !== trimmed(site[field]);
    })
    .map(([field, label]) => ({ field, label }));
}

/* ── ประเภทไซต์ (mig 0332) ────────────────────────────────────────────────
   ⭐ คลังเป็น **ไซต์จริงหนึ่งใบ** เจ้าของคือบริษัทตัวเอง (AR-000) ⇒ ทุกเครื่อง
   ตอบ "อยู่ไหน" ด้วยชื่อสถานที่เสมอ ไม่มีคำตอบที่แปลว่า "ไม่มีข้อมูล"
   🔴 **ห้ามแยกคลังด้วย `customerId`/`arCode`** — บริษัทตัวเองมีไซต์ลูกค้าจริงด้วย
   (`ST-0000-01-BKK-1001` Scent and Sense Office ที่มีเครื่องตั้งใช้งานอยู่)
   แยกด้วยเจ้าของเมื่อไร เครื่องที่ออฟฟิศตัวเองจะถูกนับเป็นสต๊อกทันที */
export const SITE_KINDS = ['customer', 'warehouse'];
export const SITE_KIND_LABELS = {
  customer: 'ไซต์ลูกค้า',
  warehouse: 'คลังเครื่อง',
};
export const isWarehouseSite = (site) => site?.kind === 'warehouse';

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

  /* ── จังหวัด (mig 0315) — **ไม่ใช่ที่อยู่ แต่เป็นตัวตน** ────────────────
     รหัสไซต์ `ST-XXXX-AA-BBB-CCCC` ประกอบจากภาค/จังหวัด ⇒ ขาดไม่ได้ตอนสร้าง
     ⚠️ บังคับที่ **route** ไม่ใช่ที่นี่ — ไฟล์นี้ตรวจรูปร่างล้วน และโหมดแก้ของไซต์เก่า
        (ก่อน 0315) ต้องยังบันทึกได้แม้ยังไม่ได้เลือกจังหวัด · ที่นี่ตรวจแค่ "รูปถูกไหม" */
  const provinceCode = String(body.provinceCode ?? '').trim();
  if (provinceCode && !/^\d{2}$/.test(provinceCode)) {
    return { value: null, error: 'รหัสจังหวัดไม่ถูกต้อง' };
  }

  // ประเภทไซต์ (mig 0332) — ตั้งต้น 'customer' เหมือน DEFAULT ใน DB
  const kind = body.kind ?? 'customer';
  if (!SITE_KINDS.includes(kind)) return { value: null, error: 'ประเภทไซต์ไม่ถูกต้อง' };

  /* ── สองช่องที่ "ระบบรู้เอง" ไม่ใช่ช่องให้คนกรอก ──────────────────────
     customerAddressId = แถวที่อยู่ในทะเบียนลูกค้าที่ใช้ตั้งต้นไซต์ (mig 0313) —
       บอกที่มาอย่างเดียว ไม่ผูกให้เปลี่ยนตามกัน · ฟอร์มใช้เทียบค่าแล้วเสนอ "ดึงใหม่"
     projectId = โครงการสายบริการที่คลอดไซต์นี้ (mig 0299) — วิซาร์ดรับใบสั่งขาย
       ประทับให้เอง จากใบที่กำลังเปิดอยู่ · **ไม่มีช่องกรอกบนจอ** และไม่บังคับ
       (ของเก่า 380 จุดติดตั้งไม่เคยมีโครงการ · ลูกค้าโทรมาให้ไปติดตั้งก็ไม่มี)
     ⚠️ ทั้งคู่ตรวจ "มีจริงไหม" ที่ route ไม่ใช่ที่นี่ — ไฟล์นี้ไม่แตะ DB */
  const reference = (field, label) => {
    const value = String(body[field] ?? '').trim();
    if (value.length > 60) return { error: `${label}ไม่ถูกต้อง` };
    return { value: value || null };
  };
  for (const [field, label] of [['customerAddressId', 'ที่อยู่ต้นทาง'], ['projectId', 'โครงการ']]) {
    const res = reference(field, label);
    if (res.error) return { value: null, error: res.error };
    fields[field] = res.value;
  }

  return {
    value: {
      customerId,
      customerName: String(body.customerName ?? '').trim() || null,
      name,
      ...fields,
      accessFrom: accessFrom ? toHHMM(accessFrom) : null,
      accessTo: accessTo ? toHHMM(accessTo) : null,
      accessDays: days.value,
      provinceCode: provinceCode || null,
      // ชื่อจังหวัดเก็บคู่รหัสเสมอ — จอ/รายงานประกอบข้อความได้โดยไม่ต้องเปิดทะเบียน
      // 650KB ฝั่ง client (แพตเทิร์นเดียวกับที่อยู่ลูกค้า mig 0217)
      province: String(body.province ?? '').trim().slice(0, 100) || null,
      kind,
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

  // สภาพเครื่อง (mig 0332) — แกนที่สอง ตั้งต้น 'ok' เหมือน DEFAULT ใน DB
  const condition = body.condition ?? 'ok';
  if (!ASSET_CONDITIONS.includes(condition)) return { value: null, error: 'สภาพเครื่องไม่ถูกต้อง' };

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

  for (const [field, label2] of [
    ['installedAt', 'วันที่ติดตั้ง'], ['removedAt', 'วันที่ถอด'],
    // วันรับเข้าคลัง (mig 0332) — **คนละช่องกับวันติดตั้ง** ชีตเก่ามีทั้งสองและต่างกันเป็นปี
    ['receivedAt', 'วันที่รับเข้าคลัง'],
  ]) {
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
      receivedAt: body.receivedAt || null,
      status,
      condition,
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
  // ⚠️ `inStock` ต้องอยู่ในสรุปด้วย ไม่งั้น active+repair+removed ≠ total
  //    แล้วคนอ่านหน้าไซต์จะเห็นเป็นบั๊ก (ตัวเลขไม่รวมกัน)
  const inStock = assets.filter((a) => a.status === 'in_stock').length;
  // สภาพเป็นแกนที่สอง — นับแยกจากสถานะ ไม่ใช่แทนกัน
  const broken = assets.filter((a) => a.condition === 'broken').length;
  return { total: assets.length, active, inStock, repair, removed, broken };
}
