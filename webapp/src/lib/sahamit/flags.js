// SAHAMIT — flag detection (pure). Given all FC rounds (+ optional locks),
// returns the flags to raise for the LATEST round: drops/shift-suspects (vs the
// previous round) and lockedBreaks (a locked cell whose effective FC changed).
// Used at import time to populate sahamit_fc_flags (the shift/cut audit queue).
import { compareRounds } from './forecastClient';
import { buildReconMatrix } from './reconcileClient';

export function detectFlags(rounds, locks = []) {
  const ordered = [...(rounds || [])].sort((a, b) => (a.roundNo || 0) - (b.roundNo || 0));
  if (!ordered.length) return [];
  const latest = ordered[ordered.length - 1];
  const roundNo = latest.roundNo;
  const out = [];

  // Drops / shifts vs the previous round (only when there is a previous round).
  if (ordered.length >= 2) {
    const cmp = compareRounds(ordered, ordered.length - 1);
    for (const s of cmp.perSku) {
      for (const d of s.diff.decreases) {
        out.push({ fgCode: s.fgCode, month: d.month, roundNo, prevQty: d.oldQty, newQty: d.newQty, drop: d.oldQty - d.newQty, kind: 'drop' });
      }
      for (const r of s.diff.removed) {
        out.push({ fgCode: s.fgCode, month: r.month, roundNo, prevQty: r.qty, newQty: 0, drop: r.qty, kind: 'drop' });
      }
      for (const sh of s.diff.shifts) {
        out.push({ fgCode: s.fgCode, month: sh.fromMonth, roundNo, prevQty: sh.fromQty, newQty: 0, drop: sh.fromQty, kind: 'shift_suspect', shiftToMonth: sh.toMonth });
      }
    }
  }

  // lockedBreak: a locked cell whose current effective FC differs from lockedQty.
  if (locks && locks.length) {
    const matrix = buildReconMatrix(ordered, []);
    const fcAt = new Map();
    for (const row of matrix.rows) for (const m of matrix.months) fcAt.set(`${row.fgCode}||${m}`, row.cells[m]?.fcQty || 0);
    for (const lk of locks) {
      const cur = fcAt.get(`${lk.fgCode}||${lk.month}`) || 0;
      if (cur !== Number(lk.lockedQty)) {
        out.push({ fgCode: lk.fgCode, month: lk.month, roundNo, prevQty: Number(lk.lockedQty), newQty: cur, drop: Number(lk.lockedQty) - cur, kind: 'lockedBreak' });
      }
    }
  }

  return out;
}

export const FLAG_KIND_LABEL = {
  drop: 'FC ลด/หาย',
  shift_suspect: 'น่าจะเลื่อน',
  lockedBreak: 'แก้ช่องที่ล็อก',
};
export const FLAG_STATUS_LABEL = {
  open: 'ต้องตรวจ',
  confirmed_shift: 'ยืนยันเลื่อน',
  confirmed_cut: 'ลูกค้าตัดจริง',
  ignored: 'ไม่นับ',
};
