import { brandLabel } from '@/lib/master/brands';

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
// null/undefined = "ไม่มีข้อมูล" → "—" (ไม่ใช่ ฿0.00 ซึ่งแปลว่า "ศูนย์บาท") — สำคัญกับ
// role ที่ฟิลด์เงินถูกตัดจาก server (redactDealMoney): ทุกหน้าจะโชว์ — โดยอัตโนมัติ.
export const fmtMoney = (amount) => {
  if (amount == null) return "—";
  return (Number(amount) || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
};

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

export const isoDateToDisplay = (value) => {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : "";
};

export const displayDateToIso = (value) => {
  const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const date = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
  if (date.getUTCFullYear() !== Number(yyyy) || date.getUTCMonth() + 1 !== Number(mm) || date.getUTCDate() !== Number(dd)) return null;
  return `${yyyy}-${mm}-${dd}`;
};

// เงินแบบย่อ: ฿ + x.xxK (พัน) / x.xxM (ล้าน); ต่ำกว่าพันแสดงเต็ม 2 ทศนิยม.
// ใช้ในที่แคบ เช่น KPI card / กราฟ / แดชบอร์ด ที่ตัวเลขยาวเกินไป.
export const fmtMoneyCompact = (amount) => {
  if (amount == null) return "—"; // เหตุผลเดียวกับ fmtMoney: ไม่มีข้อมูล ≠ ศูนย์บาท
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return `${sign}฿${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}฿${(abs / 1e3).toFixed(2)}K`;
  return fmtMoney(n);
};

// Date-only (no time) → DD/MM/YYYY (ค.ศ.); {short:true} → DD/MM/YY.
// ทนต่อ null และสตริงที่ format มาแล้ว (คืนค่าเดิมถ้าจับรูปไม่ได้).
export const fmtDate = (value, { short = false } = {}) => fmtDateNumeric(value, { short });

// Date + time → DD/MM/YYYY HH:MM (ค.ศ., 24 ชม.).
export const fmtDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  return `${fmtDateNumeric(d)} ${hh}:${mi}`;
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
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

// ระดับเดือน → YYYY-MM (ค.ศ.). รับ Date / ISO / "YYYY-MM" / "YYYY-MM-DD".
export const fmtYearMonth = (value) => {
  if (!value) return "-";
  // "2026-07" หรือ "2026-07-xx" — ตัดเอา YYYY-MM ตรง ๆ กัน timezone เพี้ยน.
  const m = String(value).match(/^(\d{4})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}`;
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
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

// ชื่อสินค้าสำหรับแสดงผลระบบทั่วไป — อังกฤษก่อน ถ้าไม่มีค่อยไทย (migration 0059).
export const productName = (p) => (p?.productDescriptionEn || p?.productDescription || "").trim();

// ชื่อสินค้าสำหรับ "หน้า /database" — โชว์ทั้งสองภาษา EN · TH (มีอย่างเดียว → อันนั้น).
export const productNameBoth = (p) => {
  const e = (p?.productDescriptionEn || "").trim();
  const t = (p?.productDescription || "").trim();
  if (e && t) return `${e} · ${t}`;
  return e || t;
};

// "แบรนด์ · ขนาด" hint for product pickers so lookalike SKUs (same product,
// different pack size / brand line) are easy to tell apart. Keeps volume 0
// (a real size) — only null/undefined/"" is treated as missing.
export const productMeta = (p) =>
  [brandLabel(p?.brandName, p?.brandNameEn), p?.volume != null && p?.volume !== "" ? `${p.volume}${p?.volumeUnit || ""}` : null]
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
  // Date-only strings represent a calendar date, not a moment in time. Parsing
  // them with new Date("YYYY-MM-DD") applies UTC semantics and can render the
  // previous day in negative timezones, so format their parts directly.
  const dateOnly = String(value).match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if (dateOnly) {
    const [, yyyy, mm, dd] = dateOnly;
    return short ? `${dd}/${mm}/${yyyy.slice(-2)}` : `${dd}/${mm}/${yyyy}`;
  }
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return short ? `${dd}/${mm}/${String(yyyy).slice(-2)}` : `${dd}/${mm}/${yyyy}`;
};

// เดือน/ปี (§2.5): "Jul 26" / "ก.ค. 26" (ปี ค.ศ. 2 หลัก).
export const fmtMonthYear = (value, { locale = "en" } = {}) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const m = locale === "th" ? TH_MONTHS_SHORT[d.getMonth()] : EN_MONTHS_SHORT[d.getMonth()];
  return `${m} ${String(d.getFullYear()).slice(-2)}`;
};

// วัน เดือน ปี (§2.6): "25 Jul 26" / "25 ก.ค. 26" (ปี ค.ศ. 2 หลัก).
export const fmtDayMonthYear = (value, { locale = "en" } = {}) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return String(value);
  const m = locale === "th" ? TH_MONTHS_SHORT[d.getMonth()] : EN_MONTHS_SHORT[d.getMonth()];
  return `${d.getDate()} ${m} ${String(d.getFullYear()).slice(-2)}`;
};
