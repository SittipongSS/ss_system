// ── วิธีประเมินรายพื้นที่: ลงหน้างาน / ประเมินจากแบบ (mig 0408) ────────────────
//
// ⭐ **ทำไมเก็บรายพื้นที่ ไม่ใช่รายใบ** (แผน survey-desk-assessment §1 · มติเจ้าของ 08–09/10)
//   ใบเดียวผสมได้ — บางพื้นที่ช่างไปวัดจริง บางพื้นที่หัวหน้าประเมินจากแบบแปลน
//   ⇒ "ใบนี้ต้องมีนัดไหม" **คำนวณจากแถวพื้นที่ทุกครั้ง** ไม่เก็บซ้ำบนใบ: แถวเปลี่ยนได้จากหลายเส้น
//   (เพิ่ม · ตัด · คืน · ลบ · แอดมินลบทะเบียน) คอลัมน์สรุปบนใบจะเพี้ยนจากแถวจริงในวันหนึ่ง
//
// 🔑 **`zoneMethod` คือที่เดียวในระบบที่เทียบค่าคอลัมน์ `method`** — ที่อื่นถามผ่านตัวนี้
//   แถวเก่า / fixture เก่า **ไม่มีคีย์ `method` เลย** ⇒ ทุกค่าที่ไม่ใช่ 'drawing' ตรงตัวคือลงหน้างาน
//   = ใบที่ไม่มีพื้นที่จากแบบเดินเหมือนเดิมทุกตัวอักษร
//
// 🔴 **ไฟล์นี้เป็นโมดูลใบ — ไม่ดึงโมดูลไหนเข้ามาเลย** ฟังก์ชันล้วน ไม่แตะฐานข้อมูล
//   `attachmentTypes.js` ดึง `survey.js` อยู่แล้ว และ `survey.js` ดึงไฟล์นี้
//   ⇒ ไฟล์นี้ดึงตัวใดตัวหนึ่งกลับ = วงกลม (ยามอยู่ที่เทสต์ข้อสุดท้ายของ `surveyMethod.test.mjs`)

export const SURVEY_METHOD_ONSITE = 'onsite';
export const SURVEY_METHOD_DRAWING = 'drawing';

const list = (v) => (Array.isArray(v) ? v : []);
// กติกาเดียวกับ `isCut` ใน `survey.js` — ไม่มี status = ยังใช้อยู่
const isCut = (row) => (row?.status || 'ok') === 'cut';
/* เวลาเป็นมิลลิวินาที · อ่านไม่ออก = `NaN`
   ⚠️ ห้ามเทียบเวลาเป็นสตริง — PostgREST คืน `…+00:00` ส่วน `toISOString()` คืน `…Z`
      ชั่วขณะเดียวกันแต่สตริงไม่เท่ากัน และเรียงผิดเมื่อโซนเวลาต่างกัน */
const ms = (v) => Date.parse(String(v ?? ''));
const text = (v) => String(v ?? '').trim();
// แถวที่มีจริง — ช่องว่างในลิสต์ (null/undefined) ไม่นับเป็นพื้นที่
const rowsOf = (rows) => list(rows).filter(Boolean);
const isOnsite = (row) => !isDrawingZone(row);

/**
 * 🔑 วิธีประเมินของพื้นที่ — `'drawing'` เฉพาะ `row.method === 'drawing'` ตรงตัว
 * นอกนั้นทั้งหมด (`'onsite'` · null · ไม่มีคีย์ · `'Drawing'` · `''` · row ว่าง) = `'onsite'`
 */
export function zoneMethod(row) {
  return row?.method === SURVEY_METHOD_DRAWING ? SURVEY_METHOD_DRAWING : SURVEY_METHOD_ONSITE;
}

export function isDrawingZone(row) {
  return zoneMethod(row) === SURVEY_METHOD_DRAWING;
}

/**
 * นับพื้นที่รายวิธี **เฉพาะแถวที่ไม่ถูกตัด** แล้วบอกโหมดของใบ
 * `mode`: `'empty'` ไม่เหลือพื้นที่ · `'onsite'` ลงหน้างานล้วน · `'drawing'` จากแบบล้วน · `'mixed'` ผสม
 * ⚠️ `'empty'` ไม่ได้แปลว่าเป็นงานโต๊ะ — คำถาม "ต้องมีนัดไหม" ให้ถาม `surveyNeedsVisit` เท่านั้น
 */
