import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewRecord, canEditRecord, canDeleteRecord, allowedEditFields } from '@/lib/permissions';
import { purgeAttachments } from '@/lib/master/attachments';
import { registrationDeleteBlock } from '@/lib/deletion';
import { registrationRequirements } from '@/lib/tax/requirements';
import { recordAudit } from '@/lib/audit';
import { productBrandName, productDisplayName } from '@/lib/master/productIdentity';
import { chatCard, sendChat } from '@/lib/chat';
import { normalizeRejectionReason, rejectionReasonError } from '@/lib/master/approval';

export const dynamic = 'force-dynamic';

// GET /api/excise-registrations/[id]
export async function GET(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from('excise_registrations').select('*').eq('id', id).maybeSingle();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });
  if (!canViewRecord(user, 'registrations', data)) {
    return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });
  }
  // canDelete = อำนาจลบราย record คำนวณฝั่ง server (scope 'own' ต้องเทียบ user.id
  // ซึ่ง client ไม่มี) — จอใช้ค่านี้ซ่อนปุ่มลบ ไม่ต้องเดาสิทธิ์ซ้ำแล้วเพี้ยนจาก server
  return Response.json({ ...data, canDelete: canDeleteRecord(user, 'registrations', data) });
}

// PATCH /api/excise-registrations/[id] — LG approves/rejects; SA resubmits.
export async function PATCH(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: reg, error: findErr } = await supabase
    .from('excise_registrations').select('*').eq('id', id).maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!reg) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });

  if (!canEditRecord(user, 'registrations', reg)) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json();

  // Re-approval rule (ทุกระบบ, stricter): an APPROVED registration is LOCKED.
  // The only permitted change is the explicit "ขอแก้ไข" (revise): SA reverts it
  // to 'draft', clearing the approval, which re-enters draft → submit → approve.
  // มติ B2 (2026-07-27): การปลดอนุมัติเป็น **สิทธิ์ของฝ่ายกฎหมาย** + ต้องมีเหตุผล + แจ้งเตือน
  // เดิมใครก็ได้ที่มี products:edit กดปลดได้ฟรี ไม่ต้องบอกเหตุ ไม่มีใครรู้ — ทั้งที่ทะเบียน
  // คือหลักฐานที่ใบยื่นชำระภาษีอ้างถึง (orders.registrationId) และการถอนอนุมัติ SO ซึ่ง
  // เบากว่านี้มากยังต้องเป็นผู้รีวิว + เหตุผล 10–500 + แจ้ง chat
  //
  // เหตุผลเก็บใน metadata.revokeApproval (ไม่ใช่ rejectionReason — คนละความหมาย:
  // rejectionReason = "ผู้อนุมัติตีกลับ" ซึ่งหน้าเว็บแสดงเป็นป้ายตีกลับ) จึงไม่ต้อง migration
  if (reg.status === 'approved') {
    if (body.status === 'draft') {
      if (!can(user?.role, 'legal:approve')) {
        return Response.json({
          error: 'ปลดอนุมัติทะเบียนได้เฉพาะฝ่ายกฎหมาย — ทะเบียนนี้เป็นหลักฐานที่ใบยื่นชำระภาษีอ้างถึง',
        }, { status: 403 });
      }
      const reasonError = rejectionReasonError(body.reason ?? body.revokeReason, { label: 'ที่ปลดอนุมัติ' });
      if (reasonError) return Response.json({ error: reasonError }, { status: 400 });
      const reason = normalizeRejectionReason(body.reason ?? body.revokeReason);
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from('excise_registrations')
        .update({
          status: 'draft',
          approvalNumber: null,
          approvedBy: null,
          approvedByName: null,
          approvedAt: null,
          rejectionReason: null,
          metadata: {
            ...(reg.metadata || {}),
            revokeApproval: { reason, by: user?.id ?? null, byName: user?.name ?? null, at: now },
          },
          updatedAt: now,
        })
        .eq('id', id)
        .select()
        .single();
      if (error) return Response.json({ error: error.message }, { status: 500 });
      await recordAudit({
        user, action: 'update', entityType: 'registration', entityId: id, before: reg, after: data,
        summary: `ปลดอนุมัติทะเบียน ${reg.fgCode || id} (อนุมัติแล้ว → ร่าง): ${reason}`, request,
      });
      // ปลดอนุมัติ = SO ที่รอออกใบยื่นหลุดจากตัวเลือกทันที ฝ่ายขายต้องรู้
      sendChat('sales', chatCard({
        title: '⚠️ ทะเบียนสรรพสามิตถูกปลดอนุมัติ',
        subtitle: `${data.fgCode || id} · ${data.customerName || ''}`.trim(),
        rows: [
          { label: 'สินค้า', value: data.productName || data.fgCode },
          { label: 'เหตุผล', value: reason },
          { label: 'ผู้ปลดอนุมัติ', value: user?.name },
          { label: 'ผลที่ตามมา', value: 'Sale Order ที่ใช้สินค้านี้จะออกใบยื่นชำระภาษีไม่ได้จนกว่าจะขึ้นทะเบียนใหม่' },
        ],
        linkPath: `/tax/registrations/${id}`,
        linkLabel: 'เปิดทะเบียน',
      }));
      return Response.json(data);
    }
    return Response.json({ error: 'ทะเบียนนี้อนุมัติแล้ว ถูกล็อก กรุณาให้ฝ่ายกฎหมายปลดอนุมัติก่อน' }, { status: 403 });
  }

  // SA owns the link fields; LG owns the approval/tax fields (allowedEditFields).
  const salesEditable = ['assignee', 'metadata', 'productId', 'customerId'];
  const allowed = allowedEditFields(user, 'registrations', salesEditable);

  const updated = { ...reg };
  for (const k of allowed) if (body[k] !== undefined) updated[k] = body[k];

  // If SA re-points the registration to a different FG, the customer and the
  // denormalized snapshot must follow the FG's master owner — never the
  // client-supplied customerId (FG ↔ customer is fixed by products.customerId).
  if (allowed.has('productId') && body.productId !== undefined && body.productId !== reg.productId) {
    const { data: product, error: prodErr } = await supabase
      .from('products').select('*').eq('id', body.productId).maybeSingle();
    if (prodErr) return Response.json({ error: prodErr.message }, { status: 500 });
    if (!product) return Response.json({ error: 'ไม่พบสินค้าที่เลือก' }, { status: 404 });

    const customerId = product.customerId || (allowed.has('customerId') ? body.customerId : null) || reg.customerId;
    const { data: customer } = await supabase
      .from('customers').select('*').eq('id', customerId).maybeSingle();
    if (!customer) return Response.json({ error: 'FG นี้ยังไม่มีลูกค้าเจ้าของ กรุณากำหนดลูกค้าให้สินค้าในฐานข้อมูลก่อน' }, { status: 400 });

    updated.productId = product.id;
    updated.customerId = customer.id;
    updated.fgCode = product.fgCode;
    updated.productName = productDisplayName(product);
    updated.brandName = productBrandName(product);
    updated.customerName = customer.name;
    updated.taxId = customer.taxId;
    // Keep the both-language snapshot in metadata in sync with the newly selected
    // FG so the registrations list search stays bilingual after a product swap.
    updated.metadata = {
      ...(updated.metadata || {}),
      productNameTh: product.productDescription || null,
      productNameEn: product.productDescriptionEn || null,
      brandNameTh: product.brandName || null,
      brandNameEn: product.brandNameEn || null,
    };
  } else {
    // FG unchanged → never let customerId drift away from the FG's owner.
    updated.customerId = reg.customerId;
  }

  // Approval / rejection audit trail (driven by the status transition).
  if (allowed.has('status') && body.status !== undefined && body.status !== reg.status) {
    if (body.status === 'approved') {
      updated.approvedBy = user?.id ?? null;
      updated.approvedByName = user?.name ?? null;
      updated.approvedAt = new Date().toISOString();
      updated.rejectionReason = null;
    } else if (body.status === 'rejected') {
      if (!body.rejectionReason || !String(body.rejectionReason).trim()) {
        return Response.json({ error: 'กรุณาระบุเหตุผลที่ตีกลับ' }, { status: 400 });
      }
    }
  }

  // Submit for approval: SA (products:edit, no legal:approve) moves a draft (first
  // submit) or a rejected (resubmit) registration into the LG queue. Hard-blocked
  // until the required docs are present: ฉลาก/Artwork on the registration, AND the
  // company map (address_map) on the CUSTOMER record (shared master data — the map
  // is attached once to the customer, never duplicated per registration).
  if (body.status === 'pending_legal' && (reg.status === 'draft' || reg.status === 'rejected') && can(user?.role, 'products:edit')) {
    const { ready, missing } = await registrationRequirements(supabase, id);
    if (!ready) {
      return Response.json(
        { error: `กรุณาแนบเอกสารให้ครบก่อนยื่น: ${missing.map((m) => m.label).join(', ')}` },
        { status: 400 },
      );
    }
    updated.status = 'pending_legal';
    updated.rejectionReason = null;
  }

  // Recompute the tax snapshot **เฉพาะเมื่อ LG ส่งคำสั่ง taxableOverride มาจริง**
  //
  // 🐞 เดิมเงื่อนไขเป็น `allowed.has('taxableOverride')` = "ผู้ใช้มีสิทธิ์แก้ช่องนี้"
  // ไม่ใช่ "ผู้ใช้สั่งแก้ช่องนี้" — และ taxableOverride อยู่ใน LEGAL_REGISTRATION_FIELDS
  // แปลว่า**ทุกครั้งที่ฝ่ายกฎหมายแตะทะเบียน** (อนุมัติ / ตีกลับ / ใส่เลขอนุมัติ) อัตราภาษี
  // จะถูกคิดใหม่จากราคา ณ วินาทีนั้นแล้วเขียนทับค่าเดิมเงียบ ๆ โดยไม่มีใครสั่ง
  //
  // และเดิมคิดสูตรเอง (`retailPriceIncVat / 1.07 * 0.08`) ซึ่งเป็น **สำเนาที่สอง** ของสูตร
  // ที่ products PATCH ใช้ (`retailPriceExVat * 0.08`) — คนละฐานราคา เพี้ยนกันได้ทันทีที่
  // สองคอลัมน์ราคาไม่ตรงกันเป๊ะ · ตอนนี้อ่าน `product.exciseTax/localTax` ตรง ๆ เหมือนที่
  // POST ทำอยู่แล้ว = อัตราภาษีมีแหล่งเดียวคือทะเบียนสินค้า ซึ่งคิดจากราคาขายปลีกของ FG
  // (มติผู้ใช้ 2026-07-29 — ราคาใน SO เป็นราคาผลิต ใช้คิดภาษีไม่ได้)
  if (body.taxableOverride !== undefined) {
    const { data: product, error: prodErr } = await supabase
      .from('products').select('isExciseTaxable, exciseTax, localTax').eq('id', reg.productId).maybeSingle();
    if (prodErr) return Response.json({ error: prodErr.message }, { status: 500 });
    const ovr = updated.taxableOverride;
    const autoTaxable = product ? product.isExciseTaxable !== false : reg.isExciseTaxable !== false;
    const isExciseTaxable = typeof ovr === 'boolean' ? ovr : autoTaxable;
    updated.isExciseTaxable = isExciseTaxable;
    if (!isExciseTaxable) {
      updated.exciseTax = 0;
      updated.localTax = 0;
    } else if (product) {
      updated.exciseTax = product.exciseTax || 0;
      updated.localTax = product.localTax || 0;
    }
  }

  updated.updatedAt = new Date().toISOString();

  const { data, error } = await supabase
    .from('excise_registrations').update(updated).eq('id', id).select().single();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const summary = data.status !== reg.status
    ? `เปลี่ยนสถานะทะเบียน ${reg.fgCode || id}: ${reg.status} → ${data.status}` : null;
  await recordAudit({ user, action: 'update', entityType: 'registration', entityId: id, before: reg, after: data, summary, request });

  // แจ้งข้ามเลน SA ↔ LG — ทั้งสองทางเคยเงียบสนิท (ไม่มี sendChat ในไฟล์นี้เลย) แปลว่า
  // ฝ่ายกฎหมายไม่รู้ว่ามีทะเบียนรออนุมัติ และฝ่ายขายไม่รู้ผลจนกว่าจะเปิดหน้าเช็คเอง
  if (data.status !== reg.status) {
    const subtitle = `${data.fgCode || id} · ${data.customerName || ''}`.trim();
    if (data.status === 'pending_legal') {
      sendChat('legal', chatCard({
        title: '🏷️ ทะเบียนสรรพสามิตรออนุมัติ',
        subtitle,
        rows: [
          { label: 'สินค้า', value: data.productName || data.fgCode },
          { label: 'ลูกค้า', value: data.customerName },
          { label: 'ผู้ยื่น', value: user?.name },
        ],
        linkPath: '/tax/registrations?status=pending_legal',
        linkLabel: 'ตรวจ/อนุมัติ',
      }));
    } else if (data.status === 'approved' || data.status === 'rejected') {
      const approvedNow = data.status === 'approved';
      sendChat('sales', chatCard({
        title: approvedNow ? '✅ ขึ้นทะเบียนสรรพสามิตแล้ว' : '↩️ ทะเบียนสรรพสามิตถูกตีกลับ',
        subtitle,
        rows: [
          { label: 'สินค้า', value: data.productName || data.fgCode },
          { label: 'ลูกค้า', value: data.customerName },
          { label: approvedNow ? 'ผู้อนุมัติ' : 'ผู้ตีกลับ', value: user?.name },
          { label: 'เหตุผล', value: approvedNow ? null : data.rejectionReason },
          {
            label: 'ขั้นถัดไป',
            value: approvedNow
              ? 'ออกใบยื่นชำระภาษีจาก Sale Order ที่อนุมัติแล้วได้'
              : 'แก้ไขตามเหตุผลแล้วยื่นขึ้นทะเบียนอีกครั้ง',
          },
        ],
        linkPath: `/tax/registrations/${id}`,
        linkLabel: 'เปิดทะเบียน',
      }));
    }
  }
  return Response.json(data);
}

