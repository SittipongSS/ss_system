import { TEAMS } from './permissions.js';

export const COMMERCIAL_DOCUMENT_KEYS = Object.freeze(['quotation']);
export const COMMERCIAL_DEAL_TYPES = Object.freeze(['SCENT', 'NPD', 'RE-ORDER']);

export const COMMERCIAL_DOCUMENT_LABELS = Object.freeze({ quotation: 'ใบเสนอราคา' });
export const COMMERCIAL_TEAM_LABELS = Object.freeze({ ODM: 'New ODM', KA: 'Key Account', SV: 'Services' });

export const COMMERCIAL_PRESET_LIMITS = Object.freeze({
  presetKey: 100,
  title: 150,
  paymentMethod: 300,
  paymentTerms: 1500,
  remarks: 6000,
  changeNote: 500,
  serviceType: 80,
  installmentCount: 12,
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

export function normalizeCommercialPresetScope(input = {}) {
  const errors = [];
  const documentKey = trimOrNull(input.documentKey);
  const teamKey = trimOrNull(input.teamKey)?.toUpperCase() || null;
  const dealType = trimOrNull(input.dealType)?.toUpperCase() || null;
  const serviceType = limitedText(input.serviceType, 'ประเภทบริการ', COMMERCIAL_PRESET_LIMITS.serviceType, errors);
  const priority = Number(input.priority ?? 0);

  if (!COMMERCIAL_DOCUMENT_KEYS.includes(documentKey)) errors.push('ชนิดเอกสารไม่ถูกต้อง');
  if (teamKey && !TEAMS.includes(teamKey)) errors.push('ทีมไม่ถูกต้อง');
  if (dealType && !COMMERCIAL_DEAL_TYPES.includes(dealType)) errors.push('ประเภทดีลไม่ถูกต้อง');
  if (!Number.isInteger(priority) || priority < 0 || priority > 9999) errors.push('ลำดับความสำคัญต้องเป็นจำนวนเต็ม 0–9999');

  return { value: { documentKey, teamKey, dealType, serviceType, priority }, errors };
}

export function normalizeCommercialInstallments(rows, errors = []) {
  if (!Array.isArray(rows)) {
    errors.push('ข้อมูลงวดชำระต้องเป็นรายการ');
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

  if (normalized.length) {
    const total = normalized.reduce((sum, row) => sum + (Number.isFinite(row.percent) ? row.percent : 0), 0);
    if (Math.abs(total - 100) > 0.001) errors.push(`เปอร์เซ็นต์งวดชำระรวมต้องเท่ากับ 100 (ปัจจุบัน ${total.toFixed(2)})`);
  }
  return normalized;
}

export function normalizeCommercialPresetInput(input = {}, { includeScope = false } = {}) {
  const errors = [];
  const value = {
    title: limitedText(input.title, 'ชื่อ Preset', COMMERCIAL_PRESET_LIMITS.title, errors, true),
    paymentMethod: limitedText(input.paymentMethod, 'วิธีชำระเงิน', COMMERCIAL_PRESET_LIMITS.paymentMethod, errors),
    paymentTerms: limitedText(input.paymentTerms, 'เงื่อนไขการชำระ', COMMERCIAL_PRESET_LIMITS.paymentTerms, errors),
    remarks: limitedText(input.remarks, 'หมายเหตุ', COMMERCIAL_PRESET_LIMITS.remarks, errors),
    installments: normalizeCommercialInstallments(input.installments ?? [], errors),
    changeNote: limitedText(input.changeNote, 'หมายเหตุการเปลี่ยนแปลง', COMMERCIAL_PRESET_LIMITS.changeNote, errors),
  };
  if (includeScope) {
    const scope = normalizeCommercialPresetScope(input);
    Object.assign(value, scope.value);
    errors.push(...scope.errors);
  }
  return { value, errors: [...new Set(errors)] };
}

export function commercialPresetStatusLabel(status) {
  if (status === 'published') return 'เผยแพร่แล้ว';
  if (status === 'archived') return 'ซ่อนแล้ว';
  return 'ฉบับร่าง';
}

export function commercialPresetScopeLabel(preset) {
  const parts = [COMMERCIAL_DOCUMENT_LABELS[preset?.documentKey] || preset?.documentKey || '-'];
  parts.push(preset?.teamKey ? (COMMERCIAL_TEAM_LABELS[preset.teamKey] || preset.teamKey) : 'ทุกทีม');
  if (preset?.dealType) parts.push(preset.dealType);
  if (preset?.serviceType) parts.push(preset.serviceType);
  if (!preset?.dealType && !preset?.serviceType) parts.push('ค่าเริ่มต้น');
  return parts.join(' · ');
}

export function installmentPercentTotal(rows = []) {
  return rows.reduce((sum, row) => sum + (Number(row?.percent) || 0), 0);
}

function matchesScope(preset, context) {
  if (preset.documentKey !== context.documentKey) return false;
  return (!preset.teamKey || preset.teamKey === context.teamKey)
    && (!preset.dealType || preset.dealType === context.dealType)
    && (!preset.serviceType || preset.serviceType === context.serviceType);
}

function specificity(preset) {
  return Number(!!preset.teamKey) + Number(!!preset.dealType) + Number(!!preset.serviceType);
}

export function resolveCommercialPreset(candidates = [], input = {}) {
  const context = {
    documentKey: trimOrNull(input.documentKey),
    teamKey: trimOrNull(input.teamKey)?.toUpperCase() || null,
    dealType: trimOrNull(input.dealType)?.toUpperCase() || null,
    serviceType: trimOrNull(input.serviceType),
  };
  return candidates
    .filter((row) => row?.published && matchesScope(row, context))
    .sort((a, b) => (
      specificity(b) - specificity(a)
      || Number(!!b.teamKey) - Number(!!a.teamKey)
      || Number(!!b.dealType) - Number(!!a.dealType)
      || Number(!!b.serviceType) - Number(!!a.serviceType)
      || Number(a.priority || 0) - Number(b.priority || 0)
      || String(a.presetKey || a.id).localeCompare(String(b.presetKey || b.id), 'en')
    ))[0] || null;
}
