// ── ของที่จอหน้างานแบบ A วาด — ตัวตัดสินล้วน (แผน §10.5 จอหน้างานแบบ A · มติเจ้าของ 25/09) ──
//
// ⭐ **จอวาดอย่างเดียว** — ม็อกที่อนุมัติ (A-1…A-5 · AT · AW · AO) มีคำและตัวเลขเป็นร้อยจุด: "วัดแล้ว 2 / 3 พื้นที่" ·
//   "ขาด: ขนาด · ภาพกว้าง · จุด" · "นัด 10:00 · อีก 8 นาที" · "ปิดนัด SV-… เป็น “เข้าแล้ว” (10:12–11:46)" ·
//   "ส่วน B ยังขาดความสูง" · "แก้แล้ว 1 / 2 ข้อ" ⇒ ทุกคำประกอบที่นี่ที่เดียว เทสต์ได้ด้วยข้อมูลล้วน
//   🐞 บทเรียนของจอเดิม: การ์ดสองใบที่คำนวณเองได้เลขไม่เท่ากัน · "ถัดไป" ที่คิดในหน้าเด้งกลับใบแรกเสมอ (1↔5)
//
// 📍 **สามชั้น ไหลทางเดียว**: กฎของงาน (`survey.js` — ที่ server ถามด้วย) → การ์ดควบคุม (`surveyControl.js`)
//   → ไฟล์นี้ (จอหน้างาน) · ไฟล์นี้ **ไม่ประกาศกฎใหม่** — ด่านทุกข้อถามตัวเดิม (`surveyZoneFacts` ·
//   `surveyFieldSubmitError` · `surveyZoneSavePayload`) แล้วแปลงเป็นคำบนจอ
//   🔴 กฎใหม่ของใบประเมินให้เขียนที่ `survey.js` เสมอ — เขียนที่นี่ = กฎที่ server มองไม่เห็น
//
// 🔑 **บริสุทธิ์ทั้งไฟล์** — ไม่ยิง I/O · **ไม่อ่านนาฬิกา** · "ตอนนี้" มาทาง `nowKey` = `'YYYY-MM-DD HH:MM'` เวลาไทย
//   (ผู้เรียกประกอบจาก `businessDate()` + `businessTimeKey()` — กติกา thai-time ของระบบ)
// ⚠️ **ไฟล์ที่ใช้คือชุดสด** (`useLiveZoneFiles`) — รูปที่เพิ่งอัปต้องขยับตัวนับทุกที่ทันที ไม่ใช่แค่ที่หน้าพื้นที่
import { businessDayKey, businessTimeKey } from '@/lib/datePeriods';
import { fmtNumber, naText } from '@/lib/format';
import {
  SURVEY_DOC_SPOT,
  SURVEY_DOC_WIDE,
  isAddedZone,
  isBlankSurveyPart,
  isBlankSurveySpot,
  parseSurveyMeters,
  surveyDocCounts,
  surveyFieldProgress,
  surveyFieldSubmitError,
  surveyPartLetter,
  surveySendBackDoneCountText,
  surveyTotals,
  surveyZoneName,
  surveyZoneSavePayload,
} from './survey';
import {
  SURVEY_UNKNOWN_TEXT,
  surveyNameList,
  surveySendBackAsks,
  surveyZoneDraftSignature,
  surveyZoneFacts,
} from './surveyControl';
import { accessConflict, accessWindowText } from './sites';
import { accessWarnText, dayText, relDayText, thaiDayOf } from './queueWords';
import { VISIT_STATUS_LABELS, isClosedVisit } from './visitStatus';

/* ══ ขนาดจอ — เส้นแบ่งของระบบเท่านั้น (680 · 1000 · 1200) ══════════════════════════
   ≥1000 = สองบาน (รายการซ้าย · พื้นที่ขวา) · ≥1200 = หัวหน้าได้คอลัมน์ที่สาม "จัดการผลประเมิน"
   ⚠️ JS ตัดสินโหมด CSS อ่านตาม — ค่าชุดเดียวกับ `@media` ในไฟล์ CSS ของจอนี้ (เปลี่ยนที่หนึ่งต้องเปลี่ยนอีกที่) */
export const SURVEY_SPLIT_QUERY = '(min-width: 1000px)';
export const SURVEY_RAIL_QUERY = '(min-width: 1200px)';

const list = (value) => (Array.isArray(value) ? value : []);
const filesMap = (value) => (value && typeof value === 'object' ? value : {});
const isCutRow = (row) => (row?.status || 'ok') === 'cut';
const idOf = (value) => (value === null || value === undefined || value === '' ? null : String(value));
/* "10:00:00" → "10:00" · ค่าที่ไม่ใช่เวลา = '' (ช่องเวลาของนัดเป็นสตริงเวลาล้วน ไม่ใช่จุดเวลา) */
const hhmm = (value) => {
  const text = String(value ?? '').trim().slice(0, 5);
  return /^\d{2}:\d{2}$/.test(text) ? text : '';
};
/* ตร.ม./ลบ.ม. — ปัดสองตำแหน่งครั้งเดียวตอนเขียน (สูตรเดียวกับ `surveyZoneSize`) */
const round2 = (n) => Math.round(n * 100) / 100;
const figuresText = (area, volume) => `${fmtNumber(round2(area))} ตร.ม. · ${fmtNumber(round2(volume))} ลบ.ม.`;
/* "อ. 29 ก.ย. 09:10" จากจุดเวลา — วันและเวลาไทยทั้งคู่ (ห้ามผสมนาฬิกาสองโซนในข้อความเดียว) */
const stampText = (timestamp) => {
  const day = thaiDayOf(timestamp);
  const time = timestamp ? businessTimeKey(timestamp) : null;
  return [day ? dayText(day) : '', time || ''].filter(Boolean).join(' ');
};

/**
 * "ตอนนี้" ของจอหน้างาน — จุดเวลา → `'YYYY-MM-DD HH:MM'` **เวลาไทยทั้งวันและเวลา** (ค่า `nowKey` ที่ตัวตัดสินในไฟล์นี้รับ)
 * ⚠️ ผู้เรียกเป็นคนอ่านนาฬิกาแล้วส่งจุดเวลามา (แถบของช่างเดินทีละนาที) — ไฟล์นี้ไม่อ่านนาฬิกาเอง
 * ⚠️ วันกับเวลามาจากนาฬิกาเดียวกัน — วันจากเครื่อง + เวลาไทย = ข้อความเดียวที่มาจากสองโซน (กติกา thai-time)
 * @returns `null` เมื่ออ่านจุดเวลาไม่ออก
 */
export function surveyNowKey(value) {
  if (value === null || value === undefined || value === '') return null;
  const day = businessDayKey(value);
  const time = businessTimeKey(value);
  return day && time ? `${day} ${time}` : null;
}

/* ── ข้อของช่างสามข้อ — คำบนจอหน้างาน ─────────────────────────────────────────────
   ⚠️ **"จุด" ไม่ใช่ "จุดติดตั้ง"** — แถวรายการแคบ (ม็อก A-1/AO-2: "ขาด: ขนาด · ภาพกว้าง · จุด") · คีย์ต้องตรง
      กับ `SURVEY_GATES[].key` เพราะของขาดอ่านจากทะเบียนด่านตัวนั้น ไม่ใช่คิดเอง */
const CREW_MARKS = [
  { key: 'size', label: 'ขนาด' },
  { key: 'wide', label: 'ภาพกว้าง' },
  { key: 'spots', label: 'จุด' },
];
const crewMissingKeys = (facts) => new Set(facts.missingCrew.map((g) => g.key));
const crewMissingText = (facts) => {
  const keys = crewMissingKeys(facts);
  return keys.size ? `ขาด: ${CREW_MARKS.filter((m) => keys.has(m.key)).map((m) => m.label).join(' · ')}` : null;
};

/* อักษรย่อบนวงกลมชื่อ — กติกาเดียวกับเมนูบัญชี (`AppLayout`: ตัวแรกของคำแรก + คำสุดท้าย)
   ⚠️ ชื่อไทยข้ามสระหน้า (เ แ โ ใ ไ) — "เอกชัย" ต้องได้ "อ" ไม่ใช่ "เ" ที่ไม่ใช่ตัวอักษรของชื่อ */
const LETTER = /[A-Za-z0-9ก-ฮ]/u;
export function surveyInitials(name) {
  const words = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '';
  const letters = (word) => Array.from(word).filter((ch) => LETTER.test(ch));
  const picked = words.length >= 2
    ? [letters(words[0])[0], letters(words[words.length - 1])[0]]
    : letters(words[0]).slice(0, 2);
  return picked.filter(Boolean).join('').toUpperCase();
}

/* ══ ที่อยู่ของจอ ═════════════════════════════════════════════════════════════ */

/**
 * ลิงก์ของใบ — `?tab=result` · `?zone=<rowId>` (หน้าพื้นที่อยู่บนแท็บหน้างานเท่านั้น ⇒ แท็บสรุปไม่พกพื้นที่)
 * ⚠️ ปุ่ม/แถวที่เปิดพื้นที่ต้องเป็น `<button>` ไม่ใช่ `<a href={…}>` — ตัวเฝ้าค่าค้าง (`useUnsavedChanges`)
 *   โหลดหน้าใหม่ทั้งหน้าเมื่อกดลิงก์ที่ search ต่างกัน ⇒ ค่าที่พิมพ์ค้างหายโดยไม่ถาม · ลิงก์นี้ใช้กับที่ออกนอกจอ
 *   (กระดิ่ง · งานวันนี้ · การ์ดควบคุม) และ URL ที่ตัวต่อสายประวัติ (`useSurveyZoneRoute`) เขียน
 */
export function surveySheetHref(requestId, { tab = 'field', zoneId = null } = {}) {
  const base = `/service/surveys/${encodeURIComponent(String(requestId ?? ''))}`;
  if (tab === 'result') return `${base}?tab=result`;
  const zone = idOf(zoneId);
  return zone ? `${base}?zone=${encodeURIComponent(zone)}` : base;
}

/* ══ ชื่อพื้นที่ — ชั้นขึ้นครั้งเดียว ═══════════════════════════════════════════════ */

const NBSP = '\u00a0';
/* ชื่อที่ลงท้ายด้วยชั้น — "ห้อง Treatment ชั้น 5" · "Reception · ชั้น 01" */
const SURVEY_TRAILING_FLOOR = /^(.*?)[\s·]*ชั้น\s*([0-9A-Za-z]+)$/u;

const sameFloor = (a, b) => {
  const x = String(a ?? '').trim().toUpperCase();
  const y = String(b ?? '').trim().toUpperCase();
  if (!x || !y) return false;
  if (/^\d+$/.test(x) && /^\d+$/.test(y)) return Number(x) === Number(y);
  return x === y;
};

/**
 * "ห้อง Treatment · ชั้น 05" — 🐞 จอเดิมเขียน "ห้อง Treatment ชั้น 5 ชั้น 05" (ชื่อที่ SA พิมพ์มีชั้นอยู่แล้ว
 * + ชั้นของแถว) ⇒ ชื่อลงท้ายด้วยชั้นเดียวกัน = ตัดท้ายชื่อแล้วต่อชั้นของแถว · ชั้นอยู่กลางชื่อ = ไม่ต่อซ้ำ
 * ⚠️ ชั้นเทียบแบบตัวเลข ("5" = "05") · ชั้นคนละค่ากัน = ต่อทั้งคู่ (ข้อมูลขัดกันต้องเห็น ไม่ใช่ซ่อน)
 */
export function surveyZoneTitle(zone = {}) {
  const name = surveyZoneName(zone);
  const floor = String(zone?.floor ?? '').trim();
  if (!floor) return name;
  /* 🐞 UAT 360: "ห้อง Treatment · ชั้น" / "05" — เลขชั้นตกบรรทัดเดี่ยว ⇒ ส่วนที่ระบบต่อท้ายพก NBSP ไปเอง
     (จุดคั่นติดท้ายชื่อ · "ชั้น" ติดเลข) ตัดบรรทัดได้แค่หลังจุดคั่น · ชื่อนี้ไปอยู่หลายที่ รวมข้อความในกล่องยืนยัน
     ⇒ ใช้ span nowrap ไม่ได้ทุกที่ ข้อความต้องพกกติกาไปเอง · ชั้นที่ SA พิมพ์ไว้ในชื่อเป็นข้อความดิบ ไม่แตะ */
  const floorText = `ชั้น${NBSP}${floor}`;
  const tail = name.match(SURVEY_TRAILING_FLOOR);
  if (tail && sameFloor(tail[2], floor)) {
    const base = tail[1].trim();
    return base ? `${base}${NBSP}· ${floorText}` : floorText;
  }
  const inside = [...name.matchAll(/ชั้น\s*([0-9A-Za-z]+)/gu)].some((m) => sameFloor(m[1], floor));
  return inside ? name : `${name}${NBSP}· ${floorText}`;
}

/**
 * ชื่อพื้นที่ที่ไม่มีชั้นท้ายชื่อ ("ห้อง Treatment ชั้น 5" → "ห้อง Treatment") — ไว้จับคำที่หัวหน้าพิมพ์ในข้อส่งกลับ
 * 🐞 UAT: ชื่อจริงทุกแถวพกชั้นมาด้วย ("ห้อง Treatment ชั้น 5") แต่หัวหน้าพิมพ์ตามที่ตาเห็น ("ห้อง Treatment …")
 *   ⇒ จับแค่ชื่อเต็มแล้วไม่เคยเจอ ปุ่ม "ไปถ่าย ›" หายทั้งที่ข้อนั้นระบุห้องชัด
 * @returns ชื่อที่ตัดชั้นท้ายออก หรือ `null` เมื่อชื่อไม่ได้ลงท้ายด้วยชั้น (ไม่มีอะไรต่างจากชื่อเต็ม)
 */
export function surveyZoneBaseName(zone = {}) {
  const tail = surveyZoneName(zone).match(SURVEY_TRAILING_FLOOR);
  const base = tail ? tail[1].trim() : '';
  return base || null;
}

/**
 * ชื่อพื้นที่ในประโยค ("ยังขาด …" · "ถัดไป: …" · "มีค่าที่ยังไม่บันทึก: …") — ชื่อไม่มีชั้นท้าย ตามบอร์ด A
 * 🐞 UAT: แถบเขียน "ห้อง MD ชั้น 5" (ชื่อดิบ) ขณะที่หัวบนจอเดียวกันเขียน "ห้อง MD · ชั้น 05" = สองตัวสะกด
 *   ⇒ ประโยคใช้ชื่อฐาน (ส่วนหน้าของหัวที่ตาเห็นพอดี) · ชื่อฐานซ้ำกันในใบ (Reception ชั้น 1 / ชั้น 2) = ใช้หัวเต็ม
 *   ไม่งั้น "ถัดไป: Reception" บอกไม่ได้ว่าชั้นไหน
 */
