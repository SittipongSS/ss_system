// ── ระบบขอราคาผลิต — ชั้นเข้าถึงข้อมูล (server only) ──────────────────
// แยกจาก lib/costing.js (logic ล้วน) เพราะไฟล์นี้แตะ DB จริง
import { randomUUID } from 'crypto';
import { sourceDeptForKind } from '@/lib/master/costTemplate';
import { REQUEST_OPEN_STATUSES } from '@/lib/deptRequests';

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

// ── เคสขอราคาวัสดุที่เปิดค้างจากใบนี้ (0158+0159) ──────────────────────
// คืนรายการ { componentId, askId, docNo, askStatus } เฉพาะรายการที่ยังไม่ถูกตอบ
// ในเคสที่ยังเดินอยู่ — ใช้ทั้งป้ายบนหน้าจอ, ด่านส่งผู้บริหาร และธงสถานะ 'pricing'
export async function loadPendingAskLinks(supabase, requestId) {
  const { data: asks, error } = await supabase
    .from('dept_requests')
    .select('id, docNo, status, dept')
    .eq('costingRequestId', requestId)
    .in('status', REQUEST_OPEN_STATUSES);
  if (error) throw error;
  if (!asks?.length) return [];

  // 🐞 เคย select/filter ด้วย `askId` ซึ่งไม่มีในตาราง — คอลัมน์จริงคือ `requestId`
  // (ตกค้างจากตอน rename inquiries → dept_requests, mig 0173/0174) · query ตอบ 42703
  // และที่นี่ throw ต่อ ⇒ หน้ารายละเอียดใบขอราคาผลิตเปิดไม่ได้ + กดส่งอนุมัติไม่ได้
  // ทันทีที่ใบนั้นมีเคสขอราคาวัสดุเปิดค้างสักใบ · prod ยังไม่กัดเพราะยังไม่มีเคสที่ผูก
  // costingRequestId เลย (0 แถว 2026-07-29) แต่จะระเบิดทันทีที่เปิดเคสแรก
  const { data: items, error: itemError } = await supabase
    .from('dept_request_items')
    .select('id, requestId, componentId, priceStatus, label')
    .in('requestId', asks.map((a) => a.id))
    .eq('priceStatus', 'pending');
  if (itemError) throw itemError;

  const byId = new Map(asks.map((a) => [a.id, a]));
  // ชื่อ field ขาออกยังเป็น askId ตามสัญญาเดิมของผู้เรียก (หน้าใบขอราคาผลิต)
  return (items || [])
    .filter((i) => i.componentId)
    .map((i) => ({
      componentId: i.componentId,
      askItemId: i.id,
      askId: i.requestId,
      docNo: byId.get(i.requestId)?.docNo || null,
      askStatus: byId.get(i.requestId)?.status || null,
      dept: byId.get(i.requestId)?.dept || null,
    }));
}

// สถานะ 'pricing' = "ใบนี้มีเคสขอราคาวัสดุค้างอยู่" (มติ PR-3) — แอปสลับธงนี้เอง
// ทุกครั้งที่คิวเคสของใบเปลี่ยน ไม่มีปุ่มให้ใครกด (แพตเทิร์นเดียวกับสถานะอนุมัติ)
//
// แตะเฉพาะสามสถานะต้นทางเท่านั้น: ใบที่ถูกตีกลับ/รออนุมัติ/อนุมัติแล้ว สถานะของมัน
// มีความหมายแรงกว่า ห้ามให้การเปิดเคสมากลบทิ้ง (ด่านส่งผู้บริหารกันไว้อีกชั้นแล้ว)
export async function syncCostingPricingStatus(supabase, requestId) {
  const { data: row, error } = await supabase
    .from('costing_requests').select('id, status').eq('id', requestId).maybeSingle();
  if (error) throw error;
  if (!row || !['draft', 'pricing', 'assembling'].includes(row.status)) return row?.status ?? null;

  const pending = await loadPendingAskLinks(supabase, requestId);
  let next = row.status;
  if (pending.length) next = 'pricing';
  else if (row.status === 'pricing') next = 'assembling';
  if (next === row.status) return row.status;

  const { error: updateError } = await supabase.from('costing_requests')
    .update({ status: next, updatedAt: new Date().toISOString() }).eq('id', requestId);
  if (updateError) throw updateError;
  return next;
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
    // กรัม/ชิ้นจากแม่แบบเป็นแค่ **ค่าตั้งต้น** — แก้บนบรรทัดได้ผ่าน /components
    // (บั๊ก 3: เดิมนี่คือที่เดียวที่เขียนค่านี้ แม่แบบไม่ใส่มา = ใบค้างถาวร)
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
