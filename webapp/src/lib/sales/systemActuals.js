// ── ยอดขายจริงที่ระบบรู้ (systemActuals) ของ GET /api/sales-planning/history — ตัวช่วยวางเป้าเติมช่อง "ขายจริง" ──
// ยกออกจาก route.js (mig 0412 · 26/10/2026) เพื่อให้เทสต์ได้ — route.js ของ Next export ได้แค่ HTTP handler
//
// รูปผล: `{ [year]: { total, byTeam, byOwner, byTeamOwner, byMonth[12] } }`
//
// ⭐ ทีมตามดีล (มติผู้ใช้ 2026-09-14) — ยอดของทีมมาจาก `sales_deals.team` ที่ประทับบนดีล
//    ไม่ใช่ทีมในบัญชีเจ้าของ · `byTeamOwner[team][ownerId]` = ยอดของคนนั้น *ในทีมนั้น*
//    (ตัวช่วยวางเป้าใช้ถ่วงสัดส่วนคนในทีม — คนย้ายทีม/อยู่หลายทีมต้องไม่ลากยอดทีมอื่นมาด้วย)
//    · `byOwner` ยังเป็นยอดข้ามทุกทีมตามเดิม · ดีลไม่ระบุทีมไม่ลง byTeam/byTeamOwner (เหมือนเดิม)
//
// ⭐ **Actual รายเดือน** (mig 0412 · มติเจ้าของ 26/10/2026) — ยอดของดีลลงปี/เดือนตาม `actualByMonth`
//    (ใบทั้งใบ = เดือนอนุมัติใบ · ใบ "Actual รายงวด" = เดือนที่ AE Sup อนุมัติแต่ละงวด) ไม่ใช่ wonValue ทั้งก้อนที่ wonMonth
//    🪤 ตัวช่วยวางเป้า POST ยอดรายปีลง sales_history ถาวร ⇒ งวดที่อนุมัติปีหน้าห้ามถูกนับเป็นยอดปีนี้ (หรือนับซ้ำสองปี)
//    ⭐ ใบทั้งใบล้วน (ทุกดีลวันนี้): ได้ผลเท่าเดิมทุกช่อง — ดีลที่ไม่มีคีย์ = { wonMonth: wonValue } · ดีล Won ที่ Actual 0
//       ยังสร้างถังปีของ wonMonth (ยอด 0) เหมือนเดิม
//
// ⛔ **Actual ล้วน — ห้ามมียอด SO "รออนุมัติ" / กอง "รอนับรายงวด" ปน** (มติผู้ใช้ 2026-09-11 · mig 0353 · 0412)
//    ยอดที่ยังไม่มีใครอนุมัติจะถูกแช่เป็นยอดจริงถาวร และแถวนั้นทับตัวเลขระบบในรายงานผลงานขายต่อไปเรื่อย ๆ
// ⛔ ดีลของใบสั่งขายย้อนหลัง (mig 0360) ไม่ใช่ยอดขาย — ตัดที่นี่อีกชั้น (route ตัดที่ query แล้ว)
import {
  actualByMonthOf,
  isKpiDeal,
  isWonDeal,
  wonMonthOf,
} from '@/lib/sales/dashboardMetrics';

/** ส่วนของ Actual รายเดือนของดีล `[[ 'YYYY-MM', ยอด ], …]` — ไม่มีเลย = เดือน Won ยอด 0 (ถังปีเดิมยังเกิด) */
function actualPartsOf(deal) {
  const parts = Object.entries(actualByMonthOf(deal));
  if (parts.length) return parts;
  const month = wonMonthOf(deal);
  return month ? [[month, 0]] : [];
}

export function aggregateSystemActuals(deals) {
  const years = {};
  for (const d of deals || []) {
    if (!isWonDeal(d) || !isKpiDeal(d)) continue;
    for (const [mk, amt] of actualPartsOf(d)) {
      const yr = mk.slice(0, 4);
      const mi = Number(mk.slice(5, 7)) - 1;
      const y = (years[yr] ||= { total: 0, byTeam: {}, byOwner: {}, byTeamOwner: {}, byMonth: Array(12).fill(0) });
      y.total += amt;
      if (d.team) y.byTeam[d.team] = (y.byTeam[d.team] || 0) + amt;
      if (d.ownerId) y.byOwner[d.ownerId] = (y.byOwner[d.ownerId] || 0) + amt;
      if (d.team && d.ownerId) {
        const inTeam = (y.byTeamOwner[d.team] ||= {});
        inTeam[d.ownerId] = (inTeam[d.ownerId] || 0) + amt;
      }
      if (mi >= 0 && mi < 12) y.byMonth[mi] += amt;
    }
  }
  return years;
}
