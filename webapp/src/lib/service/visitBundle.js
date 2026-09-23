// ── ของที่ต้องส่งไปพร้อม "นัดชุดหนึ่ง" — ไซต์ · ภาระ · บริบทด่าน ─────────────────
//
// ⭐ ใช้สองจุด: ตารางสัปดาห์ (`GET /api/service/visits`) กับรายการงาน
//    (`GET /api/service/visits/queue`) · เดิมทั้งก้อนเขียนอยู่ใน route ของตารางสัปดาห์
//    ⇒ ยกออกมาที่เดียว ไม่งั้นรายการงานต้องก๊อปไป แล้ววันหนึ่งสองจอนับภาระคนละสูตร
//    (จอเดียวกันแต่คอลัมน์ซ้ายกับปฏิทินขวาบอกว่าเจ้าหน้าที่ว่างไม่เท่ากัน)
import { fetchAllInChunks } from '@/lib/supabaseInChunks';
import { loadVisitGateContext } from './gateContext';
import { sitesForVisits } from './visitsRepo';
import { siteWorkload } from './visitLoad';
import { termIsActive } from './terms';

/**
 * @param visits       นัดที่จะขึ้นจอ (ไซต์ถูกหยิบจาก `siteId` ของชุดนี้)
 * @param gateSiteIds  ไซต์ที่ต้องโหลดบริบทด่าน — ไม่ส่ง = ทุกไซต์ของ **นัด** ในชุด
 *                     (รายการงานส่งเฉพาะไซต์ของร่าง เพราะด่านถามเฉพาะตอนปล่อยร่าง)
 * @param extraSiteIds ไซต์ที่ไม่มีนัดแต่จอต้องรู้จัก (การ์ดคำร้องรอลงคิว · มติเจ้าของ 23/09)
 *                     ⚠️ ได้ไซต์ + ภาระ แต่ **ไม่ได้บริบทด่าน** — คำร้องยังไม่มีนัดให้ตรวจด่าน
 *                     (นัดประเมินข้ามด่าน ①② อยู่แล้ว · ยิงด่านให้ = โหลดโซน/สัญญาฟรี ๆ)
 * @returns `{ sites, workload, gateContext }` — `sites` เป็น array รูปเดียวกับที่ response ส่ง
 * @throws  error ของ query ตัวแรกที่พัง — ผู้เรียกตอบ 500 ใน catch ของ route
 */
export async function visitBundle(supabase, visits = [], { gateSiteIds, extraSiteIds = [] } = {}) {
  // ปฏิทินต้องรู้ชื่อ/โซน/ช่วงเวลาเข้าไซต์เพื่อขึ้นป้ายเตือน — ส่งไปพร้อมกัน
  // ไม่งั้นหน้าจอต้องยิงตามรายนัด (สัปดาห์หนึ่ง 40 นัด = 40 คำขอ)
  // ⚠️ ไซต์ของคำร้องต่อท้ายก้อนเดียวกัน (ซอยก้อน/ไล่หน้าในตัวโหลดเดิม) ไม่ใช่คำขอแยก
  const extras = (Array.isArray(extraSiteIds) ? extraSiteIds : []).filter(Boolean).map((siteId) => ({ siteId }));
  const sites = await sitesForVisits(supabase, [...visits, ...extras]);
  const siteIds = [...sites.keys()];
  const visitSiteIds = new Set(visits.map((visit) => visit.siteId));

  /* ⭐ ภาระของเจ้าหน้าที่นับเป็น **จุด + แพ็ค** ไม่ใช่จำนวนนัด (F-6) — ไซต์หนึ่งมี
     เครื่องตัวเดียว อีกไซต์มี 12 ตัว "วันนี้ 5 นัด" จึงบอกไม่ได้ว่าไหวไหม
     ⇒ ส่งจำนวนจุดที่ยังอยู่หน้างาน + แพ็คตามรอบขายของโซนมาพร้อมกัน
     ⚠️ นับที่ server ทีเดียว ไม่ให้จอไล่ยิงรายไซต์ (200 ไซต์ = 200 คำขอ)
     ⚠️ **ต้องเลือก `qty` มาด้วย** — ชุดอุปกรณ์ 1 แถวมีได้หลายจุด (สบู่ 242 จุด)
        ไม่ดึงมา = ประเมินงานต่ำเงียบ ๆ (พบตอน UAT 2026-08-28) */
  const [assets, zones] = siteIds.length ? await Promise.all([
    // 🔴 ห่อ fetchAll (mig 0332) — เครื่องทั้งระบบเกินเพดาน 1,000 แถว และช่วงวันที่
    //    กว้าง ๆ ก็แตะไซต์ได้เกือบทั้งหมด ⇒ ภาระคิวช่างจะต่ำกว่าจริงโดยไม่มี error
    fetchAllInChunks(siteIds, (chunk) => supabase.from('service_assets').select('id, siteId, status, qty')
      .in('siteId', chunk).order('id', { ascending: true })),
    fetchAllInChunks(siteIds, (chunk) => supabase.from('service_zones').select('id, siteId')
      .in('siteId', chunk).order('id', { ascending: true })),
  ]) : [[], []];

  const zoneIds = zones.map((z) => z.id);
  const terms = await fetchAllInChunks(zoneIds, (chunk) => supabase
    .from('service_zone_terms').select('id, zoneId, packageQty, salesOrderId')
    .in('zoneId', chunk).order('id', { ascending: true }));

  /* ⚠️ "รอบไหนยังมีผล" ตัดสินที่ terms.js ที่เดียว — ที่นี่แค่หยิบใบสั่งขายแม่มาให้
     (ไม่มีใบ = ตัวตัดสินตอบ false ตามที่ออกแบบ ไม่ใช่เดาว่าใช่) */
  const orderIds = [...new Set(terms.map((t) => t.salesOrderId).filter(Boolean))];
  const orders = await fetchAllInChunks(orderIds, (chunk) => supabase
    .from('sales_orders').select('id, status, supersededById')
    .in('id', chunk).order('id', { ascending: true }));
  const ordersById = new Map(orders.map((o) => [o.id, o]));
  const activeTermIds = new Set(terms
    .filter((term) => termIsActive(term, ordersById.get(term.salesOrderId)))
    .map((term) => term.id));

  const workload = {};
  for (const siteId of siteIds) {
    workload[siteId] = siteWorkload({ siteId, assets, zones, terms, activeTermIds });
  }

  /* ⭐ บริบทของด่าน ①② (PR-C) — ส่งไปให้จอคำนวณด่านด้วย **ตัวประเมินตัวเดียวกับ
     server** แทนที่จะให้จอเดาเงื่อนไขเอง · จอจัดคิวต้องประเมินสดตอนคนเปลี่ยนวัน/
     ผู้รับผิดชอบในโมดัล จึงส่งข้อมูลไป ไม่ใช่ส่งผลสำเร็จรูปมาก้อนเดียว
     🪤 **ซ้อนกับการโหลด zones/terms/orders ข้างบนที่ใช้คำนวณภาระ** — ของข้างบน
        เลือกมาไม่ครบสำหรับด่าน (ไม่มีวันของ term · ไม่มี serviceContractId)
        ⇒ รอบนี้ยอมยิงซ้ำเพื่อให้ด่านถูกก่อน · ยุบเป็นก้อนเดียวได้ถ้าเจอว่าหน้านี้หนัก */
  const gateContext = await loadVisitGateContext(supabase, gateSiteIds ?? siteIds.filter((id) => visitSiteIds.has(id)));

  return { sites: [...sites.values()], workload, gateContext };
}
