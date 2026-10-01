// ── จอทะเบียนขนาดแพ็คเกจ — ตัวตัดสินล้วนของฟอร์ม · ตัวกรอง · กล่องยืนยันลบ (mig 0398) ─────────
//
// ⭐ **ฟอร์มเพิ่ม = ฟอร์มแก้** (`PackageSizeModal` ใบเดียว · กฎ AGENTS.md) — ไฟล์นี้ถือทรงของฟอร์มและการแปลงเป็น
//   คำขอ ⇒ สองโหมดส่ง payload ทรงเดียวกันเสมอ และด่านของฟอร์มคือ `packageSizeError` ตัวเดียวกับ route
//
// ⚠️ **ช่องช่วง ลบ.ม. เว้นว่าง ≠ ไม่มีเพดาน** — `normalizePackageSizeInput` อ่านค่าว่างเป็น `null` (ไม่มีเพดาน) ซึ่งถูกสำหรับ
//   API แต่บนฟอร์มคือกับดัก: คนเลือก "ไม่เกิน … ลบ.ม." แล้วลืมพิมพ์ตัวเลข จะได้ขนาดไม่มีเพดานโดยไม่ตั้งใจ
//   (หรือได้ข้อความ "มีขนาดไม่มีเพดานอยู่แล้ว" ที่ไม่ตรงกับสิ่งที่เขาทำ) ⇒ ฟอร์มถือ "ไม่มีเพดาน" เป็น **ตัวเลือกที่กดเอง**
//   และตีกลับช่องว่างก่อนถึงด่านกลาง
//
// ⚠️ ไฟล์นี้ไม่รู้จัก React และไม่ยิง API — จอถือ state · ไฟล์นี้ตอบว่าวาดอะไร ส่งอะไร และกดได้หรือยัง
import { fmtNumber } from '@/lib/format';
import {
  normalizePackageSizeCode, packageSizeBandText, packageSizeError, packageSizeUsageText, sortPackageSizes,
} from './packageSizes.js';

const text = (value) => String(value ?? '').trim();
const isSuggested = (size) => size?.autoSuggest !== false;

/** วิธีเลือกขนาด — สองตัวเลือกตายตัว = แผ่นเลือก (กติกาคอนโทรล: ชุดเล็กต้องกางให้เห็น) */
export const PACKAGE_SIZE_PICK_OPTIONS = [
  { value: 'auto', label: 'ระบบเสนอจาก ลบ.ม.', description: 'ระบบเสนอขนาดนี้ให้หัวหน้าตามปริมาตรของพื้นที่' },
  { value: 'manual', label: 'หัวหน้าเลือกเอง', description: 'ระบบไม่เสนอ — ใช้กับพื้นที่ที่ดูจากปริมาตรไม่ออก เช่น ห้องน้ำ' },
];

/** ช่วงพื้นที่ของขนาดที่ระบบเสนอ — มีเพดาน หรือรับทุกอย่างที่เกินช่วงใหญ่สุด (มีได้ขนาดเดียว) */
export const PACKAGE_SIZE_BAND_OPTIONS = [
  { value: 'max', label: 'ไม่เกิน … ลบ.ม.', description: 'ระบบเสนอเมื่อปริมาตรไม่เกินตัวเลขนี้' },
  { value: 'open', label: 'ไม่มีเพดาน', description: 'รับทุกพื้นที่ที่ใหญ่กว่าช่วงอื่น — มีได้ขนาดเดียว' },
];

/** ฟอร์มเปล่าของโหมดเพิ่ม — ตั้งต้นเป็น "ระบบเสนอ · มีเพดาน" (ทรงที่พบบ่อยที่สุดของขนาดใหม่) */
export function emptyPackageSizeForm() {
  return { code: '', nameEn: '', pick: 'auto', band: 'max', maxCbm: '', note: '' };
}

