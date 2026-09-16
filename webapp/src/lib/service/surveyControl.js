// ── สิ่งที่การ์ดควบคุมและหัวพื้นที่ต้องวาด — ตัวตัดสินล้วน (PR2 ของการรื้อจอประเมิน) ──
//
// ⭐ **ทำไมแยกไฟล์จาก `survey.js`** — `survey.js` คือ *กฎของงาน* (ด่านหกข้อ · ล็อกหลังส่ง ·
//   สูตรแพ็คเกจ) ที่ทั้งจอและ server ถามร่วมกัน · ไฟล์นี้คือ *การประกอบคำตอบให้จอเดียว*
//   (สถานะ · โทน · เหตุผลที่กดส่งไม่ได้ · ค่าเปิด/ปิดของพื้นที่) ⇒ กฎอยู่บ้านเดิมบ้านเดียว
//   ไฟล์นี้ **ไม่ประกาศกฎใหม่เลย** มันถามตัวเดิมทั้งหมด (`surveySendError` · `surveyRecallError`
//   · `surveyGateChecklist` · `surveyEditLockError`) แล้วจัดเป็นของที่การ์ดวางได้
//   🔴 กฎใหม่ของใบประเมินให้เขียนที่ `survey.js` เสมอ — เขียนที่นี่เมื่อไรจะได้กฎสองชุด
//      ที่ server มองไม่เห็นชุดหนึ่ง (บทเรียนเดิมของ `lib/requests/stages.js`)
//
// 🔑 **บริสุทธิ์ทั้งไฟล์** — ไม่ยิง I/O และ **ไม่อ่านนาฬิกา** · "วันนี้" รับมาทาง `today`
//   (กติกา thai-time ของระบบ: วันต้องมาจาก `businessDate()` ของผู้เรียก ไม่ใช่ `new Date()`
//   ที่นี่ ซึ่งจะเป็นนาฬิกาเครื่องผู้ใช้เมื่อถูกเรียกบนจอ)
//
// ⚠️ **"อ่านไม่สำเร็จ" ต้องไม่กลายเป็น "ไม่มี"** (กติกา supabase-never-throws) — ชิ้นที่
//   อ่านพลาดมาทาง `unknown` แล้วกลายเป็นข้อความ "ไม่ทราบ" บนจอ ไม่ใช่ขีดหรือศูนย์
import { fmtDateTime, fmtNumber } from '@/lib/format';
import { requestRailSteps } from '@/lib/requests/requestRail';
import {
  SURVEY_GATES,
  spotCounts,
  suggestedPackages,
  surveyDocCounts,
  surveyEditLockError,
  surveyFieldMissing,
  surveyFieldProgress,
  surveyGateChecklist,
  surveyRecallError,
  surveySendError,
  surveyTotals,
  surveyZoneSize,
} from '@/lib/service/survey';

/** ค่าที่จอต้องเขียนเมื่ออ่านข้อมูลชิ้นนั้นไม่สำเร็จ — ไม่ใช่ขีด ไม่ใช่ 0 */
export const SURVEY_UNKNOWN_TEXT = 'ไม่ทราบ';

/** ป้ายของชิ้นที่อ่านได้/อ่านไม่ได้ — ใช้เขียนกล่องแจ้ง "อ่านไม่สำเร็จ" ให้บอกว่าชิ้นไหน */
export const SURVEY_UNKNOWN_LABELS = {
  site: 'ข้อมูลไซต์',
  zoneCodes: 'รหัสพื้นที่ (ZN)',
  customer: 'รหัสลูกค้า (AR)',
  recall: 'ประวัติการดึงผลกลับ',
  visit: 'นัดสำรวจ',
};

const isCut = (row) => (row?.status || 'ok') === 'cut';
const activeZones = (rows) => (Array.isArray(rows) ? rows : []).filter((r) => !isCut(r));
const zoneName = (row) => String(row?.zoneName || '').trim() || 'พื้นที่ไม่มีชื่อ';

/**
 * ชื่อพื้นที่ต่อกันในที่แคบ — เกิน 3 ชื่อแล้วยุบเป็น "อีก n"
 * ⚠️ รางขวากว้าง 330px · สิบชื่อในบรรทัดเดียวคือบรรทัดที่ไม่มีใครอ่าน และดันการ์ดล้นจอ
 */
export function surveyNameList(names = [], max = 3) {
  const list = (Array.isArray(names) ? names : []).filter(Boolean).map(String);
  if (list.length <= max) return list.join(' · ');
  return `${list.slice(0, max).join(' · ')} อีก ${list.length - max}`;
}

/** "2 พื้นที่ · 88 ตร.ม. · 3 แพ็คเกจ" — ยอดที่ฝ่ายขายถือไปแล้วตอนดึงกลับ
 *  ⚠️ ไม่มี totals ในแถว (แถวเก่าก่อนมี meta) = "ไม่ทราบ" ไม่ใช่ศูนย์ */
export function surveyTotalsText(totals) {
  if (!totals) return SURVEY_UNKNOWN_TEXT;
  const zones = Number(totals.zones);
  const area = Number(totals.areaSqm);
  const pkg = Number(totals.packageQty);
  const parts = [];
  if (Number.isFinite(zones)) parts.push(`${fmtNumber(zones)} พื้นที่`);
  if (Number.isFinite(area)) parts.push(`${fmtNumber(area)} ตร.ม.`);
  if (Number.isFinite(pkg)) parts.push(`${fmtNumber(pkg)} แพ็คเกจ`);
  return parts.length ? parts.join(' · ') : SURVEY_UNKNOWN_TEXT;
}

