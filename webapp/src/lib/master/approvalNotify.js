// แจ้งเตือน "ของที่อนุมัติแล้วตกกลับรออนุมัติเพราะถูกแก้" — จุดที่เคยเงียบสนิท
//
// ทำไมต้องแจ้ง: 'pending' ทำให้ลูกค้า/สินค้ารายนั้นหลุดจากลิสต์เลือกทุกหน้าทันที
// (GET คืนเฉพาะ approved) แต่เดิมไม่มีสัญญาณเลยทั้งสามชั้น — คนแก้ไม่รู้ว่าตัวเอง
// ทำให้ของหลุดคิวขาย · หัวหน้าไม่รู้ว่ามีของรออนุมัติเพิ่ม (chat มีแค่ตอน "สร้างใหม่"
// กับตอน "ตัดสิน") · คนที่จะออกใบเสนอราคาก็ค้นไม่เจอแบบไม่มีเหตุผลบอก
// ผลคือใบค้างเป็นวัน ๆ โดยไม่มีใครรู้ว่าต้องไปกดอะไร (เคสจริง 2026-07-26/27)
//
// ที่นี่เป็น implementation เดียวของการ์ดนี้ — ทั้งลูกค้าและสินค้าเรียกตัวเดียวกัน
import { chatCard, sendChat } from '@/lib/chat';

const ENTITY = {
  customer: { label: 'ลูกค้า', icon: '👤', linkPath: '/database/customers' },
  product: { label: 'สินค้า', icon: '📦', linkPath: '/database/products' },
};

// ชื่อฟิลด์ที่คนอ่านรู้เรื่อง — ไม่ครบทุกคอลัมน์โดยเจตนา (ที่ไม่มีในนี้โชว์ชื่อคอลัมน์ดิบ
// ซึ่งยังดีกว่าไม่บอกว่าแก้อะไร)
const FIELD_LABELS = {
  name: 'ชื่อลูกค้า',
  arCode: 'รหัสลูกค้า (AR)',
  taxId: 'เลขประจำตัวผู้เสียภาษี',
  branchCode: 'สาขา',
  address: 'ที่อยู่',
  shippingAddress: 'ที่อยู่จัดส่ง',
  teams: 'ทีมดูแล',
  team: 'ทีมดูแล',
  fgCode: 'FG Code',
  productDescription: 'ชื่อสินค้า',
  volume: 'ปริมาตร',
  saleUnit: 'หน่วยขาย',
  factoryPrice: 'ราคาโรงงาน',
  retailPriceIncVat: 'ราคาขายรวม VAT',
};

export function changedFieldSummary(changedFields = [], limit = 4) {
  const labels = (changedFields || []).map((field) => FIELD_LABELS[field] || field);
  if (!labels.length) return null;
  return labels.length > limit
    ? `${labels.slice(0, limit).join(', ')} +อีก ${labels.length - limit}`
    : labels.join(', ');
}

export function notifyMasterDataReapproval({ entityType, record, user, changedFields = [] }) {
  const meta = ENTITY[entityType];
  if (!meta || !record) return;
  sendChat('approvals', chatCard({
    title: `${meta.icon} ${meta.label}ตกกลับรออนุมัติ (ถูกแก้หลังอนุมัติ)`,
    subtitle: record.name || record.productDescription || record.fgCode || record.id,
    rows: [
      { label: entityType === 'customer' ? 'รหัสลูกค้า (AR)' : 'FG Code', value: record.arCode || record.fgCode },
      { label: 'ฟิลด์ที่แก้', value: changedFieldSummary(changedFields) },
      { label: 'ผู้แก้', value: user?.name },
      { label: 'ผลระหว่างรออนุมัติ', value: `${meta.label}รายนี้หลุดจากลิสต์เลือกทุกหน้า จนอนุมัติใหม่` },
    ],
    linkPath: meta.linkPath,
  }));
}
