// ── ทะเบียนสูตร (mig 0171) — logic ล้วน ใช้ร่วมทั้ง API และหน้าจอ ─────────
//
// เดิมสูตรเป็น 3 ช่องข้อความบน products (mig 0112: formulaName/Code/Date) ไม่มี
// ตาราง ไม่มีความสัมพันธ์กับกลิ่น → คำร้อง "ขอราคา FB อ้างชื่อสูตร" อ้างได้แค่
// ข้อความ จับคู่ข้ามงานไม่ได้
//
// ⚠️ รหัสสูตรเป็นของจริงจาก RD ไม่ใช่เลขรันของระบบ (มติ 8) — ร่างยังไม่มีรหัสได้
// เพราะของจริงบน prod มี 10 แถวที่มีแต่ชื่อไม่มีรหัส (ดูหัว migration 0171)
import { canUser, isReadOnlyObserver, isSuperuser } from '@/lib/permissions';

export const FORMULA_STATUSES = ['draft', 'developing', 'active', 'archived'];

// ⚠️ **ต้องสะกดตรงกับ `SCENT_STATUS_LABELS` ทุกตัว** — ทะเบียนกลิ่นกับทะเบียนสูตรเป็น
// สองจอที่ RD สลับไปมาทั้งวัน · คำต่างกันเมื่อไรคนจะคิดว่าสถานะคนละความหมาย
// (ย่อ "ร่าง — รอ RD รับเข้าทะเบียน" เหลือ "รอเข้าทะเบียน" พร้อมกันทั้งคู่ 2026-08-08)
export const FORMULA_STATUS_LABELS = {
  draft: 'รอเข้าทะเบียน',
  developing: 'กำลังพัฒนา',
  active: 'ใช้งานได้',
  archived: 'เลิกใช้',
};

// ชื่อโทนของ <StatusBadge> ไม่ใช่ค่าสี (เหมือน SCENT_STATUS_TONES)
export const FORMULA_STATUS_TONES = {
  draft: 'neutral',
  developing: 'info',
  active: 'success',
  archived: 'neutral',
};

// เปลี่ยนสถานะได้เฉพาะเส้นที่มีความหมาย — ชุดเดียวกับทะเบียนกลิ่น ยกเว้นแถวแรก
// (สองทะเบียนนี้เดินคู่กันในสายงานเดียว ต่างกฎกันเมื่อไรคนใช้จะจำไม่ไหว)
const ALLOWED_TRANSITIONS = {
  // ⚠️ จุดเดียวที่ต่างจากกลิ่น: กลิ่นที่ RD รับเข้าทะเบียนไปเป็น `developing` ก่อน
  // แต่ **สูตรที่รับพร้อมรหัสใช้งานได้ทันที** (พฤติกรรมเดิมตั้งแต่ 0171) · บังคับให้
  // ผ่าน developing = สูตรที่เพิ่งรับเข้าทะเบียนจะอ้างในคำร้องขอราคา FB ไม่ได้จนกว่า
  // จะมีคนมากดอีกที — เพิ่มขั้นให้คนใช้โดยไม่ได้แก้ปัญหาอะไร
  // ทั้งสองทางเดินได้ **ผ่าน acceptFormula เท่านั้น** (action `status` ปฏิเสธร่างก่อน)
  draft: ['developing', 'active'],
  developing: ['active', 'archived'],
  active: ['developing', 'archived'], // กลับไปพัฒนาต่อได้ (ลูกค้าขอปรับ)
  archived: ['active'],
};

export function formulaTransitionError(formula, next) {
  if (!formula) return 'ไม่พบสูตร';
  if (!FORMULA_STATUSES.includes(next)) return 'สถานะไม่ถูกต้อง';
  if (formula.status === next) return 'สถานะเดิมอยู่แล้ว';
  if (!(ALLOWED_TRANSITIONS[formula.status] || []).includes(next)) {
    return `เปลี่ยนจาก "${FORMULA_STATUS_LABELS[formula.status]}" เป็น "${FORMULA_STATUS_LABELS[next]}" ไม่ได้`;
  }
  return null;
}

