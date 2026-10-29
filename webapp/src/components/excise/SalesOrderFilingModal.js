"use client";

import { useEffect, useMemo, useState } from "react";
import { FileCheck2 } from "lucide-react";
import Modal from "@/components/Modal";
import { TableScroll } from "@/components/ui/Table";
import Select from "@/components/ui/Select";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney, naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";
import { FILING_SOURCE_EXCISE_ORDER } from "@/lib/excise/raFilingRules";
import styles from "./SalesOrderFilingModal.module.css";

/* ── ฝ่าย RA สร้างใบยื่นกรมจากคิว "รอยื่นกรม" (แผนรื้อสรรพสามิต PR5 · มติ D7: ยื่นทีละ SO) ───────────────────
   เดิมโมดัลนี้เป็นทางสร้างของฝ่ายขาย (เลือก SO ลูกค้า → คิดภาษีจากสินค้า) — ปิดตั้งแต่ PR3 · ตอนนี้แหล่งมีสองแบบ:
     · ใบสั่งขายค่าสรรพสามิตที่อนุมัติแล้ว — รายการ = บรรทัดของใบนั้น (ยอดที่ลูกค้าจ่ายจริง)
     · ใบสั่งขายลูกค้าที่ฝ่ายขายตัดสินไม่เรียกเก็บ (เก็บนอกระบบ/รวมในราคา) — รายการคิดจาก SO ลูกค้า
   ด่านเงิน/ทะเบียนไม่บล็อกการสร้าง — บล็อกตอน "เริ่มยื่น" (ข้ามได้ใส่เหตุผล) จอนี้บอกล่วงหน้าให้รู้ */
const EMPTY_PREVIEW = { loading: false, lines: [], warnings: [], totalTax: 0, amountToCollect: 0, gates: null, existing: null, error: "" };

// บรรทัดที่ทะเบียนยังไม่อนุมัติ — สร้างใบยื่นได้ แต่ต้องรู้ว่าติดที่ตัวไหนก่อนกด
const REGISTRATION_GAP = {
  none: "ยังไม่มีทะเบียน",
  draft: "ทะเบียนยังเป็นฉบับร่าง",
  pending: "ทะเบียนรอฝ่าย RA ตรวจ",
  rejected: "ทะเบียนถูกตีกลับ",
};

const rowParam = (row) => (row?.source === FILING_SOURCE_EXCISE_ORDER
  ? { exciseSalesOrderId: row.exciseOrder.id }
  : { salesOrderId: row?.salesOrder?.id });

const rowLabel = (row) => (row.source === FILING_SOURCE_EXCISE_ORDER
  ? `${row.salesOrder.orderNumber} · ${row.salesOrder.customerName || ""} · ใบสั่งขายค่าสรรพสามิต ${row.exciseOrder.orderNumber}`
  : `${row.salesOrder.orderNumber} · ${row.salesOrder.customerName || ""} · ไม่เรียกเก็บในระบบ (${row.notBilled?.label || ""})`);

