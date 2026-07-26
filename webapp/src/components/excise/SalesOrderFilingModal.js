"use client";

import { useEffect, useMemo, useState } from "react";
import { FileCheck2 } from "lucide-react";
import Modal from "@/components/Modal";
import Select from "@/components/ui/Select";
import StatusNotice from "@/components/ui/StatusNotice";
import { fmtDate, fmtMoney } from "@/lib/format";

const EMPTY_RESOLUTION = {
  loading: false,
  eligible: false,
  lines: [],
  warnings: [],
  totalTax: 0,
  amountToCollect: 0,
  error: "",
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
    fetch("/api/tax/orders/from-sales-order?available=1")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "โหลด Sale Order ไม่สำเร็จ");
        if (!active) return;
        setSalesOrders(data.salesOrders || []);
        setSchemaReady(data.schemaReady !== false);
      })
      .catch((reason) => {
        if (active) setError(reason.message || "โหลด Sale Order ไม่สำเร็จ");
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
    fetch(`/api/tax/orders/from-sales-order?salesOrderId=${encodeURIComponent(salesOrderId)}`, {
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

  const customers = useMemo(() => {
    const unique = new Map();
    salesOrders.forEach((order) => {
      if (order.customerId && !unique.has(order.customerId)) {
        unique.set(order.customerId, order.customerName || order.customerId);
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
    const res = await fetch("/api/tax/orders/from-sales-order", {
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
    <Modal open={open} onClose={busy ? () => {} : onClose} title="สร้างใบยื่นชำระจาก Sale Order" size="md">
      <div className="drawer-section" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {error && <StatusNotice tone="error">{error}</StatusNotice>}
        {!schemaReady && <StatusNotice tone="warning">ระบบเชื่อม Sale Order กับใบยื่นยังไม่พร้อมใช้งาน</StatusNotice>}

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
            {customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </Select>
        </label>

        <label className="form-group">
          <span>Sale Order ที่อนุมัติแล้วและยังไม่มีใบยื่น</span>
          <Select
            value={salesOrderId}
            disabled={!customerId || !customerOrders.length}
            onChange={(event) => setSalesOrderId(event.target.value)}
          >
            <option value="">{customerId && !customerOrders.length ? "ไม่มี Sale Order ที่รอยื่น" : "เลือก Sale Order"}</option>
            {customerOrders.map((order) => (
              <option key={order.id} value={order.id}>
                {order.orderNumber} · {fmtDate(order.orderDate)} · {fmtMoney(order.totalAmount)}
              </option>
            ))}
          </Select>
        </label>

        {selectedOrder && (
          <div className="glass-panel" style={{ padding: 14 }}>
            <div className="flex items-center gap-2" style={{ fontWeight: 700 }}>
              <FileCheck2 size={17} color="var(--accent)" />
              {selectedOrder.orderNumber}
            </div>
            <div className="grid grid-cols-2 gap-3" style={{ marginTop: 12, fontSize: 13 }}>
              <div><span style={{ color: "var(--text-3)" }}>ยอด SO</span><div className="font-mono">{fmtMoney(selectedOrder.totalAmount)}</div></div>
              <div><span style={{ color: "var(--text-3)" }}>รายการสรรพสามิต</span><div>{resolution.loading ? "กำลังตรวจ…" : `${resolution.lines.length} รายการ`}</div></div>
              <div><span style={{ color: "var(--text-3)" }}>ค่าภาษี (ก่อน VAT)</span><div className="font-mono">{resolution.loading ? "…" : fmtMoney(resolution.totalTax)}</div></div>
              <div><span style={{ color: "var(--text-3)" }}>ยอดที่ต้องเรียกเก็บ (รวม VAT 7%)</span><div className="font-mono" style={{ color: "var(--accent)", fontWeight: 700 }}>{resolution.loading ? "…" : fmtMoney(resolution.amountToCollect)}</div></div>
              <div><span style={{ color: "var(--text-3)" }}>ทะเบียนที่ควรตรวจ</span><div>{resolution.loading ? "…" : `${resolution.warnings.length} รายการ`}</div></div>
            </div>
          </div>
        )}

        {resolution.error && <StatusNotice tone="error">{resolution.error}</StatusNotice>}
        {salesOrderId && !resolution.loading && !resolution.error && !resolution.eligible && (
          <StatusNotice tone="warning">Sale Order นี้ไม่มีรายการสินค้าสรรพสามิตที่พร้อมสร้างใบยื่น</StatusNotice>
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