function sentenceNames(rows) {
  const bases = rows.map((z) => surveyZoneBaseName(z) || surveyZoneName(z));
  const count = new Map();
  for (const b of bases) count.set(b, (count.get(b) || 0) + 1);
  return new Map(rows.map((z, i) => [String(z.id), count.get(bases[i]) > 1 ? surveyZoneTitle(z) : bases[i]]));
}

/* ผลรวมของใบ (พื้นที่ที่ยังอยู่ในใบ) — ตัวเดียวของกล่องส่งงานกับบรรทัดท้ายแถบแท็บ ⇒ สองที่บนจอเดียวบอกเลขเดียวกันเสมอ
   ⚠️ ภาพกว้างนับจากไฟล์ชุดสด · ตร.ม./ลบ.ม./จุด มาจาก `surveyTotals` ตัวเดียวกับที่ server รวมตอนส่งผล */
function sheetTotals(rows, files) {
  const active = list(rows).filter((z) => z?.id && !isCutRow(z));
  const sums = surveyTotals(active);
  return {
    zones: active.length,
    areaSqm: sums.areaSqm,
    volumeCbm: sums.volumeCbm,
    wide: active.reduce((n, z) => n + surveyDocCounts(list(files[z.id])).wide, 0),
    spots: sums.spotsTotal,
  };
}

/* ══ ป้ายนัดบนหัวใบ ═══════════════════════════════════════════════════════════ */

const VISIT_BADGE_TONES = {
  scheduled: 'info', in_progress: 'info', done: 'success', partial: 'warning', unable: 'warning',
};

/**
 * ป้ายนัดข้างรหัสใบ — สถานะนัดคำเดียวกับหน้าคำร้อง (นัดไว้ · กำลังทำ · เข้าแล้ว · ทำไม่ได้)
 * ⭐ **ใบที่ส่งผลแล้วแต่นัดยังไม่ปิด** ขึ้น "นัดยังไม่ปิด" มาก่อน — ใบที่ส่งผลก่อนมติ 24/09 ข้อ 2 (ส่งผลปิดนัดให้)
 *   ยังค้างนัดเปิดอยู่ ⇒ ถอดป้ายเมื่อไร นัดพวกนั้นค้างในคิวโดยไม่มีใครเห็น (กติกาเดิมของหน้า)
 *   🐞 ป้ายนี้ต้องถาม `sent` — เดิมไม่ถาม ⇒ นัดที่เพิ่งตั้งบนใบที่ยังไม่มีใครแตะขึ้นสีเตือนทันทีที่เปิดจอ
 * @returns `{ label, tone }` หรือ `null` (ไม่มีนัด)
 */
export function surveyVisitBadge(visit, { sent = false } = {}) {
  if (!visit?.status) return null;
  const dead = visit.status === 'cancelled' || visit.status === 'rescheduled';
  if (sent && !isClosedVisit(visit) && !dead) return { label: 'นัดยังไม่ปิด', tone: 'warning' };
  const label = VISIT_STATUS_LABELS[visit.status];
  return label ? { label, tone: VISIT_BADGE_TONES[visit.status] || 'neutral' } : null;
}

/* ══ ข้อที่หัวหน้าส่งกลับ ↔ พื้นที่ ═══════════════════════════════════════════════
 *
 * ⭐ ข้อความของหัวหน้าเป็นประโยคอิสระ ("ห้อง Treatment ภาพกว้างเห็นแค่ส่วน A — ขอภาพส่วน B อีกรูป")
 *   ⇒ จอผูกข้อกับพื้นที่ **เฉพาะเมื่อชื่อที่ตาเห็นอยู่ในประโยคตรง ๆ** — ไว้วางปุ่ม "ไปถ่าย ›" และป้าย
 *   "ส่งกลับให้แก้" บนแถวรายการ · ไม่แน่ใจ = ไม่ผูก (ปุ่มที่พาไปผิดห้องแย่กว่าไม่มีปุ่ม)
 * 🔑 ลำดับการหา: ① ชื่อพื้นที่ ② ชื่อจุดที่ช่างแจ้ง (ม็อก A-5: "จุดมุมเตียงที่ 1 ขอรูปใกล้อีกรูป" → ห้อง Treatment)
 *   · ชื่อยาวสุดชนะ ("ห้อง MD" ชนะ "MD") · ยาวเท่ากันคนละพื้นที่ = ไม่ผูก
 */
/* ตัวสะกดกลางของข้อความและชื่อ — ต่างกันแค่ที่ตาไม่เห็นต้องเป็นคำเดียวกัน
   🐞 review 26/09: จอเขียน "Reception · ชั้น 05" (NBSP + จุดคั่น + ชั้นของแถว) แต่ชื่อจริง "Reception ชั้น 5"
     ⇒ หัวหน้าพิมพ์/ก๊อปตามที่ตาเห็นแล้วไม่เคยผูก ⇒ NBSP/ช่องว่างซ้อน = ช่องว่างเดียว · ตัด "·" · "ชั้น05" = "ชั้น 05" = "ชั้น 5" */
const needle = (text) => String(text ?? '')
  .toLowerCase()
  .replace(/·/gu, ' ')
  .replace(/\s+/gu, ' ')
  .replace(/ชั้น ?([0-9a-z])/gu, 'ชั้น $1')
  .replace(/ชั้น 0+(\d)/gu, 'ชั้น $1')
  .trim();

/* คำที่ลงท้ายด้วยเลข/อักษรอังกฤษต้องจบคำในข้อความด้วย — "ชั้น 1" ไม่ใช่ส่วนหน้าของ "ชั้น 12" (ผูกผิดชั้นแย่กว่าไม่ผูก) */
const WORD_END = /[0-9a-z]/u;
function hasKey(hay, key) {
  if (!WORD_END.test(key.slice(-1))) return hay.includes(key);
  for (let at = hay.indexOf(key); at >= 0; at = hay.indexOf(key, at + 1)) {
    if (!WORD_END.test(hay.charAt(at + key.length))) return true;
  }
  return false;
}

function bestMatch(hay, candidates) {
  const hits = candidates.filter((c) => c.key && hasKey(hay, c.key));
  if (!hits.length) return null;
  const longest = Math.max(...hits.map((c) => c.key.length));
  const top = hits.filter((c) => c.key.length === longest);
  const zoneIds = new Set(top.map((c) => c.zoneId));
  return zoneIds.size === 1 ? top[0].zoneId : null;
}

function matchAsk(text, zones) {
  const hay = needle(text);
  if (!hay) return null;
  const rows = list(zones).filter((z) => z?.id);
  /* สองจังหวะ: **ชื่อก่อน ชั้นทีหลัง**
     ① ชื่อ (ชื่อเต็ม + ชื่อไม่มีชั้นท้าย) — "ยาวสุดชนะ" ⇒ "ห้อง MD" ชนะ "MD" · "VIP Reception" ชนะ "Reception"
     ② ชื่อที่ชนะมีหลายพื้นที่ (Reception ชั้น 1 กับชั้น 2 · Lift Lobby 01/02) = ใช้ชั้นของแถวตัดสิน ("ชื่อ ชั้น N" ต้องอยู่ในข้อความ)
        · ตัดสินไม่ได้ = ไม่ผูก (ข้อความต้องบอกชั้นเองถึงจะผูก · ผูกผิดแย่กว่าไม่ผูก)
     🐞 review 26/09: เดิมไม่มีคีย์ของชั้นแถว ⇒ "Lift Lobby" ชั้น 01/02 ผูกไม่ได้ด้วยคำพิมพ์แบบไหนเลย · รอบสอง: ใส่ชั้นเป็นคีย์ที่แข่ง
        ความยาวกับชื่อ ⇒ "MD ชั้น 2" ยาวกว่า "ห้อง MD" แล้วข้อ "ห้อง MD ชั้น 2 …" ไปผูกห้อง "MD" ⇒ ชั้นใช้แค่ตัดสินชื่อที่เท่ากัน */
  const named = rows.filter((z) => String(z.zoneName || '').trim());
  const nameHits = named.flatMap((z) => [z.zoneName, surveyZoneBaseName(z)]
    .filter(Boolean)
    .map((name) => ({ zone: z, key: needle(name) }))
    .filter((c) => c.key && hasKey(hay, c.key)));
  const spotIn = (zonesToSearch) => {
    const bySpot = bestMatch(hay, zonesToSearch.flatMap((z) => list(z.spots)
      .map((s) => ({ zoneId: String(z.id), key: needle(s?.label) }))
      .filter((c) => c.key.length >= 2)));
    return bySpot ? { zoneId: bySpot, via: 'spot' } : null;
  };
  if (nameHits.length) {
    const longest = Math.max(...nameHits.map((c) => c.key.length));
    const top = [...new Map(nameHits.filter((c) => c.key.length === longest).map((c) => [String(c.zone.id), c])).values()];
    if (top.length === 1) return { zoneId: String(top[0].zone.id), via: 'zone' };
    const byFloor = top.filter(({ zone, key }) => {
      const floor = String(zone.floor ?? '').trim();
      return floor && hasKey(hay, needle(`${key} ชั้น ${floor}`));
    });
    if (byFloor.length === 1) return { zoneId: String(byFloor[0].zone.id), via: 'zone' };
    /* ชั้นตัดสินไม่ได้ = ลองชื่อจุด **เฉพาะในพื้นที่ที่ชื่อเสมอกัน** ("Reception เคาน์เตอร์ B" — จุดบอกเองว่าชั้นไหน)
       (🐞 รอบสาม: คืน null ทันทีแล้วข้อที่ระบุจุดชัด ๆ หลุดปุ่มพาไป) · จุดของพื้นที่อื่นชนะไม่ได้ */
    return spotIn(named.filter((z) => top.some((t) => String(t.zone.id) === String(z.id))));
  }
  return spotIn(rows);
}

/** พื้นที่ที่ข้อส่งกลับ (รอบที่ค้าง) ชี้ถึง — ป้าย "ส่งกลับให้แก้" บนแถวรายการ */
export function surveySendBackZoneIds(sendBack, zones = []) {
  if (!sendBack?.pending || !sendBack.sentBack) return new Set();
  const ids = surveySendBackAsks(sendBack.sentBack)
    .map((text) => matchAsk(text, zones)?.zoneId)
    .filter(Boolean);
  return new Set(ids);
}

const PHOTO_KINDS = [[SURVEY_DOC_WIDE, 'ภาพกว้าง'], [SURVEY_DOC_SPOT, 'ภาพจุด']];

/* ปุ่มพาไปของข้อ — ข้อที่พูดถึงรูป ("ขอภาพส่วน B" · "ขอรูปใกล้") = "ไปถ่าย" (ม็อก A-5) · นอกนั้น ("ความยาวผิด") = "ไปแก้"
   ⚠️ "ไปถ่าย" บนข้อที่ขอให้วัดใหม่คือปุ่มที่บอกงานผิด — ช่างเปิดกล้องทั้งที่ต้องหยิบตลับเมตร */
const PHOTO_ASK = /รูป|ภาพ|ถ่าย/u;

/* หลักฐานว่าแก้แล้ว — รูปของพื้นที่นั้นที่ขึ้น **หลัง** หัวหน้าส่งกลับ ("เพิ่ม IMG_2118.jpg · ภาพกว้างรวม 3 รูป")
   ⚠️ ข้อที่ผูกผ่านชื่อจุด นับเฉพาะภาพจุด — รูปกว้างที่เพิ่มให้อีกข้อไม่ใช่หลักฐานของข้อนี้
   ⚠️ ไม่มีเวลาส่งกลับ (แถวเก่า/อ่านพลาด) = ไม่มีหลักฐาน (ไม่เดาว่ารูปไหนใหม่) */
function askEvidence(files, at, via) {
  const since = Date.parse(at);
  if (!Number.isFinite(since)) return null;
  const docTypes = via === 'spot' ? [SURVEY_DOC_SPOT] : [SURVEY_DOC_WIDE, SURVEY_DOC_SPOT];
  const added = files.filter((f) => docTypes.includes(f?.docType) && Date.parse(f?.createdAt) > since);
  if (!added.length) return null;
  const names = added.map((f) => String(f?.fileName || '').trim() || 'รูป');
  const nameText = names.length <= 2 ? names.join(' · ') : `${names.slice(0, 2).join(' · ')} และอีก ${names.length - 2} รูป`;
  const totals = PHOTO_KINDS
    .filter(([docType]) => added.some((f) => f.docType === docType))
    .map(([docType, label]) => `${label}รวม ${files.filter((f) => f?.docType === docType).length} รูป`);
  return { count: added.length, text: [`เพิ่ม ${nameText}`, ...totals].join(' · ') };
}

/**
 * 🔑 **การ์ด "หัวหน้าส่งกลับให้แก้" ของช่าง** (ม็อก A-5) — ข้อละแถว ติ๊กได้ · ข้อที่ชี้พื้นที่มี "ไปถ่าย ›" / "ไปแก้ ›"
 *
 * ⚠️ **ติ๊กอยู่บนจออย่างเดียว** (มติของแผนลงมือ C8) — ส่งไปกับ "แจ้งหัวหน้าว่าแก้แล้ว" เป็น `doneItems`
 *   · server ไม่ตรวจว่าแก้จริงไหม (ด่านของจริงคือของขาด) ⇒ ติ๊กคือคำบอกเล่าของช่างให้หัวหน้าอ่าน
 * ⚠️ เลขข้อนับจาก `surveySendBackAsks` ตัวเดียวกับการ์ดของหัวหน้า — นับคนละแบบ = ติ๊กข้อหนึ่งไปขึ้นอีกข้อ
 * ⭐ **`mode` = การ์ดทำอะไรได้** (§10.5 S8) — กติกาเดียวกับปุ่มบนแถบ (`surveyFieldBarView`):
 *   `'report'` นัดปิดแล้ว (ไม่ใช่ "ทำไม่ได้") → ติ๊ก + "แก้อะไรไป" ไปกับ "แจ้งหัวหน้าว่าแก้แล้ว" ที่แถบ ·
 *   `'submit'` นัดยังเปิด → รายการข้อ ไม่มีช่องติ๊ก — route ปิดนัดเขียน "แก้แล้ว" ให้เองตอนส่งงานโดยไม่พกข้อที่ติ๊ก
 *   (ช่องติ๊กตอนนั้น = ติ๊กที่หายเงียบ) · `null` ไม่ค้าง / ปิดว่าเข้าไม่ได้ (ใบกลับไปลงคิว) / ไม่มีนัด = ไม่มีการ์ด
 *
 * @param sendBack    `surveySendBackState()` จาก GET
 * @param zones       แถวผลวัดทุกแถว (รวมที่ตัดออก)
 * @param filesByZone ไฟล์ชุดสด
 * @param ticks       เลขข้อที่ช่างติ๊ก (state ของหน้า)
 * @param visit       นัดของใบ — ตัดสิน `mode`
 * @returns `null` (ไม่เคยส่งกลับ) หรือ
 *   `{ pending, mode, hint, title, byName, byInitials, meta, items, doneCount, doneText, doneItems }`
 */
