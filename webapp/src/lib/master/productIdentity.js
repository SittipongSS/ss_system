const clean = (value) => String(value ?? '').trim();

const first = (...values) => values.map(clean).find(Boolean) || '';

export function productCode(product) {
  return first(product?.fgCode, product?.code);
}

// แบรนด์บนหน้าจอใช้ชื่อทางการภาษาอังกฤษก่อน แล้วค่อย fallback ภาษาไทย.
// ค่า metadata.productBrand คือ snapshot ที่ตรึงมากับรายการในเอกสารขาย.
export function productBrandName(product) {
  return first(
    product?.metadata?.productBrand,
    product?.productBrand,
    product?.brandNameEn,
    product?.metadata?.brandNameEn,
    product?.brandName,
    product?.brandNameTh,
    product?.metadata?.brandNameTh,
  );
}

const thaiNameChain = (product) => [
  product?.productDescription,
  product?.productNameTh,
  product?.metadata?.productNameTh,
];

const englishNameChain = (product) => [
  product?.productDescriptionEn,
  product?.productNameEn,
  product?.metadata?.productNameEn,
];

// ชื่อกลาง ๆ ที่ไม่ได้บอกภาษา — ท้ายสุดของทั้งสองทาง
const neutralNameChain = (product) => [
  product?.productName,
  product?.name,
  product?.description,
];

// ระบบเป็น Thai-first: ชื่อสินค้าไทยก่อน แล้วค่อยอังกฤษ/shape จากระบบย่อย.
export function productDisplayName(product) {
  return first(...thaiNameChain(product), ...englishNameChain(product), ...neutralNameChain(product));
}

/* ชื่อสินค้าตาม "ภาษาที่เลือก" แล้วค่อยตกไปอีกภาษา (มติผู้ใช้ 2026-08-20)
   ใช้กับ **เอกสารที่เลือกภาษาได้** (ใบเสนอราคา mig 0238) เท่านั้น — หน้าจอทำงาน
   ยังเป็น Thai-first ตามเดิม (`productDisplayName`) เพราะคนในบริษัทอ่านไทย
   ⚠️ ไม่แปลให้เอง: สินค้าที่ยังไม่กรอกชื่ออังกฤษ เอกสารอังกฤษจะได้ชื่อไทยไป
   ซึ่งถูกต้องกว่าเดา — ที่แก้คือไปกรอกชื่ออังกฤษที่ฐานข้อมูลสินค้า */
export function productDisplayNameFor(product, language) {
  const en = String(language || '').toLowerCase() === 'en';
  return en
    ? first(...englishNameChain(product), ...thaiNameChain(product), ...neutralNameChain(product))
    : productDisplayName(product);
}

export function productVolumeLabel(product) {
  if (product?.volume === null || product?.volume === undefined || product?.volume === '') return '';
  return `${clean(product.volume)} ${first(product?.volumeUnit, 'ml')}`;
}

/* ชื่อหมวดสินค้า (ไทยก่อน) — `categoryName` แปะมากับลิสต์ `GET /api/products` ส่วน
   `metadata.categoryName` คือ snapshot ที่ตรึงมากับบรรทัดเอกสารขาย (มติผู้ใช้ 2026-09-22)
   ไม่มีชื่อ = '' (ไม่ถอยไปโชว์รหัสหมวด — รหัสหมวดอยู่ในรหัส FG อยู่แล้ว) */
export function productCategoryName(product) {
  return first(product?.categoryName, product?.metadata?.categoryName);
}

export function productIdentity(product, { fallback = '-' } = {}) {
  const code = productCode(product);
  const brand = productBrandName(product);
  const category = productCategoryName(product);
  const name = productDisplayName(product);
  const volume = productVolumeLabel(product);
  const meta = [code, brand].filter(Boolean).join(' · ');
  const detail = [name, volume].filter(Boolean).join(' · ');
  const text = [meta, detail].filter(Boolean).join(' · ') || fallback;
  const search = [
    code,
    product?.brandName,
    product?.brandNameEn,
    product?.brandNameTh,
    product?.metadata?.brandNameTh,
    product?.metadata?.brandNameEn,
    product?.productDescription,
    product?.productDescriptionEn,
    product?.productNameTh,
    product?.productNameEn,
    product?.metadata?.productNameTh,
    product?.metadata?.productNameEn,
    product?.productName,
    product?.name,
    product?.metadata?.productBrand,
    volume,
  ].map(clean).filter(Boolean).join(' ');
  return { code, brand, category, name, volume, meta, detail, text, search };
}

/* ป้ายเจ้าของ — ขึ้นเฉพาะ FG ที่ไม่ได้อยู่ใต้ใบลูกค้าที่กำลังออกเอกสารให้ แต่เป็นของ
   ใบอื่นในนิติบุคคลเดียวกัน (`GET /api/products?taxSiblings=1` เป็นคนแนบมา)
   ⇒ **มีป้าย = ของอีกใบ · ไม่มีป้าย = ของใบนี้เอง** ซึ่งเป็นสัญญาณเดียวที่คนเลือกมี
   เพราะลิสต์เรียงตามรหัส FG ปนกันทุกเจ้าของ */
export function productOwnerTag(p) {
  if (!p?.ownerArCode && !p?.ownerName) return '';
  const who = p.ownerArCode || p.ownerName;
  return p.ownerBranchCode ? `${who} · สาขา ${p.ownerBranchCode}` : String(who);
}

/* สองชั้นของตัวเลือกสินค้ามาตรฐาน — ชั้นบน (รอง) `รหัส · แบรนด์ [· ชื่อหมวด] [· เจ้าของ]`
   ชั้นล่าง (หลัก) `ชื่อสินค้า · ปริมาตร` · `text` = สองชั้นต่อกันเป็นบรรทัดเดียว
   (ช่องที่เลือกแล้ว · aria · snapshot ที่ server เก็บลงใบ) — server กับจอจึงได้ประโยคเดียวกัน
   `withCategory` — ต่อ **ชื่อ**หมวดท้ายแบรนด์ ไม่ใส่รหัสหมวดเพราะอยู่ในรหัส FG แล้ว
   (มติผู้ใช้ 2026-09-22 ใบเสนอราคา · 2026-11-26 คำร้องทุกช่องที่เลือก FG)
   ⚠️ ชื่อหมวดมาจาก `categoryName` ที่แปะมากับแถว (`attachCategoryNames`) — ไม่มีก็แค่ไม่ขึ้น */
export function productOptionParts(product, { withCategory = false } = {}) {
  const identity = productIdentity(product);
  const ownerTag = productOwnerTag(product);
  const category = withCategory ? identity.category : '';
  const meta = [identity.meta, category, ownerTag].filter(Boolean).join(' · ');
  return {
    meta,
    detail: identity.detail,
    text: [meta, identity.detail].filter(Boolean).join(' · ') || identity.text,
    // ตาเห็นบนแถว = ต้องค้นเจอ — ชื่อบริษัทเจ้าของก็ต้องค้นเจอแม้ป้ายจะโชว์แค่รหัส AR
    search: [identity.search, category, ownerTag, product?.ownerName].filter(Boolean).join(' '),
  };
}
