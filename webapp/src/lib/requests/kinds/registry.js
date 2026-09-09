// ── ทะเบียนหัวข้อคำร้อง — ประกอบจากบ้านของแต่ละฝ่าย ─────────────────────
//
// ⭐ **โจทย์ข้อแรกของผู้ใช้** (2026-08-04): *"จะมีโมดูลระบบแยกของแต่ละฝ่าย …
// เพื่อที่แต่ละฝ่ายจะได้ขยายระบบได้"* · ก่อนหน้านี้หัวข้อทุกฝ่ายอยู่ในตารางก้อนเดียว
// ใน `lib/master/requestTypes.js` ⇒ PC เพิ่มหัวข้อของตัวเองต้องไปแก้ไฟล์ที่ RD ก็แก้
// อยู่ ⇒ ชน merge กันเป็นประจำ และไม่มีขอบเขตว่าใครเป็นเจ้าของอะไร
//
// ตอนนี้: **1 ฝ่าย = 1 โฟลเดอร์ · 1 หัวข้อ = 1 ไฟล์** — เพิ่มหัวข้อใหม่ = เพิ่มไฟล์
// ในโฟลเดอร์ของฝ่ายตัวเอง แล้วต่อท้าย `kinds.js` ของฝ่ายนั้น ไฟล์นี้ไม่ต้องแก้เลย
//
// ⚠️ ไฟล์นี้ **ไม่ใช่ที่สำหรับใส่กฎของหัวข้อ** — มันแค่ประกอบและตรวจ · กฎอยู่ในไฟล์
// ของหัวข้อนั้น ๆ ไม่งั้นจะกลับไปเป็นตารางก้อนเดียวที่เพิ่งแยกออกมา
import RD_KINDS from './rd/kinds';
import PC_KINDS from './pc/kinds';
import FN_KINDS from './fn/kinds';
import TS_KINDS from './ts/kinds';
import SHARED_KINDS from './shared/kinds';

// ลำดับ: ของกลางก่อน แล้วเรียงตามฝ่าย — ⚠️ **ลำดับนี้ไม่ใช่ลำดับที่ผู้ใช้เห็น**
// ดรอปดาวน์จัดกลุ่มตามตระกูลเองที่ `kindsForDept` (ดู requestTypes.js)
const ALL = [...SHARED_KINDS, ...RD_KINDS, ...PC_KINDS, ...FN_KINDS, ...TS_KINDS];

// ── ด่านตอนโหลด ────────────────────────────────────────────────────────
//
// ⭐ **ตรวจตอน import ไม่ใช่ตอนใช้งาน** — ของเดิมเป็น object literal ที่ผิดยังไงก็
// ไม่มีใครบ่นจนกว่าจะมีคนเปิดคำร้องหัวข้อนั้นจริงบน prod · ตอนนี้หัวข้อที่ประกาศผิด
// ทำให้ **build พัง** ซึ่งเป็นที่ที่ถูกต้องกว่ามาก
//
// ⚠️ ห้ามเปลี่ยนเป็น "ข้ามหัวข้อที่ผิดแล้วเดินต่อ" — หัวข้อที่หายไปเงียบ ๆ คือใบที่
// เปิดไม่ได้โดยไม่มีข้อความบอกเหตุผล ซึ่งเป็นบั๊กที่หายากที่สุดในระบบนี้
const VALID_DEPTS = ['RD', 'PC', 'FN', 'TS'];
const VALID_REFS = ['project', 'deal', 'salesOrder', 'quotation', 'scent', 'formula', 'site'];
// อ้างอิงเพิ่มแบบไม่บังคับ (ม-88) — คนละชุดกับ needs: ของพวกนี้ **ว่างได้เสมอ**
// ⚠️ `quotation` อยู่ได้ทั้งสองชุด — เป็นอ้างอิงเสริมของขอเอกสาร RD (ม-88) แต่เป็น
// **ต้นทาง** ของขอเอกสารการเงิน (ม-ค) · หัวข้อเดียวประกาศได้ข้างเดียว (ด่านข้างล่าง)
const VALID_OPTIONAL_REFS = ['quotation', 'salesOrder', 'product'];
// ⚠️ `material` ถูกถอดใน mig 0219 พร้อมหัวข้อขอราคา (มติ ม-28) — ห้ามเพิ่มกลับ
// โดยไม่มีหัวข้อที่ใช้จริง รูปร่างที่ไม่มีหัวข้อไหนใช้คือโค้ดที่ไม่มีทางเดินถึง
const VALID_LINE_SHAPES = ['product_dev', 'document', 'billing_doc'];

