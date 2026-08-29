// ── รหัสโซน `ZN-CCCC-FF-DDDDD` (มติผู้ใช้ 2026-08-29) ──────────────────────
//
//   CCCC  = เลขรันของ **ไซต์** (ท่อนท้ายของรหัส ST) — โซนอ่านออกทันทีว่าอยู่ไซต์ไหน
//   FF    = ชั้น
//   DDDDD = เลขรัน **นับยาวตัวเดียวทั้งระบบ ไม่รีเซ็ตตามไซต์หรือชั้น** (มติผู้ใช้:
//           "นับเลขรันไปเรื่อย ๆ") เริ่ม 10001
//
// 🔴 **ความกว้างของเลขรันคือเพดานจริง ไม่ใช่แค่รูปแบบ** — ตัวออกรหัส
// (`create_entity_rows_with_code`) โยน `entity_monthly_sequence_exhausted` ทันทีที่
// เลขเกิน `10^width - 1` ⇒ เลขรันที่นับรวมทั้งระบบ 3 หลักจะตันที่โซนที่ 1000
// (บริษัทมีจุดติดตั้งแล้ว 380 จุด) · ผู้ใช้จึงเลือก 5 หลักในรอบตัดสิน 2026-08-29
//
// ⚠️ **ชั้นบังคับกรอกทุกโซน** (มติผู้ใช้) — เพราะมันเป็นส่วนหนึ่งของ *ตัวตน* ของโซน
// ไม่ใช่ข้อมูลประกอบ · โซนที่ไม่รู้ชั้นจะออกรหัสไม่ได้เลย
//
// 🔴 **ชั้นเปลี่ยนทีหลังไม่แก้รหัส** — เหตุผลเดียวกับรหัสไซต์ (ดู siteCode.js):
// รหัสคือตัวตน ไม่ใช่สรุปสถานะปัจจุบัน · ย้ายโซนขึ้นชั้นใหม่ = แก้คอลัมน์ `floor`
// แล้วรหัสเดิมยังอ่านว่าชั้นเก่า ซึ่งตรงกับเอกสารที่ออกไปแล้ว
import { SITE_CODE_HINT, siteRunOf } from '@/lib/service/siteCode';

export const ZONE_CODE_PREFIX = 'ZN';
export const ZONE_RUN_WIDTH = 5;
export const ZONE_RUN_START = 10000;           // ใบแรกได้ 10001
/** ถังนับเลขรันโซน — `'-'` = ตัวเดียวทั้งระบบ (มติ "นับไปเรื่อย ๆ") */
export const ZONE_RUN_BUCKET = '-';

export const ZONE_CODE_RE = /^ZN-\d{4}-(0[1-9]|[1-9]\d|B[1-9]|GF|MZ|RF)-\d{5}$/;
/** รูปเดิมก่อนมติ 2026-08-29 (`ZN-YYMMNNNN`) — อ่านของเก่าเท่านั้น */
export const LEGACY_ZONE_CODE_RE = /^ZN-\d{8}$/;

export const ZONE_CODE_HINT = 'ZN-CCCC-FF-DDDDD';

/* ชั้นพิเศษที่ไม่ใช่ตัวเลข — ชุดปิด ไม่ใช่ช่องพิมพ์อิสระ
   ⚠️ ปล่อยให้พิมพ์เองเมื่อไรจะได้ 'G' 'g' 'ชั้น G' 'GF' ปนกันในรหัสของอาคารเดียวกัน */
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

/**
 * ชั้นในรูปที่รหัสใช้ (2 ตัวอักษร) — คืน `{ value, error }`
 *
 * รับ: `4` `04` `'4'` → `'04'` · `G` `ชั้น G` → `'GF'` · `B1` → `'B1'`
 * ⚠️ ชั้น 0 ไม่มีในโลกจริง (ชั้นล่างคือ GF หรือ 01) — ตีกลับ ไม่ใช่แปลงเงียบ ๆ
 */
export function normalizeFloor(value) {
  const raw = String(value ?? '').trim().toUpperCase().replace(/\s+/g, '');
  if (!raw) return { value: null, error: 'ต้องระบุชั้นของพื้นที่ — ชั้นเป็นส่วนหนึ่งของรหัสโซน' };

  const alias = ALIASES.get(raw) || ALIASES.get(raw.replace(/^ชั้น/, ''));
  if (alias) return { value: alias, error: null };

  if (SPECIAL_VALUES.has(raw)) return { value: raw, error: null };

  const digits = raw.replace(/^ชั้น/, '').replace(/^F/, '');
  if (/^\d{1,2}$/.test(digits)) {
    const no = Number(digits);
    if (no >= 1 && no <= 99) return { value: String(no).padStart(2, '0'), error: null };
  }
  return {
    value: null,
    error: 'ชั้นต้องเป็นตัวเลข 1–99 หรือชั้นพิเศษ (G · M · B1–B9 · RF)',
  };
}

/** ป้ายชั้นที่คนอ่าน — `'04'` → `'ชั้น 4'` · `'GF'` → `'ชั้น G'` */
export function floorLabel(floor) {
  const value = String(floor ?? '').trim().toUpperCase();
  if (!value) return null;
  if (value === 'GF') return 'ชั้น G';
  if (value === 'MZ') return 'ชั้นลอย';
  if (value === 'RF') return 'ดาดฟ้า';
  if (/^B\d$/.test(value)) return `ชั้นใต้ดิน ${value.slice(1)}`;
  if (/^\d{2}$/.test(value)) return `ชั้น ${Number(value)}`;
  return value;
}

/**
 * ท่อนหน้าเลขรันของรหัสโซน — คืน `{ prefix, error }`
 *
 * ⚠️ ต้องใช้ **รหัสไซต์รูปใหม่** เท่านั้น — ไซต์ที่ยังเป็นรหัสเดิม (SS-…) ไม่มีเลขรัน
 * 4 หลักให้อ้าง ⇒ บอกให้ไปออกรหัสไซต์ใหม่ก่อน ไม่ใช่เดาเลขขึ้นมาเอง
 */
export function zoneCodePrefix({ siteCode, floor } = {}) {
  const run = siteRunOf(siteCode);
  if (!run) {
    return {
      prefix: null,
      error: `ไซต์ ${String(siteCode || '').trim() || 'นี้'} ยังไม่มีรหัสรูปแบบใหม่ (${SITE_CODE_HINT}) — ออกรหัสไซต์ใหม่ก่อนจึงเพิ่มพื้นที่ได้`,
    };
  }
  const { value, error } = normalizeFloor(floor);
  if (error) return { prefix: null, error };
  return { prefix: `${ZONE_CODE_PREFIX}-${run}-${value}-`, error: null };
}

/** แกะรหัสโซนเป็นส่วน ๆ — ไว้ให้จอ/รายงานอ่านความหมายโดยไม่ต้องรู้รูปแบบเอง */
export function parseZoneCode(zoneCode) {
  const code = String(zoneCode ?? '').trim().toUpperCase();
  if (!ZONE_CODE_RE.test(code)) return null;
  const [, site, floor, run] = code.split('-');
  return { site, floor, run };
}
