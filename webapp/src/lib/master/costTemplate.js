// ── แม่แบบต้นทุนต่อประเภทสินค้า (mig 0140) — logic ล้วน ─────────────────
// ไม่มี I/O: ใช้ร่วมกันทั้งฝั่ง API (ตรวจก่อนเขียน DB) และฝั่งหน้าจอ (ป้ายกำกับ,
// ตรวจก่อนกดบันทึก) — กฎเดียวกันทั้งสองฝั่ง ไม่ต้องคัดลอกไปเขียนซ้ำ
//
// บรรทัดในแม่แบบมี 5 ชนิด และ "ชนิดเป็นตัวกำหนดหน่วย + ฝ่ายที่ต้องตอบราคา" เสมอ:
//   RM_F  หัวน้ำหอม (F)         ฿/กก. → ถาม RD
//   RM_B  เบส (B)               ฿/กก. → ถาม RD   (mig 0371 · ม-148)
//   RM_FB เบสที่ใส่กลิ่น (FB)   ฿/กก. → ถาม RD
// ⭐ นิยามผู้ใช้ 2026-09-22: *"F คือกลิ่น(หัวน้ำหอม) / B คือเบส / FB คือ เบสที่ใส่กลิ่น"* — แม่แบบที่
//   แยก "หัวน้ำหอม + เบส" ต้องใช้ F + B · ใช้ F + FB = นับกลิ่นซ้ำ (FB มีกลิ่นอยู่แล้ว)
//   PM    บรรจุภัณฑ์      ฿/ชิ้น → ถาม PC (จัดซื้อ)
//   labor ค่าดำเนินการ    ฿/ชิ้น → คิดภายใน ไม่ต้องถามใคร
// ความสัมพันธ์นี้ถูกบังคับซ้ำเป็น CHECK constraint ใน 0140 ด้วย

export const COST_LINE_KINDS = ['RM_F', 'RM_B', 'RM_FB', 'PM', 'labor'];

export const COST_LINE_KIND_LABELS = {
  RM_F: 'หัวน้ำหอม (F)',
  RM_B: 'เบส (B)',
  RM_FB: 'เบสที่ใส่กลิ่น (FB)',
  PM: 'บรรจุภัณฑ์ (PM)',
  labor: 'ค่าดำเนินการ',
};

// วัตถุดิบ (RM) ทุกชนิด — คิดต่อกิโล ถาม RD
const RM_KINDS = ['RM_F', 'RM_B', 'RM_FB'];

export const UNIT_BASIS_LABELS = {
  per_kg: 'บาท/กก.',
  per_piece: 'บาท/ชิ้น',
};

// หน่วยของบรรทัด — ผูกกับชนิด ไม่ให้ผู้ใช้เลือกเอง (กันสูตรแปลงกรัม/ชิ้นเพี้ยน)
export function unitBasisForKind(kind) {
  return RM_KINDS.includes(kind) ? 'per_kg' : 'per_piece';
}

// ฝ่ายที่ต้องตอบราคาบรรทัดนี้ — null = คิดภายใน ไม่ต้องส่งใครตอบ
// (ค่านี้จะถูก snapshot ลง costing_item_components."sourceDept" ตอนกางใบใน PR3)
export function sourceDeptForKind(kind) {
  if (RM_KINDS.includes(kind)) return 'RD';
  if (kind === 'PM') return 'PC';
  return null;
}

export function isValidCategoryCode(code) {
  return /^\d{2}-\d{3}$/.test(String(code || ''));
}

function toPositiveNumber(value) {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : NaN;
}

// ตรวจ + ปรับรูปชุดบรรทัดของแม่แบบให้พร้อมเขียน DB
// คืน { lines, error } — error เป็นข้อความไทยพร้อมแสดงผล, lines ใช้ได้เมื่อ error = null
export function normalizeCostTemplateLines(input) {
  if (!Array.isArray(input) || input.length === 0) {
    return { lines: [], error: 'แม่แบบต้องมีอย่างน้อย 1 บรรทัด' };
  }
  if (input.length > 60) {
    return { lines: [], error: 'บรรทัดในแม่แบบมากเกินไป (สูงสุด 60 บรรทัด)' };
  }

  const lines = [];
  const seenLabels = new Set();
  for (let i = 0; i < input.length; i += 1) {
    const raw = input[i] || {};
    const at = `บรรทัดที่ ${i + 1}`;

    const kind = String(raw.kind || '').trim();
    if (!COST_LINE_KINDS.includes(kind)) {
      return { lines: [], error: `${at}: ชนิดบรรทัดไม่ถูกต้อง` };
    }

    const label = String(raw.label ?? '').trim().replace(/\s+/g, ' ');
    if (!label) return { lines: [], error: `${at}: ต้องระบุชื่อรายการ` };
    if (label.length > 200) return { lines: [], error: `${at}: ชื่อรายการยาวเกิน 200 ตัวอักษร` };
    // ชื่อซ้ำในแม่แบบเดียวกันทำให้คนกรอกราคาแยกไม่ออกว่าบรรทัดไหนคือบรรทัดไหน
    const dupKey = `${kind}::${label.toLowerCase()}`;
    if (seenLabels.has(dupKey)) return { lines: [], error: `${at}: ชื่อรายการซ้ำกับบรรทัดก่อนหน้า` };
    seenLabels.add(dupKey);

    const unitBasis = unitBasisForKind(kind);
    let gramsPerUnit = null;
    if (unitBasis === 'per_kg') {
      gramsPerUnit = toPositiveNumber(raw.defaultGramsPerUnit);
      if (Number.isNaN(gramsPerUnit)) {
        return { lines: [], error: `${at}: กรัมต่อชิ้นต้องเป็นตัวเลขมากกว่า 0` };
      }
    }

    lines.push({
      sortOrder: i + 1,
      kind,
      label,
      unitBasis,
      defaultGramsPerUnit: gramsPerUnit,
      required: raw.required !== false,
    });
  }

  return { lines, error: null };
}

// สรุปแม่แบบสำหรับหน้ารายการ — บอกว่าต้องไปขอราคาจากใครบ้าง กี่บรรทัด
export function summarizeCostTemplate(lines = []) {
  const summary = { total: lines.length, rd: 0, pc: 0, internal: 0 };
  for (const line of lines) {
    const dept = sourceDeptForKind(line?.kind);
    if (dept === 'RD') summary.rd += 1;
    else if (dept === 'PC') summary.pc += 1;
    else summary.internal += 1;
  }
  return summary;
}
