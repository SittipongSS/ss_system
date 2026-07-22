// ── API ใบขอราคาผลิต — รายการ + สร้างใบ (mig 0141) ────────────────────
// สิทธิ์: อ่านตาม canViewCostingRequest (ฝ่ายขายตาม scope ดีล, RD/PC เห็นคิว
// ทั้งฝ่าย, ผู้บริหาร/viewer เห็นหมด); สร้างต้องมี costing:edit = ฝ่ายขาย
// proxy กันชั้นแรกที่ /api/sa/costing แล้ว (ดู apiWriteAllowed)
import { randomUUID } from 'crypto';
import { getSupabaseAdmin } from '@/lib/supabaseAdmin';
import { getCurrentUser } from '@/lib/authUser';
import { can, canViewCosting } from '@/lib/permissions';
import { activeProductTypeError } from '@/lib/master/productTypes';
import { loadCostTemplates } from '@/lib/master/costTemplateAdmin';
import { canViewCostingRequest, resolveCostingDealContext } from '@/lib/costing';
import {
  componentRowsFromTemplate, findCostingRequest, loadCostingRequests, tierRowsFor,
} from '@/lib/costingAdmin';
import { normalizeCostingItems, normalizeTierQuantities } from '@/lib/costingReconcile';
import { recordAudit } from '@/lib/audit';

export const dynamic = 'force-dynamic';

const MAX_ITEMS = 30;

// GET /api/sa/costing?status=a,b&team=X&dealId=…
export async function GET(request) {
  try {
    const user = await getCurrentUser();
    if (!canViewCosting(user)) return Response.json({ error: 'forbidden' }, { status: 403 });

    const url = new URL(request.url);
    const listParam = (key) => (url.searchParams.get(key) || '').split(',').filter(Boolean);
    const rows = await loadCostingRequests(getSupabaseAdmin(), {
      filters: {
        status: listParam('status'),
        team: listParam('team'),
        customerId: url.searchParams.get('customerId') || null,
        dealId: url.searchParams.get('dealId') || null,
      },
    });

    // กรองรายแถวอีกชั้น — scope ของฝ่ายขายขึ้นกับทีม/เจ้าของ ซึ่ง query ทำแทนไม่ได้
    return Response.json(rows.filter((row) => canViewCostingRequest(user, row)), {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sa/costing — เปิดใบใหม่ (ยังเป็นร่าง ยังไม่ออกเลขที่เอกสาร)
// เลขที่ CR-YYMMXXXX ออกตอน "ส่งขอราคา" (PR4) ไม่ใช่ตอนสร้างร่าง — ร่างที่ถูก
// ทิ้งจะได้ไม่กินเลขเอกสารจนเลขขาดช่วง
export async function POST(request) {
  const supabase = getSupabaseAdmin();
  const user = await getCurrentUser();
  if (!can(user?.role, 'costing:edit')) {
    return Response.json({ error: 'forbidden' }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));

  // ลูกค้า/ทีม อ่านจากดีลจริงเสมอ ไม่เชื่อค่าที่ client ส่ง
  const resolved = await resolveCostingDealContext(supabase, user, body.dealId);
  if (resolved.error) {
    return Response.json({ error: resolved.error }, { status: resolved.status || 400 });
  }

  const moq = body.moq == null || body.moq === '' ? 1000 : Number(body.moq);
  if (!Number.isFinite(moq) || moq <= 0) {
    return Response.json({ error: 'MOQ ต้องเป็นตัวเลขมากกว่า 0' }, { status: 400 });
  }

  // ตัวตรวจชุดเดียวกับตอนแก้ (PATCH) — ฟอร์มเป็น component เดียว กฎก็ต้องชุดเดียว
  const { items: payloadItems, error: itemFormatError } = normalizeCostingItems(body.items, { maxItems: MAX_ITEMS });
  if (itemFormatError) return Response.json({ error: itemFormatError }, { status: 400 });

  const { quantities, error: tierFormatError } = normalizeTierQuantities(body.tierQuantities);
  if (tierFormatError) return Response.json({ error: tierFormatError }, { status: 400 });
  // ชั้นจำนวนของทั้งใบ — ต้องมีชั้น MOQ เสมอ ไม่งั้นอนุมัติแล้วไม่มีช่องกรอกราคา
  const tierQtys = [...quantities, moq];

  // ตรวจทุกรายการให้ผ่านก่อน แล้วค่อยเขียน — กันใบครึ่ง ๆ กลาง ๆ ค้างในระบบ
  const templates = await loadCostTemplates(supabase, { includeHidden: false });
  const prepared = [];
  for (let i = 0; i < payloadItems.length; i += 1) {
    const raw = payloadItems[i];
    const at = `รายการที่ ${i + 1}`;

    const categoryError = await activeProductTypeError(raw.categoryCode);
    if (categoryError) return Response.json({ error: `${at}: ${categoryError}` }, { status: 400 });

    // กางบรรทัดจากแม่แบบที่ใช้งานอยู่ของประเภทนั้น
    const template = templates.find((t) => t.categoryCode === raw.categoryCode);
    if (!template) {
      return Response.json({
        error: `${at}: ประเภทสินค้า ${raw.categoryCode} ยังไม่มีแม่แบบต้นทุน — ให้ผู้ดูแลระบบสร้างที่หน้าตั้งค่าก่อน`,
      }, { status: 400 });
    }

    const itemId = `CRI-${randomUUID()}`;
    prepared.push({
      item: {
        id: itemId,
        sortOrder: i + 1,
        productId: raw.productId,
        categoryCode: raw.categoryCode,
        templateId: template.id,
        productLabel: raw.productLabel,
        fragranceName: raw.fragranceName,
      },
      components: componentRowsFromTemplate(itemId, template.lines),
      tiers: tierRowsFor(itemId, tierQtys),
    });
  }

  const requestId = `CR-${randomUUID()}`;
  const { error: headerError } = await supabase.from('costing_requests').insert({
    id: requestId,
    status: 'draft',
    ...resolved.context,
    requestedById: user?.id ?? null,
    requestedByName: user?.name ?? null,
    moq,
    note: body.note ? String(body.note).trim().slice(0, 2000) : null,
  });
  if (headerError) return Response.json({ error: headerError.message }, { status: 500 });

  const cleanup = async (message) => {
    // ร่างที่ยังไม่ส่งลบได้จริง (guard 0141 เปิดช่องไว้) — ไม่ทิ้งใบเปล่าค้างระบบ
    await supabase.from('costing_requests').delete().eq('id', requestId);
    return Response.json({ error: message }, { status: 500 });
  };

  const { error: itemError } = await supabase
    .from('costing_request_items')
    .insert(prepared.map((p) => ({ ...p.item, requestId })));
  if (itemError) return cleanup(itemError.message);

  const { error: componentError } = await supabase
    .from('costing_item_components')
    .insert(prepared.flatMap((p) => p.components));
  if (componentError) return cleanup(componentError.message);

  const { error: tierError } = await supabase
    .from('costing_item_tiers')
    .insert(prepared.flatMap((p) => p.tiers));
  if (tierError) return cleanup(tierError.message);

  const created = await findCostingRequest(supabase, requestId);
  await recordAudit({
    user, action: 'create', entityType: 'costing_request', entityId: requestId, after: created,
    summary: `เปิดใบขอราคาผลิต ${prepared.length} รายการ (ดีล ${resolved.deal.code || resolved.deal.id})`,
    request,
  });
  return Response.json(created, { status: 201 });
}
