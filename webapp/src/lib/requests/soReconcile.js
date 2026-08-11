import { fmtNumber } from '@/lib/format';
// ── กระทบยอดกับใบสั่งขาย (P3d) — logic ล้วน ไม่แตะ DB ────────────────────
//
// ⭐ **เตือน ไม่บล็อก** (มติผู้ใช้) — ส่งเกิน SO เกิดได้จริง (แถมให้ลูกค้าเลือก)
// และส่งขาดก็เกิดได้ · บล็อกเมื่อไร คนจะเลี่ยงด้วยการ **ไม่บันทึกจำนวน** ซึ่งแย่กว่า
// ตัวเลขที่ไม่ตรงมาก เพราะตอนนั้นระบบจะไม่รู้อะไรเลยแทนที่จะรู้ว่าไม่ตรง
//
// ⚠️ เทียบกับ **จำนวนที่ลูกค้าคอนเฟิร์ม** ไม่ใช่จำนวนที่ส่ง — ของที่ส่งไปให้ลอง
// ไม่ใช่ของที่ขาย · `confirmedQty` ถูกบังคับให้มีตอน outcome = confirmed (0204)

// ผลรวมของฝั่ง SO — บรรทัดที่ qty ว่างถือเป็น 0 (คอลัมน์เป็น NOT NULL แต่แถวที่มา
// จาก import เก่าอาจเป็น 0 ได้จริง)
export function salesOrderQty(lines = []) {
  return (lines || []).reduce((sum, l) => sum + (Number(l?.qty) || 0), 0);
}

// ผลรวมของฝั่งคำร้อง — **เฉพาะแถวที่ลูกค้าคอนเฟิร์ม**
export function confirmedQty(items = []) {
  return (items || [])
    .filter((i) => i?.outcome === 'confirmed')
    .reduce((sum, i) => sum + (Number(i?.confirmedQty) || 0), 0);
}

// สรุปการกระทบยอด — คืน null เมื่อ "ยังไม่มีอะไรให้เทียบ"
//
// ⚠️ null ≠ ตรงกัน · หน้าจอต้องไม่แสดงแถบเขียวว่า "ครบแล้ว" ตอนที่ยังไม่มีใคร
// คอนเฟิร์มอะไรเลย — เงียบไปเลยถูกกว่าบอกผิด
export function soReconcile({ lines = [], items = [] } = {}) {
  const ordered = salesOrderQty(lines);
  const confirmed = confirmedQty(items);
  if (!ordered && !confirmed) return null;

  const diff = confirmed - ordered;
  return {
    ordered,
    confirmed,
    diff,
    // ยังไม่มีใครคอนเฟิร์ม = "ยังไม่เริ่ม" ไม่ใช่ "ขาด" — คนละความหมายกันสิ้นเชิง
    // (ขาด = ตัดสินใจแล้วแต่ได้ไม่ครบ · ยังไม่เริ่ม = ยังไม่ถึงเวลาตัดสิน)
    state: confirmed === 0 ? 'pending'
      : diff === 0 ? 'match'
        : diff > 0 ? 'over' : 'short',
  };
}

export const SO_RECONCILE_TONE = {
  pending: 'neutral',
  match: 'success',
  over: 'warning',
  short: 'warning',
};

export function soReconcileText(summary) {
  if (!summary) return null;
  const n = (v) => fmtNumber(v);
  if (summary.state === 'pending') {
    return `ใบสั่งขาย ${n(summary.ordered)} — ยังไม่มีรายการที่ลูกค้าคอนเฟิร์ม`;
  }
  const base = `ลูกค้าคอนเฟิร์ม ${n(summary.confirmed)} จาก ${n(summary.ordered)} ในใบสั่งขาย`;
  if (summary.state === 'match') return `${base} — ตรงกัน`;
  return summary.state === 'over'
    ? `${base} — เกิน ${n(summary.diff)}`
    : `${base} — ขาด ${n(-summary.diff)}`;
}
