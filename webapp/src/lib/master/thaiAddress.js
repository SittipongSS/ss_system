// ── ที่อยู่ไทยแบบมีโครงสร้าง (จังหวัด / อำเภอ-เขต / ตำบล-แขวง / รหัสไปรษณีย์) ──
//
// ⭐ ที่มา: ที่อยู่ลูกค้าเคยเป็น textarea ก้อนเดียว (mig 0202) — เก็บครบแต่ต่อยอด
// ไม่ได้เลย: จัดกลุ่มลูกค้าตามภาค · คิดค่าขนส่งตามโซน · วางเส้นทางทีมบริการ ·
// สรุปยอดขายรายจังหวัด ทำไม่ได้สักอย่างเพราะจังหวัดเป็นแค่ตัวอักษรกลางย่อหน้า
//
// ไฟล์นี้เป็น **logic ล้วน ไม่มีตัวข้อมูล** — ชุดจังหวัด/อำเภอ/ตำบลอยู่ที่
// src/data/thaiAdmin.json (สร้างด้วย scripts/build-thai-admin.mjs) และเสิร์ฟผ่าน
// /api/master/thai-address เพื่อไม่ให้ไฟล์ 650KB ติดไปกับ bundle ฝั่ง client
//
// ── กติกาสำคัญ: `address` (ข้อความเต็ม) ยังเป็นแหล่งความจริงของ "สิ่งที่พิมพ์" ──
// เอกสารทุกใบ (QT/SO/ใบยื่นสรรพสามิต) พิมพ์จากช่องข้อความ และ snapshot ที่ออกไป
// แล้วก็เก็บเป็นข้อความ ฉะนั้นฟิลด์ย่อยจึงเป็น **ตัวประกอบข้อความ** ไม่ใช่ตัวแทน:
// เลือกครบ → ประกอบให้อัตโนมัติ · แถวเก่าที่ยังไม่มีฟิลด์ย่อย → ข้อความเดิมอยู่ครบ
// ไม่ถูกแตะ (addressOverride) ⇒ ไม่มีเอกสารใบไหนเปลี่ยนหน้าตาเพราะ migration นี้

// กรุงเทพฯ ใช้คำเรียกคนละชุดกับต่างจังหวัด (แขวง/เขต ไม่ใช่ ตำบล/อำเภอ) และไม่มี
// คำว่า "จังหวัด" นำหน้า — เขียนผิดทั้งสามจุดบนใบกำกับภาษีเห็นชัดทันที
export const BANGKOK_PROVINCE_CODE = '10';

export const isBangkok = (provinceCode) => String(provinceCode ?? '') === BANGKOK_PROVINCE_CODE;

export const districtPrefix = (provinceCode) => (isBangkok(provinceCode) ? 'เขต' : 'อำเภอ');
export const subdistrictPrefix = (provinceCode) => (isBangkok(provinceCode) ? 'แขวง' : 'ตำบล');
export const provincePrefix = (provinceCode) => (isBangkok(provinceCode) ? '' : 'จังหวัด');

const text = (v) => (v == null ? '' : String(v));
const clean = (v) => text(v).trim().replace(/\s+/g, ' ');

// ฟิลด์ย่อยของที่อยู่หนึ่งแถว — เก็บ **ทั้งรหัสและชื่อ** ไม่ใช่รหัสอย่างเดียว
// เพราะข้อความบนเอกสารต้องประกอบได้โดยไม่ต้องเปิดตารางอ้างอิง (แพตเทิร์นเดียวกับ
// แบรนด์ที่เก็บ {th,en} ไว้ในแถว) และรหัสไปรษณีย์/ชื่อที่ตรึงไว้ต้องไม่ขยับตาม
// ต้นทางที่อัปเดตทีหลัง
export const ADDRESS_PART_FIELDS = [
  'line1',
  'subdistrict', 'subdistrictCode',
  'district', 'districtCode',
  'province', 'provinceCode',
  'postcode',
];

const DIGITS_ONLY = /\D/g;

