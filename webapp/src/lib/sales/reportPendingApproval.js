import { currentMonth } from '@/lib/datePeriods';
import { isWonDeal } from '@/lib/sales/dashboardMetrics';
import { salesOrderAmountKind, salesOrderPendingApprovalAmount } from '@/lib/sales/salesOrderWorkflow';

/* ── ยอด SO "รออนุมัติ" ของรายงานยอดขาย (/sa/targets/report) ─────────────────
 * มติผู้ใช้ 2026-09-11 (mig 0353): โชว์ยอดของใบสั่งขายที่ยื่นแล้วรออนุมัติด้วย
 * แต่ **แยกให้เห็นว่าไม่ใช่ขายจริง** — ดูมติทั้งชุดที่ docs/so-pending-approval-amount.md
 *
 * ⭐ ทำไมต้องมีตัวคิดของตัวเอง: รายงานนี้ **ไม่อ่าน cache บนดีล** (ถามแถว sales_orders
 *    ตรง ๆ — ดูหัว api/sales-planning/report/route.js) ⇒ ต้องคิดจากแถวด้วยกติกาเดียวกับ
 *    cache (sync_sales_order_actual) และแดชบอร์ด (pendingApprovalAmountOf) ทุกตัวอักษร:
 *    - นับเฉพาะ status = 'pending_approval' · ยอด = actualAmount (ก่อน VAT) ไม่ใช่ totalAmount
 *    - นับเฉพาะใบบนดีล Won (ดีลที่ยังเปิดมี FC อยู่ใน FC คงเหลือแล้ว)
 *    - เดือนของยอด = **เดือนปัจจุบันตามเวลาไทยเสมอ** (อนุมัติย้อนหลังไม่ได้ ถ้าอนุมัติวันนี้
 *      ขายจริงก็ลงเดือนนี้) ⇒ ช่วงที่ไม่มีเดือนนี้ = ไม่มียอดรออนุมัติเลย
 *      🪤 ห้ามใช้ `orderMonth` ของ route: approvedAt ว่าง → ถอยไป orderDate = เดือนที่ร่างใบ
 *         ซึ่งอาจเป็นเดือนที่ปิดไปแล้ว — เดือนที่ยอดนี้ไม่มีวันไปลงจริง
 *    - ของใคร = **เจ้าของดีลปัจจุบัน** — sales_orders."ownerId" ว่างจนกว่าจะอนุมัติ (mig 0294)
 *      และใบที่ถูกย้อนอนุมัติแล้วยื่นใหม่อาจมี ownerId ค้างของรอบก่อน ⇒ ห้ามอ่านจากใบเด็ดขาด
 *      ทีม = ทีมในบัญชีปัจจุบันของเจ้าของ (กติกาเดียวกับใบอนุมัติแล้วใน route)
 *      ⇒ ถ้าอนุมัติวันนี้ ยอดจะลงแถวคน/ทีมเดียวกับที่โชว์รออนุมัติไว้พอดี
 *      ดีลที่ไม่มีเจ้าของ = เข้ายอดบริษัทอย่างเดียว (เหมือนใบอนุมัติแล้วที่ไม่มีเจ้าของ)
 *
 * ⛔ คืนเป็นก้อนแยกเสมอ — ห้ามปนเข้า actual[] · orders[] · splitIdx · ทบยอด · % · ส่วนต่าง ·
 *    แถบเตือนยอดบริษัทไม่ตรงกับผลรวมรายคน (ยอดบริษัทรวมใบที่ดีลไม่มีเจ้าของ จึงไม่เท่ากันได้)
 * ⚠️ ชื่อช่องเลี่ยงคำว่า pending เปล่า ๆ — หน้านี้มี financeStatus 'pending' (รอบัญชีตรวจ) อยู่แล้ว
 */

const money = (v) => Number(v || 0);

const emptyPendingApproval = () => ({
  month: null,
  amount: 0,
  count: 0,
  byOwner: [],
  byTeam: [],
  unassigned: { amount: 0, count: 0 },
  orders: [],
});

const compareText = (a, b) => String(a || '').localeCompare(String(b || ''), 'th');

/**
 * ยอดรออนุมัติของช่วงรายงาน
 *
 * @param orders แถว sales_orders (กรองสถานะซ้ำให้ — ส่งใบสถานะอื่นมาปนก็ไม่นับ)
 * @param deals  แถว sales_deals ของใบเหล่านั้น: id, stage, ownerId, ownerName
 * @param months แกนเดือนของรายงาน ['YYYY-MM', …]
 * @param person (userId) → { name, team } | null — บัญชีปัจจุบัน (loadUserDirectory)
 * @param now    นาฬิกาตอนอ่าน — เดือนของยอดมาจากตรงนี้ ไม่ใช่จากคอลัมน์ใดของใบ
 * @returns { month, amount, count, byOwner[], byTeam[], unassigned, orders[] }
 *          month = null เมื่อช่วงไม่มีเดือนปัจจุบัน (ทุกยอดเป็น 0 · ลิสต์ว่าง)
 */
