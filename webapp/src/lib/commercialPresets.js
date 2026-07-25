// คลังเงื่อนไขการค้าของใบเสนอราคา — แยกเป็น 2 คลังอิสระ (มติ 2026-07-25):
//   payment = ชุดการชำระ (วิธีชำระ + เงื่อนไข + ตารางงวด)
//   remarks = ชุดหมายเหตุ (ข้อความหมายเหตุที่พิมพ์บนเอกสาร)
// ตั้งชื่ออิสระทั้งสองคลัง แล้วคนทำใบ "เลือกเอง" จาก dropdown — ไม่มี scope/resolver
// ที่เลือกให้อัตโนมัติเหมือนของเดิม เพราะคนทำใบมองไม่เห็นว่าค่ามาจากไหนและเปลี่ยนไม่ได้
import { MAX_INSTALLMENTS } from './sales/paymentPlan.js';

export const COMMERCIAL_DOCUMENT_KEYS = Object.freeze(['quotation']);
export const COMMERCIAL_PRESET_KINDS = Object.freeze(['payment', 'remarks']);

export const COMMERCIAL_DOCUMENT_LABELS = Object.freeze({ quotation: 'ใบเสนอราคา' });
export const COMMERCIAL_PRESET_KIND_LABELS = Object.freeze({
  payment: 'ชุดการชำระ',
  remarks: 'ชุดหมายเหตุ',
});

export const COMMERCIAL_PRESET_LIMITS = Object.freeze({
  presetKey: 100,
  title: 150,
  paymentMethod: 300,
  paymentTerms: 1500,
  remarks: 6000,
  changeNote: 500,
  // เพดานงวดยึดตามฟอร์มใบเสนอราคา (lib/sales/paymentPlan) — ตั้งในคลังได้เกินกว่าที่
  // ใบรับไหวก็เท่ากับตั้งไปใช้ไม่ได้
  installmentCount: MAX_INSTALLMENTS,
  installmentLabel: 120,
  installmentRule: 300,
  installmentNote: 500,
});

const trimOrNull = (value) => String(value ?? '').trim() || null;

function limitedText(value, field, max, errors, required = false) {
  const text = trimOrNull(value);
  if (required && !text) errors.push(`กรุณาระบุ${field}`);
  if (text && text.length > max) errors.push(`${field}ต้องไม่เกิน ${max} ตัวอักษร`);
  return text;
}

export function commercialPresetKindLabel(kind) {
  return COMMERCIAL_PRESET_KIND_LABELS[kind] || kind || '-';
}

// แถวตั้งต้นของ "ชำระเต็มจำนวน" — ชุดการชำระมีตารางเสมอ สวิตช์ปิดคือตาราง 1 แถว 100%
// (แม่แบบเอกสาร V4 ออกแบบมาให้ทุกใบมีตารางงวดอยู่แล้ว)
export function fullPaymentInstallment(label = 'ชำระเต็มจำนวน') {
  return { label, percent: 100, trigger: '', dueRule: '', note: '' };
}

export function isFullPaymentPlan(rows) {
  return Array.isArray(rows) && rows.length === 1 && Math.abs(Number(rows[0]?.percent) - 100) <= 0.001;
}

