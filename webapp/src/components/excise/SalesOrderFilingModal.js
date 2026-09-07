"use client";

import { useEffect, useMemo, useState } from "react";
import { FileCheck2 } from "lucide-react";
import Modal from "@/components/Modal";
import { TableScroll } from "@/components/ui/Table";
import Select from "@/components/ui/Select";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney, naText } from "@/lib/format";
import { apiFetch } from "@/lib/apiFetch";
import styles from "./SalesOrderFilingModal.module.css";

const EMPTY_RESOLUTION = {
  loading: false,
  eligible: false,
  lines: [],
  warnings: [],
  totalTax: 0,
  amountToCollect: 0,
  // ต้นทางของใบ: เลขใบสั่งขาย + เลขใบเสนอราคาที่เกี่ยวข้อง (server ส่งมาคู่กัน)
  source: null,
  error: "",
};

// บรรทัดที่ทะเบียนยังไม่อนุมัติ — สร้างใบยื่นได้ แต่ต้องรู้ว่าติดที่ตัวไหนก่อนกด
const REGISTRATION_GAP = {
  none: "ยังไม่มีทะเบียน",
  draft: "ทะเบียนยังเป็นฉบับร่าง",
  pending: "ทะเบียนรอนิติกรรมตรวจ",
  rejected: "ทะเบียนถูกตีกลับ",
};

