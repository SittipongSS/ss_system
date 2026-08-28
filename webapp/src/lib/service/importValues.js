// ── ตัวแปลงค่าจากชีตเก่า (F-8) ─────────────────────────────────────────────
//
// ⭐ **ที่มา** (docs/service-field-operations.md §8 กับดักข้อมูล): ชีตที่ใช้กันมา
// หลายปีเก็บของหลายอย่างไว้ในคอลัมน์เดียว — `1` `0.5` `500 ML` `2 KG` อยู่
// คอลัมน์เดียวกัน · `รอติดตั้ง` กับ `-` ปนกับจำนวนเครื่อง · ปีเป็น พ.ศ. บ้าง
// ค.ศ. บ้าง ทั้งสองหลักและสี่หลัก
//
// ⚠️ **กติกาที่เด็ดขาดที่สุดของไฟล์นี้: แปลงไม่ได้ต้องบอกว่าแปลงไม่ได้**
// ห้ามเดาแทนคน ห้ามคืน 0 แทน null · ทุกตัวคืนรูป `{ value, issue, raw }` ที่ผู้เรียก
// เอาไปทำรายงาน "แถวที่นำเข้าไม่ได้" ได้ตรง ๆ — ค่าที่เดาไปแล้วไม่มีใครตามเจอ
// อีกเลย ส่วนแถวที่ตกรายงานมีคนแก้ได้จริง

/* ผลลัพธ์มาตรฐานของทุกตัวแปลง */
const okValue = (value) => ({ value, issue: null, raw: null });
const noValue = () => ({ value: null, issue: null, raw: null });
const cantRead = (raw, issue) => ({ value: null, issue, raw: String(raw) });

const clean = (input) => String(input ?? '')
  .replace(/[\u200b\u00a0]/g, ' ')     // zero-width / nbsp ที่ก๊อปมาจาก Excel
  .trim();

/* ค่าที่ชีตใช้แทน "ไม่มี" — เจอจริงทั้งสี่แบบ */
const BLANKS = new Set(['', '-', '–', '—', 'n/a', 'N/A', 'na', 'NA', 'ไม่มี', 'ไม่ระบุ']);
export const isBlankCell = (input) => BLANKS.has(clean(input));

// ── วันที่ ────────────────────────────────────────────────────────────────
//
// ⭐ **กติกาปี** (จุดที่พลาดแล้วข้อมูลเพี้ยนเงียบ ๆ 543 ปี):
//   4 หลัก ≥ 2400 → พ.ศ. ลบ 543        (`2567` → 2024)
//   4 หลัก < 2400 → ค.ศ. ใช้ตรง ๆ      (`2024` → 2024)
//   2 หลัก ≥ 40   → พ.ศ. `25YY` ลบ 543 (`69` → 2569 → 2026 · ใบส่งงาน `01/08/69`)
//   2 หลัก < 40   → ค.ศ. `20YY`        (`24` → 2024)
// เส้นแบ่ง 40 มาจากช่วงที่เป็นไปได้จริง: พ.ศ. 2540–2599 = ค.ศ. 1997–2056 และ
// ค.ศ. 2000–2039 — สองช่วงนี้ไม่ทับกันในเลขสองหลัก
export function normalizeYear(year) {
  const n = Number(year);
  if (!Number.isFinite(n) || n < 0) return null;
  if (n >= 2400) return n - 543;
  if (n >= 1900) return n;
  if (n >= 40 && n <= 99) return 2500 + n - 543;
  if (n >= 0 && n < 40) return 2000 + n;
  return null;
}

const pad = (n) => String(n).padStart(2, '0');