// รหัสไปรษณีย์ = ตัวเลข 5 หลักเท่านั้น (ค่าที่ไม่ครบถือว่ายังไม่ได้กรอก ไม่ใช่ error —
// ผู้ใช้เลือกตำบลแล้วระบบเติมให้เอง ช่องนี้แก้มือได้สำหรับที่อยู่ที่ใช้รหัสเฉพาะ)
export function normalizePostcode(value) {
  const digits = text(value).replace(DIGITS_ONLY, '');
  return digits.length === 5 ? digits : '';
}

// รหัสสาขาตามแบบกรมสรรพากร: ตัวเลข 5 หลัก · '00000' = สำนักงานใหญ่
// ผู้ใช้พิมพ์ '1' · '00001' · 'สาขาที่ 1' ต้องได้ผลเดียวกัน — เติมศูนย์ให้เอง
//
// ⚠️ ค่าที่ไม่ใช่ตัวเลข **ห้ามทิ้ง** — ของจริงในฐานข้อมูลมีลูกค้าที่กรอกเป็น *ชื่อ*
// สาขา ('แจ้งวัฒนะ') · ถ้าตัดอักษรไทยทิ้งแล้วตกเป็น '00000' เท่ากับระบบเปลี่ยน
// "สาขาแจ้งวัฒนะ" เป็น "สำนักงานใหญ่" เงียบ ๆ บนใบกำกับภาษี ซึ่งผิดหนักกว่าการ
// ปล่อยชื่อสาขาไว้ตามเดิม — เก็บข้อความไว้ แล้วให้คนมาแก้เป็นเลขทีหลัง
const BRANCH_WORD = /^สาขา(ที่)?\s*/;
export function normalizeBranchCode(value) {
  const raw = text(value).trim().replace(BRANCH_WORD, '').trim();
  if (!raw) return '';
  if (!/^\d+$/.test(raw)) return raw.slice(0, 50);
  return raw.slice(0, 5).padStart(5, '0');
}

export const HEAD_OFFICE_BRANCH = '00000';

// ยังไม่เป็นเลข 5 หลัก = ยังกรอกไม่ถูกแบบ (ใบกำกับภาษีเต็มรูปต้องเป็นเลขสาขา)
// ฝั่งจอใช้ตัวนี้ขึ้นคำเตือน โดยไม่บล็อกการบันทึก
export const isBranchCodeValid = (value) => /^\d{5}$/.test(normalizeBranchCode(value));

export function branchLabel(branchCode) {
  const code = normalizeBranchCode(branchCode);
  if (!code || code === HEAD_OFFICE_BRANCH) return 'สำนักงานใหญ่';
  return isBranchCodeValid(code) ? `สาขาที่ ${code}` : `สาขา ${code}`;
}

// ── ประกอบข้อความที่อยู่จากฟิลด์ย่อย ────────────────────────────────────
// คืน '' เมื่อยังไม่มีอะไรให้ประกอบ — ผู้เรียกจะได้รู้ว่าต้องใช้ข้อความที่พิมพ์เอง
// line1 คงขึ้นบรรทัดของผู้ใช้ไว้ (ที่อยู่โรงงานมักมีหลายบรรทัด) ส่วนหางต่อท้ายบรรทัดสุดท้าย
export function composeThaiAddress(parts = {}) {
  const provinceCode = text(parts.provinceCode);
  const line1 = text(parts.line1).trim();
  const subdistrict = clean(parts.subdistrict);
  const district = clean(parts.district);
  const province = clean(parts.province);
  const postcode = normalizePostcode(parts.postcode);

  const tail = [
    subdistrict ? `${subdistrictPrefix(provinceCode)}${subdistrict}` : '',
    district ? `${districtPrefix(provinceCode)}${district}` : '',
    province ? `${provincePrefix(provinceCode)}${province}` : '',
    postcode,
  ].filter(Boolean).join(' ');

  if (!line1) return tail;
  if (!tail) return line1;
  return `${line1} ${tail}`;
}