// สถานะที่อ้างอิงในคำร้องขอราคา FB ได้
export const FORMULA_USABLE_STATUSES = ['active'];

export function normalizeFormulaStatus(value) {
  return FORMULA_STATUSES.includes(value) ? value : 'draft';
}

export function isFormulaUsable(formula) {
  return FORMULA_USABLE_STATUSES.includes(formula?.status);
}

// ── ตัวตนของสูตร = **หมวดสินค้า × กลิ่น** (mig 0207) ─────────────────────
//
// ⭐ เดิมตัวตนคือ "รหัส" อย่างเดียว ซึ่งเป็นรหัสที่ RD พิมพ์เอง ⇒ ระบบไม่มีทางรู้ว่า
// สองสูตรหมายถึงของชิ้นเดียวกันหรือเปล่า · มติผู้ใช้: เทียนหอมกลิ่น A กับก้านไม้หอม
// กลิ่น A เป็นคนละสูตร แต่เทียนหอมกลิ่น A สองแถวคือของซ้ำ
//
// ⚠️ ต้องตรงกับ index `formulas_identity_uk` เป๊ะ ๆ — ฝั่งแอปคิดต่างจาก DB เมื่อไร
// จะยิง insert ไปชน constraint แล้วผู้ใช้เห็น error ดิบภาษาอังกฤษ
//
// ⚠️ **ไม่มี customerId ในคีย์** — `scents.customerId` เป็น NOT NULL (มติ 9: ไม่มี
// กลิ่นกลาง) กลิ่นบอกลูกค้าอยู่แล้ว · ใส่ซ้ำ = แหล่งความจริงที่สองที่ drift ได้
//
// คืน null = "ยังไม่มีตัวตนที่เทียบได้" (สูตรฐานที่ไม่ผูกกลิ่น หรือร่างที่ยังไม่ใส่หมวด)
// ⇒ ผู้เรียกต้องแยกกรณีนี้เอง ห้ามเอาไปเทียบเป็นสตริงว่างแล้วจับคู่กันหมด
export function formulaIdentityKey({ categoryCode, scentId } = {}) {
  const category = String(categoryCode ?? '').trim();
  const scent = String(scentId ?? '').trim();
  if (!category || !scent) return null;
  return `${category}::${scent}`;
}

export function findFormulaByIdentity(formulas = [], identity = {}) {
  const key = formulaIdentityKey(identity);
  if (!key) return null;
  return formulas.find((f) => (
    f.status !== 'archived' && formulaIdentityKey(f) === key
  )) || null;
}

// รหัสสูตรยังห้ามซ้ำอยู่ (formulas_code_uk ไม่ถูกแตะใน 0207) — แต่มันเป็น
// "เลขที่อ้างอิงของ RD" ไม่ใช่ตัวตนของสูตรอีกต่อไป
export function findFormulaByCode(formulas = [], code) {
  const key = String(code ?? '').trim().toLowerCase();
  if (!key) return null;
  return formulas.find((f) => String(f.code ?? '').trim().toLowerCase() === key) || null;
}

// ── สิทธิ์ (แพตเทิร์นเดียวกับทะเบียนกลิ่น — ดู scents.js) ─────────────────
export function canViewFormulas(user) {
  return canUser(user, 'products:view');
}

export function isFormulaRegistrar(user) {
  return user?.role === 'rd' || isSuperuser(user?.role);
}

export function canProposeFormula(user) {
  if (isReadOnlyObserver(user?.role)) return false;
  return isFormulaRegistrar(user) || canUser(user, 'products:edit');
}

export function canEditFormula(user, formula) {
  if (!formula) return false;
  if (isFormulaRegistrar(user)) return true;
  if (formula.status !== 'draft') return false;
  return canProposeFormula(user) && formula.createdById === user?.id;
}

