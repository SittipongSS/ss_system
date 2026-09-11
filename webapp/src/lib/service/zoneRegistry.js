// ── ทะเบียนพื้นที่ของลูกค้าหนึ่งราย — ตรรกะล้วน ไม่แตะ DB/HTTP (เฟส 3A · §5A) ─
//
// ⭐ **ไม่มีตารางใหม่** (แผน §5A) — ทุกอย่างที่ทะเบียนนี้ตอบ ผูกกับลูกค้าอยู่แล้ว
//   โดยโครงสร้าง: `service_sites.customerId` → `service_zones.siteId` →
//   `service_survey_zones.zoneId` (ผลวัด) และ `service_zone_terms.zoneId` (การขาย)
//   🪤 ถ้าสร้าง "ที่รวบรวม" อีกชุดตอนปิดใบ จะได้ **ความจริงชุดที่สอง** ที่ต้องคอยซิงก์
//     — โรคเดียวกับกระจกชื่อลูกค้าที่ระบบนี้เจอมาแล้วห้าตาราง
//
// ⭐ **ที่เดียวที่ประกอบทะเบียนนี้** — ใช้ทั้งแท็บบนหน้าลูกค้า (อ่านอย่างเดียว) และ
//   ฟอร์มเปิดใบประเมิน (ให้ติ๊กว่ารอบนี้วัดพื้นที่เดิมโซนไหนซ้ำ) · สองจอต้องเห็น
//   ตัวเลขชุดเดียวกัน ไม่งั้น AE เปิดแท็บเห็น 8 โซน แต่ฟอร์มให้ติ๊กได้ 6
import { REQUEST_OPEN_STATUSES } from '@/lib/requests/statuses';
import { zoneTermState } from '@/lib/service/terms';
import { spotCounts, suggestedPackages, surveyZoneSize } from '@/lib/service/survey';

/* ── ผลวัดล่าสุดของโซน ────────────────────────────────────────────────────
 * 🔑 **ประเมินซ้ำไม่ทับของเดิม** (มติข้อ 8) — โซนเดียวมีแถวผลวัดได้หลายรอบ
 *   ⇒ "ขนาดของโซนนี้" = แถวที่ใหม่ที่สุด **ไม่ใช่คอลัมน์บนโซน**
 *   (COMMENT ของ mig 0314 เขียนไว้ตรง ๆ และ index `("zoneId","createdAt" DESC)`
 *    มีไว้เพื่อคำถามนี้โดยเฉพาะ)
 * ⚠️ เรียงด้วย `surveyedAt` ก่อน แล้วค่อย `createdAt` — แถวที่เปิดไว้ก่อนแต่ไปวัดทีหลัง
 *   ต้องชนะแถวที่เปิดทีหลังแต่ยังไม่ได้ไปวัด · แถวที่ยังไม่วัดเลยแพ้เสมอ
 * ⚠️ แถว `cut` ไม่นับเป็นผลวัดล่าสุด — มันคือ "รอบนั้นตัดพื้นที่นี้ออก" ไม่ใช่การวัด
 *   (ตัดออกในใบหนึ่ง ไม่ได้แปลว่าขนาดที่เคยวัดไว้เป็นโมฆะ)
 */
