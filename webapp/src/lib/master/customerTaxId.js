// ── เช็คลูกค้าซ้ำจากเลขประจำตัวผู้เสียภาษี ─────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-12: "ลูกค้า เช็คซ้ำจาก เลขประจำตัวผู้เสียภาษี" — เดิมด่านกัน
// ซ้ำตอนสร้างดูแค่รหัส AR ซึ่งเป็นเลขที่เราออกเอง ⇒ **บริษัทเดียวกันถูกเปิดซ้ำได้
// ตราบใดที่ให้รหัส AR ใหม่** เลขผู้เสียภาษีคือเลขที่กรมสรรพากรออกให้ ซึ่งเป็นตัวชี้ตัว
// นิติบุคคลจริง ๆ ตัวเดียวที่เรามี
//
// ⭐ มติผู้ใช้ 2026-08-30: **เลขซ้ำไม่ได้เลย ไม่แยกสาขา** — รอบ 12/08 ยอมให้เลขเดียวกัน
// อยู่หลายใบถ้าคนละเลขสาขา (unique (taxId, branchCode), mig 0039) เพราะตอนนั้นถือว่า
// "สาขา = ลูกค้าคนละแถว" · ตั้งแต่ mig 0202 ลูกค้าหนึ่งรายถือที่อยู่ได้หลายรายการและ
// เลขสาขาอยู่บนที่อยู่ ⇒ การเปิดใบใหม่เพื่อสาขาไม่ใช่วิธีทำงานอีกต่อไป และเป็นทางที่
// ทำให้บริษัทเดียวมีหลายใบจนยอดขาย/เครดิตกระจาย · สาขาใหม่ = เพิ่ม "ที่อยู่" ในใบเดิม
//
// ── ทำไมต้องมี key ไม่ใช่เทียบสตริงตรง ๆ ──────────────────────────────────
// คอลัมน์ `taxId` เก็บตามที่กรอก/นำเข้ามา ⇒ ในฐานจริงมีทั้ง '0105565024543',
// '0-1055-65024-54-3' และ '105565024543' (ศูนย์นำหน้าหายตอนผ่าน Excel) ซึ่งเป็น
// **บริษัทเดียวกัน** แต่ทั้ง `.eq('taxId', …)` และ unique index ของ DB เทียบสตริงตรง ๆ
// จึงมองไม่เห็นว่าซ้ำ (วัดจากฐานจริง 2026-08-30: 20/496 แถวไม่ใช่ตัวเลข 13 หลักล้วน
// และมีคู่ซ้ำที่หลุดด่านมาแล้วจริง) ⇒ ทุกการเทียบต้องผ่าน `taxIdKey` ก่อนเสมอ
//
// ไม่มี import ฝั่ง server — ฟอร์มเรียกได้ตรง ๆ (แพตเทิร์นเดียวกับ masterCodes.js)
import { primaryBillingAddress } from '@/lib/master/addresses';
import { HEAD_OFFICE_BRANCH, normalizeBranchCode } from '@/lib/master/thaiAddress';

export const TAX_ID_LENGTH = 13;

// เก็บเป็นตัวเลขล้วน (MaskedNumberInput ส่งเฉพาะตัวเลข) — แต่ค่ายุคเก่า/ค่าที่นำเข้า
// มีขีดคั่นได้ จึงถอดทุกอย่างที่ไม่ใช่ตัวเลขก่อนเทียบเสมอ ไม่งั้น '0105560000069'
// กับ '0-1055-60000-06-9' จะกลายเป็นคนละบริษัท
export const taxIdDigits = (value) => String(value ?? '').replace(/\D/g, '');

const alphanumeric = (value) => String(value ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '');

