import { fmtMoney } from "@/lib/format";
import { PENDING_APPROVAL_LABEL } from "@/lib/sales/salesOrderWorkflow";

/* ยอด SO "รออนุมัติ" — หน้าตาเดียวทุกจอ (มติผู้ใช้ 2026-09-11 · mig 0353)

   ผู้ใช้แจ้ง: "SO ที่รออนุมัติ มันกลายเป็น 0 อยากให้โชว์ยอดด้วย แต่แยกให้รู้ว่า
   รออนุมัติ กับ Actual" ⇒ ทุกจุดที่โชว์ Actual และมีใบรออนุมัติ วางชิ้นนี้ **ข้าง ๆ**
   ตัวเลข Actual (บรรทัดรองใต้ยอด / note ของการ์ด) · ไม่รวมเป็นตัวเลขเดียวกันเด็ดขาด

   ⭐ คำว่า "รออนุมัติ" เป็นสีสถานะ (amber เดียวกับป้ายสถานะ SO รออนุมัติทั้งระบบ)
      ส่วนตัวเลขเป็นสีข้อความรอง — ไม่ใช้เขียวของ Actual ไม่งั้นอ่านเป็น Actual
   ⭐ มีคำกำกับเสมอ สีไม่ใช่สัญญาณเดียว (rulebook §A11y) + title อธิบายว่ายังไม่นับ
   ⭐ ไม่มีใบรออนุมัติ = ไม่เรนเดอร์ (ไม่โชว์ "รออนุมัติ ฿0.00" รกทุกแถว) · ใบยอด 0 บาท
      ที่รออนุมัติจริง (ถูกกฎตั้งแต่ mig 0197) ยังโชว์ เพราะส่ง count มาด้วย

   props
   - amount   ยอดก่อน VAT (Σ actualAmount ของใบ pending_approval)
   - count    จำนวนใบ (ไม่บังคับ) — โชว์ "· N ใบ" เมื่อมากกว่า 1
   - inline   true = วางต่อท้ายในบรรทัดเดียวกัน (ค่าตั้งต้นเป็นบรรทัดของตัวเอง)
   - prefix   ข้อความนำหน้า เช่น "+" ในที่ที่วางต่อจากยอด Actual */
export default function PendingApprovalAmount({
  amount,
  count,
  inline = false,
  prefix = "",
  className = "",
}) {
  const value = Math.max(0, Number(amount) || 0);
  const orders = Math.max(0, Math.trunc(Number(count) || 0));
  if (value <= 0 && orders <= 0) return null;
  return (
    <span
      className={["so-pending-approval", inline ? "" : "is-block", className].filter(Boolean).join(" ")}
      title="ใบสั่งขายยื่นแล้ว รอ AE Supervisor อนุมัติ — ยังไม่นับเป็น Actual (อนุมัติแล้วยอดจะเข้าเดือนที่อนุมัติ)"
    >
      {prefix}
      <span className="so-pending-approval-tag">{PENDING_APPROVAL_LABEL}</span>{" "}
      {fmtMoney(value)}
      {orders > 1 ? <span className="so-pending-approval-count"> · {orders} ใบ</span> : null}
    </span>
  );
}
