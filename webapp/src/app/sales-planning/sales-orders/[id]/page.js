"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Building2, CalendarDays, CheckCircle2, ClipboardList, ExternalLink, RotateCcw, Save, Send, Trash2, Undo2, XCircle } from "lucide-react";
import Workspace from "@/components/ui/Workspace";
import { useCan, useRole } from "@/lib/roleContext";
import { fmtDate, fmtMoney } from "@/lib/format";

const STATUS = {
  draft: { label: "ฉบับร่าง", color: "var(--text-3)" },
  pending_approval: { label: "รอ AE Supervisor อนุมัติ", color: "var(--amber)" },
  approved: { label: "อนุมัติแล้ว", color: "var(--green)" },
  rejected: { label: "ตีกลับให้แก้ไข", color: "var(--red)" },
  cancelled: { label: "ยกเลิก", color: "var(--red)" },
};

export default function SalesOrderDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const canEdit = useCan("salesplan:edit");
  const role = useRole();
  const reviewer = ["admin", "ae_supervisor"].includes(role);
  const [order, setOrder] = useState(null);
  const [form, setForm] = useState({ orderDate: "", paymentDueDate: "", notes: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setError("");
    const res = await fetch(`/api/sales-planning/sales-orders/${id}`);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setError(data.error || "โหลด Sale Order ไม่สำเร็จ");
    setOrder(data);
    setForm({ orderDate: data.orderDate || "", paymentDueDate: data.paymentDueDate || "", notes: data.notes || "" });
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function requestAction(action, payload = {}) {
    setBusy(action); setError("");
    const res = await fetch(`/api/sales-planning/sales-orders/${id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(""); setError(data.error || "อัปเดต Sale Order ไม่สำเร็จ"); return false; }
    await load();
    setBusy("");
    return true;
  }

  async function save(submitAfter = false) {
    const saved = await requestAction("save", form);
    if (saved && submitAfter && window.confirm("ยืนยันยื่น SO ให้ AE Supervisor ตรวจอนุมัติ? หลังยื่นแล้วผู้จัดทำจะแก้ไขไม่ได้จนกว่าจะถูกตีกลับ")) {
      await requestAction("submit");
    }
  }

  async function review(action) {
    if (action === "approve") {
      if (!window.confirm("อนุมัติ SO ใบนี้? ยอด Actual จะถูกนับเข้าระบบทันที")) return;
      const note = window.prompt("หมายเหตุการอนุมัติ (ไม่บังคับ)") || "";
      await requestAction("approve", { note });
      return;
    }
    const reason = window.prompt("เหตุผลที่ตีกลับให้ผู้จัดทำแก้ไข")?.trim() || "";
    if (reason) await requestAction("reject", { reason });
  }

  async function cancel() {
    const reason = window.prompt("เหตุผลที่ยกเลิก Sale Order")?.trim() || "";
    if (!reason || !window.confirm("ยืนยันยกเลิก SO? หากอนุมัติแล้ว ยอด Actual จะถูกนำออกทันที")) return;
    await requestAction("cancel", { reason });
  }

  async function remove() {
    if (!window.confirm("ลบ SO ถาวร? ยอด Actual จะถูกคำนวณใหม่และไม่สามารถย้อนกลับได้")) return;
    setBusy("delete"); setError("");
    const res = await fetch(`/api/sales-planning/sales-orders/${id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(""); return setError(data.error || "ลบ Sale Order ไม่สำเร็จ"); }
    router.push("/sa/sales-orders");
  }

  if (!order) return <Workspace icon={<ClipboardList size={22} />} title="Sale Order" back={{ href: "/sa/sales-orders", label: "กลับหน้ารายการ SO" }} loading={!error}>{error && <div className="glass-panel" style={{ padding: 14, color: "var(--red)" }}>{error}</div>}</Workspace>;
  const approved = order.status === "approved";
  const editable = canEdit && ["draft", "rejected"].includes(order.status);
  const status = STATUS[order.status] || { label: order.status, color: "var(--text-3)" };

  return (
    <Workspace
      icon={<ClipboardList size={22} />} title={order.orderNumber}
      subtitle={`${order.customerName || "-"} · ${order.deal?.title || "-"}`}
      back={{ href: "/sa/sales-orders", label: "กลับหน้ารายการ SO" }}
      headerRight={<span className="ui-badge" style={{ color: status.color }}>{status.label}</span>}
    >
      <div className="flex flex-col gap-5">
        {error && <div className="glass-panel" role="alert" style={{ padding: 14, color: "var(--red)", borderColor: "var(--red)" }}>{error}</div>}
        {order.rejectionReason && <div className="glass-panel" style={{ padding: 14, borderColor: "var(--red)" }}><strong style={{ color: "var(--red)" }}>ตีกลับโดย {order.rejectedByName || "AE Supervisor"}</strong><div style={{ marginTop: 5 }}>{order.rejectionReason}</div></div>}
        <div className="detail-kpi-grid">
          <section className="glass-panel" style={{ padding: 16 }}><div style={{ color: "var(--text-3)", fontSize: 12 }}>Actual ที่นับในระบบ</div><strong className="mono" style={{ fontSize: 24, color: approved ? "var(--green)" : "var(--text-3)" }}>{fmtMoney(approved ? order.actualAmount : 0)}</strong><div style={{ color: "var(--text-3)", fontSize: 11, marginTop: 3 }}>{approved ? "อนุมัติแล้ว" : "ยังไม่นับจนกว่าจะอนุมัติ"}</div></section>
          <section className="glass-panel" style={{ padding: 16 }}><div style={{ color: "var(--text-3)", fontSize: 12 }}>ยอดรวม VAT</div><strong className="mono" style={{ fontSize: 24 }}>{fmtMoney(order.totalAmount)}</strong></section>
          <section className="glass-panel" style={{ padding: 16 }}><div style={{ color: "var(--text-3)", fontSize: 12 }}>วันที่ SO</div><strong style={{ fontSize: 18 }}>{fmtDate(order.orderDate)}</strong></section>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
          <section className="glass-panel" style={{ padding: 18 }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 16 }}>ตรวจสอบรายการสินค้า</h2>
            <div className="premium-glass-table table-responsive"><table className="w-full text-sm"><thead><tr><th>#</th><th>รหัส / รายละเอียด</th><th className="num">จำนวน</th><th className="num">ราคาต่อหน่วย</th><th className="num">ส่วนลด</th><th className="num">รวม</th></tr></thead><tbody>
              {(order.lines || []).slice().sort((a, b) => a.sortOrder - b.sortOrder).map((line, index) => <tr key={line.id}><td>{index + 1}</td><td>{line.fgCode && <strong className="mono">{line.fgCode} · </strong>}{line.description || "-"}</td><td className="num mono">{line.qty}</td><td className="num mono">{fmtMoney(line.unitPrice)}</td><td className="num mono">{fmtMoney(line.discountAmount)}</td><td className="num mono">{fmtMoney(line.lineTotal)}</td></tr>)}
            </tbody></table></div>
            <div style={{ marginTop: 16, marginLeft: "auto", width: "min(100%, 360px)", display: "grid", gridTemplateColumns: "1fr auto", gap: "7px 18px", fontSize: 13 }}>
              <span>ยอดก่อนส่วนลด</span><strong className="mono">{fmtMoney(order.subtotal)}</strong><span>ส่วนลดท้ายใบ</span><strong className="mono">{fmtMoney(order.discountAmount)}</strong><span>VAT</span><strong className="mono">{fmtMoney(order.vatAmount)}</strong><span>ยอดรวม</span><strong className="mono">{fmtMoney(order.totalAmount)}</strong><span style={{ color: "var(--green)" }}>Actual ก่อน VAT</span><strong className="mono" style={{ color: "var(--green)" }}>{fmtMoney(order.actualAmount)}</strong>
            </div>
          </section>

          <aside className="flex flex-col gap-4">
            <section className="glass-panel" style={{ padding: 16 }}><h2 style={{ margin: "0 0 12px", fontSize: 15 }}>ตรวจสอบข้อมูลเอกสาร</h2><div className="flex flex-col gap-3">
              <label><span style={{ display: "block", color: "var(--text-3)", fontSize: 12, marginBottom: 4 }}>วันที่ SO</span><input className="premium-input" type="date" value={form.orderDate} disabled={!editable} onChange={(e) => setForm((current) => ({ ...current, orderDate: e.target.value }))} /></label>
              <label><span style={{ display: "block", color: "var(--text-3)", fontSize: 12, marginBottom: 4 }}>กำหนดชำระ</span><input className="premium-input" type="date" value={form.paymentDueDate} disabled={!editable} onChange={(e) => setForm((current) => ({ ...current, paymentDueDate: e.target.value }))} /></label>
              <label><span style={{ display: "block", color: "var(--text-3)", fontSize: 12, marginBottom: 4 }}>หมายเหตุ</span><textarea className="premium-input" rows={3} value={form.notes} disabled={!editable} onChange={(e) => setForm((current) => ({ ...current, notes: e.target.value }))} /></label>
            </div></section>

            <section className="glass-panel" style={{ padding: 16 }}><h2 style={{ margin: "0 0 12px", fontSize: 15 }}>เอกสารอ้างอิง</h2><div className="flex flex-col gap-3">
              <Link href={`/sa/quotations/${order.quotationId}`} className="linklike"><ExternalLink size={14} /> {order.quotation?.quoteNumber || "ใบเสนอราคา"}</Link>
              <Link href={`/sa/deals/${order.dealId}`} className="linklike"><Building2 size={14} /> {order.deal?.title || "ดีล"}</Link>
              {order.projectId && <Link href={`/sa/projects/${order.projectId}`} className="linklike"><ExternalLink size={14} /> {order.project?.name || order.project?.code || "โครงการ"}</Link>}
              <span style={{ color: "var(--text-2)", fontSize: 13 }}><CalendarDays size={14} style={{ display: "inline", marginRight: 6 }} />QT Won วันที่ {fmtDate(order.quotation?.wonDocDate)}</span>
            </div></section>

            {order.cancelReason && <section className="glass-panel" style={{ padding: 16, borderColor: "var(--red)" }}><strong style={{ color: "var(--red)" }}>เหตุผลที่ยกเลิก</strong><p style={{ marginBottom: 0 }}>{order.cancelReason}</p></section>}

            {(canEdit || reviewer) && <section className="glass-panel" style={{ padding: 16 }}><div className="flex flex-col gap-2">
              {editable && <><button className="btn" disabled={!!busy} onClick={() => save(false)}><Save size={15} /> บันทึกร่าง</button><button className="btn btn-primary" disabled={!!busy} onClick={() => save(true)}><Send size={15} /> ยื่นอนุมัติ</button></>}
              {reviewer && order.status === "pending_approval" && <><button className="btn btn-success" disabled={!!busy} onClick={() => review("approve")}><CheckCircle2 size={15} /> อนุมัติและนับ Actual</button><button className="btn danger" disabled={!!busy} onClick={() => review("reject")}><Undo2 size={15} /> ตีกลับให้แก้ไข</button></>}
              {approved && canEdit && <button className="btn danger" disabled={!!busy} onClick={cancel}><XCircle size={15} /> ยกเลิก SO</button>}
              {order.status === "cancelled" && role === "admin" && <button className="btn" disabled={!!busy} onClick={() => requestAction("restore")}><RotateCcw size={15} /> คืนเป็นฉบับร่าง</button>}
              {role === "admin" && <button className="btn danger" disabled={!!busy} onClick={remove}><Trash2 size={15} /> ลบถาวร</button>}
            </div></section>}
          </aside>
        </div>
      </div>
    </Workspace>
  );
}
