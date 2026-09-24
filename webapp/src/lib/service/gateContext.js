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
import { fetchInChunks } from '@/lib/supabaseInChunks';
import { paymentNotRequired } from '@/lib/sales/salesOrderPayments';
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
    /* 🔴 **ห้ามกลืน error** (แผน P1 §3-K · 2026-09-15) — ของเดิมเขียน `const { data: orders } = …` แล้วทิ้ง
       error ⇒ query พังครั้งเดียว = ordersById ว่าง = ทุกโซนตอบ "รอบขายไม่มีผล" = นัดทั้งไซต์จอดเป็นร่าง
       พร้อมเหตุผิดฝ่าย (ส่ง SA ไปไล่ใบสั่งขายที่ไม่มีอะไรผิด) · ตอนนี้โยนให้ catch ของผู้เรียกตอบ 500 ที่อ่านออก
       (ผู้เรียกทั้ง 6 จุดอยู่ใน try/catch ของ route แล้ว — visits · visits/[id] · plans×2 ผ่าน planGen ·
       renewals ผ่าน renewalRetrieveVisit · sales-orders/[id]/service)
       ⭐ `totalAmount` — ด่านข้อ② ปล่อยใบยอด 0 ผ่านเอง (`paymentNotRequired` · มติ 22/09 · mig 0374)
          🔄 แทน `paymentGateExemptAt` ของ 0360 (สวิตช์ยกเว้นด่านเงินรายใบของใบย้อนหลัง — ถอดแล้ว)
          · `origin` คงไว้ให้จอบอกว่าใบไหนเป็นใบย้อนหลัง */
    const { data: orders, error: orderError } = await fetchInChunks(inList, (chunk) => fetchAllResult(() => supabase.from('sales_orders')
      .select('id, status, "supersededById", "serviceContractId", origin, "totalAmount"')
      .in('id', chunk).order('id', { ascending: true })));
    if (orderError) throw orderError;
    /* 🔒 **ยอดจริงของใบไม่ออกไปกับบริบทนี้** — บริบทด่านถูกส่งถึงจอฝ่ายบริการทั้งก้อน
       (`/api/service/visits` · คิวจัดคิว) และฝ่ายบริการไม่เห็นราคาของใบสั่งขายโดยตั้งใจ (หัวไฟล์
       api/service/intake · งวดข้างล่างก็ไม่ดึงยอด) ⇒ เหลือแค่คำตอบที่ด่านต้องใช้: ใบยอด 0 = `0` ·
       ใบที่มียอด = `null` (ไม่รู้ยอด ≠ ยอด 0 — `paymentNotRequired` ตอบ false ⇒ เดินตามงวด ตรงกับของจริง)
       ⚠️ ตัดสินด้วยตัวเดียวกับที่ด่านใช้ ⇒ server กับจอเห็นคำตอบเดียวกันเสมอ */
    for (const o of orders || []) {
      ordersById[o.id] = { ...o, totalAmount: paymentNotRequired(o.totalAmount) ? 0 : null };
    }

    const { data: rows, error: installmentError } = await fetchInChunks(inList, (chunk) => fetchAllResult(() => supabase.from('sales_order_installments')
      .select('"salesOrderId", status, "dueDate", "coversFrom", "coversTo"')
      .in('salesOrderId', chunk)
      .order('salesOrderId', { ascending: true }).order('id', { ascending: true })));
    if (installmentError) throw installmentError;
    for (const r of rows || []) (installmentsByOrderId[r.salesOrderId] ||= []).push(r);

    /* ⭐ `approvedAt` + `cancelledAt` (มติ 24/09/2026) — สัญญาที่ถูกยกเลิกหลังลงนามยังครอบนัดก่อนวันยกเลิก
       (`contractCoverageOn`) · ไม่ดึงมา = ด่านเห็นเป็นใบที่ไม่เคยมีผล ⇒ ใบส่งงานเก่ากลายเป็น "งดบริการ" ย้อนหลังเงียบ ๆ
       ⚠️ ชุดคอลัมน์ต้องเท่ากับของทะเบียนต่อสัญญา (renewals/route.js) — gateContext.test ล็อกไว้ */
    const contractIds = [...new Set((orders || []).map((o) => o.serviceContractId).filter(Boolean))];
    if (contractIds.length) {
      const { data: contracts, error: contractError } = await fetchInChunks(contractIds, (chunk) => fetchAllResult(() => supabase.from('sales_contracts')
        .select('id, "contractNo", kind, status, "effectiveDate", "expiryDate", "approvedAt", "cancelledAt"').in('id', chunk).order('id', { ascending: true })));
      if (contractError) throw contractError;
      for (const c of contracts || []) contractsById[c.id] = c;
    }
  }

  return { zonesBySite, termsBySite, ordersById, installmentsByOrderId, contractsById };
}

/* ห้าก้อนของบริบทด่าน — ลำดับเดียวกับที่ `loadVisitGateContext` คืน */
const GATE_CONTEXT_MAPS = ['zonesBySite', 'termsBySite', 'ordersById', 'installmentsByOrderId', 'contractsById'];

/** รวมบริบทด่านหลายก้อนเป็นก้อนเดียว — **ตัวหลังชนะรายคีย์** · ก้อนที่เป็น null ข้ามไป
 *
 *  ⭐ หน้าจัดคิวโหลดบริบทสองทาง: ของสัปดาห์ที่เปิดอยู่ (ตาราง) กับของรายการงาน (ร่างทุกวัน)
 *     ⇒ โมดัลของร่างที่อยู่นอกสัปดาห์ต้องเห็นบริบทจากก้อนที่สอง ไม่งั้นด่านบนโมดัลตอบ "ติด"
 *     (ไม่มีบริบท = ติด) ทั้งที่แถวในรายการงานเพิ่งบอกว่า "พร้อมปล่อย" — ปุ่มกับด่านพูดคนละเรื่อง
 *  ⚠️ **แทนที่ทั้งค่า ไม่ต่ออาร์เรย์** — `zonesBySite[siteId]` ของแต่ละก้อนคือโซน *ทั้งหมด* ของไซต์นั้น
 *     อยู่แล้ว (ตัวโหลดดึงรายไซต์ครบชุด) ⇒ ต่อกันเท่ากับโซนซ้ำสองเท่า แล้วด่านนับ "งดบริการ" เบิ้ล
 *  รับได้ทั้ง object และ Map · คืน object ธรรมดาเสมอ (รูปเดียวกับที่ `gateContextForSite` อ่าน) */
export function mergeGateContext(...ctxs) {
  const out = Object.fromEntries(GATE_CONTEXT_MAPS.map((name) => [name, {}]));
  for (const ctx of ctxs) {
    if (!ctx || typeof ctx !== 'object') continue;
    for (const name of GATE_CONTEXT_MAPS) {
      const map = ctx[name];
      if (!map || typeof map !== 'object') continue;
      const entries = map instanceof Map ? map.entries() : Object.entries(map);
      for (const [key, value] of entries) out[name][key] = value;
    }
  }
  return out;
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
