// ── ตรรกะของใบประเมินพื้นที่ (mig 0314) — ไม่แตะ DB ─────────────────────
//
// ⭐ ที่มา: ฝ่ายขายต้องรู้ว่าพื้นที่ต้องใช้กี่แพ็คเกจก่อนตั้งราคา แต่ไม่มีใครรู้
// จนกว่าจะมีคนไปวัด · ไฟล์นี้คือกฎทั้งหมดที่ทั้งจอและ server ต้องถามตัวเดียวกัน
//
// 🔴 **ห้ามให้ปุ่มบนจอตัดสินเองแยกจาก server** — เงื่อนไขที่ปุ่มรู้แต่ server ไม่รู้
// คือปุ่มที่จางเงียบโดยไม่บอกเหตุ (กติกาเดิมของ lib/requests/stages.js)
//
// 📍 **กฎอยู่ที่นี่ · การประกอบหน้าจออยู่ที่ `surveyControl.js`** — ตัวที่บอกว่าการ์ดควบคุม
// วาดอะไร (สถานะ/โทน/เหตุผลที่กดส่งไม่ได้/ค่าเปิด-ปิดพื้นที่) แยกไปไฟล์ข้าง ๆ และ
// **ถามตัวในไฟล์นี้ทั้งหมด** ⇒ กฎใหม่ของใบประเมินเขียนที่นี่เสมอ ไม่ใช่ที่นั่น
// (เขียนที่นั่นเมื่อไร จะได้กฎที่ server มองไม่เห็น ซึ่งคือบั๊กที่ไฟล์นี้เกิดมาเพื่อกัน)
//
// 🔑 **วิธีประเมินรายพื้นที่ (ลงหน้างาน / จากแบบ · mig 0408) ถามผ่าน `surveyMethod.js` เท่านั้น** — ไฟล์นี้
// ไม่เทียบค่าคอลัมน์ `method` เอง · โมดูลนั้นเป็นโมดูลใบ (ไม่ดึงใครเข้ามา) จึงดึงได้โดยไม่เกิดวงกลม
// กับ `attachmentTypes.js` ที่ดึงไฟล์นี้อยู่
import { fmtNumber } from '@/lib/format';
import { isDrawingZone, isJpgOrPngFile, surveyZoneNeedsResave } from '@/lib/service/surveyMethod';

/* ── ขนาดแพ็คเกจมาจากทะเบียน (mig 0398 · มติเจ้าของ 01/10) ─────────────────
   🔄 สูตรเดิม "2,400 ลบ.ม. = 1 แพ็คเกจ · ceil(ลบ.ม. ÷ 2,400)" **ถอดแล้ว** — พื้นที่หนึ่งมี **ขนาดเดียว + จำนวน**
      ระบบเสนอขนาดจากช่วง ลบ.ม. ของทะเบียน และเสนอจำนวน 1 (`suggestedPackageSize` · `packageSizes.js`)
   ⚠️ ไฟล์นี้ **ไม่รู้จักทะเบียน** — ด่านทุกข้อที่นี่อ่านจากแถวล้วน (ภาพนิ่ง `packageSize` · `packageSizeSuggested` ·
      `packageSizeManual` ที่ route ประทับตอนเคาะ) ⇒ หน้าคำร้องของฝ่ายขายใช้ด่านเดิมได้โดยไม่ต้องโหลดทะเบียน
      · ข้อเดียวที่ต้องเทียบทะเบียน ("ขนาดถูกลบ") อยู่ที่ `packageSizes.js` ซึ่ง import ไฟล์นี้ (ห้ามย้อนทาง = วงวน)
   🪤 อย่าสับสนกับ `suggestStandardMl` (1 แพ็คเกจ = 1 ลิตร/เดือน) ซึ่งเป็นความสัมพันธ์ **แพ็คเกจ ↔ น้ำหอม** คนละแกนกัน */

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const isBlankText = (value) => String(value ?? '').trim() === '';

/* ── ตัวเลขเมตรจากช่องกรอก ──────────────────────────────────────────────
   `''` → null (ยังไม่ได้ระบุ) · `'7,5'` → 7.5 · `'x'` → NaN (พิมพ์มาแต่ไม่ใช่ตัวเลข)
   🐞 เดิมใช้ `Number(value)` ตรง ๆ ⇒ `Number('')` = 0 ⇒ ช่องที่ช่างยังไม่ได้กรอกถูกฟ้องว่า
      "ต้องมากกว่า 0" ทั้งที่เขาไม่ได้พิมพ์ 0 · สามเหตุต้องแยกกัน เพราะทางแก้คนละทาง
   ⭐ **"," = จุดทศนิยม** — แป้นทศนิยมของมือถือบางภาษาให้จุลภาคแทนจุด · เพดาน 500 ม.
      ⇒ ไม่มีค่าจริงที่ต้องใช้จุลภาคคั่นหลักพัน
   🐞 UAT 25/09 — ช่องเป็นข้อความอิสระแล้ว (ไม่ใช่ type=number ที่เบราว์เซอร์กรองให้) ⇒ `Number()` รับ
      '0x1F' → 31 · '1e2' → 100 · '+5' → 5 และ **'1,200' → 1.2**: พิมพ์ผิดหน่วยแบบคั่นหลักพันหลบเพดาน 500 ม.
      ไปเงียบ ๆ แล้วไหลเข้าพื้นที่/ปริมาตร/แพ็คเกจ ⇒ รับเฉพาะเลขล้วน + ทศนิยมหนึ่งตัว (จุด/จุลภาค)
      · **รูปหลักพัน `1,200` กำกวม = NaN** (ข้อความบอกให้ใช้จุด — `metersNanHint`) · ขึ้นต้นด้วย 0 ไม่กำกวม
      ⚠️ ราคาที่จ่าย: แป้นจุลภาคพิมพ์ทศนิยมสามตำแหน่ง ('1,250') ไม่ได้ ต้องใช้จุด
      · '.5' / '5.' ยังเป็นตัวเลข (ช่อง type=number เดิมก็รับ) · ติดลบอ่านเป็นตัวเลข ⇒ ได้คำว่า "ต้องมากกว่า 0" ไม่ใช่
        "ต้องเป็นตัวเลข" ซึ่งฟังผิดตอนที่สิ่งที่พิมพ์เป็นตัวเลขจริง */
const SURVEY_METERS_TEXT = /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/;
const SURVEY_METERS_THOUSANDS = /^[1-9]\d{0,2},\d{3}$/;