export default function SalesOrderFilingModal({ open, onClose, onSaved, initialKey = "" }) {
  const [rows, setRows] = useState([]);
  const [key, setKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState(EMPTY_PREVIEW);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    setKey(initialKey || "");
    setPreview(EMPTY_PREVIEW);
    apiFetch("/api/tax/orders/queue")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "โหลดคิวรอยื่นกรมไม่สำเร็จ");
        if (active) setRows(Array.isArray(data) ? data : []);
      })
      .catch((reason) => { if (active) setError(reason.message || "โหลดคิวรอยื่นกรมไม่สำเร็จ"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open, initialKey]);

  const selected = useMemo(() => rows.find((row) => row.key === key) || null, [rows, key]);

  useEffect(() => {
    if (!open || !selected) {
      setPreview(EMPTY_PREVIEW);
      return;
    }
    const controller = new AbortController();
    setPreview({ ...EMPTY_PREVIEW, loading: true });
    const query = new URLSearchParams(rowParam(selected)).toString();
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
  }, [open, selected]);

  const warningCount = (code) => preview.warnings.filter((warning) => warning.code === code).length;
  const canCreate = !!selected && !preview.loading && !preview.error && !preview.existing && preview.lines.length > 0;

  const create = async () => {
    if (!canCreate) return;
    setBusy(true);
    setError("");
    const res = await apiFetch("/api/tax/orders/from-sales-order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(rowParam(selected)),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setError(data.error || "สร้างใบยื่นไม่สำเร็จ");
      return;
    }
    onSaved?.(data);
    onClose?.();
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="สร้างใบยื่นกรมจากคิวรอยื่น" size="md">
      <div className={`drawer-section ${styles.form}`}>
        {error && <StatusNotice tone="error">{error}</StatusNotice>}

        <label className="form-group">
          <span>งานรอยื่นกรม</span>
          <Select value={key} disabled={loading || !rows.length} onChange={(event) => setKey(event.target.value)}>
            <option value="">{loading ? "กำลังโหลด…" : rows.length ? "เลือกใบสั่งขาย" : "ไม่มีงานรอยื่นกรม"}</option>
            {rows.map((row) => <option key={row.key} value={row.key}>{rowLabel(row)}</option>)}
          </Select>
        </label>

        {selected && (
          <div className={`glass-panel ${styles.sourceCard}`}>
            <div className={styles.sourceHead}>
              <FileCheck2 size={17} color="var(--accent)" />
              {selected.salesOrder.orderNumber}
            </div>
            {/* ต้นทางของใบยื่น: SO ลูกค้า + ใบที่ลูกค้าจ่ายค่าภาษี (หรือคำตัดสินไม่เรียกเก็บ) */}
            <div className={styles.sourceRefs}>
              <span>ลูกค้า <strong>{naText(selected.salesOrder.customerName)}</strong></span>
              <span>ใบสั่งขายลูกค้า <strong>{selected.salesOrder.orderNumber}</strong></span>
              {selected.exciseOrder
                ? (
                  <>
                    <span>ใบสั่งขายค่าสรรพสามิต <strong>{selected.exciseOrder.orderNumber}</strong></span>
                    <span>ใบเสนอราคาค่าสรรพสามิต <strong>{naText(selected.exciseOrder.quoteNumber)}</strong></span>
                  </>
                )
                : <span>ไม่เรียกเก็บในระบบ <strong>{naText(selected.notBilled?.label)}</strong></span>}
              <span>อนุมัติ <strong>{fmtDate(selected.salesOrder.approvedAt)}</strong></span>
            </div>
            <div className={styles.summaryGrid}>
              <div><span className={styles.summaryLabel}>รายการสรรพสามิต</span><div>{preview.loading ? "กำลังตรวจ…" : `${preview.lines.length} รายการ`}</div></div>
              <div><span className={styles.summaryLabel}>ค่าภาษี (ก่อน VAT)</span><div className="font-mono">{preview.loading ? "…" : fmtMoney(preview.totalTax)}</div></div>
              <div><span className={styles.summaryLabel}>{selected.exciseOrder ? "ลูกค้าจ่าย (รวม VAT)" : "ยอดภาษี + VAT 7%"}</span><div className={`font-mono ${styles.summaryStrong}`}>{preview.loading ? "…" : fmtMoney(preview.amountToCollect)}</div></div>
              <div><span className={styles.summaryLabel}>เงินค่าภาษี</span><div>{preview.gates ? preview.gates.money.label : "…"}</div></div>
            </div>

            {!preview.loading && preview.lines.length > 0 && (
              <TableScroll family="list" surface="embedded" minWidth={420}>
              <table className={styles.lineTable}>
                <thead>
                  <tr>
                    <th>รหัส / รายการ</th>
                    <th className="num">จำนวน</th>
                    <th className="num">ภาษี/ชิ้น</th>
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
                      <td className="num mono">{fmtMoney(Number(line.exciseRatePerUnit || 0) + Number(line.localTaxRatePerUnit || 0))}</td>
                      <td className="num mono">{fmtMoney(line.totalTax)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              </TableScroll>
            )}
          </div>
        )}

        {preview.error && <StatusNotice tone="error">{preview.error}</StatusNotice>}
        {preview.existing && (
          <StatusNotice tone="warning">ใบสั่งขายนี้มีใบยื่น {preview.existing.id} แล้ว</StatusNotice>
        )}
        {/* ด่านเริ่มยื่น — ไม่บล็อกการสร้าง แต่ต้องรู้ก่อนว่าตอนกด "เริ่มยื่น" ต้องใส่เหตุผลข้ามข้อไหน */}
        {preview.gates && !preview.gates.money.ok && (
          <StatusNotice tone="warning">{preview.gates.money.label} — สร้างใบยื่นได้ แต่ตอนเริ่มยื่นต้องใส่เหตุผลที่ยื่นก่อนบัญชีปิดใบ</StatusNotice>
        )}
        {preview.gates && !preview.gates.registration.ok && (
          <StatusNotice tone="warning">{preview.gates.registration.label} — สร้างใบยื่นได้ แต่ตอนเริ่มยื่นต้องใส่เหตุผลที่ยื่นโดยไม่มีทะเบียน</StatusNotice>
        )}
        {warningCount("missing_tax_base") > 0 && (
          <StatusNotice tone="warning">
            มี {warningCount("missing_tax_base")} รายการที่สินค้ายังไม่มีราคาขายปลีก ภาษีจึงคิดออกมา ฿0 — ใบยื่นตรึงอัตราไว้ตอนสร้าง
          </StatusNotice>
        )}
        {warningCount("tax_split_mismatch") > 0 && (
          <StatusNotice tone="warning">
            มี {warningCount("tax_split_mismatch")} รายการที่ช่องสรรพสามิต/ท้องถิ่นบนใบค่าสรรพสามิตไม่รวมเป็นภาษีต่อชิ้น — ลงเป็นช่องสรรพสามิตทั้งก้อน ตรวจก่อนยื่น
          </StatusNotice>
        )}
        {warningCount("missing_product") > 0 && (
          <StatusNotice tone="warning">
            มี {warningCount("missing_product")} รายการที่ไม่พบข้อมูลสินค้าหรือจำนวน — ไม่อยู่ในใบยื่นนี้
          </StatusNotice>
        )}
      </div>

      <div className="form-action-bar">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
        <button type="button" className="btn btn-primary" onClick={create} disabled={busy || !canCreate}>
          <FileCheck2 size={16} />
          {busy ? "กำลังสร้าง…" : "สร้างใบยื่น"}
        </button>
      </div>
    </Modal>
  );
}