// export เพื่อให้เทสต์พิสูจน์ได้ว่าด่านนี้ **ยิงจริง** — ด่านที่ไม่มีใครเคยเห็นมันทำงาน
// คือด่านที่อาจพังเงียบมานานแล้ว
/* ธงบูลีนที่ทะเบียนหัวข้อรู้จัก — เพิ่มธงใหม่ต้องมาเติมที่นี่ด้วย ไม่งั้นพิมพ์ผิดแล้วเงียบ
   ⚠️ `hasPdr` เพิ่งเข้าลิสต์ 2026-09-10 — มันอยู่บน `scent_dev` มาตั้งแต่ mig 0213
   โดย **ไม่เคยถูกตรวจชนิดเลย** ⇒ พิมพ์เป็น `hasPDR` เมื่อไรก็ผ่านด่านนี้เงียบ ๆ แล้ว
   ฟอร์ม PDR หายทั้งหัวข้อโดยไม่มี error ให้ใครเห็น (โรคเดียวกับที่คอมเมนต์ข้างล่างกัน) */
const BOOLEAN_FLAGS = ['hasItems', 'deliversRows', 'cancelBeforeAckOnly', 'hasPdr'];

/* ⭐ **คีย์ระดับบนสุดที่ทะเบียนรู้จัก** (2026-09-10) — เดิมไม่มี whitelist เลย
   คอมเมนต์ข้างล่างในฟังก์ชันเขียนกับดักนี้ไว้เองแล้ว ("พิมพ์ชื่อธงผิดหนึ่งตัวจะผ่าน
   ด่านนี้เงียบ ๆ") แต่กันได้เฉพาะธงบูลีนที่มีชื่ออยู่ในลิสต์ ⇒ คีย์ที่พิมพ์ผิดทั้งตัว
   (`varaints`) ยังหลุด · ที่นี่ปิดทางนั้น: คีย์ที่ไม่รู้จัก = build พัง ไม่ใช่ธงที่เงียบ */
const KIND_KEYS = [
  'key', 'label', 'dept', 'scope', 'legacy', 'needs', 'optionalRefs',
  'hasItems', 'lineShape', 'lineKind', 'lineNoun', 'deliversRows', 'hasPdr',
  'cancelBeforeAckOnly', 'stepKey', 'dealType', 'form', 'summary', 'hint',
  'variants', 'defaultVariant',
];

/* ⭐ **รูปแบบงานในหัวข้อเดียว** (มติผู้ใช้ 2026-09-09 · พัฒนาสูตร standard | NPD) —
   ธงที่บอก "ใบหน้าตาแบบไหน" ย้ายจากระดับหัวข้อมาอยู่ในรูปแบบ เมื่อหัวข้อประกาศ
   `variants` · ที่เหลือ (ฝ่าย · scope · needs · stepKey) ยังเป็นของหัวข้อเพราะมัน
   คือ **ตัวตน** ของใบ ไม่ใช่รูปทรงของฟอร์ม
   ⚠️ ทำไมไม่แตกเป็นหัวข้อที่สอง: `kind` ฝังอยู่ใน `docNo` ซึ่ง DB ห้ามแก้
   (`guard_dept_request` · mig 0173) และผูก stepKey/ไทม์ไลน์ ⇒ สลับรูปแบบกลางคัน
   จะกลายเป็น "ลบใบเปิดใหม่" ซึ่งไม่ใช่สวิตช์ */
const VARIANT_FLAGS = ['label', 'hasItems', 'lineShape', 'deliversRows', 'hasPdr', 'hint'];

