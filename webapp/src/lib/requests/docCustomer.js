// ── ข้อมูลลูกค้าบน IFRA / MSDS (ม-167 · มติเจ้าของ 25/11/2026) — logic ล้วน ─────────────────────────────
//
// ⭐ เจ้าของ: *"ทั้งสองอันต้องโชว์ ข้อมูลลูกค้า ชื่อ ที่อยู่ เบอร์ ทั้งไทย และ อังกฤษ"* — ถามทีละข้อ 25/11:
//    1 ที่อยู่: **ผู้ขอเลือก** 1 ที่อยู่ต่อใบ (`dept_requests.customerAddressId` · mig 0440) · ตั้งต้น = ที่อยู่ออกเอกสารหลัก
//    2 ทะเบียนยังไม่มีอังกฤษ = **บังคับก่อนส่ง** (ร่างบันทึกได้ · กดส่งไม่ได้)
//    3 เบอร์ **บังคับด้วย** — เบอร์บริษัทก่อน ไม่มีใช้เบอร์ผู้ติดต่อของที่อยู่ที่เลือก
// 🐞 ที่มา (prod 25/11): ลูกค้าในใบ DC 22 ราย มีชื่อ/ที่อยู่อังกฤษ 7 · มีเบอร์บริษัท 6 · ฝ่ายขายพิมพ์
//    "SAVE LIFE PRODUCTS CO., LTD. 97 Moo 10 …" ลงช่องรายละเอียดเองเพื่อให้ RD ก๊อปไปใส่ใบรับรอง
//
// ⚠️ **อ่านสดจากทะเบียนลูกค้า** — ใบเก็บแค่ id ของที่อยู่ · แก้ทะเบียนแล้วใบเห็นทันที (ไม่มีสำเนาให้ไล่ซิงก์)
// ⚠️ ไม่บังคับชื่อ/ที่อยู่ไทย — ลูกค้าต่างชาติมีแต่อังกฤษได้ (กติกา "อย่างน้อยหนึ่งภาษา" ของทะเบียน · mig 0283)
import { REQUEST_CUSTOMER_DOC_TYPES } from '@/lib/requests/docTypes';
import { addressLabel, addressText, addressTextEn, addressUse, asAddressRow, customerAddresses } from '@/lib/master/addresses';

const clean = (value) => String(value ?? '').trim();

/** ใบนี้มีบรรทัดที่ต้องพิมพ์ข้อมูลลูกค้าไหม (IFRA · MSDS) */
export function requestNeedsDocCustomer(items = []) {
  return (items || []).some((row) => row?.lineKind === 'document'
    && REQUEST_CUSTOMER_DOC_TYPES.includes(clean(row?.docType)));
}

/** ที่อยู่ทุกแถวของลูกค้า (รวมที่อยู่จัดส่ง — ใบรับรองบางใบใช้ที่อยู่สาขา/ไซต์) ในรูปที่จอใช้ */
export function docCustomerAddressChoices(customer) {
  return customerAddresses(customer).map((a) => {
    const row = asAddressRow(a);
    return {
      id: row.id,
      label: addressLabel(a),
      useFor: addressUse(a),
      th: addressText(a).trim(),
      en: addressTextEn(a).trim(),
      contactPhone: clean(row.contactPhone) || null,
    };
  });
}

/** ที่อยู่ตั้งต้น — แถวแรกที่ใช้ออกเอกสารได้ (กติกา "ที่อยู่หลัก = แถวแรก" ของทะเบียน) · ไม่มีเลย = แถวแรก */
export function docCustomerDefaultAddressId(choices = []) {
  return (choices.find((c) => c.useFor !== 'shipping') || choices[0] || null)?.id || null;
}