export function surveySendBackItemsView({
  sendBack = null, zones = [], filesByZone = {}, ticks = [], visit = null,
} = {}) {
  const back = sendBack?.sentBack;
  if (!back) return null;
  const rows = list(zones).filter((z) => z?.id);
  const files = filesMap(filesByZone);
  const asks = surveySendBackAsks(back);
  const ticked = new Set(list(ticks).filter((n) => Number.isInteger(n) && n >= 0 && n < asks.length));
  const items = asks.map((text, index) => {
    const hit = matchAsk(text, rows);
    const zone = hit ? rows.find((z) => String(z.id) === hit.zoneId) : null;
    const goLabel = zone ? (PHOTO_ASK.test(text) ? 'ไปถ่าย' : 'ไปแก้') : null;
    return {
      index,
      text,
      zoneId: zone ? String(zone.id) : null,
      zoneName: zone ? surveyZoneName(zone) : null,
      via: zone ? hit.via : null,
      evidence: zone ? askEvidence(list(files[zone.id]), back.at, hit.via) : null,
      done: ticked.has(index),
      goLabel,
      goAria: zone ? `${goLabel}ที่ ${surveyZoneName(zone)}` : null,
    };
  });
  const doneItems = [...ticked].sort((a, b) => a - b);
  const pending = sendBack.pending === true;
  const open = visit?.status === 'scheduled' || visit?.status === 'in_progress';
  const mode = !pending || !visit?.status ? null
    : (isClosedVisit(visit) && visit.status !== 'unable') ? 'report'
      : open ? 'submit' : null;
  return {
    pending,
    mode,
    hint: mode === 'submit' ? 'แก้ให้ครบแล้วกด “ส่งงาน” — เรื่องนี้ปิดไปพร้อมการส่งงาน' : null,
    title: 'หัวหน้าส่งกลับให้แก้',
    byName: back.byName || null,
    byInitials: surveyInitials(back.byName),
    meta: [back.byName || SURVEY_UNKNOWN_TEXT, back.at ? stampText(back.at) : SURVEY_UNKNOWN_TEXT].join(' · '),
    items,
    doneCount: doneItems.length,
    doneText: surveySendBackDoneCountText(doneItems.length, items.length),
    doneItems,
  };
}

/* ══ รายการพื้นที่ (หน้าแรกของแบบ A · บานซ้ายของสองบาน) ══════════════════════════════ */

/**
 * 🔑 **แถวละพื้นที่ + ความคืบหน้า** — ทุกตัวเลขจาก `surveyZoneFacts` ตัวเดียวกับการ์ดควบคุม
 *
 * ⭐ ติ๊ก/วงของสามข้ออ่านจาก **ของที่บันทึกแล้วและรูปที่ขึ้นแล้ว** เท่านั้น — ค่าที่พิมพ์ค้างไม่นับ
 *   (ไม่มีร่างในเครื่อง ⇒ แถวค้างได้แค่ในสองบาน = แถวที่เลือกอยู่ ขึ้น "กำลังแก้ · ยังไม่บันทึก")
 * ⚠️ พื้นที่ที่ตัดออกไม่นับในตัวหาร ("วัดแล้ว 2 / 3") แต่ยังเป็นแถวในรายการ (เอากลับเข้าใบได้)
 *
 * @param selectedZoneId พื้นที่ที่เปิดอยู่ (สองบาน = แถวที่ `aria-current`)
 * @param dirtyZoneId    พื้นที่ที่มีค่าพิมพ์ค้าง (มีได้ทีละพื้นที่ — หน้าพื้นที่เปิดได้ทีละหน้า)
 * @param sendBack       `surveySendBackState()` — ป้าย "ส่งกลับให้แก้" บนแถวที่ข้อของหัวหน้าชี้ถึง
 * @param canDecide      หัวหน้า — ป้าย "หัวหน้ายังไม่เคาะ" บนแถวที่ช่างครบแล้วแต่ของหัวหน้ายังขาด (AW-2)
 * @param split          สองบาน — ป้ายกำลังแก้ขึ้นเฉพาะโหมดนี้ (หน้าเดียว แถวไม่มีทางค้างขณะเห็นรายการ)
 * @param visit          นัดของใบ — กดเริ่มงานแล้ว (กำลังทำ · ปิดแล้ว) แถวที่ยังขาดเปลี่ยนจาก "ต้องมีอะไร" เป็น "ขาดอะไร"
 *   ⭐ `detail` ของแถว: ก่อนเริ่มงาน = วงเปล่าสามข้อ (A-1 · AT-1: บอกว่าแต่ละพื้นที่ต้องมีอะไร ยังไม่มีใครผิด) ·
 *   เริ่มแล้ว = บรรทัด "ขาด: …" สีอำพัน (AO-2 · AT-3: ของที่ต้องไปเก็บ) · ครบแล้ว = ติ๊กพร้อมค่า · ตัดออก = เหตุผล
 *   ⚠️ ข้อมูลชุดเดียวกัน (สามข้อของช่าง) แค่เล่าคนละจังหวะ — มุมมองแบบคอลัมน์ (AT-1) โชว์วง/ติ๊กเสมอ
 *   ⚠️ ไม่มีนัด (ใบเก่า · หัวหน้าเปิดดู) = ถือว่ายังไม่เริ่ม — ไม่มีใครต้องไปเก็บของตามคำว่า "ขาด"
 */
export function surveyZoneListView({
  zones = [], filesByZone = {}, selectedZoneId = null, dirtyZoneId = null,
  sendBack = null, canDecide = false, split = false, visit = null,
} = {}) {
  const started = visit?.status === 'in_progress' || isClosedVisit(visit);
  const rows = list(zones).filter((z) => z?.id);
  const files = filesMap(filesByZone);
  const asked = surveySendBackZoneIds(sendBack, rows);
  const selected = idOf(selectedZoneId);
  const dirty = idOf(dirtyZoneId);
  const names = sentenceNames(rows);

  const out = rows.map((zone, i) => {
    const id = String(zone.id);
    const facts = surveyZoneFacts(zone, list(files[zone.id]));
    const missing = crewMissingKeys(facts);
    const state = facts.cut ? 'cut' : (missing.size ? 'todo' : 'done');
    const areaText = facts.sizeComplete ? `${fmtNumber(facts.areaSqm)} ตร.ม.` : null;
    return {
      id,
      index: i + 1,
      code: zone.zoneCode ?? null,
      codeUnknown: zone.zoneCodeUnknown === true,
      /* ชื่อในประโยค ("ยังขาด …") — ตัวสะกดเดียวกับหัวแถว (ดู `sentenceNames`) */
      name: names.get(id),
      title: surveyZoneTitle(zone),
      state,
      selected: selected === id,
      areaText,
      sizeText: facts.sizeComplete ? figuresText(facts.areaSqm, facts.volumeCbm) : null,
      /* วงเปล่ากับติ๊ก — ค่าข้างติ๊กคือของที่นับได้ (ภาพกว้าง 2 · จุด 3) ขนาดใช้ ตร.ม. */
      marks: facts.cut ? [] : CREW_MARKS.map((m) => ({
        key: m.key,
        label: m.label,
        ok: !missing.has(m.key),
        value: m.key === 'size' ? areaText
          : m.key === 'wide' ? (facts.photos.wide || null)
            : (facts.spotsTotal || null),
      })),
      missingText: crewMissingText(facts),
      detail: facts.cut ? 'cut' : (state === 'todo' && started ? 'missing' : 'marks'),
      cutReason: facts.cut ? facts.cutReason : null,
      tags: {
        added: isAddedZone(zone),
        cut: facts.cut,
        sentBack: !facts.cut && asked.has(id),
        /* ของหัวหน้าค้างบนแถวที่ช่างครบแล้วเท่านั้น — แถวที่ช่างยังขาด บรรทัด "ขาด: …" พูดอยู่แล้ว สองป้ายซ้อนคือเสียงรบกวน */
        headPending: canDecide === true && state === 'done' && facts.missingHead.length > 0,
        editing: split === true && selected === id && dirty === id,
      },
    };
  });

  const progress = surveyFieldProgress(rows, files);
  return {
    rows: out,
    progress,
    progressText: `วัดแล้ว ${progress.done} / ${progress.total} พื้นที่`,
    leftNames: out.filter((r) => r.state === 'todo').map((r) => r.name),
  };
}

/**
 * พื้นที่ที่บานขวาเปิดเองเมื่อไม่มีใครเลือก (สองบาน · หมุนแท็บเล็ต · พื้นที่ที่เปิดอยู่ถูกลบ)
 * คนดูแก้ได้ = พื้นที่แรกที่ของช่างยังขาด (งานถัดไปของเขา) · นอกนั้น/ครบหมด = พื้นที่แรกที่ยังอยู่ในใบ
 * ⚠️ ไม่มีพื้นที่ที่ยังอยู่ในใบเลย = `null` (บานขวาว่าง ไม่ใช่เปิดพื้นที่ที่ถูกตัด)
 */
export function surveyDefaultZoneId(zones = [], filesByZone = {}, { editable = false } = {}) {
  const files = filesMap(filesByZone);
  const active = list(zones).filter((z) => z?.id && !isCutRow(z));
  if (!active.length) return null;
  if (editable) {
    const todo = active.find((z) => surveyZoneFacts(z, list(files[z.id])).missingCrew.length > 0);
    if (todo) return String(todo.id);
  }
  return String(active[0].id);
}

/**
 * ตัวเลื่อนพื้นที่ (‹ จุด ›) บนหัวหน้าพื้นที่ — ไม่วน (อยู่พื้นที่สุดท้าย › กดไม่ได้ · ม็อก A-2)
 * ⚠️ จุดทุกขนาดจอ · เกิน 8 พื้นที่ขึ้น "n / t" แทน (จุดสิบกว่าจุดเล็กจนกดไม่ได้และนับไม่ออก)
 * @returns `{ index, total, prev, next, dots:[{id, state, current}], ariaLabel, compactText }` — `index` นับจาก 1
 */
export function surveyZoneNeighbors(zones = [], zoneId = null, filesByZone = {}) {
  const files = filesMap(filesByZone);
  const rows = list(zones).filter((z) => z?.id);
  const here = idOf(zoneId);
  const dots = rows.map((z) => {
    const facts = surveyZoneFacts(z, list(files[z.id]));
    return {
      id: String(z.id),
      state: facts.cut ? 'cut' : (facts.missingCrew.length ? 'todo' : 'done'),
      current: String(z.id) === here,
    };
  });
  const i = dots.findIndex((d) => d.current);
  const total = rows.length;
  if (i < 0) return { index: 0, total, prev: null, next: null, dots, ariaLabel: '', compactText: null };
  const done = dots.filter((d) => d.state === 'done').length;
  return {
    index: i + 1,
    total,
    prev: i > 0 ? dots[i - 1].id : null,
    next: i < total - 1 ? dots[i + 1].id : null,
    dots,
    ariaLabel: `พื้นที่ที่ ${i + 1} จาก ${total} · วัดแล้ว ${done}`,
    compactText: total > 8 ? `${i + 1} / ${total}` : null,
  };
}

/**
 * 🔑 **"ถัดไป" ของท้ายหน้าพื้นที่** — ไปไหนต่อจากพื้นที่นี้
 *
 * ① พื้นที่อื่นที่ **ของช่างยังขาด** — ตัวแรกที่อยู่ **หลัง** ที่นี่ ไม่มีค่อยวนกลับต้นลิสต์ (`back: true` = "กลับไปที่ …")
 *    🐞 เดิมหาตัวแรกของลิสต์เสมอ ⇒ ใบ 5 พื้นที่ที่ขาดที่ 1 กับ 5: ยืนที่ 5 กด "ถัดไป" เด้งขึ้นหัวใบ · เหลือสอง
 *       พื้นที่เมื่อไรสลับ 1↔5 ไม่จบ (page.js เดิม `nextGapZone`)
 * ② ไม่เหลือของขาดที่อื่น และคนดูส่งงานได้ = "ถัดไป: ส่งงาน" (ม็อก A-3)
 * ③ นอกนั้น (หัวหน้าที่ไล่ดูใบที่ช่างครบแล้ว · AW-2) = พื้นที่ถัดไปตามลำดับ ไม่วน
 * ⚠️ ค่าค้าง = บอกเหตุ "บันทึกก่อน" แต่ **ยังบอกปลายทาง** (ม็อก: "ถัดไป: ส่งงาน / บันทึกก่อน")
 *
 * @param canSubmit คนดูมีปุ่มส่งงานบนแถบไหม (ช่าง/Senior ที่อยู่บนนัด · นัดยังเปิด)
 * @returns `{ target: {kind:'zone', id, name, back} | {kind:'submit'} | null, blocker, label }`
 */
export function surveyNextStep({ zones = [], filesByZone = {}, zoneId = null, dirty = false, canSubmit = false } = {}) {
  const files = filesMap(filesByZone);
  const rows = list(zones).filter((z) => z?.id);
  const here = rows.findIndex((z) => String(z.id) === idOf(zoneId));
  const withIndex = rows.map((z, i) => ({ z, i }));
  const names = sentenceNames(rows);
  const gaps = withIndex.filter(({ z, i }) => i !== here && !isCutRow(z)
    && surveyZoneFacts(z, list(files[z.id])).missingCrew.length > 0);

  let target = null;
  if (gaps.length) {
    const ahead = gaps.find(({ i }) => i > here);
    const { z } = ahead || gaps[0];
    target = { kind: 'zone', id: String(z.id), name: names.get(String(z.id)), back: !ahead };
  } else if (canSubmit) {
    target = { kind: 'submit' };
  } else {
    const after = withIndex.find(({ z, i }) => i > here && !isCutRow(z));
    if (after) target = { kind: 'zone', id: String(after.z.id), name: names.get(String(after.z.id)), back: false };
  }
  const label = !target ? null
    : target.kind === 'submit' ? 'ถัดไป: ส่งงาน'
      : target.back ? `กลับไปที่ ${target.name}` : `ถัดไป: ${target.name}`;
  return { target, blocker: dirty ? 'บันทึกก่อน' : null, label };
}

/* ══ หน้าพื้นที่ ═════════════════════════════════════════════════════════════ */

