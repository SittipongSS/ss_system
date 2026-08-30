import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord, canEditRecord, canDeleteRecord, canApproveMasterData, canEditIssuedMasterCode, isSuperuser, redactProductMargin } from '@/lib/permissions';
import {
  changedFieldsAgainst, CUSTOMER_ADDRESS_EXEMPT_FIELDS, CUSTOMER_CONTACT_FIELDS, normalizeRejectionReason,
  rejectionReasonError, resetApprovalOnEdit,
} from '@/lib/master/approval';
import { addressesFromLegacy, legacyAddressMirror, normalizeAddresses } from '@/lib/master/addresses';
import { customerNameError, customerNamePatch } from '@/lib/master/customerName';
import { cascadeCustomerName } from '@/lib/master/customerNameMirrors';
import { normalizeBrands } from '@/lib/master/brands';
import {
  AR_SCOPE, CODE_MODE_MANUAL, RECLAIMED_TABLE, arCodeError, isAutoArCode, isReusableCode,
  reclaimableArNumber,
} from '@/lib/master/masterCodes';
import { SAHAMIT_AR_CODE } from '@/lib/sahamit/server';
import {
  branchKeyOf, isThaiTaxEntity, splitTaxIdMatches, taxIdDuplicateError, taxIdFormatError, taxIdKey,
  taxIdMatchFilter, taxIdStore,
} from '@/lib/master/customerTaxId';
import { listForCustomer } from '@/lib/excise/registrations';
import { ORDER_SELECT, attachRegistrations } from '@/lib/tax/orders';
import { referencedBlock } from '@/lib/deletion';
import { findEntityReferences } from '@/lib/master/entityReferences';
import { purgeAttachments } from '@/lib/master/attachments';
import { appendUpdate, purgeUpdates } from '@/lib/master/updates';
import { masterApprovalUpdate, masterReapprovalUpdate } from '@/lib/master/recordUpdates';
import { recordAudit } from '@/lib/audit';
import { missingRequiredDocs } from '@/lib/master/attachmentRequirements';
import { missingDocsMessage, overrideReasonError } from '@/lib/master/attachmentTypes';

export const dynamic = 'force-dynamic';

// GET /api/customers/[id]
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });

  // The customer's product catalog — source of truth is products.customerId (the
  // real FK). Was previously derived from excise_registrations, so a customer
  // with products but no excise filing (e.g. planning/sales-only customers like
  // SAHAMIT) showed an empty list. Team-scoped per the products module.
  const { data: ownProducts } = await supabase
    .from('products').select('*').eq('customerId', id).order('createdAt', { ascending: false });
  const catalog = (ownProducts || []).filter((p) => canViewRecord(user, 'products', p));

  // Excise registrations: still needed for the tax overlay (status/tax per
  // product) and to collect this customer's orders below.
  const regs = (await listForCustomer(id)).filter((r) => canViewRecord(user, 'registrations', r));
  const regByProduct = new Map();
  for (const r of regs) if (r.productId && !regByProduct.has(r.productId)) regByProduct.set(r.productId, r);

  // Defensive: pull in any registered product missing from the catalog (legacy
  // rows whose customerId was never backfilled) so the list stays a superset.
  const missingIds = [...new Set(regs.map((r) => r.productId)
    .filter((pid) => pid && !catalog.some((p) => p.id === pid)))];
  if (missingIds.length) {
    const { data: extra } = await supabase.from('products').select('*').in('id', missingIds);
    for (const p of extra || []) catalog.push(p);
  }

  // Merge: master spec + (when present) the registration's status/tax snapshot.
  // No registration → fall back to the product's own master approval status.
  // Strip the confidential cost breakdown/profit for non-margin roles — the
  // catalog is now cross-team visible (canViewRecord products), so this endpoint
  // must redact per-cap exactly like the products list GET, or it would leak
  // other teams' factory margin.
  const products = catalog.map((p) => {
    const r = regByProduct.get(p.id);
    return redactProductMargin(user, {
      ...p,
      registrationId: r?.id ?? null,
      fgCode: r?.fgCode ?? p.fgCode,
      productDescription: r?.productName ?? p.productDescription,
      brandName: r?.brandName ?? p.brandName,
      status: r?.status ?? p.approvalStatus,
      // ทะเบียนตัดสินว่า "เสียภาษีไหม" (ฝ่าย RA override ได้) ส่วน **อัตรา** มาจาก
      // ทะเบียนสินค้าเสมอ — คิดจากราคาขายปลีกของ FG ซึ่งอัปเดตได้เหมือนราคาผลิต
      // (เดิมอ่านสำเนาบนทะเบียนก่อน → ราคาขยับแล้วหน้านี้ค้างเลขเก่า ไม่ตรงกับใบยื่น)
      isExciseTaxable: r ? r.isExciseTaxable : p.isExciseTaxable,
      exciseTax: (r ? r.isExciseTaxable !== false : p.isExciseTaxable !== false) ? p.exciseTax : 0,
      localTax: (r ? r.isExciseTaxable !== false : p.isExciseTaxable !== false) ? p.localTax : 0,
    });
  });

  // Collect this customer's orders: direct link (orders.customerId) +
  // registrations of this customer referenced by any order line.
  const orderIds = new Set();
  const { data: directOrders } = await supabase
    .from('orders')
    .select('id')
    .eq('customerId', id);
  (directOrders || []).forEach((o) => orderIds.add(o.id));

  const regIds = regs.map((r) => r.id);
  if (regIds.length) {
    const { data: itemRows } = await supabase
      .from('order_items')
      .select('orderId')
      .in('registrationId', regIds);
    (itemRows || []).forEach((r) => orderIds.add(r.orderId));
  }

  let orders = [];
  const ids = [...orderIds];
  if (ids.length) {
    const { data: ord } = await supabase
      .from('orders')
      .select(ORDER_SELECT)
      .in('id', ids)
      .order('createdAt', { ascending: false });
    await attachRegistrations(supabase, ord);
    orders = (ord || []).filter((o) => canViewRecord(user, 'orders', o));
  }

  return Response.json({ customer, products, orders });
}

