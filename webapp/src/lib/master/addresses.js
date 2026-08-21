// ── ที่อยู่ลูกค้าหลายรายการ (migration 0202) ──────────────────────────────
// เดิมลูกค้า 1 ราย = ที่อยู่ออกบิล 1 (customers.address) + ที่อยู่จัดส่ง 1
// (shippingAddress) และ "สาขา" คือ **ลูกค้าคนละแถว** (unique (taxId, branchCode)
// จาก mig 0039) ซึ่งไม่มีใครใช้จริง — ของจริงคือบริษัทเดียวมีหลายที่อยู่/หลายสาขา
// และใบเสนอราคาต้องเลือกได้ว่าออกบิลที่ไหน ส่งที่ไหน
//
// รูปเก็บ: customers.addresses = [{ id, label, branchCode, line1, subdistrict,
//   subdistrictCode, district, districtCode, province, provinceCode, postcode,
//   mapUrl, contactName, contactPhone, address, addressOverride, useFor }]
//   (คีย์ที่ยังว่างจะไม่ถูกเขียนลง jsonb เลย — ดู OPTIONAL_ROW_FIELDS)
//
//   useFor = 'both' | 'billing' | 'shipping' — เก็บเป็นค่าเดียว 3 ทาง (ไม่ใช่ธงสอง
//   ตัวอิสระ) เพราะธงสองตัวมีสถานะ "ไม่ใช้ทำอะไรเลย" ที่บันทึกได้แต่ไม่มีความหมาย ·
//   บนจอเป็นปุ่มติ๊กสองปุ่ม (มติผู้ใช้) แปลงกลับไปมาที่ toggleAddressUse ด้านล่าง
//
// ── เลขสาขากลับมาอยู่ที่ "ที่อยู่" (มติผู้ใช้ 2026-08-06) ──────────────────
// รอบก่อน (2026-08-05) ตัดสินว่าเลขสาขาเป็นของลูกค้าทั้งราย (customers.branchCode)
// แล้วถอดออกจากที่อยู่ — ผลคือ **ไม่มีช่องกรอกเลขสาขาเหลืออยู่ในระบบเลย** (ฟอร์ม
// ลูกค้าไม่มี, API รับแต่ไม่มีใครส่ง) ⇒ ลูกค้าทุกรายค้างที่ '00000' และใบกำกับภาษี
// ทุกใบพิมพ์ "สำนักงานใหญ่" แม้ออกบิลให้สาขา ซึ่งใบกำกับภาษีเต็มรูปผิดทันที
//
// ของจริง: สาขาเป็นคุณสมบัติของ **สถานประกอบการ** (= ที่อยู่) ไม่ใช่ของนิติบุคคล —
// บริษัทเดียวมี 00000 กับ 00012 พร้อมกันได้ ซึ่งเป็นเหตุผลเดียวกับที่ต้องเลือกที่อยู่
// ตอนออกบิลตั้งแต่แรก · customers.branchCode คงไว้เป็น **กระจกของที่อยู่ออกบิลหลัก**
// (แพตเทิร์นเดียวกับ address/shippingAddress) เพราะ unique (taxId, branchCode) และ
// สายที่อ่านช่องเดี่ยว (customerSnapshotFallback) ยังใช้อยู่จริง
//
// คอลัมน์เดี่ยวเดิม address / shippingAddress ยังอยู่ในฐานะ
// "กระจก" ของที่อยู่หลัก (แพตเทิร์นเดียวกับ contacts[] → contactPerson/
// contactPhone/email) เพราะมีสายที่อ่านช่องเดี่ยวอยู่จริงและต้องไม่พัง:
// snapshot ใบเสนอราคา/ใบสั่งขาย, ตารางลูกค้า, การค้นหา
//
// "ที่อยู่หลัก" = รายการแรกในลิสต์ที่ใช้งานนั้นได้ (กติกาเดียวกับผู้ติดต่อคนแรก
// = ผู้ติดต่อหลัก) — ไม่มีธง isPrimary แยก เพราะสองธง (บิล/จัดส่ง) จะขัดกันเอง
// ได้ และลำดับในลิสต์เป็นสิ่งที่ผู้ใช้เห็นและสลับได้ตรง ๆ อยู่แล้ว
import { genId } from '@/lib/id';
import {
  ADDRESS_PART_FIELDS, ADDRESS_PART_FIELDS_EN, composeEnglishAddress, composeThaiAddress,
  hasEnglishParts, hasStructuredParts, HEAD_OFFICE_BRANCH,
  normalizeBranchCode, normalizePostcode,
} from '@/lib/master/thaiAddress';

