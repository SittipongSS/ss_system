// ── สร้าง/หา สินค้า "ค่าภาษีสรรพสามิต" (04-003) ของลูกค้า — ฝั่ง server เท่านั้น ─────────────────────────────
//
// แผนรื้อสรรพสามิต v2 หมวด 3.3 · มติเจ้าของ 28/10/2026: สินค้าเป็นของจริงต่อลูกค้า `FG-<รหัสลูกค้า>-04-003`
// (ลูกค้าละหนึ่งตัว · ไม่มีเลขรัน) · **ระบบสร้างให้เองตอนออกใบเสนอราคาค่าสรรพสามิตใบแรกของลูกค้า** · อนุมัติแล้ว ·
// ไม่มีราคาเก็บไว้ (ราคา/ชิ้นของแต่ละบรรทัดคือภาษีที่ระบบคิดจาก FG ต้นทาง) · คนสร้างด้วยมือไม่ได้ (POST/PATCH สินค้าปฏิเสธ)
//
// ⚠️ หาด้วย **ลูกค้า + หมวด** ไม่ใช่ด้วยรหัส — ท่อนรหัสลูกค้ามีทั้ง 3 และ 4 หลัก (exciseChargeFgCode) ⇒ เดารหัสผิดแบบ
//    = สร้างตัวที่สองซ้ำ · ชนกัน (ออกใบสองใบพร้อมกัน → 23505 ของ unique fgCode · mig 0035) = อ่านซ้ำแล้วใช้ตัวที่ชนะ
// ⚠️ `isExciseTaxable: false` ระบุชัด — ค่าตั้งต้นของคอลัมน์เป็น TRUE ถ้าปล่อย ใบยื่นจาก SO จะมองบรรทัดค่าภาษีเป็นของ
//    ต้องเสียภาษีแล้ววนยื่นภาษีซ้อนภาษี (resolveSoFiling ตัดหมวดนี้ทิ้งอีกชั้นด้วย)
// ⚠️ เขียนฐาน ⇒ ผู้เรียกส่ง client (admin) เข้ามา · ตัวเขียน audit/ประวัติราคารับเป็นพารามิเตอร์ (กฎ "เทสต์ห้ามต่อฐานจริง" ใน AGENTS.md)
import { randomUUID } from 'node:crypto';
import { recordAudit } from '@/lib/audit';
import { recordProductPriceHistory } from '@/lib/master/priceHistory';
import { customerSnapshotName } from '@/lib/master/customerName';
import { clearedBrandFields } from '@/lib/master/brands';
import { clearedPackagingFields } from '@/lib/master/units';
import {
  EXCISE_CHARGE_CATEGORY_CODE, EXCISE_CHARGE_LINE_KIND, EXCISE_CHARGE_PRODUCT_NAME, EXCISE_CHARGE_PRODUCT_NAME_EN,
  exciseChargeFgCode,
} from '@/lib/excise/exciseCharge';

async function findChargeProduct(supabase, customerId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('customerId', customerId)
    .eq('categoryCode', EXCISE_CHARGE_CATEGORY_CODE)
    .order('createdAt', { ascending: true })
    .order('id', { ascending: true })
    .limit(1);
  if (error) return { error };
  return { product: data?.[0] || null };
}

/**
 * สินค้า 04-003 ของลูกค้า — มีแล้วคืนตัวเดิม ไม่มีสร้างใหม่
 * @param customer       แถวลูกค้า ({ id, arCode, name, nameEn … }) — ผู้เรียกโหลดเอง
 * @param sourceFgCodes  รหัส FG ต้นทางบน SO (ใช้เลือกแบบท่อนรหัสลูกค้า เมื่อลูกค้ายังไม่มีสินค้ากลุ่ม 04)
 * @returns `{ product, created }` หรือ `{ error, status }` (ข้อความไทย)
 */
/* รหัส 04-003 ที่จะใช้กับลูกค้ารายนี้ — ตัวเดียวของทางสร้างจริงและทางพรีวิว · `{ fgCode }` หรือ `{ error, status }` */
async function chargeFgCodeFor(supabase, customer, sourceFgCodes) {
  /* แบบท่อนรหัสลูกค้า: สินค้ากลุ่ม 04 ตัวอื่นของลูกค้าก่อน (มติ D5) — ชุดเล็ก (ลูกค้าหนึ่งราย) จำกัดไว้กันแถวเกิน */
  const { data: group04, error: group04Error } = await supabase
    .from('products')
    .select('fgCode')
    .eq('customerId', customer.id)
    .like('categoryCode', '04-%')
    .order('createdAt', { ascending: true })
    .limit(20);
  if (group04Error) return { error: group04Error.message, status: 500 };

  const fgCode = exciseChargeFgCode({
    arCode: customer.arCode,
    group04Codes: (group04 || []).map((row) => row.fgCode),
    sourceFgCodes,
  });
  if (!fgCode) {
    return {
      error: `ลูกค้ารายนี้มีรหัส "${customer.arCode || '-'}" ซึ่งไม่ใช่รูปแบบ AR ที่ระบบรู้จัก — ประกอบรหัสสินค้าค่าภาษีสรรพสามิตไม่ได้ แจ้งผู้ดูแลระบบ`,
      status: 400,
    };
  }
  return { fgCode };
}

