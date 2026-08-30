// ── คิวงานเข้าใหม่ของฝ่าย TS (เฟส 4) — logic ล้วน ────────────────────────
//
// ⭐ **ที่มา**: ตัวเลขจากชีตของทีม — 102 จุดที่ลูกค้าจ่ายเงินแล้วแต่ไม่มีคิวบริการ
//   ไม่ได้ "หายไป" มันไม่เคยปรากฏเลย เพราะไม่มีอะไรพาใบสั่งขายมาถึงฝ่าย TS
//   (docs/business-line-level-and-handoff.md:157) ⇒ หน้านี้คือทางที่งานเดินมาถึง
//
// ⚠️ **TS ไม่ใช่ต้นทางของงาน** — หน้านี้อ่านว่า "รับใบที่อนุมัติแล้วมาผูก"
//   ไม่ใช่ "สร้างงานบริการ" · ทุกแถวในคิวมีต้นเรื่องเป็นใบสั่งขายเสมอ
//
// ⚠️ **ใบที่ตอบไม่ได้ว่าสายอะไร ต้องขึ้นถังของมันเอง ห้ามเงียบและห้ามเดา**
//   สายธุรกิจเป็นของโครงการ (projects.line) ส่วน sales_deals.line เป็นสำเนาที่ดีล
//   ถือไว้ตอนยังไม่มีโครงการ · ทั้งคู่ NULL ได้จริง (99/356 ดีลวันนี้) ⇒ เดาเมื่อไร
//   ใบสายสินค้าจะไหลเข้าคิวบริการ หรือใบบริการจะหายไปเงียบ ๆ ทั้งสองทางแย่พอกัน
import { businessDate } from '@/lib/businessDate';
import { isBusinessLine } from '@/lib/master/businessLines';
import { allocatedByLine, fgSummary, lineNeedsAllocation, termIsActive } from './terms';

export const INTAKE_TABS = ['bind', 'plan', 'visit'];

export const INTAKE_TAB_LABELS = {
  bind: 'รอตั้งไซต์/โซน',
  plan: 'รอตั้งรอบ',
  visit: 'ครบรอบยังไม่มีนัด',
};

export const INTAKE_TAB_HINTS = {
  bind: 'ใบสั่งขายที่อนุมัติแล้วแต่ยังไม่รู้ว่าของไปตั้งที่ไหน',
  plan: 'โซนที่ขายแล้วแต่ยังไม่มีรอบเข้าบริการ — ขายแล้วไม่มีใครไปคือที่มาของ 102 จุด',
  visit: 'รอบที่เดินอยู่แต่ไม่มีนัดข้างหน้าเลย',
};

/* ── สายธุรกิจของใบสั่งขาย ────────────────────────────────────────────
   ลำดับการถาม: โครงการก่อน (เจ้าของค่าจริง) แล้วค่อยดีล (สำเนาที่ใช้ตอนยังไม่มี
   โครงการ) · ตอบไม่ได้ = null ไม่ใช่ 'PRODUCT' */
export function orderBusinessLine(order, { projectsById = new Map(), dealsById = new Map() } = {}) {
  const project = order?.projectId ? projectsById.get(order.projectId) : null;
  if (isBusinessLine(project?.line)) return project.line;
  const deal = order?.dealId ? dealsById.get(order.dealId) : null;
  if (isBusinessLine(deal?.line)) return deal.line;
  return null;
}

/* ใบที่ "รับได้" = อนุมัติแล้ว และยังไม่ถูก Rev. ทับ
   ⚠️ ตัวเดียวกับที่ terms.js ใช้ตัดสินว่ารอบยังมีผล — ใบที่ยังไม่อนุมัติผูกโซนไม่ได้
   เพราะยอด/ของยังขยับได้ แล้ว snapshot ที่ก๊อปไปจะกลายเป็นของปลอมทันที */
export const orderReceivable = (order) => order?.status === 'approved' && !order?.supersededById;

/* ── ถังที่ 1: ของที่ขายแล้วแต่ยังไม่ได้จัดสรรลงโซน ────────────────────────
   หน่วยของคิวคือ **ใบ** (คนทำงานเปิดทีละใบ)

   ⭐ **ตัวนับคือ FG + จำนวน ไม่ใช่จำนวนบรรทัด** (มติผู้ใช้ 2026-08-29)
   > *"ไม่ต้องนับบรรทัดแล้ว นับแค่จำนวน FG พอ เพื่อให้ทาง TS จัดสรร ส่งโซนเอง"*

   "บรรทัด" เป็นรูปร่างของเอกสารขาย (แยกตามราคา/ส่วนลด) ไม่ใช่รูปร่างของงาน —
   ของจริง SO-26080077-0 มี **10 บรรทัด แต่เป็น FG แค่ 2 ชนิด รวม 13 หน่วย**
   ⇒ โชว์ "10" ให้ TS คือบอกขนาดของงานผิดไปห้าเท่า

   ⚠️ "ยังไม่ผูก" เปลี่ยนนิยามจาก **"บรรทัดไม่มี term"** เป็น **"จัดสรรยังไม่ครบจำนวน"**
      (mig 0312 ปลด UNIQUE ของบรรทัดแล้ว — บรรทัดเดียวลงได้หลายโซน) */