export const ADDRESS_USES = ['both', 'billing', 'shipping'];

export const ADDRESS_USE_LABELS = {
  both: 'ออกเอกสาร + จัดส่ง',
  billing: 'ออกเอกสารอย่างเดียว',
  shipping: 'จัดส่งอย่างเดียว',
};

const text = (v) => (v == null ? '' : String(v));

// ค่าที่ไม่รู้จัก (แถวเก่า/ข้อมูลมั่ว) → 'both' เพราะที่อยู่ที่บันทึกไว้แล้วต้อง
// ยังเลือกได้ ไม่ใช่หายจาก dropdown ทั้งสองฝั่งเงียบ ๆ
export function addressUse(raw) {
  const use = text(raw?.useFor).trim();
  return ADDRESS_USES.includes(use) ? use : 'both';
}

export function isBillingAddress(a) {
  return addressUse(a) !== 'shipping';
}

export function isShippingAddress(a) {
  return addressUse(a) !== 'billing';
}

// ปุ่มติ๊กบนจอ ↔ useFor: ติ๊กครบสอง = 'both' · ติ๊กอันเดียว = อันนั้น · **ติ๊กไม่เหลือ
// เลยไม่มีในข้อมูล** (ที่อยู่ที่ใช้ทำอะไรไม่ได้เลยก็ไม่ใช่ที่อยู่) — ปุ่มสุดท้ายจึงกด
// ปิดไม่ลง คืนค่าเดิม แทนที่จะปล่อยให้บันทึกแถวที่ไม่มีความหมายแล้วไปงงทีหลัง
export function toggleAddressUse(current, key) {
  const on = { billing: isBillingAddress({ useFor: current }), shipping: isShippingAddress({ useFor: current }) };
  const next = { ...on, [key]: !on[key] };
  if (!next.billing && !next.shipping) return addressUse({ useFor: current });
  if (next.billing && next.shipping) return 'both';
  return next.billing ? 'billing' : 'shipping';
}