const DIMS = ['widthM', 'lengthM', 'heightM'];
const DIM_WORDS = { widthM: 'ความกว้าง', lengthM: 'ความยาว', heightM: 'ความสูง' };

/**
 * 🔑 **แถว "ส่วน A · ส่วน B" ของหัวข้อขนาด** — ผลรายส่วนเดินตามที่พิมพ์สด ๆ (มันคือการวัดที่กำลังทำ)
 *
 * ⭐ ส่วนที่ขาดช่องบอกว่า **รออะไร** ("รอความสูง" · ม็อก A-2) ไม่ใช่ "ไม่ครบ" เฉย ๆ · ค่าที่ใช้ไม่ได้ (0 · ตัวอักษร ·
 *   เกิน 500 ม.) ใช้คำของตัวจัดแถวตัวเดียวกับ server (`surveyZoneSavePayload`) ⇒ จอกับด่านบันทึกพูดตรงกัน
 * ⚠️ แถวว่างทั้งแถว = `empty` ไม่นับทั้งในผลรวมและในคำว่า "ยังไม่ครบ" (กติกาเดียวกับ server: แถวว่าง ≠ แถวเสีย)
 * ⚠️ ถังขยะมีเฉพาะเมื่อมีมากกว่าหนึ่งส่วน — ลบส่วนสุดท้ายทิ้ง = ไม่มีช่องให้กรอก
 *
 * @param parts ร่างบนจอ (สตริงจากช่องกรอก)
 * @returns `{ rows:[{id, index, letter, name, label, state:'complete'|'waiting'|'empty', resultText, field, removable}],
 *            total:{label, text, sub, hint, complete} }`
 */
export function surveyPartsView(parts = []) {
  const rows = list(parts);
  const plan = surveyZoneSavePayload({ parts: rows });
  let area = 0;
  let volume = 0;
  const view = rows.map((raw, index) => {
    const letter = surveyPartLetter(index);
    const name = `ส่วน ${letter}`;
    const base = {
      id: raw?.id ?? null, index, letter, name,
      label: String(raw?.label ?? '').trim() || null,
      removable: rows.length > 1,
    };
    if (isBlankSurveyPart(raw)) return { ...base, state: 'empty', resultText: null, field: null };
    const missing = DIMS.filter((field) => parseSurveyMeters(raw?.[field]) === null);
    const broken = plan.issues.find((i) => i.section === 'size' && i.index === index && !missing.includes(i.field));
    if (broken) {
      const text = broken.text.startsWith(`${name} `) ? broken.text.slice(name.length + 1) : broken.text;
      return { ...base, state: 'waiting', resultText: text, field: broken.field };
    }
    if (missing.length) {
      return { ...base, state: 'waiting', resultText: `รอ${missing.map((f) => DIM_WORDS[f]).join(' · ')}`, field: missing[0] };
    }
    const [w, l, h] = DIMS.map((field) => parseSurveyMeters(raw[field]));
    area += w * l;
    volume += w * l * h;
    return { ...base, state: 'complete', resultText: figuresText(w * l, w * l * h), field: null };
  });

  const filled = view.filter((r) => r.state !== 'empty');
  const waiting = filled.filter((r) => r.state === 'waiting');
  const anyComplete = filled.some((r) => r.state === 'complete');
  const complete = filled.length > 0 && !waiting.length;
  return {
    rows: view,
    total: {
      label: complete ? `ครบ ${filled.length} ส่วน` : 'รวมตอนนี้',
      text: anyComplete ? figuresText(area, volume) : naText(null),
      sub: waiting.length ? `${waiting.map((r) => r.name).join(' · ')} ยังไม่ครบ` : null,
      /* ข้อเตือนของการแบ่งส่วน — ระบบตรวจการทับกันให้ไม่ได้ (มุมที่สองส่วนชนกันต้องนับครั้งเดียว) */
      hint: filled.length > 1 ? 'แบ่งส่วนไม่ให้ทับกัน' : null,
      complete,
    },
  };
}

const partsSig = (x) => surveyZoneDraftSignature({ parts: x?.parts });
const spotsSig = (x) => surveyZoneDraftSignature({ spots: x?.spots });
const noteSig = (x) => surveyZoneDraftSignature({ note: x?.note });

/**
 * ของที่พิมพ์ค้างในพื้นที่หนึ่ง เป็นคำสั้น — "ขนาด 2 ส่วน · จุด 2 จุด" (ท้ายหน้าพื้นที่ · กล่องถามก่อนทิ้ง)
 * ⚠️ นับเฉพาะหัวข้อที่ **ต่างจากที่บันทึกไว้** — หัวข้อที่ไม่ได้แตะไม่อยู่ในคำ (ไม่งั้น "จะทิ้งอะไร" ตอบเกินจริง)
 * @returns `''` เมื่อไม่มีอะไรต่าง
 */
export function surveyDraftSummary(draft = {}, zone = {}) {
  const bits = [];
  if (partsSig(draft) !== partsSig(zone)) {
    bits.push(`ขนาด ${list(draft?.parts).filter((p) => !isBlankSurveyPart(p)).length} ส่วน`);
  }
  if (spotsSig(draft) !== spotsSig(zone)) {
    bits.push(`จุด ${list(draft?.spots).filter((s) => !isBlankSurveySpot(s)).length} จุด`);
  }
  if (noteSig(draft) !== noteSig(zone)) bits.push('หมายเหตุ');
  return bits.join(' · ');
}

/**
 * คำของกล่อง "ทิ้งค่าที่ยังไม่บันทึก?" — กล่องเดียวทุกทางออก (ย้าย/ย้อน/สลับแท็บ/ออกหน้า)
 * ⭐ บอกด้วยว่า **รูปไม่หาย** — ช่างที่เพิ่งถ่ายรูปไปห้ารูปจะกดยกเลิกเพราะกลัวรูปหาย ทั้งที่รูปขึ้นระบบไปแล้ว
 * ⚠️ ปุ่มยกเลิก ("กลับไปบันทึก") ต้องเป็นโฟกัสตั้งต้น — ทางที่ไม่เสียอะไรต้องกดง่ายที่สุด
 */
export function surveyDiscardConfirm({ zone = {}, summary = '' } = {}) {
  const what = String(summary || '').trim();
  return {
    title: 'ทิ้งค่าที่ยังไม่บันทึก?',
    message: `${surveyZoneTitle(zone)}: ${what ? `${what} ยังไม่ได้บันทึก` : 'มีค่าที่ยังไม่ได้บันทึก'}`
      + ' — รูปที่ถ่ายไว้ขึ้นระบบแล้ว ไม่หาย',
    cancelLabel: 'กลับไปบันทึก',
    confirmLabel: 'ทิ้งแล้วไปต่อ',
  };
}

/**
 * 🔑 **ถามอะไรก่อนออกจากหน้า** (ลิงก์ · รีเฟรช · ปิดแท็บ — `useUnsavedChanges`) — ข้อความเดียวที่ตรงกับของที่จะหาย
 *
 * ⭐ ลำดับ = ของที่เสียแล้วเอาคืนยากที่สุดก่อน: **รูปที่ยังส่งไม่เสร็จ** (ถ่ายใหม่ต้องเดินกลับไปที่ห้อง) →
 *   ค่าที่พิมพ์ค้างในพื้นที่ (คำเดียวกับกล่อง "ทิ้งค่าที่ยังไม่บันทึก?" ของการย้ายในหน้า) → การเคาะของหัวหน้า →
 *   ข้อความถึงหัวหน้าที่ยังไม่ได้ส่ง
 * ⚠️ รูปที่ขึ้นแล้วไม่ใช่ของค้าง — ขึ้นระบบทันทีที่อัปจบ (คำในกล่องย้ายพื้นที่บอกไว้ว่า "ไม่หาย")
 * @returns `null` = ไม่มีอะไรค้าง (ไม่ต้องถาม) หรือประโยคของกล่องถาม
 */
export function surveyLeaveMessage(input = {}) {
  return surveyLeaveConfirm(input)?.description ?? null;
}

/**
 * 🔑 **กล่องถามก่อนออกจากหน้า ทั้งกล่อง** (หัว · ประโยค · สองปุ่ม · โทน) — ให้การออกทางลิงก์ถามด้วยกล่องหน้าตาเดียวกับ
 *   การย้ายพื้นที่/สลับแท็บ/ปุ่มย้อน ("กล่องเดียวทุกทางออก" แผนลงมือ §3.4)
 * 🐞 UAT 25/09 จอ 1024: กดลิงก์ตอนมีค่าค้าง ได้กล่องกลาง "ยืนยันการดำเนินการ" + ปุ่มน้ำเงิน "ยืนยัน" ทั้งที่ประโยคเป็นคำบอก
 *   ไม่ใช่คำถาม — "ยืนยัน" ไม่บอกว่าบันทึกหรือทิ้ง (มันทิ้ง) · ปุ่มทิ้งเป็นโทนอันตรายเสมอ
 * ⚠️ ลำดับเดียวกับ `surveyLeaveMessage` (รูปค้าง → ค่าในพื้นที่ → การเคาะ → ข้อความถึงหัวหน้า)
 * 🐞 review 26/09: เดิมคืนข้อแรกข้อเดียว — รูปกำลังส่ง + ค่าค้างในพื้นที่ กล่องพูดแค่รูป ช่างยอมเสียรูปแล้วกดทิ้ง
 *   ค่าที่พิมพ์ไว้หายตามโดยไม่มีใครบอก (ทั้งสองทางออกทิ้งของค้างทุกชนิด) ⇒ หัว/ปุ่มยกเลิกมาจากข้อที่หนักสุด
 *   **ประโยคบอกของค้างครบทุกข้อ** ("… · ค่าที่พิมพ์ค้างใน… จะหายด้วย")
 * @returns `null` = ไม่มีอะไรค้าง หรือ `{ title, description, cancelLabel, confirmLabel, tone }` ส่งให้ `confirmAction` ตรง ๆ
 */
export function surveyLeaveConfirm({
  uploads = 0, zoneDirty = false, zone = null, summary = '', decisions = 0, fixedNote = '',
} = {}) {
  /* `text` = ประโยคเมื่อเป็นข้อหลัก · `also` = ประโยคต่อท้ายเมื่อมีข้อที่หนักกว่านำอยู่ (รูปค้างนำเสมอ — ไม่มี `also`) */
  const pending = [];
  if (Number(uploads) > 0) {
    pending.push({ title: 'ออกตอนรูปยังส่งไม่เสร็จ?', text: 'รูปยังส่งไม่เสร็จ — ออกตอนนี้รูปที่ค้างจะไม่ขึ้นระบบ', cancel: 'รอให้ส่งเสร็จ' });
  }
  if (zoneDirty) {
    const text = surveyDiscardConfirm({ zone: zone || {}, summary });
    /* ชื่อพื้นที่ในเครื่องหมายคำพูด — ชื่อเต็มมี " · " ของชั้นอยู่ข้างใน ซึ่งเป็นตัวคั่นข้อของประโยคนี้ด้วย (review 26/09) */
    const where = String(zone?.zoneName || '').trim() ? `“${surveyZoneTitle(zone)}”` : 'พื้นที่ที่เปิดอยู่';
    const what = String(summary || '').trim();
    pending.push({
      title: text.title, text: text.message, cancel: text.cancelLabel,
      also: `ค่าที่พิมพ์ค้างใน${where}${what ? ` (${what})` : ''}${/[”)]$/u.test(what ? ')' : where) ? ' ' : ''}จะหายด้วย`,
    });
  }
  if (Number(decisions) > 0) {
    pending.push({
      title: 'ทิ้งการเคาะที่ยังไม่บันทึก?', text: 'การเคาะจุด/แพ็คเกจยังไม่บันทึก — ออกจากหน้านี้แล้วที่เคาะไว้หาย',
      cancel: 'กลับไปบันทึก', also: 'การเคาะจุด/แพ็คเกจที่ยังไม่บันทึกจะหายด้วย',
    });
  }
  if (String(fixedNote ?? '').trim()) {
    pending.push({
      title: 'ทิ้งข้อความถึงหัวหน้า?', text: 'ข้อความถึงหัวหน้ายังไม่ได้ส่ง — ออกจากหน้านี้แล้วข้อความหาย',
      cancel: 'กลับไปส่ง', also: 'ข้อความถึงหัวหน้าที่ยังไม่ได้ส่งจะหายด้วย',
    });
  }
  if (!pending.length) return null;
  const [lead, ...rest] = pending;
  return {
    title: lead.title,
    description: [lead.text, ...rest.map((p) => p.also)].join(' · '),
    cancelLabel: lead.cancel,
    confirmLabel: 'ทิ้งแล้วไปต่อ',
    tone: 'danger',
  };
}

/* ══ ช่องวัดขนาด ก × ย × ส ════════════════════════════════════════════════════
   ⭐ ตัวอักษรในช่อง (ก / ย / ส) แทนป้ายเหนือช่อง — แถวเดียวสามช่องพอดีนิ้วบนจอ 360 (ม็อก A-2 · AO-1) ·
   คำเต็มอยู่ในชื่อของช่องสำหรับโปรแกรมอ่านจอ ("ความกว้าง ส่วน A") */
export const SURVEY_DIM_FIELDS = Object.freeze([
  Object.freeze({ field: 'widthM', letter: 'ก', word: 'ความกว้าง' }),
  Object.freeze({ field: 'lengthM', letter: 'ย', word: 'ความยาว' }),
  Object.freeze({ field: 'heightM', letter: 'ส', word: 'ความสูง' }),
]);

/**
 * ช่องถัดไปเมื่อกด Enter (ปุ่ม "ถัดไป" ของแป้นตัวเลข) — ก → ย → ส → ก ของส่วนถัดไป · ส ของส่วนสุดท้าย = `null`
 * ⚠️ ไม่วนกลับส่วนแรก — Enter ที่ช่องสุดท้ายคือ "จบแถว" ไม่ใช่ "เริ่มใหม่" (ส่วนแรกถูกพิมพ์ทับโดยไม่รู้ตัว)
 */
export function surveyNextDimField(parts = [], partId = null, field = null) {
  const rows = list(parts);
  const i = rows.findIndex((p) => idOf(p?.id) !== null && idOf(p?.id) === idOf(partId));
  const k = SURVEY_DIM_FIELDS.findIndex((d) => d.field === field);
  if (i < 0 || k < 0) return null;
  if (k < SURVEY_DIM_FIELDS.length - 1) return { partId: String(rows[i].id), field: SURVEY_DIM_FIELDS[k + 1].field };
  const next = rows[i + 1];
  return next?.id ? { partId: String(next.id), field: SURVEY_DIM_FIELDS[0].field } : null;
}