export function parseSurveyMeters(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (!SURVEY_METERS_TEXT.test(text) || SURVEY_METERS_THOUSANDS.test(text)) return NaN;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

/* ท้ายคำว่า "ต้องเป็นตัวเลข" เมื่อช่างพิมพ์รูปหลักพัน — บอกว่ากำกวมยังไง และทางออกคือจุด · รูปอื่น = ไม่เติม */
function metersNanHint(raw) {
  const text = String(raw ?? '').trim();
  if (!SURVEY_METERS_THOUSANDS.test(text)) return '';
  return ` — ${text} อ่านได้ทั้ง ${Number(text.replace(',', '.'))} และ ${text.replace(',', '')} · ทศนิยมให้ใช้จุด`;
}

const SURVEY_DIMS = [['widthM', 'กว้าง'], ['lengthM', 'ยาว'], ['heightM', 'สูง']];
const SURVEY_METERS_MAX = 500;

/* เหตุที่ค่าหนึ่งช่องใช้ไม่ได้ — `null` = ใช้ได้ · ตัวเดียวที่ทั้ง server และจอถาม */
function meterProblem(value) {
  if (value === null) return 'missing';
  if (Number.isNaN(value)) return 'nan';
  if (value <= 0) return 'min';
  // เพดานกันพิมพ์ผิดหลัก — 500 ม. คือความยาวสนามบิน ไม่ใช่โซนในห้าง
  if (value > SURVEY_METERS_MAX) return 'max';
  return null;
}

/* ── ส่วนของพื้นที่หนึ่งส่วน ────────────────────────────────────────────
   พื้นที่จริงไม่ใช่กล่องสี่เหลี่ยม — รูปตัว L แบ่งเป็นสองก้อนแล้วบวกกัน
   ⚠️ กรอกไม่ครบสามช่อง = **แถวเสีย ต้องตีกลับ** ไม่ใช่แถวที่คิดเป็น 0
   ⚠️ **แถวว่างทั้งแถวไม่ใช่แถวเสีย** — ตัดสินที่ `normalizeSurveyParts` ก่อนมาถึงตัวนี้
   `field` บอกช่องที่ติด — จอเอาไปเขียนเป็น "ส่วน B ยังขาดความสูง" (server ใช้แค่ `error`) */
export function normalizeSurveyPart(input = {}) {
  const src = input && typeof input === 'object' ? input : {};
  const out = { id: String(src.id ?? '').trim() || null, label: String(src.label ?? '').trim() || null };
  for (const [field, label] of SURVEY_DIMS) {
    const value = parseSurveyMeters(src[field]);
    const fail = (error) => ({ value: null, error, field });
    switch (meterProblem(value)) {
      case 'missing': return fail(`ส่วนของพื้นที่: ต้องระบุ${label} (เมตร)`);
      case 'nan': return fail(`ส่วนของพื้นที่: ${label}ต้องเป็นตัวเลข${metersNanHint(src[field])}`);
      case 'min': return fail(`ส่วนของพื้นที่: ${label}ต้องมากกว่า 0`);
      case 'max': return fail(`ส่วนของพื้นที่: ${label} ${value} เมตร ดูเหมือนพิมพ์ผิดหลัก`);
      default: out[field] = value;
    }
  }
  return { value: out, error: null };
}

/* ── แถวว่าง ≠ แถวเสีย ──────────────────────────────────────────────────
   🐞 **ตัดพื้นที่ที่ยังไม่เคยวัดไม่ได้** (เจอตอนรื้อจอหน้างาน 25/09) — การ์ดเปิดพื้นที่ที่ยัง
   ไม่มีขนาดด้วย "ส่วน" ว่างหนึ่งแถวเสมอ (ให้มีช่องให้กรอก) แล้วส่งร่างทั้งก้อนไปพร้อมคำขอตัด
   ⇒ server ตีกลับ "ต้องระบุกว้าง" ⇒ ทางออกที่ข้อความส่งงานชี้ให้ใช้ ใช้ไม่ได้กับพื้นที่ที่
   ต้องใช้มันที่สุด · กด "+ เพิ่มจุด" แล้วไม่ได้พิมพ์ก็ล็อกการบันทึกทั้งพื้นที่แบบเดียวกัน
   ⇒ **ทุกช่องที่คนพิมพ์ได้ว่างหมด = ไม่มีแถวนี้** (id ไม่นับ — ไม่ใช่ของที่คนพิมพ์) · ทิ้งก่อน
     นับเพดาน · มีช่องไหนมีค่าแม้แต่ชื่อ = แถวที่ตั้งใจกรอก ยังเจอด่านเต็มเหมือนเดิม
   ⚠️ ของแปลกที่ไม่ใช่ออบเจกต์ (สตริง/ตัวเลข) ไม่นับว่าว่าง — ต้องไปเจอด่านแล้วถูกตีกลับ
   ⚠️ กฎเดียวกับ `surveyZoneDraftSignature` (แถวว่างไม่นับเป็นค่าค้าง) — เปลี่ยนที่หนึ่งต้องดูอีกที่ */
const isBlankRow = (raw, fields) => {
  if (raw === null || raw === undefined) return true;
  if (typeof raw !== 'object' || Array.isArray(raw)) return false;
  return fields.every((field) => isBlankText(raw[field]));
};
export const isBlankSurveyPart = (raw) => isBlankRow(raw, ['label', 'widthM', 'lengthM', 'heightM']);
export const isBlankSurveySpot = (raw) => isBlankRow(raw, ['label', 'note']);

const SURVEY_PARTS_MAX = 20;
const SURVEY_SPOTS_MAX = 30;

/**
 * แถวส่วน/จุดที่ส่งมา **ว่างทุกแถว** (ไม่ใช่อาร์เรย์ว่าง) — แท็บรุ่นเก่า (การ์ดพื้นที่ก่อนแบบ A) ส่งส่วนว่างที่จอเติมให้ไปทั้งก้อนทุกครั้ง
 * 🐞 review 26/09 รอบสาม: ตัวจัดแถวตัดแถวว่างทิ้งเหลือ `[]` ⇒ ทับขนาดที่อีกคนเพิ่งวัด (เดิมแถวว่างโดนตีกลับ "ต้องระบุกว้าง")
 *   ⇒ route ถือว่า "ไม่ได้ส่งช่องนี้" เมื่อไม่มี `baseUpdatedAt` (จอรุ่นใหม่ไม่เคยส่งแถวว่าง — ล้างทั้งหมดส่ง `[]` ชัด ๆ)
 */
export function surveyOnlyBlankRows(rows, keys = []) {
  if (!Array.isArray(rows) || !rows.length) return false;
  return rows.every((row) => keys.every((k) => String(row?.[k] ?? '').trim() === ''));
}

/** ส่วนที่วัด — `[{ id, label, widthM, lengthM, heightM }]` (ย้ายมาจาก route PATCH ของช่าง)
 *  `undefined` = ไม่แตะช่องนี้ · `newId` = ตัวออก id ของ server (จอไม่ส่ง — แถวใหม่บนจอมี
 *  id ชั่วคราวอยู่แล้ว และไฟล์นี้ต้องไม่แตะอะไรนอกจากตรรกะ) */
export function normalizeSurveyParts(input, { newId } = {}) {
  if (input === undefined) return { value: undefined, error: null };
  if (!Array.isArray(input)) return { value: null, error: 'รายการส่วนของพื้นที่ไม่ถูกต้อง' };
  const rows = input.filter((raw) => !isBlankSurveyPart(raw));
  if (rows.length > SURVEY_PARTS_MAX) {
    return { value: null, error: `แบ่งส่วนได้ไม่เกิน ${SURVEY_PARTS_MAX} ส่วนต่อพื้นที่` };
  }
  const out = [];
  for (const raw of rows) {
    const { value, error } = normalizeSurveyPart(raw);
    if (error) return { value: null, error };
    out.push({ ...value, id: value.id || newId?.() || null });
  }
  return { value: out, error: null };
}

/* จุดหนึ่งจุด — `field` บอกช่องที่ติดเหมือน `normalizeSurveyPart` */
function normalizeSurveySpot(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const label = String(src.label ?? '').trim();
  if (!label) return { value: null, error: 'จุดติดตั้งต้องมีชื่อ', field: 'label' };
  if (label.length > 100) {
    return { value: null, error: `ชื่อจุด "${label.slice(0, 20)}…" ยาวเกิน 100 ตัวอักษร`, field: 'label' };
  }
  const note = String(src.note ?? '').trim();
  if (note.length > 300) return { value: null, error: 'บันทึกของจุดยาวเกิน 300 ตัวอักษร', field: 'note' };
  return { value: { id: String(src.id ?? '').trim() || null, label, note: note || null }, error: null };
}

/** จุดที่ติดตั้งได้ — ช่างเพิ่มรายการเอง จุดละชื่อ (รูปผูกทีหลังผ่านไฟล์แนบ)
 *  🔴 **จุดต้องมีตัวตนแม้ยังไม่มีรูป** — ถ้าออกแบบให้ "จุด = รูปที่มีป้ายชื่อ" จุดที่ยัง
 *    ไม่ได้ถ่ายจะไม่มีอยู่ในระบบ แล้วช่างไม่มีทางรู้ว่าเหลือถ่ายอะไร
 *  ⚠️ `selected` **ไม่รับจากฝั่งนี้** — คงค่าเดิมที่หัวหน้าเคาะไว้ (`before`) เสมอ
 *  ⭐ `defaultSelected` = ค่าของ **จุดที่เพิ่งเพิ่ม** (id ไม่อยู่ใน `before`) — พื้นที่จากแบบส่ง `true`
 *    (แผน survey-desk-assessment §2 ข้อ 5: หัวหน้าเพิ่มจุดเองที่โต๊ะ = จุดที่เลือกแล้ว ไม่มีรอบ "เลือกจุด" ตามมา)
 *    · ไม่ส่งมา = `false` เหมือนเดิม · จุดเดิมไม่ถูกแตะไม่ว่าส่งค่าไหนมา */
export function normalizeSurveySpots(input, before = [], { newId, defaultSelected = false } = {}) {
  if (input === undefined) return { value: undefined, error: null };
  if (!Array.isArray(input)) return { value: null, error: 'รายการจุดติดตั้งไม่ถูกต้อง' };
  const rows = input.filter((raw) => !isBlankSurveySpot(raw));
  if (rows.length > SURVEY_SPOTS_MAX) {
    return { value: null, error: `จุดติดตั้งต่อพื้นที่ไม่ควรเกิน ${SURVEY_SPOTS_MAX} จุด` };
  }
  const keep = new Map((Array.isArray(before) ? before : []).map((s) => [s?.id, s?.selected === true]));
  const out = [];
  const seen = new Set();
  for (const raw of rows) {
    const { value, error } = normalizeSurveySpot(raw);
    if (error) return { value: null, error };
    const id = value.id || newId?.() || null;
    if (id && seen.has(id)) return { value: null, error: 'รายการจุดติดตั้งมี id ซ้ำ' };
    seen.add(id);
    out.push({ ...value, id, selected: keep.has(id) ? keep.get(id) : defaultSelected === true });
  }
  return { value: out, error: null };
}

/* ชื่อส่วนบนจอ — A B C… ตามลำดับแถว (ม็อกที่อนุมัติ 25/09: "ส่วน A 7.5 × 4 × 3")
   เพดาน 20 ส่วน ⇒ ตัวอักษรพอเสมอ · เกินจากนั้น (ร่างที่มีแถวว่างค้าง) ใช้เลขลำดับแทน */
export const surveyPartLetter = (index) => 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[index] ?? String(index + 1);

const DIM_WORDS = { widthM: 'ความกว้าง', lengthM: 'ความยาว', heightM: 'ความสูง' };

/**
 * ⭐ **ร่างบนจอ → ของที่ส่งให้ PATCH** — จอถามตัวจัดแถวชุดเดียวกับ server ก่อนยิง
 *
 * 🔑 ผ่านที่นี่ = server รับแน่ (ตัวจัดแถวตัวเดียวกัน) · ไม่ผ่าน = ไม่ยิงเลย แล้วบอกเหตุด้วย
 *   **ชื่อที่ตาเห็นบนจอ** ("ส่วน B ยังขาดความสูง" · "จุดที่ 2 ยังไม่มีชื่อ") ไม่ใช่
 *   "ส่วนของพื้นที่: ต้องระบุสูง (เมตร)" ที่ไม่บอกว่าส่วนไหน
 * ⚠️ ลำดับบนจอนับแถวว่างด้วย — ช่างเห็น "ส่วน B" ตรงไหน ข้อความต้องชี้ตรงนั้น
 *
 * 🐞 review 30/09 — **แถวจุดว่างที่มีรูปแล้วไม่ใช่แถวว่าง** (`photoSpotIds` = id ของแถวร่างที่มีรูป · `spotDraftPhotos`)
 *   ช่างถ่ายจากแถวใหม่ก่อนพิมพ์ชื่อได้ · เดิมแถวนั้นถูกข้ามเงียบ ⇒ บันทึกส่วนอื่นแล้วแถวหาย รูปตกถาด ⇒ บล็อกด้วยชื่อแถวแทน
 *
 * → `{ payload: { parts, spots, note } | null, blocker: string | null,
 *      issues: [{ section: 'size' | 'spots' | 'note', index, field, text }] }`
 *   `blocker` = ประโยคของแถวแรกที่ติด (ขาดหลายช่องในส่วนเดียว = ประโยคเดียว) ·
 *   `issues` = รายช่อง ไว้ให้จอทำเครื่องหมายที่ช่อง
 */
export function surveyZoneSavePayload({ parts = [], spots = [], note = '', photoSpotIds = null } = {}) {
  const issues = [];
  let blocker = null;
  const block = (text) => { blocker = blocker ?? text; };
  const withPhotos = new Set(Array.isArray(photoSpotIds) ? photoSpotIds.map(String) : []);

  (Array.isArray(parts) ? parts : []).forEach((raw, index) => {
    if (isBlankSurveyPart(raw)) return;
    const name = `ส่วน ${surveyPartLetter(index)}`;
    const rowIssues = [];
    const missing = [];
    for (const [field] of SURVEY_DIMS) {
      const value = parseSurveyMeters(raw?.[field]);
      const word = DIM_WORDS[field];
      const problem = meterProblem(value);
      if (!problem) continue;
      if (problem === 'missing') missing.push(word);
      const text = problem === 'missing' ? `${name} ยังขาด${word}`
        : problem === 'nan' ? `${name} ${word}ต้องเป็นตัวเลข${metersNanHint(raw?.[field])}`
          : problem === 'min' ? `${name} ${word}ต้องมากกว่า 0`
            : `${name} ${word} ${value} ม. ดูเหมือนพิมพ์ผิดหลัก`;
      rowIssues.push({ section: 'size', index, field, text });
    }
    if (!rowIssues.length) return;
    issues.push(...rowIssues);
    block(missing.length === rowIssues.length ? `${name} ยังขาด${missing.join(' · ')}` : rowIssues[0].text);
  });

  (Array.isArray(spots) ? spots : []).forEach((raw, index) => {
    if (isBlankSurveySpot(raw)) {
      if (raw?.id == null || !withPhotos.has(String(raw.id))) return;
      const text = `จุดที่ ${index + 1} มีรูปแล้วแต่ยังไม่มีชื่อ`;
      issues.push({ section: 'spots', index, field: 'label', text });
      block(text);
      return;
    }
    const { error, field } = normalizeSurveySpot(raw);
    if (!error) return;
    const text = field === 'note' ? `บันทึกของจุดที่ ${index + 1} ยาวเกิน 300 ตัวอักษร`
      : isBlankText(raw?.label) ? `จุดที่ ${index + 1} ยังไม่มีชื่อ`
        : `ชื่อจุดที่ ${index + 1} ยาวเกิน 100 ตัวอักษร`;
    issues.push({ section: 'spots', index, field, text });
    block(text);
  });

  const noteText = String(note ?? '').trim();
  if (noteText.length > 1000) {
    const text = 'หมายเหตุยาวเกิน 1000 ตัวอักษร';
    issues.push({ section: 'note', index: null, field: 'note', text });
    block(text);
  }
  if (blocker) return { payload: null, blocker, issues };

  /* ด่านระดับทั้งก้อน (เพดาน · id ซ้ำ) — ถามตัวจัดแถวของ server ตรง ๆ ไม่เขียนซ้ำ */
  const partsOut = normalizeSurveyParts(Array.isArray(parts) ? parts : []);
  const spotsOut = normalizeSurveySpots(Array.isArray(spots) ? spots : []);
  const listError = partsOut.error || spotsOut.error;
  if (listError) return { payload: null, blocker: listError, issues };

  return {
    payload: {
      parts: partsOut.value,
      // ⚠️ ไม่ส่ง `selected` — เป็นของหัวหน้า เส้นของช่างไม่รับอยู่แล้ว
      spots: spotsOut.value.map(({ id, label, note: spotNote }) => ({ id, label, note: spotNote })),
      note: noteText,
    },
    blocker: null,
    issues: [],
  };
}

/* ── ช่างสองคนบันทึกพื้นที่เดียวกัน — ด่านรุ่นของแถว ─────────────────────────────
   🐞 review 26/09 — นัดหนึ่งใบมีช่างได้หลายคน · หน้าของคนที่ยังไม่โหลดใหม่ถือร่างเก่า (ส่วนว่างแถวเดียว
     = `parts: []` หลังตัวจัดแถว) แล้วกดบันทึกทีหลัง ⇒ PATCH เขียนทั้งก้อนทับขนาดที่อีกคนเพิ่งวัดเงียบ ๆ
     (พื้นที่เด้งกลับเป็น "ขาดขนาด") · ก่อนรื้อจอ server ตีกลับแถวว่างเลยไม่เคยทับ
   🔑 จอส่ง `baseUpdatedAt` = รุ่นของแถวที่ร่างตั้งต้น · ไม่ตรงกับแถวในฐาน = 409 พร้อมแถวล่าสุด
   ⚠️ ไม่ส่งมา = ไม่ถาม — แท็บเก่าที่เปิดค้างยังบันทึกได้เหมือนเดิม
   ⚠️ เทียบ/เรียงเป็นสตริงตรง ๆ — ทั้งสองฝั่งมาจาก PostgREST (`select('*')`) รูปเดียวกัน (UTC `+00:00`)
      ไม่แปลงเป็นเวลา: ตัวแปลงของ JS ตัดเศษไมโครวินาที ⇒ สองรุ่นที่ห่างกันไม่ถึงมิลลิวินาทีดูเป็นรุ่นเดียว */
export const SURVEY_ZONE_STALE_CODE = 'zone_stale';
export const SURVEY_ZONE_STALE_TEXT = 'พื้นที่นี้ถูกแก้จากที่อื่น — โหลดใหม่แล้วตรวจก่อนบันทึก';

export function surveyZoneStaleError(row, baseUpdatedAt) {
  if (baseUpdatedAt === undefined || baseUpdatedAt === null) return null;
  return String(baseUpdatedAt) === String(row?.updatedAt ?? '') ? null : SURVEY_ZONE_STALE_TEXT;
}

/* เนื้อ 409 ของด่านนี้ — พกแถวล่าสุดกลับไปด้วย: หน้าแม่โหลดใหม่เฉพาะตอนบันทึกผ่าน ⇒ จอต้องมีรุ่นจริงไว้ให้
   ปุ่ม "ใช้ค่าล่าสุดจากฐาน" และการกดบันทึกทับอย่างรู้ตัว (ป้ายชนบอกไว้ว่า "กดบันทึกจะทับของเขา") */
export const surveyZoneStaleBody = (row = null) => ({
  error: SURVEY_ZONE_STALE_TEXT, code: SURVEY_ZONE_STALE_CODE, zone: row || null,
});

/** error ที่ `apiJson` โยนมา → `{ zone }` ของ 409 ชนรุ่น · 409 อื่น (ใบล็อก) / ต่อไม่ติด = `null` (error ธรรมดา) */
export function surveyZoneStaleReply(error) {
  if (error?.status !== 409 || error?.data?.code !== SURVEY_ZONE_STALE_CODE) return null;
  const zone = error.data.zone;
  return { zone: zone && typeof zone === 'object' ? zone : null };
}

/** แถวที่ใหม่กว่า (ตาม `updatedAt`) — รุ่นเท่ากัน = ตัวแรก · ไม่มีรุ่นให้เทียบ = ตัวที่มี */
export function surveyZoneLatestRow(a, b) {
  if (!b?.updatedAt) return a || b || null;
  if (!a?.updatedAt) return b;
  return String(b.updatedAt) > String(a.updatedAt) ? b : a;
}

/**
 * ฐานของร่าง `{ at, sig }` เมื่อเห็นแถวรุ่นใหม่ (`row` = `{ at, sig }`) — ขยับตามได้เฉพาะเมื่อ
 * **ค่าของช่างในแถวใหม่ไม่ต่างจากที่ร่างรู้อยู่แล้ว** ⇒ ไม่มีของใครให้ทับ:
 *   ตรงกับฐานเดิม (หัวหน้าเคาะแพ็คเกจ · ตัด/เอากลับ — เขียน `updatedAt` แต่ไม่แตะขนาด/จุด/หมายเหตุ) ·
 *   ตรงกับที่หน้านี้บันทึกไปเอง (`sentSig` — ผู้ใช้พิมพ์ต่อระหว่างรอ ตัวรับแถวใหม่เลยไม่รับแถวลงช่อง)
 * นอกนั้น = มีคนแก้ค่า ⇒ คืนฐานตัวเดิมเป๊ะ ให้ server ตีกลับ · ไม่ถอยไปรุ่นที่เก่ากว่า
 * ลายเซ็นมาจาก `surveyZoneDraftSignature` (ผู้เรียกคิดมาให้ — ไฟล์นี้ไม่ import ตัวตัดสินของจอ)
 */
export function surveyZoneNextBase(base, row = {}, { sentSig = null } = {}) {
  const next = { at: row?.at ?? null, sig: row?.sig ?? null };
  if (!base) return next;
  if (!next.at || (base.at && !(String(next.at) > String(base.at)))) return base;
  return next.sig === base.sig || (sentSig !== null && next.sig === sentSig) ? next : base;
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

/* ── แพ็คเกจของพื้นที่หนึ่ง = ขนาดเดียว + จำนวน ───────────────────────────
   ⭐ กติกาเดิมที่ยังจริง: **ขอบของการตัดสิน = ขอบที่กลิ่นข้ามไม่ได้ = ผนังของพื้นที่** — ขนาดเสนอจากปริมาตรรวมของ
      พื้นที่ (ทุกส่วนบวกกัน) ไม่เสนอรายส่วน และไม่เอาปริมาตรรวมทั้งใบมาคิด (กลิ่นไม่ทะลุผนัง) */
const sizeCode = (value) => String(value ?? '').trim().toUpperCase() || null;

/** "SM 1 · ST 1" — สัดส่วนขนาดของทั้งใบ · `order` = รหัสตามลำดับทะเบียน (ไม่ส่ง = เรียงตามรหัส)
 *  ⚠️ รหัสที่ไม่อยู่ใน `order` (ถูกลบจากทะเบียนแล้ว) ต่อท้ายเสมอ — ใบที่ส่งไปแล้วยังถือรหัสนั้นอยู่ ห้ามทำหาย */
export function surveyPackageMixText(bySize, order = null) {
  const entries = Object.entries(bySize && typeof bySize === 'object' ? bySize : {})
    .filter(([, qty]) => Number(qty) > 0);
  if (!entries.length) return '';
  const rank = new Map((Array.isArray(order) ? order : []).map((code, i) => [code, i]));
  entries.sort(([a], [b]) => {
    const ra = rank.has(a) ? rank.get(a) : Infinity;
    const rb = rank.has(b) ? rank.get(b) : Infinity;
    return ra !== rb ? ra - rb : a.localeCompare(b, 'en');
  });
  return entries.map(([code, qty]) => `${code} ${Number(qty)}`).join(' · ');
}

/** "2 แพ็คเกจ (SM 1 · ST 1)" — ยอดแพ็คเกจที่ฝ่ายขายเอาไปตั้งราคา (กระดิ่ง · เธรด · audit ใช้ตัวเดียวกัน)
 *  ⚠️ ยอดเก่าที่ตรึงไว้ก่อนมีขนาด (ไม่มี `packagesBySize`) = ตัวเลขล้วนเหมือนเดิม */
export function surveyPackagesText(totals, order = null) {
  const mix = surveyPackageMixText(totals?.packagesBySize, order);
  return `${fmtNumber(Number(totals?.packageQty) || 0)} แพ็คเกจ${mix ? ` (${mix})` : ''}`;
}

/* ขนาดที่ระบบเสนอตอนเคาะ — แถวดิบ/`surveyZoneSummary` เรียก `packageSizeSuggested` · แถวของหน้าคำร้อง
   (`surveyJob.zoneRows` · `surveyZoneFacts`) เรียก `suggestedSize` ⇒ รับทั้งสองชื่อ ไม่ให้จอไหนต้องแปลงเอง */
const suggestedSizeOf = (row) => sizeCode(row?.packageSizeSuggested ?? row?.suggestedSize);

/**
 * "SM · 1 แพ็ค" — ขนาด + จำนวนที่หัวหน้าเคาะของพื้นที่หนึ่ง (ทุกจอที่ **อ่าน** ผลใช้ตัวนี้ · mig 0398)
 * ยังไม่เคาะ = `null` (จอใส่ขีดเอง) · แถวที่มีจำนวนแต่ยังไม่มีขนาด (เคาะด้วยโค้ดเก่า รอ back-fill) = จำนวนล้วน
 * @param opts.unit `false` = ไม่ต่อหน่วย ("SM · 1") สำหรับคอลัมน์ที่หัวตารางบอกหน่วยแล้ว
 */
export function surveyZonePackageText(row, { unit = true } = {}) {
  const qty = Number(row?.packageQty);
  if (!(qty > 0)) return null;
  const size = sizeCode(row?.packageSize);
  const count = `${fmtNumber(qty)}${unit ? ' แพ็ค' : ''}`;
  return size ? `${size} · ${count}` : count;
}

/**
 * "ระบบเสนอ SM · 1 แพ็ค" — ขึ้น **เฉพาะเมื่อที่เคาะต่างจากที่ระบบเสนอ** (ขนาดไม่ตรง หรือจำนวนไม่ใช่ 1)
 * ⭐ ต่างได้ (หัวหน้าเป็นคนตัดสิน) แต่ต้องเห็นว่าต่าง ไม่ใช่ทับกันเงียบ ๆ — 🔄 แทนบรรทัด "สูตร N" เดิม
 * ⚠️ ตรงกับที่เสนอ = `null` (บรรทัดที่พูดซ้ำกับค่าหลักคือเสียงรบกวน) · ไม่มีภาพนิ่ง (ยังไม่เคาะ/แถวก่อนมีขนาด) = `null`
 */
export function surveyZoneSuggestedDiffText(row, { unit = true } = {}) {
  const suggested = suggestedSizeOf(row);
  const qty = Number(row?.packageQty);
  if (!suggested || !(qty > 0)) return null;
  if (sizeCode(row?.packageSize) === suggested && qty === 1) return null;
  return `ระบบเสนอ ${suggested} · 1${unit ? ' แพ็ค' : ''}`;
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
  const packageQty = Number.isFinite(Number(row.packageQty)) ? Number(row.packageQty) : null;
  return {
    ...size,
    ...{ spotsTotal: spots.total, spotsSelected: spots.selected },
    packageQty,
    /* ภาพนิ่งตอนเคาะ (mig 0398) — ขนาดที่หัวหน้าเลือก · ขนาดที่ระบบเสนอ ณ ตอนนั้น (null = แถวก่อนมีขนาด/เสนอไม่ได้) */
    packageSize: sizeCode(row.packageSize),
    packageSizeSuggested: sizeCode(row.packageSizeSuggested),
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
    areaSqm: 0, volumeCbm: 0, packageQty: 0,
    /* จำนวนแพ็คเกจแยกตามขนาด `{ SM: 1, ST: 2 }` — แถวที่เคาะจำนวนแล้วแต่ยังไม่มีขนาดไม่เข้า (ด่านส่งผลบล็อกอยู่) */
    packagesBySize: {},
    spotsTotal: 0, spotsSelected: 0,
  };
  for (const row of active) {
    const s = surveyZoneSummary(row);
    t.areaSqm += s.areaSqm;
    t.volumeCbm += s.volumeCbm;
    if (s.packageQty) t.packageQty += s.packageQty;
    if (s.packageQty > 0 && s.packageSize) {
      t.packagesBySize[s.packageSize] = (t.packagesBySize[s.packageSize] || 0) + s.packageQty;
    }
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

/**
 * ชื่อพื้นที่ที่คนอ่าน — ชื่อว่าง/มีแต่ช่องว่าง = "พื้นที่ไม่มีชื่อ" (ไม่ใช่ช่องว่าง ไม่ใช่ขีด)
 * ⭐ **ตัวเดียวทั้ง server และจอ** (ด่านส่งผล · ด่านรายหัวข้อ · การ์ดจัดการผล · รายการ · ตารางสรุป) — 🐞 เดิมเขียนคำนี้เอง
 *   สี่ไฟล์ และด่านส่งผลถอยไปที่ "พื้นที่" เฉย ๆ (ไม่ตัดช่องว่างด้วย) ⇒ ประโยคเหตุที่ส่งผลไม่ได้เรียกพื้นที่ไร้ชื่อว่า
 *   "พื้นที่: ภาพกว้าง" ขณะที่ตารางข้าง ๆ เรียกมันว่า "พื้นที่ไม่มีชื่อ" = ของชิ้นเดียวสองชื่อ (แผน §10.5 S10)
 * ⚠️ ชื่อรวมชั้น ("ห้อง Treatment · ชั้น 05") คือ `surveyZoneTitle` ของจอ — ตัวนี้เป็นชื่อเปล่า ใช้ในประโยค
 */
export function surveyZoneName(row) {
  return String(row?.zoneName || '').trim() || 'พื้นที่ไม่มีชื่อ';
}

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
 *
 * ⭐ `short` = ชื่อข้อแบบคำเดียว ("ขนาด" · "ภาพกว้าง") — ของที่ต้องเอาไปต่อกันเป็น
 *   บรรทัดเดียวในที่แคบ (หัวพื้นที่ที่พับอยู่ · กลุ่มด่านต่อพื้นที่ในการ์ดควบคุม)
 *   ⚠️ **อยู่ในทะเบียนข้อ ไม่ใช่ที่จอ** — ด้วยเหตุผลเดียวกับ `owner`: จอสองจอที่
 *     ย่อชื่อข้อเองจะย่อไม่เหมือนกัน แล้วผู้ใช้จะอ่านเหมือนเป็นคนละข้อ
 *
 * ⭐ **วิธีประเมินรายพื้นที่** (mig 0408 · แผน survey-desk-assessment §2) — ทุกข้อมีตัวถามรายแถวสองตัว:
 *   `applies(row)`  ข้อนี้ใช้กับพื้นที่นี้ไหม · ข้อที่ต้องยืนหน้างานถึงทำได้ (ภาพกว้าง · จุดที่ติดตั้งได้ · เลือกจุด)
 *                   ไม่ใช้กับพื้นที่ที่ประเมินจากแบบ · ข้อที่ไม่ประกาศ = ใช้กับทุกพื้นที่
 *   `ownerOf(row)`  ใครแก้ข้อนี้ของพื้นที่นี้ได้ · พื้นที่จากแบบ = หัวหน้าทุกข้อ (ไม่มีช่างไปหน้างาน) · นอกนั้นตาม `owner`
 *   🔴 **มีแถวอยู่ในมือเมื่อไร ถามสองตัวนี้ ไม่อ่าน `owner` ตรง ๆ** — `owner` คือเจ้าของตอนลงหน้างาน
 *     อ่านตรงกับพื้นที่จากแบบ = โยนงานของหัวหน้าไปรอช่างที่ไม่มีนัด
 *     · `missing` **ไม่ถาม `applies` ให้** — เรียก `missing` ของข้อที่ไม่ใช้กับแถวนั้น ได้ข้อความของด่านหน้างานกลับมา
 *   ⚠️ แถวที่ไม่มีคีย์ `method` (ทุกแถวก่อน mig 0408) คือลงหน้างาน ⇒ ทุกข้อใช้ · เจ้าของตามที่ประกาศ = เหมือนเดิมทุกตัวอักษร
 */
/* ข้อที่ต้องยืนหน้างานถึงทำได้ — ประกาศเป็น `applies` ของข้อนั้น */
const onsiteOnly = (row) => !isDrawingZone(row);
/* เติมตัวถามรายแถวให้ครบทุกข้อ — กติกา "พื้นที่จากแบบ หัวหน้าเป็นเจ้าของทุกข้อ" เขียนที่นี่ที่เดียว ไม่ต้องจำใส่ทีละข้อ */
const withZoneMethod = (gate) => ({
  ...gate,
  applies: gate.applies || (() => true),
  ownerOf: (row) => (isDrawingZone(row) ? 'head' : gate.owner),
});

export const SURVEY_GATES = [
  {
    key: 'size',
    short: 'ขนาด',
    owner: 'crew',
    label: 'ขนาด ก × ย × ส ครบทุกพื้นที่',
    missing: (row) => {
      const size = surveyZoneSize(row.parts);
      if (!size.complete) {
        return size.parts === 0
          ? 'ยังไม่ได้วัดขนาด — เพิ่มอย่างน้อยหนึ่งส่วน'
          : `มีส่วนที่กรอกไม่ครบสามช่อง ${size.parts - size.measuredParts} ส่วน`;
      }
      /* 🔄 พื้นที่ที่สลับจากประเมินจากแบบ **กลับมาเป็นลงหน้างาน**: ตัวเลขที่ค้างอยู่คือของตอนประเมินที่โต๊ะ
         (หรือของการวัดรอบก่อน) ⇒ ครบสามช่องแล้วก็ยังไม่ผ่าน จนกว่าจะมีคนบันทึกพื้นที่นี้อีกครั้งหลังสลับ
         ⚠️ แถวที่ไม่เคยสลับ (`methodChangedAt` ว่าง = ทุกแถวเดิมของระบบ) ไม่เข้าทางนี้ */
      return surveyZoneNeedsResave(row)
        ? 'พื้นที่นี้เพิ่งกลับมาเป็นลงหน้างาน — ตรวจขนาดกับของจริงแล้วกดบันทึกอีกครั้ง'
        : null;
    },
  },
  {
    key: 'wide',
    short: 'ภาพกว้าง',
    owner: 'crew',
    label: 'ภาพกว้างครบทุกพื้นที่',
    applies: onsiteOnly,
    missing: (row, files) => (surveyDocCounts(files).wide === 0 ? 'ยังไม่มีภาพกว้าง' : null),
  },
  {
    key: 'spots',
    short: 'จุดติดตั้ง',
    owner: 'crew',
    label: 'จุดที่ติดตั้งได้ อย่างน้อย 1 จุดต่อพื้นที่',
    applies: onsiteOnly,
    missing: (row) => (spotCounts(row.spots).total === 0 ? 'ยังไม่ได้ระบุจุดที่ติดตั้งได้' : null),
  },
  {
    key: 'plan',
    short: 'ภาพผัง',
    owner: 'head',
    label: 'ภาพผังที่มาร์กจุดแล้ว',
    /* ชื่อข้อเมื่อทุกพื้นที่ที่ข้อนี้ใช้เป็นพื้นที่จากแบบ (`surveyGateChecklist`) — แบบของพื้นที่ ไม่บังคับมาร์กจุด */
    drawingLabel: 'ภาพแบบของพื้นที่',
    drawingShort: 'ภาพแบบ',
    missing: (row, files) => {
      if (!isDrawingZone(row)) return surveyDocCounts(files).plan === 0 ? 'ยังไม่มีภาพผังที่มาร์กจุดแล้ว' : null;
      /* 🔑 พื้นที่จากแบบ: ภาพแบบคือรูปเดียวของพื้นที่นี้บนเอกสารประเมิน และกระดาษวาดได้แค่ JPG/PNG
         ⇒ นับเฉพาะไฟล์ผังที่เป็นรูปสองชนิดนี้ · PDF / TIFF / HEIC แนบไว้ได้แต่ไม่ปลดด่าน
         (พื้นที่ลงหน้างานยังนับไฟล์ผังทุกชนิดเหมือนเดิม — ทางข้างบน) */
      const drawn = (Array.isArray(files) ? files : [])
        .some((f) => f?.docType === SURVEY_DOC_PLAN && isJpgOrPngFile(f));
      return drawn ? null : 'ยังไม่มีภาพแบบของพื้นที่ (ต้องเป็นรูป JPG/PNG — ไฟล์ PDF/TIFF ลงเอกสารไม่ได้)';
    },
  },
  {
    key: 'picked',
    short: 'เลือกจุด',
    owner: 'head',
    label: 'เลือกจุดที่จะติดตั้งแล้ว',
    applies: onsiteOnly,
    missing: (row) => (spotCounts(row.spots).selected === 0 ? 'ยังไม่ได้เลือกจุดที่จะติดตั้ง' : null),
  },
  {
    key: 'package',
    short: 'แพ็คเกจ',
    owner: 'head',
    label: 'เคาะขนาดและจำนวนแพ็คเกจแล้ว',
    missing: (row) => {
      if (!(Number(row.packageQty) > 0)) return 'ยังไม่ได้เคาะแพ็คเกจ';
      /* จำนวนมีแต่ขนาดไม่มี — แถวที่เคาะด้วยโค้ดเก่าระหว่างรัน 0398 กับ deploy (back-fill รอบสองเก็บให้) */
      if (!sizeCode(row.packageSize)) return 'ยังไม่ได้เลือกขนาดแพ็คเกจ';
      /* 🔴 **ต่างจากที่ระบบเสนอต้องบอกเหตุผล** (mig 0345 · กติกาเดียวกับการตัดพื้นที่ออก)
         ของที่ต่างไปจากสิ่งที่ SA จะเสนอราคา คือของที่ลูกค้าจะถาม และ SA ไม่ได้ไปหน้างาน */
      if (packageNeedsNote(row) && !String(row.packageNote ?? '').trim()) {
        return 'แพ็คเกจต่างจากที่ระบบเสนอ — ต้องบอกเหตุผล';
      }
      return null;
    },
  },
].map(withZoneMethod);

/* ข้อของ `owner` **ที่ใช้กับพื้นที่นี้** — ถามรายแถว (ลำดับตามทะเบียน): พื้นที่จากแบบถอดข้อหน้างานออก
   และยกข้อที่เหลือให้หัวหน้าทั้งหมด */
const gatesOf = (owner, row) => SURVEY_GATES.filter((g) => g.applies(row) && g.ownerOf(row) === owner);

const missingFor = (owner, row, files) => gatesOf(owner, row)
  .map((gate) => gate.missing(row, files || []))
  .filter(Boolean);

export function surveyFieldMissing(row = {}, files = []) {
  // พื้นที่จากแบบไม่มีข้อของช่างเลย (หัวหน้าประเมินเองที่โต๊ะ) — รูปร่างเดียวกับพื้นที่ที่ตัด
  if (isCut(row) || isDrawingZone(row)) return [];
  return missingFor('crew', row, files);
}

/**
 * 🔑 **ด่านฝั่งส่งผล** — พื้นที่หนึ่งแถวพร้อมส่งให้ฝ่ายขายหรือยัง
 *
 * ⚠️ **รวมของฝั่งหน้างานมาด้วยในฐานะเช็คลิสต์** — จอส่งผลต้องแสดงครบทั้งหกข้อ
 *   ปกติสามข้อบนจะติ๊กมาแล้ว ถ้าไม่ติ๊ก (ข้อมูลมาจากทางอื่น/ใบเก่า) หัวหน้าต้องเห็น
 *   ว่าติดอะไร เพื่อจะกด "แจ้งช่างให้กลับไป" ได้ ไม่ใช่เจอปุ่มเทาเงียบ
 * ⇒ ผู้เรียกแยกสองกลุ่มด้วย `field` / `result` ในผลลัพธ์
 * ⭐ พื้นที่จากแบบ: `field` ว่างเสมอ · `result` = ขนาด → ภาพแบบ → แพ็คเกจ (ทั้งหมดเป็นของหัวหน้า — ทะเบียนตอบเอง)
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
 * ⭐ **แต่ละข้อนับเฉพาะพื้นที่ที่ข้อนั้นใช้ด้วย** (`applies`) — ใบผสมจึงได้ตัวหารไม่เท่ากันทุกข้อ:
 *   ขนาด · ผัง · แพ็คเกจ หารด้วยทุกพื้นที่ · ภาพกว้าง · จุด · เลือกจุด หารด้วยพื้นที่ลงหน้างาน
 *   · ข้อที่ **มีพื้นที่ในใบแต่ไม่มีพื้นที่ไหนใช้** (ใบจากแบบล้วน) ไม่ออกมาในลิสต์ — ไม่ใช่ขึ้น "0 / 0" ให้หัวหน้าสงสัย
 *   ⚠️ ใบที่ไม่เหลือพื้นที่เลยยังได้ครบหกข้อ ตัวหาร 0 เหมือนเดิม (ไม่มีแถวให้ถามว่าใช้ข้อไหน)
 *   · ทุกพื้นที่ที่ข้อนั้นใช้เป็นพื้นที่จากแบบ ⇒ ข้อนั้นเป็นของหัวหน้า และใช้ชื่อข้อของพื้นที่จากแบบถ้าทะเบียนมีให้
 *     (`drawingLabel` / `drawingShort`) · ใบผสมใช้เจ้าของและชื่อข้อตามที่ประกาศ
 *
 * @returns `[{ key, owner, label, short, ok, done, total, zones: [ชื่อพื้นที่ที่ยังขาด] }]`
 */
export function surveyGateChecklist(rows = [], filesByZone = {}) {
  const active = (Array.isArray(rows) ? rows : []).filter((r) => !isCut(r));
  return SURVEY_GATES.flatMap((gate) => {
    const applying = active.filter((row) => gate.applies(row));
    if (active.length > 0 && applying.length === 0) return [];
    const zones = [];
    for (const row of applying) {
      if (gate.missing(row, filesByZone?.[row.id] || [])) {
        zones.push(surveyZoneName(row));
      }
    }
    const allDrawing = applying.length > 0 && applying.every(isDrawingZone);
    return [{
      key: gate.key,
      owner: allDrawing ? 'head' : gate.owner,
      label: (allDrawing && gate.drawingLabel) || gate.label,
      short: (allDrawing && gate.drawingShort) || gate.short,
      ok: zones.length === 0,
      done: applying.length - zones.length,
      total: applying.length,
      zones,
    }];
  });
}

/** ด่านที่ยังติดและ **ช่างเท่านั้นที่แก้ได้** — ตัวเดียวที่ตัดสินว่าปุ่ม "แจ้งช่างให้กลับไป"
 *  มีเรื่องให้แจ้งไหม · ทั้งปุ่มบนจอและ route ถามตัวนี้
 *  ⭐ **ถามจากพื้นที่ลงหน้างานเท่านั้น** — พื้นที่จากแบบไม่เคยเป็นงานค้างของช่าง (ขนาดของมันหัวหน้าพิมพ์เอง)
 *    ⇒ ด่านส่งงาน (`surveyFieldSubmitError`) และด่านแจ้งว่าแก้แล้ว (`surveySendBackDoneError`) ได้กติกานี้ไปด้วย
 *    ⚠️ กรองแถวก่อนเข้าเช็คลิสต์ ไม่ใช่กรองผล: ข้อ "ขนาด" ของใบผสมเป็นของช่างตามที่ประกาศ ถ้านับรวม
 *      พื้นที่จากแบบที่ยังไม่มีขนาด จะกลายเป็นเรื่องให้ส่งช่างกลับไปทั้งที่ช่างแก้ไม่ได้ */
export function surveyCrewGaps(rows = [], filesByZone = {}) {
  const onsite = (Array.isArray(rows) ? rows : []).filter((r) => !isDrawingZone(r));
  return surveyGateChecklist(onsite, filesByZone).filter((g) => g.owner === 'crew' && !g.ok);
}

/** เคาะแพ็คเกจต่างจากที่ระบบเสนอไหม — `false` เมื่อยังไม่ได้เคาะ หรือระบบไม่ได้เสนออะไรไว้
 *  🔑 **อ่านจากแถวล้วน** (ภาพนิ่งที่ route ประทับตอนเคาะ · mig 0398) — ไม่ถามทะเบียน ⇒ แก้/ลบขนาดในทะเบียนทีหลัง
 *     ไม่ทำให้แถวที่เคาะไปแล้วต้องมีเหตุผลขึ้นมาเอง และหน้าคำร้องของฝ่ายขายใช้ด่านนี้ได้โดยไม่ต้องโหลดทะเบียน
 *  🔴 ภาพนิ่งถูกประทับ **สองจังหวะ**: หัวหน้าเคาะ (`PUT` · `surveyPackageDecision`) และ **ช่างวัดใหม่จนปริมาตรเปลี่ยนหลังเคาะ**
 *     (`PATCH` · `surveyRemeasureStamp`) — จังหวะหลังหายเมื่อไร ด่านนี้หลับ: เคาะ SM ไว้แล้ววัดใหม่ได้ 3,600 ลบ.ม. ส่งผลได้เงียบ ๆ
 *  ⭐ ระบบเสนอ = ขนาดจากช่วง ลบ.ม. + **จำนวน 1** ⇒ ต่าง = จำนวนไม่ใช่ 1 หรือขนาดไม่ตรงที่เสนอ
 *     · ยกเว้นขนาดที่ **หัวหน้าเลือกเอง** (`packageSizeManual` เช่น XS ห้องน้ำ) — ระบบไม่มีวันเสนอขนาดนั้น
 *       บังคับเหตุผลทุกห้องน้ำ = ข้อความขยะที่ไม่มีใครอ่าน
 *  ⚠️ **ตรงกับที่เสนอไม่ต้องมีเหตุผล** · แถวก่อนมีขนาด (back-fill ST · `packageSizeSuggested` ว่าง) ไม่ถูกย้อนบังคับ */
export function packageNeedsNote(row = {}) {
  const qty = Number(row.packageQty);
  const suggested = sizeCode(row.packageSizeSuggested);
  if (!(qty > 0) || !suggested) return false;
  if (qty !== 1) return true;
  return sizeCode(row.packageSize) !== suggested && row.packageSizeManual !== true;
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
  /* 🔴 **ใบที่ปิดโดยไม่ได้ประเมิน** (§5E ③) — เพิ่งกลายเป็นสภาพที่ไปถึงได้จริงตอนที่
     ปุ่มนั้นถูกสร้างขึ้นมา · ก่อนหน้านี้ `closed` โดยไม่มี `answeredAt` ไม่มีทางเกิด
     ⇒ ไม่ล็อก = จอผลประเมินยังแก้ได้ทุกช่องและยังโชว์ปุ่ม "ส่งผล" ที่กดแล้วตาย 409
     ⚠️ **ไม่มีทางกลับ** — `reopenRequestError` ตัดที่ `status === 'closed'` ⇒ ข้อความ
       ต้องบอกทางที่เหลือจริง (เปิดใบใหม่) ไม่ใช่ชี้ไปปุ่มที่หายไปแล้ว
     ⚠️ ทางปิดปกติล็อกด้วย `answeredAt` ไปก่อนแล้ว ⇒ บรรทัดนี้ไม่กระทบเส้นทางเดิม */
  if (request.status === 'closed') {
    return 'ใบนี้ถูกปิดไปแล้ว — แก้ผลประเมินไม่ได้ · ถ้าต้องประเมินใหม่ ให้เปิดใบใหม่';
  }
  /* 🐞 **ฝ่ายขายปิดฝั่งตัวเองไปก่อนได้ผล** (ใบก่อนมติ 24/09 ข้อ 3 — ตอนนี้ปิดเรื่องได้หลังส่งผลเท่านั้น)
     `closedAt` มี · ใบยังไม่ `closed` ⇒ **เปิดกลับได้** ด้วย "ยังไม่จบ" (`reopenRequestError` ผ่าน)
     ⚠️ ห้ามบอก "เปิดใบใหม่" — ใบเดิมยังมีผลวัดอยู่ครบ เปิดใบใหม่ = วัดซ้ำทั้งใบโดยไม่จำเป็น */
  if (request.closedAt) {
    return 'ฝ่ายขายปิดเรื่องไปก่อนได้ผล — แก้ผลประเมินไม่ได้ · กด “ยังไม่จบ” ที่ใบคำร้องเพื่อเปิดใบกลับ แล้วค่อยแก้/ส่งผล';
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
 *
 * 🔄 **ฝั่งช่างครบแล้วก็ส่งกลับได้** (มติเจ้าของ 25/09 · แผน §10.5 S4 · ม็อก A-5/AW-2) — เดิมด่านตีกลับ
 *   "ไม่มีอะไรให้ช่างกลับไปทำ" ทุกครั้งที่ขนาด/ภาพกว้าง/จุดครบ · แต่ด่านสามข้อบอกได้แค่ **มีรูปไหม**
 *   ไม่ได้บอกว่า **รูปใช้ได้ไหม** — หัวหน้าเปิดดูแล้วเห็นว่าภาพกว้างถ่ายไม่ถึงส่วน B (A-5) ก็ขอเพิ่มในระบบไม่ได้
 *   ⇒ ด่านนี้ไม่ถามของขาดแล้ว (route ยังนับของขาดจากฐานไปเล่าในเธรด/กระดิ่ง · ว่าง = เล่าแค่ข้อที่หัวหน้าพิมพ์)
 *   ⚠️ ไม่มีของขาดให้เล่า = ข้อความของหัวหน้าคือทั้งหมดที่ช่างได้ ⇒ ขั้นต่ำ 10 ตัวอักษรยังอยู่ครบ
 */
export function surveySendBackError(request, {
  canSend = false, note = '', crewIds = [],
} = {}) {
  if (!canSend) return 'แจ้งช่างให้กลับไปได้เฉพาะหัวหน้าฝ่ายบริการ';
  const locked = surveyEditLockError(request);
  if (locked) return locked;
  /* 🔴 **ปุ่มที่แจ้งไม่ถึงใครคือปุ่มที่โกหก** — กระดิ่งของใบคำร้องไปหาผู้ขอ (SA) เท่านั้น
     ช่างไม่อยู่ในทะเบียนผู้รับ และเปิดหน้าคำร้องก็ไม่ได้ (403) ⇒ คนที่จะได้รับแจ้งจริง
     มีทางเดียวคือคนที่ถูกมอบหมายบน **นัด** ของใบนี้ */
  if (!crewIds.length) {
    return 'ใบนี้ยังไม่มีช่างที่ถูกมอบหมาย — แจ้งไม่ถึงใคร ให้ลงคิวก่อน';
  }
  /* ⚠️ นับจาก **ข้อที่ช่างจะเห็นจริง** ไม่ใช่ข้อความดิบ — บรรทัดว่างที่กด Enter ค้างไว้ถูกทิ้งตอนแยกข้อ
     ⇒ ถ้านับจากของดิบ "ถ่ายรูป" + Enter ห้าที ผ่านขั้นต่ำทั้งที่ช่างได้คำสั่งสามพยางค์ */
  const { items, error: itemsError } = surveySendBackItems(note);
  if (items.join('\n').length < 10) {
    return 'ต้องบอกว่าให้กลับไปทำอะไร อย่างน้อย 10 ตัวอักษร — ช่างจะเห็นข้อความนี้';
  }
  return itemsError;
}

/* ══ ส่งกลับทีละข้อ (แผน §10.5 S3 · ม็อก A-5) ════════════════════════════════
 *
 * 🐞 **ข้อความเดียวก้อนเดียว ตามทีละเรื่องไม่ได้** — หัวหน้าขอสองเรื่อง ("ขอภาพส่วน B" · "ขอรูปใกล้
 *   มุมเตียง") ช่างทำเรื่องแรกแล้วกดแจ้ง เรื่องที่สองหายไปกับข้อความเดิมโดยไม่มีใครรู้
 * ⭐ **หนึ่งบรรทัด = หนึ่งข้อ** — ไม่ต้องมีช่องต่อข้อ ไม่ต้องมี migration · ตัวแยกตัวนี้ตัวเดียวใช้ทั้งจอ
 *   (ตัวนับ "n ข้อ" ระหว่างพิมพ์) · ด่านปุ่ม · route (ของที่เก็บลง `meta.items`) ⇒ ตาเห็นกี่ข้อ ช่างได้กี่ข้อ
 * ⚠️ เพดานสองตัวมีไว้ให้ **แถบของช่างบนมือถืออ่านจบ** — สิบข้อเกินจอหนึ่งจอไปแล้ว และข้อที่ยาว
 *   เกินสามร้อยตัวอักษรคือหลายเรื่องรวมกันที่ควรแยกบรรทัด
 */
export const SEND_BACK_MAX_ITEMS = 10;
export const SEND_BACK_ITEM_MAX = 300;

/**
 * แยกข้อความของหัวหน้าเป็นข้อ — บรรทัดที่ไม่ว่าง (ตัดช่องว่างหัวท้าย) หนึ่งบรรทัดหนึ่งข้อ
 * @returns `{ items: string[], error: string | null }` — `items` คืนครบเสมอแม้ติดเพดาน (จอใช้นับข้อ)
 *   ⚠️ ว่างทั้งก้อน = ไม่มีข้อและไม่ใช่ error — ขั้นต่ำของข้อความเป็นงานของ `surveySendBackError`
 */
export function surveySendBackItems(note) {
  const items = String(note ?? '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (items.length > SEND_BACK_MAX_ITEMS) {
    return {
      items,
      error: `ส่งกลับได้ไม่เกิน ${SEND_BACK_MAX_ITEMS} ข้อต่อครั้ง — ตอนนี้ ${items.length} ข้อ (หนึ่งบรรทัดนับหนึ่งข้อ)`,
    };
  }
  const long = items.findIndex((item) => item.length > SEND_BACK_ITEM_MAX);
  if (long >= 0) {
    return {
      items,
      error: `ข้อที่ ${long + 1} ยาวเกิน ${SEND_BACK_ITEM_MAX} ตัวอักษร — แยกเป็นหลายบรรทัดได้ บรรทัดละหนึ่งเรื่อง`,
    };
  }
  return { items, error: null };
}

/**
 * ข้อที่ช่างติ๊กว่าแก้แล้ว — เลขข้อ (นับจาก 0 ตามลำดับ `sentBack.items`) ที่จอส่งมากับ "แจ้งว่าแก้แล้ว"
 * ⭐ **ไม่บังคับ** — ไม่ส่งมา (แท็บเก่า) = `null` "ไม่รู้" ไม่ใช่ "ไม่ได้ติ๊กสักข้อ"
 * ⚠️ ตรวจแค่ **ทรง** (จำนวนเต็ม · อยู่ในช่วง · ไม่ซ้ำ) — ไม่ตรวจว่าแก้จริงไหม · ด่านของจริงคือของขาด
 *   (`surveySendBackDoneError`) ส่วนติ๊กคือคำบอกเล่าของช่างให้หัวหน้าอ่าน
 * @returns `{ value: number[] | null, error: string | null }` — `value` เรียงจากน้อยไปมาก
 */
export function surveySendBackDoneItems(raw, itemCount = 0) {
  if (raw == null) return { value: null, error: null };
  const bad = { value: null, error: 'ข้อที่ติ๊กว่าแก้แล้วผิดรูปแบบ — โหลดหน้าใหม่แล้วติ๊กอีกครั้ง' };
  if (!Array.isArray(raw)) return bad;
  const count = Number.isInteger(itemCount) && itemCount > 0 ? itemCount : 0;
  if (!raw.every((n) => Number.isInteger(n) && n >= 0 && n < count)) return bad;
  if (new Set(raw).size !== raw.length) return bad;
  return { value: [...raw].sort((a, b) => a - b), error: null };
}

/* ══ ช่างแจ้งหัวหน้าว่าแก้ตามที่ส่งกลับแล้ว (มติผู้ใช้ 2026-09-22) ══════════════
 *
 * ⭐ ปิดวงของ "แจ้งช่างให้กลับไป" — เดิมช่างแก้เสร็จแล้วไม่มีทางบอก หัวหน้าต้องคอยเปิดใบดูเอง
 * 🔑 **สภาพ "ค้างแก้" มาจากเธรดของใบ ไม่ใช่คอลัมน์ใหม่** — แถว `send_back` ล่าสุดที่ยังไม่มี
 *   แถว `send_back_done` ตามหลัง = ค้าง · ไม่ต้องมี migration และประวัติทุกรอบอ่านย้อนได้
 *   ในเธรดเดียวกับที่ฝ่ายขายเห็นอยู่แล้ว
 */
export const SEND_BACK_KIND = 'send_back';
export const SEND_BACK_DONE_KIND = 'send_back_done';

const SEND_BACK_PREFIX = 'หัวหน้าแจ้งให้กลับไปเก็บงานหน้างาน — ';

/* ข้อความที่หัวหน้าพิมพ์ — แถวใหม่เก็บใน `meta.note` · แถวเก่า (ก่อน 2026-09-22) ต้องตัดจาก body
   ที่ `surveySendBackBody` ประกอบไว้: "<คำนำ> — <ข้อความ> · <ป้ายด่าน> — ขาด …" */
function sendBackNote(row) {
  const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
  if (typeof meta.note === 'string' && meta.note.trim()) return meta.note.trim();
  let body = String(row?.body ?? '').trim();
  if (body.startsWith(SEND_BACK_PREFIX)) body = body.slice(SEND_BACK_PREFIX.length);
  const cuts = SURVEY_GATES.map((g) => body.indexOf(` · ${g.label} — ขาด`)).filter((i) => i >= 0);
  return (cuts.length ? body.slice(0, Math.min(...cuts)) : body).trim() || null;
}

const sendBackRecord = (row, note) => ({
  id: row.id || null,
  at: row.createdAt || null,
  byId: row.authorId != null ? String(row.authorId) : null,
  byName: row.authorName || null,
  note,
});

/* ข้อที่หัวหน้าขอ — แถวตั้งแต่ S3 เก็บ `meta.items` · แถวก่อนหน้า (ช่องบรรทัดเดียว) = บรรทัดของ note
   ⇒ ข้อความเดิมหนึ่งก้อนกลายเป็นหนึ่งข้อ ช่างติ๊กได้เหมือนกัน
   ⚠️ `meta.items` ผิดทรงหรือว่างทั้งแถว = ไม่เชื่อ ถอยไปอ่าน note (แถวเดียวกันต้องไม่ได้ศูนย์ข้อทั้งที่มีข้อความ) */
function sendBackItems(row, note) {
  const raw = row?.meta?.items;
  const items = Array.isArray(raw)
    ? raw.filter((t) => typeof t === 'string').map((t) => t.trim()).filter(Boolean)
    : [];
  return items.length ? items : surveySendBackItems(note).items;
}

/* ข้อที่ช่างติ๊กบนแถวแจ้งแก้แล้ว — ไม่มี/ผิดทรง = `null` (ไม่รู้) · แถวปิดให้เองตอนส่งงานไม่มีเสมอ */
function doneTicks(row) {
  const meta = row?.meta && typeof row.meta === 'object' ? row.meta : {};
  const itemCount = Number.isInteger(meta.itemCount) && meta.itemCount > 0 ? meta.itemCount : null;
  const ticks = surveySendBackDoneItems(meta.doneItems, itemCount ?? 0);
  return { doneItems: itemCount != null ? ticks.value : null, itemCount: ticks.value ? itemCount : null };
}

/**
 * 🔑 **สภาพการส่งกลับของใบ** — ผู้เรียกส่งแถวเธรดชนิด `send_back` / `send_back_done` มา (ลำดับใดก็ได้)
 * @returns `{ pending, sentBack: {id, at, byId, byName, note, items} | null,
 *            done: {id, at, byId, byName, note, doneItems, itemCount} | null }`
 *   `pending` = มีการส่งกลับที่ยังไม่มีใครแจ้งว่าแก้แล้ว (ส่งกลับซ้ำหลังแจ้งแล้ว = ค้างใหม่)
 *   `items` = ข้อที่หัวหน้าขอ (ม็อก A-5) · `doneItems` = เลขข้อที่ช่างติ๊ก หรือ `null` เมื่อไม่รู้
 */
export function surveySendBackState(rows = []) {
  const list = (Array.isArray(rows) ? rows : [])
    .filter((r) => r && (r.kind === SEND_BACK_KIND || r.kind === SEND_BACK_DONE_KIND))
    .sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
  const back = list.find((r) => r.kind === SEND_BACK_KIND) || null;
  const done = list.find((r) => r.kind === SEND_BACK_DONE_KIND) || null;
  const pending = !!back && (!done || String(done.createdAt || '') < String(back.createdAt || ''));
  const backNote = back ? sendBackNote(back) : null;
  return {
    pending,
    sentBack: back ? { ...sendBackRecord(back, backNote), items: sendBackItems(back, backNote) } : null,
    done: done
      ? { ...sendBackRecord(done, String(done.meta?.note ?? '').trim() || null), ...doneTicks(done) }
      : null,
  };
}
/**
 * สภาพการส่งกลับ **ตามที่ใบเห็น** — ใบล็อก (ส่งผลแล้ว · ยกเลิก · ปิดโดยไม่ได้ผล — `surveyEditLockError`) = เรื่องที่ค้างไม่ค้างแล้ว:
 * ช่างแก้ต่อไม่ได้ แจ้งก็ไม่ได้ · (รอบสาม: เดิมดูแค่ `answeredAt` ⇒ ใบยกเลิก/ปิดโดยไม่ได้ผลยังค้างป้าย "ส่งกลับให้แก้" ที่ไม่มีใครทำได้)
 * 🐞 review 26/09 — ตั้งแต่ S4 หัวหน้าส่งผลได้ทั้งที่ส่งกลับค้าง ⇒ ใบล็อกแต่การ์ด/ป้าย "ส่งกลับให้แก้" ของช่างค้างพร้อมปุ่มที่กดไม่ได้
 *   ⚠️ **ไม่เขียนแถวปิดลงเธรด** (ลองแล้วรอบสอง): แถว `send_back_done` ถูกอ่านทุกที่ว่า "ช่างแจ้งว่าแก้แล้ว" — ป้ายเธรดก็เช่นกัน
 *     ⇒ ดึงผลกลับมาแก้แล้วหัวหน้าเห็นกล่องเขียวที่ไม่จริง · ใช้ตัวนี้แทน: ดึงกลับ = ปลดล็อก = เรื่องกลับมาค้างตามจริง
 * ⭐ **ใบที่ไม่ต้องมีนัดแล้ว** (`needsVisit: false` — ทุกพื้นที่ที่เหลือประเมินจากแบบ · `surveyNeedsVisit` ของ `surveyMethod.js`)
 *   = เรื่องที่ค้างไม่ค้างเช่นกัน: ไม่มีช่างคนไหนต้องกลับไปหน้างานแล้ว ปล่อยค้าง = ใบรอคนที่ไม่มีงานให้ทำ
 *   ⚠️ ผู้เรียกคำนวณจากแถวพื้นที่แล้วส่งมา · ไม่ส่ง = `true` = พฤติกรรมเดิม · ต้องเป็น `false` ตรงตัวจึงจะปิด
 *   ⚠️ คนละธงกับ `closedBySend` — ไม่มีอะไรถูกส่งออกไป · ใบล็อกชนะเสมอ (เหตุคือ "ส่งผลแล้ว" ไม่ใช่ "เปลี่ยนวิธี")
 * @returns สภาพเดิม · `{ ...state, pending: false, closedBySend: true }` เมื่อใบส่งผลแล้วตอนเรื่องยังค้าง
 *   · `{ ...state, pending: false, closedByMethod: true }` เมื่อใบไม่ต้องมีนัดแล้วตอนเรื่องยังค้าง
 */
export function surveySendBackOnSheet(state, request = null, { needsVisit = true } = {}) {
  if (!state?.pending) return state ?? null;
  if (request && surveyEditLockError(request)) return { ...state, pending: false, closedBySend: true };
  if (needsVisit === false) return { ...state, pending: false, closedByMethod: true };
  return state;
}

/**
 * 🔑 **ด่านปุ่ม "แจ้งหัวหน้าว่าแก้แล้ว"** — จอกับ route ถามตัวเดียวกัน
 * ⚠️ ต้องแก้ของฝั่งช่างครบจริงก่อน (ด่านเดียวกับ "ส่งงาน") — แจ้งว่าแก้แล้วทั้งที่ยังขาด =
 *   หัวหน้าเปิดมาเจอของเดิม แล้วต้องส่งกลับอีกรอบ (หนึ่งเที่ยวเปล่า)
 * ⚠️ `canWrite` มาจาก server (ด่านรายใบ `visitWriteAccess`) — จอไม่รู้ user id ของตัวเอง
 */
export function surveySendBackDoneError(request, {
  canWrite = false, pending = false, rows = [], filesByZone = {},
} = {}) {
  const locked = surveyEditLockError(request);
  if (locked) return locked;
  if (!canWrite) return 'แจ้งว่าแก้แล้วได้เฉพาะช่างที่ถูกมอบหมายนัดของใบนี้';
  if (!pending) return 'ไม่มีเรื่องที่หัวหน้าแจ้งให้แก้ค้างอยู่';
  const gaps = surveyCrewGaps(rows, filesByZone);
  if (gaps.length) {
    return `ยังแจ้งไม่ได้ — ยังขาด ${gaps.map((g) => `${g.short} (${g.zones.join(' · ')})`).join(' · ')}`;
  }
  return null;
}

/**
 * ตัวนับ "n / m ข้อ" ของการแจ้งว่าแก้แล้ว — กติกาเดียวทั้งเธรด · กระดิ่ง · การ์ดของหัวหน้า
 *   (ผู้เรียกเติมคำนำเอง: "แก้แล้ว 1 / 2 ข้อ" · "ช่างแจ้งว่าแก้แล้ว 1 / 2 ข้อ")
 * ⚠️ ไม่รู้ว่าติ๊กอะไร (`doneCount` เป็น null) หรือใบไม่มีข้อ = `null` ไม่มีตัวนับ (ไม่ใช่ "0 / 2")
 */
export function surveySendBackDoneCountText(doneCount, itemCount) {
  if (!Number.isInteger(doneCount) || !Number.isInteger(itemCount) || itemCount <= 0) return null;
  return `${doneCount} / ${itemCount} ข้อ`;
}

/** ข้อความบรรทัดเธรดของการแจ้งว่าแก้แล้ว · `auto` = ปิดให้เองเพราะช่างกด "ส่งงาน"
 *  `doneCount` / `itemCount` = ติ๊กกี่ข้อจากกี่ข้อ (ไม่ส่งมา = คำเดิมไม่มีตัวนับ) */
export function surveySendBackDoneBody(note = '', { auto = false, doneCount = null, itemCount = null } = {}) {
  if (auto) return 'ช่างส่งงานหน้างานแล้ว — รวมสิ่งที่หัวหน้าแจ้งให้แก้';
  const text = String(note ?? '').trim().slice(0, 300);
  const count = surveySendBackDoneCountText(doneCount, itemCount);
  return `ช่างแจ้งว่าแก้ตามที่หัวหน้าแจ้งแล้ว${count ? ` · แก้แล้ว ${count}` : ''}${text ? ` — ${text}` : ''}`;
}

// ฉบับกระดิ่งของ `surveySendBackBody` — กี่ข้อแรก · ตัดข้อละกี่ตัวอักษร
const SEND_BACK_BELL_ASKS = 2;
const SEND_BACK_BELL_ASK_MAX = 120;

/** ข้อความบรรทัดเธรด/กระดิ่ง — เขียนที่เดียว ใช้ทั้ง route และเทสต์
 *  ⚠️ ต้องบอก **ข้อที่ติดพร้อมชื่อพื้นที่** ไม่ใช่แค่ "ยังไม่ครบ" — ช่างต้องรู้ว่าไปที่ไหน
 *    ทำอะไร โดยไม่ต้องเปิดจอไล่อ่านทีละพื้นที่
 *  `note` = ข้อความ (ข้อคั่นด้วยจุด) หรือลิสต์ข้อ · `bell: true` = ฉบับกระดิ่ง (ดูข้างล่าง) */
export function surveySendBackBody(gaps = [], note = '', { bell = false } = {}) {
  const lines = (gaps || []).map((g) => `${g.label} — ขาด ${g.zones.join(' · ')}`);
  /* 🐞 UAT 25/09 — กระดิ่งเก็บแค่ 500 ตัวอักษรแรก (`notifyUsers`) · ฉบับเธรดวางข้อของหัวหน้าก่อนของขาด
     ⇒ ข้อยาว ๆ สามสี่ข้อดัน "ภาพกว้าง — ขาด ห้อง A" หลุดท้าย กระดิ่งไม่บอกแล้วว่าไปพื้นที่ไหน
     ⇒ ฉบับกระดิ่ง: ของขาด (ชื่อพื้นที่) ก่อน · ข้อของหัวหน้าแค่ 2 ข้อแรก (ตัดข้อละ 120) + "และอีก n ข้อ"
     · ข้อครบอยู่บนจอของช่าง (ติ๊กจาก `meta.items`) · ⚠️ ฉบับเธรดห้ามสลับลำดับ — `sendBackNote` ตัดแถวเก่าตามรูปนี้ */
  if (bell) {
    const asks = (Array.isArray(note) ? note : [note]).map((t) => String(t ?? '').trim()).filter(Boolean);
    const shown = asks.slice(0, SEND_BACK_BELL_ASKS)
      .map((t) => (t.length > SEND_BACK_BELL_ASK_MAX ? `${t.slice(0, SEND_BACK_BELL_ASK_MAX - 1)}…` : t));
    const more = asks.length - shown.length;
    return `หัวหน้าแจ้งให้กลับไปเก็บงานหน้างาน — ${[...lines, ...shown, ...(more > 0 ? [`และอีก ${more} ข้อ`] : [])].join(' · ')}`;
  }
  /* ⚠️ ไม่ตัดที่ 300 แล้ว (S3) — ข้อความเป็นหลายข้อที่ผ่านเพดานรายข้อมาแล้ว (`surveySendBackItems`)
     ตัดทั้งก้อนที่ 300 = ข้อท้าย ๆ หายจากเธรดที่ฝ่ายขายอ่าน · เพดานที่เหลือคือของ `appendUpdate` (4000)
     ซึ่งสิบข้อเต็มเพดานรายข้อยังไม่ถึง */
  const text = Array.isArray(note) ? note.join(' · ') : String(note);
  return `หัวหน้าแจ้งให้กลับไปเก็บงานหน้างาน — ${text.trim()}`
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

/* ── แถว "ดึงผลกลับมาแก้" ที่ตรึงไว้ในเธรด (`entity_updates` kind='recall') ──
 *
 * 📍 **อยู่ที่นี่เพราะ *server* อ่านมันด้วย** — `surveyRepo` แกะแถวนี้ตอนตอบ GET ⇒ ถ้า
 *   ตัวแกะไปอยู่ในไฟล์ประกอบหน้าจอ (`surveyControl.js`) เส้น API สี่เส้นจะลาก
 *   โมดูลฝั่งจอเข้ามาทั้งสาย · ชั้นต้องไหลทางเดียว: จอ → กฎ (ไฟล์นี้) → จบ
 *
 * 🐞 **เหตุผลไม่มีคอลัมน์ของตัวเอง** — route ดึงกลับเขียนมันลง `body` รวมกับตัวเลขเดิม
 *   ("TS ดึงผลประเมินกลับมาแก้ — {เหตุผล} · ตัวเลขที่ส่งไปแล้ว …") ⇒ ต้องแกะกลับที่นี่
 *   ที่เดียว ไม่ใช่ให้แต่ละจอแกะเอง · แกะไม่ออก = คืน `body` ทั้งก้อน **ไม่ใช่ null**
 *   (ประโยคยาวไปยังอ่านรู้เรื่อง · ช่องว่างแปลว่า "ไม่เคยดึงกลับ" ซึ่งผิดความจริง)
 * ⚠️ `meta.totals` คือตัวเลขที่ฝ่ายขายถือไปแล้ว — ของชิ้นเดียวที่บอกได้ว่า "ผลเดิม" คืออะไร
 */
export function surveyRecallRecord(row) {
  if (!row) return null;
  const body = String(row.body ?? '').trim();
  const cut = body.match(/—\s*([\s\S]*?)(?:\s*·\s*ตัวเลขที่ส่งไปแล้ว[\s\S]*)?$/);
  const reason = String(cut?.[1] ?? body).trim() || null;
  const meta = row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta) ? row.meta : {};
  const totals = meta.totals && typeof meta.totals === 'object' ? meta.totals : null;
  return {
    id: row.id || null,
    reason,
    body: body || null,
    byId: row.authorId != null ? String(row.authorId) : null,
    byName: row.authorName || null,
    at: row.createdAt || null,
    totals,
  };
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
  /* ⭐ ขนาดเปลี่ยนทั้งที่จำนวนรวมเท่าเดิม (ST 2 → SM 1 · ST 1) = ราคาเปลี่ยน ⇒ ต้องบอก
     ⚠️ เทียบเฉพาะเมื่อ **ทั้งสองฝั่ง** ถือสัดส่วนขนาด — ยอดที่ตรึงไว้ก่อน mig 0398 ไม่มี ⇒ เงียบ ไม่ใช่ "— → ST 2" */
  if (before.packagesBySize && after.packagesBySize) {
    const a = surveyPackageMixText(before.packagesBySize);
    const b = surveyPackageMixText(after.packagesBySize);
    if (a !== b) out.push(`ขนาด ${a || '—'} → ${b || '—'}`);
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
 *
 * 🔑 **ครอบด่านส่งงานของช่าง (`surveyFieldSubmitError`) ทั้งหมด** — ต้องเหลือพื้นที่อย่างน้อยหนึ่ง ("พื้นที่")
 *   และทุกพื้นที่ที่ไม่ถูกตัดผ่านข้อของช่าง (ขนาด · ภาพกว้าง · จุดที่ติดตั้งได้) **และ** ข้อของหัวหน้า
 *   (ภาพผัง · เลือกจุด · ขนาดและจำนวนแพ็คเกจที่เคาะ พร้อมเหตุผลเมื่อต่างจากที่ระบบเสนอ = "แพ็คที่ตกลงไว้") · เข้มกว่าด้วย: ใบที่ตัดออกหมด
 *   ช่างส่งงานได้ แต่ส่งผลไม่ได้
 *   ⇒ **ส่งผลปิดนัดที่ยังเปิดให้ได้โดยไม่ต้องมีด่านที่สอง** (มติเจ้าของ 24/09 ข้อ 2 · `surveySendWrites`)
 *   ⚠️ ถอดข้อไหนของช่างออกจากที่นี่เมื่อไร ส่งผลจะปิดนัดที่ของช่างยังไม่ครบ — เทสต์ตรึงความครอบนี้ไว้
 * 🔄 **ด่านรูปจุด (มติ 01/10) ไม่อยู่ที่นี่** — `surveySpotSendError` (`surveySpotPhotos.js` · import ย้อนมาไฟล์นี้ไม่ได้ = วงวน
 *   กับ `attachmentTypes`) · route ส่งผลและการ์ดถามคู่กันเสมอ: ตัวนี้ก่อน แล้ว `surveySpotSendError(…, { closesVisit })`
 *   ⇒ ความครอบของด่านส่งงานยังจริงทั้งชุด (เทสต์ใน `surveySpotGates.test.mjs`)
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
    if (all.length) stuck.push(`${surveyZoneName(row)}: ${all.join(' · ')}`);
  }
  if (stuck.length) {
    const show = stuck.slice(0, 3).join(' | ');
    return `ยังส่งผลไม่ได้ — ${show}${stuck.length > 3 ? ` และอีก ${stuck.length - 3} พื้นที่` : ''}`;
  }
  return null;
}

/** ความคืบหน้าหน้างานของทั้งใบ — หัวจอมือถือ ("วัดแล้ว 3 / 5 พื้นที่")
 *  ⭐ **นับเฉพาะพื้นที่ลงหน้างาน** — พื้นที่จากแบบไม่ใช่ของที่ช่าง "วัดแล้ว" จึงไม่อยู่ทั้งตัวตั้งและตัวหาร
 *    จำนวนของมันแยกเป็นคีย์ `drawing` · ⚠️ **มีคีย์นี้เฉพาะเมื่อมากกว่า 0** — ใบลงหน้างานล้วนได้สามคีย์เดิม
 *    เป๊ะ (ผู้อ่านใช้ `progress.drawing || 0`) */
export function surveyFieldProgress(rows = [], filesByZone = {}) {
  const active = (Array.isArray(rows) ? rows : []).filter((r) => !isCut(r));
  const onsite = active.filter((r) => !isDrawingZone(r));
  const done = onsite.filter((r) => surveyFieldMissing(r, filesByZone?.[r.id] || []).length === 0);
  const progress = { total: onsite.length, done: done.length, complete: onsite.length > 0 && done.length === onsite.length };
  const drawing = active.length - onsite.length;
  return drawing > 0 ? { ...progress, drawing } : progress;
}

/* ══ ช่างกด "ส่งงาน" หน้างาน (มติผู้ใช้ 2026-09-21) ═══════════════════════
 *
 * ⭐ flow ของช่าง: **รับงาน (= เริ่มงาน) → ใส่รายละเอียด → รูป → ส่งงาน** แล้วหัวหน้าเคาะ
 *   จุดติดตั้ง/แพ็คเกจทีหลังที่แท็บสรุปส่งผล ก่อนกดส่งผลให้ฝ่ายขาย
 *   "ส่งงาน" = ปิดนัดประเมินว่าเข้าพื้นที่ได้ (`done`) — ไม่แตะสถานะใบคำร้อง
 *
 * 🔴 **บล็อกเมื่อของฝั่งช่างยังไม่ครบ** (มติ 2026-09-21 "บล็อก บอกเหตุ") — ช่างยังยืนอยู่
 *   หน้างาน แก้ได้ทันที · ปล่อยผ่าน = หัวหน้าต้องกด "แจ้งช่างให้กลับไป" แล้วไปอีกเที่ยว
 *   🐞 ก่อนหน้านี้นัดประเมินปิดเป็น "เสร็จ" ได้ทั้งที่ยังไม่ได้วัดสักพื้นที่ (แผ่นปิดงานของ
 *   งานบริการไม่รู้จักผลวัดเลย)
 * ⚠️ ข้อของหัวหน้า (ผัง · เลือกจุด · แพ็คเกจ) **ไม่บล็อก** — นั่นคือสิ่งที่ทำทีหลังได้
 * ⚠️ ทางออกที่ไม่ต้องวัดให้ครบมีสองทาง และข้อความต้องชี้ด้วยคำเดียวกับปุ่มบนจอเป๊ะ:
 *   "ตัดพื้นที่นี้ออก" (มีเหตุผล) · "ไปแล้วเข้าไม่ได้" (ทางนั้นไม่ถามด่านนี้เลย)
 * ⚠️ ใบที่ล็อกแล้ว (ส่งผล · ยกเลิก · ปิด) ผู้เรียกข้ามด่านนี้ — ช่างแก้ผลวัดไม่ได้อยู่แล้ว
 *   บล็อกไว้ = นัดค้างเปิดตลอดกาล
 * ⭐ **ช่างไม่ได้กดส่งงาน นัดก็ไม่ค้างแล้ว** (มติเจ้าของ 24/09 ข้อ 2 · แทนมติ 16/09) — หัวหน้ากด "ส่งผล" แล้ว
 *   นัดที่ยังนัดไว้/กำลังทำถูกปิดเป็น "เข้าแล้ว" ไปพร้อมกัน (`surveySendWrites`) · ด่านของการปิดทางนั้นคือ
 *   `surveySendError` ซึ่งครอบด่านนี้ทั้งหมด ⇒ ไม่มีทางไหนปิดนัดเป็น "เข้าแล้ว" ได้โดยของช่างไม่ครบ
 *   ⚠️ ส่งผลไม่ประทับเวลาจบ — ปุ่มนี้ยังเป็นทางเดียวที่ได้เวลาจบจริงและกระดิ่ง "ช่างส่งงานแล้ว" ถึงหัวหน้า
 * 🔄 **ด่านรูปจุด (G1 · มติ 01/10)** อยู่ที่ `surveySpotSubmitError` (`surveySpotPhotos.js`) — route ปิดนัดและกล่องส่งงาน
 *   ถามต่อจากตัวนี้เสมอ (ทุกจุดมีรูปที่ผูก ≥ 1 · ถาด "ยังไม่ได้ผูกจุด" ว่าง)
 */
export function surveyFieldSubmitError(rows = [], filesByZone = {}) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) {
    return 'ใบนี้ยังไม่มีพื้นที่ให้วัด — กด “เพิ่มพื้นที่ที่เจอหน้างาน” ก่อน หรือเลือก “ไปแล้วเข้าไม่ได้”';
  }
  const gaps = surveyCrewGaps(list, filesByZone);
  if (!gaps.length) return null;
  const text = gaps.map((g) => `${g.short} (${g.zones.join(' · ')})`).join(' · ');
  return `ยังส่งงานไม่ได้ — ขาด ${text} · กรอกให้ครบ หรือกด “ตัดพื้นที่นี้ออก” พร้อมเหตุผล`;
}