export function reportPendingApproval({
  orders = [],
  deals = [],
  months = [],
  person = () => null,
  now = new Date(),
} = {}) {
  const month = currentMonth(now);
  const out = emptyPendingApproval();
  if (!(months || []).includes(month)) return out;
  out.month = month;

  const dealById = new Map((deals || []).filter(Boolean).map((deal) => [deal.id, deal]));
  const owners = new Map();
  const teams = new Map();

  for (const order of orders || []) {
    if (salesOrderAmountKind(order) !== 'pending_approval') continue;
    const deal = dealById.get(order.dealId);
    if (!isWonDeal(deal)) continue;

    const amount = salesOrderPendingApprovalAmount(order);
    const ownerId = deal.ownerId || null;
    const account = ownerId ? person(ownerId) : null;
    const ownerName = ownerId ? (account?.name || deal.ownerName || ownerId) : (deal.ownerName || null);
    const team = ownerId ? (account?.team || null) : null;

    out.amount += amount;
    out.count += 1;

    if (ownerId) {
      if (!owners.has(ownerId)) owners.set(ownerId, { ownerId, ownerName, team, amount: 0, count: 0 });
      const row = owners.get(ownerId);
      row.amount += amount;
      row.count += 1;
      if (team) {
        if (!teams.has(team)) teams.set(team, { team, amount: 0, count: 0 });
        const teamRow = teams.get(team);
        teamRow.amount += amount;
        teamRow.count += 1;
      }
    } else {
      out.unassigned.amount += amount;
      out.unassigned.count += 1;
    }

    out.orders.push({
      id: order.id,
      orderNumber: order.orderNumber,
      quoteNumber: order.metadata?.quoteNumber || null,
      quotationId: order.quotationId || null,
      dealId: order.dealId,
      customerId: order.customerId || null,
      customerName: order.customerName || null,
      ownerId,
      ownerName,
      team,
      submittedAt: order.submittedAt || null,
      // ยอดที่โชว์ = actualAmount (ก่อน VAT) ตัวเดียวกับที่จะนับเป็นขายจริงเมื่ออนุมัติ
      amount,
      vatAmount: money(order.vatAmount),
      totalAmount: money(order.totalAmount),
    });
  }

  // มากไปน้อย แล้วตัดสินด้วยชื่อ — เรนเดอร์ซ้ำได้ลำดับเดิมเสมอ
  out.byOwner = [...owners.values()]
    .sort((a, b) => b.amount - a.amount || compareText(a.ownerName, b.ownerName));
  out.byTeam = [...teams.values()]
    .sort((a, b) => b.amount - a.amount || compareText(a.team, b.team));
  // ใบที่รอนานสุดขึ้นก่อน — ใบที่ไม่มีวันยื่น (ข้อมูลเก่า) ไปท้าย
  out.orders.sort((a, b) => {
    if (a.submittedAt !== b.submittedAt) {
      if (!a.submittedAt) return 1;
      if (!b.submittedAt) return -1;
      return a.submittedAt < b.submittedAt ? -1 : 1;
    }
    return compareText(a.orderNumber, b.orderNumber);
  });
  return out;
}

/** กุญแจของแถวในตารางรายทีม/รายคน — ตัวเดียวกับที่ใช้จับยอดรออนุมัติเข้าแถว */
export const pendingApprovalRowKey = (kind, row) => (kind === 'team' ? row?.team : row?.ownerId) || null;

/**
 * จับยอดรออนุมัติเข้าแถวของตารางรายทีม/รายคน
 *
 * @returns byKey — กุญแจแถว → { amount, count } (อ่านด้วย pendingApprovalRowKey)
 *          extra — กลุ่มที่มีแต่ยอดรออนุมัติ ไม่มีแถวเป้า/ขายจริงในรายงาน ⇒ ต้องเติมแถวให้
 *                  ไม่งั้นยอดของคนนั้นหายจากตาราง และแถวรวมบวกไม่ตรงกับแถวที่เห็น
 */
export function matchPendingApprovalRows(pendingApproval, rows, kind) {
  const groups = (kind === 'team' ? pendingApproval?.byTeam : pendingApproval?.byOwner) || [];
  const byKey = new Map(groups.map((group) => [pendingApprovalRowKey(kind, group), group]));
  const listed = new Set((rows || []).map((row) => pendingApprovalRowKey(kind, row)));
  return {
    byKey,
    extra: groups.filter((group) => !listed.has(pendingApprovalRowKey(kind, group))),
  };
}
