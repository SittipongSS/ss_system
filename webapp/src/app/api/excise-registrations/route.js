import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { attributionTeam, canDeleteRecord, userTeams, viewScopeUser } from '@/lib/permissions';
import { teamInClause } from '@/lib/teamScope';
import { recordAudit } from '@/lib/audit';
import { genId } from '@/lib/id';
import { productBrandName, productDisplayName } from '@/lib/master/productIdentity';

export const dynamic = 'force-dynamic';

// GET /api/excise-registrations — team-scoped list (RA/supervisor see all).
// ?slim=1: เฉพาะคอลัมน์ที่จอสรุป (/tax) ใช้ — ตัด snapshot ภาษี/metadata/เอกสาร
// ออกจาก payload (ลด traffic); โหมดเต็มพฤติกรรมเดิม.
const REGISTRATION_SELECT_SLIM =
  'id, status, createdAt, fgCode, productName, customerName, rejectionReason, team, ownerId, metadata';

export async function GET(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const slim = new URL(request.url).searchParams.get('slim') === '1';

  let query = supabase
    .from('excise_registrations')
    .select(slim ? REGISTRATION_SELECT_SLIM : '*')
    .order('createdAt', { ascending: false });
  /* ทะเบียนที่ไม่มีทีม (team = null) เป็น "ของกลาง" ทุกทีมเห็น — กฎเดียวกับใบยื่น
     (/api/orders) และกับ `canViewRecord` ที่ถือว่า registrations ไร้ทีม = shared
     (TEAMLESS_SHARED_RESOURCES) อยู่แล้ว
     🐞 ของเดิม `.in('team', ทีมของฉัน)` เฉย ๆ ⇒ ซ่อนแถว team = null จาก **ทุกทีม**
     ซึ่งเกิดทุกครั้งที่คนไม่มีทีม (admin/RA/staff) เป็นคนสร้าง เพราะ POST เขียน
     `attributionTeam(user, …)` ซึ่งคืน null ให้คนที่ไม่สังกัดทีมไหนเลย — ตรงกับที่
     คอมเมนต์ของ canViewRecord เล่าไว้ว่าทะเบียนที่ Admin สร้างค้าง "รออนุมัติ" 6 วัน
     โดยไม่มีใครในทีมเห็น (ด่านรายแถวถูกแก้ไปแล้ว ตัวกรองของลิสต์ยังค้างของเดิม)
     · คนที่ scope 'team' แต่ยังไม่มีทีม = ไม่ต้องกรอง (เหมือน /api/orders) */
  if (viewScopeUser(user) === 'team' && userTeams(user).length) {
    query = query.or(`${teamInClause(user)},team.is.null`);
  }

  const { data, error } = await query;
  if (error) return Response.json({ error: error.message }, { status: 500 });
  // canDelete ต่อแถว: หน้ารายละเอียดทะเบียนอ่านข้อมูลจาก "ลิสต์นี้" แล้ว find(id)
  // (ไม่ได้ยิง endpoint รายตัว) — ถ้าไม่แนบที่นี่ ปุ่มลบจะไม่ขึ้นกับใครเลย.
  // ownerId จึงต้องอยู่ในชุดคอลัมน์ slim ด้วย เผื่อ scope กลับไปเป็น 'own' วันหน้า
  return Response.json((data || []).map((r) => ({ ...r, canDelete: canDeleteRecord(user, 'registrations', r) })));
}