export default function SalesOrderFilingModal({ open, onClose, onSaved }) {
  const [salesOrders, setSalesOrders] = useState([]);
  const [customerId, setCustomerId] = useState("");
  const [salesOrderId, setSalesOrderId] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [schemaReady, setSchemaReady] = useState(true);
  const [error, setError] = useState("");
  const [resolution, setResolution] = useState(EMPTY_RESOLUTION);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    setError("");
    setCustomerId("");
    setSalesOrderId("");
    setResolution(EMPTY_RESOLUTION);
    apiFetch("/api/tax/orders/from-sales-order?available=1")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "โหลดใบสั่งขายไม่สำเร็จ");
        if (!active) return;
        setSalesOrders(data.salesOrders || []);
        setSchemaReady(data.schemaReady !== false);
      })
      .catch((reason) => {
        if (active) setError(reason.message || "โหลดใบสั่งขายไม่สำเร็จ");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [open]);

  useEffect(() => {
    if (!open || !salesOrderId) {
      setResolution(EMPTY_RESOLUTION);
      return;
    }
    const controller = new AbortController();
    setResolution({ ...EMPTY_RESOLUTION, loading: true });
    apiFetch(`/api/tax/orders/from-sales-order?salesOrderId=${encodeURIComponent(salesOrderId)}`, {
      signal: controller.signal,
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "ตรวจรายการสรรพสามิตไม่สำเร็จ");
        setResolution({
          loading: false,
          eligible: !!data.eligible,
          lines: data.lines || [],
          warnings: data.warnings || [],
          totalTax: Number(data.totalTax || 0),
          amountToCollect: Number(data.amountToCollect || 0),
          source: data.source || null,
          error: "",
        });
      })
      .catch((reason) => {
        if (reason.name !== "AbortError") {
          setResolution({ ...EMPTY_RESOLUTION, error: reason.message || "ตรวจรายการสรรพสามิตไม่สำเร็จ" });
        }
      });
    return () => controller.abort();
  }, [open, salesOrderId]);

  /* ⚠️ ชื่อในลิสต์นี้คือ **สำเนาบนใบสั่งขาย** (คอลัมน์เดียว) ไม่ใช่แถวทะเบียนลูกค้า —
     กติกาสองภาษาจึงถูกใช้ตั้งแต่จุดเขียนสำเนา ตรงนี้เหลือแค่ไม่วาดค่าว่าง
     ถอยไป id เมื่อสำเนาว่าง (ใบยุคก่อนแก้จุดเขียน) ดีกว่าได้บรรทัดเปล่าที่เลือกไม่ถูก */
  const customers = useMemo(() => {
    const unique = new Map();
    salesOrders.forEach((order) => {
      if (order.customerId && !unique.has(order.customerId)) {
        unique.set(order.customerId, order.customerName);
      }
    });
    return [...unique.entries()].map(([id, name]) => ({ id, name }));
  }, [salesOrders]);
  const customerOrders = useMemo(
    () => salesOrders.filter((order) => order.customerId === customerId),
    [customerId, salesOrders],
  );
  const selectedOrder = salesOrders.find((order) => order.id === salesOrderId) || null;

  const create = async () => {
    if (!salesOrderId || !resolution.eligible) return;
    setBusy(true);
    setError("");
    const res = await apiFetch("/api/tax/orders/from-sales-order", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ salesOrderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setBusy(false);
      setError(data.error || "สร้างใบยื่นชำระไม่สำเร็จ");
      return;
    }
    setBusy(false);
    onSaved?.(data);
    onClose?.();
  };

  return (
    <Modal open={open} onClose={busy ? () => {} : onClose} title="สร้างใบยื่นชำระจาก ใบสั่งขาย" size="md">
      <div className={`drawer-section ${styles.form}`}>
        {error && <StatusNotice tone="error">{error}</StatusNotice>}
        {!schemaReady && <StatusNotice tone="warning">ระบบเชื่อมใบสั่งขายกับใบยื่นยังไม่พร้อมใช้งาน</StatusNotice>}

        <label className="form-group">
          <span>ลูกค้า</span>
          <Select
            value={customerId}
            disabled={loading || !schemaReady}
            onChange={(event) => {
              setCustomerId(event.target.value);
              setSalesOrderId("");
            }}
          >
            <option value="">{loading ? "กำลังโหลด…" : "เลือกลูกค้า"}</option>
            {/* `customer.name` ที่นี่คือสำเนาบนใบสั่งขาย ไม่ใช่แถวทะเบียน (ไม่มี nameEn ให้ตก)
                กติกาสองภาษาทำงานตั้งแต่จุดเขียนสำเนาแล้ว — เรียก customerNameIn ตรงนี้จะอ่าน
                เหมือนมีผล ทั้งที่ได้ค่าเท่าเดิมเป๊ะ */}
            {customers.map((customer) => (
              <option key={customer.id} value={customer.id}>{customer.name || customer.id}</option>
            ))}
          </Select>
        </label>

        <label className="form-group">
          <span>ใบสั่งขายที่อนุมัติแล้วและยังไม่มีใบยื่น</span>
          <Select
            value={salesOrderId}
            disabled={!customerId || !customerOrders.length}
            onChange={(event) => setSalesOrderId(event.target.value)}
          >
            <option value="">{customerId && !customerOrders.length ? "ไม่มี ใบสั่งขายที่รอยื่น" : "เลือก ใบสั่งขาย"}</option>
            {/* โชว์เลขใบเสนอราคาคู่กับเลขใบสั่งขาย — คนกดต้องรู้ว่ากำลังยื่นตาม QT ใบไหน */}
            {customerOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {[order.orderNumber, order.quoteNumber].filter(Boolean).join(" · ")}
                {" · "}{fmtDate(order.orderDate)} · {fmtMoney(order.totalAmount)}
              </option>
            ))}
          </Select>
        </label>

        {selectedOrder && (
          <div className={`glass-panel ${styles.sourceCard}`}>
            <div className={styles.sourceHead}>
              <FileCheck2 size={17} color="var(--accent)" />
              {selectedOrder.orderNumber}
            </div>
            {/* ต้นทางของใบยื่น: ใบสั่งขายที่อนุมัติแล้ว + ใบเสนอราคาที่เกี่ยวข้อง
                (มติผู้ใช้ 2026-09-07) — อ่านจาก resolution.source ก่อน แล้วตกมาที่ลิสต์
                ระหว่างที่ยังตรวจไม่เสร็จ ไม่งั้นเลข QT กะพริบหายตอนเปลี่ยนใบ */}
            <div className={styles.sourceRefs}>
              <span>ใบสั่งขาย <strong>{selectedOrder.orderNumber}</strong></span>
              <span>ใบเสนอราคา <strong>{naText(resolution.source?.quoteNumber || selectedOrder.quoteNumber)}</strong></span>
              <span>วันที่ <strong>{fmtDate(selectedOrder.orderDate)}</strong></span>
            </div>
            <div className={styles.summaryGrid}>
              <div><span className={styles.summaryLabel}>ยอด SO</span><div className="font-mono">{fmtMoney(selectedOrder.totalAmount)}</div></div>
              <div><span className={styles.summaryLabel}>รายการสรรพสามิต</span><div>{resolution.loading ? "กำลังตรวจ…" : `${resolution.lines.length} รายการ`}</div></div>
              <div><span className={styles.summaryLabel}>ค่าภาษี (ก่อน VAT)</span><div className="font-mono">{resolution.loading ? "…" : fmtMoney(resolution.totalTax)}</div></div>
              <div><span className={styles.summaryLabel}>ยอดที่ต้องเรียกเก็บ (รวม VAT 7%)</span><div className={`font-mono ${styles.summaryStrong}`}>{resolution.loading ? "…" : fmtMoney(resolution.amountToCollect)}</div></div>
            </div>

            {/* รายการที่จะยื่นจริง — เดิมโมดัลบอกแค่จำนวนรายการ ทั้งที่ API ส่ง lines
                มาครบ ⇒ คนกดสร้างใบภาษีโดยไม่เห็นว่ายื่นสินค้าอะไร จำนวนเท่าไร */}
            {!resolution.loading && resolution.lines.length > 0 && (
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
                  {resolution.lines.map((line) => (
                    <tr key={line.salesOrderLineId || line.productId}>
                      <td>
                        <span className={styles.lineCode}>{line.fgCode || "FG"}</span>
                        <div className={styles.lineName}>{naText(line.description)}</div>
                        {line.needsRegistration && (
                          <span className={styles.lineGap}>
                            {REGISTRATION_GAP[line.registrationState] || REGISTRATION_GAP.none}
                          </span>
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

        {resolution.error && <StatusNotice tone="error">{resolution.error}</StatusNotice>}
        {salesOrderId && !resolution.loading && !resolution.error && !resolution.eligible && (
          <StatusNotice tone="warning">ใบสั่งขายนี้ไม่มีรายการสินค้าสรรพสามิตที่พร้อมสร้างใบยื่น</StatusNotice>
        )}
        {resolution.eligible && resolution.warnings.length > 0 && (
          <StatusNotice tone="warning">
            มี {resolution.warnings.length} รายการที่ยังไม่มีทะเบียนสรรพสามิตอนุมัติ ระบบแจ้งเตือนแต่ไม่บล็อกการสร้างใบยื่น
          </StatusNotice>
        )}
      </div>

      <div className="form-action-bar">
        <button type="button" className="btn" onClick={onClose} disabled={busy}>ยกเลิก</button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={create}
          disabled={busy || resolution.loading || !resolution.eligible}
        >
          <FileCheck2 size={16} />
          {busy ? "กำลังสร้าง…" : "สร้างใบยื่นชำระ"}
        </button>
      </div>
    </Modal>
  );
}
