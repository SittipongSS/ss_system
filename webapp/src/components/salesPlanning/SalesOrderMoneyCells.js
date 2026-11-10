"use client";
/* ── เซลล์เงินของแถวใบสั่งขาย (รื้อรายการ SO + บัญชี PR-2 · มติเจ้าของ 09/11/2026) ───────────────────────────────
   ชุดเดียวที่หน้ารายการ SO (ฝ่ายขาย) และหน้างานบัญชี (PR-3a) วาด — ตัวเลขทุกตัวมาจากก้อน `money` ของ server
   (`salesOrderMoneyCell` · lib/sales/salesOrderMoney.js) จอไม่บวกเงินเอง
     PayableCell     ยอดจ่าย รวม VAT บรรทัดบน · ก่อน VAT บรรทัดล่าง (มติ "รวมเป็นคอลัมน์เดียว")
     CollectedCell   เก็บแล้ว (บัญชีรับรองเท่านั้น · มติข้อ 1) + แถบ + ค้าง · รอบัญชีตรวจแยกเป็นบรรทัดฟ้า · ใบยกเลิก = เงินค้าง
     InstallmentsCell จ่ายแล้ว x/y งวด + ชิปรายงวด + บรรทัดงวดถัดไป (เลยกำหนด n วัน แดง)
   ⚠️ ตัวนับ "x/y" อ่านจาก `payment` (salesOrderPaymentCell) ตัวเดิม — ตัวกรอง "การชำระ" ของตารางตัดสินด้วยก้อนนั้น
     สองตัวต้องไม่พูดคนละเลข (PR-1 ตรวจกับข้อมูลจริงแล้วว่าตรงกันทุกใบ) */
import { fmtMoney, NA } from "@/lib/format";
import { installmentStatusLine } from "@/lib/sales/salesOrderMoneyText";
import InstallmentChips from "@/components/salesPlanning/InstallmentChips";
import styles from "./SalesOrderMoneyCells.module.css";

/* จอแคบ = การ์ดรายใบแทนตาราง (มือถือ) — เส้นเดียวกับ @media (max-width: 680px) ของ globals.css (useMediaQuery: ห้ามต่างจาก CSS)
   ⚠️ ฝั่ง server ตอบ false ⇒ HTML แรกเป็นตาราง แล้วสลับเป็นการ์ดตอน hydrate บนมือถือ (โหลดรายการเสร็จหลัง hydrate อยู่แล้ว) */
export const SO_MONEY_CARD_QUERY = "(max-width: 680px)";

/* ยอดก่อน VAT ของใบที่ไม่มีก้อนเงิน (ใบยอด 0 · ใบถูกออก Rev. ทับ · ใบยกเลิกที่ไม่มีเงินเหลือ) — คิดจากคอลัมน์ของใบเอง
   (`totalAmount − vatAmount` ชุดเดียวกับ server) เป็นสตางค์ */
const netOf = (row) => (Math.round((Number(row?.totalAmount) || 0) * 100) - Math.round((Number(row?.vatAmount) || 0) * 100)) / 100;

export function PayableCell({ row }) {
  const money = row?.money;
  const dim = !money || row?.status !== "approved";
  return (
    <>
      <span className={dim ? "cell-num-idle" : styles.amount}>{fmtMoney(money ? money.payable : row?.totalAmount)}</span>
      <span className="cell-sub">ก่อน VAT {fmtMoney(money ? money.payableNet : netOf(row))}</span>
    </>
  );
}