// ── ด่านของแต่ละ action ──────────────────────────────────────────────────
export function acceptFormulaError(formula, { code } = {}) {
  if (!formula) return 'ไม่พบสูตร';
  if (formula.status !== 'draft') return 'สูตรนี้รับเข้าทะเบียนไปแล้ว';
  if (!String(code ?? '').trim()) return 'ต้องระบุรหัสสูตรตอนรับเข้าทะเบียน';
  return null;
}

export function archiveFormulaError(formula) {
  if (!formula) return 'ไม่พบสูตร';
  if (formula.status === 'archived') return 'สูตรนี้เลิกใช้ไปแล้ว';
  if (formula.status === 'draft') return 'ร่างยังไม่ได้เข้าทะเบียน — ลบทิ้งแทน';
  return null;
}

// ลบได้เฉพาะร่างที่ยังไม่มีสินค้าอ้างถึง — ของที่รับเข้าทะเบียนแล้วเป็นหลักฐาน
export function deleteFormulaError(formula, { productCount = 0 } = {}) {
  if (!formula) return 'ไม่พบสูตร';
  if (formula.status !== 'draft') return 'ลบได้เฉพาะร่าง — สูตรในทะเบียนให้เปลี่ยนเป็น "เลิกใช้" แทน';
  if (productCount > 0) return `มีสินค้า ${productCount} รายการอ้างสูตรนี้อยู่ ลบไม่ได้`;
  return null;
}

// ── ตรวจข้อมูลก่อนสร้าง/แก้ — คืน { value, error } ───────────────────────
export function normalizeFormulaInput(body = {}) {
  const name = String(body.name ?? '').trim().replace(/\s+/g, ' ');
  if (!name) return { value: null, error: 'ต้องระบุชื่อสูตร' };
  if (name.length > 200) return { value: null, error: 'ชื่อสูตรยาวเกิน 200 ตัวอักษร' };

  const code = String(body.code ?? '').trim() || null;
  if (code && code.length > 100) return { value: null, error: 'รหัสสูตรยาวเกิน 100 ตัวอักษร' };

  const formulaDate = String(body.formulaDate ?? '').trim() || null;
  if (formulaDate && !/^\d{4}-\d{2}-\d{2}$/.test(formulaDate)) {
    return { value: null, error: 'วันที่ของสูตรไม่ถูกต้อง' };
  }
  // กันปีพิมพ์ผิดแบบที่เจอจริงบน prod ('2202-08-06') — ปีเกินช่วงที่เป็นไปได้
  // แปลว่าพิมพ์ผิด ไม่ใช่ข้อมูลจริง ต้องดักตั้งแต่ตอนกรอก
  if (formulaDate) {
    const year = Number(formulaDate.slice(0, 4));
    if (year < 1990 || year > 2100) return { value: null, error: 'ปีของวันที่สูตรไม่ถูกต้อง' };
  }

  const note = String(body.note ?? '').trim();
  if (note.length > 2000) return { value: null, error: 'หมายเหตุยาวเกิน 2000 ตัวอักษร' };

  const categoryCode = String(body.categoryCode ?? '').trim();
  if (categoryCode && !/^\d{2}-\d{3}$/.test(categoryCode)) {
    return { value: null, error: 'รหัสหมวดสินค้าไม่ถูกต้อง' };
  }

  const customerTradeName = String(body.customerTradeName ?? '').trim().replace(/\s+/g, ' ');
  if (customerTradeName.length > 200) {
    return { value: null, error: 'ชื่อที่ลูกค้าเรียกยาวเกิน 200 ตัวอักษร' };
  }

  return {
    value: {
      name,
      code,
      formulaDate,
      categoryCode: categoryCode || null,
      scentId: String(body.scentId ?? '').trim() || null,
      customerTradeName: customerTradeName || null,
      derivedFromFormulaId: String(body.derivedFromFormulaId ?? '').trim() || null,
      dealId: String(body.dealId ?? '').trim() || null,
      /* ⭐ **ลูกค้ากลับมาเป็นช่องกรอก** (มติผู้ใช้ 2026-08-10: "สูตรผูกลูกค้าก่อน
         แล้วเลือกกลิ่นที่ลูกค้ามี") — กลับทิศจาก 0207 ที่ derive จากกลิ่น
         ⚠️ **สิ่งที่ 0207 กันไว้ต้องไม่หลุด** — รูเดิมคือ "สูตรผูกลูกค้า A แต่ใช้กลิ่น
         ของลูกค้า B" · ตอนนี้กันด้วย `formulaScentCustomerError()` ที่ตรวจตรง ๆ แทน
         การ derive · ป้องกันเรื่องเดียวกัน คนละกลไก และเป็นทิศที่คนกรอกคิดจริง
         (รู้ลูกค้าก่อน แล้วค่อยหากลิ่นของเขา)
         ⚠️ ว่างได้ = สูตรฐาน ใช้ได้ทุกลูกค้า — พฤติกรรมเดิม ห้ามหาย
         ⚠️ `customerName` ยัง **ไม่รับจาก body** — server อ่านจากทะเบียนลูกค้าเสมอ
         (ชื่อที่ client ส่งมาอาจเก่าแล้ว) */
      customerId: String(body.customerId ?? '').trim() || null,
      note: note || null,
    },
    error: null,
  };
}

