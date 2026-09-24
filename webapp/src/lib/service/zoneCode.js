// ── รหัสโซน `ZN-CCCC-DDDDD` (มติผู้ใช้ 2026-08-29 · ตัดท่อนชั้นออก 2026-09-24) ──────────
//
//   CCCC  = เลขรันของ **ไซต์** (ท่อนท้ายของรหัส ST) — โซนอ่านออกทันทีว่าอยู่ไซต์ไหน
//   DDDDD = เลขรัน **นับยาวตัวเดียวทั้งระบบ ไม่รีเซ็ตตามไซต์** (มติผู้ใช้: "นับเลขรันไปเรื่อย ๆ")
//           เริ่ม 10001
//
// ⭐ **ไม่มีชั้นในรหัสแล้ว** (มติผู้ใช้ 2026-09-24: *"รหัสโซน ตัด FF ชั้นออกเลยดีกว่า"*) —
//   รูปเดิม `ZN-CCCC-FF-DDDDD` ผูกชั้นไว้กับตัวตน ⇒ ชั้นที่ไม่อยู่ในชุดมาตรฐาน (LG · P1 · 12A)
//   ต้องไปยืดความกว้างของรหัส และย้ายชั้นทีหลังแล้วรหัสยังอ่านว่าชั้นเก่า · ตอนนี้ชั้นเป็นแค่
//   คอลัมน์ `floor` ของโซน แก้ได้ตลอดโดยรหัสไม่เกี่ยว
//   ⚠️ mig 0384 เขียนรหัสเดิมทุกโซนเป็นรูปใหม่ (ตัดท่อนที่ 3 ทิ้ง) — ทำได้เพราะ DDDDD ไม่ซ้ำทั้งระบบ
//      อยู่แล้ว และรหัสโซนไม่เคยถูกตรึงลงเอกสารที่ออกไป (QT/SO ใช้รหัสไซต์ + ชื่อโซน)
//
// 🔴 **ความกว้างของเลขรันคือเพดานจริง ไม่ใช่แค่รูปแบบ** — ตัวออกรหัส
// (`create_entity_rows_with_code`) โยน `entity_monthly_sequence_exhausted` ทันทีที่
// เลขเกิน `10^width - 1` ⇒ เลขรันที่นับรวมทั้งระบบ 3 หลักจะตันที่โซนที่ 1000
// (บริษัทมีจุดติดตั้งแล้ว 380 จุด) · ผู้ใช้จึงเลือก 5 หลักในรอบตัดสิน 2026-08-29
//
// ⚠️ **ชั้นยังบังคับกรอกทุกโซน** — ไม่ได้เป็นท่อนของรหัสแล้ว แต่เป็นสิ่งที่ช่างใช้หาโซนหน้างาน
// (มติ 24/09 ตัดออกจากรหัสอย่างเดียว ไม่ได้ปลดการบังคับ)
import { SITE_CODE_HINT, siteRunOf } from '@/lib/service/siteCode';

export const ZONE_CODE_PREFIX = 'ZN';
export const ZONE_RUN_WIDTH = 5;
export const ZONE_RUN_START = 10000;           // ใบแรกได้ 10001
/** ถังนับเลขรันโซน — `'-'` = ตัวเดียวทั้งระบบ (มติ "นับไปเรื่อย ๆ") */
export const ZONE_RUN_BUCKET = '-';

export const ZONE_CODE_RE = /^ZN-\d{4}-\d{5}$/;
/** รูปเดิมก่อนมติ 2026-08-29 (`ZN-YYMMNNNN`) — อ่านของเก่าเท่านั้น */
export const LEGACY_ZONE_CODE_RE = /^ZN-\d{8}$/;
/** รูปที่มีท่อนชั้น (2026-08-29 → 2026-09-24) — mig 0384 เขียนทุกแถวเป็นรูปใหม่แล้ว เหลือไว้อ่านของที่หลุด */
export const FLOORED_ZONE_CODE_RE = /^ZN-\d{4}-[0-9A-Z]{2,3}-\d{5}$/;

export const ZONE_CODE_HINT = 'ZN-CCCC-DDDDD';

/* ชั้นพิเศษที่ไม่ใช่ตัวเลข — ชิปลัดบนฟอร์ม (ชุดที่เจอบ่อย ไม่ใช่ชุดทั้งหมดที่รับ)
   ⚠️ คำที่คนพิมพ์แทนชั้นพวกนี้ ('G' 'g' 'ชั้น G' 'GF') ถูกแปลงเป็นค่าเดียวที่ `ALIASES`
      ไม่งั้นได้หลายสะกดปนกันในอาคารเดียวกัน (ชิปลัด · ป้าย · การเรียงชั้นใช้ค่าเดียวกัน)
   ⭐ ชั้นที่ไม่อยู่ในชุดนี้ **พิมพ์เองได้** (มติผู้ใช้ 2026-09-24: "เพิ่มชั้นเองได้ เผื่อตัวเลือก
      ไม่มี") — ดู `CUSTOM_FLOOR_RE` */
