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
  if (inst.kind === "rejected" && inst.rejectedReason) parts.push(`เหตุผลตีกลับ: ${inst.rejectedReason}`);
  return { head, note: parts.join(" · ") };
}

/* เหตุที่บัญชีตีกลับงวด — บรรทัดแดงใต้ชิปงวดในแถวใบสั่งขาย (เจ้าของ 24/11/2026 "โชว์เหตุผลตีกลับในตาราง SO ของบริหารงานขาย")
   ⭐ ฝ่ายขายต้องรู้ว่าต้องแก้อะไรก่อนแจ้งชำระใหม่ โดยไม่ต้องเปิดใบ (กฎเดียวกับการ์ดงวดบนหน้าใบ: เหตุผลตีกลับโชว์เสมอ ไม่ซ่อน)
   ⭐ เฉพาะชิปชนิด `rejected` ที่มีเหตุผล (เหตุผลบังคับตอนตีกลับ · งวดเก่าที่ไม่มีเหตุผล = ไม่มีบรรทัด ชิปแดงบอกอยู่แล้ว)
   ⭐ เกิน `max` งวด = บรรทัดท้าย "และอีก n งวด" — ใบ 12 งวดต้องไม่ดันแถวสูงจนอ่านตารางไม่ได้ (รายละเอียดครบอยู่ในลิ้นชัก/หน้าใบ)
   @returns { lines: [{ seq, text }], more } */
export function installmentRejectLines(row, { max = 2 } = {}) {
  const list = (row?.money?.installments || []).filter((i) => i.kind === "rejected" && i.rejectedReason);
  return {
    lines: list.slice(0, max).map((i) => ({ seq: i.seq, text: `บัญชีตีกลับงวด ${i.seq}: ${i.rejectedReason}` })),
    more: Math.max(0, list.length - max),
  };
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


/* เหตุที่ AE Sup ตีกลับใบ — บรรทัดแดงใต้รางขั้นในแถว (24/11/2026) · null = ใบไม่ได้ถูกตีกลับ/ไม่มีเหตุผล
   ⭐ เช็ก `status` ด้วย — `rejectionReason` ล้างตอนยื่นใหม่/กู้คืนอยู่แล้ว แต่ค่าค้างบนใบสถานะอื่นต้องไม่พูด */
export function salesOrderDocRejectText(row) {
  if (row?.status !== "rejected" || !row?.rejectionReason) return null;
  return `ตีกลับโดย ${row.rejectedByName || "ผู้อนุมัติ"}: ${row.rejectionReason}`;
}

/* บรรทัดรองของแถวในกล่อง "ต้องทำตอนนี้ — ถูกตีกลับ รอคุณแก้" (เจ้าของ 24/11/2026) — บอกว่าใครตีกลับและต้องแก้อะไร
   · ใบที่ AE Sup ตีกลับมาก่อน (แก้ใบแล้วยื่นใหม่ · งวดยังแจ้งไม่ได้จนใบผ่าน) · ไม่มีเหตุผล = บอกแค่ว่าใครตีกลับ
   · งวดที่บัญชีตีกลับ: งวดแรกที่ถูกตีกลับ + เหตุผล · หลายงวด = "บัญชีตีกลับ n งวด · งวด a: …" (ครบอยู่ใต้ชิปงวดในตาราง)
   @returns string | null (ใบไม่ได้ถูกตีกลับ) */
export function salesOrderBounceLine(row) {
  if (row?.status === "rejected") return salesOrderDocRejectText(row) || `ตีกลับโดย ${row.rejectedByName || "ผู้อนุมัติ"}`;
  const rejected = (row?.money?.installments || []).filter((i) => i.kind === "rejected");
  if (!rejected.length) return null;
  const first = rejected[0];
  const head = rejected.length > 1 ? `บัญชีตีกลับ ${rejected.length} งวด · งวด ${first.seq}` : `บัญชีตีกลับงวด ${first.seq}`;
  return first.rejectedReason ? `${head}: ${first.rejectedReason}` : head;
}
