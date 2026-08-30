import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord, canEditRecord, canDeleteRecord, canApproveMasterData, redactProductMargin, isSuperuser } from '@/lib/permissions';
import {
  PRODUCT_DOC_NOTE_FIELDS,
  changedFieldsAgainst, normalizeRejectionReason, rejectionReasonError, resetApprovalOnEdit,
} from '@/lib/master/approval';
import { categoryOf, categoryFlagsOf, activeProductTypeError } from '@/lib/master/productTypes';
import { CODE_MODE_MANUAL, fgCodeError, isAutoFgCode, isReusableCode } from '@/lib/master/masterCodes';
import { productCaretakerTeams } from '@/lib/master/productScope';
import { referencedBlock } from '@/lib/deletion';
import { purgeAttachments } from '@/lib/master/attachments';
import { findEntityReferences } from '@/lib/master/entityReferences';
import { purgeProductPriceHistory } from '@/lib/master/priceHistory';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { masterApprovalUpdate, masterReapprovalUpdate } from '@/lib/master/recordUpdates';
import { recordAudit } from '@/lib/audit';
import { missingRequiredDocs } from '@/lib/master/attachmentRequirements';
import { missingDocsMessage, overrideReasonError } from '@/lib/master/attachmentTypes';
import { resolveProductTaxable, productTaxRates } from '@/lib/tax/exciseBilling';
import { recordProductPriceHistory } from '@/lib/master/priceHistory';
import { productDisplayName } from '@/lib/master/productIdentity';
import { clearedPackagingFields } from '@/lib/master/units';
import { clearedBrandFields } from '@/lib/master/brands';
import { productFormulaSnapshot } from '@/lib/master/scentFormulaAdmin';

export const dynamic = 'force-dynamic';
// GET /api/products/[id]
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { data, error } = await supabase.from('products').select('*').eq('id', id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  // Hide out-of-team products (return 404 so we don't leak their existence).
  if (!canViewRecord(user, 'products', data)) {
    return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  }
  // Enrich with the owner's customerType (not persisted on products) so the
  // detail page shows the correct customer document set in the read-only
  // "เอกสารลูกค้าเจ้าของ" panel. Looked up live to avoid stale denormalized data.
  let customerType = null;
  if (data.customerId) {
    const { data: owner } = await supabase
      .from('customers').select('customerType').eq('id', data.customerId).maybeSingle();
    customerType = owner?.customerType ?? null;
  }
  // ชื่อกลิ่นจากทะเบียน (mig 0171) — สินค้าเก็บแค่ scentId ไม่มี snapshot ชื่อ
  // อ่านสดเหมือน customerType · ไม่ทิ้ง error เพราะ "อ่านไม่ได้" กับ "ไม่มีกลิ่น"
  // คนละเรื่อง (ดู [[supabase-masked-query-errors]])
  let scentName = null;
  if (data.scentId) {
    const { data: scent, error: scentError } = await supabase
      .from('scents').select('name').eq('id', data.scentId).maybeSingle();
    if (scentError) return Response.json({ error: scentError.message }, { status: 500 });
    scentName = scent?.name ?? null;
  }
  // Strip the confidential cost breakdown/profit for non-margin roles.
  return Response.json({ ...redactProductMargin(user, data), customerType, scentName });
}

