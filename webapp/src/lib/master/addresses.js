// ── ที่อยู่ลูกค้าหลายรายการ (migration 0201) ──────────────────────────────
// เดิมลูกค้า 1 ราย = ที่อยู่ออกบิล 1 (customers.address) + ที่อยู่จัดส่ง 1
// (shippingAddress) และ "สาขา" คือ **ลูกค้าคนละแถว** (unique (taxId, branchCode)
// จาก mig 0039) ซึ่งไม่มีใครใช้จริง — ของจริงคือบริษัทเดียวมีหลายที่อยู่/หลายสาขา
// และใบเสนอราคาต้องเลือกได้ว่าออกบิลที่ไหน ส่งที่ไหน
//
// รูปเก็บ: customers.addresses = [{ id, label, branchCode, address, useFor }]
//   useFor = 'both' | 'billing' | 'shipping' — เป็นค่าเดียว 3 ทาง ไม่ใช่ธงสองตัว
//   อิสระ เพราะธงสองตัวมีสถานะ "ไม่ใช้ทำอะไรเลย" ที่บันทึกได้แต่ไม่มีความหมาย
//
// คอลัมน์เดี่ยวเดิม address / shippingAddress / branchCode ยังอยู่ในฐานะ
// "กระจก" ของที่อยู่หลัก (แพตเทิร์นเดียวกับ contacts[] → contactPerson/
// contactPhone/email) เพราะมีสายที่อ่านช่องเดี่ยวอยู่จริงและต้องไม่พัง:
// snapshot ใบเสนอราคา/ใบสั่งขาย, ตารางลูกค้า, การค้นหา
//
// "ที่อยู่หลัก" = รายการแรกในลิสต์ที่ใช้งานนั้นได้ (กติกาเดียวกับผู้ติดต่อคนแรก
// = ผู้ติดต่อหลัก) — ไม่มีธง isPrimary แยก เพราะสองธง (บิล/จัดส่ง) จะขัดกันเอง
// ได้ และลำดับในลิสต์เป็นสิ่งที่ผู้ใช้เห็นและสลับได้ตรง ๆ อยู่แล้ว
import { genId } from '@/lib/id';

export const ADDRESS_USES = ['both', 'billing', 'shipping'];

export const ADDRESS_USE_LABELS = {
  both: 'ออกเอกสาร + จัดส่ง',
  billing: 'ออกเอกสารอย่างเดียว',
  shipping: 'จัดส่งอย่างเดียว',
};

export const HEAD_OFFICE_BRANCH = '00000';

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

// แถวเดียว → รูปมาตรฐาน. ไม่ trim ระหว่างพิมพ์ (ดูเหตุผลใน BrandsEditor:
// trim ทุก re-render = เคาะเว้นวรรคท้ายคำไม่ได้) — trim จริงทำตอน normalize
// ก่อนบันทึกที่ API
export function asAddressRow(raw) {
  if (typeof raw === 'string') {
    return { id: '', label: '', branchCode: HEAD_OFFICE_BRANCH, address: raw, useFor: 'both' };
  }
  return {
    id: text(raw?.id),
    label: text(raw?.label),
    branchCode: text(raw?.branchCode) || HEAD_OFFICE_BRANCH,
    address: text(raw?.address),
    useFor: addressUse(raw),
  };
}

// ก่อนบันทึก: trim, ตัดแถวที่ไม่มีตัวที่อยู่ (ป้ายชื่อล้วนไม่ใช่ที่อยู่), เติม id
// ให้แถวใหม่ — id ต้องนิ่งเพราะเอกสารฝั่งขายจะอ้างถึงที่อยู่ตัวนี้
export function normalizeAddresses(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const raw of arr) {
    const row = asAddressRow(raw);
    const address = row.address.trim();
    if (!address) continue;
    out.push({
      id: row.id.trim() || genId('ADR'),
      label: row.label.trim(),
      branchCode: row.branchCode.trim() || HEAD_OFFICE_BRANCH,
      address,
      useFor: row.useFor,
    });
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
  const branchCode = text(customer?.branchCode).trim() || HEAD_OFFICE_BRANCH;
  const billing = text(customer?.address).trim();
  const shipping = text(customer?.shippingAddress).trim();
  const rows = [];
  if (billing) {
    rows.push({
      id: 'ADR-legacy-billing',
      label: branchCode === HEAD_OFFICE_BRANCH ? 'สำนักงานใหญ่' : `สาขา ${branchCode}`,
      branchCode,
      address: billing,
      // shippingAddress ว่าง = "ใช้ที่อยู่ออกเอกสารเป็นที่อยู่จัดส่ง" (กติกาเดิม)
      useFor: shipping && shipping !== billing ? 'billing' : 'both',
    });
  }
  if (shipping && shipping !== billing) {
    rows.push({ id: 'ADR-legacy-shipping', label: 'ที่อยู่จัดส่ง', branchCode, address: shipping, useFor: 'shipping' });
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
export function legacyAddressMirror(list) {
  const billing = primaryBillingAddress(list);
  const shipping = primaryShippingAddress(list);
  return {
    address: billing?.address || null,
    shippingAddress: shipping && shipping.id !== billing?.id ? shipping.address : null,
    branchCode: billing?.branchCode || HEAD_OFFICE_BRANCH,
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
      billingAddress: billing?.address || null,
      // ว่าง = ใช้ที่อยู่ออกบิล (ความหมายเดิมของช่องนี้บนเอกสาร)
      shippingAddress: shipping?.address || billing?.address || null,
      branchCode: billing?.branchCode || customer?.branchCode || null,
      billingAddressId: billing?.id || null,
      shippingAddressId: shipping?.id || null,
    },
  };
}

// ป้ายสั้นสำหรับ dropdown/หัวการ์ด — "ชื่อเรียก · สาขา 00001"
export function addressLabel(a) {
  const row = asAddressRow(a);
  const name = row.label.trim();
  const branch = row.branchCode.trim();
  const branchText = !branch || branch === HEAD_OFFICE_BRANCH ? 'สำนักงานใหญ่' : `สาขา ${branch}`;
  if (!name) return branchText;
  return name === branchText ? name : `${name} · ${branchText}`;
}
