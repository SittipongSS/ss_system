// ── ชนิดคำร้องข้ามฝ่าย (mig 0173) — โค้ดล้วน ไม่ต้อง migration ────────────
//
// ตาราง dept_requests ไม่มี CHECK บน kind โดยเจตนา: ชุดชนิดเป็นเรื่องของงาน
// ไม่ใช่ของ schema — เพิ่มชนิดใหม่ควรแก้ไฟล์เดียว ไม่ใช่ออก migration ทุกครั้ง
// (แพตเทิร์นเดียวกับ updateTypes / attachmentTypes / materialTypes)
//
// ⭐ ที่มา: ก่อนหน้านี้ระบบมีกลไก "ขอให้ฝ่ายอื่นทำอะไรให้" สองชุดคนละคำคนละคิว —
// สอบถาม RD (เธรดล้วน) กับ เคสขอราคาวัสดุ (มีบรรทัด/เลขที่/คิว) ทั้งที่เป็นเรื่อง
// เดียวกัน · ไฟล์นี้คือจุดที่รวมมันเข้าด้วยกัน: ทุกชนิดเดินสถานะชุดเดียวกัน
// ต่างกันแค่ "ถามอะไร ถึงฝ่ายไหน ผูกกับอะไร จบแล้วไปโผล่ที่ไหน"
import { MATERIAL_KINDS, sourceDeptForMaterialKind } from '@/lib/materialPrices';

// ── ธงต่อชนิด ────────────────────────────────────────────────────────────
//   dept        ฝ่ายผู้ตอบตั้งต้น (null = อนุมานจากชนิดวัสดุของรายการแรก)
//   scope       scope เลขที่เอกสาร (ออกตอนกดส่ง ไม่ใช่ตอนสร้างร่าง)
//   hasItems    มีบรรทัดรายการ + ชั้นจำนวน (ชนิดขอราคาเท่านั้น)
//   needsDeal   บังคับผูกดีล (มติ 5: เฉพาะงานลูกค้า ไม่ใช่ชนิดขอราคา)
//   refs        ต้องอ้างของในทะเบียนอะไร ('scent' | 'formula')
//   stepKey     ขั้นปลายทางในไทม์ไลน์ที่คำร้องนี้ปักหมุด (ดู lib/pm/templates.js)
//   dealType    ชนิดดีลที่ใช้ชนิดคำร้องนี้ได้ (ใช้เตือน ไม่ได้บล็อก)
export const REQUEST_KINDS = {
  info: {
    label: 'สอบถามข้อมูล',
    dept: null, scope: 'RQ', hasItems: false, needsDeal: false,
    hint: 'ถามอะไรก็ได้ที่ยังไม่มีชนิดเฉพาะ — ตอบกันในเธรด',
  },
  scent_brief: {
    label: 'แจ้งบรีฟออกแบบกลิ่น',
    dept: 'RD', scope: 'SB', hasItems: false, needsDeal: true,
    stepKey: 'scent-06', dealType: 'SCENT',
    hint: 'ส่งบรีฟให้ RD เริ่มออกแบบกลิ่น — ปิดเคสแล้วกลิ่นเข้าทะเบียน',
  },
  mockup: {
    label: 'ขอ Mock-up',
    dept: 'RD', scope: 'MU', hasItems: false, needsDeal: true,
    stepKey: 'npd-15', dealType: 'NPD',
    hint: 'ขอตัวอย่างสินค้าจริงจาก RD',
  },
  price_f: {
    label: 'ขอราคาหัวน้ำหอม (F)',
    dept: 'RD', scope: 'RM', hasItems: true, needsDeal: false, refs: 'scent',
    hint: 'อ้างกลิ่นที่ลูกค้าคอนเฟิร์มแล้ว — ตอบแล้วราคาเข้าทะเบียนวัสดุ',
  },
  price_fb: {
    label: 'ขอราคาเนื้อสาร (FB)',
    dept: 'RD', scope: 'RM', hasItems: true, needsDeal: false, refs: 'formula',
    hint: 'อ้างสูตรที่ลูกค้าคอนเฟิร์มแล้ว — ตอบแล้วราคาเข้าทะเบียนวัสดุ',
  },
  price_pm: {
    label: 'ขอราคาบรรจุภัณฑ์ (PM)',
    dept: 'PC', scope: 'PM', hasItems: true, needsDeal: false,
    stepKey: 'npd-25',
    hint: 'สเปก + รูป + ชั้นจำนวน — ตรงกับขั้น "หาบรรจุภัณฑ์ที่ลูกค้าต้องการ"',
  },
  document: {
    label: 'ขอเอกสาร',
    dept: null, scope: 'RQ', hasItems: false, needsDeal: true,
    hint: 'ขอเอกสาร/ใบรับรองจากฝ่ายที่ถือของ',
  },
  material_eta: {
    label: 'ติดตามของเข้า (PM/RM)',
    dept: 'PC', scope: 'RQ', hasItems: false, needsDeal: false,
    stepKey: 'npd-38',
    hint: 'ขอให้ฝ่ายจัดซื้ออัปเดตกำหนดของเข้าทั้งชุด',
  },
};

