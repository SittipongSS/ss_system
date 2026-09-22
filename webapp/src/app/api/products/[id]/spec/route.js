/* ── สเปคสินค้า FM-SA-04 — ข้อมูลสเปคของสินค้า (mig 0370) ──────────────────────
 *
 * ⭐ **มติเจ้าของ 21/09/2569** (docs/fm-sa-04-document-model.md): สเปคในฐานข้อมูลเป็น
 *   ข้อมูลของสินค้า 1 แถวต่อสินค้า — **ไม่มีเลขรัน ไม่มี Rev ไม่มีด่านอนุมัติ** ·
 *   ฝ่ายขายแก้ได้เลย · ทุกการแก้ลง audit log
 *   เลขที่เอกสาร Rev และด่านอนุมัติอยู่ที่ "เอกสาร" ที่ AC ออกจากบรรทัด SO
 *   ⇒ `/api/sales-planning/sales-orders/[id]/spec-documents` (ออก) ·
 *     `/api/sales-planning/spec-documents/[id]` (ยื่น/อนุมัติ/แก้ไข/ยกเลิก)
 *
 * ⚠️ ด่านสิทธิ์ของ proxy สำหรับเส้นนี้เป็น `salesplan:edit` **ไม่ใช่ `products:edit`**
 *   — สเปคเป็นข้อมูลของฝ่ายขาย ไม่ใช่การแก้ทะเบียนสินค้า (กฎ module-ownership) ·
 *   ปล่อยให้ตกกฎ `/api/products` ตัวรวมเมื่อไร RA ที่ถือ `ra:approve` จะ PATCH ได้ด้วย
 * ⚠️ ด่านทุกตัวถาม `productSpecWorkflow` ตัวเดียวกับที่จอใช้ — คิดเงื่อนไขซ้ำที่นี่เมื่อไร
 *   ปุ่มบนจอกับ API จะยอมคนละอย่าง
 * ⚠️ แก้สเปค **ไม่แตะเอกสารที่ยื่น/อนุมัติแล้ว** (เอกสารถือภาพนิ่งของตัวเอง) — ร่างที่ยัง
 *   ไม่ยื่นแสดงสดจากสเปคจึงเห็นค่าใหม่เอง ไม่ต้องเขียนอะไรเพิ่มที่นี่
 */
import { withUser, ok, fail, badRequest, forbidden, notFound, unauthorized } from '@/lib/http';
import { recordAudit } from '@/lib/audit';
import { canViewRecord } from '@/lib/permissions';
import { productSpecScopeReason } from '@/lib/sales/productSpecScope';
import {
  canEditProductSpec, productSpecDeleteBlock, productSpecPermissions,
} from '@/lib/sales/productSpecWorkflow';
import {
  createProductSpec, deleteProductSpec, loadProductPrintFields, loadProductSpec, loadSpecRecord, saveProductSpec,
} from '@/lib/sales/productSpecStore';

export const dynamic = 'force-dynamic';

const EDIT_FORBIDDEN = 'ต้องเป็น AC หรือฝ่ายขายจึงแก้สเปคสินค้าได้';

/* ผลลัพธ์ที่ล้มของ store → คำตอบ · FK ชน (สินค้า/สเปคถูกลบระหว่างที่อีกแท็บกำลังบันทึก)
   ตอบเป็นภาษาคนแทนข้อความอังกฤษของ Postgres — store แปลให้เฉพาะทางลบ ที่นี่เก็บทางสร้าง/บันทึก */
function storeFailure(res, { missing }) {
  if (!res.status && /foreign key|23503/i.test(res.error || '')) return fail(missing, 409);
  return fail(res.error, res.status || 500);
}

async function loadProduct(supabase, id, user) {
  const { data, error } = await supabase
    .from('products')
    .select('id, fgCode, categoryCode, productDescription, productDescriptionEn, brandName, brandNameEn, customerName, team, ownerId')
    .eq('id', id)
    .maybeSingle();
  if (error) return { error: error.message };
  // ไม่พบ = 404 เหมือนสินค้านอกทีม (ไม่บอกว่ามีอยู่)
  if (!data || !canViewRecord(user, 'products', data)) return { missing: true };
  return { product: data };
}

/* แถวเอกสารในรายการของหน้าสเปค — เฉพาะช่องที่จอใช้ (ไม่ลากภาพนิ่ง/ตราประทับมาด้วย) */
const documentSummary = (doc) => ({
  id: doc.id,
  docNo: doc.docNo,
  status: doc.status,
  currentRevNo: doc.currentRevNo ?? null,
  latest: doc.latest ? { revNo: doc.latest.revNo, status: doc.latest.status } : null,
  salesOrderId: doc.salesOrderId || null,
  orderNumber: doc.orderNumber || null,
  createdAt: doc.createdAt || null,
});

