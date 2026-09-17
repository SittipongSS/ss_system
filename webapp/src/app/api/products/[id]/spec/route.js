/* ── ใบสเปคสินค้า FM-SA-04 — เส้นของ "ใบ" (mig 0364) ─────────────────────────
 *
 * ⭐ **บ้านของใบคือสินค้า ไม่ใช่ใบสั่งขาย** (มติผู้ใช้ 2026-09-17) — หนึ่งสินค้า
 * หนึ่งใบตลอดอายุ · เนื้อสเปกอยู่ที่ "ฉบับ" (Rev.) ส่วนการออกกระดาษตาม SO อยู่ที่
 * เส้น `/api/sales-planning/sales-orders/[id]/spec-issues`
 *
 * ⚠️ ด่านสิทธิ์ของ proxy สำหรับเส้นนี้เป็น `salesplan:edit` **ไม่ใช่ `products:edit`**
 * — ใบสเปคเป็นเอกสารของฝ่ายขาย ไม่ใช่การแก้ทะเบียนสินค้า (กฎ module-ownership) ·
 * ปล่อยให้ตกกฎ `/api/products` ตัวรวมเมื่อไร RA ที่ถือ `ra:approve` จะ PATCH ใบนี้ได้ด้วย
 */
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { canViewRecord } from '@/lib/permissions';
import { productSpecScopeReason } from '@/lib/sales/productSpecScope';
import {
  productSpecApproveBlock, productSpecEditBlock, productSpecNewRevisionBlock,
  productSpecReviewBlock, productSpecSubmitBlock,
} from '@/lib/sales/productSpecWorkflow';
import {
  SPEC_CONTENT_FIELDS, createSpecRevision, latestRevisionOf, loadProductSpec,
  syncProductSpecMirror,
} from '@/lib/sales/productSpecStore';

export const dynamic = 'force-dynamic';

const MAX_EXTRA_ITEMS = 20;

async function loadProduct(supabase, id, user) {
  const { data, error } = await supabase
    .from('products')
    .select('id, fgCode, categoryCode, productDescription, brandName, customerName, team, ownerId')
    .eq('id', id)
    .maybeSingle();
  if (error) return { error: error.message };
  // ไม่พบ = 404 เหมือนสินค้านอกทีม (ไม่บอกว่ามีอยู่)
  if (!data || !canViewRecord(user, 'products', data)) return { missing: true };
  return { product: data };
}

/* ── GET: ใบของสินค้าตัวนี้ ───────────────────────────────────────────── */
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const loaded = await loadProduct(supabase, id, user);
  if (loaded.error) return fail(loaded.error, 500);
  if (loaded.missing) return notFound('ไม่พบสินค้าชิ้นนี้');

  const result = await loadProductSpec(supabase, id);
  if (result.error) return fail(`อ่านใบสเปคไม่สำเร็จ: ${result.error}`, 500);
  return ok({
    product: loaded.product,
    scopeReason: productSpecScopeReason(loaded.product),
    ...result,
  });
});

/* ── POST: สร้างใบ + ฉบับ Rev.01 ──────────────────────────────────────── */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const loaded = await loadProduct(supabase, id, user);
  if (loaded.error) return fail(loaded.error, 500);
  if (loaded.missing) return notFound('ไม่พบสินค้าชิ้นนี้');

  const scopeReason = productSpecScopeReason(loaded.product);
  if (scopeReason) return badRequest(scopeReason);

  const existing = await loadProductSpec(supabase, id);
  if (existing.error) return fail(existing.error, 500);
  // 🔴 หนึ่งสินค้าหนึ่งใบ — ฐานมี unique index กันอยู่ แต่ตอบเป็นข้อความไทยตรงนี้ก่อน
  if (existing.spec) return badRequest('สินค้าชิ้นนี้มีใบสเปคอยู่แล้ว');

  const specId = genId('PSP');
  const { error } = await supabase.from('product_specs').insert({
    id: specId,
    productId: id,
    currentRevNo: 0,
    createdBy: user.id || null,
    createdByName: user.name || null,
  });
  if (error) return fail(`สร้างใบสเปคไม่สำเร็จ: ${error.message}`, 500);

  const body = await req.json().catch(() => ({}));
  const created = await createSpecRevision(supabase, {
    specId, revNo: 1, content: body?.content || {}, user,
  });
  if (created.error) return fail(`สร้างฉบับแรกไม่สำเร็จ: ${created.error}`, 500);

  await recordAudit({
    user, action: 'create', entityType: 'product_spec', entityId: specId,
    before: null, after: { productId: id, revNo: 1 },
    summary: `create FM-SA-04 for ${loaded.product.fgCode}`, request: req,
  });
  const result = await loadProductSpec(supabase, id);
  return ok(result, 201);
});

