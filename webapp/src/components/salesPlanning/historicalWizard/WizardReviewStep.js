"use client";
// ── ขั้น ④ ตรวจและส่งอนุมัติ (ม็อก Step4 · REVISION 2) ──────────────────────────────
//
// ⭐ **ทุกอย่างที่โชว์ที่นี่มาจากแผนของ server** (`planHistoricalServiceOrder`) ไม่ใช่การคิดซ้ำฝั่งจอ —
//   ของที่ตรวจแล้วต้องเท่ากับของที่บันทึก (บทเรียน #1685: พรีวิวบอก 145 แล้วสร้างได้ 0)
// ⭐ "หลังบันทึก จะเกิดอะไร" มาจาก `historicalAfterSaveSteps` — ผู้คีย์ที่เป็นผู้ตรวจเอง (AE Sup/Admin)
//   อนุมัติใบตัวเองไม่ได้ ⇒ ต้องบอกตั้งแต่ก่อนกดว่าใบจะไปรอใคร
// 🔴 ด่าน "ใบที่อาจซ้ำ" — ปุ่มบันทึกโชว์แต่กดไม่ผ่านจนกว่าจะเปิดสวิตช์ (กฎบ้าน: ติดด่าน = โชว์แล้วบอกเหตุ)
//   ตัวด่านอยู่ที่ `historicalDuplicateGate` ไม่ใช่เงื่อนไขในวงเล็บของ JSX
import { AlertTriangle, Building2, FileText, MapPin, UserRound, Wallet } from "lucide-react";
import StatusNotice from "@/components/ui/StatusNotice";
import { TableScroll } from "@/components/ui/Table";
import { fmtDate, fmtMoney, fmtNumber, naText, NA } from "@/lib/format";
import { externalDocKindLabel } from "@/lib/sales/contracts";
import { HISTORICAL_STATUS_NOTE, OPENING_INSTALLMENT_LABEL } from "@/lib/sales/historicalOrders";
import { historicalAfterSaveSteps } from "@/lib/sales/historicalOrderCopy";
import { contractSpan, historicalReviewStaleNotice } from "@/lib/sales/historicalIntakeForm";
import styles from "./HistoricalOrderWizard.module.css";

function Card({ icon: Icon, title, children }) {
  return (
    <section className={styles.reviewCard}>
      <h4 className={styles.reviewHead}><Icon size={15} aria-hidden="true" />{title}</h4>
      {children}
    </section>
  );
}

