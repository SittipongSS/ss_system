"use client";

import { useEffect, useState } from "react";
import { FileCheck2, Send } from "lucide-react";
import Modal from "@/components/Modal";
import { TableScroll } from "@/components/ui/Table";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney, naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";
import { FILING_SOURCE_EXCISE_ORDER, filingStartGateError } from "@/lib/excise/raFilingRules";
import { UPCOMING_START_BLOCKER, raRoundLabel } from "@/lib/excise/raQueueItem";
import styles from "./SalesOrderFilingModal.module.css";

/* ── งานรอ RA หนึ่งงาน (แผนรื้อสรรพสามิต v3 · มติเจ้าของ 02/11) ─────────────────────────────────────────────
   SO ค่าสรรพสามิตที่ AE Sup อนุมัติ = งานถึง RA แล้ว ⇒ ไม่มีขั้น "สร้างใบยื่น" · โมดัลนี้คือที่ RA เอาข้อมูลจาก SO ไปทำงาน
     · รายการ + ช่อง ภส. + ทะเบียนรายบรรทัด (พรีวิวจาก GET /api/tax/orders/queue?… ตัวโหลดเดียวกับตอนเริ่มยื่น)
     · กด "เริ่มยื่น" = ระบบเขียนบันทึกการยื่นสถานะกำลังยื่น (POST …/from-sales-order)
     · ⚠️ ปุ่ม "พิมพ์ใบสรุป" ถอดแล้ว (เจ้าของ 04/11: "ยื่นกรมยื่นให้ระบบกรมอยู่แล้ว") — พิมพ์/Excel อยู่ที่หน้ารายการ (ติ๊กงานนี้)
   ด่าน: ทะเบียนทุก FG อนุมัติแล้ว **เด็ดขาด** (V4 · ตัวตัดสินเดียวกับ route) · บัญชีปิดใบแค่โชว์ (V3)
   แถวกำลังมา (`ready: false`) เปิดดูขั้นที่ถึงได้ แต่ปุ่มเริ่มยื่นบอกเหตุ (ยังไม่มี SO ค่าสรรพสามิตอนุมัติให้ผูก) */
const EMPTY_PREVIEW = { loading: false, lines: [], warnings: [], totalTax: 0, amountToCollect: 0, gates: null, existing: null, error: "" };

// บรรทัดที่ทะเบียนยังไม่อนุมัติ — เริ่มยื่นไม่ได้จนกว่า RA อนุมัติทะเบียนตัวนั้น
const REGISTRATION_GAP = {
  none: "ยังไม่มีทะเบียน",
  draft: "ทะเบียนยังเป็นฉบับร่าง",
  pending: "ทะเบียนรอฝ่าย RA ตรวจ",
  rejected: "ทะเบียนถูกตีกลับ",
};

const rowParam = (row) => (row?.source === FILING_SOURCE_EXCISE_ORDER
  ? { exciseSalesOrderId: row.exciseOrder.id }
  : { salesOrderId: row?.salesOrder?.id });