/**
 * คีย์ที่ใช้เทียบว่า "เลขเดียวกันไหม" — ทุกด่าน (ฟอร์ม/API/สคริปต์) ต้องเทียบด้วยตัวนี้
 *
 * - ถอดขีด/เว้นวรรคทิ้ง
 * - 12 หลักล้วน = ศูนย์นำหน้าหาย (ไฟล์นำเข้าที่ผ่าน Excel) ⇒ เติม '0' คืนก่อนเทียบ
 *   ไม่งั้น '105566074315' กับ '0105566074315' เป็นคนละบริษัทตลอดกาล
 * - มีตัวอักษร = เลขต่างชาติ/พาสปอร์ต ⇒ เทียบทั้งก้อนแบบตัวพิมพ์ใหญ่ (ถอดตัวเลข
 *   ออกมาเทียบไม่ได้ 'PA0374073' จะเหลือ '0374073' ซึ่งไปชนเลขอื่นได้)
 */
export function taxIdKey(value) {
  const raw = alphanumeric(value);
  if (!raw) return '';
  if (!/^\d+$/.test(raw)) return raw;
  return raw.length === TAX_ID_LENGTH - 1 ? `0${raw}` : raw;
}

/**
 * รูปที่เขียนลงฐาน — ตัวเลขล้วนถ้าเป็นเลขไทย · ค่าที่มีตัวอักษรเก็บตามที่กรอก
 * (ห้ามถอดตัวอักษรทิ้ง: แถวต่างชาติที่มีอยู่จะกลายเป็นเลขคนละตัวเงียบ ๆ ตอนกดบันทึก)
 */
export function taxIdStore(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  return /[A-Za-z]/.test(text) ? text : (taxIdDigits(text) || null);
}

// "กรอกครบแล้ว" = พร้อมเอาไปถามฐานว่าซ้ำไหม · เลขไทยต้องครบ 13 หลัก ส่วนเลขต่างชาติ
// ไม่มีความยาวตายตัว จึงเอาแค่ยาวพอที่จะไม่ใช่การพิมพ์ค้างกลางคัน
export const isCompleteTaxId = (value) => {
  const key = taxIdKey(value);
  if (!key) return false;
  return /^\d+$/.test(key) ? key.length === TAX_ID_LENGTH : key.length >= 5;
};

/**
 * นิติบุคคล/บุคคลไทยไหม — ดูจาก **ที่อยู่ออกเอกสารหลัก** ว่าเลือกจังหวัดจากทะเบียนไทย
 * หรือเปล่า (ที่อยู่ต่างประเทศเป็นข้อความล้วน ไม่มี provinceCode)
 *
 * ⚠️ ไม่มีคอลัมน์ "ประเทศ" ในทะเบียนลูกค้า และเลข 13 หลักคือเลขที่ **กรมสรรพากรไทย**
 * ออกให้ ⇒ ที่อยู่คือสัญญาณเดียวที่มีอยู่จริง · ไม่รู้ = ถือว่าไทย (ค่าตั้งต้นของระบบ)
 * ยกเว้นที่อยู่ที่พิมพ์เองล้วน ๆ ซึ่งปล่อยผ่านด่านรูปแบบไป — ด่านกันซ้ำยังคุมทุกกรณี
 */
export function isThaiTaxEntity(addresses) {
  const billing = primaryBillingAddress(addresses || []);
  if (!billing) return true;
  return Boolean(String(billing.provinceCode || '').trim() || String(billing.province || '').trim());
}

/**
 * ด่านรูปแบบ (มติผู้ใช้ 2026-08-30: บังคับ 13 หลักเฉพาะลูกค้าไทย)
 * null = ผ่าน · ค่าว่างผ่านเสมอ (ช่องนี้ยังไม่บังคับกรอก — ลูกค้าบางรายไม่มีเลข)
 */
export function taxIdFormatError(value, { thaiEntity = true } = {}) {
  const text = String(value ?? '').trim();
  if (!text || !thaiEntity) return null;
  if (/[A-Za-z]/.test(text)) return 'เลขของลูกค้าไทยต้องเป็นตัวเลขล้วน 13 หลัก';
  return taxIdDigits(text).length === TAX_ID_LENGTH
    ? null
    : `กรอกให้ครบ ${TAX_ID_LENGTH} หลัก (ตอนนี้ ${taxIdDigits(text).length} หลัก)`;
}

