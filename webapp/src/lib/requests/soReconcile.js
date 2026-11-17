import { fmtNumber } from '@/lib/format';
// ── กระทบยอดกับใบสั่งขาย (P3d) — logic ล้วน ไม่แตะ DB ────────────────────
//
// ⭐ **เตือน ไม่บล็อก** (มติผู้ใช้) — ส่งเกิน SO เกิดได้จริง (แถมให้ลูกค้าเลือก)
// และส่งขาดก็เกิดได้ · บล็อกเมื่อไร คนจะเลี่ยงด้วยการ **ไม่บันทึกจำนวน** ซึ่งแย่กว่า
// ตัวเลขที่ไม่ตรงมาก เพราะตอนนั้นระบบจะไม่รู้อะไรเลยแทนที่จะรู้ว่าไม่ตรง
//
// ⚠️ เทียบกับ **จำนวนแถวที่ลูกค้าคอนเฟิร์ม** ไม่ใช่จำนวนที่ส่ง — ของที่ส่งไปให้ลอง
// ไม่ใช่ของที่ขาย · ฝั่ง SO คือจำนวนกลิ่นที่ขาย (`qty` ของบรรทัดออกแบบกลิ่น) ฝั่งคำร้องคือ
// แถว (= กลิ่น) ที่ลูกค้าเลือก — หน่วยเดียวกันโดยโครงสร้าง

// ผลรวมของฝั่ง SO — บรรทัดที่ qty ว่างถือเป็น 0 (คอลัมน์เป็น NOT NULL แต่แถวที่มา
// จาก import เก่าอาจเป็น 0 ได้จริง)
export function salesOrderQty(lines = []) {
  return (lines || []).reduce((sum, l) => sum + (Number(l?.qty) || 0), 0);
}

/* ผลรวมของฝั่งคำร้อง — **นับแถวที่ลูกค้าคอนเฟิร์ม** ไม่ใช่รวมคอลัมน์ `confirmedQty`
   🐞 เดิมรวม `confirmedQty` ที่ผู้ใช้พิมพ์ตอนคอนเฟิร์ม ⇒ กลิ่นสามแถวที่กรอก 1000 (RQ-SB-26100375)
   กลายเป็น "คอนเฟิร์ม 3000 จาก 6" แล้วปิดใบได้ ทั้งที่ลูกค้าเลือกแค่ 3 กลิ่น · ช่องนั้นถูกถอดจากจอ
   แล้ว (13/11/2026) และแถวใหม่ได้ 1 ตายตัว — นับแถวตรง ๆ จึงได้ผลเดียวกันกับแถวใหม่ และถูกกับแถวเก่า */
export function confirmedQty(items = []) {
  return (items || []).filter((i) => i?.outcome === 'confirmed').length;
}

// สรุปการกระทบยอด — คืน null เมื่อ "ยังไม่มีอะไรให้เทียบ"
//
// ⚠️ null ≠ ตรงกัน · หน้าจอต้องไม่แสดงแถบเขียวว่า "ครบแล้ว" ตอนที่ยังไม่มีใคร
// คอนเฟิร์มอะไรเลย — เงียบไปเลยถูกกว่าบอกผิด
/* แถวที่คอนเฟิร์มแล้วระบุว่าเป็นของแถม (ม-164 PR-3 · `freebieReason` mig 0436) */
export function freebieQty(items = []) {
  return (items || []).filter((i) => i?.outcome === 'confirmed' && i.freebieReason).length;
}

export function soReconcile({ lines = [], items = [] } = {}) {
  const ordered = salesOrderQty(lines);
  const confirmed = confirmedQty(items);
  if (!ordered && !confirmed) return null;

  const diff = confirmed - ordered;
  /* ⭐ ม-164 PR-3 — ส่วนที่เกินต้องมีที่มา: ของแถม (ระบุบนแถว) หรือ SO ที่แนบ (นับอยู่ใน `ordered` แล้ว)
     · `unexplained` = เกินที่ยังไม่ระบุ — ด่านปิดใบบล็อกตัวนี้ · `state` เดิมไม่เปลี่ยนความหมาย */
  const freebies = freebieQty(items);
  const unexplained = Math.max(0, confirmed - freebies - ordered);
  return {
    ordered,
    confirmed,
    diff,
    freebies,
    unexplained,
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

/** โทนของการ์ด — เกินที่มีแถมรองรับครบ = เขียวเหมือนตรงกัน (ไม่มีอะไรต้องทำ) · ที่เหลือตาม `SO_RECONCILE_TONE` */
export function soReconcileTone(summary) {
  if (!summary) return undefined;
  if (summary.state === 'over' && !summary.unexplained) return 'success';
  return SO_RECONCILE_TONE[summary.state];
}

export function soReconcileText(summary) {
  if (!summary) return null;
  const n = (v) => fmtNumber(v);
  if (summary.state === 'pending') {
    return `ใบสั่งขาย ${n(summary.ordered)} — ยังไม่มีรายการที่ลูกค้าคอนเฟิร์ม`;
  }
  const base = `ลูกค้าคอนเฟิร์ม ${n(summary.confirmed)} จาก ${n(summary.ordered)} ในใบสั่งขาย`;
  if (summary.state === 'match') return `${base} — ตรงกัน`;
  if (summary.state === 'over') {
    // ม-164 PR-3 — แยก "แถม" (ระบุแล้ว) ออกจาก "เกินที่ยังไม่ระบุ" · แถวเก่าที่ไม่มีช่องนี้ = ยังไม่ระบุทั้งหมด
    const parts = [];
    if (summary.freebies) parts.push(`แถม ${n(summary.freebies)}`);
    if (summary.unexplained) parts.push(`เกิน ${n(summary.unexplained)} ยังไม่ระบุ`);
    return `${base} — ${parts.length ? parts.join(' · ') : `เกิน ${n(summary.diff)}`}`;
  }
  return `${base} — ขาด ${n(-summary.diff)}`;
}