/** แถวทะเบียน → ฟอร์ม (โหมดแก้) · ไม่ส่งแถว = ฟอร์มเปล่า */
export function packageSizeFormOf(size) {
  if (!size) return emptyPackageSizeForm();
  const open = size.maxCbm === null || size.maxCbm === undefined || size.maxCbm === '';
  return {
    code: normalizePackageSizeCode(size.code),
    nameEn: text(size.nameEn),
    pick: isSuggested(size) ? 'auto' : 'manual',
    /* ขนาดที่หัวหน้าเลือกเองไม่มีช่วง — ตั้งเป็น "มีเพดาน" ว่างไว้ ⇒ สลับเป็น "ระบบเสนอ" แล้วต้องตอบเรื่องช่วงเอง
       ไม่ใช่ได้ "ไม่มีเพดาน" มาโดยไม่ได้เลือก */
    band: isSuggested(size) && open ? 'open' : 'max',
    maxCbm: open ? '' : String(size.maxCbm),
    note: text(size.note),
  };
}

/** ฟอร์ม → คำขอ `{ code, nameEn, autoSuggest, maxCbm, note }` (ทรงเดียวกันทั้ง POST และ PATCH) */
export function packageSizeFormPayload(form = {}) {
  const autoSuggest = form.pick !== 'manual';
  return {
    code: normalizePackageSizeCode(form.code),
    nameEn: text(form.nameEn),
    autoSuggest,
    /* ส่งสตริงที่คนพิมพ์ไปทั้งอย่างนั้น — ตัวอ่าน "2,400" / ตัวตีกลับค่าที่อ่านไม่ออก อยู่ที่ด่านกลางที่เดียว */
    maxCbm: autoSuggest && form.band !== 'open' ? text(form.maxCbm) : null,
    note: text(form.note),
  };
}

/**
 * 🔑 ฟอร์มนี้กดบันทึกได้หรือยัง — ข้อความไทย หรือ `null` · ด่านกลาง `packageSizeError` + ข้อเดียวที่เป็นของฟอร์มเอง
 * @param mode `'create' | 'update'`
 * @param ctx  `{ canEdit, before, sizes }` — ส่งต่อให้ `packageSizeError` ทั้งก้อน
 */
export function packageSizeFormError(mode, form = {}, ctx = {}) {
  const payload = packageSizeFormPayload(form);
  /* ⭐ **เหตุที่ขึ้นเรียงตามลำดับช่องบนฟอร์ม** — สิทธิ์ · รหัส · ชื่อ · หมายเหตุ ก่อน แล้วค่อยเรื่องช่วง
     🐞 เดิมถามช่องช่วงก่อน ⇒ เปิดฟอร์มเพิ่มมาเปล่า ๆ ข้อความแรกคือ "ระบุขนาดพื้นที่สูงสุด" ทั้งที่รหัสกับชื่อยังว่าง
     · ถามด่านกลางในทรง "หัวหน้าเลือกเอง" (ไม่มีข้อไหนเรื่องช่วง) ⇒ ได้เฉพาะข้อของช่องข้างบน ไม่ต้องจับคู่ข้อความ */
  const basics = packageSizeError(mode, { ...payload, autoSuggest: false, maxCbm: null }, ctx);
  if (basics) return basics;
  if (form.pick !== 'manual' && form.band !== 'open' && !text(form.maxCbm)) {
    return 'ระบุขนาดพื้นที่สูงสุด (ลบ.ม.) — หรือเลือก “ไม่มีเพดาน” ถ้าขนาดนี้รับทุกพื้นที่ที่ใหญ่กว่าช่วงอื่น';
  }
  return packageSizeError(mode, payload, ctx);
}

/* ── ตาราง ───────────────────────────────────────────────────────────────── */

const FILTERS = [
  { value: 'all', label: 'ทั้งหมด', keep: () => true },
  { value: 'auto', label: 'ระบบเสนอจาก ลบ.ม.', keep: isSuggested },
  { value: 'manual', label: 'หัวหน้าเลือกเอง', keep: (s) => !isSuggested(s) },
];