export function latestSurveyRow(rows = [], { isSent = () => true } = {}) {
  /* 🔴 **นับเฉพาะแถวของใบที่ TS ส่งผลแล้ว** (แผน §5A: *"ข้อมูลใช้ได้ตั้งแต่ TS ส่งผล"*)
     🐞 ไม่กรอง = ใบใหม่ที่เพิ่งเปิดกลบตัวเลขจริงของใบเก่าได้ทันที เพราะ `surveyedAt`
       ถูกประทับซ้ำ **ทุก PATCH** รวมทั้ง PATCH ที่แค่แก้หมายเหตุโดยยังไม่ได้วัด
       ⇒ แถวเปล่าที่ `surveyedAt` ใหม่กว่า จะชนะแถวที่มีขนาดจริง แล้วทะเบียนของลูกค้า
         จะว่างลงเฉย ๆ ตอนมีคนเปิดใบประเมินรอบใหม่
     ⚠️ ไม่ได้รอ "ปิดเรื่อง" — สถานะของใบเป็นเรื่องของใบ ตัวตัดคือ `answeredAt` เท่านั้น */
  const usable = (Array.isArray(rows) ? rows : []).filter((r) => r && r.status !== 'cut' && isSent(r));
  if (!usable.length) return null;
  /* 🐞 **ห้ามต่อสองวันเป็นสตริงเดียวแล้วเทียบ** — แถวที่ยังไม่ได้วัดได้คีย์ขึ้นต้นด้วย
     ตัวคั่น ซึ่งมากกว่าตัวเลขทุกตัวใน ASCII ⇒ แถวที่ยังไม่ไปวัดชนะแถวที่วัดแล้ว
     (เจอตอนเขียนเทสต์ 06/09/2026) ⇒ เทียบทีละชั้นตรง ๆ */
  return usable.reduce((best, row) => (beats(row, best) ? row : best));
}

function beats(row, best) {
  // ชั้น 1: วัดแล้วชนะยังไม่วัดเสมอ — ใบที่เพิ่งเปิดยังไม่ใช่ "ขนาดล่าสุดของโซน"
  if (!!row.surveyedAt !== !!best.surveyedAt) return !!row.surveyedAt;
  // ชั้น 2: วัดทีหลังชนะ
  if (row.surveyedAt && row.surveyedAt !== best.surveyedAt) return row.surveyedAt > best.surveyedAt;
  // ชั้น 3: เสมอกัน (หรือยังไม่วัดทั้งคู่) ⇒ แถวที่เปิดทีหลังชนะ
  return String(row.createdAt || '') > String(best.createdAt || '');
}

/* ── โซนหนึ่งแถวบนทะเบียน ─────────────────────────────────────────────────
 * ⚠️ **สองตัวเลขแพ็คเกจ ห้ามยุบรวม** (COMMENT ของ mig 0314):
 *   `assessedPackages` = TS ประเมินว่าควรใช้เท่าไร · `soldPackages` = ลูกค้าซื้อจริงเท่าไร
 *   ซื้อน้อยกว่าที่ประเมินเป็นเรื่องปกติ และ **ส่วนต่างคือของที่ฝ่ายขายต้องเห็น**
 */
