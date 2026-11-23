// ── แผ่น "ไม่นับ Actual / นับ Actual เต็ม / รายงวด" ของโมดัลอนุมัติใบสั่งขาย (mig 0412 + 0439) ──
//
// ⭐ ตัวคิดแผ่นตัวเดียวของโมดัลอนุมัติปกติและ Admin Override (ActualModeChoice ในหน้าใบ) — ลำดับตามมติเจ้าของ 20/11: ไม่นับ · เต็ม · รายงวด
// ⭐ เลือกไม่ได้ = แผ่นดับ + เหตุเป็นตัวหนังสือ (ไม่ซ่อนแผ่น — ผู้อนุมัติต้องรู้ว่ามีตัวเลือกนี้และทำไมใบนี้ใช้ไม่ได้)
// ⭐ `lockedReason` (มติเจ้าของ 23/11 · ใบค่าสรรพสามิต): ใบที่ไม่นับ Actual **โดยที่มา** ยังเห็นสามแผ่นหน้าตาเดียวกับใบปกติ
//    — แผ่น "ไม่นับ" ถูกเลือกไว้ · อีกสองแผ่นดับพร้อมเหตุ · ไม่มีช่องเหตุผล
//    ⛔ แผ่นที่เห็นเป็นการแสดงผล: ค่าที่ส่ง API ของใบค่าสรรพสามิตยังเป็น 'order' (CHECK ของ 0439 รับ 'none' เฉพาะใบ pipeline ·
//       ใบค่าสรรพสามิตไม่นับ Actual อยู่แล้วโดยที่มา — salesOrderCountedActual / sync ของ 0439 ตัดด้วย origin)
import { ACTUAL_MODE_INSTALLMENT, ACTUAL_MODE_NONE, ACTUAL_MODE_ORDER } from '@/lib/sales/salesOrderActualMode';

export const EXCISE_ACTUAL_LOCK_REASON = 'ใบค่าสรรพสามิตไม่นับ Actual';
const NOT_ALLOWED = 'ใบนี้เลือกไม่ได้';

/**
 * @param eligibility      actualModeEligibility (+ countRestDone) — แผ่นรายงวด
 * @param noneEligibility  actualNoneEligibility — แผ่นไม่นับ
 * @param lockedReason     มีค่า = ใบไม่นับ Actual โดยที่มา (ใบค่าสรรพสามิต) ⇒ ล็อกไว้ที่ "ไม่นับ"
 * @returns options ของ OptionTiles
 */
export function actualModeTileOptions({ eligibility, noneEligibility, lockedReason = '' } = {}) {
  if (lockedReason) {
    return [
      { value: ACTUAL_MODE_NONE, label: 'ไม่นับ Actual', description: `${lockedReason} โดยที่มา — ไม่ต้องใส่เหตุผล` },
      { value: ACTUAL_MODE_ORDER, label: 'นับ Actual เต็ม', description: NOT_ALLOWED, disabled: true },
      { value: ACTUAL_MODE_INSTALLMENT, label: 'นับ Actual รายงวด', description: NOT_ALLOWED, disabled: true },
    ];
  }
  const eligible = Boolean(eligibility?.eligible);
  const noneEligible = Boolean(noneEligibility?.eligible);
  return [
    {
      value: ACTUAL_MODE_NONE,
      label: 'ไม่นับ Actual',
      description: noneEligible
        ? 'อนุมัติใบตามปกติ แต่ยอดไม่เข้า Actual / % เป้า — ถาวร (อยากนับต้องย้อนอนุมัติแล้วออก Rev.)'
        : NOT_ALLOWED,
      disabled: !noneEligible,
    },
    { value: ACTUAL_MODE_ORDER, label: 'นับ Actual เต็ม', description: 'ยอดเต็มใบเข้า Actual เดือนนี้' },
    {
      value: ACTUAL_MODE_INSTALLMENT,
      label: 'นับ Actual รายงวด',
      /* มติข้อ 10: Rev. ของใบที่กด "นับที่เหลือทั้งหมด" แล้ว — ไม่มีการยื่นรายงวด (eligibility.countRestDone · review รอบสี่) */
      description: !eligible
        ? NOT_ALLOWED
        : eligibility?.countRestDone
          ? 'ใบก่อนหน้ากดนับที่เหลือทั้งหมดแล้ว — งวดที่ยังไม่นับนับให้เดือนนี้ทั้งหมด · ไม่ต้องยื่นรายงวด (มติข้อ 10)'
          : 'งวด 1 เข้าเดือนนี้ · งวดถัดไป ยื่น → AE Sup อนุมัติ → แจ้งสลิป → บัญชีรับรอง',
      disabled: !eligible,
    },
  ];
}

/* บรรทัดเหตุใต้แผ่น — ล็อก = เหตุเดียว · ปกติ = เหตุของแผ่นที่ดับ (ไม่นับ · รายงวด) */
export function actualModeTileNotes({ eligibility, noneEligibility, lockedReason = '' } = {}) {
  if (lockedReason) return [`${lockedReason} — เลือกแบบอื่นไม่ได้`];
  return [
    noneEligibility && !noneEligibility.eligible ? noneEligibility.reason : null,
    eligibility && !eligibility.eligible ? eligibility.reason : null,
  ].filter(Boolean);
}