export function assertKind(kind, seen = new Set()) {
  const at = `หัวข้อคำร้อง "${kind?.key || '(ไม่มี key)'}"`;
  if (!kind?.key) throw new Error(`${at}: ต้องมี key`);
  if (seen.has(kind.key)) throw new Error(`${at}: key ซ้ำกับหัวข้ออื่น`);
  if (!kind.label) throw new Error(`${at}: ต้องมี label — ไม่งั้นใบเก่าจะขึ้นเป็น key ดิบ`);
  if (!kind.scope) throw new Error(`${at}: ต้องมี scope — เลขที่เอกสารออกจากค่านี้`);
  /* ⚠️ **รูปแบบต้องตรงกับที่ SQL ตรวจเป๊ะ** (`^[A-Z]{2,4}$` ใน `next_request_running_no`
     mig 0243) — ไม่งั้นพิมพ์ผิด (พิมพ์เล็ก/ยาวเกิน) จะผ่านด่านนี้แล้วไปตายตอนผู้ใช้
     **กดส่งจริง** ซึ่งเป็นจังหวะที่แย่ที่สุด · และ `requestDocScope` ไม่มีค่าเดารองรับ
     ให้แล้ว (ถอด `RM-`/`PM-` ออก 2026-08-18) ⇒ ด่านนี้คือที่กันจุดเดียว */
  if (!/^[A-Z]{2,4}$/.test(kind.scope)) {
    throw new Error(`${at}: scope "${kind.scope}" ต้องเป็นอักษรใหญ่ 2–4 ตัว (กติกาเดียวกับ SQL)`);
  }
  if (kind.dept != null && !VALID_DEPTS.includes(kind.dept)) {
    throw new Error(`${at}: dept "${kind.dept}" ไม่อยู่ใน CHECK ของ dept_requests.dept`);
  }
  for (const ref of kind.needs || []) {
    if (!VALID_REFS.includes(ref)) throw new Error(`${at}: needs "${ref}" ไม่มีใน REQUEST_NEEDS`);
  }
  /* 🪤 **คีย์ระดับบนสุดไม่เคยมี whitelist** — พิมพ์ชื่อธงผิดหนึ่งตัว (`cancelBeforeAckOnly`
     เป็น `cancelBeforeAck`) จะผ่านด่านนี้เงียบ ๆ แล้ว **ด่านที่พึ่งธงนั้นไม่ทำงาน**
     โดยไม่มี error ให้ใครเห็น · ธงบูลีนคือกลุ่มที่พลาดง่ายที่สุดเพราะไม่มีใครอ่านค่า
     ⇒ ตรวจชนิด และตรวจว่าชื่ออยู่ในทะเบียนที่รู้จัก */
  for (const flag of BOOLEAN_FLAGS) {
    if (flag in kind && typeof kind[flag] !== 'boolean') {
      throw new Error(`${at}: ธง "${flag}" ต้องเป็น true/false`);
    }
  }
  for (const ref of kind.optionalRefs || []) {
    if (!VALID_OPTIONAL_REFS.includes(ref)) {
      throw new Error(`${at}: optionalRefs "${ref}" ไม่รู้จัก`);
    }
    // ⚠️ ของชิ้นเดียวเป็นทั้ง "ต้องมี" และ "ถ้ามี" พร้อมกันไม่ได้ — ฟอร์มจะวาดช่อง
    // เดียวกันสองรอบ (บล็อกบังคับ + บล็อกอ้างอิงเพิ่ม) และเกจจะนับซ้ำ
    if ((kind.needs || []).includes(ref)) {
      throw new Error(`${at}: "${ref}" อยู่ทั้ง needs และ optionalRefs — เลือกข้างเดียว`);
    }
  }
  // หัวข้อที่มีบรรทัดต้องบอกด้วยว่าบรรทัดหน้าตาแบบไหน — ไม่บอก = ตกไปเป็น
  // 'material' เงียบ ๆ แล้วผู้ใช้เจอตารางวัสดุในหัวข้อที่ไม่เกี่ยวกับวัสดุ
  // (กฎอยู่ใน `assertShape` ข้างล่าง — ที่เดียว ใช้ทั้งหัวข้อและรูปแบบ)
  // ⚠️ `hasTiers` ไม่มีอีกแล้ว — ตาราง `dept_request_item_tiers` ถูก DROP ใน 0219
  // ตีกลับตั้งแต่ตอนโหลดถ้ามีใครประกาศมาอีก ไม่ใช่ปล่อยให้เป็นธงที่ไม่มีใครอ่าน
  if ('hasTiers' in kind) {
    throw new Error(`${at}: hasTiers ถูกถอดพร้อมชั้นจำนวนใน mig 0219 — เอาออก`);
  }
  // ⚠️ `needsSupervisorApproval` ไม่มีอีกแล้ว — ขั้น "ยืนยันให้ดำเนินการ" ถูกถอดออก
  // ทั้งขั้นตามมติผู้ใช้ 2026-08-16 (เดิม mig 0216) · ตีกลับตั้งแต่ตอนโหลดถ้ามีใคร
  // ประกาศมาอีก เพราะประตูเดิมกันแค่ทางเดียวจากสามทางเข้า (สร้างแถวเท่านั้น —
  // `answer` ระดับใบและก้าวรายแถวไม่เคยถูกกัน) ⇒ เปิดกลับมาแบบเดิมคือประตูที่รั่ว
  // ⚠️ `detailControlPanel` ไม่มีอีกแล้ว — เป็นธง **ย้ายทีละหัวข้อ** ที่ย้ายครบแล้ว
  // (ม-123) · หน้ารายละเอียดมีโครงเดียว ประกาศธงนี้ไม่มีผลอะไรนอกจากทำให้คนอ่าน
  // ทะเบียนเข้าใจว่ายังมีโครงที่สองอยู่
  if ('detailControlPanel' in kind) {
    throw new Error(`${at}: detailControlPanel ถูกถอดเมื่อทุกหัวข้อย้ายครบ (ม-123) — เอาออก`);
  }
  if ('needsSupervisorApproval' in kind) {
    throw new Error(`${at}: needsSupervisorApproval ถูกถอดออกทั้งขั้น (2026-08-16) — เอาออก`);
  }
  // ⚠️ คีย์ที่พิมพ์ผิดจะถูกกลืนโดย spread แล้วช่องนั้นใช้ข้อความกลางเงียบ ๆ —
  // ซึ่งเป็นอาการเดียวกับบั๊กที่เพิ่งปิดไป จึงตีกลับตั้งแต่ตอนโหลด
  for (const key of Object.keys(kind.form || {})) {
    if (!(key in FORM_DEFAULTS)) throw new Error(`${at}: form."${key}" ไม่ใช่คีย์ที่รู้จัก`);
  }
  for (const key of Object.keys(kind)) {
    if (!KIND_KEYS.includes(key)) throw new Error(`${at}: คีย์ "${key}" ไม่ใช่คีย์ที่ทะเบียนรู้จัก`);
  }
  /* ⭐ **กฎรูปทรงชุดเดียว ใช้ทั้งหัวข้อที่ไม่มีรูปแบบและทุกรูปแบบของหัวข้อที่มี** —
     ถ้าเขียนแยกสองชุด รูปแบบใหม่จะหลุดกฎที่หัวข้อธรรมดาโดนอยู่ (เช่น hasItems
     ที่ไม่มี lineShape ⇒ แถวที่ normalize ไม่ได้) */
  if (kind.variants) {
    for (const flag of ['hasItems', 'lineShape', 'deliversRows', 'hasPdr']) {
      if (flag in kind) {
        throw new Error(`${at}: ประกาศ "${flag}" ที่หัวข้อไม่ได้เมื่อมี variants — ย้ายไปไว้ในรูปแบบ`);
      }
    }
    const names = Object.keys(kind.variants);
    if (names.length < 2) throw new Error(`${at}: variants ต้องมีอย่างน้อย 2 รูปแบบ`);
    if (!kind.defaultVariant) throw new Error(`${at}: มี variants แล้วต้องบอก defaultVariant`);
    if (!names.includes(kind.defaultVariant)) {
      throw new Error(`${at}: defaultVariant "${kind.defaultVariant}" ไม่มีใน variants`);
    }
    for (const name of names) {
      const variant = kind.variants[name] || {};
      const atVariant = `${at} รูปแบบ "${name}"`;
      if (!variant.label) throw new Error(`${atVariant}: ต้องมี label — ปุ่มบนฟอร์มใช้ค่านี้`);
      for (const key of Object.keys(variant)) {
        if (!VARIANT_FLAGS.includes(key)) throw new Error(`${atVariant}: คีย์ "${key}" ไม่รู้จัก`);
      }
      for (const flag of BOOLEAN_FLAGS) {
        if (flag in variant && typeof variant[flag] !== 'boolean') {
          throw new Error(`${atVariant}: ธง "${flag}" ต้องเป็น true/false`);
        }
      }
      assertShape(variant, atVariant);
    }
  } else {
    assertShape(kind, at);
  }
}

