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
//   dept        ฝ่ายผู้ตอบที่ล็อกไว้ (null = ผู้ขอเลือกเองได้ทั้ง RD/PC)
//   scope       scope เลขที่เอกสาร (ออกตอนกดส่ง ไม่ใช่ตอนสร้างร่าง)
//   hasItems    มีบรรทัดรายการ + ชั้นจำนวน (ชนิดขอราคาเท่านั้น)
//   refs        ต้องอ้างของในทะเบียนอะไร ('scent' | 'formula')
//   stepKey     ขั้นปลายทางในไทม์ไลน์ที่คำร้องนี้ปักหมุด (ดู lib/pm/templates.js)
//   dealType    ชนิดดีลที่ใช้ชนิดคำร้องนี้ได้ (ใช้เตือน ไม่ได้บล็อก)
//
// ⭐ **ไม่มีธง `needsDeal` แล้ว (มติผู้ใช้ 2026-08-03)** — คำร้องทุกชนิดต้องผูก
// โครงการ+ดีล ไม่มีข้อยกเว้น · นี่คือการ **กลับมติ 5 เดิม** (ที่ยกเว้นชนิดขอราคา
// ไว้เพราะมี "ราคากลาง" ที่ไม่ผูกลูกค้า) โดยผู้ใช้ยืนยันหลังทราบผลกระทบแล้วว่า
// ราคากลางที่ไม่ผูกดีลจะเปิดจากคำร้องไม่ได้อีก
// → ธงที่ *ไม่มี* ดีกว่าธงที่ทุกตัวเป็น true เท่ากัน: อ่านแล้วรู้ทันทีว่าไม่มีทางเลือก
export const REQUEST_KINDS = {
  info: {
    label: 'สอบถามข้อมูล',
    dept: null, scope: 'RQ', hasItems: false,
    hint: 'ถามอะไรก็ได้ที่ยังไม่มีชนิดเฉพาะ — ตอบกันในเธรด',
  },
  scent_brief: {
    label: 'แจ้งบรีฟออกแบบกลิ่น',
    dept: 'RD', scope: 'SB', hasItems: false,
    stepKey: 'scent-06', dealType: 'SCENT',
    hint: 'ส่งบรีฟให้ RD เริ่มออกแบบกลิ่น — ปิดเคสแล้วกลิ่นเข้าทะเบียน',
  },
  mockup: {
    label: 'ขอ Mock-up',
    dept: 'RD', scope: 'MU', hasItems: false,
    stepKey: 'npd-15', dealType: 'NPD',
    hint: 'ขอตัวอย่างสินค้าจริงจาก RD',
  },
  price_f: {
    label: 'ขอราคาหัวน้ำหอม (F)',
    dept: 'RD', scope: 'RM', hasItems: true, refs: 'scent',
    hint: 'อ้างกลิ่นที่ลูกค้าคอนเฟิร์มแล้ว — ตอบแล้วราคาเข้าทะเบียนวัสดุ',
  },
  price_fb: {
    label: 'ขอราคาเนื้อสาร (FB)',
    dept: 'RD', scope: 'RM', hasItems: true, refs: 'formula',
    hint: 'อ้างสูตรที่ลูกค้าคอนเฟิร์มแล้ว — ตอบแล้วราคาเข้าทะเบียนวัสดุ',
  },
  price_pm: {
    label: 'ขอราคาบรรจุภัณฑ์ (PM)',
    dept: 'PC', scope: 'PM', hasItems: true,
    stepKey: 'npd-25',
    hint: 'สเปก + รูป + ชั้นจำนวน — ตรงกับขั้น "หาบรรจุภัณฑ์ที่ลูกค้าต้องการ"',
  },
  document: {
    label: 'ขอเอกสาร',
    dept: null, scope: 'RQ', hasItems: false,
    hint: 'ขอเอกสาร/ใบรับรองจากฝ่ายที่ถือของ',
  },
  material_eta: {
    label: 'ติดตามของเข้า (PM/RM)',
    dept: 'PC', scope: 'RQ', hasItems: false,
    stepKey: 'npd-38',
    hint: 'ขอให้ฝ่ายจัดซื้ออัปเดตกำหนดของเข้าทั้งชุด',
  },
};

export const REQUEST_KIND_LIST = Object.keys(REQUEST_KINDS);

// ชนิดวัสดุ → ชนิดคำร้องขอราคาที่คู่กัน
// ใช้ตอนเปิดคำร้องจาก "บรรทัดในใบขอราคาผลิต" ซึ่งบรรทัดเป็นตัวบอกอยู่แล้วว่ากำลัง
// ถามอะไร — ผู้ใช้ไม่ควรต้องเลือกชนิดซ้ำ และเลือกผิดไม่ได้ด้วย
export const REQUEST_KIND_BY_MATERIAL = {
  RM_F: 'price_f',
  RM_FB: 'price_fb',
  PM: 'price_pm',
};

export function kindForMaterial(materialKind) {
  return REQUEST_KIND_BY_MATERIAL[materialKind] || null;
}