export default function WizardReviewStep({
  plan, keyerIsReviewer = false, keyerName = null, contractFileCount = 0, evidenceFileCount = 0,
  duplicates = [], acknowledged = false, onAcknowledge, blockedNote = null, switchRef = null, busy = false,
}) {
  if (!plan) {
    /* 🐞 UAT 23/09: ของเดิมสั่งให้กด “ตรวจอีกครั้ง” ซึ่ง **ไม่มีปุ่มนั้นอยู่บนจอ** — ปุ่มจริงคือปุ่มบันทึก
       และการกดครั้งแรกตอนยังไม่มีแผนคือการตรวจ (ฟอร์มยิงพรีวิวก่อน ยังไม่บันทึก)
       ⇒ ถ้อยคำมาจากตัวตัดสินที่อ้างป้ายปุ่มตัวเดียวกับแถบท้าย ⇒ เปลี่ยนป้ายปุ่มแล้วคำสั่งเปลี่ยนตาม */
    const stale = historicalReviewStaleNotice();
    return <StatusNotice tone="warning" title={stale.title}>{stale.body}</StatusNotice>;
  }

  const { header, contract, lines, opening, installments, deal, warnings = [] } = plan;
  /* ⚠️ `months` = null เมื่อช่วงสัญญา **ไม่ลงตัวเป็นเดือน** ⇒ แผ่นตรวจต้องบอกเหตุคำเดียวกับ
     ขั้น ①–③ (`contractSpan().note`) ไม่ใช่พิมพ์จำนวนเดือนทั้งที่ขั้นอื่นบอกว่ายังไม่รู้ —
     ของเดิมเรียก `contractMonths` ตรง ๆ ซึ่งไม่มีช่องบอกเหตุ ⇒ สองที่พูดคนละเรื่องบนใบเดียวกัน */
  const { months, note: spanNote } = contractSpan(contract?.startDate, contract?.endDate);
  const totalPacks = lines.reduce((sum, line) => sum + (Number(line.qty) || 0), 0);
  const steps = historicalAfterSaveSteps(plan, { keyerIsReviewer });
  const dupes = Array.isArray(duplicates) ? duplicates : [];

  return (
    <>
      <div className={styles.reviewGrid}>
        <Card icon={FileText} title="ลูกค้าและสัญญา">
          <dl className={styles.kv}>
            <dt>ลูกค้า</dt><dd>{naText(header.customerName)}</dd>
            <dt>AE ผู้ดูแล</dt><dd>{naText(header.ownerName)}{header.team ? ` · ทีม ${header.team}` : ""}</dd>
            <dt>เอกสาร</dt>
            <dd>{externalDocKindLabel(contract.docKind)} {naText(contract.ref)}</dd>
            <dt>ระยะสัญญา</dt>
            <dd>{fmtDate(contract.startDate)} – {fmtDate(contract.endDate)}{months ? ` · ${fmtNumber(months)} เดือน` : (spanNote ? ` · ${spanNote}` : "")}</dd>
            {/* ⚠️ `null` = ยังอ่านจำนวนไม่ได้ (ดู historicalContractFileCount) — ห้ามอ่านว่า
                "ยังไม่แนบ" ซึ่งเป็นคำตอบที่อาจผิด แล้วผู้คีย์ไปแนบซ้ำโดยไม่จำเป็น */}
            <dt>ไฟล์</dt>
            <dd>
              {contractFileCount === null
                ? "ยังอ่านจำนวนไฟล์ไม่ได้ — เปิดขั้น ① เพื่อโหลดรายการไฟล์"
                : (contractFileCount ? `แนบแล้ว ${fmtNumber(contractFileCount)} ไฟล์` : "ยังไม่แนบ")}
            </dd>
            <dt>อ้างอิงเดิม</dt>
            <dd>{naText([header.refs.quote, header.refs.express, header.refs.invoice].filter(Boolean).join(" · "))}</dd>
            <dt>ดีล</dt>
            <dd>{deal.willCreate ? "สร้างดีลงานบริการย้อนหลังใหม่ตอนบันทึก" : `${naText(deal.code)} (มีอยู่แล้ว)`}</dd>
          </dl>
        </Card>

        <Card icon={MapPin} title="โซนและแพ็ค">
          <dl className={styles.kv}>
            <dt>รวม</dt><dd>{fmtNumber(lines.length)} โซน · {fmtNumber(totalPacks)} แพ็ค</dd>
          </dl>
          <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={420}>
            <table className="w-full text-sm">
              <thead><tr>
                <th>ไซต์ · โซน</th>
                <th className="num">แพ็ค</th>
                <th className="num">ยอด</th>
              </tr></thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.zoneId}>
                    <td>
                      {naText(line.zoneName)}
                      <span className={styles.cellSub}>{[line.siteCode, line.siteName].filter(Boolean).join(" ")} · {naText(line.zoneCode)}</span>
                    </td>
                    <td className="num">{fmtNumber(line.qty)}</td>
                    <td className="num">{fmtMoney(line.grossAmount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
        </Card>

        <Card icon={Wallet} title="เงิน">
          <dl className={styles.kv}>
            <dt>รวมทั้งใบ</dt><dd>{fmtMoney(header.totalAmount)}</dd>
            <dt>ก่อน VAT</dt><dd>{fmtMoney(header.subtotal)}</dd>
            <dt>VAT {header.vatRate}%</dt><dd>{fmtMoney(header.vatAmount)}</dd>
            <dt>{OPENING_INSTALLMENT_LABEL}</dt>
            <dd>
              {opening
                ? `${fmtMoney(opening.amount)} · ครอบ ${fmtDate(opening.coversFrom)}–${fmtDate(opening.coversTo)} · หลักฐาน ${fmtNumber(evidenceFileCount)} ไฟล์`
                : "ไม่มี — ยังไม่เคยเก็บเงิน"}
            </dd>
            <dt>งวดที่ต้องเก็บ</dt>
            <dd>
              {installments.length
                ? `${fmtNumber(installments.length)} งวด · ${fmtMoney(installments.reduce((sum, row) => sum + (Number(row.amount) || 0), 0))}`
                : NA}
            </dd>
          </dl>
        </Card>

        <Card icon={UserRound} title="ผู้คีย์และการอนุมัติ">
          <dl className={styles.kv}>
            <dt>ผู้คีย์</dt><dd>{naText(keyerName)}</dd>
            <dt>อนุมัติ</dt>
            <dd>
              AE Sup · ไม่นับ Actual
              <span className={styles.afterNote}>{HISTORICAL_STATUS_NOTE}</span>
            </dd>
            <dt>เลขใบ</dt><dd>ระบบออกให้ตอนบันทึก</dd>
          </dl>
        </Card>
      </div>

      <h4 className={styles.section}>
        หลังบันทึก จะเกิดอะไร
        <span className={styles.sectionKind}>ใบเดินต่อตามลำดับนี้</span>
      </h4>
      <ol className={styles.afterList}>
        {steps.map((step, index) => (
          <li key={step.key}>
            <span aria-hidden="true">{index + 1}</span>
            <span className={styles.lane}>{step.lane}</span>
            <span>
              {step.text}
              {step.note ? <span className={styles.afterNote}>{step.note}</span> : null}
            </span>
          </li>
        ))}
      </ol>

      {warnings.length > 0 && (
        <StatusNotice tone="warning" title={`คำเตือน ${warnings.length} ข้อ — ไม่บล็อกการบันทึก`} className={styles.notice}>
          <ul className={styles.warnList}>
            {warnings.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        </StatusNotice>
      )}

      {dupes.length > 0 && (
        <>
          <StatusNotice tone="warning" title={`พบใบย้อนหลังของลูกค้ารายนี้ที่อาจซ้ำ ${dupes.length} ใบ`} className={styles.notice}>
            วันเริ่มสัญญาหรือเลขเอกสารเดิมตรงกัน — เปิดดูก่อนยืนยัน
          </StatusNotice>
          <TableScroll family="editable" surface="embedded" cells="stacked" minWidth={420}>
            <table className="w-full text-sm">
              <thead><tr><th>เลขที่ใบ</th><th>วันที่ใบ</th><th>สถานะ</th><th>เลขเอกสารเดิม</th></tr></thead>
              <tbody>
                {dupes.map((row) => (
                  <tr key={row.id}>
                    <td>{naText(row.orderNumber)}</td>
                    <td>{row.orderDate ? fmtDate(row.orderDate) : NA}</td>
                    <td>{naText(row.status)}</td>
                    <td>{naText((row.refs || []).join(" · "))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableScroll>
          <div className={styles.switchRow}>
            <button
              ref={switchRef}
              type="button"
              className="ui-switch"
              data-on={acknowledged ? "1" : undefined}
              aria-pressed={acknowledged}
              aria-label="ตรวจแล้ว ไม่ใช่ใบซ้ำ"
              disabled={busy}
              onClick={() => onAcknowledge?.(!acknowledged)}
            >
              <i aria-hidden="true" />
            </button>
            <span className={styles.switchText}>
              <b>ตรวจแล้ว ไม่ใช่ใบซ้ำ</b>
              <small>{blockedNote || "เปิดสวิตช์นี้แล้วจึงบันทึกได้"}</small>
            </span>
          </div>
        </>
      )}

      <StatusNotice
        tone="warning"
        title="ยังเข้าบริการไม่ได้จนกว่า AE Sup อนุมัติ และบัญชีรับรองงวดยกมา"
        icon={AlertTriangle}
        className={styles.notice}
      >
        บันทึกแล้วได้เลข SO ทันที แต่ฝ่าย TS ยังตั้งรอบไม่ได้ · ถ้า AE Sup หรือบัญชีตีกลับ
        ใบจะกลับมาให้แก้ในฟอร์มเดิม
      </StatusNotice>

      <p className={styles.hint}>
        <Building2 size={13} aria-hidden="true" /> ส่งให้ AE Sup อนุมัติทันทีที่บันทึก
      </p>
    </>
  );
}