/* กฎรูปทรงของ "ใบหน้าตาแบบไหน" — เรียกจาก assertKind ทั้งสองทาง (ดูข้างบน) */
function assertShape(shape, at) {
  if (shape.lineShape && !VALID_LINE_SHAPES.includes(shape.lineShape)) {
    throw new Error(`${at}: lineShape "${shape.lineShape}" ไม่รู้จัก`);
  }
  if (shape.lineShape && !shape.hasItems) throw new Error(`${at}: lineShape ต้องมากับ hasItems`);
  // ⭐ ทางกลับ: มีบรรทัดแล้วต้องบอกว่าบรรทัดหน้าตาแบบไหน — เดิมตกไปเป็น 'material'
  // เงียบ ๆ ซึ่งเป็นรูปร่างที่ไม่มีอยู่แล้ว ⇒ ตกหล่นตอนนี้ = แถวที่ normalize ไม่ได้
  if (shape.hasItems && !shape.lineShape) throw new Error(`${at}: hasItems ต้องมากับ lineShape`);
  // ฝ่ายสร้างแถวเองตอนส่ง = หัวข้อนั้นต้อง **ไม่มีบรรทัดตอนเปิด** ไม่งั้นจะได้แถว
  // สองชุด (ที่ผู้ขอกรอก กับที่ฝ่ายสร้าง) ที่ไม่มีใครรู้ว่าอันไหนคือของจริง
  if (shape.deliversRows && shape.hasItems) {
    throw new Error(`${at}: deliversRows ใช้กับหัวข้อที่มีบรรทัดตอนเปิดไม่ได้`);
  }
}

