// คลังเงื่อนไขการค้าของใบเสนอราคา — แยกเป็น 2 คลังอิสระ (มติ 2026-07-25):
//   payment = เทมเพลตเงื่อนไขการชำระ (วิธีชำระ + ข้อความเงื่อนไข)
//   remarks = ชุดหมายเหตุ (ข้อความหมายเหตุที่พิมพ์บนเอกสาร)
// ตั้งชื่ออิสระทั้งสองคลัง แล้วคนทำใบ "เลือกเอง" จาก dropdown — ไม่มี scope/resolver
// ที่เลือกให้อัตโนมัติเหมือนของเดิม เพราะคนทำใบมองไม่เห็นว่าค่ามาจากไหนและเปลี่ยนไม่ได้

export const COMMERCIAL_DOCUMENT_KEYS = Object.freeze(['quotation']);
export const COMMERCIAL_PRESET_KINDS = Object.freeze(['payment', 'remarks']);

export const COMMERCIAL_DOCUMENT_LABELS = Object.freeze({ quotation: 'ใบเสนอราคา' });
export const COMMERCIAL_PRESET_KIND_LABELS = Object.freeze({
  payment: 'เทมเพลตเงื่อนไขการชำระ',
  remarks: 'ชุดหมายเหตุ',
});

export const COMMERCIAL_PRESET_LIMITS = Object.freeze({
  presetKey: 100,
  title: 150,
  paymentMethod: 300,
  paymentTerms: 1500,
  remarks: 6000,
  changeNote: 500,
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

// ── การนำชุดไปใช้บนใบเสนอราคา ─────────────────────────────────────────────────
// กติกา (มติ 2026-07-25): เลือกได้ชุดเดียวต่อช่อง เลือกแล้วทับทั้งช่อง · แก้ทับบนใบได้
// อิสระและมีผลกับใบนั้นใบเดียว (ไม่เขียนกลับคลัง) · จัดการชุดได้ที่หน้าตั้งค่าเท่านั้น

// เทมเพลตเติมเฉพาะวิธีและข้อความเงื่อนไข ไม่แตะงวดการชำระของใบ
export function paymentPresetToFormValue(option) {
  if (!option) return null;
  return {
    paymentMethod: option.paymentMethod || '',
    paymentTerms: option.paymentTerms || '',
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
  return sameText(current?.paymentMethod, expected.paymentMethod)
    && sameText(current?.paymentTerms, expected.paymentTerms);
}

export function matchesRemarksPreset(current, option) {
  if (!option) return false;
  return sameText(current, remarksPresetToFormValue(option));
}

// ช่องว่าง = ไม่มีอะไรจะเสีย เลือกชุดทับได้เลยไม่ต้องถาม
export function isEmptyPaymentValue(current) {
  return !String(current?.paymentMethod ?? '').trim()
    && !String(current?.paymentTerms ?? '').trim();
}

// สรุปย่อไว้โชว์ในตารางรายการ โดยไม่อ้างอิงงวดการชำระ
export function commercialPresetSummary(kind, version) {
  if (!version) return 'ยังไม่มีเวอร์ชันใช้งาน';
  if (kind === 'remarks') return version.remarks ? String(version.remarks).split('\n')[0] : 'ยังไม่ระบุหมายเหตุ';
  const method = version.paymentMethod || 'ยังไม่ระบุวิธีชำระ';
  const terms = String(version.paymentTerms || '').split('\n')[0].trim();
  return terms ? `${method} · ${terms}` : method;
}

// Dropdown บนใบต้องอ่านได้ทั้ง schema ปัจจุบัน (root มี kind จาก migration 0149)
// และ schema 0128 เดิมที่ 1 published version เก็บ payment + remarks รวมกัน.
// Migration 0149 เคยหยุดเมื่อพบข้อมูลเดิม ดังนั้น consumer ห้ามผูกกับคอลัมน์ kind
// ที่ฐานเก่าไม่มี; แยกชนิดจากเนื้อหาของ published version แทนได้โดยไม่แก้หลักฐานเดิม.
export function publishedCommercialPresetOptions(roots = [], versions = [], kind) {
  if (!COMMERCIAL_PRESET_KINDS.includes(kind)) return [];
  const versionById = new Map(
    (Array.isArray(versions) ? versions : [])
      .filter((version) => version?.status === 'published')
      .map((version) => [version.id, version]),
  );

  return (Array.isArray(roots) ? roots : [])
    .flatMap((root) => {
      const version = versionById.get(root?.publishedVersionId);
      if (!version) return [];

      if (root.kind && root.kind !== kind) return [];
      if (!root.kind) {
        const supportsPayment = Boolean(
          String(version.paymentMethod || '').trim()
          || String(version.paymentTerms || '').trim(),
        );
        const supportsRemarks = Boolean(String(version.remarks || '').trim());
        if ((kind === 'payment' && !supportsPayment) || (kind === 'remarks' && !supportsRemarks)) return [];
      }

      const base = {
        presetId: root.id,
        versionId: version.id,
        title: version.title,
      };
      return [kind === 'payment'
        ? {
          ...base,
          paymentMethod: version.paymentMethod || '',
          paymentTerms: version.paymentTerms || '',
        }
        : { ...base, remarks: version.remarks || '' }];
    })
    .sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'th'));
}