// ลิงก์แผนที่: ต้องเป็น http(s) เท่านั้น — ช่องนี้ถูก render เป็น <a href> จริง
// ปล่อย javascript:/data: ผ่าน = XSS ที่คนกรอกที่อยู่ลูกค้าฝังให้คนอื่นกดได้
const MAP_URL_MAX = 500;
export function normalizeMapUrl(value) {
  const url = text(value).trim();
  if (!url) return '';
  if (!/^https?:\/\//i.test(url)) return '';
  return url.slice(0, MAP_URL_MAX);
}

// แถวเดียว → รูปมาตรฐาน. ไม่ trim ระหว่างพิมพ์ (ดูเหตุผลใน BrandsEditor:
// trim ทุก re-render = เคาะเว้นวรรคท้ายคำไม่ได้) — trim จริงทำตอน normalize
// ก่อนบันทึกที่ API
export function asAddressRow(raw) {
  // ที่อยู่ที่ส่งมาเป็นสตริงเปล่า (สายเก่าบางเส้นยังทำอยู่) — วนกลับเข้าทางเดียวกัน
  // ไม่ใช่คืนอ็อบเจกต์ที่ขาดคีย์ ไม่งั้น normalizeAddresses จะพังตอนอ่าน row.line1
  if (typeof raw === 'string') return asAddressRow({ address: raw, useFor: 'both' });
  const row = {
    id: text(raw?.id),
    label: text(raw?.label),
    address: text(raw?.address),
    // ข้อความอังกฤษเต็มของแถวนี้ — คู่ของ `address` (IFRA/MSDS · มติ 2026-08-22)
    addressEn: text(raw?.addressEn),
    useFor: addressUse(raw),
  };
  // ฟิลด์ที่เพิ่มทีหลัง (สาขา · ที่อยู่แบบมีโครงสร้าง · แผนที่ · ผู้รับของ) — เก็บเป็น
  // string เสมอเพื่อให้ input ฝั่งจอเป็น controlled ตลอด ไม่กระโดดเป็น uncontrolled
  // ตอนเจอแถวยุคเก่าที่ไม่มีคีย์เหล่านี้
  row.branchCode = text(raw?.branchCode);
  for (const field of ADDRESS_PART_FIELDS) row[field] = text(raw?.[field]);
  for (const field of ADDRESS_PART_FIELDS_EN) row[field] = text(raw?.[field]);
  row.mapUrl = text(raw?.mapUrl);
  row.contactName = text(raw?.contactName);
  row.contactPhone = text(raw?.contactPhone);
  row.addressOverride = raw?.addressOverride === true;
  return row;
}

// ── ข้อความที่อยู่ของแถวหนึ่ง ────────────────────────────────────────────
// เลือกจังหวัด/อำเภอ/ตำบลครบ → ประกอบข้อความให้เอง · ยังไม่ได้เลือก (แถวยุคเก่า)
// หรือผู้ใช้กด "พิมพ์ข้อความเอง" → ใช้ข้อความที่พิมพ์ไว้ตามเดิม
// ⚠️ ห้ามประกอบทับข้อความเดิมโดยที่ผู้ใช้ไม่ได้เลือกอะไร — แถวเก่า 90 กว่าราย
// จะถูกเขียนข้อความใหม่พร้อมกันทั้งหมดในการบันทึกครั้งถัดไป
export function addressText(row) {
  const r = asAddressRow(row);
  const typed = r.address.trim();
  if (r.addressOverride || !hasStructuredParts(r)) return typed;
  // 🐞 กับดักที่ต้องปิด: แถวยุคเก่ามีข้อความเต็มอยู่ใน address แต่ line1 ว่าง — ถ้า
  // มีใครเผลอเลือกจังหวัดให้แถวนั้น ข้อความประกอบจะเหลือแค่ "จังหวัดชลบุรี 20000"
  // แล้วบ้านเลขที่/ถนนของลูกค้าหายถาวรในการบันทึกครั้งเดียว
  if (!r.line1.trim() && typed) return typed;
  return composeThaiAddress(r) || typed;
}

// ── ข้อความที่อยู่ภาษาอังกฤษของแถวหนึ่ง ─────────────────────────────────
// คู่ขนานกับ addressText ทุกประการ — เลือกจังหวัด/อำเภอ/ตำบลแล้วชื่ออังกฤษติดมา
// กับตัวเลือก (ทะเบียนกรมการปกครองมี `en` ครบ) ⇒ ประกอบให้เอง · กด "พิมพ์ข้อความเอง"
// หรือแถวที่ไม่ได้เลือกจากทะเบียน (ที่อยู่ต่างประเทศ) ใช้ข้อความที่พิมพ์ไว้ตามเดิม
export function addressTextEn(row) {
  const r = asAddressRow(row);
  const typed = r.addressEn.trim();
  if (r.addressOverride || !hasEnglishParts(r)) return typed;
  // กับดักเดียวกับฝั่งไทย: แถวที่มีข้อความอังกฤษเต็มอยู่แล้วแต่ยังไม่ได้แยก line1En
  // ต้องไม่ถูกเขียนทับด้วยหางที่ประกอบจากทะเบียนอย่างเดียว
  if (!r.line1En.trim() && typed) return typed;
  return composeEnglishAddress(r) || typed;
}

// ── ที่อยู่ตามภาษาที่ใช้อยู่ (มติผู้ใช้ 2026-08-22) ───────────────────────
// "ใส่อย่างน้อยหนึ่งภาษา · โชว์ภาษาหลักของบริบทก่อน ไม่มีค่อยโชว์อีกภาษา"
// ⚠️ **ไม่แปลให้เอง** — ตกไปอีกภาษาแบบตรง ๆ (กติกาเดียวกับชื่อสินค้าบนเอกสาร)
export function addressTextIn(row, language = 'th') {
  const th = addressText(row).trim();
  const en = addressTextEn(row).trim();
  return language === 'en' ? (en || th) : (th || en);
}

// ฟิลด์ที่ "ว่าง = ไม่ต้องเก็บ" — ไม่เขียนคีย์เปล่าลง jsonb เพื่อให้แถวยุคเก่าที่ยัง
// ไม่กรอกอะไรเพิ่ม มีรูปร่างเท่าเดิมเป๊ะ (diff ของ changedFieldsAgainst จึงไม่ขยับ
// = เปิดฟอร์มแล้วกดบันทึกเฉย ๆ ไม่ทำให้ลูกค้าตกไปรออนุมัติใหม่)
const OPTIONAL_ROW_FIELDS = [
  'branchCode', ...ADDRESS_PART_FIELDS, ...ADDRESS_PART_FIELDS_EN,
  'mapUrl', 'contactName', 'contactPhone',
];

// ก่อนบันทึก: trim, ตัดแถวที่ไม่มีตัวที่อยู่ (ป้ายชื่อล้วนไม่ใช่ที่อยู่), เติม id
// ให้แถวใหม่ — id ต้องนิ่งเพราะเอกสารฝั่งขายจะอ้างถึงที่อยู่ตัวนี้
export function normalizeAddresses(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const raw of arr) {
    const row = asAddressRow(raw);
    const address = addressText(row).trim();
    // ⭐ อย่างน้อยหนึ่งภาษา (มติ 2026-08-22) — แถวที่มีแต่ข้อความอังกฤษต้องอยู่รอด
    // ไม่ใช่ถูกตัดทิ้งเงียบ ๆ เหมือนแถวเปล่า (เดิมตัดที่ข้อความไทยอย่างเดียว)
    const addressEn = addressTextEn(row).trim();
    if (!address && !addressEn) continue;
    const next = {
      id: row.id.trim() || genId('ADR'),
      label: row.label.trim(),
      address,
      useFor: row.useFor,
    };
    // ว่าง = ไม่เขียนคีย์ ⇒ แถวที่ยังไม่มีอังกฤษมีรูปร่างเท่าเดิมเป๊ะ (ดู OPTIONAL_ROW_FIELDS)
    if (addressEn) next.addressEn = addressEn;
    const values = {
      branchCode: normalizeBranchCode(row.branchCode),
      line1: row.line1.trim(),
      subdistrict: row.subdistrict.trim(),
      line1En: row.line1En.trim(),
      subdistrictEn: row.subdistrictEn.trim(),
      districtEn: row.districtEn.trim(),
      provinceEn: row.provinceEn.trim(),
      subdistrictCode: row.subdistrictCode.trim(),
      district: row.district.trim(),
      districtCode: row.districtCode.trim(),
      province: row.province.trim(),
      provinceCode: row.provinceCode.trim(),
      postcode: normalizePostcode(row.postcode),
      mapUrl: normalizeMapUrl(row.mapUrl),
      contactName: row.contactName.trim(),
      contactPhone: row.contactPhone.trim(),
    };
    for (const field of OPTIONAL_ROW_FIELDS) {
      if (values[field]) next[field] = values[field];
    }
    // เก็บธง "พิมพ์เอง" เฉพาะแถวที่มีฟิลด์ย่อยแล้วเท่านั้น — แถวยุคเก่าไม่ต้องมีธง
    // เพราะไม่มีอะไรให้ประกอบอยู่แล้ว (ดู addressText)
    if (row.addressOverride && (hasStructuredParts(values) || hasEnglishParts(values))) {
      next.addressOverride = true;
    }
    out.push(next);
  }
  return out;
}

