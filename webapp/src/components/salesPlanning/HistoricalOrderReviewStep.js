"use client";
// ── ขั้น ④ ตรวจก่อนบันทึก — จะสร้างอะไร · ยอดนี้ไปไหน · ใบที่อาจซ้ำ ─────────────────
//
// ⭐ **ทุกตัวเลขบนจอนี้มาจาก `plan` ของพรีวิว** ที่ผ่านทั้งใบ — ขั้นแรกที่ `plan.deal`
//    และ `plan.header.team` มีค่า (พรีวิวที่ยังมี error คืนแค่ `{ error, errors }`)
// ⭐ ใบที่อาจซ้ำ **ไม่ใช่ error ของพรีวิว** — เป็นรายการให้ยืนยัน · ปุ่มบันทึกโชว์แต่ติดด่าน
//    จนกว่าจะเปิดสวิตช์ (กฎบ้าน: ไม่มีสิทธิ์ = ไม่โชว์ · ติดด่าน = โชว์แล้วบอกเหตุ)
import { TableScroll } from "@/components/ui/Table";
import StatusBadge from "@/components/ui/StatusBadge";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney, naText, NA } from "@/lib/format";
import { SALES_ORDER_STATUS_LABELS } from "@/lib/sales/salesOrderWorkflow";
import styles from "./HistoricalSalesOrderModal.module.css";

/* ⭐ ตารางนี้คือจอที่อธิบายทั้งฟีเจอร์ให้ผู้คีย์ — ทุกแถวตรงกับจุดตัดจริงใน docs §4
   (ไม่ใช่คำโฆษณา: แถว "ไม่เห็น" ทุกแถวมีตัวกรอง pipeline อยู่ในโค้ดจริง) */
const WHERE_THE_MONEY_GOES = [
  { at: "ทะเบียนใบสั่งขาย · หน้าใบ", tone: "success", label: "เห็น", why: "ต้องหาเจอและเปิดดูได้ · ยอดหรี่ “ยังไม่นับเป็น Actual”" },
  { at: "ทะเบียนดีล", tone: "info", label: "เห็นแถว · ไม่นับการ์ด KPI", why: "“ดีลของใบสั่งขายย้อนหลัง · ไม่นับยอดขายและ FC”" },
  { at: "คิวงานเข้าใหม่ของ TS", tone: "success", label: "เข้า", why: "เรียงท้ายใบปกติ + นับบนป้ายเมนู" },
  { at: "งานบริการทั้งสาย (โซน · คิวนัด · เติมน้ำหอม · ต่อสัญญา)", tone: "info", label: "เห็นหลัง TS ผูกโซนและผูกสัญญา", why: "นี่คือเหตุผลทั้งหมดของงานนี้" },
  { at: "ทะเบียนการชำระ / ใบกำกับ", tone: "success", label: "เห็น · ใช้งานปกติ", why: "แจ้งชำระ (ต้องมีหลักฐาน) → บัญชีรับรอง/ตีกลับ · บันทึกเลขใบกำกับที่ออกไปแล้ว · ผูกแผนจากใบเสนอราคาไม่ได้" },
  { at: "ยอดขาย Actual รายเดือน · เป้าทีม · YoY", tone: "neutral", label: "ไม่เห็น", why: "ออกบิลผ่าน Express ไปแล้ว — นับซ้ำ" },
  { at: "FC / คาดการณ์", tone: "neutral", label: "ไม่เห็น", why: "เป็นของที่เกิดไปแล้ว ไม่ใช่ที่กำลังจะเกิด" },
  { at: "กอง Won รอยื่น SO · ร่างงานผลิตอัตโนมัติ", tone: "neutral", label: "ไม่เห็น", why: "ของผลิตและส่งไปแล้ว ไม่ต้องมีใครทำอะไรต่อ" },
  { at: "คิวบัญชีปิดใบ", tone: "neutral", label: "ไม่เข้า", why: "สถานะบัญชีของใบว่างเสมอ" },
  { at: "คิวรอยื่นภาษีสรรพสามิต", tone: "neutral", label: "ไม่เข้า", why: "ตัวเลือกสรรพสามิตบอก “ไม่เข้าเกณฑ์”" },
];

