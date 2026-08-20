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

export function productIdentity(product, { fallback = '-' } = {}) {
  const code = productCode(product);
  const brand = productBrandName(product);
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
  return { code, brand, name, volume, meta, detail, text, search };
}