/**
 * ก้อนที่ GET/POST/PATCH ตอบ — รูปเดียวกันทั้งสามทาง ให้จอวาดใหม่จากคำตอบได้เลย
 *
 * ⚠️ `product` ต้องมีช่องที่ประกอบแล้ว (`categoryName` · `scentText` · `volumeText`) ชุดเดียวกับที่
 *    กระดาษพิมพ์ (`loadProductPrintFields`) — 🐞 เดิมส่งแค่แถวดิบของทะเบียน ⇒ การ์ดภาพรวมบนหน้าสเปค
 *    ขึ้นขีดที่ "ประเภทผลิตภัณฑ์ · กลิ่น · ขนาดบรรจุ" ทั้งที่กระดาษตัวอย่างจากหน้าเดียวกันพิมพ์ค่าจริง
 *    อ่านไม่ขึ้น = error ไม่ใช่ตัดช่องทิ้งเงียบ ๆ (จอกับกระดาษจะบอกคนละอย่างอีก)
 * ⚠️ `team` · `ownerId` ของแถวเดิมต้องคงอยู่ — ขอบเขตของหน้าอ่านจากสองช่องนี้
 * @returns {{ body: object } | { error: string }}
 */
async function specPayload(supabase, product, user) {
  const loaded = await loadProductSpec(supabase, product.id);
  if (loaded.error) return { error: loaded.error };
  const printed = await loadProductPrintFields(supabase, product.id);
  if (printed.error) return { error: printed.error };
  const documents = loaded.documents || [];
  return {
    body: {
      product: { ...product, ...printed.product, team: product.team, ownerId: product.ownerId },
      scopeReason: productSpecScopeReason(product),
      spec: loaded.spec,
      documents: documents.map(documentSummary),
      permissions: productSpecPermissions({ spec: loaded.spec, documents, role: user?.role }),
    },
  };
}

/* ── GET: สเปคของสินค้า + เอกสารที่ออกจากสเปคนี้ ─────────────────────────── */
export const GET = withUser(async ({ user, supabase, ctx }) => {
  if (!user) return unauthorized();
  const { id } = await ctx.params;
  const loaded = await loadProduct(supabase, id, user);
  if (loaded.error) return fail(loaded.error, 500);
  if (loaded.missing) return notFound('ไม่พบสินค้าชิ้นนี้');

  const payload = await specPayload(supabase, loaded.product, user);
  if (payload.error) return fail(`อ่านสเปคสินค้าไม่สำเร็จ: ${payload.error}`, 500);
  return ok(payload.body);
});

/* ── POST: สร้างสเปค (ครั้งเดียวต่อสินค้า) ──────────────────────────────────
   ⭐ ไม่ส่ง checklist/เอกสารที่ขอได้มา = store เติมแถวตั้งต้นของกระดาษให้ (17 + 4 แถว) */
export const POST = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditProductSpec(user.role)) return forbidden(EDIT_FORBIDDEN);
  const { id } = await ctx.params;
  const loaded = await loadProduct(supabase, id, user);
  if (loaded.error) return fail(loaded.error, 500);
  if (loaded.missing) return notFound('ไม่พบสินค้าชิ้นนี้');

  const scopeReason = productSpecScopeReason(loaded.product);
  if (scopeReason) return badRequest(scopeReason);

  const body = await req.json().catch(() => ({}));
  const created = await createProductSpec(supabase, {
    productId: id,
    input: {
      content: body?.content || {},
      certifications: body?.certifications,
      items: body?.items,
    },
    user,
  });
  if (created.error) return storeFailure(created, { missing: 'ไม่พบสินค้าชิ้นนี้ — อาจถูกลบไปแล้ว โหลดหน้าใหม่' });

  // ⚠️ after = แถวเต็มพร้อม checklist — audit_logs คือทางกู้ทางเดียวของระบบ (ไม่มีถังขยะ)
  await recordAudit({
    user, action: 'create', entityType: 'product_spec', entityId: created.spec.id,
    before: null, after: created.spec,
    summary: `create FM-SA-04 spec of ${loaded.product.fgCode || id}`, request: req,
  });

  const payload = await specPayload(supabase, loaded.product, user);
  // สร้างสำเร็จแล้ว — อ่านกลับไม่ขึ้นต้องไม่กลายเป็น 500 (คนจะกดสร้างซ้ำแล้วชน UNIQUE)
  if (payload.error) {
    return ok({ spec: created.spec, warning: `บันทึกสเปคแล้ว แต่โหลดหน้าใหม่ไม่สำเร็จ: ${payload.error}` }, 201);
  }
  return ok(created.warning ? { ...payload.body, warning: created.warning } : payload.body, 201);
});

/* ── PATCH: บันทึกสเปค ────────────────────────────────────────────────────
   ⚠️ `certifications` / `items` ที่ส่งมา = ทับทั้งชุด · ไม่ส่ง = ไม่แตะของเดิม
   ⚠️ ส่ง `expectedUpdatedAt` มา = กันเขียนทับคนอื่น (ไม่ตรง ⇒ 409) */
