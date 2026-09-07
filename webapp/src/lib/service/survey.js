// ── ตรรกะของใบประเมินพื้นที่ (mig 0314) — ไม่แตะ DB ─────────────────────
//
// ⭐ ที่มา: ฝ่ายขายต้องรู้ว่าพื้นที่ต้องใช้กี่แพ็คเกจก่อนตั้งราคา แต่ไม่มีใครรู้
// จนกว่าจะมีคนไปวัด · ไฟล์นี้คือกฎทั้งหมดที่ทั้งจอและ server ต้องถามตัวเดียวกัน
//
// 🔴 **ห้ามให้ปุ่มบนจอตัดสินเองแยกจาก server** — เงื่อนไขที่ปุ่มรู้แต่ server ไม่รู้
// คือปุ่มที่จางเงียบโดยไม่บอกเหตุ (กติกาเดิมของ lib/requests/stages.js)

/* ── สูตร: 2,400 ลบ.ม. = 1 แพ็คเกจ (มติผู้ใช้ 2026-08-29) ───────────────
   ⚠️ ใช้ **ปริมาตร** ไม่ใช่พื้นที่ — เพดาน 6.5 ม. กับ 2.8 ม. ที่พื้นที่เท่ากัน
      ต้องการไม่เท่ากัน
   🪤 อย่าสับสนกับ `suggestStandardMl` (1 แพ็คเกจ = 1 ลิตร/เดือน) ซึ่งเป็นความสัมพันธ์
      **แพ็คเกจ ↔ น้ำหอม** คนละแกนกัน — ตัวนี้ตอบว่า *ต้องใช้กี่แพ็คเกจ* */
export const CBM_PER_PACKAGE = 2400;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/* ── ส่วนของพื้นที่หนึ่งส่วน ────────────────────────────────────────────
   พื้นที่จริงไม่ใช่กล่องสี่เหลี่ยม — รูปตัว L แบ่งเป็นสองก้อนแล้วบวกกัน
   ⚠️ กรอกไม่ครบสามช่อง = **แถวเสีย ต้องตีกลับ** ไม่ใช่แถวที่คิดเป็น 0 */
export function normalizeSurveyPart(input = {}) {
  const out = { id: String(input.id ?? '').trim() || null, label: String(input.label ?? '').trim() || null };
  for (const [field, label] of [['widthM', 'กว้าง'], ['lengthM', 'ยาว'], ['heightM', 'สูง']]) {
    const value = num(input[field]);
    if (value === null) return { value: null, error: `ส่วนของพื้นที่: ต้องระบุ${label} (เมตร)` };
    if (value <= 0) return { value: null, error: `ส่วนของพื้นที่: ${label}ต้องมากกว่า 0` };
    // เพดานกันพิมพ์ผิดหลัก — 500 ม. คือความยาวสนามบิน ไม่ใช่โซนในห้าง
    if (value > 500) return { value: null, error: `ส่วนของพื้นที่: ${label} ${value} เมตร ดูเหมือนพิมพ์ผิดหลัก` };
    out[field] = value;
  }
  return { value: out, error: null };
}

/* ── ขนาดรวมของพื้นที่หนึ่ง = ผลบวกของทุกส่วน ───────────────────────── */
export function surveyZoneSize(parts = []) {
  const rows = Array.isArray(parts) ? parts : [];
  let areaSqm = 0;
  let volumeCbm = 0;
  let measured = 0;
  for (const part of rows) {
    const w = num(part?.widthM);
    const l = num(part?.lengthM);
    const h = num(part?.heightM);
    if (!(w > 0) || !(l > 0) || !(h > 0)) continue;
    measured += 1;
    areaSqm += w * l;
    volumeCbm += w * l * h;
  }
  return {
    parts: rows.length,
    measuredParts: measured,
    // ปัดทศนิยมหนึ่งตำแหน่งตอนอ่าน — เก็บดิบไว้ให้ผู้เรียกคำนวณต่อได้
    areaSqm: Math.round(areaSqm * 100) / 100,
    volumeCbm: Math.round(volumeCbm * 100) / 100,
    complete: rows.length > 0 && measured === rows.length,
  };
}