export function normalizeCommercialInstallments(rows, errors = []) {
  if (!Array.isArray(rows)) {
    errors.push('ข้อมูลงวดชำระต้องเป็นรายการ');
    return [];
  }
  if (!rows.length) {
    errors.push('ชุดการชำระต้องมีอย่างน้อย 1 งวด (ชำระเต็มจำนวน = 1 งวด 100%)');
    return [];
  }
  if (rows.length > COMMERCIAL_PRESET_LIMITS.installmentCount) {
    errors.push(`งวดชำระมีได้ไม่เกิน ${COMMERCIAL_PRESET_LIMITS.installmentCount} งวด`);
  }

  const normalized = rows.map((row, index) => {
    const prefix = `งวดที่ ${index + 1}`;
    const label = limitedText(row?.label, `ชื่อ${prefix}`, COMMERCIAL_PRESET_LIMITS.installmentLabel, errors, true);
    const percent = Number(row?.percent);
    const trigger = limitedText(row?.trigger, `เงื่อนไขเริ่ม${prefix}`, COMMERCIAL_PRESET_LIMITS.installmentRule, errors);
    const dueRule = limitedText(row?.dueRule, `กำหนดชำระ${prefix}`, COMMERCIAL_PRESET_LIMITS.installmentRule, errors);
    const note = limitedText(row?.note, `หมายเหตุ${prefix}`, COMMERCIAL_PRESET_LIMITS.installmentNote, errors);
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) errors.push(`เปอร์เซ็นต์${prefix}ต้องมากกว่า 0 และไม่เกิน 100`);
    return { label, percent, trigger, dueRule, note };
  });

  const total = normalized.reduce((sum, row) => sum + (Number.isFinite(row.percent) ? row.percent : 0), 0);
  if (Math.abs(total - 100) > 0.001) errors.push(`เปอร์เซ็นต์งวดชำระรวมต้องเท่ากับ 100 (ปัจจุบัน ${total.toFixed(2)})`);
  return normalized;
}

export function normalizeCommercialPresetKind(input = {}) {
  const errors = [];
  const documentKey = trimOrNull(input.documentKey) || 'quotation';
  const kind = trimOrNull(input.kind);
  if (!COMMERCIAL_DOCUMENT_KEYS.includes(documentKey)) errors.push('ชนิดเอกสารไม่ถูกต้อง');
  if (!COMMERCIAL_PRESET_KINDS.includes(kind)) errors.push('ชนิดคลังไม่ถูกต้อง');
  return { value: { documentKey, kind }, errors };
}

// เนื้อหาที่ตรวจขึ้นกับชนิดคลัง — ช่องของอีกคลังถูกบังคับเป็น null เสมอ ไม่ให้มีข้อมูล
// ค้างข้ามคลัง (เช่น ชุดหมายเหตุที่แอบมีตารางงวดติดมา)
export function normalizeCommercialPresetInput(input = {}, { kind } = {}) {
  const errors = [];
  const presetKind = COMMERCIAL_PRESET_KINDS.includes(kind) ? kind : null;
  if (!presetKind) {
    return { value: {}, errors: ['ชนิดคลังไม่ถูกต้อง'] };
  }

  const value = {
    title: limitedText(input.title, 'ชื่อชุด', COMMERCIAL_PRESET_LIMITS.title, errors, true),
    changeNote: limitedText(input.changeNote, 'หมายเหตุการเปลี่ยนแปลง', COMMERCIAL_PRESET_LIMITS.changeNote, errors),
    paymentMethod: null,
    paymentTerms: null,
    remarks: null,
    installments: [],
  };

  if (presetKind === 'payment') {
    value.paymentMethod = limitedText(input.paymentMethod, 'วิธีชำระเงิน', COMMERCIAL_PRESET_LIMITS.paymentMethod, errors, true);
    value.paymentTerms = limitedText(input.paymentTerms, 'รายละเอียดการชำระ', COMMERCIAL_PRESET_LIMITS.paymentTerms, errors);
    value.installments = normalizeCommercialInstallments(input.installments ?? [], errors);
  } else {
    value.remarks = limitedText(input.remarks, 'รายละเอียดหมายเหตุ', COMMERCIAL_PRESET_LIMITS.remarks, errors, true);
  }

  return { value, errors: [...new Set(errors)] };
}

export function commercialPresetStatusLabel(status) {
  if (status === 'published') return 'เผยแพร่แล้ว';
  if (status === 'archived') return 'ซ่อนแล้ว';
  return 'ฉบับร่าง';
}

export function installmentPercentTotal(rows = []) {
  return rows.reduce((sum, row) => sum + (Number(row?.percent) || 0), 0);
}

// ── การนำชุดไปใช้บนใบเสนอราคา ─────────────────────────────────────────────────
// กติกา (มติ 2026-07-25): เลือกได้ชุดเดียวต่อช่อง เลือกแล้วทับทั้งช่อง · แก้ทับบนใบได้
// อิสระและมีผลกับใบนั้นใบเดียว (ไม่เขียนกลับคลัง) · จัดการชุดได้ที่หน้าตั้งค่าเท่านั้น