export const SPECIAL_FLOORS = [
  { value: 'GF', label: 'G — ชั้นล่าง' },
  { value: 'MZ', label: 'M — ชั้นลอย' },
  { value: 'B1', label: 'B1 — ใต้ดินชั้น 1' },
  { value: 'B2', label: 'B2 — ใต้ดินชั้น 2' },
  { value: 'RF', label: 'RF — ดาดฟ้า' },
];

const SPECIAL_VALUES = new Set([...SPECIAL_FLOORS.map((f) => f.value), 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B9']);

/* คำที่คนพิมพ์จริงเวลาหมายถึงชั้นพิเศษ → ค่ามาตรฐาน
   ⭐ รับทั้ง 'G' 'g' 'GF' 'ชั้น G' — คนกรอกไม่ควรต้องจำว่าระบบสะกดยังไง */
const ALIASES = new Map([
  ['G', 'GF'], ['GF', 'GF'], ['GROUND', 'GF'], ['ชั้นG', 'GF'], ['ชั้นล่าง', 'GF'],
  ['M', 'MZ'], ['MZ', 'MZ'], ['MEZZANINE', 'MZ'], ['ชั้นลอย', 'MZ'],
  ['R', 'RF'], ['RF', 'RF'], ['ROOF', 'RF'], ['ดาดฟ้า', 'RF'],
]);

/* ── ชั้นที่ไม่อยู่ในรายการ — พิมพ์เองได้ (มติผู้ใช้ 2026-09-24 · mig 0384) ──────────
   ของจริงที่ชุดเดิมรับไม่ได้: LG/UG (ห้างที่มีชั้นใต้-เหนือ G) · P1–P9 (ชั้นจอดรถ) ·
   12A/14A (ตึกที่ข้ามชั้น 13) · M2 (ชั้นลอยที่สอง)
   ⭐ รูป: **อังกฤษพิมพ์ใหญ่/ตัวเลข 2–3 ตัว และต้องมีตัวอักษรอย่างน้อยหนึ่งตัว**
   ⚠️ ต้องมีตัวอักษร — ตัวเลขล้วนเป็นของชั้น 01–99 ที่เติมศูนย์ให้อยู่แล้ว ปล่อย '4' กับ '04'
      เป็นสองค่าเมื่อไร ชั้นเดียวกันกลายเป็นสองชิป สองป้าย
   ⚠️ อังกฤษเท่านั้น — รูปสั้นแบบป้ายลิฟต์ที่คนอ่านตรงกันทุกไซต์ · ภาษาไทยแปลงเป็นค่ามาตรฐาน
      ได้เฉพาะคำใน `ALIASES` (ชั้นไม่อยู่ในรหัสโซนแล้วตั้งแต่ 24/09 แต่รูปยังต้องเป็นรูปเดียว)
   ⚠️ ฐานข้อมูลกันด้วยกติกาเดียวกัน (`service_zones_floor_format` · mig 0384) */
export const CUSTOM_FLOOR_RE = /^(?=[A-Z0-9]{2,3}$)[0-9]*[A-Z][A-Z0-9]*$/;
export const FLOOR_FORMAT_HINT = 'ตัวเลข 1–99 · G · M · B1–B9 · RF หรือพิมพ์ชั้นเองเป็นอังกฤษ/ตัวเลข 2–3 ตัว เช่น LG · UG · P1 · 12A';

/**
 * ชั้นในรูปมาตรฐาน (2–3 ตัวอักษร) — คืน `{ value, error }`
 *
 * รับ: `4` `04` `'4'` `4F` `F4` → `'04'` · `G` `ชั้น G` → `'GF'` · `B1` → `'B1'` · `lg` → `'LG'`
 * ⚠️ ชั้น 0 ไม่มีในโลกจริง (ชั้นล่างคือ GF หรือ 01) — ตีกลับ ไม่ใช่แปลงเงียบ ๆ
 */
export function normalizeFloor(value) {
  const raw = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return { value: null, error: 'ต้องระบุชั้นของพื้นที่' };

  const alias = ALIASES.get(raw) || ALIASES.get(raw.replace(/^ชั้น/, ''));
  if (alias) return { value: alias, error: null };

  if (SPECIAL_VALUES.has(raw)) return { value: raw, error: null };

  const body = raw.replace(/^ชั้น/, '');
  /* ชั้นตัวเลข — รับรูปที่คนเขียนจริง: '4' · 'F4' · 'FL4' · '4F' (แบบป้ายลิฟต์) */
  const numbered = /^(?:FL?)?(\d{1,2})F?$/.exec(body);
  if (numbered) {
    const no = Number(numbered[1]);
    if (no >= 1 && no <= 99) return { value: String(no).padStart(2, '0'), error: null };
    // '0F' · 'F0' คือชั้น 0 ในรูปป้ายลิฟต์ — ห้ามหลุดไปเป็น "ชั้นที่พิมพ์เอง" ชื่อ 0F
    return { value: null, error: `ชั้นต้องเป็น${FLOOR_FORMAT_HINT}` };
  }
  /* ชั้นที่พิมพ์เอง — ตัดศูนย์นำหน้าตัวเลข ('03A' กับ '3A' คือชั้นเดียวกัน) */
  const custom = body.replace(/^0+(?=\d)/, '');
  if (CUSTOM_FLOOR_RE.test(custom)) return { value: custom, error: null };
  return { value: null, error: `ชั้นต้องเป็น${FLOOR_FORMAT_HINT}` };
}

/** ป้ายชั้นที่คนอ่าน — `'04'` → `'ชั้น 4'` · `'GF'` → `'ชั้น G'` */
export function floorLabel(floor) {
  const value = String(floor ?? '').trim().toUpperCase();
  if (!value) return null;
  if (value === 'GF') return 'ชั้น G';
  if (value === 'MZ') return 'ชั้นลอย';
  if (value === 'RF') return 'ดาดฟ้า';
  if (/^B\d{1,2}$/.test(value)) return `ชั้นใต้ดิน ${Number(value.slice(1))}`;
  if (/^\d{2}$/.test(value)) return `ชั้น ${Number(value)}`;
  // ชั้นที่พิมพ์เอง (LG · P1 · 12A) — อ่านว่า "ชั้น LG" ไม่ใช่รหัสลอย ๆ
  return `ชั้น ${value}`;
}

/* ชิปลัดของช่องชั้น = ชั้นพิเศษที่เจอบ่อย + **ชั้นที่ไซต์นี้ใช้อยู่แล้ว** (โซนอื่นของไซต์เดียวกัน)
   ⭐ ชั้นที่พิมพ์เองครั้งแรก (LG · P1) กลายเป็นชิปให้โซนถัดไปในไซต์เดียวกันกดได้เลย —
      ตึกหนึ่งมีไม่กี่ชั้น แต่มีหลายโซนต่อชั้น (มติผู้ใช้ 2026-09-24 "เพิ่มชั้นเองได้")
   ⚠️ ค่าที่ไม่ผ่าน `normalizeFloor` ไม่ขึ้นเป็นชิป (ค่าเก่าผิดรูปจะกลายเป็นทางลัดไปสู่ error) */
export const FLOOR_CHIP_EXTRA_MAX = 12;
export function floorChipOptions(knownFloors = []) {
  const special = SPECIAL_FLOORS.map((f) => ({ value: f.value, label: f.label }));
  const seen = new Set(special.map((f) => f.value));
  const extra = [];
  for (const raw of knownFloors || []) {
    const { value } = normalizeFloor(raw);
    if (!value || seen.has(value)) continue;
    seen.add(value);
    extra.push({ value, label: floorLabel(value) });
  }
  // ตัวเลขก่อน (02 · 03 · 12A) แล้วตัวอักษร (LG · P1) · ตึกสูงที่มีโซนหลายสิบชั้นตัดที่เพดาน —
  // ชิปมีไว้ลัด ไม่ใช่รายการทุกชั้น (ที่เหลือยังพิมพ์ได้ตามปกติ)
  extra.sort((a, b) => a.value.localeCompare(b.value, 'en', { numeric: true }));
  return [...special, ...extra.slice(0, FLOOR_CHIP_EXTRA_MAX)];
}

/**
 * ท่อนหน้าเลขรันของรหัสโซน — คืน `{ prefix, error }`
 *
 * ⚠️ ต้องใช้ **รหัสไซต์รูปใหม่** เท่านั้น — ไซต์ที่ยังเป็นรหัสเดิม (SS-…) ไม่มีเลขรัน
 * 4 หลักให้อ้าง ⇒ บอกให้ไปออกรหัสไซต์ใหม่ก่อน ไม่ใช่เดาเลขขึ้นมาเอง
 * ⭐ ไม่รับชั้นแล้ว (มติ 2026-09-24) — ชั้นตรวจที่ `normalizeZoneInput` ในฐานะช่องบังคับของโซน
 */
export function zoneCodePrefix({ siteCode } = {}) {
  const run = siteRunOf(siteCode);
  if (!run) {
    return {
      prefix: null,
      error: `ไซต์ ${String(siteCode || '').trim() || 'นี้'} ยังไม่มีรหัสรูปแบบใหม่ (${SITE_CODE_HINT}) — ออกรหัสไซต์ใหม่ก่อนจึงเพิ่มพื้นที่ได้`,
    };
  }
  return { prefix: `${ZONE_CODE_PREFIX}-${run}-`, error: null };
}

/** แกะรหัสโซนเป็นส่วน ๆ — ไว้ให้จอ/รายงานอ่านความหมายโดยไม่ต้องรู้รูปแบบเอง
    (รูปมีท่อนชั้นของช่วง 29/08–24/09 อ่านได้ด้วย — ท่อนชั้นทิ้งไป เพราะชั้นจริงอยู่ที่คอลัมน์ `floor`) */
export function parseZoneCode(zoneCode) {
  const code = String(zoneCode ?? '').trim().toUpperCase();
  if (ZONE_CODE_RE.test(code)) {
    const [, site, run] = code.split('-');
    return { site, run };
  }
  if (FLOORED_ZONE_CODE_RE.test(code)) {
    const [, site, , run] = code.split('-');
    return { site, run };
  }
  return null;
}