// ข้อความบนฟอร์มที่ **ทุกหัวข้อต้องมีครบ** — เติมค่ากลางให้ตัวที่ไม่ได้ประกาศเอง
//
// ⭐ ก่อนหน้านี้ข้อความพวกนี้เป็น `kind === '...'` เรียงกันในตัวฟอร์ม และ **ผูกกับ
// หัวข้อเก่าสองตัวที่เปิดใบใหม่ไม่ได้แล้ว** (scent_brief · mockup) ⇒ หัวข้อที่ใช้จริง
// ทุกตัวตกไปใช้ข้อความกลาง "อธิบายสิ่งที่ต้องการให้ฝ่ายปลายทางทำ" ซึ่งไม่ได้บอกอะไร
// ⇒ ย้ายมาอยู่กับหัวข้อ: เพิ่มหัวข้อใหม่แล้วลืมข้อความไม่ได้ เพราะมันอยู่ไฟล์เดียวกัน
const FORM_DEFAULTS = {
  titleLabel: 'ชื่อเรื่อง',
  titlePlaceholder: 'สรุปสั้น ๆ ว่าขออะไร',
  bodyLabel: 'รายละเอียด',
  bodyPlaceholder: 'อธิบายสิ่งที่ต้องการให้ฝ่ายปลายทางทำ',
  itemsLabel: 'รายการที่ขอ',
  // ป้ายของช่องวันที่ — หัวข้อส่วนใหญ่พูดถึง "งาน" แต่บางหัวข้อกำหนด **นัดเข้าพื้นที่**
  // ⇒ เปลี่ยนป้ายได้ที่ทะเบียน แทนที่จะเพิ่มคอลัมน์วันที่ตัวที่สองให้ฟอร์มสับสน
  dueLabel: 'วันที่ต้องการรับงาน',
  committedDueLabel: 'วันกำหนดส่ง',
  /* ชื่อ **ขั้นบนราง** ของก้าวที่ฝ่ายรับปากวัน — หัวข้อส่วนใหญ่คือ "กำหนดส่ง" แต่
     ประเมินพื้นที่คือ "ลงคิว" (ฝ่ายไม่ได้ส่งของ แต่จัดคนไปหน้างาน)
     ⚠️ เปลี่ยนเฉพาะ **รางบนหน้ารายละเอียด** ซึ่งพูดถึงใบเดียว · หัวคอลัมน์ในคิวรวม
        ยังเป็นคำกลาง เพราะตารางเดียวมีหลายหัวข้อปนกัน */
  commitStepLabel: 'กำหนดส่ง',
  scentLabel: 'กลิ่นที่ลูกค้าคอนเฟิร์ม',
  formulaLabel: 'สูตรที่ลูกค้าคอนเฟิร์ม',
};

const byKey = {};
const seen = new Set();
for (const kind of ALL) {
  assertKind(kind, seen);
  seen.add(kind.key);
  // ตัดคีย์ `key` ออกจากค่าที่เก็บ — ตัวตนอยู่ที่คีย์ของ object อยู่แล้ว เก็บซ้ำ
  // = แหล่งความจริงที่สองที่ drift ได้ (เปลี่ยนคีย์แต่ลืมเปลี่ยน key ข้างใน)
  const { key, ...meta } = kind;
  byKey[key] = { ...meta, form: Object.freeze({ ...FORM_DEFAULTS, ...(kind.form || {}) }) };
}

// ⚠️ อ่านอย่างเดียว — ของเดิมเป็น object เปล่าที่ใครก็เขียนทับได้ตอนรันไทม์
export const REQUEST_KINDS = Object.freeze(byKey);

// ฝ่ายไหนเป็นเจ้าของหัวข้อไหน — ใช้ตรวจว่าโฟลเดอร์กับธง `dept` ตรงกันจริง
export const KINDS_BY_OWNER = Object.freeze({
  RD: RD_KINDS.map((k) => k.key),
  PC: PC_KINDS.map((k) => k.key),
  FN: FN_KINDS.map((k) => k.key),
  TS: TS_KINDS.map((k) => k.key),
  shared: SHARED_KINDS.map((k) => k.key),
});