/* ── สูตรแพ็คเกจ ───────────────────────────────────────────────────────
   🔴 **ปัดเศษครั้งเดียวที่ระดับพื้นที่ ห้ามปัดรายส่วน** — สองส่วนส่วนละ 100 ลบ.ม.
      รวม 200 ⇒ 1 แพ็คเกจ · ปัดรายส่วนจะได้ ceil(100/2400) สองครั้ง = 2 ซึ่งผิดเป็นเท่าตัว
   ⭐ กติกาที่ครอบทั้งสองระดับ: **ขอบของการปัดเศษ = ขอบที่กลิ่นข้ามไม่ได้ = ผนังของพื้นที่**
      รวมข้ามพื้นที่ไม่ได้ (กลิ่นไม่ทะลุผนัง) · แยกในพื้นที่ก็ไม่ได้ (กลิ่นเดินทั่วห้อง) */
export function suggestedPackages(volumeCbm) {
  const volume = num(volumeCbm);
  if (!(volume > 0)) return null;
  return Math.max(1, Math.ceil(volume / CBM_PER_PACKAGE));
}

/* จุดที่ติดตั้งได้ (เจ้าหน้าที่แจ้ง) กับจุดที่เลือกติดตั้ง (หัวหน้าเลือก)
   ⚠️ **จำนวนจุด ≠ จำนวนแพ็คเกจ** — `service-field-operations` §2.4 บันทึกไว้แล้วว่า
      "จำนวนเครื่องต่อแพ็คเกจแกว่ง" · หนึ่งแพ็คเกจกระจายหลายจุดได้ หลายแพ็คเกจลงจุดเดียวได้
      ⇒ ห้ามผูกสองเลขนี้เข้าหากัน และห้ามเตือนว่า "ไม่เท่ากัน" */
export function spotCounts(spots = []) {
  const rows = Array.isArray(spots) ? spots : [];
  return { total: rows.length, selected: rows.filter((s) => s?.selected === true).length };
}

/* ── สรุปพื้นที่หนึ่งแถว ─────────────────────────────────────────────── */
export function surveyZoneSummary(row = {}) {
  const size = surveyZoneSize(row.parts);
  const spots = spotCounts(row.spots);
  const suggested = suggestedPackages(size.volumeCbm);
  const packageQty = Number.isFinite(Number(row.packageQty)) ? Number(row.packageQty) : null;
  return {
    ...size,
    ...{ spotsTotal: spots.total, spotsSelected: spots.selected },
    suggestedPackages: suggested,
    packageQty,
    // ต่างจากสูตรกี่แพ็คเกจ — บวก = สูงกว่าสูตร · ลบ = ต่ำกว่า
    packageDelta: suggested !== null && packageQty !== null ? packageQty - suggested : null,
    status: row.status || 'ok',
  };
}

/* ── ยอดรวมทั้งใบ ──────────────────────────────────────────────────────
   ⚠️ พื้นที่ที่ถูกตัด (`status='cut'`) ไม่นับรวมทุกตัวเลข — ไม่ใช่นับเป็น 0
      เพราะ 0 อ่านว่า "วัดแล้วได้ศูนย์" ส่วนตัดออกคือ "ไม่ได้วัด และจะไม่ขาย" */