export function surveyMethodMix(rows) {
  let onsite = 0;
  let drawing = 0;
  for (const row of rowsOf(rows)) {
    if (isCut(row)) continue;
    if (isDrawingZone(row)) drawing += 1;
    else onsite += 1;
  }
  let mode = 'mixed';
  if (onsite + drawing === 0) mode = 'empty';
  else if (drawing === 0) mode = 'onsite';
  else if (onsite === 0) mode = 'drawing';
  return { onsite, drawing, mode };
}

/**
 * 🔑 **ตัวตัดสินเดียวว่าใบนี้ต้องมีนัดลงหน้างานไหม** — คิว · ราง · ขั้น · ลงวัน · ส่งผล ถามตัวนี้
 *   ยังมีพื้นที่ใช้อยู่  ⇒ ต้องมีนัดเมื่อมีพื้นที่ลงหน้างานอย่างน้อยหนึ่ง
 *   ถูกตัดหมดทั้งใบ   ⇒ ดูจากแถวที่ตัด: ต้องมีนัด เว้นแต่ **ทุกแถว** เป็นจากแบบ
 *   ไม่มีแถวเลย / ไม่ได้ส่งอาร์เรย์มา ⇒ ต้องมีนัด
 *
 * ⚠️ **"ไม่เหลือพื้นที่" ไม่ใช่งานโต๊ะ** — RQ-AS-26090233 (พื้นที่เดียวของใบถูกตัด ลงหน้างาน)
 *    ต้องเดินเหมือนทุกวันนี้ · ถ้าตอบจาก "ไม่มีพื้นที่ลงหน้างานเหลือ" ตรง ๆ ใบแบบนี้จะกลายเป็น
 *    งานโต๊ะเองทั้งที่ไม่มีใครเลือก
 * ⚠️ ผู้อ่านที่ไม่ได้แนบแถวพื้นที่มา ได้ `true` = พฤติกรรมเดิม · ฝั่ง server ยังกันการเปิดนัดให้ใบ
 *    งานโต๊ะอีกชั้น ⇒ การ์ดที่ตอบผิดไปทางนี้ไม่พาใบงานโต๊ะขึ้นปฏิทินช่าง
 * 🐞 กติกา "ตัดหมด" อ่านแถวที่ตัดไปแล้ว ⇒ เส้นที่ทำให้ใบพลิกเป็นงานโต๊ะต้องเขียน 'drawing'
 *    ลงแถวที่ตัดด้วย ไม่งั้นลำดับ A (ลงหน้างาน) ตัด → B เป็นจากแบบ → B ตัด จะพลิกกลับเป็น
 *    "ต้องมีนัด" ทั้งที่วันบนใบเป็นวันงานโต๊ะ
 */
export function surveyNeedsVisit(rows) {
  const all = rowsOf(rows);
  const active = all.filter((r) => !isCut(r));
  if (active.length) return active.some(isOnsite);
  return all.length === 0 || all.some(isOnsite);
}

/**
 * พื้นที่ที่เพิ่มบนใบ (หรือคืนกลับมา) เกิดมาเป็นวิธีไหน
 *   ใบมีแถวแล้ว (สถานะใดก็ได้) ⇒ ตามใบ: ยังต้องมีนัด = `'onsite'` · งานโต๊ะ = `'drawing'`
 *   ใบยังไม่มีแถวเลย          ⇒ ตามที่ฝ่ายขายขอ (`variant === 'drawing'`)
 * ⚠️ **ไม่ดูว่าใครเป็นคนกด** — ช่างเพิ่มพื้นที่บนใบงานโต๊ะก็ได้แถวจากแบบ ไม่งั้นใบพลิกกลับไป
 *    ต้องมีนัดเงียบ ๆ จากการเพิ่มพื้นที่ครั้งเดียว
 */
export function surveyNewZoneMethod(rows, { variant = null } = {}) {
  const all = rowsOf(rows);
  if (all.length) return surveyNeedsVisit(all) ? SURVEY_METHOD_ONSITE : SURVEY_METHOD_DRAWING;
  return variant === 'drawing' ? SURVEY_METHOD_DRAWING : SURVEY_METHOD_ONSITE;
}

/**
 * ตัด / ลบแถวนี้แล้ว ใบ **พลิก** จาก "ต้องมีนัด" เป็น "ไม่ต้องมีนัด" ไหม
 * `to: 'cut'` = แถวนั้นได้ `status: 'cut'` · `to: 'removed'` = แถวนั้นหายจากลิสต์
 * จริงเฉพาะตอนพลิกจาก true เป็น false — ใบที่เป็นงานโต๊ะอยู่แล้ว · ไม่รู้จัก id · `to` ค่าอื่น = `false`
 * ⚠️ เทียบ id ผ่าน `String()` — id จาก URL เป็นสตริงเสมอ ส่วนแถวอาจถือเลข
 */