/**
 * 🔑 **ข้อเท็จจริงของพื้นที่หนึ่งแถวที่หัวที่ *พับอยู่* ต้องตอบได้โดยไม่ต้องเปิด**
 *
 * ⭐ กติกาของแบบที่อนุมัติ: หัวที่พับต้องตอบ "ครบไหม ได้เท่าไร" — ครบแล้วโชว์ตัวเลข
 *   (ตร.ม. · ลบ.ม. · สูตรกี่แพ็คเกจ · กี่จุด · กี่รูป) ยังไม่ครบโชว์ "ขาด: …"
 *   ⇒ ตัวเลขทุกตัวต้องมาจากที่นี่ ไม่ใช่ให้การ์ดคำนวณเอง (การ์ดสองใบจะคำนวณไม่เท่ากัน)
 *
 * ⚠️ `files = []` ตอนยังโหลดไม่เสร็จ ⇒ ตอบว่า "ยังไม่มีรูป" ซึ่ง **fail-closed ถูกแล้ว**
 *   (เหตุผลเดียวกับ `surveyDocCounts`)
 *
 * @param zone  แถว `service_survey_zones`
 * @param files ไฟล์แนบของแถวนั้น
 */
export function surveyZoneFacts(zone = {}, files = []) {
  const cut = isCut(zone);
  const size = surveyZoneSize(zone.parts);
  const spots = spotCounts(zone.spots);
  const photos = surveyDocCounts(files);
  const qty = Number(zone.packageQty);
  const gaps = cut
    ? []
    : SURVEY_GATES
      .map((gate) => ({ gate, text: gate.missing(zone, files || []) }))
      .filter((x) => x.text)
      .map((x) => ({ key: x.gate.key, owner: x.gate.owner, short: x.gate.short, label: x.gate.label, text: x.text }));
  const crew = gaps.filter((g) => g.owner === 'crew');
  const head = gaps.filter((g) => g.owner === 'head');
  return {
    zoneId: zone.id || null,
    zoneName: zoneName(zone),
    /* รหัส ZN อ่านสดจากทะเบียน — route เติมลงแถวให้
       🔴 **"ยังไม่มีรหัส" กับ "อ่านรหัสไม่สำเร็จ" ต้องแยกกัน** — พื้นที่ใหม่ของ SA ยังไม่มี
          `zoneId` จนกว่าจะกดส่งใบ (ว่างเป็นเรื่องปกติ) ส่วนอ่านไม่สำเร็จคือของที่มีอยู่
          แต่เราไม่รู้ ⇒ จอต้องเขียน "ไม่ทราบ" เฉพาะกรณีหลัง (route ปัก `zoneCodeUnknown`) */
    zoneCode: zone.zoneCode ?? null,
    zoneCodeUnknown: zone.zoneCodeUnknown === true,
    floor: zone.floor ?? null,
    cut,
    cutReason: cut ? (zone.cutReason || null) : null,
    areaSqm: size.areaSqm,
    volumeCbm: size.volumeCbm,
    parts: size.parts,
    measuredParts: size.measuredParts,
    sizeComplete: size.complete,
    suggestedPackages: suggestedPackages(size.volumeCbm),
    packageQty: Number.isFinite(qty) && qty > 0 ? qty : null,
    spotsTotal: spots.total,
    spotsSelected: spots.selected,
    photos: { ...photos, total: photos.wide + photos.plan + photos.spot },
    missing: gaps,
    missingCrew: crew,
    missingHead: head,
    /* บรรทัด "ขาด: …" ของหัวที่พับ = **ของฝั่งช่างเท่านั้น** — ของหัวหน้า (ผัง/เลือกจุด/
       แพ็คเกจ) ทำที่แท็บสรุปส่งผล ไม่ได้ทำในพื้นที่ ⇒ เขียนไว้บนหัวพื้นที่คือชี้ผิดที่ */
    missingText: crew.length ? `ขาด: ${crew.map((g) => g.short).join(' · ')}` : null,
    crewComplete: !cut && crew.length === 0,
    ready: !cut && gaps.length === 0,
    tone: cut ? 'cut' : (crew.length ? 'todo' : 'done'),
  };
}

/**
 * 🔑 **ค่าเปิด/ปิดตั้งต้นของพื้นที่ — คำนวณจากข้อมูลทุกครั้งที่โหลด ไม่จำข้ามครั้ง**
 *
 * ⭐ กติกาที่อนุมัติ (สามข้อ ตามลำดับนี้):
 *   1. พื้นที่ที่ถูก **ตัดออก** → พับเสมอ (ไม่มีอะไรให้ทำแล้ว)
 *   2. ใบที่เหลือ **พื้นที่เดียว** → เปิดเสมอ แม้คนดูแก้ไม่ได้ (เปิดมาเจอการ์ดพับอันเดียว
 *      คือหน้าที่ไม่ตอบอะไรเลย)
 *   3. คนดู **แก้ได้** และพื้นที่นั้น **ยังขาดของฝั่งช่าง** → เปิด · นอกนั้นพับ
 *      ⇒ วัดครบ · ใบที่ส่งแล้ว · ใบที่ยกเลิก · คนดูอย่างเดียว = พับหมด
 *
 * ⚠️ **ไม่ขึ้นกับขนาดจอและไม่จำค่าเดิม** — ค่าที่จำไว้จะพาไปเปิดพื้นที่ที่จบไปแล้ว
 *   และซ่อนพื้นที่ที่เพิ่งกลายเป็นงานค้าง
 *
 * 🐞 **`canWrite` ของ server ไม่รู้จักการล็อก** — `visitWriteAccess` ตอบแค่ "คนนี้เป็นช่าง
 *   ของนัดใบนี้ไหม" ไม่เคยดู `answeredAt` / `cancelledAt` / `closedAt` เลย ⇒ ส่งค่าที่ได้
 *   จาก GET มาดิบ ๆ แล้วใบที่ส่งไปแล้วจะกางพื้นที่ที่ "ยังขาด" ค้างไว้ทั้งหน้า ทั้งที่
 *   แก้อะไรไม่ได้สักช่อง · **ห้ามให้ผู้เรียกต้องจำหักลบเอง** — ส่ง `request` มาแล้ว
 *   ตัวตัดสินถามด่านล็อกตัวเดียวกับการ์ดควบคุมให้เอง
 *
 * @param viewer `{ canWrite, locked, request }` — `canWrite` มาจาก server (จอไม่รู้ user id
 *               ตัวเอง) · **ต้องส่ง `request` หรือ `locked` มาอย่างน้อยหนึ่งอย่าง** ไม่งั้น
 *               ตัวตัดสินไม่มีทางรู้ว่าใบถูกล็อกแล้ว · ทางที่สั้นที่สุดคือใช้
 *               `surveyControlView(...).foldDefaults` ซึ่งหักลบมาให้แล้ว
 * @returns `{ [zoneRowId]: boolean }` — ใช้เป็นค่าตั้งต้นของ `useState` ได้ตรง ๆ
 */
