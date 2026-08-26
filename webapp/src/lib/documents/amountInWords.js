// จำนวนเงินเป็นตัวอักษร — "สองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทถ้วน" / "… Baht Only"
// (IS-26080034) ใช้บนเอกสารที่พิมพ์ให้ลูกค้า ใต้ยอดรวมทั้งสิ้น
//
// ⚠️ คำนวณตอนเรนเดอร์เสมอ **ห้ามเก็บลงฐาน** — ค่านี้ derive ได้จาก totalAmount 100%
//    ถ้าเก็บซ้ำจะมีทางที่ตัวเลขกับตัวอักษรบนใบเดียวกันไม่ตรงกัน (และต้องไปแตะ
//    whitelist ของ save_quotation_content + approval fingerprint โดยไม่จำเป็น)

const TH_DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
const TH_PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/* อ่านเลขไม่เกิน 6 หลัก (หนึ่ง "ล้าน" ต่อกลุ่ม)
   `hasHigher` = มีหลักที่ใหญ่กว่ากลุ่มนี้และไม่เป็นศูนย์ — จำเป็นเพราะกฎ "เอ็ด" ผูกกับ
   **ทั้งจำนวน** ไม่ใช่กลุ่ม: 1,000,001 อ่าน "หนึ่งล้านเอ็ด" ไม่ใช่ "หนึ่งล้านหนึ่ง" */
function thaiChunkWords(chunk, hasHigher) {
  const len = chunk.length;
  let out = '';
  for (let i = 0; i < len; i += 1) {
    const digit = Number(chunk[i]);
    if (digit === 0) continue;
    const place = len - i - 1; // 0 = หลักหน่วย
    if (place === 0 && digit === 1 && (len > 1 || hasHigher)) out += 'เอ็ด';
    else if (place === 1 && digit === 1) out += 'สิบ'; // ไม่ใช่ "หนึ่งสิบ"
    else if (place === 1 && digit === 2) out += 'ยี่สิบ'; // ไม่ใช่ "สองสิบ"
    else out += TH_DIGITS[digit] + TH_PLACES[place];
  }
  return out;
}

// จำนวนเต็ม (รับเป็นสตริงหลัก) → คำอ่านไทย · แบ่งทีละ 6 หลักแล้วคั่นด้วย "ล้าน"
// จึงอ่าน "ล้านล้าน" ได้เองโดยไม่ต้องมีชื่อหลักเกินล้าน
function thaiIntegerWords(digits) {
  const trimmed = String(digits).replace(/^0+/, '');
  if (!trimmed) return 'ศูนย์';
  const groups = [];
  let rest = trimmed;
  while (rest.length > 6) {
    groups.unshift(rest.slice(-6));
    rest = rest.slice(0, -6);
  }
  groups.unshift(rest);
  return groups
    .map((group, index) => {
      const hasHigher = groups.slice(0, index).some((higher) => Number(higher) > 0);
      const words = thaiChunkWords(String(Number(group)), hasHigher);
      return index < groups.length - 1 ? `${words}ล้าน` : words;
    })
    .join('');
}

const EN_ONES = [
  'Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
  'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen',
];
const EN_TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
// หลักละ 3 ตัว — ถึง Quadrillion พอสำหรับ Number ที่ยังแม่นทศนิยม 2 ตำแหน่ง
const EN_SCALES = ['', 'Thousand', 'Million', 'Billion', 'Trillion', 'Quadrillion'];

function englishChunkWords(value) {
  const hundreds = Math.floor(value / 100);
  const rest = value % 100;
  const parts = [];
  if (hundreds) parts.push(`${EN_ONES[hundreds]} Hundred`);
  if (rest < 20) { if (rest) parts.push(EN_ONES[rest]); }
  else {
    const ones = rest % 10;
    parts.push(ones ? `${EN_TENS[Math.floor(rest / 10)]}-${EN_ONES[ones]}` : EN_TENS[Math.floor(rest / 10)]);
  }
  return parts.join(' ');
}

function englishIntegerWords(digits) {
  const trimmed = String(digits).replace(/^0+/, '');
  if (!trimmed) return 'Zero';
  const groups = [];
  let rest = trimmed;
  while (rest.length > 3) {
    groups.unshift(rest.slice(-3));
    rest = rest.slice(0, -3);
  }
  groups.unshift(rest);
  const lastIndex = groups.length - 1;
  return groups
    .map((group, index) => {
      const value = Number(group);
      if (!value) return '';
      const scale = EN_SCALES[lastIndex - index] || '';
      return scale ? `${englishChunkWords(value)} ${scale}` : englishChunkWords(value);
    })
    .filter(Boolean)
    .join(' ');
}

/* แยกจำนวนเงินเป็น บาท/สตางค์ ที่ **ปัดแบบเดียวกับตัวเลขที่พิมพ์บนใบ** (money() ใช้
   maximumFractionDigits: 2) — ถ้าปัดคนละแบบ ใบจะมีบรรทัดตัวอักษรที่ไม่ตรงตัวเลขเหนือมันเอง */
function splitAmount(value) {
  const number = Number(value);
  const safe = Number.isFinite(number) ? number : 0;
  const negative = safe < 0;
  const units = Math.round(Math.abs(safe) * 100); // สตางค์ทั้งหมด
  return {
    negative,
    baht: String(Math.floor(units / 100)),
    satang: units % 100,
  };
}

function thaiAmountWords(value) {
  const { negative, baht, satang } = splitAmount(value);
  const sign = negative ? 'ลบ' : '';
  const satangWords = satang ? `${thaiIntegerWords(String(satang))}สตางค์` : '';
  // ศูนย์บาทกับมีสตางค์ อ่านเฉพาะสตางค์ตามธรรมเนียม ("เจ็ดสิบห้าสตางค์")
  if (baht === '0' && satang) return `${sign}${satangWords}`;
  return `${sign}${thaiIntegerWords(baht)}บาท${satang ? satangWords : 'ถ้วน'}`;
}

function englishAmountWords(value) {
  const { negative, baht, satang } = splitAmount(value);
  const sign = negative ? 'Minus ' : '';
  if (baht === '0' && satang) return `${sign}${englishIntegerWords(String(satang))} Satang Only`;
  const satangWords = satang ? ` and ${englishIntegerWords(String(satang))} Satang` : '';
  return `${sign}${englishIntegerWords(baht)} Baht${satangWords} Only`;
}

/**
 * จำนวนเงิน → ตัวอักษรตามภาษาของเอกสาร (ไม่ใส่วงเล็บ — ผู้เรียกตกแต่งเอง)
 * @param {number|string} value ยอดเงินหน่วยบาท
 * @param {'th'|'en'} language ภาษาของ **ใบ** ไม่ใช่ภาษาของผู้ใช้
 */
export function amountInWords(value, language = 'th') {
  return language === 'en' ? englishAmountWords(value) : thaiAmountWords(value);
}