// POST /api/excise-registrations — SA submits a master FG product for excise
// registration against a customer. Tax is snapshotted from the master product.
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const body = await request.json();

  if (!body.productId) return Response.json({ error: 'กรุณาเลือกสินค้า (FG)' }, { status: 400 });

  // Pull the master product (source of truth for FG + tax + owner customer).
  const { data: product, error: prodErr } = await supabase
    .from('products').select('*').eq('id', body.productId).maybeSingle();
  if (prodErr) return Response.json({ error: prodErr.message }, { status: 500 });
  if (!product) return Response.json({ error: 'ไม่พบสินค้าที่เลือก' }, { status: 404 });

  // The customer is derived from the FG's master owner (products.customerId FK),
  // not chosen freely — an FG belongs to exactly one customer. Only fall back to
  // the client-supplied customerId when the FG has no owner set yet.
  const customerId = product.customerId || body.customerId;
  if (!customerId) {
    return Response.json({ error: 'FG นี้ยังไม่มีลูกค้าเจ้าของ กรุณากำหนดลูกค้าให้สินค้าในฐานข้อมูลก่อน' }, { status: 400 });
  }

  const { data: customer, error: custErr } = await supabase
    .from('customers').select('*').eq('id', customerId).maybeSingle();
  if (custErr) return Response.json({ error: custErr.message }, { status: 500 });
  if (!customer) return Response.json({ error: 'ไม่พบลูกค้าที่เลือก' }, { status: 404 });

  // One registration per (product, customer) — ด่านนี้เป็นแค่ "ข้อความที่อ่านรู้เรื่อง"
  // ตัวกันจริงคือ unique index ชั้น DB (mig 0178) เพราะด่านฝั่งแอปกันการกดพร้อมกันสองครั้ง
  // ไม่ได้ · เดิมทิ้ง error ของ query นี้ (`const { data: dup }`) → query สะดุดเมื่อไหร่
  // จะถือว่า "ไม่ซ้ำ" แล้วสร้างซ้ำเงียบ ๆ ซึ่งกระทบปลายน้ำจริง: soFiling ทำ Map ที่ key
  // เป็น productId ทะเบียนซ้ำจึงทับกันแล้วเลือกอันสุดท้ายโดยพลการ
  const { data: dup, error: dupErr } = await supabase
    .from('excise_registrations')
    .select('id')
    .eq('productId', body.productId)
    .eq('customerId', customerId)
    .maybeSingle();
  if (dupErr) return Response.json({ error: dupErr.message }, { status: 500 });
  if (dup) {
    return Response.json({ error: 'สินค้านี้ถูกขึ้นทะเบียนให้ลูกค้ารายนี้แล้ว' }, { status: 409 });
  }

  // ทะเบียนเก็บเฉพาะ "เสียภาษีไหม" — ฝ่าย RA override ได้ทีหลัง
  // **อัตราไม่ก๊อปมาเก็บ**: คิดจากราคาขายปลีกของ FG ซึ่งอัปเดตได้ จึงมีแหล่งเดียวคือ
  // products.exciseTax/localTax (มติผู้ใช้ 2026-07-29 · คอลัมน์สำเนาปลดระวางที่ mig 0180)
  const isExciseTaxable = product.isExciseTaxable !== false;

  const newReg = {
    // id กันชนกัน (มาตรฐานเดียวกับ from-project) — เดิม 'REG-'+ms 6 หลักท้าย วนซ้ำได้
    id: genId('REG'),
    productId: product.id,
    customerId: customer.id,
    projectId: body.projectId || null,
    fgCode: product.fgCode,
    productName: productDisplayName(product),
    brandName: productBrandName(product),
    customerName: customer.name,
    taxId: customer.taxId,
    isExciseTaxable,
    taxableOverride: null,
    // Created as a draft — SA attaches the required documents, then submits
    // (draft → pending_legal) which is gated on those documents being present.
    status: 'draft',
    // คนอยู่หลายทีมเลือกได้ว่าทะเบียนใบนี้เข้าคิวทีมไหน (ค่าที่ไม่ใช่ทีมตัวเอง = ทีมหลัก)
    team: attributionTeam(user, body.team),
    ownerId: user?.id ?? null,
    assignee: body.assignee || user?.name || 'Sales',
    // เก็บ snapshot ทั้งสองภาษาไว้สำหรับค้นหา แม้ป้ายที่แสดงจะใช้ภาษาเดียว.
    metadata: {
      productNameTh: product.productDescription || null,
      productNameEn: product.productDescriptionEn || null,
      brandNameTh: product.brandName || null,
      brandNameEn: product.brandNameEn || null,
      ...(body.projectCode ? { projectCode: body.projectCode } : {}),
    },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('excise_registrations').insert(newReg).select().single();
  // 23505 = unique_violation จาก excise_reg_product_customer_uidx (mig 0178) — เกิดเมื่อ
  // กดสร้างพร้อมกันสองครั้งจนด่านข้างบนผ่านทั้งคู่ ตอบข้อความเดียวกับด่านฝั่งแอป
  if (error?.code === '23505') {
    return Response.json({ error: 'สินค้านี้ถูกขึ้นทะเบียนให้ลูกค้ารายนี้แล้ว' }, { status: 409 });
  }
  if (error) return Response.json({ error: error.message }, { status: 500 });
  await recordAudit({
    user, action: 'create', entityType: 'registration', entityId: data.id, after: data,
    summary: `ขึ้นทะเบียน ${data.fgCode || ''} (${data.customerName || ''})`.trim(), request,
  });
  return Response.json(data, { status: 201 });
}
