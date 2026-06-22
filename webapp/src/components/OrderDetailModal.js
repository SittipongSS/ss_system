"use client";
import Modal from "@/components/Modal";
import { fmtMoney, fmtDate } from "@/lib/format";
import OrderStatusPill from "@/components/OrderStatusPill";
import AttachmentsPanel from "@/components/AttachmentsPanel";
import { useCan } from "@/lib/roleContext";

// Read-only detail of one PO (orders row) and its line items.
// `order` is expected to carry `items: [{ ..., product }]`.
export default function OrderDetailModal({ order, open, onClose }) {
  // Receipts/filing docs are managed by sales (filing) + legal (tax approval).
  const canEditOrderDocs = useCan("sales:act") || useCan("legal:approve");
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
            <div className="text-[var(--text-3)] text-xs">ลูกค้า</div>
            <div className="text-[var(--text)] font-medium">
              {order.customerName || order.items?.[0]?.registration?.customerName || "-"}
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
            <OrderStatusPill status={order.status} />
          </div>
          {order.receiptNumber && (
            <div>
              <div className="text-[var(--text-3)] text-xs">Receipt S&amp;S</div>
              <div className="font-mono text-[var(--text-2)]">{order.receiptNumber}</div>
            </div>
          )}
          {order.taxDueDate && (
            <div>
              <div className="text-[var(--text-3)] text-xs">กำหนดยื่นภาษี</div>
              <div className="text-[var(--text-2)]">{fmtDate(order.taxDueDate)}</div>
            </div>
          )}
        </div>

        {/* Rejection reason */}
        {order.status === "rejected" && order.rejectionReason && (
          <div className="text-xs bg-[var(--red-soft)] border border-[var(--border)] rounded-lg p-3">
            <div className="text-[var(--red)] font-semibold mb-1">เหตุผลที่ตีกลับ</div>
            <div className="text-[var(--text-2)]">{order.rejectionReason}</div>
          </div>
        )}

        {/* Excise filing record (shown once filed) */}
        {(order.exciseReceiptNumber || order.status === "complete") && (
          <div className="grid grid-cols-2 gap-3 text-sm bg-[var(--panel-2)] rounded-lg p-3">
            <div className="col-span-2 text-[var(--text-3)] text-xs font-semibold">บันทึกการยื่นชำระภาษี</div>
            {order.exciseReceiptNumber && (
              <div>
                <div className="text-[var(--text-3)] text-xs">เลขใบเสร็จสรรพสามิต</div>
                <div className="font-mono text-[var(--text-2)]">{order.exciseReceiptNumber}</div>
              </div>
            )}
            {order.exciseTaxPaidAmount != null && (
              <div>
                <div className="text-[var(--text-3)] text-xs">ยอดชำระจริง</div>
                <div className="font-mono text-[var(--text-2)]">{fmtMoney(order.exciseTaxPaidAmount)}</div>
              </div>
            )}
            {order.taxFormRef && (
              <div>
                <div className="text-[var(--text-3)] text-xs">แบบ ภส.</div>
                <div className="font-mono text-[var(--text-2)]">{order.taxFormRef}</div>
              </div>
            )}
            {order.filedByName && (
              <div>
                <div className="text-[var(--text-3)] text-xs">ผู้ยื่น</div>
                <div className="text-[var(--text-2)]">{order.filedByName} · {fmtDate(order.filedAt)}</div>
              </div>
            )}
          </div>
        )}

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

        {/* เอกสารการชำระสรรพสามิต (หลายไฟล์) — ใบเสร็จ / แบบ ภส. / อื่นๆ */}
        <AttachmentsPanel
          entityType="order"
          entityId={order.id}
          canEdit={canEditOrderDocs}
          title="เอกสารการชำระสรรพสามิต"
          note="ใบเสร็จชำระสรรพสามิต, แบบ ภส. และเอกสารยื่นที่เกี่ยวข้องกับออเดอร์นี้"
        />
      </div>
    </Modal>
  );
}
