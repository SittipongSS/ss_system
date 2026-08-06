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
import { templateFor } from '@/lib/pm/templates';
import { REQUEST_KINDS } from '@/lib/requests/kinds/registry';

// ── ธงต่อชนิด ────────────────────────────────────────────────────────────
//   dept        ฝ่ายผู้ตอบที่ล็อกไว้ (null = ผู้ขอเลือกเองได้ทั้ง RD/PC)
//   scope       scope เลขที่เอกสาร (ออกตอนกดส่ง ไม่ใช่ตอนสร้างร่าง)
//   hasItems    มีบรรทัดรายการไหม (รูปร่างบรรทัดบอกด้วย lineShape)
//   needs       ของที่ต้องอ้างถึงก่อนส่งได้ (ดู REQUEST_NEEDS ข้างล่าง)
//   stepKey     ขั้นปลายทางในไทม์ไลน์ที่คำร้องนี้ปักหมุด (ดู lib/pm/templates.js)
//   dealType    ชนิดดีลที่ใช้ชนิดคำร้องนี้ได้ (ใช้เตือน ไม่ได้บล็อก)
//
// ⭐⭐ **มติผู้ใช้ 2026-08-03 (รอบสอง) — "สิ่งที่ต้องอ้าง" ต่างกันตามงานจริง**
// รอบแรกบังคับโครงการ+ดีลทุกหัวข้อเท่ากันหมด ซึ่งผิดกับความจริงของงานสองข้อ:
//
// 1. **ขอราคา (F/FB/PM) ไม่ต้องผูกดีล** — กลิ่นกับสูตรผูกลูกค้าอยู่แล้ว จะเอาไปใช้
//    รอบไหนเมื่อไรก็ได้ · วัสดุเป็นราคากลางที่ใช้ข้ามงานได้ · ผูกดีลคือมัดราคาไว้
//    กับรอบเดียวทั้งที่มันเป็นข้อมูลหลักที่ใช้ซ้ำ
// 2. **บรีฟกลิ่นต้องมี SO ไม่ใช่แค่ดีล** — ออกแบบกลิ่นมีค่าบริการ · ยืนยันกับ
//    `SCENT_TEMPLATE` แล้ว: ขั้น 6 "ออกแบบกลิ่น" มี `dependsOnSteps: [4, 5]`
//    โดยขั้น 4 = "ใบสั่งขายออกแบบกลิ่น" → แม่แบบบอกเองว่าเริ่มได้เมื่อมี SO
//    ⚠️ prod มี sales_orders = 0 ใบ (นับ 2026-08-03) → บรีฟกลิ่นจะเปิดไม่ได้เลย
//    จนกว่าจะมี SO ใบแรก · ผู้ใช้ยืนยันเลือก "บังคับตอนเปิด" หลังทราบข้อนี้แล้ว
// ⭐ **ตารางนี้ไม่ได้อยู่ที่นี่แล้ว** — ประกอบจากบ้านของแต่ละฝ่ายที่
// `lib/requests/kinds/{rd,pc,shared}/` (โจทย์ข้อแรกของผู้ใช้: แต่ละฝ่ายขยายเองได้)
// ไฟล์นี้เหลือหน้าที่เดียวคือ **กฎที่ใช้ร่วมกันทุกหัวข้อ** + เป็นหน้าร้านให้ผู้เรียกเดิม
// ~12 จุดไม่ต้องแก้ · เพิ่มหัวข้อใหม่ **ห้ามมาแก้ไฟล์นี้** ให้ไปเพิ่มในโฟลเดอร์ของฝ่าย
export { REQUEST_KINDS };

// ของที่คำร้องอ้างถึงได้ → ช่องใน body + ข้อความตอนขาด
// ⚠️ ที่เดียวของระบบ: เพิ่มของใหม่ต้องแก้ที่นี่แล้วทั้งฟอร์มและ API ได้ตามกันเอง
export const REQUEST_NEEDS = {
  project: { field: 'projectId', error: 'ต้องเลือกโครงการ' },
  deal: { field: 'dealId', error: 'ต้องเลือกดีลที่เกี่ยวข้อง' },
  salesOrder: { field: 'salesOrderId', error: 'ต้องเลือกใบสั่งขาย (SO) ที่ครอบค่าบริการออกแบบกลิ่น' },
  scent: { field: 'scentId', error: 'ต้องเลือกกลิ่นจากทะเบียน' },
  formula: { field: 'formulaId', error: 'ต้องเลือกสูตรจากทะเบียน' },
};

export const REQUEST_KIND_LIST = Object.keys(REQUEST_KINDS);