/* ── PATCH: การกระทำต่อฉบับ ───────────────────────────────────────────── */
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const loaded = await loadProduct(supabase, id, user);
  if (loaded.error) return fail(loaded.error, 500);
  if (loaded.missing) return notFound('ไม่พบสินค้าชิ้นนี้');

  const body = await req.json().catch(() => ({}));
  const action = String(body.action || '').trim();
  const role = user.role;

  const before = await loadProductSpec(supabase, id);
  if (before.error) return fail(before.error, 500);
  if (!before.spec) return badRequest('สินค้าชิ้นนี้ยังไม่มีใบสเปค');
  const latest = latestRevisionOf(before.revisions);
  const now = new Date().toISOString();

  /* ⚠️ ทุก action ถามด่านจาก `productSpecWorkflow` ตัวเดียวกับที่จอใช้ —
     คิดเงื่อนไขซ้ำที่นี่เมื่อไร จอกับ API จะยอมคนละอย่าง */
  if (action === 'new-revision') {
    const blocked = productSpecNewRevisionBlock(before.spec, latest, { role });
    if (blocked) return badRequest(blocked);
    const created = await createSpecRevision(supabase, {
      specId: before.spec.id,
      revNo: (latest?.revNo || 0) + 1,
      previousItems: latest?.items || [],
      content: SPEC_CONTENT_FIELDS.reduce((acc, field) => {
        if (latest?.[field] !== undefined) acc[field] = latest[field];
        return acc;
      }, {}),
      user,
    });
    if (created.error) return fail(`ออกฉบับใหม่ไม่สำเร็จ: ${created.error}`, 500);
    await recordAudit({
      user, action: 'update', entityType: 'product_spec', entityId: before.spec.id,
      before: { revNo: latest?.revNo || 0 }, after: { revNo: created.revision.revNo },
      summary: `open FM-SA-04 Rev.${created.revision.revNo}`, request: req,
    });
    return ok(await loadProductSpec(supabase, id), 201);
  }

  if (action === 'save') {
    const blocked = productSpecEditBlock(latest, { role });
    if (blocked) return badRequest(blocked);
    const patch = { updatedAt: now };
    for (const field of SPEC_CONTENT_FIELDS) {
      if (field in body) {
        const raw = body[field];
        patch[field] = raw === null || String(raw).trim() === '' ? null : String(raw).trim();
      }
    }
    if ('certifications' in body) {
      if (!Array.isArray(body.certifications)) return badRequest('รูปแบบรายการเอกสารไม่ถูกต้อง');
      patch.certifications = body.certifications;
    }
    if ('illustrations' in body) {
      if (!Array.isArray(body.illustrations)) return badRequest('รูปแบบรายการภาพประกอบไม่ถูกต้อง');
      patch.illustrations = body.illustrations;
    }
    const { error } = await supabase.from('product_spec_revisions')
      .update(patch).eq('id', latest.id).eq('status', latest.status);
    if (error) return fail(`บันทึกใบสเปคไม่สำเร็จ: ${error.message}`, 500);

    if (Array.isArray(body.items)) {
      const saved = await saveChecklist(supabase, latest.id, body.items);
      if (saved.error) return badRequest(saved.error);
    }
    return ok(await loadProductSpec(supabase, id));
  }

  if (action === 'submit') {
    const blocked = productSpecSubmitBlock(latest, { role });
    if (blocked) return badRequest(blocked);
    const { error } = await supabase.from('product_spec_revisions').update({
      status: 'pending_ae',
      submittedAt: now, submittedBy: user.id || null, submittedByName: user.name || null,
      // ส่งใหม่หลังถูกตีกลับ = ล้างรอยตีกลับ ไม่ให้ค้างบนใบที่กำลังเดินต่อ
      rejectedAt: null, rejectedBy: null, rejectedByName: null, rejectionReason: null,
      updatedAt: now,
    }).eq('id', latest.id).eq('status', latest.status);
    if (error) return fail(`ส่งใบสเปคไม่สำเร็จ: ${error.message}`, 500);
    return ok(await loadProductSpec(supabase, id));
  }

  if (action === 'review') {
    const blocked = productSpecReviewBlock(latest, { role });
    if (blocked) return badRequest(blocked);
    const { error } = await supabase.from('product_spec_revisions').update({
      status: 'pending_ae_supervisor',
      reviewedAt: now, reviewedBy: user.id || null, reviewedByName: user.name || null,
      updatedAt: now,
    }).eq('id', latest.id).eq('status', latest.status);
    if (error) return fail(`ส่งต่อหัวหน้าไม่สำเร็จ: ${error.message}`, 500);
    return ok(await loadProductSpec(supabase, id));
  }

  if (action === 'approve') {
    const blocked = productSpecApproveBlock(latest, { role });
    if (blocked) return badRequest(blocked);
    const { error } = await supabase.from('product_spec_revisions').update({
      status: 'approved',
      approvedAt: now, approvedBy: user.id || null, approvedByName: user.name || null,
      updatedAt: now,
    }).eq('id', latest.id).eq('status', latest.status);
    if (error) return fail(`อนุมัติใบสเปคไม่สำเร็จ: ${error.message}`, 500);

    /* ฉบับก่อนกลายเป็น `superseded` — อ่านได้ แก้ไม่ได้ (ไม่ใช่ยกเลิก ซึ่งมีความหมาย
       ทางธุรกิจคนละอย่าง · กติกาเดียวกับ Rev. ของสัญญา mig 0280) */
    const supersede = await supabase.from('product_spec_revisions')
      .update({ status: 'superseded', supersededAt: now, updatedAt: now })
      .eq('specId', before.spec.id).eq('status', 'approved').neq('id', latest.id);
    if (supersede.error) return fail(`ปิดฉบับก่อนไม่สำเร็จ: ${supersede.error.message}`, 500);

    const bumped = await supabase.from('product_specs')
      .update({ currentRevNo: latest.revNo, updatedAt: now }).eq('id', before.spec.id);
    if (bumped.error) return fail(`อัปเดตเลขฉบับปัจจุบันไม่สำเร็จ: ${bumped.error.message}`, 500);

    /* ใบที่ออกไว้ตอนฉบับยังเป็นร่าง (สถานะ `pending`) กลายเป็นฉบับจริงพร้อมกัน —
       กระดาษพวกนั้นอ้าง revisionId นี้อยู่แล้ว ⇒ ปล่อยค้างไว้เท่ากับมีกระดาษที่
       อนุมัติแล้วแต่ระบบยังเรียกว่า "รอฉบับอนุมัติ" */
    const issued = await supabase.from('product_spec_issues').update({
      status: 'issued', issuedAt: now, issuedBy: user.id || null, issuedByName: user.name || null,
      updatedAt: now,
    }).eq('revisionId', latest.id).eq('status', 'pending');
    if (issued.error) return fail(`ปรับสถานะเอกสารที่ออกไว้ไม่สำเร็จ: ${issued.error.message}`, 500);

    const mirror = await syncProductSpecMirror(supabase, { productId: id, revision: latest });
    await recordAudit({
      user, action: 'approve', entityType: 'product_spec', entityId: before.spec.id,
      before: { currentRevNo: before.spec.currentRevNo }, after: { currentRevNo: latest.revNo },
      summary: `approve FM-SA-04 Rev.${latest.revNo} of ${loaded.product.fgCode}`, request: req,
    });
    const after = await loadProductSpec(supabase, id);
    return ok({ ...after, warning: mirror.warning || null });
  }

  if (action === 'reject') {
    /* ตีกลับได้ทั้ง AE (ขั้นตรวจ) และ AE Sup (ขั้นอนุมัติ) — ติดทั้งสองด่านแปลว่า
       ไม่ใช่ทั้งคู่ หรือฉบับไม่ได้อยู่ขั้นที่ตีกลับได้ ⇒ ตอบด้วยเหตุของขั้นแรก */
    const reviewBlock = productSpecReviewBlock(latest, { role });
    const approveBlock = productSpecApproveBlock(latest, { role });
    if (reviewBlock && approveBlock) return badRequest(reviewBlock);
    const reason = String(body.reason || '').trim();
    if (reason.length < 10) return badRequest('ต้องเขียนเหตุผลที่ตีกลับอย่างน้อย 10 ตัวอักษร');
    if (reason.length > 500) return badRequest('เหตุผลที่ตีกลับยาวเกิน 500 ตัวอักษร');
    const { error } = await supabase.from('product_spec_revisions').update({
      status: 'rejected',
      rejectedAt: now, rejectedBy: user.id || null, rejectedByName: user.name || null,
      rejectionReason: reason, updatedAt: now,
    }).eq('id', latest.id).eq('status', latest.status);
    if (error) return fail(`ตีกลับใบสเปคไม่สำเร็จ: ${error.message}`, 500);
    return ok(await loadProductSpec(supabase, id));
  }

  if (action === 'withdraw') {
    // ดึงกลับมาแก้ก่อนถูกอนุมัติ — คนละอันกับ "ตีกลับ" (นั่นคือหัวหน้าส่งกลับมา)
    if (!latest || !['pending_ae', 'pending_ae_supervisor'].includes(latest.status)) {
      return badRequest('ฉบับนี้ไม่ได้อยู่ระหว่างรอตรวจ/รออนุมัติ');
    }
    const mine = latest.submittedBy && latest.submittedBy === user.id;
    if (!mine && !['ae_supervisor', 'admin'].includes(role)) {
      return forbidden('ดึงกลับได้เฉพาะคนที่ส่ง หรือหัวหน้าฝ่ายขาย');
    }
    const { error } = await supabase.from('product_spec_revisions').update({
      status: 'draft', submittedAt: null, submittedBy: null, submittedByName: null,
      reviewedAt: null, reviewedBy: null, reviewedByName: null, updatedAt: now,
    }).eq('id', latest.id).eq('status', latest.status);
    if (error) return fail(`ดึงกลับไม่สำเร็จ: ${error.message}`, 500);
    return ok(await loadProductSpec(supabase, id));
  }

  return badRequest('ไม่รู้จักการกระทำนี้');
});