// ทางกลับ: ชนิดคำร้อง → ชนิดวัสดุที่บรรทัดต้องเป็น
//
// ⭐ เดิมทิศทางเดียว (วัสดุ → คำร้อง) เพราะฟอร์มให้เลือกชนิดวัสดุก่อนแล้วอนุมานฝ่าย
// ตอนนี้ฟอร์มเลือกฝ่าย → หัวข้อ ก่อนเสมอ (มติ 2026-08-03) ชนิดวัสดุจึงเป็นผลลัพธ์
// ไม่ใช่ตัวตั้ง → ทุกบรรทัดในใบเดียวเป็นชนิดเดียวกันโดยโครงสร้าง ไม่ต้องมีกฎ
// "ทุกรายการต้องเป็นฝ่ายเดียวกัน" ให้ผู้ใช้ทำผิดได้อีก
export const MATERIAL_KIND_BY_REQUEST = Object.fromEntries(
  Object.entries(REQUEST_KIND_BY_MATERIAL).map(([mk, rk]) => [rk, mk]),
);

export function materialKindForRequest(kind) {
  return MATERIAL_KIND_BY_REQUEST[kind] || null;
}

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

// ชนิดที่ส่งถึงฝ่ายนี้ได้ — ใช้กรองรายการ "หัวข้อ" ในฟอร์มหลังผู้ใช้เลือกฝ่าย
//
// ⭐ ลำดับในฟอร์มกลับทางกับของเดิม (มติผู้ใช้ 2026-08-03): เดิมเลือกหัวข้อแล้ว
// ระบบอนุมานฝ่ายให้ · ตอนนี้ **เลือกฝ่ายก่อน แล้วหัวข้อถูกกรองตามฝ่าย** — คนเปิด
// คำร้องคิดจาก "จะถามใคร" ก่อน "ถามเรื่องอะไร" เสมอ
// ชนิดที่ dept = null (สอบถาม/ขอเอกสาร) ส่งถึงฝ่ายไหนก็ได้ จึงอยู่ในทุกฝ่าย
export function kindsForDept(dept) {
  if (!REQUEST_DEPTS.includes(dept)) return [];
  return REQUEST_KIND_LIST.filter((k) => {
    const fixed = REQUEST_KINDS[k].dept;
    return !fixed || fixed === dept;
  });
}

// ฝ่ายที่ส่งมาต้องเข้ากับชนิด — คืนข้อความไทย หรือ null ถ้าผ่าน
//
// ⚠️ ชนิดที่ล็อกฝ่ายไว้ **ไม่ override เงียบ ๆ** อีกแล้ว: ก่อนหน้านี้ `deptForRequest`
// ทิ้งค่าที่ client ส่งมาโดยไม่บอกใคร ซึ่งเคยพอสำหรับตอนที่ฟอร์มไม่ให้เลือกฝ่าย —
// แต่ตอนนี้ผู้ใช้ *เห็นและเลือกฝ่ายเอง* ถ้าเลือกแล้วระบบเงียบ ๆ ส่งไปฝ่ายอื่น
// คนขอจะรอคำตอบจากฝ่ายที่ไม่เคยได้รับเรื่อง
export function requestDeptError(kind, dept) {
  if (!isRequestKind(kind)) return 'ชนิดคำร้องไม่ถูกต้อง';
  if (!REQUEST_DEPTS.includes(dept)) return 'ต้องระบุฝ่ายที่ต้องการให้ตอบ';
  const fixed = REQUEST_KINDS[kind].dept;
  if (fixed && fixed !== dept) {
    return `"${requestKindLabel(kind)}" เป็นงานของฝ่าย ${fixed} ส่งถึงฝ่าย ${dept} ไม่ได้`;
  }
  return null;
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

  // ── โครงการ + ดีล บังคับทุกชนิด (มติผู้ใช้ 2026-08-03) ─────────────────
  // ถามก่อนทุกข้อเพราะเป็นข้อแรกในฟอร์ม — ตีกลับเรื่องท้าย ๆ ก่อนทั้งที่ข้อแรก
  // ยังไม่ครบ ทำให้ผู้ใช้ไล่แก้ผิดที่
  //
  // ⚠️ `projectId` **ไม่รับจาก client** (POST ดึงจากดีลเอง) — ที่นี่จึงตรวจแค่ดีล
  // ส่วน "ดีลนี้ผูกโครงการหรือยัง" เป็นด่านของ handler ที่มองเห็นแถวดีลจริง
  if (!body.dealId) return 'ต้องเลือกโครงการและดีลที่เกี่ยวข้อง';

  // หัวเรื่องบังคับ**ทุกชนิด** — เดิมชนิดขอราคายกเว้นไว้เพราะสื่อความด้วยบรรทัด
  // วัสดุ แต่บนคิวรวมและในเธรดดีล บรรทัดวัสดุมองไม่เห็น เหลือแต่ช่องว่าง
  if (!String(body.title ?? '').trim()) return 'ต้องระบุชื่อเรื่อง';

  if (meta.hasItems && (!Array.isArray(body.items) || body.items.length === 0)) {
    return 'ต้องมีรายการอย่างน้อย 1 รายการ';
  }

  if (meta.refs === 'scent' && !body.scentId) return 'ต้องเลือกกลิ่นจากทะเบียน';
  if (meta.refs === 'formula' && !body.formulaId) return 'ต้องเลือกสูตรจากทะเบียน';

  if (String(body.title ?? '').length > 200) return 'ชื่อเรื่องยาวเกิน 200 ตัวอักษร';
  if (String(body.body ?? '').length > 4000) return 'รายละเอียดยาวเกิน 4000 ตัวอักษร';

  const due = body.requestedDueDate;
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(String(due))) return 'วันที่ที่ต้องการคำตอบไม่ถูกต้อง';
  return null;
}