// ที่อยู่ของลูกค้าหนึ่งราย โดยไม่ต้องรู้ว่าแถวนั้นย้ายมา addresses[] แล้วหรือยัง
// — แถวที่ยังไม่ backfill (หรือถูกสร้างโดยสายที่ส่งแต่ช่องเดี่ยว) ต้องยังเห็น
// ที่อยู่ครบ ไม่ใช่ว่างแล้วบันทึกทับหาย
export function customerAddresses(customer) {
  const listed = normalizeAddresses(customer?.addresses);
  if (listed.length) return listed;
  return normalizeAddresses(addressesFromLegacy(customer));
}

// ช่องเดี่ยวเดิม → ลิสต์ (ใช้ทั้งตอน backfill ฝั่ง client และตอน API รับ payload
// เก่าที่ยังส่ง address/shippingAddress มา)
// ⚠️ id ของแถวที่ derive มาต้อง **คงที่** ไม่ใช่ genId ใหม่ทุกครั้งที่เรียก:
// ฝั่งหน้าจอเรียกซ้ำทุก render และ dropdown เก็บค่าเป็น id — id ที่ขยับทุก render
// = เลือกที่อยู่แล้วช่องเด้งกลับว่างเอง และ id ที่ส่งไป server ก็จะไม่ตรงกับอะไรเลย
export function addressesFromLegacy(customer) {
  const billing = text(customer?.address).trim();
  const shipping = text(customer?.shippingAddress).trim();
  // เลขสาขาเดิมอยู่ที่ตัวลูกค้า — ติดไปกับ **ที่อยู่ออกบิล** เท่านั้น (ที่อยู่จัดส่ง/คลัง
  // ไม่ใช่สถานประกอบการที่ออกใบกำกับภาษี จึงไม่ควรพกเลขสาขาไปด้วย)
  const branchCode = normalizeBranchCode(customer?.branchCode);
  const rows = [];
  if (billing) {
    rows.push({
      id: 'ADR-legacy-billing',
      label: 'ที่อยู่ออกเอกสาร',
      address: billing,
      branchCode,
      // shippingAddress ว่าง = "ใช้ที่อยู่ออกเอกสารเป็นที่อยู่จัดส่ง" (กติกาเดิม)
      useFor: shipping && shipping !== billing ? 'billing' : 'both',
    });
  }
  if (shipping && shipping !== billing) {
    rows.push({ id: 'ADR-legacy-shipping', label: 'ที่อยู่จัดส่ง', address: shipping, useFor: 'shipping' });
  }
  return rows;
}