// ── ที่อยู่ภาษาอังกฤษ (IFRA / MSDS) ─────────────────────────────────────
// ⭐ ชื่ออังกฤษของ ตำบล/อำเภอ/จังหวัด **มีอยู่ในทะเบียนกรมการปกครองแล้วทุกชั้น**
// (`en` ใน src/data/thaiAdmin.js ซึ่ง /api/master/thai-address ส่งให้ฟอร์มอยู่แล้ว)
// ⇒ คนกรอกพิมพ์แค่ท่อนแรก (บ้านเลขที่/หมู่/ถนน) ที่เหลือประกอบให้เอง ไม่ต้องแปลมือ
//
// เก็บ **ชื่ออังกฤษลงในแถว** เหมือนที่เก็บชื่อไทย ด้วยเหตุผลเดียวกับหัวไฟล์: ข้อความ
// บนเอกสารต้องประกอบได้โดยไม่ต้องเปิดตารางอ้างอิง — ตัวทะเบียน 650KB เป็น server-only
// (lib/master/thaiAdmin.js) หน้าจอกับเอกสารจึง import ไม่ได้
export const ADDRESS_PART_FIELDS_EN = ['line1En', 'subdistrictEn', 'districtEn', 'provinceEn'];

// ภาษาอังกฤษไม่มีคำนำหน้า ตำบล/อำเภอ/จังหวัด — คั่นด้วยจุลภาค แล้วรหัสไปรษณีย์
// ต่อท้ายชื่อจังหวัดด้วยเว้นวรรค (รูปที่ไปรษณีย์ไทย/ขนส่งต่างประเทศใช้จริง)
//   99/9 Moo 5, Bangna-Trad Rd., Bang Chalong, Bang Phli, Samut Prakan 10540
// คืน '' เมื่อยังไม่มีอะไรให้ประกอบ — ผู้เรียกจะได้รู้ว่าต้องใช้ข้อความที่พิมพ์เอง
export function composeEnglishAddress(parts = {}) {
  const line1 = text(parts.line1En).trim();
  const region = [
    clean(parts.subdistrictEn),
    clean(parts.districtEn),
    clean(parts.provinceEn),
  ].filter(Boolean).join(', ');
  const postcode = normalizePostcode(parts.postcode);
  const tail = [region, postcode].filter(Boolean).join(' ');

  if (!line1) return tail;
  if (!tail) return line1;
  return `${line1}, ${tail}`;
}

// ฟิลด์ย่อยอังกฤษครบพอจะประกอบไหม — จังหวัดคือขั้นต่ำ (กติกาเดียวกับฝั่งไทย)
export const hasEnglishParts = (parts = {}) => !!clean(parts.provinceEn);

// ฟิลด์ย่อยครบพอที่จะประกอบข้อความแทนการพิมพ์เองไหม — จังหวัดคือขั้นต่ำ
// (ที่อยู่ที่ไม่มีจังหวัดส่งของไม่ได้ และเป็นสัญญาณว่าแถวนั้นยังเป็นข้อความยุคเก่า)
export const hasStructuredParts = (parts = {}) => !!clean(parts.province);

