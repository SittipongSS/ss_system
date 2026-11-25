// ── บรรทัด MSDS: กลิ่นหรือสูตรของ FG (ม-167 · มติเจ้าของ 25/11/2026) — logic ล้วน ─────────────────────
//
// ⭐ เจ้าของ: *"msds ตาม fg และ ต้อง มีชื่อกลิ่นหรือสูตรตามหมวดที่เราแบ่ง"*
//    · หมวด 02-020 (หัวน้ำหอม) = **กลิ่น** (`products.scentId` · มติ 02/11 `fragranceOilScent.js`) · หมวดอื่น = **สูตร**
//    · FG ผูกไว้แล้ว = ใช้ของ FG (อ่านสด ไม่ถามซ้ำ)
//    · FG ยังไม่ผูก = **ผู้ขอต้องเลือกในบรรทัด** (กรองลูกค้า + ที่แชร์ · ม-150) · ไม่มีในทะเบียน = **พิมพ์ชื่อแทน**
//    · ที่เลือกในบรรทัด **ไม่เขียนกลับ FG** — หน้าสินค้าขึ้นคำแนะนำให้กด "ผูก + ยื่นขออนุมัติ" เอง (ทางเดิมของฟอร์มสินค้า)
// 🐞 ที่มา (prod 25/11): FG 12 ตัวที่เคยขอ MSDS ไม่ผูกสูตร/กลิ่นเลยสักตัว · ฝ่ายขายพิมพ์ "ชื่อกลิ่น shadow Elite" ลงรายละเอียดเอง
//
// ⚠️ ชุดของขวัญ (01-037) ผูกหลายสูตรผ่าน `product_formulas` — ไม่มีสูตรเดียวให้เลือก ⇒ ไม่ถาม ไม่บังคับ (ดูที่หน้าสินค้า)
// ⚠️ บังคับเฉพาะบรรทัดใหม่ (ไม่มี `id`) — กติกาเดียวกับ FG/กลิ่นของ P2b/P3 · บรรทัดเก่าก่อนมติไม่ถูกบังคับย้อนหลัง
import { REQUEST_FG_SUBJECT_DOC_TYPES } from '@/lib/requests/docTypes';
import { isFragranceOilCategory } from '@/lib/master/fragranceOilScent';
import { isGiftSetCategory } from '@/lib/master/giftSetFormulas';
import { formulaLabel, scentLabel } from '@/lib/master/registryLabel';

const clean = (value) => String(value ?? '').trim();

/** ชื่อที่พิมพ์เองยาวได้เท่านี้ (CHECK ของ mig 0440) */
export const TYPED_SUBJECT_MAX = 200;

export const FG_SUBJECT_NOUN = Object.freeze({ scent: 'กลิ่น', formula: 'สูตร', giftSet: 'สูตร (ชุดของขวัญ)' });

/** บรรทัดนี้ต้องรู้กลิ่น/สูตรของ FG ไหม (MSDS) */
export function docLineWantsSubject(row) {
  return row?.lineKind === 'document' && REQUEST_FG_SUBJECT_DOC_TYPES.includes(clean(row?.docType));
}

/** FG นี้ใช้อะไรเป็นตัวตน — 'scent' (02-020) · 'giftSet' (01-037) · 'formula' (หมวดอื่น) */
export function fgSubjectKind(product) {
  if (isFragranceOilCategory(product?.categoryCode)) return 'scent';
  if (isGiftSetCategory(product?.categoryCode)) return 'giftSet';
  return 'formula';
}

/** id ของกลิ่น/สูตรที่ FG ผูกไว้แล้ว — null = ยังไม่ผูก (ชุดของขวัญคืน null เสมอ — ไม่มีตัวเดียว) */
export function fgBoundSubjectId(product) {
  const kind = fgSubjectKind(product);
  if (kind === 'scent') return clean(product?.scentId) || null;
  if (kind === 'formula') return clean(product?.formulaId) || null;
  return null;
}

/** FG นี้ต้องให้ผู้ขอเลือก/พิมพ์ในบรรทัดไหม */
export function fgNeedsLineSubject(product) {
  if (!product) return false;
  return fgSubjectKind(product) !== 'giftSet' && !fgBoundSubjectId(product);
}

/**
 * ค่าที่บรรทัดเก็บ — ตัดของที่ไม่ใช่ชนิดของ FG ทิ้ง (กลิ่นค้างไปกับ FG หมวดสูตร หรือกลับกัน ไม่ได้)
 * · มีตัวจากทะเบียน = ทิ้งชื่อที่พิมพ์ (ตัวจริงชนะ) · FG ผูกแล้ว/ชุดของขวัญ = ไม่เก็บอะไรเลย
 * @returns {{ scentId: string|null, formulaId: string|null, typedSubjectName: string|null }}
 */