/** ตัวกรองของแถบเครื่องมือ พร้อมจำนวน — `[{ value, label, count }]` (ป้ายจำนวนเป็นตัวเลข ไม่ต่อในชื่อ)
 *  🔴 `sizes` ไม่ใช่อาร์เรย์ (กำลังโหลด/โหลดไม่สำเร็จ) = `count: null` ⇒ แถบไม่ขึ้นป้ายจำนวน — "ทั้งหมด 0" บนจอที่โหลดพัง
 *     อ่านว่าทะเบียนว่าง ซึ่งไม่จริง (ไม่รู้ ≠ ศูนย์) */
export function packageSizeFilterOptions(sizes) {
  const known = Array.isArray(sizes);
  const rows = sortPackageSizes(sizes);
  return FILTERS.map(({ value, label, keep }) => ({ value, label, count: known ? rows.filter(keep).length : null }));
}

/** แถวที่ตารางวาด — เรียงตามทะเบียน (หัวหน้าเลือกเอง → ช่วงน้อยไปมาก → ไม่มีเพดาน) แล้วกรอง · ตัวกรองไม่รู้จัก = ทั้งหมด */
export function packageSizeRows(sizes, filter = 'all') {
  const keep = (FILTERS.find((f) => f.value === filter) || FILTERS[0]).keep;
  return sortPackageSizes(sizes).filter(keep);
}

/** "SM ≤ 300 ลบ.ม. · ST ≤ 2,400 ลบ.ม. · XL เกิน 2,400 ลบ.ม. · XS เลือกเอง" — บรรทัดอธิบายใต้ตารางเคาะและใต้ทะเบียน
 *  ⚠️ ขนาดที่ระบบเสนอมาก่อน (คือสิ่งที่บรรทัดนี้อธิบาย) แล้วตามด้วยขนาดที่หัวหน้าเลือกเอง */
export function packageSizeLegendText(sizes) {
  const rows = sortPackageSizes(sizes);
  return [...rows.filter(isSuggested), ...rows.filter((s) => !isSuggested(s))]
    .map((s) => `${normalizePackageSizeCode(s.code)} ${packageSizeBandText(s, rows)}`)
    .join(' · ');
}

/* ── กล่องยืนยันลบ ───────────────────────────────────────────────────────── */

/* เลขที่ใบที่กล่องลบไล่ให้ — เท่ากับที่สรุป audit ของการลบเก็บ (`AUDIT_DOC_NOS` ใน packageSizesRepo) */
const DELETE_DOC_NOS = 10;

/**
 * ⭐ **กล่องลบต้องบอกผล ไม่ใช่ถามว่าแน่ใจไหม** (กติกาโมดัลบอกผลลัพธ์) — ลบได้แม้มีใบใช้อยู่ (มติเจ้าของ 01/10)
 *   ⇒ ข้อความบอกว่าใบที่ยังไม่ส่งผลกี่ใบต้องเลือกขนาดใหม่ และใบที่ส่งผลแล้วไม่เปลี่ยน
 *
 * @param size  แถวที่จะลบ
 * @param ctx.usage  `{ [code]: { surveys, zones } }` จาก GET ทะเบียน — `null` = ไม่ได้นับ (server นับให้เฉพาะคนลบได้)
 * @param ctx.sizes  ทะเบียนทั้งชุด · @param ctx.canEdit สิทธิ์แก้ทะเบียน
 * @returns `{ blocked, title, message, detail, confirmLabel }` — `blocked` = เหตุที่ลบไม่ได้ (กล่องยังเปิดให้อ่านเหตุ ไม่มีปุ่มลบ)
 */