// ── index สำหรับค้นหา/แยกข้อความ ─────────────────────────────────────────
// รับได้ทั้งชุดเต็ม (ฝั่ง server — มีตำบลครบ) และชุดที่ฟอร์มโหลดมา (จังหวัด+อำเภอ
// เท่านั้น ยังไม่มีตำบล) เพื่อให้ **กติกาการแยกข้อความเป็นชุดเดียวกันทั้งสองฝั่ง**
// ไม่ใช่เขียนสองรอบแล้วเพี้ยนหากันแบบที่ฟอร์มสร้าง/แก้เคยเป็น (ดู AGENTS.md)
export function buildAddressIndex(rawProvinces) {
  const byProvinceCode = new Map();
  const byDistrictCode = new Map();
  const bySubdistrictCode = new Map();
  const subdistrictsByZip = new Map();

  const provinces = (rawProvinces || []).map((p) => {
    const districts = (p.districts || []).map((d) => {
      const subdistricts = (d.subdistricts || []).map((s) => ({ ...s, districtCode: d.code, provinceCode: p.code }));
      const district = { ...d, subdistricts, provinceCode: p.code };
      byDistrictCode.set(d.code, district);
      for (const s of subdistricts) {
        bySubdistrictCode.set(s.code, s);
        const list = subdistrictsByZip.get(s.zip) || [];
        list.push(s);
        subdistrictsByZip.set(s.zip, list);
      }
      return district;
    });
    const province = { ...p, districts };
    byProvinceCode.set(p.code, province);
    return province;
  });

  // รหัสไปรษณีย์ → จังหวัด: ใช้ได้ต่อเมื่อรหัสนั้นอยู่จังหวัดเดียว (บางรหัสคาบเกี่ยว
  // สองจังหวัด — เดาผิดแล้วที่อยู่บนใบกำกับภาษีผิดจังหวัด ยอมไม่เดาดีกว่า)
  const provinceByZip = new Map();
  for (const [zip, subs] of subdistrictsByZip) {
    const codes = new Set(subs.map((s) => s.provinceCode));
    provinceByZip.set(zip, codes.size === 1 ? byProvinceCode.get([...codes][0]) : null);
  }

  return {
    // เรียงชื่อยาวสุดก่อน — ใช้ตอน parse ข้อความเดิม ('นครศรีธรรมราช' ต้องชนะก่อนที่
    // ชื่อสั้นกว่าจะไปแมตช์ substring มั่ว)
    provinces: [...provinces].sort((a, b) => b.th.length - a.th.length),
    byProvinceCode,
    byDistrictCode,
    bySubdistrictCode,
    provinceByZip,
    subdistrictsByZip,
  };
}


// ── แยกข้อความที่อยู่เดิม → ฟิลด์ย่อย (best-effort) ──────────────────────
// ใช้กับแถวยุคเก่าตอนกดปุ่ม "แยกที่อยู่อัตโนมัติ" และในสคริปต์ backfill
// **ไม่รับประกันความถูกต้อง** — คืนสิ่งที่จับได้พร้อมข้อความส่วนที่เหลือ ให้คนตรวจ
// ก่อนบันทึกเสมอ (ที่อยู่ไทยเขียนกันคนละแบบเกินกว่าจะ parse ให้ชัวร์ได้)

const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const PROVINCE_PREFIXES = ['จังหวัด', 'จ.'];
// รับทั้งสองชุดเสมอ ไม่ดูว่าเป็นกรุงเทพฯ หรือไม่ — คนเขียน "เขต" ให้ต่างจังหวัดและ
// เขียน "อำเภอ" ให้กรุงเทพฯ กันเป็นปกติ ปฏิเสธไปก็แค่แยกไม่ออกโดยไม่ได้อะไรกลับมา
const DISTRICT_PREFIXES = ['อำเภอ', 'กิ่งอำเภอ', 'เขต', 'อ.'];
const SUBDISTRICT_PREFIXES = ['ตำบล', 'แขวง', 'ต.'];
const ALL_PREFIXES = [...PROVINCE_PREFIXES, ...DISTRICT_PREFIXES, ...SUBDISTRICT_PREFIXES];

// หา "ช่วงข้อความ" ของระดับหนึ่ง (จังหวัด/อำเภอ/ตำบล) บนข้อความต้นฉบับ
//
// 🐞 สองกับดักที่เจอจาก dry-run กับข้อมูลจริง 116 ที่อยู่ (2026-08-06):
//  1. ชื่อเปล่าไปแมตช์ชื่อถนน/ซอย — "9 ซอย ลาดพร้าว 124 แขวงพลับพลา เขตวังทองหลาง"
//     ได้อำเภอ = "ลาดพร้าว" (ชื่อซอย!) แทนที่จะเป็นวังทองหลาง ⇒ ต้องให้คำที่มี
//     **คำนำหน้ากำกับ** ชนะชื่อเปล่าเสมอ ไม่ใช่ใครเจอก่อนได้ก่อน
//  2. ชื่อที่ยาวกว่าต้องชนะ — "แขวงถนนพญาไท เขตราชเทวี" ถ้าไม่เรียงจะได้ "พญาไท"
//     (เขตพญาไท) ทั้งที่ของจริงคือราชเทวี
function findLevel(source, candidates, prefixes) {
  let best = null;
  const consider = (item, start, end, anchored) => {
    const better = !best
      || (anchored && !best.anchored)
      || (anchored === best.anchored && item.th.length > best.item.th.length);
    if (better) best = { item, start, end, anchored };
  };
  const anchor = `(?:${prefixes.map(escapeRe).join('|')})\\s*`;
  for (const item of candidates || []) {
    if (!item?.th) continue;
    const m = new RegExp(`${anchor}${escapeRe(item.th)}`).exec(source);
    if (m) { consider(item, m.index, m.index + m[0].length, true); continue; }
    const at = source.indexOf(item.th);
    if (at >= 0) consider(item, at, at + item.th.length, false);
  }
  return best;
}