// ⚠️ **แมป "ชนิดวัสดุ ↔ หัวข้อขอราคา" ถูกถอดทั้งบล็อกใน mig 0219** (มติ ม-28) —
// `REQUEST_KIND_BY_MATERIAL` / `kindForMaterial` / `materialKindForRequest` มีอยู่
// เพื่อเปิดคำร้องขอราคาจากบรรทัดในใบขอราคาผลิต ซึ่งเป็นสะพานเข้าหาหัวข้อที่ไม่มีแล้ว
// ⇒ ปุ่ม "ขอราคา" บนหน้า /sa/costing ถูกถอดพร้อมกัน (ไม่ใช่ปล่อยให้กดแล้ว 400)

export function isRequestKind(kind) {
  return Object.prototype.hasOwnProperty.call(REQUEST_KINDS, kind);
}

export function requestKindMeta(kind) {
  return REQUEST_KINDS[kind] || null;
}

export function requestKindLabel(kind) {
  return REQUEST_KINDS[kind]?.label || kind || '—';
}

// หัวข้อนี้ใช้แบบฟอร์ม PDR ไหม — ฟอร์มอ่านธงจากทะเบียน ไม่เช็คชื่อหัวข้อเอง
export function requestHasPdr(kind) {
  return !!REQUEST_KINDS[kind]?.hasPdr;
}

// หัวข้อนี้ต้องผ่านหัวหน้าสายงานขายก่อนฝ่ายปลายทางลงมือไหม (mig 0216)
export function requestNeedsApprovalKind(kind) {
  return !!REQUEST_KINDS[kind]?.needsSupervisorApproval;
}

// หัวข้อนี้บังคับใส่วันกำหนดส่งตอนรับเรื่องไหม (มติผู้ใช้ 2026-08-06 · รายชนิด)
export function requestRequiresCommittedDue(kind) {
  return !!REQUEST_KINDS[kind]?.requiresCommittedDueDate;
}

export function requestHasItems(kind) {
  return !!REQUEST_KINDS[kind]?.hasItems;
}

// ของที่หัวข้อนี้ต้องอ้างถึง — คืนรายชื่อคีย์ของ REQUEST_NEEDS
export function requestNeeds(kind) {
  return REQUEST_KINDS[kind]?.needs || [];
}

export function requestNeedsRef(kind, ref) {
  return requestNeeds(kind).includes(ref);
}

export function requestStepKey(kind) {
  return REQUEST_KINDS[kind]?.stepKey || null;
}

// ป้ายขั้นในไทม์ไลน์ของหัวข้อ — "ออกแบบกลิ่น (SCENT 6)" · null เมื่อหัวข้อไม่ปักหมุด
//
// ⭐ **อ่านชื่อจากแม่แบบ ไม่ก๊อปมาเก็บ** — `stepKey` ('scent-06') เป็นของที่มีอยู่แล้ว
// บนหัวข้อและบนแถวคำร้อง (ดู lib/requests/pins.js) · เขียนชื่อขั้นซ้ำไว้ที่นี่เมื่อไร
// จะเป็นแหล่งความจริงที่สองที่ drift ได้ทันทีที่มีคนแก้ชื่อขั้นในแม่แบบ
export function requestStepLabel(kind) {
  const stepKey = requestStepKey(kind);
  const parsed = /^(.+)-(\d+)$/.exec(stepKey || '');
  if (!parsed) return null;
  const type = parsed[1].toUpperCase();
  const step = Number(parsed[2]);
  const row = templateFor(type).find((t) => t.step === step);
  return row ? `${row.name} (${type} ${step})` : null;
}

// ⚠️ `requestRefs` เดิมถูกถอด — ธง `refs: 'scent'|'formula'` เก็บได้ค่าเดียวและ
// ไม่มีที่ให้ "โครงการ+ดีล+กลิ่น+ประเภทสินค้า" ของ Mock-up · ใช้ `requestNeeds()` แทน

// ฝ่ายผู้ตอบของคำร้อง — ชนิดที่ผูกฝ่ายตายตัวใช้ค่านั้น, ชนิดที่ไม่ผูก (สอบถาม/
// ขอเอกสาร) ให้ผู้ขอเลือกเอง แต่ต้องเป็น RD/PC เท่านั้น (CHECK ของตารางยังคุมอยู่)
export const REQUEST_DEPTS = ['RD', 'PC', 'FN'];

export const REQUEST_DEPT_LABELS = {
  RD: { code: 'RD', name: 'วิจัยและพัฒนา' },
  PC: { code: 'PC', name: 'จัดซื้อ' },
  FN: { code: 'FN', name: 'บัญชี' },
};

