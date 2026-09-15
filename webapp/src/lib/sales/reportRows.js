import { businessMonthKey } from '@/lib/datePeriods';
import { historyRowKey } from '@/lib/sales/historyEntry';
import { personSliceKey } from '@/lib/sales/personSlice';

/* ── แถวของรายงานยอดขาย (/sa/targets/report) — บริษัท · ทีม · รายคน ─────────────
 * ยกออกจาก api/sales-planning/report/route.js เพื่อให้เทสต์ได้ (route.js export ได้แค่ HTTP handler)
 *
 * ⭐ มติผู้ใช้ 2026-09-14 "ทีมตามดีล" — ทุกตัวเลขลงทีมที่ **ประทับบนแถวต้นทาง**
 *    - ใบอนุมัติแล้ว → sales_deals.team ของดีลของใบ (embed `deal:sales_deals(team)`)
 *    - เป้า          → sales_targets.team
 *    - ยอดกรอกมือ    → sales_history.team
 *    ⛔ ห้ามอ่านทีมจากบัญชี (ช่อง team / teams ของ loadUserDirectory) มาจัดยอด — บัญชีตอบแค่ "ใคร" (ชื่อบนจอ)
 *    ⇒ คนย้ายทีม ยอดเก่าอยู่ทีมเดิม · คนที่มียอดหลายทีมได้แถวละทีม (คีย์ personSliceKey)
 *
 * ⚠️ "ของใคร" ของใบอนุมัติแล้ว = `sales_orders."ownerId"` ที่ **แช่ไว้ตอนอนุมัติ** (mig 0292/0294)
 *    ไม่ใช่เจ้าของดีลปัจจุบัน — ไม่งั้นย้ายดีลแล้วยอดของเดือนที่จ่ายคอมไปแล้วย้ายตาม
 *    ใบที่ไม่มีเจ้าของ = ยอดบริษัทอย่างเดียว (ไม่มีแถวคน ไม่มีแถวทีม)
 *
 * ⭐ แถวทีมแบ่งใบที่มีเจ้าของครบทุกใบ: ดีลไม่ระบุทีม → แถวทีม "ไม่ระบุทีม" (team null ·
 *    คีย์ NO_TEAM_ROW_KEY) ไม่ใช่หล่นหายจากมุมรายทีมเหมือนเดิม
 *
 * 🪤 คีย์แถวคนต้องตรงกับ pendingApprovalRowKey (lib/sales/reportPendingApproval) ทุกตัวอักษร
 *    ไม่งั้นยอดรออนุมัติไปตกแถวเกิน (pendingOnly) แล้วแถวรวมนับซ้ำเงียบ ๆ
 */

const money = (v) => Number(v || 0);

/** งวดของยอด = เดือนที่หัวหน้าอนุมัติใบ ตามเวลาไทย (กติกาเดียวกับ mig 0279)
 *  ถอยไป orderDate เฉพาะแถวเก่าที่ไม่มี approvedAt */
export const reportOrderMonth = (order) => businessMonthKey(order?.approvedAt)
  || (order?.orderDate ? String(order.orderDate).slice(0, 7) : null);

/** ทีมของใบอนุมัติแล้ว = ทีมบนดีลของใบ (embed `deal:sales_deals(team)`) — ไม่ใช่ทีมในบัญชีเจ้าของ */
export const reportOrderTeam = (order) => order?.deal?.team || null;

/** คีย์แถวทีม "ไม่ระบุทีม" — 🪤 historyRowKey({ team: null }) = 'company' ใช้แทนไม่ได้ (ชนแถวบริษัท) */
export const NO_TEAM_ROW_KEY = 'team:-';

/** คีย์แถวทีม: 'team:<code>' (= historyRowKey) · ทีมว่าง = NO_TEAM_ROW_KEY */
export const reportTeamRowKey = (team) => (team ? historyRowKey({ team }) : NO_TEAM_ROW_KEY);

/** คีย์แถวคน = (ทีมที่ประทับ, ownerId) — ตัวเดียวกับ personSliceKey / historyRowKey */
export const reportPersonRowKey = ({ team = null, ownerId = null } = {}) => personSliceKey({ team: team || null, ownerId });

/**
 * สร้างแถวของรายงาน
 *
 * @param months  แกนเดือน ['YYYY-MM', …]
 * @param targets แถว sales_targets (period, team, ownerId, targetAmount)
 * @param orders  แถว sales_orders ที่อนุมัติแล้ว (approvedAt/orderDate, ownerId, ownerName,
 *                actualAmount, deal: { team }) — ใบนอกแกนเดือนถูกข้าม
 * @param history แถว sales_history (period, team, ownerId, actualAmount)
 * @param person  (userId) → { name } | null — ใช้ **ชื่อ** อย่างเดียว ห้ามใช้ทีม
 * @returns { company, teams[], people[] } ทุกแถวมี key · scope · ownerId · ownerName · team ·
 *          target[] · actual[] · history[] (history[i] = 1 เมื่อเดือนนั้นมาจากยอดกรอกมือ)
 */
