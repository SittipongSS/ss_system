import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canViewRecord, canEditRecord, canDeleteRecord, canApproveMasterData, isSuperuser } from '@/lib/permissions';
import { resetApprovalOnEdit } from '@/lib/master/approval';
import { normalizeBrands } from '@/lib/master/brands';
import { listForCustomer } from '@/lib/excise/registrations';
import { ORDER_SELECT, attachRegistrations } from '@/lib/tax/orders';
import { referencedBlock } from '@/lib/deletion';
import { purgeAttachments } from '@/lib/master/attachments';
import { recordAudit } from '@/lib/audit';
import { chatCard, sendChat } from '@/lib/chat';

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
  const products = catalog.map((p) => {
    const r = regByProduct.get(p.id);
    return {
      ...p,
      registrationId: r?.id ?? null,
      fgCode: r?.fgCode ?? p.fgCode,
      productDescription: r?.productName ?? p.productDescription,
      brandName: r?.brandName ?? p.brandName,
      status: r?.status ?? p.approvalStatus,
      isExciseTaxable: r ? r.isExciseTaxable : p.isExciseTaxable,
      exciseTax: r ? r.exciseTax : p.exciseTax,
      localTax: r ? r.localTax : p.localTax,
    };
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
  // Setting approvalStatus is reserved for Senior AE+ — AE/AC hold customers:edit
  // but must not approve. Row-level team scope is already enforced above by
  // canEditRecord (senior_ae = own team, supervisor/admin = all teams).
  if (body.approvalStatus !== undefined) {
    if (!canApproveMasterData(user?.role)) {
      return Response.json({ error: 'forbidden' }, { status: 403 });
    }
    if (!['approved', 'rejected', 'pending'].includes(body.approvalStatus)) {
      return Response.json({ error: 'สถานะการอนุมัติไม่ถูกต้อง' }, { status: 400 });
    }
    const approved = body.approvalStatus === 'approved';
    const approvalUpdates = {
      approvalStatus: body.approvalStatus,
      approvedBy: user?.id ?? null,
      approvedByName: user?.name ?? null,
      approvedAt: new Date().toISOString(),
      rejectionReason: body.approvalStatus === 'rejected' ? (body.rejectionReason || null) : null,
      updatedAt: new Date().toISOString(),
    };
    void approved;
    const { data: decided, error: decErr } = await supabase
      .from('customers').update(approvalUpdates).eq('id', id).select().single();
    if (decErr) return Response.json({ error: decErr.message }, { status: 500 });
    await recordAudit({
      user, action: 'update', entityType: 'customer', entityId: id,
      before: customer, after: decided,
      summary: `${body.approvalStatus === 'approved' ? 'อนุมัติ' : body.approvalStatus === 'rejected' ? 'ปฏิเสธ' : 'รีเซ็ตสถานะ'}ลูกค้า ${decided.name || id}`,
      request,
    });
    // แจ้งทีมขายเมื่อมีคำตัดสิน (reset เป็น pending = งานภายใน ไม่ต้องแจ้ง)
    if (body.approvalStatus !== 'pending') {
      const approvedNow = body.approvalStatus === 'approved';
      sendChat('sales', chatCard({
        title: approvedNow ? '✅ ลูกค้าได้รับอนุมัติ' : '⛔ ลูกค้าถูกปฏิเสธ',
        subtitle: decided.name,
        rows: [
          { label: 'รหัสลูกค้า (AR)', value: decided.arCode },
          { label: approvedNow ? 'ผู้อนุมัติ' : 'ผู้ปฏิเสธ', value: user?.name },
          { label: 'เหตุผล', value: decided.rejectionReason },
        ],
        linkPath: '/database/customers',
      }));
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

  if (body.arCode && body.arCode !== customer.arCode) {
    const { data: dup } = await supabase
      .from('customers')
      .select('id')
      .eq('arCode', body.arCode)
      .maybeSingle();
    if (dup) return Response.json({ error: 'รหัสลูกค้านี้มีในระบบแล้ว' }, { status: 409 });
  }

  const oldName = customer.name;
  const oldTaxId = customer.taxId;

  const updates = {};
  // 'team'/'ownerId' allow transferring a customer to another team (gated above
  // by canEditRecord — supervisor cross-team, team roles within their scope).
  for (const k of [
    'arCode', 'name', 'taxId', 'customerType', 'branchCode', 'phone', 'address', 'shippingAddress', 'brands',  // mapFileUrl ย้ายไป attachments แล้ว
    'contactPerson', 'contactPhone', 'email', 'creditTerms', 'metadata',  // master-data fields (0005, 0025)
    'team', 'ownerId',
    'isActive',  // lifecycle flag (0030) — พักใช้/เปิดใช้ลูกค้า; edit-level gate (canEditRecord above)
  ]) {
    if (body[k] !== undefined) {
      updates[k] = (k === 'taxId' && body[k] === '') ? null : body[k];
    }
  }
  // brands (0059): normalize to [{th,en}] — accepts legacy string[] too.
  if (body.brands !== undefined) updates.brands = normalizeBrands(body.brands);
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
  updates.updatedAt = new Date().toISOString();

  // Re-approval rule (ทุกระบบ): editing an APPROVED customer drops it back to
  // 'pending' so a Senior AE+ must re-approve. Hidden from downstream pickers
  // (GET returns approved-only) until then. No-op if it wasn't approved.
  const reapproval = resetApprovalOnEdit(customer, user);
  if (reapproval) Object.assign(updates, reapproval);

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

  // Cascade name/taxId changes to this customer's excise registrations
  // (they snapshot the customer for display/history).
  const cascade = { customerName: updated.name, taxId: updated.taxId };
  await supabase.from('excise_registrations').update(cascade).eq('customerId', id);
  void oldName; void oldTaxId;

  await recordAudit({ user, action: 'update', entityType: 'customer', entityId: id, before: customer, after: updated, request });
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

  // ข้อ 3: guard ก่อนลบ — กันไม่ให้เกิด record กำพร้า (live DB ไม่มี FK constraint จริง).
  // ถ้าลูกค้ารายนี้ยังถูกอ้างใน โครงการ/ออเดอร์/การขึ้นทะเบียน → ห้ามลบ.
  const [projRef, orderRef, regRef] = await Promise.all([
    supabase.from('projects').select('id').eq('customerId', id),
    supabase.from('orders').select('id').eq('customerId', id),
    supabase.from('excise_registrations').select('id', { count: 'exact', head: true }).eq('customerId', id),
  ]);
  const refErr = projRef.error || orderRef.error || regRef.error;
  if (refErr) return Response.json({ error: refErr.message }, { status: 500 });
  const refs = [];
  const projIds = (projRef.data || []).map((r) => r.id);
  const orderIds = (orderRef.data || []).map((r) => r.id);
  if (projIds.length) refs.push(`${projIds.length} โครงการ (${projIds.join(', ')})`);
  if (orderIds.length) refs.push(`${orderIds.length} ออเดอร์ (${orderIds.join(', ')})`);
  if (regRef.count) refs.push(`${regRef.count} การขึ้นทะเบียน`);
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
  await recordAudit({ user, action: 'delete', entityType: 'customer', entityId: id, before: customer, request });
  return Response.json({ success: true, message: 'ลบข้อมูลลูกค้าเรียบร้อยแล้ว' });
}