export default function SalesOrderFilingModal({ open, row, onClose, onStarted }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(EMPTY_PREVIEW);
  const upcoming = row?.ready === false;

  useEffect(() => {
    setError("");
    if (!open || !row || upcoming) {
      setPreview(EMPTY_PREVIEW);
      return undefined;
    }
    const controller = new AbortController();
    setPreview({ ...EMPTY_PREVIEW, loading: true });
    const query = new URLSearchParams(rowParam(row)).toString();
    apiFetch(`/api/tax/orders/queue?${query}`, { signal: controller.signal })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "ตรวจรายการไม่สำเร็จ");
        setPreview({ ...EMPTY_PREVIEW, ...data, loading: false });
      })
      .catch((reason) => {
        if (reason?.name !== "AbortError") setPreview({ ...EMPTY_PREVIEW, error: reason.message || "ตรวจรายการไม่สำเร็จ" });
      });
    return () => controller.abort();
  }, [open, row, upcoming]);

  const warningCount = (code) => preview.warnings.filter((warning) => warning.code === code).length;
  /* เหตุที่เริ่มยื่นไม่ได้ — ปุ่มโชว์เสมอ กดแล้วบอกเหตุ (กติกา "ปุ่มกดไม่ได้ = โชว์เสมอ บอกเหตุตอนกด") */
  const startBlocker = upcoming
    ? `${UPCOMING_START_BLOCKER} (ตอนนี้: ${row?.stageLabel || "กำลังมา"})`
    : preview.loading ? "กำลังตรวจรายการ…"
      : preview.error || (preview.existing ? `เริ่มยื่นไปแล้ว (บันทึก ${preview.existing.id})` : "")
        || (!preview.lines.length ? "ใบสั่งขายนี้ไม่มีรายการสรรพสามิตให้ยื่น" : "")
        || filingStartGateError(preview.gates) || "";

  const start = async () => {
    if (startBlocker) {
      setError(startBlocker);
      return;
    }
    setBusy(true);
    setError("");
    const res = await apiFetch("/api/tax/orders/from-sales-order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rowParam(row)),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "เริ่มยื่นไม่สำเร็จ");
      return;
    }
    onStarted?.(data);
  };

  if (!row) return null;
  const sales = row.salesOrder || {};
  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title={`งานยื่นกรม — ${sales.orderNumber || ""}`} size="md">
      <div className={`drawer-section ${styles.form}`}>
        {error && <StatusNotice tone="error">{error}</StatusNotice>}

        <div className={`glass-panel ${styles.sourceCard}`}>
          <div className={styles.sourceHead}>
            <FileCheck2 size={17} color="var(--accent)" />
            {upcoming ? "กำลังมา" : "รอ RA"} · {sales.orderNumber}
          </div>
          {/* ต้นทางของงาน: SO ลูกค้า + ใบที่ลูกค้าจ่ายค่าภาษี (หรือคำตัดสินไม่เรียกเก็บ) */}
          <div className={styles.sourceRefs}>
            <span>ลูกค้า <strong>{naText(sales.customerName)}</strong></span>
            <span>ใบสั่งขายลูกค้า <strong>{sales.orderNumber}</strong></span>
            {row.exciseOrder && <span>ใบสั่งขายค่าสรรพสามิต <strong>{row.exciseOrder.orderNumber}</strong></span>}
            {(row.exciseOrder?.quoteNumber || row.exciseQuote?.quoteNumber) && (
              <span>ใบเสนอราคาค่าสรรพสามิต <strong>{row.exciseOrder?.quoteNumber || row.exciseQuote?.quoteNumber}</strong></span>
            )}
            {row.notBilled && <span>ไม่เรียกเก็บในระบบ <strong>{naText(row.notBilled.label)}</strong></span>}
            {/* แบ่งรอบ (D19): ใบนี้รอบไหนของ SO ลูกค้า + ยังมีรอบตามมาไหม */}
            {raRoundLabel(row) && <span>แบ่งรอบ <strong>{raRoundLabel(row)}</strong></span>}
            <span>อนุมัติ <strong>{fmtDate(sales.approvedAt)}</strong></span>
          </div>
          {upcoming ? (
            <StatusNotice tone="info">{row.stageLabel || "กำลังมา"} — ฝ่าย RA เตรียมทะเบียนของสินค้าในใบได้ก่อน</StatusNotice>
          ) : (
            <>
              <div className={styles.summaryGrid}>
                <div><span className={styles.summaryLabel}>รายการสรรพสามิต</span><div>{preview.loading ? "กำลังตรวจ…" : `${preview.lines.length} รายการ`}</div></div>
                <div><span className={styles.summaryLabel}>ค่าภาษี (ก่อน VAT)</span><div className="font-mono">{preview.loading ? "…" : fmtMoney(preview.totalTax)}</div></div>
                <div><span className={styles.summaryLabel}>{row.exciseOrder ? "ลูกค้าจ่าย (รวม VAT)" : "ยอดภาษี + VAT 7%"}</span><div className={`font-mono ${styles.summaryStrong}`}>{preview.loading ? "…" : fmtMoney(preview.amountToCollect)}</div></div>
                {/* V3: เงินไม่ใช่ด่าน — บอกให้รู้เฉย ๆ */}
                <div><span className={styles.summaryLabel}>บัญชี (แสดงเท่านั้น)</span><div>{preview.gates ? preview.gates.money.label : "…"}</div></div>
              </div>

              {!preview.loading && preview.lines.length > 0 && (
                <TableScroll family="list" surface="embedded" minWidth={480}>
                <table className={styles.lineTable}>
                  <thead>
                    <tr>
                      <th>รหัส / รายการ</th>
                      <th className="num">จำนวน</th>
                      <th className="num">สรรพสามิต/ชิ้น</th>
                      <th className="num">ท้องถิ่น/ชิ้น</th>
                      <th className="num">ภาษีรวม</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.lines.map((line) => (
                      <tr key={line.salesOrderLineId || line.productId}>
                        <td>
                          <span className={styles.lineCode}>{line.fgCode || "FG"}</span>
                          <div className={styles.lineName}>{naText(line.description)}</div>
                          {line.needsRegistration && (
                            <span className={styles.lineGap}>
                              {REGISTRATION_GAP[line.registrationState] || REGISTRATION_GAP.none}
                            </span>
                          )}
                          {line.taxBaseMissing && (
                            <span className={styles.lineGap}>ไม่มีราคาขายปลีก · ภาษี ฿0</span>
                          )}
                        </td>
                        <td className="num mono">{naText(line.quantity)}</td>
                        <td className="num mono">{fmtMoney(line.exciseRatePerUnit || 0)}</td>
                        <td className="num mono">{fmtMoney(line.localTaxRatePerUnit || 0)}</td>
                        <td className="num mono">{fmtMoney(line.totalTax)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </TableScroll>
              )}
            </>
          )}
        </div>

        {preview.error && <StatusNotice tone="error">{preview.error}</StatusNotice>}
        {/* V4: ทะเบียนไม่ครบ = เริ่มยื่นไม่ได้ (ไม่มีทางข้าม) — บอกก่อนกด ว่าติดตัวไหน */}
        {preview.gates && !preview.gates.registration.ok && (
          <StatusNotice tone="warning">{filingStartGateError(preview.gates)}</StatusNotice>
        )}
        {warningCount("missing_tax_base") > 0 && (
          <StatusNotice tone="warning">
            มี {warningCount("missing_tax_base")} รายการที่สินค้ายังไม่มีราคาขายปลีก ภาษีจึงคิดออกมา ฿0 — บันทึกการยื่นตรึงอัตราไว้ตอนเริ่มยื่น
          </StatusNotice>
        )}
        {warningCount("tax_split_mismatch") > 0 && (
          <StatusNotice tone="warning">
            มี {warningCount("tax_split_mismatch")} รายการที่ช่องสรรพสามิต/ท้องถิ่นบนใบค่าสรรพสามิตไม่รวมเป็นภาษีต่อชิ้น — ลงเป็นช่องสรรพสามิตทั้งก้อน ตรวจก่อนยื่น
          </StatusNotice>
        )}
        {warningCount("missing_product") > 0 && (
          <StatusNotice tone="warning">
            มี {warningCount("missing_product")} รายการที่ไม่พบข้อมูลสินค้าหรือจำนวน — ไม่อยู่ในงานยื่นนี้
          </StatusNotice>
        )}
        {!upcoming && (
          <p className={styles.startNote}>
            กด “เริ่มยื่น” = ระบบบันทึกว่าฝ่าย RA กำลังยื่นงานนี้ และตรึงรายการตามที่เห็น · ฝ่ายขายเห็นสถานะ “RA กำลังยื่น” บนใบสั่งขาย ·
            ยกเลิกการเริ่มยื่นได้จนกว่าจะบันทึกผลชำระ
          </p>
        )}
      </div>

      <div className="form-action-bar">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>ปิด</button>
        <button type="button" className="btn btn-primary" onClick={start} disabled={busy} aria-disabled={!!startBlocker}>
          <Send size={16} />
          {busy ? "กำลังบันทึก…" : "เริ่มยื่น"}
        </button>
      </div>
    </Modal>
  );
}