// สาขาที่ใช้เทียบ — ไม่ระบุ = สำนักงานใหญ่ (ความหมายเดิมของ '00000' และเป็นค่าที่
// legacyAddressMirror เขียนลงคอลัมน์จริงเสมอ) · ตั้งแต่ 2026-08-30 สาขาไม่ใช่ส่วนหนึ่ง
// ของคีย์ซ้ำแล้ว แต่ยังใช้บอกในข้อความว่าใบที่ไปชนเป็นสาขาไหน
export const branchKeyOf = (value) => normalizeBranchCode(value) || HEAD_OFFICE_BRANCH;

/**
 * แถวที่ใช้เลขเดียวกัน (คีย์เดียวกัน) — ซ้ำทันทีไม่ว่าสาขาไหน
 *
 * @param rows แถวลูกค้าที่ดึงมาแบบหลวม ๆ (ดู taxIdMatchFilter) — กรองจริงที่นี่
 * @param taxId เลขที่กำลังจะบันทึก · excludeId ตัวเอง (โหมดแก้) ไม่งั้นทุกใบซ้ำกับตัวเอง
 */
export function taxIdMatches(rows, { taxId, excludeId = null } = {}) {
  const key = taxIdKey(taxId);
  if (!key) return [];
  return (rows || []).filter((row) => row && row.id !== excludeId && taxIdKey(row.taxId) === key);
}

const nameOf = (row) => {
  const label = [row?.arCode, row?.name].filter(Boolean).join(' — ') || 'ลูกค้าที่มีอยู่';
  const branch = branchKeyOf(row?.branchCode);
  return branch === HEAD_OFFICE_BRANCH ? label : `${label} (สาขา ${branch})`;
};

// ข้อความตีกลับตอนซ้ำ — **ต้องบอกว่าชนกับรายไหน** ไม่ใช่แค่ "มีในระบบแล้ว" (ข้อความ
// จาก unique ของ DB บอกแค่ว่าซ้ำ คนกรอกจึงไม่รู้ว่าต้องไปแก้ใบไหน) และต้องบอกทางออก
// ของเคสที่เจอบ่อยที่สุด: กำลังจะเปิดใบใหม่ให้ "สาขา" ของบริษัทที่มีอยู่แล้ว
export function taxIdDuplicateError(rows) {
  if (!rows?.length) return null;
  const others = rows.length > 1 ? ` (และอีก ${rows.length - 1} ราย)` : '';
  return `เลขประจำตัวผู้เสียภาษีนี้มีอยู่แล้วที่ ${nameOf(rows[0])}${others}`
    + ' — หนึ่งเลขมีได้ใบเดียว ถ้าเป็นสาขาของบริษัทเดิม ให้เพิ่มเป็นที่อยู่อีกรายการในใบเดิมแทน';
}

/**
 * ตัวกรอง PostgREST สำหรับดึง "แถวที่อาจเป็นเลขเดียวกัน" — ใช้คู่กับ taxIdMatches เสมอ
 *
 * ⚠️ PostgREST กรองด้วย expression (regexp_replace) ไม่ได้ และในฐานมีค่าที่เก็บคนละรูป
 * (มีขีด/ศูนย์นำหน้าหาย) ⇒ ดึงแบบ **หลวมไว้ก่อนแล้วกรองซ้ำใน JS**:
 *   - eq คีย์เต็ม (รูปปกติ)
 *   - eq คีย์ที่ตัดศูนย์นำหน้า (แถวที่ผ่าน Excel มา)
 *   - like ที่ใส่ wildcard คั่นทุกหลัก (รูปที่มีขีด/เว้นวรรค) — กว้างเกินจริงได้ ซึ่ง
 *     ไม่เป็นไรเพราะ taxIdMatches ตัดตัวที่คีย์ไม่ตรงทิ้งอยู่แล้ว
 */
export function taxIdMatchFilter(value) {
  const key = taxIdKey(value);
  if (!key) return null;
  const terms = [`taxId.eq.${key}`];
  if (/^\d+$/.test(key)) {
    if (key.startsWith('0')) terms.push(`taxId.eq.${key.slice(1)}`);
    terms.push(`taxId.like.*${key.split('').join('*')}*`);
  }
  return terms.join(',');
}
