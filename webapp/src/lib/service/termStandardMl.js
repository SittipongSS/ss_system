// ── มาตรฐาน มล./เดือนของรอบขาย (PR-C · C-D8/C-D9/C-D10) ─────────────────────────────────────
//
// ⭐ คอลัมน์ `service_zone_terms."standardMlPerMonth"` (mig 0297 · numeric > 0 หรือว่าง) เป็นช่องเดียวของรอบขาย
//   ที่ **TS ตั้งเอง** — ทุกช่องอื่นเป็นภาพนิ่งจากบรรทัดขาย (mig 0392 ก๊อปตอนอนุมัติ) · ฝ่ายขายไม่ได้ขาย "มล."
//   (บรรทัดขายไม่มีคอลัมน์นี้) ⇒ ฝ่ายขายเห็นค่า แต่แก้ไม่ได้
// ⭐ ค่าที่ TS ตั้งไว้อยู่รอดการอนุมัติซ้ำ (ON CONFLICT … COALESCE · mig 0392:875) และติดไปใบ Rev. (mig 0392:854-861)
//
// ⚠️ ไฟล์นี้ **pure** — จอ (ช่องแก้ · หน้าโซน) กับ route ใช้ตัวตรวจ/ข้อความชุดเดียวกัน
//    ห้าม import อะไรที่แตะฐานหรือ next เข้ามา
import { fmtNumber, NA } from '@/lib/format';
import { isPackUnit, suggestStandardMl, termsSoldNow } from '@/lib/service/terms';

/* [owner] C-D8 — จำนวนเต็ม 1–1,000,000 มล. (ล้านมล. = พันลิตรต่อเดือนต่อโซน เกินของจริงไปไกลแล้ว
   · เพดานมีไว้กันพิมพ์ศูนย์เกิน ไม่ใช่ข้อจำกัดธุรกิจ) */
export const STANDARD_ML_MAX = 1000000;

const SHAPE_ERROR = 'แก้ได้เฉพาะมาตรฐาน มล./เดือน';
const RANGE_ERROR = 'มาตรฐานต้องเป็นจำนวนเต็ม 1–1,000,000 มล. หรือเว้นว่าง';
/* ช่องบนจอใช้ข้อความเดียวกันเมื่อเบราว์เซอร์บอกว่าสิ่งที่พิมพ์ไม่ใช่ตัวเลข (ช่อง type=number ส่งค่าว่างมาแทน) */
export const STANDARD_ML_RANGE_ERROR = RANGE_ERROR;
const KEY = 'standardMlPerMonth';

const isPlainObject = (value) => Object.prototype.toString.call(value) === '[object Object]';

/* ตัวตรวจ body ของ PATCH /api/service/terms/[id] — ตัวเดียวกับที่ช่องบนจอใช้ก่อนยิง
   ⭐ **คีย์เดียวเท่านั้น** — ก้อนที่มีคีย์อื่นติดมา (packageQty · วันที่ · zoneId) ถูกตีกลับทั้งก้อน
      เส้นนี้ต้องไม่เป็นประตูหลังให้แก้ภาพนิ่งของบรรทัดขาย (house rule 1)
   ⚠️ ไม่ปัด ไม่ตัด — 1.5 / "2,000" / "1e3" = ผิด (ช่องตัวเลขบนจอส่งตัวเลขล้วนอยู่แล้ว) */
export function normalizeStandardMlPatch(body) {
  if (!isPlainObject(body)) return { value: null, error: SHAPE_ERROR };
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== KEY) return { value: null, error: SHAPE_ERROR };
  const raw = body[KEY];
  if (raw === null) return { value: null, error: null };
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) return { value: null, error: null };
    if (!/^\d+$/.test(text)) return { value: null, error: RANGE_ERROR };
    return inRange(Number(text));
  }
  if (typeof raw !== 'number') return { value: null, error: RANGE_ERROR };
  return inRange(raw);
}

