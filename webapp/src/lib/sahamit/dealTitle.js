// ── ชื่อดีลสหมิตร ───────────────────────────────────────────────────────────
//
// ฟอร์แมตเดียวทั้งโมดูล (มติ 2026-07-19): SHM_แบรนด์_ชื่อสินค้า ปริมาตร
// — แบรนด์ EN ก่อน TH, ปริมาตรจาก master; ส่วนที่ไม่มีข้อมูลละไว้ (ไม่มี underscore ค้าง)
// และไม่เติมปริมาตรซ้ำถ้าชื่อ (เช่นจากไฟล์ FC/PO) มีอยู่แล้ว.
//
// มติ 2026-10-15: ดีลจาก FC เติมเดือนส่งของท้ายชื่อ `(YYYY-MM)` — 1 รายการ FC = สินค้า × เดือน
// 🐞 เดิมสินค้าเดียวกันคนละเดือนส่งได้ชื่อตรงกันทุกใบ (HANASOL เลิฟ มี ม.ค./ก.พ./มี.ค. 70 สามใบชื่อเดียวกัน)
//    ⇒ รายการดีล / ดรอปดาวน์จับคู่ดีลกับบรรทัด PO แยกด้วยตาไม่ได้
// ⚠️ ไฟล์นี้เป็นสูตรล้วน (เทสต์ import ได้) — `lib/sahamit/server.js` ส่งออกซ้ำให้ผู้เรียกเดิม

const MONTH = /^\d{4}-\d{2}$/;

export function sahamitDealTitle(product, fallbackName, { month } = {}) {
  const name = fallbackName || product?.name || product?.fgCode || 'สินค้า';
  const brand = product?.brandNameEn || product?.brandNameTh || null;
  const volumeLabel = Number(product?.volume) > 0 ? `${product.volume}${product.volumeUnit || 'ml'}` : null;
  const nameWithVolume = volumeLabel && !String(name).includes(volumeLabel)
    ? `${name} ${volumeLabel}`
    : name;
  const base = ['SHM', brand, nameWithVolume].filter(Boolean).join('_');
  const monthKey = String(month || '').slice(0, 7);
  return MONTH.test(monthKey) ? `${base} (${monthKey})` : base;
}