/**
 * ป้ายสถานะบนหัวหน้าพื้นที่ — **ป้ายเดียว** ตามความเร่ง (ม็อก A-2 "ยังไม่บันทึก" · AW-2 "วัดแล้ว")
 * ลำดับ: บันทึกไม่ผ่าน → ถูกแก้จากที่อื่น → ตัดออก → ยังไม่บันทึก → วัดแล้ว / ยังไม่ครบ
 * ⭐ "ยังไม่บันทึก" ชนะ "ยังไม่ครบ" — คนที่ยืนอยู่บนหน้านี้กำลังกรอกอยู่ ของที่เขาต้องรู้คือ "ออกตอนนี้หาย"
 *   (ของขาดรายข้ออยู่บนหัวข้อแต่ละอันแล้ว) · ป้าย "เพิ่มหน้างาน" เป็นอีกแกน (ที่มาของพื้นที่) ขึ้นคู่ได้
 * @returns `{ key, tone, text, added }`
 */
export function surveyZoneStateBadge({ zone = {}, files = [], dirty = false, error = '', conflict = false } = {}) {
  const facts = surveyZoneFacts(zone || {}, list(files));
  const added = isAddedZone(zone);
  const pick = (key, tone, text) => ({ key, tone, text, added });
  if (error) return pick('error', 'danger', 'บันทึกไม่สำเร็จ');
  if (conflict && !facts.cut) return pick('conflict', 'warning', 'ถูกแก้จากที่อื่น');
  if (facts.cut) return pick('cut', 'neutral', 'ตัดออก');
  if (dirty) return pick('dirty', 'warning', 'ยังไม่บันทึก');
  return facts.crewComplete ? pick('done', 'success', 'วัดแล้ว') : pick('todo', 'warning', 'ยังไม่ครบ');
}

/**
 * ทางออกของพื้นที่ (เมนู ⋮ บนหัว · แถวท้ายเนื้อ) — กติกาเดียวกับ server
 * ⚠️ พื้นที่ที่ช่าง **เพิ่มเอง** ลบทิ้งได้ แต่ตัดออกไม่ได้ (ตัดแล้วป้าย "เพิ่มหน้างาน" หาย — server ปฏิเสธไว้) ·
 *   พื้นที่ที่ SA ขอมา ตัดออกได้ (ต้องมีเหตุผล) แต่ลบไม่ได้ · ตัดออกแล้ว = เอากลับเข้าใบได้อย่างเดียว
 * ⚠️ เขียนไม่ได้ = ไม่มีทางออกเลย (ไม่มีสิทธิ์ = ไม่โชว์ · กติกา ui-visibility)
 */
export function surveyZoneActions({ zone = {}, canWrite = false } = {}) {
  if (canWrite !== true || !zone?.id) return { cut: false, remove: false, restore: false };
  const cut = isCutRow(zone);
  const added = isAddedZone(zone);
  return { cut: !cut && !added, remove: added, restore: cut };
}

/**
 * 🔑 **ป้ายต่อหัวข้อของหน้าพื้นที่** — ① ขนาด ② ภาพกว้าง ③ จุด · ภาพจุด · ④ หมายเหตุ
 *
 * ⭐ **สองกฎการบันทึกบนหน้าเดียวต้องเห็นต่างกัน** (pain B3): รูปขึ้นทันที ("ขึ้นแล้ว n รูป") · ตัวเลข/จุด/หมายเหตุ
 *   รอปุ่ม ("ยังไม่บันทึก" สีอำพัน จนกว่าจะกด) · ติ๊กเขียวให้เฉพาะของที่ **ลงฐานแล้ว** จริง
 * ⚠️ ค่าค้างรายหัวข้อเทียบลายเซ็นทีละหัวข้อ แต่ **ถามธงรวมก่อน** (`dirty`) — ธงรวมรู้เรื่องที่ลายเซ็นไม่รู้
 *   (ของที่เพิ่งบันทึกสำเร็จแต่แถวใหม่ยังโหลดไม่ถึง = ไม่ค้าง) ⇒ ธงรวมบอกไม่ค้าง = ไม่มีหัวข้อไหนค้าง
 *
 * @param zone  แถวที่บันทึกแล้ว · @param files ไฟล์ชุดสดของพื้นที่นี้
 * @param draft ร่างบนจอ `{ parts, spots, note }` · @param dirty ธงค่าค้างรวมของหน้าพื้นที่
 * @returns `{ size, wide, spots, spotPhotos, note }` แต่ละตัว `{ mark:'dirty'|'done'|'todo', chip:{tone,text,check}|null }`
 */
export function surveyZoneSections({ zone = {}, files = [], draft = null, dirty = false } = {}) {
  const d = draft || zone || {};
  /* ตัวนับรูปตัวเดียวกับด่าน "ภาพกว้าง" ของ server — ป้ายบนจอต้องนับเท่าด่าน */
  const photos = surveyDocCounts(files);
  const savedParts = list(zone?.parts).filter((p) => !isBlankSurveyPart(p)).length;
  const savedSpots = list(zone?.spots).filter((s) => !isBlankSurveySpot(s)).length;
  const savedNote = String(zone?.note ?? '').trim() !== '';

  const DIRTY = { tone: 'warning', text: 'ยังไม่บันทึก', check: false };
  const SAVED = { tone: 'success', text: 'บันทึกแล้ว', check: true };
  const NONE = { tone: 'neutral', text: 'ยังไม่มี', check: false };
  const typed = (isDirty, saved, { optional = false } = {}) => ({
    mark: isDirty ? 'dirty' : (saved ? 'done' : 'todo'),
    chip: isDirty ? DIRTY : (saved ? SAVED : (optional ? null : NONE)),
  });
  const uploaded = (count) => ({
    mark: count ? 'done' : 'todo',
    chip: count ? { tone: 'success', text: `ขึ้นแล้ว ${count} รูป`, check: true } : NONE,
  });

  return {
    size: typed(dirty && partsSig(d) !== partsSig(zone), savedParts > 0),
    wide: uploaded(photos.wide),
    spots: typed(dirty && spotsSig(d) !== spotsSig(zone), savedSpots > 0),
    spotPhotos: uploaded(photos.spot),
    note: typed(dirty && noteSig(d) !== noteSig(zone), savedNote, { optional: true }),
  };
}

/**
 * 🔑 **ท้ายหน้าพื้นที่** (ติดขอบล่าง · หลบเมื่อแป้นพิมพ์ขึ้น) — บรรทัดสถานะ · "ถัดไป" · "บันทึกพื้นที่นี้"
 *
 * ⭐ บรรทัดสถานะตอบคำถามเดียว: **"ถ้าออกตอนนี้ อะไรจะหาย"** — ค้าง = "กดบันทึกเพื่อเก็บ ขนาด 2 ส่วน · จุด 2 จุด"
 *   พร้อมบอกว่ารูปขึ้นแล้ว (AT-2) · บันทึกแล้ว = ใคร/เมื่อไร (AW-2) · ติดด่าน = ประโยคของด่าน ("ส่วน B ยังขาดความสูง")
 * ⚠️ **ปุ่มบันทึกดับได้พร้อมเหตุที่ตาเห็น** ("ยังไม่ได้แก้อะไร" · ประโยคของด่าน) — เหตุทั้งสองเป็นของที่แก้ได้บนจอ
 *   เดียวกัน (กติกา ui-visibility ยอม) · ต่างจากปุ่มที่ติดด่านข้อมูลนอกจอซึ่งต้องกดได้แล้วบอกเหตุ
 * ⚠️ **ปุ่มกรมท่ามีปุ่มเดียวต่อจอ** — บันทึกได้ = ปุ่มนี้กรมท่า (แถบงานของช่างถอยเป็นปุ่มเงียบเอง · `surveyFieldBarView`)
 *
 * @param saveBlocker `surveyZoneSavePayload(draft).blocker` · @param next ผลของ `surveyNextStep`
 * @param viewerKind  `crew` | `senior` | `head` | `readonly` · @param uploading จำนวนรูปที่กำลังส่ง
 */
export function surveyZoneFooterView({
  zone = {}, files = [], dirty = false, draftSummary = '', saveBlocker = null, busy = false,
  error = '', next = null, viewerKind = 'crew', uploading = 0,
} = {}) {
  const facts = surveyZoneFacts(zone, list(files));
  const readOnly = viewerKind === 'readonly';
  const sending = Number(uploading) > 0 ? ` · กำลังส่ง ${Number(uploading)}` : '';
  const photoLine = `ภาพกว้างขึ้นแล้ว ${facts.photos.wide}${sending} · รูปไม่ต้องรอบันทึก`;
  const saved = !!zone?.surveyedAt
    || list(zone?.parts).some((p) => !isBlankSurveyPart(p))
    || list(zone?.spots).some((s) => !isBlankSurveySpot(s));
  const stamp = [zone?.surveyedByName || null, zone?.surveyedAt ? stampText(zone.surveyedAt) : null]
    .filter(Boolean).join(' · ');

  let tone;
  let head;
  let sub;
  if (facts.cut) {
    tone = 'cut';
    head = `ตัดออกแล้ว${facts.cutReason ? ` — ${facts.cutReason}` : ''}`;
    sub = readOnly ? null : 'เอากลับเข้าใบได้จากเมนู ⋮ ข้างหัวพื้นที่';
  } else if (error) {
    tone = 'error';
    head = 'บันทึกไม่สำเร็จ';
    sub = String(error);
  } else if (busy) {
    tone = 'busy';
    head = 'กำลังบันทึก…';
    sub = photoLine;
  } else if (dirty && saveBlocker) {
    tone = 'dirty';
    head = String(saveBlocker);
    sub = 'แก้ให้ครบแล้วกดบันทึก · ออกจากพื้นที่นี้ก่อนบันทึก ระบบจะถามก่อนทิ้งค่าที่พิมพ์';
  } else if (dirty) {
    tone = 'dirty';
    head = draftSummary ? `กดบันทึกเพื่อเก็บ ${draftSummary}` : 'มีค่าที่ยังไม่บันทึก — กดบันทึกพื้นที่นี้';
    sub = photoLine;
  } else if (saved) {
    tone = 'saved';
    head = `${facts.crewComplete ? 'บันทึกครบแล้ว' : 'บันทึกแล้ว'}${stamp ? ` · ${stamp}` : ''}`;
    sub = readOnly ? 'ดูอย่างเดียว'
      : crewMissingText(facts)
        || (viewerKind === 'head'
          ? 'หัวหน้าแก้ได้จนกว่าจะส่งผลให้ฝ่ายขาย · แก้แล้วต้องกดบันทึก'
          : 'ไม่มีค่าที่ยังไม่บันทึก');
  } else {
    tone = 'plain';
    head = readOnly ? 'ยังไม่มีผลวัด' : 'ยังไม่ได้บันทึกค่าของพื้นที่นี้';
    sub = crewMissingText(facts);
  }

  const canSave = !busy && dirty && !saveBlocker;
  return {
    tone,
    head,
    sub,
    next: next?.target ? { label: next.label, target: next.target, blocker: next.blocker || null } : null,
    save: {
      show: !readOnly && !facts.cut,
      label: 'บันทึกพื้นที่นี้',
      enabled: canSave,
      reason: busy ? 'กำลังบันทึก…' : (!dirty ? 'ยังไม่ได้แก้อะไร' : (saveBlocker ? String(saveBlocker) : null)),
      emphasis: canSave ? 'primary' : 'quiet',
    },
  };
}

/* ══ แถบงานของช่าง (ขอบล่าง) ═════════════════════════════════════════════════════ */

const NOW_KEY = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/;
const parseNowKey = (nowKey) => {
  const m = NOW_KEY.exec(String(nowKey ?? ''));
  return m ? { date: m[1], time: m[2] } : null;
};
/* นาทีจากวัน + เวลาในปฏิทิน — เลขคณิตของปฏิทินล้วน (สองฝั่งเป็นเวลาไทยอยู่แล้ว ไม่มีโซนเวลาเข้ามาเกี่ยว) */
const calendarMinutes = (date, time) => {
  const [y, mo, d] = String(date).split('-').map(Number);
  const [h, mi] = String(time).split(':').map(Number);
  if (![y, mo, d, h, mi].every(Number.isFinite)) return null;
  return Date.UTC(y, mo - 1, d, h, mi) / 60000;
};
const durationText = (minutes) => {
  const n = Math.abs(minutes);
  if (n < 60) return `${n} นาที`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m ? `${h} ชม. ${m} นาที` : `${h} ชม.`;
};
const isoDay = (value) => (value ? String(value).slice(0, 10) : null);

/**
 * ช่วงเวลาที่อยู่หน้างาน — รูปเดียวกับ `onSiteText` ของ surveyJob: วันเดียวกัน "10:12–11:48" ·
 *   ข้ามวัน "พฤ. 24 ก.ย. 14:00 – ศ. 25 ก.ย. 09:00"
 * 🐞 review 26/09: เริ่ม 24/09 14:00 ส่งงาน 25/09 09:00 — กล่องส่งงาน/หัวงานเขียน "14:00–09:00" (ช่วงถอยหลัง)
 *   ทั้งที่นัดเก็บวันเสร็จจริงไว้แล้ว (`actualEndDate` · mig 0386 · visitStamp.js) ⇒ ข้ามวัน = วันที่ทั้งสองปลาย
 * @param day      วันเข้า (`actualDate || scheduledDate`) · @param endDay วันจบ (ไม่มี = วันเดียวกับวันเข้า)
 * @param shownDay วันที่ข้อความรอบ ๆ บอกไว้แล้ว (วันนัดบนหัวงาน · วันนี้บนแถบ) — วันเข้าคนละวัน = เขียนวันเข้าด้วย
 */
function onSiteSpanText({ day = null, start = '', endDay = null, end = '', shownDay = null } = {}) {
  const lastDay = endDay || day;
  if (start && end && day && lastDay !== day) return `${dayText(day)} ${start} – ${dayText(lastDay)} ${end}`;
  const at = (date, time) => (date && shownDay && date !== shownDay ? `${dayText(date)} ${time}` : time);
  if (start && end) return `${at(day, start)}–${end}`;
  return start ? at(day, start) : (end ? at(lastDay, end) : '');
}

