/* ── คำบนแถวเงินของใบสั่งขาย (รื้อรายการ SO + บัญชี PR-2 · มติเจ้าของ 09/11/2026) ─────────────────────────────────────
   ฟังก์ชันล้วน (ไม่มี JSX) ของชิปงวดและบรรทัดงวดถัดไป — แยกจากคอมโพเนนต์ให้เทสต์เรียกได้ตรง
   ผู้ใช้: components/salesPlanning/InstallmentChips · SalesOrderMoneyCells (หน้ารายการ SO · หน้างานบัญชี) */
import { fmtDate, fmtMoney } from '@/lib/format';
import { INSTALLMENT_CHIP_LABELS } from '@/lib/sales/salesOrderMoney';
import { salesOrderPaymentNote } from '@/lib/sales/salesOrderPayments';

const NOTE_TONE = { danger: 'cell-num-bad', success: 'cell-num-ok', warning: '', idle: '' };

/* คำของชิปหนึ่งตัว — ใช้ทั้ง aria-label และกล่องลอย (สองที่ต้องพูดเหมือนกัน) */
export function installmentChipText(inst, total) {
  const head = `งวด ${inst.seq}${total ? `/${total}` : ""} · ${INSTALLMENT_CHIP_LABELS[inst.kind] || inst.kind}`;
  const parts = [fmtMoney(inst.amount)];
  if (inst.dueDate) parts.push(`กำหนด ${fmtDate(inst.dueDate)}`);
  if (inst.paidOn && inst.kind !== "plan") parts.push(`จ่าย ${fmtDate(inst.paidOn)}`);
  if (inst.taxInvoiceNo) parts.push(`ใบกำกับ ${inst.taxInvoiceNo}`);
  else if (inst.kind === "confirmed" && !inst.opening) parts.push("ยังไม่ออกใบกำกับ");
  if (inst.opening) parts.push("งวดยกมา");
  return { head, note: parts.join(" · ") };
}

/* บรรทัดงวดถัดไป — เลยกำหนดมาก่อน (แดง + จำนวนวันจาก server) · ไม่มีก็คำสถานะเดิมของคอลัมน์งวด (`salesOrderPaymentNote`) +
   วันกำหนด
   ⭐ วันที่บนบรรทัด = `payment.nextDue` ตัวเดียวกับการเรียง "กำหนดชำระ" ของตาราง (กำหนดวางบิลรอบสอง 26/09) — ลำดับต้องตรงกับวันที่ตาเห็น
     ไม่อ่านวันกำหนดค่าตายบนหัวใบ · งวดเลยกำหนดใช้วันของงวดนั้นเอง (`money.next` = งวดที่เลยกำหนดเก่าสุด = nextDue ของใบเดียวกัน
     เว้นแต่มีงวดรอตรวจ/ตีกลับที่วันเก่ากว่า) */
export function installmentStatusLine(row) {
  const money = row?.money;
  const payment = row?.payment;
  const next = money?.next;
  if (next?.overdueDays > 0) {
    return { tone: "cell-num-bad", text: `เลยกำหนด ${next.overdueDays} วัน · งวด ${next.seq}${next.dueDate ? ` (${fmtDate(next.dueDate)})` : ""}` };
  }
  /* ใบยังไม่อนุมัติ: งวดยังไม่ตรึง (ชิปตามแผน/จ่ายก่อน) — ยังไม่ใช่หนี้ที่ต้องตาม ⇒ ไม่พูด "รอลูกค้าชำระ" ของงวดที่ตรึงแล้ว */
  if (money && (!money.tracked || money.installments.every((i) => i.kind === "plan" || i.kind === "prepaid"))) {
    return { tone: "", text: money.tracked ? "ยังไม่ส่งให้บัญชี · เริ่มติดตามหลังใบอนุมัติ" : "ตามแผนใน QT · เริ่มติดตามหลังอนุมัติ" };
  }
  const note = salesOrderPaymentNote(payment);
  const due = payment?.nextDue ? ` · กำหนด ${fmtDate(payment.nextDue)}` : "";
  if (note && note.tone !== "idle") return { tone: NOTE_TONE[note.tone] || "", text: `${note.label}${due}` };
  if (next) return { tone: "", text: `ถัดไป งวด ${next.seq}${payment?.nextDue ? ` · ${fmtDate(payment.nextDue)}` : " · ยังไม่ตั้งวัน"}` };
  return note ? { tone: NOTE_TONE[note.tone] || "", text: `${note.label}${due}` } : null;
}

