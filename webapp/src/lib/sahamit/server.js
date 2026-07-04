import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canAccessSahamit } from '@/lib/permissions';
import { categoryOf } from '@/lib/master/categoryOf';

// ── SAHAMIT server-side scope guard ───────────────────────────────────
// The proxy only gates by role (coarse). EVERY /api/sahamit handler must call
// getSahamitContext() to enforce the real scope the proxy can't see:
//   1. signed in            → else 401
//   2. canAccessSahamit     → team===KA (or admin / sales-head) else 403
//   3. customer AR-109 exists → resolve it so all reads/writes scope to its id
// This closes loophole C1 (UI-only filtering would let a direct API call read
// another team's / customer's data).

// The single customer this module serves. If S&S ever onboards another customer
// into the same module, this becomes a per-request lookup instead of a constant.
export const SAHAMIT_AR_CODE = 'AR-109';

// Returns { ok:true, user, customer, supabase, customerId }
//      or { ok:false, status, error } — pass the latter to sahamitError().
export async function getSahamitContext() {
  const user = await getCurrentUser();
  if (!user) return { ok: false, status: 401, error: 'unauthorized' };
  if (!canAccessSahamit(user.role, user.team)) {
    return { ok: false, status: 403, error: 'forbidden' };
  }

  // Wrap so a thrown error (e.g. getSupabaseAdmin when env is missing) becomes a
  // legible message in the UI banner instead of an opaque "(500)".
  let supabase;
  try {
    supabase = getSupabaseAdmin();
  } catch (e) {
    return { ok: false, status: 500, error: `เชื่อมต่อฐานข้อมูลไม่ได้: ${e.message}` };
  }

  const { data: customer, error } = await supabase
    .from('customers')
    .select('*')
    .eq('arCode', SAHAMIT_AR_CODE)
    .maybeSingle();
  if (error) return { ok: false, status: 500, error: `อ่านข้อมูลลูกค้าไม่สำเร็จ: ${error.message}` };
  if (!customer) {
    return { ok: false, status: 404, error: `ไม่พบลูกค้า ${SAHAMIT_AR_CODE} ในฐานข้อมูลหลัก` };
  }

  return { ok: true, user, customer, customerId: customer.id, supabase };
}

// Turn a non-ok context into a JSON Response with the right status.
export function sahamitError(ctx) {
  return Response.json({ error: ctx.error }, { status: ctx.status });
}

// ── Product resolution (fgCode = the module's "SKU") ──────────────────
// Load the customer's products once, then resolve incoming fgCodes against them.
// FC/PO lines snapshot fgCode + productName so an unmatched code is never lost
// (loophole C2): it's stored with productId=null and flagged for the user to map
// or add to master later — products may grow over time.

// Returns the AR-109 products as a lean list [{ id, fgCode, name, brandName, volume, volumeUnit }].
// Mirrors the master products list (/api/products): only APPROVED + active rows
// — pending-approval products aren't offered for forecasting. Legacy NULL
// approvalStatus is treated as approved (pre-0027 rows), same as master.
export async function loadSahamitProducts(supabase, customerId) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('customerId', customerId)
    .or('approvalStatus.eq.approved,approvalStatus.is.null');
  if (error) throw new Error(error.message);

  // categoryCode → ชื่อหมวด (nameTh) จาก product_types (ใช้กรอง/แสดงในกระทบยอด).
  const { data: types } = await supabase
    .from('product_types')
    .select('mainCategoryCode,typeCode,nameTh,nameEn');
  const typeName = new Map((types || []).map((t) => [`${t.mainCategoryCode}-${t.typeCode}`, t.nameTh || t.nameEn]));

  return (data || [])
    .filter((p) => p.isActive !== false)
    .map((p) => {
      const categoryCode = p.categoryCode || categoryOf(p.fgCode);
      return {
        id: p.id,
        fgCode: p.fgCode,
        name: p.productDescription || p.productDescriptionEn || p.fgCode,
        brandName: p.brandName || p.brandNameEn || null,
        volume: p.volume ?? null,
        volumeUnit: p.volumeUnit ?? null,
        categoryCode: categoryCode ?? null,
        category: (categoryCode && typeName.get(categoryCode)) || categoryCode || null,
        // มูลค่า = qty × ราคาโรงงาน (factory price = costPrice ใน master; ดู products
        // route: `const factoryPrice = costPrice`). ใช้ร่วมทั้งกระทบยอด + รายงานมูลค่า.
        price: p.costPrice ?? null,
      };
    });
}

// Build a fgCode → product index (case-insensitive, trimmed).
export function indexByFgCode(products) {
  const idx = new Map();
  for (const p of products || []) {
    if (p.fgCode) idx.set(String(p.fgCode).trim().toLowerCase(), p);
  }
  return idx;
}

// Resolve a single fgCode against the index. Returns { productId, productName,
// known } — known=false means it isn't in master (kept anyway, flagged).
export function resolveFgCode(index, fgCode) {
  const hit = index.get(String(fgCode || '').trim().toLowerCase());
  return hit
    ? { productId: hit.id, productName: hit.name, known: true }
    : { productId: null, productName: null, known: false };
}