export function docLineSubjectValues(row, product) {
  const none = { scentId: null, formulaId: null, typedSubjectName: null };
  if (!docLineWantsSubject(row) || !product || !fgNeedsLineSubject(product)) return none;
  const kind = fgSubjectKind(product);
  const id = clean(kind === 'scent' ? row?.scentId : row?.formulaId) || null;
  const typed = id ? null : (clean(row?.typedSubjectName) || null);
  return {
    scentId: kind === 'scent' ? id : null,
    formulaId: kind === 'formula' ? id : null,
    typedSubjectName: typed,
  };
}

/**
 * เหตุที่บรรทัด MSDS ยังขาดกลิ่น/สูตร — null = ผ่าน
 * @param row แถวบรรทัด (มี `id` = บรรทัดเดิม ไม่บังคับ)
 * @param product FG ของบรรทัด (null = ยังไม่เลือก FG — ด่าน FG ถามก่อนแล้ว)
 */
export function docLineSubjectError(row, product, { at = '' } = {}) {
  if (!docLineWantsSubject(row) || !product || clean(row?.id)) return null;
  if (!fgNeedsLineSubject(product)) return null;
  const values = docLineSubjectValues(row, product);
  if (values.scentId || values.formulaId) return null;
  if (values.typedSubjectName) {
    return values.typedSubjectName.length > TYPED_SUBJECT_MAX
      ? `${at ? `${at}: ` : ''}ชื่อ${FG_SUBJECT_NOUN[fgSubjectKind(product)]}ยาวเกิน ${TYPED_SUBJECT_MAX} ตัวอักษร`
      : null;
  }
  const noun = FG_SUBJECT_NOUN[fgSubjectKind(product)];
  const code = clean(product.fgCode);
  return `${at ? `${at}: ` : ''}FG ${code || 'นี้'} ยังไม่ผูก${noun} — เลือก${noun}จากทะเบียน หรือพิมพ์ชื่อ${noun}`;
}

/**
 * ป้ายกลิ่น/สูตรของบรรทัด MSDS สำหรับจอ (อ่านสด) — null = บรรทัดไม่ใช่ MSDS หรือไม่มี FG
 * `source`: 'fg' (FG ผูกไว้) · 'line' (ผู้ขอเลือกจากทะเบียน) · 'typed' (พิมพ์ชื่อ · ยังไม่มีในทะเบียน) · 'giftSet' · 'none'
 * @param ctx `{ product, fgScent, fgFormula, lineScent, lineFormula }` — แถวทะเบียนที่ผู้เรียกโหลดมา (ต้องมีวันที่ · ม-162)
 */
export function docLineSubjectView(item, ctx = {}) {
  const { product = null, fgScent = null, fgFormula = null, lineScent = null, lineFormula = null } = ctx;
  if (!docLineWantsSubject(item) || !product) return null;
  const kind = fgSubjectKind(product);
  const noun = FG_SUBJECT_NOUN[kind];
  const fg = { id: product.id, fgCode: product.fgCode || null, description: product.productDescription || null };
  const base = { kind, noun, fg };
  if (kind === 'giftSet') return { ...base, source: 'giftSet', id: null, label: null };
  const boundId = fgBoundSubjectId(product);
  if (boundId) {
    const row = kind === 'scent' ? fgScent : (fgFormula || {
      // สูตรของ FG มีสำเนารหัส/ชื่อ/วันที่บนแถวสินค้า — ใช้แทนเมื่อโหลดทะเบียนไม่เจอ
      code: product.formulaCode, name: product.formulaName, formulaDate: product.formulaDate,
    });
    return { ...base, source: 'fg', id: boundId, label: row ? (kind === 'scent' ? scentLabel(row) : formulaLabel(row)) : null };
  }
  const lineRow = kind === 'scent' ? lineScent : lineFormula;
  const lineId = clean(kind === 'scent' ? item.scentId : item.formulaId);
  if (lineId) {
    return {
      ...base, source: 'line', id: lineId,
      label: lineRow ? (kind === 'scent' ? scentLabel(lineRow) : formulaLabel(lineRow)) : null,
    };
  }
  const typed = clean(item.typedSubjectName);
  if (typed) return { ...base, source: 'typed', id: null, label: typed };
  return { ...base, source: 'none', id: null, label: null };
}

/** ประโยคหนึ่งบรรทัดของ view — "สูตร PF… · ชื่อ · วันที่" / "กลิ่น (พิมพ์ชื่อ · ยังไม่มีในทะเบียน) X" */
export function docLineSubjectText(view) {
  if (!view) return '';
  if (view.source === 'giftSet') return 'ชุดของขวัญ — สูตรตามรายการในหน้าสินค้า';
  if (view.source === 'none') return `ยังไม่ระบุ${view.noun}`;
  if (view.source === 'typed') return `${view.noun} ${view.label} (พิมพ์ชื่อ · ยังไม่มีในทะเบียน)`;
  const label = view.label || 'ไม่พบในทะเบียน';
  return view.source === 'fg' ? `${view.noun}ของ FG ${label}` : `${view.noun} ${label} (ผู้ขอเลือก · FG ยังไม่ผูก)`;
}