/* "นัด 10:00 · อีก 8 นาที" (วันนี้) · "นัด พ. 30 ก.ย. 10:00 · อีก 2 วัน" · เลยแล้ว = "เลยเวลานัด 25 นาที" (late) */
function visitCountdown(visit, nowKey) {
  const date = String(visit?.scheduledDate ?? '').slice(0, 10);
  const time = hhmm(visit?.startTime);
  const now = parseNowKey(nowKey);
  if (!date) return { text: 'ยังไม่ได้เริ่มงาน', late: false };
  const today = now && now.date === date;
  const when = today ? (time || 'วันนี้') : [dayText(date), time].filter(Boolean).join(' ');
  const head = `นัด${today && !time ? '' : ' '}${when}`;
  if (!now) return { text: head, late: false };
  if (!today) {
    const rel = relDayText(date, now.date, 'เลยวันนัดมา');
    return { text: rel.text ? `${head} · ${rel.text}` : head, late: rel.tone === 'warn' };
  }
  if (!time) return { text: head, late: false };
  const diff = calendarMinutes(date, time) - calendarMinutes(now.date, now.time);
  if (diff > 0) return { text: `${head} · อีก ${durationText(diff)}`, late: false };
  if (diff === 0) return { text: `${head} · ถึงเวลานัดแล้ว`, late: false };
  return { text: `${head} · เลยเวลานัด ${durationText(diff)}`, late: true };
}

/**
 * 🔑 **แถบงานของช่างที่ขอบล่าง** — ปุ่มเดียวต่อจังหวะ: เริ่มงาน → ส่งงาน → (ถูกส่งกลับ) แจ้งหัวหน้าว่าแก้แล้ว
 *
 * ⭐ **แถบบอกว่ากดได้ไหมตั้งแต่ก่อนกด** (pain B7: แถบเดิมหน้าตาเท่ากันตั้งแต่ 0/3 ถึง 3/3) — ติดด่าน = ปุ่มเงียบ
 *   พร้อมเหตุบนแถบ ("ยังส่งไม่ได้ · ยังขาด ห้อง Treatment") แต่ **ยังกดได้** (เปิดกล่องส่งงานที่บอกรายพื้นที่พร้อม "ไปแก้")
 * ⚠️ **ปุ่มกรมท่าปุ่มเดียวต่อจอ**: `emphasis` = `primary` เฉพาะเมื่อไม่ติดด่าน **และ** ไม่ใช่สองบานที่ปุ่ม
 *   "บันทึกพื้นที่นี้" ของบานขวากดได้อยู่ (ปุ่มนั้นคืองานถัดไปจริง — บันทึกก่อนส่ง)
 * ⚠️ นับถอยหลังขยับทีละนาทีจาก `nowKey` ที่ผู้เรียกส่ง — ที่นี่ไม่อ่านนาฬิกา
 *
 * @param progress     `{ done, total, cut? }` — `total` = พื้นที่ที่ยังอยู่ในใบ · `cut` แยกใบว่างกับใบที่ตัดออกหมด
 * @param leftNames    ชื่อพื้นที่ที่ของช่างยังขาด (`surveyZoneListView().leftNames`)
 * @param crewGaps     ด่านของช่างที่ยังติด (`surveyCrewGaps` ของไฟล์ชุดสด)
 * @param dirtyZoneIds พื้นที่ที่มีค่าพิมพ์ค้าง · @param sendBack `surveySendBackState()` · @param ticks ข้อที่ติ๊ก
 * @param doneBlocker  `surveySendBackDoneError(...)` — ด่านเดียวกับ route แจ้งแก้แล้ว
 * @param split        สองบาน · @param zoneSaveEnabled ปุ่มบันทึกของบานขวากดได้อยู่
 * @param cardPrimary  การ์ดจัดการผลบนจอเดียวกันมีปุ่ม "ส่งผลให้ฝ่ายขาย" ที่กดได้ (หัวหน้าที่ไปหน้างานเอง) — ปุ่มนั้นคือ
 *                     ปุ่มกรมท่าของจอ ⇒ แถบถอยเป็นปุ่มเงียบ (🐞 UAT 25/09: กรมท่าสองปุ่มบนรายการเดียวกัน)
 * @returns `null` (ไม่มีแถบ) หรือ `{ label, tone, head, sub, sticky, late, action:{key,label,blocker,emphasis,gated}|null }`
 *   `label` = ชื่อพื้นที่ของแถบ ("งานของนัด SV-…") สำหรับโปรแกรมอ่านจอ
 */
export function surveyFieldBarView({
  visit = null, progress = null, leftNames = [], crewGaps = [], dirtyZoneIds = [], sendBack = null,
  ticks = [], doneBlocker = null, split = false, zoneSaveEnabled = false, cardPrimary = false, nowKey = null,
} = {}) {
  if (!visit?.status) return null;
  const emphasis = (blocker) => (!blocker && !(split && zoneSaveEnabled) && !cardPrimary ? 'primary' : 'quiet');
  /* `gated` = ปุ่มติดด่านแบบระบบ (กดแล้วบอกเหตุ ไม่ทำ) · **ส่งงานไม่ติด** — กดได้เสมอแล้วเปิดกล่องส่งงาน ซึ่งบอก
     รายพื้นที่พร้อม "ไปแก้" และมีทาง "ไปแล้วเข้าไม่ได้" (แผนลงมือ §4) · เหตุบนแถบของส่งงานมีไว้บอกล่วงหน้า + เลือกโทนปุ่ม */
  const action = (key, label, blocker = null) => ({
    key, label, blocker: blocker || null, emphasis: emphasis(blocker), gated: key !== 'submit',
  });
  const label = `งานของนัด ${visit.code || ''}`.trim();
  const gaps = Array.isArray(crewGaps) ? crewGaps.length : (Number(crewGaps) || 0);
  const left = surveyNameList(leftNames);
  const dirtyCount = new Set(list(dirtyZoneIds).filter(Boolean).map(String)).size;
  const dirtyText = 'มีค่าที่ยังไม่บันทึก — กดบันทึกพื้นที่นี้ก่อน';

  /* หัวหน้าส่งกลับหลังนัดปิดแล้ว = งานของช่างกลับมาอีกรอบ (นัดไม่ถูกเปิดใหม่ — ไม่ใช่รอบวัดใหม่)
     🐞 review 26/09: ค่าค้าง/ด่านอื่นของ route แถบเดิมยังเขียน "ครบ · แจ้งได้" ข้างปุ่มที่ติดด่าน (กดแล้วได้แค่เหตุ)
       ⇒ เหตุบนแถบตามลำดับ ของขาด → ค่าค้าง → ด่านของ route · "แจ้งได้" เฉพาะเมื่อไม่ติดอะไรเลย
       · ค่าค้างกันเองด้วย (page.js พับเข้า `doneBlocker` อยู่แล้ว — ผู้เรียกลืมก็ไม่ขึ้นปุ่มกรมท่า) */
  if (sendBack?.pending === true && isClosedVisit(visit) && visit.status !== 'unable') {
    const asks = surveySendBackAsks(sendBack.sentBack);
    const done = new Set(list(ticks).filter((n) => Number.isInteger(n) && n >= 0 && n < asks.length)).size;
    const blocker = doneBlocker || (dirtyCount ? dirtyText : null);
    let sub = 'ขนาด · ภาพกว้าง · จุด ครบ · แจ้งได้';
    if (gaps || left) sub = `ยังขาด ${left || 'ของฝั่งช่าง'}`;
    else if (dirtyCount) sub = dirtyText;
    else if (blocker) sub = blocker;
    return {
      label,
      tone: 'todo',
      head: asks.length ? `แก้แล้ว ${done} / ${asks.length} ข้อ` : 'หัวหน้าส่งกลับให้แก้',
      sub,
      sticky: true,
      late: false,
      action: action('report-fixed', 'แจ้งหัวหน้าว่าแก้แล้ว', blocker),
    };
  }

  if (isClosedVisit(visit)) {
    /* ส่งงานแล้ว = ข้อความบอกผล ไม่มีปุ่ม ⇒ ไม่ติดขอบ (ติดไว้ = บังพื้นที่ที่ช่างยังแก้ได้อยู่) */
    const end = hhmm(visit.actualEndTime);
    return visit.status === 'unable'
      ? { label, tone: 'warn', head: 'ปิดว่าไปแล้วเข้าไม่ได้', sub: 'ใบกลับไปขั้นลงคิว — TS จะลงวันใหม่', sticky: false, late: false, action: null }
      : {
        label,
        tone: 'ok',
        head: 'ส่งงานแล้ว',
        sub: `${end ? `เมื่อ ${end} น. · ` : ''}ยังแก้ผลวัดได้จนกว่าจะส่งผลให้ฝ่ายขาย`,
        sticky: false,
        late: false,
        action: null,
      };
  }

  if (visit.status === 'in_progress') {
    const total = Number(progress?.total) || 0;
    const noZones = total === 0 && !(Number(progress?.cut) > 0);
    const start = hhmm(visit.actualStartTime);
    let head;
    let sub;
    let blocker = null;
    if (noZones) {
      head = 'ยังไม่มีพื้นที่ให้วัด';
      sub = 'เพิ่มพื้นที่ที่เจอหน้างาน หรือเลือก “ไปแล้วเข้าไม่ได้”';
      blocker = 'ใบนี้ยังไม่มีพื้นที่ให้วัด';
    } else if (gaps || left) {
      head = 'ยังส่งไม่ได้';
      sub = `ยังขาด ${left || 'ของฝั่งช่าง'}`;
      blocker = sub;
    } else if (dirtyCount) {
      head = 'ยังส่งไม่ได้';
      sub = dirtyText;
      blocker = sub;
    } else {
      head = 'ครบทุกพื้นที่แล้ว';
      /* เริ่มเมื่อวาน (ทำข้ามคืน) = บอกวันเริ่มด้วย — "เริ่มงาน 14:00" เฉย ๆ อ่านเป็นบ่ายวันนี้ (review 26/09) */
      const day = isoDay(visit.actualDate || visit.scheduledDate);
      sub = start ? `ส่งได้ · เริ่มงาน ${onSiteSpanText({ day, start, shownDay: parseNowKey(nowKey)?.date })}` : 'ส่งได้';
    }
    return { label, tone: 'plain', head, sub, sticky: true, late: false, action: action('submit', 'ส่งงาน', blocker) };
  }

  if (visit.status === 'scheduled') {
    const when = visitCountdown(visit, nowKey);
    return {
      label,
      tone: 'plain',
      head: when.text,
      sub: `${visit.code ? `${visit.code} · ` : ''}กดเมื่อถึงหน้างาน`,
      sticky: true,
      late: when.late,
      action: action('start', 'เริ่มงาน'),
    };
  }

  // ร่าง · ยกเลิก · เลื่อน — ไม่ใช่งานที่ช่างลงมือได้ ⇒ ไม่มีแถบ
  return null;
}

/**
 * แถว "มาถึงแล้วแต่เข้าไม่ได้?" + ปุ่ม "ไปแล้วเข้าไม่ได้" ใต้รายการ (pain B9: ทางออกเคยซ่อนเป็นชิป 30px ในกล่องส่งงาน)
 * ⚠️ เฉพาะคนที่ทำหน้าที่ช่าง · เขียนได้ · นัดยังเปิด · ใบไม่ล็อก — นัดที่ปิดแล้วไม่มีอะไรให้ "เข้าไม่ได้"
 * ⭐ คำถามเปลี่ยนหลังเริ่มงาน — เริ่มแล้วแปลว่าเข้าได้ ⇒ ถามว่า "ทำต่อทั้งงานไม่ได้?" (AO-2)
 */
export function surveyEscapeView({ visit = null, canWrite = false, locked = false, actsAsCrew = false } = {}) {
  const open = visit?.status === 'scheduled' || visit?.status === 'in_progress';
  const show = actsAsCrew === true && canWrite === true && open && locked !== true;
  return {
    show,
    prompt: show ? (visit.status === 'in_progress' ? 'ทำต่อทั้งงานไม่ได้?' : 'มาถึงแล้วแต่เข้าไม่ได้?') : null,
    label: 'ไปแล้วเข้าไม่ได้',
  };
}

/* ══ กล่องส่งงาน ═══════════════════════════════════════════════════════════════ */

export const SURVEY_UNABLE_REASON_MIN = 10;
const buttonName = (label) => `“${label}”`;

/**
 * 🔑 **กล่องส่งงาน** (ม็อก A-4 · AT-4) — ผลของการเข้า (ไม่มีค่าตั้งต้น) · ผลวัดรายพื้นที่ · "กด ส่งงาน แล้วระบบจะ"
 *
 * ⭐ **ผลของการเข้าไม่มีค่าตั้งต้น** (pain B12 · กติกาฟอร์ม) — เดิมเลือก "เข้าพื้นที่ได้" ไว้ให้ ⇒ ช่างที่เข้าไม่ได้
 *   กดส่งผ่าน ๆ แล้วนัดปิดเป็น "เข้าแล้ว" · ตอนนี้ยังไม่เลือก = เหตุแรกที่ส่งไม่ได้
 * ⭐ **กล่องยืนยันบอกผลก่อนกด** — ปิดนัดอะไร เป็นอะไร ช่วงเวลาไหน ใครได้แจ้ง · ยังไม่เลือก = บอกกรณี "เข้าได้" ไว้ก่อน
 * 🔑 ลำดับเหตุที่ส่งไม่ได้: ยังไม่เลือก → เหตุผลเข้าไม่ได้สั้นไป → "เข้าได้" ทั้งที่ยังไม่กดเริ่มงาน → ค่าค้าง →
 *   ไม่มีพื้นที่ → ของขาด (ข้อสุดท้ายถามด่านตัวเดียวกับ route ปิดนัด `surveyFieldSubmitError`)
 *   ⚠️ เข้าไม่ได้ไม่ถามค่าค้าง/ของขาด — ทางนั้นไม่ต้องวัดให้ครบ (ผลวัดที่บันทึกไว้ยังอยู่บนใบ)
 *
 * @param outcome `null` | `'entered'` | `'unable'` · @param reason เหตุผลที่เข้าไม่ได้
 * @param viewerKind `crew` | `senior` (หัวหน้าที่ออกหน้างานเอง) | `head` (ส่งแทนช่างจาก `?submit=1`)
 * @param nowKey `'YYYY-MM-DD HH:MM'` เวลาไทยตอนนี้ — เวลาจบที่ server จะประทับ
 */