/**
 * เขียน checklist ทั้งชุด — ส่งมาเมื่อไรคือ **ทับทั้งก้อน**
 *
 * ⚠️ แถวที่หายไปจากที่ส่งมา = แถวที่ถูกลบ · ไม่ส่ง `items` มาเลย = ไม่แตะของเดิม
 *    (กติกาเดียวกับ `confirmAttachments` ของใบสั่งขาย mig 0285)
 */
async function saveChecklist(supabase, revisionId, rows) {
  const extras = rows.filter((row) => !row?.itemKey).length;
  if (extras > MAX_EXTRA_ITEMS) return { error: `เพิ่มแถวเองได้ไม่เกิน ${MAX_EXTRA_ITEMS} แถว` };
  const cleaned = [];
  for (const [index, row] of rows.entries()) {
    const label = String(row?.itemLabel || '').trim();
    if (!label) return { error: `แถวที่ ${index + 1} ไม่มีชื่อรายการ` };
    if (label.length > 200) return { error: `ชื่อรายการแถวที่ ${index + 1} ยาวเกิน 200 ตัวอักษร` };
    const detail = String(row?.detail || '').trim();
    const note = String(row?.note || '').trim();
    if (detail.length > 500) return { error: `รายละเอียดแถวที่ ${index + 1} ยาวเกิน 500 ตัวอักษร` };
    if (note.length > 500) return { error: `หมายเหตุแถวที่ ${index + 1} ยาวเกิน 500 ตัวอักษร` };
    cleaned.push({
      id: genId('PSI'),
      revisionId,
      sortOrder: index,
      itemKey: row?.itemKey || null,
      itemLabel: label,
      detail: detail || null,
      preparedByS: Boolean(row?.preparedByS),
      preparedByCustomer: Boolean(row?.preparedByCustomer),
      note: note || null,
    });
  }
  const wiped = await supabase.from('product_spec_revision_items').delete().eq('revisionId', revisionId);
  if (wiped.error) return { error: `ล้าง checklist เดิมไม่สำเร็จ: ${wiped.error.message}` };
  if (!cleaned.length) return {};
  const inserted = await supabase.from('product_spec_revision_items').insert(cleaned);
  if (inserted.error) return { error: `บันทึก checklist ไม่สำเร็จ: ${inserted.error.message}` };
  return {};
}