export function packageSizeDeleteConfirm(size, { usage = null, sizes = null, canEdit = false } = {}) {
  const code = normalizePackageSizeCode(size?.code);
  const title = `ลบขนาด ${code} ออกจากทะเบียน`;
  const blocked = packageSizeError('delete', {}, { canEdit, before: size || null, sizes });
  if (blocked) return { blocked, title, message: blocked, detail: null, confirmLabel: 'ลบ' };
  /* 🔴 ไม่รู้จำนวน ≠ ไม่มีใบใช้ — บอกตรง ๆ ว่ายังไม่ได้นับ (server นับจริงอีกรอบตอนลบและคืนตัวเลขมา) */
  if (!usage || typeof usage !== 'object') {
    return {
      blocked: null, title,
      message: `ลบขนาด ${code}? ยังไม่ทราบว่ามีใบประเมินที่ยังไม่ส่งผลใช้ขนาดนี้กี่ใบ — ใบที่ใช้อยู่ หัวหน้าต้องเลือกขนาดใหม่ก่อนส่งผล`,
      detail: 'ใบที่ส่งผลแล้วไม่เปลี่ยน · ระบบนับใบที่กระทบให้อีกครั้งตอนลบ',
      confirmLabel: 'ลบ',
    };
  }
  const used = usage[code] || { surveys: 0, zones: 0 };
  const affected = Number(used.surveys) > 0;
  /* ⭐ **บอกด้วยว่าใบไหน** (UAT PR-P 01/10) — GET ส่งเลขที่ใบมาอยู่แล้ว (`docNos`) · จำนวนอย่างเดียวหัวหน้าไม่รู้ว่าต้องไปเลือกขนาดใหม่
     ที่ใบไหน · เกิน `DELETE_DOC_NOS` ใบ = บอกจำนวนที่เหลือ (ลบขนาดที่ร้อยใบใช้อยู่ ไม่ใช่กล่องที่ต้องเลื่อนอ่าน) */
  const docNos = affected && Array.isArray(used.docNos) ? used.docNos.map((d) => text(d)).filter(Boolean) : [];
  const docText = docNos.length
    ? `ใบที่ต้องเลือกขนาดใหม่: ${docNos.slice(0, DELETE_DOC_NOS).join(' · ')}`
      + (docNos.length > DELETE_DOC_NOS ? ` และอีก ${fmtNumber(docNos.length - DELETE_DOC_NOS)} ใบ` : '')
    : null;
  return {
    blocked: null,
    title,
    message: affected
      ? `ลบขนาด ${code}? ${packageSizeUsageText(used)} — หัวหน้าต้องเลือกขนาดใหม่ก่อนส่งผล`
      : `ลบขนาด ${code}? ${packageSizeUsageText(used)}`,
    /* เลขที่ใบเป็นของที่ต้องตามไปเปิด ⇒ บรรทัดของตัวเองในกล่อง (`docsText`) · `detail` = ผลกับใบที่ส่งแล้ว เหมือนเดิม */
    docsText: docText,
    detail: 'ใบที่ส่งผลแล้วไม่เปลี่ยน — ยังถือรหัสขนาดเดิมไว้ · ขนาดนี้จะหายจากแถบเลือกของหัวหน้าทันที',
    confirmLabel: 'ลบ',
  };
}

/** ข้อความหลังลบสำเร็จ — ตัวเลขจาก server (`DELETE` คืน `usage` ที่นับ ณ ตอนลบ) */
export function packageSizeDeletedText(code, usage) {
  const surveys = Number(usage?.surveys) || 0;
  const zones = Number(usage?.zones) || 0;
  const done = `ลบขนาด ${normalizePackageSizeCode(code)} แล้ว`;
  return surveys > 0
    ? `${done} — ใบประเมินที่ยังไม่ส่งผล ${fmtNumber(surveys)} ใบ (${fmtNumber(zones)} พื้นที่) ต้องเลือกขนาดใหม่ก่อนส่งผล`
    : done;
}