export function zoneRegistryRow(zone = {}, {
  surveys = [], terms = [], ordersById = new Map(), requestsById, todayIso,
} = {}) {
  const requestOf = (id) => (requestsById instanceof Map ? requestsById.get(id) : requestsById?.[id]);
  const latest = latestSurveyRow(surveys, {
    isSent: (row) => !!requestOf(row.requestId)?.answeredAt,
  });
  const size = surveyZoneSize(latest?.parts);
  const spots = spotCounts(latest?.spots);

  /* ขายแล้ว/ยังไม่ขาย — **ถาม `zoneTermState` ตัวเดียว** ห้ามเขียน
     `status === 'approved' && !supersededById` ซ้ำที่นี่ (กติกาหัวไฟล์ terms.js:
     "เงื่อนไขนี้ต้องอยู่ที่ไฟล์นั้นที่เดียว" — เคยมีนิยาม live 5 ชุดใน 5 ไฟล์)
     ⭐ **สามค่า ไม่ใช่สองค่า** — `ended` (เคยขาย รอบจบแล้ว) ไม่เหมือน `none`
       (ไม่เคยขายเลย) · ม็อกวาดป้ายไว้แค่สองแบบ แต่ยุบรวมแล้ว AE จะมองไม่เห็น
       ของที่ต่ออายุได้ ซึ่งเป็นงานขายคนละชนิดกับของที่ต้องเสนอครั้งแรก */
  const zoneTerms = (Array.isArray(terms) ? terms : []).filter((t) => t?.zoneId === zone.id);
  const { state, term } = zoneTermState(zone.id, zoneTerms, asMap(ordersById), todayIso);
  const orderOf = (id) => (ordersById instanceof Map ? ordersById.get(id) : ordersById?.[id]);
  const live = state === 'active' ? zoneTerms.filter((t) => t === term || sameOrder(t, term)) : [];
  const soldPackages = live.reduce((sum, t) => {
    const qty = Number(t.packageQty);
    return sum + (Number.isFinite(qty) && qty > 0 ? qty : 0);
  }, 0);

  return {
    id: zone.id,
    code: zone.code || null,
    name: zone.name || null,
    floor: zone.floor || null,
    siteId: zone.siteId || null,
    isActive: zone.isActive !== false,

    // ── ผลวัดล่าสุด (ไม่มี = ยังไม่เคยประเมิน ไม่ใช่ศูนย์) ──────────────
    surveyedAt: latest?.surveyedAt || null,
    surveyRequestId: latest?.requestId || null,
    parts: size.parts,
    areaSqm: latest ? size.areaSqm : null,
    volumeCbm: latest ? size.volumeCbm : null,
    spotsTotal: latest ? spots.total : 0,
    spotsSelected: latest ? spots.selected : 0,
    /* จุดติดตั้งที่ **ทะเบียนโซน** ถือเอง (mig 0353 · คีย์จากโมดัลเพิ่มไซต์ย้อนหลัง/แก้โซน)
       ⚠️ คนละชุดกับสองเลขบน (ผลใบประเมิน ณ วันประเมิน) — มติข้อ D: ยังไม่ซิงก์กันรอบนี้
       ⇒ จอโชว์เลขนี้เฉพาะโซนที่ไม่มีผลประเมิน (ของเก่าที่ไม่เคยประเมิน) ไม่รวมเข้ากัน */
    registeredSpots: Array.isArray(zone.spots) ? zone.spots.length : 0,
    assessedPackages: latest?.packageQty ?? null,
    // สูตรเสนอไว้เท่าไร — ไว้ให้จอเทียบกับที่หัวหน้าเคาะจริง (ไม่ใช่คำเตือน)
    suggestedPackages: latest ? suggestedPackages(size.volumeCbm) : null,
    surveyCount: (Array.isArray(surveys) ? surveys : []).filter((r) => r && r.status !== 'cut').length,

    /* 🔒 **"มีใบอื่นสั่งวัดไว้แล้ว" เป็นสถานะของตัวเอง ไม่ใช่ "ยังไม่วัด"** (ม็อก §เจ็ดกรณี)
       ยุบรวมกับ "ยังไม่วัด" เมื่อไร สองใบจะสั่งวัดโซนเดียวกันซ้อนกัน แล้วช่างไปเสียเที่ยว
       ⚠️ "เปิดอยู่" ใช้ชุดเดียวกับระบบคำร้อง (`REQUEST_OPEN_STATUSES`) ห้ามเขียนเอง */
    pendingRequest: pendingRequestOf(surveys, requestsById),

    // ── การขาย ───────────────────────────────────────────────────────────
    termState: state,                       // 'none' | 'active' | 'ended'
    sold: state === 'active',
    soldPackages: live.length ? soldPackages : null,
    /* เลขที่ใบ ไม่ใช่แค่ id — ม็อกโชว์ `SO-26040022` ใต้ป้าย "ขายแล้ว"
       และ id ดิบไม่มีความหมายกับคนอ่าน (กติกา "ห้ามถอยไปโชว์ id ดิบ") */
    salesOrders: (live.length ? live : (term ? [term] : [])).map((t) => {
      const o = orderOf(t.salesOrderId);
      return { id: t.salesOrderId, orderNumber: o?.orderNumber || null };
    }).filter((o) => o.id),
    // รอบล่าสุดจบเมื่อไร — ของที่ต่ออายุได้ต้องบอกวันหมด ไม่ใช่แค่บอกว่าจบแล้ว
    termEndDate: state === 'ended' ? (term?.endDate || null) : null,
  };
}

const asMap = (v) => (v instanceof Map ? v : new Map(Object.entries(v || {})));
// term สองแถวที่มาจากใบสั่งขายใบเดียวกัน = รอบขายเดียวกัน (ใบหนึ่งจัดสรรลงโซนได้หลายบรรทัด)
const sameOrder = (a, b) => !!a && !!b && a.salesOrderId === b.salesOrderId;