export function surveyTotals(rows = []) {
  const active = (Array.isArray(rows) ? rows : []).filter((r) => (r?.status || 'ok') !== 'cut');
  const t = {
    zones: active.length, cutZones: (rows || []).length - active.length,
    /* พื้นที่ที่ **ช่างเพิ่มเองหน้างาน** — SA ไม่ได้ขอมา ⇒ ต้องนับแยกให้เห็น (มติข้อ 6)
       ⚠️ นับจาก `active` ไม่ใช่ `rows` — แถวที่ถูกลบทิ้งไปแล้วไม่มีทางอยู่ในลิสต์
          และแถวที่เพิ่มมาจะถูกตัดออกไม่ได้ (`PATCH` ปฏิเสธ) ⇒ สองชุดนี้ไม่ทับกัน */
    addedZones: active.filter((r) => r?.status === 'added').length,
    areaSqm: 0, volumeCbm: 0, suggestedPackages: 0, packageQty: 0,
    spotsTotal: 0, spotsSelected: 0,
  };
  for (const row of active) {
    const s = surveyZoneSummary(row);
    t.areaSqm += s.areaSqm;
    t.volumeCbm += s.volumeCbm;
    // 🔴 บวก "แพ็คเกจที่สูตรบอก" รายพื้นที่ แล้วค่อยรวม — ห้ามเอาปริมาตรรวมมาหาร
    if (s.suggestedPackages) t.suggestedPackages += s.suggestedPackages;
    if (s.packageQty) t.packageQty += s.packageQty;
    t.spotsTotal += s.spotsTotal;
    t.spotsSelected += s.spotsSelected;
  }
  t.areaSqm = Math.round(t.areaSqm * 100) / 100;
  t.volumeCbm = Math.round(t.volumeCbm * 100) / 100;
  return t;
}

/* ══ ด่านหกข้อ — บล็อกคนละที่ตามว่าใครแก้ได้ (มติผู้ใช้ 2026-08-29) ══════
 *
 * ⭐ **หลักการเดียวที่คุมทั้งหมด: ด่านต้องบล็อกเฉพาะของที่คนตรงหน้าด่านแก้เองได้**
 *   เอาทั้งหกข้อไปกองที่ปุ่มส่งผล หัวหน้าจะเจอด่านที่ตัวเองแก้ไม่ได้สามข้อ
 *   (วัดขนาด · ถ่ายภาพกว้าง · ระบุจุดหน้างาน) แล้วต้องส่งช่างกลับไปใหม่ทั้งรอบ
 *   ⇒ ดักที่ช่างตั้งแต่แรกดีกว่า เพราะตอนนั้นเขายังยืนอยู่ในที่นั้น
 *
 *   | ต้องครบทุกพื้นที่        | ด่านอยู่ที่        | ใครแก้ได้                    |
 *   |--------------------------|--------------------|------------------------------|
 *   | ขนาด ก × ย × ส           | จอหน้างาน (ช่าง)   | ช่าง — ต้องยืนหน้างานถึงวัดได้ |
 *   | ภาพกว้าง                 | จอหน้างาน (ช่าง)   | ช่าง                          |
 *   | จุดที่ติดตั้งได้ ≥ 1 จุด   | จอหน้างาน (ช่าง)   | ช่าง                          |
 *   | ภาพผัง                   | จอส่งผล (หัวหน้า)  | หัวหน้า — ช่างไม่ได้ถือผังไป   |
 *   | จุดที่เลือกติดตั้ง ≥ 1 จุด | จอส่งผล (หัวหน้า)  | หัวหน้า                       |
 *   | จำนวนแพ็คเกจ             | จอส่งผล (หัวหน้า)  | หัวหน้า                       |
 *
 * 🔴 **ไม่มีข้อไหนเป็นแค่ "เตือน"** — ทับกติกาเดิมของฟอร์มปิดงาน เพราะใบปิดงานที่ขาดรูป
 *   ยังบอกได้ว่างานเสร็จ แต่ **ใบประเมินที่ขาดรูปหรือขาดจุด คือใบที่เอาไปทำงานต่อไม่ได้เลย**
 *
 * ⚠️ พื้นที่ที่ถูก **ตัด** (`status='cut'`) ไม่ต้องผ่านด่านไหนเลย — มันคือพื้นที่ที่จะไม่ขาย
 *   บังคับให้วัดของที่ตัดทิ้งคือบังคับงานที่ไม่มีใครได้ใช้
 */

/** ชนิดไฟล์แนบของแถวผลวัด — ต้องตรงกับ `ATTACHMENT_TYPES.service_survey_zone` เป๊ะ */
export const SURVEY_DOC_WIDE = 'survey_wide';
export const SURVEY_DOC_PLAN = 'survey_plan';
export const SURVEY_DOC_SPOT = 'survey_spot';

