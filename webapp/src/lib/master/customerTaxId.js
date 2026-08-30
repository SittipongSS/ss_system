// ── เช็คลูกค้าซ้ำจากเลขประจำตัวผู้เสียภาษี ─────────────────────────────────
//
// ⭐ มติผู้ใช้ 2026-08-12: "ลูกค้า เช็คซ้ำจาก เลขประจำตัวผู้เสียภาษี" — เดิมด่านกัน
// ซ้ำตอนสร้างดูแค่รหัส AR ซึ่งเป็นเลขที่เราออกเอง ⇒ **บริษัทเดียวกันถูกเปิดซ้ำได้
// ตราบใดที่ให้รหัส AR ใหม่** เลขผู้เสียภาษีคือเลขที่กรมสรรพากรออกให้ ซึ่งเป็นตัวชี้ตัว
// นิติบุคคลจริง ๆ ตัวเดียวที่เรามี
//
// ⚠️ **ซ้ำ = เลขผู้เสียภาษี + สาขา ไม่ใช่เลขเดี่ยว ๆ** (มติผู้ใช้ 2026-08-12 ·
// ยืนยันอีกรอบ 2026-08-30) — บริษัทเดียวมีสำนักงานใหญ่ (00000) กับสาขา (00012) เป็น
// คนละสถานประกอบการโดยชอบ และ DB ตั้ง unique (taxId, branchCode) ไว้แบบนั้นตั้งแต่
// mig 0039 · ถ้าบล็อกที่เลขเดี่ยว ๆ จะบล็อกการเปิดสาขาซึ่งเป็นงานปกติ จึงแยกสองระดับ:
//
//   สาขาเดียวกัน  = ซ้ำจริง — ตีกลับพร้อมบอกว่าไปชนกับรายไหน (DB ตีกลับอยู่แล้ว
//                   แต่ข้อความจาก unique ไม่บอกว่าชนกับใคร คนกรอกจึงหาไม่เจอ)
//   คนละสาขา      = เตือนบนฟอร์ม ไม่บล็อก — คนกรอกต้องเห็นว่ามีรายเดิมอยู่ เผื่อที่จริง
//                   ตั้งใจจะแก้รายเดิม ไม่ใช่เปิดใหม่
//
// ── ทำไมต้องมี key ไม่ใช่เทียบสตริงตรง ๆ ──────────────────────────────────
// **ทั้งสองครึ่งของคีย์เก็บตามที่กรอก/นำเข้ามา** ⇒ ในฐานจริงมี '0105565024543',
// '0-1055-65024-54-3' และ '105565024543' (ศูนย์นำหน้าหายตอนผ่าน Excel) ปนกัน ส่วนช่อง
// สาขามีทั้ง '00000' และ 'สำนักงานใหญ่' · `.eq(…)` และ unique index ของ DB เทียบสตริง
// ตรง ๆ จึงมองไม่เห็นว่าซ้ำ (วัดจากฐานจริง 2026-08-30: 20/496 แถวไม่ใช่ตัวเลข 13 หลัก
// ล้วน และมีคู่ที่หลุดด่านมาแล้ว 2 คู่ — อาเตโพเล่ · แอนตี้ฮีโร่ ทั้งคู่สาขา 00000)
// ⇒ ทุกการเทียบต้องผ่าน `taxIdKey` + `branchKeyOf` ก่อนเสมอ
//
// ไม่มี import ฝั่ง server — ฟอร์มเรียกได้ตรง ๆ (แพตเทิร์นเดียวกับ masterCodes.js)
import { primaryBillingAddress } from '@/lib/master/addresses';
import { HEAD_OFFICE_BRANCH, branchValue } from '@/lib/master/thaiAddress';

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

/**
 * สาขาที่ใช้เทียบ — ครึ่งหลังของคีย์ซ้ำ
 *
 * ⚠️ ใช้ `branchValue` ไม่ใช่ `normalizeBranchCode` เปล่า ๆ: ในฐานมีทั้ง '00000',
 * ค่าว่าง และ 'สำนักงานใหญ่' ซึ่งเป็นสาขาเดียวกันทั้งหมด — ถ้าไม่ยุบให้เหลือรูปเดียว
 * บริษัทเดียวกันจะเปิดใบซ้ำที่สำนักงานใหญ่ได้ด้วยการพิมพ์ช่องสาขาเป็นคำแทนเลข
 * (ชื่อสาขาที่เป็นข้อความจริง ๆ อย่าง 'แจ้งวัฒนะ' ยังคงไว้ตามเดิม — ดู thaiAddress.js)
 */
export const branchKeyOf = (value) => branchValue(value) || HEAD_OFFICE_BRANCH;

