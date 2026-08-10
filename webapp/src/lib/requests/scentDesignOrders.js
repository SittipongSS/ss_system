// ── ใบสั่งขายที่เป็น "งานออกแบบกลิ่น" — ด่านล้วน ไม่แตะ DB ────────────────
//
// ⭐ **ด่านหน้าประตูของคำร้องพัฒนากลิ่น** (มติผู้ใช้ 2026-08-06) — ฟอร์มเขียนว่า
// "ใบสั่งขายออกแบบกลิ่น" แต่ของเดิมให้เลือก SO ได้ทุกใบ รวมใบขายสินค้าที่ไม่เกี่ยว
// กับการออกแบบกลิ่นเลย ⇒ ไฟล์นี้คือสิ่งที่ทำให้ป้ายกับของจริงตรงกัน
//
// ⚠️ **หมวด `03` ทั้งก้อนใช้ไม่ได้** — หมวดค่าออกแบบมี 5 รายการ (ซีด 0007) แต่
// `03-003` ออกแบบบรรจุภัณฑ์ และ `03-004` ออกแบบ CI ไม่ใช่งานกลิ่น ⇒ ระบุเป็นชุด
//
// ⭐ **จำนวนกลิ่นมาจาก `qty` ของบรรทัดนี้** ⇒ ใบที่ผ่านด่านย่อมมีจำนวนกลิ่นเสมอ
// โดยโครงสร้าง ไม่ต้องให้ใครมากรอกซ้ำแล้วขัดกับสิ่งที่ลูกค้าจ่ายไปแล้ว

// 03-001 CERTIFIED CO-CREATION SCENT DESIGN · 03-002 SIGNATURE SCENT DESIGN
// 03-005 SCENT DRESSING (ออกแบบกลิ่นเสริมกลิ่นแกน)
// 03-010 แก้ไขกลิ่น (มติผู้ใช้ 2026-08-10) — งานแก้กลิ่นเดิมก็ยังเป็น *งานกลิ่น* ที่ RD
//   ต้องพัฒนาและส่ง direction กลับ · ไม่อยู่ในชุดเมื่อไร ใบสั่งขายที่ขายแต่ค่าแก้กลิ่น
//   จะเปิดคำร้องพัฒนากลิ่นไม่ได้เลย ทั้งที่เป็นงานเดียวกันกับสามตัวข้างบน
//   ⚠️ ทะเบียนแถวนี้ยังไม่มีชื่ออังกฤษ (`nameEn` เป็น null) — ป้ายบนจอจึงมาจาก `nameTh`
export const SCENT_DESIGN_CATEGORIES = ['03-001', '03-002', '03-005', '03-010'];

const CATEGORY_RE = /(\d{2}-\d{3})$/;

/**
 * รหัสหมวดจากรหัสสินค้า — `FG-321-03-002` → `03-002` · คืน null เมื่ออ่านไม่ออก
 *
 * ⚠️ **ทางรอง ไม่ใช่ทางหลัก** — ทางหลักคือ `line.categoryCode` ที่ผู้เรียก resolve มา
 * จาก `productId` → `products` · การจับคู่ด้วยข้อความเป็นโรคประจำถิ่นของ repo นี้
 * (mig 0171 บันทึกไว้ว่ามีสินค้า 10 แถวที่เอาชื่อกลิ่นไปกรอกช่องชื่อสูตร) แต่บรรทัด
 * ที่ไม่ผูก `productId` มีจริงบน prod ⇒ ไม่มีทางรองก็อ่านใบนั้นไม่ออกเลย
 */
export function categoryCodeFromProductCode(code) {
  const found = CATEGORY_RE.exec(String(code ?? '').trim());
  return found ? found[1] : null;
}

// รหัสหมวดของบรรทัด — ของที่ resolve มาแล้วชนะรหัสที่แกะจากข้อความเสมอ
export function lineCategoryCode(line = {}) {
  if (line.categoryCode) return String(line.categoryCode);
  return categoryCodeFromProductCode(line.fgCode)
    || categoryCodeFromProductCode(line.description);
}

