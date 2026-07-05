import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord, canEditRecord, canDeleteRecord, canApproveMasterData, redactProductMargin, isSuperuser } from '@/lib/permissions';
import { resetApprovalOnEdit } from '@/lib/master/approval';
import { categoryOf, isExciseCategory } from '@/lib/master/productTypes';
import { referencedBlock } from '@/lib/deletion';
import { purgeAttachments } from '@/lib/master/attachments';
import { recordAudit } from '@/lib/audit';
import { recordProductPriceHistory } from '@/lib/master/priceHistory';

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
  // Strip the confidential cost breakdown/profit for non-margin roles.
  return Response.json({ ...redactProductMargin(user, data), customerType });
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

  // Row-level scope: own-team (sa roles) / own record (ae) / all (supervisor,
  // legal approval). The proxy already verified the coarse capability.
  if (!canEditRecord(user, 'products', product)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // ── Approval action (approve / reject a pending product) ─────────────
  // Setting approvalStatus is reserved for Senior AE+ — AE/AC hold products:edit
  // but must not approve. Row-level team scope is already enforced above by
  // canEditRecord (senior_ae = own team, supervisor/admin = all teams).
  if (body.approvalStatus !== undefined) {
    if (!canApproveMasterData(user?.role)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    if (!['approved', 'rejected', 'pending'].includes(body.approvalStatus)) {
      return Response.json({ error: 'สถานะการอนุมัติไม่ถูกต้อง' }, { status: 400 });
    }
    const approvalUpdates = {
      approvalStatus: body.approvalStatus,
      approvedBy: user?.id ?? null,
      approvedByName: user?.name ?? null,
      approvedAt: new Date().toISOString(),
      rejectionReason: body.approvalStatus === 'rejected' ? (body.rejectionReason || null) : null,
      updatedAt: new Date().toISOString(),
    };
    const { data: decided, error: decErr } = await supabase
      .from('products').update(approvalUpdates).eq('id', id).select().single();
    if (decErr) return Response.json({ error: decErr.message }, { status: 500 });
    await recordAudit({
      user, action: 'update', entityType: 'product', entityId: id,
      before: product, after: decided,
      summary: `${body.approvalStatus === 'approved' ? 'อนุมัติ' : body.approvalStatus === 'rejected' ? 'ปฏิเสธ' : 'รีเซ็ตสถานะ'}สินค้า ${decided.productDescriptionEn || decided.productDescription || id}`,
      request,
    });
    return Response.json(decided);
  }

  // เปลี่ยนสถานะพัก/เปิดใช้ (isActive) สงวนสิทธิ์เฉพาะ admin / ae_supervisor —
  // SA (senior_ae/ac/ae) แก้สเปค/ราคาได้ปกติแต่ห้ามพักใช้สินค้าเอง (ต้องขอผู้บริหาร).
  if (body.isActive !== undefined && !isSuperuser(user?.role)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  // Duplicate FG Code check (if changing)
  if (body.fgCode && body.fgCode !== product.fgCode) {
    const { data: dup } = await supabase
      .from('products')
      .select('id')
      .eq('fgCode', body.fgCode)
      .maybeSingle();
    if (dup) {
      return Response.json({ error: 'รหัสสินค้า (FG Code) นี้ถูกขึ้นทะเบียนในระบบแล้ว' }, { status: 409 });
    }
  }

  // Master catalog edit — catalog/spec fields. Customer ownership is now editable
  // here too (was previously only changeable via the excise registration step);
  // excise APPROVAL still lives on the registration.
  const catalogEditable = [
    'fgCode', 'productDescription', 'productDescriptionEn', 'brandName', 'brandNameEn',
    'volume', 'volumeUnit', 'costPrice', 'retailPriceIncVat', 'assignee',
    'categoryCode', 'metadata',
    'isActive', // lifecycle flag (0036) — พัก/เลิกใช้สินค้า
  ];
  const updated = { ...product };
  for (const k of catalogEditable) if (body[k] !== undefined) updated[k] = body[k];

  // Re-point the FG owner (customerId) from master. Keep the denormalized
  // customerName snapshot in sync and reject an unknown customer. NOTE: existing
  // excise registrations carry their own point-in-time customer snapshot and are
  // not retro-updated here.
  if (body.customerId !== undefined && body.customerId !== product.customerId) {
    const { data: cust } = await supabase
      .from('customers').select('*').eq('id', body.customerId).maybeSingle();
    if (!cust) return Response.json({ error: 'ไม่พบลูกค้าที่เลือก' }, { status: 404 });
    updated.customerId = cust.id;
    updated.customerName = cust.name;
  }

  // Re-derive categoryCode from fgCode when fgCode changed and it wasn't given.
  // Also backfills legacy rows saved before categoryCode existed (migration 0006).
  if (body.categoryCode === undefined && (body.fgCode !== undefined || !updated.categoryCode)) {
    updated.categoryCode = categoryOf(updated.fgCode) || updated.categoryCode || null;
  }

  // Taxability is intrinsic to the category (auto rule), not re-parsed from
  // fgCode — that caused the category and taxability flag to disagree when
  // they drifted out of sync. LG override now lives on the registration, not
  // the master product.
  const isExciseTaxable = isExciseCategory(updated.categoryCode);
  updated.isExciseTaxable = isExciseTaxable;
  updated.retailPriceExVat = isExciseTaxable ? updated.retailPriceIncVat / 1.07 : 0;
  updated.exciseTax = isExciseTaxable ? updated.retailPriceExVat * 0.08 : 0;
  updated.localTax = isExciseTaxable ? updated.exciseTax * 0.1 : 0;

  const factoryPrice = updated.costPrice;
  updated.laborCost = updated.volume >= 30 ? 5 : 2;
  updated.shippingCost = 1;
  updated.materialCost = factoryPrice * 0.65;
  updated.factoryProfit = factoryPrice - updated.materialCost - updated.laborCost - updated.shippingCost;

  updated.updatedAt = new Date().toISOString();

  // Re-approval rule (ทุกระบบ): editing an APPROVED product drops it back to
  // 'pending' so a Senior AE+ must re-approve. No-op if it wasn't approved.
  const reapproval = resetApprovalOnEdit(product, user);
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

  // ข้อ 3: guard ก่อนลบ — กันไม่ให้เกิด record กำพร้า (live DB ไม่มี FK constraint จริง).
  // ถ้าสินค้านี้ยังถูกอ้างใน โปรเจกต์/รายการออเดอร์/การขึ้นทะเบียน → ห้ามลบ.
  const [ppRef, itemRef, regRef] = await Promise.all([
    supabase.from('project_products').select('projectId').eq('productId', id),
    supabase.from('order_items').select('orderId').eq('productId', id),
    supabase.from('excise_registrations').select('id').eq('productId', id),
  ]);
  const refErr = ppRef.error || itemRef.error || regRef.error;
  if (refErr) return Response.json({ error: refErr.message }, { status: 500 });
  const refs = [];
  const projIds = [...new Set((ppRef.data || []).map((r) => r.projectId))];
  const orderIds = [...new Set((itemRef.data || []).map((r) => r.orderId))];
  if (projIds.length) refs.push(`${projIds.length} โปรเจกต์ (${projIds.join(', ')})`);
  if (orderIds.length) refs.push(`${orderIds.length} ออเดอร์ (${orderIds.join(', ')})`);
  if (regRef.data?.length) refs.push(`${regRef.data.length} การขึ้นทะเบียน`);
  const block = referencedBlock('สินค้า', refs);
  if (block) return Response.json({ error: block }, { status: 409 });

  const { data, error } = await supabase.from('products').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบสินค้าชิ้นนี้' }, { status: 404 });
  // Cascade: purge attachments (rows + storage/Drive files) so deleting a
  // product never orphans its documents.
  await purgeAttachments('product', id);
  await recordAudit({ user, action: 'delete', entityType: 'product', entityId: id, before: product, request });
  return Response.json({ success: true, message: 'ลบสินค้าเรียบร้อยแล้ว' });
}