export function buildReportRows({
  months = [],
  targets = [],
  orders = [],
  history = [],
  person = () => null,
} = {}) {
  const axis = months || [];
  const slot = new Map(axis.map((m, i) => [m, i]));
  const zeros = () => Array(axis.length).fill(0);
  const nameOf = (id) => person(id)?.name || null;

  const rows = new Map();   // key → { key, scope, ownerId, ownerName, team, target[], actual[], history[] }
  const rowFor = (key, seed) => {
    if (!rows.has(key)) rows.set(key, { key, ...seed, target: zeros(), actual: zeros(), history: zeros() });
    return rows.get(key);
  };
  const teamRow = (team) => rowFor(reportTeamRowKey(team), { scope: 'team', ownerId: null, ownerName: null, team: team || null });
  const ownerRow = (team, ownerId, fallbackName) => rowFor(reportPersonRowKey({ team, ownerId }), {
    scope: 'owner', ownerId, ownerName: nameOf(ownerId) || fallbackName || ownerId, team: team || null,
  });
  const companyRow = rowFor('company', { scope: 'company', ownerId: null, ownerName: null, team: null });

  /* ── เป้า ── สามระดับในตารางเดียว: บริษัท (team null) · ทีม (ownerId null) · รายคน
     ห้ามบวกรวมข้ามระดับ — เป้าระดับทีมไม่ได้เป็นผลรวมของรายคนเสมอไป
     รายคนลงแถว (sales_targets.team, คน) — คนเดียวมีเป้าสองทีมได้ (unique index 0063) = สองแถว */
  for (const t of targets || []) {
    const i = slot.get(t.period);
    if (i == null) continue;
    const amount = money(t.targetAmount);
    if (t.ownerId) ownerRow(t.team, t.ownerId).target[i] += amount;
    else if (t.team) teamRow(t.team).target[i] += amount;
    else companyRow.target[i] += amount;
  }

  /* ── ใบอนุมัติแล้ว ── แถวคน (ทีมของดีล, เจ้าของที่แช่ไว้) + แถวทีมเดียวกัน ก้อนเดียวกัน */
  for (const o of orders || []) {
    const i = slot.get(reportOrderMonth(o));
    if (i == null) continue;
    const amount = money(o.actualAmount);
    companyRow.actual[i] += amount;
    if (!o.ownerId) continue; // ใบที่ยังไม่ถูกแช่เจ้าของ (ก่อน mig 0292) — เข้ายอดบริษัทอย่างเดียว
    const team = reportOrderTeam(o);
    ownerRow(team, o.ownerId, o.ownerName).actual[i] += amount;
    teamRow(team).actual[i] += amount;
  }

  /* ยอดกรอกมือ **ทับ** ยอดจากใบของเดือนนั้น ไม่ใช่บวกเพิ่ม — และทับทีละระดับ
     (บริษัท/ทีม/คน เป็นเส้นแยกกัน ไม่ได้บวกกันขึ้นไป กติกาเดียวกับ overlayHistory)
     แถวคนของยอดกรอกมือ = (sales_history.team, คน) ตรงกับคีย์ upsert ของหน้ากรอกยอด ⇒ ทับเฉพาะทีมนั้น */
  for (const h of history || []) {
    const i = slot.get(h.period);
    if (i == null) continue;
    const row = h.ownerId ? ownerRow(h.team, h.ownerId) : (h.team ? teamRow(h.team) : companyRow);
    row.actual[i] = money(h.actualAmount);
    row.history[i] = 1;
  }

  /* 🐞 **ยอดของทีม = ผลรวมของคนในทีม** — ไม่ใช่เส้นอิสระเหมือนเป้า (UAT 2026-08-27)
     เป้าตั้งแยกสามระดับจริง แต่ *ยอดขาย* ไม่เคยมีแถวระดับทีมเลยสักแถวใน sales_history
     (ตรวจ prod: บริษัท 43 · ทีม 0 · คน 8) ⇒ ก.ค. 2026 ที่กรอกยอดรายคนไว้ครบ
     กลับโชว์ "ทุกทีมทำได้ 0%" เพราะยอดรายคนไม่เคยไหลขึ้นแถวทีม
     ⇒ เติมให้ทีมจากผลรวมสมาชิก **เว้นเดือนที่มีแถวทีมกรอกไว้เอง** (ค่าที่คนกรอกชนะ)
     สมาชิก = แถวคนที่ **ทีมบนแถว** ตรงกัน (ทีมของดีล/เป้า/ยอดกรอก) ไม่ใช่ทีมในบัญชี
     ⚠️ กติกา "ค่ามากกว่าชนะ" คงไว้ตามเดิม — เปลี่ยนเป็น "= ผลรวม" ลดยอดทีมของเดือนที่ยอดกรอกรายคน
        ต่ำกว่ายอดใบ (ต้องตรวจข้อมูล/ขอมติก่อน) */
  const teamHistory = new Set((history || [])
    .filter((h) => h.team && !h.ownerId && slot.has(h.period))
    .map((h) => `${reportTeamRowKey(h.team)}|${slot.get(h.period)}`));
  const owners = [...rows.values()].filter((r) => r.scope === 'owner');
  /* ทีมที่มีแต่ยอดรายคน (เช่นยอดกรอกมือล้วน ไม่มีใบ ไม่มีเป้าระดับทีม) ต้องมีแถวทีมด้วย
     ไม่งั้นยอดของคนกลุ่มนั้นหายจากมุมรายทีม · แถวคนที่มีแต่เป้าไม่สร้างแถวทีมศูนย์ล้วน */
  for (const r of owners) {
    if (r.actual.some((v) => v) || r.history.some((v) => v)) teamRow(r.team);
  }
  for (const row of rows.values()) {
    if (row.scope !== 'team') continue;
    const members = owners.filter((r) => (r.team || null) === (row.team || null));
    axis.forEach((_, i) => {
      if (teamHistory.has(`${row.key}|${i}`)) return;
      const fromMembers = members.reduce((sum, m) => sum + m.actual[i], 0);
      if (fromMembers > row.actual[i]) row.actual[i] = fromMembers;
    });
  }

  const all = [...rows.values()];
  return {
    company: all.find((r) => r.scope === 'company') || null,
    teams: all.filter((r) => r.scope === 'team'),
    people: all.filter((r) => r.scope === 'owner'),
  };
}