const isCut = (row) => (row?.status || 'ok') === 'cut';

/** นับไฟล์ของแถวหนึ่งแยกตามหัวข้อ — ผู้เรียกส่ง attachments ของแถวนั้นมาให้
 *  ⚠️ รับ `[]` เมื่อยังไม่โหลดไฟล์ ⇒ ด่านจะบอกว่า "ยังไม่มีรูป" ซึ่ง **fail-closed ถูกแล้ว**
 *    (ปล่อยผ่านตอนยังไม่รู้ = ส่งใบที่ไม่มีรูปออกไปได้จริง) */
export function surveyDocCounts(files = []) {
  const rows = Array.isArray(files) ? files : [];
  const by = (docType) => rows.filter((f) => f?.docType === docType).length;
  return { wide: by(SURVEY_DOC_WIDE), plan: by(SURVEY_DOC_PLAN), spot: by(SURVEY_DOC_SPOT) };
}

/**
 * 🔑 **ด่านฝั่งหน้างาน** — พื้นที่หนึ่งแถว "บันทึกเสร็จ" หรือยัง
 * คืนอาร์เรย์ของสิ่งที่ยังขาด (ว่าง = ครบ) เพื่อให้จอโชว์เป็นเช็คลิสต์ได้ ไม่ใช่แค่ปุ่มจาง
 *
 * @param row    แถว `service_survey_zones`
 * @param files  ไฟล์แนบของแถวนั้น (`entityType='service_survey_zone'`)
 */
export function surveyFieldMissing(row = {}, files = []) {
  if (isCut(row)) return [];
  const out = [];
  const size = surveyZoneSize(row.parts);
  if (!size.complete) {
    out.push(size.parts === 0
      ? 'ยังไม่ได้วัดขนาด — เพิ่มอย่างน้อยหนึ่งส่วน'
      : `มีส่วนที่กรอกไม่ครบสามช่อง ${size.parts - size.measuredParts} ส่วน`);
  }
  const docs = surveyDocCounts(files);
  if (docs.wide === 0) out.push('ยังไม่มีภาพกว้าง');
  if (spotCounts(row.spots).total === 0) out.push('ยังไม่ได้ระบุจุดที่ติดตั้งได้');
  return out;
}

/**
 * 🔑 **ด่านฝั่งส่งผล** — พื้นที่หนึ่งแถวพร้อมส่งให้ฝ่ายขายหรือยัง
 *
 * ⚠️ **รวมของฝั่งหน้างานมาด้วยในฐานะเช็คลิสต์** — จอส่งผลต้องแสดงครบทั้งหกข้อ
 *   ปกติสามข้อบนจะติ๊กมาแล้ว ถ้าไม่ติ๊ก (ข้อมูลมาจากทางอื่น/ใบเก่า) หัวหน้าต้องเห็น
 *   ว่าติดอะไร เพื่อจะกด "แจ้งช่างให้กลับไป" ได้ ไม่ใช่เจอปุ่มเทาเงียบ
 * ⇒ ผู้เรียกแยกสองกลุ่มด้วย `field` / `result` ในผลลัพธ์
 */
export function surveyResultMissing(row = {}, files = []) {
  if (isCut(row)) return { field: [], result: [] };
  const result = [];
  const docs = surveyDocCounts(files);
  if (docs.plan === 0) result.push('ยังไม่มีภาพผังที่มาร์กจุดแล้ว');
  if (spotCounts(row.spots).selected === 0) result.push('ยังไม่ได้เลือกจุดที่จะติดตั้ง');
  if (!(Number(row.packageQty) > 0)) {
    result.push('ยังไม่ได้เคาะจำนวนแพ็คเกจ');
  } else if (packageNeedsNote(row) && !String(row.packageNote ?? '').trim()) {
    /* 🔴 **ทับสูตรแล้วต้องบอกเหตุผล** (mig 0345 · กติกาเดียวกับการตัดพื้นที่ออก)
       ของที่ต่างไปจากสิ่งที่ SA จะเสนอราคา คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน */
    result.push('แพ็คเกจต่างจากสูตร — ต้องบอกเหตุผล');
  }
  return { field: surveyFieldMissing(row, files), result };
}