/* วันที่จริงไหม — `31/02` ต้องตกรายงาน ไม่ใช่เลื่อนไปเป็น 3 มี.ค. เงียบ ๆ */
function isoIfReal(year, month, day) {
  if (!(month >= 1 && month <= 12) || !(day >= 1 && day <= 31)) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/* Excel เก็บวันที่เป็นจำนวนวันนับจาก 1899-12-30 (ระบบ 1900 พร้อมบั๊กปี 1900 ของมันเอง) */
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
function fromExcelSerial(serial) {
  const days = Math.floor(serial);
  const date = new Date(EXCEL_EPOCH + days * 86400000);
  return isoIfReal(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

// ปีที่ DB ยอมรับ (CHECK service_assets_dates_sane: 2000-01-01 … 2100-12-31)
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;

/* วันที่จากชีต → 'YYYY-MM-DD' (ค.ศ.) หรือบอกว่าอ่านไม่ออก
   รับ: Date · เลข serial ของ Excel · `01/08/69` · `1/8/2569` · `2024-01-05` · `5 ม.ค. 68` */
export function parseImportDate(input) {
  if (input instanceof Date && !Number.isNaN(input.getTime())) {
    const iso = isoIfReal(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate());
    return iso ? okValue(iso) : cantRead(input, 'อ่านวันที่ไม่ออก');
  }
  const text = clean(input);
  if (isBlankCell(text)) return noValue();

  let iso = null;
  // serial ของ Excel — ต้องเป็นเลขล้วนและอยู่ในช่วงที่เป็นวันที่ได้จริง
  // (ต่ำกว่านี้คือ "จำนวน" ที่หลงมา เช่น `8` ไม่ใช่วันที่ 8 ม.ค. 1900)
  if (/^\d+(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 36526 && serial <= 73415) iso = fromExcelSerial(serial);  // 2000-01-01 … 2100-12-31
    else return cantRead(text, 'ตัวเลขนี้ไม่ใช่วันที่');
  }

  // dd/mm/yyyy · dd-mm-yy · dd.mm.yyyy
  if (!iso) {
    const dmy = text.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
    if (dmy) {
      const year = normalizeYear(dmy[3]);
      if (year) iso = isoIfReal(year, Number(dmy[2]), Number(dmy[1]));
    }
  }
  // yyyy-mm-dd (ค.ศ. หรือ พ.ศ.)
  if (!iso) {
    const ymd = text.match(/^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})$/);
    if (ymd) {
      const year = normalizeYear(ymd[1]);
      if (year) iso = isoIfReal(year, Number(ymd[2]), Number(ymd[3]));
    }
  }
  // `5 ม.ค. 68` / `5 มกราคม 2568`
  if (!iso) {
    const thai = text.match(/^(\d{1,2})\s+([\u0e00-\u0e7f.]+)\s+(\d{2,4})$/);
    if (thai) {
      const month = thaiMonthNumber(thai[2]);
      const year = normalizeYear(thai[3]);
      if (month && year) iso = isoIfReal(year, month, Number(thai[1]));
    }
  }

  if (!iso) return cantRead(text, 'อ่านวันที่ไม่ออก');
  const year = Number(iso.slice(0, 4));
  if (year < MIN_YEAR || year > MAX_YEAR) return cantRead(text, `ปีอยู่นอกช่วง ${MIN_YEAR}–${MAX_YEAR}`);
  return okValue(iso);
}

const THAI_MONTHS = [
  ['ม.ค', 'มกราคม'], ['ก.พ', 'กุมภาพันธ์'], ['มี.ค', 'มีนาคม'], ['เม.ย', 'เมษายน'],
  ['พ.ค', 'พฤษภาคม'], ['มิ.ย', 'มิถุนายน'], ['ก.ค', 'กรกฎาคม'], ['ส.ค', 'สิงหาคม'],
  ['ก.ย', 'กันยายน'], ['ต.ค', 'ตุลาคม'], ['พ.ย', 'พฤศจิกายน'], ['ธ.ค', 'ธันวาคม'],
];
export function thaiMonthNumber(text) {
  const key = clean(text).replace(/\.$/, '');
  for (let i = 0; i < THAI_MONTHS.length; i += 1) {
    if (THAI_MONTHS[i].includes(key) || THAI_MONTHS[i][0] === key) return i + 1;
  }
  return null;
}

// ── ปริมาตร ──────────────────────────────────────────────────────────────
//
// ⭐ คอลัมน์ "ลิตร/เดือน" ในชีตมีทั้ง `1` `0.5` `500 ML` `300 ML` `3 L` และ `2 KG`
//   - เลขเปล่า = **ลิตร** (ตามชื่อคอลัมน์) → ×1000
//   - มีหน่วยกำกับ = เชื่อหน่วยที่เขียน
//   - 🔴 **กิโลกรัมแปลงไม่ได้** — ความหนาแน่นของน้ำหอมแต่ละสูตรไม่เท่ากัน
//     เดาเป็น 1 kg = 1000 ml คือการแต่งตัวเลขขึ้นมาเอง ⇒ ตกรายงานให้คนตัดสิน
export function parseVolumeMl(input, { bareUnit = 'l' } = {}) {
  const text = clean(input);
  if (isBlankCell(text)) return noValue();

  const match = text.match(/^([\d.,]+)\s*([a-zA-Zก-๙.]*)$/);
  if (!match) return cantRead(text, 'อ่านปริมาตรไม่ออก');

  const amount = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return cantRead(text, 'ปริมาตรต้องเป็นจำนวนบวก');

  const unit = (match[2] || bareUnit).toLowerCase().replace(/\./g, '');
  if (unit === 'kg' || unit === 'กก' || unit === 'กิโลกรัม' || unit === 'g' || unit === 'กรัม') {
    return cantRead(text, 'หน่วยน้ำหนัก แปลงเป็นมิลลิลิตรไม่ได้ (ความหนาแน่นต่างกันตามสูตร)');
  }
  const factor = { ml: 1, มล: 1, มิลลิลิตร: 1, l: 1000, ลิตร: 1000, ล: 1000, cc: 1 }[unit];
  if (!factor) return cantRead(text, `ไม่รู้จักหน่วย “${match[2]}”`);

  const ml = Math.round(amount * factor);
  if (ml <= 0) return cantRead(text, 'ปริมาตรต้องเป็นจำนวนบวก');
  return okValue(ml);
}

// ── จำนวนนับ ─────────────────────────────────────────────────────────────
//
// ⭐ คอลัมน์จำนวนเครื่องมี `รอติดตั้ง` และ `-` ปนกับตัวเลข · `รอติดตั้ง` ไม่ใช่
//   ข้อผิดพลาด มันคือ **สถานะ** ⇒ คืน note ไว้ให้ผู้เรียกเอาไปตั้งสถานะเครื่อง
const PENDING_WORDS = ['รอติดตั้ง', 'รอติดตั้งเครื่อง', 'ยังไม่ติดตั้ง', 'รอ'];

export function parseCount(input) {
  const text = clean(input);
  if (isBlankCell(text)) return noValue();
  if (PENDING_WORDS.includes(text)) return { value: null, issue: null, raw: text, note: 'รอติดตั้ง' };

  const numeric = text.replace(/,/g, '');
  if (!/^\d+(\.0+)?$/.test(numeric)) return cantRead(text, 'จำนวนไม่ใช่ตัวเลขจำนวนเต็ม');
  const n = Number(numeric);
  if (!Number.isFinite(n) || n < 0) return cantRead(text, 'จำนวนต้องไม่ติดลบ');
  if (n > 999) return cantRead(text, 'จำนวนเกิน 999 — น่าจะกรอกผิดช่อง');
  return okValue(Math.round(n));
}

/* จำนวนแพ็คมีทศนิยมได้ (Package SM 2 = STD 1 ⇒ SM เลขคี่ให้ครึ่งแพ็ค) */
export function parsePacks(input) {
  const text = clean(input);
  if (isBlankCell(text)) return noValue();
  const numeric = text.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(numeric)) return cantRead(text, 'จำนวนแพ็คไม่ใช่ตัวเลข');
  const n = Number(numeric);
  if (!(n > 0)) return cantRead(text, 'จำนวนแพ็คต้องมากกว่า 0');
  return okValue(n);
}

