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
import { serviceRoundsSold } from '@/lib/sales/serviceOrders';
import { coversDate, paidThrough } from '@/lib/sales/paymentCoverage';

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
/* ความพร้อมของใบสำหรับงานบริการ — ตอบสองคำถามที่ TS ถามบ่อยที่สุดตอนรับงาน:
   "ใบนี้มีสัญญายัง" กับ "จ่ายถึงเมื่อไร"
   ⚠️ **ไม่ใช่ด่าน** — ด่านจริงคือ `visitGate` ตอนนัดจะขึ้นตาราง · ที่นี่แค่บอกล่วงหน้า
      ให้ TS ทวงได้ตั้งแต่ยังไม่เสียเวลาจัดสรร */
export function orderReadiness(order, { contractsById = new Map(), installmentsByOrderId = new Map(), todayIso = businessDate() } = {}) {
  const pick = (map, key) => (map instanceof Map ? map.get(key) : map?.[key]) || null;
  const contract = order?.serviceContractId ? pick(contractsById, order.serviceContractId) : null;
  const rows = pick(installmentsByOrderId, order?.id) || [];
  return {
    contractNo: contract && contract.status === 'signed' ? (contract.contractNo || null) : null,
    hasContract: !!(contract && contract.status === 'signed'),
    paidThrough: paidThrough(rows),
    coveredToday: coversDate(rows, todayIso),
  };
}