// ⚠️ ฝ่ายที่ **ยังเปิดไม่ได้** — โผล่ในฟอร์มแบบจางและกดไม่ได้ ไม่ใช่ซ่อน (มติผู้ใช้:
// ตัวเลือกที่ไม่มีสิทธิ์ต้องเห็นว่ามีอยู่ ไม่งั้นคนจะไปหาที่อื่น) · **ห้ามย้ายเข้า
// `REQUEST_DEPTS`** จนกว่า P7 จะผ่อน CHECK ของ `dept_requests.dept` — ย้ายก่อนแล้ว
// ฟอร์มจะยอมให้ส่ง แล้วไปตายที่ constraint ด้วย error ดิบที่อ่านไม่รู้เรื่อง
export const PLANNED_REQUEST_DEPTS = [];

// หัวกลุ่มในดรอปดาวน์หัวข้อ — ตระกูลมาจาก `scope` ที่หัวข้อมีอยู่แล้ว ไม่ใช่ธงใหม่
const KIND_FAMILY_LABEL = {
  SB: 'งานพัฒนา', FD: 'งานพัฒนา', MU: 'งานพัฒนา',
  RQ: 'ทั่วไป',
};

export function requestKindFamily(kind) {
  return KIND_FAMILY_LABEL[REQUEST_KINDS[kind]?.scope] || 'ทั่วไป';
}

// ⚠️ เดิมมีสาขาที่อนุมานฝ่ายจาก **ชนิดวัสดุของบรรทัดแรก** สำหรับหัวข้อขอราคาที่ไม่ได้
// ล็อกฝ่ายไว้ — หัวข้อพวกนั้นถูกถอดใน mig 0219 และหัวข้อที่เหลือทุกตัวที่มีบรรทัด
// ล็อกฝ่ายไว้แล้ว ⇒ เหลือสองทาง: ฝ่ายจากทะเบียน หรือฝ่ายที่ผู้ขอเลือกเอง
export function deptForRequest(kind, { dept } = {}) {
  const fixed = REQUEST_KINDS[kind]?.dept;
  if (fixed) return fixed;
  return REQUEST_DEPTS.includes(dept) ? dept : null;
}

// ชนิดที่ส่งถึงฝ่ายนี้ได้ — ใช้กรองรายการ "หัวข้อ" ในฟอร์มหลังผู้ใช้เลือกฝ่าย
//
// ⭐ ลำดับในฟอร์มกลับทางกับของเดิม (มติผู้ใช้ 2026-08-03): เดิมเลือกหัวข้อแล้ว
// ระบบอนุมานฝ่ายให้ · ตอนนี้ **เลือกฝ่ายก่อน แล้วหัวข้อถูกกรองตามฝ่าย** — คนเปิด
// คำร้องคิดจาก "จะถามใคร" ก่อน "ถามเรื่องอะไร" เสมอ
// ชนิดที่ dept = null (สอบถาม/ขอเอกสาร) ส่งถึงฝ่ายไหนก็ได้ จึงอยู่ในทุกฝ่าย
// หัวข้อที่ "เปิดใบใหม่ได้" ของฝ่ายนี้
//
// ⚠️ กรอง `legacy` ออกที่นี่ที่เดียว — ฟอร์มเอาลิสต์จากฟังก์ชันนี้ทางเดียว ส่วน
// `requestKindLabel` ยังรู้จักหัวข้อเก่าครบ ⇒ ใบที่เปิดไปแล้วยังมีป้ายชื่ออ่านได้
// (ลบหัวข้อทิ้งเมื่อไร ใบเก่าบน prod จะกลายเป็นชื่อ key ดิบบนหน้าจอ)
// รูปร่างของบรรทัดตามหัวข้อ — 'product_dev' | 'document' | 'billing_doc' | null
//
// ⚠️ ที่เดียวของระบบ · ก่อนหน้านี้ route กับฟอร์มเช็ค `kind === 'product_dev'` เอง
// ซึ่งพอมีรูปร่างที่สามก็ต้องไล่แก้ทุกจุดที่เช็คแบบนั้น
//
// ⚠️ **ไม่มีค่าถอยหลังแล้ว** — เดิมหัวข้อที่มีบรรทัดแต่ไม่ประกาศ `lineShape` ตกไปเป็น
// 'material' เงียบ ๆ · รูปร่างนั้นถูกถอดใน mig 0219 ⇒ ทะเบียนบังคับให้ประกาศเอง
// (`registry.js` โยนตอนโหลดถ้า hasItems แล้วไม่มี lineShape)
export function lineShapeForKind(kind) {
  const meta = REQUEST_KINDS[kind];
  if (!meta?.hasItems) return null;
  return meta.lineShape || null;
}