/* สูตรแพ็คที่หัวชีตเขียนไว้เอง: `Package SM 2 = Package STD 1`
   ⭐ ตรวจกับชีตจริงแล้ว **ถูกทั้ง 167/167 แถว ไม่มีข้อยกเว้น** (doc §2.1) */
export function packStdEquivalent(std, small) {
  const a = Number(std) || 0;
  const b = Number(small) || 0;
  const total = a + b / 2;
  return total > 0 ? total : null;
}

// ── ค่าตั้งเครื่อง ────────────────────────────────────────────────────────
//
// `30/225` = พ่น 30 วินาที พัก 225 วินาที · ในใบส่งงานเขียนติดกันแบบนี้เสมอ
export function parseWorkPause(input) {
  const text = clean(input);
  if (isBlankCell(text)) return noValue();
  const match = text.match(/^(\d{1,4})\s*[/:\-]\s*(\d{1,4})$/);
  if (!match) return cantRead(text, 'รูปแบบต้องเป็น พ่น/พัก เช่น 30/225');
  const workSec = Number(match[1]);
  const pauseSec = Number(match[2]);
  if (!(workSec > 0) || !(pauseSec > 0)) return cantRead(text, 'ค่าพ่น/พักต้องมากกว่า 0');
  return okValue({ workSec, pauseSec });
}