function pendingRequestOf(surveys = [], requestsById) {
  const get = (id) => (requestsById instanceof Map ? requestsById.get(id) : requestsById?.[id]);
  for (const row of Array.isArray(surveys) ? surveys : []) {
    if (!row?.requestId || row.status === 'cut') continue;
    const req = get(row.requestId);
    if (!req || !REQUEST_OPEN_STATUSES.includes(req.status)) continue;
    return { id: req.id, docNo: req.docNo || null, status: req.status, dueDate: req.committedDueDate || null };
  }
  return null;
}

/* ── ทะเบียนทั้งของลูกค้า: สถานที่ → พื้นที่ ────────────────────────────────
 * ⚠️ **สถานที่ที่ยังไม่มีพื้นที่ก็ต้องอยู่ในลิสต์** — "ลูกค้ามีสาขานี้แต่ยังไม่เคย
 *   ประเมินเลย" คือคำตอบที่ AE ต้องการพอ ๆ กับสาขาที่ประเมินแล้ว · ตัดออกเมื่อไร
 *   จอจะอ่านว่าลูกค้าไม่มีสาขานั้น
 */
export function customerZoneRegistry({
  sites = [], zones = [], surveys = [], terms = [], orders = [], requests = [], todayIso,
} = {}) {
  const ordersById = new Map((Array.isArray(orders) ? orders : []).map((o) => [o.id, o]));
  const requestsById = new Map((Array.isArray(requests) ? requests : []).map((r) => [r.id, r]));

  const surveysByZone = new Map();
  for (const row of Array.isArray(surveys) ? surveys : []) {
    if (!row?.zoneId) continue;   // ร่างที่ยังไม่ส่ง — ยังไม่มีโซนจริงให้เกาะ
    const list = surveysByZone.get(row.zoneId) || [];
    list.push(row);
    surveysByZone.set(row.zoneId, list);
  }
  const termsByZone = new Map();
  for (const term of Array.isArray(terms) ? terms : []) {
    if (!term?.zoneId) continue;
    const list = termsByZone.get(term.zoneId) || [];
    list.push(term);
    termsByZone.set(term.zoneId, list);
  }

  const zonesBySite = new Map();
  for (const zone of Array.isArray(zones) ? zones : []) {
    if (!zone?.siteId) continue;
    const list = zonesBySite.get(zone.siteId) || [];
    list.push(zoneRegistryRow(zone, {
      surveys: surveysByZone.get(zone.id) || [],
      terms: termsByZone.get(zone.id) || [],
      ordersById,
      requestsById,
      todayIso,
    }));
    zonesBySite.set(zone.siteId, list);
  }

  const rows = (Array.isArray(sites) ? sites : []).map((site) => {
    const list = zonesBySite.get(site.id) || [];
    return {
      id: site.id,
      code: site.code || null,
      name: site.name || null,
      address: site.address || null,
      routeZone: site.routeZone || null,
      isActive: site.isActive !== false,
      zones: list,
      ...registryTotals(list),
    };
  });

  return {
    sites: rows,
    ...registryTotals(rows.flatMap((s) => s.zones)),
    siteCount: rows.length,
    history: surveyHistory({ surveys, requests, zones, sites }),
  };
}

/* ── ประวัติการประเมิน — หนึ่งบรรทัดต่อหนึ่งใบ ────────────────────────────
 * ⭐ **นี่คือที่เดียวที่เห็นภาพรวมข้ามใบ** (ม็อก) — หนึ่งใบครอบหนึ่งสถานที่ ⇒ ลูกค้าที่มี
 *   5 สาขาจะมีใบประเมินอย่างน้อย 5 ใบ · หน้าลูกค้ารวมให้เห็นในจอเดียว
 * ⚠️ **นับเฉพาะแถวที่ไม่ถูกตัด** — "ใบนี้ประเมินกี่พื้นที่" ต้องตรงกับที่ส่งให้ฝ่ายขายจริง
 * ⚠️ เรียงใหม่สุดขึ้นก่อน โดยใช้ **วันที่ของใบ** ไม่ใช่วันที่วัด — ใบที่ยังไม่ได้ไปวัด
 *   ต้องอยู่บนสุด (นั่นคือใบที่ยังค้างอยู่ ซึ่งเป็นสิ่งที่คนเปิดหน้านี้อยากรู้ก่อน)
 */