/**
 * ภาพข้อมูลลูกค้าของใบ — `{ customerId, nameTh, nameEn, companyPhone, phone, phoneFrom, addressId, address, choices, addressStale }`
 * @param customer แถว `customers` (`id, name, nameEn, phone, addresses, address, shippingAddress, branchCode`)
 * @param addressId ที่อยู่ที่ใบเลือก — ว่าง = ตั้งต้น · ไม่พบในทะเบียนแล้ว = ตกไปตั้งต้น + `addressStale`
 */
export function docCustomerView(customer, addressId = null) {
  if (!customer) return null;
  return docCustomerPickAddress({
    customerId: customer.id || null,
    nameTh: clean(customer.name),
    nameEn: clean(customer.nameEn),
    companyPhone: clean(customer.phone),
    choices: docCustomerAddressChoices(customer),
  }, addressId);
}

/**
 * ภาพเดิม + ที่อยู่ที่เลือก — ฟอร์มเรียกตอนกดเลือกที่อยู่ (choices มาครบแล้ว ไม่ต้องถาม server ซ้ำ)
 * ⭐ เบอร์: เบอร์บริษัทก่อน ไม่มี = เบอร์ผู้ติดต่อของที่อยู่ที่เลือก (มติ 25/11) ⇒ เปลี่ยนที่อยู่แล้วเบอร์เปลี่ยนตามได้
 */
export function docCustomerPickAddress(view, addressId = null) {
  if (!view) return null;
  const choices = view.choices || [];
  const wanted = clean(addressId);
  const found = wanted ? choices.find((c) => c.id === wanted) : null;
  const address = found || choices.find((c) => c.id === docCustomerDefaultAddressId(choices)) || null;
  const companyPhone = clean(view.companyPhone);
  const phone = companyPhone || address?.contactPhone || '';
  return {
    ...view,
    companyPhone,
    phone,
    phoneFrom: companyPhone ? 'company' : (phone ? 'address' : null),
    addressId: address?.id || null,
    address,
    addressStale: Boolean(wanted && !found),
  };
}

/** ช่องที่ยังขาด — `[{ key, label }]` (ลำดับเดียวกับบนจอ) */
export function docCustomerGaps(view) {
  if (!view) return [{ key: 'customer', label: 'ลูกค้าของใบ' }];
  const gaps = [];
  if (!view.nameEn) gaps.push({ key: 'nameEn', label: 'ชื่อภาษาอังกฤษ' });
  if (!view.address) gaps.push({ key: 'address', label: 'ที่อยู่' });
  else if (!view.address.en) gaps.push({ key: 'addressEn', label: 'ที่อยู่ภาษาอังกฤษ' });
  if (!view.phone) gaps.push({ key: 'phone', label: 'เบอร์โทร' });
  return gaps;
}

/** ประโยคด่านกดส่ง — ตัวเดียวกันทั้งจอ (ก่อนเปิดโมดัล) และ server (409) · null = ผ่าน */
export function docCustomerSubmitError(view) {
  const gaps = docCustomerGaps(view);
  if (!gaps.length) return null;
  return `ข้อมูลลูกค้าสำหรับ IFRA / MSDS ยังไม่ครบ: ${gaps.map((g) => g.label).join(' · ')} — กรอกที่ทะเบียนลูกค้าแล้วกดส่งอีกครั้ง`;
}

/** ที่อยู่ที่ใบส่งมาเป็นของลูกค้ารายนี้จริงไหม — null = ผ่าน (ว่าง = ใช้ตั้งต้น) */
export function docCustomerAddressError(customer, addressId) {
  const wanted = clean(addressId);
  if (!wanted) return null;
  if (!customer) return 'ใบนี้ยังไม่มีลูกค้า — เลือกที่อยู่ไม่ได้';
  return docCustomerAddressChoices(customer).some((c) => c.id === wanted)
    ? null
    : 'ที่อยู่ที่เลือกไม่ใช่ที่อยู่ของลูกค้ารายนี้ (อาจถูกลบจากทะเบียนแล้ว) — เลือกใหม่';
}
