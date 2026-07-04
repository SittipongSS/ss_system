// Shared formatting helpers — single source of truth for money/date display
// so every page renders THB and Thai dates identically.

export const fmtMoney = (amount) =>
  (amount || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  });

// Date-only (no time), tolerant of null / plain date strings.
export const fmtDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value; // already a display string
  return d.toLocaleDateString("th-TH", { year: "numeric", month: "short", day: "numeric" });
};

// Date + time.
export const fmtDateTime = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString("th-TH");
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

// ชื่อสินค้าสำหรับแสดงผล (ทั้งเว็บ) — อังกฤษก่อน ถ้าไม่มีค่อยไทย (migration 0059).
export const productName = (p) => (p?.productDescriptionEn || p?.productDescription || "").trim();

// เบอร์โทร (§2.2): มือถือ 10 หลัก → xxx-xxx-xxxx, บ้าน 9 หลัก → xx-xxx-xxxx.
// รูปแบบอื่นคืนค่าเดิม (ไม่ดัดแปลงเลขที่จับรูปไม่ได้).
export const fmtPhone = (raw) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (!d) return raw ? String(raw) : "";
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  return String(raw);
};

// เลขประจำตัวประชาชน/ผู้เสียภาษี 13 หลัก (§2.3) → x-xxxx-xxxxx-xx-x.
export const fmtNationalId = (raw) => {
  const d = String(raw ?? "").replace(/\D/g, "");
  if (d.length !== 13) return raw ? String(raw) : "";
  return `${d[0]}-${d.slice(1, 5)}-${d.slice(5, 10)}-${d.slice(10, 12)}-${d[12]}`;
};

// วันที่แบบตัวเลข (§2.4): กว้าง = DD/MM/YYYY, แคบ = DD/MM/YY (ปี ค.ศ.).
export const fmtDateNumeric = (value, { short = false } = {}) => {
  if (!value) return "-";
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