// DELETE /api/excise-registrations/[id] — superuser / senior_ae (team) / ae (own),
// and only while the registration is a draft with no order-line references (Phase 2
// deletion policy). Submitted/approved registrations must be revised to draft first.
// Cascades attachment cleanup so a deleted draft never orphans documents/files.
export async function DELETE(request, { params }) {
  const { id } = await params;
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();

  const { data: reg, error: findErr } = await supabase
    .from('excise_registrations').select('*').eq('id', id).maybeSingle();
  if (findErr) return Response.json({ error: findErr.message }, { status: 500 });
  if (!reg) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });

  // Authority lives entirely in deleteScope: superuser (all) / senior_ae (team) /
  // ae (own). Deliberately NOT canEditRecord — that would let legal + ac delete.
  if (!canDeleteRecord(user, 'registrations', reg)) {
    return Response.json({
      error: 'ลบทะเบียนนี้ไม่ได้ — ลบได้เฉพาะทีมเจ้าของทะเบียน (ฝ่ายขาย) หรือหัวหน้าฝ่ายขาย/แอดมิน',
    }, { status: 403 });
  }

  // Deletion policy (Phase 2): a registration is a workflow record — hard delete
  // only while it's still a draft AND not referenced by any order line. Anything
  // submitted/approved must be reverted to draft ("ขอแก้ไข") first.
  const { count: orderItemCount, error: cntErr } = await supabase
    .from('order_items').select('orderId', { count: 'exact', head: true }).eq('registrationId', id);
  if (cntErr) return Response.json({ error: cntErr.message }, { status: 500 });
  const block = registrationDeleteBlock(reg, { orderItemCount: orderItemCount || 0 });
  if (block) return Response.json({ error: block }, { status: 409 });

  const { data, error } = await supabase
    .from('excise_registrations').delete().eq('id', id).select('id');
  if (error) return Response.json({ error: error.message }, { status: 500 });
  if (!data || data.length === 0) return Response.json({ error: 'ไม่พบทะเบียนนี้' }, { status: 404 });

  // Cascade: purge this registration's attachments (rows + storage/Drive files)
  // so deleting a draft never orphans documents or storage.
  await purgeAttachments('registration', id);
  await recordAudit({
    user, action: 'delete', entityType: 'registration', entityId: id, before: reg,
    summary: `ลบทะเบียน ${reg.fgCode || id} (${reg.customerName || ''})`.trim(), request,
  });
  return Response.json({ success: true, message: 'ลบทะเบียนเรียบร้อยแล้ว' });
}