export function surveyHistory({ surveys = [], requests = [], zones = [], sites = [] } = {}) {
  const zoneById = new Map((Array.isArray(zones) ? zones : []).map((z) => [z.id, z]));
  const siteById = new Map((Array.isArray(sites) ? sites : []).map((s) => [s.id, s]));

  const byRequest = new Map();
  for (const row of Array.isArray(surveys) ? surveys : []) {
    if (!row?.requestId) continue;
    const entry = byRequest.get(row.requestId)
      || { zones: 0, cut: 0, siteIds: new Set(), names: [], lastSurveyedAt: null };
    if (row.status === 'cut') entry.cut += 1; else entry.zones += 1;
    /* ⚠️ ชื่อที่ **แช่ไว้ตอนเปิดใบ** (`zoneName`) ไม่ใช่ชื่อสดของโซน — พื้นที่ถูก
       เปลี่ยนชื่อทีหลังได้ แต่ใบเก่าต้องอ่านได้ว่าตอนนั้นเรียกอะไร */
    if (row.zoneName && !entry.names.includes(row.zoneName)) entry.names.push(row.zoneName);
    const site = zoneById.get(row.zoneId)?.siteId;
    if (site) entry.siteIds.add(site);
    if (row.surveyedAt && (!entry.lastSurveyedAt || row.surveyedAt > entry.lastSurveyedAt)) {
      entry.lastSurveyedAt = row.surveyedAt;
    }
    byRequest.set(row.requestId, entry);
  }

  return (Array.isArray(requests) ? requests : [])
    .filter((r) => r && byRequest.has(r.id))
    .map((r) => {
      const e = byRequest.get(r.id);
      const siteNames = [...e.siteIds].map((id) => siteById.get(id)?.name || id).filter(Boolean);
      return {
        id: r.id,
        docNo: r.docNo || null,
        status: r.status,
        title: r.title || null,
        dealId: r.dealId || null,
        zoneCount: e.zones,
        cutCount: e.cut,
        zoneNames: e.names,
        siteNames,
        surveyedAt: e.lastSurveyedAt,
        // วันที่ที่ใช้เรียง — ใบที่ยังไม่จบใช้วันเปิด ใบที่จบแล้วใช้วันตอบ
        at: r.answeredAt || r.createdAt || null,
      };
    })
    .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
}

/* ยอดรวมของชุดโซน — ใช้ทั้งระดับสถานที่และระดับลูกค้า
   ⚠️ **ปริมาตรรวมได้ แต่แพ็คเกจรวมจากตัวที่เคาะแล้วเท่านั้น** — ห้ามเอาปริมาตรรวม
     ไปหารใหม่ กติกาปัดคือ "รอบเดียวต่อพื้นที่ ไม่ข้ามพื้นที่" (กลิ่นไม่ทะลุผนัง) */
function registryTotals(zones = []) {
  const measured = zones.filter((z) => z.surveyedAt || z.volumeCbm !== null);
  return {
    zoneCount: zones.length,
    measuredCount: measured.length,
    soldCount: zones.filter((z) => z.sold).length,
    endedCount: zones.filter((z) => z.termState === 'ended').length,
    areaSqm: round2(measured.reduce((s, z) => s + (Number(z.areaSqm) || 0), 0)),
    volumeCbm: round2(measured.reduce((s, z) => s + (Number(z.volumeCbm) || 0), 0)),
    assessedPackages: zones.reduce((s, z) => s + (Number(z.assessedPackages) || 0), 0),
    soldPackages: zones.reduce((s, z) => s + (Number(z.soldPackages) || 0), 0),
  };
}

// ทศนิยมสองตำแหน่งเท่ากับ `surveyZoneSize`/`surveyTotals` — คนละจุดปัดแล้วเลขไม่ตรงกัน
const round2 = (n) => Math.round(n * 100) / 100;
