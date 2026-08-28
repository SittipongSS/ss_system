// ── ภาระของช่าง นับเป็น "ของที่ต้องทำ" ไม่ใช่ "จำนวนนัด" (F-6) ────────────
//
// ⭐ **ที่มา** (docs/service-field-operations.md ตัวเลขจากชีตจริง): นัดหนึ่งใบไม่ได้
//   เท่ากับงานหนึ่งชิ้น — ไซต์หนึ่งมีเครื่อง 1 ตัว อีกไซต์มี 12 ตัว · "วันนี้ 5 นัด"
//   จึงบอกอะไรไม่ได้เลยว่าช่างคนนั้นทำไหวไหม
//   ⇒ นับ **เครื่อง** (แรงงานที่ต้องลงมือ) คู่กับ **แพ็ค** (ของที่ต้องขนไป)
//
// ⚠️ **สองหน่วยคู่กันเสมอ ห้ามยุบเหลือตัวเดียว** — 1 แพ็คของไซต์หนึ่ง = 2 เครื่อง
//   แต่ของอีกไซต์ = 1 เครื่อง (มติสี่หน่วย) · ยุบเหลือตัวเดียวเมื่อไรก็เดาผิดทันที
//   สำหรับไซต์อีกแบบหนึ่ง
//
// ⚠️ นับจาก **เครื่องที่ยังอยู่หน้างาน** เท่านั้น — เครื่องที่ถอดออกแล้วไม่ใช่ภาระ

/* ภาระของไซต์หนึ่ง = เครื่องที่ยังใช้งาน + แพ็คตามรอบขายที่ยังมีผลของโซนในไซต์นั้น
   คืน { assets, packs } · ไซต์ที่ยังไม่มีข้อมูลคืน 0 ทั้งคู่ (ไม่ใช่เดา) */
export function siteWorkload({ siteId, assets = [], zones = [], terms = [], activeTermIds = null } = {}) {
  const liveAssets = assets.filter((a) => a.siteId === siteId && a.status !== 'removed');
  const zoneIds = new Set(zones.filter((z) => z.siteId === siteId).map((z) => z.id));

  let packs = 0;
  for (const term of terms) {
    if (!zoneIds.has(term.zoneId)) continue;
    /* ⚠️ นับเฉพาะรอบที่ยังมีผล — ผู้เรียกส่งชุด id มาให้ (ตัวตัดสินอยู่ที่ terms.js
       ที่เดียว ห้ามเทียบสถานะเองที่นี่) · ไม่ส่งมา = นับทุกแถว ซึ่งเหมาะกับจอที่
       ยังไม่ได้โหลดใบสั่งขาย แต่ต้องรู้ตัวว่ามันคือ "เพดานบน" */
    if (activeTermIds && !activeTermIds.has(term.id)) continue;
    const qty = Number(term.packageQty);
    if (Number.isFinite(qty) && qty > 0) packs += qty;
  }

  return { assets: liveAssets.length, packs };
}

/* ภาระรายคน-รายวันของตาราง — คืน Map<'assigneeId|date', {visits, assets, packs}>
   ⚠️ ใช้ `workloadOf(siteId)` ที่ผู้เรียกเตรียมมา เพื่อไม่ต้องคำนวณซ้ำต่อนัด
   (สัปดาห์หนึ่ง 40 นัด × ไซต์ 200 แห่ง = งานที่ไม่ควรทำในลูปเรนเดอร์) */
export function dayWorkload(visits = [], workloadOf = () => ({ assets: 0, packs: 0 })) {
  const map = new Map();
  for (const visit of visits) {
    const key = `${visit.assigneeId || '__unassigned__'}|${visit.scheduledDate}`;
    const row = map.get(key) || { visits: 0, assets: 0, packs: 0 };
    const load = workloadOf(visit.siteId) || { assets: 0, packs: 0 };
    row.visits += 1;
    row.assets += load.assets || 0;
    row.packs += load.packs || 0;
    map.set(key, row);
  }
  return map;
}

/* เพดานภาระต่อคนต่อวัน — **นับเครื่อง ไม่ใช่นัด**
   ⚠️ ตัวเลขนี้เป็นค่าตั้งต้นที่ยังไม่มีใครวัดจริง (ของเดิมใช้ "5 นัด/วัน" ซึ่งก็
   ไม่ได้มาจากการวัดเหมือนกัน) — เขียนไว้ที่เดียวเพื่อให้วันที่ทีมวัดจริงแล้ว
   แก้จุดเดียวจบ และให้ทุกจอเตือนด้วยเลขเดียวกัน */
export const MAX_ASSETS_PER_DAY = 12;

export function overloaded(row, { maxAssets = MAX_ASSETS_PER_DAY } = {}) {
  if (!row) return false;
  return (row.assets || 0) > maxAssets;
}

/* ข้อความภาระสำหรับช่องในกริด — "3 นัด · 11 เครื่อง · 6 แพ็ค"
   ⚠️ ไม่ตัดหน่วยที่เป็น 0 ทิ้งทั้งหมด: ถ้าไม่มีเครื่องเลยต้องอ่านออกว่า **ไม่มีข้อมูล
   เครื่อง** ไม่ใช่ "งานเบา" ⇒ ไซต์ที่ยังไม่ลงทะเบียนเครื่องจะโชว์แค่จำนวนนัด */
export function workloadText(row) {
  if (!row) return '';
  const parts = [`${row.visits} นัด`];
  if (row.assets > 0) parts.push(`${row.assets} เครื่อง`);
  if (row.packs > 0) parts.push(`${row.packs} แพ็ค`);
  return parts.join(' · ');
}
