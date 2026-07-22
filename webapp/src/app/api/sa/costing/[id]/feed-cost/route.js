// ป้อนต้นทุนที่ผู้บริหารอนุมัติแล้ว กลับเป็น costPrice ของสินค้า (FG)
//
// ทำไมไม่ยิงผ่าน PATCH /api/products/[id] ตามปกติ:
// เส้นนั้นมีกฎ "แก้สินค้าที่อนุมัติแล้ว = ตีกลับเป็น pending ให้หัวหน้าฝ่ายขาย
// อนุมัติใหม่" (resetApprovalOnEdit) ซึ่งจะดึงสินค้าที่ขายอยู่ออกจากตัวเลือก
// approved-only ทันที. ที่นี่ราคาผ่านการอนุมัติของ **ผู้บริหาร** มาแล้ว — ซึ่งเป็น
// ผู้มีอำนาจเหนือกว่าในเรื่องราคา — การบังคับอนุมัติซ้ำจึงซ้ำซ้อนและบล็อกการขาย
// จึงเขียนตรงที่นี่ พร้อมคำนวณฟิลด์ที่ผูกกับ costPrice ใหม่ด้วย "สูตรเดิมทุกตัว"
// (ไม่แตะสัดส่วน 0.65 ของระบบสรรพสามิต — มติ 2026-07-22) เพื่อไม่ให้ค่าที่ derive
// ไว้ค้างไม่ตรงกับ costPrice ใหม่
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { canEditRecord } from '@/lib/permissions';
import { productCaretakerTeams } from '@/lib/master/productScope';
import { recordProductPriceHistory } from '@/lib/master/priceHistory';
import {
  allApprovedItemsLinked, canFeedCostFromRequest, feedCostError, feedCostValue, baselineTier,
} from '@/lib/costing';
import { findCostingRequest } from '@/lib/costingAdmin';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  const { id } = await params;

  const before = await findCostingRequest(supabase, id);
  if (!before) return Response.json({ error: 'ไม่พบใบขอราคา' }, { status: 404 });
  if (!canFeedCostFromRequest(user, before)) {
    return Response.json({
      error: 'ป้อนราคาผลิตได้เฉพาะเจ้าของใบที่มีสิทธิ์แก้สินค้า และใบต้องอนุมัติแล้ว',
    }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const item = (before.items || []).find((i) => i.id === body.itemId);
  if (!item) return Response.json({ error: 'ไม่พบรายการสินค้าที่ระบุ' }, { status: 404 });
  if (item.costFedAt) {
    return Response.json({ error: 'รายการนี้ป้อนราคาผลิตไปแล้ว' }, { status: 409 });
  }

  const blocked = feedCostError(item, before.moq);
  if (blocked) return Response.json({ error: blocked }, { status: 409 });

  const { data: product } = await supabase
    .from('products').select('*').eq('id', item.productId).maybeSingle();
  if (!product) return Response.json({ error: 'ไม่พบสินค้าที่ผูกไว้กับรายการนี้' }, { status: 404 });

  // สินค้าต้องเป็นของลูกค้าเดียวกับใบขอราคา — กันป้อนต้นทุนข้ามลูกค้าโดยพลาด
  if (before.customerId && product.customerId !== before.customerId) {
    return Response.json({
      error: `สินค้า ${product.fgCode} ไม่ใช่ของลูกค้าเจ้าของใบนี้`,
    }, { status: 409 });
  }

  // สิทธิ์แก้สินค้ายึด "ทีมที่ดูแลลูกค้าเจ้าของสินค้า" ตามกติกาเดิมของ master data
  const caretakerTeams = await productCaretakerTeams(product, supabase);
  if (!canEditRecord(user, 'products', product, caretakerTeams)) {
    return Response.json({ error: 'ไม่มีสิทธิ์แก้ไขสินค้ารายการนี้' }, { status: 403 });
  }

  const costPrice = feedCostValue(item, before.moq);
  const tier = baselineTier(item.tiers || [], before.moq);
  const nowIso = new Date().toISOString();

  // สูตรเดิมทุกตัว (ลอกจาก PATCH /api/products/[id]) — เปลี่ยนแค่ที่มาของ costPrice
  const laborCost = Number(product.volume) >= 30 ? 5 : 2;
  const shippingCost = 1;
  const materialCost = costPrice * 0.65;
  const updated = {
    costPrice,
    laborCost,
    shippingCost,
    materialCost,
    factoryProfit: costPrice - materialCost - laborCost - shippingCost,
    updatedAt: nowIso,
  };

  const { data: savedProduct, error: productError } = await supabase
    .from('products').update(updated).eq('id', product.id).select().single();
  if (productError) return Response.json({ error: productError.message }, { status: 500 });

  await recordProductPriceHistory({
    user,
    productId: product.id,
    before: product,
    after: savedProduct,
    changeType: 'update',
    source: 'costing-request',
    metadata: {
      fgCode: savedProduct.fgCode,
      customerId: savedProduct.customerId,
      costingRequestId: id,
      costingDocNo: before.docNo || null,
      tierQty: tier ? Number(tier.qty) : null,
    },
  });

  const { error: itemError } = await supabase.from('costing_request_items').update({
    costFedAt: nowIso,
    costFedById: user?.id ?? null,
    costFedByName: user?.name ?? null,
    costFedPrice: costPrice,
    costFedTierQty: tier ? Number(tier.qty) : null,
    updatedAt: nowIso,
  }).eq('id', item.id);
  if (itemError) return Response.json({ error: itemError.message }, { status: 500 });

  // ใบจบสมบูรณ์เมื่อรายการที่อนุมัติทุกตัวถูกป้อนกลับแล้ว
  const afterWrite = await findCostingRequest(supabase, id);
  if (afterWrite.status !== 'linked' && allApprovedItemsLinked(afterWrite.items || [])) {
    const { error } = await supabase.from('costing_requests')
      .update({ status: 'linked', updatedAt: nowIso }).eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
  }

  const after = await findCostingRequest(supabase, id);
  await recordAudit({
    user, action: 'update', entityType: 'costing_request', entityId: id, before, after,
    summary: `ป้อนราคาผลิต ${costPrice} บาท/ชิ้น เข้าสินค้า ${savedProduct.fgCode} จากใบ ${before.docNo || id}`,
    request,
  });

  return Response.json(after);
}
