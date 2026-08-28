import { businessDayKey, businessTimeKey } from "@/lib/datePeriods";
import {
  productBrandName,
  productDisplayName,
  productVolumeLabel,
} from '@/lib/master/productIdentity';

// Shared formatting helpers — single source of truth for money/date display
// so every page renders THB and dates identically.
//
// ── System-wide format rules (Change Request 2026-07-07) ────────────────────
// เงิน: เต็ม = ทศนิยม 2 ตำแหน่งเสมอ (fmtMoney) หรือย่อ x.xxK / x.xxM (fmtMoneyCompact).
// วันที่: ค.ศ. (คริสต์ศักราช) เท่านั้น — ห้าม พ.ศ. อีกต่อไป. รูปแบบที่อนุญาต:
//   • DD/MM/YYYY (fmtDate, ค่าเริ่มต้น) / DD/MM/YY (fmtDate ..{short}) — fmtDateNumeric
//   • YYYY-MM (fmtYearMonth) สำหรับระดับเดือน
//   • DD/MM/YYYY HH:MM (fmtDateTime) เมื่อต้องการเวลา
// อย่า format เงิน/วันที่เองด้วย toLocaleString/toLocaleDateString — import จากไฟล์นี้เสมอ.

// เงินเต็ม: ฿ + ทศนิยม 2 ตำแหน่งเสมอ (เช่น "฿1,234.50").
export const fmtMoney = (amount) =>
  (Number(amount) || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

// Plain numeric formats for tables and editable controls. Keep the currency
// symbol in labels/headers when the field already makes the unit clear.
export const fmtNumber = (amount, { minimumFractionDigits = 0, maximumFractionDigits = 2 } = {}) =>
  (Number(amount) || 0).toLocaleString("th-TH", {
    minimumFractionDigits,
    maximumFractionDigits,
  });

export const fmtPercent = (amount, fractionDigits = 2) =>
  `${fmtNumber(amount, { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits })}%`;

// Accept formatted user input without leaking presentation characters into API
// payloads. A lone minus/dot is treated as an incomplete edit, not as zero.
export const parseNumberInput = (value) => {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const normalized = String(value ?? "").replace(/,/g, "").trim();
  if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

export const formatMoneyInput = (value) => {
  const parsed = parseNumberInput(value);
  if (parsed == null) return "";
  return fmtNumber(parsed, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export const formatMoneyInputWhileTyping = (value) => {
  const raw = String(value ?? "").replace(/,/g, "");
  if (!raw) return "";
  const sign = raw.startsWith("-") ? "-" : "";
  const unsigned = sign ? raw.slice(1) : raw;
  const [integer = "", decimal] = unsigned.split(".");
  const grouped = (integer || "0").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}${grouped}${decimal !== undefined ? `.${decimal.slice(0, 2)}` : ""}`;
};

// ── ปี พ.ศ. ↔ ค.ศ. ─────────────────────────────────────────────────────
//
// ⭐ **ที่เก็บเป็น ค.ศ. เสมอ** (ISO `YYYY-MM-DD`) — พ.ศ. เป็นเรื่องของ *การแสดงผล
// และการกรอก* เท่านั้น · ห้ามเขียน พ.ศ. ลงฐานหรือส่งขึ้น API เด็ดขาด ไม่งั้นแถวที่
// เขียนคนละยุคจะเรียงลำดับและเทียบกันไม่ได้ โดยไม่มีอะไรฟ้อง
//
// ใช้ที่ไหน: ฟอร์มที่ **กระดาษสั่งให้เป็น พ.ศ.** เช่น "วันที่มีผล" ของเอกสารควบคุม
// (ตั้งค่า → มาตรฐานเอกสาร) ซึ่งพิมพ์ลงหัวกระดาษเป็น พ.ศ. อยู่แล้ว ⇒ ถ้าช่องกรอก
// เป็น ค.ศ. คนกรอกจะเห็นเลขเด้งไป 543 ปีตอนบันทึก
// ⚠️ **ไม่ใช่ค่าตั้งต้นของระบบ** — ที่อื่นทั้งหมดยังเป็น ค.ศ. (มติผู้ใช้ 2026-08-10
// ให้ครอบแค่หน้ามาตรฐานเอกสาร) อย่าเผลอเปลี่ยนเป็น BE ทั้งระบบจากจุดนี้
export const BUDDHIST_YEAR_OFFSET = 543;

const shiftDisplayYear = (display, delta) => {
  const match = String(display || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return display;
  return `${match[1]}/${match[2]}/${Number(match[3]) + delta}`;
};

export const isoDateToDisplay = (value, { era = "CE" } = {}) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "";
  const display = `${match[3]}/${match[2]}/${match[1]}`;
  return era === "BE" ? shiftDisplayYear(display, BUDDHIST_YEAR_OFFSET) : display;
};

export const displayDateToIso = (value, { era = "CE" } = {}) => {
  // แปลงปีกลับเป็น ค.ศ. ก่อนตรวจความถูกต้อง — ไม่งั้น 29/02/2567 (ปีอธิกสุรทิน
  // ในปฏิทิน พ.ศ. คือ ค.ศ. 2024) จะถูกตัดทิ้งเพราะ 2567 ไม่ใช่ปีอธิกสุรทิน
  const normalized = era === "BE" ? shiftDisplayYear(value, -BUDDHIST_YEAR_OFFSET) : value;
  const match = String(normalized || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (date.getUTCFullYear() !== Number(yyyy) || date.getUTCMonth() + 1 !== Number(mm) || date.getUTCDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
};

// เงินแบบย่อ: ฿ + x.xxK (พัน) / x.xxM (ล้าน); ต่ำกว่าพันแสดงเต็ม 2 ทศนิยม.
// ใช้ในที่แคบ เช่น KPI card / กราฟ / แดชบอร์ด ที่ตัวเลขยาวเกินไป.
//
// 🐞 **ขอบต้องเทียบ "หลังปัด" ไม่ใช่ก่อนปัด** — เดิมเช็ก `abs >= 1e6` ก่อน แล้วค่อย
// `(abs/1e3).toFixed(2)` ⇒ 999,999 ไม่ถึงล้าน ตกอยู่ชั้น K แล้วปัดขึ้นเป็น
// **"฿1000.00K"** (ควรอ่านว่า ฿1.00M) · ช่วง 9xx,xxx คือยอดเป้า/ยอด Won ที่เกิดจริง
// ทุกเดือน และตัวนี้คือ formatter ย่อกลางของ KPI card + หน้าตั้งเป้า + แดชบอร์ดผลงาน
// จึงย้ายขอบมาที่ค่าที่ "ปัดแล้วได้ 1000.00" พอดี: 999,995 และ 999.995
const COMPACT_M = 999_995;   // ต่ำกว่านี้ (abs/1e6).toFixed(2) ยังไม่ถึง "1.00"
const COMPACT_K = 999.995;   // ต่ำกว่านี้ (abs/1e3).toFixed(2) ยังไม่ถึง "1.00"

export const fmtMoneyCompact = (amount) => {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  // ⚠️ ไม่มีหน่วยเหนือ M — พันล้านขึ้นไปจึงคั่นหลักพันในตัวเลขแทน ("฿1,000.00M")
  // ไม่ใช่ "฿1000.00M" ที่อ่านผิดเป็นหลักหมื่นล้านได้
  if (abs >= COMPACT_M) return `${sign}฿${fmtNumber(abs / 1e6, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}M`;
  if (abs >= COMPACT_K) return `${sign}฿${(abs / 1e3).toFixed(2)}K`;
  return fmtMoney(n);
};

// Date-only (no time) → DD/MM/YYYY (ค.ศ.); {short:true} → DD/MM/YY.
// ทนต่อ null และสตริงที่ format มาแล้ว (คืนค่าเดิมถ้าจับรูปไม่ได้).
/* ── ทุกอย่างบนจอเป็น "เวลาไทย" ────────────────────────────────────────────
   🐞 **บั๊กจริง (พบ 2026-08-26 ตอนตี 3):** `fmtDate(createdAt)` ขึ้น 25/08 ทั้งที่
   เวลาไทยเป็นวันที่ 26 แล้ว — ตัวเดิมตัดตัวอักษรจากสตริง ISO ตรง ๆ ซึ่งคือ **วันแบบ UTC**
   ⇒ ทุกวันช่วงเที่ยงคืนถึง 7 โมงเช้า วันที่บนจอย้อนหลังไปหนึ่งวันทั้งระบบ

   ที่แย่กว่าคือ **ตัวจัดรูปแต่ละตัวใช้นาฬิกาคนละเรือน**: `fmtDate` ใช้ UTC ส่วน
   `fmtDateTime`/`fmtDayMonth` ใช้นาฬิกาเครื่อง ⇒ ค่าเดียวกันบนจอเดียวกันอ่านได้คนละวัน
   และไม่ตรงกับหลังบ้านซึ่งคิดด้วยวันไทยทั้งหมด (SLA · KPI · ตีกลับอัตโนมัติ · เดือน Actual)

   กติกาเดียวจากนี้: **จุดเวลา → วันไทยเสมอ** (ผ่าน `businessDayKey` ตัวเดียวกับหลังบ้าน)
   ⚠️ ยกเว้นสตริงที่ **ไม่มีเวลาเลย** ("2026-08-14") ซึ่งเป็น *วันในปฏิทิน* ไม่ใช่จุดเวลา
   ห้ามขยับโซนให้ ไม่งั้นวันเกิด/วันครบกำหนดจะเลื่อนไปมาตามเครื่องที่เปิดดู */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
/* ISO ที่ไม่ได้บอกโซนเวลา — `Date.parse` จะตีความเป็น **เวลาเครื่อง** ตามสเปก
   ⇒ ค่าเดียวกันได้คนละวันบนเครื่องคนละโซน · เติม Z ให้เป็น UTC เหมือนที่ฝั่ง server
   (Vercel รันด้วย UTC) อ่าน จะได้ตรงกันทั้งสองฝั่ง
   หมายเหตุ: ตารางทั้งระบบเป็น `timestamptz` ทั้งหมด (ไม่มี `timestamp` เปล่าเลยสักคอลัมน์)
   สตริงไร้โซนจึงมาจากค่าที่ประกอบเองในโค้ด ไม่ใช่จากฐานข้อมูล */
const NAKED_ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/** ทำให้ค่าที่รับมาเป็นสตริง ISO ที่อ่านได้แน่นอน — รับ Date / epoch ms / สตริง
 *  🐞 เคยพลาด: ส่ง `Date` หรือ epoch ms เข้ามาแล้วตกไปที่ `String(value)` ⇒ จอขึ้น
 *  เลข 13 หลักแทนวันที่ (ของเดิมรับได้เพราะเรียก `new Date(value)` ตรง ๆ) */
const toIso = (value) => {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (typeof value === "number") return Number.isFinite(value) ? new Date(value).toISOString() : null;
  const text = String(value);
  return NAKED_ISO.test(text) ? `${text}Z` : text;
};

const thaiParts = (value) => {
  if (value == null || value === "") return null;
  const iso = toIso(value);
  if (iso == null) return null;
  const bare = iso.match(DATE_ONLY);
  const day = bare ? bare[0] : businessDayKey(iso);
  if (!day) return null;
  const [yyyy, mm, dd] = day.split("-");
  return { yyyy, mm, dd, year: Number(yyyy), monthIndex: Number(mm) - 1, dayOfMonth: Number(dd) };
};

/* เวลาของค่าเดียวกัน — ต้องมาจาก `businessTimeKey` เท่านั้น ไม่ใช่ `d.getHours()`
   ไม่งั้นวันมาจากนาฬิกาไทยแต่เวลามาจากนาฬิกาเครื่อง */
const thaiTime = (value) => {
  const iso = toIso(value);
  return iso == null ? null : businessTimeKey(iso);
};

export const fmtDate = (value, { short = false } = {}) => fmtDateNumeric(value, { short });

// Date + time → DD/MM/YYYY HH:MM (ค.ศ., 24 ชม.).
export const fmtDateTime = (value) => {
  if (!value) return "-";
  const time = thaiTime(value);
  if (!time) return String(value);
  return `${fmtDateNumeric(value)} ${time}`;
};

// Date + time แบบสั้น → DD/MM HH:MM (ไม่มีปี) สำหรับคอลัมน์แคบ เช่น หัวแถวเธรด
// ⚠️ คู่กับ `title={fmtDateTime(v)}` เสมอ — ปีหายจากหน้าจอได้ แต่ต้องยังหาเจอเมื่อ
// ต้องการ · ไม่ใช้เวลาแบบ "2 ชม.ที่แล้ว" เพราะต้องอ่านนาฬิกาตอน render ซึ่งผิดกฎ
// react-hooks/purity (ดูแพตเทิร์น nowMs ในหน้าดีล)
export const fmtDayTime = (value) => {
  if (!value) return "-";
  const parts = thaiParts(value);
  const time = thaiTime(value);
  if (!parts || !time) return String(value);
  return `${parts.dd}/${parts.mm} ${time}`;
};

// Time is always rendered as 24-hour HH:mm. This also normalizes editable
// values such as "9", "930" and "9:30" without relying on browser locale.
export const normalizeTime = (value) => {
  const text = String(value || "").trim();
  let hourText;
  let minuteText;
  if (text.includes(":")) {
    const match = text.match(/^(\d{1,2}):(\d{1,2})$/);
    if (!match) return null;
    [, hourText, minuteText] = match;
  } else if (/^\d{1,4}$/.test(text)) {
    hourText = text.length <= 2 ? text : text.slice(0, -2);
    minuteText = text.length <= 2 ? "0" : text.slice(-2);
  } else {
    return null;
  }
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};

export const fmtTime = (value) => {
  if (!value) return "-";
  const direct = normalizeTime(String(value).slice(0, 5));
  if (direct) return direct;
  return thaiTime(value) || String(value);
};

// ระดับเดือน → YYYY-MM (ค.ศ.). รับ Date / ISO / "YYYY-MM" / "YYYY-MM-DD".
export const fmtYearMonth = (value) => {
  if (!value) return "-";
  // "2026-07" = ค่างวดเดือนอยู่แล้ว ไม่ใช่จุดเวลา — ห้ามตีความใหม่
  const monthOnly = String(value).match(/^(\d{4})-(\d{2})$/);
  if (monthOnly) return `${monthOnly[1]}-${monthOnly[2]}`;
  /* 🐞 ของเดิมจับ /^(\d{4})-(\d{2})/ ซึ่งกินสตริง ISO เต็มด้วย ⇒ ได้ **เดือนแบบ UTC**
     ใบที่อนุมัติ 31 ก.ค. สามทุ่มไทย (14:00Z) ยังพอไหว แต่ 1 ส.ค. ตี 2 ไทย (31 ก.ค. 19:00Z)
     จะถูกนับเป็นเดือน ก.ค. ⇒ ขัดกับหลังบ้านที่คิดเดือน Actual จากเวลาไทย (mig 0279) */
  const parts = thaiParts(value);
  return parts ? `${parts.yyyy}-${parts.mm}` : String(value);
};

// ── Display-format standards (Change Request §2) ─────────────────────────
// มาตรฐานการแสดงผลทั้งระบบ: ชื่อย่อ / เบอร์โทร / เลขบัตร / วันที่ / เดือน-ปี.
// ทุกตัวเป็น pure function ทนต่อค่า null/รูปแบบที่กรอกมั่ว (คืนค่าเดิมถ้าจับรูปไม่ได้).

const EN_MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const TH_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// ชื่อ + นามสกุลย่อ → "Sittipong K." (§2.1). รับได้ทั้ง object ผู้ใช้
// ({firstName,lastName,name,email}) และสตริงชื่อเต็ม (เช่น aeOwner ที่เก็บเป็นชื่อเต็ม).
const abbreviateFullName = (full) => {
  const s = String(full || "").trim();
  if (!s) return "";
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0];
  const last = parts[parts.length - 1];
  return `${parts.slice(0, -1).join(" ")} ${last.charAt(0).toUpperCase()}.`;
};
export const fmtName = (input) => {
  if (!input) return "";
  if (typeof input === "string") return abbreviateFullName(input);
  const fn = String(input.firstName || "").trim();
  const ln = String(input.lastName || "").trim();
  if (fn || ln) return ln ? `${fn} ${ln.charAt(0).toUpperCase()}.`.trim() : fn;
  return abbreviateFullName(input.name) || String(input.email || "").trim();
};

// Compatibility exports ทั้งระบบใช้กฎเดียว: ชื่อสินค้า TH ก่อน แล้วค่อย EN.
export const productName = productDisplayName;
export const productNameBoth = productDisplayName;

// "แบรนด์ · ขนาด" hint for product pickers so lookalike SKUs (same product,
// different pack size / brand line) are easy to tell apart. Keeps volume 0
// (a real size) — only null/undefined/"" is treated as missing.
export const productMeta = (p) =>
  [productBrandName(p), productVolumeLabel(p)]
    .filter(Boolean)
    .join(" · ");

// เบอร์โทร (§2.2): มือถือ 10 หลัก → xxx-xxx-xxxx, บ้าน 9 หลัก → xx-xxx-xxxx.
// รูปแบบอื่นคืนค่าเดิม (ไม่ดัดแปลงเลขที่จับรูปไม่ได้).
export const fmtPhone = (raw) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return raw ? String(raw) : "";
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return String(raw);
};

export const formatPhoneInput = (raw) => {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const landline = /^0[23457]/.test(digits);
  const d = digits.slice(0, landline ? 9 : 10);
  const groups = landline ? [2, 3, 4] : [3, 3, 4];
  const parts = [];
  let offset = 0;
  for (const size of groups) {
    if (offset >= d.length) break;
    parts.push(d.slice(offset, offset + size));
    offset += size;
  }
  return parts.join("-");
};

// เลขประจำตัวประชาชน/ผู้เสียภาษี 13 หลัก (§2.3) → x-xxxx-xxxxx-xx-x.
export const fmtNationalId = (raw) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length !== 13) return raw ? String(raw) : "";
  return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
};

export const formatNationalIdInput = (raw) => {
  const d = String(raw ?? "").replace(/\D/g, "").slice(0, 13);
  const groups = [1, 4, 5, 2, 1];
  const parts = [];
  let offset = 0;
  for (const size of groups) {
    if (offset >= d.length) break;
    parts.push(d.slice(offset, offset + size));
    offset += size;
  }
  return parts.join("-");
};

// วันที่แบบตัวเลข (§2.4): กว้าง = DD/MM/YYYY, แคบ = DD/MM/YY (ปี ค.ศ.).
export const fmtDateNumeric = (value, { short = false } = {}) => {
  if (!value) return "-";
  /* 🐞 ของเดิมจับ /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/ — `(?:$|T)` ทำให้ **สตริงเวลาเต็ม
     ถูกอ่านเป็นวันในปฏิทิน** แล้วตัดตัวอักษรมาใช้ตรง ๆ ซึ่งคือวันแบบ UTC
     ตอนนี้เหลือเฉพาะรูปที่ไม่มีเวลาเลย ส่วนจุดเวลาเดินผ่าน `businessDayKey` (ดู thaiParts) */
  const parts = thaiParts(value);
  if (!parts) return String(value);
  const { dd, mm, yyyy } = parts;
  return short ? `${dd}/${mm}/${yyyy.slice(-2)}` : `${dd}/${mm}/${yyyy}`;
};

// เดือน/ปี (§2.5): "Jul 26" / "ก.ค. 26" (ปี ค.ศ. 2 หลัก).
export const fmtMonthYear = (value, { locale = "en" } = {}) => {
  if (!value) return "-";
  const parts = thaiParts(value);
  if (!parts) return String(value);
  const m = locale === "th" ? TH_MONTHS_SHORT[parts.monthIndex] : EN_MONTHS_SHORT[parts.monthIndex];
  return `${m} ${parts.yyyy.slice(-2)}`;
};

// วัน + เดือนย่อ ไม่มีปี: "14 ส.ค." / "14 Aug" — หัวคอลัมน์ปฏิทินและบอร์ดรายสัปดาห์
//
// ⚠️ **ตั้งต้นเป็นไทย** ต่างจาก `fmtMonthYear`/`fmtDayMonthYear` ที่ตั้งต้นอังกฤษ —
// ที่ใช้จริงคือหัวคอลัมน์วันของบอร์ดผลิต/ตารางบริการ ซึ่งเดิมเรียก
// `toLocaleDateString("th-TH", …)` เอง (กวาดเข้ามา 2026-08-11) · เปลี่ยนค่าตั้งต้น
// เมื่อไรหัวตารางสี่หน้านั้นจะพลิกภาษาพร้อมกันโดยไม่มีใครตั้งใจ
export const fmtDayMonth = (value, { locale = "th" } = {}) => {
  if (!value) return "-";
  const parts = thaiParts(value);
  if (!parts) return String(value);
  const m = locale === "th" ? TH_MONTHS_SHORT[parts.monthIndex] : EN_MONTHS_SHORT[parts.monthIndex];
  return `${parts.dayOfMonth} ${m}`;
};

// เดือนย่ออย่างเดียว: "ส.ค." / "Aug" — ใช้กับช่วงวันที่ที่เขียนเดือนครั้งเดียว
// ("1 ส.ค. – 7 ส.ค. 2026") ซึ่งวันกับปีถูกประกอบข้างนอก
export const fmtMonthShort = (value, { locale = "th" } = {}) => {
  if (!value) return "-";
  const parts = thaiParts(value);
  if (!parts) return String(value);
  return locale === "th" ? TH_MONTHS_SHORT[parts.monthIndex] : EN_MONTHS_SHORT[parts.monthIndex];
};

// วัน เดือน ปี (§2.6): "25 Jul 26" / "25 ก.ค. 26" (ปี ค.ศ. 2 หลัก).
export const fmtDayMonthYear = (value, { locale = "en" } = {}) => {
  if (!value) return "-";
  const parts = thaiParts(value);
  if (!parts) return String(value);
  const m = locale === "th" ? TH_MONTHS_SHORT[parts.monthIndex] : EN_MONTHS_SHORT[parts.monthIndex];
  return `${parts.dayOfMonth} ${m} ${parts.yyyy.slice(-2)}`;
};

/* ── ค่าว่างทั้งระบบพูดคำเดียวกัน: ขีด `—` ────────────────────────────────
   (มติผู้ใช้ 2026-08-17 — กลับคำจากมติ 2026-08-14 ที่เคยให้ขึ้น `N/A`)

   กฎ "หนึ่งคำสำหรับค่าว่าง" ยังอยู่เหมือนเดิม เปลี่ยนแค่ *คำ* ที่ใช้:
   `N/A` ดังเกินไปสำหรับช่องที่แค่ยังไม่ได้กรอก ⇒ ตารางเต็มไปด้วยตัวอักษรที่อ่านสะดุด
   จนบดบังแถวที่มีค่าจริง · ขีดจาง ๆ ทำให้ตาไหลข้ามช่องว่างไปหาข้อมูลได้เร็วกว่า

   ⚠️ **`—` (em dash U+2014) ตัวเดียวเท่านั้น** — ห้ามเขียน `-` `–` `.` ปนกลับเข้ามา
   เหตุผลเดิมยังใช้ได้: ตารางเดียวกันไม่ควรเห็นค่าว่างหลายหน้าตาในแถวเดียว
   (ตรวจ 2026-08-14 ตอนรวมครั้งแรก: 355 จุด 114 ไฟล์) · `audit:ui` ยังกันขีดดิบอยู่

   ⚠️ **เอกสาร PDR ไม่อยู่ในกฎนี้** — กระดาษ (และหน้ารายละเอียดที่ต้องตรงกับกระดาษ)
   ยังพิมพ์ `N/A` ตามมติ ม-53 (2026-08-07) เพราะ RD อ่านแล้วต้องรู้ว่า *ถามแล้วไม่มีคำตอบ*
   ไม่ใช่ลืมพิมพ์ · ดู `lib/requests/pdrDocument.js` กับ `components/requests/PdrSummary.js`

   ⚠️ **ใช้กับ "ที่แสดงผล" เท่านั้น** — ตาราง · หน้ารายละเอียด · ช่องที่ readOnly ·
   **ห้ามเอาไปใส่ `value` ของช่องที่พิมพ์ได้** เพราะจะถูกบันทึกลง DB เป็นข้อความจริง
   แล้วแยกไม่ออกว่า "ไม่มีข้อมูล" หรือ "คนพิมพ์ขีดมา" · ช่องกรอกที่ยังว่าง
   บอกด้วย `placeholder` ตามเดิม */

export const NA = "—";

/* ⚠️ **`0` และ `false` ไม่ใช่ค่าว่าง** — ยอด 0 บาท จำนวน 0 ชิ้น "ไม่อนุมัติ" คือคำตอบ
   ไม่ใช่การไม่มีคำตอบ · `NaN` นับเป็นว่างเพราะมันคือ "คำนวณไม่ได้"
   ขีด/จุดเดี่ยว ๆ นับเป็นว่างด้วย เพราะเป็นสิ่งที่ระบบเก่าเขียนแทนคำว่า "ไม่มี"
   ⚠️ `N/A` ยังต้องนับเป็นว่างต่อไป — ช่วงที่กฎ 14/08 มีผล มีข้อมูลที่ถูกพิมพ์/นำเข้า
   เป็นคำว่า N/A จริง ๆ ถ้าเลิกนับ มันจะโผล่เป็นค่าจริงในตารางแทนที่จะเป็นขีด */
export const isBlank = (value) => {
  if (value === null || value === undefined) return true;
  if (typeof value === "number") return Number.isNaN(value);
  if (typeof value === "boolean") return false;
  if (Array.isArray(value)) return value.length === 0;
  const text = String(value).trim();
  return text === "" || text === "-" || text === "–" || text === "—" || text === "."
    || text.toUpperCase() === "N/A";
};

/* คืนค่าเดิมถ้ามีของ · คืน `—` ถ้าว่าง — ตัวที่ใช้แทน `foo || "-"` ทุกจุด
   ⚠️ `foo || NA` ใช้แทนกันไม่ได้ เพราะ `0` กับ `false` จะกลายเป็นขีดไปด้วย */
export const naText = (value) => (isBlank(value) ? NA : value);

/* จำนวนเงินที่ **ยังไม่มีคนกรอก** ต้องเป็นขีด ไม่ใช่ `฿0.00`
   🐞 `fmtMoney(null)` คืน `฿0.00` (มี `Number(x) || 0` อยู่ข้างใน) ⇒ ราคาที่ยังไม่ตั้ง
      กับราคาที่ตั้งไว้เป็นศูนย์ **หน้าตาเหมือนกันเป๊ะ** · บนทะเบียนสินค้ามีของจริงทั้งสอง
      แบบปนกัน (ราคาผลิต: ว่าง 10 · ศูนย์ 4 · ราคาขายปลีก: ว่าง 252) ⇒ คนอ่านตาราง
      เข้าใจว่า "ตั้งราคาไว้ศูนย์บาท" ทั้งที่ยังไม่เคยมีใครกรอก
   ⚠️ `0` ยังเป็น `฿0.00` เหมือนเดิม — ศูนย์บาทคือคำตอบ ไม่ใช่การไม่มีคำตอบ (ดู isBlank)
   ⚠️ ใช้กับ "ราคาที่คนกรอก" · ยอดที่ระบบคำนวณเองแล้วออกมาเป็น 0 ให้ใช้ fmtMoney ตามเดิม */
export const fmtMoneyOrDash = (amount) => (isBlank(amount) ? NA : fmtMoney(amount));