// PATCH /api/customers/[id]
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: customer, error: findErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });

  if (!canEditRecord(user, 'customers', customer)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // ── Approval action (approve / reject a pending customer) ────────────
  // Setting approvalStatus is reserved for AE Supervisor — AE/AC/Senior hold customers:edit
  // but must not approve. Row-level scope is already enforced above by
  // canEditRecord (caretaker team = customer.teams[]; supervisor = all teams).
  if (body.approvalStatus !== undefined) {
    if (!canApproveMasterData(user?.role)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    if (!['approved', 'rejected', 'pending'].includes(body.approvalStatus)) {
      return Response.json({ error: 'สถานะการอนุมัติไม่ถูกต้อง' }, { status: 400 });
    }
    // ตีกลับต้องบอกเหตุเสมอ (2026-07-27) — เดิมไม่บังคับ คนสร้างเห็นแค่ป้ายแดง
    // แล้วต้องเดาเองว่าต้องแก้อะไร ทั้งที่ทุกโมดูลอื่นบังคับหมด
    const rejecting = body.approvalStatus === 'rejected';
    if (rejecting) {
      const reasonError = rejectionReasonError(body.rejectionReason);
      if (reasonError) return Response.json({ error: reasonError }, { status: 400 });
    }
    // ── ด่านเอกสารบังคับ (มติ 2026-07-31) ──────────────────────────────
    // การ์ด required ใน attachmentTypes เคยเป็นป้ายเฉย ๆ ไม่มีผลจริง — ตอนนี้อนุมัติ
    // ไม่ผ่านถ้าเอกสารบังคับไม่ครบ · ยกเว้นได้แต่ต้องเขียนเหตุผล และถูกบันทึกไว้ทั้งใน
    // audit และเธรด (ดูเหตุผลที่ต้องมีทางยกเว้นใน lib/master/attachmentRequirements)
    const approved = body.approvalStatus === 'approved';
    let overrideReason = null;
    if (approved) {
      const missing = await missingRequiredDocs('customer', id, customer);
      if (missing.length) {
        if (!body.overrideDocuments) {
          return Response.json({
            error: missingDocsMessage(missing, `ลูกค้า ${customer.name || id} `),
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
      .from('customers').update(approvalUpdates).eq('id', id).select().single();
    if (decErr) return Response.json({ error: decErr.message }, { status: 500 });
    // เหตุการณ์ลงเธรด — ไม่เช็ค error โดยเจตนา (action สำเร็จแล้ว เธรดพลาดต้องไม่ 500)
    // ⭐ `rejectionReason` ถูกล้างเป็น null ทั้งตอนอนุมัติและตอนแก้ (resetApprovalOnEdit)
    // → ตีกลับรอบสองลบเหตุผลรอบแรกทิ้งถาวร · เธรดเก็บครบทุกรอบ
    const threadEvent = masterApprovalUpdate(body.approvalStatus, { reason: decided.rejectionReason });
    if (threadEvent) {
      await appendUpdate(supabase, { entityType: 'customer', entityId: id, ...threadEvent, user });
    }
    // การยกเว้นเอกสารต้องเห็นได้ตลอดไปในเธรด ไม่ใช่รู้กันแค่ตอนกด
    if (overrideReason) {
      await appendUpdate(supabase, {
        entityType: 'customer',
        entityId: id,
        kind: 'override',
        body: `อนุมัติโดยยกเว้นเอกสารบังคับ — เหตุผล: ${overrideReason}`,
        user,
      });
    }
    await recordAudit({
      user, action: 'update', entityType: 'customer', entityId: id,
      before: customer, after: decided,
      summary: `${body.approvalStatus === 'approved' ? 'อนุมัติ' : body.approvalStatus === 'rejected' ? 'ปฏิเสธ' : 'รีเซ็ตสถานะ'}ลูกค้า ${decided.name || id}`
        + (overrideReason ? ` (ยกเว้นเอกสาร: ${overrideReason})` : ''),
      request,
    });
    // แจ้งทีมขายเมื่อมีคำตัดสิน (reset เป็น pending = งานภายใน ไม่ต้องแจ้ง)
    if (body.approvalStatus !== 'pending') {
      const approvedNow = body.approvalStatus === 'approved';
    }
    return Response.json(decided);
  }

  // ── Add-brand action (ปุ่ม "+" ในฟอร์มเลือกแบรนด์) ────────────────────
  // เพิ่มแบรนด์เข้า brands[] อย่างเดียว และ "ไม่" reset เป็น pending: กฎที่ล็อก
  // ไว้คือแบรนด์ไม่เข้า approval workflow (เป็นแอตทริบิวต์ของลูกค้าที่อนุมัติ
  // แล้ว) — ถ้า revert ที่นี่ ลูกค้าจะหายจาก picker ทันทีที่กด "+" กลางฟอร์ม
  // สร้างสินค้า/ดีล. การแก้แบรนด์ผ่านฟอร์มลูกค้าเต็ม (body.brands) ยังเข้า
  // re-approval ตามปกติด้านล่าง.
  if (body.addBrand !== undefined) {
    const [brand] = normalizeBrands([body.addBrand]);
    if (!brand) {
      return Response.json({ error: 'ต้องระบุชื่อแบรนด์อย่างน้อย 1 ภาษา' }, { status: 400 });
    }
    const current = normalizeBrands(customer.brands);
    const merged = normalizeBrands([...current, brand]);
    if (merged.length === current.length) {
      return Response.json({ error: 'ลูกค้ารายนี้มีแบรนด์นี้อยู่แล้ว — เลือกจากรายการได้เลย' }, { status: 409 });
    }
    const { data: updated, error: addErr } = await supabase
      .from('customers')
      .update({ brands: merged, updatedAt: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (addErr) return Response.json({ error: addErr.message }, { status: 500 });
    await recordAudit({
      user, action: 'update', entityType: 'customer', entityId: id,
      before: customer, after: updated,
      summary: `เพิ่มแบรนด์ "${brand.en || brand.th}" ให้ลูกค้า ${customer.name || id}`,
      request,
    });
    return Response.json(updated);
  }

  // ⚠️ **ตัดช่องว่างก่อนทุกด่าน แล้วใช้ค่าที่ตัดแล้วเป็นค่าที่บันทึกจริง** (2026-08-24)
  // เดิมด่านตรวจ trim ให้ (digitsOf) แต่ค่าที่เขียนลงตารางเป็นค่าดิบ ⇒ `" AR-1009 "` ผ่าน
  // ทุกด่านแล้วลงฐานทั้งช่องว่าง · บนจอเหมือนกันเป๊ะ แต่ระบบถือเป็นคนละค่า: ด่านกันซ้ำ
  // (`.eq('arCode', …)`) กับ unique index เทียบสตริงตรง ๆ จึงมองไม่เห็น และท่อน seed ของ
  // `create_customer_with_code` (LIKE 'AR-%' + regex ตัวเลขล้วน) ก็ข้ามแถวนี้ ⇒ เคาน์เตอร์
  // ออก `AR-1009` ให้อีกรายได้ในภายหลัง กลายเป็นรหัสซ้ำที่มองด้วยตาไม่เห็น
  //
  // ⚠️ **เช็ค `!== undefined` ไม่ใช่ truthy** — ของเดิมใช้ `body.arCode &&` ⇒ ส่งค่าว่างมา
  // จะ **ข้ามทั้งบล็อก** (ด่านสิทธิ์/สหมิตร/รูปแบบ/ซ้ำ) แล้วตกไปเขียนรหัสว่างทับของจริง
  // (ฟอร์มมี required จึงไม่โดนทางจอ แต่ยิง API ตรงได้ — และ route นี้คือทางซ่อมรหัส
  // อย่างเป็นทางการแล้ว) · ตอนนี้ค่าว่างวิ่งเข้า arCodeError แล้วเด้ง "กรุณากรอกรหัสลูกค้า"
  const nextArCode = String(body.arCode ?? '').trim();
  if (body.arCode !== undefined && nextArCode !== customer.arCode) {
    // ── ใครแก้เลข AR ได้บ้าง (มติผู้ใช้ 2026-08-24) ──────────────────────────
    // ⭐ **admin แก้ได้ทั้งรหัสที่ระบบออกให้ (AR-AAAA) และรหัสเดิมที่กรอกมือ (AR-AAA)**
    // — ทะเบียนที่ยกมาจากระบบเก่ามีเลขผิดอยู่จริง และเดิมซ่อมได้เฉพาะรหัสกรอกมือ ⇒ ใบที่
    // ระบบออกเลขให้ผิดไม่มีทางแก้เลยนอกจากลบสร้างใหม่ ซึ่งพาดีล/ใบเสนอราคาที่ผูก
    // `customerId` ไว้หลุดตามไปด้วย · คนอื่นยังเป็นกติกาเดิมทุกอย่าง
    //
    // ⚠️ **สิ่งที่การแก้รหัสนี้ไม่ได้ทำให้** (ผู้เรียกต้องรู้ก่อนกด — โมดัลยืนยันหน้าลูกค้า
    // เขียนไว้ครบแล้ว): เลขเดิม **ไม่กลับเข้ากองเลขคืน** (`entity_number_reclaimed`) เพราะ
    // กองนั้นรับเฉพาะเลขของแถวที่ถูกลบและไม่เคยอนุมัติ · รหัสสินค้า `FG-AAAA-…` ของลูกค้า
    // รายนี้ **ยังฝังเลขเดิมไว้** (รหัสคือสตริงที่ออกครั้งเดียว ไม่ใช่ค่าที่คำนวณสด) ·
    // เอกสารที่พิมพ์รหัสเดิมไปแล้วก็ไม่ตามมาแก้ให้
    const mayEditIssued = canEditIssuedMasterCode(user?.role);
    if (isAutoArCode(customer.arCode) && !mayEditIssued) {
      return Response.json(
        { error: 'รหัสลูกค้านี้ออกโดยระบบ (เลขรันอัตโนมัติ) จึงแก้ไม่ได้ — ต้องให้แอดมินเป็นคนแก้' },
        { status: 400 },
      );
    }
    // 🔴 ลูกค้าสหมิตร = `AR-109` **ฝังอยู่ในโค้ด** (`lib/sahamit/server.js` — ทุก API ของ
    // โมดูลสหมิตรหาลูกค้าจากรหัสนี้ ไม่ใช่จาก id) ⇒ แก้รหัสนี้เมื่อไร ทั้งโมดูลตอบ
    // "ไม่พบลูกค้า AR-109" ทันทีโดยไม่มีอะไรฟ้องตอนกดบันทึก · ต้องแก้ค่าคงที่ในโค้ดก่อน
    // (ด่านนี้กันเฉพาะ "ย้ายรหัสนี้ออก" — การย้ายรหัสนี้ไปให้รายอื่นถูกกันด้วยด่านซ้ำอยู่แล้ว)
    if (customer.arCode === SAHAMIT_AR_CODE) {
      return Response.json(
        { error: `${SAHAMIT_AR_CODE} เป็นรหัสของลูกค้าสหมิตรซึ่งถูกอ้างไว้ในโค้ดของโมดูลสหมิตร — แก้รหัสนี้ต้องแก้ค่าคงที่ SAHAMIT_AR_CODE (src/lib/sahamit/server.js) พร้อมกัน` },
        { status: 400 },
      );
    }
    const codeError = arCodeError(nextArCode, { mode: CODE_MODE_MANUAL, allowIssued: mayEditIssued });
    if (codeError) return Response.json({ error: codeError }, { status: 400 });
    const { data: dup, error: dupError } = await supabase
      .from('customers')
      .select('id')
      .eq('arCode', nextArCode)
      .maybeSingle();
    if (dupError) return Response.json({ error: dupError.message }, { status: 500 });
    if (dup) return Response.json({ error: 'รหัสลูกค้านี้มีในระบบแล้ว' }, { status: 409 });
  }

  const oldName = customer.name;
  const oldTaxId = customer.taxId;

  const updates = {};
  // 'team'/'ownerId' allow transferring a customer to another team (gated above
  // by canEditRecord — supervisor cross-team, team roles within their scope).
  for (const k of [
    'arCode', 'name', 'nameEn', 'taxId', 'customerType', 'branchCode', 'phone', 'address', 'shippingAddress', 'brands',  // mapFileUrl ย้ายไป attachments แล้ว
    'contactPerson', 'contactPhone', 'email', 'creditTerms', 'metadata',  // master-data fields (0005, 0025)
    'team', 'ownerId',
    'isActive',  // lifecycle flag (0030) — พักใช้/เปิดใช้ลูกค้า; edit-level gate (canEditRecord above)
    'isForeign', // ต่างประเทศ = เลขผู้เสียภาษีไม่ใช่ 13 หลักของไทย (migration 0319)
  ]) {
    if (body[k] !== undefined) {
      // ช่องที่ "ว่าง = ยังไม่กรอก" ต้องลง null ไม่ใช่ '' — ไม่งั้น falsy เหมือนกัน
      // แต่ค่าที่เก็บต่างกันสองแบบ แล้วการ์ด/ตาราง/ด่านตรวจต้องเช็คสองรูปตลอดไป
      updates[k] = (['taxId', 'nameEn'].includes(k) && String(body[k]).trim() === '') ? null : body[k];
    }
  }
  // รหัสลูกค้าเขียนค่าที่ตัดช่องว่างแล้วเสมอ — ค่าดิบผ่านลูปข้างบนมา (เหตุผลอยู่ที่ด่านข้างบน)
  if (body.arCode !== undefined) updates.arCode = nextArCode;
  // brands (0059): normalize to [{th,en}] — accepts legacy string[] too.
  if (body.brands !== undefined) updates.brands = normalizeBrands(body.brands);
  /* คำนำหน้า/ชื่อเปล่าของลูกค้าบุคคล (mig 0296) — เขียนกระจก `name` ทับให้ตรงกับสอง
     ช่องย่อยเสมอ · ต้องอยู่ **ก่อน** ด่านชื่อข้างล่าง ไม่งั้นด่านตรวจ `name` ตัวเก่า
     (ที่ฟอร์มบุคคลไม่ได้ส่งมาแล้ว) แทนที่จะตรวจชื่อที่กำลังจะถูกบันทึกจริง
     🪤 ไม่ใส่ nameTitle/namePerson ในลูป allowlist ข้างบน — สองช่องนี้ต้องเดินคู่กัน
        เสมอ ปล่อยให้ PATCH มาทีละช่องได้เมื่อไหร่ กระจก `name` จะเพี้ยนทันที
     🪤 เข้าเงื่อนไขเฉพาะตอน **body ส่งช่องย่อยมาจริง** — ถ้าดูจากค่าในแถวแทน
        (ซึ่งมีคีย์เสมอหลัง mig 0296) การเปลี่ยนชื่อนิติบุคคลผ่าน `name` เฉย ๆ
        จะโดนประกอบทับด้วยค่าเก่าเงียบ ๆ */
  if (body.nameTitle !== undefined || body.namePerson !== undefined) {
    Object.assign(updates, customerNamePatch({
      customerType: updates.customerType ?? customer.customerType,
      nameTitle: body.nameTitle ?? customer.nameTitle,
      namePerson: body.namePerson ?? customer.namePerson,
      name: updates.name ?? customer.name,
    }));
  }
  // ⭐ ชื่ออย่างน้อยหนึ่งภาษา (มติ 2026-08-22 · mig 0283) — เทียบกับ **ค่าหลังแก้**
  // ไม่ใช่ค่าที่ส่งมาอย่างเดียว: ฟอร์มส่งทั้งก้อนก็จริง แต่สายอื่นยิงคีย์เดียวได้
  // (ลบชื่อไทยทิ้งโดยยังมีชื่ออังกฤษ = ผ่าน · ลบทิ้งทั้งคู่ = ตีกลับ)
  const nameError = customerNameError({ ...customer, ...updates });
  if (nameError) return Response.json({ error: nameError }, { status: 400 });

  // ที่อยู่ (0202): ลิสต์คือแหล่งความจริง; ที่อยู่หลัก → กระจกลงช่องเดี่ยวเดิม.
  // ผู้เรียกเก่าที่ยัง PATCH มาด้วย address/shippingAddress ยังใช้ได้ — แปลงขึ้นลิสต์
  // ให้ ไม่งั้นแก้ผ่านสายเก่าแล้วลิสต์ค้างค่าเดิม = ข้อมูลสองชุด
  // branchCode (2026-08-06) เป็นกระจกของที่อยู่ออกบิลหลักแล้ว — ค่าที่ตั้งไว้เดิมบน
  // ตัวลูกค้าเป็นค่าสำรองสำหรับแถวที่ยังไม่ได้ backfill สาขาลงที่อยู่
  const legacyAddressEdit = ['address', 'shippingAddress'].some((k) => body[k] !== undefined);
  if (body.addresses !== undefined || legacyAddressEdit) {
    const addresses = normalizeAddresses(
      body.addresses !== undefined
        ? body.addresses
        : addressesFromLegacy({ ...customer, ...updates }),
    );
    const mirror = legacyAddressMirror(addresses, {
      fallbackBranchCode: updates.branchCode ?? customer.branchCode,
    });
    if (!mirror.address) {
      return Response.json({ error: 'ต้องมีที่อยู่สำหรับออกเอกสารอย่างน้อย 1 รายการ' }, { status: 400 });
    }
    updates.addresses = addresses;
    Object.assign(updates, mirror);
  }
  // ── เช็คซ้ำจากเลขประจำตัวผู้เสียภาษี (มติผู้ใช้ 2026-08-12 · ยืนยัน 2026-08-30) ──
  // ต้องอยู่ **หลัง** บล็อกที่อยู่ เพราะสาขาที่ใช้เทียบอาจเพิ่งเปลี่ยนในใบแก้นี้เอง
  // (แก้ที่อยู่ออกบิลจาก สนญ. ไปสาขา = ย้ายไปชนกับลูกค้าอีกรายได้) และที่อยู่ยังเป็น
  // ตัวบอกด่านรูปแบบว่าเป็นลูกค้าไทยไหม
  //
  // ⚠️ **เช็คเมื่อคีย์ขยับเท่านั้น** และคีย์ทั้งสองครึ่งต้องเทียบแบบ normalize แล้ว
  // (`taxIdKey` / `branchKeyOf` ไม่ใช่สตริงดิบ) ด้วยสองเหตุผล:
  //   1. ใบที่แก้แค่ชื่อ/เบอร์ ไม่ต้องแตะฐานข้อมูลเพิ่ม
  //   2. แถวยุคเก่าที่เก็บคนละรูป ('0-1055-…' / ศูนย์นำหน้าหาย / สาขา 'สำนักงานใหญ่')
  //      ต้อง **แก้ต่อได้** — ฟอร์มส่งค่าที่ normalize แล้วกลับมาเสมอ ถ้าเทียบสตริงดิบ
  //      จะนับเป็น "เปลี่ยนเลข" ทุกครั้งแล้วไปติดด่านซ้ำ/ด่านรูปแบบของตัวเอง จนใบนั้น
  //      บันทึกไม่ได้อีกเลย (คีย์เท่าเดิม = ปล่อยผ่าน แต่ค่าที่เขียนลงเป็นรูปที่สะอาดแล้ว)
  //
  // ⚠️ **เปิดใช้ใบที่พักไว้กลับ ก็ต้องเช็คด้วย** — ใบที่พักใช้ไม่ถูกนับว่าซ้ำ (ทั้งด่านนี้
  // และ unique partial ของ mig 0318) ⇒ ถ้าไม่เช็คตอนเปิดกลับ ใบที่ถูกพักเพราะยุบซ้ำ
  // จะเด้งกลับมาชนใบหลักได้เงียบ ๆ ด้วยการกดสวิตช์เดียว
  if (updates.taxId !== undefined) updates.taxId = taxIdStore(updates.taxId);
  const nextTaxId = updates.taxId !== undefined ? updates.taxId : customer.taxId;
  const nextBranch = updates.branchCode !== undefined ? updates.branchCode : customer.branchCode;
  const reactivating = updates.isActive === true && customer.isActive === false;
  const taxKeyChanged = taxIdKey(nextTaxId) !== taxIdKey(customer.taxId)
    || branchKeyOf(nextBranch) !== branchKeyOf(customer.branchCode);
  if (nextTaxId && (taxKeyChanged || reactivating)) {
    // ด่านรูปแบบผูกกับ "แก้เลข" เท่านั้น — การเปิดใช้ใบเก่ากลับต้องไม่ถูกบล็อกเพราะ
    // เลขในใบนั้นเป็นรูปยุคเก่า (ยังไม่ได้แตะเลย ก็ไม่ควรถูกบังคับให้แก้ตรงนี้)
    if (taxKeyChanged) {
      const nextForeign = updates.isForeign !== undefined ? updates.isForeign : customer.isForeign;
      const thaiEntity = isThaiTaxEntity({ isForeign: nextForeign, taxId: nextTaxId });
      const taxFormatError = taxIdFormatError(nextTaxId, { thaiEntity });
      if (taxFormatError) return Response.json({ error: taxFormatError }, { status: 400 });
    }
    const { data: sameTax, error: taxError } = await supabase
      .from('customers').select('id, arCode, name, taxId, branchCode, isActive').or(taxIdMatchFilter(nextTaxId));
    if (taxError) return Response.json({ error: taxError.message }, { status: 500 });
    const { sameBranch } = splitTaxIdMatches(sameTax, {
      taxId: nextTaxId, branchCode: nextBranch, excludeId: customer.id,
    });
    const taxDupError = taxIdDuplicateError(sameBranch, { branchCode: nextBranch });
    if (taxDupError) return Response.json({ error: taxDupError }, { status: 409 });
  }
  // teams[] (0037): assigning caretaker teams is a cross-team management action —
  // supervisor/admin only (others may edit the record but not re-scope it).
  if (body.teams !== undefined && isSuperuser(user?.role)) {
    updates.teams = Array.isArray(body.teams) ? body.teams.filter(Boolean) : [];
  }
  // Contacts (0033): the list is source of truth; mirror primary -> legacy singles.
  if (body.contacts !== undefined) {
    const contacts = Array.isArray(body.contacts) ? body.contacts : [];
    const primary = contacts[0] || {};
    updates.contacts = contacts;
    updates.contactPerson = primary.name || null;
    updates.contactPhone = primary.phone || null;
    updates.email = primary.email || null;
  }
  // Re-approval rule (ทุกระบบ): editing an APPROVED customer drops it back to
  // 'pending' so an AE Supervisor must re-approve. Hidden from downstream pickers
  // (GET returns approved-only) until then. No-op if it wasn't approved.
  // ยกเว้นการแก้ผู้ติดต่อ (มติ 2026-07-27) — เทียบ "ค่าที่เปลี่ยนจริง" ไม่ใช่ key ที่ส่งมา
  // เพราะฟอร์มแก้ไขส่งทั้งก้อนทุกครั้ง (ดู lib/master/approval.js)
  const changedFields = changedFieldsAgainst(customer, updates, { ignore: ['updatedAt'] });
  const reapproval = resetApprovalOnEdit(customer, user, {
    changedFields,
    exemptFields: [...CUSTOMER_CONTACT_FIELDS, ...CUSTOMER_ADDRESS_EXEMPT_FIELDS],
  });
  if (reapproval) Object.assign(updates, reapproval);

  updates.updatedAt = new Date().toISOString();

  const { data: updated, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) {
    if (error.code === '23505') {
      const msg = /taxId/i.test(error.message) ? 'เลขประจำตัวผู้เสียภาษี + สาขานี้มีในระบบแล้ว' : 'รหัสลูกค้านี้มีในระบบแล้ว';
      return Response.json({ error: msg }, { status: 409 });
    }
    return Response.json({ error: error.message }, { status: 500 });
  }

  // ── ย้ายรหัสออกจากเลขที่ระบบออกให้ = เลขเดิมกลับเข้ากองเลขคืน (มติ 2026-08-25) ──
  // เงื่อนไขและเหตุผลอยู่ที่ `reclaimableArNumber` — เงื่อนไขเดียวกับตอนลบร่างทิ้ง (mig 0248)
  //
  // ⚠️ **ต้องอยู่หลัง update สำเร็จ** — คืนก่อนแล้วบันทึกล้ม = เลขที่ยังมีเจ้าของอยู่ถูก
  // ปล่อยเข้ากอง · และ **ล้มตรงนี้ต้องไม่ทำให้คำขอล้ม**: การแก้รหัสสำเร็จไปแล้วจริง ๆ
  // ส่วนที่เสียไปคือเลขไม่ถูกคืน ซึ่งเท่ากับพฤติกรรมก่อนมติใบนี้ (ตารางกองเลขอาจยังไม่มี
  // ถ้า mig 0248 ไม่ได้รัน — ตอบ 42P01/PGRST205 ซึ่งไม่ใช่เหตุให้ผู้ใช้เห็น error)
  if (updated.arCode !== customer.arCode) {
    const reclaimNo = reclaimableArNumber(customer);
    if (reclaimNo) {
      const { error: reclaimError } = await supabase
        .from(RECLAIMED_TABLE)
        .upsert(
          { scope: AR_SCOPE, no: reclaimNo, releasedFrom: customer.arCode },
          { onConflict: 'scope,no', ignoreDuplicates: true },
        );
      if (reclaimError) console.error('คืนเลข AR ไม่สำเร็จ:', reclaimError.message);
    }
  }

  /* สำเนาชื่อลูกค้าที่กระจายอยู่ตามตารางอื่น — รายการ + กติกาของแต่ละตารางอยู่ที่
     lib/master/customerNameMirrors.js ที่เดียว
     🐞 เดิมบรรทัดนี้ hard-code ไว้ที่ `excise_registrations` ตารางเดียว ทั้งที่มี 5 ตาราง
     ถือคอลัมน์ `customerName` ⇒ เปลี่ยนชื่อลูกค้าแล้วโครงการ/ดีลค้างชื่อเก่าถาวร
     (วัดจริง 2026-08-27: projects 3 แถว · sales_deals 4 แถว)
     ⚠️ ไม่บล็อกการบันทึกเมื่อสำเนาตารางใดเขียนไม่ผ่าน — ตัวลูกค้าอัปเดตสำเร็จไปแล้ว
     แต่ต้อง log (cascadeCustomerName ทำให้) ไม่ใช่เงียบแบบตัวเดิมที่ไม่เช็ค error เลย */
  await cascadeCustomerName(supabase, id, updated);
  void oldName; void oldTaxId;

  await recordAudit({ user, action: 'update', entityType: 'customer', entityId: id, before: customer, after: updated, request });
  // ตกกลับรออนุมัติ = ลูกค้าหลุดจากลิสต์เลือกทุกหน้า — ต้องไม่เงียบ
  if (reapproval) {
    // เธรดคือช่องทางเดียวที่เหลือหลังถอด Google Chat ออก (2026-08-12) — คนเปิดหน้าดู
    // ทีหลังต้องอ่านออกว่า "ทำไมของที่เคยอนุมัติแล้วกลับมา pending"
    const resetEvent = masterReapprovalUpdate(changedFields);
    if (resetEvent) {
      await appendUpdate(supabase, { entityType: 'customer', entityId: id, ...resetEvent, user });
    }
  }
  return Response.json(updated);
}

// DELETE /api/customers/[id] — supervisor only (enforced here + by proxy cap).
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: customer, error: findErr } = await supabase
    .from('customers')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });
  if (!canDeleteRecord(user, 'customers', customer)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  /* ข้อ 3: guard ก่อนลบ — กันไม่ให้เกิด record กำพร้า
     ⚠️ FK ของหลายตารางเป็น `ON DELETE SET NULL` ⇒ ฐานข้อมูล **ไม่ได้กัน** ให้ มันแค่
     ลบสายเชื่อมทิ้งเงียบ ๆ · ด่านจริงคือที่นี่
     ⚠️ **สินค้าต้องอยู่ในด่านนี้ด้วย** (เพิ่ม 2026-08-13 พร้อม mig 0248) — รหัสสินค้า
     ฝังรหัสลูกค้าไว้ในตัวเอง (`FG-AAAA-…`) ⇒ ลบลูกค้าที่ยังมีสินค้าแล้วเลข AR กลับเข้ากอง
     ไปให้รายอื่น รหัสสินค้าเดิมจะชี้ไปหาลูกค้าคนละคนทันทีโดยไม่มีอะไรฟ้อง

     ⭐ 2026-08-16: ยกลิสต์ออกไปเป็นทะเบียนกลาง (`lib/master/customerReferences`)
     เพราะลิสต์ที่เขียนมือในนี้ตรวจแค่ 4 ตาราง ทั้งที่บนฐานจริงมี 25 ตารางถือ `customerId`
     ⇒ ลูกค้าที่มีแค่ลีด/ดีล/ใบเสนอราคา (ต้นทางท่อ = สถานะปกติ) ลบผ่านด่านไปได้
     และเอกสารเหล่านั้นเสียสายเชื่อมถาวร · `npm run check:refs` คอยเทียบทะเบียนกับ
     ฐานจริงไม่ให้ตกหล่นอีก */
  const { refs, error: refErr } = await findEntityReferences(supabase, 'customer', id);
  if (refErr) return Response.json({ error: refErr.message }, { status: 500 });
  const block = referencedBlock('ลูกค้าราย', refs);
  if (block) return Response.json({ error: block }, { status: 409 });

  const { data, error } = await supabase.from('customers').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) {
    return Response.json({ error: 'ไม่พบข้อมูลลูกค้ารายนี้' }, { status: 404 });
  }
  // Cascade: purge attachments (rows + storage/Drive files) so deleting a
  // customer never orphans its documents.
  await purgeAttachments('customer', id);
  // เธรดกลางเป็น polymorphic ไม่มี FK → ต้องกวาดเอง
  await purgeUpdates(supabase, 'customer', id);
  await recordAudit({ user, action: 'delete', entityType: 'customer', entityId: id, before: customer, request });
  // เลขคืนหรือไม่คืนถูกตัดสินที่ trigger ฝั่ง DB ไปแล้ว (mig 0248) — ตรงนี้แค่บอกผลให้ตรง
  // กับที่เกิดขึ้นจริง ผู้ใช้ไม่ได้เป็นคนตั้งรหัสเอง จึงไม่มีทางรู้ว่าเลขนั้นกลับมาหรือหายไป
  const reclaimed = isReusableCode(customer) && isAutoArCode(customer.arCode);
  return Response.json({
    success: true,
    message: reclaimed
      ? `ลบข้อมูลลูกค้าเรียบร้อยแล้ว — รหัส ${customer.arCode} ยังไม่เคยผ่านอนุมัติ เลขนี้กลับไปรอออกให้รายถัดไป`
      : 'ลบข้อมูลลูกค้าเรียบร้อยแล้ว',
  });
}