export function surveyZoneChangeFlips(rows, { id, to } = {}) {
  if (to !== 'cut' && to !== 'removed') return false;
  if (id == null) return false;
  const all = rowsOf(rows);
  const key = String(id);
  // แถวไม่มี id ไม่จับคู่กับใคร (String(undefined) จะกลายเป็นคำว่า 'undefined')
  const hit = (r) => r.id != null && String(r.id) === key;
  if (!all.some(hit)) return false;
  if (!surveyNeedsVisit(all)) return false;
  const after = to === 'cut'
    ? all.map((r) => (hit(r) ? { ...r, status: 'cut' } : r))
    : all.filter((r) => !hit(r));
  return !surveyNeedsVisit(after);
}

/**
 * พื้นที่ที่ **สลับกลับมาเป็นลงหน้างาน** แล้วยังไม่ถูกบันทึกผลวัดใหม่หลังสลับ
 * ตัวเลขที่ค้างอยู่บนแถวคือของตอนประเมินจากแบบ — ช่างต้องวัดจริงแล้วบันทึกทับก่อนผ่านด่านขนาด
 *
 * ⚠️ `methodChangedAt` ว่าง = ไม่เคยสลับ ⇒ `false` เสมอ (ทุกแถวเดิมของระบบอยู่กรณีนี้)
 * ⚠️ เวลาเท่ากันพอดี หรืออ่านเวลาไม่ออก = **ยังค้าง** — ต้องพิสูจน์ได้ว่าบันทึกหลังสลับจึงจะผ่าน
 */
export function surveyZoneNeedsResave(row) {
  if (isDrawingZone(row)) return false;
  if (!text(row?.methodChangedAt)) return false;
  if (!text(row.surveyedAt)) return true;
  // เทียบกับ NaN ได้ false เสมอ ⇒ ฝั่งใดอ่านไม่ออกก็ตกมาเป็น "ยังค้าง" เอง
  return !(ms(row.surveyedAt) > ms(row.methodChangedAt));
}

/**
 * ใครคือผู้ประเมินของพื้นที่ **จากแบบ** — ตัวเดียวที่ทั้งกระดาษและจอใช้ (ไม่งั้นสองที่ขึ้นคนละชื่อ)
 * แถวลงหน้างาน = `null` · แถวจากแบบ = `{ name, at }` จากทางแรกที่มีชื่อ:
 *   ① คนที่บันทึกแถว **หลังจากมันเป็นจากแบบ** (`methodChangedAt` ว่าง = เกิดมาเป็นจากแบบ)
 *   ② คนที่สลับวิธี
 *   ③ คนที่ส่งผลของใบ (`answeredByName`)
 *   ไม่มีชื่อเลย = `{ name: null, at: null }`
 *
 * 🔴 **`surveyedByName` ที่บันทึกไว้ก่อนสลับคือชื่อช่างหน้างาน** — ห้ามขึ้นเป็นผู้ประเมินจากแบบ
 *    ⇒ ทาง ① ต้องพิสูจน์ได้ว่าบันทึกหลังสลับ (เวลาเท่ากัน / อ่านไม่ออก = ไม่นับ ตกไปทาง ②)
 */
export function surveyDrawingAssessor(row, request = null) {
  if (!isDrawingZone(row)) return null;

  const savedBy = text(row.surveyedByName);
  const savedAsDrawing = text(row.surveyedAt) !== ''
    && (!text(row.methodChangedAt) || ms(row.surveyedAt) > ms(row.methodChangedAt));
  if (savedAsDrawing && savedBy) return { name: savedBy, at: row.surveyedAt };

  const switchedBy = text(row.methodChangedByName);
  if (switchedBy) return { name: switchedBy, at: row.methodChangedAt || null };

  const sentBy = text(request?.answeredByName);
  if (sentBy) return { name: sentBy, at: request.answeredAt || null };

  return { name: null, at: null };
}

/**
 * ไฟล์นี้เป็นรูป JPG / PNG ไหม — ภาพแบบของพื้นที่จากแบบต้องเป็นสองชนิดนี้เท่านั้นจึงลงกระดาษได้
 * (PDF · TIFF · HEIC · BMP · WEBP · GIF = `false`)
 * มี `mimeType` ⇒ ตัดสินจาก `mimeType` อย่างเดียว · ไม่มี (เบราว์เซอร์บางตัวส่งว่างตอนลากวาง)
 * ค่อยดูนามสกุลของ `fileName` — ลำดับเดียวกับ `isUndecodable` ใน `surveyReportSnapshot.js`
 * ⚠️ เข้มกว่าชุด "รูปที่เปิดดูได้" ของระบบโดยตั้งใจ: ชุดนั้นนับ TIFF เป็นรูป แต่กระดาษวาดไม่ขึ้น
 */