/** เคาะแพ็คเกจต่างจากที่สูตรบอกไหม — `false` เมื่อยังไม่ได้เคาะ หรือคำนวณสูตรไม่ได้
 *  ⚠️ **ตรงกับสูตรไม่ต้องมีเหตุผล** — บังคับเขียนทุกแถวจะได้ข้อความขยะที่ไม่มีใครอ่าน */
export function packageNeedsNote(row = {}) {
  const suggested = suggestedPackages(surveyZoneSize(row.parts).volumeCbm);
  const qty = Number(row.packageQty);
  if (!suggested || !(qty > 0)) return false;
  return qty !== suggested;
}

/* ── ส่งผลไปแล้ว = ตัวเลขออกจากฝ่ายเราไปแล้ว ────────────────────────────────
 *
 * 🔑 **ด่านเดียวที่ทั้งช่างและหัวหน้าใช้ร่วมกัน** — `PATCH` (ผลวัด) และ `PUT` (การเคาะ)
 *   ต้องถามตัวนี้ก่อนเขียนทุกครั้ง
 *
 * 🐞 **เจอตอน UAT 06/09/2026** — จอปิดให้แล้ว (`canWrite && !sent` · `canDecide && !sent`)
 *   แต่ **server ไม่ได้ปิด** ⇒ ยิง API ตรงยังแก้ขนาด/แพ็คเกจของใบที่ส่งไปแล้วได้ 200
 *   โดยไม่มีการส่งซ้ำและไม่มีร่องรอยที่ตัวใบ ⇒ SA ถือตัวเลขชุดหนึ่ง ฐานเก็บอีกชุดหนึ่ง
 *   (กติกาเดิมของโปรเจกต์: กฎที่เขียนบนจออย่างเดียว = กฎที่ยังไม่มีจริง)
 *
 * ⭐ **ทางออกมีอยู่แล้ว ไม่ต้องสร้างของใหม่** — ปุ่ม "ยังไม่จบ" ของใบคำร้อง
 *   (`action: 'reopen'`) ล้าง `answeredAt` ทิ้งพร้อมเหตุผลที่บันทึกไว้ ⇒ แก้ต่อได้ตามปกติ
 *   ⚠️ ห้ามผูกด่านนี้กับ `status` — ใบที่ถูกดึงกลับมี status `acknowledged` เท่ากับใบที่
 *     ยังไม่เคยส่ง · สิ่งที่ตัดสินคือ "ตัวเลขออกไปหา SA แล้วหรือยัง" = `answeredAt` ตัวเดียว
 */
export function surveyEditLockError(request) {
  if (!request) return 'ไม่พบใบคำร้อง';
  if (request.cancelledAt) return 'ใบนี้ถูกยกเลิกไปแล้ว — แก้ผลประเมินไม่ได้';
  if (request.answeredAt) {
    return 'ส่งผลให้ฝ่ายขายไปแล้ว — แก้ไม่ได้ · ถ้าตัวเลขเปลี่ยน ให้กด "ยังไม่จบ" ที่ใบคำร้องก่อน';
  }
  return null;
}

/* ══ ช่างเพิ่มพื้นที่ที่เจอหน้างาน (มติข้อ 6 · §9) ═══════════════════════
 *
 * ⭐ **TS ตัดสินเองได้ ไม่ต้องรอ SA อนุมัติ** — คนที่ยืนอยู่ในตึกคือคนเดียวที่รู้ว่ามี
 *   พื้นที่ที่ใบไม่ได้ขอมา · แผนเขียนไว้ว่า "ตัดต้องมีเหตุผลบังคับ · **เพิ่มไม่ต้อง**"
 *   (ของที่ *หายไป* จากสิ่งที่ SA จะเสนอราคาคือของที่ลูกค้าจะถาม · ของที่ *เพิ่มมา*
 *   ไม่ได้ทำให้ใครเสียหาย — มันคือยอดที่โตขึ้น)
 *
 * 🔑 **ด่านเดียวกับการบันทึกผลวัด** — ใครแก้ผลวัดของใบนี้ได้ ก็เพิ่มพื้นที่ได้
 *   (`canWrite` = ช่างที่ถูกมอบหมายนัดของใบนี้ · คนคุมคิว · แอดมิน)
 *   ⚠️ `canWrite` มาจาก server เสมอ — จอไม่รู้ user id ของตัวเอง จึงคำนวณเองไม่ได้
 */