export function surveyFoldDefaults(zones = [], filesByZone = {}, viewer = {}) {
  const rows = Array.isArray(zones) ? zones : [];
  const active = activeZones(rows);
  const locked = viewer?.locked === true
    || (viewer?.request != null && !!surveyEditLockError(viewer.request));
  const editable = viewer?.canWrite === true && !locked;
  const open = {};
  for (const row of rows) {
    if (!row?.id) continue;
    if (isCut(row)) { open[row.id] = false; continue; }
    if (active.length === 1) { open[row.id] = true; continue; }
    open[row.id] = editable && surveyFieldMissing(row, filesByZone?.[row.id] || []).length > 0;
  }
  return open;
}

/* ── ขั้นของใบ — ชุด 6 ขั้นเดียวกับหน้าคำร้อง ────────────────────────────────
   ⭐ **ห้ามเขียนชื่อขั้นชุดที่สอง** — ฝ่ายขายอ่านรางบนหน้าคำร้อง TS อ่านการ์ดนี้
      สองชุดที่ชื่อไม่ตรงกันคือสองฝ่ายที่คุยกันคนละเรื่องทั้งที่ดูใบเดียวกัน
   ⚠️ ทับเฉพาะ **บรรทัดใต้ขั้นปัจจุบัน** ด้วยข้อเท็จจริงของใบประเมิน (วัดแล้วกี่พื้นที่ ·
      ดึงกลับเมื่อไร) ซึ่งรางกลางไม่รู้จัก — ชื่อขั้นไม่แตะ */
function stepOf(request, { cancelled, recallPending, recall, progress }) {
  const { steps, index } = requestRailSteps(request || {});
  const current = steps[index] || steps[steps.length - 1] || null;
  let hint = current?.hint || null;
  if (cancelled) {
    hint = request?.cancelledAt ? `ยกเลิก ${fmtDateTime(request.cancelledAt)}` : 'ยกเลิกแล้ว';
  } else if (recallPending) {
    hint = `ดึงกลับ ${recall?.at ? fmtDateTime(recall.at) : SURVEY_UNKNOWN_TEXT} — รอส่งอีกครั้ง`;
  } else if (current?.id === 'acknowledged' && progress.total > 0) {
    hint = `วัดแล้ว ${progress.done}/${progress.total} พื้นที่`;
  }
  return {
    id: current?.id || null,
    label: current?.label || null,
    hint,
    index,
    total: steps.length,
    cancelled,
    steps,
  };
}

/** เลยกำหนดส่งมากี่วัน — `null` เมื่อยังไม่เลย หรือยังไม่รู้ว่าวันนี้วันอะไร
 *  ⚠️ "ไม่เลย" กับ "เลย 0 วัน" คนละความหมาย ⇒ คืน null ไม่ใช่ 0 (ท่าเดียวกับ `overdueDays`) */