// แปลงชุดการชำระ → ค่าที่ QuotationPaymentTerms กินได้ตรง ๆ.
// ใช้ type 'installment' ทุกกรณีรวมแถวเดียว 100% — ถ้าแปลงเป็น 'full' แถวงวดจะไม่ถูกเก็บ
// แล้วเงื่อนไขเริ่มชำระ/กำหนดชำระที่ตั้งไว้ในคลังจะหายเงียบ ๆ. ฟอร์มใบมีแค่
// label/percent/note จึงพับ trigger + dueRule + note รวมเข้า note ด้วย ' · '
export function paymentPresetToFormValue(option) {
  const rows = Array.isArray(option?.installments) ? option.installments : [];
  if (!option || !rows.length) return null;
  return {
    type: 'installment',
    paymentMethod: option.paymentMethod || '',
    paymentTerms: option.paymentTerms || '',
    installments: rows.map((row) => ({
      label: trimOrNull(row?.label) || '',
      percent: Number(row?.percent) || 0,
      note: [row?.trigger, row?.dueRule, row?.note].map((text) => trimOrNull(text)).filter(Boolean).join(' · ') || '',
    })),
  };
}

// แปลงชุดหมายเหตุ → ข้อความในช่องหมายเหตุ
export function remarksPresetToFormValue(option) {
  if (!option) return null;
  return String(option.remarks ?? '');
}

const sameText = (a, b) => String(a ?? '').trim() === String(b ?? '').trim();

// ค่าปัจจุบันในฟอร์ม "ยังตรงกับชุดที่เลือก" อยู่ไหม — ใช้ทั้งตัดสินป้าย "แก้เพิ่มเติมแล้ว"
// และตัดสินว่าการเลือกชุดใหม่จะทำของหาย (ต้องถามยืนยัน) หรือทับได้เงียบ ๆ.
// คิดสดจากการเทียบทุกครั้ง ไม่เก็บธงไว้ที่ไหน — แก้กลับให้ตรงแล้วต้องกลับเป็น true เอง
export function matchesPaymentPreset(current, option) {
  const expected = paymentPresetToFormValue(option);
  if (!expected) return false;
  const rows = Array.isArray(current?.installments) ? current.installments : [];
  if (!sameText(current?.paymentMethod, expected.paymentMethod)) return false;
  if (!sameText(current?.paymentTerms, expected.paymentTerms)) return false;
  if (rows.length !== expected.installments.length) return false;
  return expected.installments.every((row, index) => {
    const actual = rows[index] || {};
    return sameText(actual.label, row.label)
      && sameText(actual.note, row.note)
      && Math.abs((Number(actual.percent) || 0) - row.percent) <= 0.001;
  });
}

export function matchesRemarksPreset(current, option) {
  if (!option) return false;
  return sameText(current, remarksPresetToFormValue(option));
}

// ช่องว่าง = ไม่มีอะไรจะเสีย เลือกชุดทับได้เลยไม่ต้องถาม
export function isEmptyPaymentValue(current) {
  const rows = Array.isArray(current?.installments) ? current.installments : [];
  return !String(current?.paymentMethod ?? '').trim()
    && !String(current?.paymentTerms ?? '').trim()
    && rows.every((row) => !String(row?.label ?? '').trim() && !String(row?.note ?? '').trim() && !Number(row?.percent));
}

// สรุปย่อไว้โชว์ในตารางรายการ — ชุดการชำระบอกจำนวนงวด ชุดหมายเหตุบอกความยาวข้อความ
export function commercialPresetSummary(kind, version) {
  if (!version) return 'ยังไม่มีเวอร์ชันใช้งาน';
  if (kind === 'remarks') return version.remarks ? String(version.remarks).split('\n')[0] : 'ยังไม่ระบุหมายเหตุ';
  const rows = Array.isArray(version.installments) ? version.installments : [];
  const plan = isFullPaymentPlan(rows) ? 'ชำระเต็มจำนวน' : `แบ่ง ${rows.length} งวด`;
  return `${version.paymentMethod || 'ยังไม่ระบุวิธีชำระ'} · ${plan}`;
}
