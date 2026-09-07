// ── สถานะของพื้นที่เดิมบนฟอร์มเปิดใบประเมิน (เฟส 3A(ข) · ม็อก §12) ────────
//
// ⭐ **สองแกนที่ตั้งฉากกัน คูณกันได้ครบทุกช่อง** — ไม่ต้องไล่จำเป็นรายกรณี
//     แกนประเมิน: `none` (ยังไม่เคยวัด) · `pending` (มีใบอื่นสั่งวัดค้าง) · `done` (วัดแล้ว)
//     แกนขาย:     `none` (ยังไม่ขาย) · `active` (ขายอยู่) · `ended` (เคยขาย รอบจบแล้ว)
//
// ⚠️ **แกนประเมินมีสามค่า ไม่ใช่สองค่า** — "มีใบอื่นสั่งวัดไว้แล้ว" เป็นสถานะของตัวเอง
//   ยุบรวมกับ "ยังไม่วัด" เมื่อไร สองใบจะสั่งวัดพื้นที่เดียวกันซ้อนกัน แล้วช่างไปสองรอบ
//
// 🔴 **โชว์พื้นที่เดิมทั้งหมด แต่ไม่ติ๊กให้** (ม็อก §12) — ไม่โชว์ = คนพิมพ์ชื่อซ้ำแล้วชน
//   `UNIQUE (siteId, ชื่อ)` ของ mig 0297 · ติ๊กให้ = สั่งช่างไปเสียเที่ยว
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';

/* ⭐ **กรณี ④ ต้องอยู่บนสุด** — "วัดแล้วยังไม่ขาย" คือของที่จ่ายค่าแรงไปแล้วแต่ยังไม่ได้เงิน
     ⇒ ชูขึ้นก่อนใครทั้งบนฟอร์มและบนหน้าลูกค้า (แผน §5A · ม็อก §12)
   ⚠️ ที่ล็อกอยู่ล่างสุด ไม่ใช่ซ่อน — คนต้องเห็นว่าทำไมถึงติ๊กไม่ได้ */
const ORDER = { hot: 0, debt: 1, plain: 2, locked: 3 };

/**
 * สถานะของพื้นที่เดิมหนึ่งรายการ — คืนของที่จอต้องใช้ครบในตัวเดียว
 *
 * @param zone       แถวจากทะเบียนพื้นที่ (`zoneRegistryRow`)
 * @param pickedIds  id ที่ติ๊กไว้แล้วในใบที่กำลังกรอก
 */
export function zonePickState(zone = {}, pickedIds = new Set()) {
  const picked = pickedIds instanceof Set ? pickedIds.has(zone.id) : !!pickedIds?.[zone.id];
  const surveyState = zone.pendingRequest ? 'pending' : (zone.surveyedAt ? 'done' : 'none');
  const soldState = zone.termState || 'none';

  /* 🔒 มีใบอื่นสั่งวัดค้าง = ติ๊กไม่ได้ · **ต้องบอกเลขใบและวันนัด** ไม่ใช่ปุ่มจางเปล่า ๆ
     (กติกา GatedAction ของรีโป: ติดด่าน = โชว์แล้วบอกเหตุ) */
  if (surveyState === 'pending') {
    return {
      ...base(zone, { picked, surveyState, soldState }),
      kind: 'locked', locked: true,
      reason: `มีใบสั่งวัดค้างอยู่แล้ว ${zone.pendingRequest.docNo || ''}`.trim()
        + (zone.pendingRequest.dueDate ? ` · นัด ${zone.pendingRequest.dueDate}` : ''),
      sort: ORDER.locked,
    };
  }

  // ⭐ กรณี ④ — วัดแล้วยังไม่ขาย · มีตัวเลขครบ เสนอราคาได้โดยไม่ต้องกลับไปวัดใหม่
  if (surveyState === 'done' && soldState === 'none') {
    return {
      ...base(zone, { picked, surveyState, soldState }),
      kind: 'hot', locked: false,
      reason: 'วัดแล้วยังไม่ขาย — เสนอราคาได้เลย ไม่ต้องไปวัดใหม่',
      sort: ORDER.hot,
    };
  }

  /* 🔴 กรณี ⑥ — ขายแล้วแต่ไม่เคยวัด · ของนำเข้าชุดเก่าหรือขายด้วยตาเปล่า
     **ไม่ใช่ error แต่เป็นหนี้ข้อมูล** ⇒ ชวนไปวัดเก็บ ไม่ใช่ห้าม */
  if (surveyState === 'none' && soldState !== 'none') {
    return {
      ...base(zone, { picked, surveyState, soldState }),
      kind: 'debt', locked: false,
      reason: 'ขายแล้วแต่ไม่เคยวัด — วัดเก็บไว้ได้ในรอบนี้',
      sort: ORDER.debt,
    };
  }

  return {
    ...base(zone, { picked, surveyState, soldState }),
    kind: 'plain', locked: false,
    reason: reasonOf(surveyState, soldState, zone),
    sort: ORDER.plain,
  };
}