// ── สายพันธุ์ของสูตร — คู่ขนานกับ derivedFromError ของกลิ่น ───────────────
// ⚠️ สูตรอ้างข้ามลูกค้าไม่ได้เหมือนกลิ่น แต่ตัดสินจาก **กลิ่น** ของทั้งสองฝั่ง
// เพราะลูกค้าของสูตรเป็นค่าที่ derive มาจากกลิ่นอยู่แล้ว (ถามจากต้นทางเสมอ)
export function derivedFromFormulaError(parent, { customerId, id } = {}) {
  if (!parent) return 'ไม่พบสูตรต้นทางที่อ้างถึง';
  if (id && parent.id === id) return 'สูตรอ้างตัวเองเป็นต้นทางไม่ได้';
  // สูตรฐาน (ไม่ผูกลูกค้า) เป็นต้นทางของสูตรลูกค้าได้ — เป็นกรณีที่ผู้ใช้บอกว่ามีจริง
  if (parent.customerId && customerId && parent.customerId !== customerId) {
    return 'สูตรต้นทางเป็นของลูกค้าคนละราย — อ้างข้ามลูกค้าไม่ได้';
  }
  return null;
}

// วันที่ที่ "สืบทอดมา" จากสินค้าเก่าอาจเสีย (prod มีจริง: '2202-08-06')
// ⚠️ ถ้าปล่อยให้ตัวดักปีพิมพ์ผิดปฏิเสธตอนจัดระเบียบ แถวนั้นจะจัดไม่ได้เลยตลอดไป —
// กฎที่ตั้งใจกันข้อมูลเสียจะกลายเป็นตัวบล็อกการล้างข้อมูลเสียเอง
// ค่าที่ผู้ใช้พิมพ์เองยังตรวจตามปกติ (ผู้เรียกส่งเข้ามาแล้วให้ normalize จับ)
// ส่วนค่าที่สืบทอดมาถ้าไม่ผ่านให้ทิ้งเป็น null แล้ว RD เติมทีหลังได้
export function sanitizeInheritedFormulaDate(typed, inherited) {
  const typedValue = String(typed ?? '').trim();
  if (typedValue) return typedValue;
  if (!inherited) return null;
  return normalizeFormulaInput({ name: 'x', formulaDate: inherited }).error ? null : inherited;
}

// ── "รอจัดระเบียบ" — สินค้าที่มีชื่อสูตรแต่ยังไม่ได้ผูกทะเบียน ────────────
// prod มี 10 แถวแบบนี้ และชื่อส่วนใหญ่คือ *ชื่อกลิ่น* ไม่ใช่ชื่อสูตร
// migration ตั้งใจไม่ backfill (เดาแทน RD ไม่ได้) — หน้าจอโชว์ให้ RD ตัดสินทีละแถว
export function unsortedFormulaRows(products = []) {
  return products
    .filter((p) => !p.formulaId && !p.scentId && String(p.formulaName ?? '').trim())
    .map((p) => ({
      productId: p.id,
      fgCode: p.fgCode || null,
      productName: p.productDescription || p.fgCode || p.id,
      customerId: p.customerId || null,
      customerName: p.customerName || null,
      formulaName: String(p.formulaName).trim(),
      formulaCode: String(p.formulaCode ?? '').trim() || null,
      formulaDate: p.formulaDate || null,
    }));
}