// ตัดช่วงที่จับได้ออกจากข้อความ — รวมช่วงที่ซ้อนกันก่อนเสมอ
// 🐞 เดิมตัดทีละระดับด้วย indexOf ซึ่งพังกับ "ต.นครสวรรค์ตก อ.เมืองนครสวรรค์
// จ.นครสวรรค์": ตัดชื่อจังหวัดก่อน → ไปโดน "นครสวรรค์" ที่อยู่ในชื่อ **ตำบล**
// เหลือ "ตก" ลอย ๆ แล้วหาตำบลไม่เจออีกเลย
function cutSpans(source, spans) {
  const ordered = spans.filter(Boolean).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const span of ordered) {
    const last = merged[merged.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  let out = '';
  let at = 0;
  for (const span of merged) {
    out += source.slice(at, span.start) + ' ';
    at = span.end;
  }
  return out + source.slice(at);
}

// เศษคำนำหน้าที่ค้างอยู่ตอนจับได้จาก "ชื่อเปล่า" (ตัวชื่อถูกตัดไปแล้ว เหลือ "ต." ลอย)
const stripDanglingPrefixes = (value) => value
  .replace(new RegExp(`(?:^|\\s)(?:${ALL_PREFIXES.map(escapeRe).join('|')})(?=\\s|$)`, 'g'), ' ')
  .replace(/\s+/g, ' ')
  .replace(/^[\s,.-]+|[\s,.-]+$/g, '');

// index = โครงจาก buildAddressIndex (ฝั่ง server มีตำบลครบ · ฝั่งฟอร์มมีถึงอำเภอ)
export function parseThaiAddress(raw, index) {
  const source = text(raw).replace(/ /g, ' ');
  if (!source.trim() || !index) return { parts: null, rest: source.trim() };

  // 1) รหัสไปรษณีย์ — ตัวเลข 5 หลักที่ไม่ติดกับตัวเลขอื่น (กันไปโดนบ้านเลขที่)
  //    เอาตัวท้ายสุด เพราะรหัสไปรษณีย์อยู่ท้ายที่อยู่เสมอ ส่วนบ้านเลขที่อยู่ต้น
  let zipSpan = null;
  for (const m of source.matchAll(/(?<!\d)(\d{5})(?!\d)/g)) {
    zipSpan = { start: m.index, end: m.index + m[0].length, value: m[1] };
  }
  const postcode = zipSpan?.value || '';

  // 2) จังหวัด — กรุงเทพฯ เขียนกันหลายแบบจึงมี alias แยก
  let province = findLevel(source, index.provinces, PROVINCE_PREFIXES);
  if (!province) {
    const bkk = /กรุงเทพมหานคร|กรุงเทพฯ|กรุงเทพ|กทม\.|กทม/.exec(source);
    const row = bkk ? index.byProvinceCode.get(BANGKOK_PROVINCE_CODE) : null;
    if (row) province = { item: row, start: bkk.index, end: bkk.index + bkk[0].length, anchored: true };
  }
  if (!province && postcode) {
    const row = index.provinceByZip.get(postcode);
    // รหัสไปรษณีย์ไม่ได้อยู่ในข้อความส่วนที่ต้องตัด (ตัดไปแล้วที่ zipSpan)
    if (row) province = { item: row, start: -1, end: -1, anchored: false };
  }

  // 3) อำเภอ/เขต — ค้นเฉพาะในจังหวัดที่จับได้ (ชื่ออำเภอซ้ำข้ามจังหวัดเยอะมาก)
  //    "อ.เมือง" เฉย ๆ = อำเภอเมืองของจังหวัดนั้น ซึ่งในทะเบียนชื่อเต็มว่า
  //    "เมืองภูเก็ต"/"เมืองนครสวรรค์" — คนเขียนย่อกันเป็นปกติจนถ้าไม่รองรับก็
  //    แปลว่าที่อยู่ "อ.เมือง" ทุกใบแยกไม่ออก
  const district = province
    ? (findLevel(source, province.item.districts, DISTRICT_PREFIXES)
      || findLevel(
        source,
        province.item.districts.filter((d) => d.th === `เมือง${province.item.th}`)
          .map((d) => ({ ...d, th: 'เมือง' })),
        DISTRICT_PREFIXES,
      ))
    : null;
  // ชื่อที่เอาไปเขียนลงข้อมูลต้องเป็นชื่อเต็มจากทะเบียนเสมอ ไม่ใช่ "เมือง" ที่ย่อมา
  if (district?.item.th === 'เมือง') {
    district.item = province.item.districts.find((d) => d.code === district.item.code);
  }

  // 4) ตำบล/แขวง — ในอำเภอที่จับได้ ไม่งั้นใช้รหัสไปรษณีย์จำกัดขอบเขต
  const subPool = district ? district.item.subdistricts
    : (postcode ? (index.subdistrictsByZip.get(postcode) || []) : []);
  const subdistrict = findLevel(source, subPool, SUBDISTRICT_PREFIXES);

  const resolvedDistrict = district?.item
    || (subdistrict ? index.byDistrictCode.get(subdistrict.item.districtCode) : null);
  const resolvedProvince = province?.item
    || (resolvedDistrict ? index.byProvinceCode.get(resolvedDistrict.provinceCode) : null);

  const rest = stripDanglingPrefixes(cutSpans(source, [
    zipSpan,
    province?.start >= 0 ? province : null,
    district,
    subdistrict,
  ]));

  return {
    parts: {
      line1: rest,
      subdistrict: subdistrict?.item.th || '',
      subdistrictCode: subdistrict?.item.code || '',
      district: resolvedDistrict?.th || '',
      districtCode: resolvedDistrict?.code || '',
      province: resolvedProvince?.th || '',
      provinceCode: resolvedProvince?.code || '',
      postcode: normalizePostcode(postcode || subdistrict?.item.zip || ''),
    },
    // ระดับที่จับได้จริง — สคริปต์ backfill ใช้ตัดสินว่าแถวไหนต้องให้คนดู
    matched: {
      province: !!resolvedProvince,
      district: !!resolvedDistrict,
      subdistrict: !!subdistrict,
      postcode: !!postcode,
    },
    rest,
  };
}

// เฟสสองของการแยกข้อความฝั่งฟอร์ม: index ที่ฟอร์มโหลดมามีถึงแค่อำเภอ จึงต้องโหลด
// ตำบลของอำเภอที่จับได้ก่อน แล้วค่อยหาตำบลจากเศษข้อความด้วยกติกาเดียวกัน (findLevel)
// คืนทั้งตัวตำบลและ line1 ที่ตัดชื่อตำบลออกแล้ว — ไม่งั้นฝั่งจอต้องเขียนกฎการตัด
// ของตัวเองแล้วเพี้ยนจากฝั่ง server ทันทีที่ใครแก้ที่เดียว
export function matchSubdistrict(rest, subdistricts) {
  const source = text(rest);
  const found = findLevel(source, subdistricts, SUBDISTRICT_PREFIXES);
  if (!found) return { subdistrict: null, line1: stripDanglingPrefixes(source) };
  return {
    subdistrict: found.item,
    line1: stripDanglingPrefixes(cutSpans(source, [found])),
  };
}