/**
 * สินค้า 04-003 ของลูกค้าสำหรับ **พรีวิว** หน้าออกใบใหม่ (มติเจ้าของ 29/10: แก้ก่อนบันทึก) — มีแล้ว = ตัวจริง ·
 * ยังไม่มี = แถวสมมุติ (ไม่ insert · ไม่ audit) รหัสเดียวกับที่ทางสร้างจริงจะออก · ตัวจริงเกิดตอนกดบันทึกเท่านั้น
 */
export async function peekExciseChargeProduct(supabase, { customer, sourceFgCodes = [] } = {}) {
  if (!customer?.id) return { error: 'ไม่พบลูกค้าเจ้าของใบสั่งขาย', status: 400 };
  const existing = await findChargeProduct(supabase, customer.id);
  if (existing.error) return { error: existing.error.message, status: 500 };
  if (existing.product) return { product: existing.product, created: false };
  const code = await chargeFgCodeFor(supabase, customer, sourceFgCodes);
  if (code.error) return code;
  return {
    product: { id: EXCISE_CHARGE_PREVIEW_ID, fgCode: code.fgCode, productDescription: EXCISE_CHARGE_PRODUCT_NAME, productDescriptionEn: EXCISE_CHARGE_PRODUCT_NAME_EN },
    created: false,
    pending: true,
  };
}

/** id ของสินค้า 04-003 สมมุติบนพรีวิว — ห้ามลงฐาน (ทางบันทึกสร้าง/หาตัวจริงใหม่ทุกครั้ง) */
export const EXCISE_CHARGE_PREVIEW_ID = 'PREVIEW-04-003';

export async function ensureExciseChargeProduct(supabase, {
  customer, sourceFgCodes = [], user = null, request = null,
  audit = recordAudit, priceHistory = recordProductPriceHistory,
} = {}) {
  if (!customer?.id) return { error: 'ไม่พบลูกค้าเจ้าของใบสั่งขาย', status: 400 };

  const existing = await findChargeProduct(supabase, customer.id);
  if (existing.error) return { error: existing.error.message, status: 500 };
  if (existing.product) return { product: existing.product, created: false };

  const code = await chargeFgCodeFor(supabase, customer, sourceFgCodes);
  if (code.error) return code;
  const { fgCode } = code;

  /* รหัสนี้มีอยู่แล้วแต่หมวดไม่ใช่ 04-003 (แถวเก่าที่หมวดว่าง/ผิด) — ของลูกค้าเดียวกันใช้ได้ · ของคนอื่น = ข้อมูลชนกัน หยุด */
  const { data: sameCode, error: sameCodeError } = await supabase
    .from('products').select('*').eq('fgCode', fgCode).maybeSingle();
  if (sameCodeError) return { error: sameCodeError.message, status: 500 };
  if (sameCode) {
    if (sameCode.customerId === customer.id) return { product: sameCode, created: false };
    return { error: `รหัส ${fgCode} เป็นของลูกค้ารายอื่นในทะเบียนสินค้าแล้ว — แจ้งผู้ดูแลระบบก่อนออกใบค่าภาษี`, status: 409 };
  }

  const nowIso = new Date().toISOString();
  const row = {
    id: `PRD-${randomUUID()}`,
    fgCode,
    customerId: customer.id,
    customerName: customerSnapshotName(customer),
    productDescription: EXCISE_CHARGE_PRODUCT_NAME,
    productDescriptionEn: EXCISE_CHARGE_PRODUCT_NAME_EN,
    hasBrand: false,
    ...clearedPackagingFields(EXCISE_CHARGE_CATEGORY_CODE),
    ...clearedBrandFields({ categoryCode: EXCISE_CHARGE_CATEGORY_CODE, hasBrand: false }),
    saleUnit: 'ชิ้น',
    categoryCode: EXCISE_CHARGE_CATEGORY_CODE,
    costPrice: null,
    retailPriceIncVat: null,
    retailPriceExVat: 0,
    taxableOverride: null,
    isExciseTaxable: false,
    exciseTax: 0,
    localTax: 0,
    laborCost: null,
    shippingCost: null,
    materialCost: null,
    factoryProfit: null,
    isActive: true,
    metadata: { systemKind: EXCISE_CHARGE_LINE_KIND },
    team: user?.team ?? null,
    ownerId: null,
    assignee: user?.name || 'ระบบ',
    approvalStatus: 'approved',
    submittedBy: user?.id ?? null,
    submittedByName: user?.name ?? null,
    approvedBy: user?.id ?? null,
    approvedByName: user?.name ? `${user.name} (ระบบสร้างอัตโนมัติ)` : 'ระบบสร้างอัตโนมัติ',
    approvedAt: nowIso,
    createdAt: nowIso,
  };
  const { data: created, error: insertError } = await supabase.from('products').insert(row).select().single();
  if (insertError) {
    if (insertError.code === '23505') {
      const again = await findChargeProduct(supabase, customer.id);
      if (again.product) return { product: again.product, created: false };
      const { data: winner } = await supabase.from('products').select('*').eq('fgCode', fgCode).maybeSingle();
      if (winner?.customerId === customer.id) return { product: winner, created: false };
    }
    return { error: insertError.message, status: 500 };
  }

  await priceHistory({
    user, productId: created.id, after: created, changeType: 'create',
    metadata: { fgCode: created.fgCode, customerId: created.customerId, systemKind: EXCISE_CHARGE_LINE_KIND },
  });
  await audit({
    user, action: 'create', entityType: 'product', entityId: created.id, after: created,
    summary: `ระบบสร้างสินค้าค่าภาษีสรรพสามิต ${created.fgCode} ให้ ${created.customerName || customer.id}`,
    request,
  });
  return { product: created, created: true };
}