export const REQUEST_KIND_LIST = Object.keys(REQUEST_KINDS);

export function isRequestKind(kind) {
  return Object.prototype.hasOwnProperty.call(REQUEST_KINDS, kind);
}

export function requestKindMeta(kind) {
  return REQUEST_KINDS[kind] || null;
}

export function requestKindLabel(kind) {
  return REQUEST_KINDS[kind]?.label || kind || '—';
}

export function requestHasItems(kind) {
  return !!REQUEST_KINDS[kind]?.hasItems;
}

export function requestNeedsDeal(kind) {
  return !!REQUEST_KINDS[kind]?.needsDeal;
}

export function requestStepKey(kind) {
  return REQUEST_KINDS[kind]?.stepKey || null;
}

export function requestRefs(kind) {
  return REQUEST_KINDS[kind]?.refs || null;
}

// ฝ่ายผู้ตอบของคำร้อง — ชนิดที่ผูกฝ่ายตายตัวใช้ค่านั้น, ชนิดที่ไม่ผูก (สอบถาม/
// ขอเอกสาร) ให้ผู้ขอเลือกเอง แต่ต้องเป็น RD/PC เท่านั้น (CHECK ของตารางยังคุมอยู่)
export const REQUEST_DEPTS = ['RD', 'PC'];

export function deptForRequest(kind, { dept, items } = {}) {
  const fixed = REQUEST_KINDS[kind]?.dept;
  if (fixed) return fixed;
  // ชนิดขอราคาที่ไม่ได้ล็อกฝ่ายไว้: อนุมานจากชนิดวัสดุของรายการแรก (พฤติกรรมเดิม
  // ของเคสขอราคา — ไม่ให้ client กำหนดเองแล้วส่งผิดฝ่าย)
  const firstKind = items?.[0]?.kind;
  if (MATERIAL_KINDS.includes(firstKind)) return sourceDeptForMaterialKind(firstKind);
  return REQUEST_DEPTS.includes(dept) ? dept : null;
}

// scope เลขที่: RM- / PM- คงเดิมจากเคสขอราคา (มติ 7 — ดูเลขแล้วรู้ว่าเป็นงานฝ่ายไหน)
// SB- / MU- แยกให้สองงานพัฒนาของ RD ค้นย้อนหลังง่าย · ที่เหลือรวมเป็น RQ-
export function requestDocScope(kind, dept) {
  const scope = REQUEST_KINDS[kind]?.scope;
  if (scope) return scope;
  return dept === 'PC' ? 'PM' : 'RM';
}

// ── ด่านตรวจตอนสร้าง — คืนข้อความไทย หรือ null ถ้าผ่าน ──────────────────
// ⚠️ กฎขึ้นกับ "ชนิด" ทั้งหมด จึงตรวจที่นี่ที่เดียว ไม่ใช่กระจายใน handler
export function requestShapeError(kind, body = {}) {
  if (!isRequestKind(kind)) return 'ชนิดคำร้องไม่ถูกต้อง';
  const meta = REQUEST_KINDS[kind];

  if (meta.hasItems) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return 'ต้องมีรายการอย่างน้อย 1 รายการ';
    }
  } else if (!String(body.title ?? '').trim()) {
    // ชนิดที่ไม่มีบรรทัดต้องมีหัวเรื่อง ไม่งั้นคิวอ่านไม่รู้เรื่องว่าใครขออะไร
    return 'ต้องระบุหัวเรื่อง';
  }

  if (meta.needsDeal && !body.dealId) return 'ต้องเลือกดีลที่เกี่ยวข้อง';
  if (meta.refs === 'scent' && !body.scentId) return 'ต้องเลือกกลิ่นจากทะเบียน';
  if (meta.refs === 'formula' && !body.formulaId) return 'ต้องเลือกสูตรจากทะเบียน';

  const title = String(body.title ?? '');
  if (title.length > 200) return 'หัวเรื่องยาวเกิน 200 ตัวอักษร';
  const text = String(body.body ?? '');
  if (text.length > 4000) return 'รายละเอียดยาวเกิน 4000 ตัวอักษร';

  for (const field of ['requestedDueDate']) {
    const v = body[field];
    if (v && !/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return 'วันที่ที่ต้องการคำตอบไม่ถูกต้อง';
  }
  return null;
}