export function bindQueue({
  orders = [], lines = [], terms = [], projectsById, dealsById,
  // ⭐ บริบทสัญญา/เงินของใบ (PR-C) — ใช้ทำชิปบอกความพร้อมบนการ์ด
  contractsById = new Map(), installmentsByOrderId = new Map(), todayIso = businessDate(),
} = {}) {
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
      /* ⭐ ขายไว้กี่รอบ (mig 0326) — TS ต้องเห็นข้อผูกพันตั้งแต่ตอนรับงาน ไม่ใช่ไปรู้
         ตอนวางรอบแล้วพบว่าความถี่ที่ตั้งไว้ให้จำนวนนัดไม่ตรงกับที่ขาย
         ⚠️ นับจาก **ทุกบรรทัดของใบ** ไม่ใช่เฉพาะบรรทัดที่ยังไม่จัดสรร — ข้อผูกพัน
         เป็นของทั้งใบ ส่วน pending เป็นแค่ "เหลืออีกเท่าไรที่ต้องลงโซน"
         ⚠️ null = ยังไม่กรอกที่ใบเสนอราคา ≠ ขายศูนย์รอบ */
      roundsSold: serviceRoundsSold(linesByOrder.get(order.id) || []),
      /* ⭐ ชิปความพร้อมของใบ (PR-C) — TS ต้องรู้ **ตั้งแต่ตอนรับงาน** ว่าใบนี้พอจัดสรร
         แล้วจะเดินต่อได้ไหม · ของเดิมเห็นแต่ขนาดงาน แล้วไปเจอด่านตอนจัดคิวทีหลัง
         ⚠️ นี่คือ *ป้ายบอกสถานะ* ไม่ใช่ด่าน — ด่านจริงอยู่ที่ `visitGate` ตอนขึ้นตาราง
            ⇒ ใบที่ยังไม่พร้อมก็ยัง **จัดสรรลงโซนได้** (งานคนละขั้นกัน) */
      readiness: orderReadiness(order, { contractsById, installmentsByOrderId, todayIso }),
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
/* ⚠️ `linesById` ไม่บังคับ — ไม่ส่งมา = แถวตอบ roundsSold: null (ยังไม่ระบุ)
   ไม่ใช่ 0 · ผู้เรียกที่มีบรรทัดอยู่แล้วส่งเข้ามาเพื่อให้จอบอก "ขายไว้กี่รอบ" ได้ */
export function planQueue({ zones = [], terms = [], plans = [], sites = [], ordersById = new Map(), linesById = new Map(), todayIso = businessDate() } = {}) {
  /* ── หน่วยของคิวนี้คือ (ไซต์, ใบสั่งขาย) ไม่ใช่ "ไซต์" ────────────────────
     🔴 **ของเดิมเป็น Set ของ `siteId`** ⇒ ไซต์ที่มีรอบของใบ A อยู่แล้ว **หลุดจากคิว
       ตลอดกาล** แม้ใบ B จะขายรอบใหม่ที่ไซต์เดิม · TS ไม่มีทางรู้ว่ามีงานใหม่เข้ามา
       เพราะคิวคือช่องทางเดียวที่บอก
     ⭐ เคสที่เจอบ่อยที่สุดไม่ใช่ "ขายเพิ่ม" แต่คือ **ออก Rev.** — ใบเก่าได้
       `supersededById` ใบใหม่ได้ id ใหม่ แต่ **ไม่มีโค้ดไหนย้าย `service_plans.
       salesOrderId` ไปใบใหม่เลยทั้งระบบ** ⇒ รอบชี้ใบที่ตายแล้วตลอดไป
       ⇒ พอคีย์เป็นคู่ (ไซต์, ใบ) เคสนี้แก้ตัวเอง: term ของใบเก่าตกไปด้วย
         `termIsActive` อยู่แล้ว ส่วนใบใหม่ไม่มีรอบของตัวเอง ⇒ เข้าคิวตามที่ควร
     ⚠️ **รอบที่ `salesOrderId` เป็น null ไม่ครอบใบไหนเลย** — แต่มันเดินอยู่จริงที่
       ไซต์นั้น ⇒ ถ้าเงียบไว้ TS จะกดสร้างรอบใบที่สองทับของเดิม · แถวจึงพก
       `unboundPlans` ไปบอกเอง (กติกาเดียวกับ `hasForeignPlan` ของ #1594) */
  const livePlans = plans.filter((p) => p.isActive !== false);
  const coveredPairs = new Set(
    livePlans.filter((p) => p.salesOrderId).map((p) => `${p.siteId}\u0000${p.salesOrderId}`),
  );
  const unboundBySite = new Map();
  for (const plan of livePlans) {
    if (plan.salesOrderId) continue;
    unboundBySite.set(plan.siteId, (unboundBySite.get(plan.siteId) || 0) + 1);
  }
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  const zonesById = new Map(zones.map((z) => [z.id, z]));

  const bySite = new Map();
  for (const term of terms) {
    if (!termIsActive(term, ordersById.get(term.salesOrderId), todayIso)) continue;
    const zone = zonesById.get(term.zoneId);
    if (!zone) continue;
    if (coveredPairs.has(`${zone.siteId}\u0000${term.salesOrderId}`)) continue;
    const key = `${zone.siteId}\u0000${term.salesOrderId}`;
    const order = ordersById.get(term.salesOrderId) || null;
    const row = bySite.get(key) || {
      /* ⚠️ `key` ต้องมาด้วย — จอใช้ `row.siteId` เป็น React key มาตลอด ซึ่งซ้ำทันที
         ที่ไซต์เดียวมีสองใบ (แถวจะกระพริบ/สลับค่ากันเวลา re-render) */
      key,
      siteId: zone.siteId,
      site: sitesById.get(zone.siteId) || null,
      salesOrderId: term.salesOrderId || null,
      orderNumber: order?.orderNumber || null,
      unboundPlans: unboundBySite.get(zone.siteId) || 0,
      zones: [],
      terms: [],
    };
    if (!row.zones.some((z) => z.id === zone.id)) row.zones.push(zone);
    row.terms.push(term);
    bySite.set(key, row);
  }
  /* ขายไว้กี่รอบของไซต์ = ผลรวมของบรรทัดที่ term ของไซต์นั้นชี้อยู่
     ⚠️ อ่านสดจากบรรทัด ไม่ก๊อปเป็น snapshot ที่ term — จำนวนรอบแก้ได้ทางเดียวคือ
     ออก Rev. ที่ใบเสนอราคา ซึ่งได้ใบสั่งขายใบใหม่ + term ชุดใหม่อยู่แล้ว */
  for (const row of bySite.values()) {
    row.roundsSold = serviceRoundsSold(
      row.terms.map((t) => linesById.get(t.salesOrderLineId)).filter(Boolean),
    );
  }
  /* ⚠️ เรียงด้วยชื่อไซต์อย่างเดียวไม่พออีกแล้ว — ไซต์เดียวหลายใบจะสลับที่กันทุกครั้ง
     ที่โหลดใหม่ (ลำดับของ Map ตามลำดับที่ term เข้ามา) ⇒ ต่อท้ายด้วยเลขที่ใบ */
  return [...bySite.values()].sort((a, b) =>
    String(a.site?.name || '').localeCompare(String(b.site?.name || ''), 'th')
    || String(a.orderNumber || a.salesOrderId || '').localeCompare(String(b.orderNumber || b.salesOrderId || '')));
}

/* ── ถังที่ 3: รอบที่เดินอยู่แต่ไม่มีนัดข้างหน้า ────────────────────────
   ⚠️ **ห้ามเขียนเงื่อนไข "นัดที่ยังมีชีวิต" ขึ้นใหม่ที่นี่** — ผู้เรียกต้องส่ง
   `isLive` ตัวเดียวกับที่ทั้งระบบใช้ (visitStatus.isLiveVisit) เข้ามา
   เข้มกว่าด่านจริง = ซ่อนงานที่ทำได้ · หลวมกว่า = ชวนกดแล้วเด้ง
   (docs/business-line-level-and-handoff.md:173-174) */
export function visitQueue({ plans = [], visits = [], sites = [], ordersById = new Map(), isLive, todayIso = businessDate() } = {}) {
  if (typeof isLive !== 'function') throw new Error('visitQueue ต้องรับ isLive จากตัวตัดสินกลาง');
  const sitesById = new Map(sites.map((s) => [s.id, s]));
  /* ── "มีนัดข้างหน้าแล้ว" ต้องถามราย **รอบ** ไม่ใช่ราย **ไซต์** ─────────────
     🔴 ของเดิมนับเป็น `aheadBySite` ⇒ นัดของรอบ A ทำให้รอบ B ที่ไซต์เดียวกัน
       ถูกถือว่า "มีนัดครอบแล้ว" ทั้งที่ยังไม่มีใครนัดให้เลย · รอบ B เงียบหายจากคิว
     ⚠️ นัดที่ `planId` ว่าง (งานซ่อมนอกรอบ) ไม่ครอบรอบไหนทั้งนั้น — มันไม่ได้เกิด
       จากรอบ และไม่นับเป็นรอบตามข้อผูกพันด้วย (เกณฑ์เดียวกับตัวนับ n/N) */
  const aheadByPlan = new Map();
  for (const visit of visits) {
    if (!isLive(visit)) continue;
    if (!visit.planId) continue;
    if (String(visit.scheduledDate || '') < todayIso) continue;
    aheadByPlan.set(visit.planId, (aheadByPlan.get(visit.planId) || 0) + 1);
  }

  const rows = [];
  for (const plan of plans) {
    if (plan.isActive === false) continue;
    if (plan.endDate && plan.endDate < todayIso) continue;
    if (aheadByPlan.get(plan.id)) continue;
    rows.push({
      planId: plan.id,
      siteId: plan.siteId,
      site: sitesById.get(plan.siteId) || null,
      kind: plan.kind,
      everyDays: plan.everyDays,
      assigneeName: plan.assigneeName || null,
      startDate: plan.startDate || null,
      /* ⚠️ ไซต์เดียวโผล่ได้หลายแถวแล้ว ⇒ จอต้องมีอะไรแยกแถวออกจากกัน
         (ชนิดงาน · ใบสั่งขาย) ไม่งั้นสองแถวพิมพ์ข้อความเหมือนกันเป๊ะ */
      salesOrderId: plan.salesOrderId || null,
      salesOrderNumber: ordersById.get(plan.salesOrderId)?.orderNumber || null,
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