function base(zone, { picked, surveyState, soldState }) {
  return {
    id: zone.id,
    name: zone.name,
    code: zone.code || null,
    floor: zone.floor || null,
    picked,
    surveyState,
    soldState,
    surveyedAt: zone.surveyedAt || null,
    areaSqm: zone.areaSqm ?? null,
    assessedPackages: zone.assessedPackages ?? null,
    surveyCount: zone.surveyCount || 0,
  };
}

function reasonOf(surveyState, soldState, zone) {
  if (surveyState === 'done' && soldState === 'active') {
    return zone.surveyCount > 1 ? `มีเครื่องอยู่ · วัดมาแล้ว ${zone.surveyCount} รอบ` : 'มีเครื่องอยู่';
  }
  if (surveyState === 'done' && soldState === 'ended') return 'เคยขาย รอบจบแล้ว — วัดซ้ำเพื่อต่ออายุได้';
  return 'ยังไม่เคยวัด';
}

/** รายการพื้นที่เดิมของไซต์หนึ่ง เรียงตามความสำคัญที่ม็อกกำหนด */
export function zonePickList(zones = [], pickedIds = new Set()) {
  return (Array.isArray(zones) ? zones : [])
    .map((z) => zonePickState(z, pickedIds))
    .sort((a, b) => a.sort - b.sort || String(a.name || '').localeCompare(String(b.name || ''), 'th'));
}

/* ── สรุประดับสถานที่ — บรรทัดใต้ไทล์สถานที่ ("4 พื้นที่ · วัดแล้ว 2 · ขายแล้ว 1") ── */
export function sitePickSummary(site = {}) {
  const zones = site.zones || [];
  return {
    zones: zones.length,
    measured: zones.filter((z) => z.surveyedAt).length,
    sold: zones.filter((z) => z.termState === 'active').length,
    pending: zones.filter((z) => z.pendingRequest).length,
  };
}

/* ══ ยามฝั่ง server ══════════════════════════════════════════════════════
 * 🔴 **ล็อกบนจออย่างเดียวไม่พอ** (ม็อก §12 เขียนกำกับไว้ตรง ๆ) — ระหว่างที่ SA กรอกอยู่
 *   อีกคนเปิดใบสั่งวัดพื้นที่เดียวกันไปแล้วได้ · จอที่โหลดไว้ก่อนหน้าไม่มีทางรู้
 *   ⇒ ต้องตรวจซ้ำตอนกดส่ง มิฉะนั้นช่างจะได้ใบสั่งวัดพื้นที่เดียวกันสองใบ
 *
 * @param zones      พื้นที่ที่ใบนี้ขอ (หลัง normalize — แถวโซนเดิมมี `zoneId`)
 * @param openRows   แถว `service_survey_zones` ของ **ใบที่ยังเปิดอยู่** ที่แตะโซนเหล่านี้
 * @param requestsById  ใบแม่ของแถวเหล่านั้น
 *
 * ⭐ **การตัดสินอยู่ที่ `busySurveyRequests` · ถ้อยคำอยู่ที่ผู้เรียก** — ฟอร์มของ SA พูดว่า
 *   "พื้นที่รายการที่ 3" (เขามีลิสต์อยู่ตรงหน้า) ส่วนช่างที่เพิ่มพื้นที่ทีละอันหน้างาน
 *   ต้องได้ยินชื่อพื้นที่ ไม่ใช่เลขรายการที่ไม่มีอยู่บนจอเขา
 */
export function busySurveyRequests(openRows = [], requestsById = new Map()) {
  const get = (id) => (requestsById instanceof Map ? requestsById.get(id) : requestsById?.[id]);
  const busy = new Map();
  for (const row of Array.isArray(openRows) ? openRows : []) {
    if (!row?.zoneId || row.status === 'cut') continue;
    const req = get(row.requestId);
    if (!req || !REQUEST_OPEN_STATUSES.includes(req.status)) continue;
    if (!busy.has(row.zoneId)) busy.set(row.zoneId, req);
  }
  return busy;
}

export function surveyZoneBusyError(zones = [], openRows = [], requestsById = new Map()) {
  const busy = busySurveyRequests(openRows, requestsById);

  for (const [index, zone] of (Array.isArray(zones) ? zones : []).entries()) {
    if (!zone?.zoneId) continue;
    const req = busy.get(zone.zoneId);
    if (!req) continue;
    return `พื้นที่รายการที่ ${index + 1}: มีใบสั่งวัดค้างอยู่แล้ว ${req.docNo || req.id}`
      + ' — รอใบนั้นจบก่อน หรือเอารายการนี้ออก';
  }
  return null;
}