export function billingAddresses(list) {
  return normalizeAddresses(list).filter(isBillingAddress);
}

export function shippingAddresses(list) {
  return normalizeAddresses(list).filter(isShippingAddress);
}

export function primaryBillingAddress(list) {
  return billingAddresses(list)[0] || null;
}

export function primaryShippingAddress(list) {
  return shippingAddresses(list)[0] || null;
}

// ค่าที่ต้องเขียนลงคอลัมน์เดี่ยวเดิมให้ตรงกับลิสต์ (server เรียกก่อน insert/update)
// shippingAddress = null เมื่อที่อยู่จัดส่งหลักคือที่อยู่ออกบิลตัวเดียวกัน —
// ความหมายเดิมของ null คือ "ใช้ที่อยู่ออกเอกสาร" จึงคงไว้แบบนั้น
// fallbackBranchCode = เลขสาขาที่ลูกค้ารายนี้มีอยู่เดิม (customers.branchCode)
// ⚠️ ต้องส่งมาเสมอตอน PATCH: ลูกค้าที่ตั้งเลขสาขาไว้ก่อนหน้านี้ยังไม่มีเลขบนตัว
// ที่อยู่ (ยังไม่ backfill) — ถ้าไม่ถอยไปใช้ค่าเดิม การกดบันทึกฟอร์มครั้งเดียวจะ
// รีเซ็ตสาขาเป็น '00000' เงียบ ๆ แล้วใบกำกับภาษีใบถัดไปผิดทันที
export function legacyAddressMirror(list, { fallbackBranchCode } = {}) {
  const billing = primaryBillingAddress(list);
  const shipping = primaryShippingAddress(list);
  // ⚠️ ตกไปข้อความอังกฤษเมื่อแถวนั้นมีแต่ภาษาอังกฤษ — ไม่งั้นลูกค้าที่กรอกที่อยู่
  // อังกฤษอย่างเดียวจะโดนด่าน "ต้องมีที่อยู่อย่างน้อย 1 รายการ" ตีกลับ และคอลัมน์
  // เดี่ยวที่ตาราง/การค้นหา/snapshot อ่านอยู่จะกลายเป็น null
  return {
    address: billing ? (billing.address || billing.addressEn || null) : null,
    shippingAddress: shipping && shipping.id !== billing?.id
      ? (shipping.address || shipping.addressEn || null)
      : null,
    // สาขาของที่อยู่ออกบิลหลัก — ไม่มีระบุ = สำนักงานใหญ่ (ความหมายเดิมของ '00000')
    // not null เสมอเพราะคอลัมน์นี้อยู่ใน unique (taxId, branchCode): ปล่อย null
    // แล้ว unique จะหลุด (null ไม่ชนกับอะไรใน Postgres) = ลูกค้า taxId ซ้ำเข้าได้
    branchCode: normalizeBranchCode(billing?.branchCode)
      || normalizeBranchCode(fallbackBranchCode)
      || HEAD_OFFICE_BRANCH,
  };
}