export function surveyAddZoneError(request, { canWrite = false } = {}) {
  if (!canWrite) return 'เพิ่มพื้นที่หน้างานได้เฉพาะช่างที่ถูกมอบหมายงานของใบนี้';
  return surveyEditLockError(request);
}

/* พื้นที่แถวนี้เป็นของที่ช่างเพิ่มเองหน้างานไหม — ตัวเดียวที่นิยามคำนี้
   ⚠️ ห้ามเทียบ `!zoneId` แทน — พื้นที่ที่เพิ่มหน้างาน**ได้รหัส ZN ทันที** (ต่างจากพื้นที่
      ใหม่ของ SA ที่รอถึงตอนกดส่งใบ) ⇒ `zoneId` แยกสองอย่างนี้ไม่ออก */
export const isAddedZone = (row) => (row?.status || 'ok') === 'added';

/* ══ ดึงผลประเมินกลับมาแก้ (§5E ④ · มติข้อ 25) ══════════════════════════
 *
 * ⭐ **คำนี้ล็อกไว้ทั้งระบบแล้ว** (`hops.js`): **ตีกลับ** = ผู้รับส่งคืน · **ดึงกลับ** =
 *   คนที่ส่งเอาคืนเอง ⇒ คนที่ส่งผลคือ TS ⇒ **TS เป็นคนดึงกลับ**
 *
 * 🔴 **กลไกเดิมใช้ต่อไม่ได้ ต้องมีด่านของตัวเอง** — `reopenRequestError` บล็อก
 *   `closed` ไว้ชัดเจน ("ปิดครบสองฝั่งแล้ว — เปิดกลับไม่ได้ ให้เปิดใบใหม่") แต่กรณีนี้
 *   คือ **หลัง SA ปิดใบไปแล้วพอดี** ⇒ เป็นความสามารถใหม่ ไม่ใช่การใช้ของเดิมซ้ำ
 *   ⚠️ **เปิดประตูแคบเฉพาะใบประเมิน** — ไม่แตะ `reopenRequestError` ซึ่งเป็นกติกากลาง
 *     ของทุกหัวข้อ (เปิดกว้างเมื่อไร ทุกฝ่ายลากใบที่ปิดแล้วกลับมาได้)
 *
 * ⚠️ **แก้ทับของรอบเดิมได้ ไม่ขัดมติข้อ 8** — ข้อ 8 พูดถึง *คนละรอบวัด* (ไปวัดใหม่)
 *   ส่วนนี่คือ *รอบเดิมที่กรอกผิด* ⇒ ไม่สร้างแถวผลวัดใหม่
 *
 * 🔴 **จุดอันตรายที่สุดของทั้งแผน** — SA อาจเอาตัวเลขผิดไปเสนอราคาไปแล้ว
 *   ⇒ กระดิ่งต้องบอก **ส่วนต่างเก่า→ใหม่** ตรง ๆ ไม่ใช่แค่ "ใบถูกแก้"
 */
export function surveyRecallError(request, { reason = '', canRecall = false } = {}) {
  if (!canRecall) return 'ดึงผลกลับมาแก้ได้เฉพาะหัวหน้าฝ่ายบริการ';
  if (!request) return 'ไม่พบใบคำร้อง';
  if (request.cancelledAt) return 'ใบนี้ถูกยกเลิกไปแล้ว';
  // ยังไม่เคยส่งผล = ไม่มีอะไรให้ดึงกลับ (แก้ได้อยู่แล้วตามปกติ)
  if (!request.answeredAt) return 'ยังไม่ได้ส่งผล — แก้ได้เลยที่จอสรุปส่งผล';
  if (String(reason).trim().length < 10) {
    return 'ต้องบอกเหตุผลอย่างน้อย 10 ตัวอักษร — ฝ่ายขายจะเห็นข้อความนี้';
  }
  return null;
}