export const isScentDesignLine = (line) =>
  SCENT_DESIGN_CATEGORIES.includes(lineCategoryCode(line) || '');

export const scentDesignLines = (lines = []) => lines.filter(isScentDesignLine);

/**
 * จำนวนกลิ่นที่ใบนี้ขาย — รวม `qty` ของทุกบรรทัดออกแบบกลิ่น · คืน null เมื่ออ่านไม่ได้
 *
 * ⚠️ ต้องเป็น **จำนวนเต็มบวก** — `qty` เป็น numeric ที่ PostgREST ส่งมาเป็นสตริง และ
 * เศษทศนิยมแปลว่าใบนั้นขายอย่างอื่นที่ไม่ใช่ "จำนวนกลิ่น" ⇒ เดาต่อไม่ได้ ต้องคืน null
 * ให้หน้าจอบอกผู้ใช้ ดีกว่าปัดเศษเงียบ ๆ แล้วได้บล็อกบรีฟผิดจำนวน
 */
export function scentCountForOrder(lines = []) {
  const design = scentDesignLines(lines);
  if (!design.length) return null;
  let total = 0;
  for (const line of design) {
    const qty = Number(line.qty);
    if (!Number.isInteger(qty) || qty <= 0) return null;
    total += qty;
  }
  return total;
}

// เลขที่คำร้องที่ใบนี้ถูกใช้ไปแล้ว — คืน null ถ้ายังว่าง
//
// ⚠️ ถอยไปใช้ `id` เมื่อใบนั้นยังเป็นร่างที่ไม่มีเลขที่ — ข้อความว่า "เปิดคำร้องไปแล้ว
// (ว่าง)" อ่านเหมือนระบบพัง ส่วน id ยังพาไปหาใบนั้นได้
const usedBy = (order) => order?.scentRequest?.docNo || order?.scentRequest?.id || null;

/**
 * เปิดคำร้องพัฒนากลิ่นบนใบนี้ได้ไหม — คืนข้อความไทย หรือ null ถ้าผ่าน
 *
 * ⚠️ **ข้อความบอกทางออกเสมอ** — "เลือกใบอื่น" ไม่ช่วยคนที่มีใบเดียวในมือ
 */
export function scentDesignOrderError(order, lines = [], { usedByRequestNo = null } = {}) {
  if (!order) return 'ต้องเลือกใบสั่งขาย';
  // มติผู้ใช้: ต้องอนุมัติแล้ว ไม่ใช่แค่มีอยู่ — ออกแบบกลิ่นมีค่าบริการ
  if (order.status !== 'approved') {
    return 'ใบสั่งขายต้องอนุมัติแล้วก่อนจึงเปิดบรีฟกลิ่นได้';
  }
  if (!scentDesignLines(lines).length) {
    return 'ใบสั่งขายนี้ไม่มีบรรทัดงานออกแบบกลิ่น — ต้องเป็นใบที่ขายบริการออกแบบกลิ่น';
  }
  // ⭐ 1 SO : 1 PDR ตายตัว (มติผู้ใช้) — อยากได้เพิ่มต้องออกใบสั่งขายใหม่
  if (usedByRequestNo) {
    return `ใบสั่งขายนี้เปิดคำร้องไปแล้ว (${usedByRequestNo}) — ขอเพิ่มต้องออกใบสั่งขายใหม่`;
  }
  if (scentCountForOrder(lines) == null) {
    return 'อ่านจำนวนกลิ่นจากใบสั่งขายไม่ได้ — จำนวนต้องเป็นจำนวนเต็มบวก';
  }
  return null;
}

