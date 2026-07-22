// ── ระบบขอราคาต้นทุน — ชั้นเข้าถึงข้อมูล (server only) ──────────────────
// แยกจาก lib/costing.js (logic ล้วน) เพราะไฟล์นี้แตะ DB จริง
import { randomUUID } from 'crypto';
import { sourceDeptForKind } from '@/lib/master/costTemplate';

// โหลดใบพร้อมลูกทั้งสามชั้นในชุด query คงที่ (ไม่ยิงต่อใบ — กัน N+1 บนหน้ารายการ)
export async function loadCostingRequests(supabase, { id = null, filters = {} } = {}) {
  let query = supabase.from('costing_requests').select('*');
  if (id) query = query.eq('id', id);
  if (filters.status?.length) query = query.in('status', filters.status);
  if (filters.team?.length) query = query.in('team', filters.team);
  if (filters.customerId) query = query.eq('customerId', filters.customerId);
  if (filters.dealId) query = query.eq('dealId', filters.dealId);
  const { data: requests, error } = await query.order('createdAt', { ascending: false });
  if (error) throw error;
  if (!requests?.length) return [];

  const { data: items, error: itemError } = await supabase
    .from('costing_request_items')
    .select('*')
    .in('requestId', requests.map((r) => r.id))
    .order('sortOrder', { ascending: true });
  if (itemError) throw itemError;

  const itemIds = (items || []).map((i) => i.id);
  let components = [];
  let tiers = [];
  if (itemIds.length) {
    const [componentRes, tierRes] = await Promise.all([
      supabase.from('costing_item_components').select('*')
        .in('itemId', itemIds).order('sortOrder', { ascending: true }),
      supabase.from('costing_item_tiers').select('*')
        .in('itemId', itemIds).order('qty', { ascending: true }),
    ]);
    if (componentRes.error) throw componentRes.error;
    if (tierRes.error) throw tierRes.error;
    components = componentRes.data || [];
    tiers = tierRes.data || [];
  }

  return requests.map((request) => ({
    ...request,
    items: (items || [])
      .filter((i) => i.requestId === request.id)
      .map((item) => ({
        ...item,
        components: components.filter((c) => c.itemId === item.id),
        tiers: tiers.filter((t) => t.itemId === item.id),
      })),
  }));
}

export async function findCostingRequest(supabase, id) {
  const [request] = await loadCostingRequests(supabase, { id });
  return request || null;
}

// กางบรรทัดจากแม่แบบของประเภทสินค้าเป็น "สำเนาของใบนี้เอง"
// แม่แบบแก้ทีหลังไม่กระทบใบที่กางไปแล้ว — นั่นคือเหตุผลที่ไม่เก็บแค่ templateId
// แล้วไป join สด ๆ ตอนอ่าน
export function componentRowsFromTemplate(itemId, templateLines = []) {
  return templateLines.map((line, index) => ({
    id: `CRC-${randomUUID()}`,
    itemId,
    sortOrder: line.sortOrder ?? index + 1,
    kind: line.kind,
    label: line.label,
    unitBasis: line.unitBasis,
    gramsPerUnit: line.defaultGramsPerUnit ?? null,
    sourceDept: sourceDeptForKind(line.kind),
    priceStatus: 'pending',
    required: line.required !== false,
  }));
}

// ชั้นจำนวนตั้งต้นของสินค้าใหม่ — อย่างน้อยต้องมีชั้น MOQ ของใบเสมอ
// (ไม่งั้นอนุมัติแล้วไม่มีช่องให้กรอกราคา)
export function tierRowsFor(itemId, quantities = []) {
  const unique = [...new Set(quantities.map(Number).filter((q) => Number.isFinite(q) && q > 0))];
  return unique.sort((a, b) => a - b).map((qty) => ({
    id: `CRT-${randomUUID()}`,
    itemId,
    qty,
    approvedUnitPrice: null,
  }));
}