/* `Grade 5` · `เกรด 3` · `5` → เก็บเป็นข้อความสั้นตามที่ settings.grade รับ */
export function parseGrade(input) {
  const text = clean(input);
  if (isBlankCell(text)) return noValue();
  const match = text.match(/(\d{1,2})/);
  if (!match) return cantRead(text, 'อ่านเกรดไม่ออก');
  return okValue(`Grade ${Number(match[1])}`);
}

// ── ชนิดอุปกรณ์ ──────────────────────────────────────────────────────────
//
// 🔴 คอลัมน์ `Reed` ในชีตเป็นถังขยะของทุกอย่างที่ไม่ใช่เครื่องกระจายกลิ่น
//   (`242` = เครื่องกดสบู่ · `2 KG` = น้ำหนักน้ำยา · `35` = reed จริง — doc §2.5)
//   ⇒ ตัวนี้เดาชนิดจาก **ข้อความ** เท่านั้น เดาไม่ออกคืน null ให้คนเลือกเอง
// ⚠️ **ลำดับสำคัญ** — คำเฉพาะต้องมาก่อนคำกว้าง: `Reed Diffuser` มีคำว่า
//   `diffuser` อยู่ในตัว และ `เครื่องกดสบู่` ก็มีคำว่า `เครื่อง`
//   ⇒ `diffuser` (คำกว้างที่สุด) อยู่ท้ายสุดเสมอ
const KIND_WORDS = [
  ['reed', ['reed', 'ก้านไม้', 'ก้านหอม', 'ก้าน']],
  ['soap', ['เครื่องกดสบู่', 'สบู่', 'soap', 'โฟม', 'foam']],
  ['alcohol', ['เจลแอลกอฮอล์', 'แอลกอฮอล์', 'alcohol', 'sanitizer']],
  ['diffuser', ['เครื่องกระจายกลิ่น', 'diffuser', 'aroma', 'machine', 'สเปรย์', 'เครื่อง']],
];

export function parseAssetKind(input) {
  const text = clean(input).toLowerCase();
  if (isBlankCell(text)) return noValue();
  for (const [kind, words] of KIND_WORDS) {
    if (words.some((word) => text.includes(word.toLowerCase()))) return okValue(kind);
  }
  return cantRead(input, 'ไม่รู้จักชนิดอุปกรณ์');
}

// ── ข้อความ ──────────────────────────────────────────────────────────────
export function parseText(input, { max = 150, label = 'ข้อความ' } = {}) {
  const text = clean(input).replace(/\s+/g, ' ');
  if (isBlankCell(text)) return noValue();
  if (text.length > max) return cantRead(text, `${label}ยาวเกิน ${max} ตัวอักษร`);
  return okValue(text);
}

/* กุญแจเทียบชื่อ — ตัดช่องว่าง/วงเล็บ/ขีดออกให้ `Jim Thompson (Outlet 93)` กับ
   `Jim Thompson Outlet 93` เจอกัน · ⚠️ ใช้ **เทียบ** อย่างเดียว ห้ามเอาไปเก็บลง DB */
export function nameKey(input) {
  return clean(input)
    .toLowerCase()
    .replace(/[()[\]{}"'`.,\-–—_/\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