// PATCH /api/products/[id]
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: product, error: findErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!product) return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });

  // Row-level scope: the product is edited by the team that CARES FOR its owning
  // customer (product.team only records who created it — มติ 2026-07-20), every
  // sales role in that team incl. AE; teamless customer = shared. Superuser +
  // RA-approval span all. The proxy already verified the coarse capability.
  const caretakerTeams = await productCaretakerTeams(product, supabase);
  if (!canEditRecord(user, 'products', product, caretakerTeams)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();

  /* 🐞 รหัส FG ที่มีช่องว่าง/แท็บติดท้าย — ของจริงบนฐาน 53 จาก 342 ตัวเป็นแบบนี้
     (ก๊อปมาจาก Excel ทั้งช่อง) เช่น `"FG-108-01-002-2009\t\t"` · ตาเปล่ามองไม่เห็น
     แต่ทุกด่านที่เทียบรหัส **ตรงตัว** พังหมด:
       · ด่านกันรหัสซ้ำที่นี่และที่ POST ใช้ `.eq('fgCode', …)` ⇒ พิมพ์รหัสสะอาดเข้าไป
         ไม่ชนของเดิม แล้วเปิดสินค้ารหัสซ้ำได้
       · เมทริกซ์สหมิตรเทียบ `row.fgCode === fgCode` ⇒ แถวไม่แมตช์
       · ZIP รายงานภาษีตั้งชื่อโฟลเดอร์จากรหัส ⇒ ได้ `FG-…-2009__ ชื่อสินค้า`
     POST trim อยู่แล้ว (`String(body.fgCode || '').trim()`) — ทางแก้ไขเคยหลุด
     ⇒ ล้างของเก่าใน DB ที่ mig 0307 และกันของใหม่ตรงนี้ */
  if (typeof body.fgCode === 'string') body.fgCode = body.fgCode.trim();

  // ── Approval action (approve / reject a pending product) ─────────────
  // Setting approvalStatus is reserved for AE Supervisor — AE/AC/Senior hold products:edit
  // but must not approve. Row-level scope is already enforced above by
  // canEditRecord (caretaker team of the owning customer; supervisor = all teams).
  if (body.approvalStatus !== undefined) {
    if (!canApproveMasterData(user?.role)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    if (!['approved', 'rejected', 'pending'].includes(body.approvalStatus)) {
      return Response.json({ error: 'สถานะการอนุมัติไม่ถูกต้อง' }, { status: 400 });
    }
    // ตีกลับต้องบอกเหตุเสมอ (2026-07-27) — กติกาเดียวกับฝั่งลูกค้า ดู lib/master/approval.js
    const rejecting = body.approvalStatus === 'rejected';
    if (rejecting) {
      const reasonError = rejectionReasonError(body.rejectionReason);
      if (reasonError) return Response.json({ error: reasonError }, { status: 400 });
    }
    // ── ด่านเอกสารบังคับ (มติ 2026-07-31) — กติกาเดียวกับฝั่งลูกค้า ─────────
    // สินค้าบังคับ "Artwork สินค้า" · บน prod ยังไม่มีสินค้าใบไหนแนบเลยสักตัว
    // (100 ไฟล์ที่มีอยู่แนบเป็นฉลากของทะเบียนภาษี ไม่ใช่ของสินค้า) จึงต้องมีทางยกเว้น
    const approved = body.approvalStatus === 'approved';
    let overrideReason = null;
    if (approved) {
      const missing = await missingRequiredDocs('product', id, product);
      if (missing.length) {
        if (!body.overrideDocuments) {
          return Response.json({
            error: missingDocsMessage(missing, `สินค้า ${productDisplayName(product) || id} `),
            code: 'missing-documents',
            missing,
          }, { status: 409 });
        }
        const reasonError = overrideReasonError(body.overrideReason);
        if (reasonError) return Response.json({ error: reasonError, code: 'missing-documents' }, { status: 400 });
        overrideReason = String(body.overrideReason).trim();
      }
    }

    const approvalUpdates = {
      approvalStatus: body.approvalStatus,
      approvedBy: user?.id ?? null,
      approvedByName: user?.name ?? null,
      approvedAt: new Date().toISOString(),
      rejectionReason: rejecting ? normalizeRejectionReason(body.rejectionReason) : null,
      updatedAt: new Date().toISOString(),
    };
    const { data: decided, error: decErr } = await supabase
      .from('products').update(approvalUpdates).eq('id', id).select().single();
    if (decErr) return Response.json({ error: decErr.message }, { status: 500 });
    // เหตุการณ์ลงเธรด — ไม่เช็ค error โดยเจตนา (ดู customers/[id]/route.js)
    const threadEvent = masterApprovalUpdate(body.approvalStatus, { reason: decided.rejectionReason });
    if (threadEvent) {
      await appendUpdate(supabase, { entityType: 'product', entityId: id, ...threadEvent, user });
    }
    if (overrideReason) {
      await appendUpdate(supabase, {
        entityType: 'product',
        entityId: id,
        kind: 'override',
        body: `อนุมัติโดยยกเว้นเอกสารบังคับ — เหตุผล: ${overrideReason}`,
        user,
      });
    }
    await recordAudit({
      user, action: 'update', entityType: 'product', entityId: id,
      before: product, after: decided,
      summary: `${body.approvalStatus === 'approved' ? 'อนุมัติ' : body.approvalStatus === 'rejected' ? 'ปฏิเสธ' : 'รีเซ็ตสถานะ'}สินค้า ${productDisplayName(decided) || id}`
        + (overrideReason ? ` (ยกเว้นเอกสาร: ${overrideReason})` : ''),
      request,
    });
    // แจ้งทีมขายเมื่อมีคำตัดสิน (reset เป็น pending = งานภายใน ไม่ต้องแจ้ง)
    if (body.approvalStatus !== 'pending') {
      const approvedNow = body.approvalStatus === 'approved';
    }
    return Response.json(decided);
  }

  // เปลี่ยนสถานะพัก/เปิดใช้ (isActive) สงวนสิทธิ์เฉพาะ admin / ae_supervisor —
  // SA (senior_ae/ac/ae) แก้สเปค/ราคาได้ปกติแต่ห้ามพักใช้สินค้าเอง (ต้องขอผู้บริหาร).
  if (body.isActive !== undefined && !isSuperuser(user?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // Duplicate FG Code check (if changing)
  if (body.fgCode && body.fgCode !== product.fgCode) {
    // ⚠️ รหัสที่ระบบออกให้ (FG-AAAA-BB-CCC-DDDDD, mig 0230) แก้ไม่ได้ — เลขรันถูกจอง
    // จากเคาน์เตอร์กลางไปแล้ว และรหัสไปอยู่บนใบเสนอราคา/ใบสั่งขาย/ทะเบียนสรรพสามิต
    // ⇒ แก้ที่นี่ = ข้อมูลปลายน้ำอ้างรหัสที่ไม่มีอยู่แล้ว · ต้องการรหัสอื่น = สร้างใบใหม่
    // (รหัสที่กรอกเองแบบเดิมยังแก้ได้ตามเดิม เพราะไม่มีเลขจองผูกอยู่)
    // หมวด 03/04 ออกรหัสโดยไม่มีเลขรัน (มติ 2026-08-13) แต่ก็ยังเป็นรหัสที่ระบบออกให้
    // และไปอยู่บนเอกสารปลายน้ำเหมือนกัน ⇒ ล็อกด้วยเหตุผลเดียวกัน ข้อความจึงไม่พูดถึง
    // "เลขรัน" อีกต่อไป เพราะรหัสครึ่งหนึ่งของกลุ่มนี้ไม่มีเลขรันให้พูดถึง
    if (isAutoFgCode(product.fgCode)) {
      return Response.json(
        { error: 'รหัสสินค้านี้ออกโดยระบบ จึงแก้ไม่ได้ — ต้องการรหัสอื่นให้สร้างรายการใหม่' },
        { status: 400 },
      );
    }
    const codeError = fgCodeError(body.fgCode, {
      mode: CODE_MODE_MANUAL,
      categoryCode: body.categoryCode ?? null,
    });
    if (codeError) return Response.json({ error: codeError }, { status: 400 });
    const { data: dup, error: dupError } = await supabase
      .from('products')
      .select('id')
      .eq('fgCode', body.fgCode)
      .maybeSingle();
    if (dupError) return Response.json({ error: dupError.message }, { status: 500 });
    if (dup) {
      return Response.json({ error: 'รหัสสินค้า (FG Code) นี้ถูกขึ้นทะเบียนในระบบแล้ว' }, { status: 409 });
    }
  }

  // Master catalog edit — catalog/spec fields. Customer ownership is now editable
  // here too (was previously only changeable via the excise registration step);
  // excise APPROVAL still lives on the registration.
  const catalogEditable = [
    'fgCode', 'productDescription', 'productDescriptionEn', 'brandName', 'brandNameEn',
    'volume', 'volumeUnit', 'saleUnit', 'costPrice', 'retailPriceIncVat', 'assignee',
    'categoryCode', 'metadata',
    'docNote', 'docNoteEn', // หมายเหตุประจำสินค้า (mig 0317) — ยกเว้นจากด่านอนุมัติด้านล่าง
    'isActive', // lifecycle flag (0036) — พัก/เลิกใช้สินค้า
  ];
  const updated = { ...product };
  for (const k of catalogEditable) if (body[k] !== undefined) updated[k] = body[k];
  /* หมายเหตุที่ถูกล้างต้องเป็น null ไม่ใช่สตริงว่าง — ฝั่ง POST ทำแบบนี้อยู่แล้ว
     (mig 0317) · ถ้าปล่อยเป็น '' ค่าที่เก็บจะต่างกันตามทางที่บันทึกเข้ามา */
  for (const k of PRODUCT_DOC_NOTE_FIELDS) {
    if (body[k] !== undefined) updated[k] = String(body[k] ?? '').trim() || null;
  }
  // ข้อมูลสูตร (0112 → ทะเบียน 0171) — ฟอร์มส่งมาแค่ formulaId ชื่อ/รหัส/วันที่
  // derive ใหม่ทุกครั้ง จึงตาม RD ที่แก้ตัวสูตรในทะเบียนได้เอง ไม่ค้างเป็นค่าเก่า
  //
  // ⚠️ เงื่อนไข `!== undefined`: ผู้เรียกที่ไม่ได้ส่ง formulaId มาเลย (เช่นปุ่ม
  // อนุมัติ/พักใช้งาน ที่ PATCH แค่ field เดียว) ต้องไม่ถูกล้างสูตรทิ้ง
  if (body.formulaId !== undefined) {
    try {
      // forProductId = ตัวเอง — แก้สินค้าที่ถือสูตรนี้อยู่แล้วต้องผ่านด่าน 1:1
      Object.assign(updated, await productFormulaSnapshot(supabase, body.formulaId, { forProductId: id }));
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
    // ถอดสูตรออกจากสินค้าที่เคยมีสูตร → กลิ่นที่ derive มากับสูตรนั้นต้องหลุดตาม
    // (snapshot ตอนล้างตั้งใจไม่แตะ scentId — เพื่อไม่ทำลายสินค้าที่ RD จัดระเบียบ
    // เป็น "กลิ่น" ไว้ ซึ่งไม่มี formulaId มาแต่แรก · ที่นี่รู้ค่าเดิมจึงแยกสองเคสได้)
    if (!body.formulaId && product.formulaId) updated.scentId = null;
  }
  // ชิ้นต่อลัง (0075) — coerce เป็นตัวเลข/null (ฟอร์มส่งมาเป็น string).
  if (body.piecesPerCase !== undefined) {
    updated.piecesPerCase =
      body.piecesPerCase === '' || body.piecesPerCase == null ? null : Number(body.piecesPerCase);
  }

  // กลุ่ม 03/04 ไม่มีช่องปริมาตร/หน่วยบรรจุ/ต่อลัง (มติ 2026-08-20 · ดู units.js)
  // ล้างที่ server เสมอ ไม่ใช่หวังพึ่งจอ — PATCH ยิงตรงได้ และเคสที่กัดจริงคือ
  // **ย้ายหมวดข้ามกลุ่ม**: สินค้ากลุ่ม 01 ที่ถูกย้ายไป 03 ต้องไม่ลากค่าปริมาตรเก่าติดไปด้วย
  // ⇒ ตัดสินจาก updated.categoryCode (ค่าหลังแก้) ไม่ใช่หมวดเดิมของแถว
  Object.assign(updated, clearedPackagingFields(updated));

  // Re-point the FG owner (customerId) from master. Keep the denormalized
  // customerName snapshot in sync and reject an unknown customer. NOTE: existing
  // excise registrations carry their own point-in-time customer snapshot and are
  // not retro-updated here.
  if (body.customerId !== undefined && body.customerId !== product.customerId) {
    const { data: cust, error: custError } = await supabase
      .from('customers').select('*').eq('id', body.customerId).maybeSingle();
    if (custError) return Response.json({ error: custError.message }, { status: 500 });
    if (!cust) return Response.json({ error: 'ไม่พบลูกค้าที่เลือก' }, { status: 404 });
    updated.customerId = cust.id;
    updated.customerName = cust.name;
  }

  // Re-derive categoryCode from fgCode when fgCode changed and it wasn't given.
  // Also backfills legacy rows saved before categoryCode existed (migration 0006).
  if (body.categoryCode === undefined && (body.fgCode !== undefined || !updated.categoryCode)) {
    updated.categoryCode = categoryOf(updated.fgCode) || updated.categoryCode || null;
  }

  // Historic products may retain a category that was later deactivated. Only a
  // change to a different category is blocked, so ordinary edits to that old
  // product remain possible.
  if (updated.categoryCode !== product.categoryCode) {
    const categoryError = await activeProductTypeError(updated.categoryCode);
    if (categoryError) return Response.json({ error: categoryError }, { status: 400 });
  }

  // กลุ่ม 03/04 ไม่มีแบรนด์ (มติ 2026-08-21 · ดู brands.js) — ล้างที่ server เสมอ
  // เคสที่กัดจริงคือ **ย้ายหมวดข้ามกลุ่ม**: สินค้ากลุ่ม 01 ที่ถูกย้ายไป 03 ต้องไม่ลาก
  // ชื่อแบรนด์เก่าติดไปด้วย ⇒ ตัดสินจาก updated.categoryCode หลังหมวดนิ่งแล้ว (ต่างจาก
  // ช่องบรรจุภัณฑ์ด้านบนที่ล้างก่อน re-derive มาแต่เดิม)
  Object.assign(updated, clearedBrandFields(updated));

  // ธง "เสียภาษีไหม": ค่าตั้งต้นจากธง isExcise ของหมวด (mig 0131 — ไม่ parse จาก
  // fgCode ซ้ำ ไม่มีรหัสหมวดตายตัว) แต่ **การยกเว้นรายตัวของฝ่าย RA ที่ตรึงไว้บน
  // สินค้า (taxableOverride) ต้องอยู่รอดการแก้สเปค** — กติกาเดียวกับตอนสร้าง
  // (resolveProductTaxable) · เขียนค่า override ใหม่ทำที่ทะเบียนสรรพสามิต ไม่ใช่ที่นี่
  const isExciseTaxable = resolveProductTaxable({
    taxableOverride: updated.taxableOverride,
    autoTaxable: (await categoryFlagsOf(updated.categoryCode)).isExcise,
  });
  updated.isExciseTaxable = isExciseTaxable;
  // อัตราภาษีคิดที่เดียว (lib/tax/exciseBilling) — ต้องเป็นสูตรเดียวกับตอนสร้าง
  Object.assign(updated, productTaxRates(updated.retailPriceIncVat, { taxable: isExciseTaxable }));

  const factoryPrice = updated.costPrice;
  updated.laborCost = updated.volume >= 30 ? 5 : 2;
  updated.shippingCost = 1;
  updated.materialCost = factoryPrice * 0.65;
  updated.factoryProfit = factoryPrice - updated.materialCost - updated.laborCost - updated.shippingCost;

  updated.updatedAt = new Date().toISOString();

  // Re-approval rule (ทุกระบบ): editing an APPROVED product drops it back to
  // 'pending' so an AE Supervisor must re-approve. No-op if it wasn't approved.
  // EXCEPTION: a pure พัก/เปิดใช้ toggle (isActive-only) is a lifecycle action,
  // not a spec edit — it must NOT un-approve the product (that would silently
  // pull an approved, selling product out of the approved-only pickers and
  // force a fresh approval just to resume it).
  const isLifecycleToggleOnly =
    body.isActive !== undefined && Object.keys(body).every((k) => k === 'isActive');
  /* ฟิลด์ที่ "เปลี่ยนค่าจริง" — ใช้สองงาน: บอกในเธรดว่าแก้อะไรจนต้องอนุมัติใหม่ และ
     ตัดสินว่าการแก้รอบนี้เข้าข้อยกเว้นไหม (mig 0317: แก้เฉพาะหมายเหตุประจำสินค้า
     ไม่ต้องอนุมัติใหม่ — ท่าเดียวกับ CUSTOMER_CONTACT_FIELDS ฝั่งลูกค้า)
     ⚠️ คอลัมน์ต้นทุนที่ derive จาก factoryPrice ถูกคำนวณใหม่ทุกครั้ง = ไม่ใช่สิ่งที่คนแก้
     ⚠️ ผลพลอยได้ที่ตั้งใจ: กดบันทึกโดยไม่แก้อะไรเลยไม่ทำให้สินค้าหลุดจาก picker อีก
     (changedFields ว่าง ⇒ resetApprovalOnEdit คืน null) */
  const changedFields = changedFieldsAgainst(product, updated, {
    ignore: ['updatedAt', 'laborCost', 'shippingCost', 'materialCost', 'factoryProfit',
      'approvalStatus', 'submittedBy', 'submittedByName', 'approvedBy', 'approvedByName', 'approvedAt', 'rejectionReason'],
  });
  const reapproval = isLifecycleToggleOnly
    ? null
    : resetApprovalOnEdit(product, user, { changedFields, exemptFields: PRODUCT_DOC_NOTE_FIELDS });
  if (reapproval) Object.assign(updated, reapproval);

  const { data, error } = await supabase
    .from('products')
    .update(updated)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      return Response.json({ error: 'รหัสสินค้า (FG Code) นี้ถูกขึ้นทะเบียนในระบบแล้ว' }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }
  // Audit เก็บ record เต็ม (ก่อน redact margin) — หน้า /audit เป็น supervisor only.
  await recordProductPriceHistory({
    user,
    productId: id,
    before: product,
    after: data,
    changeType: 'update',
    metadata: { fgCode: data.fgCode, customerId: data.customerId },
  });
  await recordAudit({ user, action: 'update', entityType: 'product', entityId: id, before: product, after: data, request });
  // ตกกลับรออนุมัติ = สินค้าหลุดจากลิสต์เลือกทุกหน้า — ต้องไม่เงียบ · เธรดคือช่องทางเดียว
  // ที่เหลือหลังถอด Google Chat ออก (2026-08-12) จึงต้องเขียนลงเธรดเสมอ
  if (reapproval) {
    const resetEvent = masterReapprovalUpdate(changedFields, { fromStatus: product.approvalStatus });
    if (resetEvent) {
      await appendUpdate(supabase, { entityType: 'product', entityId: id, ...resetEvent, user });
    }
  }
  return Response.json(redactProductMargin(user, data));
}

// DELETE /api/products/[id] — supervisor only (enforced here + by proxy cap).
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: product, error: findErr } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!product) return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  if (!canDeleteRecord(user, 'products', product)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  /* guard ก่อนลบ — กันไม่ให้เกิด record กำพร้า
     ⚠️ FK ของหลายตารางเป็น `ON DELETE SET NULL` ⇒ ฐานข้อมูล **ไม่ได้กัน** ให้ มันแค่ลบ
     สายเชื่อมทิ้งเงียบ ๆ · ด่านจริงคือที่นี่

     ⭐ 2026-08-16: เดิมตรวจแค่ 3 ตาราง (โครงการ · รายการออเดอร์ · การขึ้นทะเบียน)
     ทั้งที่บนฐานจริงมี **15 ตารางถือ `productId`** ⇒ ลบสินค้าที่ยังอยู่บนบรรทัดใบเสนอราคา
     167 บรรทัด / ใบสั่งขาย 26 / พยากรณ์สหมิตร 331 ได้เงียบ ๆ · ยกลิสต์ไปเป็นทะเบียนกลาง
     (`lib/master/entityReferences`) ตัวเดียวกับฝั่งลูกค้า และมี `npm run check:refs`
     เทียบกับฐานจริงไม่ให้ตกหล่นอีก */
  const { refs, error: refErr } = await findEntityReferences(supabase, 'product', id);
  if (refErr) return Response.json({ error: refErr.message }, { status: 500 });
  const block = referencedBlock('สินค้า', refs);
  if (block) return Response.json({ error: block }, { status: 409 });

  const { data, error } = await supabase.from('products').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  // Cascade: purge attachments (rows + storage/Drive files) so deleting a
  // product never orphans its documents.
  await purgeAttachments('product', id);
  /* สมุดประวัติราคาไม่มี FK และ `productId` เป็น NOT NULL ⇒ ไม่มีใครกวาดให้
     (ไม่นับเป็นการอ้างอิงที่บล็อกการลบ — มีตั้งแต่ตอนสร้างสินค้า ดู entityReferences) */
  await purgeProductPriceHistory(id);
  // เธรดกลางเป็น polymorphic ไม่มี FK → ต้องกวาดเอง
  await purgeUpdates(supabase, 'product', id);
  await recordAudit({ user, action: 'delete', entityType: 'product', entityId: id, before: product, request });
  // ดูเหตุผลที่ต้องบอกผลของเลขที่ DELETE ของลูกค้า (mig 0248)
  const reclaimed = isReusableCode(product) && isAutoFgCode(product.fgCode);
  return Response.json({
    success: true,
    message: reclaimed
      ? `ลบสินค้าเรียบร้อยแล้ว — รหัส ${product.fgCode} ยังไม่เคยผ่านอนุมัติ เลขรันนี้กลับไปรอออกให้ใบถัดไป`
      : 'ลบสินค้าเรียบร้อยแล้ว',
  });
}