/**
 * แยกแถวที่เลขผู้เสียภาษีตรงกัน ออกเป็นสามกอง
 *
 *   sameBranch  ใบที่ยังใช้งาน สาขาเดียวกัน = ซ้ำจริง ตีกลับ
 *   otherBranch ใบที่ยังใช้งาน คนละสาขา     = เตือน ไม่บล็อก
 *   retired     ใบที่ **พักใช้** สาขาเดียวกัน = เตือน ไม่บล็อก
 *
 * ⚠️ ใบที่พักใช้ (`isActive === false`) ต้องไม่บล็อก — ต้องตรงกับ unique index ของ DB
 * ซึ่งเป็น partial `where "isActive" is distinct from false` (mig 0318) · การยุบใบซ้ำ
 * ในทะเบียนทำด้วยการ "พักใช้" ไม่ใช่ลบทิ้ง (ลบไม่ได้ เพราะแต่ละใบถือเนื้อในของตัวเอง)
 * ⇒ ถ้าฝั่งแอปยังนับใบที่พักใช้ว่าซ้ำ จะไม่มีวันสร้างใบใหม่ให้สถานประกอบการนั้นได้อีก
 * แต่ **ต้องเตือน** เพราะคนที่กำลังจะสร้างใบใหม่ ส่วนใหญ่อยากได้ใบเดิมกลับมามากกว่า
 * ⚠️ ใบพักใช้ที่คนละสาขา ไม่ต้องรายงาน — ไม่เกี่ยวกับใบที่กำลังกรอกเลย
 *
 * @param rows แถวลูกค้าที่ดึงมาแบบหลวม ๆ (ดู taxIdMatchFilter) — กรองจริงที่นี่
 * @param taxId เลขที่กำลังจะบันทึก · branchCode สาขาของที่อยู่ออกบิลหลัก
 * @param excludeId ตัวเอง (โหมดแก้) — ไม่งั้นทุกใบจะรายงานว่าซ้ำกับตัวเอง
 */
export function splitTaxIdMatches(rows, { taxId, branchCode, excludeId = null } = {}) {
  const key = taxIdKey(taxId);
  const branch = branchKeyOf(branchCode);
  const empty = { sameBranch: [], otherBranch: [], retired: [] };
  if (!key) return empty;
  return (rows || []).reduce((acc, row) => {
    if (!row || row.id === excludeId) return acc;
    if (taxIdKey(row.taxId) !== key) return acc;
    const sameBranch = branchKeyOf(row.branchCode) === branch;
    if (row.isActive === false) {
      if (sameBranch) acc.retired.push(row);
      return acc;
    }
    acc[sameBranch ? 'sameBranch' : 'otherBranch'].push(row);
    return acc;
  }, { sameBranch: [], otherBranch: [], retired: [] });
}

/** แถวที่ใช้เลขเดียวกัน ไม่สนสาขา — ใช้ตอนที่ผู้เรียกจะแยกสาขาเอง (by-tax-id) */
export function taxIdMatches(rows, { taxId, excludeId = null } = {}) {
  const key = taxIdKey(taxId);
  if (!key) return [];
  return (rows || []).filter((row) => row && row.id !== excludeId && taxIdKey(row.taxId) === key);
}

const labelOf = (row) => [row?.arCode, row?.name].filter(Boolean).join(' — ') || 'ลูกค้าที่มีอยู่';

const nameOf = (row) => {
  const branch = branchKeyOf(row?.branchCode);
  return branch === HEAD_OFFICE_BRANCH ? labelOf(row) : `${labelOf(row)} (สาขา ${branch})`;
};

// ข้อความตีกลับตอนซ้ำจริง — **ต้องบอกว่าชนกับรายไหน** ไม่ใช่แค่ "มีในระบบแล้ว"
// (ข้อความจาก unique ของ DB บอกแค่ว่าซ้ำ คนกรอกจึงไม่รู้ว่าต้องไปแก้ใบไหน)
export function taxIdDuplicateError(rows, { branchCode } = {}) {
  if (!rows?.length) return null;
  const branch = branchKeyOf(branchCode);
  const others = rows.length > 1 ? ` (และอีก ${rows.length - 1} ราย)` : '';
  return `เลขประจำตัวผู้เสียภาษีนี้ใช้กับสาขา ${branch} อยู่แล้วที่ ${nameOf(rows[0])}${others}`
    + ' — ถ้าเป็นบริษัทเดิม ให้แก้ที่รายเดิม หรือเปลี่ยนเลขสาขาของที่อยู่ออกบิล';
}

// ข้อความเตือนตอนเจอใบเดิมที่ "พักใช้" อยู่ในสาขาเดียวกัน — ไม่บล็อก (DB ก็ไม่บล็อก)
// แต่ทางที่ถูกเกือบทุกครั้งคือเปิดใบเดิมกลับ ไม่ใช่สร้างใบใหม่ให้บริษัทเดิมอีกรอบ
export function taxIdRetiredWarning(rows) {
  if (!rows?.length) return null;
  const list = rows.slice(0, 3).map(labelOf).join(' · ');
  const more = rows.length > 3 ? ` และอีก ${rows.length - 3} ราย` : '';
  return `เลขนี้เคยมีในระบบแต่ถูกพักใช้ไว้: ${list}${more}`
    + ' — ถ้าเป็นบริษัทเดิม ให้เปิดใช้ใบเดิมกลับแทนการสร้างใบใหม่';
}

// ข้อความเตือนบนฟอร์มตอนเลขตรงแต่คนละสาขา — ไม่บล็อก
export function taxIdOtherBranchWarning(rows) {
  if (!rows?.length) return null;
  // สาขาต้องขึ้นทุกแถวที่นี่ (รวมสำนักงานใหญ่) — คำเตือนนี้พูดเรื่อง "คนละสาขา" อยู่
  const list = rows.slice(0, 3)
    .map((row) => `${labelOf(row)} (สาขา ${branchKeyOf(row.branchCode)})`).join(' · ');
  const more = rows.length > 3 ? ` และอีก ${rows.length - 3} ราย` : '';
  return `เลขนี้มีลูกค้าในระบบแล้ว: ${list}${more} — บันทึกต่อได้ถ้าเป็นคนละสาขา`;
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