// ── ที่อยู่ที่เอกสารหนึ่งใบเลือกใช้ ───────────────────────────────────────
// เอกสาร (ใบเสนอราคา/ใบสั่งขาย) เก็บ **ทั้ง id และตัวข้อความ**:
//   ข้อความ = snapshot ณ วันออกใบ (immutable — เอกสารที่ออกไปแล้วต้องไม่ขยับ)
//   id      = "เลือกที่อยู่ไหน" ซึ่งใบฉบับ Rev. ต้องรู้เพื่อดึงข้อความ **ของที่อยู่
//             ตัวเดิม** มาสดใหม่ ไม่ใช่เด้งกลับไปที่อยู่หลักของลูกค้า
// id ที่ชี้ไปที่อยู่ที่ถูกลบ/เปลี่ยนหน้าที่ไปแล้ว → ถอยไปใช้ที่อยู่หลัก ไม่ใช่ค้างว่าง
export function pickDocumentAddresses(customer, { billingAddressId, shippingAddressId } = {}) {
  const list = customerAddresses(customer);
  const pick = (id, usable) => (id ? list.find((a) => a.id === id && usable(a)) : null) || null;
  const billing = pick(billingAddressId, isBillingAddress) || primaryBillingAddress(list);
  const shipping = pick(shippingAddressId, isShippingAddress) || primaryShippingAddress(list) || billing;
  return {
    billing,
    shipping,
    snapshot: {
      // เอกสารไทยที่ลูกค้ามีแต่ที่อยู่อังกฤษ → พิมพ์อังกฤษ ดีกว่าพิมพ์ช่องว่าง
      // (มติ "อย่างน้อยหนึ่งภาษา" 2026-08-22) — ไม่ได้เพิ่มคีย์ใหม่ให้ snapshot
      billingAddress: billing ? (billing.address || billing.addressEn || null) : null,
      // ว่าง = ใช้ที่อยู่ออกบิล (ความหมายเดิมของช่องนี้บนเอกสาร)
      shippingAddress: shipping?.address || shipping?.addressEn
        || billing?.address || billing?.addressEn || null,
      // สาขา = ของ **ที่อยู่ออกบิลที่ใบนี้เลือก** (มติ 2026-08-06) — ออกบิลให้สาขา
      // ต้องได้เลขสาขานั้นบนใบกำกับภาษี ไม่ใช่เลขของสำนักงานใหญ่ตลอดกาล
      // ที่อยู่ที่ยังไม่ระบุสาขา → ถอยไปใช้เลขระดับลูกค้า (แถวยุคเก่าก่อน backfill)
      branchCode: normalizeBranchCode(billing?.branchCode) || customer?.branchCode || null,
      billingAddressId: billing?.id || null,
      shippingAddressId: shipping?.id || null,
    },
  };
}

// ป้ายสั้นสำหรับ dropdown/หัวการ์ด — ไม่ตั้งชื่อเรียกก็ใช้ตัวที่อยู่ย่อ ๆ แทน
// (ป้ายว่างใน dropdown = เลือกไม่ถูกว่าอันไหนคืออันไหน)
const LABEL_FALLBACK_MAX = 40;
export function addressLabel(a) {
  const row = asAddressRow(a);
  const name = row.label.trim();
  if (name) return name;
  const line = (row.address.trim() || row.addressEn.trim()).split(/\r?\n/)[0] || '';
  return line.length > LABEL_FALLBACK_MAX ? `${line.slice(0, LABEL_FALLBACK_MAX)}…` : (line || 'ที่อยู่');
}