export function surveySubmitView({
  outcome = null, reason = '', visit = null, zones = [], filesByZone = {}, dirtyZoneIds = [],
  viewerKind = 'crew', nowKey = null,
} = {}) {
  const rows = list(zones).filter((z) => z?.id);
  const files = filesMap(filesByZone);
  const dirty = new Set(list(dirtyZoneIds).filter(Boolean).map(String));

  // ชื่อในประโยค ("มีค่าที่ยังไม่บันทึก: ห้อง MD") ตัวสะกดเดียวกับแถบและ "ถัดไป" — ไม่ใช่ชื่อดิบที่มีชั้นติดท้าย (UAT 25/09)
  const names = sentenceNames(rows);
  const viewRows = rows.map((zone) => {
    const facts = surveyZoneFacts(zone, list(files[zone.id]));
    const isDirty = !facts.cut && dirty.has(String(zone.id));
    const state = facts.cut ? 'cut' : (facts.missingCrew.length ? 'miss' : (isDirty ? 'dirty' : 'ok'));
    return {
      id: String(zone.id),
      code: zone.zoneCode ?? null,
      codeUnknown: zone.zoneCodeUnknown === true,
      name: names.get(String(zone.id)),
      title: surveyZoneTitle(zone),
      state,
      figures: !facts.cut && facts.sizeComplete ? figuresText(facts.areaSqm, facts.volumeCbm) : null,
      counts: facts.cut ? null : `ภาพกว้าง ${facts.photos.wide} · จุด ${facts.spotsTotal}`,
      note: state === 'cut' ? 'ตัดออก — ไม่ต้องวัด'
        : state === 'miss' ? crewMissingText(facts)
          : state === 'dirty' ? 'ยังไม่บันทึก' : null,
      go: state === 'miss' || state === 'dirty',
      wide: facts.photos.wide,
      spots: facts.spotsTotal,
      kept: !facts.cut && (facts.parts > 0 || facts.spotsTotal > 0 || facts.photos.wide + facts.photos.spot > 0),
    };
  });
  const active = viewRows.filter((r) => r.state !== 'cut');
  const totals = sheetTotals(rows, files);
  const progress = surveyFieldProgress(rows, files);

  /* ช่วงเวลาที่จะปิด — เริ่ม = ที่ช่างกดเริ่มงาน · จบ = ตอนนี้ (server ประทับเวลาเดียวกัน) · ยังไม่เริ่ม = เวลาเดียว */
  const code = visit?.code || 'นัดนี้';
  const now = parseNowKey(nowKey);
  /* 🐞 review 26/09: เริ่มเมื่อวาน ส่งวันนี้ = วันที่ทั้งสองปลาย (เดิม "(14:00–09:00)") */
  const span = onSiteSpanText({
    day: isoDay(visit?.actualDate || visit?.scheduledDate),
    start: hhmm(visit?.actualStartTime),
    endDay: now?.date || null,
    end: now?.time || '',
  });
  const range = span ? `(${span})` : '';
  const closeLine = (label) => ({
    key: 'close', code, text: `ปิดนัด ${code} เป็น “${label}”${range ? ` ${range}` : ''}`,
  });
  const enteredEffects = [
    closeLine(VISIT_STATUS_LABELS.done),
    ...(viewerKind === 'head'
      ? [
        { key: 'notify', text: 'ส่งแทนช่าง — แจ้งหัวหน้า TS คนอื่นว่าช่างส่งงานแล้ว' },
        { key: 'next', text: 'คุณเคาะจุดติดตั้งและแพ็คเกจต่อได้ที่แท็บสรุปส่งผล' },
      ]
      : viewerKind === 'senior'
        ? [
          { key: 'notify', text: 'แจ้งหัวหน้า TS คนอื่นว่าส่งงานแล้ว' },
          { key: 'next', text: 'คุณเคาะจุดติดตั้งและแพ็คเกจต่อได้เลยที่แท็บสรุปส่งผล' },
        ]
        : [
          { key: 'notify', text: 'แจ้งหัวหน้า TS ให้เคาะจุดติดตั้งและแพ็คเกจ' },
          { key: 'edit', text: 'ยังแก้ผลวัดได้จนกว่าหัวหน้าจะส่งผลให้ฝ่ายขาย' },
        ]),
  ];
  const kept = active.filter((r) => r.kept).length;
  const unableEffects = [
    closeLine(VISIT_STATUS_LABELS.unable),
    { key: 'queue', text: 'คำร้องกลับเข้าคิว ให้ TS ลงวันใหม่' },
    { key: 'sales', text: 'ฝ่ายขายได้รับเหตุผลที่เข้าไม่ได้' },
    ...(kept ? [{ key: 'kept', text: `ผลวัดที่บันทึกไว้ ${kept} พื้นที่ยังอยู่บนใบ` }] : []),
  ];
  const unable = outcome === 'unable';

  /* "เข้าได้" ก่อนกดเริ่มงาน — ไม่มีเวลาเริ่มจริง ⇒ ช่วงที่อยู่หน้างานเป็นเท็จ · ทางออกคือปุ่มเริ่มงานบนแถบ */
  const enteredBlocker = visit?.status === 'scheduled'
    ? `ยังไม่ได้กด ${buttonName('เริ่มงาน')} — ปิดกล่องนี้แล้วกดเริ่มงานที่แถบล่าง`
    : null;
  /* ค่าค้างบล็อกแม้พื้นที่นั้นจะยังขาดของอยู่ด้วย — ส่งแล้วค่าที่พิมพ์ไว้ไม่ถูกส่งไปด้วย (กติกาเดิมของกล่อง) */
  const dirtyNames = viewRows.filter((r) => r.state !== 'cut' && dirty.has(r.id)).map((r) => r.name);
  const missingCount = viewRows.filter((r) => r.state === 'miss').length;

  let blocker = null;
  if (outcome !== 'entered' && outcome !== 'unable') {
    blocker = 'เลือกผลของการเข้าครั้งนี้ก่อน';
  } else if (unable) {
    if (String(reason ?? '').trim().length < SURVEY_UNABLE_REASON_MIN) {
      blocker = `บอกเหตุผลที่เข้าไม่ได้อย่างน้อย ${SURVEY_UNABLE_REASON_MIN} ตัวอักษร — ฝ่ายขายจะเห็นข้อความนี้`;
    }
  } else if (enteredBlocker) {
    blocker = enteredBlocker;
  } else if (dirtyNames.length) {
    blocker = `มีค่าที่ยังไม่บันทึก: ${dirtyNames.join(' · ')} — กด ${buttonName('บันทึกพื้นที่นี้')} ก่อนส่งงาน`;
  } else if (!rows.length) {
    blocker = `ใบนี้ยังไม่มีพื้นที่ให้วัด — เพิ่มพื้นที่ที่เจอหน้างานก่อน หรือเลือก ${buttonName('ไปแล้วเข้าไม่ได้')}`;
  } else {
    const gateError = surveyFieldSubmitError(rows, files);
    if (gateError) {
      blocker = missingCount
        ? `ยังขาดผลวัด ${missingCount} พื้นที่ — กด ${buttonName('ไปแก้')} หรือ ${buttonName('ตัดพื้นที่นี้ออก')}`
        : gateError;
    }
  }

  const effects = unable ? unableEffects : enteredEffects;
  return {
    title: `ส่งงาน${visit?.code ? ` · ${visit.code}` : ''}`,
    statusLabel: visit?.status ? (VISIT_STATUS_LABELS[visit.status] || visit.status) : null,
    rows: viewRows,
    progressText: `วัดแล้ว ${progress.done} / ${progress.total} พื้นที่`,
    totals,
    totalsText: {
      label: `รวม ${totals.zones} พื้นที่`,
      figures: figuresText(totals.areaSqm, totals.volumeCbm),
      counts: `ภาพกว้าง ${totals.wide} · จุด ${totals.spots}`,
    },
    effects,
    effectsCaption: unable ? 'กรณีไปแล้วเข้าไม่ได้' : 'กรณีเข้าพื้นที่ได้',
    enteredBlocker,
    blocker,
    outcome: blocker
      ? { tone: 'warn', text: blocker }
      : { tone: 'ok', text: effects.slice(0, 2).map((e) => e.text).join(' · ') },
  };
}

/* ══ หัวงาน (ไซต์ · โทร · นำทาง · นัด · ทีม · ให้เข้า · ฝากมา) ══════════════════════════ */

/* สถานะนัดเป็นคำต่อท้ายข้อ "นัด" — เริ่มงาน 10:12 · เข้าแล้ว 10:12–11:46 · ทำไม่ได้
   🐞 review 26/09: ปิดข้ามวันเดิมขึ้น "เข้าแล้ว 14:00–09:00" ถาวร ⇒ ข้ามวัน = วันที่ทั้งสองปลาย · เข้าคนละวันกับวันนัด
   (วันที่ข้อ "นัด" บอกไว้) = บอกวันเข้าด้วย */
function visitProgressText(visit) {
  const day = isoDay(visit?.actualDate || visit?.scheduledDate);
  const shownDay = isoDay(visit?.scheduledDate);
  const start = hhmm(visit?.actualStartTime);
  const end = hhmm(visit?.actualEndTime);
  if (visit?.status === 'in_progress') {
    return start ? `เริ่มงาน ${onSiteSpanText({ day, start, shownDay })}` : VISIT_STATUS_LABELS.in_progress;
  }
  if (visit?.status === 'done' || visit?.status === 'partial') {
    const label = VISIT_STATUS_LABELS[visit.status];
    return end ? `${label} ${onSiteSpanText({ day, start, endDay: isoDay(visit.actualEndDate), end, shownDay })}` : label;
  }
  if (visit?.status === 'unable') return VISIT_STATUS_LABELS.unable;
  return null;
}

/* ── เบอร์ที่ปุ่มโทรกด ──
 * ช่องเบอร์ของไซต์เป็นข้อความอิสระ ≤50 ตัว (sites.js · ยกมาจากทะเบียนลูกค้าได้) — "02-123-4567 ต่อ 102" · "081-111-2222, 02-333-4444"
 * 🐞 review 26/09: เดิมเก็บทุกตัวเลขทั้งช่องเป็นเบอร์เดียว ⇒ tel:021234567102 / เลข 19 หลัก = โทรไม่ติดหรือติดผิดคน
 *   ⇒ เบอร์แรกเบอร์เดียว: ต่อกลุ่มตัวเลขที่คั่นด้วยช่องว่าง/ขีด/จุด/วงเล็บ จนครบ 9 หลัก (เบอร์ไทยที่สั้นที่สุด) แล้วหยุด —
 *   "081 111 2222 02 333 4444" ไม่กลายเป็นเบอร์เดียว · "ต่อ 102" = กดต่อหลังพัก (",")
 * 🐞 review 26/09 รอบสอง: เบอร์ต้อง **ขึ้นต้นด้วย 0 หรือ +** (หรือสายด่วน 1xxx) — เดิม "ห้อง 305 081-111-2222" ⇒ tel:3050811112222 ·
 *   ขีดนับเป็นตัวคั่นกลุ่มด้วย ⇒ "02-123-4567-8" (ช่วงเบอร์) หยุดที่ 9 หลัก ไม่ต่อเลข 8 · สายด่วน 4 หลัก ("1557") โทรได้
 */
const PHONE_MIN_DIGITS = 6;
const PHONE_FULL_DIGITS = 9;
const PHONE_EXT = /^\s*(?:ต่อ|ext\.?|x|#)\s*(\d{1,6})/iu;
const PHONE_GAP = /^[\s().-]{1,3}$/u;
const HOTLINE = /^1\d{3}$/u;

function phoneRun(src) {
  const groups = [...src.matchAll(/\+?\d+/gu)].map((m) => ({ text: m[0], start: m.index, end: m.index + m[0].length }));
  for (let i = 0; i < groups.length; i += 1) {
    const first = groups[i];
    const lead = first.text.replace('+', '');
    const plus = first.text.startsWith('+');
    const hotline = HOTLINE.test(lead);
    if (!plus && !lead.startsWith('0') && !hotline) continue;
    let digits = lead;
    let end = first.end;
    for (let j = i + 1; j < groups.length && digits.length < PHONE_FULL_DIGITS; j += 1) {
      if (groups[j].text.startsWith('+') || !PHONE_GAP.test(src.slice(groups[j - 1].end, groups[j].start))) break;
      digits += groups[j].text;
      end = groups[j].end;
    }
    if (digits.length >= PHONE_MIN_DIGITS || (hotline && digits === lead)) {
      return { start: src[first.start - 1] === '(' ? first.start - 1 : first.start, end, digits, plus };
    }
  }
  return null;
}

/** @returns `{ href, shown, more }` หรือ `null` (ไม่มีเบอร์ที่โทรได้) · `shown` = เบอร์ตามที่พิมพ์ · `more` = ช่องมีเบอร์อื่นอีก */
function phoneDial(text) {
  /* "+66 (0) 2 123 4567" · "+66 (0)81…" — ศูนย์ในวงเล็บหลังรหัสประเทศคือเลขนำหน้าในประเทศ โทรจากรหัสประเทศต้องตัดทิ้ง (รอบสาม) */
  const src = String(text ?? '').replace(/(\+\d{1,3})[\s-]*\(0\)[\s-]*/u, '$1 ');
  const first = phoneRun(src);
  if (!first) return null;
  // ท้ายช่วงเบอร์ ("02-123-4567-9") ไม่ใช่เบอร์ใหม่ — ข้ามไปก่อนหาเบอร์ต่อ ("-9 ต่อ 5")
  let rest = src.slice(first.end).replace(/^-\d{1,2}(?!\d)/u, '');
  const ext = PHONE_EXT.exec(rest);
  if (ext) rest = rest.slice(ext[0].length);
  return {
    href: `tel:${first.plus ? '+' : ''}${first.digits}${ext ? `,${ext[1]}` : ''}`,
    shown: src.slice(first.start, first.end).trim().replace(/[^\d)]+$/u, ''),
    more: phoneRun(rest) !== null,
  };
}

/**
 * 🔑 **หัวงานของจอหน้างาน** (แทนหัวใบ 470px ของจอเดิม · pain B1) — ของที่ช่างต้องใช้ก่อนเดินเข้าตึก
 *
 * ⭐ ที่อยู่บรรทัดเดียว (ปุ่มกางขึ้นเฉพาะตอนถูกตัดจริง — ตัดสินที่จอ) · โทร/นำทางเป็นปุ่ม 44px ·
 *   ข้อ "ให้เข้า" เตือนสีอำพัน **ก่อนเริ่มงานเท่านั้น** ("นัด 10:00 อยู่นอกช่วงนี้ — โทรเช็กคุณแหวนก่อน")
 *   · เริ่มงานแล้ว = เข้าไปแล้ว คำเตือนหมดประโยชน์
 * ⚠️ ชิ้นที่อ่านไม่สำเร็จเขียน "ไม่ทราบ" ไม่ใช่ขีด (`unknown` จาก GET — กติกา supabase-never-throws)
 * ⚠️ ชื่อตัวเองเป็น "คุณ" (`crew[].you` มาจาก server — จอไม่รู้ user id ของตัวเอง)
 *
 * @param crew `[{ id, name, lead, you, gone? }]` จาก GET · ไม่มี (GET รุ่นก่อน) = ถอยไปใช้ชื่อคนไปบนนัด
 * @returns `{ site:{code,name,title,href,address,unknown}, call, nav, facts:[{key,label,value,sub?,warn?,people?}], request }`
 */
