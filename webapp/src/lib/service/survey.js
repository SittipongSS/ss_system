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

/* ══ "ที่ขอไป" เทียบ "ที่ได้กลับมา" (มติข้อ 6 · แผน §9 ข้อ 2) ═══════════
 *
 * ⭐ **ตัวเลขที่ SA ไม่มีทางรู้เองจากตาราง** — เขาขอไป 5 พื้นที่ ได้ผลกลับมา 5 พื้นที่
 *   ดูผ่าน ๆ เหมือนไม่มีอะไรเปลี่ยน ทั้งที่จริง TS ตัดทิ้ง 1 และเพิ่มเองอีก 1
 *   ⇒ ตัวเลขต้องกางออกให้เห็นทั้งสี่ตัว ไม่ใช่ให้ไปไล่นับป้ายบนแถวเอง
 *
 * 🔴 **"ขอไป" เป็นตัวเลขตัวเดียวในไฟล์นี้ที่ต้องนับแถวที่ถูกตัดด้วย** — สวนทางกับกติกา
 *   ของทั้งไฟล์ที่ว่าแถว `cut` "ไม่นับรวมทุกตัวเลข ไม่ใช่นับเป็น 0" ⇒ **ห้ามรีไซเคิล
 *   `totals.zones`** ซึ่งกรองแถวที่ถูกตัดออกไปแล้ว
 *
 * ⚠️ `requested` เชื่อถือได้เพราะ **ด่านสองข้อในโค้ด ไม่ใช่เพราะโครงสร้างข้อมูล**:
 *   `PATCH` ห้ามตัดแถวที่เพิ่มหน้างาน · `DELETE` ลบได้เฉพาะแถวที่เพิ่มหน้างาน
 *   ⇒ สองชุดไม่ทับกัน และการลบไม่ทำให้ "ขอไป" หด · CHECK ของ DB ไม่ได้ผูกให้
 *   (ถ้าวันหนึ่งด่านนั้นเปิด ต้องกลับมาแก้ที่นี่ — `assessed` นับจากแถวจริงจึงยังถูกเสมอ)
 */
export function surveyChangeCounts(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  const cut = list.filter(isCut);
  const added = list.filter(isAddedZone);
  const name = (r) => String(r?.zoneName || '').trim();
  return {
    requested: list.length - added.length,
    cut: cut.length,
    added: added.length,
    // นับจากแถวจริงเสมอ ไม่ใช่ requested - cut + added (ดูคำเตือนข้างบน)
    assessed: list.length - cut.length,
    cutNames: cut.map(name).filter(Boolean),
    addedNames: added.map(name).filter(Boolean),
  };
}

/** ชื่อในวงเล็บแบบที่ม็อกเขียน — เกินสองอันแล้วยุบ ไม่งั้นบรรทัดยาวจนอ่านไม่ออก */
function nameHint(names = []) {
  const list = (names || []).filter(Boolean);
  if (!list.length) return '';
  if (list.length <= 2) return ` (${list.join(' · ')})`;
  return ` (${list.slice(0, 2).join(' · ')} และอีก ${list.length - 2})`;
}

/**
 * 🔑 **ข้อความเดียว ใช้ทั้งจอ TS · จอ SA · กระดิ่ง** — เขียนคนละที่เมื่อไรมันเพี้ยนหากัน
 *
 * ⭐ **สองเสียงจากตัวสร้างตัวเดียว** (ตามม็อก): บนจอของ TS เองพูดว่า "ตัด 1 (ห้องน้ำชาย)"
 *   — เขารู้อยู่แล้วว่าใครทำ และเขาต้องการชื่อไว้ตรวจก่อนกดส่ง · ส่วนฝั่ง SA พูดว่า
 *   "TS ตัด 1" — เขาต้องรู้ว่าใครเป็นคนตัด มากกว่าจะรู้ชื่อพื้นที่ (ซึ่งมีในตารางข้างล่างแล้ว)
 *
 * ⚠️ หน่วยคือ **"พื้นที่"** ไม่ใช่ "โซน" — ม็อกชุดเก่ายังเขียนว่าโซน แต่มติข้อ 19
 *   เปลี่ยนคำไปแล้ว และ "จุด" สงวนไว้ให้ *จุดติดตั้ง* เท่านั้น
 */
