// ── บริบทของด่านเข้าไซต์ — โหลดที่เดียว ใช้ทุกจุดที่ถามด่าน (PR-C) ──────────
//
// 🔴 **ทำไมต้องมีไฟล์นี้** — `evaluateVisitGate` ต้องการข้อมูล 5 ก้อน (โซน · รอบขาย ·
//   ใบสั่งขาย · งวดชำระ · สัญญา) ⇒ ถ้าปล่อยให้แต่ละจุดเรียกประกอบเอง วันหนึ่งจอกับ
//   server จะป้อนคนละชุดแล้ว **ปุ่มกับด่านพูดคนละเรื่อง** ซึ่งเป็นอาการที่โมดูลนี้
//   เจอมาแล้วหลายรอบ (ปุ่มขึ้นปกติแต่กดแล้วถูกปฏิเสธ)
//
// ⚠️ **ไม่ส่งบริบท = ด่านตอบว่าติด ไม่ใช่ผ่าน** — จุดที่ลืมเรียกตัวนี้จะเห็นทุกนัด
//   ติดหมด ซึ่งดังพอให้รู้ตัวทันที (ดีกว่าปล่อยผ่านเงียบ ๆ แล้วส่งคนไปที่ที่ยังไม่จ่าย)
import { fetchAllResult } from '@/lib/supabaseFetchAll';
import { loadTerms, loadZonesForSites } from './termsRepo';

/** โหลดบริบทด่านของ "หลายไซต์" ทีเดียว — จอตารางมีนัดหลายไซต์ในหน้าเดียว
 *  ⚠️ ยิงเป็นก้อน ห้ามยิงรายไซต์ในลูป (N+1 · กติกาเดียวกับคิวงวดชำระ) */
export async function loadVisitGateContext(supabase, siteIds = []) {
  const ids = [...new Set((siteIds || []).filter(Boolean))];
  if (!ids.length) return { zonesBySite: {}, termsBySite: {}, ordersById: {}, installmentsByOrderId: {}, contractsById: {} };

  const zones = await loadZonesForSites(supabase, ids);
  const zoneIds = zones.map((z) => z.id);
  const terms = zoneIds.length ? await loadTerms(supabase, { zoneIds }) : [];

  const zoneSite = new Map(zones.map((z) => [z.id, z.siteId]));
  const zonesBySite = {};
  for (const z of zones) (zonesBySite[z.siteId] ||= []).push(z);
  const termsBySite = {};
  for (const t of terms) {
    const siteId = zoneSite.get(t.zoneId);
    if (siteId) (termsBySite[siteId] ||= []).push(t);
  }

  const orderIds = [...new Set(terms.map((t) => t.salesOrderId).filter(Boolean))];
  const ordersById = {};
  const installmentsByOrderId = {};
  const contractsById = {};
  if (orderIds.length) {
    const inList = orderIds;
    /* ⚠️ เอาเฉพาะช่องที่ด่านใช้จริง — ยิ่งดึงมามาก ยิ่งมีของให้หลุดออกทาง response
       โดยไม่ตั้งใจ (กติกาเดียวกับ route ทะเบียน SO) */
    /* ⚠️ **ไล่ทีละหน้า** — เพดาน 1,000 แถวของ PostgREST ตัดข้อมูลเงียบ ๆ และด่านที่
       ขาดใบไปหนึ่งใบจะตอบว่า "ติด" ทั้งที่จ่ายแล้ว (ด่าน check:rowcap ใน CI คุมไว้)
       ⚠️ ต้องมี `.order()` ที่นิ่ง ไม่งั้นไล่หน้าแล้วได้แถวซ้ำและแถวหายพร้อมกัน */
    const { data: orders } = await fetchAllResult(() => supabase.from('sales_orders')
      .select('id, status, "supersededById", "serviceContractId"')
      .in('id', inList).order('id', { ascending: true }));
    for (const o of orders || []) ordersById[o.id] = o;

    const { data: rows } = await fetchAllResult(() => supabase.from('sales_order_installments')
      .select('"salesOrderId", status, "dueDate", "coversFrom", "coversTo"')
      .in('salesOrderId', inList)
      .order('salesOrderId', { ascending: true }).order('id', { ascending: true }));
    for (const r of rows || []) (installmentsByOrderId[r.salesOrderId] ||= []).push(r);

    const contractIds = [...new Set((orders || []).map((o) => o.serviceContractId).filter(Boolean))];
    if (contractIds.length) {
      const { data: contracts } = await supabase.from('sales_contracts')
        .select('id, "contractNo", kind, status, "effectiveDate", "expiryDate"').in('id', contractIds);
      for (const c of contracts || []) contractsById[c.id] = c;
    }
  }

  return { zonesBySite, termsBySite, ordersById, installmentsByOrderId, contractsById };
}

/** หั่นบริบทก้อนใหญ่ให้เหลือของไซต์เดียว — รูปทรงที่ `evaluateVisitGate` รับ */
export function gateContextForSite(ctx, siteId, extra = {}) {
  return {
    zones: ctx?.zonesBySite?.[siteId] || [],
    terms: ctx?.termsBySite?.[siteId] || [],
    ordersById: ctx?.ordersById || {},
    installmentsByOrderId: ctx?.installmentsByOrderId || {},
    contractsById: ctx?.contractsById || {},
    ...extra,
  };
}