export function kindsForDept(dept) {
  if (!REQUEST_DEPTS.includes(dept)) return [];
  const list = REQUEST_KIND_LIST.filter((k) => {
    if (REQUEST_KINDS[k].legacy) return false;
    const fixed = REQUEST_KINDS[k].dept;
    return !fixed || fixed === dept;
  });
  // 🐞 **เรียงให้ตระกูลติดกันก่อนคืน** — `Select` ขึ้นหัวกลุ่มเมื่อกลุ่มของแถวต่างจาก
  // แถวก่อนหน้า ⇒ ลิสต์ที่ตระกูลไม่ติดกันทำให้ **หัวกลุ่มเดิมโผล่ซ้ำ** · ของจริงบนจอ
  // ตอน PR #1003: ฝ่าย RD ได้ "ทั่วไป(สอบถามข้อมูล) → งานพัฒนา → ขอราคา →
  // ทั่วไป(ขอเอกสาร)" · เรียงที่นี่ไม่ใช่ที่ฟอร์ม เพราะลิสต์นี้เป็นของ API ด้วย
  // และสองที่ต้องเห็นลำดับเดียวกัน
  //
  // ⚠️ ลำดับ *ของตระกูล* มาจากลำดับที่เจอครั้งแรกในทะเบียน ไม่ใช่ลิสต์ตายตัว —
  // ฝ่ายที่เพิ่มหัวข้อใหม่จึงไม่ต้องมาลงทะเบียนตระกูลของตัวเองที่ไฟล์นี้อีกจุด
  const order = [];
  for (const k of list) {
    const family = requestKindFamily(k);
    if (!order.includes(family)) order.push(family);
  }
  return list.slice().sort(
    (a, b) => order.indexOf(requestKindFamily(a)) - order.indexOf(requestKindFamily(b)),
  );
}

// เปิดใบใหม่ด้วยหัวข้อนี้ได้ไหม — ด่านฝั่ง server (ฟอร์มกรองแล้ว แต่ยิงตรงยังได้)
export function legacyKindError(kind) {
  if (!REQUEST_KINDS[kind]?.legacy) return null;
  return `"${requestKindLabel(kind)}" เลิกใช้แล้ว — เปิดใบใหม่ด้วยหัวข้อปัจจุบันแทน`;
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

  // ── ของที่หัวข้อนี้ต้องอ้างถึง (มติผู้ใช้ 2026-08-03 รอบสอง) ────────────
  // ถามก่อนทุกข้อเพราะอยู่ต้นฟอร์ม — ตีกลับเรื่องท้าย ๆ ก่อนทั้งที่ข้อแรกยังไม่ครบ
  // ทำให้ผู้ใช้ไล่แก้ผิดที่ · ลำดับตามที่ประกาศใน needs = ลำดับที่ฟอร์มถาม
  //
  // ⚠️ `projectId` ของหัวข้อที่ต้องมีดีล **ไม่ต้องรับจาก client ก็ได้** — POST ดึงจาก
  // แถวดีลเสมอ · ที่ตรวจตรงนี้คือ "ผู้ใช้เลือกครบหรือยัง" ฝั่งจอ ส่วนความถูกต้องของ
  // ความสัมพันธ์ (ดีลนี้อยู่โครงการนั้นจริงไหม / SO ใบนี้ของดีลไหน) เป็นด่านของ
  // handler ที่มองเห็นแถวจริง
  for (const ref of meta.needs || []) {
    const spec = REQUEST_NEEDS[ref];
    if (spec && !body[spec.field]) return spec.error;
  }

  // ชื่อเรื่องบังคับ**ทุกหัวข้อ** — เดิมหัวข้อขอราคายกเว้นไว้เพราะสื่อความด้วยบรรทัด
  // วัสดุ แต่บนคิวรวมและในเธรดดีล บรรทัดวัสดุมองไม่เห็น เหลือแต่ช่องว่าง
  if (!String(body.title ?? '').trim()) return 'ต้องระบุชื่อเรื่อง';

  if (meta.hasItems && (!Array.isArray(body.items) || body.items.length === 0)) {
    return 'ต้องมีรายการอย่างน้อย 1 รายการ';
  }

  if (String(body.title ?? '').length > 200) return 'ชื่อเรื่องยาวเกิน 200 ตัวอักษร';
  if (String(body.body ?? '').length > 4000) return 'รายละเอียดยาวเกิน 4000 ตัวอักษร';

  const due = body.requestedDueDate;
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(String(due))) return 'วันที่ที่ต้องการคำตอบไม่ถูกต้อง';
  return null;
}
