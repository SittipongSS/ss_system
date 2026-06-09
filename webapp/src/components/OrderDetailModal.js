"use client";
import Modal from "@/components/Modal";

const fmtMoney = (amount) =>
  (amount || 0).toLocaleString("th-TH", {
    style: "currency",
    currency: "THB",
    minimumFractionDigits: 2,
  });

function StatusPill({ status }) {
  if (status === "complete")
    return <span className="status-pill success">ชำระแล้ว</span>;
  if (status === "received")
    return <span className="status-pill warn">รอชำระภาษี</span>;
  return <span className="status-pill danger">รอรับเงิน</span>;
}

// Read-only detail of one PO (orders row) and its line items.
// `order` is expected to carry `items: [{ ..., product }]`.
export default function OrderDetailModal({ order, open, onClose }) {
  if (!order) return null;
  const items = order.items || [];

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={`รายละเอียดใบสั่งซื้อ — ${order.quotationRef || order.id}`}
    >
      <div className="p-4 space-y-4">
        {/* PO header */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-[var(--text-3)] text-xs">เลขที่ใบเสนอราคา</div>
            <div className="font-mono font-semibold text-[var(--text)]">
              {order.quotationRef || "-"}
            </div>
          </div>
          <div>
            <div className="text-[var(--text-3)] text-xs">PO Reference</div>
            <div className="font-mono text-[var(--text-2)]">
              {order.poReference || "-"}
            </div>
          </div>
          <div>
            <div className="text-[var(--text-3)] text-xs">กำหนดส่ง</div>
            <div className="text-[var(--text-2)]">{order.deliveryDate || "-"}</div>
          </div>
          <div>
            <div className="text-[var(--text-3)] text-xs">ผู้รับผิดชอบ</div>
            <div className="text-[var(--text-2)]">{order.assignee || "-"}</div>
          </div>
          <div>
            <div className="text-[var(--text-3)] text-xs">สถานะ</div>
            <StatusPill status={order.status} />
          </div>
          {order.receiptNumber && (
            <div>
              <div className="text-[var(--text-3)] text-xs">Receipt S&amp;S</div>
              <div className="font-mono text-[var(--text-2)]">{order.receiptNumber}</div>
            </div>
          )}
        </div>

        {/* Items */}
        <div className="premium-table-wrapper">
          <table className="premium-table">
            <thead>
              <tr>
                <th>สินค้า (FG Code)</th>
                <th>รายละเอียด</th>
                <th className="text-center">จำนวน</th>
                <th className="num">ยอดภาษี</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan="4" className="text-center py-6 text-[var(--text-3)]">
                    ไม่มีรายการสินค้า
                  </td>
                </tr>
              ) : (
                items.map((it) => (
                  <tr key={it.id}>
                    <td className="font-mono font-semibold text-[var(--text)]">
                      {it.product?.fgCode || "-"}
                    </td>
                    <td className="text-xs text-[var(--text-2)]">
                      {it.product?.productDescription || "-"}
                    </td>
                    <td className="text-center font-mono font-semibold">{it.quantity}</td>
                    <td className="num font-mono font-bold text-[var(--text)]">
                      {it.totalTax > 0 ? (
                        fmtMoney(it.totalTax)
                      ) : (
                        <span className="status-pill success text-[10px]">ไม่ต้องเสียภาษี</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer total */}
        <div className="flex justify-end items-center gap-3 pt-1">
          <span className="text-sm text-[var(--text-3)]">ยอดภาษีรวม</span>
          <span className="text-lg font-mono font-bold text-[var(--red)]">
            {fmtMoney(order.totalTax)}
          </span>
        </div>
      </div>
    </Modal>
  );
}