export function CollectedCell({ row }) {
  const money = row?.money;
  if (money?.stranded > 0) {
    return (
      <>
        <span className="cell-num-bad">{fmtMoney(money.stranded)}</span>
        <span className="cell-sub cell-num-bad">เงินค้างบนใบยกเลิก</span>
      </>
    );
  }
  if (!money || money.outstanding === null) return <span className="cell-num-idle">{NA}</span>;
  const complete = money.outstanding === 0;
  const okPct = money.payable > 0 ? Math.min(100, (money.collected / money.payable) * 100) : 0;
  const waitPct = money.payable > 0 ? Math.min(100 - okPct, (money.reviewing / money.payable) * 100) : 0;
  return (
    <>
      <span className={complete ? "cell-num-ok" : styles.amount}>{fmtMoney(money.collected)}</span>
      {/* แถบเป็นภาพล้วน — ตัวเลขข้าง ๆ พูดครบแล้ว (กว้างเป็นค่าดิบ ไม่ผ่าน fmtPercent · กฎ number-display)
          ⭐ SVG กว้างตามแอตทริบิวต์ ไม่ใช่ `style={{ width }}` — งบ inline style ของโมดูล (audit:ui) ลดได้อย่างเดียว */}
      <svg className={styles.bar} viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <rect className={styles.barOk} x="0" y="0" width={okPct} height="6" />
        <rect className={styles.barWait} x={okPct} y="0" width={waitPct} height="6" />
      </svg>
      <span className={`cell-sub ${complete ? "cell-num-ok" : ""}`.trim()}>{complete ? "ครบ" : `ค้าง ${fmtMoney(money.outstanding)}`}</span>
      {money.reviewing > 0 ? <span className={`cell-sub ${styles.wait}`}>+ รอบัญชีตรวจ {fmtMoney(money.reviewing)}</span> : null}
    </>
  );
}

export { installmentStatusLine };

export function InstallmentsCell({ row, onOpen = null, highlightKinds = null }) {
  const money = row?.money;
  const payment = row?.payment;
  if (!money?.installments?.length) return <span className="cell-num-idle">{NA}</span>;
  const line = installmentStatusLine(row);
  const count = payment?.count ?? money.installments.length;
  const paid = payment?.tracked ? payment.paid : 0;
  return (
    <span className={styles.stack}>
      <span className={styles.count}>
        <b>{paid}/{count}</b> <span className="cell-num-idle">{payment?.tracked ? "งวดจ่ายแล้ว" : "งวด"}</span>
      </span>
      <InstallmentChips installments={money.installments} onOpen={onOpen} highlightKinds={highlightKinds}
        ariaLabel={`สถานะรายงวดของ ${row.orderNumber || "ใบนี้"}`} />
      {line ? <span className={`cell-sub ${line.tone}`.trim()}>{line.text}</span> : null}
    </span>
  );
}

/* การ์ดของหนึ่งใบบนจอแคบ — ชิ้นเดียวกับแถวตาราง (เซลล์ชุดเดียวกัน) · หัว/ลูกค้าเป็น slot ของหน้า (รางขั้น · ป้ายย้อนหลัง ฯลฯ ต่างกันตามหน้า)
   ⚠️ การ์ดไม่ใช่ตัวกด (ไม่มี onClick) — ทางเข้าใบคือลิงก์เลขที่ใน `head` · ชิปงวดเปิดลิ้นชัก */
export function SalesOrderMoneyCard({ row, head, customer, actual = null, onOpen = null, invoice = null }) {
  return (
    <article className={styles.card} aria-label={`ใบสั่งขาย ${row?.orderNumber || ""}`.trim()}>
      <div className={styles.cardHead}>{head}</div>
      <div className={styles.cardCustomer}>{customer}</div>
      <div className={styles.cardNums}>
        {actual ? <div className={styles.cardNum}><span className={styles.cardLabel}>ยอดก่อน VAT · เป้า</span>{actual}</div> : null}
        <div className={styles.cardNum}><span className={styles.cardLabel}>ยอดจ่าย</span><PayableCell row={row} /></div>
        <div className={styles.cardNum}><span className={styles.cardLabel}>เก็บแล้ว</span><CollectedCell row={row} /></div>
      </div>
      <InstallmentsCell row={row} onOpen={onOpen} />
      {invoice ? <div className={styles.cardFoot}><span className={styles.cardLabel}>ใบกำกับ / งวดที่จ่าย</span> {invoice}</div> : null}
    </article>
  );
}

/* กล่องของการ์ดหลายใบ (จอแคบ) — ช่องว่างระหว่างการ์ดชุดเดียวกันทุกหน้า */
export function SalesOrderMoneyCardList({ children, busy = false }) {
  return <div className={styles.cards} aria-busy={busy}>{children}</div>;
}