function inRange(value) {
  if (!Number.isInteger(value) || value < 1 || value > STANDARD_ML_MAX) return { value: null, error: RANGE_ERROR };
  return { value, error: null };
}

/* ค่าในฐาน (numeric — อาจมาเป็นสตริง) → ตัวเลข หรือ null */
function storedValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/* ค่าเดิมกับค่าใหม่เท่ากันไหม — เท่ากัน = route ตอบ changed: false โดยไม่เขียน (ไม่มี audit ขยะ) */
export function sameStandardMl(before, value) {
  return storedValue(before) === storedValue(value);
}

/* สถานะของร่างในช่อง — ว่าง = ขอล้าง · ตรงค่าเดิม = ไม่มีอะไรให้บันทึก · ผิดรูป = บันทึกไม่ได้ (dirty เพื่อให้ปุ่มขึ้นแล้วบอกเหตุตอนกด) */
export function standardMlDraft(draft, saved) {
  const { value, error } = normalizeStandardMlPatch({ [KEY]: draft ?? '' });
  if (error) return { value: null, error, dirty: true };
  return { value, error: null, dirty: !sameStandardMl(saved, value) };
}

/* ── ข้อเสนอ = อัตราต่อเดือน (C-D9 · [owner]) ──────────────────────────────────────────────
   หลักฐานเดียวที่มี: 1 แพ็ค = 1 ลิตร/เดือน (terms.js `ML_PER_PACK_HINT` · docs/service-field-operations.md §2.3)
   รอบขายของใบที่ฝ่ายขายตั้งโซนแล้ว (ประทับ · mig 0392) ขาย `packageQty` แพ็ค **ต่อรอบ** × `rounds` รอบตลอดช่วงบริการ
   ⇒ มล./เดือน = แพ็คต่อรอบ × รอบ × 1,000 ÷ จำนวนเดือนของช่วง
   · รอบ = เดือน (บริการรายเดือน) → เท่ากับตัวอย่าง r2 T1 "1,000 มล. (1 แพ็ค/รอบ × 1 ลิตร)" และใช้ข้อความนั้น
   · อย่างอื่น → โชว์ที่มาเป็นเลข ("167 มล. (2 แพ็ค/รอบ × 1 รอบ ÷ 12 เดือน × 1 ลิตร)") ให้คนเห็นก่อนกด "ใช้"
   ⚠️ ใบที่ไม่ประทับ (ย้อนหลัง/ข้อมูลเก่า) `packageQty` = จำนวนที่ขายทั้งบรรทัด ไม่ใช่แพ็คต่อรอบ ⇒ ไม่มีข้อเสนอ (แต่ยังแก้ได้)
   ⚠️ ข้อเสนอเท่านั้น — ไม่มีทางไหนเขียนลงแถวเอง (กติกา "แปลงไม่ได้ต้องค้างให้คนตัดสิน") */
export function standardMlSuggestion(term, { stamped = false } = {}) {
  if (!stamped || !term) return null;
  if (!isPackUnit(term.unit)) return null;
  const packs = Number(term.packageQty);
  const rounds = Number(term.rounds);
  const months = Number(term.periodMonths);
  if (!Number.isFinite(packs) || packs <= 0) return null;
  if (!Number.isInteger(rounds) || rounds < 1) return null;
  if (!Number.isInteger(months) || months < 1) return null;
  const total = suggestStandardMl(packs * rounds, term.unit);
  if (total == null) return null;
  const value = Math.round(total / months);
  if (!(value >= 1)) return null;
  const label = rounds === months
    ? `${fmtNumber(value)} มล. (${fmtNumber(packs)} แพ็ค/รอบ × 1 ลิตร)`
    : `${fmtNumber(value)} มล. (${fmtNumber(packs)} แพ็ค/รอบ × ${fmtNumber(rounds)} รอบ ÷ ${fmtNumber(months)} เดือน × 1 ลิตร)`;
  return { value, label };
}

