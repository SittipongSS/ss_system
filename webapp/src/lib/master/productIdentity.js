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

// ระบบเป็น Thai-first: ชื่อสินค้าไทยก่อน แล้วค่อยอังกฤษ/shape จากระบบย่อย.
export function productDisplayName(product) {
  return first(
    product?.productDescription,
    product?.productNameTh,
    product?.metadata?.productNameTh,
    product?.productDescriptionEn,
    product?.productNameEn,
    product?.metadata?.productNameEn,
    product?.productName,
    product?.name,
    product?.description,
  );
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