export function bindQueue({ orders = [], lines = [], terms = [], projectsById, dealsById } = {}) {
  const allocated = allocatedByLine(terms);
  const linesByOrder = new Map();
  for (const line of lines) {
    const list = linesByOrder.get(line.salesOrderId) || [];
    list.push(line);
    linesByOrder.set(line.salesOrderId, list);
  }

  const rows = [];
  const unknownLine = [];
  for (const order of orders) {
    if (!orderReceivable(order)) continue;
    const pending = (linesByOrder.get(order.id) || []).filter((l) => lineNeedsAllocation(l, allocated));
    if (!pending.length) continue;
    const fg = fgSummary(pending, allocated);

    const line = orderBusinessLine(order, { projectsById, dealsById });
    const row = {
      orderId: order.id,
      // ⚠️ ใบสั่งขายใช้ `orderNumber` ไม่ใช่ `code` — ต่างจาก entity อื่นในระบบ
      code: order.orderNumber || order.id,
      customerId: order.customerId || null,
      customerName: order.customerName || null,
      projectId: order.projectId || null,
      approvedAt: order.approvedAt || null,
      orderDate: order.orderDate || null,
      line,
      /* ⚠️ เก็บ `pendingLines` ไว้เพื่อความเข้ากันได้ของผู้เรียกเดิม แต่ **จอไม่ควรโชว์** —
         ตัวเลขที่บอกขนาดงานจริงคือ fgKinds/remainingQty */
      pendingLines: pending.length,
      fgKinds: fg.length,
      remainingQty: fg.reduce((sum, g) => sum + g.remaining, 0),
      fg,
      lines: pending,
    };
    if (line === 'SERVICE') rows.push(row);
    else if (!line) unknownLine.push(row);
    // สาย PRODUCT ไม่เข้าคิวนี้เลย — ของส่งออกจากบริษัทแล้วจบ ไม่มีอะไรให้ไปดูแล
  }

  const byNewest = (a, b) => String(b.approvedAt || b.orderDate || '').localeCompare(String(a.approvedAt || a.orderDate || ''));
  return { rows: rows.sort(byNewest), unknownLine: unknownLine.sort(byNewest) };
}

/* ── ถังที่ 2: โซนที่ขายแล้วแต่ไซต์ยังไม่มีรอบ ──────────────────────────
   ⚠️ รอบ (service_plans) ผูกกับ **ไซต์** ไม่ใช่โซน (mig 0188) — เจ้าหน้าที่เข้าไซต์ทีเดียว
   ทำทุกโซน · คิวนี้จึงเป็น "ไซต์ที่มีโซนขายแล้วแต่ไม่มีรอบ" ไม่ใช่รายโซน */
export function planQueue({ zones = [], terms = [], plans = [], sites = [], ordersById = new Map(), todayIso = businessDate() } = {}) {
  const activePlanSites = new Set(plans.filter((p) => p.isActive !== false).map((p) => p.siteId));
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const zonesById = new Map(zones.map((z) => [z.id, z]));

  const bySite = new Map();
  for (const term of terms) {
    if (!termIsActive(term, ordersById.get(term.salesOrderId), todayIso)) continue;
    const zone = zonesById.get(term.zoneId);
    if (!zone) continue;
    if (activePlanSites.has(zone.siteId)) continue;
    const row = bySite.get(zone.siteId) || {
      siteId: zone.siteId,
      site: sitesById.get(zone.siteId) || null,
      zones: [],
      terms: [],
    };
    if (!row.zones.some((z) => z.id === zone.id)) row.zones.push(zone);
    row.terms.push(term);
    bySite.set(zone.siteId, row);
  }
  return [...bySite.values()].sort((a, b) =>
    String(a.site?.name || '').localeCompare(String(b.site?.name || ''), 'th'));
}

/* ── ถังที่ 3: รอบที่เดินอยู่แต่ไม่มีนัดข้างหน้า ────────────────────────
   ⚠️ **ห้ามเขียนเงื่อนไข "นัดที่ยังมีชีวิต" ขึ้นใหม่ที่นี่** — ผู้เรียกต้องส่ง
   `isLive` ตัวเดียวกับที่ทั้งระบบใช้ (visitStatus.isLiveVisit) เข้ามา
   เข้มกว่าด่านจริง = ซ่อนงานที่ทำได้ · หลวมกว่า = ชวนกดแล้วเด้ง
   (docs/business-line-level-and-handoff.md:173-174) */
export function visitQueue({ plans = [], visits = [], sites = [], isLive, todayIso = businessDate() } = {}) {
  if (typeof isLive !== 'function') throw new Error('visitQueue ต้องรับ isLive จากตัวตัดสินกลาง');
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const aheadBySite = new Map();
  for (const visit of visits) {
    if (!isLive(visit)) continue;
    if (String(visit.scheduledDate || '') < todayIso) continue;
    aheadBySite.set(visit.siteId, (aheadBySite.get(visit.siteId) || 0) + 1);
  }

  const rows = [];
  for (const plan of plans) {
    if (plan.isActive === false) continue;
    if (plan.endDate && plan.endDate < todayIso) continue;
    if (aheadBySite.get(plan.siteId)) continue;
    rows.push({
      planId: plan.id,
      siteId: plan.siteId,
      site: sitesById.get(plan.siteId) || null,
      kind: plan.kind,
      everyDays: plan.everyDays,
      assigneeName: plan.assigneeName || null,
      startDate: plan.startDate || null,
    });
  }
  return rows.sort((a, b) => String(a.site?.name || '').localeCompare(String(b.site?.name || ''), 'th'));
}

/* จำนวนบนแท็บ — หน้าเดียวตอบ "มีอะไรค้างกี่ชิ้น" โดยไม่ต้องกดเข้าไปดู */
export function intakeCounts({ bind = { rows: [], unknownLine: [] }, plan = [], visit = [] } = {}) {
  return {
    bind: bind.rows.length,
    plan: plan.length,
    visit: visit.length,
    unknownLine: bind.unknownLine.length,
  };
}