/* ส่วนต่างของตัวเลขที่ส่งไปแล้ว vs ที่กำลังจะส่งใหม่ — คืน `[]` เมื่อไม่มีอะไรเปลี่ยน
   ⚠️ เทียบเฉพาะเลขที่ SA เอาไปใช้ตั้งราคาจริง — จำนวนพื้นที่ · ตร.ม. · แพ็คเกจ
     (จุดติดตั้งไม่นับ: มันเป็นของหน้างาน ไม่ใช่ตัวคูณราคา) */
export function surveyTotalsDiff(before = null, after = null) {
  if (!before || !after) return [];
  const fields = [
    ['zones', 'พื้นที่'],
    ['areaSqm', 'ตร.ม.'],
    ['packageQty', 'แพ็คเกจ'],
  ];
  const out = [];
  for (const [key, label] of fields) {
    const a = Number(before[key]);
    const b = Number(after[key]);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a === b) continue;
    out.push(`${label} ${a} → ${b}`);
  }
  return out;
}

/**
 * 🔑 **ด่านเดียวที่ทั้งปุ่มบนจอและ API ใช้ร่วมกัน** — คืนข้อความไทยเมื่อส่งผลไม่ได้ หรือ `null`
 *
 * @param rows          ทุกแถวของใบ
 * @param filesByZone   `{ [zoneRowId]: ไฟล์ของแถวนั้น }`
 * @param ctx.canSend   ผู้ใช้เป็นคนที่ส่งผลได้ไหม (หัวหน้า TS — **ไม่ใช่** `canEditService`
 *                      ที่ช่างทุกคนผ่าน · ผู้เรียกคำนวณมาให้)
 *
 * ⚠️ fail-closed: ไม่ส่งบริบทมา = ปฏิเสธ
 */
export function surveySendError(rows = [], filesByZone = {}, { canSend = false } = {}) {
  if (!canSend) return 'ส่งผลประเมินได้เฉพาะหัวหน้าฝ่ายบริการ';
  const active = (Array.isArray(rows) ? rows : []).filter((r) => !isCut(r));
  if (!active.length) return 'ใบนี้ไม่มีพื้นที่ที่ต้องประเมินเหลืออยู่เลย';

  /* ⚠️ **บอกชื่อพื้นที่ที่ติด ไม่ใช่แค่ "ยังไม่ครบ"** — ใบหนึ่งมีได้สิบพื้นที่
     ข้อความที่ไม่บอกว่าพื้นที่ไหน แปลว่าหัวหน้าต้องไล่เปิดทีละอันเอง */
  const stuck = [];
  for (const row of active) {
    const miss = surveyResultMissing(row, filesByZone?.[row.id] || []);
    const all = [...miss.field, ...miss.result];
    if (all.length) stuck.push(`${row.zoneName || 'พื้นที่'}: ${all.join(' · ')}`);
  }
  if (stuck.length) {
    const show = stuck.slice(0, 3).join(' | ');
    return `ยังส่งผลไม่ได้ — ${show}${stuck.length > 3 ? ` และอีก ${stuck.length - 3} พื้นที่` : ''}`;
  }
  return null;
}

/** ความคืบหน้าหน้างานของทั้งใบ — หัวจอมือถือ ("วัดแล้ว 3 / 5 พื้นที่") */
export function surveyFieldProgress(rows = [], filesByZone = {}) {
  const active = (Array.isArray(rows) ? rows : []).filter((r) => !isCut(r));
  const done = active.filter((r) => surveyFieldMissing(r, filesByZone?.[r.id] || []).length === 0);
  return { total: active.length, done: done.length, complete: active.length > 0 && done.length === active.length };
}