export function surveyChangeText(counts = {}, { actor = '', withNames = false } = {}) {
  const requested = Number(counts.requested) || 0;
  const cut = Number(counts.cut) || 0;
  const added = Number(counts.added) || 0;
  const head = `ขอไป ${requested} พื้นที่`;
  // ไม่มีอะไรเปลี่ยน = ต้องพูดออกมาตรง ๆ ไม่ใช่เงียบ (ม็อก: "ไม่มีตัด ไม่มีเพิ่ม")
  if (!cut && !added) return `${head} · ไม่มีตัด ไม่มีเพิ่ม`;

  const who = actor ? `${actor} ` : '';
  const parts = [];
  if (cut) parts.push(`${who}ตัด ${cut}${withNames ? nameHint(counts.cutNames) : ''}`);
  if (added) parts.push(`${cut ? '' : who}เพิ่ม ${added}${withNames ? nameHint(counts.addedNames) : ''}`);
  return `${head} · ${parts.join(' · ')} ⇒ ประเมินจริง ${Number(counts.assessed) || 0} พื้นที่`;
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
/* ══ ทะเบียนด่านหกข้อ — ประกาศที่เดียว ══════════════════════════════════
 *
 * 🔴 **เจ้าของด่านต้องอ่านออกจากข้อมูล ไม่ใช่จากลำดับที่คนเขียนจำได้** — จอสรุปต้องแยก
 *   "ข้อที่ช่างเท่านั้นแก้ได้" ออกจาก "ข้อที่หัวหน้าแก้เองได้" เพื่อวางปุ่ม
 *   "แจ้งช่างให้กลับไป" ให้ถูกข้อ ⇒ `owner` เป็นข้อมูลของด่าน ไม่ใช่ของจอ
 *
 * ⚠️ **ลำดับในลิสต์คือลำดับที่ผู้ใช้เห็น** และเป็นลำดับเดียวกับที่ข้อความ "ยังขาด…"
 *   เคยเรียงมาแต่เดิม — สลับเมื่อไร ข้อความบนจอสลับตาม
 * ⚠️ `missing(row, files)` คืน **ข้อความไทยหรือ `null`** — ห้ามคืน boolean เปล่า
 *   เพราะข้อความบอกได้ละเอียดกว่า ("ครบไม่ครบสามช่องกี่ส่วน")
 */
export const SURVEY_GATES = [
  {
    key: 'size',
    owner: 'crew',
    label: 'ขนาด ก × ย × ส ครบทุกพื้นที่',
    missing: (row) => {
      const size = surveyZoneSize(row.parts);
      if (size.complete) return null;
      return size.parts === 0
        ? 'ยังไม่ได้วัดขนาด — เพิ่มอย่างน้อยหนึ่งส่วน'
        : `มีส่วนที่กรอกไม่ครบสามช่อง ${size.parts - size.measuredParts} ส่วน`;
    },
  },
  {
    key: 'wide',
    owner: 'crew',
    label: 'ภาพกว้างครบทุกพื้นที่',
    missing: (row, files) => (surveyDocCounts(files).wide === 0 ? 'ยังไม่มีภาพกว้าง' : null),
  },
  {
    key: 'spots',
    owner: 'crew',
    label: 'จุดที่ติดตั้งได้ อย่างน้อย 1 จุดต่อพื้นที่',
    missing: (row) => (spotCounts(row.spots).total === 0 ? 'ยังไม่ได้ระบุจุดที่ติดตั้งได้' : null),
  },
  {
    key: 'plan',
    owner: 'head',
    label: 'ภาพผังที่มาร์กจุดแล้ว',
    missing: (row, files) => (surveyDocCounts(files).plan === 0 ? 'ยังไม่มีภาพผังที่มาร์กจุดแล้ว' : null),
  },
  {
    key: 'picked',
    owner: 'head',
    label: 'เลือกจุดที่จะติดตั้งแล้ว',
    missing: (row) => (spotCounts(row.spots).selected === 0 ? 'ยังไม่ได้เลือกจุดที่จะติดตั้ง' : null),
  },
  {
    key: 'package',
    owner: 'head',
    label: 'เคาะจำนวนแพ็คเกจแล้ว',
    missing: (row) => {
      if (!(Number(row.packageQty) > 0)) return 'ยังไม่ได้เคาะจำนวนแพ็คเกจ';
      /* 🔴 **ทับสูตรแล้วต้องบอกเหตุผล** (mig 0345 · กติกาเดียวกับการตัดพื้นที่ออก)
         ของที่ต่างไปจากสิ่งที่ SA จะเสนอราคา คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน */
      if (packageNeedsNote(row) && !String(row.packageNote ?? '').trim()) {
        return 'แพ็คเกจต่างจากสูตร — ต้องบอกเหตุผล';
      }
      return null;
    },
  },
];

const gatesOf = (owner) => SURVEY_GATES.filter((g) => g.owner === owner);

const missingFor = (owner, row, files) => gatesOf(owner)
  .map((gate) => gate.missing(row, files || []))
  .filter(Boolean);

export function surveyFieldMissing(row = {}, files = []) {
  if (isCut(row)) return [];
  return missingFor('crew', row, files);
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
  return { field: missingFor('crew', row, files), result: missingFor('head', row, files) };
}

/**
 * 🔑 **เช็คลิสต์ด่านของทั้งใบ แยกตามเจ้าของ** — ของที่จอสรุปต้องกางให้หัวหน้าเห็น
 *
 * 🐞 **วันนี้จอกลืนสองกลุ่มรวมกัน** — `SurveyResultTable` เคย `[...field, ...result].join(' · ')`
 *   ลงคอลัมน์เดียว ⇒ หัวหน้าเห็นประโยคยาวประโยคเดียวโดยไม่รู้ว่าข้อไหนตัวเองแก้ได้
 *   และข้อไหนต้องให้ช่างกลับไป ทั้งที่ตัวแยกมีมาตั้งแต่แรก (แค่ไม่มีใครใช้)
 *
 * ⚠️ นับจาก **พื้นที่ที่ยังอยู่ในใบ** เท่านั้น — แถวที่ถูกตัดออกไม่ต้องผ่านด่านไหนเลย
 *   (บังคับให้วัดของที่ตัดทิ้ง คือบังคับงานที่ไม่มีใครได้ใช้)
 *
 * @returns `[{ key, owner, label, ok, done, total, zones: [ชื่อพื้นที่ที่ยังขาด] }]`
 */
export function surveyGateChecklist(rows = [], filesByZone = {}) {
  const active = (Array.isArray(rows) ? rows : []).filter((r) => !isCut(r));
  return SURVEY_GATES.map((gate) => {
    const zones = [];
    for (const row of active) {
      if (gate.missing(row, filesByZone?.[row.id] || [])) {
        zones.push(String(row.zoneName || '').trim() || 'พื้นที่ไม่มีชื่อ');
      }
    }
    return {
      key: gate.key,
      owner: gate.owner,
      label: gate.label,
      ok: zones.length === 0,
      done: active.length - zones.length,
      total: active.length,
      zones,
    };
  });
}

/** ด่านที่ยังติดและ **ช่างเท่านั้นที่แก้ได้** — ตัวเดียวที่ตัดสินว่าปุ่ม "แจ้งช่างให้กลับไป"
 *  มีเรื่องให้แจ้งไหม · ทั้งปุ่มบนจอและ route ถามตัวนี้ */
export function surveyCrewGaps(rows = [], filesByZone = {}) {
  return surveyGateChecklist(rows, filesByZone).filter((g) => g.owner === 'crew' && !g.ok);
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

/* ══ แจ้งช่างให้กลับไป (แผน §5.4 บรรทัด 604) ═════════════════════════════
 *
 * 🐞 **หัวหน้าเจอทางตันมาตั้งแต่เฟส 3** — ด่านสามข้อบนของหกข้อเป็นของช่าง (ขนาด ·
 *   ภาพกว้าง · จุดที่ติดตั้งได้) ซึ่ง **หัวหน้าแก้เองไม่ได้ ต้องยืนอยู่หน้างานถึงจะทำได้**
 *   ⇒ วันนี้เขาเห็นแค่ปุ่มส่งผลที่กดไม่ได้ กับประโยคยาวประโยคเดียวที่รวมทุกข้อไว้ด้วยกัน
 *   และ **ไม่มีทางบอกช่างในระบบเลย** ต้องเดินไปตามหรือโทร
 *   ⭐ แผนเขียนคำนี้ไว้เอง: "ไม่ใช่ปุ่มเทาเงียบ" — ปุ่มที่กดไม่ได้ต้องมีทางออกอยู่ข้าง ๆ
 *
 * 🔴 **ทิศทางที่สาม — คำเดิมใช้ไม่ได้ทั้งคู่** (`hops.js`)
 *   **ตีกลับ** = ผู้รับเรื่องส่งคืนผู้ยื่น (TS → SA) · **ดึงกลับ** = คนที่ส่งเอาคืนเอง
 *   ส่วนนี่คือ **หัวหน้า → ลูกน้องในฝ่ายเดียวกัน** ซึ่งไม่ข้ามฝ่ายเลย ⇒ ใช้คำของม็อกตรง ๆ
 *
 * ⚠️ **ไม่แตะสถานะใบและไม่แตะนัด** — ต่างจาก "เข้าพื้นที่ไม่ได้" (§5E ②) ที่ถอยใบกลับ
 *   ขั้นลงคิวเพราะยังไม่มีผลวัดสักแถว · กรณีนี้ผลวัดค้างอยู่บนใบแล้ว และของที่ขาดจะถูก
 *   เติม **ลงแถวเดิม** (`UNIQUE (requestId, zoneId)` ห้ามใบเดียวมีสองแถวต่อพื้นที่)
 *   ⇒ มันคือ "รอบเดิมที่ยังไม่จบ" ไม่ใช่รอบวัดใหม่ ⇒ ถอยขั้นเมื่อไรคือทิ้งงานที่ทำมาแล้ว
 *   ⚠️ และพลิกนัดที่ปิดว่า `done` ให้เป็น `unable` เพื่อยืมกลไกเดิม = โกหกประวัติ
 */
export function surveySendBackError(request, {
  canSend = false, note = '', gaps = [], crewIds = [],
} = {}) {
  if (!canSend) return 'แจ้งช่างให้กลับไปได้เฉพาะหัวหน้าฝ่ายบริการ';
  const locked = surveyEditLockError(request);
  if (locked) return locked;
  if (!gaps.length) {
    return 'ของฝั่งหน้างานครบทุกข้อแล้ว — ไม่มีอะไรให้ช่างกลับไปทำ';
  }
  /* 🔴 **ปุ่มที่แจ้งไม่ถึงใครคือปุ่มที่โกหก** — กระดิ่งของใบคำร้องไปหาผู้ขอ (SA) เท่านั้น
     ช่างไม่อยู่ในทะเบียนผู้รับ และเปิดหน้าคำร้องก็ไม่ได้ (403) ⇒ คนที่จะได้รับแจ้งจริง
     มีทางเดียวคือคนที่ถูกมอบหมายบน **นัด** ของใบนี้ */
  if (!crewIds.length) {
    return 'ใบนี้ยังไม่มีช่างที่ถูกมอบหมาย — แจ้งไม่ถึงใคร ให้ลงคิวก่อน';
  }
  if (String(note).trim().length < 10) {
    return 'ต้องบอกว่าให้กลับไปทำอะไร อย่างน้อย 10 ตัวอักษร — ช่างจะเห็นข้อความนี้';
  }
  return null;
}

/** ข้อความบรรทัดเธรด/กระดิ่ง — เขียนที่เดียว ใช้ทั้ง route และเทสต์
 *  ⚠️ ต้องบอก **ข้อที่ติดพร้อมชื่อพื้นที่** ไม่ใช่แค่ "ยังไม่ครบ" — ช่างต้องรู้ว่าไปที่ไหน
 *    ทำอะไร โดยไม่ต้องเปิดจอไล่อ่านทีละพื้นที่ */
export function surveySendBackBody(gaps = [], note = '') {
  const lines = (gaps || []).map((g) => `${g.label} — ขาด ${g.zones.join(' · ')}`);
  return `หัวหน้าแจ้งให้กลับไปเก็บงานหน้างาน — ${String(note).trim().slice(0, 300)}`
    + (lines.length ? ` · ${lines.join(' · ')}` : '');
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
