// ── รางสามขั้นบนตารางทะเบียนสัญญา (มติผู้ใช้ 2026-08-22) ────────────────────
//
// ⭐ ภาษาเดียวกับ **การ์ดจัดการในหน้าใบ** ซึ่งเดินสามขั้นอยู่แล้ว:
//    ร่าง → รอลงนาม → ลงนามแล้ว · คนคนเดียวกันเปิดสองหน้านี้ห่างกันคลิกเดียว
//    ถ้าคำหรือลำดับไม่ตรงกันจะอ่านเหมือนคนละเรื่อง (บทเรียนจากราง SO/คำร้อง)
//
// ⚠️ **ตรรกะอยู่ที่นี่ ไม่ใช่ในหน้าเว็บ** — `components/ui/StepTrack` วาดอย่างเดียว
//    (แพตเทิร์นเดียวกับ `salesOrderListTrack.js` และ `requests/queueTrack.js`)
import { daysAwaitingSignature } from '@/lib/sales/contracts';

const step = (key, label, state, note = null) => ({ key, label, state, note });

// เกินกี่วันถือว่าต้องโทรตาม — ตัวเลขเดียวกับการ์ดสรุปบนหัวทะเบียน ("ค้างเกิน 14 วัน")
export const SIGNATURE_LATE_DAYS = 14;

/**
 * รางของสัญญาหนึ่งใบ
 *
 * @param contract แถวจาก `/api/sales-planning/contracts` — ใช้ `status` · `contractNo`
 *                 · `issuedAt` · `signedDate` · `_quotationClosure`
 * @returns {{closed: boolean, steps: Array<{key,label,state,note}>}}
 *          `closed: true` = ใบยกเลิก/ถูกแทนด้วยฉบับแก้ไข → **ไม่มีรางให้เดิน**
 *          หน้าเว็บโชว์ป้ายแทน (ลากรางที่ตายแล้วมาวาดทำให้อ่านเหมือนใบยังเดินอยู่)
 */
export function contractListTrack(contract = {}) {
  const status = contract?.status || 'draft';
  if (status === 'cancelled' || status === 'revised') return { closed: true, steps: [] };

  /* ⭐ `awaiting_approval` เพิ่ม 2026-08-31 (mig 0323) — ใบที่ SA บันทึกลงนามแล้ว
     แต่ AE Sup ยังไม่รับรอง · ต้องนับว่า "ออกเลขแล้ว" ด้วย ไม่งั้นรางถอยกลับไปขั้นร่าง
     🪤 ลืมเติมสถานะใหม่ตรงนี้ = ใบที่เดินหน้าไปแล้วโชว์รางย้อนหลัง โดยไม่มีเทสต์ไหนจับ */
  const awaitingApproval = status === 'awaiting_approval';
  const issued = status === 'awaiting_signature' || awaitingApproval || status === 'signed';
  const signed = status === 'signed';
  /* ⭐ ใบเสนอราคาที่อ้างถึงถูกปิด = **ธงแดงที่ขั้นที่ใบค้างอยู่** (มติผู้ใช้ 2026-08-22)
     ร่างถูกยกเลิกตามไปแล้ว ⇒ ที่เหลือคือใบที่ออกเลขแล้วซึ่งระบบไม่แตะ คนต้องเห็นว่ามีเรื่อง */
  const closure = contract?._quotationClosure || null;

  const draftStep = issued
    ? step('draft', 'ร่าง', 'done')
    : step('draft', 'ร่าง', closure ? 'bad' : 'now', closure ? `ใบเสนอราคา${closure.label}` : 'กรอกข้อมูลคู่สัญญา');

  /* ⚠️ "รอลงนาม" ค้างนานคือตัวทวง ไม่ใช่ความผิดพลาดของใบ — แต่ต้องเห็นจากรางโดยไม่ต้อง
     อ่านตัวเลข ⇒ เกิน 14 วันย้อมเป็นธงแดงพร้อมโน้ตจำนวนวัน (เกณฑ์เดียวกับการ์ดสรุป) */
  const waiting = daysAwaitingSignature(contract);
  const late = status === 'awaiting_signature' && Number(waiting) > SIGNATURE_LATE_DAYS;
  const issueStep = (signed || awaitingApproval)
    ? step('issue', 'รอลงนาม', 'done')
    : issued
      ? step('issue', 'รอลงนาม', late || closure ? 'bad' : 'now',
        closure ? `ใบเสนอราคา${closure.label}` : late ? `รอมา ${waiting} วัน` : 'พิมพ์ส่งลูกค้าเซ็น')
      : step('issue', 'รอลงนาม', 'todo');

  const signStep = signed
    ? step('sign', 'ลงนามแล้ว', 'done', contract?.signedDate ? null : 'ยังไม่มีวันที่ลงนาม')
    : awaitingApproval
      /* ⭐ ขั้นนี้ **รอคนอื่น** ไม่ใช่รอฝ่ายขาย ⇒ ต้องบอกว่ารอใคร ไม่ใช่หมุดเหลืองเปล่า ๆ
         (กติกาเดียวกับรางใบสั่งขายที่โน้ตบอกว่าติดอยู่ที่ขั้นไหนของใคร) */
      ? step('sign', 'ลงนามแล้ว', 'now', 'รอ AE Supervisor รับรอง')
      : step('sign', 'ลงนามแล้ว', 'todo');

  return { closed: false, steps: [draftStep, issueStep, signStep] };
}