// ── ที่มาของสูตร ─────────────────────────────────────────────────────────
//
// ⭐ กติกาเดียวกับทะเบียนกลิ่น (ม-74) — ทะเบียนสูตรก็เป็นข้อมูลกลางที่ของส่วนใหญ่
// ควรมาจากสายพัฒนาสูตร ส่วนที่เพิ่มตรงคือสูตรเดิมที่เคยทำไว้ก่อนมีระบบ
//
// ⚠️ **ตัดสินจาก `sourceRequest` ที่ชั้น admin เติมให้ ไม่ใช่จาก `dealId`** — ฟอร์ม
// เพิ่มสูตรเองก็กรอกดีลได้ · ดู `attachFormulaSource` ว่าตามหลักฐานจากไหน
// ⚠️ ป้ายในตัวกรองต้องสะกดตรงกับป้ายในตาราง — คนกรอง "เพิ่มเอง" แล้วต้องเห็นแถวที่
// ป้ายเขียนว่า "เพิ่มเอง" ไม่ใช่คำอื่นที่แปลว่าอย่างเดียวกัน
export const FORMULA_SOURCES = [
  { value: 'request', label: 'มาจากคำร้อง' },
  { value: 'manual', label: 'เพิ่มเอง' },
];

export function formulaSourceKind(formula) {
  return formula?.sourceRequest ? 'request' : 'manual';
}

/** ป้ายที่มาแบบพร้อมแสดง — `{ kind, label, requestId }` */
export function formulaSourceLabel(formula) {
  const kind = formulaSourceKind(formula);
  if (kind === 'manual') return { kind, label: 'เพิ่มเอง', requestId: null };
  const request = formula.sourceRequest;
  return {
    kind,
    label: `คำร้อง ${request.docNo || request.id}`,
    requestId: request.id || null,
  };
}

// ตัวกรอง "ที่มา" บนทะเบียน — '' = ทั้งหมด
export function matchesFormulaSource(formula, filter) {
  if (!filter) return true;
  return formulaSourceKind(formula) === filter;
}

/**
 * กลิ่นที่เลือกเป็นของลูกค้ารายเดียวกับสูตรหรือไม่ — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * ⭐ ตัวแทนของกลไก derive ที่ 0207 ใช้ (มติผู้ใช้ 2026-08-10 กลับทิศ) — กันรูเดิม
 * "สูตรผูกลูกค้า A แต่ใช้กลิ่นของลูกค้า B" ด้วยการ **ตรวจ** แทนการ **เติมให้**
 *
 * ⚠️ สูตรฐาน (ไม่ผูกลูกค้า) ห้ามผูกกลิ่นของลูกค้ารายใดราย หนึ่ง — ไม่งั้นมันไม่ใช่
 * สูตรฐานแล้ว แต่เป็นสูตรของลูกค้าคนนั้นที่ไม่ได้ประกาศตัว
 * ⚠️ กลิ่นทุกตัวมีลูกค้าเสมอ (`scents.customerId` NOT NULL — มติ 9) จึงไม่มีเคส
 * "กลิ่นกลาง" ให้ต้องยกเว้น
 */
export function formulaScentCustomerError(scent, { customerId } = {}) {
  if (!scent) return null;
  const owner = scent.customerId || null;
  if (!customerId) {
    return 'สูตรฐาน (ไม่ผูกลูกค้า) เลือกกลิ่นของลูกค้าไม่ได้ — เลือกลูกค้าก่อน หรือเอากลิ่นออก';
  }
  if (owner && owner !== customerId) {
    return 'กลิ่นที่เลือกเป็นของลูกค้าคนละราย — เลือกกลิ่นของลูกค้ารายนี้';
  }
  return null;
}