/* ── ตัวอ่านของหน้าโซน (C-D10) ────────────────────────────────────────────────────────────
   มาตรฐานของโซน = **ผลรวม** ของรอบขายที่มีผลทุกรอบ (โซนหนึ่งถือหลายบรรทัดได้พร้อมกัน — SO-26090247-0
   ลงสองบรรทัดบนโซน Office) · "มีผล" ตัดสินที่ terms.js ที่เดียว
   · `missing` = รอบที่มีผลแต่ยังไม่ตั้ง ⇒ จอบอกว่ายอดเทียบยังไม่ครบ ไม่ใช่เงียบ
   · ไม่มีรอบที่มีผลเลย → `live: 0` · จอถอยไปรอบล่าสุดเหมือนเดิม (ไม่ใช่หน้าที่ของตัวนี้)
   🐞 review 29/09: "มีผล" ของผลรวม = `termsSoldNow` (ช่วงบริการของใบที่ประทับเป็นหน้าต่าง) — term ของ 0392 ไม่มีวัน
      ⇒ ใบเก่าที่ช่วงจบแล้วกับใบต่อสัญญาเคยถูกรวมกัน (มาตรฐานสองเท่า ⇒ หน้าโซนอ่านว่าใช้น้อยกว่ามาตรฐาน) */
export function zoneStandardMl(terms = [], ordersById = new Map(), todayIso = undefined) {
  const live = termsSoldNow(terms || [], ordersById, todayIso);
  const set = live.map((t) => storedValue(t.standardMlPerMonth)).filter((v) => v != null);
  return {
    value: set.length ? set.reduce((sum, v) => sum + v, 0) : null,
    live: live.length,
    missing: live.length - set.length,
  };
}

/* ── ข้อความ ─────────────────────────────────────────────────────────────────────────── */
export const ZONE_STANDARD_PARTIAL = (missing, live) => `ยังไม่ตั้งมาตรฐาน ${missing} จาก ${live} รอบขาย — ยอดเทียบยังไม่ครบ`;
/* หลายรอบขายที่มีผลและตั้งครบ — บอกใต้ค่าว่าเป็นผลรวม · ช่อง "แพ็คที่ขาย" ข้าง ๆ ใช้คำเดียวกันเมื่อรวมแพ็คต่อรอบได้
   (ทุกรอบมาจากใบที่ประทับ — `zoneSaleFacts.soldPerRound`) */
export const ZONE_STANDARD_SUM = (live) => `รวม ${live} รอบขายที่มีผล`;
/* หลายรอบขายที่มีผลแต่บวกแพ็คต่อรอบไม่ได้ (มีใบไม่ประทับ: packageQty = จำนวนทั้งบรรทัด) — ช่อง "แพ็คที่ขาย" เล่ารอบเดียว ต้องบอก */
export const ZONE_PACK_SINGLE = (live) => `รอบขายเดียวจาก ${live} รอบที่มีผล`;

export function standardMlText(value) {
  const n = storedValue(value);
  return n == null ? NA : `${fmtNumber(n)} มล.`;
}

export function standardMlAuditSummary({ after, zoneLabel, orderNumber } = {}) {
  const n = storedValue(after);
  const head = n == null ? 'ล้างมาตรฐาน มล./เดือน' : `ตั้งมาตรฐาน ${fmtNumber(n)} มล./เดือน`;
  return [head, zoneLabel ? `โซน ${zoneLabel}` : null, orderNumber || null].filter(Boolean).join(' · ');
}

export const STANDARD_ML_MESSAGES = {
  notFound: 'ไม่พบรอบขายของโซนนี้',
  orderDead: 'ใบสั่งขายของรอบขายนี้ไม่มีผลแล้ว (ออก Rev./ยกเลิก/ย้อนการอนุมัติ) — ตั้งมาตรฐานที่รอบขายของใบที่มีผล',
  saved: 'บันทึกมาตรฐาน มล./เดือน แล้ว',
  hint: 'ระบบไม่เติมมาตรฐานให้เอง — กด “ใช้” หรือพิมพ์เอง',
};