export function surveyJobHeaderView({
  request = null, customer = null, site = null, visit = null, crew = [], unknown = {},
} = {}) {
  const siteUnknown = unknown?.site === true;
  const phone = String(site?.contactPhone ?? '').trim();
  const dial = phone ? phoneDial(phone) : null;
  const contact = String(site?.contactName ?? '').trim();
  const mapUrl = String(site?.mapUrl ?? '').trim();

  const people = (list(crew).length ? list(crew) : (visit?.assigneeId || visit?.assigneeName
    ? [{ id: visit.assigneeId || 'lead', name: visit.assigneeName || null, lead: true, you: false }]
    : []))
    .filter((p) => p && (p.id || p.name))
    .map((p) => {
      const known = String(p.name ?? '').trim();
      return {
        id: String(p.id ?? known),
        lead: p.lead === true,
        you: p.you === true,
        helper: p.lead !== true,
        initials: surveyInitials(known),
        text: p.you === true ? 'คุณ'
          : known || (p.gone === true ? 'เจ้าหน้าที่ที่ไม่อยู่ในรายชื่อแล้ว' : SURVEY_UNKNOWN_TEXT),
      };
    });

  /* คำเตือนช่วงเข้าไซต์ — ตัดสินชน/ไม่ชนที่ `accessConflict` ตัวเดียวกับด่านของโมดัลจัดคิว ที่นี่แค่เลือกคำ */
  let warn = null;
  if (site && visit?.status === 'scheduled') {
    const when = { date: visit.scheduledDate || null, startTime: visit.startTime || null, endTime: visit.endTime || null };
    const conflict = accessConflict(site, when);
    if (conflict) {
      const start = hhmm(visit.startTime);
      const head = conflict.kind === 'time' && start ? `นัด ${start} อยู่นอกช่วงนี้` : accessWarnText(site, when);
      warn = `${head}${phone ? ` — โทรเช็ก${contact || 'ไซต์'}ก่อน` : ''}`;
    }
  }

  const visitValue = visit
    ? [visit.code, [dayText(visit.scheduledDate), hhmm(visit.startTime)].filter(Boolean).join(' ')].filter(Boolean).join(' · ')
    : (unknown?.visit === true ? SURVEY_UNKNOWN_TEXT : naText(null));
  const siteValue = (text) => (site ? naText(text) : (siteUnknown ? SURVEY_UNKNOWN_TEXT : naText(null)));

  return {
    site: {
      code: site?.code || null,
      name: site?.name || null,
      title: site ? ([site.code, site.name].filter(Boolean).join(' · ') || naText(null))
        : (siteUnknown ? SURVEY_UNKNOWN_TEXT : naText(null)),
      /* ทะเบียนไซต์ (หัวใบเดิมลิงก์รหัสไซต์ไว้ — ของเดิมต้องไม่หายไปพร้อมหัวใบ) · ไม่รู้ id = ไม่มีลิงก์ */
      href: idOf(site?.id) ? `/database/sites/${encodeURIComponent(idOf(site.id))}` : null,
      address: String(site?.address ?? '').trim() || null,
      unknown: siteUnknown,
    },
    /* หลายเบอร์ = ป้ายบอกว่ากดแล้วโทรเบอร์ไหน (ชื่อผู้ติดต่อบังเบอร์ไว้ ช่างไม่รู้ว่าปุ่มโทรเบอร์ไหน) */
    call: dial
      ? { href: dial.href, label: `โทร ${dial.more ? [contact, dial.shown].filter(Boolean).join(' ') : (contact || phone)}` }
      : null,
    nav: mapUrl ? { href: mapUrl, label: 'นำทาง' } : null,
    facts: [
      { key: 'visit', label: 'นัด', value: visitValue, sub: visit ? visitProgressText(visit) : null },
      {
        key: 'crew',
        label: 'ทีม',
        value: people.length
          ? people.map((p) => `${p.text}${p.helper ? ' (ผู้ช่วย)' : ''}`).join(' · ')
          : naText(null),
        people,
      },
      { key: 'access', label: 'ให้เข้า', value: siteValue(site ? accessWindowText(site) : ''), warn },
      { key: 'note', label: 'ฝากมา', value: siteValue(site?.accessNote) },
      /* ช่องเบอร์ที่ไม่มีเบอร์ให้กด ("โทรหา รปภ. หน้าตึก") = ไม่มีปุ่มโทร แต่ข้อความต้องไม่หายจากหัว (review 26/09) */
      ...(phone && !dial ? [{ key: 'phone', label: 'ติดต่อ', value: [contact, phone].filter(Boolean).join(' · ') }] : []),
    ],
    request: {
      docNo: request?.docNo || null,
      title: request?.title || null,
      customerText: customer
        ? [customer.arCode, customer.name].filter(Boolean).join(' · ') || naText(null)
        : (unknown?.customer === true ? SURVEY_UNKNOWN_TEXT : naText(null)),
    },
  };
}

/* ══ เปลือกของใบ (ชุด S9) — บรรทัดท้ายแถบแท็บ · กล่องแจ้งของคนที่ไม่มีการ์ด · เกี่ยวกับคำร้อง · กำหนดส่งผล ════════
 *
 * ⭐ หัวใบเดิม (`DetailOverview` — รหัส · ชื่อเรื่อง · ลูกค้า · ผู้ติดต่อ · ไซต์ · นัด · กำหนดส่งผล) ถูกแทนด้วยหัวงาน
 *   (`surveyJobHeaderView`) + รหัสคำร้องบนแถวย้อน ⇒ ของทุกชิ้นที่หัวเดิมพูดต้องมีที่อยู่ใหม่ **ทุกขนาดจอ**:
 *   ลูกค้า/ชื่อเรื่อง → "รายละเอียดคำร้อง" · กำหนดส่งผล → การ์ดจัดการผล (คนที่ต้องส่งผลคือคนที่มีการ์ด)
 */

/**
 * บรรทัดท้ายแถบแท็บของหัวหน้า — "รวม 114 ตร.ม. · 336 ลบ.ม. · ภาพกว้าง 5 · จุด 7" (ม็อก AW-2 · AW-3)
 * ⚠️ ตัวรวมตัวเดียวกับแถวรวมของกล่องส่งงาน (`sheetTotals`) — สองที่บนจอเดียวต้องบอกเลขเดียวกัน
 * @returns ข้อความ หรือ `null` เมื่อไม่มีพื้นที่ที่ยังอยู่ในใบ (ศูนย์ทุกช่องอ่านเหมือน "วัดแล้วได้ศูนย์")
 */
export function surveySheetTotalsText({ zones = [], filesByZone = {} } = {}) {
  const totals = sheetTotals(list(zones), filesMap(filesByZone));
  if (!totals.zones) return null;
  return `รวม ${figuresText(totals.areaSqm, totals.volumeCbm)} · ภาพกว้าง ${totals.wide} · จุด ${totals.spots}`;
}

/**
 * 🔑 **กล่องแจ้งของคนที่ไม่มีการ์ดจัดการผล** (ช่าง · คนอ่านอย่างเดียว · แผนลงมือ C15) — วางบนสุดของหน้ารายการ
 * ⭐ ม็อก A-1 · AT-1 · AO-2 · AW-1 ไม่มีการ์ดจัดการผลให้ช่าง ⇒ ของที่การ์ดเคยบอกเขาต้องย้ายมาที่นี่ ไม่ใช่หายไปด้วย:
 *   ใบล็อกแล้ว (ส่งผล · ยกเลิก · ปิด) — แถบของช่างหายเมื่อใบล็อก ⇒ ไม่มีกล่องนี้ = ช่างไม่รู้ว่าทำไมแก้อะไรไม่ได้ ·
 *   ดึงกลับเพราะ… · ดูได้อย่างเดียวเพราะ… · อ่านข้อมูลบางส่วนไม่สำเร็จ
 * ⚠️ **ไม่คิดกฎใหม่** — สถานะกับกล่องแจ้งทุกใบมาจาก `surveyControlView` ตัวเดียวกับที่การ์ดวาด · ที่นี่แค่เรียงและรวม
 *   "ส่งผลแล้ว แก้ไม่ได้ — แจ้งหัวหน้า…" เข้าไปเป็นบรรทัดรองของสถานะ (เรื่องเดียวกัน สองกล่องซ้อนคือพูดซ้ำ)
 * @param view ผลของ `surveyControlView(...)`
 * @returns `[{ key, tone, title, text, meta }]` — สถานะที่ล็อกใบมาก่อน แล้วกล่องแจ้งของการ์ดตามลำดับเดิม
 */
export function surveySheetNotices(view) {
  if (!view) return [];
  const notices = list(view.notices).filter(Boolean);
  const out = [];
  let merged = null;
  if (view.flags?.locked && view.status?.headline) {
    merged = notices.find((n) => n.key === 'crew-sent') || null;
    out.push({
      key: 'status',
      tone: view.status.tone || 'neutral',
      title: view.status.headline,
      text: view.status.sub || '',
      meta: merged?.text || null,
    });
  }
  for (const notice of notices) {
    if (notice === merged) continue;
    out.push({
      key: notice.key,
      tone: notice.tone || 'neutral',
      title: notice.title || null,
      text: notice.text || '',
      meta: notice.meta || null,
    });
  }
  return out;
}

/**
 * "เกี่ยวกับคำร้อง" ท้ายรายการพื้นที่ (ม็อก A-1 · AT-1 · AO-2 · AW-1 · AW-2 · แผนลงมือ §3.8)
 * ⭐ **ทุกคน**: "รายละเอียดคำร้อง" กางในที่ (ลูกค้า · เรื่อง · เลขคำร้อง) — หัวใบเดิมถูกถอด ⇒ ลูกค้ากับชื่อเรื่องต้องมีที่อยู่
 *   ทุกขนาดจอ (บรรทัดข้างรหัสคำร้องบนแถวย้อนมีเฉพาะสองบาน · ไม่มีอะไรหายตามขนาดจอ)
 * ⭐ **เปิดหน้าคำร้องได้** (`canOpenRequest` จาก server) = แถวลิงก์เดียว "หน้าคำร้อง RQ-…" — หน้าคำร้องไม่มีลิงก์ลงหัวข้อย่อย
 *   ⇒ สามแถวของม็อก (รายละเอียด · ความเคลื่อนไหว · ไฟล์แนบ) ที่พาไปหน้าเดียวกันคือสามปุ่มที่ทำเหมือนกัน (ตั้งใจต่างจากม็อก ข้อ 3)
 *   🔴 เปิดไม่ได้ = ไม่มีแถว — role `ts` ได้ 403 ที่ `/requests/*` (กติกา ui-visibility · ห้ามเดาจากธงอื่น)
 * ⭐ **คนดูอย่างเดียว** (ไม่มีแท็บ · เขียนไม่ได้) = แถว "สรุปส่งผล · ดูอย่างเดียว" — ทางเดียวไปมุมมองสรุปของเขา
 *   🔴 **ช่างไม่มีแถวนี้** (`canWrite` แต่ไม่ได้เคาะ · มติเจ้าของ 26/09 "ช่างเห็นแค่งานตัวเอง")
 * @param header `surveyJobHeaderView(...).request` — คำชุดเดียวกับหัวงาน (รหัส · ชื่อเรื่อง · "AR · ลูกค้า")
 * @returns `{ detail:{label,sub,facts}, link|null, result|null, line:{title,customer} }` (`line` = บรรทัดข้างรหัสบนแถวย้อน)
 */
export function surveyAboutView({ header = null, requestId = null, canDecide = false, canWrite = false, canOpenRequest = false } = {}) {
  const docNo = String(header?.docNo ?? '').trim() || null;
  const title = String(header?.title ?? '').trim() || null;
  const customerText = String(header?.customerText ?? '').trim() || naText(null);
  const customerKnown = customerText !== naText(null) && customerText !== SURVEY_UNKNOWN_TEXT;
  const id = idOf(requestId);
  return {
    detail: {
      label: 'รายละเอียดคำร้อง',
      sub: customerText,
      facts: [
        { key: 'customer', label: 'ลูกค้า', value: customerText },
        { key: 'title', label: 'เรื่อง', value: naText(title) },
        { key: 'docNo', label: 'เลขคำร้อง', value: naText(docNo) },
      ],
    },
    link: canOpenRequest && id
      ? {
        href: `/requests/${encodeURIComponent(id)}`,
        label: docNo ? `หน้าคำร้อง ${docNo}` : 'หน้าคำร้อง',
        sub: 'รายละเอียด · ความเคลื่อนไหว · ไฟล์แนบ',
      }
      : null,
    /* ⭐ มติเจ้าของ 26/09 "ช่างเห็นแค่งานตัวเอง" — ช่าง (เขียนผลวัดได้ · ไม่ได้เคาะ) ไม่มีแถวไปสรุปส่งผลแล้ว
       (ตอบคำถามตัวเลขแพ็คเกจบนจอดูอย่างเดียวของช่างไปด้วย) · เหลือเฉพาะคนดูอย่างเดียว เช่นฝ่ายขาย */
    result: canDecide || canWrite ? null : { label: 'สรุปส่งผล', sub: 'ดูอย่างเดียว' },
    line: { title, customer: customerKnown ? customerText : null },
  };
}

/**
 * กำหนดส่งผลบนการ์ดจัดการผล — "ส่งผลให้ฝ่ายขายภายใน พ. 30 ก.ย. · อีก 2 วัน" (ม็อก AW-2)
 * ⭐ เดิมเป็นช่อง "TS จะส่งผล" ของหัวใบที่ถูกถอด ⇒ ย้ายมาอยู่ใต้สถานะของการ์ด (คนที่ต้องส่งผลคือคนที่มีการ์ด)
 * ⚠️ ใบที่ล็อกแล้ว (ส่ง · ยกเลิก · ปิด) ไม่มีบรรทัดนี้ — พาดหัวสถานะบอกแล้วว่าจบอย่างไร · ไม่มีกำหนด = ไม่มีบรรทัด
 * @param due    `view.due` ของ `surveyControlView` (`{ date }` — วันส่งผล ถอยไปวันนัดเมื่อใบยังไม่มีวันส่งผล)
 * @param today  วันไทย `YYYY-MM-DD` ของผู้เรียก — ไม่ส่ง = บอกแค่วัน (ไฟล์นี้ไม่อ่านนาฬิกา)
 * @returns `{ text, late }` หรือ `null`
 */
export function surveyDueLine({ due = null, locked = false, today = null } = {}) {
  const date = String(due?.date ?? '').slice(0, 10);
  if (locked || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const rel = today ? relDayText(date, today, 'เลยกำหนด') : { text: '', tone: '' };
  return {
    text: [`ส่งผลให้ฝ่ายขายภายใน ${dayText(date)}`, rel.text].filter(Boolean).join(' · '),
    late: rel.tone === 'warn',
  };
}