// ── ตัวเลือกใบสั่งขายบนฟอร์มเปิดคำร้อง ───────────────────────────────────
//
// 🐞 ป้ายช่องเขียนว่า **"ใบสั่งขายออกแบบกลิ่น"** แต่ลิสต์แสดง SO ทุกใบในขอบเขตของ
// ผู้ใช้ ⇒ เลือกใบขายสินค้าธรรมดาได้ กรอก PDR จนจบ **แล้วโดนปฏิเสธตอนกดส่ง**
// ข้อมูลที่ต้องใช้กรองมีครบอยู่แล้วในก้อนที่ API ส่งมา แค่ไม่เคยถูกใช้
//
// ⭐ **ค่าที่เลือกไว้แล้วต้องอยู่ในลิสต์เสมอ** (`keepId`) — ไม่งั้นใบที่เพิ่งถูกคนอื่น
// เปิดคำร้องตัดหน้า หรือใบที่มาทางลิงก์ `?salesOrderId=` จะหายจากลิสต์เงียบ ๆ
// แล้ว `SearchableSelect` แสดงช่องว่างทั้งที่ค่ายังอยู่ในฟอร์ม ⇒ ผู้ใช้งงว่าหายไปไหน
// · ด่านจริงยังอยู่ที่ server ตอนกดส่ง ซึ่งจะบอกเหตุผลตรง ๆ
export function scentDesignOrderOptions(orders = [], { keepId = null } = {}) {
  return (Array.isArray(orders) ? orders : []).filter((order) => {
    if (keepId && order?.id === keepId) return true;
    return scentDesignOrderError(order, order?.lines || [], { usedByRequestNo: usedBy(order) }) === null;
  });
}

/**
 * ใบที่ถูกกรองออก แยกตามเหตุผล — ใช้ตอบคำถาม "ทำไมใบของฉันไม่อยู่ในลิสต์"
 *
 * ⚠️ **ไม่ใช่แค่ตัวเลขรวม** — "ซ่อนไป 7 ใบ" ไม่ช่วยใครเลย · คนที่หาใบของตัวเองไม่เจอ
 * ต้องรู้ว่าติดข้อไหน เพราะสามข้อนี้ทางแก้คนละทางกันหมด (ไปอนุมัติใบ · ใบผิดชนิด ·
 * ไปเปิดใบคำร้องที่มีอยู่แล้ว)
 */
export function scentDesignOrderSkips(orders = []) {
  const out = { notApproved: 0, notScentDesign: 0, used: 0, total: 0 };
  for (const order of Array.isArray(orders) ? orders : []) {
    const lines = order?.lines || [];
    if (scentDesignOrderError(order, lines, { usedByRequestNo: usedBy(order) }) === null) continue;
    out.total += 1;
    // เรียงตามลำดับที่ `scentDesignOrderError` ตรวจ — ใบหนึ่งติดได้หลายข้อ
    // นับข้อแรกที่ติดเท่านั้น ไม่งั้นผลรวมของแต่ละเหตุผลจะเกินจำนวนใบที่ซ่อนจริง
    if (order?.status !== 'approved') out.notApproved += 1;
    else if (!scentDesignLines(lines).length) out.notScentDesign += 1;
    else if (usedBy(order)) out.used += 1;
  }
  return out;
}

/**
 * ข้อความบอกว่าซ่อนใบไหนไปบ้างเพราะอะไร — คืน '' เมื่อไม่ได้ซ่อนอะไรเลย
 *
 * ⚠️ เรียงตามลำดับที่ผู้ใช้แก้ได้ง่ายที่สุดไปยากที่สุด: ไปกดอนุมัติใบ → ใบผิดชนิด
 * (ต้องออกใบใหม่) → เปิดคำร้องไปแล้ว (ต้องไปหาใบคำร้องเดิม)
 */
export function scentDesignOrderSkipHint(skips = {}) {
  const parts = [];
  if (skips.notApproved) parts.push(`ยังไม่อนุมัติ ${skips.notApproved} ใบ`);
  if (skips.notScentDesign) parts.push(`ไม่ใช่งานออกแบบกลิ่น ${skips.notScentDesign} ใบ`);
  if (skips.used) parts.push(`เปิดคำร้องไปแล้ว ${skips.used} ใบ`);
  if (!parts.length) return '';
  return `ซ่อนไว้ ${skips.total || parts.length} ใบ — ${parts.join(' · ')}`;
}