export const PATCH = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditProductSpec(user.role)) return forbidden(EDIT_FORBIDDEN);
  const { id } = await ctx.params;
  const loaded = await loadProduct(supabase, id, user);
  if (loaded.error) return fail(loaded.error, 500);
  if (loaded.missing) return notFound('ไม่พบสินค้าชิ้นนี้');

  const before = await loadSpecRecord(supabase, id);
  if (before.error) return fail(`อ่านสเปคสินค้าไม่สำเร็จ: ${before.error}`, 500);
  if (!before.spec) return notFound('สินค้าชิ้นนี้ยังไม่มีสเปค');

  const body = await req.json().catch(() => ({}));
  const expected = typeof body?.expectedUpdatedAt === 'string' && body.expectedUpdatedAt.trim()
    ? body.expectedUpdatedAt.trim()
    : null;
  const saved = await saveProductSpec(supabase, {
    spec: before.spec,
    input: {
      content: body?.content || {},
      certifications: body?.certifications,
      items: body?.items,
    },
    user,
    expectedUpdatedAt: expected,
  });
  if (saved.error) return storeFailure(saved, { missing: 'ไม่พบสเปคนี้ — อาจถูกลบไปแล้ว โหลดหน้าใหม่' });

  await recordAudit({
    user, action: 'update', entityType: 'product_spec', entityId: before.spec.id,
    before: before.spec, after: saved.spec,
    summary: `edit FM-SA-04 spec of ${loaded.product.fgCode || id}`, request: req,
  });

  const payload = await specPayload(supabase, loaded.product, user);
  if (payload.error) {
    return ok({ spec: saved.spec, warning: `บันทึกสเปคแล้ว แต่โหลดหน้าใหม่ไม่สำเร็จ: ${payload.error}` });
  }
  return ok(saved.warning ? { ...payload.body, warning: saved.warning } : payload.body);
});

/* ── DELETE: ลบสเปค (มติผู้ใช้ 2026-09-21 "ลบได้เหมือนใบเสนอราคา") ─────────────
 *
 * 🔴 มีแถวเอกสารแม้ใบเดียว (รวมใบที่ void) = ลบไม่ได้ ไม่ว่าใคร — เลขที่เอกสารอ้างสเปคนี้อยู่
 *   และฐานกันซ้ำด้วย FK `ON DELETE RESTRICT` (store แปล error ของ FK เป็นภาษาคนแล้ว)
 * ⚠️ **ไม่มีถังขยะในระบบ** — ทางกู้ทางเดียวคือ `audit_logs.before` (memory:
 *   deleted-data-recovery) ⇒ ก้อน before ต้องเป็นแถวเต็ม **พร้อม checklist ทุกแถว**
 *   พอให้เขียนกลับได้ ไม่ใช่แค่ id
 */
export const DELETE = withUser(async ({ user, supabase, req, ctx }) => {
  if (!user) return unauthorized();
  if (!canEditProductSpec(user.role)) return forbidden(EDIT_FORBIDDEN);
  const { id } = await ctx.params;
  const loaded = await loadProduct(supabase, id, user);
  if (loaded.error) return fail(loaded.error, 500);
  if (loaded.missing) return notFound('ไม่พบสินค้าชิ้นนี้');

  // ⚠️ อ่านเอกสารไม่ขึ้น = error ไม่ใช่ "ไม่มีเอกสาร" — ด่านที่นับจากผลลัพธ์ต้องไม่เปิดเอง
  const before = await loadProductSpec(supabase, id);
  if (before.error) return fail(`อ่านสเปคสินค้าไม่สำเร็จ: ${before.error}`, 500);
  if (!before.spec) return notFound('สินค้าชิ้นนี้ยังไม่มีสเปค');

  const blocked = productSpecDeleteBlock({ spec: before.spec, documents: before.documents, role: user.role });
  if (blocked) return badRequest(blocked);

  // FK RESTRICT ของเอกสาร (อีกแท็บเพิ่งออกเอกสาร) = store แปลเป็นภาษาคนแล้ว (400)
  const removed = await deleteProductSpec(supabase, { spec: before.spec });
  if (removed.error) return storeFailure(removed, { missing: 'ลบสเปคไม่ได้ เพราะมีเอกสารที่ออกจากสเปคนี้แล้ว' });

  await recordAudit({
    user,
    action: 'delete',
    entityType: 'product_spec',
    entityId: before.spec.id,
    before: before.spec,
    after: removed.warning ? { warning: removed.warning } : null,
    summary: `delete FM-SA-04 spec of ${loaded.product.fgCode || id}`
      + (removed.warning ? ` ⚠️ ${removed.warning}` : ''),
    request: req,
  });

  // ⚠️ ลบแล้วแต่ล้างกระจกบนทะเบียนสินค้าไม่ผ่าน — ต้องบอกจอ ไม่ใช่ขึ้นแค่ "ลบแล้ว"
  return ok(removed.warning ? { deleted: true, warning: removed.warning } : { deleted: true });
});