function PlanRow({ code, children, note, child = false }) {
  return (
    <li className={child ? styles.planChild : undefined}>
      <span className={styles.planCode}>{code}</span>
      <span className={styles.planText}>{children}</span>
      <span className={styles.planNote}>{note}</span>
    </li>
  );
}

export default function HistoricalOrderReviewStep({
  plan, orderNumberPreview, acknowledged, onAcknowledge, duplicates = [], blockedNote = null,
  switchRef = null, busy = false,
}) {
  if (!plan) return null;
  const { header, lines = [], installments = [], deal = {}, exemption = {}, warnings = [] } = plan;
  const dupes = duplicates.length ? duplicates : (plan.duplicates || []);

  return (
    <>
      {warnings.length > 0 && (
        <StatusNotice tone="warning" title={`คำเตือน ${warnings.length} ข้อ`}>
          <ul className={styles.warnList}>
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </StatusNotice>
      )}

      <h4 className={styles.section}>จะสร้าง</h4>
      <ul className={styles.plan}>
        <PlanRow code={orderNumberPreview} note={SALES_ORDER_STATUS_LABELS.approved}>
          <b>ใบสั่งขาย</b>
          {` ${naText(header.customerName)} · วันที่ใบ ${fmtDate(header.orderDate)} · ${naText(header.ownerName)}`}
          <StatusBadge tone="info" size="sm" label="ย้อนหลัง" />
          <span className={styles.muted}>(เลขออกตอนบันทึก)</span>
        </PlanRow>
        <PlanRow child code="เงิน" note={`รวม ${fmtMoney(header.totalAmount)}`}>
          {`ก่อน VAT ${fmtMoney(header.subtotal)} · VAT ${fmtMoney(header.vatAmount)}`}
        </PlanRow>
        {lines.map((line, index) => (
          <PlanRow
            key={`${line.installationPoint}-${index}`}
            child
            code={`จุดติดตั้ง ${index + 1}`}
            note={`ก่อน VAT ${fmtMoney(line.lineTotal)}`}
          >
            {[
              line.installationPoint,
              line.fgCode || "ไม่ได้เลือกสินค้า",
              `${line.qty} ${line.unit || ""}`.trim(),
              line.serviceRounds ? `${line.serviceRounds} รอบ` : null,
            ].filter(Boolean).join(" · ")}
          </PlanRow>
        ))}
        {installments.map((row, index) => (
          <PlanRow key={`${row.label}-${index}`} child code={row.label || `งวดที่ ${index + 1}`} note="รอชำระ">
            {[
              fmtMoney(row.amount),
              row.dueDate ? `กำหนดชำระ ${fmtDate(row.dueDate)}` : null,
              row.coversFrom || row.coversTo ? `ครอบ ${fmtDate(row.coversFrom)} – ${fmtDate(row.coversTo)}` : null,
            ].filter(Boolean).join(" · ")}
          </PlanRow>
        ))}
        {/* ⭐ ชื่อบนจอของดีลภาชนะ = "ดีลงานบริการย้อนหลัง" (มติข้อ 22 · 16/09) — ห้าม "ดีลเก่า"
            ซึ่งเป็นชื่อของสวิตช์ในฟอร์มดีล · โชว์ชื่อ AE ข้างชื่อดีลเสมอ เพราะลูกค้าราย
            เดียวมีดีลภาชนะได้สองใบที่ต่างกันแค่ AE */}
        <PlanRow child code="ดีล" note={deal.willCreate ? "สร้างใหม่" : naText(deal.code)}>
          {`ดีลงานบริการย้อนหลัง · ${naText(header.customerName)} · ${naText(header.ownerName)} · ทีม ${naText(header.team)} · Won มูลค่า 0`}
        </PlanRow>
        <PlanRow child code="ด่านเงิน" note={NA}>
          {exemption.reason || "ไม่ยกเว้น — นัดติดด่านเงินจนกว่าบัญชีรับรองงวด"}
        </PlanRow>
      </ul>

      {dupes.length > 0 && (
        <>
          <h4 className={styles.section}>
            ใบที่อาจซ้ำ<span className={styles.sectionKind}>(ขึ้นเฉพาะเมื่อพรีวิวพบ)</span>
          </h4>
          <TableScroll family="list" surface="embedded" minWidth={480}>
            <table className="w-full text-sm">
              <thead><tr><th>เลขที่</th><th className="num">วันที่ใบ</th><th>เลขเดิม</th><th>สถานะ</th></tr></thead>
              <tbody>
                {dupes.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">{naText(row.orderNumber)}</td>
                    <td className="num mono">{fmtDate(row.orderDate)}</td>
                    <td className="mono">{(row.refs || []).join(" · ") || NA}</td>
                    {/* สถานะอยู่ในตารางด้วย — ใบที่ยกเลิกแล้วน่ากลัวน้อยกว่าใบที่ยังเดินอยู่มาก */}
                    <td>{SALES_ORDER_STATUS_LABELS[row.status] || naText(row.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <div className={styles.switchRow}>
            <button
              type="button"
              ref={switchRef}
              className="ui-switch"
              data-on={acknowledged ? "1" : undefined}
              aria-pressed={acknowledged}
              aria-label="ตรวจแล้ว ไม่ใช่ใบซ้ำ"
              disabled={busy}
              onClick={() => onAcknowledge(!acknowledged)}
            >
              <i aria-hidden="true" />
            </button>
            <span className={styles.switchText}>
              <b>ตรวจแล้ว ไม่ใช่ใบซ้ำ <span className={styles.req}>*</span></b>
              <small>
                ลูกค้าเดียวกัน วันที่ใบหรือเลขเดิมตรงกัน · ไม่เปิด = บันทึกไม่ได้
                (“พบใบสั่งขายย้อนหลังของลูกค้านี้ที่วันที่หรือเลขเอกสารเดิมตรงกัน — ตรวจรายการแล้วยืนยันว่าไม่ซ้ำก่อนบันทึก”)
              </small>
              {blockedNote ? <small>{blockedNote}</small> : null}
            </span>
          </div>
        </>
      )}

      <h4 className={styles.section}>ยอดนี้ไปไหน</h4>
      <TableScroll family="list" surface="embedded" minWidth={640}>
        <table className="w-full text-sm">
          <thead><tr><th>ที่</th><th>เห็นใบนี้ไหม</th><th>เหตุผล</th></tr></thead>
          <tbody>
            {WHERE_THE_MONEY_GOES.map((row) => (
              <tr key={row.at}>
                <td>{row.at}</td>
                <td><StatusBadge tone={row.tone} size="sm" label={row.label} /></td>
                <td>{row.why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableScroll>

      <StatusNotice tone="warning" title="หลังบันทึกแก้ใบไม่ได้" className={styles.notice}>
        ย้อนอนุมัติ / ออก Rev. / คืนเป็นร่างไม่ได้ — คีย์ผิดให้แอดมินลบทั้งใบแล้วคีย์ใหม่ ·
        ลบแบบปกติได้เฉพาะก่อน TS ผูกโซน / มีรอบบริการ / บัญชีรับรองงวด / บันทึกเลขใบกำกับ
        หลังจากนั้นต้องบังคับลบหลังอ่านพรีวิว · ดีลงานบริการย้อนหลังที่ว่างแล้วแอดมินลบต่อได้ ·
        ทุกการลบเป็นของแอดมิน
      </StatusNotice>
    </>
  );
}