export function isJpgOrPngFile(file) {
  const mime = text(file?.mimeType).toLowerCase();
  if (mime) return mime === 'image/jpeg' || mime === 'image/png';
  return /\.(jpe?g|png)$/.test(text(file?.fileName).toLowerCase());
}

// ── งวด S2a: สภาพ "ยืนยันหน้างาน" ของทะเบียนพื้นที่ + ตัวกรองผลจากแบบที่ถูกแทนแล้ว ─────────────

/**
 * สภาพการยืนยันหน้างานของพื้นที่ในทะเบียน — `'none'` · `'drawing'` · `'awaiting'`
 * `row` = แถวผลล่าสุดที่ส่งแล้วของพื้นที่ **หลังผ่าน `surveyDropSupersededDrawing`** · `request` = ใบของแถวนั้น
 *   ไม่มีแถว / แถวลงหน้างาน            ⇒ `'none'` (ค่าบนใบไม่เกี่ยว)
 *   แถวจากแบบ + ใบตอบว่า `'needed'`    ⇒ `'awaiting'` (รอยืนยันหน้างาน)
 *   แถวจากแบบ นอกนั้น (`'not_needed'` · ยังไม่เลือก · ไม่มีใบ) ⇒ `'drawing'`
 * ⚠️ `surveyConfirm` เทียบตรงตัว — ค่าที่ไม่รู้จักไม่ถูกเดาว่าเป็น "ต้องยืนยัน"
 * ⚠️ ค่าที่สี่ (`'confirming'` ของงวด S5) ต่อเป็นกิ่งใหม่ **ก่อน** บรรทัด `'needed'` ได้ โดยสามค่านี้ไม่ขยับ
 */
export function surveyConfirmState(row, request = null) {
  if (!row || !isDrawingZone(row)) return 'none';
  if (request?.surveyConfirm === 'needed') return 'awaiting';
  return 'drawing';
}

/**
 * ตัดแถว **จากแบบ** ที่ถูกผลลงหน้างานของใบรุ่นหลังแทนไปแล้ว — ทะเบียนต้องไม่ขึ้นป้าย "จากแบบ" ให้พื้นที่ที่วัดจริงแล้ว
 * `rows` = แถวที่ส่งผลแล้วและไม่ถูกตัดของ **พื้นที่เดียว** (ผู้เรียกกรองมา) · `createdAtOf(row)` = เวลาเปิดใบของแถวนั้น
 * ทิ้งแถวจากแบบ D เมื่อในลิสต์มีแถวลงหน้างาน O ที่ใบของ O **เปิดทีหลัง** ใบของ D
 *   ใบเดียวกัน / เวลาเท่ากัน / ฝั่งใดอ่านเวลาไม่ออก ⇒ D อยู่ (เทียบกับ NaN ได้ false เสมอ — ต้องพิสูจน์ได้ว่ามาทีหลัง)
 *   จากแบบที่เปิด **หลัง** ลงหน้างาน (ปรับปรุงพื้นที่แล้วประเมินจากแบบใหม่) ⇒ อยู่ทั้งคู่
 * ⚠️ คืนออบเจ็กต์ตัวเดิม ลำดับเดิม · **ไม่มีอะไรให้ทิ้ง = คืนอาร์เรย์ตัวเดิม** (ใบลงหน้างานล้วนไม่ถูกสร้างอาร์เรย์ใหม่)
 * ⚠️ ไม่ส่ง `createdAtOf` = ไม่รู้ลำดับของใบ ⇒ ไม่ทิ้งอะไรเลย
 */
export function surveyDropSupersededDrawing(rows, { createdAtOf } = {}) {
  if (!Array.isArray(rows)) return [];
  if (typeof createdAtOf !== 'function') return rows;
  if (!rows.some(isDrawingZone)) return rows;
  const onsiteTimes = rows.filter((r) => r && isOnsite(r)).map((r) => ms(createdAtOf(r)));
  if (!onsiteTimes.length) return rows;
  const superseded = (row) => {
    const mine = ms(createdAtOf(row));
    return onsiteTimes.some((t) => t > mine);
  };
  const kept = rows.filter((row) => !(isDrawingZone(row) && superseded(row)));
  return kept.length === rows.length ? rows : kept;
}
