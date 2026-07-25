// SAHAMIT — flag detection (pure). Given all FC rounds + POs (+ optional locks),
// returns the flags to raise across EVERY consecutive round pair: drops, shifts,
// PO-filled suspects, and lockedBreaks.
//
// กฎแกน (peak ไม่ควรลด): ดีมานด์รวม = FC + PO ต้องไม่ลด. เมื่อ FC เดือนหนึ่งลดลง
// ระหว่างรอบ → หักด้วย "PO ที่รับเข้ามาใหม่ในช่วงระหว่างสองรอบนั้น" (คือ PO ที่มา
// เติมทำให้ลูกค้าลด FC): ส่วนที่ PO อธิบายได้ = 'po_filled' (peak ไม่ลด — ให้คนยืนยัน
// ว่าเติมเต็ม), ส่วนที่เหลือ PO ไม่ถึง = 'drop' (peak ลดจริง = ตัด). ห้ามเอา PO เก่า
// (ก่อนรอบก่อนหน้า) มากลบ — นับเฉพาะ PO ที่มาใหม่ กันซ่อนการตัดจริง.
//
// ทำทุกคู่รอบ (ไม่ใช่แค่รอบล่าสุด) เพื่อให้ backfill/แก้/ลบ รอบกลางแล้วธงถูกต้อง.
import { compareRounds } from './forecastClient';
import { buildReconMatrix } from './reconcileClient';

const day = (d) => String(d || '').slice(0, 10);

// PO qty (active lines) ของ SKU ที่รับเข้าในช่วง (afterDate, untilDate].
// afterDate/untilDate เป็น 'YYYY-MM-DD' (untilDate ว่าง = ไม่จำกัดปลายบน).
function poReceivedInWindow(pos, fgCode, afterDate, untilDate) {
  let sum = 0;
  for (const po of pos || []) {
    const rd = day(po.receivedDate);
    if (!rd) continue;
    if (afterDate && !(rd > afterDate)) continue;
    if (untilDate && !(rd <= untilDate)) continue;
    for (const l of po.lines || []) {
      if (l.fgCode !== fgCode || l.status === 'cancelled') continue;
      sum += Number(l.qty || 0);
    }
  }
  return sum;
}

export function detectFlags(rounds, pos = [], locks = []) {
  const ordered = [...(rounds || [])].sort((a, b) => (a.roundNo || 0) - (b.roundNo || 0));
  if (!ordered.length) return [];
  const out = [];

  // ทุกคู่รอบต่อเนื่อง: diff แล้วหัก PO ที่มาใหม่ในช่วงวันที่ระหว่างสองรอบ.
  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const cur = ordered[i];
    const roundNo = cur.roundNo;
    const dPrev = day(prev.receivedDate);
    const dCur = day(cur.receivedDate);
    const cmp = compareRounds(ordered, i); // เทียบ cur vs prev รายสินค้า

    for (const s of cmp.perSku) {
      // ยอด FC ที่ลดจริงของสินค้านี้ในทรานสิชันนี้ (decreases + removed; shift ถูกจับคู่ออกแล้ว)
      const drops = [];
      for (const d of s.diff.decreases) drops.push({ month: d.month, prevQty: d.oldQty, newQty: d.newQty, qty: d.oldQty - d.newQty });
      for (const r of s.diff.removed) drops.push({ month: r.month, prevQty: r.qty, newQty: 0, qty: r.qty });
      drops.sort((a, b) => String(a.month).localeCompare(String(b.month)));

      // งบ PO ที่มาใหม่ (afterPrev, untilCur] — เฉพาะที่มาหลังรอบก่อนหน้า จนถึงรอบนี้
      let budget = poReceivedInWindow(pos, s.fgCode, dPrev, dCur);
      for (const dr of drops) {
        const filled = Math.max(0, Math.min(dr.qty, budget));
        budget -= filled;
        const cut = dr.qty - filled;
        if (filled > 0) {
          out.push({ fgCode: s.fgCode, month: dr.month, roundNo, prevQty: dr.prevQty, newQty: dr.newQty, drop: filled, kind: 'po_filled' });
        }
        if (cut > 0) {
          out.push({ fgCode: s.fgCode, month: dr.month, roundNo, prevQty: dr.prevQty, newQty: dr.newQty, drop: cut, kind: 'drop' });
        }
      }

      // shift (ยอดย้ายเดือน — peak คงที่อยู่แล้ว, ให้คนยืนยันว่าเลื่อนจริง)
      for (const sh of s.diff.shifts) {
        out.push({ fgCode: s.fgCode, month: sh.fromMonth, roundNo, prevQty: sh.fromQty, newQty: 0, drop: sh.fromQty, kind: 'shift_suspect', shiftToMonth: sh.toMonth });
      }
    }
  }

  // lockedBreak: ช่องที่ล็อก (FC=PO ตกลงแล้ว) แต่ FC ปัจจุบันต่างจากที่ล็อก — เทียบกับ
  // ยอดล่าสุด (roundNo ล่าสุด). ไม่เกี่ยวกับ PO netting.
  if (locks && locks.length) {
    const latestNo = ordered[ordered.length - 1].roundNo;
    const matrix = buildReconMatrix(ordered, []);
    const fcAt = new Map();
    for (const row of matrix.rows) for (const m of matrix.months) fcAt.set(`${row.fgCode}||${m}`, row.cells[m]?.fcQty || 0);
    for (const lk of locks) {
      const cur = fcAt.get(`${lk.fgCode}||${lk.month}`) || 0;
      if (cur !== Number(lk.lockedQty)) {
        out.push({ fgCode: lk.fgCode, month: lk.month, roundNo: latestNo, prevQty: Number(lk.lockedQty), newQty: cur, drop: Number(lk.lockedQty) - cur, kind: 'lockedBreak' });
      }
    }
  }

  return out;
}

export const FLAG_KIND_LABEL = {
  drop: 'FC ลด/หาย',
  po_filled: 'น่าจะเติมเต็มด้วย PO',
  shift_suspect: 'น่าจะเลื่อน',
  lockedBreak: 'แก้ช่องที่ล็อก',
};
export const FLAG_STATUS_LABEL = {
  open: 'ต้องตรวจ',
  confirmed_shift: 'ยืนยันเลื่อน',
  confirmed_filled: 'เติมเต็มด้วย PO',
  confirmed_cut: 'ลูกค้าตัดจริง',
  ignored: 'ไม่นับ',
};