function overdueBy(dueDate, today) {
  const due = String(dueDate || '').trim();
  const now = String(today || '').trim();
  if (!due || !now || due >= now) return null;
  const from = new Date(`${due}T00:00:00Z`);
  const to = new Date(`${now}T00:00:00Z`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  const days = Math.round((to - from) / 86400000);
  return days > 0 ? days : null;
}

/**
 * 🔑 **ทุกอย่างที่การ์ด "จัดการผลประเมิน" วาด — คำนวณที่เดียว**
 *
 * ⭐ **สถานะไม่ได้มาจาก `answeredAt` ตัวเดียว** (ข้อที่แบบเดิมพลาด) — มันมาจากสามอย่าง:
 *   `surveyEditLockError` (ยกเลิก/ปิดแล้ว/ส่งแล้ว) + `answeredAt` + **แถว recall**
 *   ⇒ ใบที่ถูกดึงกลับมี `answeredAt = null` และ `status = 'acknowledged'` เท่ากับใบที่
 *     ไม่เคยส่ง · ถ้าไม่อ่านแถว recall จอจะบอกว่า "กำลังวัด" เฉย ๆ ทั้งที่ฝ่ายขายถือ
 *     ตัวเลขชุดเก่าอยู่ในมือและกำลังรอของใหม่
 *
 * ⚠️ **ปุ่มถามด่านตัวเดียวกับ server เสมอ** — `surveySendError` / `surveyRecallError`
 *   ไม่ใช่เงื่อนไขที่การ์ดคิดเอง (ปุ่มที่รู้มากกว่า server = ปุ่มที่จางเงียบโดยไม่บอกเหตุ)
 *
 * @param request        แถว `dept_requests`
 * @param zones          แถวผลวัดทุกแถวของใบ (รวมที่ถูกตัดออก)
 * @param filesByZone    `{ [zoneRowId]: ไฟล์ของแถวนั้น }`
 * @param visit          นัดของใบ (ใช้บอกว่าแจ้งช่างได้ไหม)
 * @param recall         ผลของ `surveyRecallRecord` — `null` = ไม่เคยดึงกลับ
 * @param unknown        `{ site?, zoneCodes?, customer?, recall?, visit? }` ชิ้นที่อ่านไม่สำเร็จ
 * @param viewer         `{ canWrite, canDecide }` — มาจาก server ทั้งคู่
 * @param dirtyZoneIds   พื้นที่ที่มีค่าพิมพ์ค้างยังไม่บันทึก (จอส่งมา · PR4)
 * @param pendingDecisionZoneIds พื้นที่ที่เคาะแล้วยังไม่กดบันทึก (จอส่งมา · PR5)
 * @param tab            แท็บที่เปิดอยู่ (`field` | `result`) — ใช้เลือกปุ่มพาไป
 * @param today          วันไทยวันนี้ `YYYY-MM-DD` (`businessDate()` ของผู้เรียก) — ไม่ส่ง = ไม่คำนวณวันเลยกำหนด
 */
export function surveyControlView({
  request = null,
  zones = [],
  filesByZone = {},
  visit = null,
  recall = null,
  unknown = {},
  viewer = {},
  dirtyZoneIds = [],
  pendingDecisionZoneIds = [],
  tab = 'field',
  today = null,
} = {}) {
  const rows = Array.isArray(zones) ? zones : [];
  const files = filesByZone && typeof filesByZone === 'object' ? filesByZone : {};
  const active = activeZones(rows);
  const canWriteRaw = viewer?.canWrite === true;
  const canDecide = viewer?.canDecide === true;

  const cancelled = !!request?.cancelledAt;
  const sent = !!request?.answeredAt;
  /* 🔴 **"ปิดแล้ว" มีสองความหมาย และคนละสถานะกันคนละทาง** —
     `settled` = ส่งผลแล้ว *และ* ฝ่ายขายปิดเรื่องแล้ว = ทางจบปกติของทุกใบ
       (`closureStatus()` เขียน `status='closed'` ให้เองเมื่อ `answeredAt && closedAt`
        ⇒ ใบที่จบครบทุกใบมาอยู่ตรงนี้ ไม่ใช่เคสขอบ)
     `closedWithoutAnswer` = ปิดโดยไม่เคยส่งผลเลย (§5E ③) = ทางตันที่ไม่มีทางกลับ
     ⚠️ ธงเดิมชื่อ `closed` เฉย ๆ ซึ่งอ่านเหมือนอย่างแรกแต่หมายถึงอย่างหลัง ⇒ เปลี่ยนชื่อ
        ก่อนที่จอจะไปอ่านผิดความหมาย (ยังไม่มีใครเรียก) */
  const settled = sent && !cancelled && (!!request?.closedAt || request?.status === 'closed');
  const closedWithoutAnswer = !cancelled && !sent
    && (!!request?.closedAt || request?.status === 'closed');
  const lockReason = surveyEditLockError(request);
  const locked = !!lockReason;
  const canWrite = canWriteRaw && !locked;
  const readOnly = !canWriteRaw && !canDecide;
  /* ใบที่ถูกดึงกลับ **และยังไม่ได้ส่งซ้ำ** — แถว recall ค้างอยู่ตลอดไป ⇒ ต้องคู่กับ
     "ยังไม่มี answeredAt" เสมอ ไม่งั้นใบที่ส่งรอบสองไปแล้วจะอ่านว่ายังถูกดึงกลับอยู่ */
  const recallPending = !!recall && !sent && !cancelled;

  const progress = surveyFieldProgress(rows, files);
  const leftZones = active.filter((r) => surveyFieldMissing(r, files[r.id] || []).length > 0);
  const totals = surveyTotals(rows);
  const allGates = surveyGateChecklist(rows, files);
  /* ช่างเห็นเฉพาะสามข้อของตัวเอง — ข้อของหัวหน้าเขาแก้ไม่ได้ (แบบที่อนุมัติ: หัวข้อ
     "ของที่ช่างต้องเก็บ") ⇒ เอามาโชว์ = กำแพงที่บอกว่าเขาทำงานไม่เสร็จทั้งที่เสร็จแล้ว */
  const gates = canDecide ? allGates : allGates.filter((g) => g.owner === 'crew');
  const gatesFailed = gates.filter((g) => !g.ok);

  /* ── ค่าที่ยังอยู่บนจอ ยังไม่ลงฐาน (จอส่ง id มา) ─────────────────────────
     🔴 **ตัดสินจากลิสต์ที่รับมา ไม่ใช่จากผลกรองแถว** — ของเดิมกรอง id ผ่าน `rows` ก่อน
        ⇒ id ที่แมตช์ไม่เจอสักแถว (แถวเพิ่งถูกลบ · จอส่ง key คนละชุด · พิมพ์ผิด) หายเงียบ
        แล้ว **ปุ่มส่งกลับกดได้** ทั้งที่ยังมีค่าค้าง — fail-open บนด่านที่มีไว้กันข้อมูล
        ที่ยังไม่ถูกบันทึกโดยเฉพาะ · หาชื่อพื้นที่ไม่เจอก็เขียนกลาง ๆ ไป แต่ต้องบล็อก
     ⚠️ ยกเว้นแถวที่ **ถูกตัดออก** — แก้อะไรไม่ได้อยู่แล้ว ค่าค้างบนนั้นไม่ควรขวางการส่ง */
  const cutIds = new Set(rows.filter(isCut).map((r) => String(r.id)));
  const listed = (ids) => [...new Set((ids || []).filter(Boolean).map(String))]
    .filter((id) => !cutIds.has(id));
  const dirtyIds = listed(dirtyZoneIds);
  const pendingIds = listed(pendingDecisionZoneIds);
  const dirtyRows = active.filter((r) => dirtyIds.includes(String(r.id)));

  // ── สถานะ + โทน ────────────────────────────────────────────────────────
  const leftText = surveyNameList(leftZones.map(zoneName));
  const measuredSub = `วัดแล้ว ${progress.done} / ${progress.total} พื้นที่`
    + (leftText ? ` · เหลือ ${leftText}` : '');
  let status;
  if (cancelled) {
    /* ⚠️ **ไม่มีคอลัมน์ "ยกเลิกโดยใคร" บน `dept_requests`** — มีแต่ `cancelledAt` กับ
       `cancelReason` · ใบเก่าบางใบไม่มีชื่อผู้กดให้อ่านเลย ⇒ ไม่มีชื่อก็ **ไม่เขียนชื่อ**
       ห้ามเดาเป็นผู้เปิดเรื่อง (คนละคนกันได้ และการเดาผิดคือหลักฐานปลอม) */
    const who = request?.cancelledByName || null;
    const when = request?.cancelledAt ? fmtDateTime(request.cancelledAt) : null;
    const stamp = [
      who && `ยกเลิกโดย ${who}`,
      when && (who ? when : `ยกเลิกเมื่อ ${when}`),
    ].filter(Boolean).join(' · ');
    status = {
      key: 'cancelled', tone: 'neutral', headline: 'คำร้องถูกยกเลิก',
      sub: stamp ? `${stamp} — แก้ผลและส่งไม่ได้` : 'แก้ผลและส่งไม่ได้',
    };
  } else if (closedWithoutAnswer) {
    /* 🔴 ใบที่ **ปิดโดยไม่ได้ส่งผล** (§5E ③) — สภาพที่ไม่มีทางกลับ (`reopenRequestError`
       ตัด `closed` ไว้) ⇒ ข้อความต้องชี้ทางที่เหลือจริง คือเปิดใบใหม่ */
    status = {
      key: 'closed', tone: 'neutral', headline: 'ใบนี้ถูกปิดไปแล้ว',
      sub: 'ปิดโดยไม่ได้ส่งผลประเมิน — แก้ผลและส่งไม่ได้ · ถ้าต้องประเมินใหม่ ให้เปิดใบใหม่',
    };
  } else if (sent) {
    const who = request?.answeredByName || SURVEY_UNKNOWN_TEXT;
    const when = request?.answeredAt ? fmtDateTime(request.answeredAt) : SURVEY_UNKNOWN_TEXT;
    /* 🐞 บรรทัดนี้เคยเขียน "รอฝ่ายขายปิดเรื่อง" ตายตัว ⇒ ใบที่ฝ่ายขายปิดไปแล้วยังบอกว่ารอ
       ทั้งที่บรรทัดขั้นตอนในคำตอบก้อนเดียวกันขึ้น "ปิดเรื่อง · ปิดโดย …" อยู่ข้าง ๆ
       ⇒ การ์ดกับรางเถียงกันเองบนจอเดียว · ค่าอยู่ในมือแล้ว (`closedAt`) แค่ไม่ได้ดู */
    const closedWhen = request?.closedAt ? fmtDateTime(request.closedAt) : null;
    const tail = settled
      ? `ฝ่ายขายปิดเรื่องแล้ว${closedWhen ? ` ${closedWhen}` : ''}`
      : 'รอฝ่ายขายปิดเรื่อง';
    status = {
      key: 'sent', tone: 'success',
      headline: settled ? 'ส่งผลแล้ว · ฝ่ายขายปิดเรื่องแล้ว' : 'ส่งผลให้ฝ่ายขายแล้ว',
      sub: `ส่งโดย ${who} · ${when} · ${tail}`,
    };
  } else if (!active.length) {
    /* ใบที่ไม่เหลือพื้นที่ให้ประเมิน — ฝ่ายขายยังไม่ได้ระบุ หรือถูกตัดออกหมด
       ⚠️ ต้องเป็นสถานะของตัวเอง ไม่ใช่ "กำลังวัด 0/0" ซึ่งอ่านเหมือนงานกำลังเดิน */
    status = {
      key: 'no-zones', tone: 'neutral', headline: 'ยังไม่มีพื้นที่ที่ต้องประเมิน',
      sub: totals.cutZones
        ? `ถูกตัดออกหมดทั้ง ${totals.cutZones} พื้นที่ — ส่งผลไม่ได้`
        : 'ฝ่ายขายเป็นคนระบุพื้นที่ตอนเปิดใบ',
    };
  } else if (recallPending) {
    status = {
      key: 'recalled', tone: 'warning', headline: 'ดึงผลกลับมาแก้',
      sub: progress.complete ? 'วัดครบแล้ว · รอหัวหน้าส่งผลอีกครั้ง' : measuredSub,
    };
  } else if (!progress.complete) {
    status = { key: 'measuring', tone: 'warning', headline: 'กำลังวัดหน้างาน', sub: measuredSub };
  } else if (allGates.some((g) => !g.ok)) {
    status = {
      key: 'awaiting-decision', tone: 'info', headline: 'วัดครบแล้ว — รอหัวหน้าเคาะ',
      sub: `วัดแล้ว ${progress.done} / ${progress.total} พื้นที่ · เหลือเคาะจุดและแพ็คเกจ`,
    };
  } else {
    status = {
      key: 'ready', tone: 'info', headline: 'พร้อมส่งผลให้ฝ่ายขาย',
      sub: `${fmtNumber(totals.zones)} พื้นที่ · ${fmtNumber(totals.areaSqm)} ตร.ม. · ${fmtNumber(totals.packageQty)} แพ็คเกจ`,
    };
  }

  // ── ด่านที่ติด รวมเป็นกลุ่มต่อพื้นที่ ────────────────────────────────────
  /* ⭐ **กลุ่มต่อพื้นที่ ไม่ใช่กำแพงหกแถว** — หัวหน้าที่กดส่งไม่ได้มีคำถามเดียว:
     "ต้องไปทำอะไรที่ไหน" · เรียงตามข้อ = เขาต้องประกอบเองว่าพื้นที่ไหนติดอะไรบ้าง
     🔑 **คำนวณก่อนบรรทัดเหตุผลใต้ปุ่มส่ง เพราะบรรทัดนั้นหยิบปุ่มพาไปจากที่นี่** —
        "ไปไหนถึงจะแก้ข้อนี้ได้" ต้องมีคำตอบชุดเดียวทั้งจอ (ดูกฎในลูป) */
  const gateKeys = new Set(gates.map((g) => g.key));
  const gapRows = [];
  for (const row of active) {
    const facts = surveyZoneFacts(row, files[row.id] || []);
    const crew = facts.missingCrew.filter((g) => gateKeys.has(g.key));
    const head = facts.missingHead.filter((g) => gateKeys.has(g.key));
    if (!crew.length && !head.length) continue;
    const targets = [];
    /* 🔑 **กฎ "ไปไหนถึงจะแก้ข้อนี้ได้" มีชุดเดียว และอยู่ตรงนี้ที่เดียว** —
       ขนาด/รูป/จุดหน้างาน และ **"ภาพผัง"** แก้ในพื้นที่ (ช่องอัปผังอยู่ใน `SurveyZoneCard`
       ซึ่งเรนเดอร์เฉพาะแท็บหน้างาน) · เลือกจุด/แพ็คเกจ เคาะที่แท็บสรุป
       🐞 บรรทัดเหตุผลใต้ปุ่มส่งเคยมีกฎของตัวเองที่ลืมข้อ "ภาพผัง" ⇒ ใบที่ขาดแต่ผัง
          ได้ปุ่ม "ไปเคาะที่แท็บสรุปส่งผล" ซึ่งเป็นแท็บที่อัปผังไม่ได้ = ปุ่มพาไปทางตัน
          ⇒ ตอนนี้บรรทัดนั้นหยิบ `targets` ของแถวนี้ไปใช้ ไม่คิดเอง */
    if (crew.length || head.some((g) => g.key === 'plan')) {
      targets.push({ kind: 'zone', zoneId: row.id, label: `เปิด ${zoneName(row)}` });
    }
    if (canDecide && !crew.length && head.some((g) => g.key !== 'plan') && tab !== 'result') {
      targets.push({ kind: 'tab', tab: 'result', label: 'เคาะที่สรุปส่งผล' });
    }
    gapRows.push({
      zoneId: row.id,
      zoneName: zoneName(row),
      zoneCode: row.zoneCode ?? null,
      zoneCodeUnknown: row.zoneCodeUnknown === true,
      crew: crew.map((g) => g.short),
      head: head.map((g) => g.short),
      crewText: crew.length ? `ช่างต้องเก็บ: ${crew.map((g) => g.short).join(' · ')}` : null,
      headText: head.length ? `หัวหน้าต้องทำ: ${head.map((g) => g.short).join(' · ')}` : null,
      targets,
    });
  }
  const SHOWN = 3;
  const crewIds = [visit?.assigneeId, ...(visit?.assistantIds || [])].filter(Boolean).map(String);
  const zoneGaps = {
    rows: gapRows,
    shown: gapRows.slice(0, SHOWN),
    hidden: Math.max(0, gapRows.length - SHOWN),
    /* ปุ่ม "แจ้งช่างให้กลับไป" มีครั้งเดียวต่อใบ และโชว์เฉพาะตอนที่ยังมีของฝั่งช่างค้าง
       ⚠️ แจ้งไม่ถึงใครถ้านัดไม่มีช่าง — ด่านจริงอยู่ที่ `surveySendBackError` ที่ปุ่มถามต่อ */
    crewPending: canDecide && !locked && gapRows.some((r) => r.crew.length > 0),
    crewIds,
  };

  // ── เหตุผลที่ยังกดส่งไม่ได้ + จุดที่พาไปแก้ ───────────────────────────────
  /* 🔑 ด่านตัวเดียวกับ server เป็นตัวตัดสิน `allowed` เสมอ · สองข้อแรกเป็นของที่ server
     มองไม่เห็น (ค่าที่ยังอยู่บนจอ) ⇒ มันเพิ่มด่านได้ แต่ **ลดไม่ได้** */
  const serverSendReason = surveySendError(rows, files, { canSend: canDecide });
  let sendReason = null;
  if (!locked) {
    /* 🐞 **ไม่มีสิทธิ์ส่ง = เหตุผลเดียว ห้ามประกอบบรรทัดด่านหกข้อทับ** — ของเดิมเขียน
       `text` เป็น "ยังส่งไม่ได้ — ติด 6 ข้อ … รอช่างเก็บงาน" พร้อมปุ่มพาไป ขณะที่
       `detail` (ด่านจริงของ server) บอกว่า "ส่งผลประเมินได้เฉพาะหัวหน้าฝ่ายบริการ"
       ⇒ สองบรรทัดในออบเจ็กต์เดียวกันบอกคนละเรื่อง และชวนช่างไปเก็บงานเพื่อกดปุ่มที่
       เขาไม่มีวันกดได้ · ด่านที่แข็งกว่าต้องพูดคนเดียว */
    if (!canDecide) {
      sendReason = { key: 'no-permission', text: serverSendReason, detail: serverSendReason, target: null };
    } else if (pendingIds.length) {
      sendReason = {
        key: 'result-dirty',
        text: `มีการเคาะที่ยังไม่บันทึก ${pendingIds.length} พื้นที่ — บันทึกก่อนส่ง`,
        target: tab === 'result' ? null : { kind: 'tab', tab: 'result', label: 'ไปบันทึกการเคาะ' },
      };
    } else if (dirtyIds.length) {
      const names = surveyNameList(dirtyRows.map(zoneName));
      sendReason = {
        key: 'field-dirty',
        text: names ? `${names} มีค่าที่พิมพ์ค้าง ยังไม่บันทึก` : 'มีค่าที่พิมพ์ค้าง ยังไม่บันทึก — บันทึกก่อนส่ง',
        target: dirtyRows[0]
          ? { kind: 'zone', zoneId: dirtyRows[0].id, label: `ไปที่ ${zoneName(dirtyRows[0])}` }
          : null,
      };
    } else if (serverSendReason) {
      const failed = allGates.filter((g) => !g.ok);
      const stuckNames = [...new Set(failed.flatMap((g) => g.zones))];
      const crewStuck = failed.some((g) => g.owner === 'crew');
      /* พาไปที่พื้นที่ที่ **ช่างยังค้าง** ก่อน ถ้าไม่มีก็พื้นที่แรกที่ติดอะไรก็ได้
         🔑 **ถาม `targets` ของแถวนั้นว่า "ไปไหน" — ไม่คิดเอง** (นั่นคือกฎชุดที่สองที่
            เคยลืมข้อ "ภาพผัง" ไป) · ที่ต่างกันมีแค่ **คำบนปุ่ม** ซึ่งแบบที่อนุมัติเขียน
            ไว้คนละที่จริง ๆ: บรรทัดใต้ปุ่มส่งใช้ "ไปเคาะที่แท็บสรุปส่งผล" ส่วนปุ่มใน
            กลุ่มด่านต่อพื้นที่ใช้ "เคาะที่สรุปส่งผล" (§4 vs §5) */
      const firstStuck = gapRows.find((r) => r.crew.length > 0) || gapRows[0] || null;
      const stuckTarget = firstStuck?.targets?.[0] || null;
      sendReason = {
        key: crewStuck ? 'crew-gaps' : 'head-gaps',
        text: failed.length
          ? `ยังส่งไม่ได้ — ติด ${failed.length} ข้อ ที่ ${surveyNameList(stuckNames)}${crewStuck ? ' · รอช่างเก็บงาน' : ''}`
          : serverSendReason,
        /* 🔑 ข้อความเต็มของด่าน server — โมดัลยืนยันใช้ตัวนี้ ไม่ใช่บรรทัดย่อของราง
           (บรรทัดย่อมีไว้ให้รางกว้าง 330px อ่านได้ ไม่ได้มีไว้แทนเหตุผล) */
        detail: serverSendReason,
        target: stuckTarget && (stuckTarget.kind === 'tab'
          ? { ...stuckTarget, label: 'ไปเคาะที่แท็บสรุปส่งผล' }
          : stuckTarget),
      };
    }
  }
  const send = {
    // ไม่มีสิทธิ์ = ไม่โชว์ปุ่ม · ติดด่าน = โชว์แล้วบอกเหตุ (กติกา ui-visibility)
    show: canDecide && !locked,
    label: recallPending ? 'ส่งผลให้ฝ่ายขายอีกครั้ง' : 'ส่งผลให้ฝ่ายขาย',
    allowed: canDecide && !locked && !serverSendReason && !sendReason,
    reason: sendReason,
  };

  /* ⚠️ เหตุผลของการดึงกลับยังไม่ถูกพิมพ์ตอนนี้ (อยู่ในโมดัล) ⇒ ยิงค่ายาวพอผ่านด่าน
     ความยาว เพื่อถาม **เฉพาะเงื่อนไขอื่น** ของด่านตัวเดียวกับ server */
  const recallGate = surveyRecallError(request, { reason: 'x'.repeat(10), canRecall: canDecide });
  const recallAllowed = !recallGate;

  // ── กล่องแจ้ง ───────────────────────────────────────────────────────────
  const notices = [];
  /* ⚠️ ไม่มีเหตุผลบันทึกไว้ (ใบเก่าก่อนที่ด่านจะบังคับ) = **ไม่ขึ้นกล่องเปล่า** — กล่องที่
     เขียนว่า "ไม่ทราบ" ตรงนี้จะอ่านเหมือนอ่านข้อมูลไม่สำเร็จ ทั้งที่ของมันไม่เคยมี */
  const cancelReason = String(request?.cancelReason ?? '').trim();
  if (cancelled && cancelReason) {
    notices.push({ key: 'cancelled', tone: 'neutral', title: 'เหตุผล', text: cancelReason });
  }
  if (recallPending) {
    notices.push({
      key: 'recall', tone: 'warning', title: 'ดึงกลับเพราะ',
      text: recall.reason || SURVEY_UNKNOWN_TEXT,
      meta: `${recall.byName || SURVEY_UNKNOWN_TEXT} · ${recall.at ? fmtDateTime(recall.at) : SURVEY_UNKNOWN_TEXT}`
        + ` · ผลเดิม ${surveyTotalsText(recall.totals)}`,
    });
  }
  if (readOnly && !cancelled) {
    notices.push({
      key: 'read-only', tone: 'neutral',
      text: 'ดูได้อย่างเดียว — บันทึกผลได้เฉพาะช่างในนัดและหัวหน้าบริการ',
    });
  } else if (!canDecide && canWriteRaw && sent) {
    /* 🐞 คำแนะนำเดิมบอกช่างให้ไปกด "ยังไม่จบ" ที่ใบคำร้อง — ซึ่ง role `ts` เปิดไม่ได้ (403)
       ⇒ ทางออกต้องเป็นทางที่คนอ่านคนนั้นเดินได้จริง คือบอกหัวหน้าให้กดดึงกลับ */
    notices.push({
      key: 'crew-sent', tone: 'neutral',
      text: 'ส่งผลแล้ว แก้ไม่ได้ — ถ้าตัวเลขต้องเปลี่ยน แจ้งหัวหน้าบริการให้กด "ดึงผลกลับมาแก้"',
    });
  } else if (!canDecide && canWrite && progress.complete && active.length > 0) {
    notices.push({
      key: 'crew-done', tone: 'success',
      text: 'ส่วนของช่างครบแล้ว — หัวหน้าบริการเป็นคนเคาะแพ็คเกจและส่งผล',
    });
  }
  /* 🔴 **อ่านไม่สำเร็จต้องพูดออกมา** — ชิ้นที่หายไปเงียบ ๆ อ่านเหมือน "ไม่มีข้อมูลนี้"
     ซึ่งเป็นคนละเรื่องกันคนละทาง (ไซต์ไม่มีที่อยู่ ≠ อ่านที่อยู่ไม่สำเร็จ) */
  const unknownKeys = Object.keys(unknown || {}).filter((k) => unknown[k]);
  if (unknownKeys.length) {
    notices.push({
      key: 'unknown', tone: 'warning',
      text: `อ่านข้อมูลบางส่วนไม่สำเร็จ — ${unknownKeys.map((k) => SURVEY_UNKNOWN_LABELS[k] || k).join(' · ')}`
        + ` แสดงเป็น "${SURVEY_UNKNOWN_TEXT}" · ลองโหลดหน้าใหม่`,
      keys: unknownKeys,
    });
  }

  const nextZone = leftZones[0]
    ? { id: leftZones[0].id, name: zoneName(leftZones[0]) }
    : null;

  return {
    status,
    progress: {
      done: progress.done,
      total: progress.total,
      complete: progress.complete,
      percent: progress.total ? Math.round((progress.done / progress.total) * 100) : 0,
      cut: totals.cutZones,
      leftNames: leftZones.map(zoneName),
      leftText,
    },
    totals,
    gates,
    gatesFailed: gatesFailed.length,
    gatesTitle: canDecide ? 'ด่านก่อนส่งผล' : 'ของที่ช่างต้องเก็บ',
    send,
    recallAllowed,
    recallBlockedReason: recallGate,
    /* ปุ่มดึงกลับเป็น **ของหัวหน้าและใบที่ส่งแล้วเท่านั้น** — โทนอำพัน ไม่ใช่แดง เพราะย้อนได้ */
    recallAction: {
      show: canDecide && sent && !cancelled,
      allowed: recallAllowed,
      hint: 'ต้องใส่เหตุผล · ฝ่ายขายได้แจ้งเตือนว่าตัวเลขเดิมใช้ไม่ได้',
    },
    recall: recallPending ? recall : null,
    nextZone,
    notices,
    zoneGaps,
    /* ค่าพับตั้งต้นสำเร็จรูป — คิดจาก `canWrite` ที่ **หักลบด่านล็อกแล้ว** ⇒ จอเรียก
       `view.foldDefaults` ได้เลย ไม่ต้องรู้ว่าต้องหักอะไรก่อน (ที่เดียวที่พลาดได้) */
    foldDefaults: surveyFoldDefaults(rows, files, { canWrite, locked }),
    step: stepOf(request, { cancelled, recallPending, recall, progress }),
    due: {
      date: request?.committedDueDate || null,
      overdueDays: locked ? null : overdueBy(request?.committedDueDate, today),
    },
    flags: {
      sent, cancelled, locked, readOnly,
      /* 🔴 ชื่อธงต้องบอกว่าเป็นการปิดแบบไหน — `settled` = จบครบ (ส่งแล้ว + ฝ่ายขายปิด)
         `closedWithoutAnswer` = ปิดทิ้งโดยไม่เคยส่งผล · เดิมมีธงเดียวชื่อ `closed`
         ซึ่งอ่านเหมือนอย่างแรกแต่หมายถึงอย่างหลัง */
      settled, closedWithoutAnswer,
      canWrite, canDecide,
      recallPending,
      /* ⚠️ `recallPending === false` แปลว่า "ไม่ได้ถูกดึงกลับ" **ก็ต่อเมื่อ `recallKnown`**
         — อ่านแถว recall ไม่สำเร็จแล้วตอบว่า "ไม่เคยดึงกลับ" คือการแปลงความล้มเหลว
         เป็นข้อเท็จจริง (กติกา supabase-never-throws) · กล่องแจ้ง `unknown` พูดแทนแล้ว */
      recallKnown: unknown?.recall !== true,
      /* ลำดับใน DOM: ช่างที่ยังกรอกได้ถามว่า "พื้นที่ไหนต้องวัด" ⇒ เนื้อมาก่อนการ์ด ·
         คนอื่นถามว่า "ใบนี้อยู่สถานะไหน" ⇒ การ์ดมาก่อน */
      controlFirst: !(canWrite && !canDecide),
    },
    lockReason,
    unknown: { ...(unknown || {}) },
  };
}
